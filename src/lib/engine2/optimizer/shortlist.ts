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
import {
  describeTargetCurve,
  FLAT_TARGET,
  isImplemented,
  type TargetCurve,
} from '../requirements/targetCurve.ts';
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
export const SHORTLIST_SELECTION_VERSION = 'shortlist/1.1';
/* 1.1 — V31: a candidate whose tune was refused wholesale is no longer eligible
 * at all. The same field can therefore produce a different list, which is
 * exactly the condition this constant exists to record. */

/**
 * V36 — WHAT A DESIGN BURNS, AS A COLUMN.
 *
 * A COLUMN AND NOT A CRITERION, and the distinction is the whole delivery.
 * Nothing in this file reads it: it does not filter, it does not spread, it
 * does not sort, and no threshold anywhere compares against it. That is the
 * A5e.1 rule (`noWeights.test.ts` enforces the general form of it) and it is
 * also the honest state of affairs — casus 1 states no dissipation limit, so
 * per P4 there is nothing to judge and a number without a judgement is exactly
 * what belongs on a screen.
 *
 * WHY IT HAD TO BE CARRIED RATHER THAN LOOKED UP. The M-A gate verdict already
 * carries the FRACTION, and the shortlist has shown that since F3. It cannot
 * carry the WATTS: a fraction is scale-free by construction (A4 says so) and a
 * watt needs the amplifier power the designer stated. So the number that tells
 * a builder whether a 20 W resistor will do had no route to the list at all —
 * measured on the live corpus at V36: 15.2 to 28.7 W in ONE resistor at 100 W,
 * on designs whose only visible dissipation figure was "23 %".
 */
export interface DissipationColumn {
  /** M-A's own number — the share of amplifier power burnt in the DISCRETE
   *  resistors. Read from the gate evaluation, never recomputed here. */
  totalFraction: number;
  /** The largest single discrete resistor, or null when the design has none. */
  largestResistor: { id: string; ohm: number; fraction: number } | null;
  /**
   * Watts in that resistor at the stated amplifier power. `null` when the
   * designer stated no power — an empty field is not a judgement (F0), and a
   * default wattage would be this app inventing the one number a builder is
   * most likely to act on.
   */
  largestResistorWatts: number | null;
  /** The power those watts are at, or null. Quoted beside them, because
   *  "20 W" without it is half a sentence. */
  powerW: number | null;
  /**
   * V50 — what that hottest resistor MAY dissipate (rating × margin), or null
   * when no allowance exists; and the coil carrying the highest peak current
   * at the amplifier's peak input, with its allowance. Columns, read from the
   * gate evaluation; the verdicts beside them are what judges.
   */
  largestResistorAllowedW?: number | null;
  worstCoil?: { id: string; peakA: number; atHz: number | null; allowedA: number | null } | null;
}

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
  /**
   * V36 — what it burns.
   *
   * OPTIONAL, and the two empty states mean different things. ABSENT is a
   * caller that does not measure dissipation at all; `null` is a candidate that
   * was measured and could not be answered — no network (a wholesale refusal),
   * or no measured sweep to solve it on. Both become `null` on the row, because
   * a row has nothing to show either way; the distinction lives here, where the
   * caller states it.
   *
   * Neither is 0. A design that burns nothing and a design nobody measured are
   * not the same claim (F0).
   */
  dissipation?: DissipationColumn | null;
  /** Reasons the v1 chain itself disqualified it, if any. */
  disqualified?: readonly string[];
  /**
   * V31 — set when this candidate's tune was refused wholesale and it
   * therefore has no network to offer.
   *
   * A THIRD way to be out, kept apart from the other two on purpose. A
   * requirement the ladder may move; a gate it may never move; and this, which
   * is not a judgement about a design at all — there IS no design. A rejected
   * candidate that shared a lane with a gate failure would read as "we looked
   * at it and it was not good enough", and nobody looked at anything.
   */
  rejection?: {
    kinds: readonly string[];
    reason: string;
    rejectedTune?: Readonly<Record<string, number | null>> | null;
  } | null;
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
  /** V36 — carried through untouched, exactly as `gates` is. */
  dissipation: DissipationColumn | null;
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

/**
 * V31 — one candidate that delivered nothing, and why.
 *
 * Deliberately NOT a `ShortlistRow`: it carries no `parts`, no `result` and no
 * measurements, because there is no design to carry them about. Presenting a
 * refused candidate with a seed's numbers in a row is exactly what V31 is.
 */
export interface ShortlistRejection {
  label: string;
  /** The typed categories of the rule that refused it. */
  kinds: readonly string[];
  /** That rule's own sentence, for a human. */
  reason: string;
  /** What the REFUSED tune had reached. Reporting; not a design. */
  rejectedTune?: Readonly<Record<string, number | null>> | null;
}

export interface Shortlist<T> {
  rows: ShortlistRow<T>[];
  /**
   * V31 — the candidates that delivered no network at all, with the rule that
   * refused each of them. Never rows, and never counted as feasible.
   */
  rejected: ShortlistRejection[];
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
  /* V31 — the third exit. Applied here, OUTSIDE the ladder's reach, for the
   * same reason a gate is: the ladder relaxes taste, and there is no taste
   * limit anyone could relax that would make a candidate with no network
   * deliverable. */
  const wasRejected = candidates.map((c) => Boolean(c.rejection));

  const evaluateAll = (inForce: RequirementSettings): RequirementEvaluation[] =>
    candidates.map((c, i) => {
      const e = evaluateRequirements(c.measurements, inForce, requirements);
      // A gate failure is not a requirement failure, but it is still an exit.
      // Recorded here so that `feasible` means "may be delivered" everywhere.
      return gateFailed[i] || wasRejected[i] ? { ...e, feasible: false } : e;
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
      dissipation: c.dissipation ?? null,
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

  const rejected: ShortlistRejection[] = candidates
    .filter((c) => c.rejection)
    .map((c) => ({
      label: c.label,
      kinds: [...c.rejection!.kinds],
      reason: c.rejection!.reason,
      ...(c.rejection!.rejectedTune ? { rejectedTune: c.rejection!.rejectedTune } : {}),
    }));
  if (rejected.length > 0) {
    notes.push(
      `${rejected.length} of ${candidates.length} candidates delivered no network at all: their ` +
        'tune was refused wholesale and the seed that came back is not a proposal (V31). They ' +
        'are listed under `rejected` with the rule that refused them, and they are not rows.',
    );
  }

  /* The diagnosis answers "what was the closest miss", so it may only look at
   * candidates that HAVE a measurement. A refused candidate's numbers are its
   * seed's, and letting them in would make the seed the best near-miss. */
  const measured = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !wasRejected[i]);
  const diagnosis =
    relaxation.feasibleCount === 0
      ? [
          ...describeBestMisses(
            measured.map(({ i }) => relaxation.evaluations[i]),
            measured.map(({ c }) => [...c.gates]),
          ),
          ...(rejected.length > 0
            ? [
                `${rejected.length} candidate(s) delivered nothing to miss with: ` +
                  rejected.map((r) => `${r.label} — ${r.reason}`).join(' · '),
              ]
            : []),
        ]
      : [];

  if (!isImplemented(targetCurve)) {
    /* V45 — the SENTENCE comes from the curve itself, because there are now two
     * ways to be unusable and they are different problems for the reader: a
     * shape nobody has built (`tilt`), and a shape this design stated whose
     * parameters never arrived. `describeTargetCurve` separates them; a fixed
     * "declared but not implemented" would have reported the second as the
     * first and sent someone looking in the wrong place. */
    notes.push(
      `The target curve cannot be evaluated — ${describeTargetCurve(targetCurve)} (A5e.2); ` +
        'every window and RMS figure here would have been evaluated against something else.',
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
    rejected,
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

/* UI-1 — the local `isImplementedCurve` that used to live here read
 * `c.type === 'flat'`, which was the whole truth until V45 gave the vocabulary
 * a second implemented shape. After V45 it was a SECOND OPINION about a
 * question `targetCurve.ts` already answers, and it answered it wrongly: a
 * working `bass-plateau` — depth stated, step measured — was reported as a
 * curve nothing could be judged against, on the very list whose window and RMS
 * figures had just been judged against it. Two implementations of one
 * question, exactly the family of bug `impedanceFloor.ts` and
 * `phaseAdmission.ts` were consolidated to end. It now asks the one function
 * that owns the vocabulary. */
