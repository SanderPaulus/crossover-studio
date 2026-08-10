import { describe, expect, it } from 'vitest';
import {
  bomFor,
  setCustomSeries,
  catalogParts,
  catalogSeries,
  coilDcr,
  formatCatalogPart,
  nearestParts,
  stackCandidates,
  pickCandidates,
  allSeries,
  disabledSeries,
  setDisabledSeries,
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

describe('uniform banks (the 4 x 22 uF realisation)', () => {
  it('offers a bank for a big midrange value and labels it buildably', () => {
    // 88 uF is Troels Gravesen's published midrange high-pass value in several
    // 3-ways, and he builds it as 4 x 22 uF. The catalog must be able to say so.
    const picks = stackCandidates('C', 88e-6, 6);
    const bank = picks.find((p) => p.parts.length >= 3);
    expect(bank).toBeDefined();
    expect(bank!.parts.length).toBeGreaterThanOrEqual(3);
    // Every member of a uniform bank is the same part...
    const ids = new Set(bank!.parts.map((p) => p.id));
    expect(ids.size).toBe(1);
    // ...the sum lands on the target...
    expect(Math.abs(Math.log(bank!.value / 88e-6))).toBeLessThan(Math.log(1.4));
    // ...and the label tells the builder what to buy.
    expect(bank!.label).toMatch(/\d× in parallel/);
  });

  it('parallels ESR and sums DCR the way the physics does', () => {
    const capBank = stackCandidates('C', 88e-6, 8).find(
      (p) => p.parts.length >= 2 && new Set(p.parts.map((q) => q.id)).size === 1,
    )!;
    // Caps in parallel: ESR divides.
    expect(capBank.seriesR).toBeCloseTo(capBank.parts[0].seriesR / capBank.parts.length, 9);
    const coilBank = stackCandidates('L', 6.6e-3, 8).find(
      (p) => p.parts.length >= 2 && new Set(p.parts.map((q) => q.id)).size === 1,
    )!;
    // Coils in series: DCR adds.
    expect(coilBank.seriesR).toBeCloseTo(coilBank.parts[0].seriesR * coilBank.parts.length, 9);
  });

  it('prefers the fewest physical parts when two realisations tie on value', () => {
    const picks = stackCandidates('C', 20e-6, 8);
    const exact = picks.filter((p) => Math.abs(Math.log(p.value / 20e-6)) < 1e-6);
    if (exact.length > 1) {
      for (let i = 1; i < exact.length; i++) {
        expect(exact[i].parts.length).toBeGreaterThanOrEqual(exact[i - 1].parts.length);
      }
    }
    // And a value the grid carries outright still resolves as a single part.
    expect(pickCandidates('C', 10e-6, 3)[0].parts).toHaveLength(1);
  });
});

describe('coil tier exemption (DCR is a position property, not a tier)', () => {
  it('a premium profile does not narrow the coil pool to premium wire', () => {
    // Two real coils, same value, both inside any sane DCR ceiling: a
    // premium-tier foil at 300 EUR and a standard iron core at 12 EUR with
    // 0.2 ohm more DCR — electrically near-identical, and the solver models
    // the difference. Under profile 'premium' the old tier cascade returned
    // ONLY the foil pool, so the snap could never even see the cheap coil
    // (measured: two Zero-Ohm coils, 547 EUR, in one woofer branch). The
    // candidates must now include both; the snap's cost weight decides.
    setCustomSeries(
      [],
      [
        {
          id: 'FOIL-68',
          brand: 'Gold',
          series: 'Foil',
          kind: 'L',
          value: 6.8e-3,
          seriesR: 0.18,
          priceEur: 300,
          tier: 'premium',
        },
        {
          id: 'IRON-68',
          brand: 'Iron',
          series: 'Core',
          kind: 'L',
          value: 6.8e-3,
          seriesR: 0.38,
          priceEur: 12,
          tier: 'standard',
        },
      ],
    );
    const picks = pickCandidates('L', 6.8e-3, 3, { profile: 'premium', refOhms: 8 }, 'series');
    const ids = picks.flatMap((p) => p.parts.map((x) => x.id));
    expect(ids).toContain('IRON-68');
    expect(ids).toContain('FOIL-68');
    // An EXPLICIT series binding is the designer's own call and still wins.
    const bound = pickCandidates(
      'L',
      6.8e-3,
      3,
      { profile: 'premium', refOhms: 8, seriesByKind: { L: 'gold-foil' } },
      'series',
    );
    expect(bound.every((p) => p.parts.every((x) => x.brand === 'Gold'))).toBe(true);
    setCustomSeries([]);
  });
});

describe('real SKUs beat generated grids (imported catalog)', () => {
  it('does not pick a fictional grid value when a real part covers it', () => {
    // Sander's case in miniature: a built-in-style series grid offering a
    // value the product does not come in, next to a real priced SKU. The grid
    // entry fits marginally better AND costs nothing, so without this rule the
    // snap takes it — and the BOM line comes out unbuyable and unpriced.
    setCustomSeries(
      [
        {
          id: 'ghost-caps',
          brand: 'Ghost',
          series: 'Grid Only',
          kind: 'C',
          range: [1e-6, 1e-4],
          eSeries: 'E24',
        },
      ],
      [
        {
          id: 'REAL-82U',
          brand: 'Real',
          series: 'Buyable',
          kind: 'C',
          value: 82e-6,
          seriesR: 0.02,
          priceEur: 24,
        },
        {
          id: 'REAL-100U',
          brand: 'Real',
          series: 'Buyable',
          kind: 'C',
          value: 100e-6,
          seriesR: 0.02,
          priceEur: 28,
        },
      ],
    );
    const picks = pickCandidates('C', 91e-6, 3);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      for (const part of p.parts) expect(part.brand).toBe('Real');
    }
    // …and every pick therefore carries a price the BOM can total.
    expect(picks.every((p) => p.priceEur !== undefined)).toBe(true);
    setCustomSeries([]);
  });

  it('keeps the grid where no real part can cover the value', () => {
    // A coverage gap must stay covered: dropping the fallback wholesale turns
    // a missing SKU range into silent fit damage instead of a visible one.
    setCustomSeries(
      [
        {
          id: 'ghost-caps',
          brand: 'Ghost',
          series: 'Grid Only',
          kind: 'C',
          range: [1e-6, 1e-3],
          eSeries: 'E12',
        },
      ],
      [
        {
          id: 'REAL-1U',
          brand: 'Real',
          series: 'Buyable',
          kind: 'C',
          value: 1e-6,
          seriesR: 0.02,
          priceEur: 5,
        },
      ],
    );
    const picks = pickCandidates('C', 470e-6, 3);
    expect(picks.length).toBeGreaterThan(0);
    // The real 1 µF is nowhere near 470 µF, so the grid must still be offered.
    expect(picks.some((p) => p.parts.some((x) => x.brand === 'Ghost'))).toBe(true);
    setCustomSeries([]);
  });
});

describe('switching a series off', () => {
  // "The Jantzen Bipolar caps are in there but I do not want to use them."
  // Off means off for EVERY consumer — one pool, one meaning.
  const BIPOLAR = {
    id: 'jantzen-bipolar',
    brand: 'Jantzen',
    series: 'Bipolar',
    kind: 'C' as const,
    range: [10, 100] as [number, number],
  };
  const bipolarParts = [22, 47, 82].map((v) => ({
    id: `JAZ-BIP-${v}`,
    brand: 'Jantzen',
    series: 'Bipolar',
    kind: 'C' as const,
    value: v,
    seriesR: 0.05,
    priceEur: 3 + v / 10,
  }));
  const isBipolar = (x: { series: string }) => /bipolar/i.test(x.series);

  it('an imported series disappears from the pool, the dropdown and the snap', () => {
    setCustomSeries([BIPOLAR], bipolarParts);
    try {
      expect(catalogParts().some(isBipolar)).toBe(true);
      expect(catalogSeries('C').some(isBipolar)).toBe(true);

      setDisabledSeries([BIPOLAR.id]);
      expect(catalogParts().some(isBipolar)).toBe(false);
      // You cannot bind to stock you have said you will not buy.
      expect(catalogSeries('C').some(isBipolar)).toBe(false);
      // But the manager still lists it, or you could never switch it back on.
      expect(allSeries().some(isBipolar)).toBe(true);
      expect(disabledSeries()).toEqual([BIPOLAR.id]);

      // The snap must not hand back a switched-off part at a value it covers.
      const picks = pickCandidates('C', 47, 8);
      expect(picks.flatMap((c) => c.parts).some(isBipolar)).toBe(false);
      // Excluding stock must never empty the shortlist.
      expect(picks.length).toBeGreaterThan(0);
    } finally {
      setDisabledSeries([]);
      setCustomSeries([], []);
    }
  });

  it('switching it back on restores the pool exactly', () => {
    setCustomSeries([BIPOLAR], bipolarParts);
    try {
      const n = catalogParts().length;
      setDisabledSeries([BIPOLAR.id]);
      expect(catalogParts().length).toBe(n - bipolarParts.length);
      setDisabledSeries([]);
      expect(catalogParts().length).toBe(n);
    } finally {
      setDisabledSeries([]);
      setCustomSeries([], []);
    }
  });

  it('works on a built-in series too, and an unknown id is harmless', () => {
    const first = catalogSeries('C')[0];
    const n = catalogParts().length;
    setDisabledSeries([first.id]);
    try {
      expect(catalogParts().length).toBeLessThan(n);
      expect(catalogSeries('C').some((x) => x.id === first.id)).toBe(false);
    } finally {
      setDisabledSeries([]);
    }
    setDisabledSeries(['no-such-series']);
    expect(catalogParts().length).toBe(n);
    setDisabledSeries([]);
  });
});
