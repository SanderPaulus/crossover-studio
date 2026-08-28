/**
 * F4c — WHAT IS SEARCHED versus HOW IT IS SEARCHED.
 *
 * `NetOptimizeOptions` had 37 top-level keys when F4c classified them — 38
 * since V30 added `zFloorBarrier`, 39 since V31 added `rejectedTuneReport`,
 * and 41 since V33 added `zFloorBarrierSource` (choice) beside
 * `zFloorBarrierImpedance` (polish), and the count is asserted rather than
 * described (`choiceKeyGuard.test.ts`). Until F4c the v2 route set four of
 * them and inherited the other 33 verbatim from whatever the v1 chain happened
 * to build (`audit §2.2`). That is harmless while v1 also chooses the
 * candidates — the options and the candidate come from the same place, so they
 * agree by construction. It stops being harmless the moment v2 supplies its own
 * candidate: a v1 slope target, a v1 cage or a v1 pin would quietly pull that
 * candidate back toward the v1 choice, and nothing would say so.
 *
 * So every key is classified, once, here:
 *
 *   CHOICE  — decides WHAT is searched. Where the handover sits, which flank
 *             gets which order, which slope, whether the catalogue binds, what
 *             the goal is, which band is judged, what is forbidden outright.
 *             On the v2 route these may only come from the candidate.
 *   GREY    — a weight that shapes the scalar, and therefore decides which part
 *             of the field the search ever visits (audit §6.4). Polish in form,
 *             choice in effect. On the v2 route these must be stated
 *             EXPLICITLY, even when the value stated is the one v1 would have
 *             passed — saying "inherited" beats inheriting silently.
 *   POLISH  — decides HOW the search runs inside a given choice: iteration
 *             count, smoothing of the error measure, numerical safety,
 *             instrumentation. These may be inherited.
 *
 * WHAT THIS FILE DOES NOT DO. It does not choose anything. In F4c the candidate
 * object is filled with exactly the values the v1 chain supplies today, so the
 * v2 route's behaviour is unchanged and `f4cRegression.test.ts` proves it on two
 * seeds. The whole delivery is that the values now cross the border NAMED
 * instead of riding along in a spread.
 *
 * THE LISTS ARE DATA, NOT DOCUMENTATION. `choiceKeyGuard.test.ts` reads them to
 * scan `engine2/` for a choice key arriving through a `tuneOptions` spread, and
 * `f4cCoverage.test.ts` asserts that the three lists together are exactly the
 * key set of `NetOptimizeOptions` — a key added upstream without a class fails
 * the build rather than defaulting to "inherit".
 */

import { AMP_FLOOR_BARRIER_WEIGHT, type NetOptimizeOptions } from '../../netOptimizer.ts';

/* ------------------------------------------------------------------ *
 * CHOICE — what is searched
 * ------------------------------------------------------------------ */

/**
 * Every key that decides WHAT is searched.
 *
 * Grouped by the question each one answers, because the grouping is the
 * argument: a reader who disagrees with a classification should be able to see
 * which question it was filed under.
 */
export const CHOICE_KEYS = [
  /* --- where the handover sits --- */
  'xoRange',
  'xoRangePairs',
  'xoFloorPairs',
  'xoPinHard',
  /* --- what shape each flank has --- */
  'acousticSlopes',
  'branchTargets',
  'staged',
  /* --- which curve is judged, and over what --- */
  'band',
  'ampTarget',
  'powerMetric',
  'phaseMetric',
  'angleData',
  /* --- what the topology IS --- */
  'midBranch',
  'solo',
  'soloSensitivityDb',
  'soloTargetLevelDb',
  /* --- whether the catalogue binds --- */
  'catalogSnap',
  'snapPrefs',
  /* --- what is forbidden outright --- */
  'rSourceDisqualifyOhm',
  'loadFloor',
  'ampMinLoadOhm',
  'zFloorStrict',
  /* …and whether that last one STEERS or only vetoes. `zFloorBarrier` is a
   * boolean about a barrier term, which looks like polish and is not: it
   * decides what the search calls good. With it off the tuner optimises a
   * network and is then asked whether the amplifier can drive it; with it on
   * the ohms are part of the answer it is looking for. Two different searches,
   * so a choice (casebook V30). */
  'zFloorBarrier',
  /* …and WHERE that steering is measured. V33, and it is a choice for the
   * same reason `band` is one: it names the band a requirement is judged over.
   * With the evaluation grid the search aims at the |Z| minimum above the
   * far-field span; with the measured sweep it aims at the one M-B/|Z|
   * actually enforces. Same weight, same term, two different searches — and
   * on casus 1 the difference was five candidates whose entire value tune the
   * gate refused for a dip the objective could not see (casebook V33). */
  'zFloorBarrierSource',
  'breakupGuard',
  'safety',
  'audit',
] as const;

export type ChoiceKey = (typeof CHOICE_KEYS)[number];

/**
 * The candidate, as far as the TUNER is concerned.
 *
 * A5d is the pre-design layer and F4d is what fills this from it; in F4c it is
 * filled from the chain settings the v1 route already carries. Deliberately a
 * `Pick` of the tuner's own option type rather than a parallel vocabulary: a
 * second set of names for the same knobs is a translation layer, and a
 * translation layer is where the two descriptions drift apart.
 */
export type CandidateChoices = Pick<NetOptimizeOptions, ChoiceKey>;

/* ------------------------------------------------------------------ *
 * GREY — weights that are choices in effect
 * ------------------------------------------------------------------ */

/**
 * Weights that shape the scalar and therefore steer which part of the field the
 * search visits (audit §6.4).
 *
 * They are not choices in FORM — none of them names a frequency, an order or a
 * topology — and that is exactly why they were never noticed: a weight looks
 * like a tuning detail right up to the point where it decides that the phase
 * answer beats the dissipation answer. Left inherited, a v2 candidate would be
 * judged by whatever balance the v1 UI happened to be showing.
 */
export const GREY_KEYS = [
  'phasePriority',
  'directivityWeight',
  'powerFoldWeight',
  'dissipationWeight',
  'costWeight',
] as const;

export type GreyKey = (typeof GREY_KEYS)[number];
export type GreyWeights = Pick<NetOptimizeOptions, GreyKey>;

/* ------------------------------------------------------------------ *
 * POLISH — how the search runs
 * ------------------------------------------------------------------ */

/**
 * Keys that decide HOW, inside a given choice. These may be inherited.
 *
 * `gateViolation`, `valueCeilings` and `valueSumCeilings` are here because the
 * v2 route has owned them since F2 — they are not inherited from anything, and
 * `run.ts` has always overwritten them.
 */
export const POLISH_KEYS = [
  'maxIterations',
  'errorSmoothOct',
  'onStage',
  'onGateEvaluated',
  'gateViolation',
  'valueCeilings',
  'valueSumCeilings',
  /* V31 — instrumentation, and the classification is the argument. It changes
   * no decision anywhere: the safety gate still rejects exactly what it
   * rejected, the seed is still what comes back. All it does is make the
   * rejected tune's metrics and parts readable, so a caller can report a
   * refusal instead of publishing a seed. A key that cannot alter an outcome
   * is not a choice about what is searched. */
  'rejectedTuneReport',
  /* V33 — the measurement the choice above names, handed over by the caller
   * that already holds it. Polish for the same reason `gateViolation` is: it
   * carries no decision. WHICH grid the barrier reads is
   * `zFloorBarrierSource`, a choice; what is ON that grid is the run's own
   * measured sweep, and restating it as a candidate value would put a second
   * copy of one measurement on the wire (the angleData argument, again). */
  'zFloorBarrierImpedance',
] as const;

export type PolishKey = (typeof POLISH_KEYS)[number];

/** What a v2 caller may still hand over as ordinary tuner options. */
export type InheritableTuneOptions = Omit<NetOptimizeOptions, ChoiceKey | GreyKey>;

/* ------------------------------------------------------------------ *
 * Fingerprint
 * ------------------------------------------------------------------ */

/**
 * The stated choices and weights, as a fingerprint ingredient.
 *
 * Only keys that are actually SET appear, and functions are recorded by
 * presence rather than by identity — `onStage` is a different closure on every
 * run and hashing it would make every run unique, which is the opposite of what
 * a fingerprint is for. Arrays and objects go in as-is; the ingredient is
 * digested afterwards.
 */
export function choicesKey(
  choices: Partial<CandidateChoices> | undefined,
  weights: Partial<GreyWeights> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (target: string, keys: readonly string[], src: Record<string, unknown> | undefined) => {
    const bag: Record<string, unknown> = {};
    for (const k of [...keys].sort()) {
      const v = src?.[k];
      if (v === undefined) continue;
      bag[k] = typeof v === 'function' ? 'set' : v;
    }
    out[target] = bag;
  };
  put('choices', CHOICE_KEYS, choices as Record<string, unknown> | undefined);
  put('weights', GREY_KEYS, weights as Record<string, unknown> | undefined);
  const grey = greyValues(choices);
  if (Object.keys(grey).length > 0) out.greyValues = grey;
  return out;
}

/* ------------------------------------------------------------------ *
 * GREY VALUES — numbers inside the tuner that a v2 choice switches on
 * ------------------------------------------------------------------ */

/**
 * Numbers that are not options and are not v2-derived, but that a stated
 * choice hands the search anyway.
 *
 * `GREY_KEYS` covers weights the caller can SET. This covers the other kind:
 * a constant that lives inside `netOptimizer.ts`, was tuned there for a
 * different purpose, and becomes load-bearing on the v2 route the moment a
 * candidate arms the choice that reads it. `AMP_FLOOR_BARRIER_WEIGHT` is the
 * first — 1200, tuned for the repair pass, and nothing has ever measured
 * whether that stiffness is right for a full search (casebook V30).
 *
 * It travels in the fingerprint WITH its provenance, not as a bare number.
 * Two runs that differ only in this weight must be distinguishable, and a
 * reader who meets it in a stamp must be able to tell an inherited constant
 * from a derived one — the confusion V21, V22 and V25 each ended up being
 * about. Recorded only when the choice that reads it is actually stated: an
 * unarmed barrier does not hand the search anything.
 */
export function greyValues(
  choices: Partial<CandidateChoices> | undefined,
): Record<string, { value: number; origin: string }> {
  const out: Record<string, { value: number; origin: string }> = {};
  if (choices?.zFloorBarrier === true) {
    out.zFloorBarrierWeight = {
      value: AMP_FLOOR_BARRIER_WEIGHT,
      origin:
        'overgenomen uit v1, niet v2-afgeleid — de stijfheid van de reparatiebarrière, daar ' +
        'gemeten voor een lokale reparatiepas en hier hergebruikt als zoekterm (V30)',
    };
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * F4d — the candidate's DECLARATION over the choice keys
 * ------------------------------------------------------------------ */

/**
 * WHY A DECLARATION AND NOT JUST A VALUE BAG.
 *
 * F4c stated ten of the twenty-five choice keys and named the other fifteen in
 * a note that began "still inherited from the v1 chain". That note was the
 * honest thing to write at the time and it is exactly what F4d has to remove —
 * but removing it by giving all fifteen a value is not possible, and pretending
 * otherwise would be worse than the note. Three of them do not HAVE a value on
 * a three-way handover design (the solo family), one is a repair-pass barrier
 * nobody sets up front (`xoPinHard`), two carry measurement arrays that are
 * already in the payload (`angleData`, `midBranch`), and one is computed inside
 * the design step out of the alignment it just chose (`branchTargets`).
 *
 * So a key is in exactly one of three states, and the state itself is the
 * declaration:
 *
 *   STATED    — the candidate carries a value. It wins over whatever the chain
 *               built, because the hook merges last.
 *   ABSENT    — the candidate declares that this key has no value on this
 *               design, WITH THE REASON. Different from undefined: undefined is
 *               indistinguishable from nobody having thought about it, which is
 *               the failure mode row 39 of the V26 table records.
 *   DELEGATED — the candidate declares that another named stage owns this key,
 *               WITH THE REASON. `branchTargets` is delegated to the design
 *               step because re-deriving it here would be a second
 *               implementation of chain logic, and two descriptions of one
 *               thing is how V21 happened.
 *
 * `choiceKeyGuard.test.ts` asserts that the three states together cover
 * `CHOICE_KEYS` exactly, with no key in two of them and none in none. That is
 * what makes "no choice is inherited any more" a claim the build can check
 * rather than a sentence in a commit message.
 */
export interface ChoiceDeclaration {
  /** Keys the candidate carries a value for. */
  stated: Partial<CandidateChoices>;
  /** Keys that have no value on this design, each with the reason. */
  absent: readonly { key: ChoiceKey; why: string }[];
  /** Keys another named stage owns, each with the stage and the reason. */
  delegated: readonly { key: ChoiceKey; to: string; why: string }[];
}

/** What a declaration says about the key set — the guard reads this. */
export interface DeclarationCoverage {
  /** Keys in no state at all. Non-empty means something is still inherited. */
  missing: ChoiceKey[];
  /** Keys claimed by more than one state. */
  duplicated: ChoiceKey[];
  complete: boolean;
}

export function declarationCoverage(d: ChoiceDeclaration): DeclarationCoverage {
  const seen = new Map<string, number>();
  const bump = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const k of Object.keys(d.stated)) bump(k);
  for (const a of d.absent) bump(a.key);
  for (const g of d.delegated) bump(g.key);
  const missing = CHOICE_KEYS.filter((k) => !seen.has(k));
  const duplicated = CHOICE_KEYS.filter((k) => (seen.get(k) ?? 0) > 1);
  return { missing, duplicated, complete: missing.length === 0 && duplicated.length === 0 };
}

/**
 * The declaration as a fingerprint ingredient.
 *
 * The REASONS travel too, and not for readability: a key that moves from
 * delegated to absent is a different run even when no value changed, because
 * something else is now deciding it. Values go through `choicesKey` so the two
 * halves are digested the same way.
 */
export function declarationKey(
  d: ChoiceDeclaration | undefined,
  weights: Partial<GreyWeights> | undefined,
): Record<string, unknown> {
  const base = choicesKey(d?.stated, weights);
  return {
    ...base,
    absent: [...(d?.absent ?? [])]
      .map((a) => [a.key, a.why] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
    delegated: [...(d?.delegated ?? [])]
      .map((g) => [g.key, g.to, g.why] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
  };
}
