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
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1ExcursionSettings,
  casus1BuildabilityOnSearch,
  casus1BuildabilitySettings,
  casus1ContinuousPowerW,
  casus1MaxDriveOnFsDbByDriver,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1LfResonantBudgetDb,
  casus1Manifest,
  casus1MaxDriveOnFsDb,
  casus1QesMultiplierMax,
  loadGolden,
  type GoldenRefs,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { LF_BUMP_VERSION } from '../src/lib/engine2/metrics/acoustic.ts';
import { RESISTIVE_EQUIVALENT_VERSION } from '../src/lib/engine2/metrics/resistiveEquivalent.ts';
import { PHASE_INTEGRATION_VERSION } from '../src/lib/engine2/metrics/phaseIntegration.ts';
import { PHASE_ADMISSION_VERSION } from '../src/lib/phaseAdmission.ts';
import { BUILDABILITY_VERSION } from '../src/lib/engine2/metrics/buildability.ts';
import { LEVEL_WORK_VERSION, levelWorkOnNetlist, levelWorkVerdict, seriesInductanceByWay, seriesRMaxOhmOf } from '../src/lib/levelWork.ts';
import { casus1ThermalDesignPowerW } from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_LEVEL_WORK_SETTINGS } from '../src/lib/engine2/casus1V2.fixture.ts';
import { DRIVE_EXCURSION_VERSION, derivedDriveLimitDb } from '../src/lib/engine2/metrics/driveExcursion.ts';
import { compareDesigns } from '../src/lib/engine2/predesign/comparison.ts';
import { ampFloorSlackOhm, meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { busTopology, systemMinImpedanceOhm } from '../src/lib/netOptimizer.ts';
import { impedanceReferenceFrom } from '../src/lib/engine2/optimizer/impedanceReference.ts';
import { sourceProbeIndex, sourceResistanceOhm } from '../src/lib/partAudit.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_EXCURSION,
  CASUS1_V2_GRID,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1V2Facts,
  CASUS1_TARGET_CURVE,
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

/* V50 — the continuous power from its one home; the literal 100 is gone. */
const CONTINUOUS_POWER_W = casus1ContinuousPowerW(golden);
const POWER = CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CONTINUOUS_POWER_W } : {};
/* V50 — the stated M-C figure per way (tweeter only on casus 1). */
const DRIVE_BY_WAY = casus1MaxDriveOnFsDbByDriver(golden);
const DRIVE_PER_WAY = Object.keys(DRIVE_BY_WAY).length > 0 ? { maxDriveOnFsDbByDriver: { ...DRIVE_BY_WAY } } : {};
/* V50 — the buildability inputs, spread into every report so M-A/part judges. */
const BUILDABILITY = casus1BuildabilitySettings(golden);

const report = (key: string) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: {
      ...POWER,
      ...DRIVE_PER_WAY,
      ...BUILDABILITY,
      /* V51 — the wiring per way and the level-work requirement, so the report's
       * level-work block is recorded with the same inputs the guards read. */
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      /* V49 — the excursion inputs, so every recorded M-C verdict carries the
       * limit the report actually judged on (stated or derived, whichever is
       * stricter). Same manifest, same reader as the guards. */
      ...CASUS1_EXCURSION,
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
  V51:
    'HET GEDATEERDE V51-CORPUS. Bevroren vóór V51b, toen de LAAGSTE weg GEEN niveauwerk mocht dragen ' +
    '(geen serie-R, geen shunt-pad; alleen spoel-DCR bleef): van vijftien kandidaten overleefde er EEN ' +
    '(466,5 · 1719, min |Z| 2,57 Ohm binnen de meettolerantie), dertien strandden op de versterkervloer ' +
    '(geweigerde tunes 2,05-2,49 Ohm tegen 2,60) en een op de mid-excursiegrens - zonder wooferpad ontbrak ' +
    'de serieweerstand die de impedantiebodem boven de vloer hield, want in het overnamegebied geleiden ' +
    'woofer- en midtak tegelijk. Bij V51b stelt Sander de gestelde variant: serieweerstand op de laagste ' +
    'weg toegestaan tot 1,0 Ohm TOTAAL (discrete R plus spoel-DCR, DCR-schaal), geen L-pad en geen ' +
    'shunt-pad, en laat het veld opnieuw opwekken. Bewaard als de "vóór"-helft van de V51b-vergelijking. ' +
    'Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V50:
    'HET GEDATEERDE V50-CORPUS. Bevroren vóór V51, toen de LAAGSTE weg nog niveauwerk mocht dragen: ' +
    'het anker is de mid, het wooferpaar staat er in het overnamegebied 3-5 dB boven, en élke ' +
    'geleverde netlist betaalde dat verschil in een serieweerstand in het wooferpad - 13,6 tot ' +
    '34,9 W in een enkele weerstand bij 100 W continu (V50), zoals HUIDIG met R8 (25,5 W). Bij V51 ' +
    'stelt Sander dat de laagste weg GEEN niveauwerk draagt (geen serie-R, geen shunt-pad; de ' +
    'vuistregel: nooit een pad op de woofer), wapent de weerstandseis op de zoektocht bij een ' +
    'thermisch ontwerpvermogen van 10 W, en laat het veld opnieuw opwekken - een kandidaat die ' +
    'zijn rimpeldoel zonder wooferpad niet haalt komt dan terug als verwerping met het getal X ' +
    'erbij (hoeveel niveauwerk de configuratie vraagt). Onderdeel-voor-onderdeel identiek aan het ' +
    'V49-corpus (V50 wekte opnieuw op en het veld bewoog niet), en bewaard als de "vóór"-helft van ' +
    'de V51-vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  V49:
    'HET GEDATEERDE V49-CORPUS. Bevroren vóór V50, toen de gestelde M-C-grens nog EEN getal voor ' +
    'elke hoogdoorlaatbeschermde weg was (-20,0 dB, V47b): de mid werd op een dome-conventie ' +
    'geoordeeld (thermiek en vervorming rond f_s, wat M-C v2.0 niet modelleert) terwijl haar ' +
    'faalmechanisme excursie is en die sinds V49 AFGELEID wordt - op dit veld -14,5 tot -10,8 dB. ' +
    'Drie van acht V47b-kandidaten met de mid rond -15 dB werden zo geweigerd terwijl de excursie ' +
    'ze toeliet. V49 heeft dit corpus NIET opnieuw opgewekt (de afgeleide grens beet nergens), dus ' +
    'dit is het V47b-veld onder de V49-vingerafdruk. Bovendien was BOUWBAARHEID nog nergens een ' +
    'poort: het vermogen per weerstand (13,6-34,9 W in een enkele weerstand bij 100 W continu) en ' +
    'de piekstroom per spoel stonden als kolom en oordeelden niets. Bij V50 wordt de tweetereis ' +
    'per weg gesteld (mid leeg: alleen afgeleid), M-A/part en M-L komen als poorten, en de ' +
    'weerstandseis blijkt op deze casus door geen enkel bekend ontwerp gehaald te worden (HUIDIG ' +
    'factor vijf). Zij blijven staan als de "voor"-helft van de V50-vergelijking. Meetobject, ' +
    'GEEN ontwerp: mag niet gebouwd worden.',
  V48:
    'HET GEDATEERDE V48-CORPUS. Bevroren toen de tweeteraandrijfgrens nog op -25,0 dB stond: de ' +
    'toevallige waarde van HUIDIG op een decimaal (-25,084), met 0,084 dB marge. Dat maakte het ' +
    'eigen referentiefilter van de ontwerper de maat, en het maakte de eis breekbaar: een hermeting ' +
    'van HUIDIG na inspelen die f_s of het doorlaatniveau een tiende dB verplaatst, veroordeelt het ' +
    'ontwerp waaruit de eis is afgeleid. En zij weigerde kandidaten die de 18-dB-industrieregel op ' +
    'f_s ruim halen: vier V47-weigeringen tussen -21,8 en -23,5 dB. Bij V47b is de eis VOORLOPIG op ' +
    '-20,0 gezet (18 dB plus 2 dB marge voor f_s-drift), tot M-C excursie-gedragen is (V49). Zij ' +
    'blijven staan als de "vóór"-helft van de V47b-vergelijking. Meetobject, GEEN ontwerp: mag ' +
    'niet gebouwd worden.',
  V47:
    'HET GEDATEERDE V47-CORPUS. Bevroren toen het A5d.6-plafond op de seriespoel van de laagste ' +
    'weg nog EENMALIG werd opgelost, bij de padweerstand van het ZAAD, en daarna vaststond voor ' +
    'de hele tune — terwijl de tune diezelfde padweerstand verplaatst. V45 schreef dat op als ' +
    'open punt en beredeneerde het als veilig: meer serieweerstand dempt de resonante helft, dus ' +
    'een plafond opgelost bij een LAGERE padweerstand is hoogstens te streng. Wat dat argument ' +
    'weglaat is de tune die de padweerstand VERLAAGT, en daar is het plafond TOEGEEFLIJK. ' +
    'Gemeten op Sanders browserrun van 01-09-2026: twee van negen kandidaten leverden 2,29 en ' +
    '1,61 dB opslingering tegen een gesteld budget van 1,4, en de geleverde-netwerk-toets van ' +
    'V45 ving ze allebei. Vangen is verliezen — dat waren legitieme kandidaten die met een ' +
    'plafond over hun EIGEN netwerk gestuurd hadden kunnen worden in plaats van aan het eind ' +
    'weggegooid. Zij blijven staan als de "vóór"-helft van de V48-vergelijking. Meetobject, ' +
    'GEEN ontwerp: mag niet gebouwd worden.',
  V45:
    'HET GEDATEERDE V45-CORPUS. Bevroren toen de TWEETERBESCHERMING nog uitsluitend RELATIEF ' +
    'bewaakt werd: de volle-band-veiligheidspoort van de tuner legde het beschermingstekort van ' +
    'het geleverde netwerk naast dat van het ZAAD (`protSqDb`, speling 3 dB-kwadraat) en casus 1 ' +
    'stelde geen enkele grens op M-C. Wat dat kostte is bij V47 aan BEIDE kanten gemeten, en de ' +
    'twee kanten wijzen tegengesteld. Zij weigerde vier van de vijftien kandidaten wholesale — ' +
    'en TERECHT, want die tunes meten absoluut -12,29 en -6,82 dB op hun slechtst beschermde weg ' +
    'tegen HUIDIG\'s -25,08. Maar zij LIET twee netlists door die in dit corpus staan, ' +
    'V45_KAND_5 op -14,38 dB en V45_KAND_6 op -15,10 dB, omdat hun zaad even slecht was: een ' +
    'regel die aan het zaad hangt bewaakt het toeval en niet de driver. Die twee drijven de ' +
    'tweeter op zijn resonantie tien dB harder aan dan het goedgekeurde ontwerp. Zij blijven ' +
    'staan als de "vóór"-helft van de V47-vergelijking. Meetobject, GEEN ontwerp: mag niet ' +
    'gebouwd worden.',
  V44:
    'HET GEDATEERDE V44-CORPUS. Bevroren vóór A5e.2 gesloten werd, en er ontbraken drie dingen ' +
    'tegelijk die alle drie over NIVEAUWERK gaan. (1) Het niveau-anker was het KALE gemeten ' +
    'niveau per weg: A5d.4(a) wil het ankerniveau NA baffle step in de beoogde opstelling en dat ' +
    'is het doelcurve-object, dat toen nog niet bestond — de wooferbudget las 0,89 dB waar hij ' +
    'sinds V45 1,33 leest en de tweeter 3,44 waar hij nu 2,82 leest. (2) De ZOEKTOCHT mat ' +
    'vlakheid tegen HORIZONTAAL terwijl het oordeel van A5e.1 al een doelcurve kon lezen, dus ' +
    'een ontwerp werd gezocht tegen vlak en geoordeeld tegen een plateau — en de zoektocht heeft ' +
    'het hele iteratiebudget. (3) Er was GEEN Q_es-vermenigvuldigingsgrens, dus de ' +
    'weerstandsvlucht die V43 mat was onbegrensd: dit corpus loopt tot 5,65 ohm padweerstand op ' +
    'de wooferweg (KAND_V2_5, Q_es maal 2,85) tegen een sinds V45 gestelde 2,4. Zij blijven ' +
    'staan als de "vóór"-helft van de V45-vergelijking. Meetobject, GEEN ontwerp: mag niet ' +
    'gebouwd worden.',
  V43:
    'HET GEDATEERDE V43-CORPUS. Bevroren terwijl de ZOEKTOCHT fase nog beoordeelde op elk ' +
    'rasterpunt waar de twee takken binnen 20 dB van ELKAAR lagen — een RELATIEVE toets, zonder ' +
    'knip op meetgeldigheid en zonder vloer onder de stille geest. Gemeten over het hele ' +
    'casusboek (V40/V44): die verzameling telde 1048 punten mee die de rapportmaat niet zag, ' +
    'waarvan 911 onder de meetgeldigheidsvloer die de meetbestanden ZELF in hun kop opgeven, en ' +
    '14 op punten waar BEIDE takken dood waren en het faseverschil dus uitsluitend van de filters ' +
    'kwam. Op V38FIX_KAND_5 las de tuner daardoor 59,15 graden waar het gedeelde deel 17,08 gaf. ' +
    'De eis `phase-tracking` en de faseterm in het objectief lazen allebei dat getal, dus deze ' +
    'zeven netlists zijn gezocht met een fasemaat die de luidspreker niet beschreef. Zij blijven ' +
    'staan als de "vóór"-helft van de V44-vergelijking. Meetobject, GEEN ontwerp: mag niet ' +
    'gebouwd worden.',
  V42:
    'HET GEDATEERDE V42-CORPUS. Bevroren terwijl het LF-bult-budget wel GESTELD was maar op de ' +
    'verkeerde GROOTHEID: op `extraDb`, de SOM van de brede resistieve lift en de smalle ' +
    'resonante opslingering. Twee gevolgen, allebei gemeten (V43). (1) De eis veroordeelde ' +
    'NIVEAUWERK mee: alle drie de referentiefilters overschreden haar terwijl hun spoelen niets ' +
    'toevoegden — HUIDIG 4,69 dB lift tegen −0,94 dB opslingering. (2) Boven ongeveer 1,5 ohm ' +
    'padweerstand was het budget op vóórdat er een spoel bestond, dus leverde de inversie GEEN ' +
    'grens en zweeg de eis op de helft van de ontwerpen. Deze vier zijn onderdeel voor onderdeel ' +
    'identiek aan V41_KAND_1, 3, 5 en 8 — het gestelde budget verwijderde bij V42 de helft van ' +
    'het veld en veranderde geen enkel ontwerp dat overbleef. Zij blijven staan als de ' +
    '"vóór"-helft van de V43-vergelijking. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
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
    /* V43 — dezelfde bult, ONTLEED. `lf_bult_extra_dB` blijft staan en is de
     * BRUG: de twee helften tellen per constructie tot hem op, dus een lezer
     * die de oude referentie kent kan de nieuwe twee natrekken zonder iets te
     * herberekenen. `lf_lift_dB` is wat de weerstand van dit netwerk in zijn
     * eentje aan het laag doet (het resistieve equivalent tegen de kale kast),
     * `lf_opslingering_dB` wat de reactanties daar bovenop leggen. */
    lf_lift_dB: r2(rep.metrics.lfBump[0]?.result.liftDb ?? null),
    lf_opslingering_dB: r2(rep.metrics.lfBump[0]?.result.resonantDb ?? null),
    V_tweeter_op_fs_dB: r2(
      rep.metrics.driveVoltage.find((d) => d.driver === 'tweeter')?.db ?? null,
    ),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb ?? null),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb ?? null),
    /* V44 — M-K, de fase-integratie op de TOEGELATEN punten. De naam is niet
     * veranderd en de grootheid wel: tot V43 was dit het gemiddelde over ±1
     * octaaf rond het kruispunt geknipt op meetgeldigheid. Die oude lezing
     * staat als CONTROLEKOLOM in de twee sleutels eronder, zodat een getal dat
     * bewoog te lezen is als een herdefinitie in plaats van als een regressie
     * (V15's vorm). */
    wm_fase_oct: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mt_fase_oct: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
    wm_fase_oct_octaafgeknipt_V43: r2(
      pt.find((p) => p.lower === 'woofer')?.control.octaveClipped.meanAbsDeg ?? null,
    ),
    mt_fase_oct_octaafgeknipt_V43: r2(
      pt.find((p) => p.lower === 'mid')?.control.octaveClipped.meanAbsDeg ?? null,
    ),
    wm_fase_overlapvenster_V43: r2(
      pt.find((p) => p.lower === 'woofer')?.control.overlapWindow.meanAbsDeg ?? null,
    ),
    mt_fase_overlapvenster_V43: r2(
      pt.find((p) => p.lower === 'mid')?.control.overlapWindow.meanAbsDeg ?? null,
    ),
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
    aangenomen_vermogen_W: CONTINUOUS_POWER_W,
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

/* ------------------------------------------------------------------ *
 * V43 — de LF-bult ONTLEED, over ELKE bevroren netlist
 * ------------------------------------------------------------------ */

/**
 * Dezelfde vorm en dezelfde reden als `v36_dissipatie`: de klasse-B-blokken
 * onder `kandidaten` dekken alleen het LEVENDE corpus (de gedateerde corpora
 * dragen hun eigen bevroren blokken en worden nooit herschreven — zij zijn
 * bewijsmateriaal), terwijl de claim over de ONTLEDING over het hele casusboek
 * gaat. Dit blok is afgeleid en geen invoer: elke rij komt uit `buildReport` op
 * het bestand, en `frozenNetlistGates.test.ts` herrekent hem.
 */
const decompositionRecord = {
  _:
    'V43 — `lfBump().extraDb` telt TWEE mechanismen bij elkaar op, en dit blok haalt ze uit ' +
    'elkaar op elke bevroren netlist. `lift_dB` is wat het RESISTIEVE EQUIVALENT van hetzelfde ' +
    'netwerk (zelfde topologie, zelfde waarden, elke reactantie vervangen door haar eigen ' +
    'serieweerstand: spoel -> DCR, condensator -> open) bovenop de kale kast tilt; ' +
    '`opslingering_dB` is wat de reactanties daar bovenop leggen. Per constructie tellen zij ' +
    'op tot `extra_dB` - alle drie de maxima worden in één pas over één band genomen - en dat ' +
    'is wat de oude extraDb-referenties tot de BRUG naar de nieuwe maakt. ' +
    'DE OPSLINGERING KAN NEGATIEF ZIJN, en dat is geen fout: M-D normaliseert op f_ref, dus ' +
    'een filter waarvan de doorlaatband JUIST DAAR door zijn reactanties opgetild wordt, leest ' +
    'ten opzichte van zijn eigen resistieve equivalent lager. HUIDIG is precies dat geval ' +
    '(-0,94 dB). Zie casusboek V43 en scripts/measure-v43-decomposition.ts.',
  metriek_versie: LF_BUMP_VERSION,
  transform_versie: RESISTIVE_EQUIVALENT_VERSION,
  per_netlist: Object.keys(netlists).map((key) => {
    const row = report(key).metrics.lfBump[0];
    return {
      netlist: key,
      weg: row?.driver ?? null,
      extra_dB: r2(row?.result.extraDb ?? null),
      lift_dB: r2(row?.result.liftDb ?? null),
      opslingering_dB: r2(row?.result.resonantDb ?? null),
    };
  }),
};

raw.manifest_en_geometrie.v43_ontleding = decompositionRecord;

/* ------------------------------------------------------------------ *
 * V44 — de drie fasematen op ELKE bevroren netlist
 * ------------------------------------------------------------------ */

/**
 * De ontleding van M-K over het HELE casusboek, met beide vervangen maten
 * ernaast.
 *
 * Dezelfde vorm en dezelfde reden als `v43_ontleding`: over élke netlist die
 * het casusboek noemt en niet alleen over het levende corpus, want de
 * gedateerde corpora dragen hun eigen bevroren blokken en worden nooit
 * herschreven. Dit blok is AFGELEID en geen invoer — elke rij komt uit
 * `buildReport` op het bestand, en `frozenNetlistGates.test.ts` herrekent hem.
 *
 * Waarom de twee controlekolommen erbij staan: dat de twee oude maten het
 * ONEENS waren is zelf een bewaakte eigenschap (V40). Zonder hen in het
 * referentiebestand zou een stille wijziging aan een van beide nergens meer
 * zichtbaar worden, en zou het bewijsmateriaal onder V44 verdwijnen op het
 * moment dat V44 landt.
 */
const phaseRecord = {
  _:
    'V44 — WELKE PUNTEN EEN FASE-OORDEEL DRAGEN. `mk_dB` is M-K: het gemiddelde |relatieve fase| ' +
    'over de punten die alle drie de gronden doorstaan (binnen de meetgeldigheid van beide ' +
    'takken, beide takken boven de stille-geestvloer, en binnen het overlapvenster). ' +
    '`octaafgeknipt_dB` is wat `system.phaseTracking` tot V43 afdrukte (±1 octaaf rond het ' +
    'kruispunt, geknipt op meetgeldigheid) en `overlapvenster_dB` is wat de TUNER tot V43 las ' +
    '(elk punt binnen het overlapvenster, ongeknipt). Beide laatste zijn CONTROLEKOLOMMEN: geen ' +
    'poort, geen eis, geen sorteersleutel leest ze. Zij staan er omdat hun onderlinge ' +
    'tegenspraak het bewijsmateriaal onder V44 is. De eenheid is graden; de sleutelnamen zeggen ' +
    'dB en dat is een vergissing in de naam die niet in de waarde zit. Zie casusboek V40 en V44.',
  metriek_versie: PHASE_INTEGRATION_VERSION,
  toelating_versie: PHASE_ADMISSION_VERSION,
  per_netlist: Object.keys(netlists).flatMap((key) =>
    report(key).system.phaseTracking.map((p) => ({
      netlist: key,
      paar: `${p.lower}|${p.upper}`,
      mk_graden: r2(p.meanAbsDeg),
      punten: p.n,
      band_Hz: [r2(p.bandHz[0]), r2(p.bandHz[1])],
      octaafgeknipt_graden: r2(p.control.octaveClipped.meanAbsDeg),
      overlapvenster_graden: r2(p.control.overlapWindow.meanAbsDeg),
      afgewezen: p.rejected,
    })),
  ),
};

raw.manifest_en_geometrie.v44_fasematen = phaseRecord;

/* ------------------------------------------------------------------ *
 * V45 — waar de Q_es-eis elke bevroren netlist laat vallen
 * ------------------------------------------------------------------ */

/**
 * M-E over het HELE casusboek, tegen de gestelde Q_es-vermenigvuldigingsgrens.
 *
 * Dezelfde vorm en dezelfde reden als `v36_dissipatie`, `v43_ontleding` en
 * `v44_fasematen`: over élke netlist die het casusboek noemt en niet alleen
 * over het levende corpus, want de gedateerde corpora dragen hun eigen bevroren
 * blokken en worden nooit herschreven. Afgeleid en geen invoer — elke rij komt
 * uit `buildReport` op het bestand, en `frozenNetlistGates.test.ts` herrekent
 * hem.
 *
 * WAAROM ER TWEE KOLOMMEN ZIJN DIE ALLEBEI 'q' HETEN. De eis wordt gehandhaafd
 * als een plafond op de SERIEWEERSTAND (`R_s <= R_e * (q - 1)`, de A5d.6-
 * inversie), en de zoekruimte kent alleen DC-weerstand: discrete weerstanden
 * plus de DCR van de spoelen. M-E daarentegen meet de THEVENIN-bronweerstand op
 * f_p, en die is iets groter, want het netwerk draagt daar ook reactantie.
 * `q_M_E` is dus wat de metriek rapporteert en `q_padweerstand` is wat de
 * inversie begrenst — twee lezingen van één eis, en de tweede is de enige die
 * een zoekruimte kan binden.
 */
/** Serieweerstand in het pad van één weg, DCR inbegrepen — zoals V43 hem telt
 *  en zoals `searchBoxFor` hem tegen het Q_es-plafond legt. */
function seriesPathROhm(key: string, driver: string): number {
  const parts = deserializeFilter(
    readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8'),
  ).parts;
  const bus = busTopology(parts);
  let total = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    if (p.type === 'Resistor') total += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') total += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  return total;
}

const qesCeiling = casus1QesMultiplierMax(raw as unknown as GoldenRefs);
const qesRecord = {
  _:
    'V45 — M-E TEGEN DE GESTELDE Q_es-GRENS, per bevroren netlist en op de LAAGSTE weg. ' +
    '`R_s_ohm` is de Thevenin-bronweerstand op f_p uit M-E zelf; `padweerstand_ohm` is de ' +
    'DC-serieweerstand van diezelfde weg (discrete weerstanden plus spoel-DCR), en dat is de ' +
    'grootheid die de A5d.6-inversie qes-series-r begrenst. `R_e_ohm` is wat de PAS oploste ' +
    '(A5c.1) en niet een van de twee vaste casusboeklezingen — de eis deelt door de R_e van de ' +
    'run, en een plafond dat aan een andere lezing hing zou stilletjes van het paneel ernaast ' +
    'afwijken (V16). Zie gestelde_eisen.qes_vermenigvuldiging_max.',
  gestelde_grens: qesCeiling,
  per_netlist: Object.keys(netlists).map((key) => {
    const rep = report(key);
    const way = rep.driversLowToHigh[0];
    const th = rep.metrics.thevenin.find((t) => t.driver === way) ?? null;
    const re = th?.reOhm ?? null;
    const pathR = seriesPathROhm(key, way);
    return {
      netlist: key,
      weg: way,
      R_e_ohm: r2(re),
      R_s_ohm: r2(th?.rsOhm ?? null),
      padweerstand_ohm: r2(pathR),
      q_M_E: r2(th?.qMultiplier ?? null),
      q_padweerstand: re !== null && re > 0 ? r2(1 + pathR / re) : null,
      plafond_ohm: re !== null && re > 0 && qesCeiling !== null ? r2(re * (qesCeiling - 1)) : null,
      haalt_de_eis:
        re !== null && re > 0 && qesCeiling !== null ? pathR <= re * (qesCeiling - 1) : null,
    };
  }),
};

raw.manifest_en_geometrie.v45_qes = qesRecord;

/* ------------------------------------------------------------------ *
 * V47 — M-C tegen de gestelde aandrijfgrens, per bevroren netlist
 * ------------------------------------------------------------------ */

/**
 * Zelfde vorm en zelfde reden als `v36_dissipatie`, `v43_ontleding`,
 * `v44_fasematen` en `v45_qes`: afgeleid, over het HELE casusboek, en
 * `frozenNetlistGates.test.ts` herrekent hem.
 *
 * ÉÉN RIJ PER HOOGDOORLAATBESCHERMDE WEG en niet één per netlist, want dat is
 * wat de poort oordeelt. De klasse-B-referentie `V_tweeter_op_fs_dB` noteert
 * alleen de tweeter; de gestelde eis is dáárvan afgeleid en wordt op élke
 * beschermde weg gehandhaafd, en een blok dat die tweede weg niet afdrukt zou
 * dat verschil onzichtbaar maken.
 */
const driveCeilingDb = casus1MaxDriveOnFsDb(raw as unknown as GoldenRefs);
const driveRecord = (() => {
  const rows: {
    netlist: string;
    weg: string;
    f_s_hz: number | null;
    doorlaatband_hz: string | null;
    M_C_dB: number | null;
    haalt_de_eis: boolean | null;
  }[] = [];
  for (const key of Object.keys(netlists)) {
    const rep = report(key);
    for (const v of rep.gates.verdicts) {
      if (v.gate !== 'M-C') continue;
      rows.push({
        netlist: key,
        weg: v.subject,
        f_s_hz: r0(Number(String(v.parameters?.f_s ?? '').replace(/[^0-9.]/g, ''))),
        doorlaatband_hz: v.parameters?.passband ? String(v.parameters.passband) : null,
        M_C_dB: r2(v.value),
        /* V50 — against the way's OWN limit (stated where stated, derived
         * elsewhere): the recorder reads the verdict and judges nothing itself. */
        haalt_de_eis: v.value === null || v.limit === null ? null : v.value <= v.limit,
      });
    }
  }
  const live = rows.filter((r) => /^KAND_V2_\d+$/.test(r.netlist));
  return {
    _:
      'V47 — M-C (A4: de aandrijfspanning op de eigen resonantie van een weg, tegen het ' +
      'dB-gemiddelde over haar doorlaatband) tegen de GESTELDE grens, op élke ' +
      'hoogdoorlaatbeschermde weg van élke bevroren netlist. De doorlaatband volgt uit de ' +
      'kruispunten die dit filter zelf oplevert (F1-conventie) en staat erbij, want een M-C ' +
      'zonder zijn band is geen getal (V15). Zie gestelde_eisen.tweeter_drive_op_fs_max_dB.',
    gestelde_grens_dB: driveCeilingDb,
    gestelde_grens_dB_per_weg: Object.fromEntries(
      Object.keys((raw.manifest_en_geometrie.gestelde_eisen as { drive_op_fs_max_dB_per_weg?: Record<string, number | null> }).drive_op_fs_max_dB_per_weg ?? {})
        .map((w) => [w, DRIVE_BY_WAY[w] ?? null]),
    ),
    grootheid: 'driveVoltageOnResonance().db, poort-id M-C',
    levend_corpus_wegen: live.length,
    levend_corpus_eroverheen: live.filter((r) => r.haalt_de_eis === false).length,
    referentiefilters: rows.filter((r) => ['HUIDIG', 'KAND_A', 'KAND_B'].includes(r.netlist)),
    per_weg: rows,
  };
})();

raw.manifest_en_geometrie.v47_bescherming = driveRecord;

/* ------------------------------------------------------------------ *
 * V49 — M-C v2.0: de excursie-afgeleide grens, klasse A per driver en
 * klasse B per beschermde weg per netlist
 * ------------------------------------------------------------------ */

/**
 * TWEE BLOKKEN, en zij dragen twee klassen. (1) `afgeleide_parameters.<driver>`
 * krijgt de KLASSE-A-waarden: x/V op de resonantie, de toegestane spanning en
 * het plafond in dB t.o.v. de piekingang — een functie van meting (f0, Z_max,
 * Q_ms uit de sweep) plus INVOER (kaart, versterkerpiek, marge), en van geen
 * enkele netlist; `_excursie_parameters` legt die invoer vast (V15-regel).
 * (2) `manifest_en_geometrie.v49_excursie` is het afgeleide klasse-B-blok in
 * de vorm van `v47_bescherming`: per hoogdoorlaatbeschermde weg van élke
 * bevroren netlist de doorlaatband-gemiddelde |H|, de daaruit AFGELEIDE
 * M-C-grens, de gestelde, welke van de twee de poort las, en M-C met zijn
 * oordeel. `frozenNetlistGates.test.ts` herrekent beide.
 */
{
  /* The report AS THE GATE JUDGES IT: with the stated figure armed, so that
   * `effectieve_grens_dB` and `bron` below record what the poort actually
   * read — the V47 block above judged by hand against `driveCeilingDb`; this
   * one reads the verdict, and a verdict without the stated figure would be
   * the derived half alone. */
  const judged = (key: string) =>
    buildReport({
      manifest,
      files,
      filter: casus1Filter(key, manifest, files, golden),
      geometry,
      settings: {
        ...POWER,
        orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
        reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
        targetCurve: CASUS1_TARGET_CURVE,
        /* V50 — per way: the tweeter's convention, nothing on the mid. */
        ...DRIVE_PER_WAY,
        ...BUILDABILITY,
        ...CASUS1_EXCURSION,
      },
    });
  const first = judged('HUIDIG');
  const exc = first.metrics.driveExcursion;
  const settings = casus1ExcursionSettings(golden);
  const amp = { P: settings.amplifierPeakPowerW ?? null, R: settings.amplifierNominalLoadOhm ?? null };
  const params = (raw.afgeleide_parameters as Record<string, unknown>);
  params._excursie_parameters = {
    _:
      'V15-PROCESREGEL op M-C v2.0 (V49). x/V op de resonantie is een functie van de gemeten ' +
      'sweep (f0, Z_max en Small\'s Q_ms van de piek die de classificatie fundamenteel noemt) en ' +
      'van INVOER (de driverkaart, het versterkerpiekvermogen met zijn nominale last, de ' +
      'X_max-marge). Die invoer staat hier, zodat de klasse-A-waarden per driver reproduceerbaar ' +
      'zijn; de invoer zelf woont in manifest_en_geometrie.driverkaart en .gestelde_eisen en ' +
      'wordt hier alleen GENOEMD.',
    schatter: DRIVE_EXCURSION_VERSION,
    formule:
      'x/V = Bl·Q_ms/(Z_max·N·M_ms·ω0²) [route 1]; V_toegestaan = X_max·marge/(x/V); ' +
      'plafond = 20·log10(V_toegestaan/V_piek) met V_piek = √(2·P·R_nom); afgeleide M-C-grens per ' +
      'netlist = plafond − doorlaatband-gemiddelde |H| in dB (F1-conventie), en de poort leest de ' +
      'STRENGSTE van die grens en de gestelde (effectiveDriveLimit)',
    versterker_piekvermogen_W: amp.P,
    versterker_nominale_last_ohm: amp.R,
    V_piek_V: exc[0] ? r2(exc[0].peakInputVolts) : null,
    xmax_marge: settings.xmaxMarginFraction ?? null,
    Q_ms_bron: Object.fromEntries(exc.map((x) => [x.driver, x.electromechanical?.qmsSource ?? null])),
    R_e_lezing:
      'Small\'s Q_ms leest het halfvermogensniveau op √r0·R_e = √(Z_max·R_e), dus x/V hangt aan ' +
      'WELKE R_e de pas oploste (V16). Hier: de INGEVOERDE DC-meterlezing van het wooferpaar ' +
      `(${CASUS1_WOOFER_DC_OHM} Ω, reOhmByDriver) en de motionele fit voor mid en tweeter — dezelfde ` +
      'lezing als kandidaten._M_E_parameters. Op de fit-lezing (2,896 Ω) leest de woofer 0,2 mm ' +
      'anders op f0; mid en tweeter bewegen niet.',
    route_2:
      'UIT op deze casus: de FF-meetspanning is niet gedocumenteerd (driverkaart.ff_meetspanning_V ' +
      'is null, met de bevinding erbij). De route-1/route-2-verhouding is daarom null en geen getal.',
    klasse: 'A',
    afhankelijkheid: 'meting',
  };
  for (const x of exc) {
    const block = params[x.driver] as Record<string, unknown> | undefined;
    if (!block) continue;
    block.excursie_x_per_V_op_f0_mm_per_V = Number(x.xPerVoltMmPerV.toFixed(4));
    block.excursie_Q_ms = r2(x.electromechanical?.qms ?? null);
    block.excursie_Z_max_op_f0_ohm = r2(x.electromechanical?.zMaxOhm ?? null);
    block.excursie_toegestane_spanning_V = r2(x.ceiling.allowedVolts);
    block.excursie_plafond_re_ingang_dB = r2(x.ceiling.ceilingDbReInput);
    block.excursie_route_verhouding =
      'off' in x.acoustic ? null : r2(x.acoustic.ratioToElectromechanical ?? null);
    block.excursie_toelichting =
      `M-C v2.0 (V49), route ${x.route}: x/V op f0 = ${x.f0Hz.toFixed(1)} Hz, klasse A — dezelfde waarde ` +
      'op élke netlist van het casusboek. Het plafond is dB t.o.v. de PIEKINGANGSSPANNING; de ' +
      'grens per netlist (plafond − doorlaatbandgemiddelde) staat in manifest_en_geometrie.v49_excursie. ' +
      ('off' in x.acoustic ? `Route 2: ${x.acoustic.off}.` : 'Route 2 gemeten; zie de verhouding.');
  }
  const perWeg: Record<string, unknown>[] = [];
  const zwakste: Record<string, unknown>[] = [];
  for (const key of Object.keys(netlists)) {
    const rep = judged(key);
    const ceilings = new Map(rep.metrics.driveExcursion.map((x) => [x.driver, x.ceiling.ceilingDbReInput]));
    for (const v of rep.gates.verdicts) {
      if (v.gate !== 'M-C') continue;
      const dv = rep.metrics.driveVoltage.find((d) => d.driver === v.subject);
      const c = ceilings.get(v.subject);
      const derived = dv && c !== undefined ? derivedDriveLimitDb(c, dv.passbandMeanDb) : null;
      perWeg.push({
        netlist: key,
        weg: v.subject,
        doorlaatband_gem_dB: r2(dv?.passbandMeanDb ?? null),
        afgeleide_grens_dB: r2(derived),
        /* V50 — the figure stated for THIS way, or null when the way states none. */
        gestelde_grens_dB: DRIVE_BY_WAY[v.subject] ?? null,
        effectieve_grens_dB: v.limit,
        bron: String(v.parameters?.limit_source ?? ''),
        M_C_dB: r2(v.value),
        haalt_de_eis: v.value === null || v.limit === null ? null : v.value <= v.limit,
      });
    }
    for (const w of rep.metrics.weakestLink) {
      zwakste.push({
        netlist: key,
        weg: w.driver,
        x_op_f0_mm: r2(w.xAtF0Mm),
        fractie_van_limiet: r2(w.fractionOfLimit),
        grens_gehaald_vanaf_hz: r2(w.reachesLimitAtHz),
        ergste_mm: r2(w.worstMm),
        ergste_bij_hz: r2(w.worstAtHz),
      });
    }
  }
  const live = perWeg.filter((r) => /^KAND_V2_\d+$/.test(String(r.netlist)));
  /* V50 — "stricter" is measured against the CONVENTION (−20) on every way,
   * whether the way states it or not: where the derived ceiling is below it,
   * one figure for all ways would have been the looser rule. */
  const derivedStricter = perWeg.filter(
    (r) => driveCeilingDb !== null && typeof r.afgeleide_grens_dB === 'number' && r.afgeleide_grens_dB < driveCeilingDb,
  );
  raw.manifest_en_geometrie.v49_excursie = {
    _:
      'V49 — M-C v2.0: de AFGELEIDE M-C-grens per hoogdoorlaatbeschermde weg van élke bevroren ' +
      'netlist, naast de gestelde. De afgeleide grens is plafond (klasse A, afgeleide_parameters.<driver>) ' +
      'minus het doorlaatband-gemiddelde |H| van DÍT netwerk (F1-conventie), dus klasse B; de poort ' +
      'leest de STRENGSTE van beide en `bron` zegt welke. Zwakste schakel: de weg zonder ' +
      'hoogdoorlaat bij de piekingang, rapportage en geen eis.',
    schatter: DRIVE_EXCURSION_VERSION,
    gestelde_grens_dB: driveCeilingDb,
    gestelde_grens_dB_per_weg: Object.fromEntries(
      Object.keys((raw.manifest_en_geometrie.gestelde_eisen as { drive_op_fs_max_dB_per_weg?: Record<string, number | null> }).drive_op_fs_max_dB_per_weg ?? {})
        .map((w) => [w, DRIVE_BY_WAY[w] ?? null]),
    ),
    context_dB: { V47: -25, regel_18dB: -18 },
    levend_corpus_wegen: live.length,
    levend_corpus_eroverheen_op_de_effectieve_grens: live.filter((r) => r.haalt_de_eis === false).length,
    levend_corpus_wegen_waar_de_afgeleide_grens_strenger_is:
      live.filter((r) => driveCeilingDb !== null && typeof r.afgeleide_grens_dB === 'number' && r.afgeleide_grens_dB < driveCeilingDb).length,
    levend_corpus_wegen_zonder_gesteld_getal: live.filter((r) => r.gestelde_grens_dB === null).length,
    /* Over het HELE casusboek: waar las de poort het afgeleide plafond in plaats
     * van het gestelde getal — met naam, want dat is de bevinding en niet een
     * telling. Bij V49: zeven mids van het V28-corpus, alle binnen 0,6 dB. */
    casusboek_wegen_waar_de_afgeleide_grens_strenger_is: derivedStricter.map((r) => ({
      netlist: r.netlist,
      weg: r.weg,
      afgeleide_grens_dB: r.afgeleide_grens_dB,
    })),
    per_weg: perWeg,
    zwakste_schakel: zwakste,
  };
}

/* ------------------------------------------------------------------ *
 * V50 — BOUWBAARHEID: het vermogen in de heetste weerstand en de piekstroom
 * door de drukste spoel, op élke bevroren netlist
 * ------------------------------------------------------------------ */

/**
 * Dezelfde vorm en dezelfde reden als `v36_dissipatie` en `v49_excursie`:
 * afgeleid, over het hele casusboek, door `frozenNetlistGates.test.ts`
 * herrekend. De WATT komt uit M-A's eigen elementen (geen tweede integraal),
 * de STROOM uit de elementstromen bij de piekingang (V49). De toegestane
 * waarde is klasse × marge; de klasse is de gestelde (de snap staat uit op
 * deze route). Het blok schrijft óók de BESLISSING mee of de eis op de
 * zoektocht gewapend is — een lezer van dit blok moet kunnen zien dat een
 * levend corpus dat de eis mist, gegenereerd is ZONDER haar.
 */
{
  const rows: Record<string, unknown>[] = [];
  for (const key of Object.keys(netlists)) {
    const rep = report(key);
    const r = rep.gates.verdicts.find((v) => v.gate === 'M-A/part');
    const l = rep.gates.verdicts.find((v) => v.gate === 'M-L');
    /* V51 — the same element's watts at the CONTINUOUS rating, off the M-A
     * column the report already carries (no second report): the V50 reading
     * beside the judged one, so the block keeps saying what V50 measured. */
    const el = rep.metrics.dissipation?.elements.find((e) => !e.parasitic && e.id === r?.parameters?.element);
    rows.push({
      netlist: key,
      heetste_R: r?.parameters?.element ?? null,
      heetste_R_ohm: typeof r?.parameters?.ohm === 'number' ? r.parameters.ohm : null,
      heetste_R_W: r2(r?.value ?? null),
      heetste_R_W_bij_continu: r2(el?.watts ?? null),
      toegestaan_W: r?.limit ?? null,
      haalt_de_eis: r && r.value !== null && r.limit !== null ? r.value <= r.limit : null,
      haalt_de_eis_bij_continu:
        el?.watts !== undefined && el.watts !== null && r?.limit !== null && r?.limit !== undefined ? el.watts <= r.limit : null,
      drukste_spoel: l?.parameters?.element ?? null,
      drukste_spoel_piek_A: r2(l?.value ?? null),
      drukste_spoel_bij_hz: r0(Number(String(l?.parameters?.at ?? '').replace(/[^0-9.]/g, '')) || null),
      spoel_grens_A: l?.limit ?? null,
    });
  }
  const live = rows.filter((r) => /^KAND_V2_\d+$/.test(String(r.netlist)));
  const refs = rows.filter((r) => ['HUIDIG', 'KAND_A', 'KAND_B'].includes(String(r.netlist)));
  const first = report('HUIDIG');
  const vPeak = (first.gates.verdicts.find((v) => v.gate === 'M-L')?.parameters?.peak_input_V ?? null) as number | null;
  raw.manifest_en_geometrie.v50_bouwbaarheid = {
    _:
      'V50 — BOUWBAARHEID op élke bevroren netlist: het vermogen in de HEETSTE discrete weerstand ' +
      '(M-A, IEC-gewogen bij het continue vermogen; de weerstand met de minste marge tegen zijn ' +
      'toegestane waarde) tegen klasse × marge (poort M-A/part), en de PIEKSTROOM door de drukste spoel ' +
      'bij de piekingang (poort M-L, ongewogen). Afgeleid; frozenNetlistGates.test.ts herrekent het. ' +
      'Zie gestelde_eisen.weerstandsklasse_* en .spoelklasse_* voor de eisen en de bevindingen erbij.',
    schatter: BUILDABILITY_VERSION,
    weerstandsklasse_W: BUILDABILITY.resistorClassW ?? null,
    weerstandsmarge: BUILDABILITY.resistorPowerMargin ?? null,
    toegestaan_W:
      BUILDABILITY.resistorClassW !== undefined && BUILDABILITY.resistorPowerMargin !== undefined
        ? BUILDABILITY.resistorClassW * BUILDABILITY.resistorPowerMargin
        : null,
    continu_vermogen_W: CONTINUOUS_POWER_W,
    /* V51 — the power the verdict `heetste_R_W` / `haalt_de_eis` was JUDGED at:
     * the stated thermal design power when there is one, else the continuous
     * rating (V50). `heetste_R_W_bij_continu` / `haalt_de_eis_bij_continu` keep
     * the V50 reading beside it. */
    thermisch_ontwerpvermogen_W: casus1ThermalDesignPowerW(golden),
    oordeel_bij_W: casus1ThermalDesignPowerW(golden) ?? CONTINUOUS_POWER_W,
    spoelklasse_A: BUILDABILITY.coilClassA ?? null,
    V_piek_V: vPeak === null ? null : r2(vPeak),
    gewapend_op_de_zoektocht: casus1BuildabilityOnSearch(golden),
    levend_corpus_netlists: live.length,
    levend_corpus_eroverheen: live.filter((r) => r.haalt_de_eis === false).length,
    referentiefilters_eroverheen: refs.filter((r) => r.haalt_de_eis === false).length,
    levend_corpus_eroverheen_bij_continu: live.filter((r) => r.haalt_de_eis_bij_continu === false).length,
    referentiefilters_eroverheen_bij_continu: refs.filter((r) => r.haalt_de_eis_bij_continu === false).length,
    casusboek_netlists_die_de_eis_halen: rows.filter((r) => r.haalt_de_eis === true).map((r) => r.netlist),
    per_netlist: rows,
  };
}

/* ------------------------------------------------------------------ *
 * V51 — NIVEAUWERK OP DE LAAGSTE WEG: wat de configuratie vraagt (X), en wat
 * élke bevroren netlist daar werkelijk draagt
 * ------------------------------------------------------------------ */

/**
 * Dezelfde vorm en dezelfde reden als `v36_dissipatie` en `v50_bouwbaarheid`:
 * afgeleid, over het hele casusboek, door `frozenNetlistGates.test.ts`
 * herrekend. X komt uit het rapport (de A5d.4-gap van de laagste weg tot het
 * anker, doelcurve erin) en is klasse A — hetzelfde getal op élk
 * referentiefilter; de INVENTARIS per netlist (serie-R en shunt-pad op de
 * laagste weg, `levelWork.ts`) en de seriespoel per weg zijn klasse B. Het
 * blok schrijft óók de eis mee, zodat een lezer ziet onder welke regel het
 * levende corpus is opgewekt.
 */
{
  const rows: Record<string, unknown>[] = [];
  let X: number | null = null;
  let anchor: string | null = null;
  let lowest: string | null = null;
  let plateau: Record<string, unknown> | null = null;
  let seriesWould: number | null = null;
  let stepHz: number | null = null;
  const thermalW = casus1ThermalDesignPowerW(golden);
  for (const key of Object.keys(netlists)) {
    const rep = report(key);
    const lw = rep.predesign.levelWork;
    if (lw) {
      if (X === null) X = lw.aboveAnchorDb;
      anchor = lw.anchor;
      lowest = lw.lowestWay;
      seriesWould = lw.seriesWouldDeliverDb;
      stepHz = lw.stepHz;
      if (lw.plateau && plateau === null) {
        plateau = {
          beoordeeld: lw.plateau.judged,
          overgang_hz: lw.plateau.stepHz,
          diepte_dB: lw.plateau.depthDb,
          bandvloer_hz: r2(lw.plateau.bandFloorHz),
          octaven_onder_overgang: r2(lw.plateau.octavesBelowStep),
          doel_op_bandvloer_dB: r2(lw.plateau.targetAtFloorDb),
          toelichting: lw.plateau.note,
        };
      }
    }
    const filter = casus1Filter(key, manifest, files, golden);
    const inv = lowest !== null ? levelWorkOnNetlist(filter.netlist, lowest) : null;
    const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
    const lByWay = seriesInductanceByWay(parts);
    const r = rep.gates.verdicts.find((v) => v.gate === 'M-A/part');
    const thev = [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0];
    /* V51b — the verdict on the RULE the case book states today, from the
     * one comparison every reader shares (`levelWorkVerdict`), never a second
     * reading of the maximum here. */
    const verdict = inv && CASUS1_LEVEL_WORK_SETTINGS.lowestWayLevelWork !== undefined ? levelWorkVerdict(inv, CASUS1_LEVEL_WORK_SETTINGS.lowestWayLevelWork) : null;
    rows.push({
      netlist: key,
      serie_R: inv?.seriesResistors.map((x) => ({ id: x.id, ohm: r2(x.ohm) })) ?? null,
      shunt_pad: inv?.shuntPads.map((x) => ({ id: x.id, ohm: r2(x.ohm) })) ?? null,
      geen_niveauwerk: inv?.none ?? null,
      serie_R_ohm: r2(inv?.seriesOhm ?? null),
      /* V51b — the split the rule is stated on: discrete + DCR = total. */
      spoel_DCR_ohm: r2(inv?.dcrOhm ?? null),
      serie_R_totaal_ohm: r2(inv?.totalSeriesOhm ?? null),
      binnen_eis: verdict?.ok ?? null,
      serie_L_mH_per_weg: Object.fromEntries(Object.entries(lByWay).map(([k, h]) => [k, r2(h * 1e3)])),
      opslingering_dB: r2(rep.metrics.lfBump[0]?.result.resonantDb ?? null),
      Qes_mult: r2(thev?.qMultiplier ?? null),
      heetste_R_W_bij_oordeelvermogen: r2(r?.value ?? null),
      haalt_M_A_part: r && r.value !== null && r.limit !== null ? r.value <= r.limit : null,
    });
  }
  const live = rows.filter((r) => /^KAND_V2_\d+$/.test(String(r.netlist)));
  const refs = rows.filter((r) => ['HUIDIG', 'KAND_A', 'KAND_B'].includes(String(r.netlist)));
  raw.manifest_en_geometrie.v51_niveauwerk = {
    _:
      'V51 — NIVEAUWERK OP DE LAAGSTE WEG, op élke bevroren netlist. X is hoeveel dB niveauwerk deze ' +
      'CONFIGURATIE op de laagste weg vraagt: de A5d.4-gap van die weg tot het anker na de doelcurve ' +
      '(klasse A: een eigenschap van de meetset en de voicing, niet van een filter). De inventaris per ' +
      'netlist is wat het bestand daar werkelijk draagt (levelWork.ts: weerstanden in het serie-pad, ' +
      'weerstanden alleen van dat pad naar massa), naast de seriespoel per weg (de tilt die het pad ' +
      'vervangt), de opslingering en M-E. Afgeleid; frozenNetlistGates.test.ts herrekent het. Zie ' +
      'gestelde_eisen.geen_niveauwerk_* voor de eis en driverkaart.woofer.schakeling voor de meetgeometrie. ' +
      'SINDS V51b (level-work/1.1) per netlist ook de DCR van de seriespoelen en het TOTAAL (discrete R plus ' +
      'DCR), want de gestelde variant series-r-max (gestelde_eisen.max_serie_R_laagste_weg_ohm) oordeelt op ' +
      'die som; binnen_eis is het oordeel van levelWorkVerdict onder de eis die het casusboek vandaag stelt.',
    schatter: LEVEL_WORK_VERSION,
    eis: CASUS1_LEVEL_WORK_SETTINGS.lowestWayLevelWork ?? null,
    max_serie_R_ohm: seriesRMaxOhmOf(CASUS1_LEVEL_WORK_SETTINGS.lowestWayLevelWork),
    laagste_weg: lowest,
    anker: anchor,
    gevraagd_X_dB: r2(X),
    serie_zou_leveren_dB: r2(seriesWould),
    baffle_step_hz: r2(stepHz),
    thermisch_ontwerpvermogen_W: thermalW,
    plateau,
    levend_corpus_netlists: live.length,
    levend_corpus_met_niveauwerk_op_laagste_weg: live.filter((r) => r.geen_niveauwerk === false).length,
    referentiefilters_met_niveauwerk_op_laagste_weg: refs.filter((r) => r.geen_niveauwerk === false).length,
    casusboek_netlists_zonder_niveauwerk_op_laagste_weg: rows.filter((r) => r.geen_niveauwerk === true).map((r) => r.netlist),
    /* V51b — the counts under the rule stated today. */
    levend_corpus_binnen_eis: live.filter((r) => r.binnen_eis === true).length,
    levend_corpus_buiten_eis: live.filter((r) => r.binnen_eis === false).length,
    referentiefilters_buiten_eis: refs.filter((r) => r.binnen_eis === false).map((r) => r.netlist),
    per_netlist: rows,
  };
}

/* ------------------------------------------------------------------ *
 * V43 — wat het GEHERIJKTE budget op het levende corpus doet
 * ------------------------------------------------------------------ */

/**
 * De opvolger van `v42_bult_bevinding`, op de grootheid die vandaag geldt.
 *
 * Waarom hij afgeleid is en niet met de hand geschreven: de V42-versie noemde
 * het LEVENDE corpus en werd daarmee onwaar zodra dat corpus opnieuw opgewekt
 * werd. Deze wordt bij elke regeneratie meegeschreven, en
 * `frozenNetlistGates.test.ts` legt hem naast een verse meting.
 */
const budgetRecord = (() => {
  /** Het GESTELDE budget, uit het manifest — nooit hier geschreven (P6). */
  const budgetDb = casus1LfResonantBudgetDb(golden);
  const live = Object.keys(netlists).filter((k) => /^KAND_V2_\d+$/.test(k));
  const resonantOf = (key: string): number | null =>
    report(key).metrics.lfBump[0]?.result.resonantDb ?? null;
  const rows = live.map((key) => ({ netlist: key, opslingering_dB: r2(resonantOf(key)) }));
  const over = rows.filter((r) => r.opslingering_dB !== null && r.opslingering_dB > (budgetDb ?? Infinity));
  const baselines = ['HUIDIG', 'KAND_A', 'KAND_B'].map((key) => ({
    netlist: key,
    opslingering_dB: r2(resonantOf(key)),
  }));
  return {
    _:
      'V43 — WAT HET GEHERIJKTE BUDGET OP HET LEVENDE CORPUS DOET. De eis is sinds V43 1,4 dB op ' +
      'lfBump().resonantDb (gestelde_eisen.lf_opslingering_budget_dB), niet meer 2,5 dB op ' +
      'extraDb. Twee dingen horen hier te staan en zij zijn allebei afgeleid: hoeveel van het ' +
      'levende veld de eis haalt, en wat de drie REFERENTIEFILTERS van de ontwerper op dezelfde ' +
      'grootheid meten. Dat tweede is het bewijs dat de eis geen bouwbaar ontwerp uitsluit - de ' +
      'spiegel van de versterkervloer, die onder V42 juist ONTBRAK omdat alle drie de baselines ' +
      'de toenmalige eis overschreden.',
    gesteld_budget_dB: budgetDb,
    grootheid: 'lfBump().resonantDb',
    levend_corpus: rows.length,
    eroverheen: over.length,
    per_netlist: rows,
    referentiefilters: baselines,
  };
})();

raw.manifest_en_geometrie.v43_budget_bevinding = budgetRecord;

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
