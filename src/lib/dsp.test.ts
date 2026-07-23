import { describe, it, expect } from 'vitest';
import { logspace, resample, combine, wrapDeg, offsetMmToDelayS } from './dsp.ts';
import type { GriddedResponse } from './dsp.ts';

const flat = (freq: number[], spl: number, phase = 0): GriddedResponse => ({
  freq,
  spl: freq.map(() => spl),
  phaseDeg: freq.map(() => phase),
});

describe('logspace', () => {
  it('spans the range with log spacing', () => {
    const g = logspace(20, 20000, 4);
    expect(g[0]).toBeCloseTo(20, 9);
    expect(g[3]).toBeCloseTo(20000, 9);
    expect(g[1] / g[0]).toBeCloseTo(g[2] / g[1], 9); // constant ratio
  });
});

describe('resample', () => {
  it('interpolates SPL and unwrapped phase across a wrap seam', () => {
    // Phase crosses the ±180 seam between the two samples: naive interpolation
    // would pass through 0 instead of ±180.
    const r = resample([100, 200], [80, 90], [170, -170], [141.42]);
    expect(r.spl[0]).toBeCloseTo(85, 1);
    expect(r.phaseDeg[0]).toBeCloseTo(180, 1); // unwrapped midpoint, not 0
  });

  it('refuses to extrapolate', () => {
    expect(() => resample([100, 200], [80, 90], [0, 0], [50])).toThrow(/extrapolate/);
  });
});

describe('combine', () => {
  const grid = logspace(500, 5000, 50);

  it('two equal in-phase sources sum to +6 dB', () => {
    const r = combine(flat(grid, 90), flat(grid, 90), { offsetMm: 0, trimDb: 0, inverted: false });
    for (const v of r.combinedSpl) expect(v).toBeCloseTo(96.02, 2);
    for (const v of r.relativePhaseDeg) expect(v).toBeCloseTo(0, 9);
    // And the polarity-flipped trace is a perfect null.
    for (const v of r.invertedSpl) expect(v).toBeLessThan(-100);
  });

  it('electrical inversion swaps combined and null traces', () => {
    const r = combine(flat(grid, 90), flat(grid, 90), { offsetMm: 0, trimDb: 0, inverted: true });
    for (const v of r.combinedSpl) expect(v).toBeLessThan(-100);
    for (const v of r.invertedSpl) expect(v).toBeCloseTo(96.02, 2);
    for (const v of r.relativePhaseDeg) expect(Math.abs(v)).toBeCloseTo(180, 9);
  });

  it('level trim shifts the tweeter and the sum', () => {
    const r = combine(flat(grid, 90), flat(grid, 90), { offsetMm: 0, trimDb: -6, inverted: false });
    expect(r.tweeter.spl[0]).toBeCloseTo(84, 9);
    // 1 + 0.5012 amplitude ratio → +3.53 dB over the woofer alone
    expect(r.combinedSpl[0]).toBeCloseTo(90 + 20 * Math.log10(1.5012), 2);
  });

  it('a physical offset produces the textbook comb: null where delay = half period', () => {
    // 34.3 mm → 0.1 ms delay → first null at 5 kHz (half a period of 100 µs).
    const g = logspace(1000, 8000, 400);
    const r = combine(flat(g, 90), flat(g, 90), { offsetMm: 34.3, trimDb: 0, inverted: false });

    expect(offsetMmToDelayS(34.3)).toBeCloseTo(1e-4, 7);
    const i5k = g.findIndex((f) => f >= 5000);
    // Relative phase at 5 kHz is ±180 → deep cancellation.
    expect(Math.abs(r.relativePhaseDeg[i5k])).toBeGreaterThan(175);
    expect(r.combinedSpl[i5k]).toBeLessThan(70); // > 20 dB down
    // At 2.5 kHz the delay is a quarter period → 90° → +3 dB.
    const i25 = g.findIndex((f) => f >= 2500);
    expect(Math.abs(r.relativePhaseDeg[i25])).toBeCloseTo(90, 0);
    expect(r.combinedSpl[i25]).toBeCloseTo(93.01, 1);
  });
});

describe('wrapDeg', () => {
  it('wraps into (−180, 180]', () => {
    expect(wrapDeg(190)).toBeCloseTo(-170, 9);
    expect(wrapDeg(-190)).toBeCloseTo(170, 9);
    expect(wrapDeg(180)).toBeCloseTo(180, 9);
    expect(wrapDeg(540)).toBeCloseTo(180, 9);
  });
});
