import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_DIR,
  CASUS1H_QES_MULTIPLIER_MAX,
  CASUS1H_SET,
  CASUS1H_STATED_ORDER,
  CASUS1H_V2_BUDGETS,
  PASSIVE_LOWEST_WAY,
  casus1hActiveAt,
  casus1hFiles,
  casus1hManifest,
  casus1hReport,
  casus1hSettingsAt,
  loadGolden1h,
} from './casus1h.fixture.ts';
import { casus1Manifest, loadGolden } from './casus1.fixture.ts';

const golden = loadGolden1h();
const tol = golden.toleranties;
const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const bare = casus1hReport(null, manifest, files, golden);
const netlists = golden.manifest_en_geometrie.netlists;
const LIVE = Object.keys(netlists).filter((k) => /^H_KAND_\d+$/.test(k));
const handoverOf = (key: string): number => {
  const hz = (golden.kandidaten[key] as { actieve_overname_hz?: number } | undefined)?.actieve_overname_hz;
  if (hz === undefined) throw new Error(`casus 1h: ${key} has no recorded active handover`);
  return hz;
};
const withinPct = (a: number, b: number, pct: number) => Math.abs(a - b) <= Math.abs(b) * (pct / 100);
/** The ohm class is ABSOLUTE (0.03 Ω), not a percentage — the reference file says so. */
const withinAbs = (a: number, b: number, abs: number) => Math.abs(a - b) <= abs;

describe('casus 1h — the acceptance authority of the hybrid', () => {
  it('reads casus 1\'s own files at the stated set, and says which set that is', () => {
    /* The measurement files are casus 1's, through casus 1's own manifest: a
     * copy of a measurement is a second file that can drift (I-2). */
    expect(CASUS1H_SET).toBe('koan677');
    expect(manifest.sessionId).toBe(casus1Manifest(loadGolden(), 'koan677').sessionId);
    expect(manifest.entries.map((e) => e.file).sort()).toEqual(
      casus1Manifest(loadGolden(), 'koan677').entries.map((e) => e.file).sort(),
    );
    /* And it deliberately is NOT the current standard — the comparison it exists
     * for runs against a corpus raised on this set. */
    expect(CASUS1H_SET).not.toBe('m3');
    expect(String(golden.manifest_en_geometrie.meetset_niet_m3)).toMatch(/m3/);
  });

  it('the stated active handover is read from the manifest and carries its attribution', () => {
    expect(CASUS1H_ACTIVE.activeWay).toBe('woofer');
    expect(CASUS1H_ACTIVE.passiveWay).toBe('mid');
    expect(CASUS1H_ACTIVE.kind).toBe('LR');
    expect(CASUS1H_ACTIVE.order).toBe(CASUS1H_STATED_ORDER);
    expect(CASUS1H_ACTIVE.statedBy).toMatch(/Sander Somers, 17-09-2026/);
    expect(CASUS1H_ACTIVE.positionsHz.length).toBeGreaterThanOrEqual(2);
    /* 362.3 Hz is in the list for a reason the manifest states: it is the
     * woofer→mid crossing of a FULL-PASSIVE candidate, so the two routes can be
     * laid on the same handover. */
    expect(CASUS1H_ACTIVE.positionsHz).toContain(362.3);
  });

  it('class A reproduces on a report WITHOUT a netlist, and on every frozen one', () => {
    /* The definition of class A as an assert: a quantity that is a function of
     * the measurements alone is the same number whatever netlist is loaded. */
    const ap = golden.afgeleide_parameters;
    for (const way of ['woofer', 'mid', 'tweeter'] as const) {
      const recorded = ap[way] as Record<string, number | null>;
      const fresh = (key: string | null) => {
        const rep = key === null ? bare : casus1hReport(key, manifest, files, golden, casus1hSettingsAt(handoverOf(key)));
        const d = rep.ingest.drivers.find((x) => x.driver === way)!;
        return { re: d.re?.ohm ?? null, ff: d.onAxis?.bandHz[0] ?? null, fund: d.impedance?.fundamentalHz ?? null };
      };
      const base = fresh(null);
      expect(base.re, `${way}: R_e`).not.toBeNull();
      expect(withinAbs(base.re!, recorded.Re!, tol.ohm), `${way}: R_e ${base.re} against ${recorded.Re}`).toBe(true);
      for (const key of LIVE) {
        const f = fresh(key);
        expect(f.re, `${way} on ${key}`).toBeCloseTo(base.re!, 9);
        expect(f.ff, `${way} on ${key}`).toBeCloseTo(base.ff!, 9);
        expect(f.fund, `${way} on ${key}`).toBeCloseTo(base.fund!, 9);
      }
    }
  });

  it('the ACTIVE way is in the report and in no netlist — that is what makes it active', () => {
    expect(bare.driversLowToHigh[0]).toBe(ACTIVE_WAY);
    for (const key of LIVE) {
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(handoverOf(key)));
      /* Its measurement is there (it feeds the model) and its BRANCH of the
       * circuit is not (the main amplifier does not drive it). */
      expect(rep.ingest.drivers.some((d) => d.driver === ACTIVE_WAY)).toBe(true);
      expect(rep.metrics.thermalLoad.some((t) => t.driver === ACTIVE_WAY), `${key}: the active way is in a thermal row`).toBe(false);
      expect(rep.metrics.buildability, `${key}`).not.toBeNull();
    }
  });

  it('both crossover windows are recorded, and the passive one is casus 1\'s own', () => {
    const wm = golden.kruisvensters[`${ACTIVE_WAY}_${PASSIVE_LOWEST_WAY}_orde${CASUS1H_STATED_ORDER}`] as { venster: [number, number]; vloer_bindend: string };
    const mt = golden.kruisvensters[`${PASSIVE_LOWEST_WAY}_tweeter_orde${CASUS1H_STATED_ORDER}`] as { venster: [number, number]; vloer_bindend: string };
    expect(wm).toBeDefined();
    expect(mt).toBeDefined();
    const fresh = (lower: string, upper: string) => bare.predesign.windows.find((w) => w.lower === lower && w.upper === upper)!;
    const fwm = fresh(ACTIVE_WAY, PASSIVE_LOWEST_WAY);
    const fmt = fresh(PASSIVE_LOWEST_WAY, 'tweeter');
    expect(withinPct(fwm.floorHz!, wm.venster[0], tol.frequenties_pct)).toBe(true);
    expect(withinPct(fwm.ceilingHz!, wm.venster[1], tol.frequenties_pct)).toBe(true);
    expect(withinPct(fmt.floorHz!, mt.venster[0], tol.frequenties_pct)).toBe(true);
    expect(withinPct(fmt.ceilingHz!, mt.venster[1], tol.frequenties_pct)).toBe(true);
    /* The floor of the passive pair is the BlieSMa sheet's recommended minimum
     * (U-3g/M-2b), exactly as on casus 1 and casus 1b — the window is a property
     * of the two drivers and not of where the woofer hands over. */
    expect(fmt.floorBy?.rule).toBe('stated-min');
  });

  it('every stated position lies inside the derived window of the active handover', () => {
    const w = bare.predesign.windows.find((x) => x.lower === ACTIVE_WAY && x.upper === PASSIVE_LOWEST_WAY)!;
    for (const hz of CASUS1H_ACTIVE.positionsHz) {
      expect(hz >= w.floorHz! && hz <= w.ceilingHz!, `${hz} Hz outside ${w.floorHz}-${w.ceilingHz}`).toBe(true);
    }
  });

  it('the active side\'s derived settings reproduce, per stated position', () => {
    const rec = golden.afgeleide_parameters.actieve_zijde_afgeleid as {
      per_overname: { hz: number; gain_dB: number; delay_ms: number; omgekeerd: boolean; nul_marge_dB: number }[];
    };
    expect(rec.per_overname.map((p) => p.hz)).toEqual(CASUS1H_ACTIVE.positionsHz);
    for (const p of rec.per_overname) {
      const a = casus1hActiveAt(p.hz, manifest, files);
      expect(a.settings.gainDb, `${p.hz} Hz gain`).toBeCloseTo(p.gain_dB, 3);
      expect(a.settings.delayMs, `${p.hz} Hz delay`).toBeCloseTo(p.delay_ms, 4);
      expect(a.settings.inverted, `${p.hz} Hz polarity`).toBe(p.omgekeerd);
      expect(a.report.activeSide!.nullMarginDb!, `${p.hz} Hz null margin`).toBeCloseTo(p.nul_marge_dB, 2);
    }
  });

  it('class B reproduces on every frozen netlist', () => {
    expect(LIVE.length, 'no frozen casus-1h netlists — run the generator').toBeGreaterThan(0);
    for (const key of LIVE) {
      const hz = handoverOf(key);
      const rec = golden.kandidaten[key] as Record<string, number | null>;
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(hz));
      expect(rep.metrics.epdr!.minZOhm, `${key}: min |Z|`).toBeCloseTo(rec.minZ!, 2);
      expect(rep.system.response!.rmsDeviationDb, `${key}: RMS`).toBeCloseTo(rec.rms_vlakheid_dB!, 2);
      expect(rep.system.response!.windowPlusMinusDb, `${key}: window`).toBeCloseTo(rec.spl_venster_pm_dB!, 2);
      const mt = rep.system.phaseTracking.find((p) => p.lower === PASSIVE_LOWEST_WAY && p.upper === 'tweeter')!;
      expect(mt.meanAbsDeg, `${key}: M-K mid|tweeter`).toBeCloseTo(rec.mt_fase_oct!, 2);
      const wm = rep.system.phaseTracking.find((p) => p.lower === ACTIVE_WAY && p.upper === PASSIVE_LOWEST_WAY)!;
      expect(wm.meanAbsDeg, `${key}: M-K woofer|mid`).toBeCloseTo(rec.wm_fase_oct!, 2);
    }
  });

  it('every frozen netlist carries the stated high-pass on the lowest PASSIVE way', () => {
    /* THE THING H-1 EXISTS TO PRODUCE, asserted on the files rather than on a
     * run: the mid is high-pass protected on every one of them. */
    for (const key of LIVE) {
      const rep = casus1hReport(key, manifest, files, golden, casus1hSettingsAt(handoverOf(key)));
      expect(rep.gates.highPassProtected, `${key}`).toContain(PASSIVE_LOWEST_WAY);
    }
  });

  it('manifest, disk and provenance agree about the corpus', () => {
    const onDisk = readdirSync(CASUS1H_DIR).filter((f) => /^H-KAND-\d+\.adsfilter\.json$/.test(f)).sort();
    const named = LIVE.map((k) => netlists[k]).sort();
    expect(named).toEqual(onDisk);
    const hp = join(CASUS1H_DIR, '..', 'casus1h_v2_herkomst.json');
    expect(existsSync(hp), 'no provenance file — run the generator').toBe(true);
    const h = JSON.parse(readFileSync(hp, 'utf-8')) as { bestanden: { name: string }[]; shortlist: { bevroren: number } };
    expect(h.bestanden.map((b) => `${b.name}.adsfilter.json`).sort()).toEqual(onDisk);
    expect(h.shortlist.bevroren).toBe(onDisk.length);
  });

  it('the requirements casus 1h does NOT carry are named, with their reason', () => {
    const niet = (golden.manifest_en_geometrie.gestelde_eisen as { niet_overgenomen: Record<string, unknown> }).niet_overgenomen;
    for (const k of ['lf_opslingering_budget_dB', 'geen_niveauwerk_op_laagste_weg', 'max_serie_R_laagste_weg_ohm']) {
      expect(typeof niet[k], `${k} is not named as not-carried`).toBe('string');
      expect(String(niet[k]).length, `${k}: the reason is too short to be one`).toBeGreaterThan(60);
    }
    /* M-D is not armed, and Q_es IS — the one place casus 1h departs from
     * casus 1b, and the manifest carries the argument for it. */
    expect(CASUS1H_V2_BUDGETS.lfBumpBudgetDb).toBeUndefined();
    expect(CASUS1H_V2_BUDGETS.qesMultiplierMax).toBe(CASUS1H_QES_MULTIPLIER_MAX);
    expect(CASUS1H_QES_MULTIPLIER_MAX).not.toBeNull();
    const ge = golden.manifest_en_geometrie.gestelde_eisen as Record<string, unknown>;
    expect(String(ge.qes_vermenigvuldiging_max_afwijking_van_casus_1b)).toMatch(/casus 1b/);
  });
});
