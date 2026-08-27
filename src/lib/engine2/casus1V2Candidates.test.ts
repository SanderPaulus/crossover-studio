/**
 * F4d — THE FROZEN v2 CANDIDATES OF CASUS 1.
 *
 * The ten `KAND-V2-*.adsfilter.json` files in `test-fixtures/casus1/` are the
 * shortlist of the run `scripts/generate-casus1-v2-candidates.ts` performed, and
 * they are frozen for exactly the reason the three v1 candidates are: F4a
 * established that casus 1 has NO class-C references — no reference in the file
 * depends on what a search found — and V19 says why that matters precisely now.
 * Writing "what the v2 run produced" into the reference file would create the
 * first one, on the day v2 started producing things.
 *
 * So the netlists are FILES, their metrics are class B (a function of the
 * measurement set and a netlist), and this file checks three separate claims:
 *
 *  1. THE METRICS REPRODUCE. Same discipline as the three baselines: the metric
 *     library, run on a file that does not move.
 *  2. THE COMPARISON IS HONEST. The v2 candidates and the v1 baselines are put
 *     through the same assembly and shown side by side. Nothing is ranked — and
 *     what the table shows is NOT flattering to the candidates, which is
 *     recorded rather than tidied (casebook V27).
 *  3. THE RUN REPRODUCES THEM. One live pass through the real worker route
 *     delivers the stored network byte for byte.
 *
 * COST, stated because it is real: claim 3 runs one full casus-1 chain, which
 * takes about two minutes — casus 1 is a dense, three-driver measurement set
 * and the tune is the expensive part (measured at the F4d follow-up: 37–72 s per
 * candidate over the fifteen the field now holds). ONE candidate is run live and
 * the rest are read from disk. A regression nobody runs because it is slow
 * protects nothing; the discipline is `workerRouteRegression.test.ts`'s and the
 * reasoning is the same.
 *
 * FIFTEEN CANDIDATES, TEN FILES — and the gap between those two numbers is new.
 * The F4d follow-up suspended the F3c recommended-band excision (casebook V28):
 * the zone it cut is a λ fraction on one centre-to-centre distance, and V20a
 * reserves every lobing judgement for the vertical synthesis. The mid→tweeter
 * axis went from three positions to five, so the FIELD went from nine to
 * fifteen — and the shortlist, which passed nine of nine when the field was
 * nine, now passes ten of fifteen. It had never actually refused anything
 * before; it does now. What is frozen is the shortlist, as it always was.
 *
 * These are therefore different FILES under the same discipline, which is
 * precisely why no reference had to be declared invalid: the references hang on
 * files, and the files were replaced.
 *
 * The DETERMINISM claim proper — two runs, one seed, byte-identical, through
 * `handleV2Request` — is proved in `optimizer/candidateRoute.test.ts` on a
 * cheap fixture, because it is a claim about the ROUTE and not about casus 1.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
} from './casus1V2.fixture.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { FLAT_TARGET } from './requirements/targetCurve.ts';
import { compareDesigns } from './predesign/comparison.ts';
import { stableJson } from './optimizer/determinism.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from './optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../threeWayChain.ts';

const golden = loadGolden();
const TOL = golden.toleranties;
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const HERKOMST = JSON.parse(
  readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8'),
) as {
  seed: number;
  run_vingerafdruk: string;
  gegenereerd_op_commit: string;
  bestanden: { name: string; label: string }[];
  generator_parameters: { derivedSize: number; deliveredSize: number };
  shortlist: { overwogen: number; bevroren: number };
  meetopstelling: {
    synthMode: string;
    v2_poorten_gewapend: string[];
    v2_poorten_waarom: string;
    v2_budgetten_gewapend: string[];
    v2_budgetten_waarom: string;
    beschermingen_via_kandidaat: string[];
    seed: number;
  };
};

const V2_KEYS = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) =>
  k.startsWith('KAND_V2'),
);

const report = (key: string): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: {
      amplifierPowerW: 100,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: FLAT_TARGET,
    },
  });

describe('the frozen v2 candidates are files, and the file says where they came from', () => {
  it('every generated netlist is listed in the manifest and readable', () => {
    expect(V2_KEYS.length).toBe(HERKOMST.bestanden.length);
    for (const key of V2_KEYS) {
      const name = golden.manifest_en_geometrie.netlists[key];
      expect(name).toMatch(/^KAND-V2-\d+\.adsfilter\.json$/);
      expect(readFileSync(join(CASUS1_DIR, name), 'utf-8').length).toBeGreaterThan(100);
    }
  });

  it('the provenance block is DOCUMENTATION and says so', () => {
    /* Nothing here is an acceptance value. It exists so a later reader can
     * regenerate these files and know what they are comparing against. */
    expect(HERKOMST.seed).toBe(CASUS1_V2_SEED);
    expect(HERKOMST.gegenereerd_op_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(HERKOMST.run_vingerafdruk).toContain(`seed=${CASUS1_V2_SEED}`);
    // The `choices` ingredient is what F4d added on this route: a run over a
    // different candidate field must not stamp the same.
    expect(HERKOMST.run_vingerafdruk).toMatch(/choices=[0-9a-f]{8}/);
    /* Derived rather than typed: the field size has already changed once
     * (nine → fifteen at V28) and a hard-coded count turns a legitimate
     * regeneration into a test edit. What must hold is that the manifest, the
     * files on disk and the generator's own bookkeeping agree. */
    expect(HERKOMST.generator_parameters.deliveredSize).toBe(HERKOMST.shortlist.overwogen);
    expect(HERKOMST.shortlist.bevroren).toBe(HERKOMST.bestanden.length);
    expect(HERKOMST.shortlist.bevroren).toBeLessThanOrEqual(HERKOMST.shortlist.overwogen);
    expect(HERKOMST.generator_parameters.derivedSize).toBeGreaterThanOrEqual(
      HERKOMST.generator_parameters.deliveredSize,
    );
  });

  it('the provenance block names the MEASUREMENT SETUP — synthesis, gates, budgets', () => {
    /* F4d-nazorg, controle 2. V27 records two wrong setups before the
     * definitive one: protections unarmed (min |Z| 0.00 Ω) and
     * `synthMode: 'filter'` where the app runs `'acoustic'`. Neither was
     * readable back off what the manifest wrote down, so both had to be
     * reconstructed from memory. These four assertions make the setup part of
     * the artefact instead. */
    const m = HERKOMST.meetopstelling;
    expect(m.synthMode).toBe(CASUS1_V2_SETTINGS.synthMode);
    // Absent is written as absent WITH its reason, never omitted — P4. An
    // omitted key reads as an oversight.
    expect(Array.isArray(m.v2_poorten_gewapend)).toBe(true);
    expect(m.v2_poorten_waarom).toMatch(/P4/);
    expect(Array.isArray(m.v2_budgetten_gewapend)).toBe(true);
    expect(m.v2_budgetten_waarom.length).toBeGreaterThan(0);
    // The protections V27's first pass left out are named, and they are named
    // by being READ OFF the declaration rather than restated.
    for (const k of ['safety', 'staged', 'audit', 'rSourceDisqualifyOhm']) {
      expect(m.beschermingen_via_kandidaat, `${k} is not declared`).toContain(k);
    }
    expect(m.seed).toBe(CASUS1_V2_SEED);
  });

  it('the candidate metrics are CLASS B, and the reference file says so', () => {
    for (const key of V2_KEYS) {
      const block = (golden.kandidaten as unknown as Record<string, Record<string, unknown>>)[key];
      expect(block, `${key} has no reference block`).toBeTruthy();
      expect(block.klasse).toBe('B');
      expect(block.afhankelijkheid).toBe('meting+netlist');
    }
  });
});

describe('the metrics on the frozen netlists reproduce', () => {
  const REF = golden.kandidaten as unknown as Record<string, Record<string, number>>;
  it.each(V2_KEYS)('%s', (key) => {
    const r = report(key);
    const ref = REF[key];
    const near = (got: number | null | undefined, want: number, tol: number, what: string) => {
      expect(got, `${key}: ${what} was not computed`).not.toBeNull();
      expect(Math.abs(got! - want), `${key}: ${what}`).toBeLessThanOrEqual(tol);
    };
    near(r.metrics.epdr?.minZOhm, ref.minZ, TOL.ohm, 'min |Z|');
    near(r.metrics.epdr?.minOhm, ref.minEPDR, TOL.ohm, 'min EPDR');
    near(
      (r.metrics.dissipation?.totalFraction ?? NaN) * 100,
      ref.dissipatie_pct,
      TOL.procentpunten,
      'dissipation',
    );
    near(r.system.response?.rmsDeviationDb, ref.rms_vlakheid_dB, TOL.dB, 'RMS flatness');
    near(r.system.response?.windowPlusMinusDb, ref.spl_venster_pm_dB, TOL.dB, 'SPL window');
  });
});

describe('the comparison block on casus 1', () => {
  const table = compareDesigns([
    { label: 'HUIDIG', origin: 'baseline', report: report('HUIDIG') },
    { label: 'KAND-A', origin: 'baseline', report: report('KAND_A') },
    { label: 'KAND-B', origin: 'baseline', report: report('KAND_B') },
    ...V2_KEYS.map((k) => ({
      label: k.replace(/_/g, '-'),
      origin: 'v2-candidate' as const,
      report: report(k),
    })),
  ]);

  it('holds every design, baselines first, ranked by nothing', () => {
    expect(table.rows).toHaveLength(3 + V2_KEYS.length);
    expect(table.rows.slice(0, 3).map((r) => r.origin)).toEqual(['baseline', 'baseline', 'baseline']);
    expect(table.rows.slice(3).every((r) => r.origin === 'v2-candidate')).toBe(true);
    expect(table.note).toMatch(/Nothing in this table is ranked/);
  });

  it('every cell is present with its unit, or absent with its reason', () => {
    for (const row of table.rows) {
      for (const col of table.columns) {
        const c = row.cells[col.key];
        if (c.value === null) expect(c.absentReason!.length).toBeGreaterThan(20);
        else expect(c.unit.length).toBeGreaterThan(0);
      }
    }
  });
});

/* ================================================================== *
 * The live run — one candidate, through the route the app takes
 * ================================================================== */

describe('the run still delivers the frozen netlist', () => {
  it('one candidate, live through handleV2Request, byte for byte', () => {
    const rep = report('HUIDIG');
    const field = casus1Field(rep);
    const gridded = casus1ChainInput(manifest, files, golden);
    /* The candidate whose FILE this compares against. Picked by the label the
     * provenance block records rather than by position, so a reordering of the
     * shortlist cannot silently make this compare two different designs. */
    const target = HERKOMST.bestanden[0];
    const c = field.field.candidates.find((x) => x.label === target.label);
    expect(c, `the field no longer holds ${target.label}`).toBeTruthy();

    const input: Chain3Input = {
      grid: [...gridded.grid],
      w: gridded.w,
      m: gridded.m,
      t: gridded.t,
      driverZ: gridded.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c!.crossings[0].hz,
      xoHigh: c!.crossings[1].hz,
      xoLowRange: c!.crossings[0].cageHz,
      xoHighRange: c!.crossings[1].cageHz,
      label: c!.label,
      settings: {
        ...CASUS1_V2_SETTINGS,
        safety: gridded.safety,
        structureLow: { kind: c!.crossings[0].alignment.kind, order: c!.crossings[0].alignment.order },
        structureHigh: { kind: c!.crossings[1].alignment.kind, order: c!.crossings[1].alignment.order },
        xoFloorPairs: c!.crossings.map((x) => x.windowHz[0]),
      } as unknown as Chain3Input['settings'],
    };
    /* THE GATES THIS RUN ARMS MUST BE THE GATES THE GENERATOR ARMED.
     *
     * They used to be none, and that was right while casus 1 stated no limits:
     * the generator armed none either, so the two runs matched by having
     * nothing. Since the floor was stated the generator arms `M-B/|Z|`, and an
     * armed gate is not a passive observer — `gateViolation` can refuse a step
     * the search was about to take, which changes the path. Reproducing a
     * frozen netlist through "the real route" with a different set of gates is
     * reproducing a different route, and this test failed exactly that way at
     * V30 rather than quietly comparing two designs.
     *
     * Read from the same one home as everything else (P6), and checked against
     * what the provenance block recorded, so the two cannot drift. */
    const armedGates = CASUS1_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM } : {};
    expect(Object.keys(armedGates).sort()).toEqual([...HERKOMST.meetopstelling.v2_poorten_gewapend].sort());
    const payload: V2Chain3Payload = {
      input,
      v2: {
        gates: armedGates,
        budgets: {},
        determinism: { seed: CASUS1_V2_SEED },
        targetCurve: FLAT_TARGET,
        judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: casus1V2Declaration(c!, gridded.safety),
    };
    const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
    let out: Chain3Result | null = null;
    handleV2Request(wire, (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') out = (m.data as { result: Chain3Result }).result;
    });
    expect(out).toBeTruthy();

    const stored = JSON.parse(
      readFileSync(join(CASUS1_DIR, `${target.name}.adsfilter.json`), 'utf-8'),
    ) as { parts: unknown[] };
    expect(stableJson((out as unknown as Chain3Result).parts)).toBe(stableJson(stored.parts));
    // ...and the netlist is a real one, so two empty arrays cannot pass.
    expect(stored.parts.length).toBeGreaterThan(6);
  }, 900_000);
});
