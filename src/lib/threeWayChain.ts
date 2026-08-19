import type { Complex } from './complex.ts';
import { evalDriverFilter, type DriverFilterSpec } from './filters.ts';
import {
  applyTransfer,
  combine,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { computeIntegration } from './integration.ts';
import { designThreeWay, type Struct3Choice } from './threeWayDesign.ts';
import { synthesize, type SynthesisResult } from './synthesis.ts';
import { mergeSynthesizedSchematics } from './schematicEdit.ts';
import { optimizeNetworkValues, Z_FLOOR_OHM, type NetOptimizeResult } from './netOptimizer.ts';
import type { SnapPrefs } from './catalog.ts';
import { bomFor } from './catalog.ts';
import type { VxpPart } from './parsers/vxp.ts';
import type { ChainStageProgress } from './designChain.ts';
import type { AngleResponse } from './directivity.ts';

/**
 * Three-way design chain — phase-4 trede 4c, deliberately STAGED (v1).
 *
 * The two-way chain earns its keep with vf-rounds (structure enumeration +
 * greedy EQ) before synthesis; the three-way v1 chain skips that stage and
 * goes straight from a TEXTBOOK target design (LR4 knees at the candidate
 * crossover points + level trims measured from the branch medians) through
 * per-branch synthesis into the assembled TWO-PAIR component tune. The tune
 * is where the interplay is judged anyway, and acoustic-mode synthesis
 * already carries the measurement-gated corrections (Zobel, Fs trap,
 * stopband trap, top-octave hold). Per-branch EQ design and alignment
 * enumeration can grow on top later — the honest note says what ran.
 *
 * The candidate axis is TWO-DIMENSIONAL (low × high handover); ranking mirrors
 * the two-way rules and adds the amplifier-load verdict as a DECISION gate:
 * a candidate whose tuned network cannot stay above the Z floor ranks below
 * one that can — Z is design physics in a 3-way (three parallel branches),
 * never an objective term (the anchor lesson).
 */

export interface Chain3Settings {
  phasePriority: number; // 0..1
  targets?: { rippleDb: number; phaseDeg: number };
  /** Target acoustic slopes: mid/tweeter = the TOP pair, low = the LOW pair
   *  (woofer LP flank / mid HP flank). */
  acousticSlopes?: { mid?: number; tweeter?: number; low?: { lower?: number; upper?: number } };
  /** Designer pins for the two handovers (freq ± margin, Hz). A pinned axis
   *  collapses the candidate grid on that axis and HOLDS the crossing in the
   *  tune via the per-pair xo pin. */
  xoLowPin?: { freq: number; margin: number };
  xoHighPin?: { freq: number; margin: number };
  /** Tweeter HP floor (≥2×Fs, Hz): the design step never puts the high knee
   *  below it. */
  hpFloorHz?: number;
  /** BINDING alignment choice per crossing (the designer picks the
   *  foundation; knees, level and polarity stay free). Omit for the free
   *  enumeration over the library. */
  structureLow?: Struct3Choice;
  structureHigh?: Struct3Choice;
  /** Greedy cut-only EQ budget per branch in the design step (the 2-way
   *  "EQ bands/driver" setting; 0/absent = off). */
  eqBands?: number;
  breakupGuard?: boolean;
  /** In-room weight for the assembled tune (0..1): blends energy-average
   *  flatness into the amplitude term — the 2-way recipe, now three-branch.
   *  Needs angleData on the input (with the mid's own set) to do anything. */
  directivityWeight?: number;
  /** Power-response metric (bandMetrics.powerShape) and fold weight — see netOptimizer opts. */
  powerMetric?: 'smooth' | 'legacy';
  powerFoldWeight?: number;
  /** Error smoothing width for the search objectives (oct); 0 = off. */
  errorSmoothOct?: number;
  /** Part-audit options (thresholds incl. the source-R limit, Fb) — forwarded to the tuner. */
  audit?: { enabled?: boolean; thresholds?: { rSourceOhm?: number }; fbHz?: number };
  /** DI anchors per handover for the structure search (threeWayDesign) + weight. */
  diAnchorHz?: { low?: number | null; high?: number | null };
  diWeight?: number;
  ampTarget?: 'onAxis' | 'listeningWindow';
  phaseMetric?: 'band' | 'overlap';
  synthMode: 'filter' | 'acoustic';
  catalogSnap?: boolean;
  snapPrefs?: SnapPrefs;
  band: [number, number];
  safety?: {
    freqs: readonly number[];
    w: GriddedResponse;
    t: GriddedResponse;
    m?: GriddedResponse;
    z: Record<string, readonly Complex[]>;
  };
}

export interface Chain3Input {
  grid: readonly number[];
  /** Banded branch responses (silent ghost outside each measurement range). */
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  /** Keyed by the canonical 3-way model names woofer/mid/tweeter. */
  driverZ: Record<string, readonly Complex[]>;
  /** Banded per-branch angle sets (same grid/ghost treatment as w/m/t) —
   *  feeds the in-room weight; the MID set is required for the term to arm. */
  angleData?: { woofer: AngleResponse[]; mid: AngleResponse[]; tweeter: AngleResponse[] };
  tAdjust: TweeterAdjust;
  midAdjust: BranchAdjust;
  /** Candidate handover points (Hz). */
  xoLow: number;
  xoHigh: number;
  /** This candidate's own CAGE per axis (from `crossover3Variants`). Holds the
   *  acoustic crossing through design AND tune; without it the tuner drifts
   *  the handover away from the knees the design step chose. */
  xoLowRange?: [number, number];
  xoHighRange?: [number, number];
  /** What the DELIVERED crossings are judged against in the ranking: the pin
   *  range when the designer pinned that axis (a promise), else the measured
   *  physics window, else nothing. Distinct from the cage on purpose — the
   *  cage is scan bookkeeping ("boekhouding, geen belofte"): a candidate
   *  drifting into its neighbour's slice is fine, both slices are in-window.
   *  Crossing OUTSIDE the physics window is the thing a designer refuses:
   *  past the beaming/lobing bound both cones carry the region together. */
  judgeWindows?: {
    low?: { floorHz?: number | null; ceilHz?: number | null } | null;
    high?: { floorHz?: number | null; ceilHz?: number | null } | null;
  };
  label: string;
  settings: Chain3Settings;
}

export interface Chain3Result {
  label: string;
  xoLow: number;
  xoHigh: number;
  specs: { woofer: DriverFilterSpec; mid: DriverFilterSpec; tweeter: DriverFilterSpec };
  synthWoofer: SynthesisResult;
  synthMid: SynthesisResult;
  synthTweeter: SynthesisResult;
  parts: VxpPart[];
  net: NetOptimizeResult;
  bomTotalEur: number | null;
  /** Amplifier-load verdict of the DELIVERED network: false when the tune was
   *  rejected on the Z floor or the dip could not be repaired. RELATIVE — it
   *  says the tune did not make things worse, NOT that the load is sane. */
  zOk: boolean;
  /** Physics verdict on the DELIVERED handovers: every judged crossing sits
   *  inside its window/pin (×1.06 slack — a beaming onset is a soft measured
   *  number). null = nothing to judge (no pins, no measured windows). Ranked
   *  as a class: meeting a flatness target with a crossing past the physics
   *  window is the wrong loudspeaker, not a flatter one — measured on
   *  Sander's set: W-M delivered at 1069 Hz with a 3.2-octave overlap against
   *  a 629 Hz measured ceiling, and the ranking had no opinion. */
  xoWindowOk: boolean | null;
  /** Delivered overlap width per pair, octaves (null per pair when unknown). */
  pairOverlapOct: (number | null)[] | null;
  /** Minimum system |Zin| the amplifier actually sees, ohms. The absolute
   *  companion to {@link zOk}, and the one a published design always states.
   *  Ranked as a CLASS (above/below the floor), never blended into the score:
   *  a load a designer would refuse to ship is not something a tenth of a dB
   *  should be able to buy back. */
  zMinOhm: number | null;
  /** Polarities the design step CHOSE — the UI checkboxes must follow these,
   *  or the simulation sums a different design than the one that was fitted. */
  midInverted: boolean;
  tweeterInverted: boolean;
  /** Structure summary of the winning design ("LR4 @411 · BW3 @2520 · mid inv"). */
  structureLabel: string;
  /** Set when a pinned crossing escaped and the hold-the-pin repair ran —
   *  reports the outcome either way (honest attribution). */
  xoPinNote?: string;
}

/** A branch is alive where its banded response is above the silent ghost. */
const ALIVE_DB = -300;

/** One full chain for one (xoLow, xoHigh) candidate. */
export function runThreeWayChain(
  input: Chain3Input,
  onProgress?: (p: ChainStageProgress) => void,
): Chain3Result {
  const { grid, w, m, t, driverZ, xoLow, xoHigh, settings: s } = input;

  /* ---- Target design: ALIGNMENT × POLARITY enumeration -------------------
   * Was: textbook LR4 on both crossings and polarity as loaded. Both are
   * decisions the component tuner can never repair (it moves values on a
   * fixed topology and a fixed polarity), and unlike the two-way chain there
   * is no EQ stage downstream to wash an alignment mistake out. The virtual
   * design step settles them on pure filter math — cheap enough to be
   * exhaustive (64 structures ≪ one network tune). ---- */
  onProgress?.({ stage: 'design', evals: 0, round: 1 });
  const design = designThreeWay({
    w,
    m,
    t,
    tAdjust: input.tAdjust,
    midAdjust: input.midAdjust,
    xoLow,
    xoHigh,
    band: s.band,
    phasePriority: s.phasePriority,
    // The candidate's cage IS the knee window — the design step and the tune
    // must agree on where this candidate's handovers live, or the tune spends
    // its budget undoing the design.
    xoLowWindow: input.xoLowRange,
    xoHighWindow: input.xoHighRange,
    hpFloorHz: s.hpFloorHz,
    structureLow: s.structureLow,
    structureHigh: s.structureHigh,
    breakupGuard: s.breakupGuard,
    eqBandsPerBranch: s.eqBands,
    diAnchorHz: s.diAnchorHz,
    diWeight: s.diWeight,
  });
  const specs = design.specs;
  // The chosen polarities become the branch adjustments everything downstream
  // sums with — synthesis fits per branch, the tune judges the assembled sum.
  const tAdjust: TweeterAdjust = { ...input.tAdjust, inverted: design.tweeterInverted };
  const midAdjust: BranchAdjust = { ...input.midAdjust, inverted: design.midInverted };

  // ---- Per-branch synthesis on each branch's own alive sub-grid ----------
  onProgress?.({ stage: 'synthesis', evals: 0 });
  const synthOne = (
    spec: DriverFilterSpec,
    resp: GriddedResponse,
    zKey: string,
  ): SynthesisResult => {
    const idxs: number[] = [];
    for (let i = 0; i < grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
    const sub = idxs.map((i) => grid[i]);
    const z = driverZ[zKey];
    const zSub = idxs.map((i) => z[i]);
    return synthesize(spec, sub, zSub, {
      mode: s.synthMode,
      phasePriority: s.phasePriority,
      catalogSnap: s.catalogSnap,
      corrections: (s.targets ? 'lean' : 'auto') as 'lean' | 'auto',
      leanTargetDb: s.targets?.rippleDb,
      snapPrefs: s.snapPrefs?.profile === 'position' ? { ...s.snapPrefs, profile: 'premium' as const } : s.snapPrefs,
      ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
    });
  };
  const synthWoofer = synthOne(specs.woofer, w, 'woofer');
  const synthMid = synthOne(specs.mid, m, 'mid');
  const synthTweeter = synthOne(specs.tweeter, t, 'tweeter');
  const merged = mergeSynthesizedSchematics([
    { components: synthWoofer.components, model: 'woofer' },
    { components: synthMid.components, model: 'mid' },
    { components: synthTweeter.components, model: 'tweeter' },
  ]).parts;

  // ---- Assembled two-pair tune -------------------------------------------
  onProgress?.({ stage: 'tune', evals: 0 });
  const pinRange = (pin?: { freq: number; margin: number }): [number, number] | null =>
    pin ? [pin.freq - Math.max(pin.margin, pin.freq * 0.02), pin.freq + Math.max(pin.margin, pin.freq * 0.02)] : null;
  // The candidate's own cage wins over the raw designer pin: the scan already
  // subdivided that pin, and this candidate owns one slice of it.
  const lowCage = input.xoLowRange ?? pinRange(s.xoLowPin);
  const highCage = input.xoHighRange ?? pinRange(s.xoHighPin);
  /* THE LEASH: the design step's acoustic target per branch, handed to the
   * assembled tune as a corridor (see branchTargets in netOptimizer). Masked
   * to where the branch is alive AND within 25 dB of its own target peak —
   * below that the leak/protection guards own the stopband. */
  const targetFor = (spec: DriverFilterSpec, resp: GriddedResponse): number[] => {
    const tgt = applyTransfer(resp, evalDriverFilter(spec, [...grid]));
    let peak = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      if (resp.spl[i] > ALIVE_DB && tgt.spl[i] > peak) peak = tgt.spl[i];
    }
    return tgt.spl.map((v, i) => (resp.spl[i] > ALIVE_DB && v > peak - 25 ? v : NaN));
  };
  const branchTargets = {
    freq: [...grid],
    low: targetFor(specs.woofer, w),
    mid: targetFor(specs.mid, m),
    high: targetFor(specs.tweeter, t),
  };

  const tuneOpts = {
    midBranch: { response: m, adjust: midAdjust },
    branchTargets,
    // The seed here is OUR OWN synthesis, so the seed-relative amp-load bar
    // has nothing to respect and everything to hide behind. See zFloorStrict.
    zFloorStrict: true,
    phasePriority: s.phasePriority,
    breakupGuard: s.breakupGuard,
    angleData: input.angleData,
    directivityWeight: s.directivityWeight,
    powerMetric: s.powerMetric,
    powerFoldWeight: s.powerFoldWeight,
    errorSmoothOct: s.errorSmoothOct,
    audit: s.audit,
    ampTarget: s.ampTarget,
    acousticSlopes: s.acousticSlopes,
    xoRangePairs: [lowCage, highCage],
    staged: s.targets,
    phaseMetric: s.phaseMetric,
    catalogSnap: s.catalogSnap,
    snapPrefs: s.snapPrefs,
    band: s.band,
    safety: s.safety,
    onStage: (detail: string, ev?: number) => onProgress?.({ stage: 'tune', evals: ev ?? 0, detail }),
  };
  let net = optimizeNetworkValues(merged, grid, w, t, driverZ, tAdjust, tuneOpts);

  /* ---- Hold-the-pin repair (DESIGNER pins only) --------------------------
   * The soft xo penalty loses to flatness for small escapes: Sanders pinned
   * W-M 400 ± 175 and the delivered crossing sat at 636 Hz — a 0.15-oct
   * escape costs ~0.7 fx at the soft weight, cheaper than the flatness it
   * buys. A pin is the designer's explicit promise, so mirror the Z-floor
   * doctrine: normal tune first (search path untouched — the anchor lesson),
   * then, ONLY when a PINNED axis escaped its window, a locally-seeded
   * retune with the stiff 1200·oct² barrier. Accepted when the crossings
   * are back inside; the honest xoPinNote reports either way. Free axes are
   * never repaired — their cage is scan bookkeeping, not a promise. ---- */
  let xoPinNote: string | undefined;
  {
    const slack = 1.02; // measurement-grid wiggle, ~0.03 oct
    const escaped = (
      xo: number | null | undefined,
      cage: [number, number] | null,
      pinned: boolean,
    ): boolean =>
      pinned && cage !== null && xo != null && (xo < cage[0] / slack || xo > cage[1] * slack);
    const pairsXo = net.after.xoHzPairs ?? [];
    const lowEsc = escaped(pairsXo[0], lowCage, s.xoLowPin !== undefined);
    const highEsc = escaped(pairsXo[1], highCage, s.xoHighPin !== undefined);
    if (lowEsc || highEsc) {
      onProgress?.({ stage: 'tune', evals: 0, detail: 'hold pinned crossing' });
      const rep = optimizeNetworkValues(net.parts, grid, w, t, driverZ, tAdjust, {
        ...tuneOpts,
        xoPinHard: true,
      });
      const rXo = rep.after.xoHzPairs ?? [];
      const fixed =
        !escaped(rXo[0], lowCage, s.xoLowPin !== undefined) &&
        !escaped(rXo[1], highCage, s.xoHighPin !== undefined);
      const hz = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}`);
      if (fixed) {
        xoPinNote =
          `pinned crossing held: ${hz(pairsXo[0])}/${hz(pairsXo[1])} → ` +
          `${hz(rXo[0])}/${hz(rXo[1])} Hz`;
        net = rep;
      } else {
        xoPinNote =
          `could not hold the pinned crossing inside its window ` +
          `(delivers ${hz(pairsXo[0])}/${hz(pairsXo[1])} Hz) — the drivers may ` +
          `not support a handover there; consider widening the pin`;
      }
    }
  }

  const zOk =
    !net.safetyNote &&
    !(net.ampFloorNote !== undefined && net.ampFloorNote.includes('could not be repaired'));
  const zMinOhm = net.after.zMinOhm ?? null;
  const judge = (
    xo: number | null | undefined,
    win?: { floorHz?: number | null; ceilHz?: number | null } | null,
  ): boolean | null => {
    if (!win || xo == null) return null;
    const SLACK = 1.06;
    if (win.floorHz != null && xo < win.floorHz / SLACK) return false;
    if (win.ceilHz != null && xo > win.ceilHz * SLACK) return false;
    return win.floorHz != null || win.ceilHz != null ? true : null;
  };
  const pairsXoDel = net.after.xoHzPairs ?? [];
  const verdicts = [
    judge(pairsXoDel[0], input.judgeWindows?.low),
    judge(pairsXoDel[1], input.judgeWindows?.high),
  ].filter((v): v is boolean => v !== null);
  const xoWindowOk = verdicts.length === 0 ? null : verdicts.every(Boolean);

  return {
    label: input.label,
    xoLow,
    xoHigh,
    specs,
    synthWoofer,
    synthMid,
    synthTweeter,
    parts: net.parts,
    net,
    bomTotalEur: bomFor(net.parts).totalEur,
    zOk,
    zMinOhm,
    xoWindowOk,
    pairOverlapOct: net.after.pairOverlapOct ?? null,
    midInverted: design.midInverted,
    tweeterInverted: design.tweeterInverted,
    structureLabel:
      design.label +
      (design.diDistanceOct.some((d) => d !== null)
        ? ` · DI Δ ${design.diDistanceOct.map((d) => (d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(2)} oct`)).join('/')}`
        : ''),
    xoPinNote,
  };
}

export interface Chain3Variant {
  label: string;
  xoLow: number;
  xoHigh: number;
  /** The candidate's own CAGE per axis — held during the tune. */
  xoLowRange: [number, number];
  xoHighRange: [number, number];
}

/**
 * Subdivide [lo, hi] into `n` candidate centres, each caged in its own
 * ±half-spacing slice. The slices TILE the range exactly: nothing outside it,
 * neighbours never overlap — the two-way scan doctrine, in log space.
 *
 * n = 1 collapses to the geometric centre with the whole range as its cage.
 */
function sliceAxis(
  lo: number,
  hi: number,
  n: number,
): { centre: number; range: [number, number] }[] {
  const L = Math.log(lo);
  const H = Math.log(hi);
  if (!(H > L) || n <= 1) {
    return [{ centre: Math.exp((L + H) / 2), range: [lo, hi] }];
  }
  const step = (H - L) / (n - 1);
  const out: { centre: number; range: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const c = L + i * step;
    out.push({
      centre: Math.exp(c),
      range: [Math.exp(Math.max(L, c - step / 2)), Math.exp(Math.min(H, c + step / 2))],
    });
  }
  return out;
}

/**
 * 2D candidate grid over the two handovers.
 *
 * Each candidate carries its OWN cage per axis, pinned or not. Without one the
 * tuner drags the acoustic crossings wherever its objective marginally
 * prefers: measured on Robbert's set, a design with knees at 490/3000 Hz was
 * delivered crossing at 1256/6361 Hz — the mid-tweeter handover landing an
 * octave up, inside the mid's breakup, which is exactly where its phase falls
 * apart. This is the two-way "vrij schuivende kruisingen" lesson, which the
 * three-way chain had never been given.
 *
 * A pinned axis subdivides the PIN; a free axis subdivides the neighbourhood
 * of the raw crossing (×0.75 … ×1.4), where the unfiltered branch levels meet.
 * Clamped to sane territory and to xoHigh ≥ 2.5 × xoLow (a 3-way needs real
 * branch bands).
 */
export function crossover3Variants(
  w: GriddedResponse,
  m: GriddedResponse,
  t: GriddedResponse,
  pins?: { low?: { freq: number; margin: number }; high?: { freq: number; margin: number } },
  /** Tweeter HP floor (≥2×Fs, Hz): pushes the HIGH anchor up. A hot tweeter
   *  crosses the raw mid several octaves below a sensible handover (the old
   *  2-way lesson), which made every M-T candidate read like a W-M one. */
  hpFloorHz?: number,
  /** Candidate steps PER AXIS: 1/2/3 → 1/4/9 full chains. Runtime grows with
   *  the square, so this is the designer's cost knob. */
  steps = 2,
  /** PHYSICS window for the free W-M axis — the two-way saneFree recipe:
   *  floor = 2×Fs from the measured MID impedance (protects the mid's low
   *  end), ceiling = woofer cone beaming from its nominal size. W-M levels
   *  never truly cross on real sets (a mid sits below its woofer), so a
   *  level-based anchor is weak evidence there — physics bounds are the
   *  honest search space. Either side optional; the overlap anchor stays the
   *  fallback. A designer pin still overrides everything. */
  lowWindow?: { floorHz?: number | null; ceilHz?: number | null },
  /** Same recipe for the free M-T axis: floor = max(2×Fs tweeter, where the
   *  tweeter reaches level), ceiling = the MID's measured beaming onset. The
   *  raw-overlap anchor is weak evidence on this axis too — a hot tweeter's
   *  raw level-crossing sits far below any sensible handover. */
  highWindow?: { floorHz?: number | null; ceilHz?: number | null },
  /** WARM START: an existing design's delivered crossings (Hz). When one
   *  falls inside its axis' window it becomes an extra candidate — the scan
   *  then always tries "what the designer already has" next to the corners
   *  and the log-midpoint, instead of only the grid it invents itself. */
  warm?: { low?: number | null; high?: number | null },
  /** DIRECTIVITY-MATCH anchor (rule 9): where the lower driver's DI meets the
   *  upper's (diMatchHz). Seeded as an extra candidate when inside the
   *  window — the point where the room hears no power-response step; the
   *  in-room weight in tuner and ranking then keeps pulling that way. */
  diAnchor?: { low?: number | null; high?: number | null },
): Chain3Variant[] {
  /* ---- LEVEL FIRST (the designer sequence, step 2 — Sanders' own example:
   * "meestal is de tweeter veel gevoeliger dan de rest, laten we eerst die
   * zacht spelen, dan pas naar de xo kijken").
   *
   * The anchors below estimate where neighbouring drivers MEET — but a raw
   * overlap centre is the crossing of a loudspeaker that will not exist once
   * the pads are in: a tweeter 8 dB hot reaches level far below any sensible
   * handover, and CLAUDE.md documented exactly that ("het vrije M-T-anker
   * vindt bij een hete tweeter alsnog het lage kruispunt — de pin is daar
   * het gereedschap"). Pinning was a workaround for an ordering fault.
   *
   * So the level decision comes first: coarse per-branch medians over
   * physics-split passbands (window centres when measured, the free rails'
   * geometric means otherwise), every branch trimmed DOWN to the quietest
   * (passive is cut-only), and the anchors read the TRIMMED responses.
   * Anchor-only on purpose: downstream, designThreeWay re-derives its trims
   * from the xo-dependent passbands once the knees are chosen — one owner
   * per decision, and this is the pre-decision that stops the anchors from
   * looking at the wrong loudspeaker. Medians skip banded ghost samples
   * (union grids carry −400 dB outside a branch's own measurement). */
  const geoCentre = (win?: { floorHz?: number | null; ceilHz?: number | null }): number | null =>
    win?.floorHz != null && win?.ceilHz != null && win.ceilHz > win.floorHz
      ? Math.sqrt(win.floorHz * win.ceilHz)
      : null;
  const sLow = geoCentre(lowWindow) ?? Math.sqrt(250 * 1500);
  const sHigh = Math.max(
    geoCentre(highWindow) ?? Math.sqrt(1800 * 7000),
    hpFloorHz ?? 0,
    sLow * 1.5,
  );
  const aliveMedian = (r: GriddedResponse, band: [number, number]): number | null => {
    const vals: number[] = [];
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i] < band[0] || r.freq[i] > band[1]) continue;
      if (r.spl[i] <= ALIVE_DB) continue;
      vals.push(r.spl[i]);
    }
    if (vals.length === 0) return null;
    vals.sort((x, y) => x - y);
    return vals[Math.floor(vals.length / 2)];
  };
  const meds = [
    aliveMedian(w, [w.freq[0], sLow]),
    aliveMedian(m, [sLow, sHigh]),
    aliveMedian(t, [sHigh, t.freq[t.freq.length - 1]]),
  ];
  const present = meds.filter((x): x is number => x !== null);
  const refDb = present.length > 0 ? Math.min(...present) : null;
  const trimBy = (r: GriddedResponse, med: number | null): GriddedResponse =>
    refDb === null || med === null || refDb - med === 0
      ? r
      : { ...r, spl: r.spl.map((v) => v + (refDb - med)) };
  const wL = trimBy(w, meds[0]);
  const mL = trimBy(m, meds[1]);
  const tL = trimBy(t, meds[2]);

  /* Anchor = the LEVEL-MATCHED pair's OVERLAP CENTRE — the same computeIntegration
   * number the panel's pair chips show ("Overlap 1631 / 5455 Hz"), so the
   * scan searches the neighbourhood the designer is already looking at.
   *
   * The first version used "first frequency where the upper driver's level
   * reaches the lower's" — with a HOT tweeter that is the bottom edge of the
   * search window (it is above the mid everywhere), and with a mid that sits
   * below the woofer through the whole low window it found nothing at all and
   * fell back to a geometric mean. Measured on Robbert's set the anchors came
   * out at 548/1800 Hz where the panel's overlap centres sit at 1631/5455 —
   * the scan searched the wrong neighbourhoods entirely, and the tuner kept
   * escaping toward the real handover region. One definition of "where the
   * drivers meet", shared with the display (the bandMetrics lesson). */
  const overlapAnchor = (lower: GriddedResponse, upper: GriddedResponse): number | null => {
    try {
      const c = computeIntegration(
        combine(lower, upper, { offsetMm: 0, trimDb: 0, inverted: false }),
      ).overlapCentreHz;
      return c !== null && Number.isFinite(c) ? c : null;
    } catch {
      return null;
    }
  };
  const rawLow = Math.min(1200, Math.max(250, overlapAnchor(wL, mL) ?? Math.sqrt(200 * 1500)));
  const rawHigh = Math.min(
    7000,
    Math.max(1800, overlapAnchor(mL, tL) ?? Math.sqrt(1200 * 9000), hpFloorHz ?? 0),
  );
  const n = Math.max(1, Math.round(steps));
  /** The searchable span of one axis: the pin when given, else the raw
   *  crossing's neighbourhood. Either way it gets SUBDIVIDED — a pin is a
   *  search space, not a single point (the two-way doctrine).
   *
   *  A pin's span is the EXACT user margin (Sanders: "de ranges lijken niet
   *  overeen te komen met wat ik opgeef" — the old ≥2%-of-f floor turned his
   *  deliberate 8700 ± 50 into ± 174). The 2% breathing room the tune needs
   *  lives in cage() below, where it belongs; margin 0 still means "exactly
   *  there" with a ±2% cage. */
  const span = (
    raw: number,
    pin: { freq: number; margin: number } | undefined,
  ): [number, number] => {
    if (!pin) return [raw * 0.75, raw * 1.4];
    return [pin.freq - pin.margin, pin.freq + pin.margin];
  };
  /** Pinned-axis slicing: the PIN ITSELF is always a candidate (the two-way
   *  doctrine — "oneven zodat de pin zelf altijd meedoet"). Edge-to-edge
   *  log-slicing put the middle step on the GEOMETRIC centre of the span,
   *  which is not the pin (400 ± 200 → middle 346, never 400). */
  const slicePinned = (
    pin: { freq: number; margin: number },
    nSteps: number,
  ): { centre: number; range: [number, number] }[] => {
    const lo = pin.freq - pin.margin;
    const hi = pin.freq + pin.margin;
    if (nSteps <= 1 || !(hi > lo)) return [{ centre: pin.freq, range: [lo, hi] }];
    if (nSteps === 2) return sliceAxis(lo, hi, 2);
    // n = 3: [edge, pin, edge]; cage boundaries at the geometric midpoints.
    const b1 = Math.sqrt(lo * pin.freq);
    const b2 = Math.sqrt(pin.freq * hi);
    return [
      { centre: lo, range: [lo, b1] },
      { centre: pin.freq, range: [b1, b2] },
      { centre: hi, range: [b2, hi] },
    ];
  };
  /* Free axes: physics bounds first (floor = 2×Fs + where the upper driver
   * reaches level, ceiling = the lower driver's measured beaming onset), the
   * overlap-anchor neighbourhood for whichever side is missing. A degenerate
   * window (floor above ceiling) falls back to the anchor entirely — that is
   * a design problem no scan can solve. */
  const freeSpan = (
    win: { floorHz?: number | null; ceilHz?: number | null } | undefined,
    anchorSpan: [number, number],
    rail: [number, number],
  ): [number, number] => {
    const floor = win?.floorHz ?? null;
    const ceil = win?.ceilHz ?? null;
    let lo = Math.max(rail[0], floor ?? anchorSpan[0]);
    let hi = Math.min(rail[1], ceil ?? anchorSpan[1]);
    if (hi <= lo * 1.05) {
      // A single known PHYSICS bound beats a disagreeing level anchor (the
      // anchor is weak evidence): give the missing side an octave of room
      // from the bound instead of discarding it.
      if (floor !== null && ceil === null) hi = Math.min(rail[1], lo * 2);
      else if (ceil !== null && floor === null) lo = Math.max(rail[0], hi / 2);
      else {
        // BOTH bounds known and in conflict: the physics say the two drivers
        // cannot meet here. The candidates COLLAPSE onto that point (±2%) —
        // never a silent hop to the level-anchor neighbourhood, which is how
        // Sanders' scan once ended up at 4028–7000 Hz through a 5660 Hz
        // breakup. The window readout carries the banner that says why.
        const pt = Math.sqrt(Math.min(lo, hi) * Math.max(lo, hi));
        return [Math.max(rail[0], pt * 0.98), Math.min(rail[1], pt * 1.02)];
      }
    }
    return hi > lo * 1.05 ? [lo, hi] : [Math.max(rail[0], lo * 0.98), Math.min(rail[1], hi * 1.02)];
  };
  const freeLow = freeSpan(
    lowWindow,
    [rawLow * 0.75, Math.min(1200, rawLow * 1.4)],
    [250, 1500],
  );
  const freeHigh = freeSpan(
    highWindow,
    [rawHigh * 0.75, rawHigh * 1.4],
    // A MEASURED ceiling above the classic 7 kHz rail extends it (≤ 12 kHz):
    // a wideband mid legitimately hands over near the top of the band —
    // Robbert's mid measures its beaming onset at 8022 Hz and Sanders'
    // preferred ~8.7–9 kHz basin measured 3–7° pair phase; a free scan
    // clipped at 7 kHz could never discover that basin on its own.
    [
      Math.max(1200, hpFloorHz ?? 0),
      Math.min(12000, Math.max(7000, highWindow?.ceilHz ?? 0)),
    ],
  );
  const [lLo, lHi] = pins?.low ? span(rawLow, pins.low) : freeLow;
  const [hLo, hHi] = pins?.high ? span(rawHigh, pins.high) : freeHigh;
  const lowSlices = pins?.low ? slicePinned(pins.low, n) : sliceAxis(lLo, lHi, n);
  const highSlices = pins?.high ? slicePinned(pins.high, n) : sliceAxis(hLo, hHi, n);
  const out: Chain3Variant[] = [];
  for (const fl of lowSlices) {
    for (const fh of highSlices) {
      // Low centre may reach 1500 (the design step's own knee ceiling): a
      // physics window from a small woofer legitimately sits above the old
      // 1200 cap, and a designer pin up to the UI's 2000 was crushed by it.
      // A designer PIN overrides the sane-territory rails on BOTH axes, up to
      // the UI's own input limits (low 2000, high 12000) — Sanders pinned the
      // high handover at 9000 ± 300 and the old hard 7000-cap silently
      // crushed every candidate to 7 kHz ("hij blijft hangen op 7 kHz"). The
      // rails exist to keep the FREE scan sensible; an explicit pin is the
      // designer's own call.
      // A MEASURED window ceiling may extend the free rails (a small woofer's
      // beaming sits above 1500, a wideband mid's above 7000) — but the
      // MEASURED ONSET itself stays the cap: past it is pin territory.
      const lowCap = pins?.low
        ? 2000
        : Math.min(2000, Math.max(1500, lowWindow?.ceilHz ?? 1500));
      const highCap = pins?.high
        ? 12000
        : Math.min(12000, Math.max(7000, highWindow?.ceilHz ?? 7000));
      // The pinned lower rail follows the UI's own input minimum (150 Hz):
      // Sanders' 400 ± 200 pin reaches 200 and the free-scan 250-floor
      // silently pulled that edge candidate up.
      const lowFloor = pins?.low ? 150 : 250;
      const xoLow = Math.round(Math.min(lowCap, Math.max(lowFloor, fl.centre)));
      const xoHigh = Math.round(
        Math.min(Math.max(highCap, 8000), Math.max(xoLow * 2.5, Math.min(highCap, fh.centre))),
      );
      // The cage follows the same clamps as the centre, and never collapses
      // to a point: a zero-width range would make the xo penalty a cliff.
      // For a PINNED axis the rails are the pin window itself (inflated to at
      // least ±2% for breathing room — the old margin-floor semantics, now on
      // the rails where they belong): the first cage version widened an EDGE
      // slice's cage half a spacing PAST the pin edge (575-candidate → cage
      // top 623), quietly re-breaking the designer's promise the pin made.
      const cage = (
        r: [number, number],
        centre: number,
        lo: number,
        hi: number,
      ): [number, number] => {
        const a = Math.min(Math.max(r[0], lo), hi);
        const b = Math.min(Math.max(r[1], lo), hi);
        const half = Math.max(centre * 0.02, (b - a) / 2);
        return [
          Math.max(lo, Math.min(a, centre - half)),
          Math.min(hi, Math.max(b, centre + half)),
        ];
      };
      const pinRail = (
        pin: { freq: number; margin: number } | undefined,
        fallback: [number, number],
      ): [number, number] => {
        if (!pin) return fallback;
        const mrg = Math.max(pin.margin, pin.freq * 0.02);
        return [
          Math.max(fallback[0], pin.freq - mrg),
          Math.min(fallback[1], pin.freq + mrg),
        ];
      };
      const lowRail = pinRail(pins?.low, [lowFloor, lowCap]);
      const highRail = pinRail(pins?.high, [xoLow * 2.5, Math.max(highCap, 8000)]);
      // The xoHigh ≥ 2.5 × xoLow clamp can push two adjacent steps onto the
      // SAME point (seen with steps=3: the 767 Hz row's two lowest high-steps
      // both clamped to 1918). That is a duplicate candidate: it burns a full
      // chain's runtime for a result already being computed, and — because the
      // scan's progress table is keyed by label — it silently loses a row, so
      // "9 candidates" would show as 8. One point, one candidate.
      if (out.some((o) => o.xoLow === xoLow && o.xoHigh === xoHigh)) continue;
      // Two crossover POINTS, labeled unambiguously — "411/2520 Hz" read as
      // one woofer-mid RANGE (Sanders' report).
      out.push({
        label: `W-M ${xoLow} · M-T ${xoHigh} Hz`,
        xoLow,
        xoHigh,
        xoLowRange: cage(fl.range, xoLow, lowRail[0], lowRail[1]),
        xoHighRange: cage(fh.range, xoHigh, highRail[0], highRail[1]),
      });
    }
  }
  // Warm start (see the parameter): one extra candidate at the existing
  // design's crossings, each axis only when it lies inside that axis' span;
  // a missing/outside axis takes the middle slice. Folded into an existing
  // candidate when both axes sit within 2% of one (no duplicate chain).
  const extras: [{ low?: number | null; high?: number | null } | undefined, string][] = [
    [warm, 'warm start'],
    [diAnchor, 'DI match'],
  ];
  for (const [pt, tag] of extras) {
    if (!pt || out.length === 0) continue;
    const inside = (v: number | null | undefined, lo: number, hi: number) =>
      typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
    const wl = inside(pt.low, lLo, lHi);
    const wh = inside(pt.high, hLo, hHi);
    if (wl !== null || wh !== null) {
      const midOf = (sl: { centre: number; range: [number, number] }[]) => sl[Math.floor(sl.length / 2)];
      const sliceFor = (sl: { centre: number; range: [number, number] }[], v: number) =>
        sl.find((x) => v >= x.range[0] && v <= x.range[1]) ?? midOf(sl);
      const xoLow = Math.round(wl ?? midOf(lowSlices).centre);
      const xoHigh = Math.round(Math.max(xoLow * 2.5, wh ?? midOf(highSlices).centre));
      const dup = out.some(
        (o) => Math.abs(o.xoLow / xoLow - 1) < 0.02 && Math.abs(o.xoHigh / xoHigh - 1) < 0.02,
      );
      if (!dup) {
        const fl = sliceFor(lowSlices, xoLow);
        const fh = sliceFor(highSlices, xoHigh);
        out.push({
          label: `W-M ${xoLow} · M-T ${xoHigh} Hz (${tag})`,
          xoLow,
          xoHigh,
          xoLowRange: [Math.max(fl.range[0], xoLow * 0.98), Math.min(fl.range[1], xoLow * 1.02)].map(
            (v, k) => (k === 0 ? Math.min(v, xoLow) : Math.max(v, xoLow)),
          ) as [number, number],
          xoHighRange: [Math.max(fh.range[0], xoHigh * 0.98), Math.min(fh.range[1], xoHigh * 1.02)].map(
            (v, k) => (k === 0 ? Math.min(v, xoHigh) : Math.max(v, xoHigh)),
          ) as [number, number],
        });
      }
    }
  }
  return out;
}

/**
 * Candidates from EXPLICIT points per axis (the axis-by-axis scan): every
 * combination of the low and high points, each caged in its own tile — tile
 * edges at the geometric midpoints between neighbouring points, clamped to the
 * axis span; a single-point axis gets the whole span as its cage (that axis is
 * being held, not searched, and the tuner may still settle it inside the
 * window). Duplicates (same low & high) collapse. `tag` rides in the label so
 * the scan table can say which round produced a row.
 */
export function variantsFromPoints(
  lowPts: readonly number[],
  highPts: readonly number[],
  lowSpan: [number, number],
  highSpan: [number, number],
  tag?: string,
): Chain3Variant[] {
  const tiles = (pts: readonly number[], span: [number, number]): { centre: number; range: [number, number] }[] => {
    const p = [...new Set(pts.map((v) => Math.round(v)))].filter((v) => v > 0).sort((a, b) => a - b);
    if (p.length === 0) return [];
    if (p.length === 1) return [{ centre: p[0], range: [Math.min(span[0], p[0]), Math.max(span[1], p[0])] }];
    return p.map((c, i) => {
      const lo = i === 0 ? Math.min(span[0], c) : Math.sqrt(p[i - 1] * c);
      const hi = i === p.length - 1 ? Math.max(span[1], c) : Math.sqrt(c * p[i + 1]);
      return { centre: c, range: [Math.min(lo, c * 0.98), Math.max(hi, c * 1.02)] };
    });
  };
  const out: Chain3Variant[] = [];
  for (const fl of tiles(lowPts, lowSpan)) {
    for (const fh of tiles(highPts, highSpan)) {
      const xoLow = fl.centre;
      const xoHigh = Math.max(Math.round(xoLow * 2.5), fh.centre);
      if (out.some((o) => o.xoLow === xoLow && o.xoHigh === xoHigh)) continue;
      out.push({
        label: `W-M ${xoLow} · M-T ${xoHigh} Hz${tag ? ` (${tag})` : ''}`,
        xoLow,
        xoHigh,
        xoLowRange: fl.range,
        xoHighRange: [Math.max(fh.range[0], xoLow * 2.5), Math.max(fh.range[1], xoLow * 2.5 * 1.02)],
      });
    }
  }
  return out;
}

/**
 * Rank: the amplifier-load verdict gates FIRST (a 3-way that cooks the amp is
 * not a candidate, however flat), then staged targets, then the two-way
 * blended score on the same doctrine numbers (whole-range avg in the ripple
 * slot); near-equal winners (≤5%) resolve to the cheaper priced BOM.
 */
export function rankChain3Results(
  results: readonly Chain3Result[],
  targets: { rippleDb: number; phaseDeg: number } | undefined,
  phasePriority: number,
  /** In-room weight 0..1 (rule 9 of the window spec): the ripple slot of the
   *  score blends the on-axis avg |deviation| with the delivered ENERGY-AVERAGE
   *  flatness (powerStdDb) at this share, when the candidate carries it.
   *  Without angle data nothing changes. Decision level only — the tuner's
   *  own objective already carries the same weight. */
  directivityWeight = 0,
  /** Source-resistance limit at the low driver (Ω, point 4): a candidate whose
   *  delivered network puts more than this in front of the woofer at Fb loses
   *  a class — same mechanism as the Z floor, never a score term. null/absent
   *  audit is never punished. */
  rSourceLimitOhm = 1.0,
): Chain3Result[] {
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const dW = Math.min(Math.max(directivityWeight, 0), 1);
  const rsClass = (r: Chain3Result): number => {
    const rs = r.net.audit?.rSourceOhm;
    return rs != null && rSourceLimitOhm > 0 && rs > rSourceLimitOhm ? 1 : 0;
  };
  const rippleOf = (r: Chain3Result): number => {
    const on = r.net.after.avgDevDb != null ? (Math.PI / 2) * r.net.after.avgDevDb : r.net.after.rippleDb;
    const pw = r.net.after.powerStdDb;
    const fold = r.net.after.powerFoldDb ?? 0;
    // Same shape as the tuner's amp term: smoothness + 0.5·fold² (slope free).
    return dW > 0 && pw != null ? Math.sqrt((1 - dW) * on * on + dW * (pw * pw + 0.5 * fold * fold)) : on;
  };
  const score = (r: Chain3Result): number =>
    2 * (1 - p) * rippleOf(r) ** 2 + 2 * p * (r.net.after.phaseDeg / 15) ** 2;
  // Coupled pairs: the target must hold at the WORST pair — averaging would
  // let a good mid-tweeter crossing pay for a bad woofer-mid one.
  const worstPhase = (r: Chain3Result): number =>
    r.net.after.pairPhaseDeg && r.net.after.pairPhaseDeg.length > 0
      ? Math.max(...r.net.after.pairPhaseDeg)
      : r.net.after.phaseDeg;
  const meets = (r: Chain3Result): boolean =>
    !targets ||
    (r.net.after.rippleDb <= targets.rippleDb && worstPhase(r) <= targets.phaseDeg);
  /* Amplifier load, as a CLASS. zOk alone was not enough: it is relative
   * (the tune did not worsen the dip), so a candidate whose seed already sat
   * under the floor passed it and won with an amp-hostile load — measured on
   * Sander's 3-way, which shipped a 2.2 Ohm minimum while every gate stayed
   * green. A published design always states its impedance minimum; ours must
   * therefore be able to lose on it. Class, not a score term: the anchor
   * lesson says physics belongs at decision points, and a load you would
   * refuse to ship must not be purchasable with a tenth of a dB. */
  const zFloorOk = (r: Chain3Result): boolean =>
    r.zMinOhm === null || r.zMinOhm >= Z_FLOOR_OHM;
  const zClass = (r: Chain3Result): number => (r.zOk ? 0 : 2) + (zFloorOk(r) ? 0 : 1) + rsClass(r);
  /* Delivered-handover physics, as a class between the amplifier and the
   * flatness targets. Above targets on purpose: a crossing past the measured
   * beaming/lobing bound is a different (worse) loudspeaker off-axis however
   * flat it sums on-axis — the designer sequence's step 3 is a DECISION, and
   * this is where the engine is held to it. Unknown (null) is never punished. */
  const xoClass = (r: Chain3Result): number => (r.xoWindowOk === false ? 1 : 0);
  const ranked = [...results].sort((a, b) => {
    const za = zClass(a);
    const zb = zClass(b);
    if (za !== zb) return za - zb;
    const xa = xoClass(a);
    const xb = xoClass(b);
    if (xa !== xb) return xa - xb;
    const ma = meets(a) ? 0 : 1;
    const mb = meets(b) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return score(a) - score(b);
  });
  if (ranked.length > 1) {
    const s0 = score(ranked[0]);
    const tied = ranked.filter(
      (r) =>
        zClass(r) === zClass(ranked[0]) &&
        xoClass(r) === xoClass(ranked[0]) &&
        meets(r) === meets(ranked[0]) &&
        score(r) <= s0 * 1.05,
    );
    if (tied.length > 1) {
      const priced = tied.filter((r) => r.bomTotalEur !== null);
      if (priced.length > 0) {
        const best = priced.reduce((x, y) => (y.bomTotalEur! < x.bomTotalEur! ? y : x));
        if (best !== ranked[0]) return [best, ...ranked.filter((r) => r !== best)];
      }
    }
  }
  return ranked;
}

/** Rule 8 (scan table): name a candidate after its DELIVERED crossings and
 *  flag a delivery more than ⅓ octave off its aim. Pairs are [low, high];
 *  a missing delivery reads "—" and never flags. */
export function deliveredLabel(
  target: (number | null | undefined)[],
  delivered: (number | null | undefined)[],
  names: string[],
): { text: string; unrealisable: boolean } {
  let off = false;
  const bits = names.map((n, i) => {
    const d = delivered[i];
    const tg = target[i];
    const has = typeof d === 'number' && Number.isFinite(d) && d > 0;
    if (has && typeof tg === 'number' && tg > 0 && Math.abs(Math.log2(d / tg)) > 1 / 3) off = true;
    return `${n} ${has ? Math.round(d) : '—'}`;
  });
  return { text: `${bits.join(' · ')} Hz`, unrealisable: off };
}

