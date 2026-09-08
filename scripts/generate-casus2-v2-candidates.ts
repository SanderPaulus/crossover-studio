/**
 * CASUS 2 — HOE DE `KAND-V2-*` FIXTURES VAN CASUS 2 GEMAAKT ZIJN: de DRIEWEG-
 * route van de v2-worker, op een SYNTHETISCHE meetset.
 *
 * `npx vite-node scripts/generate-casus2-v2-candidates.ts` — één ketenrun per
 * kandidaat, `V2_JOBS` tegelijk. `V2_ONLY=<n>` draait er één en schrijft zijn
 * shard; `V2_MERGE=1` voegt bestaande shards samen zonder te draaien
 * (A5e.3-veld's regel).
 *
 * WAT HET IS. Hetzelfde pad als de casus-1-generator — `handleV2Request` met
 * soort `v2Chain3One`, het A5d-veld, de kandidaatverklaring, de gemeten feiten,
 * de poorten die casus 2 stelt — op metingen die de engine nooit gezien heeft.
 * DAT is de vraag die casus 2 hier stelt: levert de route ontwerpen op een set
 * waarvan geen enkel getal uit casus 1 komt? Niet: vindt zij de beste. Vandaar
 * een VERKENNING (E-2, budget 8) en geen vol veld.
 *
 * De discipline is die van F4d/V27: de eigen instellingen van de app en geen
 * minimale set, elke bescherming gewapend, de meetopstelling AFGELEZEN van de
 * payload in het herkomstblok, en de netlists bevroren als BESTANDEN zodat hun
 * metrieken klasse B blijven en geen enkele referentie een functie van een
 * zoektocht wordt (F4a/R2).
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
  type V2Chain3Payload,
  type V2CoilDcrColumn,
  type V2LevelWorkColumn,
  type V2Response,
} from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import { serializeFilter } from '../src/lib/filterFile.ts';
import { describeCoilDcrModel } from '../src/lib/coilDcr.ts';
import { describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import {
  CASUS2_DIR,
  CASUS2_CONTINUOUS_POWER_W,
  CASUS2_FIELD_ALIGNMENTS,
  CASUS2_STATED_ORDER,
  CASUS2_TARGET_CURVE,
  CASUS2_V2_BAND_HZ,
  CASUS2_V2_BAND_SOURCE,
  CASUS2_V2_BUDGETS,
  CASUS2_V2_GATES,
  CASUS2_V2_GRID,
  CASUS2_V2_SEED,
  CASUS2_V2_SETTINGS,
  casus2ChainInput,
  casus2Field,
  casus2Files,
  casus2Manifest,
  casus2Report,
  casus2V2Declaration,
  casus2V2Facts,
} from '../src/lib/engine2/casus2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_HERKOMST = join(HERE, '..', 'test-fixtures', 'casus2_v2_herkomst.json');
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus2-v2-shards');
const ONLY = process.env.V2_ONLY ? Number(process.env.V2_ONLY) : null;
const SELF = fileURLToPath(import.meta.url);

const manifest = casus2Manifest();
const files = casus2Files(manifest);
const report = casus2Report(null, manifest, files);
const facts = casus2V2Facts(report, manifest, files);
const field = casus2Field(report);
const gridded = casus2ChainInput(manifest, files);
const JOBS = Math.max(1, Number(process.env.V2_JOBS ?? Math.min(field.field.candidates.length, cpus().length)));

console.log(`field: ${field.field.candidates.length} candidates (derived ${field.field.parameters.derivedSize}, budget ${field.field.parameters.chainBudget})`);
for (const a of field.field.axes) {
  console.log(`  ${a.pairLabel}: orders ${a.orders.join(',')} at ${a.positionsByOrder.map((p) => p.hz.join('/')).join(' | ')} Hz`);
}

type DoneData = {
  result: Chain3Result;
  measurements: ShortlistInput<Chain3Result>['measurements'];
  topology: ShortlistInput<Chain3Result>['topology'];
  gates: ShortlistInput<Chain3Result>['gates'];
  rejection: ShortlistInput<Chain3Result>['rejection'];
  dissipation: ShortlistInput<Chain3Result>['dissipation'];
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

function payloadFor(c: (typeof field.field.candidates)[number]): V2Chain3Payload {
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
      ...CASUS2_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS2_V2_GATES },
      budgets: { ...CASUS2_V2_BUDGETS },
      determinism: { seed: CASUS2_V2_SEED },
      targetCurve: CASUS2_TARGET_CURVE,
      judgeBandHz: CASUS2_V2_BAND_HZ,
      ...(CASUS2_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS2_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus2V2Declaration(c, gridded.safety),
  };
}

function runCandidate(c: (typeof field.field.candidates)[number], n: number): Shard {
  const payload = payloadFor(c);
  const t0 = Date.now();
  const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload });
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
    kruispunt_gesteld_hz: c.crossings.map((x) => x.hz),
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
    ontwerp: {
      xo_laag_hz: done.result.xoLow,
      xo_hoog_hz: done.result.xoHigh,
      bom_eur: done.result.bomTotalEur,
      z_ok: done.result.zOk,
      kruisvenster_oordeel: done.result.xoWindowOk,
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
const rows: ShortlistInput<Chain3Result>[] = [];
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
  rows.push(shard.row as unknown as ShortlistInput<Chain3Result>);
  outcomes.push(withRuntime(shard));
  const c = field.field.candidates[n - 1];
  perCandidate[c.label] = { provenance: c.provenance, crossings: c.crossings };
}
const lastPayload = payloadFor(field.field.candidates[count - 1]);

const stamp = stampRun(
  {
    determinism: resolveDeterminism({ seed: CASUS2_V2_SEED }),
    design: stableJson({ variants: field.field.candidates.map((c) => [c.label, c.crossings[0].hz]) }),
    measurements: stableJson({ grid: [CASUS2_V2_GRID[0], CASUS2_V2_GRID[CASUS2_V2_GRID.length - 1], CASUS2_V2_GRID.length] }),
    gates: stableJson(gateSettingsKey(lastPayload.v2.gates)),
    bounds: stableJson(budgetSettingsKey(lastPayload.v2.budgets)),
    tuning: stableJson(CASUS2_V2_SETTINGS),
    facts: stableJson(measurementFactsKey(facts)),
    choices: stableJson({ veld: candidateFieldKey(field.field), grijze_waarden: greyValues(lastPayload.candidate?.declaration.stated) }),
  },
  'completed',
);
const shortlist = buildShortlist(rows, stamp.fingerprint, { targetCurve: CASUS2_TARGET_CURVE });
console.log(`shortlist: ${shortlist.rows.length} of ${shortlist.consideredCount} considered`);

/* Prune the previous corpus' files from disk before writing: the shortlist can
 * shrink, and an unreferenced KAND-V2 file under a live name is the orphan hole
 * casus 1 documented (V32). Only the LIVE prefix, never a dated one. */
for (const f of (await import('node:fs')).readdirSync(CASUS2_DIR)) {
  if (/^KAND-V2-\d+\.adsfilter\.json$/.test(f)) rmSync(join(CASUS2_DIR, f));
}
const written: { name: string; label: string }[] = [];
shortlist.rows.forEach((row, i) => {
  const name = `KAND-V2-${i + 1}`;
  writeFileSync(join(CASUS2_DIR, `${name}.adsfilter.json`), serializeFilter({ name, parts: [...row.parts] }), 'utf-8');
  written.push({ name, label: row.label });
  console.log(`  wrote ${name}.adsfilter.json  ← ${row.label}`);
});

const commit = execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();
const decl = lastPayload.candidate!;
writeFileSync(
  OUT_HERKOMST,
  `${JSON.stringify(
    {
      _: 'E-3 — DOCUMENTATIE, geen acceptatiewaarde. Zie scripts/generate-casus2-v2-candidates.ts. Casus 1b: casus 1\'s mid en tweeter als tweeweg, door de v2-worker (v2ChainOne → runDesignChain onder de hook).',
      route: 'handleV2Request kind v2Chain3One → runThreeWayChain (ontwerpstap, synthese, tuner onder de hook) — dezelfde route waarop het casus-1-corpus wordt opgewekt.',
      gegenereerd_op_commit: commit,
      seed: CASUS2_V2_SEED,
      opgenomen_op: { platform: process.platform, arch: process.arch, node: process.version, v8: process.versions.v8, _: 'A5e.4 is byte-identiek PER (machine, runtime); elders regenereren levert een eigen, even geldig corpus (V46).' },
      run_vingerafdruk: stamp.fingerprint,
      grid: { van_hz: CASUS2_V2_GRID[0], tot_hz: CASUS2_V2_GRID[CASUS2_V2_GRID.length - 1], punten: CASUS2_V2_GRID.length },
      oordeelband_hz: CASUS2_V2_BAND_HZ,
      oordeelband_bron: { ...CASUS2_V2_BAND_SOURCE, _: 'de vloer is de hoogste van de geldigheidsvloer van de laagste weg (de woofer, 1/T = 250 Hz uit de gekozen poort) en haar kastafstemming; het raster begint op de geldigheidsvloer met de resolutie van het precedent.' },
      meetset: { set: 'synthetisch', bestanden: Object.fromEntries(manifest.entries.map((e) => [e.file, { driver: e.driver, kind: e.kind, hoek: e.angleDeg ?? null }])) },
      veld: {
        modus: 'exploration',
        bibliotheek: CASUS2_FIELD_ALIGNMENTS.map((a) => `${a.kind}${a.order}`),
        gestelde_orde: CASUS2_STATED_ORDER,
        per_as: field.field.axes.map((a) => ({ paar: a.pairLabel, orden: a.orders, posities_per_orde: a.positionsByOrder.map((p) => ({ orde: p.order, aantal: p.count, hz: p.hz })), venster: Object.fromEntries(Object.entries(a.window).map(([o, w]) => [o, { vloer_hz: w.floorHz, plafond_hz: w.ceilingHz, vloer_door: w.floorBy?.rule ?? null, plafond_door: w.ceilingBy?.rule ?? null }])) })),
        _: 'E-2: verkenning — budget EXPLORATION_CHAIN_BUDGET, posities centre-first (het venstercentrum en zijn buren), één uitlijning per overname (de gestelde orde 4, LR). Casus 2 vraagt of de route LEVERT op een onbekende set, niet of zij het beste ontwerp vindt.',
      },
      settings: CASUS2_V2_SETTINGS,
      meetopstelling: {
        _: 'Afgelezen van de laatste payload en niet overgeschreven (V27).',
        synthMode: CASUS2_V2_SETTINGS.synthMode,
        v2_poorten_gewapend: Object.keys(lastPayload.v2.gates ?? {}).sort(),
        v2_budgetten_gewapend: Object.keys(lastPayload.v2.budgets ?? {}).sort(),
        v2_budgetten_waarom: 'LEEG: de twee casus-1-budgetten (LF-opslingering, Q_es-vermenigvuldiging) zijn op de woofer afgeleid en niet overgenomen (golden_refs_casus2.json, gestelde_eisen.niet_overgenomen).',
        beschermingen_via_kandidaat: Object.keys(decl.declaration.stated).sort(),
        afwezig_verklaard: decl.declaration.absent.map((a) => a.key).sort(),
        gedelegeerd: decl.declaration.delegated.map((d) => d.key).sort(),
        ketenverklaring: decl.chainDeclaration,
        ketenverklaring_gelezen_door: 'withDeclaredChainChoices (V41): eqBands en leanTargetDb op Chain3Settings, plus lowestWayLevelWork/lowestWayCoilMaxHenry waar gesteld.',
        zoekmaat_gladding_oct: decl.declaration.stated.errorSmoothOct ?? null,
        vloer_zoekdoel_bron: decl.declaration.stated.zFloorBarrierSource ?? null,
        probe_raster: decl.declaration.stated.rSourceProbeSource ?? null,
        dissipatie_noemer: decl.declaration.stated.dissipationReferenceSource ?? null,
        fase_toelating: decl.declaration.stated.phaseAdmission ?? null,
        beschermingsregel: decl.declaration.stated.protectionRule ?? null,
        plafond_bron: decl.declaration.stated.seriesInductanceCeilingSource ?? null,
        spoel_dcr_model: decl.declaration.stated.coilDcrModel ? describeCoilDcrModel(decl.declaration.stated.coilDcrModel) : null,
        doelcurve: describeTargetCurve(CASUS2_TARGET_CURVE),
        oordeelband_hz: lastPayload.v2.judgeBandHz,
        seed: CASUS2_V2_SEED,
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
