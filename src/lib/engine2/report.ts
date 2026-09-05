/**
 * DELIVERABLE 4 — the whole v2 report, assembled once.
 *
 * One function turns "a measurement set, optionally a loaded filter, and
 * whatever the project has entered" into everything the panel shows: derived
 * parameters per driver, the capability matrix, every ACTIVE metric with its
 * coverage, and the two pre-design blocks that can be built without any of the
 * A5e decisions.
 *
 * THE ASSEMBLY IS WHERE P4 AND A5.5 ARE ACTUALLY ENFORCED, so two rules run
 * through all of it:
 *
 *  1. A metric is computed ONLY when the capability matrix says it is active.
 *     Not "computed and then hidden" — computed only. A number that exists
 *     somewhere in memory gets rendered eventually.
 *  2. Every metric that evaluates over a band carries the coverage of that
 *     band. A5.5 forbids both silent evaluation and silent skipping, so the
 *     report's job is to make the third option — evaluated over this much of
 *     what was wanted — the only one available.
 *
 * OUT OF SCOPE, DELIBERATELY: no optimiser coupling, no weights, no
 * aggregation into a single score, no target curve, no catalog. Those are
 * A5e decisions and F2+ work, and where the assembly brushes against one it
 * stops with a TODO naming the decision.
 */

import type { Complex } from '../complex.ts';
import { fromPolar } from '../complex.ts';
import { toComplex } from '../dsp.ts';
import type { Netlist } from '../network.ts';
import { unwrapPhaseDeg } from '../timing.ts';
import { DEG_PER_HALF_TURN, MM_PER_M, H_PER_MH } from './constants.ts';
import { buildCapabilityMatrix, isActive, type CapabilityMatrix } from './capability.ts';
import { runIngest, type IngestResult, type MeasurementFile } from './ingest/derive.ts';
import { passbandLevel } from './ingest/spl.ts';
import type { Manifest } from './ingest/manifest.ts';
import { coverageOf, type Coverage } from './ingest/validity.ts';
import {
  phaseIntegration,
  type PhaseIntegrationResult,
} from './metrics/phaseIntegration.ts';
import type { PhaseRejection } from '../phaseAdmission.ts';
import { DEFAULT_OVERLAP_WINDOW_DB } from '../integration.ts';
import {
  breakupDistance,
  directivityMatch,
  lfBump,
  verticalLobing,
  type BreakupDistanceResult,
  type DirectivityMatchResult,
  type LfBumpResult,
  type VerticalLobingResult,
  type VerticalSource,
} from './metrics/acoustic.ts';
import {
  lobingLambdas,
  type LobingLambdaResult,
  type LobingWay,
} from './metrics/lobing.ts';
import {
  buildAnalysis,
  deriveCrossings,
  orderDriversLowToHigh,
  passbandOf,
} from './metrics/analysis.ts';
import {
  dissipation,
  driveVoltageOnResonance,
  epdr,
  groupDelay,
  thevenin,
  type DissipationResult,
  type DriveVoltageResult,
  type EpdrResult,
  type GroupDelayResult,
  type TheveninResult,
} from './metrics/electrical.ts';
import type {
  Crossing,
  Geometry,
  MetricContext,
  NetworkAnalysis,
  ProjectSettings,
} from './metrics/types.ts';
import {
  driveExcursion,
  splAtPowerRe1m,
  weakestLink,
  type DriveExcursionResult,
  type WeakestLinkResult,
} from './metrics/driveExcursion.ts';
import { peakInputVolts } from './metrics/driveExcursion.ts';
import {
  coilLoads,
  resistorLoads,
  type CoilLoad,
  type ResistorLoad,
} from './metrics/buildability.ts';
import { ctcKey } from './metrics/types.ts';
import {
  anchoredGaps,
  anchorFloorBlock,
  type AnchoredGaps,
  type AnchorFloorBlock,
  type WayLevel,
} from './predesign/gaps.ts';
import { judgeResponse, type ResponseJudgement } from './requirements/response.ts';
import {
  FLAT_TARGET,
  plateauCoverage,
  targetOffsetsDb,
  type PlateauCoverage,
  type TargetCurve,
} from './requirements/targetCurve.ts';
import { parallelGainDb, type WayWiring } from './ingest/wiring.ts';
import { DB_PER_DECADE_AMPLITUDE } from './constants.ts';
import {
  levelWorkOnNetlist,
  levelWorkVerdict,
  seriesRMaxOhmOf,
  type LevelWorkOnWay,
  type LevelWorkVerdict,
  type LowestWayLevelWork,
} from '../levelWork.ts';
import { coilDcrInventoryOfNetlist, coilDcrModelFor, describeCoilDcrModel, type CoilDcrInventory, type CoilDcrModel } from '../coilDcr.ts';
import {
  gateVerdicts,
  isHighPassProtected,
  resistorJudgementPowerW,
  statedDriveLimitDb,
  violationText,
  type GateSettings,
  type GateVerdict,
} from './optimizer/gates.ts';
import {
  impedanceReferenceFrom,
  type ImpedanceReference,
  type MeasuredSweep,
} from './optimizer/impedanceReference.ts';
import {
  anyBudgetActive,
  invertBudgets,
  passbandImpedanceMedian,
  type BudgetSettings,
  type BudgetWay,
  type InvertedBound,
} from './optimizer/bounds.ts';
import {
  crossoverWindow,
  DEFAULT_SIGNIFICANT_BREAKUP_DB,
  type XoWindowInput,
  type XoWindowResult,
} from './predesign/xoWindow.ts';
import { cabs, cargDeg, dbAmp, interpLog, octavesBetween } from './util.ts';
import { ENGINE_V2_LABEL, ENGINE_V2_VERSION } from './version.ts';
import { engineV2Mark } from './facade.ts';

/**
 * Settings the report needs on top of the metric-level ones.
 *
 * Since F2 it also carries the GATE limits and the BUDGETS. They live here
 * rather than only inside the optimiser because P4 has a visible half: a
 * designer has to be able to see, on the loaded filter, what each gate reads
 * and whether anything is judging it. A limit that only existed while an
 * optimisation was running would be invisible exactly when it matters.
 */
export interface ReportSettings extends ProjectSettings, GateSettings, BudgetSettings {
  /**
   * Measured DC resistance per driver, ohms. A4 lists R_e as M-E's DATA NEED,
   * and it is a genuinely different number from the derived R_e: the derived
   * one comes off the low end of an impedance sweep and V8d documents exactly
   * how it overestimates. Absent = the derived value is used and the note says
   * which one it was.
   */
  reOhmByDriver?: Record<string, number>;
  /**
   * Quality limits the motional R_e fit may abstain on (A5c.1 / V8d). Absent =
   * the extractor's own published limits in `constants.ts`. Raising one is a
   * decision about how much inference is allowed to stand in for a
   * measurement, so it is a setting rather than a hidden threshold.
   */
  reFitMaxRelativeResidual?: number;
  reFitMaxBandSensitivityFraction?: number;
  /**
   * Assumed acoustic order per pair (key: `ctcKey`), for the crossover-window
   * floor. Absent for a pair = the window omits the f_s floor and says so.
   */
  orderByPair?: Record<string, number>;
  /**
   * How close two drivers' directivity has to track, in dB, for the DI-match
   * band of M-G. Absent = the two-sided band is not reported.
   */
  diMatchToleranceDb?: number;
  /**
   * How tall a response ripple has to be before M-H and the crossover window
   * treat it as a breakup rather than ordinary ripple, dB over the local
   * trend. Absent = `DEFAULT_SIGNIFICANT_BREAKUP_DB`.
   */
  significantBreakupDb?: number;
  /**
   * A5e.2 (F3) — the target curve the SPL window and the RMS deviation are
   * measured against. Absent = flat, which is what a design that has never
   * stated one means.
   */
  targetCurve?: TargetCurve;
}

export interface FilterInput {
  name: string;
  netlist: Netlist;
  /** Raw measured impedance per driver MODEL, before gridding. */
  driverZ: Record<string, { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }>;
}

export interface EngineV2ReportInput {
  manifest: Manifest;
  files: readonly MeasurementFile[];
  /** Null when no filter is loaded: every network metric then reports off. */
  filter: FilterInput | null;
  geometry: Geometry;
  settings: ReportSettings;
  ingestOptions?: { trendOctaveFraction?: number; breakupMinDb?: number; mergeOctaves?: number };
}

/**
 * One pair's phase integration around its own handover (M-K).
 *
 * SINCE V44 the admitted points are decided by `lib/phaseAdmission.ts` — three
 * grounds at once, see that file — and the two historic measures ride along as
 * named control columns that judge nothing. `meanAbsDeg` is M-K; the panel, the
 * requirement and the tuner all read that one number.
 */
export interface PhaseTracking {
  lower: string;
  upper: string;
  crossingHz: number;
  /** Mean |phase difference| over the ADMITTED points, degrees. */
  meanAbsDeg: number;
  /** The band the admitted points span. */
  bandHz: [number, number];
  /** How many points carried the judgement. */
  n: number;
  /** Why points fell away, per ground, and which grounds were armed. */
  rejected: Record<PhaseRejection, number>;
  grounds: { validity: boolean; silence: boolean; level: boolean };
  coverage: Coverage;
  /** The two measures V44 replaced. Reading matter — no gate, no requirement. */
  control: PhaseIntegrationResult['control'];
}

export interface SystemSummary {
  /** Half the peak-to-peak of the summed response over the valid band, dB. */
  splWindowDb: number | null;
  /**
   * A5e.2 — THE SUMMED RESPONSE ITSELF, in dB on `analysisGrid`.
   *
   * Exposed rather than only summarised, because the level a design REALISES
   * over a band is a question the report already answers for every driver
   * (`passbandLevel`, A5d.4) and could not answer for the system. A caller that
   * wants it had to re-add the branches, and a second summation is a second
   * thing that can disagree with the one the window and the RMS were judged on
   * — the V32 shape, one implementation with more than one reader.
   *
   * Null when no filter is loaded: there is then no system to sum.
   */
  sumDb: number[] | null;
  /**
   * A5e.1 (F3) — the summed response judged against the target curve: the
   * WINDOW (smoothed, the acceptance question), the RMS DEVIATION (raw, the
   * sorting question) and the narrow peaks the smoothing removed.
   *
   * Beside `splWindowDb` rather than replacing it: that one is the raw
   * peak-to-peak this panel has always shown, and the two answer different
   * questions. Null when no filter is loaded.
   */
  response: ResponseJudgement | null;
  splBandHz: [number, number] | null;
  phaseTracking: PhaseTracking[];
  /**
   * A5d.3 window-interaction indicator (c): how many octaves the middle
   * way(s) span between their crossings. Empty for a two-way.
   */
  midbandOctaves: { driver: string; octaves: number }[];
  /**
   * Indicator (a): frequencies where MORE THAN TWO ways lie within `withinDb`
   * of the sum. Null when there is no such zone.
   */
  threeSourceZoneHz: [number, number] | null;
  /**
   * Indicator (b): the ELECTRICAL phase rotation each way's own branch carries
   * at each crossing, in degrees per octave.
   *
   * This is the one that catches the failure mode A5d.3 warns about and V11
   * documents: two crossings can be amplitude-decoupled (no three-source zone
   * at all) while the sections belonging to the UPPER crossing still rotate
   * the middle way's phase in the tracking band of the LOWER one. Phase
   * couples about twice as far as amplitude does, so "far enough apart" judged
   * on amplitude is not far enough.
   */
  phaseCoupling: { driver: string; atCrossingHz: number; degPerOctave: number }[];
}

/**
 * V51 — LEVEL WORK ON THE LOWEST WAY: what the configuration asks, and what a
 * loaded netlist actually carries there.
 *
 * REPORTING, NOT A VERDICT. The requirement (`lowestWayLevelWork: 'none'`) is a
 * statement about the SEARCH — the chain's design and synthesis steps honour it
 * — and this block is what lets a reader see the configuration fact behind it:
 * how far the lowest way sits above the anchor after the target curve, what
 * wiring the same drivers in series would deliver of that without a resistor,
 * and what the cabinet's baffle step delivers below its transition by itself.
 * Every number here is derived from the anchored gaps (A5d.4), the stated
 * wiring and the target curve; nothing is a limit.
 */
export interface LevelWorkAnalysis {
  /** The lowest way, by driver id. */
  lowestWay: string;
  /** The anchor of the A5d.4 analysis, or null when it was not computed. */
  anchor: string | null;
  /**
   * How far the lowest way sits ABOVE the anchor after the target curve, dB —
   * the level work the configuration asks on it. 0 when it IS the anchor; null
   * when the anchored gaps are blocked or absent.
   */
  aboveAnchorDb: number | null;
  /** The stated wiring per way, in low-to-high order; `stated: false` where none was. */
  wiring: { driver: string; stated: boolean; count: number; measured: WayWiring['measured'] | null; desired: WayWiring['desired'] | null }[];
  /**
   * What wiring the lowest way's N equal drivers in SERIES would deliver of
   * that surplus without a resistor: 20·log10(N) dB. Null for a single driver
   * or an unstated wiring.
   */
  seriesWouldDeliverDb: number | null;
  /** The target curve's transition frequency (the baffle step), or null. */
  stepHz: number | null;
  /** What a baffle step delivers below its transition by itself: 20·log10(2) dB. */
  baffleStepFullDb: number;
  /** What the LOADED netlist carries on the lowest way; null without a network. */
  delivered: LevelWorkOnWay | null;
  /** The project's stated requirement, or null when none is stated (P4). */
  requirement: LowestWayLevelWork | null;
  /** V51b — the stated maximum total series resistance, Ω; null unless the rule states one. */
  maxSeriesOhm: number | null;
  /** V51b — does the loaded netlist honour the rule (`levelWorkVerdict`); null without a rule or a network. A FLAG, not a gate. */
  verdict: LevelWorkVerdict | null;
  /** V51 item 4 — whether the stated plateau lies inside the judged band at all. */
  plateau: PlateauCoverage | null;
  /**
   * A5e.3 — the coil families the project states, the model they resolve to
   * on the catalogue handed over (null when none resolves), and what the
   * LOADED netlist's coils carry against it. Reporting, never a gate: a coil
   * outside its family's single-part range is a FLAG.
   */
  coilDcr: {
    statedFamilyByDriver: Record<string, string>;
    model: CoilDcrModel | null;
    /** Families stated for a way that the catalogue's fits do not contain. */
    unresolved: { way: string; family: string }[];
    inventory: CoilDcrInventory | null;
  };
  /** One paragraph a reader can act on. */
  sentence: string;
  notes: string[];
}

export interface EngineV2Report {
  engine: { label: string; version: string; mark: string };
  ingest: IngestResult;
  capability: CapabilityMatrix;
  crossings: Crossing[];
  driversLowToHigh: string[];
  /** Present when a filter was supplied. */
  analysisGrid: number[] | null;
  metrics: {
    dissipation: DissipationResult | null;
    epdr: EpdrResult | null;
    driveVoltage: DriveVoltageResult[];
    lfBump: { driver: string; result: LfBumpResult }[];
    thevenin: TheveninResult[];
    /**
     * V49 (M-C v2.0) — the excursion-derived drive ceiling per driver, both
     * routes, with the acoustic route's ratio when it could be read. Empty
     * where the driver card, the amplifier peak or the resonance is missing;
     * `driveExcursionOff` says which, per driver.
     */
    driveExcursion: DriveExcursionResult[];
    driveExcursionOff: string[];
    /**
     * V50 — BUILDABILITY: the watts in every discrete resistor and the peak
     * current through every coil, each beside what the chosen or stated part
     * may carry. Null without a solved network. The two gates `M-A/part` and
     * `M-L` are made from exactly these lists.
     */
    buildability: { resistorLoads: ResistorLoad[]; coilLoads: CoilLoad[] } | null;
    /**
     * V49 — the WEAKEST-LINK reading for every way that is NOT high-pass
     * protected: how far its cone moves on the resonance at the amplifier's
     * peak input, and where the single-resonator model reaches the limit.
     * Reporting only; no requirement is stated on an unprotected way.
     */
    weakestLink: ({ driver: string } & WeakestLinkResult)[];
    /**
     * V49 — the SPL the measured sensitivity implies at 1 m, at the stated
     * continuous power and at the peak, per driver. Needs a documented drive
     * voltage and mic distance; empty without them, with the reason in
     * `driveExcursionOff`.
     */
    splAtPower: { driver: string; continuousDb: number | null; peakDb: number; powerW: number | null; peakPowerW: number }[];
    /**
     * M-F-interim's four λ fractions per adjacent pair (V20). Reading matter:
     * nothing in the engine may hang a verdict on one of them.
     */
    lobingLambdas: LobingLambdaResult[];
    lobingFinal: VerticalLobingResult | null;
    /**
     * Why M-F-final produced nothing, when it produced nothing (F3b/4b).
     *
     * The capability matrix already says a metric is off when a DECLARED need
     * is unmet. This is the other half: the cases where the inputs are all
     * present and the synthesis still cannot answer — one usable source, or
     * every source at the same height. Both would otherwise reach the panel as
     * an absent row, which a reader cannot tell from "not computed yet".
     */
    lobingFinalOff: string | null;
    directivity: DirectivityMatchResult[];
    breakup: BreakupDistanceResult[];
    groupDelay: GroupDelayResult | null;
  };
  predesign: {
    gaps: AnchoredGaps | null;
    /**
     * UI-1 — set when `gaps` is null BECAUSE a level could not be believed,
     * rather than because there were fewer than two ways. Two causes, one
     * absence; a reader is owed the difference and a panel cannot invent it.
     */
    gapsBlocked: AnchorFloorBlock | null;
    windows: XoWindowResult[];
    /**
     * F4d — the INPUTS each window above was derived from, one per adjacent
     * pair and in the same order.
     *
     * Exposed because A5d.3's floor is k·f_s with k falling as the flank
     * steepens, so a window is a function of the ORDER and the candidate
     * generator needs to re-derive one per candidate order (see
     * `predesign/candidates.ts`). Handing it the finished window instead would
     * put every order it generates under a floor computed for a different one.
     * The alternative — inverting `k·f_s` back through the factor table to
     * recover f_s — is re-deriving an input from an output, which is the quiet
     * second derivation `xoWindow.ts` carries `upperFsHz` to avoid.
     */
    windowInputs: XoWindowInput[];
    /**
     * A5d.6 — the bounds the ACTIVE budgets invert to, on this measurement
     * set. Empty when no budget is stated (P4). Reporting only here: the
     * search box is built from the same inversion inside the v2 path.
     */
    bounds: InvertedBound[];
    boundNotes: string[];
    /** V51 — see `LevelWorkAnalysis`. Null with fewer than one way. */
    levelWork: LevelWorkAnalysis | null;
  };
  /**
   * The GATES on the loaded filter (Deliverable 2).
   *
   * Every gate appears, active or not: an inactive one shows its measured
   * value and says no limit was set. The verdicts come from the same
   * assembly the optimiser uses, on the numbers the metric section above
   * already computed — the panel and the search cannot disagree about a
   * design because they cannot compute it twice.
   */
  gates: {
    verdicts: GateVerdict[];
    /** Null when nothing active failed. */
    violation: string | null;
    /** True when the project stated at least one limit. */
    anyActive: boolean;
    /** Ways M-C applies to, DERIVED from the branches' own transfers. */
    highPassProtected: string[];
  };
  system: SystemSummary;
  /**
   * UI-1 — WHAT this report is about: the NETWORK it was built on, by name,
   * or null when none was loaded.
   *
   * Sounds like decoration and is not. With no filter every network metric
   * reports "off" and every gate reports a value it could not measure, and the
   * two together render as a full panel of rows that a reader takes for a
   * verdict on a design. The panel has to be able to say "there is no design
   * here" in its own heading, and it can only say that if the report tells it.
   * The alternative — the panel inferring emptiness from a pattern of absent
   * rows — is the app deducing its own input.
   */
  subject: { network: string | null };
  /** Everything the report could not do, addressed to the designer. */
  problems: string[];
}

/** How close a way has to be to the sum to count as "contributing" (indicator a). */
const CONTRIBUTING_WITHIN_DB = 10;

export function buildReport(input: EngineV2ReportInput): EngineV2Report {
  /* R_e's THREE SOURCES resolve inside the derivation pass, not here.
   * A5c.1's hierarchy — an entered DC resistance beats the motional fit beats
   * the direct reading — has to be applied where the ALIGNMENT, the loss
   * indicator and the voice-coil fit are computed, or those keep quoting a
   * different R_e than M-E does. So the entered values and the fit's quality
   * limits are handed to the pass, and everything downstream simply reads
   * `d.re`. */
  const ingest = runIngest(input.manifest, input.files, {
    ...input.ingestOptions,
    ...(input.settings.reOhmByDriver ? { reOhmByDriver: input.settings.reOhmByDriver } : {}),
    ...(input.settings.reFitMaxRelativeResidual !== undefined
      ? { reFitMaxRelativeResidual: input.settings.reFitMaxRelativeResidual }
      : {}),
    ...(input.settings.reFitMaxBandSensitivityFraction !== undefined
      ? { reFitMaxBandSensitivityFraction: input.settings.reFitMaxBandSensitivityFraction }
      : {}),
  });
  const problems = [...ingest.problems];

  /* ---------------- the analysis grid and the solved network ------------- */
  let analysis: NetworkAnalysis | null = null;
  let grid: number[] | null = null;
  /** V32 — the impedance half, kept so the gates can name where they judged. */
  let impedanceRef: ImpedanceReference | null = null;
  if (input.filter) {
    const models = Object.keys(input.filter.driverZ);
    if (models.length === 0) {
      problems.push('The loaded filter carries no driver impedances - nothing to solve.');
    } else {
      /* V32 — THE ONE RULE, SHARED WITH THE GATE REFERENCE.
       *
       * This grid used to be built here and only here; the v2 worker judged on
       * the chain's 200 Hz analysis grid instead, and the two disagreed about
       * three frozen netlists by 0.2 Ω. `impedanceReferenceFrom` is now the
       * single implementation, so the panel and the search cannot drift apart
       * by editing one of them. Same extent, same resolution, same clamping,
       * same sentence about it — see `impedanceReference.ts`. */
      const sweeps: Record<string, MeasuredSweep> = {};
      for (const m of models) {
        const z = input.filter.driverZ[m];
        sweeps[m] = {
          grid: z.freq,
          magnitude: z.magnitude,
          phaseDeg: z.phaseDeg,
          validHz: [z.freq[0], z.freq[z.freq.length - 1]],
        };
      }
      impedanceRef = impedanceReferenceFrom(sweeps);
      if (!impedanceRef) {
        problems.push(
          'The loaded filter carries no usable impedance sweep, so nothing electrical is judged.',
        );
      } else {
        grid = impedanceRef.grid;
        problems.push(...impedanceRef.notes);
        try {
          analysis = buildAnalysis(input.filter.netlist, grid, impedanceRef.driverZ);
        } catch (e) {
          problems.push(`The filter could not be solved: ${(e as Error).message}`);
        }
      }
    }
  }

  /* ---------------- branch responses, ordering and crossings ------------- */
  const branchDb: { driver: string; grid: number[]; db: number[] }[] = [];
  const branchComplex = new Map<string, Complex[]>();
  if (analysis && grid) {
    for (const d of ingest.drivers) {
      const h = analysis.transferByModel[d.driver];
      // The UNCLIPPED sum: see `DerivedAngleFull`. Where two branches cross is
      // a property of the design; clipping the measurement first would just
      // move the answer.
      const src = d.onAxisFull;
      if (!h || !src) continue;
      const measured = grid.map((f) => {
        const spl = interpLog(src.grid, src.db, f);
        const ph = interpLog(src.grid, src.phaseDeg, f);
        return toComplex(spl, ph);
      });
      const filtered = measured.map((p, i) => ({
        re: p.re * h[i].re - p.im * h[i].im,
        im: p.re * h[i].im + p.im * h[i].re,
      }));
      branchComplex.set(d.driver, filtered);
      branchDb.push({ driver: d.driver, grid, db: filtered.map((z) => dbAmp(cabs(z))) });
    }
  }
  const order = branchDb.length
    ? orderDriversLowToHigh(branchDb)
    : orderByMeasuredCentroid(ingest);
  const crossings = branchDb.length ? deriveCrossings(order, branchDb) : [];

  const ctx: MetricContext = {
    ingest,
    analysis,
    geometry: input.geometry,
    settings: input.settings,
    crossings,
    driversLowToHigh: order,
  };
  const capability = buildCapabilityMatrix(ctx);

  /* ---------------- metrics, each only when its cell is active ----------- */
  const metrics: EngineV2Report['metrics'] = {
    dissipation: null,
    epdr: null,
    driveVoltage: [],
    driveExcursion: [],
    driveExcursionOff: [],
    buildability: null,
    weakestLink: [],
    splAtPower: [],
    lfBump: [],
    thevenin: [],
    lobingLambdas: [],
    lobingFinal: null,
    lobingFinalOff: null,
    directivity: [],
    breakup: [],
    groupDelay: null,
  };

  if (analysis && isActive(capability, 'M-A', 'system')) {
    metrics.dissipation = dissipation(analysis, {
      amplifierPowerW: input.settings.amplifierPowerW,
      weight: input.settings.programmeWeight,
    });
  }
  if (analysis && isActive(capability, 'M-B', 'system')) {
    metrics.epdr = epdr(analysis);
  }
  /* ---------------- V50: buildability, on the same solved network --------- *
   * The resistor watts come from M-A's own elements (no second integral); the
   * coil currents are read off the element currents at the amplifier's peak
   * input. Both lists exist whenever the network is solved — a report with no
   * stated class still shows the figures, because P4's visible half is what
   * lets a designer decide which class to state. */
  const peakV = (() => {
    const p = input.settings.amplifierPeakPowerW;
    const r = input.settings.amplifierNominalLoadOhm;
    return p !== undefined && p > 0 && r !== undefined && r > 0
      ? peakInputVolts({ peakPowerW: p, nominalLoadOhm: r })
      : undefined;
  })();
  if (analysis && metrics.dissipation) {
    metrics.buildability = {
      resistorLoads: resistorLoads(metrics.dissipation, {
        /* V51 — formed at the power M-A/part JUDGES at: the stated thermal
         * design power, else the continuous rating (V50). The M-A watt column
         * above stays at the rating; `resistorJudgementPowerW` is the one rule
         * the gate reads too. */
        ...((): { continuousPowerW?: number } => {
          const w = resistorJudgementPowerW(input.settings);
          return w !== undefined ? { continuousPowerW: w } : {};
        })(),
        ...(input.settings.resistorClassW !== undefined ? { resistorClassW: input.settings.resistorClassW } : {}),
        ...(input.settings.resistorPowerMargin !== undefined
          ? { marginFraction: input.settings.resistorPowerMargin }
          : {}),
      }),
      coilLoads: coilLoads(analysis, {
        ...(peakV !== undefined ? { peakInputVolts: peakV } : {}),
        ...(input.settings.coilClassA !== undefined ? { coilClassA: input.settings.coilClassA } : {}),
      }),
    };
  }

  for (const driver of order) {
    const d = ingest.drivers.find((x) => x.driver === driver);
    if (!d || !analysis || !grid) continue;
    const fs = d.impedance?.fundamentalHz ?? null;

    if (fs !== null && isActive(capability, 'M-C', driver)) {
      const fallback: [number, number] = d.onAxis ? d.onAxis.bandHz : [grid[0], grid[grid.length - 1]];
      const pass = passbandOf(driver, crossings, fallback);
      const r = driveVoltageOnResonance(analysis, driver, fs, pass);
      if (r) metrics.driveVoltage.push(r);
    }

    if (fs !== null && d.nearField && isActive(capability, 'M-D', driver)) {
      const above = crossings.find((c) => c.lower === driver && Number.isFinite(c.fHz));
      const h = analysis.transferByModel[driver];
      if (h) {
        /* V43 — the second curve M-D's decomposition needs: the same network
         * with its reactances replaced by their own series resistance. Solved
         * lazily by the analysis, once for the whole report, and absent here
         * only when this branch collapses in that limit. */
        const eq = analysis.resistiveEquivalent();
        const hRes = eq.transferByModel[driver];
        const r = lfBump(d.nearField.grid, d.nearField.db, grid, h, fs, {
          validHz: d.nearField.bandHz,
          belowHz: above?.fHz,
          ...(hRes && !eq.shortedDriverModels.includes(driver) ? { resistiveHEl: hRes } : {}),
        });
        if (r) metrics.lfBump.push({ driver, result: r });
      }
    }

    if (fs !== null && isActive(capability, 'M-E', driver)) {
      // ONE R_e, resolved once, in the pass. M-E reads the same number the
      // alignment and the Q_es bound read, and quotes the same provenance.
      const re = d.re
        ? {
            ohm: d.re.ohm,
            source:
              d.re.sourceText +
              (d.re.motionalProximityWarning ? ` — ${d.re.motionalProximityWarning}` : ''),
          }
        : null;
      const r = thevenin(analysis, driver, fs, re);
      if (r) metrics.thevenin.push(r);
    }
  }

  /* ---------------- V49: M-C v2.0, the excursion-derived ceiling ---------- *
   * Per driver, from the ingest pass's classification (f0, Z_max, Small's
   * Q_ms) and the stated card and amplifier peak. Independent of the loaded
   * filter — class A on a casus — which is why it runs whether or not there
   * is a network; the WEAKEST-LINK reading below needs the network and is
   * taken only with one. */
  const amp =
    (input.settings.amplifierPeakPowerW ?? 0) > 0 && (input.settings.amplifierNominalLoadOhm ?? 0) > 0
      ? { peakPowerW: input.settings.amplifierPeakPowerW!, nominalLoadOhm: input.settings.amplifierNominalLoadOhm! }
      : null;
  const margin = input.settings.xmaxMarginFraction;
  for (const driver of order) {
    const d = ingest.drivers.find((x) => x.driver === driver);
    if (!d) continue;
    if (!isActive(capability, 'M-C-excursion', driver)) {
      const cell = capability.cells.find((c) => c.metric === 'M-C-excursion' && c.subject === driver);
      metrics.driveExcursionOff.push(
        `M-C v2.0 is OFF for ${driver}: ${cell?.reasons.join('; ') ?? 'a declared input is missing'}`,
      );
      continue;
    }
    const card = input.settings.driverCardByDriver![driver];
    const cls = d.impedance!;
    const f0 = cls.fundamentalHz!;
    /* Q_ms and Z_max at the FUNDAMENTAL: Small's construction on the sealed
     * fundamental, or on the vented upper peak — an approximation there, and
     * named as one. Read off the peak the classification called fundamental,
     * never off "the tallest peak" (V8b). */
    const peak = cls.motionalPeaks.find((pk) => pk.fHz === f0) ?? null;
    const qms =
      peak && peak.qms !== null
        ? {
            value: peak.qms,
            source:
              cls.type === 'sealed'
                ? 'Small\'s Q_mc of the sealed fundamental (half-power at √r0·R_e), measured in situ'
                : cls.type === 'reflex'
                  ? 'Small\'s construction on the UPPER peak of the vented pair — an approximation: ' +
                    'a vented box is a two-degree system and this reads it as one'
                  : 'Small\'s construction on the fundamental, measured in situ',
          }
        : null;
    const drive = input.settings.responseDriveByDriver?.[driver];
    const splAtF0 =
      drive && d.onAxis && f0 >= d.onAxis.bandHz[0] && f0 <= d.onAxis.bandHz[1]
        ? interpLog(d.onAxis.grid, d.onAxis.db, f0)
        : null;
    const r = driveExcursion({
      driver,
      f0Hz: f0,
      card,
      amplifier: amp!,
      marginFraction: margin!,
      zMaxOhm: peak?.ohm ?? null,
      qms,
      acoustic:
        drive && splAtF0 !== null
          ? { splDbAtF0: splAtF0, driveVoltageV: drive.driveVoltageV, micDistanceMm: drive.micDistanceMm, source: drive.source ?? 'documented response drive' }
          : null,
      acousticOff: !drive
        ? 'the drive voltage and mic distance of the on-axis response are not documented'
        : !d.onAxis
          ? 'no on-axis far-field response for this driver'
          : `the resonance (${f0.toFixed(1)} Hz) lies outside the far-field validity band ` +
            `(${d.onAxis.bandHz[0].toFixed(0)}-${d.onAxis.bandHz[1].toFixed(0)} Hz), so no SPL there may be believed`,
    });
    if ('off' in r) {
      metrics.driveExcursionOff.push(r.off);
      continue;
    }
    metrics.driveExcursion.push(r);
    if (drive && d.onAxis && d.level) {
      metrics.splAtPower.push({
        driver,
        powerW: input.settings.amplifierPowerW ?? null,
        continuousDb:
          input.settings.amplifierPowerW !== undefined
            ? splAtPowerRe1m({
                splDb: d.level.db,
                driveVoltageV: drive.driveVoltageV,
                micDistanceMm: drive.micDistanceMm,
                powerW: input.settings.amplifierPowerW,
                nominalLoadOhm: amp!.nominalLoadOhm,
              })
            : null,
        peakPowerW: amp!.peakPowerW,
        peakDb: splAtPowerRe1m({
          splDb: d.level.db,
          driveVoltageV: drive.driveVoltageV,
          micDistanceMm: drive.micDistanceMm,
          powerW: amp!.peakPowerW,
          nominalLoadOhm: amp!.nominalLoadOhm,
        }),
      });
    }
  }

  /* ---------------- pair metrics ---------------- */
  for (let i = 0; i + 1 < order.length; i++) {
    const lower = order[i];
    const upper = order[i + 1];
    const key = ctcKey(lower, upper);
    const crossing = crossings.find((c) => c.lower === lower && c.upper === upper);
    const fx = crossing && Number.isFinite(crossing.fHz) ? crossing.fHz : null;

    const spacing = input.geometry.ctcMm?.[key];
    if (isActive(capability, 'M-F-interim', key)) {
      metrics.lobingLambdas.push(
        lobingLambdas(
          lobingWayOf(input.geometry, lower),
          lobingWayOf(input.geometry, upper),
          fx,
          spacing !== undefined
            ? {
                pairDistanceMm: {
                  mm: spacing,
                  source: input.geometry.ctcSource?.[key] ?? 'entered centre-to-centre spacing',
                },
              }
            : {},
        ),
      );
    }

    const dLower = ingest.drivers.find((x) => x.driver === lower);
    const dUpper = ingest.drivers.find((x) => x.driver === upper);
    if (dLower && isActive(capability, 'M-G', key)) {
      const pair = dLower.directivity[0] ?? null;
      const upperPair = dUpper?.directivity[0] ?? null;
      const both =
        pair && upperPair && input.settings.diMatchToleranceDb !== undefined
          ? {
              grid: pair.grid,
              lowerDiffDb: pair.differenceDb,
              upperDiffDb: pair.grid.map((f) => interpLog(upperPair.grid, upperPair.differenceDb, f)),
            }
          : null;
      metrics.directivity.push(
        directivityMatch(
          lower,
          upper,
          pair?.angleDeg ?? NaN,
          pair,
          fx,
          both,
          input.settings.diMatchToleranceDb ?? 0,
        ),
      );
    }

    if (dLower?.breakups && isActive(capability, 'M-H', key)) {
      // The FIRST SIGNIFICANT breakup, on the same threshold the crossover
      // window uses - the two must not be able to disagree about which
      // resonance constrains this handover.
      const threshold = input.settings.significantBreakupDb ?? DEFAULT_SIGNIFICANT_BREAKUP_DB;
      const significant = dLower.breakups.peaks
        .filter((p) => p.dB >= threshold)
        .sort((a, b) => a.fHz - b.fHz);
      const first = significant[0];
      if (first) {
        const h = analysis?.transferByModel[lower];
        const suppression =
          h && grid ? dbAmp(cabs(h[nearestIx(grid, first.fHz)])) : null;
        const pers = dLower.persistence.find((p) => Math.abs(Math.log2(p.fHz / first.fHz)) < 1 / 12) ?? null;
        metrics.breakup.push(breakupDistance(lower, first, fx, suppression, pers));
      }
    }
  }

  /* ---------------- M-F final and M-J ---------------- */
  if (analysis && grid && !isActive(capability, 'M-F-final', 'system')) {
    /* OFF BECAUSE A DECLARED NEED IS UNMET (A5.3 / P4).
     *
     * The capability matrix already carries this verdict, and it is the right
     * place for it — but a reader looking for a lobing number looks at the
     * METRIC, and an absent row there is indistinguishable from "not computed
     * yet". So the reason is repeated where the number would have been. */
    const cell = capability.cells.find((c) => c.metric === 'M-F-final');
    /* The declaration says WHICH NEED is unmet; only the report knows WHICH
     * WAYS. A5.3 wants the reason with the verdict, and "offsets are missing
     * for one or more drivers" leaves the designer to work out which field to
     * fill — so the ways are named here, where they are known. */
    const named = order.filter((d) => input.geometry.zOffsetMm?.[d] === undefined);
    metrics.lobingFinalOff = cell?.reasons.length
      ? `M-F-final is OFF: ${cell.reasons.join('; ')}` +
        (named.length ? ` — ${named.join(', ')}` : '') +
        '. Running it on the ways that DO have an acoustic centre would describe a different ' +
        'speaker than the one on screen, and running it on one source would report 0.0 dB of ' +
        'vertical deviation — the arithmetic of the missing input, not a result.'
      : 'M-F-final is OFF: a declared input is missing.';
  }
  if (analysis && grid && isActive(capability, 'M-F-final', 'system')) {
    const sources: VerticalSource[] = [];
    /* A way that has no acoustic centre is DROPPED, and dropping it silently
     * was the defect. The synthesis would then describe a two-way version of a
     * three-way speaker and call it the system — and with one way left it
     * would report the coplanar 0.0 dB. Every drop is recorded and turned into
     * a stated reason below. */
    const missing: string[] = [];
    for (const driver of order) {
      const d = ingest.drivers.find((x) => x.driver === driver);
      const h = analysis.transferByModel[driver];
      const z = input.geometry.zOffsetMm?.[driver];
      if (z === undefined) missing.push(`${driver} (no acoustic-centre offset entered)`);
      else if (!d?.onAxis) missing.push(`${driver} (no on-axis far-field measurement)`);
      else if (!h) missing.push(`${driver} (no branch in the loaded filter)`);
      if (!d?.onAxis || !h || z === undefined) continue;
      const pressure = grid.map((f) =>
        toComplex(interpLog(d.onAxis!.grid, d.onAxis!.db, f), interpLog(d.onAxis!.grid, d.onAxis!.phaseDeg, f)),
      );
      sources.push({
        driver,
        pressure,
        transfer: h,
        zM: z / MM_PER_M,
        rotationallySymmetric: input.geometry.rotationallySymmetric?.[driver] ?? false,
      });
    }
    const band = commonBand(ingest);
    const xoRegion = crossings.length
      ? ([
          Math.min(...crossings.filter((c) => Number.isFinite(c.fHz)).map((c) => c.fHz)) / 2,
          Math.max(...crossings.filter((c) => Number.isFinite(c.fHz)).map((c) => c.fHz)) * 2,
        ] as [number, number])
      : null;
    if (!band) {
      metrics.lobingFinalOff =
        'M-F-final is OFF: the drivers share no valid band, so there is nothing to synthesise over.';
    } else if (missing.length > 0) {
      metrics.lobingFinalOff =
        'M-F-final is OFF: the vertical synthesis needs the acoustic centre of EVERY way, and ' +
        `these are missing — ${missing.join(', ')}. Running it on the rest would describe a ` +
        'different speaker than the one on screen; running it on one source would report 0.0 dB ' +
        'of vertical deviation, which is the arithmetic of the missing input and not a result.';
    } else {
      const r = verticalLobing(
        grid,
        sources,
        input.settings.verticalWindowDeg ?? [],
        xoRegion,
        band,
      );
      metrics.lobingFinal = r;
      if (!r) {
        const zs = sources.map((s) => input.geometry.zOffsetMm?.[s.driver] ?? 0);
        metrics.lobingFinalOff =
          sources.length < 2
            ? 'M-F-final is OFF: fewer than two usable sources, so there is no path difference ' +
              'to synthesise and the metric would report 0.0 dB.'
            : 'M-F-final is OFF: every way is entered at the same acoustic centre ' +
              `(${zs[0].toFixed(1)} mm). A coplanar set has no path difference off axis, so the ` +
              'synthesis is identically 0.0 dB at every angle — the arithmetic of the entry, not ' +
              'a property of the speaker. Enter the real vertical positions.';
      }
    }
  }

  const sum = sumBranches(branchComplex, grid);
  if (analysis && grid && sum && isActive(capability, 'M-J', 'system')) {
    const band = commonBand(ingest);
    if (band) {
      metrics.groupDelay = groupDelay(
        grid,
        unwrapPhaseDeg(sum.map(cargDeg)),
        band,
        input.settings.groupDelayThresholdMsKnots,
      );
    }
  }

  /* ---------------- pre-design ---------------- */
  const windows: XoWindowResult[] = [];
  const windowInputs: XoWindowInput[] = [];
  for (let i = 0; i + 1 < order.length; i++) {
    const lower = order[i];
    const upper = order[i + 1];
    const key = ctcKey(lower, upper);
    const dLower = ingest.drivers.find((x) => x.driver === lower);
    const dUpper = ingest.drivers.find((x) => x.driver === upper);
    const floors: { hz: number; src: string }[] = [];
    for (const d of [dLower, dUpper]) {
      if (d?.onAxis) floors.push({ hz: d.onAxis.bandHz[0], src: `${d.driver} far field` });
    }
    const worst = floors.length ? floors.reduce((a, b) => (b.hz > a.hz ? b : a)) : null;
    const dir = dLower?.directivity[0] ?? null;
    const windowInput: XoWindowInput = {
        lower,
        upper,
        order: input.settings.orderByPair?.[key] ?? NaN,
        validityFloorHz: worst?.hz ?? null,
        validityFloorSource: worst?.src ?? 'unknown',
        upperFsHz: dUpper?.impedance?.fundamentalHz ?? null,
        /* A5e.3-veld — the excursion ceiling of the UPPER driver (V49), derived
         * above for every driver with a card, a peak and a sweep. A driver
         * property, so a window floor may stand on it; absent = no such floor. */
        upperDriveCeilingDb: metrics.driveExcursion.find((r) => r.driver === upper)?.ceiling.ceilingDbReInput ?? null,
        upperDriveCeilingSource:
          'driver card, amplifier peak and measured sweep - metrics/driveExcursion.ts, V49; ' +
          'the ceiling the M-C gate judges the way against',
        /* A5e.3b — the STATED M-C figure of the upper driver, through the ONE
         * rule the gate reads it by (per-way first, then the single field). It
         * used to be deliberately withheld from the windows; A5e.3b feeds it,
         * and the window takes the strictest known floor — see `xoWindow.ts`. */
        upperStatedDriveLimitDb: statedDriveLimitDb(input.settings, upper) ?? null,
        upperStatedDriveLimitSource:
          'the stated maximum drive on the driver\'s own resonance (gestelde_eisen, V47b/V50), ' +
          'passband-relative, through statedDriveLimitDb - the same rule the M-C gate reads',
        lowerBreakups: dLower?.breakups?.peaks.map((p) => ({ fHz: p.fHz, dB: p.dB })) ?? [],
        significantBreakupDb: input.settings.significantBreakupDb,
        lowerMinus6Hz: dir?.minus6Hz ?? null,
        lowerMinus6AngleDeg: dir?.angleDeg ?? null,
        spacingMm: input.geometry.ctcMm?.[key] ?? null,
        spacingSource: input.geometry.ctcSource?.[key],
    };
    windowInputs.push(windowInput);
    windows.push(crossoverWindow(windowInput));
  }

  /**
   * A5d.4's levels, over each way's OWN band.
   *
   * The band matters more than the averaging does. Averaged over everything it
   * was measured on, a woofer's level is dragged down by the rolloff above its
   * range and a tweeter's by the rolloff below its own - which turns a
   * sensitivity comparison into a comparison of how wide each measurement is.
   * So each way is averaged between the HANDOVERS AROUND IT, and the handover
   * used is the centre of the feasible window (A5d.3) rather than a crossing
   * from some particular filter: this is a PRE-design analysis and must give
   * the same answer before any filter exists.
   */
  const boundaries: (number | null)[] = windows.map((w) =>
    w.floorHz !== null && w.ceilingHz !== null && w.ceilingHz > w.floorHz
      ? Math.sqrt(w.floorHz * w.ceilingHz)
      : (crossings.find((c) => c.lower === w.lower && c.upper === w.upper)?.fHz ?? null),
  );
  const levels: WayLevel[] = [];
  for (let i = 0; i < order.length; i++) {
    const d = ingest.drivers.find((x) => x.driver === order[i]);
    if (!d?.onAxis) continue;
    const lo = i === 0 ? d.onAxis.bandHz[0] : boundaries[i - 1] ?? d.onAxis.bandHz[0];
    const hi = i === order.length - 1 ? d.onAxis.bandHz[1] : boundaries[i] ?? d.onAxis.bandHz[1];
    if (!(hi > lo)) continue;
    const lvl = passbandLevel(d.onAxis.db, d.onAxis.grid, [lo, hi]);
    if (lvl) {
      // The floor's provenance travels WITH the level (F3b/4c). Without it the
      // gap block cannot tell a level averaged from a derived gate floor from
      // one averaged from wherever a sweep begins, and those two produce the
      // same-looking number with different meanings.
      levels.push({
        driver: d.driver,
        db: lvl.db,
        bandHz: lvl.bandHz,
        bandFloorKnown: d.onAxis.bandFloorKnown,
        bandFloorProvenance: d.onAxis.bandFloorProvenance,
      });
    }
  }
  /* A5d.4(a) via A5e.2 — THE ANCHOR AFTER BAFFLE STEP, since V45.
   *
   * The shift is the target curve read over each way's OWN level band, with the
   * sign turned round: a way the voicing puts below the flat part is credited
   * that much, so its gap and its chained attenuation budget grow by exactly
   * what the design deliberately asked it to give up.
   *
   * SAME BAND AND SAME GRID AS THE LEVEL IT ADJUSTS, and same estimator — the
   * energy average of `passbandLevel`, not an arithmetic mean of decibels. A
   * level and the target it is compared against have to be the same kind of
   * quantity or the difference between them is not a gap (V15).
   *
   * A curve that cannot be evaluated produces NO shift and a problem, never a
   * silent flat: that is the difference between "this design is voiced flat"
   * and "this design states a voicing nothing could read". */
  let targetShift: Record<string, number> | undefined;
  const curve = input.settings.targetCurve ?? FLAT_TARGET;
  if (curve.type !== 'flat' && levels.length > 0) {
    try {
      const shift: Record<string, number> = {};
      for (const l of levels) {
        const d = ingest.drivers.find((x) => x.driver === l.driver);
        if (!d?.onAxis) continue;
        const offsets = targetOffsetsDb(curve, d.onAxis.grid);
        const t = passbandLevel(offsets, d.onAxis.grid, l.bandHz);
        if (t) shift[l.driver] = -t.db;
      }
      if (Object.keys(shift).length > 0) targetShift = shift;
    } catch (e) {
      problems.push(
        `The target curve could not be applied to the anchored gap analysis: ${(e as Error).message}`,
      );
    }
  }
  const gaps = anchoredGaps(levels, targetShift);
  /* Computed from the same `levels`, so the block and the absence can never
   * disagree about why there is no table. */
  const gapsBlocked = anchorFloorBlock(levels);

  /* ---------------- V51: level work on the lowest way ---------------- *
   * Derived from the anchored gaps above (plateau included, because the gaps
   * are), the stated wiring per way, the target curve's transition and the
   * loaded netlist. Nothing here is a limit; see `LevelWorkAnalysis`. */
  const levelWork = ((): LevelWorkAnalysis | null => {
    if (order.length === 0) return null;
    const lowest = order[0];
    const notes: string[] = [];
    const wiringStated = input.settings.wiringByDriver ?? {};
    const wiring = order.map((driver) => {
      const w = wiringStated[driver];
      return w
        ? { driver, stated: true, count: Math.max(1, Math.floor(w.count)), measured: w.measured, desired: w.desired }
        : { driver, stated: false, count: 1, measured: null, desired: null };
    });
    let aboveAnchorDb: number | null = null;
    let anchor: string | null = null;
    if (gaps) {
      anchor = gaps.anchor;
      aboveAnchorDb = gaps.anchor === lowest ? 0 : (gaps.ways.find((w) => w.driver === lowest)?.gapToAnchorDb ?? null);
    } else {
      notes.push(
        gapsBlocked
          ? 'The anchored gaps are blocked (a level rests on an unknown window), so how far the ' +
            'lowest way sits above the anchor is not known here.'
          : 'No anchored gap analysis: fewer than two ways with a usable band.',
      );
    }
    const lw = wiring[0];
    const seriesWouldDeliverDb =
      lw.stated && lw.count > 1 && lw.desired === 'parallel' ? parallelGainDb(lw.count) : null;
    const curve = input.settings.targetCurve ?? FLAT_TARGET;
    const stepHz = curve.type === 'bass-plateau' && curve.stepHz !== undefined && curve.stepHz > 0 ? curve.stepHz : null;
    const baffleStepFullDb = DB_PER_DECADE_AMPLITUDE * Math.log10(2);
    const delivered = input.filter ? levelWorkOnNetlist(input.filter.netlist, lowest) : null;
    const requirement = input.settings.lowestWayLevelWork ?? null;
    /* V51b — the maximum and the flag, from the one rule (`levelWork.ts`). */
    const maxSeriesOhm = seriesRMaxOhmOf(requirement);
    const verdict = delivered && requirement !== null ? levelWorkVerdict(delivered, requirement) : null;
    const judgedBand = commonBand(ingest);
    const plateau = judgedBand ? plateauCoverage(curve, judgedBand) : null;
    if (lw.stated && lw.measured !== lw.desired) {
      notes.push(
        `${lowest} is measured ${lw.measured} and wanted ${lw.desired}: the derived response of the ` +
          'desired wiring is NOT applied to the measurements here (the levels above are as measured); ' +
          'see ingest/wiring.ts for the transform and its equal-drivers assumption.',
      );
    }
    const sentence =
      (aboveAnchorDb === null
        ? `How far ${lowest} sits above the anchor is not known (see the notes). `
        : aboveAnchorDb <= 0
          ? `${lowest} is the anchor: the configuration asks no level work on it. `
          : `${lowest} sits ${aboveAnchorDb.toFixed(2)} dB above the anchor (${anchor}) in the handover ` +
            'region, after the target curve — that is the level work this configuration asks on it. ') +
      (seriesWouldDeliverDb !== null
        ? `${lw.count} equal drivers in series would deliver ${seriesWouldDeliverDb.toFixed(2)} dB of that ` +
          'without a resistor (20·log10(N); phase unchanged, impedance ×N²). '
        : lw.stated
          ? 'A single driver: wiring offers no level work. '
          : 'No wiring is stated for the lowest way, so what series wiring would deliver is not computed. ') +
      (stepHz !== null
        ? `The baffle step at ${stepHz.toFixed(0)} Hz delivers up to ${baffleStepFullDb.toFixed(1)} dB below it by ` +
          'itself; a handover placed low uses that. '
        : 'No bass-plateau target curve is stated, so no transition frequency is known here. ') +
      (requirement === 'none'
        ? 'The project states that the lowest way may carry NO level work (no series resistor, no shunt pad).'
        : requirement === 'allowed'
          ? 'The project states that level work on the lowest way is allowed.'
          : maxSeriesOhm !== null
            ? `The project allows series resistance on the lowest way up to ${maxSeriesOhm.toFixed(2)} Ω in total ` +
              '(discrete resistors plus coil DCR) and no pad (V51b). An air-core coil whose DCR is that resistance ' +
              'does the same as a discrete resistor beside it: which carries it is a build choice, not a decision of this report.'
            : 'The project states no requirement about level work on the lowest way (P4): what a netlist ' +
              'carries there is shown and nothing judges it.');
    if (verdict && verdict.ok === false) {
      notes.push(`FLAG (no gate): the loaded netlist does not honour the stated rule — ${verdict.why}.`);
    }
    /* ---- A5e.3: the coil families and what the loaded netlist carries ---- */
    const statedFamilyByDriver: Record<string, string> = {};
    for (const [drv, fam] of Object.entries(input.settings.coilDcrFamilyByDriver ?? {})) {
      if (typeof fam === 'string' && fam !== '') statedFamilyByDriver[drv] = fam;
    }
    const resolved =
      Object.keys(statedFamilyByDriver).length > 0
        ? coilDcrModelFor(statedFamilyByDriver, input.settings.coilDcrFits ?? [])
        : { model: null, missing: [] as { way: string; family: string }[] };
    const coilInventory = input.filter ? coilDcrInventoryOfNetlist(input.filter.netlist, resolved.model) : null;
    if (Object.keys(statedFamilyByDriver).length === 0) {
      notes.push(
        'No coil family is stated for any way (A5e.3): a continuous coil is lossless in every judgement here ' +
          'unless the netlist itself carries a DCR param, which no built loudspeaker is. State the family per way ' +
          'on the driver card to model it.',
      );
    } else {
      if (resolved.model) {
        notes.push(`Coil DCR model (A5e.3, ${resolved.model.fitVersion}): ${describeCoilDcrModel(resolved.model)}.`);
      }
      if (resolved.missing.length > 0) {
        notes.push(
          `A coil family is stated for ${resolved.missing.map((m) => `${m.way} (${m.family})`).join(', ')} but the ` +
            (input.settings.coilDcrFits && input.settings.coilDcrFits.length > 0
              ? 'catalogue in use has no fit for it — its coils stay lossless here.'
              : 'no catalogue is loaded, so it cannot be resolved — its coils stay lossless here.'),
        );
      }
      if (coilInventory) {
        const without = coilInventory.waysWithoutFamily;
        if (without.length > 0) notes.push(`Ways without a stated coil family: ${without.join(', ')} — their coils are lossless unless the netlist carries DCR.`);
        const bare = coilInventory.coils.filter((c) => c.family !== null && c.carriedOhm === 0);
        if (bare.length > 0) {
          notes.push(
            `The loaded netlist carries NO DCR on ${bare.map((c) => `${c.id} (${(c.henry / H_PER_MH).toFixed(2)} mH, fit ${c.fitOhm!.toFixed(3)} Ω)`).join(', ')} ` +
              'although a family is stated for its way: this netlist was made without the model, and every electrical ' +
              'figure above is that of lossless coils.',
          );
        }
        if (coilInventory.outOfRange.length > 0) {
          notes.push(
            `FLAG (no gate): ${coilInventory.outOfRange.join(', ')} lie(s) outside the single-part range of the stated family — ` +
              'no single catalogue part covers the value; a stack of two in series can.',
          );
        }
      }
    }
    return {
      lowestWay: lowest,
      anchor,
      aboveAnchorDb,
      wiring,
      seriesWouldDeliverDb,
      stepHz,
      baffleStepFullDb,
      delivered,
      requirement,
      maxSeriesOhm,
      verdict,
      plateau,
      coilDcr: { statedFamilyByDriver, model: resolved.model, unresolved: resolved.missing, inventory: coilInventory },
      sentence,
      notes,
    };
  })();

  /* ---------------- F2: the gates on the loaded filter ------------------ *
   * Built from the numbers the metric section above ALREADY produced. No
   * second solve, and no second opinion: the verdict assembly is the one the
   * optimiser uses, so a design cannot read one way in the panel and another
   * way in the search. Every gate appears whether or not a limit was stated —
   * P4's visible half. */
  const highPassProtected: string[] = [];
  const drive: Parameters<typeof gateVerdicts>[1]['driveVoltage'] = [];
  for (const r of metrics.driveVoltage) {
    if (!analysis || !isActive(capability, 'M-C', r.driver)) continue;
    if (!isHighPassProtected(analysis, r.driver, r.passbandHz)) continue;
    highPassProtected.push(r.driver);
    drive.push({
      driver: r.driver,
      db: r.db,
      fsHz: r.fsHz,
      passbandHz: r.passbandHz,
      bandSource: 'derived from this filter\'s own crossings',
      passbandMeanDb: r.passbandMeanDb,
    });
  }
  /* V49 — the ceilings this report derived become the gate's second M-C limit
   * beside the stated figure, through the SAME setting the worker reads
   * (`driveCeilingDbByDriver`), so the panel and the search judge on one rule.
   * Only for ways M-C actually judges: an unprotected way gets no ceiling and
   * the weakest-link reading instead. */
  const ceilingByDriver: Record<string, number> = {};
  for (const r of metrics.driveExcursion) {
    if (highPassProtected.includes(r.driver)) ceilingByDriver[r.driver] = r.ceiling.ceilingDbReInput;
  }
  const gateSettings: GateSettings = {
    ...input.settings,
    ...(Object.keys(ceilingByDriver).length > 0
      ? { driveCeilingDbByDriver: { ...(input.settings.driveCeilingDbByDriver ?? {}), ...ceilingByDriver } }
      : {}),
    /* V50 — the peak input the coil gate reads currents at, derived once here
     * from the V49 amplifier fields; the worker receives the same number on
     * the wire (`v2.gates.peakInputVolts`), set by the same caller. */
    ...(peakV !== undefined ? { peakInputVolts: peakV } : {}),
  };
  for (const r of metrics.driveExcursion) {
    if (highPassProtected.includes(r.driver) || !analysis || !grid || !r.electromechanical) continue;
    const h = analysis.transferByModel[r.driver];
    const z = analysis.driverZ[r.driver];
    if (!h || !z) continue;
    const above = crossings.find((c) => c.lower === r.driver && Number.isFinite(c.fHz));
    metrics.weakestLink.push({
      driver: r.driver,
      ...weakestLink({
        grid,
        hAbs: h.map((v) => cabs(v)),
        zAbs: z.map((v) => cabs(v)),
        em: r.electromechanical,
        f0Hz: r.f0Hz,
        xLimitMm: r.ceiling.xLimitMm,
        peakInputVolts: r.peakInputVolts,
        ...(above ? { belowHz: above.fHz } : {}),
      }),
    });
  }
  const verdicts = gateVerdicts(gateSettings, {
    dissipationFraction: metrics.dissipation?.totalFraction ?? null,
    ...(metrics.dissipation ? { dissipationBandHz: metrics.dissipation.bandHz } : {}),
    epdrMinOhm: metrics.epdr?.minOhm ?? null,
    ...(metrics.epdr ? { epdrAtHz: metrics.epdr.atHz, minZAtHz: metrics.epdr.minZAtHz } : {}),
    minZOhm: metrics.epdr?.minZOhm ?? null,
    /* V32 — the same sentence the worker's verdicts carry, from the same
     * object. The panel has always judged on the measured sweep; saying so is
     * what makes the two surfaces comparable at a glance. */
    ...(impedanceRef ? { electricalSpan: impedanceRef.span } : {}),
    ...(input.filter && !impedanceRef
      ? {
          electricalUnavailable:
            'no usable impedance sweep was loaded with this filter, so no electrical requirement ' +
            'was judged.',
        }
      : {}),
    driveVoltage: drive,
    ...(metrics.buildability
      ? { resistorLoads: metrics.buildability.resistorLoads, coilLoads: metrics.buildability.coilLoads }
      : {}),
  });

  /* ---------------- F2: the budget inversions (A5d.6) ------------------- */
  const budgetWays: BudgetWay[] = [];
  for (let i = 0; i < order.length; i++) {
    const driver = order[i];
    const d = ingest.drivers.find((x) => x.driver === driver);
    if (!d) continue;
    const raw = input.filter?.driverZ[driver];
    const fallback: [number, number] = d.onAxis ? d.onAxis.bandHz : [20, 20000]; // P6-OK: only a fallback span when no measurement bounds exist
    const pass = passbandOf(driver, crossings, fallback);
    const gapWay = gaps?.ways.find((w) => w.driver === driver);
    const above = crossings.find((c) => c.lower === driver && Number.isFinite(c.fHz));
    budgetWays.push({
      driver,
      lowest: i === 0,
      highPassProtected: highPassProtected.includes(driver),
      reOhm: d.re?.ohm ?? null,
      reSource: d.re?.sourceText ?? 'no impedance measurement, so no R_e',
      zPassbandMedianOhm: raw ? passbandImpedanceMedian(raw.freq, raw.magnitude, pass) : null,
      passbandHz: pass,
      passbandMeanDb: metrics.driveVoltage.find((v) => v.driver === driver)?.passbandMeanDb ?? null,
      fsHz: d.impedance?.fundamentalHz ?? null,
      fPeakHz: d.impedance?.fundamentalHz ?? null,
      gapBudgetDb: gapWay ? gapWay.budgetDb : null,
      pathROhm: 0,
      ...(input.settings.orderByPair && above
        ? { order: input.settings.orderByPair[ctcKey(driver, above.upper)] }
        : {}),
      ...(above ? { crossingAboveHz: above.fHz } : {}),
      ...(d.nearField
        ? {
            nearField: {
              grid: d.nearField.grid,
              db: d.nearField.db,
              validHz: d.nearField.bandHz,
            },
          }
        : {}),
      ...(raw
        ? {
            impedance: {
              grid: raw.freq,
              z: raw.freq.map((_, k) => {
                const m = raw.magnitude[k];
                const ph = (raw.phaseDeg[k] * Math.PI) / DEG_PER_HALF_TURN;
                return { re: m * Math.cos(ph), im: m * Math.sin(ph) };
              }),
            },
          }
        : {}),
    });
  }
  const inverted = anyBudgetActive(input.settings)
    ? invertBudgets(budgetWays, input.settings, gateSettings)
    : { bounds: [], notes: [] };

  /* ---------------- F4b/V45 — the damping margin says what it does -------- *
   *
   * THE ASYMMETRY THIS BLOCK EXISTED TO CONFESS IS GONE, and that is the whole
   * V45 change here. `dampingMarginDb` used to be applied in this report and
   * NOT on the optimiser route: `worker.ts` handed the inversion a hard null
   * because A5d.4(a) wants the anchor level after baffle step and that was an
   * open decision (A5e.2), so the rule skipped every way and a designer who
   * filled the field in got a bound the search never saw. F4b's contribution
   * was to say so on screen rather than leave the number looking like it did
   * something.
   *
   * A5e.2 is closed. The anchored budgets now cross the border as a measured
   * fact with the target-curve shift already in them
   * (`optimizer/measurementFacts.ts`), so the two surfaces invert the SAME
   * bound from the same numbers — the V32 shape, one implementation with more
   * than one reader.
   *
   * F0's doctrine still holds on both sides and is what the sentences below
   * say: an empty field is no judgement, and a filled field that produced no
   * bound has to name the input that was missing rather than read as a limit
   * that happened not to bite. */
  const boundNotes = [...inverted.notes];
  if (input.settings.dampingMarginDb !== undefined) {
    const bounded = inverted.bounds.filter((b) => b.rule === 'gap-pad-r').map((b) => b.subject);
    boundNotes.push(
      bounded.length > 0
        ? `Damping margin: stated at ${input.settings.dampingMarginDb} dB and applied, on top of ` +
            `each way's anchored attenuation budget (A5d.4). Bounded here: ${bounded.join(', ')}. ` +
            'The v2 optimiser route inverts the same bound from the same anchored budgets, which ' +
            'cross to it as a measured fact — since V45 this table and the search agree by ' +
            'construction rather than by coincidence.'
        : `Damping margin: stated at ${input.settings.dampingMarginDb} dB, and it bounded no way ` +
            'on this design. That is a report about the inputs and not a limit that happened not ' +
            'to bite — the anchor has no attenuation budget by definition, and any other way ' +
            'without one is named in the inversion notes above with the measurement it lacked.',
    );
  }

  /* ---------------- system summary ---------------- */
  const system = summarise(
    ingest,
    order,
    crossings,
    branchComplex,
    branchDb,
    sum,
    grid,
    analysis?.transferByModel ?? null,
    input.settings.targetCurve ?? FLAT_TARGET,
  );

  return {
    engine: { label: ENGINE_V2_LABEL, version: ENGINE_V2_VERSION, mark: engineV2Mark() },
    ingest,
    capability,
    crossings,
    driversLowToHigh: order,
    analysisGrid: grid,
    metrics,
    predesign: { gaps, gapsBlocked, windows, windowInputs, bounds: inverted.bounds, boundNotes, levelWork },
    gates: {
      verdicts,
      violation: violationText(verdicts),
      anyActive: verdicts.some((v) => v.active),
      highPassProtected,
    },
    system,
    subject: { network: input.filter?.name ?? null },
    problems,
  };
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

/**
 * One way, as M-F-interim's fractions need it (V20).
 *
 * THE HIERARCHY IS DELIBERATELY SHORT, and what is NOT in it matters most: an
 * `arraySpacingMm` on its own cannot make a source list, because a spacing
 * says how far apart two radiators are and says nothing about how many there
 * are. Turning one spacing into two sources is exactly the N = 2 assumption
 * V20 forbids. Where the count IS known — the app's cabinet form — the list is
 * built there (`sourcesFromArray` in the adapter) and arrives here stated.
 */
function lobingWayOf(geometry: Geometry, way: string): LobingWay {
  const stated = geometry.waySources?.[way];
  if (stated && stated.length > 0) {
    const anyAmplitude = stated.some((s) => s.amplitude !== undefined);
    return {
      way,
      sources: stated.map((s, i) => ({
        id: s.id || `${way}#${i + 1}`,
        zMm: s.zMm,
        amplitude: s.amplitude ?? 1,
      })),
      positionSource:
        stated.length === 1
          ? 'one radiator, at the position entered for it'
          : `${stated.length} radiators, at the positions entered for them`,
      amplitudeSource: anyAmplitude
        ? 'Relative drive amplitudes are as entered.'
        : 'No per-source drive was entered, so the sources are taken as equally driven — which ' +
          'is what identical drivers in parallel are, and is an assumption for anything else.',
    };
  }
  const z = geometry.zOffsetMm?.[way];
  if (z !== undefined) {
    return {
      way,
      sources: [{ id: way, zMm: z, amplitude: 1 }],
      positionSource: "one source, at this way's entered acoustic centre",
      amplitudeSource: 'A single source carries the whole of this way.',
    };
  }
  return {
    way,
    sources: [],
    positionSource: 'no vertical position was entered for this way',
    amplitudeSource: '',
  };
}

function nearestIx(grid: readonly number[], f: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < grid.length; i++) {
    const d = Math.abs(Math.log(grid[i] / f));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function orderByMeasuredCentroid(ingest: IngestResult): string[] {
  // On the UNCLIPPED response. Where a driver's energy sits is a property of
  // the driver, not of the gate that was used on it — and ordering on the
  // clipped band makes the ordering depend on which measurement happened to
  // be windowed hardest. Caught on the app's demo set, where a narrower
  // far-field band on two drivers put the tweeter first.
  const rows = ingest.drivers
    .filter((d) => d.onAxisFull)
    .map((d) => ({
      driver: d.driver,
      f: centroid(d.onAxisFull!.grid, d.onAxisFull!.db),
    }));
  return rows.sort((a, b) => a.f - b.f).map((r) => r.driver);
}

function centroid(grid: readonly number[], db: readonly number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < grid.length; i++) {
    const w = 10 ** (db[i] / 10);
    num += w * Math.log(grid[i]);
    den += w;
  }
  return den > 0 ? Math.exp(num / den) : Infinity;
}

/** The band every driver's on-axis measurement covers. */
function commonBand(ingest: IngestResult): [number, number] | null {
  let lo = -Infinity;
  let hi = Infinity;
  let any = false;
  for (const d of ingest.drivers) {
    if (!d.onAxis) continue;
    any = true;
    lo = Math.max(lo, d.onAxis.bandHz[0]);
    hi = Math.min(hi, d.onAxis.bandHz[1]);
  }
  return any && hi > lo ? [lo, hi] : null;
}

function sumBranches(
  branches: Map<string, Complex[]>,
  grid: number[] | null,
): Complex[] | null {
  if (!grid || branches.size === 0) return null;
  const out: Complex[] = grid.map(() => ({ re: 0, im: 0 }));
  for (const b of branches.values()) {
    for (let i = 0; i < grid.length; i++) {
      out[i].re += b[i].re;
      out[i].im += b[i].im;
    }
  }
  return out;
}

function summarise(
  ingest: IngestResult,
  order: readonly string[],
  crossings: readonly Crossing[],
  branchComplex: Map<string, Complex[]>,
  branchDb: readonly { driver: string; grid: number[]; db: number[] }[],
  sum: Complex[] | null,
  grid: number[] | null,
  transfers: Record<string, Complex[]> | null,
  targetCurve: TargetCurve,
): SystemSummary {
  const band = commonBand(ingest);
  let splWindowDb: number | null = null;
  if (sum && grid && band) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < band[0] || grid[i] > band[1]) continue;
      const v = dbAmp(cabs(sum[i]));
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (Number.isFinite(min) && Number.isFinite(max)) splWindowDb = (max - min) / 2;
  }

  /* A5e.1 — the window, the RMS and the narrow peaks, on the same sum. */
  let response: ResponseJudgement | null = null;
  if (sum && grid && band) {
    try {
      response = judgeResponse(grid, sum.map((z) => dbAmp(cabs(z))), targetCurve, band);
    } catch {
      // An unimplemented target curve refuses rather than approximating
      // (A5e.2). The panel says so through `problems`; the summary simply has
      // no judgement to show.
      response = null;
    }
  }

  /* M-K — see `metrics/phaseIntegration.ts` and `lib/phaseAdmission.ts`.
   *
   * WHICH POINTS may carry a phase judgement is one rule with two readers since
   * V44 (the V32 shape), so this block hands over branches and reads a result;
   * it decides nothing itself. What it DOES decide is what "valid" means for a
   * branch here: the measurement-validity band when the ingest pass could
   * derive one, and otherwise the extent where there is measurement at all.
   * Falling back on the extent rather than on nothing matters — a project whose
   * files carry no header window would otherwise arm none of the grounds that
   * clip the low end, which is exactly the state V40 found the tuner in.
   *
   * The silent-ghost ground is not armed here and does not need to be: this
   * report interpolates `onAxisFull` and holds no ghost convention, and every
   * point outside a branch's extent is already refused by the validity ground
   * above. In the CHAIN that is not so, and there the ground earns its keep. */
  const phaseTracking: PhaseTracking[] = [];
  if (grid) {
    /* ÉÉN band voor beide takken, en dat is een besluit: de tuner kan geen
     * band PER WEG meegeven (hij kent daar geen wegnamen bij zijn paren), en
     * twee lezers die elk hun eigen band afleiden zijn twee implementaties —
     * precies de toestand die V32 aantrof. Dus dezelfde doorsnede als
     * `commonBand`, met de gemeten uitgestrektheid als terugval wanneer een weg
     * geen geldigheidsoordeel draagt. */
    const systemValidHz: readonly [number, number] | null = (() => {
      let lo = -Infinity;
      let hi = Infinity;
      let any = false;
      for (const d of ingest.drivers) {
        const b = d.onAxis?.bandHz ?? d.onAxisFull?.extentHz;
        if (!b) continue;
        any = true;
        lo = Math.max(lo, b[0]);
        hi = Math.min(hi, b[1]);
      }
      return any && hi > lo ? [lo, hi] : null;
    })();
    const branchOf = (driver: string, z: Complex[]) => ({
      driver,
      db: z.map((p) => dbAmp(cabs(p))),
      phaseDeg: z.map((p) => cargDeg(p)),
      validHz: systemValidHz,
    });
    for (const c of crossings) {
      if (!Number.isFinite(c.fHz)) continue;
      const a = branchComplex.get(c.lower);
      const b = branchComplex.get(c.upper);
      if (!a || !b) continue;
      const r = phaseIntegration({
        freq: grid,
        lower: branchOf(c.lower, a),
        upper: branchOf(c.upper, b),
        crossingHz: c.fHz,
        overlapWindowDb: DEFAULT_OVERLAP_WINDOW_DB,
        silentFloorDb: null,
      });
      if (r.meanAbsDeg !== null && r.bandHz !== null) {
        phaseTracking.push({
          lower: r.lower,
          upper: r.upper,
          crossingHz: r.crossingHz,
          meanAbsDeg: r.meanAbsDeg,
          bandHz: r.bandHz,
          n: r.n,
          rejected: r.rejected,
          grounds: r.grounds,
          coverage: r.coverage,
          control: r.control,
        });
      }
    }
  }

  const midbandOctaves: { driver: string; octaves: number }[] = [];
  for (let i = 1; i + 1 <= order.length - 1; i++) {
    const below = crossings.find((c) => c.upper === order[i]);
    const above = crossings.find((c) => c.lower === order[i]);
    if (below && above && Number.isFinite(below.fHz) && Number.isFinite(above.fHz)) {
      midbandOctaves.push({ driver: order[i], octaves: octavesBetween(below.fHz, above.fHz) });
    }
  }

  let threeSource: [number, number] | null = null;
  if (grid && sum && branchDb.length > 2) {
    let lo: number | null = null;
    let hi: number | null = null;
    for (let i = 0; i < grid.length; i++) {
      const s = dbAmp(cabs(sum[i]));
      const near = branchDb.filter((b) => b.db[i] > s - CONTRIBUTING_WITHIN_DB).length;
      if (near > 2) {
        if (lo === null) lo = grid[i];
        hi = grid[i];
      }
    }
    threeSource = lo !== null && hi !== null ? [lo, hi] : null;
  }

  const phaseCoupling: SystemSummary['phaseCoupling'] = [];
  if (grid && transfers) {
    for (const c of crossings) {
      if (!Number.isFinite(c.fHz)) continue;
      for (const driver of [c.lower, c.upper]) {
        const h = transfers[driver];
        if (!h) continue;
        // Slope of the branch's own electrical phase, over a symmetric octave
        // window centred on the crossing.
        const lo = c.fHz / Math.SQRT2;
        const hi = c.fHz * Math.SQRT2;
        const iLo = nearestIx(grid, lo);
        const iHi = nearestIx(grid, hi);
        if (iHi <= iLo) continue;
        const unwrapped = unwrapPhaseDeg(
          h.slice(iLo, iHi + 1).map(cargDeg),
        );
        const span = octavesBetween(grid[iLo], grid[iHi]);
        phaseCoupling.push({
          driver,
          atCrossingHz: c.fHz,
          degPerOctave: (unwrapped[unwrapped.length - 1] - unwrapped[0]) / span,
        });
      }
    }
  }

  return {
    splWindowDb,
    sumDb: sum && grid ? sum.map((z) => dbAmp(cabs(z))) : null,
    response,
    splBandHz: band,
    phaseTracking,
    midbandOctaves,
    threeSourceZoneHz: threeSource,
    phaseCoupling,
  };
}

export { fromPolar, coverageOf };
