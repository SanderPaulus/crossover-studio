/**
 * F3b ACCEPTANCE (f) — a gate that passes ONLY on the tolerance says so.
 *
 * The practical case, and the one the fixture below is: a delivered minimum of
 * 3.17 Ω against a stated amplifier floor of 3.20 Ω reads "inside", because
 * `meetsAmpFloor` allows 2 % for build spread. That verdict is right. The
 * silence around it was not — a reader deciding whether to build the thing is
 * entitled to know the difference between a design that clears the rating and
 * one that clears it only once you agree to a convention this project chose.
 *
 * The test is written against the ONE comparison rule rather than against the
 * |Z| gate specifically: `withinToleranceOnly` is a property of any gate whose
 * acceptance differs from the plain comparison, and pinning it there is what
 * stops the next such gate from shipping the same silence.
 */

import { describe, expect, it } from 'vitest';
import { gateVerdicts } from './gates.ts';
import { AMP_FLOOR_TOLERANCE, acceptedAmpFloor, meetsAmpFloor } from '../../impedanceFloor.ts';

/** The metric values a gate set is judged on, with only |Z| interesting. */
const values = (minZOhm: number | null) => ({
  dissipationFraction: null,
  epdrMinOhm: null,
  minZOhm,
  minZAtHz: 90,
  driveVoltage: [],
});

const zGate = (minZOhm: number | null, limit?: number) =>
  gateVerdicts(limit === undefined ? {} : { ampMinLoadOhm: limit }, values(minZOhm)).find(
    (v) => v.gate === 'M-B/|Z|',
  )!;

describe('(f) the measurement tolerance is visible in the gate status', () => {
  it('3.17 Ω against a 3.20 Ω floor: inside, and it says WHY it is inside', () => {
    // The fixture is the real case, and it must genuinely be the tolerance
    // doing the work - otherwise the test proves nothing about tolerance.
    expect(3.17).toBeLessThan(3.2);
    expect(meetsAmpFloor(3.17, 3.2)).toBe(true);
    expect(3.17).toBeGreaterThanOrEqual(acceptedAmpFloor(3.2));

    const v = zGate(3.17, 3.2);
    expect(v.active).toBe(true);
    expect(v.pass).toBe(true);
    expect(v.withinToleranceOnly).toBe(true);
    expect(v.reason).toContain('inside, but only');
    expect(v.reason).toContain(`${(AMP_FLOOR_TOLERANCE * 100).toFixed(0)} %`);
    // The sentence names the tolerance as a CONVENTION, not as a property of
    // the amplifier: the number came from the app's own component class, and a
    // reader who wants to disagree with it needs to know that.
    expect(v.reason).toContain('project convention');
  });

  it('a comfortable pass is an ordinary pass — the notice does not become wallpaper', () => {
    const v = zGate(3.6, 3.2);
    expect(v.pass).toBe(true);
    expect(v.withinToleranceOnly).toBe(false);
    expect(v.reason).not.toContain('only');
  });

  it('a genuine failure is still a failure, not a tolerance note', () => {
    const v = zGate(2.9, 3.2);
    expect(meetsAmpFloor(2.9, 3.2)).toBe(false);
    expect(v.pass).toBe(false);
    expect(v.withinToleranceOnly).toBe(false);
    expect(v.reason).toContain('falls below');
  });

  it('the boundary is the one `impedanceFloor.ts` sets, not a second copy', () => {
    // Exactly on the accepted floor: inside, and by the tolerance. One ulp
    // under it: out. The point is that this test cannot pass while gates.ts
    // carries its own threshold — it reads the accepted floor from the module
    // that owns it.
    const limit = 3.2;
    const edge = acceptedAmpFloor(limit);
    expect(zGate(edge, limit).pass).toBe(true);
    expect(zGate(edge, limit).withinToleranceOnly).toBe(true);
    expect(zGate(edge * (1 - 1e-9), limit).pass).toBe(false);
  });

  it('an unarmed gate reports its value and claims no tolerance', () => {
    const v = zGate(3.17);
    expect(v.active).toBe(false);
    expect(v.limit).toBeNull();
    expect(v.withinToleranceOnly).toBe(false);
    expect(v.reason).toContain('no limit set');
  });

  it('a gate that could not be evaluated claims no tolerance either', () => {
    const v = zGate(null, 3.2);
    expect(v.active).toBe(true);
    expect(v.pass).toBe(true);
    expect(v.withinToleranceOnly).toBe(false);
    expect(v.reason).toContain('could not be evaluated');
  });

  it('gates WITHOUT a tolerance can never report one', () => {
    // Only the |Z| floor has an `accept` hook. EPDR and M-A are plain
    // comparisons, so a "within tolerance" on either would mean the rule had
    // grown a second acceptance path nobody declared.
    const all = gateVerdicts(
      { minEpdrOhm: 1.6, maxDissipationFraction: 0.35, ampMinLoadOhm: 3.2 },
      {
        dissipationFraction: 0.3500000001,
        epdrMinOhm: 1.5999999,
        minZOhm: 3.17,
        driveVoltage: [],
      },
    );
    const byGate = Object.fromEntries(all.map((v) => [v.gate, v]));
    expect(byGate['M-B/|Z|'].withinToleranceOnly).toBe(true);
    expect(byGate['M-B/EPDR'].withinToleranceOnly).toBe(false);
    expect(byGate['M-B/EPDR'].pass).toBe(false);
    expect(byGate['M-A'].withinToleranceOnly).toBe(false);
    expect(byGate['M-A'].pass).toBe(false);
  });
});
