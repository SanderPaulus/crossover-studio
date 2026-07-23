import { fftInPlace, ifftInPlace } from './fft.ts';

/**
 * Minimum-phase reconstruction from magnitude — the VituixCAD convention.
 *
 * φ_min = −H{ln|H|} (Hilbert transform of log-magnitude), computed via the
 * real cepstrum: ifft(ln|H|) → fold (causal part ×2, anticausal zeroed) →
 * fft → the imaginary part is the minimum phase.
 *
 * WHY THIS EXISTS: VituixCAD (with MinimumPhase=True, driver Z-offsets 0)
 * discards measured phase entirely and sums drivers with the phase implied by
 * their magnitude alone — no acoustic-centre offsets, no excess phase. Our
 * tool defaults to the MEASURED phase. This function lets the user flip to
 * the VituixCAD convention for an apples-to-apples comparison; the delta
 * between the two modes IS the information minimum-phase processing throws
 * away.
 *
 * Band edges: outside the measured band the magnitude is extrapolated with
 * the edge slope (dB/oct over the last half-octave, clamped to ±60 dB total)
 * — a rolloff that continues is far closer to reality than a flat hold. Like
 * every minimum-phase implementation, the result near the edges still depends
 * on that choice — trust the midband, not the last third-octave.
 */

export interface MinPhaseOptions {
  /** Default 768 kHz — deliberately extreme: the Hilbert transform is
   *  global, so rolloff far ABOVE the audio band still contributes in-band
   *  phase. A low Nyquist silently truncates that and skews the whole curve
   *  by degrees. Even so, the top octave reads a few degrees short of true
   *  minimum phase — inherent to band-limited reconstruction (VituixCAD makes
   *  the same class of approximation). */
  sampleRate?: number;
  fftSize?: number; // power of two, default 131072
}

export function minimumPhaseDeg(
  freq: readonly number[],
  splDb: readonly number[],
  opts: MinPhaseOptions = {},
): number[] {
  const { sampleRate = 768000, fftSize = 131072 } = opts;
  const n = fftSize;
  const df = sampleRate / n;
  const m = freq.length;

  // Edge slopes in dB/octave over the outermost half-octave.
  const edgeSlope = (from: 'lo' | 'hi'): number => {
    const fEdge = from === 'lo' ? freq[0] : freq[m - 1];
    const fIn = from === 'lo' ? fEdge * Math.SQRT2 : fEdge / Math.SQRT2;
    let j = from === 'lo' ? 0 : m - 1;
    if (from === 'lo') {
      while (j < m - 1 && freq[j] < fIn) j++;
    } else {
      while (j > 0 && freq[j] > fIn) j--;
    }
    const dbEdge = from === 'lo' ? splDb[0] : splDb[m - 1];
    const oct = Math.log2(freq[j] / fEdge);
    return oct !== 0 ? (splDb[j] - dbEdge) / oct : 0;
  };
  const slopeLo = edgeSlope('lo');
  const slopeHi = edgeSlope('hi');

  // ln|H| on the linear FFT grid, slope-extrapolated outside the band
  // (clamped to ±60 dB from the edge so f→0 cannot run away).
  const interpDb = (f: number): number => {
    if (f <= freq[0]) {
      const ext = slopeLo * Math.log2(Math.max(f, df / 2) / freq[0]);
      return splDb[0] + Math.max(-60, Math.min(60, ext));
    }
    if (f >= freq[m - 1]) {
      const ext = slopeHi * Math.log2(f / freq[m - 1]);
      return splDb[m - 1] + Math.max(-60, Math.min(60, ext));
    }
    let j = 0;
    while (j < m - 2 && freq[j + 1] < f) j++;
    const t = (f - freq[j]) / (freq[j + 1] - freq[j]);
    return splDb[j] + t * (splDb[j + 1] - splDb[j]);
  };

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const LN10_20 = Math.LN10 / 20;
  for (let k = 0; k <= n / 2; k++) {
    const lnMag = interpDb(k * df) * LN10_20;
    re[k] = lnMag;
    if (k > 0 && k < n / 2) re[n - k] = lnMag; // even symmetry
  }

  // Real cepstrum, folded to the causal side.
  ifftInPlace(re, im);
  for (let k = 1; k < n / 2; k++) {
    re[k] *= 2;
    im[k] *= 2;
  }
  for (let k = n / 2 + 1; k < n; k++) {
    re[k] = 0;
    im[k] = 0;
  }
  fftInPlace(re, im);

  // im now holds φ_min in radians on the linear grid; sample at the
  // requested frequencies. Unwrapping is unnecessary: the cepstral phase
  // comes out continuous.
  const out = new Array<number>(m);
  for (let i = 0; i < m; i++) {
    const pos = Math.min(freq[i] / df, n / 2 - 1);
    const k = Math.floor(pos);
    const t = pos - k;
    const ph = im[k] + t * (im[k + 1] - im[k]);
    out[i] = (ph * 180) / Math.PI;
  }
  return out;
}
