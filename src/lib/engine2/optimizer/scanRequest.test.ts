/**
 * E-3b — THE APP'S v2 SCAN DOOR, AS A TEST, FOR TWO WAYS AND FOR THREE.
 *
 * UI-1 recorded the finding this file continues: from `handleV2Request`
 * onwards nothing was covered, and the untested layer had been doing the wrong
 * thing for months. `selection.ts` closed the half that decides WHAT LOADS;
 * this closes the half one step earlier — what the run is ASSEMBLED from —
 * because E-3b gives that assembly a second caller, and an assembly with two
 * callers and no test is two implementations waiting to happen.
 *
 * Four things are checked. (1) The three-way assembly still produces exactly
 * what it produced before the extraction, measured against a REAL RECORDED
 * BROWSER RUN (`casus1_e2_verkenning_run.json`, E-2) rather than a fixture
 * written for the occasion. (2) The two-way route derives one handover from
 * casus 1b and the exploration field E-2 defines. (3) P4: a form with nothing
 * in it produces ABSENT KEYS and never zeros. (4) A two-way candidate reaches
 * the shortlist and the selection returns it — and the app loads through that
 * selection rather than through the v1 ranking, which is the UI-1 bug on the
 * new route.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  budgetSettingsFor,
  collectV2Scan,
  determinismSettingsFor,
  gateSettingsFor,
  measurementFactsFor,
  pairDerivationInputs,
  reportingPowerW,
  v2RunSettingsFor,
  type StatedV2Limits,
} from './scanRequest.ts';
import { buildShortlist, type ShortlistInput } from './shortlist.ts';
import { selectFromShortlist } from './selection.ts';
import { fieldModeSettings } from '../predesign/fieldMode.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import {
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1B_STATED_ORDER,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
} from '../casus1b.fixture.ts';
import { casus1AmplifierPeak } from '../casus1.fixture.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { TopologyDescriptor } from './diversity.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { V2CandidateResult } from './worker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDED_RUN = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'casus1_e2_verkenning_run.json');
/** E-3b — the TWO-WAY browser run: casus 1's mid and tweeter, no woofers. */
const RECORDED_2WAY = join(HERE, '..', '..', '..', '..', 'test-fixtures', 'casus1b_e3b_verkenning_run.json');

/* ================================================================== *
 * 1 — THE THREE-WAY ASSEMBLY IS UNCHANGED (the extraction's own guard)
 * ================================================================== */

describe('E-3b — the extraction changed nothing about the three-way run', () => {
  /**
   * The recorded run is a REAL browser run of casus 1 (E-2, 06-09-2026,
   * 2032 s in a headless Chrome), and its `run` block is what the app's inline
   * assembly produced that day, verbatim. Reproducing it from the same stated
   * limits is the strongest pin available on a refactor of that assembly:
   * unlike a fixture written in this session, it cannot have been shaped to
   * fit the code it is meant to guard.
   */
  const recorded = JSON.parse(readFileSync(RECORDED_RUN, 'utf8')) as {
    run: {
      gates: Record<string, unknown>;
      budgets: Record<string, unknown>;
      determinism: Record<string, unknown>;
      amplifierPowerW?: number;
      judgeBandHz: [number, number];
    };
  };

  /** The stated limits that produced the recorded gates, read back out of it. */
  const limitsOf = (): StatedV2Limits => {
    const amp = casus1AmplifierPeak();
    expect(amp).not.toBeNull();
    return {
      resistorClassW: recorded.run.gates.resistorClassW as number,
      resistorPowerMargin: recorded.run.gates.resistorPowerMargin as number,
      resistorThermalPowerW: recorded.run.gates.resistorThermalPowerW as number,
      amplifierPeakPowerW: amp!.peakPowerW,
      amplifierNominalLoadOhm: amp!.nominalLoadOhm,
      lfBumpBudgetDb: recorded.run.budgets.lfBumpBudgetDb as number,
      qesMultiplierMax: recorded.run.budgets.qesMultiplierMax as number,
      runSeed: recorded.run.determinism.seed as number,
    };
  };

  it('reproduces the recorded gate block key for key, including the derived peak voltage', () => {
    const gates = gateSettingsFor({
      limits: limitsOf(),
      driveOnFsMaxDbByModel: recorded.run.gates.maxDriveOnFsDbByDriver as Record<string, number>,
      ampMinLoadOhm: recorded.run.gates.ampMinLoadOhm as number,
    });
    // Key for key AND value for value: a key that quietly disappeared would
    // change `gateSettingsKey` and hence the run fingerprint, and nothing else
    // in the suite would notice.
    expect(Object.keys(gates).sort()).toEqual(Object.keys(recorded.run.gates).sort());
    expect(gates).toEqual(recorded.run.gates);
    // `peakInputVolts` is DERIVED and not copied — the recorded number comes
    // out of the two stated amplifier fields, so this half of the assertion is
    // a real computation and not a round trip.
    expect(gates.peakInputVolts).toBeCloseTo(recorded.run.gates.peakInputVolts as number, 12);
  });

  it('reproduces the recorded budget and determinism blocks', () => {
    expect(budgetSettingsFor(limitsOf())).toEqual(recorded.run.budgets);
    expect(determinismSettingsFor(limitsOf())).toEqual(recorded.run.determinism);
  });

  it('the reporting power is read exactly as the recorded run read it', () => {
    expect(reportingPowerW(String(recorded.run.amplifierPowerW))).toBe(recorded.run.amplifierPowerW);
  });
});

/* ================================================================== *
 * 1b — THE RECORDED TWO-WAY RUN: what the app actually sent (E-3b)
 * ================================================================== */

describe('E-3b — the recorded TWO-WAY browser run', () => {
  /**
   * The export of the browser check in casebook E-3b: casus 1's mid and
   * tweeter loaded as a two-way project, Engine v2 on, the amplifier floor
   * stated, the exploration field, five candidates through `runChainScanV2`.
   *
   * Banked for the same reason E-2 banked its three-way run: a browser check
   * that lives only in a session transcript is a check nobody can repeat.
   * `npx vite-node scripts/replay-app-run.ts test-fixtures/casus1b_e3b_verkenning_run.json --set casus1b`
   * replays it, and layer 1 says SAME.
   */
  const rec = JSON.parse(readFileSync(RECORDED_2WAY, 'utf8')) as {
    field: { windowInputs: unknown[]; candidates: { label: string }[] };
    run: { gates: Record<string, unknown>; budgets: Record<string, unknown>; determinism: Record<string, unknown> };
    shortlist: { rows: string[] } | null;
  };

  it('is a TWO-WAY run: one handover, five candidates', () => {
    // This is what `replay-app-run.ts` reads to decide which measurement set a
    // run belongs to, so it is asserted rather than assumed.
    expect(rec.field.windowInputs.length).toBe(1);
    expect(rec.field.candidates.length).toBe(5);
  });

  it('P4 survived the whole app: one stated gate, and no budget or seed invented', () => {
    /* The only limit the browser check stated was the amplifier floor, and the
     * export carries exactly that — no zeros, no defaults, no seed. An app that
     * filled a blank field with a plausible number would show it here; this is
     * the far end of the chain `v2Settings.test.ts` guards at the form. */
    expect(rec.run.gates).toEqual({ ampMinLoadOhm: 2.6 });
    expect(rec.run.budgets).toEqual({});
    expect(rec.run.determinism).toEqual({});
    // ...and the assembly reproduces that block from the same stated limit.
    expect(gateSettingsFor({ limits: {}, ampMinLoadOhm: 2.6 })).toEqual(rec.run.gates);
    expect(budgetSettingsFor({})).toEqual(rec.run.budgets);
    expect(determinismSettingsFor({})).toEqual(rec.run.determinism);
  });

  it('the shortlist the app recorded holds candidates the run produced, and nothing else', () => {
    expect(rec.shortlist).not.toBeNull();
    const labels = new Set(rec.field.candidates.map((c) => c.label));
    for (const row of rec.shortlist!.rows) expect(labels.has(row)).toBe(true);
  });
});

/* ================================================================== *
 * 2 — TWO WAYS: casus 1b derives ONE handover, and the exploration field
 * ================================================================== */

describe('E-3b — the two-way route derives its own field', () => {
  const manifest = casus1bManifest();
  const files = casus1bFiles(manifest);
  const report = casus1bReport(null, manifest, files);

  it('a two-way project has exactly one window input, and it is the handover', () => {
    const wis = report.predesign.windowInputs;
    // The report loop is `i + 1 < order.length` — N handovers for N + 1 ways —
    // so a two-way project yields one. That is the whole of what made the
    // three-way door reusable, and it is asserted rather than assumed.
    expect(wis.length).toBe(1);
    expect(wis[0].lower).toBe('mid');
    expect(wis[0].upper).toBe('tweeter');
  });

  it('the per-pair derivation inputs read the stated order and the upper way\'s own M-C figure', () => {
    const wis = report.predesign.windowInputs;
    const perPair = pairDerivationInputs({
      windowInputs: wis,
      statedDriveLimitDbByDriverId: CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
      curveOfDriverId: () => null,
    });
    expect(perPair.length).toBe(1);
    expect(perPair[0].statedOrder).toBe(CASUS1B_STATED_ORDER);
    // V50 — the UPPER way's own figure, not the single field: casus 1b states
    // one for the tweeter and none for the mid.
    expect(perPair[0].maxDriveOnFsDb).toBe(CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER['tweeter']);
    // With one pair there is no "low" handover, so the single-pair slope
    // fields are the ones read — the mid/tweeter pair, never `low.lower`.
    expect(perPair[0].lowerTargetSlopeDbPerOct).toBeNull();
    expect(perPair[0].upperTargetSlopeDbPerOct).toBeNull();
  });

  it('the upper way\'s own figure beats the single stated field, and the field is the fallback', () => {
    const wis = report.predesign.windowInputs;
    const withPerWay = pairDerivationInputs({
      windowInputs: wis,
      statedDriveLimitDbByDriverId: { tweeter: -18 },
      fallbackDriveLimitDb: -30,
      curveOfDriverId: () => null,
    });
    expect(withPerWay[0].maxDriveOnFsDb).toBe(-18);
    const fallbackOnly = pairDerivationInputs({
      windowInputs: wis,
      fallbackDriveLimitDb: -30,
      curveOfDriverId: () => null,
    });
    expect(fallbackOnly[0].maxDriveOnFsDb).toBe(-30);
    // P4 — nothing stated anywhere arms nothing.
    const nothing = pairDerivationInputs({ windowInputs: wis, curveOfDriverId: () => null });
    expect(nothing[0].maxDriveOnFsDb).toBeNull();
  });

  it('the EXPLORATION field on one pair is the window centre and its neighbours, inside the budget', () => {
    const wis = report.predesign.windowInputs;
    const explore = buildCandidateField({
      windowInputs: wis,
      perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
      alignments: CASUS1B_FIELD_ALIGNMENTS,
      ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: wis.length }),
    });
    const cands = explore.field.candidates;
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.length).toBeLessThanOrEqual(explore.field.parameters.chainBudget!);
    // One handover means one crossing per candidate — the shape the two-way
    // chain input and `orderByModel` are built from.
    for (const c of cands) expect(c.crossings.length).toBe(1);
    /* Every position sits inside the DERIVED window, which is what makes the
     * pre-start estimate report zero outside on this route (F4d). The window
     * is the axis's own, so this is a claim about the generator and not a
     * restatement of its input. */
    const axis = explore.field.axes[0];
    const win = Object.values(axis.window)[0];
    expect(win.floorHz).not.toBeNull();
    expect(win.ceilingHz).not.toBeNull();
    for (const c of cands) {
      expect(c.crossings[0].hz).toBeGreaterThanOrEqual(win.floorHz!);
      expect(c.crossings[0].hz).toBeLessThanOrEqual(win.ceilingHz!);
    }
    /* CENTRE-FIRST: the geometric centre of the window is one of the
     * positions — the reference crossing the order derivation reads its
     * demands at. That is the policy's whole content, and a spread field
     * would not contain it. */
    const centre = Math.sqrt(win.floorHz! * win.ceilingHz!);
    expect(cands.some((c) => Math.abs(c.crossings[0].hz - centre) < 0.5)).toBe(true);
    // The exploration's own policies travel in the parameters, so an
    // exploration and a full field over the same window never stamp alike.
    expect(explore.field.parameters.positionPolicy).toBe('centre-first');
    expect(explore.field.parameters.alignmentPolicy).toBe('one');
  });

  it('the FULL field over the same window is at least as large, with no policy at all', () => {
    const wis = report.predesign.windowInputs;
    const of = (mode: 'exploration' | 'full') =>
      buildCandidateField({
        windowInputs: wis,
        perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
        alignments: CASUS1B_FIELD_ALIGNMENTS,
        ...fieldModeSettings(mode, { stepsPerAxis: 6, pairs: wis.length }),
      });
    const full = of('full');
    expect(full.field.candidates.length).toBeGreaterThanOrEqual(of('exploration').field.candidates.length);
    // E-2: the full mode passes NO policy — absent is the field it always was.
    expect(full.field.parameters.positionPolicy).toBeUndefined();
    expect(full.field.parameters.alignmentPolicy).toBeUndefined();
  });

  it('the measured facts walk the roles the project has, and skip a role without a driver id', () => {
    const facts = measurementFactsFor({
      report,
      roles: ['low', 'high'] as const,
      driverIdOf: (r) => (r === 'low' ? 'mid' : 'tweeter'),
      // On a two-way the LOW role is the model `mid` — what `v2ChainOne` keys
      // its `driverZ` by (`canonicalModelForRole`).
      modelOf: (r) => (r === 'low' ? 'mid' : 'tweeter'),
      sweepOf: () => null,
    });
    expect(Object.keys(facts.reOhmByModel ?? {}).sort()).toEqual(['mid', 'tweeter']);
    // A role the project does not have contributes nothing rather than an
    // empty entry: the worker's own fallback stays in force and says so.
    const partial = measurementFactsFor({
      report,
      roles: ['low', 'mid', 'high'] as const,
      driverIdOf: (r) => (r === 'low' ? 'mid' : r === 'high' ? 'tweeter' : undefined),
      modelOf: (r) => (r === 'low' ? 'mid' : r === 'mid' ? 'mid' : 'tweeter'),
      sweepOf: () => null,
    });
    expect(Object.keys(partial.reOhmByModel ?? {}).sort()).toEqual(['mid', 'tweeter']);
  });
});

/* ================================================================== *
 * 3 — P4: AN EMPTY FORM STATES NOTHING
 * ================================================================== */

describe('E-3b — empty is absent, on the two-way route as on the three-way one', () => {
  it('nothing stated produces no gate key at all — not a zero, not a default', () => {
    const gates = gateSettingsFor({ limits: {}, ampMinLoadOhm: null });
    expect(gates).toEqual({});
    expect(budgetSettingsFor({})).toEqual({});
    expect(determinismSettingsFor({})).toEqual({});
  });

  it('a peak voltage needs BOTH amplifier fields, and a zero in either states nothing', () => {
    expect(gateSettingsFor({ limits: { amplifierPeakPowerW: 160 }, ampMinLoadOhm: null })).toEqual({});
    expect(gateSettingsFor({ limits: { amplifierNominalLoadOhm: 8 }, ampMinLoadOhm: null })).toEqual({});
    expect(
      gateSettingsFor({ limits: { amplifierPeakPowerW: 0, amplifierNominalLoadOhm: 8 }, ampMinLoadOhm: null }),
    ).toEqual({});
    const both = gateSettingsFor({
      limits: { amplifierPeakPowerW: 160, amplifierNominalLoadOhm: 8 },
      ampMinLoadOhm: null,
    });
    expect(both.peakInputVolts).toBeCloseTo(Math.sqrt(2 * 160 * 8), 12);
  });

  it('an empty per-way M-C map arms no per-way key', () => {
    expect(gateSettingsFor({ limits: {}, driveOnFsMaxDbByModel: {}, ampMinLoadOhm: null })).toEqual({});
  });

  it('the reporting power refuses blank, zero and nonsense, and takes a number', () => {
    // F0 — no watts at all rather than watts at an invented default.
    for (const raw of ['', '   ', '0', '-5', 'abc', null, undefined]) {
      expect(reportingPowerW(raw as string)).toBeUndefined();
    }
    expect(reportingPowerW('100')).toBe(100);
    expect(reportingPowerW(100)).toBe(100);
  });

  it('an empty form still carries the voicing and the judged band — those are not limits', () => {
    const v2 = v2RunSettingsFor({
      limits: {},
      ampMinLoadOhm: null,
      facts: {},
      targetCurve: CASUS1B_TARGET_CURVE,
      judgeBandHz: CASUS1B_V2_BAND_HZ,
    });
    expect(v2.gates).toEqual({});
    expect(v2.budgets).toEqual({});
    expect(v2.determinism).toEqual({});
    expect(v2.targetCurve).toBe(CASUS1B_TARGET_CURVE);
    expect(v2.judgeBandHz).toEqual(CASUS1B_V2_BAND_HZ);
    // V36 — reporting only, and absent when the designer stated no power.
    expect('amplifierPowerW' in v2).toBe(false);
  });
});

/* ================================================================== *
 * 4 — A TWO-WAY CANDIDATE REACHES THE SHORTLIST, AND THE SELECTION LOADS IT
 * ================================================================== */

/** The two-way chain result shape the shortlist and the loader care about. */
interface TwoWayish {
  label: string;
  parts: readonly VxpPart[];
  disqualified?: readonly string[];
  /** `applyScanCandidate` dispatches on this key — a two-way result has it. */
  vf: { specs: Record<string, unknown>; inverted: boolean };
}

const cap = (id: string, uF: number): VxpPart => ({
  type: 'Capacitor',
  partId: id,
  params: [{ name: 'C', value: uF, unit: 'uF' }],
  wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
});

const measurements = (rms: number): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: 1,
    windowMaxAtHz: 1000,
    windowMinAtHz: 2000,
    rmsDeviationDb: rms,
    narrowPeaks: [],
    bandHz: [200, 8000],
    coverage: {
      intendedHz: [200, 8000],
      evaluatedHz: [200, 8000],
      fraction: 1,
      flagged: false,
      limitedBy: { low: 'fixture', high: 'fixture' },
      describe: 'full',
    },
    smoothingOctaves: 1 / 6,
    notes: [],
  },
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: 3 }],
});

/** A two-way topology: ONE handover, so one LP flank and one HP flank. */
const topo = (order: number): TopologyDescriptor => ({
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order },
    { way: 'high', side: 'hp', kind: 'LR', order },
  ],
  inverted: [],
});

/** The V31 shape as the worker actually hands it over. */
const refusal = (kinds: string[], reason: string): V2CandidateResult<TwoWayish>['rejection'] => ({
  kinds,
  reason,
  rejectedTune: {
    minZOhm: null,
    windowPlusMinusDb: null,
    rmsDeviationDb: null,
    rippleDb: null,
    phaseDeg: null,
    driveOnFsDb: null,
  },
  note: reason,
});

const candidate = (
  label: string,
  order: number,
  rms: number,
  rejection: V2CandidateResult<TwoWayish>['rejection'] = null,
): V2CandidateResult<TwoWayish> =>
  ({
    result: {
      label,
      parts: rejection ? [] : [cap(`C-${label}`, order * 3.3)],
      disqualified: [],
      vf: { specs: {}, inverted: false },
    },
    gates: [],
    gatesDerived: [],
    violation: null,
    bounds: [],
    gateRefusals: [],
    measurements: measurements(rms),
    topology: topo(order),
    dissipation: null,
    rejection,
    levelWork: {} as V2CandidateResult<TwoWayish>['levelWork'],
    coilDcr: null,
    notes: ['the measurement set has no near field for the low way', 'the measurement set has no near field for the low way'],
  }) as V2CandidateResult<TwoWayish>;

describe('E-3b — a two-way candidate reaches the shortlist and the selection loads it', () => {
  it('the fold produces one shortlist row per candidate, one gate entry, and de-duplicated notes', () => {
    const collected = collectV2Scan([candidate('a', 2, 0.5), candidate('b', 4, 0.9)]);
    expect(collected.field.map((f) => f.label)).toEqual(['a', 'b']);
    expect(Object.keys(collected.gatesByLabel).sort()).toEqual(['a', 'b']);
    // Four copies of one sentence across two candidates become one line: they
    // describe the MEASUREMENT SET, not the design (F4b).
    expect(collected.notes).toEqual(['the measurement set has no near field for the low way']);
  });

  it('a refused two-way candidate keeps its place in the field and carries no network', () => {
    const collected = collectV2Scan([
      candidate('good', 2, 0.5),
      candidate('refused', 4, 0.1, refusal(['gate'], 'M-C on the tweeter')),
    ]);
    // V31 — it is IN the field (the shortlist is what lists it as a refusal)
    // and it has no parts.
    expect(collected.field.length).toBe(2);
    const bad = collected.field.find((f) => f.label === 'refused')!;
    expect(bad.parts).toEqual([]);
    expect(bad.rejection?.kinds).toEqual(['gate']);
  });

  it('the selection loads the two-way design and never the refused one, even when it scores best', () => {
    const collected = collectV2Scan([
      candidate('good', 2, 0.5),
      // The refused candidate carries the BEST rms of the field: the v1
      // ranking would crown it, and its part list is empty. That is the UI-1
      // bug, now possible on the two-way route too.
      candidate('refused', 4, 0.01, refusal(['gate'], 'M-C on the tweeter')),
    ]);
    const shortlist = buildShortlist(collected.field as ShortlistInput<TwoWayish>[], 'fp-2way', {
      requirements: {},
    });
    const sel = selectFromShortlist(shortlist);
    expect(sel.kind).toBe('design');
    if (sel.kind !== 'design') throw new Error('unreachable');
    expect(sel.label).toBe('good');
    // ...and what it hands back is a TWO-WAY result, which is what
    // `applyScanCandidate` dispatches on (`'vf' in r`).
    expect('vf' in sel.result).toBe(true);
    expect(sel.result.parts.length).toBeGreaterThan(0);
  });

  it('a field in which everything was refused loads NOTHING and says why', () => {
    const collected = collectV2Scan([
      candidate('r1', 2, 0.4, refusal(['gate'], 'M-C on the tweeter')),
      candidate('r2', 4, 0.3, refusal(['topology'], 'level work on the lowest way')),
    ]);
    const shortlist = buildShortlist(collected.field as ShortlistInput<TwoWayish>[], 'fp-2way', {
      requirements: {},
    });
    const sel = selectFromShortlist(shortlist);
    expect(sel.kind).not.toBe('design');
    expect(sel.describe.length).toBeGreaterThan(0);
  });
});
