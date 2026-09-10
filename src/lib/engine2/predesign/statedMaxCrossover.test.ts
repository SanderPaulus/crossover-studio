/**
 * U-4 — THE MIRROR RULE ON THE CEILING SIDE, THE FIRST STATED OVERRULE OF A
 * DERIVED LIMIT, AND WHAT MEASURING THE BREAKUP DIVISOR WOULD BUY.
 *
 * WHERE IT COMES FROM. U-3g read the bottom of one line off a datasheet —
 * "Recommended frequency range 2.2kHz - 30kHz" — and made it a window floor.
 * That line has a TOP, and the window it belongs to is the one where the driver
 * is the LOWER of a pair. So the card carries a pair, and the ceiling side gets
 * the same treatment the floor already had: one more candidate in the
 * reduction, strictest (= lowest) wins, `ceilingBy` names the winner.
 *
 * WHAT MADE THE SESSION WORTH RUNNING RATHER THAN ASSUMING. On casus 1 the
 * ceiling that binds the mid→tweeter pair is the mid's breakup divided by an
 * INTERPOLATED divisor — the one limit in this module that says of itself that
 * it is uncalibrated (V9), and on casus 1b it leaves a window 0.07 octaves wide
 * holding a single candidate. The brief expected SB to state a top for the
 * MR13TX-4 above that, so the new rule would be exercised and bind nothing. The
 * sheet was read (REV. 0, 09.02.2024) and it states NO recommended range at
 * all. That is the measured answer, it is recorded in the manifest, and it is
 * why the ceiling on this casus is still the ramp.
 *
 * THREE THINGS ARE CLAIMED HERE, and the third is the one with teeth:
 *   1. the mirror — verbatim, strictest binds, and the asymmetry with the floor
 *      (no order on the top) is deliberate and pinned;
 *   2. the overrule — explicit, never derived, and the superseded limit stays
 *      in the report while it stops binding;
 *   3. the divisor — measured replaces interpolated, the UNCALIBRATED marking
 *      goes with it, and the table says what the measurement is worth BEFORE
 *      anyone spends an afternoon on it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossoverWindow } from './xoWindow.ts';
import type { XoWindowInput } from './xoWindow.ts';
import { derivedPositionCount } from './positionCount.ts';
import { BREAKUP_DIV_MILD, BREAKUP_DIV_SEVERE, WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';
import { breakupDivisor } from '../metrics/acoustic.ts';
import { generateCandidates, type Alignment } from './candidates.ts';
import type { PairOrderResult } from './flankOrder.ts';
import { V2_FORM_FIELDS, V2_INPUT_REGISTER, placementOf } from '../../v2InputRegister.ts';
import { BREAKUP_DIVISOR_PROTOCOL, breakupDivisorProtocolFor } from '../../breakupDivisorProtocol.ts';
import { casus1BreakupDivisors, casus1MaxCrossovers, loadGolden } from '../casus1.fixture.ts';
import { CASUS1_WINDOW_SETTINGS } from '../casus1V2.fixture.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

/**
 * A PAPER PAIR with round numbers, so every ceiling below is one line of
 * arithmetic: a breakup at 6000 Hz over the mild endpoint is exactly 3000 Hz,
 * over the severe one exactly 2000.
 */
const PAPER: XoWindowInput = {
  lower: 'mid',
  upper: 'tweeter',
  order: 4,
  validityFloorHz: 500,
  validityFloorSource: 'paper',
  upperFsHz: null,
  lowerBreakups: [{ fHz: 6000, dB: 3 }],
  lowerMinus6Hz: null,
  lowerMinus6AngleDeg: null,
  spacingMm: null,
};

/**
 * Casus 1b's real pair, exactly as `statedMinCrossover.test.ts` hands it over,
 * WITH the tweeter's stated minimum in place — which is the state the app is in
 * as soon as the designer types the BlieSMa recommendation on the card, and the
 * state in which this pair's window is at its most cramped.
 */
const CASUS1B: XoWindowInput = {
  lower: 'mid',
  upper: 'tweeter',
  order: 4,
  validityFloorHz: 396.7,
  validityFloorSource: 'tweeter far field',
  upperFsHz: 924.31640625,
  upperMinCrossoverHz: 2200,
  upperMinCrossoverOrder: 2,
  lowerBreakups: [{ fHz: 5688, dB: 2.8 }],
  lowerMinus6Hz: 5388,
  lowerMinus6AngleDeg: 30,
  spacingMm: 129.2,
};

const ceilingOf = (i: XoWindowInput) => crossoverWindow(i).limits.find((l) => l.rule === 'stated-max') ?? null;
const breakupOf = (i: XoWindowInput) => crossoverWindow(i).limits.find((l) => l.rule === 'breakup') ?? null;

/* ==================================================================== *
 * 1 — the mirror: verbatim, strictest binds, no order on the top
 * ==================================================================== */
describe('U-4 — the manufacturer’s ceiling, on numbers a reader can check', () => {
  it('a stated ceiling BELOW the derived one binds, and ceilingBy names it', () => {
    /* 6000 Hz at +3 dB over trend is the midpoint of the ramp: divisor 2.5,
     * ceiling 2400 Hz. A stated 2000 is stricter. */
    expect(breakupDivisor(3)).toBeCloseTo(2.5, 9);
    const w = crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 2000 });
    expect(w.ceilingBy?.rule).toBe('stated-max');
    expect(w.ceilingHz).toBe(2000);
    expect(breakupOf({ ...PAPER, lowerMaxCrossoverHz: 2000 })!.hz).toBeCloseTo(2400, 9);
  });

  it('a stated ceiling ABOVE the derived one is read and does not bind', () => {
    const w = crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 4000 });
    expect(w.ceilingBy?.rule).toBe('breakup');
    expect(w.ceilingHz).toBeCloseTo(2400, 9);
    expect(ceilingOf({ ...PAPER, lowerMaxCrossoverHz: 4000 })!.hz).toBe(4000);
  });

  /* THE ASYMMETRY WITH THE FLOOR, AS A CLAIM. The floor takes an order and is
   * RAISED for a shallower flank, because the sheet's condition is a filter
   * condition. The ceiling takes none and never moves with the order: a
   * recommended top is about cone breakup and beaming, no sheet in this
   * project prints a slope beside it, and a correction nobody stated would be
   * the A3h trap (the right number, off the right sheet, about the wrong
   * thing). Without this claim "verbatim" and "order-corrected" are the same
   * assertion on any pair where they happen to agree. */
  it('the ceiling is VERBATIM at every order — the floor’s correction has no counterpart', () => {
    for (const order of [1, 2, 3, 4]) {
      expect(ceilingOf({ ...PAPER, order, lowerMaxCrossoverHz: 2000 })!.hz, `order ${order}`).toBe(2000);
    }
    /* And the type carries no order to correct with: the window input has one
     * field for this end of the line and one only. */
    expect(Object.keys(PAPER)).not.toContain('lowerMaxCrossoverOrder');
    expect(ceilingOf({ ...PAPER, lowerMaxCrossoverHz: 2000 })!.source).toContain('verbatim at every order');
  });

  it('the window says where the sheet landed against the measurements', () => {
    const t = crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 2000 }).tensions.find((x) =>
      x.includes("datasheet's maximum crossover"),
    );
    expect(t).toBeDefined();
    expect(t).toContain('STRICTER');
    expect(t).toContain('UNCALIBRATED');
  });
});

/* ==================================================================== *
 * 2 — P4/P2: absent is absent
 * ==================================================================== */
describe('U-4 — absent changes nothing (P4/P2)', () => {
  it('no field, a null, a zero and a NaN all leave the window byte-identical', () => {
    const bare = JSON.stringify(crossoverWindow(CASUS1B));
    for (const v of [null, 0, -1, Number.NaN]) {
      expect(JSON.stringify(crossoverWindow({ ...CASUS1B, lowerMaxCrossoverHz: v })), String(v)).toBe(bare);
    }
    /* The overrule without a ceiling to overrule is inert, not a half-stated
     * anything: it can only ever take a limit out of the reduction in favour
     * of one that exists. */
    expect(JSON.stringify(crossoverWindow({ ...CASUS1B, lowerMaxCrossoverOverridesBreakup: true }))).toBe(bare);
    /* Same for a divisor that is not a divisor. */
    for (const v of [null, 0, -1, Number.NaN]) {
      expect(JSON.stringify(crossoverWindow({ ...CASUS1B, lowerBreakupDivisor: v })), `div ${v}`).toBe(bare);
    }
  });

  it('with nothing stated the breakup derivation still binds this pair', () => {
    const w = crossoverWindow(CASUS1B);
    expect(w.ceilingBy?.rule).toBe('breakup');
    expect(w.ceilingBy?.uncalibrated).toBeTruthy();
  });
});

/* ==================================================================== *
 * 3 — the overrule: explicit, marked, and the breakup stays in the report
 * ==================================================================== */
describe('U-4 — the first stated overrule of a derived limit', () => {
  const ON = { lowerMaxCrossoverHz: 4000, lowerMaxCrossoverOverridesBreakup: true, lowerMaxCrossoverSource: 'the sheet' };

  it('a stated ceiling ALONE never overrules — the switch has to be set', () => {
    const off = crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 4000 });
    expect(off.limits.find((l) => l.rule === 'breakup')!.superseded).toBeUndefined();
    expect(off.ceilingBy?.rule).toBe('breakup');
  });

  it('with it set the stated ceiling binds even where the derivation is stricter', () => {
    const w = crossoverWindow({ ...PAPER, ...ON });
    expect(w.ceilingBy?.rule).toBe('stated-max');
    expect(w.ceilingHz).toBe(4000);
  });

  /* THE HALF THE BRIEF SPELLED OUT: the breakup is a measured property of the
   * cone, so it stays where a reader can see it. Hiding it would hide exactly
   * the thing the overrule overrules. */
  it('the breakup limit is still reported, marked superseded, with its own frequency in the sentence', () => {
    const w = crossoverWindow({ ...PAPER, ...ON });
    const b = w.limits.find((l) => l.rule === 'breakup');
    expect(b).toBeDefined();
    expect(b!.hz).toBeCloseTo(2400, 9);
    expect(b!.superseded).toContain('stated ceiling (the sheet) REPLACES the derived breakup limit (UNCALIBRATED)');
    expect(b!.superseded).toContain('the first stated overrule of a derived limit in this project');
    expect(b!.superseded).toContain('the breakup at 6000 Hz stays in the report');
    // …and it is left out of the reduction rather than out of the report.
    expect(w.limits.filter((l) => l.side === 'ceiling').map((l) => l.rule).sort()).toEqual(
      ['breakup', 'stated-max'],
    );
  });

  it('the tension says who set it and that nothing else moved', () => {
    const t = crossoverWindow({ ...PAPER, ...ON }).tensions.find((x) => x.startsWith('OVERRULE:'));
    expect(t).toBeDefined();
    expect(t).toContain('You set this; nothing derives it');
    expect(t).toContain('only this window edge does');
  });

  /* AND THE SENTENCE BESIDE IT STOPS SAYING "THE STRICTEST BINDS", because
   * with the overrule set that is no longer what is doing the work. Caught in
   * the running app rather than in review: a stated 4000 Hz above a derived
   * 2287 Hz printed "the strictest binds, and here that is stated-max". */
  it('the placement sentence names the overrule instead of strictness', () => {
    const on = crossoverWindow({ ...PAPER, ...ON }).tensions.find((x) =>
      x.includes("datasheet's maximum crossover"),
    );
    expect(on).toContain('the OVERRULE puts it in place of the breakup derivation');
    expect(on).toContain('even though it is not the strictest');
    expect(on).not.toContain('the strictest binds');

    const off = crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 4000 }).tensions.find((x) =>
      x.includes("datasheet's maximum crossover"),
    );
    expect(off).toContain('the strictest binds');
    expect(off).not.toContain('OVERRULE');
  });

  /* IT REACHES THE CANDIDATE PROVENANCE, which is where a shortlist row is
   * read — and it names the superseded limit rather than quietly dropping it,
   * the reading E-1 added the ceiling inventory to prevent. */
  it('a candidate says which ceiling won and which was put aside', () => {
    const ALIGN: Alignment[] = [{ kind: 'LR', order: 4 }];
    const orders: PairOrderResult = {
      pairLabel: 'mid→tweeter',
      flanks: [
        { pairLabel: 'mid→tweeter', side: 'lower-lp', driver: 'mid', demands: [], demandedOrder: null, binding: null, notes: [] },
        { pairLabel: 'mid→tweeter', side: 'upper-hp', driver: 'tweeter', demands: [], demandedOrder: null, binding: null, notes: [] },
      ],
      orders: [4],
      why: ['order 4: stated'],
      notes: [],
    };
    const field = generateCandidates([{ windowInput: { ...PAPER, ...ON }, orders }], { alignments: ALIGN });
    expect(field.candidates.length).toBeGreaterThan(0);
    const p = field.candidates[0].provenance;
    expect(p).toContain('ceiling 4000 Hz (stated-max');
    expect(p).toContain('SUPERSEDED and not binding: breakup 2400 Hz');
    expect(p).toContain('the first stated overrule of a derived limit in this project');
  });

  /* And with the overrule on the divisor table is EMPTY: a table about what a
   * divisor would buy answers nothing once the divisor no longer sets the
   * ceiling. */
  it('the divisor table stands down when the derivation is superseded', () => {
    expect(crossoverWindow({ ...PAPER, ...ON }).divisorTable).toEqual([]);
    expect(crossoverWindow({ ...PAPER, lowerMaxCrossoverHz: 4000 }).divisorTable.length).toBeGreaterThan(0);
  });
});

/* ==================================================================== *
 * 4 — the divisor: measured replaces interpolated, and the table
 * ==================================================================== */
describe('U-4 — the breakup divisor, measured', () => {
  it('a measured divisor sets the ceiling and takes the UNCALIBRATED marking with it', () => {
    const w = crossoverWindow({ ...PAPER, lowerBreakupDivisor: 2, lowerBreakupDivisorSource: '10-09-2026, H3 silent' });
    const b = w.limits.find((l) => l.rule === 'breakup')!;
    expect(b.hz).toBe(3000);
    expect(b.uncalibrated).toBeUndefined();
    expect(b.source).toContain('MEASURED (10-09-2026, H3 silent)');
    // …and without it, the same pair is marked and divides by the ramp.
    const bare = breakupOf(PAPER)!;
    expect(bare.hz).toBeCloseTo(2400, 9);
    expect(bare.uncalibrated).toContain('uncalibrated');
    expect(bare.uncalibrated).toContain(breakupDivisorProtocolFor(6000));
  });

  it('the protocol has ONE home, and the register row beside the field reads it', () => {
    const row = V2_INPUT_REGISTER.find((r) => r.id === 'breakupDivisor');
    expect(row).toBeDefined();
    expect(row!.emptyMeans).toContain(BREAKUP_DIVISOR_PROTOCOL);
    /* The rendered form names this driver's own two tones, and the orders in
     * it are the two published endpoints read as harmonics. */
    const p = breakupDivisorProtocolFor(6000);
    expect(p).toContain('3000 Hz');
    expect(p).toContain('2000 Hz');
    expect(p).toContain(`the divisor is ${BREAKUP_DIV_SEVERE.toFixed(0)}.0`);
    expect(p).toContain(`silent means ${BREAKUP_DIV_MILD.toFixed(0)}.0`);
  });

  /* THE TABLE, ON THE REAL PAIR AND THE REAL NUMBERS. This is what the brief
   * asked to be visible before anyone measures: 2851/0.37/3 against 2308/0.07/1
   * in its words, and 2844.2/0.371/3 against 2304.0/0.067/1 as measured. */
  it('the table prints what each divisor would leave, in positions the generator would lay', () => {
    const rows = crossoverWindow(CASUS1B).divisorTable;
    expect(rows.map((r) => Number(r.divisor.toFixed(4)))).toEqual([2, 2.4667, 3]);

    const mild = rows[0];
    expect(mild.ceilingHz).toBe(5688 / BREAKUP_DIV_MILD);
    expect(mild.spanOctaves).toBeCloseTo(0.370, 3);
    expect(mild.positions).toBe(3);
    expect(mild.inUse).toBe(false);
    expect(mild.label).toContain('published endpoint, mild');

    const ramp = rows[1];
    expect(ramp.ceilingHz).toBeCloseTo(2305.9, 1);
    expect(ramp.spanOctaves).toBeCloseTo(0.068, 3);
    expect(ramp.positions).toBe(1);
    expect(ramp.inUse).toBe(true);
    expect(ramp.label).toContain('UNCALIBRATED');

    /* The severe endpoint puts the ceiling UNDER the floor: on this pair the
     * ramp is not a detail, it is the difference between three candidates and
     * none at all. */
    const severe = rows[2];
    expect(severe.ceilingHz).toBeCloseTo(1896.0, 1);
    expect(severe.positions).toBe(0);
    expect(severe.ceilingHz).toBeLessThan(crossoverWindow(CASUS1B).floorHz!);
  });

  it('the counts are the GENERATOR’s own rule and not a second one written here', () => {
    const rows = crossoverWindow(CASUS1B).divisorTable;
    for (const r of rows) {
      if (r.spanOctaves === null) continue;
      const expected = r.spanOctaves > 0 ? derivedPositionCount(r.spanOctaves, WINDOW_SMOOTHING_OCTAVES) : 0;
      expect(r.positions, `divisor ${r.divisor}`).toBe(expected);
    }
  });

  it('a measured divisor joins the table, in use, and the ramp row stays beside it', () => {
    const rows = crossoverWindow({ ...CASUS1B, lowerBreakupDivisor: 2.2, lowerBreakupDivisorSource: 'H3 at −68 dB' }).divisorTable;
    const used = rows.filter((r) => r.inUse);
    expect(used).toHaveLength(1);
    expect(used[0].divisor).toBe(2.2);
    expect(used[0].label).toContain('MEASURED (H3 at −68 dB)');
    expect(rows.map((r) => Number(r.divisor.toFixed(4)))).toEqual([2, 2.2, 2.4667, 3]);
  });

  it('the window says the divisor is a ramp, and what the endpoints would hold instead', () => {
    const t = crossoverWindow(CASUS1B).tensions.find((x) => x.startsWith('The breakup divisor is the ramp'));
    expect(t).toBeDefined();
    expect(t).toContain('holds 1 position(s)');
    expect(t).toContain('it would hold 3');
    expect(t).toContain(BREAKUP_DIVISOR_PROTOCOL);
    /* And it stops saying it once the divisor is a measurement. */
    expect(
      crossoverWindow({ ...CASUS1B, lowerBreakupDivisor: 2.2 }).tensions.some((x) =>
        x.startsWith('The breakup divisor is the ramp'),
      ),
    ).toBe(false);
  });
});

/* ==================================================================== *
 * 5 — casus 1: what the sheets actually say, and that nothing moved
 * ==================================================================== */
describe('U-4 — the datasheets, read', () => {
  const golden = loadGolden();
  const kaart = (golden.manifest_en_geometrie as unknown as {
    driverkaart: Record<string, { aanbevolen_kruisband?: Record<string, unknown> }>;
  }).driverkaart;

  /* THE FINDING OF THE SESSION, and it is the opposite of what was expected.
   * The brief predicted SB would state a top above the 2308 Hz the derivation
   * gives, so the new rule would be exercised and bind nothing. The sheet
   * (REV. 0, 09.02.2024, "Preliminary Data") states no recommended range at
   * all — no top, no bottom, no recommended crossover. Measured, not guessed. */
  it('the MR13TX-4 sheet states NO recommended range, so the M-T ceiling is still the ramp', () => {
    const mid = kaart.mid.aanbevolen_kruisband!;
    expect(mid.bovengrens_hz).toBeNull();
    expect(mid.ondergrens_hz).toBeNull();
    expect(String(mid.bevinding)).toContain('HET BLAD NOEMT GEEN AANBEVOLEN FREQUENTIEBEREIK');
    expect(String(mid.bron)).toContain('MR13TX-4');
    // …so nothing is fed for the mid, and the mid is the pair's lower driver.
    expect(casus1MaxCrossovers(golden).mid).toBeUndefined();
  });

  it('the T25T-6 sheet states both ends, and its top is read and binds nothing here', () => {
    const tw = kaart.tweeter.aanbevolen_kruisband!;
    expect(tw.letterlijk).toBe('Recommended frequency range 2.2kHz - 30kHz');
    expect(tw.bovengrens_hz).toBe(30000);
    expect(tw.ondergrens_hz).toBe(2200);
    /* The top IS fed — that is what makes "it binds nothing" a measurement
     * rather than an absence — and the tweeter is nobody's lower driver. */
    expect(casus1MaxCrossovers(golden).tweeter?.hz).toBe(30000);
    expect(CASUS1_WINDOW_SETTINGS.driverMaxCrossoverByDriver?.tweeter?.hz).toBe(30000);
  });

  it('nothing is overruled and no divisor is measured, on any way', () => {
    for (const way of Object.keys(kaart)) {
      const b = kaart[way]?.aanbevolen_kruisband;
      if (!b) continue;
      expect(b.overrule_breakup, way).toBe(false);
    }
    expect(casus1BreakupDivisors(golden)).toEqual({});
    expect(CASUS1_WINDOW_SETTINGS.driverBreakupDivisorByDriver).toBeUndefined();
    /* Which is why U-4 needs no regeneration: every window input the corpus was
     * generated from is unchanged. The golden window references are the proof
     * beside this one — they reproduce, and they are not touched here. */
    for (const [driver, v] of Object.entries(casus1MaxCrossovers(golden))) {
      expect(v.overridesBreakup, driver).toBeUndefined();
    }
  });
});

/* ==================================================================== *
 * 6 — it reaches the window from the card the designer fills in
 * ==================================================================== */
describe('U-4 — the app hands it over', () => {
  it('the register carries all three rows, each where its rule puts it', () => {
    const max = V2_INPUT_REGISTER.find((r) => r.id === 'maxCrossover')!;
    expect(max.source).toBe('datasheet');
    expect(placementOf(max)).toBe('always');

    const ovr = V2_INPUT_REGISTER.find((r) => r.id === 'maxCrossoverOverride')!;
    expect(ovr.source).toBe('choice');
    expect(placementOf(ovr)).toBe('conditional');
    expect(ovr.condition).toContain('maximum crossover');

    const div = V2_INPUT_REGISTER.find((r) => r.id === 'breakupDivisor')!;
    expect(div.source).toBe('measurement');
    expect(placementOf(div)).toBe('more');

    const controls = V2_FORM_FIELDS.filter((f) =>
      ['maxCrossover', 'maxCrossoverOverride', 'breakupDivisor'].includes(f.row),
    ).map((f) => f.control);
    expect(controls.sort()).toEqual(
      [
        "checked={v2Meas[role].maxCrossoverOverride === 'yes'}",
        'value={v2Meas[role].breakupDivisor}',
        'value={v2Meas[role].breakupDivisorNote}',
        'value={v2Meas[role].maxCrossoverHz}',
      ].sort(),
    );
  });

  /* THE UI-1 IDIOM: a function test cannot say whether the app CALLS this. */
  it('App.tsx builds both branch fields from the card and hands them to the adapter', () => {
    expect(APP).toContain('const maxCrossoverByRole');
    expect(APP).toContain('const breakupDivisorByRole');
    expect(APP).toContain('maxCrossover: maxCrossoverByRole[role]');
    expect(APP).toContain('breakupDivisor: breakupDivisorByRole[role]');
  });

  it('the Hz travels ALONE, and the overrule only ever rides with it', () => {
    const at = APP.indexOf('const maxCrossoverByRole');
    const block = APP.slice(at, at + 900);
    expect(block).toContain("m.maxCrossoverHz.trim() === ''");
    /* The overrule is read INSIDE the block a stated ceiling opens, so it can
     * never travel on its own — the shape the window relies on. */
    expect(block).toContain("m.maxCrossoverOverride === 'yes' ? { overridesBreakup: true } : {}");
  });

  it('the divisor’s note is free text and not a stamped date, and the reason is written down', () => {
    const at = APP.indexOf('const breakupDivisorByRole');
    /* Backwards over the doc comment too: the reason lives above the memo. */
    const block = APP.slice(Math.max(0, at - 900), at + 900);
    expect(block).toContain('free text rather than a date field');
    expect(block).toContain('breakupDivisorNote');
  });
});
