/**
 * F2b — WHAT THE GATE COSTS A RUN, counted rather than timed.
 *
 * A timing assert measures the machine that happens to run it; a count
 * measures the thing that was actually changed. So this file asserts on the
 * instrumentation hook, and the wall-clock numbers live in the commit message
 * where they belong.
 *
 * Two properties, and they are the two halves of the fix:
 *
 *  · VETO-LAST — the gate is asked about a step that is otherwise about to be
 *    taken, never about every trial a pass considers. The prune sweep alone
 *    tunes up to eight removals per round over up to twenty rounds; asking the
 *    gate about each of those would be a network solve per trial.
 *  · CACHED, RUN-SCOPED — a verdict is a pure function of the parts array
 *    while the reference and the limits are fixed, and the passes revisit the
 *    same shapes. The cache is created inside the run and dies with it.
 *
 * The assert is deliberately an INEQUALITY against the number of questions,
 * not a magic number: what must hold is that evaluations never exceed
 * questions and that repeats are free. Pinning an exact count would pin the
 * tuner's search path, which is not what this test is about.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/** A gate that counts how often it is really asked to compute an answer. */
function countingGate() {
  const computed: string[] = [];
  return {
    computed,
    violation: (parts: readonly VxpPart[]): string | null => {
      // The identity has to include the VALUES, not just the ids. Keyed on
      // ids alone every candidate of one topology looks like the same network,
      // and the uniqueness assert below would pass on a cache that never hit
      // once — the first version of this helper did exactly that.
      computed.push(
        parts
          .map((p) => `${p.partId ?? p.type}:${p.params.map((q) => q.value).join('/')}:${p.open ? 'o' : ''}${p.shorted ? 's' : ''}`)
          .join(','),
      );
      return null; // never refuses: this test is about COST, not verdicts
    },
  };
}

function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(
    v2SeedParts(),
    V2_GRID,
    wBase,
    tBase,
    driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    {
      phasePriority: 0.5,
      staged: { rippleDb: 1.5, phaseDeg: 8 },
      maxIterations: 200,
      ...extra,
    },
  );
}

describe('F2b - the gate is asked once per step, and never twice for one network', () => {
  const gate = countingGate();
  const questions: { step: string; cached: boolean }[] = [];
  const result = run({
    gateViolation: gate.violation,
    onGateEvaluated: (info) => questions.push(info),
  });

  it('the run really did ask (an untested counter would sit at zero forever)', () => {
    expect(questions.length).toBeGreaterThan(0);
    expect(result.gateEvaluations).toBeGreaterThan(0);
  });

  it('evaluations never exceed questions, and the difference IS the cache', () => {
    const hits = questions.filter((q) => q.cached).length;
    expect(result.gateCacheHits).toBe(hits);
    expect(result.gateEvaluations! + result.gateCacheHits!).toBe(questions.length);
    expect(result.gateEvaluations).toBeLessThanOrEqual(questions.length);
    // The hook's count and the gate's own count are the same event, seen from
    // two sides. If these ever disagree, one of them is lying about the run.
    expect(gate.computed.length).toBe(result.gateEvaluations);
  });

  it('one network is evaluated ONCE, however often it is asked about', () => {
    // The property the cache exists for, checked directly rather than through
    // a total: no two evaluations may describe the same circuit.
    expect(new Set(gate.computed).size).toBe(gate.computed.length);
  });

  it('the cache is RUN-SCOPED: a second run starts cold', () => {
    // A module-level cache would make this run cheaper than the first, which
    // is exactly the cross-run reuse that lets a gate answer for the wrong
    // network — and it would make reproducibility depend on invalidation.
    const second = countingGate();
    const r2 = run({ gateViolation: second.violation });
    expect(r2.gateCacheHits).toBeGreaterThanOrEqual(0);
    expect(second.computed.length).toBe(r2.gateEvaluations);
    expect(second.computed.length).toBeGreaterThan(0);
    // Same input, same run shape: the second run asks and evaluates exactly
    // what the first did. Nothing carried over.
    expect(r2.gateEvaluations).toBe(result.gateEvaluations);
  });

  it('VETO-LAST: the prune sweep asks about far fewer networks than it tunes', () => {
    // The saving this ordering buys. The sweep retunes up to eight removals
    // per round; the gate may only hear about the ones that survive every
    // quality rule, so the questions it gets must stay far below the number of
    // networks the sweep actually built.
    const pruneQuestions = questions.filter((q) => q.step.startsWith('prune ')).length;
    expect(pruneQuestions).toBeLessThanOrEqual(result.evaluations);
    // ...and the whole run's gate questions are bounded by its accepted steps
    // plus the handful of fixed checkpoints (value tune, barrier, drift,
    // repair, snap, final). A run that asked thousands of times would mean the
    // gate had slipped back into the search.
    expect(questions.length).toBeLessThan(200);
  });

  it('with no gate supplied the counters are absent, not zero', () => {
    // Absent means "this run had no gate", zero would mean "it had one and
    // never asked" — different claims, and only one of them is true on v1.
    const v1 = run({});
    expect(v1.gateEvaluations).toBeUndefined();
    expect(v1.gateCacheHits).toBeUndefined();
    expect(v1.gateRefusals).toBeUndefined();
  });
});
