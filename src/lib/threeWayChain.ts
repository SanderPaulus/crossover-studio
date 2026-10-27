import type { Complex } from './complex.ts';
import { evalDriverFilter, type DriverFilterSpec } from './filters.ts';
import {
  applyTransfer,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { designThreeWay, type Struct3Choice } from './threeWayDesign.ts';
import { synthesize, type SynthesisResult } from './synthesis.ts';
import { seriesRMaxOhmOf, type LowestWayLevelWork } from './levelWork.ts';
import { mergeSynthesizedSchematics } from './schematicEdit.ts';
import { rippleStopBand } from './rippleTargetBand.ts';
import {
  optimizeNetworkValues,
  type NetOptimizeOptions,
  type NetOptimizeResult,
} from './netOptimizer.ts';
import type { SnapPrefs } from './catalog.ts';
import { bomFor } from './catalog.ts';
import { DEFAULT_R_SOURCE_DISQUALIFY_OHM } from './partAudit.ts';
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
  /**
   * H-4 — BINDING POLARITY, beside the binding alignment above it and read the
   * same way: the caller picks it, the design step builds the best design on
   * it. Absent is the identity — the design step enumerates all four
   * combinations and the best fx wins, exactly as every caller before H-4.
   *
   * On the v2 route the CANDIDATE states it: a polarity arm is a candidate of
   * its own, at the same position and in its own topology class, and it is
   * designed, EQ'd and tuned against its own tilted phase targets rather than
   * being the loser of an internal tie-break (H-4, `polarityArms.ts`).
   */
  statedPolarity?: { midInverted: boolean; tweeterInverted: boolean };
  /** Greedy cut-only EQ budget per branch in the design step (the 2-way
   *  "EQ bands/driver" setting; 0/absent = off).
   *
   *  ABSENT MEANS ZERO HERE, and that is the P4 problem V38 recorded as
   *  beslispunt C: the app states `DEFAULT_EQ_BANDS_PER_DRIVER` and a fixture
   *  that stated nothing got a silent nought — not "no opinion". An EQ band is
   *  the only route by which `deriveTopology` can propose a trap on a measured
   *  breakup, so unstated is the difference between a field that can buy one
   *  and a field that cannot. On the v2 route the CANDIDATE states it
   *  (`chainChoices.ts`, V41); every v1 caller is unchanged. */
  eqBands?: number;
  /**
   *  The lean-mode threshold handed to per-branch SYNTHESIS (dB): the bare
   *  ladder's fit error below which no correction network is bought.
   *
   *  ABSENT = the historical derivation, `targets.rippleDb` — which is what
   *  every v1 caller gets and what keeps them byte-identical. V38 measured what
   *  that derivation costs: the staged pass's stop goal is 2.5 dB, five times
   *  `SYNTHESIS_LEAN_DEFAULT_DB`, so over the whole casus-1 field the bare
   *  ladder cleared it on 45 of 45 branches and no Zobel, Fs trap or
   *  top-octave hold was ever bought.
   *
   *  WHY A SEPARATE KEY AND NOT A CHANGE TO `targets`. `targets.rippleDb` has
   *  three readers on this route: this one, `staged` (the tuner's prune and
   *  escalation goal) and `rankChain3Results` (the ranking's "targets met"
   *  test). Two of those are a JUDGEMENT. Moving the number itself would move
   *  all three; a key that only the synthesis reading consults moves exactly
   *  the one V38 found (V41). */
  leanTargetDb?: number;
  /**
   * V51 — whether the LOWEST way may carry level work at all: a resistor in
   * its series path or a resistor hanging alone from that path to ground
   * (`levelWork.ts`). `'none'` reaches two steps — the design step trims the
   * lowest way by 0 dB and proposes no shelf cut on it, and its synthesis
   * places no L-pad, no top-octave hold and no shelf pad. The assembled tune
   * never creates a resistor, so what synthesis does not place cannot appear.
   *
   * ABSENT = `'allowed'` = the historical behaviour, byte-identical for every
   * v1 caller. On the v2 route the CANDIDATE states it (`chainChoices.ts`,
   * derived from the project's stated requirement), so a run can say whether
   * the woofer's surplus over the anchor went into a resistor or stayed in the
   * sum — which is the whole question V51 asks.
   *
   * V51b — `{ kind: 'series-r-max', maxOhm }`: the way may carry a PLAIN series
   * resistor (and its coils' DCR) up to a stated total, no pad. The synthesis
   * then proposes one series R sized for the trim and capped at the maximum,
   * and the tuner's box holds the total there (`levelWork.ts`).
   */
  lowestWayLevelWork?: LowestWayLevelWork;
  /**
   * A5e.3b — the CATALOGUE SPAN of the lowest way's stated coil family, henry:
   * a hard ceiling on every coil the synthesis proposes on that way (the
   * damped trap on a reflex woofer is the slot it exists for — 22–36 mH seeds
   * against a family whose largest single part is 22.0 mH). Derived from the
   * stated family's fit (`rangeH[1]`), never typed; the fourth chain-level
   * choice key (`chainChoices.ts`), and the search box reads the same value
   * (`searchBoxFor`). ABSENT = no cap, byte-identical for every v1 caller and
   * for every project that states no coil family or states the stack
   * exception (P4).
   */
  lowestWayCoilMaxHenry?: number;
  /**
   * E-3 — which grid points the per-branch SYNTHESIS fits on: `'alive'` (the
   * points where the branch's own response is above the silent ghost,
   * `ALIVE_DB`) or `'full'` (every grid point, the dead top point included).
   * The fifth chain-level choice key (`chainChoices.ts`). ABSENT = `'alive'`
   * on THIS chain — what it has done since it was written, byte-identical for
   * every v1 caller; `'full'` exists so the E-3 before/after can be run on
   * either chain, and it is what the two-way chain read until E-3.
   */
  synthesisGrid?: 'alive' | 'full';
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
  /** Catalog-snap cost pressure (score ×(1 + w·ΣEUR)). Default 0.0015 in the tuner. */
  costWeight?: number;
  /** Dissipation term weight in front of the lowest branch (fix 3a); 0 = off. */
  dissipationWeight?: number;
  /** Part-audit options (thresholds incl. the source-R limit, Fb) — forwarded to the tuner. */
  audit?: { enabled?: boolean; thresholds?: { rSourceOhm?: number }; fbHz?: number };
  /** DI anchors per handover for the structure search (threeWayDesign) + weight. */
  diAnchorHz?: { low?: number | null; high?: number | null };
  diWeight?: number;
  /** PHYSICS floors per handover [low, high] (Hz): fs·K / excursion / reach of
   *  the upper driver — NOT the data floor. Bound for the design knees and the
   *  tuner (stiff barrier), and the delivered crossing is judged against them:
   *  within `xoFloorSlack` (default 5 %) below = warning, further below =
   *  DISQUALIFIED (visible, struck through, with reason). */
  xoFloorPairs?: (number | null)[];
  xoFloorSlack?: number;
  /** Source-resistance tiers at the low driver (Ω): warn ≥ half the class-loss
   *  tier, class loss ≥ `DEFAULT_R_SOURCE_TIER_OHM` (see the ranker),
   *  DISQUALIFIED ≥ `DEFAULT_R_SOURCE_DISQUALIFY_OHM`. Both numbers and their
   *  derivations live in `partAudit.ts` since V34; this comment used to spell
   *  them out, which made it a fourth place they could be changed.
   *
   *  `null` = the designer stated no limit, so nothing is disqualified on
   *  source resistance (P4). Absent = the historical default. */
  rSourceDisqualifyOhm?: number | null;
  /** A3i-2 — derived amplifier-load floor (IEC 80 % of what the DRIVERS
   *  support). Forwarded to the tuner as a constraint; absent = off. */
  loadFloor?: { nominalOhm: number };
  /** The amplifier's rated minimum load (Ω); absent = no floor anywhere. */
  ampMinLoadOhm?: number;
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
  /** Delivered crossing vs the PHYSICS floor per pair (fix 2): 'ok' | 'warn'
   *  (within slack below) | 'fail' (further below) | null (no floor/no
   *  crossing). */
  xoFloorVerdict: ('ok' | 'warn' | 'fail' | null)[];
  /** Disqualification reasons (fix 1/2): empty = in the race. A disqualified
   *  candidate stays in the table, struck through, with these reasons. */
  disqualified: string[];
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

/** A branch is alive where its banded response is above the silent ghost.
 *  Exported since E-3: `designChain.ts` reads the same line for the same reason
 *  (`synthesisGrid: 'alive'`), and one constant with one home is the point. */
export const ALIVE_DB = -300;

/** One full chain for one (xoLow, xoHigh) candidate. */
/** Raise a knee window's lower edge to a physics floor (never below it). */
function floorBound(
  win: [number, number] | undefined,
  floor: number | null | undefined,
): [number, number] | undefined {
  if (!win || floor == null || !(floor > 0)) return win;
  const lo = Math.max(win[0], floor);
  return [lo, Math.max(win[1], lo * 1.02)];
}


/**
 * F2b — THE ENGINE HOOK, and the one shape it may have.
 *
 * A v2 run has to enforce the M-A/M-B/M-C gates INSIDE the polish (spec A3:
 * "grenshandhaving zit in de kern"), and the only legitimate evaluator of
 * those gates is the F1 metric library. This file may not import it — the
 * dependency arrow points one way and `toggleRegression.test.ts` pins that —
 * so the caller supplies the extra tuner options instead, and this chain
 * simply merges them in.
 *
 * IT IS A FACTORY AND NOT A VALUE, and that is the whole design. M-C is
 * judged against a driver's PASSBAND, which is derived from the crossings the
 * assembled network produces; a reference re-derived at every polish step
 * slides along with the design and stops being a limit (casebook V16b). So it
 * has to be frozen once, on the network the tune starts from — and that
 * network does not exist until synthesis has run. Handing the caller the
 * assembled seed at exactly that moment is what lets it freeze the right
 * thing at the right time.
 *
 * ABSENT = OFF, and off means byte-identical: no hook, no merge, no call.
 */
export interface ChainEngineHooks {
  /**
   * Called ONCE with the assembled seed network, immediately before the tune.
   * Whatever it returns is merged into the tuner options.
   */
  tuneOptionsFor?: (seedParts: readonly VxpPart[]) => Partial<NetOptimizeOptions>;
}

/**
 * U-10 — the two cages of a three-way candidate: its own (the scan subdivided
 * the pin and this candidate owns one slice) over the raw designer pin.
 */
function chain3Cages(input: Chain3Input): { low: [number, number] | null; high: [number, number] | null } {
  const s = input.settings;
  const pinRange = (pin?: { freq: number; margin: number }): [number, number] | null =>
    pin ? [pin.freq - Math.max(pin.margin, pin.freq * 0.02), pin.freq + Math.max(pin.margin, pin.freq * 0.02)] : null;
  return { low: input.xoLowRange ?? pinRange(s.xoLowPin), high: input.xoHighRange ?? pinRange(s.xoHighPin) };
}

/**
 * U-10 fase 1 — THE ASSEMBLED TWO-PAIR TUNE'S OPTIONS, one object for two
 * callers: `runThreeWayChain` (its own synthesis as the seed) and the v2
 * worker's drawn-network tune (`v2TuneNetlist3`, the designer's drawing). The
 * three-way twin of `assembledTuneOptions` in `designChain.ts` (H-3).
 *
 * `branchTargets` exist only where a design step ran; `crossingsHz` only where
 * the candidate's handovers are known before the tune (a drawn network's are
 * not — its stop-goal stays on the judged band, as the two-way drawn tune's
 * does). The hook is merged LAST (F2b).
 */
export function assembledTuneOptions3(
  input: Chain3Input,
  seedParts: readonly VxpPart[],
  extras: {
    branchTargets?: NetOptimizeOptions['branchTargets'];
    crossingsHz: readonly [number, number] | null;
    /** The mid's adjustment as the design step chose its polarity; absent = the input's. */
    midAdjust?: BranchAdjust;
    onStage?: NetOptimizeOptions['onStage'];
  },
  hooks?: ChainEngineHooks,
): NetOptimizeOptions {
  const s = input.settings;
  const { low: lowCage, high: highCage } = chain3Cages(input);
  return {
    midBranch: { response: input.m, adjust: extras.midAdjust ?? input.midAdjust },
    ...(extras.branchTargets ? { branchTargets: extras.branchTargets } : {}),
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
    costWeight: s.costWeight,
    dissipationWeight: s.dissipationWeight,
    // A3e: the ranking's hard tier becomes a constraint in the search, so the
    // tuner cannot spend its time in ground the ranking will throw away.
    rSourceDisqualifyOhm: s.rSourceDisqualifyOhm,
    loadFloor: s.loadFloor,
    ampMinLoadOhm: s.ampMinLoadOhm,
    audit: s.audit,
    ampTarget: s.ampTarget,
    acousticSlopes: s.acousticSlopes,
    xoRangePairs: [lowCage, highCage],
    xoFloorPairs: s.xoFloorPairs,
    staged: s.targets,
    /* E-5b — THE BAND THE STOP-GOAL MAY BE READ ON, derived here because this
     * is where the candidate's handover positions live. POLISH: it carries no
     * decision — whether the tuner reads it is `rippleTargetBand`, a choice the
     * candidate states. Handed over on every run, v1 included, and on a run
     * that states no choice nothing reads it (`rippleTargetBand.ts`). */
    ...(extras.crossingsHz && rippleStopBand([...extras.crossingsHz], s.band) !== null
      ? { rippleTargetBandHz: rippleStopBand([...extras.crossingsHz], s.band)! }
      : {}),
    phaseMetric: s.phaseMetric,
    catalogSnap: s.catalogSnap,
    snapPrefs: s.snapPrefs,
    band: s.band,
    safety: s.safety,
    ...(extras.onStage ? { onStage: extras.onStage } : {}),
    // F2b: the engine hook, merged LAST so a v2 run's gate and bound options
    // cannot be overwritten by anything above. Absent = nothing is added and
    // the object is the one this chain always built.
    ...(hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seedParts) : {}),
  };
}

export function runThreeWayChain(
  input: Chain3Input,
  onProgress?: (p: ChainStageProgress) => void,
  hooks?: ChainEngineHooks,
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
    // (fix 2c) the physics floor bounds the knee windows of the design step
    // too, so the refinement cannot put a knee where the delivery must not go.
    xoLowWindow: floorBound(input.xoLowRange, s.xoFloorPairs?.[0]),
    xoHighWindow: floorBound(input.xoHighRange, s.xoFloorPairs?.[1]),
    hpFloorHz: s.hpFloorHz,
    structureLow: s.structureLow,
    structureHigh: s.structureHigh,
    /* H-4 — spread, so an unstated polarity leaves the key absent and the
     * design step enumerates exactly what it always enumerated. */
    ...(s.statedPolarity ? { statedPolarity: s.statedPolarity } : {}),
    breakupGuard: s.breakupGuard,
    eqBandsPerBranch: s.eqBands,
    diAnchorHz: s.diAnchorHz,
    diWeight: s.diWeight,
    /* V51 — spread rather than assigned: unstated is the identity for every
     * v1 caller (the design step reads absent as allowed). */
    ...(s.lowestWayLevelWork !== undefined ? { lowestWayLevelWork: s.lowestWayLevelWork } : {}),
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
    /** V51 — the rule for the LOWEST way; undefined on every other way and on
     *  every run that states none. */
    lowestRule: LowestWayLevelWork | undefined = undefined,
    /** A5e.3b — the coil-span ceiling for the LOWEST way; undefined elsewhere. */
    coilMaxHenry: number | undefined = undefined,
  ): SynthesisResult => {
    const noLevelWork = lowestRule === 'none';
    const seriesRMaxOhm = seriesRMaxOhmOf(lowestRule);
    const idxs: number[] = [];
    /* E-3 — `synthesisGrid`: absent and `'alive'` are this chain's history (the
     * alive points only); `'full'` is the two-way chain's history, offered here
     * so the before/after is one key on either chain. */
    const onFullGrid = s.synthesisGrid === 'full';
    for (let i = 0; i < grid.length; i++) if (onFullGrid || resp.spl[i] > ALIVE_DB) idxs.push(i);
    const sub = idxs.map((i) => grid[i]);
    const z = driverZ[zKey];
    const zSub = idxs.map((i) => z[i]);
    return synthesize(spec, sub, zSub, {
      mode: s.synthMode,
      phasePriority: s.phasePriority,
      catalogSnap: s.catalogSnap,
      corrections: (s.targets ? 'lean' : 'auto') as 'lean' | 'auto',
      /* V41 — a stated threshold wins over the derivation from `targets`.
       * Unstated is the identity: `s.leanTargetDb` is undefined on every v1
       * caller, so this reads exactly what it read before. */
      leanTargetDb: s.leanTargetDb ?? s.targets?.rippleDb,
      label: zKey,
      snapPrefs: s.snapPrefs?.profile === 'position' ? { ...s.snapPrefs, profile: 'premium' as const } : s.snapPrefs,
      ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
      /* V51 — spread, so an unstated requirement leaves the key absent and the
       * synthesis reads exactly what it always read. */
      ...(noLevelWork ? { noLevelWork: true } : {}),
      /* V51b — the capped plain series R, the same way. */
      ...(seriesRMaxOhm !== null ? { seriesRMaxOhm } : {}),
      /* A5e.3b — the coil-span ceiling of the stated family, the same way. */
      ...(coilMaxHenry !== undefined ? { coilMaxHenry } : {}),
    });
  };
  /* V51 — the woofer slot IS the lowest way of this three-way chain, by the
   * chain's own construction (its LP flank meets the mid's HP flank at the low
   * handover). The requirement names "the lowest way" and this is where that
   * way is synthesised. */
  const synthWoofer = synthOne(specs.woofer, w, 'woofer', s.lowestWayLevelWork, s.lowestWayCoilMaxHenry);
  const synthMid = synthOne(specs.mid, m, 'mid');
  const synthTweeter = synthOne(specs.tweeter, t, 'tweeter');
  /* Degenerate-load refusal (see synthesis.ts): a branch that offers the
   * amplifier a near short cannot be repaired by anything downstream, so the
   * candidate is out of the race here — with the branch, the frequency and
   * the ratio in the reason. It still gets tuned and still shows its numbers
   * in the scan table, struck through: a row that vanishes teaches nothing. */
  const degenerate = [synthWoofer, synthMid, synthTweeter]
    .map((r) => r.degenerateLoad?.reason)
    .filter((x): x is string => typeof x === 'string');
  const merged = mergeSynthesizedSchematics([
    { components: synthWoofer.components, model: 'woofer' },
    { components: synthMid.components, model: 'mid' },
    { components: synthTweeter.components, model: 'tweeter' },
  ]).parts;

  // ---- Assembled two-pair tune -------------------------------------------
  onProgress?.({ stage: 'tune', evals: 0 });
  // The candidate's own cage wins over the raw designer pin: the scan already
  // subdivided that pin, and this candidate owns one slice of it.
  const { low: lowCage, high: highCage } = chain3Cages(input);
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

  /* U-10 — the option assembly lives in `assembledTuneOptions3`, so the tune
   * of a DRAWN three-way network (the v2 worker's `v2TuneNetlist3`) reads the
   * same object this chain does. Extracted verbatim: the keys, their order and
   * their values are what stood here. */
  const tuneOpts = assembledTuneOptions3(
    input,
    merged,
    {
      branchTargets,
      crossingsHz: [xoLow, xoHigh],
      midAdjust,
      onStage: (detail: string, ev?: number) => onProgress?.({ stage: 'tune', evals: ev ?? 0, detail }),
    },
    hooks,
  );
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

  /* A3g: the pass OUTCOME, not a string match on its prose. `zOk` stays
   * RELATIVE (the tune did not make the load worse); the absolute verdict is
   * `zMinOhm` against the floor, ranked as its own class, and an unrepaired
   * floor now disqualifies via `net.infeasible`. */
  const zOk = !net.safetyNote && net.ampFloorRepair !== 'failed' && net.ampFloorRepair !== 'refused';
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
  // (fix 2b) Delivered crossing vs the PHYSICS floor: tiered.
  const slack = s.xoFloorSlack ?? 0.05;
  const floorVerdict = (xo: number | null | undefined, fl: number | null | undefined): 'ok' | 'warn' | 'fail' | null => {
    if (xo == null || fl == null || !(fl > 0)) return null;
    if (xo >= fl) return 'ok';
    return xo >= fl * (1 - slack) ? 'warn' : 'fail';
  };
  const xoFloorVerdict = [
    floorVerdict(pairsXoDel[0], s.xoFloorPairs?.[0]),
    floorVerdict(pairsXoDel[1], s.xoFloorPairs?.[1]),
  ];
  const disqualified: string[] = [];
  xoFloorVerdict.forEach((v, i) => {
    if (v === 'fail') {
      const fl = s.xoFloorPairs![i]!;
      const xo = pairsXoDel[i]!;
      disqualified.push(
        `${i === 0 ? 'W-M' : 'M-T'} delivered ${Math.round(xo)} Hz under its physics floor ${Math.round(fl)} Hz (${Math.round((xo / fl - 1) * 100)} %)`,
      );
    }
  });
  /* A3f: a tune that had to roll a pass back is INFEASIBLE, not merely worse.
   * The design handed over is the last one that satisfied every constraint, so
   * it is safe to look at — but it never got what that pass was for. */
  if (net.infeasible) disqualified.push(net.infeasible);
  disqualified.push(...degenerate);
  // (fix 1a) Source resistance at the low driver: hard tier.
  /* V34: three states. A number is the limit, `null` is the designer having
   * stated none (and a stated nothing disqualifies nothing — P4), and absent is
   * the app's historical default, which keeps every v1 run reading what it
   * always read. */
  const rsDisq = s.rSourceDisqualifyOhm === null ? 0 : (s.rSourceDisqualifyOhm ?? DEFAULT_R_SOURCE_DISQUALIFY_OHM);
  /* The DELIVERED figure, not the audit's: audit.rSourceOhm is frozen before
   * the shrink ladder and the catalog snap, and both still move it. Measured on
   * Sanders 562/2270 candidate: audit 2.0002 Ω (disqualified) against 1.64 Ω
   * for the network that actually ships. Falls back to the audit only when no
   * hard tier armed the delivered reading. */
  const rsNow = net.after.rSourceOhm ?? null;
  if (rsNow !== null && rsDisq > 0 && rsNow >= rsDisq) {
    // Out of band the figure is the DC limit — a lower bound, so exceeding it
    // is still a real verdict; say WHICH number it is (Sanders' scan read the
    // filter's own parallel resonance off the grid edge and disqualified 15 of
    // 19 candidates on it, his own best filter included).
    const how = net.audit?.rSourceOutOfBand
      ? 'series-path DC resistance (the box tuning lies below the measured band)'
      : `Thevenin at the box tuning (Qes ×${(net.audit?.qesFactor ?? 1).toFixed(2)})`;
    disqualified.push(
      `source resistance at the low driver ${rsNow.toFixed(2)} Ω ≥ ${rsDisq.toFixed(1)} Ω — ${how}`,
    );
  }

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
    xoFloorVerdict,
    disqualified,
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

