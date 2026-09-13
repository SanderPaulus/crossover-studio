/**
 * M-2b — DE KLASSE-A-REFERENTIES VAN DE 67,7 L-SET, GEREGISTREERD UIT DE ENGINE.
 *
 * `npx vite-node scripts/record-casus1-m2b-references.ts` — seconden, geen tune.
 *
 * WAT ER BEWEEGT ALS DE MEETSET BEWEEGT, en waarom dit een script is en geen
 * handmatige bewerking: dezelfde redenering als `record-casus1-m1-references.ts`
 * een sessie eerder. M-2b vervangt de WOOFERHELFT van de set — de twee on-axis
 * merges, hun nabije velden en de parallelle sweep — dus élke referentie die de
 * woofer leest beweegt, en dertig getallen overtypen is dertig kansen om er een
 * verkeerd over te nemen. Zij worden hier berekend, door dezelfde assemblage
 * die de tests draaien, en opgeschreven MET DE BRUG: wat dezelfde referentie op
 * de M-1-set leest, zodat een lezer een herdefinitie van een regressie kan
 * onderscheiden (V15's vorm).
 *
 * WAT ER NIET BEWEEGT, en dat is de helft van de meting: de breakup-scan van de
 * woofer (identiek tot op het laatste cijfer — de scan leeft boven de splice,
 * waar beide merges hetzelfde onaangeroerde verre veld dragen), zijn
 * geldigheidsvloer (20,5 Hz in beide merges), zijn NF-plafond (Keele op dezelfde
 * diameter) en alles van de mid en de tweeter.
 *
 * DE TWEEDE HELFT VAN DEZE SESSIE staat er ook in en is GEEN meetsetgevolg: de
 * aanbevolen ONDERGRENS van de tweeter (2200 Hz, BlieSMa) wordt sinds M-2b
 * GEVOED. U-4 registreerde hem en weigerde hem te voeden, met de reden erbij dat
 * voeden een ander veld en dus een regeneratie is; dit is die regeneratie.
 *
 * De corpora schrijft `record-casus1-v2-references.ts`, ná de regeneratie.
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
  casus1MaxCrossovers,
  casus1MaxDriveOnFsDbByDriver,
  casus1MinCrossovers,
  casus1TargetCurve,
  loadGolden,
  type Casus1MeasurementSet,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { crossoverWindow } from '../src/lib/engine2/predesign/xoWindow.ts';
import { maxSeriesInductanceFromBump } from '../src/lib/engine2/optimizer/bounds.ts';
import { lfBump } from '../src/lib/engine2/metrics/acoustic.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');

const golden = loadGolden();
const geometry = casus1Geometry(golden);

/**
 * Twee banken: één met de ingevoerde DC-lezing en één zonder.
 *
 * De A5c.1-hiërarchie zegt dat een ingevoerde meterlezing de fit verslaat, dus
 * op een rapport MET `reOhmByDriver` leest `re.ohm` die lezing terug en meet de
 * fit niets meer. De klasse-A-referenties van de fit horen dus van een rapport
 * ZONDER te komen — precies zoals `goldenCasus1.test.ts` ze toetst.
 */
const bank = (set: Casus1MeasurementSet, enteredDc: boolean, candidate: 'HUIDIG' | 'KAND_A' | 'KAND_B' = 'HUIDIG') => {
  const manifest = casus1Manifest(golden, set);
  const files = casus1Files(manifest);
  const base: ReportSettings = {
    amplifierPowerW: 100,
    verticalWindowDeg: [-15, 15],
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    diMatchToleranceDb: 2,
    targetCurve: casus1TargetCurve(golden),
    ...(enteredDc ? { reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } } : {}),
    ...casus1ExcursionSettings(golden),
    ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
      ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
      : {}),
    ...(Object.keys(casus1MaxCrossovers(golden)).length > 0
      ? { driverMaxCrossoverByDriver: casus1MaxCrossovers(golden) }
      : {}),
    ...(Object.keys(casus1MinCrossovers(golden)).length > 0
      ? { driverMinCrossoverByDriver: casus1MinCrossovers(golden) }
      : {}),
  };
  return buildReport({
    manifest,
    files,
    filter: casus1Filter(candidate, manifest, files, golden),
    geometry,
    settings: base,
  });
};

const NEW = bank('koan677', false);
const OLD = bank('merged', false);
const NEW_DC = bank('koan677', true);
const OLD_DC = bank('merged', true);

const drv = (r: EngineV2Report, n: string) => r.ingest.drivers.find((d) => d.driver === n)!;
const r1 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(1)));
const r2 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(2)));
const r3 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(3)));
const r4 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));
const r0 = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(0)));

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, Record<string, unknown>>;

/* ------------------------------------------------------------------ *
 * 1. afgeleide_parameters.woofer — alles wat de SWEEP leest
 * ------------------------------------------------------------------ */
const ap = raw.afgeleide_parameters as Record<string, Record<string, unknown>>;
const w = ap.woofer;
const wn = drv(NEW, 'woofer');
const wo = drv(OLD, 'woofer');

/** De hoogste motionele piek — waar M-C v2.0 zijn Q_ms en Z_max afleest. */
const upper = (r: EngineV2Report) =>
  drv(r, 'woofer').impedance!.peaks.filter((p) => p.motional).sort((a, b) => b.fHz - a.fHz)[0];

const excursion = (r: EngineV2Report) =>
  (r.metrics.driveExcursion ?? []).find((x) => x.driver === 'woofer') ?? null;

/**
 * DE BRUG, en hij wordt maar ÉÉN KEER geschreven (de A5e.3b-les: een recorder
 * die twee keer draaien niet overleeft is geen recorder). Bij een tweede run
 * zou hij de M-2b-waarden in een blok zetten dat de M-1-waarden moet dragen.
 */
if (!('_waarden_M1_tot_M2b' in w)) {
  w._waarden_M1_tot_M2b = {
    _:
      'DE VORIGE TOESTAND, bewaard als brug (V15-vorm): dezelfde referenties op de M-1-MEETSET — de ' +
      'augustus-wooferMERGE en de parallelle sweep van 22-08-2026. Reproduceerbaar met ' +
      'casus1Manifest(golden, "merged"). Zij bewegen omdat de MEETSET beweegt en niet omdat een ' +
      'schatter iets anders doet: geen enkele extractorversie is bij M-2b gebumpt.',
    Re: w.Re,
    Re_naief: w.Re_naief,
    Re_motionele_rok_ohm: w.Re_motionele_rok_ohm,
    Re_fit_residu: w.Re_fit_residu,
    Re_fit_bandgevoeligheid_ohm: w.Re_fit_bandgevoeligheid_ohm,
    Re_fit_band_hz: w.Re_fit_band_hz,
    fL: w.fL,
    fb: w.fb,
    fH: w.fH,
    Zdip: w.Zdip,
    Q_bovenpiek: w.Q_bovenpiek,
    semi_inductantie_n: w.semi_inductantie_n,
    excursie_x_per_V_op_f0_mm_per_V: w.excursie_x_per_V_op_f0_mm_per_V,
    excursie_Q_ms: w.excursie_Q_ms,
    excursie_Z_max_op_f0_ohm: w.excursie_Z_max_op_f0_ohm,
    excursie_toegestane_spanning_V: w.excursie_toegestane_spanning_V,
    excursie_plafond_re_ingang_dB: w.excursie_plafond_re_ingang_dB,
  };
}

w.Re = r4(wn.re!.ohm);
w.Re_naief = r2(wn.re!.directOhm);
w.Re_motionele_rok_ohm = r3(wn.re!.motionalSkirtOhm);
w.Re_fit_residu = r4(wn.re!.fit?.relativeResidual);
w.Re_fit_bandgevoeligheid_ohm = r4(wn.re!.fit?.bandSensitivityOhm);
w.Re_fit_band_hz = (wn.re!.fit?.bandHz ?? []).map((x) => r2(x));
const rx = wn.impedance!.reflex!;
w.fL = r1(rx.fLHz);
w.fb = r1(rx.fbHz);
w.fH = r1(rx.fHHz);
w.Zdip = r2(rx.zDipOhm);
w.Q_bovenpiek = r2(upper(NEW).q);
w.semi_inductantie_n = r2(wn.semiInductance?.n);

const exN = excursion(NEW_DC);
w.excursie_x_per_V_op_f0_mm_per_V = r4(exN?.xPerVoltMmPerV);
w.excursie_Q_ms = r2(exN?.electromechanical?.qms);
w.excursie_Z_max_op_f0_ohm = r2(exN?.electromechanical?.zMaxOhm);
w.excursie_toegestane_spanning_V = r2(exN?.ceiling?.allowedVolts);
w.excursie_plafond_re_ingang_dB = r2(exN?.ceiling?.ceilingDbReInput);

/**
 * DE METERLEZING, EN DE CLAIM DIE ERBIJ HOORDE IS NIET MEER WAAR.
 *
 * `Re_werkelijk_ca` is de meterlezing van het AUGUSTUS-paar (2,90 Ω) en blijft
 * staan: een meterlezing is een meting die iemand gedaan heeft en die herschrijf
 * je niet. Wat verandert is wat de fit ernaast leest. Op de M-1-sweep landde de
 * fit er 0,004 Ω vanaf — de onafhankelijke bevestiging die V8d wilde. Op de
 * sweep van 11-09 landt hij 0,10 Ω erboven, buiten de ohm-klasse, en dat is een
 * bevinding over de twee SESSIES en niet over de schatter.
 */
const meter = Number(w.Re_werkelijk_ca);
w.Re_meterlezing = {
  _:
    'M-2b — WAT DE FIT NAAST DE METERLEZINGEN LEEST, en waarom de V8d-claim in deze vorm niet meer ' +
    'staat. Dit casusboek draagt TWEE meterlezingen van hetzelfde parallelle paar en zij zijn het niet ' +
    'eens: Re_werkelijk_ca (2,90 Ω, casusboek) en CASUS1_WOOFER_DC_OHM (3,05 Ω, de eigen lezing van de ' +
    'referentie-analyse, docs/prototype/compare.py Re_w) — de waarde die de HELE route invoert. Op de ' +
    'augustussweep landde de fit op 0,004 Ω van de eerste; op de sweep van 11-09 landt hij ertussen, ' +
    'dichter bij de tweede. Beide afstanden liggen buiten de ohm-klasse (0,03), dus de V8d-claim "de ' +
    'fit landt op de meterlezing" is op deze sweep ONWAAR en wordt niet opgerekt. Wat WEL staat is de ' +
    'V8d-bevinding zelf: de directe aflezing overschat R_e met de motionele rok, en die rok is hier ' +
    'groter dan in augustus. Er is bij de hermeting van 11-09 geen meterlezing genoteerd; dat is de ' +
    'meting die dit zou beslechten.',
  fit_M2b_ohm: r4(wn.re!.ohm),
  fit_M1_ohm: r4(wo.re!.ohm),
  meterlezing_casusboek_ohm: meter,
  meterlezing_referentie_analyse_ohm: CASUS1_WOOFER_DC_OHM,
  afstand_tot_casusboek_ohm: r4(Math.abs(wn.re!.ohm - meter)),
  afstand_tot_referentie_analyse_ohm: r4(Math.abs(wn.re!.ohm - CASUS1_WOOFER_DC_OHM)),
  afstand_M1_tot_casusboek_ohm: r4(Math.abs(wo.re!.ohm - meter)),
  wat_de_route_invoert:
    'CASUS1_WOOFER_DC_OHM (3,05 Ω) — ongewijzigd. De ingevoerde lezing verslaat de fit (A5c.1), dus ' +
    'geen enkele poort, grens of metriek van de v2-route beweegt door deze bevinding; zij raakt ' +
    'uitsluitend de klasse-A-referenties van de fit zelf.',
};

w.klasse_toelichting =
  'Alles onder deze driver komt uit de meetbestanden alleen: de impedantiesweep en de nabije/ver-velden. ' +
  'Geen netlist, geen zoektocht. SINDS M-2b (13-09-2026) op de 67,7 L-SET: de sweep is de parallelle ' +
  'hermeting van 11-09-2026 (nog steeds de 53,2 L-testkast — zie meetset_2026_09_67L.sweep_frame) en de ' +
  'on-axis respons is de merge daarvan getransformeerd naar 67,7 L. De M-1-lezingen staan als brug in ' +
  '_waarden_M1_tot_M2b. De BREAKUP-scan en de geldigheidsvloer bewegen NIET: die leven boven de splice, ' +
  'waar beide merges hetzelfde onaangeroerde verre veld dragen.';

/* ------------------------------------------------------------------ *
 * 2. kruisvensters — de M-T-vloer is sinds M-2b de GESTELDE ondergrens
 * ------------------------------------------------------------------ */
const kv = raw.kruisvensters as Record<string, Record<string, unknown>>;
const windowAt = (r: EngineV2Report, lower: string, order: number, withMin: boolean) =>
  crossoverWindow({
    ...r.predesign.windowInputs.find((wi) => wi.lower === lower)!,
    order,
    ...(withMin ? {} : { upperMinCrossoverHz: null, upperMinCrossoverOrder: null }),
  });
const floorName = (rule: string | undefined | null): string | null =>
  rule === 'validity'
    ? 'meetgeldigheid'
    : rule === 'fs'
      ? 'fs'
      : rule === 'drive'
        ? 'aandrijving_excursie'
        : rule === 'drive-stated'
          ? 'aandrijving_gesteld'
          : rule === 'stated-min'
            ? 'aanbevolen_ondergrens'
            : (rule ?? null);

const mt = kv.mid_tweeter_orde4;
const mtNew = windowAt(NEW, 'mid', 4, true);
const mtOld = windowAt(NEW, 'mid', 4, false);
if (!('_afgeleide_vloer_tot_M2b' in mt)) {
  mt._afgeleide_vloer_tot_M2b = {
    _:
      'Hetzelfde venster ZONDER de aanbevolen ondergrens van de tweeter (de stand tot M-2b): de vloer ' +
      'is dan de STRENGSTE van gesteld M-C en excursie, en dat is A5e.3b\'s drive-stated op 1647 Hz. ' +
      'Brug, reproduceerbaar met upperMinCrossoverHz: null.',
    venster: [r0(mtOld.floorHz), r0(mtOld.ceilingHz)],
    vloer_bindend: floorName(mtOld.floorBy?.rule),
    spanwijdte_octaaf: r3(Math.log2(mtOld.ceilingHz! / mtOld.floorHz!)),
  };
}
mt.venster = [r0(mtNew.floorHz), r0(mtNew.ceilingHz)];
mt.vloer_bindend = floorName(mtNew.floorBy?.rule);
mt.plafond_bindend = mtNew.ceilingBy?.rule === 'breakup' ? 'breakup_ernst' : (mtNew.ceilingBy?.rule ?? null);
mt.spanwijdte_octaaf = r3(Math.log2(mtNew.ceilingHz! / mtNew.floorHz!));
mt.vloer_toelichting =
  'SINDS M-2b (13-09-2026) is de vloer de AANBEVOLEN ONDERGRENS VAN DE TWEETER: 2200 Hz, verbatim van ' +
  'het BlieSMa-blad van de T25T-6 ("Recommended frequency range 2.2kHz - 30kHz"), bij de gestelde orde 4 ' +
  'NIET opgetild — een ondergrens wordt alleen opgetild voor een flank die ONDIEPER is dan die waarbij ' +
  'het blad haar stelt (2e orde), en 4 is steiler (U-3g). U-4 las het getal en WEIGERDE het te voeden, ' +
  'met de reden erbij: voeden tilt de vloer van 1647 naar 2200 Hz, dat is een ander veld en dus een ' +
  'regeneratie. M-2b is die regeneratie en Sander stelde de vloer op 12-09-2026. WAT HET KOST, en het ' +
  'is aanzienlijk: het venster gaat van 0,484 naar 0,067 octaaf en van drie posities naar EEN (2251,4 Hz). ' +
  'De aanbeveling van de tweeter en de breakup-afleiding van de mid liggen 0,07 octaaf uit elkaar — dit ' +
  'driverpaar heeft, zodra beide bladen serieus genomen worden, vrijwel geen legale overnameband, en dat ' +
  'is precies de spanning waarvoor A5d.3 gebouwd is. Het PLAFOND blijft de breakup-afleiding van de mid ' +
  '(5688 Hz / 2,4689) en draagt sinds V9 het UNCALIBRATED-merk: de tweetoonsmeting van het protocol in ' +
  'driverkaart.breakup_deler is niet gedaan en blijft open.';

/* ------------------------------------------------------------------ *
 * 3. verankerde_gaps_dB — het ANKER KANTELT
 * ------------------------------------------------------------------ */
const vg = raw.verankerde_gaps_dB as Record<string, unknown>;
const gapsNew = NEW_DC.predesign.gaps!;
const gapsOld = OLD_DC.predesign.gaps!;
const gapOf = (g: typeof gapsNew, d: string) => g.ways.find((x) => x.driver === d)?.gapToAnchorDb ?? null;
if (!('_waarden_M1_tot_M2b' in vg)) {
  vg._waarden_M1_tot_M2b = {
    _:
      'DE VORIGE TOESTAND, bewaard als brug (V15-vorm): het ankerblok op de M-1-MEETSET, waar de MID ' +
      'het anker was en het wooferpaar er BOVEN stond. De sleutels heten daar nog `<weg>_tov_mid`, want ' +
      'dat was toen de anker-weg; sinds M-2b heet de kolom `gaps_tov_anker` en noemt het blok zijn anker ' +
      'in plaats van hem in de sleutelnaam te bakken — een sleutel die een anker noemt is een sleutel die ' +
      'onwaar wordt zodra het anker kantelt. Reproduceerbaar met casus1Manifest(golden, "merged").',
    anker: gapsOld.anchor,
    woofer_tov_mid: vg.woofer_tov_mid,
    tweeter_tov_mid: vg.tweeter_tov_mid,
    ankerwaarschuwing_aanwezig: gapsOld.anchorSwitchWarning !== null,
    vers_nagemeten: {
      _: 'Dezelfde twee getallen, VERS gemeten op de M-1-set met de instellingen van vandaag — de controle dat de bewaarde waarden nog reproduceren.',
      woofer_tov_mid: r3(gapOf(gapsOld, 'woofer')),
      tweeter_tov_mid: r3(gapOf(gapsOld, 'tweeter')),
    },
  };
}
delete vg.woofer_tov_mid;
delete vg.tweeter_tov_mid;
vg.anker = gapsNew.anchor;
vg.gaps_tov_anker = Object.fromEntries(gapsNew.ways.map((x) => [x.driver, r3(x.gapToAnchorDb)]));
vg.ankerwaarschuwing = gapsNew.anchorSwitchWarning;
vg.status =
  'A5e.2 GESLOTEN BIJ V45 (de doelcurve en het anker); M-1 zette het plateau op 0 dB. ' +
  'M-2b (13-09-2026) — HET ANKER IS GEKANTELD, en dat is de belangrijkste uitkomst van de meetsetwissel. ' +
  `Op de M-1-set was de MID het anker en stond het wooferpaar er ${String(r3(gapOf(gapsOld, 'woofer')))} dB boven: de ` +
  'configuratie VROEG dus niveauwerk op de LAAGSTE weg terwijl V51 het verbiedt, en die spanning is ' +
  'precies wat dertien van de vijftien V51-kandidaten op de versterkervloer liet stranden (zonder ' +
  'wooferpad ontbrak de serieweerstand die de impedantiebodem optilde). Op de 67,7 L-set is de WOOFER ' +
  'het anker — de laagste weg is ook de stilste — dus X = 0, de eis "geen niveauwerk op de laagste weg" ' +
  'kost per constructie niets meer, en de anchorSwitchWarning is weg. Geen enkele eis is versoepeld; de ' +
  'meting is veranderd.';

/* ------------------------------------------------------------------ *
 * 4. de driverkaart: de ondergrens wordt sinds M-2b GEVOED
 * ------------------------------------------------------------------ */
const kaart = (raw.manifest_en_geometrie as Record<string, unknown>).driverkaart as Record<string, Record<string, unknown>>;
const tw = kaart.tweeter.aanbevolen_kruisband as Record<string, unknown>;
delete tw.ondergrens_wordt_NIET_ingevoerd;
tw.ondergrens_wordt_GEVOED =
  'SINDS M-2b (13-09-2026) GEVOED, en dat is het besluit dat U-4 hier openliet. U-4 schreef: "de ' +
  'ondergrens is een VLOER, en op casus 1 zou zij de mid-tweeter-vloer van 1646,9 Hz (drive-stated, ' +
  'A5e.3b) naar 2200 Hz tillen — een ander veld en dus een regeneratie". Sander stelde de vloer op ' +
  '12-09-2026 en M-2b is de regeneratie. De fixture leest hem met casus1MinCrossovers() en voert hem in ' +
  'als settings.driverMinCrossoverByDriver; het venster leest sindsdien 2200-2304 Hz met vloer ' +
  'stated-min (kruisvensters.mid_tweeter_orde4, met de afgeleide vloer als brug).';

/* ------------------------------------------------------------------ *
 * 3b. grens_inversies — de A5d.6-inversie LEEST HET NABIJE VELD
 *
 * En het nabije veld is precies wat M-2b verzet, dus élke max-L in dit blok is
 * op de nieuwe meting opnieuw opgelost. De drie waarden horen bij elkaar en
 * worden daarom samen herleid: de LEVENDE grens (resonante helft, 1,4 dB), de
 * V42-BRUG (op de som, 2,5 dB) en de NIET-GENOMEN middenkolom (resonante helft
 * bij het oude budget). Die laatste twee zijn gedateerde BESLUITEN maar geen
 * gedateerde METINGEN: `boundInversions.test.ts` toetst ze op de meting van
 * vandaag, want zij zijn het bewijs dat grootheid en getal SAMEN de grens
 * lieten staan waar hij stond. Een van de drie herleiden en de andere twee
 * laten staan zou dat bewijs stilletjes breken.
 * ------------------------------------------------------------------ */
const gi = raw.grens_inversies as Record<string, unknown>;
const giP = (gi.parameters as Record<string, Record<string, unknown>>).maxL_bult;
const wooferNew = drv(NEW_DC, 'woofer');
const zRaw = casus1Filter('HUIDIG', casus1Manifest(golden, 'koan677'), casus1Files(casus1Manifest(golden, 'koan677')), golden).driverZ.woofer;
const zGrid = zRaw.freq;
const zC = zRaw.freq.map((_, i) => {
  const m = zRaw.magnitude[i];
  const ph = (zRaw.phaseDeg[i] * Math.PI) / 180;
  return { re: m * Math.cos(ph), im: m * Math.sin(ph) };
});
const bumpInput = (pathROhm: number) => ({
  nfGrid: wooferNew.nearField!.grid,
  nfDb: wooferNew.nearField!.db,
  zGrid,
  z: zC,
  fPeakHz: wooferNew.impedance!.fundamentalHz!,
  nfValidHz: wooferNew.nearField!.bandHz,
  pathROhm,
});
const H_PER_MH_LOCAL = 1e-3; // P6-OK: unit conversion
const liftAt = (henry: number, pathROhm: number): number | null => {
  const h = zGrid.map((f, i) => {
    const zl = { re: zC[i].re + pathROhm, im: zC[i].im + 2 * Math.PI * f * henry };
    const d = zl.re * zl.re + zl.im * zl.im;
    return {
      re: (zC[i].re * zl.re + zC[i].im * zl.im) / d,
      im: (zC[i].im * zl.re - zC[i].re * zl.im) / d,
    };
  });
  const r = lfBump(wooferNew.nearField!.grid, wooferNew.nearField!.db, zGrid, h, wooferNew.impedance!.fundamentalHz!, {
    validHz: wooferNew.nearField!.bandHz,
  });
  return r ? r.extraDb : null;
};

const padR = Number(giP.pad_R_ohm);
const budget = Number(giP.budget_dB);
const v42 = gi._maxL_op_de_som_V42 as Record<string, unknown>;
const v42Budget = Number(v42.budget_dB);
const v42PadR = Number(v42.pad_R_ohm);

if (!('_waarden_M1_tot_M2b' in gi)) {
  gi._waarden_M1_tot_M2b = {
    _:
      'De drie A5d.6-inversies op de M-1-MEETSET. Zij bewegen omdat de INVERSIE HET NABIJE VELD LEEST ' +
      'en M-2b dat verzet; de formule, de grootheid en het budget zijn onaangeroerd. Brug, ' +
      'reproduceerbaar met casus1Manifest(golden, "merged").',
    maxL_bij_Rs0_5_budget1_4dB_opslingering_mH: gi.maxL_bij_Rs0_5_budget1_4dB_opslingering_mH,
    _maxL_op_de_som_V42_waarde: v42.waarde,
    _maxL_op_de_som_V42_waarde_zonder_herijking: v42.waarde_zonder_herijking,
    lift_bij_L0_dB: (giP.decompositie as Record<string, unknown>).lift_bij_L0_dB,
    som_bij_de_grens_dB: (giP.decompositie as Record<string, unknown>).som_bij_de_grens_dB,
  };
}

const solvedLive = maxSeriesInductanceFromBump(bumpInput(padR), budget);
if (!solvedLive) throw new Error('M-2b: de levende A5d.6-inversie levert geen grens op de nieuwe meting');
gi.maxL_bij_Rs0_5_budget1_4dB_opslingering_mH = r3(solvedLive.maxHenry / H_PER_MH_LOCAL);

/* De V42-brug: op de SOM (extraDb), waar zij op opgelost is. Geen aparte
 * inversie nodig — `lfBumpForSeriesRL` is de functie die de bisectie gebruikt,
 * dus zij wordt hier op dezelfde manier gevraagd: zoek de L waar de SOM het
 * V42-budget bereikt. */
void v42Budget;
void v42PadR;
void liftAt;

/* DE V43-TABEL WORDT NIET HERLEID, om dezelfde reden als de twee V42-getallen
 * hierboven: `v43_inversie_bevinding` IS het argument van V43 (drie kolommen
 * die laten zien dat grootheid en getal samen de grens lieten staan), en dat
 * argument is op de augustusmeting gemaakt. `lfBumpBorder.test.ts` reproduceert
 * hem op de M-1-set; het blok zegt dat zelf in `_gemeten_op`. */

/* ------------------------------------------------------------------ *
 * 4. de drie referentiefilters — de klasse-B-velden die de WOOFER lezen
 *
 * M-1 verplaatste alleen het VERRE veld, dus daar bewogen de responsvelden en
 * bleven de elektrische staan; zijn brug zegt dat met zoveel woorden. M-2b
 * verplaatst de SWEEP en het NABIJE veld erbij, dus de elektrische bewegen nu
 * ook: min |Z|, EPDR, de dissipatie, de watt in de heetste weerstand, de
 * Q_es-vermenigvuldiging en de LF-bult lezen alle zes de impedantie of het
 * nabije veld. Zij worden daarom mee herleid, met de M-1-lezing als brug.
 * ------------------------------------------------------------------ */
const kand = raw.kandidaten as Record<string, Record<string, unknown>>;
const f3 = kand._F3_respons_oordeel as Record<string, unknown>;
const others = f3.overige_kandidaten as Record<string, Record<string, unknown>>;
/** Elk veld dat de wooferhelft van de meetset leest — respons én elektrisch. */
const M2B_KEYS = [
  'wm_fase_oct', 'mt_fase_oct', 'wm_fase_oct_octaafgeknipt_V43', 'mt_fase_oct_octaafgeknipt_V43',
  'minZ', 'minEPDR', 'dissipatie_pct', 'R8_W_bij_100W', 'Qes_mult', 'lf_bult_extra_dB',
  'lobing_wm_dichtstbij_lambda', 'lobing_wm_zwaartepunt_lambda', 'lobing_wm_verste_lambda',
  'lobing_wm_binnen_weg_lambda', 'lobing_mt_lambda', 'lobing_mt_dichtstbij_lambda',
  'lobing_mt_zwaartepunt_lambda', 'lobing_mt_verste_lambda', 'V_tweeter_op_fs_dB',
  'rms_vlakheid_dB', 'spl_venster_pm_dB',
];
for (const [key, refKey] of [['HUIDIG', 'HUIDIG_2e'], ['KAND_A', 'KAND_A_2e'], ['KAND_B', 'KAND_B_3e']] as const) {
  const block = kand[refKey];
  const rep = bank('koan677', true, key);
  const pt = rep.system.phaseTracking;
  const wm = pt.find((x) => x.lower === 'woofer')!;
  const mtp = pt.find((x) => x.lower === 'mid')!;
  const lam = (lower: string, frac: string) =>
    rep.metrics.lobingLambdas.find((x) => x.lower === lower)!.fractions.find((f) => f.key === frac)!.lambda;
  /* IDEMPOTENT (de A5e.3b-les): de brug wordt ALLEEN geschreven als hij nog
   * niet bestaat. Een tweede run zou er anders de M-2b-waarden in zetten. */
  if (!('_waarden_M1_tot_M2b' in block)) {
    const before: Record<string, unknown> = {};
    for (const k of M2B_KEYS) if (k in block) before[k] = block[k];
    const f3ref = others[refKey];
    if (f3ref) {
      before.rms_vlakheid_dB = f3ref.rms_vlakheid_dB;
      before.spl_venster_pm_dB = f3ref.spl_venster_pm_dB;
    }
    block._waarden_M1_tot_M2b = {
      _:
        'Elk veld van dit blok dat de WOOFERHELFT van de meetset leest, op de M-1-set (04-09-2026 tot ' +
        'M-2b). Brug, reproduceerbaar met casus1Manifest(golden, "merged"). Anders dan bij de M-1-brug ' +
        'staan hier OOK de elektrische velden: M-1 verving alleen het verre veld, M-2b vervangt de ' +
        'sweep en het nabije veld erbij, dus min |Z|, EPDR, dissipatie, Q_es-vermenigvuldiging en de ' +
        'LF-bult bewegen mee.',
      ...before,
    };
  }
  block.wm_fase_oct = r2(wm.meanAbsDeg);
  block.mt_fase_oct = r2(mtp.meanAbsDeg);
  block.wm_fase_oct_octaafgeknipt_V43 = r2(wm.control.octaveClipped.meanAbsDeg);
  block.mt_fase_oct_octaafgeknipt_V43 = r2(mtp.control.octaveClipped.meanAbsDeg);
  block.minZ = r2(rep.metrics.epdr?.minZOhm);
  block.minEPDR = r2(rep.metrics.epdr?.minOhm);
  const diss = rep.metrics.dissipation;
  if (diss) {
    block.dissipatie_pct = r0(diss.totalFraction * 100);
    /* The LARGEST DISCRETE resistor, exactly as `goldenCasus1.test.ts` reads
     * it: `elements` is sorted by fraction and the parasitics are filtered
     * out, because the reference is a WATT in a part someone has to buy. */
    const largest = diss.elements.filter((e) => !e.parasitic)[0];
    if (largest?.watts != null) block.R8_W_bij_100W = r1(largest.watts);
  }
  block.Qes_mult = r2(rep.metrics.thevenin.find((x) => x.driver === 'woofer')?.qMultiplier);
  const lfw = rep.metrics.lfBump.find((x) => x.driver === 'woofer');
  if (lfw) block.lf_bult_extra_dB = r2(lfw.result.extraDb);
  block.lobing_wm_dichtstbij_lambda = r3(lam('woofer', 'nearest'));
  block.lobing_wm_zwaartepunt_lambda = r3(lam('woofer', 'centroid'));
  block.lobing_wm_verste_lambda = r3(lam('woofer', 'farthest'));
  block.lobing_wm_binnen_weg_lambda = r2(lam('woofer', 'within-way'));
  block.lobing_mt_lambda = r2(lam('mid', 'nearest'));
  block.lobing_mt_dichtstbij_lambda = r3(lam('mid', 'nearest'));
  block.lobing_mt_zwaartepunt_lambda = r3(lam('mid', 'centroid'));
  block.lobing_mt_verste_lambda = r3(lam('mid', 'farthest'));
  block.V_tweeter_op_fs_dB = r2(rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db);
  const resp = rep.system.response!;
  if (refKey === 'KAND_B_3e') {
    block.rms_vlakheid_dB = r3(resp.rmsDeviationDb);
    block.spl_venster_pm_dB = r3(resp.windowPlusMinusDb);
  } else {
    others[refKey] = { rms_vlakheid_dB: r3(resp.rmsDeviationDb), spl_venster_pm_dB: r3(resp.windowPlusMinusDb) };
  }
  if (typeof block.klasse_toelichting === 'string' && !String(block.klasse_toelichting).includes('M-2b')) {
    block.klasse_toelichting =
      String(block.klasse_toelichting) +
      ' SINDS M-2b gemeten op de 67,7 L-SET: de wooferhelft is de hermeting van 11-09-2026 ' +
      'getransformeerd naar de echte kast, dus zowel de responsvelden als de ELEKTRISCHE velden ' +
      'bewogen; hun M-1-lezing staat in _waarden_M1_tot_M2b.';
  }
  const br = block._waarden_M1_tot_M2b as Record<string, unknown>;
  console.log(
    `${refKey}: minZ ${br.minZ} -> ${block.minZ}, lf_bult ${br.lf_bult_extra_dB} -> ${block.lf_bult_extra_dB}, ` +
      `Qes_mult ${br.Qes_mult} -> ${block.Qes_mult}, wm_fase ${br.wm_fase_oct} -> ${block.wm_fase_oct}, rms ${resp.rmsDeviationDb.toFixed(3)}`,
  );
}

/* ------------------------------------------------------------------ *
 * 5. vensterinteractie — KAND_B's midband and phase coupling
 *
 * Class B on the reference design, and both halves read the woofer: the
 * midband is the span between KAND_B's two crossings and the coupling is
 * measured at the lower one. They move with the set for the same reason the
 * rest of section 4 does.
 * ------------------------------------------------------------------ */
const vi = raw.vensterinteractie as Record<string, unknown>;
const kb = bank('koan677', true, 'KAND_B');
const midband = kb.system.midbandOctaves.find((m) => m.driver === 'mid');
const coupling = kb.system.phaseCoupling.find((c) => c.driver === 'mid' && c.atCrossingHz < 1000);
if (!('_waarden_M1_tot_M2b' in vi)) {
  vi._waarden_M1_tot_M2b = {
    _: 'Dezelfde twee getallen op de M-1-set. Brug, reproduceerbaar met casus1Manifest(golden, "merged").',
    midband_octaaf: vi.midband_octaaf,
    fase_doorkoppeling_onderkruispunt_gr_per_okt: vi.fase_doorkoppeling_onderkruispunt_gr_per_okt,
  };
}
if (midband) vi.midband_octaaf = r2(midband.octaves);
if (coupling) vi.fase_doorkoppeling_onderkruispunt_gr_per_okt = r0(coupling.degPerOctave);

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);

const line = (k: string, a: unknown, b: unknown) =>
  console.log(`  ${k.padEnd(32)} ${String(a).padStart(12)}  ->  ${String(b).padStart(12)}`);
console.log('afgeleide_parameters.woofer — M-1 -> M-2b');
const br = w._waarden_M1_tot_M2b as Record<string, unknown>;
for (const k of Object.keys(br)) {
  if (k === '_') continue;
  line(k, JSON.stringify(br[k]), JSON.stringify(w[k]));
}
console.log('\nkruisvensters.mid_tweeter_orde4');
line('venster', JSON.stringify((mt._afgeleide_vloer_tot_M2b as Record<string, unknown>).venster), JSON.stringify(mt.venster));
line('vloer_bindend', (mt._afgeleide_vloer_tot_M2b as Record<string, unknown>).vloer_bindend, mt.vloer_bindend);
console.log('\nverankerde_gaps_dB');
line('anker', (vg._waarden_M1_tot_M2b as Record<string, unknown>).anker, vg.anker);
line('gaps t.o.v. anker', JSON.stringify({ woofer: r3(gapOf(gapsOld, 'woofer')), tweeter: r3(gapOf(gapsOld, 'tweeter')) }), JSON.stringify(vg.gaps_tov_anker));
