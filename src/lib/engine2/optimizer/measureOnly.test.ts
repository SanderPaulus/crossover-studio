/**
 * 12-11-2026 — `measureOnly`: THE SEED'S OWN REPORT, AND NO PASS.
 *
 * THE FINDING. The scan's reference row ("no candidate beat what you had")
 * asked the tuner for the loaded design's numbers with `maxIterations: 1`,
 * on the assumption that one iteration is nothing. It is not: that cap binds
 * only the simplex, and the floor repair, the reseed challenges, the drift
 * catches and the polish keep their own budgets. Measured on the three-way
 * demo, second guided pass with the first run's design loaded:
 * `measureReferenceDesign` held the main thread for 20.4 s between the busy
 * card and the first candidate row (`performance.mark` on both sides). The
 * app looked frozen; the run had not started.
 *
 * THE CLAIMS. With `measureOnly` the tuner returns the seed's report — the
 * same `before` a tune reports, read by the same `metricsOn` — as `after`
 * too, with the parts as they came in, nothing tuned and no search pass run.
 * And it is POLISH: it cannot alter anything a search delivers, because with
 * it there is no search; absent, the tuner is byte for byte what it was.
 */
import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { POLISH_KEYS } from './choices.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/** A short tune beside the measurement: the claims compare reports, not quality. */
const run = (extra: Partial<NetOptimizeOptions>) =>
  optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    maxIterations: 60,
    ...extra,
  });

describe('measureOnly — the seed’s report, and nothing else', () => {
  it('reports the seed exactly as a tune reports its `before`, and tunes nothing', () => {
    const m = run({ measureOnly: true });
    const t = run({});
    /* One reader (`metricsOn` → `report`), two callers: the measurement IS the
     * tune's own `before`, to the last digit. */
    expect(m.before).toEqual(t.before);
    expect(m.after.rippleDb).toBe(m.before.rippleDb);
    expect(m.after.phaseDeg).toBe(m.before.phaseDeg);
    expect(m.after.zMinOhm ?? null).toBe(m.before.zMinOhm ?? null);
    expect(m.tuned).toBe(0);
    expect(m.removed).toEqual([]);
    expect(m.added).toEqual([]);
    /* The parts come back as they came in — values untouched. */
    expect(m.parts.map((p) => p.params)).toEqual(v2SeedParts().map((p) => p.params));
    /* No pass ran: at most the seed's own report counts as an evaluation,
     * against the hundreds a short tune spends. */
    expect(m.evaluations).toBeLessThanOrEqual(1);
    expect(t.evaluations).toBeGreaterThan(m.evaluations);
  });

  it('is filed as POLISH, and a tune that states it as false is the tune that left it out', () => {
    expect(POLISH_KEYS).toContain('measureOnly');
    const a = run({});
    const b = run({ measureOnly: false });
    expect(b.after).toEqual(a.after);
    expect(b.evaluations).toBe(a.evaluations);
  });
});
