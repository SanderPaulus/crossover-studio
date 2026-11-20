/**
 * AUDIT 20-11-2026 — NO FICTITIOUS VALUES WITH THE SNAP ON.
 *
 * Sander: "een audit … om er zeker van te zijn dat we in zowel guided als
 * expert tussen alle snaps geen enkele keer meer fictieve waardes krijgen.
 * Dit hoeven geen duizenden tests te zijn!"
 *
 * The routes that hand a network to the drawing, and how each lands on
 * purchasable parts (measured on casus 1 through the worker route, scratch
 * matrix of the audit, before the repairs below):
 *  - a run on the STANDARD filter: the catalogue-only search (S-5) — clean on
 *    all five profiles, delivered and stated;
 *  - a run on the FULL filter: the continuous tune and the end snap — and the
 *    end snap ROLLED BACK to the continuous values when its parts broke a hard
 *    limit ("⚠ snap REFUSED");
 *  - a design refused before the snap (V31/V33): reported with the refused
 *    tune's continuous values, and a stated candidate (U-5) is SHOWN with them;
 *  - ✂ Minimize: every retune with the snap off, so the result was continuous;
 *  - "New from template": textbook values, never snapped;
 *  - ⚙ Optimize components on a standard filter: the continuous tune (the
 *    declaration did not carry `valueSearch`; repaired and pinned in
 *    catalogSearch.test.ts).
 *
 * The claims, one per route, on small fixtures: every profile on both filter
 * routes delivers catalogue parts only; a snap that breaks an active gate
 * refuses instead of handing back continuous values, and reports what it
 * reached on purchasable parts; ✂ Minimize lands on catalogue parts; a
 * template is drawn on catalogue parts; and the rollback sentence is gone
 * from the source. What remains by choice: the snap switched off, no
 * catalogue loaded, a value the designer typed or locked.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyCatalogPayload, snapToNearestCatalogue, type SnapPrefs } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { filterTemplate } from './filterTemplates.ts';
import { minimizeNetwork } from './minimize.ts';
import { optimizeNetworkValues, type NetOptimizeOptions } from './netOptimizer.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './engine2/optimizer/v2.fixture.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const V9 = fileURLToPath(new URL('./parsers/fixtures/catalog-v9.json', import.meta.url));
const loadCatalogue = () => {
  const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
  applyCatalogPayload({ series: imp.series, parts: imp.parts, disabled: [] });
};
const clearCatalogue = () => applyCatalogPayload({ series: [], parts: [], disabled: [] });
afterAll(clearCatalogue);

const rlc = (ps: readonly VxpPart[]) =>
  ps.filter((p) => (p.type === 'Resistor' || p.type === 'Inductor' || p.type === 'Capacitor') && !p.open && !p.shorted);
const fictitious = (ps: readonly VxpPart[]) => rlc(ps).filter((p) => !p.catalog).map((p) => p.partId);

const { wBase, tBase } = v2Responses();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;
const run = (extra: Partial<NetOptimizeOptions>) =>
  optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(), ADJUST, {
    phasePriority: 0.5,
    maxIterations: 60,
    ...extra,
  });

const PROFILES: SnapPrefs['profile'][] = ['auto', 'budget', 'balanced', 'premium', 'position'];

describe('audit 20-11-2026 — every snap profile, both filter routes', () => {
  it.each(PROFILES)('%s: the full-filter route (continuous tune, end snap) and the standard route (catalogue search) deliver catalogue parts only', (profile) => {
    loadCatalogue();
    const full = run({ catalogSnap: true, snapPrefs: { profile }, staged: { rippleDb: 2.5, phaseDeg: 15 } });
    expect(rlc(full.parts).length).toBeGreaterThan(0);
    expect(fictitious(full.parts)).toEqual([]);
    const standard = run({ catalogSnap: true, snapPrefs: { profile }, valueSearch: 'catalog', audit: { enabled: false } });
    expect(rlc(standard.parts).length).toBeGreaterThan(0);
    expect(fictitious(standard.parts)).toEqual([]);
  }, 120_000);
});

describe('audit 20-11-2026 — a snap that breaks an active gate', () => {
  it('never hands back the continuous values: it refuses, and reports what it reached on purchasable parts', () => {
    loadCatalogue();
    /* A gate that holds every continuous network and refuses every purchasable
     * one: the tune passes, the snap's choice breaks it, the catalogue search
     * from the tuned values breaks it too. Until the audit this handed back
     * the tuned continuous values ("⚠ snap REFUSED … Rolled back"). */
    const r = run({
      catalogSnap: true,
      snapPrefs: { profile: 'balanced' },
      rejectedTuneReport: true,
      gateViolation: (ps) => (ps.some((p) => !!p.catalog) ? 'this test: no purchasable network is allowed' : null),
    });
    expect(r.refusal?.by).toBe('active-gate');
    expect(r.refusal?.reason).toMatch(/this test/);
    expect(r.tuned).toBe(0);
    expect(r.snapNote).toMatch(/no purchasable network holds every active gate/);
    expect(rlc(r.rejectedParts ?? []).length).toBeGreaterThan(0);
    expect(fictitious(r.rejectedParts ?? [])).toEqual([]);
  }, 120_000);

  it('the tegenproef: the same gate without a catalogue refuses nothing, and the continuous values are the run (P2 — the snap could not run)', () => {
    clearCatalogue();
    const r = run({
      catalogSnap: true,
      rejectedTuneReport: true,
      gateViolation: (ps) => (ps.some((p) => !!p.catalog) ? 'this test: no purchasable network is allowed' : null),
    });
    expect(r.refusal).toBeUndefined();
    expect(fictitious(r.parts).length).toBe(rlc(r.parts).length);
  }, 120_000);
});

describe('audit 20-11-2026 — ✂ Minimize and the template', () => {
  it('✂ Minimize lands its network on catalogue parts when the run asked for the snap, and says so in a step', () => {
    loadCatalogue();
    const r = minimizeNetwork(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(), ADJUST, {
      targets: { rippleDb: 20, phaseDeg: 90 },
      maxRemovals: 1,
      substitute: false,
      tuneOpts: { phasePriority: 0.5, maxIterations: 60, catalogSnap: true, snapPrefs: { profile: 'balanced' } },
    });
    expect(rlc(r.parts).length).toBeGreaterThan(0);
    expect(fictitious(r.parts)).toEqual([]);
    expect(r.steps.some((s) => s.kind === 'land')).toBe(true);
  }, 300_000);

  it('a template is drawn on catalogue parts; without a catalogue it is the textbook template (P2)', () => {
    const parts = filterTemplate({ order: 2, wayCount: 3, models: [] }).parts;
    clearCatalogue();
    expect(snapToNearestCatalogue(parts)).toEqual(parts);
    loadCatalogue();
    const on = snapToNearestCatalogue(parts, { profile: 'balanced' });
    expect(rlc(on).length).toBe(rlc(parts).length);
    expect(fictitious(on)).toEqual([]);
    // A lock is the designer's value, and keeps it.
    const locked = parts.map((p) => (p.type === 'Capacitor' ? { ...p, locked: true } : p));
    const kept = snapToNearestCatalogue(locked, { profile: 'balanced' }).filter((p) => p.type === 'Capacitor');
    expect(kept.every((p) => !p.catalog)).toBe(true);
  });
});

describe('audit 20-11-2026 — the source', () => {
  it('the end snap no longer rolls back to continuous values, and the app draws a template on the catalogue', () => {
    const opt = read('./netOptimizer.ts');
    expect(opt).not.toContain('Rolled back to ` +');
    expect(opt).toMatch(/const found = catalogueSearch\(cur\.parts\);/);
    expect(opt.match(/\? refusedForReport\(outParts, after\)/g)?.length).toBe(2);
    expect(read('./minimize.ts')).toMatch(/valueSearch: 'catalog',/);
    expect(read('../App.tsx')).toMatch(/snapToNearestCatalogue\(ps, snapPrefsValue\(\) \?\? null\)/);
  });
});
