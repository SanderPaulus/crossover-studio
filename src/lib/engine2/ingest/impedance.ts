/**
 * A5c — THE IMPEDANCE EXTRACTORS.
 *
 * Impedance is the one measurement in this app that is exact and gate-free, so
 * it carries most of the derived parameters: R_e, the resonances and their Q,
 * the reflex/sealed diagnosis, the ripple scan and the voice-coil model. Every
 * band these produce is derived from the curve itself — there is not a single
 * frequency in this file (P6).
 *
 * THE V8 DEFECTS ARE ADDRESSED HERE BY CONSTRUCTION, NOT BY A COMMENT:
 *   V8a — R_e from min|Z| picks up reactance, so R_e comes from Re(Z).
 *   V8b — the rising voice-coil inductance was detected as a "peak", so a peak
 *         is only MOTIONAL when the impedance phase crosses zero there.
 *   V8d — Re(Z) at the lowest bins overestimates when the sweep starts on top
 *         of f_L, so R_e comes from a MOTIONAL FIT extrapolated to DC
 *         (`motionalFit.ts`), the direct reading stays available as the
 *         comparison value, and the contamination is stated in ohms computed
 *         from the fitted resonance rather than guessed from an octave count.
 *   V8e — the semi-inductance fit produced nonsense on a tweeter, so the fit
 *         validates itself and refuses rather than reporting an exponent.
 */

import {
  PERCENT,
  RE_LOW_FRACTION_OF_POINTS,
  RESONANCE_MIN_Z_OVER_RE,
  RESONANCE_PHASE_ZERO_DEG,
  REFLEX_DIP_FRACTION,
  SEMI_INDUCTANCE_DECADES_ABOVE_RESONANCE,
  SEMI_INDUCTANCE_MAX_LN_RESIDUAL,
  SEMI_INDUCTANCE_N_MAX,
  SEMI_INDUCTANCE_N_MIN,
  DEFAULT_TREND_OCTAVE_FRACTION,
  PEAK_MIN_DB_OVER_TREND,
} from '../constants.ts';
import {
  dbAmp,
  degToRad,
  findResidualPeaks,
  octaveTrend,
  type Peak,
} from '../util.ts';
import { stamp, type EstimatorStamp } from '../version.ts';
import { fitMotionalRe, type MotionalReFit } from './motionalFit.ts';

export const EXTRACTOR_RE = 'z-re' as const;
export const EXTRACTOR_RESONANCE = 'z-resonance' as const;
export const EXTRACTOR_SEMI_L = 'z-semi-inductance' as const;
export const EXTRACTOR_Z_RIPPLE = 'z-ripple' as const;

/** A measured impedance curve on its own frequency grid. */
export interface ImpedanceCurve {
  freq: readonly number[];
  /** |Z| in ohms. */
  magnitude: readonly number[];
  /** Impedance phase in degrees. */
  phaseDeg: readonly number[];
}

const reOf = (c: ImpedanceCurve, i: number): number =>
  c.magnitude[i] * Math.cos(degToRad(c.phaseDeg[i]));

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ------------------------------------------------------------------ *
 * R_e — A5c.1, rebuilt at F3b (V8d)
 *
 * THREE SOURCES, ONE HIERARCHY, AND THE HIERARCHY IS THE POINT.
 *
 *   1. A DC RESISTANCE THE DESIGNER MEASURED. A multimeter reading is a
 *      measurement OF THE QUANTITY ITSELF. Everything below is inference from
 *      a sweep, however good. When it is supplied it wins, full stop.
 *   2. THE MOTIONAL FIT (`motionalFit.ts`). The model's R_e at DC — the
 *      extrapolation V8d asks for, taken from the fit that produced it rather
 *      than beside it. It carries its own abstention duty and can refuse.
 *   3. THE DIRECT READING. Re(Z) over the lowest slice of the sweep. Correct
 *      wherever the motional impedance has died away, an overestimate where it
 *      has not — and after F3b the app says HOW MUCH it is carrying, in ohms
 *      computed from the fitted branch, instead of guessing from an octave
 *      count.
 *
 * All three are always reported. The old reading in particular is never
 * discarded: it is the comparison value, and on a driver whose sweep starts
 * far below resonance the two agreeing is the evidence that the fit is sane.
 * ------------------------------------------------------------------ */

/** Where the authoritative R_e came from. */
export type ReSource = 'entered' | 'motional-fit' | 'direct';

export interface ReEstimate {
  /** The value every downstream metric uses, ohms. */
  ohm: number;
  /** Which of the three sources produced it. */
  source: ReSource;
  /** The sentence the report shows beside the number. */
  sourceText: string;
  /** The direct low-frequency reading, always computed. */
  directOhm: number;
  /** How many of the lowest points went into that reading. */
  pointsUsed: number;
  /** The motional fit, when there was anything to fit. */
  fit: MotionalReFit | null;
  /**
   * V8d — what the DIRECT reading is carrying, in ohms, at the bottom of the
   * sweep. Set only when the fit could quantify it. Null means "not known",
   * never "zero".
   */
  motionalSkirtOhm: number | null;
  /**
   * Set when the value in use is known to be contaminated: the fit refused (or
   * could not run) and the direct reading is carrying motional impedance. The
   * text states ohms and percent, not octaves.
   */
  motionalProximityWarning: string | null;
  /**
   * A5e.4 — set when the ONE reclassification pass found a different set of
   * motional resonances than the pass that seeded the fit.
   *
   * The loop is classify -> fit -> reclassify, and it runs to a FIXED DEPTH of
   * one reclassification. It could be run to convergence instead, and that is
   * exactly what must not happen: a determinism policy that says "same input,
   * same result" cannot rest on a loop whose iteration count depends on how a
   * threshold happens to fall on one driver. So a peak set that moves is a
   * REPORTABLE CONDITION, not a reason for a third round.
   *
   * What it usually means: a marginal crest crossed the `Z > k·R_e` bar when
   * R_e came down. The value in use is still the fit's, because the fit
   * converged and passed both its quality limits; what this says is that the
   * alignment reported beside it was derived from a slightly different reading
   * of the same curve, and that a reader comparing the two should know.
   */
  reclassificationShift: string | null;
  estimator: EstimatorStamp;
}

/** The direct reading on its own: median of Re(Z) over the lowest slice. */
export function directRe(curve: ImpedanceCurve): { ohm: number; pointsUsed: number } {
  const n = curve.freq.length;
  const k = Math.max(3, Math.floor(n * RE_LOW_FRACTION_OF_POINTS));
  const lows: number[] = [];
  for (let i = 0; i < k; i++) lows.push(reOf(curve, i));
  return { ohm: median(lows), pointsUsed: k };
}

export interface ReEstimateOptions {
  /** The driver's fundamental in-box resonance — the fit band hangs on it. */
  fundamentalHz?: number | null;
  /** Every motional resonance the classification found. */
  motionalPeaks?: readonly { fHz: number; ohm: number; q: number | null }[];
  /** A DC resistance the designer measured. Wins over everything. */
  enteredOhm?: number;
  /** Quality limits for the fit; absent = the constants. */
  maxRelativeResidual?: number;
  maxBandSensitivityFraction?: number;
}

/**
 * R_e, through the hierarchy above.
 *
 * With no options at all this still produces a value — the direct reading,
 * with no fit and therefore no skirt figure — which is what the bootstrap pass
 * needs before the resonances have been classified.
 */
export function estimateRe(curve: ImpedanceCurve, opts: ReEstimateOptions = {}): ReEstimate {
  const direct = directRe(curve);

  const fit =
    opts.fundamentalHz !== undefined && opts.fundamentalHz !== null && opts.motionalPeaks
      ? fitMotionalRe({
          freq: curve.freq,
          magnitude: curve.magnitude,
          phaseDeg: curve.phaseDeg,
          fundamentalHz: opts.fundamentalHz,
          seeds: opts.motionalPeaks,
          startReOhm: direct.ohm,
          ...(opts.maxRelativeResidual !== undefined
            ? { maxRelativeResidual: opts.maxRelativeResidual }
            : {}),
          ...(opts.maxBandSensitivityFraction !== undefined
            ? { maxBandSensitivityFraction: opts.maxBandSensitivityFraction }
            : {}),
        })
      : null;

  const skirt = fit ? fit.skirtAtSweepStartOhm : null;
  const skirtText =
    skirt === null
      ? ''
      : `${skirt.toFixed(3)} Ω (${((skirt / direct.ohm) * PERCENT).toFixed(1)} % of the reading) ` +
        `of motional impedance at ${curve.freq[0].toFixed(1)} Hz, computed from the fitted ` +
        'resonance itself';

  if (opts.enteredOhm !== undefined && opts.enteredOhm > 0) {
    return {
      ohm: opts.enteredOhm,
      source: 'entered',
      sourceText:
        'DC resistance measured with a meter and entered for this driver — a measurement of the ' +
        'quantity itself, so it outranks both sweep derivations' +
        (fit?.accepted ? ` (the motional fit reads ${fit.reOhm.toFixed(3)} Ω)` : '') +
        ` (the direct low-frequency reading is ${direct.ohm.toFixed(3)} Ω)`,
      directOhm: direct.ohm,
      pointsUsed: direct.pointsUsed,
      fit,
      motionalSkirtOhm: skirt,
      motionalProximityWarning: null,
      reclassificationShift: null,
      estimator: stamp(EXTRACTOR_RE),
    };
  }

  if (fit?.accepted) {
    return {
      ohm: fit.reOhm,
      source: 'motional-fit',
      sourceText:
        `motional fit over ${fit.bandHz[0].toFixed(1)}–${fit.bandHz[1].toFixed(0)} Hz ` +
        `(${fit.branches.length} resonance${fit.branches.length === 1 ? '' : 's'}, relative RMS ` +
        `residual ${fit.relativeResidual.toFixed(4)}, band sensitivity ±` +
        `${fit.bandSensitivityOhm.toFixed(3)} Ω), extrapolated to DC. The direct low-frequency ` +
        `reading is ${direct.ohm.toFixed(3)} Ω` +
        (skirt === null ? '' : ` and carries ${skirtText}`),
      directOhm: direct.ohm,
      pointsUsed: direct.pointsUsed,
      fit,
      motionalSkirtOhm: skirt,
      motionalProximityWarning: null,
      reclassificationShift: null,
      estimator: stamp(EXTRACTOR_RE),
    };
  }

  // The fit refused, or there was nothing to fit. The direct reading stands —
  // and says what it is carrying, when the fit got far enough to say.
  const because = fit?.refusal
    ? `The motional fit ABSTAINED: ${fit.refusal}.`
    : 'No motional fit was possible on this sweep (no classified resonance to seed it).';
  const warning =
    skirt !== null && skirt > 0
      ? `${because} The direct reading is therefore in use, and it is an OVERESTIMATE: it carries ` +
        `${skirtText}. Treat every R_e-dependent number as a bound rather than a value, or measure ` +
        'the DC resistance with a meter and enter it.'
      : fit?.refusal
        ? `${because} The direct reading is in use and the contamination could not be quantified.`
        : null;

  return {
    ohm: direct.ohm,
    source: 'direct',
    sourceText:
      `Re(Z) over the lowest ${direct.pointsUsed} points of the sweep. ` +
      (fit?.refusal ? because : 'No motional fit was taken.'),
    directOhm: direct.ohm,
    pointsUsed: direct.pointsUsed,
    fit,
    motionalSkirtOhm: skirt,
    motionalProximityWarning: warning,
    reclassificationShift: null,
    estimator: stamp(EXTRACTOR_RE),
  };
}

/* ------------------------------------------------------------------ *
 * The fixed-depth resolution of R_e and the alignment (A5e.4)
 * ------------------------------------------------------------------ */

export interface ResolvedRe {
  re: ReEstimate;
  /** The classification the FINAL R_e implies — what everything downstream reads. */
  classification: ImpedanceClassification;
  /**
   * How many times the peak finder actually ran.
   *
   * COUNTED AT THE CALL, not asserted about. V17's lesson in miniature: the
   * gate counter there disagreed with reality because one call path reached
   * the hook directly, and no timing measurement would ever have found it. So
   * every classification in this function goes through one counted helper, and
   * the number it produces is part of the result rather than a claim in a
   * comment.
   *
   * 2 in the ordinary case (locate, then reclassify on the final R_e). 1 when
   * R_e did not move at all — the second pass is then PROVABLY identical,
   * because `classifyImpedance` is a pure function of the curve and R_e, so
   * skipping it is arithmetic rather than impatience. Never 3.
   */
  classificationPasses: number;
}

/** The peak set as a comparable key: which motional resonances, at what bins. */
const peakKey = (c: ImpedanceClassification): string =>
  c.motionalPeaks.map((p) => p.fHz.toFixed(4)).join(',');

/**
 * R_e and the alignment, resolved together, to a FIXED DEPTH.
 *
 * THE LOOP AND WHY IT DOES NOT LOOP.
 *
 *   1. BOOTSTRAP. The peak finder needs an R_e to measure "clearly above R_e"
 *      against, so it gets the direct low-frequency reading. Its job here is
 *      only to LOCATE the resonances, and a crest does not move with a tenth
 *      of an ohm.
 *   2. FIT. Those resonances seed the motional fit, which returns R_e as the
 *      term surviving at DC — or refuses, in which case the direct reading
 *      stands with its contamination stated (V8d). A DC resistance the
 *      designer measured outranks both.
 *   3. RECLASSIFY, ONCE. r0, the sealed alignment's Q_mc/Q_ec/Q_tc and the
 *      vented loss indicator Z(f_b)/R_e are all RATIOS TO R_e. Leaving them on
 *      the bootstrap value would ship a driver whose R_e says one thing and
 *      whose alignment was computed from another.
 *
 * AND THEN IT STOPS. Running to convergence would make the iteration count a
 * property of how a threshold happens to fall on one particular curve, and
 * A5e.4 asks for "zelfde invoer + zelfde seed = byte-identiek resultaat" — a
 * guarantee that cannot rest on a loop nobody can bound. A peak set that moves
 * between the two passes is therefore REPORTED (`reclassificationShift`) and
 * the fit keeps its value: it converged and it passed both quality limits, and
 * what shifted is which crests the finder admits at the new R_e, not whether
 * the fit describes the curve.
 */
export function resolveRe(curve: ImpedanceCurve, opts: ReEstimateOptions = {}): ResolvedRe {
  let classificationPasses = 0;
  const classify = (reOhm: number): ImpedanceClassification => {
    classificationPasses++;
    return classifyImpedance(curve, reOhm);
  };

  const bootstrap = estimateRe(curve, {});
  const located = classify(bootstrap.ohm);

  const re = estimateRe(curve, {
    ...opts,
    fundamentalHz: located.fundamentalHz,
    motionalPeaks: located.motionalPeaks.map((p) => ({ fHz: p.fHz, ohm: p.ohm, q: p.q })),
  });

  if (re.ohm === bootstrap.ohm) {
    return { re, classification: located, classificationPasses };
  }

  const settled = classify(re.ohm);
  if (peakKey(settled) === peakKey(located)) {
    return { re, classification: settled, classificationPasses };
  }

  const before = located.motionalPeaks.map((p) => `${p.fHz.toFixed(0)} Hz`);
  const after = settled.motionalPeaks.map((p) => `${p.fHz.toFixed(0)} Hz`);
  return {
    re: {
      ...re,
      reclassificationShift:
        `The one reclassification pass on the resolved R_e (${re.ohm.toFixed(3)} Ω, from ` +
        `${bootstrap.ohm.toFixed(3)} Ω) finds a DIFFERENT set of motional resonances than the ` +
        `pass that seeded the fit: [${before.join(', ')}] became [${after.join(', ')}]. ` +
        'Almost always a marginal crest crossing the "clearly above R_e" bar. The pass is NOT ' +
        'repeated - a loop run to convergence would make the iteration count a property of the ' +
        'curve rather than of the rules (A5e.4) - so the fit keeps its value and this says that ' +
        'the alignment beside it was derived from a slightly different reading of the same sweep.',
    },
    classification: settled,
    classificationPasses,
  };
}

/* ------------------------------------------------------------------ *
 * Resonances and the reflex/sealed classification
 * ------------------------------------------------------------------ */

export interface ZPeak {
  fHz: number;
  /** |Z| at the crest, ohms. */
  ohm: number;
  /** Impedance phase at the crest, degrees. */
  phaseDeg: number;
  /** |Z|/R_e at the crest. */
  r0: number;
  /**
   * TRUE when the phase crosses through zero at the crest — the signature of a
   * motional resonance. False means a flank: almost always the rising voice-coil
   * inductance, which V8b caught being reported as a resonance with Q ≈ 0.5.
   */
  motional: boolean;
  /**
   * Q of THIS PEAK, from the half-height points of the peak itself: the
   * frequencies where |Z| passes (Z_max + R_e)/2, and Q = f/(f2−f1).
   *
   * Deliberately NOT the Small construction. Small's √r0·R_e level is defined
   * for the fundamental resonance of a sealed alignment and yields Q_mc there
   * (which `SealedDiagnosis` reports, with that name). Applied to an arbitrary
   * peak — the upper peak of a vented pair, a cone mode showing in the
   * impedance — it is measuring something that has no name. Half-height is the
   * generic answer to "how sharp is this peak", and it is the one that
   * reproduces the reference analysis's Q of the woofer's upper peak.
   *
   * Null when the curve does not come back down to that level inside the sweep.
   */
  q: number | null;
  /**
   * V49 — SMALL'S MECHANICAL Q OF THIS PEAK, and its electrical companion.
   *
   * The half-height `q` above answers "how sharp is this peak"; this answers
   * the question M-C v2.0 asks, "how far does a volt move the cone at this
   * resonance", and that needs Q_ms in the sense of the mass-compliance model:
   * the peak's half-POWER width read at √r0·R_e, with Q_ms = f·√r0/(f2−f1) and
   * Q_es = Q_ms/(r0−1) (Small 1972, the same construction `SealedDiagnosis`
   * has always used for the fundamental of a sealed alignment). Carried on
   * EVERY motional peak rather than only on the sealed fundamental so that a
   * vented woofer's upper peak can be read the same way — an approximation
   * there, and the reader that uses it says so.
   *
   * Null when the curve does not come back down to √r0·R_e inside the sweep.
   * `z-resonance` went 1.0 → 1.1 for this: the shape grew, no number moved.
   */
  qms: number | null;
  qes: number | null;
  /** Why the classification came out this way — shown, never just applied. */
  reason: string;
}

export interface ReflexDiagnosis {
  fLHz: number;
  fbHz: number;
  fHHz: number;
  /** |Z| in the dip, ohms. */
  zDipOhm: number;
  /** √(f_L·f_H) — should be ≈ f_b; the consistency check of A5c.3. */
  sqrtCheckHz: number;
  /** Relative disagreement of that check, as a fraction of f_b. */
  sqrtCheckError: number;
  /**
   * The loss indicator Z(f_b)/R_e. Read against the Q_L ≈ 7 practical rule as
   * ORIENTATION only — its accuracy inherits every error in R_e one for one
   * (V8d), which is why the R_e warning travels with it.
   */
  lossIndicator: number;
}

export interface SealedDiagnosis {
  fcHz: number;
  zMaxOhm: number;
  r0: number;
  /** Mechanical Q at f_c (Small). */
  qmc: number | null;
  /** Electrical Q at f_c: Q_mc/(r0−1). */
  qec: number | null;
  /** Total: the parallel combination. */
  qtc: number | null;
}

export interface ImpedanceClassification {
  type: 'reflex' | 'sealed' | 'unknown';
  peaks: ZPeak[];
  motionalPeaks: ZPeak[];
  reflex: ReflexDiagnosis | null;
  sealed: SealedDiagnosis | null;
  /**
   * THE FUNDAMENTAL in-box resonance — reflex: the UPPER of the two peaks that
   * flank the port dip; sealed: f_c. This is what M-C, M-D, M-E and the
   * crossover-window floor all mean when they say "f_s" or "the upper
   * impedance peak" (A4).
   *
   * Deliberately NOT "the highest motional peak". A cone breakup shows up in
   * the impedance as a genuine motional resonance — phase zero crossing and
   * all — and on the mid of casus 1 the highest motional peak sits at 5.7 kHz.
   * Keying f_s off that would put the mid's "resonance floor" for a crossover
   * eight kilohertz up.
   */
  fundamentalHz: number | null;
  /** The HIGHEST motional peak of any kind — reported, never used as f_s. */
  upperResonanceHz: number | null;
  /** The LOWEST motional resonance — what the R_e proximity warning uses. */
  lowerResonanceHz: number | null;
  reason: string;
  estimator: EstimatorStamp;
}

/** Interpolate, in log-f, the frequency where `mag` crosses `target`. */
function crossingHz(
  freq: readonly number[],
  mag: readonly number[],
  from: number,
  step: -1 | 1,
  target: number,
): number | null {
  let j = from;
  while (j > 0 && j < freq.length - 1 && mag[j] > target) j += step;
  if (mag[j] > target) return null;
  const k = j - step;
  const y0 = mag[j];
  const y1 = mag[k];
  if (y1 === y0) return freq[j];
  const t = (target - y0) / (y1 - y0);
  return Math.exp(Math.log(freq[j]) + t * (Math.log(freq[k]) - Math.log(freq[j])));
}

/**
 * BAND-FREE classification (the prototype's `bandfree.py`, which exists
 * because the earlier banded version needed frequencies to work).
 *
 * A candidate crest must (a) be a local |Z| maximum, (b) rise clearly above
 * R_e, and (c) be the tallest thing in its own neighbourhood — the last test
 * suppresses the shoulder samples of a broad peak. It is then MOTIONAL only if
 * the impedance phase is near zero there.
 */
export function classifyImpedance(
  curve: ImpedanceCurve,
  reOhm: number,
): ImpedanceClassification {
  const { freq, magnitude: a, phaseDeg } = curve;
  const n = freq.length;
  // Neighbourhood for the "tallest locally" test, in samples. A fraction of
  // the sweep rather than a fixed count, so it means the same thing on a
  // coarse LIMP sweep and on a dense one.
  const NEIGHBOURHOOD_FRACTION = 0.03;
  const half = Math.max(2, Math.round(n * NEIGHBOURHOOD_FRACTION));

  const peaks: ZPeak[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(a[i] > a[i - 1] && a[i] >= a[i + 1])) continue;
    if (!(a[i] > RESONANCE_MIN_Z_OVER_RE * reOhm)) continue;
    let localMax = -Infinity;
    for (let j = Math.max(0, i - half); j < Math.min(n, i + half); j++) {
      if (a[j] > localMax) localMax = a[j];
    }
    // `>=` with a hair of slack: an exactly-flat crest must not disqualify itself.
    if (!(a[i] >= localMax * (1 - 1e-3))) continue;

    const r0 = a[i] / reOhm;
    const motional = Math.abs(phaseDeg[i]) < RESONANCE_PHASE_ZERO_DEG;
    const halfHeight = (a[i] + reOhm) / 2;
    const lo = crossingHz(freq, a, i, -1, halfHeight);
    const hi = crossingHz(freq, a, i, 1, halfHeight);
    const q = lo !== null && hi !== null && hi > lo ? freq[i] / (hi - lo) : null;
    /* V49 — Small's construction on THIS peak: the half-power level is
     * √r0·R_e, not half the peak height. Same arithmetic `SealedDiagnosis`
     * applies to the fundamental below; here it is carried per peak. */
    const smallLevel = reOhm * Math.sqrt(r0);
    const sLo = crossingHz(freq, a, i, -1, smallLevel);
    const sHi = crossingHz(freq, a, i, 1, smallLevel);
    const qms = sLo !== null && sHi !== null && sHi > sLo ? (freq[i] * Math.sqrt(r0)) / (sHi - sLo) : null;
    const qes = qms !== null && r0 > 1 ? qms / (r0 - 1) : null;
    peaks.push({
      fHz: freq[i],
      ohm: a[i],
      phaseDeg: phaseDeg[i],
      r0,
      motional,
      q,
      qms,
      qes,
      reason: motional
        ? `phase ${phaseDeg[i].toFixed(0)}° at the crest — inside ±${RESONANCE_PHASE_ZERO_DEG}°, so motional`
        : `phase ${phaseDeg[i].toFixed(0)}° at the crest — outside ±${RESONANCE_PHASE_ZERO_DEG}°, ` +
          'so this is a flank (voice-coil inductance rise), not a resonance (V8b)',
    });
  }

  const motional = peaks.filter((p) => p.motional);
  const est = stamp(EXTRACTOR_RESONANCE);
  const upper = motional.length ? motional[motional.length - 1].fHz : null;
  const lower = motional.length ? motional[0].fHz : null;

  if (motional.length >= 2) {
    // The dip between the two lowest motional peaks. A reflex box shows two
    // motional peaks with a deep minimum between them; anything shallower is
    // two resonances that are not a reflex tuning.
    const iL = freq.indexOf(motional[0].fHz);
    const iH = freq.indexOf(motional[1].fHz);
    let iDip = iL;
    for (let j = iL; j <= iH; j++) if (a[j] < a[iDip]) iDip = j;
    const smaller = Math.min(motional[0].ohm, motional[1].ohm);
    if (a[iDip] < REFLEX_DIP_FRACTION * smaller) {
      const fL = motional[0].fHz;
      const fH = motional[1].fHz;
      const fb = freq[iDip];
      const check = Math.sqrt(fL * fH);
      return {
        type: 'reflex',
        peaks,
        motionalPeaks: motional,
        reflex: {
          fLHz: fL,
          fbHz: fb,
          fHHz: fH,
          zDipOhm: a[iDip],
          sqrtCheckHz: check,
          sqrtCheckError: Math.abs(check - fb) / fb,
          lossIndicator: a[iDip] / reOhm,
        },
        sealed: null,
        fundamentalHz: fH,
        upperResonanceHz: upper,
        lowerResonanceHz: lower,
        reason:
          `two motional peaks (${fL.toFixed(1)} / ${fH.toFixed(1)} Hz) with a dip to ` +
          `${a[iDip].toFixed(2)} Ω between them — below ${REFLEX_DIP_FRACTION}× the smaller peak, ` +
          'so this is a vented alignment',
        estimator: est,
      };
    }
  }

  if (motional.length >= 1) {
    const p = motional[0];
    // Q_mc is the CLASSIC SMALL construction and needs its own level: the
    // half-power points of a sealed alignment sit at √r0·R_e, not at half the
    // peak height. `ZPeak.q` is the generic peak sharpness; these three are
    // the alignment, and mixing them up silently changes what Q_ec and Q_tc
    // mean.
    const iP = freq.indexOf(p.fHz);
    const smallLevel = reOhm * Math.sqrt(p.r0);
    const sLo = crossingHz(freq, a, iP, -1, smallLevel);
    const sHi = crossingHz(freq, a, iP, 1, smallLevel);
    const qmc =
      sLo !== null && sHi !== null && sHi > sLo ? (p.fHz * Math.sqrt(p.r0)) / (sHi - sLo) : null;
    const qec = qmc !== null && p.r0 > 1 ? qmc / (p.r0 - 1) : null;
    const qtc = qmc !== null && qec !== null ? (qmc * qec) / (qmc + qec) : null;
    return {
      type: 'sealed',
      peaks,
      motionalPeaks: motional,
      reflex: null,
      sealed: { fcHz: p.fHz, zMaxOhm: p.ohm, r0: p.r0, qmc, qec, qtc },
      fundamentalHz: p.fHz,
      upperResonanceHz: upper,
      lowerResonanceHz: lower,
      reason:
        `one motional peak at ${p.fHz.toFixed(1)} Hz` +
        (motional.length > 1 ? ' plus higher motional peaks that do not form a vented pair' : '') +
        ' — treated as a sealed/free-air alignment',
      estimator: est,
    };
  }

  return {
    type: 'unknown',
    peaks,
    motionalPeaks: [],
    reflex: null,
    sealed: null,
    fundamentalHz: null,
    upperResonanceHz: null,
    lowerResonanceHz: null,
    reason:
      peaks.length > 0
        ? 'peaks found but none has a phase zero crossing — no motional resonance inside the sweep'
        : 'no |Z| peak rises far enough above R_e to be a resonance',
    estimator: est,
  };
}

/* ------------------------------------------------------------------ *
 * Voice-coil semi-inductance
 * ------------------------------------------------------------------ */

export interface SemiInductance {
  /** |Z − R_e| = K·ω^n. */
  k: number;
  n: number;
  /** RMS residual of the log-log fit, natural-log units. */
  lnResidualRms: number;
  fitBandHz: [number, number];
  /** FALSE when the fit refuses to be believed — see `reason` (V8e). */
  valid: boolean;
  reason: string;
  estimator: EstimatorStamp;
}

/**
 * Fit the semi-inductance model above the motional region.
 *
 * The fit band starts a decade above the HIGHEST motional resonance — derived
 * from the driver, never a frequency — and runs to the top of the sweep.
 *
 * V8e IS HANDLED BY REFUSING. On a tweeter the motional tail reaches far past
 * the audio band and the fit produces an exponent with no physical meaning.
 * So the result is checked against the model's own physics (0.5 ≤ n ≤ 1) and
 * against its residual, and a fit that fails either is returned with
 * `valid: false` and a reason. Callers must not read `n` when `valid` is false.
 */
export function fitSemiInductance(
  curve: ImpedanceCurve,
  reOhm: number,
  upperResonanceHz: number | null,
): SemiInductance | null {
  const est = stamp(EXTRACTOR_SEMI_L);
  if (upperResonanceHz === null || !(upperResonanceHz > 0)) return null;
  const from = upperResonanceHz * 10 ** SEMI_INDUCTANCE_DECADES_ABOVE_RESONANCE;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < curve.freq.length; i++) {
    if (curve.freq[i] < from) continue;
    const re = reOf(curve, i);
    const im = curve.magnitude[i] * Math.sin(degToRad(curve.phaseDeg[i]));
    const mag = Math.hypot(re - reOhm, im);
    if (!(mag > 0)) continue;
    xs.push(Math.log(2 * Math.PI * curve.freq[i]));
    ys.push(Math.log(mag));
  }
  const MIN_POINTS = 8;
  if (xs.length < MIN_POINTS) {
    return {
      k: NaN,
      n: NaN,
      lnResidualRms: NaN,
      fitBandHz: [from, curve.freq[curve.freq.length - 1]],
      valid: false,
      reason:
        `only ${xs.length} points sit a decade above the resonance at ` +
        `${upperResonanceHz.toFixed(0)} Hz — too few to fit a voice-coil model (V8e)`,
      estimator: est,
    };
  }
  const m = xs.length;
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const det = m * sxx - sx * sx;
  const n = (m * sxy - sx * sy) / det;
  const lnK = (sy - n * sx) / m;
  const resid = ys.map((y, i) => y - (lnK + n * xs[i]));
  const rms = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / m);

  const inRange = n >= SEMI_INDUCTANCE_N_MIN && n <= SEMI_INDUCTANCE_N_MAX;
  const clean = rms <= SEMI_INDUCTANCE_MAX_LN_RESIDUAL;
  return {
    k: Math.exp(lnK),
    n,
    lnResidualRms: rms,
    fitBandHz: [from, curve.freq[curve.freq.length - 1]],
    valid: inRange && clean,
    reason: inRange
      ? clean
        ? `n = ${n.toFixed(2)} (1 = pure inductance, 0.5 = strong eddy-current suppression)`
        : `residual ${rms.toFixed(2)} exceeds ${SEMI_INDUCTANCE_MAX_LN_RESIDUAL}: the band is not a ` +
          'clean power law — the model does not describe this driver here (V8e)'
      : `exponent ${n.toFixed(2)} lies outside the physical range ` +
        `${SEMI_INDUCTANCE_N_MIN}–${SEMI_INDUCTANCE_N_MAX}: the motional tail still dominates the ` +
        'fit band, so no voice-coil model can be extracted from this measurement (V8e)',
    estimator: est,
  };
}

/* ------------------------------------------------------------------ *
 * Ripple scan
 * ------------------------------------------------------------------ */

export interface ZRipple {
  /** RMS deviation from the fractional-octave trend, dB. */
  rmsDb: number;
  /** Individual ripples above the detection threshold. */
  peaks: Peak[];
  octaveFraction: number;
  estimator: EstimatorStamp;
}

/**
 * A5c.4 — ripple against the fractional-octave trend: standing waves inside
 * the box, port-pipe resonances, pod modes. Each one gets a frequency and an
 * amplitude to check against the cabinet geometry; this extractor does not
 * interpret them.
 */
export function scanImpedanceRipple(
  curve: ImpedanceCurve,
  opts: { octaveFraction?: number; minDb?: number } = {},
): ZRipple {
  const fraction = opts.octaveFraction ?? DEFAULT_TREND_OCTAVE_FRACTION;
  const minDb = opts.minDb ?? PEAK_MIN_DB_OVER_TREND;
  const db = curve.magnitude.map((m) => dbAmp(m));
  const trend = octaveTrend(curve.freq, db, fraction);
  const residual = db.map((v, i) => v - trend[i]);
  const rms = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / residual.length);
  return {
    rmsDb: rms,
    peaks: findResidualPeaks(curve.freq, residual, minDb),
    octaveFraction: fraction,
    estimator: stamp(EXTRACTOR_Z_RIPPLE),
  };
}
