import type { Complex } from './complex.ts';
import { cplx, mul, div } from './complex.ts';

/**
 * Virtual (target) filters — analog prototypes evaluated on the jω axis.
 *
 * These are the "knobs" side of the tool: dial in a textbook high/low-pass and
 * parametric EQ per driver, watch the summed response live, and only then
 * worry about realising it passively. Analog prototypes (not digital biquads)
 * because we are simulating acoustic summation, not implementing a DSP.
 */

export type FilterKind = 'BW' | 'LR' | 'BS'; // Butterworth | Linkwitz-Riley | Bessel

export interface HpLpSpec {
  enabled: boolean;
  kind: FilterKind;
  /** 1–4. Linkwitz-Riley only exists in even orders (UI restricts);
   *  Bessel order 1 coincides with BW1. */
  order: 1 | 2 | 3 | 4;
  freq: number; // Hz
}

export type EqBandType = 'peak' | 'lowShelf' | 'highShelf';

export interface EqBandSpec {
  enabled: boolean;
  /** Default 'peak'. Shelves apply the gain below (lowShelf) or above
   *  (highShelf) `freq` — the tool for "pull everything down except…". */
  type?: EqBandType;
  freq: number; // Hz
  gainDb: number; // + boost / − cut
  q: number;
}

export interface DriverFilterSpec {
  gainDb: number;
  hp: HpLpSpec;
  lp: HpLpSpec;
  eq: EqBandSpec[];
}

export const defaultHpLp = (freq: number): HpLpSpec => ({
  enabled: false,
  kind: 'LR',
  order: 2,
  freq,
});

export const defaultEq = (freq: number, gainDb = 0, q = 1): EqBandSpec => ({
  enabled: false,
  freq,
  gainDb,
  q,
});

/** Second-order section Q values per alignment and order (1 = first-order).
 *  `f` is the section's corner relative to the spec frequency (default 1) —
 *  Bessel sections do not share a common pole radius the way BW/LR do. */
function sections(
  kind: FilterKind,
  order: 1 | 2 | 3 | 4,
): Array<{ order: 1 | 2; q?: number; f?: number }> {
  if (kind === 'LR') {
    // LR(2n) = squared Butterworth(n). Odd orders do not exist.
    if (order === 2) return [{ order: 2, q: 0.5 }];
    if (order === 4) return [{ order: 2, q: Math.SQRT1_2 }, { order: 2, q: Math.SQRT1_2 }];
    throw new Error(`Linkwitz-Riley order ${order} does not exist (even orders only).`);
  }
  if (kind === 'BS') {
    // Bessel (maximally flat group delay), −3 dB normalised: section pole
    // radii/Q from factoring the Bessel polynomials, divided by the −3 dB
    // frequency of the whole filter (n=2: 1.3617, n=3: 1.7557, n=4: 2.1139).
    switch (order) {
      case 1:
        return [{ order: 1 }];
      case 2:
        return [{ order: 2, q: 0.5774, f: 1.272 }];
      case 3:
        return [{ order: 1, f: 1.3227 }, { order: 2, q: 0.691, f: 1.4476 }];
      case 4:
        return [{ order: 2, q: 0.5219, f: 1.4302 }, { order: 2, q: 0.8055, f: 1.6034 }];
    }
  }
  switch (order) {
    case 1:
      return [{ order: 1 }];
    case 2:
      return [{ order: 2, q: Math.SQRT1_2 }];
    case 3:
      return [{ order: 1 }, { order: 2, q: 1.0 }];
    case 4:
      return [{ order: 2, q: 0.5412 }, { order: 2, q: 1.3066 }];
  }
}

/** H(jω) of one HP/LP block at frequency f. */
export function evalHpLp(spec: HpLpSpec, mode: 'hp' | 'lp', f: number): Complex {
  // Normalised s = j·(f/f0) for LP; HP is the s → 1/s transform.
  const ratio = mode === 'lp' ? f / spec.freq : spec.freq / f;
  let h = cplx(1);
  for (const sec of sections(spec.kind, spec.order)) {
    // s = j·ratio scaled to the section's own corner. LP sections in
    // normalised s; the HP ratio-inversion above maps them to high-pass
    // (real coefficients, so the s→1/s phase mirror is a conjugate — the
    // per-section corner scale rides along unchanged).
    const r = ratio / (sec.f ?? 1);
    let denom: Complex;
    if (sec.order === 1) {
      denom = cplx(1, r); // s + 1
    } else {
      // s² + s/Q + 1 = (1 − r²) + j·r/Q
      denom = cplx(1 - r * r, r / (sec.q ?? Math.SQRT1_2));
    }
    h = div(h, denom);
  }
  if (mode === 'hp') {
    // Under s→1/s each section contributes conj-mirrored phase; conjugating
    // the LP result restores the true HP phase (magnitude unchanged).
    h = cplx(h.re, -h.im);
  }
  return h;
}

/**
 * Parametric EQ band (audio-EQ-cookbook analog prototypes), s = j·(f/f0),
 * A = 10^(dB/40).
 *  - peak:      |H(f0)| = A² ; unity far away.
 *  - lowShelf:  |H(0)| = A² ; unity far above f0.
 *  - highShelf: |H(∞)| = A² ; unity far below f0.
 */
export function evalEqBand(band: EqBandSpec, f: number): Complex {
  const A = 10 ** (band.gainDb / 40);
  const r = f / band.freq;
  const type = band.type ?? 'peak';

  if (type === 'peak') {
    // H(s) = (s² + s·A/Q + 1) / (s² + s/(A·Q) + 1)
    const numer = cplx(1 - r * r, (r * A) / band.q);
    const denom = cplx(1 - r * r, r / (A * band.q));
    return div(numer, denom);
  }

  const sq = Math.sqrt(A) / band.q;
  if (type === 'lowShelf') {
    // H(s) = A·(s² + (√A/Q)s + A) / (A·s² + (√A/Q)s + 1)
    const numer = cplx(A * (A - r * r) /* A·(A − r²) */, A * sq * r);
    const denom = cplx(1 - A * r * r, sq * r);
    return div(numer, denom);
  }
  // highShelf: H(s) = A·(A·s² + (√A/Q)s + 1) / (s² + (√A/Q)s + A)
  const numer = cplx(A * (1 - A * r * r), A * sq * r);
  const denom = cplx(A - r * r, sq * r);
  return div(numer, denom);
}

/** Total virtual-filter transfer for one driver over a frequency grid. */
export function evalDriverFilter(spec: DriverFilterSpec, freq: readonly number[]): Complex[] {
  const g = 10 ** (spec.gainDb / 20);
  return freq.map((f) => {
    let h = cplx(g);
    if (spec.hp.enabled) h = mul(h, evalHpLp(spec.hp, 'hp', f));
    if (spec.lp.enabled) h = mul(h, evalHpLp(spec.lp, 'lp', f));
    for (const band of spec.eq) {
      if (band.enabled && band.gainDb !== 0) h = mul(h, evalEqBand(band, f));
    }
    return h;
  });
}

/** True when any block in the spec does anything. */
export function isActive(spec: DriverFilterSpec): boolean {
  return (
    spec.gainDb !== 0 || spec.hp.enabled || spec.lp.enabled || spec.eq.some((b) => b.enabled)
  );
}
