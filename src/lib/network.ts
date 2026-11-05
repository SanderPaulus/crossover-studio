import type { Complex } from './complex.ts';
import { cplx, sub, div, inv, scale } from './complex.ts';

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

  // FLAT SCRATCH BUFFERS — real and imaginary parts in separate typed arrays,
  // reused across frequencies. Until 2026-11 this loop built the matrix as
  // `Complex[][]` and eliminated it through `solveComplexLinear`, which
  // allocates a fresh object for every complex add, multiply and divide; the
  // optimiser calls this tens of thousands of times per run, and on casus 1 the
  // amp-floor barrier alone (one solve over ~400 safety-grid points per
  // evaluation) spent ~9.5 of 12.9 ms per evaluation in it. The arithmetic
  // below is the SAME arithmetic, operation for operation and in the same
  // order — the stamps of `add`/`sub`/`inv`, the pivot by `Math.hypot`, the
  // factor of `div`, the updates of `mulc` — so every result is bit-identical
  // (measured on all 180 frozen casus-1 netlists, both grids, 68 940 points;
  // pinned by `network.test.ts`). The one structural change is the row swap:
  // rows are addressed through `rowOf`, so a pivot swaps two indices instead of
  // two arrays, which moves no number. `solveComplexLinear` stays as the
  // readable reference and as what the test compares against.
  const Are = new Float64Array(n * n);
  const Aim = new Float64Array(n * n);
  const bre = new Float64Array(n);
  const bim = new Float64Array(n);
  const rowOf = new Int32Array(n);
  const xre = new Float64Array(n);
  const xim = new Float64Array(n);

  /** `add` on the diagonals, `sub` off them — the old `stamp`, on flat buffers. */
  const stamp = (a: number, b: number, yr: number, yi: number): void => {
    if (a > 0) {
      const i = (a - 1) * n + (a - 1);
      Are[i] = Are[i] + yr;
      Aim[i] = Aim[i] + yi;
    }
    if (b > 0) {
      const i = (b - 1) * n + (b - 1);
      Are[i] = Are[i] + yr;
      Aim[i] = Aim[i] + yi;
    }
    if (a > 0 && b > 0) {
      const i = (a - 1) * n + (b - 1);
      const j = (b - 1) * n + (a - 1);
      Are[i] = Are[i] - yr;
      Aim[i] = Aim[i] - yi;
      Are[j] = Are[j] - yr;
      Aim[j] = Aim[j] - yi;
    }
  };
  /** `stamp(a, b, inv(cplx(re, im)))`, with `inv` written out. */
  const stampInv = (a: number, b: number, re: number, im: number): void => {
    const denom = re * re + im * im;
    stamp(a, b, re / denom, -im / denom);
  };

  for (let k = 0; k < freq.length; k++) {
    const w = 2 * Math.PI * freq[k];

    Are.fill(0);
    Aim.fill(0);
    bre.fill(0);
    bim.fill(0);
    for (let r = 0; r < n; r++) {
      Are[r * n + r] = G_LEAK;
      rowOf[r] = r;
    }

    for (const e of netlist.elements) {
      const [a, b] = e.nodes;
      switch (e.kind) {
        case 'R':
          stamp(a, b, 1 / e.value, 0);
          break;
        case 'L':
          stampInv(a, b, e.seriesR ?? 0, w * e.value);
          break;
        case 'C':
          // Z = ESR + 1/(jwC)
          stampInv(a, b, e.seriesR ?? 0, -1 / (w * e.value));
          break;
        case 'driver': {
          const z = driverZ[e.model][k];
          stampInv(a, b, z.re, z.im);
          break;
        }
        case 'source': {
          const g = 1 / e.seriesR;
          stamp(a, b, g, 0);
          const iNorton = e.volts * g;
          if (a > 0) {
            bre[a - 1] = bre[a - 1] + iNorton;
            bim[a - 1] = bim[a - 1] + 0;
          }
          if (b > 0) {
            bre[b - 1] = bre[b - 1] - iNorton;
            bim[b - 1] = bim[b - 1] - 0;
          }
          break;
        }
      }
    }

    // Gaussian elimination with partial pivoting — `solveComplexLinear`, flat.
    for (let col = 0; col < n; col++) {
      let pivot = col;
      const p0 = rowOf[col] * n + col;
      let best = Math.hypot(Are[p0], Aim[p0]);
      for (let r = col + 1; r < n; r++) {
        const i = rowOf[r] * n + col;
        const m = Math.hypot(Are[i], Aim[i]);
        if (m > best) {
          best = m;
          pivot = r;
        }
      }
      if (best === 0) throw new NetworkError('Singular network matrix (floating subcircuit?).');
      if (pivot !== col) {
        const t = rowOf[col];
        rowOf[col] = rowOf[pivot];
        rowOf[pivot] = t;
      }
      const cr = rowOf[col] * n;
      const dre = Are[cr + col];
      const dim = Aim[cr + col];
      const denom = dre * dre + dim * dim;
      const bcr = rowOf[col];
      for (let r = col + 1; r < n; r++) {
        const rr = rowOf[r] * n;
        const are = Are[rr + col];
        const aim = Aim[rr + col];
        const fre = (are * dre + aim * dim) / denom;
        const fim = (aim * dre - are * dim) / denom;
        if (fre === 0 && fim === 0) continue;
        Are[rr + col] = 0;
        Aim[rr + col] = 0;
        for (let c = col + 1; c < n; c++) {
          const ar = Are[cr + c];
          const ai = Aim[cr + c];
          Are[rr + c] = Are[rr + c] - (fre * ar - fim * ai);
          Aim[rr + c] = Aim[rr + c] - (fre * ai + fim * ar);
        }
        const br = bre[bcr];
        const bi = bim[bcr];
        const rb = rowOf[r];
        bre[rb] = bre[rb] - (fre * br - fim * bi);
        bim[rb] = bim[rb] - (fre * bi + fim * br);
      }
    }
    for (let r = n - 1; r >= 0; r--) {
      const rr = rowOf[r] * n;
      let accr = bre[rowOf[r]];
      let acci = bim[rowOf[r]];
      for (let c = r + 1; c < n; c++) {
        const ar = Are[rr + c];
        const ai = Aim[rr + c];
        accr = accr - (ar * xre[c] - ai * xim[c]);
        acci = acci - (ar * xim[c] + ai * xre[c]);
      }
      const dr = Are[rr + r];
      const di = Aim[rr + r];
      const denom = dr * dr + di * di;
      xre[r] = (accr * dr + acci * di) / denom;
      xim[r] = (acci * dr - accr * di) / denom;
    }

    const v = new Array<Complex>(n);
    for (let i = 0; i < n; i++) v[i] = { re: xre[i], im: xim[i] };
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
