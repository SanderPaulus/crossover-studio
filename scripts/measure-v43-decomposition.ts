/**
 * V43 — DE LF-BULT ONTLEED: RESISTIEVE LIFT NAAST RESONANTE OPSLINGERING.
 *
 * `npx vite-node scripts/measure-v43-decomposition.ts` — seconden, geen
 * ketenrun en geen enkele tune.
 *
 * DE VRAAG. V42 mat dat `lfBump().extraDb` twee mechanismen bij elkaar optelt:
 * een BREDE resistieve lift (serieweerstand verzwakt de midband meer dan de
 * reflexpiek, dus het laag komt relatief omhoog) en een SMALLE resonante
 * opslingering (reactantie tegen de motionele piek). Het gestelde budget is
 * over de tweede bedoeld; het werd op de som gehandhaafd. Dit script meet de
 * splitsing op élke bevroren netlist, en daarnaast wat de A5d.6-inversie
 * `bump-series-l` oplevert wanneer zij tegen de ene of de andere grootheid
 * oplost.
 *
 * DE TWEEDE TABEL IS DE BEVINDING VAN V43 en zij is de reden dat de inversie
 * deze sessie NIET verplaatst is: bij 0,5 Ω padweerstand — de padweerstand
 * waarop de klasse-A-referentie `maxL_bij_Rs0_5_budget2_5dB_mH` staat — is de
 * resistieve lift al 0,97 dB van de gestelde 2,5. De aanname dat de oude
 * referentie daar "praktisch de opslingering" mat, is dus onwaar, en het
 * plafond verschuift van 2,432 naar 3,162 mH. Zie casusboek V43.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR, casus1Files, casus1Geometry, casus1Manifest, casus1Filter,
  casus1LfBumpBudgetDb, loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { casus1V2Facts } from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { lfBump } from '../src/lib/engine2/metrics/acoustic.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';
import { H_PER_MH } from '../src/lib/engine2/constants.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { Complex } from '../src/lib/complex.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const budget = casus1LfBumpBudgetDb(golden)!;
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const BASE = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);

/* ------------------------------------------------------------------ *
 * 1 — de ontleding per bevroren netlist
 * ------------------------------------------------------------------ */

const seriesPathROhm = (key: string, driver: string): number => {
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8'),
  ).parts;
  const bus = busTopology(parts);
  let pathR = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    if (p.type === 'Resistor') pathR += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') pathR += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  return pathR;
};

console.log('DE ONTLEDING — extraDb = lift + opslingering, per bevroren netlist');
console.log('netlist            weg      padR(Ω)   extra    lift  opsling.   som-Δ');
for (const key of keys) {
  const rep = buildReport({
    manifest, files, geometry, settings: BASE,
    filter: casus1Filter(key, manifest, files, golden),
  });
  const row = rep.metrics.lfBump[0];
  if (!row) {
    console.log(`${key.padEnd(18)} — geen M-D`);
    continue;
  }
  const r = row.result;
  const sum = r.liftDb !== null && r.resonantDb !== null ? r.liftDb + r.resonantDb : null;
  console.log(
    `${key.padEnd(18)} ${row.driver.padEnd(8)} ${seriesPathROhm(key, row.driver).toFixed(3).padStart(7)} ` +
      `${r.extraDb.toFixed(3).padStart(7)} ${(r.liftDb?.toFixed(3) ?? '—').padStart(7)} ` +
      `${(r.resonantDb?.toFixed(3) ?? '—').padStart(9)} ` +
      `${(sum === null ? '—' : (sum - r.extraDb).toExponential(1)).padStart(8)}`,
  );
}

/* ------------------------------------------------------------------ *
 * 2 — waar de inversie landt: op de SOM of op de resonante component
 * ------------------------------------------------------------------ */

const report = buildReport({
  manifest, files, geometry, settings: BASE,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
});
const facts = casus1V2Facts(report, manifest, files);
const nf = facts.nearFieldByModel!.woofer;
const zc = facts.impedanceByModel!.woofer;
const toC = (m: readonly number[], p: readonly number[]): Complex[] =>
  m.map((mag, i) => ({ re: mag * Math.cos((p[i] * Math.PI) / 180), im: mag * Math.sin((p[i] * Math.PI) / 180) }));
const z = toC(zc.magnitude, zc.phaseDeg);
const fP = facts.fundamentalHzByModel!.woofer;

/** De bult van een serie R+L op de gemeten belasting, precies zoals de inversie hem bouwt. */
const bumpAt = (pathR: number, henry: number): number => {
  const h: Complex[] = zc.grid.map((f, i) => {
    const zl = { re: z[i].re + pathR, im: z[i].im + 2 * Math.PI * f * henry };
    const d = zl.re * zl.re + zl.im * zl.im;
    return { re: (z[i].re * zl.re + z[i].im * zl.im) / d, im: (z[i].im * zl.re - z[i].re * zl.im) / d };
  });
  return lfBump(nf.grid, nf.db, zc.grid, h, fP, { validHz: nf.validHz })!.extraDb;
};

const BRACKET_DOUBLINGS = 40;
const BISECTION_STEPS = 60;

/** Het plafond, opgelost tegen de SOM (`resonantOnly` uit) of tegen de opslingering. */
const solve = (pathR: number, budgetDb: number, resonantOnly: boolean): number | null => {
  const base = resonantOnly ? bumpAt(pathR, 0) : 0;
  const f = (L: number): number => bumpAt(pathR, L) - base;
  if (f(0) > budgetDb) return null;
  let lo = 0;
  let hi = H_PER_MH;
  let guard = 0;
  while (guard++ < BRACKET_DOUBLINGS) {
    if (f(hi) > budgetDb) break;
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < BISECTION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) <= budgetDb) lo = mid;
    else hi = mid;
  }
  return lo;
};

console.log(`\nDE INVERSIE — plafond op de seriespoel bij budget ${budget} dB`);
console.log('padR(Ω)  lift bij L=0   op de SOM (nu)   op de opslingering');
for (const R of [0, 0.25, 0.5, 1.0, 1.5, 1.7, 2.0, 2.6, 3.0, 3.76]) {
  const oud = solve(R, budget, false);
  const nieuw = solve(R, budget, true);
  console.log(
    `${R.toFixed(2).padStart(6)}  ${bumpAt(R, 0).toFixed(3).padStart(12)}  ` +
      `${(oud === null ? 'GEEN GRENS' : `${(oud / H_PER_MH).toFixed(3)} mH`).padStart(14)}  ` +
      `${(nieuw === null ? 'GEEN GRENS' : `${(nieuw / H_PER_MH).toFixed(3)} mH`).padStart(18)}`,
  );
}
