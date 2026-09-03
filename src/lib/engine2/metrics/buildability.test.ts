/**
 * V50 — BUILDABILITY as pure functions, in the four shapes the metric skill
 * asks for: a HAND CALCULATION on a network small enough to solve on paper,
 * the OFF states with the missing input named (P4/F0), a NEW MEASUREMENT
 * (change the input, the derived figure moves the way physics says), and the
 * bridge to M-A (the watts are M-A's own elements, not a second integral).
 */

import { describe, expect, it } from 'vitest';
import { cplx, type Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { buildAnalysis } from './analysis.ts';
import { dissipation } from './electrical.ts';
import {
  BUILDABILITY_VERSION,
  coilLoads,
  resistorLoads,
  worstCoil,
  worstResistor,
} from './buildability.ts';

/**
 * The paper network: generator (Rg 0) → L1 (1 mH) → R1 (2 Ω) → driver (a
 * pure 8 Ω), with R2 (100 Ω) shunting the driver. Every current is a single
 * complex division, so every figure below is checkable by hand.
 */
const GRID = [100, 1000, 10000];
const DRIVER_Z: Complex[] = GRID.map(() => cplx(8, 0));
const netlist: Netlist = {
  elements: [
    // Rg 1 mΩ rather than 0: the solver divides the delivered current by Rg.
    { kind: 'source', id: 'G', volts: 2.83, seriesR: 1e-3, nodes: [1, 0] },
    { kind: 'L', id: 'L1', value: 1e-3, seriesR: 0, nodes: [1, 2] },
    { kind: 'R', id: 'R1', value: 2, nodes: [2, 3] },
    { kind: 'R', id: 'R2', value: 100, nodes: [3, 0] },
    { kind: 'driver', id: 'D1', model: 'w', nodes: [3, 0], inverted: false },
  ],
  nodeCount: 4,
} as unknown as Netlist;

const analysis = () => buildAnalysis(netlist, GRID, { w: DRIVER_Z });

describe('V50 — buildability', () => {
  it('carries a version string', () => {
    expect(BUILDABILITY_VERSION).toMatch(/^buildability\/\d+\.\d+$/);
  });

  it('coil peak current, by hand: |I| = V_peak / |Z_total| at the frequency where |Z| is smallest', () => {
    const a = analysis();
    const loads = coilLoads(a, { peakInputVolts: 50 });
    expect(loads).toHaveLength(1);
    const l1 = loads[0];
    expect(l1.id).toBe('L1');
    // Load seen by the coil: Rg + R1 + (R2 ∥ 8 Ω) = 0.001 + 2 + 7.4074 = 9.4084 Ω, plus jωL.
    // At 100 Hz: |Z| = √(9.4084² + 0.6283²) = 9.4294 Ω → 50 / 9.4294 = 5.303 A.
    expect(l1.atHz).toBe(100);
    expect(l1.peakA!).toBeCloseTo(50 / Math.hypot(0.001 + 2 + (100 * 8) / 108, 2 * Math.PI * 100 * 1e-3), 3);
    // No rating anywhere: reported, not rated.
    expect(l1.allowedA).toBeNull();
    expect(l1.ratingSource).toBeNull();
  });

  it('resistor watts are M-A\'s own elements — the same fraction, times the stated power', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const loads = resistorLoads(d, { continuousPowerW: 100, resistorClassW: 10, marginFraction: 0.5 });
    expect(loads.map((l) => l.id).sort()).toEqual(['R1', 'R2']);
    for (const l of loads) {
      const e = d.elements.find((x) => x.id === l.id)!;
      expect(l.fraction).toBe(e.fraction);
      expect(l.watts).toBeCloseTo(e.fraction * 100, 12);
      expect(l.allowedW).toBe(5);
      expect(l.ratingSource).toBe('stated resistor class');
    }
    // The series 2 Ω carries the whole current; the 100 Ω shunt a fraction of it.
    const r1 = loads.find((l) => l.id === 'R1')!;
    const r2 = loads.find((l) => l.id === 'R2')!;
    expect(r1.watts!).toBeGreaterThan(r2.watts!);
  });

  it('OFF states name the missing input: no power → no watts; no margin → no allowance; no peak → no current', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const noPower = resistorLoads(d, { resistorClassW: 10, marginFraction: 0.5 });
    expect(noPower.every((l) => l.watts === null)).toBe(true);
    expect(noPower.every((l) => l.allowedW === 5)).toBe(true);
    const noMargin = resistorLoads(d, { continuousPowerW: 100, resistorClassW: 10 });
    expect(noMargin.every((l) => l.allowedW === null && l.ratingW === 10)).toBe(true);
    const noClass = resistorLoads(d, { continuousPowerW: 100, marginFraction: 0.5 });
    expect(noClass.every((l) => l.allowedW === null && l.ratingW === null)).toBe(true);
    const noPeak = coilLoads(a, { coilClassA: 3 });
    expect(noPeak[0].peakA).toBeNull();
    expect(noPeak[0].atHz).toBeNull();
    expect(noPeak[0].allowedA).toBe(3);
  });

  it('a catalogue rating on the part outranks the stated class, and names its SKU', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    const loads = resistorLoads(d, {
      continuousPowerW: 100,
      resistorClassW: 10,
      marginFraction: 0.5,
      ratings: { R1: { powerW: 20, source: 'catalogue SKU-20W' } },
    });
    expect(loads.find((l) => l.id === 'R1')!.allowedW).toBe(10);
    expect(loads.find((l) => l.id === 'R1')!.ratingSource).toBe('catalogue SKU-20W');
    expect(loads.find((l) => l.id === 'R2')!.allowedW).toBe(5);
    const coils = coilLoads(a, {
      peakInputVolts: 50,
      coilClassA: 3,
      ratings: { L1: { maxCurrentA: 6, source: 'catalogue SKU-CORE' } },
    });
    expect(coils[0].allowedA).toBe(6);
    expect(coils[0].ratingSource).toBe('catalogue SKU-CORE');
  });

  it('NEW MEASUREMENT: doubling the peak input doubles every coil current and moves nothing else', () => {
    const a = analysis();
    const one = coilLoads(a, { peakInputVolts: 25 });
    const two = coilLoads(a, { peakInputVolts: 50 });
    expect(two[0].peakA!).toBeCloseTo(2 * one[0].peakA!, 12);
    expect(two[0].atHz).toBe(one[0].atHz);
    // ...and doubling the continuous power doubles every resistor's watts while the fraction stands.
    const d = dissipation(a, { amplifierPowerW: 100 });
    const p1 = resistorLoads(d, { continuousPowerW: 100 });
    const p2 = resistorLoads(d, { continuousPowerW: 200 });
    for (let i = 0; i < p1.length; i++) {
      expect(p2[i].watts!).toBeCloseTo(2 * p1[i].watts!, 12);
      expect(p2[i].fraction).toBe(p1[i].fraction);
    }
  });

  it('the worst element is the one with the LEAST HEADROOM, and a rated element outranks an unrated one', () => {
    const a = analysis();
    const d = dissipation(a, { amplifierPowerW: 100 });
    // R1 burns more watts but is rated 100 W; R2 burns less and is rated 0.5 W → R2 has the least headroom.
    const loads = resistorLoads(d, {
      continuousPowerW: 100,
      marginFraction: 1,
      ratings: { R1: { powerW: 100, source: 'a' }, R2: { powerW: 0.5, source: 'b' } },
    });
    expect(worstResistor(loads)!.id).toBe('R2');
    // With no allowance anywhere, the hottest one is reported.
    const bare = resistorLoads(d, { continuousPowerW: 100 });
    expect(worstResistor(bare)!.id).toBe('R1');
    // A rated element always outranks an unrated one, however cool it runs.
    const mixed = resistorLoads(d, {
      continuousPowerW: 100,
      marginFraction: 1,
      ratings: { R2: { powerW: 1000, source: 'c' } },
    });
    expect(worstResistor(mixed)!.id).toBe('R2');
    expect(worstCoil(coilLoads(a, { peakInputVolts: 50 }))!.id).toBe('L1');
    expect(worstCoil(coilLoads(a, {}))).toBeNull();
  });
});
