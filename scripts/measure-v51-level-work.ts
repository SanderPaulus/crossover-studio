/**
 * V51 — NIVEAUWERK OP DE LAAGSTE WEG, GEMETEN VÓÓR ER IETS VERBODEN WORDT.
 *
 * `npx vite-node scripts/measure-v51-level-work.ts [SLEUTEL ...]` — seconden,
 * geen ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt.
 *
 * DRIE TABELLEN. (1) De CONFIGURATIE: het anker, hoe ver de laagste weg erboven
 * staat na de doelcurve (X — wat deze configuratie aan niveauwerk op die weg
 * VRAAGT), wat N gelijke drivers in serie daarvan zonder weerstand zouden
 * leveren, de baffle step, en of het gestelde plateau binnen de beoordeelde
 * band ligt. Klasse A: hetzelfde op élk referentiefilter, en dat wordt
 * afgedrukt. (2) Per netlist wat de laagste weg WERKELIJK draagt (serie-R en
 * shunt-pad bij naam, `levelWork.ts`), de seriespoel per weg, de opslingering,
 * M-E en de weerstandspoort bij het thermisch ontwerpvermogen én bij het
 * continue vermogen. (3) De SANITY op de referentiefilters (V42-les): HUIDIG
 * draagt R8 in het wooferpad — de eis van V51 sluit het referentiefilter dus
 * uit, en dat is de bevinding en geen reden om haar te versoepelen.
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal onder
 * casusboek V51.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  casus1BuildabilitySettings,
  casus1ContinuousPowerW,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  casus1ThermalDesignPowerW,
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_LEVEL_WORK_SETTINGS, CASUS1_TARGET_CURVE } from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { describeLevelWork, levelWorkOnNetlist, seriesInductanceByWay } from '../src/lib/levelWork.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const POWER_W = casus1ContinuousPowerW(golden);
const THERMAL_W = casus1ThermalDesignPowerW(golden);
const BUILD = casus1BuildabilitySettings(golden);

const BASE: ReportSettings = {
  ...(POWER_W !== null ? { amplifierPowerW: POWER_W } : {}),
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
    : {}),
  ...BUILD,
  ...CASUS1_LEVEL_WORK_SETTINGS,
  ...casus1ExcursionSettings(golden),
};
/** The same report with the thermal design power WITHDRAWN: the V50 reading. */
const AT_RATING: ReportSettings = { ...BASE, resistorThermalPowerW: undefined };

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);
const f2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));
const report = (key: string, settings: ReportSettings) =>
  buildReport({ manifest, files, geometry, settings, filter: casus1Filter(key, manifest, files, golden) });

console.log('TABEL 1 — de CONFIGURATIE (klasse A), gelezen op elk referentiefilter');
console.log('| referentie | laagste weg | anker | X dB (boven anker, na doelcurve) | serie zou leveren dB | baffle step Hz | plateau beoordeeld | octaven onder overgang | doel op bandvloer dB |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
  const lw = report(key, BASE).predesign.levelWork;
  if (!lw) {
    console.log(`| ${key} | — | — | — | — | — | — | — | — |`);
    continue;
  }
  console.log(
    `| ${key} | ${lw.lowestWay} | ${lw.anchor ?? '—'} | ${f2(lw.aboveAnchorDb)} | ${f2(lw.seriesWouldDeliverDb)} | ` +
      `${f2(lw.stepHz)} | ${lw.plateau ? (lw.plateau.judged ? 'ja' : 'NEE') : '—'} | ${f2(lw.plateau?.octavesBelowStep)} | ` +
      `${f2(lw.plateau?.targetAtFloorDb)} |`,
  );
}
const first = report('HUIDIG', BASE).predesign.levelWork;
console.log('');
console.log(first?.sentence ?? '(geen niveauwerk-blok)');
if (first?.plateau) console.log(`Plateau: ${first.plateau.note}.`);
for (const n of first?.notes ?? []) console.log(`  ${n}`);
console.log('');

console.log(
  `TABEL 2 — per netlist: wat de laagste weg draagt, de seriespoel per weg, opslingering, M-E, en M-A/part bij ` +
    `${THERMAL_W ?? '—'} W thermisch én bij ${POWER_W ?? '—'} W continu (klasse ${BUILD.resistorClassW ?? '—'} W × marge ${BUILD.resistorPowerMargin ?? '—'})`,
);
console.log('| netlist | niveauwerk op de laagste weg | serie-R Ω | serie-L per weg mH | opslingering dB | Q_es× | heetste R W @thermisch | oordeel @thermisch | heetste R W @continu | oordeel @continu |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
let withPad = 0;
let judged = 0;
const cleanKeys: string[] = [];
for (const key of keys) {
  const rep = report(key, BASE);
  const lw = rep.predesign.levelWork;
  const lowest = lw?.lowestWay ?? rep.driversLowToHigh[0];
  const inv = levelWorkOnNetlist(casus1Filter(key, manifest, files, golden).netlist, lowest);
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
  const byWay = seriesInductanceByWay(parts);
  const lCell = rep.driversLowToHigh.map((w) => `${w} ${byWay[w] === undefined ? '—' : (byWay[w] * 1e3).toFixed(2)}`).join(' / ');
  const thev = [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0];
  const gT = rep.gates.verdicts.find((v) => v.gate === 'M-A/part');
  const gC = report(key, AT_RATING).gates.verdicts.find((v) => v.gate === 'M-A/part');
  const verdict = (g: typeof gT) => (!g || g.value === null || g.limit === null ? '—' : g.value <= g.limit ? 'binnen' : `EROVERHEEN ×${(g.value / g.limit).toFixed(1)}`);
  if (inv.reachable) {
    judged++;
    if (!inv.none) withPad++;
    else cleanKeys.push(key);
  }
  console.log(
    `| ${key} | ${describeLevelWork(inv).replace(/^level work on \S+: /, '').replace(/^no level work on .*$/, 'geen')} | ` +
      `${f2(inv.seriesOhm)} | ${lCell} | ${f2(rep.metrics.lfBump[0]?.result.resonantDb)} | ${f2(thev?.qMultiplier)} | ` +
      `${f2(gT?.value)} | ${verdict(gT)} | ${f2(gC?.value)} | ${verdict(gC)} |`,
  );
}
console.log('');
console.log(`netlists met niveauwerk op de laagste weg: ${withPad} van ${judged}; zonder: ${cleanKeys.length}${cleanKeys.length ? ` (${cleanKeys.join(', ')})` : ''}`);
console.log('');
console.log('TABEL 3 — de SANITY op de referentiefilters (V42-les): draagt het referentiefilter niveauwerk op de laagste weg?');
for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
  const rep = report(key, BASE);
  const inv = levelWorkOnNetlist(casus1Filter(key, manifest, files, golden).netlist, rep.driversLowToHigh[0]);
  console.log(`  ${key}: ${describeLevelWork(inv)} → onder de V51-eis ${inv.none ? 'TOEGESTAAN' : 'UITGESLOTEN'}`);
}
console.log(
  '  De eis sluit het referentiefilter uit, en dat is de bevinding: het niveauwerk op de woofer is de ' +
  'configuratie (X dB boven het anker) en geen filterkeuze. Geen reden om de eis te versoepelen.',
);
