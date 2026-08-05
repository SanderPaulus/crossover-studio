import { describe, it, expect } from 'vitest';
import { lbfgs } from './lbfgs.ts';
import { nelderMead } from './optimize.ts';
import { solveWithSensitivities, dbPhaseGradient } from './adjoint.ts';
import { solveNetwork, type Netlist } from './network.ts';
import { cplx, abs, type Complex } from './complex.ts';

describe('lbfgs', () => {
  it('solves an ill-conditioned quadratic in a handful of iterations', () => {
    // Condition number 1e4 — the case where steepest descent zig-zags and a
    // simplex crawls, and where curvature memory is supposed to pay.
    const a = [1, 100, 10000, 1];
    const r = lbfgs(
      (x) => ({
        fx: x.reduce((s, v, i) => s + a[i] * v * v, 0),
        grad: x.map((v, i) => 2 * a[i] * v),
      }),
      [1, 1, 1, 1],
      { maxStep: 1 },
    );
    expect(r.fx).toBeLessThan(1e-12);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThan(40);
  });

  it('reaches Rosenbrock\'s valley floor far cheaper than Nelder-Mead', () => {
    const N = 10;
    const f = (x: readonly number[]): number => {
      let s = 0;
      for (let i = 0; i < N - 1; i++) s += 100 * (x[i + 1] - x[i] * x[i]) ** 2 + (1 - x[i]) ** 2;
      return s;
    };
    const fg = (x: readonly number[]) => {
      const grad = new Array<number>(N).fill(0);
      for (let i = 0; i < N - 1; i++) {
        const t = x[i + 1] - x[i] * x[i];
        grad[i] += -400 * x[i] * t - 2 * (1 - x[i]);
        grad[i + 1] += 200 * t;
      }
      return { fx: f(x), grad };
    };
    const x0 = new Array<number>(N).fill(-1.2);

    const g = lbfgs(fg, x0, { maxIterations: 500, maxStep: 0.5 });
    let nmEvals = 0;
    const nm = nelderMead((x) => {
      nmEvals++;
      return f(x);
    }, x0, { maxIterations: 5000 });

    expect(g.fx).toBeLessThan(1e-8);
    // The point of the exercise: same objective, far fewer evaluations.
    expect(g.evaluations).toBeLessThan(nmEvals / 4);
    expect(g.fx).toBeLessThan(nm.fx);
  });

  it('survives a kink (piecewise-smooth guard terms)', () => {
    // max(0, x)² is C1; the sum below still has a curvature break at x=0,
    // which is exactly the shape of every buildability guard in this project.
    const r = lbfgs(
      (x) => ({
        fx: (x[0] - 2) ** 2 + 5 * Math.max(0, x[0] - 1) ** 2,
        grad: [2 * (x[0] - 2) + 10 * Math.max(0, x[0] - 1)],
      }),
      [4],
    );
    expect(r.x[0]).toBeCloseTo(7 / 6, 6); // analytic minimum
  });

  it('is deterministic', () => {
    const fg = (x: readonly number[]) => ({
      fx: (x[0] - 0.3) ** 2 + (x[1] + 1.7) ** 4,
      grad: [2 * (x[0] - 0.3), 4 * (x[1] + 1.7) ** 3],
    });
    const a = lbfgs(fg, [3, 3]);
    const b = lbfgs(fg, [3, 3]);
    expect(a).toEqual(b);
  });

  it('stops cleanly when started at the minimum', () => {
    const r = lbfgs((x) => ({ fx: x[0] * x[0], grad: [2 * x[0]] }), [0]);
    expect(r.iterations).toBe(0);
    expect(r.converged).toBe(true);
    expect(r.evaluations).toBe(1);
  });
});

/**
 * The design decision behind synthesis.ts' value fit, pinned on the real thing:
 * a filter branch on a resonant load. A single gradient descent commits to its
 * starting basin, so the recipe scatters starts and keeps the best — and the
 * claim that pays for the swap is "never worse than the simplex, at a fraction
 * of the cost". If a future change breaks either half, this test says so.
 */
describe('gradient scatter vs simplex on an MNA branch fit', () => {
  const freq = Array.from({ length: 48 }, (_, i) => 200 * (19000 / 200) ** (i / 47));
  const driverZ: Complex[] = freq.map((f) => {
    const x = f / 700 - 700 / f;
    const peak = 22 / (1 + (2.2 * x) ** 2);
    return cplx(6.5 + peak, 6.5 * 0.3 * (f / 3000) - (peak * 2.2 * x) / (1 + (2.2 * x) ** 2));
  });
  // 2nd-order high-pass ladder + a series-RLC notch across the driver.
  const SLOTS = ['C1', 'L1', 'L2', 'C2', 'R1'] as const;
  const build = (v: readonly number[]): Netlist => ({
    nodeCount: 5,
    elements: [
      { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
      { kind: 'C', id: 'C1', nodes: [1, 2], value: v[0] },
      { kind: 'L', id: 'L1', nodes: [2, 0], value: v[1] },
      { kind: 'L', id: 'L2', nodes: [2, 3], value: v[2] },
      { kind: 'C', id: 'C2', nodes: [3, 4], value: v[3] },
      { kind: 'R', id: 'R1', nodes: [4, 0], value: v[4] },
      { kind: 'driver', id: 'D', model: 'd', nodes: [2, 0], inverted: false },
    ],
  });
  // Target: a plain 2nd-order Butterworth high-pass at 2.5 kHz, magnitude only.
  const targetDb = freq.map((f) => {
    const w = f / 2500;
    return 20 * Math.log10((w * w) / Math.hypot(1 - w * w, Math.SQRT2 * w));
  });

  const dbOf = (c: Complex) => 20 * Math.log10(abs(c) || 1e-9);
  const seed = [Math.log10(8e-6), Math.log10(0.5e-3), Math.log10(0.3e-3), Math.log10(3e-6), Math.log10(4)];

  let calls = 0;
  const f = (x: readonly number[]): number => {
    calls++;
    const h = solveNetwork(build(x.map((v) => 10 ** v)), freq, { d: driverZ }).transfers['D'];
    return h.reduce((a, c, i) => a + (dbOf(c) - targetDb[i]) ** 2, 0) / freq.length;
  };
  const fg = (x: readonly number[]) => {
    calls++;
    const s = solveWithSensitivities(build(x.map((v) => 10 ** v)), freq, { d: driverZ }, [...SLOTS]);
    const h = s.transfers['D'];
    const grad = new Array<number>(SLOTS.length).fill(0);
    let fx = 0;
    for (let i = 0; i < freq.length; i++) {
      const e = dbOf(h[i]) - targetDb[i];
      fx += e * e;
      for (let k = 0; k < SLOTS.length; k++) {
        grad[k] += 2 * e * dbPhaseGradient(h[i], s.dTransfers['D'][k][i]).dDb;
      }
    }
    return { fx: fx / freq.length, grad: grad.map((g) => g / freq.length) };
  };

  it('lands at least as low as the full simplex recipe, far cheaper', () => {
    calls = 0;
    let nm = nelderMead(f, seed, { maxIterations: 900, tolerance: 1e-6, step: 0.12 });
    for (const step of [0.3, 0.12]) {
      const again = nelderMead(f, [...nm.x], { maxIterations: 900, tolerance: 1e-6, step });
      if (again.fx < nm.fx) nm = again;
    }
    const nmCalls = calls;

    calls = 0;
    let g = lbfgs(fg, seed, { maxIterations: 400, maxStep: 0.4, tolerance: 1e-10 });
    for (const [amp, phase] of [
      [0.3, 0],
      [0.3, 1.6],
      [0.75, 0.8],
      [0.75, 2.4],
    ] as const) {
      const again = lbfgs(fg, seed.map((v, i) => v + amp * Math.cos(i * 1.1 + phase)), {
        maxIterations: 400,
        maxStep: 0.4,
        tolerance: 1e-10,
      });
      if (again.fx < g.fx) g = again;
    }
    const gCalls = calls;

    expect(g.fx).toBeLessThanOrEqual(nm.fx * 1.001);
    // Cheaper even here, where the simplex is at its best — 5 dimensions, and
    // the scatter pays for five full descents. The MARGIN is what scales: on
    // the real KOAN branches (8–20 dims) the same comparison measured 3.4×
    // less wall clock, and single-start L-BFGS 32–59× fewer solves.
    expect(gCalls).toBeLessThan(nmCalls);
  });

  it('is deterministic on the same branch', () => {
    const a = lbfgs(fg, seed, { maxIterations: 400, maxStep: 0.4, tolerance: 1e-10 });
    const b = lbfgs(fg, seed, { maxIterations: 400, maxStep: 0.4, tolerance: 1e-10 });
    expect(a.x).toEqual(b.x);
    expect(a.fx).toBe(b.fx);
  });
});
