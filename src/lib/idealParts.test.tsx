/**
 * G-20 — WHICH VALUES ARE NOT A PART YOU CAN BUY, AND WHY (19-11-2026).
 *
 * The audit behind this: Sanders guided demo run (standard filter, Premium,
 * the 4–8 Ω profile) showed every value continuous, and the guided line blamed
 * the snap. Measured on the worker route: the bare standard filter dips to
 * 2.60 Ω, the 3.2 Ω floor refuses the whole tune BEFORE the snap, and a stated
 * candidate (U-5) is handed over as the tune left it — 0 of 20 catalogue
 * parts — while the same candidate unrefused lands on 20 of 20 with Premium.
 *
 * The claims: the mechanism on the tuner itself (a refused tune hands over
 * values the snap never saw, an unrefused one snaps); the two readers and the
 * one sentence; the drawing marks an ideal value only when asked, and P2
 * without the mark; and the app wiring as a source scan.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyCatalogPayload } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';
import { idealValuesCause, isIdealValue, passiveValueKey } from './idealParts.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { partsLine } from '../components/GuidedV2Summary.tsx';
import { PartGlyph } from '../components/Schematic.tsx';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './engine2/optimizer/v2.fixture.ts';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const V9 = fileURLToPath(new URL('./parsers/fixtures/catalog-v9.json', import.meta.url));
const loadCatalogue = () => {
  const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
  applyCatalogPayload({ series: imp.series, parts: imp.parts, disabled: [] });
};
afterAll(() => applyCatalogPayload({ series: [], parts: [], disabled: [] }));

const cap = (extra: Partial<VxpPart> = {}): VxpPart => ({
  type: 'Capacitor',
  partId: 'C2',
  params: [{ name: 'C', value: 112.2, unit: 'uF' }],
  wires: [{ x: 10, y: 6 }, { x: 10, y: 13 }],
  ...extra,
});
const rlcOf = (ps: readonly VxpPart[]) =>
  ps.filter((p) => (p.type === 'Resistor' || p.type === 'Inductor' || p.type === 'Capacitor') && !p.open && !p.shorted);

describe('G-20 — the mechanism, on the tuner', () => {
  const { wBase, tBase } = v2Responses();
  const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;
  const run = (refuseAll: boolean) =>
    optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(), ADJUST, {
      phasePriority: 0.5,
      maxIterations: 60,
      catalogSnap: true,
      snapPrefs: { profile: 'premium' },
      rejectedTuneReport: true,
      gateViolation: () => (refuseAll ? 'M-B/|Z|: below the stated floor (this test)' : null),
    });

  it('an active gate refuses the tune BEFORE the snap: what it hands over carries no catalogue part; the same run unrefused snaps', () => {
    loadCatalogue();
    const refused = run(true);
    expect(refused.refusal?.by).toBe('active-gate');
    const kept = rlcOf(refused.rejectedParts ?? []);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.filter((p) => p.catalog)).toEqual([]);
    expect(kept.every(isIdealValue)).toBe(true);
    // The tegenproef: nothing about the catalogue or the profile stops the snap.
    const passed = run(false);
    expect(passed.refusal).toBeUndefined();
    const snapped = rlcOf(passed.parts);
    expect(snapped.length).toBeGreaterThan(0);
    expect(snapped.every((p) => !!p.catalog)).toBe(true);
  });
});

describe('G-20 — the two readers and the one sentence', () => {
  it('isIdealValue: a passive value without a catalogue stamp, and nothing else', () => {
    expect(isIdealValue(cap())).toBe(true);
    expect(isIdealValue(cap({ catalog: 'JAZ-CC-001-0288' }))).toBe(false);
    expect(isIdealValue(cap({ open: true }))).toBe(false);
    expect(isIdealValue(cap({ shorted: true }))).toBe(false);
    expect(isIdealValue({ type: 'Driver' } as VxpPart)).toBe(false);
    expect(isIdealValue({ type: 'Wire' } as VxpPart)).toBe(false);
  });

  it('passiveValueKey: order-free, and an edited value is another network', () => {
    const a = cap();
    const b: VxpPart = { ...cap(), type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 2.464, unit: 'mH' }] };
    expect(passiveValueKey([a, b])).toBe(passiveValueKey([b, a]));
    expect(passiveValueKey([a, b])).not.toBe(passiveValueKey([cap({ params: [{ name: 'C', value: 120, unit: 'uF' }] }), b]));
  });

  it('the cause, in the order of the facts — and the unrefused case names BOTH causes instead of guessing one', () => {
    expect(idealValuesCause({ catalogLoaded: false, snapOn: true, refusal: 'x' })).toMatch(/No catalogue is loaded/);
    expect(idealValuesCause({ catalogLoaded: true, snapOn: false, refusal: 'x' })).toMatch(/switched off/);
    const refused = idealValuesCause({ catalogLoaded: true, snapOn: true, refusal: 'M-B/|Z|: 2.60 Ω falls below the stated floor of 3.20 Ω' });
    expect(refused).toMatch(/REFUSED — M-B\/\|Z\|: 2\.60 Ω falls below the stated floor of 3\.20 Ω —/);
    expect(refused).toMatch(/not matched to catalogue parts/);
    const unknown = idealValuesCause({ catalogLoaded: true, snapOn: true, refusal: null });
    expect(unknown).toMatch(/⚠ snap REFUSED/);
    expect(unknown).toMatch(/STATED \(U-5\)/);
    expect(unknown).toMatch(/^Either /);
  });

  it('the guided parts line carries the refusal for a refused design with ideal values', () => {
    const why = idealValuesCause({ catalogLoaded: true, snapOn: true, refusal: 'M-B/|Z|: 2.60 Ω falls below the stated floor of 3.20 Ω' });
    const line = partsLine({ total: 20, catalog: 0, why, stacked: 0 });
    expect(line.ok).toBe(false);
    expect(line.text).toMatch(/^Ideal values: none of the 20 parts/);
    expect(line.text).toContain('REFUSED — M-B/|Z|: 2.60 Ω');
  });

  it('S-5: a refused design made of catalogue parts is not "a list you can order"', () => {
    const reason = 'M-B/|Z|: 2.60 Ω falls below the stated floor of 3.20 Ω';
    const refused = partsLine({ total: 20, catalog: 20, why: null, refused: reason });
    expect(refused.ok).toBe(false);
    expect(refused.text).toContain('but this design was REFUSED — M-B/|Z|: 2.60 Ω');
    expect(refused.text).not.toContain('can be ordered');
    // The tegenproef: the same parts, not refused, can be ordered.
    expect(partsLine({ total: 20, catalog: 20, why: null, refused: null }).text).toContain('can be ordered');
  });
});

describe('G-20 — the drawing', () => {
  const MIN = { x: 0, y: 0 };
  const svg = (p: VxpPart, markIdeal?: boolean) =>
    renderToStaticMarkup(
      <svg>
        <PartGlyph part={p} min={MIN} {...(markIdeal === undefined ? {} : { markIdeal })} />
      </svg>,
    );

  it('an ideal value is marked, with its reason as a tooltip, when asked', () => {
    const out = svg(cap(), true);
    expect(out).toContain('sch-value sch-value-ideal');
    expect(out).toContain('112.2 µF');
    expect(out).toMatch(/· ideal/);
    expect(out).toMatch(/<title>Ideal value — no catalogue part has it/);
  });

  it('a catalogue part is never marked, and without the mark the drawing is what it was (P2)', () => {
    loadCatalogue();
    expect(svg(cap({ catalog: 'JAZ-CC-001-0288' }), true)).not.toContain('sch-value-ideal');
    expect(svg(cap(), false)).toBe(svg(cap()));
    expect(svg(cap())).not.toContain('sch-value-ideal');
    expect(svg(cap())).not.toMatch(/· ideal/);
  });
});

describe('G-20 — the app wiring (source scan)', () => {
  const app = read('../App.tsx');
  it('the old sentence that guessed a cause is gone', () => {
    expect(app).not.toContain('The catalogue snap did not land on this design: real parts would break a hard limit');
  });
  it('the refusal is read off the loaded stated entry AND the drawing', () => {
    expect(app).toMatch(/v2Shortlist\.stated\.find\(\(x\) => x\.label === shortlistPick && !x\.isRow\)/);
    expect(app).toMatch(/passiveValueKey\(e\.parts\) === passiveValueKey\(activeDesign\.parts\) \? e\.refusal\.reason : null/);
  });
  it('one sentence, two readers: the guided parts line and the note under the editor', () => {
    expect(app).toMatch(/parts=\{guidedPartsReality \? \{ \.\.\.guidedPartsReality, why: idealCause, refused: loadedRefusal \} : null\}/);
    expect(app).toMatch(/<p className="sch-ideal-note">[\s\S]{0,400}\{idealCause\}/);
    expect(app).toMatch(/markIdeal=\{catalogSnap && hasImportedCatalog\(\)\}/);
    expect(read('../components/SchematicEditor.tsx')).toMatch(/<PartGlyph part=\{p\} min=\{MIN0\} markIdeal=\{markIdeal\} \/>/);
  });
});
