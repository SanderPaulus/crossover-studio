/**
 * E-4 — IS DE A5d.6-INVERSIE DE INVERSE VAN DE M-D-METRIEK?
 *
 * `npx vite-node scripts/measure-e4-inversion.ts [SLEUTEL ...]` — seconden,
 * geen ketenrun en geen enkele tune.
 *
 * DE VRAAG, en zij komt uit een browserrun. LP-1 draaide de E-2-verkenning
 * opnieuw en zag VIJF van de zes kandidaten weigeren op het gestelde
 * LF-budget, met de paneelnoot die V48 zelf als bewaker opschreef: "the A5d.6
 * ceiling FOLLOWED the tune on this run, so this should not have been
 * reachable". Twee verklaringen lagen voor de hand en geen van beide is het:
 *
 *   · HET RASTER. Poort en rapport zouden een andere band of een andere
 *     referentie kunnen lezen (de V32-vorm). Zij lezen dezelfde: `lfBump` is
 *     één functie en `frozenNetlistGates` assert al op élke bevroren netlist
 *     dat `deliveredResonantDb` het getal van het paneel teruggeeft.
 *   · DE MEETSET. De demobundel is de gepoorte set herbemonsterd (E-2), dus
 *     de reflexpiek zou kunnen schuiven. Gemeten op ÉÉN netwerk over BEIDE
 *     sets — HUIDIG leest `resonantDb` −0,939 op de repo-set en −0,924 door
 *     de adapter van de app op de demobundel, 0,015 dB uit elkaar. Het
 *     wooferveld verschilt wél (de repo somt `woofer_up_near` en
 *     `woofer_down_near`, de demo draagt één cone en leest ~5,7 dB lager),
 *     maar `resonantDb` is een VERSCHIL en die offset valt weg.
 *
 * WAT HET WEL IS, en dit script meet het. De A5d.6-inversie `bump-series-l`
 * modelleert de weg als een KALE serie R+L in de gemeten driverimpedantie
 * (`lfBumpForSeriesRL`: H = Z/(Z + R + jωL)); M-D lost het ÉCHTE netwerk op,
 * met elke shunt die de tak draagt. Dat zijn twee functies van hetzelfde
 * ontwerp en zij hoeven niet op elkaar te lijken — op deze casus dempen de
 * shunts de reflexpiek en leest het echte netwerk vér onder wat het model
 * voorspelt.
 *
 * DE LEESREGEL, en zij staat ook in de guard. Het PLAFOND is een ZOEKGRENS
 * (A5d.6: een budget wordt door de gemeten impedantie en het nabije veld
 * geïnverteerd tot een grens op een componentwaarde, zodat de zoektocht grond
 * die het budget verbiedt niet bezoekt). De POORT is M-D op het geleverde
 * netwerk (`deliveredResonantDb`, V45/V48). Een netlist boven zijn plafond en
 * binnen zijn budget is dus GEEN schending: het is de doos die strenger was
 * dan de eis. Andersom zou het wel een schending zijn, en dat is precies wat
 * de guard telt.
 *
 * NIETS HIER REPAREERT DE INVERSIE. Dat vraagt het echte netwerk per
 * evaluatie, dus een andere zoekdoos, dus een ander corpus — een eigen sessie
 * met regeneratie. Zie casusboek E-4 voor de twee opties en de meting die ze
 * scheidt.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR, casus1ExcursionSettings, casus1Files, casus1Filter, casus1Geometry,
  casus1LfResonantBudgetDb, casus1Manifest, loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_COIL_DCR_SETTINGS, casus1V2Facts } from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { lfBumpForSeriesRL, maxSeriesInductanceFromBump } from '../src/lib/engine2/optimizer/bounds.ts';
import { levelWorkOnWay, seriesInductanceByWay } from '../src/lib/levelWork.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { H_PER_MH } from '../src/lib/engine2/constants.ts';
import type { Complex } from '../src/lib/complex.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const BUDGET_DB = casus1LfResonantBudgetDb(golden)!;
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;

/** Dezelfde instellingen waarmee `frozenNetlistGates` élke netlist oordeelt. */
const BASE: ReportSettings = {
  orderByPair: {},
  ...casus1ExcursionSettings(golden),
  ...CASUS1_COIL_DCR_SETTINGS,
} as ReportSettings;

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);

const partsOf = (key: string) =>
  deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

const toComplex = (m: readonly number[], ph: readonly number[]): Complex[] =>
  m.map((mag, i) => {
    const r = (ph[i] * Math.PI) / 180;
    return { re: mag * Math.cos(r), im: mag * Math.sin(r) };
  });

export interface E4Row {
  netlist: string;
  weg: string;
  L_som_mH: number;
  padweerstand_ohm: number;
  M_D_gemeten_dB: number;
  inversie_voorspelt_dB: number;
  verschil_dB: number;
  plafond_mH: number | null;
  boven_plafond: boolean;
  binnen_budget: boolean;
}

const rows: E4Row[] = [];

for (const key of keys) {
  const parts = partsOf(key);
  const rep = buildReport({ manifest, files, geometry, filter: casus1Filter(key, manifest, files, golden), settings: BASE });
  const md = rep.metrics.lfBump.find((b) => b.result.resonantDb !== null);
  if (!md) continue;
  const weg = md.driver;

  const facts = casus1V2Facts(rep, manifest, files);
  const z = facts.impedanceByModel?.[weg];
  const nf = facts.nearFieldByModel?.[weg];
  const fP = facts.fundamentalHzByModel?.[weg];
  if (!z || !nf || fP === undefined) continue;

  /* De twee grootheden die de kale-RL-inversie beschrijven: de TOTALE
   * seriespoel van de weg en de padweerstand die de driver ziet (discrete R
   * plus het koper van diezelfde spoelen — `levelWork.ts`, één inventaris). */
  const henry = seriesInductanceByWay(parts)[weg] ?? 0;
  const inv = levelWorkOnWay(parts, weg);
  const pathROhm = inv.reachable ? inv.totalSeriesOhm : 0;

  const input = {
    nfGrid: nf.grid, nfDb: nf.db,
    zGrid: z.grid, z: toComplex(z.magnitude, z.phaseDeg),
    fPeakHz: fP, nfValidHz: nf.validHz, pathROhm,
  };
  const at = (h: number) => lfBumpForSeriesRL(input, h);
  const zero = at(0);
  const full = at(henry);
  if (zero === null || full === null) continue;
  const voorspeld = full - zero;
  const gemeten = md.result.resonantDb!;
  const plafond = maxSeriesInductanceFromBump(input, BUDGET_DB)?.maxHenry ?? null;

  rows.push({
    netlist: key,
    weg,
    L_som_mH: henry / H_PER_MH,
    padweerstand_ohm: pathROhm,
    M_D_gemeten_dB: gemeten,
    inversie_voorspelt_dB: voorspeld,
    verschil_dB: voorspeld - gemeten,
    plafond_mH: plafond === null ? null : plafond / H_PER_MH,
    boven_plafond: plafond !== null && henry > plafond,
    binnen_budget: gemeten <= BUDGET_DB,
  });
}

/* ------------------------------------------------------------------ *
 * 1 — de tabel
 * ------------------------------------------------------------------ */

console.log(
  `DE INVERSIE TEGEN DE METRIEK — budget ${BUDGET_DB} dB op de resonante component (A4 M-D)\n` +
    'Het PLAFOND is een zoekgrens (A5d.6), M-D is de poort (V45/V48). Boven het plafond\n' +
    'en binnen het budget is dus geen schending maar een te strenge doos.\n',
);
console.log('netlist              weg      L_som mH  padR Ω   M-D gemeten  inversie   Δ dB   plafond mH  stand');
for (const r of rows) {
  const stand = r.boven_plafond ? (r.binnen_budget ? 'boven plafond, binnen budget' : 'boven plafond EN over budget') : (r.binnen_budget ? '' : 'onder plafond EN over budget');
  console.log(
    `${r.netlist.padEnd(20)} ${r.weg.padEnd(8)} ${r.L_som_mH.toFixed(3).padStart(8)} ${r.padweerstand_ohm.toFixed(3).padStart(7)} ` +
      `${r.M_D_gemeten_dB.toFixed(3).padStart(12)} ${r.inversie_voorspelt_dB.toFixed(3).padStart(9)} ` +
      `${r.verschil_dB.toFixed(3).padStart(6)} ${(r.plafond_mH === null ? '—' : r.plafond_mH.toFixed(3)).padStart(11)}  ${stand}`,
  );
}

/* ------------------------------------------------------------------ *
 * 2 — de twee richtingen, en zij zijn niet symmetrisch
 * ------------------------------------------------------------------ */

const teStreng = rows.filter((r) => r.boven_plafond && r.binnen_budget);
const tePermissief = rows.filter((r) => !r.boven_plafond && !r.binnen_budget);
const deltas = rows.map((r) => r.verschil_dB).sort((a, b) => a - b);

console.log(
  `\nnetlists ${rows.length} · Δ (inversie − metriek) min ${deltas[0]?.toFixed(3)} ` +
    `mediaan ${deltas[Math.floor(deltas.length / 2)]?.toFixed(3)} max ${deltas[deltas.length - 1]?.toFixed(3)} dB`,
);
console.log(`BOVEN het plafond en BINNEN het budget (doos te streng): ${teStreng.length}`);
console.log(`ONDER het plafond en OVER het budget (doos te permissief): ${tePermissief.length}`);
if (tePermissief.length > 0) {
  console.log('  ' + tePermissief.map((r) => `${r.netlist} (${r.M_D_gemeten_dB.toFixed(2)} dB)`).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3 — wegschrijven, zodat de guard de verzameling kan pinnen
 * ------------------------------------------------------------------ */

const out = {
  _: 'E-4 — de A5d.6-inversie tegen de M-D-metriek, per bevroren netlist. Het plafond is een ZOEKGRENS en M-D is de POORT; boven het plafond en binnen het budget is geen schending. Geschreven door scripts/measure-e4-inversion.ts.',
  budget_dB: BUDGET_DB,
  gemeten_op: `${process.platform}/${process.arch}, Node ${process.versions.node}`,
  boven_plafond_binnen_budget: teStreng.map((r) => r.netlist),
  onder_plafond_over_budget: tePermissief.map((r) => r.netlist),
  rijen: rows,
};
const dest = join('test-fixtures', 'casus1_e4_inversie.json');
if (only.length === 0) {
  writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
  console.log(`\ngeschreven: ${dest}`);
} else {
  console.log('\n(deelverzameling gedraaid — niets weggeschreven)');
}
