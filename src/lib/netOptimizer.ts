import { nelderMead } from './optimize.ts';
import { bandMedian, powerShape, smoothDbGaussian, type PowerMetricMode } from './bandMetrics.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork, type NetElement, type PassiveElement } from './network.ts';
import { applyTransfer, combine, combineN, type BranchAdjust, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { pickSlotsN } from './driverSlots.ts';
import { computeIntegration } from './integration.ts';
import type { Complex } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import {
  allSeries,
  branchDcrBudgetOhms,
  hasImportedCatalog,
  nearestParts,
  pickCandidates,
  seriesValueRange,
  type CatalogPick,
  type SnapPrefs,
} from './catalog.ts';
import type { AngleResponse } from './directivity.ts';
import { floorCurve, type FloorShape } from './impedanceFloor.ts';
import { ampFloorSlackOhm, minImpedanceAt } from './impedanceFloor.ts';
import {
  auditNetwork,
  type AuditThresholds,
  type NetworkAudit,
  sourceResistanceOhm,
  seenImpedance,
  sliceDriverZ,
  sourceProbeIndex,
  type ProbeEdgeRule,
  DEFAULT_R_SOURCE_TIER_OHM,
} from './partAudit.ts';

/**
 * Passive-in-the-loop component optimizer: re-fit the VALUES of a schematic's
 * R/L/C parts directly against the measured combined response — the judge is
 * the real network on the real impedances, not a virtual intermediate.
 * Parts marked `locked` keep their value ("this 15 µF is on my shelf");
 * everything else may move. DCR/ESR params ride along unchanged.
 *
 * STAGED MODE (`staged`, trapmethode on the assembled network):
 *  - targets MET after value tuning → PRUNE: greedily try removing parts
 *    (series part → shorted, shunt part → open; both variants are tried and
 *    the objective rejects the nonsensical one), re-tune the remaining
 *    values, keep the removal while the targets stay met AND the removal is
 *    (nearly) free — ≤10% objective per removal, ≤35% cumulative. Quality
 *    inside the target box is NOT loose change for component count.
 *  - targets NOT met → ESCALATE (rule 3): candidate bypass capacitors across
 *    series resistors (the passive "lift the top octave around the pad"
 *    move); a candidate must reach the targets or pay ≥3% objective
 *    improvement to stay.
 */



/**
 * WHAT A TERM'S BAND MEANS — a term must CHOOSE, never inherit from whatever
 * sits next to it.
 *
 *  'ranking'         — strictly inside the evaluation band. Comparing
 *                      candidates on noise is invalid, so anything that ranks
 *                      one design against another lives here: amplitude, phase,
 *                      power response.
 *  'disqualification'— deliberately wider, anchored to the CROSSING rather than
 *                      to the view range. Broken is broken, also outside the
 *                      measurement's validity: a dead crossing, a leaking
 *                      stopband, an undriven-tweeter hazard and an amplifier
 *                      load are all things a design can be condemned for
 *                      wherever they happen. A zoomed-in band must not hide
 *                      them (the 0.68 µF dead tweeter this rule was written
 *                      for).
 *
 * Written down because it existed only as behaviour in two tests, which is not
 * where a principle belongs.
 */
export type BandScope = 'ranking' | 'disqualification';

export interface NetOptimizeOptions {
  /** 0..1 share of the budget on phase (same scale as everywhere). Default 0.5. */
  phasePriority?: number;
  /**
   * Source resistance at the lowest driver past which a design is INFEASIBLE,
   * ohms. The same number the ranking disqualifies on; passing it here moves
   * the decision from "thrown away afterwards" to "never searched". 0/absent =
   * off, which is the pre-A3e behaviour.
   *
   * `null` since V34, and it means the same thing 0 does HERE while meaning
   * something different one level up: the chain wrappers turn an absent value
   * into their own historical default and a `null` into no limit at all. This
   * file has never had a default, so the distinction costs it nothing — it
   * carries the type so a caller can state "none" in one vocabulary all the way
   * down. See `DEFAULT_R_SOURCE_DISQUALIFY_OHM` in `partAudit.ts`.
   */
  rSourceDisqualifyOhm?: number | null;
  /**
   * V34 — WHERE THE SOURCE-RESISTANCE PROBE READS. Absent = `'grid'`, the
   * evaluation grid, which is what it has always read; a v1 run is
   * byte-identical.
   *
   * THE FINDING, AND IT IS ISSUE #14 ONE EDGE FURTHER ON. Without a stated box
   * tuning the probe takes the low driver's impedance peak over the bottom of
   * the grid, and the guard that exists for that fallback refuses a peak on the
   * FIRST grid point only. On casus 1 the peak lands on the LAST point of the
   * probe's own search window — grid[24] = 640.2 Hz, measured, with the woofer
   * pair's real peaks at 17 and 51 Hz, both below a grid that starts at 200. So
   * a disqualification limit, a search constraint, a structure-move guard, an
   * audit tier and one objective term were all reading a number taken at a
   * frequency the probe had picked because it ran out of window.
   *
   * TWO VALUES, NOT THREE, AND THAT IS THE DIFFERENCE FROM V33.
   *
   *   `'grid'`   — the evaluation grid, with the historical edge rule. Default,
   *                and therefore the v1 behaviour.
   *   `'safety'` — the tuner's own full-band safety grid (`opts.safety`), with
   *                the strict edge rule. That grid spans the drivers' whole
   *                measured extent, which is where a woofer resonance actually
   *                is.
   *
   * V33 needed a third value because its barrier had to aim at the number a
   * GATE enforces, and only the gate's own reference is that number by
   * construction. Nothing gates the source resistance, so there is nothing to
   * be identical to — and the difference between the safety grid and the gate's
   * 1600-point sweep is a measurement rather than an argument: across all fifty
   * frozen netlists it is at most 0.013 Ω (`frozenNetlistGates.test.ts`). A
   * value nobody can afford to run inside the objective, to buy that, would be
   * decoration.
   *
   * NO FALLBACK, DELIBERATELY, exactly as in V32 and V33. Naming `'safety'`
   * without supplying `safety` does not quietly return to the evaluation grid:
   * the probe answers nothing, the dissipation term drops, the disqualification
   * cannot fire, and `rSourceProbeNote` says so. A silent fallback would
   * restore the reading being withdrawn, in the one place nobody looks.
   *
   * IT IS A CHOICE KEY on the v2 route (`engine2/optimizer/choices.ts`): it
   * decides which frequency a hard limit is compared at, and V34 measured that
   * the same limit passes or disqualifies all three v1 baselines depending only
   * on that.
   */
  rSourceProbeSource?: 'grid' | 'safety';
  /**
   * A3i-2 — the DERIVED amplifier-load floor, as a CONSTRAINT.
   *
   * `nominalOhm` is what the DRIVERS support (impedanceFloor.nominalFromDrivers),
   * never what the delivered design happens to reach: a limit derived from the
   * thing it judges grades its own homework. Absent = the constraint is off and
   * every path is bit-identical to before.
   */
  loadFloor?: { nominalOhm: number; shape?: FloorShape };
  /**
   * THE MINIMUM LOAD THE USER'S AMPLIFIER IS RATED FOR, in ohms. Optional,
   * and there is NO DEFAULT — see THE AMPLIFIER-LOAD FLOOR note below.
   *
   * Filled: the amp-load repair pass, the structure gates, the safety gate and
   * the disqualification all work to THIS number, and every refusal quotes
   * where it came from. Absent: no floor anywhere; the delivered minimum is
   * still measured and reported (`after.zMinOhm`), it simply does not decide
   * anything.
   *
   * DECISION LEVEL ONLY, filled or not — never a term in `fxOf`. That is not a
   * detail of this option but the rule the whole file is built on; the two
   * times a hard limit was put in the objective it cost 6 dB of ripple and 17°
   * of phase respectively (see the note at the end of `fxOf`).
   */
  ampMinLoadOhm?: number;
  /**
   * Evaluation band, Hz. Default full grid minus edges.
   *
   * SHOULD COME FROM MEASUREMENT VALIDITY, not from data extent (issue #14):
   * `sourceMeta.intersectValidity` over every source that feeds the cost
   * function. A response that happens to reach lower — a near-field merge runs
   * to 15 Hz — is not the same statement as "this design is now judged down
   * there". The tuner reports the band it used in `bandNote` so a run can be
   * audited after the fact.
   *
   * NB the amplifier-load floor and its repair pass deliberately keep working
   * on the FULL grid regardless: they are impedance criteria, and an impedance
   * measurement has no gate — it is valid across the whole band. A dip the
   * amplifier has to drive does not stop mattering because the response above
   * it was measured through a window.
   */
  band?: [number, number];
  maxIterations?: number;
  /** Per-driver angle responses (same grid) — enables the directivity-aware
   *  terms, exactly like the design optimizer. */
  angleData?: { woofer: AngleResponse[]; tweeter: AngleResponse[]; mid?: AngleResponse[] };
  /** 0..1: share of the amplitude budget on the energy average. Default 0. */
  directivityWeight?: number;
  /** How the energy average is judged (bandMetrics.powerShape): 'smooth'
   *  (default) = std of the DETRENDED power response + a fold term near each
   *  crossing, slope free; 'legacy' = std of the raw power (flatness) — the
   *  pre-aug-2026 behaviour, kept for A/B on existing projects. */
  powerMetric?: PowerMetricMode;
  /** Weight of the DI-fold term (max |residual| within ×/÷1.6 of a crossing),
   *  as a share of dW: amp += dW·powerFoldWeight·fold². Default 0.5. */
  powerFoldWeight?: number;
  /** Error smoothing for the SEARCH objective: driver magnitudes are Gaussian-
   *  smoothed in log-f by this width BEFORE decimation to the inner grid
   *  (bandMetrics.smoothDbGaussian). 0 = off (legacy). Default 1/12 oct. Phase
   *  untouched; gates/targets/safety/report stay on the raw full grid. */
  errorSmoothOct?: number;
  /** Which curve the amplitude term flattens. Default 'onAxis'. */
  ampTarget?: 'onAxis' | 'listeningWindow';
  /** Penalize stopband leakage beside the crossing (< 20 dB margin) — the
   *  breakup guard, same definition as the design optimizer. Default false. */
  breakupGuard?: boolean;
  /** Staged (trapmethode) structure moves — see the module doc. Omit for the
   *  classic values-only behaviour. */
  staged?: { rippleDb: number; phaseDeg: number };
  /** Pin the ACOUSTIC crossover (where the filtered drivers cross, Hz) —
   *  same constraint as the design optimizer, so the component tuner cannot
   *  drift the handover away from where the designer put it. */
  xoRange?: [number, number];
  /** Phase metric: 'band' (default) = the panel's uniform avg over the
   *  overlap window + P95 excursion term; 'overlap' = classic weighted mean.
   *  Must match the design optimizer's setting. */
  phaseMetric?: 'band' | 'overlap';
  /** Coarse stage callback (value tune, prune, snap, …) for live progress.
   *  NOT structured-cloneable — callers across a worker boundary inject it
   *  on the worker side, never in the posted payload. */
  /** Coarse stage label, plus the running evaluation count. Called at every
   *  stage switch and, as a heartbeat, every 2000 objective evaluations —
   *  a live sim counter is the only proof of life a multi-minute prune sweep
   *  can give (Sanders: "ik heb het idee dat ie blijft hangen"). */
  onStage?: (label: string, evaluations?: number) => void;
  /** Snap the TUNED network to purchasable catalog values as the final step
   *  (discrete coordinate descent with real DCR/ESR, stacks allowed, budget
   *  pressure via costWeight). Without this the tuner un-snaps whatever the
   *  synthesis snapped — Sanders BOM stayed full of "no exact catalog value"
   *  with Snap to catalog on. */
  catalogSnap?: boolean;
  /** Budget pressure for the snap: score ×(1 + costWeight·ΣEUR). Default 0.0015. */
  costWeight?: number;
  /** Component-wizard preferences: binding series per kind, tier profile per
   *  position. Position = on the source→driver bus (BFS over the netlist,
   *  never through ground) vs hanging off it (shunt/notch chains). */
  snapPrefs?: SnapPrefs;
  /** Target ACOUSTIC slopes beside the crossing (dB/oct) — same steering as
   *  the design optimizer, so the tuner keeps the achieved orders. In 3-way
   *  `mid`/`tweeter` steer the TOP pair (their historical meaning: lower and
   *  upper driver of that crossing); `low` steers the LOW pair — the woofer's
   *  LP flank and the mid's HP flank (Sanders: "een 3-weg heeft twee
   *  akoestische flanken op de mid"). */
  acousticSlopes?: { mid?: number; tweeter?: number; low?: { lower?: number; upper?: number } };
  /** 3-way: pin the ACOUSTIC crossing PER adjacent pair [low, high] — the
   *  two-pair counterpart of xoRange (which stays 2-way vocabulary). */
  xoRangePairs?: ([number, number] | null)[];
  /** DISSIPATION term (fix 3a): soft penalty on series resistance in front of
   *  the LOWEST branch, as the power it wastes relative to the driver at the
   *  level-reference frequency (Fb, or the low driver's Z peak):
   *  fx += dissipationWeight · (Rs/Re)². Default 0.05, 0 = legacy off. Why
   *  only the lowest branch: efficiency and damping (Qes) live there; why a
   *  term at all: the tuner has no level anchor and a series R in the woofer
   *  branch is otherwise the cheapest way to match levels (19 Aug: Rs 7.15 Ω,
   *  Qes ×3.24 won the ranking). Fix 1 disqualifies the worst; this steers
   *  away before it gets there. */
  dissipationWeight?: number;
  /** PHYSICS FLOORS per adjacent pair (Hz, [low, high]; null = none): the
   *  delivered acoustic crossing may not sink below the upper driver's
   *  resonance/excursion/reach floor. Unlike the soft cage this is a STIFF
   *  barrier (1200·oct² below the floor, 0 above) — the data floor is NOT in
   *  here (measurement reliability, not driver physics). Added after the
   *  19 Aug axes run delivered 1789 Hz under a 1902 Hz fs floor: the cage
   *  clamps candidate CENTRES, the tuner still drifted the delivery under. */
  xoFloorPairs?: (number | null)[];
  /** REPAIR-pass only: stiff (1200·oct²) xo-pin barrier instead of the soft
   *  adaptive weight. Set exclusively by the chain's hold-the-pin retune,
   *  seeded from an already-tuned point — never on a cold seed (the barrier
   *  lesson) and never in the normal tune (the anchor lesson). */
  xoPinHard?: boolean;
  /** SINGLE-DRIVER mode ("0 driver pairs"): the network drives ONE measured
   *  driver and the other slot carries a silent ghost. Every crossing-anchored
   *  term (xo pin/penalty, valley, breakup guard, tweeter protection, acoustic
   *  slopes) is a property of ADJACENT DRIVER PAIRS — with zero pairs they are
   *  all skipped, and the phase metric (relative phase between drivers) is
   *  reported as 0 and carries no objective weight. What remains is the honest
   *  solo objective: whole-range flatness of the branch + the pair-independent
   *  fundamentals (amp-load floor, series-path realism, buildability), plus
   *  the full toolbox (staged prune/escalation, shrink ladder, drift catch,
   *  catalog snap). Directivity terms are disabled for now (they pair angle
   *  sets across both drivers). NB: this flag must NOT change the two-driver
   *  path in any way — regression-tested bit-identical. The planned 3-way
   *  generalisation is the same idea with TWO pairs, not another special case. */
  solo?: boolean;
  /** Solo sensitivity budget (dB, default 6): how far below the raw driver's
   *  own median level the network may land. A DESIGNER'S CHOICE, not a
   *  constant — measured on Robbert's 12W8524 used fullrange, Sanders' manual
   *  filter spends ~10 dB pulling 200 Hz–8 kHz down toward the collapsed top
   *  and scores far better over the whole range (avg 1.7 vs 2.9 dB) than a
   *  6 dB-capped run. Efficiency versus whole-range flatness is his call. */
  soloSensitivityDb?: number;
  /** Solo FLOOR MODE: the absolute target level (dB, FRD scale). When set,
   *  the solo amplitude term measures deviation from THIS FIXED LEVEL instead
   *  of spread around the response's own mean. Without it the tuner is
   *  level-blind and erases the design stage's level goal (Sanders' "flatten
   *  to a fixed level lijkt niet te gebeuren": the chain landed the seed at
   *  the floor, then the tune let the level drift wherever shape-flatness
   *  liked). Not an extra objective term — it IS the objective in this mode,
   *  and a fixed target cannot be gamed by moving the average. */
  soloTargetLevelDb?: number;
  /** FULL-measurement-band safety data (grid independent of the evaluation
   *  band). The tuner's quality metrics deliberately follow the user's view
   *  range, but that means a zoomed-in band silently hides whole-design
   *  degeneration: with the crossing outside the evaluated band every
   *  crossing-anchored fundamental reads 0 and the tuner can starve a branch
   *  (Sanders 0.68 µF dead tweeter) or drag the crossing to the band edge
   *  with the tweeter wide open (measured: 376 µF cap, crossing at 891 Hz).
   *  When provided, the final result must not degrade the FUNDAMENTALS on
   *  this band versus the seed — otherwise the seed is returned unchanged
   *  with a `safetyNote`. */
  /** THE LEASH (designer sequence 3/3): per-branch acoustic TARGET magnitudes
   *  from the design step, on `freq`. When present, each branch's delivered
   *  |driver x filter| must stay inside a +/-3 dB corridor of its target
   *  (NaN = unjudged point; the stopband belongs to the leak/protection
   *  guards). Exactly 0 inside the corridor — the buildability-window
   *  pattern — so a healthy tune pays nothing and the search path in sane
   *  territory is untouched.
   *
   *  WHY: the assembled tune held the LARGEST freedom in the whole chain —
   *  every value free, judged on the sum — which is the root the guards kept
   *  patching around: cages, adaptive xo weights, the pin repair, the leak
   *  term the design step had to learn because "de tuner herbouwde de
   *  tweeter-tak" (BW3@1620 delivered as −29.5 dB@2k). Assembly's honest job
   *  is small: align phase, trim levels, absorb realization error. The
   *  corridor makes that the contract instead of a hope. */
  branchTargets?: {
    freq: number[];
    low?: number[];
    mid?: number[];
    high?: number[];
  };
  /** The seed is MACHINE-GENERATED (a fresh synthesis from the design chain),
   *  not something a designer chose. The amp-load repair is normally
   *  seed-relative — we do not second-guess a user's own network — but that
   *  bar is meaningless when we wrote the seed ourselves: a synthesis that
   *  already dips to 0.5 ohm sets the bar at 0.5 ohm and the repair declares
   *  victory without lifting anything. Measured on Sander's 3-way scan: all
   *  four candidates shipped under the floor, the winner at 0.5 ohm from an
   *  undamped shunt trap that is acoustically inaudible there and a dead
   *  short to the amplifier. With this set, the repair must reach the real
   *  floor, and it may spend response quality to get there — a short is not
   *  a tradeable quantity. */
  zFloorStrict?: boolean;
  /**
   * Make the amplifier-load floor a SEARCH GOAL instead of a veto with a
   * repair pass behind it (casebook V30). Default `false`, and the default is
   * the point: with the key absent this file behaves exactly as it did before
   * the option existed, which is what `toggleRegression.test.ts` proves.
   *
   * WHAT IT SWITCHES ON. The barrier term `AMP_FLOOR_BARRIER_WEIGHT ·
   * (zShort/floor)²` — until now reachable only from the repair pass — is
   * armed for every full tune, so the simplex that picks the values feels the
   * floor while it is choosing rather than after it has chosen. Nothing else
   * changes: the same term, the same weight, the same repair pass afterwards.
   *
   * WHAT IT DOES NOT SWITCH ON. The repair pass's second half — the corridor
   * cancellation `barr -= 2·corridorSq`, the "branch fidelity yields to the
   * floor" hierarchy — stays tied to the repair pass, because that is where it
   * was measured and what it was measured for: a LOCAL retune with no freedom
   * left has to spend the corridor to lift the dip. A full search has other
   * places to find the ohms and no reason to abandon the design step's leash
   * across the whole run.
   *
   * WHY IT IS OPT-IN AND NOT SIMPLY TRUE. Read the amplifier-load note above
   * `BOUNDS`: putting this floor in the objective has been measured twice on
   * the v1 route and cost 6 dB of ripple once and 17° of phase the other time.
   * Those measurements stand and this option does not overturn them — it makes
   * a caller who has generated its own candidates able to ask for the other
   * trade with its eyes open, and to measure what it costs on ITS field. On
   * the v2 route it is a CHOICE key (`engine2/optimizer/choices.ts`): it
   * decides what "good" means, so it may only arm from the candidate.
   *
   * INERT WITHOUT A RATING. No `ampMinLoadOhm`, no barrier — P4, and the same
   * rule the rest of this file follows: an absent floor is not a floor of
   * zero, it is no judgement at all.
   */
  zFloorBarrier?: boolean;
  /**
   * WHERE the barrier above reads the system's shortest impedance (casebook
   * V33). Absent = `'grid'`, which is what it has always read, so a v1 run —
   * and the repair pass, which is a v1 caller of the same term — is
   * byte-identical.
   *
   * THE FINDING. V32 moved every ELECTRICAL gate onto the drivers' own
   * measured impedance sweeps, because an impedance requirement has no
   * measurement gate and the response grid's floor is the far-field span. The
   * barrier term stayed where it was, on the evaluation grid. So the search
   * aimed at a minimum over 200 Hz–20 kHz while the gate enforced one over the
   * whole sweep, and on casus 1 five of fifteen candidates had their entire
   * value tune refused for a dip at 82 Hz the objective could not see. Two
   * views of one requirement — the same shape as V30 and V32, one layer down.
   *
   * THREE VALUES, AND THE MIDDLE ONE IS THE POINT.
   *
   *   `'grid'`   — the decimated evaluation grid. What it always read; the
   *                default, and therefore the v1 behaviour.
   *   `'safety'` — the tuner's own full-band safety grid (`opts.safety`), which
   *                already spans the drivers' whole measured extent and which
   *                the repair trigger, the repair acceptance and the delivered
   *                verdict have always used (`worstZOf`). The barrier was the
   *                one floor reader that did not.
   *   `'sweep'`  — `zFloorBarrierImpedance` below, which a caller fills from
   *                the very `ImpedanceReference` the gate was frozen on. The
   *                identical number the gate enforces, at the identical
   *                resolution, and correspondingly expensive: that grid is the
   *                analysis resolution and this runs inside the objective.
   *
   * All three go through the same reader (`systemMinImpedanceOhm` →
   * `minImpedanceAt`), so the GRID is a parameter and not a second
   * implementation. That is what makes `'safety'` defensible rather than
   * merely cheap: it is the same question asked over a coarser grid with the
   * same extent, and how much coarser costs is a MEASUREMENT — see
   * `frozenNetlistGates.test.ts`, which holds the difference between the two
   * against `ampFloorSlackOhm` on every frozen netlist.
   *
   * IT REACHES THE REPAIR PASS TOO, and that is not a side effect anyone should
   * be surprised by — it is the same fix one pass further on. The repair's
   * barrier pushed on the evaluation grid while the repair's ACCEPTANCE judged
   * on the safety grid (`worstZOf`), so on a design whose minimum sits below
   * the evaluation grid's floor the repair was pushing where there was nothing
   * to push and being judged where there was: V32 measured four candidates with
   * `ampFloorRepair: 'failed'`, all four with their minimum under 200 Hz. One
   * source for one term makes those two agree.
   *
   * NO FALLBACK, DELIBERATELY. Asking for a source and not supplying its data
   * does NOT quietly return to the evaluation grid: that would restore exactly
   * the reading being withdrawn, and do it silently (V32's rule, applied to a
   * search term instead of to a verdict). The term goes inert instead — in the
   * search AND in the repair, because it is one term — and the run says so in
   * `zFloorSourceNote`.
   *
   * IT IS A CHOICE KEY on the v2 route (`engine2/optimizer/choices.ts`): it
   * decides which band "good" is measured over, which is a different search
   * and not a different amount of polish.
   */
  zFloorBarrierSource?: 'grid' | 'safety' | 'sweep';
  safety?: {
    freqs: readonly number[];
    w: GriddedResponse;
    t: GriddedResponse;
    /** 3-way: the middle branch on the safety grid. */
    m?: GriddedResponse;
    z: Record<string, readonly Complex[]>;
  };
  /** 3-WAY (phase-4 trede 4): the MIDDLE branch — its base response on the
   *  same grid as wBase/tBase, plus its own adjust. When set, the tuner runs
   *  the two-pair path: branch transfers resolve by SLOT (pickSlotsN, so
   *  canonical and real model names both work), the combined sum runs through
   *  combineN, the pair list holds (low,mid) and (mid,high), and the phase
   *  metric averages the ADJACENT pairs' overlap windows. When absent the
   *  2-way path is byte-for-byte the historical one. Directivity terms are
   *  ignored in 3-way (they pair exactly two angle sets). */
  midBranch?: { response: GriddedResponse; adjust: BranchAdjust };
  /** GATE 4 — the absolute physical part audit (partAudit.ts). Runs LAST, on
   *  the network as delivered — after the shrink ladder, the amp-load repair
   *  and the catalog snap — in every mode, targets met or not: parts that measure INERT (sum < 0.15 dB, pair phase < 1°,
   *  Z unchanged, without any retune) are removed and re-checked; everything
   *  else is only REPORTED with its numbers. Locked parts are never removed.
   *  Omit for defaults; `enabled: false` skips it entirely. */
  audit?: { enabled?: boolean; thresholds?: Partial<AuditThresholds>; fbHz?: number };
  /**
   * F2 / A3 — THE FEASIBILITY BOUND, AS A HOOK.
   *
   * Returns a prose reason when the given network violates an ACTIVE hard
   * gate, null when it does not. Called at every point a pass ACCEPTS a
   * network, so a polish step that would cross an active gate is refused
   * whatever it wins elsewhere — which is what A3 means by "grenshandhaving
   * structureel in de kern" rather than a penalty term beside the objective
   * (P2).
   *
   * DELIBERATELY A CALLBACK AND NOT A SET OF NUMBERS. The gates are M-A/M-B/
   * M-C and the only legitimate way to evaluate them is the F1 metric library
   * — which lives in `engine2/` and which this file may not import (the
   * toggle invariant: `toggleRegression.test.ts` pins that the dependency
   * arrow never turns around). A closure keeps the evaluation where the
   * metrics are and leaves this file engine-agnostic: it knows that something
   * can refuse a network, not what.
   *
   * ABSENT = OFF, and off means BYTE-IDENTICAL: every call site below is
   * guarded on this field being present, so a v1 run never asks the question
   * and never changes an answer. Note in particular that it is NOT folded
   * into the existing constraint checks unconditionally — a v1 run with a
   * source-resistance limit must keep visiting exactly the call sites it
   * visited before.
   *
   * NOT STRUCTURED-CLONEABLE: like `onStage`, it cannot cross a worker
   * boundary and must be built on the side that runs the tuner.
   */
  gateViolation?: (parts: readonly VxpPart[]) => string | null;
  /**
   * V33 — the measured impedance the barrier reads when
   * `zFloorBarrierSource` names the sweep. Data, not a decision: which grid
   * this is comes from the choice key above, and what is ON it is the
   * measurement the run already holds.
   *
   * SAME ARGUMENT AS `gateViolation`, and the same class (polish). The sweep,
   * the resampling and the union extent are all `engine2/` work, and this file
   * may not import from there; so the caller that already built the gate's
   * `ImpedanceReference` hands over its grid and its driver impedances, and
   * this file solves on them and knows nothing about where they came from.
   * Handing over the same object is what makes "the goal and the gate see one
   * number" a construction rather than a coincidence.
   *
   * `span` is prose for the notes — never parsed, never compared.
   */
  zFloorBarrierImpedance?: {
    grid: readonly number[];
    driverZ: Record<string, readonly Complex[]>;
    span: string;
  };
  /**
   * V31 — REPORT the tune a wholesale gate threw away, instead of leaving the
   * caller with a seed and no way to know what was lost.
   *
   * The finding: four of fifteen v2 candidates came back byte-identical to
   * their unarmed arm, and the reason was not that the barrier did nothing. The
   * full-band safety gate rejected the whole tune and this function returned
   * the SEED — for one candidate a 0.035 Ω load, where the tune it replaced had
   * reached 1.8 Ω. A network failing two requirements was swapped for one
   * failing one of them far worse, and nothing said so.
   *
   * This flag changes NO decision. The gate still rejects, the seed is still
   * what `parts` carries, every rule is untouched. It only makes the rejected
   * tune's metrics and parts available so a caller can say "refused, and here
   * is what was refused" rather than presenting a seed as a proposal.
   *
   * OFF BY DEFAULT, and the default is the toggle invariant: a v1 run's result
   * object is byte-identical to what it was before V31. The v2 route sets it;
   * nothing else does.
   */
  rejectedTuneReport?: boolean;
  /**
   * INSTRUMENTATION for the gate, and only that.
   *
   * Called once per gate QUESTION — not per evaluation — with whether the
   * run-scoped cache answered it. Exists so a test can assert on a COUNT
   * rather than on a stopwatch: a timing assert measures the machine that
   * happens to run CI, a count measures the thing that was actually changed.
   * Never read by the engine; nothing here may influence a decision.
   */
  onGateEvaluated?: (info: { step: string; cached: boolean }) => void;
  /**
   * F2 / A5d.6 — HARD, MEASUREMENT-DERIVED CEILINGS on individual free values,
   * in SI units (F, H, Ω), keyed by partId.
   *
   * These are budget inversions, not taste: a budget the designer stated
   * (Q_es multiplication, LF lift, damping) is inverted through the measured
   * impedance and near field into the largest component value that can still
   * meet it. The search box becomes `existing app bounds ∩ these`, so the
   * pathology V2 documents — a resistor drifting to extremes to buy phase
   * rotation — is impossible by construction instead of discouraged by a
   * penalty.
   *
   * Applied as a TRUE BOX (clamp, never penalise out), the same mechanism the
   * bound-to-series value windows use. Absent = off.
   */
  valueCeilings?: Readonly<Record<string, number>>;
  /**
   * F2 / A5d.6 — HARD ceilings on the SUM of several elements' values, SI.
   *
   * A5d.6's first exact inversion is "max TOTALE serie-R in het laagste pad",
   * and a total is not something a per-element box can express. Enforced by
   * PROJECTION inside the objective: when the free members' sum would exceed
   * the ceiling they are scaled down proportionally before the network is
   * evaluated, so the search never sees a point outside the set and nothing
   * is added to the cost. `fixedSI` carries the part of the sum that is not
   * free to move (a locked resistor, a coil's DCR).
   */
  valueSumCeilings?: readonly {
    ids: readonly string[];
    maxSI: number;
    fixedSI?: number;
    label: string;
  }[];
}

/**
 * A3g — THE RULE ABOUT WHICH NETWORK A NUMBER DESCRIBES.
 *
 * Four times now the same shape of bug has cost a day: a figure that looks
 * like it describes what is happening and describes something else, with green
 * tests around it (costWeight never wired; the dissipation probe on the grid
 * edge; four cost-function bands taken from the grid instead of the validity
 * band; a ranking judging a network from before the shrink ladder and the
 * snap). It is not four unrelated bugs, it is a property of how this file
 * grew: passes were appended after the point where the reporting was written.
 *
 * The rule, and it is enforced by CONSTRUCTION rather than by discipline:
 *
 *   Every quantity a caller may JUDGE on lives in `before` or `after`, and
 *   those two are the ONLY things built by `report(metrics, parts)` — a
 *   function that cannot produce a number without being handed the parts it
 *   belongs to. `after` is built from `outParts`, so any field added to
 *   report() is delivered by construction and cannot silently fall the wrong
 *   way.
 *
 * Everything outside those two blocks is a DIAGNOSTIC of some intermediate
 * state and is named for it — `audit.rSourceTunedOhm`, not `rSourceOhm`. Two
 * fields with the same name describing different networks is this bug in its
 * smallest form, so the names are not allowed to collide.
 *
 * Notes (`ampFloorNote`, `snapNote`, `safetyNote`) are PROSE FOR A HUMAN. No
 * verdict may be derived from their text: `zOk` used to be a string match on
 * "could not be repaired", which made a ranking depend on wording written
 * three passes earlier. Pass outcomes are typed (`ampFloorRepair`) precisely
 * so nothing has to read a sentence to find out what happened.
 */
export interface NetOptimizeResult {
  /** The schematic parts with re-fitted values (locked ones untouched). */
  parts: VxpPart[];
  /** Full-grid metrics of the SEED. Same `report()` shape as `after` — it
   *  always carried these fields, the type just under-declared them, which
   *  made "measure this design without tuning it" (the scan's reference row)
   *  look impossible. */
  before: {
    rippleDb: number;
    avgDevDb?: number;
    phaseDeg: number;
    zMinOhm?: number | null;
    pairPhaseDeg?: number[];
    xoHzPairs?: (number | null)[];
    powerStdDb?: number;
    /** Source resistance at the low driver of THESE parts (the seed). */
    rSourceOhm?: number | null;
  };
  /** Full-grid metrics of the delivered network; `xoHz` = its acoustic
   *  crossing (used by the no-pin scan to derive follow-up candidates). */
  after: {
    rippleDb: number;
    /** Peak ±dB of the ERROR-SMOOTHED sum (what the search judged); equals
     *  rippleDb when smoothing is off. Display beside the raw peak. */
    ripplePeakSmoothedDb?: number;
    avgDevDb?: number;
    phaseDeg: number;
    /** Delivered minimum system |Zin| in ohms — the amplifier's view of this
     *  design. Reported (never optimised for): the safety gate only refuses a
     *  tune that WORSENS the dip, so this is the only place the absolute
     *  number becomes visible to a caller. See the amplifier-load note. */
    zMinOhm?: number;
    /** Std-dev flatness of the horizontal ENERGY AVERAGE over the band, when
     *  angle data was given (else absent) — the in-room verdict. */
    powerStdDb?: number;
    /** Smooth power metric: DI fold near the crossings (dB) and the fitted
     *  slope of the energy average (dB/decade; > +1 is suspicious). */
    powerFoldDb?: number;
    powerSlopeDbDec?: number;
    /** Rs/Re in front of the lowest branch at the level reference (fix 3a). */
    dissRatio?: number;
    /** 3-way: uniform-average phase error per adjacent pair [low, high] —
     *  the coupled-pairs verdict (gates judge the worst of these). */
    pairPhaseDeg?: number[];
    xoHz?: number | null;
    /** 3-way: the DELIVERED acoustic crossing per adjacent pair [low, high].
     *  Worth reporting on its own: a design can meet every flatness target
     *  while its handovers sit an octave off the knees that were designed —
     *  measured on Robbert's set before the candidates were caged. */
    xoHzPairs?: (number | null)[];
    /** 3-way: delivered overlap width per pair, octaves. */
    pairOverlapOct?: (number | null)[];
    /**
     * Source resistance at the low driver OF THE DELIVERED PARTS — the figure
     * every ranking judges on.
     *
     * Deliberately here and not on the audit. Gate 4 now runs last, so the gap
     * has closed to the removals of the audit pass itself plus the debris
     * sweep — but the rule stands BY CONSTRUCTION rather than by the current
     * pass order, which is the whole point: a caller must never have to know
     * which pass ran last. Measured back when the audit was frozen several
     * passes early, on Sanders 562/2270 candidate: the audit read 2.0002 Ω and
     * the row was struck through, while the network that would actually be
     * built measures 1.64 Ω — inside the 2.0 Ω limit.
     */
    rSourceOhm?: number | null;
  };
  /** How many component values were free to move (final network). */
  tuned: number;
  evaluations: number;
  /** Staged mode: partIds pruned away (series ones live on as a wire). */
  removed: string[];
  /** Staged mode: partIds of bypass capacitors added (rule 3). */
  added: string[];
  /** Catalog snap: singles-vs-stacks comparison ("bewust stapelen"). */
  /** The band the run actually optimised on — an optimiser that cannot say
   *  which band it worked on is not auditable (issue #14). */
  bandNote: string;
  /**
   * Set when a pass after the value search had to be rolled back because it
   * could not reach its goal without breaking a hard constraint (A3f).
   *
   * The design returned is the last one that DID satisfy every constraint, so
   * it is safe to look at — but it did not get what that pass was for, and a
   * ranker should treat it as disqualified rather than merely worse.
   */
  infeasible?: string;
  /**
   * Outcome of the amplifier-load repair pass, as a VALUE (A3g).
   *
   * 'none' = the delivered network never dipped far enough to need it.
   * 'lifted' = repaired. 'refused' = it could only have succeeded by breaking
   * a hard constraint, so it was rolled back (A3f). 'failed' = attempted and
   * could not reach the floor.
   *
   * Exists so no caller has to read `ampFloorNote` to find out what happened:
   * both chains used to derive `zOk` from `.includes('could not be repaired')`.
   */
  ampFloorRepair?: 'none' | 'lifted' | 'refused' | 'failed';
  snapNote?: string;
  /** Amp-load floor (system |Z| ≥ 2.5 Ω): set when the tuned result dipped
   *  below the floor — either "lifted a → b Ω" (repair accepted) or a
   *  could-not-repair warning. See the amplifier-load note. */
  ampFloorNote?: string;
  /** Set when the full-band safety gate rejected the tuned result and the
   *  seed was returned unchanged (see NetOptimizeOptions.safety). */
  safetyNote?: string;
  /**
   * WHY the safety gate rejected the tune, as VALUES — the prose in
   * `safetyNote` is for a human and must never be parsed to decide anything
   * (the A3g rule: a caller reading a sentence written three passes earlier
   * is how `zOk` came to mean four different things at once).
   *
   * Empty/absent = the tune was accepted. A rejected tune returns the SEED,
   * so `tuned` is 0 and `after` equals `before`: whoever shows these numbers
   * owes the reader that they are the seed's, not a finished design's.
   */
  safetyKinds?: SafetyKind[];
  /**
   * V33 — THE WHOLESALE REFUSAL IN ONE SHAPE, WHATEVER DID THE REFUSING.
   *
   * Until V33 there was one way for a whole tune to be thrown away — the
   * full-band safety gate — and one field to detect it by, `safetyNote`. V33
   * adds a second: an ACTIVE GATE refusing the value tune. A caller that had to
   * detect two shapes would end up asking two questions about one event, and
   * the shortlist would grow two kinds of rejection for a distinction its
   * reader does not have (`engine2/optimizer/shortlist.ts` has exactly one).
   *
   * So both paths fill this, and `by` says which rule family spoke. `kinds`
   * carries the categories the deciding rule recorded AT THE POINT OF DECISION
   * — never re-derived from `reason`, which is prose for a human (A3g).
   *
   * PRESENT ONLY ON A RUN THAT ARMED ONE OF THE TWO v2 MECHANISMS (the gate
   * hook or the rejected-tune report). Neither exists on a v1 run, so every v1
   * result object is byte-identical to what it was — the same guard
   * `rejectedTune` has carried since V31.
   *
   * `note` is the prose a caller may show. It says why the run delivers
   * nothing; `reason` is the refusing rule's own sentence. Neither is ever
   * parsed to decide anything (A3g) — `by` and `kinds` are what a caller acts
   * on.
   */
  refusal?: {
    by: 'safety-gate' | 'active-gate';
    kinds: string[];
    reason: string;
    note: string;
  };
  /**
   * V33 — where the amp-load barrier took its shortfall, or why it took none.
   *
   * Prose, for the run notes. Set whenever a caller states
   * `zFloorBarrierSource`; absent on every run that does not, which is every
   * v1 run.
   */
  zFloorSourceNote?: string;
  /**
   * V34 — where the source-resistance probe read, and at which frequency it
   * landed, or why it landed nowhere.
   *
   * Prose, for the run notes. Set whenever a caller states
   * `rSourceProbeSource`; absent on every run that does not, which is every v1
   * run. It exists because the probe's answer is only meaningful beside the
   * frequency it was taken at, and until V34 no surface said what that was:
   * casus 1 disqualified on a number read at 640.2 Hz for four openings
   * without a single line saying so.
   */
  rSourceProbeNote?: string;
  /**
   * V31 — the metrics of the tune that was REJECTED, in the same `report()`
   * shape as `after`. Present only when `rejectedTuneReport` was asked for.
   *
   * It describes a network that is NOT delivered and never will be. Naming it
   * separately from `after` is the whole point: `after` on a rejected run is
   * the seed's, and two fields with the same name describing different
   * networks is the bug this file's header is about.
   */
  rejectedTune?: NetOptimizeResult['after'];
  /**
   * V31 — the PARTS of that rejected tune, so a caller can measure it with its
   * own machinery rather than trusting a summary.
   *
   * Present only when `rejectedTuneReport` was asked for, and handed over on
   * the explicit understanding that it is not a proposal: the v2 worker reads
   * it, computes the SPL window off it, and drops it before returning, so no
   * output of a rejected candidate contains a network anyone could build.
   */
  rejectedParts?: VxpPart[];
  /** Value-window (boundToSeries) report: which series-path slots were bound
   *  to a series' range, and what the constraint cost vs an unconstrained fit. */
  valueWindowNote?: string;
  /** GATE 4 report: per part/chain the absolute deltas and verdict, plus the
   *  network-level source-resistance verdict at the low driver's tuning.
   *  INERT entries that were removed carry `applied: true`; the ids are also
   *  in `removed`. */
  audit?: NetworkAudit;
  /**
   * F2 — every polish step this run REFUSED because it would have crossed an
   * active gate (`gateViolation`), in the order they were refused.
   *
   * Evidence, not decoration: "no candidate violates an active gate" is a
   * claim about a search, and a search that never had to refuse anything has
   * not demonstrated it. Empty (and the field absent) whenever no gate hook
   * was supplied, which is every v1 run.
   */
  gateRefusals?: string[];
  /**
   * How many times the gate was actually EVALUATED, and how many questions the
   * run-scoped cache answered instead (F2b).
   *
   * Diagnostics, not a verdict — but load-bearing diagnostics: "the gate is
   * asked once per accepted step" is a claim about a search, and a claim about
   * a search needs a number. Absent on every v1 run, like the refusals.
   */
  gateEvaluations?: number;
  gateCacheHits?: number;
}

export class NetOptimizeError extends Error {}

/**
 * How many DISTINCT gate refusals a run records (F2).
 *
 * A prune sweep can refuse the same shape hundreds of times; the value of the
 * log is that a reader can see WHICH bounds bit, not how often. Distinct lines
 * only, and capped — a report nobody can read is a report nobody reads.
 */
const GATE_REFUSAL_LOG_MAX = 24;

const PARAM_OF: Record<'R' | 'L' | 'C', { name: string; factor: number }> = {
  R: { name: 'R', factor: 1 },
  L: { name: 'L', factor: 1e3 }, // schematic params store mH
  C: { name: 'C', factor: 1e6 }, // … and µF
};

/**
 * The categories the full-band safety gate can reject a tune on. Four
 * different physical failures that used to arrive at the UI as one boolean
 * called `zOk`, rendered as a "⚠Z" glyph — so a vanished crossing reported
 * itself as an impedance problem and sent the designer to the wrong panel.
 */
export type SafetyKind = 'crossing' | 'valley' | 'protection' | 'load';

/* THE AMPLIFIER-LOAD FLOOR — it used to be a constant here (2.5 Ω).
 * IT IS GONE, AND NOTHING REPLACED IT BY DEFAULT.
 *
 * The PHYSICS it guarded is real and unchanged: voltage drive makes a low-Z
 * realisation INVISIBLE to every response metric (the sim holds the voltage,
 * only the amplifier feels the current), so a shunt trap or Zobel with a small
 * R near the input can quietly buy response quality with an amp-hostile dip.
 * That is why `zMinOhm` is still measured on the evaluation grid AND the
 * safety grid, still reported in `after`, and still shown in every panel.
 *
 * What was wrong was the NUMBER. 2.5 came from one amplifier — a NAD M10 V2 —
 * calibrated against one driver set, and it was then applied to everybody. An
 * app cannot know what is on the other end of the cable: a tube amp with a
 * 4 Ω tap browns out where a Purifi module does not notice, a PA amp is
 * specified into 2 Ω all day, and a vintage receiver is not happy below 6.
 * A default here is the same assumption as a constant, only invisible — so
 * there is none, and `ampMinLoadOhm` is filled in by the person who owns the
 * amplifier or by nobody.
 *
 * Enforcement, when a value IS given, is DECISION-LEVEL ONLY: structure gates,
 * the safety gate, a locally-seeded repair retune before the snap, and the
 * ranking. Never a term in `fxOf`. That has been measured twice, both times
 * expensive: as an fx penalty the floor cost 6 dB of ripple on the
 * notch-torture net (0.065 of objective at the relevant optimum was enough to
 * reroute the deterministic simplex into another basin), and the same shape
 * under the name "constraint" cost 17° of M-T phase in A3e.
 *
 * The IEC-derived report (`loadShortOhm`, impedanceFloor.ts) is exactly that —
 * a report about what the finished design may be SOLD as. It does not
 * disqualify.
 *
 * ── ONE OPT-IN EXCEPTION, ADDED AT V30, AND IT DOES NOT REVOKE THE ABOVE ──
 *
 * "Never a term in `fxOf`" was, and remains, what this route does by DEFAULT.
 * Both measurements behind it stand. What V30 established is that the same
 * doctrine has a cost nobody had priced: a floor that only vetoes cannot
 * steer, so a caller that generates its own candidates gets a search which
 * chooses the topology and the values without ever knowing a floor exists, and
 * then one locally-seeded repair is asked to lift the result from 1 Ω to 2.6 —
 * from a point already locked into something else. Measured on casus 1: the
 * repair fired on all fifteen candidates and failed on all fifteen, and
 * thirteen came back BYTE-IDENTICAL to a run in which no floor existed.
 *
 * So `zFloorBarrier` exists, it is `false` unless a caller asks, and asking is
 * a decision that route has to be able to defend. It is not a better default
 * hiding behind an option — it is the other side of a trade, made measurable. */

/**
 * The repair barrier's weight, named rather than spelled out at its use site.
 *
 * INHERITED FROM v1, NOT DERIVED FROM ANYTHING. It was tuned for the repair
 * pass (see the note at the barrier itself: at 120 a 2.7 Ω residue cost a
 * negligible 1.2 and the repair stalled), and no measurement says it is the
 * right stiffness for a full search. A v2 run that arms `zFloorBarrier`
 * therefore carries this number into its fingerprint as a GREY VALUE with that
 * provenance attached, so a later reader can tell an inherited constant from a
 * derived one — the distinction V21, V22 and V25 were all about.
 *
 * ITS NAME IS NOT AN ACCIDENT EITHER. The obvious name used the stem of the
 * app-wide floor constant that was deleted in 18adfe4, and
 * `noAppWideFloor.test.ts` bans that stem outright — one amplifier's 2.5 Ω
 * rating became everybody's under a name of exactly that shape. The guard
 * caught this constant while it was being written, and then caught the comment
 * that explained the catch, which is what a deliberately blunt guard is for.
 * The rename is an improvement regardless: this number is a stiffness, not a
 * floor.
 */
export const AMP_FLOOR_BARRIER_WEIGHT = 1200;

/**
 * V33 — THE SYSTEM'S SHORTEST IMPEDANCE ON A GIVEN MEASURED GRID.
 *
 * Exported for one reason and it is not convenience: this is the function the
 * amp-load barrier reads its shortfall through, and a test has to be able to
 * ask it the same question the `M-B/|Z|` gate is asked, about the same netlist,
 * and get the same bits back. "Goal and limit see one number" is then a claim
 * that can be checked rather than a sentence in a commit message
 * (`frozenNetlistGates.test.ts`).
 *
 * The gate reaches the same value through `epdr`, which since V33 also takes
 * its |Z| minimum from `minImpedanceAt`. Two solves of one network on one grid
 * with one tie-break rule — no tolerance is involved anywhere, and none should
 * be: two implementations that agree to three decimals is exactly the state
 * V32 found and repaired.
 *
 * Null when the network cannot be solved. That is not a floor verdict: an
 * unsolvable network is not a network, and the constraint machinery and the
 * caller's own gate both refuse it on their own terms.
 */
export function systemMinImpedanceOhm(
  net: { nodeCount: number; elements: NetElement[] },
  grid: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
): number | null {
  try {
    return minImpedanceAt(solveNetwork(net, grid, driverZ).inputZ)?.ohm ?? null;
  } catch {
    return null;
  }
}

/** Soft buildability bounds, as in synthesis. */
const BOUNDS: Record<'C' | 'L' | 'R', [number, number]> = {
  C: [0.33e-6, 100e-6],
  L: [0.05e-3, 15e-3],
  R: [0.22, 47],
};

/** Realism CEILING for SERIES-PATH elements (both nodes on the source→driver
 *  bus). The absolute BOUNDS only say "such a component exists" — but a
 *  91 µF series capacitor into a tweeter is a wire with extra steps (0.87 Ω
 *  at 2 kHz) and only exists as an elco; the tuner parked values in the
 *  corners of the buildability box (91 µF next to the 100 µF cap — Sanders
 *  schema). Series-path parts are the signal path: film-cap territory, sane
 *  ladder impedances. Deliberately UPPER-side only: the small/starved
 *  direction is governed by the dead-branch fundamentals (valley crossing,
 *  protection, safety gate) — a low floor here would fight the starving
 *  equilibrium those guards own (hard learned: it made prune bait
 *  load-bearing in the padless test net). Shunt parts (traps, Zobels)
 *  legitimately use big elcos and keep the wide bounds. */
const SERIES_CEIL: Record<'C' | 'L' | 'R', number> = {
  C: 33e-6,
  L: 8e-3,
  R: 47,
};

/**
 * ...but a CONSTANT ceiling is wrong as soon as the crossover moves, because
 * what makes a series part "a wire with extra steps" is its reactance relative
 * to the load, and that scales as 1/(f·Z). The constants above were calibrated
 * on a 2-way tweeter branch (~2 kHz into ~6 Ω); a 3-way woofer-to-mid crossing
 * at 200–400 Hz into a 4 Ω midrange legitimately needs 4–8× more capacitance
 * for the SAME electrical job. Blanket-applied, 33 µF forbids exactly the part
 * a competent designer specifies there — Troels Gravesen ships 88 µF (4 × 22 µF
 * film) in the midrange high-pass of at least seven published 3-ways, with the
 * value tracking his woofer-mid point almost proportionally (22 µF at 900 Hz,
 * 38.6 µF at 700 Hz, 66 µF at 400 Hz, 88–99 µF at 200 Hz).
 *
 * So the ceiling scales with the design's own textbook magnitude, and the
 * multipliers below reproduce the constants above at that original 2 kHz / 6 Ω
 * reference. The constants stay as a FLOOR on the ceiling: a design whose
 * textbook value is small keeps exactly the old limit (2-way behaviour is
 * unchanged, which the suite's value pins check), and only a design that
 * genuinely needs more gets more. Upper-side only, as before.
 *
 * The C and L multipliers differ by a lot (2.5× vs 16.8×) because the original
 * constants did: a series woofer inductor is legitimately far closer to "a
 * wire" than a series capacitor ever is. That asymmetry is inherited on
 * purpose rather than tidied away.
 */
const SERIES_CEIL_MULT: Record<'C' | 'L', number> = { C: 2.488, L: 16.76 };

function seriesCeilFor(
  kind: 'C' | 'L' | 'R',
  textbook: { L: number; C: number },
): number {
  if (kind === 'R') return SERIES_CEIL.R;
  return Math.max(SERIES_CEIL[kind], SERIES_CEIL_MULT[kind] * textbook[kind]);
}

/** Reset big-side reactive OUTLIERS (> tol × textbook magnitude) to exactly
 *  textbook; returns null when nothing exceeds. Only the big side: oversized
 *  caps/coils are the arbitrary-basin signature, small values are legitimate
 *  (hot-tweeter series cap, trap elements). Locked/open/shorted parts and
 *  resistors are never touched. Exported for tests. */
export function reseedOutliers(
  parts: readonly VxpPart[],
  textbook: { L: number; C: number },
  tol = 2.2,
): VxpPart[] | null {
  let hits = 0;
  const out = parts.map((q) => {
    if (q.locked || q.open || q.shorted) return q;
    const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : null;
    if (!kind) return q;
    const u = PARAM_OF[kind];
    const par = q.params.find((p) => p.name === u.name);
    if (!par || !(par.value > 0)) return q;
    const si = par.value / u.factor;
    if (si <= textbook[kind] * tol) return q;
    hits++;
    return {
      ...q,
      params: q.params.map((p) =>
        p.name === u.name
          ? { ...p, value: Number((textbook[kind] * u.factor).toPrecision(4)) }
          : { ...p },
      ),
      wires: q.wires.map((w) => ({ ...w })),
    };
  });
  return hits > 0 ? out : null;
}

/**
 * Bus-path topology: which elements sit ON a source→driver path (series) and,
 * for those, WHICH driver they feed.
 *
 * The driver attribution is what makes a per-BRANCH budget possible: source
 * resistance, level loss and Qts damage are properties of the path into one
 * driver, not of a part in isolation. An element on a shared section (before
 * the branches split) is attributed to every driver behind it, and the caller
 * takes the strictest of those budgets.
 */
export function busTopology(parts: readonly VxpPart[]): {
  positionOf: (partId: string) => 'series' | 'shunt';
  /** Driver models this element sits in the series path of (empty = shunt or unknown). */
  driversOf: (partId: string) => string[];
} {
  const busNodes = new Set<number>();
  const elNodes = new Map<string, [number, number]>();
  /** driver model → the set of bus nodes on ITS path */
  const perDriver = new Map<string, Set<number>>();
  try {
    const { netlist } = crossoverToNetlist({ name: 'pos', parts: [...parts] });
    const els = netlist.elements;
    for (const e of els) elNodes.set(e.id, [e.nodes[0], e.nodes[1]]);
    const src = els.find((e) => e.kind === 'source');
    if (src) {
      const hot = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];
      const adj = new Map<number, Array<{ id: string; a: number; b: number }>>();
      for (const e of els) {
        if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
        for (const n of e.nodes) {
          const l = adj.get(n) ?? [];
          l.push({ id: e.id, a: e.nodes[0], b: e.nodes[1] });
          adj.set(n, l);
        }
      }
      for (const drv of els.filter((e) => e.kind === 'driver')) {
        const target = drv.nodes[0] === 0 ? drv.nodes[1] : drv.nodes[0];
        const prev = new Map<number, number>();
        const seen = new Set([hot]);
        const q: number[] = [hot];
        while (q.length > 0) {
          const n = q.shift()!;
          if (n === target) break;
          for (const g of adj.get(n) ?? []) {
            const m = g.a === n ? g.b : g.a;
            if (m === 0 || seen.has(m)) continue;
            seen.add(m);
            prev.set(m, n);
            q.push(m);
          }
        }
        if (seen.has(target)) {
          const mine = new Set<number>();
          let cur2 = target;
          busNodes.add(target);
          mine.add(target);
          while (cur2 !== hot) {
            const p2 = prev.get(cur2);
            if (p2 === undefined) break;
            busNodes.add(p2);
            mine.add(p2);
            cur2 = p2;
          }
          const model = 'model' in drv && typeof drv.model === 'string' ? drv.model : drv.id;
          perDriver.set(model, mine);
        }
      }
    }
  } catch {
    // Position stays unknown → every part is treated as shunt (wide bounds).
  }
  const positionOf = (partId: string): 'series' | 'shunt' => {
    const nodes = elNodes.get(partId);
    if (!nodes) return 'shunt';
    return busNodes.has(nodes[0]) && busNodes.has(nodes[1]) ? 'series' : 'shunt';
  };
  return {
    positionOf,
    driversOf: (partId) => {
      const nodes = elNodes.get(partId);
      if (!nodes || positionOf(partId) !== 'series') return [];
      const out: string[] = [];
      for (const [model, ns] of perDriver) {
        if (ns.has(nodes[0]) && ns.has(nodes[1])) out.push(model);
      }
      return out;
    },
  };
}

/** Bus-path position per element: BOTH nodes on a source→driver path =
 *  series-path, anything else hangs toward ground (shunt). Shared by the
 *  discrete snap (tier doctrine) and the tuner's series-path realism ceiling. */
export function busPositions(parts: readonly VxpPart[]): (partId: string) => 'series' | 'shunt' {
  return busTopology(parts).positionOf;
}

export function optimizeNetworkValues(
  parts: readonly VxpPart[],
  grid: readonly number[],
  wBase: GriddedResponse,
  tBase: GriddedResponse,
  driverZ: Record<string, readonly Complex[]>,
  adjust: TweeterAdjust,
  opts: NetOptimizeOptions = {},
): NetOptimizeResult {
  const {
    phasePriority = 0.5,
    maxIterations,
    ampTarget = 'onAxis',
    breakupGuard = false,
    phaseMetric = 'band',
    onStage,
  } = opts;
  const solo = opts.solo === true;
  /** 3-way: the middle branch (never in solo). */
  const midB = solo ? undefined : opts.midBranch;
  const midAdj: BranchAdjust = midB?.adjust ?? {};
  // Solo: directivity terms pair angle sets across BOTH drivers — with one
  // driver the pairing is empty and the power average degenerates to NaN.
  // 3-way: same reason, other direction — the pairing covers exactly two of
  // the three branches, so the power average would be silently wrong.
  // 3-way: the in-room weight needs the MID's own angle set — without it a
  // two-branch angle sum would be silently wrong, so the term stays off.
  // (Historically directivity was gated off for 3-way entirely; that made the
  // scan blind to woofer beaming — Sanders measured his woofer −3.5 dB at
  // 30°/600 Hz while the tuner happily parked the W-M handover above it.)
  const angleData = solo
    ? undefined
    : midB
      ? opts.angleData?.mid
        ? opts.angleData
        : undefined
      : opts.angleData;
  /** SOLO sensitivity budget (dB): how far the tuned network's median level
   *  may sit below the RAW driver. Same fundamental as the design engine —
   *  and needed here for the same reason: the flatness objective is
   *  LEVEL-BLIND, so "attenuate everything" scores as well as "fix the peak"
   *  (Sanders' run: −15 dB below 10 kHz, and the tuner had no reason to
   *  undo it). Decision-level only: a gate on the delivered result, never a
   *  term in the search objective (the anchor lesson). */
  const soloSensBudgetDb = Math.max(0, opts.soloSensitivityDb ?? 6);
  /** Effective cap for the solo wall/gate: the budget, or the level the SEED
   *  already spends when that is more (baffle-step compensation legitimately
   *  costs 6–10 dB). Set once the seed metrics exist; until then no wall. */
  let soloLossCap = Infinity;
  const acSlopes =
    opts.acousticSlopes &&
    (opts.acousticSlopes.mid ||
      opts.acousticSlopes.tweeter ||
      opts.acousticSlopes.low?.lower ||
      opts.acousticSlopes.low?.upper)
      ? opts.acousticSlopes
      : null;
  // Anchored envelope (see vfOptimizer): both terms always exist — a 0%
  // amplitude weight lets the tuner wreck the response the "never worse"
  // guard is supposed to protect, judged by its own degenerate objective.
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const dW = angleData ? Math.min(Math.max(opts.directivityWeight ?? 0, 0), 1) : 0;
  const powerMode: PowerMetricMode = opts.powerMetric ?? 'smooth';
  const dissW = Math.max(0, opts.dissipationWeight ?? 0.05);
  /** Hard source-resistance tier: past this a candidate is infeasible. Mirrors
   *  the ranking's disqualification so the search cannot spend its time in
   *  ground that will be thrown away. 0/null/absent = off. */
  const rsHardOhm = Math.max(0, opts.rSourceDisqualifyOhm ?? 0);
  /* ---- V34: WHERE THE SOURCE-RESISTANCE PROBE READS -------------------- *
   *
   * ONE PLACE DECIDES IT, for the same reason `ampFloorOhm` and `zFloorGoal`
   * are one place each: five consumers read this probe — the hard constraint,
   * the structure-move guard, the part audit's tier, the delivered report the
   * ranking disqualifies on, and the dissipation term in the objective — and
   * "the probe" must not be able to mean two frequencies in two of them.
   *
   * `null` is a named source whose data never arrived. It is NOT a fallback to
   * the evaluation grid: the probe then answers nothing at all, which is the
   * V32/V33 rule applied to a measurement instead of to a verdict.
   */
  const probeSource: 'grid' | 'safety' = opts.rSourceProbeSource ?? 'grid';
  const probeOn: {
    freqs: readonly number[];
    z: Record<string, readonly Complex[]>;
    edgeRule: ProbeEdgeRule;
    what: string;
  } | null =
    probeSource === 'grid'
      ? {
          freqs: grid,
          z: driverZ,
          edgeRule: 'first',
          what:
            `${grid[0].toFixed(0)}-${grid[grid.length - 1].toFixed(0)} Hz, the evaluation grid`,
        }
      : opts.safety
        ? {
            freqs: opts.safety.freqs,
            z: opts.safety.z,
            edgeRule: 'both',
            what:
              `${opts.safety.freqs[0].toFixed(0)}-` +
              `${opts.safety.freqs[opts.safety.freqs.length - 1].toFixed(0)} Hz, ` +
              `${opts.safety.freqs.length} points — the tuner's own full-band safety grid`,
          }
        : null;
  const loadNominalOhm = opts.loadFloor?.nominalOhm && opts.loadFloor.nominalOhm > 0
    ? opts.loadFloor.nominalOhm
    : null;
  /** The user's amplifier rating, or null. THE one place this file decides
   *  whether an amplifier-load floor exists at all — everything downstream
   *  asks this, so "no floor" cannot mean two different things in two
   *  passes. */
  const ampFloorOhm =
    opts.ampMinLoadOhm !== undefined && opts.ampMinLoadOhm > 0 ? opts.ampMinLoadOhm : null;
  /** Origin, quoted in every refusal: a limit whose provenance is invisible
   *  reads as a law of nature, which is exactly how 2.5 Ω survived so long. */
  const ampFloorSource = (): string =>
    `your amplifier's rated minimum load, ${ampFloorOhm!.toFixed(1)} Ω`;
  /**
   * NUMERICAL slack on the rating — explicitly not a design margin.
   *
   * A minimum is a minimum: what the designer typed is the load the amplifier
   * is rated for, so a network that lands under it has not been repaired, it
   * has been rounded past the requirement. The old allowance was a flat
   * 0.15 Ω, which let a 3.2 Ω rating ship at 3.05 Ω and call it fixed. It was
   * also absolute, so it meant 4.7 % on a 3.2 Ω amplifier and 1.9 % on an 8 Ω
   * one — one number cannot mean the same thing on both.
   *
   * 1 % of the rating instead: enough to absorb where a barrier search
   * actually stops (measured: 0.004 Ω short of 3.2), far too little to hide a
   * design that misses. Detection, acceptance and the delivered verdict all
   * read this one value, for the same reason `worstZOf` is shared — three
   * thresholds for one question is how a network gets repaired by one gate
   * and condemned by the next.
   *
   * Margin ABOVE the rating stays the designer's call, and the field is where
   * they make it: someone who wants headroom for build tolerance enters 3.5
   * rather than 3.2. Inventing that headroom here would spend response
   * quality — measured at 1.2 dB and 11° for one such lift — on a decision
   * nobody asked for.
   */
  const zSlackOhm = ampFloorOhm === null ? 0 : ampFloorSlackOhm(ampFloorOhm);
  /**
   * V30 — is the floor a SEARCH GOAL on this run, or only a veto?
   *
   * One place decides it, for the same reason `ampFloorOhm` above is one
   * place: "the floor is armed" must not be able to mean two different things
   * in two passes. A rating is required — an option without a floor arms
   * nothing, because there is nothing to be short of (P4).
   */
  const zFloorGoal = ampFloorOhm !== null && opts.zFloorBarrier === true;
  /* ---- V33: WHERE THAT GOAL IS MEASURED ------------------------------- *
   *
   * One place decides it, exactly as `zFloorGoal` above decides whether there
   * is a goal at all — and for a sharper version of the same reason. V30 and
   * V32 were both entries about one requirement being answered on two
   * different bands; V33 is the last of the three, and it is the objective's
   * turn. Since V32 the `M-B/|Z|` gate enforces the floor on the drivers' own
   * measured impedance sweeps, while this barrier read the shortfall off the
   * EVALUATION grid, whose floor is the far-field measurement span. On casus 1
   * the search therefore aimed at a minimum above 200 Hz and the gate refused
   * it for a dip at 82 Hz.
   *
   * `barrierShortOhm` is the ONLY reader of that decision, and it is the one
   * line in this file V33 changes. Every other floor reader — the repair
   * trigger, `worstZOf`, the snap target, the delivered verdict, the safety
   * gate — is deliberately untouched: they are the veto half, they were not
   * what disagreed with the gate, and V33's remit was the objective.
   */
  const barrierSource: 'grid' | 'safety' | 'sweep' = opts.zFloorBarrierSource ?? 'grid';
  /**
   * The grid the barrier reads on, when it is not the evaluation grid.
   *
   * Null means the caller named a source and did not supply it. `what` is the
   * sentence for the note — prose, never parsed.
   */
  const barrierGrid: {
    grid: readonly number[];
    driverZ: Record<string, readonly Complex[]>;
    what: string;
  } | null =
    barrierSource === 'safety'
      ? opts.safety
        ? {
            grid: opts.safety.freqs,
            driverZ: opts.safety.z,
            what:
              `${opts.safety.freqs[0].toFixed(0)}-` +
              `${opts.safety.freqs[opts.safety.freqs.length - 1].toFixed(0)} Hz, ` +
              `${opts.safety.freqs.length} points — the tuner's own full-band safety grid, the ` +
              'one every other amp-floor reader has always used',
          }
        : null
      : barrierSource === 'sweep'
        ? opts.zFloorBarrierImpedance
          ? {
              grid: opts.zFloorBarrierImpedance.grid,
              driverZ: opts.zFloorBarrierImpedance.driverZ,
              what: opts.zFloorBarrierImpedance.span,
            }
          : null
        : null;
  /**
   * The shortfall the barrier term is pulling against, from the stated source.
   *
   * On `'grid'` this is `m.zShortOhm`, i.e. exactly the expression that stood
   * here before V33 — so a caller that states nothing gets the same arithmetic
   * in the same order, and the v1 route (including the repair pass, which is a
   * v1 caller of this same term) is byte-identical.
   *
   * Otherwise it solves the network on the grid the caller named and reads the
   * minimum through `minImpedanceAt`, the SAME function `epdr` reads it
   * through. On `'sweep'` that is the gate's own reference, so goal and limit
   * are one number by construction rather than two loops that agree until
   * someone edits one of them. On `'safety'` it is the tuner's own full-band
   * grid: same reader, an extent that covers the gate's readings, a coarser
   * step — and how far that lands from the gate's number is a MEASUREMENT
   * (`frozenNetlistGates.test.ts` holds it against `ampFloorSlackOhm`) rather
   * than a hope.
   *
   * THE PRICE, MEASURED AND NOT HIDDEN, and it is why there are three values
   * and not two: the sweep grid is the analysis resolution (1600 points on
   * casus 1) against 240 for the safety grid and 96 for the evaluation grid,
   * and this runs inside the objective. On casus 1 that is a chain run of
   * eleven minutes against one.
   *
   * NO DATA, NO PULL — never a quiet fall back to the evaluation grid. That
   * would restore the very reading V32 withdrew, silently, in the one place
   * nobody looks. Zero here means the floor does not steer, which is the
   * pre-V30 state and is said out loud in `zFloorSourceNote`.
   */
  const barrierShortOhm = (
    m: { zShortOhm: number },
    net: { nodeCount: number; elements: NetElement[] },
  ): number => {
    if (barrierSource === 'grid') return m.zShortOhm;
    if (barrierGrid === null || ampFloorOhm === null) return 0;
    const ohm = systemMinImpedanceOhm(net, barrierGrid.grid, barrierGrid.driverZ);
    return ohm === null ? 0 : Math.max(0, ampFloorOhm - ohm);
  };
  /** Prose about the line above, for the run notes. Absent unless asked. */
  const zFloorSourceNote: string | undefined =
    opts.zFloorBarrierSource === undefined
      ? undefined
      : barrierSource === 'grid'
        ? 'The amp-load barrier aimed at the |Z| minimum over the EVALUATION grid, which is what ' +
          'it has always read. On a measurement set whose far-field span starts above the ' +
          'impedance minimum, that is a different band from the one M-B/|Z| enforces (V33).'
        : barrierGrid !== null
          ? `The amp-load barrier aimed at the |Z| minimum over ${barrierGrid.what}, through the ` +
            'same reader the M-B/|Z| gate takes its own minimum through. Goal and limit are ' +
            'therefore one question rather than two; where they can still differ is the grid, ' +
            'and that difference is measured against the floor slack rather than assumed away ' +
            '(V33).'
          : `The amp-load barrier was asked to aim at the "${barrierSource}" source and its data ` +
            'never reached this run, so the stated floor did not steer anything here — not the ' +
            'search, and not the repair pass, which pushes with the same term. It did NOT fall ' +
            'back to the evaluation grid: that would restore the reading V32 withdrew, and do it ' +
            'silently.';
  /* THE DC LIMIT, PRECOMPUTED. When the Thevenin probe has no usable frequency
   * — the low driver's impedance peak lies below the grid, which is the normal
   * case for a woofer measured from 200 Hz — the audit falls back to the
   * series-path resistance, and the constraint has to use the same fallback or
   * it is inert exactly where it is needed.
   *
   * The PATH is fixed for the whole tune (values move, topology does not), so
   * it is resolved once here; per evaluation this is a lookup and a sum. That
   * matters: seriesPathResistanceOhm rebuilds the netlist, which is far too
   * expensive for a hot loop. */
  const seriesPathIds = (() => {
    if (rsHardOhm <= 0) return null;
    try {
      const bus = busTopology(parts);
      const { netlist } = crossoverToNetlist({ name: 'rs', parts: [...parts] });
      const drivers = netlist.elements.filter(
        (e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver',
      );
      const slots = pickSlotsN(drivers);
      const low = (slots.woofer ?? slots.mid ?? slots.tweeter)?.model ?? null;
      if (!low) return null;
      const ids = new Set<string>();
      for (const q of parts) {
        if (q.partId && bus.driversOf(q.partId).includes(low)) ids.add(q.partId);
      }
      return ids;
    } catch {
      return null;
    }
  })();
  /**
   * V34 — WHERE THE PROBE ACTUALLY LANDED, AS PROSE.
   *
   * Computed once, from the SEED: the probe index depends on the grid and on
   * the low driver's own impedance, neither of which a value tune moves, so
   * this is a fact about the run rather than about a network.
   *
   * It says the frequency out loud on purpose. The reading is only meaningful
   * beside it — measured at V34, the three casus-1 baselines score 0.50/0.47/
   * 0.68 Ω at the chain grid's probe and 3.98/4.59/2.55 Ω at the woofer's real
   * impedance peak, against a limit of 2.0 Ω. A surface that prints the ohms
   * and not the hertz is printing half a sentence.
   */
  const rSourceProbeNote: string | undefined = (() => {
    if (opts.rSourceProbeSource === undefined) return undefined;
    if (probeOn === null) {
      return (
        `The source-resistance probe was asked to read the "${probeSource}" grid and its data ` +
        'never reached this run, so nothing was probed: the dissipation term is out, the ' +
        'disqualification cannot fire, and the delivered report carries no source resistance. It ' +
        'did NOT fall back to the evaluation grid — that is the reading V34 withdrew (casebook ' +
        'V32, V33, V34).'
      );
    }
    const where = `The source-resistance probe read over ${probeOn.what}`;
    const low = (() => {
      try {
        const { netlist } = crossoverToNetlist({ name: 'probe', parts: [...parts] });
        const drivers = netlist.elements.filter(
          (e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver',
        );
        const slots = pickSlotsN(drivers);
        return (slots.woofer ?? slots.mid ?? slots.tweeter)?.model ?? null;
      } catch {
        return null;
      }
    })();
    const zl = low ? probeOn.z[low] : undefined;
    if (!low || !zl) {
      return `${where}, but this network has no low driver with impedance data, so it read nothing.`;
    }
    const p = sourceProbeIndex(probeOn.freqs, zl, opts.audit?.fbHz, probeOn.edgeRule);
    if (!p || !p.inBand) {
      return (
        `${where} and found no usable frequency for ${low}` +
        (p ? ` — the peak it found sits on a boundary of its own search window ` +
             `(${probeOn.freqs[p.idx].toFixed(1)} Hz), which is a boundary and not a resonance` : '') +
        '. The run therefore used the series-path DC limit, which is a LOWER bound: it may ' +
        'condemn a design but never exonerate one.'
      );
    }
    return (
      `${where} and probed ${low} at ${probeOn.freqs[p.idx].toFixed(1)} Hz` +
      (opts.audit?.fbHz && opts.audit.fbHz > 0
        ? ' (the stated box tuning).'
        : ' (its impedance peak — no box tuning was stated, so the probe took the peak; on a ' +
          'ported box that is a peak beside the tuning and not the tuning itself).')
    );
  })();

  /**
   * THE HARD CONSTRAINT, IN ONE PLACE (A3f).
   *
   * The value search already refuses to enter forbidden ground, but the passes
   * that run AFTER it can walk back into it — the amplifier-floor repair RAISES
   * resistance to lift an impedance dip, and the catalog snap picks real parts
   * whose DCR is whatever the catalogue stocks. Two passes turning the same
   * knob in opposite directions, with no shared bound, is the arrangement that
   * creates the problem.
   *
   * So the bound lives here and every pass that can move it asks THIS function.
   * The same lesson as the >= / > slip one level up: not a value re-tested in
   * several places, but one definition everything has to go through.
   *
   * When both goals cannot hold at once the candidate is INFEASIBLE, and that
   * is an honest answer. What may not happen is a pass silently choosing one of
   * the two.
   */
  /** Source resistance the way the constraint and the ranking must both read
   *  it: on the parts handed over, with the audit's fbHz so the two cannot
   *  drift apart — and since V34 on the grid `probeOn` names, for the same
   *  reason. A named source without data answers null, never the old grid. */
  const rSourceOf = (ps: readonly VxpPart[]): number | null =>
    probeOn === null
      ? null
      : sourceResistanceOhm(ps, {
          grid: probeOn.freqs,
          driverZ: probeOn.z,
          fbHz: opts.audit?.fbHz,
          edgeRule: probeOn.edgeRule,
        });

  /**
   * F2 / A3 — THE GATE BOUND, asked at every acceptance point.
   *
   * One rule, one place, exactly like `constraintViolation` above and for the
   * same reason: a bound re-tested in several places with slightly different
   * words is how a network came to be repaired and struck through in the same
   * run. This one delegates the actual evaluation to the caller's hook, so
   * the metric library stays the single source of a gate verdict (A4/F1) and
   * this file stays engine-agnostic.
   *
   * WITHOUT A HOOK IT IS A NO-OP AND NOTHING BELOW EVEN ASKS: every call site
   * is guarded on `opts.gateViolation` being present, so a v1 run walks the
   * identical path it always did.
   */
  const gateRefusals: string[] = [];
  /**
   * THE RUN-SCOPED GATE CACHE.
   *
   * A gate verdict is a pure function of (parts, gate config, frozen
   * reference, measurement set). Within ONE run the last three are constant by
   * construction — the caller freezes the reference before the tune and cannot
   * change the config half-way — so the parts array alone identifies the
   * answer, and the passes ask about the same shapes repeatedly.
   *
   * RUN-SCOPED, AND THAT IS THE WHOLE DESIGN. The map is created here, inside
   * the call, and dies with it. A module-level cache would survive into the
   * next run, where the reference and the limits are different objects — which
   * is precisely the "gate answers for the wrong network" failure this engine
   * has already paid for elsewhere. It would also make the run fingerprint
   * depend on cache invalidation, and a reproducibility claim that rests on
   * remembering to clear a map is not a claim.
   */
  const gateCache = new Map<string, string | null>();
  let gateEvaluations = 0;
  let gateCacheHits = 0;
  /**
   * THE ONLY PLACE THE GATE HOOK IS CALLED. Everything that wants a verdict —
   * the accept points, and `constraintViolation`'s backstop — comes through
   * here, so the cache and the counters describe the whole run rather than the
   * part of it someone remembered to route.
   *
   * (This was not true when the cache was first written: the backstop still
   * asked the hook directly, which showed up immediately as one evaluation
   * more than the counter admitted to. The counting test found it, which is
   * what a counting test is for.)
   */
  const cachedGateViolation = (ps: readonly VxpPart[], step: string): string | null => {
    if (!opts.gateViolation) return null;
    const key = partsKey(ps);
    const hit = gateCache.has(key);
    let why: string | null;
    if (hit) {
      why = gateCache.get(key)!;
      gateCacheHits++;
    } else {
      why = opts.gateViolation(ps);
      gateCache.set(key, why);
      gateEvaluations++;
    }
    opts.onGateEvaluated?.({ step, cached: hit });
    return why;
  };
  const gateRefusal = (ps: readonly VxpPart[], step: string): string | null => {
    const why = cachedGateViolation(ps, step);
    if (why === null) return null;
    const line = `${step} refused: ${why}`;
    // Bounded: a prune sweep can refuse the same shape hundreds of times and a
    // report nobody can read is a report nobody reads.
    if (gateRefusals.length < GATE_REFUSAL_LOG_MAX && !gateRefusals.includes(line)) {
      gateRefusals.push(line);
    }
    return why;
  };
  /** True when this network may be accepted — the positive form, for guards. */
  const gateOk = (ps: readonly VxpPart[], step: string): boolean =>
    gateRefusal(ps, step) === null;

  const constraintViolation = (ps: readonly VxpPart[]): string | null => {
    // The gate first: it is the hard requirement the designer stated, and a
    // pass that is about to be rolled back should say WHICH bound stopped it.
    // Only ever consulted when a hook was supplied, so v1 is untouched.
    {
      const g = cachedGateViolation(ps, 'constraint backstop');
      if (g) return g;
    }
    if (rsHardOhm > 0) {
      const rs = rSourceOf(ps);
      if (rs !== null && rs >= rsHardOhm) {
        return (
          `source resistance at the low driver ${rs.toFixed(2)} Ω ≥ the ${rsHardOhm.toFixed(1)} Ω ` +
          `limit — this design is infeasible, not merely worse`
        );
      }
    }
    /* The load floor, checked on the FULL grid and the safety grid — a narrow
     * dip outside a zoomed view range reaches the amplifier all the same
     * (the BandScope 'disqualification' rule). */
    if (loadNominalOhm) {
      const worst = loadShortOf(ps);
      if (worst && worst.shortOhm > 0) {
        return (
          `the load falls to ${worst.minOhm.toFixed(2)} Ω at ${Math.round(worst.atHz)} Hz, against a ` +
          `floor of ${worst.floorOhm.toFixed(2)} Ω there (${loadNominalOhm} Ω nominal, IEC 60268-5) — ` +
          `this design is infeasible, not merely worse`
        );
      }
    }
    return null;
  };

  /** Worst breach of the derived floor on the parts given, over the full grid
   *  and the safety grid. */
  const loadShortOf = (
    ps: readonly VxpPart[],
  ): { shortOhm: number; atHz: number; minOhm: number; floorOhm: number } | null => {
    if (!loadNominalOhm) return null;
    let out = { shortOhm: 0, atHz: 0, minOhm: Infinity, floorOhm: 0 };
    const scan = (freqs: readonly number[], zz: Record<string, readonly Complex[]>) => {
      const fl = floorFor(freqs);
      if (!fl) return;
      try {
        const { netlist } = crossoverToNetlist({ name: 'load', parts: [...ps] });
        const sol = solveNetwork(netlist, freqs, zz);
        for (let i = 0; i < freqs.length; i++) {
          const zm = Math.hypot(sol.inputZ[i].re, sol.inputZ[i].im);
          const d = fl[i] - zm;
          if (d > out.shortOhm) out = { shortOhm: d, atHz: freqs[i], minOhm: zm, floorOhm: fl[i] };
        }
      } catch {
        /* unsolvable: other guards report that */
      }
    };
    scan(grid, driverZ);
    if (opts.safety) scan(opts.safety.freqs, opts.safety.z);
    return out;
  };

  const dcSeriesR = (net: { elements: NetElement[] }): number | null => {
    if (!seriesPathIds) return null;
    let sum = 0;
    for (const e of net.elements) {
      if (!seriesPathIds.has(e.id)) continue;
      // R contributes its value; L contributes its DCR. A capacitor is an open
      // circuit at DC and contributes nothing.
      if (e.kind === 'R') sum += e.value;
      else if (e.kind === 'L') sum += e.seriesR ?? 0;
    }
    return sum;
  };
  const dissRefHz: number | null = opts.audit?.fbHz && opts.audit.fbHz > 0 ? opts.audit.fbHz : null;
  /**
   * Source-resistance limit at the low driver (Ω) — shared with the audit.
   *
   * Three states since V34, and the middle one is new: a stated number, an
   * explicit `null` (the designer stated no tier, so nothing is judged by one
   * — P4), and absent, which is the app's historical default and keeps every
   * v1 run reading what it always read. 0 here means "no tier" the way it
   * always did.
   */
  const rSourceLimit =
    opts.audit?.thresholds?.rSourceOhm === null
      ? 0
      : (opts.audit?.thresholds?.rSourceOhm ?? DEFAULT_R_SOURCE_TIER_OHM);
  const foldW = Math.max(0, opts.powerFoldWeight ?? 0.5);
  const useLw = ampTarget === 'listeningWindow' && !!angleData;
  const band: [number, number] = opts.band ?? [grid[0] * 1.02, grid[grid.length - 1] * 0.975];

  // Decimated evaluation grid (inner loop); full grid for reported metrics.
  const step = Math.max(1, Math.floor(grid.length / 150));
  const idx: number[] = [];
  for (let i = 0; i < grid.length; i += step) idx.push(i);
  const pick = (g: GriddedResponse): GriddedResponse => ({
    freq: idx.map((i) => g.freq[i]),
    spl: idx.map((i) => g.spl[i]),
    phaseDeg: idx.map((i) => g.phaseDeg[i]),
  });
  // Error smoothing BEFORE decimation (see errorSmoothOct): magnitudes only,
  // search grid only — fullM/after/safety keep the raw responses.
  const errSm = Math.max(0, opts.errorSmoothOct ?? 1 / 12);
  const smoothMag = (g: GriddedResponse): GriddedResponse =>
    errSm > 0 ? { ...g, spl: smoothDbGaussian(g.freq, g.spl, errSm) } : g;
  const optW = pick(smoothMag(wBase));
  const optT = pick(smoothMag(tBase));
  const optM = midB ? pick(smoothMag(midB.response)) : null;
  /** Full-grid middle branch for the report/gate call sites. */
  const midFull = midB ? midB.response : null;
  const optZ = Object.fromEntries(
    Object.entries(driverZ).map(([m, z]) => [m, idx.map((i) => z[i])]),
  );
  const pickAngles = (set: AngleResponse[]): AngleResponse[] =>
    set.map((a) => ({ hor: a.hor, response: pick(smoothMag(a.response)) }));
  const optAngles = angleData
    ? {
        woofer: pickAngles(angleData.woofer),
        tweeter: pickAngles(angleData.tweeter),
        ...(angleData.mid ? { mid: pickAngles(angleData.mid) } : {}),
      }
    : null;

  /* ---- Band statistics. The canonical implementations live in
   * bandMetrics.ts and every engine should use them — EXCEPT the two helpers
   * below that sit in this tuner's inner loop.
   *
   * `bandStd` IS the two-way search objective. It computes the variance the
   * one-pass way (E[x²] − E[x]²) where bandMetrics uses the two-pass form;
   * the results agree mathematically but not bit-for-bit, and this optimizer
   * is a deterministic simplex through a multimodal landscape — the anchor
   * lesson (see the amplifier-load note) is that ANY perturbation, however small, reroutes
   * the search into a different basin. Swapping it for cosmetic sharing would
   * risk real, unmeasured quality changes across every existing two-way
   * design. It stays until there is a reason to change it, and then it gets
   * measured. Report-only helpers may be shared freely; the solo engine and
   * the display already are. ---- */
  const bandStd = (freq: readonly number[], spl: readonly number[]): number => {
    let s = 0;
    let sq = 0;
    let n = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      s += spl[i];
      sq += spl[i] * spl[i];
      n++;
    }
    const mean = s / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  };

  /** Mean |deviation| vs the band mean — the whole-range verdict number the
   *  chain ranking judges on (Sanders doctrine, jul 2026: one narrow dip must
   *  not decide the winner). Reported alongside the peak; never fed to the
   *  search objective (the anchor lesson — the objective keeps bandStd). */
  const bandAvgDev = (freq: readonly number[], spl: readonly number[]): number => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      s += spl[i];
      n++;
    }
    if (n === 0) return 0;
    const mean = s / n;
    let acc = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      acc += Math.abs(spl[i] - mean);
    }
    return acc / n;
  };

  /** Median level over the band — reference for the SOLO sensitivity budget.
   *  Shared implementation (bandMetrics.ts): solo-only, so no risk to the
   *  two-way search path. */
  const medianOf = (freq: readonly number[], spl: readonly number[]): number =>
    bandMedian(freq, spl, band);

  /** SOLO: the RAW driver's median level (no network) — the reference the
   *  sensitivity budget is measured against. The silent ghost sits at −400 dB,
   *  so the per-point max IS the real driver. */
  const rawMedianRef = solo
    ? medianOf(grid, wBase.spl.map((v, i) => Math.max(v, tBase.spl[i])))
    : 0;

  /** Peak flatness = ±(max−min)/2 over the band — the SAME number the SPL
   *  strip reads (combinedRippleDb), the unit staged TARGETS gate on and
   *  before/after report. The search objective keeps the smooth std-dev
   *  (bandStd); a peak/max objective would be non-smooth and outlier-driven. */
  const bandPeak = (freq: readonly number[], spl: readonly number[]): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      if (spl[i] < lo) lo = spl[i];
      if (spl[i] > hi) hi = spl[i];
    }
    return Number.isFinite(lo) && hi > lo ? (hi - lo) / 2 : 0;
  };

  let evaluations = 0;
  /**
   * THE STAGE LABEL every heartbeat is reported under.
   *
   * TODO(observability): THREE THINGS, ONE SESSION. Together they make a long
   * healthy run indistinguishable from a hang, and at F2b that cost four
   * smoke-test attempts and two confident wrong diagnoses (casebook V17).
   *
   *  (a) THE LABEL LIES DURING THE VALUE TUNE. `stage('value tune')` runs
   *      BEFORE the seed audit; `runAudit` then sets the label to
   *      "part audit (seed)" and nothing restores it. Every heartbeat for the
   *      whole value tune — the longest stage there is on a large three-way —
   *      therefore reports the audit. The UI renders faithfully what it is
   *      handed; this is the engine telling it the wrong thing.
   *
   *  (b) THE HEARTBEAT GOES SILENT DURING THE AUDIT. `auditNetwork` does its
   *      own full-grid solves without passing through `tick()`, so the sim
   *      counter freezes exactly where a reader most wants proof of life.
   *
   *  (c) FOR THE SESSION THAT FIXES THIS, so it knows what it may touch:
   *      · give label TRANSITIONS their own test — the labels must appear in
   *        the order the passes actually run, which is the property that broke
   *        here and which no existing test looks at;
   *      · and assert explicitly that PROGRESS MESSAGES ARE NOT PART OF THE
   *        RESULT BYTE-INVARIANT. `toggleRegression` compares the serialised
   *        RESULT; `onStage` output is not in it. Writing that down as an
   *        assert is what lets the fix change labels and heartbeats freely
   *        without anyone having to re-derive whether the invariant allows it.
   *
   * NOT FIXED AT F2b on purpose: this is shared v1 progress code, and F2b
   * promised to leave that alone.
   */
  let stageLabel = 'value tune';
  const stage = (label: string) => {
    stageLabel = label;
    onStage?.(label, evaluations);
  };
  /**
   * The proof-of-life heartbeat: one progress message every 2000 objective
   * evaluations, plus one at every stage switch. See TODO(observability) at
   * `stageLabel` for the two ways this goes quiet or misleading, and for what
   * the session that fixes it is allowed to touch.
   */
  const tick = () => {
    evaluations++;
    if (evaluations % 2000 === 0) onStage?.(stageLabel, evaluations);
  };
  /* The derived load floor, per grid. metricsOn runs on three different grids
   * (evaluation, full, safety) and the floor is frequency-dependent, so it is
   * resolved per grid and memoised on the array identity — the grids are stable
   * objects, and recomputing a pow() per point per evaluation is not free. */
  const floorCache = new WeakMap<readonly number[], number[]>();
  const floorFor = (freqs: readonly number[]): number[] | null => {
    if (!loadNominalOhm) return null;
    const hit = floorCache.get(freqs);
    if (hit) return hit;
    const curve = floorCurve(freqs, loadNominalOhm, opts.loadFloor?.shape);
    floorCache.set(freqs, curve.floorOhm);
    return curve.floorOhm;
  };

  const metricsOn = (
    net: { nodeCount: number; elements: NetElement[] },
    freqs: readonly number[],
    w: GriddedResponse,
    t: GriddedResponse,
    m: GriddedResponse | null,
    z: Record<string, readonly Complex[]>,
    angles: { woofer: AngleResponse[]; tweeter: AngleResponse[]; mid?: AngleResponse[] } | null,
  ): {
    /** Std-dev flatness — the smooth term the SEARCH objective minimizes. */
    rippleDb: number;
    /** Peak ±dB over the band — what the strip reads, targets gate on and
     *  before/after report. Never fed to the search objective. */
    ripplePeakDb: number;
    /** Mean |deviation| of the on-axis combined vs the band mean — the
     *  whole-range verdict for the chain ranking. Report-only. */
    avgDevDb: number;
    phaseDeg: number;
    phaseP95Deg: number;
    powerStdDb: number | null;
    /** Smooth mode: fold of the detrended power response near the crossings
     *  (max |residual|, dB); slope of the fitted trend, dB/decade. */
    powerFoldDb: number | null;
    powerSlopeDbDec: number | null;
    leakSqDb: number;
    protSqDb: number;
    /** Acoustic crossing of the filtered drivers (Hz), null if none.
     *  3-way: the LOWEST pair's crossing (xoHzPairs carries all). */
    xoHz: number | null;
    /** Per-adjacent-pair crossings, low pair first (1 entry in 2-way). */
    xoHzPairs: (number | null)[];
    /** Repair-only continuous pin barrier (see xoEdgeSq); zeros otherwise. */
    xoEdgeSq: number[];
    /** Measured slopes beside each pair's crossing (same order). */
    pairSlopes: { lower: number | null; upper: number | null }[];
    /** Uniform-average phase error PER pair — the coupled-pairs gate reads
     *  the WORST of these (solo: empty). */
    pairPhaseDeg: number[];
    /** Mean squared corridor excess over the branch targets (0 without
     *  targets, and 0 for any tune that stays inside the corridor). */
    corridorSq: number;
    /** Phase-coherent overlap width PER pair, octaves (integration bandwidth
     *  — the same number the pair chips show). Reported so the chain can put
     *  it in front of the designer: a W-M handover 3.2 octaves wide means
     *  both cones carry the midrange together, which no on-axis number
     *  reveals. */
    pairOverlapOct: (number | null)[];
    /** How far the combined SPL at the crossing sits BELOW the band mean
     *  (dB, beyond a 6 dB allowance). A healthy crossing meets ON level; a
     *  starved branch "crosses" the other one deep in a hole instead. */
    xoDipDb: number;
    midSlopeDbOct: number | null;
    tweeterSlopeDbOct: number | null;
    /** Minimum system |Zin| over the band (amplifier load). */
    zMinOhm: number;
    /** How far that minimum sits BELOW the amp-load floor (0 when healthy). */
    zShortOhm: number;
    /** How far below the DERIVED (IEC, driver-based) floor the load falls;
     *  0 when clear or when no nominal was supplied. See metricsOn. */
    loadShortOhm: number;
    /** MEDIAN combined level over the band — the reference for the SOLO
     *  sensitivity budget. Median so a deep narrow notch doesn't read as lost
     *  sensitivity while broad attenuation does. */
    medianDb: number;
    /** Source resistance in front of the LOWEST branch over its Re at the
     *  level-reference frequency (dissipation ratio); null when unknown. */
    dissRatio: number | null;
    /** The same probe's Thevenin resistance in ohms — what the ranking
     *  disqualifies on. Null when it could not be measured. */
    rSourceOhm: number | null;
  } => {
    const sol = solveNetwork(net, freqs, z);
    // Dissipation ratio of the LOWEST branch (fix 3a): Rs/Re at the level
    // reference — one extra 1-frequency solve per evaluation.
    let dissRatio: number | null = null;
    let rSourceOhm: number | null = null;
    /* R_SOURCE IS A CONSTRAINT, NOT A WEIGHT (A3e).
     *
     * Above the hard tier a candidate is INFEASIBLE: the ranking throws it away
     * afterwards anyway, so letting the search wander there only wastes the
     * search — and worse, it lets the tuner "improve" its way into a design
     * that will be discarded. Rejecting it during the search costs nothing and
     * keeps the feasible region and the acceptable region the same shape.
     *
     * This is not a new objective term and does not collide with the anchor
     * lesson: inside the limit it contributes EXACTLY zero, so the search path
     * through healthy ground is untouched. Outside it returns a large value
     * that still slopes back toward feasibility, so a simplex that steps out
     * can climb back rather than getting stuck on a plateau.
     *
     * And it is always answerable, unlike an acoustic criterion: R_source is
     * computed FROM THE NETWORK — no gate, no validity band, no noise floor.
     * It is exactly known at every frequency the network is solved at, which is
     * why this one can be a constraint while a flatness bound could not. */
    const needRs = dissW > 0 || rsHardOhm > 0;
    if (needRs) {
      const lowDrv = (() => {
        const slots = pickSlotsN(sol.drivers);
        return slots.woofer ?? slots.mid ?? slots.tweeter ?? null;
      })();
      /* V34 — the probe reads the grid `probeOn` names, which on the v2 route is
       * NOT the grid this metric is being computed on. That is the point: the
       * response numbers around it belong to `freqs`, and the source resistance
       * at the low driver's tuning belongs to a frequency `freqs` usually does
       * not contain. On `'grid'` these are the same arrays and the same edge
       * rule, so the arithmetic below is the pre-V34 arithmetic in the
       * pre-V34 order. */
      const pFreqs = probeOn ? probeOn.freqs : freqs;
      const pZ = probeOn ? probeOn.z : z;
      const pZl = probeOn && lowDrv ? pZ[lowDrv.model] : undefined;
      const pEdge: ProbeEdgeRule = probeOn ? probeOn.edgeRule : 'first';
      /* `probeOn === null` is a named source whose data never arrived, and then
       * NOTHING is probed — not even the DC limit. The run reports that in
       * `rSourceProbeNote` rather than substituting a number from a grid the
       * caller withdrew. */
      if (probeOn && lowDrv && pZl) {
        /* ISSUE #14. This used to take the grid point NEAREST fbHz with no
         * check that fbHz was inside the grid at all. On Sander's set the port
         * is tuned to 31 Hz and the view range starts at 200, so every
         * candidate was probed at grid[0] = 210 Hz — which on his woofer
         * low-pass is the parallel resonance of L1 ‖ C2 (237 Hz). The
         * dissipation term was being evaluated on the filter's own resonance.
         *
         * `sourceProbeIndex` refuses a tuning frequency that lies outside the
         * grid, and here the honest response to that refusal is to DROP the
         * term: a weight applied at an arbitrary frequency is worse than a
         * weight not applied. dissRatio stays null and fxOf adds nothing. */
        const probe = sourceProbeIndex(pFreqs, pZl, dissRefHz ?? undefined, pEdge);
        if (probe && probe.inBand) {
          const k = probe.idx;
          const re = Math.max(0.5, pZl[k].re);
          const zs = seenImpedance(
            net,
            [lowDrv.id],
            lowDrv.nodes,
            [pFreqs[k]],
            sliceDriverZ(pZ, [k]),
          );
          if (zs) {
            rSourceOhm = Math.max(0, zs[0].re);
            if (dissW > 0) dissRatio = rSourceOhm / re;
          }
        }
        // Same fallback as the audit: the DC limit is a LOWER bound on the real
        // source resistance, so it may condemn but never exonerate.
        if (rSourceOhm === null) rSourceOhm = dcSeriesR(net);
      }
    }
    const hFor = (model: string) => {
      const d = sol.drivers.find((x) => x.model === model);
      return d ? sol.transfers[d.id] : null;
    };
    // 3-way: resolve the three branch transfers by SLOT over the solved
    // drivers (canonical woofer/mid/tweeter and real model names both work;
    // ambiguous names were refused upstream). 2-way keeps the historical
    // exact-name lookup byte-for-byte.
    let hW: readonly Complex[] | null;
    let hT: readonly Complex[] | null;
    let hM: readonly Complex[] | null = null;
    if (m) {
      const slots = pickSlotsN(sol.drivers);
      hW = slots.woofer ? sol.transfers[slots.woofer.id] ?? null : null;
      hM = slots.mid ? sol.transfers[slots.mid.id] ?? null : null;
      hT = slots.tweeter ? sol.transfers[slots.tweeter.id] ?? null : null;
    } else {
      hW = hFor('mid');
      hT = hFor('tweeter');
    }
    const wF = hW ? applyTransfer(w, hW) : w;
    const tF = hT ? applyTransfer(t, hT) : t;
    const mF = m ? (hM ? applyTransfer(m, hM) : m) : null;

    // Branch-target corridor (see opts.branchTargets). Interpolated in log-f
    // because this evaluates on decimated and safety grids too; a NaN
    // neighbour masks the point.
    let corridorSq = 0;
    const bt = opts.branchTargets;
    if (bt) {
      const CORRIDOR_DB = 3;
      const at = (vals: readonly number[] | undefined, f: number): number | null => {
        if (!vals) return null;
        const fr = bt.freq;
        if (f < fr[0] || f > fr[fr.length - 1]) return null;
        let lo = 0;
        let hi = fr.length - 1;
        while (hi - lo > 1) {
          const mid2 = (lo + hi) >> 1;
          if (fr[mid2] <= f) lo = mid2;
          else hi = mid2;
        }
        const a1 = vals[lo];
        const a2v = vals[hi];
        if (!Number.isFinite(a1) || !Number.isFinite(a2v)) return null;
        const u = Math.log(f / fr[lo]) / Math.log(fr[hi] / fr[lo] || 2);
        return a1 + (a2v - a1) * (Number.isFinite(u) ? u : 0);
      };
      const one = (resp: GriddedResponse | null, vals: readonly number[] | undefined) => {
        if (!resp || !vals) return;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < freqs.length; i++) {
          const tv = at(vals, freqs[i]);
          if (tv === null) continue;
          const dev = Math.abs(resp.spl[i] - tv) - CORRIDOR_DB;
          if (dev > 0) sum += dev * dev;
          n++;
        }
        if (n > 0) corridorSq += sum / n;
      };
      one(wF, bt.low);
      one(mF, bt.mid);
      one(tF, bt.high);
    }

    // 2-way: the classic pairwise combine (byte-identical path). 3-way: the
    // three-branch sum via the N-way core; the ADJACENT pairs each get their
    // own integration so the phase metric judges both overlap windows.
    let rFreq: readonly number[];
    let rCombinedSpl: number[];
    let integList: ReturnType<typeof computeIntegration>[];
    // Adjusted branches for the pair list (3-way) — combineN returns them.
    let bW: GriddedResponse | null = null;
    let bM: GriddedResponse | null = null;
    let bT: GriddedResponse | null = null;
    if (mF) {
      const n3 = combineN([
        { response: wF },
        { response: mF, adjust: midAdj },
        { response: tF, adjust },
      ]);
      rFreq = wF.freq;
      rCombinedSpl = n3.combinedSpl;
      bW = n3.branches[0];
      bM = n3.branches[1];
      bT = n3.branches[2];
      const zeroAdj: TweeterAdjust = { offsetMm: 0, trimDb: 0, inverted: false };
      integList = [
        computeIntegration(combine(bW, bM, zeroAdj)),
        computeIntegration(combine(bM, bT, zeroAdj)),
      ];
    } else {
      const r2 = combine(wF, tF, adjust);
      rFreq = r2.freq;
      rCombinedSpl = r2.combinedSpl;
      integList = [computeIntegration(r2)];
    }
    const r = { freq: rFreq, combinedSpl: rCombinedSpl };
    // Both phase metrics (see vfOptimizer): weighted classic and the panel's
    // uniform avg + bucket-P95 — 3-way sums the pairs' overlap windows.
    let wSum = 0;
    let eSum = 0;
    let uSum = 0;
    let uN = 0;
    const buckets = new Array<number>(181).fill(0);
    // Per-pair uniform averages ride along: the pairs are COUPLED through the
    // shared mid branch (a woofer-mid move shifts the mid's SPL and thereby
    // the mid-tweeter crossing — Sanders' observation), and an AVERAGED
    // metric would let the tuner trade one crossing against the other
    // invisibly. The gates below judge the WORST pair; the search objective
    // keeps the average (the anchor lesson: no objective perturbation).
    const pairPhaseDeg: number[] = [];
    for (const integ of integList) {
      let pSum = 0;
      let pN = 0;
      for (const pt of integ.points) {
        if (pt.cls === null) continue;
        wSum += pt.weight;
        eSum += pt.weight * pt.phaseErrorDeg;
        uSum += pt.phaseErrorDeg;
        uN++;
        pSum += pt.phaseErrorDeg;
        pN++;
        buckets[Math.min(180, Math.round(pt.phaseErrorDeg))]++;
      }
      pairPhaseDeg.push(pN > 0 ? pSum / pN : 180);
    }
    let phaseP95Deg = 180;
    if (uN > 0) {
      const need = Math.ceil(0.95 * uN);
      let acc = 0;
      for (let d = 0; d <= 180; d++) {
        acc += buckets[d];
        if (acc >= need) {
          phaseP95Deg = d;
          break;
        }
      }
    }

    // Directivity terms — the same transfers at every measured angle, exactly
    // like the design optimizer judges. 3-way: the three-branch per-angle sum
    // (the computeDirectivityN semantics), each branch with its own transfer
    // and adjust; a directivity STEP at a handover — the beaming woofer
    // handing to a still-wide mid — shows up here as energy-average wobble
    // even when the on-axis sum is dead flat.
    let powerStdDb: number | null = null;
    let powerDbArr: number[] | null = null;
    let lwStd: number | null = null;
    if (angles) {
      const n = r.freq.length;
      const shared = angles.woofer
        .map((a) => a.hor)
        .filter(
          (h) =>
            angles.tweeter.some((tt) => tt.hor === h) &&
            (!mF || !angles.mid || angles.mid.some((mm) => mm.hor === h)),
        );
      const powerAcc = new Array<number>(n).fill(0);
      const lwAcc = new Array<number>(n).fill(0);
      let lwCount = 0;
      for (const hor of shared) {
        let aw = angles.woofer.find((x) => x.hor === hor)!.response;
        let at = angles.tweeter.find((x) => x.hor === hor)!.response;
        if (hW) aw = applyTransfer(aw, hW);
        if (hT) at = applyTransfer(at, hT);
        let spl: number[];
        if (mF && angles.mid) {
          let am = angles.mid.find((x) => x.hor === hor)!.response;
          if (hM) am = applyTransfer(am, hM as Complex[]);
          spl = combineN([
            { response: aw },
            { response: am, adjust: midAdj },
            { response: at, adjust },
          ]).combinedSpl;
        } else {
          spl = combine(aw, at, adjust).combinedSpl;
        }
        for (let i = 0; i < n; i++) powerAcc[i] += 10 ** (spl[i] / 10);
        if (hor <= 30) {
          for (let i = 0; i < n; i++) lwAcc[i] += 10 ** (spl[i] / 10);
          lwCount++;
        }
      }
      powerDbArr = powerAcc.map((v) => 10 * Math.log10(v / shared.length));
      powerStdDb = bandStd(r.freq, powerDbArr);
      if (lwCount > 0) {
        lwStd = bandStd(r.freq, lwAcc.map((v) => 10 * Math.log10(v / lwCount)));
      }
    }

    let targetStd = useLw && lwStd !== null ? lwStd : bandStd(r.freq, r.combinedSpl);
    // Solo floor mode: the amplitude term is RMS deviation from the FIXED
    // target level — bandStd is level-invariant and would erase the level
    // goal the design stage just met (see soloTargetLevelDb).
    if (solo && opts.soloTargetLevelDb !== undefined) {
      let sq = 0;
      let n = 0;
      for (let i = 0; i < r.freq.length; i++) {
        if (r.freq[i] < band[0] || r.freq[i] > band[1]) continue;
        const dd = r.combinedSpl[i] - opts.soloTargetLevelDb;
        sq += dd * dd;
        n++;
      }
      targetStd = n > 0 ? Math.sqrt(sq / n) : targetStd;
    }
    // SOLO — PEAK-AWARE amplitude term. HARD LEARNED (Sanders, twice: "de piek
    // bij 7 kHz wordt niet aangepakt"): RMS flatness barely notices a narrow
    // resonance — a 20 dB breakup spike covers a few percent of the band, so
    // std hardly moves — yet it is the first thing a designer sees and hears.
    // The design stage trapped the 12W8524 breakup to 108 dB; the value tune
    // then let it drift back to 116 and the catalog snap to 125, both while
    // "improving" their own metric. Blending the worst POSITIVE excursion into
    // the solo amplitude term makes every downstream stage — tune, prune,
    // shrink ladder, snap — defend what the design stage won. Solo only: the
    // two-way objective is untouched (its breakup guard covers this case).
    if (solo) {
      const vals: number[] = [];
      for (let i = 0; i < r.freq.length; i++) {
        if (r.freq[i] >= band[0] && r.freq[i] <= band[1]) vals.push(r.combinedSpl[i]);
      }
      if (vals.length > 0) {
        const ref =
          opts.soloTargetLevelDb ??
          [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
        let over = 0;
        for (const v of vals) over = Math.max(over, v - ref);
        targetStd = Math.sqrt(targetStd * targetStd + 0.35 * over * over);
      }
    }

    /* ---- ADJACENT DRIVER PAIR metrics ---------------------------------
     * Everything below — the acoustic crossing, the valley check, the
     * acoustic slopes, the breakup guard and the upper driver's protection —
     * is a property of ONE ADJACENT PAIR of drivers, not of the design as a
     * whole. Making that explicit is what lets one tuner serve every
     * topology: solo has 0 pairs (all of it vanishes), a 2-way has 1, a 3-way
     * will have 2 and simply iterates. Until the sim itself is N-way the list
     * holds at most one entry, and with exactly one pair the arithmetic is
     * unchanged — the determinism tests pin that.
     * ------------------------------------------------------------------- */
    interface DriverPair {
      /** Lower driver: filtered response + its electrical transfer. */
      lower: GriddedResponse;
      /** Upper driver — the one that needs protecting below the crossing. */
      upper: GriddedResponse;
      upperH: readonly Complex[] | null;
      /** Target acoustic slopes beside this crossing, if any. */
      slopeLower?: number;
      slopeUpper?: number;
    }
    const pairs: DriverPair[] = solo
      ? []
      : bW && bM && bT
        ? [
            // Low pair: its own slope targets (acousticSlopes.low); the
            // mid/tweeter fields keep steering the TOP pair.
            {
              lower: bW,
              upper: bM,
              upperH: hM,
              slopeLower: acSlopes?.low?.lower,
              slopeUpper: acSlopes?.low?.upper,
            },
            {
              lower: bM,
              upper: bT,
              upperH: hT,
              slopeLower: acSlopes?.mid,
              slopeUpper: acSlopes?.tweeter,
            },
          ]
        : [
            {
              lower: wF,
              upper: tF,
              upperH: hT,
              slopeLower: acSlopes?.mid,
              slopeUpper: acSlopes?.tweeter,
            },
          ];

    const fitSlope = (spl: readonly number[], lo: number, hi: number): number | null => {
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < r.freq.length; i++) {
        const f = r.freq[i];
        if (f < lo || f > hi) continue;
        const x = Math.log2(f);
        n++;
        sx += x;
        sy += spl[i];
        sxx += x * x;
        sxy += x * spl[i];
      }
      if (n < 4) return null;
      return (n * sxy - sx * sy) / (n * sxx - sx * sx);
    };

    /** All crossing-anchored numbers for one pair. */
    const pairMetrics = (p: DriverPair) => {
      // Where the filtered drivers meet — anchor for the guard and protection.
      let xi = -1;
      for (let i = 1; i < r.freq.length; i++) {
        if (p.lower.spl[i] - p.upper.spl[i] <= 0) {
          xi = i;
          break;
        }
      }
      const xoF = xi > 0 ? r.freq[xi] : null;

      // FUNDAMENTAL — the crossing must not sit in a VALLEY. A starved branch
      // still "crosses" the other one, but deep in a hole between the lower
      // driver's rolloff and the upper one's late entry (Sanders 0.68 µF cap:
      // crossing at 6.7 kHz with the mid ~25 dB down, and every
      // crossing-anchored guard looked exactly there and saw nothing wrong).
      // A valley has HIGHER combined level on BOTH sides of the crossing; a
      // mere level STEP (hot unpadded tweeter) is higher on one side only and
      // is already priced by ripple — a global reference (band mean/P90)
      // cannot tell the two apart and walls off the tuner's own escape path
      // (hard learned in this guard's first two cuts). 6 dB is free room (BW3
      // crossings, driver ripple); beyond that the crossing is a dead spot.
      let xoDipDb = 0;
      if (xi > 0) {
        const xoHzV = r.freq[xi];
        let maxLo = -Infinity;
        let maxHi = -Infinity;
        for (let i = 0; i < r.freq.length; i++) {
          const f = r.freq[i];
          if (f >= xoHzV / 4 && f <= xoHzV / 1.3) maxLo = Math.max(maxLo, r.combinedSpl[i]);
          else if (f >= xoHzV * 1.3 && f <= xoHzV * 4) maxHi = Math.max(maxHi, r.combinedSpl[i]);
        }
        if (Number.isFinite(maxLo) && Number.isFinite(maxHi)) {
          xoDipDb = Math.max(0, Math.min(maxLo, maxHi) - r.combinedSpl[xi] - 6);
        }
      }

      // Measured acoustic slopes beside the crossing (only when targeted).
      let lowerSlopeDbOct: number | null = null;
      let upperSlopeDbOct: number | null = null;
      if (acSlopes && xoF !== null) {
        if (p.slopeLower) lowerSlopeDbOct = fitSlope(p.lower.spl, xoF * 1.15, xoF * 2.2);
        if (p.slopeUpper) upperSlopeDbOct = fitSlope(p.upper.spl, xoF / 2.2, xoF / 1.15);
      }

      // Breakup guard — same definition as the design optimizer.
      let leakSqDb = 0;
      if (breakupGuard && xoF !== null) {
        let acc = 0;
        let n = 0;
        for (let i = 0; i < r.freq.length; i++) {
          const f = r.freq[i];
          let margin: number | null = null;
          if (f >= xoF * 1.6 && f <= xoF * 4) margin = r.combinedSpl[i] - p.lower.spl[i];
          else if (f >= xoF / 4 && f <= xoF / 1.6) margin = r.combinedSpl[i] - p.upper.spl[i];
          if (margin !== null) {
            const d = Math.max(0, 20 - margin);
            acc += d * d;
            n++;
          }
        }
        leakSqDb = n ? acc / n : 0;
      }

      // FUNDAMENTAL — upper-driver protection (always on): electrical drive at
      // and below crossing/3 stays ≤ −15 dB, whatever the shape metric prefers.
      let protSqDb = 0;
      if (p.upperH && xoF !== null) {
        let acc = 0;
        let n = 0;
        for (let i = 0; i < r.freq.length; i++) {
          if (r.freq[i] > xoF / 3) continue;
          const mag = 20 * Math.log10(Math.hypot(p.upperH[i].re, p.upperH[i].im) || 1e-9);
          const d = Math.max(0, mag + 15);
          acc += d * d;
          n++;
        }
        protSqDb = n ? acc / n : 0;
      }
      return { xoF, xoDipDb, lowerSlopeDbOct, upperSlopeDbOct, leakSqDb, protSqDb };
    };

    // Aggregate over the pairs. With one pair these are that pair's values
    // (bit-identical to the hardcoded version); with none they are the
    // neutral values solo mode needs; with two a 3-way simply sums the
    // squared-deficit terms and reports the lowest crossing first.
    const pm = pairs.map(pairMetrics);
    /* HARD-PIN repair only — a CONTINUOUS companion to the xoF pin. xoF is a
     * grid crossing: piecewise-CONSTANT in the component values, so on its
     * plateaus the stiff barrier has no gradient and the warm-seeded repair
     * simplex settles back on flatness (measured: pinned ≤575 Hz, repair
     * delivered 705 and gave up). The smooth equivalent of "the crossing sits
     * inside [lo, hi]": at hi the upper driver has already caught the lower
     * one, at lo it has not yet — both are plain dB differences, continuous
     * in every value. Zeros everywhere outside repair mode (bit-compat). */
    const xoEdgeSq = pairs.map((p, k) => {
      if (!opts.xoPinHard) return 0;
      const rge = opts.xoRangePairs?.[k];
      if (!rge) return 0;
      const idxAt = (f: number): number => {
        let best = 0;
        for (let i = 1; i < r.freq.length; i++) {
          if (Math.abs(r.freq[i] - f) < Math.abs(r.freq[best] - f)) best = i;
        }
        return best;
      };
      let acc = 0;
      const iHi = idxAt(rge[1]);
      if (p.lower.spl[iHi] > -300 && p.upper.spl[iHi] > -300) {
        acc += Math.max(0, p.lower.spl[iHi] - p.upper.spl[iHi]) ** 2;
      }
      const iLo = idxAt(rge[0]);
      if (p.lower.spl[iLo] > -300 && p.upper.spl[iLo] > -300) {
        acc += Math.max(0, p.upper.spl[iLo] - p.lower.spl[iLo]) ** 2;
      }
      return acc;
    });
    const xoF = pm.length > 0 ? pm[0].xoF : null;
    // Power-response SHAPE (aug 2026): the crossover owns the SMOOTHNESS of
    // the energy average, not its slope — detrend, judge the residual and the
    // fold near each crossing, report the slope. 'legacy' keeps std-of-raw.
    let powerFoldDb: number | null = null;
    let powerSlopeDbDec: number | null = null;
    if (powerDbArr && powerMode === 'smooth') {
      const shp = powerShape(r.freq, powerDbArr, band, pm.map((x) => x.xoF));
      powerStdDb = shp.residualStdDb;
      powerFoldDb = shp.foldDb;
      powerSlopeDbDec = shp.slopeDbPerDecade;
    } else if (powerDbArr) {
      powerSlopeDbDec = powerShape(r.freq, powerDbArr, band).slopeDbPerDecade;
    }
    const xoDipDb = pm.reduce((a, x) => a + x.xoDipDb, 0);
    const leakSqDb = pm.reduce((a, x) => a + x.leakSqDb, 0);
    const protSqDb = pm.reduce((a, x) => a + x.protSqDb, 0);
    // The slope targets ride on the LAST pair (mid/tweeter vocabulary) — with
    // one pair that is pm[0], unchanged.
    const midSlopeDbOct = pm.length > 0 ? pm[pm.length - 1].lowerSlopeDbOct : null;
    const tweeterSlopeDbOct = pm.length > 0 ? pm[pm.length - 1].upperSlopeDbOct : null;

    // The delivered load: ALWAYS measured and reported (voltage drive hides a
    // low-Z realisation from every response metric, so a number nobody
    // computes is a number nobody can see). Whether it DECIDES anything is a
    // separate question, and the answer is `ampFloorOhm` — no rating given,
    // no shortfall, and every gate below it goes inert by arithmetic.
    let zMinOhm = Infinity;
    for (const c of sol.inputZ) {
      const zm = Math.hypot(c.re, c.im);
      if (zm < zMinOhm) zMinOhm = zm;
    }
    const zShortOhm = ampFloorOhm === null ? 0 : Math.max(0, ampFloorOhm - zMinOhm);
    /* A3i-2 — THE DERIVED FLOOR, ALONGSIDE THE AMPLIFIER RATING, NOT INSTEAD.
     *
     * Two different things, so two names (the A3g rule). `ampMinLoadOhm` is
     * what the user's amplifier is rated for: the repair target, and the only
     * thing that decides. `loadShortOhm` is a FEASIBILITY line derived from
     * the drivers and IEC 60268-5 — 80 % of the nominal those drivers can
     * support, relaxed above 1 kHz because the limit is on CURRENT and
     * programme voltage falls there (impedanceFloor.ts).
     *
     * They can disagree in both directions and that is fine: the first says
     * "this load is under what the amplifier is rated for", the second says
     * "this design cannot be sold as any standard impedance". Collapsing them
     * would make one of the two answers unavailable — and the second one
     * REPORTS, it does not disqualify. */
    const floorOnGrid = floorFor(freqs);
    let loadShortOhm = 0;
    if (floorOnGrid) {
      for (let i = 0; i < sol.inputZ.length && i < floorOnGrid.length; i++) {
        const d = floorOnGrid[i] - Math.hypot(sol.inputZ[i].re, sol.inputZ[i].im);
        if (d > loadShortOhm) loadShortOhm = d;
      }
    }

    return {
      rippleDb: targetStd,
      ripplePeakDb: bandPeak(r.freq, r.combinedSpl),
      avgDevDb: bandAvgDev(r.freq, r.combinedSpl),
      // Solo: relative phase against a silent ghost is noise — report 0 so
      // every phase gate (staged target, barrier) passes trivially and the
      // %-based fx gates keep their meaning (a constant 180° term would
      // swamp them).
      phaseDeg: solo
        ? 0
        : phaseMetric === 'band' ? (uN > 0 ? uSum / uN : 180) : wSum > 0 ? eSum / wSum : 180,
      phaseP95Deg: solo ? 0 : phaseP95Deg,
      powerStdDb,
      powerFoldDb,
      powerSlopeDbDec,
      leakSqDb,
      protSqDb,
      xoHz: xoF,
      xoHzPairs: pm.map((x) => x.xoF),
      xoEdgeSq,
      pairSlopes: pm.map((x) => ({ lower: x.lowerSlopeDbOct, upper: x.upperSlopeDbOct })),
      pairPhaseDeg: solo ? [] : pairPhaseDeg,
      pairOverlapOct: solo ? [] : integList.map((ig) => ig.bandwidth?.octaves ?? null),
      corridorSq,
      xoDipDb,
      midSlopeDbOct,
      tweeterSlopeDbOct,
      zMinOhm,
      zShortOhm,
      loadShortOhm,
      medianDb: medianOf(r.freq, r.combinedSpl),
      dissRatio,
      rSourceOhm,
    };
  };

  type Metrics = ReturnType<typeof metricsOn>;
  // Same acoustic-crossing pin as the design optimizer: quadratic in octaves
  // outside the range. FUNDAMENTAL (always on, pin or no pin): filtered
  // branches that never cross = a starved/dead branch — and with xoHz null
  // the breakup guard AND the tweeter-protection anchor silently sit at 0,
  // so without this term the degenerate state escapes every guard at once
  // (Sanders schema: 0.68 µF series cap, tweeter ~25 dB down, no alarm).
  const xoR = opts.xoRange ?? null;
  const xoPenaltyFor = (xoHz: number | null, range: [number, number] | null): number => {
    if (xoHz == null) return 120; // no crossing at all ≙ 2 octaves off
    if (!range) return 0;
    const oct =
      xoHz < range[0]
        ? Math.log2(range[0] / xoHz)
        : xoHz > range[1]
          ? Math.log2(xoHz / range[1])
          : 0;
    // HARD-PIN repair mode (see opts.xoPinHard): a stiff barrier weight, the
    // Z-floor-repair lesson — the quadratic is weak near the boundary, and at
    // the soft weight a 0.15-oct escape costs ~0.7 while buying real flatness
    // (measured: Sanders' 400 ± 175 pin delivered a 636 Hz crossing). Only the
    // locally-seeded repair pass sets this; the normal tune's search path
    // stays untouched (the anchor lesson).
    if (opts.xoPinHard) return 1200 * oct * oct;
    // ADAPTIVE weight, mirrored from vfOptimizer: wide pins keep the classic
    // 30·oct², narrow SCAN slices scale up (×(0.15 oct / half-width)², cap
    // ×100) so a candidate cannot cheaply drift into a neighbour's slice.
    const halfOct = Math.log2(range[1] / range[0]) / 2;
    const scale = Math.min(100, Math.max(1, (0.15 / Math.max(halfOct, 1e-6)) ** 2));
    return 30 * scale * oct * oct;
  };
  const fxOf = (m: Metrics): number => {
    const amp =
      dW > 0 && m.powerStdDb !== null
        ? (1 - dW) * m.rippleDb ** 2 +
          dW * (m.powerStdDb ** 2 + (m.powerFoldDb !== null ? foldW * m.powerFoldDb ** 2 : 0))
        : m.rippleDb ** 2;
    // Solo ("0 driver pairs"): flatness of the branch is the whole story —
    // every crossing-anchored term is pair-defined and the phase metric is 0
    // by construction. A constant no-crossing penalty (120) would poison the
    // %-based decision gates (challenge 1%, prune 10%, ladder 1%), so the
    // solo objective is exactly the amplitude term. The amp-load floor stays
    // decision-level (gates + repair pass), same as the two-driver path.
    if (solo) return 2 * amp;
    const phase =
      (m.phaseDeg / 15) ** 2 +
      (phaseMetric === 'band' ? 0.5 * (m.phaseP95Deg / 45) ** 2 : 0);
    let slopePen = 0;
    if (acSlopes) {
      const one = (measured: number | null, target?: number) => {
        if (!target || measured == null) return;
        const d = (Math.abs(measured) - target) / 6;
        slopePen += d < 0 ? 2.5 * d * d : 0.4 * d * d;
      };
      // Per pair: the LAST pair carries the mid/tweeter targets (2-way: the
      // only pair — identical arithmetic); earlier pairs carry `low`.
      const nPairs = m.pairSlopes.length;
      for (let pi = 0; pi < nPairs; pi++) {
        const sl = m.pairSlopes[pi];
        if (pi === nPairs - 1) {
          one(sl.lower, acSlopes.mid);
          one(sl.upper, acSlopes.tweeter);
        } else {
          one(sl.lower, acSlopes.low?.lower);
          one(sl.upper, acSlopes.low?.upper);
        }
      }
    }
    return (
      2 * (1 - p) * amp +
      2 * p * phase +
      (breakupGuard ? 0.02 * m.leakSqDb : 0) +
      0.02 * m.protSqDb +
      // Dead-spot crossing (always on): a 19 dB-deep crossing hole costs
      // ~180 — dominant, as it should be; a healthy design pays 0.
      // NB: the amp-load floor is deliberately NOT here (see the note above fxOf) —
      // it lives in the gates and the repair pass, never in the objective.
      0.5 * m.xoDipDb * m.xoDipDb +
      // Branch-target corridor (0 without targets and for any in-corridor
      // tune; see branchTargets). 2·(dev beyond ±3 dB)² per masked point —
      // measured at 0.5 the amp term simply bought its way out (a 6.7 dB
      // branch departure survived on the pad-less test net); at 2 a 2 dB
      // excess costs ~2.4 (comparable to typical amp/phase gains) and a
      // rebuild-scale 10 dB excess ~60 — decisive. Phase alignment and
      // ±3 dB of trim stay exactly free.
      2 * m.corridorSq +
      m.xoHzPairs.reduce(
        (a: number, x, i) => a + xoPenaltyFor(x, opts.xoRangePairs?.[i] ?? xoR),
        0,
      ) +
      // Physics floors (fix 2): a delivered crossing under its floor pays a
      // stiff barrier — the floor is a bound, not a preference.
      m.xoHzPairs.reduce((a: number, x, i) => {
        const fl = opts.xoFloorPairs?.[i];
        if (x == null || fl == null || !(fl > 0) || x >= fl) return a;
        const oct = Math.log2(fl / x);
        return a + 1200 * oct * oct;
      }, 0) +
      // Repair mode: the continuous window-edge barrier (see xoEdgeSq) —
      // 3 dB short at an edge costs 180, dominant. Zero outside repair.
      (opts.xoPinHard ? 20 * m.xoEdgeSq.reduce((a: number, v: number) => a + v, 0) : 0) +
      slopePen +
      // Dissipation in front of the lowest branch (fix 3a): soft, (Rs/Re)².
      /* An UNMEASURABLE dissipation ratio adds nothing — the term drops out
       * rather than scoring zero. That is only sound because availability is a
       * property of the RUN and not of the candidate: it depends on (grid,
       * fbHz), both fixed across a scan, so the missing term is a constant
       * offset shared by every candidate. Were it ever to vary per candidate,
       * the ones that cannot be probed would collect a free bonus and the
       * ranking would be comparing different objectives. netOptimizer.test.ts
       * pins this by requiring an unprobeable run to be identical to one with
       * the weight switched off. */
      (dissW > 0 && m.dissRatio !== null ? dissW * m.dissRatio * m.dissRatio : 0)
      /* ⚠ NOTHING ELSE GOES HERE. Two constraint walls used to sit at this
       * spot — R_source (A3e) and the derived load floor (A3i-2) — and they
       * were REVERTED after a measurement, not after an argument.
       *
       * BISECTED ON SANDERS THREE-WAY SET, one candidate, everything else
       * held fixed:
       *
       *     ec00d7c (before)      25 parts  ±1.54 dB  W-M  5.5°  M-T 10.6°
       *     5b0e4e8 (A3d)         25 parts  ±1.54 dB  W-M  5.5°  M-T 10.6°
       *     28f3b9f (A3e)         24 parts  ±2.54 dB  W-M 18.3°  M-T 27.5°
       *     HEAD                  24 parts  ±2.54 dB  W-M 18.3°  M-T 27.5°
       *     HEAD, wall disabled   25 parts  ±1.54 dB  W-M  5.5°  M-T 10.6°
       *
       * The wall alone cost 17° of mid-to-tweeter phase and a full dB of
       * flatness, and switching it off at HEAD restored the earlier result
       * exactly. Everything committed after A3e changed nothing on this task.
       *
       * AND THE REASON IS GENERAL, not something about source resistance.
       *
       * ANY hard wall in a gradient-free search behaves this way whenever the
       * search can begin outside the allowed region. The forbidden ground is a
       * plateau whose only gradient is the overshoot itself, so the simplex
       * carries no information about the objective while it is there: it
       * wanders until it escapes and then lands in whichever basin it happened
       * to reach. The wall does not merely forbid, it DELETES the landscape it
       * covers.
       *
       * "Exactly zero inside the limit" is true and beside the point, and that
       * is the part worth remembering — it is the sentence that made both of
       * these look safe. A term that contributes nothing inside the allowed
       * region is still decisive if the search does not start there, and a
       * seeded optimiser usually does not.
       *
       * So a constraint is not a safer kind of objective term. It is the same
       * thing with a different name, and calling it a constraint is what let it
       * past the rule.
       *
       * And the lesson was already written, forty lines above this one, in the
       * amplifier-load note: enforcement is DECISION-LEVEL ONLY, because an
       * always-on fx penalty had been tried and reverted once before, for the
       * same reason, at a cost of 6 dB. I put the same shape back anyway, and
       * A3i-2 copied it. Hard limits belong in the ranking and in the
       * post-search gates, where they refuse a result without steering the
       * path that produces it. */
    );
  };

  /** Phase number the STAGED gates judge: the WORST pair in 3-way (coupled
   *  pairs must both meet the target — averaging would let one crossing pay
   *  for the other), the classic metric with one pair (bit-compatible). */
  const phaseGate = (m: Metrics): number =>
    m.pairPhaseDeg.length > 1 ? Math.max(...m.pairPhaseDeg) : m.phaseDeg;

  const cloneParts = (ps: readonly VxpPart[]): VxpPart[] =>
    ps.map((q) => ({
      ...q,
      params: q.params.map((par) => ({ ...par })),
      wires: q.wires.map((w) => ({ ...w })),
    }));

  /** Netlist + the free (unlocked R/L/C) elements for a parts array. Open and
   *  shorted parts emit no elements, so structure variants come for free. */
  const buildWork = (ps: readonly VxpPart[]) => {
    const { netlist } = crossoverToNetlist({ name: 'net-opt', parts: [...ps] });
    const locked = new Set(ps.filter((q) => q.locked).map((q) => q.partId));
    const work = { nodeCount: netlist.nodeCount, elements: netlist.elements.map((e) => ({ ...e })) };
    const free = work.elements.filter(
      (e): e is PassiveElement =>
        (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') && !locked.has(e.id),
    );
    return { work, free };
  };

  /** One objective evaluation of a parts array as-is (no value tuning). */
  const quickFx = (ps: readonly VxpPart[]): number => {
    const { work } = buildWork(ps);
    tick();
    return fxOf(metricsOn(work, optW.freq, optW, optT, optM, optZ, optAngles));
  };
  /** Same evaluation, but keeping the impedance minimum the metrics already
   *  computed. The catalog snap needs it and a second solve would be pure
   *  waste. */
  /** Value window for a slot (log10 SI): SERIES-PATH slots of a bound kind are
   *  clamped to that series' value range (boundToSeries). null = no window, use
   *  the soft buildability bounds. Applied to the FIT so the network adapts. */
  const boundSeriesWindow = (
    kind: 'C' | 'L' | 'R',
    isSeries: boolean,
  ): [number, number] | null => {
    const sp = opts.snapPrefs;
    if (!sp?.boundToSeries || !isSeries) return null;
    const sid = sp.seriesByKind?.[kind];
    if (!sid || sid === 'auto') return null;
    const range = seriesValueRange(sid, kind);
    if (!range || !(range[0] > 0) || range[1] <= range[0]) return null;
    return [Math.log10(range[0]), Math.log10(range[1])];
  };

  interface TuneOut {
    parts: VxpPart[];
    freeCount: number;
    fx: number;
    metrics: Metrics;
  }

  /** Nelder-Mead value re-fit of a parts array; never worse than its seed.
   *  With `barrier` (staged mode) exceeding the targets is punished hard, so
   *  the fit stays inside the goal region whenever one is reachable —
   *  without it the blended objective happily trades ripple past the target
   *  for phase the targets never asked for. */
  const tune = (
    ps: readonly VxpPart[],
    budgetScale = 1,
    barrier: { rippleDb: number; phaseDeg: number } | null = null,
    applyWindow = true,
    /** Amp-load floor barrier. Two callers now, and the DEFAULT is what
     *  changed at V30: it used to be a literal `false` (the objective stayed
     *  clean unless the repair pass asked), and it is now `zFloorGoal` — the
     *  run-level decision made once beside `ampFloorOhm`. With the option
     *  absent `zFloorGoal` is false and this is the same default it always
     *  was. The repair pass still passes `true` explicitly. */
    zFloorBarrier = zFloorGoal,
    /** True for the amp-load REPAIR pass and for nothing else.
     *
     *  Separated from `zFloorBarrier` at V30, because until then the two were
     *  the same thing and two behaviours were quietly keyed on that: the
     *  corridor cancellation below, and the block-coordinate refinement
     *  further down. Both were measured FOR the repair — a local retune from
     *  an already-good point — and neither was ever a statement about a search
     *  that has the floor in its objective. Keeping them on `zFloorBarrier`
     *  would have made "the floor is a goal" silently also mean "the corridor
     *  stops counting and the deep polish is skipped", which is two more
     *  changes than anyone asked for. */
    zFloorRepairPass = false,
  ): TuneOut => {
    const { work, free } = buildWork(ps);
    if (free.length === 0) {
      const m = metricsOn(work, optW.freq, optW, optT, optM, optZ, optAngles);
      return { parts: cloneParts(ps), freeCount: 0, fx: fxOf(m), metrics: m };
    }
    // Realism anchor: per element the effective soft window = buildability
    // bounds, with the CEILING tightened for series-path parts (position via
    // the same bus BFS the snap's tier doctrine uses). A bound series (value
    // window) REPLACES the soft window with a HARD clamp to the series' range.
    const posOf = busPositions(ps);
    const win = free.map((e) =>
      applyWindow ? boundSeriesWindow(e.kind, posOf(e.id) === 'series') : null,
    );
    const hard = win.map((w) => w !== null);
    const winLo = free.map((e, i) => (win[i] ? win[i]![0] : Math.log10(BOUNDS[e.kind][0])));
    const winHi = free.map((e, i) =>
      win[i]
        ? win[i]![1]
        : Math.log10(
            posOf(e.id) === 'series'
              ? Math.min(seriesCeilFor(e.kind, textbook), BOUNDS[e.kind][1])
              : BOUNDS[e.kind][1],
          ),
    );
    /* A5d.6 — THE SEARCH BOX IS THE INTERSECTION.
     *
     * "Optimalisatiegrenzen = bestaande app-grenzen ∩ meetafgeleide
     * budgetgrenzen." A budget ceiling never widens the box (a budget cannot
     * license a component the app already considers unbuildable) and it turns
     * the slot HARD, because a budget bound is a box constraint and not a
     * preference: clamped, never penalised out. Absent = the loop below does
     * nothing and every number above stands as it did. */
    if (opts.valueCeilings) {
      for (let i = 0; i < free.length; i++) {
        const ceil = opts.valueCeilings[free[i].id];
        if (ceil === undefined || !(ceil > 0)) continue;
        const lg = Math.log10(ceil);
        if (lg < winHi[i]) {
          winHi[i] = Math.max(lg, winLo[i]);
          hard[i] = true;
        }
      }
    }
    /* The SUM ceilings (A5d.6's "max totale serie-R in het laagste pad").
     *
     * Enforced by projection rather than by a penalty: when the free members
     * would together exceed what the budget allows, they are scaled down
     * proportionally before the network is solved, so no point the search
     * ever evaluates lies outside the set. `fixedSI` is the part of the sum
     * this tuner cannot move — a locked resistor, a coil's DCR — and it comes
     * off the top, so an already-spent budget leaves nothing rather than
     * quietly allowing more. */
    const sumGroups = (opts.valueSumCeilings ?? [])
      .map((g) => ({
        ...g,
        idx: free.map((e, i) => (g.ids.includes(e.id) ? i : -1)).filter((i) => i >= 0),
      }))
      .filter((g) => g.idx.length > 0);
    const projectSums = (): void => {
      for (const g of sumGroups) {
        const room = g.maxSI - (g.fixedSI ?? 0);
        let total = 0;
        for (const i of g.idx) total += free[i].value;
        if (room <= 0) {
          for (const i of g.idx) free[i].value = 10 ** winLo[i];
          continue;
        }
        if (total <= room || total <= 0) continue;
        const k = room / total;
        for (const i of g.idx) free[i].value = Math.max(free[i].value * k, 10 ** winLo[i]);
      }
    };
    // The barrier must not SPEND fundamentals: capture the seed's tweeter
    // protection so target-chasing cannot buy ripple with resonance drive
    // (measured: barrier weight 120 vs protection price 0.02 tripled the
    // protSqDb — the escalation gate then rightly refused every candidate).
    let protRef = Infinity;
    if (barrier) {
      try {
        protRef = metricsOn(work, optW.freq, optW, optT, optM, optZ, optAngles).protSqDb + 0.5;
      } catch {
        protRef = Infinity;
      }
    }
    const objective = (logVals: readonly number[]): number => {
      tick();
      let penalty = 0;
      for (let i = 0; i < free.length; i++) {
        if (hard[i]) {
          // Value window = a true box constraint: clamp, never penalise out.
          free[i].value = 10 ** Math.min(Math.max(logVals[i], winLo[i]), winHi[i]);
        } else {
          free[i].value = 10 ** logVals[i];
          if (logVals[i] < winLo[i]) penalty += (winLo[i] - logVals[i]) ** 2;
          else if (logVals[i] > winHi[i]) penalty += (logVals[i] - winHi[i]) ** 2;
        }
      }
      projectSums();
      let m;
      try {
        m = metricsOn(work, optW.freq, optW, optT, optM, optZ, optAngles);
      } catch {
        return 1e9;
      }
      let barr = 0;
      if (barrier) {
        // 8% margin absorbs the decimated-vs-full-grid metric offset (the
        // acceptance check runs on the full grid); the heavy weight keeps a
        // small fx gain from buying a target violation. Barrier tunes are
        // always seeded from an already-good point, so the cliffs are safe.
        const exR = Math.max(0, m.ripplePeakDb - barrier.rippleDb * 0.92);
        const exP = Math.max(0, (m.phaseDeg - barrier.phaseDeg * 0.92) / 15);
        barr = 120 * (exR * exR + exP * exP) + 4 * Math.max(0, m.protSqDb - protRef);
      }
      // SOLO sensitivity wall. Exactly ZERO inside the cap, so the search path
      // through the healthy region is untouched (the same argument that makes
      // the buildability windows safe) — it only walls off the region where
      // "flatness" means "attenuate everything". Without it the tuner walks
      // out of bounds on real drivers and the final gate throws the whole tune
      // away, handing back seed values (measured on Robbert's 12W8524:
      // rejected at 12.6 dB and 20 dB loss).
      // The cap is SEED-RELATIVE (see soloLossCap): a design that deliberately
      // spends level — baffle-step compensation on a woofer is exactly that,
      // and Sanders' own manual 12W8524 filter spends ~10 dB — keeps its own
      // level as the reference. The wall stops the tuner from spending MORE,
      // it never second-guesses the designer's starting point.
      if (solo) {
        const over = Math.max(0, rawMedianRef - m.medianDb - soloLossCap);
        if (over > 0) barr += 200 * over * over;
      }
      if (zFloorBarrier) {
        // Locally-seeded repair barrier (the proven target-barrier pattern):
        // pulls the dip up to the floor, from a point that is already good.
        // Stiff on purpose — the quadratic is weak near the floor (a 2.7 Ω
        // residue at weight 120 cost a negligible 1.2 and the repair stalled
        // there; the gate then rejected the whole tune anyway).
        // ampFloorOhm is non-null whenever this barrier is armed, and that
        // is enforced in ONE place rather than assumed here: `zFloorGoal`
        // requires a rating, and the repair pass — the other caller — runs
        // only when there is one.
        barr += AMP_FLOOR_BARRIER_WEIGHT * (barrierShortOhm(m, work) / ampFloorOhm!) ** 2;
        // THE HIERARCHY: the amplifier floor is non-negotiable, branch
        // fidelity yields to it. With the corridor still counting, the
        // repair paid corridor tax on exactly the branch shifts the lift
        // needs — measured on Sanders' set (low crossings, three branches
        // crowding 1–2.5 kHz): every candidate's repair failed, every tune
        // was rejected wholesale, and the scan shipped nine raw seeds with
        // 4.4–6.6 dB ripple and 0.1–2.0 Ω minima. The xo-window class and
        // the ranking still judge whatever the repair does to the branches.
        //
        // REPAIR PASS ONLY (V30). That measurement is about a retune with no
        // freedom left: seeded on a finished network, one round, lift the dip
        // or fail. A full search armed with the barrier is not in that
        // position — it can find the ohms in the topology it is still
        // choosing — so it keeps the design step's leash. Cancelling the
        // corridor for a whole run would be a second change riding along on
        // the first, and V30 is about the first.
        if (zFloorRepairPass) barr -= 2 * m.corridorSq;
      }
      return fxOf(m) + barr + 8 * penalty;
    };
    const x0 = free.map((e) => Math.log10(e.value));
    const iters = Math.max(
      200,
      Math.round((maxIterations ?? Math.max(700, 140 * free.length)) * budgetScale),
    );
    let fit = nelderMead(objective, x0, { maxIterations: iters, tolerance: 1e-6, step: 0.1 });
    const again = nelderMead(objective, [...fit.x], { maxIterations: iters, tolerance: 1e-6, step: 0.25 });
    if (again.fx < fit.fx) fit = again;
    /* ---- Block-coordinate refinement (THREE-WAY, full tunes only) --------
     * An assembled three-branch network carries 16–25 free values, and past
     * ~10 dims a single simplex crawls — the exact wall the branch synthesis
     * already hits and solves this way. Re-polish overlapping 6-dim blocks
     * around the best point, then one tight full-dimensional polish.
     *
     * Blocks are index-based: merged parts arrive in BRANCH order, so
     * consecutive slots mostly share a branch and the 3-step overlap spans
     * the seams — which is what keeps this from degenerating into "tune the
     * pairs separately". The coupling is never broken: every block is scored
     * by the SAME full objective (both pairs, whole network) and accepted
     * only when that objective improves. Search depth only — what "better"
     * means is untouched (the anchor lesson).
     *
     * Gated on 3-way so two-way stays bit-identical, and on the FULL tunes
     * (budgetScale ≥ 1, no amp-floor repair): the 0.6-scale retunes are local
     * recoveries from an already-good point where the deep search does not
     * pay for its runtime. ---- */
    if (midB !== undefined && !zFloorRepairPass && budgetScale >= 1 && free.length > 9) {
      for (let start = 0; start < free.length; start += 3) {
        const ids: number[] = [];
        for (let k = start; k < Math.min(start + 6, free.length); k++) ids.push(k);
        if (ids.length < 2) break;
        const subObjective = (xs: readonly number[]): number => {
          const full = [...fit.x];
          ids.forEach((slot, j) => (full[slot] = xs[j]));
          return objective(full);
        };
        const sub = nelderMead(
          subObjective,
          ids.map((i) => fit.x[i]),
          { maxIterations: 400, tolerance: 1e-7, step: 0.08 },
        );
        if (sub.fx < fit.fx) {
          const full = [...fit.x];
          ids.forEach((slot, j) => (full[slot] = sub.x[j]));
          fit = { ...fit, x: full, fx: sub.fx };
        }
      }
      const polish = nelderMead(objective, [...fit.x], {
        maxIterations: iters,
        tolerance: 1e-6,
        step: 0.04,
      });
      if (polish.fx < fit.fx) fit = polish;
    }
    // Never end worse than the values we started from.
    if (objective(x0) <= objective(fit.x)) fit = { ...fit, x: [...x0] };

    free.forEach((e, i) => {
      e.value = 10 ** (hard[i] ? Math.min(Math.max(fit.x[i], winLo[i]), winHi[i]) : fit.x[i]);
    });
    // The same projection the objective used, so what is WRITTEN OUT is the
    // point that was scored. Skipping it here is how a box constraint comes to
    // hold everywhere except in the answer.
    projectSums();
    const m = metricsOn(work, optW.freq, optW, optT, optM, optZ, optAngles);
    const valueOf = new Map(free.map((e) => [e.id, e.value]));
    const out = cloneParts(ps).map((q) => {
      if (q.partId === undefined || !valueOf.has(q.partId) || q.open || q.shorted) return q;
      const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : 'R';
      const u = PARAM_OF[kind];
      // A retuned value invalidates any earlier snap attribution.
      const { catalog: _stale, ...rest } = q;
      void _stale;
      return {
        ...rest,
        params: q.params.map((par) =>
          par.name === u.name
            ? { ...par, value: Number((valueOf.get(q.partId!)! * u.factor).toPrecision(4)) }
            : par,
        ),
      };
    });
    return { parts: out, freeCount: free.length, fx: fxOf(m), metrics: m };
  };

  {
    const { free } = buildWork(parts);
    if (free.length === 0) {
      throw new NetOptimizeError('Every component is locked — nothing for the optimizer to move.');
    }
  }
  const before = metricsOn(
    buildWork(parts).work,
    grid,
    wBase,
    tBase,
    midFull,
    driverZ,
    angleData ?? null,
  );
  /** Solo sensitivity gate: the network may not spend more than the budget of
   *  the driver's own median level. Always true for two-driver designs (level
   *  there is a pairing decision, priced by the crossing fundamentals). */
  const soloSensOk = (m: Metrics): boolean =>
    !solo || rawMedianRef - m.medianDb <= soloLossCap;

  if (solo) soloLossCap = Math.max(soloSensBudgetDb, rawMedianRef - before.medianDb);

  stage('value tune');
  /* ---- Stage: value tuning (always) — MULTI-START. The response landscape
   * is multimodal and under-determined: many value-sets sum equally flat,
   * and from an arbitrary seed the tuner may converge into a low-impedance
   * big-cap basin even when an impedance-matched basin scores as well or
   * better (Sanders: C2/B·C1 at 33 µF where ~10–15 µF matched, integration
   * 100 either way). A second start re-seeds far-off-textbook REACTIVE
   * outliers AT their textbook magnitude (L ≈ R/2πfc, C ≈ 1/(2πfc·R); fc =
   * the seed's acoustic crossing, R = median |Z| around it) so the matched
   * basin gets explored too; the best TUNED result by fx wins. This is
   * seeding, not an objective term — the search inside each basin stays
   * untouched. (The objective-nudge version of "caps kleiner, spoelen
   * groter" measurably destabilized the search and was reverted.) Both
   * starts are deterministic, so same input → same output, every run. ---- */
  const textbook = (() => {
    // Anchor frequency: the crossing (2-way), or the geometric mean of the
    // pair crossings (3-way — one shared anchor keeps the reseed conservative
    // rather than flagging every top-pair part against a low-fc textbook).
    // With one pair x ** (1/1) === x, so the 2-way value is bit-identical.
    const xs = before.xoHzPairs.filter((x): x is number => x != null && x > 0);
    let fc: number | null =
      xs.length > 0 ? xs.reduce((a, b) => a * b, 1) ** (1 / xs.length) : null;
    if (!fc || !(fc > 0)) fc = xoR ? Math.sqrt(xoR[0] * xoR[1]) : Math.sqrt(band[0] * band[1]);
    const zs: number[] = [];
    for (const z of Object.values(driverZ)) {
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] >= fc / 2 && grid[i] <= fc * 2) zs.push(Math.hypot(z[i].re, z[i].im));
      }
    }
    zs.sort((a, b) => a - b);
    const R = zs.length ? zs[Math.floor(zs.length / 2)] : 6;
    return { L: R / (2 * Math.PI * fc), C: 1 / (2 * Math.PI * fc * R) };
  })();
  /** Estimated build cost of a CONTINUOUS-valued network: nearest catalog
   *  part per R/L/C regardless of distance (bomFor's 1% exact-match window
   *  is meaningless mid-tune — it priced 3 of 15 parts and compared noise).
   *  Null without a priced catalog. */
  const estimateCostEur = (ps: readonly VxpPart[]): number | null => {
    if (!hasImportedCatalog()) return null;
    let sum = 0;
    let priced = 0;
    for (const q of ps) {
      if (q.open || q.shorted) continue;
      const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : q.type === 'Resistor' ? 'R' : null;
      if (!kind) continue;
      const u = PARAM_OF[kind];
      const v = q.params.find((p) => p.name === u.name)?.value;
      if (!v || !(v > 0)) continue;
      const near = nearestParts(kind, v / u.factor, 1)[0];
      if (near?.priceEur !== undefined) {
        sum += near.priceEur;
        priced++;
      }
    }
    return priced > 0 ? sum : null;
  };
  const fxOrig = quickFx(parts);
  /** Tune the challenger. Clear fx win (>1%) takes it regardless of price;
   *  an fx TIE (≤1% either way) goes to the CHEAPER estimated build —
   *  Sanders "caps zo klein mogelijk": at equal fit a 33 µF premium cap has
   *  no business beating a 6.8 µF one. In STAGED mode the targets are the
   *  sufficiency bar (trapmethode: "toereikend is variabel"), so a cheaper
   *  basin that still MEETS the targets on the full grid may win within the
   *  same 10% objective room the prune doctrine allows — with the
   *  prune-strict fundamentals gates riding along. Cost is decision-level
   *  only; without a priced catalog nothing changes. */
  const challenge = (base: TuneOut, seedPs: readonly VxpPart[]): TuneOut => {
    const alt = tune(seedPs, 1, opts.staged ?? null);
    // F2: a basin that crosses an active gate is not an alternative. Checked
    // before any comparison below, so no branch can return it — the drift
    // catch runs through here too, which is why one guard covers both.
    if (opts.gateViolation && !gateOk(alt.parts, 'basin challenge')) return base;
    const cheaper = (): boolean => {
      const cBase = estimateCostEur(base.parts);
      const cAlt = estimateCostEur(alt.parts);
      return cBase !== null && cAlt !== null && cAlt < cBase;
    };
    if (alt.fx < base.fx * 0.99) return alt;
    if (alt.fx <= base.fx * 1.01 && alt.fx < fxOrig) {
      if (cheaper()) return alt;
      if (alt.fx < base.fx) return alt;
    }
    if (opts.staged && alt.fx <= base.fx * 1.1 && cheaper()) {
      const full = (ps: readonly VxpPart[]): Metrics =>
        metricsOn(buildWork(ps).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
      const mAlt = full(alt.parts);
      const mBase = full(base.parts);
      if (
        mAlt.ripplePeakDb <= opts.staged.rippleDb &&
        phaseGate(mAlt) <= opts.staged.phaseDeg &&
        mAlt.protSqDb <= mBase.protSqDb + 0.5 &&
        mAlt.xoDipDb <= mBase.xoDipDb + 1 &&
        mAlt.zShortOhm <= mBase.zShortOhm + 0.1 &&
        (!breakupGuard || mAlt.leakSqDb <= mBase.leakSqDb + 4)
      ) {
        return alt;
      }
    }
    return base;
  };
  /** Up to two result-reseed challenges; stops when one loses. */
  const driftCatch = (base: TuneOut): TuneOut => {
    let out = base;
    for (let i = 0; i < 2; i++) {
      const sr = reseedOutliers(out.parts, textbook);
      if (!sr) break;
      const prev = out;
      out = challenge(out, sr);
      if (out === prev) break;
    }
    return out;
  };

  /* ---- GATE 4: absolute physical part audit (partAudit.ts) ----
   * Runs in EVERY mode, targets met or not — that is its whole reason to
   * exist: the staged prune is gated on meets(), so an unreachable target
   * leaves demonstrably dead parts in place (Sanders' 6.8 mH tweeter-branch
   * shunt). INERT = the sum, the pair phase and the impedance do not move
   * when the part is opened/shorted WITHOUT any retune, so removing it cannot
   * shift the downstream stages (the lesson of the reverted fx-delta sweep,
   * which removed live parts and landed the snap elsewhere). Each removal is
   * still re-checked on the full grid; a regression reverts it and marks the
   * entry GREY with the reason.
   *
   * It runs TWICE: on the SEED before the first value tune, and on the
   * DELIVERED network, after every pass that can still move a value. The
   * second used to sit before the shrink ladder, the repair and the snap, so
   * anything those three made inert was never looked at. The seed pass exists
   * because an
   * unlocked value tune RE-PURPOSES a dead part rather than leaving it dead
   * (measured: a 6.8 mH/68 µF trap at 232 Hz across the tweeter — 0.10 dB on
   * the sum — came out of the tune as a 0.78 mH shunt, and with its cap
   * locked at 0.1 µF as a 14.5 mH/0.1 µF NOTCH at the crossing). Neither is
   * what the design step asked for; a part that does nothing on the seed is a
   * design-step artifact and goes before the tuner can turn it into an
   * unasked-for extra element. The end pass catches what the tune left dead
   * (Sanders' real case: the staged tune kept his coil at 6.8 mH). */
  const removed: string[] = [];
  const added: string[] = [];
  let auditReport: NetworkAudit | undefined;
  const auditOn = opts.audit?.enabled !== false;
  const auditCostOf = (q: VxpPart): number | null => {
    if (!hasImportedCatalog()) return null;
    const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : q.type === 'Resistor' ? 'R' : null;
    if (!kind) return null;
    const u = PARAM_OF[kind];
    const v = q.params.find((p) => p.name === u.name)?.value;
    if (!v || !(v > 0)) return null;
    const near = nearestParts(kind, v / u.factor, 1)[0];
    return near?.priceEur ?? null;
  };
  const runAudit = (
    ps: readonly VxpPart[],
    label: string,
  ): { parts: VxpPart[]; metrics: Metrics; applied: boolean; report: NetworkAudit } | null => {
    if (!auditOn) return null;
    stage(label);
    const rep = auditNetwork(ps, {
      grid,
      wBase,
      tBase,
      midBase: midFull,
      driverZ,
      adjust,
      midAdjust: midAdj,
      thresholds: opts.audit?.thresholds,
      fbHz: opts.audit?.fbHz,
      zFloorOhm: ampFloorOhm ?? undefined,
      costOf: auditCostOf,
      /* V34 — the audit's per-part response work stays on the analysis grid;
       * only its source-resistance probe moves. Passed explicitly on every run,
       * including `'grid'`, so this call site cannot silently disagree with the
       * five other readers of the same probe. */
      probe: probeOn ? { grid: probeOn.freqs, driverZ: probeOn.z, edgeRule: probeOn.edgeRule } : null,
    });
    if (!rep) return null;
    const fullOf = (qs: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(qs).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
    let partsNow: VxpPart[] = [...ps];
    let ref = fullOf(partsNow);
    let anyApplied = false;
    // Chains first (a dead trap goes as a whole), then singles.
    const order = [...rep.entries].sort((a, b) => b.ids.length - a.ids.length);
    for (const e of order) {
      if (e.verdict !== 'inert' || e.locked) continue;
      if (e.ids.some((id) => removed.includes(id))) continue;
      const trial = partsNow.map((q) => (q.partId && e.ids.includes(q.partId) ? { ...q, [e.mode]: true } : q));
      let m: Metrics;
      try {
        m = fullOf(trial);
      } catch {
        e.reasons.push('re-check failed to solve — kept');
        e.verdict = 'grey';
        continue;
      }
      // Re-check: targets not regressed beyond the inert margin, fundamentals intact.
      const ok =
        m.ripplePeakDb <= ref.ripplePeakDb + 0.1 &&
        phaseGate(m) <= phaseGate(ref) + 1 &&
        m.protSqDb <= ref.protSqDb + 0.5 &&
        m.xoDipDb <= ref.xoDipDb + 1 &&
        m.zShortOhm <= ref.zShortOhm + 0.1 &&
        soloSensOk(m) &&
        (!breakupGuard || m.leakSqDb <= ref.leakSqDb + 4);
      if (!ok) {
        e.reasons.push(
          `re-check after removal regressed (peak ${ref.ripplePeakDb.toFixed(2)} → ${m.ripplePeakDb.toFixed(2)} dB, ` +
            `phase ${phaseGate(ref).toFixed(1)} → ${phaseGate(m).toFixed(1)}°) — kept`,
        );
        e.verdict = 'grey';
        continue;
      }
      // F2: "inert" is measured on sum, pair phase and Z — none of which is
      // the dissipation share, the EPDR minimum or the drive on f_s. A part
      // that is inaudible can still be the reason an active gate is met, so
      // the removal is asked the gate question before it is taken.
      //
      // Asked LAST, after the quality re-check has already accepted the
      // removal: the gate is a veto on a step that is about to be taken, not
      // a filter over every entry the audit considers.
      //
      // ON THE COST, because it was mis-diagnosed once and the record is worth
      // keeping straight. A v2 run was suspected of being slow HERE. Measured
      // on the two-way fixture it is not: a whole run asks the gate four
      // times, and the run finishes FASTER than the same run without gates
      // (3.4 s -> 2.2 s, 9538 -> 6144 sims) because a refusal ends a search
      // that would otherwise have kept going. What is slow on a large
      // three-way is the part audit itself, on v1 and v2 alike.
      if (opts.gateViolation && !gateOk(trial, `audit removal ${e.ids.join('+')}`)) {
        e.reasons.push('removal would cross an active hard gate — kept');
        e.verdict = 'grey';
        continue;
      }
      partsNow = trial;
      ref = m;
      removed.push(...e.ids);
      e.applied = true;
      anyApplied = true;
    }
    return { parts: partsNow, metrics: ref, applied: anyApplied, report: rep };
  };

  // Seed pass: what is dead on the seed goes before the tune can re-purpose it.
  const seedAudit = runAudit(parts, 'part audit (seed)');
  const seedParts: readonly VxpPart[] = seedAudit ? seedAudit.parts : parts;

  /**
   * The network AS IT STANDS, packaged like a tune result — the fallback a
   * refused step returns to.
   *
   * `freeCount` is 0 on purpose: nothing was tuned. That is the same claim
   * the safety gate's rollback makes, and it matters to whoever reads
   * `tuned` beside these numbers.
   */
  const asIs = (ps: readonly VxpPart[]): TuneOut => {
    const m = metricsOn(buildWork(ps).work, optW.freq, optW, optT, optM, optZ, optAngles);
    return { parts: cloneParts(ps), freeCount: 0, fx: fxOf(m), metrics: m };
  };

  let cur = tune(seedParts);
  /* F2 — the value search is where the V2 pathology is BORN (a phase target
   * met through an underdamped L/C whose series R drifts to extremes), so the
   * gate is asked here first. A tuned result that crosses an active gate is
   * refused and the seed stands — the same doctrine the full-band safety gate
   * already follows, and the honest one: a design that only reaches its
   * targets outside the designer's stated limits has not reached them. */
  /**
   * V33 — the value tune an active gate refused WHOLESALE, kept as evidence.
   *
   * Until V33 this fell back to the seed and the run carried on, and what came
   * out the other end was published as the candidate's answer. On casus 1 that
   * was five of fifteen candidates: networks nobody tuned against the goal
   * this run was given, delivered at 0.01–1.38 Ω against a stated 2.60 Ω
   * floor, and indistinguishable in the result object from a tune that simply
   * landed there. The seed still stands as the working point below — a later
   * pass may still find something the gate accepts, and throwing that away
   * would be a second change — but if nothing does, the run says so instead of
   * handing over the seed (see the wholesale return further down).
   */
  let refusedValueTune: { reason: string; parts: VxpPart[] } | null = null;
  if (opts.gateViolation) {
    const why = gateRefusal(cur.parts, 'value tune');
    if (why !== null) {
      refusedValueTune = { reason: why, parts: cloneParts(cur.parts) };
      cur = asIs(seedParts);
    }
  }
  {
    const s1 = reseedOutliers(parts, textbook);
    if (s1) cur = challenge(cur, s1);
    // DRIFT CATCH (Sanders' 33 µF runs): in the app flow the seed comes from
    // textbook-anchored synthesis, so the SEED rarely has outliers — the
    // drift into the big-cap basin happens DURING the tune, and a seed-only
    // check never sees it. Challenge the tuned RESULT as well.
    cur = driftCatch(cur);
  }
  const RLC = new Set(['Resistor', 'Inductor', 'Capacitor']);

  if (opts.staged) {
    const tgt = opts.staged;
    // Targets are judged on the FULL grid — the numbers the user sees. The
    // decimated inner grid drives the search but its (integration-weighted)
    // phase metric can differ visibly from the full-grid one.
    const fullM = (ps: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(ps).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
    const meets = (m: Metrics): boolean =>
      m.ripplePeakDb <= tgt.rippleDb && phaseGate(m) <= tgt.phaseDeg;
    // Steer INTO the target region from the fx-optimum: the barrier is a
    // local refinement — applied from a cold seed it drowns the landscape
    // (learned the hard way: 843 µF caps chasing an unreachable target).
    {
      // F2: the barrier chases the STAGED TARGETS, which is precisely the
      // pressure that buys phase with an underdamped resonance (V2). A
      // barrier tune that lands outside an active gate is refused whole —
      // targets are a goal, gates are a limit, and a goal never overrules one.
      const t = tune(cur.parts, 0.6, tgt);
      if (gateOk(t.parts, 'target barrier tune')) cur = t;
    }
    let curFull = fullM(cur.parts);
    /** The targets only speak of ripple/phase — a structure move must ALSO
     *  keep the fundamentals: tweeter protection intact, breakup margin not
     *  meaningfully surrendered. (Shorting the tweeter's series C can leave
     *  ripple within target while frying the driver.) */
    const safe = (m: Metrics, ref: Metrics): boolean =>
      m.protSqDb <= ref.protSqDb + 0.5 &&
      m.xoDipDb <= ref.xoDipDb + 1 &&
      m.zShortOhm <= ref.zShortOhm + 0.1 &&
      soloSensOk(m) &&
      (!breakupGuard || m.leakSqDb <= ref.leakSqDb + 4);
    /** Point 4: a structure move may not push the source resistance the LOW
     *  driver sees at Fb over the limit (a series R in the woofer branch is
     *  the classic way to "win" flatness while doubling Qes). Crossing from
     *  at/under to over is unsafe; already over stays judged by the audit. */
    const rsSafe = (candParts: readonly VxpPart[], refParts: readonly VxpPart[]): boolean => {
      if (!(rSourceLimit > 0)) return true;
      /* V34: through `rSourceOf`, so this guard, the hard constraint and the
       * delivered report read one probe on one grid. It used to build its own
       * `sourceResistanceOhm` call twice with `grid` written out by hand, which
       * is exactly how the same question comes to have two answers. */
      const rsRef = rSourceOf(refParts);
      if (rsRef === null || rsRef > rSourceLimit) return true;
      const rsCand = rSourceOf(candParts);
      return rsCand === null || rsCand <= rSourceLimit;
    };
    /** Escalation adds a part + full retune: protection shifts a little by
     *  nature (the fx already prices it at 0.02·protSqDb). The prune-strict
     *  +0.5 slack blocked every legitimate bypass-C; +3 (~1.7 dB RMS above
     *  the −15 dB floor) stays bounded without being a knife edge. */
    const safeEsc = (m: Metrics, ref: Metrics): boolean =>
      m.protSqDb <= ref.protSqDb + 3 &&
      m.xoDipDb <= ref.xoDipDb + 2 &&
      m.zShortOhm <= ref.zShortOhm + 0.3 &&
      (!breakupGuard || m.leakSqDb <= ref.leakSqDb + 4);

    if (meets(curFull)) {
      stage('prune sweep');
      /* ---- PRUNE: shed parts whose removal is (nearly) FREE ----
       * Every unlocked part gets two removal variants: `open` (a shunt part
       * simply disappears) and `shorted` (a series part becomes a wire). The
       * wrong variant breaks the network and is rejected by the objective —
       * no topology reasoning needed. Cheapest-looking removals are re-tuned
       * first. A removal must keep the targets AND cost almost nothing:
       * ≤10% objective per removal, ≤35% cumulative. Without those caps the
       * prune walked quality down to the target boundary — Sanders three
       * screenshots: more EQ budget → more prunable parts → phase 2.7° →
       * 7.8°, all "within target" and therefore invisible to the old gate.
       * Fewest components, but never quality as loose change. */
      const fx0 = cur.fx;
      /* How many removals may be RETUNED AND TESTED per round, and how many
       * rounds there are. Both were fixed at 3 and 8, and on a 29-part 3-way
       * that is why obviously dead parts survived a pass whose targets were
       * comfortably met (Sander: two 10 mH / 6.8 mH coils forming traps at
       * 232 and 411 Hz inside a TWEETER branch, plus a 0.22 Ω series
       * resistor).
       *
       * The top-3 rule is what excluded them, and the reason is subtle: a
       * genuinely dead part's removal leaves fx almost EXACTLY where it was,
       * while some live part's removal can push fx slightly DOWN before the
       * retune. Sorted by raw fx the dead ones therefore rank below several
       * others and never get tried — and `if (!accepted) break` then ends the
       * whole sweep on the first round whose top three failed.
       *
       * So: retune and test the eight most promising removals per round rather
       * than three, and let the round count follow the size of the design.
       * Search DEPTH only: the acceptance gates are untouched, so a removal
       * still has to keep the targets, keep the fundamentals, and cost ≤10%
       * on its own and ≤35% in total. */
      const freeParts = cur.parts.filter(
        (q) => RLC.has(q.type) && !q.locked && !q.open && !q.shorted && q.partId !== undefined,
      ).length;
      const maxRounds = Math.min(20, Math.max(8, Math.floor(freeParts / 2)));
      for (let round = 0; round < maxRounds; round++) {
        type Cand = { id: string; trial: VxpPart[]; fx: number };
        const cands: Cand[] = [];
        for (const q of cur.parts) {
          if (!RLC.has(q.type) || q.locked || q.open || q.shorted) continue;
          if (q.partId === undefined) continue;
          for (const mode of ['open', 'shorted'] as const) {
            const trial = cur.parts.map((pp) => (pp === q ? { ...q, [mode]: true } : pp));
            let fx: number;
            try {
              fx = quickFx(trial);
            } catch {
              continue;
            }
            if (fx > 1e8) continue;
            cands.push({ id: q.partId, trial, fx });
          }
        }
        cands.sort((a, b) => a.fx - b.fx);
        // Strictly a SUPERSET of the old top-3, so this can only ever find
        // more. A threshold on raw fx was tried and reverted: an untuned
        // removal often looks far worse than it is — the retune is what
        // recovers it — so filtering on the pre-tune number threw away the
        // very candidates the pass exists for (it broke the redundant-cap
        // regression immediately).
        const shortlist = cands.slice(0, 8);
        let accepted = false;
        for (const cand of shortlist) {
          const t = tune(cand.trial, 0.6, tgt);
          const tFull = fullM(t.parts);
          if (
            meets(tFull) &&
            safe(tFull, curFull) &&
            rsSafe(t.parts, cur.parts) &&
            t.fx <= cur.fx * 1.1 &&
            t.fx <= fx0 * 1.35 &&
            // F2: a removal is a polish step like any other and may not cross
            // an active gate, however free it looks on the objective.
            //
            // LAST IN THE CHAIN ON PURPOSE (F2b). The gate is a VETO on a step
            // that is otherwise about to be taken, not a filter over every
            // trial — and `&&` short-circuits, so a removal that the quality
            // rules reject never costs a network solve. Semantically identical
            // either way; the ordering is the whole saving.
            gateOk(t.parts, `prune ${cand.id}`)
          ) {
            cur = t;
            curFull = tFull;
            removed.push(cand.id);
            accepted = true;
            break;
          }
        }
        if (!accepted) break;
      }
    } else {
      stage('escalation');
      /* ---- ESCALATE (rule 3): bypass-C across series resistors ---- */
      for (let round = 0; round < 2 && !meets(curFull); round++) {
        let best: { id: string; t: TuneOut } | null = null;
        const cands = bypassCandidates(cur.parts, cloneParts);
        for (const cand of cands) {
          const t = tune(cand.trial, 0.6, tgt);
          if (!best || t.fx < best.t.fx) best = { id: cand.id, t };
        }
        if (!best) break;
        const bestFull = fullM(best.t.parts);
        // The new part must EARN its place: reach the targets or pay ≥3%.
        if (
          safeEsc(bestFull, curFull) &&
          rsSafe(best.t.parts, cur.parts) &&
          (meets(bestFull) || best.t.fx < cur.fx * 0.97) &&
          // F2: an ADDED part must earn its place inside the gates too.
          // Veto-last (F2b) — see the prune sweep above.
          gateOk(best.t.parts, `escalation ${best.id}`)
        ) {
          cur = best.t;
          curFull = bestFull;
          added.push(best.id);
        } else break;
      }
    }

    // Structure changed → one full-budget settle of the survivors.
    if (removed.length + added.length > 0) {
      const t = tune(cur.parts, 1, tgt);
      if (gateOk(t.parts, 'post-structure settle')) cur = t;
    }
  }

  stage('drift check');
  /* ---- LATE drift catch: staged retunes (barrier tune, prune/escalation
   * settles) walk values back into the big-cap basin AFTER the early
   * challenges — measured on the 1900-chain: the early challenge moved to
   * the matched basin (fx 0.192→0.175, cheaper), yet C2 ended at 33 µF
   * again. One more result-challenge on the assembled survivor, right
   * before the snap freezes values onto purchasable parts. ---- */
  cur = driftCatch(cur);

  stage('cap shrink ladder');
  /* ---- Cap SHRINK LADDER (Sanders: "met B·C1 laag beginnen en langzaam
   * opvoeren om te vergelijken" — implemented as the equivalent warm-started
   * walk DOWN, and extended to C2/every free cap on Sanders' request):
   * premium capacitors are the price drivers (an Alumen/Superior € scales
   * steeply with µF, whether it sits in the signal path or as the mid-LP
   * shunt — C2 was a €132 Superior Z-Cap), and the response is often
   * near-indifferent over a wide value range, so the tuner has no reason to
   * prefer the small end. For each free C — series path first (proven), then
   * the shunts — step its value down the E12 ladder, slot pinned, everything
   * else retuned, and keep the smallest value that still meets the bar
   * (staged: full-grid targets + fundamentals not worse; otherwise: ≤1% fx
   * per step, ≤2% cumulative — the desnoei-rem shape). The same never-worse
   * gates protect a shunt/trap cap: shrinking a trap that hurts the notch
   * fails the targets and stops (and if the notch survives with a smaller
   * cap + bigger coil, that IS "caps kleiner, spoelen groter"). Walking down
   * from the converged solution warm-starts every step from a working
   * neighbour; starting low and walking up would cold-start in an arbitrary
   * basin. ---- */
  {
    const E12L = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    const stepDown = (si: number): number => {
      const target = si / 1.05;
      let bestV = 0;
      for (let dec = -7; dec <= -3; dec++) {
        for (const m of E12L) {
          const v = m * 10 ** dec;
          if (v < target && v > bestV) bestV = v;
        }
      }
      return bestV;
    };
    const fullOf = (ps: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(ps).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
    const posOfCur = busPositions(cur.parts);
    const freeCaps = cur.parts.filter(
      (q) =>
        q.type === 'Capacitor' &&
        q.partId !== undefined &&
        !q.locked &&
        !q.open &&
        !q.shorted,
    );
    // Series-path caps first (proven), then shunts — deterministic order.
    const ladderIds = [
      ...freeCaps.filter((q) => posOfCur(q.partId!) === 'series'),
      ...freeCaps.filter((q) => posOfCur(q.partId!) !== 'series'),
    ].map((q) => q.partId!);
    const base0 = ladderIds.length > 0 ? fullOf(cur.parts) : null;
    const baseMeets =
      base0 !== null &&
      (!opts.staged ||
        (base0.ripplePeakDb <= opts.staged.rippleDb && phaseGate(base0) <= opts.staged.phaseDeg));
    if (base0 !== null && baseMeets) {
      const fx00 = cur.fx;
      for (const id of ladderIds) {
        for (let step = 0; step < 6; step++) {
          const part = cur.parts.find((q) => q.partId === id);
          if (!part) break;
          const si = (part.params.find((p) => p.name === 'C')?.value ?? 0) / PARAM_OF.C.factor;
          if (!(si > 1.05e-6)) break; // floor: 1 µF
          const next = stepDown(si);
          if (!(next > 0)) break;
          const trial = cloneParts(cur.parts).map((q) =>
            q.partId === id
              ? {
                  ...q,
                  locked: true,
                  params: q.params.map((p) =>
                    p.name === 'C'
                      ? { ...p, value: Number((next * PARAM_OF.C.factor).toPrecision(4)) }
                      : p,
                  ),
                }
              : q,
          );
          const t = tune(trial, 0.6, opts.staged ?? null);
          const cand: TuneOut = {
            ...t,
            // The slot was only pinned for THIS retune: restore its lock
            // state, and report the free count of the real network (the
            // temporary pin must not leak into `tuned`).
            freeCount: cur.freeCount,
            parts: t.parts.map((q) =>
              q.partId === id ? { ...q, locked: part.locked ?? false } : q,
            ),
          };
          const okFx = opts.staged
            ? cand.fx <= fx00 * 1.1
            : cand.fx <= cur.fx * 1.01 && cand.fx <= fx00 * 1.02;
          if (!okFx) break;
          const fm = fullOf(cand.parts);
          const meetsOk =
            !opts.staged ||
            (fm.ripplePeakDb <= opts.staged.rippleDb && phaseGate(fm) <= opts.staged.phaseDeg);
          const safeOk =
            fm.protSqDb <= base0.protSqDb + 0.5 &&
            fm.xoDipDb <= base0.xoDipDb + 1 &&
            fm.zShortOhm <= base0.zShortOhm + 0.1 &&
            (!breakupGuard || fm.leakSqDb <= base0.leakSqDb + 4);
          // Quality-only gate — NO per-step cost check. Gating on the mid-tune
          // cost estimate backfired (measured on C2): `estimateCostEur` picks
          // the nearest priced part regardless of tier, so the "price" flips
          // between parts as a continuous value slides, and a false cost
          // bump broke the ladder (B·C1 stuck at 15 µF, worse AND pricier).
          // Same lesson as the objective anchor: cost belongs at clean
          // decision points (the snap, the scan ranking), not noisy per-step
          // gates. The final snap + BOM-aware scan handle the money.
          // F2: the ladder walks values DOWN, which moves impedance and drive
          // voltage as surely as anything else does. A rung outside an active
          // gate ends the ladder rather than being taken.
          //
          // Veto-last (F2b): `||` short-circuits, so a rung the quality rules
          // already reject never reaches the gate.
          if (!meetsOk || !safeOk) break;
          if (!gateOk(cand.parts, `cap shrink ${id}`)) break;
          cur = cand;
        }
      }
    }
  }

  /* ---- Amp-load floor repair (decision-level; ONLY with a stated amplifier
   * rating). When the tuned result dips below what the user's amplifier is
   * rated for — a shunt trap/Zobel R near the input, or an amp-hostile value
   * the response metrics cannot see — a locally seeded barrier retune walks
   * the values up out of the dip. Accepted only when it genuinely lifts the
   * minimum AND the response stays in class (prune-doctrine 10%) with the
   * fundamentals intact; otherwise the result stands and the note tells the
   * truth (the Impedance panel shows it too).
   *
   * Without a rating this pass does not run at all: `zShortOhm` is 0 by
   * construction, so there is nothing to detect and nothing to repair. The
   * minimum is still measured and reported. */
  let ampFloorNote: string | undefined;
  /** Set when a post-search pass had to be rolled back because it could not
   *  reach its goal without violating a hard constraint. */
  let infeasible: string | undefined;
  /* A3g: the OUTCOME of this pass as a value, not as a sentence. Both chains
   * used to derive `zOk` with `ampFloorNote.includes('could not be repaired')`
   * — a ranking depending on the wording of prose written three passes
   * earlier, and on prose describing a network the snap had since changed. */
  let ampFloorRepair: 'none' | 'lifted' | 'refused' | 'failed' = 'none';
  /** How far the SEED sat below the floor, for the relative bar (a user network
   *  that already dipped keeps its own reference). Hoisted so the delivered
   *  check at the end can use the same predicate. */
  let ampFloorSeedShort = 0;
  const fullOf = (ps: readonly VxpPart[]): Metrics =>
    metricsOn(buildWork(ps).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
  /** Worst dip over the evaluation grid AND the safety grid — hoisted for the
   *  same reason: detection, acceptance and the delivered verdict must all use
   *  the one measure. */
  const worstZOf = (m: Metrics, ps: readonly VxpPart[]): { short: number; min: number } => {
    let short = m.zShortOhm;
    let min = m.zMinOhm;
    if (opts.safety) {
      const sg = opts.safety;
      const ms = metricsOn(buildWork(ps).work, sg.freqs, sg.w, sg.t, sg.m ?? null, sg.z, null);
      if (ms.zShortOhm > short) {
        short = ms.zShortOhm;
        min = ms.zMinOhm;
      }
    }
    return { short, min };
  };
  {
    // Judge the dip on the evaluation grid AND the safety grid (when given):
    // the safety gate rejects on ITS grid, and a narrow resonant dip — or one
    // outside a zoomed view range — only shows up there. Detection, acceptance
    // and the delivered verdict all use `worstZOf` for that reason.
    const worstZ = worstZOf;
    const mCur = fullOf(cur.parts);
    const zCur = worstZ(mCur, cur.parts);
    if (ampFloorOhm !== null && zCur.short > zSlackOhm) {
      stage('amp-load floor');
      // A dipping SEED (user network already below the floor) moves the bar:
      // the safety gate judges against the seed, so "as healthy as the seed"
      // is repaired enough there.
      const zSeed = worstZ(fullOf(parts), parts);
      ampFloorSeedShort = zSeed.short;
      const repairedEnough = (s: number): boolean =>
        opts.zFloorStrict ? s <= zSlackOhm : s <= Math.max(zSlackOhm, zSeed.short + zSlackOhm);
      // Iterate the barrier retune (max 3 warm-started rounds): one round's
      // simplex budget regularly stalls short (measured in the app chain:
      // 1.2 → 2.14 Ω in round one, threshold 2.5).
      let rep = tune(cur.parts, 1, opts.staged ?? null, true, true, true);
      let zRepI = worstZ(fullOf(rep.parts), rep.parts);
      for (let round = 1; round < 3 && !repairedEnough(zRepI.short); round++) {
        const again = tune(rep.parts, 1, opts.staged ?? null, true, true, true);
        const zAgain = worstZ(fullOf(again.parts), again.parts);
        if (!(zAgain.short < zRepI.short - 1e-3)) break; // no longer improving
        rep = again;
        zRepI = zAgain;
      }
      const mRep = fullOf(rep.parts);
      const zRep = zRepI;
      const targetsKept =
        !opts.staged ||
        mCur.ripplePeakDb > opts.staged.rippleDb || // weren't met before either
        (mRep.ripplePeakDb <= opts.staged.rippleDb && phaseGate(mRep) <= opts.staged.phaseDeg);
      // Full repair or nothing: a partial lift (2.7 of 3 Ω at the old floor)
      // still fails the safety gate and the whole tune bounces back to the
      // seed anyway — the dip must clear the detection threshold itself.
      // Acceptance beyond that: targets kept, tweeter protection never
      // surrendered (the one non-negotiable), and then EITHER the repair is
      // strictly better on the full objective — which already prices every
      // fundamental, and rejecting a strictly-better repair hands the user
      // the raw seed instead (measured: repFx 4.8 < 5.7 refused on a +7 leak
      // arm, and the gate then threw 100% of the tune away) — OR it stays in
      // the prune-doctrine 10%/seed window with the leak/dip arms intact.
      /* Corridor-free on BOTH sides (same hierarchy as the search): the fx a
       * repair is judged by must not contain the corridor tax on the very
       * moves the repair exists to make. Arithmetic, not a re-solve — every
       * TuneOut carries its final metrics. */
      const nc = (t: { fx: number; metrics: Metrics }): number =>
        t.fx - 2 * t.metrics.corridorSq;
      const armsOk =
        (nc(rep) <= nc(cur) * 1.1 || nc(rep) <= fxOrig) &&
        mRep.xoDipDb <= mCur.xoDipDb + 1 &&
        (!breakupGuard || mRep.leakSqDb <= mCur.leakSqDb + 4);
      /* Strict mode widens what a repair may cost. A 0.5 ohm minimum is not
       * a quantity to trade against a tenth of a dB — it is a network the
       * designer would not build. The fundamentals still hold (crossing,
       * tweeter protection), and the note reports what the lift cost. */
      const strictOk =
        opts.zFloorStrict === true &&
        zRep.short < zCur.short - 0.1 &&
        mRep.protSqDb <= mCur.protSqDb + 3 &&
        mRep.xoDipDb <= mCur.xoDipDb + 1 &&
        nc(rep) <= nc(cur) * 1.5;
      /* FEASIBILITY BEATS QUALITY WHEN THE ALTERNATIVE IS DISQUALIFICATION.
       *
       * Both paths above compare the repair against the UNREPAIRED network and
       * refuse to pay much response quality for the lift. That is the wrong
       * comparison whenever a stated amplifier floor is in play: a network
       * below it is struck through by the ranking, so the real alternative is
       * not "a flatter design", it is NO design. Measured on Sanders 400/2100
       * candidate, which is exactly this case:
       *
       *     Z    0.50 → 3.20 Ω   (his rating, reached exactly)
       *     peak 1.24 → 2.44 dB  (his target: 2.5 — still met)
       *     phase 5.0 → 16.4°    (his target: 15 — missed by 1.4°)
       *     fx   0.299 → 9.316   (×31 — which is why both paths refused)
       *
       * The ×31 on fx reads as a catastrophe and is not one: in the units a
       * designer reads it is 1.2 dB and 11°, bought with a factor 6 on the
       * load. The app threw that away, delivered 0.65 Ω, and the ranking then
       * discarded the whole candidate — so the user got nothing while a
       * buildable design existed.
       *
       * So the repair stops judging quality here. Its job is feasibility:
       * clear the floor without surrendering a fundamental. Whether the price
       * was worth paying is the RANKING's question, and the ranking already
       * compares candidates on ripple and phase — this is the same "decisions
       * at decision points" split the rest of this file runs on. A repair that
       * comes out genuinely bad is not hidden: it competes on its own numbers
       * and loses to better candidates, which is different from being deleted.
       *
       * Targets are deliberately NOT required. They are the escalation's
       * stopping criterion, not a limit a design must clear to be allowed to
       * exist — missing 15° by 1.4° is not grounds to ship an unbuildable
       * network instead. */
      const feasibilityOk =
        ampFloorOhm !== null &&
        repairedEnough(zRep.short) &&
        zCur.short > zSlackOhm &&
        mRep.protSqDb <= mCur.protSqDb + 3 &&
        mRep.xoDipDb <= mCur.xoDipDb + 1 &&
        (!breakupGuard || mRep.leakSqDb <= mCur.leakSqDb + 4);
      const ok =
        (repairedEnough(zRep.short) &&
          targetsKept &&
          mRep.protSqDb <= mCur.protSqDb + 3 &&
          (nc(rep) <= nc(cur) || armsOk)) ||
        strictOk ||
        feasibilityOk;
      /* A3f: the repair may not buy its impedance lift with forbidden ground.
       * Raising resistance is exactly how this pass works, and R_source is
       * exactly what that raises — so it asks the one constraint definition
       * before committing. Violation means the whole pass is rolled back and
       * the candidate is declared infeasible; NOT partially applied, and not
       * "the better of two evils". Both goals unreachable at once is an honest
       * answer about this candidate. */
      const repViolation = ok ? constraintViolation(rep.parts) : null;
      if (ok && repViolation) {
        ampFloorRepair = 'refused';
        infeasible =
          `the amplifier-load repair would lift the impedance minimum to ` +
          `${zRep.min.toFixed(1)} Ω, but only by pushing ${repViolation}. Rolled back: ` +
          `lifting the load and staying under the source-resistance limit cannot both hold here`;
        ampFloorNote =
          `amp-load floor: repair REFUSED — it would have lifted ${zCur.min.toFixed(1)} → ` +
          `${zRep.min.toFixed(1)} Ω at the cost of the source-resistance limit`;
      } else if (ok) {
        ampFloorRepair = 'lifted';
        ampFloorNote =
          `amp-load floor: system impedance minimum lifted ` +
          `${zCur.min.toFixed(1)} → ${zRep.min.toFixed(1)} Ω (${ampFloorSource()})` +
          (zRep.short > zSlackOhm ? ' — still under the floor, but no longer a short' : '');
        cur = { ...rep, freeCount: cur.freeCount };
      } else {
        ampFloorRepair = 'failed';
        ampFloorNote =
          `amp-load floor: system impedance dips to ${zCur.min.toFixed(1)} Ω ` +
          `(${ampFloorSource()}) and could not be repaired without losing response quality — ` +
          `check the Impedance panel`;
      }
    }
  }

  let snapNote: string | undefined;
  stage('catalog snap');
  /* ---- Catalog snap (final step): land every free part on purchasable
   * values, judged on the ASSEMBLED network with real DCR/ESR riding along.
   * Runs last on purpose — any later value tune would un-snap it. ---- */
  if (opts.catalogSnap && hasImportedCatalog()) {
    const KIND_OF: Record<string, 'L' | 'C' | 'R'> = {
      Inductor: 'L',
      Capacitor: 'C',
      Resistor: 'R',
    };
    const cw = opts.costWeight ?? 0.0015;
    const upsert = (params: VxpPart['params'], name: string, value: number, unit: string) => {
      const hit = params.find((q) => q.name === name);
      if (hit) return params.map((q) => (q.name === name ? { ...q, value } : { ...q }));
      return [...params.map((q) => ({ ...q })), { name, value, unit }];
    };
    // Reference impedance for the coil DCR budget: the median |Z| the network
    // actually works into. Measured, not assumed, so a 4 Ω mid gets a tighter
    // ceiling than an 8 Ω woofer without a second constant to keep in sync.
    const refOhms = (() => {
      const zs: number[] = [];
      for (const z of Object.values(driverZ)) {
        for (const c of z) zs.push(Math.hypot(c.re, c.im));
      }
      zs.sort((a, b) => a - b);
      return zs.length > 0 ? zs[Math.floor(zs.length / 2)] : 0;
    })();
    const snapPrefs: SnapPrefs = { profile: 'auto', ...(opts.snapPrefs ?? {}), refOhms };
    const snapables = cur.parts
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => KIND_OF[q.type] && !q.locked && !q.open && !q.shorted && q.partId);
    // Position per part: shared bus-path BFS (see busTopology) — the same
    // classification the tuner's realism anchor uses, plus which driver each
    // series element feeds.
    const bus = busTopology(cur.parts);
    const posOfPart = bus.positionOf;
    /* PER-BRANCH COIL DCR BUDGET (aug 2026 — Sanders "19 simulaties en we
     * kunnen niets beters verzinnen"). Two things were wrong at once, and
     * together they handed the amplifier 1.7 Ω where his own hand-built filter
     * sits at 0.23 Ω:
     *
     *  (1) the reference was the median |Z| POOLED over every driver (5.66 Ω
     *      on the KOAN set, lifted by the tweeter and by every coil's
     *      inductive rise) while the coil in question feeds a woofer pair
     *      whose Re is 3.2 Ω — the guard was twice as generous as it should be
     *      exactly in the branch that carries the current;
     *  (2) the allowance was PER PART while source resistance is PER BRANCH,
     *      so two or three series elements each cleared their own 0.5 dB and
     *      the branch total was never looked at.
     *
     * So: reference = the MINIMUM |Z| of that branch's own driver (Re-like:
     * the dip above resonance, before the inductive rise), budget = one branch
     * allowance (branchDcrBudgetOhms), split over the branch's series coils in
     * proportion to L^0.65 — the same exponent estimateCoilDcr uses, because a
     * big coil legitimately needs more copper than a small one. An element on
     * a shared section belongs to several drivers and takes the strictest.
     *
     * Feasibility, not preference: it applies at every profile, it never
     * empties a pool (pickCandidates keeps the lowest-DCR part), and it is a
     * bound on the SEARCH SPACE — it is never a term in the objective. */
    const reOf = (model: string): number => {
      const z = driverZ[model];
      if (!z || z.length === 0) return 0;
      let lo = Infinity;
      for (const c of z) lo = Math.min(lo, Math.hypot(c.re, c.im));
      return isFinite(lo) ? lo : 0;
    };
    /* The same three states as `rSourceLimit` above, and deliberately the same
     * expression: this is the branch-DCR ceiling the catalogue snap works
     * against, and a tier that meant one thing to the search and another to the
     * snap is the arrangement `impedanceFloor.ts` exists to prevent. */
    const rSrcLimit = rSourceLimit;
    const coilWeight = (q: VxpPart): number => {
      const v = q.params.find((p) => p.name === 'L')?.value ?? 0;
      return v > 0 ? v ** 0.65 : 0;
    };
    /** Per-branch series-coil weight totals, for the proportional split. */
    const branchCoilWeight = new Map<string, number>();
    for (const { q } of snapables) {
      if (q.type !== 'Inductor') continue;
      for (const m of bus.driversOf(q.partId!)) {
        branchCoilWeight.set(m, (branchCoilWeight.get(m) ?? 0) + coilWeight(q));
      }
    }
    const dcrCeilFor = (q: VxpPart): number | undefined => {
      if (q.type !== 'Inductor') return undefined;
      const models = bus.driversOf(q.partId!);
      if (models.length === 0) return undefined;
      const w = coilWeight(q);
      if (!(w > 0)) return undefined;
      let ceil = Infinity;
      for (const m of models) {
        const total = branchCoilWeight.get(m) ?? 0;
        if (!(total > 0)) continue;
        const budget = branchDcrBudgetOhms(reOf(m), rSrcLimit);
        ceil = Math.min(ceil, (budget * w) / total);
      }
      return isFinite(ceil) ? ceil : undefined;
    };
    const cands = snapables.map(({ q }) => {
      const kind = KIND_OF[q.type];
      const u = PARAM_OF[kind];
      const raw = q.params.find((p) => p.name === u.name)?.value ?? 0;
      return pickCandidates(kind, raw / u.factor, 3, snapPrefs, posOfPart(q.partId!), dcrCeilFor(q));
    });
    const applied = (ch: (CatalogPick | null)[]): VxpPart[] => {
      const out = cloneParts(cur.parts);
      snapables.forEach(({ q, i }, j) => {
        const p = ch[j];
        if (!p) return;
        const kind = KIND_OF[q.type];
        const u = PARAM_OF[kind];
        let params = upsert(out[i].params, u.name, Number((p.value * u.factor).toPrecision(4)), '');
        if (kind === 'L') params = upsert(params, 'DCR', Number(p.seriesR.toPrecision(3)), 'Ω');
        if (kind === 'C') params = upsert(params, 'ESR', Number(p.seriesR.toPrecision(3)), 'Ω');
        out[i] = { ...out[i], params, catalog: p.parts.map((x) => x.id).join('+') };
      });
      return out;
    };
    /* AMP LOAD SURVIVES THE SNAP. The snap judges on fxOf(), and the amp-load
     * floor is deliberately absent there (see the amplifier-load note) — so the discrete
     * pass happily undid the repair that ran two steps earlier. Measured on
     * Sander's 3-way: "minimum lifted 2.1 → 2.4 Ω" in the note while the
     * delivered network sat at 1.9 Ω, because the catalog values that fit best
     * put the dip back. Same disease as the relative repair bar: a guard
     * enforced at one step and silently undone at the next.
     *
     * Kept at DECISION level, and deliberately a steep penalty rather than a
     * hard reject: when no purchasable combination clears the bar the descent
     * must still rank the least-bad ones instead of collapsing to "first
     * candidate in every slot". Asking for more than the floor is pointless,
     * and a pre-snap network already under it only has to not get worse. */
    /* With a rating: aim at it, and never worse than the network already is.
     * WITHOUT one: purely RELATIVE — "do not give back what the value tune
     * achieved". That needs no assumption about anybody's amplifier and is
     * the only part of the old floor's job that survives its removal. */
    /* ---- THE SNAP DECIDES ON WHAT IT DELIVERS ------------------------------
     *
     * `quickFxZ` scores on the DECIMATED optimisation grid (48 of 240 points
     * here). For the value tune that is fine: it perturbs continuously and the
     * decimation averages out. The snap does something else — it runs a
     * coordinate descent over discrete alternatives and moves a long way.
     * Measured on Sanders 400/2100 candidate, the network the repair handed
     * over versus the one the snap chose:
     *
     *     coarse (48)   fx 132.2 → 42.5     "three times better"
     *     full  (240)   peak 2.44 → 3.17 dB, phase 16.4 → 34.2°
     *
     * It optimised itself into a hole it could not see. Both other suspects
     * were measured and cleared first: the impedance term costs nothing
     * (with it 34.2°, without it 34.3° — it buys 1.19 Ω for a tenth of a
     * degree), and the end audit costs 0.01 dB and 0.6°.
     *
     * So the snap scores on the grid it delivers on. It is the same lesson
     * this file keeps paying for — a decision taken on a coarser quantity than
     * the thing being decided — and the same one that broke a guard of mine
     * earlier the same day. The extra solves are the price of the answer being
     * about the network that ships. */
    const snapFxZ = (ps: readonly VxpPart[]): { fx: number; zMin: number } => {
      tick();
      const m = metricsOn(buildWork(ps).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
      return { fx: fxOf(m), zMin: m.zMinOhm };
    };
    const zPre = snapFxZ(cur.parts).zMin;
    const zSnapTarget = ampFloorOhm === null ? zPre : Math.min(ampFloorOhm, zPre);
    const snapScore = (ch: (CatalogPick | null)[]): number => {
      const extra = ch.reduce((a, p) => a + (p ? p.parts.length - 1 : 0), 0);
      const cost = ch.reduce((a, p) => a + (p?.priceEur ?? 0), 0);
      let fx: number;
      let zMin: number;
      try {
        ({ fx, zMin } = snapFxZ(applied(ch)));
      } catch {
        return 1e12;
      }
      const zShort = Math.max(0, zSnapTarget - zMin);
      return fx * (1 + 0.05 * extra) * (1 + cw * cost) * (1 + 20 * zShort);
    };
    const descend = (candSets: CatalogPick[][]): { picks: (CatalogPick | null)[]; score: number } => {
      let ps: (CatalogPick | null)[] = candSets.map((c) => c[0] ?? null);
      let best = snapScore(ps);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < ps.length; j++) {
          for (const cand of candSets[j]) {
            if (cand === ps[j]) continue;
            const trial = [...ps];
            trial[j] = cand;
            const sc = snapScore(trial);
            if (sc < best) {
              best = sc;
              ps = trial;
            }
          }
        }
      }
      return { picks: ps, score: best };
    };
    const withStacks = descend(cands);
    let picks = withStacks.picks;
    // Conscious stacking: when stacks got picked, also price the singles-only
    // variant and report the percentage difference — the designer sees what
    // stacking bought instead of discovering it in the BOM.
    if (picks.some((p) => p && p.parts.length > 1)) {
      const noStackPrefs: SnapPrefs = { ...snapPrefs, allowStacks: false };
      const singleCands = snapables.map(({ q }) => {
        const kind = KIND_OF[q.type];
        const u = PARAM_OF[kind];
        const raw = q.params.find((p) => p.name === u.name)?.value ?? 0;
        return pickCandidates(
          kind,
          raw / u.factor,
          3,
          noStackPrefs,
          posOfPart(q.partId!),
          dcrCeilFor(q),
        );
      });
      const singlesOnly = descend(singleCands);
      const costOf = (ch: (CatalogPick | null)[]) =>
        ch.reduce((a, p) => a + (p?.priceEur ?? 0), 0);
      const dFit = ((singlesOnly.score - withStacks.score) / withStacks.score) * 100;
      const dEur = costOf(withStacks.picks) - costOf(singlesOnly.picks);
      const stacksBetter = withStacks.score <= singlesOnly.score;
      if (opts.snapPrefs?.allowStacks === false || (!stacksBetter && singlesOnly.score > 0)) {
        // Singles won: stacks lose by |dFit| (dFit ≤ 0 in this branch).
        picks = singlesOnly.picks;
        snapNote = `snap: singles only (stacks would fit ${Math.abs(dFit).toFixed(0)}% worse)`;
      } else {
        const n = withStacks.picks.filter((p) => p && p.parts.length > 1).length;
        snapNote =
          `snap: ${n} stack${n > 1 ? 's' : ''} — singles-only would fit ` +
          `${Math.abs(dFit).toFixed(0)}% ${dFit > 0 ? 'worse' : 'better'}` +
          (Number.isFinite(dEur) && Math.abs(dEur) >= 0.5
            ? ` and cost €${Math.abs(dEur).toFixed(0)} ${dEur > 0 ? 'less' : 'more'}`
            : '');
      }
    }
    /* ---- Catalog RANGE report (Sanders' 7 kHz breakup, jul 2026): the tuner
     * wanted 269 Ω and 118 Ω damping resistors for its traps; the imported
     * catalog stops at 33 Ω, so the snap quietly handed back traps with a
     * third of the depth and the breakup peak returned. A coverage gap is
     * invisible in the values — it only shows as a mysterious fit loss — so
     * name it: which slots are pinned against the end of what the catalog
     * offers, and how far short they fall. ---- */
    {
      const short: string[] = [];
      snapables.forEach(({ q }, j) => {
        const p = picks[j];
        const kind = KIND_OF[q.type];
        if (!p || !kind) return;
        const u = PARAM_OF[kind];
        const want = (q.params.find((x) => x.name === u.name)?.value ?? 0) / u.factor;
        if (!(want > 0)) return;
        // Only flag a REAL shortfall: the pick is >25% off and nothing in the
        // candidate list gets closer (i.e. we are against the range edge).
        const got = p.value;
        const rel = Math.abs(got - want) / want;
        if (rel < 0.25) return;
        const better = cands[j].some((c) => Math.abs(c.value - want) / want < rel - 1e-9);
        if (better) return;
        const fmt = (v: number) =>
          kind === 'L' ? `${(v * 1e3).toPrecision(3)} mH`
          : kind === 'C' ? `${(v * 1e6).toPrecision(3)} µF`
          : `${v.toPrecision(3)} Ω`;
        short.push(`${q.partId} wants ${fmt(want)}, catalog offers ${fmt(got)}`);
      });
      if (short.length > 0) {
        snapNote =
          (snapNote ? `${snapNote} · ` : '') +
          `⚠ catalog range: ${short.join('; ')} — the fit is limited by what the ` +
          `catalog stocks, not by the design. Add those values (🗂 Manage…) or ` +
          `switch Snap to catalog off to see what the design can really do.`;
      }
    }
    /* ---- Same rule for the coil DCR budget. A branch budget the catalog
     * cannot meet is exactly as invisible as a value it cannot cover: the
     * network works, the response is flat, and the price is paid in
     * efficiency and bass damping where no response metric looks. Name it,
     * with the number, so it reads as a stock problem and not as a design
     * that mysteriously landed on thin wire. ---- */
    {
      const over: string[] = [];
      let branchTotal = 0;
      let branchBudget = Infinity;
      snapables.forEach(({ q }, j) => {
        const p = picks[j];
        if (!p || q.type !== 'Inductor') return;
        const ceil = dcrCeilFor(q);
        if (ceil === undefined || !isFinite(ceil)) return;
        branchTotal += p.seriesR;
        if (p.seriesR > ceil * 1.05) {
          over.push(`${q.partId} ${p.seriesR.toFixed(2)} Ω (budget ${ceil.toFixed(2)} Ω)`);
        }
      });
      for (const { q } of snapables) {
        if (q.type !== 'Inductor') continue;
        for (const mo of bus.driversOf(q.partId!)) {
          branchBudget = Math.min(branchBudget, branchDcrBudgetOhms(reOf(mo), rSrcLimit));
        }
      }
      if (over.length > 0) {
        snapNote =
          (snapNote ? `${snapNote} · ` : '') +
          `⚠ coil DCR over budget: ${over.join('; ')}` +
          (isFinite(branchBudget)
            ? ` — the series path totals ${branchTotal.toFixed(2)} Ω against a ` +
              `${branchBudget.toFixed(2)} Ω branch budget`
            : '') +
          `. That is source resistance the amplifier sees: thicker wire (or a ` +
          `core coil) at these values, or fewer series elements.`;
      }
    }
    /* A3f: same rule for the snap. Real parts carry whatever DCR the catalogue
     * stocks, so landing on purchasable values can push R_source past the
     * limit — and this pass runs LAST, after everything that respected it.
     * There is precedent for the shape of this failure a few lines below: the
     * snap already gives back part of the amplifier-floor repair, which went
     * unnoticed for a long time.
     *
     * Rolled back whole. Continuous values that cannot be bought are a worse
     * answer than "this candidate does not work", but they are an HONEST one,
     * and the note says which it is. */
    const snapped = applied(picks);
    const snapViolation = constraintViolation(snapped);
    if (snapViolation) {
      infeasible =
        `the catalog snap would land on purchasable parts whose ${snapViolation}. Rolled back to ` +
        `the continuous values — those are not buyable, so this candidate cannot be built as it ` +
        `stands: give the low branch thicker wire to choose from, or fewer series elements`;
      snapNote =
        (snapNote ? `${snapNote} · ` : '') +
        `⚠ snap REFUSED: purchasable parts would break the source-resistance limit`;
    } else {
      cur = { ...cur, parts: snapped };
    }
  }

  /* ---- GATE 4 (end): the same audit, and it runs LAST — after the shrink
   * ladder, the amplifier-load repair and the catalog snap. It used to sit
   * before all three, which meant the report the designer reads described a
   * network that three later passes then changed, and anything those passes
   * made inert was never looked at. That is the same shape as every other bug
   * in this file: a decision taken on a quantity a later stage still moves.
   *
   * NO RETUNE after this one, unlike the old call site. A retune would pull
   * every value back off its catalog part and undo the snap. It costs nothing
   * to skip: `inert` means dA < 0.15 dB and dP < 1.5°, and the audit re-checks
   * every removal on the full grid and reverts on regression, so what leaves
   * here could not have been worth tuning around. ---- */
  const endAudit = runAudit(cur.parts, 'part audit');
  if (endAudit) {
    if (endAudit.applied) cur = { ...cur, parts: endAudit.parts, metrics: endAudit.metrics, fx: fxOf(endAudit.metrics) };
    auditReport = endAudit.report;
    if (seedAudit) {
      // Seed removals are already gone from the parts; carry their entries
      // into the shown report so the user sees WHY they went.
      auditReport.entries.unshift(...seedAudit.report.entries.filter((e) => e.applied));
    }
  } else if (seedAudit) auditReport = seedAudit.report;

  /* ---- Finish: materialise removals, report on the full grid ---- */
  let outParts: VxpPart[] = [];
  for (const q of cur.parts) {
    if (q.open && removed.includes(q.partId ?? '')) continue; // gone
    if (q.shorted && removed.includes(q.partId ?? '')) {
      // A pruned series part lives on as a wire between its terminals.
      outParts.push({
        type: 'Wire',
        params: [],
        wires: [{ ...q.wires[0] }, { ...q.wires[q.wires.length - 1] }],
      });
      continue;
    }
    outParts.push(q);
  }
  // Pruning a chain member orphans its neighbours' wires and ground symbol —
  // electrically dead (they hang on their own ground) but the schematic
  // LOOKS broken. Staged mode owns the schematic's cleanliness: sweep ALL
  // wires/grounds whose net touches no component — the debris this run
  // created AND leftovers from earlier runs. commitSchematic is undo-able,
  // so an accidentally swept sketch is one Undo away.
  if (opts.staged || removed.length > 0) {
    const un = unanchoredKeys(outParts);
    outParts = outParts.filter((q) => !un.has(debrisKey(q)));
    outParts = trimStubs(outParts);
  }
  const after = metricsOn(buildWork(outParts).work, grid, wBase, tBase, midFull, driverZ, angleData ?? null);
  // The peak the SEARCH saw (error-smoothed magnitudes on the full grid) —
  // reported beside the raw peak so a scan row does not look worse than the
  // loudspeaker is; targets and gates keep judging the raw number.
  const afterSmoothPeak =
    errSm > 0
      ? metricsOn(
          buildWork(outParts).work,
          grid,
          smoothMag(wBase),
          smoothMag(tBase),
          midFull ? smoothMag(midFull) : null,
          driverZ,
          null,
        ).ripplePeakDb
      : after.ripplePeakDb;

  // before/after report the PEAK ±dB (the strip's unit, matching the target)
  // plus the whole-range avg |deviation| for the chain ranking / scan table.
  /* The DELIVERED absolute impedance minimum, judged on the eval grid AND the
   * safety grid when one is given — a narrow dip outside a zoomed view range
   * is exactly the one that reaches the amplifier anyway.
   *
   * WHY REPORT IT: the safety gate is RELATIVE (it only refuses a tune that
   * makes the dip worse than the seed), so a design whose seed already sat
   * under the floor passes every gate and still ships an amp-hostile load.
   * Nothing downstream could see that number; the chain ranking now can. */
  const zMinOf = (m: Metrics, ps: readonly VxpPart[]): number => {
    let min = m.zMinOhm;
    if (opts.safety) {
      const sg = opts.safety;
      const ms = metricsOn(buildWork(ps).work, sg.freqs, sg.w, sg.t, sg.m ?? null, sg.z, null);
      if (ms.zMinOhm < min) min = ms.zMinOhm;
    }
    return min;
  };
  /* The snap runs BEFORE this point, so the repair's claim has to be checked
   * against what actually ships. A note reading "lifted 2.1 → 2.4 Ω" on a
   * network delivering 1.9 Ω is worse than no note at all — it is the reason
   * the give-back went unnoticed for as long as it did. */
  /* A3f, THE BACKSTOP. Rolling individual passes back covers the ones that were
   * inventoried; this covers the rest, including the case where there is
   * nothing to roll back at all — when EVERY point in the search violates the
   * constraint, the minimum still violates it. A branch that needs its pad to
   * make level, on a limit its pad cannot meet, is simply a candidate that does
   * not work.
   *
   * One final check on what is actually being handed over, so the flag cannot
   * depend on having thought of every pass. */
  /* THE NUMBER A RANKING MAY JUDGE ON IS THE DELIVERED ONE.
   *
   * auditReport used to be frozen at gate 4 while three value-moving passes
   * ran after it, so audit.rSourceOhm described the network as it was several
   * passes ago. Measured then, on Sander's 562/2270 candidate: the audit reads
   * 2.0002 Ω and the ranking disqualifies on it, while the network that
   * actually ships measures 1.64 Ω and is comfortably inside the 2.0 Ω limit.
   * Gate 4 has since moved to the end; this number stays the one to judge on
   * anyway, because it is computed on the parts handed over and therefore
   * cannot go stale if another pass is appended later.
   *
   * That is the same disease as the bug that started this round (R_source read
   * off the grid edge): the figure in the table is not the figure of the thing
   * delivered. The audit keeps its own number — it is an honest diagnostic OF
   * THE TUNED NETWORK, and its per-part verdicts belong to that network — but
   * the ranking reads this one, computed by the same function the constraint
   * uses so a candidate cannot be refused by one definition and accepted by
   * another. */
  {
    const finalViolation = constraintViolation(outParts);
    if (finalViolation && !infeasible) {
      infeasible =
        `${finalViolation}. Nothing was rolled back — no arrangement of these values met the ` +
        `limit, so the constraint is not what this candidate failed on, the candidate is`;
    }
  }
  /* A3g — THE AMP LOAD, JUDGED ON WHAT SHIPS.
   *
   * This pass runs BEFORE the catalog snap, so every number it wrote describes
   * a network that no longer exists. Measured on Sanders 562/2270 candidate:
   * the note said "dips to 0.4 Ω" while the delivered network measures 0.70 Ω.
   * Same quantity, two values, and the verdict hung on the wrong one.
   *
   * And the ASYMMETRY he named: A3f made a pass that would break a constraint
   * roll itself back and declare the candidate infeasible, but a pass that
   * simply COULD NOT REACH ITS GOAL still shipped a design with a warning
   * attached. Those are the same situation. His NAD M10 V2 is class-D and
   * drops into protection below 2 Ω: 0.70 Ω is not a demanding load, it is a
   * short circuit. A design that lands there is not worse, it is unusable —
   * so an unrepaired floor is a disqualification, decided on the DELIVERED
   * minimum and with the same predicate the repair itself used (a seed that
   * already dipped keeps its own reference, so a user's own network is never
   * condemned for a dip this run did not cause). */
  if (ampFloorRepair !== 'none') {
    const zDel = worstZOf(after, outParts);
    const repairedEnough = (x: number): boolean =>
      opts.zFloorStrict ? x <= zSlackOhm : x <= Math.max(zSlackOhm, ampFloorSeedShort + zSlackOhm);
    if (ampFloorRepair === 'lifted') {
      const claimed = /→ ([\d.]+) Ω/.exec(ampFloorNote ?? '');
      if (claimed && zDel.min < parseFloat(claimed[1]) - 0.05) {
        ampFloorNote += `; the catalog snap gave part of that back — delivered ${zDel.min.toFixed(1)} Ω`;
      }
    } else if (ampFloorRepair === 'failed') {
      // Restate the headline number on the network handed over, not on the
      // one this pass was looking at.
      ampFloorNote =
        `amp-load floor: system impedance dips to ${zDel.min.toFixed(1)} Ω ` +
        `(${ampFloorSource()}) and could not be repaired without losing response quality — ` +
        `check the Impedance panel`;
    }
    if (!repairedEnough(zDel.short) && !infeasible) {
      infeasible =
        `the delivered network presents ${zDel.min.toFixed(2)} Ω to the amplifier, ` +
        `under ${ampFloorSource()}, and the load could not be repaired — this is not a ` +
        `worse design, it is one you told this app your amplifier will refuse to drive`;
    }
  }

  const report = (m: Metrics, ps: readonly VxpPart[]) => ({
    rippleDb: m.ripplePeakDb,
    avgDevDb: m.avgDevDb,
    phaseDeg: m.phaseDeg,
    zMinOhm: zMinOf(m, ps),
    // Measured on the parts this report is ABOUT — that is the whole point of
    // report() taking them (A3g). One extra solve per call, twice per run.
    rSourceOhm: rSourceOf(ps),
    // Energy-average (in-room) flatness of the delivered sum, when angle
    // data armed it — so a ranking can weigh the power response, not only
    // the on-axis curve (window spec rule 9).
    ...(m.powerStdDb !== null ? { powerStdDb: m.powerStdDb } : {}),
    ...(m.powerFoldDb !== null ? { powerFoldDb: m.powerFoldDb } : {}),
    ...(m.dissRatio !== null ? { dissRatio: m.dissRatio } : {}),
    ...(m.powerSlopeDbDec !== null ? { powerSlopeDbDec: m.powerSlopeDbDec } : {}),
    ...(m.pairPhaseDeg.length > 1 ? { pairPhaseDeg: m.pairPhaseDeg } : {}),
    ...(m.xoHzPairs.length > 1 ? { xoHzPairs: m.xoHzPairs } : {}),
    ...(m.pairOverlapOct.length > 1 ? { pairOverlapOct: m.pairOverlapOct } : {}),
  });

  /* ---- SOLO sensitivity gate (see soloSensBudgetDb): a tuned result that
   * bought its flatness with broadband attenuation loses to the seed. The
   * flatness objective cannot see the difference, so this must be a gate.
   * Only fires when the SEED was inside the budget — a user network that is
   * already padded down keeps its own level as the reference. ---- */
  if (solo) {
    const seedLoss = rawMedianRef - before.medianDb;
    const resLoss = rawMedianRef - after.medianDb;
    // Judged against the SAME cap the wall enforces, plus a little slack: the
    // wall permits exactly soloLossCap, so a result sitting on the cap must
    // not then be thrown away by the gate (measured: a 6.0 dB result against a
    // 6 dB cap lost the whole tune over floating-point dust). The gate is the
    // backstop for gross violations, not a second, stricter limit.
    if (resLoss > soloLossCap + 0.5 && resLoss > seedLoss + 0.2) {
      return {
        parts: cloneParts(parts),
        before: report(before, parts),
        after: report(before, parts),
        tuned: 0,
        evaluations,
        removed: [],
        added: [],
        bandNote:
        `optimised on ${Math.round(band[0])}–${Math.round(band[1])} Hz` +
        (opts.band ? '' : ' (full grid minus edges — no validity band supplied)'),
      ...(opts.rejectedTuneReport
          ? { rejectedTune: report(after, outParts), rejectedParts: cloneParts(outParts) }
          : {}),
      /* V33 — the same refusal, in the one shape a caller detects (see
       * `refusal`). Absent on a v1 run, where neither v2 mechanism is armed. */
      ...(opts.rejectedTuneReport || opts.gateViolation
        ? {
            refusal: {
              by: 'safety-gate' as const,
              kinds: [] as string[],
              reason: `the tune attenuated the driver ${resLoss.toFixed(1)} dB below its own level (budget ${soloSensBudgetDb} dB)`,
              note:
                'The solo sensitivity gate refused the whole tune, so this run delivers no ' +
                'network. Flattening by pulling everything down is not a filter.',
            },
          }
        : {}),
      safetyNote:
          `sensitivity gate: the tune reached its flatness by attenuating the driver ` +
          `${resLoss.toFixed(1)} dB below its own level (budget ${soloSensBudgetDb} dB) — ` +
          `rejected, your values are unchanged. Flattening by pulling everything down is not ` +
          `a filter; check for oversized series resistors, or narrow the view range to the ` +
          `band this driver should actually cover.`,
        // Same rule as the full-band gate below: the seed is what is returned,
        // so the repair note has to say which network it is about (A3g).
        ...(ampFloorNote ? { ampFloorNote: `the rejected tune — ${ampFloorNote}` } : {}),
      };
    }
  }

  /* ---- Full-band safety gate: the evaluation band is the user's design
   * scope, but fundamentals are whole-design properties. Re-check them on
   * the full measurement band; a result that degenerates out there (lost
   * crossing, valley crossing, unprotected tweeter) loses to the seed. ---- */
  if (opts.safety) {
    const s = opts.safety;
    const seedS = metricsOn(buildWork(parts).work, s.freqs, s.w, s.t, s.m ?? null, s.z, null);
    const resS = metricsOn(buildWork(outParts).work, s.freqs, s.w, s.t, s.m ?? null, s.z, null);
    const reasons: string[] = [];
    /* The CATEGORY is recorded where the reason is decided, never re-derived
     * from the sentence afterwards — the sentence is for a human and may be
     * reworded; the category is what a caller may act on. */
    const kinds: SafetyKind[] = [];
    // Per PAIR: in a 3-way losing EITHER crossing is the same degeneration
    // (with one pair this is exactly the old xoHz check).
    for (let pi = 0; pi < Math.max(seedS.xoHzPairs.length, resS.xoHzPairs.length); pi++) {
      if (resS.xoHzPairs[pi] == null && seedS.xoHzPairs[pi] != null) {
        reasons.push(
          seedS.xoHzPairs.length > 1
            ? `the ${pi === 0 ? 'low' : 'high'} acoustic crossing disappeared`
            : 'the acoustic crossing disappeared',
        );
        kinds.push('crossing');
      }
    }
    if (resS.xoDipDb > seedS.xoDipDb + 2) {
      reasons.push(`the crossing sank into a ${resS.xoDipDb.toFixed(0)} dB hole`);
      kinds.push('valley');
    }
    if (resS.protSqDb > seedS.protSqDb + 3) {
      reasons.push('tweeter protection got worse');
      kinds.push('protection');
    }
    let zReason = false;
    if (resS.zShortOhm > seedS.zShortOhm + 0.2) {
      zReason = true;
      kinds.push('load');
      // Honest attribution: a seed that already sits under the floor is a
      // DESIGN property (three parallel branches around a crossover often
      // are), not something the tuner broke — say so.
      const seedTail =
        seedS.zShortOhm > 0 ? ` — the seed already sat at ${seedS.zMinOhm.toFixed(1)} Ω` : '';
      reasons.push(
        `the system impedance dips to ${resS.zMinOhm.toFixed(1)} Ω ` +
          `(${ampFloorSource()})${seedTail}`,
      );
    }
    if (reasons.length > 0) {
      // The band advice only fits the band-scoped degenerations; an amp-load
      // dip can happen on a full view range and has its own remedy.
      const tail =
        zReason && reasons.length === 1
          ? 'Check the Impedance panel; a series resistor in the offending shunt/trap is the usual fix.'
          : 'The evaluated band is narrower than the measurement; widen the view range to let ' +
            'the optimizer see the whole design.';
      return {
        parts: cloneParts(parts),
        before: report(before, parts),
        after: report(before, parts),
        tuned: 0,
        evaluations,
        removed: [],
        added: [],
        bandNote:
        `optimised on ${Math.round(band[0])}–${Math.round(band[1])} Hz` +
        (opts.band ? '' : ' (full grid minus edges — no validity band supplied)'),
      safetyNote: `safety gate: tune rejected on the full measurement band — ${reasons.join('; ')}. ${tail}`,
      safetyKinds: kinds,
      /* V33 — the same refusal, in the one shape a caller detects. `kinds` is
       * the same array `safetyKinds` carries: one decision, recorded once. */
      ...(opts.rejectedTuneReport || opts.gateViolation
        ? {
            refusal: {
              by: 'safety-gate' as const,
              kinds: [...kinds] as string[],
              reason: reasons.join('; '),
              note:
                'The full-band safety gate refused the whole tune, so this run delivers no ' +
                'network. What it fell back on is the SEED, which nobody judged against this ' +
                "run's goal (casebook V31).",
            },
          }
        : {}),
      /* V31 — what was thrown away. Reporting only; no rule above reads it. */
      ...(opts.rejectedTuneReport
        ? { rejectedTune: report(after, outParts), rejectedParts: cloneParts(outParts) }
        : {}),
        // What the repair pass tried/achieved on the REJECTED tune — it
        // explains why the gate saw a dip. Prefixed because the network being
        // returned is the seed, not the one this sentence is about (A3g: a
        // note may never be read as describing the delivered design).
        ...(ampFloorNote ? { ampFloorNote: `the rejected tune — ${ampFloorNote}` } : {}),
      };
    }
  }

  /* ---- V33: THE VALUE TUNE WAS REFUSED AND NOTHING AFTER IT RECOVERED ----
   *
   * The V31 form, one rule further out. V31 established what a run owes its
   * caller when a whole tune is thrown away: a refusal with the rule that
   * refused it and the metrics of what was refused — never a seed, because a
   * seed is a network nobody judged against anything this run was asked for.
   * That was written for the full-band safety gate. The v2 gate hook throws a
   * whole tune away in exactly the same sense and did not say so.
   *
   * THE SECOND CONDITION IS NOT DECORATION. `cur` fell back to the seed, and
   * the passes after it — the reseed challenge, the drift catch, the staged
   * barrier, prune, escalation — are real searches that are each gate-checked
   * before they are accepted. If one of them delivered a network this gate
   * accepts, then this run DID find an admissible design and calling that "no
   * network" would throw away a legal answer. So the refusal stands only when
   * what is actually being handed over is refused too, and the question is put
   * to the same one place every other acceptance goes through.
   *
   * The reason reported is the one that refused the TUNE, because that is the
   * rule this candidate ran into; the delivered network's own sentence is
   * appended so a reader can see both. Guarded on the hook, so no v1 run
   * reaches a line of this. ---- */
  if (refusedValueTune !== null && opts.gateViolation) {
    const deliveredRefusal = gateRefusal(outParts, 'delivered network');
    if (deliveredRefusal !== null) {
      const refusedMetrics = fullOf(refusedValueTune.parts);
      return {
        parts: cloneParts(parts),
        before: report(before, parts),
        after: report(before, parts),
        tuned: 0,
        evaluations,
        removed: [],
        added: [],
        bandNote:
          `optimised on ${Math.round(band[0])}–${Math.round(band[1])} Hz` +
          (opts.band ? '' : ' (full grid minus edges — no validity band supplied)'),
        refusal: {
          by: 'active-gate',
          /* One category, recorded where the decision is taken (A3g). It is
           * not the gate's NAME: which gate refused is in `reason`, and a
           * caller that switched on a gate name would be parsing prose. */
          kinds: ['gate'],
          reason: refusedValueTune.reason,
          note:
            'An active gate refused the whole value tune, and what the run then fell back on is ' +
            `refused as well — ${deliveredRefusal}. So this run delivers no network rather than a ` +
            'seed nobody tuned against the goal it was given (casebook V31, V33).',
        },
        ...(zFloorSourceNote ? { zFloorSourceNote } : {}),
        ...(rSourceProbeNote ? { rSourceProbeNote } : {}),
        ...(opts.rejectedTuneReport
          ? {
              rejectedTune: report(refusedMetrics, refusedValueTune.parts),
              rejectedParts: cloneParts(refusedValueTune.parts),
            }
          : {}),
        ...(ampFloorNote ? { ampFloorNote: `the rejected tune — ${ampFloorNote}` } : {}),
        ...(auditReport ? { audit: auditReport } : {}),
        gateRefusals,
        gateEvaluations,
        gateCacheHits,
      };
    }
  }

  // Value-window transparency: which series-path slots got bound to a series'
  // range, and what that constraint cost vs an UNCONSTRAINED fit of the seed
  // (both judged on the full grid). Only when boundToSeries is active.
  let valueWindowNote: string | undefined;
  if (opts.snapPrefs?.boundToSeries) {
    const pos = busPositions(parts);
    const bound: string[] = [];
    for (const q of parts) {
      if (!q.partId || q.open || q.shorted) continue;
      const kind =
        q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : q.type === 'Resistor' ? 'R' : null;
      if (!kind) continue;
      if (boundSeriesWindow(kind, pos(q.partId) === 'series')) {
        const sid = opts.snapPrefs.seriesByKind![kind]!;
        const sr = allSeries().find((x) => x.id === sid);
        bound.push(`${q.partId} → ${sr ? `${sr.brand} ${sr.series}` : sid}`);
      }
    }
    if (bound.length > 0) {
      const freeBase = tune(parts, 1, null, false);
      const freeFull = metricsOn(
        buildWork(freeBase.parts).work,
        grid,
        wBase,
        tBase,
        midFull,
        driverZ,
        angleData ?? null,
      );
      const dR = after.ripplePeakDb - freeFull.ripplePeakDb;
      const dP = after.phaseDeg - freeFull.phaseDeg;
      const cost =
        dR > 0.05 || dP > 0.3
          ? `costs +${Math.max(0, dR).toFixed(2)} dB / +${Math.max(0, dP).toFixed(1)}° vs unconstrained`
          : 'no measurable cost vs unconstrained';
      valueWindowNote = `value window — ${bound.join(', ')}; ${cost}`;
    }
  }

  return {
    parts: outParts,
    before: report(before, parts),
    after: { ...report(after, outParts), xoHz: after.xoHz, ripplePeakSmoothedDb: afterSmoothPeak },
    tuned: cur.freeCount,
    evaluations,
    removed,
    added,
    bandNote:
      `optimised on ${Math.round(band[0])}–${Math.round(band[1])} Hz` +
      (opts.band ? '' : ' (full grid minus edges — no validity band supplied)'),
    ...(snapNote ? { snapNote } : {}),
    ...(infeasible ? { infeasible } : {}),
    ...(ampFloorNote ? { ampFloorNote } : {}),
    ampFloorRepair,
    ...(valueWindowNote ? { valueWindowNote } : {}),
    ...(auditReport ? { audit: auditReport } : {}),
    ...(zFloorSourceNote ? { zFloorSourceNote } : {}),
    ...(rSourceProbeNote ? { rSourceProbeNote } : {}),
    ...(opts.gateViolation ? { gateRefusals, gateEvaluations, gateCacheHits } : {}),
  };
}

/**
 * CANONICAL IDENTITY OF A PARTS ARRAY, for the run-scoped gate cache.
 *
 * Everything the gate can see has to be in here, and nothing else may be.
 * The gate solves the network and reads dissipation, EPDR and the drive on
 * f_s, so it sees: which elements exist, what they are worth (values AND the
 * DCR/ESR that ride along), whether they are open or shorted, and how they are
 * wired. It does NOT see the order of the array, so the entries are sorted —
 * two arrays that describe the same circuit must produce one key, or the cache
 * simply never hits.
 *
 * `locked` is deliberately absent: it constrains the SEARCH, not the network,
 * and two otherwise identical circuits have the same gate verdict whether or
 * not the designer pinned a value.
 */
function partsKey(parts: readonly VxpPart[]): string {
  const rows = parts.map((q) => {
    const params = q.params
      .map((r) => `${r.name}=${r.value}`)
      .sort()
      .join(',');
    const at = q.wires.map((w) => `${w.x},${w.y}`).join(';');
    return `${q.type}|${q.partId ?? ''}|${q.model ?? ''}|${params}|${q.open ? 'o' : ''}${q.shorted ? 's' : ''}|${at}`;
  });
  rows.sort();
  return rows.join('\n');
}

/** Stable identity for wires/grounds across cloning (they carry no partId). */
function debrisKey(q: VxpPart): string {
  return `${q.type}|${q.wires.map((w) => `${w.x},${w.y}`).join(';')}`;
}

/** Iteratively eat wire stubs from the tip: a 2-point wire whose endpoint is
 *  shared with NOTHING else leads nowhere — the bus-attached tail a pruned
 *  chain leaves behind. Grounded tails survive (the ground shares the tip). */
function trimStubs(ps: VxpPart[]): VxpPart[] {
  let parts = ps;
  for (;;) {
    const use = new Map<string, number>();
    for (const p of parts) {
      for (const w of p.wires) {
        const k = `${w.x},${w.y}`;
        use.set(k, (use.get(k) ?? 0) + 1);
      }
    }
    const next = parts.filter((p) => {
      if (p.type !== 'Wire' || p.wires.length !== 2) return true;
      return p.wires.every((w) => (use.get(`${w.x},${w.y}`) ?? 0) > 1);
    });
    if (next.length === parts.length) return parts;
    parts = next;
  }
}

/**
 * Debris keys of a parts array: Wire/Ground parts whose coordinate net does
 * not touch any component terminal (R/L/C/driver/generator) — the leftovers
 * a pruned chain strands. Grounds do NOT fuse nets here: two separately
 * grounded chains are not spatially connected.
 */
function unanchoredKeys(ps: readonly VxpPart[]): Set<string> {
  const key = (w: { x: number; y: number }) => `${w.x},${w.y}`;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = parent.get(k) ?? k;
    if (r !== k) {
      r = find(r);
      parent.set(k, r);
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of ps) {
    if (p.type === 'Wire') {
      for (const w of p.wires.slice(1)) union(key(p.wires[0]), key(w));
    }
  }
  const anchored = new Set<string>();
  for (const p of ps) {
    if (p.type === 'Wire' || p.type === 'Ground') continue;
    for (const w of p.wires) anchored.add(find(key(w)));
  }
  const out = new Set<string>();
  for (const p of ps) {
    if (p.type !== 'Wire' && p.type !== 'Ground') continue;
    if (!p.wires.some((w) => anchored.has(find(key(w))))) out.add(debrisKey(p));
  }
  return out;
}

/** Rule-3 candidates: a capacitor looped across every unlocked series
 *  resistor (neither terminal grounded) that has no parallel C yet, seeded
 *  for a 4 kHz and a 10 kHz shelf corner. Drawn as the same raised loop the
 *  synthesis uses for pad+bypass.
 *
 *  The move only makes sense for a PAD resistor — one that stands alone in
 *  the series path. A resistor that already has a parallel companion is the
 *  damping R inside a trap (the solo engine's parallel LCR, or a notch): a
 *  cap across it just detunes the trap, and the fourth parallel member also
 *  pushes the group past what the tidy auto-placer can draw (Sanders'
 *  "Tidy layout doet niets" — 4 members in one group, refused). The old
 *  guard compared COORDINATES, so it never saw companions that share the
 *  same NODES on different rows; this one asks the netlist. */
function bypassCandidates(
  ps: readonly VxpPart[],
  cloneParts: (x: readonly VxpPart[]) => VxpPart[],
): Array<{ id: string; trial: VxpPart[] }> {
  const { netlist } = crossoverToNetlist({ name: 'bypass-cands', parts: [...ps] });
  const usedKeys = new Set<string>();
  for (const q of ps) for (const w of q.wires) usedKeys.add(`${w.x},${w.y}`);
  let maxC = 0;
  for (const q of ps) {
    const m = /^C(\d+)$/.exec(q.partId ?? '');
    if (m) maxC = Math.max(maxC, Number(m[1]));
  }
  const newId = `C${maxC + 1}`;

  // The move is "lift the top octave around the PAD" — pads live in the
  // SERIES path. "Not grounded" was too weak a proxy: a Zobel resistor sits
  // at node 3-4 (ungrounded) yet hangs in a chain toward ground, and a
  // parallel member inside such a chain is something the tidy auto-placer
  // cannot draw at all — Sanders' second "Tidy layout doet niets" case.
  const posOf = busPositions(ps);

  const out: Array<{ id: string; trial: VxpPart[] }> = [];
  for (const el of netlist.elements) {
    if (el.kind !== 'R' || el.nodes.includes(0)) continue;
    const q = ps.find((pp) => pp.partId === el.id);
    if (!q || q.locked || q.open || q.shorted) continue;
    if (posOf(el.id) !== 'series') continue;
    const A = q.wires[0];
    const B = q.wires[q.wires.length - 1];
    // Skip when ANYTHING already sits in parallel with this resistor (judged
    // on NODES, not coordinates): an existing bypass, or — the real case —
    // the R inside a parallel L∥C∥R trap. Only a lone pad resistor qualifies.
    const parallelCompanion = netlist.elements.some(
      (o) =>
        o.id !== el.id &&
        (o.kind === 'R' || o.kind === 'L' || o.kind === 'C') &&
        ((o.nodes[0] === el.nodes[0] && o.nodes[1] === el.nodes[1]) ||
          (o.nodes[0] === el.nodes[1] && o.nodes[1] === el.nodes[0])),
    );
    if (parallelCompanion) continue;
    // Raised loop: perpendicular offset whose corner points are unused (a
    // coordinate coincidence would silently create a junction).
    const offsets =
      A.y === B.y
        ? [{ x: 0, y: -4 }, { x: 0, y: 4 }, { x: 0, y: -6 }, { x: 0, y: 6 }]
        : [{ x: 4, y: 0 }, { x: -4, y: 0 }, { x: 6, y: 0 }, { x: -6, y: 0 }];
    const off = offsets.find(
      (o) =>
        !usedKeys.has(`${A.x + o.x},${A.y + o.y}`) && !usedKeys.has(`${B.x + o.x},${B.y + o.y}`),
    );
    if (!off) continue;
    const P = { x: A.x + off.x, y: A.y + off.y };
    const Q = { x: B.x + off.x, y: B.y + off.y };

    for (const f0 of [4000, 10000]) {
      const uF = 1e6 / (2 * Math.PI * f0 * el.value);
      out.push({
        id: newId,
        trial: [
          ...cloneParts(ps),
          { type: 'Wire', params: [], wires: [{ ...A }, { ...P }] },
          { type: 'Wire', params: [], wires: [{ ...B }, { ...Q }] },
          {
            type: 'Capacitor',
            partId: newId,
            params: [{ name: 'C', value: Number(uF.toPrecision(3)), unit: 'uF' }],
            wires: [P, Q],
          },
        ],
      });
    }
  }
  return out;
}
