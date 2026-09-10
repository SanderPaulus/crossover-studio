/**
 * A5d — THE CANDIDATE GENERATOR. The thing the audit said v2 could not do.
 *
 * §6.1 of `docs/audit_engineV2_optimizerV1_grens.md` put it exactly: "v2 kan
 * vetoën en rapporteren. Het kan niet voorstellen." Everything this layer
 * derives from the measurements — the feasible windows, the recommended band,
 * the order derivation — stopped at the panel, while the candidates the search
 * actually ran came out of `crossover3Variants`, a v1 function that reads level
 * anchors and neighbourhoods of raw crossings. This module is the other half:
 * it turns those derivations into a FIELD of candidates a tuner can polish.
 *
 * FOUR RULES SHAPE THE FIELD, and each of them is a decision rather than an
 * implementation detail.
 *
 *  1. SPREAD, NOT CLUSTER. The positions cover the recommended band evenly in
 *     OCTAVE distance, not in hertz, and not by crowding around its middle. A
 *     field that samples the centre of a window finely and its edges not at all
 *     has already decided that the centre is better, which is precisely the
 *     judgement A5e.1 forbids this layer from making.
 *
 *  2. THE COUNT IS DERIVED. Two handovers closer together than the smoothing
 *     the acceptance judgement runs on produce designs that judgement cannot
 *     tell apart (`WINDOW_SMOOTHING_OCTAVES`, A5e.1), so that width is the
 *     finest spacing worth spending a chain on. The number of positions is what
 *     fits: `1 + floor(span / spacing)`. Not a constant, and it moves when the
 *     window moves — a narrow window gets fewer candidates because it HAS fewer
 *     distinguishable answers, which is information rather than a limitation.
 *
 *  3. THE ORDER COMES FROM THE DERIVATION (`flankOrder.ts`), and where the
 *     derivation admits several orders those are SEPARATE CANDIDATES. Never a
 *     weighted compromise between two orders — there is no such thing as order
 *     three-and-a-half, and `noWeights.test.ts` now scans this file too.
 *
 *  4. NOTHING LEAVES THE WINDOW. Ever. The relaxation ladder may widen a taste
 *     requirement later; it may not widen measurement validity, and neither may
 *     this. Positions are carved out of the A5d.3 window itself
 *     (`recommendedBand(...).windowHz`), so a candidate outside the window is
 *     not something this module declines to emit — it is something it cannot
 *     express.
 *
 * THE F3c EXCISION IS SUSPENDED (V28, open) — see `APPLY_BAND_EXCISIONS`. Until
 * F4d this module laid its positions across `recommendedBand(...).effectiveHz`,
 * the window MINUS the worst lobing zone. The zone that was subtracted turns
 * out to be a λ fraction on a single centre-to-centre distance
 * (`xoWindow.ts`), and V20 established that no such distance exists for a way
 * with N sources and that no λ fraction may steer anything. Suspending it
 * costs coverage of nothing: the whole window is allowed band, and every zone
 * that WOULD have been cut still travels with each candidate, named and
 * attributed, so the suspension is visible rather than silent.
 *
 * THE WINDOW IS RE-DERIVED PER ORDER, and that is the reason this takes an
 * `XoWindowInput` rather than a finished `XoWindowResult`. A5d.3's floor is
 * k·f_s with k falling as the flank steepens, so a second-order candidate and a
 * fourth-order candidate do not share a window. Handing this module one window
 * and then generating four orders inside it would put three of them under a
 * floor that was computed for someone else.
 *
 * N-WAY BY CONSTRUCTION: it takes a LIST of adjacent pairs and takes the
 * product over it. Nothing here counts to two or to three.
 *
 * PROVENANCE TRAVELS WITH EVERY CANDIDATE. Which window, which segment of the
 * recommended band, which position in it, which rule set the order — because a
 * shortlist row a designer cannot attribute is a row they cannot act on, and
 * because the whole argument for moving candidate generation here is that these
 * candidates can say where they came from and v1's could not.
 */

import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';
import { crossoverWindow, type XoWindowInput, type XoWindowResult } from './xoWindow.ts';
import { derivedPositionCount } from './positionCount.ts';
import { recommendedBand, type RecommendedBandResult } from './recommendedBand.ts';
import { formatEdge, roundEdge, takeoverFor } from './xoRangeAdvice.ts';
import type { PairOrderResult } from './flankOrder.ts';

/**
 * One entry of the alignment library the design step will enumerate.
 *
 * Passed in rather than declared here: which alignments exist is a property of
 * the design step, and a second list in this file would be a second opinion
 * about what can be built.
 */
export interface Alignment {
  kind: string;
  order: number;
}

/**
 * The alignment A5d.3 prefers when the library offers more than one at an
 * order: "Voorkeursvorm: symmetrische akoestische LR-flanken voor
 * fasetracking". A preference from the specification, not from this file.
 */
const PREFERRED_ALIGNMENT_KIND = 'LR';

/**
 * Whether a recommended-band excision may SHAPE the field, or only be reported.
 *
 * FALSE, and it is a decision of the F4d follow-up rather than a knob. F3c
 * subtracted "the worst lobing zone" from the band the positions are laid
 * across; that zone is `[0.5, 0.7] · c/d` on the single centre-to-centre
 * distance the pair was handed (`xoWindow.ts`), i.e. a λ fraction — and the
 * 0.5–0.7 stretch is precisely the trough of the non-monotone zone score V20
 * struck out. V20a: the vertical synthesis is the only lobing quantity a
 * judgement may hang on, and "geen poort, geen budget, geen shortlist-
 * criterium op een λ-fractie" is a standing prohibition. Choosing WHICH
 * candidates exist is that same decision one step earlier — `noWeights.test.ts`
 * already scans this file for exactly that reason.
 *
 * So the excision is suspended until casebook entry V28 decides it, and this
 * module lays its positions evenly across the whole A5d.3 window. It is typed
 * `boolean` rather than left as a literal so both branches below stay live
 * code: the day V28 rules the excision legitimate, this becomes `true` and
 * nothing else has to be rewritten.
 */
const APPLY_BAND_EXCISIONS: boolean = false;

/** Why the excision is not applied — the sentence every candidate carries. */
const EXCISION_SUSPENDED_BECAUSE =
  'SUSPENDED pending casebook entry V28. The zone is a λ fraction on one centre-to-centre ' +
  'distance, and V20a reserves every lobing judgement for the vertical synthesis; until V28 ' +
  'decides whether an excision may none the less shape the field, the candidates cover the ' +
  'whole A5d.3 window and this zone is reported rather than applied.';

export interface CandidatePairInput {
  /**
   * The A5d.3 window inputs for this pair. Its `order` field is ignored — the
   * generator substitutes each candidate order in turn, for the reason in the
   * header.
   */
  windowInput: XoWindowInput;
  /** What `flankOrder.pairOrders` derived for this handover. */
  orders: PairOrderResult;
  /**
   * E-2 — the order the designer STATED for this handover, when they stated
   * one. Read by the `'one'` alignment policy only: an exploration that must
   * build a single alignment per handover builds the stated one when the
   * derivation admits it. Absent or null = nothing stated.
   */
  statedOrder?: number | null;
}

/**
 * E-2 — HOW POSITIONS ARE LAID ACROSS A WINDOW.
 *
 *  · `'spread'` — the field it has always been (rule 1): evenly from edge to
 *    edge in octave distance, the count derived from the span (rule 2), and
 *    under a budget the survivors RE-SPREAD over the whole window with wider
 *    cages. Absent means this, byte for byte.
 *  · `'centre-first'` — the EXPLORATION layout: the geometric centre of the
 *    window first (the same reference crossing the order derivation reads its
 *    demands at, `candidateField.ts`), then one spacing below it, one above,
 *    two below, two above … as far as the window allows. Under a budget the
 *    OUTERMOST positions go and the cages stay one spacing wide: a smaller
 *    field covers a smaller part of the band, which is what "a smaller field,
 *    not a looser search" means. When two positions must be chosen the lower
 *    neighbour comes first — a lower handover loads the upper driver harder,
 *    so it is the more informative of the two to look at first.
 *  · `'two-sided'` — C-2: the spread layout with every CAGE kept INSIDE the
 *    window. `'spread'` lays its outermost positions ON the band edges and
 *    clips their cages there, so a candidate on the ceiling can only leave its
 *    cage downward and one on the floor only upward — E-1 measured exactly
 *    that on casus 1's mid→tweeter axis (every delivered network on the 2304 Hz
 *    ceiling position crossed 61-255 Hz lower, every one on the 1647 Hz floor
 *    position at or above it). A one-sided cage asks half a question. Here the
 *    positions are spread across the window INSET by half a spacing on each
 *    side, and every cage is one spacing wide and centred on its position: a
 *    candidate is judged AT its position, in both directions, and the extreme
 *    cages touch the window edges without crossing them (rule 4 is untouched —
 *    nothing leaves the window, and now nothing is pinned against it either).
 *    The count is derived from the INSET span, because that is the stretch on
 *    which a two-sided position can sit; a window narrower than one spacing
 *    admits exactly one position and says so. Under a budget the survivors
 *    re-spread and the cages stay one spacing wide (the centre-first
 *    convention): a cage is a pin, not a partition.
 */
export type PositionPolicy = 'spread' | 'centre-first' | 'two-sided';

/**
 * E-2 — HOW MANY ALIGNMENTS ONE HANDOVER IS BUILT AT.
 *
 *  · `'every-order'` — rule 3, the field it has always been: every order the
 *    derivation admits is its own candidate. Absent means this.
 *  · `'one'` — the EXPLORATION rule: ONE alignment per handover. The stated
 *    order when the designer stated one and the derivation admits it;
 *    otherwise the STEEPEST admitted order, because that is the one that
 *    satisfies every demand the derivation raised (a steeper flank meets any
 *    protection or suppression demand a shallower one met). Said out loud in
 *    the axis notes: a full field builds the others, this one does not.
 */
export type AlignmentPolicy = 'every-order' | 'one';

export interface CandidateFieldSettings {
  /**
   * Finest spacing between two positions on one axis, in octaves. Absent = the
   * smoothing the acceptance judgement runs on (see rule 2).
   */
  minSpacingOctaves?: number;
  /**
   * How many chains the designer is willing to pay for. Absent = no bound, and
   * the field is however large the derivation makes it.
   *
   * When the derived field exceeds it, POSITIONS are thinned and ORDERS never
   * are: a position is a sample of a continuum and thinning one costs
   * resolution, while an order is a choice and dropping one answers a question
   * the designer asked to have left open. What was dropped is always reported.
   */
  chainBudget?: number;
  /** The alignments the design step can build. */
  alignments: readonly Alignment[];
  /** E-2 — see `PositionPolicy`. Absent = `'spread'`, the field it always was. */
  positionPolicy?: PositionPolicy;
  /** E-2 — see `AlignmentPolicy`. Absent = `'every-order'`, the field it always was. */
  alignmentPolicy?: AlignmentPolicy;
}

/**
 * A stretch of band some rule would remove from where positions may be placed.
 *
 * It is recorded whether or not it was applied, and that asymmetry is the
 * design: a reader of a shortlist can only ask "why is there no candidate
 * between 1327 and 1858 Hz?" if the answer is written down somewhere. Applied
 * or suspended, the zone, its source and its status travel with every position
 * on that axis.
 */
export interface BandExcision {
  /** The stretch, at the precision the window edges print at. */
  hz: [number, number];
  /** The zone's own name, as the window states it. */
  label: string;
  /** WHICH QUANTITY produced it and from what input — `XoZone.derivedFrom`. */
  source: string;
  /** True when it was actually subtracted from the band. */
  applied: boolean;
  /** When not applied: why not. Null when applied. */
  suspendedBecause: string | null;
}

/** One handover of one candidate. */
export interface CandidateCrossing {
  pairLabel: string;
  lower: string;
  upper: string;
  /** The handover frequency, Hz. */
  hz: number;
  /** The slice of the recommended band this candidate owns during the tune. */
  cageHz: [number, number];
  /**
   * C-2 — whether that cage has equal octave room on BOTH sides of the
   * position. False for a cage clipped at a band edge (`'spread'` lays its
   * outermost positions there) and for the single-position case where the cage
   * is the whole band. Decided on the unrounded edges by the layout that built
   * it, never re-derived from `cageHz` — the printing rounding is enough to
   * make a symmetric cage read otherwise.
   *
   * NOT A FINGERPRINT INGREDIENT: `candidateFieldKey` hashes the cage itself,
   * and this is a property OF that cage rather than a second statement beside
   * it.
   */
  twoSided: boolean;
  order: number;
  alignment: Alignment;
  /** The A5d.3 window this position was carved out of, at THIS order. */
  windowHz: [number, number];
  /** Which limit bound each edge of that window. */
  floorBy: string;
  ceilingBy: string;
  /** The candidate band segment the position sits in. */
  segmentHz: [number, number];
  /**
   * Zones a rule would remove from this axis's band, each with its source and
   * whether it was applied. Empty when the window implies none.
   */
  excisions: BandExcision[];
  /** Where in the field this position is, and how far above the window floor. */
  position: { index: number; count: number; octavesAboveFloor: number };
  /** Why this order, in the derivation's own words. */
  orderWhy: string;
  /** The one-line attribution a shortlist row shows. */
  provenance: string;
  /** Uncalibrated inputs this position inherited from its binding limits. */
  uncalibrated: string[];
}

export interface GeneratedCandidate {
  /** Unique, and unique because the order is in it — two orders at one
   *  frequency are two candidates and the scan table keys on this string. */
  label: string;
  crossings: CandidateCrossing[];
  provenance: string;
}

/** What one axis contributed, and what it had to give up. */
export interface CandidateAxis {
  pairLabel: string;
  lower: string;
  upper: string;
  orders: number[];
  /** Positions per order, after any thinning. */
  positionsByOrder: { order: number; count: number; derivedCount: number; hz: number[] }[];
  window: Record<string, XoWindowResult>;
  recommended: Record<string, RecommendedBandResult>;
  /** Per order: the zones a rule would cut, applied or suspended, with source. */
  excisions: Record<string, BandExcision[]>;
  notes: string[];
}

export interface CandidateField {
  candidates: GeneratedCandidate[];
  axes: CandidateAxis[];
  /** Pairs that produced nothing at all, each with the reason. */
  refusals: string[];
  notes: string[];
  /** What the field was generated with — an ingredient of the run stamp. */
  parameters: {
    minSpacingOctaves: number;
    chainBudget: number | null;
    /** The derived size before any thinning, and the delivered size. */
    derivedSize: number;
    deliveredSize: number;
    /**
     * E-2 — the two policies, PRESENT ONLY WHEN STATED. A field generated
     * without them serialises exactly as it did before E-2, so every recorded
     * run fingerprint (`candidateFieldKey`) still reproduces; an exploration
     * carries both and stamps differently from a full field over the same
     * windows, which is the point of recording them here.
     */
    positionPolicy?: PositionPolicy;
    alignmentPolicy?: AlignmentPolicy;
  };
}

/* ------------------------------------------------------------------ *
 * Positions along a set of segments
 * ------------------------------------------------------------------ */

/** Total octave span of a list of segments. */
const spanOctaves = (segs: readonly (readonly [number, number])[]): number =>
  segs.reduce((a, s) => a + (s[1] > s[0] ? Math.log2(s[1] / s[0]) : 0), 0);

/**
 * The frequency at octave-distance `t` along the concatenated segments.
 *
 * "Concatenated" is what makes the spread even across a band the worst lobing
 * zone has cut in two: the arc length is octaves of ALLOWED band, so two
 * segments of unequal width get positions in proportion to how much band they
 * actually offer, and the gap between them consumes none.
 */
function atArc(
  segs: readonly (readonly [number, number])[],
  t: number,
): { hz: number; segment: readonly [number, number] } {
  let left = t;
  for (const s of segs) {
    const w = s[1] > s[0] ? Math.log2(s[1] / s[0]) : 0;
    if (left <= w || s === segs[segs.length - 1]) {
      return { hz: s[0] * 2 ** Math.min(Math.max(left, 0), w), segment: s };
    }
    left -= w;
  }
  const last = segs[segs.length - 1];
  return { hz: last[1], segment: last };
}

/**
 * One laid-out position: where it sits, the slice of band it owns during the
 * tune, the segment it was carved from, and whether that cage is TWO-SIDED.
 *
 * C-2 — `twoSided` is decided on the UNROUNDED edges, here, and never
 * recomputed from the rounded ones. The edges are rounded to a tenth of a hertz
 * for printing (`roundEdge`), which at 2 kHz is 7e-5 of an octave — enough to
 * make an exactly symmetric cage read asymmetric, and a reader who then sees
 * "one-sided" is told the opposite of what was built. The layout knows the
 * answer by construction; it says so rather than leaving it to be inferred.
 */
interface CandidatePoint {
  hz: number;
  cage: [number, number];
  segment: readonly [number, number];
  twoSided: boolean;
}

/** Equal octave room on both sides, on the unrounded edges. */
const symmetricCage = (hz: number, lo: number, hi: number): boolean =>
  lo > 0 &&
  lo < hz &&
  hi > hz &&
  Math.abs(Math.log2(hi / hz) - Math.log2(hz / lo)) <= 1e-9;

/**
 * Evenly spaced positions across the segments, in octave distance.
 *
 * `count === 1` puts the single position at the MIDPOINT of the allowed band
 * rather than at an edge: with one sample there is no spread to preserve, and
 * an edge is the one place where a rounding of the limit that set it changes
 * the answer.
 */
function positionsAlong(
  segs: readonly (readonly [number, number])[],
  count: number,
): CandidatePoint[] {
  const span = spanOctaves(segs);
  const out: CandidatePoint[] = [];
  const step = count > 1 ? span / (count - 1) : span;
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? (i * span) / (count - 1) : span / 2;
    const at = atArc(segs, t);
    const half = step / 2;
    const lo = Math.max(at.segment[0], at.hz / 2 ** half);
    const hi = Math.min(at.segment[1], at.hz * 2 ** half);
    out.push({
      hz: roundEdge(at.hz),
      // Never a point: a zero-width cage turns the tuner's handover penalty
      // into a cliff, which is the lesson the v1 cage already carries.
      cage: [roundEdge(Math.min(lo, at.hz)), roundEdge(Math.max(hi, at.hz))],
      segment: at.segment,
      twoSided: symmetricCage(at.hz, lo, hi),
    });
  }
  return out;
}

/**
 * The zones a rule would cut out of this pair's band, with their attribution.
 *
 * Read off the window and the composition rather than recomputed: the zone
 * frequencies are `recommendedBand`'s (so the two can never round apart) and
 * the attribution is the zone's own (`XoZone.derivedFrom`), so this function
 * states nothing about lobing that the window did not already state.
 */
function excisionsFor(w: XoWindowResult, rb: RecommendedBandResult): BandExcision[] {
  if (!rb.worstZoneHz) return [];
  const zone = w.zones.find((z) => z.kind === 'bad');
  return [
    {
      hz: rb.worstZoneHz,
      label: zone?.label ?? 'the excised zone',
      source: zone?.derivedFrom ?? 'the window did not state where this zone came from',
      applied: APPLY_BAND_EXCISIONS,
      suspendedBecause: APPLY_BAND_EXCISIONS ? null : EXCISION_SUSPENDED_BECAUSE,
    },
  ];
}

/** The excision clause a provenance sentence ends with. Empty when there is none. */
function excisionSentence(ex: readonly BandExcision[]): string {
  return ex
    .map(
      (e) =>
        `; ${e.applied ? 'EXCISED' : 'not excised'} ${formatEdge(e.hz[0])}–${formatEdge(e.hz[1])} Hz ` +
        `(${e.label}, ${e.source})` +
        (e.suspendedBecause ? ` — ${e.suspendedBecause}` : ''),
    )
    .join('');
}

/* U-4 — `derivedPositionCount` now lives in `positionCount.ts`, because the
 * window's divisor table counts positions too and one rule may have only one
 * implementation (A3g). Re-exported here so every existing reader is unmoved. */
export { derivedPositionCount };

/**
 * E-2 — how many positions the centre-first layout admits over this span:
 * the centre, plus as many spacings as fit on EACH side of it. Odd by
 * construction, and never more than one apart from the spread count.
 */
export function centreFirstPositionCount(spanOct: number, spacingOct: number): number {
  if (!(spanOct > 0) || !(spacingOct > 0)) return 1;
  return 1 + 2 * Math.floor(spanOct / 2 / spacingOct + Number.EPSILON);
}

/**
 * C-2 — the segments INSET by `halfOct` on each side: the stretch on which a
 * position whose cage is `2 * halfOct` wide can sit without that cage leaving
 * the segment. A segment narrower than the cage disappears rather than
 * collapsing to a point — it has no room for a two-sided position at all.
 */
function insetSegments(
  segs: readonly (readonly [number, number])[],
  halfOct: number,
): (readonly [number, number])[] {
  const k = 2 ** halfOct;
  return segs
    .map((s) => [s[0] * k, s[1] / k] as const)
    .filter((s) => s[1] > s[0]);
}

/**
 * C-2 — how many positions the two-sided layout admits: the derived count of
 * the INSET span. One when the window has no room for a two-sided position at
 * all, which is the honest answer rather than a refusal — the single position
 * then sits at the window's own midpoint with the widest cage that fits.
 */
export function twoSidedPositionCount(
  segs: readonly (readonly [number, number])[],
  spacingOct: number,
): number {
  const inner = insetSegments(segs, spacingOct / 2);
  if (inner.length === 0) return 1;
  return derivedPositionCount(spanOctaves(inner), spacingOct);
}

/**
 * C-2 — the two-sided layout: positions spread evenly across the INSET band,
 * each with a cage one spacing wide centred on it. The cage is clamped to the
 * original segment as a belt-and-braces measure — by construction it already
 * fits, and a clamp that never fires is cheaper than a claim that it cannot.
 */
function positionsTwoSided(
  segs: readonly (readonly [number, number])[],
  count: number,
  spacing: number,
): CandidatePoint[] {
  const half = spacing / 2;
  const inner = insetSegments(segs, half);
  /* No room for a two-sided position: fall back to the one-position spread,
   * which puts it at the midpoint and gives it the whole segment as its cage.
   * That cage is one-sided at both edges and the provenance says so. */
  if (inner.length === 0) return positionsAlong(segs, 1);
  const span = spanOctaves(inner);
  const out: CandidatePoint[] = [];
  for (let i = 0; i < Math.max(1, count); i++) {
    const t = count > 1 ? (i * span) / (count - 1) : span / 2;
    const at = atArc(inner, t);
    /* The cage belongs to the ORIGINAL segment the inset one came from: the
     * inset is where positions may sit, the segment is what may be crossed. */
    const seg = segs.find((s) => at.hz >= s[0] - 1e-9 && at.hz <= s[1] + 1e-9) ?? segs[0];
    const lo = Math.max(seg[0], at.hz / 2 ** half);
    const hi = Math.min(seg[1], at.hz * 2 ** half);
    out.push({
      hz: roundEdge(at.hz),
      cage: [roundEdge(Math.min(lo, at.hz)), roundEdge(Math.max(hi, at.hz))],
      segment: seg,
      twoSided: symmetricCage(at.hz, lo, hi),
    });
  }
  return out;
}

/**
 * E-2 — the centre-first layout (`PositionPolicy`): the window centre, then
 * ±1, ±2 … spacings out, the LOWER of each pair first; `count` of them,
 * returned in ascending frequency. The cage is one spacing wide around the
 * position and clipped to the segment — it does not widen when the field is
 * thinned, because a thinned exploration covers less band rather than the
 * same band more coarsely.
 */
function positionsCentreFirst(
  segs: readonly (readonly [number, number])[],
  count: number,
  spacing: number,
): CandidatePoint[] {
  const span = spanOctaves(segs);
  const mid = span / 2;
  const order: number[] = [mid];
  for (let j = 1; ; j++) {
    const lo = mid - j * spacing;
    if (lo < -1e-9) break;
    order.push(Math.max(0, lo), Math.min(span, mid + j * spacing));
  }
  const kept = order.slice(0, Math.max(1, count)).sort((a, b) => a - b);
  const half = spacing / 2;
  return kept.map((t) => {
    const at = atArc(segs, t);
    const lo = Math.max(at.segment[0], at.hz / 2 ** half);
    const hi = Math.min(at.segment[1], at.hz * 2 ** half);
    return {
      hz: roundEdge(at.hz),
      cage: [roundEdge(Math.min(lo, at.hz)), roundEdge(Math.max(hi, at.hz))],
      segment: at.segment,
      twoSided: symmetricCage(at.hz, lo, hi),
    };
  });
}

/** The layout a policy names — one dispatch, two readers (the rows and the axis summary). */
function positionsFor(
  policy: PositionPolicy,
  segs: readonly (readonly [number, number])[],
  count: number,
  spacing: number,
): CandidatePoint[] {
  if (policy === 'centre-first') return positionsCentreFirst(segs, count, spacing);
  if (policy === 'two-sided') return positionsTwoSided(segs, count, spacing);
  return positionsAlong(segs, count);
}

/* ------------------------------------------------------------------ *
 * The alignment for an order
 * ------------------------------------------------------------------ */

/**
 * The alignment a candidate at this order is built with.
 *
 * Where the library offers more than one at an order, the LR entry wins
 * (A5d.3's stated preference for symmetric acoustic flanks), and the others are
 * named in the notes rather than generated. That is a bounded field rather than
 * a silent one: the alternatives are said out loud, and generating both would
 * double the field on a preference the measurements have no opinion about.
 */
function alignmentFor(
  library: readonly Alignment[],
  order: number,
): { chosen: Alignment | null; alternatives: Alignment[] } {
  const at = library.filter((a) => a.order === order);
  if (at.length === 0) return { chosen: null, alternatives: [] };
  const preferred = at.find((a) => a.kind === PREFERRED_ALIGNMENT_KIND) ?? at[0];
  return { chosen: preferred, alternatives: at.filter((a) => a !== preferred) };
}

/* ------------------------------------------------------------------ *
 * The field
 * ------------------------------------------------------------------ */

interface AxisSlot {
  pair: CandidatePairInput;
  orders: number[];
  /** Per order: the window, the band, the derived count and the live count. */
  byOrder: {
    order: number;
    alignment: Alignment;
    window: XoWindowResult;
    recommended: RecommendedBandResult;
    segments: (readonly [number, number])[];
    excisions: BandExcision[];
    derivedCount: number;
    count: number;
    uncalibrated: string[];
  }[];
  notes: string[];
}

export function generateCandidates(
  pairs: readonly CandidatePairInput[],
  settings: CandidateFieldSettings,
): CandidateField {
  const spacing = settings.minSpacingOctaves ?? WINDOW_SMOOTHING_OCTAVES;
  const budget = settings.chainBudget ?? null;
  /* E-2 — the two policies; absent is the field it always was (P2), and the
   * parameters block below records them only when they were stated. */
  const positionPolicy: PositionPolicy = settings.positionPolicy ?? 'spread';
  const alignmentPolicy: AlignmentPolicy = settings.alignmentPolicy ?? 'every-order';
  const policyParameters = {
    ...(settings.positionPolicy !== undefined ? { positionPolicy: settings.positionPolicy } : {}),
    ...(settings.alignmentPolicy !== undefined ? { alignmentPolicy: settings.alignmentPolicy } : {}),
  };
  const notes: string[] = [];
  const refusals: string[] = [];
  const slots: AxisSlot[] = [];

  for (const pair of pairs) {
    const label = pair.orders.pairLabel;
    const slot: AxisSlot = { pair, orders: [], byOrder: [], notes: [...pair.orders.notes] };
    /* E-2 — ONE ALIGNMENT PER HANDOVER under the exploration policy: the
     * stated order when the derivation admits it, else the steepest admitted
     * order (it satisfies every demand the derivation raised). The orders
     * that are NOT built are named, so the reader of a shortlist knows the
     * full field would have built them. */
    const admitted = pair.orders.orders;
    const oneOrder = (): number[] => {
      if (alignmentPolicy !== 'one' || admitted.length <= 1) return admitted;
      const stated = pair.statedOrder ?? null;
      const chosen =
        stated !== null && admitted.includes(stated) ? stated : Math.max(...admitted);
      slot.notes.push(
        `${label}: the exploration builds ONE alignment per handover — order ${chosen}` +
          (stated !== null && chosen === stated
            ? ' (the order you stated)'
            : ' (the steepest the derivation admits, which meets every demand it raised)') +
          `; the full field would also build order${admitted.length > 2 ? 's' : ''} ` +
          `${admitted.filter((o) => o !== chosen).join(', ')}.`,
      );
      return [chosen];
    };
    for (const order of oneOrder()) {
      const { chosen, alternatives } = alignmentFor(settings.alignments, order);
      if (!chosen) {
        slot.notes.push(
          `${label}: order ${order} is admitted by the derivation but the alignment library offers ` +
            'nothing at that order, so no candidate is built there.',
        );
        continue;
      }
      if (alternatives.length > 0) {
        slot.notes.push(
          `${label}: the alignment library also offers ` +
            `${alternatives.map((a) => `${a.kind}${a.order}`).join(', ')} at order ${order}. ` +
            `${chosen.kind}${chosen.order} is built, per A5d.3's preference for symmetric acoustic ` +
            'flanks; the others are named here rather than generated, because the measurements ' +
            'have no opinion between them and doubling the field on a preference is not a finding.',
        );
      }
      const window = crossoverWindow({ ...pair.windowInput, order });
      const recommended = recommendedBand(window);
      const excisions = excisionsFor(window, recommended);
      /* THE BAND THE POSITIONS ARE LAID ACROSS.
       *
       * With the excision suspended (V28) that is the whole A5d.3 window, and
       * it is taken as `recommendedBand`'s own `windowHz` rather than from
       * `window.floorHz`/`ceilingHz` directly, so both routes round identically
       * and both are null in exactly the same cases — the F3b lesson about
       * 473.20000000000005, applied to a band instead of to a field. */
      const segments = (
        APPLY_BAND_EXCISIONS
          ? recommended.effectiveHz
          : recommended.windowHz
            ? [recommended.windowHz]
            : []
      ).filter((s) => s[1] > s[0]);
      if (excisions.length > 0 && !APPLY_BAND_EXCISIONS) {
        slot.notes.push(
          `${label} at order ${order}: ${excisions[0].label} ` +
            `(${formatEdge(excisions[0].hz[0])}–${formatEdge(excisions[0].hz[1])} Hz) is NOT cut out of ` +
            `the candidate band. ${excisions[0].suspendedBecause} Its source: ${excisions[0].source}`,
        );
      }
      if (segments.length === 0) {
        refusals.push(
          `${label} at order ${order}: ` +
            (window.empty
              ? 'the feasible window is EMPTY — every crossing frequency is forbidden by one limit ' +
                'or another, which is a driver or layout problem and not a filter problem.'
              : 'no feasible window could be derived, so there is nowhere to place a candidate. ' +
                'Absence is not a verdict (P4): this says the measurements did not give a window, ' +
                'not that anywhere would do.'),
        );
        continue;
      }
      const derivedCount =
        positionPolicy === 'centre-first'
          ? centreFirstPositionCount(spanOctaves(segments), spacing)
          : positionPolicy === 'two-sided'
            ? twoSidedPositionCount(segments, spacing)
            : derivedPositionCount(spanOctaves(segments), spacing);
      slot.orders.push(order);
      slot.byOrder.push({
        order,
        alignment: chosen,
        window,
        recommended,
        segments,
        excisions,
        derivedCount,
        count: derivedCount,
        uncalibrated: recommended.uncalibrated,
      });
    }
    if (slot.byOrder.length === 0) continue;
    slots.push(slot);
  }

  if (slots.length === 0) {
    return {
      candidates: [],
      axes: [],
      refusals,
      notes: [
        ...notes,
        'No axis produced a candidate, so there is no field. Every reason is in the refusals above; ' +
          'none of them is something a search could have fixed.',
      ],
      parameters: {
        minSpacingOctaves: spacing,
        chainBudget: budget,
        derivedSize: 0,
        deliveredSize: 0,
        ...policyParameters,
      },
    };
  }

  /* ---- the derived size, and the thinning if it does not fit ------------- */
  const sizeOf = (): number =>
    slots.reduce((a, s) => a * s.byOrder.reduce((b, o) => b + o.count, 0), 1);
  const derivedSize = sizeOf();
  if (budget !== null && derivedSize > budget) {
    /* Thin the WIDEST axis first, one position at a time, and never below one.
     * Orders are untouched: an order is a choice and a position is a sample. */
    let guard = derivedSize;
    while (sizeOf() > budget && guard-- > 0) {
      let worst: AxisSlot['byOrder'][number] | null = null;
      for (const s of slots) {
        for (const o of s.byOrder) {
          if (o.count > 1 && (worst === null || o.count > worst.count)) worst = o;
        }
      }
      if (!worst) break;
      worst.count--;
    }
    const delivered = sizeOf();
    notes.push(
      `The derivation offered ${derivedSize} candidates and the stated budget is ${budget}; ` +
        `${delivered} are delivered. POSITIONS were thinned, per axis and per order, ` +
        (positionPolicy === 'centre-first'
          ? 'from the OUTSIDE in: the window centre and its nearest neighbours survive, the cages ' +
            'stay one spacing wide, and the band beyond the survivors is simply not explored ' +
            '(E-2 exploration). '
          : positionPolicy === 'two-sided'
            ? 'and the survivors re-spread across the inset band; their cages stay one spacing ' +
              'wide and two-sided, so what a thinning costs is the band BETWEEN the cages and ' +
              'never the symmetry of one (C-2). '
            : 'and the spacing between the ones that remain is therefore wider than the acceptance ' +
              'smoothing the count was derived from. ') +
        'ORDERS were not thinned and will not be: a position is a ' +
        'sample of a continuum, an order is a choice, and dropping a choice to fit a budget ' +
        'answers a question that was asked to stay open.' +
        (delivered > budget
          ? ` The field is still ${delivered}, over the budget: every axis is down to one position ` +
            'per order and the remainder is orders. Raise the budget or state an order.'
          : ''),
    );
  }

  /* ---- the product ------------------------------------------------------ */
  const axisRows: {
    slot: AxisSlot;
    rows: CandidateCrossing[];
  }[] = slots.map((slot) => {
    const rows: CandidateCrossing[] = [];
    const wi = slot.pair.windowInput;
    for (const o of slot.byOrder) {
      const pts = positionsFor(positionPolicy, o.segments, o.count, spacing);
      const floorHz = o.window.floorHz!;
      const orderWhy =
        slot.pair.orders.why.find((w) => w.startsWith(`order ${o.order}:`)) ??
        `order ${o.order}`;
      /* E-1 — EVERY ceiling the window knows, in the provenance, so a reader
       * of a candidate sees what the binding one was the strictest OF: on
       * casus 1's mid→tweeter axis the breakup ceiling (2304 Hz) binds while
       * the directivity ceiling (5433 Hz) does not and nothing is stated. A
       * provenance that named only the binding rule read as if it were the
       * only rule. */
      /* U-4 — a SUPERSEDED ceiling is named here too, and named as superseded.
       * It is reported and does not bind (the designer's explicit overrule of
       * the uncalibrated breakup derivation), and a provenance that silently
       * dropped it would make the winning ceiling look like the only one there
       * ever was — the very reading E-1 added this inventory to prevent. */
      const ceilings = o.window.limits.filter((l) => l.side === 'ceiling');
      const overruled = ceilings.filter((l) => l.superseded !== undefined);
      const ceilingInventory = ceilings.length
        ? `the strictest of ${ceilings
            .filter((l) => l.superseded === undefined)
            .map((l) => `${l.rule} ${formatEdge(l.hz)} Hz`)
            .join(', ')}` +
          (ceilings.some((l) => l.rule === 'stated' || l.rule === 'stated-max') ? '' : '; no stated ceiling') +
          (overruled.length
            ? `; SUPERSEDED and not binding: ${overruled
                .map((l) => `${l.rule} ${formatEdge(l.hz)} Hz — ${l.superseded}`)
                .join(', ')}`
            : '')
        : 'no ceiling limit';
      pts.forEach((p, i) => {
        const seg: [number, number] = [roundEdge(p.segment[0]), roundEdge(p.segment[1])];
        const win: [number, number] = [roundEdge(floorHz), roundEdge(o.window.ceilingHz!)];
        const oct = Math.log2(p.hz / floorHz);
        /* E-1 — a cage clipped at a band edge is ONE-SIDED, and that is worth
         * saying where the candidate is read: a position laid ON the ceiling
         * can only leave its cage downward, one on the floor only upward.
         * Measured on the A5e.3c field: every delivered network on the
         * mid→tweeter ceiling position (2304 Hz, cage 2118–2304) crossed
         * 61–255 Hz lower, every one on the floor position (1647, cage
         * 1647–1789) crossed at or above it. */
        const clippedTop = p.cage[1] >= seg[1] - 1e-9;
        const clippedBottom = p.cage[0] <= seg[0] + 1e-9;
        /* C-2 — SYMMETRY, not edge contact, is what makes a cage two-sided.
         * The two-sided layout puts its extreme cages exactly ON the window
         * edges without crossing them, so `clippedTop` fires on a cage the
         * tune can leave in either direction. Read the cage against its own
         * position instead: equal octave room on both sides is a two-sided
         * cage whatever it happens to touch. The `count === 1` case (the whole
         * band as one cage) is symmetric too and keeps its own sentence, which
         * is the true one there — it is one-sided at BOTH edges. */
        const cageNote =
          clippedTop && clippedBottom
            ? ' (the whole band: one-sided at both edges)'
            : p.twoSided
              ? ''
              : clippedTop
                ? ' (clipped at the ceiling: one-sided, the tune can only leave it downward — E-1)'
                : clippedBottom
                  ? ' (clipped at the floor: one-sided, the tune can only leave it upward — E-1)'
                  : '';
        rows.push({
          pairLabel: slot.pair.orders.pairLabel,
          lower: wi.lower,
          upper: wi.upper,
          hz: p.hz,
          cageHz: p.cage,
          twoSided: p.twoSided,
          order: o.order,
          alignment: o.alignment,
          windowHz: win,
          floorBy: o.window.floorBy
            ? `${o.window.floorBy.rule} — ${o.window.floorBy.source}`
            : 'no floor limit',
          ceilingBy: o.window.ceilingBy
            ? `${o.window.ceilingBy.rule} — ${o.window.ceilingBy.source}`
            : 'no ceiling limit',
          segmentHz: seg,
          excisions: o.excisions,
          position: { index: i, count: o.count, octavesAboveFloor: oct },
          orderWhy,
          uncalibrated: o.uncalibrated,
          provenance:
            `${wi.lower}→${wi.upper} at ${formatEdge(p.hz)} Hz, ${o.alignment.kind}${o.alignment.order}: ` +
            `position ${i + 1} of ${o.count} ` +
            (positionPolicy === 'centre-first'
              ? `laid centre-first from the window centre ${formatEdge(Math.sqrt(seg[0] * seg[1]))} Hz ` +
                'across the candidate band '
              : positionPolicy === 'two-sided'
                ? 'laid two-sided (every cage one spacing wide and inside the window, C-2) across ' +
                  'the candidate band '
                : 'across the candidate band ') +
            `${formatEdge(seg[0])}–${formatEdge(seg[1])} Hz, ${oct.toFixed(2)} oct above the ` +
            `window floor ${formatEdge(win[0])} Hz (${o.window.floorBy?.rule ?? 'none'}); ` +
            `ceiling ${formatEdge(win[1])} Hz (${o.window.ceilingBy?.rule ?? 'none'} — ${ceilingInventory}); ` +
            `cage ${formatEdge(p.cage[0])}–${formatEdge(p.cage[1])} Hz${cageNote}; ${orderWhy}` +
            excisionSentence(o.excisions),
        });
      });
    }
    return { slot, rows };
  });

  let combos: CandidateCrossing[][] = [[]];
  for (const a of axisRows) {
    const next: CandidateCrossing[][] = [];
    for (const c of combos) for (const r of a.rows) next.push([...c, r]);
    combos = next;
  }

  const candidates: GeneratedCandidate[] = [];
  let nonMonotone = 0;
  for (const c of combos) {
    let ok = true;
    for (let i = 1; i < c.length; i++) if (!(c[i].hz > c[i - 1].hz)) ok = false;
    if (!ok) {
      nonMonotone++;
      continue;
    }
    const label = c
      .map((x) => `${x.pairLabel} ${formatEdge(x.hz)} ${x.alignment.kind}${x.alignment.order}`)
      .join(' · ');
    candidates.push({
      label,
      crossings: c,
      provenance: c.map((x) => x.provenance).join(' | '),
    });
  }
  if (nonMonotone > 0) {
    notes.push(
      `${nonMonotone} combinations were dropped because their handovers did not ascend — two ` +
        'adjacent windows overlap, so a position in the upper one can sit below a position in the ' +
        'lower one. The overlap itself is in the windows and is worth reading; the combination is ' +
        'not a design.',
    );
  }

  return {
    candidates,
    axes: axisRows.map(({ slot }) => ({
      pairLabel: slot.pair.orders.pairLabel,
      lower: slot.pair.windowInput.lower,
      upper: slot.pair.windowInput.upper,
      orders: slot.orders,
      positionsByOrder: slot.byOrder.map((o) => ({
        order: o.order,
        count: o.count,
        derivedCount: o.derivedCount,
        hz: positionsFor(positionPolicy, o.segments, o.count, spacing).map((p) => p.hz),
      })),
      window: Object.fromEntries(slot.byOrder.map((o) => [String(o.order), o.window])),
      recommended: Object.fromEntries(slot.byOrder.map((o) => [String(o.order), o.recommended])),
      excisions: Object.fromEntries(slot.byOrder.map((o) => [String(o.order), o.excisions])),
      notes: slot.notes,
    })),
    refusals,
    notes,
    parameters: {
      minSpacingOctaves: spacing,
      chainBudget: budget,
      derivedSize,
      deliveredSize: candidates.length,
      ...policyParameters,
    },
  };
}

/**
 * The take-over values (`freq ± margin`) that reproduce a candidate's cage.
 *
 * Re-exported through the same helper the dialog uses so a cage and the two
 * fields that express it can never round differently — the F3b lesson about
 * 473.20000000000005, one layer up.
 */
export const cageAsPin = (cage: readonly [number, number]): { freqHz: number; marginHz: number } =>
  takeoverFor([cage[0], cage[1]]);
