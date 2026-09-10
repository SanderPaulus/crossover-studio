/**
 * U-3g — THE MANUFACTURER'S RECOMMENDED MINIMUM CROSSOVER AS A WINDOW FLOOR.
 *
 * WHERE IT COMES FROM. U-3e established that the floor a two-way was actually
 * running on was `k·f_s` — a CONVENTION worth about 12 dB at every order,
 * looser than the 18 + 2 this casebook states for itself — and that filling in
 * X_max, Bl and M_ms moved it not one hertz, because a 25 mm dome is not
 * excursion-bound near its resonance. U-3f then measured the thermal answer
 * and found 5.6× of margin: heat is not what makes a low handover unwise on
 * this driver either. What is left is distortion, and the app has no data for
 * it — but the MANUFACTURER does, and prints its conclusion as one line:
 * "Recommended frequency range 2.2kHz - 30kHz".
 *
 * THE DECISION THIS FILE PINS, and it is the only interesting one. Every other
 * stated floor in this module is an ATTENUATION at f_s, so it inverts through
 * A5d.3(ii) and moves with the order: a steeper flank genuinely delivers the
 * same attenuation lower down. A recommended minimum crossover is not that
 * kind of statement. It bundles excursion, coil heat, distortion, directivity
 * and breakup, and only the first follows the flank's slope at f_s. Inverting
 * it would let LR4 cross at 1426 Hz on a sheet that says 2200 — the right
 * number, off the right sheet, about the wrong thing (A3h).
 *
 * So: VERBATIM in the safe direction, INVERTED only upward. A steeper flank
 * never buys a lower handover; a shallower one than the sheet's own condition
 * costs a higher one. Both halves are claimed below, with the counter-proof
 * that the rejected reading really would have produced 1426 Hz.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossoverWindow } from './xoWindow.ts';
import type { XoWindowInput } from './xoWindow.ts';
import { DB_PER_OCTAVE_PER_ORDER, XO_FS_FACTOR_BY_ORDER } from '../constants.ts';
import { V2_INPUT_REGISTER, V2_FORM_FIELDS, placementOf } from '../../v2InputRegister.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

/**
 * A PAPER PAIR with round numbers, so every floor below is one line of
 * arithmetic a reader can check without running anything: f_s = 1000 Hz and a
 * recommended 4000 Hz at 2nd order is exactly 24 dB at the resonance
 * (12 dB/oct × 2 octaves), and 24 dB at 1st order is exactly 4 octaves.
 */
const PAPER: XoWindowInput = {
  lower: 'mid',
  upper: 'tweeter',
  order: 4,
  validityFloorHz: null,
  validityFloorSource: 'none',
  upperFsHz: 1000,
  lowerBreakups: [],
  lowerMinus6Hz: null,
  lowerMinus6AngleDeg: null,
  spacingMm: null,
};

/** Casus 1b's tweeter, exactly as `windowReadout.test.ts` hands it over. */
const BLIESMA: XoWindowInput = {
  lower: 'mid',
  upper: 'tweeter',
  order: 4,
  validityFloorHz: 396.7,
  validityFloorSource: 'tweeter far field',
  upperFsHz: 924.31640625,
  lowerBreakups: [{ fHz: 5688, dB: 2.8 }],
  lowerMinus6Hz: 5388,
  lowerMinus6AngleDeg: 30,
  spacingMm: 129.2,
};

const floorOf = (i: XoWindowInput) => crossoverWindow(i).limits.find((l) => l.rule === 'stated-min') ?? null;

/* ==================================================================== *
 * 1 — the arithmetic, by hand
 * ==================================================================== */
describe('U-3g — the floor, on numbers a reader can check', () => {
  it('a steeper flank than the sheet stated keeps the floor VERBATIM', () => {
    const l = floorOf({ ...PAPER, order: 4, upperMinCrossoverHz: 4000, upperMinCrossoverOrder: 2 });
    expect(l).not.toBeNull();
    expect(l!.hz).toBe(4000);
    expect(l!.source).toContain('verbatim');
  });

  it('the SAME order as the sheet keeps it verbatim too — the correction is one-sided', () => {
    expect(floorOf({ ...PAPER, order: 2, upperMinCrossoverHz: 4000, upperMinCrossoverOrder: 2 })!.hz).toBe(4000);
  });

  it('a SHALLOWER flank raises it to where that order holds the same dB at f_s', () => {
    /* 4000 Hz at 2nd order is 24 dB down at 1000 Hz; 24 dB at 1st order takes
     * four octaves, so 1000 × 2^4 = 16 000 Hz. Exact, on purpose. */
    const l = floorOf({ ...PAPER, order: 1, upperMinCrossoverHz: 4000, upperMinCrossoverOrder: 2 });
    expect(l!.hz).toBeCloseTo(16000, 6);
    expect(l!.source).toContain('RAISED');
    expect(l!.source).toContain('24.0 dB');
  });

  it('with NO order stated the frequency still stands, and nothing is claimed about slope', () => {
    const l = floorOf({ ...PAPER, order: 1, upperMinCrossoverHz: 4000 });
    expect(l!.hz).toBe(4000);
    expect(l!.source).toContain('no order stated');
    expect(l!.source).not.toContain('RAISED');
  });

  it('a recommendation BELOW the resonance says nothing about attenuation, and is taken as it is', () => {
    /* log2(500/1000) is negative: there is no attenuation to demand and no
     * inversion to make. The floor is the frequency and nothing more. */
    const l = floorOf({ ...PAPER, order: 1, upperMinCrossoverHz: 500, upperMinCrossoverOrder: 2 });
    expect(l!.hz).toBe(500);
    expect(l!.source).not.toContain('RAISED');
  });
});

/* ==================================================================== *
 * 2 — P4: absent is absent, and a half-stated figure is not a floor
 * ==================================================================== */
describe('U-3g — absent changes nothing (P4/P2)', () => {
  it('no field, a null and a zero all leave the window byte-identical', () => {
    const bare = JSON.stringify(crossoverWindow(BLIESMA));
    for (const v of [null, 0, -1, Number.NaN]) {
      expect(JSON.stringify(crossoverWindow({ ...BLIESMA, upperMinCrossoverHz: v })), String(v)).toBe(bare);
    }
    /* An ORDER without a frequency is not a statement about anything. */
    expect(JSON.stringify(crossoverWindow({ ...BLIESMA, upperMinCrossoverOrder: 2 }))).toBe(bare);
  });

  it('with it absent the fs CONVENTION still binds on this dome — the U-3e finding, unchanged', () => {
    const w = crossoverWindow(BLIESMA);
    expect(w.floorBy?.rule).toBe('fs');
    expect(w.floorHz).toBeCloseTo(XO_FS_FACTOR_BY_ORDER[4] * BLIESMA.upperFsHz!, 6);
  });
});

/* ==================================================================== *
 * 3 — the real driver, and the reading that was rejected
 * ==================================================================== */
describe('U-3g — the BlieSMa T25T-6, and why the inverting reading was refused', () => {
  const STATED = { upperMinCrossoverHz: 2200, upperMinCrossoverOrder: 2 };

  it('the sheet takes the floor off the convention, and floorBy says so', () => {
    const w = crossoverWindow({ ...BLIESMA, ...STATED });
    expect(w.floorBy?.rule).toBe('stated-min');
    expect(w.floorHz).toBe(2200);
    /* And it beats everything the measurements imply, convention included. */
    for (const l of w.limits.filter((x) => x.side === 'floor' && x.rule !== 'stated-min')) {
      expect(l.hz, l.rule).toBeLessThan(2200);
    }
  });

  /* THE COUNTER-PROOF. Without it, "verbatim" and "inverted" are the same
   * claim on a driver where they happen to agree — and here they do not: the
   * rejected reading lands 774 Hz lower, below the recommendation and below
   * the figure Sander had been typing by hand. */
  it('reading it as an f_s attenuation WOULD have produced 1426 Hz at LR4', () => {
    const fs = BLIESMA.upperFsHz!;
    const demanded = DB_PER_OCTAVE_PER_ORDER * 2 * Math.log2(2200 / fs);
    expect(demanded).toBeCloseTo(15.0, 1);
    const inverted = fs * 2 ** (demanded / (DB_PER_OCTAVE_PER_ORDER * 4));
    expect(Math.round(inverted)).toBe(1426);
    // …and that is NOT what the window does with it.
    expect(crossoverWindow({ ...BLIESMA, ...STATED }).floorHz).toBe(2200);
    expect(inverted).toBeLessThan(2200);
  });

  it('the window says where the sheet landed against the measurements', () => {
    const w = crossoverWindow({ ...BLIESMA, ...STATED });
    const t = w.tensions.find((x) => x.includes("datasheet's minimum crossover"));
    expect(t).toBeDefined();
    expect(t).toContain('STRICTER');
    expect(t).toContain('a convention, not a measurement');
  });

  it('the window is not emptied by it — 2200 Hz still clears the mid’s breakup ceiling', () => {
    const w = crossoverWindow({ ...BLIESMA, ...STATED });
    expect(w.empty).toBe(false);
    expect(w.ceilingHz).toBeGreaterThan(2200);
  });
});

/* ==================================================================== *
 * 4 — it reaches the window from the card the designer fills in
 * ==================================================================== */
describe('U-3g — the app hands it over', () => {
  it('the register carries the row, in the default view, as datasheet data', () => {
    const row = V2_INPUT_REGISTER.find((r) => r.id === 'minCrossover');
    expect(row).toBeDefined();
    expect(row!.source).toBe('datasheet');
    expect(placementOf(row!)).toBe('always');
    const controls = V2_FORM_FIELDS.filter((f) => f.row === 'minCrossover').map((f) => f.control);
    expect(controls.sort()).toEqual(
      ['value={v2Meas[role].minCrossoverHz}', 'value={v2Meas[role].minCrossoverOrder}'].sort(),
    );
  });

  /* THE UI-1 IDIOM: a function test cannot say whether the app CALLS this, and
   * that is exactly the failure this project has paid for twice. */
  it('App.tsx builds the branch field from the card and hands it to the adapter', () => {
    expect(APP).toContain('const minCrossoverByRole');
    expect(APP).toContain("v2Meas[role].minCrossoverHz");
    expect(APP).toContain('minCrossover: minCrossoverByRole[role]');
  });

  it('the Hz travels ALONE — a missing order does not withhold the floor', () => {
    /* The power rating is all-or-nothing because a rated power without its
     * filter limits nothing; this is not, because a recommended range without
     * a slope is still a complete statement. The memo has to say so. */
    const at = APP.indexOf('const minCrossoverByRole');
    const block = APP.slice(at, at + 900);
    expect(block).toContain("m.minCrossoverHz.trim() === ''");
    expect(block).not.toContain("m.minCrossoverOrder.trim() === '') continue");
  });
});
