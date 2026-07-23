import { describe, it, expect } from 'vitest';
import { computePhaseStats } from './phaseStats.ts';
import type { IntegrationPoint } from './integration.ts';
import { classify } from './integration.ts';

const mkPoints = (rel: number[], inOverlap: boolean[] = rel.map(() => true)): IntegrationPoint[] =>
  rel.map((r, i) => ({
    freq: 1000 + i,
    levelDiffDb: inOverlap[i] ? 0 : 40,
    weight: inOverlap[i] ? 1 : 0.01,
    phaseErrorDeg: Math.abs(r),
    cls: inOverlap[i] ? classify(r) : null,
  }));

describe('computePhaseStats', () => {
  it('perfect phase scores 100 with all-within percentages', () => {
    const rel = [0, 0, 0, 0];
    const s = computePhaseStats(rel, mkPoints(rel))!;
    expect(s.score).toBe(100);
    expect(s.label).toBe('Excellent');
    expect(s.avgErrorDeg).toBe(0);
    expect(s.p95ErrorDeg).toBe(0);
    expect(s.stdDevDeg).toBe(0);
    expect(s.withinPct[5]).toBe(100);
  });

  it('computes avg, p95, std dev and within-percentages', () => {
    // 20 samples: 10× 5°, 8× 10°, 1× 20°, 1× 40°.
    const rel = [...Array(10).fill(5), ...Array(8).fill(10), 20, 40];
    const s = computePhaseStats(rel, mkPoints(rel))!;
    expect(s.avgErrorDeg).toBeCloseTo((50 + 80 + 20 + 40) / 20, 6); // 9.5
    expect(s.p95ErrorDeg).toBe(20); // 19th of 20 sorted
    expect(s.withinPct[5]).toBeCloseTo(50, 6);
    expect(s.withinPct[10]).toBeCloseTo(90, 6);
    expect(s.withinPct[15]).toBeCloseTo(90, 6);
    expect(s.score).toBe(Math.round(100 * (1 - 9.5 / 45))); // 79 → Very good
    expect(s.label).toBe('Very good');
  });

  it('std dev ignores a constant offset (signed, around mean)', () => {
    // Constant +30° offset: avg error 30 but wobble = 0.
    const rel = [30, 30, 30, 30];
    const s = computePhaseStats(rel, mkPoints(rel))!;
    expect(s.stdDevDeg).toBe(0);
    expect(s.avgErrorDeg).toBe(30);
  });

  it('excludes points outside the overlap window', () => {
    const rel = [5, 5, 170, 170]; // the 170s are buried-driver garbage
    const s = computePhaseStats(rel, mkPoints(rel, [true, true, false, false]))!;
    expect(s.sampleCount).toBe(2);
    expect(s.avgErrorDeg).toBe(5);
    expect(s.score).toBeGreaterThan(85);
  });

  it('returns null when there is no overlap at all', () => {
    const rel = [10, 10];
    expect(computePhaseStats(rel, mkPoints(rel, [false, false]))).toBeNull();
  });
});
