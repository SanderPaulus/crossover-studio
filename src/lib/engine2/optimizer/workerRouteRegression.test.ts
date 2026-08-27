/**
 * F4c ACCEPTANCE, PART TWO — the regression on the route the app actually takes.
 *
 * `f4cRegression.test.ts` pins `runV2Optimization`, and the §2.2 erratum in the
 * audit says why that is not enough: nothing in the app calls that function. The
 * scan button goes `handleV2Request` → `runThreeWayChain`, where the CHAIN
 * builds the tuner options out of `Chain3Settings` and merges the engine hook
 * last. A regression on the unused path is a regression on an unused path.
 *
 * So this file pins the other one, through the real entry, with the payload
 * round-tripped through `structuredClone` exactly as `postMessage` serialises it
 * — the discipline `borderFacts.test.ts` established.
 *
 * THE TWO FORMS, and how they are isolated.
 *
 *   INHERITED (the F4b2 form) — `runThreeWayChain` with NO v2 hook at all: the
 *       options object is purely what the chain built from its settings.
 *   STATED (the F4c form)     — the real route, where the hook restates ten
 *       choices and five weights on top of that object.
 *
 * Gates and budgets are EMPTY in the payload on purpose. With nothing armed the
 * pre-F4c hook returned `{}` exactly — no gate closure, no value ceilings, no
 * `maxIterations` — so the only difference between the two forms is F4c's
 * restating. Arming a gate would make the comparison measure F2 as well as F4c,
 * and a controlled comparison is worth more here than a representative one.
 *
 * WHAT IT MEASURED: byte-identical. Every key the hook restates is one the chain
 * passes through verbatim from `s.*` (`threeWayChain.ts:360–396`), so restating
 * it sets the same value twice. The keys the chain TRANSFORMS — `staged` from
 * `s.targets`, `xoRangePairs` from the candidate's own cage — are deliberately
 * not restated, and that is the reason.
 *
 * WHAT ELSE IT MEASURED, and it was not the question asked: on this route the
 * SEED does not reach the search. The chain runs once and there is no jittered
 * start — that lives in `run.ts`. Both seed rows in the fixture are therefore
 * identical, which is recorded rather than tidied away: a change that let the
 * seed through would be a real behaviour change, and this is where it would
 * show.
 *
 * COST. One chain run is about eighty seconds and that is the search itself, not
 * the grid or the part audit (both were measured). So exactly ONE live run
 * happens here; every other assertion reads the file. A regression that nobody
 * runs because it is slow protects nothing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../../dsp.ts';
import { fromPolar } from '../../complex.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import type { Chain3Input, Chain3Result } from '../../threeWayChain.ts';
import { stableJson } from './determinism.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from './worker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', 'parsers', 'fixtures');
const BASELINE_PATH = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'f4b2_v2_worker_baseline.json');

interface Baseline {
  stand: string;
  route: string;
  grid: { van_hz: number; tot_hz: number; punten: number };
  kandidaat: { xoLow: number; xoHigh: number };
  settings: Record<string, unknown>;
  seeds: number[];
  bevinding_seed: string;
  runs: Record<string, { inherited: unknown; stated: unknown }>;
}

const BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline;

/* The measurement set and the grid come from the FIXTURE, so a baseline made on
 * 96 points can never be compared against a run on 200. */
const grid = logspace(BASELINE.grid.van_hz, BASELINE.grid.tot_hz, BASELINE.grid.punten);
const load = (n: string) => readFileSync(join(FIXTURES, n), 'utf-8');
const gFrd = (raw: string): GriddedResponse => {
  const f = parseFrd(raw);
  return resample(f.freq, f.spl, f.phase, grid);
};
const gZ = (raw: string) => {
  const z = parseZma(raw);
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};

const chainInput = (): Chain3Input => ({
  grid: [...grid],
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
  xoLow: BASELINE.kandidaat.xoLow,
  xoHigh: BASELINE.kandidaat.xoHigh,
  label: `${BASELINE.kandidaat.xoLow}/${BASELINE.kandidaat.xoHigh} Hz`,
  settings: BASELINE.settings as unknown as Chain3Input['settings'],
});

/** Everything about the delivered network a behaviour change would move. */
const delivered = (r: Chain3Result): string =>
  stableJson({
    parts: r.parts,
    xoLow: r.xoLow,
    xoHigh: r.xoHigh,
    after: r.net.after,
    before: r.net.before,
    tuned: r.net.tuned,
    evaluations: r.net.evaluations,
    removed: r.net.removed,
    added: r.net.added,
    zOk: r.zOk,
  });

/** One run through the real worker entry, serialised the way the client does. */
function throughTheRoute(seed: number): string {
  const payload: V2Chain3Payload = {
    input: chainInput(),
    v2: { gates: {}, budgets: {}, determinism: { seed } },
  };
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  let out: Chain3Result | null = null;
  handleV2Request(wire, (msg: V2Response) => {
    if (msg.kind === 'error') throw new Error(msg.message);
    if (msg.kind === 'done') out = (msg.data as { result: Chain3Result }).result;
  });
  if (!out) throw new Error('the worker produced no result');
  return delivered(out);
}

const storedStated = (seed: number) => stableJson(BASELINE.runs[String(seed)].stated);
const storedInherited = (seed: number) => stableJson(BASELINE.runs[String(seed)].inherited);

describe('F4c — the worker route delivers what it delivered', () => {
  it('the baseline file is the one this test thinks it is', () => {
    expect(BASELINE.route).toContain('handleV2Request');
    expect(BASELINE.seeds).toEqual([4242, 99]);
    expect(Object.keys(BASELINE.runs).sort()).toEqual(['4242', '99']);
    // A network of four parts would mean the chain fell over and every
    // comparison below would be comparing two failures.
    const parts = (BASELINE.runs['4242'].stated as { parts: unknown[] }).parts;
    expect(parts.length).toBeGreaterThan(6);
  });

  it('stating the choices changed nothing: inherited === stated, on both seeds', () => {
    /* THE F4c CLAIM, on the route the app takes. Read from the file rather than
     * recomputed, so it stays a statement about what was measured rather than
     * about what today's build happens to produce. */
    for (const seed of BASELINE.seeds) {
      expect(storedInherited(seed), `seed ${seed}`).toBe(storedStated(seed));
    }
  });

  it('the seed does not reach the search on this route, and the fixture says so', () => {
    // Not the question that was asked, but it is what the measurement found and
    // it is worth pinning: the chain runs once and the jittered start lives in
    // `run.ts`. A change that let the seed through would break this.
    expect(storedStated(4242)).toBe(storedStated(99));
    expect(BASELINE.bevinding_seed).toContain('bereikt de seed de zoektocht NIET');
  });

  it('today the real route still reproduces the stored network', () => {
    // The one live run. Eighty seconds, and it is the only thing here that can
    // catch a change in the tuner, the chain, the bounds or the search box.
    expect(throughTheRoute(4242)).toBe(storedStated(4242));
  }, 300_000);
});
