import { describe, it, expect } from 'vitest';
import { fftInPlace, ifftInPlace, envelope } from './fft.ts';
import { toTimeDomain, excessGroupDelay } from './timeDomain.ts';
import { logspace } from './dsp.ts';

describe('fft', () => {
  it('impulse transforms to a flat spectrum and back', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    re[0] = 1;
    fftInPlace(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(1, 10);
      expect(im[i]).toBeCloseTo(0, 10);
    }
    ifftInPlace(re, im);
    expect(re[0]).toBeCloseTo(1, 10);
    for (let i = 1; i < n; i++) expect(re[i]).toBeCloseTo(0, 10);
  });

  it('a pure sinusoid lands in exactly one bin pair', () => {
    const n = 128;
    const k0 = 5;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * k0 * i) / n);
    fftInPlace(re, im);
    expect(re[k0]).toBeCloseTo(n / 2, 6);
    expect(re[n - k0]).toBeCloseTo(n / 2, 6);
    for (let i = 0; i < n; i++) {
      if (i !== k0 && i !== n - k0) expect(Math.hypot(re[i], im[i])).toBeLessThan(1e-8);
    }
  });

  it('rejects non-power-of-two lengths', () => {
    expect(() => fftInPlace(new Float64Array(100), new Float64Array(100))).toThrow(/power of two/);
  });

  it('envelope of a windowed burst peaks where the burst peaks', () => {
    const n = 512;
    const sig = new Float64Array(n);
    for (let i = 200; i < 260; i++) {
      const w = Math.sin((Math.PI * (i - 200)) / 60); // window
      sig[i] = w * Math.cos(0.6 * i);
    }
    const env = envelope(sig);
    let peak = 0;
    for (let i = 1; i < n; i++) if (env[i] > env[peak]) peak = i;
    expect(peak).toBeGreaterThan(210);
    expect(peak).toBeLessThan(250);
  });
});

describe('toTimeDomain', () => {
  it('a flat response with pure delay peaks at that delay', () => {
    const grid = logspace(200, 20000, 500);
    const delayMs = 1.7;
    const spl = grid.map(() => 100);
    const phase = grid.map((f) => -360 * f * (delayMs / 1000));
    const r = toTimeDomain(grid, spl, phase);

    expect(r.peakTimeMs).toBeCloseTo(delayMs, 1);
    // Peak sample is at t=0 by construction and normalized to |1|.
    const i0 = r.timeMs.findIndex((t) => t === 0);
    expect(Math.abs(r.impulse[i0])).toBeCloseTo(1, 6);
    expect(r.etcDb[i0]).toBeCloseTo(0, 4);
    // ETC decays well below −20 dB a few ms after the peak.
    const late = r.timeMs.findIndex((t) => t > 4);
    expect(r.etcDb[late]).toBeLessThan(-20);
  });

  it('step response rises at the impulse and is normalized', () => {
    const grid = logspace(200, 20000, 500);
    const spl = grid.map(() => 100);
    const phase = grid.map((f) => -360 * f * 0.001);
    const r = toTimeDomain(grid, spl, phase);
    const i0 = r.timeMs.findIndex((t) => t === 0);
    const before = r.step[Math.max(0, i0 - 30)];
    const atPeakish = Math.max(...r.step.map(Math.abs));
    expect(atPeakish).toBeCloseTo(1, 6);
    expect(Math.abs(before)).toBeLessThan(0.4); // quiet before arrival
  });
});

describe('excessGroupDelay', () => {
  it('a pure delay yields zero excess everywhere', () => {
    const grid = logspace(200, 20000, 400);
    const phase = grid.map((f) => -360 * f * 0.0017);
    const r = excessGroupDelay(grid, phase);
    expect(r.minDelayMs).toBeCloseTo(1.7, 2);
    for (const v of r.egdMs) expect(Math.abs(v)).toBeLessThan(0.02);
  });

  it('an LR4-style allpass phase bump shows positive excess near fc', () => {
    // Synthetic: delay + 360° of extra lag rolled in around 2 kHz (like a
    // 4th-order crossover's phase turn).
    const grid = logspace(200, 20000, 600);
    const fc = 2000;
    const phase = grid.map(
      (f) => -360 * f * 0.001 - (360 / Math.PI) * Math.atan(f / fc) * 2,
    );
    const r = excessGroupDelay(grid, phase);
    const at = (f: number) => r.egdMs[grid.findIndex((g) => g >= f)];
    // Excess is highest around fc and falls off well above it.
    expect(at(2000)).toBeGreaterThan(at(12000));
    expect(at(2000)).toBeGreaterThan(0.1);
    // Far above the turn the excess settles back near zero.
    expect(at(16000)).toBeLessThan(0.1);
  });
});
