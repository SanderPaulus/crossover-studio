/**
 * V34 — WHERE THE SOURCE-RESISTANCE PROBE READS, AND WHAT ITS WINDOW EDGES MEAN.
 *
 * THE FINDING, AND IT IS ISSUE #14 ONE EDGE FURTHER ON. Without a stated box
 * tuning the probe takes the low driver's impedance peak over the bottom of the
 * grid. The guard written for #14 refuses a peak that sits on the FIRST grid
 * point, because the failure in front of it then was a filter resonance at the
 * bottom of the view range. The TOP of the probe's own search window is a
 * boundary in exactly the same way, and on casus 1 that is where the peak
 * landed: grid[24] = 640.2 Hz, with the woofer pair's real peaks at 17 and
 * 51 Hz — both below a chain grid that starts at 200. The reading fed a hard
 * disqualification, a search constraint, a structure-move guard, an audit tier
 * and one objective term.
 *
 * TWO CHANGES, ONE ENTRY, AND THEY ARE SEPARATELY TESTABLE ON PURPOSE.
 *
 *   1. The window's edges. `ProbeEdgeRule` — `'first'` is the historical rule
 *      and therefore the v1 reading; `'both'` refuses either end.
 *   2. The grid. `rSourceProbeSource` — `'grid'` is the evaluation grid and
 *      the default; `'safety'` is the tuner's own full-band set, which spans
 *      the drivers' whole measured extent and is therefore the only band on
 *      this route where a woofer resonance can be read at all.
 *
 * One decision in the tuner arms both, exactly as `zFloorGoal` and
 * `barrierSource` are one decision each in V30 and V33. They are two parameters
 * in the code so that a failure says WHICH of the two moved — a coupled pair
 * that can only be tested together is a pair whose halves can hide each other.
 *
 * WHY THE LAST CLAIMS MATTER MORE THAN THE FIRST. "Absent equals the default"
 * and "a source without data does not steer" are both true of an option nobody
 * wired to anything (V23). So the file also asserts that each arm REACHES the
 * search and comes out with a different network.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import {
  auditNetwork,
  sourceProbeIndex,
  sourceResistanceOhm,
  seriesPathResistanceOhm,
  SOURCE_PROBE_WINDOW_TOP_HZ,
  DEFAULT_R_SOURCE_TIER_OHM,
  DEFAULT_R_SOURCE_DISQUALIFY_OHM,
} from '../../partAudit.ts';
import {
  v2DriverZ,
  v2Responses,
  v2Safety,
  v2SeedParts,
  V2_GRID,
} from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const safety = v2Safety();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/** The last index of the probe's own search window on a grid. */
function windowTop(grid: readonly number[]): number {
  const stop = Math.max(SOURCE_PROBE_WINDOW_TOP_HZ, grid[Math.floor(grid.length / 4)]);
  let last = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > stop) break;
    last = i;
  }
  return last;
}

/* A short budget: every claim below is "same network" or "different network",
 * and neither needs a well-tuned one. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

const shape = (r: ReturnType<typeof run>): string =>
  JSON.stringify(
    r.parts.map((p) => [
      p.partId ?? p.type,
      p.type,
      p.open ?? false,
      p.shorted ?? false,
      p.params.map((q) => [q.name, q.value]),
    ]),
  );

describe('V34 — the probe window has two edges', () => {
  it('a peak on the window TOP is refused by `both` and accepted by `first`', () => {
    /* The claim isolated from the grid change, on a curve that really does it:
     * on this fixture the tweeter's maximum below the window top lands exactly
     * ON that top. Which curve it is does not matter — nothing disqualifies a
     * tweeter on source resistance — and that is the point: the rule is about
     * the window, not about a driver. */
    const top = windowTop(V2_GRID);
    const z = driverZ.tweeter;
    const first = sourceProbeIndex(V2_GRID, z, undefined, 'first');
    const both = sourceProbeIndex(V2_GRID, z, undefined, 'both');
    expect(first, 'the fixture no longer has a curve whose peak sits on the window top').not.toBeNull();
    expect(first!.idx, 'this claim needs a peak ON the boundary to be about anything').toBe(top);
    expect(first!.inBand).toBe(true);
    expect(both!.idx).toBe(top);
    expect(both!.inBand).toBe(false);
  });

  it('the BOTTOM edge is refused by both rules — V34 adds an edge, it removes none', () => {
    const z = driverZ.mid;
    const first = sourceProbeIndex(V2_GRID, z, undefined, 'first');
    expect(first!.idx, 'the fixture no longer has a curve whose peak sits on grid[0]').toBe(0);
    expect(first!.inBand).toBe(false);
    expect(sourceProbeIndex(V2_GRID, z, undefined, 'both')!.inBand).toBe(false);
  });

  it('a STATED box tuning at a window edge is still honoured — the rule is about the fallback', () => {
    /* A frequency the designer asked for is an answer to a question, not a
     * search artefact. Refusing it would break ISSUE #14's own remedy: a known
     * tuning inside the grid is exactly what the probe wants. */
    const fb = V2_GRID[0];
    for (const rule of ['first', 'both'] as const) {
      const p = sourceProbeIndex(V2_GRID, driverZ.mid, fb, rule);
      expect(p!.idx).toBe(0);
      expect(p!.inBand, `${rule} refused a stated box tuning`).toBe(true);
    }
  });

  it('`edgeRule` defaults to the historical one, so every v1 caller reads what it read', () => {
    const z = driverZ.tweeter;
    expect(sourceProbeIndex(V2_GRID, z)).toEqual(sourceProbeIndex(V2_GRID, z, undefined, 'first'));
  });
});

describe('V34 — the grid the probe reads is a choice', () => {
  it('the fixture is set up so the grid can matter at all', () => {
    /* Three premises, and without them every claim below is vacuous. The
     * safety grid must reach BELOW the evaluation grid (otherwise both sources
     * are one band); the low branch's peak must be unreachable on the
     * evaluation grid and reachable on the safety grid; and the two readings of
     * the same seed must differ. */
    expect(safety.freqs[0]).toBeLessThan(V2_GRID[0]);

    const onGrid = sourceProbeIndex(V2_GRID, driverZ.mid, undefined, 'first');
    const onSafety = sourceProbeIndex(safety.freqs, safety.z.mid, undefined, 'both');
    expect(onGrid!.inBand, 'the low branch is measurable on the evaluation grid after all').toBe(false);
    expect(onSafety!.inBand).toBe(true);
    expect(safety.freqs[onSafety!.idx]).toBeLessThan(V2_GRID[0]);

    /* And the consequence, on the seed: the evaluation grid answers with the DC
     * LIMIT — not a Thevenin measurement at all — while the safety grid
     * answers with one. Asserted as an identity against
     * `seriesPathResistanceOhm` rather than as "they differ", because that is
     * the whole finding: the number the disqualification compared against was
     * never a measurement of what the rule is about. */
    const seed = v2SeedParts();
    const dc = seriesPathResistanceOhm(seed);
    const rsGrid = sourceResistanceOhm(seed, { grid: V2_GRID, driverZ });
    const rsSafety = sourceResistanceOhm(seed, {
      grid: safety.freqs,
      driverZ: safety.z,
      edgeRule: 'both',
    });
    expect(dc).not.toBeNull();
    expect(rsGrid).toBe(dc);
    expect(rsSafety).not.toBe(dc);
  });

  it('P2 — absent and `grid` are byte-identical runs, and only a stated source adds a note', () => {
    const absent = run({ safety });
    const stated = run({ safety, rSourceProbeSource: 'grid' });
    expect(shape(stated)).toBe(shape(absent));
    expect(stated.after.rSourceOhm).toBe(absent.after.rSourceOhm);
    expect(absent.rSourceProbeNote).toBeUndefined();
    expect(stated.rSourceProbeNote).toContain('evaluation grid');
  });

  it('P4 — a source named but not supplied probes NOTHING, and above all does not fall back', () => {
    /* The claim that keeps V32's rule intact one quantity along, and the
     * discriminator is chosen for exactly that: a silent fallback to the
     * evaluation grid would report the EVALUATION GRID'S NUMBER, which is the
     * only thing it could report. So the control is asserted to produce a
     * number and the withdrawn source to produce none. (Comparing the delivered
     * NETWORKS would prove nothing here: on this fixture the evaluation grid
     * cannot probe the low branch either, so both arms search identically. That
     * is measured, not assumed — see the "reaches" claims below.) */
    const control = run({ rSourceProbeSource: 'grid' });
    const asked = run({ rSourceProbeSource: 'safety' });
    expect(control.after.rSourceOhm ?? null).not.toBeNull();
    expect(asked.after.rSourceOhm ?? null).toBeNull();
    expect(asked.rSourceProbeNote).toContain('never reached this run');
    expect(asked.rSourceProbeNote).toContain('NOT fall back');
  });

  it('`safety` REACHES the delivered JUDGEMENT — and the two grids disagree about it', () => {
    /* THE SHARPEST FORM OF V34, and the fixture happens to hand it over. One
     * seed, one limit, one set of protections; the ONLY difference is where the
     * probe read — and the run comes back feasible on one grid and INFEASIBLE
     * on the other. That is not a rounding difference in a report, it is a
     * design being thrown away or not.
     *
     * The limit is derived from the two unarmed readings and never typed: it
     * sits between them, which is the only place a limit can sit for this
     * question to have an answer. */
    const onGrid = run({ safety, rSourceProbeSource: 'grid' });
    const onSafety = run({ safety, rSourceProbeSource: 'safety' });
    expect(onGrid.tuned).toBeGreaterThan(0);
    expect(onSafety.tuned).toBeGreaterThan(0);
    const rsGrid = onGrid.after.rSourceOhm!;
    const rsSafety = onSafety.after.rSourceOhm!;
    expect(rsSafety, 'the two grids read the same number — nothing to separate').toBeGreaterThan(rsGrid);
    const between = Number(((rsGrid + rsSafety) / 2).toFixed(4));

    const armedGrid = run({ safety, rSourceProbeSource: 'grid', rSourceDisqualifyOhm: between });
    const armedSafety = run({ safety, rSourceProbeSource: 'safety', rSourceDisqualifyOhm: between });
    expect(armedGrid.infeasible ?? null).toBeNull();
    expect(armedSafety.infeasible ?? '').toContain('source resistance at the low driver');

    // The note says the frequency out loud, because the ohms are unreadable
    // without it — that is the whole of V34 in one sentence.
    expect(onSafety.rSourceProbeNote).toContain('safety grid');
    expect(onSafety.rSourceProbeNote).toMatch(/probed .* at [\d.]+ Hz/);
    expect(onSafety.rSourceProbeNote).toContain('impedance peak');
  });

  it('...and it reaches the SEARCH too, through the term that reads it', () => {
    /* The V23 claim: a channel with no effect reports nothing. The probe's only
     * route into the objective is `dissRatio`, and V34 changes neither that term
     * nor its weight — so the demonstration RAISES the weight rather than
     * touching it. At the app's own 0.05 the term is worth about 1e-6 on this
     * seed and moves nothing, which is measured here rather than assumed: the
     * arms are compared at both weights and only the raised one separates.
     *
     * That is also the honest reading of what V34 does on a field like this
     * one: it repairs a JUDGEMENT that was being made on the wrong frequency,
     * and only incidentally a search term that was too small to matter. */
    const w = 50;
    const onGrid = run({ safety, dissipationWeight: w, rSourceProbeSource: 'grid' });
    const onSafety = run({ safety, dissipationWeight: w, rSourceProbeSource: 'safety' });
    expect(shape(onSafety)).not.toBe(shape(onGrid));
    expect(onGrid.tuned).toBeGreaterThan(0);
    expect(onSafety.tuned).toBeGreaterThan(0);
  });
});

describe('V34 — a limit nobody stated judges nothing (P4)', () => {
  it('`rSourceDisqualifyOhm: null` is the same run as no limit at all', () => {
    expect(shape(run({ safety, rSourceDisqualifyOhm: null }))).toBe(shape(run({ safety })));
  });

  it('...and a stated limit really does judge, so `null` is not vacuous', () => {
    /* The tegenproef, without which "null changes nothing" is equally true of a
     * key nobody wired up. The limit is read off the delivered network and set
     * under it, so the constraint has something to refuse. */
    const delivered = run({ safety });
    const under = Number((delivered.after.rSourceOhm! * 0.5).toFixed(4));
    expect(run({ safety, rSourceDisqualifyOhm: under }).infeasible ?? '').toContain(
      'source resistance at the low driver',
    );
    expect(run({ safety, rSourceDisqualifyOhm: null }).infeasible ?? null).toBeNull();
  });

  it('an audit tier of `null` earns no part and warns about nothing', () => {
    /* The audit's `crossesRs` is a VERDICT — an `inert` part is removed from
     * the delivered network — so the tier carries a judgement and not only a
     * report. With no tier stated nothing may cross one. */
    const seed = v2SeedParts();
    const ctx = { grid: V2_GRID, wBase, tBase, driverZ, adjust: ADJUST };
    const none = auditNetwork(seed, { ...ctx, thresholds: { rSourceOhm: null } });
    expect(none).not.toBeNull();
    expect(none!.rSourceWarn).toBe(false);
    expect(
      none!.entries.flatMap((e) => e.reasons).filter((r) => r.includes('crosses the')),
      'a part was earned by a limit nobody stated',
    ).toEqual([]);

    /* Tegenproef: a tier UNDER the reading does warn, so "nothing crossed"
     * above is a statement about the tier rather than about this network. */
    const rs = none!.rSourceTunedOhm;
    expect(rs).not.toBeNull();
    const armed = auditNetwork(seed, {
      ...ctx,
      thresholds: { rSourceOhm: Number((rs! * 0.5).toFixed(4)) },
    });
    expect(armed!.rSourceWarn).toBe(true);
  });

  it('the two tiers have one home each, and the tuner reads THAT home', () => {
    /* V34 consolidated four copies of 2.0 Ω and three of 1.0 Ω. The guard is
     * structural: nothing outside `partAudit.ts` may write either number as a
     * literal beside a source-resistance name. Asserted here as the weaker but
     * checkable half — the constants exist, they are distinct, and the harder
     * tier really is the harder one. */
    expect(DEFAULT_R_SOURCE_DISQUALIFY_OHM).toBeGreaterThan(DEFAULT_R_SOURCE_TIER_OHM);
  });
});
