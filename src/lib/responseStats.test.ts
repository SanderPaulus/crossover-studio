import { describe, expect, it } from 'vitest';
import { computeResponseStats } from './responseStats.ts';

/** Log-spaced grid, like the simulation grid the App feeds in. */
function logGrid(fLo: number, fHi: number, n: number): number[] {
  const out: number[] = [];
  const r = Math.log(fHi / fLo);
  for (let i = 0; i < n; i++) out.push(fLo * Math.exp((r * i) / (n - 1)));
  return out;
}

describe('computeResponseStats', () => {
  const freq = logGrid(200, 20000, 400);

  it('scores a ruler-flat response 100 with zero ripple', () => {
    const s = computeResponseStats(freq, freq.map(() => 90), 200, 20000)!;
    expect(s.score).toBe(100);
    expect(s.rippleDb).toBe(0);
    expect(s.avgDevDb).toBe(0);
    expect(s.withinPct[0.5]).toBe(100);
    expect(s.label).toBe('Excellent');
  });

  it('one narrow dip barely moves the whole-range score but dominates the peak ripple', () => {
    // Flat everywhere except a ~1/20-of-the-range notch of −6 dB.
    const spl = freq.map((_, i) => (i >= 190 && i < 210 ? 84 : 90));
    const s = computeResponseStats(freq, spl, 200, 20000)!;
    expect(s.rippleDb).toBeGreaterThan(2.5); // the classic number blows up…
    expect(s.score).toBeGreaterThanOrEqual(78); // …the range score stays honest
    expect(s.withinPct[1]).toBeGreaterThan(90);
  });

  it('a whole-band wobble scores worse than a narrow dip with the same peak deviation', () => {
    const wobble = freq.map((_, i) => 90 + 3 * Math.sin(i / 8));
    const notch = freq.map((_, i) => (i >= 190 && i < 210 ? 87 : 90));
    const sw = computeResponseStats(freq, wobble, 200, 20000)!;
    const sn = computeResponseStats(freq, notch, 200, 20000)!;
    expect(sw.score).toBeLessThan(sn.score);
    expect(sw.avgDevDb).toBeGreaterThan(sn.avgDevDb);
  });

  it('is level-free: an offset changes nothing', () => {
    const spl = freq.map((_, i) => 90 + Math.sin(i / 10));
    const a = computeResponseStats(freq, spl, 200, 20000)!;
    const b = computeResponseStats(freq, spl.map((v) => v + 25), 200, 20000)!;
    expect(b.score).toBe(a.score);
    expect(b.avgDevDb).toBeCloseTo(a.avgDevDb, 9);
    expect(b.p95DevDb).toBeCloseTo(a.p95DevDb, 9);
    expect(b.rippleDb).toBeCloseTo(a.rippleDb, 9);
  });

  it('honours the frequency range and rejects too-small ranges', () => {
    // Deviation lives only below 1 kHz; a 2–20 kHz window must not see it.
    const spl = freq.map((f) => (f < 1000 ? 84 : 90));
    const hi = computeResponseStats(freq, spl, 2000, 20000)!;
    expect(hi.rippleDb).toBe(0);
    expect(hi.score).toBe(100);
    expect(computeResponseStats(freq, spl, 500, 505)).toBeNull();
  });

  it('p95 sits between avg and peak on a mixed response', () => {
    const spl = freq.map((_, i) => 90 + (i % 50 === 0 ? 4 : 0.4 * Math.sin(i / 5)));
    const s = computeResponseStats(freq, spl, 200, 20000)!;
    expect(s.p95DevDb).toBeGreaterThanOrEqual(s.avgDevDb);
    expect(s.p95DevDb).toBeLessThanOrEqual(s.rippleDb + 1e-12);
  });
});
