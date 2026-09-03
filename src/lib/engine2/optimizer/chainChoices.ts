/**
 * V41 — THE CHOICE KEYS THAT LIVE ONE LAYER ABOVE THE TUNER.
 *
 * WHY THIS FILE EXISTS, and it is a finding rather than a design.
 *
 * `choices.ts` classifies the 44 top-level keys of `NetOptimizeOptions` and
 * `choiceKeyGuard.test.ts` asserts that classification is COMPLETE: a key added
 * upstream lands in no list and breaks the build. That guarantee is real and it
 * stops exactly where `NetOptimizeOptions` stops. `Chain3Settings` — the layer
 * the candidate passes through BEFORE the tuner sees anything — is classified
 * nowhere, and V38 measured that two of its keys decide the TOPOLOGY on casus 1:
 *
 *   · `eqBands` — the only route by which `deriveTopology` can propose a trap on
 *     a measured breakup. The app states 2; the v2 fixture stated nothing, and
 *     absent means a silent NOUGHT rather than "no opinion" (the inverse of P4).
 *     Measured: with 2 the design step produces bands (woofer lowShelf 1159 Hz,
 *     mid peak 966 Hz, tweeter peaks 3216 and 4754 Hz), with 0 none at all, and
 *     no value tune can create one that the design step did not propose.
 *
 *   · `leanTargetDb` — the threshold below which per-branch synthesis declares
 *     the bare ladder good enough and buys no Zobel, no Fs trap and no
 *     top-octave hold. Until V41 it was not a key at all: the chain DERIVED it
 *     from `targets.rippleDb`, so a candidate could not state it however loudly
 *     it declared everything else. Measured over the whole field, 15 candidates
 *     × 3 branches: the bare ladder clears the derived 2.5 dB on 45 of 45 and
 *     the engine's own 0.5 dB on 0 of 45.
 *
 * SCOPE IS DELIBERATELY TWO KEYS AND NOT THIRTY-TWO. V39 is the entry that owns
 * the whole layer; this file owns the two keys a measurement condemned. A list
 * that grew to cover `Chain3Settings` on suspicion would be the opposite of the
 * lesson row 11 of the A3j table teaches — a classification changes when a
 * MEASUREMENT changes it. `chainDeclarationCoverage` therefore asserts coverage
 * of THIS list, and the list says out loud that it is a subset.
 *
 * THE CLASSES ARE THE SAME THREE `choices.ts` USES, one layer up:
 *
 *   CHOICE  — decides WHAT is searched. On the v2 route these may only come
 *             from the candidate.
 *   (no GREY, no POLISH here yet: both keys below are choices, and inventing
 *   empty lists for the other two classes would suggest a completeness this
 *   file explicitly does not claim.)
 */

import type { Chain3Settings } from '../../threeWayChain.ts';

/* ------------------------------------------------------------------ *
 * CHOICE — what is searched, at the chain layer
 * ------------------------------------------------------------------ */

/**
 * The chain-level keys a v2 candidate states.
 *
 * Both of them answer "what the topology IS", which is the same question
 * `midBranch` and the solo family answer inside `CHOICE_KEYS`. The difference
 * is only WHERE they are read: the design step and the synthesis step run
 * before the tuner exists, so a value that reaches the tuner arrives too late
 * to put a component in the network.
 */
export const CHAIN_CHOICE_KEYS = [
  /* --- how many corrections the design step may PROPOSE --- */
  'eqBands',
  /* --- how easily the synthesis step declines to BUILD one --- */
  'leanTargetDb',
  /* --- V51: whether the LOWEST way may carry LEVEL WORK at all ---
   *
   * The third key, and the first with an ABSENT state. A choice by the same
   * test as the two above — it decides what the TOPOLOGY may be: with `'none'`
   * the design step trims the lowest way by nothing and proposes no shelf pad
   * on it, and its synthesis places no L-pad, no top-octave hold and no shelf
   * pad. A value tune moves numbers between the parts those two steps chose
   * and never creates a resistor, so the decision is made before the tuner
   * exists — which is exactly why it lives in THIS list and not in
   * `choices.ts`.
   *
   * MEASURED AT V50 ON CASUS 1, which is why it is a key and not a remark: the
   * anchor is the mid, the woofer pair sits above it, and every delivered
   * design paid that surplus in a series resistor — 14 to 35 W in one part at
   * 100 W continuous, the axis no other requirement reaches. Whether that
   * surplus is paid in a resistor or left in the sum is a different
   * loudspeaker, not a different amount of polish.
   *
   * V51b — THE SAME KEY CARRIES A SECOND STATED STATE, `{ kind: 'series-r-max',
   * maxOhm }`: series resistance on the lowest way up to a stated TOTAL
   * (discrete R plus coil DCR) and no pad. The number travels inside the value
   * and not as a fourth key, on purpose: a mode without its maximum and a
   * maximum without its mode each mean nothing, and two keys that must agree
   * are a pair that can disagree. The list therefore stays at three. What the
   * state does: the design step trims as before, the synthesis proposes one
   * PLAIN series R capped at the maximum (`synthesis.ts`), the tuner's box
   * holds the way's total — DCR first — under the same number (`bounds.ts`,
   * the `qes-series-r` shape), and the worker refuses what exceeds it
   * (`levelWork.ts`, `levelWorkVerdict`). Measured at V51 on casus 1: without
   * the resistor the impedance floor refused thirteen of fifteen candidates —
   * the pad was doing the floor's work as well as the level's. */
  'lowestWayLevelWork',
] as const;

export type ChainChoiceKey = (typeof CHAIN_CHOICE_KEYS)[number];

/**
 * The candidate, as far as the CHAIN is concerned.
 *
 * A `Pick` of the chain's own settings type for the same reason
 * `CandidateChoices` is a `Pick` of the tuner's: a second set of names for one
 * knob is a translation layer, and a translation layer is where two
 * descriptions of one thing drift apart.
 */
export type ChainCandidateChoices = Pick<Chain3Settings, ChainChoiceKey>;

/**
 * What the candidate says about each chain-level choice key.
 *
 * Two states rather than three: neither key can be DELEGATED, because there is
 * no later stage that owns them — the design step and the synthesis step are
 * the stages, and both read their value at the moment they run. A key with no
 * value on this design is ABSENT with a reason, exactly as in `choices.ts`.
 */
export interface ChainChoiceDeclaration {
  /** Keys the candidate carries a value for. */
  stated: Partial<ChainCandidateChoices>;
  /** Keys that have no value on this design, each with the reason. */
  absent: readonly { key: ChainChoiceKey; why: string }[];
}

/** What a chain declaration says about the key set — the guard reads this. */
export interface ChainDeclarationCoverage {
  /** Keys in no state at all. Non-empty means something is still inherited. */
  missing: ChainChoiceKey[];
  /** Keys claimed by more than one state. */
  duplicated: ChainChoiceKey[];
  complete: boolean;
}

export function chainDeclarationCoverage(d: ChainChoiceDeclaration): ChainDeclarationCoverage {
  const seen = new Map<string, number>();
  const bump = (k: string) => seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const k of Object.keys(d.stated)) bump(k);
  for (const a of d.absent) bump(a.key);
  const missing = CHAIN_CHOICE_KEYS.filter((k) => !seen.has(k));
  const duplicated = CHAIN_CHOICE_KEYS.filter((k) => (seen.get(k) ?? 0) > 1);
  return { missing, duplicated, complete: missing.length === 0 && duplicated.length === 0 };
}

/**
 * The chain declaration as a fingerprint ingredient.
 *
 * The REASONS travel with the values, for the reason `declarationKey` gives:
 * a key that moves from stated to absent is a different run even when no
 * number changed, because something else is deciding it.
 *
 * FIELD-WIDE, NOT PER CANDIDATE. Both keys are properties of the run rather
 * than of one handover pair, so this ingredient rides with the run's tuning
 * identity rather than inside the candidate-field key. A reader who wants to
 * know which candidate was searched reads the field key; a reader who wants to
 * know what the design step was allowed to build reads this one.
 */
export function chainDeclarationKey(d: ChainChoiceDeclaration | undefined): Record<string, unknown> {
  const bag: Record<string, unknown> = {};
  for (const k of [...CHAIN_CHOICE_KEYS].sort()) {
    const v = d?.stated?.[k];
    if (v === undefined) continue;
    bag[k] = v;
  }
  return {
    chainChoices: bag,
    chainAbsent: [...(d?.absent ?? [])]
      .map((a) => [a.key, a.why] as const)
      .sort((x, y) => (x[0] < y[0] ? -1 : 1)),
  };
}

/**
 * Apply a chain declaration to the settings of a chain input.
 *
 * The V34 shape (`withDeclaredSourceLimit`), one layer wider: a run WITHOUT a
 * declaration is returned unchanged, and that identity is what keeps every
 * non-v2 caller byte-identical. A stated key overwrites whatever the chain
 * settings carried; a key the candidate declares ABSENT is left exactly as it
 * was, because absent here means "this design has no opinion", not "set it to
 * nothing" — the two keys behave differently on an empty value (`eqBands`
 * unstated is a silent nought, `leanTargetDb` unstated is the derivation from
 * `targets`) and inventing one meaning for both would hide that.
 */
export function withDeclaredChainChoices<I extends { settings: Partial<ChainCandidateChoices> }>(
  input: I,
  declaration: ChainChoiceDeclaration | undefined,
): I {
  if (!declaration) return input;
  const stated: Partial<ChainCandidateChoices> = {};
  for (const k of CHAIN_CHOICE_KEYS) {
    const v = declaration.stated[k];
    if (v !== undefined) (stated as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(stated).length === 0) return input;
  return { ...input, settings: { ...input.settings, ...stated } };
}
