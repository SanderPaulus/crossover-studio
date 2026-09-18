/**
 * H-3b — THE FLANK BECOMES A STATED REQUIREMENT, on the scan's own route.
 *
 * WHAT H-3 LEFT OPEN. On the two-way demo's own data the lean-form tune reached
 * its own ripple goal and moved the lowest passive way's flank from 0.84 to
 * 3.7 dB rms away from the stated high-pass — the handover band is one octave
 * of six in the amplitude term, and nothing said no. `h3NetworkTab.test.ts`
 * pins that finding and, since H-3b, its repair on the ⚙ route. THIS file is
 * the other half: the shortlist route (`v2ChainOne`, design + synthesis +
 * tune), through the real handler, on the small parsers fixture.
 *
 * WHAT IS CLAIMED.
 *   1. ONE READER. `flankVerdict` is applied in exactly one place of the
 *      worker (`runCandidate`), and BOTH two-way routes hand it the same flank
 *      reader (`hybridFlankErrorOf`), so a shortlist row and a ⚙ tune of a
 *      drawn network are judged by the same words. The flank is read in BOTH
 *      hybrid forms (H-2b read it in the lean form only), because a stated
 *      budget is a requirement wherever a hybrid runs.
 *   2. THE FINGERPRINT MOVES: the budget rides on the stated block of the
 *      chain's seventh key, so two runs that differ only in it stamp
 *      differently — and a run without one stamps byte for byte as before.
 *   3. THE ROUTE: with a stated budget the delivered network is inside it, or
 *      the candidate comes back as a REFUSAL with the number (`kinds:
 *      ['budget']`, the V45 shape), parts blanked (V31). Never above it.
 *   4. P2: the same run without a budget carries no flank in the tuner's own
 *      report, refuses nothing on it, and still reports the flank error.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../dsp.ts';
import { fromPolar } from '../complex.ts';
import { parseFrd } from '../parsers/frd.ts';
import { parseZma } from '../parsers/zma.ts';
import { defaultEq, defaultHpLp } from '../filters.ts';
import { complementSettings, handoverBandHz, type ActiveHandover } from '../activeSide.ts';
import type { ChainInput, ChainResult } from '../designChain.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './optimizer/candidateDeclaration.ts';
import { chainDeclarationKey } from './optimizer/chainChoices.ts';
import { handleV2Request, type V2CandidateResult, type V2ChainOnePayload, type V2Response } from './optimizer/worker.ts';
import { stableJson } from './optimizer/determinism.ts';

/* ==================================================================== *
 * 1 — one reader, both routes, both forms (source scans)
 * ==================================================================== */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(HERE, 'optimizer', 'worker.ts'), 'utf-8');

describe('H-3b — the flank budget has one reader in the worker', () => {
  it('`flankVerdict` is applied exactly once, inside `runCandidate`, and refuses in the V45 shape', () => {
    const calls = WORKER.match(/flankVerdict\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const at = WORKER.indexOf('flankVerdict(');
    const fn = WORKER.lastIndexOf('function runCandidate', at);
    expect(fn).toBeGreaterThan(-1);
    const block = WORKER.slice(at, at + 2500);
    expect(block).toContain("by: 'stated-flank-budget'");
    expect(block).toContain("kinds: ['budget']");
    expect(block).toContain('rejectedParts: [...delivered.parts]');
    /* Only when nothing else refused, and only with a stated budget and a reader. */
    const guard = WORKER.slice(WORKER.lastIndexOf('if (!refused && flankBudgetDbRms !== undefined && flankOf)', at), at);
    expect(guard.length).toBeGreaterThan(0);
  });

  it('BOTH two-way routes hand `runCandidate` the same flank reader; the three-way route hands none', () => {
    const readers = WORKER.match(/\(parts\) => hybridFlankErrorOf\(chainInput, parts\),/g) ?? [];
    expect(readers).toHaveLength(2);
    const threeWay = WORKER.slice(WORKER.indexOf("case 'v2Chain3One'"), WORKER.indexOf("case 'v2ChainOne'"));
    expect(threeWay).not.toContain('hybridFlankErrorOf');
  });

  it('the flank is read on EVERY hybrid run, both forms, and absent only without an active side', () => {
    const at = WORKER.indexOf('function hybridFlankErrorOf');
    expect(at).toBeGreaterThan(-1);
    const body = WORKER.slice(at, WORKER.indexOf('\n}\n', at));
    expect(body).toContain('if (!a) return undefined;');
    expect(body).not.toContain("unmeasured");
    /* The lean form is decided from the handover, not from whether a flank exists. */
    expect(WORKER).toContain("const lean = chainInput.settings.activeSide?.handover.unmeasured === true;");
    expect(WORKER).toContain('...(flank !== undefined ? { flankError: flank } : {}),');
  });
});

/* ==================================================================== *
 * 2 — the fingerprint
 * ==================================================================== */

const LEAN_HANDOVER: ActiveHandover = {
  activeWay: 'active (unmeasured)',
  passiveWay: 'mid',
  hz: 800,
  kind: 'LR',
  order: 4,
  statedBy: 'this test',
  unmeasured: true,
};

describe('H-3b — the budget rides on the chain’s seventh key', () => {
  const keyOf = (h: ActiveHandover) =>
    stableJson(chainDeclarationKey(declareCandidateChainChoices({ stated: {}, activeSide: { handover: h, settings: complementSettings(h) } })));

  it('two runs that differ only in the stated budget stamp differently; no budget stamps as before H-3b', () => {
    const plain = keyOf(LEAN_HANDOVER);
    const budgeted = keyOf({ ...LEAN_HANDOVER, flankBudgetDbRms: 1.5 });
    expect(budgeted).not.toBe(plain);
    expect(budgeted).toContain('flankBudgetDbRms');
    expect(plain).not.toContain('flankBudgetDbRms');
    expect(keyOf({ ...LEAN_HANDOVER, flankBudgetDbRms: 2.0 })).not.toBe(budgeted);
  });
});

/* ==================================================================== *
 * 3 + 4 — the shortlist route, through the real handler
 * ==================================================================== */

const FIXTURES = join(HERE, '..', 'parsers', 'fixtures');
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
const BAND: [number, number] = [250, 18000];
const SETTINGS = {
  phasePriority: 0.5,
  eqBandsPerDriver: 2,
  synthMode: 'filter' as const,
  band: BAND,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  powerMetric: 'smooth' as const,
  catalogSnap: false,
  cutOnly: true,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
};
const seed = () => ({
  woofer: {
    gainDb: 0,
    hp: defaultHpLp(200),
    lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
    eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
  },
  tweeter: {
    gainDb: 0,
    hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
    lp: defaultHpLp(20000),
    eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
  },
});
function twoWayInput(active: ActiveHandover): ChainInput {
  const activeSide = { handover: active, settings: complementSettings(active) };
  /* The lean form's band starts at the bottom of the handover band — the
   * app's own rule (`leanJudgedBand`), applied here by hand as H-2b did. */
  const band: [number, number] = [Math.max(BAND[0], handoverBandHz(active.hz)[0]), BAND[1]];
  return {
    grid: [...GRID],
    w: gFrd(load('mid_hor0_mettape.txt')),
    t: gFrd(load('tweet_hor0_mettape.txt')),
    driverZ: { mid: gZ(load('mid_Backwavecone_sheep75gram.ZMA')), tweeter: gZ(load('tweeter.ZMA')) },
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: seed(),
    settings: { ...SETTINGS, band, structurePreference: { kind: 'LR', order: 4 }, activeSide },
    xoRange: [1600, 2600],
  };
}
function through(active: ActiveHandover): V2CandidateResult<ChainResult> {
  const activeSide = { handover: active, settings: complementSettings(active) };
  const input = twoWayInput(active);
  const payload: V2ChainOnePayload = {
    input,
    label: 'h3b',
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: declareCandidateChoices({
        cages: [[1600, 2600]],
        windowFloorsHz: [1000],
        multiWay: true,
        stated: {
          band: input.settings.band,
          staged: SETTINGS.targets,
          ampTarget: SETTINGS.ampTarget,
          powerMetric: SETTINGS.powerMetric,
          phaseMetric: SETTINGS.phaseMetric,
          catalogSnap: SETTINGS.catalogSnap,
          breakupGuard: SETTINGS.breakupGuard,
          zFloorStrict: true,
        },
      }),
      chainDeclaration: declareCandidateChainChoices({ stated: {}, activeSide }),
      provenance: 'this test',
      orderByModel: { tweeter: 4 },
    },
  };
  const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
  let out: V2CandidateResult<ChainResult> | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as V2CandidateResult<ChainResult>;
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return out;
}

describe('H-3b — the shortlist route holds the flank to a stated budget, or refuses', () => {
  /* The budget is set from the UNBUDGETED run's own delivered flank: a run
   * that would have delivered above it is exactly the case the requirement is
   * for, and a budget picked by hand could be too loose to test anything. */
  it('with a stated budget below what the free tune delivers, the tune holds the flank inside it or is refused with the number — never delivered above it', () => {
    const free = through(LEAN_HANDOVER);
    expect(free.rejection).toBeNull();
    const freeFlank = free.measurements.flankError!;
    expect(freeFlank).not.toBeNull();
    /* P2 (claim 4): no budget, no flank in the tuner's own report, no refusal note. */
    expect(free.result.net.after).not.toHaveProperty('flankRmsDb');
    expect(free.notes.some((n) => /Flank budget \(H-3b\)/.test(n))).toBe(false);

    const budget = Math.max(0.1, freeFlank.rmsDb * 0.5);
    const r = through({ ...LEAN_HANDOVER, flankBudgetDbRms: budget });
    /* The budget reached the tuner: it read a flank of its own. */
    expect(Number.isFinite(r.result.net.before.flankRmsDb ?? Number.NaN)).toBe(true);
    if (r.rejection === null) {
      expect(r.result.parts.length).toBeGreaterThan(0);
      expect(r.measurements.flankError!.rmsDb).toBeLessThanOrEqual(budget);
      expect(r.notes.some((n) => /Flank budget \(H-3b\): .*within the stated budget/.test(n))).toBe(true);
      console.log(`[h3b] free tune ${freeFlank.rmsDb.toFixed(3)} dB rms; budget ${budget.toFixed(3)} HELD at ${r.measurements.flankError!.rmsDb.toFixed(3)} (${r.result.net.evaluations} evals)`);
    } else {
      expect(r.rejection.kinds).toEqual(['budget']);
      expect(r.rejection.reason).toMatch(/target-flank error [\d.]+ dB rms against the stated budget of ≤ [\d.]+ dB rms — requirement FAILED/);
      expect(r.result.parts).toEqual([]);
      expect(JSON.stringify(r)).not.toMatch(/"parts":\[\{/);
      console.log(`[h3b] free tune ${freeFlank.rmsDb.toFixed(3)} dB rms; budget ${budget.toFixed(3)} REFUSED: ${r.rejection.reason}`);
    }
  }, 600_000);

  it('a budget the free tune already meets changes the verdict and not the outcome: delivered, inside, said so', () => {
    const free = through(LEAN_HANDOVER);
    const loose = through({ ...LEAN_HANDOVER, flankBudgetDbRms: free.measurements.flankError!.rmsDb + 10 });
    expect(loose.rejection).toBeNull();
    expect(loose.measurements.flankError!.rmsDb).toBeLessThanOrEqual(free.measurements.flankError!.rmsDb + 10);
    expect(loose.notes.some((n) => /within the stated budget/.test(n))).toBe(true);
  }, 600_000);
});
