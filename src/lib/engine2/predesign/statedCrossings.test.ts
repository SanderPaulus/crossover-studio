/**
 * U-5 — THE CROSSINGS THE DESIGNER STATES, AS A TEST.
 *
 * Six groups, and the shape of each is the shape of the rule it holds.
 *
 *  1. HAND CALCULATION on a synthetic window whose every limit is a round
 *     number: a measured divisor of 2 over a breakup at 8 kHz is a ceiling at
 *     exactly 4 kHz, and a crossing one octave above it is asked for exactly
 *     `6 · order` dB. Nothing here is read back off the engine.
 *  2. THE PARSE — one line per handover, and a partial set is not a set.
 *  3. P2/P4 — nothing stated leaves the derived field byte for byte as it was,
 *     and a superseded limit cannot be breached because it does not bind.
 *  4. CASUS 1b, the session's own measurement: 2200 inside, 2400 and 2600 past
 *     the breakup ceiling, each with what the divisor asks in decibels.
 *  5. THE SHORTLIST ROUTING — outside the window is never a row, is always in
 *     the stated section, and is loadable.
 *  6. THE APP RENDERS IT — a source scan, the UI-1 idiom, because what a
 *     function test cannot reach is whether the screen does it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DB_PER_OCTAVE_PER_ORDER, XO_FS_FACTOR_BY_ORDER } from '../constants.ts';
import { buildCandidateField } from './candidateField.ts';
import { describeFieldMode } from './fieldMode.ts';
import { candidateFieldKey } from './candidateField.ts';
import type { Alignment, CandidatePairInput } from './candidates.ts';
import { crossoverWindow, type XoWindowInput } from './xoWindow.ts';
import { breachesAt, parseStatedCrossings, statedCandidates } from './statedCrossings.ts';
import type { PairOrderResult } from './flankOrder.ts';
import { stableJson } from '../optimizer/determinism.ts';
import { buildShortlist, type ShortlistInput } from '../optimizer/shortlist.ts';
import { selectFromShortlist } from '../optimizer/selection.ts';
import type { StatedCrossingReport } from './statedCrossings.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { TopologyDescriptor } from '../optimizer/diversity.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import {
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  casus1bReport,
} from '../casus1b.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', '..', '..', 'App.tsx'), 'utf-8');

/* ================================================================== *
 * A bench whose every limit is a round number
 * ================================================================== */

const ORDER = 4;
const FS_HZ = 1000;
const BREAKUP_HZ = 8000;
/** MEASURED, so the ceiling is exactly `BREAKUP_HZ / 2` and carries no ramp. */
const DIVISOR = 2;
/** −24 dB at f_s over 24 dB/oct at order 4 is exactly one octave: 2000 Hz. */
const DRIVE_CEILING_DB = -24;

const ALIGNMENTS: readonly Alignment[] = [
  { kind: 'LR', order: 2 },
  { kind: 'LR', order: 4 },
];

const windowInput = (over: Partial<XoWindowInput> = {}): XoWindowInput => ({
  lower: 'L',
  upper: 'U',
  order: ORDER,
  validityFloorHz: 100,
  validityFloorSource: 'the bench',
  upperFsHz: FS_HZ,
  upperDriveCeilingDb: DRIVE_CEILING_DB,
  upperDriveCeilingSource: 'the bench',
  lowerBreakups: [{ fHz: BREAKUP_HZ, dB: 3 }],
  lowerBreakupDivisor: DIVISOR,
  lowerBreakupDivisorSource: 'the bench',
  lowerMinus6Hz: null,
  lowerMinus6AngleDeg: null,
  spacingMm: null,
  ...over,
});

const flank = (side: 'lower-lp' | 'upper-hp', driver: string, label: string) => ({
  pairLabel: label,
  side,
  driver,
  demands: [],
  demandedOrder: null,
  binding: null,
  notes: [],
});

const orders = (list: number[], label = 'L→U'): PairOrderResult => ({
  pairLabel: label,
  flanks: [flank('lower-lp', 'L', label), flank('upper-hp', 'U', label)],
  orders: list,
  why: list.map((o) => `order ${o}: the bench admits it`),
  notes: [],
});

const pair = (over: Partial<XoWindowInput> = {}, list = [ORDER]): CandidatePairInput => ({
  windowInput: windowInput(over),
  orders: orders(list),
  statedOrder: ORDER,
});

const SPACING = 1 / 6;
const statedOn = '2026-09-10';
const bench = (hz: number[], p = pair()) =>
  statedCandidates([p], [hz], { alignments: ALIGNMENTS, alignmentPolicy: 'one', spacingOctaves: SPACING, statedOn });

const breachOf = (hz: number, rule: string, p = pair()) =>
  breachesAt(hz, crossoverWindow({ ...p.windowInput, order: ORDER }), p, ORDER).find((b) => b.rule === rule);

/* ================================================================== *
 * 1 — the hand calculation
 * ================================================================== */

describe('U-5 — what a stated position is past, by hand', () => {
  it('the bench window is 2000–4000 Hz, and every edge is a round number', () => {
    const w = crossoverWindow({ ...windowInput(), order: ORDER });
    expect(w.floorHz).toBeCloseTo(2000, 6);
    expect(w.ceilingHz).toBeCloseTo(BREAKUP_HZ / DIVISOR, 6);
    expect(w.floorBy?.rule).toBe('drive');
    expect(w.ceilingBy?.rule).toBe('breakup');
  });

  it('a crossing one octave ABOVE the breakup ceiling is asked for 6·order dB at the breakup', () => {
    const b = breachOf(BREAKUP_HZ, 'breakup')!;
    expect(b.side).toBe('ceiling');
    expect(b.octaves).toBeCloseTo(1, 9);
    expect(b.quantity).toBe('breakup-suppression-db');
    // 6 dB/oct per order over log2(2) = 1 octave, at order 4.
    expect(b.demandDb).toBeCloseTo(DB_PER_OCTAVE_PER_ORDER * ORDER, 9);
    expect(b.atHz).toBeCloseTo(BREAKUP_HZ, 9);
    expect(b.subject).toBe('L');
    expect(b.stated).toBe(false);
  });

  it('a crossing one octave BELOW the drive floor is asked for the whole excursion ceiling at f_s', () => {
    const b = breachOf(FS_HZ, 'drive')!;
    expect(b.side).toBe('floor');
    expect(b.octaves).toBeCloseTo(1, 9);
    expect(b.demandDb).toBeCloseTo(Math.abs(DRIVE_CEILING_DB), 9);
    expect(b.atHz).toBe(FS_HZ);
    expect(b.subject).toBe('U');
  });

  it('the k·f_s CONVENTION is breached too, and what it stands for is 6·order·log2(k) dB', () => {
    const k = XO_FS_FACTOR_BY_ORDER[ORDER];
    const b = breachOf(FS_HZ, 'fs')!;
    expect(b.limitHz).toBeCloseTo(k * FS_HZ, 9);
    expect(b.octaves).toBeCloseTo(Math.log2(k), 9);
    expect(b.demandDb).toBeCloseTo(DB_PER_OCTAVE_PER_ORDER * ORDER * Math.log2(k), 9);
    expect(b.stated).toBe(false);
  });

  it('a position INSIDE the window is past nothing, and its cage is one spacing wide and centred', () => {
    const f = bench([2500]);
    expect(f.candidates).toHaveLength(1);
    const c = f.candidates[0];
    expect(c.stated!.outsideWindow).toBe(false);
    expect(c.stated!.perCrossing[0].breaches).toEqual([]);
    const [lo, hi] = c.crossings[0].cageHz;
    expect(Math.log2(hi / lo)).toBeCloseTo(SPACING, 3);
    expect(Math.log2(2500 / lo)).toBeCloseTo(Math.log2(hi / 2500), 3);
    expect(c.crossings[0].twoSided).toBe(true);
  });

  it('a MEASURED divisor takes the uncalibrated marking off the breach with it', () => {
    expect(breachOf(BREAKUP_HZ, 'breakup')!.uncalibrated).toBeNull();
    const ramp = pair({ lowerBreakupDivisor: null });
    expect(breachOf(5000, 'breakup', ramp)!.uncalibrated).toMatch(/uncalibrated/i);
  });

  it('the demand moves with the ORDER and the divisor does not — two quantities, not one', () => {
    const p = pair({}, [2, 4]);
    const at2 = breachesAt(BREAKUP_HZ, crossoverWindow({ ...p.windowInput, order: 2 }), p, 2).find((b) => b.rule === 'breakup')!;
    const at4 = breachesAt(BREAKUP_HZ, crossoverWindow({ ...p.windowInput, order: 4 }), p, 4).find((b) => b.rule === 'breakup')!;
    expect(at2.limitHz).toBeCloseTo(at4.limitHz, 9);
    expect(at2.demandDb).toBeCloseTo(DB_PER_OCTAVE_PER_ORDER * 2, 9);
    expect(at4.demandDb).toBeCloseTo(DB_PER_OCTAVE_PER_ORDER * 4, 9);
  });
});

/* ================================================================== *
 * 2 — the parse
 * ================================================================== */

describe('U-5 — one line per handover', () => {
  it('a two-way reads one line; duplicates go and the order is ascending', () => {
    const p = parseStatedCrossings(' 2600, 2200 , 2400, 2200 ', ['mid→tweeter']);
    expect(p.perAxisHz).toEqual([[2200, 2400, 2600]]);
    expect(p.problems).toEqual([]);
    expect(p.complete).toBe(true);
  });

  it('a three-way reads two lines, and a semicolon does what a newline does', () => {
    const labels = ['woofer→mid', 'mid→tweeter'];
    expect(parseStatedCrossings('400, 450\n2200, 2400', labels).perAxisHz).toEqual([[400, 450], [2200, 2400]]);
    expect(parseStatedCrossings('400, 450; 2200, 2400', labels).perAxisHz).toEqual([[400, 450], [2200, 2400]]);
  });

  it('a PARTIAL set is not a set: nothing is built and the empty handover is named', () => {
    const p = parseStatedCrossings('2200', ['woofer→mid', 'mid→tweeter']);
    expect(p.complete).toBe(false);
    expect(p.problems.join(' ')).toContain('mid→tweeter');
    const f = statedCandidates(
      [pair(), { ...pair(), orders: orders([ORDER], 'M→T') }],
      p.perAxisHz,
      { alignments: ALIGNMENTS, alignmentPolicy: 'one', spacingOctaves: SPACING, statedOn },
    );
    expect(f.candidates).toEqual([]);
    expect(f.refusals.join(' ')).toMatch(/no crossing was stated/);
  });

  it('what it cannot use is REPORTED, and no number is INVENTED out of it (A3h)', () => {
    const p = parseStatedCrossings('2200, banana, -5, 2400Hz', ['mid→tweeter']);
    /* Three rejected tokens and one kept. The two that matter are “-5” and
     * “2400Hz”: an earlier parse pulled the digits out of a token and turned
     * them into 5 and 2400 — the right kind of number, invented out of
     * something the designer did not write. */
    expect(p.perAxisHz).toEqual([[2200]]);
    expect(p.problems).toHaveLength(3);
    expect(p.problems.join(' ')).toContain('banana');
    expect(p.problems.join(' ')).toContain('-5');
    expect(p.problems.join(' ')).toContain('2400Hz');
  });

  it('an empty field states nothing at all, and says so by being incomplete', () => {
    for (const raw of ['', '   ', null, undefined]) {
      const p = parseStatedCrossings(raw, ['mid→tweeter']);
      expect(p.perAxisHz).toEqual([[]]);
      expect(p.complete).toBe(false);
      expect(p.problems).toEqual([]);
    }
  });
});

/* ================================================================== *
 * 3 — P2 and P4
 * ================================================================== */

describe('U-5 — nothing stated is the field it always was', () => {
  const report = casus1bReport(null);
  const wis = report.predesign.windowInputs;
  const base = {
    windowInputs: wis,
    perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
    alignments: CASUS1B_FIELD_ALIGNMENTS,
    chainBudget: 8,
    positionPolicy: 'centre-first' as const,
    alignmentPolicy: 'one' as const,
  };

  it('the run fingerprint of a field WITHOUT stated crossings is byte-identical to before U-5', () => {
    const a = buildCandidateField(base);
    const b = buildCandidateField({ ...base, statedPerAxisHz: [[]], statedOn });
    expect(stableJson(candidateFieldKey(a.field))).toBe(stableJson(candidateFieldKey(b.field)));
    expect(a.field.parameters.statedSize).toBeUndefined();
    expect(b.field.parameters.statedSize).toBeUndefined();
  });

  it('stating crossings leaves every DERIVED candidate exactly where it was', () => {
    const a = buildCandidateField(base);
    const b = buildCandidateField({ ...base, statedPerAxisHz: [[2200, 2400, 2600]], statedOn });
    expect(b.field.candidates.filter((c) => !c.stated).map((c) => c.label)).toEqual(
      a.field.candidates.map((c) => c.label),
    );
    expect(b.field.parameters.statedSize).toBe(3);
    /* And the fingerprint DOES move: two runs over two different fields may not
     * stamp alike (F4d), which is what makes the claim above worth having. */
    expect(stableJson(candidateFieldKey(a.field))).not.toBe(stableJson(candidateFieldKey(b.field)));
  });

  it('a SUPERSEDED limit does not bind, so a stated position cannot be past it', () => {
    /* U-4's overrule: a stated ceiling put in place of the breakup derivation.
     * The breakup stays in `limits` and must not produce a breach. */
    const p = pair({
      lowerMaxCrossoverHz: 6000,
      lowerMaxCrossoverSource: 'the bench sheet',
      lowerMaxCrossoverOverridesBreakup: true,
    });
    const w = crossoverWindow({ ...p.windowInput, order: ORDER });
    expect(w.limits.find((l) => l.rule === 'breakup')?.superseded).toBeTruthy();
    const bs = breachesAt(5000, w, p, ORDER);
    expect(bs.map((b) => b.rule)).toEqual([]);
    // And a crossing past the ceiling that DOES bind is still a breach.
    expect(breachesAt(7000, w, p, ORDER).map((b) => b.rule)).toEqual(['stated-max']);
  });

  it('a STATED ceiling is marked stated and a derived one is not', () => {
    const p = pair({ lowerMaxCrossoverHz: 3000, lowerMaxCrossoverSource: 'the bench sheet' });
    const w = crossoverWindow({ ...p.windowInput, order: ORDER });
    const bs = breachesAt(5000, w, p, ORDER);
    expect(bs.find((b) => b.rule === 'stated-max')!.stated).toBe(true);
    expect(bs.find((b) => b.rule === 'breakup')!.stated).toBe(false);
  });
});

/* ================================================================== *
 * 4 — casus 1b, the session's own measurement
 * ================================================================== */

describe('U-5 — 2200 / 2400 / 2600 on casus 1b', () => {
  const report = casus1bReport(null);
  const wis = report.predesign.windowInputs;
  const field = buildCandidateField({
    windowInputs: wis,
    perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
    alignments: CASUS1B_FIELD_ALIGNMENTS,
    chainBudget: 8,
    positionPolicy: 'centre-first',
    alignmentPolicy: 'one',
    statedPerAxisHz: [[2200, 2400, 2600]],
    statedOn,
  }).field;
  const stated = field.candidates.filter((c) => c.stated);
  const at = (hz: number) => stated.find((c) => c.crossings[0].hz === hz)!;

  it('all three are candidates, and they are three MORE than the derived field', () => {
    expect(stated).toHaveLength(3);
    expect(field.candidates).toHaveLength(field.parameters.deliveredSize + 3);
  });

  it('2200 Hz is INSIDE the window: past nothing, and treated as a derived candidate', () => {
    expect(at(2200).stated!.outsideWindow).toBe(false);
    expect(at(2200).stated!.perCrossing[0].breaches).toEqual([]);
  });

  it('2400 and 2600 Hz are past the BREAKUP ceiling, further the higher they go', () => {
    for (const hz of [2400, 2600]) {
      const c = at(hz).stated!;
      expect(c.outsideWindow).toBe(true);
      expect(c.perCrossing[0].breaches.map((b) => b.rule)).toEqual(['breakup']);
    }
    expect(at(2600).stated!.perCrossing[0].breaches[0].octaves).toBeGreaterThan(
      at(2400).stated!.perCrossing[0].breaches[0].octaves,
    );
  });

  it('the demand is the divisor read forward: 6·4·log2(divisor) dB at the mid’s breakup', () => {
    const b = at(2600).stated!.perCrossing[0].breaches[0];
    const w = crossoverWindow({ ...wis[0], order: CASUS1B_STATED_ORDER });
    const bu = w.limits.find((l) => l.rule === 'breakup')!;
    // The divisor the ceiling was built on, recovered from the ceiling itself.
    const divisor = b.atHz! / bu.hz;
    expect(b.demandDb).toBeCloseTo(DB_PER_OCTAVE_PER_ORDER * CASUS1B_STATED_ORDER * Math.log2(divisor), 6);
    expect(b.subject).toBe(wis[0].lower);
    expect(b.uncalibrated).toMatch(/uncalibrated/i);
    expect(b.stated).toBe(false);
  });

  it('the field line counts the DERIVED half and names the stated ones apart', () => {
    /* Measured in the running app before it was written down: with the stated
     * candidates counted in, the exploration line read "8 of 5 derived
     * candidates" — a sentence that cannot be true. */
    const line = describeFieldMode(field);
    expect(line).toContain(`${field.parameters.deliveredSize} of ${field.parameters.derivedSize} derived`);
    expect(line).toContain('Plus 3 crossings you stated');
  });

  it('each of them carries its attribution and the date the designer stated it', () => {
    for (const c of stated) {
      expect(c.stated!.statedOn).toBe(statedOn);
      expect(c.provenance).toContain('STATED BY THE DESIGNER');
      expect(c.label).toMatch(/stated$/);
    }
  });
});

/* ================================================================== *
 * 5 — the shortlist routing
 * ================================================================== */

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
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: 5 }],
});

const topo = (order: number): TopologyDescriptor => ({
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order },
    { way: 'high', side: 'hp', kind: 'LR', order },
  ],
  inverted: [],
});

const report = (outside: boolean, missed: string[] = []): StatedCrossingReport => ({
  statedOn,
  outsideWindow: outside,
  perCrossing: [{ pairLabel: 'L→U', hz: 2600, insideWindow: !outside, breaches: [] }],
  missedStated: missed,
});

const input = (
  label: string,
  order: number,
  rms: number,
  over: Partial<ShortlistInput<string>> = {},
): ShortlistInput<string> => ({
  label,
  parts: [cap('C1', order * 2.2)],
  result: label,
  topology: topo(order),
  measurements: measurements(rms),
  gates: [],
  ...over,
});

const RUN = 'engine=2.0.0 seed=1 status=completed';

describe('U-5 — the shortlist keeps a stated crossing out of the qualified rows', () => {
  it('a stated crossing OUTSIDE the window is never a row, and is always in the stated section', () => {
    const sl = buildShortlist(
      [input('derived', 4, 0.5), input('stated', 4, 0.1, { stated: report(true) })],
      RUN,
    );
    // It has the best RMS of the field and it is still not a row.
    expect(sl.rows.map((r) => r.label)).toEqual(['derived']);
    expect(sl.stated.map((e) => e.label)).toEqual(['stated']);
    expect(sl.stated[0].isRow).toBe(false);
    expect(sl.stated[0].outsideWindow).toBe(true);
    expect(sl.stated[0].parts.length).toBeGreaterThan(0);
  });

  it('a stated crossing INSIDE the window is an ordinary row, and its entry says so', () => {
    const sl = buildShortlist(
      [input('derived', 4, 0.5), input('stated', 2, 0.1, { stated: report(false) })],
      RUN,
    );
    expect(sl.rows.map((r) => r.label)).toContain('stated');
    expect(sl.stated[0].isRow).toBe(true);
    expect(sl.stated[0].describe).toMatch(/shortlist row/);
  });

  it('a stated crossing’s REFUSAL is reported in its own entry and not in the refused list', () => {
    const sl = buildShortlist(
      [
        input('derived', 4, 0.5),
        input('stated', 4, 0.2, {
          stated: report(true, ['M-C']),
          rejection: { kinds: ['gate'], reason: 'M-C on the tweeter' },
        }),
      ],
      RUN,
    );
    expect(sl.rejected).toEqual([]);
    expect(sl.stated[0].refusal?.reason).toBe('M-C on the tweeter');
    expect(sl.stated[0].describe).toMatch(/MISSES M-C/);
  });

  it('a field with no stated crossing has an EMPTY stated section and unchanged rows', () => {
    const plain = buildShortlist([input('a', 4, 0.5), input('b', 2, 0.9)], RUN);
    expect(plain.stated).toEqual([]);
    expect(plain.rows.map((r) => r.label)).toEqual(['a', 'b']);
  });

  it('a stated crossing outside the window is LOADABLE by label — that is what it is for', () => {
    const sl = buildShortlist(
      [input('derived', 4, 0.5), input('stated', 4, 0.1, { stated: report(true) })],
      RUN,
    );
    const sel = selectFromShortlist(sl, 'stated');
    expect(sel.kind).toBe('design');
    if (sel.kind !== 'design') return;
    expect(sel.row).toBeNull();
    expect(sel.stated?.label).toBe('stated');
    expect(sel.parts.length).toBeGreaterThan(0);
    expect(sel.describe).toMatch(/YOU stated/);
  });

  it('a stated crossing that delivered NO network cannot be loaded, and the reason says which', () => {
    const sl = buildShortlist(
      [input('derived', 4, 0.5), input('stated', 4, 0.1, { parts: [], stated: report(true) })],
      RUN,
    );
    const sel = selectFromShortlist(sl, 'stated');
    expect(sel.kind).toBe('none');
    if (sel.kind !== 'none') return;
    expect(sel.cause).toBe('empty-network');
  });

  it('the DEFAULT pick is still the first row, never a stated crossing outside the window', () => {
    const sl = buildShortlist(
      [input('derived', 4, 0.5), input('stated', 4, 0.1, { stated: report(true) })],
      RUN,
    );
    const sel = selectFromShortlist(sl);
    expect(sel.kind).toBe('design');
    if (sel.kind !== 'design') return;
    expect(sel.label).toBe('derived');
  });
});

/* ================================================================== *
 * 6 — the app renders it
 * ================================================================== */

describe('U-5 — the app states, parses and shows it', () => {
  it('the run field exists, writes the setting and is the one the register names', () => {
    expect(APP).toContain('value={engineV2Settings.statedCrossings}');
    expect(APP).toContain("setV2Field('statedCrossings', e.target.value)");
  });

  it('BOTH routes parse it and hand it to the generator', () => {
    expect((APP.match(/parseStatedCrossings\(/g) ?? []).length).toBe(2);
    expect((APP.match(/statedPerAxisHz: v2FieldRequest\.statedPerAxisHz,/g) ?? []).length).toBe(2);
    /* Four, not two: each route hands the date to the GENERATOR and to the run
     * EXPORT, and the two are different readers of one setting. */
    expect((APP.match(/statedOn: engineV2StatedAt\.statedCrossings/g) ?? []).length).toBe(4);
  });

  it('BOTH routes hand the designer’s mark to the worker, re-keyed to model names', () => {
    expect((APP.match(/statedMarkForWorker\(cand\.stated,/g) ?? []).length).toBe(2);
  });

  it('the handover floor comes from the ONE rule, not from the window field directly', () => {
    expect(APP).toContain('xoFloorPairs: windowFloorsFor(cand)');
    expect(APP).not.toContain('xoFloorPairs: cand.crossings.map');
  });

  it('the shortlist renders the stated section, apart from the rows and the refusals', () => {
    expect(APP).toContain('className="shortlist-stated"');
    expect(APP).toContain('v2Shortlist.stated.map(');
    // And it is clickable, which the refusal list deliberately is not.
    const at = APP.indexOf('className="shortlist-stated"');
    expect(APP.slice(at, at + 2500)).toContain('loadShortlistRow(e.label)');
  });

  it('the run EXPORT carries them, so layer 1 of the replay can rebuild the field', () => {
    /* The block is what `scripts/replay-app-run.ts` rebuilds the field from,
     * and a field it cannot rebuild is a block that does not carry what the
     * field depended on — the one thing layer 1 exists to prove. Both routes
     * put them in. */
    expect((APP.match(/statedPerAxisHz: v2FieldRequest\.statedPerAxisHz\.map/g) ?? []).length).toBe(2);
  });

  it('GUIDED does not offer it — it is an expert function (I-3 walks the judgement rows)', () => {
    /* The guided walk is built from the register's JUDGEMENT rows, and this is
     * a `nice` row, so it cannot appear there. Asserted rather than assumed:
     * re-classifying the row would silently put a candidate-generation control
     * into a requirements wizard. */
    expect(APP.match(/statedCrossings/g)!.length).toBeGreaterThan(0);
    const guided = APP.slice(APP.indexOf("uiMode === 'guided'"));
    expect(guided.slice(0, 4000)).not.toContain('statedCrossings');
  });
});
