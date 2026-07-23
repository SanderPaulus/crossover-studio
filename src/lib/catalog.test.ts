import { describe, expect, it } from 'vitest';
import {
  bomFor,
  catalogParts,
  catalogSeries,
  coilDcr,
  formatCatalogPart,
  nearestParts,
  stackCandidates,
  pickCandidates,
} from './catalog.ts';

describe('component catalog', () => {
  it('offers real product series per kind, including Alumen Z-Cap', () => {
    const caps = catalogSeries('C');
    const names = caps.map((s) => `${s.brand} ${s.series}`);
    expect(names).toContain('Jantzen Alumen Z-Cap');
    expect(names).toContain('Jantzen Cross-Cap');
    expect(names).toContain('Mundorf MCap');
    const coils = catalogSeries('L');
    expect(coils.map((s) => s.series)).toContain('Air Core Wire Coil');
    const resistors = catalogSeries('R');
    expect(resistors.map((s) => s.series)).toContain('Superes');
    expect(resistors.map((s) => s.series)).toContain('MResist Supreme');
    // Coils and caps carry their real series resistance; resistors ARE one.
    for (const p of catalogParts()) {
      if (p.kind === 'R') {
        expect(p.seriesR).toBe(0);
        expect(p.powerW).toBeGreaterThan(0);
      } else {
        expect(p.seriesR).toBeGreaterThan(0);
      }
    }
  });

  it('suggests resistors with power rating', () => {
    const top = nearestParts('R', 8, 3, 'jantzen-superes');
    expect(top[0].value).toBeCloseTo(8.2, 6);
    expect(formatCatalogPart(top[0])).toBe('8.2 Ω · Superes 10 W');
  });

  it('scales coil DCR with wire area: thinner wire = more ohms', () => {
    expect(coilDcr(1e-3, 1.4)).toBeCloseTo(0.29, 2);
    expect(coilDcr(1e-3, 0.7)).toBeCloseTo(0.29 * 4, 1);
    expect(coilDcr(4e-3, 1.4)).toBeGreaterThan(coilDcr(1e-3, 1.4));
  });

  it('nearestParts ranks by log-ratio distance; count counts DISTINCT values', () => {
    const top = nearestParts('L', 1.05e-3, 3);
    expect(top[0].value).toBeCloseTo(1.0e-3, 6);
    // Three distinct values, but every same-value gauge variant rides along
    // (multi-gauge doctrine: the snap weighs DCR vs price per gauge).
    expect(new Set(top.map((p) => p.value.toPrecision(6))).size).toBe(3);
    expect(top.filter((p) => Math.abs(p.value - 1.0e-3) < 1e-9).length).toBeGreaterThanOrEqual(3);
    expect(nearestParts('C', 9.9e-6)[0].value).toBeCloseTo(10e-6, 9);
    expect(nearestParts('L', 0)).toEqual([]);
  });

  it('restricts suggestions to a chosen series (the brand choice)', () => {
    const alumen = nearestParts('C', 10e-6, 3, 'jantzen-alumen');
    expect(alumen.length).toBeGreaterThan(0);
    for (const p of alumen) expect(p.series).toBe('Alumen Z-Cap');
    const cross = nearestParts('L', 1e-3, 4, 'jantzen-cross');
    for (const p of cross) expect(p.series).toBe('Cross Coil');
    // Cross Coil comes in heavier gauges only.
    expect(new Set(cross.map((p) => p.wireMm))).toEqual(new Set([1.4, 2.0]));
  });

  it('builds a BOM with catalog matches and price bookkeeping', () => {
    const parts = [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [] },
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 1.2, unit: 'mH' }], wires: [] },
      { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 10, unit: 'uF' }], wires: [] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 10.37, unit: 'uF' }], wires: [] },
    ];
    const bom = bomFor(parts);
    expect(bom.rows).toHaveLength(3); // generator is not a BOM component
    expect(bom.rows.find((r) => r.partId === 'L1')?.match?.value).toBeCloseTo(1.2e-3, 9);
    // 10.37 µF is no E24 value → no single match, but a 2-cap stack lands
    // within 1% (4.7 + 5.6 = 10.3 µF), so the row is still purchasable.
    const c2 = bom.rows.find((r) => r.partId === 'C2')!;
    expect(c2.match).toBeNull();
    expect(c2.stackMatch).toBeDefined();
    expect(Math.abs(Math.log(c2.stackMatch!.value / 10.37e-6))).toBeLessThan(0.01);
    expect(bom.unmatchedCount).toBe(0);
    expect(bom.totalEur).toBeNull(); // starter catalog carries no prices yet
  });

  it('formats parts for the inspector', () => {
    const l = nearestParts('L', 1e-3, 5, 'jantzen-air').find((p) => p.wireMm === 1.4)!;
    expect(formatCatalogPart(l)).toBe('1 mH · 1.4 mm · 0.29 Ω');
    const c = nearestParts('C', 10e-6, 1, 'jantzen-alumen')[0];
    expect(formatCatalogPart(c)).toBe('10 µF · Alumen Z-Cap');
  });
});

describe('stacking (Sanders doctrine: single where possible, stack as fallback)', () => {
  it('stack candidates sum two real parts to within a few % of the target', () => {
    // 0.93 mH: an awkward value between grid points — stacks must offer
    // combinations of two REAL catalog coils summing close to it.
    const stacks = stackCandidates('L', 0.93e-3);
    expect(stacks.length).toBeGreaterThan(0);
    for (const s of stacks) {
      expect(s.parts).toHaveLength(2);
      expect(s.value).toBeCloseTo(s.parts[0].value + s.parts[1].value, 12);
      expect(Math.abs(Math.log(s.value / 0.93e-3))).toBeLessThan(Math.log(1.1));
      // Series coils: DCR adds.
      expect(s.seriesR).toBeCloseTo(s.parts[0].seriesR + s.parts[1].seriesR, 12);
      expect(s.label).toContain('2× in series');
    }
  });

  it('parallel cap stacks add values and parallel their ESRs', () => {
    const stacks = stackCandidates('C', 130e-6); // beyond most single caps
    expect(stacks.length).toBeGreaterThan(0);
    const s = stacks[0];
    expect(s.value).toBeCloseTo(s.parts[0].value + s.parts[1].value, 12);
    expect(s.label).toContain('2× in parallel');
    if (s.parts[0].seriesR > 0 && s.parts[1].seriesR > 0) {
      expect(s.seriesR).toBeLessThan(Math.min(s.parts[0].seriesR, s.parts[1].seriesR));
    }
  });

  it('no stacking for resistors (dense grid, cheap parts)', () => {
    expect(stackCandidates('R', 3.7)).toHaveLength(0);
  });

  it('pickCandidates offers singles only when a single part is close', () => {
    // 10 µF exists in every cap series → no stacks in the shortlist.
    const close = pickCandidates('C', 10e-6);
    expect(close.every((c) => c.parts.length === 1)).toBe(true);
    // 130 µF is out of single-part reach → stacks join the shortlist.
    const far = pickCandidates('C', 130e-6);
    expect(far.some((c) => c.parts.length === 2)).toBe(true);
    // Singles stay listed first (the caller's handicap does the preferring).
    expect(far[0].parts).toHaveLength(1);
  });
});
