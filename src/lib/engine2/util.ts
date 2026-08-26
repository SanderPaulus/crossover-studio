/**
 * Shared numerics for engine2. Nothing here knows about loudspeakers; every
 * function is band-free and takes its window from its caller (P6).
 *
 * All numeric literals ≥ the P6 threshold come from `constants.ts` — this file
 * is where the unit conversions get used, so it imports rather more of them
 * than anything else does.
 */

import {
  DB_PER_DECADE_AMPLITUDE,
  DB_PER_DECADE_POWER,
  DEFAULT_TREND_OCTAVE_FRACTION,
  DEG_PER_HALF_TURN,
  LOG_FLOOR,
  SPEED_OF_SOUND_M_S,
} from './constants.ts';
import type { Complex } from '../complex.ts';

/** 20·log10|x| — amplitude/pressure/voltage ratio in dB. */
export const dbAmp = (x: number): number =>
  DB_PER_DECADE_AMPLITUDE * Math.log10(Math.abs(x) + LOG_FLOOR);

/** 10·log10(x) — power ratio in dB. */
export const dbPow = (x: number): number =>
  DB_PER_DECADE_POWER * Math.log10(Math.abs(x) + LOG_FLOOR);

/** dB → amplitude ratio. */
export const ampFromDb = (db: number): number => 10 ** (db / DB_PER_DECADE_AMPLITUDE);

export const radToDeg = (rad: number): number => (rad * DEG_PER_HALF_TURN) / Math.PI;
export const degToRad = (deg: number): number => (deg * Math.PI) / DEG_PER_HALF_TURN;

/** Wavelength in metres at f Hz. */
export const wavelengthM = (fHz: number): number => SPEED_OF_SOUND_M_S / fHz;

/** Octaves from a to b (signed). */
export const octavesBetween = (aHz: number, bHz: number): number => Math.log2(bHz / aHz);

/** Complex magnitude. */
export const cabs = (z: Complex): number => Math.hypot(z.re, z.im);
/** Complex argument in degrees. */
export const cargDeg = (z: Complex): number => radToDeg(Math.atan2(z.im, z.re));

/**
 * Index of the sample nearest `f` in an ascending grid. Linear scan: the grids
 * here are hundreds of points, and a binary search would buy nothing but a
 * chance to get an edge case wrong.
 */
export function nearestIndex(freq: readonly number[], f: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < freq.length; i++) {
    const d = Math.abs(Math.log(freq[i] / f));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Linear interpolation in log-frequency of a real series. Clamps at the edges. */
export function interpLog(
  freq: readonly number[],
  values: readonly number[],
  f: number,
): number {
  if (freq.length === 0) return NaN;
  if (f <= freq[0]) return values[0];
  if (f >= freq[freq.length - 1]) return values[values.length - 1];
  let j = 0;
  while (j < freq.length - 2 && freq[j + 1] < f) j++;
  const t = (Math.log(f) - Math.log(freq[j])) / (Math.log(freq[j + 1]) - Math.log(freq[j]));
  return values[j] + t * (values[j + 1] - values[j]);
}

/** Indices of `freq` inside [lo, hi] (inclusive). Empty when the band misses. */
export function bandIndicesIn(
  freq: readonly number[],
  lo: number,
  hi: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < freq.length; i++) if (freq[i] >= lo && freq[i] <= hi) out.push(i);
  return out;
}

/**
 * Fractional-octave running mean — the TREND a ripple or breakup scan is
 * measured against (A5b.2, A5c.4).
 *
 * `fraction` is the N of 1/N octave; the window is ±half of that. Arithmetic
 * mean of the dB values, which is what the prototype did and what the golden
 * references were produced with.
 */
export function octaveTrend(
  freq: readonly number[],
  db: readonly number[],
  fraction: number = DEFAULT_TREND_OCTAVE_FRACTION,
): number[] {
  const half = 0.5 / fraction;
  const out = new Array<number>(db.length);
  for (let i = 0; i < freq.length; i++) {
    const lo = freq[i] * 2 ** -half;
    const hi = freq[i] * 2 ** half;
    let sum = 0;
    let n = 0;
    for (let j = 0; j < freq.length; j++) {
      if (freq[j] >= lo && freq[j] <= hi) {
        sum += db[j];
        n++;
      }
    }
    out[i] = n > 0 ? sum / n : db[i];
  }
  return out;
}

export interface Peak {
  /** Sample index of the crest. */
  index: number;
  fHz: number;
  /** Height above whatever baseline the caller supplied, dB. */
  dB: number;
  /** −3 dB (relative to the crest's own height) Q estimate; null when the
   *  ripple does not come back down inside the searched range. */
  q: number | null;
}

/**
 * Local maxima of a residual (data − trend) above `minDb`, with a Q estimate
 * from the −3 dB points of the ripple itself.
 *
 * The Q estimate deliberately measures the RIPPLE, not the absolute curve: a
 * breakup peak sits on a response that is going somewhere, and half-power
 * points of the absolute level would measure the slope rather than the
 * resonance.
 *
 * ⚠ THE DIP-SHOULDER ARTEFACT, AND WHY IT IS NOT FILTERED HERE (casebook V18).
 *
 * A residual is `curve − trend`, and a narrow DIP drags the trend down with
 * it — so on both flanks of that dip the curve sits above the depressed trend
 * and the residual goes positive. On a nominally FLAT curve that means one dip
 * reads as two peaks straddling it: measured on a synthetic 4 dB, 1/20-octave
 * dip at 5 kHz, this function returned 4485 Hz and 5597 Hz, both +0.95 dB.
 * The F3 system-response scan does filter them out, because a system sum is
 * nominally flat and a genuine narrow peak there IS a local maximum of the
 * curve (`requirements/response.ts`).
 *
 * THIS SCAN CANNOT USE THAT TEST, and both candidate remedies were tried and
 * measured on casus 1 before this comment was written:
 *
 *  · "Also require a local maximum of the CURVE." Kills real breakups. A
 *    breakup sits on a response that is going somewhere — on a woofer's
 *    rolloff a cone resonance only FLATTENS the descent, it does not reverse
 *    it. Casus 1's documented +3.2 dB peak at 1395 Hz disappeared.
 *  · "Reject a crest whose neighbouring residual minimum is deeper than the
 *    crest is tall." Kills them too, and the data says why: that same 1394 Hz
 *    crest reads +3.25 dB between minima of −4.54 and −5.74 dB. On a rippling
 *    driver response a crest between two deep troughs is not an artefact — it
 *    is what a breakup looks like.
 *
 * So the artefact is real here in principle and is left in, deliberately. What
 * bounds it: a flanking crest is roughly a quarter of the notch's depth, so it
 * takes a notch of several dB to clear `PEAK_MIN_DB_OVER_TREND` at all, and
 * M-H's severity weighting — the uncalibrated one, waiting on HD data — is
 * what decides whether a detected peak constrains anything. A filter that
 * removed a quarter of the real detections to remove this would be a worse
 * scan, and the F3 test that found the artefact says so in its own comment.
 */
export function findResidualPeaks(
  freq: readonly number[],
  residualDb: readonly number[],
  minDb: number,
): Peak[] {
  const out: Peak[] = [];
  const halfDropDb = 3; // −3 dB relative to the crest — the definition of Q.
  for (let i = 1; i < freq.length - 1; i++) {
    const v = residualDb[i];
    if (!(v > residualDb[i - 1] && v >= residualDb[i + 1] && v >= minDb)) continue;

    const target = v - halfDropDb;
    let lo = i;
    while (lo > 0 && residualDb[lo] > target) lo--;
    let hi = i;
    while (hi < freq.length - 1 && residualDb[hi] > target) hi++;
    const width = freq[hi] - freq[lo];
    const q = residualDb[lo] <= target && residualDb[hi] <= target && width > 0
      ? freq[i] / width
      : null;
    out.push({ index: i, fHz: freq[i], dB: v, q });
  }
  return out;
}

/** Trapezoidal integral of y over x (both ascending, same length). */
export function trapz(x: readonly number[], y: readonly number[]): number {
  let s = 0;
  for (let i = 1; i < x.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]);
  return s;
}

/** Piecewise-linear-in-log-f evaluation of a (Hz, value) knot curve. */
export function evalKnotCurve(
  knots: readonly (readonly [number, number])[],
  fHz: number,
): number {
  if (knots.length === 0) return NaN;
  if (fHz <= knots[0][0]) return knots[0][1];
  const last = knots[knots.length - 1];
  if (fHz >= last[0]) return last[1];
  for (let i = 1; i < knots.length; i++) {
    if (fHz <= knots[i][0]) {
      const [f0, v0] = knots[i - 1];
      const [f1, v1] = knots[i];
      const t = (Math.log(fHz) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
      return v0 + t * (v1 - v0);
    }
  }
  return last[1];
}
