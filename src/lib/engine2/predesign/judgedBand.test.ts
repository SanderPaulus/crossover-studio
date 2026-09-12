/**
 * E-5 — WHERE A v2 RUN LOOKS AND WHERE IT JUDGES, as claims.
 *
 * Two halves. The DERIVATION is the eleven lines that stood verbatim in three
 * casus fixtures, so the claims here are that it is the same arithmetic on the
 * same report and that each fixture now reads it. The FRAME is what the app
 * does with it, and the load-bearing claim there is P2: a caller with no report
 * gets its own grid and its own band back, byte for byte, because that is every
 * v1 run and the toggle invariant is a claim about v1 behaviour.
 */

import { describe, expect, it } from 'vitest';
import { logspace } from '../../dsp.ts';
import {
  PRECEDENT_GRID_HZ,
  PRECEDENT_GRID_POINTS,
  chainGridFrom,
  describeJudgedFloor,
  judgedBandFloor,
} from './judgedBand.ts';
import { v2ChainFrame } from '../optimizer/scanRequest.ts';
import { buildReport, type EngineV2Report } from '../report.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../casus1.fixture.ts';
import { CASUS1_V2_BAND_HZ, CASUS1_V2_BAND_SOURCE, CASUS1_V2_GRID } from '../casus1V2.fixture.ts';
import { CASUS1B_V2_BAND_HZ, CASUS1B_V2_BAND_SOURCE, CASUS1B_V2_GRID } from '../casus1b.fixture.ts';
import { CASUS2_V2_BAND_HZ, CASUS2_V2_BAND_SOURCE, CASUS2_V2_GRID } from '../casus2.fixture.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry: casus1Geometry(golden),
  settings: { reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } },
});

describe('E-5 — the floor is the LOWEST way, twice over', () => {
  it('the band floor is the higher of the validity floor and f_p; the grid floor is the validity floor', () => {
    const f = judgedBandFloor(report);
    expect(f).not.toBeNull();
    expect(f!.lowest).toBe('woofer');
    // On casus 1 f_p (52.4 Hz) is the higher of the two, and it is the one that
    // binds — below it a reflex box rolls off on its own.
    expect(f!.fpHz).not.toBeNull();
    expect(f!.floorHz).toBeCloseTo(Math.max(f!.validityFloorHz, f!.fpHz!), 12);
    expect(f!.floorHz).toBeGreaterThan(f!.validityFloorHz);
    // And the GRID does NOT start at f_p — the gate probe needs the room under
    // the passband floor (the M-1 measurement: at f_p the woofer reads as
    // high-pass protected and M-C refuses every candidate).
    expect(CASUS1_V2_GRID[0]).toBeCloseTo(f!.validityFloorHz, 12);
    expect(CASUS1_V2_GRID[0]).toBeLessThan(f!.floorHz);
  });

  it('the grid keeps the precedent’s points per octave, rounded as the fixtures round it', () => {
    const ppo = PRECEDENT_GRID_POINTS / Math.log2(PRECEDENT_GRID_HZ[1] / PRECEDENT_GRID_HZ[0]);
    const top = CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1];
    const ref = logspace(
      CASUS1_V2_BAND_SOURCE.validityFloorHz,
      top,
      Math.round(ppo * Math.log2(top / CASUS1_V2_BAND_SOURCE.validityFloorHz)),
    );
    expect(chainGridFrom(CASUS1_V2_BAND_SOURCE.validityFloorHz, top)).toEqual(ref);
  });

  it('a report with no lowest way produces NO floor rather than a guess (P4)', () => {
    const empty = { driversLowToHigh: [], ingest: { drivers: [] } } as unknown as EngineV2Report;
    expect(judgedBandFloor(empty)).toBeNull();
    const noBand = {
      driversLowToHigh: ['woofer'],
      ingest: { drivers: [{ driver: 'woofer', onAxis: null }] },
    } as unknown as EngineV2Report;
    expect(judgedBandFloor(noBand)).toBeNull();
  });

  it('the sentence names the RULE and not only the number', () => {
    const f = judgedBandFloor(report)!;
    const text = describeJudgedFloor(f, CASUS1_V2_GRID[0]);
    expect(text).toContain('in-box resonance');
    expect(text).toContain('f_p');
    // And the other branch says which measurement set the floor came from.
    const noFp = { ...f, fpHz: null, floorHz: f.validityFloorHz };
    expect(describeJudgedFloor(noFp, CASUS1_V2_GRID[0])).toContain('validity floor');
  });
});

describe('E-5 — one derivation, three fixtures', () => {
  /* The numbers each fixture publishes have to be the numbers it published
   * before the extraction, or every corpus in this repository stops being
   * reproducible. This is the only claim that matters about the move itself;
   * the golden suites are the rest of it. */
  it('every casus band floor is max(validity floor, f_p) of its own lowest way', () => {
    for (const [name, src, band, grid] of [
      ['casus 1', CASUS1_V2_BAND_SOURCE, CASUS1_V2_BAND_HZ, CASUS1_V2_GRID],
      ['casus 1b', CASUS1B_V2_BAND_SOURCE, CASUS1B_V2_BAND_HZ, CASUS1B_V2_GRID],
      ['casus 2', CASUS2_V2_BAND_SOURCE, CASUS2_V2_BAND_HZ, CASUS2_V2_GRID],
    ] as const) {
      const expected =
        src.fpHz !== null ? Math.max(src.validityFloorHz, src.fpHz) : src.validityFloorHz;
      expect(band[0], name).toBeCloseTo(expected, 12);
      expect(grid[0], name).toBeCloseTo(src.validityFloorHz, 12);
      expect(grid, name).toEqual(chainGridFrom(src.validityFloorHz, grid[grid.length - 1]));
    }
  });

  it('casus 1 keeps the exact numbers M-1 recorded', () => {
    // Read from the fixture rather than typed twice: what this pins is that the
    // extraction did not move them, and the golden file pins the values.
    expect(CASUS1_V2_BAND_SOURCE.provenance).toBe('merge-block');
    expect(CASUS1_V2_GRID.length).toBe(143);
    expect(CASUS1_V2_BAND_HZ[1]).toBe(19500);
  });
});

describe('E-5 — the frame the app runs on', () => {
  const simGrid = logspace(200, 20000, 600);
  const appBand: [number, number] = [396.7, 19500];

  it('NO REPORT is the identity: the caller’s own grid and band, and no note (P2)', () => {
    const f = v2ChainFrame({ report: null, simGrid, fallbackBand: appBand });
    expect(f.grid).toBe(simGrid);
    expect(f.band).toEqual(appBand);
    expect(f.notes).toEqual([]);
  });

  it('a report whose lowest way has no band is the identity too', () => {
    const noBand = {
      driversLowToHigh: ['woofer'],
      ingest: { drivers: [{ driver: 'woofer', onAxis: null }] },
    } as unknown as EngineV2Report;
    const f = v2ChainFrame({ report: noBand, simGrid, fallbackBand: appBand });
    expect(f.grid).toBe(simGrid);
    expect(f.band).toEqual(appBand);
    expect(f.notes).toEqual([]);
  });

  it('with casus 1’s report the frame becomes the frame the fixture has run since M-1', () => {
    const f = v2ChainFrame({ report, simGrid, fallbackBand: appBand });
    // The BAND floor is the derived one, and the ceiling is still the caller's.
    expect(f.band[0]).toBeCloseTo(CASUS1_V2_BAND_HZ[0], 12);
    expect(f.band[1]).toBe(appBand[1]);
    // The GRID reaches the validity floor, at the PRECEDENT's density — which
    // on casus 1 is exactly the grid the fixture has run since M-1.
    expect(f.grid[0]).toBeCloseTo(CASUS1_V2_BAND_SOURCE.validityFloorHz, 12);
    expect(f.grid[f.grid.length - 1]).toBeCloseTo(simGrid[simGrid.length - 1], 9);
    expect(f.grid).toEqual(CASUS1_V2_GRID);
    // It is the fixture's grid, not the plot grid: a plot constant is not a
    // search resolution, and running the app on the precedent is what makes a
    // repo corpus a reference for what the app delivers (E-3b).
    expect(f.grid.length).toBeLessThan(simGrid.length);
    // And it says what it did, naming the rule.
    expect(f.notes.length).toBe(2);
    expect(f.notes[0]).toContain('in-box resonance');
    expect(f.notes[1]).toContain('the PLOT grid');
    expect(f.notes[1]).toContain('14.4 per octave');
  });

  it('a caller already on the derived frame gets its own grid array and NO note', () => {
    /* Nothing happened, so nothing is said — and the array is returned by
     * IDENTITY, which is what lets the three-way route keep `sim.base` instead
     * of rebuilding three branch responses that did not move. */
    const f = v2ChainFrame({
      report,
      simGrid: CASUS1_V2_GRID,
      fallbackBand: [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]],
    });
    expect(f.grid).toBe(CASUS1_V2_GRID);
    expect(f.notes).toEqual([]);
  });
});
