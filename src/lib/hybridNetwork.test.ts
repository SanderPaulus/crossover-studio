/**
 * H-3 — THE NETWORK TAB READS HYBRID MODE.
 *
 * TWO HALVES, the shape `v2ActiveSide.test.ts` set for H-2:
 *
 *   1. THE READINGS ARE HONEST — pure functions with hand values: the strip's
 *      band starts at the bottom of the handover band and is null when the
 *      view ends below it; the Q_es sentence names the stated maximum and calls
 *      a breach a FAILED requirement, and says nothing without one (P4); the
 *      flank chip's words; the template's seed realises the stated high-pass
 *      on the measured way and not a textbook ladder against a nominal load.
 *   2. THE APP ROUTES THEM — a SOURCE SCAN on `App.tsx`, for the reason UI-1
 *      paid for: what a function test cannot reach is whether the screen and
 *      the buttons DO it. Step 1 of the casebook measured that none of the
 *      four surfaces read the statement; each scan below pins one of them.
 *
 * Every scan was measured to be falsifiable before it was written down.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logspace } from './dsp.ts';
import { cplx } from './complex.ts';
import { evalHpLp } from './filters.ts';
import { handoverBandHz, leanJudgedBand, type FlankError } from './activeSide.ts';
import { ACTIVE_SIDE_NOT_JUDGED } from './v2ActiveSide.ts';
import { TEMPLATE_REFERENCE, filterTemplate } from './filterTemplates.ts';
import {
  HYBRID_NETWORK_VERSION,
  TEMPLATE_NOMINAL_NOTE,
  describeFlank,
  describeQesFactor,
  hybridStripNote,
  hybridStripRange,
  seedLowestPassiveWay,
} from './hybridNetwork.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');
const DESIGN_CHAIN = readFileSync(join(HERE, 'designChain.ts'), 'utf-8');
const WORKER = readFileSync(join(HERE, 'engine2', 'optimizer', 'worker.ts'), 'utf-8');

/* ==================================================================== *
 * 1 — the strip's band
 * ==================================================================== */

describe('H-3 — the strip judges from the bottom of the handover band', () => {
  it('lifts the floor of the visible range to the handover band’s floor, and keeps the top', () => {
    const r = hybridStripRange([100, 20000], 400);
    expect(r.floorHz).toBeCloseTo(handoverBandHz(400)[0], 12);
    expect(r.floorHz).toBeCloseTo(400 / Math.SQRT2, 9);
    expect(r.range).toEqual([r.floorHz, 20000]);
    /* The one rule: the same function the run reads (`leanBandFor`). */
    expect(r.range).toEqual(leanJudgedBand([100, 20000], 400));
  });

  it('a visible range that already starts above the floor is the identity', () => {
    expect(hybridStripRange([500, 20000], 400).range).toEqual([500, 20000]);
  });

  it('a visible range that ends below the floor judges NOTHING — null, never a sliver (F0)', () => {
    const r = hybridStripRange([20, 250], 400);
    expect(r.range).toBeNull();
    expect(r.floorHz).toBeGreaterThan(250);
  });

  it('the note carries the pinned not-judged sentence, in both states', () => {
    const judged = hybridStripNote(282.8, true, ACTIVE_SIDE_NOT_JUDGED);
    const none = hybridStripNote(282.8, false, ACTIVE_SIDE_NOT_JUDGED);
    expect(judged).toMatch(/^HYBRID MODE — judged from 283 Hz/);
    expect(judged).toContain(ACTIVE_SIDE_NOT_JUDGED);
    expect(none).toMatch(/nothing judged/);
    expect(none).toContain(ACTIVE_SIDE_NOT_JUDGED);
    expect(HYBRID_NETWORK_VERSION).toMatch(/^hybrid-network-tab\/\d+\.\d+$/);
  });
});

/* ==================================================================== *
 * 2 — the Q_es sentence
 * ==================================================================== */

describe('H-3 — the source-resistance rule names the stated Q_es maximum', () => {
  it('a breach of the stated maximum is a FAILED requirement, by name and number', () => {
    const r = describeQesFactor(2.93, 2.4)!;
    expect(r.failed).toBe(true);
    expect(r.text).toBe('Qes ×2.93 against stated 2.4 — requirement FAILED');
  });

  it('inside the maximum it says so', () => {
    const r = describeQesFactor(2.1, 2.4)!;
    expect(r.failed).toBe(false);
    expect(r.text).toBe('Qes ×2.10 within stated 2.4');
  });

  it('without a stated maximum the bare number stands and nothing is judged (P4): failed is null, not false', () => {
    const r = describeQesFactor(2.93, undefined)!;
    expect(r.failed).toBeNull();
    expect(r.text).toBe('Qes ×2.93');
    expect(r.text).not.toMatch(/stated|FAILED|within/);
  });

  it('no reading, no sentence', () => {
    expect(describeQesFactor(null, 2.4)).toBeNull();
    expect(describeQesFactor(Number.NaN, 2.4)).toBeNull();
  });
});

/* ==================================================================== *
 * 3 — the flank chip
 * ==================================================================== */

describe('H-3 — the flank chip', () => {
  const e: FlankError = { rmsDb: 1.6234, maxAbsDb: 3.1, levelDb: -3.78, bandHz: handoverBandHz(400), points: 21 };

  it('prints the rms shape error, and the title carries the band, the points and the level the DSP gain absorbs', () => {
    const d = describeFlank(e, 400);
    expect(d.value).toBe('1.62 dB rms');
    expect(d.title).toContain('283–566 Hz');
    expect(d.title).toContain('(21 points)');
    expect(d.title).toContain('level -3.78 dB');
    expect(d.title).toContain('DSP gain absorbs');
    expect(d.title).toMatch(/same function the shortlist judges/);
  });

  it('with no reading it says NOT READ and why, never a number', () => {
    const d = describeFlank(null, 400);
    expect(d.value).toBe('not read');
    expect(d.title).toMatch(/no solvable network|no grid point/);
  });
});

/* ==================================================================== *
 * 4 — the template's seed
 * ==================================================================== */

describe('H-3 — the template seeds the lowest passive way from the stated handover', () => {
  /* A flat driver into a resistive 8 Ω load: the acoustic synthesis then has
   * nothing to bend around, so the ladder it fits is the textbook LR ladder at
   * the STATED corner — a hand check with no measurement in it. */
  const grid = logspace(50, 20000, 400);
  const flatSpl = grid.map(() => 90);
  const eightOhm = grid.map(() => cplx(8, 0));
  const handover = { hz: 400, kind: 'LR' as const, order: 4 as const };

  const dbAt = (achieved: readonly { re: number; im: number }[], hz: number): number => {
    const i = grid.findIndex((f) => f >= hz);
    return 20 * Math.log10(Math.hypot(achieved[i].re, achieved[i].im));
  };

  it('the seeded high-pass sits at the STATED corner, not at the template’s 2.5 kHz reference', () => {
    const seed = seedLowestPassiveWay({ handover, grid, driverZ: eightOhm, driverSplDb: flatSpl });
    /* A bare ladder: order 4 = four HP elements, and nothing else. */
    const hp = seed.components.filter((c) => /HP/.test(c.role));
    expect(hp).toHaveLength(4);
    expect(seed.components).toHaveLength(4);
    /* At the stated corner an LR4 sits at −6.02 dB; two octaves down it is
     * 48 dB further. The realised transfer says the corner is 400 Hz. */
    expect(dbAt(seed.result.achieved, 400)).toBeGreaterThan(-8);
    expect(dbAt(seed.result.achieved, 400)).toBeLessThan(-4);
    expect(dbAt(seed.result.achieved, 100)).toBeLessThan(-40);
    expect(dbAt(seed.result.achieved, 4000)).toBeGreaterThan(-1);
    /* The tegenproef: the textbook template's ladder at the 2.5 kHz reference
     * passes 400 Hz at full level on the LOW-pass side, and its high-pass at
     * the reference would be 26 dB down at 400 Hz — neither is this seed. */
    const ref = evalHpLp({ enabled: true, kind: 'LR', order: 4, freq: TEMPLATE_REFERENCE.fcHz }, 'hp', 400);
    expect(20 * Math.log10(Math.hypot(ref.re, ref.im))).toBeLessThan(-30);
    expect(seed.note).toContain('LR4 high-pass at 400.0 Hz');
    expect(seed.note).toMatch(/acoustic synthesis, bare ladder/);
  });

  it('the values are what the MEASURED impedance asks for: the same corner into 4 Ω halves every coil and doubles every capacitor', () => {
    const at8 = seedLowestPassiveWay({ handover, grid, driverZ: eightOhm, driverSplDb: flatSpl }).components;
    const at4 = seedLowestPassiveWay({ handover, grid, driverZ: grid.map(() => cplx(4, 0)), driverSplDb: flatSpl }).components;
    expect(at4).toHaveLength(at8.length);
    for (let i = 0; i < at8.length; i++) {
      expect(at4[i].kind).toBe(at8[i].kind);
      const ratio = at4[i].value / at8[i].value;
      /* A textbook ladder scales exactly; the acoustic fit lands within a few percent of it. */
      if (at8[i].kind === 'L') expect(ratio).toBeCloseTo(0.5, 1);
      else expect(ratio).toBeCloseTo(2, 0);
    }
  });

  it('with an upper knee the branch carries BOTH sections and the note names the reference the knee sits at', () => {
    const seed = seedLowestPassiveWay({
      handover,
      grid,
      driverZ: eightOhm,
      driverSplDb: flatSpl,
      upperKnee: { enabled: true, kind: 'BW', order: 2, freq: TEMPLATE_REFERENCE.fcHz },
    });
    expect(seed.components.filter((c) => /HP/.test(c.role))).toHaveLength(4);
    expect(seed.components.filter((c) => /LP/.test(c.role))).toHaveLength(2);
    expect(seed.note).toContain(`upper knee BW2 @ ${TEMPLATE_REFERENCE.fcHz} Hz (template reference)`);
  });

  it('the template takes the seeded branch for its FIRST model only, names it, and is what it always was without one', () => {
    const seed = seedLowestPassiveWay({ handover, grid, driverZ: eightOhm, driverSplDb: flatSpl });
    const seeded = filterTemplate({ order: 2, wayCount: 2, models: ['mid', 'tweeter'], lowBranch: { components: seed.components, label: 'hybrid 400 Hz' } });
    const plain = filterTemplate({ order: 2, wayCount: 2, models: ['mid', 'tweeter'] });
    expect(seeded.name).toBe('2-way · 2nd order · hybrid 400 Hz');
    expect(plain.name).toBe('2-way · 2nd order');
    /* The tweeter branch (prefixed B·) is byte-identical between the two. */
    const highOf = (xo: typeof plain) => xo.parts.filter((p) => p.partId?.startsWith('B·')).map((p) => ({ ...p, wires: p.wires.map((w) => w.x) }));
    const seededHigh = highOf(seeded);
    const plainHigh = highOf(plain);
    expect(seededHigh.map((p) => [p.type, p.partId, p.params])).toEqual(plainHigh.map((p) => [p.type, p.partId, p.params]));
    /* The low branch differs: four seeded elements against the textbook two. */
    const lowOf = (xo: typeof plain) => xo.parts.filter((p) => /^(Inductor|Capacitor)$/.test(p.type) && !p.partId?.startsWith('B·'));
    expect(lowOf(seeded)).toHaveLength(4);
    expect(lowOf(plain)).toHaveLength(2);
    /* The textbook value is the 8 Ω / 2.5 kHz reference, as it always was. */
    const l1 = lowOf(plain).find((p) => p.type === 'Inductor')!;
    /* The schematic writes coils in mH, rounded to four significant digits. */
    const mH = l1.params.find((q) => q.name === 'L')?.value;
    expect(mH).toBeCloseTo(((1.414 * TEMPLATE_REFERENCE.rOhm) / (2 * Math.PI * TEMPLATE_REFERENCE.fcHz)) * 1e3, 2);
    expect(TEMPLATE_NOMINAL_NOTE).toMatch(/nominal impedance/);
    expect(TEMPLATE_NOMINAL_NOTE).toMatch(/state a handover or run Optimize/);
  });
});

/* ==================================================================== *
 * 5 — the app routes it (source scans)
 * ==================================================================== */

describe('H-3 — App.tsx reads Hybrid mode on the Network tab', () => {
  it('the strip judges from the handover band’s floor through the ONE rule, and reads NOT JUDGED below it', () => {
    expect(APP).toContain('return hybridStripRange([lo, hi], hybridStrip.hz);');
    expect(APP).toContain('? computeResponseStats(result.freq, result.combinedSpl, hybridStripBand.range[0], hybridStripBand.range[1])');
    expect(APP).toContain("t(hybridStripNote(hybridStripBand.floorHz, true, ACTIVE_SIDE_NOT_JUDGED))");
    expect(APP).toContain("{hybridStripBand && !combinedFlat && !simStale && (");
    expect(APP).toContain("t(hybridStripNote(hybridStripBand.floorHz, false, ACTIVE_SIDE_NOT_JUDGED))");
    /* …and the run's lean band is the same function. */
    expect(APP).toContain('return leanJudgedBand(settings.band, active.handover.hz);');
  });

  it('the flank chip renders on Working, read from the REPORT — one measurement, never a second one in the app', () => {
    expect(APP).toContain("() => (hybridStrip ? (engineV2Report?.report?.activeSide?.flankError ?? null) : null),");
    expect(APP).toContain('const d = describeFlank(hybridFlank, hybridStrip.hz);');
    expect(APP).toContain("{t('Flank')} <strong>{t(d.value)}</strong>");
    expect(APP).toContain("push('Target-flank error', d.value,");
    /* The app measures no flank of its own: `flankErrorDb` is the report's and
     * the worker's function, and it does not appear in App.tsx. */
    expect(APP).not.toContain('flankErrorDb(');
  });

  it('the source-resistance rule names the stated Q_es maximum at BOTH sites, and only on the v2 route', () => {
    expect(APP).toContain('const v2QesStatedMax = engineV2Enabled ? engineV2Gates.qesMultiplierMax : undefined;');
    expect(APP).toContain('const qes = describeQesFactor(netOptAudit.qesFactor, v2QesStatedMax);');
    expect(APP).toContain("const qes = describeQesFactor(r.audit?.qesFactor ?? null, v2QesStatedMax);");
    expect(APP).toContain("<span className={netOptAudit.rSourceWarn || qes?.failed ? 'audit-warn' : 'audit-ok'}>");
    /* The bare form is gone from both sites. */
    expect(APP).not.toContain('` (Qes ×${netOptAudit.qesFactor.toFixed(2)})`');
    expect(APP).not.toContain('Hz (Qes ×${(r.audit.qesFactor ?? 1).toFixed(2)})`');
  });

  it('“New from template” seeds the lowest passive way from the stated handover in Hybrid mode, and SAYS what a textbook template is without one', () => {
    const fn = APP.slice(APP.indexOf('function startNetworkFromTemplate() {'), APP.indexOf('/** Manual "Build passive filter" runs the synchronous synthesis'));
    expect(fn.length).toBeGreaterThan(1000);
    expect(fn).toContain('const seed = seedLowestPassiveWay({');
    expect(fn).toContain("handover: { hz, kind: v2ActiveSide.shape.kind, order: v2ActiveSide.shape.order },");
    expect(fn).toContain("lowBranch: { components: seed.components, label: `hybrid ${formatHandover(hz)}` },");
    /* The passive PAIR, never the three-way template, in Hybrid mode. */
    expect(fn).toContain('models: [lowModel, highModel],');
    expect(fn).toContain("if (!v2Hybrid || !v2ActiveSide.roles || !v2ActiveSide.shape || !result) return null;");
    /* Without a handover the textbook path is unchanged and says so — on the v2 route only. */
    expect(fn).toContain('const xo = filterTemplate({ order, wayCount: threeWay ? 3 : templateWays, models });');
    expect(fn).toContain('if (engineV2Enabled) {');
    expect(fn).toContain('`New from template — ${TEMPLATE_NOMINAL_NOTE}`');
  });

  it('⚙ Optimize components in Hybrid mode goes through the v2 worker on the chain’s own assembly', () => {
    expect(APP).toContain('    if (v2Hybrid) {\n      runNetOptimizeHybrid();\n      return;\n    }');
    expect(APP).toContain('function runNetOptimizeHybrid() {');
    expect(APP).toContain('runTuneNetlistV2(');
    /* The chain settings have ONE home, read by the scan and by the tune. */
    expect(APP.split('twoWayChainSettings({').length - 1).toBe(2);
    expect(APP).toContain('const settings: ChainSettings = twoWayChainSettings({ band: opts.band, angleData, safety, targets });');
    /* The lean band, the class-A DSP derivation and the complement: the run's own. */
    expect(APP).toContain('const leanBand = active.handover.unmeasured && settings.band ? leanJudgedBand(settings.band, hz) : null;');
    expect(APP).toContain("        ? { handover: a.stated, settings: complementSettings(a.stated) }\n        : null;");
    /* Refused wholesale = nothing applied (V31). */
    expect(APP).toContain("`⚠ ${t('Hybrid mode: the tune was refused and nothing was applied')} — ${r.rejection.reason}`");
    /* The v1 route is what it was: the v1 tune is still there for every other run. */
    expect(APP).toContain('runNetOptimizeTask({');
  });

  it('the engine side is ONE tune: the chain and the drawn-network route read the same option assembly', () => {
    expect(DESIGN_CHAIN).toContain('export function assembledTuneOptions(');
    expect(DESIGN_CHAIN).toContain('export function activeSideBranches(');
    /* `runDesignChain` reads both… */
    const chain = DESIGN_CHAIN.slice(DESIGN_CHAIN.indexOf('export function runDesignChain('));
    expect(chain).toContain('activeSideBranches(input)');
    expect(chain).toContain('assembledTuneOptions(');
    /* …and the worker's drawn-network route reads the same two, around the
     * same tuner, inside `runCandidate` — the gates, the budgets and the
     * declaration of a scan. */
    const route = WORKER.slice(WORKER.indexOf("case 'v2TuneNetlist': {"), WORKER.indexOf("post({ id: req.id, kind: 'done', data });"));
    expect(route.length).toBeGreaterThan(500);
    expect(route).toContain('activeSideBranches(chainInput)');
    expect(route).toContain('assembledTuneOptions(');
    expect(route).toContain('runCandidate<ChainInput, V2TuneNetlistResult>(');
    expect(route).toContain('optimizeNetworkValues(');
    /* No second option literal anywhere in the worker: the tuner is called once there. */
    expect(WORKER.split('optimizeNetworkValues(').length - 1).toBe(1);
    /* And both two-way routes are judged by the one measurements function. */
    expect(WORKER.split('twoWayMeasurements(chainInput, v2, r.parts, r.net.after)').length - 1).toBe(2);
    expect(WORKER.split('measureRejectedTwoWay(chainInput, v2, parts)').length - 1).toBe(2);
  });

  it('the scan can see: App.tsx is really being read', () => {
    expect(APP.length).toBeGreaterThan(500_000);
    expect(APP).toContain("from './lib/hybridNetwork.ts'");
  });
});
