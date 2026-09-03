/**
 * V51 — THE THIRD CHAIN-LEVEL CHOICE KEY, through the route the app takes.
 *
 * SIX CLAIMS, and the third carries the rest.
 *
 *  1. THE DERIVATION. A stated requirement declares `'none'`; nothing stated
 *     declares ABSENT with P4 named — never a stated `'allowed'`; an explicit
 *     value wins either way.
 *  2. P2. Absent and a stated `'allowed'` deliver byte-identical networks,
 *     through the whole chain: the identity is what keeps every v1 run and
 *     every v2 run without the requirement exactly where it was.
 *  3. IT REACHES THE DESIGN AND SYNTHESIS STEPS. On a fixture whose lowest way
 *     is LOUDER than the anchor — the woofer response lifted, so the design
 *     step wants to trim it — the `'allowed'` arm delivers level work on the
 *     lowest way and the `'none'` arm delivers none, and the two networks
 *     differ (V23). Without this, every other claim is equally true of a key
 *     wired to nothing.
 *  4. THE KEY MOVES THE FINGERPRINT.
 *  5. THE REFUSAL. With the requirement stated, an anchored gap above zero on
 *     the lowest way and a ripple goal the padless design misses, the
 *     candidate comes back as a V31 refusal of kind `topology` quoting the gap
 *     (X); with the lowest way AS the anchor the same run is not refused on
 *     this rule, because it asked nothing.
 *  6. THE COLUMN. Every result carries the level-work column with the
 *     requirement, X and the delivered inventory, refused or not.
 *
 * COST. Several chain runs on the small fixture `candidateRoute.test.ts` uses,
 * with a tight evaluation budget.
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
import { levelWorkOnWay } from '../../levelWork.ts';
import { stableJson } from './determinism.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './candidateDeclaration.ts';
import { chainDeclarationCoverage, chainDeclarationKey, type ChainChoiceDeclaration } from './chainChoices.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { GeneratedCandidate } from '../predesign/candidates.ts';
import type { MeasurementFactsPayload } from './measurementFacts.ts';
import {
  handleV2Request,
  type V2CandidateResult,
  type V2Chain3Payload,
  type V2Response,
} from './worker.ts';

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
/**
 * The lowest way LOUDER than the anchor — the case V51 is about. The fixture's
 * woofer is the mid's own file, so lifting it is what puts a pad on it under
 * the historical rule; the amount is a fixture choice and not a casus number.
 */
const WOOFER_LIFT_DB = 6;
const lifted = (r: GriddedResponse, db: number): GriddedResponse => ({
  freq: [...r.freq],
  spl: r.spl.map((v) => v + db),
  phaseDeg: [...r.phaseDeg],
});

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

function chainInput(c: GeneratedCandidate, settingsExtra: object = {}): Chain3Input {
  return {
    grid: [...GRID],
    w: lifted(gFrd(load('mid_hor0_mettape.txt')), WOOFER_LIFT_DB),
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
      ...settingsExtra,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
}

function tunerDeclaration(c: GeneratedCandidate, staged = SETTINGS.targets) {
  return declareCandidateChoices({
    cages: c.crossings.map((x) => x.cageHz),
    windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
    multiWay: true,
    stated: {
      band: SETTINGS.band,
      staged,
      ampTarget: SETTINGS.ampTarget,
      powerMetric: SETTINGS.powerMetric,
      phaseMetric: SETTINGS.phaseMetric,
      catalogSnap: SETTINGS.catalogSnap,
      breakupGuard: SETTINGS.breakupGuard,
      zFloorStrict: true,
    },
  });
}

type Done = V2CandidateResult<Chain3Result>;

function through(
  c: GeneratedCandidate,
  chainDeclaration: ChainChoiceDeclaration,
  opts: { facts?: Partial<MeasurementFactsPayload>; staged?: { rippleDb: number; phaseDeg: number }; settingsExtra?: object } = {},
): Done {
  const payload: V2Chain3Payload = {
    input: chainInput(c, opts.settingsExtra ?? {}),
    v2: { gates: {}, budgets: {}, determinism: { seed: 51, budgetEvaluations: 80 }, ...(opts.facts ?? {}) },
    candidate: {
      declaration: tunerDeclaration(c, opts.staged),
      chainDeclaration,
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

const netOf = (r: Chain3Result) =>
  stableJson(r.parts.map((p) => ({ id: p.partId ?? '', type: p.type, v: p.params.map((q) => [q.name, q.value]), at: p.wires.map((w) => `${w.x},${w.y}`).join(';') })));

const NONE = declareCandidateChainChoices({ stated: {}, lowestWayLevelWorkForbidden: true });
const ABSENT = declareCandidateChainChoices({ stated: {} });
const ALLOWED = declareCandidateChainChoices({ stated: { lowestWayLevelWork: 'allowed' } });

describe('V51 — may the lowest way carry level work', () => {
  it('derives none from a stated requirement, ABSENT from nothing, and an explicit value wins', () => {
    expect(NONE.stated.lowestWayLevelWork).toBe('none');
    expect(ABSENT.stated.lowestWayLevelWork).toBeUndefined();
    const why = ABSENT.absent.find((a) => a.key === 'lowestWayLevelWork')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toMatch(/allowed/);
    // never a stated 'allowed' by derivation…
    expect(Object.values(ABSENT.stated)).not.toContain('allowed');
    // …but an explicit one wins, in both directions.
    expect(ALLOWED.stated.lowestWayLevelWork).toBe('allowed');
    expect(declareCandidateChainChoices({ stated: { lowestWayLevelWork: 'none' } }).stated.lowestWayLevelWork).toBe('none');
    expect(
      declareCandidateChainChoices({ stated: { lowestWayLevelWork: 'allowed' }, lowestWayLevelWorkForbidden: true }).stated
        .lowestWayLevelWork,
    ).toBe('allowed');
    // The coverage check sees the absent state as a state.
    for (const d of [NONE, ABSENT, ALLOWED]) expect(chainDeclarationCoverage(d).complete).toBe(true);
  });

  it('moves the fingerprint ingredient', () => {
    const k = (d: ChainChoiceDeclaration) => JSON.stringify(chainDeclarationKey(d));
    expect(k(NONE)).not.toBe(k(ABSENT));
    expect(k(NONE)).not.toBe(k(ALLOWED));
    expect(k(ABSENT)).not.toBe(k(ALLOWED));
    expect(k(NONE)).toBe(k(declareCandidateChainChoices({ stated: {}, lowestWayLevelWorkForbidden: true })));
  });

  it('P2 — absent and a stated allowed are byte-identical, and none reaches the design and synthesis steps', () => {
    const c = oneCandidate();
    const absent = through(c, ABSENT);
    const allowed = through(c, ALLOWED);
    const none = through(c, NONE);
    // Claim 2: the identity.
    expect(netOf(allowed.result)).toBe(netOf(absent.result));
    /* Claim 3, both halves. The fixture's lowest way is lifted above the
     * anchor, so the historical rule PADS it — that is the counter-proof that
     * makes "none delivers none" a claim about the key rather than about a
     * fixture that never needed a pad. */
    const padded = levelWorkOnWay(allowed.result.parts, 'woofer');
    expect(padded.reachable).toBe(true);
    expect(padded.none, 'the fixture does not pad its lowest way under the historical rule — the counter-proof is empty').toBe(false);
    const clean = levelWorkOnWay(none.result.parts, 'woofer');
    expect(clean.reachable).toBe(true);
    expect(clean.none).toBe(true);
    expect(netOf(none.result)).not.toBe(netOf(allowed.result));
    // Claim 6: the column, on both arms.
    expect(allowed.levelWork.requirement).toBe('allowed');
    expect(none.levelWork.requirement).toBe('none');
    expect(absent.levelWork.requirement).toBeNull();
    expect(none.levelWork.lowestWay).toBe('woofer');
    expect(none.levelWork.delivered?.none).toBe(true);
    // No anchored gap crossed on this run, and the column says so instead of inventing one.
    expect(none.levelWork.askedDb).toBeNull();
    expect(none.rejection).toBeNull();
    expect(none.levelWork.plateau.applicable).toBe(false);
  }, 300_000);

  it('refuses with the gap quoted when the requirement is stated, X > 0 and the ripple goal is missed — and not when the lowest way is the anchor', () => {
    const c = oneCandidate();
    const X = 4.25;
    /* A ripple goal the padless design cannot reach on this fixture; the
     * staged pass's own definition of "targets met" is what the refusal reads. */
    const tight = { rippleDb: 0.1, phaseDeg: 15 };
    const refused = through(c, NONE, { facts: { gapBudgetDbByModel: { woofer: X }, gapAnchorModel: 'mid' }, staged: tight });
    expect(refused.rejection, 'the padless candidate was not refused').toBeTruthy();
    expect(refused.rejection!.kinds).toEqual(['topology']);
    expect(refused.rejection!.reason).toContain(`${X.toFixed(2)} dB of level work on the lowest way`);
    expect(refused.rejection!.reason).toContain('woofer');
    expect(refused.rejection!.reason).toContain('mid');
    expect(refused.levelWork.askedDb).toBe(X);
    // V31 shape: no network in the output, the refused tune measured.
    expect(refused.result.parts).toEqual([]);
    expect(refused.rejection!.rejectedTune).toBeTruthy();
    expect(refused.levelWork.delivered?.none).toBe(true);
    /* The counter-proof: the same run with the lowest way AS the anchor asks
     * nothing of it, so a missed goal is not this rule's business. */
    const anchor = through(c, NONE, { facts: { gapBudgetDbByModel: { mid: 1 }, gapAnchorModel: 'woofer' }, staged: tight });
    expect(anchor.levelWork.askedDb).toBe(0);
    expect(anchor.rejection?.kinds ?? []).not.toContain('topology');
    /* ...and with the goal met (a loose one) the same configuration delivers. */
    const loose = through(c, NONE, { facts: { gapBudgetDbByModel: { woofer: X }, gapAnchorModel: 'mid' }, staged: { rippleDb: 60, phaseDeg: 180 } });
    expect(loose.rejection?.kinds ?? []).not.toContain('topology');
    expect(loose.result.parts.length).toBeGreaterThan(0);
  }, 300_000);
});
