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
import type { VxpPart } from '../../parsers/vxp.ts';
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
  opts: {
    facts?: Partial<MeasurementFactsPayload>;
    staged?: { rippleDb: number; phaseDeg: number };
    settingsExtra?: object;
    /** V51b — armed gates, for the floor claims. */
    gates?: V2Chain3Payload['v2']['gates'];
  } = {},
): Done {
  const payload: V2Chain3Payload = {
    input: chainInput(c, opts.settingsExtra ?? {}),
    v2: { gates: opts.gates ?? {}, budgets: {}, determinism: { seed: 51, budgetEvaluations: 80 }, ...(opts.facts ?? {}) },
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
    /* ...and with the goal met (a loose one) the same configuration is NOT
     * refused on the X-rule — a met goal is never this rule's business.
     *
     * A5e.3b (c3) — WHAT IT IS REFUSED ON INSTEAD, since level-work/1.2, and
     * the arm is sharper for it: under the loose goal the tune barely moves,
     * the parts audit finds the trap's capacitor inert and removes it, and
     * what stands is a BARE shunt L from the woofer bus to ground (measured
     * here: L5, 14.28 mH) — no resonance, so a load and not a filter element,
     * and the orphan refusal names its own ground. Deterministic (A5e.4):
     * same fixture, same options, same outcome. The X-claim of this arm is
     * unchanged and asserted the sharp way — whatever refuses here, it is not
     * the level-work gap. */
    const loose = through(c, NONE, { facts: { gapBudgetDbByModel: { woofer: X }, gapAnchorModel: 'mid' }, staged: { rippleDb: 60, phaseDeg: 180 } });
    expect(loose.rejection?.reason ?? '').not.toContain('dB of level work on the lowest way');
    expect(loose.rejection?.reason ?? '').toContain('without a resonance');
    expect(loose.rejection?.reason ?? '').toContain('refused since A5e.3-veld');
  }, 300_000);
});

/* ================================================================== *
 * V51b — series resistance up to a stated maximum, no pad
 * ================================================================== */

/**
 * V51b — THE SECOND STATED STATE OF THE SAME KEY.
 *
 *  1. THE DERIVATION. A stated maximum declares `{ kind: 'series-r-max',
 *     maxOhm }`; it WINS over the blanket prohibition (the narrower statement);
 *     an explicit value still wins over both; nothing is derived from nothing.
 *     The value moves the fingerprint, and so does the number inside it.
 *  2. THE BOX. A `stated-series-r` bound takes the `qes-series-r` shape: the
 *     coils' DCR is charged against the maximum first and the free resistors
 *     share what is left; a way without a free series resistor gets the note.
 *  3. IT REACHES THE SYNTHESIS (V23). On the lifted-woofer fixture the capped
 *     arm delivers ONE plain series resistor on the lowest way, no shunt pad,
 *     with the total (discrete + DCR) inside the maximum — and its network
 *     differs from both the `'none'` and the `'allowed'` arm. The column
 *     carries the maximum and a passing verdict; the bound is reported.
 *  4. Y AND THE REFUSAL. With the driver sweeps handed over and a floor the
 *     capped network cannot reach, the gate refuses; the worker then solves
 *     what the floor ASKS of the lowest way's series resistance (Y) on the
 *     refused network, and when Y exceeds the maximum the refusal names it and
 *     `kinds` carries `topology` beside `gate`. With a floor the network meets,
 *     nothing is refused and Y is the delivered total.
 */

import { searchBoxFor, type InvertedBound } from './bounds.ts';
import { freezeGateReference, type MeasuredSweep } from './gates.ts';
import { seriesResistanceForFloor, withSeriesResistanceInFront } from './worker.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover } from '../../parsers/vxp.ts';
import { AMP_FLOOR_TOLERANCE } from '../../impedanceFloor.ts';

const MAX_OHM = 1.0;
const CAPPED = declareCandidateChainChoices({ stated: {}, lowestWaySeriesRMaxOhm: MAX_OHM });

/** A paper part: one primitive between two grid points (the `levelWork.test.ts` helpers). */
let paperN = 0;
const paper = (type: 'Resistor' | 'Capacitor' | 'Inductor', value: number, a: [number, number], b: [number, number], extra: { name: string; value: number }[] = []): VxpPart => {
  const name = type === 'Resistor' ? 'R' : type === 'Capacitor' ? 'C' : 'L';
  paperN++;
  return {
    type,
    partId: `${name}${paperN}`,
    params: [{ name, value }, ...extra],
    wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }],
  } as unknown as VxpPart;
};
const paperSource = (): VxpPart =>
  ({ type: 'Generator', partId: 'G1', params: [{ name: 'Rg', value: 0.01 }], wires: [{ x: 0, y: 0 }, { x: 0, y: 10 }] }) as unknown as VxpPart;
const paperGround = (): VxpPart => ({ type: 'Ground', partId: 'GND', params: [], wires: [{ x: 0, y: 10 }] }) as unknown as VxpPart;
const paperDriver = (model: string, a: [number, number], b: [number, number]): VxpPart =>
  ({ type: 'Driver', partId: `D-${model}`, model, params: [], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }) as unknown as VxpPart;
const paperRail = (xs: number[]): VxpPart =>
  ({ type: 'Wire', partId: 'W1', params: [], wires: xs.map((x) => ({ x, y: 10 })) }) as unknown as VxpPart;

/** The fixture's driver sweeps as the facts payload carries them (F4b2 shape). */
function sweepFacts(): Pick<MeasurementFactsPayload, 'impedanceByModel'> {
  const of = (raw: string) => {
    const z = parseZma(raw);
    return { grid: [...z.freq], magnitude: [...z.magnitude], phaseDeg: [...z.phase], validHz: [z.freq[0], z.freq[z.freq.length - 1]] as [number, number] };
  };
  const mid = of(load('mid_Backwavecone_sheep75gram.ZMA'));
  return { impedanceByModel: { woofer: mid, mid: of(load('mid_Backwavecone_sheep75gram.ZMA')), tweeter: of(load('tweeter.ZMA')) } };
}

describe('V51b — series resistance on the lowest way up to a stated maximum, no pad', () => {
  it('derives series-r-max from a stated maximum, which wins over the prohibition; an explicit value wins; the number moves the fingerprint', () => {
    expect(CAPPED.stated.lowestWayLevelWork).toEqual({ kind: 'series-r-max', maxOhm: MAX_OHM });
    // The narrower statement wins over the blanket prohibition.
    expect(
      declareCandidateChainChoices({ stated: {}, lowestWayLevelWorkForbidden: true, lowestWaySeriesRMaxOhm: MAX_OHM }).stated.lowestWayLevelWork,
    ).toEqual({ kind: 'series-r-max', maxOhm: MAX_OHM });
    // An explicit value wins over both.
    expect(
      declareCandidateChainChoices({ stated: { lowestWayLevelWork: 'none' }, lowestWaySeriesRMaxOhm: MAX_OHM }).stated.lowestWayLevelWork,
    ).toBe('none');
    // Nothing from nothing: a non-number is not a maximum.
    expect(declareCandidateChainChoices({ stated: {}, lowestWaySeriesRMaxOhm: Number.NaN }).stated.lowestWayLevelWork).toBeUndefined();
    for (const d of [CAPPED]) expect(chainDeclarationCoverage(d).complete).toBe(true);
    const k = (d: ChainChoiceDeclaration) => JSON.stringify(chainDeclarationKey(d));
    expect(k(CAPPED)).not.toBe(k(NONE));
    expect(k(CAPPED)).not.toBe(k(ABSENT));
    expect(k(CAPPED)).not.toBe(k(ALLOWED));
    // The NUMBER is part of the identity, not only the mode.
    expect(k(CAPPED)).not.toBe(k(declareCandidateChainChoices({ stated: {}, lowestWaySeriesRMaxOhm: MAX_OHM * 2 })));
    expect(k(CAPPED)).toBe(k(declareCandidateChainChoices({ stated: {}, lowestWaySeriesRMaxOhm: MAX_OHM })));
  });

  it('the box: a stated-series-r bound charges the coil DCR first and caps the free resistors with what is left', () => {
    /* Paper network: (0,0) —L1 (DCR 0.3)— (10,0) —R2 0.5— (20,0) —D-woofer— gnd;
     *                (0,0) —C3— (30,0) —D-tweeter— gnd.  Maximum 1.0 Ω on woofer. */
    paperN = 0;
    const parts: VxpPart[] = [
      paperSource(),
      paperGround(),
      paper('Inductor', 1, [0, 0], [10, 0], [{ name: 'DCR', value: 0.3 }]),
      paper('Resistor', 0.5, [10, 0], [20, 0]),
      paperDriver('woofer', [20, 0], [20, 10]),
      paper('Capacitor', 4, [0, 0], [30, 0]),
      paperDriver('tweeter', [30, 0], [30, 10]),
      paperRail([0, 20, 30]),
    ];
    const bound: InvertedBound = {
      rule: 'stated-series-r',
      subject: 'woofer',
      quantity: 'total series resistance (stated maximum, coil DCR included)',
      maxSI: MAX_OHM,
      unit: 'Ω',
      slack: false,
      parameters: { stated_max_ohm: MAX_OHM },
      notes: [],
    };
    const box = searchBoxFor(parts, [bound]);
    expect(box.valueSumCeilings).toHaveLength(1);
    expect(box.valueSumCeilings[0].ids).toEqual(['R2']);
    expect(box.valueSumCeilings[0].maxSI).toBe(MAX_OHM);
    expect(box.valueSumCeilings[0].fixedSI).toBeCloseTo(0.3, 9);
    // The per-part ceiling is what the DCR leaves: 1.0 − 0.3.
    expect(box.valueCeilings.R2).toBeCloseTo(0.7, 9);
    // A way with NO free series resistor gets the note and no group: the coil alone feeds the woofer.
    paperN = 0;
    const noR: VxpPart[] = [
      paperSource(),
      paperGround(),
      paper('Inductor', 1, [0, 0], [20, 0], [{ name: 'DCR', value: 0.3 }]),
      paperDriver('woofer', [20, 0], [20, 10]),
      paper('Capacitor', 4, [0, 0], [30, 0]),
      paperDriver('tweeter', [30, 0], [30, 10]),
      paperRail([0, 20, 30]),
    ];
    const box2 = searchBoxFor(noR, [bound]);
    expect(box2.valueSumCeilings).toHaveLength(0);
    expect(box2.notes.some((n) => /no free series resistor/.test(n))).toBe(true);
  });

  it('reaches the synthesis: ONE plain series R on the lowest way within the maximum, no pad — and a different network from none and allowed', () => {
    const c = oneCandidate();
    const capped = through(c, CAPPED);
    const inv = levelWorkOnWay(capped.result.parts, 'woofer');
    expect(inv.reachable).toBe(true);
    expect(inv.shuntPads).toEqual([]);
    expect(inv.seriesResistors.length, 'the capped arm did not place a series resistor on the lowest way').toBe(1);
    expect(inv.totalSeriesOhm).toBeGreaterThan(0);
    expect(inv.totalSeriesOhm).toBeLessThanOrEqual(MAX_OHM + 1e-9);
    // Not the same network as either V51 arm.
    const none = through(c, NONE);
    const allowed = through(c, ALLOWED);
    expect(netOf(capped.result)).not.toBe(netOf(none.result));
    expect(netOf(capped.result)).not.toBe(netOf(allowed.result));
    // The column and the bound.
    expect(capped.levelWork.requirement).toEqual({ kind: 'series-r-max', maxOhm: MAX_OHM });
    expect(capped.levelWork.maxSeriesOhm).toBe(MAX_OHM);
    expect(capped.levelWork.verdict?.ok).toBe(true);
    expect(capped.levelWork.delivered?.totalSeriesOhm).toBeCloseTo(inv.totalSeriesOhm, 9);
    expect(capped.rejection).toBeNull();
    const bound = capped.bounds.find((b) => b.rule === 'stated-series-r');
    expect(bound, 'the stated maximum was not filed in the box').toBeDefined();
    expect(bound!.subject).toBe('woofer');
    expect(bound!.maxSI).toBe(MAX_OHM);
    expect(capped.notes.some((n) => /LIMITED by the project/.test(n) && /build choice/.test(n))).toBe(true);
    // No floor stated on this run: Y is not solved (P2 — no extra solves).
    expect(capped.levelWork.floorNeedsSeriesOhm).toBeNull();
    expect(capped.levelWork.floorOhm).toBeNull();
  }, 400_000);

  it('Y by hand: on a network whose minimum IS the lowest way, the probe finds the extra series resistance the floor asks — and 0 where the floor is met', () => {
    /* Paper network with FLAT, RESISTIVE drivers so the answer is one line of
     * algebra. Woofer 4 Ω behind a 1 mH coil, tweeter 8 Ω behind a 10 µF cap:
     * at the low end the tweeter branch is open and the system is the woofer's
     * 4 Ω; at the high end the woofer branch is open and the system is the
     * tweeter's 8 Ω; in between the two branches in parallel sit above both
     * (at 1592 Hz: (4+10j)‖(8−10j) ≈ 11.5 Ω). The minimum is therefore the
     * woofer's 4 Ω, and R extra in front of it lifts that end to 4 + R. A
     * floor of 6 Ω passes at 0.98 × 6 = 5.88 Ω (the gate's own tolerance,
     * `meetsAmpFloor`), so the probe should land on R ≈ 1.88 Ω. */
    paperN = 0;
    const parts: VxpPart[] = [
      paperSource(),
      paperGround(),
      paper('Inductor', 1, [0, 0], [10, 0]),
      paperDriver('woofer', [10, 0], [10, 10]),
      paper('Capacitor', 10, [0, 0], [20, 0]),
      paperDriver('tweeter', [20, 0], [20, 10]),
      paperRail([0, 10, 20]),
    ];
    const grid = logspace(100, 10000, 48);
    const sweepGrid = logspace(20, 20000, 60);
    const flatZ = (ohm: number, n: number) => Array.from({ length: n }, () => fromPolar(ohm, 0));
    const flatSweep = (ohm: number): MeasuredSweep => ({
      grid: [...sweepGrid],
      magnitude: sweepGrid.map(() => ohm),
      phaseDeg: sweepGrid.map(() => 0),
      validHz: [sweepGrid[0], sweepGrid[sweepGrid.length - 1]],
    });
    const netlist = crossoverToNetlist({ name: 'y-by-hand', parts: [...parts] } as VxpCrossover).netlist;
    const reference = freezeGateReference({
      netlist,
      grid: [...grid],
      driverZ: { woofer: flatZ(4, grid.length), tweeter: flatZ(8, grid.length) },
      branchDb: { woofer: grid.map(() => 90), tweeter: grid.map(() => 90) },
      fsHz: { woofer: 50, tweeter: 1500 },
      validHz: { woofer: [grid[0], grid[grid.length - 1]], tweeter: [grid[0], grid[grid.length - 1]] },
      sweeps: { woofer: flatSweep(4), tweeter: flatSweep(8) },
    });
    expect(reference.impedanceAbsent).toBeNull();
    const asks = seriesResistanceForFloor(parts, 'woofer', { ampMinLoadOhm: 6 }, reference);
    expect(asks.extraOhm, asks.why ?? '').not.toBeNull();
    expect(asks.extraOhm!).toBeCloseTo(6 * (1 - AMP_FLOOR_TOLERANCE) - 4, 2);
    // A floor the bare network meets asks nothing more.
    expect(seriesResistanceForFloor(parts, 'woofer', { ampMinLoadOhm: 3.5 }, reference)).toEqual({ extraOhm: 0, why: null });
    // A floor no series resistance on THIS way can reach (the tweeter's 8 Ω caps the high end) says so, and why.
    const beyond = seriesResistanceForFloor(parts, 'woofer', { ampMinLoadOhm: 9 }, reference);
    expect(beyond.extraOhm).toBeNull();
    expect(beyond.why).toMatch(/another way/);
    // The insertion itself: one node more, the driver moved behind the probe resistor, nothing else touched.
    const probed = withSeriesResistanceInFront(netlist, 'woofer', 2)!;
    expect(probed.nodeCount).toBe(netlist.nodeCount + 1);
    expect(probed.elements.length).toBe(netlist.elements.length + 1);
    expect(withSeriesResistanceInFront(netlist, 'no-such-way', 2)).toBeNull();
  });

  it('Y on the route: a floor the capped network cannot reach refuses through the gate, and the column says what the probe found — here that the minimum sits in another way', () => {
    const c = oneCandidate();
    const facts = sweepFacts();
    /* First the capped network judged WITHOUT a floor, to read its own minimum
     * |Z| off the gate (inactive with a value, P4) — no number is typed here. */
    const judged = through(c, CAPPED, { facts });
    const zRow = judged.gates.find((v) => v.gate === 'M-B/|Z|');
    expect(zRow?.value, 'the floor gate reported no value with the sweeps handed over').not.toBeNull();
    const minZ = zRow!.value as number;
    const floor = Number((minZ * 1.5).toFixed(2));
    const refused = through(c, CAPPED, { facts, gates: { ampMinLoadOhm: floor } });
    expect(refused.rejection, 'the capped candidate was not refused on the floor').toBeTruthy();
    expect(refused.rejection!.kinds).toContain('gate');
    expect(refused.levelWork.floorOhm).toBe(floor);
    // The refused tune stayed inside the box: no pad, total within the maximum.
    expect(refused.levelWork.delivered?.shuntPads).toEqual([]);
    expect(refused.levelWork.delivered!.totalSeriesOhm).toBeLessThanOrEqual(MAX_OHM + 1e-9);
    /* On THIS fixture the woofer and the mid are the same driver file, and the
     * system minimum is not the woofer's: the probe reports that rather than a
     * number, the column stays null, and — because the cap is then NOT what
     * stands between this candidate and the floor — `topology` is not added
     * to the refusal. The hand-calculated claim above is where Y is a number. */
    const yNote = refused.notes.find((n) => /^Y \(V51b\)/.test(n));
    expect(yNote, refused.notes.filter((n) => /V51b/.test(n)).join(' | ')).toBeDefined();
    if (refused.levelWork.floorNeedsSeriesOhm === null) {
      expect(yNote).toMatch(/another way/);
      expect(refused.rejection!.kinds).not.toContain('topology');
    } else {
      expect(refused.levelWork.floorNeedsSeriesOhm).toBeGreaterThan(MAX_OHM);
      expect(refused.rejection!.kinds).toContain('topology');
      expect(refused.rejection!.reason).toMatch(/asks .* Ω of series resistance on the lowest way/);
    }
    // V31 shape: nothing buildable leaves.
    expect(refused.result.parts).toEqual([]);
    /* The counter-proof: a floor the network meets refuses nothing, and Y is
     * then the delivered total — the floor asks no more. */
    const met = through(c, CAPPED, { facts, gates: { ampMinLoadOhm: Number((minZ * 0.5).toFixed(2)) } });
    expect(met.rejection).toBeNull();
    expect(met.levelWork.floorNeedsSeriesOhm).toBeCloseTo(met.levelWork.delivered!.totalSeriesOhm, 9);
  }, 600_000);
});
