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
