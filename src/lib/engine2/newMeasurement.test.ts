/**
 * A7 — THE NEW-MEASUREMENT TEST.
 *
 * "Neem een casusboek-meting, verschuif synthetisch f_s of voeg een
 * breakup-piek toe, en assert dat alle afgeleide parameters en banden
 * meebewegen. Dit bewijst per build dat de regels op data werken en niet op
 * onthouden constanten."
 *
 * That last sentence is the whole reason this file exists, and it is a
 * stronger statement than the P6 lint makes. The lint proves no frequency is
 * WRITTEN in the code; this proves none is REMEMBERED — that every band really
 * is recomputed from the measurement in front of it, including the bands that
 * are two or three derivations downstream (M-D's evaluation band, the
 * crossover-window floor, the breakup ceiling).
 *
 * The mutations are deliberately crude: scale a frequency axis, add a bump.
 * A subtle mutation would let a half-derived band pass.
 */

import { describe, expect, it } from 'vitest';
import {
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import { runIngest } from './ingest/derive.ts';
import { buildReport } from './report.ts';
import { ctcKey } from './metrics/types.ts';

const golden = loadGolden();
/* M-1 — THE GATED SET, deliberately: the synthetic changes below are injected
 * into gated far-field files and the claims are about the gate floor (a peak
 * below it is not detected, the f_s floor only binds above it). The default
 * set's woofer and mid are NF/FF merges with a merge-block floor, on which
 * those claims do not apply — `mergeBlock.test.ts` covers that set. */
const manifest = casus1Manifest(golden, 'gated');
const baseFiles = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const settings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

/** Scale the frequency axis of one driver's impedance sweep. */
function shiftImpedance(files: readonly MeasurementFile[], driver: string, factor: number): MeasurementFile[] {
  return files.map((f) =>
    f.entry.driver === driver && f.impedance
      ? { ...f, impedance: { ...f.impedance, freq: f.impedance.freq.map((x) => x * factor) } }
      : f,
  );
}

/** Add a synthetic resonance bump, in dB, to every far-field file of a driver. */
function addBreakup(
  files: readonly MeasurementFile[],
  driver: string,
  fHz: number,
  heightDb: number,
  q: number,
): MeasurementFile[] {
  return files.map((f) => {
    if (f.entry.driver !== driver || f.entry.kind !== 'FF' || !f.response) return f;
    const spl = f.response.spl.map((v, i) => {
      const x = (f.response!.freq[i] / fHz - fHz / f.response!.freq[i]) * q;
      return v + heightDb / (1 + x * x);
    });
    return { ...f, response: { ...f.response, spl } };
  });
}

const report = (files: readonly MeasurementFile[]) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings,
  });

describe('new-measurement test - the rules run on the data, not on memory', () => {
  describe('a synthetically shifted f_s', () => {
    const FACTOR = 1.5;
    const base = runIngest(manifest, baseFiles);
    const moved = runIngest(manifest, shiftImpedance(baseFiles, 'woofer', FACTOR));
    const b = base.drivers.find((d) => d.driver === 'woofer')!;
    const m = moved.drivers.find((d) => d.driver === 'woofer')!;

    it('moves every resonance of that driver by exactly the same factor', () => {
      expect(m.impedance!.type).toBe('reflex');
      const bx = b.impedance!.reflex!;
      const mx = m.impedance!.reflex!;
      expect(mx.fLHz / bx.fLHz).toBeCloseTo(FACTOR, 3);
      expect(mx.fbHz / bx.fbHz).toBeCloseTo(FACTOR, 3);
      expect(mx.fHHz / bx.fHHz).toBeCloseTo(FACTOR, 3);
      expect(m.impedance!.fundamentalHz! / b.impedance!.fundamentalHz!).toBeCloseTo(FACTOR, 3);
    });

    it('leaves the OTHER drivers untouched - a mutation must not leak sideways', () => {
      for (const name of ['mid', 'tweeter']) {
        const before = base.drivers.find((d) => d.driver === name)!;
        const after = moved.drivers.find((d) => d.driver === name)!;
        expect(after.impedance!.fundamentalHz).toBeCloseTo(before.impedance!.fundamentalHz!, 6);
      }
    });

    it('moves R_e barely - it is read below the resonance, not at it', () => {
      // The estimate is a median of Re(Z) over the lowest slice of the sweep,
      // and shifting the axis moves which frequencies those points sit at
      // without changing their values. So R_e is the one derived parameter
      // that must NOT scale.
      expect(m.re!.ohm).toBeCloseTo(b.re!.ohm, 6);
    });

    it('moves the voice-coil fit band with it', () => {
      expect(m.semiInductance!.fitBandHz[0] / b.semiInductance!.fitBandHz[0]).toBeCloseTo(FACTOR, 3);
    });

    it("moves M-D's evaluation band and reference, both derived from f_p", () => {
      const rb = report(baseFiles).metrics.lfBump.find((x) => x.driver === 'woofer')!.result;
      const rm = report(shiftImpedance(baseFiles, 'woofer', FACTOR)).metrics.lfBump.find(
        (x) => x.driver === 'woofer',
      )!.result;
      expect(rm.fPeakHz / rb.fPeakHz).toBeCloseTo(FACTOR, 3);
      expect(rm.bandHz[0] / rb.bandHz[0]).toBeCloseTo(FACTOR, 3);
      expect(rm.bandHz[1] / rb.bandHz[1]).toBeCloseTo(FACTOR, 3);
      expect(rm.referenceHz / rb.referenceHz).toBeCloseTo(FACTOR, 3);
    });

    it("moves the crossover window's f_s floor with the UPPER driver's resonance", () => {
      // The mid-tweeter window's floor is k x f_s of the tweeter. Shift the
      // tweeter and the floor has to follow; the woofer-mid window, whose
      // floor is bound by measurement validity, must not move at all.
      const before = report(baseFiles).predesign.windows;
      const after = report(shiftImpedance(baseFiles, 'tweeter', FACTOR)).predesign.windows;
      const bMT = before.find((w) => w.lower === 'mid')!;
      const aMT = after.find((w) => w.lower === 'mid')!;
      expect(bMT.floorBy!.rule).toBe('fs');
      expect(aMT.floorHz! / bMT.floorHz!).toBeCloseTo(FACTOR, 3);

      const bWM = before.find((w) => w.lower === 'woofer')!;
      const aWM = after.find((w) => w.lower === 'woofer')!;
      expect(bWM.floorBy!.rule).toBe('validity');
      expect(aWM.floorHz!).toBeCloseTo(bWM.floorHz!, 6);
    });
  });

  describe('a synthetically added breakup peak', () => {
    // Placed BELOW the driver's real first significant breakup, so it has to
    // take over the ceiling: a rule that remembered the old peak would keep
    // the old ceiling.
    const F = 900;
    const HEIGHT = 5;
    const withPeak = addBreakup(baseFiles, 'woofer', F, HEIGHT, 8);

    it('is detected, at the frequency and roughly the height it was injected at', () => {
      const before = runIngest(manifest, baseFiles).drivers.find((d) => d.driver === 'woofer')!;
      const after = runIngest(manifest, withPeak).drivers.find((d) => d.driver === 'woofer')!;
      const found = after.breakups!.peaks.find((p) => Math.abs(Math.log2(p.fHz / F)) < 1 / 6);
      expect(found, 'the injected peak').toBeTruthy();
      // Measured against a 1/2-octave trend, an injected peak reads a little
      // under its own height because the trend rises under it too.
      expect(found!.dB).toBeGreaterThan(HEIGHT * 0.6);
      expect(before.breakups!.peaks.some((p) => Math.abs(Math.log2(p.fHz / F)) < 1 / 6)).toBe(false);
    });

    it("pulls the crossover ceiling and M-H's verdict down with it", () => {
      const before = report(baseFiles);
      const after = report(withPeak);
      const wBefore = before.predesign.windows.find((w) => w.lower === 'woofer')!;
      const wAfter = after.predesign.windows.find((w) => w.lower === 'woofer')!;
      expect(wAfter.ceilingHz!).toBeLessThan(wBefore.ceilingHz!);
      expect(wAfter.ceilingBy!.rule).toBe('breakup');
      // The grid lands the crest a couple of hertz off the injected centre;
      // what matters is that the ceiling now quotes the NEW peak.
      expect(Number(wAfter.ceilingBy!.source.match(/at (\d+) Hz/)![1])).toBeCloseTo(F, -1);

      const hBefore = before.metrics.breakup.find((x) => x.driver === 'woofer')!;
      const hAfter = after.metrics.breakup.find((x) => x.driver === 'woofer')!;
      expect(hAfter.breakupHz).toBeLessThan(hBefore.breakupHz);
      // And the window can close entirely - which is an answer, not an error.
      expect(wAfter.ceilingHz!).toBeLessThan(wAfter.floorHz! * 2);
    });

    it('a peak injected BELOW the validity floor is not detected at all (V8c)', () => {
      // The scan is clipped on the validity limits, so a resonance in the
      // region the gate has already destroyed cannot become a design rule.
      const low = addBreakup(baseFiles, 'woofer', 150, 8, 8);
      const after = runIngest(manifest, low).drivers.find((d) => d.driver === 'woofer')!;
      expect(after.onAxis!.bandHz[0]).toBeGreaterThan(150);
      expect(after.breakups!.peaks.every((p) => p.fHz > after.onAxis!.bandHz[0])).toBe(true);
    });
  });
});
