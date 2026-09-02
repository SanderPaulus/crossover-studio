/**
 * UI-2 — THE CHART VIEW FOLLOWS THE USER, NOT THE DATA.
 *
 * The rule `Chart.tsx` applies to its zoom/pan override, as a pure function.
 * The claim that matters is the second one: a window the user set on one axis
 * survives a change of the OTHER axis's base — which is exactly what an SPL
 * auto-scale did not let happen (a 5 dB step in the y-domain dropped the
 * X-zoom with it, and the axis snapped from the zoomed window back to the
 * full range: Sander's "20 kHz → 10 kHz").
 */

import { describe, expect, it } from 'vitest';
import { clampWindow, effectiveView } from './chartView.ts';

const X: [number, number] = [200, 20000];
const Y_BEFORE: [number, number] = [80, 140];
const Y_AFTER: [number, number] = [75, 135]; // measured live: Rg 20 Ω moves the auto y-domain by one 5 dB step

describe('UI-2 — a user-set chart window survives a recomputation', () => {
  it('with no override, every axis follows the base — auto-scale while the user chose nothing', () => {
    const a = effectiveView(null, X, Y_BEFORE, true);
    expect(a.x).toEqual(X);
    expect(a.y).toEqual(Y_BEFORE);
    expect(a.zoomed).toBe(false);
    const b = effectiveView(null, X, Y_AFTER, true);
    expect(b.y).toEqual(Y_AFTER);
    expect(b.zoomed).toBe(false);
  });

  it('an X-zoom survives a change of the y-domain (the SPL auto-scale case)', () => {
    const view = { x: [1220, 9680] as [number, number] };
    const before = effectiveView(view, X, Y_BEFORE, true);
    const after = effectiveView(view, X, Y_AFTER, true);
    expect(before.x).toEqual([1220, 9680]);
    expect(after.x).toEqual([1220, 9680]);
    expect(after.xZoomed).toBe(true);
    // The y axis, which the user did NOT touch, keeps following the data.
    expect(after.y).toEqual(Y_AFTER);
    expect(after.yZoomed).toBe(false);
  });

  it('a y-zoom survives a change of the y-domain when it still fits', () => {
    const view = { y: [95, 125] as [number, number] };
    expect(effectiveView(view, X, Y_BEFORE, true).y).toEqual([95, 125]);
    expect(effectiveView(view, X, Y_AFTER, true).y).toEqual([95, 125]);
  });

  it('a window that no longer fits is shifted into the new base with its span kept', () => {
    // 130–150 dB was inside a 80–150 base; the data moved down to 75–135.
    expect(clampWindow([130, 150], [75, 135], false)).toEqual([115, 135]);
    // And on the log axis the span is a log span: one decade stays one decade.
    const [lo, hi] = clampWindow([5000, 50000], [200, 20000], true);
    expect(hi).toBeCloseTo(20000, 6);
    expect(Math.log10(hi) - Math.log10(lo)).toBeCloseTo(1, 9);
  });

  it('a window at least as wide as the base collapses to the base and reports "not zoomed"', () => {
    const wide = effectiveView({ x: [100, 30000] }, X, Y_BEFORE, true);
    expect(wide.x).toEqual(X);
    expect(wide.zoomed).toBe(false);
    // "use as view range": the base BECOMES the window → the zoom ends by itself.
    const committed = effectiveView({ x: [1220, 9680] }, [1220, 9680], Y_BEFORE, true);
    expect(committed.x).toEqual([1220, 9680]);
    expect(committed.zoomed).toBe(false);
  });

  it('the explicit reset is null and goes straight back to the base', () => {
    const r = effectiveView(null, X, Y_AFTER, true);
    expect(r.x).toEqual(X);
    expect(r.y).toEqual(Y_AFTER);
    expect(r.zoomed).toBe(false);
  });
});
