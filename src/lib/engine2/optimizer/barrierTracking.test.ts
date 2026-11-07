/**
 * THE TRACKED BARRIER SOURCE (07-11-2026) — `'safety-extended-refined-tracked'`.
 *
 * The refined barrier reading, with the coarse grid read only around the dips
 * the last full scan found (`trackedRefinedSystemMinImpedanceOhm`,
 * `BARRIER_TRACKING`). Measured before it was built
 * (`scripts/measure-floor-barrier-tracking.ts`): the barrier is 68–69 % of an
 * evaluation and the tracked reading is 7.8–10.1× cheaper. It is a STEERING
 * term; no gate reads it.
 *
 * The claims here are about the mechanism, on a real casus-1 netlist and the
 * real safety grid: a full scan IS the refined reading, bit for bit; between
 * full scans the tracked reading equals the full one while the minimum stays in
 * a tracked window; and every trigger for a full scan fires. Whether the route
 * delivers the same design is a different question, answered by the arm
 * comparison (`scripts/measure-barrier-tracking-arms.ts`), not here.
 */
import { describe, it, expect } from 'vitest';
import {
  BARRIER_TRACKING,
  newBarrierTrackState,
  refinedSystemMinImpedanceOhm,
  trackedRefinedSystemMinImpedanceOhm,
} from '../../netOptimizer.ts';
import type { Netlist } from '../../network.ts';
import { casus1Files, casus1Filter, casus1Manifest, loadGolden } from '../casus1.fixture.ts';
import { casus1ChainInput } from '../casus1V2.fixture.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const g = casus1ChainInput(manifest, files, golden);
const coarse = { grid: g.safety.freqs, driverZ: g.safety.z };
/* The fine reference: the chain grid's own drivers resampled is not at hand
 * here, so the refinement runs against the coarse grid itself — no point lies
 * strictly inside a coarse cell, so the refined reading is the coarse minimum.
 * That isolates the TRACKING, which is what this file is about. */
const fine = coarse;
const base = casus1Filter('HUIDIG', manifest, files, golden).netlist;

/** A deterministic small perturbation of every passive value — a stand-in for
 *  consecutive simplex trials. */
function perturbed(net: Netlist, k: number, size = 0.01): Netlist {
  return {
    nodeCount: net.nodeCount,
    elements: net.elements.map((e, i) =>
      e.kind === 'R' || e.kind === 'L' || e.kind === 'C'
        ? { ...e, value: e.value * (1 + size * Math.sin(1.7 * k + 0.9 * i)) }
        : e,
    ),
  };
}

describe('tracked barrier source', () => {
  it('the first reading is a full scan and IS the refined reading, bit for bit', () => {
    const st = newBarrierTrackState();
    const t = trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null)!;
    const r = refinedSystemMinImpedanceOhm(base, coarse, fine)!;
    expect(t.full).toBe(true);
    expect(Object.is(t.ohm, r.ohm)).toBe(true);
    expect(st.tracked.length).toBeGreaterThan(0);
    expect(st.tracked.length).toBeLessThanOrEqual(BARRIER_TRACKING.dips);
  });

  it('between full scans the tracked reading equals the full one on small steps, and reads fewer points', () => {
    const st = newBarrierTrackState();
    let tracked = 0;
    for (let k = 0; k < 40; k++) {
      const net = perturbed(base, k);
      const t = trackedRefinedSystemMinImpedanceOhm(net, coarse, fine, st, null)!;
      const r = refinedSystemMinImpedanceOhm(net, coarse, fine)!;
      if (!t.full) tracked++;
      expect(t.ohm, `step ${k}`).toBeCloseTo(r.ohm, 12);
    }
    // The premise: the tracked path was actually taken.
    expect(tracked).toBeGreaterThan(30);
    expect(st.trackedReads).toBe(tracked);
  });

  it('a full scan comes back every `rescanEvery` tracked reads', () => {
    const st = newBarrierTrackState();
    trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null);
    for (let k = 0; k < BARRIER_TRACKING.rescanEvery; k++) {
      expect(trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null)!.full).toBe(false);
    }
    expect(trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null)!.full).toBe(true);
  });

  it('a topology change forces a full scan', () => {
    const st = newBarrierTrackState();
    trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null);
    expect(trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null)!.full).toBe(false);
    const smaller: Netlist = { nodeCount: base.nodeCount, elements: base.elements.filter((_, i) => i !== base.elements.length - 1) };
    expect(trackedRefinedSystemMinImpedanceOhm(smaller, coarse, fine, st, null)!.full).toBe(true);
  });

  it('the detector forces a full scan when the evaluation grid’s minimum lies outside every window', () => {
    const st = newBarrierTrackState();
    trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, null);
    const inside = coarse.grid[st.tracked[0]];
    expect(trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, inside)!.full).toBe(false);
    // A frequency farther than every window from every tracked dip.
    const far = coarse.grid
      .map((f, i) => ({ f, d: Math.min(...st.tracked.map((c) => Math.abs(i - c))) }))
      .filter((x) => x.d > BARRIER_TRACKING.halfWindowCells)[0];
    expect(far, 'no grid point outside the windows').toBeDefined();
    expect(trackedRefinedSystemMinImpedanceOhm(base, coarse, fine, st, far.f)!.full).toBe(true);
  });
});

describe('S-2 — the route derives the tracked source; the casus fixtures are pinned to the pre-S-2 one', () => {
  it('a declaration with the floor armed and no stated source derives the tracked source', async () => {
    const { declareCandidateChoices } = await import('./candidateDeclaration.ts');
    const d = declareCandidateChoices({
      cages: [null],
      windowFloorsHz: [null],
      multiWay: false,
      stated: { ampMinLoadOhm: 2.6, safety: { freqs: [100], w: [], m: null, t: [], z: {} } } as never,
    });
    expect(d.stated.zFloorBarrier).toBe(true);
    expect(d.stated.zFloorBarrierSource).toBe('safety-extended-refined-tracked');
  });

  it('every casus fixture states the pre-S-2 source, and it differs from what the route derives', async () => {
    const { PRE_S2_BARRIER_SOURCE } = await import('./candidateDeclaration.ts');
    expect(PRE_S2_BARRIER_SOURCE).not.toBe('safety-extended-refined-tracked');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const f of ['casus1V2', 'casus1b', 'casus1h', 'casus2']) {
      const src = readFileSync(join(__dirname, '..', `${f}.fixture.ts`), 'utf-8');
      expect(src, f).toContain('zFloorBarrierSource: PRE_S2_BARRIER_SOURCE,');
    }
  });
});
