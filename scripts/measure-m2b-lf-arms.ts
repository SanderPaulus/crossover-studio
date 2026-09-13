/**
 * M-2b — WELKE INVOER VAN DE MEETSETWISSEL M-D VERPLAATST, ÉÉN FACTOR PER ARM.
 *
 * `npx vite-node scripts/measure-m2b-lf-arms.ts` — seconden, geen ketenrun en
 * geen enkele tune. Schrijft `test-fixtures/casus1_m2b_lf_armen.json`.
 *
 * WAAROM DIT BESTAAT. De wissel van M-1 naar de 67,7 L-set verplaatst de
 * RESONANTE OPSLINGERING (A4 M-D) op het bevroren C-2-corpus met +0,31 tot
 * +1,54 dB — tegen een gesteld budget van 1,4 dB, dus dat is geen detail maar
 * het verschil tussen geleverd en geweigerd. Een wissel die drie dingen
 * tegelijk verzet (ver veld, nabij veld, sweep) en daarna één getal afdrukt,
 * zegt niet WELK van de drie het deed, en zonder dat antwoord is de keuze
 * erna — budget verplaatsen of opnieuw meten — niet te maken.
 *
 * HET ANTWOORD IS HET NABIJE VELD, en het is niet wat je zou verwachten van een
 * sessie die een KASTTRANSFORMATIE draagt: het getransformeerde VERRE veld doet
 * vrijwel niets, de nieuwe SWEEP doet weinig, en het nieuwe NABIJE veld doet
 * bijna alles. M-D leest het nabije veld als de kale-kast-respons, en het
 * nabije veld van 11-09 is gemeten met ÉÉN woofer aangedreven en de andere
 * passief — de toestand die M-2 op drie manieren heeft nagemeten en die Sander
 * op 12-09-2026 GESTELD EN NIET GECORRIGEERD heeft verklaard. De reflexinkeping
 * van de conus ligt daardoor 4,0-4,8 Hz onder f_b waar die van augustus
 * 1,3-2,0 Hz eronder ligt, en M-D kijkt precies daar.
 *
 * DE VIERDE ARM BEANTWOORDT DE VOLGENDE VRAAG VOORDAT IEMAND HEM STELT: als het
 * FRAME het probleem was, zou het nabije veld TRANSFORMEREN naar 67,7 L het
 * moeten repareren. Dat doet het niet — de arm beweegt beide kanten op. De
 * dominante factor is dus de AANDRIJFTOESTAND en niet het volume, en daarmee is
 * een modelleerstap geen uitweg: wat overblijft is het budget of een hermeting
 * met beide woofers aangedreven.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseLim } from '../src/lib/parsers/lim.ts';
import { parseArtaHeader, type Manifest, type ManifestEntry } from '../src/lib/engine2/ingest/manifest.ts';
import type { MeasurementFile } from '../src/lib/engine2/ingest/derive.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import {
  CASUS1_DIR,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { REAL_VOLUME_L, fitKoanBox, transformNearFieldText } from '../src/lib/engine2/koan2026_09.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_m2b_lf_armen.json');
const TESTKAST = join(CASUS1_DIR, '..', 'koan_2026-09_testkast');

const golden = loadGolden();
const geometry = casus1Geometry(golden);
/* De meetbank van de vergelijkingen, zodat deze tabel in dezelfde eenheden
 * staat als `compare-corpora.ts` en `frozenNetlistGates`. */
const settings = corpusBank(golden, 'koan677').settings;
const budgetDb = (golden.manifest_en_geometrie as unknown as {
  gestelde_eisen: { lf_opslingering_budget_dB: number };
}).gestelde_eisen.lf_opslingering_budget_dB;

/** De M-1-set is de basis; elke arm verzet er één factor in. */
const BASE = casus1Manifest(golden, 'merged');
const BASE_FILES = casus1Files(BASE);

const SWAP: Record<string, string> = {
  'Koan_W_up_merged_ingespeeld_mild.frd': 'woofer_up_hor_0_koan677_merged.frd',
  'Koan_W_down_merged_ingespeeld_mild.frd': 'woofer_down_hor_0_koan677_merged.frd',
  'woofer_up_near.txt': 'woofer_up_near.txt',
  'woofer_down_near.txt': 'woofer_down_near.txt',
  'woofers_parallel__1_.lim': 'woofers_parallel.lim',
};
const FF = ['Koan_W_up_merged_ingespeeld_mild.frd', 'Koan_W_down_merged_ingespeeld_mild.frd'];
const NF = ['woofer_up_near.txt', 'woofer_down_near.txt'];
const Z = ['woofers_parallel__1_.lim'];

function load(entry: ManifestEntry, dir: string): MeasurementFile {
  const path = join(dir, entry.file);
  if (entry.kind === 'Z') {
    const b = readFileSync(path);
    const z = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    return { entry, impedance: { freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase } };
  }
  const f = parseFrd(readFileSync(path, 'latin1'));
  return { entry: { ...entry, header: parseArtaHeader(f.meta.rawComments) }, response: { freq: f.freq, spl: f.spl, phaseDeg: f.phase } };
}

function arm(which: readonly string[]): { manifest: Manifest; files: MeasurementFile[] } {
  const entries = BASE.entries.map((e) => (which.includes(e.file) ? { ...e, file: SWAP[e.file] } : e));
  const files = entries.map((e, i) => (which.includes(BASE.entries[i].file) ? load(e, TESTKAST) : BASE_FILES[i]));
  return { manifest: { ...BASE, entries }, files };
}

/** De vijfde arm: de 67,7 L-set met het nabije veld GETRANSFORMEERD. */
function transformedNfArm(): { manifest: Manifest; files: MeasurementFile[] } {
  const m = casus1Manifest(golden, 'koan677');
  const base = casus1Files(m);
  const boxFit = fitKoanBox();
  const files = base.map((mf, i) => {
    const e = m.entries[i];
    if (e.kind !== 'NF' || e.driver !== 'woofer') return mf;
    const f = parseFrd(transformNearFieldText(e.file, 'cone', boxFit, REAL_VOLUME_L));
    return { entry: { ...e, header: parseArtaHeader(f.meta.rawComments) }, response: { freq: f.freq, spl: f.spl, phaseDeg: f.phase } };
  });
  return { manifest: m, files };
}

const ARMS: { id: string; label: string; build: () => { manifest: Manifest; files: MeasurementFile[] } }[] = [
  { id: 'm1', label: 'M-1 (niets verzet)', build: () => ({ manifest: BASE, files: BASE_FILES }) },
  { id: 'ff', label: 'alleen het VERRE veld (merge 67,7 L)', build: () => arm(FF) },
  { id: 'nf', label: 'alleen het NABIJE veld (11-09, ruw)', build: () => arm(NF) },
  { id: 'z', label: 'alleen de SWEEP (11-09)', build: () => arm(Z) },
  { id: 'm2b', label: 'M-2b (alle drie)', build: () => arm([...FF, ...NF, ...Z]) },
  { id: 'm2b_nf_transformed', label: 'M-2b met het nabije veld GETRANSFORMEERD naar 67,7 L', build: transformedNfArm },
];

/** Élke netlist die het casusboek noemt en die op de woofer iets te zeggen heeft. */
const NETLISTS = Object.keys((golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists);
const SUBJECTS = ['HUIDIG', ...NETLISTS.filter((k) => /^C2_KAND_\d+$/.test(k))];

const table: Record<string, Record<string, number | null>> = {};
for (const a of ARMS) {
  const { manifest, files } = a.build();
  table[a.id] = {};
  for (const k of SUBJECTS) {
    const r = buildReport({ manifest, files, filter: casus1Filter(k, manifest, files, golden), geometry, settings });
    const lf = r.metrics.lfBump.find((x) => x.driver === 'woofer');
    table[a.id][k] = lf?.result.resonantDb ?? null;
  }
}

const d3 = (v: number | null) => (v === null ? null : Number(v.toFixed(3)));
const delta = (id: string, k: string) => {
  const a = table.m1[k];
  const b = table[id][k];
  return a === null || b === null ? null : Number((b - a).toFixed(3));
};

const w = 11;
console.log(`M-D — de RESONANTE opslingering van de woofer, dB. Gesteld budget: ${budgetDb} dB.\n`);
console.log(`${'arm'.padEnd(46)} ${SUBJECTS.map((k) => k.replace('C2_KAND_', 'C2-').padStart(w)).join(' ')}`);
for (const a of ARMS) {
  console.log(`${a.label.padEnd(46)} ${SUBJECTS.map((k) => String(d3(table[a.id][k])).padStart(w)).join(' ')}`);
}
console.log(`\n${'Δ t.o.v. M-1'.padEnd(46)}`);
for (const a of ARMS.slice(1)) {
  console.log(`${a.label.padEnd(46)} ${SUBJECTS.map((k) => String(delta(a.id, k)).padStart(w)).join(' ')}`);
}

/** Hoeveel van de M-2b-verschuiving staat elke losse arm voor? */
const share = (id: string) => {
  const num = SUBJECTS.map((k) => Math.abs(delta(id, k) ?? 0)).reduce((x, y) => x + y, 0);
  const den = SUBJECTS.map((k) => Math.abs(delta('m2b', k) ?? 0)).reduce((x, y) => x + y, 0);
  return den === 0 ? null : Number((num / den).toFixed(3));
};
console.log('\nAandeel in de totale verschuiving (som van |Δ| over alle onderwerpen):');
for (const id of ['ff', 'nf', 'z']) {
  console.log(`  ${ARMS.find((a) => a.id === id)!.label.padEnd(46)} ${((share(id) ?? 0) * 100).toFixed(1)} %`);
}

const over = (id: string) => SUBJECTS.filter((k) => (table[id][k] ?? -Infinity) > budgetDb);
console.log(`\nBoven het budget van ${budgetDb} dB:`);
for (const a of ARMS) console.log(`  ${a.label.padEnd(46)} ${over(a.id).length} van ${SUBJECTS.length}  ${over(a.id).join(' ')}`);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'M-2b — welke invoer van de meetsetwissel M-D verplaatst, één factor per arm. Geschreven door ' +
        'scripts/measure-m2b-lf-arms.ts; m2bMeetset.test.ts reproduceert hem uit een verse meting. De ' +
        'grootheid is de RESONANTE helft van de LF-bult (A4 M-D, lfBump().resonantDb) op de woofer, in dB, ' +
        'gemeten met de meetbank van de corpusvergelijkingen.',
      gesteld_budget_dB: budgetDb,
      onderwerpen: SUBJECTS,
      armen: ARMS.map((a) => ({ id: a.id, label: a.label })),
      resonantDb: Object.fromEntries(
        ARMS.map((a) => [a.id, Object.fromEntries(SUBJECTS.map((k) => [k, d3(table[a.id][k])]))]),
      ),
      delta_tov_m1: Object.fromEntries(
        ARMS.slice(1).map((a) => [a.id, Object.fromEntries(SUBJECTS.map((k) => [k, delta(a.id, k)]))]),
      ),
      aandeel_in_de_verschuiving: Object.fromEntries(['ff', 'nf', 'z'].map((id) => [id, share(id)])),
      boven_budget: Object.fromEntries(ARMS.map((a) => [a.id, over(a.id)])),
      bevinding:
        'HET NABIJE VELD DOET HET, en het verre veld dat de kasttransformatie draagt vrijwel niets. M-D ' +
        'leest het nabije veld als de kale-kast-respons; het nabije veld van 11-09 is gemeten met EEN ' +
        'woofer aangedreven en de andere passief (M-2, STATED NOT CORRECTED door Sander op 12-09-2026), ' +
        'en de reflexinkeping van de conus ligt daardoor 4,0-4,8 Hz onder f_b waar die van augustus ' +
        '1,3-2,0 Hz eronder ligt. De arm met het nabije veld GETRANSFORMEERD naar 67,7 L herstelt het ' +
        'NIET — hij beweegt beide kanten op — dus de dominante factor is de AANDRIJFTOESTAND en niet het ' +
        'volume, en een modelleerstap is geen uitweg. Wat overblijft is een keuze van de ontwerper: het ' +
        'budget van 1,4 dB (herijkt bij V43 op de augustusmeting) opnieuw stellen, of het nabije veld ' +
        'hermeten met beide woofers aangedreven.',
    },
    null,
    1,
  )}\n`,
);
console.log(`\ngeschreven: ${OUT}`);
