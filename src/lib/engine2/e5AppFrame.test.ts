/**
 * E-5 — WHY THE APP'S TUNER DOES NOT BUILD THE REFLEX-PEAK TRAP.
 *
 * THE MEASUREMENT THIS FILE PINS is `scripts/measure-e5-app-vs-repo.ts`, and
 * it is here rather than in a session log for the reason `measure-u5-stated-
 * crossings.ts` is a script: a check that lives only in a log is a check nobody
 * can repeat. The script writes `casus1_e5_app_vs_repo.json`; the claims below
 * reproduce it from a fresh measurement and would fail if either half drifted.
 *
 * WHAT THE FINDING IS. Sander ran the full field on the Koan 67.7 L set with
 * every requirement stated and got 0 of 4, each candidate refused by M-D with
 * 2.32–12.34 dB of resonant amplification against a stated 1.4 — while the C-2
 * corpus in this repository meets the same budget on comparable handovers. The
 * difference is not the data. It is two numbers: where the chain LOOKS (the
 * plot grid, floored by the fMin field at 200 Hz) and where it JUDGES (the
 * intersection of every source's validity, floored by the highest way's gate).
 *
 * THE DOOR TO THE TRAP IS AN EQ BAND, and that is worth stating because there
 * IS a slot in `synthesis.ts` called "Fs trap": it is gated on
 * `spec.hp.enabled`, the lowest way has no high pass, and so that door has been
 * shut on every route since it was written. What the corpus carries comes from
 * the design step's cut-only EQ stage, which places a peak cut at the sum's
 * worst positive excursion INSIDE THE JUDGED BAND; the synthesis turns that
 * into a series L-C-R across the driver. Judged band decides whether the trap
 * can exist; the grid decides whether the band can be seen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { logspace, type GriddedResponse } from '../dsp.ts';
import { designThreeWay } from '../threeWayDesign.ts';
import { mergeSynthesizedSchematics } from '../schematicEdit.ts';
import { synthesize } from '../synthesis.ts';
import type { DriverFilterSpec } from '../filters.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import { deserializeFilter } from '../filterFile.ts';
import { buildReport } from './report.ts';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import {
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_LF_RESONANT_BUDGET_DB,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BAND_SOURCE,
  CASUS1_V2_GRID,
  CASUS1_V2_SETTINGS,
  CASUS1_TARGET_CURVE,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
} from './casus1V2.fixture.ts';
import { corpusBank } from './casus1Corpora.fixture.ts';
import { v2ChainFrame } from './optimizer/scanRequest.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const reportSettings = {
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  ...casus1ExcursionSettings(golden),
  ...CASUS1_COIL_DCR_SETTINGS,
  targetCurve: CASUS1_TARGET_CURVE,
};
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: reportSettings,
});

/** Half an octave either side of f_p still counts as "on the reflex peak". */
const TRAP_WINDOW_OCTAVES = 0.5;
const ALIVE_DB = -300;
/** `App.tsx`: `GRID_N` and the fMin field's own fallback. */
const APP_GRID_POINTS = 600;
const APP_GRID_FLOOR_HZ = 200;

type Part = VxpCrossover['parts'][number];

const lowestWayParts = (parts: readonly Part[]): Part[] =>
  parts.filter((p) => !String(p.partId ?? '').includes('·'));
const valueOf = (p: Part, name: string): number | null => {
  const v = p.params?.find((x) => x.name === name)?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** A shunt L-C(-R) resonance on the lowest way within half an octave of f_p. */
function trapNear(parts: readonly Part[], fpHz: number): { f0Hz: number; dampedBy: 'R' | 'coil DCR' } | null {
  const own = lowestWayParts(parts);
  for (let i = 0; i + 1 < own.length; i++) {
    if (own[i].type !== 'Inductor' || own[i + 1].type !== 'Capacitor') continue;
    const lMh = valueOf(own[i], 'L');
    const cUf = valueOf(own[i + 1], 'C');
    if (lMh === null || cUf === null || lMh <= 0 || cUf <= 0) continue;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(lMh * 1e-3 * (cUf * 1e-6)));
    if (Math.abs(Math.log2(f0 / fpHz)) > TRAP_WINDOW_OCTAVES) continue;
    return { f0Hz: f0, dampedBy: own[i + 2]?.type === 'Resistor' ? 'R' : 'coil DCR' };
  }
  return null;
}

const fpHz = CASUS1_V2_BAND_SOURCE.fpHz!;
/** The EQ budget the ROUTE declares — never a number typed in beside it. */
const EQ_BANDS = (() => {
  const c = casus1Field(report).field.candidates[0];
  const n = casus1V2Declaration(c, casus1ChainInput(manifest, files, golden).safety).chainDeclaration
    ?.stated.eqBands;
  if (typeof n !== 'number') throw new Error('E-5: the route declares no EQ budget');
  return n;
})();

const repoFrame = casus1ChainInput(manifest, files, golden);
const appGrid = logspace(APP_GRID_FLOOR_HZ, CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1], APP_GRID_POINTS);
const appFrame = casus1ChainInput(manifest, files, golden, appGrid);
/** The app's judged-band floor on this set: the highest way's gate. */
const appBandFloorHz = (() => {
  const highest = report.driversLowToHigh[report.driversLowToHigh.length - 1];
  return report.ingest.drivers.find((x) => x.driver === highest)!.onAxis!.bandHz[0];
})();

function seedOf(frame: typeof repoFrame, band: [number, number], low: number, high: number) {
  const design = designThreeWay({
    w: frame.w,
    m: frame.m,
    t: frame.t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: low,
    xoHigh: high,
    band,
    phasePriority: CASUS1_V2_SETTINGS.phasePriority,
    structureLow: { kind: 'LR', order: 4 },
    structureHigh: { kind: 'LR', order: 4 },
    eqBandsPerBranch: EQ_BANDS,
    lowestWayLevelWork: 'none',
  });
  const synthOne = (spec: DriverFilterSpec, resp: GriddedResponse, key: string, lowest: boolean) => {
    const idxs: number[] = [];
    for (let i = 0; i < frame.grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
    return synthesize(
      spec,
      idxs.map((i) => frame.grid[i]),
      idxs.map((i) => frame.driverZ[key][i]),
      {
        mode: CASUS1_V2_SETTINGS.synthMode,
        phasePriority: CASUS1_V2_SETTINGS.phasePriority,
        corrections: 'auto',
        label: key,
        driverSplDb: idxs.map((i) => resp.spl[i]),
        ...(lowest ? { noLevelWork: true } : {}),
      },
    );
  };
  const parts = mergeSynthesizedSchematics([
    { components: synthOne(design.specs.woofer, frame.w, 'woofer', true).components, model: 'woofer' },
    { components: synthOne(design.specs.mid, frame.m, 'mid', false).components, model: 'mid' },
    { components: synthOne(design.specs.tweeter, frame.t, 'tweeter', false).components, model: 'tweeter' },
  ]).parts;
  const r = buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts('E5', parts, manifest, files),
    geometry,
    settings: reportSettings,
  });
  return {
    eq: design.specs.woofer.eq.filter((b) => b.enabled),
    trap: trapNear(parts, fpHz),
    resonantDb: r.metrics.lfBump[0]?.result.resonantDb ?? null,
  };
}

const CANDIDATES: [number, number][] = [
  [204, 2250.6],
  [334.9, 2250.6],
  [549.7, 2250.6],
];

describe('E-5 — the judged band decides whether the reflex trap can exist', () => {
  it('the app judged from the HIGHEST way’s gate and the repo from the LOWEST way’s f_p', () => {
    // Not a typed pair of numbers: both are read off the same report, which is
    // what makes the comparison a measurement rather than a restatement.
    expect(appBandFloorHz).toBeGreaterThan(CASUS1_V2_BAND_HZ[0] * 4);
    expect(CASUS1_V2_BAND_HZ[0]).toBeCloseTo(fpHz, 12);
  });

  it('on the REPO frame every candidate gets a damped trap within half an octave of f_p', () => {
    for (const [low, high] of CANDIDATES) {
      const s = seedOf(repoFrame, [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]], low, high);
      expect(s.trap, `${low} Hz`).not.toBeNull();
      expect(Math.abs(Math.log2(s.trap!.f0Hz / fpHz)), `${low} Hz`).toBeLessThan(TRAP_WINDOW_OCTAVES);
      // And the cut that made it is BELOW the app's floor, which is the point.
      expect(Math.min(...s.eq.map((b) => b.freq)), `${low} Hz`).toBeLessThan(appBandFloorHz);
    }
  });

  it('on the APP frame not one candidate gets a trap, and that was the defect', () => {
    for (const [low, high] of CANDIDATES) {
      const s = seedOf(appFrame, [appBandFloorHz, CASUS1_V2_BAND_HZ[1]], low, high);
      expect(s.trap, `${low} Hz`).toBeNull();
    }
  });

  it('the DERIVED band on the app’s GRID is not the repair either — the cut lands off the grid', () => {
    /* The attribution claim: both floors have to come down. With the band
     * derived and the grid still at 200 Hz the refine pushes a cut below the
     * grid's own edge and clamps it at the gain limit, which is a band fitted
     * on ground the chain cannot see. */
    const clamped: number[] = [];
    for (const [low, high] of CANDIDATES) {
      const s = seedOf(appFrame, [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]], low, high);
      expect(s.trap, `${low} Hz`).toBeNull();
      for (const b of s.eq) if (b.freq < appFrame.grid[0] * 1.05) clamped.push(b.gainDb);
    }
    expect(clamped.length).toBeGreaterThan(0);
    // Every one of them is at the design step's own clamp, not at a fitted value.
    for (const g of clamped) expect(g).toBeLessThanOrEqual(-12);
  });

  it('and `v2ChainFrame` gives the app the repo frame, which is the repair', () => {
    const f = v2ChainFrame({
      report,
      simGrid: appGrid,
      fallbackBand: [appBandFloorHz, CASUS1_V2_BAND_HZ[1]],
    });
    expect(f.band[0]).toBeCloseTo(CASUS1_V2_BAND_HZ[0], 12);
    expect(f.grid[0]).toBeCloseTo(CASUS1_V2_BAND_SOURCE.validityFloorHz, 12);
    const framed = casus1ChainInput(manifest, files, golden, f.grid);
    const s = seedOf(framed, f.band, CANDIDATES[1][0], CANDIDATES[1][1]);
    expect(s.trap).not.toBeNull();
  });
});

/** The LIVE corpus, by the pattern the case book insists on: `^KAND_V2_\d+$`
 *  and never `startsWith`, which swallows every dated corpus beside it. */
const LIVE_CORPUS = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) =>
  /^KAND_V2_\d+$/.test(k),
);

describe('E-5 — what a tune does with the trap it was given', () => {
  const bank = corpusBank(golden);

  it('EVERY delivered netlist of the live corpus carries one, and meets the budget', () => {
    expect(LIVE_CORPUS.length).toBeGreaterThan(0);
    for (const key of LIVE_CORPUS) {
      const parts = deserializeFilter(
        readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists[key]), 'utf-8'),
      ).parts as Part[];
      expect(trapNear(parts, fpHz), key).not.toBeNull();
      const resonant = bank.report(key).metrics.lfBump[0]?.result.resonantDb ?? null;
      expect(resonant, key).not.toBeNull();
      expect(resonant!, key).toBeLessThanOrEqual(CASUS1_LF_RESONANT_BUDGET_DB!);
    }
  });

  it('and the SEED is not already within budget — the tune is what earns it', () => {
    /* Without this the claim above would also be true of a corpus whose seeds
     * never needed the trap, and the finding would be about nothing. */
    const s = seedOf(repoFrame, [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]], 334.9, 2250.6);
    expect(s.resonantDb).not.toBeNull();
    expect(s.resonantDb!).toBeGreaterThan(CASUS1_LF_RESONANT_BUDGET_DB!);
  });
});

describe('E-5 — the recorded measurement reproduces', () => {
  const file = join(process.cwd(), 'test-fixtures', 'casus1_e5_app_vs_repo.json');
  interface Rec {
    frames: {
      repo_grid: { van_hz: number; punten: number };
      app_grid: { van_hz: number; punten: number };
      repo_band_hz: [number, number];
      app_band_hz: [number, number];
    };
    md_budget_resonant_db: number;
    zaad: { arm: string; candidate: string; trapHz: number | null }[];
    corpus: { key: string; trapHz: number | null; resonantDb: number | null }[];
  }
  const rec = JSON.parse(readFileSync(file, 'utf-8')) as Rec;

  it('the two frames are the frames the script recorded', () => {
    expect(rec.frames.repo_grid.van_hz).toBeCloseTo(repoFrame.grid[0], 6);
    expect(rec.frames.repo_grid.punten).toBe(repoFrame.grid.length);
    expect(rec.frames.app_grid.punten).toBe(appGrid.length);
    expect(rec.frames.repo_band_hz[0]).toBeCloseTo(CASUS1_V2_BAND_HZ[0], 6);
    expect(rec.frames.app_band_hz[0]).toBeCloseTo(appBandFloorHz, 6);
    expect(rec.md_budget_resonant_db).toBe(CASUS1_LF_RESONANT_BUDGET_DB);
  });

  it('arm A has a trap on every candidate and arms C and D on none', () => {
    const armsOf = (id: string) => rec.zaad.filter((r) => r.arm.startsWith(id));
    expect(armsOf('A').length).toBe(CANDIDATES.length);
    for (const r of armsOf('A')) expect(r.trapHz, r.candidate).not.toBeNull();
    for (const id of ['C', 'D']) {
      expect(armsOf(id).length).toBe(CANDIDATES.length);
      for (const r of armsOf(id)) expect(r.trapHz, `${id} ${r.candidate}`).toBeNull();
    }
  });

  it('the recorded corpus is the live corpus, trap and budget included', () => {
    expect(rec.corpus.map((c) => c.key).sort()).toEqual([...LIVE_CORPUS].sort());
    for (const c of rec.corpus) {
      expect(c.trapHz, c.key).not.toBeNull();
      expect(c.resonantDb!, c.key).toBeLessThanOrEqual(rec.md_budget_resonant_db);
    }
  });
});
