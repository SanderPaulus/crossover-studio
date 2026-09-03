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
 *
 * ── V32: TWO GRIDS, AND WHICH QUESTION EACH ONE ANSWERS ───────────────────
 *
 * A gate evaluation reads two different kinds of measurement and they do not
 * live on the same grid:
 *
 *   THE RESPONSE GRID (`GateReference.grid`) carries the branch pressures, so
 *   it is where the CROSSINGS are derived and therefore where the passbands
 *   come from. Its floor is the far-field measurement span — on casus 1,
 *   200 Hz — and that floor is correct: a response nobody measured is a
 *   response nobody may judge.
 *
 *   THE IMPEDANCE GRID (`GateReference.impedance`) carries the drivers' own
 *   measured sweeps over their whole extent. EVERY ELECTRICAL READING comes
 *   from there — the dissipation integral, EPDR, the bare |Z| minimum, the
 *   drive voltage on f_s, and whether a branch is high-pass protected.
 *
 * Until V32 there was one grid and it was the response grid, so `M-B/|Z|`
 * passed three frozen netlists at 2.59 Ω whose real minimum sits at 2.36 Ω and
 * 82 Hz — below the far-field floor and therefore invisible. `netOptimizer.ts`
 * had the rule right all along ("they are impedance criteria, and an impedance
 * measurement has no gate"); the reference was simply never held to it.
 *
 * WHEN NO SWEEP REACHES THE RUN, NO ELECTRICAL GATE JUDGES. The value is null,
 * the reason names the missing input, and there is NO fallback to the response
 * grid — falling back would silently reinstate the verdict this change exists
 * to withdraw. F4b2's leak 2 established the shape: an evaluation with no data
 * under it must produce no answer, never a lenient one.
 */

import { AMP_FLOOR_TOLERANCE, meetsAmpFloor } from '../../impedanceFloor.ts';
import type { Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { H_PER_MH, HP_PROTECTION_MIN_RISE_DB, HP_PROTECTION_PROBE_OCTAVES, PERCENT } from '../constants.ts';
import { cabs, dbAmp } from '../util.ts';
import { buildAnalysis, deriveCrossings, orderDriversLowToHigh, passbandOf } from '../metrics/analysis.ts';
import {
  impedanceReferenceFrom,
  type ImpedanceReference,
  type MeasuredSweep,
} from './impedanceReference.ts';

export type { ImpedanceReference, MeasuredSweep };
import {
  dissipation,
  driveVoltageOnResonance,
  epdr,
  type DissipationResult,
  type EpdrResult,
} from '../metrics/electrical.ts';
import { derivedDriveLimitDb } from '../metrics/driveExcursion.ts';
import {
  coilLoads,
  resistorLoads,
  worstCoil,
  worstResistor,
  type CoilLoad,
  type PartRatings,
  type ResistorLoad,
} from '../metrics/buildability.ts';
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
  /**
   * V49 — M-C v2.0: the EXCURSION-DERIVED ceiling per driver, in dB relative to
   * the amplifier's PEAK INPUT voltage (`driveExcursion.ts`). Derived once by
   * the report from the driver card, the measured sweep and the stated
   * amplifier peak, and carried here — never re-derived by a gate.
   *
   * Judged beside `maxDriveOnFsDb`, and THE STRICTER OF THE TWO APPLIES: the
   * stated figure is a passband-relative convention, the derived one becomes
   * passband-relative by subtracting the way's passband mean (which the M-C
   * value already carries). A way with neither is unjudged; the verdict names
   * which one bit.
   */
  driveCeilingDbByDriver?: Record<string, number>;
  /**
   * V50 — M-C's STATED figure PER WAY, keyed by driver model, beside the
   * single `maxDriveOnFsDb` above.
   *
   * V49 measured why one number for every way is the wrong shape: the 18-dB
   * rule is a dome convention (thermal load and distortion around f_s, which
   * M-C v2.0 does not model) while a cone's failure mode on its resonance is
   * excursion, which V49 DERIVES. So a project states the convention for the
   * way it belongs to and leaves the other ways to the derived ceiling alone.
   * Resolution per way: this map first, the single figure as the fallback,
   * nothing = no stated half (`effectiveDriveLimit`). An empty entry is NOT
   * "zero dB"; a way that should carry no stated figure is left out.
   */
  maxDriveOnFsDbByDriver?: Record<string, number>;
  /**
   * V50 — M-A/part: the CONTINUOUS power the per-resistor watts are judged
   * at, W. The same project field as `ProjectSettings.amplifierPowerW`
   * (the report spreads one object into both); it is declared here because a
   * gate that reads it makes it a search input, and a search input belongs in
   * the fingerprint (`gateSettingsKey`) — but only while a resistor allowance
   * is stated, so V36's "reporting only, not a fingerprint ingredient" still
   * holds for every run that states none.
   */
  amplifierPowerW?: number;
  /**
   * V50 — M-A/part: the resistor CLASS the project builds with, W continuous
   * (the manufacturer's rating of the series the designer buys). Used for
   * every resistor the catalogue snap did not rate. Absent = only catalogue
   * ratings judge, and without those the gate is OFF.
   */
  resistorClassW?: number;
  /**
   * V50 — M-A/part: the fraction of a resistor's rating it may run at. Stated
   * and never defaulted: a filter resistor in a closed cabinet without airflow
   * runs hot at half its rating, and how much of that a builder accepts is a
   * project decision. Absent = no allowance at all, gate OFF, said so.
   */
  resistorPowerMargin?: number;
  /**
   * V50 — M-L: the coil CLASS, A — the saturation / maximum current of the
   * cored coils the project builds with. Absent = only catalogue ratings
   * judge; an air-cored coil has no saturation current and is never judged.
   */
  coilClassA?: number;
  /**
   * V50 — M-L: the amplifier's peak input voltage, V (√2·√(P_peak·R_nom)),
   * derived ONCE by the caller from the V49 amplifier fields (`peakInputVolts`)
   * and carried here so the coil current is a figure in amperes rather than a
   * per-volt ratio. Absent = no peak stated, M-L reports no value.
   */
  peakInputVolts?: number;
}

/**
 * V49 — the M-C limit that actually applies to one way: the stated dB figure,
 * the excursion-derived one turned passband-relative, or the stricter of the
 * two. `undefined` = nothing to judge on (P4).
 *
 * ONE function, two readers (the gate and the pre-bound), so the search box and
 * the verdict cannot disagree about which requirement bites.
 */
export function effectiveDriveLimit(
  settings: Pick<GateSettings, 'maxDriveOnFsDb' | 'maxDriveOnFsDbByDriver' | 'driveCeilingDbByDriver'>,
  driver: string,
  passbandMeanDb: number | undefined,
): { limitDb: number; source: 'stated' | 'derived'; statedDb?: number; derivedDb?: number } | undefined {
  const stated = statedDriveLimitDb(settings, driver);
  const ceiling = settings.driveCeilingDbByDriver?.[driver];
  const derived =
    ceiling !== undefined && passbandMeanDb !== undefined && Number.isFinite(passbandMeanDb)
      ? derivedDriveLimitDb(ceiling, passbandMeanDb)
      : undefined;
  if (stated === undefined && derived === undefined) return undefined;
  if (derived === undefined) return { limitDb: stated!, source: 'stated', statedDb: stated };
  if (stated === undefined) return { limitDb: derived, source: 'derived', derivedDb: derived };
  return stated <= derived
    ? { limitDb: stated, source: 'stated', statedDb: stated, derivedDb: derived }
    : { limitDb: derived, source: 'derived', statedDb: stated, derivedDb: derived };
}

/**
 * V50 — the STATED M-C figure for one way: the per-way map first, the single
 * figure as the fallback, `undefined` when the project states neither for it.
 * One function, three readers (the gate, the pre-bound, the flank-order rule),
 * so nobody re-derives the fallback order.
 */
export function statedDriveLimitDb(
  settings: Pick<GateSettings, 'maxDriveOnFsDb' | 'maxDriveOnFsDbByDriver'>,
  driver: string,
): number | undefined {
  const perWay = settings.maxDriveOnFsDbByDriver?.[driver];
  if (perWay !== undefined && Number.isFinite(perWay)) return perWay;
  return settings.maxDriveOnFsDb;
}

/**
 * V50 — two gate ids more. `M-A/part` is M-A's per-element form (the watts in
 * ONE resistor against what that part may dissipate); `M-L` is the peak
 * current through one coil against what that part may carry. Both are
 * buildability: a design the amplifier can drive and the drivers survive is
 * still not a design if the parts on the schematic cannot be bought.
 */
export const GATE_IDS = ['M-A', 'M-B/EPDR', 'M-B/|Z|', 'M-C', 'M-A/part', 'M-L'] as const;
export type GateId = (typeof GATE_IDS)[number];

/** One gate's verdict about one subject. */
export interface GateVerdict {
  gate: GateId;
  /** The A4 metric this gate is built on. */
  metric: 'M-A' | 'M-B' | 'M-C' | 'M-L';
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
  /**
   * V32 — why `value` is null, when the caller knows.
   *
   * "The metric could not be evaluated" is true and useless. A reader who has
   * to decide whether this design was judged needs to know that the driver's
   * impedance sweep never reached the run, because that is a thing they can
   * fix. Used only when the value IS null; a gate with a value ignores it.
   */
  whyNull?: string;
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
          ? `not evaluated${args.whyNull ? ` — ${args.whyNull}` : ''}, and no limit set`
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
      reason:
        `limit ${shown(limit)}, but the metric was NOT JUDGED on this network — ` +
        (args.whyNull ?? 'the metric could not be evaluated'),
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
  /**
   * V32 — the band every electrical reading above was taken over, and where it
   * came from. Shown in each gate's `parameters`, because "2.61 Ω" and
   * "2.61 Ω, measured from 200 Hz up" are different claims and this project has
   * now paid once for not being able to tell them apart.
   */
  electricalSpan?: string;
  /**
   * V32 — why the electrical values are null, when they are.
   *
   * Absent means they are not null, or are null for a reason this caller does
   * not know. Never a fallback: a run with no measured sweep produces no
   * electrical verdict at all.
   */
  electricalUnavailable?: string;
  driveVoltage: {
    driver: string;
    db: number | null;
    fsHz: number;
    passbandHz: [number, number];
    /** Which passband convention produced it — 'frozen' or 'derived'. */
    bandSource: string;
    /** V49 — the dB-mean of |H| over that passband, so an input-relative
     *  excursion ceiling can be judged in M-C's passband-relative form. */
    passbandMeanDb?: number;
  }[];
  /**
   * V50 — the discrete resistors with their watts and allowance, from
   * `buildability.ts`. Absent = the caller could not produce them (no solved
   * network); an empty list = a network with no discrete resistor, which the
   * verdict says in words rather than as a zero (F0).
   */
  resistorLoads?: readonly ResistorLoad[];
  /** V50 — the coils with their peak current and allowance, likewise. */
  coilLoads?: readonly CoilLoad[];
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
      ...(values.electricalUnavailable ? { whyNull: values.electricalUnavailable } : {}),
      parameters: {
        band: values.dissipationBandHz
          ? `${values.dissipationBandHz[0].toFixed(0)}-${values.dissipationBandHz[1].toFixed(0)} Hz`
          : 'the analysis grid',
        weighting: 'IEC 60268-1 programme noise',
        ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
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
      ...(values.electricalUnavailable ? { whyNull: values.electricalUnavailable } : {}),
      ...(values.epdrAtHz !== undefined || values.electricalSpan
        ? {
            parameters: {
              ...(values.epdrAtHz !== undefined ? { at: `${values.epdrAtHz.toFixed(0)} Hz` } : {}),
              ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
            },
          }
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
      ...(values.electricalUnavailable ? { whyNull: values.electricalUnavailable } : {}),
      ...(values.minZAtHz !== undefined || values.electricalSpan
        ? {
            parameters: {
              ...(values.minZAtHz !== undefined ? { at: `${values.minZAtHz.toFixed(0)} Hz` } : {}),
              ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
            },
          }
        : {}),
    }),
  ];
  for (const d of values.driveVoltage) {
    /* V49 — the limit is the STRICTER of the stated figure and the
     * excursion-derived ceiling, and the parameters say which one bit. With a
     * ceiling but no passband mean (a null M-C) the derived half cannot be
     * formed; the stated one still judges, and the verdict says so. */
    const eff = effectiveDriveLimit(settings, d.driver, d.passbandMeanDb);
    out.push(
      judge({
        gate: 'M-C',
        metric: 'M-C',
        title: 'Drive voltage on the driver resonance',
        subject: d.driver,
        value: d.db,
        unit: 'dB',
        limit: eff?.limitDb,
        direction: 'max',
        specRef: 'A4 M-C',
        show: (v) => `${v.toFixed(1)} dB`,
        ...(values.electricalUnavailable ? { whyNull: values.electricalUnavailable } : {}),
        parameters: {
          f_s: `${d.fsHz.toFixed(0)} Hz`,
          passband: `${d.passbandHz[0].toFixed(0)}-${d.passbandHz[1].toFixed(0)} Hz (${d.bandSource})`,
          ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
          ...(eff
            ? {
                limit_source:
                  eff.source === 'stated'
                    ? eff.derivedDb !== undefined
                      ? 'stated dB figure (stricter than the excursion-derived ceiling)'
                      : 'stated dB figure (no excursion-derived ceiling for this way)'
                    : eff.statedDb !== undefined
                      ? 'excursion-derived ceiling (stricter than the stated dB figure, V49)'
                      : 'excursion-derived ceiling (no stated dB figure, V49)',
                ...(eff.statedDb !== undefined ? { stated_limit_dB: Number(eff.statedDb.toFixed(2)) } : {}),
                ...(eff.derivedDb !== undefined ? { derived_limit_dB: Number(eff.derivedDb.toFixed(2)) } : {}),
                ...(settings.driveCeilingDbByDriver?.[d.driver] !== undefined
                  ? { ceiling_re_peak_input_dB: Number(settings.driveCeilingDbByDriver[d.driver].toFixed(2)) }
                  : {}),
              }
            : {}),
        },
      }),
    );
  }
  out.push(resistorVerdict(settings, values), coilVerdict(settings, values));
  return out;
}

/* ------------------------------------------------------------------ *
 * V50 — the two buildability verdicts
 * ------------------------------------------------------------------ */

/**
 * M-A/part — the watts in the resistor with the least headroom, against what
 * THAT part may dissipate.
 *
 * Armed only when an allowance exists for at least one resistor: a stated
 * class (with the margin) or a rated catalogue part (with the margin). The
 * margin alone arms nothing, a class without margin arms nothing, and each of
 * those states is said in the reason so a designer can see which field is
 * missing (P4's visible half).
 */
function resistorVerdict(settings: GateSettings, values: GateMetricValues): GateVerdict {
  const loads = values.resistorLoads;
  const worst = loads ? worstResistor(loads) : null;
  const margin = settings.resistorPowerMargin;
  const marginOk = margin !== undefined && margin > 0;
  const anyRating =
    (settings.resistorClassW !== undefined && settings.resistorClassW > 0) ||
    (loads?.some((l) => l.ratingW !== null) ?? false);
  /* Armed when an allowance can be formed. With a stated class the limit
   * exists even for a network with no resistor to hold against it — the gate
   * is then ACTIVE and NOT JUDGED (value null), never silently off. */
  const classAllowance =
    marginOk && settings.resistorClassW !== undefined && settings.resistorClassW > 0
      ? settings.resistorClassW * margin!
      : undefined;
  const limitW = marginOk && anyRating && worst !== null && worst.allowedW !== null ? worst.allowedW : classAllowance;
  const noPower = settings.amplifierPowerW === undefined || !(settings.amplifierPowerW > 0);
  const whyNull =
    !loads
      ? (values.electricalUnavailable ??
        'the network was not solved on the measured sweep, so no resistor power was read')
      : loads.length === 0
        ? 'this network carries no discrete resistor — nothing to rate (a zero here would read as a measurement)'
        : noPower
          ? 'no continuous amplifier power is stated, so M-A\'s fractions cannot be turned into watts'
          : 'no resistor power could be read';
  const parameters: Record<string, number | string> = {
    ...(worst
      ? {
          element: worst.id,
          ohm: Number(worst.ohm.toFixed(3)),
          share_of_amplifier_power: `${(worst.fraction * PERCENT).toFixed(1)} %`,
          ...(settings.amplifierPowerW !== undefined ? { continuous_power_W: settings.amplifierPowerW } : {}),
          ...(worst.ratingW !== null ? { rating_W: worst.ratingW, rating_source: worst.ratingSource ?? '' } : {}),
          ...(marginOk ? { margin_fraction: margin } : {}),
        }
      : {}),
    ...(loads && loads.length > 0
      ? {
          resistors: loads
            .map((l) => `${l.id} ${l.watts === null ? '?' : l.watts.toFixed(1)} W` +
              (l.allowedW !== null ? ` / ${l.allowedW.toFixed(1)} W allowed` : ''))
            .join('; '),
        }
      : {}),
    ...(!marginOk ? { margin: 'no margin fraction stated — the gate cannot form an allowance (P4)' } : {}),
    ...(marginOk && !anyRating
      ? { rating: 'no resistor class stated and no rated catalogue part on any resistor — nothing to judge on (P4)' }
      : {}),
    remedy:
      'a resistor above its allowance needs a higher class or a series/parallel bank — a topology ' +
      'choice the generator does not make (casebook V50)',
    weighting: 'IEC 60268-1 programme noise, continuous (thermal — a mean, not a peak)',
    ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
  };
  return judge({
    gate: 'M-A/part',
    metric: 'M-A',
    title: 'Power in the hottest filter resistor against its rating',
    subject: 'system',
    value: worst?.watts ?? null,
    unit: 'W',
    limit: limitW,
    direction: 'max',
    specRef: 'A4 M-A (per part, V50)',
    show: (v) => `${v.toFixed(1)} W${worst ? ` in ${worst.id}` : ''}`,
    ...(worst?.watts === null || worst === null ? { whyNull } : {}),
    parameters,
  });
}

/**
 * M-L — the peak current through the coil with the least headroom, against
 * what THAT part may carry. Armed only when a class is stated or a rated
 * catalogue part sits on at least one coil; air-cored coils carry no
 * saturation figure and are reported, never judged.
 */
function coilVerdict(settings: GateSettings, values: GateMetricValues): GateVerdict {
  const loads = values.coilLoads;
  const worst = loads ? worstCoil(loads) : null;
  const anyRating =
    (settings.coilClassA !== undefined && settings.coilClassA > 0) ||
    (loads?.some((l) => l.allowedA !== null) ?? false);
  const classAllowance = settings.coilClassA !== undefined && settings.coilClassA > 0 ? settings.coilClassA : undefined;
  const limitA = anyRating && worst !== null && worst.allowedA !== null ? worst.allowedA : classAllowance;
  const noPeak = settings.peakInputVolts === undefined || !(settings.peakInputVolts > 0);
  const whyNull =
    !loads
      ? (values.electricalUnavailable ??
        'the network was not solved on the measured sweep, so no coil current was read')
      : loads.length === 0
        ? 'this network carries no coil'
        : noPeak
          ? 'no amplifier peak (peak power and nominal load, V49) is stated, so the current at the peak input cannot be formed'
          : 'no coil current could be read';
  const parameters: Record<string, number | string> = {
    ...(worst
      ? {
          element: worst.id,
          mH: Number((worst.henry / H_PER_MH).toFixed(3)),
          ...(worst.atHz !== null ? { at: `${worst.atHz.toFixed(0)} Hz` } : {}),
          ...(settings.peakInputVolts !== undefined ? { peak_input_V: Number(settings.peakInputVolts.toFixed(2)) } : {}),
          ...(worst.allowedA !== null ? { rating_A: worst.allowedA, rating_source: worst.ratingSource ?? '' } : {}),
        }
      : {}),
    ...(loads && loads.length > 0
      ? {
          coils: loads
            .map((l) => `${l.id} ${l.peakA === null ? '?' : l.peakA.toFixed(2)} A` +
              (l.atHz !== null ? ` @ ${l.atHz.toFixed(0)} Hz` : '') +
              (l.allowedA !== null ? ` / ${l.allowedA.toFixed(2)} A allowed` : ''))
            .join('; '),
        }
      : {}),
    ...(!anyRating
      ? { rating: 'no coil class stated and no rated catalogue part on any coil — air-cored coils have no saturation current and are never judged (P4)' }
      : {}),
    reading: 'peak current amplitude at the amplifier\'s peak input voltage, unweighted — saturation is a one-cycle event',
    ...(values.electricalSpan ? { judged_on: values.electricalSpan } : {}),
  };
  return judge({
    gate: 'M-L',
    metric: 'M-L',
    title: 'Peak current through the most loaded coil against its rating',
    subject: 'system',
    value: worst?.peakA ?? null,
    unit: 'A',
    limit: limitA,
    direction: 'max',
    specRef: 'A4 M-L (V50)',
    show: (v) => `${v.toFixed(2)} A${worst ? ` through ${worst.id}` : ''}`,
    ...(worst?.peakA === null || worst === null ? { whyNull } : {}),
    parameters,
  });
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
  /**
   * The RESPONSE grid — where the branch pressures live and therefore where the
   * crossings, and only the crossings, are derived. Its floor is the far-field
   * measurement span. See the V32 note at the top of this file: no electrical
   * reading is taken here any more.
   */
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
  /**
   * V32 — the IMPEDANCE grid: where every electrical reading is taken.
   *
   * Null when no measured sweep reached this run. There is no fallback to
   * `grid`; the electrical gates then report no value and `impedanceAbsent`
   * says which input was missing.
   */
  impedance: ImpedanceReference | null;
  /** Why `impedance` is null. Null when it is not. */
  impedanceAbsent: string | null;
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
    driveVoltage: {
      driver: string;
      db: number;
      passbandHz: [number, number];
      /** V49 — the passband mean the dB is relative to, for the pre-bound. */
      passbandMeanDb: number;
    }[];
    /** V50 — the per-element loads the two buildability verdicts were made from. */
    resistorLoads: ResistorLoad[] | null;
    coilLoads: CoilLoad[] | null;
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
  /**
   * V32 — the drivers' OWN measured impedance sweeps, per netlist model.
   *
   * Absent, or missing a model the netlist needs, and no electrical gate
   * judges. That is the whole repair: the caller says what the measurement IS,
   * and a caller with nothing to say gets no verdict rather than a lenient one
   * taken off the response grid.
   */
  sweeps?: Readonly<Record<string, MeasuredSweep>>;
}): GateReference {
  const analysis = buildAnalysis(args.netlist, args.grid, args.driverZ);
  const half = impedanceHalf(args.sweeps, Object.keys(args.driverZ));
  /* Protection is an ELECTRICAL property — it reads the branch's own transfer
   * half an octave below the passband floor — so it is answered on the
   * impedance grid whenever there is one. On casus 1's response grid that probe
   * band starts below 200 Hz for the lowest way and lands on two points; on the
   * measured sweep it is fully covered. */
  const probeOn = half.impedance
    ? buildAnalysisOrNull(args.netlist, half.impedance.grid, half.impedance.driverZ) ?? analysis
    : analysis;
  const { order, crossings } = crossingsOf(analysis, args.grid, args.branchDb);
  const frozenPassbandHz: Record<string, [number, number]> = {};
  const protectedDrivers: string[] = [];
  for (const driver of order) {
    const fallback = args.validHz[driver] ?? [args.grid[0], args.grid[args.grid.length - 1]];
    const pass = passbandOf(driver, crossings, fallback);
    frozenPassbandHz[driver] = pass;
    if (isHighPassProtected(probeOn, driver, pass)) protectedDrivers.push(driver);
  }
  return {
    grid: args.grid,
    driverZ: args.driverZ,
    branchDb: args.branchDb,
    fsHz: args.fsHz,
    validHz: args.validHz,
    frozenPassbandHz,
    frozenHighPassProtected: protectedDrivers,
    impedance: half.impedance,
    impedanceAbsent: half.impedanceAbsent,
  };
}

/** Solve, or null — the caller has its own opinion about an unsolvable network. */
function buildAnalysisOrNull(
  netlist: Netlist,
  grid: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
): NetworkAnalysis | null {
  try {
    return buildAnalysis(netlist, grid, driverZ);
  } catch {
    return null;
  }
}

/**
 * The impedance half of a reference, or the reason there is none.
 *
 * Every branch of this function is a refusal, and that is deliberate: the only
 * way to get an electrical verdict is to supply the measurement it is a verdict
 * about. `models` is what the network needs — a system impedance is not a
 * per-driver quantity, so one missing sweep is as disqualifying as none at all,
 * and it is named.
 */
function impedanceHalf(
  sweeps: Readonly<Record<string, MeasuredSweep>> | undefined,
  models: readonly string[],
): { impedance: ImpedanceReference | null; impedanceAbsent: string | null } {
  const absent = (why: string) => ({ impedance: null, impedanceAbsent: why });
  if (!sweeps || Object.keys(sweeps).length === 0) {
    return absent(
      'no measured impedance sweep reached this run, so there is nothing to judge an electrical ' +
        'requirement on. The response grid is NOT used instead: its floor is the far-field ' +
        'measurement span, and judging an impedance there is what V32 is about.',
    );
  }
  const missing = [...models].filter((m) => sweeps[m] === undefined).sort();
  if (missing.length > 0) {
    return absent(
      `no measured impedance sweep reached this run for ${missing.join(', ')}. The amplifier sees ` +
        'the whole network, so one unmeasured branch leaves the system impedance unknown — an ' +
        'answer from the remaining branches would be about a different loudspeaker.',
    );
  }
  const ref = impedanceReferenceFrom(sweeps);
  return ref === null
    ? absent(
        'the impedance sweeps that reached this run carry no usable extent (fewer than two ' +
          'points, or a validity interval that is not an interval).',
      )
    : { impedance: ref, impedanceAbsent: null };
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
 *
 * V32: `passbands` selects a CONVENTION, never a grid. Both conventions read
 * their electrical values off `ref.impedance`; what they differ about is the
 * band M-C averages over.
 */
export function evaluateGates(
  netlist: Netlist,
  settings: GateSettings,
  ref: GateReference,
  passbands: 'frozen' | 'derived' = 'frozen',
  /**
   * V50 — what the catalogue rates the CHOSEN parts for, keyed by element id.
   * Resolved by the caller that holds the parts (`partRatings.ts`); absent =
   * only the stated classes can form an allowance.
   */
  ratings?: PartRatings,
): GateEvaluation {
  const verdicts: GateVerdict[] = [];
  const metrics: GateEvaluation['metrics'] = {
    dissipation: null,
    epdr: null,
    driveVoltage: [],
    resistorLoads: null,
    coilLoads: null,
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

  /* ---- V32: the ELECTRICAL analysis, on the measured sweep ------------- *
   * Every reading below comes from here and none of them from `analysis`
   * above, which now derives crossings and nothing else. `electrical` is null
   * exactly when no sweep reached this run, and then no electrical gate
   * judges — see `impedanceHalf` for why there is no fallback. */
  const electrical = ref.impedance
    ? buildAnalysisOrNull(netlist, ref.impedance.grid, ref.impedance.driverZ)
    : null;
  const electricalUnavailable =
    electrical !== null
      ? undefined
      : (ref.impedanceAbsent ??
        'the network could not be solved on the measured impedance sweep, so no electrical ' +
          'requirement was judged.');
  const electricalSpan = electrical !== null ? ref.impedance?.span : undefined;

  /* V50 — the watts per resistor come from the SAME dissipation call, with the
   * stated continuous power handed in: the fraction is untouched, and passing
   * the power only fills the per-element watts M-A has carried since V36. */
  const diss = electrical
    ? dissipation(electrical, {
        ...(settings.amplifierPowerW !== undefined ? { amplifierPowerW: settings.amplifierPowerW } : {}),
      })
    : null;
  metrics.dissipation = diss;
  const rLoads = diss
    ? resistorLoads(diss, {
        ...(settings.amplifierPowerW !== undefined ? { continuousPowerW: settings.amplifierPowerW } : {}),
        ...(settings.resistorClassW !== undefined ? { resistorClassW: settings.resistorClassW } : {}),
        ...(settings.resistorPowerMargin !== undefined ? { marginFraction: settings.resistorPowerMargin } : {}),
        ...(ratings ? { ratings } : {}),
      })
    : undefined;
  const lLoads = electrical
    ? coilLoads(electrical, {
        ...(settings.peakInputVolts !== undefined ? { peakInputVolts: settings.peakInputVolts } : {}),
        ...(settings.coilClassA !== undefined ? { coilClassA: settings.coilClassA } : {}),
        ...(ratings ? { ratings } : {}),
      })
    : undefined;
  metrics.resistorLoads = rLoads ?? null;
  metrics.coilLoads = lLoads ?? null;
  const e = electrical ? epdr(electrical) : null;
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
      // Protection reads a branch transfer, so it is answered where the
      // electrical readings are — see `freezeGateReference` for the same rule
      // applied to the frozen half.
      if (isHighPassProtected(electrical ?? analysis, driver, bands[driver])) subjects.push(driver);
    }
    passbandFor = (d) => bands[d] ?? ref.validHz[d];
  }

  const drive: GateMetricValues['driveVoltage'] = [];
  for (const driver of subjects) {
    const fs = ref.fsHz[driver];
    const band = passbandFor(driver);
    if (fs === undefined || !band) continue;
    const r = electrical ? driveVoltageOnResonance(electrical, driver, fs, band) : null;
    if (r) {
      metrics.driveVoltage.push({
        driver,
        db: r.db,
        passbandHz: r.passbandHz,
        passbandMeanDb: r.passbandMeanDb,
      });
    }
    drive.push({
      driver,
      db: r ? r.db : null,
      fsHz: fs,
      passbandHz: band,
      bandSource: passbands,
      ...(r ? { passbandMeanDb: r.passbandMeanDb } : {}),
    });
  }

  verdicts.push(
    ...gateVerdicts(settings, {
      dissipationFraction: diss?.totalFraction ?? null,
      ...(diss ? { dissipationBandHz: diss.bandHz } : {}),
      epdrMinOhm: e?.minOhm ?? null,
      ...(e ? { epdrAtHz: e.atHz, minZAtHz: e.minZAtHz } : {}),
      minZOhm: e?.minZOhm ?? null,
      ...(electricalSpan ? { electricalSpan } : {}),
      ...(electricalUnavailable ? { electricalUnavailable } : {}),
      driveVoltage: drive,
      ...(rLoads ? { resistorLoads: rLoads } : {}),
      ...(lLoads ? { coilLoads: lLoads } : {}),
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
    s.maxDriveOnFsDb !== undefined ||
    Object.keys(s.maxDriveOnFsDbByDriver ?? {}).length > 0 ||
    Object.keys(s.driveCeilingDbByDriver ?? {}).length > 0 ||
    resistorGateArmed(s) ||
    (s.coilClassA !== undefined && s.coilClassA > 0)
  );
}

/**
 * V50 — whether M-A/part can judge on the STATED inputs alone: a class and a
 * margin. A catalogue rating can arm it as well, but that is data on the parts
 * and not a setting, so it is not this function's to know.
 */
export function resistorGateArmed(s: GateSettings): boolean {
  return (
    s.resistorClassW !== undefined && s.resistorClassW > 0 &&
    s.resistorPowerMargin !== undefined && s.resistorPowerMargin > 0
  );
}

/** Stable serialisation of the ACTIVE limits, for the run fingerprint. */
export function gateSettingsKey(s: GateSettings): Record<string, number | Record<string, number>> {
  const out: Record<string, number | Record<string, number>> = {};
  if (s.maxDissipationFraction !== undefined) out.maxDissipationFraction = s.maxDissipationFraction;
  if (s.minEpdrOhm !== undefined) out.minEpdrOhm = s.minEpdrOhm;
  if (s.ampMinLoadOhm !== undefined) out.ampMinLoadOhm = s.ampMinLoadOhm;
  if (s.maxDriveOnFsDb !== undefined) out.maxDriveOnFsDb = s.maxDriveOnFsDb;
  /* V49 — per driver, sorted, rounded to a fixed precision so two payloads that
   * mean the same ceiling cannot fingerprint differently over a float's last
   * digit (the `measurementFactsKey` rule). */
  const ceilings = s.driveCeilingDbByDriver ?? {};
  const keys = Object.keys(ceilings).sort();
  if (keys.length > 0) {
    const c: Record<string, number> = {};
    for (const k of keys) c[k] = Number(ceilings[k].toPrecision(9));
    out.driveCeilingDbByDriver = c;
  }
  /* V50 — the per-way stated figures, same rule. */
  const perWay = s.maxDriveOnFsDbByDriver ?? {};
  const wayKeys = Object.keys(perWay).sort();
  if (wayKeys.length > 0) {
    const c: Record<string, number> = {};
    for (const k of wayKeys) c[k] = Number(perWay[k].toPrecision(9));
    out.maxDriveOnFsDbByDriver = c;
  }
  /* V50 — the buildability inputs. The continuous power and the peak input
   * are search inputs ONLY while the gate that reads them is armed; a run
   * that states a power for its watt column and no allowance still stamps as
   * it did (V36's rule, kept). */
  if (resistorGateArmed(s)) {
    out.resistorClassW = s.resistorClassW!;
    out.resistorPowerMargin = s.resistorPowerMargin!;
    if (s.amplifierPowerW !== undefined) out.amplifierPowerW = s.amplifierPowerW;
  }
  if (s.coilClassA !== undefined && s.coilClassA > 0) {
    out.coilClassA = s.coilClassA;
    if (s.peakInputVolts !== undefined) out.peakInputVolts = Number(s.peakInputVolts.toPrecision(9));
  }
  return out;
}
