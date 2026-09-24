/**
 * E-2 — THE FIELD MODE: exploration or full.
 *
 * A v2 run in the browser takes hours — ten to thirty minutes per candidate,
 * twenty and more candidates in a field — and for anyone but the designer who
 * built the engine that reads as "the app does nothing". The exploration is
 * the answer: a SMALLER FIELD, not a looser search. Three things and nothing
 * else distinguish it from the full field (`candidates.ts`, E-2):
 *
 *   · a chain budget of `EXPLORATION_CHAIN_BUDGET` instead of steps^pairs;
 *   · positions laid CENTRE-FIRST — the geometric centre of each window first,
 *     the same reference crossing the order derivation reads its demands at
 *     (`candidateField.ts`), then outward one spacing at a time;
 *   · ONE alignment per handover — the stated order where the derivation
 *     admits it, else the steepest admitted order.
 *
 * The requirements, the gates, the budgets, the seed, the tuner and every
 * judgement are the SAME in both modes. What the shortlist of an exploration
 * says is "here is the middle of the field"; what it offers is the full field
 * as the next step. Both policies travel in the field's parameters and hence
 * in the run fingerprint, so an exploration and a full field over the same
 * windows never stamp alike.
 *
 * The full mode passes NO policy at all — absent is the field it always was,
 * byte for byte (`candidates.ts` records a policy only when stated), which is
 * what keeps every recorded run fingerprint reproducible.
 */

import { EXPLORATION_CHAIN_BUDGET } from '../constants.ts';
import type {
  AlignmentPolicy,
  CandidateCrossing,
  CandidateField,
  PositionPolicy,
} from './candidates.ts';
import type { PolarityArmPolicy, PolarityMargin } from './polarityArms.ts';

export type FieldMode = 'exploration' | 'full';

export const FIELD_MODES: readonly FieldMode[] = ['exploration', 'full'];

/**
 * H-5 — THE STATED RUN CHOICE on the polarity arms.
 *
 * `'textbook'` (the default) states the polarity of EVERY candidate from the
 * one home of the rule and builds no mirror: the design step is bound and never
 * settles polarity on an internal tie-break over ideal filters. `'both'` is
 * H-4/H-4b unchanged — the mirrored arm beside the textbook one, gated in an
 * exploration by the single-driver guarantee plus the pre-design phase reading,
 * unconditional in the full field.
 *
 * WHY THE MIRROR SURVIVES AS A CHOICE AND WAS NOT DELETED. M-5 measured on
 * casus 1b at 1947.9 Hz that ONLY the mirrored arm delivers — the textbook arm
 * falls on M-C — and at 2186.5 Hz, 240 Hz away on the same casus, that it is
 * exactly the other way round. A default that never builds the mirror is a
 * default that would have missed the first of those; a rule that always builds
 * it doubles every exploration. The choice keeps that measurement repeatable
 * without charging every run for it.
 */
export type PolarityArmsChoice = 'textbook' | 'both';

export const POLARITY_ARMS_CHOICES: readonly PolarityArmsChoice[] = ['textbook', 'both'];

/**
 * The choice a stored string names. Empty or unknown = TEXTBOOK: a project that
 * never chose gets the deterministic rule, and the shortlist says which arms
 * ran either way. Same shape and same reason as `fieldModeOf`.
 */
export function polarityArmsChoiceOf(raw: string | null | undefined): PolarityArmsChoice {
  return raw === 'both' ? 'both' : 'textbook';
}

/** The one line the run notes and the settings panel both print. */
export function describePolarityArmsChoice(choice: PolarityArmsChoice): string {
  return choice === 'both'
    ? 'Polarity arms: BOTH. Beside the textbook arm the mirrored one is designed, tuned and judged ' +
        'in its own right — an exploration runs the single-driver reversal unconditionally and any ' +
        'further handover the pre-design phase reading leaves open; the full field runs every ' +
        'configuration. The run count multiplies rather than adds (H-4/H-4b).'
    : 'Polarity arms: TEXTBOOK (the default). Every candidate is designed at the polarity its ' +
        'alignments ask for — LR2 one reversal, LR4 none — and no mirrored arm is built. State ' +
        '"both" to build them beside it (H-5).';
}

/**
 * The mode a stored string names. Empty or unknown = EXPLORATION: a project
 * that never chose is a project whose designer has not yet asked for hours,
 * and the shortlist says which mode made it either way.
 */
export function fieldModeOf(raw: string | null | undefined): FieldMode {
  return raw === 'full' ? 'full' : 'exploration';
}

/** The slice of a `CandidateFieldRequest` the mode decides. */
export interface FieldModeSettings {
  chainBudget: number;
  positionPolicy?: PositionPolicy;
  alignmentPolicy?: AlignmentPolicy;
  /**
   * H-4 — the polarity arms. Present only when this run has a per-handover
   * reading to decide on: without one the key is absent and the field is the
   * field it always was, polarity enumerated inside the design step (P2).
   */
  polarityArms?: PolarityArmPolicy;
}

/**
 * What the mode hands the generator.
 *
 * `full` is the request the app has made since F4d — the designer's "steps
 * per axis" raised to the number of handovers, and no policy key at all.
 * `exploration` states the budget and both policies.
 */
export function fieldModeSettings(
  mode: FieldMode,
  full: { stepsPerAxis: number; pairs: number },
  /**
   * H-4 — the pre-design phase reading of one crossing's two polarity arms.
   *
   * ABSENT AND NO ARMS ARE SEEDED IN EITHER MODE, which is the pre-H-4 field
   * byte for byte: a caller that cannot read the responses cannot honestly say
   * what a mirrored arm is worth, and a full field that mirrored blindly would
   * double every run on a promise nobody measured. A caller that HAS the
   * responses supplies this and gets the arms in both modes.
   */
  polarityMarginFor?: (crossing: CandidateCrossing) => PolarityMargin,
  /**
   * H-5 — the stated run choice. ABSENT = NO POLICY AT ALL, which is the
   * pre-H-5 field byte for byte: the candidates carry no polarity and the
   * design step enumerates, exactly as every corpus in this casebook was
   * generated. The APP always states it (its default is `'textbook'`); the
   * casus fixtures deliberately do not — see their own pin and the reason
   * beside it.
   */
  arms?: PolarityArmsChoice,
): FieldModeSettings {
  const base =
    mode === 'exploration'
      ? {
          chainBudget: EXPLORATION_CHAIN_BUDGET,
          positionPolicy: 'centre-first' as PositionPolicy,
          alignmentPolicy: 'one' as AlignmentPolicy,
        }
      : { chainBudget: Math.max(1, Math.round(full.stepsPerAxis)) ** Math.max(1, full.pairs) };
  /* H-5 — THE TRIGGER IS THE STATED CHOICE AND NO LONGER THE READER.
   *
   * Until H-5 a caller that happened to HAVE a margin reader got polarity arms
   * and one that did not got none, so whether a field was deterministic
   * depended on an accident of plumbing. Now the choice decides and the reader
   * is data: absent choice = no policy = the pre-H-5 field, byte for byte. */
  if (arms === undefined) return base;
  /* THE ONE DIFFERENCE BETWEEN THE MODES ON THIS AXIS, and it only exists under
   * `'both'`. The full field runs both arms of every crossing, because that is
   * what "the full field" means; the exploration runs the mirrored arm only
   * where the pre-design phase reading says the phase argument does not decide
   * — a mirrored arm is a whole chain run, and doubling an exploration by
   * reflex would undo what E-2 bought. Under `'textbook'` neither applies:
   * nothing is mirrored in either mode. */
  return {
    ...base,
    polarityArms: {
      seed: arms === 'textbook' ? 'textbook' : mode === 'full' ? 'both' : 'margin',
      ...(polarityMarginFor ? { marginFor: polarityMarginFor } : {}),
      /* U-5's rule in both modes: a position the designer stated is not
       * something a run-size policy may answer on their behalf.
       *
       * H-5 — but NOT under `'textbook'`: there the designer stated the RULE,
       * and a stated position silently acquiring a mirror would answer a
       * question they had already answered. */
      statedAlways: arms === 'both',
      /* H-4b — THE EXPLORATION ALWAYS RUNS THE SINGLE-DRIVER REVERSAL.
       *
       * H-4 gated every mirrored arm on the pre-design phase reading, and
       * measured on the three-way demo that meant SIX runs and NOT ONE of them
       * mirrored — the reversed mid was never simulated at all. Sander stated
       * on 20-09-2026 that a three-way session must always simulate it, and the
       * literature agrees unconditionally where our margin does not: "try
       * both" has no clause about how far apart the ideal filters read.
       *
       * So two of the four configurations become unconditional and the margin
       * keeps the other two. That doubles an exploration rather than
       * quadrupling it, which is the price E-2 can carry; the full field is
       * unchanged, because `'both'` already ran everything. */
      guarantee: arms === 'both' && mode !== 'full' ? 'single-reversal' : 'none',
      why:
        arms === 'textbook'
          ? 'Textbook: every candidate is designed at the polarity its alignments ask for, and no ' +
            'mirrored arm is built (H-5).'
          : mode === 'full'
          ? 'Full field: both polarity arms on every handover of every candidate, the run count ' +
            'doubling per handover that has one.'
          : 'Exploration: the textbook arm and the SINGLE-DRIVER REVERSAL unconditionally (the mid ' +
            'of a three-way, the tweeter of a two-way — the move the literature names, H-4b), plus ' +
            'any further handover the pre-design phase reading leaves open at one unit of phase ' +
            'error. The full field runs every configuration regardless.',
    },
  };
}

/**
 * The mode a generated field was made in, read off its own parameters — so a
 * shortlist can say which mode made it without trusting a label beside it.
 */
export function fieldModeOfParameters(p: CandidateField['parameters']): FieldMode {
  return p.positionPolicy === 'centre-first' && p.alignmentPolicy === 'one' ? 'exploration' : 'full';
}
/** The one-line description a shortlist prints above its rows. */
export function describeFieldMode(field: CandidateField): string {
  const p = field.parameters;
  const mode = fieldModeOfParameters(p);
  /* U-5 — the DERIVED half, because that is what `derivedSize` counts. A
   * stated crossing is not a candidate the derivation offered and the mode did
   * not thin it, so counting it here produced "8 of 5 derived candidates" —
   * measured in the running app before it was written down. It is named in its
   * own clause instead. */
  const stated = p.statedSize ?? 0;
  /* H-4 — the MIRRORED arms are candidates too, and they are neither derived
   * nor stated: they are the other half of a candidate the derivation offered.
   * Counting them in `n` produced "44 of 22 derived candidates" — the same
   * sentence U-5 had to repair one clause over, so they get their own. */
  const mirrored = p.mirroredArms ?? 0;
  const n = field.candidates.length - stated - mirrored;
  const plus =
    (stated > 0
      ? ` Plus ${stated} crossing${stated === 1 ? '' : 's'} you stated, which the budget does not thin.`
      : '') +
    (mirrored > 0
      ? ` Plus ${mirrored} mirrored polarity arm${mirrored === 1 ? '' : 's'}: the same positions with a ` +
        'handover the other way round, designed and tuned in their own right and judged by the same ' +
        'gates (H-4).'
      : '');
  if (mode === 'exploration') {
    return (
      `Exploration field — ${n} of ${p.derivedSize} derived candidate${p.derivedSize === 1 ? '' : 's'}: ` +
      `chain budget ${p.chainBudget ?? 'none'}, positions centre-first (the window centre and its ` +
      'nearest neighbours), one alignment per handover, the same requirements as the full field.' +
      plus
    );
  }
  return (
    `Full field — ${n} candidate${n === 1 ? '' : 's'}` +
    (p.chainBudget !== null && p.derivedSize > p.chainBudget
      ? ` (${p.derivedSize} derived, thinned to the chain budget ${p.chainBudget})`
      : p.chainBudget !== null
        ? ` (chain budget ${p.chainBudget}, not reached)`
        : '') +
    ': positions spread over every window, every admitted order.' +
    plus
  );
}
