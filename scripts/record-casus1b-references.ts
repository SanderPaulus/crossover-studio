/**
 * E-3 — THE RECORDER OF CASUS 1b (casus 1's mid and tweeter as a two-way).
 *
 * `npx vite-node scripts/record-casus1b-references.ts` — seconds, no tune.
 *
 * Writes into `test-fixtures/casus1b/golden_refs_casus1b.json`:
 *  - class A (`afhankelijkheid: meting`): the per-driver derived parameters
 *    (R_e with its hierarchy and fit quality, f_c/f_s, Z_max, r0, the sealed
 *    Qs of the mid, the breakup scan, the −6 dB@30° directivity point, the
 *    near-field ceiling, the far-field validity floor with its provenance,
 *    M-C v2.0's excursion figures), the one crossover window
 *    (`kruisvensters.mid_tweeter_orde4`) and the anchored gaps — each with its
 *    V15 parameter block, read off the engine and never typed.
 *  - class B (`meting+netlist`): the seventeen metrics of `HUIDIG_MT` and of
 *    every `KAND_V2_n` the manifest names — casus 1's `classBBlock`, verbatim
 *    in shape, so the two case books can be read side by side.
 *  - the pointer to the generator's provenance file (`v2_herkomst`).
 *
 * It PRUNES `kandidaten.KAND_V2_*` keys the manifest no longer names (a
 * shrunken shortlist leaves no orphan block) and never touches anything else
 * under `kandidaten`. Run it after `generate-casus1b-v2-candidates.ts`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  CASUS1B_DIR,
  CASUS1B_EXCURSION,
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BAND_SOURCE,
  CASUS1B_V2_GRID,
  GOLDEN1B_PATH,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  loadGolden1b,
} from '../src/lib/engine2/casus1b.fixture.ts';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';
import { describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import { XO_FS_FACTOR_BY_ORDER } from '../src/lib/engine2/constants.ts';

/** Casus 1's significance threshold for a breakup peak (dB above trend), the case-book convention. */
const BREAKUP_SIGNIFICANT_DB = 2.5;
const LIVE_KEY = /^KAND_V2_\d+$/;

const r0 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x));
const r1 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(1)));
const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(2)));
const r4 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

const raw = JSON.parse(readFileSync(GOLDEN1B_PATH, 'utf-8')) as Record<string, unknown> & {
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
  kruisvensters: Record<string, Record<string, unknown>>;
  kandidaten: Record<string, Record<string, unknown>>;
  manifest_en_geometrie: Record<string, unknown> & { netlists: Record<string, string> };
};
const golden = loadGolden1b();
const manifest = casus1bManifest(golden);
const files = casus1bFiles(manifest);
const bare = casus1bReport(null, manifest, files, golden);
const drv = (r: EngineV2Report, name: string) => {
  const d = r.ingest.drivers.find((x) => x.driver === name);
  if (!d) throw new Error(`casus 1b: no driver ${name} in the report`);
  return d;
};
const commit = execSync('git rev-parse HEAD', { cwd: join(CASUS1B_DIR, '..', '..') }).toString().trim();

/* ================================================================== *
 * 1. afgeleide_parameters — class A, per driver, with the parameter blocks
 * ================================================================== */
const ap = raw.afgeleide_parameters;
for (const name of ['mid', 'tweeter'] as const) {
  const d = drv(bare, name);
  const re = d.re;
  const z = d.impedance;
  const exc = bare.metrics.driveExcursion.find((x) => x.driver === name) ?? null;
  const dir30 = d.directivity.find((p) => Math.abs(p.angleDeg) === 30) ?? null;
  const block: Record<string, unknown> = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    klasse_toelichting:
      'Functies van de METINGEN alleen (impedantiesweep, on-axis, 30°, nabije veld, driverkaart): ' +
      'dezelfde waarde op HUIDIG_MT en op elke KAND_V2 — gerecordeerd op een rapport zónder netlist.',
    Re: re ? r2(re.ohm) : null,
    Re_herkomst: re?.sourceText ?? null,
    Re_direct: re ? r2(re.directOhm) : null,
    Re_motionele_rok_ohm: r2(re?.motionalSkirtOhm ?? null),
    Re_fit_residu: re?.fit ? r4(re.fit.relativeResidual) : null,
    Re_fit_bandgevoeligheid_ohm: re?.fit ? r4(re.fit.bandSensitivityOhm) : null,
    Re_fit_band_hz: re?.fit ? [r1(re.fit.bandHz[0]), r1(re.fit.bandHz[1])] : null,
    /* B-1 — WHICH model that R_e is the DC term of, and what the bare
     * second-order arm would have said instead. A reference that does not name
     * its model cannot be re-measured against a later engine. */
    Re_fit_model: re?.fit?.model ?? null,
    Re_fit_zonder_lekterm_ohm: re?.fit ? r4(re.fit.arms.secondOrder.reOhm) : null,
    Re_fit_residu_verhouding: re?.fit ? r4(re.fit.residualRatio) : null,
    Re_fit_exponent_geidentificeerd: re?.fit?.exponent.identified ?? null,
    Re_toelichting:
      'A5c.1-hiërarchie: ingevoerde DC-lezing > motionele fit > directe aflezing. Casus 1b voert ' +
      'niets in (casus 1 voert alleen het wooferpaar in, dat hier niet bestaat), dus mid en tweeter ' +
      'lezen de FIT — dezelfde R_e als casus 1 afgeleide_parameters.mid/tweeter, want dezelfde ' +
      'bestanden. fit_kwaliteit_pct is de tolerantieklasse van residu en bandgevoeligheid.',
    [name === 'mid' ? 'fc' : 'fs']: r1(z?.fundamentalHz ?? null),
    Zmax: r2(z?.sealed?.zMaxOhm ?? z?.motionalPeaks?.[0]?.ohm ?? null),
    r0: r2(z?.sealed?.r0 ?? null),
    ...(z?.sealed
      ? { Qmc: r2(z.sealed.qmc), Qec: r2(z.sealed.qec), Qtc: r2(z.sealed.qtc), kast: z.type }
      : { kast: z?.type ?? null }),
    semi_inductantie_n: d.semiInductance?.valid ? r2(d.semiInductance.n) : null,
    breakups: (d.breakups?.peaks ?? []).filter((p) => p.dB >= BREAKUP_SIGNIFICANT_DB).map((p) => [r0(p.fHz), r2(p.dB)]),
    breakup_scanband_hz: d.breakups ? [r1(d.breakups.bandHz[0]), r1(d.breakups.bandHz[1])] : null,
    breakup_rms_dB: r2(d.breakups?.rmsDb ?? null),
    dir_m3_30: r0(dir30?.minus3Hz ?? null),
    dir_m6_30: r0(dir30?.minus6Hz ?? null),
    NF_fmax: r0(d.nearFieldCeilingHz),
    FF_vloer: d.onAxis ? r1(d.onAxis.bandHz[0]) : null,
    FF_vloer_bron: d.onAxis?.bandFloorProvenance ?? null,
    FF_vloer_toelichting:
      name === 'mid'
        ? 'De gemergede mid (Koan_M_merged.frd, mergeblok Valid from = 60 Hz) — dezelfde vloer als casus 1 ' +
          'afgeleide_parameters.mid.FF_vloer_merge. Op de gepoorte set (casus1bManifest(golden, "gated")) is ' +
          'de vloer de header-gate van mid_hor_0.txt (396,7 Hz).'
        : 'De header-gate van tweeter_hor_0.txt (1/T uit Reference time en Right window) — dezelfde vloer als ' +
          'casus 1 afgeleide_parameters.tweeter (FF_vloer via ff_headers).',
    ...(exc
      ? {
          excursie_x_per_V_op_f0_mm_per_V: r4(exc.xPerVoltMmPerV),
          excursie_Q_ms: r2(exc.electromechanical?.qms ?? null),
          excursie_Z_max_op_f0_ohm: r2(exc.electromechanical?.zMaxOhm ?? null),
          excursie_toegestane_spanning_V: r2(exc.ceiling.allowedVolts),
          excursie_plafond_re_ingang_dB: r2(exc.ceiling.ceilingDbReInput),
          excursie_route_verhouding: 'off' in exc.acoustic ? null : r2(exc.acoustic.ratioToElectromechanical ?? null),
          excursie_toelichting:
            `M-C v2.0 (V49), route ${exc.route}: x/V op f0 = ${exc.f0Hz.toFixed(1)} Hz, klasse A. Het plafond is dB ` +
            't.o.v. de PIEKINGANGSSPANNING; de grens per netlist (plafond − doorlaatbandgemiddelde) leest de poort ' +
            'als de strengste van gesteld en afgeleid. Dezelfde getallen als casus 1 (dezelfde driverkaart, dezelfde ' +
            `sweep). ${'off' in exc.acoustic ? `Route 2: ${exc.acoustic.off}.` : 'Route 2 gemeten; zie de verhouding.'}`,
        }
      : { excursie_toelichting: 'M-C v2.0 staat UIT op deze weg: geen excursie-invoer.' }),
  };
  ap[name] = block;
}
ap._re_parameters = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  _: 'V15 — de parameters van de R_e-resolutie, afgelezen van het rapport. De fitband hangt aan f_p van de driver (ReEstimateOptions.fundamentalHz) en niet aan een getal.',
  hiërarchie: 'ingevoerde DC-lezing > motionele fit > directe aflezing (A5c.1)',
  ingevoerd_ohm: {},
  fit_band_hz: Object.fromEntries((['mid', 'tweeter'] as const).map((n) => [n, drv(bare, n).re?.fit ? drv(bare, n).re!.fit!.bandHz.map(r1) : null])),
  direct_punten: Object.fromEntries((['mid', 'tweeter'] as const).map((n) => [n, drv(bare, n).re?.pointsUsed ?? null])),
  bron_per_driver: Object.fromEntries((['mid', 'tweeter'] as const).map((n) => [n, drv(bare, n).re?.source ?? null])),
};
ap._spl_scan_parameters = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  _: 'V15 — de breakup-scan: trendbreedte in octaven en de scanband per driver (geknipt op meetgeldigheid, V8c), plus de significantiedrempel van het casusboek.',
  trendbreedte_oct: Object.fromEntries((['mid', 'tweeter'] as const).map((n) => [n, drv(bare, n).breakups?.octaveFraction ?? null])),
  scanband_hz: Object.fromEntries((['mid', 'tweeter'] as const).map((n) => [n, drv(bare, n).breakups ? drv(bare, n).breakups!.bandHz.map(r1) : null])),
  significant_vanaf_dB: BREAKUP_SIGNIFICANT_DB,
  schatter: drv(bare, 'mid').breakups?.estimator ?? null,
  directiviteit_hoek_graden: 30,
};
{
  const exc = bare.metrics.driveExcursion;
  ap._excursie_parameters = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    _: 'V15 — de invoer waarop M-C v2.0\'s klasse-A-waarden staan (V49): driverkaart (Bl, M_ms, X_max, parallel), de versterkerpiek en de marge, zoals casus 1 ze stelt (gestelde_eisen, driverkaart) en casus 1b overneemt.',
    formule:
      'x/V = Bl·Q_ms/(Z_max·N·M_ms·ω0²) [route 1]; V_toegestaan = X_max·marge/(x/V); plafond = 20·log10(V_toegestaan/V_piek) ' +
      'met V_piek = √(2·P·R_nom); afgeleide M-C-grens per netlist = plafond − doorlaatband-gemiddelde |H| (F1-conventie)',
    versterker_piekvermogen_W: CASUS1B_EXCURSION.amplifierPeakPowerW ?? null,
    versterker_nominale_last_ohm: CASUS1B_EXCURSION.amplifierNominalLoadOhm ?? null,
    V_piek_V: exc[0] ? r2(exc[0].peakInputVolts) : null,
    xmax_marge: CASUS1B_EXCURSION.xmaxMarginFraction ?? null,
    Q_ms_bron: Object.fromEntries(exc.map((x) => [x.driver, x.electromechanical?.qmsSource ?? null])),
    R_e_lezing: 'de motionele FIT op beide wegen (casus 1b voert geen DC-lezing in; casus 1 doet dat alleen voor het wooferpaar).',
    route_2: exc[0] && 'off' in exc[0].acoustic ? exc[0].acoustic.off : 'gemeten',
  };
}

/* ================================================================== *
 * 2. kruisvensters.mid_tweeter_orde4 — class A, the one pair
 * ================================================================== */
{
  const w = bare.predesign.windows.find((x) => x.lower === 'mid' && x.upper === 'tweeter');
  const wi = bare.predesign.windowInputs[bare.predesign.windows.indexOf(w!)];
  if (!w) throw new Error('casus 1b: no mid→tweeter window in the report');
  const field = casus1bField(bare);
  const axis = field.field.axes[0];
  raw.kruisvensters.mid_tweeter_orde4 = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    venster: [r1(w.floorHz), r1(w.ceilingHz)],
    vloer_bindend: w.floorBy?.rule ?? null,
    plafond_bindend: w.ceilingBy?.rule ?? null,
    grenzen: w.limits.map((l) => ({ kant: l.side, hz: r1(l.hz), regel: l.rule, bron: l.source })),
    zones: w.zones.map((z) => ({ ...z, hz: [r1(z.hz[0]), r1(z.hz[1])] })),
    spanningen: w.tensions,
    leeg: w.empty,
    f_s_tweeter_hz: r1(w.upperFsHz),
    k_fs_hz: w.upperFsHz !== null ? r1(w.upperFsHz * (XO_FS_FACTOR_BY_ORDER[w.order] ?? NaN)) : null,
    excursievloer_hz: wi?.upperDriveCeilingDb != null && w.upperFsHz !== null ? r1(w.upperFsHz * 2 ** (Math.abs(wi.upperDriveCeilingDb) / (6 * w.order))) : null,
    ctc_mm: r1(w.spacingMm),
    ctc_bron: w.spacingSource,
    veld_verkenning: {
      _: 'E-2/E-3 — het A5d-veld in de VERKENNINGSMODUS (budget 8, centre-first, één uitlijning per overname), op dit venster.',
      posities_hz: axis.positionsByOrder.flatMap((p) => p.hz.map(r1)),
      orden: axis.orders,
      bibliotheek: CASUS1B_FIELD_ALIGNMENTS.map((a) => `${a.kind}${a.order}`),
      afgeleid: field.field.parameters.derivedSize,
      budget: field.field.parameters.chainBudget,
      kandidaten: field.field.candidates.length,
      referentie_kruispunt_hz: r1(field.referenceCrossingHz[0]),
      orde_afleiding: field.orders[0]?.why ?? null,
    },
    klasse_toelichting:
      'Hetzelfde venster als casus 1 kruisvensters.mid_tweeter_orde4 en dat is de eerste MEETING van E-3: het ' +
      'venster is een functie van de metingen, de gestelde orde, het gestelde tweetergetal en de c-t-c, en casus 1b ' +
      'deelt alle vier met casus 1. De vloer bindt op het gestelde tweetergetal (drive-stated, A5e.3b), het plafond ' +
      'op de breakup-ernst van de mid. Dat de woofer er niet is verandert niets aan dit paar.',
  };
}

/* ================================================================== *
 * 3. verankerde_gaps_dB — class A
 * ================================================================== */
{
  const g = bare.predesign.gaps;
  raw.verankerde_gaps_dB = g
    ? {
        klasse: 'A',
        afhankelijkheid: 'meting',
        anker: g.anchor,
        anker_reden: g.anchorReason,
        ...Object.fromEntries(g.ways.map((w) => [`${w.driver}_tov_${g.anchor}`, r3(w.gapToAnchorDb)])),
        budgetten: Object.fromEntries(g.ways.map((w) => [w.driver, r3(w.budgetDb)])),
        anker_wissel_waarschuwing: g.anchorSwitchWarning,
        notities: g.notes,
        doelcurve: describeTargetCurve(CASUS1B_TARGET_CURVE),
        klasse_toelichting:
          'Anker en gap zijn functies van de gemeten niveaus en het A5d.3-venster, niet van een filter (casus 1\'s ' +
          'V45/M-1-regel). Op casus 1b zijn er twee wegen: de mid is de LAAGSTE weg en het anker tegelijk (X = 0, ' +
          'dus geen niveauwerk op de laagste weg te verbieden — de reden dat casus 1\'s woofer-eisen hier niet ' +
          'overgenomen zijn), en de tweeter draagt het ene gap. Plateau 0: de vlakke referentie.',
        parameters: {
          _: 'V15 — energie-gemiddelde per wegband; de band van de mid loopt van haar geldigheidsvloer tot het venstercentrum, die van de tweeter van het venstercentrum tot haar plafond.',
          overname_hz: r1(bare.predesign.windows[0]?.floorHz && bare.predesign.windows[0]?.ceilingHz ? Math.sqrt(bare.predesign.windows[0].floorHz * bare.predesign.windows[0].ceilingHz) : null),
        },
      }
    : {
        klasse: 'A',
        afhankelijkheid: 'meting',
        geblokkeerd: bare.predesign.gapsBlocked,
        klasse_toelichting: 'GEBLOKKEERD (UI-1): een niveau rust op een onbekende vensterband; zie geblokkeerd.',
      };
}
function r3(x: number | null | undefined) {
  return x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(3));
}

/* ================================================================== *
 * 4. kandidaten — class B, casus 1's block shape
 * ================================================================== */
const classBBlock = (key: string, toelichting: string): Record<string, unknown> => {
  const rep = casus1bReport(key, manifest, files, golden);
  const pt = rep.system.phaseTracking;
  const mt = pt.find((p) => p.lower === 'mid' && p.upper === 'tweeter');
  return {
    klasse: 'B',
    afhankelijkheid: 'meting+netlist',
    klasse_toelichting: toelichting,
    minZ: r2(rep.metrics.epdr?.minZOhm),
    minZ_bij_hz: r1(rep.metrics.epdr?.minZAtHz ?? null),
    minEPDR: r2(rep.metrics.epdr?.minOhm),
    dissipatie_pct: r0((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    grootste_R_W_bij_100W: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
    Qes_mult: r2(rep.metrics.thevenin.find((t) => t.qMultiplier !== null)?.qMultiplier ?? null),
    lf_bult_extra_dB: r2(rep.metrics.lfBump[0]?.result.extraDb ?? null),
    lf_lift_dB: r2(rep.metrics.lfBump[0]?.result.liftDb ?? null),
    lf_opslingering_dB: r2(rep.metrics.lfBump[0]?.result.resonantDb ?? null),
    V_tweeter_op_fs_dB: r2(rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db ?? null),
    V_mid_op_fs_dB: r2(rep.metrics.driveVoltage.find((d) => d.driver === 'mid')?.db ?? null),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    mt_fase_oct: r2(mt?.meanAbsDeg ?? null),
    mt_fase_kruispunt_hz: r1(mt?.crossingHz ?? null),
    mt_fase_oct_octaafgeknipt_V43: r2(mt?.control.octaveClipped.meanAbsDeg ?? null),
    mt_fase_overlapvenster_V43: r2(mt?.control.overlapWindow.meanAbsDeg ?? null),
    poorten: rep.gates.verdicts.filter((v) => v.active).map((v) => ({ poort: v.gate, onderwerp: v.subject, waarde: r3(v.value), grens: v.limit, geslaagd: v.pass })),
  };
};
const netlists = raw.manifest_en_geometrie.netlists;
/* Sync the live corpus into the manifest from the files on disk, in file order. */
for (const k of Object.keys(netlists)) if (LIVE_KEY.test(k)) delete netlists[k];
const liveFiles = readdirSync(CASUS1B_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
for (const f of liveFiles) netlists[f.replace(/^KAND-V2-(\d+)\.adsfilter\.json$/, 'KAND_V2_$1')] = f;
for (const k of Object.keys(raw.kandidaten)) if (LIVE_KEY.test(k) && !(k in netlists)) delete raw.kandidaten[k];
/* The report builder reads the netlist map from the loaded golden, so it has to see the synced one. */
golden.manifest_en_geometrie.netlists = { ...netlists };
for (const key of Object.keys(netlists)) {
  raw.kandidaten[key] = classBBlock(
    key,
    key === 'HUIDIG_MT'
      ? 'Metrieken op de VASTE netlist manifest_en_geometrie.netlists.HUIDIG_MT — casus 1\'s HUIDIG met het wooferpad ' +
        'weggelaten (scripts/derive-casus1b-huidig-mt.ts): de mid- en tweetertak van het referentiefilter van 22-08-2026, ' +
        'ongewijzigd, als tweeweg. Referentiefilter en geen kandidaat: het is nooit getuned op deze configuratie.'
      : `Metrieken op de VASTE netlist manifest_en_geometrie.netlists.${key}, een BESTAND in test-fixtures/casus1b/. ` +
        'Het netwerk komt uit een v2-tweewegrun (zie manifest_en_geometrie.v2_herkomst), maar de referentie hangt aan het ' +
        'bestand en niet aan die run — daarom klasse B en geen klasse C.',
  );
}
raw.kandidaten._parameters = {
  klasse: 'B',
  afhankelijkheid: 'meting+netlist',
  _: 'V15 — waarop de klasse-B-blokken gemeten zijn: casus1bReport (CASUS1B_REPORT_SETTINGS: gestelde orde, doelcurve, excursie, bouwbaarheid, DCR-families, tweetergetal), het rapportraster (de poortsweep) en het versterkervermogen van casus 1.',
  doelcurve: describeTargetCurve(CASUS1B_TARGET_CURVE),
  fasemaat: 'M-K (V44): gemiddelde |Δφ| over de TOEGELATEN punten (geldigheid, stilte, niveau); de twee V43-controlekolommen ernaast',
  dissipatie_bij_W: (raw.manifest_en_geometrie.gestelde_eisen as { versterker_continu_W?: number | null }).versterker_continu_W ?? null,
};

/* ================================================================== *
 * 5. the pointer to the generator's provenance
 * ================================================================== */
const herkomstPath = join(CASUS1B_DIR, '..', 'casus1b_v2_herkomst.json');
if (existsSync(herkomstPath)) {
  const h = JSON.parse(readFileSync(herkomstPath, 'utf-8')) as { gegenereerd_op_commit: string; run_vingerafdruk: string; shortlist: unknown; veld: unknown; opgenomen_op: unknown; kandidaat_uitkomst: { label: string; geleverd: boolean; looptijd_s: number }[] };
  raw.manifest_en_geometrie.v2_herkomst = {
    _: 'De v2-tweewegrun waaruit de KAND-V2-bestanden komen: test-fixtures/casus1b_v2_herkomst.json (scripts/generate-casus1b-v2-candidates.ts). DOCUMENTATIE — de acceptatie zit in kandidaten.KAND_V2_*.',
    bestand: 'test-fixtures/casus1b_v2_herkomst.json',
    gegenereerd_op_commit: h.gegenereerd_op_commit,
    run_vingerafdruk: h.run_vingerafdruk,
    opgenomen_op: h.opgenomen_op,
    shortlist: h.shortlist,
    uitkomsten: h.kandidaat_uitkomst.map((o) => ({ label: o.label, geleverd: o.geleverd, looptijd_s: o.looptijd_s })),
    veld: h.veld,
  };
} else {
  raw.manifest_en_geometrie.v2_herkomst = { _: 'NOG NIET GEGENEREERD: draai scripts/generate-casus1b-v2-candidates.ts.' };
}
raw.manifest_en_geometrie.v2_route = {
  _: 'E-3 — de tweewegroute door de v2-worker: handleV2Request kind v2ChainOne → runDesignChain onder de hook. Raster en oordeelband afgeleid zoals casus 1 (M-1-regel).',
  raster: { van_hz: r1(CASUS1B_V2_GRID[0]), tot_hz: r1(CASUS1B_V2_GRID[CASUS1B_V2_GRID.length - 1]), punten: CASUS1B_V2_GRID.length },
  oordeelband_hz: CASUS1B_V2_BAND_HZ.map(r1),
  oordeelband_bron: CASUS1B_V2_BAND_SOURCE,
  gestelde_orde: CASUS1B_STATED_ORDER,
  gerecordeerd_op_commit: commit,
};

writeFileSync(GOLDEN1B_PATH, `${JSON.stringify(raw, null, 1)}\n`, 'utf-8');
console.log(`wrote ${GOLDEN1B_PATH}`);
console.log('mid:', JSON.stringify({ Re: ap.mid.Re, fc: ap.mid.fc, Zmax: ap.mid.Zmax, Qtc: ap.mid.Qtc, breakups: ap.mid.breakups, dir_m6_30: ap.mid.dir_m6_30, FF_vloer: ap.mid.FF_vloer, plafond: ap.mid.excursie_plafond_re_ingang_dB }));
console.log('tweeter:', JSON.stringify({ Re: ap.tweeter.Re, fs: ap.tweeter.fs, Zmax: ap.tweeter.Zmax, breakups: ap.tweeter.breakups, FF_vloer: ap.tweeter.FF_vloer, plafond: ap.tweeter.excursie_plafond_re_ingang_dB }));
console.log('window:', JSON.stringify(raw.kruisvensters.mid_tweeter_orde4.venster), raw.kruisvensters.mid_tweeter_orde4.vloer_bindend, raw.kruisvensters.mid_tweeter_orde4.plafond_bindend);
console.log('gaps:', JSON.stringify(raw.verankerde_gaps_dB.anker), JSON.stringify(raw.verankerde_gaps_dB.budgetten));
for (const k of Object.keys(netlists)) {
  const b = raw.kandidaten[k];
  console.log(`${k}: minZ ${b.minZ} EPDR ${b.minEPDR} diss ${b.dissipatie_pct}% rms ${b.rms_vlakheid_dB} win ±${b.spl_venster_pm_dB} M-K ${b.mt_fase_oct}° tweeter ${b.V_tweeter_op_fs_dB} mid ${b.V_mid_op_fs_dB}`);
}
