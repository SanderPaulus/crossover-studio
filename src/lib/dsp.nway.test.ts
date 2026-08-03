import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  combine,
  combineN,
  relativePhaseBetween,
  logspace,
  resample,
  wrapDeg,
  offsetMmToDelayS,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { unwrapPhaseDeg } from './timing.ts';
import { parseFrd } from './parsers/frd.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');

function loadGridded(name: string, grid: number[]): GriddedResponse {
  const m = parseFrd(readFileSync(join(FIXTURES, name), 'utf8'));
  return resample(m.freq, m.spl, m.phase, grid);
}

/**
 * FROZEN copy of the historical fused 2-way loop (pre-N-way), kept here as an
 * independent reference so the bit-identity proof is not circular: the live
 * `combine` now delegates to the N-way core, and THIS is what it must match.
 */
function combineReference(woofer: GriddedResponse, tweeterRaw: GriddedResponse, adj: TweeterAdjust) {
  const n = woofer.freq.length;
  const delay = offsetMmToDelayS(adj.offsetMm);
  const adjPhase = (f: number) => -360 * f * delay + (adj.inverted ? 180 : 0);
  const tweeter: GriddedResponse = {
    freq: tweeterRaw.freq,
    spl: tweeterRaw.spl.map((s) => s + adj.trimDb),
    phaseDeg: tweeterRaw.phaseDeg.map((p, i) => p + adjPhase(tweeterRaw.freq[i])),
  };
  const toC = (splDb: number, phaseDeg: number) => {
    const mag = 10 ** (splDb / 20);
    const ph = (phaseDeg * Math.PI) / 180;
    return { re: mag * Math.cos(ph), im: mag * Math.sin(ph) };
  };
  const combinedSpl = new Array<number>(n);
  const combinedPhaseRaw = new Array<number>(n);
  const invertedSpl = new Array<number>(n);
  const relativePhaseDeg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const hw = toC(woofer.spl[i], woofer.phaseDeg[i]);
    const ht = toC(tweeter.spl[i], tweeter.phaseDeg[i]);
    const sum = { re: hw.re + ht.re, im: hw.im + ht.im };
    combinedSpl[i] = 20 * Math.log10(Math.hypot(sum.re, sum.im) || Number.MIN_VALUE);
    combinedPhaseRaw[i] = (Math.atan2(sum.im, sum.re) * 180) / Math.PI;
    invertedSpl[i] = 20 * Math.log10(Math.hypot(hw.re - ht.re, hw.im - ht.im) || Number.MIN_VALUE);
    relativePhaseDeg[i] = wrapDeg(tweeter.phaseDeg[i] - woofer.phaseDeg[i]);
  }
  return {
    combinedSpl,
    combinedPhaseDeg: unwrapPhaseDeg(combinedPhaseRaw),
    invertedSpl,
    relativePhaseDeg,
    tweeter,
  };
}

const bitIdentical = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

describe('N-way summation core', () => {
  const grid = logspace(200, 20000, 400);
  const w = loadGridded('mid_hor0_mettape.txt', grid);
  const t = loadGridded('tweet_hor0_mettape.txt', grid);

  it('2-way stays BIT-IDENTICAL to the frozen pre-N-way algorithm (KOAN fixtures)', () => {
    for (const adj of [
      { offsetMm: 0, trimDb: 0, inverted: false },
      { offsetMm: 16.2, trimDb: -6.5, inverted: true },
      { offsetMm: -25, trimDb: 3.1, inverted: false },
    ]) {
      const live = combine(w, t, adj);
      const ref = combineReference(w, t, adj);
      expect(bitIdentical(live.combinedSpl, ref.combinedSpl)).toBe(true);
      expect(bitIdentical(live.combinedPhaseDeg, ref.combinedPhaseDeg)).toBe(true);
      expect(bitIdentical(live.invertedSpl, ref.invertedSpl)).toBe(true);
      expect(bitIdentical(live.relativePhaseDeg, ref.relativePhaseDeg)).toBe(true);
      expect(bitIdentical(live.tweeter.spl, ref.tweeter.spl)).toBe(true);
      expect(bitIdentical(live.tweeter.phaseDeg, ref.tweeter.phaseDeg)).toBe(true);
    }
  });

  it('combineN with two branches matches combine() on the shared fields', () => {
    const adj = { offsetMm: 16.2, trimDb: -6.5, inverted: true };
    const two = combine(w, t, adj);
    const n2 = combineN([{ response: w }, { response: t, adjust: adj }]);
    expect(bitIdentical(n2.combinedSpl, two.combinedSpl)).toBe(true);
    expect(bitIdentical(n2.combinedPhaseDeg, two.combinedPhaseDeg)).toBe(true);
    expect(bitIdentical(n2.branches[1].spl, two.tweeter.spl)).toBe(true);
    expect(
      bitIdentical(relativePhaseBetween(n2.branches[0], n2.branches[1]), two.relativePhaseDeg),
    ).toBe(true);
  });

  it('one branch: the combined IS that branch — solo without the silent ghost', () => {
    const solo = combineN([{ response: w }]);
    for (let i = 0; i < grid.length; i++) {
      expect(solo.combinedSpl[i]).toBeCloseTo(w.spl[i], 9);
      expect(Math.abs(wrapDeg(solo.combinedPhaseDeg[i] - w.phaseDeg[i]))).toBeLessThan(1e-9);
    }
  });

  it('three branches: coherent sum, pairwise cancellation, per-branch adjust', () => {
    const flat: GriddedResponse = {
      freq: grid,
      spl: grid.map(() => 90),
      phaseDeg: grid.map(() => 0),
    };
    // Three identical in-phase sources: +20·log10(3) ≈ 9.54 dB.
    const triple = combineN([{ response: flat }, { response: flat }, { response: flat }]);
    for (const v of triple.combinedSpl) expect(v).toBeCloseTo(90 + 20 * Math.log10(3), 9);

    // One inverted pair cancels; the third branch survives untouched.
    const cancel = combineN([
      { response: flat },
      { response: flat, adjust: { inverted: true } },
      { response: w },
    ]);
    for (let i = 0; i < grid.length; i++) {
      expect(cancel.combinedSpl[i]).toBeCloseTo(w.spl[i], 6);
    }

    // Per-branch trim and offset land on the RIGHT branch only.
    const mixed = combineN([
      { response: flat, adjust: { trimDb: -12 } },
      { response: flat, adjust: { offsetMm: 34.3 } },
      { response: flat },
    ]);
    expect(mixed.branches[0].spl[0]).toBeCloseTo(78, 9);
    expect(mixed.branches[2].spl[0]).toBeCloseTo(90, 9);
    const tSec = offsetMmToDelayS(34.3);
    const fProbe = grid[123];
    expect(mixed.branches[1].phaseDeg[123]).toBeCloseTo(-360 * fProbe * tSec, 6);
  });

  it('a delayed pair combs: the first null sits where the delay says', () => {
    const flat: GriddedResponse = { freq: grid, spl: grid.map(() => 90), phaseDeg: grid.map(() => 0) };
    const dMm = 68.6; // 0.2 ms → first null at 1/(2·t) = 2500 Hz
    const c = combineN([{ response: flat }, { response: flat, adjust: { offsetMm: dMm } }]);
    // Combs null at (2k+1)/(2t) — 2500, 7500, 12500 Hz… Which sampled null is
    // DEEPEST depends on how close a log-grid point lands to each exact null
    // (the first run of this test found the 7500 Hz null winning by luck of
    // the grid), so search inside the first lobe only.
    const fNull = 1 / (2 * offsetMmToDelayS(dMm));
    let minI = 0;
    for (let i = 1; i < grid.length && grid[i] < fNull * 2; i++) {
      if (c.combinedSpl[i] < c.combinedSpl[minI]) minI = i;
    }
    expect(grid[minI]).toBeGreaterThan(fNull * 0.97);
    expect(grid[minI]).toBeLessThan(fNull * 1.03);
  });
});
