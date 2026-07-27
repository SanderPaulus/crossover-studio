import { afterEach, describe, expect, it } from 'vitest';
import type { CatalogPart } from './catalog.ts';
import { setCustomSeries } from './catalog.ts';
import { deserializeCatalog, serializeCatalog } from './catalogFile.ts';
import {
  formatSkuValue,
  fromDisplayValue,
  gridShadowNote,
  removeSku,
  skuError,
  toDisplayValue,
  upsertSku,
} from './catalogManager.ts';

afterEach(() => setCustomSeries([]));

const part = (over: Partial<CatalogPart> = {}): CatalogPart => ({
  id: 'X-C-100',
  brand: 'X',
  series: 'Cap',
  kind: 'C',
  value: 10e-6,
  seriesR: 0.02,
  ...over,
});

describe('catalog manager: SKU CRUD', () => {
  it('upsert appends a new SKU and replaces an existing one by id', () => {
    const base = [part()];
    const added = upsertSku(base, part({ id: 'X-C-220', value: 22e-6 }));
    expect(added).toHaveLength(2);
    expect(base).toHaveLength(1); // pure — input untouched

    const updated = upsertSku(added, part({ priceEur: 4.5 }));
    expect(updated).toHaveLength(2);
    expect(updated.find((p) => p.id === 'X-C-100')!.priceEur).toBe(4.5);
  });

  it('upsert with originalId renames without duplicating', () => {
    const base = [part(), part({ id: 'X-C-220', value: 22e-6 })];
    const renamed = upsertSku(base, part({ id: 'X-C-100B' }), 'X-C-100');
    expect(renamed.map((p) => p.id)).toEqual(['X-C-100B', 'X-C-220']);
  });

  it('remove drops exactly the requested SKU', () => {
    const base = [part(), part({ id: 'X-C-220', value: 22e-6 })];
    expect(removeSku(base, 'X-C-100').map((p) => p.id)).toEqual(['X-C-220']);
    expect(removeSku(base, 'nope')).toHaveLength(2);
  });

  it('an edited draft still roundtrips through the file format', () => {
    // The manager saves via serializeCatalog — whatever it produces must
    // come back identically through the import path.
    const draft = upsertSku(
      [part({ seriesR: 0.011, priceEur: 12.3, tier: 'premium' })],
      part({ id: 'X-L-047', kind: 'L', value: 0.47e-3, seriesR: 0.31, wireMm: 0.7 }),
    );
    const back = deserializeCatalog(serializeCatalog([], draft));
    expect(back.parts).toEqual(draft);
  });
});

describe('catalog manager: validation', () => {
  it('enforces the file-format hard requirements', () => {
    expect(skuError(part({ id: ' ' }), [])).toMatch(/id/);
    expect(skuError(part({ brand: '' }), [])).toMatch(/Brand/);
    expect(skuError(part({ series: '' }), [])).toMatch(/Series/);
    expect(skuError(part({ value: 0 }), [])).toMatch(/Value/);
    expect(skuError(part({ value: NaN }), [])).toMatch(/Value/);
    expect(skuError(part({ seriesR: -1 }), [])).toMatch(/ESR/);
    expect(skuError(part({ kind: 'L', seriesR: -1 }), [])).toMatch(/DCR/);
    expect(skuError(part({ wireMm: 0 }), [])).toMatch(/gauge/);
    expect(skuError(part({ powerW: -5 }), [])).toMatch(/Power/);
    expect(skuError(part({ priceEur: -1 }), [])).toMatch(/Price/);
    expect(skuError(part(), [])).toBeNull();
  });

  it('rejects duplicate ids, but not the SKU being edited itself', () => {
    const parts = [part()];
    expect(skuError(part({ value: 22e-6 }), parts)).toMatch(/already exists/);
    expect(skuError(part({ value: 22e-6 }), parts, 'X-C-100')).toBeNull();
    // A rename onto ANOTHER existing id still clashes.
    const two = [part(), part({ id: 'X-C-220', value: 22e-6 })];
    expect(skuError(part({ id: 'X-C-220' }), two, 'X-C-100')).toMatch(/already exists/);
  });
});

describe('catalog manager: grid-shadow warning', () => {
  it('warns on the FIRST exact SKU for a built-in grid series', () => {
    const draft = part({ brand: 'Jantzen', series: 'Cross-Cap' });
    expect(gridShadowNote([], draft)).toMatch(/SHADOWS/);
    // A second SKU of the same series is no longer a surprise.
    const sibling = part({ id: 'JAZ-CC-220', brand: 'Jantzen', series: 'Cross-Cap', value: 22e-6 });
    expect(gridShadowNote([sibling], draft)).toBeNull();
    // Unknown brand+series has no grid to shadow.
    expect(gridShadowNote([], part({ brand: 'Nobody', series: 'Nothing' }))).toBeNull();
  });

  it('sees imported (custom) grid series too', () => {
    setCustomSeries([
      { id: 'audyn-q4', brand: 'Intertechnik', series: 'Audyn Q4', kind: 'C', range: [1e-6, 100e-6] },
    ]);
    expect(gridShadowNote([], part({ brand: 'Intertechnik', series: 'Audyn Q4' }))).toMatch(/SHADOWS/);
  });
});

describe('catalog manager: display units', () => {
  it('converts SI ↔ display without float noise', () => {
    expect(toDisplayValue('C', 10e-6)).toBe(10);
    expect(toDisplayValue('L', 0.47e-3)).toBe(0.47);
    expect(toDisplayValue('R', 0.68)).toBe(0.68);
    expect(fromDisplayValue('C', 4.7)).toBeCloseTo(4.7e-6, 12);
    expect(fromDisplayValue('L', 1.5)).toBeCloseTo(1.5e-3, 12);
  });

  it('formats compact human labels', () => {
    expect(formatSkuValue('C', 4.7e-6)).toBe('4.7 µF');
    expect(formatSkuValue('L', 1.5e-3)).toBe('1.5 mH');
    expect(formatSkuValue('R', 0.68)).toBe('0.68 Ω');
    expect(formatSkuValue('C', 330e-6)).toBe('330 µF');
  });
});
