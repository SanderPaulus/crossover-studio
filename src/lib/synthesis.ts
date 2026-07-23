import type { Complex } from './complex.ts';
import { abs, arg } from './complex.ts';
import type { DriverFilterSpec } from './filters.ts';
import { evalDriverFilter } from './filters.ts';
import type { Netlist, NetElement, PassiveElement } from './network.ts';
import { solveNetwork } from './network.ts';
import { nelderMead } from './optimize.ts';
import { coilDcr, hasImportedCatalog, pickCandidates, type CatalogPick, type SnapPrefs } from './catalog.ts';
import { wrapDeg } from './dsp.ts';

/**
 * Passive-filter synthesis: turn a virtual (target) filter chain into real
 * component values on the MEASURED driver impedance.
 *
 * Approach: derive a ladder topology from the target spec (HP order → series-C
 * / shunt-L sections, LP order → series-L / shunt-C sections, negative gain →
 * L-pad, cutting EQ band → series-RLC notch across the driver), seed it with
 * textbook values computed against |Z(fc)|, then let Nelder-Mead refine the
 * values (in log-space, so they stay positive) until the MNA-solved transfer
 * matches the target in magnitude AND phase. The load is always the measured
 * complex impedance — the whole reason naive textbook values miss.
 *
 * Branches are synthesised independently: with the generator's ~0 Ω source
 * impedance the branches cannot interact, so per-branch fitting is exact.
 */

export interface SynthesizedComponent {
  id: string;
  kind: 'C' | 'L' | 'R';
  /** Farad / Henry / Ohm. */
  value: number;
  role: string; // e.g. "HP section 1 series C", "notch L"
  /** Catalog DCR/ESR that was simulated along (catalog-snap mode), Ω. */
  seriesR?: number;
  /** Which purchasable part this is (catalog-snap mode), e.g. "Jantzen Air Core 1.4 mm". */
  catalogLabel?: string;
  /** EUR price of the chosen part(s), when the catalog carries prices. */
  priceEur?: number;
}

export interface SynthesisResult {
  components: SynthesizedComponent[];
  /** MNA transfer of the synthesised branch on the full grid. */
  achieved: Complex[];
  /** Target transfer on the full grid. */
  target: Complex[];
  /** Weighted RMS magnitude error, dB. */
  rmsDb: number;
  /** Weighted RMS phase error, degrees. */
  rmsDeg: number;
  converged: boolean;
  /** Acoustic mode only: resulting driver SPL (FRD + filter), dB. */
  acousticAchievedDb?: number[];
  /** Acoustic mode only: the ideal acoustic target it was fitted to, dB. */
  acousticTargetDb?: number[];
}

export class SynthesisError extends Error {}

const EG = 2.83;
const RG = 1e-3;

interface Slot {
  kind: 'C' | 'L' | 'R';
  role: string;
  initial: number; // F / H / Ω
}

interface Topology {
  slots: Slot[];
  /** Build the branch netlist from slot values (same order as slots);
   *  optional per-slot series resistance (catalog DCR/ESR) rides along. */
  build: (values: readonly number[], seriesRs?: readonly (number | undefined)[]) => Netlist;
  /** Slot indices in ELECTRICAL (rung) order. The schematic builder walks
   *  components sequentially — emit them in this order or a mid-ladder part
   *  gets silently re-drawn at the driver node (learned the hard way: 10 dB
   *  peak from a trap that was fitted mid-ladder but built across the driver). */
  order: number[];
}

/** Measured-driver facts that gate the correction networks. */
interface ZInfo {
  /** Impedance peak below the HP corner (driver resonance), if pronounced. */
  fsPeak: { f: number; ratio: number } | null;
  /** Driver SPL droop of the top octave vs the passband (acoustic mode):
   *  passives cannot boost the top back, so holding it flat means padding
   *  everything below — the low-shelf pad+bypass this slot provides. */
  topHold?: { droopDb: number; kneeHz: number } | null;
  /** False suppresses the Zobel candidate (lean first pass). Default true. */
  zobelOk?: boolean;
}

/**
 * Derive topology + textbook initial values from the target spec.
 * `zAt` returns |Z| of the measured driver at a frequency.
 */
function deriveTopology(
  spec: DriverFilterSpec,
  zAt: (f: number) => number,
  inverted: boolean,
  zInfo: ZInfo = { fsPeak: null },
): Topology {
  const slots: Slot[] = [];

  // Ladder plan: alternating series/shunt elements source→driver.
  type Rung =
    | { type: 'series'; slot: number }
    | { type: 'shunt'; slot: number }
    | { type: 'pad'; seriesSlot: number; shuntSlot: number }
    | { type: 'notch'; lSlot: number; cSlot: number; rSlot: number }
    /** Series R bypassed by C (low-shelf cut) or L (high-shelf cut). */
    | { type: 'bypass'; rSlot: number; xSlot: number }
    /** R+C to ground across the driver (voice-coil rise compensation). */
    | { type: 'zobel'; rSlot: number; cSlot: number };
  const rungs: Rung[] = [];

  if (spec.hp.enabled) {
    const fc = spec.hp.freq;
    const R = zAt(fc);
    const w0 = 2 * Math.PI * fc;
    // Exactly `order` reactive elements, alternating series C / shunt L — an
    // odd order gets its honest 3-element ladder, not a detuned 4th.
    for (let i = 0; i < spec.hp.order; i++) {
      const sec = Math.floor(i / 2) + 1;
      if (i % 2 === 0) {
        slots.push({ kind: 'C', role: `HP section ${sec} series C`, initial: 1 / (w0 * R) });
        rungs.push({ type: 'series', slot: slots.length - 1 });
      } else {
        slots.push({ kind: 'L', role: `HP section ${sec} shunt L`, initial: R / w0 });
        rungs.push({ type: 'shunt', slot: slots.length - 1 });
      }
    }
  }

  // Insertion point for mid-ladder traps: between LP section 1 and 2 an LC
  // trap adds elliptic-style steepness right where breakup lives.
  let lpMidInsert: number | null = null;
  if (spec.lp.enabled) {
    const fc = spec.lp.freq;
    const R = zAt(fc);
    const w0 = 2 * Math.PI * fc;
    for (let i = 0; i < spec.lp.order; i++) {
      const sec = Math.floor(i / 2) + 1;
      if (i % 2 === 0) {
        slots.push({ kind: 'L', role: `LP section ${sec} series L`, initial: R / w0 });
        rungs.push({ type: 'series', slot: slots.length - 1 });
      } else {
        slots.push({ kind: 'C', role: `LP section ${sec} shunt C`, initial: 1 / (w0 * R) });
        rungs.push({ type: 'shunt', slot: slots.length - 1 });
      }
      // Mid-ladder trap insertion point: between the first full section and
      // the rest (orders ≥ 3).
      if (i === 1 && spec.lp.order >= 3) lpMidInsert = rungs.length;
    }
  }

  if (spec.gainDb < -0.5) {
    // L-pad sized for the requested attenuation into R_nom.
    const R = zAt(spec.hp.enabled ? spec.hp.freq * 2 : 1000);
    const a = 10 ** (spec.gainDb / 20);
    const rSeries = R * (1 - a);
    const rShunt = (R * a) / (1 - a);
    slots.push({ kind: 'R', role: 'L-pad series R', initial: Math.max(rSeries, 0.1) });
    const si = slots.length - 1;
    slots.push({ kind: 'R', role: 'L-pad shunt R', initial: Math.min(Math.max(rShunt, 0.5), 100) });
    rungs.push({ type: 'pad', seriesSlot: si, shuntSlot: si + 1 });
  }

  // Top-octave hold: series R bypassed by C — pulls everything BELOW the
  // knee down to the level the driver can still deliver up top. This is the
  // deliberate "lower the ceiling" move; without it the level-free fit just
  // spreads the unreachable top as error across the band.
  if (zInfo.topHold) {
    const f0 = zInfo.topHold.kneeHz;
    const a = 10 ** (-zInfo.topHold.droopDb / 20);
    const Zd = zAt(f0);
    const rs = Math.max(Zd * (1 / a - 1), 0.2);
    slots.push({ kind: 'R', role: `top-octave hold @${Math.round(f0)} Hz pad R`, initial: rs });
    const ri = slots.length - 1;
    slots.push({
      kind: 'C',
      role: `top-octave hold @${Math.round(f0)} Hz bypass C`,
      initial: 1 / (2 * Math.PI * f0 * rs),
    });
    rungs.push({ type: 'bypass', rSlot: ri, xSlot: ri + 1 });
  }

  for (const band of spec.eq) {
    if (!band.enabled || band.gainDb >= 0) continue;

    const type = band.type ?? 'peak';
    if (type !== 'peak') {
      // Shelf cut → series R with a frequency-dependent bypass: a capacitor
      // lets the highs around the pad (lowShelf cut), an inductor lets the
      // lows around it (highShelf cut). THE passive way to "pull everything
      // down except…" — attenuation instead of the boost passives cannot do.
      const f0 = band.freq;
      const a = 10 ** (band.gainDb / 20);
      const Zd = zAt(f0);
      const rs = Math.max(Zd * (1 / a - 1), 0.2);
      const label = type === 'lowShelf' ? 'low-shelf' : 'high-shelf';
      slots.push({ kind: 'R', role: `${label} @${Math.round(f0)} Hz pad R`, initial: rs });
      const ri = slots.length - 1;
      if (type === 'lowShelf') {
        slots.push({
          kind: 'C',
          role: `${label} @${Math.round(f0)} Hz bypass C`,
          initial: 1 / (2 * Math.PI * f0 * rs),
        });
      } else {
        slots.push({
          kind: 'L',
          role: `${label} @${Math.round(f0)} Hz bypass L`,
          initial: rs / (2 * Math.PI * f0),
        });
      }
      rungs.push({ type: 'bypass', rSlot: ri, xSlot: ri + 1 });
      continue;
    }

    const f0 = band.freq;
    const w0 = 2 * Math.PI * f0;
    const Zd = zAt(f0);
    const a = 10 ** (band.gainDb / 20);
    const Rn = Math.max((a / (1 - a)) * Zd, 0.2);
    const X = Rn * Math.max(band.q, 0.2); // characteristic impedance √(L/C)

    // STOPBAND cut on an LP4 branch (breakup territory): a shunt LC(R) trap
    // BETWEEN the ladder sections — elliptic-style steepness, far more
    // effective there than a notch across the driver.
    if (lpMidInsert !== null && f0 > spec.lp.freq * 1.2) {
      slots.push({ kind: 'L', role: `notch (shunt trap) @${Math.round(f0)} Hz L`, initial: X / w0 });
      const li = slots.length - 1;
      slots.push({ kind: 'C', role: `notch (shunt trap) @${Math.round(f0)} Hz C`, initial: 1 / (X * w0) });
      slots.push({ kind: 'R', role: `notch (shunt trap) @${Math.round(f0)} Hz R`, initial: Rn });
      rungs.splice(lpMidInsert, 0, { type: 'notch', lSlot: li, cSlot: li + 1, rSlot: li + 2 });
      lpMidInsert++;
      continue;
    }

    // Series-RLC across the driver. Depth → R, Q → L/C ratio.
    slots.push({ kind: 'L', role: `notch @${Math.round(f0)} Hz L`, initial: X / w0 });
    const li = slots.length - 1;
    slots.push({ kind: 'C', role: `notch @${Math.round(f0)} Hz C`, initial: 1 / (X * w0) });
    slots.push({ kind: 'R', role: `notch @${Math.round(f0)} Hz R`, initial: Rn });
    rungs.push({ type: 'notch', lSlot: li, cSlot: li + 1, rSlot: li + 2 });
  }

  /* Impedance-correction networks — across the driver, AFTER every series
   * element, so they correct the load the ladder actually sees. They are the
   * "make the driver behave like a resistor" tools that let textbook sections
   * (and the optimiser) converge instead of fighting the impedance curve. */

  // Zobel: an LP section into a rising voice-coil impedance droops early and
  // resists fitting; R+C across the driver flattens |Z| above the corner.
  if (spec.lp.enabled && (zInfo.zobelOk ?? true)) {
    const fc = spec.lp.freq;
    if (zAt(4 * fc) > 1.3 * zAt(fc)) {
      const R = zAt(fc);
      slots.push({ kind: 'R', role: 'Zobel R', initial: R });
      const ri = slots.length - 1;
      slots.push({ kind: 'C', role: 'Zobel C', initial: 1 / (2 * Math.PI * 2 * fc * R) });
      rungs.push({ type: 'zobel', rSlot: ri, cSlot: ri + 1 });
    }
  }

  // Fs trap: a pronounced impedance peak at the driver resonance below the
  // HP corner detunes the HP; a series L-C-R across the driver flattens it.
  if (spec.hp.enabled && zInfo.fsPeak && zInfo.fsPeak.ratio > 1.6 && zInfo.fsPeak.f < spec.hp.freq * 0.8) {
    const f0 = zInfo.fsPeak.f;
    const w0 = 2 * Math.PI * f0;
    const R = zAt(f0 * 3); // ≈ the flat |Z| the trap should restore
    const X = R; // moderate trap Q; the optimiser retunes
    slots.push({ kind: 'L', role: `notch (Fs trap) @${Math.round(f0)} Hz L`, initial: X / w0 });
    const li = slots.length - 1;
    slots.push({ kind: 'C', role: `notch (Fs trap) @${Math.round(f0)} Hz C`, initial: 1 / (X * w0) });
    slots.push({ kind: 'R', role: `notch (Fs trap) @${Math.round(f0)} Hz R`, initial: R });
    rungs.push({ type: 'notch', lSlot: li, cSlot: li + 1, rSlot: li + 2 });
  }

  if (slots.length === 0) {
    throw new SynthesisError('Target spec has no active blocks to synthesise.');
  }

  const build = (
    values: readonly number[],
    seriesRs?: readonly (number | undefined)[],
  ): Netlist => {
    const elements: NetElement[] = [];
    let nodeCount = 2; // 0 = gnd, 1 = source hot
    let hot = 1;
    elements.push({ kind: 'source', id: 'G', nodes: [1, 0], volts: EG, seriesR: RG });

    const passive = (kind: 'C' | 'L' | 'R', id: string, nodes: [number, number], value: number) => {
      const slot = Number(id.slice(1));
      const sr = seriesRs?.[slot];
      elements.push({
        kind,
        id,
        nodes,
        value,
        ...(sr !== undefined && sr > 0 && kind !== 'R' ? { seriesR: sr } : {}),
      } as PassiveElement);
    };

    for (const rung of rungs) {
      if (rung.type === 'series') {
        const next = nodeCount++;
        const s = slots[rung.slot];
        passive(s.kind, `S${rung.slot}`, [hot, next], values[rung.slot]);
        hot = next;
      } else if (rung.type === 'shunt') {
        const s = slots[rung.slot];
        passive(s.kind, `S${rung.slot}`, [hot, 0], values[rung.slot]);
      } else if (rung.type === 'pad') {
        const next = nodeCount++;
        passive('R', `S${rung.seriesSlot}`, [hot, next], values[rung.seriesSlot]);
        passive('R', `S${rung.shuntSlot}`, [next, 0], values[rung.shuntSlot]);
        hot = next;
      } else if (rung.type === 'bypass') {
        // R and its bypass element in PARALLEL in the series path.
        const next = nodeCount++;
        passive('R', `S${rung.rSlot}`, [hot, next], values[rung.rSlot]);
        passive(slots[rung.xSlot].kind, `S${rung.xSlot}`, [hot, next], values[rung.xSlot]);
        hot = next;
      } else if (rung.type === 'zobel') {
        // R—C from the driver node to ground.
        const n1 = nodeCount++;
        passive('R', `S${rung.rSlot}`, [hot, n1], values[rung.rSlot]);
        passive('C', `S${rung.cSlot}`, [n1, 0], values[rung.cSlot]);
      } else {
        // notch: L—C—R in series from the driver node to ground.
        const n1 = nodeCount++;
        const n2 = nodeCount++;
        passive('L', `S${rung.lSlot}`, [hot, n1], values[rung.lSlot]);
        passive('C', `S${rung.cSlot}`, [n1, n2], values[rung.cSlot]);
        passive('R', `S${rung.rSlot}`, [n2, 0], values[rung.rSlot]);
      }
    }

    elements.push({ kind: 'driver', id: 'D', model: 'drv', nodes: [hot, 0], inverted });
    return { nodeCount, elements };
  };

  const order: number[] = [];
  for (const rung of rungs) {
    if (rung.type === 'series' || rung.type === 'shunt') order.push(rung.slot);
    else if (rung.type === 'pad') order.push(rung.seriesSlot, rung.shuntSlot);
    else if (rung.type === 'bypass') order.push(rung.rSlot, rung.xSlot);
    else if (rung.type === 'zobel') order.push(rung.rSlot, rung.cSlot);
    else order.push(rung.lSlot, rung.cSlot, rung.rSlot);
  }

  return { slots, build, order };
}

export interface SynthesizeOptions {
  /** Decimate the grid by this factor during optimisation. Default 5. */
  decimate?: number;
  maxIterations?: number;
  /** Wire the driver inverted (e.g. LR2 partner). Default false. */
  inverted?: boolean;
  /**
   * Priority between frequency response and phase, 0..1. 0 = magnitude only,
   * 1 = phase only, 0.5 = balanced (the previous fixed behaviour).
   */
  phasePriority?: number;
  /**
   * 'filter'   — fit the ELECTRICAL transfer to the target filter curve.
   * 'acoustic' — fit the resulting ACOUSTIC response (measured FRD × filter)
   *              to the ideal target shape. This is the mode that "thinks
   *              along": a bump in the driver deviates from the target, so the
   *              optimiser bends the filter (moves a notch, shifts a knee) to
   *              pull it flat. Requires `driverSplDb`.
   */
  mode?: 'filter' | 'acoustic';
  /** Measured driver SPL on the same grid (dB). Required for acoustic mode. */
  driverSplDb?: readonly number[];
  /**
   * Correction-network policy (Zobel, Fs trap, top-octave hold):
   *  - 'auto' (default): add whenever the measured driver facts warrant them
   *    — the classic behaviour.
   *  - 'lean' (staged design): fit the bare HP/LP ladder FIRST; corrections
   *    are only added when that fit misses `leanTargetDb` AND they improve
   *    the fit by ≥10%. The driver must prove it does not behave resistively
   *    before components are spent on making it.
   *  - 'off': never add corrections (the lean first pass uses this).
   */
  corrections?: 'auto' | 'lean' | 'off';
  /** Lean mode: weighted-RMS fit error (dB) below which the bare ladder is
   *  declared sufficient. Default 0.5. */
  leanTargetDb?: number;
  /** Component-wizard preferences for the snap: binding series per kind,
   *  tier profile per position (series-path vs shunt — derived from the
   *  slot ROLES the topology already carries). */
  snapPrefs?: SnapPrefs;
  /**
   * Budget pressure in the discrete snap: the candidate score is multiplied
   * by (1 + costWeight·ΣEUR), so among near-equivalent realizations the
   * CHEAPER one wins — lower values follow automatically where the price
   * model says so (price = base + factor·value). Only bites when the
   * imported catalog carries prices; 0 disables. Default 0.0015 (a €20
   * saving may cost ~3% fit — tie-breaker, not a quality trade).
   */
  costWeight?: number;
  /**
   * Snap to purchasable parts: after the continuous fit, a discrete pass
   * picks per slot the best value that actually EXISTS in the component
   * catalog — evaluated with that part's real DCR/ESR in the network — and
   * re-balances the other slots around it. The answer to "the optimizer
   * wants 2.3 mH but the catalog stops at 8.2": the fit error against real
   * parts becomes visible instead of silently assumed away. Default false.
   */
  catalogSnap?: boolean;
}

export function synthesize(
  spec: DriverFilterSpec,
  freq: readonly number[],
  driverZ: readonly Complex[],
  opts: SynthesizeOptions = {},
): SynthesisResult {
  const {
    decimate = 5,
    inverted = false,
    phasePriority = 0.5,
    mode = 'filter',
    driverSplDb,
    catalogSnap = false,
    corrections = 'auto',
    leanTargetDb = 0.5,
    costWeight = 0.0015,
    snapPrefs = undefined,
  } = opts;
  if (mode === 'acoustic' && !driverSplDb) {
    throw new SynthesisError('Acoustic mode needs the measured driver SPL on the grid.');
  }

  // Lean (staged) mode: two passes. The bare ladder first — good enough is
  // DONE (fewest components). Only a demonstrably insufficient bare fit may
  // buy corrections, and they must pay ≥10% fit improvement to stay.
  if (corrections === 'lean') {
    const bare = synthesize(spec, freq, driverZ, { ...opts, corrections: 'off' });
    if (bare.rmsDb <= leanTargetDb) return bare;
    const full = synthesize(spec, freq, driverZ, { ...opts, corrections: 'auto' });
    return full.rmsDb < bare.rmsDb * 0.9 ? full : bare;
  }
  const allowCorr = corrections !== 'off';
  // Anchored envelope (see vfOptimizer): a magnitude weight of exactly 0
  // lets the shape fit produce garbage branches — at "100% phase" the
  // magnitude keeps a 10% anchor.
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const magW = 2 * (1 - p);
  const phW = 2 * p;

  const zAt = (f: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < freq.length; i++) {
      const d = Math.abs(Math.log(freq[i] / f));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return abs(driverZ[best]);
  };

  // Resonance peak below the HP corner (gates the Fs trap): the |Z| maximum
  // under the corner versus the flat |Z| well above it.
  let fsPeak: ZInfo['fsPeak'] = null;
  if (spec.hp.enabled && allowCorr) {
    let iMax = -1;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] >= spec.hp.freq) break;
      if (iMax < 0 || abs(driverZ[i]) > abs(driverZ[iMax])) iMax = i;
    }
    if (iMax > 0) {
      const ref = zAt(Math.min(freq[iMax] * 3, freq[freq.length - 1]));
      fsPeak = { f: freq[iMax], ratio: abs(driverZ[iMax]) / ref };
    }
  }

  // Top-octave droop of the DRIVER itself (acoustic mode): mean SPL of the
  // last half octave vs the passband above the corner. Unreachable by any
  // boost — gates the top-octave-hold pad that lowers the rest instead.
  let topHold: ZInfo['topHold'] = null;
  if (mode === 'acoustic' && driverSplDb && spec.hp.enabled && allowCorr) {
    const fTop = freq[freq.length - 1];
    const passLo = Math.max(spec.hp.freq * 1.5, 3000);
    const meanSpl = (lo: number, hi: number): number => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < freq.length; i++) {
        if (freq[i] >= lo && freq[i] <= hi) {
          s += driverSplDb[i];
          n++;
        }
      }
      return n ? s / n : 0;
    };
    const passMean = meanSpl(passLo, fTop * 0.5);
    const topMean = meanSpl(fTop * 0.65, fTop);
    const droop = passMean - topMean;
    if (droop > 1.5 && passLo < fTop * 0.5) {
      topHold = { droopDb: Math.min(droop, 8), kneeHz: fTop * 0.5 };
    }
  }

  const topo = deriveTopology(spec, zAt, inverted, { fsPeak, topHold, zobelOk: allowCorr });
  // Acoustic mode: the target is the ideal crossover SHAPE (HP/LP/gain) only.
  // EQ bands stay in the TOPOLOGY as free tools — the optimiser may move and
  // retune them to pull driver bumps toward the target — but they must not
  // appear in the target itself, or the "correction" becomes the goal.
  const targetSpec =
    mode === 'acoustic' ? { ...spec, eq: spec.eq.map((b) => ({ ...b, enabled: false })) } : spec;
  const target = evalDriverFilter(targetSpec, freq);

  // Optimisation grid: decimated, with passband-emphasised weights.
  const idx: number[] = [];
  for (let i = 0; i < freq.length; i += decimate) idx.push(i);
  const optFreq = idx.map((i) => freq[i]);
  const optZ = idx.map((i) => driverZ[i]);
  const optTarget = idx.map((i) => target[i]);
  const splFit = mode === 'acoustic' && driverSplDb ? driverSplDb : null;
  const optSpl = splFit ? idx.map((i) => splFit[i]) : null;
  // Acoustic mode squares the weight: in the transition/stopband the acoustic
  // target is partly unreachable (the driver's own rolloff adds to the
  // filter's), and linear weighting lets that unpayable debt dominate the
  // budget at the passband's expense.
  const wExp = splFit ? 2 : 1;
  const weights = optTarget.map((t) => Math.max(abs(t), 0.03) ** wExp);
  const wSum = weights.reduce((a, b) => a + b, 0);

  const PHASE_SCALE = 15; // 15° of phase error ≙ 1 dB of magnitude error
  const dbOf = (c: Complex) => 20 * Math.log10(abs(c) || 1e-9);

  /**
   * Buildability guard: soft penalty (per decade², weight 8) outside the range
   * of parts you can actually buy and afford. Without this, acoustic mode
   * happily "solves" the problem with a 600 µF capacitor or a 20 µH air coil —
   * mathematically fine, practically nonsense.
   */
  const BOUNDS: Record<'C' | 'L' | 'R', [number, number]> = {
    C: [0.33e-6, 100e-6],
    L: [0.05e-3, 15e-3],
    R: [0.22, 47],
  };
  const boundsPenalty = (logVals: readonly number[]): number => {
    let pen = 0;
    for (let i = 0; i < logVals.length; i++) {
      const [lo, hi] = BOUNDS[topo.slots[i].kind];
      const v = logVals[i]; // log10 of value
      if (v < Math.log10(lo)) pen += (Math.log10(lo) - v) ** 2;
      else if (v > Math.log10(hi)) pen += (v - Math.log10(hi)) ** 2;
    }
    return 8 * pen;
  };

  /**
   * Magnitude errors per point. Filter mode: |H| vs |H_target|. Acoustic mode:
   * (SPL + |H|) vs (level + |H_target|) where the reference level is re-fitted
   * (weighted mean) on every evaluation — the optimiser shapes the CURVE, the
   * absolute level is free.
   */
  // Acoustic mode is level-free to absorb the SPL-vs-transfer unit offset —
  // but ONLY that. Unbounded, a branch can drift 20 dB down (deeper pad,
  // "free" in the shape metric) and wreck the relative branch levels the
  // assembly depends on. The drift penalty anchors the level to the very
  // first (textbook-seeded) evaluation.
  let level0: number | null = null;
  let lastLevelDrift = 0;
  const magErrors = (h: readonly Complex[], spl: readonly number[] | null): number[] => {
    if (!spl) {
      lastLevelDrift = 0;
      return h.map((c, i) => dbOf(c) - dbOf(optTarget[i]));
    }
    const dev = h.map((c, i) => spl[i] + dbOf(c) - dbOf(optTarget[i]));
    const level = dev.reduce((a, v, i) => a + weights[i] * v, 0) / wSum;
    level0 ??= level;
    lastLevelDrift = level - level0;
    return dev.map((v) => v - level);
  };

  /**
   * FUNDAMENTAL — driver protection: an HP branch must keep low-frequency
   * energy out of the tweeter REGARDLESS of what the shape metric sees (the
   * stopband weights are ≈ 0 there by design). Electrical drive at and below
   * knee/3 stays ≤ −15 dB, or the penalty bites.
   */
  const protMask = spec.hp.enabled ? optFreq.map((f) => f <= spec.hp.freq / 3) : null;

  /** Weighted error of concrete component values (optionally with catalog
   *  DCR/ESR riding along) — the discrete pass evaluates through this too. */
  const netError = (
    vals: readonly number[],
    seriesRs?: readonly (number | undefined)[],
  ): number => {
    const netlist = topo.build(vals, seriesRs);
    let sol;
    try {
      sol = solveNetwork(netlist, optFreq, { drv: optZ });
    } catch {
      return 1e9;
    }
    const h = sol.transfers['D'];
    const dbErrs = magErrors(h, optSpl);
    let acc = 0;
    for (let i = 0; i < h.length; i++) {
      const degErr = wrapDeg(((arg(h[i]) - arg(optTarget[i])) * 180) / Math.PI);
      acc += weights[i] * (magW * dbErrs[i] * dbErrs[i] + phW * (degErr / PHASE_SCALE) ** 2);
    }
    let prot = 0;
    if (protMask) {
      let np = 0;
      for (let i = 0; i < h.length; i++) {
        if (!protMask[i]) continue;
        const d = Math.max(0, dbOf(h[i]) + 15);
        prot += d * d;
        np++;
      }
      prot = np ? (0.02 * prot) / np : 0;
    }
    // Gentle on legitimate absorption (±2 dB ≈ 0.2), decisive against a
    // 20 dB pad-drift (≈ 20).
    return acc / wSum + 0.05 * lastLevelDrift * lastLevelDrift + prot;
  };

  /** Catalog-snap mode: the CONTINUOUS fit already carries modelled
   *  parasitics (1.4 mm coil DCR, nominal cap ESR), so the discrete snap is
   *  a small perturbation of the same physics instead of a rug-pull. */
  const modelSrs = (vals: readonly number[]): (number | undefined)[] =>
    topo.slots.map((s, i) =>
      s.kind === 'L' ? coilDcr(vals[i], 1.4) : s.kind === 'C' ? 0.02 : undefined,
    );

  /**
   * FUNDAMENTAL — role anchor: ladder-section elements must stay near their
   * textbook value (the slot's initial, computed against measured |Z|). A
   * ×30-drifted series cap (57–100 µF "2nd-order" HP) means the topology
   * degenerated: the pole moved into other parts, the cap costs a fortune
   * and filters nothing. ×3 is free fit room; beyond that the penalty bites.
   */
  const anchored = topo.slots.map((s) => /section \d+ (series|shunt)/.test(s.role));
  const LOG3 = Math.log10(3);
  const anchorPenalty = (logVals: readonly number[]): number => {
    let acc = 0;
    for (let i = 0; i < logVals.length; i++) {
      if (!anchored[i]) continue;
      const ex = Math.max(0, Math.abs(logVals[i] - Math.log10(topo.slots[i].initial)) - LOG3);
      acc += ex * ex;
    }
    return 6 * acc;
  };

  const objective = (logVals: readonly number[]): number => {
    const vals = logVals.map((v) => 10 ** v);
    return (
      netError(vals, catalogSnap ? modelSrs(vals) : undefined) +
      boundsPenalty(logVals) +
      anchorPenalty(logVals)
    );
  };

  // Iteration budget scales with dimensionality: a heavy multi-notch branch
  // (15+ dims) simply needs more simplex steps than a bare LR2 ladder.
  const maxIterations = opts.maxIterations ?? Math.max(900, 140 * topo.slots.length);

  const x0 = topo.slots.map((s) => Math.log10(s.initial));
  let fit = nelderMead(objective, x0, { maxIterations, tolerance: 1e-6, step: 0.12 });
  // Deterministic restarts: high-dimensional branches (several notch chains)
  // regularly stall in a poor basin from the textbook seed. Widen the simplex
  // around the best point, then nudge it apart; keep whatever wins.
  // "Converged" = the simplex collapsed within budget OR the search went
  // stationary: a fresh run can no longer improve the objective by >1%. In
  // 15+ dimensions the simplex rarely collapses inside any sane budget even
  // AT the minimum — the iteration counter alone would cry wolf.
  let stationary = false;
  for (const rs of [
    { perturb: 0, step: 0.3 },
    { perturb: 0.18, step: 0.12 },
  ]) {
    if (fit.converged && fit.fx < 0.02) break;
    const xs = fit.x.map((v, i) => v + rs.perturb * (i % 2 === 0 ? 1 : -1));
    const again = nelderMead(objective, xs, { maxIterations, tolerance: 1e-6, step: rs.step });
    if (again.fx < fit.fx) fit = again;
  }
  // Block-coordinate refinement: past ~10 dims one simplex crawls. Re-polish
  // overlapping 6-dim blocks around the global best (cheap, targeted), then
  // finish with a tight full-dimensional polish from the refined point.
  if (topo.slots.length > 9) {
    for (let start = 0; start < topo.slots.length; start += 3) {
      const ids: number[] = [];
      for (let k = start; k < Math.min(start + 6, topo.slots.length); k++) ids.push(k);
      const subObjective = (xs: readonly number[]): number => {
        const full = [...fit.x];
        ids.forEach((slot, j) => (full[slot] = xs[j]));
        return objective(full);
      };
      const sub = nelderMead(subObjective, ids.map((i) => fit.x[i]), {
        maxIterations: 400,
        tolerance: 1e-7,
        step: 0.08,
      });
      if (sub.fx < fit.fx) {
        const full = [...fit.x];
        ids.forEach((slot, j) => (full[slot] = sub.x[j]));
        fit = { ...fit, x: full, fx: sub.fx };
      }
    }
    // Tight full-dimensional polish rounds; stop when a round stops paying.
    for (let round = 0; round < 3; round++) {
      const final = nelderMead(objective, [...fit.x], { maxIterations, tolerance: 1e-6, step: 0.04 });
      const gained = final.fx < fit.fx * 0.99;
      if (final.fx < fit.fx) fit = final;
      if (!gained || fit.converged) break;
    }
  }

  // Stationarity probe: one fresh, wide simplex from the end point. If it
  // cannot find >3% more, the basin is exhausted — that IS convergence in
  // practice; a raw iteration counter in 15+ dims would cry wolf forever.
  {
    const before = fit.fx;
    const probe = nelderMead(objective, [...fit.x], { maxIterations: 600, tolerance: 1e-6, step: 0.2 });
    if (probe.fx < fit.fx) fit = probe;
    stationary = fit.fx >= before * 0.97;
  }

  let values = fit.x.map((v) => 10 ** v);
  let seriesRsFinal: (number | undefined)[] | undefined;
  let chosen: (CatalogPick | null)[] | null = null;

  if (catalogSnap && hasImportedCatalog()) {
    // Discrete pass: per slot the nearest purchasable candidates — single
    // parts first, 2-part STACKS (series coils / parallel caps) only where
    // no single part comes close — evaluated WITH their real DCR/ESR;
    // coordinate descent re-balances slots around each snap. Every extra
    // physical part carries a 5% fit handicap: a single component wins
    // unless the stack genuinely pays (Sanders doctrine).
    // Position per slot from its role: shunt/notch/Zobel chains are the
    // budget positions of Sanders doctrine; everything in the signal path
    // (series elements, pads, bypasses) is series-path.
    const posOf = (role: string): 'series' | 'shunt' =>
      /shunt|notch|Zobel/i.test(role) ? 'shunt' : /series|pad R|bypass/.test(role) ? 'series' : 'shunt';
    const cands = topo.slots.map((s, i) =>
      pickCandidates(s.kind, values[i], 3, snapPrefs ?? null, posOf(s.role)),
    );
    let pick: (CatalogPick | null)[] = cands.map((c) => c[0] ?? null);
    const valsOf = (ch: (CatalogPick | null)[]) => ch.map((p, i) => (p ? p.value : values[i]));
    const srsOf = (ch: (CatalogPick | null)[]) =>
      ch.map((p) => (p && p.seriesR > 0 ? p.seriesR : undefined));
    const extraParts = (ch: (CatalogPick | null)[]) =>
      ch.reduce((a, p) => a + (p ? p.parts.length - 1 : 0), 0);
    const costOf = (ch: (CatalogPick | null)[]) =>
      ch.reduce((a, p) => a + (p?.priceEur ?? 0), 0);
    const score = (ch: (CatalogPick | null)[]) =>
      netError(valsOf(ch), srsOf(ch)) *
      (1 + 0.05 * extraParts(ch)) *
      (1 + costWeight * costOf(ch));
    let bestErr = score(pick);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pick.length; i++) {
        for (const cand of cands[i]) {
          if (cand === pick[i]) continue;
          const trial = [...pick];
          trial[i] = cand;
          const err = score(trial);
          if (err < bestErr) {
            bestErr = err;
            pick = trial;
          }
        }
      }
      // Adjacent L/C pairs set a resonance TOGETHER (notch f0 = 1/√LC, HP
      // section C+L): one-at-a-time moves cannot cross that valley — try the
      // candidate combinations jointly.
      for (let i = 0; i + 1 < pick.length; i++) {
        const kinds = `${topo.slots[i].kind}${topo.slots[i + 1].kind}`;
        if (kinds !== 'LC' && kinds !== 'CL') continue;
        for (const a of cands[i]) {
          for (const b of cands[i + 1]) {
            if (a === pick[i] && b === pick[i + 1]) continue;
            const trial = [...pick];
            trial[i] = a;
            trial[i + 1] = b;
            const err = score(trial);
            if (err < bestErr) {
              bestErr = err;
              pick = trial;
            }
          }
        }
      }
    }
    chosen = pick;
    values = valsOf(pick);
    seriesRsFinal = srsOf(pick);
  }

  const achieved = solveNetwork(topo.build(values, seriesRsFinal), freq, { drv: [...driverZ] })
    .transfers['D'];

  // Report errors on the full grid with the same weighting and mode.
  const fullWeights = target.map((t) => Math.max(abs(t), 0.03) ** wExp);
  const fullWSum = fullWeights.reduce((a, b) => a + b, 0);

  let level = 0;
  let fullDbErrs: number[];
  if (splFit) {
    const dev = achieved.map((c, i) => splFit[i] + dbOf(c) - dbOf(target[i]));
    level = dev.reduce((a, v, i) => a + fullWeights[i] * v, 0) / fullWSum;
    fullDbErrs = dev.map((v) => v - level);
  } else {
    fullDbErrs = achieved.map((c, i) => dbOf(c) - dbOf(target[i]));
  }

  let accDb = 0;
  let accDeg = 0;
  for (let i = 0; i < freq.length; i++) {
    const degErr = wrapDeg(((arg(achieved[i]) - arg(target[i])) * 180) / Math.PI);
    accDb += fullWeights[i] * fullDbErrs[i] * fullDbErrs[i];
    accDeg += fullWeights[i] * degErr * degErr;
  }

  return {
    // Components in ELECTRICAL order (see Topology.order) — the schematic
    // builder reconstructs the ladder from this sequence.
    components: topo.order.map((s, pos) => ({
      id: `${topo.slots[s].kind}${pos + 1}`,
      kind: topo.slots[s].kind,
      value: values[s],
      role: topo.slots[s].role,
      ...(seriesRsFinal?.[s] !== undefined ? { seriesR: seriesRsFinal[s] } : {}),
      ...(chosen?.[s]
        ? {
            catalogLabel: chosen[s]!.label,
            ...(chosen[s]!.priceEur !== undefined ? { priceEur: chosen[s]!.priceEur } : {}),
          }
        : {}),
    })),
    achieved,
    target,
    rmsDb: Math.sqrt(accDb / fullWSum),
    rmsDeg: Math.sqrt(accDeg / fullWSum),
    converged: fit.converged || stationary,
    ...(splFit
      ? {
          acousticAchievedDb: achieved.map((c, i) => splFit[i] + dbOf(c)),
          acousticTargetDb: target.map((t) => level + dbOf(t)),
        }
      : {}),
  };
}

/** Human formatting: 6.8 µF, 0.33 mH, 3.3 Ω. */
export function formatComponent(c: SynthesizedComponent): string {
  switch (c.kind) {
    case 'C':
      return `${(c.value * 1e6).toPrecision(3)} µF`;
    case 'L':
      return `${(c.value * 1e3).toPrecision(3)} mH`;
    case 'R':
      return `${c.value.toPrecision(3)} Ω`;
  }
}
