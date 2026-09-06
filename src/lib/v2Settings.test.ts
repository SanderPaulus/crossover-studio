/**
 * E-2 — P4 ON THE FORM: a fresh browser shows every v2 requirement field
 * empty, no judgement field carries a number it does not hold, and a value
 * says who stated it and when.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_V2_SETTINGS,
  UNSET_GHOST,
  V2_DEFAULT_GHOST_KEYS,
  V2_GHOSTS,
  V2_JUDGEMENT_KEYS,
  V2_SETTING_KEYS,
  designLevelNote,
  restoreV2Settings,
  stampStated,
  statedMark,
} from './v2Settings.ts';

const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf-8');

describe('a fresh browser: every v2 field empty', () => {
  it('the empty state holds every key, and every value is the empty string', () => {
    expect(Object.keys(EMPTY_V2_SETTINGS).sort()).toEqual([...V2_SETTING_KEYS].sort());
    for (const k of V2_SETTING_KEYS) expect(EMPTY_V2_SETTINGS[k]).toBe('');
  });

  it('every judgement key is a known key, and the six Sander read as values are among them', () => {
    for (const k of V2_JUDGEMENT_KEYS) expect(V2_SETTING_KEYS).toContain(k);
    for (const k of ['maxDissipationPct', 'minEpdrOhm', 'maxDriveOnFsDb', 'lfBumpBudgetDb', 'qesMultiplierMax', 'dampingMarginDb'] as const) {
      expect(V2_JUDGEMENT_KEYS).toContain(k);
    }
  });

  it('a project without the block, and a project with an empty block, both restore to the empty state', () => {
    expect(restoreV2Settings(undefined, undefined).settings).toEqual(EMPTY_V2_SETTINGS);
    expect(restoreV2Settings({}, {}).settings).toEqual(EMPTY_V2_SETTINGS);
    expect(restoreV2Settings(undefined, undefined).statedAt).toEqual({});
  });

  it('the app seeds its state from the one empty definition and restores through the one restore', () => {
    expect(APP).toMatch(/useState<V2Settings>\(\{ \.\.\.EMPTY_V2_SETTINGS \}\)/);
    expect(APP).toMatch(/restoreV2Settings\(d\.engineV2, d\.engineV2StatedAt\)/);
  });
});

describe('no judgement field carries a numeric ghost', () => {
  it('every judgement key shows the unset mark', () => {
    for (const k of V2_JUDGEMENT_KEYS) expect(V2_GHOSTS[k]).toBe(UNSET_GHOST);
  });

  it('no ghost in this file contains a digit', () => {
    for (const k of V2_SETTING_KEYS) expect(V2_GHOSTS[k]).not.toMatch(/\d/);
  });

  it('the only ghosts the app fills from an engine default are the seed and the shortlist size — both reported, neither a judgement', () => {
    expect([...V2_DEFAULT_GHOST_KEYS].sort()).toEqual(['runSeed', 'shortlistSize']);
    for (const k of V2_DEFAULT_GHOST_KEYS) expect(V2_JUDGEMENT_KEYS).not.toContain(k);
  });

  it('App.tsx: no v2 settings input carries a numeric placeholder literal', () => {
    /* Every `placeholder="<number>"` in the app, with the six lines above it:
     * one that sits under a `value={engineV2Settings.…}` is a v2 field showing
     * a number it does not hold. The seed and the shortlist size are filled
     * from `String(DEFAULT_…)` and never from a literal, so they cannot match. */
    const lines = APP.split('\n');
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/placeholder="-?\d/.test(line)) return;
      const above = lines.slice(Math.max(0, i - 6), i).join('\n');
      if (/value=\{engineV2Settings\./.test(above)) offenders.push(`${i + 1}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
    // …and the scan can see: the v2 fields do read their ghost from the one table.
    expect((APP.match(/placeholder=\{V2_GHOSTS\./g) ?? []).length).toBeGreaterThanOrEqual(V2_JUDGEMENT_KEYS.length - 2);
  });
});

describe('a value says who stated it and when', () => {
  it('editing stamps today; clearing drops the stamp', () => {
    const a = stampStated({}, 'minEpdrOhm', '1.6', '2026-09-06');
    expect(a).toEqual({ minEpdrOhm: '2026-09-06' });
    expect(stampStated(a, 'minEpdrOhm', '', '2026-09-07')).toEqual({});
    expect(stampStated(a, 'minEpdrOhm', '   ', '2026-09-07')).toEqual({});
  });

  it('an empty field has no mark; a dated value names the date; an undated value says the date is not recorded', () => {
    const s = { ...EMPTY_V2_SETTINGS, minEpdrOhm: '1.6', maxDriveOnFsDb: '-20' };
    expect(statedMark(s, { minEpdrOhm: '2026-09-06' }, 'minEpdrOhm')).toBe('stated by you on 2026-09-06');
    expect(statedMark(s, {}, 'maxDriveOnFsDb')).toBe('stated by you (date not recorded)');
    expect(statedMark(s, {}, 'lfBumpBudgetDb')).toBeNull();
  });

  it('a restored project keeps its values with their dates, drops unknown keys, and never dates an empty field', () => {
    const r = restoreV2Settings(
      { minEpdrOhm: '1.6', maxDriveOnFsDb: '-20', notAKey: '7', lfBumpBudgetDb: '' },
      { minEpdrOhm: '2026-09-01', lfBumpBudgetDb: '2026-09-01', notAKey: '2026-09-01' },
    );
    expect(r.settings.minEpdrOhm).toBe('1.6');
    expect(r.settings.maxDriveOnFsDb).toBe('-20');
    expect(r.settings.lfBumpBudgetDb).toBe('');
    expect('notAKey' in r.settings).toBe(false);
    expect(r.statedAt).toEqual({ minEpdrOhm: '2026-09-01' });
    expect(statedMark(r.settings, r.statedAt, 'maxDriveOnFsDb')).toBe('stated by you (date not recorded)');
  });

  it('the app writes the dates beside the block, edits every field through the one setter, and marks every judgement field', () => {
    expect(APP).toMatch(/engineV2StatedAt: \{ \.\.\.engineV2StatedAt \}/);
    // The mark is rendered by one helper that reads `statedMark`; every judgement key calls it.
    expect(APP).toMatch(/statedMark\(engineV2Settings, engineV2StatedAt, key\)/);
    for (const k of V2_JUDGEMENT_KEYS) expect(APP).toContain(`{v2Stated('${k}')}`);
    // …and no field is edited past the setter that stamps the date.
    expect(APP).not.toMatch(/setEngineV2Settings\(\(v\) => \(\{ \.\.\.v, \w+: e\.target\.value \}\)\)/);
  });
});

describe('the v1 design level on the v2 route', () => {
  it('is marked as not read by Engine v2, and unmarked on v1', () => {
    expect(designLevelNote(true)).toMatch(/not read by Engine v2 since V49/);
    expect(designLevelNote(false)).toBeNull();
    expect(APP).toMatch(/designLevelNote\(engineV2Enabled\)/);
  });
});
