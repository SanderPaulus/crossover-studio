import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KA_TIERS,
  beamingCeilingFromSize,
  breakupCeilingHz,
  breakupHz,
  effectiveBandIec,
  excursionFloorHz,
  firstNullAngleDeg,
  lobingCeilingHz,
} from './driverLimits.ts';
import { pistonDiameterMm } from './cabinet.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (n: string) => readFileSync(join(FIXTURES, n), 'utf-8');

/** Bessel J1 (Abramowitz & Stegun 9.4.4/9.4.6) — so the ka tier constants are
 *  CHECKED against the piston directivity they claim to come from, instead of
 *  being magic numbers copied out of a table. */
function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const num =
      x *
      (72362614232 +
        y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const den =
      144725228442 +
      y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const p =
    1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q =
    0.04687499995 +
    y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -ans : ans;
}

/** Rigid circular piston in an infinite baffle, on-axis normalised. */
const pistonDb = (ka: number, thetaDeg: number): number => {
  const x = ka * Math.sin((thetaDeg * Math.PI) / 180);
  const d = x === 0 ? 1 : (2 * besselJ1(x)) / x;
  return 20 * Math.log10(Math.abs(d));
};

describe('ka tiers', () => {
  it('the tabulated 30-degree differences ARE the piston directivity', () => {
    for (const t of Object.values(KA_TIERS)) {
      // 'measured' is an EMPIRICAL threshold with its ka quoted for context,
      // so it gets the looser tolerance; the ka-derived tiers must be exact.
      expect(-pistonDb(t.ka, 30)).toBeCloseTo(t.diff30Db, t.diff30Db === 4 ? 0 : 1);
    }
  });

  it('defaults to the EMPIRICAL threshold, not the theoretical one', () => {
    // Measured on a real 3-way: at ka = 2 the woofer "beams" from 304 Hz —
    // below the mid's own 2xFs floor — because a measured 0-30 difference at
    // low frequency is baffle diffraction, not cone directivity. The first
    // tier is the one the app defaults to, and it must be the 4 dB one.
    expect(Object.keys(KA_TIERS)[0]).toBe('measured');
    expect(KA_TIERS.measured.diff30Db).toBe(4);
    expect(KA_TIERS.measured.diff30Db).toBeGreaterThan(KA_TIERS.standard.diff30Db);
  });

  it('documents that -6 dB at 30 degrees is far past every published limit', () => {
    // ka = 4.43 is the -6 dB@30 point; it must sit ABOVE the aggressive tier.
    expect(-pistonDb(4.43, 30)).toBeCloseTo(6.02, 1);
    expect(4.43).toBeGreaterThan(KA_TIERS.aggressive.ka);
    // ...and the industry limit is barely 1 dB down. This is the calibration
    // point: a 4 dB threshold is nearly the aggressive tier, not the standard.
    expect(KA_TIERS.standard.diff30Db).toBeLessThan(1.5);
  });

  it('geometric ceiling matches f = ka*c/(pi*d)', () => {
    // 165 mm effective diameter (a nominal 8"): ka=2 -> ~1323 Hz.
    expect(beamingCeilingFromSize(0.165, 'standard')).toBeCloseTo(1323, -1);
    expect(beamingCeilingFromSize(0.11, 'standard')).toBeCloseTo(1985, -1);
    // Higher tier = permission to go higher.
    expect(beamingCeilingFromSize(0.165, 'aggressive')).toBeGreaterThan(
      beamingCeilingFromSize(0.165, 'standard'),
    );
  });
});

describe('lobing ceiling from centre-to-centre spacing', () => {
  it('reproduces the published half- and full-wavelength limits', () => {
    // 300 mm woofer-to-mid: half-wavelength -> 572 Hz, full -> 1143 Hz.
    expect(lobingCeilingHz(300, 0.5)).toBeCloseTo(572, -1);
    expect(lobingCeilingHz(300, 1.0)).toBeCloseTo(1143, -1);
    // 120 mm mid-to-tweeter.
    expect(lobingCeilingHz(120, 1.0)).toBeCloseTo(2858, -1);
    expect(lobingCeilingHz(0)).toBeNull();
  });

  it('places the first null where the geometry says', () => {
    // At exactly half a wavelength the null sits at 90 degrees...
    expect(firstNullAngleDeg(300, lobingCeilingHz(300, 0.5)!)!).toBeCloseTo(90, 0);
    // ...at a full wavelength it has closed to 30 degrees.
    expect(firstNullAngleDeg(300, lobingCeilingHz(300, 1.0)!)!).toBeCloseTo(30, 0);
    // Below half a wavelength there is no forward null at all.
    expect(firstNullAngleDeg(300, 400)).toBeNull();
  });
});

describe('breakup detection', () => {
  const grid = logspace(200, 20000, 400);

  it('finds an injected resonance and ignores a broad hump', () => {
    // Broad +4 dB hump at 1.5 kHz (a baffle wobble) + sharp +12 dB at 6 kHz.
    const spl = grid.map((f) => {
      const hump = 4 / (1 + ((Math.log2(f / 1500)) / 0.9) ** 2);
      const res = 12 / (1 + ((Math.log2(f / 6000)) / 0.08) ** 2);
      return 90 + hump + res;
    });
    const r = breakupHz(grid, spl);
    expect(r).not.toBeNull();
    expect(r!.hz).toBeGreaterThan(5200);
    expect(r!.hz).toBeLessThan(6900);
    expect(r!.prominenceDb).toBeGreaterThan(8);
  });

  it('returns null on a smooth response', () => {
    const spl = grid.map((f) => 90 - 2 * Math.log2(f / 1000));
    expect(breakupHz(grid, spl)).toBeNull();
  });

  it('reports impedance corroboration when the wiggle is there too', () => {
    const spl = grid.map((f) => 90 + 12 / (1 + ((Math.log2(f / 6000)) / 0.08) ** 2));
    const smoothZ = grid.map((f) => 6 + 0.002 * f ** 0.7);
    const rippleZ = smoothZ.map(
      (z, i) => z * (1 + 0.08 / (1 + ((Math.log2(grid[i] / 6000)) / 0.08) ** 2)),
    );
    expect(breakupHz(grid, spl, { zMag: smoothZ })!.corroboratedByZ).toBe(false);
    expect(breakupHz(grid, spl, { zMag: rippleZ })!.corroboratedByZ).toBe(true);
  });

  it('finds the KOAN mid breakup and turns it into a crossover ceiling', () => {
    const raw = parseFrd(load('mid_hor0_mettape.txt'));
    const g = resample(raw.freq, raw.spl, raw.phase, grid, { clampEdges: true });
    const z = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
    const gz = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
    const r = breakupHz(grid, g.spl, { zMag: gz.spl, searchFromHz: 1500 });
    expect(r).not.toBeNull();
    // The KOAN mid's documented breakup sits around 5.5 kHz.
    expect(r!.hz).toBeGreaterThan(4000);
    expect(r!.hz).toBeLessThan(7500);
    // f_b/3 is the harmonic-mapping ceiling; f_b/5 the conservative one.
    expect(breakupCeilingHz(r!.hz)).toBeCloseTo(r!.hz / 3, 6);
    expect(breakupCeilingHz(r!.hz, 5)).toBeLessThan(breakupCeilingHz(r!.hz));
  });
});

describe('IEC 60268-5 effective frequency range', () => {
  const grid = logspace(20, 20000, 600);

  it('brackets a bandpass at its -10 dB points', () => {
    const spl = grid.map((f) => {
      const hp = 20 * Math.log10(1 / Math.sqrt(1 + (300 / f) ** 4));
      const lp = 20 * Math.log10(1 / Math.sqrt(1 + (f / 8000) ** 4));
      return 90 + hp + lp;
    });
    const band = effectiveBandIec(grid, spl)!;
    expect(band[0]).toBeGreaterThan(150);
    expect(band[0]).toBeLessThan(300);
    expect(band[1]).toBeGreaterThan(8000);
    expect(band[1]).toBeLessThan(16000);
  });

  it('NEGLECTS a trough narrower than 1/9 octave (the standard says so)', () => {
    const flat = grid.map(() => 90);
    const withNotch = grid.map((f) =>
      Math.abs(Math.log2(f / 2000)) < 0.5 / 9 ? 90 - 25 : 90,
    );
    const a = effectiveBandIec(grid, flat)!;
    const b = effectiveBandIec(grid, withNotch)!;
    // A deep but narrow notch must not truncate the band.
    expect(b[0]).toBeCloseTo(a[0], 5);
    expect(b[1]).toBeCloseTo(a[1], 5);
  });

  it('DOES stop at a wide hole', () => {
    const wide = grid.map((f) => (Math.abs(Math.log2(f / 2000)) < 0.5 ? 90 - 25 : 90));
    const band = effectiveBandIec(grid, wide)!;
    expect(band[1]).toBeLessThan(2000);
  });

  it('runs on the measured KOAN drivers', () => {
    for (const [file, loEdge, hiEdge] of [
      ['mid_hor0_mettape.txt', 500, 25000],
      ['tweet_hor0_mettape.txt', 900, 25000],
    ] as [string, number, number][]) {
      const raw = parseFrd(load(file));
      const g = resample(raw.freq, raw.spl, raw.phase, grid, { clampEdges: true });
      const band = effectiveBandIec(grid, g.spl)!;
      expect(band).not.toBeNull();
      expect(band[0]).toBeLessThan(loEdge);
      expect(band[1]).toBeLessThan(hiEdge);
      expect(band[1]).toBeGreaterThan(band[0] * 4);
    }
  });
});

describe('excursion floor', () => {
  it('reproduces the published tweeter figures', () => {
    // 1" dome, Sd 7 cm2, Xmax 0.5 mm.
    expect(excursionFloorHz(7, 0.5, 90)!).toBeCloseTo(587, -1);
    expect(excursionFloorHz(7, 0.5, 96)!).toBeCloseTo(829, -1);
    // A 5" mid at 96 dB is nowhere near limited in its own band.
    expect(excursionFloorHz(130, 5, 96)!).toBeLessThan(100);
  });

  it('matches Linkwitz\'s own published SPL for the D2905/9700', () => {
    // He states 101 dB at 1400 Hz, 1 m, FREE FIELD for Sd 8.5 cm2 / Xmax 0.5 mm.
    // Inverting: the floor for 100.8 dB free-field must land on 1400 Hz.
    const f = excursionFloorHz(8.5, 0.5, 100.8, { halfSpace: false })!;
    expect(f).toBeCloseTo(1400, -2);
  });

  it('is level-aware — the whole reason it beats a bare Fs multiple', () => {
    const at90 = excursionFloorHz(7, 0.5, 90)!;
    const at102 = excursionFloorHz(7, 0.5, 102)!;
    expect(at102 / at90).toBeCloseTo(10 ** (12 / 40), 2); // +12 dB -> x2 in f
  });

  it('returns null without the datasheet numbers', () => {
    expect(excursionFloorHz(0, 0.5, 90)).toBeNull();
    expect(excursionFloorHz(7, 0, 90)).toBeNull();
  });
});

describe('several identical drivers in one branch', () => {
  it('drops the excursion floor by √n, and Sd stays the SINGLE cone', () => {
    const one = excursionFloorHz(124.7, 6, 96)!;
    const two = excursionFloorHz(124.7, 6, 96, { count: 2 })!;
    const four = excursionFloorHz(124.7, 6, 96, { count: 4 })!;
    // Twice the displacement buys √2, not 2 — four woofers buy one octave.
    expect(one / two).toBeCloseTo(Math.SQRT2, 6);
    expect(one / four).toBeCloseTo(2, 6);
    // Absent or nonsensical counts must read as one driver, never as zero
    // displacement (which would divide by zero and report an infinite floor).
    expect(excursionFloorHz(124.7, 6, 96, { count: 0 })).toBeCloseTo(one, 9);
    expect(excursionFloorHz(124.7, 6, 96, { count: 1 })).toBeCloseTo(one, 9);
  });

  it('the cone diameter is NOT the array — that is what keeps beaming honest', () => {
    // Folding the count into Sd (the tempting shortcut) would model one big
    // piston: 2 × 124.7 cm² reads as a 178 mm cone instead of the real 126 mm,
    // so the beaming ceiling would be attributed to a driver that does not
    // exist. The array's own ceiling comes from SPACING instead.
    expect(pistonDiameterMm(124.7)!).toBeCloseTo(126, 0);
    expect(pistonDiameterMm(2 * 124.7)!).toBeCloseTo(178, 0);
    // Two woofers 205 mm apart lobe at 837 Hz — far below where either cone
    // starts beaming, which is exactly why a dual-woofer branch crosses low.
    expect(lobingCeilingHz(205, 0.5)!).toBeCloseTo(837, 0);
  });
});
