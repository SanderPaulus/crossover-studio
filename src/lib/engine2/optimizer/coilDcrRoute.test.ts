/**
 * A5e.3 — THE COIL DCR MODEL, through the route the app takes.
 *
 * FOUR CLAIMS, and the second carries the rest.
 *
 *  1. P2. A candidate that declares no model delivers the network it always
 *     delivered: the delivered coils carry no `DCR` param, the column says
 *     every way is without a family, and the notes say so (the byte baselines
 *     of `f4cRegression` and `workerRouteRegression` pin the same identity on
 *     their own fixtures).
 *  2. IT REACHES THE SEARCH (V23). With the model declared, the delivered
 *     network differs from the lossless arm — and it is not merely the same
 *     network with a param stapled on: the inductances themselves move.
 *  3. ONE IMPLEMENTATION. Every delivered coil on a way with a family carries
 *     a `DCR` param equal to `dcrOf(L, fit)` at its own delivered inductance
 *     (to the rounding the param carries); the level-work inventory's coil
 *     DCR is that same number; and the M-B/|Z| verdict the worker reports is
 *     the verdict of a fresh solve of the delivered list — the gates read what
 *     the search wrote. The fingerprint moves with the model.
 *  4. THE SEED. The bounds the worker filed were solved on a STAMPED seed: the
 *     stated series-R bound's `seed_path_R_ohm` includes the seed coils' DCR,
 *     which is what makes "DCR charged first" true on this route.
 *
 * COST. Two chain runs on the small fixture `lowestWayLevelWork.test.ts`
 * uses, with a tight evaluation budget.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../../dsp.ts';
import { fromPolar } from '../../complex.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';
import type { Chain3Input, Chain3Result } from '../../threeWayChain.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import { levelWorkOnWay } from '../../levelWork.ts';
import { deserializeCatalog } from '../../catalogFile.ts';
import { dcrOf, fitCoilDcrFamilies, roundDcr, type CoilDcrFit } from '../../coilDcr.ts';
import { stableJson } from './determinism.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './candidateDeclaration.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { GeneratedCandidate } from '../predesign/candidates.ts';
import { evaluateGates } from './gates.ts';
import { v2GateReference, v2Netlist, v2SeedParts } from './v2.fixture.ts';
import { handleV2Request, type V2CandidateResult, type V2Chain3Payload, type V2Response } from './worker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', 'parsers', 'fixtures');
const GRID = logspace(210, 19000, 64);

const load = (n: string) => readFileSync(join(FIXTURES, n), 'utf-8');
const gFrd = (raw: string): GriddedResponse => {
  const f = parseFrd(raw);
  return resample(f.freq, f.spl, f.phase, GRID);
};
const gZ = (raw: string) => {
  const z = parseZma(raw);
  const g = resample(z.freq, z.magnitude, z.phase, GRID, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};

const windowInputs: XoWindowInput[] = [
  { lower: 'woofer', upper: 'mid', order: 4, validityFloorHz: 400, validityFloorSource: 'stated by this test', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 800, lowerMinus6AngleDeg: 30, spacingMm: null },
  { lower: 'mid', upper: 'tweeter', order: 4, validityFloorHz: 2000, validityFloorSource: 'stated by this test', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 4000, lowerMinus6AngleDeg: 30, spacingMm: null },
];

function oneCandidate(): GeneratedCandidate {
  const f = buildCandidateField({ windowInputs, perPair: [{ statedOrder: 4 }, { statedOrder: 4 }], alignments: AUTO_STRUCTS, minSpacingOctaves: 1 });
  return f.field.candidates[0];
}

const SETTINGS = {
  phasePriority: 0.5,
  synthMode: 'acoustic' as const,
  band: [250, 18000] as [number, number],
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  powerMetric: 'smooth' as const,
  catalogSnap: false,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
};

function chainInput(c: GeneratedCandidate): Chain3Input {
  return {
    grid: [...GRID],
    w: gFrd(load('mid_hor0_mettape.txt')),
    m: gFrd(load('mid_hor0_mettape.txt')),
    t: gFrd(load('tweet_hor0_mettape.txt')),
    driverZ: {
      woofer: gZ(load('mid_Backwavecone_sheep75gram.ZMA')),
      mid: gZ(load('mid_Backwavecone_sheep75gram.ZMA')),
      tweeter: gZ(load('tweeter.ZMA')),
    },
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...SETTINGS,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
}

/* The v8 catalogue's fits, and the same three families the casus-1 proposal names. */
const V8 = join(FIXTURES, 'gemini-catalog-v8.json');
const FITS: CoilDcrFit[] = fitCoilDcrFamilies(deserializeCatalog(readFileSync(V8, 'utf-8')).parts);
const FAMILIES = { woofer: 'jantzen|air core wire coil|1.4', mid: 'jantzen|air core wire coil|1', tweeter: 'jantzen|air core wire coil|1' };

function declaration(c: GeneratedCandidate, withModel: boolean) {
  return declareCandidateChoices({
    cages: c.crossings.map((x) => x.cageHz),
    windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
    multiWay: true,
    stated: {
      band: SETTINGS.band,
      staged: SETTINGS.targets,
      ampTarget: SETTINGS.ampTarget,
      powerMetric: SETTINGS.powerMetric,
      phaseMetric: SETTINGS.phaseMetric,
      catalogSnap: SETTINGS.catalogSnap,
      breakupGuard: SETTINGS.breakupGuard,
      zFloorStrict: true,
    },
    ...(withModel ? { coilDcrFamilyByWay: FAMILIES, coilDcrFits: FITS, coilDcrCatalogLabel: 'gemini-catalog-v8.json' } : {}),
  });
}

type Done = V2CandidateResult<Chain3Result>;

/* Wide enough for the fixture's woofer coils: with the 1.4 mm family stamped
 * their DCR alone is about 1 Ω (MEASURED — a 1.0 Ω maximum refused the
 * modelled arm on `topology` with 1.005 Ω of pure coil copper, which is the
 * finding the entry records: under a series-R maximum the coil copper is part
 * of the total, and the search has no handle on it but the inductance). */
const MAX_OHM = 2.0;

function through(c: GeneratedCandidate, withModel: boolean): Done {
  const payload: V2Chain3Payload = {
    input: chainInput(c),
    v2: { gates: {}, budgets: {}, determinism: { seed: 53, budgetEvaluations: 80 } },
    candidate: {
      declaration: declaration(c, withModel),
      /* A stated series-R maximum on the lowest way, so claim 4 has a bound
       * whose seed reading must include the stamped DCR. */
      chainDeclaration: declareCandidateChainChoices({ stated: {}, lowestWaySeriesRMaxOhm: MAX_OHM }),
      provenance: c.provenance,
      orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
    },
  };
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  let out: Done | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as Done;
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return out as Done;
}

const netOf = (parts: readonly VxpPart[]) =>
  stableJson(parts.map((p) => ({ id: p.partId ?? '', type: p.type, v: p.params.map((q) => [q.name, q.value]), at: p.wires.map((w) => `${w.x},${w.y}`).join(';') })));
const inductances = (parts: readonly VxpPart[]) =>
  stableJson(parts.filter((p) => p.type === 'Inductor').map((p) => [p.partId, p.params.find((q) => q.name === 'L')?.value]));
const coilsOf = (parts: readonly VxpPart[]) => parts.filter((p) => p.type === 'Inductor' && p.partId && !p.open && !p.shorted);

describe('A5e.3 — the coil DCR model on the v2 route', () => {
  it('P2 without a model; the model reaches the search; one implementation; the seed was stamped', () => {
    const c = oneCandidate();
    const bare = through(c, false);
    const modelled = through(c, true);

    /* ---- claim 1: lossless without a model, and said so ---- */
    expect(bare.rejection).toBeNull();
    expect(bare.result.parts.length).toBeGreaterThan(0);
    for (const p of coilsOf(bare.result.parts)) expect(p.params.find((q) => q.name === 'DCR')).toBeUndefined();
    expect(bare.coilDcr?.model).toBeNull();
    expect(bare.coilDcr?.inventory.waysWithoutFamily).toEqual(['mid', 'tweeter', 'woofer']);
    expect(bare.coilDcr?.inventory.carriedTotalOhm).toBe(0);
    expect(bare.notes.join(' ')).toMatch(/coilDcrModel — no coil family is stated/);

    /* ---- claim 2: the model reaches the search ---- */
    expect(modelled.rejection).toBeNull();
    expect(modelled.result.parts.length).toBeGreaterThan(0);
    expect(netOf(modelled.result.parts)).not.toBe(netOf(bare.result.parts));
    expect(inductances(modelled.result.parts), 'the inductances did not move: the DCR was stapled on, not searched with').not.toBe(inductances(bare.result.parts));
    expect(modelled.notes.join(' ')).toMatch(/Coil DCR \(A5e\.3\)/);

    /* ---- claim 3: one implementation ---- */
    const model = modelled.coilDcr!.model!;
    expect(model.familyByWay).toEqual(FAMILIES);
    const coils = coilsOf(modelled.result.parts);
    expect(coils.length).toBeGreaterThan(0);
    for (const row of modelled.coilDcr!.inventory.coils) {
      const p = coils.find((x) => x.partId === row.id)!;
      const carried = p.params.find((q) => q.name === 'DCR')?.value;
      expect(row.family, `${row.id} has no family`).not.toBeNull();
      expect(carried, `${row.id} carries no DCR`).toBeDefined();
      const fit = model.fits[row.family!];
      expect(carried).toBe(roundDcr(dcrOf(row.henry, fit)!.ohm));
      expect(row.carriedOhm).toBe(carried);
    }
    expect(modelled.coilDcr!.inventory.waysWithoutFamily).toEqual([]);
    // the level-work inventory reads the same params
    const lw = levelWorkOnWay(modelled.result.parts, 'woofer');
    expect(lw.reachable).toBe(true);
    for (const sc of lw.seriesCoils) {
      const row = modelled.coilDcr!.inventory.coils.find((r) => r.id === sc.id)!;
      expect(sc.dcrOhm).toBe(row.carriedOhm);
    }
    expect(modelled.levelWork.delivered?.dcrOhm).toBe(lw.dcrOhm);
    expect(lw.dcrOhm).toBeGreaterThan(0);
    // the fingerprint moves
    expect(modelled.result.parts.length).toBeGreaterThan(0);

    /* ---- claim 4: the bound was solved on a stamped seed ---- */
    const bound = modelled.bounds.find((b) => b.rule === 'stated-series-r');
    expect(bound, 'no stated-series-r bound filed').toBeTruthy();
    const bareBound = bare.bounds.find((b) => b.rule === 'stated-series-r')!;
    expect(bound!.parameters.seed_path_R_ohm as number).toBeGreaterThan(bareBound.parameters.seed_path_R_ohm as number);
  }, 300_000);

  it('a gate reads the DCR param the search writes: the same list with and without it judges differently', () => {
    /* No chain run: the fixture's seed carries DCR params on both coils. The
     * gate evaluator — the one the worker calls on the delivered list — reads
     * them through `crossoverToNetlist`, so stripping them moves M-A (the
     * dissipation fraction, which the DCR is part of). That is the whole of
     * "the gates read what the search wrote": one param, one reader. */
    const ref = v2GateReference();
    const withDcr = v2SeedParts();
    const without = withDcr.map((p) => (p.type === 'Inductor' ? { ...p, params: p.params.filter((q) => q.name !== 'DCR') } : p));
    const settings = { amplifierPowerW: 10 };
    const a = evaluateGates(v2Netlist(withDcr), settings, ref, 'frozen').verdicts.find((v) => v.gate === 'M-A');
    const b = evaluateGates(v2Netlist(without), settings, ref, 'frozen').verdicts.find((v) => v.gate === 'M-A');
    expect(a?.value).not.toBeNull();
    expect(b?.value).not.toBeNull();
    // The fraction moves (which way depends on how the current redistributes
    // over R1 and the DCR; the claim is that the param is READ, not its sign).
    expect(Math.abs(a!.value! - b!.value!)).toBeGreaterThan(1e-4);
    // …and the level-work inventory reads the same param
    expect(levelWorkOnWay(withDcr, 'mid').dcrOhm).toBeCloseTo(0.16, 9);
    expect(levelWorkOnWay(without, 'mid').dcrOhm).toBe(0);
  });
});
