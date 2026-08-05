import type { Complex } from './complex.ts';
import { cplx, add, sub, mul, div, inv, scale } from './complex.ts';
import {
  NetworkError,
  type DriverElement,
  type DriverImpedances,
  type Netlist,
  type SourceElement,
} from './network.ts';

/**
 * Analytic sensitivities of the network transfer functions to component values
 * — the ADJOINT method from circuit simulation.
 *
 * Why this exists: every value optimiser in this project (synthesis, netTune,
 * solo) is derivative-FREE (Nelder-Mead), which is why they all needed
 * scaffolding to cope with dimensionality — restarts, block-coordinate
 * refinement, polish rounds ("past ~10 dims one simplex crawls"). A 3-way
 * network carries 16–25 free values. With exact gradients a quasi-Newton
 * method uses that structure directly instead of feeling its way around it.
 *
 * The maths. Nodal analysis solves G(ω,p)·v = I. Differentiating to a
 * component value p_k (which appears ONLY in G) gives
 *
 *     ∂v/∂p_k = −G⁻¹ (∂G/∂p_k) v
 *
 * so for an output selector e (the driver's node pair, v_a − v_b):
 *
 *     ∂(eᵀv)/∂p_k = −λᵀ (∂G/∂p_k) v ,   with  Gᵀλ = e.
 *
 * Because a passive network is RECIPROCAL, G is symmetric — Gᵀ = G — so the
 * adjoint λ comes from the SAME factorisation as v. And a two-terminal
 * element's stamp is one admittance times a fixed incidence pattern, which
 * collapses the matrix product to a scalar:
 *
 *     ∂H/∂p_k = −(dy_k/dp_k)·(λ_a − λ_b)·(v_a − v_b) / Eg
 *
 * Cost: ONE extra solve per driver output per frequency (reusing the LU), plus
 * O(1) per component. Finite differences would cost one full re-solve per
 * component — with 20 slots that is a 20× difference on every gradient.
 *
 * Derivatives are returned in LOG10 space (dH/d log10 p = p·ln10·dH/dp), which
 * is the space every fit in this codebase already optimises in.
 */

export interface SensitivityResult {
  /** Same content and convention as solveNetwork's transfers (inversion applied). */
  transfers: Record<string, Complex[]>;
  /**
   * dTransfers[driverId][slotIndex][freqIndex] = ∂H/∂(log10 value) of the slot's
   * component. Slot order follows the `slotIds` argument.
   */
  dTransfers: Record<string, Complex[][]>;
  drivers: DriverElement[];
}

/**
 * Admittance of a two-terminal passive element, and its d/dvalue.
 *
 * `dRsdp` is the derivative of the element's series parasitic to its own
 * value, for the case where they are COUPLED — modelled coil DCR is a function
 * of inductance, and the catalog-snap fit uses exactly that. Zero (the
 * default) means a fixed parasitic, which is what a real part has.
 */
function admittance(
  kind: 'R' | 'L' | 'C',
  value: number,
  seriesR: number,
  w: number,
  dRsdp = 0,
): { y: Complex; dydp: Complex } {
  // Every element is y = 1/z, so dy/dp = −y²·dz/dp.
  let z: Complex;
  let dzdp: Complex;
  switch (kind) {
    case 'R':
      z = cplx(value);
      dzdp = cplx(1);
      break;
    case 'L':
      z = cplx(seriesR, w * value);
      dzdp = cplx(dRsdp, w);
      break;
    case 'C':
      z = cplx(seriesR, -1 / (w * value));
      dzdp = cplx(dRsdp, 1 / (w * value * value));
      break;
  }
  const y = inv(z);
  return { y, dydp: scale(mul(mul(y, y), dzdp), -1) };
}

export interface SensitivityOptions {
  /**
   * Per slot, d(seriesR)/d(value) — only for fits where the parasitic is
   * MODELLED from the value (coil DCR ≈ 0.29·(L/mH)^0.65). Omit for real
   * parts, whose DCR/ESR is whatever the datasheet says.
   */
  dSeriesRdValue?: readonly (number | undefined)[];
}

/**
 * Solve the network AND the sensitivity of every driver transfer to the value
 * of each element named in `slotIds`.
 */
export function solveWithSensitivities(
  netlist: Netlist,
  freq: readonly number[],
  driverZ: DriverImpedances,
  slotIds: readonly string[],
  opts: SensitivityOptions = {},
): SensitivityResult {
  const n = netlist.nodeCount - 1;
  if (n < 1) throw new NetworkError('Network has no non-ground nodes.');

  const drivers = netlist.elements.filter((e): e is DriverElement => e.kind === 'driver');
  const sources = netlist.elements.filter((e): e is SourceElement => e.kind === 'source');
  if (sources.length === 0) throw new NetworkError('Network has no generator.');
  for (const d of drivers) {
    if (!driverZ[d.model]) {
      throw new NetworkError(`No measured impedance provided for driver model "${d.model}".`);
    }
  }

  const slotOf = new Map<string, number>();
  slotIds.forEach((id, i) => slotOf.set(id, i));
  const slotEls = new Array<{
    kind: 'R' | 'L' | 'C';
    value: number;
    seriesR: number;
    nodes: [number, number];
  } | null>(slotIds.length).fill(null);
  for (const e of netlist.elements) {
    if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
    const i = slotOf.get(e.id);
    if (i === undefined) continue;
    slotEls[i] = { kind: e.kind, value: e.value, seriesR: e.seriesR ?? 0, nodes: e.nodes };
  }
  slotEls.forEach((s, i) => {
    if (!s) throw new NetworkError(`No R/L/C element with id "${slotIds[i]}" in the network.`);
  });

  const transfers: Record<string, Complex[]> = {};
  const dTransfers: Record<string, Complex[][]> = {};
  for (const d of drivers) {
    transfers[d.id] = new Array<Complex>(freq.length);
    dTransfers[d.id] = Array.from({ length: slotIds.length }, () => new Array<Complex>(freq.length));
  }

  const LN10 = Math.LN10;
  const eg = sources[0].volts;

  for (let k = 0; k < freq.length; k++) {
    const w = 2 * Math.PI * freq[k];

    const G: Complex[][] = Array.from({ length: n }, () => new Array<Complex>(n));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) G[r][c] = cplx(r === c ? G_LEAK : 0);
    }
    const I: Complex[] = Array.from({ length: n }, () => cplx(0));

    const stamp = (a: number, b: number, y: Complex) => {
      if (a > 0) G[a - 1][a - 1] = add(G[a - 1][a - 1], y);
      if (b > 0) G[b - 1][b - 1] = add(G[b - 1][b - 1], y);
      if (a > 0 && b > 0) {
        G[a - 1][b - 1] = sub(G[a - 1][b - 1], y);
        G[b - 1][a - 1] = sub(G[b - 1][a - 1], y);
      }
    };

    for (const e of netlist.elements) {
      const [a, b] = e.nodes;
      switch (e.kind) {
        case 'R':
        case 'L':
        case 'C':
          stamp(a, b, admittance(e.kind, e.value, e.seriesR ?? 0, w).y);
          break;
        case 'driver':
          stamp(a, b, inv(driverZ[e.model][k]));
          break;
        case 'source': {
          const g = 1 / e.seriesR;
          stamp(a, b, cplx(g));
          const iNorton = e.volts * g;
          if (a > 0) I[a - 1] = add(I[a - 1], cplx(iNorton));
          if (b > 0) I[b - 1] = sub(I[b - 1], cplx(iNorton));
          break;
        }
      }
    }

    // One factorisation serves the state solve and every adjoint solve.
    const lu = luFactor(G);
    const v = luSolve(lu, I);
    const at = (x: readonly Complex[], idx: number): Complex => (idx === 0 ? cplx(0) : x[idx - 1]);

    // Node-pair drops of the differentiated elements, shared by all outputs.
    const dv = slotEls.map((s) => sub(at(v, s!.nodes[0]), at(v, s!.nodes[1])));

    for (const d of drivers) {
      const sign = d.inverted ? -1 : 1;
      transfers[d.id][k] = scale(div(sub(at(v, d.nodes[0]), at(v, d.nodes[1])), cplx(eg)), sign);

      // Adjoint RHS: the output selector (+1 / −1 on the driver's nodes).
      const e = new Array<Complex>(n);
      for (let r = 0; r < n; r++) e[r] = cplx(0);
      if (d.nodes[0] > 0) e[d.nodes[0] - 1] = cplx(1);
      if (d.nodes[1] > 0) e[d.nodes[1] - 1] = sub(e[d.nodes[1] - 1], cplx(1));
      const lam = luSolve(lu, e);

      for (let i = 0; i < slotEls.length; i++) {
        const s = slotEls[i]!;
        const { dydp } = admittance(s.kind, s.value, s.seriesR, w, opts.dSeriesRdValue?.[i] ?? 0);
        const dl = sub(at(lam, s.nodes[0]), at(lam, s.nodes[1]));
        // ∂H/∂p = −(dy/dp)(λa−λb)(va−vb)/Eg, then to log10 space (×p·ln10).
        const dHdp = scale(mul(mul(dydp, dl), dv[i]), -sign / eg);
        dTransfers[d.id][i][k] = scale(dHdp, s.value * LN10);
      }
    }
  }

  return { transfers, dTransfers, drivers };
}

/** Mirrors network.ts — a floating node must regularise, not go singular. */
const G_LEAK = 1e-12;

interface LU {
  a: Complex[][];
  piv: number[];
}

/**
 * LU with partial pivoting, factors RETAINED so extra right-hand sides (the
 * adjoints) cost O(n²) instead of another O(n³) elimination. network.ts keeps
 * its own single-shot solver on purpose: it is the production path and the
 * anchor lesson says not to perturb what is not broken.
 */
function luFactor(A: Complex[][]): LU {
  const n = A.length;
  const piv = Array.from({ length: n }, (_, i) => i);
  for (let col = 0; col < n; col++) {
    let p = col;
    let best = Math.hypot(A[col][col].re, A[col][col].im);
    for (let r = col + 1; r < n; r++) {
      const m = Math.hypot(A[r][col].re, A[r][col].im);
      if (m > best) {
        best = m;
        p = r;
      }
    }
    if (best === 0) throw new NetworkError('Singular network matrix (floating subcircuit?).');
    if (p !== col) {
      [A[col], A[p]] = [A[p], A[col]];
      [piv[col], piv[p]] = [piv[p], piv[col]];
    }
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = div(A[r][col], d);
      A[r][col] = f; // keep the multiplier: this is L
      if (f.re === 0 && f.im === 0) continue;
      for (let c = col + 1; c < n; c++) A[r][c] = sub(A[r][c], mul(f, A[col][c]));
    }
  }
  return { a: A, piv };
}

function luSolve(lu: LU, b: readonly Complex[]): Complex[] {
  const { a, piv } = lu;
  const n = a.length;
  const y = new Array<Complex>(n);
  for (let r = 0; r < n; r++) {
    let acc = b[piv[r]];
    for (let c = 0; c < r; c++) acc = sub(acc, mul(a[r][c], y[c]));
    y[r] = acc;
  }
  const x = new Array<Complex>(n);
  for (let r = n - 1; r >= 0; r--) {
    let acc = y[r];
    for (let c = r + 1; c < n; c++) acc = sub(acc, mul(a[r][c], x[c]));
    x[r] = div(acc, a[r][r]);
  }
  return x;
}

/**
 * Chain rule from a complex transfer to the two quantities every objective in
 * this project is written in: magnitude in dB and phase in degrees.
 *
 *   ∂(20·log10|H|)/∂θ = (20/ln10)·Re(H̄·∂H/∂θ)/|H|²
 *   ∂(arg H)/∂θ       =            Im(H̄·∂H/∂θ)/|H|²
 *
 * Phase is returned in DEGREES to match the objectives; both are undefined at
 * |H| = 0, where a vanishing branch has no meaningful phase anyway.
 */
export function dbPhaseGradient(h: Complex, dh: Complex): { dDb: number; dDeg: number } {
  const m2 = h.re * h.re + h.im * h.im;
  if (m2 === 0) return { dDb: 0, dDeg: 0 };
  const re = h.re * dh.re + h.im * dh.im; // Re(conj(h)·dh)
  const im = h.re * dh.im - h.im * dh.re; // Im(conj(h)·dh)
  return { dDb: (20 / Math.LN10) * (re / m2), dDeg: ((im / m2) * 180) / Math.PI };
}
