/**
 * A4 — THE METRIC REGISTER, as types.
 *
 * The spec's register format is "grootheid -> formule -> afgeleide parameters
 * -> databehoefte -> rol -> status", and "een metriek komt pas in de engine
 * als alle velden compleet zijn". `MetricDeclaration` is that format made
 * executable: a metric that does not declare its data need cannot be added,
 * and the capability matrix is generated FROM the declarations rather than
 * maintained beside them.
 *
 * Two rules that the types enforce rather than describe:
 *
 *  - EVERY RESULT CARRIES ITS COVERAGE. `MetricValue.coverage` is not optional
 *    for a metric that evaluates over a band. A5.5 is explicit that a metric
 *    whose intended band falls largely outside valid data must be neither
 *    silently evaluated nor silently skipped, so "no coverage" has to be a
 *    value the report can render, not a missing field.
 *  - AN UNCALIBRATED METRIC SAYS SO IN ITS OWN OUTPUT. `uncalibrated` is a
 *    string, not a boolean, because the useful thing is WHY (M-H's severity
 *    weighting waits on HD data) and a boolean would be dropped from the UI
 *    the first time someone tidied it.
 *
 * F1 SCOPE: `role` records the role A4 gives the metric in the finished
 * engine. Nothing here acts on it — in F1 every metric is reporting-only, and
 * the roles are what F2/F3 will wire up.
 */

import type { Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import type { Coverage } from '../ingest/validity.ts';
import type { DerivedDriver, IngestResult } from '../ingest/derive.ts';
import type { EstimatorStamp } from '../version.ts';

export type MetricId =
  | 'M-A'
  | 'M-B'
  | 'M-C'
  | 'M-D'
  | 'M-E'
  | 'M-F-interim'
  | 'M-F-final'
  | 'M-G'
  | 'M-H'
  | 'M-J';

/** The role A4 assigns each metric in the FINISHED engine (F2/F3), not in F1. */
export type MetricRole = 'gate' | 'soft' | 'report';

/** What one evaluation of a metric is ABOUT. */
export type MetricScope = 'system' | 'driver' | 'pair';

/**
 * Geometry the metrics need. Everything optional, everything absent-means-off
 * (P4). Keys are driver ids from the manifest, so nothing here counts ways.
 */
export interface Geometry {
  /**
   * Centre-to-centre spacing in mm, keyed by the two driver ids joined with a
   * `|` in the order low-to-high (`ctcKey`). A map rather than a list because
   * an N-way system has N−1 adjacent pairs and nobody should be indexing them.
   */
  ctcMm?: Record<string, number>;
  /**
   * Where each spacing CAME FROM, same keys as `ctcMm`.
   *
   * Added at F3c after a spacing mix-up cost an afternoon: the app derives
   * these distances from the cabinet layout while the casebook fixture carries
   * its own measured pair, and the two disagree by enough to move the worst
   * lobing zone clean past a crossover ceiling. The number alone cannot say
   * which of the two a reader is looking at; the number with its source can.
   * Same discipline the crossover window applies to every limit it reports.
   */
  ctcSource?: Record<string, string>;
  /** Acoustic-centre position along the VERTICAL axis, mm, per driver. */
  zOffsetMm?: Record<string, number>;
  /**
   * Internal centre-to-centre spacing of an ARRAY inside one way, mm, per
   * driver id. A dual-woofer way measured as a single source still radiates
   * from two places, and the LARGEST source separation involved in a handover
   * is what sets its first vertical null — so M-F-interim takes the larger of
   * this and the pair spacing, and says which one governed.
   */
  arraySpacingMm?: Record<string, number>;
  /** Per driver: is its radiation rotationally symmetric about its axis? */
  rotationallySymmetric?: Record<string, boolean>;
  /** Baffle width in mm — lets the report check the fitted step against c/2W. */
  baffleWidthMm?: number;
}

export const ctcKey = (lower: string, upper: string): string => `${lower}|${upper}`;

/**
 * Project settings the metrics read. EVERY FIELD IS OPTIONAL AND HAS NO
 * DEFAULT (P4): a metric whose input is missing reports itself off, with the
 * missing input named. There is deliberately no `?? someNumber` anywhere
 * downstream of this interface.
 */
export interface ProjectSettings {
  /**
   * The amplifier power M-A converts its fraction into watts with. Absent =
   * the fraction is still reported (it is scale-free) and the watts are not.
   */
  amplifierPowerW?: number;
  /**
   * Programme-noise weighting S(f) for M-A. Absent = the IEC 60268-1 shape
   * from `constants.ts`, which is what A4 names; supplying one replaces it.
   */
  programmeWeight?: (fHz: number) => number;
  /**
   * Observation angles (degrees off the reference axis, positive = up) that
   * M-F-final synthesises over. Absent = the metric reports only the on-axis
   * reference and says the window was not set.
   */
  verticalWindowDeg?: number[];
  /**
   * Audibility threshold curve for M-J as (Hz, ms) knots. Absent = the
   * literature default in `constants.ts`.
   */
  groupDelayThresholdMsKnots?: readonly (readonly [number, number])[];
}

/**
 * A solved network, with the internals the metric library needs, plus the
 * means to re-solve it — M-E's two-load method needs a second solve with a
 * doubled driver load and must not build its own model to do it.
 */
export interface NetworkAnalysis {
  grid: number[];
  netlist: Netlist;
  /** Driver impedances on `grid`, keyed by model. */
  driverZ: Record<string, readonly Complex[]>;
  /** Generator EMF the whole solution is normalised to. */
  generatorVolts: number;
  inputZ: Complex[];
  /** H(f) = V_driver/Eg per driver MODEL (not per element id). */
  transferByModel: Record<string, Complex[]>;
  /** Complex current through each element, at the generator's own Eg. */
  elementCurrent: Record<string, Complex[]>;
  /** Every passive element, so M-A can walk the resistors without the netlist. */
  passives: { id: string; kind: 'R' | 'L' | 'C'; value: number; seriesR: number }[];
  /** Element id -> driver model, for the drivers. */
  driverModelById: Record<string, string>;
  /** Re-solve with one driver model's impedance replaced (M-E). */
  resolveWithLoad: (model: string, z: readonly Complex[]) => { transfer: Complex[] };
}

/** An acoustic handover between two adjacent drivers, DERIVED from the sum. */
export interface Crossing {
  lower: string;
  upper: string;
  fHz: number;
  /** The band the two branches overlap within, for reporting. */
  overlapHz: [number, number] | null;
}

export interface MetricContext {
  ingest: IngestResult;
  /** Null when no filter is loaded — every network metric then reports off. */
  analysis: NetworkAnalysis | null;
  geometry: Geometry;
  settings: ProjectSettings;
  /** Acoustic crossings derived from the loaded filter; empty without one. */
  crossings: Crossing[];
  /** Driver ids ordered low to high, DERIVED from their passbands. */
  driversLowToHigh: string[];
}

/** One declared data need, and the test that decides whether it is met. */
export interface DataNeed {
  key: string;
  /** Phrased as what is MISSING, because that is what the UI has to say. */
  describe: string;
  /**
   * `subject` is the driver id for a driver-scoped metric, the `ctcKey` for a
   * pair-scoped one, and `null` for a system metric.
   */
  met: (ctx: MetricContext, subject: string | null) => boolean;
}

export interface MetricDeclaration {
  id: MetricId;
  title: string;
  /** The quantity, in words — the register's first column. */
  quantity: string;
  /** The formula, as written in A4. */
  formula: string;
  role: MetricRole;
  scope: MetricScope;
  needs: DataNeed[];
  /** Where in the spec this metric is defined. */
  specRef: string;
  /** Set when the metric ships with an explicitly uncalibrated component. */
  uncalibrated?: string;
}

/** One computed metric value. */
export interface MetricValue {
  metric: MetricId;
  title: string;
  /** Driver id, pair key, or 'system'. */
  subject: string;
  /** Null when the metric ran but could not produce a number. */
  value: number | null;
  unit: string;
  /** Secondary numbers the report shows beside the headline. */
  extras?: Record<string, number | string | null>;
  /**
   * Band coverage. Null ONLY for a metric that does not evaluate over a band
   * (there are none in A4 today, but M-F-interim comes close: it evaluates at
   * a single derived frequency).
   */
  coverage: Coverage | null;
  notes: string[];
  estimators: EstimatorStamp[];
  uncalibrated?: string;
}

/** Helper for a metric that has to report that it produced nothing. */
export function metricUnavailable(
  decl: MetricDeclaration,
  subject: string,
  reason: string,
): MetricValue {
  return {
    metric: decl.id,
    title: decl.title,
    subject,
    value: null,
    unit: '',
    coverage: null,
    notes: [reason],
    estimators: [],
    uncalibrated: decl.uncalibrated,
  };
}

/** The derived record for one driver, or undefined when it is not in the set. */
export function driverOf(ctx: MetricContext, driver: string): DerivedDriver | undefined {
  return ctx.ingest.drivers.find((d) => d.driver === driver);
}

export type { IngestResult, DerivedDriver, Coverage };
