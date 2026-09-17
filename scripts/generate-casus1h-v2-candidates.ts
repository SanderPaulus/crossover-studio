/**
 * H-1 — HOE DE `H-KAND-*`-FIXTURES VAN CASUS 1h GEMAAKT ZIJN: de HYBRIDE route.
 *
 * `npx vite-node scripts/generate-casus1h-v2-candidates.ts` — één ketenrun per
 * kandidaat, `V2_JOBS` tegelijk (default: alle kandidaten tegelijk, het veld is
 * klein). `V2_ONLY=<n>` draait er één en schrijft zijn shard; `V2_MERGE=1`
 * voegt bestaande shards samen zonder te draaien (de A5e.3-veld-regel).
 *
 * WAT HET VELD IS, EN WAAROM HET TWEE ASSEN HEEFT DIE NIET GELIJK ZIJN.
 * De ACTIEVE overname is GESTELD en staat niet in het veld: de actieve zijde
 * realiseert haar in een processor, en een zoektocht die haar verplaatst zoekt
 * in een filter dat deze app niet programmeert. Het veld dat de generator
 * doorloopt is dus het PRODUCT van (a) de vier gestelde actieve overnames en
 * (b) de kandidaten van de ENE passieve overname (mid→tweeter), elk met zijn
 * eigen declaratie — want de DSP-instellingen van de actieve zijde zijn per
 * overname afgeleid en reizen IN de ketenverklaring mee.
 *
 * DE PASSIEVE VENSTERS MOETEN OVER DE VIER GELIJK ZIJN, en dat wordt
 * GECONTROLEERD en niet aangenomen: het mid→tweeter-venster hangt aan de
 * driverbladen en de breakup van de mid, niet aan waar de woofer overgeeft.
 * Verschillen zij toch, dan is dat een bevinding en stopt het script.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import type { ActiveHandover, ModelBranchSettings } from '../src/lib/activeSide.ts';
import {
  ACTIVE_WAY,
  CASUS1H_ACTIVE,
  CASUS1H_CONTINUOUS_POWER_W,
  CASUS1H_DIR,
  CASUS1H_FIELD_ALIGNMENTS,
  CASUS1H_STATED_ORDER,
  CASUS1H_TARGET_CURVE,
  CASUS1H_V2_BAND_HZ,
  CASUS1H_V2_BAND_SOURCE,
  CASUS1H_V2_BUDGETS,
  CASUS1H_V2_GATES,
  CASUS1H_V2_GRID,
  CASUS1H_V2_SEED,
  CASUS1H_V2_SETTINGS,
  PASSIVE_LOWEST_WAY,
  casus1hActiveAt,
  casus1hChainInput,
  casus1hChainInputFor,
  casus1hField,
  casus1hFiles,
  casus1hManifest,
  casus1hSeed,
  casus1hV2Declaration,
  casus1hDeliveredReport,
  casus1hV2Facts,
} from '../src/lib/engine2/casus1h.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_HERKOMST = join(HERE, '..', 'test-fixtures', 'casus1h_v2_herkomst.json');
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1h-v2-shards');
const ONLY = process.env.V2_ONLY ? Number(process.env.V2_ONLY) : null;
const SELF = fileURLToPath(import.meta.url);

const manifest = casus1hManifest();
const files = casus1hFiles(manifest);
const gridded = casus1hChainInput(manifest, files);

/** One run of the generator: a stated active handover, and one passive candidate. */
interface Job {
  hz: number;
  active: { handover: ActiveHandover; settings: ModelBranchSettings };
  candidate: GeneratedCandidate;
  label: string;
}

/* The field per stated active handover, plus the check that the passive window
 * does not depend on it. */
const perHandover = CASUS1H_ACTIVE.positionsHz.map((hz) => {
  const active = casus1hActiveAt(hz, manifest, files);
  const field = casus1hField(active.report);
  return { hz, active, field };
});
const shapeOf = (f: (typeof perHandover)[number]['field']) =>
  JSON.stringify(f.field.axes.map((a) => [a.pairLabel, a.orders, a.positionsByOrder.map((p) => p.hz)]));
const shape0 = shapeOf(perHandover[0].field);
for (const p of perHandover) {
  if (shapeOf(p.field) !== shape0) {
    throw new Error(
      `the PASSIVE field moves with the active handover (${p.hz} Hz differs from ${perHandover[0].hz} Hz). ` +
        'That is a finding, not a run: the mid→tweeter window is a property of the two drivers, not of ' +
        'where the woofer hands over.',
    );
  }
}
const jobs: Job[] = perHandover.flatMap(({ hz, active, field }) =>
  field.field.candidates.map((c) => ({ hz, active, candidate: c, label: `H${hz} · ${c.label}` })),
);
const field0 = perHandover[0].field;
const JOBS = Math.max(1, Number(process.env.V2_JOBS ?? Math.min(jobs.length, cpus().length)));

const facts = casus1hV2Facts(perHandover[0].active.report, manifest, files);

console.log(
  `field: ${jobs.length} runs = ${CASUS1H_ACTIVE.positionsHz.length} stated active handovers ` +
    `(${CASUS1H_ACTIVE.positionsHz.join(', ')} Hz) × ${field0.field.candidates.length} passive candidates ` +
    `(derived ${field0.field.parameters.derivedSize}, budget ${field0.field.parameters.chainBudget})`,
);
for (const a of field0.field.axes) {
  console.log(`  ${a.pairLabel}: orders ${a.orders.join(',')} at ${a.positionsByOrder.map((p) => p.hz.join('/')).join(' | ')} Hz`);
}
for (const p of perHandover) {
  console.log(
    `  active ${p.hz} Hz → gain ${p.active.settings.gainDb.toFixed(2)} dB, delay ${p.active.settings.delayMs.toFixed(4)} ms, ` +
      `${p.active.settings.inverted ? 'INVERTED' : 'normal'} (null margin ${(p.active.report.activeSide!.nullMarginDb ?? NaN).toFixed(2)} dB ` +
      `against ${(p.active.report.activeSide!.otherPolarityNullMarginDb ?? NaN).toFixed(2)} for the other polarity)`,
  );
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
  row: Record<string, unknown>;
  outcome: Record<string, unknown>;
  seconds: number;
}

function payloadFor(j: Job): V2ChainOnePayload {
  return {
    input: casus1hChainInputFor(j.candidate, gridded, casus1hSeed(), j.active),
    label: j.label,
    v2: {
      ...facts,
      gates: { ...CASUS1H_V2_GATES },
      budgets: { ...CASUS1H_V2_BUDGETS },
      determinism: { seed: CASUS1H_V2_SEED },
      targetCurve: CASUS1H_TARGET_CURVE,
      judgeBandHz: CASUS1H_V2_BAND_HZ,
      ...(CASUS1H_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1H_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1hV2Declaration(j.candidate, j.active, gridded.safety),
  };
}

/** One pass through the worker, on the settings the job carries. */
function onePass(j: Job, n: number): DoneData {
  const payload = payloadFor(j);
  const wire = structuredClone({ id: n, kind: 'v2ChainOne' as const, payload });
  const collected: DoneData[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as DoneData);
  });
  const out = collected[0];
  if (!out) throw new Error(`run ${j.label} produced nothing`);
  return out;
}

function runOne(j: Job, n: number): Shard {
  const t0 = Date.now();
  /* ONE PASS. The model branch's LEVEL is matched to the lowest passive way
   * inside every evaluation (`levelMatchDb`), so there is nothing left to
   * iterate: H-1 first fixed the gain before the run and then tried closing the
   * loop with a second pass, and the second pass did not converge (pass 1 asked
   * -0.66 dB, its network asked -3.87, pass 2's network asked -5.69 — the tuner
   * absorbs part of the level error into the passive branches every time). A
   * level match belongs in the evaluation, not in an outer loop. */
  const done = onePass(j, n);
  const j2 = j;
  const armed = done.gates.filter((v) => v.active);
  const failed = armed.filter((v) => !v.pass);
  const net = done.result.net as unknown as {
    tuned: number;
    evaluations: number;
    ampFloorRepair?: string;
    safetyNote?: string;
    after: { rippleDb: number; phaseDeg: number; xoHz?: number | null };
  };
  /* The MID's own high-pass in the delivered specs — the thing H-1 exists to
   * produce, read off the design step rather than assumed. */
  const lowHp = done.result.vf.specs.woofer.hp;
  const outcome: Record<string, unknown> = {
    label: j.label,
    actieve_overname_hz: j.hz,
    dsp: {
      gain_dB: Number(j2.active.settings.gainDb.toFixed(3)),
      delay_ms: Number(j2.active.settings.delayMs.toFixed(4)),
      omgekeerd: j2.active.settings.inverted,
    },
    /* The DSP gain the DELIVERED network asks for, levelled against what was
     * built — the number that goes into the processor. The class-A value (the
     * stated shape alone) stands beside it in `dsp`, so the distance between
     * the ideal and the realisation is readable. */
    dsp_geleverd: (() => {
      const rep = casus1hDeliveredReport(j.hz, done.result.parts, manifest, files);
      const a = rep?.activeSide;
      return a?.settings
        ? {
            gain_dB: Number(a.settings.gainDb.toFixed(3)),
            klasse_A_gain_dB: Number((a.classAGainDb ?? NaN).toFixed(3)),
            delay_ms: Number(a.settings.delayMs.toFixed(4)),
            omgekeerd: a.settings.inverted,
          }
        : null;
    })(),
    geleverd: !done.rejection,
    hoogdoorlaat_op_de_onderste_passieve_weg: {
      enabled: lowHp.enabled,
      kind: lowHp.kind,
      orde: lowHp.order,
      hz: Number(lowHp.freq.toFixed(1)),
    },
    rimpel_dB: Number(net.after.rippleDb.toFixed(2)),
    fase_graden: Number(net.after.phaseDeg.toFixed(1)),
    kruispunt_gesteld_hz: j.candidate.crossings[0].hz,
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
    },
    pas: {
      tuned: net.tuned,
      evaluaties: net.evaluations,
      ampFloorRepair: net.ampFloorRepair ?? null,
      safetyNote: net.safetyNote ?? null,
    },
    verwerping: done.rejection
      ? { regels: [...done.rejection.kinds], reden: done.rejection.reason }
      : null,
    spoel_dcr: done.coilDcr
      ? {
          totaal_ohm: Number(done.coilDcr.inventory.carriedTotalOhm.toFixed(3)),
          buiten_bereik: [...done.coilDcr.inventory.outOfRange],
        }
      : null,
    topologie: done.topology,
    notities: done.notes,
  };
  console.log(
    `  [${n}/${jobs.length}] ${j.label} → ` +
      (done.rejection
        ? `NO NETWORK — refused by ${done.rejection.kinds.join(', ') || 'a wholesale gate'}: ${done.rejection.reason.slice(0, 120)}`
        : `${net.after.rippleDb.toFixed(2)} dB / ${net.after.phaseDeg.toFixed(1)}°  xo ${net.after.xoHz?.toFixed(0) ?? '—'} Hz` +
          `  HP ${lowHp.enabled ? `${lowHp.kind}${lowHp.order}@${lowHp.freq.toFixed(0)}` : 'NONE'}` +
          `  min|Z| ${(done.gates.find((v) => v.gate === 'M-B/|Z|')?.value ?? NaN).toFixed(2)} Ω` +
          `  ${failed.length ? `REFUSED by ${failed.map((v) => v.gate).join(', ')}` : 'gates ok'}`) +
      `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  return {
    label: j.label,
    row: {
      label: j.label,
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

const withRuntime = (shard: Shard): Record<string, unknown> => ({ ...shard.outcome, looptijd_s: Number(shard.seconds.toFixed(3)) });

/* ---- child mode ---- */
if (ONLY !== null) {
  const j = jobs[ONLY - 1];
  if (!j) throw new Error(`V2_ONLY=${ONLY} is outside the field of ${jobs.length}`);
  mkdirSync(SHARD_DIR, { recursive: true });
  writeFileSync(join(SHARD_DIR, `cand-${String(ONLY).padStart(3, '0')}.json`), JSON.stringify(runOne(j, ONLY)), 'utf-8');
  process.exit(0);
}

/* ---- parent mode ---- */
const rows: ShortlistInput<ChainResult>[] = [];
const outcomes: Record<string, unknown>[] = [];
const perCandidate: Record<string, unknown> = {};
const count = jobs.length;
const mergeOnly = process.env.V2_MERGE === '1';
console.log(mergeOnly ? `V2_MERGE=1: merging ${count} existing shards, running nothing` : `parallel: ${count} runs, ${JOBS} at a time on ${cpus().length} cores`);
if (!mergeOnly) rmSync(SHARD_DIR, { recursive: true, force: true });
mkdirSync(SHARD_DIR, { recursive: true });
const t0 = Date.now();
let next = 0;
let finished = 0;
if (!mergeOnly)
  await new Promise<void>((resolve, reject) => {
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
          reject(new Error(`run ${n} failed (exit ${code}):\n${out}`));
          return;
        }
        finished++;
        for (const line of out.split('\n')) if (line.startsWith('  [')) console.log(line);
        start();
      });
    };
    for (let i = 0; i < Math.min(JOBS, count); i++) start();
  });
console.log(`all ${count} runs done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (let n = 1; n <= count; n++) {
  const shard = JSON.parse(readFileSync(join(SHARD_DIR, `cand-${String(n).padStart(3, '0')}.json`), 'utf-8')) as Shard;
  rows.push(shard.row as unknown as ShortlistInput<ChainResult>);
  outcomes.push(withRuntime(shard));
  const j = jobs[n - 1];
  perCandidate[j.label] = {
    provenance: j.candidate.provenance,
    crossings: j.candidate.crossings,
    actieve_overname_hz: j.hz,
    dsp_klasse_a: j.active.settings,
    dsp_geleverd: (shard.outcome as { dsp_geleverd: unknown }).dsp_geleverd,
  };
}
const lastPayload = payloadFor(jobs[count - 1]);

const stamp = stampRun(
  {
    determinism: resolveDeterminism({ seed: CASUS1H_V2_SEED }),
    design: stableJson({ variants: jobs.map((j) => [j.label, j.hz, j.candidate.crossings[0].hz]) }),
    measurements: stableJson({ grid: [CASUS1H_V2_GRID[0], CASUS1H_V2_GRID[CASUS1H_V2_GRID.length - 1], CASUS1H_V2_GRID.length] }),
    gates: stableJson(gateSettingsKey(lastPayload.v2.gates)),
    bounds: stableJson(budgetSettingsKey(lastPayload.v2.budgets)),
    tuning: stableJson(CASUS1H_V2_SETTINGS),
    facts: stableJson(measurementFactsKey(facts)),
    choices: stableJson({
      veld: candidateFieldKey(field0.field),
      actieve_overnames: CASUS1H_ACTIVE.positionsHz,
      grijze_waarden: greyValues(lastPayload.candidate?.declaration.stated),
    }),
  },
  'completed',
);
const shortlist = buildShortlist(rows, stamp.fingerprint, { targetCurve: CASUS1H_TARGET_CURVE });
console.log(`shortlist: ${shortlist.rows.length} of ${shortlist.consideredCount} considered`);

for (const f of readdirSync(CASUS1H_DIR)) {
  if (/^H-KAND-\d+\.adsfilter\.json$/.test(f)) rmSync(join(CASUS1H_DIR, f));
}
const written: { name: string; label: string }[] = [];
shortlist.rows.forEach((row, i) => {
  const name = `H-KAND-${i + 1}`;
  writeFileSync(join(CASUS1H_DIR, `${name}.adsfilter.json`), serializeFilter({ name, parts: [...row.parts] }), 'utf-8');
  written.push({ name, label: row.label });
  console.log(`  wrote ${name}.adsfilter.json  ← ${row.label}`);
});

const commit = execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();
const decl = lastPayload.candidate!;
writeFileSync(
  OUT_HERKOMST,
  `${JSON.stringify(
    {
      _: 'H-1 — DOCUMENTATIE, geen acceptatiewaarde. Zie scripts/generate-casus1h-v2-candidates.ts.',
      route: 'handleV2Request kind v2ChainOne → runDesignChain, met een GESTELDE actieve overname: de onderste passieve weg krijgt de gestelde hoogdoorlaat, de som die geoordeeld wordt draagt de gemodelleerde actieve tak, en elke elektrische grootheid leest uitsluitend de mid/tweeter-netlist.',
      gegenereerd_op_commit: commit,
      seed: CASUS1H_V2_SEED,
      opgenomen_op: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8, _: 'A5e.4 is byte-identiek PER (machine, runtime) — V46.' },
      run_vingerafdruk: stamp.fingerprint,
      grid: { van_hz: CASUS1H_V2_GRID[0], tot_hz: CASUS1H_V2_GRID[CASUS1H_V2_GRID.length - 1], punten: CASUS1H_V2_GRID.length },
      oordeelband_hz: CASUS1H_V2_BAND_HZ,
      oordeelband_bron: { ...CASUS1H_V2_BAND_SOURCE, _: 'de ACTIEVE weg is de laagste weg van het systeem; dat zij niet in de netlist staat verandert niets aan waar de luidspreker speelt (E-5).' },
      meetset: { set: 'koan677', bestanden: Object.fromEntries(manifest.entries.map((e) => [e.file, { driver: e.driver, kind: e.kind, hoek: e.angleDeg ?? null }])) },
      actieve_zijde: {
        _: 'GESTELD, niet gezocht. De DSP-instellingen per overname zijn klasse A (metingen + gestelde vorm) en vastgezet vóór de zoektocht.',
        actieve_weg: ACTIVE_WAY,
        onderste_passieve_weg: PASSIVE_LOWEST_WAY,
        doelvorm: `${CASUS1H_ACTIVE.kind}${CASUS1H_ACTIVE.order}`,
        gesteld_door: CASUS1H_ACTIVE.statedBy,
        per_overname: perHandover.map((p) => ({
          hz: p.hz,
          gain_dB: Number(p.active.settings.gainDb.toFixed(3)),
          delay_ms: Number(p.active.settings.delayMs.toFixed(4)),
          omgekeerd: p.active.settings.inverted,
          nul_marge_dB: Number((p.active.report.activeSide!.nullMarginDb ?? NaN).toFixed(2)),
          andere_polariteit_nul_marge_dB: Number((p.active.report.activeSide!.otherPolarityNullMarginDb ?? NaN).toFixed(2)),
          andere_polariteit_delay_ms: Number((p.active.report.activeSide!.otherPolarityDelayMs ?? NaN).toFixed(4)),
          fitband_hz: p.active.report.activeSide!.fitBandHz,
        })),
      },
      veld: {
        modus: 'exploration',
        bibliotheek: CASUS1H_FIELD_ALIGNMENTS.map((a) => `${a.kind}${a.order}`),
        gestelde_orde: CASUS1H_STATED_ORDER,
        actieve_overnames_hz: CASUS1H_ACTIVE.positionsHz,
        per_as: field0.field.axes.map((a) => ({
          paar: a.pairLabel,
          orden: a.orders,
          posities_per_orde: a.positionsByOrder.map((p) => ({ orde: p.order, aantal: p.count, hz: p.hz })),
          venster: Object.fromEntries(
            Object.entries(a.window).map(([o, w]) => [o, { vloer_hz: w.floorHz, plafond_hz: w.ceilingHz, vloer_door: w.floorBy?.rule ?? null, plafond_door: w.ceilingBy?.rule ?? null }]),
          ),
        })),
        _: 'Het PRODUCT van de gestelde actieve overnames en de kandidaten van de ene passieve overname; de passieve vensters zijn over de vier gecontroleerd en identiek.',
      },
      settings: CASUS1H_V2_SETTINGS,
      meetopstelling: {
        _: 'Afgelezen van de laatste payload en niet overgeschreven (V27).',
        synthMode: CASUS1H_V2_SETTINGS.synthMode,
        v2_poorten_gewapend: Object.keys(lastPayload.v2.gates ?? {}).sort(),
        v2_budgetten_gewapend: Object.keys(lastPayload.v2.budgets ?? {}).sort(),
        v2_budgetten_waarom: 'M-D is NIET gewapend: er staat op een hybride geen passieve seriespoel meer tussen de versterker en het wooferpaar, dus de grootheid die de eis begrenst bestaat niet. Q_es IS gewapend, gesteld op de mid (golden_refs_casus1h.json).',
        beschermingen_via_kandidaat: Object.keys(decl.declaration.stated).sort(),
        afwezig_verklaard: decl.declaration.absent.map((a) => a.key).sort(),
        gedelegeerd: decl.declaration.delegated.map((d) => d.key).sort(),
        ketenverklaring: decl.chainDeclaration,
        actieve_zijde_verklaard: decl.chainDeclaration.stated.activeSide !== undefined,
        zoekmaat_gladding_oct: decl.declaration.stated.errorSmoothOct ?? null,
        vloer_zoekdoel_bron: decl.declaration.stated.zFloorBarrierSource ?? null,
        probe_raster: decl.declaration.stated.rSourceProbeSource ?? null,
        dissipatie_noemer: decl.declaration.stated.dissipationReferenceSource ?? null,
        fase_toelating: decl.declaration.stated.phaseAdmission ?? null,
        beschermingsregel: decl.declaration.stated.protectionRule ?? null,
        spoel_dcr_model: decl.declaration.stated.coilDcrModel ? describeCoilDcrModel(decl.declaration.stated.coilDcrModel) : null,
        doelcurve: describeTargetCurve(CASUS1H_TARGET_CURVE),
        oordeelband_hz: lastPayload.v2.judgeBandHz,
        seed: CASUS1H_V2_SEED,
      },
      generator_parameters: field0.field.parameters,
      shortlist: {
        overwogen: count,
        geweigerd_door_een_poort: outcomes.filter((o) => (o.geweigerd_door as string[]).length > 0).length,
        leverde_geen_netwerk: outcomes.filter((o) => o.verwerping !== null).length,
        bevroren: written.length,
      },
      verwerpingen: shortlist.rejected,
      kandidaat_uitkomst: outcomes,
      referentie_kruispunt_hz: field0.referenceCrossingHz,
      orde_afleiding: field0.orders.map((o) => ({ paar: o.pairLabel, orden: o.orders, waarom: o.why })),
      bestanden: written,
      kandidaat_herkomst: perCandidate,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${OUT_HERKOMST}`);
