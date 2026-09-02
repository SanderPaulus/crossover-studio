/**
 * V47 — DE TWEETERBESCHERMING GEMETEN VOORDAT ER IETS GESTELD WORDT.
 *
 * `npx vite-node scripts/measure-v47-drive.ts [SLEUTEL ...]` — seconden, geen
 * ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt.
 *
 * DE VRAAG. De volle-band-veiligheidspoort van de tuner weigert een tune
 * WHOLESALE zodra `protSqDb` meer dan 3 dB² boven die van het ZAAD ligt
 * ("tweeter protection got worse"). Dat is een RELATIEVE regel: hij oordeelt
 * over de afstand tot een zaad dat niemand tegen deze eis heeft gelegd. In het
 * V45-veld weigerde hij vier van de vijftien kandidaten, en alle vier haalden
 * zij de gestelde versterkervloer. Wat er ABSOLUUT aan de hand was met hun
 * tweeterbescherming staat nergens.
 *
 * WAT ER GEMETEN WORDT. M-C — de aandrijfspanning op de eigen resonantie van
 * een hoogdoorlaatbeschermde weg, tegen het gemiddelde over haar doorlaatband
 * (A4, F1-conventie: de doorlaatband volgt uit de gevonden kruispunten, en het
 * gemiddelde wordt in dB genomen) — op ÉLKE bevroren netlist, en per weg en
 * niet alleen op de tweeter. Dat laatste is de reden dat dit script bestaat:
 * de klasse-B-referentie `V_tweeter_op_fs_dB` noteert alleen de tweeter,
 * terwijl de poort `maxDriveOnFsDb` élke hoogdoorlaatbeschermde weg oordeelt.
 * Een eis die op de tweeterwaarde gesteld wordt, oordeelt dus ook de mid.
 *
 * TABEL 2 is de sanity die V42 afdwingt: waar ligt HUIDIG, het goedgekeurde
 * ontwerp, en welke gestelde waarde op één decimaal laat hem nog net toe?
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal waarop
 * de gestelde eis van V47 rust.
 */

import {
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;

/** De ordes die het casusboek stelt; élke casus-1-test stelt dezelfde (V15). */
const BASE: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  /* V49 — de excursie-invoer, zodat de M-C-kolom hier dezelfde grens leest als
   * de poort (gesteld of afgeleid, de strengste). */
  ...casus1ExcursionSettings(golden),
};

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);

interface Row {
  key: string;
  drives: { driver: string; db: number; fsHz: number; band: [number, number] }[];
}

const rows: Row[] = [];
for (const key of keys) {
  const r = buildReport({
    manifest,
    files,
    geometry,
    settings: BASE,
    filter: casus1Filter(key, manifest, files, golden),
  });
  /* Uit de POORTOORDELEN en niet uit `metrics.driveVoltage`: het rapport telt
   * alleen de wegen mee die het hoogdoorlaatbeschermd noemt, en precies die
   * verzameling is wat `maxDriveOnFsDb` zou oordelen. */
  const drives = r.gates.verdicts
    .filter((v) => v.gate === 'M-C' && v.value !== null)
    .map((v) => ({
      driver: v.subject,
      db: v.value as number,
      fsHz: Number(String(v.parameters?.f_s ?? '0').replace(/[^0-9.]/g, '')),
      band: [0, 0] as [number, number],
      bandText: String(v.parameters?.passband ?? ''),
    }));
  rows.push({ key, drives: drives as Row['drives'] });
  const txt = drives
    .map((d) => `${d.driver} ${d.db.toFixed(2)} dB @ ${d.fsHz.toFixed(0)} Hz`)
    .join('   |   ');
  console.log(`${key.padEnd(20)} ${txt || '— geen hoogdoorlaatbeschermde weg —'}`);
}

/* ------------------------------------------------------------------ *
 * TABEL 2 — waar HUIDIG ligt, en wat dat toelaat
 * ------------------------------------------------------------------ */
const worstOf = (key: string): number | null => {
  const r = rows.find((x) => x.key === key);
  if (!r || r.drives.length === 0) return null;
  return Math.max(...r.drives.map((d) => d.db));
};

console.log('');
console.log('DE SANITY (V42-les) — het goedgekeurde ontwerp mag de eis niet schenden');
for (const key of ['HUIDIG', 'KAND_A', 'KAND_B']) {
  const w = worstOf(key);
  if (w === null) continue;
  /* De strengste waarde op één decimaal die deze netlist nog toelaat: naar
   * BENEDEN afgerond op de dB-schaal is hier naar boven in strengheid, want
   * M-C is een maximum en de waarden zijn negatief. */
  const strictest = Math.ceil(w * 10) / 10;
  console.log(
    `${key.padEnd(10)} slechtste weg ${w.toFixed(3)} dB → strengste eis op één decimaal ` +
      `${strictest.toFixed(1)} dB`,
  );
}
