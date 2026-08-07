import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allSeries,
  bomFor,
  catalogSeries,
  dcrCeilingOhms,
  nearestParts,
  pickCandidates,
  setCustomSeries,
} from './catalog.ts';
import type { SnapPosition } from './catalog.ts';
import { deserializeCatalog, serializeCatalog } from './catalogFile.ts';

afterEach(() => setCustomSeries([]));

describe('catalog exchange format', () => {
  it('roundtrips the built-in series as an editable template', () => {
    const text = serializeCatalog(allSeries());
    const back = deserializeCatalog(text);
    expect(back.series).toEqual(allSeries());
    expect(back.parts).toEqual([]);
  });

  it('imported series join the catalog and feed suggestions', () => {
    const text = serializeCatalog([
      {
        id: 'intertechnik-audyn',
        brand: 'Intertechnik',
        series: 'Audyn Q4',
        kind: 'C',
        range: [1e-6, 100e-6],
        esr: 0.03,
      },
    ]);
    setCustomSeries(deserializeCatalog(text).series);
    expect(catalogSeries('C').map((s) => s.brand)).toContain('Intertechnik');
    const top = nearestParts('C', 10e-6, 2, 'intertechnik-audyn');
    expect(top[0].series).toBe('Audyn Q4');
    expect(top[0].value).toBeCloseTo(10e-6, 9);
  });

  it('roundtrips exact SKUs with their MEASURED seriesR intact', () => {
    // Regression: serialize writes CatalogPart.seriesR, but the reader only
    // knew dcr/esr — an export→reimport cycle silently replaced measured
    // DCR/ESR with estimates. The manager re-saves, so fidelity is a must.
    const parts = [
      // Measured DCR far from the 1.4 mm air-core estimate (~0.29 Ω @ 1 mH).
      { id: 'X-L-100', brand: 'X', series: 'Coil', kind: 'L' as const, value: 1e-3, seriesR: 0.62, wireMm: 0.7, priceEur: 3.4 },
      // Measured ESR ≠ the 0.02 default.
      { id: 'X-C-100', brand: 'X', series: 'Cap', kind: 'C' as const, value: 10e-6, seriesR: 0.011, tier: 'premium' as const },
      { id: 'X-R-1R0', brand: 'X', series: 'Res', kind: 'R' as const, value: 1, seriesR: 0, powerW: 10 },
    ];
    const back = deserializeCatalog(serializeCatalog([], parts));
    expect(back.parts).toEqual(parts);
  });

  it('rejects malformed files with clear errors', () => {
    expect(() => deserializeCatalog('nope')).toThrow(/JSON/);
    expect(() => deserializeCatalog('{"format":"x"}')).toThrow(/catalog file/);
    const bad = (series: unknown) =>
      JSON.stringify({ format: 'acoustic-design-studio-catalog', version: 1, series });
    expect(() => deserializeCatalog(bad([]))).toThrow(/no series/);
    expect(() => deserializeCatalog(bad([{ id: 'x' }]))).toThrow(/Malformed/);
    expect(() =>
      deserializeCatalog(
        bad([
          { id: 'a', brand: 'B', series: 'S', kind: 'C', range: [1e-6, 2e-6] },
          { id: 'a', brand: 'B', series: 'S2', kind: 'C', range: [1e-6, 2e-6] },
        ]),
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      deserializeCatalog(bad([{ id: 'l1', brand: 'B', series: 'S', kind: 'L', range: [1e-3, 2e-3] }])),
    ).toThrow(/wire gauge/);
  });
});

describe('v3 catalog update (the Gemini file: tiers, E-series, prices)', () => {
  const raw = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v3.json'),
      'utf-8',
    );

  it('imports the real v3 file: 18 series with tier, grid and price model', () => {
    const series = deserializeCatalog(raw()).series;
    expect(series).toHaveLength(18);
    const crosscap = series.find((s) => s.id === 'jantzen-crosscap')!;
    expect(crosscap.eSeries).toBe('E24');
    expect(crosscap.tier).toBe('standard');
    expect(crosscap.basePrice).toBeCloseTo(1.2, 6);
    expect(crosscap.costFactor).toBeCloseTo(45000, 6);
    const elco = series.find((s) => s.id === 'jantzen-elco')!;
    expect(elco.tier).toBe('budget');
    expect(elco.esr).toBeCloseTo(0.25, 6);
    expect(elco.range[1]).toBeCloseTo(330e-6, 9);
  });

  it('an imported series with a built-in id OVERRIDES the built-in (no duplicates)', () => {
    setCustomSeries(deserializeCatalog(raw()).series);
    const crosscaps = catalogSeries('C').filter((s) => s.id === 'jantzen-crosscap');
    expect(crosscaps).toHaveLength(1);
    expect(crosscaps[0].basePrice).toBeCloseTo(1.2, 6);
    // Parts now carry priceEur = base + factor·value and the tier.
    const p10 = nearestParts('C', 10e-6, 1, 'jantzen-crosscap')[0];
    expect(p10.value).toBeCloseTo(10e-6, 12);
    expect(p10.priceEur).toBeCloseTo(1.2 + 45000 * 10e-6, 2);
    expect(p10.tier).toBe('standard');
  });

  it('the E-series grid is honoured: E24 Cross-Cap has 7.5 µF, E12 Standard Z does not', () => {
    setCustomSeries(deserializeCatalog(raw()).series);
    const e24 = nearestParts('C', 7.5e-6, 1, 'jantzen-crosscap')[0];
    expect(e24.value).toBeCloseTo(7.5e-6, 12);
    const e12 = nearestParts('C', 7.5e-6, 1, 'jantzen-zstd')[0];
    expect(e12.value).not.toBeCloseTo(7.5e-6, 12); // nearest is 6.8 or 8.2
  });

  it('budget electrolytics open up big single-cap values with honest ESR', () => {
    setCustomSeries(deserializeCatalog(raw()).series);
    const big = nearestParts('C', 150e-6, 1, 'jantzen-elco')[0];
    expect(big.value).toBeCloseTo(150e-6, 12);
    expect(big.seriesR).toBeCloseTo(0.25, 6); // high ESR rides into the sim
    expect(big.priceEur).toBeGreaterThan(0.6);
  });

  it('iron-core coils exist up to 22 mH; DCR uses the (conservative) air-core fit until a dcrFactor is set', () => {
    setCustomSeries(deserializeCatalog(raw()).series);
    const pcore = nearestParts('L', 22e-3, 1, 'jantzen-pcore')[0];
    expect(pcore.value).toBeCloseTo(22e-3, 9);
    expect(pcore.priceEur).toBeGreaterThan(3.5);
    // With an explicit dcrFactor the DCR scales down.
    const series = deserializeCatalog(raw()).series.map((s) =>
      s.id === 'jantzen-pcore' ? { ...s, dcrFactor: 0.35 } : s,
    );
    setCustomSeries(series);
    const scaled = nearestParts('L', 22e-3, 1, 'jantzen-pcore')[0];
    expect(scaled.seriesR).toBeLessThan(pcore.seriesR * 0.4);
  });

  it('BOM totals appear once prices exist', () => {
    setCustomSeries(deserializeCatalog(raw()).series);
    const bom = bomFor([
      {
        type: 'Capacitor',
        partId: 'C1',
        params: [{ name: 'C', value: 10, unit: 'uF' }],
        wires: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
      },
      {
        type: 'Inductor',
        partId: 'L1',
        params: [{ name: 'L', value: 1.0, unit: 'mH' }],
        wires: [{ x: 5, y: 0 }, { x: 10, y: 0 }],
      },
    ]);
    expect(bom.totalEur).not.toBeNull();
    expect(bom.totalEur!).toBeGreaterThan(1);
    expect(bom.pricedCount).toBe(2);
  });
});

describe('v4 flat SKU database (the Gemini exact-parts file)', () => {
  const rawV4 = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v4.json'),
      'utf-8',
    );

  it('imports 100 exact components with real DCR/ESR/prices', () => {
    const imp = deserializeCatalog(rawV4());
    expect(imp.parts).toHaveLength(100);
    const cc10 = imp.parts.find((p) => p.id === 'JAZ-CC-100')!;
    expect(cc10.value).toBeCloseTo(10e-6, 12);
    expect(cc10.seriesR).toBeCloseTo(0.018, 6);
    expect(cc10.priceEur).toBeCloseTo(4.75, 6);
    expect(cc10.tier).toBe('standard');
    // Gauge physics carried per SKU: same value, thicker wire = lower DCR.
    const thin = imp.parts.find((p) => p.id === 'JAZ-AIR-07-100')!;
    const thick = imp.parts.find((p) => p.id === 'JAZ-AIR-14-100')!;
    expect(thick.seriesR).toBeLessThan(thin.seriesR);
  });

  it('exact parts SHADOW the generated grid of the same brand+series', () => {
    const imp = deserializeCatalog(rawV4());
    setCustomSeries(imp.series, imp.parts);
    // Cross-Cap now ends at 22 µF (real market list) — no generated 91 µF ghost.
    const seriesId = allSeries().find((s) => s.series === 'Cross-Cap')!.id;
    const big = nearestParts('C', 91e-6, 1, seriesId)[0];
    expect(big.value).toBeCloseTo(22e-6, 9);
    // Series NOT covered by exact parts keep their generated grid.
    expect(allSeries().some((s) => s.series === 'Standard Z-Cap')).toBe(true);
    const zstd = nearestParts('C', 33e-6, 1, 'jantzen-zstd')[0];
    expect(zstd.value).toBeCloseTo(33e-6, 9);
  });

  it('wizard prefs: a binding series restricts the snap candidates', () => {
    const imp = deserializeCatalog(rawV4());
    setCustomSeries(imp.series, imp.parts);
    const ccId = allSeries().find((s) => s.series === 'Cross-Cap')!.id;
    const picks = pickCandidates('C', 4.7e-6, 3, { profile: 'auto', seriesByKind: { C: ccId } });
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.parts.every((q) => q.series === 'Cross-Cap')).toBe(true);
    }
  });

  it("wizard prefs: the 'position' profile sends shunt slots to budget tiers", () => {
    const imp = deserializeCatalog(rawV4());
    setCustomSeries(imp.series, imp.parts);
    const shunt = pickCandidates('C', 10e-6, 3, { profile: 'position' }, 'shunt');
    expect(shunt[0].parts[0].tier).toBe('budget'); // the elco
    const series = pickCandidates('C', 10e-6, 3, { profile: 'position' }, 'series');
    expect(series[0].parts[0].tier).toBe('premium');
  });

  it('a clear error points at JSON typos instead of a blank refusal', () => {
    const broken = rawV4().replace('"value": 4.7,', '"value": 4.7",');
    expect(() => deserializeCatalog(broken)).toThrow(/Not a JSON file \(/);
  });
});

describe('value-aware preference fallback', () => {
  it('a tier pool that cannot cover the value yields to the next pool', () => {
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v4.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    // Premium caps stop at 10 µF. A 15 µF series-path need STACKS WITHIN
    // premium first (10 + 4.7 = 14.7 µF — Sanders: premium mag stapelen)…
    const picks = pickCandidates('C', 15e-6, 3, { profile: 'position' }, 'series');
    const best = [...picks].sort(
      (a, b) => Math.abs(Math.log(a.value / 15e-6)) - Math.abs(Math.log(b.value / 15e-6)),
    )[0];
    expect(Math.abs(Math.log(best.value / 15e-6))).toBeLessThan(Math.log(1.05));
    expect(best.parts.every((q) => q.tier === 'premium')).toBe(true);
    // …and with stacking off it falls back to a covering tier instead of
    // forcing a 33% value error.
    const noStacks = pickCandidates(
      'C',
      15e-6,
      3,
      { profile: 'position', allowStacks: false },
      'series',
    );
    expect(Math.abs(Math.log(noStacks[0].value / 15e-6))).toBeLessThan(Math.log(1.1));
    // Within single-part coverage the doctrine holds: 10 µF series = premium.
    const inRange = pickCandidates('C', 10e-6, 3, { profile: 'position' }, 'series');
    expect(inRange[0].parts[0].tier).toBe('premium');
  });
});

describe('premium wizard choice reaches the BOM (attribution chain)', () => {
  it('snap writes the chosen SKU on the part and the BOM shows THAT part', () => {
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v4.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    // A 10 µF exists in five series — value alone cannot attribute it. With
    // a premium profile the snap must pick premium AND the BOM must say so.
    const parts = [
      {
        type: 'Capacitor',
        partId: 'C1',
        params: [
          { name: 'C', value: 10, unit: 'uF' },
          { name: 'ESR', value: 0.008, unit: 'Ω' },
        ],
        catalog: 'MUN-SUP-100',
        wires: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
      },
    ];
    const bom = bomFor(parts);
    expect(bom.rows[0].match?.id).toBe('MUN-SUP-100');
    expect(bom.rows[0].match?.tier).toBe('premium');
    expect(bom.totalEur).toBeCloseTo(59.5, 2);
    // Without the catalog field, the DCR/ESR param still disambiguates.
    const noField = bomFor([{ ...parts[0], catalog: undefined }]);
    expect(noField.rows[0].match?.tier).toBe('premium');
  });

  it('a bare cap at a catalog value gets PRICED (priced part beats grid ghost)', () => {
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v6.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    // No catalog field, no ESR param — the value alone. It sits at 10 µF,
    // which exists both as a priced import SKU and as an unpriced builtin
    // grid ghost; the fallback must land on the priced one.
    const bom = bomFor([
      { type: 'Capacitor', partId: 'X', params: [{ name: 'C', value: 10, unit: 'uF' }], wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    ]);
    expect(bom.pricedCount).toBe(1);
    expect(bom.rows[0].match?.priceEur).toBeDefined();
  });

  it('an inspector series swap (re-stamped SKU) is reflected in the BOM', () => {
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v4.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    // A part the snap attributed to premium MCap Supreme (10 µF). The user
    // picks a cheaper 10 µF in the inspector; the apply re-stamps `catalog`.
    // Same value — so ONLY the SKU field can move the BOM (the bug: it never
    // did, because the apply left the stale SKU in place).
    const target = imp.parts.find((p) => p.value === 10e-6 && p.id !== 'MUN-SUP-100')!;
    const swapped = bomFor([
      {
        type: 'Capacitor',
        partId: 'C1',
        params: [{ name: 'C', value: 10, unit: 'uF' }, { name: 'ESR', value: target.seriesR, unit: 'Ω' }],
        catalog: target.id,
        wires: [{ x: 0, y: 0 }, { x: 5, y: 0 }],
      },
    ]);
    expect(swapped.rows[0].match?.id).toBe(target.id);
  });
});

describe('v6 flat SKU database (Gemini data revision: E12 steps, sub-µF, big elcos, multi-gauge)', () => {
  const rawV6 = () =>
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v6.json'),
      'utf-8',
    );

  it('accepts the bumped version number: v6 is v4-format, version is a data revision', () => {
    const imp = deserializeCatalog(rawV6());
    expect(imp.series).toHaveLength(0);
    expect(imp.parts.length).toBeGreaterThan(150);
    // MResist Supreme 20 W — verified NL/EU price €24.90 (Mundorf/Audiophonics),
    // replacing Gemini's ~€14.50 estimate in the verified-pricing pass.
    const mres = imp.parts.find((p) => p.id === 'MUN-MRES-3R3')!;
    expect(mres.tier).toBe('premium');
    expect(mres.powerW).toBe(20);
    expect(mres.priceEur).toBeCloseTo(24.9, 6);
  });

  it('multi-gauge coils: one value in three wire gauges, all kept as snap candidates', () => {
    const imp = deserializeCatalog(rawV6());
    setCustomSeries(imp.series, imp.parts);
    const airId = allSeries().find((s) => s.brand === 'Jantzen' && s.series === 'Air Core Wire Coil')!.id;
    const near = nearestParts('L', 0.47e-3, 3, airId);
    // count=3 counts DISTINCT values; the 0.47 mH gauge triplet rides along.
    const at047 = near.filter((p) => Math.abs(p.value - 0.47e-3) < 1e-9);
    expect(at047).toHaveLength(3);
    expect(new Set(at047.map((p) => p.wireMm)).size).toBe(3);
    expect(new Set(near.map((p) => p.value.toPrecision(6))).size).toBe(3);
    // Snap candidates see the DCR↔price trade-off too.
    const picks = pickCandidates('L', 0.47e-3, 3, { profile: 'auto', seriesByKind: { L: airId } });
    const singles047 = picks.filter(
      (p) => p.parts.length === 1 && Math.abs(p.value - 0.47e-3) < 1e-9,
    );
    expect(singles047.length).toBe(3);
  });

  it('sub-µF bypass caps and 330 µF Zobel elcos are purchasable end-to-end', () => {
    const imp = deserializeCatalog(rawV6());
    setCustomSeries(imp.series, imp.parts);
    const tiny = nearestParts('C', 0.1e-6, 1)[0];
    expect(tiny.value).toBeCloseTo(0.1e-6, 12);
    expect(tiny.priceEur).toBeDefined();
    const zobel = pickCandidates('C', 330e-6, 3, { profile: 'budget' });
    expect(zobel[0].parts[0].id).toBe('JAZ-ELCO-3300');
    expect(zobel[0].parts[0].tier).toBe('budget');
  });

  it('E12 in-between values exist as priced singles (2.7 / 3.9 / 5.6 / 8.2 µF)', () => {
    const imp = deserializeCatalog(rawV6());
    setCustomSeries(imp.series, imp.parts);
    for (const v of [2.7e-6, 3.9e-6, 5.6e-6, 8.2e-6]) {
      const p = nearestParts('C', v, 1)[0];
      expect(p.value).toBeCloseTo(v, 12);
      expect(p.priceEur).toBeDefined();
    }
  });
});

describe('coil DCR budget per position (Sanders: the doctrine must pick the best coils where it matters)', () => {
  it('spends thin wire only where it costs nothing, and never strands a slot', () => {
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v8.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    try {
      const REF = 6;
      const worstDcr = (pos: SnapPosition | undefined, refOhms?: number) =>
        Math.max(
          ...pickCandidates(
            'L',
            2.4e-3,
            3,
            refOhms ? { profile: 'auto', refOhms } : null,
            pos,
          ).map((p) => p.seriesR ?? 0),
        );
      // The real case: a 2.4 mH slot. The full catalog offers this value on
      // 0.3 mm wire at 6.4 Ω — electrically useless but cheapest, so the
      // cost tie-break took it. Tier cannot express this (gauge varies per
      // SKU, tier per series), so the budget is stated in dB of level.
      expect(worstDcr('series', REF)).toBeLessThanOrEqual(dcrCeilingOhms('series', REF) + 1e-9);
      expect(worstDcr('shunt', REF)).toBeLessThanOrEqual(dcrCeilingOhms('shunt', REF) + 1e-9);
      // A shunt leg only loses depth of its short, so it gets more room —
      // but still far less than the unguarded pool.
      expect(dcrCeilingOhms('shunt', REF)).toBeGreaterThan(dcrCeilingOhms('series', REF));
      expect(worstDcr(undefined)).toBeGreaterThan(dcrCeilingOhms('shunt', REF));
      // Scale-free: the ceiling follows the impedance it works into.
      expect(dcrCeilingOhms('series', 8)).toBeCloseTo((8 / 4) * dcrCeilingOhms('series', 4), 9);
      // Feasibility, not preference: an impossible budget keeps the thickest
      // wire rather than leaving the slot with nothing to snap to.
      expect(
        pickCandidates('L', 2.4e-3, 3, { profile: 'auto', refOhms: 0.001 }, 'series').length,
      ).toBeGreaterThan(0);
    } finally {
      setCustomSeries([]);
    }
  });
});
