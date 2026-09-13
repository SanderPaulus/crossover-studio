/**
 * E-5c, HENDEL 3 — VOORBEREID EN NIET GEBOUWD: wat een vroege exit op de
 * volle-dimensie POLIJSTPAS aan de eindvector zou doen, op de tien
 * C-2-netlists.
 *
 * `E5CL3_JOBS=<n> npx vite-node scripts/measure-e5c-polish-exit.ts` — één korte
 * tunerrun per netlist, parallel; `E5CL3_ONLY=<naam>` draait er één, wat het
 * script met zichzelf doet. Schrijft `test-fixtures/casus1_e5c_polijstexit.json`.
 *
 * WAAROM DEZE PAS. De E-5c-anatomie telde vijf volle-dimensie polijstpassen
 * (`step: 0.04`, na de blok-coördinaatverfijning) van samen 387 s — 21 % van
 * een casus-1-ketenrun — en TWEE ervan stonden op evaluatie 1 al binnen 1 % van
 * hun eigen einduitkomst, om er daarna 75 s aan te besteden voor 0,14 % en
 * 0,21 %.
 *
 * WAT DE VROEGE EXIT IS, en het is GEEN nieuwe drempel. `nelderMead` stopt al
 * zodra de spreiding van de simplex onder `tolerance` (1e-6) zakt. Die test is
 * ABSOLUUT, en op casus 1 liggen de objectiefwaarden rond 10³ — dus hij vraagt
 * negen significante cijfers overeenstemming en vuurt daarom nooit: alle vijf
 * de passen lopen tot hun plafond. Deze meting leest hetzelfde criterium op de
 * SCHAAL VAN DE PAS ZELF. Zij doet dat zonder één regel engine- of
 * solver-wijziging en zonder een tweede simplex-implementatie: de doelfunctie
 * wordt door haar eigen startwaarde gedeeld, waarna de ONGEWIJZIGDE
 * `nelderMead` met diezelfde 1e-6 een relatieve test uitvoert. Zelfde
 * algoritme, zelfde constante, andere eenheid.
 *
 * WAT HIJ MEET: per netlist de eindvector van de pas zoals hij draait naast de
 * eindvector die de vroege exit zou hebben opgeleverd, en het oordeel daarover
 * — IDENTIEK, BINNEN DE KLASSE, of ERBUITEN — plus wat de exit gekost zou
 * hebben in iteraties. Hij stelt niets en wapent niets: hendel 3 krijgt pas een
 * sleutel als deze tabel binnen de klassen valt.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { optimizeNetworkValues } from '../src/lib/netOptimizer.ts';
import * as optimizeModule from '../src/lib/optimize.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_e5c_polijstexit.json');
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-e5c-polish-shards');

/**
 * DE KLASSE WAARBINNEN TWEE EINDVECTOREN HETZELFDE ONTWERP ZIJN.
 *
 * Geen nieuw projectgetal: het is de componentwaarde-klasse die E-5c's eigen
 * guard al draagt (`structureRetune.test.ts`), en zij staat twee ordes binnen
 * wat de snoeidoctrine zelf aan objectief toelaat (10 %). Een vector die er
 * buiten valt is een ánder ontwerp en dan is hendel 3 niet gratis.
 */
const VALUE_CLASS_PCT = 2;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const gridded = casus1ChainInput(manifest, files, golden);

/** De tien C-2-netlists: wat het CASUSBOEK noemt als levend corpus, met het
 *  bestandspad erbij — gelezen en nooit uit de sleutelnaam afgeleid. De regel
 *  `^KAND_V2_\d+$` en niet `startsWith`, want die tweede slikt elk gedateerd
 *  corpus mee (de regel die dit project al draagt). */
const NETLIST_FILES: Record<string, string> = (
  golden as unknown as { manifest_en_geometrie: { netlists: Record<string, string> } }
).manifest_en_geometrie.netlists;
const NETLISTS: string[] = Object.keys(NETLIST_FILES).filter((k) => /^KAND_V2_\d+$/.test(k));
if (NETLISTS.length === 0) throw new Error('E-5c: geen levend KAND_V2-corpus in het casusboek');

interface PolishRow {
  netlist: string;
  dims: number;
  /** Wat de pas draait. */
  iteraties_nu: number;
  evaluaties_nu: number;
  seconden_nu: number;
  /** Wat de vroege exit zou hebben gedaan. */
  iteraties_exit: number;
  evaluaties_exit: number;
  /** fx van beide eindpunten. */
  fx_nu: number;
  fx_exit: number;
  /** Het verschil per component, als fractie, en het oordeel. */
  grootste_afwijking_fractie: number;
  oordeel: 'IDENTIEK' | 'BINNEN DE KLASSE' | 'ERBUITEN';
}

/** De sentinel waarmee de run wordt afgebroken zodra de pas gemeten is: alles
 *  daarna is werk waarvan deze meting niets leest. */
class Measured extends Error {
  constructor(readonly row: PolishRow) {
    super('measured');
  }
}

function measureOne(name: string): PolishRow {
  const partsRaw = JSON.parse(
    readFileSync(join(HERE, '..', 'test-fixtures', 'casus1', NETLIST_FILES[name]), 'utf8'),
  ) as { parts: VxpPart[] };

  let row: PolishRow | null = null;
  const original = optimizeModule.nelderMead;
  const wrapped = (
    f: (x: readonly number[]) => number,
    x0: readonly number[],
    o: optimizeModule.NelderMeadOptions = {},
  ): optimizeModule.NelderMeadResult => {
    /* Alleen de VOLLE-DIMENSIE polijstpas: step 0.04 en meer dimensies dan de
     * blok-coördinaatpas hanteert. */
    const isPolish = o.step === 0.04 && x0.length > 9;
    if (!isPolish || row !== null) return original(f, x0, o);
    let nNow = 0;
    const t0 = Date.now();
    const now = original((x) => { nNow++; return f(x); }, x0, o);
    const ms = Date.now() - t0;
    /* DEZELFDE SOLVER, DEZELFDE 1e-6, OP DE SCHAAL VAN DE PAS. Delen door de
     * eigen startwaarde maakt de absolute spreidingstest relatief; er wordt
     * geen regel solver-code aangeraakt en geen tweede implementatie gemaakt. */
    const scale = Math.abs(f(x0)) > 0 ? Math.abs(f(x0)) : 1;
    let nExit = 0;
    const exit = original((x) => { nExit++; return f(x) / scale; }, x0, o);
    let worst = 0;
    for (let i = 0; i < x0.length; i++) {
      /* De waarden zijn log10(SI); een fractie van de WAARDE is 10^Δ − 1. */
      worst = Math.max(worst, Math.abs(10 ** (exit.x[i] - now.x[i]) - 1));
    }
    row = {
      netlist: name,
      dims: x0.length,
      iteraties_nu: now.iterations,
      evaluaties_nu: nNow,
      seconden_nu: Number((ms / 1000).toFixed(1)),
      iteraties_exit: exit.iterations,
      evaluaties_exit: nExit,
      fx_nu: Number(now.fx.toFixed(9)),
      fx_exit: Number((exit.fx * scale).toFixed(9)),
      grootste_afwijking_fractie: Number(worst.toFixed(9)),
      oordeel: worst === 0 ? 'IDENTIEK' : worst <= VALUE_CLASS_PCT / 100 ? 'BINNEN DE KLASSE' : 'ERBUITEN',
    };
    throw new Measured(row);
  };
  const d = Object.getOwnPropertyDescriptor(optimizeModule, 'nelderMead');
  if (!d || !d.configurable) throw new Error('de simplex-export is niet configureerbaar');
  Object.defineProperty(optimizeModule, 'nelderMead', { configurable: true, enumerable: true, get: () => wrapped });

  try {
    optimizeNetworkValues(
      partsRaw.parts,
      [...gridded.grid],
      gridded.w,
      gridded.t,
      gridded.driverZ,
      { offsetMm: 0, trimDb: 0, inverted: false },
      {
        midBranch: gridded.m ? { response: gridded.m, adjust: {} } : undefined,
        phasePriority: 0.5,
        band: CASUS1_V2_SETTINGS.band,
        staged: CASUS1_V2_SETTINGS.targets,
        reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      } as never,
    );
  } catch (e) {
    if (e instanceof Measured) return e.row;
    throw e;
  }
  if (row) return row;
  throw new Error(`${name}: geen volle-dimensie polijstpas gezien`);
}

/* ------------------------------------------------------------------ *
 * Eén shard, of de hele tabel met kindprocessen
 * ------------------------------------------------------------------ */
const ONLY = process.env.E5CL3_ONLY;
if (ONLY) {
  const r = measureOne(ONLY);
  if (!existsSync(SHARDS)) mkdirSync(SHARDS, { recursive: true });
  writeFileSync(join(SHARDS, `${ONLY}.json`), JSON.stringify(r, null, 2) + '\n');
  console.log(`${ONLY}: ${r.oordeel} (${(r.grootste_afwijking_fractie * 100).toFixed(4)} %) — ${r.iteraties_nu} → ${r.iteraties_exit} iteraties`);
  process.exit(0);
}

const JOBS = Math.max(1, Math.min(Number(process.env.E5CL3_JOBS ?? 4), cpus().length));
console.log(`E-5c hendel 3 — de polijstexit op ${NETLISTS.length} netlists, ${JOBS} tegelijk`);
if (!existsSync(SHARDS)) mkdirSync(SHARDS, { recursive: true });

const queue = [...NETLISTS];
const rows: PolishRow[] = [];
await new Promise<void>((resolve, reject) => {
  let active = 0;
  const pump = (): void => {
    if (queue.length === 0 && active === 0) return resolve();
    while (active < JOBS && queue.length > 0) {
      const name = queue.shift()!;
      const shard = join(SHARDS, `${name}.json`);
      if (existsSync(shard)) {
        rows.push(JSON.parse(readFileSync(shard, 'utf8')) as PolishRow);
        continue;
      }
      active++;
      const child = spawn('npx', ['vite-node', join(HERE, 'measure-e5c-polish-exit.ts')], {
        env: { ...process.env, E5CL3_ONLY: name },
        stdio: 'inherit',
      });
      child.on('exit', (code) => {
        active--;
        if (code === 0 && existsSync(shard)) rows.push(JSON.parse(readFileSync(shard, 'utf8')) as PolishRow);
        else console.log(`  ${name}: MISLUKT (exit ${code})`);
        pump();
      });
    }
    if (queue.length === 0 && active === 0) resolve();
  };
  pump();
  void reject;
  void randomUUID;
  void createHash;
});

rows.sort((a, b) => a.netlist.localeCompare(b.netlist));
console.log(`\n${'netlist'.padEnd(12)} ${'dims'.padStart(5)} ${'iter nu'.padStart(9)} ${'iter exit'.padStart(10)} ${'fx nu'.padStart(14)} ${'fx exit'.padStart(14)} ${'max Δ %'.padStart(10)}  oordeel`);
for (const r of rows) {
  console.log(
    `${r.netlist.padEnd(12)} ${String(r.dims).padStart(5)} ${String(r.iteraties_nu).padStart(9)} ${String(r.iteraties_exit).padStart(10)} ` +
      `${r.fx_nu.toFixed(6).padStart(14)} ${r.fx_exit.toFixed(6).padStart(14)} ${(r.grootste_afwijking_fractie * 100).toFixed(4).padStart(10)}  ${r.oordeel}`,
  );
}
const verdicts = new Set(rows.map((r) => r.oordeel));
console.log(`\n  oordelen: ${[...verdicts].join(', ')}`);
console.log(`  iteraties: ${rows.reduce((a, r) => a + r.iteraties_nu, 0)} → ${rows.reduce((a, r) => a + r.iteraties_exit, 0)}`);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _wat:
        'E-5c hendel 3, VOORBEREID EN NIET GEBOUWD: wat een vroege exit op de volle-dimensie polijstpas ' +
        'aan de eindvector doet, op de C-2-netlists. Het criterium is dat van de pas zelf (nelderMead\'s ' +
        'eigen 1e-6), gelezen op de schaal van de pas in plaats van absoluut — geen nieuwe drempel.',
      klasse_pct: VALUE_CLASS_PCT,
      netlists: rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nwrote ${OUT}`);
