/**
 * V36/V37 — WAT DE DISSIPATIETERM BIJDRAAGT AAN fxOf, EN WAARDOOR HIJ DEELT.
 *
 * `npx vite-node scripts/measure-v36-dissipation.ts` — seconden, geen ketenrun.
 *
 * DE VRAAG. `netOptimizer.ts` telt bij elke objectief-evaluatie één term op die
 * over dissipatie gaat: `dissipationWeight · (R_source/R_e)²`, met R_source en
 * R_e beide afgelezen bij de bronweerstandsprobe. V34 verlegde die probe op de
 * v2-route van het ketenraster naar het veiligheidsraster. Dat verplaatst niet
 * alleen de TELLER (de bronweerstand op 51,5 Hz in plaats van op 640,2 Hz) maar
 * ook de NOEMER: `re` is de reële impedantie van de laagste weg BIJ de probe, en
 * op een impedantiepiek is dat de piekhoogte en niet R_e.
 *
 * WAT HET AFDRUKT. Per bevroren netlist beide armen — waar de probe landt, wat
 * hij daar leest, welke noemer hij daar gebruikt, en de termwaarde die daaruit
 * volgt — naast de schaal van de objectiefwaarde waaraan die term wordt
 * toegevoegd, herrekend uit de geleverde vlakheid en fase met de formule uit
 * `fxOf` zelf. Plus de rapportagemetriek M-A (dissipatiefractie en de grootste
 * enkele weerstand in watt), zodat naast "wat de zoektocht ervan merkt" ook
 * "wat er werkelijk verstookt wordt" op tafel ligt.
 *
 * DE ARITHMETIEK IS DIE VAN `metricsOn`, NIET EEN TWEEDE VERSIE ERVAN: probe
 * via `sourceProbeIndex` met dezelfde randregel, R_source via
 * `sourceResistanceOhm` (die binnen het venster exact dezelfde `seenImpedance`
 * doet), noemer `Math.max(0.5, z[idx].re)`. Waar de probe buiten het venster
 * valt is er GEEN ratio en dus geen term — dat is de ene plek waar deze
 * berekening en `sourceResistanceOhm` uit elkaar lopen, want die laatste valt
 * dan terug op de DC-limiet en de dissipatieterm doet dat nadrukkelijk niet.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_V2_SETTINGS, casus1ChainInput } from '../src/lib/engine2/casus1V2.fixture.ts';
import { CASUS1_WOOFER_DC_OHM } from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { sourceProbeIndex, sourceResistanceOhm } from '../src/lib/partAudit.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import type { Complex } from '../src/lib/complex.ts';

/** Het vermogen waarbij M-A zijn schaalvrije fractie in watt uitdrukt. Dezelfde
 *  aanname als elke casus-1-test; geen enginegetal. */
const ASSUMED_POWER_W = 100;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const ci = casus1ChainInput(manifest, files, golden);

const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const LIVE = Object.keys(netlists).filter((k) => /^KAND_V2_\d+$/.test(k));
const BASELINES = ['HUIDIG', 'KAND_A', 'KAND_B'];

const dissW = CASUS1_V2_SETTINGS.dissipationWeight;
const phasePriority = CASUS1_V2_SETTINGS.phasePriority;
/** `fxOf`'s eigen ankerformule: p = 0,15 + 0,7·phasePriority. */
const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);

type ZMap = Record<string, readonly Complex[]>;

/**
 * De dissipatieterm zoals `metricsOn` hem berekent, op één raster met één
 * randregel. `null` waar de probe geweigerd wordt: dan bestaat er geen ratio en
 * telt `fxOf` niets op (de term valt weg, hij scoort geen nul).
 */
function armOf(
  parts: ReturnType<typeof deserializeFilter>['parts'],
  grid: readonly number[],
  z: ZMap,
  edgeRule: 'first' | 'both',
): { hz: number; rs: number; re: number; ratio: number; term: number } | null {
  const zl = z.woofer;
  if (!zl) return null;
  const probe = sourceProbeIndex(grid, zl, undefined, edgeRule);
  if (!probe || !probe.inBand) return null;
  const rs = sourceResistanceOhm(parts, { grid, driverZ: z, edgeRule });
  if (rs === null) return null;
  const re = Math.max(0.5, zl[probe.idx].re);
  const ratio = rs / re;
  return { hz: grid[probe.idx], rs, re, ratio, term: dissW * ratio * ratio };
}

const report = (key: string) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: {
      amplifierPowerW: ASSUMED_POWER_W,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: FLAT_TARGET,
    },
  });

console.log(
  `dissipationWeight = ${dissW}   phasePriority = ${phasePriority} ⇒ p = ${p.toFixed(2)}\n` +
    `R_e woofer (gemeten met een meter) = ${CASUS1_WOOFER_DC_OHM} Ω\n` +
    `aangenomen versterkervermogen voor M-A = ${ASSUMED_POWER_W} W\n`,
);

console.log('=== WAAR DE PROBE LANDT EN WAT DE TERM DAN WAARD IS ===');
console.log(
  `${'netlist'.padEnd(12)}` +
    `${'|  keten/first (vóór V34)'.padEnd(46)}` +
    `${'|  veiligheid/both (sinds V34)'.padEnd(46)}`,
);
console.log(
  `${''.padEnd(12)}` +
    `|${'Hz'.padStart(8)}${'R_s'.padStart(8)}${'noemer'.padStart(9)}${'ratio'.padStart(8)}${'term'.padStart(12)}` +
    `  |${'Hz'.padStart(8)}${'R_s'.padStart(8)}${'noemer'.padStart(9)}${'ratio'.padStart(8)}${'term'.padStart(12)}`,
);

const rows: {
  key: string;
  pre: ReturnType<typeof armOf>;
  now: ReturnType<typeof armOf>;
  fx: number;
  diss: number;
  watt: number;
}[] = [];

for (const key of [...BASELINES, ...LIVE]) {
  const rel = netlists[key];
  if (!rel) continue;
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, rel), 'utf-8')).parts;
  const pre = armOf(parts, ci.grid, ci.driverZ, 'first');
  const now = armOf(parts, ci.safety.freqs, ci.safety.z, 'both');

  /* DE SCHAAL WAARAAN DE TERM WORDT TOEGEVOEGD, met de formule van `fxOf`:
   *   2(1−p)·rms² + 2p·[(φ/15)² + 0,5·(φ_p95/45)²]
   * De twee dominante termen; de rest (leak, prot, xoDip, corridor) is op een
   * gezond ontwerp nul of klein en maakt de noemer alleen groter, dus wat
   * hieronder staat is de GUNSTIGSTE lezing voor de dissipatieterm. */
  const r = report(key);
  const rms = r.system.response?.rmsDeviationDb ?? NaN;
  const phaseDeg = Math.max(
    0,
    ...r.system.phaseTracking.map((x: { meanAbsDeg: number }) => x.meanAbsDeg),
  );
  const fx = 2 * (1 - p) * rms * rms + 2 * p * (phaseDeg / 15) ** 2;
  const d = r.metrics.dissipation!;
  const largest = d.elements.filter((e) => !e.parasitic)[0];
  rows.push({
    key,
    pre,
    now,
    fx,
    diss: d.totalFraction * 100,
    watt: largest?.watts ?? 0,
  });

  const cell = (a: ReturnType<typeof armOf>) =>
    a === null
      ? '   (probe geweigerd — geen ratio, geen term)   '
      : `${a.hz.toFixed(1).padStart(8)}${a.rs.toFixed(3).padStart(8)}` +
        `${a.re.toFixed(2).padStart(9)}${a.ratio.toFixed(4).padStart(8)}${a.term.toExponential(3).padStart(12)}`;
  console.log(`${key.padEnd(12)}|${cell(pre)}  |${cell(now)}`);
}

console.log('\n=== DE TERM NAAST DE OBJECTIEFWAARDE WAARIN HIJ WORDT OPGETELD ===');
console.log(
  `${'netlist'.padEnd(12)}${'fx (2 termen)'.padStart(15)}${'term vóór'.padStart(13)}` +
    `${'aandeel'.padStart(11)}${'term ná'.padStart(13)}${'aandeel'.padStart(11)}` +
    `${'M-A %'.padStart(9)}${'grootste R'.padStart(12)}`,
);
for (const row of rows) {
  const share = (t: number | undefined) => (t === undefined ? '—' : `${((t / row.fx) * 100).toExponential(2)}%`);
  console.log(
    `${row.key.padEnd(12)}${row.fx.toFixed(3).padStart(15)}` +
      `${(row.pre ? row.pre.term.toExponential(3) : '—').padStart(13)}${share(row.pre?.term).padStart(11)}` +
      `${(row.now ? row.now.term.toExponential(3) : '—').padStart(13)}${share(row.now?.term).padStart(11)}` +
      `${row.diss.toFixed(1).padStart(9)}${`${row.watt.toFixed(1)} W`.padStart(12)}`,
  );
}

/* DE GRENS DIE ER TOE DOET. De tuner beslist met PROCENTUELE poorten — een
 * uitdaging wordt aangenomen bij 1 % verbetering, een tak gesnoeid bij 10 %.
 * Een term die onder 1 % van fx blijft kan geen enkele van die beslissingen
 * omdraaien; dat is de meting die zegt of hij nog iets bewaakt. */
const CHALLENGE_PCT = 1;
const worstNow = rows.reduce((a, r) => Math.max(a, r.now ? (r.now.term / r.fx) * 100 : 0), 0);
const worstPre = rows.reduce((a, r) => Math.max(a, r.pre ? (r.pre.term / r.fx) * 100 : 0), 0);
console.log(
  `\ngrootste aandeel van de dissipatieterm in fx: ` +
    `vóór V34 ${worstPre.toExponential(2)} %, sinds V34 ${worstNow.toExponential(2)} % ` +
    `— tegen een uitdagingsdrempel van ${CHALLENGE_PCT} %.`,
);

/* ---- DE NOEMER, NAAST DE GROOTHEID DIE DE TERM ZEGT TE METEN ----------- *
 *
 * `dissipationWeight · (R_source/R_e)²` heet in de nota de rem op de serie-R-
 * route naar niveauregeling, en de schade die zij moet remmen is Q_es-
 * vermenigvuldiging: `Q_es_mult = 1 + R_source/R_e`, met R_e de DC-weerstand.
 * De term las als noemer echter `Re(Z)` BIJ DE PROBE, en sinds V34 zit die
 * probe op de impedantiepiek.
 *
 * V37 — DIT IS DE VÓÓR/NÁ VAN DIE REPARATIE. `term nu` is wat een v1-run leest
 * (de default `dissipationReferenceSource: 'probe'`, onveranderd); `term op
 * R_e` is wat de v2-route sinds V37 optelt. De kolom `M-E` komt uit de metriek
 * die de vermenigvuldiging wél op R_e berekent — zij is de CONTROLE op de
 * kolom `R_s/R_e` en geen tweede mening: `1 + R_s/R_e` hoort per definitie de
 * `Qes_mult`-referentie van het casusboek te zijn, en
 * `frozenNetlistGates.test.ts` assert dat op élke bevroren netlist. */
console.log('\n=== DE NOEMER: DE PIEK, OF DE DC-WEERSTAND (V37: vóór en ná) ===');
console.log(
  `${'netlist'.padEnd(12)}${'R_s @probe'.padStart(12)}${'R_s/Re(piek)'.padStart(14)}` +
    `${'R_s/R_e'.padStart(10)}${'M-E Q_es'.padStart(10)}${'term nu'.padStart(12)}` +
    `${'term op R_e'.padStart(13)}${'factor'.padStart(9)}`,
);
for (const row of rows) {
  if (!row.now) continue;
  const onRe = row.now.rs / CASUS1_WOOFER_DC_OHM;
  const termRe = dissW * onRe * onRe;
  console.log(
    `${row.key.padEnd(12)}${row.now.rs.toFixed(3).padStart(12)}` +
      `${row.now.ratio.toFixed(4).padStart(14)}${onRe.toFixed(4).padStart(10)}` +
      `${(1 + onRe).toFixed(2).padStart(10)}${row.now.term.toExponential(3).padStart(12)}` +
      `${termRe.toExponential(3).padStart(13)}${`${(termRe / row.now.term).toFixed(1)}×`.padStart(9)}`,
  );
}
const denom = rows.find((r) => r.now)?.now?.re ?? null;
console.log(
  `\nnoemer nu = Re(Z) bij de probe = ${denom === null ? '—' : denom.toFixed(2)} Ω op het ` +
    `veiligheidsraster; R_e woofer = ${CASUS1_WOOFER_DC_OHM} Ω (gemeten met een meter) — ` +
    `een factor ${denom === null ? '—' : (denom / CASUS1_WOOFER_DC_OHM).toFixed(2)} ernaast, ` +
    'en dat kwadrateert.',
);
