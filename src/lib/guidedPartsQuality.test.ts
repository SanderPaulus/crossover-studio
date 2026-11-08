/**
 * GUIDED COMPONENT QUALITY — four of the five snap profiles, in plain words,
 * writing the one state expert writes (`guidedPartsQuality.ts`).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUIDED_PARTS_QUALITY,
  COILS_NOT_BY_QUALITY,
  guidedPartsQualityLabel,
  guidedPartsQualityNote,
  isGuidedPartsQuality,
} from './guidedPartsQuality.ts';
import type { SnapPrefs } from './catalog.ts';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

describe('guided component quality', () => {
  it('offers four snap profiles, each a value the snap knows, and not the position doctrine', () => {
    const ids = GUIDED_PARTS_QUALITY.map((q) => q.id);
    expect(ids).toEqual(['auto', 'budget', 'balanced', 'premium']);
    // Type-level: every id is a SnapPrefs profile.
    const asProfile: SnapPrefs['profile'][] = ids;
    expect(asProfile).not.toContain('position');
  });

  it('a profile guided does not offer is named, never shown as one of the four', () => {
    expect(isGuidedPartsQuality('position')).toBe(false);
    expect(guidedPartsQualityLabel('position')).toBeNull();
    expect(guidedPartsQualityNote('position')).toContain('"position"');
    for (const q of GUIDED_PARTS_QUALITY) expect(guidedPartsQualityNote(q.id)).toBeNull();
  });

  it('says that coils are not steered by it', () => {
    expect(COILS_NOT_BY_QUALITY).toMatch(/Coils are not chosen by this/);
  });

  it('the guided buttons write snapProfile — the same state expert writes — and nothing else', () => {
    const i = APP.indexOf('className="guided-parts-quality"');
    expect(i).toBeGreaterThan(0);
    /* 08-11-2026: the block is the wizard's last question ('parts'), not a
       block on the Design step. */
    expect(APP.lastIndexOf("{q.kind === 'parts' && (", i)).toBeGreaterThan(i - 200);
    const block = APP.slice(i, APP.indexOf('{nav(false)}', i));
    expect(block).toContain('GUIDED_PARTS_QUALITY.map');
    expect(block).toContain('onClick={() => setSnapProfile(pq.id)}');
    expect(block).toContain('aria-pressed={snapProfile === pq.id}');
    expect(APP.match(/className="guided-parts-quality"/g)).toHaveLength(1);
    // No second state: the run still reads snapProfile through snapPrefsValue.
    expect(APP).toContain('profile: snapProfile as SnapPrefs[\'profile\']');
  });

  it('the run records the profile it snapped with, and the summary names it', () => {
    expect(APP.match(/snapProfile: catalogSnap && hasImportedCatalog\(\) \? snapProfile : null,/g)?.length).toBe(2);
    expect(APP).toContain('partsQuality={');
  });

  it('in guided, an offered profile is no longer listed as a hidden deviation', () => {
    expect(APP).toContain("snapProfile !== 'auto' && !(uiMode === 'guided' && isGuidedPartsQuality(snapProfile))");
  });
});
