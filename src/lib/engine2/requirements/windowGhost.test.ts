/**
 * E-7 (V53) — THE ±WINDOW IS SMOOTHED ON THE BAND IT JUDGES, AND NOWHERE ELSE.
 *
 * Until E-7 `judgeResponse` smoothed the deviation over the WHOLE grid it was
 * handed and clipped only the READING to the band. Every repo fixture grid
 * ends on 20 000 Hz, one point past the far fields (19 999.51 Hz), so that
 * point is a −400 dB silent ghost and the 1/6-octave kernel pulled it across
 * the band edge: the worker read ±70.5 dB on casus 1b's KAND-V2-1 while its
 * RMS was 0.59 dB and the report read ±1.21. E-3 had written this number down
 * as a polarity effect; it was not — flipping the tweeter moved the RMS and
 * left the window at 70.5.
 *
 * Three claims, and the second carries the file:
 *  1. by hand — a flat response next to one dead point outside the band reads
 *     a window of zero;
 *  2. the worker's own sum (`summedResponse`, on the chain grid that HAS the
 *     ghost) and the report agree on the window of a netlist that carries its
 *     polarity in the Driver part, within the dB class of the file;
 *  3. the counterproof — the same netlist WITHOUT the reversal reads a
 *     much wider window on BOTH: the window sees the polarity in the part,
 *     and the ghost no longer drowns it. Equal they are not, and that is not
 *     a defect: the worker judges the chain's band (88.8–19 500 Hz on 121
 *     points), the report the measurements' common band (396.7–19 999.5 Hz on
 *     1600), and on a sum that cancels those two bands see different edges
 *     (measured 29-10-2026: ±9.24 against ±9.99). On a sum that is flat over
 *     both, as in claim 2, they meet within the dB class.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { judgeResponse, RESPONSE_JUDGEMENT_VERSION } from './response.ts';
import { FLAT_TARGET } from './targetCurve.ts';
import { logspace } from '../../dsp.ts';
import { buildReport } from '../report.ts';
import { summedResponse } from '../optimizer/worker.ts';
import { casus1FilterFromParts } from '../casus1.fixture.ts';
import {
  CASUS1B_DIR,
  CASUS1B_REPORT_SETTINGS,
  CASUS1B_V2_BAND_HZ,
  casus1bChainInput,
  casus1bFiles,
  casus1bGeometry,
  casus1bManifest,
  loadGolden1b,
} from '../casus1b.fixture.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const golden = loadGolden1b();
const TOL_DB = golden.toleranties.dB;
const manifest = casus1bManifest(golden);
const files = casus1bFiles(manifest);
const gridded = casus1bChainInput(manifest, files);
const PARTS = JSON.parse(
  readFileSync(join(CASUS1B_DIR, golden.manifest_en_geometrie.netlists.KAND_V2_1), 'utf-8'),
).parts as VxpPart[];
const withTweeter = (inverted: boolean): VxpPart[] =>
  PARTS.map((p) => (p.type === 'Driver' && p.model === 'tweeter' ? { ...p, inverted } : p));

function workerWindow(parts: readonly VxpPart[]): number {
  const sum = summedResponse(
    parts,
    gridded.grid,
    [
      { model: 'mid', response: gridded.w },
      { model: 'tweeter', response: gridded.t },
    ],
    gridded.driverZ,
  );
  return judgeResponse(sum!.freq, sum!.spl, FLAT_TARGET, CASUS1B_V2_BAND_HZ)!.windowPlusMinusDb;
}
function reportWindow(parts: readonly VxpPart[]): number {
  return buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts('e7', parts, manifest, files),
    geometry: casus1bGeometry(golden),
    settings: CASUS1B_REPORT_SETTINGS,
  }).system.response!.windowPlusMinusDb;
}

describe('E-7 (V53) — the ±window is smoothed on the band it judges', () => {
  it('carries a version that says so', () => {
    expect(RESPONSE_JUDGEMENT_VERSION).toBe('response-judgement/1.1');
  });

  it('by hand: a flat response next to a dead point outside the band reads a window of zero', () => {
    const grid = logspace(100, 20000, 200);
    const db = grid.map((f) => (f > 19600 ? -400 : 90));
    const j = judgeResponse(grid, db, FLAT_TARGET, [100, 19500])!;
    expect(j.windowPlusMinusDb).toBe(0);
    expect(j.rmsDeviationDb).toBe(0);
  });

  it('the premise: the chain grid of the fixture ends on a dead point past the far fields', () => {
    const sum = summedResponse(withTweeter(true), gridded.grid, [
      { model: 'mid', response: gridded.w },
      { model: 'tweeter', response: gridded.t },
    ], gridded.driverZ)!;
    expect(sum.freq[sum.freq.length - 1]).toBeGreaterThan(CASUS1B_V2_BAND_HZ[1]);
    expect(sum.spl[sum.spl.length - 1]).toBeLessThan(-300);
  });

  it('a netlist that carries its polarity in the Driver part reads the same window in the worker and in the report', () => {
    expect(PARTS.find((p) => p.type === 'Driver' && p.model === 'tweeter')?.inverted).toBe(true);
    const w = workerWindow(PARTS);
    const r = reportWindow(PARTS);
    expect(Math.abs(w - r), `worker ±${w.toFixed(3)} against report ±${r.toFixed(3)}`).toBeLessThanOrEqual(TOL_DB);
    // ...and in the order of its RMS, not seventy decibels.
    expect(w).toBeLessThan(2);
  });

  it('the counterproof: without the reversal BOTH read a much wider window — the polarity in the part is seen', () => {
    const w1 = workerWindow(PARTS);
    const r1 = reportWindow(PARTS);
    const w0 = workerWindow(withTweeter(false));
    const r0 = reportWindow(withTweeter(false));
    expect(w0 - w1, `worker ±${w1.toFixed(3)} → ±${w0.toFixed(3)}`).toBeGreaterThan(3);
    expect(r0 - r1, `report ±${r1.toFixed(3)} → ±${r0.toFixed(3)}`).toBeGreaterThan(3);
  });
});
