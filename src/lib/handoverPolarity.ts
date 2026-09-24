/**
 * H-4b — THE TEXTBOOK POLARITY RULE ON THE HAND PATHS, and the signature of a
 * missing inversion in a network somebody drew.
 *
 * WHAT H-4 LEFT OPEN. `textbookComplementInverted` (`activeSide.ts`) is the one
 * home of the Linkwitz-Riley rule — LR2 asks for one inversion, LR4 does not —
 * and since H-4 three readers share it: the lean form's complement, the DSP
 * target block and the polarity arms. All three are places where the ENGINE
 * chooses. Where a PERSON chooses it was not read at all: picking LR2 in the
 * band form left the invert checkbox wherever the previous project had left it,
 * and a hand-drawn LR2 network on the Network tab got no rule and no warning.
 * The literature's most elementary rule was guaranteed exactly where nobody
 * needed reminding and absent where everybody does.
 *
 * TWO READINGS, AND NEITHER OF THEM FLIPS ANYTHING.
 *
 *   1. `handoverTextbook` — what the textbook asks of ONE handover, given the
 *      two flanks the designer drew. It FOLLOWS a new alignment choice in the
 *      form and it is overridable; a state that departs from it is printed
 *      beside the checkbox and never corrected (F0).
 *
 *   2. `reversedNullSignature` — on a drawn network, whether the REVERSED sum
 *      beats the normal one over a handover band by more than the phase
 *      argument's own unit of resolution. That is the classic reverse-null
 *      check, read as a number instead of as a curve a designer has to eyeball.
 *      It is a MESSAGE, never a silent flip of a network somebody drew.
 *
 * THE ALGEBRA LIVES HERE because two vocabularies need it and A3g says they may
 * not each grow their own: `polarityArms.ts` speaks in WAY NAMES (a shortlist
 * label says which drivers a builder solders reversed) and the app speaks in
 * the two CHECKBOXES of its adjustment fieldsets. Both are the same bits — the
 * RELATIVE polarity of each handover, accumulated upward from the lowest way,
 * which is the reference both `combineN` and `invertedWaysOf` sum against.
 *
 * NO ENGINE IMPORT: this is app-layer vocabulary that `engine2/` also reads,
 * and the toggle-regression scan lets only the UI entry points reach the other
 * way.
 */

import { handoverBandHz, nullMarginAtPhaseErrorDeg, textbookComplementInverted } from './activeSide.ts';
import { PHASE_ERROR_UNIT_DEG } from './bandMetrics.ts';
import type { FilterKind, HpLpSpec } from './filters.ts';

/** Versiestring — a behaviour change here is a version bump (A5e.5). */
export const HANDOVER_POLARITY_VERSION = 'handover-polarity/1.0';

/* ==================================================================== *
 * 1 — the algebra: relative handover bits <-> inverted ways
 * ==================================================================== */

/**
 * Relative-per-handover bits -> whether each way ABOVE the lowest is inverted.
 *
 * Way i+1 is inverted when an odd number of the handovers below it are. The
 * lowest way is the reference and never appears, because inverting every way
 * at once changes nothing a sum can hear.
 */
export function invertedFlagsOf(relative: readonly boolean[]): boolean[] {
  const out: boolean[] = [];
  let acc = false;
  for (let i = 0; i < relative.length; i++) {
    acc = acc !== (relative[i] ?? false);
    out.push(acc);
  }
  return out;
}

/**
 * The inverse: which handovers are relatively inverted, given which ways are.
 *
 * A round trip through both is the identity, and that is the claim the app
 * hangs on: it reads the checkboxes into handover bits, sets ONE of them to
 * what the textbook asks, and writes the bits back. The handover the designer
 * did not touch therefore keeps the relative polarity it had — which is the
 * whole reason this goes through the bits instead of through one checkbox.
 */
export function relativeBitsOf(invertedFlags: readonly boolean[]): boolean[] {
  const out: boolean[] = [];
  let prev = false;
  for (let i = 0; i < invertedFlags.length; i++) {
    const cur = invertedFlags[i] ?? false;
    out.push(cur !== prev);
    prev = cur;
  }
  return out;
}

/* ==================================================================== *
 * 2 — what the textbook asks of one handover the designer drew
 * ==================================================================== */

export interface HandoverTextbook {
  /** The alignment BOTH flanks share, or null when they do not share one. */
  alignment: { kind: FilterKind; order: 1 | 2 | 3 | 4 } | null;
  /** The relative polarity the textbook asks for; null without a shared alignment. */
  inverted: boolean | null;
  /** One line, always printable. */
  why: string;
}

/**
 * THE TEXTBOOK RULE APPLIED TO TWO DRAWN FLANKS.
 *
 * It answers only where there is a rule to answer with: BOTH flanks enabled,
 * the same kind and the same order. That is not pedantry — the rule is a
 * property of a MATCHED complementary pair (an LR of order 2m sums to an
 * all-pass with its own mirror and with nothing else), and a woofer low-pass at
 * LR4 against a mid high-pass at LR2 is not a pair any textbook speaks about.
 * Answering anyway would be the A3h failure in its purest form: the right
 * number, off the right page, about the wrong thing. So the answer is null and
 * the sentence says which half is missing (P4).
 *
 * `textbookComplementInverted` is READ, never re-derived: it is the one home of
 * this rule and H-4 already gave it three readers.
 */
export function handoverTextbook(lowerLp: HpLpSpec, upperHp: HpLpSpec): HandoverTextbook {
  if (!lowerLp.enabled || !upperHp.enabled) {
    const which = !lowerLp.enabled && !upperHp.enabled
      ? 'neither flank is'
      : !lowerLp.enabled
        ? 'the lower way’s low-pass is not'
        : 'the upper way’s high-pass is not';
    return {
      alignment: null,
      inverted: null,
      why:
        `No textbook polarity: ${which} enabled, so there is no complementary pair to state one for. ` +
        'Nothing here is a verdict about the polarity (P4).',
    };
  }
  if (lowerLp.kind !== upperHp.kind || lowerLp.order !== upperHp.order) {
    return {
      alignment: null,
      inverted: null,
      why:
        `No textbook polarity: the two flanks are ${lowerLp.kind}${lowerLp.order} and ` +
        `${upperHp.kind}${upperHp.order}. The rule is a property of a MATCHED complementary pair, ` +
        'and a mismatched one is not something the textbook speaks about (P4).',
    };
  }
  const alignment = { kind: lowerLp.kind, order: lowerLp.order };
  const inverted = textbookComplementInverted(alignment.kind, alignment.order);
  const name = `${alignment.kind}${alignment.order}`;
  return {
    alignment,
    inverted,
    why:
      alignment.kind !== 'LR'
        ? `${name} states no polarity rule — only Linkwitz-Riley does, and this pair reads normal polarity.`
        : inverted
          ? `${name} asks for ONE reversal: its halves sit 180° apart at the knee, so in phase they cancel there.`
          : `${name} asks for NO reversal: its halves sit 360° apart at the knee, so they are already in phase.`,
  };
}

/**
 * What to print beside an invert checkbox that departs from the textbook.
 *
 * Null when it agrees, and null when there IS no textbook answer — a state
 * cannot deviate from a rule nobody stated. Printed, never corrected: the
 * checkbox is the designer's, and Gravesen ships designs whose mid must be
 * reversed under an alignment that asks for no reversal.
 */
export function textbookDeviation(tb: HandoverTextbook, actualInverted: boolean): string | null {
  const st = textbookStanding(tb, actualInverted);
  return st.kind === 'departs' ? st.text : null;
}

/**
 * H-5 — WHERE A HANDOVER STANDS AGAINST THE TEXTBOOK, whichever way that is.
 *
 * ONE implementation and two readers, which is why `textbookDeviation` above is
 * now a thin wrapper over it (A3g: two functions answering nearly the same
 * question is exactly how two descriptions of one state come to disagree).
 *
 * WHY THE AGREEING CASE GOT A SENTENCE. Until H-5 the note was printed only on
 * a DEPARTURE, so a designer who followed the rule saw nothing and a designer
 * who had never heard of it saw nothing either — and after a successful follow
 * there is by definition no departure left, so the one moment the rule had just
 * MOVED a polarity was the one moment it said nothing. Sander stated on
 * 24-09-2026 that the rule may be deterministic only where it is said out loud.
 * It is still a MESSAGE and never a correction (F0/UI-2): the control stays the
 * designer's either way.
 */
export interface TextbookStanding {
  kind: 'follows' | 'departs' | 'none';
  /** The line to print; empty for `'none'`. */
  text: string;
}

export function textbookStanding(tb: HandoverTextbook, actualInverted: boolean): TextbookStanding {
  if (tb.inverted === null || tb.alignment === null) return { kind: 'none', text: '' };
  const name = `${tb.alignment.kind}${tb.alignment.order}`;
  if (tb.inverted === actualInverted) {
    return {
      kind: 'follows',
      text: tb.inverted
        ? `textbook for ${name} — it asks for a reversal here`
        : `textbook for ${name} — it asks for no reversal here`,
    };
  }
  return {
    kind: 'departs',
    text: tb.inverted
      ? `departs from textbook — ${name} asks for a reversal here`
      : `departs from textbook — ${name} asks for no reversal here`,
  };
}

/* ==================================================================== *
 * 2b — the follow: one alignment choice -> the new checkbox state
 * ==================================================================== */

/** One handover as the form draws it: the lower way's low-pass, the upper's high-pass. */
export interface HandoverBands {
  lowerLp: HpLpSpec;
  upperHp: HpLpSpec;
}

export interface FollowResult {
  /**
   * The relative polarity of every handover AFTER the follow, in the same
   * order. Unchanged handovers keep exactly the bit they had.
   */
  relative: boolean[];
  /** Whether anything moved at all. */
  changed: boolean;
  /** The handovers that moved, by index, for the sentence beside the box. */
  moved: number[];
}

/**
 * THE FOLLOW, AS A VALUE.
 *
 * A handover whose ALIGNMENT the designer just changed takes the textbook
 * relative polarity; every other handover keeps the bit it had. What that does
 * to the two checkboxes is arithmetic the caller runs afterwards
 * (`invertedFlagsOf`), which is the point of doing it on the bits: setting one
 * box to satisfy one rule silently flips the handover above it, and this
 * cannot.
 *
 * It is a FUNCTION and not a sequence of `setState` calls for the reason UI-1
 * paid for one floor down: the layer between a rule and the app state had no
 * test and did the wrong thing for months. Everything here is decidable from
 * the arguments, so it is decided here.
 *
 * `touched` is what the CALLER observed change — the form knows which control
 * the designer moved, and this function does not guess. A touched handover
 * whose flanks state no rule (mismatched, disabled) is left alone: there is
 * nothing to follow (P4).
 */
export function followTextbookOnAlignmentChange(
  relative: readonly boolean[],
  bands: readonly HandoverBands[],
  touched: readonly number[],
): FollowResult {
  const out = [...relative];
  const moved: number[] = [];
  for (const i of touched) {
    const b = bands[i];
    if (!b || i < 0 || i >= out.length) continue;
    const tb = handoverTextbook(b.lowerLp, b.upperHp);
    if (tb.inverted === null || out[i] === tb.inverted) continue;
    out[i] = tb.inverted;
    moved.push(i);
  }
  return { relative: out, changed: moved.length > 0, moved };
}

/**
 * WHICH HANDOVER A BAND BELONGS TO, N-way-agnostically.
 *
 * A way's LOW-PASS hands over upward and its HIGH-PASS downward, so way `w`
 * (0 = lowest) owns handover `w` through its low-pass and handover `w - 1`
 * through its high-pass. Returns the handovers that exist; the lowest way's
 * high-pass and the highest way's low-pass belong to no handover at all and
 * yield nothing.
 */
export function handoversOfBand(
  wayIndex: number,
  which: 'hp' | 'lp',
  handoverCount: number,
): number[] {
  const i = which === 'lp' ? wayIndex : wayIndex - 1;
  return i >= 0 && i < handoverCount ? [i] : [];
}

/* ==================================================================== *
 * 3 — the signature of a missing inversion in a drawn network
 * ==================================================================== */

/**
 * THE MARGIN BEYOND WHICH THE REVERSED SUM WINNING MEANS SOMETHING, dB.
 *
 * DERIVED from `PHASE_ERROR_UNIT_DEG` through the null-margin geometry
 * `activeSide.ts` already owns (`nullMarginAtPhaseErrorDeg`): the null margin
 * two branches produce one unit of phase error PAST the 90° tie, where
 * reversing starts to help. Below it the two polarities are, in the words of
 * the objective that judges phase everywhere else in this engine, not
 * separated — and a strip that shouted on a pair 91° apart would be shouting
 * about a mediocre alignment, not about a missing inversion.
 *
 * It is a READING THRESHOLD and not a requirement: nothing is refused on it,
 * nothing is preferred by it, and what it decides is whether a sentence is
 * printed.
 */
export const REVERSED_NULL_MARGIN_DB = Math.abs(nullMarginAtPhaseErrorDeg(PHASE_ERROR_UNIT_DEG));

export interface NullSignatureInput {
  pairLabel: string;
  freq: readonly number[];
  /** The sum as drawn, dB. */
  sumDb: readonly number[];
  /** The same sum with ONE way of this handover reversed, dB. */
  reversedDb: readonly number[];
  /** The acoustic crossing this pair hands over at, Hz. */
  centreHz: number;
  /** What the textbook asks here, when it asks anything — for the sentence. */
  textbook?: HandoverTextbook;
}

export interface NullSignature {
  pairLabel: string;
  bandHz: [number, number];
  points: number;
  /**
   * mean(sum − reversed) over the band, dB. POSITIVE means the drawn polarity
   * sums better; negative means reversing wins. Null when the band holds no
   * grid point — never a zero, which would read as a tie (F0).
   */
  marginDb: number | null;
  /** Whether that is decisive enough to say anything. */
  signature: boolean;
  /** The line the strip prints; null when there is nothing to say. */
  text: string | null;
}

/**
 * THE REVERSE-NULL CHECK AS A NUMBER.
 *
 * The app has drawn both curves since long before this — "Combined, tweeter
 * inverted (null check M-T)" and its W-M twin — and left the reading to the
 * eye. This is the same two curves, averaged over the handover band the rest of
 * the engine uses (`handoverBandHz`, ±half an octave, the band the active
 * side's own fit runs on), against a margin derived from the phase unit.
 *
 * Deliberately whole-system curves rather than a pair-only sum: away from its
 * own handover the third way contributes almost nothing, which is the same
 * approximation the two null-check curves have always made and the same one
 * their labels already claim. Reading them here keeps one pair of curves and
 * one number rather than a second sum nobody can point at on the chart (A3g).
 */
export function reversedNullSignature(input: NullSignatureInput): NullSignature {
  const { pairLabel, freq, sumDb, reversedDb, centreHz, textbook } = input;
  const bandHz = handoverBandHz(centreHz);
  let acc = 0;
  let n = 0;
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i];
    if (f < bandHz[0] || f > bandHz[1]) continue;
    const a = sumDb[i];
    const b = reversedDb[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    acc += a - b;
    n++;
  }
  if (n === 0) {
    return { pairLabel, bandHz, points: 0, marginDb: null, signature: false, text: null };
  }
  const marginDb = acc / n;
  const signature = marginDb < -REVERSED_NULL_MARGIN_DB;
  if (!signature) return { pairLabel, bandHz, points: n, marginDb, signature, text: null };
  const asked =
    textbook?.inverted === true
      ? ` The alignment you drew (${textbook.alignment!.kind}${textbook.alignment!.order}) asks for that reversal.`
      : textbook?.inverted === false
        ? ` The alignment you drew (${textbook.alignment!.kind}${textbook.alignment!.order}) asks for NO reversal, so this is the ` +
          'acoustic answer departing from the textbook one — which is what measured drivers on a real baffle do.'
        : '';
  return {
    pairLabel,
    bandHz,
    points: n,
    marginDb,
    signature,
    text:
      `${pairLabel}: reversing one way of this handover sums ${(-marginDb).toFixed(1)} dB BETTER over ` +
      `${bandHz[0].toFixed(0)}–${bandHz[1].toFixed(0)} Hz — the signature of a missing inversion at ` +
      `${centreHz.toFixed(0)} Hz.${asked} Read against ${REVERSED_NULL_MARGIN_DB.toFixed(2)} dB, one unit of ` +
      'phase error past the tie where reversing starts to help. Nothing was changed: the polarity is yours.',
  };
}
