/**
 * F4a — THE CLASSIFICATION OF THE GOLDEN REFERENCES, AS A TEST.
 *
 * `docs/audit_engineV2_optimizerV1_grens.md` (§6, §8) states the problem this
 * guards: engine v2 today bounds VALUES, while WHICH candidates exist is
 * decided upstream by the v1 search. The moment v2 generates its own candidates
 * it legitimately produces different networks — and every reference that pins a
 * property of the SEARCH rather than of the physics goes red exactly when the
 * acceptance authority is needed. V15 wrote that lesson for a measurement
 * session's property; this is the same mistake one layer down, for an engine's.
 *
 * So every reference in `golden_refs_casus1.json` now says what it is a
 * FUNCTION of:
 *
 *   A  (metingen)                  -> waarde   — engine-independent
 *   B  (metingen, gegeven netlist) -> metriek  — a metric on a netlist that
 *                                                sits in test-fixtures as a
 *                                                FILE, so no search moves it
 *   C  (metingen, zoektocht)       -> uitkomst — what a search found
 *
 * Class C may only live under `v1_baseline` (or a future `v2_baseline`) and may
 * never be read as an acceptance value. At F4a that block is EMPTY, and the
 * emptiness is the finding: casus 1's three candidates were frozen as netlist
 * files rather than as run outputs, so nothing in the file depends on the
 * search. That is a fact about this reference set, not a general reassurance —
 * which is why it is asserted here instead of written down once.
 *
 * Four things are checked, and the last one is the only one that costs
 * anything to keep true:
 *
 *  1. Every reference block carries a klasse and an afhankelijkheid, and the
 *     two agree. A NEW top-level block without them fails here.
 *  2. Class C appears nowhere outside the baseline blocks.
 *  3. No source file reads `v1_baseline` — the scan proves it can hit before it
 *     reports a miss.
 *  4. The parameters F4a wrote down ARE the parameters the engine used. A
 *     parameter block nobody compares against the engine is decoration, and
 *     decoration is what V15 was about in the first place.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { buildReport } from './report.ts';
import { ctcKey } from './metrics/types.ts';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(LIB, '..');
const CODE = /\.tsx?$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

const golden = loadGolden() as unknown as Record<string, Record<string, unknown>>;

/** The three legal dependency strings, and the class each one implies. */
const DEPENDENCY_OF_CLASS: Readonly<Record<string, string>> = {
  A: 'meting',
  B: 'meting+netlist',
  C: 'meting+zoektocht',
};

/**
 * Every block in the file that carries a class, by path.
 *
 * Written out rather than discovered, because "discover the blocks that have a
 * klasse and check that they have one" is a test that passes on an empty file.
 * The completeness half is the top-level scan below.
 */
const CLASSED_PATHS: readonly string[] = [
  'afgeleide_parameters._re_direct_parameters',
  'afgeleide_parameters._spl_scan_parameters',
  'afgeleide_parameters._semi_inductantie_parameters',
  'afgeleide_parameters.woofer',
  'afgeleide_parameters.mid',
  'afgeleide_parameters.tweeter',
  'verankerde_gaps_dB',
  'kandidaten._M_A_M_B_parameters',
  'kandidaten._M_E_parameters',
  'kandidaten._M_F_interim_parameters',
  'kandidaten.HUIDIG_2e',
  'kandidaten.KAND_A_2e',
  'kandidaten.KAND_B_3e',
  'kandidaten._V_tweeter_op_fs_dB_sessie_25_08',
  'kandidaten._F3_respons_oordeel',
  'kruisvensters.parameters',
  'kruisvensters.woofer_mid_orde4',
  'kruisvensters.mid_tweeter_orde4',
  'grens_inversies.parameters.maxRs_Qmult',
  'grens_inversies.parameters.maxL_bult',
  'grens_inversies.parameters.max_padR',
  'grens_inversies.parameters.voorbound_serie_C',
  'vensterinteractie',
  'manifest_en_geometrie',
  're_fit_parameters',
  'v1_baseline',
];

/**
 * Top-level keys that legitimately carry NO class.
 *
 * `toleranties` is on it for a reason worth stating: a tolerance is not a
 * reference but the acceptance width OF one. It is not a function of anything —
 * it is a decision with a motivation, and the motivation lives in
 * `toleranties_toelichting`.
 */
const UNCLASSED_TOP_LEVEL: readonly string[] = [
  'casus',
  'meetdata',
  'vastgesteld',
  'classificatie',
  'toleranties',
  'toleranties_toelichting',
  'let_op',
  'herzien_F1',
  'herziening_F1_toelichting',
];

const at = (path: string): Record<string, unknown> => {
  let node: unknown = golden;
  for (const key of path.split('.')) {
    expect(node, `${path}: missing at "${key}"`).toBeTruthy();
    node = (node as Record<string, unknown>)[key];
  }
  expect(node, `${path}: not an object`).toBeTypeOf('object');
  return node as Record<string, unknown>;
};

describe('F4a — every golden reference says what it is a function of', () => {
  it('each classed block carries a klasse and the afhankelijkheid that class implies', () => {
    for (const path of CLASSED_PATHS) {
      const block = at(path);
      const klasse = block.klasse as string;
      const dep = block.afhankelijkheid as string;
      expect(Object.keys(DEPENDENCY_OF_CLASS), `${path}: klasse`).toContain(klasse);
      // The pair, not the two fields separately: "A" with "meting+zoektocht"
      // is the mistake this whole session exists to make impossible.
      expect(dep, `${path}: afhankelijkheid does not match klasse ${klasse}`).toBe(
        DEPENDENCY_OF_CLASS[klasse],
      );
    }
    expect(CLASSED_PATHS.length).toBeGreaterThan(20);
  });

  it('a NEW top-level block without a class fails here', () => {
    /* The completeness half. The list above says which blocks carry a class;
     * this says that every top-level key is either one of those, the parent of
     * one, or on the short list of things that legitimately carry none. Add a
     * block to the file and forget the class, and this is what tells you. */
    const parents = new Set(CLASSED_PATHS.map((p) => p.split('.')[0]));
    const stray = Object.keys(golden).filter(
      (k) => !parents.has(k) && !UNCLASSED_TOP_LEVEL.includes(k),
    );
    expect(stray, `top-level blocks with no klasse and no exemption: ${stray.join(', ')}`).toEqual(
      [],
    );
    // ...and the exemption list has not quietly swallowed the file.
    expect(parents.size).toBeGreaterThanOrEqual(UNCLASSED_TOP_LEVEL.length);
  });

  it('class C lives ONLY under a baseline block, and the baseline is empty at F4a', () => {
    for (const path of CLASSED_PATHS) {
      if (path === 'v1_baseline' || path === 'v2_baseline') continue;
      expect(at(path).klasse, `${path} is class C outside a baseline block`).not.toBe('C');
    }
    const baseline = at('v1_baseline');
    expect(baseline.klasse).toBe('C');
    // Empty, and the file says why (classificatie.bevinding_F4a): casus 1's
    // candidates are FILES, so no reference here is a function of a search.
    expect(baseline.referenties).toEqual({});
    // The commit the baseline would rest on is recorded, not implied.
    expect(String(baseline.v1_commit)).toMatch(/^[0-9a-f]{7,40}$/);
    expect(String(baseline.v1_commit_herleiding).length).toBeGreaterThan(120);
    expect(String(golden.classificatie.bevinding_F4a)).toContain('klasse C');
  });

  it('the classification counts are internally consistent and name their baseline', () => {
    const t = golden.classificatie.telling as Record<string, number | string>;
    const n = (k: string) => t[k] as number;
    expect(n('waardedragend')).toBe(n('bladeren_totaal') - n('proza_en_boekhouding'));
    expect(n('klasse_A') + n('klasse_B') + n('klasse_C') + n('tolerantieklassen')).toBe(
      n('waardedragend'),
    );
    expect(n('klasse_C')).toBe(0);
    // The count is of a STATE, and the state is named — otherwise the numbers
    // drift the first time a parameter block is added and nobody can tell
    // whether they were wrong or merely stale.
    expect(String(t._)).toContain('b137f1d');
  });

  it('no source file reads a v1_baseline value', () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      scanned++;
      text.split('\n').forEach((line, i) => {
        if (line.includes('v1_baseline') && !line.trimStart().startsWith('*')) {
          hits.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    // Except this file, which has to name it in order to forbid it.
    const others = hits.filter((h) => !h.startsWith('lib/engine2/goldenClassification.test.ts'));
    expect(others, `a source file reads v1_baseline:\n${others.join('\n')}`).toEqual([]);
    // The scan really ran, and it really can hit: an assertion that finds
    // nothing is worth nothing until it has shown it is able to find something.
    expect(scanned).toBeGreaterThan(50);
    expect(hits.length).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * The half that costs something: the parameters must BE the parameters
 * ================================================================== */

describe('F4a — the recorded parameters are the ones the engine used (V15)', () => {
  const g = loadGolden();
  const manifest = casus1Manifest(g);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(g);
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, g),
    geometry,
    settings: {
      amplifierPowerW: 100,
      verticalWindowDeg: [-15, 15],
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      diMatchToleranceDb: 2,
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    },
  });
  const driver = (name: string) => report.ingest.drivers.find((d) => d.driver === name)!;
  const spl = at('afgeleide_parameters._spl_scan_parameters');
  const semi = at('afgeleide_parameters._semi_inductantie_parameters');

  it('the SPL scans ran on the recorded grid and against the recorded trend', () => {
    for (const name of ['woofer', 'mid', 'tweeter']) {
      const d = driver(name);
      expect(d.onAxis!.grid, `${name} scan grid`).toHaveLength(spl.raster_punten as number);
      expect(d.breakups!.octaveFraction, `${name} trend width`).toBe(spl.trend_octaaf_deel);
      // ...and on the driver's OWN validity band, which is the point V8c makes:
      // the clipping is the measurement, not a tidy-up afterwards.
      expect(d.breakups!.bandHz[0]).toBeCloseTo(d.onAxis!.bandHz[0], 6);
      expect(d.breakups!.bandHz[1]).toBeCloseTo(d.onAxis!.bandHz[1], 6);
    }
  });

  it('the semi-inductance fit ran on the recorded band', () => {
    const w = driver('woofer');
    const decades = semi.decaden_boven_resonantie as number;
    expect(w.semiInductance!.fitBandHz[0]).toBeCloseTo(
      w.impedance!.upperResonanceHz! * 10 ** decades,
      6,
    );
    // ...and up to the top of the sweep, which is what "tot de top van de
    // sweep" in the file has to mean if it means anything.
    const sweep = casus1Filter('HUIDIG', manifest, files, g).driverZ.woofer.freq;
    expect(w.semiInductance!.fitBandHz[1]).toBeCloseTo(sweep[sweep.length - 1], 6);
    // The refusal limits are the file's, not the test's.
    expect(w.semiInductance!.n).toBeGreaterThanOrEqual(semi.n_geldig_van as number);
    expect(w.semiInductance!.n).toBeLessThanOrEqual(semi.n_geldig_tot as number);
  });

  it('the crossover windows stand on the recorded order and the recorded spacings', () => {
    const p = at('kruisvensters.parameters');
    const ctc = p.c_t_c_mm as Record<string, number>;
    const wm = report.predesign.windows.find((w) => w.lower === 'woofer')!;
    const mt = report.predesign.windows.find((w) => w.lower === 'mid')!;
    expect(wm.spacingMm).toBeCloseTo(ctc.woofer_mid, 6);
    expect(mt.spacingMm).toBeCloseTo(ctc.mid_tweeter, 6);
    // The f_s factor: the mid-tweeter floor IS k times the tweeter's own
    // resonance, at the order the file records.
    expect(p.orde).toBe(4);
    const fs = driver('tweeter').impedance!.fundamentalHz!;
    expect(mt.floorHz!).toBeCloseTo(fs * (p.fs_factor_bij_orde_4 as number), 6);
  });

  it('M-F interim used the FOUR distances the file now records (V20)', () => {
    // What F4a could only make visible, V20 answers: the woofer way has two
    // radiators, so there is no single d. The parameter block records all four
    // and the engine is held to every one of them.
    const p = at('kandidaten._M_F_interim_parameters');
    const wm = report.metrics.lobingLambdas.find((x) => x.lower === 'woofer')!;
    const mt = report.metrics.lobingLambdas.find((x) => x.lower === 'mid')!;
    const mm = (l: typeof wm, key: string): number | null =>
      l.fractions.find((f) => f.key === key)!.distanceMm;

    expect(mm(wm, 'nearest')).toBeCloseTo(p.d_woofer_mid_dichtstbij_mm as number, 6);
    expect(mm(wm, 'centroid')).toBeCloseTo(p.d_woofer_mid_zwaartepunt_mm as number, 6);
    expect(mm(wm, 'farthest')).toBeCloseTo(p.d_woofer_mid_verste_mm as number, 6);
    expect(mm(wm, 'within-way')).toBeCloseTo(p.d_woofer_mid_binnen_weg_mm as number, 6);
    for (const key of ['nearest', 'centroid', 'farthest']) {
      expect(mm(mt, key)).toBeCloseTo(p.d_mid_tweeter_alle_drie_mm as number, 6);
    }
    expect(p.d_mid_tweeter_binnen_weg_mm).toBeNull();
    expect(mm(mt, 'within-way')).toBeNull();

    /* THE CROSS-CHECK the parameter block claims: the nearest-source distance
     * that falls out of the z offsets IS the pair spacing the casebook writes
     * down separately, one block higher. Two numbers arrived at independently;
     * if they ever part company nobody can say which one a reference was
     * computed with — which is the F3c lesson about provenance, applied to the
     * one place where the same distance is recorded twice.
     *
     * The bound is the casebook's own ROUNDING and not a tolerance class: the
     * `ctc_mm` block is written to whole millimetres and the offsets to a
     * tenth, so half a millimetre is the widest the two may honestly differ.
     * A percentage band here would pass on distances that really disagree. */
    const CTC_ROUNDING_MM = 0.5;
    const geo = at('manifest_en_geometrie.geometrie').ctc_mm as Record<string, number>;
    expect(Math.abs(mm(wm, 'nearest')! - geo.woofer_mid)).toBeLessThanOrEqual(CTC_ROUNDING_MM);
    expect(Math.abs(mm(mt, 'nearest')! - geo.mid_tweeter)).toBeLessThanOrEqual(CTC_ROUNDING_MM);
    expect(Math.abs(mm(wm, 'within-way')! - geo.woofer_woofer)).toBeLessThanOrEqual(CTC_ROUNDING_MM);

    // The amplitude weighting is STATED as absent, and the metric says so
    // rather than writing a silent 1 into the centroid.
    expect(wm.notes.join(' ')).toContain('equally driven');
  });

  it('M-E divided by the R_e the file records, not by one that lives only in code', () => {
    // The whole point of the block: until F4a the number under Qes_mult stood
    // on a constant in the fixture and a sentence in V16. A parameter that
    // exists only in code is precisely what V15 forbids.
    const p = at('kandidaten._M_E_parameters');
    expect(p.R_e_ohm).toBeCloseTo(CASUS1_WOOFER_DC_OHM, 6);
    const t = report.metrics.thevenin.find((x) => x.driver === 'woofer')!;
    expect(t.reOhm).toBeCloseTo(p.R_e_ohm as number, 6);
  });

  it('the anchored gaps are a PRE-design analysis: no netlist moves them', () => {
    // The claim `verankerde_gaps_dB.parameters.terugval` makes, measured rather
    // than asserted in prose. If a window were ever incomplete the handover
    // would fall back to the loaded filter's crossing and this block would be
    // class B — so the class is only true while this holds.
    const gapsOf = (candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B') =>
      JSON.stringify(
        buildReport({
          manifest,
          files,
          filter: casus1Filter(candidate, manifest, files, g),
          geometry,
          settings: {
            orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
            reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
          },
        }).predesign.gaps,
      );
    const a = gapsOf('HUIDIG');
    expect(gapsOf('KAND_A')).toBe(a);
    expect(gapsOf('KAND_B')).toBe(a);
    // And there really was a gap block to compare — two nulls agree forever.
    expect(a.length).toBeGreaterThan(100);
  });

  it('the crossover windows are pre-design too, on all three candidates', () => {
    const windowsOf = (candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B') =>
      JSON.stringify(
        buildReport({
          manifest,
          files,
          filter: casus1Filter(candidate, manifest, files, g),
          geometry,
          settings: {
            orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
          },
        }).predesign.windows.map((w) => [w.lower, w.upper, w.floorHz, w.ceilingHz]),
      );
    const a = windowsOf('HUIDIG');
    expect(windowsOf('KAND_A')).toBe(a);
    expect(windowsOf('KAND_B')).toBe(a);
    expect(a).toContain('woofer');
  });
});
