import type { FrdMeasurement } from './types.ts';
import { combineN, logspace, resample, wrapDeg, type GriddedResponse } from './dsp.ts';

/**
 * Predicted-vs-measured sum: the acceptance test for the import and summation
 * path.
 *
 * Input: N individual driver FRDs and ONE measured FRD of those same drivers
 * driven together (same mic, same time reference, drivers wired directly in
 * parallel — no filter). Under voltage drive each driver sees the same voltage
 * alone or in parallel, so by superposition the complex sum of the individual
 * pressures must equal the measured sum — level, phase and all. Nothing is
 * aligned here: no level offset, no delay fit. If the tool's summation is
 * right, the raw numbers agree.
 */
export interface SumCheckResult {
  band: [number, number];
  /** Grid the comparison was made on (log, inside every file's range). */
  freq: number[];
  /** Predicted (complex sum of the individual files) and measured, dB. */
  predictedSpl: number[];
  measuredSpl: number[];
  /** Predicted − measured, dB, per point. */
  deltaDb: number[];
  /** Predicted − measured phase, degrees, wrapped to (−180, 180], per point. */
  deltaDeg: number[];
  maxAbsDb: number;
  rmsDb: number;
  maxAbsDeg: number;
  rmsDeg: number;
  /** < 1 dB and < 10° everywhere in the band. */
  pass: boolean;
}

export function checkPredictedSum(
  drivers: readonly FrdMeasurement[],
  measuredSum: FrdMeasurement,
  band: [number, number] = [200, 5000],
  points = 300,
): SumCheckResult {
  if (drivers.length === 0) throw new Error('checkPredictedSum: at least one driver');
  // Stay inside every file's measured range — no extrapolation, ever.
  const lo = Math.max(band[0], measuredSum.freq[0], ...drivers.map((d) => d.freq[0]));
  const hi = Math.min(
    band[1],
    measuredSum.freq[measuredSum.freq.length - 1],
    ...drivers.map((d) => d.freq[d.freq.length - 1]),
  );
  if (!(hi > lo)) throw new Error('checkPredictedSum: no common band');
  const grid = logspace(lo, hi, points);
  const branches: { response: GriddedResponse }[] = drivers.map((d) => ({
    response: resample(d.freq, d.spl, d.phase, grid),
  }));
  const sum = combineN(branches);
  const meas = resample(measuredSum.freq, measuredSum.spl, measuredSum.phase, grid);
  const deltaDb = sum.combinedSpl.map((v, i) => v - meas.spl[i]);
  const deltaDeg = sum.combinedPhaseDeg.map((v, i) => wrapDeg(v - meas.phaseDeg[i]));
  const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const maxAbsDb = Math.max(...deltaDb.map(Math.abs));
  const maxAbsDeg = Math.max(...deltaDeg.map(Math.abs));
  return {
    band: [lo, hi],
    freq: grid,
    predictedSpl: sum.combinedSpl,
    measuredSpl: meas.spl,
    deltaDb,
    deltaDeg,
    maxAbsDb,
    rmsDb: rms(deltaDb),
    maxAbsDeg,
    rmsDeg: rms(deltaDeg),
    pass: maxAbsDb < 1 && maxAbsDeg < 10,
  };
}
