import { describe, expect, it } from 'vitest';
import { logspace } from './dsp.ts';
import {
  DEFAULT_FLOOR_SHAPE,
  IEC_MIN_FRACTION,
  checkFloor,
  claimableNominalOhm,
  floorCurve,
  nominalFromDrivers,
  nominalVerdict,
  relaxAt,
  requiredMinOhm,
} from './impedanceFloor.ts';

const grid = logspace(20, 20000, 400);

describe('the floor is derived, and the derivation is what is pinned', () => {
  it('nominal is what may be CLAIMED, rounded down through the real series', () => {
    // IEC 60268-5: minimum >= 80 % of rated.
    expect(requiredMinOhm(4)).toBeCloseTo(3.2, 9);
    expect(requiredMinOhm(8)).toBeCloseTo(6.4, 9);
    // Rounded DOWN: the question is what goes on the plate, and rounding up
    // prints a number the design does not meet.
    expect(claimableNominalOhm(3.3)).toBe(4);
    expect(claimableNominalOhm(3.1)).toBe(2);
    expect(claimableNominalOhm(6.5)).toBe(8);
    expect(claimableNominalOhm(1.5)).toBeNull();
  });

  it("Sanders own design: 2.62 ohm may not be sold as 4 ohm", () => {
    /* The knife edge is the point. His delivered minimum is 2.62 and 4 ohm
     * nominal demands 3.2, so the honest plate says 2 ohm. His bare woofer
     * pair reads 3.17, which misses a 4 ohm claim by 1 % — that near miss is
     * precisely the "is 4 ohm nominal realistic" question, answered by the
     * standard rather than by an opinion. */
    expect(claimableNominalOhm(2.62)).toBe(2);
    expect(claimableNominalOhm(3.17)).toBe(2);
    expect(claimableNominalOhm(3.21)).toBe(4);
  });

  it('the limit comes from the DRIVERS, not from the delivered design', () => {
    /* Otherwise it grades its own homework: any minimum can claim the nominal
     * it happens to support, and the constraint becomes vacuous. */
    // Sanders branches: woofer pair 3.17, mid 3.64, tweeter 5.63.
    expect(nominalFromDrivers([3.17, 3.64, 5.63])).toBe(2);
    // A set that genuinely supports 4 ohm.
    expect(nominalFromDrivers([3.4, 4.1, 6.0])).toBe(4);
    // The weakest branch decides — the system can be no better than it.
    expect(nominalFromDrivers([7.0, 7.5, 3.3])).toBe(4);
    expect(nominalFromDrivers([])).toBeNull();
  });

  it('drivers below the lowest standard value support NO nominal, explicitly', () => {
    /* A 4 Ω driver measuring 1.5 Ω, or four in parallel — these sets exist and
     * someone will load one. 2 Ω nominal already demands 1.6 Ω, so there is no
     * standard value to hold the design to, and NULL is the answer rather than
     * a quiet fallback to the smallest one. Falling back would hand the design
     * a floor its drivers can never meet and then blame the filter for it. */
    expect(nominalFromDrivers([1.5])).toBeNull();
    const v = nominalVerdict([1.5, 6.0, 8.0]);
    expect(v.nominalOhm).toBeNull();
    expect(v.weakestOhm).toBeCloseTo(1.5, 9);
    expect(v.line).toMatch(/NO standard nominal/);
    // And it names the mechanism, because the remedy is not a filter change.
    expect(v.line).toMatch(/wiring decision, not a filter one/);
    // Exactly at the boundary it flips, with no gap in between.
    expect(nominalVerdict([1.6]).nominalOhm).toBe(2);
    expect(nominalVerdict([1.5999]).nominalOhm).toBeNull();
    // No data is a different answer again, and says so.
    expect(nominalVerdict([]).line).toMatch(/nothing to derive/);
  });

  it('a healthy set states the nominal it will be held to, and why', () => {
    const v = nominalVerdict([3.17, 3.64, 5.63]);
    expect(v.nominalOhm).toBe(2);
    expect(v.line).toMatch(/IEC 60268-5/);
    expect(v.line).toMatch(/1\.6 Ω/);
  });

  it('the floor is FLAT where programme energy is flat per octave', () => {
    // Up to the knee, pink-noise reasoning: equal energy per octave means the
    // band-limited drive voltage does not fall, so neither may the floor.
    expect(relaxAt(20)).toBe(1);
    expect(relaxAt(200)).toBe(1);
    expect(relaxAt(1000)).toBe(1);
    expect(relaxAt(999)).toBe(1);
  });

  it('and relaxes above it by HALF the measured programme slope, capped', () => {
    /* One octave up is 10^(3/20) = 1.4125 — NOT sqrt(2). A factor sqrt(2)
     * needs 3.0103 dB, and writing the round number means accepting the round
     * number's value rather than quietly meaning the other one. */
    expect(relaxAt(2000)).toBeCloseTo(Math.pow(10, 3 / 20), 9);
    expect(relaxAt(2000)).not.toBeCloseTo(Math.SQRT2, 6);
    // The cap bites just past two octaves (10^(6/20) = 1.995), and holds.
    expect(relaxAt(4000)).toBeCloseTo(Math.pow(10, 6 / 20), 9);
    expect(relaxAt(8000)).toBe(2);
    expect(relaxAt(20000)).toBe(2);
    /* THE CAP IS THE POINT. Measured corpora put the long-term average near
     * -6 dB/oct; tracking that exactly would let the floor decay to nothing by
     * 20 kHz and license a dip a single loud cymbal can still find. Half the
     * slope, capped at a factor two, is deliberately timid. */
    const untamed = Math.pow(10, (6 * Math.log2(20000 / 1000)) / 20);
    expect(untamed).toBeGreaterThan(11); // what "just follow the average" gives
    expect(relaxAt(20000)).toBe(2);
  });

  it('the curve says its own reasoning out loud', () => {
    const c = floorCurve(grid, 4);
    expect(c.baseOhm).toBeCloseTo(3.2, 9);
    expect(c.line).toMatch(/IEC 60268-5/);
    expect(c.line).toMatch(/CURRENT/);
    expect(c.line).toMatch(/I = U\/\|Z\|/);
    // Flat below the knee, relaxed above, monotone in between.
    const at = (hz: number) => c.floorOhm[grid.findIndex((f) => f >= hz)];
    expect(at(100)).toBeCloseTo(3.2, 6);
    expect(at(2000)).toBeLessThan(3.2);
    expect(at(8000)).toBeCloseTo(1.6, 1);
  });

  it('a dip at 82 Hz and the same dip at 3 kHz are judged differently', () => {
    /* Sanders framing, and the whole reason the floor has a shape: music has
     * orders more energy in the bass, so the current drawn there is
     * incomparably higher. A flat threshold rejects good designs and passes
     * bad ones. */
    const c = floorCurve(grid, 4);
    const dipAt = (hz: number, ohm: number) =>
      checkFloor(grid, grid.map((f2) => (Math.abs(Math.log2(f2 / hz)) < 0.1 ? ohm : 10)), c);
    const low = dipAt(82, 2.6);
    const high = dipAt(3000, 2.6);
    expect(low.ok).toBe(false); // 2.6 against 3.2 in the bass
    expect(high.ok).toBe(true); // the same 2.6 clears the relaxed floor up there
    // Compare the FLOOR itself, not the verdict's report field: on a passing
    // verdict that field is a default, and asserting against a default proves
    // nothing (it compared 3.2 with 3.2 and looked like a real check).
    const floorAt = (hz: number) => c.floorOhm[grid.findIndex((f) => f >= hz)];
    expect(floorAt(3000)).toBeLessThan(floorAt(82));
    expect(low.floorThereOhm).toBeCloseTo(3.2, 6);
  });

  it('a verdict quotes the floor that applied, so it can be argued with', () => {
    const c = floorCurve(grid, 4);
    const v = checkFloor(grid, grid.map(() => 2.62), c);
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/against a floor of/);
    expect(v.shortOhm).toBeCloseTo(3.2 - 2.62, 2);
    // In the bass, where the floor is at its strictest.
    expect(v.atHz).toBeLessThan(DEFAULT_FLOOR_SHAPE.kneeHz);
  });

  it('a design that clears it says so plainly', () => {
    const c = floorCurve(grid, 2);
    const v = checkFloor(grid, grid.map(() => 2.62), c);
    expect(v.ok).toBe(true);
    expect(v.shortOhm).toBe(0);
    expect(v.line).toMatch(/clears the 2 Ω floor/);
  });

  it('IEC_MIN_FRACTION is the one place the 80 % lives', () => {
    expect(IEC_MIN_FRACTION).toBe(0.8);
    for (const n of [2, 4, 6, 8, 16]) {
      expect(requiredMinOhm(n)).toBeCloseTo(IEC_MIN_FRACTION * n, 12);
      // And the round trip holds exactly at the boundary.
      expect(claimableNominalOhm(requiredMinOhm(n))).toBe(n);
    }
  });
});
