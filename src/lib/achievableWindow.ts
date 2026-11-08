/**
 * WHAT ±dB WINDOW DO THE DRIVERS ALLOW? (08-11-2026)
 *
 * The guided "What do you want to build?" profiles stated a fixed SPL window
 * (±3 / ±2 / ±1.5 dB). Sander: those were reachable because the Koan drivers
 * are unusually smooth — not every driver gets to ±3. This module reads, per
 * driver, the fine structure a passive network cannot remove: the response at
 * the smoothing the window itself judges on (1/6 octave, `judgeResponse`) minus
 * a broad trend (one octave — what slopes, shelves and a trap can follow),
 * over the band that driver plays in. Half its peak-to-peak is the estimate,
 * and the roughest driver sets it.
 *
 * MEASURED BEFORE IT WAS BUILT (`scripts/measure-achievable-window.ts`,
 * `test-fixtures/achievable_window.json`): Koan ±1.03 (tweeter; woofer pair
 * 0.90, mid 0.71), Robbert 3-weg ±2.60 (tweeter; mid 2.51), Robbert 2-weg
 * ±1.71. The Koan route delivered ±1.5–2.1 — about twice the estimate.
 *
 * WHAT IT IS NOT: a prediction of the delivered window. The crossover's own
 * summation, the target curve and the relaxation of the search all add to it;
 * the profiles turn the estimate into a requirement with a factor
 * (`guidedProfiles.ts`). No engine import (the motor-boundary rule).
 */
import { logspace, resample } from './dsp.ts';

export const ACHIEVABLE_WINDOW_VERSION = 'achievable-window/1.0';

/** The smoothing the SPL window judges on — equal to engine2's
 *  `WINDOW_SMOOTHING_OCTAVES` (a test pins it; this layer may not import it). */
export const FINE_SMOOTHING_OCT = 1 / 6;
/** The trend a passive network can follow, octaves (measured arm: 1/2, 1, 2). */
export const TREND_OCT = 1;
/** How far a driver's band reaches past each of its crossings, octaves. */
export const OVERLAP_OCT = 0.5;
const POINTS_PER_OCT = 48;

export interface AchievableDriver {
  name: string;
  freq: readonly number[];
  db: readonly number[];
  /** Where the measurement is valid, Hz. */
  validHz: readonly [number, number];
}

export interface AchievableWindow {
  /** The roughest driver's ±, dB. */
  plusMinusDb: number;
  /** Which driver that is. */
  roughest: string;
  perDriver: { name: string; bandHz: [number, number]; plusMinusDb: number | null }[];
}

/**
 * A Gaussian-weighted LOCAL LINEAR fit in log-frequency, `octaves` wide (σ =
 * octaves/2, the convention of `smoothDbGaussian`). A plain Gaussian average
 * turns one-sided at a band edge and bends a straight tilt there — measured:
 * a 3 dB/octave tilt read as ±0.41 dB. A local line follows a tilt exactly
 * to the edge, so only real structure is left in the difference.
 */
function localLinear(lf: readonly number[], db: readonly number[], octaves: number): number[] {
  const sigma = octaves / 2;
  const reach = 3 * sigma;
  return lf.map((x0) => {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = 0; j < lf.length; j++) {
      const dx = lf[j] - x0;
      if (dx < -reach || dx > reach) continue;
      const w = Math.exp(-0.5 * (dx / sigma) ** 2);
      sw += w; sx += w * dx; sy += w * db[j]; sxx += w * dx * dx; sxy += w * dx * db[j];
    }
    const den = sw * sxx - sx * sx;
    // The intercept at dx = 0; a degenerate neighbourhood falls back to the mean.
    return Math.abs(den) > 1e-12 ? (sy * sxx - sx * sxy) / den : sy / sw;
  });
}

/** ± of one response on [lo, hi]; null when the band is too short to read a trend. */
export function roughnessPlusMinusDb(
  freq: readonly number[],
  db: readonly number[],
  lo: number,
  hi: number,
  trendOct = TREND_OCT,
): number | null {
  const bot = Math.max(lo, freq[0]);
  const top = Math.min(hi, freq[freq.length - 1]);
  if (!(top > bot) || Math.log2(top / bot) <= trendOct) return null;
  const n = Math.max(8, Math.round(Math.log2(top / bot) * POINTS_PER_OCT));
  const g = logspace(bot, top, n);
  const r = resample([...freq], [...db], freq.map(() => 0), g).spl;
  const lf = g.map((x) => Math.log2(x));
  const fine = localLinear(lf, r, FINE_SMOOTHING_OCT);
  const trend = localLinear(lf, r, trendOct);
  let mx = -Infinity;
  let mn = Infinity;
  for (let i = 0; i < g.length; i++) {
    const d = fine[i] - trend[i];
    if (d > mx) mx = d;
    if (d < mn) mn = d;
  }
  return Number.isFinite(mx) && Number.isFinite(mn) ? (mx - mn) / 2 : null;
}

/**
 * The estimate for a set of drivers LOW TO HIGH and the crossings between them
 * (one fewer). `lowestFloorHz` is where the lowest driver's judged band starts.
 * Null when the counts do not match or no driver could be read (P4: no guess).
 */
export function achievableWindow(
  drivers: readonly AchievableDriver[],
  crossingsHz: readonly number[],
  lowestFloorHz: number,
): AchievableWindow | null {
  if (drivers.length < 1 || crossingsHz.length !== drivers.length - 1) return null;
  if (crossingsHz.some((x) => !(x > 0))) return null;
  const k = 2 ** OVERLAP_OCT;
  const perDriver = drivers.map((d, i) => {
    const lo = Math.max(i === 0 ? lowestFloorHz : crossingsHz[i - 1] / k, d.validHz[0]);
    const hi = Math.min(i === drivers.length - 1 ? d.validHz[1] : crossingsHz[i] * k, d.validHz[1]);
    return { name: d.name, bandHz: [lo, hi] as [number, number], plusMinusDb: roughnessPlusMinusDb(d.freq, d.db, lo, hi) };
  });
  let best: { name: string; v: number } | null = null;
  for (const p of perDriver) if (p.plusMinusDb !== null && (!best || p.plusMinusDb > best.v)) best = { name: p.name, v: p.plusMinusDb };
  return best ? { plusMinusDb: best.v, roughest: best.name, perDriver } : null;
}
