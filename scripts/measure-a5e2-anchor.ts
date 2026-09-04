/**
 * A5e.2 — WAAR HET NIVEAU-ANKER LIGT, GEMETEN VOORDAT ER IETS GESTELD WORDT.
 *
 * `npx vite-node scripts/measure-a5e2-anchor.ts [SLEUTEL ...]` — seconden, geen
 * ketenrun en geen enkele tune. Zonder argumenten élke netlist die het
 * casusboek noemt.
 *
 * DE VRAAG. A5d.4(a) wil het ankerniveau NA baffle step in de beoogde
 * opstelling, en dat is een eigenschap van het doelcurve-object. Sinds F1 staat
 * daar een TODO en staan drie dingen stil: `verankerde_gaps_dB` draagt de kale
 * gemeten niveaus met een status die dat zegt, `worker.ts` geeft de
 * A5d.6-inversie `gapBudgetDb: null`, en de dempingsmarge is een A5a-veld dat
 * op de zoekroute niets doet. Voordat er een getal gesteld kan worden moet er
 * één gemeten worden: WAAR LEGT DIT ONTWERP ZIJN BAS?
 *
 * WAT ER GEMETEN WORDT, en de bandkeuze is het hele punt (V15). Het
 * gerealiseerde basplateau is het ENERGIEGEMIDDELDE niveau van de SOM onder de
 * onderste overname, afgezet tegen het niveau dat diezelfde som over de band
 * van de ANKERWEG haalt. Twee grootheden van hetzelfde netwerk, dus wat eruit
 * komt is niveauwerk en niet gevoeligheid.
 *
 * De overname bestaat in TWEE lezingen en het script drukt ze allebei af, want
 * zij vallen op casus 1 ver uit elkaar en de keuze bepaalt het antwoord:
 *
 *   · het MEETKUNDIG MIDDEN van het A5d.3-venster (466,4 Hz) — de overname die
 *     `anchoredGaps` al gebruikt, een PRE-designgrootheid die hetzelfde
 *     antwoord geeft voordat er een filter bestaat;
 *   · het eigen KRUISPUNT van de geladen netlist (op HUIDIG 359,7 Hz) — waar
 *     de wegen elkaar in dít ontwerp werkelijk overnemen.
 *
 * En de band wordt in twee vormen gelezen: GECLIPT op de ver-veldgeldigheid
 * (A5.5/A5b.1) en ONGECLIPT tot f_p. Dat verschil is op deze casus geen
 * detail — zie de kop die het script boven tabel 1 afdrukt.
 *
 * TABEL 2 is de baffle-step uit de gemeten kastbreedte, met de eerste-orde
 * shelf erbij op de frequenties die ertoe doen. TABEL 3 is M-E: de
 * Q_es-vermenigvuldiging van de LAAGSTE weg per netlist, op beide R_e-lezingen
 * die het casusboek draagt (V16), met de padweerstand ernaast.
 *
 * Dit script stelt niets en wijzigt niets. Het is het bewijsmateriaal waarop
 * de gestelde eisen van A5e.2 rusten.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { passbandLevel } from '../src/lib/engine2/ingest/spl.ts';
import { passbandImpedanceMedian } from '../src/lib/engine2/optimizer/bounds.ts';
import { passbandOf } from '../src/lib/engine2/metrics/analysis.ts';
import { baffleStepHz } from '../src/lib/cabinet.ts';
import { baffleStepShelfDb } from '../src/lib/nearField.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const netlists = golden.manifest_en_geometrie.netlists;

/** De ordes die het casusboek zelf stelt; élke casus-1-test stelt dezelfde. */
const BASE = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

const only = process.argv.slice(2);
const keys = only.length > 0 ? only : Object.keys(netlists);

/** Serieweerstand in het pad van één weg, DCR inbegrepen — zoals V43 hem telt. */
function seriesPathROhm(key: string, driver: string): number {
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
  const bus = busTopology(parts);
  let r = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    if (p.type === 'Resistor') r += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') r += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  return r;
}

/** Dezelfde optelling, maar gesplitst: discrete weerstand tegen spoel-DCR. */
function seriesSplitOhm(key: string, driver: string): { resistors: number; dcr: number } {
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
  const bus = busTopology(parts);
  let resistors = 0;
  let dcr = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    if (p.type === 'Resistor') resistors += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') dcr += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  return { resistors, dcr };
}

interface Row {
  key: string;
  lowest: string;
  anchor: string;
  fpHz: number;
  validLoHz: number;
  windowHandoverHz: number;
  crossingHz: number;
  anchorBandHz: [number, number];
  anchorSumDb: number;
  /** [geclipt, ongeclipt] per overname-lezing, relatief aan `anchorSumDb`. */
  windowClipped: number | null;
  windowRaw: number | null;
  crossingClipped: number | null;
  crossingRaw: number | null;
  /** Dezelfde geclipte basband, maar afgezet tegen de HELE oordeelband. */
  vsJudgeBand: number | null;
  judgeBandHz: [number, number] | null;
}

function measure(key: string): Row | string {
  let rep: EngineV2Report;
  try {
    rep = buildReport({
      manifest,
      files,
      geometry,
      settings: BASE,
      filter: casus1Filter(key, manifest, files, golden),
    });
  } catch (e) {
    return `${key}: ${(e as Error).message}`;
  }
  const grid = rep.analysisGrid;
  const sum = rep.system.sumDb;
  const gaps = rep.predesign.gaps;
  if (!grid || !sum || !gaps) return `${key}: geen som of geen ankerblok`;

  const order = rep.driversLowToHigh;
  const lowest = order[0];
  const low = rep.ingest.drivers.find((d) => d.driver === lowest);
  if (!low?.onAxis || low.impedance?.fundamentalHz == null) return `${key}: geen f_p of geen ver veld`;
  const fp = low.impedance.fundamentalHz;
  const validLo = low.onAxis.bandHz[0];

  /* De overname van het A5d.3-venster — het meetkundig midden, precies zoals
   * `report.ts` hem voor de verankerde gaps afleidt. */
  const wins = rep.predesign.windows;
  const centre = (i: number): number | null => {
    const w = wins[i];
    if (!w || w.floorHz === null || w.ceilingHz === null || !(w.ceilingHz > w.floorHz)) return null;
    return Math.sqrt(w.floorHz * w.ceilingHz);
  };
  const handover = centre(0);
  const crossing = rep.crossings.find((c) => c.lower === lowest)?.fHz ?? null;
  if (handover === null || crossing === null) return `${key}: geen onderste overname`;

  /* De band van de ANKERWEG: tussen de overnames eromheen, dezelfde regel die
   * `report.ts` voor de niveaus gebruikt. */
  const ai = order.indexOf(gaps.anchor);
  const aLo = ai === 0 ? low.onAxis.bandHz[0] : centre(ai - 1) ?? low.onAxis.bandHz[0];
  const aHi = ai === order.length - 1 ? low.onAxis.bandHz[1] : centre(ai) ?? low.onAxis.bandHz[1];
  const anchorSum = passbandLevel(sum, grid, [aLo, aHi]);
  if (!anchorSum) return `${key}: de som draagt geen punt in de ankerband`;

  const rel = (lo: number, hi: number): number | null => {
    if (!(hi > lo)) return null;
    const l = passbandLevel(sum, grid, [lo, hi]);
    return l ? l.db - anchorSum.db : null;
  };

  return {
    key,
    lowest,
    anchor: gaps.anchor,
    fpHz: fp,
    validLoHz: validLo,
    windowHandoverHz: handover,
    crossingHz: crossing,
    anchorBandHz: [aLo, aHi],
    anchorSumDb: anchorSum.db,
    windowClipped: rel(Math.max(fp, validLo), handover),
    windowRaw: rel(fp, handover),
    crossingClipped: rel(Math.max(fp, validLo), crossing),
    crossingRaw: rel(fp, crossing),
    vsJudgeBand:
      rep.system.splBandHz && passbandLevel(sum, grid, rep.system.splBandHz)
        ? (passbandLevel(sum, grid, [Math.max(fp, validLo), handover])?.db ?? NaN) -
          passbandLevel(sum, grid, rep.system.splBandHz)!.db
        : null,
    judgeBandHz: rep.system.splBandHz,
  };
}

const cell = (v: number | null): string => (v === null ? '     —' : v.toFixed(2).padStart(6));

/* ------------------------------------------------------------------ *
 * 1 — het gerealiseerde basplateau per netlist
 * ------------------------------------------------------------------ */

const rows: Row[] = [];
const skipped: string[] = [];
for (const key of keys) {
  const r = measure(key);
  if (typeof r === 'string') skipped.push(r);
  else rows.push(r);
}

const first = rows[0];
console.log('TABEL 1 — HET GEREALISEERDE BASPLATEAU, per bevroren netlist');
console.log(
  '  Grootheid: energiegemiddeld niveau van de SOM over de basband, MINUS het niveau van\n' +
    '  diezelfde som over de band van de ANKERWEG. Beide uit hetzelfde rapport, één oplossing.',
);
if (first) {
  console.log(
    `  f_p (${first.lowest}) = ${first.fpHz.toFixed(2)} Hz · ver-veldgeldigheidsvloer = ` +
      `${first.validLoHz.toFixed(1)} Hz · anker = ${first.anchor} over ` +
      `${first.anchorBandHz[0].toFixed(0)}–${first.anchorBandHz[1].toFixed(0)} Hz`,
  );
  /* M-1 — the paragraph is COMPUTED, not fixed: on the gated set the validity
   * floor sat almost three octaves above f_p (the V45 finding); on the merged
   * set it lies below f_p and the clipped band IS the plateau. */
  const octavesAboveFp = Math.log2(first.validLoHz / first.fpHz);
  console.log(
    octavesAboveFp > 0
      ? `  LET OP — DIT IS DE BEVINDING EN NIET EEN VOETNOOT. De geldigheidsvloer ligt ${octavesAboveFp.toFixed(1)}\n` +
          '  octaven BOVEN f_p, dus de geclipte basband is geen plateau maar een SLIVER, vlak onder\n' +
          '  de overname en BOVEN de baffle step. Waar het kruispunt van de netlist zelf onder die\n' +
          '  vloer valt is de geclipte band zelfs LEEG (—). De ongeclipte kolommen lezen ver-velddata\n' +
          '  waarvan A5b.1 zegt dat zij er niet is; zij staan er als context, nooit als meting\n' +
          '  waaruit een eis gesteld mag worden.'
      : `  SINDS M-1 ligt de geldigheidsvloer ${(-octavesAboveFp).toFixed(1)} octaaf ONDER f_p (de gemergede set),\n` +
          `  dus de geclipte en de ongeclipte kolom vallen samen en de basband [f_p, overname] is een\n` +
          `  plateau van ${Math.log2(first.windowHandoverHz / first.fpHz).toFixed(2)} octaaf. Dit is de eerste meting van het plateau;\n` +
          '  de bestanden dragen een inspeel-predictie (PLACEHOLDER tot groundplane/hermeting).',
  );
}
console.log(
  '\nnetlist            overname_vst  kruispunt   geclipt_vst  ongeclipt_vst  geclipt_krs  ongeclipt_krs   vs_oordeelband',
);
for (const r of rows) {
  console.log(
    `${r.key.padEnd(18)} ${r.windowHandoverHz.toFixed(1).padStart(12)} ` +
      `${r.crossingHz.toFixed(1).padStart(10)}  ${cell(r.windowClipped)}       ` +
      `${cell(r.windowRaw)}       ${cell(r.crossingClipped)}       ${cell(r.crossingRaw)}   ` +
      `${cell(r.vsJudgeBand)}`,
  );
}
for (const s of skipped) console.log(`  overgeslagen — ${s}`);

/* ------------------------------------------------------------------ *
 * 2 — de baffle step uit de gemeten kastbreedte
 * ------------------------------------------------------------------ */

const widthMm = geometry.baffleWidthMm;
console.log('\nTABEL 2 — DE BAFFLE STEP UIT DE GEMETEN KASTBREEDTE');
if (widthMm === undefined) {
  console.log('  Geen kastbreedte in de projectdata: geen baffle step, en dus geen overgang (P4).');
} else {
  const f0 = baffleStepHz(widthMm)!;
  console.log(`  breedte ${widthMm} mm  ->  f0 = ${f0.toFixed(1)} Hz (baffleStepHz, 115 / W[m])`);
  const probes = [
    ...(first ? [first.validLoHz, first.windowHandoverHz, first.crossingHz] : []),
    f0, 1000, 2000, 5000, 19500,
  ].sort((a, b) => a - b);
  const shelf = baffleStepShelfDb(probes, f0, 1);
  console.log('  de eerste-orde shelf als FRACTIE van zijn eigen diepte, -1/(1 + f/f0):');
  console.log('   ' + probes.map((f, i) => `${f.toFixed(0)}:${shelf[i].toFixed(3)}`).join('  '));
}

/* ------------------------------------------------------------------ *
 * 3 — M-E op de laagste weg
 * ------------------------------------------------------------------ */

const meRef = golden.kandidaten['_M_E_parameters'] as unknown as { R_e_ohm: number };
const invRef = (
  golden.grens_inversies.parameters as unknown as { maxRs_Qmult: { R_e_ohm: number } }
).maxRs_Qmult;
console.log('\nTABEL 3 — M-E OP DE LAAGSTE WEG: waar de weerstandsvlucht vandaag staat');
console.log(
  `  Twee R_e-lezingen van hetzelfde wooferpaar (V16): ${meRef.R_e_ohm} Ω (M-E-referentie) en ` +
    `${invRef.R_e_ohm} Ω (de Q_es-inversie). Beide staan in het casusboek; de kolommen zijn ` +
    `\n  q = 1 + R_s/R_e op elk van de twee, met R_s uit M-E zelf.`,
);
console.log('\nnetlist              padR(Ω)   R_s(Ω)   q@fit    q@' + meRef.R_e_ohm + '   q@' + invRef.R_e_ohm);
for (const r of rows) {
  const rep = buildReport({
    manifest, files, geometry, settings: BASE,
    filter: casus1Filter(r.key, manifest, files, golden),
  });
  const t = rep.metrics.thevenin.find((x) => x.driver === r.lowest);
  if (!t) {
    console.log(`${r.key.padEnd(20)} — geen M-E`);
    continue;
  }
  const q = (re: number): string => (1 + t.rsOhm / re).toFixed(3).padStart(7);
  console.log(
    `${r.key.padEnd(20)} ${seriesPathROhm(r.key, r.lowest).toFixed(3).padStart(7)} ` +
      `${t.rsOhm.toFixed(3).padStart(8)} ${(t.qMultiplier ?? NaN).toFixed(3).padStart(7)} ` +
      `${q(meRef.R_e_ohm)} ${q(invRef.R_e_ohm)}`,
  );
}
console.log(
  `\n  (de DC-meterlezing die de fixture draagt is ${CASUS1_WOOFER_DC_OHM} Ω; ` +
    'q@fit deelt door de door de pas OPGELOSTE R_e, wat de motionele fit is zolang\n' +
    '  het rapport geen ingevoerde DC-weerstand krijgt.)',
);

/* ------------------------------------------------------------------ *
 * 4 — wat de wegen werkelijk aan serieweerstand betalen
 * ------------------------------------------------------------------ */

console.log('\nTABEL 4 — DE GEREALISEERDE VERZWAKKING PER WEG, tegen het verankerde gap-budget');
console.log(
  '  De A5d.6-inversie gap-pad-r zet een budget in dB om in een plafond op de TOTALE\n' +
    '  serieweerstand van de weg: R_max = Z_doorlaatband * (10^(A/20) - 1), met de DCR van de\n' +
    '  spoelen eerst van dat plafond af (searchBoxFor). Deze tabel leest dezelfde vergelijking\n' +
    '  de andere kant op: welke A hoort bij de weerstand die er NU in zit?',
);
console.log(
  '\nnetlist            weg      Zmed(Ω)   R_res   R_DCR   R_tot   A_gerealiseerd   gap-budget   verschil',
);
for (const r of rows) {
  const f = casus1Filter(r.key, manifest, files, golden);
  const rep = buildReport({ manifest, files, geometry, settings: BASE, filter: f });
  const gaps = rep.predesign.gaps;
  for (const way of rep.driversLowToHigh) {
    const d = rep.ingest.drivers.find((x) => x.driver === way);
    if (!d?.onAxis) continue;
    const pass = passbandOf(way, rep.crossings, d.onAxis.bandHz);
    const raw = f.driverZ[way];
    const zmed = raw ? passbandImpedanceMedian(raw.freq, raw.magnitude, pass) : null;
    if (zmed === null) {
      console.log(
        `${r.key.padEnd(18)} ${way.padEnd(8)} — geen |Z|-mediaan over de afgeleide doorlaatband ` +
          `${pass[0].toFixed(0)}–${pass[1].toFixed(0)} Hz (de band is leeg: het kruispunt ligt ` +
          'onder de geldigheidsvloer)',
      );
      continue;
    }
    const sp = seriesSplitOhm(r.key, way);
    const tot = sp.resistors + sp.dcr;
    const aDb = 20 * Math.log10(1 + tot / zmed);
    const gap = gaps?.ways.find((w) => w.driver === way)?.budgetDb ?? null;
    console.log(
      `${r.key.padEnd(18)} ${way.padEnd(8)} ${zmed.toFixed(3).padStart(7)} ` +
        `${sp.resistors.toFixed(3).padStart(7)} ${sp.dcr.toFixed(3).padStart(7)} ` +
        `${tot.toFixed(3).padStart(7)} ${aDb.toFixed(3).padStart(16)} ` +
        `${(gap === null ? 'ANKER' : gap.toFixed(3)).padStart(12)} ` +
        `${(gap === null ? '—' : (aDb - gap).toFixed(3)).padStart(10)}`,
    );
  }
}
