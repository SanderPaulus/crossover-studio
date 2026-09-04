/**
 * A7 — THE COVERAGE TEST.
 *
 * "Vervang in een casusboek-project een meting door een variant met
 * kortere/langere venstertijd en assert dat (a) de geldigheidsintervallen
 * meebewegen, (b) elke metriek zijn dekking herrapporteert, en (c) de
 * kostenfunctie aantoonbaar geen samples buiten de geldige band gebruikt."
 *
 * (c) is stated here for the reporting layer, which is what F1 ships: no SCAN
 * may look outside the validity band. The optimiser half of (c) belongs to F2,
 * when there is a cost function to check — and the invariant it will have to
 * satisfy is the one asserted below, one layer down.
 *
 * The mutation is a rewritten ARTA header. That is the honest way to do it:
 * the gate floor is derived from the header and nowhere else, so editing the
 * header is exactly what a shorter window would have produced.
 */

import { describe, expect, it } from 'vitest';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from './casus1.fixture.ts';
import { parseArtaHeader } from './ingest/manifest.ts';
import { runIngest, type MeasurementFile } from './ingest/derive.ts';
import { buildReport } from './report.ts';
import { ctcKey } from './metrics/types.ts';

const golden = loadGolden();
/* M-1 — THE GATED SET, deliberately: every claim in this file is about the HEADER
 * floor (1/T, 2/T, the advisory FF/NF detector on a gated far field), and since
 * M-1 the default set carries NF/FF merges whose floor is the merge block's. A
 * merged file has no gate to move. */
const manifest = casus1Manifest(golden, 'gated');
const baseFiles = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const settings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

/**
 * Rewrite the effective window of every far-field file to `ms`, by moving the
 * right window edge and leaving the reference time where it was.
 */
function reWindow(files: readonly MeasurementFile[], ms: number): MeasurementFile[] {
  return files.map((f) => {
    if (f.entry.kind !== 'FF' || !f.entry.header) return f;
    const ref = f.entry.header.referenceTimeMs ?? 0;
    const raw = f.entry.header.raw.map((line) =>
      /^right window\s*=/i.test(line) ? `Right window = ${(ref + ms).toFixed(3)} ms, Tukey 0.25` : line,
    );
    return { ...f, entry: { ...f.entry, header: parseArtaHeader(raw) } };
  });
}

const ingestAt = (ms: number) => runIngest(manifest, reWindow(baseFiles, ms));
const reportAt = (ms: number) => {
  const files = reWindow(baseFiles, ms);
  return buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings,
  });
};

describe('coverage test - shorter window, narrower claims', () => {
  it('(a) the validity interval moves with the header, by exactly 1/T', () => {
    // Windows SHORTER than the one actually measured: there the header floor
    // is the binding detector, which is what this assertion is about. Longer
    // ones are the subject of the advisory-detector test below.
    for (const ms of [0.5, 1, 2.521]) {
      const w = ingestAt(ms).drivers.find((d) => d.driver === 'woofer')!;
      expect(w.onAxis!.bandHz[0]).toBeCloseTo(1000 / ms, 3);
      expect(w.onAxis!.fineDetailFromHz!).toBeCloseTo(2000 / ms, 3);
      expect(w.onAxis!.bandReason.low).toContain('hor_0');
      const interval = w.validity.find((v) => v.file.includes('hor_0'))!.interval;
      expect(interval.fromReason).toContain('1/T');
    }
  });

  it('(a) a shorter window strictly narrows the band, and only at the bottom', () => {
    const short = ingestAt(1).drivers.find((d) => d.driver === 'woofer')!;
    const measured = ingestAt(2.521).drivers.find((d) => d.driver === 'woofer')!;
    expect(short.onAxis!.bandHz[0]).toBeGreaterThan(measured.onAxis!.bandHz[0]);
    expect(short.onAxis!.bandHz[1]).toBeCloseTo(measured.onAxis!.bandHz[1], 6); // the top is the sweep
  });

  it('(a) the advisory detector RAISES the floor over a persistently broken zone', () => {
    // A persisting residual, on a header that claims a 10 ms window (so the
    // hard floor is only 100 Hz and there is room for the detector to act).
    // The far field is wrecked over a whole band, not at one sample: that is
    // what A5b.1(ii)'s "blijvend residu" means, and only that may move a floor.
    const wrecked = reWindow(baseFiles, 10).map((f) => {
      if (f.entry.driver !== 'woofer' || f.entry.kind !== 'FF' || !f.response) return f;
      const spl = f.response.spl.map((v, i) => {
        const at = f.response!.freq[i];
        return at > 150 && at < 260 ? v - 6 : v;
      });
      return { ...f, response: { ...f.response, spl } };
    });
    const w = runIngest(manifest, wrecked).drivers.find((d) => d.driver === 'woofer')!;
    expect(w.baffleStep!.fits).toBe(true);
    expect(w.baffleStep!.breaksBelowHz).not.toBeNull();
    expect(w.onAxis!.bandHz[0]).toBeGreaterThan(200); // not the 100 Hz the header claims
    const interval = w.validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(interval.fromReason).toContain('RAISED the header floor');
  });

  it('(a) the advisory detector can only ever RAISE the header floor', () => {
    // Same wrecked band, but now on an honest 1 ms header whose floor (1000 Hz)
    // already sits above the broken zone. The detector must not be able to
    // relax it - the header floor is hard, and A5b.1's rank order says the
    // verdict is max(header, model), never the model alone.
    const wrecked = reWindow(baseFiles, 1).map((f) => {
      if (f.entry.driver !== 'woofer' || f.entry.kind !== 'FF' || !f.response) return f;
      const spl = f.response.spl.map((v, i) => {
        const at = f.response!.freq[i];
        return at > 150 && at < 260 ? v - 6 : v;
      });
      return { ...f, response: { ...f.response, spl } };
    });
    const w = runIngest(manifest, wrecked).drivers.find((d) => d.driver === 'woofer')!;
    const interval = w.validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(interval.fromHz!).toBeCloseTo(1000, 3);
    expect(interval.fromReason).toContain('1/T');
  });

  it('(a) the model can ABSORB gate roll-off, which is why the header floor is hard (V8g)', () => {
    // Casus 1's far field was really gated at 2.5 ms. Claim 10 ms and the
    // header floor drops to 100 Hz - and the baffle-step model fits the
    // resulting rubbish perfectly well, so the ADVISORY detector says nothing.
    // That is not a defect in the detector; it is the documented limitation
    // V8g warns about, and it is the whole reason the header floor is the
    // hard, automatic, binding one and the model test may only ever add to it.
    const w = ingestAt(10).drivers.find((d) => d.driver === 'woofer')!;
    expect(w.baffleStep!.fits).toBe(true);
    expect(w.baffleStep!.breaksBelowHz).toBeNull();
    expect(w.onAxis!.bandHz[0]).toBeCloseTo(100, 3); // the (over-generous) header floor, alone
  });

  it('(a) the advisory detector ABSTAINS when its model does not fit at all', () => {
    // Found by running the app on its own demo set. There the FF/NF pair does
    // not fit a baffle-step shelf anywhere, and an unguarded detector reported
    // "the residual is still bad at the top of the band" - which pushed the
    // gate floor from 397 Hz to 2 kHz, took two drivers out of the report and
    // reordered the ways. An advisory detector must not be able to do that.
    //
    // Reproduced here by handing the fitter two curves that share no step:
    // near field flat, far field with a deep narrow notch in the middle.
    const files = baseFiles.map((f) => {
      if (f.entry.driver !== 'woofer' || !f.response) return f;
      if (f.entry.kind === 'NF') {
        return { ...f, response: { ...f.response, spl: f.response.spl.map(() => 90) } };
      }
      if (f.entry.kind !== 'FF') return f;
      const spl = f.response.spl.map((_, i) => {
        const hzAt = f.response!.freq[i];
        return 90 - (hzAt > 420 && hzAt < 520 ? 30 : 0);
      });
      return { ...f, response: { ...f.response, spl } };
    });
    const w = runIngest(manifest, files).drivers.find((d) => d.driver === 'woofer')!;
    expect(w.baffleStep!.fits).toBe(false);
    expect(w.baffleStep!.breaksBelowHz).toBeNull();
    // The header floor stands on its own, and the band is NOT destroyed.
    expect(w.onAxis!.bandHz[0]).toBeCloseTo(1000 / 2.521, 2);
    const interval = w.validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(interval.fromReason).toContain('1/T');
    expect(interval.notes.join(' ')).toContain('ABSTAINS');
  });

  it('(b) every metric re-reports the coverage of the band it actually ran on', () => {
    const measured = reportAt(2.521);
    const narrow = reportAt(1);

    // M-J's band is the band every driver is valid on, so it follows the gate.
    expect(narrow.metrics.groupDelay!.bandHz[0]).toBeGreaterThan(
      measured.metrics.groupDelay!.bandHz[0],
    );
    expect(narrow.metrics.groupDelay!.coverage.describe).toContain('evaluated over');
    // And the coverage SENTENCE changes with it - the panel shows the sentence,
    // so a number that moved while its sentence did not would be worse than no
    // sentence at all.
    expect(narrow.metrics.groupDelay!.coverage.describe).not.toBe(
      measured.metrics.groupDelay!.coverage.describe,
    );

    // M-D is the counter-case, and it is the reason a near field is taken at
    // all: its band comes off the near field, which has no gate, so its
    // coverage is FULL and does not move when the far-field window does.
    for (const r of [measured, narrow]) {
      const d = r.metrics.lfBump.find((x) => x.driver === 'woofer')!;
      expect(d.result.coverage.fraction).toBeCloseTo(1, 6);
      expect(d.result.coverage.flagged).toBe(false);
    }
  });

  it('(b) the crossover window follows the gate, and the gate alone can close it', () => {
    const measured = reportAt(2.521).predesign.windows.find((w) => w.lower === 'woofer')!;
    const narrow = reportAt(1).predesign.windows.find((w) => w.lower === 'woofer')!;
    expect(narrow.floorHz!).toBeGreaterThan(measured.floorHz!);
    expect(narrow.floorBy!.rule).toBe('validity');
    // At a 1 ms window the floor is ~1075 Hz and the breakup ceiling ~390: the
    // window is EMPTY, and that is an answer about the MEASUREMENT SET, stated
    // out loud before any component is chosen.
    expect(narrow.empty).toBe(true);
    expect(narrow.tensions.join(' ')).toContain('THE WINDOW IS EMPTY');
    expect(measured.empty).toBe(false);
  });

  it('(c) no scan looks below the validity floor, at any window length', () => {
    for (const ms of [1, 2.521, 5, 10]) {
      for (const d of ingestAt(ms).drivers) {
        if (!d.onAxis) continue;
        const floor = d.onAxis.bandHz[0];
        expect(d.onAxis.grid[0]).toBeGreaterThanOrEqual(floor - 1e-9);
        for (const p of d.breakups?.peaks ?? []) expect(p.fHz).toBeGreaterThanOrEqual(floor);
        expect(d.diffraction!.bandHz[0]).toBeGreaterThanOrEqual(floor - 1e-9);
        expect(d.level!.bandHz[0]).toBeGreaterThanOrEqual(floor - 1e-9);
        for (const dir of d.directivity) expect(dir.bandHz[0]).toBeGreaterThanOrEqual(floor - 1e-9);
      }
    }
  });

  it('(c) fine structure is separately marked below 2/T (V8c)', () => {
    // Between 1/T and 2/T a peak's LEVEL may be real while its SHAPE is window
    // artefact. A scan that reported the two the same way is exactly how V8c
    // happened, so the flag exists per peak.
    const w = ingestAt(0.5).drivers.find((d) => d.driver === 'woofer')!;
    expect(w.onAxis!.fineDetailFromHz).toBeCloseTo(4000, 3);
    const below = w.breakups!.peaks.filter((p) => p.fHz < 4000);
    expect(below.length).toBeGreaterThan(0);
    expect(below.every((p) => p.belowFineDetailFloor)).toBe(true);
    expect(w.breakups!.peaks.filter((p) => p.fHz > 4000).every((p) => !p.belowFineDetailFloor)).toBe(
      true,
    );
  });

  it('the near field is NOT gated - its band ignores the far-field window entirely', () => {
    // The whole reason a near-field measurement is taken. Its ceiling is
    // Keele's piston limit and its floor is the sweep, whatever the far-field
    // header says.
    const a = ingestAt(1).drivers.find((d) => d.driver === 'woofer')!;
    const b = ingestAt(10).drivers.find((d) => d.driver === 'woofer')!;
    expect(a.nearField!.bandHz[0]).toBeCloseTo(b.nearField!.bandHz[0], 9);
    expect(a.nearFieldCeilingHz).toBeCloseTo(b.nearFieldCeilingHz!, 9);
    expect(a.nearField!.bandHz[0]).toBeLessThan(50);
  });
});
