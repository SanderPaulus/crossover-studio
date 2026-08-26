/**
 * A5e.1 — "venster poort, gemiddelde rangschikt, outliers asymmetrisch",
 * tested on synthetic responses where the right answer is known by
 * construction.
 *
 * The asymmetry test is the one that matters most, because it encodes a TASTE
 * decision rather than a measurement: a narrow peak is reported, a narrow dip
 * is forgiven. Getting that backwards would be invisible in any aggregate
 * number and obvious to anyone who listened.
 */

import { describe, expect, it } from 'vitest';
import { logspace } from '../../dsp.ts';
import { judgeResponse } from './response.ts';
import { FLAT_TARGET, targetOffsetsDb, TargetCurveNotImplementedError } from './targetCurve.ts';

const GRID = logspace(100, 10000, 800);
const BAND: [number, number] = [200, 8000];

/** A flat response with one Gaussian feature of `db` at `fHz`, `width` octaves. */
function withFeature(db: number, fHz: number, widthOct: number): number[] {
  return GRID.map((f) => {
    const d = Math.log2(f / fHz) / widthOct;
    return 90 + db * Math.exp(-0.5 * d * d);
  });
}

describe('the SPL window and the RMS deviation', () => {
  it('a perfectly flat response is ±0 with zero RMS', () => {
    const r = judgeResponse(GRID, GRID.map(() => 90), FLAT_TARGET, BAND)!;
    expect(r.windowPlusMinusDb).toBeCloseTo(0, 9);
    expect(r.rmsDeviationDb).toBeCloseTo(0, 9);
    expect(r.narrowPeaks).toEqual([]);
  });

  it('a BROAD feature is inside the window judgement', () => {
    // Half an octave wide: the 1/6-octave smoothing keeps it, so it is exactly
    // the kind of shape the window is meant to catch.
    const r = judgeResponse(GRID, withFeature(3, 1000, 0.5), FLAT_TARGET, BAND)!;
    expect(r.windowPlusMinusDb).toBeGreaterThan(1);
    expect(r.rmsDeviationDb).toBeGreaterThan(0.2);
  });

  it('THE WINDOW AND THE RMS ANSWER DIFFERENT QUESTIONS', () => {
    // Two designs built to reach the SAME window, so the acceptance verdict
    // cannot separate them — and they are nothing alike. One is wrong in a
    // single place, the other is wrong everywhere. If one number served for
    // both questions these would be interchangeable, which is exactly what
    // A5e.1 refused.
    const spike = judgeResponse(GRID, withFeature(6, 3000, 0.05), FLAT_TARGET, BAND)!;

    const ripple = (amp: number) =>
      judgeResponse(
        GRID,
        GRID.map((f) => 90 + amp * Math.sin(2 * Math.PI * Math.log2(f / 200))),
        FLAT_TARGET,
        BAND,
      )!;
    // Scale the ripple until its window matches the spike's.
    const unit = ripple(1);
    const matched = ripple(spike.windowPlusMinusDb / unit.windowPlusMinusDb);

    expect(Math.abs(matched.windowPlusMinusDb - spike.windowPlusMinusDb)).toBeLessThan(0.05);
    // Same acceptance verdict, very different flatness — and the flatness is
    // what the shortlist sorts on.
    expect(matched.rmsDeviationDb).toBeGreaterThan(spike.rmsDeviationDb * 1.4);
  });

  it('the window is referenced to the BAND MEAN, not to an absolute level', () => {
    const quiet = judgeResponse(GRID, withFeature(3, 1000, 0.4), FLAT_TARGET, BAND)!;
    const loud = judgeResponse(
      GRID,
      withFeature(3, 1000, 0.4).map((v) => v + 12),
      FLAT_TARGET,
      BAND,
    )!;
    // Sensitivity is a different question from flatness.
    expect(loud.windowPlusMinusDb).toBeCloseTo(quiet.windowPlusMinusDb, 9);
    expect(loud.rmsDeviationDb).toBeCloseTo(quiet.rmsDeviationDb, 9);
  });

  it('reports the parameters it used, so the number is reproducible (V15)', () => {
    const r = judgeResponse(GRID, withFeature(2, 1000, 0.4), FLAT_TARGET, BAND)!;
    expect(r.smoothingOctaves).toBeCloseTo(1 / 6, 9);
    expect(r.bandHz).toEqual(BAND);
    expect(r.coverage).toBeTruthy();
  });
});

describe('outliers, asymmetrically — the taste principle of A5e.1', () => {
  // A twentieth of an octave: far narrower than the smoothing, so it is
  // removed from the window judgement and lands in the residual.
  const NARROW = 0.05;
  const NARROW_PEAK_HZ = 3000;

  it('a narrow PEAK is reported as a column', () => {
    const r = judgeResponse(GRID, withFeature(4, 3000, NARROW), FLAT_TARGET, BAND)!;
    expect(r.narrowPeaks.length).toBeGreaterThan(0);
    const top = r.narrowPeaks[0];
    expect(top.fHz).toBeGreaterThan(2500);
    expect(top.fHz).toBeLessThan(3600);
    expect(top.db).toBeGreaterThan(1);
    expect(top.q).toBeGreaterThan(1);
    expect(r.notes.join(' ')).toContain('narrow');
  });

  it('a narrow DIP is FORGIVEN — no column, no note, no penalty', () => {
    // The mirror image of the peak above, and the whole decision in one
    // assert: an interference null moves with the listener and fills in, and
    // condemning a design for one is stricter than hearing is.
    const r = judgeResponse(GRID, withFeature(-4, 3000, NARROW), FLAT_TARGET, BAND)!;
    expect(r.narrowPeaks).toEqual([]);
  });

  it('the same feature, up and down, is treated asymmetrically ON PURPOSE', () => {
    const peak = judgeResponse(GRID, withFeature(4, 3000, NARROW), FLAT_TARGET, BAND)!;
    const dip = judgeResponse(GRID, withFeature(-4, 3000, NARROW), FLAT_TARGET, BAND)!;
    expect(peak.narrowPeaks.length).toBeGreaterThan(0);
    expect(dip.narrowPeaks.length).toBe(0);
    // Both still move the RMS — the asymmetry is about what gets REPORTED as a
    // named feature, not about pretending the dip is not there.
    expect(dip.rmsDeviationDb).toBeGreaterThan(0);
  });

  it('the window UNDER-READS a narrow feature, which is why it needs a column', () => {
    const spiky = judgeResponse(GRID, withFeature(6, NARROW_PEAK_HZ, NARROW), FLAT_TARGET, BAND)!;
    // Six decibels of spike, and the smoothing hands the window less than half
    // of it. That is the window doing its job — it judges the shape a listener
    // hears — but it means the window ALONE would let this design read as
    // cleaner than it is.
    expect(spiky.windowPlusMinusDb).toBeLessThan(6 / 2);
    // The column is where the feature's real size shows up.
    expect(spiky.narrowPeaks[0].db).toBeGreaterThan(2);
    expect(spiky.narrowPeaks[0].fHz).toBeGreaterThan(NARROW_PEAK_HZ * 0.8);
    expect(spiky.narrowPeaks[0].fHz).toBeLessThan(NARROW_PEAK_HZ * 1.2);
  });
});

describe('the target curve', () => {
  it('flat is zero offsets everywhere', () => {
    expect(targetOffsetsDb(FLAT_TARGET, GRID).every((v) => v === 0)).toBe(true);
  });

  it('an unimplemented curve REFUSES rather than approximating (A5e.2)', () => {
    // A tilt that quietly behaved like flat would join every window and RMS
    // verdict the shortlist sorts on, and nobody would see it happen.
    expect(() => targetOffsetsDb({ type: 'tilt' }, GRID)).toThrow(TargetCurveNotImplementedError);
    expect(() => targetOffsetsDb({ type: 'hold-current' }, GRID)).toThrow(
      TargetCurveNotImplementedError,
    );
  });
});
