/**
 * E-5c — WHAT THE TWO COST CHOICES DO, AND WHAT THEY MUST NOT DO.
 *
 * The staged pass spends its time in two places this session measured
 * (`scripts/measure-e5c-prune-anatomy.ts`, casus 1, one candidate, 1834 s):
 *
 *  · STRUCTURE RETUNES — the value re-fit around one structural change. Not
 *    one of them ever met its tolerance; all four ran to their ceiling. What
 *    they did do is ARRIVE: within 1 % of their own final value after 1522,
 *    2006, 1989 and 2385 of 4047–4213 evaluations. `structureRetune: 'capped'`
 *    stops at that measured tail (`STRUCTURE_RETUNE_CAP_ITERATIONS`).
 *  · A REPEATED FIT — the basin challenge and the drift catch behind it reseed
 *    to the SAME vector (`reseedOutliers` resets outliers to exactly textbook,
 *    so two starting points reach one point) and the run fits it twice, every
 *    intermediate objective value equal to nine decimals, for 323 s.
 *    `repeatedTune: 'reuse'` serves the second from a run-scoped memo.
 *
 * THE CLAIMS, and the ones that carry the file are 5 and 9 — the invariant.
 * A cost choice that changed the answer would not be a cost choice, and
 * "cheaper" is easy to get by being worse. Everything else here exists to stop
 * claims 5 and 9 from being trivially true of a key that does nothing.
 *
 * WHY A SEPARATE SEED FOR THE MEMO. The duplicate needs two conditions at
 * once: the seed must HAVE outliers (else `reseedOutliers` returns null and no
 * challenge runs at all) and the run must still be sitting on the seed when
 * the drift catch reseeds (else it reseeds a tuned vector and lands somewhere
 * else). On casus 1 both hold. `driftedSeed` + a refusing gate is the cheapest
 * fixture that reproduces them, and claim 8 asserts it actually does rather
 * than assuming it.
 */

import { describe, expect, it } from 'vitest';
import {
  STRUCTURE_RETUNE_CAP_ITERATIONS,
  optimizeNetworkValues,
  reseedOutliers,
  type NetOptimizeOptions,
  type NetOptimizeResult,
} from '../../netOptimizer.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/* Loose enough that the staged pass PRUNES rather than escalates — measured:
 * at the fixture's own 1.5 dB / 8° it never reaches `meets()` and the prune
 * sweep, which is what this file is about, never runs. */
const TARGETS = { rippleDb: 6, phaseDeg: 60 } as const;

/** The structure budget for a given `maxIterations`: `tune`'s own formula at
 *  the 0.6 scale the staged pass uses. Written here so a reader can see WHY
 *  the two budgets below sit either side of the cap. */
const structureBudget = (maxIterations: number): number =>
  Math.max(200, Math.round(maxIterations * 0.6));

/** A budget the cap actually bites into, and one it cannot. */
const BITES = 5000;
const INERT = 120;

function run(maxIterations: number, extra: Partial<NetOptimizeOptions>): NetOptimizeResult {
  return optimizeNetworkValues(
    v2SeedParts(),
    V2_GRID,
    wBase,
    tBase,
    driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    { phasePriority: 0.5, maxIterations, staged: { ...TARGETS }, ...extra },
  );
}

/** Everything about a delivered network a cost choice must not move. */
const shape = (r: NetOptimizeResult): string =>
  JSON.stringify(
    r.parts.map((p) => [
      p.partId ?? p.type,
      p.open ?? false,
      p.shorted ?? false,
      p.params.map((q) => [q.name, q.value]),
    ]),
  );

/** The delivered value of every tunable part, by id. */
const values = (r: NetOptimizeResult): Map<string, number[]> =>
  new Map(
    r.parts
      .filter((p) => p.partId !== undefined && !p.open && !p.shorted)
      .map((p) => [p.partId!, p.params.map((q) => q.value)] as const),
  );

/**
 * How far the two arms' delivered values may disagree.
 *
 * NOT a number pulled out of the air, and not a byte comparison either. The
 * prune's own acceptance rule already lets a removal cost up to 10 % of the
 * objective, so two runs that strip the same parts are ALLOWED to sit a
 * measurable distance apart and still both be correct. This asserts they stay
 * two orders inside that — and when this was measured they agreed EXACTLY, on
 * every arm and both budgets. The class is here so that a machine where the
 * capped arm lands on a neighbouring point fails on the size of the difference
 * rather than on its existence (V46: byte-identity holds per machine and
 * runtime; equivalence within a class holds across them).
 */
const VALUE_AGREEMENT_PCT = 2;

function expectSameDesign(a: NetOptimizeResult, b: NetOptimizeResult): void {
  // The discrete half: the same structure decisions, exactly.
  expect([...b.removed].sort()).toEqual([...a.removed].sort());
  expect([...b.added].sort()).toEqual([...a.added].sort());
  const va = values(a);
  const vb = values(b);
  expect([...vb.keys()].sort()).toEqual([...va.keys()].sort());
  // The continuous half: within the class above.
  for (const [id, xs] of va) {
    const ys = vb.get(id)!;
    expect(ys.length).toBe(xs.length);
    xs.forEach((x, i) => {
      const scale = Math.abs(x) > 0 ? Math.abs(x) : 1;
      expect(Math.abs(ys[i] - x) / scale).toBeLessThanOrEqual(VALUE_AGREEMENT_PCT / 100);
    });
  }
}

describe('E-5c — the two cost choices, and their defaults are what the engine always did', () => {
  const search = run(BITES, {});
  const capped = run(BITES, { structureRetune: 'capped' });

  it('1. the premise: this fixture PRUNES, so there is a structure retune to cap at all', () => {
    /* Without this the whole file could pass on a run whose staged pass took
     * the escalation branch — which is exactly what casus 1 does, and exactly
     * why the anatomy had to be measured before any of this was built. */
    expect(search.removed.length).toBeGreaterThan(0);
    expect(search.structureRetuneNote).toBeUndefined();
    expect(capped.structureRetuneNote).toMatch(/structure retunes capped: [1-9]/);
  });

  it('2. absent and the historic values are the same run, to the byte', () => {
    const stated = run(BITES, { structureRetune: 'search', repeatedTune: 'recompute' });
    expect(shape(stated)).toBe(shape(search));
    expect(stated.evaluations).toBe(search.evaluations);
    // P4: naming the historic reading must not start reporting a cost note.
    expect(stated.structureRetuneNote).toBeUndefined();
  });

  it('3. the cap is only a cap: it never lengthens a search it is above', () => {
    /* On a design whose budget is already under the cap the choice is the
     * identity — and, just as important, it cannot then trigger the uncapped
     * retry, because the "capped" answer IS the uncapped one. Without this
     * line the retry doubles the cost of every refused candidate for nothing;
     * it was measured doing precisely that before `cappedEarly` existed. */
    expect(structureBudget(INERT)).toBeLessThan(STRUCTURE_RETUNE_CAP_ITERATIONS);
    const a = run(INERT, {});
    const b = run(INERT, { structureRetune: 'capped' });
    expect(shape(b)).toBe(shape(a));
    expect(b.evaluations).toBe(a.evaluations);
    expect(b.structureRetuneNote).toMatch(/none needed the uncapped retry/);
  });

  it('4. the cap REACHES the pass — it is not a key nobody wired up', () => {
    expect(structureBudget(BITES)).toBeGreaterThan(STRUCTURE_RETUNE_CAP_ITERATIONS);
    // Capped retunes happened, and the run says how many.
    const n = Number(/structure retunes capped: (\d+)/.exec(capped.structureRetuneNote ?? '')![1]);
    expect(n).toBeGreaterThan(0);
    // And the run cost a different number of evaluations than the full search.
    expect(capped.evaluations).not.toBe(search.evaluations);
  });

  it('5. THE INVARIANT: the same parts are stripped and the same design delivered', () => {
    expectSameDesign(search, capped);
  });

  it('6. the safety net exists and reports itself', () => {
    /* A capped retune that cannot reach the acceptance rule is re-run uncapped
     * before the move is judged, so the cap can cost an attempt but never a
     * component. On this fixture most candidates are refused either way, which
     * is what makes the retry visible here — and what makes the cap COST more
     * than it saves on a prune-heavy design. Measured, not hidden: see the
     * casebook entry. */
    const m = /(\d+) re-run uncapped/.exec(capped.structureRetuneNote ?? '');
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
  });
});

describe('E-5c — a fit this run has already done', () => {
  /** A seed carrying the big-cap/big-coil signature `reseedOutliers` exists for. */
  function driftedSeed() {
    return v2SeedParts().map((q) => {
      if (q.partId === 'C1')
        return { ...q, params: q.params.map((p) => (p.name === 'C' ? { ...p, value: 120 } : p)) };
      if (q.partId === 'L1')
        return { ...q, params: q.params.map((p) => (p.name === 'L' ? { ...p, value: 9 } : p)) };
      return q;
    });
  }
  function runDrifted(extra: Partial<NetOptimizeOptions>): NetOptimizeResult {
    return optimizeNetworkValues(
      driftedSeed(),
      V2_GRID,
      wBase,
      tBase,
      driverZ,
      { offsetMm: 0, trimDb: 0, inverted: false },
      {
        phasePriority: 0.5,
        maxIterations: 400,
        staged: { ...TARGETS },
        /* The second condition: with the tune refused the run is still sitting
         * on its seed when the drift catch reseeds, so both reseeds land on the
         * same vector. That is the casus-1 situation, reproduced. */
        gateViolation: () => 'everything is refused',
        ...extra,
      },
    );
  }

  const recompute = runDrifted({});
  const reuse = runDrifted({ repeatedTune: 'reuse' });

  it('7. the premise: this seed HAS outliers, so a basin challenge runs at all', () => {
    expect(reseedOutliers(driftedSeed(), { L: 1e-3, C: 1e-5 })).not.toBeNull();
    expect(reseedOutliers(v2SeedParts(), { L: 1e-3, C: 1e-5 })).toBeNull();
  });

  it('8. the duplicate really happens here — the memo has something to serve', () => {
    const hits = Number(/repeated fits reused: (\d+)/.exec(reuse.structureRetuneNote ?? '')![1]);
    expect(hits).toBeGreaterThan(0);
  });

  it('9. THE INVARIANT: reuse delivers the identical network, for fewer evaluations', () => {
    /* Identical and not merely equivalent: the memo returns the fit the run
     * already computed, so this is an equality the mechanism GUARANTEES rather
     * than one the landscape happens to grant. If it ever weakens, the memo
     * key has stopped covering something the fit reads. */
    expect(shape(reuse)).toBe(shape(recompute));
    expect(reuse.evaluations).toBeLessThan(recompute.evaluations);
  });

  it('10. on a run where nothing repeats, reuse costs and changes nothing', () => {
    const a = run(INERT, {});
    const b = run(INERT, { repeatedTune: 'reuse' });
    expect(shape(b)).toBe(shape(a));
    expect(b.evaluations).toBe(a.evaluations);
    expect(b.structureRetuneNote).toBe('repeated fits reused: 0');
  });
});
