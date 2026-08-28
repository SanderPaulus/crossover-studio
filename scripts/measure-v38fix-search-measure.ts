/**
 * V38-FIX — WAT DE ZOEKTOCHT ZIET, PER BEVROREN NETLIST.
 *
 * `npx vite-node scripts/measure-v38fix-search-measure.ts` — seconden, geen
 * ketenrun en geen enkele tune. Alle drie de krommen worden op hetzelfde
 * netwerk uitgerekend; wat verschilt is uitsluitend WANNEER er gegladd wordt.
 *
 * DE DRIE KROMMEN, en de middelste is de hele vraag van deze sessie:
 *
 *   (a) `ruw`        — de echte complexe som. Wat `judgeResponse`, het
 *                      SPL-venster, de trapdoelen en élke poort lezen, en wat
 *                      de zoektocht met `errorSmoothOct: 0` leest.
 *   (b) `ná som`     — diezelfde som, dáárna gegladd met 1/12 octaaf. De
 *                      ONGEBOUWDE variant: gladden verplaatst naar ná de
 *                      sommatie in plaats van ervóór.
 *   (c) `vóór som`   — de som van per-driver gegladde MAGNITUDES met
 *                      ongemoeide FASE. Wat de zoektocht tot V38-fix las.
 *
 * WAAROM DIT BESTAND BESTAAT. De reparatie moest gekozen worden tussen (a) en
 * (b), en de opdracht was expliciet: met een meting, niet met een mening. Op de
 * tweewegfixture van de suite is het verschil te klein om iets te beslissen
 * (0,02 tegen 0,03 dB) — dat is nagemeten en het is de reden dat deze tabel op
 * het ECHTE corpus staat en niet daar.
 *
 * Geen oordeel en geen drempel: een tabel. Er wordt WEL gerangschikt, en dat is
 * geen ranglijst van ontwerpen maar de vergelijking van twee rangordes met
 * elkaar — de scherpste vorm van de bevinding, want een gladding die iedereen
 * even hard raakt zou een onschuldige offset zijn. De claims die eruit volgen
 * staan in `frozenNetlistGates.test.ts`.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smoothDbGaussian } from '../src/lib/bandMetrics.ts';
import { applyTransfer, combineN, type GriddedResponse } from '../src/lib/dsp.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { CASUS1_V2_BAND_HZ } from '../src/lib/engine2/casus1V2.fixture.ts';
import { SEARCH_SMOOTHING_OCTAVES } from '../src/lib/engine2/constants.ts';
import { chain, golden, partsOf } from './v38-bench.ts';

/** De historische zoekgladding van de tuner — de breedte die (b) en (c) delen. */
const LEGACY_SMOOTH_OCT = 1 / 12;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v38fix_zoekmaat.json');

const BAND: [number, number] = CASUS1_V2_BAND_HZ;
const BRANCHES: { model: string; response: GriddedResponse }[] = [
  { model: 'woofer', response: chain.w },
  { model: 'mid', response: chain.m },
  { model: 'tweeter', response: chain.t },
];

/** De som van een netwerk uit de gegeven takresponsies — complex, altijd. */
function sumOf(parts: readonly VxpPart[], branches: typeof BRANCHES): GriddedResponse {
  const netlist = crossoverToNetlist({ name: 'v38fix', parts: [...parts] } as VxpCrossover).netlist;
  const sol = solveNetwork(netlist, chain.grid, chain.driverZ);
  const filtered: { response: GriddedResponse }[] = [];
  for (const b of branches) {
    const d = sol.drivers.find((x) => x.model === b.model);
    const h = d ? sol.transfers[d.id] : null;
    if (h) filtered.push({ response: applyTransfer(b.response, h) });
  }
  const c = combineN(filtered);
  return { freq: c.freq, spl: c.combinedSpl, phaseDeg: c.combinedPhaseDeg };
}

/** Gladt de MAGNITUDE van een takresponsie en laat zijn fase staan — precies
 *  wat `smoothMag` in `netOptimizer.ts` doet, vóór de sommatie. */
const smoothedBranch = (r: GriddedResponse, oct: number): GriddedResponse =>
  oct > 0 ? { ...r, spl: smoothDbGaussian(r.freq, r.spl, oct) } : r;

/** Piek-vlakheid ±dB over de band — dezelfde definitie als `bandPeak`. */
function peakOver(freq: readonly number[], spl: readonly number[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < BAND[0] || freq[i] > BAND[1]) continue;
    if (spl[i] < lo) lo = spl[i];
    if (spl[i] > hi) hi = spl[i];
  }
  return Number.isFinite(lo) && hi > lo ? (hi - lo) / 2 : 0;
}

/** Standaarddeviatie om het bandgemiddelde — de AMPLITUDETERM van de zoektocht
 *  (`bandStd`), en dezelfde statistiek als `rmsDeviationDb` bij de acceptatie. */
function stdOver(freq: readonly number[], spl: readonly number[]): number {
  let s = 0;
  let sq = 0;
  let n = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < BAND[0] || freq[i] > BAND[1]) continue;
    s += spl[i];
    sq += spl[i] * spl[i];
    n++;
  }
  if (n === 0) return 0;
  const mean = s / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

interface Row {
  netlist: string;
  ruw_piek: number;
  na_som_piek: number;
  voor_som_piek: number;
  ruw_std: number;
  na_som_std: number;
  voor_som_std: number;
  /** |ná som − ruw| : hoeveel de ONGEBOUWDE variant van de echte som afwijkt. */
  d_na_som: number;
  /** |vóór som − ruw| : hoeveel de HUIDIGE zoekmaat van de echte som afwijkt. */
  d_voor_som: number;
}

const r3 = (v: number) => Number(v.toFixed(3));
const names = Object.keys(golden.manifest_en_geometrie.netlists).sort();
const rows: Row[] = [];
for (const key of names) {
  const parts = partsOf(key);
  const raw = sumOf(parts, BRANCHES);
  const beforeSum = sumOf(
    parts,
    BRANCHES.map((b) => ({
      model: b.model,
      response: smoothedBranch(b.response, LEGACY_SMOOTH_OCT),
    })),
  );
  const afterSumSpl = smoothDbGaussian(raw.freq, raw.spl, LEGACY_SMOOTH_OCT);
  const row: Row = {
    netlist: key,
    ruw_piek: r3(peakOver(raw.freq, raw.spl)),
    na_som_piek: r3(peakOver(raw.freq, afterSumSpl)),
    voor_som_piek: r3(peakOver(beforeSum.freq, beforeSum.spl)),
    ruw_std: r3(stdOver(raw.freq, raw.spl)),
    na_som_std: r3(stdOver(raw.freq, afterSumSpl)),
    voor_som_std: r3(stdOver(beforeSum.freq, beforeSum.spl)),
    d_na_som: 0,
    d_voor_som: 0,
  };
  row.d_na_som = r3(Math.abs(row.na_som_piek - row.ruw_piek));
  row.d_voor_som = r3(Math.abs(row.voor_som_piek - row.ruw_piek));
  rows.push(row);
}

console.log(`band: ${BAND[0]}–${BAND[1]} Hz · zoekgladding V38-fix: ${SEARCH_SMOOTHING_OCTAVES}`);
console.log('\n=== wat de zoektocht ziet, per bevroren netlist ===');
console.log(
  '| netlist | piek ruw | piek ná som | piek vóór som | Δ ná som | Δ vóór som | ' +
    'std ruw | std ná som | std vóór som |',
);
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.netlist} | ${r.ruw_piek.toFixed(2)} | ${r.na_som_piek.toFixed(2)} | ` +
      `${r.voor_som_piek.toFixed(2)} | ${r.d_na_som.toFixed(2)} | **${r.d_voor_som.toFixed(2)}** | ` +
      `${r.ruw_std.toFixed(2)} | ${r.na_som_std.toFixed(2)} | ${r.voor_som_std.toFixed(2)} |`,
  );
}

/* DE RANGORDE, want een offset die iedereen even hard raakt zou onschuldig
 * zijn. Deze niet: de zoekmaat comprimeert, en het ontwerp dat het oordeel het
 * slechtste vindt komt erop in de betere helft terecht. */
const byJudged = [...rows].sort((a, b) => a.ruw_std - b.ruw_std);
const bySearch = [...rows].sort((a, b) => a.voor_som_std - b.voor_som_std);
const worstJudged = byJudged[byJudged.length - 1];
const span = (xs: number[]) => Math.max(...xs) / Math.min(...xs);
console.log(
  `\nrangorde: beste op de beoordeelde maat is ${byJudged[0].netlist} ` +
    `(${byJudged[0].ruw_std.toFixed(2)} dB), en op de zoekmaat staat hij ` +
    `${bySearch.findIndex((r) => r.netlist === byJudged[0].netlist) + 1}e van ${rows.length}; ` +
    `het SLECHTSTE is ${worstJudged.netlist} (${worstJudged.ruw_std.toFixed(2)} dB) en op de ` +
    `zoekmaat staat hij ${bySearch.findIndex((r) => r.netlist === worstJudged.netlist) + 1}e.`,
);
console.log(
  `spreiding over het corpus: beoordeelde maat ${span(rows.map((r) => r.ruw_std)).toFixed(2)}x, ` +
    `zoekmaat ${span(rows.map((r) => r.voor_som_std)).toFixed(2)}x.`,
);

const worstAfter = Math.max(...rows.map((r) => r.d_na_som));
const worstBefore = Math.max(...rows.map((r) => r.d_voor_som));
const minBefore = Math.min(...rows.map((r) => r.d_voor_som));
console.log(
  `\ngrootste afwijking van de echte som: ná sommatie ${worstAfter.toFixed(2)} dB, ` +
    `vóór sommatie ${minBefore.toFixed(2)}–${worstBefore.toFixed(2)} dB.`,
);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V38-fix — de drie zoekmaten op elke bevroren netlist. Documentatie; de claims ' +
        'staan in frozenNetlistGates.test.ts.',
      opzet: {
        band_hz: BAND,
        gladding_oct: LEGACY_SMOOTH_OCT,
        v38fix_zoekgladding_oct: SEARCH_SMOOTHING_OCTAVES,
        raster: [chain.grid[0], chain.grid[chain.grid.length - 1], chain.grid.length],
        krommen: {
          ruw: 'de echte complexe som — wat elk oordeel leest',
          na_som: 'die som, daarna gegladd (de ongebouwde variant)',
          voor_som: 'de som van gegladde magnitudes met ongemoeide fase (tot V38-fix)',
        },
      },
      rijen: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
