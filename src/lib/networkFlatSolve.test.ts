/**
 * THE FLAT SOLVER IS THE OLD SOLVER, BIT FOR BIT (2026-11).
 *
 * `solveNetwork` assembled and eliminated its admittance matrix as
 * `Complex[][]` through `solveComplexLinear` until 2026-11, allocating an
 * object per complex operation. It now does the same arithmetic on flat
 * `Float64Array`s, operation for operation and in the same order, with the row
 * swap done through an index. The claim is that NOTHING moved — not a digit,
 * not the sign of a zero — and this file is what keeps it true:
 *
 *  - `referenceSolve` below is the pre-2026-11 assembly VERBATIM: the same
 *    stamps through `add`/`sub`/`inv`, eliminated by the exported
 *    `solveComplexLinear`, with the same post-processing. It is the reading
 *    the new code has to equal.
 *  - The comparison runs on EVERY frozen netlist casus 1 names, on BOTH grids
 *    the tuner solves on (the chain grid and the safety grid), with and
 *    without internals — 720 solves — and compares by serialisation with
 *    `-0` kept distinct from `0`, so a difference in the sign of a zero (which
 *    a reordered sum can produce and `toBe` on `0` would not see) fails too.
 *  - The reference counts its pivot swaps, and the test demands at least one:
 *    the swap is the one place the flat code works differently, so a
 *    comparison that never swapped would prove nothing about it.
 *
 * Why this matters more than the speed: every corpus, every byte baseline and
 * every live chain run rests on this solver. A faster solver that moved one
 * bit would be a regeneration nobody asked for.
 */
import { describe, it, expect } from 'vitest';
import { solveNetwork, NetworkError, type Netlist, type NetElement, type SolveResult } from './network.ts';
import { cplx, add, sub, div, inv, scale } from './complex.ts';
import type { Complex } from './complex.ts';
import { casus1Files, casus1Filter, casus1Manifest, loadGolden } from './engine2/casus1.fixture.ts';
import { casus1ChainInput } from './engine2/casus1V2.fixture.ts';

const G_LEAK = 1e-12;
const mulc = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

/** `solveComplexLinear` verbatim, plus one counter: how often the pivot swapped
 *  rows. The swap is the one place the flat solver works differently (an index
 *  instead of two arrays), so the comparison is only worth something if it
 *  actually swapped somewhere. */
let pivotSwaps = 0;
function refLinear(A: Complex[][], b: Complex[]): Complex[] {
  const n = A.length;
  for (let col = 0; col < n; col++) {
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
      pivotSwaps++;
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = div(A[r][col], d);
      if (factor.re === 0 && factor.im === 0) continue;
      A[r][col] = cplx(0);
      for (let c = col + 1; c < n; c++) A[r][c] = sub(A[r][c], mulc(factor, A[col][c]));
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

/** The pre-2026-11 `solveNetwork`, verbatim in its arithmetic. */
function referenceSolve(
  netlist: Netlist,
  freq: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
  withInternals: boolean,
): SolveResult {
  const n = netlist.nodeCount - 1;
  const drivers = netlist.elements.filter((e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver');
  const sources = netlist.elements.filter((e): e is Extract<NetElement, { kind: 'source' }> => e.kind === 'source');
  const transfers: Record<string, Complex[]> = {};
  for (const d of drivers) transfers[d.id] = new Array<Complex>(freq.length);
  const inputZ = new Array<Complex>(freq.length);
  const nodeVoltages: Complex[][] | null = withInternals ? new Array<Complex[]>(freq.length) : null;
  const elementCurrents: Record<string, Complex[]> | null = withInternals ? {} : null;
  if (elementCurrents) for (const e of netlist.elements) elementCurrents[e.id] = new Array<Complex>(freq.length);
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
        case 'R': stamp(a, b, cplx(1 / e.value)); break;
        case 'L': stamp(a, b, inv(cplx(e.seriesR ?? 0, w * e.value))); break;
        case 'C': stamp(a, b, inv(cplx(e.seriesR ?? 0, -1 / (w * e.value)))); break;
        case 'driver': stamp(a, b, inv(driverZ[e.model][k])); break;
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
    const v = refLinear(G, I);
    const nodeV = (idx: number): Complex => (idx === 0 ? cplx(0) : v[idx - 1]);
    for (const d of drivers) {
      const vd = sub(nodeV(d.nodes[0]), nodeV(d.nodes[1]));
      const h = div(vd, cplx(sources[0].volts));
      transfers[d.id][k] = d.inverted ? scale(h, -1) : h;
    }
    const src = sources[0];
    const vs = sub(nodeV(src.nodes[0]), nodeV(src.nodes[1]));
    const iIn = scale(sub(cplx(src.volts), vs), 1 / src.seriesR);
    inputZ[k] = div(vs, iIn);
    if (nodeVoltages && elementCurrents) {
      const vAll = new Array<Complex>(netlist.nodeCount);
      for (let i = 0; i < netlist.nodeCount; i++) vAll[i] = nodeV(i);
      nodeVoltages[k] = vAll;
      for (const e of netlist.elements) {
        const [a, b] = e.nodes;
        const dv = sub(nodeV(a), nodeV(b));
        switch (e.kind) {
          case 'R': elementCurrents[e.id][k] = scale(dv, 1 / e.value); break;
          case 'L': elementCurrents[e.id][k] = mulc(dv, inv(cplx(e.seriesR ?? 0, w * e.value))); break;
          case 'C': elementCurrents[e.id][k] = mulc(dv, inv(cplx(e.seriesR ?? 0, -1 / (w * e.value)))); break;
          case 'driver': elementCurrents[e.id][k] = mulc(dv, inv(driverZ[e.model][k])); break;
          case 'source': elementCurrents[e.id][k] = scale(sub(cplx(e.volts), dv), 1 / e.seriesR); break;
        }
      }
    }
  }
  return withInternals
    ? { transfers, drivers, inputZ, nodeVoltages: nodeVoltages!, elementCurrents: elementCurrents! }
    : { transfers, drivers, inputZ };
}

/** Serialise with −0 distinct from 0: a reordered sum can flip a zero's sign. */
const exact = (x: unknown): string =>
  JSON.stringify(x, (_k, v) => (typeof v === 'number' && Object.is(v, -0) ? '-0' : v));

describe('the flat solver is the old solver, bit for bit', () => {
  it('on every frozen casus-1 netlist, both tuner grids, with and without internals', () => {
    const golden = loadGolden();
    const manifest = casus1Manifest(golden);
    const files = casus1Files(manifest);
    const g = casus1ChainInput(manifest, files, golden);
    const grids = [
      { grid: g.grid, z: g.driverZ },
      { grid: g.safety.freqs, z: g.safety.z },
    ];
    let solves = 0;
    const differing: string[] = [];
    for (const key of Object.keys(golden.manifest_en_geometrie.netlists)) {
      const net = casus1Filter(key, manifest, files, golden).netlist;
      for (const { grid, z } of grids) {
        for (const withInternals of [false, true]) {
          const a = referenceSolve(net, grid, z, withInternals);
          const b = solveNetwork(net, grid, z, { withInternals });
          solves++;
          if (exact(a) !== exact(b)) differing.push(`${key} (${grid.length} pt, internals ${withInternals})`);
        }
      }
    }
    // The premises: the whole book was walked, and the swap path was taken.
    expect(solves).toBeGreaterThanOrEqual(4 * 150);
    expect(pivotSwaps).toBeGreaterThan(0);
    expect(differing).toEqual([]);
  });

  it('a small hand-built network with an inverted driver and ESR/DCR gives the same bits', () => {
    // Both post-processing paths live: a plain and an inverted driver, a coil
    // with DCR, a capacitor with and without ESR, a near-ideal generator.
    const freq = [50, 400, 3000, 17000];
    const net: Netlist = {
      nodeCount: 5,
      elements: [
        { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e6 },
        { kind: 'R', id: 'R1', nodes: [1, 2], value: 1e-3 },
        { kind: 'L', id: 'L1', nodes: [2, 3], value: 2.2e-3, seriesR: 0.4 },
        { kind: 'C', id: 'C1', nodes: [3, 0], value: 10e-6, seriesR: 0.02 },
        { kind: 'C', id: 'C2', nodes: [2, 4], value: 4.7e-6 },
        { kind: 'driver', id: 'D1', model: 'lo', nodes: [3, 0], inverted: false },
        { kind: 'driver', id: 'D2', model: 'hi', nodes: [4, 0], inverted: true },
      ],
    };
    const z = {
      lo: freq.map((f) => cplx(6 + f / 1e4, 0.1 * Math.log(f))),
      hi: freq.map((f) => cplx(4.5, f / 5e3)),
    };
    for (const withInternals of [false, true]) {
      expect(exact(solveNetwork(net, freq, z, { withInternals }))).toBe(exact(referenceSolve(net, freq, z, withInternals)));
    }
  });
});
