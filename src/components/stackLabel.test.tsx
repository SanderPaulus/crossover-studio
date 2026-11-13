/**
 * G-19 — A STACKED PART SAYS WHAT IT IS BUILT FROM (12-11-2026).
 *
 * Sanders demo run, Standaardfilter + Standaard-onderdelen: every part came
 * from the catalogue, and the schematic still showed C2 = 109 µF and
 * B·C1 = 41.2 µF — values no series stocks. Both were banks the snap built
 * (82 + 27 µF and 33 + 8.2 µF, all four Jantzen Cross-Cap, the Standard
 * tier); the BOM named the members, the drawing only the sum, and the sum
 * read as "impossible values despite the standard series". The claims: the
 * stamp is read by one helper; the schematic label carries the members; a
 * single part, an unstamped part and an unknown SKU stay exactly as they
 * were (P2); and the guided parts line counts the banks.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyCatalogPayload, catalogParts, describeStackMembers, stackMembersOf } from '../lib/catalog.ts';
import { deserializeCatalog } from '../lib/catalogFile.ts';
import type { VxpPart } from '../lib/parsers/vxp.ts';
import { partValue } from './Schematic.tsx';
import { partsLine } from './GuidedV2Summary.tsx';

const V9 = fileURLToPath(new URL('../lib/parsers/fixtures/catalog-v9.json', import.meta.url));
const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
applyCatalogPayload({ series: imp.series, parts: imp.parts, disabled: [] });
afterAll(() => applyCatalogPayload({ series: [], parts: [], disabled: [] }));

/** The two banks from Sanders run, exactly as the snap stamped them. */
const C2: VxpPart = {
  type: 'Capacitor',
  partId: 'C2',
  params: [{ name: 'C', value: 109, unit: 'uF' }, { name: 'ESR', value: 0.025, unit: 'Ω' }],
  wires: [{ x: 10, y: 6 }, { x: 10, y: 13 }],
  catalog: 'JAZ-CC-001-0288+JAZ-CC-001-0274',
};
const BC1: VxpPart = { ...C2, partId: 'B·C1', params: [{ name: 'C', value: 41.2, unit: 'uF' }], catalog: 'JAZ-CC-001-0278+AUD-QS-82' };

describe('G-19 — a stacked part says what it is built from', () => {
  it('the premise: both stamps name real catalogue parts whose values sum to the drawn value', () => {
    for (const p of [C2, BC1]) {
      const ids = p.catalog!.split('+');
      const found = ids.map((id) => catalogParts().find((c) => c.id === id));
      expect(found.every(Boolean), p.catalog).toBe(true);
      const sumUf = found.reduce((a, c) => a + c!.value * 1e6, 0);
      expect(sumUf).toBeCloseTo(p.params[0].value, 6);
    }
  });

  it('the helper reads the members in the schematic’s own unit, and words them', () => {
    expect(stackMembersOf(C2)!.map((v) => Number(v.toPrecision(3)))).toEqual([82, 27]);
    expect(stackMembersOf(BC1)!.map((v) => Number(v.toPrecision(3)))).toEqual([33, 8.2]);
    expect(describeStackMembers([82, 27])).toBe('82 + 27');
    expect(describeStackMembers([22, 22])).toBe('2× 22');
  });

  it('the schematic label carries the members: "109 µF (82 + 27)"', () => {
    expect(partValue(C2)).toBe('109 µF (82 + 27)');
    expect(partValue(BC1)).toBe('41.2 µF (33 + 8.2)');
  });

  it('P2 — a single part, an unstamped part and a stamp the catalogue does not know draw exactly as before', () => {
    const single: VxpPart = { ...C2, params: [{ name: 'C', value: 82, unit: 'uF' }], catalog: 'JAZ-CC-001-0288' };
    const bare: VxpPart = { ...C2, catalog: undefined };
    const ghost: VxpPart = { ...C2, catalog: 'NOPE-1+NOPE-2' };
    expect(stackMembersOf(single)).toBeNull();
    expect(stackMembersOf(bare)).toBeNull();
    expect(stackMembersOf(ghost)).toBeNull();
    expect(partValue(single)).toBe('82 µF');
    expect(partValue(bare)).toBe('109 µF');
    expect(partValue(ghost)).toBe('109 µF');
  });

  it('the guided parts line counts the banks — and says nothing about banks where there are none', () => {
    const withStacks = partsLine({ total: 18, catalog: 18, why: null, stacked: 2 });
    expect(withStacks.ok).toBe(true);
    expect(withStacks.text).toContain('can be ordered');
    expect(withStacks.text).toMatch(/2 of these positions are built from two or more catalogue parts/);
    expect(partsLine({ total: 18, catalog: 18, why: null, stacked: 0 }).text).not.toMatch(/positions are built/);
    expect(partsLine({ total: 18, catalog: 18, why: null }).text).not.toMatch(/positions are built/);
  });

  it('App: the count is the same stamp reader, on the loaded design', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    expect(app).toMatch(/stacked: rlc\.filter\(\(p\) => stackMembersOf\(p\) !== null\)\.length/);
  });
});
