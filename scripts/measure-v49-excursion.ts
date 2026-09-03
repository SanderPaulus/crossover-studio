/**
 * V49 — M-C v2.0 GEMETEN VOORDAT ER IETS GESTELD WORDT.
 *
 * `npx vite-node scripts/measure-v49-excursion.ts [SLEUTEL ...]` — seconden,
 * geen ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt.
 *
 * DRIE TABELLEN.
 *
 *  1. PER DRIVER, klasse A (meting + driverkaart + versterkerpiek, geen
 *     netlist): f0, Z_max, Q_ms uit de sweep; Bl, M_ms van de kaart; x/V op de
 *     resonantie via route 1; de toegestane spanning op f0 en het plafond in dB
 *     t.o.v. de piekingangsspanning. Route 2 ernaast, of de reden dat zij uit
 *     staat. Dit is wat de klasse-A-referenties dragen.
 *
 *  2. PER HOOGDOORLAATBESCHERMDE WEG PER NETLIST, klasse B: de doorlaatband-
 *     gemiddelde |H| van dít netwerk, de daaruit AFGELEIDE M-C-grens (plafond
 *     minus dat gemiddelde), naast −20 (gesteld, V47b), −25 (V47) en de
 *     18-dB-regel als context; welke van de twee de poort werkelijk las
 *     (`limit_source`), en M-C zelf met zijn oordeel.
 *
 *  3. DE ZWAKSTE SCHAKEL voor élke weg zonder hoogdoorlaat: de uitslag op de
 *     resonantie bij de piekingang, als fractie van X_max·marge, en waar het
 *     één-resonatormodel de grens haalt.
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal onder
 * casusboek V49 en onder het advies of de gestelde −20 voor casus 1 kan
 * vervallen.
 */

import {
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDb,
  casus1MaxDriveOnFsDbByDriver,
  casus1ContinuousPowerW,
  casus1AmpMinLoadOhm,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_TARGET_CURVE } from '../src/lib/engine2/casus1V2.fixture.ts';
import { CASUS1_WOOFER_DC_OHM } from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { derivedDriveLimitDb } from '../src/lib/engine2/metrics/driveExcursion.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const STATED = casus1MaxDriveOnFsDb(golden);
const FLOOR = casus1AmpMinLoadOhm(golden);

/** Twee CONTEXT-getallen uit het casusboek, met naam: V47's −25 en de 18-dB-regel. */
const CONTEXT_V47_DB = -25;
const CONTEXT_RULE_DB = -18;

const BASE: ReportSettings = {
  /* V50 — from its one home in the manifest. */
  ...(casus1ContinuousPowerW(golden) !== null ? { amplifierPowerW: casus1ContinuousPowerW(golden)! } : {}),
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...(FLOOR !== null ? { ampMinLoadOhm: FLOOR } : {}),
  /* V50 — PER WAY: the tweeter carries the convention, the mid none. The
   * single figure `STATED` stays as the number the tables compare with. */
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
    : {}),
  ...casus1ExcursionSettings(golden),
};

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);
const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f4 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(4));

/* ------------------------------------------------------------------ *
 * TABEL 1 — per driver, klasse A
 * ------------------------------------------------------------------ */
const first = buildReport({ manifest, files, geometry, settings: BASE, filter: casus1Filter('HUIDIG', manifest, files, golden) });
console.log('TABEL 1 — x/V op de resonantie en het plafond, per driver (klasse A: meting + kaart + versterkerpiek)');
console.log('| driver | f0 Hz | Z_max Ω | Q_ms (bron) | Bl T·m | M_ms g | N | x/V mm/V | X_max·marge mm | V_toegestaan V | V_piek V | plafond dB re ingang | route 2 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const x of first.metrics.driveExcursion) {
  const em = x.electromechanical;
  console.log(
    `| ${x.driver} | ${f2(x.f0Hz)} | ${f2(em?.zMaxOhm)} | ${f2(em?.qms)} (${em?.qmsSource.split(' — ')[0] ?? '—'}) | ` +
      `${f2(em?.blTm)} | ${f2(em?.mmsG)} | ${em?.parallelCount ?? 1} | ${f4(x.xPerVoltMmPerV)} | ${f2(x.ceiling.xLimitMm)} | ` +
      `${f2(x.ceiling.allowedVolts)} | ${f2(x.peakInputVolts)} | ${f2(x.ceiling.ceilingDbReInput)} | ` +
      `${'off' in x.acoustic ? x.acoustic.off : `${f4(x.acoustic.xPerVoltMmPerV)} mm/V (${f2(x.acoustic.ratioToElectromechanical)}×)`} |`,
  );
}
for (const why of first.metrics.driveExcursionOff) console.log(`  UIT: ${why}`);
console.log('');

/* ------------------------------------------------------------------ *
 * TABEL 2 — per beschermde weg per netlist, klasse B
 * ------------------------------------------------------------------ */
console.log('TABEL 2 — de AFGELEIDE M-C-grens per beschermde weg per netlist, naast de gestelde en de context');
console.log(
  `| netlist | weg | doorlaatband-gem. |H| dB | afgeleid dB | gesteld ${STATED ?? '—'} | V47 ${CONTEXT_V47_DB} | regel ${CONTEXT_RULE_DB} | poort las | M-C dB | oordeel |`,
);
console.log('|---|---|---|---|---|---|---|---|---|---|');
const rows: { key: string; way: string; derived: number | null; mc: number; pass: boolean; source: string }[] = [];
for (const key of keys) {
  const r = buildReport({ manifest, files, geometry, settings: BASE, filter: casus1Filter(key, manifest, files, golden) });
  const ceilings = new Map(r.metrics.driveExcursion.map((x) => [x.driver, x.ceiling.ceilingDbReInput]));
  for (const v of r.gates.verdicts) {
    if (v.gate !== 'M-C' || v.value === null) continue;
    const dv = r.metrics.driveVoltage.find((d) => d.driver === v.subject);
    const ceiling = ceilings.get(v.subject);
    const derived = dv && ceiling !== undefined ? derivedDriveLimitDb(ceiling, dv.passbandMeanDb) : null;
    const src = String(v.parameters?.limit_source ?? '—');
    rows.push({ key, way: v.subject, derived, mc: v.value, pass: v.pass, source: src });
    console.log(
      `| ${key} | ${v.subject} | ${f2(dv?.passbandMeanDb)} | ${f2(derived)} | ${STATED ?? '—'} | ${CONTEXT_V47_DB} | ${CONTEXT_RULE_DB} | ` +
        `${src.startsWith('stated') ? 'gesteld' : 'afgeleid'} | ${f2(v.value)} | ${v.active ? (v.pass ? 'binnen' : 'EROVERHEEN') : 'uit'} |`,
    );
  }
}
console.log('');

/* Samenvatting: hoeveel wegen zou de AFGELEIDE grens alleen weigeren, en hoeveel de gestelde. */
const live = rows.filter((r) => /^KAND_V2_\d+$/.test(r.key));
const overDerived = rows.filter((r) => r.derived !== null && r.mc > r.derived);
const overStated = STATED === null ? [] : rows.filter((r) => r.mc > STATED);
const derivedStricter = rows.filter((r) => r.derived !== null && STATED !== null && r.derived < STATED);
console.log(`wegen in tabel 2: ${rows.length} (levend corpus ${live.length})`);
console.log(`  eroverheen op de AFGELEIDE grens alleen: ${overDerived.length}` + (overDerived.length ? ` — ${overDerived.map((r) => `${r.key}/${r.way} (${f2(r.mc)} > ${f2(r.derived)})`).join(', ')}` : ''));
console.log(`  eroverheen op de GESTELDE ${STATED} alleen: ${overStated.length}`);
console.log(`  wegen waar de afgeleide grens STRENGER is dan de gestelde: ${derivedStricter.length}` + (derivedStricter.length ? ` — ${derivedStricter.map((r) => `${r.key}/${r.way} (${f2(r.derived)})`).join(', ')}` : ''));
const byWay = new Map<string, number[]>();
for (const r of rows) if (r.derived !== null) byWay.set(r.way, [...(byWay.get(r.way) ?? []), r.derived]);
for (const [way, ds] of byWay) {
  console.log(`  afgeleide grens op ${way}: min ${f2(Math.min(...ds))}, max ${f2(Math.max(...ds))} dB over ${ds.length} netlists`);
}
console.log('');

/* ------------------------------------------------------------------ *
 * TABEL 3 — de zwakste schakel
 * ------------------------------------------------------------------ */
console.log('TABEL 3 — zwakste schakel: de weg zonder hoogdoorlaat bij de piekingang');
console.log('| netlist | weg | x op f0 mm | % van limiet | grens gehaald vanaf Hz | ergste mm @ Hz |');
console.log('|---|---|---|---|---|---|');
for (const key of ['HUIDIG', 'KAND_A', 'KAND_B', ...keys.filter((k) => /^KAND_V2_\d+$/.test(k))]) {
  if (!netlists[key]) continue;
  const r = buildReport({ manifest, files, geometry, settings: BASE, filter: casus1Filter(key, manifest, files, golden) });
  for (const w of r.metrics.weakestLink) {
    console.log(
      `| ${key} | ${w.driver} | ${f2(w.xAtF0Mm)} | ${f2(w.fractionOfLimit * 100)} | ${w.reachesLimitAtHz === null ? 'nooit op dit raster' : f2(w.reachesLimitAtHz)} | ${f2(w.worstMm)} @ ${f2(w.worstAtHz)} |`,
    );
  }
}
