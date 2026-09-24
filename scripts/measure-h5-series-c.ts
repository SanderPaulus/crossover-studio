/**
 * H-5 (veegronde a) — IS ER EEN WEG ZONDER SERIE-CONDENSATOR?
 *
 * DE VUISTREGEL. "De tweeter hangt altijd achter een condensator" is de enige
 * regel uit de literatuur die over BESCHERMING gaat in plaats van over klank:
 * zonder seriecondensator ziet de spreekspoel het volle laag van de versterker
 * en gaat hij eraan, ook als de akoestische som er goed uitziet.
 *
 * WAT HIER GEMETEN WORDT, en het zijn twee vragen die uit elkaar gehouden
 * moeten worden:
 *
 *   1. KAN DE SYNTHESE er een leveren zonder? Dat is een vraag over
 *      `synthesis.ts` en zij is met de hand te beantwoorden: de
 *      hoogdoorlaatladder begint bij élke orde met een SERIE-C (`i % 2 === 0`
 *      op i = 0), en de ontwerpstap zet de hoogdoorlaat van de bovenste weg
 *      onvoorwaardelijk aan (`specsFor` in `threeWayDesign.ts`, `baseSpecs` in
 *      `vfOptimizer.ts`). Dit script drukt die twee feiten af als BRONSCAN, en
 *      niet als bewering.
 *
 *   2. KAN HIJ ER EEN KWIJTRAKEN? Daar is de enumeratie niet het onderwerp
 *      maar de VERWIJDERING: de trapsgewijze snoei (`removed`, een geopende
 *      serie-C leeft voort als draad) en de onderdelenaudit, die op casus 1
 *      aantoonbaar al een C uit een val heeft gehaald (A5e.3b (c3) noemt de
 *      wees die daarvan overbleef). Geen van beide draagt vandaag een regel
 *      die over BESCHERMING gaat; wat hen tegenhoudt is dat een verwijdering
 *      de som, de fase en |Z| niet mag verplaatsen — grootheden die toevallig
 *      meebewegen, niet een eis die iemand gesteld heeft.
 *
 * Dit script beantwoordt (2) EMPIRISCH over het hele casusboek: draagt élke
 * hoogdoorlaatbeschermde weg van élke bevroren netlist een serie-C? Het is de
 * meting die beslist of de harde regel iets repareert of iets bevestigt.
 *
 * Geen ketenrun en geen tune — het leest bestanden.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const ROOT = join(import.meta.dirname, '..');

/** Eén casus: waar zijn netlists staan en welke wegen hij kent, laag → hoog. */
interface CaseBook {
  label: string;
  dir: string;
  refs: string;
  /** De wegen van laag naar hoog, zoals de netlists ze noemen. */
  waysLowToHigh: string[];
}

const BOOKS: CaseBook[] = [
  {
    label: 'casus 1',
    dir: join(ROOT, 'test-fixtures', 'casus1'),
    refs: join(ROOT, 'test-fixtures', 'golden_refs_casus1.json'),
    waysLowToHigh: ['woofer', 'mid', 'tweeter'],
  },
  {
    label: 'casus 1b',
    dir: join(ROOT, 'test-fixtures', 'casus1b'),
    refs: join(ROOT, 'test-fixtures', 'casus1b', 'golden_refs_casus1b.json'),
    waysLowToHigh: ['mid', 'tweeter'],
  },
  {
    label: 'casus 1h',
    dir: join(ROOT, 'test-fixtures', 'casus1h'),
    refs: join(ROOT, 'test-fixtures', 'casus1h', 'golden_refs_casus1h.json'),
    waysLowToHigh: ['mid', 'tweeter'],
  },
  {
    label: 'casus 2',
    dir: join(ROOT, 'test-fixtures', 'casus2'),
    refs: join(ROOT, 'test-fixtures', 'casus2', 'golden_refs_casus2.json'),
    waysLowToHigh: ['woofer', 'mid', 'tweeter'],
  },
];

/** De modelnamen die de netlist zelf draagt, in de volgorde van het bestand. */
function driverModels(parts: readonly VxpPart[]): string[] {
  const out: string[] = [];
  for (const q of parts) {
    if (q.type !== 'Driver') continue;
    const m = (q as { model?: string }).model;
    if (typeof m === 'string' && !out.includes(m)) out.push(m);
  }
  return out;
}

/** Draagt de weg van `model` een SERIE-condensator? */
function seriesCapsOf(parts: readonly VxpPart[], model: string): string[] {
  const bus = busTopology(parts);
  const out: string[] = [];
  for (const q of parts) {
    if (q.type !== 'Capacitor' || !q.partId) continue;
    if (q.open || q.shorted) continue;
    if (bus.positionOf(q.partId) !== 'series') continue;
    if (bus.driversOf(q.partId).includes(model)) out.push(q.partId);
  }
  return out;
}

interface Row {
  book: string;
  key: string;
  model: string;
  /** Hoe hoog de weg staat: 0 = de laagste. */
  rank: number;
  seriesCaps: string[];
}

const rows: Row[] = [];
const missingFiles: string[] = [];

for (const book of BOOKS) {
  if (!existsSync(book.refs)) {
    missingFiles.push(book.refs);
    continue;
  }
  const golden = JSON.parse(readFileSync(book.refs, 'utf-8')) as {
    manifest_en_geometrie?: { netlists?: Record<string, string> };
  };
  const netlists = golden.manifest_en_geometrie?.netlists ?? {};
  for (const [key, name] of Object.entries(netlists)) {
    const path = join(book.dir, name);
    if (!existsSync(path)) {
      missingFiles.push(path);
      continue;
    }
    const parts = deserializeFilter(readFileSync(path, 'utf-8')).parts;
    const models = driverModels(parts);
    for (const model of models) {
      /* De RANG komt uit de wegenlijst van de casus en niet uit de volgorde in
       * het bestand: een netlist mag zijn drivers in elke volgorde schrijven. */
      const rank = book.waysLowToHigh.indexOf(model);
      rows.push({
        book: book.label,
        key,
        model,
        rank: rank >= 0 ? rank : models.indexOf(model),
        seriesCaps: seriesCapsOf(parts, model),
      });
    }
  }
}

const out = (s: string) => process.stdout.write(`${s}\n`);

out('H-5 (a) — SERIE-CONDENSATOR PER WEG, over het hele casusboek');
out('');
out(`netlists gelezen: ${new Set(rows.map((r) => `${r.book}/${r.key}`)).size}`);
out(`wegen gelezen:    ${rows.length}`);
if (missingFiles.length > 0) {
  out(`ONTBREKENDE BESTANDEN: ${missingFiles.length}`);
  for (const f of missingFiles.slice(0, 5)) out(`  ${f}`);
}
out('');

const upper = rows.filter((r) => r.rank > 0);
const lowest = rows.filter((r) => r.rank === 0);
const upperWithout = upper.filter((r) => r.seriesCaps.length === 0);
const lowestWith = lowest.filter((r) => r.seriesCaps.length > 0);

out('| verzameling | wegen | zonder serie-C |');
out('| --- | ---: | ---: |');
out(`| NIET de laagste weg (hoogdoorlaatbeschermd) | ${upper.length} | ${upperWithout.length} |`);
out(`| de laagste weg | ${lowest.length} | ${lowest.length - lowestWith.length} |`);
out('');

if (upperWithout.length > 0) {
  out('WEGEN BOVEN DE LAAGSTE ZONDER SERIE-CONDENSATOR — bij naam:');
  for (const r of upperWithout) out(`  ${r.book} · ${r.key} · ${r.model}`);
} else {
  out('Geen enkele weg boven de laagste mist een serie-condensator.');
}
out('');

/* De laagste weg hoort er GEEN te hebben en dat is de tegenproef: zou elke weg
 * er een dragen, dan meet de telling hierboven niets. */
out(`De laagste weg draagt er op ${lowestWith.length} van de ${lowest.length} wegen wél een —`);
out('dat is de tegenproef dat de meting onderscheidt en niet alles goedkeurt.');
out('');

/* Hoeveel serie-C's een bovenste weg draagt: één is een 1e/2e-orde-ladder, twee
 * een 3e/4e-orde. Nul zou het defect zijn. */
const hist = new Map<number, number>();
for (const r of upper) hist.set(r.seriesCaps.length, (hist.get(r.seriesCaps.length) ?? 0) + 1);
out('serie-C per hoogdoorlaatbeschermde weg:');
for (const n of [...hist.keys()].sort((a, b) => a - b)) out(`  ${n}: ${hist.get(n)} wegen`);
