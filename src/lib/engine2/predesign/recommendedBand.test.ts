/**
 * F3c ACCEPTANCE, DELIVERABLE 1 — the composition.
 *
 * Five shapes of the same subtraction, and they are asserted separately
 * because they fail separately: a window whose worst lobing zone hangs off the
 * bottom, off the top, sits in the middle, misses it entirely, or swallows it
 * whole. Four of the five are one-liners in the implementation and exactly the
 * kind of thing an off-by-one in a comparison gets right for three cases and
 * wrong for the fourth — which is why none of them is left to the reader.
 *
 * The windows are built through the REAL derivation rather than as literals.
 * A composition tested against a hand-written `XoWindowResult` is a
 * composition tested against a shape, and the shape and the app would then be
 * free to drift.
 */

import { describe, expect, it } from 'vitest';
import { crossoverWindow, type XoWindowResult } from './xoWindow.ts';
import { recommendedBand } from './recommendedBand.ts';
import { takeoverFor } from './xoRangeAdvice.ts';
import { SPEED_OF_SOUND_M_S, MM_PER_M } from '../constants.ts';

/**
 * A spacing chosen so that c/d is a round thousand.
 *
 * Derived from the constants rather than typed, so the zone edges below stay
 * true if anyone ever changes the speed of sound the engine works in. With
 * c/d = 1000 Hz the zones land where the multipliers put them: worst
 * 500–700 Hz, favourable 0–450 Hz and 1000–1400 Hz.
 */
const C_OVER_D_HZ = 1000;
const SPACING_MM = (SPEED_OF_SOUND_M_S / C_OVER_D_HZ) * MM_PER_M;
const WORST: [number, number] = [500, 700];

/**
 * A window with the given edges and the lobing zones above.
 *
 * The −6 dB directivity point sets the ceiling because that limit carries no
 * severity weighting and so lands exactly where it is put; the validity floor
 * sets the bottom. `upperFsHz` is optional — the fs floor would otherwise
 * compete with the validity floor and move the window out from under the test.
 */
const win = (
  floorHz: number,
  ceilingHz: number,
  opts: { fsHz?: number | null; spacingMm?: number | null; breakupDb?: number } = {},
): XoWindowResult =>
  crossoverWindow({
    lower: 'woofer',
    upper: 'mid',
    order: 4,
    validityFloorHz: floorHz,
    validityFloorSource: 'woofer far field',
    upperFsHz: opts.fsHz ?? null,
    lowerBreakups: opts.breakupDb ? [{ fHz: ceilingHz * 2, dB: opts.breakupDb }] : [],
    lowerMinus6Hz: ceilingHz,
    lowerMinus6AngleDeg: 30,
    spacingMm: opts.spacingMm === undefined ? SPACING_MM : opts.spacingMm,
  });

describe('the window minus the worst lobing zone: zero, one or two segments', () => {
  it('the zone hangs off the BOTTOM: one segment, from the zone top to the ceiling', () => {
    const r = recommendedBand(win(600, 900));
    expect(r.fallback).toBe(false);
    expect(r.segments.map((s) => s.hz)).toEqual([[WORST[1], 900]]);
    // The lower edge is the zone's, the upper edge is the window's — and the
    // segment says which is which rather than leaving the reader to infer it.
    expect(r.segments[0].edgeFrom).toEqual(['worst-zone', 'window']);
    expect(r.worstZoneHz).toEqual(WORST);
  });

  it('the zone hangs off the TOP: one segment, from the floor to the zone bottom', () => {
    const r = recommendedBand(win(300, 600));
    expect(r.segments.map((s) => s.hz)).toEqual([[300, WORST[0]]]);
    expect(r.segments[0].edgeFrom).toEqual(['window', 'worst-zone']);
  });

  it('the zone sits in the MIDDLE: two segments, and BOTH are shown', () => {
    const r = recommendedBand(win(400, 900));
    expect(r.segments.map((s) => s.hz)).toEqual([
      [400, WORST[0]],
      [WORST[1], 900],
    ]);
    // No winner is named. Ranking the two would be a taste judgement with a
    // number on it — A5e.1's parked decision, not this surface's.
    expect(r.fallback).toBe(false);
    expect(r.message).toContain('400–500 Hz');
    expect(r.message).toContain('700–900 Hz');
  });

  it('NO overlap at all: one segment, and it is the whole window', () => {
    const above = recommendedBand(win(750, 900));
    expect(above.segments.map((s) => s.hz)).toEqual([[750, 900]]);
    expect(above.segments[0].edgeFrom).toEqual(['window', 'window']);

    const below = recommendedBand(win(100, 400));
    expect(below.segments.map((s) => s.hz)).toEqual([[100, 400]]);
    expect(below.segments[0].edgeFrom).toEqual(['window', 'window']);
  });

  it('no lobing zone at all (no spacing): the whole window, with no zone reason', () => {
    const r = recommendedBand(win(400, 900, { spacingMm: null }));
    expect(r.worstZoneHz).toBeNull();
    expect(r.segments.map((s) => s.hz)).toEqual([[400, 900]]);
    expect(r.segments[0].reasons.join(' ')).not.toContain('worst lobing zone');
  });

  it('the zone swallows the window WHOLE: no segment, and the fallback says so', () => {
    const r = recommendedBand(win(520, 680));
    expect(r.segments).toEqual([]);
    expect(r.fallback).toBe(true);
    expect(r.fallbackHz).toEqual([520, 680]);
    expect(r.message).toContain('no part of the window escapes the worst lobing zone');
    expect(r.message).toContain('the edge furthest from 0.5·λ is the least bad');
    // Which edge that is comes out of the octave distance to 0.5·λ (500 Hz
    // here), not out of a preference: 680 is further from 500 than 520 is.
    expect(r.leastBadEdgeHz).toBe(680);
    // And the recommendation is still SOMETHING: the whole window, so the
    // estimate downstream does not read this as "no band exists".
    expect(r.effectiveHz).toEqual([[520, 680]]);
  });

  it('no window at all produces no verdict — absence is not a verdict (P4)', () => {
    for (const r of [recommendedBand(null), recommendedBand(undefined)]) {
      expect(r.segments).toEqual([]);
      expect(r.fallback).toBe(false);
      expect(r.message).toBeNull();
      expect(r.effectiveHz).toEqual([]);
    }
    // An EMPTY window is a statement about the drivers, and the band has
    // nothing to add to it.
    const empty = recommendedBand(win(900, 500));
    expect(empty.message).toBeNull();
    expect(empty.effectiveHz).toEqual([]);
  });
});

describe('the edge reasons', () => {
  it('names the octave distance from the LOWER edge to f_s of the upper driver', () => {
    // f_s 200 Hz, order 4 ⇒ the fs floor is 1.4 × 200 = 280 Hz, below the
    // stated validity floor, so the window is the one the test asked for.
    const r = recommendedBand(win(400, 900, { fsHz: 200 }));
    expect(r.segments).toHaveLength(2);
    // 400 Hz is exactly one octave over 200 Hz; 700 Hz is log2(3.5).
    expect(r.segments[0].octavesAboveFs).toBeCloseTo(1, 9);
    expect(r.segments[1].octavesAboveFs).toBeCloseTo(Math.log2(3.5), 9);
    expect(r.segments[0].reasons.join(' ')).toContain('1.00 oct above f_s of mid (200 Hz)');
    // Higher is further from the resonance, and the sentence carries the mark
    // the dialog shows for it.
    expect(r.segments[1].summary).toContain('▲');
  });

  it('says nothing about f_s when the upper driver has no measured resonance', () => {
    const r = recommendedBand(win(400, 900));
    expect(r.segments[0].octavesAboveFs).toBeNull();
    expect(r.segments[0].reasons.join(' ')).not.toContain('f_s');
  });

  it('names the nearest FAVOURABLE zone, and zero octaves when it overlaps one', () => {
    const r = recommendedBand(win(400, 1200));
    // [400,500] is 1000/500 = one octave under the favourable 1000–1400 band,
    // but it also touches the low favourable zone 0–450 Hz, which is nearer.
    expect(r.segments[0].octavesToFavourable).toBe(0);
    expect(r.segments[0].reasons.join(' ')).toContain('overlaps the favourable lobing zone');
    // [700,1200] reaches into the second favourable zone outright.
    expect(r.segments[1].octavesToFavourable).toBe(0);
    expect(r.segments[1].favourableHz).toEqual([1000, 1400]);
  });

  it('a segment that reaches no favourable zone gets the DISTANCE, in octaves', () => {
    // Floor at 700 so the low segment disappears; ceiling at 800, short of the
    // favourable zone that starts at 1000 Hz.
    const r = recommendedBand(win(700, 800));
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].octavesToFavourable).toBeCloseTo(Math.log2(1000 / 800), 9);
    expect(r.segments[0].reasons.join(' ')).toContain('oct from the favourable lobing zone');
  });
});

describe('the take-over values and the inherited flags', () => {
  it('the take-over fills the SEGMENT edges exactly, by the same rule the window uses', () => {
    const r = recommendedBand(win(400, 900));
    for (const seg of r.segments) {
      expect(seg.takeover).toEqual(takeoverFor(seg.hz));
      expect(seg.takeover.freqHz - seg.takeover.marginHz).toBeCloseTo(seg.hz[0], 9);
      expect(seg.takeover.freqHz + seg.takeover.marginHz).toBeCloseTo(seg.hz[1], 9);
    }
  });

  it('an UNCALIBRATED ceiling is inherited by the band carved out of it', () => {
    // A significant breakup is what brings the severity weighting — and its
    // uncalibrated ramp — into the ceiling. Its divided value (2400/… ) has to
    // land under the directivity point for it to bind.
    const w = crossoverWindow({
      lower: 'woofer',
      upper: 'mid',
      order: 4,
      validityFloorHz: 300,
      validityFloorSource: 'woofer far field',
      upperFsHz: null,
      lowerBreakups: [{ fHz: 2400, dB: 3.2 }],
      lowerMinus6Hz: null,
      lowerMinus6AngleDeg: null,
      spacingMm: SPACING_MM,
    });
    expect(w.ceilingBy?.rule).toBe('breakup');
    const r = recommendedBand(w);
    expect(r.uncalibrated).toHaveLength(1);
    expect(r.uncalibrated[0]).toContain('uncalibrated');
    // A band drawn from an uncalibrated ceiling is exactly as uncalibrated as
    // the ceiling; it does not get to look firmer than its source.
    expect(r.uncalibrated[0]).toBe(w.ceilingBy!.uncalibrated);
  });

  it('a window with no uncalibrated limit inherits no flag', () => {
    // Nothing to inherit is not the same as a flag that failed to travel: the
    // assert above is only worth something because this one holds too.
    expect(recommendedBand(win(400, 900)).uncalibrated).toEqual([]);
  });
});
