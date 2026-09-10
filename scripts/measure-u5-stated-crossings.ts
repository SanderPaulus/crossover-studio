/**
 * U-5 — THREE STATED CROSSINGS ON CASUS 1b, TUNED AND JUDGED IN FULL.
 *
 * The session's own measurement, and the reason it is a script rather than a
 * paragraph in a report: it is THREE LIVE CHAIN RUNS (roughly 400 s each on
 * this machine), and a browser check that only exists in a session log is a
 * check nobody can repeat.
 *
 * WHAT IT MEASURES. Casus 1b's mid→tweeter window at order 4 runs 1647–2304 Hz
 * (floor `drive-stated`, the stated −20 dB M-C figure inverted; ceiling
 * `breakup`, the mid's first significant breakup over its UNCALIBRATED
 * divisor). 2200 Hz sits inside it; 2400 and 2600 Hz do not. All three are
 * stated, so all three run — and each of them comes back with the verdict on
 * every limit it is past, in that limit's own unit: for the breakup ceiling,
 * the suppression the delivered low pass actually puts on the breakup against
 * the suppression the divisor asks for.
 *
 * Writes `test-fixtures/casus1b_u5_stated.json`. `U5_ONLY=<hz>` runs one;
 * `U5_JOBS=<n>` runs n at a time as child processes (the casus-1b generator's
 * own shape), which is what makes three of them a seven-minute measurement
 * rather than a twenty-minute one.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_SEED,
  CASUS1B_DIR,
  CASUS1B_TARGET_CURVE,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
} from '../src/lib/engine2/casus1b.fixture.ts';
import { buildCandidateField } from '../src/lib/engine2/predesign/candidateField.ts';
import { parseStatedCrossings, type StatedBreachVerdict } from '../src/lib/engine2/predesign/statedCrossings.ts';
import { statedMarkForWorker } from '../src/lib/engine2/optimizer/scanRequest.ts';
import { crossoverWindow } from '../src/lib/engine2/predesign/xoWindow.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { ChainResult } from '../src/lib/designChain.ts';

/** The three crossings this measurement is about, as the designer would type them. */
const STATED_TEXT = '2200, 2400, 2600';
/** The stamp a stated crossing carries — the app's own, and stated here. */
const STATED_ON = '2026-09-10';
/** Where the per-crossing results are written. */
const OUT = join(CASUS1B_DIR, '..', 'casus1b_u5_stated.json');
const SHARDS = join(CASUS1B_DIR, '..', '.casus1b-u5-shards');

const manifest = casus1bManifest();
const files = casus1bFiles(manifest);
const report = casus1bReport(null, manifest, files);
const wis = report.predesign.windowInputs;

const parsed = parseStatedCrossings(STATED_TEXT, wis.map((wi) => `${wi.lower}→${wi.upper}`));
if (!parsed.complete) throw new Error(`the stated field is incomplete: ${parsed.problems.join(' ')}`);

const field = buildCandidateField({
  windowInputs: wis,
  perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
  alignments: CASUS1B_FIELD_ALIGNMENTS,
  /* The exploration's own shape, so the DERIVED half of the field is exactly
   * the one the casus-1b generator ran (`casus1bField`). */
  chainBudget: 8,
  positionPolicy: 'centre-first',
  alignmentPolicy: 'one',
  statedPerAxisHz: parsed.perAxisHz,
  statedOn: STATED_ON,
}).field;

const stated = field.candidates.filter((c) => c.stated);
const window = crossoverWindow({ ...wis[0], order: CASUS1B_STATED_ORDER });

/* ------------------------------------------------------------------ *
 * The window, before a single chain runs
 * ------------------------------------------------------------------ */

function printWindow(): void {
  console.log(`\ncasus 1b, ${wis[0].lower}→${wis[0].upper} at order ${CASUS1B_STATED_ORDER}`);
  console.log(
    `  window ${window.floorHz?.toFixed(1)}–${window.ceilingHz?.toFixed(1)} Hz ` +
      `(floor ${window.floorBy?.rule}, ceiling ${window.ceilingBy?.rule})`,
  );
  for (const l of window.limits) {
    console.log(`  ${l.side.padEnd(7)} ${l.rule.padEnd(13)} ${l.hz.toFixed(1).padStart(8)} Hz${l.uncalibrated ? '  UNCALIBRATED' : ''}`);
  }
  console.log('\nstated positions:');
  for (const c of stated) {
    const s = c.stated!;
    console.log(
      `  ${String(c.crossings[0].hz).padStart(6)} Hz  ${s.outsideWindow ? 'OUTSIDE' : 'inside '}  ` +
        (s.perCrossing[0].breaches.length === 0
          ? 'past nothing'
          : s.perCrossing[0].breaches
              .map(
                (b) =>
                  `${b.rule} ${b.side} ${b.limitHz.toFixed(0)} Hz, ${b.octaves.toFixed(3)} oct past; ` +
                  `asks ${b.demandDb?.toFixed(2) ?? '—'} dB on ${b.subject} at ${b.atHz?.toFixed(0) ?? '—'} Hz`,
              )
              .join(' | ')),
    );
  }
}

/* ------------------------------------------------------------------ *
 * One live chain run
 * ------------------------------------------------------------------ */

interface Row {
  hz: number;
  label: string;
  runtime_s: number;
  outside_window: boolean;
  delivered: boolean;
  refusal: { kinds: string[]; reason: string } | null;
  parts: number;
  rms_db: number | null;
  window_pm_db: number | null;
  min_z_ohm: number | null;
  gates: { gate: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
  missed_stated: string[];
  breaches: {
    rule: string;
    side: string;
    limit_hz: number;
    octaves: number;
    stated: boolean;
    uncalibrated: boolean;
    demand_db: number | null;
    subject: string | null;
    at_hz: number | null;
    measured_db: number | null;
    read_at_hz: number | null;
    meets: boolean | null;
    verdict: string;
  }[];
}

function runOne(hz: number): Row {
  const cand = stated.find((c) => c.crossings[0].hz === hz);
  if (!cand) throw new Error(`no stated candidate at ${hz} Hz`);
  const gridded = casus1bChainInput(manifest, files);
  const seed = casus1bSeed();
  const decl = casus1bV2Declaration(cand, gridded.safety);
  const payload: V2ChainOnePayload = {
    input: casus1bChainInputFor(cand, gridded, seed),
    label: cand.label,
    v2: {
      gates: CASUS1B_V2_GATES,
      budgets: CASUS1B_V2_BUDGETS,
      determinism: { seed: CASUS1B_V2_SEED },
      ...casus1bV2Facts(report, manifest, files),
      targetCurve: CASUS1B_TARGET_CURVE,
      judgeBandHz: CASUS1B_V2_BAND_HZ,
    },
    candidate: {
      ...decl,
      stated: statedMarkForWorker(cand.stated!, (id) =>
        id === wis[0].lower ? 'mid' : id === wis[0].upper ? 'tweeter' : undefined,
      ),
    },
  };
  const t0 = Date.now();
  let out: unknown = null;
  handleV2Request(
    { id: 1, kind: 'v2ChainOne', payload: JSON.parse(JSON.stringify(payload)) as V2ChainOnePayload },
    (m: V2Response) => {
      if (m.kind === 'done') out = m.data;
      if (m.kind === 'error') throw new Error(m.message);
    },
  );
  const runtime = (Date.now() - t0) / 1000;
  if (!out) throw new Error('the worker returned nothing');
  const r = out as {
    result: ChainResult & { parts: unknown[] };
    gates: { gate: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
    rejection: { kinds: string[]; reason: string } | null;
    measurements: { response: { rmsDeviationDb: number | null; windowPlusMinusDb: number | null } | null };
    stated: {
      missedStated: string[];
      perCrossing: { breaches: StatedBreachVerdict[] }[];
    } | null;
  };
  return {
    hz,
    label: cand.label,
    runtime_s: runtime,
    outside_window: cand.stated!.outsideWindow,
    delivered: r.rejection === null,
    refusal: r.rejection ? { kinds: r.rejection.kinds, reason: r.rejection.reason } : null,
    parts: r.result.parts.length,
    rms_db: r.measurements.response?.rmsDeviationDb ?? null,
    window_pm_db: r.measurements.response?.windowPlusMinusDb ?? null,
    min_z_ohm: (r.result as unknown as { zMinOhm?: number }).zMinOhm ?? null,
    gates: r.gates.map((g) => ({ gate: g.gate, active: g.active, pass: g.pass, value: g.value, limit: g.limit })),
    missed_stated: r.stated?.missedStated ?? [],
    /* The worker speaks camelCase and this file writes snake_case, so the two
     * are mapped FIELD BY FIELD rather than spread: the first version spread
     * them and the printer read `limit_hz` off an object that had `limitHz`,
     * which is a crash at the end of three chain runs. */
    breaches: (r.stated?.perCrossing ?? []).flatMap((c) =>
      c.breaches.map((b) => ({
        rule: b.rule,
        side: b.side,
        limit_hz: b.limitHz,
        octaves: b.octaves,
        stated: b.stated,
        uncalibrated: b.uncalibrated !== null,
        demand_db: b.demandDb,
        subject: b.subject,
        at_hz: b.atHz,
        measured_db: b.measuredDb,
        read_at_hz: b.readAtHz,
        meets: b.meets,
        verdict: b.verdict,
      })),
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Shards, so three runs cost one run's wall clock
 * ------------------------------------------------------------------ */

const HERE = fileURLToPath(new URL('.', import.meta.url));
const only = process.env.U5_ONLY ? Number(process.env.U5_ONLY) : null;
const jobs = Math.max(1, Number(process.env.U5_JOBS ?? Math.min(stated.length, cpus().length)));

if (only !== null) {
  printWindow();
  const shard = join(SHARDS, `${only}.json`);
  /* An existing shard is REUSED — a chain run is minutes and A5e.4 says a
   * repeat on this machine reproduces it byte for byte. `U5_REDO=1` runs it
   * anyway (the A5e.3b shape). */
  if (existsSync(shard) && process.env.U5_REDO !== '1') {
    console.log(`\n${only} Hz: an existing shard is reused (U5_REDO=1 to run it again)`);
  } else {
    const row = runOne(only);
    if (!existsSync(SHARDS)) mkdirSync(SHARDS, { recursive: true });
    writeFileSync(shard, JSON.stringify(row, null, 2));
    console.log(`\n${only} Hz done in ${row.runtime_s.toFixed(0)} s`);
  }
} else {
  printWindow();
  const targets = stated.map((c) => c.crossings[0].hz);
  const queue = [...targets];
  const running: Promise<void>[] = [];
  const start = (hz: number) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn('npx', ['vite-node', join(HERE, 'measure-u5-stated-crossings.ts')], {
        env: { ...process.env, U5_ONLY: String(hz) },
        stdio: 'inherit',
      });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${hz} Hz exited ${code}`))));
    });
  const pump = async (): Promise<void> => {
    while (queue.length > 0) await start(queue.shift()!);
  };
  for (let i = 0; i < Math.min(jobs, targets.length); i++) running.push(pump());
  await Promise.all(running);

  const rows: Row[] = targets.map((hz) => JSON.parse(readFileSync(join(SHARDS, `${hz}.json`), 'utf-8')) as Row);
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        gemeten_op: new Date().toISOString().slice(0, 10),
        casus: 'casus 1b (casus 1’s mid and tweeter as a two-way)',
        gestelde_tekst: STATED_TEXT,
        gesteld_op: STATED_ON,
        venster: {
          orde: CASUS1B_STATED_ORDER,
          vloer_hz: window.floorHz,
          plafond_hz: window.ceilingHz,
          vloer_regel: window.floorBy?.rule ?? null,
          plafond_regel: window.ceilingBy?.rule ?? null,
          limieten: window.limits.map((l) => ({
            zijde: l.side,
            regel: l.rule,
            hz: l.hz,
            ongekalibreerd: l.uncalibrated !== undefined,
            bron: l.source,
          })),
        },
        rijen: rows,
      },
      null,
      2,
    ),
  );

  console.log('\n=== U-5: three stated crossings on casus 1b ===');
  for (const r of rows) {
    console.log(
      `\n${r.hz} Hz  ${r.outside_window ? 'OUTSIDE the window' : 'inside the window'}  ` +
        `${r.delivered ? 'delivered' : `REFUSED (${r.refusal?.kinds.join(', ')})`}  ` +
        `${r.parts} parts  ${r.runtime_s.toFixed(0)} s`,
    );
    console.log(
      `  RMS ${r.rms_db?.toFixed(2) ?? '—'} dB   window ±${r.window_pm_db?.toFixed(2) ?? '—'} dB   ` +
        `min |Z| ${r.min_z_ohm?.toFixed(2) ?? '—'} Ω`,
    );
    for (const g of r.gates.filter((g) => g.active)) {
      console.log(`  ${g.pass ? 'PASS' : 'FAIL'} ${g.gate.padEnd(9)} ${g.value?.toFixed(2) ?? '—'} against ${g.limit?.toFixed(2) ?? '—'}`);
    }
    for (const b of r.breaches) {
      console.log(
        `  PAST ${b.rule} ${b.side} ${b.limit_hz.toFixed(0)} Hz (${b.octaves.toFixed(3)} oct` +
          `${b.uncalibrated ? ', UNCALIBRATED' : ''}${b.stated ? ', STATED' : ', derived'}): ` +
          `asks ${b.demand_db?.toFixed(2) ?? '—'} dB, delivers ${b.measured_db?.toFixed(2) ?? '—'} dB ` +
          `at ${b.read_at_hz?.toFixed(0) ?? '—'} Hz — ${b.meets === null ? 'unknown' : b.meets ? 'DELIVERS' : 'FALLS SHORT'}`,
      );
    }
    console.log(`  misses (stated): ${r.missed_stated.length === 0 ? 'nothing' : r.missed_stated.join(', ')}`);
  }
  console.log(`\nwritten to ${OUT}`);
}
