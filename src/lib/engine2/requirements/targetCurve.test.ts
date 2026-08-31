/**
 * A5e.2 / V45 — THE TARGET CURVE AS AN OBJECT, on one bench.
 *
 * The four kinds the metric procedure asks for, and the bench is built so each
 * one is checkable by hand:
 *
 *  · HAND CALCULATION. Depth 6 dB and a step at 400 Hz, read at frequencies
 *    where `-depth/(1 + f/f0)` is a whole or half number: 200 Hz gives -4,
 *    400 Hz gives -3 (half the depth AT the corner, which is what "the step
 *    frequency" means), 1200 Hz gives -1.5 and 4400 Hz gives -0.5.
 *  · P2 — the identity. `flat` is zero everywhere and `isFlatTargetLevel` says
 *    so, because a run that states the neutral reference has to be
 *    indistinguishable from a run that states nothing.
 *  · NEW MEASUREMENT — the counter-proof that DEPTH and STEP are two
 *    quantities and not one number under two names: depth SCALES every point
 *    and moves no corner, the step MOVES the corner and scales nothing.
 *  · REFUSAL. A stated shape whose parameters did not arrive produces no
 *    offsets and names what was missing (P4), and an unimplemented shape
 *    refuses rather than approximating.
 */

import { describe, expect, it } from 'vitest';
import {
  FLAT_TARGET,
  TargetCurveDataMissingError,
  TargetCurveNotImplementedError,
  describeTargetCurve,
  isImplemented,
  targetLevelCurveFor,
  targetOffsetsDb,
  type TargetCurve,
} from './targetCurve.ts';
import { isFlatTargetLevel, targetLevelAt } from '../../targetLevel.ts';

/** Depth and corner chosen so every reading below is a whole or half decibel. */
const DEPTH_DB = 6;
const STEP_HZ = 400;
const PLATEAU: TargetCurve = {
  type: 'bass-plateau',
  plateauDepthDb: DEPTH_DB,
  stepHz: STEP_HZ,
};

describe('V45 — the bass-plateau target curve', () => {
  it('the shelf is what a hand calculation says it is', () => {
    const grid = [200, 400, 1200, 4400];
    const got = targetOffsetsDb(PLATEAU, grid);
    // -depth / (1 + f/f0): 6/1.5, 6/2, 6/4, 6/12.
    expect(got[0]).toBeCloseTo(-4, 12);
    expect(got[1]).toBeCloseTo(-3, 12);
    expect(got[2]).toBeCloseTo(-1.5, 12);
    expect(got[3]).toBeCloseTo(-0.5, 12);
    // HALF the depth AT the corner is what "the step frequency" means, and it
    // is the one point of the shape a reader can check without arithmetic.
    expect(got[1]).toBeCloseTo(-DEPTH_DB / 2, 12);
  });

  it('it approaches the full depth below and zero above, and never overshoots', () => {
    const grid = [1, 10, 100, 1_000, 10_000, 100_000];
    const got = targetOffsetsDb(PLATEAU, grid);
    for (const v of got) {
      expect(v).toBeLessThanOrEqual(0);
      expect(v).toBeGreaterThanOrEqual(-DEPTH_DB);
    }
    // Monotone: a shelf that wobbled would be a different shape wearing this
    // one's name.
    for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThan(got[i - 1]);
    expect(got[0]).toBeCloseTo(-DEPTH_DB, 1);
    expect(got[got.length - 1]).toBeCloseTo(0, 1);
  });

  it('P2 — flat is the identity, and it says so', () => {
    const grid = [20, 200, 2_000, 20_000];
    expect(targetOffsetsDb(FLAT_TARGET, grid)).toEqual([0, 0, 0, 0]);
    const curve = targetLevelCurveFor(FLAT_TARGET, grid)!;
    expect(isFlatTargetLevel(curve)).toBe(true);
    // ...and the plateau is NOT the identity, or the assertion above would be
    // true of a function that returns zeroes whatever it is handed (V23).
    expect(isFlatTargetLevel(targetLevelCurveFor(PLATEAU, grid)!)).toBe(false);
  });

  it('NEW MEASUREMENT — depth scales and moves no corner; the step moves the corner', () => {
    const grid = [50, 100, 200, 400, 800, 1600, 3200];
    const base = targetOffsetsDb(PLATEAU, grid);
    const deeper = targetOffsetsDb({ ...PLATEAU, plateauDepthDb: DEPTH_DB * 2 }, grid);
    const lower = targetOffsetsDb({ ...PLATEAU, stepHz: STEP_HZ / 2 }, grid);

    // DEPTH: every point is scaled by exactly the same factor, so the SHAPE is
    // untouched — the corner has not moved a hertz.
    for (let i = 0; i < grid.length; i++) expect(deeper[i]).toBeCloseTo(2 * base[i], 12);

    /* STEP: not a scaling of anything. The half-depth point IS the corner by
     * construction, so halving the step must halve the frequency at which the
     * curve reads -depth/2 — and that is a claim no rescaling of `base` can
     * satisfy. This is the counter-proof that the two parameters are two
     * quantities; without it, "depth" and "step" could be one number read
     * twice. */
    const halfDepthAt = (offs: number[], depth: number): number => {
      const target = -depth / 2;
      for (let i = 1; i < grid.length; i++) {
        if (offs[i] >= target) {
          const t = (target - offs[i - 1]) / (offs[i] - offs[i - 1]);
          return grid[i - 1] * (grid[i] / grid[i - 1]) ** t;
        }
      }
      return NaN;
    };
    expect(halfDepthAt(base, DEPTH_DB)).toBeCloseTo(STEP_HZ, 6);
    expect(halfDepthAt(deeper, DEPTH_DB * 2)).toBeCloseTo(STEP_HZ, 6);
    expect(halfDepthAt(lower, DEPTH_DB)).toBeCloseTo(STEP_HZ / 2, 6);
    // And the two really do differ somewhere, so "moves nothing" is falsifiable.
    expect(lower.some((v, i) => Math.abs(v - base[i]) > 0.5)).toBe(true);
  });

  it('P4 — a stated shape whose parameters did not arrive refuses, and names them', () => {
    const grid = [100, 1_000];
    for (const [curve, wanted] of [
      [{ type: 'bass-plateau', stepHz: STEP_HZ } as TargetCurve, 'plateau depth'],
      [{ type: 'bass-plateau', plateauDepthDb: DEPTH_DB } as TargetCurve, 'baffle-step frequency'],
      [{ type: 'bass-plateau' } as TargetCurve, 'plateau depth'],
    ] as const) {
      expect(() => targetOffsetsDb(curve, grid)).toThrow(TargetCurveDataMissingError);
      try {
        targetOffsetsDb(curve, grid);
      } catch (e) {
        expect((e as Error).message).toContain(wanted);
      }
      // A curve nothing can sample steers nothing, and it says which of the two
      // reasons applies rather than reading as "flat".
      expect(isImplemented(curve)).toBe(false);
      expect(targetLevelCurveFor(curve, grid)).toBeNull();
      expect(describeTargetCurve(curve)).toContain('did not arrive');
    }
  });

  it('an unimplemented shape still refuses rather than approximating', () => {
    for (const type of ['tilt', 'hold-current'] as const) {
      expect(() => targetOffsetsDb({ type }, [100])).toThrow(TargetCurveNotImplementedError);
      expect(isImplemented({ type })).toBe(false);
      expect(describeTargetCurve({ type })).toContain('not implemented');
    }
  });

  it('the description carries both parameters, because neither alone is the curve', () => {
    const d = describeTargetCurve(PLATEAU);
    expect(d).toContain(DEPTH_DB.toFixed(1));
    expect(d).toContain(String(STEP_HZ));
    expect(describeTargetCurve(FLAT_TARGET)).toContain('neutral reference');
  });
});

/* ================================================================== *
 * The carrier — one interpolator, read by the tuner as well
 * ================================================================== */

describe('V45 — reading a sampled target curve at a frequency', () => {
  const curve = { freqHz: [100, 1_000], db: [-6, 0] };

  it('interpolates in the LOG domain, which is where a decade is a decade', () => {
    // The geometric mean of the two samples is half way in log-f, so a
    // log-domain reading lands exactly half way in dB. A linear-in-frequency
    // interpolator would read -3.6 here, and the difference is the test.
    const mid = Math.sqrt(100 * 1_000);
    expect(targetLevelAt(curve, [mid])[0]).toBeCloseTo(-3, 12);
    expect(targetLevelAt(curve, [100, 1_000])).toEqual([-6, 0]);
  });

  it('CLAMPS at both ends rather than extrapolating a slope nobody stated', () => {
    expect(targetLevelAt(curve, [1, 10, 99])).toEqual([-6, -6, -6]);
    expect(targetLevelAt(curve, [1_001, 20_000])).toEqual([0, 0]);
  });

  it('an empty curve is the identity — a caller with nothing to say shifts nothing', () => {
    expect(targetLevelAt({ freqHz: [], db: [] }, [10, 100])).toEqual([0, 0]);
    expect(isFlatTargetLevel({ freqHz: [], db: [] })).toBe(true);
  });

  it('the same curve on two different grids is the SAME curve', () => {
    /* The claim that makes the tuner safe. It evaluates its objective on a
     * decimated grid and its reports on the full one, so an offsets array
     * indexed by POSITION would quietly mean two different curves; read by
     * frequency, a decimated grid returns the decimation of the full reading. */
    const full = Array.from({ length: 41 }, (_, i) => 100 * 10 ** (i / 40));
    const dense = targetLevelAt(curve, full);
    const every4 = full.filter((_, i) => i % 4 === 0);
    expect(targetLevelAt(curve, every4)).toEqual(dense.filter((_, i) => i % 4 === 0));
  });
});
