/**
 * A5d.3, APPLIED TO THE SCAN DIALOG (F3b, deliverables 1-3).
 *
 * `xoWindow.ts` computes the feasible window. This module answers the three
 * questions the scan dialog asks about it, and it answers them as PURE
 * FUNCTIONS so the wording, the arithmetic and the verdicts can be tested
 * without a browser — the panel and the dialog then cannot come to disagree
 * about whether a range is inside its window.
 *
 * THE ONE RULE THAT SHAPES ALL THREE. Nothing here clamps, skips or narrows
 * anything. A5d.3's windows are a REPORT about the drivers, and the designer
 * may have reasons the measurement set does not know about; the app's job is
 * to make the disagreement impossible to miss, offer to resolve it in one
 * click, and then do exactly what it was told. Silently moving a designer's
 * range to fit a window derived from an uncalibrated severity curve would be
 * the same class of mistake the casebook keeps recording — a second, quiet
 * decision taken on the designer's behalf.
 *
 * ABSENCE IS NOT A VERDICT (P4). A pair with no window gets NO annotation and
 * NO warning: "we could not derive a window" and "your range is fine" are
 * different statements, and the second one is not ours to make.
 */

import type { XoWindowResult } from './xoWindow.ts';

/** How a stated search range sits against a feasible window. */
export type RangeVerdict =
  | 'no-window'
  | 'empty-window'
  | 'inside'
  | 'partly-outside'
  | 'entirely-outside';

export interface RangeAdvice {
  verdict: RangeVerdict;
  /** The window's edges, when it has both. */
  windowHz: [number, number] | null;
  /** What the designer is shown. Null when there is nothing to say. */
  message: string | null;
  /**
   * The field values that would make the range equal the window exactly.
   * Null when there is no window to take over.
   */
  takeover: { freqHz: number; marginHz: number } | null;
  /** True when a warning should be visible for this pair. */
  warn: boolean;
}

/**
 * Round a window edge to the precision the dialog's fields show.
 *
 * The take-over has to reproduce the window EXACTLY as the reader sees it, and
 * a reader sees one decimal. Rounding the edges first and deriving centre and
 * margin from the rounded pair keeps "freq ± margin" reconstructing the
 * annotated numbers rather than something a tenth of a hertz away from them.
 */
const EDGE_DECIMALS = 1;
/**
 * Exported since F3c: the recommended band carves its segments out of the SAME
 * edges, and a segment rounded by a second rule is a segment whose take-over
 * button lands a tenth of a hertz off the number beside it.
 */
export const roundEdge = (hz: number): number =>
  Math.round(hz * 10 ** EDGE_DECIMALS) / 10 ** EDGE_DECIMALS;

/**
 * Print an edge at the precision it was rounded to.
 *
 * Whole hertz where the edge is a whole number, one decimal where it is not —
 * and the second half is the one that matters. A ceiling of 549.6 Hz printed
 * as "550" beside a stated range ending at 550 produces the sentence "your
 * range 250-550 Hz falls partly outside the window 397-550 Hz, above the
 * ceiling", which reads as a bug in the app rather than as a fact about the
 * design. The comparison is exact; so is what the reader is shown.
 */
export const formatEdge = (hz: number): string =>
  Number.isInteger(hz) ? hz.toFixed(0) : hz.toFixed(EDGE_DECIMALS);

/** The window as a pair of edges, or null when either side is missing. */
export function windowEdges(w: XoWindowResult | null | undefined): [number, number] | null {
  if (!w || w.empty) return null;
  if (w.floorHz === null || w.ceilingHz === null) return null;
  if (!(w.ceilingHz > w.floorHz)) return null;
  return [roundEdge(w.floorHz), roundEdge(w.ceilingHz)];
}

/**
 * The field values that make `freq ± margin` equal these edges.
 *
 * Rounded to two decimals, and that is not cosmetic. `(396.7 + 549.7) / 2` is
 * 473.20000000000005 in binary floating point, and a number field that fills
 * itself with 473.20000000000005 tells the designer the app is broken. Two
 * decimals is also EXACT here rather than a compromise: the edges are already
 * at one decimal, so their half-sum and half-difference are always multiples
 * of 0.05, and rounding to 0.01 loses nothing. `freq ± margin` reproduces the
 * annotated window to the digit.
 */
const TAKEOVER_DECIMALS = 2;
const roundField = (hz: number): number =>
  Math.round(hz * 10 ** TAKEOVER_DECIMALS) / 10 ** TAKEOVER_DECIMALS;

export function takeoverFor(edges: [number, number]): { freqHz: number; marginHz: number } {
  return {
    freqHz: roundField((edges[0] + edges[1]) / 2),
    marginHz: roundField((edges[1] - edges[0]) / 2),
  };
}

/**
 * One pair's verdict.
 *
 * `range` is the search range the designer stated, or null when this pair is
 * not pinned — an unpinned axis is not "outside" anything, so it gets no
 * warning and only the annotation.
 */
export function rangeAgainstWindow(
  range: readonly [number, number] | null,
  w: XoWindowResult | null | undefined,
  pairLabel: string,
): RangeAdvice {
  if (!w) {
    return { verdict: 'no-window', windowHz: null, message: null, takeover: null, warn: false };
  }
  if (w.empty) {
    // A5d.3: an empty window is an ANSWER, and it is about the drivers rather
    // than about the range. It is reported whether or not anything is pinned.
    return {
      verdict: 'empty-window',
      windowHz: null,
      message:
        `${pairLabel}: no crossing frequency is allowed. Every limit this pair implies rules out ` +
        'the whole band the others leave open, so there is nowhere to hand over. That is a driver ' +
        'or layout problem, not a filter problem — no search range can fix it.',
      takeover: null,
      warn: true,
    };
  }
  const edges = windowEdges(w);
  if (!edges) {
    return { verdict: 'no-window', windowHz: null, message: null, takeover: null, warn: false };
  }
  const takeover = takeoverFor(edges);
  if (!range) {
    return { verdict: 'inside', windowHz: edges, message: null, takeover, warn: false };
  }
  const [lo, hi] = range;
  const below = lo < edges[0];
  const above = hi > edges[1];
  if (!below && !above) {
    return { verdict: 'inside', windowHz: edges, message: null, takeover, warn: false };
  }
  const outsideEntirely = hi <= edges[0] || lo >= edges[1];
  const which = below && above ? 'on both sides' : below ? 'below the floor' : 'above the ceiling';
  const bindingLow = w.floorBy ? `${w.floorBy.rule} (${w.floorBy.source})` : 'nothing';
  const bindingHigh = w.ceilingBy ? `${w.ceilingBy.rule} (${w.ceilingBy.source})` : 'nothing';
  return {
    verdict: outsideEntirely ? 'entirely-outside' : 'partly-outside',
    windowHz: edges,
    message:
      `${pairLabel}: your search range ${formatEdge(lo)}–${formatEdge(hi)} Hz falls ` +
      `${outsideEntirely ? 'ENTIRELY' : 'partly'} outside the feasible window ` +
      `${formatEdge(edges[0])}–${formatEdge(edges[1])} Hz, ${which}. ` +
      `The floor is set by ${bindingLow}; the ceiling by ${bindingHigh}. ` +
      'Nothing is being clamped — the scan searches exactly what you stated.',
    takeover,
    warn: true,
  };
}

/* ------------------------------------------------------------------ *
 * Deliverable 3 — the pre-start estimate
 * ------------------------------------------------------------------ */

/** One candidate's handover frequency on each axis; null = that axis is free. */
export interface CandidateCrossings {
  label: string;
  /** Same order and length as the windows handed alongside. */
  hz: readonly (number | null)[];
}

export interface OutsideEstimate {
  total: number;
  outside: number;
  /**
   * Candidates that land INSIDE the feasible window on every axis they can be
   * judged on, but outside the recommended band on at least one of them
   * (F3c, deliverable 2).
   *
   * A SECOND, WEAKER STATEMENT than `outside`, and counted separately for that
   * reason. Outside the window means the measurements forbid the handover;
   * outside the recommended band means the handover is allowed and sits in the
   * stretch where the drivers' spacing puts a null off axis. Adding the two
   * into one number would tell the designer those are the same finding.
   */
  outsideRecommended: number;
  /** Per axis: how many candidates land outside that axis' window. */
  perAxis: {
    pairLabel: string;
    outside: number;
    outsideRecommended: number;
    windowHz: [number, number] | null;
    recommendedHz: readonly (readonly [number, number])[] | null;
  }[];
  /** The sentence shown before the scan starts. Null when there is nothing to say. */
  message: string | null;
}

/**
 * How many candidates the scan is about to run land outside a feasible window.
 *
 * REPORTING ONLY, and deliberately so: the estimate is shown BEFORE the start
 * and "start anyway" is an ordinary option, not a confirmation of something
 * dangerous. A candidate outside the window is not invalid — it is a design
 * the measurements say will be fighting its drivers, which is exactly the kind
 * of thing a designer sometimes does on purpose and always wants to know about
 * first.
 *
 * A candidate counts ONCE however many axes it fails, because the thing being
 * counted is candidates.
 */
export function candidatesOutsideWindows(
  candidates: readonly CandidateCrossings[],
  windows: readonly {
    pairLabel: string;
    window: XoWindowResult | null | undefined;
    /**
     * The recommended band for this axis as PLAIN EDGES (F3c) — normally
     * `recommendedBand(window).effectiveHz`.
     *
     * Edges rather than the result object, and that is the whole reason the
     * composition module can import this one instead of the other way round.
     * `effectiveHz` rather than `segments`: on the fallback the recommendation
     * IS the full window, and an axis handed an empty segment list would
     * report every candidate on it as outside a band that does not exist.
     */
    recommendedHz?: readonly (readonly [number, number])[] | null;
  }[],
): OutsideEstimate {
  const edges = windows.map((w) => windowEdges(w.window));
  const recommended = windows.map((w) =>
    w.recommendedHz && w.recommendedHz.length > 0 ? w.recommendedHz : null,
  );
  const perAxis = windows.map((w, i) => ({
    pairLabel: w.pairLabel,
    outside: 0,
    outsideRecommended: 0,
    windowHz: edges[i],
    recommendedHz: recommended[i],
  }));
  let outside = 0;
  let outsideRecommended = 0;
  for (const c of candidates) {
    let any = false;
    let anyRec = false;
    for (let i = 0; i < windows.length; i++) {
      const e = edges[i];
      const f = c.hz[i];
      if (e === null || f === null || f === undefined || !Number.isFinite(f)) continue;
      if (f < e[0] || f > e[1]) {
        perAxis[i].outside++;
        any = true;
        continue;
      }
      // Inside the window. The recommended band is only asked about HERE: a
      // crossing the measurements already forbid is not additionally reported
      // as badly lobed, which would be counting one finding twice.
      const segs = recommended[i];
      if (segs && !segs.some((seg) => f >= seg[0] && f <= seg[1])) {
        perAxis[i].outsideRecommended++;
        anyRec = true;
      }
    }
    if (any) outside++;
    if (anyRec) outsideRecommended++;
  }
  const total = candidates.length;
  if ((outside === 0 && outsideRecommended === 0) || total === 0) {
    return { total, outside, outsideRecommended, perAxis, message: null };
  }
  const windowDetail = perAxis
    .filter((a) => a.outside > 0 && a.windowHz)
    .map(
      (a) =>
        `${a.outside} on ${a.pairLabel} (window ${formatEdge(a.windowHz![0])}–${formatEdge(a.windowHz![1])} Hz)`,
    )
    .join(', ');
  const recDetail = perAxis
    .filter((a) => a.outsideRecommended > 0 && a.recommendedHz)
    .map(
      (a) =>
        `${a.outsideRecommended} on ${a.pairLabel} (recommended ` +
        `${a.recommendedHz!.map((seg) => `${formatEdge(seg[0])}–${formatEdge(seg[1])}`).join(' / ')} Hz)`,
    )
    .join(', ');
  const lines: string[] = [];
  if (outside > 0) {
    lines.push(`${outside} of ${total} candidates lie outside the feasible window: ${windowDetail}.`);
  }
  if (outsideRecommended > 0) {
    lines.push(
      `${outsideRecommended} of ${total} candidates lie inside the window but outside the ` +
        `recommended band: ${recDetail}.`,
    );
  }
  lines.push(
    'They will still be simulated and ranked — nothing is skipped and nothing is clamped.',
  );
  return { total, outside, outsideRecommended, perAxis, message: lines.join(' ') };
}
