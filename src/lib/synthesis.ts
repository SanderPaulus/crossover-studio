import type { Complex } from './complex.ts';
import { abs, arg } from './complex.ts';
import type { DriverFilterSpec } from './filters.ts';
import { evalDriverFilter, ladderElementSeeds } from './filters.ts';
import type { Netlist, NetElement, PassiveElement } from './network.ts';
import { solveNetwork } from './network.ts';
import { lbfgs } from './lbfgs.ts';
import { RATIO_DEGENERATE, worstImpedanceRatio } from './impedanceDiag.ts';
import { dbPhaseGradient, solveWithSensitivities } from './adjoint.ts';
import { coilDcr, hasImportedCatalog, pickCandidates, type CatalogPick, type SnapPrefs } from './catalog.ts';
import { wrapDeg } from './dsp.ts';

/**
 * Passive-filter synthesis: turn a virtual (target) filter chain into real
 * component values on the MEASURED driver impedance.
 *
 * Approach: derive a ladder topology from the target spec (HP order → series-C
 * / shunt-L sections, LP order → series-L / shunt-C sections, negative gain →
 * L-pad, cutting EQ band → series-RLC notch across the driver), seed it with
 * textbook values computed against |Z(fc)|, then let a gradient search refine
 * the values (in log-space, so they stay positive) until the MNA-solved transfer
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
  /**
   * Set when this branch presents a DEGENERATE load: |Z_branch| falls below
   * {@link RATIO_DEGENERATE} of the bare driver's own impedance somewhere in
   * band. Absent on a healthy branch.
   *
   * REPORTED HERE, ENFORCED BY THE CALLER. The chains turn it into a
   * disqualification with this reason attached; nothing in the fit sees it —
   * see the note at the refusal for why it is not a penalty term.
   */
  degenerateLoad?: {
    ratio: number;
    atHz: number;
    branchOhm: number;
    bareOhm: number;
    /** Ready-made sentence: names the frequency, the ratio, and what it IS. */
    reason: string;
  };
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
  /**
   * The ALIGNMENT-AWARE textbook value — `C = Q/(ωR)`, `L = R/(ωQ)` with the Q
   * of the chosen alignment — offered to the fit as an extra STARTING POINT.
   *
   * `initial` above deliberately stays the historical Q = 1 form, because the
   * role ANCHOR is built on it and the anchor is part of the objective. Moving
   * it was measured to change two acoustic-mode results for the worse: that was
   * not a seeding change at all but an objective change, and the anchor lesson
   * says those are the ones that bite. The anchor is a DEGENERACY detector with
   * ×3 of free room anyway — the two conventions differ by at most 2×, so both
   * sit comfortably inside it and either serves that purpose.
   *
   * Why two conventions exist at all: a doubly-terminated LADDER of order ≥ 4
   * does not have the element values of its cascaded biquads (Dickason's LR4
   * high-pass table gives 0.2533 and 0.0563 for the two series caps, where the
   * per-section-Q form gives 0.1125 twice — their geometric mean). Neither is
   * "the" textbook value, so the fit starts from both and keeps what wins.
   */
  altInitial?: number;
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
    const R = zAt(spec.hp.freq);
    // Exactly `order` reactive elements, alternating series C / shunt L — an
    // odd order gets its honest 3-element ladder, not a detuned 4th. Values
    // come from the CHOSEN alignment's pole data (C = Q/ωR, L = R/ωQ); seeding
    // everything at Q = 1 would be 2x too much capacitance for Linkwitz-Riley.
    const seeds = ladderElementSeeds(spec.hp, 'hp');
    for (let i = 0; i < spec.hp.order; i++) {
      const sec = Math.floor(i / 2) + 1;
      const w = 2 * Math.PI * seeds[i].cornerHz;
      if (i % 2 === 0) {
        slots.push({
          kind: 'C',
          role: `HP section ${sec} series C`,
          initial: 1 / (w * R),
          altInitial: seeds[i].q / (w * R),
        });
        rungs.push({ type: 'series', slot: slots.length - 1 });
      } else {
        slots.push({
          kind: 'L',
          role: `HP section ${sec} shunt L`,
          initial: R / w,
          altInitial: R / (w * seeds[i].q),
        });
        rungs.push({ type: 'shunt', slot: slots.length - 1 });
      }
    }
  }

  // Insertion point for mid-ladder traps: between LP section 1 and 2 an LC
  // trap adds elliptic-style steepness right where breakup lives.
  let lpMidInsert: number | null = null;
  if (spec.lp.enabled) {
    const R = zAt(spec.lp.freq);
    const seeds = ladderElementSeeds(spec.lp, 'lp');
    for (let i = 0; i < spec.lp.order; i++) {
      const sec = Math.floor(i / 2) + 1;
      const w = 2 * Math.PI * seeds[i].cornerHz;
      if (i % 2 === 0) {
        slots.push({
          kind: 'L',
          role: `LP section ${sec} series L`,
          initial: R / w,
          altInitial: R / (w * seeds[i].q),
        });
        rungs.push({ type: 'series', slot: slots.length - 1 });
      } else {
        slots.push({
          kind: 'C',
          role: `LP section ${sec} shunt C`,
          initial: 1 / (w * R),
          altInitial: seeds[i].q / (w * R),
        });
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
  /** Iteration cap per descent run. Default scales with slot count; the
   *  gradient search normally converges two orders below it. */
  maxIterations?: number;
  /** Wire the driver inverted (e.g. LR2 partner). Default false. */
  inverted?: boolean;
  /**
   * Priority between frequency response and phase, 0..1. 0 = magnitude only,
   * 1 = phase only, 0.5 = balanced (the previous fixed behaviour).
   */
  phasePriority?: number;
  /** Branch name for the degenerate-load message ('woofer' / 'mid' / …). A
   *  refusal that cannot name the branch sends the reader hunting. */
  label?: string;
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

  /**
   * The SAME objective with its exact gradient (adjoint.ts). Every term above
   * is differentiable in log10 space — the guards are all `max(0,·)²`, which
   * has a continuous derivative — so this is the identical function, not an
   * approximation of it.
   *
   * `objective` above stays the scalar AUTHORITY: the discrete catalog pass
   * evaluates through it, and so does the multi-start selection below — so a
   * chain-rule slip here could cost convergence speed but never the choice of
   * end point. The network sensitivities underneath are verified against finite
   * differences of the production solver in adjoint.test.ts; this whole
   * function was checked the same way against `objective` over every KOAN
   * topology in the suite (3–18 slots, filter and acoustic mode, with and
   * without catalog-snap): worst relative error 1e-7.
   */
  const slotIds = topo.slots.map((_, i) => `S${i}`);
  /** d(modelled coil DCR)/dL for the catalog-snap fit, where DCR ≡ f(L). */
  const dModelSrs = (vals: readonly number[]): (number | undefined)[] =>
    topo.slots.map((s, i) =>
      s.kind === 'L' ? 0.29 * 0.65 * (vals[i] * 1e3) ** -0.35 * 1e3 : undefined,
    );

  const objectiveGrad = (logVals: readonly number[]): { fx: number; grad: number[] } => {
    const n = logVals.length;
    const vals = logVals.map((v) => 10 ** v);
    const grad = new Array<number>(n).fill(0);
    let sens;
    try {
      sens = solveWithSensitivities(
        topo.build(vals, catalogSnap ? modelSrs(vals) : undefined),
        optFreq,
        { drv: optZ },
        slotIds,
        catalogSnap ? { dSeriesRdValue: dModelSrs(vals) } : {},
      );
    } catch {
      return { fx: 1e9, grad };
    }
    const h = sens.transfers['D'];
    const m = h.length;

    // Per-slot dB and degree sensitivities at every optimisation point.
    const gDb: Float64Array[] = [];
    const gDeg: Float64Array[] = [];
    for (let s = 0; s < n; s++) {
      const a = new Float64Array(m);
      const b = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const g = dbPhaseGradient(h[i], sens.dTransfers['D'][s][i]);
        a[i] = g.dDb;
        b[i] = g.dDeg;
      }
      gDb.push(a);
      gDeg.push(b);
    }

    // Reuses magErrors — one definition of the level refit, not two.
    const dbErrs = magErrors(h, optSpl);
    const drift = lastLevelDrift;
    // Acoustic mode re-fits the reference level every evaluation, so the level
    // itself moves with the components: ∂level/∂θ is a weighted mean of ∂dB/∂θ.
    const dLevel = new Float64Array(n);
    if (optSpl) {
      for (let s = 0; s < n; s++) {
        let acc = 0;
        for (let i = 0; i < m; i++) acc += weights[i] * gDb[s][i];
        dLevel[s] = acc / wSum;
      }
    }

    let acc = 0;
    for (let i = 0; i < m; i++) {
      const degErr = wrapDeg(((arg(h[i]) - arg(optTarget[i])) * 180) / Math.PI);
      acc += weights[i] * (magW * dbErrs[i] * dbErrs[i] + phW * (degErr / PHASE_SCALE) ** 2);
      for (let s = 0; s < n; s++) {
        const dErr = gDb[s][i] - dLevel[s];
        grad[s] +=
          weights[i] *
          (2 * magW * dbErrs[i] * dErr +
            (2 * phW * degErr * gDeg[s][i]) / (PHASE_SCALE * PHASE_SCALE));
      }
    }
    let fx = acc / wSum;
    for (let s = 0; s < n; s++) grad[s] = grad[s] / wSum + 0.1 * drift * dLevel[s];
    fx += 0.05 * drift * drift;

    if (protMask) {
      let prot = 0;
      let np = 0;
      const pg = new Array<number>(n).fill(0);
      for (let i = 0; i < m; i++) {
        if (!protMask[i]) continue;
        np++;
        const d = Math.max(0, dbOf(h[i]) + 15);
        prot += d * d;
        if (d > 0) for (let s = 0; s < n; s++) pg[s] += 2 * d * gDb[s][i];
      }
      if (np) {
        fx += (0.02 * prot) / np;
        for (let s = 0; s < n; s++) grad[s] += (0.02 * pg[s]) / np;
      }
    }

    for (let i = 0; i < n; i++) {
      const [lo, hi] = BOUNDS[topo.slots[i].kind];
      const v = logVals[i];
      if (v < Math.log10(lo)) {
        fx += 8 * (Math.log10(lo) - v) ** 2;
        grad[i] -= 16 * (Math.log10(lo) - v);
      } else if (v > Math.log10(hi)) {
        fx += 8 * (v - Math.log10(hi)) ** 2;
        grad[i] += 16 * (v - Math.log10(hi));
      }
      if (anchored[i]) {
        const d = v - Math.log10(topo.slots[i].initial);
        const ex = Math.max(0, Math.abs(d) - LOG3);
        if (ex > 0) {
          fx += 6 * ex * ex;
          grad[i] += 12 * ex * Math.sign(d);
        }
      }
    }

    return { fx, grad };
  };

  const maxIterations = opts.maxIterations ?? Math.max(900, 140 * topo.slots.length);

  /**
   * Value fit: L-BFGS on the exact adjoint gradient, from a SCATTER of
   * deterministic starting points.
   *
   * Why this shape. A gradient method commits to the basin it starts in, so it
   * is not a drop-in for a simplex — measured on real KOAN branches, single-
   * start L-BFGS matched Nelder-Mead's optimum from close seeds and LOST from
   * far ones. But it reaches those optima in ~30–60× fewer solves, and that
   * surplus buys the thing a descent method actually lacks: DIVERSITY. Five
   * scattered starts, keep the best. Measured over 12 (topology × seed) cases
   * at 8/15/20 dimensions: 2 wins, 10 ties, 0 losses against the full former
   * recipe (simplex + restarts + block refinement + polish + probe), at 2.6×
   * the speed.
   *
   * Note this is SEEDING, the mechanism this codebase has repeatedly found to
   * be the safe way to inject a prior — the objective itself is untouched.
   */
  const x0 = topo.slots.map((s) => Math.log10(s.initial));
  const lbfgsOpts = { maxIterations, maxStep: 0.4, tolerance: 1e-10 } as const;

  /**
   * Which start wins is decided by `objective` — the SCALAR authority the
   * discrete catalog pass and the tests also evaluate through. So a slip in
   * the gradient's chain rule could at worst cost convergence speed; it can
   * never make the fit SELECT a point it measures as worse. (The network
   * sensitivities themselves are verified exactly in adjoint.test.ts.)
   */
  // The second textbook convention (see Slot.altInitial) rides along as one
  // more start — only where it actually differs from the first.
  const xAlt = topo.slots.map((s) => Math.log10(s.altInitial ?? s.initial));
  const altDiffers = xAlt.some((v, i) => Math.abs(v - x0[i]) > 1e-9);

  let fit = lbfgs(objectiveGrad, x0, lbfgsOpts);
  let best = objective(fit.x);
  const scatterOf = (base: readonly number[]): number[][] =>
    (
      [
        [0.3, 0],
        [0.3, 1.6],
        [0.75, 0.8],
        [0.75, 2.4],
      ] as const
    ).map(([amp, phase]) => base.map((v, i) => v + amp * Math.cos(i * 1.1 + phase)));
  const starts: number[][] = altDiffers ? [xAlt, ...scatterOf(x0)] : scatterOf(x0);
  for (const xs of starts) {
    if (best < 0.02) break;
    const again = lbfgs(objectiveGrad, xs, lbfgsOpts);
    const score = objective(again.x);
    if (score < best) {
      fit = again;
      best = score;
    }
  }
  // Final descent from the best point: closes the gap when a scatter start
  // landed just outside the winning basin.
  const before = best;
  const polish = lbfgs(objectiveGrad, [...fit.x], lbfgsOpts);
  const polished = objective(polish.x);
  if (polished < best) {
    fit = polish;
    best = polished;
  }
  // "Stationary" keeps its old meaning: one more full attempt from the end
  // point cannot find >3% more, so the basin is exhausted.
  const stationary = best >= before * 0.97;

  let values = fit.x.map((v) => 10 ** v);
  let seriesRsFinal: (number | undefined)[] | undefined;
  let chosen: (CatalogPick | null)[] | null = null;

  if (process.env.PARPROBE) {
    const zOf = (vs: readonly number[], srs?: readonly (number | undefined)[]) => {
      try {
        const sol = solveNetwork(topo.build(vs, srs), freq, { drv: [...driverZ] });
        let mn = Infinity, at = 0;
        sol.inputZ.forEach((c, i) => { const v = Math.hypot(c.re, c.im); if (v < mn) { mn = v; at = freq[i]; } });
        return `${mn.toFixed(3)} @ ${Math.round(at)}`;
      } catch { return 'n/a'; }
    };
    // eslint-disable-next-line no-console
    console.log(`PAR ${opts.label ?? '?'} snap=${catalogSnap ? 1 : 0} Zcont=${zOf(values)} slots=${topo.slots.length}`);
    // eslint-disable-next-line no-console
    console.log(`PARVALS ${opts.label ?? '?'} ${topo.slots.map((sl, i) => `${sl.kind}:${values[i].toPrecision(4)}`).join(' ')}`);
  }
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

  const finalSol = solveNetwork(topo.build(values, seriesRsFinal), freq, { drv: [...driverZ] });
  const achieved = finalSol.transfers['D'];

  /* ---- DEGENERATE-LOAD REFUSAL (aug 2026) ---------------------------------
   *
   * A branch can fit its acoustic target perfectly and still offer the
   * amplifier a near short circuit somewhere outside its passband. Measured on
   * Sanders three-way: the mid branch came out of here at 0.005 Ω at 4799 Hz —
   * a 102 µF series cap is 0.26 Ω up there, so the amplifier looks straight
   * through it at the ladder's own resonance. Voltage drive hides that from
   * every response metric this stage computes, so nothing in the fit could
   * ever notice, and downstream the amp-load repair cannot undo it either (it
   * moves values; lifting this load needed 2.77–3.00 Ω of source resistance,
   * above the disqualification tier).
   *
   * The quantity was already here — `solveNetwork` returns `inputZ` and the
   * bare driver impedance is the argument — it simply was never read.
   *
   * MEASURED, NOT ASSUMED: over 18 seeds on two driver sets there is an empty
   * gap of ×159 between the broken readings (0.0011) and the lowest healthy
   * one (0.1746); the line sits at 0.01 with 9× and 17× of margin. The full
   * distribution is in the RATIO_DEGENERATE note.
   *
   * ⚠ WHY THIS IS A REFUSAL AND NOT A PENALTY TERM. A finite wall erases the
   * landscape it covers even when it is exactly zero inside the limit, because
   * the search does not start inside — that cost 17° of M-T phase in A3e and
   * 6 dB of ripple before that. So the fit is untouched and the verdict is
   * taken once, on the finished branch. A constraint is not a safer kind of
   * objective term.
   *
   * AND IT IS DELIBERATELY NOT THE `RATIO_FLAG` BAND. 0.7 is reporting: a
   * plain series inductor reaches 0.62 on its own with nothing wrong, and the
   * 0.17–0.21 readings in the census are a hard load, which is a designer's
   * choice to make. Refusing those would be refusing the design instead of the
   * defect. */
  const worstRatio = worstImpedanceRatio(finalSol.inputZ, driverZ, freq);
  const degenerateLoad =
    worstRatio && worstRatio.ratio < RATIO_DEGENERATE
      ? {
          ...worstRatio,
          reason:
            `${opts.label ? `the ${opts.label} branch` : 'this branch'} presents ` +
            `${worstRatio.branchOhm.toFixed(3)} Ω to the amplifier at ` +
            `${Math.round(worstRatio.atHz)} Hz — ${(worstRatio.ratio * 100).toFixed(2)}% of the ` +
            `${worstRatio.bareOhm.toFixed(2)} Ω the bare driver offers there. That is a ` +
            `DEGENERATION in the filter, not a heavy load: a healthy branch never goes below ` +
            `${(RATIO_DEGENERATE * 100).toFixed(0)}% (measured floor over two driver sets: 17%). ` +
            `Nothing downstream can repair it — do not reach for the amplifier or the impedance ` +
            `settings; this candidate's topology is what has to change.`,
        }
      : undefined;

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
    ...(degenerateLoad ? { degenerateLoad } : {}),
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
