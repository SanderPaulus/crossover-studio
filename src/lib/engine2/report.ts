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
import { logspace, resampleImpedance, toComplex, wrapDeg } from '../dsp.ts';
import type { Netlist } from '../network.ts';
import { unwrapPhaseDeg } from '../timing.ts';
import { ANALYSIS_GRID_POINTS, DEG_PER_HALF_TURN, MM_PER_M } from './constants.ts';
import { buildCapabilityMatrix, isActive, type CapabilityMatrix } from './capability.ts';
import { runIngest, type IngestResult, type MeasurementFile } from './ingest/derive.ts';
import { passbandLevel } from './ingest/spl.ts';
import type { Manifest } from './ingest/manifest.ts';
import { coverageOf, type Coverage } from './ingest/validity.ts';
import {
  breakupDistance,
  directivityMatch,
  lfBump,
  lobingInterim,
  verticalLobing,
  type BreakupDistanceResult,
  type DirectivityMatchResult,
  type LfBumpResult,
  type LobingInterimResult,
  type VerticalLobingResult,
  type VerticalSource,
} from './metrics/acoustic.ts';
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
import { ctcKey } from './metrics/types.ts';
import { anchoredGaps, type AnchoredGaps, type WayLevel } from './predesign/gaps.ts';
import {
  gateVerdicts,
  isHighPassProtected,
  violationText,
  type GateSettings,
  type GateVerdict,
} from './optimizer/gates.ts';
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

/** One pair's phase tracking around its own crossing. */
export interface PhaseTracking {
  lower: string;
  upper: string;
  crossingHz: number;
  /** Mean |phase difference| over the evaluated band, degrees. */
  meanAbsDeg: number;
  /** The band actually evaluated: +-1 octave around the crossing, CLIPPED to
   *  the band every contributing measurement is valid on. */
  bandHz: [number, number];
  /** The +-1 octave window before clipping — what the metric wanted. */
  intendedHz: [number, number];
  coverage: Coverage;
}

export interface SystemSummary {
  /** Half the peak-to-peak of the summed response over the valid band, dB. */
  splWindowDb: number | null;
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
    lobingInterim: LobingInterimResult[];
    lobingFinal: VerticalLobingResult | null;
    directivity: DirectivityMatchResult[];
    breakup: BreakupDistanceResult[];
    groupDelay: GroupDelayResult | null;
  };
  predesign: {
    gaps: AnchoredGaps | null;
    windows: XoWindowResult[];
    /**
     * A5d.6 — the bounds the ACTIVE budgets invert to, on this measurement
     * set. Empty when no budget is stated (P4). Reporting only here: the
     * search box is built from the same inversion inside the v2 path.
     */
    bounds: InvertedBound[];
    boundNotes: string[];
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
  /** Everything the report could not do, addressed to the designer. */
  problems: string[];
}

/** How far either side of a crossing the phase tracking is judged, in octaves. */
const PHASE_TRACKING_OCTAVES = 1;
/** How close a way has to be to the sum to count as "contributing" (indicator a). */
const CONTRIBUTING_WITHIN_DB = 10;

export function buildReport(input: EngineV2ReportInput): EngineV2Report {
  const ingest = runIngest(input.manifest, input.files, input.ingestOptions);
  const problems = [...ingest.problems];

  /* ---------------- the analysis grid and the solved network ------------- */
  let analysis: NetworkAnalysis | null = null;
  let grid: number[] | null = null;
  if (input.filter) {
    const models = Object.keys(input.filter.driverZ);
    if (models.length === 0) {
      problems.push('The loaded filter carries no driver impedances - nothing to solve.');
    } else {
      let lo = Infinity;
      let hi = -Infinity;
      for (const m of models) {
        const z = input.filter.driverZ[m];
        lo = Math.min(lo, z.freq[0]);
        hi = Math.max(hi, z.freq[z.freq.length - 1]);
      }
      grid = logspace(lo, hi, ANALYSIS_GRID_POINTS);
      const gridded: Record<string, Complex[]> = {};
      for (const m of models) {
        const z = input.filter.driverZ[m];
        const r = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid);
        gridded[m] = r.z;
        if (r.clamped) {
          problems.push(
            `${m}: its impedance sweep is narrower than the analysis grid, so the edges are held ` +
              'flat. Every electrical number outside its own sweep is an extrapolation.',
          );
        }
      }
      try {
        analysis = buildAnalysis(input.filter.netlist, grid, gridded);
      } catch (e) {
        problems.push(`The filter could not be solved: ${(e as Error).message}`);
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
    lfBump: [],
    thevenin: [],
    lobingInterim: [],
    lobingFinal: null,
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
        const r = lfBump(d.nearField.grid, d.nearField.db, grid, h, fs, {
          validHz: d.nearField.bandHz,
          belowHz: above?.fHz,
        });
        if (r) metrics.lfBump.push({ driver, result: r });
      }
    }

    if (fs !== null && isActive(capability, 'M-E', driver)) {
      const supplied = input.settings.reOhmByDriver?.[driver];
      const re =
        supplied !== undefined
          ? { ohm: supplied, source: 'measured DC resistance entered for this driver' }
          : d.re
            ? {
                ohm: d.re.ohm,
                source:
                  'derived from Re(Z) at the bottom of the impedance sweep' +
                  (d.re.motionalProximityWarning ? ' - and it carries the V8d overestimate warning' : ''),
              }
            : null;
      const r = thevenin(analysis, driver, fs, re);
      if (r) metrics.thevenin.push(r);
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
    if (spacing !== undefined && fx !== null && isActive(capability, 'M-F-interim', key)) {
      const arrays = [lower, upper]
        .map((d) => ({ driver: d, mm: input.geometry.arraySpacingMm?.[d] ?? 0 }))
        .filter((a) => a.mm > 0);
      metrics.lobingInterim.push(lobingInterim(lower, upper, spacing, fx, arrays));
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
  if (analysis && grid && isActive(capability, 'M-F-final', 'system')) {
    const sources: VerticalSource[] = [];
    for (const driver of order) {
      const d = ingest.drivers.find((x) => x.driver === driver);
      const h = analysis.transferByModel[driver];
      const z = input.geometry.zOffsetMm?.[driver];
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
    if (band) {
      metrics.lobingFinal = verticalLobing(
        grid,
        sources,
        input.settings.verticalWindowDeg ?? [],
        xoRegion,
        band,
      );
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
    windows.push(
      crossoverWindow({
        lower,
        upper,
        order: input.settings.orderByPair?.[key] ?? NaN,
        validityFloorHz: worst?.hz ?? null,
        validityFloorSource: worst?.src ?? 'unknown',
        upperFsHz: dUpper?.impedance?.fundamentalHz ?? null,
        lowerBreakups: dLower?.breakups?.peaks.map((p) => ({ fHz: p.fHz, dB: p.dB })) ?? [],
        significantBreakupDb: input.settings.significantBreakupDb,
        lowerMinus6Hz: dir?.minus6Hz ?? null,
        lowerMinus6AngleDeg: dir?.angleDeg ?? null,
        spacingMm: input.geometry.ctcMm?.[key] ?? null,
      }),
    );
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
    if (lvl) levels.push({ driver: d.driver, db: lvl.db, bandHz: lvl.bandHz });
  }
  const gaps = anchoredGaps(levels);

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
    });
  }
  const verdicts = gateVerdicts(input.settings, {
    dissipationFraction: metrics.dissipation?.totalFraction ?? null,
    ...(metrics.dissipation ? { dissipationBandHz: metrics.dissipation.bandHz } : {}),
    epdrMinOhm: metrics.epdr?.minOhm ?? null,
    ...(metrics.epdr ? { epdrAtHz: metrics.epdr.atHz, minZAtHz: metrics.epdr.minZAtHz } : {}),
    minZOhm: metrics.epdr?.minZOhm ?? null,
    driveVoltage: drive,
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
      reOhm: input.settings.reOhmByDriver?.[driver] ?? d.re?.ohm ?? null,
      reSource:
        input.settings.reOhmByDriver?.[driver] !== undefined
          ? 'measured DC resistance entered for this driver'
          : 'derived from Re(Z) at the bottom of the impedance sweep',
      zPassbandMedianOhm: raw ? passbandImpedanceMedian(raw.freq, raw.magnitude, pass) : null,
      passbandHz: pass,
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
    ? invertBudgets(budgetWays, input.settings, input.settings)
    : { bounds: [], notes: [] };

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
  );

  return {
    engine: { label: ENGINE_V2_LABEL, version: ENGINE_V2_VERSION, mark: engineV2Mark() },
    ingest,
    capability,
    crossings,
    driversLowToHigh: order,
    analysisGrid: grid,
    metrics,
    predesign: { gaps, windows, bounds: inverted.bounds, boundNotes: inverted.notes },
    gates: {
      verdicts,
      violation: violationText(verdicts),
      anyActive: verdicts.some((v) => v.active),
      highPassProtected,
    },
    system,
    problems,
  };
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

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
): SystemSummary {
  const band = commonBand(ingest);
  const validBand = band;
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

  const phaseTracking: PhaseTracking[] = [];
  if (grid) {
    for (const c of crossings) {
      if (!Number.isFinite(c.fHz)) continue;
      const a = branchComplex.get(c.lower);
      const b = branchComplex.get(c.upper);
      if (!a || !b) continue;
      // The intended window is +-1 octave around the crossing. It is then
      // CLIPPED to the band both branches are actually valid on (A5.5).
      //
      // This is not a detail on a low crossing. Casus 1's woofer-mid handover
      // sits at 360 Hz with a 397 Hz gate floor, so the lower half of the
      // intended window is below anything the measurements support - and an
      // unclipped mean averages in phase that was reconstructed from
      // flat-held data. The 25-08 reference analysis reported that unclipped
      // figure; the coverage field below is what makes the difference visible
      // instead of arguable.
      const lo = c.fHz / 2 ** PHASE_TRACKING_OCTAVES;
      const hi = c.fHz * 2 ** PHASE_TRACKING_OCTAVES;
      const validLo = validBand ? Math.max(lo, validBand[0]) : lo;
      const validHi = validBand ? Math.min(hi, validBand[1]) : hi;
      let sumAbs = 0;
      let n = 0;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] < validLo || grid[i] > validHi) continue;
        const pa = cargDeg(a[i]);
        const pb = cargDeg(b[i]);
        sumAbs += Math.abs(wrapDeg(pa - pb));
        n++;
      }
      if (n > 0) {
        phaseTracking.push({
          lower: c.lower,
          upper: c.upper,
          crossingHz: c.fHz,
          meanAbsDeg: sumAbs / n,
          bandHz: [validLo, validHi],
          intendedHz: [lo, hi],
          coverage: coverageOf([lo, hi], {
            fromHz: validLo,
            toHz: validHi,
            fromBy: 'measurement validity',
            toBy: 'measurement validity',
          }),
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
    splBandHz: band,
    phaseTracking,
    midbandOctaves,
    threeSourceZoneHz: threeSource,
    phaseCoupling,
  };
}

export { fromPolar, coverageOf };
