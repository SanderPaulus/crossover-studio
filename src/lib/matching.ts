/**
 * DRIVER MATCHING — how alike are two nominally identical drivers?
 *
 * Read-only. Nothing here feeds the model; it exists so a difference between
 * two woofers is a number on a report rather than a puzzle in the sum three
 * steps later.
 *
 * The form is borrowed from `sumCheck.checkPredictedSum`, which compares
 * WITHOUT aligning anything, and deliberately NOT from
 * `verification.compareMeasurement`, which fits a delay and a level offset out
 * of the way. In verification those two are nuisances — a mic distance and a
 * gain setting. In matching they are the entire signal: a level offset IS the
 * sensitivity difference you are looking for, and a delay difference IS a
 * mounting or path difference. Fitting them away would delete the answer.
 *
 * WHY THIS IS THE ONLY MATCHING DIAGNOSIS AVAILABLE HERE (Koan 2951): the
 * woofer impedance was measured with both cones in parallel, which is the right
 * source for the acoustic load but averages the two drivers together — a
 * difference in Fs or Qts between them simply disappears into the mean.
 * Impedance therefore cannot answer "are these two the same?", and the far-field
 * SPL comparison is all there is. Anyone wanting to chase a deviation further
 * needs a solo LIMP sweep per woofer, as DIAGNOSIS, never as model input.
 */

import { logspace, resample, wrapDeg } from './dsp.ts';
import type { FrdMeasurement } from './types.ts';

export interface MatchingResult {
  /** Band the comparison ran on, Hz. */
  band: [number, number];
  freq: number[];
  /** A − B, dB, per point. */
  deltaDb: number[];
  /** A − B phase, degrees, wrapped to (−180, 180], per point. */
  deltaDeg: number[];
  /** Mean of |ΔSPL| across the band, dB. */
  meanAbsDb: number;
  /** Largest |ΔSPL| and where it sits. */
  maxAbsDb: number;
  maxAbsDbAtHz: number;
  meanAbsDeg: number;
  maxAbsDeg: number;
  maxAbsDegAtHz: number;
  /** ΔSPL > 0.5 dB or Δphase > 5° anywhere in the band. */
  flagged: boolean;
  /** The complete report, ready to print. */
  lines: string[];
}

/** Names for the two sides, for readable output. */
export interface MatchingNames {
  a: string;
  b: string;
}

/**
 * Compare two nominally identical drivers over a band where BOTH measurements
 * are trustworthy.
 *
 * Default 500 Hz – 1 kHz: above a typical indoor gate limit (so the far field
 * is honest) and below the range where cone breakup makes two samples of the
 * same driver legitimately differ.
 */
export function compareDrivers(
  a: FrdMeasurement,
  b: FrdMeasurement,
  names: MatchingNames = { a: 'W1', b: 'W2' },
  band: [number, number] = [500, 1000],
  points = 200,
): MatchingResult | null {
  const lo = Math.max(band[0], a.freq[0], b.freq[0]);
  const hi = Math.min(band[1], a.freq[a.freq.length - 1], b.freq[b.freq.length - 1]);
  if (!(hi > lo * 1.05)) return null;
  const freq = logspace(lo, hi, points);
  const ga = resample(a.freq, a.spl, a.phase, freq);
  const gb = resample(b.freq, b.spl, b.phase, freq);

  const deltaDb: number[] = [];
  const deltaDeg: number[] = [];
  let sumDb = 0;
  let sumDeg = 0;
  let maxAbsDb = 0;
  let maxAbsDbAtHz = freq[0];
  let maxAbsDeg = 0;
  let maxAbsDegAtHz = freq[0];
  for (let i = 0; i < freq.length; i++) {
    const dDb = ga.spl[i] - gb.spl[i];
    const dDeg = wrapDeg(ga.phaseDeg[i] - gb.phaseDeg[i]);
    deltaDb.push(dDb);
    deltaDeg.push(dDeg);
    sumDb += Math.abs(dDb);
    sumDeg += Math.abs(dDeg);
    if (Math.abs(dDb) > maxAbsDb) {
      maxAbsDb = Math.abs(dDb);
      maxAbsDbAtHz = freq[i];
    }
    if (Math.abs(dDeg) > maxAbsDeg) {
      maxAbsDeg = Math.abs(dDeg);
      maxAbsDegAtHz = freq[i];
    }
  }
  const n = freq.length;
  const meanAbsDb = sumDb / n;
  const meanAbsDeg = sumDeg / n;
  const flagged = maxAbsDb > 0.5 || maxAbsDeg > 5;

  /* ---- Interpretation, offered rather than concluded ------------------
   * The shape of the difference says more than its size, and which of these
   * applies is a judgement about a physical cabinet that the numbers cannot
   * make on their own. So: name the patterns, point at the evidence, and stop
   * there. */
  const half = Math.floor(n / 2);
  const meanLow = deltaDb.slice(0, half).reduce((s, v) => s + v, 0) / Math.max(1, half);
  const meanHigh = deltaDb.slice(half).reduce((s, v) => s + v, 0) / Math.max(1, n - half);
  const tilt = meanHigh - meanLow;
  const offset = (meanLow + meanHigh) / 2;
  // How much of the deviation is a flat shift versus something frequency-shaped.
  let residual = 0;
  for (const d of deltaDb) residual += Math.abs(d - offset);
  residual /= n;

  const hints: string[] = [];
  if (Math.abs(offset) > 0.3 && residual < 0.2) {
    hints.push(
      `a flat ${offset >= 0 ? '+' : ''}${offset.toFixed(2)} dB across the whole band — that reads ` +
        `as a sensitivity difference between the two samples`,
    );
  }
  if (Math.abs(tilt) > 0.3) {
    hints.push(
      `the deviation grows with frequency (${tilt >= 0 ? '+' : ''}${tilt.toFixed(2)} dB across the ` +
        `band) — that reads as mounting, gasket or a leak rather than the driver itself`,
    );
  }
  if (residual > 0.3 && Math.abs(tilt) <= 0.3) {
    hints.push(
      `the deviation is local rather than broad (${residual.toFixed(2)} dB of shape on top of the ` +
        `offset) — around a resonance that reads as a cone or suspension difference`,
    );
  }

  const lines: string[] = [
    `${names.a} vs ${names.b}, ${Math.round(lo)}–${Math.round(hi)} Hz:`,
    `  ΔSPL   mean ${meanAbsDb.toFixed(2)} dB · max ${maxAbsDb.toFixed(2)} dB at ` +
      `${Math.round(maxAbsDbAtHz)} Hz`,
    `  Δphase mean ${meanAbsDeg.toFixed(1)}° · max ${maxAbsDeg.toFixed(1)}° at ` +
      `${Math.round(maxAbsDegAtHz)} Hz`,
    flagged
      ? `  ⚠ outside tolerance (> 0.5 dB or > 5°) — one driver differs, or one is not sealing`
      : `  ✓ within tolerance (≤ 0.5 dB and ≤ 5°)`,
  ];
  if (hints.length > 0) {
    lines.push('  what the shape suggests (not a conclusion):');
    for (const h of hints) lines.push(`    · ${h}`);
  }
  lines.push(
    `  NB this is the ONLY matching diagnosis available: the impedance was measured with both`,
    `  drivers in parallel, which is the right source for the acoustic load but averages any`,
    `  difference in Fs and Qts away. To chase a deviation further you need a solo LIMP sweep`,
    `  per driver — as diagnosis, never as model input.`,
  );

  return {
    band: [lo, hi],
    freq,
    deltaDb,
    deltaDeg,
    meanAbsDb,
    maxAbsDb,
    maxAbsDbAtHz,
    meanAbsDeg,
    maxAbsDeg,
    maxAbsDegAtHz,
    flagged,
    lines,
  };
}
