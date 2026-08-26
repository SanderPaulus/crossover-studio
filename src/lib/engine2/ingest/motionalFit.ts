/**
 * A5c.1 / V8d — THE MOTIONAL R_e FIT.
 *
 * WHAT WAS WRONG. R_e was read as Re(Z) at the bottom of the sweep. That is a
 * measurement when the motional impedance has died away down there and an
 * overestimate when it has not, and casus 1's woofer is the second case: a
 * sweep starting at 10 Hz beside f_L = 16.5 Hz reads 3.81 Ω against a real
 * ~2.9 Ω. The error is not cosmetic — it sets the Q_es inversion bound
 * R_s ≤ R_e·(q−1) in the UNSAFE direction (an R_s ceiling of 3.81 Ω where the
 * budget actually allows 2.9), and the vented-box loss indicator Z(f_b)/R_e
 * inherits it one for one.
 *
 * WHAT REPLACES IT. A model of the whole low-frequency impedance is fitted and
 * R_e is the term that survives at DC:
 *
 *     Z(ω) = R_e + K·(jω)^n + Σ_k  R_k / (1 + j·Q_k·(f/f_k − f_k/f))
 *
 * Each branch is one motional resonance — the same resonances A5c.2 already
 * detects, seeded from them rather than searched for again. Every branch
 * vanishes at DC by construction, so the model's own R_e IS the extrapolation
 * to f → 0 that V8d asks for; there is no separate extrapolation step that
 * could disagree with the fit that produced it. (The advisory f² extrapolation
 * this replaces returned −2.69 Ω on this very driver.)
 *
 * THREE PROPERTIES, EACH LOAD-BEARING.
 *
 *  1. IT CAN REFUSE (the V8e discipline). An estimator that cannot abstain
 *     will eventually publish nonsense with a straight face — that is exactly
 *     what the semi-inductance fit did on a tweeter before V8e gave it a
 *     validity test. So this fit publishes its residual AND its band
 *     sensitivity, and hands back `accepted: false` with a reason when either
 *     breaches its limit. The caller then falls back to the direct reading.
 *
 *  2. THE WARNING IS Q-AWARE, NOT OCTAVE-BASED. The old proximity rule asked
 *     whether the sweep started within one octave of the lowest resonance.
 *     How far a resonance reaches down is a property of its Q, not of a fixed
 *     octave count, and V18 is the standing lesson that a detector rule
 *     borrowed across curve shapes is how a fix becomes a regression. The
 *     skirt is therefore evaluated from the FITTED branches at the bottom of
 *     the sweep, and the warning states ohms.
 *
 *  3. IT IS DETERMINISTIC WITHOUT A SEED (A5e.4). The solver is
 *     Levenberg-Marquardt from a FIXED list of starting points; every start is
 *     run, the lowest residual wins, ties break on the earlier start. No
 *     clock, no randomness, no iteration over a hashmap.
 */

import {
  RE_FIT_BAND_MULTIPLE_OF_FUNDAMENTAL,
  RE_FIT_COEFFICIENT_STARTS,
  RE_FIT_EXPONENT_STARTS,
  RE_FIT_FALLBACK_SEED_Q,
  RE_FIT_MAX_BAND_SENSITIVITY_FRACTION,
  RE_FIT_MAX_DAMPING_STEPS,
  RE_FIT_MAX_ITERATIONS,
  RE_FIT_MAX_RELATIVE_RESIDUAL,
  RE_FIT_N_MAX,
  RE_FIT_N_MIN,
  RE_FIT_PARAMETER_CLAMP,
  RE_FIT_SENSITIVITY_BAND_MULTIPLES,
} from '../constants.ts';
import { degToRad } from '../util.ts';

/** One fitted motional resonance, in the electrical domain. */
export interface MotionalBranch {
  /** Peak height of this branch above R_e, ohms. */
  rOhm: number;
  fHz: number;
  q: number;
}

/** A seed resonance, as A5c.2's classification found it. */
export interface MotionalSeed {
  fHz: number;
  /** |Z| at the crest, ohms. */
  ohm: number;
  q: number | null;
}

export interface MotionalReFit {
  /** R_e as the model carries it at DC, ohms. */
  reOhm: number;
  /** Semi-inductance coefficient the fit carried alongside it. */
  coefficientK: number;
  /** Its exponent — a nuisance parameter here, not a reported coil model. */
  exponentN: number;
  branches: MotionalBranch[];
  /** The band the primary fit ran on, Hz. */
  bandHz: [number, number];
  /** RMS of |model − Z| / |Z| over that band. */
  relativeResidual: number;
  /** Half the spread of R_e over the comparison bands, ohms. */
  bandSensitivityOhm: number;
  /** The comparison bands and what each one produced, for the report. */
  bandSensitivitySamples: { multiple: number; topHz: number; reOhm: number }[];
  /**
   * Re(Z_motional) at the BOTTOM of the sweep, ohms — how much motional
   * impedance the direct reading is carrying. The Q-aware replacement for the
   * old octave rule.
   */
  skirtAtSweepStartOhm: number;
  /** True when both quality limits were met. */
  accepted: boolean;
  /** Why the fit refused. Null when it did not. */
  refusal: string | null;
  /** The limits it was judged against, so the report can show them. */
  limits: { maxRelativeResidual: number; maxBandSensitivityFraction: number };
}

export interface MotionalFitInput {
  freq: readonly number[];
  magnitude: readonly number[];
  phaseDeg: readonly number[];
  /**
   * The driver's FUNDAMENTAL in-box resonance — the fit band's top is a
   * multiple of it. Absent = no fit (a curve with no resonance has no
   * motional impedance to remove, and the direct reading stands).
   */
  fundamentalHz: number | null;
  /** Every motional resonance A5c.2 found, ascending. */
  seeds: readonly MotionalSeed[];
  /** Starting value for R_e — the direct reading. */
  startReOhm: number;
  /** Quality limits; absent = the constants above. */
  maxRelativeResidual?: number;
  maxBandSensitivityFraction?: number;
  /** Band multiple; absent = the constant above. Used by the sensitivity pass. */
  bandMultiple?: number;
}

/* ------------------------------------------------------------------ *
 * Parameter packing
 *
 * Every parameter is fitted in LOG space (or, for the exponent, through a
 * logistic), so the solver is unconstrained while the model stays physical: a
 * negative R_e or a negative Q cannot be reached, which removes the whole
 * class of "the fit converged to a mirror solution" failures without a
 * constrained solver.
 * ------------------------------------------------------------------ */

const clampParam = (v: number): number =>
  v > RE_FIT_PARAMETER_CLAMP ? RE_FIT_PARAMETER_CLAMP : v < -RE_FIT_PARAMETER_CLAMP ? -RE_FIT_PARAMETER_CLAMP : v;

interface Unpacked {
  re: number;
  k: number;
  n: number;
  branches: MotionalBranch[];
}

function unpack(u: readonly number[], branchCount: number): Unpacked {
  const re = Math.exp(clampParam(u[0]));
  const k = Math.exp(clampParam(u[1]));
  const n = RE_FIT_N_MIN + (RE_FIT_N_MAX - RE_FIT_N_MIN) / (1 + Math.exp(-clampParam(u[2])));
  const branches: MotionalBranch[] = [];
  for (let i = 0; i < branchCount; i++) {
    branches.push({
      rOhm: Math.exp(clampParam(u[3 + 3 * i])),
      fHz: Math.exp(clampParam(u[4 + 3 * i])),
      q: Math.exp(clampParam(u[5 + 3 * i])),
    });
  }
  return { re, k, n, branches };
}

/** Inverse of the exponent's logistic, so a start can be given in n itself. */
function packExponent(n: number): number {
  const t = (n - RE_FIT_N_MIN) / (RE_FIT_N_MAX - RE_FIT_N_MIN);
  const clipped = Math.min(1 - 1e-6, Math.max(1e-6, t));
  return Math.log(clipped / (1 - clipped));
}

/** The model's contribution of the motional branches alone, at one frequency. */
export function motionalImpedanceAt(
  branches: readonly MotionalBranch[],
  fHz: number,
): { re: number; im: number } {
  let re = 0;
  let im = 0;
  for (const b of branches) {
    const detune = b.q * (fHz / b.fHz - b.fHz / fHz);
    const den = 1 + detune * detune;
    re += b.rOhm / den;
    im += (-b.rOhm * detune) / den;
  }
  return { re, im };
}

function modelAt(p: Unpacked, fHz: number): { re: number; im: number } {
  const w = 2 * Math.PI * fHz;
  // K·(jω)^n = K·ω^n·(cos(nπ/2) + j sin(nπ/2))
  const mag = p.k * Math.pow(w, p.n);
  const ang = (p.n * Math.PI) / 2;
  const mot = motionalImpedanceAt(p.branches, fHz);
  return { re: p.re + mag * Math.cos(ang) + mot.re, im: mag * Math.sin(ang) + mot.im };
}

/* ------------------------------------------------------------------ *
 * The solver
 * ------------------------------------------------------------------ */

interface Sample {
  fHz: number;
  re: number;
  im: number;
  mag: number;
}

/** Residual vector: real and imaginary parts, each divided by |Z|. */
function residuals(u: readonly number[], branchCount: number, data: readonly Sample[]): number[] {
  const p = unpack(u, branchCount);
  const out: number[] = new Array(data.length * 2);
  for (let i = 0; i < data.length; i++) {
    const m = modelAt(p, data[i].fHz);
    const dr = (m.re - data[i].re) / data[i].mag;
    const di = (m.im - data[i].im) / data[i].mag;
    // A parameter excursion that overflows must cost, not crash the solve.
    out[i] = Number.isFinite(dr) ? dr : Number.MAX_SAFE_INTEGER;
    out[data.length + i] = Number.isFinite(di) ? di : Number.MAX_SAFE_INTEGER;
  }
  return out;
}

const sumSquares = (v: readonly number[]): number => {
  let s = 0;
  for (const x of v) s += x * x;
  return s;
};

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
function solveLinear(a: number[][], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (!(Math.abs(m[pivot][col]) > 0)) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let c = r + 1; c < n; c++) s -= m[r][c] * x[c];
    x[r] = s / m[r][r];
  }
  return x.every((v) => Number.isFinite(v)) ? x : null;
}

/**
 * Levenberg-Marquardt with a forward-difference Jacobian.
 *
 * Small and local rather than pulled from the app's own minimisers: those are
 * built around the optimiser's cost surface (bounded box, line search,
 * budgets) and this needs none of it — nine parameters, a few hundred
 * samples, and a hard requirement that the same curve always gives the same
 * answer.
 */
function levenbergMarquardt(
  start: readonly number[],
  branchCount: number,
  data: readonly Sample[],
): { u: number[]; cost: number } {
  let u = [...start];
  let r = residuals(u, branchCount, data);
  let cost = sumSquares(r);
  let lambda = 1e-3;
  const n = u.length;

  for (let iter = 0; iter < RE_FIT_MAX_ITERATIONS; iter++) {
    // Jacobian.
    const j: number[][] = [];
    for (let k = 0; k < n; k++) {
      const h = 1e-6 * Math.max(1, Math.abs(u[k]));
      const up = [...u];
      up[k] += h;
      const rp = residuals(up, branchCount, data);
      j.push(rp.map((v, i) => (v - r[i]) / h));
    }
    // Normal equations: A = JᵀJ, g = Jᵀr (j is stored transposed).
    const a: number[][] = [];
    const g: number[] = [];
    for (let p = 0; p < n; p++) {
      const row: number[] = [];
      for (let q = 0; q < n; q++) {
        let s = 0;
        for (let i = 0; i < r.length; i++) s += j[p][i] * j[q][i];
        row.push(s);
      }
      a.push(row);
      let sg = 0;
      for (let i = 0; i < r.length; i++) sg += j[p][i] * r[i];
      g.push(sg);
    }

    let improved = false;
    let stepNorm = 0;
    for (let attempt = 0; attempt < RE_FIT_MAX_DAMPING_STEPS; attempt++) {
      const damped = a.map((row, i) => row.map((v, k2) => (i === k2 ? v + lambda * (v + 1e-9) : v)));
      const step = solveLinear(damped, g.map((v) => -v));
      if (!step) {
        lambda *= 10;
        continue;
      }
      stepNorm = Math.sqrt(sumSquares(step));
      const candidate = u.map((v, i) => clampParam(v + step[i]));
      const rc = residuals(candidate, branchCount, data);
      const cc = sumSquares(rc);
      if (cc < cost) {
        u = candidate;
        r = rc;
        cost = cc;
        lambda = Math.max(lambda * 0.3, 1e-12);
        improved = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved || stepNorm < 1e-13) break;
  }
  return { u, cost };
}

/* ------------------------------------------------------------------ *
 * The extractor
 * ------------------------------------------------------------------ */

function samplesUpTo(input: MotionalFitInput, topHz: number): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < input.freq.length; i++) {
    const f = input.freq[i];
    if (!(f > 0) || f > topHz) continue;
    const mag = input.magnitude[i];
    const ph = degToRad(input.phaseDeg[i]);
    if (!(mag > 0)) continue;
    out.push({ fHz: f, re: mag * Math.cos(ph), im: mag * Math.sin(ph), mag });
  }
  return out;
}

/** One fit at one band top. Returns null when the band holds too little data. */
function fitAt(input: MotionalFitInput, topHz: number): { p: Unpacked; residual: number } | null {
  const data = samplesUpTo(input, topHz);
  const seeds = input.seeds.filter((s) => s.fHz > 0 && s.fHz <= topHz);
  // Each branch costs three parameters; three more for R_e, K and n. Fewer
  // samples than parameters is not an under-determined fit, it is not a fit.
  const params = 3 + 3 * seeds.length;
  if (seeds.length === 0 || data.length * 2 < params * 2) return null;

  const seedTail: number[] = [];
  for (const s of seeds) {
    const height = Math.max(s.ohm - input.startReOhm, input.startReOhm * 0.05);
    seedTail.push(Math.log(height), Math.log(s.fHz), Math.log(s.q && s.q > 0 ? s.q : RE_FIT_FALLBACK_SEED_Q));
  }

  let best: { u: number[]; cost: number } | null = null;
  for (const n0 of RE_FIT_EXPONENT_STARTS) {
    for (const k0 of RE_FIT_COEFFICIENT_STARTS) {
      const start = [Math.log(input.startReOhm * 0.9), Math.log(k0), packExponent(n0), ...seedTail];
      const got = levenbergMarquardt(start, seeds.length, data);
      // Strictly better, so the EARLIER start wins a tie: the list is ordered
      // and the order is part of what makes this reproducible.
      if (best === null || got.cost < best.cost) best = got;
    }
  }
  if (!best) return null;
  return {
    p: unpack(best.u, seeds.length),
    residual: Math.sqrt(best.cost / (2 * data.length)),
  };
}

/**
 * Fit the motional model and read R_e off it.
 *
 * Returns null when there is nothing to fit — no resonance, or not enough of
 * the sweep below the band top. That is not a refusal: it is the case where
 * the direct reading was never in doubt.
 */
export function fitMotionalRe(input: MotionalFitInput): MotionalReFit | null {
  if (input.fundamentalHz === null || !(input.fundamentalHz > 0)) return null;
  if (!(input.startReOhm > 0)) return null;

  const multiple = input.bandMultiple ?? RE_FIT_BAND_MULTIPLE_OF_FUNDAMENTAL;
  const topHz = input.fundamentalHz * multiple;
  const primary = fitAt(input, topHz);
  if (!primary) return null;

  const samples: MotionalReFit['bandSensitivitySamples'] = [];
  for (const m of RE_FIT_SENSITIVITY_BAND_MULTIPLES) {
    const alt = fitAt(input, input.fundamentalHz * m);
    if (alt) samples.push({ multiple: m, topHz: input.fundamentalHz * m, reOhm: alt.p.re });
  }
  const values = [primary.p.re, ...samples.map((s) => s.reOhm)];
  const sensitivity = (Math.max(...values) - Math.min(...values)) / 2;

  const maxResidual = input.maxRelativeResidual ?? RE_FIT_MAX_RELATIVE_RESIDUAL;
  const maxSensitivity = input.maxBandSensitivityFraction ?? RE_FIT_MAX_BAND_SENSITIVITY_FRACTION;
  const sensitivityFraction = sensitivity / primary.p.re;

  let refusal: string | null = null;
  if (!(primary.p.re > 0) || !Number.isFinite(primary.p.re)) {
    refusal = 'the fit did not converge to a physical R_e';
  } else if (primary.residual > maxResidual) {
    refusal =
      `the motional model does not describe this impedance: relative RMS residual ` +
      `${primary.residual.toFixed(4)} against a limit of ${maxResidual.toFixed(4)}`;
  } else if (sensitivityFraction > maxSensitivity) {
    refusal =
      `R_e depends too strongly on the fit band to be a value: ±${sensitivity.toFixed(3)} Ω ` +
      `(${(sensitivityFraction * 100).toFixed(1)} %) across the comparison bands, against a limit ` +
      `of ${(maxSensitivity * 100).toFixed(1)} %`;
  }

  const skirt = motionalImpedanceAt(primary.p.branches, input.freq[0]).re;

  return {
    reOhm: primary.p.re,
    coefficientK: primary.p.k,
    exponentN: primary.p.n,
    branches: primary.p.branches,
    bandHz: [input.freq[0], topHz],
    relativeResidual: primary.residual,
    bandSensitivityOhm: sensitivity,
    bandSensitivitySamples: samples,
    skirtAtSweepStartOhm: skirt,
    accepted: refusal === null,
    refusal,
    limits: { maxRelativeResidual: maxResidual, maxBandSensitivityFraction: maxSensitivity },
  };
}
