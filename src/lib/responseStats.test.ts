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
    expect(s.score).toBeGreaterThanOrEqual(90); // …the range score stays honest
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

  it('calibration: a ±1 dB-class response reads as Very good, a ±3 dB-class wobble as red', () => {
    // Designer-judgment anchors (Sanders les): a whole-band wobble staying
    // within roughly ±1 dB is "very good" — the score must not paint it as a
    // problem. A genuine ±3 dB-class wobble must land clearly below 50.
    const oneDbClass = freq.map((_, i) => 90 + 0.9 * Math.sin(i / 8)); // avg ≈ 0.57
    const threeDbClass = freq.map((_, i) => 90 + 3 * Math.sin(i / 8)); // avg ≈ 1.9
    const good = computeResponseStats(freq, oneDbClass, 200, 20000)!;
    const bad = computeResponseStats(freq, threeDbClass, 200, 20000)!;
    expect(good.score).toBeGreaterThanOrEqual(83);
    expect(good.score).toBeLessThanOrEqual(88);
    expect(good.label).toBe('Very good');
    expect(bad.score).toBeLessThan(50);
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

  it('reports WHERE the extremes are, on the absolute dB scale', () => {
    // One planted bump and one planted dip, both inside the range.
    const spl = freq.map((f) => (f > 4900 && f < 5100 ? 96 : f > 990 && f < 1010 ? 85 : 90));
    const s = computeResponseStats(freq, spl, 200, 20000)!;
    expect(s.peak.freqHz).toBeGreaterThan(4900);
    expect(s.peak.freqHz).toBeLessThan(5100);
    expect(s.peak.splDb).toBeCloseTo(96, 6);
    expect(s.dip.freqHz).toBeGreaterThan(990);
    expect(s.dip.freqHz).toBeLessThan(1010);
    expect(s.dip.splDb).toBeCloseTo(85, 6);
    // The markers and the headline ripple must be the same measurement: the
    // chart annotation may never disagree with the number in the strip.
    expect((s.peak.splDb - s.dip.splDb) / 2).toBeCloseTo(s.rippleDb, 9);
    expect(s.peak.devDb).toBeCloseTo(s.peak.splDb - s.medianDb, 9);
    expect(s.dip.devDb).toBeCloseTo(s.dip.splDb - s.medianDb, 9);
  });

  it('keeps the extremes inside the requested range', () => {
    // Loudest and quietest points both sit OUTSIDE the window asked for.
    const spl = freq.map((f) => (f < 400 ? 110 : f > 15000 ? 70 : 90 + (f > 2000 && f < 2100 ? 2 : 0)));
    const s = computeResponseStats(freq, spl, 1000, 10000)!;
    expect(s.peak.freqHz).toBeGreaterThanOrEqual(1000);
    expect(s.peak.freqHz).toBeLessThanOrEqual(10000);
    expect(s.dip.freqHz).toBeGreaterThanOrEqual(1000);
    expect(s.dip.freqHz).toBeLessThanOrEqual(10000);
    expect(s.peak.splDb).toBeCloseTo(92, 6);
  });

  it('p95 sits between avg and peak on a mixed response', () => {
    const spl = freq.map((_, i) => 90 + (i % 50 === 0 ? 4 : 0.4 * Math.sin(i / 5)));
    const s = computeResponseStats(freq, spl, 200, 20000)!;
    expect(s.p95DevDb).toBeGreaterThanOrEqual(s.avgDevDb);
    expect(s.p95DevDb).toBeLessThanOrEqual(s.rippleDb + 1e-12);
  });
});
