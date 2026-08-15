import { describe, expect, it } from 'vitest';
import {
  combine,
  combineN,
  logspace,
  resample,
  resampleImpedance,
  wrapDeg,
  type GriddedResponse,
} from './dsp.ts';
import { unwrapPhaseDeg, SPEED_OF_SOUND } from './timing.ts';
import { checkPredictedSum } from './sumCheck.ts';
import type { FrdMeasurement } from './types.ts';

/**
 * The measured-phase path, end to end: what goes into the sum is what came
 * out of the file. These tests pin the properties Sander's audit asked for —
 * no offset unless asked, complex-exact interpolation of a delayed response,
 * complex summation with a known path difference, unwrapping that survives a
 * real reference-time delay, and the predicted-vs-measured acceptance check.
 */

const META = { } as FrdMeasurement['meta'];

/** A synthetic driver: flat |H| = 0 dB with a pure delay τ (seconds), on a
 *  dense linear grid like an ARTA export (1.465 Hz steps), phase WRAPPED as a
 *  file would store it. */
function delayedDriver(tauS: number, opts: { df?: number; fMax?: number; levelDb?: number } = {}): FrdMeasurement {
  const df = opts.df ?? 1.465;
  const fMax = opts.fMax ?? 20000;
  const freq: number[] = [];
  const spl: number[] = [];
  const phase: number[] = [];
  for (let f = 20; f <= fMax; f += df) {
    freq.push(f);
    spl.push(opts.levelDb ?? 0);
    phase.push(wrapDeg(-360 * f * tauS));
  }
  return { freq, spl, phase, meta: META };
}

const grid = (n = 600, lo = 20, hi = 19000) => logspace(lo, hi, n);

/** Unwrapped value of a wrapped analytic phase function at f, obtained by
 *  walking from 1 Hz in 1 Hz steps (small enough for any delay under 1 ms per
 *  step of 360°) — the reference for "no spurious turns". */
function unwrapDense(phaseAt: (f: number) => number, f: number): number {
  let prev = phaseAt(1);
  let acc = prev;
  for (let x = 2; x <= f; x += 1) {
    const cur = phaseAt(x);
    acc += wrapDeg(cur - prev);
    prev = cur;
  }
  // final partial step to f
  const cur = phaseAt(f);
  acc += wrapDeg(cur - prev);
  return acc;
}

describe('offset defaults', () => {
  it('a zero adjustment leaves the branch bit-identical (no delay is added unless asked)', () => {
    const d = delayedDriver(0.0025);
    const g = resample(d.freq, d.spl, d.phase, grid(400, 200, 10000));
    const plain = combineN([{ response: g }, { response: g }]);
    const zero = combineN([
      { response: g, adjust: { offsetMm: 0, trimDb: 0, inverted: false } },
      { response: g, adjust: { offsetMm: 0, trimDb: 0, inverted: false } },
    ]);
    expect(zero.branches[0].phaseDeg).toEqual(plain.branches[0].phaseDeg);
    expect(zero.combinedSpl).toEqual(plain.combinedSpl);
    // Two identical drivers in parallel: exactly +6.02 dB everywhere.
    for (const v of plain.combinedSpl) expect(v).toBeCloseTo(20 * Math.log10(2), 6);
    // combine() with a zero TweeterAdjust equals the N-way core as well.
    const two = combine(g, g, { offsetMm: 0, trimDb: 0, inverted: false });
    expect(two.combinedSpl).toEqual(plain.combinedSpl);
  });

  it('an explicit offset is a real delay: 100 mm shifts phase by −360·f·d/c', () => {
    const d = delayedDriver(0.001);
    const g = resample(d.freq, d.spl, d.phase, grid(200, 200, 5000));
    const r = combineN([{ response: g, adjust: { offsetMm: 100 } }]);
    const tau = 0.1 / SPEED_OF_SOUND;
    for (let i = 0; i < g.freq.length; i++) {
      expect(r.branches[0].phaseDeg[i] - g.phaseDeg[i]).toBeCloseTo(-360 * g.freq[i] * tau, 6);
    }
  });
});

describe('interpolation of a delayed response', () => {
  it('reproduces a 2.5 ms delay exactly on a coarse log grid (unwrapped-phase interpolation is complex-exact for a delay)', () => {
    const tau = 0.0025;
    const d = delayedDriver(tau);
    const g = resample(d.freq, d.spl, d.phase, grid(600, 20, 19000));
    for (let i = 0; i < g.freq.length; i++) {
      expect(g.spl[i]).toBeCloseTo(0, 6);
      // Unwrapped phase must equal the analytic −360·f·τ (up to the anchor turn).
      const analytic = -360 * g.freq[i] * tau;
      expect(Math.abs(wrapDeg(g.phaseDeg[i] - analytic))).toBeLessThan(0.05);
    }
    // And it is genuinely continuous: no 360° seams anywhere, including >10 kHz
    // (log-f interpolation of a linear-in-f phase is off by ~0.006° at 20 Hz —
    // interpolation error, not a seam).
    for (let i = 1; i < g.freq.length; i++) {
      const step = g.phaseDeg[i] - g.phaseDeg[i - 1];
      const expected = -360 * (g.freq[i] - g.freq[i - 1]) * tau;
      expect(Math.abs(step - expected)).toBeLessThan(0.05);
    }
  });

  it('naive complex (re/im) interpolation would attenuate — the reason phase is unwrapped, not the vector interpolated', () => {
    // Between two samples 90° apart, midpoint re/im interpolation shrinks
    // |H| to cos(45°) = 0.707 (−3 dB). Our resample keeps 0 dB.
    const tau = 0.0025;
    const coarse = delayedDriver(tau, { df: 100 }); // 90° per 100 Hz step
    const mid = resample(coarse.freq, coarse.spl, coarse.phase, [coarse.freq[10] + 50]);
    expect(mid.spl[0]).toBeCloseTo(0, 6);
    const a = { re: Math.cos(0), im: Math.sin(0) };
    const b = { re: Math.cos(Math.PI / 2), im: Math.sin(Math.PI / 2) };
    const naive = Math.hypot((a.re + b.re) / 2, (a.im + b.im) / 2);
    expect(20 * Math.log10(naive)).toBeCloseTo(-3.01, 1);
  });

  it('unwraps per file without 2π jumps above 10 kHz on an ARTA-density grid carrying 2.5 ms', () => {
    const d = delayedDriver(0.0025);
    const uw = unwrapPhaseDeg(d.phase);
    for (let i = 1; i < d.freq.length; i++) {
      if (d.freq[i] < 10000) continue;
      const step = uw[i] - uw[i - 1];
      expect(Math.abs(step + 360 * (d.freq[i] - d.freq[i - 1]) * 0.0025)).toBeLessThan(1e-6);
    }
  });
});

describe('summation', () => {
  it('two equal drivers with a 100 mm path difference comb at f = (2n+1)·c/(2d)', () => {
    const dMm = 100;
    const dt = dMm / 1000 / SPEED_OF_SOUND; // 291.5 µs
    const a = delayedDriver(0.001);
    const b = delayedDriver(0.001 + dt);
    const gr = grid(2000, 200, 15000);
    const r = combineN([
      { response: resample(a.freq, a.spl, a.phase, gr) },
      { response: resample(b.freq, b.spl, b.phase, gr) },
    ]);
    const at = (f: number) => {
      let best = 0;
      for (let i = 1; i < gr.length; i++) if (Math.abs(gr[i] - f) < Math.abs(gr[best] - f)) best = i;
      return r.combinedSpl[best];
    };
    const f1 = 1 / (2 * dt); // ≈ 1715 Hz: first null
    const f2 = 3 / (2 * dt); // ≈ 5145 Hz
    const f3 = 5 / (2 * dt); // ≈ 8575 Hz
    const peak = 1 / dt; // ≈ 3430 Hz: back in phase, +6.02 dB
    expect(at(f1)).toBeLessThan(-25);
    expect(at(f2)).toBeLessThan(-25);
    expect(at(f3)).toBeLessThan(-25);
    expect(at(peak)).toBeCloseTo(20 * Math.log10(2), 1);
    // Sanity: the sum is |1 + e^{-jωΔt}| — check one arbitrary point analytically.
    const f = 2500;
    const expected = 20 * Math.log10(Math.abs(2 * Math.cos(Math.PI * f * dt)));
    expect(at(f)).toBeCloseTo(expected, 1);
  });

  it('is a complex sum, not a dB or magnitude sum', () => {
    const a = delayedDriver(0.001);
    const b = delayedDriver(0.001);
    const gr = grid(50, 500, 5000);
    const ga = resample(a.freq, a.spl, a.phase, gr);
    const gbInv: GriddedResponse = { ...resample(b.freq, b.spl, b.phase, gr) };
    gbInv.phaseDeg = gbInv.phaseDeg.map((p) => p + 180);
    const r = combineN([{ response: ga }, { response: gbInv }]);
    // Equal magnitude, opposite phase: the sum cancels completely.
    for (const v of r.combinedSpl) expect(v).toBeLessThan(-200);
  });

  it('the summed phase carries no spurious 360° jump when the branches carry a large reference delay on a coarse log grid', () => {
    // 3 ms of common delay on 600 points over 20 Hz–19 kHz: the plain
    // unwrap of the sum's own phase would alias (>180° per step at the top).
    const tau = 0.003;
    const a = delayedDriver(tau);
    const b = delayedDriver(tau + 0.0001, { levelDb: -6 });
    const gr = grid(600, 20, 19000);
    const r = combineN([
      { response: resample(a.freq, a.spl, a.phase, gr) },
      { response: resample(b.freq, b.spl, b.phase, gr) },
    ]);
    // Compare with the analytic phase of the sum, up to one global turn.
    let worst = 0;
    for (let i = 0; i < gr.length; i++) {
      const w = 2 * Math.PI * gr[i];
      const re = Math.cos(-w * tau) + 0.5 * Math.cos(-w * (tau + 0.0001));
      const im = Math.sin(-w * tau) + 0.5 * Math.sin(-w * (tau + 0.0001));
      const analytic = (Math.atan2(im, re) * 180) / Math.PI;
      worst = Math.max(worst, Math.abs(wrapDeg(r.combinedPhaseDeg[i] - analytic)));
      // The unwrapped result must equal the analytic (wrapped) phase plus ONE
      // and the same number of turns everywhere — a spurious seam would show
      // up as a second value in this set. NB the TRUE phase steps exceed 180°
      // per grid point at the top (249° at 19 kHz for 3 ms), which is exactly
      // what plain unwrapping of the sum's own phase cannot survive.
    }
    expect(worst).toBeLessThan(0.5);
    const seams = new Set<number>();
    let acc = 0;
    for (let i = 0; i < gr.length; i++) {
      const w = 2 * Math.PI * gr[i];
      const re = Math.cos(-w * tau) + 0.5 * Math.cos(-w * (tau + 0.0001));
      const im = Math.sin(-w * tau) + 0.5 * Math.sin(-w * (tau + 0.0001));
      const analytic = (Math.atan2(im, re) * 180) / Math.PI;
      // analytic phase unwrapped along the ANALYTIC (dense) trajectory: the
      // exact unwrapped value is −360·f·τ_eff; recover it by walking the
      // analytic phase in small steps.
      const exact = unwrapDense((f) => {
        const ww = 2 * Math.PI * f;
        return (Math.atan2(
          Math.sin(-ww * tau) + 0.5 * Math.sin(-ww * (tau + 0.0001)),
          Math.cos(-ww * tau) + 0.5 * Math.cos(-ww * (tau + 0.0001)),
        ) * 180) / Math.PI;
      }, gr[i]);
      seams.add(Math.round((r.combinedPhaseDeg[i] - exact) / 360));
      acc += Math.abs(wrapDeg(exact - analytic));
    }
    expect(acc).toBeLessThan(1e-6);
    expect(seams.size).toBe(1);
  });
});

describe('impedance resampling', () => {
  it('interpolates |Z| log-log and phase linearly, and holds edges flat outside the file', () => {
    // A 6 dB/oct inductive rise: |Z| = 2πfL is a straight line in log-log,
    // so log-log interpolation is exact between coarse points.
    const L = 1e-3;
    const f = logspace(100, 10000, 20);
    const mag = f.map((v) => 2 * Math.PI * v * L);
    const ph = f.map(() => 90);
    const g = logspace(50, 20000, 200);
    const { z, clamped } = resampleImpedance(f, mag, ph, g);
    expect(clamped).toBe(true);
    for (let i = 0; i < g.length; i++) {
      const fi = Math.min(Math.max(g[i], 100), 10000);
      const expected = 2 * Math.PI * fi * L;
      expect(Math.hypot(z[i].re, z[i].im)).toBeCloseTo(expected, 6);
      expect((Math.atan2(z[i].im, z[i].re) * 180) / Math.PI).toBeCloseTo(90, 6);
    }
    const inside = resampleImpedance(f, mag, ph, logspace(200, 5000, 50));
    expect(inside.clamped).toBe(false);
  });
});

describe('predicted vs measured sum (acceptance test)', () => {
  it('passes when the measured sum IS the complex sum of the parts', () => {
    const w = delayedDriver(0.0025, { levelDb: 88 });
    const t = delayedDriver(0.0025 - 0.00005, { levelDb: 90 });
    // "Measured" sum: complex sum on the file's own grid.
    const sum: FrdMeasurement = { freq: [...w.freq], spl: [], phase: [], meta: META };
    for (let i = 0; i < w.freq.length; i++) {
      const c = [w, t].reduce(
        (acc, d) => {
          const m = 10 ** (d.spl[i] / 20);
          const p = (d.phase[i] * Math.PI) / 180;
          return { re: acc.re + m * Math.cos(p), im: acc.im + m * Math.sin(p) };
        },
        { re: 0, im: 0 },
      );
      sum.spl.push(20 * Math.log10(Math.hypot(c.re, c.im)));
      sum.phase.push((Math.atan2(c.im, c.re) * 180) / Math.PI);
    }
    const r = checkPredictedSum([w, t], sum);
    expect(r.band[0]).toBeCloseTo(200, 3);
    expect(r.band[1]).toBeCloseTo(5000, 3);
    expect(r.maxAbsDb).toBeLessThan(0.05);
    expect(r.maxAbsDeg).toBeLessThan(0.5);
    expect(r.pass).toBe(true);
  });

  it('fails when the measured sum carries an extra delay on one driver (timing not shared)', () => {
    const w = delayedDriver(0.0025, { levelDb: 88 });
    const t = delayedDriver(0.0025 - 0.00005, { levelDb: 90 });
    const tLate = delayedDriver(0.0025 + 0.0002, { levelDb: 90 }); // +250 µs
    const sum: FrdMeasurement = { freq: [...w.freq], spl: [], phase: [], meta: META };
    for (let i = 0; i < w.freq.length; i++) {
      const c = [w, tLate].reduce(
        (acc, d) => {
          const m = 10 ** (d.spl[i] / 20);
          const p = (d.phase[i] * Math.PI) / 180;
          return { re: acc.re + m * Math.cos(p), im: acc.im + m * Math.sin(p) };
        },
        { re: 0, im: 0 },
      );
      sum.spl.push(20 * Math.log10(Math.hypot(c.re, c.im)));
      sum.phase.push((Math.atan2(c.im, c.re) * 180) / Math.PI);
    }
    const r = checkPredictedSum([w, t], sum);
    expect(r.pass).toBe(false);
    expect(r.maxAbsDb).toBeGreaterThan(1);
  });
});
