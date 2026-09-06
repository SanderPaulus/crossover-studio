/**
 * E-1 — DE RESOLUTIE VAN DE BARRIÈRE OP SMALLE DIPS, GEMETEN VÓÓR ER IETS GEKOZEN IS.
 *
 * `npx vite-node scripts/measure-e1-barrier-resolution.ts` — seconden, geen ketenrun en geen tune.
 *
 * DE AANLEIDING (A5e.3c, open punt 7): KAND_V2_1 (377,8 · 1948) heeft zijn |Z|-minimum in een smalle
 * dip op 416 Hz in de W-M-overlap — 2,5536 Ω op de poortsweep (1600 punten) tegen 2,6349 Ω op het
 * verlengde veiligheidsraster (394 punten, wat `'safety-extended'` leest): 0,081 Ω tegen een
 * vloerspeling van 0,052. De barrière mikte 0,08 Ω te hoog en de 2 %-tolerantie droeg het ontwerp
 * door de poort. Dit script meet, over ÉLKE bevroren netlist van het casusboek:
 *
 *  (1) het verschil sweep–barrière naast de BREEDTE van de dip (de octaafspanne rond het sweep-minimum
 *      waarover |Z| binnen één vloerspeling van de bodem blijft — de speling is de bestaande conventie,
 *      geen nieuwe tolerantie) en naast de celbreedte van het barrièreraster ter plekke: een dip smaller
 *      dan een cel kán het grove raster niet lezen;
 *  (2) drie verdichtingen met de EIGEN punten van de poortsweep (`refinedSystemMinImpedanceOhm`,
 *      `dipCellsOf`): rond het grove globale minimum alleen, rond élk grof lokaal minimum, en overal
 *      waar het grove raster onder 2× de vloer leest — per netlist het nieuwe verschil en het aantal
 *      extra punten;
 *  (3) de kosten per evaluatie zoals V33 ze mat: één netwerkoplossing op het ketenraster, het
 *      veiligheidsraster, het verlengde raster, de sweep, en de drie verdichte lezingen (mediaan van
 *      herhaalde oplossingen op drie netlists).
 *
 * Schrijft `test-fixtures/casus1_e1_barriere_verdichting.json`. Dit script stelt niets: welke
 * verdichting de bron `'safety-extended-refined'` leest staat in `BARRIER_DIP_REFINEMENT`
 * (`netOptimizer.ts`), gekozen op deze tabel.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { solveNetwork } from '../src/lib/network.ts';
import { ampFloorSlackOhm, meetsAmpFloor, minImpedanceAt } from '../src/lib/impedanceFloor.ts';
import {
  BARRIER_DIP_REFINEMENT,
  extendGridToSweepExtent,
  refinedSystemMinImpedanceOhm,
  systemMinImpedanceOhm,
  type DipRefinement,
} from '../src/lib/netOptimizer.ts';
import { impedanceReferenceFrom } from '../src/lib/engine2/optimizer/impedanceReference.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { casus1ChainInput, casus1V2Facts, CASUS1_TARGET_CURVE } from '../src/lib/engine2/casus1V2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_e1_barriere_verdichting.json');

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;
const floorOhm = casus1AmpMinLoadOhm(golden);
if (floorOhm === null) throw new Error('casus 1 stelt geen versterkervloer — niets te meten');
const slack = ampFloorSlackOhm(floorOhm);

const gridded = casus1ChainInput(manifest, files, golden);
const huidig = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
  },
});
const facts = casus1V2Facts(huidig, manifest, files);
const ref = impedanceReferenceFrom(
  Object.fromEntries(
    Object.entries(facts.impedanceByModel ?? {}).map(([m, z]) => [m, { grid: z.grid, magnitude: z.magnitude, phaseDeg: z.phaseDeg, validHz: z.validHz }]),
  ),
);
if (!ref) throw new Error('geen poortreferentie');
const safety = { freqs: gridded.safety.freqs, z: gridded.safety.z };
const extended = extendGridToSweepExtent(safety, ref);
if (!extended) throw new Error('het verlengde raster kon niet gebouwd worden');

/* De drie verdichtingen; de derde met het niveau uit het brief-voorstel (2× de vloer), aangereikt en niet in de engine. */
const TWICE_FLOOR = 2; // P6-OK: de factor uit het E-1-voorstel ("waar |Z| < 2× vloer"), alleen hier, als meetarm.
const MODES: { id: string; refinement: DipRefinement }[] = [
  { id: 'globaal_minimum', refinement: { kind: 'minimum' } },
  { id: 'lokale_minima', refinement: { kind: 'local-minima' } },
  { id: 'onder_2x_vloer', refinement: { kind: 'below', ohm: TWICE_FLOOR * floorOhm } },
];

const f4 = (v: number | null) => (v === null ? '—' : v.toFixed(4));
const f3 = (v: number | null) => (v === null ? '—' : v.toFixed(3));

interface Row {
  netlist: string;
  sweep_ohm: number | null;
  sweep_min_bij_hz: number | null;
  /** octaafspanne rond het sweep-minimum waarover |Z| ≤ minimum + vloerspeling */
  dip_breedte_oct: number | null;
  /** octaafbreedte van de cel van het barrièreraster waarin het sweep-minimum valt */
  cel_breedte_oct: number | null;
  barriere_ohm: number | null;
  verschil_ohm: number | null;
  boven_speling: boolean | null;
  verdicht: Record<string, { ohm: number | null; verschil_ohm: number | null; extra_punten: number | null; cellen: number | null; boven_speling: boolean | null; zelfde_lezing_als_sweep: boolean | null }>;
}

const rows: Row[] = [];
for (const key of Object.keys(netlists)) {
  const netlist = casus1Filter(key, manifest, files, golden).netlist;
  let sweepMag: number[] | null = null;
  try {
    sweepMag = solveNetwork(netlist, ref.grid, ref.driverZ).inputZ.map((z) => Math.hypot(z.re, z.im));
  } catch {
    sweepMag = null;
  }
  const sweepMin = sweepMag ? minImpedanceAt(sweepMag.map((m) => ({ re: m, im: 0 }))) : null;
  const onSweep = sweepMin?.ohm ?? null;
  const sweepHz = sweepMin ? ref.grid[sweepMin.index] : null;
  let dipOct: number | null = null;
  let cellOct: number | null = null;
  if (sweepMag && sweepMin) {
    const top = sweepMin.ohm + slack;
    let l = sweepMin.index;
    let r = sweepMin.index;
    while (l > 0 && sweepMag[l - 1] <= top) l--;
    while (r < sweepMag.length - 1 && sweepMag[r + 1] <= top) r++;
    dipOct = Math.log2(ref.grid[r] / ref.grid[l]);
    const k = extended.grid.findIndex((f, i) => i + 1 < extended.grid.length && f <= sweepHz! && extended.grid[i + 1] >= sweepHz!);
    cellOct = k >= 0 ? Math.log2(extended.grid[k + 1] / extended.grid[k]) : null;
  }
  const onBarrier = systemMinImpedanceOhm(netlist, extended.grid, extended.driverZ);
  const gap = onSweep === null || onBarrier === null ? null : Math.abs(onBarrier - onSweep);
  const verdicht: Row['verdicht'] = {};
  for (const m of MODES) {
    const r = refinedSystemMinImpedanceOhm(netlist, extended, ref, m.refinement);
    const g = r === null || onSweep === null ? null : Math.abs(r.ohm - onSweep);
    verdicht[m.id] = {
      ohm: r?.ohm ?? null,
      verschil_ohm: g,
      extra_punten: r?.refinedPoints ?? null,
      cellen: r?.cells ?? null,
      boven_speling: g === null ? null : g >= slack,
      zelfde_lezing_als_sweep: r === null || onSweep === null ? null : r.ohm === onSweep,
    };
  }
  rows.push({
    netlist: key,
    sweep_ohm: onSweep,
    sweep_min_bij_hz: sweepHz,
    dip_breedte_oct: dipOct,
    cel_breedte_oct: cellOct,
    barriere_ohm: onBarrier,
    verschil_ohm: gap,
    boven_speling: gap === null ? null : gap >= slack,
    verdicht,
  });
}

/* ---------------- tabel 1: het verschil naast de dip-breedte ---------------- */
console.log(`vloer ${floorOhm} Ω, speling ${slack.toFixed(4)} Ω; sweep ${ref.grid.length} punten, verlengd barrièreraster ${extended.grid.length} punten`);
console.log('\n=== (1) sweep–barrière per netlist, met de dip-breedte (gesorteerd op verschil) ===');
console.log('| netlist | sweep Ω @ Hz | dip-breedte oct | celbreedte oct | barrière Ω | verschil Ω | boven speling |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
const sorted = [...rows].sort((a, b) => (b.verschil_ohm ?? -1) - (a.verschil_ohm ?? -1));
for (const r of sorted.slice(0, 25)) {
  console.log(`| ${r.netlist} | ${f4(r.sweep_ohm)} @ ${r.sweep_min_bij_hz?.toFixed(1) ?? '—'} | ${f3(r.dip_breedte_oct)} | ${f3(r.cel_breedte_oct)} | ${f4(r.barriere_ohm)} | ${f4(r.verschil_ohm)} | ${r.boven_speling === null ? '—' : r.boven_speling ? 'JA' : 'nee'} |`);
}
const above = rows.filter((r) => r.boven_speling === true);
console.log(`\nboven de speling op het verlengde raster: ${above.length} van ${rows.length} — ${above.map((r) => r.netlist).join(', ') || 'geen'}`);
const narrow = rows.filter((r) => r.dip_breedte_oct !== null && r.cel_breedte_oct !== null && r.dip_breedte_oct < r.cel_breedte_oct);
console.log(`dip smaller dan één barrièrecel (op de speling gemeten): ${narrow.length} netlists — waarvan boven de speling: ${narrow.filter((r) => r.boven_speling).length}`);
console.log(`boven de speling MET een dip breder dan een cel: ${above.filter((r) => !(r.dip_breedte_oct !== null && r.cel_breedte_oct !== null && r.dip_breedte_oct < r.cel_breedte_oct)).map((r) => r.netlist).join(', ') || 'geen'}`);

/* ---------------- tabel 2: de drie verdichtingen ---------------- */
console.log('\n=== (2) de drie verdichtingen, over het hele casusboek ===');
console.log('| verdichting | grootste verschil Ω (netlist) | boven speling | lezing = sweep (bit) | extra punten mediaan / max | cellen mediaan / max |');
console.log('| --- | --- | --- | --- | --- | --- |');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const summary: Record<string, unknown> = {};
for (const m of MODES) {
  const vs = rows.map((r) => ({ key: r.netlist, ...r.verdicht[m.id] })).filter((v) => v.verschil_ohm !== null);
  const worst = vs.reduce((a, b) => (b.verschil_ohm! > a.verschil_ohm! ? b : a), vs[0]);
  const aboveN = vs.filter((v) => v.boven_speling).length;
  const same = vs.filter((v) => v.zelfde_lezing_als_sweep).length;
  const pts = vs.map((v) => v.extra_punten!);
  const cells = vs.map((v) => v.cellen!);
  summary[m.id] = {
    grootste_verschil_ohm: Number(worst.verschil_ohm!.toFixed(4)),
    grootste_verschil_netlist: worst.key,
    boven_speling: vs.filter((v) => v.boven_speling).map((v) => v.key),
    lezing_gelijk_aan_sweep: same,
    gemeten: vs.length,
    extra_punten_mediaan: median(pts),
    extra_punten_max: Math.max(...pts),
    cellen_mediaan: median(cells),
    cellen_max: Math.max(...cells),
  };
  console.log(`| ${m.id} | ${f4(worst.verschil_ohm)} (${worst.key}) | ${aboveN} | ${same} / ${vs.length} | ${median(pts)} / ${Math.max(...pts)} | ${median(cells)} / ${Math.max(...cells)} |`);
}
const live = rows.filter((r) => /^KAND_V2_\d+$/.test(r.netlist) || ['HUIDIG', 'KAND_A', 'KAND_B'].includes(r.netlist));
console.log('\nop het LEVENDE corpus en de referentiefilters:');
for (const m of MODES) {
  const vs = live.map((r) => r.verdicht[m.id]).filter((v) => v.verschil_ohm !== null);
  console.log(`  ${m.id}: grootste verschil ${f4(Math.max(...vs.map((v) => v.verschil_ohm!)))} Ω, boven speling ${vs.filter((v) => v.boven_speling).length}, lezing = sweep op ${vs.filter((v) => v.zelfde_lezing_als_sweep).length} van ${vs.length}, extra punten ${median(vs.map((v) => v.extra_punten!))} mediaan / ${Math.max(...vs.map((v) => v.extra_punten!))} max`);
}

/* ---------------- tabel 3: de kosten per evaluatie ---------------- */
console.log('\n=== (3) kosten per evaluatie (mediaan ms van herhaalde oplossingen; V33-vorm) ===');
const COST_KEYS = ['HUIDIG', 'KAND_V2_1', 'KAND_V2_8'].filter((k) => netlists[k]);
const REPS = 40;
const timeIt = (fn: () => void): number => {
  const ts: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const t0 = performance.now();
    fn();
    ts.push(performance.now() - t0);
  }
  return median(ts)!;
};
const cost: Record<string, Record<string, number>> = {};
console.log('| netlist | keten (' + gridded.grid.length + ') | veiligheid (' + gridded.safety.freqs.length + ') | verlengd (' + extended.grid.length + ') | sweep (' + ref.grid.length + ') | ' + MODES.map((m) => `verdicht ${m.id}`).join(' | ') + ' |');
console.log('| --- | --- | --- | --- | --- | ' + MODES.map(() => '---').join(' | ') + ' |');
for (const key of COST_KEYS) {
  const netlist = casus1Filter(key, manifest, files, golden).netlist;
  const c: Record<string, number> = {
    keten_ms: timeIt(() => systemMinImpedanceOhm(netlist, gridded.grid, gridded.driverZ)),
    veiligheid_ms: timeIt(() => systemMinImpedanceOhm(netlist, gridded.safety.freqs, gridded.safety.z)),
    verlengd_ms: timeIt(() => systemMinImpedanceOhm(netlist, extended.grid, extended.driverZ)),
    sweep_ms: timeIt(() => systemMinImpedanceOhm(netlist, ref.grid, ref.driverZ)),
  };
  for (const m of MODES) c[`verdicht_${m.id}_ms`] = timeIt(() => refinedSystemMinImpedanceOhm(netlist, extended, ref, m.refinement));
  cost[key] = c;
  console.log(`| ${key} | ${c.keten_ms.toFixed(3)} | ${c.veiligheid_ms.toFixed(3)} | ${c.verlengd_ms.toFixed(3)} | ${c.sweep_ms.toFixed(3)} | ${MODES.map((m) => c[`verdicht_${m.id}_ms`].toFixed(3)).join(' | ')} |`);
}

/* ---------------- het oordeel op beide lezingen, per verdichting ---------------- */
const disagree: Record<string, string[]> = {};
for (const m of MODES) {
  disagree[m.id] = rows
    .filter((r) => r.sweep_ohm !== null && r.verdicht[m.id].ohm !== null && meetsAmpFloor(r.sweep_ohm, floorOhm) !== meetsAmpFloor(r.verdicht[m.id].ohm, floorOhm))
    .map((r) => r.netlist);
}
console.log(`\noordeel wijkt af (verdicht tegen sweep): ${MODES.map((m) => `${m.id}: ${disagree[m.id].length}`).join(', ')}`);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _: 'E-1 — DOCUMENTATIE (scripts/measure-e1-barrier-resolution.ts): het verschil sweep–barrière per bevroren netlist naast de dip-breedte, de drie verdichtingen en de kosten per evaluatie. Geen acceptatiewaarde; de guards staan in frozenNetlistGates.test.ts.',
      vloer_ohm: floorOhm,
      vloerspeling_ohm: Number(slack.toFixed(4)),
      rasters: {
        keten: { punten: gridded.grid.length, van_hz: Number(gridded.grid[0].toFixed(2)), tot_hz: Number(gridded.grid[gridded.grid.length - 1].toFixed(0)) },
        veiligheid: { punten: gridded.safety.freqs.length },
        verlengd: { punten: extended.grid.length, van_hz: Number(extended.grid[0].toFixed(2)), tot_hz: Number(extended.grid[extended.grid.length - 1].toFixed(0)) },
        sweep: { punten: ref.grid.length, van_hz: Number(ref.grid[0].toFixed(2)), tot_hz: Number(ref.grid[ref.grid.length - 1].toFixed(0)) },
      },
      verdichtingen: MODES.map((m) => ({ id: m.id, ...m.refinement })),
      engine_leest: BARRIER_DIP_REFINEMENT,
      samenvatting_hele_casusboek: summary,
      oordeel_wijkt_af: disagree,
      kosten_ms: cost,
      per_netlist: rows.map((r) => ({
        ...r,
        sweep_ohm: r.sweep_ohm === null ? null : Number(r.sweep_ohm.toFixed(4)),
        sweep_min_bij_hz: r.sweep_min_bij_hz === null ? null : Number(r.sweep_min_bij_hz.toFixed(2)),
        dip_breedte_oct: r.dip_breedte_oct === null ? null : Number(r.dip_breedte_oct.toFixed(4)),
        cel_breedte_oct: r.cel_breedte_oct === null ? null : Number(r.cel_breedte_oct.toFixed(4)),
        barriere_ohm: r.barriere_ohm === null ? null : Number(r.barriere_ohm.toFixed(4)),
        verschil_ohm: r.verschil_ohm === null ? null : Number(r.verschil_ohm.toFixed(4)),
        verdicht: Object.fromEntries(Object.entries(r.verdicht).map(([k, v]) => [k, { ...v, ohm: v.ohm === null ? null : Number(v.ohm.toFixed(4)), verschil_ohm: v.verschil_ohm === null ? null : Number(v.verschil_ohm.toFixed(4)) }])),
      })),
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\nwrote ${OUT}`);
