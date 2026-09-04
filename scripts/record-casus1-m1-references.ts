/**
 * M-1 — THE CLASS-A REFERENCES OF THE MERGED SET, AND THE RESPONSE-DEPENDENT
 * CLASS-B FIELDS OF THE THREE REFERENCE FILTERS, RECORDED FROM THE ENGINE.
 *
 * `npx vite-node scripts/record-casus1-m1-references.ts` — seconds, no tune.
 *
 * WHAT MOVES WHEN THE MEASUREMENT SET MOVES, and why this is a script and not a
 * hand edit. Every reference in `golden_refs_casus1.json` is a function of the
 * measurement set (class A) or of the set plus a netlist file (class B). M-1
 * replaces three files of that set, so every reference that reads the woofer
 * or the mid below the splice — the validity floors, the crossover windows,
 * the anchored gaps, the woofer→mid phase, the lobing fractions at the
 * crossings, the F3 window/RMS on the judged band — moves. Typing thirty
 * numbers by hand is thirty chances to transcribe one wrong (F4d's argument for
 * `record-casus1-v2-references.ts`), so they are computed here, by the same
 * assembly the tests run, and written down together with the BRIDGE: what the
 * same reference reads on the GATED set, so a reader can tell a redefinition
 * from a regression (V15's form).
 *
 * The live and dated corpora's blocks are NOT written here: that is the
 * recorder's job, after the regeneration.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1TargetCurve,
  casus1TargetCurveAt,
  loadGolden,
  type Casus1MeasurementSet,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { crossoverWindow } from '../src/lib/engine2/predesign/xoWindow.ts';
import { FLAT_TARGET, describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import { XO_FS_FACTOR_BY_ORDER } from '../src/lib/engine2/constants.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');

const golden = loadGolden();
const geometry = casus1Geometry(golden);
/** The plateau depth the case book carried from V45 to V51b — the bridge's voicing. */
const PLATEAU_TOT_M1_DB = (golden.manifest_en_geometrie as unknown as {
  gestelde_eisen: { _basplateau_2_5_tot_M1: { basplateau_offset_dB: number } };
}).gestelde_eisen._basplateau_2_5_tot_M1.basplateau_offset_dB;

const bank = (set: Casus1MeasurementSet) => {
  const manifest = casus1Manifest(golden, set);
  const files = casus1Files(manifest);
  const base: ReportSettings = {
    amplifierPowerW: 100,
    verticalWindowDeg: [-15, 15],
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    diMatchToleranceDb: 2,
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    ...casus1ExcursionSettings(golden),
  };
  const report = (key: string, settings: Partial<ReportSettings> = {}): EngineV2Report =>
    buildReport({ manifest, files, filter: casus1Filter(key, manifest, files, golden), geometry, settings: { ...base, ...settings } });
  return { manifest, files, report };
};
const merged = bank('merged');
const gated = bank('gated');
const CURVE = casus1TargetCurve(golden);
const CURVE_TOT_M1 = casus1TargetCurveAt(PLATEAU_TOT_M1_DB, golden);

const r1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(1)));
const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2)));
const r3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(3)));
const r0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(0)));

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, Record<string, unknown>>;
const M = merged.report('HUIDIG', { targetCurve: CURVE });
const G = gated.report('HUIDIG', { targetCurve: CURVE_TOT_M1 });
const driver = (r: EngineV2Report, name: string) => r.ingest.drivers.find((d) => d.driver === name)!;
const significant = (r: EngineV2Report, name: string) =>
  driver(r, name).breakups!.peaks.filter((p) => p.dB >= 2.5);

/* ---------------------------------------------------------------- *
 * 1. afgeleide_parameters — the merge floors and the breakup scans
 * ---------------------------------------------------------------- */
const ap = raw.afgeleide_parameters as Record<string, Record<string, unknown>>;
const merges = (raw.manifest_en_geometrie as { gemergde_set: { merge_parameters: Record<string, { geldig_van_Hz: number; status: string }> } }).gemergde_set.merge_parameters;

const wooferM = driver(M, 'woofer');
const w = ap.woofer;
/* The breakup the ceiling hangs on: the first significant one, as the window reads it. */
const firstBreakup = (r: EngineV2Report, name: string) => significant(r, name).sort((a, b) => a.fHz - b.fHz)[0];
const wbM = firstBreakup(M, 'woofer');
const wbG = firstBreakup(G, 'woofer');
w.FF_vloer_merge = r1(wooferM.onAxis!.bandHz[0]);
w.FF_vloer_merge_bron = 'merge-block';
w.FF_vloer_merge_toelichting =
  'M-1: de on-axis geldigheidsvloer van de woofer op de GEMERGEDE set, gelezen uit het mergeblok van ' +
  'Koan_W_up/down_merged_ingespeeld_mild.frd (Valid from = 20.5 Hz: eigen nabij veld plus 1/2 poort). ' +
  'FF_vloer_header (396,7 Hz) blijft staan als de vloer van de GEPOORTE set (casus1Manifest(golden, "gated")) ' +
  'en is daarmee de brug. PLACEHOLDER tot groundplane/hermeting na inspelen.';
w.breakup = { f: r0(wbM.fHz), dB: r2(wbM.dB), Q: r2(wbM.q ?? NaN) };
w._breakup_gepoort_tot_M1 = {
  _: 'Dezelfde piek op de GEPOORTE set (scanband 397-20000 Hz in plaats van 20,5-20000): de trend verschuift met de band (V8c), het getal met de trend. Brug, reproduceerbaar met set "gated".',
  f: r0(wbG.fHz),
  dB: r2(wbG.dB),
  Q: r2(wbG.q ?? NaN),
};

const midM = driver(M, 'mid');
const midG = driver(G, 'mid');
const m = ap.mid;
m.FF_vloer_merge = r1(midM.onAxis!.bandHz[0]);
m.FF_vloer_merge_bron = 'merge-block';
m.FF_vloer_merge_toelichting =
  'M-1: de on-axis geldigheidsvloer van de mid op de GEMERGEDE set, gelezen uit het mergeblok van ' +
  'Koan_M_merged.frd (Valid from = 60 Hz, gesteld uit de pod: f_c 88,8 Hz, -7 dB op de tweede-orde flank, ' +
  'raggedness van het nabije veld loopt eronder op). Op de gepoorte set is de vloer de header-gate van ' +
  'mid_hor_0.txt (396,7 Hz). PLACEHOLDER tot groundplane/hermeting.';
const peaks = (r: EngineV2Report) => significant(r, 'mid').map((p) => [r0(p.fHz), r2(p.dB)] as [number, number]);
const pers = (r: EngineV2Report) =>
  driver(r, 'mid').persistence
    .filter((p) => significant(r, 'mid').some((q) => Math.abs(q.fHz - p.fHz) < 1e-6))
    .map((p) => [r0(p.fHz), r2(p.offAxisDb)] as [number, number]);
m._breakups_gepoort_tot_M1 = {
  _: 'De breakups en hun 30-graden-persistentie op de GEPOORTE set (scanband 397-20000 Hz): de trend verschuift met de band (V8c). Brug, reproduceerbaar met set "gated".',
  breakups: m.breakups,
  persistentie_30gr: m.persistentie_30gr,
};
m.breakups = peaks(M);
m.persistentie_30gr = pers(M);
m.breakups_opmerking =
  String(m.breakups_opmerking) +
  ` SINDS M-1 gemeten op de gemergede set (scanband ${r1(midM.onAxis!.bandHz[0])}-20000 Hz): ` +
  `${(m.breakups as unknown[]).length} significante pieken; de gepoorte lezing staat in _breakups_gepoort_tot_M1.`;
void midG;

/* ---------------------------------------------------------------- *
 * 2. kruisvensters — per order on the merged set, with the gated bridge
 * ---------------------------------------------------------------- */
const kv = raw.kruisvensters as Record<string, Record<string, unknown>>;
/* A5e.3-veld — `kFsOnly` reproduces the window WITHOUT the drive floor: what
 * every window read from F4a to A5e.3 (k·f_s of the upper driver as the only
 * resonance floor). It is the BRIDGE of V15's form, so a reader can tell the
 * redefinition of the floor from a regression of the numbers. */
const windowAt = (r: EngineV2Report, lower: string, order: number, kFsOnly = false) =>
  crossoverWindow({
    ...r.predesign.windowInputs.find((wi) => wi.lower === lower)!,
    order,
    ...(kFsOnly ? { upperDriveCeilingDb: null } : {}),
  });
const floorName = (rule: string | undefined | null): string | null =>
  rule === 'validity' ? 'meetgeldigheid' : rule === 'fs' ? 'fs' : rule === 'drive' ? 'aandrijving_excursie' : (rule ?? null);
const winBlock = (r: EngineV2Report, lower: string, order: number, kFsOnly = false) => {
  const x = windowAt(r, lower, order, kFsOnly);
  return {
    venster: [r0(x.floorHz), r0(x.ceilingHz)] as [number | null, number | null],
    vloer_bindend: floorName(x.floorBy?.rule),
    plafond_bindend: x.ceilingBy?.rule === 'breakup' ? 'breakup_ernst' : (x.ceilingBy?.rule ?? null),
  };
};
const wm4 = winBlock(M, 'woofer', 4);
const wm2 = winBlock(M, 'woofer', 2);
const mt4 = winBlock(M, 'mid', 4);
const wm4g = winBlock(G, 'woofer', 4);
const mt4g = winBlock(G, 'mid', 4);
const wm4k = winBlock(M, 'woofer', 4, true);
const wm2k = winBlock(M, 'woofer', 2, true);
const mt4k = winBlock(M, 'mid', 4, true);
/* The drive floor's own numbers, for the parameters block: the mid's ceiling and the octaves it costs at order 4. */
const wmInput = M.predesign.windowInputs.find((wi) => wi.lower === 'woofer')!;
const mtInput = M.predesign.windowInputs.find((wi) => wi.lower === 'mid')!;
const driveFloor = windowAt(M, 'woofer', 4).limits.find((l) => l.rule === 'drive');
const driveFloorMt = windowAt(M, 'mid', 4).limits.find((l) => l.rule === 'drive');
kv.woofer_mid_orde4 = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  klasse_toelichting:
    'Een A5d.3-venster is PRE-design: het staat op meetgeldigheid, f_s, breakup-ernst, c-t-c en (sinds A5e.3-veld) ' +
    'het excursieplafond van de bovenliggende driver, en op geen enkel filter. Nagemeten: de drie kandidaatrapporten ' +
    'leveren identieke vensters. SINDS M-1 op de GEMERGEDE set: de woofer is geldig vanaf 20,5 Hz en de mid vanaf 60 Hz, ' +
    'dus de meetgeldigheidsvloer van 396,7 Hz valt weg. SINDS A5e.3-veld (04-09-2026) is de vloer de AANDRIJFVLOER: het ' +
    'laagste kruispunt waarop een filter van orde 4 de aandrijving van de mid op haar eigen resonantie onder het ' +
    'excursieplafond van M-C v2.0 houdt (A5d.3(ii) omgekeerd, doorlaatband op de ingang; kruisvensters.parameters.' +
    'aandrijfvloer). Die ligt boven k maal f_s (1,4 x 88,8 = 124 Hz), dat als brug _k_fs_tot_A5e3veld blijft staan. ' +
    'PLACEHOLDER tot groundplane.',
  ...wm4,
  _k_fs_tot_A5e3veld: {
    _:
      'Hetzelfde venster ZONDER de aandrijfvloer (de stand van M-1): de vloer is k maal f_s van de mid. Brug, ' +
      'reproduceerbaar met upperDriveCeilingDb: null. Waarom 124 Hz nooit een zinnige positie was: een LR4 op 124 Hz ' +
      'verzwakt de aandrijving van de mid op 88,8 Hz asymptotisch 24 x log2(124/88,8) = 11,6 dB tegen een plafond van ' +
      '17,7 dB - de mid kan daar M-C alleen halen met een pad op de ankerweg, en M-1 weigerde vier van de vijf ' +
      'kandidaten op die positie op M-C (mid).',
    ...wm4k,
  },
  _gepoort_tot_M1: {
    _: 'Hetzelfde venster op de GEPOORTE set (de stand van F4a tot V51b): de vloer was de header-gate van 396,7 Hz. Brug, reproduceerbaar met set "gated".',
    ...wm4g,
  },
};
kv.woofer_mid_orde2 = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  klasse_toelichting:
    'M-1: het W-M-venster bij ORDE 2 (LR2), dat op de gemergede set voor het eerst een eigen vloer heeft ' +
    `(k = ${XO_FS_FACTOR_BY_ORDER[2]} bij orde 2, A5d.3) in plaats van dezelfde meetgeldigheidsvloer als orde 4. ` +
    'Het M-1-veld liep op deze as over beide vensters (LR2 en LR4); sinds A5e.3-veld stelt de ontwerper orde 4 en ' +
    'is dit venster documentatie. SINDS A5e.3-veld met de aandrijfvloer: bij orde 2 kost dezelfde verzwakking twee keer ' +
    'zoveel octaven, dus de vloer ligt hoger dan bij orde 4 (k maal f_s als brug in _k_fs_tot_A5e3veld).',
  ...wm2,
  _k_fs_tot_A5e3veld: { _: 'Zonder de aandrijfvloer (de stand van M-1). Brug.', ...wm2k },
};
kv.mid_tweeter_orde4 = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  ...mt4,
  spanning: 'lobing-goed boven breakup-plafond',
  vloer_toelichting:
    'De aandrijfvloer van de tweeter (excursieplafond ' +
    `${r1(mtInput.upperDriveCeilingDb ?? NaN)} dB re ingang, ${r0(driveFloorMt?.hz ?? NaN)} Hz bij orde 4) ligt ONDER ` +
    'k maal f_s, dus hier bindt de conventie nog (A5e.3-veld: de M-T-as beweegt niet). Het GESTELDE tweetergetal ' +
    '(-20 dB, passband-relatief) wordt met opzet niet als vensterinvoer gelezen; zie kruisvensters.parameters.aandrijfvloer.',
  _k_fs_tot_A5e3veld: { _: 'Zonder de aandrijfvloer: identiek, want k maal f_s bindt. Brug.', ...mt4k },
  _gepoort_tot_M1: {
    _: 'Hetzelfde venster op de GEPOORTE set: de vloer is dezelfde (k x f_s van de tweeter), het plafond bewoog met de breakup-scan van de mid mee (de scanband begint op 60 in plaats van 397 Hz, de trend verschuift). Brug.',
    venster: mt4g.venster,
  },
};
/* The parameters block: the new floor rule beside the k·f_s convention (V15). */
(kv.parameters as Record<string, unknown>).aandrijfvloer = {
  _:
    'A5e.3-veld (04-09-2026) - DE AANDRIJFVLOER: A5d.3(ii) omgekeerd. Regel (ii) van de orde-afleiding deelt de ' +
    'verzwakking die M-C op de resonantie van de bovenliggende driver vraagt door de octaafafstand tot het kruispunt ' +
    'en antwoordt met een ORDE; bij een GEGEVEN orde antwoordt dezelfde regel met een frequentie: ' +
    'f_vloer = f_s x 2^(|plafond| / (6 dB/oct x orde)). Asymptotische helling, doorlaatband op de ingang (de ' +
    'niet-verzwakte weg - de strengste eerlijke lezing: een pad maakt de eis makkelijker en een vloer die een pad ' +
    'aanneemt neemt een ontwerp aan). k maal f_s blijft ernaast staan als conventie; de HOOGSTE vloer bindt.',
  invoer: 'het excursieplafond van M-C v2.0 per driver (V49): driverkaart + versterkerpiek + gemeten sweep, klasse A',
  invoer_niet: 'het GESTELDE M-C-getal (tweeter -20 dB): passband-relatief, een projectconventie en geen drivereigenschap; de orde-afleiding leest het al als eis op het referentiekruispunt',
  plafond_re_ingang_dB: { mid: r2(wmInput.upperDriveCeilingDb ?? NaN), tweeter: r2(mtInput.upperDriveCeilingDb ?? NaN) },
  octaven_bij_orde_4: { woofer_mid: r2(driveFloor ? Math.log2(driveFloor.hz / (wmInput.upperFsHz ?? NaN)) : NaN), mid_tweeter: r2(driveFloorMt ? Math.log2(driveFloorMt.hz / (mtInput.upperFsHz ?? NaN)) : NaN) },
  vloer_hz_bij_orde_4: { woofer_mid: r0(driveFloor?.hz ?? NaN), mid_tweeter: r0(driveFloorMt?.hz ?? NaN) },
  bindt: { woofer_mid: wm4.vloer_bindend, mid_tweeter: mt4.vloer_bindend },
  dB_per_octaaf_per_orde: 6,
  klasse: 'A',
  afhankelijkheid: 'meting',
};

/* ---------------------------------------------------------------- *
 * 3. verankerde_gaps_dB — flat plateau on the merged set, bridges on the gated
 * ---------------------------------------------------------------- */
const vg = raw.verankerde_gaps_dB as Record<string, unknown>;
const gapsOf = (r: EngineV2Report) => {
  const g = r.predesign.gaps!;
  return {
    anker: g.anchor,
    woofer_tov_mid: r3(g.ways.find((x) => x.driver === 'woofer')!.gapToAnchorDb),
    tweeter_tov_mid: r3(g.ways.find((x) => x.driver === 'tweeter')!.gapToAnchorDb),
  };
};
const gM = gapsOf(M);
const gMvoiced = gapsOf(merged.report('HUIDIG', { targetCurve: CURVE_TOT_M1 }));
const gGvoiced = gapsOf(G);
const gGflat = gapsOf(gated.report('HUIDIG', { targetCurve: FLAT_TARGET }));
const wooferLevel = M.predesign.gaps!.ways.find((x) => x.driver === 'woofer')!;
vg.anker = gM.anker;
vg.woofer_tov_mid = gM.woofer_tov_mid;
vg.tweeter_tov_mid = gM.tweeter_tov_mid;
const params = vg.parameters as Record<string, unknown>;
params.doelcurve = {
  _:
    'A5d.4(a) VIA A5e.2. SINDS M-1 IS DE DOELCURVE VLAK: Sander stelt het basplateau op 0,0 dB ' +
    '(gestelde_eisen.basplateau_offset_dB, 04-09-2026) - het filter ontwerpt op een vlak anechoisch plateau, ' +
    'de in-room vorm komt uit kamer en wandplaatsing. Een gestelde 0 is in de engine de vlakke referentie ' +
    '(casus1TargetCurve -> flat), dus de niveaus worden vergeleken ZOALS GEMETEN - wat bij een vlak plateau ' +
    'precies de bedoeling is. De V45-V51b-lezing met -2,5 dB staat als brug in _waarden_gepoort_tot_M1.',
  type: CURVE.type,
  plateau_diepte_dB: 0,
  plateau_herkomst: 'gestelde_eisen.basplateau_offset_dB = 0 - GESTELD (Sander, 04-09-2026, M-1)',
  beschrijving: describeTargetCurve(CURVE),
  verschuiving_per_weg_dB: { woofer: 0, mid: 0, tweeter: 0 },
  verschuiving_hoe: 'geen: een vlakke doelcurve verschuift geen enkele weg (het rapport noteert "compared AS MEASURED, against the flat reference").',
};
params.band_per_weg_M1 =
  `SINDS M-1 loopt de band van de laagste weg over haar HELE gemergede geldigheid: de woofer wordt gemiddeld over ` +
  `${r1(wooferLevel.gapToAnchorDb) !== null ? '' : ''}${r1(driver(M, 'woofer').onAxis!.bandHz[0])}-${r0(Math.sqrt(wm4.venster[0]! * wm4.venster[1]!))} Hz ` +
  `(20,5 Hz tot het meetkundig midden van het geopende W-M-venster) in plaats van over 397-466 Hz. Dit is de eerste keer dat X ` +
  `over de hele wooferband gemeten wordt.`;
vg._waarden_gepoort_tot_M1 = {
  _:
    'DE VORIGE WAARDEN VAN DIT BLOK (V45 t/m V51b), bewaard als BRUG (V15-vorm): dezelfde grootheid op de GEPOORTE ' +
    'set - met het toen gestelde plateau van -2,5 dB en zonder (flat). Reproduceerbaar met casus1Manifest(golden, ' +
    '"gated") en casus1TargetCurveAt(2.5). Het derde blok is de gemergede set MET dat oude plateau: de tegenproef ' +
    'dat een doelcurve de gaps nog steeds beweegt (V45), ook al stelt M-1 er geen.',
  gepoort_plateau_2_5: { ...gGvoiced, plateau_diepte_dB: PLATEAU_TOT_M1_DB },
  gepoort_flat: gGflat,
  gemergd_plateau_2_5: { ...gMvoiced, plateau_diepte_dB: PLATEAU_TOT_M1_DB },
};
vg.status =
  'GESLOTEN BIJ V45 (A5e.2); HERMETEN BIJ M-1 op de gemergede set met een VLAK plateau (gesteld 0 dB). Het ANKER, ' +
  'de haalbaarheidswaarschuwing EN de waarden zijn acceptatiecriteria en reproduceren alle drie; de brug naar de ' +
  'V45-V51b-lezing staat in _waarden_gepoort_tot_M1. Klasse A: alle drie de kandidaatrapporten leveren hetzelfde ' +
  'ankerblok. PLACEHOLDER tot groundplane/hermeting na inspelen (de wooferbestanden dragen een inspeel-predictie).';

/* ---------------------------------------------------------------- *
 * 4. the three reference filters — response-dependent class-B fields
 * ---------------------------------------------------------------- */
const kand = raw.kandidaten as Record<string, Record<string, unknown>>;
const f3 = kand._F3_respons_oordeel as Record<string, unknown>;
const others = f3.overige_kandidaten as Record<string, Record<string, unknown>>;
const RESPONSE_KEYS = [
  'wm_fase_oct', 'mt_fase_oct', 'wm_fase_oct_octaafgeknipt_V43', 'mt_fase_oct_octaafgeknipt_V43',
  'lobing_wm_dichtstbij_lambda', 'lobing_wm_zwaartepunt_lambda', 'lobing_wm_verste_lambda', 'lobing_wm_binnen_weg_lambda',
  'lobing_mt_lambda', 'lobing_mt_dichtstbij_lambda', 'lobing_mt_zwaartepunt_lambda', 'lobing_mt_verste_lambda',
  'V_tweeter_op_fs_dB', 'rms_vlakheid_dB', 'spl_venster_pm_dB',
];
for (const [key, refKey] of [['HUIDIG', 'HUIDIG_2e'], ['KAND_A', 'KAND_A_2e'], ['KAND_B', 'KAND_B_3e']] as const) {
  const block = kand[refKey];
  const r = merged.report(key, { targetCurve: CURVE });
  const pt = r.system.phaseTracking;
  const wm = pt.find((p) => p.lower === 'woofer')!;
  const mt = pt.find((p) => p.lower === 'mid')!;
  const lam = (lower: string, frac: string) =>
    r.metrics.lobingLambdas.find((x) => x.lower === lower)!.fractions.find((f) => f.key === frac)!.lambda;
  const before: Record<string, unknown> = {};
  for (const k of RESPONSE_KEYS) if (k in block) before[k] = block[k];
  const f3ref = others[refKey] ?? (refKey === 'KAND_B_3e' ? { rms_vlakheid_dB: block.rms_vlakheid_dB, spl_venster_pm_dB: block.spl_venster_pm_dB } : undefined);
  if (f3ref) before.rms_vlakheid_dB = f3ref.rms_vlakheid_dB, (before.spl_venster_pm_dB = f3ref.spl_venster_pm_dB);
  block._gepoort_tot_M1 = {
    _: 'De responsafhankelijke velden van dit blok op de GEPOORTE set (F1 t/m V51b). Brug, reproduceerbaar met set "gated". De elektrische velden (minZ, EPDR, dissipatie, Qes_mult, lf_bult) lezen de sweep en het nabije veld en bewegen niet.',
    ...before,
  };
  block.wm_fase_oct = r2(wm.meanAbsDeg);
  block.mt_fase_oct = r2(mt.meanAbsDeg);
  block.wm_fase_oct_octaafgeknipt_V43 = r2(wm.control.octaveClipped.meanAbsDeg);
  block.mt_fase_oct_octaafgeknipt_V43 = r2(mt.control.octaveClipped.meanAbsDeg);
  block.lobing_wm_dichtstbij_lambda = r3(lam('woofer', 'nearest'));
  block.lobing_wm_zwaartepunt_lambda = r3(lam('woofer', 'centroid'));
  block.lobing_wm_verste_lambda = r3(lam('woofer', 'farthest'));
  block.lobing_wm_binnen_weg_lambda = r2(lam('woofer', 'within-way'));
  block.lobing_mt_lambda = r2(lam('mid', 'nearest'));
  block.lobing_mt_dichtstbij_lambda = r3(lam('mid', 'nearest'));
  block.lobing_mt_zwaartepunt_lambda = r3(lam('mid', 'centroid'));
  block.lobing_mt_verste_lambda = r3(lam('mid', 'farthest'));
  block.V_tweeter_op_fs_dB = r2(r.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db);
  const resp = r.system.response!;
  if (refKey === 'KAND_B_3e') {
    block.rms_vlakheid_dB = r3(resp.rmsDeviationDb);
    block.spl_venster_pm_dB = r3(resp.windowPlusMinusDb);
  } else {
    others[refKey] = { rms_vlakheid_dB: r3(resp.rmsDeviationDb), spl_venster_pm_dB: r3(resp.windowPlusMinusDb) };
  }
  if (typeof block.klasse_toelichting === 'string' && !String(block.klasse_toelichting).includes('M-1')) {
    block.klasse_toelichting =
      String(block.klasse_toelichting) +
      ' SINDS M-1 gemeten op de GEMERGEDE set (woofers en mid NF/FF-gemerged, plateau vlak): de responsafhankelijke velden bewogen en staan met hun gepoorte lezing in _gepoort_tot_M1; PLACEHOLDER tot groundplane.';
  }
  console.log(`${refKey}: wm_fase ${block.wm_fase_oct} (was ${before.wm_fase_oct}), mt_fase ${block.mt_fase_oct} (was ${before.mt_fase_oct}), lobing wm nearest ${block.lobing_wm_dichtstbij_lambda} (was ${before.lobing_wm_dichtstbij_lambda}), V_tw ${block.V_tweeter_op_fs_dB} (was ${before.V_tweeter_op_fs_dB}), rms ${resp.rmsDeviationDb.toFixed(3)} window ${resp.windowPlusMinusDb.toFixed(3)} over ${r.system.splBandHz?.map((x) => x.toFixed(0)).join('-')}`);
}
f3.doelcurve = `${describeTargetCurve(CURVE)} (A5e.2) - de neutrale referentie; het basplateau is sinds M-1 op 0 dB gesteld`;
f3.band_hz = M.system.splBandHz!.map((x) => Number(x.toFixed(2)));
f3.band_herkomst =
  'de gezamenlijke geldige ver-veldband van alle drie de drivers (A5.5). SINDS M-1: de woofer en de mid zijn ' +
  'NF/FF-gemerged (geldig vanaf 20,5 resp. 60 Hz) maar de TWEETER draagt nog de 2,5 ms-gate, dus de ' +
  'gezamenlijke band van het RAPPORT begint nog steeds op 396,7 Hz; de ZOEKTOCHT en de shortlist oordelen op ' +
  'de afgeleide band vanaf f_p van de laagste weg (casus1V2.fixture.ts, CASUS1_V2_BAND_HZ).';

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log('woofer floor', w.FF_vloer_merge, 'breakup', JSON.stringify(w.breakup), 'was', JSON.stringify(w._breakup_gepoort_tot_M1));
console.log('mid floor', m.FF_vloer_merge, 'breakups', JSON.stringify(m.breakups), 'pers', JSON.stringify(m.persistentie_30gr));
console.log('W-M o4', JSON.stringify(wm4), 'o2', JSON.stringify(wm2), 'M-T', JSON.stringify(mt4), 'gated', JSON.stringify(wm4g), JSON.stringify(mt4g));
console.log('gaps merged flat', JSON.stringify(gM), 'merged plateau2.5', JSON.stringify(gMvoiced), 'gated plateau2.5', JSON.stringify(gGvoiced), 'gated flat', JSON.stringify(gGflat));
console.log('merges status', Object.values(merges).map((x) => x.status).join(' | '));
