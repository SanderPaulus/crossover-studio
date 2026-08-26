/**
 * A5e.1 — THE THREE THINGS A SYSTEM RESPONSE IS ASKED ABOUT.
 *
 * "Venster poort, gemiddelde rangschikt, outliers asymmetrisch." Three
 * questions, three quantities, and the whole point of the decision is that
 * they are not collapsed into one number:
 *
 *  1. THE WINDOW — peak-to-peak of the SMOOTHED response against the target
 *     curve. This is the acceptance question: is this design allowed to exist.
 *  2. THE RMS DEVIATION — from the same target, on the same band, UNSMOOTHED.
 *     This is the sorting question: of the designs that are allowed, which is
 *     flattest. A single number for both is how a 3 dB peak and a 3 dB tilt
 *     come to score the same.
 *  3. THE NARROW FEATURES — what the smoothing removed. Peaks are reported,
 *     dips are forgiven, and that asymmetry is a stated taste principle rather
 *     than a threshold the user has to guess (A5e.1).
 *
 * WHY THE WINDOW IS SMOOTHED AND THE RMS IS NOT. The window decides
 * acceptability, and acceptability is about the shape a listener hears; a
 * single stray sample must not condemn a design. The RMS only ever ORDERS
 * designs that already passed, so it can afford to see everything, and
 * smoothing it would throw away exactly the fine differences it exists to
 * rank on.
 */

import { smoothDbGaussian } from '../../bandMetrics.ts';
import { NARROW_PEAK_MIN_DB, WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';
import { coverageOf, type Coverage } from '../ingest/validity.ts';
import { targetOffsetsDb, type TargetCurve } from './targetCurve.ts';

export interface ResponseJudgement {
  /**
   * Peak-to-peak of the smoothed deviation from the target, dB. This is the
   * number the window REQUIREMENT is compared against — expressed as ±, so a
   * "±1.5 dB" requirement is met when `windowPlusMinusDb <= 1.5`.
   */
  windowPlusMinusDb: number;
  /** Where the smoothed response sits highest and lowest, for the report. */
  windowMaxAtHz: number;
  windowMinAtHz: number;
  /** RMS deviation from the target over the same band, dB. The SORT key. */
  rmsDeviationDb: number;
  /**
   * The narrow features the smoothing removed, PEAKS ONLY.
   *
   * Sorted tallest first. A dip is not in here and never will be: see the
   * taste principle in A5e.1 — a narrow peak is a resonance that rings, is fed
   * from several directions and shows up in the power response, while a narrow
   * dip is an interference null that moves with the listener and fills in.
   */
  narrowPeaks: { fHz: number; db: number; q: number }[];
  /** The band judged, and how much of the intended one that was. */
  bandHz: [number, number];
  coverage: Coverage;
  /** The smoothing width actually used, octaves — a reported parameter (V15). */
  smoothingOctaves: number;
  notes: string[];
}

export interface ResponseJudgementOptions {
  /** Overrides the smoothing width. The golden suite passes it; nothing else does. */
  smoothingOctaves?: number;
  /** Overrides the peak-report threshold. Same rule: tests only. */
  narrowPeakMinDb?: number;
}

/**
 * Judge one system response against one target curve, over one band.
 *
 * `grid`/`db` is the summed system response; `bandHz` is the band it may be
 * judged on, which the caller clips to measurement validity (A5.5) — this
 * function does not invent a lower edge.
 */
export function judgeResponse(
  grid: readonly number[],
  db: readonly number[],
  target: TargetCurve,
  bandHz: [number, number],
  opts: ResponseJudgementOptions = {},
): ResponseJudgement | null {
  const octaves = opts.smoothingOctaves ?? WINDOW_SMOOTHING_OCTAVES;
  const minPeak = opts.narrowPeakMinDb ?? NARROW_PEAK_MIN_DB;
  const notes: string[] = [];

  const idx: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] >= bandHz[0] && grid[i] <= bandHz[1] && Number.isFinite(db[i])) idx.push(i);
  }
  if (idx.length < 3) return null;

  // The target's own shape, subtracted first: everything below is a deviation
  // FROM THE TARGET, not from horizontal.
  const offsets = targetOffsetsDb(target, grid);
  const dev = grid.map((_, i) => db[i] - offsets[i]);

  // Referenced to the band's own mean. What a window and an RMS are about is
  // shape; the absolute level is the loudspeaker's sensitivity and belongs to
  // a different question entirely.
  let sum = 0;
  for (const i of idx) sum += dev[i];
  const mean = sum / idx.length;
  const rel = dev.map((v) => v - mean);

  /* ---- the window: on the SMOOTHED curve ---- */
  const smoothed = smoothDbGaussian(grid, rel, octaves);
  let hi = -Infinity;
  let lo = Infinity;
  let hiAt = grid[idx[0]];
  let loAt = grid[idx[0]];
  for (const i of idx) {
    if (smoothed[i] > hi) {
      hi = smoothed[i];
      hiAt = grid[i];
    }
    if (smoothed[i] < lo) {
      lo = smoothed[i];
      loAt = grid[i];
    }
  }

  /* ---- the sort key: RMS, on the RAW curve ---- */
  let sq = 0;
  for (const i of idx) sq += rel[i] * rel[i];
  const rms = Math.sqrt(sq / idx.length);

  /* ---- what the smoothing removed, peaks only ---- */
  const residual = grid.map((_, i) => rel[i] - smoothed[i]);
  const narrowPeaks = findNarrowPeaks(grid, residual, rel, idx, minPeak);
  if (narrowPeaks.length > 0) {
    notes.push(
      `${narrowPeaks.length} narrow peak(s) sit outside the window judgement because the ` +
        `${octaves.toFixed(3)}-octave smoothing removes them. They are reported rather than ` +
        'judged; narrow DIPS are forgiven entirely (A5e.1).',
    );
  }

  return {
    // Peak-to-peak expressed as ±, which is the unit the requirement is in.
    windowPlusMinusDb: (hi - lo) / 2,
    windowMaxAtHz: hiAt,
    windowMinAtHz: loAt,
    rmsDeviationDb: rms,
    narrowPeaks,
    bandHz,
    coverage: coverageOf(bandHz, {
      fromHz: grid[idx[0]],
      toHz: grid[idx[idx.length - 1]],
      fromBy: 'summed response',
      toBy: 'summed response',
    }),
    smoothingOctaves: octaves,
    notes,
  };
}

/**
 * Local maxima of the residual (raw minus smoothed) that stand `minDb` proud
 * AND are local maxima of the response itself.
 *
 * THE SECOND CONDITION IS NOT BELT-AND-BRACES, it is the whole asymmetry.
 *
 * ⚠ AND IT IS SAFE ONLY HERE. The breakup scan in `ingest/spl.ts` has the same
 * arithmetic vulnerability and deliberately does NOT use this test: a driver's
 * response is going somewhere, so a genuine cone resonance on a rolloff only
 * flattens the descent instead of reversing it, and requiring a local maximum
 * of the curve there deletes real detections — measured on casus 1, where it
 * removed the +3.2 dB peak at 1395 Hz that sets the whole woofer-mid crossover
 * ceiling. A system SUM is nominally flat, which is what makes the test valid
 * on this side of the line. See casebook V18 and the note on
 * `findResidualPeaks`.
 * A narrow DIP produces two positive residual shoulders — on either flank the
 * raw response climbs back above the smoothed curve — and a detector that
 * looked at the residual alone would report a forgiven dip as two peaks,
 * which is the taste principle exactly inverted. On those shoulders the raw
 * response is monotone, so requiring a local maximum of the response as well
 * removes them and keeps every genuine peak.
 *
 * Q is estimated from the −3 dB points of the ridge, the same way the breakup
 * scan estimates it on a driver — one convention for "how narrow is this
 * feature", wherever the feature was found.
 */
function findNarrowPeaks(
  grid: readonly number[],
  residual: readonly number[],
  response: readonly number[],
  idx: readonly number[],
  minDb: number,
): { fHz: number; db: number; q: number }[] {
  const out: { fHz: number; db: number; q: number }[] = [];
  const inBand = new Set(idx);
  for (let k = 1; k + 1 < idx.length; k++) {
    const i = idx[k];
    if (!inBand.has(idx[k - 1]) || !inBand.has(idx[k + 1])) continue;
    const v = residual[i];
    if (!(v >= minDb)) continue;
    if (!(v >= residual[idx[k - 1]] && v >= residual[idx[k + 1]])) continue;
    // ...and a local maximum of the RESPONSE, which is what tells a peak from
    // the shoulder of a dip.
    if (!(response[i] >= response[idx[k - 1]] && response[i] >= response[idx[k + 1]])) continue;
    // Skip a plateau's interior: only the first sample of a flat ridge counts.
    if (v === residual[idx[k - 1]]) continue;

    const half = v / 2;
    let loI = i;
    for (let j = k; j >= 0 && residual[idx[j]] > half; j--) loI = idx[j];
    let hiI = i;
    for (let j = k; j < idx.length && residual[idx[j]] > half; j++) hiI = idx[j];
    const width = grid[hiI] - grid[loI];
    const q = width > 0 ? grid[i] / width : Infinity;
    out.push({ fHz: grid[i], db: v, q });
  }
  return out.sort((a, b) => b.db - a.db);
}
