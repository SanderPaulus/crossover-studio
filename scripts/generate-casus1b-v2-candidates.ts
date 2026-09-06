/**
 * E-3 — HOW THE `KAND-V2-*` FIXTURES OF CASUS 1b WERE MADE: the TWO-WAY route.
 *
 * `npx vite-node scripts/generate-casus1b-v2-candidates.ts` — one chain run per
 * candidate, `V2_JOBS` at a time (default: all candidates at once, the field is
 * three). `V2_ONLY=<n>` runs one candidate and writes its shard;
 * `V2_MERGE=1` merges existing shards without running (A5e.3-veld's rule).
 *
 * WHAT IT IS. Casus 1b (casus 1's mid and tweeter as a two-way) through the
 * v2 worker's two-way branch — `handleV2Request` with kind `v2ChainOne`, the
 * route the three-way corpus is generated on, one chain over: the A5d field
 * (an EXPLORATION, E-2: budget 8, centre-first, one alignment per handover),
 * the candidate's declaration and its chain declaration, the measured facts,
 * the gates casus 1b states, and `runDesignChain` under the hook. The same
 * discipline as `generate-casus1-v2-candidates.ts` (F4d/V27): the app's own
 * two-way settings and not a minimal set, every protection armed, the setup
 * READ OFF the payload into the provenance block, netlists frozen as FILES so
 * their metrics stay class B.
 *
 * WHAT IT IS NOT: the app. The app's two-way scan still runs on the v1 worker
 * (`runChainScan`); this script is the route the E-3 map calls "de tweewegroute
 * door de v2-worker", and casebook E-3 lists the client and app wiring as the
 * open item.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { candidateFieldKey } from '../src/lib/engine2/predesign/candidateField.ts';
import { greyValues } from '../src/lib/engine2/optimizer/choices.ts';
import { resolveDeterminism, stableJson, stampRun } from '../src/lib/engine2/optimizer/determinism.ts';
import { gateSettingsKey } from '../src/lib/engine2/optimizer/gates.ts';
import { budgetSettingsKey } from '../src/lib/engine2/optimizer/bounds.ts';
import { measurementFactsKey } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { buildShortlist, type ShortlistInput } from '../src/lib/engine2/optimizer/shortlist.ts';
import {
  handleV2Request,
  type V2ChainOnePayload,
  type V2CoilDcrColumn,
  type V2LevelWorkColumn,
  type V2Response,
} from '../src/lib/engine2/optimizer/worker.ts';
import type { ChainResult } from '../src/lib/designChain.ts';
import { serializeFilter } from '../src/lib/filterFile.ts';
import { describeCoilDcrModel } from '../src/lib/coilDcr.ts';
import { describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import {
  CASUS1B_DIR,
  CASUS1B_CONTINUOUS_POWER_W,
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BAND_SOURCE,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_GRID,
  CASUS1B_V2_SEED,
  CASUS1B_V2_SETTINGS,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
} from '../src/lib/engine2/casus1b.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_HERKOMST = join(HERE, '..', 'test-fixtures', 'casus1b_v2_herkomst.json');
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1b-v2-shards');
const ONLY = process.env.V2_ONLY ? Number(process.env.V2_ONLY) : null;
const SELF = fileURLToPath(import.meta.url);

const manifest = casus1bManifest();
const files = casus1bFiles(manifest);
const report = casus1bReport(null, manifest, files);
const facts = casus1bV2Facts(report, manifest, files);
const field = casus1bField(report);
const gridded = casus1bChainInput(manifest, files);
const JOBS = Math.max(1, Number(process.env.V2_JOBS ?? Math.min(field.field.candidates.length, cpus().length)));

console.log(`field: ${field.field.candidates.length} candidates (derived ${field.field.parameters.derivedSize}, budget ${field.field.parameters.chainBudget})`);
for (const a of field.field.axes) {
  console.log(`  ${a.pairLabel}: orders ${a.orders.join(',')} at ${a.positionsByOrder.map((p) => p.hz.join('/')).join(' | ')} Hz`);
}

type DoneData = {
  result: ChainResult;
  measurements: ShortlistInput<ChainResult>['measurements'];
  topology: ShortlistInput<ChainResult>['topology'];
  gates: ShortlistInput<ChainResult>['gates'];
  rejection: ShortlistInput<ChainResult>['rejection'];
  dissipation: ShortlistInput<ChainResult>['dissipation'];
  levelWork: V2LevelWorkColumn;
  coilDcr: V2CoilDcrColumn | null;
  bounds: unknown[];
  notes: string[];
};

interface Shard {
  label: string;
  row: {
    label: string;
    parts: unknown;
    result: unknown;
    topology: unknown;
    measurements: unknown;
    gates: unknown;
    dissipation: unknown;
    disqualified: unknown;
    rejection: unknown;
  };
  outcome: unknown;
  seconds: number;
}

function payloadFor(c: (typeof field.field.candidates)[number]): V2ChainOnePayload {
  return {
    input: casus1bChainInputFor(c, gridded, casus1bSeed()),
    label: c.label,
    v2: {
      ...facts,
      gates: { ...CASUS1B_V2_GATES },
      budgets: { ...CASUS1B_V2_BUDGETS },
      determinism: { seed: CASUS1B_V2_SEED },
      targetCurve: CASUS1B_TARGET_CURVE,
      judgeBandHz: CASUS1B_V2_BAND_HZ,
      ...(CASUS1B_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1B_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1bV2Declaration(c, gridded.safety),
  };
}

function runCandidate(c: (typeof field.field.candidates)[number], n: number): Shard {
  const payload = payloadFor(c);
  const t0 = Date.now();
  const wire = structuredClone({ id: n, kind: 'v2ChainOne' as const, payload });
  const collected: DoneData[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as DoneData);
  });
  const done = collected[0];
  if (!done) throw new Error(`candidate ${c.label} produced nothing`);
  const armed = done.gates.filter((v) => v.active);
  const failed = armed.filter((v) => !v.pass);
  const net = done.result.net as unknown as {
    tuned: number;
    evaluations: number;
    ampFloorRepair?: string;
    safetyNote?: string;
    zFloorSourceNote?: string;
    after: { rippleDb: number; phaseDeg: number; xoHz?: number | null; zMinOhm?: number | null; avgDevDb?: number };
  };
  const outcome = {
    label: c.label,
    geleverd: !done.rejection,
    rimpel_dB: Number(net.after.rippleDb.toFixed(2)),
    fase_graden: Number(net.after.phaseDeg.toFixed(1)),
    kruispunt_gesteld_hz: c.crossings[0].hz,
    kruispunt_geleverd_hz: net.after.xoHz == null ? null : Number(net.after.xoHz.toFixed(1)),
    poorten: done.gates.map((v) => ({
      poort: v.gate,
      onderwerp: v.subject,
      gewapend: v.active,
      geslaagd: v.pass,
      waarde: v.value === null ? null : Number(v.value.toFixed(3)),
      grens: v.limit,
    })),
    geweigerd_door: failed.map((v) => `${v.gate} (${v.subject})`),
    door_de_ketenzelf_gediskwalificeerd: [...(done.result.disqualified ?? [])],
    kruisvenster_oordeel: done.result.xoWindowOk,
    vf: {
      structuur: done.result.vf.structure,
      banden: done.result.vf.bandsUsed,
      rondes: done.result.rounds,
      omgekeerd: done.result.vf.inverted,
      stages: done.result.vf.stages.map((s) => s.label),
    },
    pas: {
      tuned: net.tuned,
      evaluaties: net.evaluations,
      ampFloorRepair: net.ampFloorRepair ?? null,
      safetyNote: net.safetyNote ?? null,
      vloerbron: net.zFloorSourceNote ?? null,
    },
    verwerping: done.rejection
      ? {
          regels: [...done.rejection.kinds],
          reden: done.rejection.reason,
          geweigerde_tune: (done.rejection.rejectedTune ?? null) as Record<string, number | null> | null,
        }
      : null,
    niveauwerk: {
      eis: done.levelWork.requirement,
      laagste_weg: done.levelWork.lowestWay,
      anker: done.levelWork.anchor,
      gevraagd_X_dB: done.levelWork.askedDb === null ? null : Number(done.levelWork.askedDb.toFixed(3)),
      geleverd_serie_R_totaal_ohm: done.levelWork.delivered ? Number(done.levelWork.delivered.totalSeriesOhm.toFixed(3)) : null,
      geleverd_shunt_pad: done.levelWork.delivered?.shuntPads.map((r) => ({ id: r.id, ohm: Number(r.ohm.toFixed(3)) })) ?? null,
    },
    spoel_dcr: done.coilDcr
      ? {
          model: done.coilDcr.model ? describeCoilDcrModel(done.coilDcr.model) : null,
          totaal_ohm: Number(done.coilDcr.inventory.carriedTotalOhm.toFixed(3)),
          per_spoel: done.coilDcr.inventory.coils.map((k) => ({
            id: k.id,
            weg: k.ways.join('+'),
            mH: Number((k.henry * 1e3).toFixed(3)),
            dcr_ohm: Number(k.carriedOhm.toFixed(4)),
            familie: k.family,
            binnen_bereik: k.inRange,
          })),
          buiten_bereik: [...done.coilDcr.inventory.outOfRange],
        }
      : null,
    topologie: done.topology,
    notities: done.notes,
  };
  console.log(
    `  [${n}/${field.field.candidates.length}] ${c.label} → ` +
      (done.rejection
        ? `NO NETWORK — refused by ${done.rejection.kinds.join(', ') || 'a wholesale gate'}: ${done.rejection.reason.slice(0, 120)}`
        : `${net.after.rippleDb.toFixed(2)} dB / ${net.after.phaseDeg.toFixed(1)}°  xo ${net.after.xoHz?.toFixed(0) ?? '—'} Hz` +
          `  min|Z| ${(done.gates.find((v) => v.gate === 'M-B/|Z|')?.value ?? NaN).toFixed(2)} Ω` +
          `  ${failed.length ? `REFUSED by ${failed.map((v) => v.gate).join(', ')}` : 'gates ok'}`) +
      `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  return {
    label: c.label,
    row: {
      label: c.label,
      parts: done.result.parts,
      result: done.result,
      topology: done.topology,
      measurements: done.measurements,
      gates: done.gates,
      dissipation: done.dissipation,
      disqualified: done.result.disqualified,
      rejection: done.rejection,
    },
    outcome,
    seconds: (Date.now() - t0) / 1000,
  };
}

const withRuntime = (shard: Shard): Record<string, unknown> => ({ ...(shard.outcome as object), looptijd_s: Number(shard.seconds.toFixed(3)) });

/* ---- child mode ---- */
if (ONLY !== null) {
  const c = field.field.candidates[ONLY - 1];
  if (!c) throw new Error(`V2_ONLY=${ONLY} is outside the field of ${field.field.candidates.length}`);
  mkdirSync(SHARD_DIR, { recursive: true });
  writeFileSync(join(SHARD_DIR, `cand-${String(ONLY).padStart(3, '0')}.json`), JSON.stringify(runCandidate(c, ONLY)), 'utf-8');
  process.exit(0);
}

/* ---- parent mode ---- */
const rows: ShortlistInput<ChainResult>[] = [];
const outcomes: Record<string, unknown>[] = [];
const perCandidate: Record<string, unknown> = {};
const count = field.field.candidates.length;
const mergeOnly = process.env.V2_MERGE === '1';
console.log(mergeOnly ? `V2_MERGE=1: merging ${count} existing shards, running nothing` : `parallel: ${count} candidates, ${JOBS} at a time on ${cpus().length} cores`);
if (!mergeOnly) rmSync(SHARD_DIR, { recursive: true, force: true });
mkdirSync(SHARD_DIR, { recursive: true });
const t0 = Date.now();
let next = 0;
let finished = 0;
if (!mergeOnly) await new Promise<void>((resolve, reject) => {
  const start = () => {
    if (next >= count) {
      if (finished === count) resolve();
      return;
    }
    const n = ++next;
    const child = spawn('npx', ['vite-node', SELF], {
      cwd: join(HERE, '..'),
      env: { ...process.env, V2_ONLY: String(n), V2_JOBS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b: Buffer) => (out += b.toString()));
    child.stderr.on('data', (b: Buffer) => (out += b.toString()));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`candidate ${n} failed (exit ${code}):\n${out}`));
        return;
      }
      finished++;
      for (const line of out.split('\n')) if (line.startsWith('  [')) console.log(line);
      start();
    });
  };
  for (let i = 0; i < Math.min(JOBS, count); i++) start();
});
console.log(`all ${count} candidates done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (let n = 1; n <= count; n++) {
  const shard = JSON.parse(readFileSync(join(SHARD_DIR, `cand-${String(n).padStart(3, '0')}.json`), 'utf-8')) as Shard;
  rows.push(shard.row as unknown as ShortlistInput<ChainResult>);
  outcomes.push(withRuntime(shard));
  const c = field.field.candidates[n - 1];
  perCandidate[c.label] = { provenance: c.provenance, crossings: c.crossings };
}
const lastPayload = payloadFor(field.field.candidates[count - 1]);

const stamp = stampRun(
  {
    determinism: resolveDeterminism({ seed: CASUS1B_V2_SEED }),
    design: stableJson({ variants: field.field.candidates.map((c) => [c.label, c.crossings[0].hz]) }),
    measurements: stableJson({ grid: [CASUS1B_V2_GRID[0], CASUS1B_V2_GRID[CASUS1B_V2_GRID.length - 1], CASUS1B_V2_GRID.length] }),
    gates: stableJson(gateSettingsKey(lastPayload.v2.gates)),
    bounds: stableJson(budgetSettingsKey(lastPayload.v2.budgets)),
    tuning: stableJson(CASUS1B_V2_SETTINGS),
    facts: stableJson(measurementFactsKey(facts)),
    choices: stableJson({ veld: candidateFieldKey(field.field), grijze_waarden: greyValues(lastPayload.candidate?.declaration.stated) }),
  },
  'completed',
);
const shortlist = buildShortlist(rows, stamp.fingerprint, { targetCurve: CASUS1B_TARGET_CURVE });
console.log(`shortlist: ${shortlist.rows.length} of ${shortlist.consideredCount} considered`);

/* Prune the previous corpus' files from disk before writing: the shortlist can
 * shrink, and an unreferenced KAND-V2 file under a live name is the orphan hole
 * casus 1 documented (V32). Only the LIVE prefix, never a dated one. */
for (const f of (await import('node:fs')).readdirSync(CASUS1B_DIR)) {
  if (/^KAND-V2-\d+\.adsfilter\.json$/.test(f)) rmSync(join(CASUS1B_DIR, f));
}
const written: { name: string; label: string }[] = [];
shortlist.rows.forEach((row, i) => {
  const name = `KAND-V2-${i + 1}`;
  writeFileSync(join(CASUS1B_DIR, `${name}.adsfilter.json`), serializeFilter({ name, parts: [...row.parts] }), 'utf-8');
  written.push({ name, label: row.label });
  console.log(`  wrote ${name}.adsfilter.json  ← ${row.label}`);
});

const commit = execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();
const decl = lastPayload.candidate!;
writeFileSync(
  OUT_HERKOMST,
  `${JSON.stringify(
    {
      _: 'E-3 — DOCUMENTATIE, geen acceptatiewaarde. Zie scripts/generate-casus1b-v2-candidates.ts. Casus 1b: casus 1\'s mid en tweeter als tweeweg, door de v2-worker (v2ChainOne → runDesignChain onder de hook).',
      route: 'handleV2Request kind v2ChainOne → runDesignChain (vfOptimizer-ontwerpstap, synthese, tuner onder de hook) — de tweewegroute door de v2-worker; de app stuurt een tweewegverzoek nog naar de v1-worker (E-3, open punt).',
      gegenereerd_op_commit: commit,
      seed: CASUS1B_V2_SEED,
      opgenomen_op: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8, _: 'A5e.4 is byte-identiek PER (machine, runtime); elders regenereren levert een eigen, even geldig corpus (V46).' },
      run_vingerafdruk: stamp.fingerprint,
      grid: { van_hz: CASUS1B_V2_GRID[0], tot_hz: CASUS1B_V2_GRID[CASUS1B_V2_GRID.length - 1], punten: CASUS1B_V2_GRID.length },
      oordeelband_hz: CASUS1B_V2_BAND_HZ,
      oordeelband_bron: { ...CASUS1B_V2_BAND_SOURCE, _: 'de vloer is de hoogste van de geldigheidsvloer van de laagste weg (de mid, 60 Hz uit het mergeblok) en haar f_c (gesloten pod); het raster begint op de geldigheidsvloer met de resolutie van het precedent.' },
      meetset: { set: 'merged', bestanden: Object.fromEntries(manifest.entries.map((e) => [e.file, { driver: e.driver, kind: e.kind, hoek: e.angleDeg ?? null }])) },
      veld: {
        modus: 'exploration',
        bibliotheek: CASUS1B_FIELD_ALIGNMENTS.map((a) => `${a.kind}${a.order}`),
        gestelde_orde: CASUS1B_STATED_ORDER,
        per_as: field.field.axes.map((a) => ({ paar: a.pairLabel, orden: a.orders, posities_per_orde: a.positionsByOrder.map((p) => ({ orde: p.order, aantal: p.count, hz: p.hz })), venster: Object.fromEntries(Object.entries(a.window).map(([o, w]) => [o, { vloer_hz: w.floorHz, plafond_hz: w.ceilingHz, vloer_door: w.floorBy?.rule ?? null, plafond_door: w.ceilingBy?.rule ?? null }])) })),
        _: 'E-2: verkenning — budget EXPLORATION_CHAIN_BUDGET, posities centre-first (het venstercentrum en zijn buren), één uitlijning per overname (de gestelde orde 4, LR).',
      },
      settings: CASUS1B_V2_SETTINGS,
      meetopstelling: {
        _: 'Afgelezen van de laatste payload en niet overgeschreven (V27).',
        synthMode: CASUS1B_V2_SETTINGS.synthMode,
        v2_poorten_gewapend: Object.keys(lastPayload.v2.gates ?? {}).sort(),
        v2_budgetten_gewapend: Object.keys(lastPayload.v2.budgets ?? {}).sort(),
        v2_budgetten_waarom: 'LEEG: de twee casus-1-budgetten (LF-opslingering, Q_es-vermenigvuldiging) zijn op de woofer afgeleid en niet overgenomen (golden_refs_casus1b.json, gestelde_eisen.niet_overgenomen).',
        beschermingen_via_kandidaat: Object.keys(decl.declaration.stated).sort(),
        afwezig_verklaard: decl.declaration.absent.map((a) => a.key).sort(),
        gedelegeerd: decl.declaration.delegated.map((d) => d.key).sort(),
        ketenverklaring: decl.chainDeclaration,
        ketenverklaring_gelezen_door: 'withDeclaredChainChoicesTwoWay (E-3): eqBands → eqBandsPerDriver, leanTargetDb, lowestWayLevelWork, lowestWayCoilMaxHenry op ChainSettings; en withDeclaredSearchSmoothing: de gestelde errorSmoothOct bereikt de vf-ontwerpstap.',
        zoekmaat_gladding_oct: decl.declaration.stated.errorSmoothOct ?? null,
        vloer_zoekdoel_bron: decl.declaration.stated.zFloorBarrierSource ?? null,
        probe_raster: decl.declaration.stated.rSourceProbeSource ?? null,
        dissipatie_noemer: decl.declaration.stated.dissipationReferenceSource ?? null,
        fase_toelating: decl.declaration.stated.phaseAdmission ?? null,
        beschermingsregel: decl.declaration.stated.protectionRule ?? null,
        plafond_bron: decl.declaration.stated.seriesInductanceCeilingSource ?? null,
        spoel_dcr_model: decl.declaration.stated.coilDcrModel ? describeCoilDcrModel(decl.declaration.stated.coilDcrModel) : null,
        doelcurve: describeTargetCurve(CASUS1B_TARGET_CURVE),
        oordeelband_hz: lastPayload.v2.judgeBandHz,
        seed: CASUS1B_V2_SEED,
      },
      generator_parameters: field.field.parameters,
      shortlist: {
        overwogen: count,
        geweigerd_door_een_poort: outcomes.filter((o) => ((o as { geweigerd_door: string[] }).geweigerd_door).length > 0).length,
        leverde_geen_netwerk: outcomes.filter((o) => (o as { verwerping: unknown }).verwerping !== null).length,
        bevroren: written.length,
      },
      verwerpingen: shortlist.rejected,
      kandidaat_uitkomst: outcomes,
      referentie_kruispunt_hz: field.referenceCrossingHz,
      orde_afleiding: field.orders.map((o) => ({ paar: o.pairLabel, orden: o.orders, waarom: o.why })),
      bestanden: written,
      kandidaat_herkomst: perCandidate,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${OUT_HERKOMST}`);
