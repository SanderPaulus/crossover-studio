/**
 * E-6 fase 0 — DE PRIORITY-SCHUIF: WIE LEEST WELK GETAL, EN WAT DE SPLITSING KOST.
 *
 * Twee delen, geen enkele engine-wijziging.
 *
 *   E6_PART=trace (default) — SECONDEN, geen tune. Per route (drieweg, tweeweg,
 *     hybride, ⚙ tweeweg, ⚙ drieweg, ✂ tweeweg, ✂ drieweg) en per schuifwaarde
 *     (0,25 / 0,5 / 0,75) wat de ONTWERPSTAP (`designThreeWay` /
 *     `optimizeVirtualFilters`), de SYNTHESE (`synthesize`) en de TUNER
 *     (`optimizeNetworkValues`, of de `tuneOpts` die `minimizeNetwork` krijgt)
 *     WERKELIJK binnenkrijgen. Observatoren op de module-namespaces (de M-1/U-9-
 *     techniek: vite-node-namespaces zijn configureerbaar); de tuner-observator
 *     GOOIT, dus er wordt niets getuned. De payload volgt de app: de schuif staat
 *     in `settings.phasePriority` (App.tsx `phasePriority / 100`) en de
 *     ketenverklaring wordt ZONDER `phasePriority` gebouwd
 *     (`declareCandidateChainChoices({ stated: { eqBands } })`, App.tsx), dus zij
 *     verklaart `DEFAULT_PHASE_PRIORITY`.
 *
 *   E6_PART=arms — KETENRUNS. Drie armen met precies één factor verschillend:
 *       (i)   split: settings = s, verklaring = 0,5 (wat de app vandaag doet)
 *       (ii)  alle drie op s: settings = s, verklaring = s
 *       (iii) alle drie op 0,5
 *     op de kleine parsers-fixture (drieweg, budget 80, zoals chainChoices.test)
 *     en op casus 1b's geleverde kandidaat 1947,9 Hz, bij s = 0,25 en 0,75.
 *     (iii) is voor beide s hetzelfde, dus vijf runs per fixture. Elk run is een
 *     kindproces (`E6_ONLY=<fixture>:<arm>:<s>`), `E6_JOBS` tegelijk; shards in
 *     `test-fixtures/.e6-shards/`, `E6_REDO=1` overschrijft.
 *
 *   npx vite-node scripts/measure-e6-phase-priority.ts
 *   E6_PART=arms E6_JOBS=5 npx vite-node scripts/measure-e6-phase-priority.ts
 *
 * Schrijft `test-fixtures/e6_phase_priority.json` (beide delen, het tweede alleen
 * als het gedraaid is).
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as designMod from '../src/lib/threeWayDesign.ts';
import * as vfMod from '../src/lib/vfOptimizer.ts';
import * as synthMod from '../src/lib/synthesis.ts';
import * as netMod from '../src/lib/netOptimizer.ts';
import * as minMod from '../src/lib/minimize.ts';
import { logspace, resample, type GriddedResponse } from '../src/lib/dsp.ts';
import { cplx, fromPolar } from '../src/lib/complex.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseZma } from '../src/lib/parsers/zma.ts';
import { AUTO_STRUCTS } from '../src/lib/threeWayDesign.ts';
import { filterTemplate } from '../src/lib/filterTemplates.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { coilDcrInventory } from '../src/lib/coilDcr.ts';
import { stableJson } from '../src/lib/engine2/optimizer/determinism.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from '../src/lib/engine2/optimizer/candidateDeclaration.ts';
import { chainDeclarationKey, type ChainChoiceDeclaration } from '../src/lib/engine2/optimizer/chainChoices.ts';
import { buildCandidateField } from '../src/lib/engine2/predesign/candidateField.ts';
import type { XoWindowInput } from '../src/lib/engine2/predesign/xoWindow.ts';
import { handleV2Request, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import {
  CASUS1B_CONTINUOUS_POWER_W,
  CASUS1B_COIL_DCR,
  CASUS1B_COIL_FAMILY_BY_DRIVER,
  CASUS1B_DIR,
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_SEED,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
  loadGolden1b,
} from '../src/lib/engine2/casus1b.fixture.ts';
import {
  CASUS1H_ACTIVE,
  CASUS1H_CONTINUOUS_POWER_W,
  CASUS1H_TARGET_CURVE,
  CASUS1H_V2_BAND_HZ,
  CASUS1H_V2_BUDGETS,
  CASUS1H_V2_GATES,
  CASUS1H_V2_SEED,
  casus1hActiveAt,
  casus1hChainInput,
  casus1hChainInputFor,
  casus1hField,
  casus1hFiles,
  casus1hManifest,
  casus1hSeed,
  casus1hV2Declaration,
  casus1hV2Facts,
} from '../src/lib/engine2/casus1h.fixture.ts';
import { casus1CoilCatalogPath, loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import { bomOf, loadCoilCatalog } from './bomColumn.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'test-fixtures', 'e6_phase_priority.json');
const SHARDS = join(ROOT, 'test-fixtures', '.e6-shards');
const SELF = fileURLToPath(import.meta.url);

/** De drie schuifwaarden van de opdracht; 0,5 is DEFAULT_PHASE_PRIORITY. */
const SLIDER = [0.25, 0.5, 0.75] as const;
const DEFAULT_PP = netMod.DEFAULT_PHASE_PRIORITY;

/* ------------------------------------------------------------------ *
 * De observatoren
 * ------------------------------------------------------------------ */

const SENTINEL = 'E6-OBSERVER-STOP';
type Seen = { design: number[]; synth: number[]; tuner: number[] };
let seen: Seen = { design: [], synth: [], tuner: [] };
let observing = false;

function patch<T extends object>(mod: T, name: string, wrap: (orig: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) {
  const d = Object.getOwnPropertyDescriptor(mod, name);
  if (!d || !d.configurable) throw new Error(`export ${name} is niet configureerbaar`);
  const orig = (mod as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
  const fn = wrap(orig);
  Object.defineProperty(mod, name, { configurable: true, enumerable: true, get: () => fn });
}
function installObservers(): void {
  patch(designMod, 'designThreeWay', (o) => (input: unknown) => {
    if (observing) seen.design.push((input as { phasePriority: number }).phasePriority);
    return o(input);
  });
  patch(vfMod, 'optimizeVirtualFilters', (o) => (...a: unknown[]) => {
    const opts = a.find((x) => x && typeof x === 'object' && 'phasePriority' in (x as object)) as { phasePriority?: number } | undefined;
    if (observing) seen.design.push(opts?.phasePriority ?? NaN);
    return o(...a);
  });
  patch(synthMod, 'synthesize', (o) => (...a: unknown[]) => {
    const opts = a[a.length - 1] as { phasePriority?: number } | undefined;
    if (observing) seen.synth.push(opts?.phasePriority ?? 0.5 /* synthesize's own default */);
    return o(...a);
  });
  patch(netMod, 'optimizeNetworkValues', (o) => (...a: unknown[]) => {
    if (observing) {
      seen.tuner.push((a[6] as { phasePriority?: number }).phasePriority ?? DEFAULT_PP);
      throw new Error(SENTINEL);
    }
    return o(...a);
  });
  patch(minMod, 'minimizeNetwork', (o) => (...a: unknown[]) => {
    if (observing) {
      const opts = a[6] as { tuneOpts?: { phasePriority?: number } };
      seen.tuner.push(opts.tuneOpts?.phasePriority ?? DEFAULT_PP);
      throw new Error(SENTINEL);
    }
    return o(...a);
  });
}

function observe(kind: string, payload: unknown): Seen {
  seen = { design: [], synth: [], tuner: [] };
  observing = true;
  let err = '';
  try {
    handleV2Request(structuredClone({ id: 1, kind, payload }) as never, (m: { kind: string; message?: string }) => {
      if (m.kind === 'error') err = String(m.message ?? '');
    });
  } catch (e) {
    err = String((e as Error).message);
  } finally {
    observing = false;
  }
  if (seen.tuner.length === 0) throw new Error(`observator vuurde niet (${kind}): ${err}`);
  return seen;
}

/* ------------------------------------------------------------------ *
 * De fixtures
 * ------------------------------------------------------------------ */

/** De app-vorm van de ketenverklaring: ZONDER phasePriority (App.tsx). */
const appChainDecl = (extra: Parameters<typeof declareCandidateChainChoices>[0] = { stated: {} }) =>
  declareCandidateChainChoices(extra);
/** Arm (ii): dezelfde verklaring, met de schuif erin. */
const withPP = (d: ChainChoiceDeclaration, pp: number): ChainChoiceDeclaration => {
  const c = structuredClone(d);
  (c.stated as { phasePriority?: number }).phasePriority = pp;
  return c;
};

// --- parsers-fixture (drieweg), zoals chainChoices.test.ts ---
const PFIX = join(ROOT, 'src', 'lib', 'parsers', 'fixtures');
const PGRID = logspace(210, 19000, 64);
const pload = (n: string) => readFileSync(join(PFIX, n), 'utf-8');
const pFrd = (raw: string): GriddedResponse => {
  const f = parseFrd(raw);
  return resample(f.freq, f.spl, f.phase, PGRID);
};
const pZ = (raw: string) => {
  const z = parseZma(raw);
  const g = resample(z.freq, z.magnitude, z.phase, PGRID, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const PWIN: XoWindowInput[] = [
  { lower: 'woofer', upper: 'mid', order: 4, validityFloorHz: 400, validityFloorSource: 'E-6', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 800, lowerMinus6AngleDeg: 30, spacingMm: null },
  { lower: 'mid', upper: 'tweeter', order: 4, validityFloorHz: 2000, validityFloorSource: 'E-6', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 4000, lowerMinus6AngleDeg: 30, spacingMm: null },
];
const P_SETTINGS = {
  synthMode: 'filter' as const,
  band: [250, 18000] as [number, number],
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  powerMetric: 'smooth' as const,
  catalogSnap: false,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
};
const pCand = buildCandidateField({ windowInputs: PWIN, perPair: [{ statedOrder: 4 }, { statedOrder: 4 }], alignments: AUTO_STRUCTS, minSpacingOctaves: 1 }).field.candidates[0];
function parsersPayload(settingsPP: number, chainDecl: ChainChoiceDeclaration) {
  const c = pCand;
  const input: Chain3Input = {
    grid: [...PGRID],
    w: pFrd(pload('mid_hor0_mettape.txt')),
    m: pFrd(pload('mid_hor0_mettape.txt')),
    t: pFrd(pload('tweet_hor0_mettape.txt')),
    driverZ: { woofer: pZ(pload('mid_Backwavecone_sheep75gram.ZMA')), mid: pZ(pload('mid_Backwavecone_sheep75gram.ZMA')), tweeter: pZ(pload('tweeter.ZMA')) },
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...P_SETTINGS,
      phasePriority: settingsPP,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: declareCandidateChoices({
        cages: c.crossings.map((x) => x.cageHz),
        windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
        multiWay: true,
        stated: { band: P_SETTINGS.band, staged: P_SETTINGS.targets, ampTarget: P_SETTINGS.ampTarget, powerMetric: P_SETTINGS.powerMetric, phaseMetric: P_SETTINGS.phaseMetric, catalogSnap: false, breakupGuard: true, zFloorStrict: true },
      }),
      chainDeclaration: chainDecl,
      provenance: c.provenance,
      orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
    },
  };
}

// --- casus 1b (tweeweg) ---
const g1b = loadGolden1b();
const m1b = casus1bManifest(g1b);
const f1b = casus1bFiles(m1b);
const r1b = casus1bReport(null, m1b, f1b, g1b);
const field1b = casus1bField(r1b);
const gridded1b = casus1bChainInput(m1b, f1b);
const C1B_LABEL = 'mid→tweeter 1947.9 LR4';
const c1b = field1b.field.candidates.find((c) => c.label.startsWith(C1B_LABEL));
if (!c1b) throw new Error(`casus 1b: no candidate ${C1B_LABEL}; field has ${field1b.field.candidates.map((c) => c.label).join(' | ')}`);
const v2_1b = {
  ...casus1bV2Facts(r1b, m1b, f1b),
  gates: { ...CASUS1B_V2_GATES },
  budgets: { ...CASUS1B_V2_BUDGETS },
  determinism: { seed: CASUS1B_V2_SEED },
  targetCurve: CASUS1B_TARGET_CURVE,
  judgeBandHz: CASUS1B_V2_BAND_HZ,
  ...(CASUS1B_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1B_CONTINUOUS_POWER_W } : {}),
};
function casus1bPayload(settingsPP: number, pp: 'split' | 'all') {
  const base = casus1bV2Declaration(c1b!, gridded1b.safety);
  const input = casus1bChainInputFor(c1b!, gridded1b, casus1bSeed());
  input.settings = { ...input.settings, phasePriority: settingsPP };
  return {
    input,
    label: c1b!.label,
    v2: v2_1b,
    candidate: { ...base, chainDeclaration: pp === 'all' ? withPP(base.chainDeclaration, settingsPP) : base.chainDeclaration },
  };
}

// --- casus 1h (hybride, gemeten vorm) ---
function casus1hPayload(settingsPP: number) {
  const m = casus1hManifest();
  const f = casus1hFiles(m);
  const g = casus1hChainInput(m, f);
  const hz = CASUS1H_ACTIVE.positionsHz[0];
  const active = casus1hActiveAt(hz, m, f);
  const c = casus1hField(active.report).field.candidates[0];
  const input = casus1hChainInputFor(c, g, casus1hSeed(), active);
  input.settings = { ...input.settings, phasePriority: settingsPP };
  return {
    input,
    label: c.label,
    v2: {
      ...casus1hV2Facts(active.report, m, f),
      gates: { ...CASUS1H_V2_GATES },
      budgets: { ...CASUS1H_V2_BUDGETS },
      determinism: { seed: CASUS1H_V2_SEED },
      targetCurve: CASUS1H_TARGET_CURVE,
      judgeBandHz: CASUS1H_V2_BAND_HZ,
      ...(CASUS1H_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1H_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1hV2Declaration(c, active, g.safety),
  };
}

// --- ⚙/✂ tweeweg: de getekende casus-1b-netlist ---
const drawn1b: VxpPart[] = deserializeFilter(readFileSync(join(CASUS1B_DIR, 'KAND-V2-1.adsfilter.json'), 'utf-8')).parts;
function tune2Payload(settingsPP: number, minimize: boolean) {
  const p = casus1bPayload(settingsPP, 'split');
  return { input: p.input, parts: drawn1b, label: 'drawn 2-way', v2: p.v2, candidate: p.candidate, ...(minimize ? { minimize: { targets: { rippleDb: 2.5, phaseDeg: 15 } } } : {}) };
}
// --- ⚙/✂ drieweg: drawnTune3.test.ts-vorm ---
function tune3Payload(settingsPP: number, minimize: boolean) {
  const grid = logspace(60, 16000, 72);
  const flat: GriddedResponse = { freq: [...grid], spl: grid.map(() => 88), phaseDeg: grid.map(() => 0) };
  const z8 = grid.map(() => cplx(8, 0));
  const BAND: [number, number] = [80, 14000];
  return {
    input: {
      grid: [...grid], w: flat, m: flat, t: flat,
      driverZ: { woofer: z8, mid: z8, tweeter: z8 },
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      xoLow: 0, xoHigh: 0, label: 'drawn 3-way',
      settings: { phasePriority: settingsPP, synthMode: 'acoustic', band: BAND, targets: { rippleDb: 2.5, phaseDeg: 15 }, xoFloorPairs: [null, null] },
    },
    parts: filterTemplate({ order: 2, wayCount: 3, models: [] }).parts,
    label: 'drawn 3-way',
    v2: {
      gates: {},
      impedanceByModel: Object.fromEntries(['woofer', 'mid', 'tweeter'].map((mm) => [mm, { grid: [...grid], magnitude: grid.map(() => 8), phaseDeg: grid.map(() => 0), validHz: [grid[0], grid[grid.length - 1]] }])),
      budgets: {},
      determinism: { seed: 7, budgetEvaluations: 400 },
      judgeBandHz: BAND,
    },
    candidate: {
      declaration: declareCandidateChoices({ cages: [null, null], windowFloorsHz: [null, null], multiWay: true, rippleStopFromLowestCrossing: true, stated: { band: BAND, staged: { rippleDb: 2.5, phaseDeg: 15 }, zFloorStrict: true } }),
      chainDeclaration: appChainDecl(),
      provenance: 'E-6 — a drawn three-way network',
    },
    ...(minimize ? { minimize: { targets: { rippleDb: 2.5, phaseDeg: 15 } } } : {}),
  };
}

const ROUTES: { route: string; kind: string; build: (s: number) => unknown }[] = [
  { route: 'drieweg scan (parsers-fixture)', kind: 'v2Chain3One', build: (s) => parsersPayload(s, appChainDecl()) },
  { route: 'tweeweg scan (casus 1b)', kind: 'v2ChainOne', build: (s) => casus1bPayload(s, 'split') },
  { route: 'hybride scan (casus 1h, gemeten vorm)', kind: 'v2ChainOne', build: (s) => casus1hPayload(s) },
  { route: '⚙ Optimize tweeweg (casus 1b getekend)', kind: 'v2TuneNetlist', build: (s) => tune2Payload(s, false) },
  { route: '⚙ Optimize drieweg (getekend)', kind: 'v2TuneNetlist3', build: (s) => tune3Payload(s, false) },
  { route: '✂ Minimize tweeweg', kind: 'v2TuneNetlist', build: (s) => tune2Payload(s, true) },
  { route: '✂ Minimize drieweg', kind: 'v2TuneNetlist3', build: (s) => tune3Payload(s, true) },
];

const uniq = (xs: number[]) => [...new Set(xs.map((x) => Number(x.toFixed(4))))];

function traceAll() {
  installObservers();
  const rows: { route: string; slider: number; design: number[]; synth: number[]; tuner: number[]; chainKey: string }[] = [];
  for (const r of ROUTES) {
    for (const s of SLIDER) {
      const payload = r.build(s) as { candidate?: { chainDeclaration?: ChainChoiceDeclaration } };
      const o = observe(r.kind, payload);
      rows.push({
        route: r.route,
        slider: s,
        design: uniq(o.design),
        synth: uniq(o.synth),
        tuner: uniq(o.tuner),
        chainKey: payload.candidate?.chainDeclaration ? stableJson(chainDeclarationKey(payload.candidate.chainDeclaration)) : "—",
      });
    }
  }
  console.log('\nE-6 stap 2 — wat elke lezer krijgt (ontwerpstap | synthese | tuner)\n');
  for (const r of rows) {
    const f = (xs: number[]) => (xs.length ? xs.join('/') : '—');
    console.log(`  ${r.route.padEnd(42)} schuif ${r.slider.toFixed(2)}:  ontwerp ${f(r.design).padEnd(6)} synthese ${f(r.synth).padEnd(6)} tuner ${f(r.tuner)}`);
  }
  // P2-helft van de payload: de ketenvingerafdruk beweegt niet met de schuif (de app verklaart hem niet).
  const keyMoves = ROUTES.filter((r) => new Set(rows.filter((x) => x.route === r.route).map((x) => x.chainKey)).size > 1).map((r) => r.route);
  console.log(`\n  chainDeclarationKey beweegt met de schuif op: ${keyMoves.length ? keyMoves.join(', ') : 'GEEN route'}`);
  return rows;
}

/* ------------------------------------------------------------------ *
 * De armen
 * ------------------------------------------------------------------ */

type Arm = 'split' | 'all' | 'base';
interface ArmShard {
  fixture: 'parsers' | 'casus1b';
  arm: Arm;
  slider: number;
  seconds: number;
  delivered: boolean;
  refusal: { kinds: string[]; reason: string } | null;
  rmsDb: number | null;
  windowPmDb: number | null;
  phaseTracking: { subject: string; meanAbsDeg: number }[];
  minZOhm: number | null;
  parts: number | null;
  bomEur: number | null;
  bomUnrealised: number | null;
  partsDigest: string | null;
  tuner: { rippleDb: number; phaseDeg: number; evaluations: number };
}

const catalog = loadCoilCatalog(casus1CoilCatalogPath(loadGolden()));

function runArm(fixture: 'parsers' | 'casus1b', arm: Arm, slider: number): ArmShard {
  const sPP = arm === 'base' ? DEFAULT_PP : slider;
  let kind: string;
  let payload: unknown;
  if (fixture === 'parsers') {
    kind = 'v2Chain3One';
    const d = appChainDecl();
    payload = parsersPayload(sPP, arm === 'split' || arm === 'base' ? d : withPP(d, sPP));
  } else {
    kind = 'v2ChainOne';
    payload = casus1bPayload(sPP, arm === 'all' ? 'all' : 'split');
  }
  const t0 = Date.now();
  const out: Record<string, unknown>[] = [];
  handleV2Request(structuredClone({ id: 1, kind, payload }) as never, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out.push(m.data as Record<string, unknown>);
  });
  const d = out[0] as {
    result: { parts: VxpPart[]; net: { after: { rippleDb: number; phaseDeg: number }; evaluations: number } };
    measurements: { response: { rmsDeviationDb: number; windowPlusMinusDb: number } | null; phaseTracking: { subject: string; meanAbsDeg: number }[] };
    gates: { gate: string; value: number | null }[];
    rejection: { kinds: string[]; reason: string } | null;
  };
  const parts = d.rejection ? null : d.result.parts;
  const minZ = d.gates.find((g) => g.gate === 'M-B/|Z|')?.value ?? null;
  let bom: ReturnType<typeof bomOf> | null = null;
  if (parts && catalog.length) {
    const inv = coilDcrInventory(parts, fixture === 'casus1b' ? CASUS1B_COIL_DCR.model : null);
    const fam = (id: string) => {
      if (fixture !== 'casus1b') return null;
      const way = inv.coils.find((x) => x.id === id)?.ways[0];
      return way ? (CASUS1B_COIL_FAMILY_BY_DRIVER as Record<string, string>)[way] ?? null : null;
    };
    bom = bomOf(catalog, parts, fam);
  }
  return {
    fixture,
    arm,
    slider,
    seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    delivered: d.rejection === null,
    refusal: d.rejection ? { kinds: [...d.rejection.kinds], reason: d.rejection.reason } : null,
    rmsDb: d.measurements.response ? Number(d.measurements.response.rmsDeviationDb.toFixed(3)) : null,
    windowPmDb: d.measurements.response ? Number(d.measurements.response.windowPlusMinusDb.toFixed(3)) : null,
    phaseTracking: d.measurements.phaseTracking.map((p) => ({ subject: p.subject, meanAbsDeg: Number(p.meanAbsDeg.toFixed(2)) })),
    minZOhm: minZ === null ? null : Number(minZ.toFixed(3)),
    parts: parts ? parts.filter((p) => p.type !== 'Driver' && p.type !== 'Generator' && !p.open && !p.shorted).length : null,
    bomEur: bom ? Number(bom.eur.toFixed(2)) : null,
    bomUnrealised: bom ? bom.unrealised.length : null,
    partsDigest: parts ? stableJson(parts).length + ':' + hash(stableJson(parts)) : null,
    tuner: { rippleDb: Number(d.result.net.after.rippleDb.toFixed(3)), phaseDeg: Number(d.result.net.after.phaseDeg.toFixed(2)), evaluations: d.result.net.evaluations },
  };
}
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

const ARM_JOBS: { fixture: 'parsers' | 'casus1b'; arm: Arm; slider: number }[] = [];
for (const fixture of ['parsers', 'casus1b'] as const) {
  ARM_JOBS.push({ fixture, arm: 'base', slider: DEFAULT_PP });
  for (const s of [0.25, 0.75]) for (const arm of ['split', 'all'] as const) ARM_JOBS.push({ fixture, arm, slider: s });
  // P2: op 0,5 is "split" exact "base" — één run om het te tonen.
  ARM_JOBS.push({ fixture, arm: 'split', slider: DEFAULT_PP });
}
const keyOf = (j: { fixture: string; arm: string; slider: number }) => `${j.fixture}:${j.arm}:${j.slider}`;

const part = process.env.E6_PART ?? 'trace';
const only = process.env.E6_ONLY ?? null;

if (only) {
  const [fx, arm, s] = only.split(':');
  if (!existsSync(SHARDS)) mkdirSync(SHARDS, { recursive: true });
  const shard = join(SHARDS, `${only.replace(/:/g, '_')}.json`);
  if (existsSync(shard) && process.env.E6_REDO !== '1') {
    console.log(`${only}: shard bestaat (E6_REDO=1 om opnieuw)`);
  } else {
    const r = runArm(fx as 'parsers' | 'casus1b', arm as Arm, Number(s));
    writeFileSync(shard, JSON.stringify(r, null, 1));
    console.log(`${only}: ${r.delivered ? 'geleverd' : `GEWEIGERD (${r.refusal!.kinds.join(',')})`} in ${r.seconds} s, rms ${r.rmsDb}`);
  }
} else if (part === 'trace') {
  const trace = traceAll();
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : {};
  writeFileSync(OUT, JSON.stringify({ ...prev, gemeten_op: new Date().toISOString().slice(0, 10), commit: execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(), stap2_lezers: trace }, null, 1));
  console.log(`\nwritten to ${OUT}`);
} else {
  const jobs = Math.max(1, Number(process.env.E6_JOBS ?? 4));
  const queue = [...ARM_JOBS];
  const start = (j: (typeof ARM_JOBS)[number]) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn('npx', ['vite-node', SELF], { env: { ...process.env, E6_ONLY: keyOf(j) }, stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${keyOf(j)} exited ${code}`))));
    });
  const pump = async () => {
    while (queue.length) await start(queue.shift()!);
  };
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, pump));
  const rows: ArmShard[] = ARM_JOBS.map((j) => JSON.parse(readFileSync(join(SHARDS, `${keyOf(j).replace(/:/g, '_')}.json`), 'utf-8')));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : {};
  writeFileSync(OUT, JSON.stringify({ ...prev, stap4_armen: rows }, null, 1));
  console.log('\nE-6 stap 4 — de armen');
  for (const r of rows) {
    console.log(
      `  ${r.fixture.padEnd(8)} ${r.arm.padEnd(5)} s=${r.slider.toFixed(2)}  ${r.delivered ? 'geleverd' : `GEWEIGERD ${r.refusal!.kinds.join(',')}`}` +
        `  rms ${r.rmsDb ?? '—'}  ± ${r.windowPmDb ?? '—'}  M-K ${r.phaseTracking.map((p) => `${p.subject} ${p.meanAbsDeg}`).join(' / ')}` +
        `  min|Z| ${r.minZOhm ?? '—'}  onderdelen ${r.parts ?? '—'}  BOM ${r.bomEur ?? '—'}  ${r.partsDigest ?? ''}  (${r.seconds} s)`,
    );
  }
  console.log(`\nwritten to ${OUT}`);
}
