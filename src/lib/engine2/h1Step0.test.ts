import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { logspace, resample, type GriddedResponse } from '../dsp.ts';
import { defaultEq, defaultHpLp } from '../filters.ts';
import { optimizeVirtualFilters } from '../vfOptimizer.ts';
import { runIngest } from './ingest/derive.ts';
import { buildReport, type ReportSettings } from './report.ts';
import { judgedBandFloor } from './predesign/judgedBand.ts';
import { CASUS1H_ACTIVE, CASUS1H_REPORT_SETTINGS, casus1hFiles, casus1hGeometry, casus1hManifest } from './casus1h.fixture.ts';

/**
 * H-1 STAP 0 — THE DATED RECORD OF WHAT THE MACHINERY DID BEFORE.
 *
 * `test-fixtures/casus1h_stap0.json` is the measurement the session opened
 * with, and this file reproduces the parts of it that are STILL TRUE after the
 * repair — which is most of it, because H-1 changes one thing: a design step
 * that is handed a STATED high-pass now builds one. Everything the file says
 * about a chain that states none stays true, and the one claim that has to move
 * is asserted in its new form here rather than quietly deleted.
 */
const STAP0 = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-fixtures', 'casus1h_stap0.json'), 'utf-8'),
) as Record<string, Record<string, unknown>>;

const PROBE_POINTS = 240;
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const ingest = runIngest(manifest, files);
const fullOf = (driver: string) => {
  const f = ingest.drivers.find((x) => x.driver === driver)?.onAxisFull;
  if (!f) throw new Error(`no on-axis sum for ${driver}`);
  return f;
};
const banded = (grid: readonly number[], src: { grid: readonly number[]; db: readonly number[]; phaseDeg: readonly number[] }): GriddedResponse => {
  const g = resample(src.grid, src.db, src.phaseDeg, grid, { clampEdges: true });
  const f0 = src.grid[0];
  const f1 = src.grid[src.grid.length - 1];
  return {
    freq: [...grid],
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? -400 : v)),
    phaseDeg: g.phaseDeg.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? 0 : v)),
  };
};
const bareSettings: ReportSettings = (() => {
  const s = { ...CASUS1H_REPORT_SETTINGS };
  delete (s as { activeHandover?: unknown }).activeHandover;
  return s;
})();

describe('H-1 step 0 — what the machinery did before, and what still holds', () => {
  it('the recorded measurement names the set it was taken on', () => {
    expect((STAP0.gemeten_op as { set: string }).set).toBe('koan677');
    expect((STAP0.gemeten_op as { sessie_id: string }).sessie_id).toBe(manifest.sessionId);
  });

  it('THE SILENT DROP IS REPAIRED — the same seed now delivers the high-pass it asked for', () => {
    /* The claim that MOVED. Step 0 measured: asked for LR4 at 450 Hz through
     * the two-way chain's own seed, delivered `enabled: false` at 200 Hz, with
     * no message anywhere. The dated record says so; this asserts the repair,
     * on the same bank. */
    const asked = STAP0.gevraagde_hoogdoorlaat as { hz: number; kind: 'LR'; orde: 4 };
    const before = STAP0.a_ontwerpstap as { geleverd: { enabled: boolean; hz: number } };
    expect(before.geleverd.enabled, 'the dated record no longer says what it measured').toBe(false);

    const grid = logspace(200, 20000, PROBE_POINTS);
    const mid = banded(grid, fullOf('mid'));
    const tweeter = banded(grid, fullOf('tweeter'));
    const seed = {
      woofer: {
        gainDb: 0,
        hp: { enabled: true, kind: asked.kind, order: asked.orde, freq: asked.hz },
        lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
        eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
      },
      tweeter: {
        gainDb: 0,
        hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
        lp: defaultHpLp(20000),
        eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
      },
    };
    const opts = {
      band: [400, 19500] as [number, number],
      eqBandsPerDriver: 2,
      structurePreference: { kind: asked.kind, order: asked.orde },
      maxIterations: 40,
    };
    /* WITHOUT the stated key the drop is STILL what it was — the default is
     * untouched, which is what keeps every v1 caller byte-identical (P2). */
    const still = optimizeVirtualFilters(grid, mid, tweeter, seed, { offsetMm: 0, trimDb: 0, inverted: false }, opts);
    expect(still.specs.woofer.hp.enabled).toBe(false);
    /* WITH it the design step carries the stated shape, at the stated corner,
     * and gives it no handle of its own — a knee the search could move is a
     * handover the search could move, and the active side cannot follow. */
    const now = optimizeVirtualFilters(grid, mid, tweeter, seed, { offsetMm: 0, trimDb: 0, inverted: false }, {
      ...opts,
      lowHighPass: { enabled: true, kind: asked.kind, order: asked.orde, freq: asked.hz },
    });
    expect(now.specs.woofer.hp.enabled).toBe(true);
    expect(now.specs.woofer.hp.kind).toBe(asked.kind);
    expect(now.specs.woofer.hp.order).toBe(asked.orde);
    expect(now.specs.woofer.hp.freq).toBeCloseTo(asked.hz, 9);
  });

  it('the synthesis could always build it — the gap was the design step alone', () => {
    const b = STAP0.b_synthese as { met_hp: { onderdelen: number; hp_serie_condensatoren: number }; zonder_hp: { onderdelen: number; hp_serie_condensatoren: number } };
    expect(b.met_hp.hp_serie_condensatoren).toBe(2);
    expect(b.zonder_hp.hp_serie_condensatoren).toBe(0);
    expect(b.met_hp.onderdelen).toBeGreaterThan(b.zonder_hp.onderdelen);
  });

  it('STILL TRUE — a two-way that states no active side has no window under its lowest way', () => {
    const midTweeterOnly = {
      sessionId: `${manifest.sessionId}-mid-tweeter-only`,
      entries: manifest.entries.filter((e) => e.driver !== 'woofer'),
    };
    const rep = buildReport({
      manifest: midTweeterOnly,
      files: files.filter((f) => f.entry.driver !== 'woofer'),
      filter: null,
      geometry: casus1hGeometry(),
      settings: bareSettings,
    });
    expect(rep.predesign.windows.length).toBe(1);
    expect(rep.predesign.windows[0].lower).toBe('mid');
    expect((STAP0.c_voor_ontwerp as { aantal_vensters: number }).aantal_vensters).toBe(1);
    /* And its judged band starts at the mid's own f_c — the record's number. */
    const floor = judgedBandFloor(rep)!;
    expect(floor.lowest).toBe('mid');
    expect(floor.floorHz).toBeCloseTo((STAP0.c_voor_ontwerp as { beoordeelde_band_vloer_hz: number }).beoordeelde_band_vloer_hz, 2);
  });

  it('STILL TRUE — without a network nothing is high-pass protected, so M-C judges nothing', () => {
    const rep = buildReport({ manifest, files, filter: null, geometry: casus1hGeometry(), settings: bareSettings });
    expect(rep.gates.highPassProtected).toEqual([]);
    expect((STAP0.d_oordeel as { hoogdoorlaatbeschermde_wegen_zonder_netwerk: string[] }).hoogdoorlaatbeschermde_wegen_zonder_netwerk).toEqual([]);
    /* And the project states a figure for the TWEETER and none for the mid —
     * P4, and the reason the mid's protection had to become measurable rather
     * than stated. */
    const stated = (STAP0.d_oordeel as { gestelde_m_c_per_weg: Record<string, number> }).gestelde_m_c_per_weg;
    expect(Object.keys(stated)).toEqual(['tweeter']);
  });

  it('STILL TRUE — the four stated positions lie inside casus 1\'s own woofer→mid window', () => {
    const f = STAP0.f_gestelde_posities_tegen_het_venster as {
      venster_hz: [number, number];
      vloer_regel: string;
      plafond_regel: string;
      posities: { hz: number; binnen_venster: boolean }[];
    };
    expect(f.vloer_regel).toBe('drive');
    expect(f.plafond_regel).toBe('breakup');
    expect(f.posities.map((p) => p.hz)).toEqual(CASUS1H_ACTIVE.positionsHz);
    expect(f.posities.every((p) => p.binnen_venster)).toBe(true);
    /* Re-measured rather than read back: the window is class A and must still
     * come out where the record says. */
    const rep = buildReport({ manifest, files, filter: null, geometry: casus1hGeometry(), settings: bareSettings });
    const w = rep.predesign.windows.find((x) => x.lower === 'woofer' && x.upper === 'mid')!;
    expect(w.floorHz!).toBeCloseTo(f.venster_hz[0], 1);
    expect(w.ceilingHz!).toBeCloseTo(f.venster_hz[1], 1);
  });
});
