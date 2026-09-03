/**
 * V50 — BOUWBAARHEID GEMETEN VÓÓR ER IETS GEWAPEND WORDT.
 *
 * `npx vite-node scripts/measure-v50-buildability.ts [SLEUTEL ...]` — seconden,
 * geen ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt.
 *
 * DRIE TABELLEN. (1) Per netlist het vermogen in ELKE discrete weerstand bij
 * het gestelde continue vermogen (M-A, IEC-gewogen), de heetste met naam, en
 * de toegestane waarde klasse × marge — met het oordeel van M-A/part. (2) Per
 * netlist de piekstroom door elke spoel bij de piekingang √(2·P_piek·R_nom)
 * (M-L, ongewogen), de drukste met naam en frequentie. (3) De SANITY op de
 * referentiefilters (V42-les): haalt HUIDIG de gestelde weerstandseis, en
 * welke klasse of welk continu vermogen zou hem nog net toelaten? Dat laatste
 * is de vraag die de beslissing in `gestelde_eisen.bouwbaarheid_op_de_zoektocht`
 * draagt.
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal onder
 * casusboek V50.
 */

import {
  casus1BuildabilitySettings,
  casus1ContinuousPowerW,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  CASUS1_WOOFER_DC_OHM,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_TARGET_CURVE } from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const POWER_W = casus1ContinuousPowerW(golden);
const BUILD = casus1BuildabilitySettings(golden);
const ALLOWED_W =
  BUILD.resistorClassW !== undefined && BUILD.resistorPowerMargin !== undefined
    ? BUILD.resistorClassW * BUILD.resistorPowerMargin
    : null;

const BASE: ReportSettings = {
  ...(POWER_W !== null ? { amplifierPowerW: POWER_W } : {}),
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
    : {}),
  ...BUILD,
  ...casus1ExcursionSettings(golden),
};

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);
const f1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(1));
const f2 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));

console.log(
  `continu ${POWER_W ?? '—'} W · klasse ${BUILD.resistorClassW ?? '—'} W × marge ${BUILD.resistorPowerMargin ?? '—'} ` +
    `= toegestaan ${f1(ALLOWED_W)} W per weerstand · spoelklasse ${BUILD.coilClassA ?? 'LEEG (geen opgave)'}`,
);
console.log('');
console.log('TABEL 1 — vermogen per discrete weerstand (M-A, IEC-gewogen), heetste met oordeel M-A/part');
console.log('| netlist | weerstanden (W) | heetste | W | toegestaan | oordeel |');
console.log('|---|---|---|---|---|---|');
const hottestOf: Record<string, { id: string; w: number } | null> = {};
const peakOf: Record<string, { id: string; a: number; hz: string } | null> = {};
for (const key of keys) {
  const r = buildReport({ manifest, files, geometry, settings: BASE, filter: casus1Filter(key, manifest, files, golden) });
  const b = r.metrics.buildability;
  const v = r.gates.verdicts.find((x) => x.gate === 'M-A/part');
  const all = (b?.resistorLoads ?? []).map((l) => `${l.id} ${f1(l.watts)}`).join(', ');
  const hot = v && v.value !== null ? { id: String(v.parameters?.element), w: v.value } : null;
  hottestOf[key] = hot;
  const l = r.gates.verdicts.find((x) => x.gate === 'M-L');
  peakOf[key] = l && l.value !== null ? { id: String(l.parameters?.element), a: l.value, hz: String(l.parameters?.at ?? '') } : null;
  console.log(
    `| ${key} | ${all || '— geen —'} | ${hot?.id ?? '—'} | ${f1(hot?.w)} | ${f1(v?.limit)} | ` +
      `${!v || !v.active ? 'uit' : v.value === null ? 'niet geoordeeld' : v.pass ? 'binnen' : '**EROVERHEEN**'} |`,
  );
}

console.log('');
console.log('TABEL 2 — piekstroom per spoel bij de piekingang (M-L, ongewogen), drukste met frequentie');
console.log('| netlist | spoelen (A piek) | drukste | A | bij |');
console.log('|---|---|---|---|---|');
for (const key of keys) {
  const r = buildReport({ manifest, files, geometry, settings: BASE, filter: casus1Filter(key, manifest, files, golden) });
  const all = (r.metrics.buildability?.coilLoads ?? []).map((l) => `${l.id} ${f2(l.peakA)}`).join(', ');
  const p = peakOf[key];
  console.log(`| ${key} | ${all || '—'} | ${p?.id ?? '—'} | ${f2(p?.a)} | ${p?.hz ?? '—'} |`);
}

/* ------------------------------------------------------------------ *
 * TABEL 3 — de sanity op de referentiefilters, en wat hen nog toelaat
 * ------------------------------------------------------------------ */
console.log('');
console.log('DE SANITY (V42-les) — halen de referentiefilters de gestelde weerstandseis?');
for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
  const hot = hottestOf[key];
  if (!hot || ALLOWED_W === null || POWER_W === null || BUILD.resistorPowerMargin === undefined) continue;
  const factor = hot.w / ALLOWED_W;
  /* Welke klasse laat hem nog net toe bij dit vermogen en deze marge, en welk
   * continu vermogen bij deze klasse — twee inversies van dezelfde ongelijkheid
   * `W ≤ klasse × marge`, met W lineair in het vermogen. */
  const classNeeded = hot.w / BUILD.resistorPowerMargin;
  const powerAllowed = (ALLOWED_W / hot.w) * POWER_W;
  console.log(
    `${key.padEnd(8)} heetste ${hot.id} ${hot.w.toFixed(2)} W tegen ${ALLOWED_W.toFixed(1)} W toegestaan → factor ${factor.toFixed(2)} ` +
      `(${factor <= 1 ? 'HAALT' : 'MIST'}); nog net toelaatbaar: klasse ≥ ${classNeeded.toFixed(1)} W bij ${POWER_W} W, ` +
      `óf ≤ ${powerAllowed.toFixed(1)} W continu bij klasse ${BUILD.resistorClassW} W`,
  );
}
