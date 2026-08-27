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
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { CASUS1_V2_GRID } from '../src/lib/engine2/casus1V2.fixture.ts';

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
/** The dated corpus — the netlists frozen while the floor was still only a veto (V30). */
const v28Keys = Object.keys(netlists).filter((k) => /^V28_KAND_\d+$/.test(k));
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
const exceptionReason = (key: string, atHz: number | null): string => {
  if (/^V28_KAND_\d+$/.test(key)) {
    return (
      'HET GEDATEERDE V28-CORPUS. Bevroren VOOR de vloer een ZOEKDOEL was: de tuner kende hem ' +
      'als veto plus een reparatiepas achteraf, en die reparatie is op alle vijftien kandidaten ' +
      'afgegaan en op alle vijftien mislukt (casusboek V30). Deze tien blijven staan als de ' +
      '"voor"-helft van de V30-vergelijking — hun opvolgers met de vloer als zoekdoel staan ' +
      'onder kandidaten.KAND_V2_* en halen de vloer wel. Meetobject, GEEN ontwerp: mag niet ' +
      'gebouwd worden.'
    );
  }
  const blind = atHz !== null && atHz < CHAIN_GRID_LO_HZ;
  return (
    'BEVROREN MET DE VLOER ALS ZOEKDOEL, EN DE POORT IN DE RUN LIET HEM DOOR. Geen ' +
    'tegenspraak maar twee metingen op twee rasters. De v2-POORTREFERENTIE wordt bevroren op ' +
    `het analyseraster van de keteninvoer (${CHAIN_GRID_LO_HZ.toFixed(0)} Hz en hoger, want dat ` +
    'is waar de VERRE-VELDMETINGEN van deze set beginnen); deze referentie leest |Z| over de ' +
    'volle gemeten impedantiesweep. ' +
    (blind
      ? `Het minimum van deze netlist ligt op ${atHz!.toFixed(0)} Hz — ONDER die rasterbodem, ` +
        'dus M-B/|Z| heeft het nooit gezien. De TUNER zag het wel: zijn eigen ' +
        'veiligheidsraster loopt tot ruim onder 100 Hz, en `kandidaat_uitkomst.pas.' +
        'ampFloorRepair` staat bij precies deze netlists op `failed` terwijl de poort ' +
        'slaagde. Een impedantie-eis heeft geen geldigheidsvenster: de versterker voelt die ' +
        'dip ook al is de respons daar niet gemeten (zie de band-noot bij `netOptimizer.ts`). ' +
        'Casusboek V32.'
      : `Het minimum ligt op ${atHz === null ? 'onbekende hoogte' : `${atHz.toFixed(0)} Hz`}, ` +
        'binnen het raster, dus de twee metingen kijken naar hetzelfde gebied en verschillen ' +
        'alleen in resolutie. Controleer dit geval apart — het is niet de V32-blindheid.') +
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
    `${keys.length} ketenruns, gemeten 44-73 s per kandidaat op deze meetset (F4d-nazorg; de ` +
    'F4d-meting van 132-286 s stond op een tragere machinebezetting). Daarom een script en ' +
    'geen test.',
  reproduceerbaarheid:
    'Nagemeten bij de F4d-nazorg: het script opnieuw draaien op dezelfde commit levert de ' +
    'netlists BYTE-IDENTIEK terug, op het `savedAt`-stempel van de serialisatie na. Dat ' +
    'stempel is het enige niet-deterministische veld in deze bestanden, en het staat in de ' +
    'kop en niet in de onderdelen.',
};

const telling = (raw.classificatie as Record<string, Record<string, unknown>>).telling;
telling.sinds_V30 =
  `V30 (27-08-2026): het KAND-V2-corpus is opnieuw opgewekt met de gestelde vloer als ZOEKDOEL, ` +
  `en het corpus dat het vervangt is niet weggegooid maar hernoemd: ${v28Keys.length} blokken ` +
  '`V28_KAND_*`, byte-identieke bestanden onder een gedateerde naam, met dezelfde tien metrieken ' +
  'en dezelfde klasse B. Dat is geen referentie aanpassen — het zijn dezelfde netlists, en de ' +
  'nieuwe staan ernaast in plaats van eroverheen, zodat de vóór/ná-vergelijking van deze entry ' +
  'reproduceerbaar blijft uit de repository zelf. De bevinding van F4a staat nog steeds: NUL ' +
  'klasse C. Wat wél veranderde is de uitzonderingslijst: zij noemde tien KAND-V2-netlists en ' +
  'noemt nu tien V28-KAND-netlists, want het nieuwe corpus haalt de vloer op eigen kracht.';
telling.sinds_F4d =
  `F4d (27-08-2026), herzien bij de F4d-nazorg (V28): ${leaves} klasse-B-bladeren, tien metrieken ` +
  `op elk van de ${keys.length} bevroren KAND-V2-netlists. Het waren er negen tot de nazorg de ` +
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
  ...v28Keys.map((k) => ({
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
