/**
 * A5e.1 — THE SHORTLIST: the feasible region, made into a list a human picks
 * from.
 *
 * This is the module the whole decision comes down to, and it is deliberately
 * short on judgement:
 *
 *   · It FILTERS — everything that meets every active requirement and every
 *     active gate is feasible. There is no score, no weighted sum and no
 *     normalised aggregate anywhere in this file. `noWeights.test.ts` asserts
 *     that structurally, because "we decided not to have weights" is the kind
 *     of decision that erodes one convenience at a time.
 *   · It SPREADS — over order signatures first, then over normalised component
 *     space (see `diversity.ts`).
 *   · It ORDERS FOR PRESENTATION — by RMS deviation from the target curve, and
 *     that is a default view rather than a verdict. Every column re-sorts, and
 *     re-sorting changes nothing about which designs are in the list.
 *   · It STAMPS — two-stage, so that what the search did and what the
 *     selection did stay separable.
 *
 * THE TWO-STAGE STAMP, since it is the subtle part. The requirements never
 * touch the search, so they must not appear in the RUN fingerprint: two runs
 * that searched identically must fingerprint identically, whatever was asked
 * of the results afterwards. But the shortlist plainly does depend on them, so
 * it carries its own stamp — target curve, requirement values, ladder steps
 * with their label, N, selection version — layered on top of the run
 * fingerprint it was selected from. Same requirements on the same run give a
 * byte-identical shortlist; different requirements give the same run
 * fingerprint and a different shortlist stamp.
 */

import type { VxpPart } from '../../parsers/vxp.ts';
import { DEFAULT_SHORTLIST_SIZE } from '../constants.ts';
import {
  describeBestMisses,
  evaluateRequirements,
  requirementSettingsKey,
  type CandidateMeasurements,
  type RequirementEvaluation,
  type RequirementSettings,
} from '../requirements/requirements.ts';
import { describeTargetCurve, FLAT_TARGET, type TargetCurve } from '../requirements/targetCurve.ts';
import { digest, fingerprintOf, stableJson, type FingerprintComponent } from './determinism.ts';
import {
  componentVector,
  orderSignature,
  selectDiverse,
  topologyClassKey,
  type DiversityInput,
  type TopologyDescriptor,
} from './diversity.ts';
import type { GateVerdict } from './gates.ts';
import { relaxUntil, type RelaxationOptions, type RelaxationOutcome } from './relaxation.ts';

/**
 * The selection's own version.
 *
 * Bump it when the SPREADING or the FILTERING changes — anything that could
 * make the same field produce a different list. It rides in the shortlist
 * stamp, so an old stamp and a new one cannot be mistaken for each other. The
 * same discipline as the estimator versions (A5e.5), applied to a selection
 * rather than to a measurement.
 */
export const SHORTLIST_SELECTION_VERSION = 'shortlist/1.0';

/** One candidate offered to the selection. */
export interface ShortlistInput<T> {
  label: string;
  parts: readonly VxpPart[];
  /** The chain result, carried through untouched. */
  result: T;
  topology: TopologyDescriptor;
  measurements: CandidateMeasurements;
  /** The gate verdicts this candidate already earned (F2). */
  gates: readonly GateVerdict[];
  /** Reasons the v1 chain itself disqualified it, if any. */
  disqualified?: readonly string[];
}

/** One row of the delivered shortlist. */
export interface ShortlistRow<T> {
  label: string;
  parts: readonly VxpPart[];
  result: T;
  /** Full class key: order, family and polarity. */
  topologyClass: string;
  /** The coarse key the spreading used. */
  orderSignature: string;
  requirements: RequirementEvaluation;
  gates: readonly GateVerdict[];
  measurements: CandidateMeasurements;
}

export interface ShortlistStamp {
  /** The fingerprint of the RUN these candidates came from. */
  runFingerprint: string;
  /** The selection's own fingerprint, layered on top. */
  shortlistFingerprint: string;
  components: FingerprintComponent[];
  selectionVersion: string;
}

export interface Shortlist<T> {
  rows: ShortlistRow<T>[];
  /** Every candidate that was judged, feasible or not — the field's size. */
  consideredCount: number;
  /** How many met every requirement in force. */
  feasibleCount: number;
  relaxation: RelaxationOutcome;
  /** Set when the ladder moved: the sentence that must travel with these rows. */
  label: string | null;
  /** Present when nothing was feasible: which requirement was missed, by how much. */
  diagnosis: string[];
  targetCurve: TargetCurve;
  stamp: ShortlistStamp;
  notes: string[];
}

export interface ShortlistSettings {
  requirements?: RequirementSettings;
  targetCurve?: TargetCurve;
  /** How many designs to deliver. Absent = `DEFAULT_SHORTLIST_SIZE`. */
  size?: number;
  relaxation?: RelaxationOptions;
}

/**
 * THE SORT KEY, and the only one this module applies by itself.
 *
 * RMS deviation from the target curve. A candidate that could not be judged
 * sorts last rather than first — an unmeasurable design is not a flat one —
 * and ties fall through to the field order, which is already deterministic.
 *
 * This is presentation. Nothing downstream may treat position in this list as
 * a verdict, which is why the row carries every metric that produced it.
 */
function sortKeyOf(m: CandidateMeasurements): number {
  const v = m.response?.rmsDeviationDb;
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.MAX_VALUE;
}

export function buildShortlist<T>(
  candidates: readonly ShortlistInput<T>[],
  runFingerprint: string,
  settings: ShortlistSettings = {},
): Shortlist<T> {
  const requirements = settings.requirements ?? {};
  const targetCurve = settings.targetCurve ?? FLAT_TARGET;
  const size = settings.size ?? DEFAULT_SHORTLIST_SIZE;
  const notes: string[] = [];

  /* ---- the feasible region ------------------------------------------- *
   * Two ways to be out: a requirement the designer stated, or a gate. They
   * are kept apart on purpose — the ladder may move the first and may never
   * move the second, and a candidate refused by a gate must not look like one
   * that merely missed a taste limit. */
  const gateFailed = candidates.map((c) => c.gates.some((g) => g.active && !g.pass));

  const evaluateAll = (inForce: RequirementSettings): RequirementEvaluation[] =>
    candidates.map((c, i) => {
      const e = evaluateRequirements(c.measurements, inForce, requirements);
      // A gate failure is not a requirement failure, but it is still an exit.
      // Recorded here so that `feasible` means "may be delivered" everywhere.
      return gateFailed[i] ? { ...e, feasible: false } : e;
    });

  const relaxation = relaxUntil(requirements, size, evaluateAll, settings.relaxation);
  notes.push(...relaxation.notes);

  const feasible: DiversityInput<ShortlistRow<T>>[] = [];
  candidates.forEach((c, i) => {
    const evaluation = relaxation.evaluations[i];
    if (!evaluation.feasible) return;
    const row: ShortlistRow<T> = {
      label: c.label,
      parts: c.parts,
      result: c.result,
      topologyClass: topologyClassKey(c.topology),
      orderSignature: orderSignature(c.topology),
      requirements: evaluation,
      gates: c.gates,
      measurements: c.measurements,
    };
    feasible.push({
      item: row,
      classKey: row.topologyClass,
      orderKey: row.orderSignature,
      vector: componentVector(c.parts),
      sortKey: sortKeyOf(c.measurements),
      index: i,
    });
  });

  const picked = selectDiverse(feasible, size);
  // Presentation order: RMS first, field order on a tie. The SELECTION above
  // decided WHICH designs; this decides only how they are laid out, and the
  // two are separate so that re-sorting in the UI can never change the list.
  const rows = [...picked]
    .sort((a, b) => (a.sortKey === b.sortKey ? a.index - b.index : a.sortKey - b.sortKey))
    .map((p) => p.item);

  const diagnosis =
    relaxation.feasibleCount === 0
      ? describeBestMisses(
          relaxation.evaluations,
          candidates.map((c) => [...c.gates]),
        )
      : [];

  if (!isImplementedCurve(targetCurve)) {
    notes.push(
      `The target curve "${targetCurve.type}" is declared but not implemented (A5e.2); every ` +
        'window and RMS figure here would have been evaluated against something else.',
    );
  }

  const components: FingerprintComponent[] = [
    {
      name: 'run',
      value: digest(runFingerprint),
      describe: 'the optimisation run these candidates came from',
    },
    {
      name: 'selection',
      value: SHORTLIST_SELECTION_VERSION,
      describe: 'the version of the filtering and spreading rules',
    },
    {
      name: 'target',
      value: digest(stableJson(targetCurve)),
      describe: `target curve — ${describeTargetCurve(targetCurve)}`,
    },
    {
      name: 'requirements',
      value: digest(stableJson(requirementSettingsKey(requirements))),
      describe: 'the requirements the designer stated',
    },
    {
      name: 'relaxation',
      value: digest(
        stableJson({
          steps: relaxation.steps,
          label: relaxation.label,
          inForce: requirementSettingsKey(relaxation.inForce),
        }),
      ),
      describe: 'the ladder: which requirements moved, how far, and the label that says so',
    },
    { name: 'size', value: String(size), describe: 'how many designs the shortlist holds' },
  ];

  return {
    rows,
    consideredCount: candidates.length,
    feasibleCount: relaxation.feasibleCount,
    relaxation,
    label: relaxation.label,
    diagnosis,
    targetCurve,
    stamp: {
      runFingerprint,
      shortlistFingerprint: fingerprintOf(components),
      components,
      selectionVersion: SHORTLIST_SELECTION_VERSION,
    },
    notes,
  };
}

const isImplementedCurve = (c: TargetCurve): boolean => c.type === 'flat';
