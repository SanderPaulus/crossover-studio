/**
 * V33 — WHERE THE AMP-LOAD BARRIER TAKES ITS SHORTFALL.
 *
 * V30 made the stated floor a search GOAL. V32 moved every electrical GATE onto
 * the drivers' own measured impedance sweeps, because an impedance requirement
 * has no measurement gate while a response requirement does. What nobody moved
 * was the barrier term itself: it went on reading `zShortOhm` off the
 * EVALUATION grid, whose floor is the far-field span. So the search aimed at a
 * minimum above 200 Hz while the gate enforced one over the whole sweep, and on
 * casus 1 five of fifteen candidates had their entire value tune refused for a
 * dip at ~82 Hz the objective could not see.
 *
 * THREE SOURCES, AND ONE READER. `'grid'` (the default, and therefore the v1
 * behaviour), `'safety'` (the tuner's own full-band safety grid, which every
 * other amp-floor reader has always used) and `'sweep'` (the gate's own
 * reference, identical number and identical resolution — and correspondingly
 * expensive). All three go through `systemMinImpedanceOhm` → `minImpedanceAt`,
 * so the GRID is a parameter rather than a second implementation. That is the
 * claim this file guards; how far apart `'safety'` and `'sweep'` actually read
 * is a MEASUREMENT, and it lives in `frozenNetlistGates.test.ts` where there is
 * a real corpus to measure it on.
 *
 * The claims here are the V30 shape one layer down, and the last two are what
 * stop the first two from being equally true of a key nobody wired up:
 *
 *  1. ABSENT AND `'grid'` ARE THE SAME RUN. Byte-identical networks. The P2
 *     pattern: a mechanism that is merely present must cost nothing, and the v1
 *     route — including the repair pass, which is a v1 caller of this same
 *     term — states nothing.
 *  2. A SOURCE NAMED BUT NOT SUPPLIED IS INERT, AND NEVER A FALLBACK. Both for
 *     `'safety'` without a safety set and for `'sweep'` without a reference.
 *     Falling back to the evaluation grid would restore exactly the reading V32
 *     withdrew, silently.
 *  3. AND 4. EACH OF THEM REACHES THE SEARCH. A different network comes out.
 *
 * THE FLOOR IS DERIVED FROM THE FIXTURE'S OWN DELIVERED MINIMUM, never typed —
 * the same rule `floorAsGoal.test.ts` and `frozenNetlistGates.test.ts` follow.
 * A threshold written into a test is a project number in a second home, and one
 * that happens to sit under whatever the fixture delivers proves nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  extendGridToSweepExtent,
  optimizeNetworkValues,
  systemMinImpedanceOhm,
  type NetOptimizeOptions,
} from '../../netOptimizer.ts';
import {
  v2DriverZ,
  v2GateReference,
  v2Netlist,
  v2Responses,
  v2Safety,
  v2SeedParts,
  V2_GRID,
} from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/** The gate's own impedance reference — the object the worker hands over. */
const reference = v2GateReference();
const impedance = reference.impedance;
/** The tuner's own full-band set — what `'safety'` reads. */
const safety = v2Safety();

/* A short budget on purpose: every claim below is "same network" or "different
 * network", and neither needs a well-tuned one. The `'sweep'` arm solves on the
 * analysis-resolution grid at every objective evaluation, which is the cost V33
 * measured and wrote down — a full budget here would buy nothing and pay for it
 * in the suite. */
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
      maxIterations: 120,
      ...extra,
    },
  );
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

/* The floor sits ABOVE what this fixture delivers unarmed, so the barrier has
 * real work to do — read off the run, never written down.
 *
 * A MODEST 5 %, and the number is not arbitrary. At 50 % the barrier pushes
 * hard enough that the full-band safety gate refuses the whole tune, and the
 * seed comes back in every arm — which is a true statement about that floor and
 * makes every comparison below vacuous (measured: `safetyNote` set, `tuned` 0,
 * identical networks under all three sources). The floor has to be reachable
 * for "the source changes where the search lands" to be a question at all. */
const unarmed = run({});
const DELIVERED_MIN_OHM = unarmed.after.zMinOhm;
const FLOOR_OHM = Number(((DELIVERED_MIN_OHM ?? 1) * 1.05).toFixed(3));

const ARMED = { ampMinLoadOhm: FLOOR_OHM, zFloorBarrier: true } as const;
const sweepData = {
  zFloorBarrierImpedance: {
    grid: impedance!.grid,
    driverZ: impedance!.driverZ,
    span: impedance!.span,
  },
};

describe('V33 — the barrier source is a choice, and its default is what it always read', () => {
  it('the fixture is set up so the source can matter at all', () => {
    /* Three premises. Without a shortfall the barrier has nothing to pull
     * against; without a WIDER extent than the evaluation grid the sources
     * would be one band and every claim below would be vacuous; and the safety
     * grid has to sit INSIDE the gate's extent, because that containment is
     * what makes `'safety'` an approximation of the gate's reading rather than
     * a different question. */
    expect(DELIVERED_MIN_OHM).not.toBeNull();
    expect(FLOOR_OHM).toBeGreaterThan(DELIVERED_MIN_OHM!);
    expect(impedance, 'the fixture froze no impedance reference').not.toBeNull();
    expect(safety.freqs[0]).toBeLessThan(V2_GRID[0]);
    expect(safety.freqs[0]).toBeGreaterThanOrEqual(impedance!.grid[0]);
    expect(safety.freqs[safety.freqs.length - 1]).toBeLessThanOrEqual(
      impedance!.grid[impedance!.grid.length - 1],
    );
    /* ...and the three sources really are three readings of one network, on the
     * seed itself: same function, three grids, three numbers. That is the
     * whole shape of the change — the grid is a parameter — and without it
     * "the source reaches the search" below could be true for a reason that
     * has nothing to do with the band. */
    const net = v2Netlist(v2SeedParts());
    const onGrid = systemMinImpedanceOhm(net, V2_GRID, driverZ);
    const onSafety = systemMinImpedanceOhm(net, safety.freqs, safety.z);
    const onSweep = systemMinImpedanceOhm(net, impedance!.grid, impedance!.driverZ);
    for (const v of [onGrid, onSafety, onSweep]) expect(v).not.toBeNull();
    expect(onSafety).not.toBe(onGrid);
    expect(onSweep).not.toBe(onGrid);
    expect(onSweep).not.toBe(onSafety);
  });

  it('P2 — absent and `grid` are byte-identical runs', () => {
    const absent = run({ ...ARMED, safety });
    const stated = run({ ...ARMED, safety, zFloorBarrierSource: 'grid' });
    expect(shape(stated)).toBe(shape(absent));
    expect(stated.after.zMinOhm).toBe(absent.after.zMinOhm);
    // ...and the note appears only when a caller stated something, so a v1
    // result object gains no field.
    expect(absent.zFloorSourceNote).toBeUndefined();
    expect(stated.zFloorSourceNote).toContain('EVALUATION grid');
  });

  it('P4 — a source named but not supplied does not steer, and above all does not FALL BACK', () => {
    /* THE CLAIM THAT KEEPS V32 FROM BEING UNDONE HERE. A quiet fallback to the
     * evaluation grid would restore exactly the reading V32 withdrew, in the
     * one place nobody looks — and it would be invisible, because a fallback
     * delivers a perfectly reasonable network. So the assertion is that the
     * delivered network is NOT the one the `'grid'` source delivers: that is
     * what a fallback would produce, and nothing else would.
     *
     * BOTH SOURCES, because a fallback added to one of them later would
     * otherwise pass unnoticed. And the control is built per source, with the
     * same options minus the barrier's own: for `'safety'` the safety set has
     * to be withheld, and a run without one is a different run for reasons that
     * have nothing to do with V33.
     *
     * WHAT IT IS *NOT* COMPARED AGAINST is `zFloorBarrier: false`, and the
     * reason is a finding rather than a technicality: with the barrier off the
     * REPAIR PASS still pushes with the same term (it arms it explicitly), so
     * an unsteered barrier and an unarmed one are not the same run. Measured
     * here: the unarmed arm comes back with `ampFloorRepair: 'lifted'`. One
     * source for one term means a source with no data stops both. */
    for (const source of ['safety', 'sweep', 'safety-extended'] as const) {
      /* `'safety-extended'` needs BOTH the safety set and the reference; the
       * arm below withholds the reference, which is the missing half a caller
       * is most likely to forget. */
      const withData = source === 'sweep' || source === 'safety-extended' ? { safety } : {};
      const control = run({ ...ARMED, ...withData, zFloorBarrierSource: 'grid' });
      const asked = run({ ...ARMED, ...withData, zFloorBarrierSource: source });
      expect(
        shape(asked),
        `${source} without its data delivered exactly what the evaluation grid delivers — that ` +
          'is what a silent fallback looks like',
      ).not.toBe(shape(control));
      expect(asked.zFloorSourceNote).toContain('did not steer anything');
      expect(asked.zFloorSourceNote).toContain('NOT fall back');
      expect(asked.zFloorSourceNote).toContain(source);
    }
  });

  it('`safety` REACHES the search — a different network comes out, at the app\'s own 240 points', () => {
    /* Without this the claims above are equally true of an option that was
     * never wired to anything, which is the failure mode V23 records. Both arms
     * carry the same safety set, so the full-band gate and the repair pass are
     * armed identically and the ONLY difference is where the barrier reads. */
    const onGrid = run({ ...ARMED, safety, zFloorBarrierSource: 'grid' });
    const onSafety = run({ ...ARMED, safety, zFloorBarrierSource: 'safety' });
    expect(shape(onSafety)).not.toBe(shape(onGrid));
    // Both really tuned — a comparison between two rolled-back runs would say
    // nothing about a search.
    expect(onGrid.tuned).toBeGreaterThan(0);
    expect(onSafety.tuned).toBeGreaterThan(0);
    expect(onSafety.zFloorSourceNote).toContain('safety grid');
    // The note names the reader, because that is the delivery: the same
    // question the gate asks, over the same extent, at another resolution.
    expect(onSafety.zFloorSourceNote).toContain('M-B/|Z|');
  });

  it('`sweep` reaches it too — the expensive source is wired, not decorative', () => {
    const onGrid = run({ ...ARMED, safety, zFloorBarrierSource: 'grid' });
    const onSweep = run({ ...ARMED, safety, zFloorBarrierSource: 'sweep', ...sweepData });
    expect(shape(onSweep)).not.toBe(shape(onGrid));
    expect(onSweep.zFloorSourceNote).toContain(impedance!.span);
  });

  it('A5e.3b — `safety-extended` is the IDENTITY where the extents already coincide, and the merge is the gate\'s own points where they do not', () => {
    /* Two halves, and the fixture decides which one runs live. ON THIS
     * FIXTURE the safety grid already spans the sweeps' extent (both floors at
     * the same hertz — asserted, because it is the premise), so the extension
     * adds nothing and `'safety-extended'` must deliver byte-for-byte what
     * `'safety'` delivers: widening a grid by zero points may not change a
     * bit. The half where the extents DIFFER — the blind spot A5e.3b closes —
     * is measured where it exists, on casus 1's merged set
     * (`frozenNetlistGates.test.ts`: KAND_V2_2's minimum at 10.07 Hz, under
     * the safety floor of 20.5 Hz). */
    const ext = extendGridToSweepExtent({ freqs: safety.freqs, z: safety.z }, impedance!);
    expect(ext).not.toBeNull();
    expect(ext!.addedBelow + ext!.addedAbove, 'this fixture\'s extents coincide — the premise of the identity claim').toBe(0);
    const onSafety = run({ ...ARMED, safety, zFloorBarrierSource: 'safety' });
    const onExtended = run({ ...ARMED, safety, zFloorBarrierSource: 'safety-extended', ...sweepData });
    expect(shape(onExtended)).toBe(shape(onSafety));
    expect(onExtended.zFloorSourceNote).toContain('extended');
    /* The merge itself, on a reference that DOES reach further: the added
     * points are the reference's own, in order, and a model the reference does
     * not carry refuses the merge instead of inventing impedance. */
    const model = Object.keys(safety.z)[0];
    const deeper = {
      grid: [safety.freqs[0] / 4, safety.freqs[0] / 2, ...impedance!.grid],
      driverZ: Object.fromEntries(
        Object.keys(impedance!.driverZ).map((m) => [m, [impedance!.driverZ[m][0], impedance!.driverZ[m][0], ...impedance!.driverZ[m]]]),
      ),
    };
    const ext2 = extendGridToSweepExtent({ freqs: safety.freqs, z: safety.z }, deeper)!;
    expect(ext2.addedBelow).toBe(2);
    expect(ext2.grid.slice(0, 2)).toEqual([safety.freqs[0] / 4, safety.freqs[0] / 2]);
    expect(ext2.grid.length).toBe(safety.freqs.length + 2);
    expect(ext2.driverZ[model].length).toBe(ext2.grid.length);
    const { [model]: _dropped, ...partial } = deeper.driverZ;
    void _dropped;
    expect(extendGridToSweepExtent({ freqs: safety.freqs, z: safety.z }, { grid: deeper.grid, driverZ: partial })).toBeNull();
  });
});
