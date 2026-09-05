/**
 * A5e.3b — DE VÓÓRMETING, drie tabellen, seconden, geen ketenrun en geen tune.
 *
 * `npx vite-node scripts/measure-a5e3b-voormeting.ts`
 *
 * (b)3 HET VELD ONDER DE NIEUWE GRENZEN. De M-T-vloer is sinds A5e.3b de
 *     strengste van gesteld en afgeleid (het gestelde −20 dB bij orde 4 tegen
 *     de excursievloer en k·f_s), en de zoekdoos plus de synthese dragen de
 *     spanwijdte van de gestelde spoelfamilie. Geen van beide vraagt een
 *     regeneratie om het VELD te zien: dit script herleidt het met budget 24
 *     en zet de zeven geleverde A5e.3-veld-posities ernaast — de vóórmeting
 *     voor de volgende regeneratie (die is de volgende sessie, mét Sanders
 *     keuze uit de ablatie van deel (a)).
 *
 * (c)2 WAT DE VERLENGDE BARRIÈRE-UITGESTREKTHEID OP DE ZEVEN VERANDERT: per
 *     levende netlist min |Z| op het veiligheidsraster (de A5e.3-veld-lezing),
 *     op het verlengde raster (`extendGridToSweepExtent`, wat 'safety-extended'
 *     leest) en op het poortraster zelf, met het vloeroordeel per lezing. Het
 *     opslingeringsPLAFOND staat ernaast en hoort NIET te bewegen: de
 *     A5d.6-inversie las de sweep altijd al — dat het niet beweegt is de
 *     meting, geen aanname.
 *
 * (c)3 DE WEZEN: per levende netlist de resonantieloze shunt-ketens op de
 *     laagste weg (level-work/1.2) en het oordeel dat de regel er sinds
 *     A5e.3b over velt.
 *
 * Dit script stelt niets en wijzigt niets.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { extendGridToSweepExtent, systemMinImpedanceOhm } from '../src/lib/netOptimizer.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { meetsAmpFloor, minImpedanceAt } from '../src/lib/impedanceFloor.ts';
import { levelWorkOnWay, levelWorkVerdict } from '../src/lib/levelWork.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { freezeGateReference } from '../src/lib/engine2/optimizer/gates.ts';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_LF_RESONANT_BUDGET_DB,
  CASUS1_LOWEST_WAY_COIL_SPAN_H,
  CASUS1_LOWEST_WAY_LEVEL_WORK,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  casus1ChainInput,
  casus1Field,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusOf } from '../src/lib/engine2/casus1Corpora.fixture.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;

const baseSettings = {
  ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
  ...CASUS1_BUILDABILITY,
  ...CASUS1_LEVEL_WORK_SETTINGS,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...CASUS1_EXCURSION,
  ...CASUS1_COIL_DCR_SETTINGS,
};
const reportWith = (statedFigure: boolean): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings: {
      ...baseSettings,
      ...(statedFigure && Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
    },
  });

const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));
const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));

/* ---------------- (b)3: het veld ---------------- */
const NEW = reportWith(true); // het gestelde getal bereikt de vensters (A5e.3b)
const OLD = reportWith(false); // de A5e.3-veld-stand: alleen de excursievloer
console.log('=== (b)3 — DE VENSTERS EN HET VELD ONDER DE NIEUWE GRENZEN ===');
for (const [i, pair] of (['woofer→mid', 'mid→tweeter'] as const).entries()) {
  const wNew = NEW.predesign.windows[i];
  const wOld = OLD.predesign.windows[i];
  console.log(`\n${pair}:`);
  console.log(`  A5e.3-veld: ${f0(wOld.floorHz)}–${f0(wOld.ceilingHz)} Hz (vloer ${wOld.floorBy?.rule})`);
  console.log(`  A5e.3b:     ${f0(wNew.floorHz)}–${f0(wNew.ceilingHz)} Hz (vloer ${wNew.floorBy?.rule})`);
  for (const l of wNew.limits.filter((x) => x.side === 'floor')) {
    console.log(`    vloer-limiet ${l.rule}: ${f0(l.hz)} Hz`);
  }
}
const fieldNew = casus1Field(NEW);
const fieldOld = casus1Field(OLD);
console.log(`\nveld A5e.3-veld: ${fieldOld.field.parameters.derivedSize} afgeleid → ${fieldOld.field.parameters.deliveredSize} geleverd (budget ${fieldOld.field.parameters.chainBudget})`);
console.log(`veld A5e.3b:     ${fieldNew.field.parameters.derivedSize} afgeleid → ${fieldNew.field.parameters.deliveredSize} geleverd (budget ${fieldNew.field.parameters.chainBudget})`);
for (const [i, ax] of fieldNew.field.axes.entries()) {
  const old = fieldOld.field.axes[i];
  console.log(`  as ${ax.pairLabel}: posities ${old.positionsByOrder[0].hz.map(f0).join(', ')}  →  ${ax.positionsByOrder[0].hz.map(f0).join(', ')}`);
}
console.log(`spanwijdte-plafond spoelen laagste weg: ${CASUS1_LOWEST_WAY_COIL_SPAN_H !== null ? `${(CASUS1_LOWEST_WAY_COIL_SPAN_H * 1e3).toFixed(1)} mH` : 'geen (geen familie gesteld)'} — geen vensterinvoer (de val schaalt niet met het kruispunt)`);

/* De zeven geleverde A5e.3-veld-posities tegen het nieuwe venster. */
const live = corpusOf('live');
const hzOf = (label: string): [number, number] | null => {
  const m = label.match(/woofer→mid ([\d.]+) .*mid→tweeter ([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
/* `live.order` is de boekhouding van het HELE veld (twintig); geleverd is wat
 * `byCandidate` een bestand geeft — de zeven. */
const delivered = live.order.filter((l) => live.byCandidate.has(l));
console.log(`\nde ${delivered.length} geleverde A5e.3-veld-kandidaten tegen het A5e.3b-venster:`);
let inside = 0;
for (const label of delivered) {
  const hz = hzOf(label);
  if (!hz) continue;
  const okLow = hz[0] >= (fieldNew.field.axes[0].window['4'].floorHz ?? 0) - 0.5 && hz[0] <= (fieldNew.field.axes[0].window['4'].ceilingHz ?? Infinity) + 0.5;
  const okHigh = hz[1] >= (fieldNew.field.axes[1].window['4'].floorHz ?? 0) - 0.5 && hz[1] <= (fieldNew.field.axes[1].window['4'].ceilingHz ?? Infinity) + 0.5;
  if (okLow && okHigh) inside++;
  console.log(`  ${live.byCandidate.get(label)} · ${label.replace(/ LR4/g, '')}: W-M ${okLow ? 'binnen' : 'BUITEN'} · M-T ${okHigh ? 'binnen' : 'BUITEN'}`);
}
console.log(`binnen het nieuwe venster: ${inside} van ${delivered.length} geleverde`);

/* ---------------- (c)2: de barrière-uitgestrektheid ---------------- */
console.log('\n=== (c)2 — MIN |Z| PER RASTER, EN HET PLAFOND DAT NIET BEWEEGT ===');
const gridded = casus1ChainInput(manifest, files, golden);
const facts = casus1V2Facts(NEW, manifest, files);
const FLOOR = casus1AmpMinLoadOhm(golden);
const partsOf = (key: string): VxpPart[] => deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
const refFor = (key: string) => {
  const filter = casus1Filter(key, manifest, files, golden);
  const ref = freezeGateReference({
    netlist: filter.netlist,
    grid: [...gridded.grid],
    driverZ: gridded.driverZ,
    branchDb: { woofer: gridded.w.spl, mid: gridded.m.spl, tweeter: gridded.t.spl },
    fsHz: facts.fundamentalHzByModel ?? {},
    validHz: facts.validHzByModel ?? {},
    sweeps: Object.fromEntries(
      Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [
        m,
        { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz },
      ]),
    ),
  });
  return { filter, ref };
};
console.log(`| netlist | min\\|Z\\| veiligheid (A5e.3-veld) | min\\|Z\\| verlengd (A5e.3b) | min\\|Z\\| poortraster @ Hz | vloer ${FLOOR ?? '—'} Ω: veiligheid / verlengd / poort | opslinger-plafond mH (rapport, vóór = ná) |`);
console.log('|---|---|---|---|---|---|');
for (const label of delivered) {
  const key = live.byCandidate.get(label)!;
  const { filter, ref } = refFor(key);
  const imp = ref.impedance;
  if (!imp) throw new Error('geen poortreferentie');
  const onSafety = systemMinImpedanceOhm(filter.netlist, gridded.safety.freqs, gridded.safety.z);
  const ext = extendGridToSweepExtent({ freqs: gridded.safety.freqs, z: gridded.safety.z }, imp);
  const onExtended = ext ? systemMinImpedanceOhm(filter.netlist, ext.grid, ext.driverZ) : null;
  const sweepSol = minImpedanceAt(solveNetwork(filter.netlist, imp.grid, imp.driverZ).inputZ);
  const onSweep = sweepSol?.ohm ?? null;
  const sweepHz = sweepSol ? imp.grid[sweepSol.index] : null;
  const v = (x: number | null) => (FLOOR !== null ? (meetsAmpFloor(x, FLOOR) ? '✓' : '✗') : '—');
  const rep = buildReport({
    manifest,
    files,
    filter,
    geometry,
    settings: {
      ...baseSettings,
      maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER },
      ...(CASUS1_LF_RESONANT_BUDGET_DB !== null ? { lfBumpBudgetDb: CASUS1_LF_RESONANT_BUDGET_DB } : {}),
    },
  });
  const bump = rep.predesign.bounds.find((b) => b.rule === 'bump-series-l');
  console.log(
    `| ${key} | ${f2(onSafety)} | ${f2(onExtended)} | ${f2(onSweep)} @ ${f0(sweepHz)} | ${v(onSafety)} / ${v(onExtended)} / ${v(onSweep)} | ${bump ? (bump.maxSI * 1e3).toFixed(3) : '—'} |`,
  );
}
if (delivered.length > 0) {
  const anyExt = extendGridToSweepExtent({ freqs: gridded.safety.freqs, z: gridded.safety.z }, refFor(live.byCandidate.get(delivered[0])!).ref.impedance!);
  console.log(
    `verlengd raster: ${anyExt ? `${anyExt.grid[0].toFixed(1)}–${anyExt.grid[anyExt.grid.length - 1].toFixed(0)} Hz, ${anyExt.grid.length} punten (veiligheid ${gridded.safety.freqs.length} + ${anyExt.addedBelow} eronder + ${anyExt.addedAbove} erboven)` : 'kon niet gebouwd worden'}`,
  );
}
console.log('het opslinger-plafond leest de sweep en het nabije veld en beweegt met (c)2 dus niet — de kolom is de controle, geen delta.');

/* ---------------- (c)3: de wezen ---------------- */
console.log('\n=== (c)3 — RESONANTIELOZE SHUNT-KETENS OP DE LAAGSTE WEG (level-work/1.2) ===');
const rule = CASUS1_LOWEST_WAY_LEVEL_WORK ?? null;
for (const label of delivered) {
  const key = live.byCandidate.get(label)!;
  const inv = levelWorkOnWay(partsOf(key), 'woofer');
  const verdict = levelWorkVerdict(inv, rule);
  console.log(
    `  ${key}: ${inv.resonancelessShunts.length === 0 ? 'geen' : inv.resonancelessShunts.map((c) => c.label).join('; ')}` +
      ` — oordeel onder ${JSON.stringify(rule)}: ${verdict.ok === null ? 'niets gesteld' : verdict.ok ? 'ok' : `GEWEIGERD zou worden: ${verdict.why}`}`,
  );
}
