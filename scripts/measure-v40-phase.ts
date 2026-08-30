/**
 * V40/V44 — HET GETALLENBLAD ONDER DE FASEMAAT.
 *
 * `npx vite-node scripts/measure-v40-phase.ts [SLEUTEL ...]`
 * default: elke netlist die het casusboek noemt. Seconden, geen ketenrun en
 * geen enkele tune.
 *
 * WAT DIT BLAD WAS, EN WAT HET IS. Tot V43 droeg de app TWEE fasematen die op
 * hetzelfde netwerk in tegengestelde richting bewogen, en dit blad legde ze
 * naast elkaar zodat Sander in VituixCAD kon aflezen wélke van de twee de
 * luidspreker beschrijft. Dat is uitgezocht: geen van beide. De tunermaat
 * middelde over 911 punten (op het hele casusboek) die onder de
 * meetgeldigheidsvloer van de meetbestanden zelf lagen plus 14 waar beide
 * takken dood waren; de rapportmaat middelde over punten waar één tak dertig dB
 * weg was en zijn fase de som niet kon bewegen. Zie casusboek V40 voor de
 * ontleding en `measure-v40-overlap-band.ts` voor de punt-voor-punt-meting.
 *
 * SINDS V44 STAAT ER ÉÉN MAAT VOORAAN — M-K, de fase-integratie op de
 * TOEGELATEN punten — en de twee die zij vervangt staan er als CONTROLEKOLOMMEN
 * achter. Zij oordelen niets: geen poort, geen eis, geen sorteersleutel leest
 * ze. Zij blijven staan omdat hun onderlinge tegenspraak het bewijsmateriaal
 * onder V44 is, en omdat elke casusboek-entry van V30 tot V43 een van beide
 * citeert.
 *
 * DE VRAAG AAN VITUIXCAD IS DAARMEE VERANDERD. Zij was: welke van deze twee
 * reproduceert? Zij is nu: reproduceert M-K? Dat is een VALIDATIE van een
 * gebouwde maat en geen scheidsrechter meer tussen twee ongebouwde. De band
 * waarop afgelezen moet worden staat per rij in de kolom `M-K band`, want die
 * band is niet meer af te leiden uit het kruispunt — hij wordt van het
 * geleverde netwerk afgelezen, en dat is nu juist het punt.
 *
 * ALLE DRIE DE KOLOMMEN KOMEN UIT ÉÉN RAPPORT, op één raster. Tot V43 vroeg dit
 * blad de TUNER apart, op het ketenraster, omdat de twee maten toen
 * verschillende grootheden lazen. Sinds V44 lezen tuner en rapport dezelfde
 * functie (`lib/phaseAdmission.ts`), dus zou zo'n run dezelfde grootheid op een
 * ander raster afdrukken — en V40 heeft dat rasterverschil gemeten op hoogstens
 * anderhalve graad.
 */

import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;

const SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
};

const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(netlists);

const d1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));
const hz = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1));

console.log(
  '| netlist | paar | kruispunt Hz | **M-K °** | M-K band Hz | punten | afgewezen v/s/n | ' +
    'ctl octaafgeknipt ° | rapportband Hz | dekking % | ctl overlapvenster ° | ctl band Hz |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

for (const key of keys) {
  if (!netlists[key]) {
    console.log(`| ${key} | — | — | — | — | — | — | — | — | — | — | — |`);
    continue;
  }
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: SETTINGS,
  });
  for (const p of rep.system.phaseTracking) {
    const oc = p.control.octaveClipped;
    const ov = p.control.overlapWindow;
    console.log(
      `| ${key} | ${p.lower}→${p.upper} | ${hz(p.crossingHz)} | **${d1(p.meanAbsDeg)}** | ` +
        `${hz(p.bandHz[0])}–${hz(p.bandHz[1])} | ${p.n} | ` +
        `${p.rejected.validity}/${p.rejected.silence}/${p.rejected.level} | ` +
        `${d1(oc.meanAbsDeg)} | ` +
        `${oc.bandHz ? `${hz(oc.bandHz[0])}–${hz(oc.bandHz[1])}` : '—'} | ` +
        `${(p.coverage.fraction * 100).toFixed(1)} | ${d1(ov.meanAbsDeg)} | ` +
        `${ov.bandHz ? `${hz(ov.bandHz[0])}–${hz(ov.bandHz[1])}` : '—'} |`,
    );
  }
}

console.log('');
console.log(
  'HOE DIT TE LEZEN. `M-K °` is de maat: het gemiddelde |relatieve fase| over de punten die alle ' +
    'drie de gronden doorstaan — binnen de meetgeldigheid van beide takken, beide takken boven de ' +
    'stille-geestvloer, en binnen het overlapvenster. `afgewezen v/s/n` telt per grond hoeveel ' +
    'rasterpunten daarop afvielen (geldigheid / stilte / niveau). De twee `ctl`-kolommen zijn de ' +
    'maten die tot V43 in de app stonden: `octaafgeknipt` is wat het RAPPORT afdrukte (±1 octaaf ' +
    'rond het kruispunt, geknipt op meetgeldigheid) en `overlapvenster` is wat de TUNER las (elk ' +
    'punt binnen het overlapvenster, ongeknipt). Zij oordelen niets meer.',
);
console.log(
  'WAT SANDER IN VITUIXCAD DOET, en het is sinds V44 een VALIDATIE en geen keuze meer: laad de ' +
    'zip uit `test-fixtures/casus1/v40_vituix/` die bij de netlist hoort — de bestandsnaam draagt ' +
    'de CORPUSSLEUTEL en de commit, zodat er geen twijfel is welk netwerk erin zit — lees de ' +
    'fasetracking van hetzelfde paar af op de band in de kolom `M-K band Hz`, en vergelijk met ' +
    '`M-K °`. Wijkt dat af, dan is de eerste vraag de export en niet de maat: vergelijk dan eerst ' +
    'de SPL-som van VituixCAD met `SPL ±` uit de corpustabel.',
);
