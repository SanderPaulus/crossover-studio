/**
 * V47 — WAT DE RELATIEVE REGEL PRECIES MAT OP DE VIER GEWEIGERDE TUNES.
 *
 * `npx vite-node scripts/measure-v47-rejections.ts [LABEL ...]` — VIER
 * KETENRUNS, ordegrootte een half uur tot twee uur. Zonder argumenten draait
 * hij precies de kandidaten die `casus1_v2_herkomst.json` als
 * `kinds: ['protection']` geweigerd registreert; het script LEEST die lijst en
 * typt hem niet over, zodat een volgende regeneratie hem meebeweegt.
 *
 * DE VRAAG. De volle-band-veiligheidspoort weigerde vier van de vijftien
 * V45-kandidaten met "tweeter protection got worse". Dat is een RELATIEVE
 * regel: `protSqDb` van het geleverde netwerk tegen `protSqDb` van het ZAAD,
 * plus een vaste speling. Wat er ABSOLUUT aan de hand was — M-C, de
 * aandrijfspanning op de eigen resonantie tegen de doorlaatband — staat
 * nergens, want het geweigerde netwerk wordt niet weggeschreven.
 *
 * WAT DIT SCRIPT DOET. Het draait dezelfde kandidaten door dezelfde route
 * (`handleV2Request`, payload eerst door `structuredClone`, zoals `postMessage`
 * hem serialiseert) en leest twee dingen uit één run:
 *
 *   · `refusal.measured` — de zaadwaarde, de tunewaarde en de speling van élke
 *     vergelijking die vuurde. Sinds V47 draagt de weigering die getallen
 *     (instrumentatie, v2-only);
 *   · M-C op de GEWEIGERDE onderdelenlijst (`rejectedParts`), gemeten door
 *     `buildReport` — precies dezelfde functie die élke bevroren netlist meet,
 *     zodat de twee kolommen vergelijkbaar zijn.
 *
 * HIJ WAPENT DE M-C-POORT NIET. Dat is de bedoeling: dit is de VOOR-meting, en
 * zij moet de V45-run reproduceren. Zolang `gestelde_eisen` geen
 * `tweeter_drive_op_fs_max_dB` draagt is `CASUS1_V2_GATES` ongewijzigd en is
 * `protectionRule` ABSENT, dus draait hier de historische regel.
 *
 * Dit script stelt niets en wijzigt niets.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { serializeFilter } from '../src/lib/filterFile.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  handleV2Request,
  type V2Chain3Payload,
  type V2Response,
} from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import {
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_TARGET_CURVE,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const HERKOMST = join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json');
/** Waar de geweigerde netlists landen — buiten `casus1/`, want zij zijn geen
 *  casusboek-netlist en mogen door geen enkele test worden opgepikt. */
const OUT_DIR = join(HERE, '..', 'test-fixtures', '.casus1-v47-refused');
mkdirSync(OUT_DIR, { recursive: true });
const slug = (s: string) => s.replace(/[^0-9A-Za-z.]+/g, '-');

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const BASE = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: { ...BASE, reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM }, targetCurve: CASUS1_TARGET_CURVE },
});
const facts = casus1V2Facts(report, manifest, files);
const field = casus1Field(report);
const gridded: {
  grid: readonly number[];
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: ReturnType<typeof casus1ChainInput>['safety'];
} = casus1ChainInput(manifest, files, golden);

/** De labels die het verslag als PROTECTION-weigering registreert. */
const recorded: { label: string; kinds: string[] }[] = (
  JSON.parse(readFileSync(HERKOMST, 'utf-8')) as { verwerpingen: { label: string; kinds: string[] }[] }
).verwerpingen;
const argv = process.argv.slice(2);
const labels =
  argv.length > 0
    ? argv
    : recorded.filter((r) => r.kinds.includes('protection')).map((r) => r.label);

console.log(`kandidaten: ${labels.length}`);
for (const l of labels) console.log(`  ${l}`);
console.log('');

type DoneData = {
  result: Chain3Result;
  notes: string[];
  rejection: { rejectedTune: { driveOnFsDb: number | null } | null } | null;
};

interface Row {
  label: string;
  seedSqDb: number | null;
  tuneSqDb: number | null;
  allowance: number | null;
  drive: { driver: string; db: number }[];
  metric: { driver: string; db: number }[];
  reportedDriveDb: number | null;
  seconds: number;
}
const rows: Row[] = [];

let n = 0;
for (const c of field.field.candidates) {
  if (!labels.includes(c.label)) continue;
  n++;
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const payload: V2Chain3Payload = {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
    },
    candidate: casus1V2Declaration(c, gridded.safety),
  };
  const t0 = Date.now();
  const collected: DoneData[] = [];
  handleV2Request(structuredClone({ id: n, kind: 'v2Chain3One' as const, payload }), (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as DoneData);
  });
  const done = collected[0];
  if (!done) throw new Error(`candidate ${c.label} produced nothing`);
  const net = done.result.net;
  const prot = net.refusal?.measured?.find((m) => /protection/i.test(m.quantity)) ?? null;
  /* V47 — M-C VAN HET GEWEIGERDE NETWERK KOMT UIT DE WEIGERING ZELF, en dat is
   * geen omweg maar de enige weg. `runCandidate` WIST `rejectedParts` voordat
   * het resultaat naar buiten gaat (V31: een kandidaat die niets levert mag
   * niets uitleveren dat iemand als netlist kan wegschrijven), dus van hier is
   * de geweigerde netlist principieel onmeetbaar. De worker meet hem sinds V47
   * door dezelfde `evaluateGates` waarmee hij een GELEVERD netwerk zou hebben
   * geoordeeld, zodat de kolom vergelijkbaar is met die van het veld.
   * De eerste versie van dit script probeerde het van buitenaf en kreeg een
   * lege kolom terug — wat als "geen resonantie" leest terwijl het "geen
   * onderdelen" betekende. */
  const rejected = net.rejectedParts ?? null;
  const reportedDriveDb = done.rejection?.rejectedTune?.driveOnFsDb ?? null;
  const drive: { driver: string; db: number }[] = [];
  /* DE METRIEK NAAST HET OORDEEL, en dat onderscheid is de hele reden dat deze
   * twee regels apart staan. `gates.verdicts` bevat M-C alleen voor de wegen
   * die het rapport HOOGDOORLAATBESCHERMD noemt; `metrics.driveVoltage` bevat
   * hem voor élke weg met een resonantie in het spel. Een geweigerde tune die
   * de hoogdoorlaat heeft weggehaald levert dus wél een metriekwaarde en GEEN
   * poortoordeel — en dat verschil is precies wat de eerste meting liet zien
   * als een lege kolom, wat niets verklaart. */
  const metric: { driver: string; db: number }[] = [];
  let refusedFile: string | null = null;
  if (rejected) {
    /* De geweigerde netlist wordt WEGGESCHREVEN. De eerste meting hield hem
     * alleen in het geheugen, en toen het proces eindigde was er honderd
     * minuten rekentijd weg voor één regel tekst. Een ketenrun van een kwartier
     * hoort niet twee keer te hoeven. */
    refusedFile = join(OUT_DIR, `refused-${slug(c.label)}.adsfilter.json`);
    writeFileSync(refusedFile, serializeFilter({ name: `refused ${c.label}`, parts: [...rejected] }), 'utf-8');
    const r = buildReport({
      manifest,
      files,
      geometry,
      settings: BASE,
      filter: casus1FilterFromParts(`refused ${c.label}`, rejected, manifest, files),
    });
    for (const v of r.gates.verdicts) {
      if (v.gate === 'M-C' && v.value !== null) drive.push({ driver: v.subject, db: v.value });
    }
    for (const d of r.metrics.driveVoltage) metric.push({ driver: d.driver, db: d.db });
    console.log(
      `      geweigerde netlist → ${refusedFile}\n` +
        `      M-C als POORT: ${drive.map((d) => `${d.driver} ${d.db.toFixed(2)}`).join(', ') || 'GEEN — geen enkele weg is hoogdoorlaatbeschermd'}\n` +
        `      M-C als METRIEK: ${metric.map((d) => `${d.driver} ${d.db.toFixed(2)}`).join(', ') || 'geen'}`,
    );
  }
  rows.push({
    label: c.label,
    seedSqDb: prot?.seed ?? null,
    tuneSqDb: prot?.result ?? null,
    allowance: prot?.allowance ?? null,
    drive,
    metric,
    reportedDriveDb,
    seconds: (Date.now() - t0) / 1000,
  });
  console.log(
    `[${n}/${labels.length}] ${c.label}  ${net.refusal ? `refused by ${net.refusal.kinds.join(',') || '—'}` : 'DELIVERED'}` +
      `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
}

console.log('');
console.log('DE RELATIEVE REGEL, WAT ZIJ MAT (protSqDb — gemiddeld kwadratisch tekort boven de −15 dB-vloer)');
console.log('kandidaat                                        zaad     tune   speling   verschil');
for (const r of rows) {
  if (r.seedSqDb === null || r.tuneSqDb === null) {
    console.log(`${r.label.padEnd(46)}  — geen protectievergelijking gevuurd —`);
    continue;
  }
  console.log(
    `${r.label.padEnd(46)} ${r.seedSqDb.toFixed(3).padStart(8)} ${r.tuneSqDb.toFixed(3).padStart(8)} ` +
      `${(r.allowance ?? 0).toFixed(1).padStart(9)} ${(r.tuneSqDb - r.seedSqDb).toFixed(3).padStart(10)}`,
  );
}

console.log('');
console.log('DE ABSOLUTE GROOTHEID OP DEZELFDE GEWEIGERDE NETWERKEN (M-C, dB)');
console.log('kandidaat                                      slechtste beschermde weg');
for (const r of rows) {
  console.log(
    `${r.label.padEnd(46)} ${(r.reportedDriveDb === null ? '—' : r.reportedDriveDb.toFixed(2)).padStart(12)}`,
  );
}
console.log(
  'Gemeten door de WORKER op de geweigerde onderdelen, via dezelfde evaluateGates waarmee een ' +
    'geleverd netwerk geoordeeld wordt. `—` betekent dat het geweigerde netwerk GEEN ' +
    'hoogdoorlaatbeschermde weg meer heeft — en dan zou de absolute poort er niets over zeggen.',
);
