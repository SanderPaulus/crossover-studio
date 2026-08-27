/**
 * F4c — WHAT IS SEARCHED versus HOW IT IS SEARCHED.
 *
 * `NetOptimizeOptions` has 37 top-level keys. Until F4c the v2 route set four
 * of them and inherited the other 33 verbatim from whatever the v1 chain
 * happened to build (`audit §2.2`). That is harmless while v1 also chooses the
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

import type { NetOptimizeOptions } from '../../netOptimizer.ts';

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
  return out;
}
