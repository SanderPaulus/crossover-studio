/**
 * F4d ACCEPTANCE — the generated candidate, through the route the app takes.
 *
 * `handleV2Request` → `runThreeWayChain`, payload round-tripped through
 * `structuredClone` exactly as `postMessage` serialises it. The discipline
 * `borderFacts.test.ts` established and the §2.2 erratum insists on: a claim
 * about `runV2Optimization` is a claim about a function nothing in the app
 * calls.
 *
 * FOUR THINGS ARE PINNED HERE, and the first is the delivery:
 *
 *  1. NOTHING IS INHERITED ANY MORE. The F4c note that began "Search choices
 *     still inherited from the v1 chain" cannot appear on a payload that
 *     carries a candidate, and every key it used to name is now declared —
 *     stated, absent with a reason, or delegated to a named stage.
 *  2. THE DECLARATION REACHES THE TUNER. Not "is present in the payload":
 *     a candidate that states a different judged band delivers a demonstrably
 *     different network. A channel with no effect is a channel that reports
 *     nothing, which is exactly how leak 3 survived three phases.
 *  3. TWO RUNS, ONE SEED, BYTE-IDENTICAL — on this route, with a generated
 *     field. A5e.4, checked where it counts.
 *  4. THE SEED STILL DOES NOT REACH THE SEARCH, and after F4d that is a
 *     DECISION rather than an accident. Diversity comes from candidates: a
 *     candidate is a choice a designer can read and disagree with, a jittered
 *     start is chance. The assertion from `workerRouteRegression.test.ts` is
 *     kept and restated here with its new reason, never quietly dropped.
 *
 * COST. The chain runs are the expensive part, so the grid is small and the
 * evaluation budget is tight — the cheapest run that still exercises design,
 * synthesis and the assembled tune with the hook in it. A regression nobody
 * runs because it is slow protects nothing.
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
import { stableJson } from './determinism.ts';
import {
  declareCandidateChainChoices,
  declareCandidateChoices,
} from './candidateDeclaration.ts';
import { declarationCoverage } from './choices.ts';
import { buildCandidateField, candidateFieldKey } from '../predesign/candidateField.ts';
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

/**
 * Two feasible windows, stated rather than derived.
 *
 * The point of THIS file is the border, not the derivation — `candidates.test.ts`
 * and `flankOrder.test.ts` own the derivation, on windows whose arithmetic can
 * be checked by hand. Stating the windows here keeps the two concerns apart and
 * makes the candidate frequencies predictable enough to assert on.
 */
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

/** The field, generated once. Two positions per axis at one order each. */
function field() {
  return buildCandidateField({
    windowInputs,
    perPair: [{ statedOrder: 4 }, { statedOrder: 4 }],
    alignments: AUTO_STRUCTS,
    minSpacingOctaves: 1,
  });
}

const SETTINGS = {
  phasePriority: 0.5,
  synthMode: 'filter' as const,
  band: [250, 18000] as [number, number],
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

/** The declaration the app builds beside one generated candidate. */
function declarationFor(c: GeneratedCandidate, bandOverride?: [number, number]) {
  return {
    declaration: declareCandidateChoices({
      cages: c.crossings.map((x) => x.cageHz),
      windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
      multiWay: true,
      stated: {
        band: bandOverride ?? SETTINGS.band,
        ampTarget: SETTINGS.ampTarget,
        powerMetric: SETTINGS.powerMetric,
        phaseMetric: SETTINGS.phaseMetric,
        catalogSnap: SETTINGS.catalogSnap,
        breakupGuard: SETTINGS.breakupGuard,
        zFloorStrict: true,
      },
    }),
    /* V41 — the chain-level half. Nothing stated, so the derivation applies:
     * the app's own EQ budget and `synthesize`'s own lean threshold. */
    chainDeclaration: declareCandidateChainChoices({ stated: {} }),
    provenance: c.provenance,
    orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
  };
}

interface Delivered {
  result: Chain3Result;
  notes: string[];
  bounds: unknown;
}

/* One chain run is the expensive thing in this file, and several assertions
 * legitimately ask for the SAME run. Caching on the arguments keeps the file
 * affordable while every assertion still names the run it wants.
 *
 * ONE CALLER MUST NOT USE IT, and the exception is the whole point of having
 * written it down: "two runs with one seed are byte-identical" is a claim about
 * two RUNS. Served from a cache it would compare an object with itself and pass
 * forever, whatever the code did. That test passes `fresh`. */
const cache = new Map<string, Delivered>();

function throughTheRoute(
  c: GeneratedCandidate,
  seed: number,
  opts: { withCandidate?: boolean; band?: [number, number]; fresh?: boolean } = {},
): Delivered {
  const key = stableJson([c.label, seed, { ...opts, fresh: undefined }]);
  const hit = opts.fresh ? undefined : cache.get(key);
  if (hit) return hit;
  const payload: V2Chain3Payload = {
    input: chainInput(c),
    v2: { gates: {}, budgets: {}, determinism: { seed, budgetEvaluations: 120 } },
    ...(opts.withCandidate === false ? {} : { candidate: declarationFor(c, opts.band) }),
  };
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  let out: Delivered | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as Delivered;
  });
  if (!out) throw new Error('the worker produced no result');
  cache.set(key, out);
  return out;
}

/** Everything about a delivered network a behaviour change would move. */
const delivered = (d: Delivered): string =>
  stableJson({
    parts: d.result.parts,
    xoLow: d.result.xoLow,
    xoHigh: d.result.xoHigh,
    after: d.result.net.after,
    evaluations: d.result.net.evaluations,
  });

/* ================================================================== *
 * The field itself
 * ================================================================== */

describe('F4d — the generated field', () => {
  const f = field();

  it('produces candidates, all of them inside their windows', () => {
    expect(f.field.candidates.length).toBeGreaterThan(1);
    for (const c of f.field.candidates) {
      for (const x of c.crossings) {
        expect(x.hz).toBeGreaterThanOrEqual(x.windowHz[0]);
        expect(x.hz).toBeLessThanOrEqual(x.windowHz[1]);
      }
    }
  });

  it('is a pure function of its inputs — two generations are byte-identical', () => {
    // The field is upstream of everything else in this file: if it moved
    // between runs, no determinism claim below would mean anything.
    expect(stableJson(candidateFieldKey(field().field))).toBe(
      stableJson(candidateFieldKey(f.field)),
    );
  });

  it('every candidate declares all twenty-five choice keys', () => {
    for (const c of f.field.candidates) {
      const cover = declarationCoverage(declarationFor(c).declaration);
      expect(cover.missing).toEqual([]);
      expect(cover.duplicated).toEqual([]);
    }
  });
});

/* ================================================================== *
 * Through the route
 * ================================================================== */

describe('F4d — the candidate crosses the border and the inheritance note is gone', () => {
  const f = field();
  const first = f.field.candidates[0];
  const run = throughTheRoute(first, 4242);

  it('the run says where the candidate came from', () => {
    expect(run.notes.join(' ')).toContain('Candidate provenance (A5d)');
    expect(run.notes.join(' ')).toContain('position 1 of');
    expect(run.notes.join(' ')).toContain('window floor');
  });

  it('NO key is reported as still inherited from the v1 chain', () => {
    // The F4c sentence, and the whole point of F4d is that it cannot appear.
    expect(run.notes.join(' ')).not.toContain('still inherited from the v1 chain');
  });

  it('the keys that have no value are DECLARED absent, with reasons', () => {
    const notes = run.notes.join(' ');
    expect(notes).toContain('Declared ABSENT by the candidate');
    // The solo family and the single-axis pin: absent, not forgotten.
    expect(notes).toContain('solo');
    expect(notes).toContain('xoRange');
    expect(notes).toContain('xoPinHard');
  });

  it('the keys another stage owns are DELEGATED, with the stage named', () => {
    const notes = run.notes.join(' ');
    expect(notes).toContain('Delegated by the candidate to a named stage');
    expect(notes).toContain('branchTargets');
    expect(notes).toContain('design step');
    expect(notes).toContain('angleData');
  });

  it('a payload WITHOUT a candidate still reports the inherited keys — the old route is intact', () => {
    /* The two-way chain is still v1 (TODO(F2c)), so a caller with no pre-design
     * layer must not be handed an invented candidate. That route keeps the F4c
     * behaviour exactly, and this is the assertion that says so. */
    const bare = throughTheRoute(first, 4242, { withCandidate: false });
    expect(bare.notes.join(' ')).toContain('still inherited from the v1 chain');
    expect(bare.notes.join(' ')).not.toContain('Declared ABSENT by the candidate');
  });
});

describe('F4d — the declaration REACHES the tuner rather than merely riding along', () => {
  const f = field();
  const c = f.field.candidates[0];

  it('a candidate that judges a different band delivers a different network', () => {
    /* The strong form of the claim. A channel that is present but has no effect
     * reports nothing — that is precisely how the damping-margin note survived
     * three phases unread (V23). `band` is a choice key, the chain passes its
     * own through verbatim, and the hook merges LAST, so a candidate that
     * states a different one must win. */
    const wide = throughTheRoute(c, 4242, { band: [250, 18000] });
    const narrow = throughTheRoute(c, 4242, { band: [600, 6000] });
    expect(delivered(narrow)).not.toBe(delivered(wide));
    expect(delivered(wide).length).toBeGreaterThan(500);
  });
});

describe('A5e.4 on this route, after F4d', () => {
  const f = field();
  const c = f.field.candidates[0];

  it('two runs, one seed, one candidate: byte-identical', () => {
    // BOTH sides are fresh, so this compares two runs rather than one run with
    // itself — see the note on the cache above.
    const a = delivered(throughTheRoute(c, 4242, { fresh: true }));
    const b = delivered(throughTheRoute(c, 4242, { fresh: true }));
    expect(b).toBe(a);
    expect(a.length).toBeGreaterThan(500);
  });

  it('the SEED does not reach the search — and after F4d that is a decision', () => {
    /* Confirmed rather than removed (the F4c measurement, `workerRouteRegression`).
     * What changed at F4d is the REASON: the chain runs once per candidate and
     * the jittered start lives in `run.ts`, and F4d decided that is where it
     * should stay. Diversity comes from candidates — a candidate is a choice, a
     * jittered start is chance, and a field assembled out of chance cannot be
     * spread over topology classes because nothing decided its topology.
     *
     * A change that let the seed through would break this line, which is what
     * it is for. */
    expect(delivered(throughTheRoute(c, 4242))).toBe(delivered(throughTheRoute(c, 99)));
  });

  it('a different CANDIDATE does reach the search — the field is where variety lives now', () => {
    // The other half, and the one that would make the assertion above harmless
    // on its own: something has to reach the search, or nothing is being tested.
    const other = f.field.candidates[f.field.candidates.length - 1];
    expect(other.label).not.toBe(c.label);
    expect(delivered(throughTheRoute(other, 4242))).not.toBe(delivered(throughTheRoute(c, 4242)));
  });
});
