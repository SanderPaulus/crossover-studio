/**
 * M-4 — TWEE GESTELDE KRUISPUNTEN, HERTUND OP 25/75 RESPONS/FASE.
 *
 * `M4_JOBS=<n> npx vite-node scripts/measure-m4-phase-priority.ts` — TWEE LIVE
 * KETENRUNS (M-2b mat hun 50/50-tegenhangers op 2625 en 1897 s), standaard
 * allebei tegelijk als kindproces. `M4_ONLY=<hz>` draait er één en schrijft
 * zijn shard in `test-fixtures/.casus1-m4-shards/`; `M4_REDO=1` overschrijft
 * een bestaande shard, `M4_DRY=1` drukt alleen de payload-samenvatting af
 * (seconden — DOE DAT EERST, het is de controle dat er precies één factor
 * verzet is).
 *
 * WAT DIT IS EN WAT HET NIET IS. Het is GEEN regeneratie: het corpus van M-2b
 * blijft staan, niets wordt overschreven, en de shortlist wordt niet opnieuw
 * gekozen. Wat het oplevert zijn TWEE EXTRA NETLISTS met een eigen herkomst,
 * naast hun tegenhangers, zodat de vraag "wat kost fasetracking aan rimpel en
 * aan geld" een tabel wordt in plaats van een verwachting.
 *
 * DE SHARD DRAAGT HET GELEVERDE NETWERK, en dat is opzet: `register-m4-
 * candidates.ts` bevriest daaruit, zodat het bevriezen geen tweede ketenrun
 * kost. A5e.4 zegt dat een herhaling op deze machine byte-identiek is, maar
 * "byte-identiek" is een belofte over uren en niet een reden om ze te maken.
 *
 * Schrijft `test-fixtures/casus1_m4_fase.json`. De VERGELIJKINGSTABEL staat
 * niet hier maar in `measure-m4-comparison.ts`: die leest bevroren netlists en
 * kost seconden, en een tabel die aan een ketenrun vastzit is een tabel die
 * niemand naleest.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1SetOf,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Result } from '../src/lib/threeWayChain.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import {
  M4_PHASE_PRIORITY,
  M4_STATED_ON,
  M4_STATED_PER_AXIS_HZ,
  m4PayloadFor,
} from './m4-bench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_m4_fase.json');
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-m4-shards');
const SELF = fileURLToPath(import.meta.url);

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
      : {}),
    ...CASUS1_WINDOW_SETTINGS,
    ...CASUS1_BUILDABILITY,
    ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION,
    ...CASUS1_COIL_DCR_SETTINGS,
  },
});

const facts = casus1V2Facts(report, manifest, files);
const gridded = casus1ChainInput(manifest, files, golden);

/* Het veld MET de gestelde posities erbij. Het afgeleide deel is ongewijzigd —
 * dat is de P2-helft en `casus1Field.test.ts` bewaakt hem — en de gestelde
 * kandidaten staan ernaast (U-5). */
const field = casus1Field(report, { perAxisHz: M4_STATED_PER_AXIS_HZ, on: M4_STATED_ON });
const stated = field.field.candidates.filter((c) => c.stated);

if (stated.length !== 2) {
  throw new Error(
    `expected two stated candidates (${M4_STATED_PER_AXIS_HZ[0].join(', ')} Hz × ` +
      `${M4_STATED_PER_AXIS_HZ[1].join(', ')} Hz) but the field built ${stated.length}. ` +
      `Refusals: ${field.field.refusals.join(' | ') || 'none'}`,
  );
}

/** De as die deze sessie varieert is de ONDERSTE; de bovenste is voor beide gelijk. */
const lowHzOf = (c: (typeof stated)[number]): number => c.crossings[0].hz;

interface Shard {
  low_hz: number;
  high_hz: number;
  label: string;
  provenance: string;
  phase_priority: number;
  runtime_s: number;
  delivered: boolean;
  refusal: { kinds: string[]; reason: string } | null;
  /** Het GELEVERDE netwerk — waaruit `register-m4-candidates.ts` bevriest. */
  parts: VxpPart[] | null;
  tuner: { rippleDb: number; phaseDeg: number; tuned: number; evaluations: number };
  measurements: unknown;
  gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
  stated_breaches: unknown[];
  missed_stated: string[];
  notes: string[];
}

function runOne(hz: number): Shard {
  const c = stated.find((x) => lowHzOf(x) === hz);
  if (!c) throw new Error(`no stated candidate at woofer→mid ${hz} Hz`);
  const payload = m4PayloadFor(c, gridded, facts, M4_PHASE_PRIORITY);
  const t0 = Date.now();
  const collected: {
    result: Chain3Result & { parts: VxpPart[] };
    measurements: unknown;
    gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
    rejection: { kinds: string[]; reason: string } | null;
    stated: { missedStated: string[]; perCrossing: { breaches: unknown[] }[] } | null;
    notes: string[];
  }[] = [];
  handleV2Request(
    structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }),
    (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') collected.push(m.data as (typeof collected)[number]);
    },
  );
  const done = collected[0];
  if (!done) throw new Error(`candidate ${c.label} produced nothing`);
  return {
    low_hz: hz,
    high_hz: c.crossings[1].hz,
    label: c.label,
    provenance: c.provenance,
    phase_priority: M4_PHASE_PRIORITY,
    runtime_s: Number(((Date.now() - t0) / 1000).toFixed(3)),
    delivered: done.rejection === null,
    refusal: done.rejection ? { kinds: [...done.rejection.kinds], reason: done.rejection.reason } : null,
    parts: done.rejection === null ? [...done.result.parts] : null,
    tuner: {
      rippleDb: Number(done.result.net.after.rippleDb.toFixed(3)),
      phaseDeg: Number(done.result.net.after.phaseDeg.toFixed(2)),
      tuned: done.result.net.tuned,
      evaluations: done.result.net.evaluations,
    },
    measurements: done.measurements,
    gates: done.gates.map((g) => ({
      gate: g.gate,
      subject: g.subject,
      active: g.active,
      pass: g.pass,
      value: g.value === null ? null : Number(g.value.toFixed(4)),
      limit: g.limit,
    })),
    stated_breaches: (done.stated?.perCrossing ?? []).flatMap((x) => x.breaches),
    missed_stated: done.stated?.missedStated ?? [],
    notes: [...done.notes],
  };
}

function describePayload(): void {
  console.log(`\nM-4 — gestelde kruispunten op casus 1, meetset '${casus1SetOf(manifest)}'`);
  console.log(`  phasePriority ${M4_PHASE_PRIORITY} (respons ${Math.round((1 - M4_PHASE_PRIORITY) * 100)} % · fase ${Math.round(M4_PHASE_PRIORITY * 100)} %)`);
  console.log(`  seed ${CASUS1_V2_SEED}, synthMode ${CASUS1_V2_SETTINGS.synthMode}, targets ${JSON.stringify(CASUS1_V2_SETTINGS.targets)}`);
  console.log(`  veld: ${field.field.candidates.length} kandidaten, waarvan ${stated.length} GESTELD (afgeleid ${field.field.parameters.derivedSize})`);
  for (const c of stated) {
    const s = c.stated!;
    console.log(`  · ${c.label}`);
    console.log(`      kooi ${c.crossings[0].cageHz.map((v) => v.toFixed(1)).join('–')} Hz × ${c.crossings[1].cageHz.map((v) => v.toFixed(1)).join('–')} Hz`);
    console.log(`      ${s.outsideWindow ? 'BUITEN een venster' : 'binnen beide vensters'}`);
    const payload = m4PayloadFor(c, gridded, facts, M4_PHASE_PRIORITY);
    const chain = payload.candidate?.chainDeclaration.stated ?? {};
    console.log(`      ketenverklaring: ${JSON.stringify(chain)}`);
    console.log(`      settings.phasePriority: ${(payload.input.settings as { phasePriority: number }).phasePriority}`);
  }
}

const only = process.env.M4_ONLY ? Number(process.env.M4_ONLY) : null;
const jobs = Math.max(1, Number(process.env.M4_JOBS ?? Math.min(stated.length, cpus().length)));

if (process.env.M4_DRY === '1') {
  describePayload();
} else if (only !== null) {
  const shard = join(SHARDS, `${only}.json`);
  if (existsSync(shard) && process.env.M4_REDO !== '1') {
    console.log(`${only} Hz: an existing shard is reused (M4_REDO=1 to run it again)`);
  } else {
    const row = runOne(only);
    if (!existsSync(SHARDS)) mkdirSync(SHARDS, { recursive: true });
    writeFileSync(shard, JSON.stringify(row, null, 1));
    console.log(
      `${only} Hz done in ${row.runtime_s.toFixed(0)} s — ` +
        `${row.delivered ? `delivered, ${row.parts?.length ?? 0} parts` : `REFUSED (${row.refusal?.kinds.join(', ')})`}` +
        `, tuner ripple ${row.tuner.rippleDb.toFixed(2)} dB / phase ${row.tuner.phaseDeg.toFixed(1)}°`,
    );
  }
} else {
  describePayload();
  const targets = stated.map(lowHzOf);
  const queue = [...targets];
  const start = (hz: number) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn('npx', ['vite-node', SELF], {
        env: { ...process.env, M4_ONLY: String(hz) },
        stdio: 'inherit',
      });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${hz} Hz exited ${code}`))));
    });
  const pump = async (): Promise<void> => {
    while (queue.length > 0) await start(queue.shift()!);
  };
  const running: Promise<void>[] = [];
  for (let i = 0; i < Math.min(jobs, targets.length); i++) running.push(pump());
  await Promise.all(running);

  const rows: Shard[] = targets.map((hz) => JSON.parse(readFileSync(join(SHARDS, `${hz}.json`), 'utf-8')) as Shard);
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _:
          'M-4 — DOCUMENTATIE van twee gestelde kandidaten op 25/75. Geen acceptatiewaarde: wat ' +
          'acceptatie is, zijn de bevroren netlists en hun klasse-B-referenties. Zie ' +
          'scripts/measure-m4-phase-priority.ts.',
        gemeten_op: new Date().toISOString().slice(0, 10),
        gegenereerd_op_commit: execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim(),
        meetset: casus1SetOf(manifest),
        seed: CASUS1_V2_SEED,
        phase_priority: M4_PHASE_PRIORITY,
        phase_priority_bron: `gesteld door Sander, ${M4_STATED_ON} — fase-prioriteit`,
        gestelde_kruispunten_hz: M4_STATED_PER_AXIS_HZ,
        gesteld_op: M4_STATED_ON,
        veld: {
          kandidaten: field.field.candidates.length,
          afgeleid: field.field.parameters.derivedSize,
          gesteld: field.field.parameters.statedSize ?? 0,
        },
        rijen: rows,
      },
      null,
      1,
    ),
  );
  console.log(`\nwritten to ${OUT}`);
  for (const r of rows) {
    console.log(
      `  ${r.low_hz} Hz: ${r.delivered ? 'delivered' : `REFUSED (${r.refusal?.kinds.join(', ')})`} in ${r.runtime_s.toFixed(0)} s`,
    );
  }
}
