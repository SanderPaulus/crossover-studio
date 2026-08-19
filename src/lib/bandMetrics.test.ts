import { describe, expect, it } from 'vitest';
import { logspace } from './dsp.ts';
import { bandIndices, bandMedian, bandStats, flatnessObjective, powerShape, reachableBand, reachesLevelHz } from './bandMetrics.ts';

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

describe('powerShape — the crossover owns the SMOOTHNESS of the power response, not its slope', () => {
  const grid = logspace(200, 20000, 400);
  const line = (dbPerDec: number, offset = 100) => grid.map((f) => offset + dbPerDec * Math.log10(f / 200));
  const amp = (onStd: number, shp: ReturnType<typeof powerShape>, dW = 0.25, foldW = 0.5) =>
    (1 - dW) * onStd ** 2 + dW * (shp.residualStdDb ** 2 + foldW * shp.foldDb ** 2);
  const legacyStd = (y: number[]) => {
    const m = y.reduce((a, v) => a + v, 0) / y.length;
    return Math.sqrt(y.reduce((a, v) => a + (v - m) ** 2, 0) / y.length);
  };

  it('(i) flat axis + textbook-falling power beats flat power + hanging axis (smooth), the reverse in legacy', () => {
    const A = powerShape(grid, line(-4), [200, 20000], [2000]); // falling, perfectly smooth
    const B = powerShape(grid, line(0), [200, 20000], [2000]); // flat power
    const onA = 0; // flat on-axis
    const onB = 1; // hanging on-axis, 1 dB std
    expect(A.residualStdDb).toBeLessThan(0.01);
    expect(A.slopeDbPerDecade).toBeCloseTo(-4, 2);
    expect(amp(onA, A)).toBeLessThan(amp(onB, B));
    // Legacy flatness would have preferred B: the −4 dB/dec line reads as ~2.3 dB std.
    const legacyA = 0.25 * legacyStd(line(-4)) ** 2;
    const legacyB = 0.75 * onB ** 2;
    expect(legacyA).toBeGreaterThan(legacyB);
  });

  it('(ii) a 2 dB DI fold around the crossing measurably worsens the amplitude term', () => {
    const smooth = line(-3);
    const folded = smooth.map((v, i) => v + (grid[i] > 2000 / 1.3 && grid[i] < 2000 * 1.3 ? 2 : 0));
    const S = powerShape(grid, smooth, [200, 20000], [2000]);
    const F = powerShape(grid, folded, [200, 20000], [2000]);
    expect(F.foldDb).toBeGreaterThan(1.5);
    expect(S.foldDb).toBeLessThan(0.05);
    expect(amp(0.5, F)).toBeGreaterThan(amp(0.5, S) * 1.5);
  });

  it('(iii) two designs that differ only in power slope (−2 vs −6 dB/dec, both smooth) score EQUAL', () => {
    const a = powerShape(grid, line(-2), [200, 20000], [2000]);
    const b = powerShape(grid, line(-6), [200, 20000], [2000]);
    expect(Math.abs(amp(0.5, a) - amp(0.5, b))).toBeLessThan(1e-9);
    expect(a.slopeDbPerDecade).toBeCloseTo(-2, 2);
    expect(b.slopeDbPerDecade).toBeCloseTo(-6, 2);
  });

  it('a rising slope is reported (the UI warns above +1 dB/dec); no crossing → fold 0', () => {
    const r = powerShape(grid, line(+2.5), [200, 20000]);
    expect(r.slopeDbPerDecade).toBeGreaterThan(1);
    expect(r.foldDb).toBe(0);
  });
});
