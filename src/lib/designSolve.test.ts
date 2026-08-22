import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import {
  applyTransfer,
  combine,
  combineN,
  logspace,
  resample,
  resampleImpedance,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { pickSlotsN } from './driverSlots.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { deserializeFilter } from './filterFile.ts';
import { solveDesign } from './designSolve.ts';
import type { Complex } from './complex.ts';

/**
 * A6b MIGRATION PROOF — bit-identical, not merely close.
 *
 * `solveDesign` replaced two copies of the same eight steps in App.tsx (the
 * ghost overlay and the compare table). The frozen function below is the
 * ghost overlay's code as it stood, transplanted verbatim; the live function
 * has to reproduce it to the last bit on the real fixtures.
 *
 * ⚠ THIS IS A ONE-OFF, NOT A STANDING SYNC CHECK. Two implementations kept
 * in step by a test can still drift between test runs; the point of the
 * extraction is that there is now only one. The frozen copy earns its place
 * as evidence that the extraction changed nothing, exactly as the frozen
 * pre-N-way loop does in dsp.nway.test.ts — it must never grow into a second
 * live implementation.
 */
function frozenInlineSolve(
  d: { name: string; parts: Parameters<typeof crossoverToNetlist>[0]['parts'] },
  grid: number[],
  zOnGrid: Record<string, Complex[]>,
  simBase: { w: GriddedResponse; m?: GriddedResponse | null; t: GriddedResponse },
  threeWay: boolean,
  branchAdj: { mid: BranchAdjust; tweeter: TweeterAdjust },
) {
  const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts });
  const sol = solveNetwork(netlist, grid, zOnGrid);
  const slots = pickSlotsN(sol.drivers);
  if (slots.ambiguous) return null;
  const hW = slots.woofer ? sol.transfers[slots.woofer.id] ?? null : null;
  const hM = slots.mid ? sol.transfers[slots.mid.id] ?? null : null;
  const hT = slots.tweeter ? sol.transfers[slots.tweeter.id] ?? null : null;
  const w = hW ? applyTransfer(simBase.w, hW) : simBase.w;
  const t = hT ? applyTransfer(simBase.t, hT) : simBase.t;
  const n3 =
    threeWay && simBase.m
      ? combineN([
          { response: w },
          { response: hM ? applyTransfer(simBase.m, hM) : simBase.m, adjust: branchAdj.mid },
          { response: t, adjust: branchAdj.tweeter },
        ])
      : null;
  const combined = n3 ?? combine(w, t, branchAdj.tweeter);
  return { inputZ: sol.inputZ, combined, n3 };
}

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-3way');
const grid = logspace(455, 16000, 300);
const SILENT_GHOST_DB = -400;

function banded(file: string): GriddedResponse {
  const p = parseFrd(readFileSync(join(FIXTURES, file), 'utf-8'));
  const g = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0];
  const f1 = p.freq[p.freq.length - 1];
  return {
    freq: grid,
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT_GHOST_DB : v)),
    phaseDeg: g.phaseDeg,
  };
}
function zOf(file: string): Complex[] {
  const z = parseZma(readFileSync(join(FIXTURES, file), 'utf-8'));
  return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
}

const base = {
  w: banded('woofer-pair-hor0.frd'),
  m: banded('mid-hor0.txt'),
  t: banded('tweeter-hor0.txt'),
};
const driverZ: Record<string, Complex[]> = {
  woofer: zOf('woofers-parallel.zma'),
  mid: zOf('mid.zma'),
  tweeter: zOf('tweeter.zma'),
};
const design = deserializeFilter(
  readFileSync(join(FIXTURES, 'reference-20260820.2.adsfilter.json'), 'utf-8'),
);

/** Object.is over every element — "close" is not the claim being made. */
function expectSameNumbers(a: readonly number[], b: readonly number[], what: string) {
  expect(a.length, `${what}: length`).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) {
      throw new Error(`${what}: index ${i} — ${a[i]} vs ${b[i]}`);
    }
  }
}

describe('solveDesign — one solve, two callers (A6b)', () => {
  const ADJ = [
    { label: 'no adjustment', adj: { mid: {}, tweeter: { offsetMm: 0, trimDb: 0, inverted: false } } },
    {
      label: 'trimmed, delayed and inverted branches',
      adj: {
        mid: { trimDb: -1.5, offsetMm: 12 } as BranchAdjust,
        tweeter: { offsetMm: -7, trimDb: 2.5, inverted: true } as TweeterAdjust,
      },
    },
  ];

  for (const threeWay of [true, false]) {
    for (const { label, adj } of ADJ) {
      it(`is bit-identical to the inline code it replaced — ${threeWay ? 'three-way' : 'two-way'}, ${label}`, () => {
        const want = frozenInlineSolve(
          { name: 'ref', parts: design.parts },
          [...grid],
          driverZ,
          base,
          threeWay,
          adj,
        );
        expect(want).not.toBeNull();
        const got = solveDesign({
          design: { name: 'ref', parts: design.parts },
          grid,
          driverZ,
          base,
          threeWay,
          adjust: adj,
        });
        expect(got.ambiguous).toBeNull();
        expect(got.sum).not.toBeNull();
        expectSameNumbers(
          got.inputZ.map((c) => c.re),
          want!.inputZ.map((c) => c.re),
          'inputZ.re',
        );
        expectSameNumbers(
          got.inputZ.map((c) => c.im),
          want!.inputZ.map((c) => c.im),
          'inputZ.im',
        );
        expectSameNumbers(got.sum!.combinedSpl, want!.combined.combinedSpl, 'combinedSpl');
        expectSameNumbers(
          got.sum!.combinedPhaseDeg,
          want!.combined.combinedPhaseDeg,
          'combinedPhaseDeg',
        );
        // The branches the phase ghost stitches from, and the compare table
        // measures its pairs on.
        expect(got.branches!.length).toBe(threeWay ? 3 : 2);
        const wantBranches = want!.n3
          ? want!.n3.branches
          : [
              (want!.combined as ReturnType<typeof combine>).woofer,
              (want!.combined as ReturnType<typeof combine>).tweeter,
            ];
        got.branches!.forEach((b, i) => {
          expectSameNumbers(b.spl, wantBranches[i].spl, `branch ${i} spl`);
          expectSameNumbers(b.phaseDeg, wantBranches[i].phaseDeg, `branch ${i} phaseDeg`);
        });
        if (!threeWay) {
          expectSameNumbers(
            (got.sum as ReturnType<typeof combine>).relativePhaseDeg,
            (want!.combined as ReturnType<typeof combine>).relativePhaseDeg,
            'relativePhaseDeg',
          );
        }
      });
    }
  }

  it('reports ambiguity WITH the impedance, because |Z| does not depend on which branch is which', () => {
    /* The compare table shows a Z minimum for a tab whose driver names it
     * cannot resolve — withholding it would be pretending not to know
     * something the solve already computed. */
    // Three non-tweeter names: resolvable impedances (so the solve still
    // runs) but no way to say which branch is which.
    const renamed = design.parts.map((p) =>
      p.type === 'Driver' && p.model === 'tweeter' ? { ...p, model: 'woofer' } : p,
    );
    const got = solveDesign({
      design: { name: 'renamed', parts: renamed },
      grid,
      driverZ,
      base,
      threeWay: true,
      adjust: { mid: {}, tweeter: { offsetMm: 0, trimDb: 0, inverted: false } },
    });
    expect(got.ambiguous).toMatch(/not supported/);
    expect(got.sum).toBeNull();
    expect(got.branches).toBeNull();
    expect(got.inputZ.length).toBe(grid.length);
    expect(got.inputZ.every((c) => Number.isFinite(c.re) && Number.isFinite(c.im))).toBe(true);
  });
});
