/**
 * THE DEFAULT CATALOGUE v9 IS v8 PLUS TWO DATASHEET FIELDS, AND NOTHING ELSE
 * (A5e.3, 07-11-2026). Written by `scripts/build-catalog-v9.ts`.
 *
 * Claims: (1) every SKU of v8 is in v9 with every v8 field unchanged — values,
 * DCR, gauges and prices did not move; (2) the only added keys are
 * `tolerance_pct` and `voltage_v`, and no coil carries a voltage; (3) the
 * figures are the datasheets', spot-checked per series against the value
 * breakdowns the sheets print — including the blanks where a sheet does not
 * cover a value; (4) the file imports, and the note cites a source per series.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserializeCatalog } from './catalogFile.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
type Raw = Record<string, unknown> & { sku: string; series: string; kind: string; value: number };
const read = (n: string) => JSON.parse(readFileSync(join(FIX, n), 'utf-8')) as { note: string; components: Raw[] };
const v8 = read('gemini-catalog-v8.json');
const v9 = read('catalog-v9.json');
const bySku = new Map(v9.components.map((c) => [c.sku, c]));
const find = (series: string, uf: number) =>
  v9.components.find((c) => c.series === series && Math.abs(c.value * 1e6 - uf) < 1e-6)!;

describe('catalogue v9', () => {
  it('every v8 SKU is in v9 with every v8 field unchanged', () => {
    expect(v9.components).toHaveLength(v8.components.length);
    for (const c of v8.components) {
      const n = bySku.get(c.sku);
      expect(n, c.sku).toBeDefined();
      for (const [k, v] of Object.entries(c)) expect(n![k], `${c.sku}.${k}`).toEqual(v);
    }
  });

  it('only tolerance_pct and voltage_v are added, and no coil carries a voltage', () => {
    for (const c of v9.components) {
      const old = v8.components.find((o) => o.sku === c.sku)!;
      const added = Object.keys(c).filter((k) => !(k in old));
      for (const k of added) expect(['tolerance_pct', 'voltage_v'], `${c.sku}: ${k}`).toContain(k);
      if (c.kind !== 'C') expect('voltage_v' in c, c.sku).toBe(false);
    }
  });

  it('the figures are the datasheets’, with the blanks where a sheet does not cover a value', () => {
    expect(find('Cross-Cap', 10)).toMatchObject({ voltage_v: 400, tolerance_pct: 5 });
    expect(find('Superior Z-Cap', 0.33)).toMatchObject({ voltage_v: 1200, tolerance_pct: 2 });
    expect(find('Superior Z-Cap', 4.7)).toMatchObject({ voltage_v: 800 });
    expect('voltage_v' in find('Superior Z-Cap', 33)).toBe(false);
    expect(find('Alumen Z-Cap', 4.7)).toMatchObject({ voltage_v: 100, tolerance_pct: 3 });
    expect('voltage_v' in find('Alumen Z-Cap', 0.47)).toBe(false);
    expect(find('MCap Supreme', 10)).toMatchObject({ voltage_v: 600, tolerance_pct: 2 });
    expect(find('MCap Supreme', 22)).toMatchObject({ voltage_v: 800 });
    expect('voltage_v' in find('Audyn Cap QS', 4.7)).toBe(false);
    expect(find('Audyn Cap QS', 4.7)).toMatchObject({ tolerance_pct: 5 });
    expect(find('Electrolytic Bipolar', 47)).toMatchObject({ voltage_v: 100, tolerance_pct: 10 });
    const res = (series: string) => v9.components.find((c) => c.series === series)!;
    expect(res('MOX')).toMatchObject({ tolerance_pct: 5 });
    expect(res('Superes')).toMatchObject({ tolerance_pct: 1 });
    expect(res('MResist Supreme')).toMatchObject({ tolerance_pct: 2 });
    expect(res('CAST Resistor')).toMatchObject({ tolerance_pct: 10 });
  });

  it('the file imports, the fields land on the parts, and the note cites a source per series', () => {
    const imp = deserializeCatalog(readFileSync(join(FIX, 'catalog-v9.json'), 'utf-8'));
    expect(imp.parts).toHaveLength(v8.components.length);
    expect(imp.parts.find((p) => p.series === 'Cross-Cap')).toMatchObject({ voltageV: 400, tolerancePct: 5 });
    for (const s of ['Cross-Cap', 'Superior Z-Cap', 'Alumen Z-Cap', 'Electrolytic Bipolar', 'Audyn Cap QS', 'MCap Supreme', 'MOX', 'Superes', 'MResist Supreme', 'CAST Resistor']) {
      expect(v9.note, s).toContain(`${s}: `);
    }
    expect((v9.note.match(/https:\/\//g) ?? []).length).toBeGreaterThanOrEqual(9);
  });
});
