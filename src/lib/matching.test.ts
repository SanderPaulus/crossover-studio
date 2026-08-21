import { describe, expect, it } from 'vitest';
import { compareDrivers } from './matching.ts';
import type { FrdMeasurement } from './types.ts';

const FREQ = Array.from({ length: 400 }, (_, i) => 100 * (20000 / 100) ** (i / 399));

/** A driver response with optional, deliberately shaped deviations. */
function driver(
  opts: { offsetDb?: number; tiltDb?: number; bumpDb?: number; bumpHz?: number; delayUs?: number } = {},
): FrdMeasurement {
  const { offsetDb = 0, tiltDb = 0, bumpDb = 0, bumpHz = 700, delayUs = 0 } = opts;
  const spl: number[] = [];
  const phase: number[] = [];
  for (const f of FREQ) {
    // Something with structure, so a comparison has more than a flat line.
    const base = 88 - 2 * Math.log10(f / 100) + 0.4 * Math.sin(Math.log2(f / 100) * 2.7);
    const tilt = tiltDb * (Math.log2(f / 500) / Math.log2(1000 / 500));
    const bump = bumpDb === 0 ? 0 : bumpDb * Math.exp(-((Math.log2(f / bumpHz) / 0.12) ** 2));
    spl.push(base + offsetDb + tilt + bump);
    phase.push(-30 * Math.log2(f / 100) - 360 * f * (delayUs * 1e-6));
  }
  return { freq: [...FREQ], spl, phase, meta: { rawComments: [] } };
}

describe('matching report — the only diagnosis the parallel impedance cannot give', () => {
  it('two identical drivers pass, and nothing is aligned away', () => {
    const r = compareDrivers(driver(), driver())!;
    expect(r.band[0]).toBeCloseTo(500, 0);
    expect(r.band[1]).toBeCloseTo(1000, 0);
    expect(r.maxAbsDb).toBeLessThan(1e-9);
    expect(r.maxAbsDeg).toBeLessThan(1e-9);
    expect(r.flagged).toBe(false);
    expect(r.lines.join('\n')).toMatch(/✓ within tolerance/);
  });

  it('a flat sensitivity difference is REPORTED, not fitted away', () => {
    // This is the difference verification.compareMeasurement would remove as a
    // level offset. Here it is the answer.
    const r = compareDrivers(driver(), driver({ offsetDb: 0.8 }))!;
    expect(r.meanAbsDb).toBeCloseTo(0.8, 6);
    expect(r.maxAbsDb).toBeCloseTo(0.8, 6);
    expect(r.flagged).toBe(true);
    const text = r.lines.join('\n');
    expect(text).toMatch(/⚠ outside tolerance/);
    expect(text).toMatch(/flat -0\.80 dB across the whole band/); // A − B: B is the hotter sample
    expect(text).toMatch(/sensitivity difference/);
  });

  it('a deviation that grows with frequency reads as mounting or a leak', () => {
    const r = compareDrivers(driver(), driver({ tiltDb: 1.2 }))!;
    expect(r.flagged).toBe(true);
    const text = r.lines.join('\n');
    expect(text).toMatch(/grows with frequency/);
    expect(text).toMatch(/mounting, gasket or a leak/);
    expect(text).not.toMatch(/sensitivity difference/);
  });

  it('a local deviation around a resonance reads as cone or suspension', () => {
    const r = compareDrivers(driver(), driver({ bumpDb: 1.5, bumpHz: 700 }))!;
    expect(r.flagged).toBe(true);
    expect(r.maxAbsDbAtHz).toBeGreaterThan(650);
    expect(r.maxAbsDbAtHz).toBeLessThan(760);
    const text = r.lines.join('\n');
    expect(text).toMatch(/local rather than broad/);
    expect(text).toMatch(/cone or suspension difference/);
  });

  it('a delay difference shows up as phase, and is not fitted out either', () => {
    // 20 µs is 3.6° at 500 Hz and 7.2° at 1 kHz — over the flag line at the top
    // of the band, which is exactly the kind of mounting difference worth
    // seeing. compareMeasurement would have removed it as "mic distance".
    const r = compareDrivers(driver(), driver({ delayUs: 20 }))!;
    expect(r.maxAbsDeg).toBeGreaterThan(5);
    expect(r.maxAbsDegAtHz).toBeGreaterThan(900);
    expect(r.flagged).toBe(true);
    expect(r.maxAbsDb).toBeLessThan(1e-9); // level untouched: it really is phase
  });

  it('the tolerance line is exactly 0.5 dB / 5°', () => {
    expect(compareDrivers(driver(), driver({ offsetDb: 0.45 }))!.flagged).toBe(false);
    expect(compareDrivers(driver(), driver({ offsetDb: 0.55 }))!.flagged).toBe(true);
    // 5° at the top of the band: 14 µs gives 5.04° at 1 kHz.
    expect(compareDrivers(driver(), driver({ delayUs: 10 }))!.flagged).toBe(false);
    expect(compareDrivers(driver(), driver({ delayUs: 20 }))!.flagged).toBe(true);
  });

  it('always states that the parallel impedance cannot answer this question', () => {
    const text = compareDrivers(driver(), driver())!.lines.join('\n');
    expect(text).toMatch(/ONLY matching diagnosis/);
    expect(text).toMatch(/averages any/);
    expect(text).toMatch(/solo LIMP sweep/);
    expect(text).toMatch(/never as model input/);
  });

  it('refuses when the two files barely overlap the band instead of comparing thin air', () => {
    const short: FrdMeasurement = {
      freq: [100, 200, 300],
      spl: [90, 90, 90],
      phase: [0, 0, 0],
      meta: { rawComments: [] },
    };
    expect(compareDrivers(driver(), short)).toBeNull();
  });
});
