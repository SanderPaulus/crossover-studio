/**
 * E-5c — DE ANATOMIE VAN DE 1934 s: waar gaan de evaluaties heen, en hoeveel
 * iteraties kost één snoei-hertune bij een KOUDE start?
 *
 * `npx vite-node scripts/measure-e5c-prune-anatomy.ts` — ÉÉN volle ketenrun op
 * casus 1 door `handleV2Request`, precies zoals de generator en zoals E-5b hem
 * draaide (dezelfde kandidaat, dezelfde seed, dezelfde eisen). `E5C_ONLY=<n>`
 * kiest een andere kandidaat. Schrijft `test-fixtures/casus1_e5c_anatomie.json`.
 *
 * HOE HIJ MEET ZONDER DE ENGINE AAN TE RAKEN — twee observatoren, allebei de
 * vorm die `measure-m1-diagnose-arms.ts` al draagt (de module-namespace van
 * vite-node is configureerbaar, en het script CONTROLEERT dat elke observator
 * gevuurd heeft in plaats van dat aan te nemen):
 *
 *  (1) op `runThreeWayChain`, om via `hooks.tuneOptionsFor` een `onStage` mee
 *      te geven. Dat is toegestaan omdat het niets kan verplaatsen: `onStage`
 *      staat in POLISH_KEYS met de reden dat hij `void` teruggeeft en door de
 *      engine nooit gelezen wordt — een eigenschap van zijn type en geen
 *      aanname (`choices.ts`). De keten geeft er zelf ook een mee; die van de
 *      hook wint, want `tuneOptionsFor` wordt als LAATSTE gespreid.
 *
 *  (2) op `nelderMead`, om per simplexaanroep de dimensie, het iteratieplafond,
 *      de stapgrootte, de GEBRUIKTE iteraties, de convergentie en de tijd vast
 *      te leggen — en, door de doelfunctie te omwikkelen, het exacte aantal
 *      evaluaties van díé aanroep. Elke aanroep krijgt het stage-etiket dat op
 *      dat moment geldt; aanroepen VÓÓR het eerste etiket zijn per constructie
 *      de ontwerp- en synthesestap, die vóór `optimizeNetworkValues` draait.
 *
 * WAT HIJ NIET DOET: hij stelt niets, wijzigt niets en oordeelt niets. Hij is
 * het bewijsmateriaal onder casusboek E-5c.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import * as chainModule from '../src/lib/threeWayChain.ts';
import * as optimizeModule from '../src/lib/optimize.ts';
import type { Chain3Input, Chain3Result, ChainEngineHooks } from '../src/lib/threeWayChain.ts';
import type { NetOptimizeOptions } from '../src/lib/netOptimizer.ts';
import type { GateVerdict } from '../src/lib/engine2/optimizer/gates.ts';
import type { ChoiceDeclaration } from '../src/lib/engine2/optimizer/choices.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  HERE,
  '..',
  'test-fixtures',
  process.env.E5C_OUT ?? 'casus1_e5c_anatomie.json',
);

/* ------------------------------------------------------------------ *
 * De twee observatoren
 * ------------------------------------------------------------------ */

/** Eén simplexaanroep, zoals hij werkelijk liep. */
interface SimplexCall {
  /** Het stage-etiket dat gold toen de aanroep begon; null = vóór de tuner. */
  stage: string | null;
  dims: number;
  maxIterations: number;
  step: number;
  iterations: number;
  converged: boolean;
  evaluations: number;
  ms: number;
  /** De doelfunctie IN het startpunt — nelderMead evalueert x0 als eerste. */
  fxStart: number;
  /** Wat de aanroep opleverde. */
  fxFinal: number;
  /** Wat de aanroep VERBETERDE, als fractie van het startpunt. De grootheid
   *  die zegt of een hertune vanaf een geconvergeerd punt nog werk doet. */
  gainFraction: number;
  /** Bij de hoeveelste EVALUATIE kwam het lopende minimum voor het eerst
   *  binnen 5 % / 1 % / 0,1 % van wat de aanroep uiteindelijk vond. Dit is de
   *  grootheid waaruit een iteratieplafond mag volgen: niet "wanneer
   *  convergeert de simplex" maar "wanneer heeft hij wat hij komt halen". */
  evalsWithin5pct: number;
  evalsWithin1pct: number;
  evalsWithin0p1pct: number;
}

/** Eén stage-overgang, met de evaluatieteller van de engine zelf. */
interface StageMark {
  label: string;
  engineEvaluations: number;
  msFromStart: number;
}

const simplexCalls: SimplexCall[] = [];
const stageMarks: StageMark[] = [];
let currentStage: string | null = null;
let runStart = 0;
let chainObserverFired = false;
let simplexObserverFired = false;

function observeSimplex(): void {
  const original = optimizeModule.nelderMead;
  const wrapped = (
    f: (x: readonly number[]) => number,
    x0: readonly number[],
    opts: optimizeModule.NelderMeadOptions = {},
  ): optimizeModule.NelderMeadResult => {
    simplexObserverFired = true;
    const stage = currentStage;
    let evaluations = 0;
    let fxStart = Number.NaN;
    let best = Number.POSITIVE_INFINITY;
    /* Het lopende minimum met de evaluatie waarop het bereikt werd. Na afloop
     * weten we `fxFinal` en lezen we terug wanneer het binnen x % daarvan
     * kwam — vooruit kan dat niet, want de drempel hangt aan de uitkomst. */
    const trail: { at: number; fx: number }[] = [];
    const counted = (x: readonly number[]): number => {
      evaluations++;
      const v = f(x);
      if (evaluations === 1) fxStart = v;
      if (v < best) {
        best = v;
        trail.push({ at: evaluations, fx: v });
      }
      return v;
    };
    const t0 = Date.now();
    const r = original(counted, x0, opts);
    const ms = Date.now() - t0;
    const firstWithin = (eps: number): number => {
      const scale = Math.abs(r.fx) > 0 ? Math.abs(r.fx) : 1;
      for (const t of trail) if (t.fx - r.fx <= eps * scale) return t.at;
      return evaluations;
    };
    simplexCalls.push({
      stage,
      dims: x0.length,
      maxIterations: opts.maxIterations ?? 800,
      step: opts.step ?? 0.15,
      iterations: r.iterations,
      converged: r.converged,
      evaluations,
      ms,
      fxStart: Number(fxStart.toFixed(9)),
      fxFinal: Number(r.fx.toFixed(9)),
      gainFraction: Number.isFinite(fxStart) && fxStart > 0 ? Number(((fxStart - r.fx) / fxStart).toFixed(6)) : 0,
      evalsWithin5pct: firstWithin(0.05),
      evalsWithin1pct: firstWithin(0.01),
      evalsWithin0p1pct: firstWithin(0.001),
    });
    return r;
  };
  const d = Object.getOwnPropertyDescriptor(optimizeModule, 'nelderMead');
  if (!d || !d.configurable) throw new Error('de simplex-export is niet configureerbaar; de observator kan niet gelegd worden');
  Object.defineProperty(optimizeModule, 'nelderMead', { configurable: true, enumerable: true, get: () => wrapped });
}

function observeChain(): void {
  const original = chainModule.runThreeWayChain;
  const wrapped = (
    input: Chain3Input,
    onProgress?: Parameters<typeof chainModule.runThreeWayChain>[1],
    hooks?: ChainEngineHooks,
  ): Chain3Result => {
    chainObserverFired = true;
    const onStage = (label: string, ev?: number): void => {
      currentStage = label;
      stageMarks.push({ label, engineEvaluations: ev ?? 0, msFromStart: Date.now() - runStart });
    };
    const seen: ChainEngineHooks = {
      ...hooks,
      tuneOptionsFor: (seedParts: readonly VxpPart[]): Partial<NetOptimizeOptions> => ({
        ...(hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seedParts) : {}),
        onStage,
      }),
    };
    return original(input, onProgress, seen);
  };
  const d = Object.getOwnPropertyDescriptor(chainModule, 'runThreeWayChain');
  if (!d || !d.configurable) throw new Error('de keten-export is niet configureerbaar; de observator kan niet gelegd worden');
  Object.defineProperty(chainModule, 'runThreeWayChain', { configurable: true, enumerable: true, get: () => wrapped });
}

/* ------------------------------------------------------------------ *
 * De run — dezelfde payload als E-5b
 * ------------------------------------------------------------------ */

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
const field = casus1Field(report);
const gridded = casus1ChainInput(manifest, files, golden);

const ONLY = Math.max(0, Number(process.env.E5C_ONLY ?? 0));
const cand = field.field.candidates[ONLY];
if (!cand) throw new Error(`E-5c: geen kandidaat ${ONLY} in een veld van ${field.field.candidates.length}`);

type Arm = 'search+recompute' | 'search+reuse' | 'capped+reuse';

function payload(arm: Arm): V2Chain3Payload {
  const declaration = casus1V2Declaration(cand, gridded.safety);
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: cand.crossings[0].hz,
    xoHigh: cand.crossings[1].hz,
    xoLowRange: cand.crossings[0].cageHz,
    xoHighRange: cand.crossings[1].cageHz,
    label: cand.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
      structureHigh: { kind: cand.crossings[1].alignment.kind, order: cand.crossings[1].alignment.order },
      xoFloorPairs: cand.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    /* THE TWO ARMS DIFFER IN TWO KEYS AND NOTHING ELSE. Both are stated
     * explicitly, so the historic arm is a run someone can ASK for rather than
     * a build to check out (the V48 rule) — and so neither arm depends on what
     * the declaration happens to default to today. */
    candidate: {
      ...declaration,
      declaration: {
        ...declaration.declaration,
        stated: {
          ...declaration.declaration.stated,
          structureRetune: arm === 'capped+reuse' ? 'capped' : 'search',
          repeatedTune: arm === 'search+recompute' ? 'recompute' : 'reuse',
        },
      } as ChoiceDeclaration,
    },
  };
}

console.log(`E-5c — de anatomie van één casus-1-ketenrun, op ${cand.label}`);
console.log(`  raster ${gridded.grid.length} punten vanaf ${gridded.grid[0].toFixed(1)} Hz · band ${CASUS1_V2_BAND_HZ[0].toFixed(1)}–${CASUS1_V2_BAND_HZ[1]} Hz`);
console.log(`  stopdoel rimpel ≤ ${CASUS1_V2_SETTINGS.targets.rippleDb} dB, fase ≤ ${CASUS1_V2_SETTINGS.targets.phaseDeg}°`);

observeSimplex();
observeChain();

const ARMS: Arm[] = process.env.E5C_ARM
  ? [process.env.E5C_ARM as Arm]
  : ['search+recompute', 'search+reuse'];

interface ArmOut {
  arm: Arm;
  seconden: number;
  evaluaties_engine: number;
  vrije_waarden: number;
  rimpel_db: number;
  fase_graden: number;
  min_z_ohm: number | null;
  verwijderd: string[];
  toegevoegd: string[];
  geleverde_netlist_digest: string | null;
  verworpen: { regels: string[]; reden: string } | null;
  onderdelen: number;
  kostennoot: string | null;
  simplex_totaal: { aanroepen: number; evaluaties: number; seconden: number; aandeel_van_de_wandklok: number };
  per_fase: PhaseRow[];
  per_simplexaanroep: Quantiles[];
  stage_overgangen: StageMark[];
  simplexaanroepen: SimplexCall[];
}

interface PhaseRow {
  fase: string;
  simplexaanroepen: number;
  evaluaties: number;
  seconden: number;
  iteraties_totaal: number;
  aanroepen_op_het_plafond: number;
}
interface Quantiles {
  fase: string;
  n: number;
  plafond: number;
  op_het_plafond: number;
  iteraties: Spread;
  evaluaties: Spread;
  evaluaties_tot_binnen_1pct: Spread99;
  evaluaties_tot_binnen_0p1pct: Spread99;
  winstfractie: { min: number; p50: number; p90: number; max: number };
}
type Spread = { min: number; p50: number; p90: number; p95: number; max: number };
type Spread99 = Spread & { p99: number };

const q = (xs: number[], pr: number): number => {
  if (xs.length === 0) return 0;
  const i = Math.min(xs.length - 1, Math.max(0, Math.ceil(pr * xs.length) - 1));
  return xs[i];
};
const spread = (xs: number[]): Spread => {
  const t = [...xs].sort((a, b) => a - b);
  return { min: q(t, 0), p50: q(t, 0.5), p90: q(t, 0.9), p95: q(t, 0.95), max: t[t.length - 1] ?? 0 };
};
const spread99 = (xs: number[]): Spread99 => {
  const t = [...xs].sort((a, b) => a - b);
  return { ...spread(xs), p99: q(t, 0.99) };
};
const PHASE_OF_STAGE = (label: string | null): string => (label === null ? 'ontwerp + synthese' : label);
const TUNING_PHASES = ['prune sweep', 'escalation', 'drift check', 'part audit (seed)', 'value tune'];

function runArm(arm: Arm): ArmOut {
  simplexCalls.length = 0;
  stageMarks.length = 0;
  currentStage = null;
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload: payload(arm) });
  const collected: { result: Chain3Result; gates: GateVerdict[] }[] = [];
  runStart = Date.now();
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as (typeof collected)[number]);
  });
  const seconds = (Date.now() - runStart) / 1000;
  const done = collected[0];
  if (!done) throw new Error(`E-5c: arm ${arm} leverde niets`);
  if (!chainObserverFired) throw new Error('E-5c: de keten-observator heeft niet gevuurd');
  if (!simplexObserverFired) throw new Error('E-5c: de simplex-observator heeft niet gevuurd');
  const net = done.result.net;

  const byPhase = new Map<string, PhaseRow>();
  for (const c of simplexCalls) {
    const fase = PHASE_OF_STAGE(c.stage);
    const row = byPhase.get(fase) ?? {
      fase, simplexaanroepen: 0, evaluaties: 0, seconden: 0, iteraties_totaal: 0, aanroepen_op_het_plafond: 0,
    };
    row.simplexaanroepen++;
    row.evaluaties += c.evaluations;
    row.seconden += c.ms / 1000;
    row.iteraties_totaal += c.iterations;
    if (!c.converged) row.aanroepen_op_het_plafond++;
    byPhase.set(fase, row);
  }
  const phases = [...byPhase.values()].sort((a, b) => b.seconden - a.seconden)
    .map((r) => ({ ...r, seconden: Number(r.seconden.toFixed(1)) }));

  const quantiles: Quantiles[] = [];
  for (const fase of TUNING_PHASES) {
    const calls = simplexCalls.filter((c) => PHASE_OF_STAGE(c.stage) === fase);
    if (calls.length === 0) continue;
    const g = spread(calls.map((c) => c.gainFraction));
    quantiles.push({
      fase,
      n: calls.length,
      plafond: Math.max(...calls.map((c) => c.maxIterations)),
      op_het_plafond: calls.filter((c) => !c.converged).length,
      iteraties: spread(calls.map((c) => c.iterations)),
      evaluaties: spread(calls.map((c) => c.evaluations)),
      evaluaties_tot_binnen_1pct: spread99(calls.map((c) => c.evalsWithin1pct)),
      evaluaties_tot_binnen_0p1pct: spread99(calls.map((c) => c.evalsWithin0p1pct)),
      winstfractie: { min: g.min, p50: g.p50, p90: g.p90, max: g.max },
    });
  }

  /* DE GELEVERDE NETLIST ALS ÉÉN GETAL — en `null` wanneer er geen is.
   *
   * Een VERWORPEN kandidaat draagt er per constructie geen: `runCandidate`
   * blankt de onderdelen voordat het resultaat de worker verlaat (V31), en
   * `net.after` overleeft die blanking wél — dus de rimpel en de fase hieronder
   * beschrijven dan het WEGGEGOOIDE netwerk. Een digest van een lege lijst zou
   * in twee armen hetzelfde getal opleveren en als bewijs van gelijkheid lezen
   * terwijl hij niets vergelijkt; dat is precies de plausibel-foute waarde die
   * A3h verbiedt. Daarom expliciet null, met de weigering ernaast. */
  const deliveredParts = done.result.parts ?? [];
  const digest =
    deliveredParts.length > 0
      ? createHash('sha256')
          .update(JSON.stringify(deliveredParts.map((qq) => [
            qq.partId ?? qq.type, qq.open ?? false, qq.shorted ?? false, qq.params.map((par) => [par.name, par.value]),
          ])))
          .digest('hex').slice(0, 12)
      : null;
  const refusal = (done.result.net as { refusal?: { kinds?: string[]; reason?: string } }).refusal ?? null;

  const simplexSeconds = simplexCalls.reduce((a, c) => a + c.ms, 0) / 1000;
  const simplexEvaluations = simplexCalls.reduce((a, c) => a + c.evaluations, 0);

  console.log(`\n  ARM ${arm} — KLAAR in ${seconds.toFixed(0)} s · ${net.evaluations} evaluaties · ${net.tuned} vrije waarden`);
  console.log(`    rimpel ${net.after.rippleDb.toFixed(3)} dB · fase ${net.after.phaseDeg.toFixed(1)}° · min |Z| ${net.after.zMinOhm?.toFixed(3) ?? '—'} Ω`);
  console.log(`    verwijderd: ${(net.removed ?? []).join(', ') || '—'} · toegevoegd: ${(net.added ?? []).join(', ') || '—'}`);
  console.log(
    `    geleverde netlist ${digest ?? 'GEEN — deze kandidaat is VERWORPEN' + (refusal ? ` op ${(refusal.kinds ?? []).join(', ')}` : '')}` +
      ` (${deliveredParts.length} onderdelen)`,
  );
  console.log(`    kostennoot: ${net.structureRetuneNote ?? '(geen)'}`);
  console.log(`    simplex: ${simplexCalls.length} aanroepen, ${simplexEvaluations} evaluaties, ${simplexSeconds.toFixed(0)} s (${((simplexSeconds / seconds) * 100).toFixed(0)} % van de wandklok)`);
  console.log('    FASE                          aanroepen   evaluaties        s     % run   op plafond');
  for (const ph of phases) {
    console.log(
      `    ${ph.fase.padEnd(28)} ${String(ph.simplexaanroepen).padStart(9)} ${String(ph.evaluaties).padStart(12)} ` +
        `${ph.seconden.toFixed(0).padStart(8)} ${((ph.seconden / seconds) * 100).toFixed(1).padStart(9)} ` +
        `${String(ph.aanroepen_op_het_plafond).padStart(12)}`,
    );
  }

  return {
    arm,
    seconden: Number(seconds.toFixed(1)),
    evaluaties_engine: net.evaluations,
    vrije_waarden: net.tuned,
    rimpel_db: Number(net.after.rippleDb.toFixed(3)),
    fase_graden: Number(net.after.phaseDeg.toFixed(1)),
    min_z_ohm: net.after.zMinOhm === null || net.after.zMinOhm === undefined ? null : Number(net.after.zMinOhm.toFixed(3)),
    verwijderd: [...(net.removed ?? [])],
    toegevoegd: [...(net.added ?? [])],
    geleverde_netlist_digest: digest,
    verworpen: refusal ? { regels: [...(refusal.kinds ?? [])], reden: refusal.reason ?? '' } : null,
    onderdelen: deliveredParts.length,
    kostennoot: net.structureRetuneNote ?? null,
    simplex_totaal: {
      aanroepen: simplexCalls.length,
      evaluaties: simplexEvaluations,
      seconden: Number(simplexSeconds.toFixed(1)),
      aandeel_van_de_wandklok: Number(((simplexSeconds / seconds) * 100).toFixed(1)),
    },
    per_fase: phases,
    per_simplexaanroep: quantiles,
    stage_overgangen: [...stageMarks],
    simplexaanroepen: simplexCalls.map((c) => ({ ...c })),
  };
}

const armRows: ArmOut[] = [];
for (const a of ARMS) {
  console.log(`\n  draait arm ${a} …`);
  armRows.push(runArm(a));
}
if (armRows.length === 2) {
  const [a, b] = armRows;
  console.log(`\n  VOOR/NA — ${a.arm} → ${b.arm}`);
  console.log(`    wandklok      ${a.seconden.toFixed(0)} s → ${b.seconden.toFixed(0)} s (${(((b.seconden - a.seconden) / a.seconden) * 100).toFixed(1)} %)`);
  console.log(`    evaluaties    ${a.evaluaties_engine} → ${b.evaluaties_engine} (${(((b.evaluaties_engine - a.evaluaties_engine) / a.evaluaties_engine) * 100).toFixed(1)} %)`);
  console.log(
    `    netlist       ${a.geleverde_netlist_digest ?? 'geen'} → ${b.geleverde_netlist_digest ?? 'geen'}  ` +
      (a.geleverde_netlist_digest === null && b.geleverde_netlist_digest === null
        ? 'BEIDE VERWORPEN — vergelijk de rimpel/fase van de geweigerde tune hieronder'
        : a.geleverde_netlist_digest === b.geleverde_netlist_digest
          ? 'IDENTIEK'
          : 'VERSCHILT'),
  );
  console.log(`    gesnoeid      [${a.verwijderd}] → [${b.verwijderd}]`);
  console.log(`    toegevoegd    [${a.toegevoegd}] → [${b.toegevoegd}]`);
  console.log(`    rimpel/fase   ${a.rimpel_db}/${a.fase_graden} → ${b.rimpel_db}/${b.fase_graden}`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _wat:
        'E-5c — waar de wandkloktijd van één casus-1-ketenrun heen gaat, per fase en per simplexaanroep, ' +
        'in twee armen die in precies twee sleutels verschillen. Gemeten met twee observatoren ' +
        '(keten + simplex) en zonder één regel engine-wijziging.',
      kandidaat: cand.label,
      oordeelband_hz: CASUS1_V2_BAND_HZ,
      raster_punten: gridded.grid.length,
      stopdoel: CASUS1_V2_SETTINGS.targets,
      armen: armRows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nwrote ${OUT}`);
