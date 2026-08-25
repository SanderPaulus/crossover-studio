/**
 * A7 — UNIT TESTS AGAINST HAND CALCULATIONS.
 *
 * The golden-reference suite proves the engine reproduces one real analysis.
 * It cannot prove the formulas are right: a consistent error reproduces just
 * as faithfully as a correct one. These tests take circuits whose answer can
 * be worked out on paper in one line and check the engine against the line.
 *
 * Everything here is synthetic on purpose. A resistive divider has a
 * dissipation that is exactly a ratio of resistances; a load at a known phase
 * angle has an EPDR that is exactly |Z|/(2cos²φ); a Thévenin source made of
 * two resistors has exactly the parallel combination as its source impedance;
 * and a window of T seconds has its floor at exactly 1/T. None of those
 * answers can drift with a fixture.
 */

import { describe, expect, it } from 'vitest';
import { cplx } from '../complex.ts';
import type { Netlist } from '../network.ts';
import { logspace } from '../dsp.ts';
import { buildAnalysis } from './metrics/analysis.ts';
import { dissipation, epdr, iecProgrammeWeight, thevenin } from './metrics/electrical.ts';
import { breakupDivisor } from './metrics/acoustic.ts';
import { headerFloor, keeleCeilingHz, coverageOf, micDistanceOk } from './ingest/validity.ts';
import { parseArtaHeader, parseLooseNumber } from './ingest/manifest.ts';
import {
  BREAKUP_DIV_MILD,
  BREAKUP_DIV_SEVERE,
  BREAKUP_FULL_SEVERITY_DB,
  IEC_60268_1_HP_HZ,
  IEC_60268_1_LP_HZ,
  KEELE_NEARFIELD_HZ_INCH,
} from './constants.ts';

const GRID = logspace(20, 20000, 200);

/**
 * Generator (Eg, negligible Rg) -> R_series -> driver load R_load to ground.
 *
 * Purely resistive, so every frequency behaves identically and the weighted
 * integral collapses to the same ratio the divider has at DC. That is what
 * makes it a hand calculation.
 */
function divider(seriesOhm: number, loadOhm: number): { netlist: Netlist; z: Record<string, ReturnType<typeof cplx>[]> } {
  const netlist: Netlist = {
    nodeCount: 3,
    elements: [
      { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-6 },
      { kind: 'R', id: 'RS', nodes: [1, 2], value: seriesOhm },
      { kind: 'driver', id: 'D', model: 'load', nodes: [2, 0], inverted: false },
    ],
  };
  return { netlist, z: { load: GRID.map(() => cplx(loadOhm, 0)) } };
}

describe('hand calculations', () => {
  describe('M-A - dissipation of a resistive divider', () => {
    it('burns exactly R_s/(R_s+R_load) of the delivered power', () => {
      const seriesOhm = 4;
      const loadOhm = 8;
      const { netlist, z } = divider(seriesOhm, loadOhm);
      const a = buildAnalysis(netlist, GRID, z);
      const d = dissipation(a, { amplifierPowerW: 100 });
      // The whole chain is one current, so the split is by resistance.
      const expected = seriesOhm / (seriesOhm + loadOhm);
      expect(d.totalFraction).toBeCloseTo(expected, 6);
      expect(d.totalWatts!).toBeCloseTo(expected * 100, 4);
      expect(d.elements[0].id).toBe('RS');
    });

    it('is INDEPENDENT of the generator voltage - the V1 normalisation trap', () => {
      // A4 records this as the mistake that was actually made: the currents
      // come out of the solver at whatever Eg the schematic carries, so a
      // dissipation that is not normalised on Eg² silently scales with it.
      const { netlist, z } = divider(4, 8);
      const at2v83 = dissipation(buildAnalysis(netlist, GRID, z));
      const louder: Netlist = {
        ...netlist,
        elements: netlist.elements.map((e) =>
          e.kind === 'source' ? { ...e, volts: 28.3 } : e,
        ),
      };
      const at28v3 = dissipation(buildAnalysis(louder, GRID, z));
      // Not bit-identical, and it should not be: the two runs solve the same
      // matrix scaled by ten, so they round differently in the last places.
      // What must hold is that the RESULT does not depend on the scale, and a
      // part in 10^9 is a rounding difference rather than a scaling one.
      expect(at28v3.totalFraction).toBeCloseTo(at2v83.totalFraction, 8);
    });

    it('the programme weighting is pink, with a first-order shelf at each norm edge', () => {
      // Measured against the pure pink asymptote 1/f: at each norm edge a
      // first-order shelf is exactly half power, and in between the weighting
      // is pink to within a percent or two.
      const pink = (f: number) => 1 / f;
      expect(iecProgrammeWeight(IEC_60268_1_HP_HZ) / pink(IEC_60268_1_HP_HZ)).toBeCloseTo(0.5, 3);
      expect(iecProgrammeWeight(IEC_60268_1_LP_HZ) / pink(IEC_60268_1_LP_HZ)).toBeCloseTo(0.5, 3);
      expect(iecProgrammeWeight(400) / pink(400)).toBeCloseTo(1, 1);
      // And it rolls off outside them, in both directions.
      expect(iecProgrammeWeight(10) / pink(10)).toBeLessThan(0.1);
      expect(iecProgrammeWeight(50000) / pink(50000)).toBeLessThan(0.02);
    });
  });

  describe('M-B - EPDR at a known phase angle', () => {
    it('equals |Z|/(2cos^2 phi) - and at 60 degrees that is exactly 2|Z|', () => {
      // cos 60 deg = 1/2, so 2cos^2 = 1/2 and EPDR = 2|Z|. A load of 8 ohm at
      // 60 degrees presents 16 ohm-equivalent... and at -60 the same, since
      // the cosine is squared.
      const mag = 8;
      for (const deg of [60, -60]) {
        const rad = (deg * Math.PI) / 180;
        const netlist: Netlist = {
          nodeCount: 2,
          elements: [
            { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-9 },
            { kind: 'driver', id: 'D', model: 'load', nodes: [1, 0], inverted: false },
          ],
        };
        const z = { load: GRID.map(() => cplx(mag * Math.cos(rad), mag * Math.sin(rad))) };
        const e = epdr(buildAnalysis(netlist, GRID, z));
        expect(e.minOhm).toBeCloseTo(2 * mag, 3);
        expect(e.minZOhm).toBeCloseTo(mag, 3);
      }
    });

    it('a purely resistive load has EPDR = |Z|/2', () => {
      const netlist: Netlist = {
        nodeCount: 2,
        elements: [
          { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-9 },
          { kind: 'driver', id: 'D', model: 'load', nodes: [1, 0], inverted: false },
        ],
      };
      const e = epdr(buildAnalysis(netlist, GRID, { load: GRID.map(() => cplx(6, 0)) }));
      expect(e.minOhm).toBeCloseTo(3, 6);
    });
  });

  describe('M-E - Thevenin of a known divider', () => {
    it('sees R_s in parallel with the generator, i.e. R_s itself when Rg -> 0', () => {
      const seriesOhm = 3.3;
      const { netlist, z } = divider(seriesOhm, 8);
      const a = buildAnalysis(netlist, GRID, z);
      const t = thevenin(a, 'load', 1000, { ohm: 6, source: 'test' })!;
      // Looking back from the driver: R_series in series with the generator's
      // own (near zero) source resistance.
      expect(t.rsOhm).toBeCloseTo(seriesOhm, 4);
      expect(Math.abs(t.zs[0].im)).toBeLessThan(1e-6);
      // Q multiplication is (R_e + R_s)/R_e with the R_e that was supplied.
      expect(t.qMultiplier!).toBeCloseTo((6 + seriesOhm) / 6, 6);
    });

    it('a shunt resistor across the driver lowers the source resistance it sees', () => {
      const netlist: Netlist = {
        nodeCount: 3,
        elements: [
          { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-6 },
          { kind: 'R', id: 'RS', nodes: [1, 2], value: 4 },
          { kind: 'R', id: 'RP', nodes: [2, 0], value: 4 },
          { kind: 'driver', id: 'D', model: 'load', nodes: [2, 0], inverted: false },
        ],
      };
      const a = buildAnalysis(netlist, GRID, { load: GRID.map(() => cplx(8, 0)) });
      const t = thevenin(a, 'load', 1000, null)!;
      // 4 || 4 = 2 ohm, the classic L-pad result.
      expect(t.rsOhm).toBeCloseTo(2, 4);
      expect(t.qMultiplier).toBeNull(); // no R_e supplied, so no Q claim
      expect(t.reSource).toContain('not supplied');
    });
  });

  describe('A5b.1 - the header floor from a synthetic header', () => {
    const header = (right: string, reference: string) =>
      parseArtaHeader([
        'Source file = synthetic.pir',
        'Sample rate = 48000',
        'Left window = 0 ms, Rectangular',
        `Reference time = ${reference} ms`,
        `Right window = ${right} ms, Tukey 0.25`,
      ]);

    it('T = right window - reference time, floor = 1/T, fine detail = 2/T', () => {
      const h = header('10', '0');
      expect(h.effectiveWindowMs).toBeCloseTo(10, 9);
      const f = headerFloor({ file: 'x', driver: 'd', kind: 'FF', header: h })!;
      expect(f.hardHz).toBeCloseTo(100, 9); // 1 / 10 ms
      expect(f.fineHz).toBeCloseTo(200, 9); // 2 / 10 ms
    });

    it('reads locale decimals, and subtracts the reference time', () => {
      // Exactly the shape ARTA writes: a comma decimal beside a dot decimal.
      const h = header('5,021', '2,5');
      expect(h.effectiveWindowMs).toBeCloseTo(2.521, 9);
      expect(h.rightTaper).toEqual({ kind: 'Tukey', alpha: 0.25 });
      const f = headerFloor({ file: 'x', driver: 'd', kind: 'FF', header: h })!;
      expect(f.hardHz).toBeCloseTo(1000 / 2.521, 6);
    });

    it('a header without window fields yields NO floor, rather than a guess', () => {
      const h = parseArtaHeader(['Source file = mystery.pir']);
      expect(headerFloor({ file: 'x', driver: 'd', kind: 'FF', header: h })).toBeNull();
      expect(headerFloor({ file: 'x', driver: 'd', kind: 'FF' })).toBeNull();
    });

    it('parseLooseNumber takes the first number and accepts either decimal mark', () => {
      expect(parseLooseNumber('5,021 ms, Tukey 0.25')).toBeCloseTo(5.021, 9);
      expect(parseLooseNumber('0.25')).toBeCloseTo(0.25, 9);
      expect(parseLooseNumber('none')).toBeUndefined();
    });
  });

  describe('Keele near-field limits', () => {
    it('f_max = 4311 / D_inch, and nothing without a diameter', () => {
      expect(keeleCeilingHz(4)!).toBeCloseTo(KEELE_NEARFIELD_HZ_INCH / 4, 9);
      expect(keeleCeilingHz(undefined)).toBeNull();
      expect(keeleCeilingHz(0)).toBeNull();
    });

    it('the microphone rule is 0.11 x radius, and unknown without both numbers', () => {
      const base = { file: 'x', driver: 'd', kind: 'NF' as const, diameterInch: 4 };
      // radius = 2 inch = 50.8 mm; 0.11 x 50.8 = 5.588 mm
      expect(micDistanceOk({ ...base, micDistanceMm: 5 })).toBe(true);
      expect(micDistanceOk({ ...base, micDistanceMm: 10 })).toBe(false);
      expect(micDistanceOk(base)).toBeNull();
      expect(micDistanceOk({ file: 'x', driver: 'd', kind: 'NF', micDistanceMm: 5 })).toBeNull();
    });
  });

  describe('coverage arithmetic (A5.5)', () => {
    it('is measured in OCTAVES, so a low band is not automatically a failure', () => {
      // Wanted one octave, got half of it: 50 %, whatever the frequencies are.
      const low = coverageOf([100, 200], { fromHz: 100, toHz: 141.42, fromBy: 'a', toBy: 'b' });
      const high = coverageOf([10000, 20000], { fromHz: 10000, toHz: 14142, fromBy: 'a', toBy: 'b' });
      expect(low.fraction).toBeCloseTo(0.5, 3);
      expect(high.fraction).toBeCloseTo(0.5, 3);
    });

    it('a band entirely outside the valid data is NOT EVALUATED, not silently empty', () => {
      const c = coverageOf([100, 200], { fromHz: 400, toHz: 800, fromBy: 'gate', toBy: 'sweep' });
      expect(c.evaluatedHz).toBeNull();
      expect(c.fraction).toBe(0);
      expect(c.flagged).toBe(true);
      expect(c.describe).toContain('NOT EVALUATED');
    });

    it('full coverage names both limiters and is not flagged', () => {
      const c = coverageOf([100, 200], { fromHz: 50, toHz: 400, fromBy: 'gate', toBy: 'sweep' });
      expect(c.fraction).toBeCloseTo(1, 9);
      expect(c.flagged).toBe(false);
      expect(c.describe).toContain('100');
    });
  });

  describe('M-H severity weighting (explicitly uncalibrated)', () => {
    it('hits the published endpoints exactly, and ramps between them', () => {
      expect(breakupDivisor(BREAKUP_FULL_SEVERITY_DB)).toBeCloseTo(BREAKUP_DIV_SEVERE, 9);
      expect(breakupDivisor(20)).toBeCloseTo(BREAKUP_DIV_SEVERE, 9); // clamped
      expect(breakupDivisor(0)).toBeCloseTo(BREAKUP_DIV_MILD, 9);
      expect(breakupDivisor(-5)).toBeCloseTo(BREAKUP_DIV_MILD, 9); // clamped
      const half = breakupDivisor(BREAKUP_FULL_SEVERITY_DB / 2);
      expect(half).toBeGreaterThan(BREAKUP_DIV_MILD);
      expect(half).toBeLessThan(BREAKUP_DIV_SEVERE);
    });
  });
});
