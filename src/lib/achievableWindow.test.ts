/**
 * The achievable-window estimate (08-11-2026) and how the guided SPL window
 * follows it. See `achievableWindow.ts` and the measurement it rests on,
 * `test-fixtures/achievable_window.json`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logspace } from './dsp.ts';
import { achievableWindow, FINE_SMOOTHING_OCT, roughnessPlusMinusDb } from './achievableWindow.ts';
import { WINDOW_SMOOTHING_OCTAVES } from './engine2/constants.ts';
import { GUIDED_PROFILES, profileWrites } from './guidedProfiles.ts';

const f = logspace(20, 20000, 2000);

describe('achievable window — the estimate', () => {
  it('smooths at the width the SPL window judges on', () => {
    expect(FINE_SMOOTHING_OCT).toBe(WINDOW_SMOOTHING_OCTAVES);
  });

  it('a flat response and a pure tilt allow ±0: the trend follows both', () => {
    expect(roughnessPlusMinusDb(f, f.map(() => 90), 100, 5000)).toBeCloseTo(0, 6);
    const tilt = f.map((x) => 90 - 3 * Math.log2(x / 100));
    expect(roughnessPlusMinusDb(f, tilt, 100, 5000)!).toBeLessThan(0.02);
  });

  it('a ripple narrower than the trend is read, and grows with its amplitude', () => {
    const ripple = (a: number) => f.map((x) => 90 + a * Math.sin(2 * Math.PI * Math.log2(x) / (1 / 2)));
    const one = roughnessPlusMinusDb(f, ripple(1), 100, 5000)!;
    const two = roughnessPlusMinusDb(f, ripple(2), 100, 5000)!;
    expect(one).toBeGreaterThan(0.5);
    expect(one).toBeLessThanOrEqual(1);
    expect(two / one).toBeCloseTo(2, 2);
  });

  it('the roughest driver sets it, and a count mismatch is no estimate (P4)', () => {
    const smooth = { name: 'a', freq: f, db: f.map(() => 90), validHz: [20, 20000] as const };
    const rough = { name: 'b', freq: f, db: f.map((x) => 90 + Math.sin(4 * Math.PI * Math.log2(x))), validHz: [20, 20000] as const };
    const w = achievableWindow([smooth, rough], [1000], 50)!;
    expect(w.roughest).toBe('b');
    expect(w.plusMinusDb).toBe(w.perDriver[1].plusMinusDb);
    expect(achievableWindow([smooth, rough], [], 50)).toBeNull();
    expect(achievableWindow([smooth, rough], [0], 50)).toBeNull();
  });

  it('the recorded measurement: Koan ±1.03, Robbert 3-weg ±2.60 (1-octave trend)', () => {
    const rec = JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-fixtures', 'achievable_window.json'), 'utf-8'));
    const worst = (name: string) => rec.sets.find((s: { set: string }) => s.set.startsWith(name)).worst['1'];
    expect(worst('Koan')).toBeCloseTo(1.03, 2);
    expect(worst('Robbert 3-weg')).toBeCloseTo(2.6, 2);
  });
});

describe('the guided SPL window follows the measurements', () => {
  const spl = (id: string, est: Parameters<typeof profileWrites>[2]) =>
    profileWrites(GUIDED_PROFILES.find((p) => p.id === id)!, '', est).writes.find((w) => w.target === 'splWindowPlusMinusDb')!;

  it('no estimate: the fixed figure, and it says so', () => {
    expect(spl('build-simple', null)).toMatchObject({ value: '3', derived: { from: 'floor' } });
    expect(spl('build-balanced', null).value).toBe('2');
    expect(spl('build-whatever', null).value).toBe('1.5');
  });

  it('drivers as smooth as Koan’s: nothing changes', () => {
    for (const [id, v] of [['build-simple', '3'], ['build-balanced', '2'], ['build-whatever', '1.5']])
      expect(spl(id, { plusMinusDb: 1.03, roughest: 'tweeter' }).value, id).toBe(v);
  });

  it('rougher drivers: factor × estimate, with where it came from', () => {
    const est = { plusMinusDb: 2.6, roughest: 'tweeter' };
    const w = spl('build-simple', est);
    expect(w.value).toBe('7.5');
    expect(w.derived).toEqual({ from: 'measurements', roughest: 'tweeter', estimateDb: 2.6, factor: 2.9 });
    expect(spl('build-balanced', est).value).toBe('4.9');
    expect(spl('build-whatever', est).value).toBe('3.9');
  });
});

describe('the app reads it', () => {
  const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8');
  it('every profile write in the guided pane passes the estimate, and the card says where the number came from', () => {
    const calls = APP.match(/profileWrites\(p, powerAfter\(p\)(, achievableEstimate)?\)/g) ?? [];
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c).toContain('achievableEstimate');
    expect(APP).toContain('const w = achievableWindow(drivers, crossings, floor);');
    expect(APP).toContain('className="v2-profile-derived"');
  });
});
