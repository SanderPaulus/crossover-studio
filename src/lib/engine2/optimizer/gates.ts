/**
 * DELIVERABLE 2 — THE GATES: M-A, M-B and M-C as hard requirements.
 *
 * A2/P2 is the shape of this file: "Harde eisen zijn haalbaarheidspoorten
 * vóór de zachte kostenfunctie, geen straftermen ernaast. Een kwadratische
 * straf naast fasetermen kan stilletjes overschreden worden zodra een andere
 * winst groter is." So there is no cost function anywhere in this module and
 * there is no number it contributes to one. A gate answers one question —
 * may this network exist — and answers it the same way for every caller.
 *
 * FOUR PROPERTIES, EACH OF WHICH IS A DECISION RATHER THAN A DETAIL.
 *
 * 1. EVERY LIMIT IS ABSENT BY DEFAULT (P4). There is no `?? someNumber` in
 *    this file. An absent limit is not "a gate that always passes": it is a
 *    gate that is OFF, reports its measured value anyway, and says "no limit
 *    set" beside it. The difference matters to a reader deciding whether the
 *    design was judged.
 *
 * 2. ONE COMPARISON RULE, USED BY ALL FOUR LIMITS. `judge()` below is the
 *    only place a value meets a limit. The EPDR floor and the plain |Z| floor
 *    are deliberately two limits through the same rule rather than two rules:
 *    A4 keeps the bare minimum available as the simple mode, and the app has
 *    already paid once for the same question being asked in three places with
 *    three thresholds (see `impedanceFloor.ts`). The |Z| floor is not even
 *    re-derived here — it calls `meetsAmpFloor`, which is the one place that
 *    number is allowed to live.
 *
 * 3. THE VALUES COME FROM THE F1 METRIC LIBRARY, NEVER FROM A COPY. Every
 *    number below is produced by `metrics/electrical.ts`. A gate that
 *    re-implemented its own dissipation integral would be a second opinion,
 *    and two opinions about one quantity is how a design comes to be repaired
 *    and rejected in the same run.
 *
 * 4. THE DERIVED PARAMETERS ARE FROZEN FOR THE DURATION OF A RUN, and this is
 *    the property that makes M-C a gate at all. M-C compares the drive on f_s
 *    against the PASSBAND, and the passband is derived from where the
 *    filtered branches cross. Re-derive it at every polish step and the
 *    optimiser can satisfy the gate by moving the crossing — the reference
 *    slides along with the design and the limit stops being a limit. So the
 *    passbands are taken once, from the design the run starts at, and the
 *    delivered candidate is checked BOTH on those frozen bands and on the
 *    bands its own crossings imply. Passing one and failing the other is a
 *    finding, not a rounding difference, and it is reported as one.
 */

import { AMP_FLOOR_TOLERANCE, meetsAmpFloor } from '../../impedanceFloor.ts';
import type { Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { HP_PROTECTION_MIN_RISE_DB, HP_PROTECTION_PROBE_OCTAVES, PERCENT } from '../constants.ts';
import { cabs, dbAmp } from '../util.ts';
import { buildAnalysis, deriveCrossings, orderDriversLowToHigh, passbandOf } from '../metrics/analysis.ts';
import {
  dissipation,
  driveVoltageOnResonance,
  epdr,
  type DissipationResult,
  type EpdrResult,
} from '../metrics/electrical.ts';
import type { Crossing, NetworkAnalysis } from '../metrics/types.ts';

/* ================================================================== *
 * Settings
 * ================================================================== */

/**
 * The three project fields of Deliverable 2, plus the |Z| floor the app
 * already had. EVERY ONE OPTIONAL, EVERY ONE WITHOUT A DEFAULT.
 */
export interface GateSettings {
  /**
   * M-A — the largest share of the amplifier's delivered power that may be
   * burnt in the filter's discrete resistors, IEC-weighted. A FRACTION (0..1),
   * because that is the scale-free form A4 reports.
   */
  maxDissipationFraction?: number;
  /** M-B — the EPDR floor in ohms. */
  minEpdrOhm?: number;
  /**
   * M-B, simple mode — the plain |Z| floor, i.e. the amplifier's rated
   * minimum load. Independent of the EPDR floor: a project may state either,
   * both or neither, and both are judged by the one rule below. Deliberately
   * the same field name the app already uses, and judged by the same
   * `meetsAmpFloor` it already uses.
   */
  ampMinLoadOhm?: number;
  /**
   * M-C — the largest drive voltage on a driver's own resonance that is
   * acceptable, in dB relative to that way's passband. A ceiling on a number
   * that is normally negative, so −18 means "at least 18 dB down".
   */
  maxDriveOnFsDb?: number;
}

export const GATE_IDS = ['M-A', 'M-B/EPDR', 'M-B/|Z|', 'M-C'] as const;
export type GateId = (typeof GATE_IDS)[number];

/** One gate's verdict about one subject. */
export interface GateVerdict {
  gate: GateId;
  /** The A4 metric this gate is built on. */
  metric: 'M-A' | 'M-B' | 'M-C';
  title: string;
  /** 'system', or a driver id. */
  subject: string;
  /** The measured value. Null when the metric could not be evaluated. */
  value: number | null;
  unit: string;
  /** The limit, or null when the project set none — the gate is then OFF. */
  limit: number | null;
  /** Which side of the limit is acceptable. */
  direction: 'max' | 'min';
  /** False when no limit was set: the value is reported, nothing is judged. */
  active: boolean;
  /** True when the gate is inactive OR the value is inside the limit. */
  pass: boolean;
  /**
   * TRUE when this gate passes ONLY because of a measurement tolerance — the
   * plain comparison would have failed (F3b, deliverable 4a).
   *
   * The practical case is the |Z| floor: 3.17 Ω against a stated 3.20 Ω reads
   * "inside", because `meetsAmpFloor` allows 2 % for build spread. That is the
   * right verdict and the wrong silence. A reader deciding whether to build
   * this network is entitled to know the difference between a design that
   * clears the amplifier's rating and one that clears it only once you agree
   * to a tolerance — and the tolerance is a convention this project chose, not
   * a fact about the amplifier.
   */
  withinToleranceOnly: boolean;
  /** What the report shows: the sentence, including "no limit set". */
  reason: string;
  specRef: string;
  /** Derived parameters this verdict depended on, for the report. */
  parameters?: Record<string, number | string>;
}

/* ================================================================== *
 * THE one comparison rule
 * ================================================================== */

/**
 * The ONLY place in this engine where a value meets a hard limit.
 *
 * Four gates, one rule. Writing it four times is how the |Z| floor came to be
 * repaired against 0.15 Ω of slack and struck through against a strict
 * comparison in the same run — the bug `impedanceFloor.ts` was consolidated
 * to end. The `accept` hook exists for exactly one caller: the plain |Z|
 * floor, whose comparison belongs to `meetsAmpFloor` and may not be
 * re-derived here.
 */
function judge(args: {
  gate: GateId;
  metric: GateVerdict['metric'];
  title: string;
  subject: string;
  value: number | null;
  unit: string;
  limit: number | undefined;
  direction: 'max' | 'min';
  specRef: string;
  parameters?: Record<string, number | string>;
  /** Overrides the plain comparison. Used only by the |Z| floor. */
  accept?: (value: number, limit: number) => boolean;
  /**
   * What to say when `accept` passes a value the plain comparison rejects.
   * Supplied by the caller that owns the tolerance, because the tolerance
   * belongs to that comparison and not to this rule.
   */
  toleranceText?: string;
  /** Rendering of the number, so a fraction can be shown as a percentage. */
  show?: (value: number) => string;
}): GateVerdict {
  const { value, limit, direction } = args;
  const shown = (v: number): string => (args.show ? args.show(v) : `${v.toFixed(2)} ${args.unit}`);
  const base = {
    gate: args.gate,
    metric: args.metric,
    title: args.title,
    subject: args.subject,
    value,
    unit: args.unit,
    direction,
    specRef: args.specRef,
    ...(args.parameters ? { parameters: args.parameters } : {}),
  };
  if (limit === undefined || !Number.isFinite(limit)) {
    return {
      ...base,
      limit: null,
      active: false,
      pass: true,
      withinToleranceOnly: false,
      reason:
        value === null
          ? 'not evaluated, and no limit set'
          : `${shown(value)} — no limit set`,
    };
  }
  if (value === null) {
    return {
      ...base,
      limit,
      active: true,
      // A gate that cannot be evaluated does not condemn a design; it says so.
      // Refusing on missing data would turn "we could not look" into "it
      // failed", which is a different claim and the wrong one.
      pass: true,
      withinToleranceOnly: false,
      reason: `limit ${shown(limit)}, but the metric could not be evaluated on this network`,
    };
  }
  const strict = direction === 'max' ? value <= limit : value >= limit;
  const ok = args.accept ? args.accept(value, limit) : strict;
  // The gate passes, but the plain comparison would not have. That is a
  // different verdict from an ordinary pass and it is reported as one.
  const byTolerance = ok && !strict;
  return {
    ...base,
    limit,
    active: true,
    pass: ok,
    withinToleranceOnly: byTolerance,
    reason: byTolerance
      ? `${shown(value)} against a ${direction === 'max' ? 'ceiling' : 'floor'} of ` +
        `${shown(limit)} — inside, but only ${args.toleranceText ?? 'within the accepted tolerance'}`
      : ok
        ? `${shown(value)} against a ${direction === 'max' ? 'ceiling' : 'floor'} of ${shown(limit)}`
        : `${shown(value)} ${direction === 'max' ? 'exceeds' : 'falls below'} the stated ` +
          `${direction === 'max' ? 'ceiling' : 'floor'} of ${shown(limit)}`,
  };
}

/* ================================================================== *
 * The verdict assembly — one list, one order, two callers
 * ================================================================== */

/**
 * The metric values a gate set is judged on, as the F1 library produces them.
 *
 * This type is the seam that lets the REPORT and the OPTIMISER share not just
 * the comparison rule but the whole assembly: the report has already computed
 * these numbers for its own panel and must not solve the network a second
 * time, while the optimiser computes them per candidate. Both hand them here,
 * so the two surfaces cannot end up rendering different verdicts from the same
 * design — which is precisely the failure mode A3g documents four times over.
 */
export interface GateMetricValues {
  dissipationFraction: number | null;
  dissipationBandHz?: [number, number];
  epdrMinOhm: number | null;
  epdrAtHz?: number;
  minZOhm: number | null;
  minZAtHz?: number;
  driveVoltage: {
    driver: string;
    db: number | null;
    fsHz: number;
    passbandHz: [number, number];
    /** Which passband convention produced it — 'frozen' or 'derived'. */
    bandSource: string;
  }[];
}

/** Every gate verdict for one design, in the order A4 declares the metrics. */
export function gateVerdicts(
  settings: GateSettings,
  values: GateMetricValues,
): GateVerdict[] {
  const out: GateVerdict[] = [
    judge({
      gate: 'M-A',
      metric: 'M-A',
      title: 'Dissipation in the filter resistors',
      subject: 'system',
      value: values.dissipationFraction,
      unit: 'of amplifier power',
      limit: settings.maxDissipationFraction,
      direction: 'max',
      specRef: 'A4 M-A',
      show: (v) => `${(v * PERCENT).toFixed(1)} %`,
      parameters: {
        band: values.dissipationBandHz
          ? `${values.dissipationBandHz[0].toFixed(0)}-${values.dissipationBandHz[1].toFixed(0)} Hz`
          : 'the analysis grid',
        weighting: 'IEC 60268-1 programme noise',
      },
    }),
    judge({
      gate: 'M-B/EPDR',
      metric: 'M-B',
      title: 'EPDR of the amplifier load',
      subject: 'system',
      value: values.epdrMinOhm,
      unit: 'Ω',
      limit: settings.minEpdrOhm,
      direction: 'min',
      specRef: 'A4 M-B',
      ...(values.epdrAtHz !== undefined
        ? { parameters: { at: `${values.epdrAtHz.toFixed(0)} Hz` } }
        : {}),
    }),
    judge({
      gate: 'M-B/|Z|',
      metric: 'M-B',
      title: 'Minimum |Z| the amplifier sees (simple mode)',
      subject: 'system',
      value: values.minZOhm,
      unit: 'Ω',
      limit: settings.ampMinLoadOhm,
      direction: 'min',
      specRef: 'A4 M-B (simple mode)',
      // The floor's comparison is not this module's to invent. One rule, one
      // place — see `impedanceFloor.ts`. The tolerance SENTENCE comes from the
      // same place for the same reason: the number and the words about it must
      // not be able to drift apart.
      accept: (value, limit) => meetsAmpFloor(value, limit),
      toleranceText:
        `within the ${(AMP_FLOOR_TOLERANCE * PERCENT).toFixed(0)} % measurement tolerance ` +
        '(a shortfall smaller than the tightest component class the app offers disappears into ' +
        'build spread — a project convention, not a property of the amplifier)',
      ...(values.minZAtHz !== undefined
        ? { parameters: { at: `${values.minZAtHz.toFixed(0)} Hz` } }
        : {}),
    }),
  ];
  for (const d of values.driveVoltage) {
    out.push(
      judge({
        gate: 'M-C',
        metric: 'M-C',
        title: 'Drive voltage on the driver resonance',
        subject: d.driver,
        value: d.db,
        unit: 'dB',
        limit: settings.maxDriveOnFsDb,
        direction: 'max',
        specRef: 'A4 M-C',
        show: (v) => `${v.toFixed(1)} dB`,
        parameters: {
          f_s: `${d.fsHz.toFixed(0)} Hz`,
          passband: `${d.passbandHz[0].toFixed(0)}-${d.passbandHz[1].toFixed(0)} Hz (${d.bandSource})`,
        },
      }),
    );
  }
  return out;
}

/** Null when nothing failed; otherwise one sentence naming every failure. */
export function violationText(verdicts: readonly GateVerdict[]): string | null {
  const failures = verdicts.filter((v) => v.active && !v.pass);
  return failures.length === 0
    ? null
    : failures
        .map((f) => `${f.gate}${f.subject === 'system' ? '' : ` (${f.subject})`}: ${f.reason}`)
        .join('; ');
}

/* ================================================================== *
 * High-pass protection — derived, never declared
 * ================================================================== */

/**
 * Whether this branch is HIGH-PASS PROTECTED, i.e. whether M-C's gate applies
 * to it (Deliverable 2: "geldend voor elke weg met een hoogdoorlaatbeschermde
 * driver").
 *
 * Derived from the branch's own electrical transfer: half an octave below the
 * passband floor the transfer must sit measurably LOWER than inside the
 * passband. That is what a high pass is, and it catches the cases a
 * way-counting rule would miss in both directions — a woofer carrying a
 * subsonic capacitor IS protected, and a midrange whose "high pass" turned
 * out to be a wire is NOT, whatever the schematic was meant to be.
 *
 * Never "the driver is not the lowest way": that counts ways, which the
 * N-way rule forbids, and it would answer a question about the schematic by
 * looking at a list.
 */
export function isHighPassProtected(
  analysis: NetworkAnalysis,
  driver: string,
  passbandHz: [number, number],
): boolean {
  const h = analysis.transferByModel[driver];
  if (!h) return false;
  const { grid } = analysis;
  const probe = passbandHz[0] / 2 ** HP_PROTECTION_PROBE_OCTAVES;
  const level = (lo: number, hi: number): number | null => {
    const vals: number[] = [];
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] >= lo && grid[i] <= hi) vals.push(dbAmp(cabs(h[i])));
    }
    if (vals.length === 0) return null;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length / 2)];
  };
  const below = level(probe / 2 ** HP_PROTECTION_PROBE_OCTAVES, probe);
  const inside = level(passbandHz[0], passbandHz[0] * 2 ** HP_PROTECTION_PROBE_OCTAVES);
  if (below === null || inside === null) return false;
  return inside - below >= HP_PROTECTION_MIN_RISE_DB;
}

/* ================================================================== *
 * The evaluator
 * ================================================================== */

/** What a gate evaluation needs that does not change during a run. */
export interface GateReference {
  grid: number[];
  /** Measured driver impedance on `grid`, keyed by netlist model. */
  driverZ: Record<string, readonly Complex[]>;
  /** Measured on-axis magnitude on `grid`, keyed by model — for the crossings. */
  branchDb: Record<string, readonly number[]>;
  /** f_s per driver, from the LOADED impedance file (A4 M-C). Absent = no M-C. */
  fsHz: Record<string, number>;
  /** Each driver's measurement validity band, the fallback for an open passband. */
  validHz: Record<string, [number, number]>;
  /**
   * The passbands the run judges M-C against, FROZEN at the run's start.
   * See the note at the top of this file: a reference that moves with the
   * design is not a reference.
   */
  frozenPassbandHz: Record<string, [number, number]>;
  /** Which drivers M-C applies to, frozen with the passbands. */
  frozenHighPassProtected: string[];
}

export interface GateEvaluation {
  verdicts: GateVerdict[];
  /** Every verdict that FAILED, in the order the gates are declared. */
  failures: GateVerdict[];
  /** Null when nothing failed; otherwise one sentence naming every failure. */
  violation: string | null;
  /** The metric results, so a report does not have to solve the network twice. */
  metrics: {
    dissipation: DissipationResult | null;
    epdr: EpdrResult | null;
    driveVoltage: { driver: string; db: number; passbandHz: [number, number] }[];
  };
  /** The crossings this evaluation derived, when it derived any. */
  crossings: Crossing[];
}

/**
 * Build the frozen half of the reference from the design a run starts at.
 *
 * Split out from `evaluateGates` so that the freezing is a visible, separate
 * act performed once, rather than a cache that silently decides how often the
 * reference moves.
 */
export function freezeGateReference(args: {
  netlist: Netlist;
  grid: number[];
  driverZ: Record<string, readonly Complex[]>;
  branchDb: Record<string, readonly number[]>;
  fsHz: Record<string, number>;
  validHz: Record<string, [number, number]>;
}): GateReference {
  const analysis = buildAnalysis(args.netlist, args.grid, args.driverZ);
  const { order, crossings } = crossingsOf(analysis, args.grid, args.branchDb);
  const frozenPassbandHz: Record<string, [number, number]> = {};
  const protectedDrivers: string[] = [];
  for (const driver of order) {
    const fallback = args.validHz[driver] ?? [args.grid[0], args.grid[args.grid.length - 1]];
    const pass = passbandOf(driver, crossings, fallback);
    frozenPassbandHz[driver] = pass;
    if (isHighPassProtected(analysis, driver, pass)) protectedDrivers.push(driver);
  }
  return {
    grid: args.grid,
    driverZ: args.driverZ,
    branchDb: args.branchDb,
    fsHz: args.fsHz,
    validHz: args.validHz,
    frozenPassbandHz,
    frozenHighPassProtected: protectedDrivers,
  };
}

/** Order and crossings of the FILTERED branches — the same derivation A4 uses. */
function crossingsOf(
  analysis: NetworkAnalysis,
  grid: readonly number[],
  branchDb: Record<string, readonly number[]>,
): { order: string[]; crossings: Crossing[] } {
  const branches: { driver: string; grid: readonly number[]; db: number[] }[] = [];
  for (const driver of Object.keys(branchDb).sort()) {
    const h = analysis.transferByModel[driver];
    if (!h) continue;
    const measured = branchDb[driver];
    branches.push({
      driver,
      grid,
      db: grid.map((_, i) => measured[i] + dbAmp(cabs(h[i]))),
    });
  }
  if (branches.length === 0) return { order: [], crossings: [] };
  const order = orderDriversLowToHigh(branches);
  return { order, crossings: deriveCrossings(order, branches) };
}

/**
 * Evaluate every gate on one network.
 *
 * `passbands: 'frozen'` is what the search asks — the gate may not move under
 * the optimiser's feet. `'derived'` is what the delivered candidate is asked
 * as well, on the crossings it actually produces. A candidate is delivered
 * only when both agree it passes.
 */
export function evaluateGates(
  netlist: Netlist,
  settings: GateSettings,
  ref: GateReference,
  passbands: 'frozen' | 'derived' = 'frozen',
): GateEvaluation {
  const verdicts: GateVerdict[] = [];
  const metrics: GateEvaluation['metrics'] = {
    dissipation: null,
    epdr: null,
    driveVoltage: [],
  };
  let crossings: Crossing[] = [];

  let analysis: NetworkAnalysis;
  try {
    analysis = buildAnalysis(netlist, ref.grid, ref.driverZ);
  } catch {
    // An unsolvable network is not a gate failure — it is not a network. The
    // caller's own machinery already refuses it; a gate that also condemned it
    // would attribute the refusal to the designer's limit.
    return {
      verdicts,
      failures: [],
      violation: null,
      metrics,
      crossings,
    };
  }

  /* ---- the metric values, from the F1 library and nowhere else -------- */
  const diss = dissipation(analysis);
  metrics.dissipation = diss;
  const e = epdr(analysis);
  metrics.epdr = e;

  let passbandFor: (driver: string) => [number, number];
  let subjects: string[];
  if (passbands === 'frozen') {
    passbandFor = (d) => ref.frozenPassbandHz[d] ?? ref.validHz[d];
    subjects = [...ref.frozenHighPassProtected];
  } else {
    const derived = crossingsOf(analysis, ref.grid, ref.branchDb);
    crossings = derived.crossings;
    const bands: Record<string, [number, number]> = {};
    subjects = [];
    for (const driver of derived.order) {
      const fallback = ref.validHz[driver] ?? [ref.grid[0], ref.grid[ref.grid.length - 1]];
      bands[driver] = passbandOf(driver, derived.crossings, fallback);
      if (isHighPassProtected(analysis, driver, bands[driver])) subjects.push(driver);
    }
    passbandFor = (d) => bands[d] ?? ref.validHz[d];
  }

  const drive: GateMetricValues['driveVoltage'] = [];
  for (const driver of subjects) {
    const fs = ref.fsHz[driver];
    const band = passbandFor(driver);
    if (fs === undefined || !band) continue;
    const r = driveVoltageOnResonance(analysis, driver, fs, band);
    if (r) metrics.driveVoltage.push({ driver, db: r.db, passbandHz: r.passbandHz });
    drive.push({ driver, db: r ? r.db : null, fsHz: fs, passbandHz: band, bandSource: passbands });
  }

  verdicts.push(
    ...gateVerdicts(settings, {
      dissipationFraction: diss.totalFraction,
      dissipationBandHz: diss.bandHz,
      epdrMinOhm: e.minOhm,
      epdrAtHz: e.atHz,
      minZOhm: e.minZOhm,
      minZAtHz: e.minZAtHz,
      driveVoltage: drive,
    }),
  );

  return {
    verdicts,
    failures: verdicts.filter((v) => v.active && !v.pass),
    violation: violationText(verdicts),
    metrics,
    crossings,
  };
}

/** True when the project set no limit at all — every gate is then off. */
export function anyGateActive(s: GateSettings): boolean {
  return (
    s.maxDissipationFraction !== undefined ||
    s.minEpdrOhm !== undefined ||
    s.ampMinLoadOhm !== undefined ||
    s.maxDriveOnFsDb !== undefined
  );
}

/** Stable serialisation of the ACTIVE limits, for the run fingerprint. */
export function gateSettingsKey(s: GateSettings): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.maxDissipationFraction !== undefined) out.maxDissipationFraction = s.maxDissipationFraction;
  if (s.minEpdrOhm !== undefined) out.minEpdrOhm = s.minEpdrOhm;
  if (s.ampMinLoadOhm !== undefined) out.ampMinLoadOhm = s.ampMinLoadOhm;
  if (s.maxDriveOnFsDb !== undefined) out.maxDriveOnFsDb = s.maxDriveOnFsDb;
  return out;
}
