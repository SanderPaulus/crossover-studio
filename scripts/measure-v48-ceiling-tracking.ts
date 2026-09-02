/**
 * V48 — WAT HET VERSCHIL MAAKT DAT HET SPOELPLAFOND DE TUNE VOLGT.
 *
 * `V48_JOBS=<n> npx vite-node scripts/measure-v48-ceiling-tracking.ts` — ÉÉN
 * KETENRUN PER (KANDIDAAT, ARM), dus dertig op het casus-1-veld. Parallel over
 * de kernen; sequentieel duurt hij uren. `V48_ONLY=<n>` draait één shard, wat
 * het script met zichzelf doet.
 *
 * DE VRAAG. De A5d.6-inversie `bump-series-l` keert het LF-budget om naar een
 * plafond op de seriespoel van de laagste weg BIJ EEN GEGEVEN PADWEERSTAND. Dat
 * plafond wordt één keer opgelost, bij het ZAAD, en staat daarna vast — terwijl
 * de tune de padweerstand verplaatst. V45 schreef dat op als open punt en
 * beredeneerde dat het veilig was: meer serieweerstand dempt de resonante
 * helft, dus een plafond opgelost bij een LAGERE padweerstand dan de tune
 * eindigt op is hoogstens te streng. Dat klopt. Wat het weglaat is de tune die
 * de padweerstand VERLAAGT, en daar is het plafond TOEGEEFLIJK.
 *
 * DE TWEE ARMEN VERSCHILLEN IN ÉÉN WOORD. `seriesInductanceCeilingSource` staat
 * op `'seed'` in de ene arm en op `'tuned'` in de andere; alles daaromheen —
 * eisen, budgetten, zaad, raster, seed — is hetzelfde object. Dat is de reden
 * dat de sleutel een CHOICE is met een expliciete waarde die wint: zonder hem
 * zou deze vergelijking twee commits nodig hebben in plaats van twee runs, en
 * dan zou zij ook het verschil tussen die commits meten.
 *
 * WAT ER PER RIJ AFGEDRUKT WORDT en waarom het niet meer is. Van een kandidaat
 * die GELEVERD heeft valt alles te meten; van een kandidaat die door een poort
 * geweigerd is valt niets te meten, want `runCandidate` wist de onderdelenlijst
 * voordat het resultaat de worker verlaat (V31) — dezelfde muur waar
 * `measure-v47-rejections.ts` tegenaan liep. De rij van een geweigerde
 * kandidaat draagt daarom zijn weigeringsgrond en verder niets, en dat is een
 * eerlijke lege kolom in plaats van een verzonnen meting.
 *
 * DE KOLOM DIE DE SESSIE DRAAGT is `verwerping = budget`. Dat is de
 * geleverde-netwerk-toets van V45: een tune die voltooide en een netwerk
 * opleverde dat het gestelde budget overschrijdt. In de `seed`-arm zijn dat de
 * slachtoffers van het verouderde plafond; in de `tuned`-arm horen het er nul
 * te zijn, en als het er niet nul zijn is dát het resultaat.
 *
 * ⚠ DE KOLOM `opsling` IS NIET DIE TOETS, EN HET VERSCHIL IS INHOUDELIJK. Zij
 * is de opslingering van het SERIE-R+L-MODEL waarop de inversie is opgelost —
 * `H_el = Z / (Z + R_pad + jωL)` met de totalen van de geleverde weg ingevuld —
 * dus precies de grootheid waarop het PLAFOND gedefinieerd is. De
 * geleverde-netwerk-toets lost daarentegen het ECHTE netwerk op, shunts en
 * vallen inbegrepen (`deliveredResonantDb`). De twee horen dicht bij elkaar te
 * liggen en zijn niet hetzelfde getal, en welke van de twee gezag heeft staat
 * vast: de toets, want die oordeelt over wat gebouwd wordt. Deze kolom staat
 * ernaast om te laten zien of het PLAFOND gedaan heeft wat het moest doen.
 *
 * EEN WAARDE PRECIES OP HET BUDGET IS DAAROM GEEN OVERSCHRIJDING MAAR HET
 * BEWIJS DAT HET PLAFOND BIJT. Gemeten in de `tuned`-arm: 1,40027 dB bij een
 * geleverde spoel van 3,8014 mH tegen een plafond van 3,80097 mH — vier
 * tienduizendsten mH eroverheen, en dat is de AFRONDING VAN HET WEGSCHRIJVEN
 * (de tuner schrijft elke waarde weg op vier significante cijfers) en niets
 * anders. De vlag hieronder rekent daarom met diezelfde marge, want een
 * bewaker die op de laatste geschreven decimaal alarm slaat, meldt afronding
 * als bevinding.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { H_PER_MH } from '../src/lib/engine2/constants.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';
import {
  lfBumpForSeriesRL,
  maxSeriesInductanceFromBump,
} from '../src/lib/engine2/optimizer/bounds.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import {
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_TARGET_CURVE,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { Complex } from '../src/lib/complex.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = join(HERE, 'measure-v48-ceiling-tracking.ts');
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1-v48-shards');
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v48_plafond.json');
const ONLY = process.env.V48_ONLY ? Number(process.env.V48_ONLY) : null;
const JOBS = Math.max(1, Number(process.env.V48_JOBS ?? cpus().length));

/** De twee armen, en de enige sleutel waarin zij verschillen. */
const ARMS = ['seed', 'tuned'] as const;
type Arm = (typeof ARMS)[number];

/** De tuner schrijft elke waarde weg op vier significante cijfers; dichter dan
 *  dat kan een geleverd onderdeel het punt dat geprojecteerd is niet halen. */
const WRITE_OUT_TOLERANCE = 1e-3;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
/* Hetzelfde rapport dat de generator bouwt, tot op de instelling: dit script
 * moet dezelfde kandidaten en dezelfde feiten zien, anders vergelijkt het twee
 * armen van een ander veld. */
const geometry = casus1Geometry(golden);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
  },
});
const facts = casus1V2Facts(report, manifest, files);
const gridded = casus1ChainInput(manifest, files, golden);
const field = casus1Field(report);
const BUDGET = CASUS1_V2_BUDGETS.lfBumpBudgetDb!;

/* ---- de inversie, buiten de run, om een plafond bij een gegeven pad-R te
 * kunnen navragen. Dezelfde functie die de worker aanroept; hier alleen met
 * een andere padweerstand ingevuld. ------------------------------------- */
const nf = facts.nearFieldByModel!.woofer;
const zw = facts.impedanceByModel!.woofer;
const toC = (m: readonly number[], p: readonly number[]): Complex[] =>
  m.map((mag, i) => ({
    re: mag * Math.cos((p[i] * Math.PI) / 180),
    im: mag * Math.sin((p[i] * Math.PI) / 180),
  }));
const ZC = toC(zw.magnitude, zw.phaseDeg);
const inputAt = (pathROhm: number) => ({
  nfGrid: nf.grid,
  nfDb: nf.db,
  zGrid: zw.grid,
  z: ZC,
  fPeakHz: facts.fundamentalHzByModel!.woofer!,
  nfValidHz: nf.validHz,
  pathROhm,
});
const ceilingAt = (pathR: number): number | null =>
  maxSeriesInductanceFromBump(inputAt(pathR), BUDGET)?.maxHenry ?? null;
/** De opslingering die een gegeven spoel bij een gegeven padweerstand oplevert. */
const resonantOf = (pathR: number, henry: number): number | null => {
  const a = lfBumpForSeriesRL(inputAt(pathR), henry);
  const b = lfBumpForSeriesRL(inputAt(pathR), 0);
  return a === null || b === null ? null : a - b;
};

/** De padweerstand en de totale seriespoel van één weg, uit een partslijst.
 *  Dezelfde bus-wandeling als `seriesPathResistance` in `worker.ts`. */
function wayOf(parts: readonly VxpPart[], model: string): { rOhm: number; lHenry: number } {
  const bus = busTopology(parts);
  let rOhm = 0;
  let lHenry = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(model)) continue;
    if (p.type === 'Resistor') rOhm += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') {
      rOhm += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
      lHenry += (p.params.find((q) => q.name === 'L')?.value ?? 0) * H_PER_MH;
    }
  }
  return { rOhm, lHenry };
}

interface Row {
  n: number;
  arm: Arm;
  label: string;
  seconds: number;
  /** De padweerstand waarbij het plafond is opgelost, uit de bound zelf. */
  zaadPadROhm: number | null;
  zaadPlafondMH: number | null;
  /** Wat de kandidaat deed. `null` = geleverd. */
  verwerping: { regels: string[]; reden: string } | null;
  /** Alleen voor een geleverd netwerk — een geweigerd netwerk bestaat niet
   *  meer op het moment dat het de worker verlaat (V31). */
  eindPadROhm: number | null;
  eindSpoelMH: number | null;
  plafondBijEindMH: number | null;
  opslingeringDb: number | null;
}

function payloadFor(c: (typeof field.field.candidates)[number], arm: Arm): V2Chain3Payload {
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const decl = casus1V2Declaration(c, gridded.safety);
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
    },
    /* DE ENIGE PLEK WAAR DE TWEE ARMEN VERSCHILLEN. Een expliciete waarde wint
     * van de afleiding, dus `'seed'` reproduceert het gedrag van vóór V48 op
     * dezelfde build als `'tuned'` — geen tweede commit, geen tweede
     * onbekende. */
    candidate: {
      ...decl,
      declaration: {
        ...decl.declaration,
        stated: { ...decl.declaration.stated, seriesInductanceCeilingSource: arm },
      },
    },
  };
}

interface DoneData {
  result: { parts: VxpPart[] };
  rejection: { kinds: string[]; reason: string } | null;
  bounds?: { rule: string; subject: string; maxSI: number; parameters: Record<string, unknown> }[];
}

function runOne(n: number): Row {
  const idx = Math.floor((n - 1) / ARMS.length);
  const arm = ARMS[(n - 1) % ARMS.length];
  const c = field.field.candidates[idx];
  const t0 = Date.now();
  const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload: payloadFor(c, arm) });
  const collected: DoneData[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as unknown as DoneData);
  });
  const done = collected[0];
  if (!done) throw new Error(`${c.label} / ${arm} leverde niets`);
  const bump = (done.bounds ?? []).find((b) => b.rule === 'bump-series-l');
  const parts = done.result?.parts ?? [];
  const delivered = done.rejection === null && parts.length > 0;
  const way = delivered ? wayOf(parts, 'woofer') : null;
  return {
    n,
    arm,
    label: c.label,
    seconds: (Date.now() - t0) / 1000,
    zaadPadROhm: bump ? (bump.parameters.path_R_ohm as number) : null,
    zaadPlafondMH: bump ? bump.maxSI / H_PER_MH : null,
    verwerping: done.rejection ? { regels: done.rejection.kinds, reden: done.rejection.reason } : null,
    eindPadROhm: way ? way.rOhm : null,
    eindSpoelMH: way ? way.lHenry / H_PER_MH : null,
    plafondBijEindMH: way ? ((ceilingAt(way.rOhm) ?? NaN) / H_PER_MH) : null,
    opslingeringDb: way ? resonantOf(way.rOhm, way.lHenry) : null,
  };
}

const TOTAL = field.field.candidates.length * ARMS.length;

/* ---- kindmodus: één (kandidaat, arm), één shard --------------------------- */
if (ONLY !== null) {
  mkdirSync(SHARD_DIR, { recursive: true });
  writeFileSync(
    join(SHARD_DIR, `run-${String(ONLY).padStart(3, '0')}.json`),
    JSON.stringify(runOne(ONLY)),
    'utf-8',
  );
  process.exit(0);
}

/* ---- oudermodus ---------------------------------------------------------- */
console.log(
  `V48: ${field.field.candidates.length} kandidaten × ${ARMS.length} armen = ${TOTAL} ketenruns, ` +
    `${JOBS} tegelijk op ${cpus().length} kernen`,
);
rmSync(SHARD_DIR, { recursive: true, force: true });
mkdirSync(SHARD_DIR, { recursive: true });
const t0 = Date.now();
let next = 0;
let finished = 0;
await new Promise<void>((resolve, reject) => {
  const start = () => {
    if (next >= TOTAL) {
      if (finished === TOTAL) resolve();
      return;
    }
    const n = ++next;
    const child = spawn('npx', ['vite-node', SELF], {
      cwd: join(HERE, '..'),
      env: { ...process.env, V48_ONLY: String(n), V48_JOBS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b: Buffer) => (out += b.toString()));
    child.stderr.on('data', (b: Buffer) => (out += b.toString()));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`run ${n} faalde (exit ${code}):\n${out}`));
        return;
      }
      finished++;
      console.log(`  [${finished}/${TOTAL}] run ${n} klaar`);
      start();
    });
  };
  for (let i = 0; i < Math.min(JOBS, TOTAL); i++) start();
});
console.log(`alle ${TOTAL} runs klaar in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

const rows: Row[] = [];
for (let n = 1; n <= TOTAL; n++) {
  rows.push(JSON.parse(readFileSync(join(SHARD_DIR, `run-${String(n).padStart(3, '0')}.json`), 'utf-8')) as Row);
}

const f = (v: number | null, d = 3, w = 8): string => (v === null || Number.isNaN(v) ? '—'.padStart(w) : v.toFixed(d).padStart(w));
const armOf = (label: string, arm: Arm): Row => rows.find((r) => r.label === label && r.arm === arm)!;

console.log('KANDIDAAT / ARM                              zaad-R  zaadplaf  eind-R  eindspoel  plaf@eind  opsling  uitkomst');
for (const c of field.field.candidates) {
  for (const arm of ARMS) {
    const r = armOf(c.label, arm);
    const uit = r.verwerping ? `VERWORPEN [${r.verwerping.regels.join(',')}]` : 'geleverd';
    const over =
      r.opslingeringDb !== null && r.opslingeringDb > BUDGET * (1 + WRITE_OUT_TOLERANCE)
        ? '  ⚠ BOVEN BUDGET'
        : '';
    console.log(
      `${(c.label.slice(0, 38) + ' / ' + arm).padEnd(46)}` +
        `${f(r.zaadPadROhm, 3, 7)} ${f(r.zaadPlafondMH, 3, 9)} ${f(r.eindPadROhm, 3, 7)} ` +
        `${f(r.eindSpoelMH, 3, 10)} ${f(r.plafondBijEindMH, 3, 10)} ${f(r.opslingeringDb, 3, 8)}  ${uit}${over}`,
    );
  }
}

console.log('\nSAMENVATTING (budget %s dB)', BUDGET.toFixed(2));
for (const arm of ARMS) {
  const a = rows.filter((r) => r.arm === arm);
  const geleverd = a.filter((r) => r.verwerping === null);
  const budgetRefused = a.filter((r) => r.verwerping?.regels.includes('budget'));
  const over = geleverd.filter(
    (r) => r.opslingeringDb !== null && r.opslingeringDb > BUDGET * (1 + WRITE_OUT_TOLERANCE),
  );
  console.log(
    `  ${arm.padEnd(6)}: ${geleverd.length}/${a.length} geleverd, ` +
      `${budgetRefused.length} verworpen op BUDGET (de stale-plafond-slachtoffers), ` +
      `${over.length} geleverd bóven het budget`,
  );
  for (const r of budgetRefused) console.log(`      · ${r.label} — ${r.verwerping!.reden}`);
}

writeFileSync(OUT, JSON.stringify({ budget_dB: BUDGET, armen: ARMS, rijen: rows }, null, 2) + '\n', 'utf-8');
console.log(`\ngeschreven: ${OUT}`);
