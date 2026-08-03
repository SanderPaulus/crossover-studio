import { describe, expect, it } from 'vitest';
import { cplx } from './complex.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { validateNetlist } from './netlistEdit.ts';
import { filterTemplate, type FilterOrder } from './filterTemplates.ts';

const GRID = [100, 2500, 20000];
const flatZ = (ohms: number) => GRID.map(() => cplx(ohms));

function magOf(order: FilterOrder, model: string, k: number): number {
  const xo = filterTemplate({ order, wayCount: 2, models: ['mid', 'tweeter'] });
  const { netlist } = crossoverToNetlist(xo);
  const sol = solveNetwork(netlist, GRID, { mid: flatZ(8), tweeter: flatZ(8) });
  const d = sol.drivers.find((x) => x.model === model)!;
  const h = sol.transfers[d.id][k];
  return Math.hypot(h.re, h.im);
}

describe('filterTemplate', () => {
  it('blank template is just generator + both drivers, unfiltered', () => {
    const xo = filterTemplate({ order: 0, wayCount: 2, models: ['mid', 'tweeter'] });
    expect(xo.parts.filter((p) => p.type === 'Driver')).toHaveLength(2);
    expect(xo.parts.some((p) => p.type === 'Capacitor' || p.type === 'Inductor')).toBe(false);
  });

  it('every order builds a valid, single-generator, solvable network', () => {
    for (const order of [1, 2, 3, 4] as FilterOrder[]) {
      const xo = filterTemplate({ order, wayCount: 2, models: ['mid', 'tweeter'] });
      expect(xo.parts.filter((p) => p.type === 'Generator')).toHaveLength(1);
      const { netlist } = crossoverToNetlist(xo);
      expect(validateNetlist(netlist, ['mid', 'tweeter']).errors).toHaveLength(0);
    }
  });

  it('low-pass branch passes lows, blocks highs; high-pass the reverse', () => {
    for (const order of [1, 2, 3, 4] as FilterOrder[]) {
      // 100 Hz: LP passes, HP blocks.
      expect(magOf(order, 'mid', 0)).toBeGreaterThan(0.9);
      expect(magOf(order, 'tweeter', 0)).toBeLessThan(0.3);
      // 20 kHz: HP passes, LP blocks.
      expect(magOf(order, 'tweeter', 2)).toBeGreaterThan(0.9);
      expect(magOf(order, 'mid', 2)).toBeLessThan(0.3);
    }
  });

  it('stopband gets deeper as the order rises (12 dB steeper than 6 dB)', () => {
    // LP attenuation at 20 kHz (3 octaves past fc): higher order ⇒ lower level.
    const lp1 = magOf(1, 'mid', 2);
    const lp2 = magOf(2, 'mid', 2);
    const lp4 = magOf(4, 'mid', 2);
    expect(lp2).toBeLessThan(lp1);
    expect(lp4).toBeLessThan(lp2);
  });

  it('part count matches the filter order per branch', () => {
    const reactive = (order: FilterOrder) =>
      filterTemplate({ order, wayCount: 2, models: ['mid', 'tweeter'] }).parts.filter(
        (p) => p.type === 'Capacitor' || p.type === 'Inductor',
      ).length;
    expect(reactive(1)).toBe(2); // 1 element × 2 branches
    expect(reactive(2)).toBe(4);
    expect(reactive(3)).toBe(6);
    expect(reactive(4)).toBe(8);
  });
});

describe('filterTemplate 3-way (phase-4 trede 3)', () => {
  // Probe grid around the 600 / 3000 Hz neutral references: deep low, the
  // mid-band centre (geometric mean ≈ 1342 Hz), deep high.
  const GRID3 = [100, 1342, 20000];
  const models = ['w 12w', 'mid m15', 'tweeter r26'];
  const solve3 = (order: FilterOrder) => {
    const xo = filterTemplate({ order, wayCount: 3, models });
    const { netlist } = crossoverToNetlist(xo);
    const z = Object.fromEntries(models.map((m) => [m, GRID3.map(() => cplx(8))]));
    const sol = solveNetwork(netlist, GRID3, z);
    const mag = (model: string, k: number) => {
      const d = sol.drivers.find((x) => x.model === model)!;
      const h = sol.transfers[d.id][k];
      return Math.hypot(h.re, h.im);
    };
    return { xo, netlist, mag };
  };

  it('every order builds a valid, single-generator, solvable 3-way network', () => {
    for (const order of [1, 2, 3, 4] as FilterOrder[]) {
      const { xo, netlist } = solve3(order);
      expect(xo.parts.filter((p) => p.type === 'Generator')).toHaveLength(1);
      expect(xo.parts.filter((p) => p.type === 'Driver')).toHaveLength(3);
      expect(validateNetlist(netlist, models).errors).toHaveLength(0);
    }
  });

  it('the middle branch is a real bandpass: passes the centre, blocks both ends', () => {
    for (const order of [1, 2, 3, 4] as FilterOrder[]) {
      const { mag } = solve3(order);
      expect(mag('mid m15', 1)).toBeGreaterThan(0.55); // centre of the band
      expect(mag('mid m15', 0)).toBeLessThan(0.35); // 100 Hz — below the band
      expect(mag('mid m15', 2)).toBeLessThan(0.35); // 20 kHz — above the band
      // Outer branches keep their classic shapes.
      expect(mag('w 12w', 0)).toBeGreaterThan(0.9);
      expect(mag('w 12w', 2)).toBeLessThan(0.3);
      expect(mag('tweeter r26', 2)).toBeGreaterThan(0.9);
      expect(mag('tweeter r26', 0)).toBeLessThan(0.3);
    }
  });

  it('reactive part count: order per outer branch, twice that for the bandpass', () => {
    for (const order of [1, 2, 3, 4] as const) {
      const n = filterTemplate({ order, wayCount: 3, models }).parts.filter(
        (p) => p.type === 'Capacitor' || p.type === 'Inductor',
      ).length;
      expect(n).toBe(4 * order); // order + 2·order + order
    }
  });

  it('a model set too small for 3-way falls back to the blank scaffold', () => {
    const xo = filterTemplate({ order: 2, wayCount: 3, models: ['a', 'b'] });
    expect(xo.parts.some((p) => p.type === 'Capacitor' || p.type === 'Inductor')).toBe(false);
  });
});
