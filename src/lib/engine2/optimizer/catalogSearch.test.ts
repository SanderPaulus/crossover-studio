/**
 * S-5 — THE CATALOGUE-ONLY SEARCH (`valueSearch: 'catalog'`), armed by the app
 * on the STANDARD FILTER with the snap on (19-11-2026).
 *
 * Sander: "bij de snap mag hij alleen de beschikbare componenten gebruiken …
 * de simulaties kunnen nog sneller gaan". The search starts on the nearest
 * purchasable realisation of every seed value and only ever steps to another
 * purchasable part, scored by the tune's own objective in its discrete form
 * (`objectiveOn`: search box, sum ceilings, barriers) plus the snap's cost and
 * stack terms. Measured on the worker route (casus 1 'm3', standard filter,
 * Premium, snap on): 40–42 s against 111–139 s, ripple +0.04 to +0.19 dB. On
 * the free filter (which adds and removes parts) it gave 6.6–9.4 dB, so a run
 * that asks for a structure search keeps the continuous search.
 *
 * The claims: absent and an explicit 'continuous' are the same run; the arm
 * needs the snap and a catalogue (otherwise it is the continuous search, P4);
 * with both, every delivered passive part is a catalogue part and the note
 * says no continuous value was simulated; a structure search falls back and
 * says why; and the app states it on both chains.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyCatalogPayload } from '../../catalog.ts';
import { deserializeCatalog } from '../../catalogFile.ts';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const V9 = fileURLToPath(new URL('../../parsers/fixtures/catalog-v9.json', import.meta.url));
const loadCatalogue = () => {
  const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
  applyCatalogPayload({ series: imp.series, parts: imp.parts, disabled: [] });
};
const clearCatalogue = () => applyCatalogPayload({ series: [], parts: [], disabled: [] });
afterAll(clearCatalogue);

const { wBase, tBase } = v2Responses();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;
const run = (extra: Partial<NetOptimizeOptions>) =>
  optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(), ADJUST, {
    phasePriority: 0.5,
    maxIterations: 60,
    ...extra,
  });
const rlc = (ps: readonly VxpPart[]) =>
  ps.filter((p) => (p.type === 'Resistor' || p.type === 'Inductor' || p.type === 'Capacitor') && !p.open && !p.shorted);

describe('S-5 — the catalogue-only search', () => {
  it('P2: absent and an explicit continuous search are the same run', () => {
    loadCatalogue();
    const a = run({ catalogSnap: true, snapPrefs: { profile: 'balanced' } });
    const b = run({ catalogSnap: true, snapPrefs: { profile: 'balanced' }, valueSearch: 'continuous' });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('P4: without the snap, or without a catalogue, the arm is the continuous search', () => {
    loadCatalogue();
    expect(JSON.stringify(run({ valueSearch: 'catalog' }))).toBe(JSON.stringify(run({})));
    clearCatalogue();
    expect(JSON.stringify(run({ catalogSnap: true, valueSearch: 'catalog' }))).toBe(JSON.stringify(run({ catalogSnap: true })));
  });

  it('armed: every delivered passive part is a catalogue part, and the note says no continuous value was simulated', () => {
    loadCatalogue();
    const r = run({ catalogSnap: true, snapPrefs: { profile: 'premium' }, valueSearch: 'catalog', audit: { enabled: false } });
    const ps = rlc(r.parts);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.every((p) => !!p.catalog)).toBe(true);
    expect(r.snapNote).toMatch(/catalogue-only search \(S-5\)/);
    expect(r.snapNote).toMatch(/no continuous value was simulated/);
    // The count is reported, not compared: on this small fixture the continuous
    // tune is as cheap (4.8k evaluations either way); on casus 1 the catalogue
    // search is 3× faster (see the header).
    expect(r.snapNote).toMatch(new RegExp(`${r.evaluations} evaluations`));
  });

  it('a run that asks for a structure search (part audit or staged pass) gets the continuous search, and the note says why', () => {
    loadCatalogue();
    const withAudit = run({ catalogSnap: true, snapPrefs: { profile: 'premium' }, valueSearch: 'catalog' });
    expect(withAudit.snapNote).toMatch(/catalogue-only search \(S-5\) not run: this run asks for a structure search/);
    const staged = run({ catalogSnap: true, valueSearch: 'catalog', audit: { enabled: false }, staged: { rippleDb: 2.5, phaseDeg: 15 } });
    expect(staged.snapNote).toMatch(/not run: this run asks for a structure search/);
    // …and it IS the continuous search: the same parts as asking for nothing.
    const plain = run({ catalogSnap: true, snapPrefs: { profile: 'premium' } });
    expect(JSON.stringify(withAudit.parts)).toBe(JSON.stringify(plain.parts));
  });

  it('the app states it on the standard filter with the snap on, on both chains, and the declaration carries it', () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const app = read('../../../App.tsx');
    const arm = /\.\.\.\(catalogSnap && hasImportedCatalog\(\) \? \{ valueSearch: 'catalog' as const \} : \{\}\)/g;
    expect(app.match(arm)?.length).toBe(2);
    expect(read('./scanRequest.ts')).toMatch(/valueSearch: s\.valueSearch,/);
  });
});
