import { describe, expect, it } from 'vitest';
import { logspace } from './dsp.ts';
import { bandIndices, bandMedian, bandStats, flatnessObjective, reachableBand, reachesLevelHz } from './bandMetrics.ts';

const grid = logspace(100, 20000, 400);
const flat = (level: number) => grid.map(() => level);

describe('bandStats', () => {
  it('is exact on a flat response', () => {
    const s = bandStats(grid, flat(90), [200, 10000]);
    expect(s.count).toBeGreaterThan(50);
    expect(s.mean).toBeCloseTo(90, 9);
    expect(s.median).toBeCloseTo(90, 9);
    expect(s.std).toBeCloseTo(0, 9);
    expect(s.avgDev).toBeCloseTo(0, 9);
    expect(s.peak).toBeCloseTo(0, 9);
    expect(s.peakExcess).toBeCloseTo(0, 9);
  });

  it('separates excess from deficit', () => {
    const spl = grid.map((f) => (f > 4900 && f < 5100 ? 100 : f > 900 && f < 1100 ? 80 : 90));
    const s = bandStats(grid, spl, [200, 10000], 'median');
    expect(s.median).toBeCloseTo(90, 6);
    expect(s.peakExcess).toBeCloseTo(10, 6);
    expect(s.peakDeficit).toBeCloseTo(10, 6);
    expect(s.peak).toBeCloseTo(10, 6); // ±(max−min)/2
  });

  it('measures against an ABSOLUTE reference when given a number', () => {
    const s = bandStats(grid, flat(90), [200, 10000], 104);
    // Everything sits 14 dB below the target: no spread, but a real deficit.
    expect(s.std).toBeCloseTo(14, 6);
    expect(s.avgDev).toBeCloseTo(14, 6);
    expect(s.peakDeficit).toBeCloseTo(14, 6);
    expect(s.peakExcess).toBeCloseTo(0, 6);
  });

  it('returns zeros rather than NaN for a band off the grid', () => {
    const s = bandStats(grid, flat(90), [30000, 40000]);
    expect(s.count).toBe(0);
    expect(Number.isFinite(s.std)).toBe(true);
    expect(s.std).toBe(0);
  });

  it('median ignores a narrow notch that would drag the mean', () => {
    const spl = grid.map((f) => (f > 4900 && f < 5100 ? 50 : 90));
    const s = bandStats(grid, spl, [200, 10000], 'median');
    expect(s.median).toBeCloseTo(90, 6);
    expect(s.mean).toBeLessThan(90); // the mean IS dragged — that is the point
  });
});

describe('flatnessObjective', () => {
  it('reproduces plain std at weight 0 — opt-out must be exact', () => {
    const spl = grid.map((f) => 90 + 8 * Math.exp(-((Math.log2(f / 6000)) ** 2) * 50));
    const s = bandStats(grid, spl, [200, 18000], 'median');
    expect(flatnessObjective(s, 0)).toBe(s.std);
  });

  it('makes a narrow resonance visible where std barely moves', () => {
    // A 12 dB spike over a sliver of the band: std hardly notices it.
    const spl = grid.map((f) => 90 + 12 * Math.exp(-((Math.log2(f / 6000)) ** 2) * 200));
    const s = bandStats(grid, spl, [200, 18000], 'median');
    expect(s.std).toBeLessThan(2); // the blindness this exists to fix
    expect(flatnessObjective(s, 0.35)).toBeGreaterThan(s.std * 2);
  });
});

describe('reachableBand', () => {
  it('trims a dead top edge but keeps a mid-band dip in scope', () => {
    const spl = grid.map((f) => {
      if (f > 4500 && f < 5500) return 70; // deep MID-band dip — must stay in
      return f > 9000 ? 90 - 30 * Math.min(1, Math.log2(f / 9000)) : 90;
    });
    const [lo, hi] = reachableBand(grid, spl, [200, 19000], 6);
    expect(hi).toBeLessThan(14000);
    expect(hi).toBeGreaterThan(8000);
    expect(lo).toBeLessThan(250);
    // The dip is inside the surviving band, not carved out of it.
    expect(lo).toBeLessThan(4500);
    expect(hi).toBeGreaterThan(5500);
  });

  it('hands back the requested band when trimming would leave a sliver', () => {
    // Only a narrow window reaches the target level; trimming to it would
    // leave far less than an octave, so the caller gets its band back and can
    // report honestly instead of "designing" a sliver.
    const spl = grid.map((f) => (f > 900 && f < 1100 ? 90 : 40));
    expect(reachableBand(grid, spl, [200, 19000], 6, 90)).toEqual([200, 19000]);
  });

  it('accepts an absolute floor as the reference', () => {
    const spl = grid.map((f) => (f > 9000 ? 80 : 100));
    const [, hi] = reachableBand(grid, spl, [200, 19000], 0, 95);
    expect(hi).toBeLessThan(11000); // everything below 95 dB is out of reach
  });
});

describe('bandIndices / bandMedian', () => {
  it('bandIndices respects both edges inclusively', () => {
    const f = [100, 200, 300, 400];
    expect(bandIndices(f, [200, 300])).toEqual([1, 2]);
  });

  it('bandMedian averages the middle pair for an even count', () => {
    const f = [100, 200, 300, 400];
    expect(bandMedian(f, [10, 20, 30, 40], [100, 400])).toBeCloseTo(25, 9);
  });
});

describe('reachesLevelHz — the handover floor made measurable', () => {
  const freq = Array.from({ length: 200 }, (_, i) => 100 * (200 / 100) ** (i / 199) * 10 ** (i / 199 * 0));
  // Log grid 100..10000.
  const logGrid = Array.from({ length: 200 }, (_, i) => 100 * (10000 / 100) ** (i / 199));
  void freq;

  it('finds where a rising driver reaches its passband', () => {
    // 24 dB/oct rise to full level at 500 Hz, flat 100 dB above.
    const spl = logGrid.map((f) => (f < 500 ? 100 - 24 * Math.log2(500 / f) : 100));
    const hz = reachesLevelHz(logGrid, spl, 6);
    // Within 6 dB of the passband ≈ a quarter octave below 500.
    expect(hz).not.toBeNull();
    expect(hz!).toBeGreaterThan(350);
    expect(hz!).toBeLessThan(510);
  });

  it('long measured tails do not drag the reference off the passband', () => {
    // A driver measured across its whole range: rising flank below 500,
    // passband 100 dB up to 5 kHz, falling flank above — the tails cover
    // half the grid. A plain median would sit below the passband and call
    // the flank "at level" far too early (the Robbert-mid lesson: 157 Hz for
    // a driver that is at level from ~170); the upper-quartile reference is
    // the passband.
    const spl = logGrid.map((f) =>
      f < 500 ? 100 - 30 * Math.log2(500 / f) : f > 5000 ? 100 - 30 * Math.log2(f / 5000) : 100,
    );
    const hz = reachesLevelHz(logGrid, spl, 6);
    expect(hz).not.toBeNull();
    expect(hz!).toBeGreaterThan(350);
    expect(hz!).toBeLessThan(510);
  });

  it('already-at-level from the first sample returns the first frequency', () => {
    const spl = logGrid.map(() => 100);
    expect(reachesLevelHz(logGrid, spl, 6)).toBe(logGrid[0]);
  });

  it('silent-ghost samples are ignored', () => {
    const spl = logGrid.map((f) => (f < 300 ? -400 : 100));
    const hz = reachesLevelHz(logGrid, spl, 6);
    expect(hz).not.toBeNull();
    expect(hz!).toBeGreaterThanOrEqual(300);
  });
});
