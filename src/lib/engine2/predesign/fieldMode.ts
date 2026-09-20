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
): FieldModeSettings {
  const base =
    mode === 'exploration'
      ? {
          chainBudget: EXPLORATION_CHAIN_BUDGET,
          positionPolicy: 'centre-first' as PositionPolicy,
          alignmentPolicy: 'one' as AlignmentPolicy,
        }
      : { chainBudget: Math.max(1, Math.round(full.stepsPerAxis)) ** Math.max(1, full.pairs) };
  if (!polarityMarginFor) return base;
  /* THE ONE DIFFERENCE BETWEEN THE MODES ON THIS AXIS. The full field runs both
   * arms of every crossing, because that is what "the full field" means; the
   * exploration runs the mirrored arm only where the pre-design phase reading
   * says the phase argument does not decide — a mirrored arm is a whole chain
   * run, and doubling an exploration by reflex would undo what E-2 bought. */
  return {
    ...base,
    polarityArms: {
      seed: mode === 'full' ? 'both' : 'margin',
      marginFor: polarityMarginFor,
      /* U-5's rule in both modes: a position the designer stated is not
       * something a run-size policy may answer on their behalf. */
      statedAlways: true,
      why:
        mode === 'full'
          ? 'Full field: both polarity arms on every handover of every candidate, the run count ' +
            'doubling per handover that has one.'
          : 'Exploration: the mirrored arm only where the pre-design phase reading leaves the ' +
            'choice open — one unit of phase error between the two arms. The full field runs ' +
            'both regardless.',
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
