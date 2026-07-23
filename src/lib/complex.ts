/**
 * Minimal complex-number arithmetic.
 *
 * Plain object `{ re, im }` is used everywhere instead of a class so that large
 * arrays of samples stay cheap and JSON-serialisable (important for project
 * persistence later). All functions are pure and allocate a new value.
 */
export interface Complex {
  re: number;
  im: number;
}

export const cplx = (re: number, im = 0): Complex => ({ re, im });

export const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });

export const sub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });

export const mul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const div = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
};

export const scale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k });

export const conj = (a: Complex): Complex => ({ re: a.re, im: -a.im });

export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

/** Argument in radians, range (-π, π]. */
export const arg = (a: Complex): number => Math.atan2(a.im, a.re);

/** Build a complex value from magnitude and phase (radians). */
export const fromPolar = (magnitude: number, phaseRad: number): Complex => ({
  re: magnitude * Math.cos(phaseRad),
  im: magnitude * Math.sin(phaseRad),
});

/** Reciprocal 1 / a. */
export const inv = (a: Complex): Complex => {
  const denom = a.re * a.re + a.im * a.im;
  return { re: a.re / denom, im: -a.im / denom };
};
