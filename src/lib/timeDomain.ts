import { ifftInPlace, envelope } from './fft.ts';
import { unwrapPhaseDeg } from './timing.ts';

/**
 * Time-domain views of the combined response — impulse, step response and
 * ETC via IFFT, plus excess group delay from the phase derivative.
 *
 * Honest framing (Stefan's words): no substitute for a real measurement, but
 * a usable sanity check of the time behaviour. The band edges are tapered
 * (half-cosine) because the measurement simply ends there — anything the
 * window adds outside [fMin, fMax] is presentation, not data.
 */

export interface TimeDomainResult {
  /** Time axis in ms, RELATIVE to the impulse peak (peak = 0). */
  timeMs: number[];
  impulse: number[]; // normalized to peak |1|
  step: number[]; // normalized to peak |1|
  etcDb: number[]; // envelope, 0 dB at peak
  /** Absolute arrival time of the impulse peak, ms (bulk delay survives). */
  peakTimeMs: number;
}

export interface TimeDomainOptions {
  sampleRate?: number; // default 48000
  fftSize?: number; // power of two, default 16384
  /** Displayed window around the peak, ms. Default [-1, +6]. */
  windowMs?: [number, number];
}

export function toTimeDomain(
  freq: readonly number[],
  splDb: readonly number[],
  phaseDeg: readonly number[], // unwrapped
  opts: TimeDomainOptions = {},
): TimeDomainResult {
  const { sampleRate = 48000, fftSize = 16384, windowMs = [-1, 6] } = opts;
  const n = fftSize;
  const df = sampleRate / n;
  const fMin = freq[0];
  const fMax = Math.min(freq[freq.length - 1], sampleRate / 2);

  // Reference level → linear gain 1 (keeps the IFFT numerically friendly).
  let refSum = 0;
  let refN = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] >= 500 && freq[i] <= 5000) {
      refSum += splDb[i];
      refN++;
    }
  }
  const refDb = refN ? refSum / refN : splDb[0];

  // Linear interpolation of dB + unwrapped phase onto the FFT bins.
  const interp = (f: number): { db: number; ph: number } => {
    let j = 0;
    while (j < freq.length - 2 && freq[j + 1] < f) j++;
    const t = (f - freq[j]) / (freq[j + 1] - freq[j]);
    return {
      db: splDb[j] + t * (splDb[j + 1] - splDb[j]),
      ph: phaseDeg[j] + t * (phaseDeg[j + 1] - phaseDeg[j]),
    };
  };

  // Edge slopes for phase extrapolation outside the measured band: continuing
  // with the edge group delay avoids a phase kink at the taper.
  const loSlope = (phaseDeg[1] - phaseDeg[0]) / (freq[1] - freq[0]);
  const m = freq.length;
  const hiSlope = (phaseDeg[m - 1] - phaseDeg[m - 2]) / (freq[m - 1] - freq[m - 2]);

  // Half-cosine tapers over 1/2 octave outside the measured band.
  const loTaperEnd = fMin;
  const loTaperStart = fMin / Math.SQRT2;
  const hiTaperStart = fMax;
  const hiTaperEnd = Math.min(fMax * Math.SQRT2, sampleRate / 2);

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 1; k < n / 2; k++) {
    const f = k * df;
    let mag = 0;
    let ph = 0;
    if (f >= fMin && f <= fMax) {
      const v = interp(f);
      mag = 10 ** ((v.db - refDb) / 20);
      ph = v.ph;
    } else if (f > loTaperStart && f < loTaperEnd) {
      const t = (f - loTaperStart) / (loTaperEnd - loTaperStart);
      mag = 10 ** ((splDb[0] - refDb) / 20) * 0.5 * (1 - Math.cos(Math.PI * t));
      ph = phaseDeg[0] + loSlope * (f - fMin);
    } else if (f > hiTaperStart && f < hiTaperEnd) {
      const t = (f - hiTaperStart) / (hiTaperEnd - hiTaperStart);
      mag = 10 ** ((splDb[m - 1] - refDb) / 20) * 0.5 * (1 + Math.cos(Math.PI * t));
      ph = phaseDeg[m - 1] + hiSlope * (f - fMax);
    }
    const rad = (ph * Math.PI) / 180;
    re[k] = mag * Math.cos(rad);
    im[k] = mag * Math.sin(rad);
    // Conjugate symmetry for a real time signal.
    re[n - k] = re[k];
    im[n - k] = -im[k];
  }

  ifftInPlace(re, im);
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) h[i] = re[i];

  // Peak, normalization, cumulative step, envelope.
  let peakI = 0;
  let peakAbs = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(h[i]);
    if (a > peakAbs) {
      peakAbs = a;
      peakI = i;
    }
  }
  const env = envelope(h);

  const step = new Float64Array(n);
  let acc = 0;
  let stepMax = 0;
  for (let i = 0; i < n; i++) {
    acc += h[i];
    step[i] = acc;
    stepMax = Math.max(stepMax, Math.abs(acc));
  }

  // Window around the peak.
  const dtMs = 1000 / sampleRate;
  const i0 = Math.max(0, peakI + Math.round(windowMs[0] / dtMs));
  const i1 = Math.min(n - 1, peakI + Math.round(windowMs[1] / dtMs));
  const timeMs: number[] = [];
  const impulseOut: number[] = [];
  const stepOut: number[] = [];
  const etcDb: number[] = [];
  const envPeak = env[peakI] || 1;
  for (let i = i0; i <= i1; i++) {
    timeMs.push((i - peakI) * dtMs);
    impulseOut.push(h[i] / (peakAbs || 1));
    stepOut.push(step[i] / (stepMax || 1));
    etcDb.push(20 * Math.log10(Math.max(env[i] / envPeak, 1e-6)));
  }

  return {
    timeMs,
    impulse: impulseOut,
    step: stepOut,
    etcDb,
    peakTimeMs: peakI * dtMs,
  };
}

/* ------------------------------------------------------------------ */

export interface ExcessGroupDelayResult {
  freq: number[];
  /** Excess group delay in ms: group delay minus its in-band minimum. */
  egdMs: number[];
  /** The subtracted minimum (≈ bulk/mic delay), ms. */
  minDelayMs: number;
}

/**
 * Excess group delay from unwrapped phase: τg = −dφ/df / 360 (seconds),
 * central differences, smoothed with a fractional-octave moving average, then
 * shifted so the in-band minimum is zero (the constant flight time is not the
 * story; what the filters ADD is).
 */
export function excessGroupDelay(
  freq: readonly number[],
  phaseDeg: readonly number[], // unwrapped
  smoothOct = 1 / 6,
): ExcessGroupDelayResult {
  const n = freq.length;
  if (n < 3) throw new Error('excessGroupDelay: need at least 3 points.');
  const unwrapped = unwrapPhaseDeg(phaseDeg);

  const gd = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    gd[i] = -(unwrapped[b] - unwrapped[a]) / (freq[b] - freq[a]) / 360;
  }

  // Fractional-octave moving average (window in log-f).
  const half = 2 ** (smoothOct / 2);
  const smooth = new Array<number>(n);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const fLo = freq[i] / half;
    const fHi = freq[i] * half;
    while (lo < n && freq[lo] < fLo) lo++;
    while (hi < n - 1 && freq[hi + 1] <= fHi) hi++;
    let s = 0;
    for (let j = lo; j <= hi; j++) s += gd[j];
    smooth[i] = s / (hi - lo + 1);
  }

  const minDelay = Math.min(...smooth);
  return {
    freq: [...freq],
    egdMs: smooth.map((v) => (v - minDelay) * 1000),
    minDelayMs: minDelay * 1000,
  };
}
