/**
 * E-2 — THE FIELD MODE on casus 1: an exploration is a SMALLER field, not a
 * looser search.
 *
 * Four claims, and the fourth is the one that protects every recorded run:
 *
 *   1. the mode's settings are what the header says — the exploration states
 *      the budget and both policies, the full mode states a budget and NO
 *      policy at all;
 *   2. on casus 1 the exploration fits its budget, builds ONE order per
 *      handover (the stated one), and every axis holds the geometric centre
 *      of its window — the reference crossing the order derivation reads;
 *   3. the mode can be read back off a field's own parameters, so a shortlist
 *      says which mode made it without trusting a label beside it;
 *   4. the FULL mode's field keys byte-identically to the F4d-form request
 *      (`chainBudget: steps^pairs`, nothing else) — so `candidateFieldKey`,
 *      and with it every run fingerprint recorded before E-2, is unmoved.
 */

import { describe, expect, it } from 'vitest';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../casus1.fixture.ts';
import { buildReport } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';
import { CASUS1_FIELD_STATED_ORDER, CASUS1_WINDOW_SETTINGS } from '../casus1V2.fixture.ts';
import { EXPLORATION_CHAIN_BUDGET } from '../constants.ts';
import { stableJson } from '../optimizer/determinism.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';
import { buildCandidateField, candidateFieldKey, type CandidateFieldRequest } from './candidateField.ts';
import { roundEdge } from './xoRangeAdvice.ts';
import { describeFieldMode, fieldModeOf, fieldModeOfParameters, fieldModeSettings, FIELD_MODES } from './fieldMode.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: FLAT_TARGET,
    ...casus1ExcursionSettings(golden),
    ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
      ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
      : {}),
    ...CASUS1_WINDOW_SETTINGS,
  },
});

/** The request the app makes, minus the mode's slice — every casus-1 test states order 4. */
const base = (): Omit<CandidateFieldRequest, 'chainBudget' | 'positionPolicy' | 'alignmentPolicy'> => ({
  windowInputs: report.predesign.windowInputs,
  perPair: report.predesign.windowInputs.map(() => ({ statedOrder: CASUS1_FIELD_STATED_ORDER })),
  alignments: AUTO_STRUCTS,
});

describe('1 — what each mode hands the generator', () => {
  it('an unstated or unknown mode is the exploration; only "full" is full', () => {
    expect(fieldModeOf('')).toBe('exploration');
    expect(fieldModeOf(undefined)).toBe('exploration');
    expect(fieldModeOf('anything')).toBe('exploration');
    expect(fieldModeOf('full')).toBe('full');
    expect(FIELD_MODES).toEqual(['exploration', 'full']);
  });

  it('the exploration states the budget and BOTH policies; the full mode states steps^pairs and no policy', () => {
    const x = fieldModeSettings('exploration', { stepsPerAxis: 3, pairs: 2 });
    expect(x).toEqual({ chainBudget: EXPLORATION_CHAIN_BUDGET, positionPolicy: 'centre-first', alignmentPolicy: 'one' });
    const f = fieldModeSettings('full', { stepsPerAxis: 3, pairs: 2 });
    expect(f).toEqual({ chainBudget: 9 });
    expect('positionPolicy' in f).toBe(false);
    expect(fieldModeSettings('full', { stepsPerAxis: 2, pairs: 3 }).chainBudget).toBe(8);
  });
});

describe('2 — the exploration on casus 1', () => {
  const exploration = buildCandidateField({ ...base(), ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }) });
  const full = buildCandidateField({ ...base(), ...fieldModeSettings('full', { stepsPerAxis: 3, pairs: 2 }) });

  it('fits the stated budget, and is smaller than the full field', () => {
    expect(exploration.field.candidates.length).toBeGreaterThan(0);
    expect(exploration.field.candidates.length).toBeLessThanOrEqual(EXPLORATION_CHAIN_BUDGET);
    expect(exploration.field.candidates.length).toBeLessThan(full.field.candidates.length);
  });

  it('builds ONE order per handover — the stated one — where the full request over AUTO_STRUCTS may build more', () => {
    for (const a of exploration.field.axes) expect(a.orders).toEqual([CASUS1_FIELD_STATED_ORDER]);
    for (const c of exploration.field.candidates) {
      expect(c.crossings).toHaveLength(2);
      for (const x of c.crossings) expect(x.alignment).toEqual({ kind: 'LR', order: CASUS1_FIELD_STATED_ORDER });
    }
  });

  it('every axis holds the geometric centre of its window — where the order derivation reads its demands', () => {
    for (const a of exploration.field.axes) {
      const w = a.window[String(CASUS1_FIELD_STATED_ORDER)];
      const centre = roundEdge(Math.sqrt(w.floorHz! * w.ceilingHz!));
      const hz = a.positionsByOrder[0].hz;
      expect(hz.some((h) => Math.abs(h - centre) <= 0.1)).toBe(true);
      // …and NOT the window edges, which the spread layout would have placed first.
      expect(hz).not.toContain(roundEdge(w.floorHz!));
      expect(hz).not.toContain(roundEdge(w.ceilingHz!));
    }
  });

  it('the same requirements: the windows, the floors and the ceilings are the full field\'s', () => {
    for (let i = 0; i < exploration.field.axes.length; i++) {
      const e = exploration.field.axes[i].window[String(CASUS1_FIELD_STATED_ORDER)];
      const f = full.field.axes[i].window[String(CASUS1_FIELD_STATED_ORDER)];
      expect(e.floorHz).toBe(f.floorHz);
      expect(e.ceilingHz).toBe(f.ceilingHz);
      expect(e.floorBy?.rule).toBe(f.floorBy?.rule);
    }
  });

  it('is described as an exploration, with its size against the derived size', () => {
    expect(describeFieldMode(exploration.field)).toMatch(/^Exploration field — \d+ of \d+ derived candidates: chain budget 8, positions centre-first/);
    expect(describeFieldMode(full.field)).toMatch(/^Full field — \d+ candidates/);
  });
});

describe('3 — the mode is read back off the field, not off a label', () => {
  it('both policies together read as exploration; anything less reads as full', () => {
    const p = { minSpacingOctaves: 1 / 6, chainBudget: 8, derivedSize: 30, deliveredSize: 6 } as const;
    expect(fieldModeOfParameters({ ...p, positionPolicy: 'centre-first', alignmentPolicy: 'one' })).toBe('exploration');
    expect(fieldModeOfParameters({ ...p, positionPolicy: 'centre-first' })).toBe('full');
    expect(fieldModeOfParameters({ ...p })).toBe('full');
  });
});

describe('4 — the FULL mode keys byte-identically to the F4d-form request (every recorded fingerprint stands)', () => {
  it('candidateFieldKey is the same string with the mode slice and with the bare chainBudget', () => {
    const viaMode = buildCandidateField({ ...base(), ...fieldModeSettings('full', { stepsPerAxis: 2, pairs: 2 }) });
    const f4d = buildCandidateField({ ...base(), chainBudget: 2 ** 2 });
    expect(stableJson(candidateFieldKey(viaMode.field))).toBe(stableJson(candidateFieldKey(f4d.field)));
    expect('positionPolicy' in viaMode.field.parameters).toBe(false);
  });

  it('the exploration stamps differently from the full field over the same windows', () => {
    const x = buildCandidateField({ ...base(), ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }) });
    const f = buildCandidateField({ ...base(), chainBudget: EXPLORATION_CHAIN_BUDGET });
    expect(stableJson(candidateFieldKey(x.field))).not.toBe(stableJson(candidateFieldKey(f.field)));
  });
});
