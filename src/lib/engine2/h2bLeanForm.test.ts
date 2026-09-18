/**
 * H-2b — THE LEAN FORM OF HYBRID MODE: two measured ways are enough.
 *
 * WHAT IS CLAIMED, in the order the engine meets it:
 *
 *   1. THE COMPLEMENT is a hand calculation: for a Linkwitz-Riley alignment
 *      `HP + LP` at the textbook polarity is an all-pass of unit magnitude at
 *      every frequency, and at the WRONG polarity it is a null at the corner.
 *      That is what lets the passive way's own measurement times the mirror
 *      low-pass stand in for an unmeasured active side: the complemented sum
 *      is flat exactly where the realised flank is the target flank.
 *   2. THE TARGET-FLANK ERROR is a hand calculation: a flank that IS the
 *      target reads zero; a flank two dB under it reads zero rms and −2 dB of
 *      level; a flank of the wrong ORDER reads a shape error. Null outside the
 *      band, never zero (F0).
 *   3. THE GEOMETRIC DELAY START is a sign convention with a hand value.
 *   4. THE DESIGN-STEP CONDITION, through the real route (`handleV2Request`,
 *      `v2ChainOne`): a stated handover marked UNMEASURED delivers the
 *      high-pass with no active measurement supplied; the same statement
 *      WITHOUT the mark still throws (the H-1 condition intact); no statement
 *      at all is what it was (P2: response judged, no flank column).
 *   5. THE REPORT in the lean form models nothing, judges the flank, and says
 *      in its own words that its sums are the passive network alone.
 *   6. THE DSP BLOCK in the lean form leads with what it cannot say; in both
 *      forms the stated processor latency is subtracted and named apart; and
 *      the H-1 block is byte-identical in everything the latency does not touch.
 *   7. THE SHORTLIST sorts a lean-form run on the flank error, and only there.
 *
 * H-1's goldens (`goldenCasus1h.test.ts`, `h1ActiveSide.test.ts`) are the
 * measured form's own acceptance and are not repeated here; claim 6 reads the
 * same casus so a change that moved them would show in two places.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from '../dsp.ts';
import { fromPolar } from '../complex.ts';
import { parseFrd } from '../parsers/frd.ts';
import { parseZma } from '../parsers/zma.ts';
import { defaultEq, defaultHpLp, evalHpLp } from '../filters.ts';
import {
  activeHighPass,
  complementSettings,
  flankErrorDb,
  geometryDelayStartMs,
  handoverBandHz,
  modelBranchTransfer,
  textbookComplementInverted,
  type ActiveHandover,
} from '../activeSide.ts';
import type { ChainInput, ChainResult } from '../designChain.ts';
import { buildReport } from './report.ts';
import { ACTIVE_SIDE_NOT_JUDGED, describeDspTarget, dspTargetBlock } from './dspTarget.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './optimizer/candidateDeclaration.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './optimizer/worker.ts';
import { buildShortlist, type ShortlistInput } from './optimizer/shortlist.ts';
import type { TopologyDescriptor } from './optimizer/diversity.ts';
import type { CandidateMeasurements } from './requirements/requirements.ts';
import {
  CASUS1B_REPORT_SETTINGS,
  casus1bFiles,
  casus1bFilter,
  casus1bGeometry,
  casus1bManifest,
  loadGolden1b,
} from './casus1b.fixture.ts';
import {
  CASUS1H_ACTIVE,
  casus1hFiles,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from './casus1h.fixture.ts';

/* ==================================================================== *
 * 1 — the complement, by hand
 * ==================================================================== */

describe('H-2b — the complement of an unmeasured active side is the textbook all-pass', () => {
  const grid = logspace(50, 20000, 400);
  const sumMag = (kind: 'LR', order: 2 | 4, hz: number, inverted: boolean) =>
    grid.map((f) => {
      const hp = evalHpLp({ enabled: true, kind, order, freq: hz }, 'hp', f);
      const lp = modelBranchTransfer({ kind, order, hz, gainDb: 0, delayMs: 0, inverted }, [f])[0];
      return Math.hypot(hp.re + lp.re, hp.im + lp.im);
    });

  it('LR4 sums to unity with NORMAL polarity, LR2 with REVERSED — and each is a null at the corner the other way', () => {
    expect(textbookComplementInverted('LR', 4)).toBe(false);
    expect(textbookComplementInverted('LR', 2)).toBe(true);
    for (const [order, inv] of [[4, false], [2, true]] as const) {
      const right = sumMag('LR', order, 1000, inv);
      for (const m of right) expect(m).toBeCloseTo(1, 9);
      /* The tegenproef: the other polarity is not an all-pass, and at the
       * corner it is a NULL — the 2·cos(m·90°) of the module's own comment. */
      const wrong = sumMag('LR', order, 1000, !inv);
      const atCorner = wrong[grid.findIndex((f) => f >= 1000)];
      expect(atCorner).toBeLessThan(0.05);
      expect(Math.max(...wrong)).toBeGreaterThan(0.9);
    }
  });

  it('the complement settings carry no gain, no delay and the textbook polarity — exact, not defaults', () => {
    expect(complementSettings({ kind: 'LR', order: 4 })).toEqual({ gainDb: 0, delayMs: 0, inverted: false });
    expect(complementSettings({ kind: 'LR', order: 2 })).toEqual({ gainDb: 0, delayMs: 0, inverted: true });
  });
});

/* ==================================================================== *
 * 2 — the target-flank error, by hand
 * ==================================================================== */

describe('H-2b — the target-flank error', () => {
  const grid = logspace(100, 4000, 240);
  const flat: GriddedResponse = { freq: [...grid], spl: grid.map(() => 90), phaseDeg: grid.map(() => 0) };
  const h = { hz: 400, kind: 'LR' as const, order: 4 as const };
  const shaped = (order: 2 | 4, offsetDb = 0): GriddedResponse => ({
    freq: [...grid],
    spl: grid.map((f) => {
      const t = evalHpLp({ enabled: true, kind: 'LR', order, freq: 400 }, 'hp', f);
      return 90 + 20 * Math.log10(Math.hypot(t.re, t.im)) + offsetDb;
    }),
    phaseDeg: grid.map(() => 0),
  });

  it('a realised flank that IS the target reads zero, over exactly the handover band', () => {
    const e = flankErrorDb(shaped(4), flat, h)!;
    expect(e.rmsDb).toBeCloseTo(0, 9);
    expect(e.maxAbsDb).toBeCloseTo(0, 9);
    expect(e.levelDb).toBeCloseTo(0, 9);
    expect(e.bandHz).toEqual(handoverBandHz(400));
    expect(e.points).toBe(grid.filter((f) => f >= e.bandHz[0] && f <= e.bandHz[1]).length);
    expect(e.points).toBeGreaterThan(10);
  });

  it('a flank two dB under the target is a LEVEL offset and no shape error — the DSP gain absorbs it', () => {
    const e = flankErrorDb(shaped(4, -2), flat, h)!;
    expect(e.levelDb).toBeCloseTo(-2, 9);
    expect(e.rmsDb).toBeCloseTo(0, 9);
  });

  it('a flank of the wrong ORDER is a shape error the gain cannot absorb', () => {
    const e = flankErrorDb(shaped(2), flat, h)!;
    expect(e.rmsDb).toBeGreaterThan(0.5);
    expect(e.maxAbsDb).toBeGreaterThan(e.rmsDb);
  });

  it('null when the band holds no point or the grids differ — never zero (F0)', () => {
    const above = logspace(2000, 4000, 50);
    const g: GriddedResponse = { freq: [...above], spl: above.map(() => 90), phaseDeg: above.map(() => 0) };
    expect(flankErrorDb(g, g, h)).toBeNull();
    expect(flankErrorDb(shaped(4), g, h)).toBeNull();
    /* …and the target uses the stated high-pass and nothing else. */
    expect(activeHighPass(h)).toEqual({ enabled: true, kind: 'LR', order: 4, freq: 400 });
  });
});

/* ==================================================================== *
 * 3 — the geometric delay start
 * ==================================================================== */

describe('H-2b — the delay start value from the entered depths', () => {
  it('an active way 100 mm DEEPER than the passive way needs 100/343 ms LESS delay: negative, as H-1 measured', () => {
    expect(geometryDelayStartMs({ activeMm: 100, passiveMm: 0 })).toBeCloseTo(-100 / 343, 9);
    expect(geometryDelayStartMs({ activeMm: 0, passiveMm: 100 })).toBeCloseTo(100 / 343, 9);
    expect(geometryDelayStartMs({ activeMm: 30, passiveMm: 30 })).toBe(0);
  });
  it('null when either depth is not entered (P4)', () => {
    expect(geometryDelayStartMs({ activeMm: undefined, passiveMm: 0 })).toBeNull();
    expect(geometryDelayStartMs({ activeMm: 0, passiveMm: null })).toBeNull();
    expect(geometryDelayStartMs({ activeMm: NaN, passiveMm: 0 })).toBeNull();
  });
});

/* ==================================================================== *
 * 4 — the design-step condition, through the real route
 * ==================================================================== */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'parsers', 'fixtures');
const GRID = logspace(210, 19000, 64);
const load = (n: string) => readFileSync(join(FIXTURES, n), 'utf-8');
const gFrd = (raw: string): GriddedResponse => {
  const f = parseFrd(raw);
  return resample(f.freq, f.spl, f.phase, GRID);
};
const gZ = (raw: string) => {
  const z = parseZma(raw);
  const g = resample(z.freq, z.magnitude, z.phase, GRID, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const LEAN_HANDOVER: ActiveHandover = {
  activeWay: 'active (unmeasured)',
  passiveWay: 'mid',
  hz: 800,
  kind: 'LR',
  order: 4,
  statedBy: 'this test',
  unmeasured: true,
};
const BAND: [number, number] = [250, 18000];
const SETTINGS = {
  phasePriority: 0.5,
  eqBandsPerDriver: 2,
  synthMode: 'filter' as const,
  band: BAND,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  powerMetric: 'smooth' as const,
  catalogSnap: false,
  cutOnly: true,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
};
const seed = () => ({
  woofer: {
    gainDb: 0,
    hp: defaultHpLp(200),
    lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
    eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
  },
  tweeter: {
    gainDb: 0,
    hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
    lp: defaultHpLp(20000),
    eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
  },
});
function twoWayInput(active?: ActiveHandover): ChainInput {
  const activeSide = active ? { handover: active, settings: complementSettings(active) } : undefined;
  /* The lean form's band starts at the bottom of the handover band — the
   * app's own rule (`leanBandFor`), applied here by hand. */
  const band: [number, number] = active?.unmeasured ? [Math.max(BAND[0], handoverBandHz(active.hz)[0]), BAND[1]] : BAND;
  return {
    grid: [...GRID],
    w: gFrd(load('mid_hor0_mettape.txt')),
    t: gFrd(load('tweet_hor0_mettape.txt')),
    driverZ: { mid: gZ(load('mid_Backwavecone_sheep75gram.ZMA')), tweeter: gZ(load('tweeter.ZMA')) },
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: seed(),
    settings: { ...SETTINGS, band, structurePreference: { kind: 'LR', order: 4 }, ...(activeSide ? { activeSide } : {}) },
    xoRange: [1600, 2600],
  };
}
function through(active?: ActiveHandover): { result: ChainResult; measurements: CandidateMeasurements } {
  const activeSide = active ? { handover: active, settings: complementSettings(active) } : undefined;
  const payload: V2ChainOnePayload = {
    input: twoWayInput(active),
    label: 'lean',
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: declareCandidateChoices({
        cages: [[1600, 2600]],
        windowFloorsHz: [1000],
        multiWay: true,
        stated: {
          band: twoWayInput(active).settings.band,
          staged: SETTINGS.targets,
          ampTarget: SETTINGS.ampTarget,
          powerMetric: SETTINGS.powerMetric,
          phaseMetric: SETTINGS.phaseMetric,
          catalogSnap: SETTINGS.catalogSnap,
          breakupGuard: SETTINGS.breakupGuard,
          zFloorStrict: true,
        },
      }),
      chainDeclaration: declareCandidateChainChoices({ stated: {}, ...(activeSide ? { activeSide } : {}) }),
      provenance: 'this test',
      orderByModel: { tweeter: 4 },
    },
  };
  const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
  let out: { result: ChainResult; measurements: CandidateMeasurements } | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as { result: ChainResult; measurements: CandidateMeasurements };
  });
  if (!out) throw new Error('the v2 route returned nothing');
  return out;
}

describe('H-2b — the lean form delivers through the real route', () => {
  it('a handover marked UNMEASURED delivers the stated high-pass with NO active measurement, judges the flank and no sum', () => {
    const { result, measurements } = through(LEAN_HANDOVER);
    /* THE DESIGN STEP carries the stated shape at the stated corner — the
     * H-1 step-0 defect, now on the lean form. */
    expect(result.vf.specs.woofer.hp.enabled).toBe(true);
    expect(result.vf.specs.woofer.hp.kind).toBe('LR');
    expect(result.vf.specs.woofer.hp.order).toBe(4);
    expect(result.vf.specs.woofer.hp.freq).toBeCloseTo(800, 9);
    expect(result.parts.length).toBeGreaterThan(0);
    /* THE JUDGEMENT: no sum (F0 — reported as not judged by the app), the
     * flank error present and finite, the passive pair's phase still measured. */
    expect(measurements.response).toBeNull();
    expect(measurements.flankError).not.toBeUndefined();
    expect(measurements.flankError).not.toBeNull();
    expect(Number.isFinite(measurements.flankError!.rmsDb)).toBe(true);
    expect(measurements.flankError!.bandHz).toEqual(handoverBandHz(800));
    expect(measurements.phaseTracking.length).toBeGreaterThan(0);
  }, 300_000);

  it('the same statement WITHOUT the mark still throws — the H-1 condition is intact', () => {
    const { unmeasured: _u, ...measuredForm } = LEAN_HANDOVER;
    void _u;
    expect(() => through(measuredForm)).toThrow(/no measured response was supplied/);
  });

  it('no statement at all is what it was: the sum judged, no flank column (P2)', () => {
    const { result, measurements } = through(undefined);
    expect(result.vf.specs.woofer.hp.enabled).toBe(false);
    expect(measurements.response).not.toBeNull();
    expect(measurements.flankError).toBeUndefined();
  }, 300_000);
});

/* ==================================================================== *
 * 5 — the report in the lean form
 * ==================================================================== */

const G1B = loadGolden1b();
const manifest1b = casus1bManifest(G1B);
const files1b = casus1bFiles(manifest1b);
const LEAN_1B: ActiveHandover = { activeWay: 'active (unmeasured)', passiveWay: 'mid', hz: 400, kind: 'LR', order: 4, statedBy: 'this test', unmeasured: true };
const report1b = (active: ActiveHandover | null, depthMm?: Record<string, number>) =>
  buildReport({
    manifest: manifest1b,
    files: files1b,
    filter: casus1bFilter('HUIDIG_MT', manifest1b, files1b, G1B),
    geometry: { ...casus1bGeometry(G1B), ...(depthMm ? { depthMm } : {}) },
    settings: { ...CASUS1B_REPORT_SETTINGS, ...(active ? { activeHandover: active } : {}) },
  });

describe('H-2b — the report in the lean form', () => {
  it('models nothing: the sum is the passive network alone, byte for byte, and no branch stands under the active name', () => {
    const lean = report1b(LEAN_1B);
    const bare = report1b(null);
    expect(lean.activeSide!.form).toBe('unmeasured');
    expect(lean.activeSide!.settings).toBeNull();
    expect(lean.activeSide!.off).toEqual([]);
    expect(lean.system.sumDb).toEqual(bare.system.sumDb);
    expect(lean.driversLowToHigh).toEqual(bare.driversLowToHigh);
    expect(lean.driversLowToHigh).not.toContain('active (unmeasured)');
  });

  it('judges the flank of the lowest passive way on the loaded netlist, over the handover band', () => {
    const e = report1b(LEAN_1B).activeSide!.flankError!;
    expect(e).not.toBeNull();
    expect(Number.isFinite(e.rmsDb)).toBe(true);
    expect(e.bandHz).toEqual(handoverBandHz(400));
    expect(e.points).toBeGreaterThan(10);
  });

  it('says in its own words that its sums are not a judgement, and never that it could not model (that is not a defect)', () => {
    const p = report1b(LEAN_1B).problems;
    expect(p.some((x) => /^Hybrid mode, lean form/.test(x) && /NOT a judgement/.test(x))).toBe(true);
    expect(p.some((x) => /could not be modelled/.test(x))).toBe(false);
  });

  it('the delay start value is null without depths and geometry with them — both forms read the same field', () => {
    const none = report1b(LEAN_1B).activeSide!;
    expect(none.delayStartMs).toBeNull();
    expect(none.delayStartSource).toMatch(/not entered/);
    const some = report1b(LEAN_1B, { mid: 0, 'active (unmeasured)': 100 }).activeSide!;
    expect(some.delayStartMs).toBeCloseTo(-100 / 343, 9);
    expect(some.delayStartSource).toMatch(/pure geometry/);
  });
});

/* ==================================================================== *
 * 6 — the DSP block: the lean form, and the latency in both forms
 * ==================================================================== */

describe('H-2b — the DSP target block', () => {
  it('in the lean form leads with what it cannot say: gain NOT JUDGED, polarity textbook, delay a start value or none', () => {
    const b = dspTargetBlock(report1b(LEAN_1B))!;
    expect(b.form).toBe('unmeasured');
    expect(b.dial.gainDb).toBeNull();
    expect(b.dial.inverted).toBe(false);
    expect(b.dial.delayMs).toBeNull();
    expect(b.flankError).not.toBeNull();
    const lines = describeDspTarget(b);
    expect(lines[0]).toMatch(/LEAN FORM/);
    expect(lines[2]).toContain(ACTIVE_SIDE_NOT_JUDGED);
    expect(lines[3]).toMatch(/no start value/);
    expect(lines[4]).toMatch(/textbook for LR4: normal/);
    const text = lines.join('\n');
    expect(text).toMatch(/DEEPEST NULL/);
    expect(text).toMatch(/No processor latency is stated/);
    expect(text).toMatch(/target|flank of mid/);
  });

  it('in the lean form with depths and a stated latency, the start value has the latency SUBTRACTED and named apart', () => {
    const b = dspTargetBlock(report1b(LEAN_1B, { mid: 0, 'active (unmeasured)': 100 }), { processorLatencyMs: 0.35 })!;
    expect(b.delayStart!.ms).toBeCloseTo(-100 / 343, 9);
    expect(b.processorLatencyMs).toBe(0.35);
    expect(b.dial.delayMs).toBeCloseTo(-100 / 343 - 0.35, 9);
    const lines = describeDspTarget(b);
    expect(lines[3]).toMatch(/start value/);
    expect(lines[3]).toMatch(/processor latency 0\.350 ms subtracted/);
    expect(lines[3]).toMatch(/measured in the cabinet/);
    expect(lines.join('\n')).toMatch(/SUBTRACTED from the delay to dial in/);
  });

  it('in the MEASURED form (casus 1h) the latency comes off the re-fitted delay, and nothing else in the block moves', () => {
    const golden = loadGolden1h();
    const manifest = casus1hManifest();
    const files = casus1hFiles(manifest);
    const key = Object.keys(golden.manifest_en_geometrie.netlists).find((k) => /^H_KAND_\d+$/.test(k))!;
    const hz = CASUS1H_ACTIVE.positionsHz[0];
    const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
    expect(rep.activeSide!.form).toBe('measured');
    const plain = dspTargetBlock(rep)!;
    const withLatency = dspTargetBlock(rep, { processorLatencyMs: 0.35 })!;
    expect(plain.dial.delayMs).toBeCloseTo(plain.deliveredRefit!.delayMs, 12);
    expect(withLatency.dial.delayMs).toBeCloseTo(plain.deliveredRefit!.delayMs - 0.35, 12);
    /* Everything the latency does not touch is the same object value. */
    expect(withLatency.judged).toEqual(plain.judged);
    expect(withLatency.deliveredRefit).toEqual(plain.deliveredRefit);
    expect(withLatency.polarity).toEqual(plain.polarity);
    expect(withLatency.dial.gainDb).toBe(plain.dial.gainDb);
    const head = describeDspTarget(withLatency).slice(0, 6).join('\n');
    expect(head).toContain((plain.deliveredRefit!.delayMs - 0.35).toFixed(3));
    expect(head).toMatch(/processor latency 0\.350 ms subtracted/);
    expect(describeDspTarget(plain).join('\n')).toMatch(/No processor latency is stated/);
    /* Casus 1h enters no depths, and the block says so beside the fit (P4). */
    expect(plain.delayStart).toBeNull();
    expect(describeDspTarget(plain).join('\n')).toMatch(/No geometric start value beside the fit/);
  });
});

/* ==================================================================== *
 * 7 — the shortlist sorts a lean-form run on the flank, and only there
 * ==================================================================== */

describe('H-2b — the shortlist and the flank error', () => {
  const topo: TopologyDescriptor = {
    flanks: [
      { way: 'low', side: 'lp', kind: 'LR', order: 4 },
      { way: 'high', side: 'hp', kind: 'LR', order: 4 },
    ],
    inverted: [],
  };
  const lean = (label: string, rms: number): ShortlistInput<string> => ({
    label,
    parts: [{ id: label, type: 'capacitor', partId: null, params: [{ name: 'C', value: 1e-6 }], wires: [] } as never],
    result: label,
    topology: topo,
    measurements: {
      response: null,
      phaseTracking: [{ subject: 'low|high', meanAbsDeg: 5 }],
      flankError: { rmsDb: rms, maxAbsDb: rms * 2, levelDb: -2, bandHz: [283, 566], points: 20 },
    },
    gates: [],
  });

  it('with no judged sum the rows are ordered on the flank error, lowest first', () => {
    const s = buildShortlist([lean('worse', 1.4), lean('best', 0.2), lean('mid', 0.7)], 'run', { size: 3 });
    expect(s.rows.map((r) => r.label)).toEqual(['best', 'mid', 'worse']);
    expect(s.rows[0].measurements.flankError!.rmsDb).toBe(0.2);
  });

  it('where a judged sum exists it decides the sort, and the flank error is never read (P2)', () => {
    /* Two rows that BOTH carry a response: the RMS orders them, and a flank
     * error that would reverse that order is not consulted. Without this
     * claim the fallback could be read as "the lower of the two", which on a
     * measured-form run would let a flank reading outrank the judged sum. */
    const judged = (label: string, rms: number, flank: number): ShortlistInput<string> => ({
      ...lean(label, flank),
      measurements: {
        response: {
          windowPlusMinusDb: 0.5,
          windowMaxAtHz: 1000,
          windowMinAtHz: 2000,
          rmsDeviationDb: rms,
          narrowPeaks: [],
          bandHz: [200, 8000],
          coverage: { intendedHz: [200, 8000], evaluatedHz: [200, 8000], fraction: 1, flagged: false, limitedBy: { low: 'fixture', high: 'fixture' }, describe: 'full' },
          smoothingOctaves: 1 / 6,
          notes: [],
        },
        phaseTracking: [{ subject: 'low|high', meanAbsDeg: 5 }],
        flankError: { rmsDb: flank, maxAbsDb: flank * 2, levelDb: 0, bandHz: [283, 566], points: 20 },
      },
    });
    const s = buildShortlist([judged('b', 0.5, 0.1), judged('a', 0.3, 9)], 'run', { size: 2 });
    expect(s.rows.map((r) => r.label)).toEqual(['a', 'b']);
  });
});
