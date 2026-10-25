/**
 * U-10 fase 1 — the refusal of the fallback, and the two named exceptions.
 *
 * Three groups. (1) The decision as a pure function, on REAL reports: casus
 * 1b's two-way report derives its window and nothing is refused; the same
 * manifest with the tweeter removed is a one-way report, holds no window input,
 * and IS refused — that is the fixture without a window. (2) The two named
 * exceptions are never refused, and their sentences are Sander's, verbatim, in
 * both languages. (3) The app half as a SOURCE SCAN (the UI-1 idiom: a unit test
 * cannot say whether `App.tsx` applies the rule, routes the buttons or still
 * feeds the hidden knob — and every one of those was the wrong half once).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isVirtualFilterOnlyRoute,
  SOLO_DESIGN_NOTE,
  v2RouteRefusal,
  VIRTUAL_FILTERS_ONLY_NOTE,
} from './v2RouteRefusal.ts';
import { nl as NL } from '../i18n/nl.ts';
import { buildReport } from './engine2/report.ts';
import {
  CASUS1B_REPORT_SETTINGS,
  casus1bFiles,
  casus1bGeometry,
  casus1bManifest,
  casus1bReport,
  loadGolden1b,
} from './engine2/casus1b.fixture.ts';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8');
/** Comments stripped first: the reasons in this session's notes cite the code they replaced. */
const CODE = APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fnBody = (head: string): string => {
  const i = CODE.indexOf(head);
  expect(i, `${head} exists`).toBeGreaterThan(-1);
  const next = CODE.indexOf('\n  function ', i + head.length);
  return CODE.slice(i, next === -1 ? undefined : next);
};

describe('U-10 — the fallback refuses, on real reports', () => {
  const golden = loadGolden1b();
  const manifest = casus1bManifest(golden);
  it('casus 1b derives its window, so a run starts', () => {
    const report = casus1bReport(null, manifest, casus1bFiles(manifest), golden);
    expect(report.predesign.windowInputs.length).toBe(1);
    expect(v2RouteRefusal({ solo: false, impedanceCount: 2, report })).toBeNull();
  });
  it('the same set with one way removed holds no window input, and IS refused by name', () => {
    const drivers = [...new Set(manifest.entries.map((e) => e.driver))];
    expect(drivers.length).toBe(2);
    const oneWay = { ...manifest, entries: manifest.entries.filter((e) => e.driver === drivers[0]) };
    const files = casus1bFiles(manifest).filter((f) => f.entry.driver === drivers[0]);
    // the remaining way is really there, so the empty window list is about the PAIR
    expect(files.length).toBeGreaterThan(0);
    const report = buildReport({
      manifest: oneWay,
      files,
      filter: null,
      geometry: casus1bGeometry(golden),
      settings: CASUS1B_REPORT_SETTINGS,
    });
    expect(report.ingest.drivers.length).toBe(1);
    expect(report.predesign.windowInputs).toEqual([]);
    const r = v2RouteRefusal({ solo: false, impedanceCount: 1, report });
    expect(r?.kind).toBe('no-window');
    expect(r?.reason).toMatch(/no crossover window can be derived/);
  });
  it('a report that could not be built refuses with its own error message', () => {
    const r = v2RouteRefusal({ solo: false, impedanceCount: 2, report: null, reportError: 'resample: grid exceeds' });
    expect(r?.kind).toBe('no-report');
    expect(r?.reason).toContain('(resample: grid exceeds)');
  });
});

describe('U-10 — the two named exceptions', () => {
  it('a two-way without impedances is the virtual-filter route and is never refused', () => {
    expect(v2RouteRefusal({ solo: false, impedanceCount: 0, report: null })).toBeNull();
    expect(isVirtualFilterOnlyRoute({ solo: false, threeWay: false, impedanceCount: 0 })).toBe(true);
    expect(isVirtualFilterOnlyRoute({ solo: false, threeWay: false, impedanceCount: 2 })).toBe(false);
    expect(isVirtualFilterOnlyRoute({ solo: true, threeWay: false, impedanceCount: 0 })).toBe(false);
    expect(isVirtualFilterOnlyRoute({ solo: false, threeWay: true, impedanceCount: 0 })).toBe(false);
  });
  it('a single driver is the solo route and is never refused, whatever the report', () => {
    expect(v2RouteRefusal({ solo: true, impedanceCount: 1, report: null })).toBeNull();
  });
  it("both sentences are Sander's, verbatim, in both languages", () => {
    expect(NL[VIRTUAL_FILTERS_ONLY_NOTE]).toBe(
      'Zonder impedantiemetingen: alleen virtuele filters. Elektrische eisen (vloer, EPDR, dissipatie) zijn niet beoordeeld.',
    );
    expect(NL[SOLO_DESIGN_NOTE]).toBe(
      'Solo-ontwerp: één driver, geen overname — de v2-eisen per overname zijn hier niet van toepassing',
    );
  });
});

describe('U-10 — the app applies it (source scan)', () => {
  it('a run asks the refusal rule before anything is generated', () => {
    const run = fnBody('async function runVfOptimize(');
    const ask = run.indexOf('v2RouteRefusal({');
    expect(ask).toBeGreaterThan(-1);
    for (const later of ['crossover3Variants(', 'crossoverVariants(', 'runChain3ScanV2(', 'runChainScanV2(', 'runVfRoundsTask(', 'runSoloChainTask(']) {
      expect(run.indexOf(later), later).toBeGreaterThan(ask);
    }
  });
  it('both exceptions print their sentence where the result lands', () => {
    expect(CODE).toMatch(/vfRunStats\?\.virtualOnly && \([\s\S]{0,120}t\(VIRTUAL_FILTERS_ONLY_NOTE\)/);
    expect(CODE).toMatch(/vfRunStats\?\.solo && \([\s\S]{0,120}t\(SOLO_DESIGN_NOTE\)/);
  });
  it('the hidden "Error smoothing" steers neither exception', () => {
    expect(CODE).toMatch(/opts: \{ \.\.\.opts, errorSmoothOct: SEARCH_SMOOTHING_OCTAVES \}/);
    const opts = CODE.slice(CODE.indexOf('const buildNetOptOpts = '), CODE.indexOf('const buildNetOptOpts = ') + 2500);
    expect(opts).toMatch(/errorSmoothOct: SEARCH_SMOOTHING_OCTAVES/);
    expect(opts).not.toMatch(/^\s*errorSmoothOct,$/m);
  });
  it('⚙ Optimize and ✂ Minimize go to the v2 worker on every route except solo', () => {
    for (const head of ['function runNetOptimize()', 'function runMinimize()']) {
      const body = fnBody(head);
      const v2 = body.indexOf('if (!soloDriver && (v2Hybrid || !threeWay))');
      const v2three = body.indexOf('if (!soloDriver && threeWay)');
      const v1 = body.search(/runNetOptimizeTask\(|runMinimizeTask\(/);
      expect(v2, head).toBeGreaterThan(-1);
      expect(v2three, head).toBeGreaterThan(v2);
      expect(v1, head).toBeGreaterThan(v2three);
    }
    expect(fnBody('function runNetOptimizeV2(')).toMatch(/runTuneNetlistV2\(/);
    expect(fnBody('function runNetOptimizeV2_3(')).toMatch(/runTuneNetlist3V2\(/);
  });
});
