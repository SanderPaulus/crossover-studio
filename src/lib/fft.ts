/**
 * Minimal radix-2 FFT — enough for IFFT-based time-domain views (impulse,
 * step, ETC). In-place, iterative, no allocations beyond the twiddle loop.
 */

export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw new Error(`fft: length must be a power of two, got ${n}.`);
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nRe;
      }
    }
  }
}

export function ifftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fftInPlace(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/**
 * Amplitude envelope of a real signal via the analytic signal (Hilbert):
 * envelope[n] = |h[n] + j·HT(h)[n]|. Input length must be a power of two.
 */
export function envelope(signal: Float64Array): Float64Array {
  const n = signal.length;
  const re = Float64Array.from(signal);
  const im = new Float64Array(n);
  fftInPlace(re, im);
  // Analytic signal: DC and Nyquist ×1, positive freqs ×2, negative zeroed.
  for (let i = 1; i < n / 2; i++) {
    re[i] *= 2;
    im[i] *= 2;
  }
  for (let i = n / 2 + 1; i < n; i++) {
    re[i] = 0;
    im[i] = 0;
  }
  ifftInPlace(re, im);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}
