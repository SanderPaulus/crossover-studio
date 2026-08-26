/**
 * F3b ACCEPTANCE (b), (c), (d), (e) — the scan dialog's three answers.
 *
 * These are the deliverables whose failure mode is a QUIET one: a take-over
 * button that lands a hair off the window, a warning that does not fire on a
 * range half outside it, an empty window that renders as "0–0 Hz", a count
 * that silently omits the axis it could not judge. None of those throw, and
 * none of them look wrong on screen — which is exactly why they are asserted
 * here rather than checked by eye.
 */

import { describe, expect, it } from 'vitest';
import { crossoverWindow, type XoWindowResult } from './xoWindow.ts';
import {
  candidatesOutsideWindows,
  formatEdge,
  rangeAgainstWindow,
  takeoverFor,
  windowEdges,
} from './xoRangeAdvice.ts';

/**
 * A window with a chosen floor and ceiling, built through the REAL derivation.
 *
 * Constructing an `XoWindowResult` literal would test the advice against a
 * shape rather than against the thing the app actually shows, and the two
 * could then drift. The validity floor sets the bottom; the −6 dB directivity
 * point sets the top, because that limit carries no severity weighting and so
 * lands exactly where it is put.
 */
const windowFrom = (floorHz: number | null, ceilingHz: number | null): XoWindowResult =>
  crossoverWindow({
    lower: 'woofer',
    upper: 'mid',
    order: 4,
    validityFloorHz: floorHz,
    validityFloorSource: 'woofer far field',
    upperFsHz: null,
    lowerBreakups: [],
    lowerMinus6Hz: ceilingHz,
    lowerMinus6AngleDeg: 30,
    spacingMm: null,
  });

describe('(d) a window that is empty or unavailable renders without a crash or an assumption', () => {
  it('no window at all: no verdict, no message, no take-over', () => {
    const a = rangeAgainstWindow([400, 600], null, 'W-M');
    expect(a.verdict).toBe('no-window');
    expect(a.message).toBeNull();
    expect(a.takeover).toBeNull();
    expect(a.warn).toBe(false);
    // The distinction that matters: "we could not derive a window" is not
    // "your range is fine", and the app must not say the second one.
    expect(a.windowHz).toBeNull();
  });

  it('a window with only one edge is not a window', () => {
    expect(windowEdges(windowFrom(400, null))).toBeNull();
    expect(windowEdges(windowFrom(null, 600))).toBeNull();
    const a = rangeAgainstWindow([400, 600], windowFrom(400, null), 'W-M');
    expect(a.verdict).toBe('no-window');
    expect(a.takeover).toBeNull();
  });

  it('an EMPTY window is an answer, and it is about the drivers rather than the range', () => {
    const w = windowFrom(900, 500);
    expect(w.empty).toBe(true);
    const a = rangeAgainstWindow([400, 600], w, 'W-M');
    expect(a.verdict).toBe('empty-window');
    expect(a.warn).toBe(true);
    expect(a.message).toContain('driver or layout problem');
    // No take-over: there is nothing to take over, and offering a button that
    // wrote nonsense into the fields would be worse than offering none.
    expect(a.takeover).toBeNull();
    // It is reported with NO range stated too - it does not depend on one.
    expect(rangeAgainstWindow(null, w, 'W-M').verdict).toBe('empty-window');
  });

  it('an unpinned axis is not "outside" anything', () => {
    const a = rangeAgainstWindow(null, windowFrom(400, 600), 'W-M');
    expect(a.warn).toBe(false);
    expect(a.message).toBeNull();
    // ...but the window is still there to annotate with, and to take over.
    expect(a.windowHz).toEqual([400, 600]);
    expect(a.takeover).not.toBeNull();
  });
});

describe('(c) the warning fires on inside / partly outside / entirely outside', () => {
  const w = windowFrom(400, 600);

  it('wholly inside: no warning at all', () => {
    for (const r of [[450, 550], [400, 600], [500, 500]] as [number, number][]) {
      const a = rangeAgainstWindow(r, w, 'W-M');
      expect(a.verdict, `range ${r.join('-')}`).toBe('inside');
      expect(a.warn).toBe(false);
      expect(a.message).toBeNull();
    }
  });

  it('partly outside on either side, and on both at once', () => {
    const below = rangeAgainstWindow([350, 550], w, 'W-M');
    expect(below.verdict).toBe('partly-outside');
    expect(below.message).toContain('below the floor');

    const above = rangeAgainstWindow([450, 700], w, 'W-M');
    expect(above.verdict).toBe('partly-outside');
    expect(above.message).toContain('above the ceiling');

    const both = rangeAgainstWindow([300, 900], w, 'W-M');
    expect(both.verdict).toBe('partly-outside');
    expect(both.message).toContain('on both sides');
    for (const a of [below, above, both]) expect(a.warn).toBe(true);
  });

  it('entirely outside says so, and never claims to have clamped anything', () => {
    const a = rangeAgainstWindow([700, 900], w, 'W-M');
    expect(a.verdict).toBe('entirely-outside');
    expect(a.message).toContain('ENTIRELY');
    expect(a.message).toContain('Nothing is being clamped');
    // The binding limits are NAMED: a window you cannot attribute is a window
    // you cannot act on.
    expect(a.message).toContain('validity');
    expect(a.message).toContain('directivity');
  });

  it('touching an edge from outside is entirely outside, not partly', () => {
    // 600-800 shares exactly one point with the window; there is no room in it.
    expect(rangeAgainstWindow([600, 800], w, 'W-M').verdict).toBe('entirely-outside');
  });
});

describe('(b) the take-over fills the window edges exactly, and nothing else', () => {
  it('freq ± margin reconstructs the annotated window', () => {
    for (const [lo, hi] of [[397, 551], [1294, 2284], [400.4, 600.6], [396.7, 549.7]] as [
      number,
      number,
    ][]) {
      const t = takeoverFor([lo, hi]);
      expect(t.freqHz - t.marginHz).toBeCloseTo(lo, 9);
      expect(t.freqHz + t.marginHz).toBeCloseTo(hi, 9);
    }
  });

  it('the numbers are typeable, not floating-point residue', () => {
    // (396.7 + 549.7) / 2 is 473.20000000000005 in binary floating point, and a
    // field that fills itself with that tells the designer the app is broken.
    const t = takeoverFor([396.7, 549.7]);
    expect(String(t.freqHz)).toBe('473.2');
    expect(String(t.marginHz)).toBe('76.5');
    // Two decimals is exact for these edges rather than a compromise: a
    // half-sum of one-decimal numbers is always a multiple of 0.05.
    const odd = takeoverFor([397, 550.5]);
    expect(String(odd.freqHz)).toBe('473.75');
    expect(odd.freqHz - odd.marginHz).toBe(397);
    expect(odd.freqHz + odd.marginHz).toBe(550.5);
  });

  it('the numbers offered are the numbers ANNOTATED - the same rounding, once', () => {
    // The edges are rounded for display, and the take-over is derived from the
    // ROUNDED pair. Rounding twice, or rounding after the halving, is how a
    // button comes to fill in a range a tenth of a hertz off what it showed.
    const w = windowFrom(396.96, 550.51);
    const edges = windowEdges(w)!;
    expect(edges).toEqual([397, 550.5]);
    const a = rangeAgainstWindow([100, 200], w, 'W-M');
    expect(a.takeover).toEqual(takeoverFor(edges));
    expect(a.takeover!.freqHz - a.takeover!.marginHz).toBeCloseTo(edges[0], 9);
    expect(a.takeover!.freqHz + a.takeover!.marginHz).toBeCloseTo(edges[1], 9);
  });

  it('the take-over offer does not depend on the range it is offered for', () => {
    // It writes the WINDOW, never a compromise between the window and what the
    // designer had - a "helpful" partial move would be a second, quiet
    // decision, which is the thing this whole surface exists not to do.
    const w = windowFrom(400, 600);
    const t = takeoverFor([400, 600]);
    for (const r of [[100, 200], [450, 550], [300, 900], null] as ([number, number] | null)[]) {
      expect(rangeAgainstWindow(r, w, 'W-M').takeover).toEqual(t);
    }
  });
});

describe('(e) the pre-start estimate counts correctly on a known candidate grid', () => {
  const axes = [
    { pairLabel: 'W-M', window: windowFrom(400, 600) },
    { pairLabel: 'M-T', window: windowFrom(1300, 2300) },
  ];
  const grid = (pairs: [number, number][]) =>
    pairs.map(([lo, hi], i) => ({ label: `c${i}`, hz: [lo, hi] }));

  it('counts candidates, not failures: one candidate outside on both axes counts once', () => {
    const e = candidatesOutsideWindows(grid([[300, 900], [500, 1500]]), axes);
    expect(e.total).toBe(2);
    expect(e.outside).toBe(1);
    expect(e.perAxis[0].outside).toBe(1);
    expect(e.perAxis[1].outside).toBe(1);
    expect(e.message).toContain('1 of 2 candidates');
  });

  it('a fully in-window grid produces no message at all', () => {
    const e = candidatesOutsideWindows(grid([[450, 1500], [550, 2000]]), axes);
    expect(e.outside).toBe(0);
    expect(e.message).toBeNull();
  });

  it('an axis with no window judges nothing there - it does not count as a pass or a fail', () => {
    const e = candidatesOutsideWindows(grid([[10, 1500], [20, 2000]]), [
      { pairLabel: 'W-M', window: null },
      axes[1],
    ]);
    expect(e.outside).toBe(0);
    expect(e.perAxis[0].outside).toBe(0);
    expect(e.perAxis[0].windowHz).toBeNull();
  });

  it('every axis that contributed is named in the message, with its window', () => {
    const e = candidatesOutsideWindows(grid([[300, 1000], [800, 2000]]), axes);
    expect(e.outside).toBe(2);
    expect(e.message).toContain('W-M (window 400–600 Hz)');
    expect(e.message).toContain('M-T (window 1300–2300 Hz)');
    // And the sentence says out loud that it changes nothing about the run.
    expect(e.message).toContain('nothing is skipped and nothing is clamped');
  });

  it('a candidate exactly on an edge is inside - an edge is part of the window', () => {
    const e = candidatesOutsideWindows(grid([[400, 2300], [600, 1300]]), axes);
    expect(e.outside).toBe(0);
  });

  it('a non-finite crossing is not judged rather than counted as outside', () => {
    const e = candidatesOutsideWindows([{ label: 'x', hz: [NaN, 1500] }], axes);
    expect(e.outside).toBe(0);
  });
});

describe('the edges are PRINTED at the precision they are compared at', () => {
  it('a fractional edge is not rounded into a sentence that contradicts itself', () => {
    // The real case, found by running the app: a ceiling of 549.6 Hz printed
    // as "550" beside a range ending at 550 says "outside, above the ceiling"
    // about two numbers a reader sees as equal.
    const w = windowFrom(397, 549.6);
    const a = rangeAgainstWindow([250, 550], w, 'W-M');
    expect(a.verdict).toBe('partly-outside');
    expect(a.message).toContain('549.6');
    expect(a.message).not.toMatch(/outside the feasible window 397–550 Hz/);
  });

  it('a whole edge stays whole', () => {
    expect(formatEdge(397)).toBe('397');
    expect(formatEdge(549.6)).toBe('549.6');
  });
});
