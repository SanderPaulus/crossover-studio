/**
 * A5e.3-VELD — DE TABEL PER KANDIDAAT, EN DE VERGELIJKING MET V51b EN HUIDIG.
 *
 * `npx vite-node scripts/measure-a5e3-field.ts [SLEUTEL ...]` — seconden, geen
 * ketenrun en geen enkele tune. Zonder argumenten: élke netlist van het LEVENDE
 * corpus (het A5e.3-veld), de zes V51b-netlists, de geregistreerde arm
 * `A5E3ARM_KAND_1` en HUIDIG — allemaal door dezelfde meetbank
 * (`corpusBank(golden, 'merged')`: de gemergede set, de doelcurve van het
 * ontwerp, de gestelde eisen, het gestelde DCR-model), zodat élke kolom
 * hetzelfde meet ongeacht uit welke run een netlist kwam.
 *
 * PER KANDIDAAT DE VOLLE VECTOR (de opdracht van de sessie):
 *   · de netlist zelf — elk onderdeel met waarde, en per spoel de gedragen DCR
 *     (de `DCR`-param die de tuner schreef), de weg en of één catalogusonderdeel
 *     van de gestelde familie de waarde dekt;
 *   · min |Z| met de TAK die het draagt en de frequentie (elke tak alleen aan de
 *     generator, zoals `measure-m1-diagnose.ts` het doet), en de M-B/|Z|-poort;
 *   · TWEE RMS-kolommen: op de VOLLE oordeelband van de zoektocht (vanaf f_p van
 *     de woofer, `CASUS1_V2_BAND_HZ`) en op de band VANAF DE TWEETER-GATE
 *     (`commonBand` van het rapport, 397 Hz) — anders is V51b, dat op de
 *     gepoorte set gezocht is, niet vergelijkbaar; beide via `judgeResponse`,
 *     dezelfde functie, op dezelfde som;
 *   · M-K per paar, M-C per hoogdoorlaatbeschermde weg met zijn grens,
 *     opslingering en lift (M-D), Q_es× (M-E), dissipatie (M-A), de heetste
 *     weerstand bij het THERMISCH ontwerpvermogen (M-A/part, 10 W) en bij het
 *     continue vermogen, M-L, EPDR, de verticale lobing-synthese (M-F-eind),
 *     het niveauwerk op de laagste weg (R + DCR = totaal) en X.
 *
 * GEPAARD TEGEN V51b OP HET DICHTSTBIJZIJNDE KRUISPUNT, MET NAAM. Het A5e.3-veld
 * deelt geen enkel label met V51b (andere posities, andere vloer), dus de
 * gepaarde lezing van `corpusPairing` is n = 0; wat hier "gepaard" heet is per
 * rij de V51b-netlist met de kleinste octaafafstand op beide assen, met haar
 * label erbij — een anekdote per rij, zo gelabeld, en géén corpusdelta. HUIDIG
 * staat in dezelfde tabel, gelabeld "met pad", op zijn eigen kruispunt (~360 Hz):
 * het referentiefilter dat de vloer en de tweeter tegelijk haalt, mét R8.
 *
 * Schrijft `test-fixtures/casus1_a5e3_veld_tabel.json` (dezelfde rijen als de
 * tabel) zodat de entry reproduceerbaar is. Dit script stelt niets en wijzigt
 * niets.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { coilDcrInventory } from '../src/lib/coilDcr.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { decompose, type Group } from './v38-groups.ts';
import { CASUS1_DIR, casus1FilterFromParts, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_COIL_DCR, CASUS1_TARGET_CURVE, CASUS1_THERMAL_DESIGN_POWER_W, CASUS1_V2_BAND_HZ } from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusBank, corpusOf, round2 } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';

/** Het raster van de takanalyse: het hele hoorbare bereik, fijn genoeg voor een smalle dip (M-1-diagnose). */
const DIAG_GRID_HZ: [number, number] = [20, 20000]; // P6-OK: audiobereik, geen projectgetal
const DIAG_GRID_POINTS = 600;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_a5e3_veld_tabel.json');
const golden = loadGolden();
const bank = corpusBank(golden, 'merged');
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const FLOOR = bank.floorOhm;
const grid = logspace(DIAG_GRID_HZ[0], DIAG_GRID_HZ[1], DIAG_GRID_POINTS);
const driverZ: Record<string, Complex[]> = (() => {
  const probe = casus1FilterFromParts('probe', [], bank.manifest, bank.files);
  const out: Record<string, Complex[]> = {};
  for (const [drv, z] of Object.entries(probe.driverZ)) out[drv] = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z;
  return out;
})();

const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));

const partsOf = (key: string): VxpPart[] => deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

/* ---- |Z| per tak: de tak alleen aan de generator (M-1-diagnose) ---------- */
function solveMin(parts: readonly VxpPart[]): { ohm: number; hz: number; idx: number; mag: number[] } | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'tab', parts: [...parts] } as VxpCrossover);
    const mag = solveNetwork(netlist, grid, driverZ).inputZ.map((c) => Math.hypot(c.re, c.im));
    let i = 0;
    for (let k = 1; k < mag.length; k++) if (mag[k] < mag[i]) i = k;
    return { ohm: mag[i], hz: grid[i], idx: i, mag };
  } catch {
    return null;
  }
}
function branchOnly(parts: readonly VxpPart[], groups: readonly Group[], branch: string): VxpPart[] {
  const keep = new Set<string>();
  for (const g of groups) if (g.branch === branch) for (const id of g.partIds) keep.add(id);
  return parts.filter(
    (p) => p.type === 'Generator' || p.type === 'Ground' || p.type === 'Wire' || (p.type === 'Driver' && p.model === branch) || (p.partId !== undefined && keep.has(p.partId)),
  );
}
function minZWithBranch(parts: readonly VxpPart[]): { ohm: number; hz: number; branch: string; perBranch: Record<string, number> } | null {
  const sum = solveMin(parts);
  if (!sum) return null;
  const groups = decompose(parts);
  const branches = [...new Set(groups.map((g) => g.branch).filter((b) => b !== ''))];
  const perBranch: Record<string, number> = {};
  for (const b of branches) {
    const c = solveMin(branchOnly(parts, groups, b));
    if (c) perBranch[b] = c.mag[sum.idx];
  }
  const lowest = Object.entries(perBranch).sort((a, b) => a[1] - b[1])[0];
  return { ohm: sum.ohm, hz: sum.hz, branch: lowest ? lowest[0] : '?', perBranch };
}

/* ---- één rij --------------------------------------------------------------- */
interface Row {
  key: string;
  corpus: string;
  label: string;
  crossingsHz: number[];
  minZ: { ohm: number; hz: number; branch: string; perBranch: Record<string, number> } | null;
  floorOk: boolean | null;
  gateMinZ: number | null;
  rmsFull: number | null;
  windowFull: number | null;
  rms397: number | null;
  window397: number | null;
  band397: [number, number] | null;
  mk: { pair: string; deg: number }[];
  mc: { way: string; db: number; limit: number | null; pass: boolean }[];
  resonantDb: number | null;
  liftDb: number | null;
  qesMult: number | null;
  dissPct: number | null;
  hottestThermalW: number | null;
  hottestAllowedW: number | null;
  hottestId: string | null;
  hottestContinuousW: number | null;
  coilPeakA: number | null;
  epdr: number | null;
  lobingDipDb: number | null;
  levelWork: { seriesOhm: number; dcrOhm: number; totalSeriesOhm: number; none: boolean } | null;
  askedDb: number | null;
  dcrTotalOhm: number;
  coils: { id: string; way: string; mH: number; dcrOhm: number; fitOhm: number | null; inRange: boolean | null }[];
  parts: { id: string; type: string; value: string }[];
}

function measure(key: string, corpus: string, label: string): Row {
  const rep: EngineV2Report = bank.report(key);
  const parts = partsOf(key);
  const inv = coilDcrInventory(parts, CASUS1_COIL_DCR.model);
  const gateZ = rep.gates.verdicts.find((v) => v.gate === 'M-B/|Z|');
  const full = rep.analysisGrid && rep.system.sumDb ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ) : null;
  const r = rep.gates.verdicts.find((v) => v.gate === 'M-A/part');
  const l = rep.gates.verdicts.find((v) => v.gate === 'M-L');
  const hottestEl = rep.metrics.dissipation?.elements.find((e) => !e.parasitic && e.id === r?.parameters?.element) ?? null;
  const lw = rep.predesign.levelWork;
  const value = (p: VxpPart): string => {
    const v = p.params.find((q) => q.name === 'L' || q.name === 'C' || q.name === 'R' || q.name === 'Eg');
    return v ? `${v.value} ${v.unit ?? ''}`.trim() : '';
  };
  return {
    key,
    corpus,
    label,
    crossingsHz: rep.crossings.map((c) => c.fHz),
    minZ: minZWithBranch(parts),
    floorOk: gateZ && gateZ.value !== null && FLOOR !== null ? meetsAmpFloor(gateZ.value, FLOOR) : null,
    gateMinZ: gateZ?.value ?? null,
    rmsFull: full?.rmsDeviationDb ?? null,
    windowFull: full?.windowPlusMinusDb ?? null,
    rms397: rep.system.response?.rmsDeviationDb ?? null,
    window397: rep.system.response?.windowPlusMinusDb ?? null,
    band397: rep.system.response?.bandHz ?? null,
    mk: rep.system.phaseTracking.map((p) => ({ pair: `${p.lower}→${p.upper}`, deg: p.meanAbsDeg })),
    mc: rep.gates.verdicts.filter((v) => v.gate === 'M-C' && v.value !== null).map((v) => ({ way: v.subject, db: v.value as number, limit: v.limit, pass: v.pass })),
    resonantDb: rep.metrics.lfBump[0]?.result.resonantDb ?? null,
    liftDb: rep.metrics.lfBump[0]?.result.liftDb ?? null,
    qesMult: [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0]?.qMultiplier ?? null,
    dissPct: rep.metrics.dissipation ? rep.metrics.dissipation.totalFraction * 100 : null,
    hottestThermalW: r?.value ?? null,
    hottestAllowedW: r?.limit ?? null,
    hottestId: (r?.parameters?.element as string | undefined) ?? null,
    hottestContinuousW: hottestEl?.watts ?? null,
    coilPeakA: l?.value ?? null,
    epdr: rep.metrics.epdr?.minOhm ?? null,
    lobingDipDb: rep.metrics.lobingFinal?.worstDipInCrossoverDb ?? rep.metrics.lobingFinal?.worstDipDb ?? null,
    levelWork: lw?.delivered ? { seriesOhm: lw.delivered.seriesOhm, dcrOhm: lw.delivered.dcrOhm, totalSeriesOhm: lw.delivered.totalSeriesOhm, none: lw.delivered.none } : null,
    askedDb: lw?.aboveAnchorDb ?? null,
    dcrTotalOhm: inv.carriedTotalOhm,
    coils: inv.coils.map((c) => ({ id: c.id, way: c.ways.join('+'), mH: c.henry * 1e3, dcrOhm: c.carriedOhm, fitOhm: c.fitOhm, inRange: c.inRange })),
    parts: parts.filter((p) => p.partId !== undefined && p.type !== 'Wire').map((p) => ({ id: p.partId!, type: p.type, value: value(p) })),
  };
}

/* ---- de rijen --------------------------------------------------------------- */
const live = corpusOf('live');
const v51b = corpusOf('v51b');
const arm = corpusOf('a5e3arm');
const args = process.argv.slice(2);
const rows: Row[] = [];
if (args.length > 0) {
  for (const k of args) rows.push(measure(k, 'gevraagd', k));
} else {
  for (const label of live.order) {
    const key = live.byCandidate.get(label);
    if (key) rows.push(measure(key, 'A5e.3-veld', label));
  }
  for (const label of arm.order) rows.push(measure(arm.byCandidate.get(label)!, 'A5e.3-arm (M-1-veld)', label));
  for (const label of v51b.order) rows.push(measure(v51b.byCandidate.get(label)!, 'V51b (gepoort, series-r-max 1,0)', label));
  rows.push(measure('HUIDIG', 'HUIDIG (met pad)', 'HUIDIG'));
}

/* ---- het dichtstbijzijnde V51b-kruispunt, met naam ------------------------- */
const hzOf = (label: string): [number, number] | null => {
  const m = label.match(/woofer→mid ([\d.]+) .*mid→tweeter ([\d.]+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const v51bRows = rows.filter((r) => r.corpus.startsWith('V51b'));
const nearestV51b = (r: Row): Row | null => {
  const a = hzOf(r.label);
  if (!a) return null;
  let best: { row: Row; d: number } | null = null;
  for (const c of v51bRows) {
    const b = hzOf(c.label);
    if (!b) continue;
    const d = Math.abs(Math.log2(a[0] / b[0])) + Math.abs(Math.log2(a[1] / b[1]));
    if (!best || d < best.d) best = { row: c, d };
  }
  return best ? best.row : null;
};

/* ---- de tabel --------------------------------------------------------------- */
const short = (label: string) => label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '');
const mkCell = (r: Row) => (r.mk.length ? r.mk.map((m) => `${f1(m.deg)}`).join(' / ') : '—');
const mcCell = (r: Row) => (r.mc.length ? r.mc.map((m) => `${m.way} ${f1(m.db)} (${f1(m.limit)}${m.pass ? '' : ' ✗'})`).join(' / ') : '—');
const zCell = (r: Row) => (r.minZ ? `${f2(r.minZ.ohm)} @ ${f0(r.minZ.hz)} in ${r.minZ.branch}${r.floorOk === null ? '' : r.floorOk ? ' ✓' : ' ✗'}` : '—');
const lwCell = (r: Row) => (r.levelWork ? `${f2(r.levelWork.seriesOhm)} + ${f2(r.levelWork.dcrOhm)} = ${f2(r.levelWork.totalSeriesOhm)}` : '—');
console.log(`A5e.3-VELD — per kandidaat, één meetbank (gemergede set, doelcurve ${CASUS1_TARGET_CURVE.type}, vloer ${FLOOR ?? '—'} Ω, M-A/part bij ${CASUS1_THERMAL_DESIGN_POWER_W ?? '—'} W); volle oordeelband ${CASUS1_V2_BAND_HZ.map((v) => v.toFixed(0)).join('–')} Hz, rapportband vanaf ${rows[0]?.band397?.[0].toFixed(0) ?? '?'} Hz`);
console.log('');
console.log('| corpus | kandidaat | kruispunten Hz | min \\|Z\\| Ω @ Hz, tak | RMS volle band / ±venster | RMS vanaf 397 / ±venster | M-K W-M / M-T ° | M-C per weg dB (grens) | opslingering / lift dB | Q_es× | dissipatie % | heetste R W bij 10 W (toegestaan) [bij 100 W] | M-L A | EPDR Ω | lobing dip dB | serie-R woofer R + DCR = totaal Ω | DCR totaal Ω (spoelen) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.corpus} | ${short(r.label)} | ${r.crossingsHz.map(f0).join(' · ')} | ${zCell(r)} | ${f2(r.rmsFull)} / ±${f2(r.windowFull)} | ${f2(r.rms397)} / ±${f2(r.window397)} | ${mkCell(r)} | ${mcCell(r)} | ` +
      `${f2(r.resonantDb)} / ${f2(r.liftDb)} | ${f2(r.qesMult)} | ${f0(r.dissPct)} | ${f2(r.hottestThermalW)} (${f1(r.hottestAllowedW)}) [${f1(r.hottestContinuousW)}]${r.hottestId ? ` ${r.hottestId}` : ''} | ${f1(r.coilPeakA)} | ${f2(r.epdr)} | ${f1(r.lobingDipDb)} | ${lwCell(r)} | ${f2(r.dcrTotalOhm)} (${r.coils.length}) |`,
  );
}
console.log('');
console.log('DCR PER SPOEL — weg, L, gedragen DCR, fit van de familie, binnen het enkel-onderdeel-bereik:');
for (const r of rows) {
  console.log(`  ${r.corpus} · ${short(r.label)}: ` + (r.coils.length ? r.coils.map((c) => `${c.id} (${c.way}) ${c.mH.toFixed(2)} mH → ${c.dcrOhm.toFixed(3)} Ω${c.fitOhm !== null && Math.abs(c.fitOhm - c.dcrOhm) > 0.0005 ? ` [fit ${c.fitOhm.toFixed(3)}]` : ''}${c.inRange === false ? ' BUITEN BEREIK' : ''}`).join('; ') : 'geen spoelen'));
}
console.log('');
console.log('VOLLE VECTOR — de netlist per kandidaat (id, type, waarde):');
for (const r of rows) console.log(`  ${r.corpus} · ${short(r.label)}: ` + r.parts.map((p) => `${p.id}${p.value ? ` ${p.value}` : ''}`).join(', '));
console.log('');
if (args.length === 0) {
  console.log('GEPAARD OP HET DICHTSTBIJZIJNDE V51b-KRUISPUNT (anekdote per rij, geen corpusdelta — corpusPairing zegt n = 0 op label):');
  console.log('| A5e.3-veld | dichtstbijzijnde V51b | min \\|Z\\| Ω | RMS vanaf 397 dB | M-K W-M / M-T ° | M-C tweeter dB | opslingering dB | dissipatie % | heetste R W bij 10 W | lobing dip dB |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const d = (a: number | null, b: number | null) => (a === null || b === null ? '—' : `${f2(b)} → ${f2(a)} (${a - b >= 0 ? '+' : ''}${(a - b).toFixed(2)})`);
  const tw = (r: Row) => r.mc.find((m) => m.way === r.mc[r.mc.length - 1]?.way)?.db ?? null;
  for (const r of rows.filter((x) => x.corpus === 'A5e.3-veld')) {
    const n = nearestV51b(r);
    if (!n) continue;
    console.log(
      `| ${short(r.label)} | ${short(n.label)} | ${d(r.minZ?.ohm ?? null, n.minZ?.ohm ?? null)} | ${d(r.rms397, n.rms397)} | ` +
        `${r.mk.map((m, i) => d(m.deg, n.mk[i]?.deg ?? null)).join(' / ')} | ${d(tw(r), tw(n))} | ${d(r.resonantDb, n.resonantDb)} | ${d(r.dissPct, n.dissPct)} | ${d(r.hottestThermalW, n.hottestThermalW)} | ${d(r.lobingDipDb, n.lobingDipDb)} |`,
    );
  }
}
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _: 'A5e.3-veld — de tabel per kandidaat (scripts/measure-a5e3-field.ts), één meetbank voor elke rij. Documentatie, geen acceptatiewaarde.',
      band_volle_hz: CASUS1_V2_BAND_HZ,
      band_rapport_hz: rows[0]?.band397 ?? null,
      vloer_ohm: FLOOR,
      rijen: rows.map((r) => ({ ...r, minZ: r.minZ ? { ...r.minZ, perBranch: Object.fromEntries(Object.entries(r.minZ.perBranch).map(([k, v]) => [k, round2(v)])) } : null, dichtstbijzijnde_v51b: nearestV51b(r)?.label ?? null })),
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${OUT}`);
