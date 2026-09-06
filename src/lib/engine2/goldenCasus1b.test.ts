/**
 * E-3 — CASUS 1b: casus 1's mid and tweeter as a TWO-WAY, the acceptance
 * authority for `test-fixtures/casus1b/golden_refs_casus1b.json`.
 *
 * The same discipline as `goldenCasus1.test.ts`, on a second casus file: every
 * class-A reference (a function of the MEASUREMENTS alone) reproduces on a
 * report with no netlist AND on the reference filter, every class-B reference
 * (measurement + netlist) reproduces on its frozen file, and the tolerances
 * come from the file, never from here. No literal casus number in this file
 * (P6): what is asserted is read from the reference file or derived.
 *
 * What E-3 measured with this casus is asserted here too: the one crossover
 * window is the SAME window casus 1 derives for its mid→tweeter pair (same
 * files, same stated order, same stated tweeter figure, same spacing), and the
 * exploration field is the centre of that window and its two neighbours.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { deserializeFilter } from '../filterFile.ts';
import { stableJson } from './optimizer/determinism.ts';
import { EXPLORATION_CHAIN_BUDGET } from './constants.ts';
import {
  CASUS1_DIR,
  casus1ExcursionSettings,
  casus1Files,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  casus1TargetCurve,
  loadGolden,
} from './casus1.fixture.ts';
import {
  CASUS1B_DIR,
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_GRID,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  loadGolden1b,
} from './casus1b.fixture.ts';

const golden = loadGolden1b();
const TOL = golden.toleranties;
const manifest = casus1bManifest(golden);
const files = casus1bFiles(manifest);
const BARE = casus1bReport(null, manifest, files, golden);
const NETLISTS = Object.keys(golden.manifest_en_geometrie.netlists);
const REPORTS = Object.fromEntries(NETLISTS.map((k) => [k, casus1bReport(k, manifest, files, golden)]));
const pct = (actual: number, expected: number) => (Math.abs(actual - expected) / Math.abs(expected)) * 100;
const driver = (name: string, r = BARE) => r.ingest.drivers.find((d) => d.driver === name)!;
const num = (v: unknown): number => {
  expect(typeof v, `expected a number, got ${JSON.stringify(v)}`).toBe('number');
  return v as number;
};

describe('E-3 casus 1b — class A: the derived parameters are functions of the measurements alone', () => {
  it.each(['mid', 'tweeter'] as const)('%s: R_e, the fundamental, Z_max, the breakups, directivity and the floor reproduce', (name) => {
    const ref = golden.afgeleide_parameters[name];
    expect(ref.klasse).toBe('A');
    const d = driver(name);
    expect(Math.abs(d.re!.ohm - num(ref.Re))).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(d.re!.directOhm - num(ref.Re_direct))).toBeLessThanOrEqual(TOL.ohm);
    expect(d.re!.sourceText).toBe(ref.Re_herkomst);
    expect(pct(d.re!.fit!.relativeResidual, num(ref.Re_fit_residu))).toBeLessThanOrEqual(TOL.fit_kwaliteit_pct);
    const fund = name === 'mid' ? ref.fc : ref.fs;
    expect(pct(d.impedance!.fundamentalHz!, num(fund))).toBeLessThanOrEqual(TOL.frequenties_pct);
    const zmax = d.impedance!.sealed?.zMaxOhm ?? d.impedance!.motionalPeaks[0]?.ohm;
    expect(Math.abs(zmax! - num(ref.Zmax))).toBeLessThanOrEqual(TOL.ohm);
    if (name === 'mid') {
      expect(pct(d.impedance!.sealed!.qtc!, num(ref.Qtc))).toBeLessThanOrEqual(TOL.Q_pct);
      expect(d.impedance!.type).toBe('sealed');
    }
    const peaks = d.breakups!.peaks.filter((p) => p.dB >= 2.5).map((p) => [p.fHz, p.dB]);
    const refPeaks = ref.breakups as [number, number][];
    expect(peaks).toHaveLength(refPeaks.length);
    peaks.forEach(([hz, db], i) => {
      expect(pct(hz, refPeaks[i][0])).toBeLessThanOrEqual(TOL.frequenties_pct);
      expect(Math.abs(db - refPeaks[i][1])).toBeLessThanOrEqual(TOL.dB);
    });
    const dir30 = d.directivity.find((p) => Math.abs(p.angleDeg) === 30);
    if (ref.dir_m6_30 === null) expect(dir30?.minus6Hz ?? null).toBeNull();
    else expect(pct(dir30!.minus6Hz!, num(ref.dir_m6_30))).toBeLessThanOrEqual(TOL.frequenties_pct);
    expect(pct(d.onAxis!.bandHz[0], num(ref.FF_vloer))).toBeLessThanOrEqual(TOL.frequenties_pct);
    expect(d.onAxis!.bandFloorProvenance).toBe(ref.FF_vloer_bron);
    /* M-C v2.0 (V49): the class-A excursion figures. */
    const exc = BARE.metrics.driveExcursion.find((x) => x.driver === name)!;
    expect(pct(exc.xPerVoltMmPerV, num(ref.excursie_x_per_V_op_f0_mm_per_V))).toBeLessThanOrEqual(TOL.fit_kwaliteit_pct);
    expect(Math.abs(exc.ceiling.ceilingDbReInput - num(ref.excursie_plafond_re_ingang_dB))).toBeLessThanOrEqual(TOL.dB);
    expect(pct(exc.electromechanical!.qms!, num(ref.excursie_Q_ms))).toBeLessThanOrEqual(TOL.Q_pct);
  });

  it('class A means the same value on every report, with and without a netlist', () => {
    for (const key of NETLISTS) {
      for (const name of ['mid', 'tweeter'] as const) {
        const a = driver(name);
        const b = driver(name, REPORTS[key]);
        expect(b.re!.ohm, `${key}/${name} R_e`).toBe(a.re!.ohm);
        expect(b.impedance!.fundamentalHz, `${key}/${name} f`).toBe(a.impedance!.fundamentalHz);
        expect(stableJson(b.breakups!.peaks), `${key}/${name} breakups`).toBe(stableJson(a.breakups!.peaks));
        expect(REPORTS[key].metrics.driveExcursion.find((x) => x.driver === name)!.ceiling.ceilingDbReInput).toBe(
          BARE.metrics.driveExcursion.find((x) => x.driver === name)!.ceiling.ceilingDbReInput,
        );
      }
      expect(stableJson(REPORTS[key].predesign.windows.map((w) => [w.floorHz, w.ceilingHz]))).toBe(
        stableJson(BARE.predesign.windows.map((w) => [w.floorHz, w.ceilingHz])),
      );
    }
  });

  it('the derived parameters carry their parameter blocks, and the blocks say what the engine used (V15)', () => {
    const p = golden.afgeleide_parameters;
    for (const block of ['_re_parameters', '_spl_scan_parameters', '_excursie_parameters']) {
      expect(p[block]?.klasse, block).toBe('A');
    }
    const scan = p._spl_scan_parameters as { trendbreedte_oct: Record<string, number>; significant_vanaf_dB: number };
    for (const name of ['mid', 'tweeter'] as const) {
      expect(driver(name).breakups!.octaveFraction).toBe(scan.trendbreedte_oct[name]);
    }
    const exc = p._excursie_parameters as { versterker_piekvermogen_W: number; xmax_marge: number };
    expect(casus1ExcursionSettings(golden as never).amplifierPeakPowerW).toBe(exc.versterker_piekvermogen_W);
    expect(casus1ExcursionSettings(golden as never).xmaxMarginFraction).toBe(exc.xmax_marge);
  });
});

describe('E-3 casus 1b — the one window, the anchored gaps and the exploration field', () => {
  const w = BARE.predesign.windows.find((x) => x.lower === 'mid' && x.upper === 'tweeter')!;
  const ref = golden.kruisvensters.mid_tweeter_orde4 as { venster: [number, number]; vloer_bindend: string; plafond_bindend: string; klasse: string };

  it('the window reproduces, floor and ceiling by the recorded rules', () => {
    expect(ref.klasse).toBe('A');
    expect(w.order).toBe(CASUS1B_STATED_ORDER);
    expect(pct(w.floorHz!, ref.venster[0])).toBeLessThanOrEqual(TOL.frequenties_pct);
    expect(pct(w.ceilingHz!, ref.venster[1])).toBeLessThanOrEqual(TOL.frequenties_pct);
    expect(w.floorBy!.rule).toBe(ref.vloer_bindend);
    expect(w.ceilingBy!.rule).toBe(ref.plafond_bindend);
    expect(w.empty).toBe(false);
  });

  it('E-3, the first measurement: casus 1b\'s window IS casus 1\'s mid→tweeter window, to the hertz', () => {
    /* Same files, same stated order, same stated tweeter figure, same spacing:
     * the window is a function of those four and of nothing the woofer brings.
     * Casus 1's report is built with the settings its own golden test uses. */
    const g1 = loadGolden();
    const m1 = casus1Manifest(g1);
    const f1 = casus1Files(m1);
    const r1 = buildReport({
      manifest: m1,
      files: f1,
      filter: null,
      geometry: casus1Geometry(g1),
      settings: {
        orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
        targetCurve: casus1TargetCurve(g1),
        ...casus1ExcursionSettings(g1),
        ...(Object.keys(casus1MaxDriveOnFsDbByDriver(g1)).length > 0 ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(g1) } : {}),
      },
    });
    const w1 = r1.predesign.windows.find((x) => x.lower === 'mid' && x.upper === 'tweeter')!;
    expect(w.floorHz).toBeCloseTo(w1.floorHz!, 6);
    expect(w.ceilingHz).toBeCloseTo(w1.ceilingHz!, 6);
    expect(w.floorBy!.rule).toBe(w1.floorBy!.rule);
    expect(w.ceilingBy!.rule).toBe(w1.ceilingBy!.rule);
    // ...and casus 1 has a second pair that casus 1b, by construction, has not.
    expect(r1.predesign.windows).toHaveLength(2);
    expect(BARE.predesign.windows).toHaveLength(1);
  });

  it('the anchored gaps: the mid is the lowest way AND the anchor, the tweeter carries the one gap', () => {
    const ref = golden.verankerde_gaps_dB as { anker: string; tweeter_tov_mid: number; klasse: string };
    expect(ref.klasse).toBe('A');
    const g = BARE.predesign.gaps!;
    expect(g.anchor).toBe(ref.anker);
    expect(g.anchor).toBe(BARE.driversLowToHigh[0]);
    expect(g.anchorSwitchWarning).toBeNull();
    expect(g.ways).toHaveLength(1);
    expect(g.ways[0].driver).toBe('tweeter');
    expect(g.ways[0].gapToAnchorDb).toBeCloseTo(ref.tweeter_tov_mid, 2);
    expect(g.ways[0].gapToAnchorDb).toBeGreaterThan(0);
  });

  it('the exploration field: one pair, the stated order only, the window centre and its two neighbours, under budget 8', () => {
    const veld = (golden.kruisvensters.mid_tweeter_orde4 as { veld_verkenning: { posities_hz: number[]; orden: number[]; kandidaten: number; budget: number } }).veld_verkenning;
    const field = casus1bField(BARE);
    expect(field.field.axes).toHaveLength(1);
    expect(field.field.parameters.chainBudget).toBe(EXPLORATION_CHAIN_BUDGET);
    expect(field.field.parameters.chainBudget).toBe(veld.budget);
    expect(field.field.parameters.positionPolicy).toBe('centre-first');
    expect(field.field.parameters.alignmentPolicy).toBe('one');
    expect(field.field.candidates).toHaveLength(veld.kandidaten);
    const axis = field.field.axes[0];
    expect(axis.orders).toEqual([CASUS1B_STATED_ORDER]);
    expect(axis.orders).toEqual(veld.orden);
    const hz = axis.positionsByOrder.flatMap((p) => p.hz);
    hz.forEach((h, i) => expect(pct(h, veld.posities_hz[i])).toBeLessThanOrEqual(TOL.frequenties_pct));
    // The geometric centre of the window is a position, and every position is inside the window.
    // Window edges and positions are recorded to a tenth of a hertz, so the
    // match is a hundredth of a percent — a rounding convention, not a tolerance class.
    const centre = Math.sqrt(w.floorHz! * w.ceilingHz!);
    expect(hz.some((h) => pct(h, centre) <= 0.01), `${hz.join('/')} vs centre ${centre}`).toBe(true);
    for (const h of hz) {
      expect(h).toBeGreaterThanOrEqual(w.floorHz! - 1e-9);
      expect(h).toBeLessThanOrEqual(w.ceilingHz! + 1e-9);
    }
    for (const c of field.field.candidates) {
      expect(c.crossings).toHaveLength(1);
      expect(c.crossings[0].alignment.order).toBe(CASUS1B_STATED_ORDER);
      expect(CASUS1B_FIELD_ALIGNMENTS.some((a) => a.kind === c.crossings[0].alignment.kind)).toBe(true);
    }
  });

  it('the chain grid and the judged band are derived from the lowest way (the M-1 rule, on casus 1b)', () => {
    const mid = driver('mid');
    expect(CASUS1B_V2_GRID[0]).toBeCloseTo(mid.onAxis!.bandHz[0], 9);
    expect(CASUS1B_V2_BAND_HZ[0]).toBeCloseTo(Math.max(mid.onAxis!.bandHz[0], mid.impedance!.fundamentalHz!), 9);
    expect(CASUS1B_V2_BAND_HZ[0]).toBeGreaterThan(CASUS1B_V2_GRID[0]);
    expect(CASUS1B_V2_BAND_HZ[1]).toBeLessThan(CASUS1B_V2_GRID[CASUS1B_V2_GRID.length - 1]);
  });
});

describe('E-3 casus 1b — class B: every frozen netlist reproduces its block', () => {
  it('the manifest, the files on disk and the generator\'s record agree about the live corpus', () => {
    /* The orphan-file guard of casus 1 (V32), on casus 1b: a KAND-V2 file the
     * manifest does not name is a corpse under a live name. And the generator's
     * own count must be the manifest's, so a regeneration cannot leave the two
     * disagreeing. */
    const onDisk = readdirSync(CASUS1B_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f)).sort();
    const named = Object.values(golden.manifest_en_geometrie.netlists).filter((f) => /^KAND-V2-/.test(f)).sort();
    expect(onDisk).toEqual(named);
    const herkomstPath = join(CASUS1B_DIR, '..', 'casus1b_v2_herkomst.json');
    expect(existsSync(herkomstPath)).toBe(true);
    const herkomst = JSON.parse(readFileSync(herkomstPath, 'utf-8')) as { shortlist: { bevroren: number }; bestanden: { name: string }[] };
    expect(herkomst.shortlist.bevroren).toBe(named.length);
    expect(herkomst.bestanden.map((b) => `${b.name}.adsfilter.json`).sort()).toEqual(named);
    for (const key of NETLISTS) expect(golden.kandidaten[key]?.klasse, `${key} has no class-B block`).toBe('B');
  });

  it.each(NETLISTS)('%s reproduces its seventeen metrics within the file\'s tolerance classes', (key) => {
    const ref = golden.kandidaten[key];
    const rep = REPORTS[key];
    expect(ref.afhankelijkheid).toBe('meting+netlist');
    expect(Math.abs(rep.metrics.epdr!.minZOhm - num(ref.minZ))).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(rep.metrics.epdr!.minOhm - num(ref.minEPDR))).toBeLessThanOrEqual(TOL.ohm);
    expect(Math.abs(rep.metrics.dissipation!.totalFraction * 100 - num(ref.dissipatie_pct))).toBeLessThanOrEqual(TOL.procentpunten);
    const hottest = rep.metrics.dissipation!.elements.find((e) => !e.parasitic)?.watts ?? null;
    if (ref.grootste_R_W_bij_100W === null) expect(hottest).toBeNull();
    else expect(pct(hottest!, num(ref.grootste_R_W_bij_100W))).toBeLessThanOrEqual(TOL.watt_pct);
    expect(Math.abs(rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')!.db - num(ref.V_tweeter_op_fs_dB))).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(rep.metrics.driveVoltage.find((d) => d.driver === 'mid')!.db - num(ref.V_mid_op_fs_dB))).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(rep.system.response!.rmsDeviationDb - num(ref.rms_vlakheid_dB))).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(rep.system.response!.windowPlusMinusDb - num(ref.spl_venster_pm_dB))).toBeLessThanOrEqual(TOL.dB);
    const mt = rep.system.phaseTracking.find((p) => p.lower === 'mid' && p.upper === 'tweeter')!;
    expect(Math.abs(mt.meanAbsDeg - num(ref.mt_fase_oct))).toBeLessThanOrEqual(TOL.graden);
    expect(Math.abs(mt.control.octaveClipped.meanAbsDeg! - num(ref.mt_fase_oct_octaafgeknipt_V43))).toBeLessThanOrEqual(TOL.graden);
    expect(Math.abs(mt.control.overlapWindow.meanAbsDeg! - num(ref.mt_fase_overlapvenster_V43))).toBeLessThanOrEqual(TOL.graden);
    const q = rep.metrics.thevenin.find((t) => t.qMultiplier !== null)?.qMultiplier ?? null;
    if (ref.Qes_mult === null) expect(q).toBeNull();
    else expect(pct(q!, num(ref.Qes_mult))).toBeLessThanOrEqual(TOL.exponent_pct);
    /* The gates the block records are the gates the report arms, verdict for verdict. */
    const poorten = ref.poorten as { poort: string; onderwerp: string; geslaagd: boolean }[];
    const fresh = rep.gates.verdicts.filter((v) => v.active).map((v) => ({ poort: v.gate, onderwerp: v.subject, geslaagd: v.pass }));
    expect(fresh).toEqual(poorten.map((p) => ({ poort: p.poort, onderwerp: p.onderwerp, geslaagd: p.geslaagd })));
  });

  it('HUIDIG_MT is casus 1\'s HUIDIG with the woofer path removed: every part is a part of HUIDIG, byte for byte', () => {
    const mt = deserializeFilter(readFileSync(join(CASUS1B_DIR, golden.manifest_en_geometrie.netlists.HUIDIG_MT), 'utf-8'));
    const g1 = loadGolden();
    const full = deserializeFilter(readFileSync(join(CASUS1_DIR, (g1.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists.HUIDIG), 'utf-8'));
    const fullSet = new Set(full.parts.map((p) => stableJson(p)));
    for (const p of mt.parts) expect(fullSet.has(stableJson(p)), `${p.type} ${p.partId ?? ''} is not a part of HUIDIG`).toBe(true);
    expect(mt.parts.length).toBeLessThan(full.parts.length);
    expect(mt.parts.filter((p) => p.type === 'Driver').map((p) => p.model).sort()).toEqual(['mid', 'tweeter']);
    // And what was removed is the woofer path: no woofer model survives.
    expect(full.parts.filter((p) => p.type === 'Driver').map((p) => p.model).sort()).toEqual(['mid', 'tweeter', 'woofer']);
  });
});
