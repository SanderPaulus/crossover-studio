import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLim } from './parsers/lim.ts';
import {
  LOAD_RATIO_TOL_DB,
  LOAD_RATIO_TOL_DEG,
  PORT_END_CORRECTION_DIAMETERS,
  convertLowEnd,
  impedanceSaddleHz,
  loadValidity,
  logGrid,
  ratioLimit,
  sameLoad,
  sessionBaffle,
  systemResonance,
  tsModelRatio,
  type BoxSpec,
  type ModelRatio,
} from './measuredObject.ts';
import { casus1M2ModelRatio, REAL_VOLUME_L, TEST_VOLUME_L } from './engine2/koan2026_09.fixture.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const db = (r: { re: number; im: number }) => 10 * Math.log10(r.re * r.re + r.im * r.im);
const deg = (r: { re: number; im: number }) => (Math.atan2(r.im, r.re) * 180) / Math.PI;

describe('system resonance per load, by hand', () => {
  it('sealed: f_c = f_s·√(1 + N·V_as/V_b) — 30 Hz, 2 × 30 L in 20 L is 30·√4 = 60 Hz', () => {
    const r = systemResonance({ netVolumeL: 20, load: { kind: 'sealed' } }, { fsHz: 30, vasL: 30, count: 2 });
    expect(r.resonance!.hz).toBeCloseTo(60, 9);
  });
  it('sealed without T/S: no resonance, the missing input named (P4)', () => {
    const r = systemResonance({ netVolumeL: 20, load: { kind: 'sealed' } }, null);
    expect(r.resonance).toBeNull();
    expect(r.missing).toMatch(/f_s, V_as/);
  });
  it('vented from geometry: Helmholtz with the stated end correction', () => {
    const r = systemResonance({ netVolumeL: 50, load: { kind: 'vented', port: { kind: 'geometry', areaCm2: 50, lengthMm: 200 } } }, null);
    const s = 50e-4;
    const leff = 0.2 + PORT_END_CORRECTION_DIAMETERS * 2 * Math.sqrt(s / Math.PI);
    expect(r.resonance!.hz).toBeCloseTo((343 / (2 * Math.PI)) * Math.sqrt(s / (0.05 * leff)), 9);
  });
  it("vented, the other box's port in another volume: f_b ∝ 1/√V", () => {
    const other: BoxSpec = { netVolumeL: 40, load: { kind: 'vented', port: { kind: 'measured', fbHz: 40, source: 'test' } } };
    const r = systemResonance({ netVolumeL: 160, load: { kind: 'vented', port: { kind: 'same-as-other' } } }, null, { box: other, resonance: { hz: 40, how: '' } });
    expect(r.resonance!.hz).toBeCloseTo(20, 9);
  });
  it('passive radiator: √((k_box + 1/C_ms)/M_mp)/2π', () => {
    const r = systemResonance({ netVolumeL: 30, load: { kind: 'passive', mmpG: 100, sdCm2: 200, cmsMmPerN: 1 } }, null);
    const k = (1.2041 * 343 ** 2 * 0.02 ** 2) / 0.03 + 1000;
    expect(r.resonance!.hz).toBeCloseTo(Math.sqrt(k / 0.1) / (2 * Math.PI), 9);
  });
});

describe('the limit is read from the model ratio, in level AND phase (Sander, 13-11-2026)', () => {
  it('by hand: R = 1 + j·c·f0/f stays within 5° from f = c·f0/tan 5°', () => {
    const c = 0.2;
    const f0 = 50;
    const R: ModelRatio = (f) => ({ re: 1, im: (c * f0) / f });
    const grid = logGrid(5, 2000, 480);
    const L = ratioLimit(R, grid, 99, 5);
    const exact = (c * f0) / Math.tan((5 * Math.PI) / 180);
    expect(L.fromHz!).toBeGreaterThanOrEqual(exact);
    expect(L.fromHz! / exact).toBeLessThan(2 ** (1 / 480) + 1e-9);
    // and the level tolerance binds on its own when the phase is generous
    const Rl: ModelRatio = (f) => ({ re: 1 + (c * f0) / f, im: 0 });
    const Ll = ratioLimit(Rl, grid, 0.2, 99);
    expect(db(Rl(Ll.fromHz!))).toBeLessThanOrEqual(0.2);
    expect(db(Rl(Ll.worstBelow!.freqHz))).toBeGreaterThan(0.2);
  });
  it('the tolerances are the stated conventions, and overridable', () => {
    expect([LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG]).toEqual([0.2, 5]);
    const R: ModelRatio = (f) => ({ re: 1, im: 10 / f });
    expect(ratioLimit(R, logGrid(5, 2000, 48), 0.2, 10).fromHz!).toBeLessThan(ratioLimit(R, logGrid(5, 2000, 48), 0.2, 5).fromHz!);
  });
  it('T/S models: identical boxes are a ratio of exactly 1; both tend to 1 far above resonance', () => {
    const ts = { fsHz: 30, vasL: 60, count: 1, qts: 0.4 };
    const v: BoxSpec = { netVolumeL: 50, load: { kind: 'vented', port: { kind: 'measured', fbHz: 32, source: 's', qL: 7 } } };
    const same = tsModelRatio(v, { ...v }, ts).ratio!;
    expect(same(45)).toEqual({ re: 1, im: 0 });
    const s1 = tsModelRatio({ netVolumeL: 60, load: { kind: 'sealed' } }, { netVolumeL: 20, load: { kind: 'sealed' } }, ts).ratio!;
    expect(Math.abs(db(s1(5000)))).toBeLessThan(1e-3);
    expect(Math.abs(deg(s1(5000)))).toBeLessThan(0.1);
  });
  it('a smaller box measures more phase error than a near one (the reason phase counts)', () => {
    const ts = { fsHz: 25, vasL: 100, count: 2, qts: 0.38 };
    const target: BoxSpec = { netVolumeL: 68, load: { kind: 'vented', port: { kind: 'measured', fbHz: 28, source: 's', qL: 3 } } };
    const near: BoxSpec = { netVolumeL: 53, load: { kind: 'vented', port: { kind: 'measured', fbHz: 31, source: 's', qL: 3 } } };
    const small: BoxSpec = { netVolumeL: 20, load: { kind: 'vented', port: { kind: 'measured', fbHz: 45, source: 's', qL: 3 } } };
    const rn = tsModelRatio(target, near, ts).ratio!;
    const rs = tsModelRatio(target, small, ts).ratio!;
    expect(Math.abs(deg(rs(90)))).toBeGreaterThan(Math.abs(deg(rn(62))));
    expect(ratioLimit(rs, logGrid(5, 2000, 48)).fromHz!).toBeGreaterThan(ratioLimit(rn, logGrid(5, 2000, 48)).fromHz!);
  });
  it('missing inputs are named, never defaulted: Q_ts, Q_l, a passive-radiator model', () => {
    const v = (qL?: number): BoxSpec => ({ netVolumeL: 50, load: { kind: 'vented', port: { kind: 'measured', fbHz: 32, source: 's', ...(qL ? { qL } : {}) } } });
    expect(tsModelRatio(v(7), v(5), { fsHz: 30, vasL: 60, count: 1 }).missing).toMatch(/Q_ts/);
    expect(tsModelRatio(v(7), v(), { fsHz: 30, vasL: 60, count: 1, qts: 0.4 }).missing).toMatch(/measured object: Q_l/);
    expect(
      tsModelRatio(v(7), { netVolumeL: 30, load: { kind: 'passive', mmpG: 100, sdCm2: 200, cmsMmPerN: 1 } }, { fsHz: 30, vasL: 60, count: 1, qts: 0.4 }).missing,
    ).toMatch(/passive-radiator/);
  });
});

describe('loadValidity and the two options below the limit', () => {
  const target: BoxSpec = { netVolumeL: 60, load: { kind: 'sealed' } };
  const ts = { fsHz: 30, vasL: 60, count: 1, qts: 0.4 };
  const other = (box: BoxSpec) => ({ session: 's', object: { kind: 'other' as const, label: 'testkast', baffle: 'identical' as const, box } });
  it('the target itself, or the same load: no limit', () => {
    expect(loadValidity({ target, ts, setup: { session: 's', object: { kind: 'target' } } }).fromHz).toBeNull();
    const same = loadValidity({ target, ts, setup: other({ ...target }) });
    expect(same.fromHz).toBeNull();
    expect(same.sameLoad).toBe(true);
    expect(sameLoad(target, { ...target })).toBe(true);
  });
  it('a different volume: the limit from the T/S ratio, said with the model and the worst point', () => {
    const v = loadValidity({ target, ts, setup: other({ netVolumeL: 20, load: { kind: 'sealed' } }) });
    expect(v.fromHz).not.toBeNull();
    expect(v.note).toMatch(/T\/S box models/);
    expect(v.note).toMatch(/±0.2 dB and ±5°/);
    const r = v.ratio!(v.fromHz!);
    expect(Math.abs(db(r))).toBeLessThanOrEqual(0.2);
    expect(Math.abs(deg(r))).toBeLessThanOrEqual(5);
  });
  it('an input missing: no limit, and the low end stays marked as measured object', () => {
    const v = loadValidity({ target, ts: null, setup: other({ netVolumeL: 20, load: { kind: 'sealed' } }) });
    expect(v.fromHz).toBeNull();
    expect(v.note).toMatch(/missing .*T\/S.*marked as measured object/);
  });
  it('convert: below the limit multiplied by the ratio, above it untouched', () => {
    const R: ModelRatio = () => ({ re: 2, im: 0 });
    const c = convertLowEnd([50, 100, 200], [80, 80, 80], [10, 10, 10], R, 100);
    expect(c.spl[0]).toBeCloseTo(80 + 20 * Math.log10(2), 9);
    expect(c.spl.slice(1)).toEqual([80, 80]);
    expect(c.phaseDeg).toEqual([10, 10, 10]);
  });
  it("baffle: identical → the optimizer's geometry; own → the session's", () => {
    expect(sessionBaffle({ kind: 'target' })).toEqual({ from: 'optimizer' });
    expect(sessionBaffle({ kind: 'other', label: 'x', baffle: 'identical', box: target })).toEqual({ from: 'optimizer' });
    expect(sessionBaffle({ kind: 'other', label: 'x', baffle: { widthMm: 300, heightMm: 500 }, box: target })).toEqual({
      from: 'session',
      baffle: { widthMm: 300, heightMm: 500 },
    });
  });
});

describe('casus 1 as one test case: the test box (identical baffle, other volume), with the M-2 models', () => {
  it('the August saddle is the test box tuning M-2 noted (31.3 Hz)', () => {
    const b = readFileSync(join(FIX, 'casus1', 'woofers_parallel__1_.lim'));
    const lim = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    expect(impedanceSaddleHz(lim.freq, lim.magnitude)!).toBeCloseTo(31.31, 1);
  });
  it('limit ~146 Hz: at 2 × f_b the ratio is still −0.85 dB / −9°; the LEVEL binds there, not the phase', () => {
    const m2 = casus1M2ModelRatio();
    const v = loadValidity({
      target: { netVolumeL: REAL_VOLUME_L, load: { kind: 'vented', port: { kind: 'same-as-other' } } },
      setup: {
        session: 'augustus',
        object: { kind: 'other', label: 'testkast', baffle: 'identical', box: { netVolumeL: TEST_VOLUME_L, load: { kind: 'vented', port: { kind: 'measured', fbHz: 31.31, source: 'saddle' } } } },
      },
      ratio: { fn: m2.ratio, model: m2.model },
      grid: logGrid(12, 2000, 48),
    });
    expect(v.fromHz!).toBeGreaterThan(140);
    expect(v.fromHz!).toBeLessThan(152);
    expect(db(m2.ratio(60))).toBeCloseTo(-0.85, 1);
    expect(deg(m2.ratio(60))).toBeCloseTo(-9, 0);
    expect(Math.abs(deg(m2.ratio(v.limit!.worstBelow!.freqHz)))).toBeLessThan(5);
    expect(Math.abs(db(m2.ratio(v.limit!.worstBelow!.freqHz)))).toBeGreaterThan(0.2);
  });
});
