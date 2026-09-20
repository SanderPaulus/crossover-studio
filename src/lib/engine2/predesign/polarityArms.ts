/**
 * H-4 — POLARITY AS A DESIGNED-OUT ARM, NOT A PRE-CHOICE.
 *
 * WHAT WAS THERE BEFORE, AND WHAT IS WRONG WITH IT. Both design steps settle
 * polarity by ENUMERATION on pure filter maths: `designThreeWay` scores all
 * four mid × tweeter combinations at the candidate knees and keeps the best
 * `fx`; `optimizeVirtualFilters` descends every structure twice, at the seed's
 * polarity and at its mirror, and keeps the better one. That is a tie-break
 * INSIDE one candidate, decided on IDEAL filters applied to the measured
 * responses — no ladder, no driver impedance, no synthesis, no component tune.
 * Whatever loses it is never built, never judged by a gate, and never appears
 * in a shortlist a designer can read.
 *
 * H-4 measured what that tie-break does (see the entry). On casus 1's whole
 * field the design step chose TEXTBOOK polarity on every candidate and on both
 * handovers — eleven of eleven — and the mirrored arms scored 1.19× to 3.05×
 * worse on the same objective. So the heuristic never departs from textbook on
 * this casus: as a decision it is a dead branch, and its only visible effect is
 * that the other arm does not exist.
 *
 * WHAT THIS MODULE DOES. It turns the loser into a CANDIDATE. At the same
 * position, in its own topology class (the diversity key has carried polarity
 * since A5e.1 — "an inverted midrange is not a variation on a non-inverted
 * one"), fully designed, synthesised and tuned against its own tilted phase
 * targets, and judged by the same gates as every other candidate. The
 * shortlist shows which arm a row is, and the table decides.
 *
 * FOUR RULES, and each of them is a decision rather than a convenience.
 *
 * 1. POLARITY IS PER HANDOVER, NOT PER WAY. What a sum can hear is the
 *    RELATIVE polarity across a handover; inverting every way at once changes
 *    nothing. So the arms are enumerated over the handovers and translated to
 *    inverted WAYS at the end, with the lowest way as the reference. That is
 *    the N-way-agnostic form: nothing here counts to three.
 *
 * 2. ONLY PASSIVE HANDOVERS, AND BY CONSTRUCTION. On a hybrid the active
 *    side's handover is realised in a processor: its polarity is class A (H-1
 *    decided that, and the cabinet measurement — not this data — settles it).
 *    This module needs no rule for it, because the field it expands never
 *    contains that handover: the app drops it by the lower way's name before
 *    `buildCandidateField` runs (H-2). `polarityArmsGuard` asserts exactly
 *    that rather than trusting it.
 *
 * 3. THE EXPLORATION SEEDS BOTH ARMS ONLY WHERE THE PHASE ARGUMENT IS CLOSE,
 *    AND SAYS SO. A mirrored arm is a whole chain run — tens of minutes — so
 *    doubling an exploration by reflex would undo what E-2 bought. The reading
 *    is the mean pair phase error of the two arms at the handover, on ideal
 *    filters, the same definition `designThreeWay`'s pair score and the phase
 *    panel use; the margin is ONE UNIT OF PHASE ERROR
 *    (`PHASE_ERROR_UNIT_DEG`), the scale five search objectives already divide
 *    by. Within it the phase argument does not decide and both arms are run.
 *    The FULL field always runs both: it is the field that promises to have
 *    looked everywhere.
 *
 * 4. A STATED POSITION GETS BOTH ARMS UNCONDITIONALLY. U-5's rule, one axis
 *    over: a position the designer asked for is not something the budget or a
 *    margin may answer on their behalf.
 *
 * WHAT THIS MODULE IS NOT. It states no threshold anybody is judged on, it
 * ranks nothing, and it never picks an arm. The margin decides how big the
 * exploration is — a run-size policy of exactly the kind `EXPLORATION_CHAIN_BUDGET`
 * already is — and every arm it emits is judged by the ordinary gates.
 */

import { PHASE_ERROR_UNIT_DEG } from '../../bandMetrics.ts';
import { textbookComplementInverted } from '../../activeSide.ts';
import { applyTransfer, combine, type GriddedResponse, type TweeterAdjust } from '../../dsp.ts';
import { evalDriverFilter, type FilterKind } from '../../filters.ts';
import { computeIntegration } from '../../integration.ts';
import type { CandidateCrossing, CandidateField, GeneratedCandidate } from './candidates.ts';

/** Version of this derivation — bumped whenever what it emits changes. */
export const POLARITY_ARMS_VERSION = 'polarity-arms/1.0';

/**
 * The margin inside which the phase argument does not decide, in degrees.
 *
 * DERIVED, not chosen: it is one unit of phase error on the scale every search
 * objective in this engine already uses (`PHASE_ERROR_UNIT_DEG`, the number
 * five objectives divide their mean pair phase error by before squaring it).
 * Two arms closer together than one such unit are, in the words of the
 * objective that will judge them, not separated by their phase at all.
 *
 * It is a RUN-SIZE POLICY and not a requirement: nothing is refused on it,
 * nothing is preferred by it, and what it decides is how many chains an
 * exploration runs. The full field ignores it.
 */
export const POLARITY_ARM_MARGIN_DEG = PHASE_ERROR_UNIT_DEG;

/** The mark a shortlist label carries for an inverted way. */
export const POLARITY_MARK = '⌀';

/** Which ways a candidate inverts, and which arm that makes it. */
export interface CandidatePolarity {
  /**
   * The ways inverted relative to the LOWEST way of this field. Sorted, so two
   * descriptions of one arm are one string wherever it is keyed. Empty is a
   * legitimate value and means "every way in phase as measured" — it is the
   * textbook arm of an all-LR4 candidate, not an absence.
   */
  invertedWays: readonly string[];
  /** Whether this is the textbook arm or its mirror on at least one handover. */
  arm: 'textbook' | 'mirror';
  /** Per handover, index-aligned with the candidate's crossings: is the upper
   *  way inverted relative to the lower across it? */
  relativeInverted: readonly boolean[];
  /** The one line a shortlist row and the entry can both read. */
  why: string;
}

/**
 * The textbook relative polarity of one handover.
 *
 * READ, never re-derived: `textbookComplementInverted` is the one home of this
 * rule and the lean form's complement already reads it (H-2b). An even-order
 * Linkwitz-Riley whose halves are 360°/order apart needs the inversion at
 * order 2 and not at order 4; nothing else in the library asks for one.
 */
export function textbookRelativeInverted(alignment: { kind: string; order: number }): boolean {
  return textbookComplementInverted(alignment.kind as FilterKind, alignment.order as 1 | 2 | 3 | 4);
}

/**
 * Relative-per-handover bits → the ways that are inverted.
 *
 * The lowest way is the reference and never appears; way i+1 is inverted when
 * an odd number of handovers below it are. Names come from the crossings, so
 * this is as N-way-agnostic as the field that produced them.
 */
export function invertedWaysOf(
  crossings: readonly CandidateCrossing[],
  relative: readonly boolean[],
): string[] {
  const out: string[] = [];
  let acc = false;
  for (let i = 0; i < crossings.length; i++) {
    acc = acc !== (relative[i] ?? false);
    if (acc) out.push(crossings[i].upper);
  }
  return out.sort();
}

/** The label suffix an arm adds — empty for a candidate that inverts nothing. */
export function polarityLabel(invertedWays: readonly string[]): string {
  if (invertedWays.length === 0) return '';
  return ` · ${invertedWays.map((w) => `${w} ${POLARITY_MARK}`).join(' + ')}`;
}

/** What one handover's two arms read, before anything is designed. */
export interface PolarityMargin {
  pairLabel: string;
  /** Mean pair phase error over the overlap window, textbook arm, degrees. */
  textbookDeg: number | null;
  /** The same for the mirrored arm. */
  mirrorDeg: number | null;
  /** |textbook − mirror|; null when either could not be read. */
  marginDeg: number | null;
  /** Whether the exploration seeds the mirrored arm on this handover. */
  seedMirror: boolean;
  /** The sentence the run notes print. */
  why: string;
}

export interface PolarityMarginInput {
  pairLabel: string;
  /** The lower way's measured response, banded on the evaluation grid. */
  lower: GriddedResponse;
  /** The upper way's, on the same grid. */
  upper: GriddedResponse;
  /** The upper way's acoustic-centre adjustment, as the sum applies it. */
  adjust: TweeterAdjust;
  /** The handover this reading is taken at, Hz. */
  hz: number;
  alignment: { kind: string; order: number };
}

/**
 * THE PRE-DESIGN PHASE READING of one handover's two polarity arms.
 *
 * Ideal alignment filters on the two measured ways, summed the way the design
 * step sums them, and the mean |relative phase| over the points inside the
 * overlap window — `computeIntegration`, the same definition the design step's
 * pair score and the phase panel read, so there is no second opinion about
 * what "phase error" means here.
 *
 * IT IS A READING AND NOT A VERDICT. It knows nothing about the ladder, the
 * driver impedance or what the tune will do, which is exactly why what it
 * decides is the SIZE of an exploration and never which arm is better. Null on
 * either arm when the two ways never overlap inside the window: no overlap is
 * nothing to integrate, and a zero there would read as perfect agreement (F0).
 */
export function polarityMargin(input: PolarityMarginInput): PolarityMargin {
  const { pairLabel, lower, upper, adjust, hz, alignment } = input;
  const kind = alignment.kind as FilterKind;
  const order = alignment.order as 1 | 2 | 3 | 4;
  const lp = { enabled: true, kind, order, freq: hz };
  const hp = { enabled: true, kind, order, freq: hz };
  const lo = applyTransfer(lower, evalDriverFilter({ gainDb: 0, hp: { enabled: false, kind, order, freq: hz }, lp, eq: [] }, lower.freq));
  const hi = applyTransfer(upper, evalDriverFilter({ gainDb: 0, hp, lp: { enabled: false, kind, order, freq: hz }, eq: [] }, upper.freq));
  const read = (inverted: boolean): number | null => {
    const r = combine(lo, hi, { ...adjust, inverted });
    const integ = computeIntegration(r);
    let sum = 0;
    let n = 0;
    for (const pt of integ.points) {
      if (pt.cls === null) continue;
      sum += pt.phaseErrorDeg;
      n++;
    }
    return n > 0 ? sum / n : null;
  };
  const tbInv = textbookRelativeInverted(alignment);
  const textbookDeg = read(tbInv);
  const mirrorDeg = read(!tbInv);
  const marginDeg =
    textbookDeg === null || mirrorDeg === null ? null : Math.abs(textbookDeg - mirrorDeg);
  const seedMirror = marginDeg !== null && marginDeg <= POLARITY_ARM_MARGIN_DEG;
  const why =
    marginDeg === null
      ? `${pairLabel}: the two ways never overlap inside the window at ${hz.toFixed(0)} Hz, so no ` +
        'pre-design phase reading could be taken and the exploration seeds the textbook arm only. ' +
        'That is a statement about the measurements, not about the polarity (P4).'
      : `${pairLabel}: mean pair phase error ${textbookDeg!.toFixed(1)}° textbook against ` +
        `${mirrorDeg!.toFixed(1)}° mirrored at ${hz.toFixed(0)} Hz — a margin of ` +
        `${marginDeg.toFixed(1)}° against one unit of phase error (${POLARITY_ARM_MARGIN_DEG}°), so the ` +
        (seedMirror
          ? 'phase argument does not decide and the exploration runs BOTH arms.'
          : 'exploration runs the textbook arm only. The full field runs both regardless.');
  return { pairLabel, textbookDeg, mirrorDeg, marginDeg, seedMirror, why };
}

/** One way as the sum sees it: its measured response and its adjustment. */
export interface PolarityBranch {
  response: GriddedResponse;
  /** The way's acoustic-centre adjustment RELATIVE TO THE LOWEST way, exactly
   *  as `combineN` applies it in the design step. */
  adjust: { offsetMm?: number; trimDb?: number };
}

/**
 * A per-crossing margin reader for a caller that has the branches.
 *
 * The ADJUSTMENT IS MADE RELATIVE between the two ways of the pair, because
 * that is what the pair sees: `combineN` applies each branch's adjustment
 * against the lowest way, and a pair two ways up therefore hands over on the
 * DIFFERENCE. The design step reads its own pair scores on branches that are
 * already adjusted (`pairPhase` combines them with a zero adjust for exactly
 * this reason); this arrives at the same place from the other side.
 *
 * A way with no response yields a reading of nulls with the missing way named,
 * never a zero and never a seeded arm: absence is not a verdict (P4).
 */
export function polarityMarginReader(branchOf: (driverId: string) => PolarityBranch | null) {
  return (crossing: CandidateCrossing): PolarityMargin => {
    const lo = branchOf(crossing.lower);
    const hi = branchOf(crossing.upper);
    if (!lo || !hi) {
      const missing = !lo ? crossing.lower : crossing.upper;
      return {
        pairLabel: crossing.pairLabel,
        textbookDeg: null,
        mirrorDeg: null,
        marginDeg: null,
        seedMirror: false,
        why:
          `${crossing.pairLabel}: no measured response for "${missing}", so no pre-design phase ` +
          'reading could be taken and only the textbook arm is seeded. That is a statement about ' +
          'the measurements, not about the polarity (P4).',
      };
    }
    return polarityMargin({
      pairLabel: crossing.pairLabel,
      lower: lo.response,
      upper: hi.response,
      adjust: {
        offsetMm: (hi.adjust.offsetMm ?? 0) - (lo.adjust.offsetMm ?? 0),
        trimDb: (hi.adjust.trimDb ?? 0) - (lo.adjust.trimDb ?? 0),
        inverted: false,
      },
      hz: crossing.hz,
      alignment: crossing.alignment,
    });
  };
}

/** Which handovers an expansion mirrors, and why it was asked to. */
export interface PolarityArmPolicy {
  /**
   * `'both'` mirrors every handover of every candidate — what the FULL field
   * asks for, because that is what "the full field" means. `'margin'` mirrors
   * a handover only where `marginFor` says the phase argument does not decide
   * — what the EXPLORATION asks for, because a mirrored arm is a whole chain
   * run and doubling an exploration by reflex would undo what E-2 bought.
   */
  seed: 'both' | 'margin';
  /**
   * The pre-design phase reading, taken PER CROSSING and not once per axis.
   *
   * Per crossing on purpose, and measured before it was written down: on casus
   * 1's woofer→mid axis the margin runs from 2.5° at 199 Hz to 22.5° at
   * 321 Hz — it crosses one unit of phase error twice inside one window. A
   * reading taken once at the window centre (the convention the ORDER
   * derivation states for its own demands) would answer for positions three
   * octaves of margin away from it, and this is the one place where that
   * resolution decides whether a design gets built at all.
   *
   * Optional even in `'both'` mode, where it changes nothing and is read only
   * so the run notes can say what the arms are worth before they are run.
   */
  marginFor?: (crossing: CandidateCrossing) => PolarityMargin;
  /** Whether a STATED candidate gets both arms regardless of the above (U-5). */
  statedAlways: boolean;
  /** What to print about the decision. */
  why: string;
}

/**
 * Every polarity arm ONE candidate stands for, textbook first.
 *
 * The enumeration is over the handovers the policy admits: with none it is the
 * textbook arm alone, with k it is 2^k arms. Textbook first is deliberate — a
 * scan table read top to bottom then starts from the design everyone expects.
 */
export function polarityArmsOf(
  crossings: readonly CandidateCrossing[],
  mirrorHandovers: readonly boolean[],
): CandidatePolarity[] {
  const textbook = crossings.map((x) => textbookRelativeInverted(x.alignment));
  const free: number[] = [];
  for (let i = 0; i < crossings.length; i++) if (mirrorHandovers[i]) free.push(i);
  const arms: CandidatePolarity[] = [];
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const rel = [...textbook];
    const flipped: string[] = [];
    for (let b = 0; b < free.length; b++) {
      if (mask & (1 << b)) {
        rel[free[b]] = !rel[free[b]];
        flipped.push(crossings[free[b]].pairLabel);
      }
    }
    const invertedWays = invertedWaysOf(crossings, rel);
    arms.push({
      invertedWays,
      arm: flipped.length === 0 ? 'textbook' : 'mirror',
      relativeInverted: rel,
      why:
        flipped.length === 0
          ? 'Textbook polarity: the relative polarity each alignment asks for on every handover (' +
            crossings.map((x, i) => `${x.pairLabel} ${textbook[i] ? 'inverted' : 'in phase'}`).join(', ') +
            ').'
          : `Mirrored polarity on ${flipped.join(' and ')} — the arm the design step's internal ` +
            'tie-break would have discarded, built and judged in its own right (H-4).',
    });
  }
  return arms;
}

/**
 * A field with its polarity arms.
 *
 * EVERY candidate keeps its own arm, including the textbook one, and every arm
 * carries the polarity EXPLICITLY — a candidate without a `polarity` field is
 * one whose design step still enumerates, and that is what an unexpanded field
 * is. So a policy that mirrors nothing returns the candidates unchanged, by
 * identity and not by luck: no key is written, no label moves, and
 * `candidateFieldKey` — and therefore every recorded run fingerprint —
 * reproduces byte for byte.
 */
export function expandPolarityArms(
  field: CandidateField,
  policy: PolarityArmPolicy,
): { field: CandidateField; notes: string[]; armsAdded: number; readings: PolarityMargin[] } {
  const out: GeneratedCandidate[] = [];
  const readings: PolarityMargin[] = [];
  const seen = new Set<string>();
  let added = 0;
  for (const c of field.candidates) {
    const mirror = c.crossings.map((x) => {
      /* Read whatever there is to read, in both modes: in `'both'` it costs a
       * pure filter evaluation and buys the run notes their numbers. */
      const m = policy.marginFor?.(x) ?? null;
      if (m) {
        const key = `${x.pairLabel}@${x.hz}`;
        if (!seen.has(key)) {
          seen.add(key);
          readings.push(m);
        }
      }
      /* U-5's rule, one axis over: a position the designer asked for gets both
       * arms whatever the margin said, because the margin is a run-size policy
       * and a stated position was not offered by a budget. */
      if (c.stated && policy.statedAlways) return true;
      if (policy.seed === 'both') return true;
      return m?.seedMirror === true;
    });
    if (!mirror.some(Boolean)) {
      out.push(c);
      continue;
    }
    for (const p of polarityArmsOf(c.crossings, mirror)) {
      if (p.arm === 'mirror') added++;
      out.push({
        ...c,
        label: `${c.label}${polarityLabel(p.invertedWays)}`,
        polarity: p,
        provenance: `${c.provenance} ${p.why}`,
      });
    }
  }
  const notes =
    added > 0
      ? [
          `Polarity arms: ${added} mirrored candidate${added === 1 ? '' : 's'} beside the ` +
            `${field.candidates.length} the field derived — ${field.candidates.length + added} runs ` +
            `in total, and THE CHAIN BUDGET DOES NOT BOUND THEM. It thins POSITIONS, and an arm is ` +
            'not a position: it is the other half of a position the derivation already offered, and ' +
            'the run count multiplies by two per handover that has one rather than adding. ' +
            `${policy.why} Each arm is designed, synthesised and tuned against its own phase targets ` +
            'and judged by the same gates; the shortlist marks it and the table decides (H-4).',
        ]
      : [
          `Polarity arms: none. ${policy.why} Every candidate keeps the textbook polarity of its ` +
            'alignment, which is what the design step would have chosen anyway — measured, not ' +
            'assumed (H-4).',
        ];
  return {
    field: {
      ...field,
      candidates: out,
      notes: [...field.notes, ...notes, ...readings.map((r) => r.why)],
      /* Spread, so a field that seeded nothing writes no key and stamps exactly
       * as it did before H-4 (the E-2 rule, one field over). */
      parameters: added > 0 ? { ...field.parameters, mirroredArms: added } : field.parameters,
    },
    notes,
    armsAdded: added,
    readings,
  };
}

/**
 * The three-way design step's vocabulary for one arm.
 *
 * POSITIONAL, not by name, and that is the point: `designThreeWay` designs for
 * three SLOTS (w, m, t) which are the field's handovers in order, so the
 * translation is arithmetic on the relative bits rather than a lookup in a set
 * of way names that a hybrid, a rename or a role mapping could make disagree.
 * The mid is inverted when the first handover is; the tweeter when an odd
 * number of the two below it are.
 */
export function statedPolarityForThreeWay(polarity: CandidatePolarity): {
  midInverted: boolean;
  tweeterInverted: boolean;
} {
  const rel = polarity.relativeInverted;
  const mid = rel[0] === true;
  return { midInverted: mid, tweeterInverted: mid !== (rel[1] === true) };
}

/**
 * The two-way design step's vocabulary: one bit, the upper way relative to the
 * lower, which is the single handover's own relative polarity.
 */
export function statedInvertedForTwoWay(polarity: CandidatePolarity): boolean {
  return polarity.relativeInverted[0] === true;
}
