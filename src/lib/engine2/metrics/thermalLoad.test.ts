/**
 * M-M — THE DRIVER'S THERMAL LOAD AGAINST ITS OWN RATING, in the four shapes
 * the metric procedure asks for: a HAND CALCULATION on a network small enough
 * to solve on paper, the OFF states with the missing input NAMED (P4/F0), a
 * NEW MEASUREMENT (change an input, the derived figure moves the way physics
 * says), and the bridge to M-A (the same weighting and the same normalisation,
 * not a second integral of its own).
 */

import { describe, expect, it } from 'vitest';
import { cplx, type Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { buildAnalysis } from './analysis.ts';
import { dissipation, iecProgrammeWeight } from './electrical.ts';
import {
  DRIVER_THERMAL_VERSION,
  butterworthHighPassPowerGain,
  driverThermalLoad,
  type DriverPowerRating,
} from './thermalLoad.ts';

/**
 * The paper network: generator (Rg 1 mΩ) straight into a purely resistive 8 Ω
 * driver. With no filter and no other branch the driver takes ALL of the
 * accepted power, so the delivered fraction is 1 by inspection — which is what
 * makes every figure below checkable without a solver.
 */
const GRID = [100, 1000, 10000];
const DRIVER_Z: Complex[] = GRID.map(() => cplx(8, 0));
const bare: Netlist = {
  elements: [
    { kind: 'source', id: 'G', volts: 2.83, seriesR: 1e-3, nodes: [1, 0] },
    { kind: 'driver', id: 'D1', model: 'tw', nodes: [1, 0], inverted: false },
  ],
  nodeCount: 2,
} as unknown as Netlist;

/** The same driver behind a 2 Ω series resistor: it now takes a known share. */
const padded: Netlist = {
  elements: [
    { kind: 'source', id: 'G', volts: 2.83, seriesR: 1e-3, nodes: [1, 0] },
    { kind: 'R', id: 'R1', value: 2, nodes: [1, 2] },
    { kind: 'driver', id: 'D1', model: 'tw', nodes: [2, 0], inverted: false },
  ],
  nodeCount: 3,
} as unknown as Netlist;

const RATING: DriverPowerRating = {
  ratedPowerW: 100,
  testFilterOrder: 2,
  testFilterHz: 2200,
  testFilterHzSource: 'assumed from the recommended range',
};

const analysisOf = (n: Netlist) => buildAnalysis(n, GRID, { tw: DRIVER_Z });

describe('M-M — the quantity', () => {
  it('carries a version string', () => {
    expect(DRIVER_THERMAL_VERSION).toMatch(/^driver-thermal\/\d+\.\d+$/);
  });

  it('the Butterworth gain is the textbook one, by hand', () => {
    // |B_n|² = 1 / (1 + (fc/f)^2n): half power at the corner, whatever the order.
    for (const n of [1, 2, 3, 4]) expect(butterworthHighPassPowerGain(2200, 2200, n)).toBeCloseTo(0.5, 12);
    // An octave above the corner at order 2: 1/(1+0.5^4) = 0.9412.
    expect(butterworthHighPassPowerGain(4400, 2200, 2)).toBeCloseTo(1 / (1 + 0.5 ** 4), 12);
    // An octave below, order 2: 1/(1+2^4) = 0.0588.
    expect(butterworthHighPassPowerGain(1100, 2200, 2)).toBeCloseTo(1 / (1 + 2 ** 4), 12);
  });

  /* HAND CALCULATION. One driver, no filter, no other branch: the driver takes
   * everything the network accepts, so the delivered fraction is exactly 1 —
   * up to the 1 mΩ the generator burns in itself. */
  it('a lone driver takes the whole accepted power: delivered fraction 1', () => {
    const r = driverThermalLoad(analysisOf(bare), 'tw', RATING, 100);
    expect(r.deliveredFraction).toBeCloseTo(1, 3);
    expect(r.deliveredWatts).toBeCloseTo(100, 1);
  });

  /* And behind a 2 Ω series resistor: the fraction is what the driver takes
   * RELATIVE TO UNFILTERED, so it is |H|² and not the divider itself. On a
   * purely resistive load that is frequency-independent: (8/(8+2))² = 0.64. */
  it('behind a 2 Ω series resistor it takes |H|² = (8/10)² of what it would take bare', () => {
    const r = driverThermalLoad(analysisOf(padded), 'tw', RATING, 100);
    expect(r.deliveredFraction).toBeCloseTo((8 / 10) ** 2, 3);
    expect(r.deliveredWatts).toBeCloseTo(64, 1);
  });

  /* THE CERTIFIED SIDE, by hand on the same three-point grid. With a resistive
   * driver the conductance is constant, so the certified fraction is the
   * weighted mean of |B_n|² over the grid — a trapezium sum this test does
   * itself rather than trusting the module's own arithmetic. */
  it('the certified fraction is the weighted mean of the test filter, computed independently', () => {
    const r = driverThermalLoad(analysisOf(bare), 'tw', RATING, 100);
    const w = GRID.map((f) => iecProgrammeWeight(f) * (1 / 8));
    const trap = (y: number[]) =>
      GRID.slice(1).reduce((a, f, i) => a + ((y[i] + y[i + 1]) / 2) * (f - GRID[i]), 0);
    const expected =
      trap(GRID.map((f, i) => w[i] * butterworthHighPassPowerGain(f, 2200, 2))) / trap(w);
    expect(r.certifiedFraction).toBeCloseTo(expected, 12);
    expect(r.certifiedWatts).toBeCloseTo(100 * expected, 10);
    expect(r.ratio).toBeCloseTo(r.deliveredWatts! / r.certifiedWatts!, 12);
  });

  /* ONE DENOMINATOR FOR BOTH SIDES — the claim the whole metric rests on, and
   * the one the first version got wrong (it normalised the delivered side on
   * the SYSTEM's accepted power and the certified side on the driver's own, so
   * the ratio compared two different denominators and read 0.14 where it
   * should read about 1). Stated as an identity: give the network the SAME
   * transfer the test filter has, and the two fractions must be equal to the
   * last bit. */
  it('the two sides share one denominator: an identical filter gives identical fractions', () => {
    const a = analysisOf(bare);
    const asButterworth = {
      ...a,
      transferByModel: {
        tw: GRID.map((f) => cplx(Math.sqrt(butterworthHighPassPowerGain(f, 2200, 2)), 0)),
      },
    };
    const r = driverThermalLoad(asButterworth, 'tw', RATING, 100);
    expect(r.deliveredFraction).toBeCloseTo(r.certifiedFraction!, 12);
    expect(r.ratio).toBeCloseTo(100 / RATING.ratedPowerW, 12);
  });

  /* AND IT IS NOT M-A's DENOMINATOR, deliberately. M-A normalises on the power
   * the whole loudspeaker accepts, because a dissipation FRACTION is a
   * statement about the system. M-M normalises on this driver unfiltered,
   * because its whole question is "what does the filter in front of this
   * driver do", and the manufacturer's rating is an answer to that same
   * question. The two are different quantities and the test says so rather
   * than letting a later reader assume they are the same. */
  it('M-A’s fraction and M-M’s are different quantities on the same network', () => {
    const a = analysisOf(padded);
    const m = driverThermalLoad(a, 'tw', RATING, 100);
    const d = dissipation(a, { amplifierPowerW: 100 });
    const inResistors = d.elements.reduce((s, e) => s + e.fraction, 0);
    // M-A: the 2 Ω burns 2/10 of the accepted power, the driver the rest.
    expect(inResistors).toBeCloseTo(0.2, 3);
    // M-M: the driver takes (8/10)² of what it would take bare. Not 0.8.
    expect(m.deliveredFraction).toBeCloseTo(0.64, 3);
  });
});

describe('M-M — the off states, each naming the input that is missing (P4)', () => {
  it('no rating: the delivered load is still reported, and the sentence says nothing judges it', () => {
    const r = driverThermalLoad(analysisOf(bare), 'tw', null, 100);
    expect(r.certifiedFraction).toBeNull();
    expect(r.certifiedWatts).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.deliveredFraction).toBeCloseTo(1, 3);
    expect(r.reason).toMatch(/no power rating stated/);
    expect(r.note).toMatch(/nothing judges it/);
  });

  it('no continuous power: watts cannot be compared, and it says so — never a 1× verdict', () => {
    const r = driverThermalLoad(analysisOf(bare), 'tw', RATING, null);
    expect(r.certifiedWatts).not.toBeNull();
    expect(r.deliveredWatts).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.reason).toMatch(/no continuous power/);
  });

  it('a rating with a missing half is OFF, and the half is named', () => {
    const grid = analysisOf(bare);
    for (const [patch, word] of [
      [{ ratedPowerW: 0 }, /rated power/],
      [{ testFilterOrder: 0 }, /order/],
      [{ testFilterHz: 0 }, /corner frequency/],
    ] as const) {
      const r = driverThermalLoad(grid, 'tw', { ...RATING, ...patch }, 100);
      expect(r.reason, JSON.stringify(patch)).toMatch(word);
      expect(r.certifiedWatts).toBeNull();
    }
  });

  it('a driver the network does not contain is off, not zero (F0)', () => {
    const r = driverThermalLoad(analysisOf(bare), 'mid', RATING, 100);
    expect(r.deliveredFraction).toBeNull();
    expect(r.reason).toMatch(/no solved transfer|no measured impedance/);
  });
});

describe('M-M — new measurement: the derived figure moves the way physics says', () => {
  it('a HIGHER test corner certifies LESS power — the manufacturer tested a smaller share', () => {
    const a = analysisOf(bare);
    const low = driverThermalLoad(a, 'tw', { ...RATING, testFilterHz: 1100 }, 100);
    const high = driverThermalLoad(a, 'tw', { ...RATING, testFilterHz: 4400 }, 100);
    expect(high.certifiedWatts!).toBeLessThan(low.certifiedWatts!);
    // …and the delivered side did not move: it is a property of the network.
    expect(high.deliveredFraction).toBeCloseTo(low.deliveredFraction!, 12);
  });

  it('a STEEPER test filter certifies less at the same corner', () => {
    const a = analysisOf(bare);
    const second = driverThermalLoad(a, 'tw', { ...RATING, testFilterOrder: 2 }, 100);
    const fourth = driverThermalLoad(a, 'tw', { ...RATING, testFilterOrder: 4 }, 100);
    expect(fourth.certifiedWatts!).toBeLessThan(second.certifiedWatts!);
  });

  it('twice the rated power certifies twice the watts, and the ratio halves', () => {
    const a = analysisOf(bare);
    const one = driverThermalLoad(a, 'tw', RATING, 100);
    const two = driverThermalLoad(a, 'tw', { ...RATING, ratedPowerW: 200 }, 100);
    expect(two.certifiedWatts!).toBeCloseTo(2 * one.certifiedWatts!, 10);
    expect(two.ratio!).toBeCloseTo(one.ratio! / 2, 10);
  });

  it('twice the system power doubles the delivered watts and the ratio', () => {
    const a = analysisOf(bare);
    const one = driverThermalLoad(a, 'tw', RATING, 100);
    const two = driverThermalLoad(a, 'tw', RATING, 200);
    expect(two.deliveredWatts!).toBeCloseTo(2 * one.deliveredWatts!, 10);
    expect(two.ratio!).toBeCloseTo(2 * one.ratio!, 10);
    // The FRACTION is scale-free and does not move — the M-A shape.
    expect(two.deliveredFraction).toBeCloseTo(one.deliveredFraction!, 12);
  });

  /* THE SENTENCE IS PART OF THE METRIC. Above the rating it must say UNPROVEN
   * rather than "fails": a rating is a survived power, and the difference is
   * the whole of what this metric may and may not claim. */
  it('above the rating the sentence says UNPROVEN, and below it does not', () => {
    const a = analysisOf(bare);
    const over = driverThermalLoad(a, 'tw', RATING, 100);
    expect(over.ratio!).toBeGreaterThan(1);
    expect(over.note).toMatch(/UNPROVEN, not proven fatal/);
    const under = driverThermalLoad(a, 'tw', { ...RATING, ratedPowerW: 100000 }, 100);
    expect(under.ratio!).toBeLessThan(1);
    expect(under.note).not.toMatch(/UNPROVEN/);
  });

  /* And the assumption travels (A3h): a corner read off the recommended range
   * is not a stated fact, and the sentence carries the provenance. */
  it('an assumed test corner is marked as one in the sentence', () => {
    const r = driverThermalLoad(analysisOf(bare), 'tw', RATING, 100);
    expect(r.note).toContain('assumed from the recommended range');
    const stated = driverThermalLoad(analysisOf(bare), 'tw', { ...RATING, testFilterHzSource: undefined }, 100);
    expect(stated.note).not.toContain('assumed');
  });
});
