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
import {
  describeFieldMode,
  describePolarityArmsChoice,
  fieldModeOf,
  fieldModeOfParameters,
  fieldModeSettings,
  polarityArmsChoiceOf,
  FIELD_MODES,
  POLARITY_ARMS_CHOICES,
} from './fieldMode.ts';

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

describe('5 — H-4: the polarity arms the mode decides', () => {
  const close = () => ({
    pairLabel: 'p',
    textbookDeg: 88,
    mirrorDeg: 92,
    marginDeg: 4,
    seedMirror: true,
    why: 'close',
  });
  const apart = () => ({
    pairLabel: 'p',
    textbookDeg: 20,
    mirrorDeg: 160,
    marginDeg: 140,
    seedMirror: false,
    why: 'apart',
  });

  it('NO reading = no arms in EITHER mode, and that is the pre-H-4 field byte for byte', () => {
    for (const mode of ['exploration', 'full'] as const) {
      const s = fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 });
      expect('polarityArms' in s).toBe(false);
    }
    /* The claim that matters: without a reading the KEY is unchanged, so every
     * recorded run fingerprint reproduces. */
    const viaMode = buildCandidateField({ ...base(), ...fieldModeSettings('full', { stepsPerAxis: 2, pairs: 2 }) });
    const f4d = buildCandidateField({ ...base(), chainBudget: 2 ** 2 });
    expect(stableJson(candidateFieldKey(viaMode.field))).toBe(stableJson(candidateFieldKey(f4d.field)));
  });

  it('H-5 — the STATED CHOICE is the trigger, and the reader is only data', () => {
    /* Until H-5 the READER decided whether a field had arms, so whether a run
     * was deterministic depended on an accident of plumbing. Now: no choice,
     * no policy — whatever the caller happens to hold. */
    for (const mode of ['exploration', 'full'] as const) {
      expect('polarityArms' in fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 }, apart)).toBe(false);
    }
    /* The DEFAULT of the stated choice is textbook, which mirrors nothing in
     * either mode and never lets a stated position acquire a mirror (U-5 is a
     * rule about a run-SIZE policy, and this is a design rule). */
    for (const mode of ['exploration', 'full'] as const) {
      const tb = fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 }, apart, 'textbook');
      expect(tb.polarityArms?.seed).toBe('textbook');
      expect(tb.polarityArms?.statedAlways).toBe(false);
      expect(tb.polarityArms?.guarantee).toBe('none');
      /* The reading still travels: it decides nothing and the run notes print
       * what a mirror would have been worth. */
      expect(tb.polarityArms?.marginFor).toBe(apart);
    }
    /* `both` is H-4/H-4b unchanged. */
    expect(fieldModeSettings('full', { stepsPerAxis: 2, pairs: 2 }, apart, 'both').polarityArms?.seed).toBe('both');
    const expl = fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, apart, 'both');
    expect(expl.polarityArms?.seed).toBe('margin');
    expect(expl.polarityArms?.guarantee).toBe('single-reversal');
    expect(expl.polarityArms?.statedAlways).toBe(true);
    /* And an empty or unknown stored string reads as the default. */
    expect(polarityArmsChoiceOf('')).toBe('textbook');
    expect(polarityArmsChoiceOf(undefined)).toBe('textbook');
    expect(polarityArmsChoiceOf('nonsense')).toBe('textbook');
    expect(polarityArmsChoiceOf('both')).toBe('both');
    /* Exactly two choices, and each says in one line what it will do — the
     * sentence the panel and the run notes both print. */
    expect([...POLARITY_ARMS_CHOICES]).toEqual(['textbook', 'both']);
    expect(describePolarityArmsChoice('textbook')).toContain('TEXTBOOK');
    expect(describePolarityArmsChoice('textbook')).toContain('no mirrored arm is built');
    expect(describePolarityArmsChoice('both')).toContain('BOTH');
    expect(describePolarityArmsChoice('both')).toContain('multiplies');
  });

  it('H-5 — TEXTBOOK states a polarity on every candidate and builds no mirror', () => {
    const bare = buildCandidateField({ ...base(), ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }) });
    for (const mode of ['exploration', 'full'] as const) {
      const f = buildCandidateField({
        ...base(),
        ...fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 }, close, 'textbook'),
      });
      /* Not one candidate more than the field derived — the reading says both
       * handovers are close, and under textbook that decides nothing. */
      const bareSame = buildCandidateField({ ...base(), ...fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 }) });
      expect(f.field.candidates).toHaveLength(bareSame.field.candidates.length);
      expect(f.field.candidates.every((c) => c.polarity?.arm === 'textbook')).toBe(true);
      expect('mirroredArms' in f.field.parameters).toBe(false);
    }
    /* THE TEGENPROEF, and it is what makes the claim above mean anything: the
     * same reading under `both` DOES multiply the field. */
    const both = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, close, 'both'),
    });
    expect(both.field.candidates.length).toBeGreaterThan(bare.field.candidates.length);
  });

  it('H-4b — a DISTANT reading still runs the single-driver reversal; a close one adds the rest', () => {
    const near = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, close, 'both'),
    });
    const far = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, apart, 'both'),
    });
    const bare = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }),
    });
    /* NO READING AT ALL is still the pre-H-4 field, byte for byte: a caller
     * that cannot read the responses cannot honestly say what an arm is worth,
     * and the fixtures are those callers (P2). */
    expect(bare.field.candidates.every((c) => c.polarity === undefined)).toBe(true);
    /* WHAT H-4b CHANGED. Under H-4 this line read `far === bare` — the margin
     * gated everything and the reversed mid was never simulated. Sander stated
     * on 20-09-2026 that a three-way session must always simulate it, so two of
     * the four configurations are now unconditional and the exploration
     * DOUBLES where it used to stand still. */
    expect(far.field.candidates.length).toBe(bare.field.candidates.length * 2);
    const mirrors = far.field.candidates.filter((c) => c.polarity?.arm === 'mirror');
    expect(mirrors).toHaveLength(bare.field.candidates.length);
    /* And every one of them reverses exactly ONE driver — the mid. */
    for (const m of mirrors) expect(m.polarity!.invertedWays).toEqual(['mid']);
    /* Two handovers, both close: every candidate stands for four arms. */
    expect(near.field.candidates.length).toBe(bare.field.candidates.length * 4);
  });

  it('a stated position gets both arms in both modes UNDER `both` (U-5)', () => {
    for (const mode of ['exploration', 'full'] as const)
      expect(fieldModeSettings(mode, { stepsPerAxis: 2, pairs: 2 }, apart, 'both').polarityArms?.statedAlways).toBe(true);
  });
});

describe('6 — H-4: the field line counts the arms in their own clause', () => {
  const close = () => ({ pairLabel: 'p', textbookDeg: 88, mirrorDeg: 92, marginDeg: 4, seedMirror: true, why: 'close' });

  it('says how many arms stand beside the derived candidates, and never folds them into that count', () => {
    const f = buildCandidateField({
      ...base(),
      ...fieldModeSettings('full', { stepsPerAxis: 2, pairs: 2 }, close, 'both'),
    });
    const line = describeFieldMode(f.field);
    const derived = f.field.parameters.derivedSize;
    const mirrored = f.field.parameters.mirroredArms ?? 0;
    expect(mirrored).toBeGreaterThan(0);
    /* The number in "Full field — N candidates" is the DERIVED half: a
     * sentence that read "44 candidates (22 derived …)" is the U-5 defect one
     * clause over. */
    expect(line).toContain(`${f.field.candidates.length - mirrored} candidate`);
    expect(line).toContain(`${mirrored} mirrored polarity arm`);
    expect(derived).toBeLessThan(f.field.candidates.length);
  });

  it('and says nothing at all about arms on a field that has none', () => {
    const f = buildCandidateField({ ...base(), ...fieldModeSettings('full', { stepsPerAxis: 2, pairs: 2 }) });
    expect('mirroredArms' in f.field.parameters).toBe(false);
    expect(describeFieldMode(f.field)).not.toContain('mirrored');
  });
});
