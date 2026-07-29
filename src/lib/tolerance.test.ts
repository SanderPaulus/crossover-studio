import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { toleranceBand } from './tolerance.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const grid = logspace(210, 19000, 240);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const wBase = gridded('mid_hor0_mettape.txt');
const tBase = gridded('tweet_hor0_mettape.txt');
const gridZ = (name: string) => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const driverZ = {
  mid: gridZ('mid_Backwavecone_sheep75gram.ZMA'),
  tweeter: gridZ('tweeter.ZMA'),
};
const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };

/** Simple 2-way: series L into the mid, series C into the tweeter. */
function twoWay(): VxpPart[] {
  return [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 0.55, unit: 'mH' },
        { name: 'DCR', value: 0.2, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      inverted: false,
      params: [],
      wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
    {
      type: 'Capacitor',
      partId: 'C1',
      params: [{ name: 'C', value: 4.7, unit: 'uF' }],
      wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D2',
      model: 'tweeter',
      inverted: true,
      params: [],
      wires: [{ x: 16, y: 4 }, { x: 16, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 16, y: 11 }] },
  ];
}

describe('toleranceBand', () => {
  it('zero tolerance yields a zero-width band', () => {
    const r = toleranceBand(twoWay(), grid, wBase, tBase, driverZ, NO_ADJ, 0)!;
    expect(r.worstHalfDb).toBeCloseTo(0, 9);
    expect(r.rssHalfDb).toBeCloseTo(0, 9);
    for (let i = 0; i < r.upperDb.length; i++) {
      expect(r.upperDb[i]).toBeCloseTo(r.lowerDb[i], 9);
    }
  });

  it('the band widens with tolerance and the envelope brackets the corners', () => {
    const r5 = toleranceBand(twoWay(), grid, wBase, tBase, driverZ, NO_ADJ, 5)!;
    const r10 = toleranceBand(twoWay(), grid, wBase, tBase, driverZ, NO_ADJ, 10)!;
    expect(r5.worstHalfDb).toBeGreaterThan(0.01);
    expect(r10.worstHalfDb).toBeGreaterThan(r5.worstHalfDb);
    // RSS is never wider than the pessimistic sum.
    expect(r5.rssHalfDb).toBeLessThanOrEqual(r5.worstHalfDb + 1e-12);
    for (let i = 0; i < r5.upperDb.length; i++) {
      expect(r5.upperDb[i]).toBeGreaterThanOrEqual(r5.lowerDb[i]);
    }
  });

  it('ranks every passive part and is deterministic', () => {
    const a = toleranceBand(twoWay(), grid, wBase, tBase, driverZ, NO_ADJ, 5)!;
    const b = toleranceBand(twoWay(), grid, wBase, tBase, driverZ, NO_ADJ, 5)!;
    // L1, C1 and both parasitic resistances (DCR rides as part of L; Rg is a
    // generator param) — at minimum the two reactive elements are ranked.
    expect(a.perPart.length).toBeGreaterThanOrEqual(2);
    const ids = a.perPart.map((p) => p.id);
    expect(ids).toContain('L1');
    expect(ids).toContain('C1');
    for (let i = 1; i < a.perPart.length; i++) {
      expect(a.perPart[i - 1].maxAbsDb).toBeGreaterThanOrEqual(a.perPart[i].maxAbsDb);
    }
    expect(b).toEqual(a); // byte-identical rerun
  });

  it('returns null for a network without passive elements', () => {
    const bare = twoWay().filter((p) => p.type !== 'Inductor' && p.type !== 'Capacitor');
    // Direct-wired drivers: no R/L/C left to tolerance.
    const r = toleranceBand(bare, grid, wBase, tBase, driverZ, NO_ADJ, 5);
    expect(r).toBeNull();
  });
});
