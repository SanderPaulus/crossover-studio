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
 *     this. Positions are carved out of `recommendedBand(...).effectiveHz`,
 *     which is a subset of the A5d.3 window by construction, so a candidate
 *     outside the window is not something this module declines to emit — it is
 *     something it cannot express.
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

export interface CandidatePairInput {
  /**
   * The A5d.3 window inputs for this pair. Its `order` field is ignored — the
   * generator substitutes each candidate order in turn, for the reason in the
   * header.
   */
  windowInput: XoWindowInput;
  /** What `flankOrder.pairOrders` derived for this handover. */
  orders: PairOrderResult;
}

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
  order: number;
  alignment: Alignment;
  /** The A5d.3 window this position was carved out of, at THIS order. */
  windowHz: [number, number];
  /** Which limit bound each edge of that window. */
  floorBy: string;
  ceilingBy: string;
  /** The recommended-band segment the position sits in. */
  segmentHz: [number, number];
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
): { hz: number; cage: [number, number]; segment: readonly [number, number] }[] {
  const span = spanOctaves(segs);
  const out: { hz: number; cage: [number, number]; segment: readonly [number, number] }[] = [];
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
    });
  }
  return out;
}

/** How many positions the spacing rule admits over this span. */
export function derivedPositionCount(spanOct: number, spacingOct: number): number {
  if (!(spanOct > 0) || !(spacingOct > 0)) return 1;
  return Math.max(1, 1 + Math.floor(spanOct / spacingOct + Number.EPSILON));
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
  const notes: string[] = [];
  const refusals: string[] = [];
  const slots: AxisSlot[] = [];

  for (const pair of pairs) {
    const label = pair.orders.pairLabel;
    const slot: AxisSlot = { pair, orders: [], byOrder: [], notes: [...pair.orders.notes] };
    for (const order of pair.orders.orders) {
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
      const segments = recommended.effectiveHz.filter((s) => s[1] > s[0]);
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
      const derivedCount = derivedPositionCount(spanOctaves(segments), spacing);
      slot.orders.push(order);
      slot.byOrder.push({
        order,
        alignment: chosen,
        window,
        recommended,
        segments,
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
      parameters: { minSpacingOctaves: spacing, chainBudget: budget, derivedSize: 0, deliveredSize: 0 },
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
        `${delivered} are delivered. POSITIONS were thinned, per axis and per order, and the ` +
        'spacing between the ones that remain is therefore wider than the acceptance smoothing ' +
        'the count was derived from. ORDERS were not thinned and will not be: a position is a ' +
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
      const pts = positionsAlong(o.segments, o.count);
      const floorHz = o.window.floorHz!;
      const orderWhy =
        slot.pair.orders.why.find((w) => w.startsWith(`order ${o.order}:`)) ??
        `order ${o.order}`;
      pts.forEach((p, i) => {
        const seg: [number, number] = [roundEdge(p.segment[0]), roundEdge(p.segment[1])];
        const win: [number, number] = [roundEdge(floorHz), roundEdge(o.window.ceilingHz!)];
        const oct = Math.log2(p.hz / floorHz);
        rows.push({
          pairLabel: slot.pair.orders.pairLabel,
          lower: wi.lower,
          upper: wi.upper,
          hz: p.hz,
          cageHz: p.cage,
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
          position: { index: i, count: o.count, octavesAboveFloor: oct },
          orderWhy,
          uncalibrated: o.uncalibrated,
          provenance:
            `${wi.lower}→${wi.upper} at ${formatEdge(p.hz)} Hz, ${o.alignment.kind}${o.alignment.order}: ` +
            `position ${i + 1} of ${o.count} across the recommended band ` +
            `${formatEdge(seg[0])}–${formatEdge(seg[1])} Hz, ${oct.toFixed(2)} oct above the ` +
            `window floor ${formatEdge(win[0])} Hz (${o.window.floorBy?.rule ?? 'none'}); ` +
            `ceiling ${formatEdge(win[1])} Hz (${o.window.ceilingBy?.rule ?? 'none'}); ${orderWhy}`,
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
        hz: positionsAlong(o.segments, o.count).map((p) => p.hz),
      })),
      window: Object.fromEntries(slot.byOrder.map((o) => [String(o.order), o.window])),
      recommended: Object.fromEntries(slot.byOrder.map((o) => [String(o.order), o.recommended])),
      notes: slot.notes,
    })),
    refusals,
    notes,
    parameters: {
      minSpacingOctaves: spacing,
      chainBudget: budget,
      derivedSize,
      deliveredSize: candidates.length,
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
