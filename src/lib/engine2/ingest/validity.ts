/**
 * A5b.1 — VALIDITY LIMITS, AND THE COVERAGE THAT FOLLOWS FROM THEM.
 *
 * THE RANK ORDER IS THE POINT, so it is written here once and obeyed
 * everywhere:
 *
 *   (i)  HEADER FLOOR — hard, automatic, binding. T = right window −
 *        reference time, straight out of the file. f ≥ 1/T is an absolute
 *        minimum; fine structure is only trusted from 2/T. Nothing may relax
 *        this: not a model fit, not a user setting, not a "the curve looks
 *        smooth down there".
 *   (ii) FF/NF MODEL TEST — advisory. The FF−NF difference must fit a physical
 *        baffle-step shelf, fitted ONLY inside the Keele-valid near-field band.
 *        Where the residual refuses to go away, the data is broken. V8g is the
 *        reason for all three qualifiers: without the model form it passes
 *        gate-smooth data, without the exponent bound it fits nonsense, and
 *        without the Keele clip it fails outright.
 *   (iii) DETAIL COLLAPSE — weakly advisory, and NOT IMPLEMENTED HERE. V8f
 *        found it gives false-high limits on physically smooth responses and
 *        false-low ones on noise, and it needs an SNR guard the manifest does
 *        not yet carry. Shipping it as a number would be worse than not
 *        shipping it. TODO(A5b.1iii): needs a documented noise floor per
 *        measurement before it can be more than a hint.
 *
 * The verdict for a measurement is max(header floor, model detector) — and the
 * model detector can only ever RAISE the floor, never lower it.
 *
 * Near field is different in kind and says so: a mic 5 mm off the dust cap has
 * no reflection to gate out, so its window carries no floor. Its CEILING is
 * Keele's piston limit, and its own validity check is the mic-distance rule.
 */

import {
  HEADER_FLOOR_ABSOLUTE_OVER_T,
  HEADER_FLOOR_TRUSTED_OVER_T,
  KEELE_MIC_DISTANCE_FRACTION_OF_RADIUS,
  KEELE_NEARFIELD_HZ_INCH,
  M_PER_INCH,
  MM_PER_M,
  PERCENT,
  BAFFLE_STEP_MAX_DEPTH_DB,
} from '../constants.ts';
import { interpLog, octavesBetween } from '../util.ts';
import { stamp, type EstimatorStamp } from '../version.ts';
import { effectiveWindowSeconds, type ManifestEntry } from './manifest.ts';

export const EXTRACTOR_HEADER = 'validity-header' as const;
export const EXTRACTOR_NEARFIELD = 'validity-nearfield' as const;
export const EXTRACTOR_FFNF = 'validity-ffnf' as const;

/** One measurement's validity, with the reason for each edge. */
export interface ValidityInterval {
  /** Lowest believable frequency; null = no floor applies (impedance, near field). */
  fromHz: number | null;
  /** Highest; null = up to the file's own top. */
  toHz: number | null;
  /** Which detector set the bottom edge. */
  fromReason: string;
  /** Which detector set the top edge. */
  toReason: string;
  /**
   * Above the hard floor: where FINE STRUCTURE (ripple, breakup Q) may be
   * believed — 2/T. A peak found between `fromHz` and here is real in level
   * but not in shape, which is exactly the V8c trap.
   */
  fineDetailFromHz: number | null;
  /** Anything the detectors want the designer to know. */
  notes: string[];
  /** Which extractors produced this, at which version. */
  estimators: EstimatorStamp[];
}

const noFloor = (reason: string, top: number | null, topReason: string): ValidityInterval => ({
  fromHz: null,
  toHz: top,
  fromReason: reason,
  toReason: topReason,
  fineDetailFromHz: null,
  notes: [],
  estimators: [],
});

/**
 * (i) The header floor. Returns null when the file carries no window fields —
 * absence is reported, never replaced by an assumption.
 */
export function headerFloor(entry: ManifestEntry): {
  hardHz: number;
  fineHz: number;
  windowMs: number;
} | null {
  const t = effectiveWindowSeconds(entry.header);
  if (t === null || !(t > 0)) return null;
  return {
    hardHz: HEADER_FLOOR_ABSOLUTE_OVER_T / t,
    fineHz: HEADER_FLOOR_TRUSTED_OVER_T / t,
    windowMs: entry.header!.effectiveWindowMs!,
  };
}

/** Keele's near-field ceiling, Hz. Null without a diameter — no guessing. */
export function keeleCeilingHz(diameterInch: number | undefined): number | null {
  if (diameterInch === undefined || !(diameterInch > 0)) return null;
  return KEELE_NEARFIELD_HZ_INCH / diameterInch;
}

/**
 * Keele's companion rule: the mic must sit within 0.11 × radius of the cone.
 * Returns null when either number is missing; `false` means the measurement
 * violates it and its near-field level is suspect.
 */
export function micDistanceOk(entry: ManifestEntry): boolean | null {
  if (entry.micDistanceMm === undefined || entry.diameterInch === undefined) return null;
  const radiusMm = (entry.diameterInch * M_PER_INCH * MM_PER_M) / 2;
  return entry.micDistanceMm <= KEELE_MIC_DISTANCE_FRACTION_OF_RADIUS * radiusMm;
}

/* ------------------------------------------------------------------ *
 * (ii) The FF/NF baffle-step model test
 * ------------------------------------------------------------------ */

/**
 * How wide a run of out-of-tolerance residual has to be before it counts as a
 * broken zone rather than measurement noise, in octaves. A5b.1(ii) asks for a
 * PERSISTING residual; this is what "persisting" means here.
 */
const BROKEN_ZONE_MIN_OCTAVES = 1 / 6;

export interface BaffleStepFit {
  /** Shelf transition frequency, Hz — DERIVED, comparable to c/(2W). */
  f0Hz: number;
  /** Shelf depth, dB (bounded by the model). */
  depthDb: number;
  /** Shelf steepness exponent (bounded — an unbounded fit eats gate roll-off). */
  exponent: number;
  /** Level offset between the two measurements, dB. */
  offsetDb: number;
  /** RMS residual over the fitted band, dB. */
  residualRmsDb: number;
  /** The tolerance that residual was judged against. */
  residualToleranceDb: number;
  /**
   * FALSE when the model does not describe the data at all. The detector then
   * ABSTAINS: `breaksBelowHz` is null and the header floor stands alone.
   */
  fits: boolean;
  /**
   * Lowest frequency at which the residual is still inside tolerance. Below
   * this the FF measurement no longer matches any physical step — the broken
   * zone. Null when the whole fitted band is clean.
   */
  breaksBelowHz: number | null;
  /** Band the fit was actually made on (Keele-clipped). */
  fittedBand: [number, number];
}

/**
 * Fit `FF − NF = offset + depth · 1/(1 + (f0/f)^p)` on the shared, Keele-valid
 * band, with `depth` bounded by the physics of a baffle step and `p` bounded
 * so the fit cannot absorb gate roll-off (V8g).
 *
 * Grid search on (f0, p) with a closed-form least squares for (offset, depth):
 * two nonlinear parameters over a few hundred combinations is fast, exactly
 * reproducible, and cannot wander off the way a gradient fit can.
 */
export function fitBaffleStep(
  freq: readonly number[],
  ffDb: readonly number[],
  nfFreq: readonly number[],
  nfDb: readonly number[],
  band: [number, number],
  opts: { residualToleranceDb?: number } = {},
): BaffleStepFit | null {
  const tol = opts.residualToleranceDb ?? BAFFLE_STEP_MAX_DEPTH_DB / 4;
  const idx: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] >= band[0] && freq[i] <= band[1]) idx.push(i);
  }
  // A handful of points cannot constrain four parameters; refuse rather than
  // return a confident line through three dots.
  if (idx.length < 8) return null;


  const f = idx.map((i) => freq[i]);
  const d = idx.map((i) => ffDb[i] - interpLog(nfFreq, nfDb, freq[i]));

  // f0 candidates span the fitted band itself (derived, never a literal); p is
  // bounded to the shelf-like range — below 1 the "step" is a slow tilt, above
  // 4 it is a brick wall that no baffle produces.
  const P_MIN = 1;
  const P_MAX = 4;
  const P_STEPS = 13;
  const F0_STEPS = 41; // P6-OK: search resolution over the fitted band, not a frequency

  let best: BaffleStepFit | null = null;
  for (let a = 0; a < F0_STEPS; a++) {
    const f0 = band[0] * (band[1] / band[0]) ** (a / (F0_STEPS - 1));
    for (let b = 0; b < P_STEPS; b++) {
      const p = P_MIN + ((P_MAX - P_MIN) * b) / (P_STEPS - 1);
      const x = f.map((fi) => 1 / (1 + (f0 / fi) ** p));
      // Least squares for d ≈ offset + depth·x.
      const n = x.length;
      const sx = x.reduce((s, v) => s + v, 0);
      const sy = d.reduce((s, v) => s + v, 0);
      const sxx = x.reduce((s, v) => s + v * v, 0);
      const sxy = x.reduce((s, v, i) => s + v * d[i], 0);
      const det = n * sxx - sx * sx;
      if (Math.abs(det) < Number.EPSILON) continue;
      let depth = (n * sxy - sx * sy) / det;
      const offset = (sy - depth * sx) / n;
      // The model bound: a baffle step is a shelf of limited depth. A fit that
      // wants more than that is describing something else, so it is clipped
      // and the residual it leaves behind becomes visible instead of hidden.
      if (depth > BAFFLE_STEP_MAX_DEPTH_DB) depth = BAFFLE_STEP_MAX_DEPTH_DB;
      if (depth < 0) depth = 0;
      const resid = d.map((v, i) => v - (offset + depth * x[i]));
      const rms = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / n);
      if (best === null || rms < best.residualRmsDb) {
        // Where does the residual last exceed tolerance, scanning upward?
        //
        // ONLY WHEN THE MODEL FITS AT ALL, and that guard is load-bearing. A
        // fit whose OVERALL residual is already outside tolerance is not
        // describing a baffle step anywhere in the band, so "the last
        // frequency at which it misbehaves" is simply the top of the fitted
        // band -- and the detector would condemn the whole far-field
        // measurement on the strength of a model that never matched it.
        // Caught on the app's own demo set, where a poor fit pushed the gate
        // floor from 397 Hz to 2 kHz and took two drivers out of the report.
        // This detector is ADVISORY (A5b.1ii): when it cannot fit, it abstains
        // and says so.
        // Judged on the MEDIAN absolute residual, not the RMS. The two answer
        // different questions and only one of them is the question here: RMS
        // asks "how big is the error", median asks "does the model describe
        // most of this band". A genuinely broken zone is exactly what the
        // detector is for, and it drags an RMS over tolerance — which would
        // make the detector abstain on the one case it exists to catch. A
        // model that matches nowhere moves the median instead.
        const absSorted = resid.map(Math.abs).sort((u, v) => u - v);
        const medianAbs = absSorted[absSorted.length >> 1];
        const fits = medianAbs <= tol;
        // A PERSISTING residual, not a single excursion. A5b.1(ii) says
        // "blijvend residu markeert de kapotte zone", and the word does the
        // work: one sample over tolerance near the top of the band would
        // otherwise condemn every frequency below it. So only a RUN of
        // consecutive violations spanning at least `BROKEN_ZONE_MIN_OCTAVES`
        // counts, and the floor is the top of the highest such run.
        let breaks: number | null = null;
        if (fits) {
          let runStart = -1;
          for (let i = 0; i <= resid.length; i++) {
            const bad = i < resid.length && Math.abs(resid[i]) > tol;
            if (bad && runStart < 0) runStart = i;
            if (!bad && runStart >= 0) {
              const span = Math.log2(f[i - 1] / f[runStart]);
              if (span >= BROKEN_ZONE_MIN_OCTAVES) breaks = f[Math.min(i, f.length - 1)];
              runStart = -1;
            }
          }
        }
        best = {
          f0Hz: f0,
          depthDb: depth,
          exponent: p,
          offsetDb: offset,
          residualRmsDb: rms,
          residualToleranceDb: tol,
          fits,
          breaksBelowHz: breaks,
          fittedBand: [f[0], f[f.length - 1]],
        };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * The verdict per measurement
 * ------------------------------------------------------------------ */

export interface ValidityInput {
  entry: ManifestEntry;
  /** The measurement's own frequency extent. */
  extent: [number, number];
  /**
   * Result of the advisory FF/NF test for THIS far-field measurement, when the
   * driver also has a near field. Absent = the test did not run, which is a
   * different statement from "the test passed".
   */
  ffnf?: BaffleStepFit | null;
}

/**
 * The validity interval of one measurement.
 *
 * Read the branches as the rank order they are: impedance has no gate at all,
 * near field has a ceiling but no floor, far field has the header floor and
 * may only ever be pushed UP by the advisory detector.
 */
export function validityOf(input: ValidityInput): ValidityInterval {
  const { entry, extent } = input;

  if (entry.kind === 'Z') {
    // A5c: impedance is exact and gate-free. Its validity is the file's extent.
    const v = noFloor('impedance is gate-free — valid over the whole sweep', extent[1], 'end of sweep');
    v.fromHz = extent[0];
    v.fromReason = 'start of sweep (impedance has no gate)';
    v.estimators = [];
    return v;
  }

  if (entry.kind === 'NF') {
    const ceiling = keeleCeilingHz(entry.diameterInch);
    const v = noFloor(
      'near field has no gate floor — the mic is inside the reflection',
      ceiling === null ? extent[1] : Math.min(ceiling, extent[1]),
      ceiling === null
        ? 'end of sweep (no diameter given — Keele ceiling unknown)'
        : `Keele piston limit ${KEELE_NEARFIELD_HZ_INCH}/${entry.diameterInch}″`,
    );
    v.fromHz = extent[0];
    v.fromReason = 'start of sweep (near field is not gated)';
    v.estimators = [stamp(EXTRACTOR_NEARFIELD)];
    if (ceiling === null) {
      v.notes.push(
        'No effective diameter tagged: the near-field ceiling cannot be computed, ' +
          'so everything downstream treats this measurement as unbounded above — tag the diameter.',
      );
    }
    const mic = micDistanceOk(entry);
    if (mic === false) {
      v.notes.push(
        `Microphone further than ${KEELE_MIC_DISTANCE_FRACTION_OF_RADIUS}×radius from the cone: ` +
          'the near-field level is understated and the splice will be wrong.',
      );
    }
    return v;
  }

  // FF / GP — the gated cases.
  const hf = headerFloor(entry);
  const estimators: EstimatorStamp[] = [];
  const notes: string[] = [];
  let fromHz: number | null = null;
  let fromReason: string;
  let fineDetailFromHz: number | null = null;

  if (hf) {
    estimators.push(stamp(EXTRACTOR_HEADER));
    fromHz = hf.hardHz;
    fineDetailFromHz = hf.fineHz;
    fromReason =
      `header window ${hf.windowMs.toFixed(3)} ms → ` +
      `${HEADER_FLOOR_ABSOLUTE_OVER_T}/T = ${hf.hardHz.toFixed(0)} Hz ` +
      `(fine structure from ${HEADER_FLOOR_TRUSTED_OVER_T}/T = ${hf.fineHz.toFixed(0)} Hz)`;
  } else {
    fromReason =
      'no window fields in the header — the hard floor is UNKNOWN, not absent; ' +
      'everything that needs it stays off';
    notes.push(
      'This measurement carries no window/reference-time header. The gate floor cannot be ' +
        'derived, so no metric may use it below an unknown limit.',
    );
  }

  const fit = input.ffnf;
  if (fit) {
    estimators.push(stamp(EXTRACTOR_FFNF));
    if (fit.breaksBelowHz !== null) {
      if (fromHz === null || fit.breaksBelowHz > fromHz) {
        fromHz = fit.breaksBelowHz;
        fromReason =
          `FF/NF baffle-step residual only settles above ${fit.breaksBelowHz.toFixed(0)} Hz ` +
          `(fit f0 ${fit.f0Hz.toFixed(0)} Hz, depth ${fit.depthDb.toFixed(1)} dB, ` +
          `RMS ${fit.residualRmsDb.toFixed(2)} dB) — advisory detector RAISED the header floor`;
      } else {
        notes.push(
          `FF/NF model test flags ${fit.breaksBelowHz.toFixed(0)} Hz, below the header floor — ` +
            'the header floor stays binding (it may never be relaxed).',
        );
      }
    } else if (fit.fits) {
      notes.push(
        `FF/NF baffle-step model fits over ${fit.fittedBand[0].toFixed(0)}–` +
          `${fit.fittedBand[1].toFixed(0)} Hz (RMS ${fit.residualRmsDb.toFixed(2)} dB).`,
      );
    } else {
      notes.push(
        `FF/NF baffle-step model does NOT fit over ${fit.fittedBand[0].toFixed(0)}–` +
          `${fit.fittedBand[1].toFixed(0)} Hz (RMS ${fit.residualRmsDb.toFixed(2)} dB against a ` +
          `${fit.residualToleranceDb.toFixed(2)} dB tolerance). The advisory detector ABSTAINS: ` +
          'it cannot tell a broken far field from a baffle the model does not describe. The header ' +
          'floor stands on its own here.',
      );
    }
  }

  return {
    fromHz,
    toHz: extent[1],
    fromReason,
    toReason: 'end of sweep',
    fineDetailFromHz,
    notes,
    estimators,
  };
}

/* ------------------------------------------------------------------ *
 * A5.5 — propagation and coverage
 * ------------------------------------------------------------------ */

/** Intersection of several intervals; nulls are "no limit from this side". */
export function intersectIntervals(
  intervals: readonly { name: string; interval: ValidityInterval }[],
): { fromHz: number | null; toHz: number | null; fromBy: string; toBy: string } {
  let fromHz: number | null = null;
  let toHz: number | null = null;
  let fromBy = '';
  let toBy = '';
  for (const { name, interval } of intervals) {
    if (interval.fromHz !== null && (fromHz === null || interval.fromHz > fromHz)) {
      fromHz = interval.fromHz;
      fromBy = name;
    }
    if (interval.toHz !== null && (toHz === null || interval.toHz < toHz)) {
      toHz = interval.toHz;
      toBy = name;
    }
  }
  return { fromHz, toHz, fromBy, toBy };
}

export interface Coverage {
  /** The band the metric WANTED to evaluate. */
  intendedHz: [number, number];
  /** What was left after intersecting with the data's validity; null = nothing. */
  evaluatedHz: [number, number] | null;
  /** Fraction of the intended band actually covered, measured in OCTAVES. */
  fraction: number;
  /** True when the evaluated band is too thin to stand behind. */
  flagged: boolean;
  /** Which measurement clipped which edge. */
  limitedBy: { low: string; high: string };
  /** One line, ready for the report. */
  describe: string;
}

/**
 * Coverage of an intended band, measured in octaves rather than hertz.
 *
 * Octaves because hertz would make every low-frequency metric look catastrophic
 * and every high-frequency one look complete: 400–550 Hz is 0.46 octave of a
 * 0.5-octave intention (92 %), and 150 Hz out of 20 kHz is not.
 */
export function coverageOf(
  intended: [number, number],
  limits: { fromHz: number | null; toHz: number | null; fromBy: string; toBy: string },
  opts: { flagBelowFraction?: number } = {},
): Coverage {
  const flagBelow = opts.flagBelowFraction ?? 0.8;
  const lo = Math.max(intended[0], limits.fromHz ?? intended[0]);
  const hi = Math.min(intended[1], limits.toHz ?? intended[1]);
  const wanted = octavesBetween(intended[0], intended[1]);
  const got = hi > lo ? octavesBetween(lo, hi) : 0;
  const fraction = wanted > 0 ? Math.max(0, Math.min(1, got / wanted)) : 0;
  const evaluated: [number, number] | null = hi > lo ? [lo, hi] : null;
  const pct = (fraction * PERCENT).toFixed(0);
  return {
    intendedHz: intended,
    evaluatedHz: evaluated,
    fraction,
    flagged: fraction < flagBelow,
    limitedBy: { low: limits.fromBy, high: limits.toBy },
    describe: evaluated
      ? `evaluated over ${lo.toFixed(0)}–${hi.toFixed(0)} Hz, which is ${pct} % of the intended ` +
        `${intended[0].toFixed(0)}–${intended[1].toFixed(0)} Hz` +
        (limits.fromBy || limits.toBy
          ? ` (bottom clipped by ${limits.fromBy || 'nothing'}, top by ${limits.toBy || 'nothing'})`
          : '')
      : `NOT EVALUATED — the intended ${intended[0].toFixed(0)}–${intended[1].toFixed(0)} Hz lies ` +
        'entirely outside the valid data',
  };
}
