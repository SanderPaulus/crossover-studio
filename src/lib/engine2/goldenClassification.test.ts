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
  CASUS1_DIR,
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
  /* V49 — the excursion inputs M-C v2.0's class-A values stand on. */
  'afgeleide_parameters._excursie_parameters',
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

/**
 * The frozen v2 candidates, DERIVED from the manifest rather than listed.
 *
 * Listing them was right at F4d and wrong by the second regeneration. The list
 * said one to nine; the V28 field delivered ten, and `KAND_V2_10` sat in the
 * reference file for a whole delivery without ever being checked for a class —
 * the completeness test only guards TOP-LEVEL keys, and this one lives under
 * `kandidaten`. Every regeneration can change the set (the amplifier floor can
 * now refuse candidates outright), so the set is read from the one place that
 * defines it.
 *
 * The objection to deriving is real and is answered rather than ignored:
 * "discover the blocks that have a class and check they have one" passes on an
 * empty file. So the source here is `manifest_en_geometrie.netlists` — which is
 * NOT the thing being checked — and the count is asserted against the netlist
 * files the manifest names, so an empty or shrunken set fails instead of
 * passing quietly.
 *
 * AND THE FAMILY LIST IS GONE AGAIN — V33, and this is the third time. The
 * predicate used to NAME the families: `KAND_V2_*` (live) and `V28_KAND_*`
 * (dated at V30). V32 froze a second dated corpus, `V30_KAND_*`, and nobody
 * came back here — so ten class-B blocks sat in the reference file for a whole
 * delivery without ever being checked for a class, which is EXACTLY the hole
 * this block was written to close one delivery earlier. A list that has to be
 * extended by hand gets forgotten by hand.
 *
 * So the rule is now structural: every netlist the case book NAMES that is not
 * one of the three v1 baselines must have a classed block under `kandidaten`.
 * A new corpus joins by existing, and a corpus with no block fails instead of
 * being silently outside the scan. The source is still
 * `manifest_en_geometrie.netlists` — deliberately NOT the thing being checked,
 * so an empty `kandidaten` cannot make the test vacuous.
 */
const V1_BASELINES = ['HUIDIG', 'KAND_A', 'KAND_B'];
const FROZEN_NETLIST_KEYS: readonly string[] = Object.keys(
  (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists,
).filter((k) => !V1_BASELINES.includes(k));
const V2_CANDIDATE_PATHS: readonly string[] = FROZEN_NETLIST_KEYS.map((k) => `kandidaten.${k}`);

/** The full list the scan runs over: the fixed blocks plus every frozen v2 candidate. */
const ALL_CLASSED_PATHS: readonly string[] = [...CLASSED_PATHS, ...V2_CANDIDATE_PATHS];

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
    for (const path of ALL_CLASSED_PATHS) {
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
    expect(ALL_CLASSED_PATHS.length).toBeGreaterThan(20);
    /* The derived half cannot be allowed to vanish quietly: every KAND_V2
     * netlist the manifest names must have produced a path here, and the
     * netlist list is itself checked against the files on disk by
     * `casus1V2Candidates.test.ts`. An empty field is a legitimate outcome of a
     * run — the amplifier floor can refuse every candidate — but it must then
     * be empty in BOTH places, and that is what this compares. */
    expect(V2_CANDIDATE_PATHS).toHaveLength(FROZEN_NETLIST_KEYS.length);
    /* The three v1 baselines are excluded on purpose and are classed elsewhere
     * (`v1_baseline`), so their absence here is a decision rather than a gap —
     * asserted, because an exclusion list nobody checks is how the family list
     * this replaced went wrong. */
    for (const key of V1_BASELINES) {
      expect(FROZEN_NETLIST_KEYS, `${key} should be classed as a v1 baseline`).not.toContain(key);
    }
    /* Both the live corpus and at least one DATED corpus are actually present.
     * Without this the structural rule above could quietly stop matching
     * anything — a manifest holding only baselines would pass every assertion
     * in this test. */
    /* M-1 — an EMPTY live corpus is a legitimate outcome (the M-1 field
     * delivered none of 115), and then it has to be empty in the manifest as
     * well: the generator's own bookkeeping says whether it delivered. */
    const herkomst = JSON.parse(readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8')) as {
      shortlist: { bevroren: number };
    };
    expect(FROZEN_NETLIST_KEYS.some((k) => /^KAND_V2_\d+$/.test(k)), 'live v2 corpus vs the generator\'s record').toBe(
      herkomst.shortlist.bevroren > 0,
    );
    expect(
      FROZEN_NETLIST_KEYS.some((k) => /^V\d+_KAND_\d+$/.test(k)),
      'no dated corpus is named any more — the before-halves of V30/V32/V33 have gone',
    ).toBe(true);
  });

  it('a NEW top-level block without a class fails here', () => {
    /* The completeness half. The list above says which blocks carry a class;
     * this says that every top-level key is either one of those, the parent of
     * one, or on the short list of things that legitimately carry none. Add a
     * block to the file and forget the class, and this is what tells you. */
    const parents = new Set(ALL_CLASSED_PATHS.map((p) => p.split('.')[0]));
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
    for (const path of ALL_CLASSED_PATHS) {
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
    /* F4d — the nine v2 candidates are the first references in this file that
     * came out of a v2 run, and they are still class B. The distinction is the
     * one V19 drew: the reference hangs on the netlist FILE, not on the run
     * that produced it, so a later run delivering different networks writes
     * different files rather than moving these numbers. */
    const telling = golden.classificatie.telling as Record<string, unknown>;
    expect(String(telling.sinds_F4d)).toContain('NUL klasse C');
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

/* ================================================================== *
 * E-3 — the same rule on the SECOND casus file: casus 1b
 * ================================================================== */

import { loadGolden1b } from './casus1b.fixture.ts';

describe('E-3 — casus 1b: every golden reference says what it is a function of', () => {
  const golden1b = loadGolden1b() as unknown as Record<string, unknown>;
  const at1b = (path: string): Record<string, unknown> => {
    let node: unknown = golden1b;
    for (const key of path.split('.')) {
      expect(node, `casus 1b ${path}: missing at "${key}"`).toBeTruthy();
      node = (node as Record<string, unknown>)[key];
    }
    expect(node, `casus 1b ${path}: not an object`).toBeTypeOf('object');
    return node as Record<string, unknown>;
  };
  /* Written out, as casus 1's are, so the completeness half below has a list
   * to be complete against. The frozen netlists are DERIVED from the manifest
   * for the reason casus 1 gives (V33): a family list is forgotten by hand. */
  const CLASSED_1B: readonly string[] = [
    'afgeleide_parameters._re_parameters',
    'afgeleide_parameters._spl_scan_parameters',
    'afgeleide_parameters._excursie_parameters',
    'afgeleide_parameters.mid',
    'afgeleide_parameters.tweeter',
    'verankerde_gaps_dB',
    'kruisvensters.parameters',
    'kruisvensters.mid_tweeter_orde4',
    'kandidaten._parameters',
    'manifest_en_geometrie',
    'v1_baseline',
  ];
  const UNCLASSED_1B: readonly string[] = ['casus', 'meetdata', 'vastgesteld', 'waarom', 'classificatie', 'toleranties', 'toleranties_toelichting'];
  const NETLIST_KEYS_1B = Object.keys((golden1b.manifest_en_geometrie as { netlists: Record<string, string> }).netlists);
  const ALL_1B = [...CLASSED_1B, ...NETLIST_KEYS_1B.map((k) => `kandidaten.${k}`)];

  it('each classed block carries a klasse and the afhankelijkheid that class implies', () => {
    for (const path of ALL_1B) {
      const block = at1b(path);
      const klasse = block.klasse as string;
      expect(Object.keys(DEPENDENCY_OF_CLASS), `casus 1b ${path}: klasse`).toContain(klasse);
      expect(block.afhankelijkheid, `casus 1b ${path}: afhankelijkheid does not match klasse ${klasse}`).toBe(DEPENDENCY_OF_CLASS[klasse]);
    }
    // The reference filter and at least one live netlist are classed; the
    // manifest names them, so an empty `kandidaten` cannot pass.
    expect(NETLIST_KEYS_1B).toContain('HUIDIG_MT');
    expect(NETLIST_KEYS_1B.some((k) => /^KAND_V2_\d+$/.test(k))).toBe(true);
  });

  it('a NEW top-level block without a class fails here', () => {
    const parents = new Set(ALL_1B.map((p) => p.split('.')[0]));
    const stray = Object.keys(golden1b).filter((k) => !parents.has(k) && !UNCLASSED_1B.includes(k));
    expect(stray, `casus 1b: top-level blocks with no klasse and no exemption: ${stray.join(', ')}`).toEqual([]);
    expect(parents.size).toBeGreaterThanOrEqual(UNCLASSED_1B.length - 1);
  });

  it('class C lives ONLY under the baseline block, and the baseline is empty', () => {
    for (const path of ALL_1B) {
      if (path === 'v1_baseline') continue;
      expect(at1b(path).klasse, `casus 1b ${path} is class C outside a baseline block`).not.toBe('C');
    }
    const baseline = at1b('v1_baseline');
    expect(baseline.klasse).toBe('C');
    // Empty, as casus 1's is and for the same reason: the reference filter and
    // the frozen candidates are FILES, so no reference here is a function of a
    // search. The commit the baseline would rest on is recorded, not implied.
    expect(baseline.referenties).toEqual({});
    expect(String(baseline.v1_commit)).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

/* ================================================================== *
 * C-2 — the same rule on the THIRD casus file: casus 2 (synthetic)
 * ================================================================== */

import { loadGolden2 } from './casus2.fixture.ts';

describe('C-2 — casus 2: every golden reference says what it is a function of', () => {
  const golden2 = loadGolden2() as unknown as Record<string, unknown>;
  const at2 = (path: string): Record<string, unknown> => {
    let node: unknown = golden2;
    for (const key of path.split('.')) {
      expect(node, `casus 2 ${path}: missing at "${key}"`).toBeTruthy();
      node = (node as Record<string, unknown>)[key];
    }
    expect(node, `casus 2 ${path}: not an object`).toBeTypeOf('object');
    return node as Record<string, unknown>;
  };
  /* Written out, as casus 1's and 1b's are, so the completeness half below has
   * a list to be complete against. The frozen netlists are DERIVED from the
   * manifest for the reason casus 1 gives (V33). */
  const CLASSED_2: readonly string[] = [
    'afgeleide_parameters._extractie_parameters',
    'afgeleide_parameters.extractie_tegen_grondwaarheid',
    'afgeleide_parameters.woofer',
    'afgeleide_parameters.mid',
    'afgeleide_parameters.tweeter',
    'verankerde_gaps_dB',
    'kruisvensters.parameters',
    'kruisvensters.woofer_mid_orde4',
    'kruisvensters.mid_tweeter_orde4',
    'kandidaten._parameters',
    'manifest_en_geometrie',
    'v1_baseline',
  ];
  const UNCLASSED_2: readonly string[] = ['casus', 'meetdata', 'vastgesteld', 'waarom', 'classificatie', 'toleranties', 'toleranties_toelichting'];
  const NETLIST_KEYS_2 = Object.keys((golden2.manifest_en_geometrie as { netlists: Record<string, string> }).netlists);
  const ALL_2 = [...CLASSED_2, ...NETLIST_KEYS_2.map((k) => `kandidaten.${k}`)];

  it('each classed block carries a klasse and the afhankelijkheid that class implies', () => {
    for (const path of ALL_2) {
      const block = at2(path);
      const klasse = block.klasse as string;
      expect(Object.keys(DEPENDENCY_OF_CLASS), `casus 2 ${path}: klasse`).toContain(klasse);
      expect(block.afhankelijkheid, `casus 2 ${path}: afhankelijkheid does not match klasse ${klasse}`).toBe(DEPENDENCY_OF_CLASS[klasse]);
    }
    // At least one live netlist is classed, and the manifest names it — so an
    // empty `kandidaten` cannot make this vacuous.
    expect(NETLIST_KEYS_2.some((k) => /^KAND_V2_\d+$/.test(k))).toBe(true);
  });

  it('a NEW top-level block without a class fails here', () => {
    const parents = new Set(ALL_2.map((p) => p.split('.')[0]));
    const stray = Object.keys(golden2).filter((k) => !parents.has(k) && !UNCLASSED_2.includes(k));
    expect(stray, `casus 2: top-level blocks with no klasse and no exemption: ${stray.join(', ')}`).toEqual([]);
  });

  it('class C lives ONLY under the baseline block, and the baseline is empty', () => {
    for (const path of ALL_2) {
      if (path === 'v1_baseline') continue;
      expect(at2(path).klasse, `casus 2 ${path} is class C outside a baseline block`).not.toBe('C');
    }
    const baseline = at2('v1_baseline');
    expect(baseline.klasse).toBe('C');
    /* Empty, and on this casus for a stronger reason than on casus 1: casus 2
     * has never had a v1 route at all. Every candidate is a FILE, so no
     * reference here is a function of a search. */
    expect(baseline.referenties).toEqual({});
  });

  it('THE GROUND TRUTH is project input, so it lives in the manifest block and inherits its class', () => {
    /* The one thing casus 2 has that no other casus in this book has, and the
     * classification question it raises: the model is not a FUNCTION of the
     * measurements — it is what produced them. It is therefore not A, B or C
     * but project input, and it sits where `driverkaart` and `gestelde_eisen`
     * sit, under a block that already carries the class it inherits. */
    const m = at2('manifest_en_geometrie');
    expect(m.klasse).toBe('A');
    const truth = m.grondwaarheid as Record<string, unknown>;
    expect(truth, 'the ground truth is missing from the manifest block').toBeTruthy();
    expect(truth.klasse, 'the ground truth may not carry a class of its own').toBeUndefined();
    for (const k of ['drivers', 'geometrie', 'poort', 'meetcondities', 'versterker']) {
      expect(Object.keys(truth), `grondwaarheid.${k}`).toContain(k);
    }
    /* And it is a COPY with one home: the generator writes it, the sync script
     * copies it here, and the driver card is derived from it rather than typed.
     * The check is that the two agree — a copy that can drift is the failure
     * this arrangement exists to prevent (the recorder's first run reported the
     * excursion route 42 % off against a card from an earlier tuning). */
    const card = m.driverkaart as Record<string, Record<string, number>>;
    for (const [way, d] of Object.entries(truth.drivers as Record<string, Record<string, number>>)) {
      expect(card[way].Bl_Tm, `${way}: the card's Bl does not match the model`).toBeCloseTo(d.Bl_Tm, 9);
      expect(card[way].M_ms_g, `${way}: the card's M_ms does not match the model`).toBeCloseTo(d.M_ms_g, 9);
      expect(card[way].S_d_cm2, `${way}: the card's S_d does not match the model`).toBeCloseTo(d.S_d_cm2, 9);
      expect(card[way].X_max_mm, `${way}: the card's X_max does not match the model`).toBeCloseTo(d.X_max_mm, 9);
    }
  });
});
