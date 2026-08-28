/**
 * V41 ACCEPTANCE — the two chain-level choice keys, through the route the app
 * takes.
 *
 * FIVE CLAIMS, and the third carries the rest.
 *
 *  1. THE LISTS ARE COVERED. `declareCandidateChainChoices` puts every key of
 *     `CHAIN_CHOICE_KEYS` in exactly one state, and the coverage check is what
 *     says so — a third key added to the list without a case fails here rather
 *     than falling silently back to the chain settings.
 *  2. NEITHER VALUE IS INVENTED, AND AN EXPLICIT ONE WINS. The derivation is
 *     the two ENGINE defaults (`DEFAULT_EQ_BANDS_PER_DRIVER`,
 *     `SYNTHESIS_LEAN_DEFAULT_DB`), read from where they live rather than typed
 *     here; a stated value overrides both, so V41's before/after is a run
 *     somebody can ask for rather than a build that has to be patched.
 *  3. THE DECLARATION REACHES THE DESIGN AND SYNTHESIS STEPS. Not "is present
 *     in the payload": the same candidate, the same seed and the same budget
 *     deliver a demonstrably DIFFERENT network under the two arms. Without this
 *     the other four claims are equally true of a key wired to nothing, which is
 *     exactly how leak 3 survived three phases (V23).
 *  4. STATING THE INHERITED VALUES IS EXACTLY WHAT THE CHAIN DID. An arm whose
 *     declaration states the old numbers is BYTE-IDENTICAL to an arm that
 *     states nothing and lets the chain settings carry them. That is what makes
 *     claim 3 a statement about these two keys and not about some other
 *     difference between the two payloads.
 *  5. THE KEYS MOVE THE FINGERPRINT. Two runs that differ only in what the
 *     design step was allowed to build are two different runs (A5e.4).
 *
 * COST. Three chain runs on the small fixture `candidateRoute.test.ts` uses,
 * with a tight evaluation budget — the cheapest run that still exercises the
 * design step, the synthesis step and the assembled tune with the hook in it.
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
import { SYNTHESIS_LEAN_DEFAULT_DB } from '../../synthesis.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from '../../vfOptimizer.ts';
import type { Chain3Input, Chain3Result } from '../../threeWayChain.ts';
import { stableJson } from './determinism.ts';
import {
  declareCandidateChainChoices,
  declareCandidateChoices,
} from './candidateDeclaration.ts';
import {
  CHAIN_CHOICE_KEYS,
  chainDeclarationCoverage,
  chainDeclarationKey,
  withDeclaredChainChoices,
  type ChainChoiceDeclaration,
} from './chainChoices.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { GeneratedCandidate } from '../predesign/candidates.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from './worker.ts';

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
  {
    lower: 'woofer',
    upper: 'mid',
    order: 4,
    validityFloorHz: 400,
    validityFloorSource: 'stated by this test',
    upperFsHz: null,
    lowerBreakups: [],
    lowerMinus6Hz: 800,
    lowerMinus6AngleDeg: 30,
    spacingMm: null,
  },
  {
    lower: 'mid',
    upper: 'tweeter',
    order: 4,
    validityFloorHz: 2000,
    validityFloorSource: 'stated by this test',
    upperFsHz: null,
    lowerBreakups: [],
    lowerMinus6Hz: 4000,
    lowerMinus6AngleDeg: 30,
    spacingMm: null,
  },
];

function oneCandidate(): GeneratedCandidate {
  const f = buildCandidateField({
    windowInputs,
    perPair: [{ statedOrder: 4 }, { statedOrder: 4 }],
    alignments: AUTO_STRUCTS,
    minSpacingOctaves: 1,
  });
  return f.field.candidates[0];
}

/**
 * `targets` IS STATED, and it has to be: it is what puts the synthesis step in
 * `'lean'` mode at all. With no targets the chain runs `'auto'`, every branch
 * buys whatever the measurement warrants, and `leanTargetDb` is never read —
 * an arm on which this file's central claim could not fail.
 */
const SETTINGS = {
  phasePriority: 0.5,
  synthMode: 'filter' as const,
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

/** The values the chain carried before V41: no EQ budget, lean = the stop goal. */
const INHERITED = { eqBands: 0, leanTargetDb: SETTINGS.targets.rippleDb };

function chainInput(c: GeneratedCandidate, settingsExtra: object = {}): Chain3Input {
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
      ...settingsExtra,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
}

function tunerDeclaration(c: GeneratedCandidate) {
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
  });
}

function through(
  c: GeneratedCandidate,
  chainDeclaration: ChainChoiceDeclaration,
  settingsExtra: object = {},
): Chain3Result {
  const payload: V2Chain3Payload = {
    input: chainInput(c, settingsExtra),
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: tunerDeclaration(c),
      chainDeclaration,
      provenance: c.provenance,
      orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
    },
  };
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  let out: { result: Chain3Result } | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as { result: Chain3Result };
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return (out as { result: Chain3Result }).result;
}

/** The delivered network, as a comparable value. */
const netOf = (r: Chain3Result) =>
  stableJson(
    r.parts.map((p) => ({
      id: p.partId ?? '',
      type: p.type,
      v: p.params.map((q) => [q.name, q.value]),
      at: p.wires.map((w) => `${w.x},${w.y}`).join(';'),
    })),
  );

describe('V41 — the chain-level choice keys', () => {
  it('declares every key in the list, in exactly one state', () => {
    const cover = chainDeclarationCoverage(declareCandidateChainChoices({ stated: {} }));
    expect(cover.missing).toEqual([]);
    expect(cover.duplicated).toEqual([]);
    expect(cover.complete).toBe(true);
    // The list itself, so a key that is added without a case fails here rather
    // than in a run nobody reads.
    expect([...CHAIN_CHOICE_KEYS].sort()).toEqual(['eqBands', 'leanTargetDb']);
  });

  it('derives the two ENGINE defaults, and an explicit value wins', () => {
    const derived = declareCandidateChainChoices({ stated: {} });
    expect(derived.stated.eqBands).toBe(DEFAULT_EQ_BANDS_PER_DRIVER);
    expect(derived.stated.leanTargetDb).toBe(SYNTHESIS_LEAN_DEFAULT_DB);
    // Not a casus number and not the staged stop goal: the two values above are
    // read from where the engines keep them, and the derived lean threshold is
    // demonstrably NOT what the chain used to substitute.
    expect(derived.stated.leanTargetDb).not.toBe(SETTINGS.targets.rippleDb);

    const stated = declareCandidateChainChoices({
      stated: { eqBands: 4, leanTargetDb: 1.25 },
    });
    expect(stated.stated.eqBands).toBe(4);
    expect(stated.stated.leanTargetDb).toBe(1.25);
  });

  it('is the identity on a run without a declaration (P2)', () => {
    const input = { settings: { eqBands: 3, leanTargetDb: 9 } };
    expect(withDeclaredChainChoices(input, undefined)).toBe(input);
    // A declaration that states nothing is the identity too: absent means "this
    // design has no opinion", not "set it to nothing".
    expect(withDeclaredChainChoices(input, { stated: {}, absent: [] })).toBe(input);
    expect(
      withDeclaredChainChoices(input, declareCandidateChainChoices({ stated: {} })).settings,
    ).toEqual({ eqBands: DEFAULT_EQ_BANDS_PER_DRIVER, leanTargetDb: SYNTHESIS_LEAN_DEFAULT_DB });
  });

  it('moves the fingerprint ingredient', () => {
    const a = JSON.stringify(chainDeclarationKey(declareCandidateChainChoices({ stated: {} })));
    const b = JSON.stringify(
      chainDeclarationKey(declareCandidateChainChoices({ stated: INHERITED })),
    );
    expect(a).not.toBe(b);
    // Same declaration twice is the same ingredient — otherwise the assert
    // above would be true of any two objects.
    expect(a).toBe(
      JSON.stringify(chainDeclarationKey(declareCandidateChainChoices({ stated: {} }))),
    );
  });

  it('reaches the design and synthesis steps, and the inherited arm reproduces', () => {
    const c = oneCandidate();
    // The v2 route since V41: the engines' own defaults.
    const v2 = through(c, declareCandidateChainChoices({ stated: {} }));
    // The values the chain carried before V41, STATED by the candidate.
    const oldStated = through(c, declareCandidateChainChoices({ stated: INHERITED }));
    // The same values arriving the way they used to — through the chain
    // settings, with the candidate stating nothing at the chain layer.
    const oldInherited = through(c, { stated: {}, absent: [] }, { eqBands: INHERITED.eqBands });

    // Claim 4: stating the inherited values IS what the chain did.
    expect(netOf(oldStated)).toBe(netOf(oldInherited));
    // Claim 3: and the v2 arm is a demonstrably different network. Without
    // this, claim 4 is equally true of two keys wired to nothing.
    expect(netOf(v2)).not.toBe(netOf(oldStated));
  });
});
