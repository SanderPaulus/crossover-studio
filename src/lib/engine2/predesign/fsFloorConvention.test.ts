/**
 * 07-11-2026 — THE k·f_s FLOOR FOLLOWS THE 18 dB TRADE RULE BY DEFAULT; the
 * casus fixtures are pinned to the A5d.3 table their corpora were generated on.
 */
import { describe, it, expect } from 'vitest';
import { crossoverWindow, fsConventionDbRange, fsFloorFactor, type XoWindowInput } from './xoWindow.ts';
import { DB_PER_OCTAVE_PER_ORDER, FS_FLOOR_TRADE_RULE_DB, XO_FS_FACTOR_BY_ORDER } from '../constants.ts';
import { casus1Manifest, loadGolden } from '../casus1.fixture.ts';
import { casus1bManifest } from '../casus1b.fixture.ts';
import { casus2Manifest } from '../casus2.fixture.ts';

const BASE: XoWindowInput = {
  lower: 'L', upper: 'U', order: 4, validityFloorHz: null, validityFloorSource: 'none', upperFsHz: 1000,
  lowerBreakups: [], significantBreakupDb: 3, lowerMinus6Hz: null, lowerMinus6AngleDeg: null, spacingMm: null,
} as unknown as XoWindowInput;

describe('k·f_s floor convention', () => {
  it('the trade rule puts the upper driver exactly 18 dB down at f_s on the asymptotic flank, at every order', () => {
    for (const order of [1, 2, 3, 4]) {
      const k = fsFloorFactor(order)!;
      expect(DB_PER_OCTAVE_PER_ORDER * order * Math.log2(k)).toBeCloseTo(FS_FLOOR_TRADE_RULE_DB, 9);
    }
    expect(fsConventionDbRange('trade-rule').minDb).toBeCloseTo(18, 9);
  });

  it('absent = the trade rule; `k-table` = the old table; the trade rule is never looser', () => {
    for (const order of [1, 2, 3, 4]) {
      const absent = crossoverWindow({ ...BASE, order }).floorHz!;
      const table = crossoverWindow({ ...BASE, order, fsFloorConvention: 'k-table' }).floorHz!;
      expect(absent).toBeCloseTo(fsFloorFactor(order)! * 1000, 6);
      expect(table).toBeCloseTo(XO_FS_FACTOR_BY_ORDER[order] * 1000, 6);
      expect(absent).toBeGreaterThan(table);
    }
  });

  it('every casus manifest states the k-table, so recorded windows and corpora stay as generated', () => {
    const g = loadGolden();
    expect(casus1Manifest(g).fsFloorConvention).toBe('k-table');
    expect(casus1bManifest().fsFloorConvention).toBe('k-table');
    expect(casus2Manifest().fsFloorConvention).toBe('k-table');
  });
});
