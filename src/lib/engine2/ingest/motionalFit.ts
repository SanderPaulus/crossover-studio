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
 *
 * B-1 — THE HALF-POWER LEAK TERM, TESTED INSTEAD OF ASSUMED.
 *
 * The `K·(jω)^n` term above is the HALF-POWER LEAK term: the lossy part of the
 * voice-coil impedance, which on a real driver rises roughly as √ω because
 * eddy currents in the pole piece suppress the pure `jωL` rise. It sat in this
 * model unconditionally, which means nobody had ever measured whether it
 * belongs — and casus 2 published an exponent 15 % away from the value its own
 * model was built with, with no doubt attached (casus 2 finding B2).
 *
 * So both models are fitted on EVERY sweep now, and both are reported:
 *
 *   (a) `second-order`           Z = R_e + Σ branches
 *   (b) `second-order-plus-leak` Z = R_e + K·(jω)^n + Σ branches
 *
 * THE TERM IS KEPT ON EVERY SWEEP, AND THAT IS A MEASUREMENT AND NOT A HABIT.
 * Casus 2 is the only place that can settle it, because its model KNOWS R_e:
 * on all three ways the leak arm returns the input to seven or eight digits
 * (6.185 / 5.400 / 4.100 against 6.2 / 5.4 / 4.1) and the bare arm misses it
 * by 0.08 to 0.23 Ω — an order more than the 0.03 Ω that casus allows R_e. A
 * rule that ever dropped the term on a driver-like sweep would be wrong, so
 * there is no such rule. What there is instead is the COMPARISON, published,
 * with the bare arm standing beside the value as the counterfactual.
 *
 * AND THE CHOICE COULD NOT BE MADE FROM ONE SWEEP ANYWAY — measured, not
 * assumed. Two criteria were tried on a synthetic sweep carrying a small coil
 * AND a resonance under the classification bar, so that the fit is never
 * seeded with it. Both failed the same way: the leak term ABSORBS whatever the
 * branches cannot explain. A coil contributing 0.10 % of |Z| at the top of the
 * fit band was fitted at 8.95 % — ninety-three times too big — and the
 * residual ratio it bought (1.434) reads as the term earning its parameters
 * when it was in fact standing in for a mode. Term size and residual are
 * evidence of MISSING STRUCTURE, not evidence of a coil, and neither can carry
 * the choice.
 *
 * WHAT THE SWEEP CAN DECIDE IS NARROWER, AND IT IS EXACTLY WHAT B2 ASKED FOR:
 * whether the term's EXPONENT is a measurement or a nuisance. This fit already
 * refits on comparison bands to ask whether R_e depends on the band; the same
 * question asked of `n`, at no extra cost, separates cleanly — and where a
 * ground truth exists it agrees:
 *
 *   casus 2 mid / tweeter    n moves 0.0 % across the bands    n exact
 *   casus 2 woofer           n moves 8.9 %                     n 15 % off
 *   casus 1, all three ways  n moves 12.6 – 34.4 %             no ground truth
 *
 * So `exponentN` and `coefficientK` are published ONLY when the exponent
 * survives that test, against the SAME limit this fit already publishes for
 * R_e. Otherwise they are null — never a number, never a zero — and the fit
 * states by how much the band moved it. Nothing downstream reads them; what
 * changes is that a recorded reference can no longer be a measurement of a
 * coil the fit was unable to identify.
 */

import {
  PERCENT,
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

/**
 * B-1 — which impedance model this fit ran on.
 *
 *   `second-order`           R_e plus the resonance branches, nothing else.
 *   `second-order-plus-leak` the same, plus the half-power leak term K·(jω)^n.
 */
export type MotionalModel = 'second-order' | 'second-order-plus-leak';

/** What one of the two candidate models produced on this sweep. */
export interface MotionalModelArm {
  model: MotionalModel;
  /** R_e the model carries at DC, ohms. */
  reOhm: number;
  /** RMS of |model − Z| / |Z| over the fit band. */
  relativeResidual: number;
  /**
   * The leak term's own size at the TOP of the fit band, as a fraction of |Z|
   * there — where it is largest, so this is the most generous reading of it.
   * Zero under `second-order`, which has no such term.
   */
  leakFractionAtBandTop: number;
  /** Leak coefficient and exponent; null under `second-order`. */
  coefficientK: number | null;
  exponentN: number | null;
  branches: MotionalBranch[];
}

/**
 * B-1 — is the leak exponent a measurement, or a nuisance parameter?
 *
 * Answered the way this fit already answers it for R_e: refit on the
 * comparison bands and see whether the number depends on which band it was
 * asked on. Same limit, same shape, no new constant, and no extra fitting —
 * those refits already run for the band-sensitivity of R_e.
 */
export interface ExponentIdentification {
  /** What the primary band produced, whatever the verdict. Never hidden. */
  onPrimaryBand: number;
  coefficientOnPrimaryBand: number;
  /** Half the spread of the exponent across the comparison bands. */
  bandSpread: number;
  /** That spread as a fraction of the primary band's value. */
  bandSpreadFraction: number;
  /** What each comparison band produced. */
  samples: { multiple: number; topHz: number; exponentN: number }[];
  /** True when the spread is inside the limit this fit publishes for R_e. */
  identified: boolean;
  reason: string;
}

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
  /**
   * B-1 — the leak coefficient, published ONLY when the exponent survived the
   * band test. NULL — never 0 — otherwise: zero would read as "fitted, and it
   * came out zero" (F0), and the value is a nuisance parameter, not a coil.
   */
  coefficientK: number | null;
  /**
   * B-1 — the leak exponent, on the same condition and for the same reason.
   * Null means "this sweep cannot identify one", and `exponent.reason` says by
   * how much the fit band moved it.
   */
  exponentN: number | null;
  /** B-1 — the exponent's own band test, whatever the verdict. */
  exponent: ExponentIdentification;
  /** B-1 — the model the published values come from. Today always the leak model. */
  model: MotionalModel;
  /** B-1 — both arms, always, so the counterfactual is never invisible. */
  arms: { secondOrder: MotionalModelArm; plusLeak: MotionalModelArm };
  /**
   * B-1 — residual(second-order) / residual(plus-leak): what the extra term
   * bought, ≥ 1 by construction since the models are nested. REPORTED, never a
   * criterion — the header measures why it cannot be one.
   */
  residualRatio: number;
  /** B-1 — the sentence the report shows beside the two arms. */
  modelReason: string;
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
  /** Null under `second-order`: the model has no leak term at all. */
  k: number | null;
  n: number | null;
  branches: MotionalBranch[];
}

/**
 * Parameters ahead of the branches: R_e alone, or R_e with K and n.
 *
 * B-1 made this a function of the model instead of the constant 3 it was. The
 * branch block itself is unchanged, so `second-order-plus-leak` packs exactly
 * as it always did and reproduces the old fit bit for bit.
 */
const leadingParams = (model: MotionalModel): number =>
  model === 'second-order-plus-leak' ? 3 : 1;

function unpack(u: readonly number[], branchCount: number, model: MotionalModel): Unpacked {
  const re = Math.exp(clampParam(u[0]));
  const leak = model === 'second-order-plus-leak';
  const k = leak ? Math.exp(clampParam(u[1])) : null;
  const n = leak
    ? RE_FIT_N_MIN + (RE_FIT_N_MAX - RE_FIT_N_MIN) / (1 + Math.exp(-clampParam(u[2])))
    : null;
  const lead = leadingParams(model);
  const branches: MotionalBranch[] = [];
  for (let i = 0; i < branchCount; i++) {
    branches.push({
      rOhm: Math.exp(clampParam(u[lead + 3 * i])),
      fHz: Math.exp(clampParam(u[lead + 1 + 3 * i])),
      q: Math.exp(clampParam(u[lead + 2 + 3 * i])),
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

/** The leak term K·(jω)^n at one frequency. Zero when the model has none. */
export function leakImpedanceAt(
  k: number | null,
  n: number | null,
  fHz: number,
): { re: number; im: number; mag: number } {
  if (k === null || n === null) return { re: 0, im: 0, mag: 0 };
  const w = 2 * Math.PI * fHz;
  // K·(jω)^n = K·ω^n·(cos(nπ/2) + j sin(nπ/2))
  const mag = k * Math.pow(w, n);
  const ang = (n * Math.PI) / 2;
  return { re: mag * Math.cos(ang), im: mag * Math.sin(ang), mag };
}

function modelAt(p: Unpacked, fHz: number): { re: number; im: number } {
  const leak = leakImpedanceAt(p.k, p.n, fHz);
  const mot = motionalImpedanceAt(p.branches, fHz);
  return { re: p.re + leak.re + mot.re, im: leak.im + mot.im };
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
function residuals(
  u: readonly number[],
  branchCount: number,
  model: MotionalModel,
  data: readonly Sample[],
): number[] {
  const p = unpack(u, branchCount, model);
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
  model: MotionalModel,
  data: readonly Sample[],
): { u: number[]; cost: number } {
  let u = [...start];
  let r = residuals(u, branchCount, model, data);
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
      const rp = residuals(up, branchCount, model, data);
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
      const rc = residuals(candidate, branchCount, model, data);
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

/**
 * One fit of ONE model at one band top. Null when the band holds too little
 * data.
 *
 * `second-order-plus-leak` runs the same multi-start over K and n it always
 * did; `second-order` has neither parameter, so its start list collapses to
 * the single R_e start and the branch seeds — which is not a loss of
 * robustness but the absence of the local optimum the multi-start exists to
 * escape (that optimum is the exponent pinned to its bound).
 */
function fitAt(
  input: MotionalFitInput,
  topHz: number,
  model: MotionalModel,
): { p: Unpacked; residual: number; sampleCount: number; topSample: Sample | null } | null {
  const data = samplesUpTo(input, topHz);
  const seeds = input.seeds.filter((s) => s.fHz > 0 && s.fHz <= topHz);
  // Each branch costs three parameters; one or three more for R_e (and K, n).
  // Fewer samples than parameters is not an under-determined fit, it is not a
  // fit. The count is taken on the RICHER model so that both arms are refused
  // together: a band that can only carry one of them cannot compare them.
  const params = 3 + 3 * seeds.length;
  if (seeds.length === 0 || data.length * 2 < params * 2) return null;

  const seedTail: number[] = [];
  for (const s of seeds) {
    const height = Math.max(s.ohm - input.startReOhm, input.startReOhm * 0.05);
    seedTail.push(Math.log(height), Math.log(s.fHz), Math.log(s.q && s.q > 0 ? s.q : RE_FIT_FALLBACK_SEED_Q));
  }
  const reStart = Math.log(input.startReOhm * 0.9);

  let best: { u: number[]; cost: number } | null = null;
  if (model === 'second-order-plus-leak') {
    for (const n0 of RE_FIT_EXPONENT_STARTS) {
      for (const k0 of RE_FIT_COEFFICIENT_STARTS) {
        const start = [reStart, Math.log(k0), packExponent(n0), ...seedTail];
        const got = levenbergMarquardt(start, seeds.length, model, data);
        // Strictly better, so the EARLIER start wins a tie: the list is ordered
        // and the order is part of what makes this reproducible.
        if (best === null || got.cost < best.cost) best = got;
      }
    }
  } else {
    best = levenbergMarquardt([reStart, ...seedTail], seeds.length, model, data);
  }
  if (!best) return null;
  return {
    p: unpack(best.u, seeds.length, model),
    residual: Math.sqrt(best.cost / (2 * data.length)),
    sampleCount: data.length,
    topSample: data.length ? data[data.length - 1] : null,
  };
}

/** One arm's reportable summary, including the leak term's own relative size. */
function armOf(
  model: MotionalModel,
  got: { p: Unpacked; residual: number; topSample: Sample | null },
): MotionalModelArm {
  const top = got.topSample;
  const leak = top ? leakImpedanceAt(got.p.k, got.p.n, top.fHz) : { mag: 0 };
  return {
    model,
    reOhm: got.p.re,
    relativeResidual: got.residual,
    leakFractionAtBandTop: top && top.mag > 0 ? leak.mag / top.mag : 0,
    coefficientK: got.p.k,
    exponentN: got.p.n,
    branches: got.p.branches,
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

  /* B-1 — BOTH MODELS, EVERY TIME. The comparison is the deliverable; running
   * only the chosen one would leave the other invisible exactly where a reader
   * needs it. */
  const withLeak = fitAt(input, topHz, 'second-order-plus-leak');
  const bare = fitAt(input, topHz, 'second-order');
  if (!withLeak || !bare) return null;

  const armLeak = armOf('second-order-plus-leak', withLeak);
  const armBare = armOf('second-order', bare);
  const arms = { secondOrder: armBare, plusLeak: armLeak };

  /* The residual ratio is what the extra term BOUGHT. It is ≥ 1 by
   * construction — (b) nests (a) — and the header measures why that makes it
   * unusable as a criterion: on a sweep carrying an unmodelled mode the term
   * absorbs the mode and buys a ratio of 1.434 while fitting a coil
   * ninety-three times too big. Reported, never decisive. */
  const residualRatio =
    armLeak.relativeResidual > 0 ? armBare.relativeResidual / armLeak.relativeResidual : 1;

  /* THE TERM IS KEPT. Casus 2 is the only sweep set that can judge it, and on
   * all three ways the leak arm returns the model's own R_e while the bare arm
   * misses it by an order more than that casus allows R_e to move. */
  const chosenModel: MotionalModel = 'second-order-plus-leak';
  const chosen = armLeak;
  const pct = (v: number): string => (v * PERCENT).toFixed(2);
  const modelReason =
    `second order plus the half-power leak term. Dropping it multiplies the relative RMS ` +
    `residual by ${residualRatio.toFixed(3)} (${pct(armBare.relativeResidual)} % against ` +
    `${pct(armLeak.relativeResidual)} %) and moves R_e to ${armBare.reOhm.toFixed(3)} Ω from ` +
    `${armLeak.reOhm.toFixed(3)} Ω. Both arms are reported; the bare one is the counterfactual, ` +
    `not an alternative — see the model note at the top of motionalFit.ts.`;

  const primary = { p: chosen, residual: chosen.relativeResidual };

  const samples: MotionalReFit['bandSensitivitySamples'] = [];
  const exponentSamples: ExponentIdentification['samples'] = [];
  for (const m of RE_FIT_SENSITIVITY_BAND_MULTIPLES) {
    const alt = fitAt(input, input.fundamentalHz * m, chosenModel);
    if (!alt) continue;
    samples.push({ multiple: m, topHz: input.fundamentalHz * m, reOhm: alt.p.re });
    /* B-1 — the same refits, asked the second question. No extra solve. */
    if (alt.p.n !== null) {
      exponentSamples.push({ multiple: m, topHz: input.fundamentalHz * m, exponentN: alt.p.n });
    }
  }
  const values = [primary.p.reOhm, ...samples.map((s) => s.reOhm)];
  const sensitivity = (Math.max(...values) - Math.min(...values)) / 2;

  const maxResidual = input.maxRelativeResidual ?? RE_FIT_MAX_RELATIVE_RESIDUAL;
  const maxSensitivity = input.maxBandSensitivityFraction ?? RE_FIT_MAX_BAND_SENSITIVITY_FRACTION;
  const sensitivityFraction = sensitivity / primary.p.reOhm;

  let refusal: string | null = null;
  if (!(primary.p.reOhm > 0) || !Number.isFinite(primary.p.reOhm)) {
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

  /* ---- B-1: is the exponent a measurement? ------------------------- *
   * The comparison bands above already asked whether R_e depends on the band.
   * They answer the same question about `n` for free, and the ground truth
   * agrees with the answer: on casus 2's two sealed ways `n` does not move
   * across the bands and is exact; on its vented way it moves 8.9 % and is
   * 15 % off. So the same limit decides both, and where it says no, the fit
   * abstains instead of publishing a coin toss (B2). */
  const nPrimary = primary.p.exponentN;
  const kPrimary = primary.p.coefficientK;
  const nValues = nPrimary === null ? [] : [nPrimary, ...exponentSamples.map((e) => e.exponentN)];
  const nSpread = nValues.length > 1 ? (Math.max(...nValues) - Math.min(...nValues)) / 2 : 0;
  const nSpreadFraction = nPrimary !== null && nPrimary !== 0 ? nSpread / Math.abs(nPrimary) : 0;
  /* One band is not a comparison. A single sample cannot show a dependence, so
   * it cannot establish the absence of one either (V23). */
  const nIdentified = exponentSamples.length > 0 && nSpreadFraction <= maxSensitivity;
  const exponent: ExponentIdentification = {
    onPrimaryBand: nPrimary ?? NaN,
    coefficientOnPrimaryBand: kPrimary ?? NaN,
    bandSpread: nSpread,
    bandSpreadFraction: nSpreadFraction,
    samples: exponentSamples,
    identified: nIdentified,
    reason:
      exponentSamples.length === 0
        ? 'no comparison band could be fitted, so nothing can be said about whether the exponent ' +
          'depends on the band — and an untested exponent is not a measurement'
        : nIdentified
          ? `the exponent moves ±${nSpread.toFixed(4)} (${pct(nSpreadFraction)} %) across the ` +
            `comparison bands, inside the ${pct(maxSensitivity)} % this fit allows R_e, so it is ` +
            'a property of the sweep rather than of the band it was asked on'
          : `the exponent moves ±${nSpread.toFixed(4)} (${pct(nSpreadFraction)} %) across the ` +
            `comparison bands against a limit of ${pct(maxSensitivity)} % — it is a NUISANCE ` +
            'parameter carrying whatever the branches leave behind, not a measurement of the ' +
            `voice coil. Values on the bands fitted: ` +
            `${exponentSamples.map((e) => `${e.multiple}x ${e.exponentN.toFixed(4)}`).join(', ')}` +
            `, primary ${(nPrimary ?? NaN).toFixed(4)}.`,
  };

  const skirt = motionalImpedanceAt(primary.p.branches, input.freq[0]).re;

  return {
    reOhm: primary.p.reOhm,
    coefficientK: nIdentified ? kPrimary : null,
    exponentN: nIdentified ? nPrimary : null,
    exponent,
    model: chosenModel,
    arms,
    residualRatio,
    modelReason,
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
