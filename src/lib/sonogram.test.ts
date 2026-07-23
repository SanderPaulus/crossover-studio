import { describe, expect, it } from 'vitest';
import type { DirectivityResult } from './directivity.ts';
import {
  beamwidth6dBHalfAngle,
  buildSonogram,
  sonogramBandT,
  sonogramColor,
  sonogramRamp,
} from './sonogram.ts';

/** Minimal DirectivityResult with only the fields the sonogram uses. */
function dirResult(
  angles: number[],
  combinedByAngle: number[][],
  freq?: number[],
): DirectivityResult {
  const n = combinedByAngle[0].length;
  return {
    freq: freq ?? Array.from({ length: n }, (_, i) => 1000 * 2 ** i),
    angles,
    combinedByAngle,
    powerDb: new Array(n).fill(0),
    listeningWindowDb: new Array(n).fill(0),
    diDb: new Array(n).fill(0),
  };
}

describe('buildSonogram', () => {
  const dir = dirResult(
    [0, 30, 60],
    [
      [80, 84],
      [74, 82],
      [62, 78],
    ],
  );

  it('mirrors one-sided angles to ± and keeps ascending order', () => {
    const s = buildSonogram(dir, 'normalized');
    expect(s.angles).toEqual([-60, -30, 0, 30, 60]);
    expect(s.values[0]).toEqual(s.values[4]); // −60 mirrors 60
    expect(s.values[1]).toEqual(s.values[3]);
  });

  it('normalized mode zeroes the on-axis row and references per frequency', () => {
    const s = buildSonogram(dir, 'normalized');
    expect(s.values[2]).toEqual([0, 0]);
    expect(s.values[3]).toEqual([-6, -2]); // 30° rel. on-axis
    expect(s.values[4]).toEqual([-18, -6]);
  });

  it('absolute mode references the loudest point in the whole grid', () => {
    const s = buildSonogram(dir, 'absolute');
    const max = Math.max(...s.values.flat());
    expect(max).toBe(0); // 84 dB at 0°, second freq
    expect(s.values[2]).toEqual([-4, 0]);
    expect(s.values[3]).toEqual([-10, -2]);
  });

  it('handles unsorted input angles', () => {
    const shuffled = dirResult(
      [60, 0, 30],
      [
        [62, 78],
        [80, 84],
        [74, 82],
      ],
    );
    const s = buildSonogram(shuffled, 'normalized');
    expect(s.angles).toEqual([-60, -30, 0, 30, 60]);
    expect(s.values[3]).toEqual([-6, -2]);
  });
});

describe('beamwidth6dBHalfAngle', () => {
  it('finds the exact measured angle when the drop hits −6 there', () => {
    const dir = dirResult([0, 30, 60], [[80], [74], [62]]);
    expect(beamwidth6dBHalfAngle(dir)[0]).toBeCloseTo(30, 10);
  });

  it('interpolates linearly between measured angles', () => {
    // rel: 0, −4, −12 → crossing at 30 + (60−30)·(−6+4)/(−12+4) = 37.5°
    const dir = dirResult([0, 30, 60], [[80], [76], [68]]);
    expect(beamwidth6dBHalfAngle(dir)[0]).toBeCloseTo(37.5, 10);
  });

  it('returns NaN when the pattern is wider than the measured range', () => {
    const dir = dirResult([0, 30, 60], [[80], [79], [78]]);
    expect(beamwidth6dBHalfAngle(dir)[0]).toBeNaN();
  });

  it('takes the first crossing when lobing recovers past −6', () => {
    // rel: 0, −8, −2 → crossing in the first segment at 22.5°
    const dir = dirResult([0, 30, 60], [[80], [72], [78]]);
    expect(beamwidth6dBHalfAngle(dir)[0]).toBeCloseTo(22.5, 10);
  });

  it('is per-frequency independent', () => {
    const dir = dirResult(
      [0, 30],
      [
        [80, 80],
        [74, 79],
      ],
    );
    const bw = beamwidth6dBHalfAngle(dir);
    expect(bw[0]).toBeCloseTo(30, 10);
    expect(bw[1]).toBeNaN();
  });
});

describe('sonogramBandT', () => {
  it('quantizes into 3 dB bands: 0 dB band = 1, floor band = 0', () => {
    expect(sonogramBandT(0, -24)).toBe(1);
    expect(sonogramBandT(-2.9, -24)).toBe(1); // still the top band
    expect(sonogramBandT(-24, -24)).toBe(0);
    expect(sonogramBandT(-99, -24)).toBe(0); // clamps below the floor
  });

  it('puts a band boundary in the quieter band and steps evenly', () => {
    // floor −24 → 8 bands → t steps of 1/7.
    expect(sonogramBandT(-3, -24)).toBeCloseTo(1 - 1 / 7, 12);
    expect(sonogramBandT(-5.9, -24)).toBeCloseTo(1 - 1 / 7, 12);
    expect(sonogramBandT(-6, -24)).toBeCloseTo(1 - 2 / 7, 12);
  });

  it('adapts the band count to the floor', () => {
    // floor −30 → 10 bands → second band t = 1 − 1/9.
    expect(sonogramBandT(-3, -30)).toBeCloseTo(1 - 1 / 9, 12);
  });
});

describe('sonogramColor', () => {
  it('hits the ramp endpoints and clamps outside [0,1]', () => {
    expect(sonogramColor(0, false)).toEqual([0xcd, 0xe2, 0xfb]); // quiet = light
    expect(sonogramColor(1, false)).toEqual([0x0d, 0x36, 0x6b]); // loud = dark
    expect(sonogramColor(-5, false)).toEqual(sonogramColor(0, false));
    expect(sonogramColor(7, false)).toEqual(sonogramColor(1, false));
  });

  it('flips the anchor in dark mode (quiet recedes toward the dark surface)', () => {
    expect(sonogramColor(0, true)).toEqual([0x0d, 0x36, 0x6b]);
    expect(sonogramColor(1, true)).toEqual([0xcd, 0xe2, 0xfb]);
    expect(sonogramRamp(true)).toEqual([...sonogramRamp(false)].reverse());
  });

  it('interpolates monotonically in luminance along the light ramp', () => {
    const lum = (rgb: [number, number, number]) =>
      0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const l = lum(sonogramColor(t, false));
      expect(l).toBeLessThanOrEqual(prev + 1e-9);
      prev = l;
    }
  });
});
