/**
 * V51 — THE WIRING TRANSFORM, on a bench where every number is a hand
 * calculation.
 *
 *  · HAND CALCULATION. Two equal drivers: parallel sits 20·log10(2) = 6.02 dB
 *    above series at the same amplifier voltage, phase does not move, and the
 *    impedance scales by N² = 4 — parallel→series ×4, series→parallel ×1/4.
 *  · P2 — THE IDENTITY. One driver, or the same wiring on both sides, changes
 *    nothing and says so; `rewireResponse` then returns the input verbatim.
 *  · NEW MEASUREMENT. N = 3 and N = 4 move the offset by 20·log10(N) and the
 *    factor by N² — two different laws, not one number under two names.
 *  · THE ASSUMPTION TRAVELS. Every non-identity note names equal drivers.
 */

import { describe, expect, it } from 'vitest';
import { parallelGainDb, rewireResponse, wiringTransform, WIRING_VERSION } from './wiring.ts';

describe('V51 — wiring a way of N equal drivers', () => {
  it('two drivers: parallel is 20·log10(2) above series, impedance ×4', () => {
    const t = wiringTransform(2, 'parallel', 'series');
    expect(t.identity).toBe(false);
    expect(t.splOffsetDb).toBeCloseTo(-20 * Math.log10(2), 12);
    expect(t.phaseOffsetDeg).toBe(0);
    expect(t.impedanceFactor).toBe(4);
    const back = wiringTransform(2, 'series', 'parallel');
    expect(back.splOffsetDb).toBeCloseTo(20 * Math.log10(2), 12);
    expect(back.impedanceFactor).toBe(1 / 4);
    expect(parallelGainDb(2)).toBeCloseTo(6.0206, 3);
  });

  it('P2 — one driver or the same wiring is the identity, and the response is returned verbatim', () => {
    for (const t of [wiringTransform(1, 'parallel', 'series'), wiringTransform(2, 'parallel', 'parallel'), wiringTransform(3, 'series', 'series')]) {
      expect(t.identity).toBe(true);
      expect(t.splOffsetDb).toBe(0);
      expect(t.impedanceFactor).toBe(1);
      const r = rewireResponse(t, [90, 91.5], [10, -20], [8, 6.5]);
      expect(r.db).toEqual([90, 91.5]);
      expect(r.phaseDeg).toEqual([10, -20]);
      expect(r.impedanceMagnitude).toEqual([8, 6.5]);
    }
  });

  it('N = 3 and N = 4 follow 20·log10(N) and N² — two laws, not one number', () => {
    const three = wiringTransform(3, 'parallel', 'series');
    const four = wiringTransform(4, 'parallel', 'series');
    expect(three.splOffsetDb).toBeCloseTo(-20 * Math.log10(3), 12);
    expect(four.splOffsetDb).toBeCloseTo(-20 * Math.log10(4), 12);
    expect(three.impedanceFactor).toBe(9);
    expect(four.impedanceFactor).toBe(16);
    // The offset is applied to every point and the factor to every point.
    const r = rewireResponse(four, [100, 80], [0, 90], [4, 40]);
    expect(r.db.map((v) => Number(v.toFixed(6)))).toEqual([100 - 12.041200, 80 - 12.041200].map((v) => Number(v.toFixed(6))));
    expect(r.phaseDeg).toEqual([0, 90]);
    expect(r.impedanceMagnitude).toEqual([64, 640]);
  });

  it('every derived number carries the equal-drivers assumption, and the module carries a version', () => {
    expect(wiringTransform(2, 'parallel', 'series').note).toMatch(/EQUAL/);
    expect(wiringTransform(2, 'series', 'parallel').note).toMatch(/EQUAL/);
    expect(wiringTransform(2, 'parallel', 'parallel').note).not.toMatch(/EQUAL/);
    expect(WIRING_VERSION).toMatch(/^way-wiring\/\d+\.\d+$/);
  });
});
