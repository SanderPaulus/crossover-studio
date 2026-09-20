/**
 * H-4 — POLARITEIT GEMETEN: wat de ontwerpstap koos, en wat de andere arm waard is.
 *
 * `npx vite-node scripts/measure-h4-polarity.ts` — seconden, geen ketenrun en
 * geen tune. Drie tabellen, en zij beantwoorden de drie vragen van stap 1:
 * WAAR de polariteit beslist wordt, OP WELKE GROND, en HOE VAAK die keuze op de
 * drie casussen van textbook afwijkt.
 *
 * `H4_RUN=1 npx vite-node scripts/measure-h4-polarity.ts` — ZES KETENRUNS: per
 * casus de goedkoopste kandidaat in BEIDE armen, achter elkaar, met de volle
 * vergelijkingsvector. `H4_ONLY=<key>` draait er één (`H4_JOBS` kinderen
 * tegelijk); `H4_REDO=1` overschrijft een bestaande shard. Schrijft
 * `test-fixtures/casus1_h4_polariteit.json`.
 *
 * WAT DIT NIET IS: een regeneratie. Geen corpus wordt aangeraakt, geen
 * shortlist opnieuw gekozen en geen netlist overschreven. Wat het oplevert is
 * de tabel waarmee de aanname "de gespiegelde arm verliest" een MEETING wordt.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { designThreeWay } from '../src/lib/threeWayDesign.ts';
import { optimizeVfCluster, vfPriorityScore } from '../src/lib/vfOptimizer.ts';
import { activeSideBranches, designStepOptions, type ChainInput } from '../src/lib/designChain.ts';
import { handleV2Request, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import {
  POLARITY_ARM_MARGIN_DEG,
  polarityArmsOf,
  statedInvertedForTwoWay,
  statedPolarityForThreeWay,
  textbookRelativeInverted,
} from '../src/lib/engine2/predesign/polarityArms.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { CASUS1_V2_SETTINGS, casus1CorpusSet } from '../src/lib/engine2/casus1V2.fixture.ts';
import {
  H4_CASUS1H_ACTIVE_HZ,
  casus1Bench,
  casus1PayloadFor,
  casus1bBench,
  casus1bPayloadFor,
  casus1hBench,
  casus1hPayloadFor,
  invertedDriversOf,
} from './h4-bench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_h4_polariteit.json');
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-h4-shards');
const SELF = fileURLToPath(import.meta.url);
const ONLY = process.env.H4_ONLY ?? null;
const RUN = process.env.H4_RUN === '1' || ONLY !== null;

const f2 = (v: number | null | undefined, n = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(n));

/* ================================================================== *
 * TABEL 1 — wat de ontwerpstap kiest, en wat de andere armen scoren
 * ================================================================== */

interface ChoiceRow {
  casus: string;
  label: string;
  chosenInverted: string[];
  textbookInverted: string[];
  matchesTextbook: boolean;
  /** fx per arm, de gekozen eerst. */
  arms: { inverted: string[]; fx: number; objective?: number; phaseDeg: (number | null)[] }[];
}

const rows: ChoiceRow[] = [];

const c1 = casus1Bench();
/* DE TWEEDE MEETSET, en zij staat er omdat de keuze ervan AFHANGT: `'koan677'`
 * is de set waarop het levende corpus is opgewekt (M-3's pin), `'m3'` de
 * huidige meetbasis. Een tabel die er maar één las zou de bevinding missen. */
const c1Corpus = casus1Bench(casus1CorpusSet());
const c1Settings = CASUS1_V2_SETTINGS as unknown as Record<string, unknown>;

function threeWayRows(b: ReturnType<typeof casus1Bench>, casus: string): void {
  for (const c of b.bare.field.candidates) {
    const base = {
      w: b.gridded.w,
      m: b.gridded.m,
      t: b.gridded.t,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c.crossings[0].hz,
      xoHigh: c.crossings[1].hz,
      band: c1Settings.band as [number, number],
      phasePriority: c1Settings.phasePriority as number,
      xoLowWindow: c.crossings[0].cageHz,
      xoHighWindow: c.crossings[1].cageHz,
      hpFloorHz: c1Settings.hpFloorHz as number | undefined,
      structureLow: c.crossings[0].alignment,
      structureHigh: c.crossings[1].alignment,
      breakupGuard: c1Settings.breakupGuard as boolean | undefined,
      eqBandsPerBranch: c1Settings.eqBands as number | undefined,
      diAnchorHz: c1Settings.diAnchorHz as { low?: number | null; high?: number | null } | undefined,
      diWeight: c1Settings.diWeight as number | undefined,
      ...(c1Settings.lowestWayLevelWork !== undefined
        ? { lowestWayLevelWork: c1Settings.lowestWayLevelWork }
        : {}),
    } as Parameters<typeof designThreeWay>[0];
    /* De VRIJE run: geen gestelde polariteit, dus de enumeratie van de
     * ontwerpstap zelf — precies wat elke kandidaat vóór H-4 kreeg. */
    const free = designThreeWay(base);
    /* En elke arm apart, GEBONDEN, op dezelfde objectieffunctie en met dezelfde
     * knie-refine EN dezelfde EQ-stap: dat is wat de tie-break weggooide. */
    const arms = polarityArmsOf(c.crossings, [true, true]).map((p) => {
      const d = designThreeWay({ ...base, statedPolarity: statedPolarityForThreeWay(p) });
      return { inverted: [...p.invertedWays], fx: d.fx, phaseDeg: d.pairPhaseDeg as (number | null)[] };
    });
    arms.sort((a, z) => a.fx - z.fx);
    const chosen = [
      ...(free.midInverted ? [c.crossings[0].upper] : []),
      ...(free.tweeterInverted ? [c.crossings[1].upper] : []),
    ].sort();
    const textbook = polarityArmsOf(c.crossings, [false, false])[0].invertedWays;
    rows.push({
      casus,
      label: c.label,
      chosenInverted: chosen,
      textbookInverted: [...textbook],
      matchesTextbook: chosen.join(',') === [...textbook].join(','),
      arms,
    });
  }
}

threeWayRows(c1, 'casus 1');
threeWayRows(c1Corpus, `casus 1 ${casus1CorpusSet()}`);

/** De tweewegontwerpstap, per polariteit gebonden, door dezelfde opties als de keten. */
function twoWayArms(
  c: GeneratedCandidate,
  input: ChainInput,
): { inverted: string[]; fx: number; phaseDeg: (number | null)[] }[] {
  const branches = activeSideBranches(input);
  const opts = designStepOptions(input, branches);
  return polarityArmsOf(c.crossings, [true]).map((p) => {
    const r = optimizeVfCluster(input.grid, input.w, input.t, input.seed, input.adjust, {
      ...opts,
      statedInverted: statedInvertedForTwoWay(p),
    });
    /* DE MAAT WAAROP DE CLUSTER ZELF RANGSCHIKT, en niet `objective`: de
     * tweewegontwerpstap kiest tussen zijn priority-runs op `vfPriorityScore`
     * op het SETPOINT (`optimizeVfCluster`), dus een tabel die hier het
     * objectief zou afdrukken vergelijkt de armen op een andere maat dan de
     * maat die de arm koos — precies de twee-definities-val. */
    return {
      inverted: [...p.invertedWays],
      fx: vfPriorityScore(r.best.after, input.settings.phasePriority),
      objective: r.best.objective,
      phaseDeg: [r.best.after.avgPhaseErrDeg],
    };
  });
}

const c1b = casus1bBench();
for (const c of c1b.bare.field.candidates) {
  const input = casus1bPayloadFor(c, c1b).input;
  const arms = twoWayArms(c, input);
  const free = optimizeVfCluster(input.grid, input.w, input.t, input.seed, input.adjust, {
    ...designStepOptions(input, activeSideBranches(input)),
  });
  arms.sort((a, b) => a.fx - b.fx);
  const chosen = free.best.inverted ? [c.crossings[0].upper] : [];
  const textbook = polarityArmsOf(c.crossings, [false])[0].invertedWays;
  rows.push({
    casus: 'casus 1b',
    label: c.label,
    chosenInverted: chosen,
    textbookInverted: [...textbook],
    matchesTextbook: chosen.join(',') === [...textbook].join(','),
    arms,
  });
}

const c1h = casus1hBench();
for (const c of c1h.bare.field.candidates) {
  const input = casus1hPayloadFor(c, c1h).input;
  const arms = twoWayArms(c, input);
  const free = optimizeVfCluster(input.grid, input.w, input.t, input.seed, input.adjust, {
    ...designStepOptions(input, activeSideBranches(input)),
  });
  arms.sort((a, b) => a.fx - b.fx);
  const chosen = free.best.inverted ? [c.crossings[0].upper] : [];
  const textbook = polarityArmsOf(c.crossings, [false])[0].invertedWays;
  rows.push({
    casus: 'casus 1h',
    label: c.label,
    chosenInverted: chosen,
    textbookInverted: [...textbook],
    matchesTextbook: chosen.join(',') === [...textbook].join(','),
    arms,
  });
}

console.log('\n=== 1. WAT DE ONTWERPSTAP KIEST, EN WAT DE ANDERE ARM SCOORT ===');
console.log(
  '   De keuze valt in de ENUMERATIE van de ontwerpstap (threeWayDesign stage 1: alignment ×\n' +
    '   mid-polariteit × tweeter-polariteit, beste fx; vfOptimizer runStructIters: elke structuur\n' +
    '   twee keer afgedaald, beste fx). De GROND is die ene fx: amplitude-vlakheid van de som plus\n' +
    '   de fase per aangrenzend paar plus de lekterm plus de DI-afstand — op IDEALE filters, zonder\n' +
    '   ladder, driverimpedantie, synthese of componenttune.\n',
);
for (const r of rows) {
  const best = r.arms[0];
  const second = r.arms[1];
  console.log(
    `${r.casus.padEnd(18)} ${r.label.padEnd(50)} chose [${r.chosenInverted.join('+') || '—'}] ` +
      `textbook [${r.textbookInverted.join('+') || '—'}] ${r.matchesTextbook ? '= textbook' : '*** DIFFERS'} | ` +
      r.arms
        .map(
          (a) =>
            `[${a.inverted.join('+') || '—'}]:${f2(a.fx)}` +
            (a.objective !== undefined ? `(obj ${f2(a.objective)})` : ''),
        )
        .join('  ') +
      (second ? ` | 2nd/1st = ${f2(second.fx / best.fx)}×` : ''),
  );
}
const differing = rows.filter((r) => !r.matchesTextbook);
console.log(
  `\n   DIFFERS FROM TEXTBOOK: ${differing.length} of ${rows.length} candidates` +
    (differing.length === 0
      ? ' — the heuristic is a DEAD BRANCH on this casus book: it has never once\n' +
        '   departed from the polarity the alignment asks for, and its only visible effect is that\n' +
        '   the other arm does not exist.'
      : `: ${differing.map((d) => d.label).join(', ')}`),
);

/* ================================================================== *
 * TABEL 2 — de pre-design marge, en wat elke modus ervan zou zaaien
 * ================================================================== */

console.log('\n=== 2. DE PRE-DESIGN FASEMARGE PER KRUISING ===');
console.log(
  `   De gemiddelde faseafwijking van het paar over het overlapvenster, op ideale filters, per arm.\n` +
    `   Binnen één eenheid faseafwijking (${POLARITY_ARM_MARGIN_DEG}°) beslist het fase-argument niet en zaait de\n` +
    `   VERKENNING beide armen; het VOLLE veld zaait ze hoe dan ook.\n`,
);
const marginRows: { casus: string; pair: string; hz: number; m: ReturnType<typeof c1.marginFor> }[] = [];
for (const c of c1.bare.field.candidates)
  for (const x of c.crossings) marginRows.push({ casus: 'casus 1', pair: x.pairLabel, hz: x.hz, m: c1.marginFor(x) });
for (const c of c1b.bare.field.candidates)
  for (const x of c.crossings) marginRows.push({ casus: 'casus 1b', pair: x.pairLabel, hz: x.hz, m: c1b.marginFor(x) });
for (const c of c1h.bare.field.candidates)
  for (const x of c.crossings) marginRows.push({ casus: 'casus 1h', pair: x.pairLabel, hz: x.hz, m: c1h.marginFor(x) });
const seenM = new Set<string>();
for (const r of marginRows) {
  const k = `${r.casus}|${r.pair}|${r.hz}`;
  if (seenM.has(k)) continue;
  seenM.add(k);
  console.log(
    `${r.casus.padEnd(10)} ${r.pair.padEnd(16)} ${r.hz.toFixed(1).padStart(8)} Hz  ` +
      `textbook ${f2(r.m.textbookDeg, 1).padStart(6)}°  mirror ${f2(r.m.mirrorDeg, 1).padStart(6)}°  ` +
      `margin ${f2(r.m.marginDeg, 1).padStart(6)}°  exploration seeds mirror: ${r.m.seedMirror ? 'YES' : 'no'}`,
  );
}
const seeds = [...seenM].length;
const seeded = marginRows.filter((r, i) => marginRows.findIndex((q) => `${q.casus}|${q.pair}|${q.hz}` === `${r.casus}|${r.pair}|${r.hz}`) === i && r.m.seedMirror).length;
console.log(`\n   EXPLORATION would seed the mirrored arm on ${seeded} of ${seeds} distinct crossings.`);

console.log('\n   Field sizes, bare against both-arms:');
for (const [name, bare, armed] of [
  ['casus 1', c1.bare, c1.armed],
  ['casus 1b', c1b.bare, c1b.armed],
  ['casus 1h', c1h.bare, c1h.armed],
] as const) {
  console.log(
    `   ${name.padEnd(9)} ${String(bare.field.candidates.length).padStart(3)} → ` +
      `${String(armed.field.candidates.length).padStart(3)} candidates ` +
      `(${armed.field.candidates.filter((c) => c.polarity?.arm === 'mirror').length} mirrored)`,
  );
}

/* ================================================================== *
 * TABEL 3 — wat de bevroren netlists van het casusboek dragen
 * ================================================================== */

console.log('\n=== 3. WAT DE GELEVERDE NETLISTS DRAGEN (E-3 vouwt de polariteit erin) ===');
const manifests: [string, string][] = [
  ['casus 1', 'test-fixtures/golden_refs_casus1.json'],
  ['casus 1b', 'test-fixtures/casus1b/golden_refs_casus1b.json'],
  ['casus 1h', 'test-fixtures/casus1h/golden_refs_casus1h.json'],
  ['casus 2', 'test-fixtures/casus2/golden_refs_casus2.json'],
];
let nets = 0;
let inverted = 0;
const invertedNames: string[] = [];
for (const [casus, path] of manifests) {
  const g = JSON.parse(readFileSync(join(HERE, '..', path), 'utf8')) as {
    manifest_en_geometrie?: { netlists?: Record<string, string> };
  };
  const list = g.manifest_en_geometrie?.netlists ?? {};
  for (const [key, rel] of Object.entries(list)) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    const file = rel.startsWith('test-fixtures/') ? rel : `${dir}/${rel}`;
    if (!existsSync(join(HERE, '..', file))) continue;
    nets++;
    const inv = invertedDriversOf(file);
    if (inv.length > 0) {
      inverted++;
      invertedNames.push(`${casus}/${key} [${inv.join('+')}]`);
    }
  }
}
console.log(
  `   ${nets} frozen netlists read; ${inverted} carry an inverted driver` +
    (inverted > 0 ? `: ${invertedNames.join(', ')}` : ' — none.'),
);

/* ================================================================== *
 * 4 — DE ARMEN, GEBOUWD (H4_RUN=1)
 * ================================================================== */

interface ArmJob {
  key: string;
  casus: 'casus 1' | 'casus 1b' | 'casus 1h';
  candidate: GeneratedCandidate;
}

/**
 * DE ONDERWERPEN: per casus de goedkoopste GELEVERDE kandidaat, en waar het
 * casusboek er een kent ook de goedkoopste GEWEIGERDE.
 *
 * Twee onderwerpen en niet één, omdat de twee vragen verschillend zijn: op een
 * geleverde kandidaat vraagt de tabel wat de gespiegelde arm KOST, en op een
 * geweigerde of de gespiegelde arm de weigering WEGNEEMT — en dat tweede is
 * precies wat een tie-break die nooit bouwt niet kan beantwoorden.
 *
 * "Goedkoopste" leest de LOOPTIJD uit de herkomst, E-1's regel, en "geleverd"
 * leest `verwerping === null` uit diezelfde herkomst — het veld dat de
 * generator schrijft, nooit een veld dat hier verzonnen wordt.
 */
function cheapestFromHerkomst(file: string): { delivered: string | null; refused: string | null } {
  const h = JSON.parse(readFileSync(join(HERE, '..', 'test-fixtures', file), 'utf8')) as {
    kandidaat_uitkomst?: { label: string; looptijd_s?: number; verwerping?: unknown }[];
  };
  const ks = (h.kandidaat_uitkomst ?? []).filter((k) => typeof k.looptijd_s === 'number');
  const by = (want: boolean) =>
    ks
      .filter((k) => (k.verwerping === null || k.verwerping === undefined) === want)
      .sort((a, b) => (a.looptijd_s ?? 0) - (b.looptijd_s ?? 0))[0]?.label ?? null;
  return { delivered: by(true), refused: by(false) };
}

function armJobs(): ArmJob[] {
  const out: ArmJob[] = [];
  const pick = (
    casus: ArmJob['casus'],
    armed: { field: { candidates: GeneratedCandidate[] } },
    baseLabel: string | null,
  ) => {
    if (!baseLabel) return;
    /* Exact, niet als prefix: een arm heet `"<basis> · <weg> ⌀"`, en een
     * prefixtoets zou een andere kandidaat met dezelfde kop meenemen. */
    const pairs = armed.field.candidates.filter(
      (c) => c.label === baseLabel || c.label.startsWith(`${baseLabel} · `),
    );
    for (const c of pairs) out.push({ key: `${casus}|${c.label}`, casus, candidate: c });
  };
  const c1h1 = cheapestFromHerkomst('casus1_v2_herkomst.json');
  pick('casus 1', c1.armed, c1h1.delivered);
  pick('casus 1', c1.armed, c1h1.refused);
  const c1bh = cheapestFromHerkomst('casus1b_v2_herkomst.json');
  pick('casus 1b', c1b.armed, c1bh.delivered);
  pick('casus 1b', c1b.armed, c1bh.refused);
  /* Casus 1h heeft één passieve kandidaat en vier gestelde actieve overnames;
   * de bank pint de eerste, dus er is hier niets te kiezen. */
  pick('casus 1h', c1h.armed, c1h.bare.field.candidates[0].label);
  return out;
}

interface ArmResult {
  key: string;
  casus: string;
  label: string;
  inverted: string[];
  arm: string;
  seconds: number;
  outcome: string;
  reason: string | null;
  rmsDb: number | null;
  windowDb: number | null;
  phaseDeg: (number | null)[];
  zMinOhm: number | null;
  parts: number | null;
  bomEur: number | null;
  gates: { id: string; active: boolean; pass: boolean }[];
}

function runOne(j: ArmJob): ArmResult {
  const t0 = Date.now();
  const payload =
    j.casus === 'casus 1'
      ? casus1PayloadFor(j.candidate, c1)
      : j.casus === 'casus 1b'
        ? casus1bPayloadFor(j.candidate, c1b)
        : casus1hPayloadFor(j.candidate, c1h);
  const kind = j.casus === 'casus 1' ? ('v2Chain3One' as const) : ('v2ChainOne' as const);
  const wire = structuredClone({ id: 1, kind, payload } as never);
  const collected: Record<string, never>[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as Record<string, never>);
  });
  const d = collected[0] as unknown as
    | {
        result: {
          bomTotalEur: number | null;
          parts: unknown[];
          net: { after: { rippleDb: number; phaseDeg: number; zMinOhm?: number | null } };
        };
        measurements: {
          response: { windowPlusMinusDb: number; rmsDeviationDb: number } | null;
          phaseTracking: { subject: string; meanAbsDeg: number }[];
        };
        gates: { gate: string; subject: string; active: boolean; pass: boolean }[];
        rejection: { kinds: string[]; reason: string } | null;
      }
    | undefined;
  if (!d) throw new Error(`${j.key}: the worker returned no result`);
  return {
    key: j.key,
    casus: j.casus,
    label: j.candidate.label,
    inverted: [...(j.candidate.polarity?.invertedWays ?? [])],
    arm: j.candidate.polarity?.arm ?? 'free',
    seconds: (Date.now() - t0) / 1000,
    outcome: d.rejection ? 'REFUSED' : 'delivered',
    reason: d.rejection?.reason ?? null,
    rmsDb: d.measurements.response?.rmsDeviationDb ?? null,
    windowDb: d.measurements.response?.windowPlusMinusDb ?? null,
    phaseDeg: d.measurements.phaseTracking.map((p) => p.meanAbsDeg),
    zMinOhm: d.result.net.after.zMinOhm ?? null,
    /* V31 — een geweigerde kandidaat draagt per constructie geen onderdelen, en
     * dat is het antwoord en geen nul. */
    parts: d.rejection ? null : d.result.parts.length,
    bomEur: d.result.bomTotalEur,
    gates: d.gates.map((g) => ({ id: `${g.gate}/${g.subject}`, active: g.active, pass: g.pass })),
  };
}

if (ONLY) {
  const job = armJobs().find((j) => j.key === ONLY);
  if (!job) throw new Error(`H4_ONLY=${ONLY} matches no arm job`);
  mkdirSync(SHARDS, { recursive: true });
  const r = runOne(job);
  writeFileSync(join(SHARDS, `${Buffer.from(job.key).toString('hex')}.json`), JSON.stringify(r, null, 2));
  console.log(`\n${job.key}: ${r.outcome} in ${f2(r.seconds, 1)} s`);
} else if (RUN) {
  const jobs = armJobs();
  const JOBS = Math.max(1, Number(process.env.H4_JOBS ?? Math.min(jobs.length, cpus().length)));
  mkdirSync(SHARDS, { recursive: true });
  console.log(`\n=== 4. DE ARMEN, GEBOUWD — ${jobs.length} ketenruns, ${JOBS} tegelijk ===`);
  const results: ArmResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: JOBS }, async () => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) return;
        const j = jobs[i];
        const shard = join(SHARDS, `${Buffer.from(j.key).toString('hex')}.json`);
        if (!existsSync(shard) || process.env.H4_REDO === '1') {
          await new Promise<void>((res, rej) => {
            const p = spawn('npx', ['vite-node', SELF], {
              env: { ...process.env, H4_ONLY: j.key, H4_RUN: '1' },
              stdio: 'inherit',
            });
            p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${j.key} exited ${code}`))));
          });
        }
        results.push(JSON.parse(readFileSync(shard, 'utf8')) as ArmResult);
      }
    }),
  );
  results.sort((a, b) => a.key.localeCompare(b.key));
  console.log('');
  /* WAT DEZE TABEL WEL EN NIET AFDRUKT, en waarom twee kolommen ontbreken.
   *
   * `rms` is `rmsDeviationDb` — de SORTEERSLEUTEL van de shortlist, dus precies
   * de maat waarop de twee armen tegen elkaar op zouden lopen. `phase` is M-K
   * per paar. Beide komen uit `measurements`, wat de worker zelf oplevert.
   *
   * Het ±-VENSTER en de BOM staan er NIET, en dat is een bevinding en geen
   * verzuim: de worker leest beide over de KETENBAND, die op casus 1b drie
   * octaven onder alles begint wat een mid/tweeter-paar uitstraalt — daar meet
   * het venster de eigen roll-off van de mid (±70 dB) en niet de vlakheid van
   * het ontwerp. Het venster dat het casusboek noteert (`spl_venster_pm_dB`)
   * komt uit `buildReport` op de oordeelband van de CASUS, en dat rapport bouwt
   * deze arm-run niet. De BOM is `null` omdat de fixture geen geprijsde
   * catalogus laadt. Een kolom die niets meet is erger dan een kolom die
   * ontbreekt (F0). */
  for (const r of results) {
    console.log(
      `${r.casus.padEnd(9)} [${(r.inverted.join('+') || '—').padEnd(10)}] ${r.arm.padEnd(8)} ` +
        `${r.outcome.padEnd(9)} rms ${f2(r.rmsDb, 3).padStart(7)}  ` +
        `M-K ${r.phaseDeg.map((p) => f2(p, 1)).join('/').padStart(12)}  |Z| ${f2(r.zMinOhm, 3).padStart(6)}  ` +
        `parts ${String(r.parts ?? '—').padStart(3)}  ${f2(r.seconds, 0)} s` +
        (r.reason ? `\n            reason: ${r.reason}` : ''),
    );
  }
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _wat: 'H-4 — de polariteitsarmen gemeten. Geen regeneratie: geen corpus is aangeraakt.',
        _gemeten_op: new Date().toISOString().slice(0, 10),
        marge_graden: POLARITY_ARM_MARGIN_DEG,
        casus_1h_actieve_overname_hz: H4_CASUS1H_ACTIVE_HZ,
        keuze: rows,
        marges: [...seenM].map((k) => {
          const r = marginRows.find((q) => `${q.casus}|${q.pair}|${q.hz}` === k)!;
          return { casus: r.casus, paar: r.pair, hz: r.hz, ...r.m };
        }),
        armen: results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwritten: ${OUT}`);
} else {
  console.log('\n(H4_RUN=1 to also build both arms of one candidate per casus — six chain runs.)');
}

void textbookRelativeInverted;
