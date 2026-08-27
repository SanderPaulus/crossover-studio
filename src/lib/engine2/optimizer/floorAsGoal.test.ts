/**
 * V30 — THE STATED AMPLIFIER FLOOR AS A SEARCH GOAL, AND THE FOUR THINGS THAT
 * HAD TO STAY TRUE WHILE IT BECAME ONE.
 *
 * The finding this file guards is not "the barrier works". It is the shape of
 * the change: `netOptimizer.ts` has carried a barrier term for the stated
 * floor since long before v2, reachable only from the repair pass, and V30
 * measured what that costs — a search that picks the topology and the values
 * without knowing a floor exists, and then one locally-seeded repair asked to
 * lift the result from 1 Ω to 2.6. So the term is now reachable from a run
 * option, and the option is `false` unless a caller asks.
 *
 * Four claims, and the first two are the ones that let the v1 route sleep:
 *
 *  1. ABSENT AND `false` ARE THE SAME RUN. Byte-identical networks. This is
 *     the P2 pattern from `gateEnforcement.test.ts`: a mechanism that is
 *     merely present must cost nothing, or "off" is not off.
 *  2. ARMED WITHOUT A RATING IS INERT. `zFloorBarrier: true` with no
 *     `ampMinLoadOhm` delivers the same network as absent — P4, said in the
 *     one place that decides it (`zFloorGoal`). A barrier with no floor has no
 *     distance to be short of, and inventing one is how 2.5 Ω happened.
 *  3. ARMED WITH A RATING REACHES THE SEARCH. The delivered network DIFFERS.
 *     Without this assert the first two are equally true of an option that was
 *     never wired to anything, which is the failure mode V23 records.
 *  4. THE REPAIR PASS KEPT ITS OWN TWO BEHAVIOURS. The corridor cancellation
 *     and the skipped block-coordinate refinement were measured FOR the repair
 *     — a local retune from a finished network — and both were keyed on the
 *     barrier flag simply because, until V30, the barrier flag and "this is
 *     the repair pass" were the same bit. Splitting them is what keeps "the
 *     floor is a goal" from silently also meaning "the corridor stops counting
 *     and the deep polish is skipped". Asserted as a SCAN of the source,
 *     because it is a claim about which flag guards which line and there is no
 *     delivered value that shows it.
 *
 * THE FLOOR USED HERE IS DERIVED FROM THE FIXTURE'S OWN DELIVERED MINIMUM, not
 * written down. Same rule `frozenNetlistGates.test.ts` follows: a threshold
 * typed into a test is a project number in a second home, and one that happens
 * to sit below whatever the fixture delivers is a test that proves nothing.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const NET_OPTIMIZER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'netOptimizer.ts',
);

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

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

/** The delivered values, which is what "the same network" means here. */
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

/* The floor is chosen ABOVE what this fixture delivers unarmed, so the barrier
 * has real work to do — and it is read off the run rather than typed. A floor
 * under the delivered minimum would arm a barrier with nothing to pull
 * against, and every assert below would pass on a dead option. */
const unarmed = run({});
const DELIVERED_MIN_OHM = unarmed.after.zMinOhm;
const FLOOR_OHM = Number(((DELIVERED_MIN_OHM ?? 1) * 1.5).toFixed(3));

describe('V30 — the floor as a search goal is opt-in, and off is off', () => {
  it('the fixture really is short of the floor, or nothing below means anything', () => {
    expect(DELIVERED_MIN_OHM).not.toBeNull();
    expect(FLOOR_OHM).toBeGreaterThan(DELIVERED_MIN_OHM!);
  });

  it('P2 — the key absent and the key `false` are byte-identical runs', () => {
    const absent = run({ ampMinLoadOhm: FLOOR_OHM });
    const off = run({ ampMinLoadOhm: FLOOR_OHM, zFloorBarrier: false });
    expect(shape(off)).toBe(shape(absent));
    expect(off.after.zMinOhm).toBe(absent.after.zMinOhm);
    // ...and the repair pass ran in both, which is what makes them the SAME
    // run rather than two runs that both did nothing.
    expect(absent.ampFloorRepair).not.toBe('none');
    expect(off.ampFloorRepair).toBe(absent.ampFloorRepair);
  });

  it('P4 — armed without a rating is inert, because there is nothing to be short of', () => {
    const bare = run({});
    const armedNoFloor = run({ zFloorBarrier: true });
    expect(shape(armedNoFloor)).toBe(shape(bare));
    expect(armedNoFloor.ampFloorRepair).toBe('none');
  });

  it('the option REACHES the search — armed with a rating delivers a different network', () => {
    /* The assert that stops the three above from being true of an option
     * nobody wired up. A channel with no effect reports nothing, which is
     * exactly the fourth gap V23 found sitting open since F2. */
    const off = run({ ampMinLoadOhm: FLOOR_OHM, zFloorBarrier: false });
    const on = run({ ampMinLoadOhm: FLOOR_OHM, zFloorBarrier: true });
    expect(shape(on)).not.toBe(shape(off));
  });
});

describe('V30 — the repair pass kept its own two behaviours', () => {
  const src = readFileSync(NET_OPTIMIZER, 'utf-8');

  it('the corridor cancellation is guarded by the REPAIR flag, not by the barrier flag', () => {
    /* `barr -= 2 * m.corridorSq` is the "branch fidelity yields to the floor"
     * hierarchy. It was measured on a local retune with no freedom left; a
     * full search armed with the barrier is not in that position and keeps the
     * design step's leash. */
    const line = src
      .split('\n')
      .find((l) => /barr\s*-=\s*2\s*\*\s*m\.corridorSq/.test(l));
    expect(line, 'the corridor cancellation has moved or been renamed').toBeDefined();
    expect(line).toMatch(/zFloorRepairPass/);
  });

  it('the block-coordinate refinement is skipped for the REPAIR pass, not for the barrier', () => {
    /* Same argument, opposite sign: the deep polish is skipped on cheap local
     * recoveries. A barrier-armed full search is not one, and a search that
     * quietly lost its deep polish the moment a floor was stated would make
     * every before/after comparison measure two changes. */
    const line = src.split('\n').find((l) => /free\.length > 9/.test(l));
    expect(line, 'the block-coordinate refinement gate has moved').toBeDefined();
    expect(line).toMatch(/!zFloorRepairPass/);
    expect(line).not.toMatch(/!zFloorBarrier/);
  });

  it('both repair call sites really pass the repair flag', () => {
    // Otherwise the two asserts above describe a flag nobody sets, and the
    // repair pass would quietly lose the two behaviours instead of the search
    // gaining them.
    const calls = src.match(/tune\([^)]*,\s*true,\s*true,\s*true\)/g) ?? [];
    expect(calls.length, 'the amp-floor repair has one or both call sites unflagged').toBe(2);
  });
});
