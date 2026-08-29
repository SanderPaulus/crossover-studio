/**
 * F4d — WRITE THE CLASS-B REFERENCES FOR THE FROZEN v2 CANDIDATES.
 *
 * Run with `npx vite-node scripts/record-casus1-v2-references.ts`, AFTER
 * `generate-casus1-v2-candidates.ts` has written the netlists.
 *
 * Two scripts rather than one, because they answer to different costs. The
 * generator runs nine chain tunes and takes about half an hour; this reads the
 * files it left behind and takes three seconds. Folding them together would
 * mean re-running the search every time a reference needs re-recording, and a
 * procedure that expensive is a procedure people work around.
 *
 * WHAT IT WRITES, and every one of them is CLASS B — a metric on a netlist FILE
 * that sits in the repository, so no search moves it (F4a, V19):
 *
 *   · `kandidaten.KAND_V2_n` — the metric block per frozen candidate;
 *   · `manifest_en_geometrie.v2_herkomst` — a POINTER to the provenance file,
 *     with the three facts a reader needs to know what they are looking at.
 *     Documentation, not an acceptance value, and it says so;
 *   · `classificatie.telling.sinds_F4d` — what this added to the tally,
 *     recorded the way V20 recorded its own additions rather than by rewriting
 *     the F4a snapshot. A snapshot that moves with every delivery is not one.
 *
 * The numbers are computed here rather than typed, which is the point: nine
 * blocks of ten values is ninety chances to transcribe a digit wrong.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { compareDesigns } from '../src/lib/engine2/predesign/comparison.ts';
import { ampFloorSlackOhm, meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { systemMinImpedanceOhm } from '../src/lib/netOptimizer.ts';
import { impedanceReferenceFrom } from '../src/lib/engine2/optimizer/impedanceReference.ts';
import { sourceProbeIndex, sourceResistanceOhm } from '../src/lib/partAudit.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_V2_GRID,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { Complex } from '../src/lib/complex.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');
const HERKOMST_FILE = 'casus1_v2_herkomst.json';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const herkomst = JSON.parse(
  readFileSync(join(HERE, '..', 'test-fixtures', HERKOMST_FILE), 'utf-8'),
) as {
  seed: number;
  run_vingerafdruk: string;
  gegenereerd_op_commit: string;
  bestanden: { name: string; label: string }[];
  meetopstelling: Record<string, unknown>;
};

const report = (key: string) =>
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

/** Round to the precision the reference file uses for that kind of quantity. */
const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
const r0 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(0));
/** Ohms at the resolution the V33 grid comparison needs — the slack is 0.05 Ω. */
const r4 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(4));

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, Record<string, unknown>>;
const netlists = raw.manifest_en_geometrie.netlists as Record<string, string>;

/* THE KEY LIST COMES FROM THE GENERATOR'S OWN MANIFEST, not from whatever the
 * reference file happened to list last time.
 *
 * It used to read the existing `netlists` entries, which was fine while the
 * field never changed size — and wrong the first time it did. The F4d
 * follow-up suspended the F3c excision (V28), the mid→tweeter axis went from
 * three positions to five, and the field from nine candidates to fifteen; a
 * recorder keyed on the OLD list would have written nine blocks, left six
 * netlists on disk unreferenced, and reported success. So the generator's
 * manifest is the authority for WHICH netlists exist, and stale KAND_V2
 * entries are dropped rather than kept alive by silence. */
const liveNetlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> })
  .netlists;
/**
 * THE LIVE CORPUS, and ONLY the live corpus.
 *
 * `^KAND_V2_\d+$` and not `startsWith('KAND_V2')`, which is not pedantry: since
 * V30 the case book also holds `V28_KAND_*`, the ten netlists that were frozen
 * while the stated floor was still only a veto. They are kept deliberately —
 * they are the "before" half of the V30 comparison, and a prefix test that
 * swallowed them would delete the evidence on the next regeneration and report
 * success. The dated corpus is written once, by hand, and this script does not
 * touch it.
 */
const LIVE_V2 = /^KAND_V2_\d+$/;
for (const map of [netlists, liveNetlists]) {
  // Both copies, and the second one is not redundant: `casus1Filter` resolves a
  // key against the OBJECT `loadGolden()` returned, while the block being
  // written is the raw JSON re-parsed for editing. Updating only the raw copy
  // leaves the loader looking for a netlist the reference file no longer lists,
  // which is how the first run of this change died — usefully, and loudly.
  for (const k of Object.keys(map)) if (LIVE_V2.test(k)) delete map[k];
  for (const f of herkomst.bestanden) map[f.name.replace(/-/g, '_')] = `${f.name}.adsfilter.json`;
}
for (const k of Object.keys(raw.kandidaten)) if (LIVE_V2.test(k)) delete raw.kandidaten[k];
const keys = Object.keys(netlists).filter((k) => LIVE_V2.test(k));
/**
 * THE DATED CORPORA, and there are two of them now.
 *
 * `V28_KAND_*` — frozen while the stated floor was still only a veto (V30).
 * `V30_KAND_*` — frozen while the gate reference was still blind below the
 * far-field floor (V32), and while a candidate whose tune was refused wholesale
 * still came back wearing its seed (V31).
 *
 * Both are kept for the same reason and neither is written by this script: they
 * are the "before" halves of two comparisons, byte-identical files under dated
 * names. The regex is anchored for the reason the live one is — a prefix test
 * would eat them on the next regeneration and report success.
 */
/**
 * EVERY DATED CORPUS, DERIVED — not a list somebody has to remember to extend.
 *
 * There are four now (V28, V30, V32, V33-sweep) and the list has been forgotten
 * once already: `goldenClassification.test.ts` carried a hand-written family
 * list, V32 added a corpus, and ten class-B blocks went a whole delivery
 * without ever being checked. So: a dated corpus is a netlist key that looks
 * like one, and the only thing that has to be registered by hand is its REASON
 * (below), which cannot be derived and whose absence is reported rather than
 * silently skipped.
 */
const DATED_KAND = /^V\d+[A-Z0-9_]*_KAND_\d+$/;
const datedKeys = Object.keys(netlists).filter((k) => DATED_KAND.test(k));
/** Grouped by their corpus prefix, in the order the manifest lists them. */
const datedByCorpus = new Map<string, string[]>();
for (const k of datedKeys) {
  const prefix = k.replace(/_KAND_\d+$/, '');
  datedByCorpus.set(prefix, [...(datedByCorpus.get(prefix) ?? []), k]);
}
/* AN EMPTY SET IS A RESULT, not a crash.
 *
 * It used to throw here, which was right while nothing could refuse a
 * candidate. With the amplifier floor armed a gate can refuse all of them, and
 * "every candidate this field implies is unbuildable against the stated floor"
 * is a finding worth writing down — a script that dies on it leaves the
 * reference file holding netlists that no longer exist. So: prune, record, and
 * say so out loud. */
if (keys.length === 0) {
  console.warn(
    'NO candidate survived: the field produced none that passed every armed gate, so every ' +
      'KAND_V2 entry has been pruned from manifest_en_geometrie.netlists and from kandidaten. ' +
      'See casus1_v2_herkomst.json → kandidaat_uitkomst for what each one was refused by.',
  );
}

/* ---- the stated amplifier floor, against every frozen netlist ----------- *
 *
 * V30. `frozenNetlistGates.test.ts` enforces one rule — EVERY frozen netlist
 * clears the stated floor, or is named here with its reason — and it reads
 * `manifest_en_geometrie.netlists` to decide what "every" means. So this walk
 * has to read the same list. It used to walk only the live `KAND_V2_*` keys,
 * which was correct while those were the only netlists that could miss the
 * floor; since V30 the case book also holds the dated `V28_KAND_*` corpus,
 * frozen while the floor was still only a veto, and none of those clears it.
 * A list built from a narrower set than the test checks is a list that goes
 * red on the first regeneration for a reason nobody wrote down.
 *
 * The point of writing it down rather than loosening the test: "this case book
 * contains designs nobody may build, and here is exactly which" is a finding.
 * A test that simply skipped them would make it disappear. And it is
 * bookkeeping, not a waiver — the list is meant to shrink, and at V30 it did:
 * from ten names to ten OLDER names, with the new corpus clearing the floor on
 * its own. */
const statedFloorOhm = casus1AmpMinLoadOhm(golden);
const floorExceptions: {
  netlist: string;
  minZ_ohm: number | null;
  minZ_bij_hz: number | null;
  gestelde_vloer_ohm: number;
  reden: string;
}[] = [];

/** The chain's own analysis-grid floor — the lowest frequency a v2 RUN can see. */
const CHAIN_GRID_LO_HZ = CASUS1_V2_GRID[0];

/**
 * Why a given frozen netlist is allowed to sit under the floor.
 *
 * Two families and two entirely different reasons, and writing one sentence
 * for both would have hidden the second — which is the finding of this
 * regeneration and not a footnote to it.
 */
/**
 * Why a dated corpus is allowed to sit under the floor, per corpus.
 *
 * The ONE thing about a dated corpus that cannot be derived, so the one thing
 * registered by hand — and a corpus with no entry gets a sentence saying so
 * rather than a plausible-sounding reason that belongs to a different corpus.
 */
const DATED_REASON: Record<string, string> = {
  V41:
    'HET GEDATEERDE V41-CORPUS. Bevroren terwijl het LF-BULT-BUDGET (A4 M-D) nog niet GESTELD was. ' +
    'Geen enkele A5d.6-inversie begrensde de seriespoel van de laagste weg, dus de zoektocht koos ' +
    'de wooferinductie zonder te weten dat zij de bovenste reflexpiek opslingert. Gemeten op dit ' +
    'corpus: 3,62 tot 7,93 dB extra opslingering (gemiddeld 5,7) tegen de 2,5 dB die V42 stelt, ' +
    'met totale seriespoelen tot 7,34 mH tegen een inversie van 2,43 mH. Zeven van de acht ' +
    'netlists dragen TWEE spoelen in serie, en dat is de tweede helft van de bevinding: de ' +
    'inversie plafonneerde tot V42 alleen PER COMPONENT, dus een gesplitste keten ontsnapte er ' +
    'sowieso aan. Deze acht blijven staan als de "vóór"-helft van die vergelijking. Meetobject, ' +
    'GEEN ontwerp: mag niet gebouwd worden.',
  V38FIX:
    'HET GEDATEERDE V38-FIX-CORPUS. Bevroren terwijl de DESIGN- en SYNTHESESTAP nog erfden wat de ' +
    'v1-keten toevallig droeg. Twee instellingen, allebei BOVEN de tuner en dus buiten elke ' +
    'A3j-garantie (V38 beslispunt B, C en D). `eqBands` was ongesteld, en ongesteld betekent in ' +
    '`designThreeWay` een stille NUL: geen enkele EQ-band, en een EQ-band is de enige weg waarlangs ' +
    '`deriveTopology` een val op een gemeten breakup kan voorstellen. `leanTargetDb` was geen ' +
    'sleutel maar een AFLEIDING uit `targets.rippleDb` — 2,5 dB, het stopdoel van de trapmethode, ' +
    'vijf keer de eigen 0,5 dB van `synthesize` — waardoor de kale ladder op 45 van de 45 takken ' +
    'slaagde en er nooit een Zobel, Fs-val of top-octaaf-hold gekocht werd. Sinds V41 stelt de ' +
    'v2-kandidaat beide expliciet, op de eigen standaard van de betrokken motor. Deze tien blijven ' +
    'staan als de "vóór"-helft van die vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd ' +
    'worden.',
  V37:
    'HET GEDATEERDE V37-CORPUS. Bevroren terwijl de ZOEKTOCHT nog op een gegladde maat mat. ' +
    '`smoothMag` gladt de MAGNITUDE van elke driverrespons met errorSmoothOct (1/12 octaaf, ' +
    'overgeerfd uit v1 als "polish, mag overerven") en sommeert de takken daarna complex, ' +
    'terwijl elk oordeel — judgeResponse, het SPL-venster, de trapdoelen, elke poort — de ' +
    'ONGEGLADDE som leest. Op het ketenraster van casus 1 reikt die gladdingskern over de ' +
    'bandrand heen naar de stille geest op 20 000 Hz (-400 dB, buiten de beoordeelde band) en ' +
    'trekt het laatste punt BINNEN de band van 130,95 naar 43,67 dB: de amplitudeterm van de ' +
    'zoektocht staat daardoor op 10,22 dB waar de echte som er 1,85 heeft. Gemeten kostte die ' +
    'ene sleutel 0,55 tot 2,45 dB geleverde vlakheid op drie topologieen (casusboek V38). Sinds ' +
    'V38-fix stelt de v2-kandidaat errorSmoothOct expliciet op 0 en meet de zoektocht de som ' +
    'die zij beoordeeld wordt. Deze tien blijven staan als de "voor"-helft van die ' +
    'vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V34:
    'HET GEDATEERDE V34-CORPUS. Bevroren terwijl de DISSIPATIETERM nog door de PIEKHOOGTE deelde. ' +
    'De term bestaat om de serie-R-route naar niveauregeling af te remmen, en de schade die zij ' +
    'aanricht is Q_es-vermenigvuldiging: 1 + R_source/R_e, met R_e de DC-weerstand (A3j rij 23, ' +
    'A4 M-E). Hij deelde echter door Re(Z) BIJ de bronweerstandsprobe, en sinds V34 zit die probe ' +
    'op de impedantiepiek van het wooferpaar: 19,31 Ohm tegen een gemeten R_e van 3,05 Ohm, een ' +
    'factor 6,33 die tot 40,1 kwadrateert. Sinds V37 deelt de v2-route door de OPGELOSTE R_e — ' +
    'hetzelfde getal dat M-E publiceert en de Q_es-inversie gebruikt — en is de term voor het ' +
    'eerst groot genoeg om de uitdagingsdrempel van de tuner te halen. Deze tien blijven staan ' +
    'als de "vóór"-helft van die vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V33:
    'HET GEDATEERDE V33-CORPUS. Bevroren terwijl de BRONWEERSTANDSPROBE nog het ketenraster las. ' +
    'Zonder gestelde boxafstemming neemt de probe de impedantiepiek van de laagste driver over de ' +
    'onderkant van het raster, en op het ketenraster landde die piek op `grid[24] = 640,2 Hz` — de ' +
    'BOVENRAND van zijn eigen zoekvenster, geen resonantie: dit wooferpaar is bassreflex en zijn ' +
    'twee pieken liggen op 17 en 51 Hz, allebei onder een raster dat op 200 Hz begint. De bewaking ' +
    'die daarvoor bestond (ISSUE #14) verwierp alleen index 0. Dat getal voedde een harde ' +
    'diskwalificatie, een zoekbeperking, een structuurzet-bewaking, een audittier en één ' +
    'doelfunctieterm. Sinds V34 leest de probe op de v2-route het veiligheidsraster, met de ' +
    'strikte randregel, en draagt de kandidaat geen bronweerstandsgrens meer die niemand gesteld ' +
    'heeft. Deze tien blijven staan als de "vóór"-helft van die vergelijking. Meetobject, GEEN ' +
    'ontwerp: mag niet gebouwd worden.',
  V33_SWEEP:
    'HET GEDATEERDE V33-SWEEP-CORPUS. Bevroren met de barrière op de VOLLE GEMETEN SWEEP — ' +
    'hetzelfde raster als de poort, 1600 punten, en daarmee de duurste arm van V33: ruim tien ' +
    'minuten per ketenrun. Het levende corpus draait sinds V33 op het veiligheidsraster van de ' +
    'tuner (240 punten, dezelfde uitgestrektheid, dezelfde functie), en de vóór/ná van die twee ' +
    'armen is precies waar dit corpus voor bewaard is. Meetobject, GEEN ontwerp.',
  V32:
    'HET GEDATEERDE V31/V32-CORPUS. Bevroren terwijl de BARRIÈRETERM nog het evaluatieraster ' +
    'las — 200 Hz en hoger op deze meetset — en de poort sinds V32 de volle gemeten sweep ' +
    'handhaafde. De zoektocht mikte dus op een ander gebied dan waarop zij beoordeeld werd ' +
    '(casusboek V33). Sinds V33 leest de barrière een raster met dezelfde uitgestrektheid als ' +
    'de poort, via dezelfde functie. Deze netlists blijven staan als de "vóór"-helft van die ' +
    'vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V30:
    'HET GEDATEERDE V30-CORPUS. Bevroren toen de v2-POORTREFERENTIE nog op het ketenraster ' +
    'oordeelde en dus blind was onder de verre-veldbodem: deze netlists PASSEERDEN M-B/|Z| in ' +
    'hun eigen run en missen de vloer zodra je ze meet zoals het paneel het doet, over de ' +
    'volle gemeten impedantiesweep (casusboek V32). Sinds V32 oordeelt elke elektrische poort ' +
    'op die sweep, dus dit kan niet meer gebeuren; deze tien blijven staan als de ' +
    '"voor"-helft van die vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V28:
    'HET GEDATEERDE V28-CORPUS. Bevroren VOOR de vloer een ZOEKDOEL was: de tuner kende hem ' +
    'als veto plus een reparatiepas achteraf, en die reparatie is op alle vijftien kandidaten ' +
    'afgegaan en op alle vijftien mislukt (casusboek V30). Deze tien blijven staan als de ' +
    '"voor"-helft van de V30-vergelijking — hun opvolgers met de vloer als zoekdoel staan ' +
    'onder kandidaten.KAND_V2_* en halen de vloer wel. Meetobject, GEEN ontwerp: mag niet ' +
    'gebouwd worden.',
};

const exceptionReason = (key: string, atHz: number | null): string => {
  if (DATED_KAND.test(key)) {
    const prefix = key.replace(/_KAND_\d+$/, '');
    return (
      DATED_REASON[prefix] ??
      `HET GEDATEERDE ${prefix}-CORPUS, EN NIEMAND HEEFT OPGESCHREVEN WAAROM HET BEWAARD IS. ` +
        'Een gedateerd corpus is een meetobject en geen ontwerp, dus het mag onder de vloer ' +
        'staan — maar welke bevinding het de "vóór"-helft van is, is het hele punt van bewaren. ' +
        'Zet die reden in DATED_REASON in scripts/record-casus1-v2-references.ts.'
    );
  }
  /* SINDS V32 IS DIT GEVAL EEN ECHTE TEGENSPRAAK EN GEEN RASTERVERSCHIL MEER.
   *
   * Tot V32 stond hier de uitleg dat de poort in de run op het ketenraster
   * oordeelde (200 Hz en hoger) terwijl deze meting de volle sweep leest, en
   * dat de twee daarom legitiem konden verschillen. Die uitleg is vervallen:
   * poort en paneel lezen sinds V32 dezelfde sweep op dezelfde resolutie, uit
   * dezelfde functie (`impedanceReferenceFrom`). Een LEVENDE netlist die hier
   * belandt is dus geen twee-rasters-verhaal maar een bevinding die uitgezocht
   * moet worden — en de zin zegt dat, in plaats van een verklaring aan te
   * bieden die niet meer klopt. */
  const belowChainGrid = atHz !== null && atHz < CHAIN_GRID_LO_HZ;
  return (
    'BEVROREN MET DE VLOER ALS ZOEKDOEL, EN DE POORT IN DE RUN LIET HEM DOOR — en dat hoort ' +
    'sinds V32 NIET MEER TE KUNNEN. Poort en paneel lezen dezelfde gemeten impedantiesweep, op ' +
    'dezelfde resolutie, uit dezelfde functie (`impedanceReferenceFrom`); een verschil kan dus ' +
    'niet meer aan twee rasters liggen. ' +
    (belowChainGrid
      ? `Het minimum ligt op ${atHz!.toFixed(0)} Hz, onder de ketenrasterbodem van ` +
        `${CHAIN_GRID_LO_HZ.toFixed(0)} Hz — precies het gebied waar V32 over ging. Als deze ` +
        'regel er staat, is de V32-reparatie niet aangekomen op het pad dat deze netlist ' +
        'opwekte: zoek dat uit voordat je de netlist beoordeelt.'
      : `Het minimum ligt op ${atHz === null ? 'onbekende hoogte' : `${atHz.toFixed(0)} Hz`}, ` +
        'binnen het ketenraster, dus ook de oude V32-verklaring dekt het niet. Zoek dit geval ' +
        'apart uit.') +
    ' Mag niet gebouwd worden zolang deze regel er staat.'
  );
};

let leaves = 0;
for (const key of keys) {
  const rep = report(key);
  const pt = rep.system.phaseTracking;
  const block: Record<string, unknown> = {
    klasse: 'B',
    afhankelijkheid: 'meting+netlist',
    klasse_toelichting:
      `Metrieken op de VASTE netlist manifest_en_geometrie.netlists.${key}, een BESTAND in ` +
      'test-fixtures/casus1/. Het netwerk komt uit een v2-run (zie manifest_en_geometrie.' +
      'v2_herkomst), maar de referentie hangt aan het bestand en niet aan die run — precies ' +
      'zoals de drie v1-kandidaten. Daarom klasse B en geen klasse C.',
    minZ: r2(rep.metrics.epdr?.minZOhm),
    minEPDR: r2(rep.metrics.epdr?.minOhm),
    dissipatie_pct: r0((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    /* V36 — de WATT in de grootste enkele weerstand, bij het aangenomen
     * vermogen. Naast de fractie en niet in plaats ervan: de fractie zegt
     * hoeveel van de versterker het filter opeet, dit zegt of het onderdeel
     * bestaat. De drie v1-kandidaten dragen dit veld sinds F1 (`R8_W_bij_100W`
     * / `grootste_R_W_bij_100W`); het v2-corpus droeg alleen de fractie, en
     * daardoor stond een ontwerp met 23 % dissipatie in het casusboek zonder
     * dat ergens te lezen was dat er 17,9 W in één weerstand zit. */
    grootste_R_W_bij_100W: r2(
      rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null,
    ),
    Qes_mult: r2(rep.metrics.thevenin.find((t) => t.qMultiplier !== null)?.qMultiplier ?? null),
    lf_bult_extra_dB: r2(rep.metrics.lfBump[0]?.result.extraDb ?? null),
    V_tweeter_op_fs_dB: r2(
      rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db ?? null,
    ),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    wm_fase_oct: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mt_fase_oct: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
  };
  leaves += Object.keys(block).length - 3; // klasse, afhankelijkheid, toelichting are bookkeeping
  (raw.kandidaten as Record<string, unknown>)[key] = block;

}

/* The floor walk, over EVERY netlist the manifest names — see the note above. */
if (statedFloorOhm !== null) {
  for (const key of Object.keys(netlists)) {
    const epdr = report(key).metrics.epdr;
    const zMin = epdr?.minZOhm ?? null;
    const atHz = epdr?.minZAtHz ?? null;
    // The one comparison rule, asked rather than re-implemented — the whole
    // reason `impedanceFloor.ts` exists (A3g).
    if (zMin === null || !meetsAmpFloor(zMin, statedFloorOhm)) {
      floorExceptions.push({
        netlist: key,
        minZ_ohm: r2(zMin),
        minZ_bij_hz: atHz === null ? null : Number(atHz.toFixed(1)),
        gestelde_vloer_ohm: statedFloorOhm,
        reden: exceptionReason(key, atHz),
      });
    }
  }
}

/* ---- V33: HOW FAR THE BARRIER'S GRID READS FROM THE GATE'S ---------------
 *
 * DOCUMENTATION, and the number that justifies a decision. The v2 route aims
 * the amp-load barrier at the tuner's own full-band safety grid (240 points)
 * while `M-B/|Z|` enforces on the drivers' measured sweeps (1600). Same reader,
 * same extent, different resolution — so the substitution stands or falls on
 * how far apart the two read, and that is a measurement rather than a claim.
 * `frozenNetlistGates.test.ts` holds it against `ampFloorSlackOhm`; this writes
 * it down so a reader of the case book does not have to run a test to see it.
 *
 * Derived, never typed: it moves when the corpus moves. */
const barrierGrids = (() => {
  if (statedFloorOhm === null) return null;
  const gridded = casus1ChainInput(manifest, files, golden);
  const facts = casus1V2Facts(report('HUIDIG'), manifest, files);
  const ref = impedanceReferenceFrom(
    Object.fromEntries(
      Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [
        m,
        { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz },
      ]),
    ),
  );
  if (!ref) return null;
  const rows = Object.keys(netlists).map((key) => {
    const netlist = casus1Filter(key, manifest, files, golden).netlist;
    const onSweep = systemMinImpedanceOhm(netlist, ref.grid, ref.driverZ);
    const onSafety = systemMinImpedanceOhm(netlist, gridded.safety.freqs, gridded.safety.z);
    return {
      netlist: key,
      poortraster_ohm: r4(onSweep),
      barriereraster_ohm: r4(onSafety),
      verschil_ohm: onSweep === null || onSafety === null ? null : r4(Math.abs(onSweep - onSafety)),
      zelfde_oordeel:
        meetsAmpFloor(onSweep, statedFloorOhm) === meetsAmpFloor(onSafety, statedFloorOhm),
    };
  });
  const live = rows.filter((r) => LIVE_V2.test(r.netlist) || ['HUIDIG', 'KAND_A', 'KAND_B'].includes(r.netlist));
  const worstLive = live.reduce((a, b) => ((b.verschil_ohm ?? 0) > (a.verschil_ohm ?? 0) ? b : a), live[0]);
  const worstAll = rows.reduce((a, b) => ((b.verschil_ohm ?? 0) > (a.verschil_ohm ?? 0) ? b : a), rows[0]);
  return {
    _:
      'DOCUMENTATIE (V33). De barrièreterm mikt op het VEILIGHEIDSRASTER van de tuner, de poort ' +
      'M-B/|Z| oordeelt op de gemeten SWEEP. Zelfde functie (`minImpedanceAt`), zelfde ' +
      'uitgestrektheid, andere resolutie — dus het verschil tussen de twee is wat die keuze ' +
      'rechtvaardigt, en het wordt gemeten in plaats van beweerd.',
    barriereraster: {
      punten: gridded.safety.freqs.length,
      van_hz: Number(gridded.safety.freqs[0].toFixed(1)),
      tot_hz: Number(gridded.safety.freqs[gridded.safety.freqs.length - 1].toFixed(0)),
    },
    poortraster: {
      punten: ref.grid.length,
      van_hz: Number(ref.grid[0].toFixed(1)),
      tot_hz: Number(ref.grid[ref.grid.length - 1].toFixed(0)),
    },
    vloerspeling_ohm: r4(ampFloorSlackOhm(statedFloorOhm)),
    grootste_verschil_levend: worstLive ?? null,
    grootste_verschil_hele_casusboek: worstAll ?? null,
    oordeel_wijkt_af_op: rows.filter((r) => !r.zelfde_oordeel).map((r) => r.netlist),
    regel:
      'Elke LEVENDE netlist leest op beide rasters binnen de vloerspeling, en op ELKE bevroren ' +
      'netlist vellen de twee rasters hetzelfde oordeel over de gestelde vloer. Het eerste is ' +
      'de rechtvaardiging, het tweede is wat er werkelijk toe doet — beide staan als assert in ' +
      'frozenNetlistGates.test.ts.',
    per_netlist: rows,
  };
})();

raw.manifest_en_geometrie.v33_barriere_raster = barrierGrids;

/* ---- V36: WHAT THE CORPUS BURNS, AND WHAT THE OBJECTIVE MAKES OF IT ------
 *
 * DOCUMENTATION, in the shape `v33_barriere_raster` established: a number that
 * justifies a decision, derived from the files rather than typed, so it moves
 * when the corpus moves.
 *
 * TWO HALVES, and they answer two different questions.
 *
 *   `per_netlist` — what M-A measures: the share of amplifier power burnt in
 *   the discrete resistors, and the WATTS in the largest single one. The
 *   fraction was already in every candidate block; the watts were not, and a
 *   corpus whose designs put 15 to 29 W into one resistor recorded only "23 %".
 *
 *   `objectiefterm` — what the SEARCH makes of the same quantity. The tuner
 *   adds `dissipationWeight · (R_source/x)²` at every evaluation. V34 moved the
 *   probe the numerator is read at, and this records where the term landed on
 *   each grid.
 *
 * V37 — AND WHAT `x` IS, which is the third arm. V36 recorded
 * `noemer_is_R_e: false` as a finding it raised and did not fix: `x` was the
 * real part of the impedance AT the probe, and since V34 that probe sits on the
 * woofer's impedance PEAK, so the denominator was the peak height and not the
 * DC resistance the ratio is named after. V37 fixes it on the v2 route, so this
 * block now records two denominators by name — `noemer_default` (what a v1 run
 * still divides by, unchanged) and `noemer_v2_route` — with `term_op_R_e`
 * beside the two probe arms. The control is `Qes_mult`, one column along: the
 * M-E metric computes `1 + R_source/R_e` on the same R_e, so the recorded ratio
 * and the recorded multiplier have to agree by definition.
 */
const dissipationRecord = (() => {
  const gridded = casus1ChainInput(manifest, files, golden);
  const dissW = (CASUS1_V2_SETTINGS as { dissipationWeight: number }).dissipationWeight;
  /** De OPGELOSTE R_e van de laagste weg, zoals de worker hem meedraagt.
   *  Uit `factsForWorker` en niet uit een constante hier: de v2-route deelt
   *  sinds V37 door precies dit getal, en een tweede exemplaar ervan in dit
   *  script zou een tweede mening zijn over een hiërarchie die er met opzet
   *  één implementatie heeft (F4b lek 1). */
  const resolvedRe = casus1V2Facts(report('HUIDIG'), manifest, files).reOhmByModel?.woofer ?? null;
  const armOf = (
    parts: readonly VxpPart[],
    grid: readonly number[],
    z: Record<string, readonly Complex[]>,
    edgeRule: 'first' | 'both',
    /** `null` = de historische noemer, `Re(Z)` bij de probe zelf (V37: de
     *  default, en dus wat elke v1-run leest). Anders: de gestelde R_e. */
    denomOhm: number | null = null,
  ) => {
    const zl = z.woofer;
    if (!zl) return null;
    const probe = sourceProbeIndex(grid, zl, undefined, edgeRule);
    if (!probe || !probe.inBand) return null;
    const rs = sourceResistanceOhm(parts, { grid, driverZ: z, edgeRule });
    if (rs === null) return null;
    const den = denomOhm ?? Math.max(0.5, zl[probe.idx].re);
    const ratio = rs / den;
    return {
      hz: Number(grid[probe.idx].toFixed(1)),
      r_source_ohm: r4(rs),
      noemer_ohm: r2(den),
      ratio: r4(ratio),
      term: Number((dissW * ratio * ratio).toPrecision(4)),
    };
  };
  const perNetlist = Object.keys(netlists).map((key) => {
    const rep = report(key);
    const d = rep.metrics.dissipation;
    const largest = d?.elements.find((e) => !e.parasitic) ?? null;
    /* De ONDERDELEN, van schijf. `casus1Filter` levert een netlist en geen
     * onderdelenlijst, en `scripts/` valt buiten `tsc -b` (zie tsconfig.json:
     * de test-scope dekt `src/**`), dus deze verwisseling kwam niet als
     * typefout maar als een kolom vol `null` terug. */
    const parts = deserializeFilter(
      readFileSync(join(HERE, '..', 'test-fixtures', 'casus1', netlists[key]), 'utf-8'),
    ).parts;
    return {
      netlist: key,
      dissipatie_pct: r2((d?.totalFraction ?? NaN) * 100),
      grootste_R: largest ? largest.id : null,
      grootste_R_ohm: r2(largest?.ohm ?? null),
      grootste_R_W_bij_100W: r2(largest?.watts ?? null),
      Qes_mult: r2(rep.metrics.thevenin.find((t) => t.qMultiplier !== null)?.qMultiplier ?? null),
      term_ketenraster: armOf(parts, gridded.grid, gridded.driverZ, 'first'),
      term_veiligheidsraster: armOf(parts, gridded.safety.freqs, gridded.safety.z, 'both'),
      /* V37 — dezelfde probe, dezelfde teller, de GESTELDE noemer. Dit is wat
       * de v2-route sinds V37 werkelijk optelt; de twee armen erboven zijn de
       * default en de toestand vóór V34. */
      term_op_R_e:
        resolvedRe === null
          ? null
          : armOf(parts, gridded.safety.freqs, gridded.safety.z, 'both', resolvedRe),
    };
  });
  const live = perNetlist.filter((r) => LIVE_V2.test(r.netlist));
  return {
    _:
      'DOCUMENTATIE (V36). Wat het corpus verstookt, en wat de doelfunctie daarvan merkt. ' +
      'Afgeleid uit de bestanden en uit de probe waarop de tuner leest; geen acceptatiewaarde ' +
      'op zichzelf — de acceptatie zit in kandidaten.*.dissipatie_pct en ' +
      '.grootste_R_W_bij_100W, en in frozenNetlistGates.test.ts.',
    aangenomen_vermogen_W: 100,
    dissipationWeight: dissW,
    dissipationWeight_herkomst:
      'GRIJS (A3j). Overgenomen uit v1 en expliciet gesteld door de kandidaat — nooit stil ' +
      'geërfd, nooit v2-afgeleid. De waarde is de app-standaard 0,05 en V36 heeft haar niet ' +
      'aangeraakt: een gewicht bijstellen om een verkeerd gemeten grootheid te compenseren is ' +
      'de fout twee keer maken.',
    R_e_woofer_ohm: CASUS1_WOOFER_DC_OHM,
    R_e_woofer_opgelost_ohm: r4(resolvedRe),
    R_e_herkomst:
      'De OPGELOSTE R_e die factsForWorker meedraagt, uit de A5c.1-hiërarchie. Op casus 1 is ' +
      'dat de meterlezing van het wooferpaar, dus hetzelfde getal als R_e_woofer_ohm — en dat ' +
      'zij samenvallen is een assert en geen aanname (frozenNetlistGates.test.ts): één R_e, één ' +
      'herkomst, sinds V37 drie lezers (M-E, de Q_es-inversie, de doelfunctieterm).',
    noemer_default: 'Re(Z) bij de probe',
    noemer_default_waarom:
      'Wat de term altijd al deelde, en sinds V37 de DEFAULT van ' +
      '`dissipationReferenceSource`. Een v1-run leest hem nog byte-identiek. Het is de ' +
      'impedantie van de laagste weg BIJ de probe, en sinds V34 zit die probe op de ' +
      'impedantiepiek — dus de piekhoogte en niet de DC-weerstand waarnaar de verhouding ' +
      'genoemd is.',
    noemer_v2_route: 'de opgeloste R_e',
    noemer_v2_route_waarom:
      'V37. De term bestaat om de serie-R-route naar niveauregeling af te remmen, en de schade ' +
      'die zij aanricht is Q_es-vermenigvuldiging: 1 + R_source/R_e, met R_e de DC-weerstand ' +
      '(A3j rij 23, A4 M-E). De kandidaat stelt daarom `dissipationReferenceSource: re` en de ' +
      'worker draagt de opgeloste R_e over. Geen terugval: zonder opgeloste R_e is er geen ' +
      'verhouding en meldt de run welke invoer ontbrak.',
    grootste_termaandeel_levend: live.reduce(
      (a: number, r) => Math.max(a, r.term_veiligheidsraster?.term ?? 0),
      0,
    ),
    grootste_termaandeel_levend_op_R_e: live.reduce(
      (a: number, r) => Math.max(a, r.term_op_R_e?.term ?? 0),
      0,
    ),
    per_netlist: perNetlist,
  };
})();

raw.manifest_en_geometrie.v36_dissipatie = dissipationRecord;

raw.manifest_en_geometrie.v2_herkomst = {
  _:
    'DOCUMENTATIE, geen acceptatiewaarde. Waar de KAND-V2-netlists vandaan komen, zodat een ' +
    'lezer ze kan herleiden en desgewenst opnieuw kan opwekken. Niets in dit blok wordt ' +
    'geassert als getal; wat WEL acceptatie is, zijn de metrieken op de bestanden zelf ' +
    '(kandidaten.KAND_V2_*, klasse B) en de reproductie door de echte route ' +
    '(casus1V2Candidates.test.ts).',
  bestand: HERKOMST_FILE,
  gegenereerd_op_commit: herkomst.gegenereerd_op_commit,
  seed: herkomst.seed,
  run_vingerafdruk: herkomst.run_vingerafdruk,
  generator: 'scripts/generate-casus1-v2-candidates.ts',
  /* De opstelling staat hier VERBATIM naast de vingerafdruk en niet alleen in
   * het herkomstbestand ernaast. Controle 2 van de F4d-nazorg vroeg precies
   * dat: elk v2_herkomst-blok noemt zelf welke synthese, welke poorten en
   * welke budgetten gewapend waren. Een blok dat daarvoor naar een ander
   * bestand wijst, laat de lezer die het niet opent met de aanname zitten. */
  meetopstelling: herkomst.meetopstelling,
  /* V30 — welke bevroren netlists de GESTELDE vloer niet halen, en waarom ze
   * er desondanks nog staan. Afgeleid, niet getypt: de lijst volgt uit de
   * metrieken op de bestanden en uit `meetsAmpFloor`, dus hij kan niet
   * verouderen zonder dat de metrieken meebewegen. */
  gestelde_vloer_ohm: statedFloorOhm,
  vloeruitzonderingen: floorExceptions,
  vloeruitzonderingen_regel:
    'Elke bevroren netlist haalt de gestelde vloer, OF staat in deze lijst met zijn reden. ' +
    'frozenNetlistGates.test.ts dwingt precies dat af: een netlist die hem niet haalt en hier ' +
    'niet staat, breekt de suite. De lijst is dus geen vrijstelling maar een boekhouding, en ' +
    'zij hoort leeg te raken.',
  kosten:
    `${keys.length} ketenruns. TOT V33 gemeten op 44-73 s per kandidaat; SINDS V33 op het ` +
    'VEILIGHEIDSRASTER, en dat is de prijs van die reparatie: de barrièreterm lost het netwerk ' +
    'bij ELKE objectief-evaluatie op op het raster van zijn bron in plaats van op het ' +
    'gedecimeerde evaluatieraster. Nagemeten op één kandidaat, de twee uitersten: 44,0 s tegen ' +
    '669,8 s op de volle sweep, bij vrijwel hetzelfde aantal evaluaties (88 008 tegen 86 399). ' +
    'Daarom een script en geen test — en daarom is de bron een KEUZE-sleutel. GEMETEN BIJ V37 ' +
    'over het hele veld: 115-223 s per kandidaat, 40 minuten wandkloktijd, dezelfde orde als de ' +
    '41 minuten van V34 — V37 verandert een deling en geen raster, dus de prijs van de barrière ' +
    'is onveranderd.',
  reproduceerbaarheid:
    'Nagemeten bij de F4d-nazorg: het script opnieuw draaien op dezelfde commit levert de ' +
    'netlists BYTE-IDENTIEK terug, op het `savedAt`-stempel van de serialisatie na. Dat ' +
    'stempel is het enige niet-deterministische veld in deze bestanden, en het staat in de ' +
    'kop en niet in de onderdelen.',
};

const telling = (raw.classificatie as Record<string, Record<string, unknown>>).telling;
const datedSummary = [...datedByCorpus.entries()]
  .sort()
  .map(([prefix, ks]) => `${ks.length}x \`${prefix}_KAND_*\``)
  .join(', ');
telling.sinds_V37 =
  'V37 (28-08-2026): het KAND-V2-corpus is opnieuw opgewekt nadat de DISSIPATIETERM door de ' +
  'opgeloste R_e ging delen in plaats van door de piekhoogte. De term heet (R_source/R_e)^2 en ' +
  'deelde door Re(Z) BIJ de bronweerstandsprobe, die sinds V34 op de impedantiepiek van het ' +
  'wooferpaar zit: 19,31 Ohm tegen een gemeten R_e van 3,05 Ohm, een factor die tot 40,1 ' +
  'kwadrateert. De controle is de referentie zelf — 1 + R_source/R_e reproduceert ' +
  'kandidaten.*.Qes_mult op elke bevroren netlist binnen exponent_pct, en de piekhoogte niet. ' +
  `Het vervangen corpus is hernoemd tot V34_KAND_*; gedateerde corpora nu: ${datedSummary}. ` +
  'Nog steeds NUL klasse C.';
telling.sinds_V33 =
  'V33 (27-08-2026): het KAND-V2-corpus is opnieuw opgewekt nadat de amp-vloerbarrière — de term ' +
  'die de zoektocht naar de vloer duwt — zijn tekort op de GEMETEN IMPEDANTIESWEEP ging lezen in ' +
  'plaats van op het evaluatieraster, via dezelfde functie waarmee M-B/|Z| oordeelt. Doel en ' +
  'poort zien daarmee per constructie één getal — het levende corpus over het veiligheidsraster ' +
  'van de tuner, met een tweede, duurdere arm ernaast die over de volle sweep draaide. Corpora ' +
  `die vervangen zijn worden NIET weggegooid maar hernoemd: ${datedSummary} — byte-identieke ` +
  'bestanden onder een gedateerde naam, met dezelfde tien metrieken en dezelfde klasse B. Nog ' +
  'steeds NUL klasse C.';
telling.sinds_V32 =
  'V31/V32 (27-08-2026): het KAND-V2-corpus is opnieuw opgewekt nadat de elektrische poorten op ' +
  'de gemeten impedantiesweep gingen oordelen in plaats van op het ketenraster (V32), en nadat ' +
  'een kandidaat wiens tune in zijn geheel geweigerd werd zijn zaad niet meer als ontwerp ' +
  `aflevert (V31). Het corpus dat het verving is opnieuw NIET weggegooid maar hernoemd: ` +
  `${(datedByCorpus.get('V30') ?? []).length} blokken \`V30_KAND_*\`, byte-identieke bestanden onder een gedateerde naam, ` +
  'met dezelfde tien metrieken en dezelfde klasse B. Er staan nu dus twee gedateerde corpora ' +
  'naast het levende: V28 (vóór de vloer een zoekdoel was) en V30 (vóór de poort de volle sweep ' +
  'las). Nog steeds NUL klasse C: het zijn metrieken op bestanden.';
telling.sinds_V30 =
  `V30 (27-08-2026): het KAND-V2-corpus is opnieuw opgewekt met de gestelde vloer als ZOEKDOEL, ` +
  `en het corpus dat het vervangt is niet weggegooid maar hernoemd: ${(datedByCorpus.get('V28') ?? []).length} blokken ` +
  '`V28_KAND_*`, byte-identieke bestanden onder een gedateerde naam, met dezelfde tien metrieken ' +
  'en dezelfde klasse B. Dat is geen referentie aanpassen — het zijn dezelfde netlists, en de ' +
  'nieuwe staan ernaast in plaats van eroverheen, zodat de vóór/ná-vergelijking van deze entry ' +
  'reproduceerbaar blijft uit de repository zelf. De bevinding van F4a staat nog steeds: NUL ' +
  'klasse C. Wat wél veranderde is de uitzonderingslijst: zij noemde tien KAND-V2-netlists en ' +
  'noemt nu tien V28-KAND-netlists, want het nieuwe corpus haalt de vloer op eigen kracht.';
telling.sinds_F4d =
  `F4d (27-08-2026), herzien bij de F4d-nazorg (V28) en bij V36: ${leaves} klasse-B-bladeren, ` +
  `elf metrieken op elk van de ${keys.length} bevroren KAND-V2-netlists — tien tot V36 ` +
  '`grootste_R_W_bij_100W` toevoegde, het veld dat de drie v1-kandidaten sinds F1 dragen en het ' +
  `v2-corpus niet. Het waren er negen tot de nazorg de ` +
  'F3c-uitsnijding opschortte; de mid→tweeter-as ging van drie posities naar vijf en het veld van ' +
  'negen naar vijftien. De F4a-momentopname hierboven wordt niet bijgewerkt, om dezelfde reden ' +
  'als bij V20 — een momentopname die met elke oplevering meebeweegt is er geen. De bevinding ' +
  'blijft: nog steeds NUL klasse C. Deze netwerken komen uit een v2-run, maar de referenties ' +
  'hangen aan de BESTANDEN, en een volgende run die andere netwerken oplevert verschuift deze ' +
  'getallen dus niet — hij levert andere bestanden op. Dat is bij de nazorg ook precies wat ' +
  'gebeurde, en het is de reden dat de verandering geen enkele referentie ONGELDIG maakte.';

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`, 'utf-8');
console.log(`wrote ${keys.length} class-B blocks (${leaves} leaves) to ${GOLDEN}`);

/* ---- the comparison table, for the casebook -------------------------- */
/* THE DATED V28 CORPUS RIDES ALONG (V30).
 *
 * Three v1 baselines, then the ten netlists that were tuned while the stated
 * floor was only a veto, then the ten that were tuned with it as a search
 * goal. A table that showed only the survivors would answer "how good is the
 * new corpus" and hide the question this entry is actually about, which is
 * what the change to the objective DID. Rows, not a ranking: the block orders
 * nothing (A5e.1). */
const table = compareDesigns([
  { label: 'HUIDIG', origin: 'baseline', report: report('HUIDIG') },
  { label: 'KAND-A', origin: 'baseline', report: report('KAND_A') },
  { label: 'KAND-B', origin: 'baseline', report: report('KAND_B') },
  ...datedKeys.map((k) => ({
    label: k.replace(/_/g, '-'),
    origin: 'v2-candidate' as const,
    report: report(k),
  })),
  ...keys.map((k) => ({
    label: k.replace(/_/g, '-'),
    origin: 'v2-candidate' as const,
    report: report(k),
  })),
]);
const cell = (v: number | null, key: string) =>
  v === null ? '—' : v.toFixed(key === 'dissipationPct' ? 0 : 2);
/* THE FLOOR VERDICT AS ITS OWN COLUMN (V30).
 *
 * Deliberately a column and not a filter: the whole point of the comparison
 * block is that it ranks nothing and hides nothing, and a table that silently
 * dropped every design under the floor would answer a question nobody asked.
 * The verdict comes from `meetsAmpFloor` — the one comparison rule — so the
 * column and the gate can never disagree. */
const floorCell = (row: (typeof table.rows)[number]): string => {
  if (statedFloorOhm === null) return 'geen vloer gesteld';
  const z = row.cells.minZ?.value ?? null;
  if (z === null) return '—';
  return meetsAmpFloor(z, statedFloorOhm) ? '**ja**' : 'nee';
};
const floorTitle =
  statedFloorOhm === null
    ? 'vloer'
    : `haalt de gestelde vloer ${statedFloorOhm} Ω?`;
console.log(
  [
    `| ontwerp | ${table.columns
      .map((c) => `${c.title} (${c.unit})`)
      .join(' | ')} | ${floorTitle} |`,
    `|---|${table.columns.map(() => '---').join('|')}|---|`,
    ...table.rows.map(
      (row) =>
        `| ${row.label} | ${table.columns
          .map((c) => cell(row.cells[c.key].value, c.key))
          .join(' | ')} | ${floorCell(row)} |`,
    ),
  ].join('\n'),
);
