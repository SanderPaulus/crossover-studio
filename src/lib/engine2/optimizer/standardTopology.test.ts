/**
 * G-15 — THE STANDARD FILTER (12-11-2026).
 *
 * Sander: "een 'standaard' filter keuze voor een 2e, 3e en 4e orde filter
 * waarbij we geen LCR's of iets dergelijks gaan maken maar gewoon het
 * standaard filter optimizen met de juiste waardes en componenten."
 *
 * The eighth chain key, `topology: 'standard'`: the textbook ladder of the
 * chosen order per branch plus the level work it needs, no EQ band, no
 * correction network, no staged pass, no part audit — the topology locked
 * and the values tuned. The claims: the declaration (absent = free, never a
 * stated 'free'; the choice stated; an explicit value wins; coverage
 * complete), the translation to BOTH chains, the choice helpers, the
 * polarity arms of a 3rd-order handover (no textbook: both), and the real
 * route on the small two-way fixture — a standard run delivers nothing but
 * ladder and pad, and the free run beside it buys a correction.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../../dsp.ts';
import { fromPolar } from '../../complex.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import { defaultEq, defaultHpLp } from '../../filters.ts';
import type { ChainInput, ChainResult } from '../../designChain.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';
import {
  CHAIN_CHOICE_KEYS,
  chainDeclarationCoverage,
  chainSettingsForTwoWay,
  withDeclaredChainChoices,
  type ChainCandidateChoices,
} from './chainChoices.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './candidateDeclaration.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './worker.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import {
  describePolarityArmsChoice,
  describeTopologyChoice,
  fieldModeSettings,
  topologyChoiceOf,
  TOPOLOGY_CHOICES,
} from '../predesign/fieldMode.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';

describe('G-15 — the declaration', () => {
  it('is the eighth chain key, ABSENT by default with the P4 reason, never a stated "free"', () => {
    expect(CHAIN_CHOICE_KEYS).toContain('topology');
    const d = declareCandidateChainChoices({ stated: {} });
    expect(d.stated.topology).toBeUndefined();
    const a = d.absent.find((x) => x.key === 'topology');
    expect(a?.why).toMatch(/P4/);
    expect(chainDeclarationCoverage(d).complete).toBe(true);
  });

  it('states "standard" when the designer chose it, an explicit value wins, and the coverage still closes', () => {
    const s = declareCandidateChainChoices({ stated: {}, standardTopology: true });
    expect(s.stated.topology).toBe('standard');
    expect(s.absent.some((x) => x.key === 'topology')).toBe(false);
    expect(chainDeclarationCoverage(s).complete).toBe(true);
    const e = declareCandidateChainChoices({ stated: { topology: 'free' }, standardTopology: true });
    expect(e.stated.topology).toBe('free');
  });

  it('reaches BOTH chains under one name, and a declaration without it is the identity', () => {
    const std = declareCandidateChainChoices({ stated: {}, standardTopology: true });
    const free = declareCandidateChainChoices({ stated: {} });
    const input: { settings: Partial<ChainCandidateChoices> } = { settings: { eqBands: 2 } };
    expect(withDeclaredChainChoices(input, std).settings.topology).toBe('standard');
    expect(withDeclaredChainChoices(input, free).settings).not.toHaveProperty('topology');
    expect(chainSettingsForTwoWay(std).topology).toBe('standard');
    expect(chainSettingsForTwoWay(free)).not.toHaveProperty('topology');
  });

  it('the stored string reads as free unless it says standard, and the run line names what each does', () => {
    expect(topologyChoiceOf('')).toBe('free');
    expect(topologyChoiceOf(undefined)).toBe('free');
    expect(topologyChoiceOf('nonsense')).toBe('free');
    expect(topologyChoiceOf('standard')).toBe('standard');
    expect([...TOPOLOGY_CHOICES]).toEqual(['free', 'standard']);
    expect(describeTopologyChoice('standard')).toContain('STANDARD FILTER');
    expect(describeTopologyChoice('standard')).toContain('no EQ band');
    expect(describeTopologyChoice('free')).toContain('FREE');
    /* The textbook-arms sentence is true under both topologies: under free no
     * mirrored arm is built; under standard a third-order handover runs both,
     * and the sentence says so instead of contradicting the field line. */
    expect(describePolarityArmsChoice('textbook')).toContain('no mirrored arm is built.');
    expect(describePolarityArmsChoice('textbook', 'standard')).toContain('third-order handover');
    expect(describePolarityArmsChoice('textbook', 'standard')).not.toContain('no mirrored arm is built.');
  });
});

/* A window with the floor and ceiling stated directly (the candidates test's
 * own helper), so the arms claim is about the alignment and nothing else. */
const flatWindow = (lower: string, upper: string, floorHz: number, ceilingHz: number): XoWindowInput => ({
  lower,
  upper,
  order: 4,
  validityFloorHz: floorHz,
  validityFloorSource: 'test',
  upperFsHz: null,
  lowerBreakups: [],
  lowerMinus6Hz: ceilingHz,
  lowerMinus6AngleDeg: 30,
  spacingMm: null,
});

describe('G-15 — a 3rd-order handover has no textbook polarity, so the standard filter runs both arms', () => {
  const windowInputs = [flatWindow('woofer', 'mid', 300, 600), flatWindow('mid', 'tweeter', 1600, 3200)];
  const perPair = [{ statedOrder: 3 }, { statedOrder: 4 }];
  const one = { stepsPerAxis: 1, pairs: 2 };

  it('under the standard filter the BW3 handover is mirrored and the LR4 one is not; under free nothing moves (P2)', () => {
    const std = buildCandidateField({
      windowInputs,
      perPair,
      alignments: AUTO_STRUCTS,
      ...fieldModeSettings('full', one, undefined, 'textbook', 'standard'),
    });
    expect(std.field.candidates.map((c) => c.crossings.map((x) => `${x.alignment.kind}${x.alignment.order}`))).toEqual([
      ['BW3', 'LR4'],
      ['BW3', 'LR4'],
    ]);
    const arms = std.field.candidates.map((c) => c.polarity!);
    expect(arms.map((p) => p.arm)).toEqual(['textbook', 'mirror']);
    expect(arms.map((p) => [...p.relativeInverted])).toEqual([
      [false, false],
      [true, false],
    ]);
    const free = buildCandidateField({
      windowInputs,
      perPair,
      alignments: AUTO_STRUCTS,
      ...fieldModeSettings('full', one, undefined, 'textbook'),
    });
    expect(free.field.candidates).toHaveLength(1);
    expect(free.field.candidates[0].polarity!.arm).toBe('textbook');
    /* The policy without the topology is the policy as it was: no new key. */
    expect(fieldModeSettings('full', one, undefined, 'textbook').polarityArms).not.toHaveProperty('mirrorWhereNoTextbook');
    expect(fieldModeSettings('full', one, undefined, 'textbook', 'free').polarityArms).not.toHaveProperty('mirrorWhereNoTextbook');
  });
});

/* ------------------------------------------------------------------ *
 * The real route: the small two-way fixture of `h2bLeanForm.test.ts`.
 * ------------------------------------------------------------------ */
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
/* A seed with a deep EQ cut on the tweeter: under FREE the design step keeps
 * it and the synthesis builds a notch for it; under STANDARD no EQ band
 * exists and nothing but the ladder (and its pad) is built. */
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
function twoWayInput(): ChainInput {
  return {
    grid: [...GRID],
    w: gFrd(load('mid_hor0_mettape.txt')),
    t: gFrd(load('tweet_hor0_mettape.txt')),
    driverZ: { mid: gZ(load('mid_Backwavecone_sheep75gram.ZMA')), tweeter: gZ(load('tweeter.ZMA')) },
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: seed(),
    settings: { ...SETTINGS, structurePreference: { kind: 'LR', order: 4 } },
    xoRange: [1600, 2600],
  };
}
function through(standard: boolean): { result: ChainResult; measurements: CandidateMeasurements } {
  const payload: V2ChainOnePayload = {
    input: twoWayInput(),
    label: standard ? 'standard' : 'free',
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: declareCandidateChoices({
        cages: [[1600, 2600]],
        windowFloorsHz: [1000],
        multiWay: true,
        /* BOTH arms state the staged pass and an enabled audit, exactly as the
         * app does on every run (`scanRequest.ts`): the standard filter has to
         * win over them from the chain layer, not by the caller leaving them
         * out. */
        stated: {
          band: BAND,
          staged: SETTINGS.targets,
          audit: { enabled: true },
          ampTarget: SETTINGS.ampTarget,
          powerMetric: SETTINGS.powerMetric,
          phaseMetric: SETTINGS.phaseMetric,
          catalogSnap: SETTINGS.catalogSnap,
          breakupGuard: SETTINGS.breakupGuard,
          zFloorStrict: true,
        },
      }),
      chainDeclaration: declareCandidateChainChoices({ stated: {}, ...(standard ? { standardTopology: true } : {}) }),
      provenance: 'this test',
      orderByModel: { tweeter: 4 },
    },
  };
  const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
  let out: { result: ChainResult; measurements: CandidateMeasurements } | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as { result: ChainResult; measurements: CandidateMeasurements };
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return out;
}
const CORRECTION = /notch|zobel|trap|hold|shelf|bypass/i;
const rolesOf = (r: ChainResult) => [...r.synthWoofer.components, ...r.synthTweeter.components].map((c) => c.role);

describe('G-15 — through the real route', () => {
  it('the standard filter delivers the ladder and its level work and NOTHING else: no correction, no prune, no add, no audit', () => {
    const r = through(true).result;
    const roles = rolesOf(r);
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) expect(role, role).not.toMatch(CORRECTION);
    /* Topology locked: the tuner moved values and removed or added nothing. */
    expect(r.net.removed).toEqual([]);
    expect(r.net.added).toEqual([]);
    expect(r.net.audit).toBeUndefined();
    expect(r.net.tuned).toBeGreaterThan(0);
    /* Every delivered part is one the synthesis proposed: the same count. */
    expect(r.parts.filter((p) => /^(Resistor|Inductor|Capacitor)$/.test(p.type)).length).toBe(roles.length);
  });

  it('the counter-proof: the FREE run on the same seed buys a correction the standard one does not', () => {
    const free = through(false).result;
    const std = through(true).result;
    expect(rolesOf(free).some((role) => CORRECTION.test(role))).toBe(true);
    expect(rolesOf(free).length).toBeGreaterThan(rolesOf(std).length);
  });
});
