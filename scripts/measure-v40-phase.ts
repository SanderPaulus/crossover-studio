/**
 * V40 — HET GETALLENBLAD ONDER DE FASEBESLISSING.
 *
 * `npx vite-node scripts/measure-v40-phase.ts [SLEUTEL ...]`
 * default: elke netlist die het casusboek noemt. Seconden, geen ketenrun en
 * geen enkele tune.
 *
 * DE VRAAG. De app draagt twee fasematen en zij bewegen op één netwerk in
 * tegengestelde richting (V40). Zolang niemand weet welke van de twee de
 * luidspreker beschrijft, is elke afruil die op fase verdedigd wordt een
 * uitspraak in de eenheden van één van beide. Dit blad legt ze naast elkaar,
 * per netlist en per driverpaar, zodat Sander in VituixCAD ÉÉN getal per maat
 * hoeft af te lezen en te zien welke reproduceert.
 *
 * WAT DE TWEE MATEN ZIJN, en zij verschillen op TWEE assen tegelijk:
 *
 *   RAPPORT (`system.phaseTracking`, A5.5): het gemiddelde van
 *   |arg(tak_onder) − arg(tak_boven)| over ±1 OCTAAF rond het kruispunt,
 *   geknipt op de band waarop élke bijdragende meting geldig is. De dekking
 *   zegt hoeveel van dat octaafvenster overbleef.
 *
 *   TUNER (`pairPhaseDeg`, `netOptimizer` → `computeIntegration`): het
 *   gemiddelde van dezelfde grootheid over het OVERLAPVENSTER — elk rasterpunt
 *   waar de twee takken binnen 20 dB van elkaar liggen. Geen octaafvenster,
 *   geen meetgeldigheidsknip, en een band die met het NETWERK meebeweegt.
 *
 * DAT IS DE VONDST DIE DIT BLAD TOEVOEGT. V38 stelde vast dat "het niet de band
 * is" en bedoelde daarmee dat de twee NETWERKEN op dezelfde rapportband
 * geoordeeld worden. Dat klopt en beantwoordt een andere vraag: de twee MATEN
 * delen hun band niet, en zij delen hem per constructie niet. Daarom drukt dit
 * blad vier getallen per paar af in plaats van twee — elke DEFINITIE op elke
 * BAND — zodat wat aan de band ligt en wat aan de definitie ligt uit elkaar
 * gehaald is voordat VituixCAD er iets over zegt.
 *
 * ALLES OP ÉÉN RASTER. De twee maten lezen in de app verschillende rasters (het
 * rapportraster tegen het ketenraster), en dat is een derde as die de
 * vergelijking zou vertroebelen. De kruistabel hieronder rekent beide
 * definities op het KETENRASTER van casus 1 — het raster waarop de tuner
 * werkelijk zoekt — en de kolom `RAPPORT (eigen)` staat ernaast als de waarde
 * die het paneel werkelijk afdrukt. Wijken die twee af, dan is dát het
 * rasterverschil, en het staat er dus in plaats van dat het in het antwoord
 * verdwijnt.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { optimizeNetworkValues } from '../src/lib/netOptimizer.ts';
import { applyTransfer, combine, wrapDeg, type GriddedResponse } from '../src/lib/dsp.ts';
import { computeIntegration } from '../src/lib/integration.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';

/** ±1 octaaf: de breedte die `system.phaseTracking` bedoelt (A5.5). */
const REPORT_WINDOW_OCTAVES = 1;

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

const chain = casus1ChainInput(manifest, files, golden);

/* ------------------------------------------------------------------ *
 * De TUNER-maat, zoals de tuner hem levert
 * ------------------------------------------------------------------ */

/**
 * `pairPhaseDeg` op een BESTAND, gevraagd aan de tuner zelf.
 *
 * Dezelfde constructie die `compare-corpora.ts` gebruikt en om dezelfde reden:
 * `NetOptimizeResult.before` is de metriek van het ZAAD, gemeten voordat de
 * zoektocht iets verplaatst. Eén onderdeel blijft vrij omdat de tuner een
 * netwerk weigert waarin alles op slot zit. De fasemaat van de tuner hier
 * nabouwen zou een tweede implementatie van een metriek zijn (V21).
 */
function tunerPairs(parts: readonly VxpPart[]): number[] {
  let freed = false;
  const pinned = parts.map((p) => {
    if (p.partId === undefined || p.type === 'Driver' || p.type === 'Generator') return p;
    if (!freed) {
      freed = true;
      return p;
    }
    return { ...p, locked: true };
  });
  const r = optimizeNetworkValues(
    pinned,
    [...chain.grid],
    chain.w,
    chain.t,
    chain.driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    {
      midBranch: { response: chain.m, adjust: {} },
      band: CASUS1_V2_BAND_HZ,
      phaseMetric: CASUS1_V2_SETTINGS.phaseMetric,
      maxIterations: 1,
    },
  );
  return r.before.pairPhaseDeg ?? [];
}

/* ------------------------------------------------------------------ *
 * Beide DEFINITIES op één raster
 * ------------------------------------------------------------------ */

/**
 * De gefilterde taktransfers van een netlist op het ketenraster.
 *
 * Door `solveNetwork` + `applyTransfer`, dezelfde twee functies waarmee de
 * worker zijn som bouwt — geen eigen vermenigvuldiging van magnitude en fase,
 * want dat is precies de plek waar een tweede implementatie van hetzelfde
 * antwoord ontstaat.
 */
function branchResponses(parts: readonly VxpPart[]): Record<string, GriddedResponse> {
  const { netlist } = crossoverToNetlist({ name: 'v40', parts: [...parts] } as VxpCrossover);
  const sol = solveNetwork(netlist, [...chain.grid], chain.driverZ);
  const base: Record<string, GriddedResponse> = {
    woofer: chain.w,
    mid: chain.m,
    tweeter: chain.t,
  };
  const out: Record<string, GriddedResponse> = {};
  for (const model of Object.keys(base)) {
    const d = sol.drivers.find((x) => x.model === model);
    const h = d ? sol.transfers[d.id] : null;
    if (!h) continue;
    out[model] = applyTransfer(base[model], h);
  }
  return out;
}

interface PairMeasure {
  /** Gemiddelde |relatieve fase| over de gegeven puntenverzameling. */
  deg: number | null;
  /** De band die die punten beslaan. */
  bandHz: [number, number] | null;
  n: number;
}

const meanOver = (
  a: GriddedResponse,
  b: GriddedResponse,
  keep: (i: number) => boolean,
): PairMeasure => {
  let sum = 0;
  let n = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < chain.grid.length; i++) {
    if (!keep(i)) continue;
    sum += Math.abs(wrapDeg(a.phaseDeg[i] - b.phaseDeg[i]));
    n++;
    lo = Math.min(lo, chain.grid[i]);
    hi = Math.max(hi, chain.grid[i]);
  }
  return n > 0 ? { deg: sum / n, bandHz: [lo, hi], n } : { deg: null, bandHz: null, n: 0 };
};

/**
 * Het OVERLAPVENSTER van twee takken: elk punt waar hun niveaus binnen het
 * overlapvenster van `computeIntegration` liggen.
 *
 * Afgeleid door die functie te VRAGEN in plaats van de 20 dB hier over te
 * typen: `cls === null` is precies de punten die zij buiten de overlap legt,
 * en dat is de enige definitie die telt.
 */
function overlapMask(a: GriddedResponse, b: GriddedResponse): boolean[] {
  const integ = computeIntegration(combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false }));
  return integ.points.map((p) => p.cls !== null);
}

/* ------------------------------------------------------------------ *
 * Per netlist
 * ------------------------------------------------------------------ */

const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(netlists);

console.log(
  '| netlist | paar | kruispunt Hz | RAPPORT (eigen) ° | rapportband Hz | dekking % | ' +
    'TUNER (eigen) ° | overlapband Hz | n overlap | één formule op OVERLAPband ° | ' +
    'één formule op RAPPORTband ° | n rapport |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');

const d1 = (v: number | null) => (v === null ? '—' : v.toFixed(2));
const hz = (v: number | null) => (v === null ? '—' : v.toFixed(1));

for (const key of keys) {
  const name = netlists[key];
  if (!name) {
    console.log(`| ${key} | — | — | — | — | — | — | — | — | — | — |`);
    continue;
  }
  const parts: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8')).parts;
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: SETTINGS,
  });
  const tuner = tunerPairs(parts);
  const branches = branchResponses(parts);

  rep.system.phaseTracking.forEach((pt, i) => {
    const a = branches[pt.lower];
    const b = branches[pt.upper];
    /* DE TWEE DEFINITIES ZIJN DEZELFDE FORMULE. Beide middelen
     * |relatieve fase| over een puntenverzameling; wat hen scheidt is WELKE
     * punten. Dus staan er geen vier kruisgetallen maar twee: één formule, op
     * het ketenraster, over elk van de twee banden. Vier getallen suggereren
     * vier metingen, en er zijn er twee. */
    let onOverlap: PairMeasure = { deg: null, bandHz: null, n: 0 };
    let onReport: PairMeasure = { deg: null, bandHz: null, n: 0 };
    if (a && b) {
      const mask = overlapMask(a, b);
      const lo = Math.max(pt.crossingHz / 2 ** REPORT_WINDOW_OCTAVES, pt.bandHz[0]);
      const hi = Math.min(pt.crossingHz * 2 ** REPORT_WINDOW_OCTAVES, pt.bandHz[1]);
      onOverlap = meanOver(a, b, (j) => mask[j]);
      onReport = meanOver(a, b, (j) => chain.grid[j] >= lo && chain.grid[j] <= hi);
    }
    console.log(
      `| ${key} | ${pt.lower}→${pt.upper} | ${hz(pt.crossingHz)} | ${d1(pt.meanAbsDeg)} | ` +
        `${hz(pt.bandHz[0])}–${hz(pt.bandHz[1])} | ${(pt.coverage.fraction * 100).toFixed(1)} | ` +
        `${d1(tuner[i] ?? null)} | ` +
        `${onOverlap.bandHz ? `${hz(onOverlap.bandHz[0])}–${hz(onOverlap.bandHz[1])}` : '—'} | ` +
        `${onOverlap.n} | ${d1(onOverlap.deg)} | ${d1(onReport.deg)} | ${onReport.n} |`,
    );
  });
}

console.log('');
console.log(
  'HOE DIT TE LEZEN, in drie vergelijkingen. (1) `TUNER (eigen)` tegen `één formule op ' +
    'OVERLAPband`: die twee horen dicht bij elkaar te liggen — doen zij dat niet, dan meet dit ' +
    'blad iets anders dan de tuner en is de rest onbruikbaar. (2) `RAPPORT (eigen)` tegen `één ' +
    'formule op RAPPORTband`: het verschil daartussen is het RASTER (rapportraster tegen ' +
    'ketenraster), niet de definitie. (3) De twee formulekolommen onderling: dát is de BAND — ' +
    'het overlapvenster (|Δniveau| ≤ 20 dB, beweegt met het netwerk mee) tegen ±1 octaaf rond ' +
    'het kruispunt geknipt op meetgeldigheid. De dekking zegt hoeveel van dat bedoelde ' +
    'octaafvenster de meetgeldigheid overliet.',
);
console.log(
  'WAT SANDER IN VITUIXCAD DOET: laad de bijbehorende zip uit ' +
    '`test-fixtures/casus1/v40_vituix/`, lees de fasetracking van hetzelfde paar af op de ' +
    'RAPPORTBAND uit de kolom hierboven, en vergelijk met beide getallen. De maat die ' +
    'reproduceert beschrijft de luidspreker; de andere beschrijft een conventie.',
);
