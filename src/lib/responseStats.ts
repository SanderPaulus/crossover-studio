/**
 * Amplitude-flatness statistics of the combined response over a frequency
 * range — the whole-range counterpart of the single peak-±dB number. The peak
 * ripple can be dominated by one narrow spot in the range; these stats say how
 * flat the response is everywhere else too, so a design with one narrow dip
 * and an otherwise ruler-flat response reads differently from one that
 * wobbles across the whole band at the same peak deviation.
 *
 * Deviations are measured against the range's own MEDIAN level: absolute level
 * is free (like the optimizer's flatness metric), and the median keeps the
 * reference honest — a mean reference gets dragged by the very suckout it is
 * supposed to judge, charging every other sample for it too. The caller passes
 * the simulation grid, which is log-spaced, so a uniform average over samples
 * is a fair per-octave weighting.
 */

export interface ResponseStats {
  /** 0–100, from the average |deviation|: 100·(1 − avg/1.5 dB), clamped.
   *  Anchored so that an average deviation of 1.5 dB — a ±3 dB-class
   *  response — scores 0, mirroring the 45° full-summing anchor of the
   *  phase score. */
  score: number;
  label: 'Excellent' | 'Very good' | 'Good' | 'Fair' | 'Poor';
  /** Mean |deviation| from the median level (dB) — the whole-range number. */
  avgDevDb: number;
  /** 95th-percentile |deviation| (dB). */
  p95DevDb: number;
  /** ± half the peak-to-peak deviation (dB) — the classic single number. */
  rippleDb: number;
  /** Share of samples within ±0.5 / ±1 / ±2 dB of the median level. */
  withinPct: { 0.5: number; 1: number; 2: number };
  sampleCount: number;
}

const SCORE_ANCHOR_DB = 1.5;

export function computeResponseStats(
  freq: readonly number[],
  spl: readonly number[],
  fLo: number,
  fHi: number,
): ResponseStats | null {
  const dev: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < fLo || freq[i] > fHi) continue;
    if (!Number.isFinite(spl[i])) continue;
    dev.push(spl[i]);
  }
  const n = dev.length;
  if (n < 8) return null; // too few samples to call anything "a range"

  const byLevel = [...dev].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? byLevel[(n - 1) / 2] : (byLevel[n / 2 - 1] + byLevel[n / 2]) / 2;
  let min = Infinity;
  let max = -Infinity;
  let sumAbs = 0;
  for (let i = 0; i < n; i++) {
    const d = dev[i] - median;
    dev[i] = Math.abs(d);
    sumAbs += dev[i];
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const avg = sumAbs / n;

  const sorted = [...dev].sort((a, b) => a - b);
  const p95 = sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];

  const within = (t: number) => (100 * dev.filter((e) => e <= t).length) / n;

  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - avg / SCORE_ANCHOR_DB))));
  const label =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Very good' : score >= 55 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  return {
    score,
    label,
    avgDevDb: avg,
    p95DevDb: p95,
    rippleDb: (max - min) / 2,
    withinPct: { 0.5: within(0.5), 1: within(1), 2: within(2) },
    sampleCount: n,
  };
}
