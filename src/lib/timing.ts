/**
 * Timing-offset sanity check — the safeguard the whole acoustic-integration
 * feature depends on.
 *
 * WHY THIS EXISTS
 * ---------------
 * Driver integration (relative-phase graph, integration score, EGD/step) is
 * only correct if the two drivers share a consistent time reference. REW encodes
 * that reference as a timing offset / acoustic-centre position, and the FRD
 * phase you export is entangled with it. If that offset is wrong — or if the
 * export convention (offset baked *into* the phase vs already removed *from* it)
 * is misread — every downstream graph still looks perfectly plausible. That is
 * the silent failure. The only defence is an INDEPENDENT measurement of the
 * delay, computed straight from the phase data, that we can hold up against the
 * declared value.
 *
 * WHAT THIS DOES
 * --------------
 * A pure time delay τ contributes phase  φ(f) = -360·f·τ  (degrees). We unwrap
 * the measured phase, fit a straight line over a chosen band, and read the bulk
 * delay off the slope:  τ = -slope / 360. The fit's R² tells us how delay-like
 * the phase actually is — a low R² means a single bulk delay does not describe
 * this band, so the estimate must NOT be trusted (reported as `unreliable`
 * rather than silently returned).
 */

export const SPEED_OF_SOUND = 343; // m/s at ~20 °C

export interface BulkDelayEstimate {
  /** Estimated bulk delay in seconds. Positive = response is delayed. */
  delaySeconds: number;
  /** Same value in milliseconds, for display. */
  delayMs: number;
  /** Fitted slope of unwrapped phase, degrees per Hz. */
  slopeDegPerHz: number;
  /** Coefficient of determination of the linear fit, 0..1. */
  rSquared: number;
  /** Band actually used for the fit, [fLow, fHigh] in Hz. */
  band: [number, number];
  /** Number of samples inside the band. */
  sampleCount: number;
}

/**
 * Unwrap a phase array given in degrees so that jumps larger than ±180° between
 * consecutive samples are removed. Returns a new array; input is untouched.
 */
export function unwrapPhaseDeg(phaseDeg: readonly number[]): number[] {
  const out = new Array<number>(phaseDeg.length);
  let offset = 0;
  for (let i = 0; i < phaseDeg.length; i++) {
    if (i > 0) {
      let delta = phaseDeg[i] - phaseDeg[i - 1];
      // Reduce delta into (-180, 180], accumulate the removed multiples of 360.
      while (delta > 180) {
        delta -= 360;
        offset -= 360;
      }
      while (delta <= -180) {
        delta += 360;
        offset += 360;
      }
    }
    out[i] = phaseDeg[i] + offset;
  }
  return out;
}

/**
 * Estimate the bulk delay present in a measurement's phase by least-squares
 * fitting unwrapped phase vs frequency over `band`.
 *
 * @param freq      strictly ascending frequencies, Hz
 * @param phaseDeg  phase in degrees, same length as freq (wrapped is fine)
 * @param band      [fLow, fHigh] to fit over; defaults to the full range. Pass a
 *                  band where the driver is on-axis and delay-dominated (e.g. its
 *                  passband) for the most trustworthy estimate.
 */
export function estimateBulkDelay(
  freq: readonly number[],
  phaseDeg: readonly number[],
  band?: [number, number],
): BulkDelayEstimate {
  if (freq.length !== phaseDeg.length) {
    throw new Error('estimateBulkDelay: freq and phase length mismatch.');
  }
  const fLow = band ? band[0] : freq[0];
  const fHigh = band ? band[1] : freq[freq.length - 1];
  if (fHigh <= fLow) throw new Error('estimateBulkDelay: band high must exceed band low.');

  const unwrapped = unwrapPhaseDeg(phaseDeg);

  // Collect in-band points.
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] >= fLow && freq[i] <= fHigh) {
      xs.push(freq[i]);
      ys.push(unwrapped[i]);
    }
  }
  if (xs.length < 3) {
    throw new Error(
      `estimateBulkDelay: need at least 3 samples in band [${fLow}, ${fHigh}] Hz, got ${xs.length}.`,
    );
  }

  const { slope, rSquared } = linearFit(xs, ys);
  const delaySeconds = -slope / 360;

  return {
    delaySeconds,
    delayMs: delaySeconds * 1000,
    slopeDegPerHz: slope,
    rSquared,
    band: [fLow, fHigh],
    sampleCount: xs.length,
  };
}

export type TimingVerdict = 'ok' | 'mismatch' | 'unreliable' | 'no-reference';

export interface TimingCheckResult {
  verdict: TimingVerdict;
  /** Delay independently estimated from the phase. */
  estimate: BulkDelayEstimate;
  /** Declared offset compared against, in ms (from REW metadata or the user). */
  declaredMs?: number;
  /** |declared − estimate| in ms, when a declared value was supplied. */
  differenceMs?: number;
  /** Human-readable explanation, safe to show directly in the UI. */
  message: string;
}

export interface TimingCheckOptions {
  /** Declared/expected offset in ms (REW metadata or user-entered). */
  declaredMs?: number;
  /** Fit band, Hz. Defaults to the measurement's full range. */
  band?: [number, number];
  /** Max |declared − estimate| still considered consistent. Default 0.05 ms (~17 mm). */
  toleranceMs?: number;
  /** Minimum fit R² for the estimate to be trusted. Default 0.9. */
  minRSquared?: number;
}

/**
 * Cross-validate a declared timing offset against the phase-derived delay.
 *
 * Note on interpretation: this compares the *residual bulk delay in the exported
 * phase* against the declared offset. Whether REW bakes its offset into the
 * exported phase or removes it is a per-workflow convention — so a `mismatch`
 * does not automatically mean the declared value is wrong, it means the two
 * disagree and a human must reconcile them against a known-good reference. That
 * reconciliation is precisely the check that stops the silent error.
 */
export function checkTimingOffset(
  freq: readonly number[],
  phaseDeg: readonly number[],
  opts: TimingCheckOptions = {},
): TimingCheckResult {
  const { declaredMs, band, toleranceMs = 0.05, minRSquared = 0.9 } = opts;
  const estimate = estimateBulkDelay(freq, phaseDeg, band);

  if (estimate.rSquared < minRSquared) {
    return {
      verdict: 'unreliable',
      estimate,
      declaredMs,
      differenceMs: declaredMs === undefined ? undefined : Math.abs(declaredMs - estimate.delayMs),
      message:
        `Phase over ${fmtBand(estimate.band)} is not well described by a single delay ` +
        `(R²=${estimate.rSquared.toFixed(3)} < ${minRSquared}). The ${estimate.delayMs.toFixed(3)} ms ` +
        `estimate is unreliable — pick a cleaner passband before trusting it.`,
    };
  }

  if (declaredMs === undefined) {
    return {
      verdict: 'no-reference',
      estimate,
      message:
        `No declared timing offset to check against. Phase-derived bulk delay over ` +
        `${fmtBand(estimate.band)} is ${estimate.delayMs.toFixed(3)} ms (R²=${estimate.rSquared.toFixed(3)}). ` +
        `Enter the expected acoustic-centre offset to enable the cross-check.`,
    };
  }

  const differenceMs = Math.abs(declaredMs - estimate.delayMs);
  if (differenceMs <= toleranceMs) {
    return {
      verdict: 'ok',
      estimate,
      declaredMs,
      differenceMs,
      message:
        `Consistent: declared ${declaredMs.toFixed(3)} ms vs phase-derived ` +
        `${estimate.delayMs.toFixed(3)} ms (Δ=${differenceMs.toFixed(3)} ms ≤ ${toleranceMs} ms).`,
    };
  }

  return {
    verdict: 'mismatch',
    estimate,
    declaredMs,
    differenceMs,
    message:
      `MISMATCH: declared ${declaredMs.toFixed(3)} ms vs phase-derived ${estimate.delayMs.toFixed(3)} ms ` +
      `(Δ=${differenceMs.toFixed(3)} ms > ${toleranceMs} ms). Reconcile before trusting any ` +
      `integration graph — this is exactly the offset error that otherwise stays hidden.`,
  };
}

/** Ordinary least-squares fit y = a + b·x, returning slope b and R². */
function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; rSquared: number } {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxy / sxx;
  // R² = (covariance)² / (var_x · var_y); guard the degenerate flat-phase case.
  const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, rSquared };
}

const fmtBand = (b: [number, number]): string => `${Math.round(b[0])}–${Math.round(b[1])} Hz`;

/* ------------------------------------------------------------------------- *
 * Shared-reference assessment
 *
 * When two drivers are measured from ONE mic position without resetting the
 * time axis, their phase-derived bulk delays must be nearly equal — they share
 * the mic distance plus any common interface latency, and differ only by the
 * acoustic-centre geometry (millimetres, so tens of µs). A large difference is
 * the fingerprint of a broken time base: one measurement re-referenced (REW
 * "t=0 at IR peak"), a moved mic, or files from different sessions. That is
 * the exact silent error the integration graphs cannot survive.
 * ------------------------------------------------------------------------- */

export type SharedRefVerdict = 'plausible' | 'suspect' | 'unreliable';

export interface SharedReferenceResult {
  verdict: SharedRefVerdict;
  /** tweeter − woofer bulk delay, µs (signed: positive = tweeter later). */
  deltaUs: number;
  /** Same, expressed as acoustic-centre depth difference in mm. */
  deltaMm: number;
  /**
   * Apparent mic distance per driver, metres (delay × c). Includes any common
   * playback/capture latency, so treat as an upper bound on the true acoustic
   * distance — its job here is plausibility, not calibration.
   */
  apparentDistanceM: { woofer: number; tweeter: number };
  message: string;
}

export interface SharedReferenceOptions {
  /**
   * Max |Δ| still explainable by driver geometry on one baffle. Default
   * 300 µs ≈ 10 cm — generous for acoustic-centre differences, far below the
   * ~ms-scale jump a reset time axis produces.
   */
  maxGeometryUs?: number;
  /** Minimum fit R² for either estimate to be usable. Default 0.9. */
  minRSquared?: number;
}

export function assessSharedReference(
  woofer: BulkDelayEstimate,
  tweeter: BulkDelayEstimate,
  opts: SharedReferenceOptions = {},
): SharedReferenceResult {
  const { maxGeometryUs = 300, minRSquared = 0.9 } = opts;

  const deltaUs = (tweeter.delaySeconds - woofer.delaySeconds) * 1e6;
  const deltaMm = deltaUs * 1e-6 * SPEED_OF_SOUND * 1000;
  const apparentDistanceM = {
    woofer: woofer.delaySeconds * SPEED_OF_SOUND,
    tweeter: tweeter.delaySeconds * SPEED_OF_SOUND,
  };

  const base = { deltaUs, deltaMm, apparentDistanceM };

  if (woofer.rSquared < minRSquared || tweeter.rSquared < minRSquared) {
    const which = [
      woofer.rSquared < minRSquared ? `woofer R²=${woofer.rSquared.toFixed(3)}` : null,
      tweeter.rSquared < minRSquared ? `tweeter R²=${tweeter.rSquared.toFixed(3)}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    return {
      ...base,
      verdict: 'unreliable',
      message:
        `Cannot judge the time base: phase is not delay-like in the fit band (${which} < ${minRSquared}). ` +
        `Pick a cleaner passband before trusting any integration graph.`,
    };
  }

  if (Math.abs(deltaUs) <= maxGeometryUs) {
    return {
      ...base,
      verdict: 'plausible',
      message:
        `Shared time reference plausible: Δ ${deltaUs.toFixed(0)} µs (≈ ${deltaMm.toFixed(1)} mm) ` +
        `is within driver-geometry range (±${maxGeometryUs} µs). The relative phase between the ` +
        `drivers can be trusted as measured.`,
    };
  }

  return {
    ...base,
    verdict: 'suspect',
    message:
      `Time bases differ by ${deltaUs.toFixed(0)} µs (≈ ${(deltaMm / 10).toFixed(1)} cm) — too large ` +
      `for driver geometry on one baffle. Likely causes: a re-referenced time axis (e.g. REW t=0 at ` +
      `IR peak) on one file, a moved microphone, or measurements from different sessions. Fix the ` +
      `measurements — do not trust the relative phase.`,
  };
}
