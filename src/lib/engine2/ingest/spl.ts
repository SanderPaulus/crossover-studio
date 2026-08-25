/**
 * A5b — THE SPL EXTRACTORS.
 *
 * Every scan here takes its band as an argument and every band comes from the
 * validity limits (A5b.1). Nothing in this file knows a frequency.
 *
 * ONE THING IS EASY TO GET WRONG AND WAS, SO IT IS SPELLED OUT: a "driver" in
 * the manifest can be more than one measured cone. Casus 1's woofer is a
 * PAIR — two far-field files, one impedance sweep of the two in parallel, one
 * Driver part in the netlist. Scanning either file on its own answers a
 * question nobody asked: the breakup that matters is the one in the pressure
 * the pair actually radiates, and that is the COMPLEX SUM. Measured on that
 * dataset the difference is not subtle — the same cone resonance reads +0.7 dB
 * on one cone and +3.2 dB on the sum, and the whole severity-weighted crossover
 * ceiling hangs off which of those two numbers you believe. So responses tagged
 * to the same driver at the same angle are summed before any scan runs, and
 * `combineAtAngle` is the only door into these extractors.
 */

import {
  DIFFRACTION_DFT_POINTS,
  DEFAULT_TREND_OCTAVE_FRACTION,
  MM_PER_M,
  PEAK_MIN_DB_OVER_TREND,
  SPEED_OF_SOUND_M_S,
  SPL_SCAN_GRID_POINTS,
} from '../constants.ts';
import {
  dbAmp,
  degToRad,
  findResidualPeaks,
  interpLog,
  octaveTrend,
  radToDeg,
  type Peak,
} from '../util.ts';
import { stamp, type EstimatorStamp } from '../version.ts';
import { logspace, resample, toComplex } from '../../dsp.ts';
import { unwrapPhaseDeg } from '../../timing.ts';
import type { Complex } from '../../complex.ts';

export const EXTRACTOR_BREAKUP = 'spl-breakup' as const;
export const EXTRACTOR_DIFFRACTION = 'spl-diffraction' as const;
export const EXTRACTOR_DIRECTIVITY = 'spl-directivity' as const;
export const EXTRACTOR_LEVEL = 'spl-level' as const;

/**
 * A ripple must complete at least this many full periods across the analysed
 * span before its "dominant path length" means anything. Below that the DFT is
 * looking at what the trend removal left behind, not at a reflection.
 */
const DIFFRACTION_MIN_RIPPLE_PERIODS = 4;

/**
 * −6 dB point of a circular piston: the directivity factor 2·J₁(u)/u falls to
 * half at u = k·a·sin θ ≈ 2.215. Inverting it turns a measured −6 dB@θ
 * frequency into an EFFECTIVE radiating radius (A5b.4), which is what feeds the
 * data-driven Keele limit instead of a hand-typed cone size.
 */
const PISTON_HALF_PRESSURE_KA_SIN = 2.215;

/** One measured (or summed) response on its own grid. */
export interface SplCurve {
  freq: readonly number[];
  spl: readonly number[];
  /** Degrees, as measured (may be wrapped — `resample` unwraps). */
  phaseDeg: readonly number[];
}

/** The log grid a scan runs on, derived entirely from the band it is given. */
export function scanGrid(band: [number, number], points = SPL_SCAN_GRID_POINTS): number[] {
  return logspace(band[0], band[1], points);
}

/**
 * Complex sum of every response tagged to one driver at one angle.
 *
 * Returns null when the requested band falls outside a contributor's extent —
 * refusing beats extrapolating a driver into a region it was never measured in.
 */
export function combineAtAngle(
  curves: readonly SplCurve[],
  grid: readonly number[],
): { db: number[]; phaseDeg: number[]; complex: Complex[] } | null {
  if (curves.length === 0) return null;
  const acc: Complex[] = grid.map(() => ({ re: 0, im: 0 }));
  for (const c of curves) {
    if (grid[0] < c.freq[0] || grid[grid.length - 1] > c.freq[c.freq.length - 1]) return null;
    const g = resample(c.freq, c.spl, c.phaseDeg, grid);
    for (let i = 0; i < grid.length; i++) {
      const z = toComplex(g.spl[i], g.phaseDeg[i]);
      acc[i].re += z.re;
      acc[i].im += z.im;
    }
  }
  return {
    db: acc.map((z) => dbAmp(Math.hypot(z.re, z.im))),
    phaseDeg: unwrapPhaseDeg(acc.map((z) => radToDeg(Math.atan2(z.im, z.re)))),
    complex: acc,
  };
}

/* ------------------------------------------------------------------ *
 * A5b.2 — breakup scan
 * ------------------------------------------------------------------ */

export interface BreakupPeak extends Peak {
  /**
   * TRUE when the peak sits below the measurement's fine-detail floor (2/T),
   * i.e. its LEVEL may be real but its SHAPE — and therefore its Q and its
   * severity weighting — is window artefact. V8c in one flag.
   */
  belowFineDetailFloor: boolean;
}

export interface BreakupScan {
  /** The band the scan actually ran on (already clipped to validity). */
  bandHz: [number, number];
  /** Every ripple above the detection threshold, ascending in frequency. */
  peaks: BreakupPeak[];
  /** RMS ripple against the trend over the whole band, dB. */
  rmsDb: number;
  octaveFraction: number;
  estimator: EstimatorStamp;
}

/**
 * Deviation from a fractional-octave trend, clipped to the validity band.
 *
 * THE CLIPPING IS THE MEASUREMENT (V8c). Run the same scan on an unclipped
 * band and the same cone resonance changes height, because the trend at the
 * edges is computed over data that should not have been believed.
 */
export function scanBreakups(
  db: readonly number[],
  grid: readonly number[],
  opts: {
    octaveFraction?: number;
    minDb?: number;
    fineDetailFromHz?: number | null;
    /** Peaks closer than this many octaves are one feature; the taller wins. */
    mergeOctaves?: number;
  } = {},
): BreakupScan {
  const fraction = opts.octaveFraction ?? DEFAULT_TREND_OCTAVE_FRACTION;
  const minDb = opts.minDb ?? PEAK_MIN_DB_OVER_TREND;
  const merge = opts.mergeOctaves ?? 0;
  const trend = octaveTrend(grid, db, fraction);
  const residual = db.map((v, i) => v - trend[i]);
  let peaks = findResidualPeaks(grid, residual, minDb);
  if (merge > 0) {
    const kept: Peak[] = [];
    for (const p of peaks) {
      const near = kept.findIndex((q) => Math.abs(Math.log2(q.fHz / p.fHz)) < merge);
      if (near < 0) kept.push(p);
      else if (p.dB > kept[near].dB) kept[near] = p;
    }
    peaks = kept.sort((a, b) => a.fHz - b.fHz);
  }
  const rms = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / residual.length);
  const fine = opts.fineDetailFromHz ?? null;
  return {
    bandHz: [grid[0], grid[grid.length - 1]],
    peaks: peaks.map((p) => ({ ...p, belowFineDetailFloor: fine !== null && p.fHz < fine })),
    rmsDb: rms,
    octaveFraction: fraction,
    estimator: stamp(EXTRACTOR_BREAKUP),
  };
}

/**
 * A4 M-H — directional persistence: how each on-axis ripple behaves off axis.
 *
 * A peak that stays or GROWS at an angle is a real cone resonance: it lives in
 * the power response and no filter after the driver can undo it, so its
 * severity goes UP. One that collapses is interference or diffraction — an
 * on-axis artefact — and its severity goes down.
 */
export interface Persistence {
  fHz: number;
  onAxisDb: number;
  offAxisDb: number;
  /** offAxis − onAxis, dB. Positive = the resonance grows off axis. */
  deltaDb: number;
  angleDeg: number;
  persistent: boolean;
}

export function directionalPersistence(
  onPeaks: readonly Peak[],
  onGrid: readonly number[],
  offResidualDb: readonly number[],
  angleDeg: number,
  opts: { searchOctaves?: number } = {},
): Persistence[] {
  const search = opts.searchOctaves ?? 1 / 6;
  return onPeaks.map((p) => {
    let best = -Infinity;
    for (let i = 0; i < onGrid.length; i++) {
      if (Math.abs(Math.log2(onGrid[i] / p.fHz)) > search) continue;
      if (offResidualDb[i] > best) best = offResidualDb[i];
    }
    const off = Number.isFinite(best) ? best : NaN;
    return {
      fHz: p.fHz,
      onAxisDb: p.dB,
      offAxisDb: off,
      deltaDb: off - p.dB,
      angleDeg,
      // "Stays or grows" — a resonance that merely holds its height off axis is
      // already the dangerous case; only a collapse exonerates it.
      persistent: off >= p.dB,
    };
  });
}

/* ------------------------------------------------------------------ *
 * A5b.3 — diffraction ripple and the path length behind it
 * ------------------------------------------------------------------ */

export interface DiffractionScan {
  bandHz: [number, number];
  /** RMS ripple against the trend, dB. */
  rmsDb: number;
  /** Dominant detour length in mm; null when nothing is periodic enough. */
  dominantPathMm: number | null;
  /** ± resolution of that estimate, mm — one DFT bin, refined by interpolation. */
  pathResolutionMm: number;
  /** The strongest few candidates, descending in strength. */
  candidatesMm: number[];
  estimator: EstimatorStamp;
}

/**
 * Ripple RMS plus the dominant detour length behind it.
 *
 * The ripple is periodic in LINEAR frequency (a fixed extra path length gives
 * a fixed period), so the transform runs on a linear grid even though every
 * other scan here is logarithmic. The path is c·τ with τ the quefrency of the
 * strongest component — the FULL detour, not half of it: a ripple period Δf
 * corresponds to a delay 1/Δf.
 */
export function scanDiffraction(
  curve: SplCurve,
  band: [number, number],
  opts: { octaveFraction?: number; points?: number } = {},
): DiffractionScan {
  const fraction = opts.octaveFraction ?? DEFAULT_TREND_OCTAVE_FRACTION;
  const n = opts.points ?? DIFFRACTION_DFT_POINTS;

  // RMS on the LOG grid: it is a statement about the whole band, and a linear
  // grid would let the top octave outvote everything below it.
  const logG = scanGrid(band);
  const logDb = logG.map((f) => interpLog(curve.freq, curve.spl, f));
  const logTrend = octaveTrend(logG, logDb, fraction);
  const logResid = logDb.map((v, i) => v - logTrend[i]);
  const rms = Math.sqrt(logResid.reduce((s, v) => s + v * v, 0) / logResid.length);

  const span = band[1] - band[0];
  const lin = new Array<number>(n);
  for (let i = 0; i < n; i++) lin[i] = band[0] + (span * i) / (n - 1);
  const linDb = lin.map((f) => interpLog(curve.freq, curve.spl, f));
  const linTrend = octaveTrend(lin, linDb, fraction);
  const resid = linDb.map((v, i) => v - linTrend[i]);
  // Hann window: without it the band edges ring and invent a path length.
  const win = resid.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));

  const df = span / (n - 1);
  const tauMin = DIFFRACTION_MIN_RIPPLE_PERIODS / span;
  const mags: { k: number; mag: number }[] = [];
  for (let k = 1; k < n / 2; k++) {
    const tau = k / (n * df);
    if (tau < tauMin) continue;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-2 * Math.PI * k * i) / n;
      re += win[i] * Math.cos(a);
      im += win[i] * Math.sin(a);
    }
    mags.push({ k, mag: Math.hypot(re, im) });
  }
  const pathMm = (tau: number) => tau * SPEED_OF_SOUND_M_S * MM_PER_M;
  const tauOf = (k: number) => k / (n * df);
  mags.sort((a, b) => b.mag - a.mag);
  let dominant: number | null = null;
  if (mags.length > 0) {
    // Parabolic refinement on the magnitude spectrum: the bin spacing is
    // ~17 mm of path, which is coarser than the number deserves.
    const best = mags[0].k;
    const byK = new Map(mags.map((m) => [m.k, m.mag]));
    const y0 = byK.get(best - 1);
    const y1 = byK.get(best)!;
    const y2 = byK.get(best + 1);
    let kRef = best;
    if (y0 !== undefined && y2 !== undefined) {
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > Number.EPSILON) kRef = best + (0.5 * (y0 - y2)) / denom;
    }
    dominant = pathMm(tauOf(kRef));
  }
  return {
    bandHz: band,
    rmsDb: rms,
    dominantPathMm: dominant,
    pathResolutionMm: pathMm(1 / (n * df)),
    candidatesMm: mags.slice(0, 5).map((m) => pathMm(tauOf(m.k))),
    estimator: stamp(EXTRACTOR_DIFFRACTION),
  };
}

/* ------------------------------------------------------------------ *
 * A5b.4 — directivity from a 0°/θ pair
 * ------------------------------------------------------------------ */

export interface DirectivityPair {
  angleDeg: number;
  bandHz: [number, number];
  /** Where the off-axis response has fallen 3 dB behind on-axis. */
  minus3Hz: number | null;
  /** Same at 6 dB — the classic crossover ceiling of the lower driver. */
  minus6Hz: number | null;
  /**
   * Effective radiating RADIUS in metres implied by the −6 dB point under a
   * circular-piston model. Feeds the Keele limit from data instead of a typed
   * cone size, and — read against the tagged diameter — shows cone decoupling
   * (an effective radius well below the physical one).
   */
  effectiveRadiusM: number | null;
  /** The smoothed off−on difference on the scan grid, for the report. */
  differenceDb: number[];
  grid: number[];
  estimator: EstimatorStamp;
}

export function directivityFromPair(
  onAxisDb: readonly number[],
  offAxisDb: readonly number[],
  grid: readonly number[],
  angleDeg: number,
  opts: { octaveFraction?: number } = {},
): DirectivityPair {
  const fraction = opts.octaveFraction ?? DEFAULT_TREND_OCTAVE_FRACTION;
  const raw = offAxisDb.map((v, i) => v - onAxisDb[i]);
  // Smooth the DIFFERENCE, not the two curves: ripple that is common to both
  // cancels in the difference and what is left is the beaming trend.
  const diff = octaveTrend(grid, raw, fraction);

  const crossing = (target: number): number | null => {
    for (let i = 1; i < grid.length; i++) {
      if (diff[i - 1] > target && diff[i] <= target) {
        const t = (target - diff[i - 1]) / (diff[i] - diff[i - 1]);
        return Math.exp(Math.log(grid[i - 1]) + t * (Math.log(grid[i]) - Math.log(grid[i - 1])));
      }
    }
    return null;
  };
  const m3 = crossing(-3);
  const m6 = crossing(-6);
  const sinT = Math.sin(degToRad(angleDeg));
  const radius =
    m6 !== null && sinT > 0
      ? (PISTON_HALF_PRESSURE_KA_SIN * SPEED_OF_SOUND_M_S) / (2 * Math.PI * m6 * sinT)
      : null;

  return {
    angleDeg,
    bandHz: [grid[0], grid[grid.length - 1]],
    minus3Hz: m3,
    minus6Hz: m6,
    effectiveRadiusM: radius,
    differenceDb: diff,
    grid: [...grid],
    estimator: stamp(EXTRACTOR_DIRECTIVITY),
  };
}

/* ------------------------------------------------------------------ *
 * Level — the input to the anchored sensitivity analysis (A5d.4)
 * ------------------------------------------------------------------ */

export interface PassbandLevel {
  bandHz: [number, number];
  /** Energy-average level over the band, dB in the file's own scale. */
  db: number;
  estimator: EstimatorStamp;
}

/**
 * Energy average over a band — the level an anchored gap analysis compares.
 *
 * Energy rather than arithmetic dB average: a gap is a power ratio, and an
 * arithmetic mean of decibels understates whatever peaks stick out of it.
 */
export function passbandLevel(
  db: readonly number[],
  grid: readonly number[],
  band: [number, number],
): PassbandLevel | null {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < band[0] || grid[i] > band[1]) continue;
    sum += 10 ** (db[i] / 10);
    n++;
  }
  if (n === 0) return null;
  return {
    bandHz: band,
    db: 10 * Math.log10(sum / n),
    estimator: stamp(EXTRACTOR_LEVEL),
  };
}
