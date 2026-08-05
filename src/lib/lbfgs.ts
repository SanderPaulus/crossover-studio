/**
 * L-BFGS — limited-memory quasi-Newton minimiser with an Armijo backtracking
 * line search. The gradient-based counterpart to optimize.ts' Nelder-Mead.
 *
 * Why both exist: Nelder-Mead needs no derivatives, which is why it fits
 * everything here that has awkward terms (grid searches, wrapped phase). But
 * its simplex carries n+1 vertices and re-orients by reflection alone, so its
 * cost per unit of progress grows badly with dimension — the reason synthesis
 * and the 3-way tune both needed block-coordinate scaffolding. Where an exact
 * gradient IS available (see adjoint.ts), L-BFGS builds curvature information
 * from successive gradients and moves along it.
 *
 * Determinism: no RNG, no wall clock — same input, same output, like every
 * other solver in src/lib.
 *
 * Smoothness caveat: the objectives here are C1 at their `max(0,·)²` guards
 * (that function has a continuous derivative) but only piecewise smooth where
 * phase wraps. L-BFGS tolerates kinks — it just cannot exploit curvature
 * across one — so a wrap-heavy objective converges like plain gradient
 * descent rather than failing.
 */

export interface LbfgsOptions {
  maxIterations?: number;
  /** Stop when max|∂f/∂xᵢ| falls below this. */
  gradTolerance?: number;
  /** Stop when an accepted step improves f by less than this fraction. */
  tolerance?: number;
  /** Correction pairs retained (the "limited memory"). */
  memory?: number;
  /** Cap on the first trial displacement, in x units. Keeps the opening
   *  step of a steep objective from leaving the physical domain entirely. */
  maxStep?: number;
}

export interface LbfgsResult {
  x: number[];
  fx: number;
  iterations: number;
  /** Objective+gradient evaluations — the honest cost unit for comparisons. */
  evaluations: number;
  converged: boolean;
}

export function lbfgs(
  fg: (x: readonly number[]) => { fx: number; grad: readonly number[] },
  x0: readonly number[],
  opts: LbfgsOptions = {},
): LbfgsResult {
  const {
    maxIterations = 200,
    gradTolerance = 1e-8,
    tolerance = 1e-9,
    memory = 8,
    maxStep = 0.5,
  } = opts;
  const n = x0.length;

  let evaluations = 0;
  const evalAt = (x: readonly number[]) => {
    evaluations++;
    return fg(x);
  };

  let x = [...x0];
  let { fx, grad } = evalAt(x);
  let g = [...grad];

  const sHist: number[][] = [];
  const yHist: number[][] = [];
  const rhoHist: number[] = [];

  const dot = (a: readonly number[], b: readonly number[]): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  };
  const infNorm = (a: readonly number[]): number => {
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i]));
    return m;
  };

  const C1 = 1e-4; // Armijo sufficient-decrease constant
  let iterations = 0;
  let converged = false;

  for (; iterations < maxIterations; iterations++) {
    if (infNorm(g) < gradTolerance) {
      converged = true;
      break;
    }

    // Two-loop recursion: apply the implicit inverse-Hessian to −g.
    const q = g.map((v) => -v);
    const alpha = new Array<number>(sHist.length);
    for (let i = sHist.length - 1; i >= 0; i--) {
      alpha[i] = rhoHist[i] * dot(sHist[i], q);
      for (let j = 0; j < n; j++) q[j] -= alpha[i] * yHist[i][j];
    }
    // Initial Hessian scaling from the most recent pair (Nocedal's γ).
    if (sHist.length > 0) {
      const k = sHist.length - 1;
      const yy = dot(yHist[k], yHist[k]);
      const gamma = yy > 0 ? dot(sHist[k], yHist[k]) / yy : 1;
      for (let j = 0; j < n; j++) q[j] *= gamma;
    }
    for (let i = 0; i < sHist.length; i++) {
      const beta = rhoHist[i] * dot(yHist[i], q);
      for (let j = 0; j < n; j++) q[j] += sHist[i][j] * (alpha[i] - beta);
    }

    let dir = q;
    let slope = dot(g, dir);
    if (!(slope < 0)) {
      // Curvature memory went stale (a kink, or a non-descent direction from
      // an indefinite region): fall back to steepest descent this step.
      dir = g.map((v) => -v);
      slope = dot(g, dir);
      sHist.length = yHist.length = rhoHist.length = 0;
      if (!(slope < 0)) {
        converged = true;
        break;
      }
    }

    // Cap the opening displacement; later steps trust the quasi-Newton scale.
    let t = 1;
    const dirNorm = infNorm(dir);
    if (sHist.length === 0 && dirNorm * t > maxStep) t = maxStep / dirNorm;

    let ok = false;
    let xNew = x;
    let fNew = fx;
    let gNew = g;
    for (let bt = 0; bt < 40; bt++) {
      const cand = x.map((v, i) => v + t * dir[i]);
      const r = evalAt(cand);
      if (Number.isFinite(r.fx) && r.fx <= fx + C1 * t * slope) {
        xNew = cand;
        fNew = r.fx;
        gNew = [...r.grad];
        ok = true;
        break;
      }
      t *= 0.5;
    }
    if (!ok) {
      converged = true; // line search exhausted — we are at (or on) a minimum
      break;
    }

    const s = xNew.map((v, i) => v - x[i]);
    const y = gNew.map((v, i) => v - g[i]);
    const sy = dot(s, y);
    // Curvature safeguard: a pair with sᵀy ≤ 0 would make the approximation
    // indefinite. Skipping it is standard and strictly better than resetting.
    if (sy > 1e-12 * Math.sqrt(dot(s, s) * dot(y, y))) {
      sHist.push(s);
      yHist.push(y);
      rhoHist.push(1 / sy);
      if (sHist.length > memory) {
        sHist.shift();
        yHist.shift();
        rhoHist.shift();
      }
    }

    const improved = fx - fNew;
    x = xNew;
    fx = fNew;
    g = gNew;
    if (improved < tolerance * Math.max(1, Math.abs(fx))) {
      converged = true;
      break;
    }
  }

  return { x, fx, iterations, evaluations, converged };
}
