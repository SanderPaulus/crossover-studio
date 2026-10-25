/**
 * U-10 fase 1 (B-4.1) — the drawn THREE-WAY network through the v2 worker.
 *
 * Until U-10 ⚙ Optimize components and ✂ Minimize network on a three-way ran
 * on the v1 worker with no armed gate. Since U-10 they go through
 * `handleV2Request` kind `v2TuneNetlist3`, on the chain's own option assembly
 * (`assembledTuneOptions3`). A small synthetic three-way (flat responses,
 * resistive drivers) keeps the claims cheap: the route delivers or refuses by
 * rule, judges both pairs, and a gate that binds is enforced — the thing the
 * v1 task never did.
 */
import { describe, expect, it } from 'vitest';
import { logspace, type GriddedResponse } from '../../dsp.ts';
import { cplx } from '../../complex.ts';
import { filterTemplate } from '../../filterTemplates.ts';
import { assembledTuneOptions3, type Chain3Input } from '../../threeWayChain.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './candidateDeclaration.ts';
import {
  handleV2Request,
  type V2CandidateResult,
  type V2Response,
  type V2TuneNetlist3Payload,
  type V2TuneNetlistResult,
} from './worker.ts';

const grid = logspace(60, 16000, 72);
const flat: GriddedResponse = { freq: [...grid], spl: grid.map(() => 88), phaseDeg: grid.map(() => 0) };
const z8 = grid.map(() => cplx(8, 0));
const BAND: [number, number] = [80, 14000];

function input(): Chain3Input {
  return {
    grid: [...grid],
    w: flat,
    m: flat,
    t: flat,
    driverZ: { woofer: z8, mid: z8, tweeter: z8 },
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    xoLow: 0,
    xoHigh: 0,
    label: 'drawn 3-way',
    settings: { phasePriority: 0.5, synthMode: 'acoustic', band: BAND, targets: { rippleDb: 2.5, phaseDeg: 15 }, xoFloorPairs: [null, null] },
  };
}

function payload(ampMinLoadOhm?: number, minimize = false): V2TuneNetlist3Payload {
  const parts = filterTemplate({ order: 2, wayCount: 3, models: [] }).parts;
  return {
    input: input(),
    parts,
    label: 'drawn 3-way',
    v2: {
      gates: ampMinLoadOhm !== undefined ? { ampMinLoadOhm } : {},
      /* The measured sweeps: M-B/|Z| judges on them or not at all (V32). */
      impedanceByModel: Object.fromEntries(
        ['woofer', 'mid', 'tweeter'].map((m) => [m, { grid: [...grid], magnitude: grid.map(() => 8), phaseDeg: grid.map(() => 0), validHz: [grid[0], grid[grid.length - 1]] as [number, number] }]),
      ),
      budgets: {},
      determinism: { seed: 7, budgetEvaluations: 400 },
      judgeBandHz: BAND,
    },
    candidate: {
      declaration: declareCandidateChoices({
        cages: [null, null],
        windowFloorsHz: [null, null],
        multiWay: true,
        rippleStopFromLowestCrossing: true,
        stated: { band: BAND, staged: { rippleDb: 2.5, phaseDeg: 15 }, zFloorStrict: true },
      }),
      chainDeclaration: declareCandidateChainChoices({ stated: {} }),
      provenance: 'this test — a drawn three-way network',
    },
    ...(minimize ? { minimize: { targets: { rippleDb: 2.5, phaseDeg: 15 } } } : {}),
  };
}

function through(p: V2TuneNetlist3Payload): V2CandidateResult<V2TuneNetlistResult> {
  const wire = structuredClone({ id: 1, kind: 'v2TuneNetlist3' as const, payload: p });
  const out: V2CandidateResult<V2TuneNetlistResult>[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out.push(m.data as V2CandidateResult<V2TuneNetlistResult>);
  });
  if (out.length !== 1) throw new Error('the v2 route returned nothing');
  return out[0];
}

describe('U-10 — the drawn three-way network on the v2 route', () => {
  it('the option assembly: a drawing states no branch targets and no stop band; the hook wins (F2b)', () => {
    const inp = input();
    const o = assembledTuneOptions3(inp, [], { crossingsHz: null });
    expect(o).not.toHaveProperty('branchTargets');
    expect(o).not.toHaveProperty('rippleTargetBandHz');
    expect(o.midBranch?.response).toBe(inp.m);
    expect(o.midBranch?.adjust).toBe(inp.midAdjust);
    expect(o.xoRangePairs).toEqual([null, null]);
    const hooked = assembledTuneOptions3(input(), [], { crossingsHz: null }, { tuneOptionsFor: () => ({ band: [1, 2] }) });
    expect(hooked.band).toEqual([1, 2]);
  });

  it('the tune delivers or refuses by rule, and judges BOTH pairs', () => {
    const r = through(payload());
    expect(r.rejection).toBeNull();
    expect(r.result.parts.length).toBeGreaterThan(0);
    expect(r.measurements.response).not.toBeNull();
    expect(r.measurements.phaseTracking.map((p) => p.subject)).toEqual(['woofer|mid', 'mid|tweeter']);
  }, 120_000);

  it('a gate that cannot be met refuses wholesale — the enforcement the v1 task never had (V31)', () => {
    const r = through(payload(200));
    expect(r.rejection).not.toBeNull();
    expect(r.result.parts).toEqual([]);
    expect(r.rejection!.kinds).toContain('gate');
  }, 120_000);

  it('the minimise pass returns its report with the network the gates judged', () => {
    const r = through(payload(undefined, true));
    if (r.rejection) {
      expect(r.result.parts).toEqual([]);
    } else {
      expect(r.result.minimize).toBeDefined();
      expect(r.result.parts).toEqual(r.result.minimize!.parts);
    }
  }, 300_000);
});
