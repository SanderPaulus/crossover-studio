/**
 * I-1 — THE INVENTORY IS COMPLETE, THE LABELS ARE EXACTLY FOUR, AND THE PANEL
 * RENDERS THEM IN THE ORDER OF THE REGISTER.
 *
 * Two halves, and the second is the one that can rot. The register is data and
 * a test over data proves only that the data is well formed; what has to be
 * pinned is that `App.tsx` READS it — the UI-1 lesson one layer up, where the
 * screen after `handleV2Request` sat outside every test and had been doing the
 * wrong thing for months. So every claim about the panel below is a SOURCE
 * SCAN, in the idiom `v2Settings.test.ts` and `selection.test.ts` already use,
 * and each one was checked to be falsifiable before it was written down.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GHOST_KEYS_FILED_AS_NICE,
  JUDGEMENT_KEYS_WHERE_BLANK_DEFERS,
  V2_CLASS_HEADING,
  V2_INPUT_CLASSES,
  V2_INPUT_REGISTER,
  V2_JUDGEMENT_BANDS,
  V2_JUDGEMENT_ROWS,
  V2_MINIMAL_SET,
  emptyHelpFor,
  rowForKey,
  rowsOfClass,
  settingKeysWithoutRow,
  v1NoteFor,
} from './v2InputRegister.ts';
import { V2_JUDGEMENT_KEYS, V2_SETTING_KEYS, designLevelNote } from './v2Settings.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');

/** The v2 block of the options grid: everything under `{engineV2Enabled && (`. */
const V2_BLOCK = (() => {
  const start = APP.indexOf('{engineV2Enabled && (');
  expect(start).toBeGreaterThan(0);
  const end = APP.indexOf("<span className=\"opt-group-cap\">{t('Components')}</span>", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
})();

describe('the register covers the form', () => {
  it('every field of the v2 settings block has a row', () => {
    expect(settingKeysWithoutRow(V2_SETTING_KEYS)).toEqual([]);
  });

  it('every row is filed under one of exactly four labels, and every label is used', () => {
    expect(V2_INPUT_CLASSES).toHaveLength(4);
    for (const r of V2_INPUT_REGISTER) expect(V2_INPUT_CLASSES).toContain(r.cls);
    for (const c of V2_INPUT_CLASSES) expect(rowsOfClass(c).length).toBeGreaterThan(0);
  });

  it('every row states where it lives, how it travels, what blank means and where to find the number', () => {
    for (const r of V2_INPUT_REGISTER) {
      expect(r.label.trim(), r.id).not.toBe('');
      expect(r.form.trim(), r.id).not.toBe('');
      expect(r.travels.trim(), r.id).not.toBe('');
      expect(r.emptyMeans.trim(), r.id).not.toBe('');
      expect(['datasheet', 'nameplate', 'measurement', 'choice'], r.id).toContain(r.source);
    }
  });

  it('ids are unique, so the panel and the tests can address a row', () => {
    const ids = V2_INPUT_REGISTER.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every judgement key of the form is filed as judgement, and the one exception is NAMED', () => {
    /* E-2's list and this register answer different questions (a ghost rule
     * against an arming rule). The disagreement is a named SET rather than a
     * count — the V47/V48 lesson: a complement grows with the corpus. */
    const nice = V2_JUDGEMENT_KEYS.filter((k) => rowForKey(k)?.cls === 'nice');
    expect(nice).toEqual([...GHOST_KEYS_FILED_AS_NICE]);
    for (const k of V2_JUDGEMENT_KEYS) {
      if (GHOST_KEYS_FILED_AS_NICE.includes(k)) continue;
      expect(rowForKey(k)?.cls, k).toBe('judgement');
    }
  });

  it('a judgement row says something is ABSENT, and never that a default applies', () => {
    /* Deliberately not a list of accepted phrasings — that grows one entry per
     * row and stops being a test. A judgement field that is blank arms
     * nothing, so its sentence has to NEGATE something; and it may never
     * promise a default, which is the failure P4 exists to prevent. */
    const defers = new Set<string>(JUDGEMENT_KEYS_WHERE_BLANK_DEFERS);
    for (const r of rowsOfClass('judgement')) {
      expect(r.emptyMeans.toLowerCase(), r.id).not.toMatch(/\bdefaults? to\b|\ba default\b/);
      if (r.key !== undefined && defers.has(r.key)) continue;
      expect(r.emptyMeans.toLowerCase(), r.id).toMatch(/\b(no|not|nothing|neutral)\b/);
    }
    /* The exception is a NAMED SET and it is checked from both sides: the one
     * key on it really does defer rather than disarm, and it really is the
     * only judgement row whose sentence does not negate. */
    expect(JUDGEMENT_KEYS_WHERE_BLANK_DEFERS).toEqual(['resistorThermalPowerW']);
    expect(emptyHelpFor('resistorThermalPowerW')).toMatch(/judges at the amplifier power/);
    expect(
      rowsOfClass('judgement')
        .filter((r) => !/\b(no|not|nothing|neutral)\b/.test(r.emptyMeans.toLowerCase()))
        .map((r) => r.key),
    ).toEqual([...JUDGEMENT_KEYS_WHERE_BLANK_DEFERS]);
    // The counter-proof: the run settings, which are NOT judgement rows, are
    // exactly where a published default is the honest answer — and they say so.
    expect(emptyHelpFor('runSeed')).toMatch(/published default/);
    expect(rowForKey('runSeed')?.cls).toBe('nice');
  });

  it('a v1 row carries what v1 does with it, and says it is not read by Engine v2', () => {
    for (const r of rowsOfClass('v1-legacy')) {
      expect(r.v1Note, r.id).toBeTruthy();
      expect(r.v1Note!, r.id).toMatch(/not read by Engine v2/);
    }
    // …and no other class carries one: the note is what makes the class.
    for (const r of V2_INPUT_REGISTER) {
      if (r.cls !== 'v1-legacy') expect(r.v1Note, r.id).toBeUndefined();
    }
  });

  it('the note beside a v1 field is null on v1 (the toggle invariant, as the designer sees it)', () => {
    expect(v1NoteFor('errorSmoothOct', true)).toMatch(/not read by Engine v2 since V38-fix/);
    expect(v1NoteFor('errorSmoothOct', false)).toBeNull();
    // …and a row of another class never produces one, whatever the flag says.
    expect(v1NoteFor('minEpdrOhm', true)).toBeNull();
    expect(v1NoteFor('not-a-row', true)).toBeNull();
  });

  it('the design-level sentence has ONE home: the register reads E-2’s own function', () => {
    expect(rowsOfClass('v1-legacy').find((r) => r.id === 'excursionSpl')?.v1Note).toBe(
      designLevelNote(true),
    );
  });

  it('the judgement bands are exactly the bands the judgement rows use', () => {
    expect([...new Set(V2_JUDGEMENT_ROWS.map((r) => r.band))].sort()).toEqual(
      [...V2_JUDGEMENT_BANDS].sort(),
    );
  });

  it('the minimal set is the required class plus one stated amplifier floor — and nothing else', () => {
    expect(V2_MINIMAL_SET).toEqual([...rowsOfClass('required').map((r) => r.id), 'ampMinLoadOhm']);
    // The floor is a JUDGEMENT row: the minimal set is "a field, and one thing
    // that judges it", not "a field, and a second required input".
    expect(rowForKey('minEpdrOhm')?.cls).toBe('judgement');
    expect(V2_INPUT_REGISTER.find((r) => r.id === 'ampMinLoadOhm')?.cls).toBe('judgement');
  });
});

describe('the panel is ordered by the register', () => {
  it('the three v2 headings appear in the v2 block, in the order of the register', () => {
    /* U-1 — THREE, NOT FOUR. The fourth heading was the v1 drawer's, and a
       heading that offers "v1" is a route through the interface: exactly what
       U-1 removed. The class is still in the register and still read (the badge
       beside each v1 control, and the project-carryover notice), so this counts
       the headings the PANEL prints rather than the classes that exist. */
    const at = [
      V2_BLOCK.indexOf('{V2_CLASS_HEADING.required}'),
      V2_BLOCK.indexOf('{V2_CLASS_HEADING.judgement}'),
      V2_BLOCK.indexOf('{V2_CLASS_HEADING.nice}'),
    ];
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // …and the headings the panel prints are the register's own words.
    for (const c of V2_INPUT_CLASSES) expect(V2_CLASS_HEADING[c].trim()).not.toBe('');
  });

  it('the five captions the panel replaced are gone: one heading per class, not five ad-hoc groups', () => {
    for (const gone of [
      "{t('Engine v2 — hard gates')}",
      "{t('Engine v2 — search-space budgets')}",
      "{t('Engine v2 — requirements')}",
      "{t('Engine v2 — voicing (A5e.2)')}",
      "{t('Engine v2 — run')}",
    ]) {
      expect(APP).not.toContain(`<span className="opt-group-cap">${gone}</span>`);
    }
    // The finer captions survive as PRESENTATION inside the judgement group.
    expect((V2_BLOCK.match(/className="v2-subcap"/g) ?? []).length).toBe(V2_JUDGEMENT_BANDS.length);
  });

  it('U-1 — the v1 group is gone from the panel, and its per-field badges are not', () => {
    /* The drawer was I-1's second rendering of the v1 class: a list beside the
       controls. U-1 took the list and kept the badges, so the answer to "why
       does this knob do nothing" now sits ON the knob. Both halves are asserted,
       because dropping the drawer without the badges would lose the answer and
       keeping both would restore the heading this file just stopped expecting. */
    expect(APP).not.toContain('<details className="v2-legacy"');
    expect(APP).not.toContain("{V2_CLASS_HEADING['v1-legacy']}");
    // The class survives in the register and every v1 control still names it.
    expect(rowsOfClass('v1-legacy').length).toBeGreaterThan(0);
    for (const r of rowsOfClass('v1-legacy')) {
      if (r.id === 'excursionSpl') continue; // its own call site, pinned below
      expect(APP, r.id).toContain(`{v1Legacy('${r.id}')}`);
    }
  });

  it('the required group points at the tabs that hold those inputs, from the register', () => {
    expect(V2_BLOCK).toContain("rowsOfClass('required')");
    for (const r of rowsOfClass('required')) expect(r.form).toMatch(/tab|header|implicit/);
  });

  it('every settings field with a register row renders its empty-field help', () => {
    for (const k of V2_SETTING_KEYS) {
      if (k === 'fieldMode') continue; // a select with no empty state
      expect(APP, k).toContain(`{v2Empty('${k}')}`);
    }
    // The help is the register's sentence, not a second one typed in the app.
    expect(APP).toContain('emptyHelpFor(key)');
    expect(emptyHelpFor('minEpdrOhm')).toMatch(/judges nothing/);
  });

  it('every v1 control in this panel carries its note beside itself', () => {
    for (const r of rowsOfClass('v1-legacy')) {
      if (r.id === 'excursionSpl') {
        // E-2 marked this one first and `v2Settings.test.ts` pins its call
        // site; it reads the same sentence through `designLevelNote`.
        expect(APP).toContain('designLevelNote(engineV2Enabled)');
        continue;
      }
      expect(APP, r.id).toContain(`{v1Legacy('${r.id}')}`);
    }
    expect(APP).toContain("v1NoteFor(id, engineV2Enabled)");
  });

  it('the scans can see: the same queries hit where they are supposed to hit', () => {
    /* Without this, "the caption is gone" is indistinguishable from "the scan
     * looked at the wrong string", and every claim above would pass over an
     * empty file. */
    expect(V2_BLOCK.length).toBeGreaterThan(1000);
    expect(V2_BLOCK).toContain("{t('Max dissipation %')}");
    expect(V2_BLOCK).toContain("{t('Run seed')}");
    expect(APP).toContain("<span className=\"opt-group-cap\">{t('Components')}</span>");
    // A caption the panel really does still use, in the same spelling the
    // "gone" assertion above searched for.
    expect(APP).toContain("<span className=\"opt-group-cap\">{t('Driver limits')}</span>");
  });
});
