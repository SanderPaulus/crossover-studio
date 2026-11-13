import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLim } from './parsers/lim.ts';
import {
  LOAD_VALIDITY_K,
  PORT_END_CORRECTION_DIAMETERS,
  impedanceSaddleHz,
  loadValidity,
  sameLoad,
  sessionBaffle,
  systemResonance,
  type BoxSpec,
} from './measuredObject.ts';
import { REAL_VOLUME_L, TEST_VOLUME_L } from './engine2/koan2026_09.fixture.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');

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
  it('vented, the other box\'s port in another volume: f_b ∝ 1/√V', () => {
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

describe('the validity limit for the target cabinet', () => {
  const target: BoxSpec = { netVolumeL: 60, load: { kind: 'sealed' } };
  const ts = { fsHz: 30, vasL: 60, count: 1 };
  it('the target itself, or the same load: no limit', () => {
    expect(loadValidity({ target, ts, setup: { session: 's', object: { kind: 'target' } } }).fromHz).toBeNull();
    const same = loadValidity({ target, ts, setup: { session: 's', object: { kind: 'other', label: 'kopie', baffle: 'identical', box: { ...target } } } });
    expect(same.fromHz).toBeNull();
    expect(sameLoad(target, { ...target })).toBe(true);
  });
  it('a different volume: k × the higher resonance, k visible and overridable', () => {
    const setup = { session: 's', object: { kind: 'other' as const, label: 'testkast', baffle: 'identical' as const, box: { netVolumeL: 20, load: { kind: 'sealed' as const } } } };
    const v = loadValidity({ target, ts, setup });
    // target 30·√2 = 42.43, test box 30·√4 = 60 → 2 × 60
    expect(v.measured!.hz).toBeCloseTo(60, 9);
    expect(v.fromHz).toBeCloseTo(LOAD_VALIDITY_K * 60, 9);
    expect(v.note).toMatch(/k is a convention/);
    expect(loadValidity({ target, ts, setup, k: 3 }).fromHz).toBeCloseTo(180, 9);
  });
  it('an input missing: no limit, and the low end stays marked as measured object', () => {
    const v = loadValidity({ target, ts: null, setup: { session: 's', object: { kind: 'other', label: 'x', baffle: 'identical', box: { netVolumeL: 20, load: { kind: 'sealed' } } } } });
    expect(v.fromHz).toBeNull();
    expect(v.note).toMatch(/missing .*f_s, V_as.*marked as measured object/);
  });
  it('baffle: identical → the optimizer\'s geometry; own → the session\'s', () => {
    expect(sessionBaffle({ kind: 'target' })).toEqual({ from: 'optimizer' });
    expect(sessionBaffle({ kind: 'other', label: 'x', baffle: 'identical', box: target })).toEqual({ from: 'optimizer' });
    expect(sessionBaffle({ kind: 'other', label: 'x', baffle: { widthMm: 300, heightMm: 500 }, box: target })).toEqual({ from: 'session', baffle: { widthMm: 300, heightMm: 500 } });
  });
});

describe('casus 1 as one test case: the test box (identical baffle, other volume), August session', () => {
  // f_b of the test box from the August parallel impedance; volumes from the M-2 fixture
  // (stated by Sander 12-09-2026); the target's port is the test box's port, unchanged.
  const b = readFileSync(join(FIX, 'casus1', 'woofers_parallel__1_.lim'));
  const lim = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const fb = impedanceSaddleHz(lim.freq, lim.magnitude)!;
  const target: BoxSpec = { netVolumeL: REAL_VOLUME_L, load: { kind: 'vented', port: { kind: 'same-as-other' } } };
  const v = loadValidity({
    target,
    setup: {
      session: 'augustus',
      object: { kind: 'other', label: 'testkast', baffle: 'identical', box: { netVolumeL: TEST_VOLUME_L, load: { kind: 'vented', port: { kind: 'measured', fbHz: fb, source: 'woofers_parallel__1_.lim, saddle' } } } },
    },
  });
  it('the saddle is the test box tuning M-2 noted for August (31.3 Hz)', () => {
    expect(fb).toBeCloseTo(31.31, 1);
  });
  it('target f_b = test f_b·√(53.2/67.7); limit = k × the test box f_b', () => {
    expect(v.target!.hz).toBeCloseTo(fb * Math.sqrt(TEST_VOLUME_L / REAL_VOLUME_L), 9);
    expect(v.fromHz).toBeCloseTo(LOAD_VALIDITY_K * fb, 9);
    expect(sessionBaffle({ kind: 'other', label: 'testkast', baffle: 'identical', box: target })).toEqual({ from: 'optimizer' });
  });
});
