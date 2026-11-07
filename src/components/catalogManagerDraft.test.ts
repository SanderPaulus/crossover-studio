/**
 * An edit in the catalogue manager keeps what it does not show (07-11-2026).
 * Until then `fromSkuDraft` rebuilt a SKU from its form fields only, so a cored
 * coil's saturation current (V50, no field) vanished on every edit, silently.
 * The round trip through the form must return every field of the part.
 */
import { describe, expect, it } from 'vitest';
import type { CatalogPart } from '../lib/catalog.ts';
import { fromSkuDraft, toSkuDraft } from './CatalogManager.tsx';

describe('the SKU form round trip', () => {
  it.each<[string, CatalogPart]>([
    ['a cored coil with a saturation current', { id: 'JAZ-P-1', brand: 'Jantzen', series: 'P-Core Iron Coil', kind: 'L', value: 3.3e-3, seriesR: 0.21, wireMm: 1.2, maxCurrentA: 8, priceEur: 12.5, tier: 'standard' }],
    ['a cap with a tolerance and a rated voltage', { id: 'JAZ-CC-47', brand: 'Jantzen', series: 'Cross-Cap', kind: 'C', value: 4.7e-6, seriesR: 0.02, tolerancePct: 5, voltageV: 400, priceEur: 2.1 }],
  ])('%s comes back unchanged', (_what, part) => {
    const back = fromSkuDraft(toSkuDraft(part));
    expect(back).toEqual(part);
  });
});
