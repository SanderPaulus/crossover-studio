import { describe, it, expect } from 'vitest';
import { combine, logspace } from './dsp.ts';
import type { GriddedResponse } from './dsp.ts';
import { computeIntegration, classify } from './integration.ts';

const flat = (freq: number[], spl: number, phase = 0): GriddedResponse => ({
  freq,
  spl: freq.map(() => spl),
  phaseDeg: freq.map(() => phase),
});

const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };

describe('classify', () => {
  it('uses the physical summing anchors', () => {
    expect(classify(0)).toBe('excellent');
    expect(classify(45)).toBe('excellent');
    expect(classify(46)).toBe('acceptable');
    expect(classify(90)).toBe('acceptable');
    expect(classify(91)).toBe('marginal');
    expect(classify(120)).toBe('marginal');
    expect(classify(121)).toBe('destructive');
    expect(classify(-170)).toBe('destructive'); // sign-agnostic
  });
});

describe('computeIntegration', () => {
  const grid = logspace(500, 5000, 100);

  it('perfect alignment scores 100 across the whole band', () => {
    const r = computeIntegration(combine(flat(grid, 90), flat(grid, 90), NO_ADJ));
    expect(r.score).toBeCloseTo(100, 6);
    expect(r.points.every((p) => p.cls === 'excellent')).toBe(true);
    expect(r.bandwidth).not.toBeNull();
    expect(r.bandwidth!.fLo).toBeCloseTo(500, 0);
    expect(r.bandwidth!.fHi).toBeCloseTo(5000, 0);
    expect(r.bandwidth!.octaves).toBeCloseTo(Math.log2(10), 3);
  });

  it('uniform quadrature scores ~71 (cos 45°)', () => {
    const r = computeIntegration(combine(flat(grid, 90), flat(grid, 90, 90), NO_ADJ));
    expect(r.score).toBeCloseTo(100 * Math.cos(Math.PI / 4), 1);
    expect(r.points.every((p) => p.cls === 'acceptable')).toBe(true);
  });

  it('inverted equal sources score ~0 and yield no bandwidth', () => {
    const r = computeIntegration(combine(flat(grid, 90), flat(grid, 90, 180), NO_ADJ));
    expect(r.score!).toBeLessThan(1e-6);
    expect(r.bandwidth).toBeNull(); // centre itself is destructive
    expect(r.points.every((p) => p.cls === 'destructive')).toBe(true);
  });

  it('ignores phase where drivers do not overlap', () => {
    // Tweeter 40 dB down everywhere and fully out of phase: irrelevant.
    const r = computeIntegration(combine(flat(grid, 90), flat(grid, 50, 180), NO_ADJ));
    expect(r.score).toBeNull();
    expect(r.overlapCentreHz).toBeNull();
    expect(r.points.every((p) => p.cls === null)).toBe(true);
  });

  it('a delay offset limits the integration bandwidth around the overlap centre', () => {
    // 34.3 mm → 0.1 ms → ε = 90° at 2.5 kHz, 120° at ~3.33 kHz, 180° at 5 kHz.
    const g = logspace(500, 8000, 800);
    const r = computeIntegration(
      combine(flat(g, 90), flat(g, 90), { offsetMm: 34.3, trimDb: 0, inverted: false }),
    );
    expect(r.bandwidth).not.toBeNull();
    // Acceptable (≤90°) holds up to 2.5 kHz exactly.
    expect(r.bandwidth!.fLo).toBeCloseTo(500, 0); // grid edge
    expect(r.bandwidth!.fHi).toBeCloseTo(2500, -2); // grid-quantised
    // Score is dragged well below perfect by the upper band.
    expect(r.score!).toBeLessThan(90);
    // Around 5 kHz the class is destructive.
    const p5k = r.points.find((p) => p.freq >= 5000)!;
    expect(p5k.cls).toBe('destructive');
  });

  it('weights the score toward the equal-level region', () => {
    // Woofer flat; tweeter crosses it steeply. Massive phase error only where
    // the tweeter is 30+ dB down must barely move the score.
    const g = logspace(500, 5000, 200);
    const half = Math.floor(g.length / 2);
    const tweeter: GriddedResponse = {
      freq: g,
      spl: g.map((_, i) => (i < half ? 55 : 90)), // −35 dB below crossover, equal above
      phaseDeg: g.map((_, i) => (i < half ? 170 : 0)), // garbage phase only when buried
    };
    const r = computeIntegration(combine(flat(g, 90), tweeter, NO_ADJ));
    expect(r.score!).toBeGreaterThan(97);
  });
});
