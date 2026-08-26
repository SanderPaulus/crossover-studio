/**
 * F2b ACCEPTANCE — the route the scan button actually takes.
 *
 * The F2 determinism test proved that `runV2Optimization` is reproducible.
 * That is a claim about a function; this is a claim about the ROUTE, and they
 * are not the same statement. The scan button posts a message to the v2 worker,
 * which builds the gate reference, inverts the budgets, runs the chain with the
 * hook and evaluates the delivered network. Every one of those steps is a place
 * a run can stop being reproducible, and none of them is exercised by calling
 * the optimiser directly.
 *
 * So the request goes through `handleV2Request` — the whole worker body, minus
 * three lines of `self.onmessage` wiring — with the payload ROUND-TRIPPED
 * THROUGH `structuredClone` first, exactly as `postMessage` would serialise it.
 * What is left untested is the browser's own message plumbing, which is not
 * ours to test.
 */

import { describe, expect, it } from 'vitest';
import { stableJson } from './determinism.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './worker.ts';
import { v2DriverZ, v2Responses, V2_GRID } from './v2.fixture.ts';
import type { ChainInput } from '../../designChain.ts';
import { defaultHpLp } from '../../filters.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/**
 * A small two-way chain: one round, no catalog snap, a narrow band.
 *
 * Deliberately the cheapest run that still exercises every stage — design,
 * synthesis, the assembled tune with the gate hook in it. A reproducibility
 * test that took ten minutes would be run once and then skipped.
 */
function chainInput(): Omit<ChainInput, 'xoRange'> {
  return {
    grid: [...V2_GRID],
    w: wBase,
    t: tBase,
    driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: {
      woofer: {
        gainDb: 0,
        hp: defaultHpLp(80),
        lp: { ...defaultHpLp(2000), enabled: true },
        eq: [],
      },
      tweeter: {
        gainDb: 0,
        hp: { ...defaultHpLp(2000), enabled: true },
        lp: defaultHpLp(18000),
        eq: [],
      },
    },
    settings: {
      phasePriority: 0.3,
      eqBandsPerDriver: 0,
      band: [400, 15000],
      synthMode: 'acoustic',
      maxRounds: 1,
    },
  };
}

function request(seed: number): V2ChainOnePayload {
  return {
    input: { ...chainInput() },
    label: 'route',
    v2: {
      gates: { maxDissipationFraction: 0.5 },
      budgets: {},
      determinism: { seed, starts: 1, budgetEvaluations: 150 },
    },
  };
}

/** Run one request the way the client does: serialise, hand over, collect. */
function throughTheWorker(payload: V2ChainOnePayload): { done: unknown; progress: number } {
  // The same serialisation `postMessage` performs. A payload that survives the
  // structured clone in the test but not in the browser would make this whole
  // file a reassurance rather than a check.
  const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
  let done: unknown = null;
  let progress = 0;
  const post = (m: V2Response) => {
    if (m.kind === 'progress') progress++;
    else if (m.kind === 'done') done = m.data;
    else throw new Error(m.message);
  };
  handleV2Request(wire, post);
  return { done, progress };
}

/** Everything one candidate produced, in a stable key order. */
const serialise = (done: unknown): string => {
  const c = done as {
    result: { parts: unknown; net: { after: unknown; before: unknown; tuned: number; evaluations: number } };
    gates: unknown;
    gatesDerived: unknown;
    violation: string | null;
    bounds: unknown;
    gateRefusals: string[];
  };
  return stableJson({
    parts: c.result.parts,
    after: c.result.net.after,
    before: c.result.net.before,
    tuned: c.result.net.tuned,
    evaluations: c.result.net.evaluations,
    gates: c.gates,
    gatesDerived: c.gatesDerived,
    violation: c.violation,
    bounds: c.bounds,
    gateRefusals: c.gateRefusals,
  });
};

describe('F2b - determinism THROUGH the v2 worker route', () => {
  const first = throughTheWorker(request(4242));

  it('same input and same seed: two passes through the route are byte-identical', () => {
    const second = throughTheWorker(request(4242));
    const a = serialise(first.done);
    const b = serialise(second.done);
    expect(b).toBe(a);
    // ...and the route really did something. Two empty strings compare equal
    // forever, which is the failure mode this line exists for.
    expect(a.length).toBeGreaterThan(500);
    expect(first.progress).toBeGreaterThan(0);
  });

  it('the route judges the delivered network, and says so per candidate', () => {
    const c = first.done as { gates: { gate: string; active: boolean }[]; gatesDerived: unknown[] };
    expect(c.gates.length).toBeGreaterThan(0);
    expect(c.gatesDerived).not.toHaveLength(0);
    // The gate that WAS stated is the one judging; the others report and stop.
    const ma = c.gates.find((v) => v.gate === 'M-A')!;
    expect(ma.active).toBe(true);
    expect(c.gates.find((v) => v.gate === 'M-B/EPDR')!.active).toBe(false);
  });

  it('an unstated gate leaves the delivered network alone', () => {
    // P2 again, now on the worker route: with no limit armed at all the
    // candidate must be the one the chain would have produced on its own.
    const bare = structuredClone(request(4242));
    bare.v2.gates = {};
    const withoutGates = throughTheWorker(bare);
    const c = withoutGates.done as { gates: { active: boolean }[]; gateRefusals: string[] };
    expect(c.gates.every((v) => !v.active)).toBe(true);
    expect(c.gateRefusals).toEqual([]);
  });
});
