/**
 * V42 — WAAR HET LF-BULT-BUDGET WEL EN GEEN PLAFOND OPLEVERT.
 *
 * `npx vite-node scripts/measure-v42-bump-bound.ts` — seconden, geen ketenrun
 * en geen enkele tune.
 *
 * DE VRAAG DIE DIT SCRIPT BEANTWOORDT. Een gesteld budget wapent de
 * A5d.6-inversie `bump-series-l`, en die levert een plafond op de seriespoel
 * van de laagste weg. Maar `maxSeriesInductanceFromBump` geeft `null` zodra het
 * budget al MET L = 0 overschreden wordt, en dan is er geen plafond — niet als
 * fout maar als antwoord (V12). Of dat een theoretisch geval is of het normale
 * geval, is een MÉTING, en dit is die meting.
 *
 * HET ANTWOORD OP CASUS 1, en het is de kern van V42. De opslingering hangt
 * niet alleen aan de spoel: de elektrische overdracht is
 * `H_el = Z / (Z + R_pad + jωL)`, dus SERIEWEERSTAND tilt de reflexpiek in zijn
 * eentje al op — bij de piek is |Z| hoog en blijft H_el dicht bij 1, bij de
 * referentiefrequentie is |Z| laag en zakt hij weg. Dat is dezelfde natuurkunde
 * als de Q_es-vermenigvuldiging van M-E. Boven ongeveer 1,7 ohm padweerstand is
 * het budget daarmee al op vóórdat er één spoel in het pad zit, en dan is het
 * budget INERT: hij begrenst niets en de zoektocht merkt hem niet.
 *
 * Dat maakt het budget geen verkeerde eis, maar wel een eis die op deze casus
 * niet doet wat de naam suggereert: hij is een grens op de TOTALE bronimpedantie
 * bij resonantie, en de spoel is er maar één term van. Wie hem als
 * spoelplafond leest, leest hem op de helft van de ontwerpen verkeerd.
 *
 * De padweerstand hieronder is die van de BEVROREN netlist en niet die van het
 * zaad waarmee de run begon — het zaad bestaat alleen tijdens de run. Zij zijn
 * niet hetzelfde getal, en het patroon dat dit script laat zien staat er ook
 * niet van af: de spreiding tussen de netlists is een veelvoud van het verschil
 * tussen zaad en levering.
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
import { invertBudgets, type BudgetWay } from '../src/lib/engine2/optimizer/bounds.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';
import { H_PER_MH } from '../src/lib/engine2/constants.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { Complex } from '../src/lib/complex.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const budget = casus1LfBumpBudgetDb(golden)!;
const report = buildReport({
  manifest, files, filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry: casus1Geometry(golden),
  settings: { orderByPair: { [ctcKey('woofer','mid')]: 4, [ctcKey('mid','tweeter')]: 4 } },
});
const facts = casus1V2Facts(report, manifest, files);
const nf = facts.nearFieldByModel!.woofer;
const z = facts.impedanceByModel!.woofer;
const toC = (m: readonly number[], p: readonly number[]): Complex[] =>
  m.map((mag, i) => ({ re: mag * Math.cos(p[i]*Math.PI/180), im: mag * Math.sin(p[i]*Math.PI/180) }));
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string,string> }).netlists;

console.log('netlist        padR(Ω)  maxL(mH)');
const keys = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['HUIDIG', ...Object.keys(netlists).filter((k) => /^KAND_V2_\d+$/.test(k))];
for (const key of keys) {
  const parts: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
  // Dezelfde bus-wandeling die de worker doet (worker.ts:994).
  const bus = busTopology(parts);
  let pathR = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes('woofer')) continue;
    if (p.type === 'Resistor') pathR += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') pathR += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  const way: BudgetWay = {
    driver: 'woofer', lowest: true, highPassProtected: false,
    reOhm: null, reSource: 'n/a', zPassbandMedianOhm: null, passbandHz: null,
    fsHz: facts.fundamentalHzByModel!.woofer, fPeakHz: facts.fundamentalHzByModel!.woofer,
    gapBudgetDb: null, pathROhm: pathR,
    nearField: { grid: nf.grid, db: nf.db, validHz: nf.validHz },
    impedance: { grid: z.grid, z: toC(z.magnitude, z.phaseDeg) },
  };
  const b = invertBudgets([way], { lfBumpBudgetDb: budget }).bounds.find((x)=>x.rule==='bump-series-l');
  console.log(`${key.padEnd(14)} ${pathR.toFixed(3).padStart(7)}  ${b ? (b.maxSI/H_PER_MH).toFixed(3) : 'GEEN GRENS'}`);
}
