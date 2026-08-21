import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZma } from './parsers/zma.ts';
import { logspace } from './dsp.ts';
import {
  DOME_TWEETER_LIKE,
  SEALED_MID_LIKE,
  WO24P_LIKE,
  minImpedance,
  parallelDrivers,
  sealedDriverZ,
  ventedDriverZ,
} from './testDrivers.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const grid = logspace(10, 20000, 900);

/** Peaks in |Z|, as local maxima that stand clear of their neighbourhood. */
function peaksOf(freq: readonly number[], mag: readonly number[], minOhm = 1) {
  const out: { hz: number; ohm: number }[] = [];
  for (let i = 3; i < mag.length - 3; i++) {
    const local = mag[i];
    if (local < minOhm) continue;
    // STRICT on both sides: on a constant array every point is >= its
    // neighbours, and a detector that accepts that reports peaks in a flat
    // resistor — which is precisely the fixture this file exists to retire.
    let isPeak = local > mag[i - 3] && local > mag[i + 3];
    for (let k = 1; k <= 3 && isPeak; k++) {
      if (mag[i - k] > local || mag[i + k] > local) isPeak = false;
    }
    if (isPeak) out.push({ hz: freq[i], ohm: local });
  }
  // Merge near-duplicates from a flat top.
  return out.filter((p, i) => i === 0 || p.hz / out[i - 1].hz > 1.2);
}

describe('synthetic drivers are drivers, not resistors', () => {
  /* THE POINT OF THIS FILE. A flat resistor cannot have a reflex peak, so a
   * sweep of Re can never move an answer that depends on one — which is how
   * "3.36 Ω at 720 Hz, remarkably insensitive to the driver model" survived
   * scrutiny while the real measurement says 2.62 Ω at 82 Hz. These tests pin
   * that the fixtures can express the behaviour, and check the shape against
   * a REAL measurement rather than against what I expected it to look like. */

  it('a vented woofer has TWO peaks with the saddle at the tuning frequency', () => {
    const z = ventedDriverZ(grid, WO24P_LIKE);
    const mag = z.map((x) => Math.hypot(x.re, x.im));
    const peaks = peaksOf(grid, mag, 8).filter((p) => p.hz < 200);
    expect(peaks.length).toBe(2);
    const [lo, hi] = peaks;
    // The saddle sits BETWEEN them, at Fb — that is the defining property of a
    // vented alignment and the whole reason this fixture exists.
    const saddle = minImpedance(grid, z, lo.hz, hi.hz);
    // Sanders measured pair lands at 31.3 Hz against a stated 31, so this is a
    // tight check on purpose — a model whose dip drifts is modelling the wrong
    // circuit, and it did (see the note in ventedDriverZ).
    expect(saddle.atHz).toBeGreaterThan(WO24P_LIKE.fbHz * 0.94);
    expect(saddle.atHz).toBeLessThan(WO24P_LIKE.fbHz * 1.06);
    // And it is a real dip, not a wiggle.
    expect(saddle.ohm).toBeLessThan(Math.min(lo.ohm, hi.ohm) * 0.5);
  });

  it('a sealed driver has exactly ONE peak — the difference is not cosmetic', () => {
    const z = sealedDriverZ(grid, SEALED_MID_LIKE);
    const mag = z.map((x) => Math.hypot(x.re, x.im));
    expect(peaksOf(grid, mag, 8).filter((p) => p.hz < 1000).length).toBe(1);
  });

  it('the coil rise is semi-inductive, so |Z| climbs slower than a textbook L', () => {
    const semi = sealedDriverZ(grid, { ...SEALED_MID_LIKE, leExp: 0.7 });
    const ideal = sealedDriverZ(grid, { ...SEALED_MID_LIKE, leExp: 1 });
    const at = (z: typeof semi, hz: number) => {
      let b = 0;
      for (let i = 1; i < grid.length; i++) if (Math.abs(grid[i] - hz) < Math.abs(grid[b] - hz)) b = i;
      return Math.hypot(z[b].re, z[b].im);
    };
    // Both rise; the ideal inductor rises faster, which is exactly why a
    // measured impedance never reaches the slope a pure L predicts.
    expect(at(semi, 10000)).toBeGreaterThan(at(semi, 1000));
    expect(at(ideal, 10000)).toBeGreaterThan(at(semi, 10000));
  });

  it('the model reproduces the STRUCTURE of Sanders real measured woofer pair', () => {
    /* Checked against the measurement, not against my expectation. The real
     * file is his two WO24P-8 measured in parallel with LIMP; the fixture is
     * one driver, so it is paralleled here to compare like with like.
     *
     * Only structure is asserted — peak count, saddle position relative to the
     * tuning, and the ratio between the minimum above resonance and Re. Values
     * are not: this is a shape generator, and pinning it to a real driver's
     * exact ohms would be claiming an accuracy it does not have. */
    const real = parseZma(readFileSync(join(FIXTURES, 'koan-3way', 'woofers-parallel.zma'), 'utf-8'));
    const rMag = real.magnitude;
    const rPeaks = peaksOf(real.freq, rMag, 8).filter((p) => p.hz < 200);
    expect(rPeaks.length).toBe(2); // the real file IS a two-peak vented profile

    const model = parallelDrivers(ventedDriverZ(grid, WO24P_LIKE), 2);
    const mPeaks = peaksOf(grid, model.map((x) => Math.hypot(x.re, x.im)), 8).filter((p) => p.hz < 200);
    expect(mPeaks.length).toBe(2);

    // Saddle between the peaks lands at the tuning in both.
    const rSaddle = minImpedance(real.freq, real.freq.map((_, i) => ({ re: rMag[i], im: 0 })), rPeaks[0].hz, rPeaks[1].hz);
    const mSaddle = minImpedance(grid, model, mPeaks[0].hz, mPeaks[1].hz);
    expect(Math.abs(Math.log2(mSaddle.atHz / rSaddle.atHz))).toBeLessThan(0.5); // within half an octave

    // And the working minimum — the one an amplifier meets in the passband —
    // is in the same ballpark. His measured pair reads 3.17 Ω.
    const rMin = minImpedance(real.freq, real.freq.map((_, i) => ({ re: rMag[i], im: 0 })), 60, 1000);
    const mMin = minImpedance(grid, model, 60, 1000);
    expect(rMin.ohm).toBeGreaterThan(2.5);
    expect(rMin.ohm).toBeLessThan(4);
    expect(mMin.ohm).toBeGreaterThan(rMin.ohm * 0.6);
    expect(mMin.ohm).toBeLessThan(rMin.ohm * 1.6);
  });

  it('two in parallel halve the impedance — 8 Ω nominal arrives as 4 Ω', () => {
    const one = ventedDriverZ(grid, WO24P_LIKE);
    const two = parallelDrivers(one, 2);
    const a = minImpedance(grid, one, 60, 1000);
    const b = minImpedance(grid, two, 60, 1000);
    expect(b.ohm).toBeCloseTo(a.ohm / 2, 6);
    expect(b.atHz).toBe(a.atHz);
  });

  it('a tweeter fixture is a tweeter: resonance high, coil small', () => {
    const z = sealedDriverZ(grid, DOME_TWEETER_LIKE);
    const mag = z.map((x) => Math.hypot(x.re, x.im));
    const peaks = peaksOf(grid, mag, 6);
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks[0].hz).toBeGreaterThan(400);
    // Above resonance it settles near Re rather than climbing away.
    const top = minImpedance(grid, z, 2000, 20000);
    expect(top.ohm).toBeGreaterThan(DOME_TWEETER_LIKE.reOhm * 0.9);
    expect(top.ohm).toBeLessThan(DOME_TWEETER_LIKE.reOhm * 1.5);
  });

  it('a flat resistor cannot express any of this — the fixture that was used before', () => {
    /* Kept as an explicit statement rather than a comment. Whatever value you
     * give it, a resistor has no resonance, so an experiment that varies it is
     * incapable of finding a resonance-driven answer. That is a different
     * failure from "the parameter is not wired up", and the two are
     * indistinguishable from the outside. */
    const flat = grid.map(() => ({ re: 4.0, im: 0 }));
    expect(peaksOf(grid, flat.map((x) => Math.hypot(x.re, x.im)), 1).length).toBe(0);
    for (const re of [3.0, 3.5, 4.0, 4.5]) {
      const sweep = grid.map(() => ({ re, im: 0 }));
      // The minimum is always just Re, wherever you look. No sweep over this
      // model can produce "the dip sits at 82 Hz".
      expect(minImpedance(grid, sweep, 20, 20000).ohm).toBeCloseTo(re, 9);
    }
  });
});
