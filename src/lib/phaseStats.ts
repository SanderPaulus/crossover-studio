import type { IntegrationPoint } from './integration.ts';

/**
 * Phase-flatness statistics over the driver-overlap region — the header
 * numbers above the relative-phase graph. All stats deliberately exclude
 * points outside the overlap window: where one driver is buried, its phase is
 * noise and would poison every percentile.
 */

export interface PhaseStats {
  /** 0–100, from the average error: 100·(1 − avg/45°), clamped. */
  score: number;
  label: 'Excellent' | 'Very good' | 'Good' | 'Fair' | 'Poor';
  avgErrorDeg: number;
  p95ErrorDeg: number;
  /** Std dev of the SIGNED relative phase around its own mean — pure wobble,
   *  insensitive to a constant offset (which a delay/polarity tweak can fix). */
  stdDevDeg: number;
  /** Share of overlap samples with |error| within ±5/±10/±15°. */
  withinPct: { 5: number; 10: number; 15: number };
  sampleCount: number;
}

export function computePhaseStats(
  relativePhaseDeg: readonly number[],
  points: readonly IntegrationPoint[],
): PhaseStats | null {
  const signed: number[] = [];
  const errors: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i].cls === null) continue;
    signed.push(relativePhaseDeg[i]);
    errors.push(points[i].phaseErrorDeg);
  }
  if (errors.length === 0) return null;

  const n = errors.length;
  const avg = errors.reduce((a, b) => a + b, 0) / n;

  const sorted = [...errors].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];

  const mean = signed.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(signed.reduce((a, v) => a + (v - mean) ** 2, 0) / n);

  const within = (t: number) => (100 * errors.filter((e) => e <= t).length) / n;

  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - avg / 45))));
  const label =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Very good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  return {
    score,
    label,
    avgErrorDeg: avg,
    p95ErrorDeg: p95,
    stdDevDeg: stdDev,
    withinPct: { 5: within(5), 10: within(10), 15: within(15) },
    sampleCount: n,
  };
}
