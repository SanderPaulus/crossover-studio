/**
 * DELIVERABLE 1, ACCEPTANCE — the A5e.4 decision, tested.
 *
 * Three claims, and the third is the one that is usually skipped:
 *
 *  1. SAME INPUT + SAME SEED = BYTE-IDENTICAL. Two full runs inside one
 *     process, serialised with sorted keys and compared character for
 *     character. No tolerance: an epsilon here would hide exactly the class
 *     of drift the claim exists to exclude.
 *  2. A DIFFERENT SEED MAY DIFFER — and, more usefully, DOES. "May differ" is
 *     satisfied by a seed that changes nothing at all, which would make the
 *     whole seed policy decorative, so the test asserts the seed actually
 *     reaches the search.
 *  3. THE FINGERPRINT MOVES WITH EVERY COMPONENT IT IS MADE OF. Walked
 *     component by component rather than spot-checked: a fingerprint that
 *     ignores one of its ingredients is worse than no fingerprint, because it
 *     licenses the conclusion "same fingerprint, same run".
 */

import { describe, expect, it } from 'vitest';
import { selectEngine } from '../facade.ts';
import {
  fingerprintComponents,
  fingerprintOf,
  resolveDeterminism,
  stableJson,
  stream,
  type FingerprintInput,
} from './determinism.ts';
import { DEFAULT_RUN_SEED, DEFAULT_RUN_STARTS } from '../constants.ts';
import { runV2Optimization, EngineSelectionError, type V2OptimizeResult } from './run.ts';
import { v2DriverZ, v2GateReference, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const ON = selectEngine(true);
const reference = v2GateReference();
const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/** A full v2 run at a given seed. Small budget: this test is about identity. */
function run(seed: number, starts = 2): V2OptimizeResult {
  return runV2Optimization({
    selection: ON,
    seedParts: v2SeedParts(),
    grid: V2_GRID,
    wBase,
    tBase,
    driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    tuneOptions: { phasePriority: 0.3 },
    determinism: { seed, starts, budgetEvaluations: 120 },
    gateReference: reference,
  });
}

/** Everything a run produced, in a stable key order. */
function serialise(r: V2OptimizeResult): string {
  return stableJson({
    fingerprint: r.fingerprint,
    determinism: r.determinism,
    candidates: r.candidates.map((c) => ({
      label: c.label,
      start: c.start,
      parts: c.parts,
      after: c.net.after,
      before: c.net.before,
      tuned: c.net.tuned,
      evaluations: c.net.evaluations,
      removed: c.net.removed,
      added: c.net.added,
      gatesFrozen: c.gatesFrozen,
      gatesDerived: c.gatesDerived,
    })),
    rejected: r.rejected,
    searchBox: r.searchBox,
  });
}

describe('A5e.4 - the v2 optimisation path is deterministic', () => {
  it('the facade is a GUARD: the v2 path refuses to run on a v1 selection', () => {
    expect(() =>
      runV2Optimization({
        selection: selectEngine(false),
        seedParts: v2SeedParts(),
        grid: V2_GRID,
        wBase,
        tBase,
        driverZ,
        adjust: { offsetMm: 0, trimDb: 0, inverted: false },
        gateReference: reference,
      }),
    ).toThrow(EngineSelectionError);
  });

  it('same input, same seed: two runs are byte-identical', () => {
    const a = serialise(run(4242));
    const b = serialise(run(4242));
    expect(b).toBe(a);
    // ...and the runs really produced something. Two empty strings compare
    // equal forever, which is the failure mode this line exists for.
    expect(a.length).toBeGreaterThan(1000);
    expect(JSON.parse(a).candidates.length).toBeGreaterThan(0);
  });

  it('a different seed MAY differ - and demonstrably does reach the search', () => {
    const a = run(4242);
    const b = run(99);
    expect(b.fingerprint).not.toBe(a.fingerprint);
    // The seed is only a policy if it changes what is searched. Compare the
    // DELIVERED values: two seeds that produce identical networks would mean
    // the starting points never mattered.
    const valuesOf = (r: V2OptimizeResult): string =>
      stableJson(
        r.candidates.map((c) =>
          c.parts
            .filter((p) => p.partId)
            .map((p) => `${p.partId}:${p.params.map((q) => q.value).join('/')}`),
        ),
      );
    expect(valuesOf(b)).not.toBe(valuesOf(a));
  });

  it('the seed policy: absent means the published default, and it is reported', () => {
    // Not P4's absent-means-off, and the difference is argued in the module
    // header: for a seed, "off" would mean "not reproducible".
    const d = resolveDeterminism({});
    expect(d.seed).toBe(DEFAULT_RUN_SEED);
    expect(d.seedSource).toBe('default');
    expect(d.starts).toBe(DEFAULT_RUN_STARTS);
    // The budget DOES follow absent-means-absent: the tuner's own policy.
    expect(d.budgetEvaluations).toBeNull();
    expect(resolveDeterminism({ budgetEvaluations: 500 }).budgetEvaluations).toBe(500);
    expect(resolveDeterminism({ seed: 7 }).seedSource).toBe('project');
  });

  it('the budget is a setting, and it visibly bounds the effort spent', () => {
    // The dead-knob test (A7) for the budget: a smaller budget must cost
    // fewer evaluations, or it is not a budget.
    const small = run(4242, 1);
    const large = runV2Optimization({
      selection: ON,
      seedParts: v2SeedParts(),
      grid: V2_GRID,
      wBase,
      tBase,
      driverZ,
      adjust: { offsetMm: 0, trimDb: 0, inverted: false },
      tuneOptions: { phasePriority: 0.3 },
      determinism: { seed: 4242, starts: 1, budgetEvaluations: 600 },
      gateReference: reference,
    });
    const evals = (r: V2OptimizeResult): number =>
      [...r.candidates, ...[]].reduce((s, c) => s + c.net.evaluations, 0);
    expect(evals(large)).toBeGreaterThan(evals(small));
  });

  /* ================= the fingerprint ================= */

  const base = {
    determinism: resolveDeterminism({ seed: 1, starts: 2, budgetEvaluations: 100 }),
    design: 'design-A',
    measurements: 'measure-A',
    gates: 'gates-A',
    bounds: 'bounds-A',
    tuning: 'tuning-A',
  };

  it('the fingerprint changes with EVERY component it is made of', () => {
    const original = fingerprintComponents(base);
    const originalText = fingerprintOf(original);

    // Each mutation below has to move the fingerprint. Walked rather than
    // spot-checked: the point is a statement about every ingredient.
    const mutations: { name: string; input: FingerprintInput }[] = [
      { name: 'seed', input: { ...base, determinism: { ...base.determinism, seed: 2 } } },
      {
        name: 'budget',
        input: { ...base, determinism: { ...base.determinism, budgetEvaluations: 101 } },
      },
      { name: 'starts', input: { ...base, determinism: { ...base.determinism, starts: 3 } } },
      { name: 'design', input: { ...base, design: 'design-B' } },
      { name: 'measurements', input: { ...base, measurements: 'measure-B' } },
      { name: 'gates', input: { ...base, gates: 'gates-B' } },
      { name: 'bounds', input: { ...base, bounds: 'bounds-B' } },
      { name: 'tuning', input: { ...base, tuning: 'tuning-B' } },
      // F2b: how the run ENDED is an ingredient too — an aborted run must
      // never fingerprint-match a completed one. This entry exists because the
      // coverage assert below refused the build without it, which is exactly
      // what that assert is for.
      { name: 'status', input: { ...base, status: 'aborted' } },
    ];
    for (const m of mutations) {
      expect(fingerprintOf(fingerprintComponents(m.input)), `${m.name} did not move the fingerprint`)
        .not.toBe(originalText);
    }

    // Every component named in the fingerprint has a mutation above, and every
    // mutation names a component. Without this the list can grow a component
    // nobody tests and the loop above stays green.
    const covered = new Set(mutations.map((m) => m.name));
    const engineOwned = new Set(['engine', 'estimators']);
    for (const c of original) {
      if (engineOwned.has(c.name)) continue;
      expect(covered.has(c.name), `fingerprint component "${c.name}" has no mutation test`).toBe(true);
    }
    // The two engine-owned components are still ASSERTED to be there: they
    // move on a version or an estimator bump, which no test can simulate
    // without lying about the version.
    expect(original.map((c) => c.name)).toEqual(
      expect.arrayContaining(['engine', 'estimators']),
    );
    for (const c of original) expect(c.describe.length).toBeGreaterThan(10);
  });

  it('every result carries its fingerprint, and it is the run that produced it', () => {
    const r = run(4242);
    expect(r.fingerprint).toContain('seed=4242');
    expect(r.fingerprint).toBe(fingerprintOf(r.fingerprintComponents));
    expect(r.fingerprintComponents.length).toBeGreaterThanOrEqual(10);
  });

  /* ================= the generator ================= */

  it('the generator is a pure function of (seed, stream name)', () => {
    const a = stream(7, 'starts');
    const b = stream(7, 'starts');
    const seq = (f: () => number) => Array.from({ length: 8 }, f);
    expect(seq(b)).toEqual(seq(a));
    expect(seq(stream(8, 'starts'))).not.toEqual(seq(stream(7, 'starts')));
    // Different STREAMS of the same seed are independent — which is what lets
    // a second consumer be added without moving the first one's sequence.
    expect(seq(stream(7, 'other'))).not.toEqual(seq(stream(7, 'starts')));
    for (const v of seq(stream(7, 'starts'))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('stable serialisation does not depend on property order', () => {
    expect(stableJson({ a: 1, b: { d: 2, c: 3 } })).toBe(stableJson({ b: { c: 3, d: 2 }, a: 1 }));
    // A non-finite number must serialise rather than become null, or two
    // different failures look like the same one.
    expect(stableJson({ x: Infinity })).toContain('Infinity');
  });
});
