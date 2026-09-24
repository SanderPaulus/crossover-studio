/**
 * H-5 — DE POLARITEIT VOLGT DE TEXTBOOKREGEL, DETERMINISTISCH.
 *
 * WAT ER VERANDERT. Tot H-5 koos de ONTWERPSTAP de polariteit zelf: een
 * enumeratie over de vier combinaties op IDEALE filters, waarvan de verliezer
 * nooit gebouwd, nooit geoordeeld en nooit zichtbaar werd (H-4 beschreef dat en
 * maakte er een KANDIDAAT van). Sinds H-5 stelt het VELD de polariteit van élke
 * kandidaat uit `textbookComplementInverted` — het ene huis van de regel — en
 * is de ontwerpstap eraan gebonden. De spiegelarm blijft bestaan achter één
 * gestelde run-keuze.
 *
 * DE DRIE CLAIMS DIE DIT BESTAND DRAAGT, en de derde is de onaangename.
 *
 *   1. ONDER DE STANDAARD IS ELKE KANDIDAAT TEXTBOOK, op beide routes, en de
 *      regel wordt GELEZEN en niet nagebouwd.
 *   2. ABSENT IS DE IDENTITEIT. Een veld zonder beleid draagt geen polariteit
 *      en de ontwerpstap enumereert zoals altijd — dat is wat élk corpus in dit
 *      casusboek gemaakt heeft, en het is wat de fixtures gepind houden.
 *   3. DE PIN KOST IETS, EN HET STAAT ERBIJ. Op casus 1b en casus 1h koos de
 *      enumeratie de GESPIEGELDE arm op élke kandidaat (H-4 mat het: drie van
 *      drie en één van één). Zouden die fixtures de H-5-standaard overnemen,
 *      dan zou hun live byte-reproductie stoppen met reproduceren — niet als
 *      regressie maar als gevolg van een regel die ná hen kwam. Dezelfde vorm
 *      die M-3 voor de meetset koos, met dezelfde tegenproef: de pin moet
 *      aantoonbaar VERSCHILLEN van de standaard, anders wordt hij stil leeg.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { textbookComplementInverted } from '../activeSide.ts';
import { complementSettings } from '../activeSide.ts';
import { seriesCapsByWay, waysLosingSeriesCap, SERIES_PROTECTION_VERSION } from '../seriesProtection.ts';
import { deserializeFilter } from '../filterFile.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from './casus1.fixture.ts';
import { CASUS1_FIELD_STATED_ORDER, CASUS1_WINDOW_SETTINGS, casus1Field } from './casus1V2.fixture.ts';
import { buildReport } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { FLAT_TARGET } from './requirements/targetCurve.ts';
import { AUTO_STRUCTS } from '../threeWayDesign.ts';
import { buildCandidateField, type CandidateFieldRequest } from './predesign/candidateField.ts';
import type { CandidateCrossing } from './predesign/candidates.ts';
import { fieldModeSettings, polarityArmsChoiceOf } from './predesign/fieldMode.ts';
import {
  alignmentsAskingReversal,
  polarityLabel,
  statedInvertedForTwoWay,
  statedPolarityForThreeWay,
  textbookRelativeInverted,
  POLARITY_ARMS_ABSENT_MEANS,
} from './predesign/polarityArms.ts';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '..', '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

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

const base = (): Omit<CandidateFieldRequest, 'chainBudget' | 'positionPolicy' | 'alignmentPolicy'> => ({
  windowInputs: report.predesign.windowInputs,
  perPair: report.predesign.windowInputs.map(() => ({ statedOrder: CASUS1_FIELD_STATED_ORDER })),
  alignments: AUTO_STRUCTS,
});

describe('1 — the rule is READ, and every candidate carries it', () => {
  it('the textbook relative polarity of a handover IS the one home of the rule', () => {
    /* Not a second implementation: `textbookRelativeInverted` forwards to
     * `textbookComplementInverted`, and this pins that it does — on the whole
     * library, not on a sample (A3g). */
    for (const kind of ['LR', 'BW', 'BS'] as const) {
      for (const order of [1, 2, 3, 4] as const) {
        expect(textbookRelativeInverted({ kind, order })).toBe(textbookComplementInverted(kind, order));
      }
    }
    /* And the rule itself, with the hand: LR2 and LR6 ask for a reversal, LR4
     * does not, and nothing but Linkwitz-Riley states one at all. */
    expect(textbookRelativeInverted({ kind: 'LR', order: 2 })).toBe(true);
    expect(textbookRelativeInverted({ kind: 'LR', order: 4 })).toBe(false);
    expect(textbookRelativeInverted({ kind: 'BW', order: 2 })).toBe(false);
  });

  it('casus 1 under the default: every candidate is textbook, on BOTH design-step vocabularies', () => {
    const f = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, undefined, 'textbook'),
    });
    expect(f.field.candidates.length).toBeGreaterThan(0);
    for (const c of f.field.candidates) {
      expect(c.polarity, c.label).toBeDefined();
      expect(c.polarity!.arm).toBe('textbook');
      /* The bits ARE the rule, per handover. */
      expect([...c.polarity!.relativeInverted]).toEqual(c.crossings.map((x) => textbookRelativeInverted(x.alignment)));
      /* And both design steps get the same answer in their own words. Casus 1
       * is all-LR4, so the textbook answer is "nothing reversed" — which is a
       * value and not an absence. */
      const three = statedPolarityForThreeWay(c.polarity!);
      expect(three).toEqual({ midInverted: false, tweeterInverted: false });
      expect(statedInvertedForTwoWay(c.polarity!)).toBe(false);
      expect(c.polarity!.invertedWays).toEqual([]);
    }
  });

  it('an LR2 handover states the reversal, and the label says which alignment asked', () => {
    /* The casus-1 field is LR4-only, so the LR2 half of the rule is shown on
     * the alignment library itself rather than on a casus that cannot express
     * it (M-5 measured that LR2 is not expressible on casus 1's mid→tweeter at
     * all). Two handovers, the lower one LR2: the lower handover reverses, so
     * BOTH ways above it carry the mark, and the arm is still TEXTBOOK. */
    const crossing = (over: Partial<CandidateCrossing>): CandidateCrossing =>
      ({
        pairLabel: 'low→high',
        lower: 'low',
        upper: 'high',
        hz: 2000,
        cageHz: [1800, 2200],
        twoSided: true,
        order: 4,
        alignment: { kind: 'LR', order: 4 },
        windowHz: [1500, 2500],
        floorBy: 'fs',
        ceilingBy: 'breakup',
        segmentHz: [1500, 2500],
        excisions: [],
        position: { index: 0, count: 1, octavesAboveFloor: 0 },
        orderWhy: 'stated',
        provenance: 'derived',
        ...over,
      }) as CandidateCrossing;
    const crossings = [
      crossing({ pairLabel: 'woofer→mid', lower: 'woofer', upper: 'mid', hz: 300, order: 2, alignment: { kind: 'LR', order: 2 } }),
      crossing({ pairLabel: 'mid→tweeter', lower: 'mid', upper: 'tweeter', hz: 2500 }),
    ];
    expect(alignmentsAskingReversal(crossings)).toEqual(['LR2']);
    expect(polarityLabel(['mid', 'tweeter'], 'textbook', ['LR2'])).toBe(' · mid ⌀ + tweeter ⌀ · textbook for LR2');
    /* On an all-LR4 field nothing asks, so the label is the bare word — there
     * is no rule to name when no rule fired. */
    expect(alignmentsAskingReversal([crossings[1]])).toEqual([]);
    expect(polarityLabel([], 'textbook', [])).toBe(' · textbook');
    /* A MIRROR never claims a reason it does not have. */
    expect(polarityLabel(['mid'], 'mirror', ['LR2'])).toBe(' · mid ⌀ · mirror');
  });
});

describe('2 — absent is the identity, and the fixture pin', () => {
  it('a casus field states NO polarity, so the design step enumerates exactly as it did', () => {
    /* `casus1Field` is what the generator, the recorder and both live chain
     * runs call. It takes a policy and is given none. */
    const f = casus1Field(report);
    expect(f.field.candidates.length).toBeGreaterThan(0);
    expect(f.field.candidates.every((c) => c.polarity === undefined)).toBe(true);
    expect(POLARITY_ARMS_ABSENT_MEANS).toContain('enumerates');
  });

  it('THE PIN DIFFERS FROM THE DEFAULT — otherwise it would go quietly vacuous (the M-3 form)', () => {
    /* The claim above is worth nothing on its own: it would also hold if the
     * H-5 default were "no policy". So the app's default is built beside it and
     * has to disagree. The day these two agree, the fixtures have adopted the
     * rule and the pin belongs in the bin rather than standing silently. */
    const pinned = casus1Field(report);
    const appDefault = buildCandidateField({
      ...base(),
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: 2 }, undefined, polarityArmsChoiceOf('')),
    });
    expect(appDefault.field.candidates.every((c) => c.polarity !== undefined)).toBe(true);
    expect(pinned.field.candidates.every((c) => c.polarity === undefined)).toBe(true);
  });

  it('the APP states the choice on both routes, and the export carries it', () => {
    /* A source scan, for the UI-1 reason: a unit test cannot say whether the
     * app CALLS this. Both `fieldModeSettings` call sites take the choice, and
     * the block that replays a run carries it. */
    const calls = [...APP.matchAll(/fieldModeSettings\(/g)];
    expect(calls).toHaveLength(2);
    for (const m of calls) {
      const call = APP.slice(m.index!, m.index! + 260);
      expect(call).toContain('polarityArms,');
    }
    expect(APP).toContain('polarityArmsChoiceOf(engineV2Settings.polarityArms)');
    /* The run's own line says which arms it built, beside which mode. */
    expect(APP).toContain('describePolarityArmsChoice(polarityArms)');
    /* And the choice is DATED and attributed like every other stated field:
     * untouched it carries the default and no mark; touched it says who stated
     * it and when (U-3's `statedMark`). */
    expect(APP).toContain("{v2Stated('polarityArms')}");
    expect(APP).toContain("{v2Empty('polarityArms')}");
  });
});

describe('3 — the hybrid was already textbook, and nothing is built twice', () => {
  it('the lean form’s complement READS the one home and states nothing of its own', () => {
    for (const order of [2, 4] as const) {
      expect(complementSettings({ kind: 'LR', order }).inverted).toBe(textbookComplementInverted('LR', order));
    }
    /* Gain and delay are EXACT here (H-2b): the complement is built from the
     * same measurement as the branch it is summed with. */
    expect(complementSettings({ kind: 'LR', order: 4 })).toEqual({ gainDb: 0, delayMs: 0, inverted: false });
    expect(complementSettings({ kind: 'LR', order: 2 }).inverted).toBe(true);
  });

  it('the DSP block reads the same rule and never grows a second one', () => {
    const src = readFileSync(join(ROOT, 'src', 'lib', 'engine2', 'dspTarget.ts'), 'utf-8');
    /* Two readers of one function, and no local re-derivation of `(order/2) %
     * 2` anywhere beside it. */
    expect(src).toContain('textbookComplementInverted');
    expect(src).not.toContain('% 2 === 1');
    /* H-5 — the MEASURED form prints the textbook reading beside the fitted
     * one. It changes nothing: H-1 fits the active side's polarity on the
     * reversed-null margin and the cabinet settles it, and a line that showed
     * only the fit would hide a disagreement the casebook has already measured
     * (casus 1h at 362.3 Hz chose reversed under LR4). */
    expect(src).toContain('polarityAgainstTextbook');
    expect(src).toContain('DEPARTS from textbook');
  });
});

describe('4 — (a) a way that carries a series capacitor keeps one', () => {
  it('reads the series capacitors of a way through the tuner’s own bus walk', () => {
    const parts = deserializeFilter(
      readFileSync(join(ROOT, 'test-fixtures', 'casus1', (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists.HUIDIG), 'utf-8'),
    ).parts;
    const caps = seriesCapsByWay(parts);
    /* HUIDIG is a real three-way: the two ways above the woofer are
     * high-passed and carry one; the woofer does not. */
    expect((caps.get('tweeter') ?? []).length).toBeGreaterThan(0);
    expect((caps.get('mid') ?? []).length).toBeGreaterThan(0);
    expect(caps.get('woofer') ?? []).toEqual([]);
  });

  it('a removal that would strip an upper way is named; the lowest way is excluded, and that is MEASURED', () => {
    const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
    const parts = deserializeFilter(readFileSync(join(ROOT, 'test-fixtures', 'casus1', netlists.HUIDIG), 'utf-8')).parts;
    const caps = seriesCapsByWay(parts);
    const tweeterCaps = caps.get('tweeter') ?? [];
    expect(tweeterCaps.length).toBeGreaterThan(0);
    /* Open every series capacitor of the tweeter — what a prune does when it
     * lets one live on as a wire. */
    const stripped = parts.map((q) => (q.partId && tweeterCaps.includes(q.partId) ? { ...q, open: true } : q));
    expect(waysLosingSeriesCap(parts, stripped, 'woofer')).toEqual(['tweeter']);
    /* Removing nothing loses nothing. */
    expect(waysLosingSeriesCap(parts, parts, 'woofer')).toEqual([]);
    /* THE EXCLUSION, and it cost the first version of this rule a byte
     * baseline: the LOWEST way's series capacitors are CORRECTION and not
     * protection, and on the F4b2 fixture the prune legitimately takes one. So
     * a way named as lowest is never protected by this rule. */
    const midCaps = caps.get('mid') ?? [];
    const strippedMid = parts.map((q) => (q.partId && midCaps.includes(q.partId) ? { ...q, open: true } : q));
    expect(waysLosingSeriesCap(parts, strippedMid, 'mid')).toEqual([]);
    expect(waysLosingSeriesCap(parts, strippedMid, 'woofer')).toEqual(['mid']);
    /* And a null lowest way protects everything it can name rather than
     * refusing to answer. */
    expect(waysLosingSeriesCap(parts, stripped, null)).toEqual(['tweeter']);
  });

  it('BOTH removal paths ask it, and both ask it LAST', () => {
    /* A source scan, because neither path is reachable from a unit test
     * without a whole tune. Asked after the quality rules and after the gate,
     * so a removal those already refused is refused exactly as it was and the
     * evaluation count does not move (P2 — the byte baselines are what
     * enforces that, and they reproduce). */
    const src = readFileSync(join(ROOT, 'src', 'lib', 'netOptimizer.ts'), 'utf-8');
    const calls = [...src.matchAll(/waysLosingSeriesCap\(/g)];
    expect(calls).toHaveLength(2);
    for (const m of calls) expect(src.slice(m.index!, m.index! + 90)).toContain('seedLowModel');
    /* In the audit it sits after the gate veto. */
    const audit = src.slice(src.indexOf('audit removal ${e.ids.join'), src.indexOf('audit removal ${e.ids.join') + 900);
    expect(audit).toContain('waysLosingSeriesCap');
    /* In the staged prune it is the LAST clause of the one acceptance rule. */
    const acc = src.slice(src.indexOf('const acceptable ='), src.indexOf('const acceptable =') + 1200);
    expect(acc.indexOf('gateOk(')).toBeLessThan(acc.indexOf('waysLosingSeriesCap('));
    expect(SERIES_PROTECTION_VERSION).toBe('series-protection/1.0');
  });

  it('THE ENUMERATION CANNOT PRODUCE ONE WITHOUT — measured, not assumed', () => {
    /* The high-pass ladder begins at EVERY order with a series capacitor, and
     * both design steps enable the top way's high-pass unconditionally. Those
     * are the two facts the empirical measurement rests on
     * (`scripts/measure-h5-series-c.ts`: 378 upper ways on 192 frozen
     * netlists, none without one). */
    const syn = readFileSync(join(ROOT, 'src', 'lib', 'synthesis.ts'), 'utf-8');
    const hp = syn.slice(syn.indexOf('if (spec.hp.enabled) {'), syn.indexOf('if (spec.hp.enabled) {') + 1400);
    expect(hp).toContain("role: `HP section ${sec} series C`");
    /* i % 2 === 0 is the FIRST rung and it is the branch that pushes the series
     * C, so the ladder opens on the capacitor at every order. Read against the
     * ROLE string rather than the words "series C", which also appear in the
     * comment above the loop. */
    expect(hp.indexOf('i % 2 === 0')).toBeLessThan(hp.indexOf('role: `HP section ${sec} series C`'));
    expect(hp.indexOf('role: `HP section ${sec} series C`')).toBeLessThan(hp.indexOf('role: `HP section ${sec} shunt L`'));
    const three = readFileSync(join(ROOT, 'src', 'lib', 'threeWayDesign.ts'), 'utf-8');
    const tweeter = three.slice(three.indexOf('    tweeter: {'), three.indexOf('    tweeter: {') + 200);
    expect(tweeter).toContain('hp: hpLp(alignHigh, xoHigh)');
    /* And `hpLp` enables it, where `defaultHpLp` (the woofer's) does not. */
    expect(three).toContain('const hpLp = (s: Struct3Choice, freq: number) => ({\n    enabled: true,');
  });
});
