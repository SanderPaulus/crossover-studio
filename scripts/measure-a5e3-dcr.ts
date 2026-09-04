/**
 * A5e.3 — WAT EEN DCR-MODEL DOET OP DE NETLISTS DIE ER LIGGEN, vóór er iets in
 * de zoektocht verandert.
 *
 * `npx vite-node scripts/measure-a5e3-dcr.ts [SLEUTEL ...]` — seconden, geen
 * ketenrun en geen enkele tune. Zonder argumenten: HUIDIG, de drie V51b-netlists
 * met een M-1-tegenhanger, en élk netwerk (zaad, geweigerde tune, geleverd) dat
 * `measure-m1-diagnose-arms.ts` in `test-fixtures/casus1_m1_diagnose/` heeft
 * achtergelaten. De families per weg komen uit `driverkaart.spoelfamilie` (het
 * VOORSTEL van A5e.3, expliciet gelezen — dit script stelt niets) en de fits uit
 * de catalogus die dat blok noemt.
 *
 * DRIE TABELLEN.
 *  (1) DE FITS per familie: k, A (Ω @ 1 mH), bereik, n, residu — het
 *      bewijsmateriaal onder de keuze van de families.
 *  (2) PER NETLIST vóór/ná stempelen: min |Z| van de som (20 Hz–20 kHz) en van
 *      elke tak alleen, de totale DCR die het netwerk draagt, en per weg de
 *      serieweerstand (levelWork.ts: discreet + DCR = totaal) tegen het
 *      V51b-maximum van 1,0 Ω — hoeveel ruimte er in die 1,0 Ω overblijft voor
 *      een component zodra de DCR meetelt. Plus Q_es× (M-E op de laagste weg)
 *      en de lift (M-D, resistief) vóór/ná, uit `buildReport` op dezelfde
 *      meetset als het rapport ze leest.
 *  (3) PER SPOEL van elk netlist: weg, L, DCR zonder en met model, binnen het
 *      enkel-onderdeel-bereik of niet.
 *
 * De vloer wordt uit het manifest gelezen (`casus1AmpMinLoadOhm`), nooit getypt;
 * het V51b-maximum uit `v51b_corpus.reden` als gedateerde runparameter, met bron.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { acceptedAmpFloor, meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { levelWorkOnWay } from '../src/lib/levelWork.ts';
import { coilDcrInventory, describeCoilDcrModel, stampCoilDcr } from '../src/lib/coilDcr.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { decompose } from './v38-groups.ts';
import {
  casus1AmpMinLoadOhm,
  casus1CoilDcrFits,
  casus1CoilDcrModel,
  casus1Files,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';

/** Het raster van de |Z|-lezing: het hele hoorbare bereik (zelfde als de M-1-diagnose). */
const DIAG_GRID_HZ: [number, number] = [20, 20000]; // P6-OK: audiobereik, geen projectgetal
const DIAG_GRID_POINTS = 600;
/** Het V51b-maximum op de laagste weg — een GEDATEERDE runparameter (`v51b_corpus.reden`, ca4b4fe), hier om de ruimte erin te lezen. */
const V51B_SERIES_R_MAX_OHM = 1.0;
const H_PER_MH = 1e-3;

const HERE = dirname(fileURLToPath(import.meta.url));
const ARM_DIR = join(HERE, '..', 'test-fixtures', 'casus1_m1_diagnose');
const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const grid = logspace(DIAG_GRID_HZ[0], DIAG_GRID_HZ[1], DIAG_GRID_POINTS);
const FLOOR_OHM = casus1AmpMinLoadOhm(golden);

const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f3 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(3));
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));

/* ---- (1) de fits ---- */
const { fits, label } = casus1CoilDcrFits(golden);
const { model, stated, missing } = casus1CoilDcrModel(golden);
console.log('A5e.3 — DCR uit de catalogusfit op de liggende netlists');
console.log(`catalogus: ${label}; families per weg ${stated ? 'GESTELD' : 'als VOORSTEL gelezen'}${missing.length ? `; niet gevonden: ${missing.map((m) => `${m.way} (${m.family})`).join(', ')}` : ''}`);
if (!model) throw new Error('het manifest noemt geen spoelfamilie per weg; niets te meten');
console.log(`model: ${describeCoilDcrModel(model)}; ${model.fitVersion}`);
console.log('');
console.log('DE FITS PER FAMILIE (DCR = A · (L/mH)^k, log-log kleinste kwadraten op de SKU-DCR):');
console.log('| familie | n | L-bereik mH | k | A Ω @ 1 mH | rms % | max % |');
console.log('|---|---|---|---|---|---|---|');
for (const f of fits) {
  console.log(`| ${f.label} | ${f.n} | ${(f.rangeH[0] / H_PER_MH).toPrecision(2)}–${(f.rangeH[1] / H_PER_MH).toPrecision(3)} | ${f3(f.k)} | ${f3(f.ohmAt1mH)} | ${f2(f.rmsPct)} | ${f2(f.maxPct)} |`);
}
console.log('');

/* ---- de meetbank ---- */
const driverZ: Record<string, Complex[]> = (() => {
  const probe = casus1FilterFromParts('probe', [], manifest, files);
  const out: Record<string, Complex[]> = {};
  for (const [drv, z] of Object.entries(probe.driverZ)) out[drv] = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z;
  return out;
})();

function minZ(parts: readonly VxpPart[]): { ohm: number; hz: number } | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'a5e3', parts: [...parts] } as VxpCrossover);
    const mag = solveNetwork(netlist, grid, driverZ).inputZ.map((c) => Math.hypot(c.re, c.im));
    let i0 = 0;
    for (let i = 1; i < mag.length; i++) if (mag[i] < mag[i0]) i0 = i;
    return { ohm: mag[i0], hz: grid[i0] };
  } catch {
    return null;
  }
}

function branchOnly(parts: readonly VxpPart[], branch: string): VxpPart[] {
  const groups = decompose(parts);
  const keep = new Set<string>();
  for (const g of groups) if (g.branch === branch) for (const id of g.partIds) keep.add(id);
  return parts.filter(
    (p) => p.type === 'Generator' || p.type === 'Ground' || p.type === 'Wire' || (p.type === 'Driver' && p.model === branch) || (p.partId !== undefined && keep.has(p.partId)),
  );
}

function report(name: string, parts: readonly VxpPart[]): EngineV2Report {
  return buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts(name, parts, manifest, files),
    geometry,
    settings: {
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
      ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
      ...CASUS1_BUILDABILITY,
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      ...CASUS1_EXCURSION,
      coilDcrFamilyByDriver: { ...model!.familyByWay },
      coilDcrFits: fits,
    },
  });
}

interface Reading {
  sumMin: { ohm: number; hz: number } | null;
  branchMin: Record<string, { ohm: number; hz: number } | null>;
  dcrTotal: number;
  lowestSeries: { discrete: number; dcr: number; total: number } | null;
  qesMult: number | null;
  liftDb: number | null;
  resonantDb: number | null;
}

function read(name: string, parts: readonly VxpPart[]): Reading {
  const branches = ['woofer', 'mid', 'tweeter'];
  const branchMin: Reading['branchMin'] = {};
  for (const b of branches) branchMin[b] = minZ(branchOnly(parts, b));
  const inv = coilDcrInventory(parts, model);
  const lw = levelWorkOnWay(parts, 'woofer');
  let qesMult: number | null = null;
  let liftDb: number | null = null;
  let resonantDb: number | null = null;
  try {
    const r = report(name, parts);
    const th = r.metrics.thevenin.find((t) => t.driver === 'woofer');
    qesMult = th?.qMultiplier ?? null;
    const lb = r.metrics.lfBump.find((x) => x.driver === 'woofer')?.result;
    liftDb = lb?.liftDb ?? null;
    resonantDb = lb?.resonantDb ?? null;
  } catch (e) {
    console.log(`  (rapport op ${name} mislukt: ${(e as Error).message})`);
  }
  return {
    sumMin: minZ(parts),
    branchMin,
    dcrTotal: inv.carriedTotalOhm,
    lowestSeries: lw.reachable ? { discrete: lw.seriesOhm, dcr: lw.dcrOhm, total: lw.totalSeriesOhm } : null,
    qesMult,
    liftDb,
    resonantDb,
  };
}

interface Subject {
  key: string;
  parts: VxpPart[];
}
const subjects: Subject[] = [];
const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['HUIDIG', 'V51B_KAND_1', 'V51B_KAND_6', 'V51B_KAND_3'];
for (const key of keys) {
  const file = netlists[key];
  if (!file) throw new Error(`het casusboek kent geen netlist ${key}`);
  subjects.push({ key, parts: deserializeFilter(readFileSync(join(CASUS1_DIR, file), 'utf-8')).parts });
}
if (existsSync(ARM_DIR)) {
  for (const f of readdirSync(ARM_DIR).filter((x) => x.endsWith('.json') && x !== 'samenvatting.json').sort()) {
    const arm = JSON.parse(readFileSync(join(ARM_DIR, f), 'utf-8')) as { arm: string; seedParts: VxpPart[] | null; deliveredParts: VxpPart[] | null; rejectedParts: VxpPart[] | null };
    if (arm.seedParts) subjects.push({ key: `${arm.arm} ZAAD`, parts: arm.seedParts });
    if (arm.rejectedParts) subjects.push({ key: `${arm.arm} GEWEIGERDE TUNE`, parts: arm.rejectedParts });
    if (arm.deliveredParts) subjects.push({ key: `${arm.arm} GELEVERD`, parts: arm.deliveredParts });
  }
}

/* ---- (2) vóór/ná per netlist ---- */
console.log(`VÓÓR/NÁ HET MODEL PER NETLIST — |Z| over ${DIAG_GRID_HZ[0]}–${DIAG_GRID_HZ[1]} Hz; vloer ${FLOOR_OHM ?? '—'} Ω (geaccepteerd vanaf ${FLOOR_OHM !== null ? acceptedAmpFloor(FLOOR_OHM).toFixed(3) : '—'}); Q_es× en lift uit buildReport op de gemergede set:`);
console.log('| netlist | DCR totaal vóór→ná Ω | som min \\|Z\\| vóór → ná (Hz) | vloer | woofer alleen vóór → ná | mid alleen | tweeter alleen | serie-R woofer (R + DCR = totaal) vóór → ná | ruimte in 1,0 Ω | Q_es× vóór → ná | lift dB vóór → ná | opslingering dB vóór → ná |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
const summary: Record<string, unknown> = {};
const perCoil: { key: string; rows: ReturnType<typeof coilDcrInventory>['coils'] }[] = [];
for (const sbj of subjects) {
  const before = read(`${sbj.key} vóór`, sbj.parts);
  const stamped = stampCoilDcr(sbj.parts, model);
  const after = read(`${sbj.key} ná`, stamped.parts);
  const mz = (r: { ohm: number; hz: number } | null) => (r ? `${f2(r.ohm)}` : '—');
  const mzHz = (a: Reading['sumMin'], b: Reading['sumMin']) => `${mz(a)} → ${mz(b)} (${f0(a?.hz)} → ${f0(b?.hz)})`;
  const floorWord = FLOOR_OHM === null ? '—' : `${before.sumMin && meetsAmpFloor(before.sumMin.ohm, FLOOR_OHM) ? 'ja' : 'nee'} → ${after.sumMin && meetsAmpFloor(after.sumMin.ohm, FLOOR_OHM) ? 'JA' : 'nee'}`;
  const ser = (r: Reading['lowestSeries']) => (r ? `${f2(r.discrete)} + ${f2(r.dcr)} = ${f2(r.total)}` : '—');
  const room = after.lowestSeries ? V51B_SERIES_R_MAX_OHM - after.lowestSeries.dcr : null;
  console.log(
    `| ${sbj.key} | ${f2(before.dcrTotal)} → ${f2(after.dcrTotal)} | ${mzHz(before.sumMin, after.sumMin)} | ${floorWord} | ` +
      `${mz(before.branchMin.woofer)} → ${mz(after.branchMin.woofer)} | ${mz(before.branchMin.mid)} → ${mz(after.branchMin.mid)} | ${mz(before.branchMin.tweeter)} → ${mz(after.branchMin.tweeter)} | ` +
      `${ser(before.lowestSeries)} → ${ser(after.lowestSeries)} | ${room === null ? '—' : `${f2(room)} Ω voor een component`} | ` +
      `${f3(before.qesMult)} → ${f3(after.qesMult)} | ${f2(before.liftDb)} → ${f2(after.liftDb)} | ${f2(before.resonantDb)} → ${f2(after.resonantDb)} |`,
  );
  summary[sbj.key] = { voor: before, na: after, gestempeld: stamped.stamped, verliesvrij: stamped.lossless };
  perCoil.push({ key: sbj.key, rows: coilDcrInventory(stamped.parts, model).coils });
}
console.log('');

/* ---- (3) per spoel ---- */
console.log('PER SPOEL — weg, L, DCR uit het model, binnen het enkel-onderdeel-bereik van de familie:');
console.log('| netlist | spoel | weg | L mH | DCR model Ω | familie | enkel onderdeel? |');
console.log('|---|---|---|---|---|---|---|');
for (const pc of perCoil) {
  for (const r of pc.rows) {
    console.log(`| ${pc.key} | ${r.id} | ${r.ways.join('+') || '—'} | ${f3(r.henry / H_PER_MH)} | ${f3(r.carriedOhm)} | ${r.family ?? '— (verliesvrij)'} | ${r.inRange === null ? '—' : r.inRange ? 'ja' : 'NEE (stapel)'} |`);
  }
}
console.log('');
console.log(`(dit script stelt niets en wijzigt niets: de families zijn ${stated ? 'GESTELD' : 'het A5e.3-VOORSTEL'}, gelezen uit driverkaart.spoelfamilie)`);
