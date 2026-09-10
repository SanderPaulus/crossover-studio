/**
 * U-3e — THE WINDOW IS SHOWN WHERE THE RUN IS STARTED, AND IT IS THE SAME
 * WINDOW.
 *
 * WHAT THIS EPISODE COST. Sander watched a two-way propose handovers from
 * 1372 Hz and could not tell why. The answer was in the app the whole time —
 * `crossoverWindow` returns every limit with its rule and a sentence, and
 * `EngineV2Panel` prints all of it under "Pre-design — feasible crossover
 * windows" — but that panel is at the bottom of the analysis pane and the
 * decision is made at the Optimize button. It took two days and a hand
 * calculation to establish that the floor was k·f_s, i.e. a CONVENTION, and
 * that nothing had been stated or derived about the tweeter's drive limit.
 *
 * So U-3e adds no computation and no number. It renders `predesign.windows`
 * beside the button, and it says when the binding floor is the convention.
 * These claims pin both halves: the RULE (which floor counts as a convention,
 * and what it is worth in dB) and the PLACE (the app reads the report rather
 * than deriving a second window).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crossoverWindow } from './xoWindow.ts';
import { XO_FS_FACTOR_BY_ORDER, DB_PER_OCTAVE_PER_ORDER } from '../constants.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

/** Casus 1b's tweeter, the way the report hands it to the window. */
const BASE = {
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

describe('U-3e — which floor is a convention, and what it is worth', () => {
  /* THE MEASUREMENT THAT MADE THIS WORTH SAYING OUT LOUD. `XO_FS_FACTOR_BY_ORDER`
   * reads as a geometry rule ("1.4 × f_s at order 4"), and in the unit the
   * drive floors use it is a nearly CONSTANT attenuation of about 12 dB at
   * every order — where the figure this casebook itself states is 18 + 2. The
   * app was therefore never choosing between "assume nothing" and "state
   * something"; it was choosing the looser of two conventions, silently. */
  it('k·f_s is an attenuation convention of roughly 12 dB at every order', () => {
    const dbOf = (order: number) =>
      DB_PER_OCTAVE_PER_ORDER * order * Math.log2(XO_FS_FACTOR_BY_ORDER[order]);
    const all = [1, 2, 3, 4].map(dbOf);
    for (const db of all) {
      expect(db).toBeGreaterThan(9);
      expect(db).toBeLessThan(13);
    }
    // …and it is materially looser than the stated figure this project uses.
    for (const db of all) expect(db).toBeLessThan(18);
  });

  it('with nothing stated or derived, the fs convention binds — and it is named', () => {
    const w = crossoverWindow({ ...BASE, upperDriveCeilingDb: null, upperStatedDriveLimitDb: null });
    expect(w.floorBy?.rule).toBe('fs');
    expect(w.floorHz).toBeCloseTo(XO_FS_FACTOR_BY_ORDER[4] * BASE.upperFsHz, 6);
  });

  it('a STATED figure takes the floor off the convention, and the rule says which', () => {
    const w = crossoverWindow({ ...BASE, upperDriveCeilingDb: null, upperStatedDriveLimitDb: -20 });
    expect(w.floorBy?.rule).toBe('drive-stated');
    expect(w.floorHz).toBeCloseTo(BASE.upperFsHz * 2 ** (20 / (DB_PER_OCTAVE_PER_ORDER * 4)), 6);
  });

  /* THE HALF THAT EXPLAINS THE WHOLE EPISODE. On THIS driver the derived
   * excursion ceiling does NOT take the floor off the convention: a 25 mm dome
   * with X_max 1 mm is not excursion-limited near its resonance, so the
   * derived floor lands below k·f_s and the convention still binds. Filling in
   * Bl, M_ms and X_max therefore changed nothing about the window — which is
   * exactly what Sander measured, and why the stated figure is not redundant. */
  it('the DERIVED ceiling does not always beat the convention — on a dome it does not', () => {
    const w = crossoverWindow({ ...BASE, upperDriveCeilingDb: -8.58, upperStatedDriveLimitDb: null });
    expect(w.floorBy?.rule).toBe('fs');
    const derived = w.limits.find((l) => l.rule === 'drive');
    expect(derived).toBeDefined();
    expect(derived!.hz).toBeLessThan(w.floorHz!);
  });
});

describe('U-3e — the app shows it where the run is started', () => {
  it('the strip reads the report’s own windows and derives no second one', () => {
    expect(APP).toContain('const v2WindowLines');
    expect(APP).toContain("engineV2Report?.report?.predesign.windows");
    /* NO SECOND DERIVATION: the strip may not call the window builder itself.
     * Two answers to "where may this handover sit" is the family of bug A3g. */
    const memo = APP.slice(APP.indexOf('const v2WindowLines'), APP.indexOf('const v2WindowLines') + 1600);
    expect(memo).not.toContain('crossoverWindow(');
    expect(memo).not.toContain('XO_FS_FACTOR_BY_ORDER');
  });

  it('it is rendered beside the Optimize button, and it names the convention', () => {
    expect(APP).toContain('className="v2-window-strip"');
    expect(APP).toContain('v2WindowLines.map(');
    /* The strip sits in the same tool group as the button that starts the run.
     * Anchored on the group's own label rather than on the button text — that
     * text appears in the wizard too, and slicing around the first match would
     * check the wrong screen. */
    const at = APP.indexOf('<span className="tool-group-label">{t(\'Design\')}</span>');
    expect(at, 'the Design tool group').toBeGreaterThan(-1);
    const group = APP.slice(at, at + 4000);
    expect(group).toContain('v2-window-strip');
    expect(group).toContain("t('Optimize — design for me')");
    expect(group).toContain('void runVfOptimize()');
    // …and the sentence that would have answered it says what to do about it.
    expect(APP).toContain('a convention, not a measurement');
    expect(APP).toContain('Max drive on f_s');
  });

  it('the full list of limits stays in the Engine v2 panel — one home, two readers', () => {
    const panel = readFileSync(join(ROOT, 'src', 'components', 'EngineV2Panel.tsx'), 'utf-8');
    expect(panel).toContain('Pre-design — feasible crossover windows');
    expect(panel).toContain('w.limits.map(');
    expect(panel).toContain('· binding');
  });
});
