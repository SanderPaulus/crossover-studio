/**
 * E-3b — WHAT THE APP HANDS THE v2 WORKER, FOR ANY NUMBER OF WAYS.
 *
 * The v2 scan door was written once, for three ways, inside `runVfOptimize`:
 * four hundred lines of gluing React state into `buildCandidateField`,
 * `factsForWorker`, `declareCandidateChoices`, the gate and budget blocks, the
 * run export and the shortlist. E-3 made the worker's TWO-WAY branch real and
 * measured what was left: of the twenty-six rows of its map, four are the app,
 * because a two-way request never reaches the worker at all.
 *
 * Writing that glue a second time for two ways would be two implementations of
 * one door — the failure mode this codebase has paid for repeatedly (two
 * crossing derivations, two fasematen, two "is this curve usable" predicates).
 * So the N-NEUTRAL steps live here, as pure functions over explicit arguments,
 * and both branches of `runVfOptimize` call them. What stays in the component
 * is what genuinely differs: which curves exist, how many handovers a variant
 * carries, and which chain type the worker is handed.
 *
 * NOTHING HERE READS REACT STATE, and that is the point beyond tidiness: the
 * UI layer after `handleV2Request` lay outside every test until UI-1 extracted
 * `selection.ts`, and it had been doing the wrong thing for months. The same
 * argument applies one step earlier — to what the run is ASSEMBLED from — so
 * these functions are testable without a browser, and `scanRequest.test.ts`
 * tests them.
 *
 * P4 THROUGHOUT: an absent setting produces an ABSENT KEY, never a zero and
 * never a default. Every `...(x !== undefined ? { x } : {})` below is that
 * rule, and it is why these blocks are spreads rather than object literals
 * with optional fields.
 */

import type { BranchCurve, PairDerivationInput } from '../predesign/candidateField.ts';
import type { GeneratedCandidate } from '../predesign/candidates.ts';
import type { StatedCrossingMark } from '../predesign/statedCrossings.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { EngineV2Report } from '../report.ts';
import { chainGridFrom, describeJudgedFloor, judgedBandFloor } from '../predesign/judgedBand.ts';
import type { TargetCurve } from '../requirements/targetCurve.ts';
import { peakInputVolts } from '../metrics/driveExcursion.ts';

import { declareCandidateChoices, type StatedByDesigner } from './candidateDeclaration.ts';
import type { ChoiceDeclaration } from './choices.ts';
import type { CoilDcrFit } from '../../coilDcr.ts';
import type { GateSettings } from './gates.ts';
import type { BudgetSettings } from './bounds.ts';
import type { DeterminismSettings } from './determinism.ts';
import type { V2CandidateResult, V2RunSettings } from './worker.ts';
import { factsForWorker, type MeasurementFactsPayload } from './measurementFacts.ts';
import type { ShortlistInput } from './shortlist.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { GateVerdict } from './gates.ts';

/**
 * The v2 gate/budget/requirement fields the app parses out of its form, before
 * anything is decided about them.
 *
 * A structural type rather than an import of the component's own state shape:
 * this module may not know about `App.tsx`, and the component may not have to
 * reshape its state to call it. Every field is optional because every field is
 * a thing the designer may not have stated (P4).
 */
export interface StatedV2Limits {
  maxDissipationFraction?: number;
  minEpdrOhm?: number;
  maxDriveOnFsDb?: number;
  resistorClassW?: number;
  resistorPowerMargin?: number;
  coilClassA?: number;
  resistorThermalPowerW?: number;
  amplifierPeakPowerW?: number;
  amplifierNominalLoadOhm?: number;
  lfBumpBudgetDb?: number;
  qesMultiplierMax?: number;
  dampingMarginDb?: number;
  runSeed?: number;
  runBudgetEvals?: number;
}

/* ==================================================================== *
 * 1 — THE FIELD REQUEST: one derivation input per handover
 * ==================================================================== */

/**
 * The per-pair half of a `CandidateFieldRequest`, built from the report's own
 * window inputs.
 *
 * N-NEUTRAL BY CONSTRUCTION: it maps over the windows the report derived, and
 * the report derives one per ADJACENT PAIR (`report.ts`, `i + 1 < order.length`).
 * A two-way project has one; a three-way has two. Nothing here counts ways.
 *
 * The SLOPE lookup is the one place where "which pair is this" matters, and it
 * matters the same way it always did: with more than one pair the first is the
 * low handover and reads the `low.lower`/`low.upper` fields; the last (and on a
 * two-way, only) pair reads `mid`/`tweeter`. That is the app's own settings
 * vocabulary, not a fact about N.
 *
 * The ORDER comes from the window input itself — the same place the window
 * already read it — because a window computed at one order and a candidate
 * generated at another are two answers to one question.
 */
export function pairDerivationInputs(args: {
  windowInputs: readonly XoWindowInput[];
  /** The acoustic slope targets, in the app's own shape. Absent = not armed. */
  slopes?: { mid?: number; tweeter?: number; low?: { lower?: number; upper?: number } };
  /** M-C's stated limit for the UPPER driver of a pair, by report driver id. */
  statedDriveLimitDbByDriverId?: Readonly<Record<string, number | undefined>>;
  /** The single stated M-C figure, the fallback when the way states none. */
  fallbackDriveLimitDb?: number;
  /** The bare measured response of one report driver id, for A5d.3(i). */
  curveOfDriverId: (driverId: string) => BranchCurve | null;
}): PairDerivationInput[] {
  const { windowInputs: wis, slopes } = args;
  const many = wis.length > 1;
  return wis.map((wi, i) => ({
    statedOrder: Number.isFinite(wi.order) ? wi.order : null,
    // M-C's stated limit arms A5d.3(ii). Absent = not armed (P4); nothing here
    // invents a protection budget. V50: the UPPER way's own figure first, the
    // single field as the fallback — the same order the gate reads
    // (`statedDriveLimitDb`).
    maxDriveOnFsDb:
      args.statedDriveLimitDbByDriverId?.[wi.upper] ?? args.fallbackDriveLimitDb ?? null,
    lowerTargetSlopeDbPerOct: (i === 0 && many ? slopes?.low?.lower : slopes?.mid) ?? null,
    upperTargetSlopeDbPerOct: (i === 0 && many ? slopes?.low?.upper : slopes?.tweeter) ?? null,
    lowerCurve: args.curveOfDriverId(wi.lower),
    upperCurve: args.curveOfDriverId(wi.upper),
  }));
}

/* ==================================================================== *
 * 2 — THE MEASURED FACTS ACROSS THE BORDER (F4b, audit §4 leaks 1 and 2)
 * ==================================================================== */

/**
 * The resolved R_e per driver with its provenance, the A5b.1 validity
 * intervals, the raw sweeps and the derived ceilings — keyed the way the
 * worker's `driverZ` is keyed.
 *
 * N-NEUTRAL: it walks the roles the CALLER says exist. A two-way project hands
 * over two, a three-way three, and a role without an id is skipped rather than
 * patched over — the worker's own fallback is still there and says so in the
 * notes.
 */
export function measurementFactsFor<R extends string>(args: {
  report: EngineV2Report | null | undefined;
  /** The roles this project actually has, in order. */
  roles: readonly R[];
  /** The report driver id for a role, or undefined when the role has none. */
  driverIdOf: (role: R) => string | undefined;
  /** The canonical worker model name for a role (`canonicalModelForRole`). */
  modelOf: (role: R) => string;
  /** The raw impedance sweep for a role, or null. */
  sweepOf: (role: R) => { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] } | null;
}): Partial<MeasurementFactsPayload> {
  const { report } = args;
  if (!report) return {};
  const modelByDriverId: Record<string, string> = {};
  const sweepByDriverId: Record<
    string,
    { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }
  > = {};
  for (const role of args.roles) {
    const id = args.driverIdOf(role);
    if (id === undefined) continue;
    modelByDriverId[id] = args.modelOf(role);
    const sweep = args.sweepOf(role);
    if (sweep) sweepByDriverId[id] = sweep;
  }
  return factsForWorker(report, modelByDriverId, sweepByDriverId);
}

/* ==================================================================== *
 * 3 — THE RUN SETTINGS: gates, budgets, determinism, voicing, band
 * ==================================================================== */

/**
 * E-5 — WHERE A v2 RUN LOOKS AND WHERE IT JUDGES, for any number of ways.
 *
 * WHAT WAS WRONG. Both v2 branches handed the chain the SIM grid and the
 * INTERSECTION of every source's validity, and neither is an answer about a
 * loudspeaker:
 *
 *   · the sim grid's floor is `max(the fMin field, the lowest measurement)`,
 *     and fMin is a PLOT range whose fallback is 200 Hz. F4d wrote that down
 *     rather than moving it ("the grid is `sim`, which every plot on this
 *     screen draws from") and left the silence in place;
 *   · the judged band's floor is the highest way's gate — 455 Hz on casus 1 —
 *     because a source that contributes nothing at 100 Hz still gets a veto
 *     over judging 100 Hz.
 *
 * WHAT IT COST, MEASURED (E-5). The design step places its cut-only EQ bands
 * at the sum's worst positive excursion INSIDE the judged band, and the
 * synthesis turns a peak cut into the damped series-LC trap across the driver.
 * On casus 1's merged set the derived floor puts a −6.7 dB cut at 37 Hz — the
 * reflex peak, and the trap the whole C-2 corpus carries. The app's floor puts
 * nothing below 303 Hz: no cut, no trap, and M-D then refuses the delivery for
 * a bump the search was never allowed to see. Both floors have to come down:
 * with the derived band on the 200 Hz grid the refine pushes a band to 140 Hz
 * and clamps it at −15 dB, which is a cut fitted on ground the grid does not
 * cover.
 *
 * AND THE RESOLUTION IS THE PRECEDENT'S, WHICH IS A SECOND CORRECTION OF THE
 * SAME KIND. The app's chain ran on `GRID_N` = 600 points, and `GRID_N` is a
 * PLOT constant: the chain used it only because nobody had ever separated the
 * chain's grid from the one every chart draws from. Using a plot constant as a
 * search resolution is the same accident as using the plot range as the search
 * floor, and repairing one while keeping the other is half a repair. The
 * resolution every casus fixture and every corpus in this repository has run on
 * is the `f4b2_v2_worker_baseline.json` precedent — 96 points over 200–20 000 Hz,
 * 14.4 per octave — and that is what the v2 chain takes here.
 *
 * WHAT THE TIMING SAYS, AND WHAT IT DOES NOT. Both densities were run on the
 * three-way demo with the requirements armed: at the app's ~90 points per
 * octave the grid grows to about 890 points and the exploration had not
 * finished after 53 minutes; at the precedent's density it is about 140 points
 * and it had not finished after 58 either. So the density is NOT where the cost
 * of E-5 lands — the WIDER JUDGED BAND is, and that is the repair doing its
 * work: the tuner is now asked to flatten three octaves it was never shown.
 * The density is chosen on the argument above and not on a stopwatch, and the
 * cost of judging the bass is stated in casebook E-5 rather than hidden here.
 *
 * The grid's TOP is still the caller's, and so is the band's CEILING.
 *
 * ABSENT IS ABSENT. No report, or a report whose lowest way has no on-axis
 * band, returns the caller's own grid and band unchanged — byte for byte what
 * every run did before E-5 — with no note, because nothing happened.
 */
export function v2ChainFrame(args: {
  report: EngineV2Report | null | undefined;
  /** The grid the caller already built — its top and density are kept. */
  simGrid: readonly number[];
  /** The band the caller would have judged on (the validity intersection). */
  fallbackBand: readonly [number, number];
}): { grid: readonly number[]; band: [number, number]; notes: string[] } {
  const { simGrid, fallbackBand } = args;
  const unchanged = {
    grid: simGrid,
    band: [fallbackBand[0], fallbackBand[1]] as [number, number],
    notes: [] as string[],
  };
  if (!args.report || simGrid.length < 2) return unchanged;
  const floor = judgedBandFloor(args.report);
  if (floor === null) return unchanged;

  const top = simGrid[simGrid.length - 1];
  /* The grid reaches down to the lowest way's VALIDITY floor and not to f_p:
   * `isHighPassProtected` probes half an octave under the lowest way's passband
   * floor, which it reads off the grid's floor, and with the grid starting AT
   * f_p that probe lands in the reflex impedance dip and the woofer reads as
   * high-pass protected (M-1 measured it refusing eight candidates of eight). */
  const gridFloor = Math.min(simGrid[0], floor.validityFloorHz);
  if (!(top > gridFloor)) return unchanged;
  const built = chainGridFrom(gridFloor, top);
  /* Returned BY IDENTITY when it is the grid the caller already had, so a
   * caller that is already on this frame can keep the branch responses it
   * built on it instead of rebuilding three curves that did not move. */
  const same =
    built.length === simGrid.length && built.every((f, i) => Object.is(f, simGrid[i]));
  const grid = same ? simGrid : built;

  /* The band's floor is derived; its CEILING is the caller's. The top of the
   * intersection is the lowest of every source's ceiling, which is the
   * conservative answer and is not what E-5 found wrong — and it carries the
   * designer's own view-range narrowing, which is theirs to make. */
  const band: [number, number] = [floor.floorHz, fallbackBand[1]];
  if (!(band[1] > band[0])) return unchanged;

  const notes: string[] = [];
  if (Math.abs(band[0] - fallbackBand[0]) > 0.01 || grid !== simGrid) {
    notes.push(describeJudgedFloor(floor, grid[0]));
    notes.push(
      `The chain looks on ${grid.length} points from ${grid[0].toFixed(1)} Hz to ` +
        `${top.toFixed(0)} Hz and judges on ${band[0].toFixed(1)}–${band[1].toFixed(0)} Hz. Before ` +
        `E-5 it looked on the PLOT grid (${simGrid.length} points from ${simGrid[0].toFixed(1)} Hz, ` +
        'whose floor is the fMin field) and judged from ' +
        `${fallbackBand[0].toFixed(1)} Hz, the lowest ceiling of every source's validity — which on ` +
        'a three-way is the tweeter\u2019s gate, where the tweeter is not playing. The resolution is ' +
        'the one every casus fixture runs (96 points over 200\u201320 000 Hz, 14.4 per octave).',
    );
  }
  return { grid, band, notes };
}


/** The gate block, every field absent unless stated (P4). */
export function gateSettingsFor(args: {
  limits: StatedV2Limits;
  /** M-C per way, keyed by the worker's model names. Empty = no per-way figure. */
  driveOnFsMaxDbByModel?: Readonly<Record<string, number>>;
  /** The stated amplifier floor, or null when the designer stated none (F0). */
  ampMinLoadOhm: number | null;
}): GateSettings {
  const g = args.limits;
  const perWay = args.driveOnFsMaxDbByModel ?? {};
  return {
    ...(g.maxDissipationFraction !== undefined ? { maxDissipationFraction: g.maxDissipationFraction } : {}),
    ...(g.minEpdrOhm !== undefined ? { minEpdrOhm: g.minEpdrOhm } : {}),
    ...(g.maxDriveOnFsDb !== undefined ? { maxDriveOnFsDb: g.maxDriveOnFsDb } : {}),
    /* V50 — the per-way figures, keyed by MODEL (what the worker's `driverZ`
     * is keyed by), and the buildability inputs. The peak input the coil gate
     * reads at is derived here from the same two V49 fields the report derives
     * it from. */
    ...(Object.keys(perWay).length > 0 ? { maxDriveOnFsDbByDriver: { ...perWay } } : {}),
    ...(g.resistorClassW !== undefined ? { resistorClassW: g.resistorClassW } : {}),
    ...(g.resistorPowerMargin !== undefined ? { resistorPowerMargin: g.resistorPowerMargin } : {}),
    ...(g.coilClassA !== undefined ? { coilClassA: g.coilClassA } : {}),
    /* V51 — the thermal design power the resistor gate judges at on the
     * search, when stated. */
    ...(g.resistorThermalPowerW !== undefined ? { resistorThermalPowerW: g.resistorThermalPowerW } : {}),
    ...(g.amplifierPeakPowerW !== undefined &&
    g.amplifierPeakPowerW > 0 &&
    g.amplifierNominalLoadOhm !== undefined &&
    g.amplifierNominalLoadOhm > 0
      ? {
          peakInputVolts: peakInputVolts({
            peakPowerW: g.amplifierPeakPowerW,
            nominalLoadOhm: g.amplifierNominalLoadOhm,
          }),
        }
      : {}),
    ...(args.ampMinLoadOhm !== null ? { ampMinLoadOhm: args.ampMinLoadOhm } : {}),
  };
}

/** The budget block (A5d.6 inversions), every field absent unless stated. */
export function budgetSettingsFor(limits: StatedV2Limits): BudgetSettings {
  return {
    ...(limits.lfBumpBudgetDb !== undefined ? { lfBumpBudgetDb: limits.lfBumpBudgetDb } : {}),
    ...(limits.qesMultiplierMax !== undefined ? { qesMultiplierMax: limits.qesMultiplierMax } : {}),
    ...(limits.dampingMarginDb !== undefined ? { dampingMarginDb: limits.dampingMarginDb } : {}),
  };
}

/** The determinism block (A5e.4), every field absent unless stated. */
export function determinismSettingsFor(limits: StatedV2Limits): DeterminismSettings {
  return {
    ...(limits.runSeed !== undefined ? { seed: limits.runSeed } : {}),
    ...(limits.runBudgetEvals !== undefined ? { budgetEvaluations: limits.runBudgetEvals } : {}),
  };
}

/**
 * Everything a v2 run is told that does NOT depend on how many ways it has:
 * the gates, the budgets, the determinism, the measured facts, the voicing,
 * the judged band and the reporting power.
 *
 * The three IDENTITY KEYS (`designKey`, `measurementKey`, `tuningKey`) are not
 * here on purpose: they name what the run searched OVER, which is exactly the
 * N-dependent half — a three-way variant carries two crossings and a two-way
 * one — so the caller states them. `candidateFieldKey` likewise.
 */
export function v2RunSettingsFor(args: {
  limits: StatedV2Limits;
  driveOnFsMaxDbByModel?: Readonly<Record<string, number>>;
  ampMinLoadOhm: number | null;
  facts: Partial<MeasurementFactsPayload>;
  targetCurve: TargetCurve;
  judgeBandHz: [number, number];
  /** V36 — reporting only, and absent when the designer stated no power. */
  amplifierPowerW?: number;
}): V2RunSettings {
  return {
    gates: gateSettingsFor({
      limits: args.limits,
      ...(args.driveOnFsMaxDbByModel ? { driveOnFsMaxDbByModel: args.driveOnFsMaxDbByModel } : {}),
      ampMinLoadOhm: args.ampMinLoadOhm,
    }),
    budgets: budgetSettingsFor(args.limits),
    determinism: determinismSettingsFor(args.limits),
    // F4b — the resolved R_e per driver with the source that produced it, and
    // the A5b.1 validity interval per driver.
    ...args.facts,
    // A5e.2 — the design's own target curve, or flat when it has never stated
    // one. On the DESIGN, so two voicings can sit side by side and be compared.
    targetCurve: args.targetCurve,
    // The band the window and the RMS are judged on: the same evaluation band
    // the tuner used, already clipped to measurement validity (A5.5).
    judgeBandHz: args.judgeBandHz,
    ...(args.amplifierPowerW !== undefined ? { amplifierPowerW: args.amplifierPowerW } : {}),
  };
}

/**
 * V36 — the power a dissipation column is printed at, read from the app's own
 * text field. Absent when the field is blank or unusable: then there are no
 * watts at all rather than watts at an invented default (F0).
 */
export function reportingPowerW(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const w = Number(raw);
  return Number.isFinite(w) && w > 0 ? w : undefined;
}

/* ==================================================================== *
 * 4 — THE DECLARATION THAT TRAVELS BESIDE ONE CANDIDATE (F4c/F4d)
 * ==================================================================== */

/**
 * The settings a declaration READS BACK — the common subset of `ChainSettings`
 * and `Chain3Settings`. Structural, so both chain types satisfy it without
 * either knowing about this module.
 */
export type DeclarableChainSettings = Omit<StatedByDesigner, 'staged' | 'zFloorStrict'> & {
  /** Both chains call the tuner's `staged` goal `targets`; the rename is theirs. */
  targets?: StatedByDesigner['staged'];
};

/**
 * The A5d declaration for one generated candidate.
 *
 * N-NEUTRAL: the cages and the window floors are read off the candidate's own
 * `crossings`, which is one entry on a two-way and two on a three-way. What
 * the CALLER still owns is `orderByModel` — which way's high-pass flank belongs
 * to which handover is the chain's vocabulary and not this module's — and the
 * `multiWay` flag.
 */
/**
 * U-5 — THE HANDOVER FLOOR ONE CANDIDATE IS TUNED UNDER, per handover.
 *
 * For a generated candidate it is its own A5d.3 window floor and nothing else,
 * exactly as it has been since F4d — that is audit §6.3 in one line: the floor
 * that steers is the stated one.
 *
 * For a STATED candidate BELOW that floor it is the bottom of its own cage. A
 * window floor handed to the chain becomes a penalty the tune is pushed off,
 * so leaving it in place would let the run quietly drag a stated crossing back
 * inside a window the designer deliberately stepped out of — a second opinion
 * about a position they already gave, and a silent one. It is lowered and never
 * raised: a stated position INSIDE the window keeps the window's own floor,
 * byte for byte.
 *
 * ONE IMPLEMENTATION, TWO READERS: the declaration below and the chain input
 * the app builds. Two of them would be two answers to "how low may this tune
 * go", which is precisely the kind of split F4d closed.
 */
export function windowFloorsFor(candidate: GeneratedCandidate): number[] {
  return candidate.crossings.map((x) =>
    candidate.stated ? Math.min(x.windowHz[0], x.cageHz[0]) : x.windowHz[0],
  );
}

/**
 * U-5 — the stated mark as the WORKER wants it: the reading subjects re-keyed
 * from the report's driver ids to the worker's model names.
 *
 * The same bridge the M-C figures and the coil families take
 * (`canonicalModelForRole`), applied to the one field of a breach that names a
 * driver. A subject the caller cannot map is left as it is: the worker then
 * finds no branch under that name, reports the reading as unknown and says why
 * — which is a truthful answer, where a silently dropped subject would turn a
 * breached limit into one that was never checked.
 */
export function statedMarkForWorker(
  mark: StatedCrossingMark,
  modelOfDriverId: (driverId: string) => string | undefined,
): StatedCrossingMark {
  return {
    ...mark,
    perCrossing: mark.perCrossing.map((c) => ({
      ...c,
      breaches: c.breaches.map((b) => ({
        ...b,
        subject: b.subject === null ? null : (modelOfDriverId(b.subject) ?? b.subject),
      })),
    })),
  };
}

export function candidateDeclarationFor(args: {
  candidate: GeneratedCandidate;
  settings: DeclarableChainSettings;
  targetCurve: TargetCurve;
  limits: StatedV2Limits;
  driveOnFsMaxDbByModel?: Readonly<Record<string, number>>;
  /** V49 — did the report derive an excursion ceiling for any way? */
  driveCeilingDerived: boolean;
  /** A5e.3 — the stated coil family per way, keyed by model; empty = none. */
  coilFamilyByModel?: Readonly<Record<string, string>>;
  coilDcrFits?: readonly CoilDcrFit[];
  coilDcrCatalogLabel?: string;
  /** True on a chain with more than one handover. */
  multiWay: boolean;
}): ChoiceDeclaration {
  const s = args.settings;
  const perWay = args.driveOnFsMaxDbByModel ?? {};
  const fams = args.coilFamilyByModel ?? {};
  return declareCandidateChoices({
    cages: args.candidate.crossings.map((x) => x.cageHz),
    windowFloorsHz: windowFloorsFor(args.candidate),
    multiWay: args.multiWay,
    stated: {
      band: s.band,
      acousticSlopes: s.acousticSlopes,
      staged: s.targets,
      ampTarget: s.ampTarget,
      powerMetric: s.powerMetric,
      phaseMetric: s.phaseMetric,
      catalogSnap: s.catalogSnap,
      snapPrefs: s.snapPrefs,
      breakupGuard: s.breakupGuard,
      safety: s.safety,
      audit: s.audit,
      loadFloor: s.loadFloor,
      ampMinLoadOhm: s.ampMinLoadOhm,
      rSourceDisqualifyOhm: s.rSourceDisqualifyOhm,
      // The chain sets this itself, with a stated reason ("the seed here is OUR
      // OWN synthesis"). Restated rather than inherited: the value is
      // identical, and F4c's whole point is that a value nobody names is
      // indistinguishable from a decision.
      zFloorStrict: true,
    },
    /* A5e.2/V45 — the design's own voicing, so the candidate can declare WHAT
     * the amplitude term is flat against. The same object the shortlist judges
     * the window and the RMS against; handing the declaration a different one
     * would be the split V45 closed. */
    targetCurve: args.targetCurve,
    /* V47 — the design's stated drive limit, so the candidate can declare WHICH
     * RULE forbids an unprotected upper driver. The limit itself does not
     * travel here: it is a gate and it crosses in `v2.gates.maxDriveOnFsDb`,
     * judged by the same machinery the panel reads. Absent leaves the historic
     * seed comparison in force (P4). */
    ...(args.limits.maxDriveOnFsDb !== undefined
      ? { driveOnFsLimitDb: args.limits.maxDriveOnFsDb }
      : {}),
    /* V50 — and the per-way figures, keyed by model like the gate. */
    ...(Object.keys(perWay).length > 0 ? { driveOnFsLimitDbByDriver: { ...perWay } } : {}),
    /* V49 — and whether the report derived an EXCURSION ceiling for any way
     * (M-C v2.0). That is an absolute requirement too, so the candidate
     * declares `protectionRule: 'stated'` on it even without a stated dB
     * figure. The ceilings themselves cross as a measured fact in the run
     * settings, never through the declaration. */
    ...(args.driveCeilingDerived ? { driveCeilingDerived: true } : {}),
    /* V48 — the design's stated LF-lift budget, so the candidate can declare
     * WHICH NETWORK the series-inductance ceiling describes. The budget itself
     * crosses as `v2.budgets.lfBumpBudgetDb`. Absent leaves the ceiling solved
     * at the seed (P4). */
    ...(args.limits.lfBumpBudgetDb !== undefined
      ? { lfBumpBudgetDb: args.limits.lfBumpBudgetDb }
      : {}),
    /* A5e.3 — the coil family per way, keyed by MODEL like the M-C figures, and
     * the loaded catalogue's fits, so the candidate can declare WHAT PHYSICS
     * its coils are judged on. Nothing stated = nothing handed over = absent
     * with the P4 reason. */
    ...(Object.keys(fams).length > 0
      ? {
          coilDcrFamilyByWay: { ...fams },
          ...(args.coilDcrFits ? { coilDcrFits: args.coilDcrFits } : {}),
          ...(args.coilDcrCatalogLabel !== undefined
            ? { coilDcrCatalogLabel: args.coilDcrCatalogLabel }
            : {}),
        }
      : {}),
  });
}

/* ==================================================================== *
 * 5 — WHAT COMES BACK: the field the shortlist judges
 * ==================================================================== */

/** What one v2 scan produced, folded into the shapes the main thread needs. */
export interface CollectedV2Scan<T> {
  /** The gate verdicts and the violation, per candidate label. */
  gatesByLabel: Record<string, { verdicts: GateVerdict[]; violation: string | null }>;
  /** Every candidate the scan produced, feasible or not — the shortlist's input. */
  field: ShortlistInput<T>[];
  /** The worker's own notes, de-duplicated. */
  notes: string[];
}

/**
 * Fold a finished v2 scan into its shortlist field, its gate map and its notes.
 *
 * ONE IMPLEMENTATION FOR BOTH ROUTES, and generic in the chain result because
 * nothing here looks at one: a candidate is a label, a part list, a topology, a
 * set of measurements and a set of verdicts, on two ways exactly as on three.
 *
 * The notes are DE-DUPLICATED because they are per candidate and mostly
 * identical across a field of them — they describe the MEASUREMENT SET, not
 * the design — and forty copies of one sentence is a different way of being
 * unread (F4b).
 *
 * A REFUSED candidate still goes into the field. It carries no network (V31
 * blanks the parts before the result leaves the worker); the shortlist is what
 * lists it as a refusal, and a field it never saw is a field it cannot report
 * on.
 */
export function collectV2Scan<
  T extends { label: string; parts: readonly VxpPart[]; disqualified?: readonly string[] },
>(candidates: readonly V2CandidateResult<T>[]): CollectedV2Scan<T> {
  const gatesByLabel: Record<string, { verdicts: GateVerdict[]; violation: string | null }> = {};
  const field: ShortlistInput<T>[] = [];
  const notes = new Set<string>();
  for (const c of candidates) {
    for (const n of c.notes) notes.add(n);
    gatesByLabel[c.result.label] = { verdicts: c.gates, violation: c.violation };
    field.push({
      label: c.result.label,
      parts: c.result.parts,
      result: c.result,
      topology: c.topology,
      measurements: c.measurements,
      gates: c.gates,
      // V36 — what it burns, measured by the worker that already solved it. A
      // column, never a criterion.
      dissipation: c.dissipation,
      disqualified: c.result.disqualified,
      ...(c.rejection ? { rejection: c.rejection } : {}),
      /* U-5 — the stated report, when the designer stated this candidate's
       * handovers. Absent on a generated one, so the shortlist behaves exactly
       * as it did before U-5 for every field without a stated crossing in it. */
      ...(c.stated ? { stated: c.stated } : {}),
    });
  }
  return { gatesByLabel, field, notes: [...notes] };
}
