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
for (const map of [netlists, liveNetlists]) {
  // Both copies, and the second one is not redundant: `casus1Filter` resolves a
  // key against the OBJECT `loadGolden()` returned, while the block being
  // written is the raw JSON re-parsed for editing. Updating only the raw copy
  // leaves the loader looking for a netlist the reference file no longer lists,
  // which is how the first run of this change died — usefully, and loudly.
  for (const k of Object.keys(map)) if (k.startsWith('KAND_V2')) delete map[k];
  for (const f of herkomst.bestanden) map[f.name.replace(/-/g, '_')] = `${f.name}.adsfilter.json`;
}
for (const k of Object.keys(raw.kandidaten)) if (k.startsWith('KAND_V2')) delete raw.kandidaten[k];
const keys = Object.keys(netlists).filter((k) => k.startsWith('KAND_V2'));
if (keys.length === 0) throw new Error('no KAND_V2 entries in the generator manifest');

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
const table = compareDesigns([
  { label: 'HUIDIG', origin: 'baseline', report: report('HUIDIG') },
  { label: 'KAND-A', origin: 'baseline', report: report('KAND_A') },
  { label: 'KAND-B', origin: 'baseline', report: report('KAND_B') },
  ...keys.map((k) => ({
    label: k.replace(/_/g, '-'),
    origin: 'v2-candidate' as const,
    report: report(k),
  })),
]);
const cell = (v: number | null, key: string) =>
  v === null ? '—' : v.toFixed(key === 'dissipationPct' ? 0 : 2);
console.log(
  [
    `| ontwerp | ${table.columns.map((c) => `${c.title} (${c.unit})`).join(' | ')} |`,
    `|---|${table.columns.map(() => '---').join('|')}|`,
    ...table.rows.map(
      (row) =>
        `| ${row.label} | ${table.columns
          .map((c) => cell(row.cells[c.key].value, c.key))
          .join(' | ')} |`,
    ),
  ].join('\n'),
);
