import type { Complex } from './complex.ts';
import { cplx, add, sub, div, inv, scale } from './complex.ts';

/**
 * MNA (nodal analysis) solver for passive crossover networks.
 *
 * Formulation: pure nodal analysis on the complex admittance matrix. The
 * generator (Eg + series Rg) is folded into its Norton equivalent (current
 * source Eg/Rg with shunt conductance 1/Rg), so no branch-current unknowns are
 * needed — every element is an admittance stamp. Node 0 is ground and is
 * eliminated from the matrix.
 *
 * The driver load is the MEASURED complex impedance (interpolated per grid
 * frequency), never a nominal resistor — this is the whole point: a passive
 * filter's response depends on the load's impedance curve, including the
 * resonance peak and voice-coil inductance rise.
 */

export interface PassiveElement {
  kind: 'R' | 'L' | 'C';
  id: string;
  nodes: [number, number];
  /** R: ohms. L: henry (+ seriesR = DCR). C: farad (+ seriesR = ESR). */
  value: number;
  seriesR?: number;
}

export interface DriverElement {
  kind: 'driver';
  id: string;
  /** Which measured driver this instantiates (e.g. "mid", "tweeter"). */
  model: string;
  nodes: [number, number];
  /** Electrical inversion as drawn in the schematic. */
  inverted: boolean;
}

export interface SourceElement {
  kind: 'source';
  id: string;
  nodes: [number, number];
  volts: number; // Eg
  seriesR: number; // Rg
}

export type NetElement = PassiveElement | DriverElement | SourceElement;

export interface Netlist {
  /** Total node count INCLUDING ground (node 0). */
  nodeCount: number;
  elements: NetElement[];
}

/** Per-driver complex Z as a function of grid index. */
export type DriverImpedances = Record<string, readonly Complex[]>;

export interface SolveResult {
  /**
   * Per driver-element id: voltage transfer  H(f) = V_driver / Eg  (complex,
   * one entry per grid frequency, inversion already applied). |H| = 1 means
   * the driver sees the full source voltage — i.e. no filter.
   */
  transfers: Record<string, Complex[]>;
  drivers: DriverElement[];
  /**
   * System input impedance the generator sees at its terminals — the external
   * network only, its own series Rg excluded: Zin = V_terminals / I_delivered.
   * This is the amplifier-load curve (VituixCAD's Impedance chart).
   */
  inputZ: Complex[];
  /**
   * NODE VOLTAGES, one array per grid frequency, indexed by node number
   * (index 0 is ground and is always 0). PRESENT ONLY when the caller asked
   * for internals — see `SolveOptions`.
   */
  nodeVoltages?: Complex[][];
  /**
   * ELEMENT CURRENTS, per element id, one entry per grid frequency, taken
   * POSITIVE from `nodes[0]` towards `nodes[1]`. For the generator it is the
   * current delivered into the external network, i.e. (Eg − V_terminals)/Rg.
   * PRESENT ONLY when the caller asked for internals.
   */
  elementCurrents?: Record<string, Complex[]>;
}

/**
 * Extra outputs from the SAME MNA solution (engine v2, spec F1: "solver
 * uitbreiden met elementstromen").
 *
 * WHY AN OPTION AND NOT ALWAYS. The nodal solve already knows every node
 * voltage — the currents are one multiply each — but building and returning
 * them allocates two more arrays per grid point, and this solver runs inside
 * the optimiser's inner loop tens of thousands of times per run. More
 * importantly, the engine-v2 toggle has to be byte-identical when it is off:
 * an absent option adds no field to the result, so a caller that does not ask
 * gets exactly the object it got before this existed.
 */
export interface SolveOptions {
  /** Return `nodeVoltages` and `elementCurrents` alongside the usual result. */
  withInternals?: boolean;
}

export class NetworkError extends Error {}

/**
 * Tiny leak conductance added on every diagonal. Regularises nodes that end up
 * floating (e.g. behind a near-open placeholder part) instead of making the
 * matrix singular; 1e-12 S is ~9 orders below any audible effect.
 */
const G_LEAK = 1e-12;

export function solveNetwork(
  netlist: Netlist,
  freq: readonly number[],
  driverZ: DriverImpedances,
  options: SolveOptions = {},
): SolveResult {
  const withInternals = options.withInternals === true;
  const n = netlist.nodeCount - 1; // unknowns (ground eliminated)
  if (n < 1) throw new NetworkError('Network has no non-ground nodes.');

  const drivers = netlist.elements.filter((e): e is DriverElement => e.kind === 'driver');
  const sources = netlist.elements.filter((e): e is SourceElement => e.kind === 'source');
  if (sources.length === 0) throw new NetworkError('Network has no generator.');
  for (const d of drivers) {
    if (!driverZ[d.model]) {
      throw new NetworkError(`No measured impedance provided for driver model "${d.model}".`);
    }
  }

  const transfers: Record<string, Complex[]> = {};
  for (const d of drivers) transfers[d.id] = new Array<Complex>(freq.length);
  const inputZ = new Array<Complex>(freq.length);
  const nodeVoltages: Complex[][] | null = withInternals ? new Array<Complex[]>(freq.length) : null;
  const elementCurrents: Record<string, Complex[]> | null = withInternals ? {} : null;
  if (elementCurrents) {
    for (const e of netlist.elements) elementCurrents[e.id] = new Array<Complex>(freq.length);
  }

  // Reusable matrix/vector buffers.
  const G: Complex[][] = Array.from({ length: n }, () => new Array<Complex>(n));
  const I: Complex[] = new Array<Complex>(n);

  for (let k = 0; k < freq.length; k++) {
    const w = 2 * Math.PI * freq[k];

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) G[r][c] = cplx(r === c ? G_LEAK : 0);
      I[r] = cplx(0);
    }

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
          stamp(a, b, cplx(1 / e.value));
          break;
        case 'L':
          stamp(a, b, inv(cplx(e.seriesR ?? 0, w * e.value)));
          break;
        case 'C':
          // Z = ESR + 1/(jwC)
          stamp(a, b, inv(cplx(e.seriesR ?? 0, -1 / (w * e.value))));
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

    const v = solveComplexLinear(G, I);
    const nodeV = (idx: number): Complex => (idx === 0 ? cplx(0) : v[idx - 1]);

    for (const d of drivers) {
      const vd = sub(nodeV(d.nodes[0]), nodeV(d.nodes[1]));
      const h = div(vd, cplx(sources[0].volts));
      transfers[d.id][k] = d.inverted ? scale(h, -1) : h;
    }

    // Input impedance at the generator terminals: the current it delivers into
    // the external network is (Eg − V_terminals)/Rg (the drop over its own
    // series Rg in the Thevenin picture). A fully open network still yields a
    // finite ~1/G_LEAK thanks to the diagonal leak.
    const src = sources[0];
    const vs = sub(nodeV(src.nodes[0]), nodeV(src.nodes[1]));
    const iIn = scale(sub(cplx(src.volts), vs), 1 / src.seriesR);
    inputZ[k] = div(vs, iIn);

    // Internals, from the SAME solution — no second solve, no second model.
    // Every current is (V_a − V_b)·Y with exactly the admittance that was
    // stamped above, so a current can never describe a different element than
    // the one the transfer function saw.
    if (nodeVoltages && elementCurrents) {
      const vAll = new Array<Complex>(netlist.nodeCount);
      for (let i = 0; i < netlist.nodeCount; i++) vAll[i] = nodeV(i);
      nodeVoltages[k] = vAll;
      for (const e of netlist.elements) {
        const [a, b] = e.nodes;
        const dv = sub(nodeV(a), nodeV(b));
        switch (e.kind) {
          case 'R':
            elementCurrents[e.id][k] = scale(dv, 1 / e.value);
            break;
          case 'L':
            elementCurrents[e.id][k] = mulc(dv, inv(cplx(e.seriesR ?? 0, w * e.value)));
            break;
          case 'C':
            elementCurrents[e.id][k] = mulc(dv, inv(cplx(e.seriesR ?? 0, -1 / (w * e.value))));
            break;
          case 'driver':
            elementCurrents[e.id][k] = mulc(dv, inv(driverZ[e.model][k]));
            break;
          case 'source':
            // The generator's own branch: what it delivers to the network.
            elementCurrents[e.id][k] = scale(sub(cplx(e.volts), dv), 1 / e.seriesR);
            break;
        }
      }
    }
  }

  return withInternals
    ? { transfers, drivers, inputZ, nodeVoltages: nodeVoltages!, elementCurrents: elementCurrents! }
    : { transfers, drivers, inputZ };
}

/**
 * Solve A·x = b for complex A (n×n) and b, by Gaussian elimination with
 * partial pivoting. Mutates A and b (callers pass per-frequency scratch).
 */
export function solveComplexLinear(A: Complex[][], b: Complex[]): Complex[] {
  const n = A.length;

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column.
    let pivot = col;
    let best = Math.hypot(A[col][col].re, A[col][col].im);
    for (let r = col + 1; r < n; r++) {
      const m = Math.hypot(A[r][col].re, A[r][col].im);
      if (m > best) {
        best = m;
        pivot = r;
      }
    }
    if (best === 0) throw new NetworkError('Singular network matrix (floating subcircuit?).');
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }

    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = div(A[r][col], d);
      if (factor.re === 0 && factor.im === 0) continue;
      A[r][col] = cplx(0);
      for (let c = col + 1; c < n; c++) {
        A[r][c] = sub(A[r][c], mulc(factor, A[col][c]));
      }
      b[r] = sub(b[r], mulc(factor, b[col]));
    }
  }

  const x = new Array<Complex>(n);
  for (let r = n - 1; r >= 0; r--) {
    let acc = b[r];
    for (let c = r + 1; c < n; c++) acc = sub(acc, mulc(A[r][c], x[c]));
    x[r] = div(acc, A[r][r]);
  }
  return x;
}

// Local complex multiply (avoids importing mul under a clashing name).
const mulc = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
