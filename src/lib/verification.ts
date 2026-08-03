import { resample } from './dsp.ts';

/**
 * Model-vs-measurement comparison — the VALIDATIE.md loop as a feature.
 *
 * Build the network, measure it, load the measurement, and see WHERE the
 * simulation deviates, in numbers rather than by eye. Two normalizations are
 * applied before judging, and both are REPORTED rather than hidden, because
 * each is a real physical difference that is not a model error:
 *
 *  - Level: absolute SPL calibration (mic gain, drive level) differs between
 *    a measurement rig and the simulation's dB scale. The median offset over
 *    the compared band is removed and shown ("aligned −12.3 dB").
 *  - Phase: the mic-to-speaker distance puts a pure delay on the measured
 *    phase that the simulation does not have. A pure delay + constant offset
 *    is least-squares fitted to the phase DIFFERENCE and removed; what
 *    remains is the honest phase residual. The fitted delay is reported (it
 *    is the mic distance, ~343 mm/ms), and a fitted offset near ±180° almost
 *    always means the measured system was connected in inverted polarity —
 *    flagged, not silently corrected.
 *
 * Everything is computed on the overlap band of simulation grid, measurement
 * range and the caller's requested band (typically the visible chart range),
 * so a gated measurement's unusable LF tail never pollutes the verdict.
 */

export interface VerificationCompare {
  /** Band actually compared [Hz] (overlap of sim grid, measurement, request). */
  band: [number, number];
  /** dB added to the measurement to align it with the sim (median over band). */
  offsetDb: number;
  /** Aligned measurement on the sim grid; NaN outside the measurement range. */
  alignedSpl: number[];
  /** Per-point sim − aligned measurement (dB); NaN outside the band. */
  deltaDb: number[];
  /** |delta| statistics over the band. */
  avgAbsDb: number;
  p95AbsDb: number;
  maxAbsDb: number;
  /** Where the worst magnitude deviation sits. */
  maxAt: { freqHz: number; deltaDb: number };
  /** Phase residual after removing fitted delay+offset; null when the
   *  measurement carries no phase. */
  phase: {
    fittedDelayUs: number;
    /** Fitted constant offset, normalized to (−180, 180]. */
    fittedOffsetDeg: number;
    /** |offset| near 180° — the built system is likely wired inverted. */
    looksInverted: boolean;
    residualDeg: number[];
    avgAbsDeg: number;
    p95AbsDeg: number;
  } | null;
}

const MIN_POINTS = 16;

function p95(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

export function compareMeasurement(
  simFreq: readonly number[],
  simSpl: readonly number[],
  simPhaseDeg: readonly number[] | null,
  meas: { freq: readonly number[]; spl: readonly number[]; phase: readonly number[]; hasPhase: boolean },
  requestBand?: [number, number],
): VerificationCompare | null {
  if (simFreq.length < MIN_POINTS || meas.freq.length < MIN_POINTS) return null;
  const lo = Math.max(simFreq[0], meas.freq[0], requestBand?.[0] ?? -Infinity);
  const hi = Math.min(simFreq[simFreq.length - 1], meas.freq[meas.freq.length - 1], requestBand?.[1] ?? Infinity);
  if (!(hi > lo)) return null;

  // clampEdges because the sim grid usually spans wider than a gated
  // measurement; the band selection below never reads the clamped points.
  const gridded = resample(meas.freq, meas.spl, meas.phase, simFreq, { clampEdges: true });

  const idx: number[] = [];
  for (let i = 0; i < simFreq.length; i++) {
    if (simFreq[i] >= lo && simFreq[i] <= hi && Number.isFinite(gridded.spl[i]) && Number.isFinite(simSpl[i])) {
      idx.push(i);
    }
  }
  if (idx.length < MIN_POINTS) return null;

  // Median level offset: robust against the very deviations we want to see —
  // a mean would let one deep suckout drag the whole alignment (the same
  // median-reference doctrine as responseStats).
  const rawDelta = idx.map((i) => simSpl[i] - gridded.spl[i]);
  const sorted = [...rawDelta].sort((a, b) => a - b);
  const offsetDb = sorted[Math.floor(sorted.length / 2)];

  const alignedSpl = simFreq.map(() => NaN);
  const deltaDb = simFreq.map(() => NaN);
  const absDeltas: number[] = [];
  let maxAbs = 0;
  let maxAt = { freqHz: simFreq[idx[0]], deltaDb: 0 };
  for (const i of idx) {
    alignedSpl[i] = gridded.spl[i] + offsetDb;
    const d = simSpl[i] - alignedSpl[i];
    deltaDb[i] = d;
    absDeltas.push(Math.abs(d));
    if (Math.abs(d) > maxAbs) {
      maxAbs = Math.abs(d);
      maxAt = { freqHz: simFreq[i], deltaDb: d };
    }
  }
  const avgAbsDb = absDeltas.reduce((a, b) => a + b, 0) / absDeltas.length;

  let phase: VerificationCompare['phase'] = null;
  if (meas.hasPhase && simPhaseDeg) {
    // Unwrap the phase DIFFERENCE so the delay fit sees a continuous line:
    // both inputs wrap at their own frequencies, the difference re-wraps.
    const diff: number[] = [];
    let prev = 0;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      let d = gridded.phaseDeg[i] - simPhaseDeg[i];
      if (k === 0) {
        d = ((d + 180) % 360 + 360) % 360 - 180;
      } else {
        while (d - prev > 180) d -= 360;
        while (d - prev < -180) d += 360;
      }
      diff.push(d);
      prev = d;
    }
    // Least-squares d ≈ a + b·f over the band: b is a pure delay
    // (deg/Hz = −360·t), a is the constant offset (polarity lives here).
    const fs = idx.map((i) => simFreq[i]);
    const n = fs.length;
    const mf = fs.reduce((s, v) => s + v, 0) / n;
    const md = diff.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let k = 0; k < n; k++) {
      num += (fs[k] - mf) * (diff[k] - md);
      den += (fs[k] - mf) * (fs[k] - mf);
    }
    const b = den > 0 ? num / den : 0;
    const a = md - b * mf;
    const fittedDelayUs = (-b / 360) * 1e6;
    const fittedOffsetDeg = ((a + 180) % 360 + 360) % 360 - 180;
    const residualDeg = simFreq.map(() => NaN);
    const absRes: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = diff[k] - (a + b * fs[k]);
      residualDeg[idx[k]] = r;
      absRes.push(Math.abs(r));
    }
    phase = {
      fittedDelayUs,
      fittedOffsetDeg,
      looksInverted: Math.abs(fittedOffsetDeg) > 135,
      residualDeg,
      avgAbsDeg: absRes.reduce((x, y) => x + y, 0) / absRes.length,
      p95AbsDeg: p95(absRes),
    };
  }

  return {
    band: [Math.max(lo, simFreq[idx[0]]), Math.min(hi, simFreq[idx[idx.length - 1]])],
    offsetDb,
    alignedSpl,
    deltaDb,
    avgAbsDb,
    p95AbsDb: p95(absDeltas),
    maxAbsDb: maxAbs,
    maxAt,
    phase,
  };
}
