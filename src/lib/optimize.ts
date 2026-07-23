/**
 * Nelder-Mead simplex minimiser — compact, derivative-free. Used by the
 * passive-filter synthesis to fit component values (in log-space) so the
 * MNA-solved response matches a target transfer.
 */

export interface NelderMeadOptions {
  maxIterations?: number;
  /** Stop when the simplex' function-value spread drops below this. */
  tolerance?: number;
  /** Initial simplex step per dimension (relative to x0's scale). */
  step?: number;
}

export interface NelderMeadResult {
  x: number[];
  fx: number;
  iterations: number;
  converged: boolean;
}

export function nelderMead(
  f: (x: readonly number[]) => number,
  x0: readonly number[],
  opts: NelderMeadOptions = {},
): NelderMeadResult {
  const { maxIterations = 800, tolerance = 1e-7, step = 0.15 } = opts;
  const n = x0.length;

  // Standard coefficients.
  const ALPHA = 1; // reflect
  const GAMMA = 2; // expand
  const RHO = 0.5; // contract
  const SIGMA = 0.5; // shrink

  interface Vertex {
    x: number[];
    fx: number;
  }
  const mk = (x: number[]): Vertex => ({ x, fx: f(x) });

  const simplex: Vertex[] = [mk([...x0])];
  for (let i = 0; i < n; i++) {
    const x = [...x0];
    x[i] += x[i] !== 0 ? step * Math.abs(x[i]) : step;
    simplex.push(mk(x));
  }

  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    simplex.sort((a, b) => a.fx - b.fx);
    if (Math.abs(simplex[n].fx - simplex[0].fx) < tolerance) break;

    // Centroid of all but worst.
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    }
    const worst = simplex[n];

    const lerp = (t: number): number[] => centroid.map((c, j) => c + t * (c - worst.x[j]));

    const reflected = mk(lerp(ALPHA));
    if (reflected.fx < simplex[0].fx) {
      const expanded = mk(lerp(GAMMA));
      simplex[n] = expanded.fx < reflected.fx ? expanded : reflected;
      continue;
    }
    if (reflected.fx < simplex[n - 1].fx) {
      simplex[n] = reflected;
      continue;
    }
    const contracted = mk(lerp(reflected.fx < worst.fx ? RHO : -RHO));
    if (contracted.fx < Math.min(reflected.fx, worst.fx)) {
      simplex[n] = contracted;
      continue;
    }
    // Shrink toward best.
    for (let i = 1; i <= n; i++) {
      simplex[i] = mk(simplex[i].x.map((v, j) => simplex[0].x[j] + SIGMA * (v - simplex[0].x[j])));
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  return {
    x: simplex[0].x,
    fx: simplex[0].fx,
    iterations,
    converged: iterations < maxIterations,
  };
}
