import { describe, it, expect } from 'vitest';
import { evalHpLp, evalEqBand, evalDriverFilter, defaultHpLp, defaultEq } from './filters.ts';
import type { DriverFilterSpec, HpLpSpec } from './filters.ts';
import { abs, arg } from './complex.ts';

const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im));
const deg = (c: { re: number; im: number }) => (Math.atan2(c.im, c.re) * 180) / Math.PI;

const spec = (kind: 'BW' | 'LR', order: 1 | 2 | 3 | 4, freq: number): HpLpSpec => ({
  enabled: true,
  kind,
  order,
  freq,
});

describe('evalHpLp — textbook anchor points', () => {
  it('LR2 is −6.02 dB at fc (both modes), Butterworth is −3.01 dB', () => {
    expect(db(evalHpLp(spec('LR', 2, 2900), 'hp', 2900))).toBeCloseTo(-6.02, 1);
    expect(db(evalHpLp(spec('LR', 2, 2900), 'lp', 2900))).toBeCloseTo(-6.02, 1);
    expect(db(evalHpLp(spec('LR', 4, 2000), 'lp', 2000))).toBeCloseTo(-6.02, 1);
    expect(db(evalHpLp(spec('BW', 2, 1000), 'lp', 1000))).toBeCloseTo(-3.01, 1);
    expect(db(evalHpLp(spec('BW', 4, 1000), 'lp', 1000))).toBeCloseTo(-3.01, 1);
    expect(db(evalHpLp(spec('BW', 3, 1000), 'hp', 1000))).toBeCloseTo(-3.01, 1);
  });

  it('slopes: order n rolls off at 6n dB/oct far from fc', () => {
    // BW4 LP at 4·fc: |H| = 1/√(1+4^8) → ≈ −48.2 dB.
    expect(db(evalHpLp(spec('BW', 4, 1000), 'lp', 4000))).toBeCloseTo(-48.2, 1);
    // LR2 HP at fc/4: squared 1st-order → (0.25/√1.0625)² ≈ −24.6 dB.
    expect(db(evalHpLp(spec('LR', 2, 2900), 'hp', 725))).toBeCloseTo(-24.6, 1);
    // Passband asymptote → 0 dB.
    expect(db(evalHpLp(spec('LR', 4, 2000), 'lp', 100))).toBeCloseTo(0, 2);
    expect(db(evalHpLp(spec('LR', 2, 2900), 'hp', 40000))).toBeCloseTo(0, 1);
  });

  it('phase: LP and HP of the same LR2 are in phase (the LR property)', () => {
    // LR crossover: LP + HP sum flat because they share phase at every f.
    for (const f of [500, 2900, 10000]) {
      const lp = evalHpLp(spec('LR', 2, 2900), 'lp', f);
      const hp = evalHpLp(spec('LR', 2, 2900), 'hp', f);
      // LR2 sections are 180° apart (classic — hence the tweeter inversion);
      // check the difference is exactly 180°, not something in between.
      const d = Math.abs(deg(lp) - deg(hp));
      expect(Math.min(d, 360 - d)).toBeCloseTo(180, 1);
    }
  });

  it('rejects odd-order Linkwitz-Riley', () => {
    expect(() => evalHpLp(spec('LR', 3, 1000), 'lp', 500)).toThrow(/even orders/);
  });
});

describe('evalEqBand', () => {
  it('hits the exact gain at centre frequency and 0 dB far away', () => {
    const band = { enabled: true, freq: 6500, gainDb: -10, q: 0.5 };
    expect(db(evalEqBand(band, 6500))).toBeCloseTo(-10, 3);
    expect(db(evalEqBand(band, 65))).toBeCloseTo(0, 1);
    expect(db(evalEqBand(band, 650000))).toBeCloseTo(0, 1);
  });

  it('is symmetric: boost and cut cancel', () => {
    const cut = { enabled: true, freq: 3000, gainDb: -8, q: 2 };
    const boost = { enabled: true, freq: 3000, gainDb: 8, q: 2 };
    for (const f of [1500, 3000, 6000]) {
      const prod = abs(evalEqBand(cut, f)) * abs(evalEqBand(boost, f));
      expect(prod).toBeCloseTo(1, 6);
    }
  });

  it('lower Q is wider', () => {
    const narrow = { enabled: true, freq: 6500, gainDb: -10, q: 4 };
    const wide = { enabled: true, freq: 6500, gainDb: -10, q: 0.5 };
    // One octave off-centre the wide band still cuts, the narrow barely.
    expect(db(evalEqBand(wide, 3250))).toBeLessThan(-3);
    expect(db(evalEqBand(narrow, 3250))).toBeGreaterThan(-1);
  });
});

describe('evalDriverFilter', () => {
  it("chains Sander's tweeter proposal: LR2 HP 2.9k + notch 6.5k −10 dB Q 0.5", () => {
    const tweeter: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [{ ...defaultEq(6500, -10, 0.5), enabled: true }],
    };
    const grid = [500, 2900, 6500, 15000];
    const h = evalDriverFilter(tweeter, grid);
    expect(db(h[0])).toBeLessThan(-25); // deep stopband at 500 Hz
    // At 6.5 kHz: HP ≈ 0 dB (well above 2.9k, minor), notch −10 dB dominates.
    expect(db(h[2])).toBeLessThan(-8);
    expect(db(h[2])).toBeGreaterThan(-14);
    // Far top: HP flat; the Q 0.5 notch is WIDE, so 15 kHz still sits in its
    // skirt (≈ −5.6 dB) — recovering, but nowhere near flat yet.
    expect(db(h[3])).toBeGreaterThan(db(h[2]));
    expect(db(h[3])).toBeLessThan(-3);
    // At fc: −6 dB from HP plus the wide notch's skirt.
    expect(db(h[1])).toBeLessThan(-6);
  });

  it('gain block shifts everything uniformly', () => {
    const s: DriverFilterSpec = {
      gainDb: -3,
      hp: defaultHpLp(100),
      lp: defaultHpLp(20000),
      eq: [],
    };
    const h = evalDriverFilter(s, [100, 1000, 10000]);
    for (const c of h) expect(db(c)).toBeCloseTo(-3, 6);
    expect(arg(h[1])).toBeCloseTo(0, 6);
  });
});

describe('shelf EQ bands', () => {
  it('lowShelf: full gain far below f0, unity far above', () => {
    const band = { enabled: true, type: 'lowShelf' as const, freq: 9000, gainDb: -5.5, q: 0.71 };
    expect(db(evalEqBand(band, 90))).toBeCloseTo(-5.5, 2);
    expect(db(evalEqBand(band, 900000))).toBeCloseTo(0, 2);
    // Half the cut around f0.
    expect(db(evalEqBand(band, 9000))).toBeCloseTo(-2.75, 1);
  });

  it('highShelf: full gain far above f0, unity far below', () => {
    const band = { enabled: true, type: 'highShelf' as const, freq: 3000, gainDb: 4, q: 0.71 };
    expect(db(evalEqBand(band, 300000))).toBeCloseTo(4, 2);
    expect(db(evalEqBand(band, 30))).toBeCloseTo(0, 2);
  });

  it('untyped bands stay peaks (backward compatible)', () => {
    const band = { enabled: true, freq: 6500, gainDb: -10, q: 0.5 };
    expect(db(evalEqBand(band, 6500))).toBeCloseTo(-10, 3);
    expect(db(evalEqBand(band, 65))).toBeCloseTo(0, 1);
  });
});

describe('Bessel alignments', () => {
  const bs = (order: 1 | 2 | 3 | 4, freq: number): HpLpSpec => ({
    enabled: true,
    kind: 'BS',
    order,
    freq,
  });

  it('is −3 dB at fc for orders 2–4 (both modes)', () => {
    for (const order of [2, 3, 4] as const) {
      expect(db(evalHpLp(bs(order, 2000), 'lp', 2000))).toBeCloseTo(-3.01, 1);
      expect(db(evalHpLp(bs(order, 2000), 'hp', 2000))).toBeCloseTo(-3.01, 1);
    }
  });

  it('reaches the asymptotic 6n dB/oct rolloff and a flat passband', () => {
    // Far into the stopband every all-pole filter rolls at 6n dB/oct: one
    // octave further down must cost ≈ 6·order dB.
    for (const order of [2, 3, 4] as const) {
      const d1 = db(evalHpLp(bs(order, 1000), 'lp', 16000));
      const d2 = db(evalHpLp(bs(order, 1000), 'lp', 32000));
      expect(d1 - d2).toBeCloseTo(6.02 * order, 0);
      expect(db(evalHpLp(bs(order, 1000), 'lp', 20))).toBeCloseTo(0, 2);
    }
  });

  it('HP is the exact s→1/s mirror of LP (magnitude symmetry around fc)', () => {
    for (const r of [1.5, 3, 8]) {
      const lp = db(evalHpLp(bs(4, 1000), 'lp', 1000 * r));
      const hp = db(evalHpLp(bs(4, 1000), 'hp', 1000 / r));
      expect(lp).toBeCloseTo(hp, 6);
    }
  });

  it('has gentler phase than Butterworth of the same order near fc', () => {
    // The whole point of Bessel: maximally flat group delay — less phase
    // rotation through the crossover region than BW4.
    const phaseAt = (kind: 'BW' | 'BS', f: number) =>
      deg(evalHpLp({ enabled: true, kind, order: 4, freq: 1000 }, 'lp', f));
    expect(Math.abs(phaseAt('BS', 800))).toBeLessThan(Math.abs(phaseAt('BW', 800)));
  });
});
