/**
 * U-9 fase 0 — WAT ELK INVOERVELD MEETBAAR DOET, per route, zonder één tune.
 *
 * Drie lagen, goedkoopste eerst (de startprompt, punt 3):
 *
 *   (a) PAYLOAD — het v2-verzoek zoals de app het bouwt, door de ÉCHTE
 *       `handleV2Request`, met een observator op de keten-export
 *       (`runThreeWayChain` / `runDesignChain`, de M-1-techniek: de vite-node-
 *       module-namespace is configureerbaar). De observator legt vast wat de
 *       keten BINNENKRIJGT ná alle `withDeclared*`-overschrijvingen, en wat de
 *       tuner krijgt ná de hook die de kandidaatverklaring als LAATSTE spreidt —
 *       en gooit dan, zodat er niets getuned wordt. Vergeleken: wat de
 *       ONTWERPSTAP en de SYNTHESE lezen, wat de TUNER leest, de v2-runinstellingen
 *       (poorten, budgetten, determinisme) en `candidateFieldKey`.
 *   (b) RAPPORT — `buildReport` vóór en ná: de poortoordelen, de vensters en
 *       elke metriek.
 *   (c) Ketenruns — NIET in dit script; geen enkel veld had ze nodig (zie de
 *       inventaris). Een veld dat (a) én (b) niet beslechten staat daar met naam.
 *
 * Fixtures: casus 1 (set 'm3', drieweg), casus 1b (tweeweg), casus 1h
 * (hybride, gemeten vorm) — via de banken van `h4-bench.ts`, dezelfde die de
 * generatoren lezen. Daarnaast de twee DEMOBUNDELS door `buildEngineV2Input`,
 * het pad van de app, voor de velden die via de driverkaart en de kast het
 * rapport bereiken.
 *
 * HET APP-MODEL. De app bouwt haar keteninstellingen in twee literals in
 * `App.tsx` (`twoWayChainSettings` en de `settings` van de driewegtak van
 * `runVfOptimize`). Die kan een script niet importeren, dus hieronder staat een
 * SPIEGEL van die twee — en een BRONSCAN die de sleutelverzameling van elke
 * literal uit `App.tsx` leest en het script laat stoppen zodra de spiegel er
 * één mist of één te veel heeft. Een spiegel die niet gecontroleerd wordt is een
 * tweede implementatie; deze wordt bij elke run gecontroleerd.
 *
 * WAT DE TUNER LEEST op de driewegketen wordt NIET overgetypt: de
 * sleutel→instelling-paren van de `tuneOpts`-literal worden uit de BRON van
 * `threeWayChain.ts` gelezen, en de hook (`tuneOptionsFor`) wordt er als laatste
 * overheen gelegd, precies zoals de keten dat doet. Op de tweewegketen roept de
 * observator de geëxporteerde `designStepOptions` en `assembledTuneOptions`
 * zelf aan — dezelfde functies, geen kopie.
 *
 *   npx vite-node scripts/measure-u9-field-effects.ts
 *
 * Schrijft `test-fixtures/u9_field_effects.json` en drukt de tabel af. Seconden
 * per fixture; geen ketenrun, geen tune, geen browser. Draai hem niet naast een
 * testlaag (de H-2-regel).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chain3Mod from '../src/lib/threeWayChain.ts';
import * as chain2Mod from '../src/lib/designChain.ts';
import { activeSideBranches, assembledTuneOptions, designStepOptions, type ChainInput } from '../src/lib/designChain.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';
import { handleV2Request } from '../src/lib/engine2/optimizer/worker.ts';
import {
  candidateDeclarationFor,
  pairDerivationInputs,
  v2RunSettingsFor,
  windowFloorsFor,
  type StatedV2Limits,
} from '../src/lib/engine2/optimizer/scanRequest.ts';
import { declareCandidateChainChoices } from '../src/lib/engine2/optimizer/candidateDeclaration.ts';
import { stableJson } from '../src/lib/engine2/optimizer/determinism.ts';
import { buildCandidateField, candidateFieldKey } from '../src/lib/engine2/predesign/candidateField.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { fieldModeSettings, fieldModeOf, polarityArmsChoiceOf } from '../src/lib/engine2/predesign/fieldMode.ts';
import { polarityMarginReader, type PolarityBranch } from '../src/lib/engine2/predesign/polarityArms.ts';
import { mergeStatedCrossings, parseStatedCrossings } from '../src/lib/engine2/predesign/statedCrossings.ts';
import { AUTO_STRUCTS } from '../src/lib/threeWayDesign.ts';

/** De alignmentkeuze zoals `parseHpLpPref` in App.tsx haar teruggeeft. */
type StructChoice = { kind: 'LR' | 'BW' | 'BS'; order: 1 | 2 | 3 | 4 };
import { statedPolarityForThreeWay, statedInvertedForTwoWay } from '../src/lib/engine2/predesign/polarityArms.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { buildEngineV2Input, resolveDriverIds, type AdapterBranch, type AdapterGeometry, type AdapterResponse } from '../src/lib/engine2/appAdapter.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseZma } from '../src/lib/parsers/zma.ts';
import { demoBundleState, type DemoBundle, type DemoBundleState } from '../src/lib/demoBundle.ts';
import { KOAN_2WAY_DEMO } from '../src/demo2way.ts';
import { KOAN_3WAY_BUNDLE } from '../src/demo3way.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import { CASUS1H_ACTIVE } from '../src/lib/engine2/casus1h.fixture.ts';
import { factsForWorker } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { casus1Bench, casus1PayloadFor, casus1bBench, casus1bPayloadFor, casus1hBench, casus1hPayloadFor } from './h4-bench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'test-fixtures', 'u9_field_effects.json');

/* ================================================================== *
 * 1 — HET APP-MODEL: de staat die de keten- en v2-instellingen voedt
 * ================================================================== */

/** De v1-knoppen die in een keteninstelling landen, met hun startwaarde in `App.tsx`. */
interface ChainState {
  phasePriority: number; // % (App: useState(50))
  dirWeight: number; // % (25)
  powerMetric: 'smooth' | 'legacy';
  powerFoldWeight: number; // 0.5
  errorSmoothOct: number; // 1/12
  costWeight: number; // 0.015
  dissipationWeight: number; // 0.05
  rSourceLimitOhm: number; // DEFAULT_R_SOURCE_TIER_OHM = 1.0
  rSourceDisqOhm: number; // DEFAULT_R_SOURCE_DISQUALIFY_OHM = 2.0
  ampTarget: 'onAxis' | 'listeningWindow';
  breakupGuard: boolean;
  hpLpPref: string; // 'auto'
  hpLpPrefLow: string; // 'auto'
  vfEqBands: number; // DEFAULT_EQ_BANDS_PER_DRIVER = 2
  stagedOn: boolean;
  targetRipple: string; // '2.5'
  targetPhase: string; // '15'
  roomCorrection: boolean;
  roomRippleDb: number; // 3.5
  acSlopeMid: string; // '24'
  acSlopeTweeter: string; // '12'
  acSlopeWoofer: string; // '24'
  acSlopeMidHp: string; // '24'
  synthMode: 'filter' | 'acoustic';
  catalogSnap: boolean;
  snapProfile: string; // 'auto'
  snapStacks: boolean;
  snapBoundToSeries: boolean;
  phaseMetricMode: 'band' | 'overlap';
  diWeight: number; // 0.3
  ampMinLoadOhm: number | null;
  fbHzLow: string; // cabinet.drivers.low.fbHz
}

const CHAIN_DEFAULTS: ChainState = {
  phasePriority: 50,
  dirWeight: 25,
  powerMetric: 'smooth',
  powerFoldWeight: 0.5,
  errorSmoothOct: 1 / 12,
  costWeight: 0.015,
  dissipationWeight: 0.05,
  rSourceLimitOhm: 1.0,
  rSourceDisqOhm: 2.0,
  ampTarget: 'onAxis',
  breakupGuard: true,
  hpLpPref: 'auto',
  hpLpPrefLow: 'auto',
  vfEqBands: 2,
  stagedOn: true,
  targetRipple: '2.5',
  targetPhase: '15',
  roomCorrection: false,
  roomRippleDb: 3.5,
  acSlopeMid: '24',
  acSlopeTweeter: '12',
  acSlopeWoofer: '24',
  acSlopeMidHp: '24',
  synthMode: 'acoustic',
  catalogSnap: true,
  snapProfile: 'auto',
  snapStacks: true,
  snapBoundToSeries: false,
  phaseMetricMode: 'band',
  diWeight: 0.3,
  ampMinLoadOhm: null,
  fbHzLow: '',
};

const num = (raw: string, fb: number) => {
  const v = Number(raw);
  return raw.trim() !== '' && Number.isFinite(v) ? v : fb;
};
const parseHpLpPref = (pref: string): StructChoice | undefined => {
  const m = /^(LR|BW|BS)([1-4])$/.exec(pref);
  return m ? { kind: m[1] as StructChoice['kind'], order: Number(m[2]) as 1 | 2 | 3 | 4 } : undefined;
};
const acousticSlopesOf = (s: ChainState, threeWay: boolean) => {
  const mid = s.acSlopeMid === 'auto' ? undefined : Number(s.acSlopeMid);
  const tweeter = s.acSlopeTweeter === 'auto' ? undefined : Number(s.acSlopeTweeter);
  const lowLower = threeWay && s.acSlopeWoofer !== 'auto' ? Number(s.acSlopeWoofer) : undefined;
  const lowUpper = threeWay && s.acSlopeMidHp !== 'auto' ? Number(s.acSlopeMidHp) : undefined;
  const low = lowLower || lowUpper ? { lower: lowLower, upper: lowUpper } : undefined;
  return mid || tweeter || low ? { mid, tweeter, ...(low ? { low } : {}) } : undefined;
};
const snapPrefsOf = (s: ChainState) => {
  if (s.snapProfile === 'auto' && s.snapStacks) return undefined;
  return { profile: s.snapProfile, ...(s.snapStacks ? {} : { allowStacks: false }) };
};
const targetsOf = (s: ChainState) =>
  s.stagedOn
    ? { rippleDb: s.roomCorrection ? Math.max(num(s.targetRipple, 2.5), s.roomRippleDb) : num(s.targetRipple, 2.5), phaseDeg: num(s.targetPhase, 10) }
    : undefined;

/** SPIEGEL van de driewegliteral `settings` in `runVfOptimize` (de bronscan houdt hem eerlijk). */
function appChain3Settings(s: ChainState, fixed: { band: [number, number]; safety: unknown; hpFloorHz?: number; diAnchorHz?: number }) {
  return {
    phasePriority: s.phasePriority / 100,
    targets: targetsOf(s),
    acousticSlopes: acousticSlopesOf(s, true),
    xoLowPin: undefined, // v2: de pins bereiken het veld via de gestelde kruisingen, niet de keten
    xoHighPin: undefined,
    hpFloorHz: fixed.hpFloorHz,
    structureLow: parseHpLpPref(s.hpLpPrefLow),
    structureHigh: parseHpLpPref(s.hpLpPref),
    breakupGuard: s.breakupGuard,
    eqBands: s.vfEqBands,
    diAnchorHz: fixed.diAnchorHz,
    diWeight: s.diWeight,
    xoFloorPairs: undefined, // per kandidaat overschreven (windowFloorsFor)
    rSourceDisqualifyOhm: s.rSourceDisqOhm,
    directivityWeight: s.dirWeight / 100,
    powerMetric: s.powerMetric,
    powerFoldWeight: s.powerFoldWeight,
    errorSmoothOct: s.errorSmoothOct,
    costWeight: s.costWeight,
    dissipationWeight: s.dissipationWeight,
    ampMinLoadOhm: s.ampMinLoadOhm ?? undefined,
    audit: { thresholds: { rSourceOhm: s.rSourceLimitOhm }, fbHz: Number(s.fbHzLow) > 0 ? Number(s.fbHzLow) : undefined },
    ampTarget: s.ampTarget,
    phaseMetric: s.phaseMetricMode,
    synthMode: s.synthMode,
    catalogSnap: s.catalogSnap,
    snapPrefs: snapPrefsOf(s),
    band: fixed.band,
    safety: fixed.safety,
  };
}

/** SPIEGEL van `twoWayChainSettings` in `App.tsx`. */
function appChain2Settings(s: ChainState, fixed: { band: [number, number]; safety: unknown; angleData?: unknown; hpFloorHz?: number }) {
  return {
    phasePriority: s.phasePriority / 100,
    eqBandsPerDriver: s.vfEqBands,
    angleData: fixed.angleData,
    directivityWeight: s.dirWeight / 100,
    powerMetric: s.powerMetric,
    powerFoldWeight: s.powerFoldWeight,
    errorSmoothOct: s.errorSmoothOct,
    costWeight: s.costWeight,
    dissipationWeight: s.dissipationWeight,
    ampMinLoadOhm: s.ampMinLoadOhm ?? undefined,
    audit: { thresholds: { rSourceOhm: s.rSourceLimitOhm }, fbHz: Number(s.fbHzLow) > 0 ? Number(s.fbHzLow) : undefined },
    ampTarget: s.ampTarget,
    cutOnly: true,
    breakupGuard: s.breakupGuard,
    structurePreference: parseHpLpPref(s.hpLpPref),
    targets: targetsOf(s),
    hpFloorHz: fixed.hpFloorHz,
    phaseMetric: s.phaseMetricMode,
    acousticSlopes: acousticSlopesOf(s, false),
    band: fixed.band,
    synthMode: s.synthMode,
    catalogSnap: s.catalogSnap,
    snapPrefs: snapPrefsOf(s),
    safety: fixed.safety,
  };
}

/* ---- de BRONSCAN: de sleutels van beide literals uit App.tsx ------- */
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
function literalKeys(startMarker: RegExp, endMarker: RegExp): string[] {
  const s = APP.search(startMarker);
  if (s < 0) throw new Error(`bronscan: begin van de literal niet gevonden (${startMarker})`);
  const rest = APP.slice(s);
  const e = rest.search(endMarker);
  if (e < 0) throw new Error(`bronscan: einde van de literal niet gevonden (${endMarker})`);
  const body = rest.slice(0, e);
  // sleutels op het eerste niveau binnen de literal: regels "    key: …" of "    key,"
  const keys = new Set<string>();
  for (const line of body.split('\n').slice(1)) {
    const m = /^\s{4,8}([a-zA-Z][a-zA-Z0-9]*)\s*[:,]/.exec(line);
    if (m && !/^(thresholds|fbHz|rippleDb|phaseDeg)$/.test(m[1])) keys.add(m[1]);
  }
  return [...keys].sort();
}
function assertMirror(): void {
  const k2 = literalKeys(/const twoWayChainSettings = \(args/, /\n {2}\}\);\n/);
  const k3 = literalKeys(/\n {6}const settings = \{\n {8}phasePriority: phasePriority \/ 100,/, /\n {6}\};\n/);
  const m2 = Object.keys(appChain2Settings(CHAIN_DEFAULTS, { band: [1, 2], safety: null })).sort();
  const m3 = Object.keys(appChain3Settings(CHAIN_DEFAULTS, { band: [1, 2], safety: null })).sort();
  const diff = (a: string[], b: string[]) => [...a.filter((x) => !b.includes(x)).map((x) => `+${x}`), ...b.filter((x) => !a.includes(x)).map((x) => `-${x}`)];
  const d2 = diff(k2, m2);
  const d3 = diff(k3, m3);
  if (d2.length || d3.length) {
    throw new Error(
      `bronscan: de spiegel van de app-literals is weggedreven — tweeweg ${JSON.stringify(d2)}, drieweg ${JSON.stringify(d3)} ` +
        '(+ = in App.tsx en niet in de spiegel, - = andersom). Werk de spiegel bij vóór er gemeten wordt.',
    );
  }
}

/* ---- wat de TUNER leest op de driewegketen, uit de BRON ------------- */
const CHAIN3_SRC = readFileSync(join(ROOT, 'src', 'lib', 'threeWayChain.ts'), 'utf8');
function chain3TunerMap(): Record<string, string> {
  const s = CHAIN3_SRC.indexOf('const tuneOpts = {');
  const e = CHAIN3_SRC.indexOf('let net = optimizeNetworkValues', s);
  if (s < 0 || e < 0) throw new Error('bronscan: de tuneOpts-literal van threeWayChain.ts is niet gevonden');
  const map: Record<string, string> = {};
  for (const m of CHAIN3_SRC.slice(s, e).matchAll(/^\s+([a-zA-Z]+):\s*s\.([a-zA-Z]+),?\s*$/gm)) map[m[1]] = m[2];
  if (Object.keys(map).length < 10) throw new Error('bronscan: te weinig tuner-sleutels gevonden — de literal is veranderd');
  return map;
}
/** Elke `s.X` die threeWayChain.ts BUITEN de tuner-literal leest: de ontwerpstap, de synthese, de ranking. */
function chain3DesignReads(): string[] {
  const s = CHAIN3_SRC.indexOf('const tuneOpts = {');
  const e = CHAIN3_SRC.indexOf('let net = optimizeNetworkValues', s);
  const outside = CHAIN3_SRC.slice(0, s) + CHAIN3_SRC.slice(e);
  return [...new Set([...outside.matchAll(/\bs\.([a-zA-Z]+)\b/g)].map((m) => m[1]))].sort();
}

/* ================================================================== *
 * 2 — DE OBSERVATOR op de keten-exports
 * ================================================================== */
const SENTINEL = '__u9_captured__';
interface Captured {
  design: Record<string, unknown>;
  tuner: Record<string, unknown>;
}
let captured: Captured | null = null;
let seedParts: VxpPart[] = [];

const SKIP_VALUE_KEYS = new Set(['safety', 'angleData', 'activeBranch', 'activeMeasured', 'activeMeasuredSafety', 'midBranch', 'branchTargets', 'onStage', 'driverZ', 'zFloorBarrierImpedance', 'phaseAdmissionFacts', 'valueSumCeilings', 'gateReference']);
/** Grote numerieke rasters worden een vingerafdruk: een verschil blijft zichtbaar, de diff blijft leesbaar. */
const compact = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || typeof v === 'function') continue;
    out[k] = SKIP_VALUE_KEYS.has(k) || (Array.isArray(v) && v.length > 24) ? `#${hash(stableJson(v))}` : v;
  }
  return out;
};

function installObservers(): void {
  const tunerMap = chain3TunerMap();
  const designReads = chain3DesignReads();
  const wrap3 = (input: Chain3Input, _p: unknown, hooks?: { tuneOptionsFor?: (s: readonly VxpPart[]) => Record<string, unknown> }) => {
    const s = input.settings as unknown as Record<string, unknown>;
    const fromSettings: Record<string, unknown> = {};
    for (const [opt, key] of Object.entries(tunerMap)) fromSettings[opt] = s[key];
    const hook = hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seedParts) : {};
    const design: Record<string, unknown> = {};
    for (const k of designReads) design[k] = s[k];
    design.__tAdjust = input.tAdjust;
    design.__midAdjust = input.midAdjust;
    captured = { design: compact(design), tuner: compact({ ...fromSettings, ...hook }) };
    throw new Error(SENTINEL);
  };
  const wrap2 = (input: ChainInput, _l: unknown, _p: unknown, hooks?: Parameters<typeof assembledTuneOptions>[3]) => {
    const branches = activeSideBranches(input);
    const design = { ...designStepOptions(input, branches), synthMode: input.settings.synthMode, catalogSnap: input.settings.catalogSnap, snapPrefs: input.settings.snapPrefs, targets: input.settings.targets, leanTargetDb: input.settings.leanTargetDb, synthesisGrid: input.settings.synthesisGrid, lowestWayLevelWork: input.settings.lowestWayLevelWork, lowestWayCoilMaxHenry: input.settings.lowestWayCoilMaxHenry, activeSide: input.settings.activeSide, __adjust: input.adjust };
    const tuner = assembledTuneOptions(input, seedParts, { activeBranch: branches.activeBranch, activeBranchSafety: branches.activeBranchSafety }, hooks);
    captured = { design: compact(design as Record<string, unknown>), tuner: compact(tuner as unknown as Record<string, unknown>) };
    throw new Error(SENTINEL);
  };
  for (const [mod, name, fn] of [
    [chain3Mod, 'runThreeWayChain', wrap3],
    [chain2Mod, 'runDesignChain', wrap2],
  ] as const) {
    const d = Object.getOwnPropertyDescriptor(mod, name);
    if (!d || !d.configurable) throw new Error(`de keten-export ${name} is niet configureerbaar`);
    Object.defineProperty(mod, name, { configurable: true, enumerable: true, get: () => fn });
  }
}

function observe(kind: 'v2Chain3One' | 'v2ChainOne', payload: unknown): Captured {
  captured = null;
  let err: string | null = null;
  handleV2Request({ id: 1, kind, payload } as never, (m: { kind: string; data?: unknown }) => {
    if (m.kind === 'error') err = String((m as { data?: unknown }).data ?? '');
  });
  if (!captured) throw new Error(`de observator vuurde NIET (${kind}): ${err}`);
  return captured;
}

/* ================================================================== *
 * 3 — HASH en DIFF
 * ================================================================== */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const changedKeys = (a: Record<string, unknown>, b: Record<string, unknown>): string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => stableJson(a[k]) !== stableJson(b[k])).sort();

/* ================================================================== *
 * 4 — PER FIXTURE: één kandidaat, het app-pad, vóór/ná
 * ================================================================== */

/** Wat een perturbatie verandert, in de woordenschat van de app. */
interface AppSnapshot {
  chain: ChainState;
  v2: Record<string, string>; // de V2Settings-strings
  perWayDriveDb: Record<string, number>; // v2Meas[role].driveOnFsMaxDb, gekeyd op model
  coilFamilyByModel: Record<string, string>;
  /** De Setup-aanpassing van de tweeter (en op een drieweg de mid): offset mm, trim dB. */
  adjust?: { offsetMm?: number; trimDb?: number; midOffsetMm?: number; midTrimDb?: number };
}
const EMPTY_V2: Record<string, string> = {};

function limitsOf(v2: Record<string, string>): StatedV2Limits & { lowestWayLevelWork?: unknown } {
  const st = (raw: string | undefined, scale = 1) => {
    if (raw === undefined || raw.trim() === '') return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? v * scale : undefined;
  };
  const lwl = v2.lowestWayLevelWork === 'none'
    ? 'none'
    : v2.lowestWayLevelWork === 'series-r-max' && st(v2.lowestWaySeriesRMaxOhm) !== undefined
      ? { kind: 'series-r-max', maxOhm: st(v2.lowestWaySeriesRMaxOhm)! }
      : undefined;
  return {
    maxDissipationFraction: st(v2.maxDissipationPct, 1 / 100),
    minEpdrOhm: st(v2.minEpdrOhm),
    maxDriveOnFsDb: st(v2.maxDriveOnFsDb),
    lfBumpBudgetDb: st(v2.lfBumpBudgetDb),
    qesMultiplierMax: st(v2.qesMultiplierMax),
    dampingMarginDb: st(v2.dampingMarginDb),
    runSeed: st(v2.runSeed),
    runBudgetEvals: st(v2.runBudgetEvals),
    amplifierPeakPowerW: st(v2.amplifierPeakPowerW),
    amplifierNominalLoadOhm: st(v2.amplifierNominalLoadOhm),
    resistorClassW: st(v2.resistorClassW),
    resistorPowerMargin: st(v2.resistorPowerMargin),
    coilClassA: st(v2.coilClassA),
    resistorThermalPowerW: st(v2.resistorThermalPowerW),
    lowestWayLevelWork: lwl,
  };
}

interface Measured {
  fieldKey: string;
  field: string[];
  design: Record<string, unknown>;
  tuner: Record<string, unknown>;
  v2run: Record<string, unknown>;
}

type Route = '3w' | '2w' | 'hyb';

function measure(route: Route, snap: AppSnapshot, bench: Bench): Measured {
  const limits = limitsOf(snap.v2);
  const threeWay = route === '3w';
  const report = bench.report;
  const wis = bench.windowInputs;
  /* het VELD, zoals de app het bouwt: fieldModeSettings + pairDerivationInputs + gestelde kruisingen. */
  const fieldMode = fieldModeOf(snap.v2.fieldMode ?? '');
  const arms = polarityArmsChoiceOf(snap.v2.polarityArms ?? '');
  const slopes = acousticSlopesOf(snap.chain, threeWay);
  const fieldSettings = fieldModeSettings(fieldMode, { stepsPerAxis: bench.stepsPerAxis(snap), pairs: wis.length }, bench.marginFor, arms);
  const perPair = pairDerivationInputs({
    windowInputs: wis,
    ...(slopes ? { slopes } : {}),
    statedDriveLimitDbByDriverId: bench.perWayById(snap),
    ...(limits.maxDriveOnFsDb !== undefined ? { fallbackDriveLimitDb: limits.maxDriveOnFsDb } : {}),
    curveOfDriverId: bench.curveOf,
  });
  const labels = wis.map((wi) => `${wi.lower}→${wi.upper}`);
  const stated = mergeStatedCrossings({
    parsed: parseStatedCrossings(snap.v2.statedCrossings ?? '', labels),
    ranges: bench.statedRanges(snap, wis.length),
    pairLabels: labels,
  });
  const field = buildCandidateField({
    windowInputs: wis,
    alignments: AUTO_STRUCTS,
    ...fieldSettings,
    perPair,
    ...(stated.complete ? { statedPerAxisHz: stated.perAxisHz, statedOn: 'u9' } : {}),
  });
  const fieldKey = hash(stableJson(candidateFieldKey(field.field)));
  const cand: GeneratedCandidate | undefined = field.field.candidates[0];
  if (!cand) return { fieldKey, field: [], design: {}, tuner: {}, v2run: {} };

  /* de PAYLOAD: de fixture levert de metingen, de app levert instellingen, verklaring en v2-blok. */
  const base = bench.payloadFor(cand) as { input: { settings: Record<string, unknown> } & Record<string, unknown>; v2: Record<string, unknown>; candidate: Record<string, unknown> };
  const fixedS = base.input.settings;
  const appS: Record<string, unknown> = threeWay
    ? appChain3Settings(snap.chain, { band: fixedS.band as [number, number], safety: fixedS.safety, hpFloorHz: fixedS.hpFloorHz as number | undefined, diAnchorHz: fixedS.diAnchorHz as number | undefined })
    : appChain2Settings(snap.chain, { band: fixedS.band as [number, number], safety: fixedS.safety, angleData: fixedS.angleData, hpFloorHz: fixedS.hpFloorHz as number | undefined });
  const perCandidate: Record<string, unknown> = threeWay
    ? {
        structureLow: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
        structureHigh: { kind: cand.crossings[cand.crossings.length - 1].alignment.kind, order: cand.crossings[cand.crossings.length - 1].alignment.order },
        xoFloorPairs: windowFloorsFor(cand),
        ...(cand.polarity ? { statedPolarity: statedPolarityForThreeWay(cand.polarity) } : {}),
      }
    : {
        structurePreference: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
        ...(cand.polarity ? { statedInverted: statedInvertedForTwoWay(cand.polarity) } : {}),
      };
  const settings: Record<string, unknown> = { ...appS, ...perCandidate, ...(fixedS.activeSide ? { activeSide: fixedS.activeSide } : {}) };
  const declaration = candidateDeclarationFor({
    candidate: cand,
    settings: settings as never,
    targetCurve: bench.targetCurve,
    limits,
    driveOnFsMaxDbByModel: snap.perWayDriveDb,
    driveCeilingDerived: report.metrics.driveExcursion.length > 0,
    coilFamilyByModel: snap.coilFamilyByModel,
    coilDcrFits: bench.coilDcrFits,
    multiWay: threeWay,
  });
  const lwl = limits.lowestWayLevelWork;
  const chainDeclaration = declareCandidateChainChoices({
    stated: { eqBands: snap.chain.vfEqBands },
    ...(lwl === 'none' ? { lowestWayLevelWorkForbidden: true } : {}),
    ...(lwl && typeof lwl === 'object' ? { lowestWaySeriesRMaxOhm: (lwl as { maxOhm: number }).maxOhm } : {}),
    ...bench.chainDeclExtra,
  } as never);
  const v2run = v2RunSettingsFor({
    limits,
    driveOnFsMaxDbByModel: snap.perWayDriveDb,
    ampMinLoadOhm: snap.chain.ampMinLoadOhm,
    facts: bench.facts,
    targetCurve: bench.targetCurve,
    judgeBandHz: settings.band as [number, number],
  });
  const adj = snap.adjust ?? {};
  const adjIn: Record<string, unknown> = threeWay
    ? {
        tAdjust: { ...(base.input.tAdjust as object), ...(adj.offsetMm !== undefined ? { offsetMm: adj.offsetMm } : {}), ...(adj.trimDb !== undefined ? { trimDb: adj.trimDb } : {}) },
        midAdjust: { ...(base.input.midAdjust as object), ...(adj.midOffsetMm !== undefined ? { offsetMm: adj.midOffsetMm } : {}), ...(adj.midTrimDb !== undefined ? { trimDb: adj.midTrimDb } : {}) },
      }
    : { adjust: { ...(base.input.adjust as object), ...(adj.offsetMm !== undefined ? { offsetMm: adj.offsetMm } : {}), ...(adj.trimDb !== undefined ? { trimDb: adj.trimDb } : {}) } };
  const payload = {
    ...base,
    input: { ...base.input, ...adjIn, settings },
    v2: { ...base.v2, ...v2run },
    candidate: { ...base.candidate, declaration, chainDeclaration },
  };
  const cap = observe(threeWay ? 'v2Chain3One' : 'v2ChainOne', payload);
  const { gates, budgets, determinism } = v2run as unknown as Record<string, unknown>;
  return {
    fieldKey,
    field: field.field.candidates.map((c) => c.label),
    design: cap.design,
    tuner: cap.tuner,
    v2run: { gates, budgets, determinism },
  };
}

/* ---- de drie banken, in één vorm ---------------------------------- */
interface Bench {
  report: EngineV2Report;
  /** De vensters waarover het veld loopt: op een hybride ALLEEN de passieve overnames (H-2 laat de actieve vallen, op naam). */
  windowInputs: EngineV2Report['predesign']['windowInputs'];
  marginFor: ReturnType<typeof polarityMarginReader>;
  curveOf: (id: string) => { freq: number[]; db: number[] } | null;
  perWayById: (s: AppSnapshot) => Record<string, number>;
  stepsPerAxis: (s: AppSnapshot) => number;
  statedRanges: (s: AppSnapshot, pairs: number) => ReturnType<typeof v2StatedRangesOf>;
  payloadFor: (c: GeneratedCandidate) => unknown;
  targetCurve: Parameters<typeof v2RunSettingsFor>[0]['targetCurve'];
  facts: Record<string, unknown>;
  coilDcrFits: Parameters<typeof candidateDeclarationFor>[0]['coilDcrFits'];
  chainDeclExtra: Record<string, unknown>;
}

/** U-5b — het crossover-point-formulier als gestelde posities (spiegel van `v2StatedRanges` in App.tsx). */
function v2StatedRangesOf(s: AppSnapshot, pairs: number) {
  const none = Array.from({ length: Math.max(0, pairs) }, () => null as { centreHz: number | null; marginHz: number | null; steps: number } | null);
  if (s.v2.__xoRangeOn !== 'on' || pairs < 1) return none;
  const n = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const steps = pairs > 1 ? Number(s.v2.__xo3Steps ?? '2') : Number(s.v2.__xoScanSteps ?? '3');
  const out = [...none];
  out[pairs - 1] = { centreHz: n(s.v2.__xoFreqHz), marginHz: n(s.v2.__xoMarginHz), steps };
  if (pairs > 1) out[0] = { centreHz: n(s.v2.__xoLowFreqHz), marginHz: n(s.v2.__xoLowMarginHz), steps };
  return out;
}

const curveFrom = (g: { freq: number[]; spl: number[] } | undefined) => (g ? { freq: g.freq, db: g.spl } : null);
const branchOf = (m: Record<string, { freq: number[]; spl: number[]; phaseDeg: number[] }>) => (id: string): PolarityBranch | null =>
  m[id] ? { response: m[id] as never, adjust: {} } : null;

function benches(): Record<Route, { bench: Bench; seed: VxpPart[] }> {
  const parts = (p: string) => (JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as { parts: VxpPart[] }).parts;
  const steps = (s: AppSnapshot, three: boolean) => Number((three ? s.v2.__xo3Steps : s.v2.__xoScanSteps) ?? (three ? '2' : '3'));

  const b1 = casus1Bench('m3');
  const g1 = b1.gridded as unknown as { w: never; m: never; t: never };
  const map1: Record<string, never> = { woofer: g1.w, mid: g1.m, tweeter: g1.t };
  const b1b = casus1bBench();
  const ids1b = b1b.report.driversLowToHigh;
  const g1b = b1b.gridded as unknown as { w: never; t: never };
  const map1b: Record<string, never> = { [ids1b[0]]: g1b.w, [ids1b[ids1b.length - 1]]: g1b.t };
  const b1h = casus1hBench();
  const ids1h = b1h.report.driversLowToHigh;
  const g1h = b1h.gridded as unknown as { w: never; t: never };
  const map1h: Record<string, never> = { [ids1h[1]]: g1h.w, [ids1h[2]]: g1h.t };

  const mk = (report: EngineV2Report, map: Record<string, never>, payloadFor: (c: GeneratedCandidate) => unknown, three: boolean, facts: unknown, targetCurve: never, fits: never, extra: Record<string, unknown>, dropLower?: string): Bench => ({
    report,
    windowInputs: report.predesign.windowInputs.filter((wi) => wi.lower !== dropLower),
    marginFor: polarityMarginReader(branchOf(map)),
    curveOf: (id) => curveFrom(map[id]),
    perWayById: (s) => Object.fromEntries(Object.entries(s.perWayDriveDb).filter(([k]) => report.driversLowToHigh.includes(k))),
    stepsPerAxis: (s) => steps(s, three),
    statedRanges: (s, n) => v2StatedRangesOf(s, n),
    payloadFor,
    targetCurve,
    facts: facts as Record<string, unknown>,
    coilDcrFits: fits,
    chainDeclExtra: extra,
  });
  const p1 = (c: GeneratedCandidate) => casus1PayloadFor(c, b1);
  const p1b = (c: GeneratedCandidate) => casus1bPayloadFor(c, b1b);
  const p1h = (c: GeneratedCandidate) => casus1hPayloadFor(c, b1h);
  const tc = (p: (c: GeneratedCandidate) => { v2: { targetCurve: never } }, f: { field: { candidates: GeneratedCandidate[] } }) => p(f.field.candidates[0]).v2.targetCurve;
  const hybExtra = (() => {
    const pl = p1h(b1h.bare.field.candidates[0]) as { candidate: { chainDeclaration: { stated: Record<string, unknown> } } };
    return pl.candidate.chainDeclaration.stated.activeSide ? { activeSide: pl.candidate.chainDeclaration.stated.activeSide } : {};
  })();
  return {
    '3w': { bench: mk(b1.report, map1, p1, true, b1.facts, tc(p1 as never, b1.bare as never), undefined as never, {}), seed: parts('test-fixtures/casus1/KAND-V2-1.adsfilter.json') },
    '2w': { bench: mk(b1b.report, map1b, p1b, false, b1b.facts, tc(p1b as never, b1b.bare as never), undefined as never, {}), seed: parts('test-fixtures/casus1b/KAND-V2-1.adsfilter.json') },
    hyb: { bench: mk(b1h.report, map1h, p1h, false, b1h.facts, tc(p1h as never, b1h.bare as never), undefined as never, hybExtra, CASUS1H_ACTIVE.activeWay), seed: parts('test-fixtures/casus1h/H-KAND-1.adsfilter.json') },
  };
}

/* ================================================================== *
 * 5 — DE PERTURBATIES: per veld twee waarden en (waar dat bestaat) leeg
 * ================================================================== */
interface Perturbation {
  /** Registerrij, of "geen:<state>" voor een veld zonder rij. */
  row: string;
  label: string;
  routes: Route[];
  arms: { name: string; apply: (s: AppSnapshot) => void }[];
}
const C = (k: keyof ChainState, ...vals: unknown[]) => vals.map((v) => ({ name: `${String(k)}=${JSON.stringify(v)}`, apply: (s: AppSnapshot) => { (s.chain as unknown as Record<string, unknown>)[k] = v; } }));
const V = (k: string, ...vals: string[]) => vals.map((v) => ({ name: `${k}=${JSON.stringify(v)}`, apply: (s: AppSnapshot) => { s.v2[k] = v; } }));
const ALL: Route[] = ['3w', '2w', 'hyb'];

const PERTURBATIONS: Perturbation[] = [
  // --- de v1-knoppen van Filters → Goals & weighting / Filter shape / Components / Targets ---
  { row: 'phasePriority', label: 'Priority (amplitude ↔ phase)', routes: ALL, arms: C('phasePriority', 25, 75) },
  { row: 'errorSmoothOct', label: 'Error smoothing', routes: ALL, arms: C('errorSmoothOct', 0, 1 / 6) },
  { row: 'hpLpPref', label: 'HP/LP preference (high)', routes: ALL, arms: C('hpLpPref', 'LR2', 'BW3') },
  { row: 'hpLpPref', label: 'HP/LP preference (low)', routes: ['3w'], arms: C('hpLpPrefLow', 'LR2', 'BW3') },
  { row: 'geen:dirWeight', label: 'Directivity weight (energy average)', routes: ALL, arms: C('dirWeight', 0, 60) },
  { row: 'geen:ampTarget', label: 'Amplitude target (on-axis / listening window)', routes: ALL, arms: C('ampTarget', 'listeningWindow') },
  { row: 'geen:powerMetric', label: 'Power metric', routes: ALL, arms: C('powerMetric', 'legacy') },
  { row: 'geen:powerFoldWeight', label: 'Power-fold weight', routes: ALL, arms: C('powerFoldWeight', 0.1, 2) },
  { row: 'geen:costWeight', label: 'Cost weight', routes: ALL, arms: C('costWeight', 0, 0.1) },
  { row: 'geen:dissipationWeight', label: 'Dissipation weight', routes: ALL, arms: C('dissipationWeight', 0, 0.5) },
  { row: 'geen:rSourceLimitOhm', label: 'Source R limit (audit tier)', routes: ALL, arms: C('rSourceLimitOhm', 0.5, 3) },
  { row: 'geen:rSourceDisqOhm', label: 'Source R disqualify', routes: ALL, arms: C('rSourceDisqOhm', 0.5, 6) },
  { row: 'geen:diWeight', label: 'DI anchor weight', routes: ALL, arms: C('diWeight', 0, 1) },
  { row: 'geen:vfEqBands', label: 'EQ bands per driver', routes: ALL, arms: C('vfEqBands', 0, 4) },
  { row: 'geen:breakupGuard', label: 'Breakup guard', routes: ALL, arms: C('breakupGuard', false) },
  { row: 'geen:phaseMetricMode', label: 'Phase metric (band / overlap)', routes: ALL, arms: C('phaseMetricMode', 'overlap') },
  { row: 'geen:synthMode', label: 'Synthesis mode (filter / acoustic)', routes: ALL, arms: C('synthMode', 'filter') },
  { row: 'catalogSnap', label: 'Snap to catalogue', routes: ALL, arms: C('catalogSnap', false) },
  { row: 'geen:snapProfile', label: 'Snap profile', routes: ALL, arms: C('snapProfile', 'premium', 'budget') },
  { row: 'geen:snapStacks', label: 'Allow stacks', routes: ALL, arms: C('snapStacks', false) },
  { row: 'geen:stagedOn', label: 'Staged pass on/off', routes: ALL, arms: C('stagedOn', false) },
  { row: 'geen:targetRipple', label: 'Staged ripple target', routes: ALL, arms: C('targetRipple', '1.5', '4') },
  { row: 'geen:targetPhase', label: 'Staged phase target', routes: ALL, arms: C('targetPhase', '5', '30') },
  { row: 'geen:roomCorrection', label: 'Room correction present', routes: ALL, arms: C('roomCorrection', true) },
  { row: 'geen:roomRippleDb', label: 'Room-correction ripple (only with room correction on)', routes: ALL, arms: [{ name: 'roomCorrection=true,roomRippleDb=6', apply: (s) => { s.chain.roomCorrection = true; s.chain.roomRippleDb = 6; } }] },
  { row: 'geen:acSlopeMid', label: 'Acoustic slope mid (LP)', routes: ALL, arms: C('acSlopeMid', '12', 'auto') },
  { row: 'geen:acSlopeTweeter', label: 'Acoustic slope tweeter (HP)', routes: ALL, arms: C('acSlopeTweeter', '24', 'auto') },
  { row: 'geen:acSlopeWoofer', label: 'Acoustic slope woofer (LP, 3-way)', routes: ALL, arms: C('acSlopeWoofer', '12', 'auto') },
  { row: 'geen:acSlopeMidHp', label: 'Acoustic slope mid (HP, 3-way)', routes: ALL, arms: C('acSlopeMidHp', '12', 'auto') },
  { row: 'ampMinLoadOhm', label: 'Amplifier minimum load', routes: ALL, arms: C('ampMinLoadOhm', 2.6, 4) },
  { row: 'geen:tweeterOffsetMm', label: 'Tweeter adjustment: offset mm', routes: ALL, arms: [{ name: 'offsetMm=10', apply: (s) => { s.adjust = { offsetMm: 10 }; } }] },
  { row: 'geen:tweeterTrimDb', label: 'Tweeter adjustment: trim dB', routes: ALL, arms: [{ name: 'trimDb=-1', apply: (s) => { s.adjust = { trimDb: -1 }; } }] },
  { row: 'geen:midOffsetMm', label: 'Mid adjustment: offset mm (3-way)', routes: ['3w'], arms: [{ name: 'midOffsetMm=10', apply: (s) => { s.adjust = { midOffsetMm: 10 }; } }] },
  { row: 'geen:midTrimDb', label: 'Mid adjustment: trim dB (3-way)', routes: ['3w'], arms: [{ name: 'midTrimDb=-1', apply: (s) => { s.adjust = { midTrimDb: -1 }; } }] },
  { row: 'geen:fbHzLow', label: 'Box tuning f_b (low driver card)', routes: ALL, arms: C('fbHzLow', '30', '45') },
  // --- de v2-velden (Engine v2-paneel) ---
  { row: 'maxDissipationPct', label: 'Max dissipation (M-A)', routes: ALL, arms: V('maxDissipationPct', '35', '60') },
  { row: 'minEpdrOhm', label: 'Min EPDR', routes: ALL, arms: V('minEpdrOhm', '1.6', '3') },
  { row: 'maxDriveOnFsDb', label: 'Max drive on f_s (M-C)', routes: ALL, arms: V('maxDriveOnFsDb', '-18', '-30') },
  { row: 'amplifierPeakPowerW', label: 'Amplifier peak power (zonder nominale last)', routes: ALL, arms: V('amplifierPeakPowerW', '160', '400') },
  { row: 'amplifierPeakPowerW', label: 'Amplifier peak power (mét nominale last 8 Ω)', routes: ALL, arms: [{ name: 'peak=160,nominal=8', apply: (s) => { s.v2.amplifierPeakPowerW = '160'; s.v2.amplifierNominalLoadOhm = '8'; } }, { name: 'peak=400,nominal=8', apply: (s) => { s.v2.amplifierPeakPowerW = '400'; s.v2.amplifierNominalLoadOhm = '8'; } }] },
  { row: 'amplifierNominalLoadOhm', label: 'Amplifier nominal load (zonder piekvermogen)', routes: ALL, arms: V('amplifierNominalLoadOhm', '4', '8') },
  { row: 'resistorClassW', label: 'Resistor class (zonder marge)', routes: ALL, arms: V('resistorClassW', '10', '20') },
  { row: 'resistorClassW', label: 'Resistor class (mét marge 0,5)', routes: ALL, arms: [{ name: 'class=10,margin=0.5', apply: (s) => { s.v2.resistorClassW = '10'; s.v2.resistorPowerMargin = '0.5'; } }] },
  { row: 'resistorPowerMargin', label: 'Resistor margin (zonder klasse)', routes: ALL, arms: V('resistorPowerMargin', '0.5', '0.8') },
  { row: 'coilClassA', label: 'Coil class (A)', routes: ALL, arms: V('coilClassA', '5', '10') },
  { row: 'resistorThermalPowerW', label: 'Resistor thermal power', routes: ALL, arms: V('resistorThermalPowerW', '10', '30') },
  { row: 'lowestWayLevelWork', label: 'Level work on lowest way', routes: ALL, arms: V('lowestWayLevelWork', 'none', 'series-r-max') },
  { row: 'lowestWaySeriesRMaxOhm', label: 'Max series R lowest way (onder series-r-max)', routes: ALL, arms: [{ name: 'series-r-max,1.0', apply: (s) => { s.v2.lowestWayLevelWork = 'series-r-max'; s.v2.lowestWaySeriesRMaxOhm = '1.0'; } }, { name: 'series-r-max,2.0', apply: (s) => { s.v2.lowestWayLevelWork = 'series-r-max'; s.v2.lowestWaySeriesRMaxOhm = '2.0'; } }] },
  { row: 'lowestWaySeriesRMaxOhm', label: 'Max series R lowest way (zonder ouder)', routes: ALL, arms: V('lowestWaySeriesRMaxOhm', '1.0') },
  { row: 'lfBumpBudgetDb', label: 'LF-bump budget (M-D)', routes: ALL, arms: V('lfBumpBudgetDb', '1.4', '3') },
  { row: 'qesMultiplierMax', label: 'Q_es multiplier max (M-E)', routes: ALL, arms: V('qesMultiplierMax', '2.4', '1.5') },
  { row: 'dampingMarginDb', label: 'Damping margin', routes: ALL, arms: V('dampingMarginDb', '1.5', '3') },
  { row: 'runSeed', label: 'Run seed', routes: ALL, arms: V('runSeed', '1', '2') },
  { row: 'runBudgetEvals', label: 'Run budget (evaluations)', routes: ALL, arms: V('runBudgetEvals', '500', '5000') },
  { row: 'fieldMode', label: 'Candidate field (exploration / full)', routes: ALL, arms: V('fieldMode', 'full') },
  { row: 'polarityArms', label: 'Polarity arms (textbook / both)', routes: ALL, arms: V('polarityArms', 'both') },
  { row: 'statedCrossings', label: 'Stated crossings', routes: ['2w', 'hyb'], arms: V('statedCrossings', '2200', '2000, 2400') },
  { row: 'statedCrossings', label: 'Stated crossings (drieweg)', routes: ['3w'], arms: V('statedCrossings', '300; 2200') },
  { row: 'crossoverPoint', label: 'Crossover point (pin) on', routes: ALL, arms: [{ name: 'xoRangeOn,2300±100', apply: (s) => { s.v2.__xoRangeOn = 'on'; s.v2.__xoFreqHz = '2300'; s.v2.__xoMarginHz = '100'; s.v2.__xoLowFreqHz = '350'; s.v2.__xoLowMarginHz = '40'; } }] },
  { row: 'crossoverPoint', label: 'Crossover point (pin) zonder vinkje', routes: ALL, arms: [{ name: 'xoRangeOff,2300±100', apply: (s) => { s.v2.__xoFreqHz = '2300'; s.v2.__xoMarginHz = '100'; } }] },
  { row: 'xoScanSteps', label: 'Scan steps (2-way)', routes: ['2w', 'hyb'], arms: [{ name: 'steps=5 (pin uit)', apply: (s) => { s.v2.__xoScanSteps = '5'; } }, { name: 'steps=5 (pin aan)', apply: (s) => { s.v2.__xoScanSteps = '5'; s.v2.__xoRangeOn = 'on'; s.v2.__xoFreqHz = '2300'; s.v2.__xoMarginHz = '100'; } }, { name: 'steps=5 (vol veld)', apply: (s) => { s.v2.__xoScanSteps = '5'; s.v2.fieldMode = 'full'; } }] },
  { row: 'xo3Steps', label: 'Scan steps (3-way)', routes: ['3w'], arms: [{ name: 'steps=5 (verkenning)', apply: (s) => { s.v2.__xo3Steps = '5'; } }, { name: 'steps=5 (vol veld)', apply: (s) => { s.v2.__xo3Steps = '5'; s.v2.fieldMode = 'full'; } }] },
];

/* ================================================================== *
 * 6 — HET RAPPORT (laag b): de vensters, de poorten en elke metriek
 * ================================================================== */
interface ReportPerturbation {
  row: string;
  label: string;
  apply: (st: DemoBundleState) => void;
}
/** Eén driverrij van de kast, als strings; een ontbrekende rij leest leeg (de bundel zwijgt). */
const drv = (st: DemoBundleState, r: 'low' | 'mid' | 'high'): Record<string, string> => {
  const d = (st.cabinet.drivers as unknown as Record<string, Record<string, string> | undefined> | undefined)?.[r];
  if (d) return d;
  const fresh: Record<string, string> = {};
  (st.cabinet as unknown as { drivers: Record<string, Record<string, string>> }).drivers ??= {} as never;
  (st.cabinet as unknown as { drivers: Record<string, Record<string, string>> }).drivers[r] = fresh;
  return fresh;
};
const meas = (role: 'low' | 'mid' | 'high', k: string, v: string) => (st: DemoBundleState) => { (st.v2Measurement[role] as unknown as Record<string, string>)[k] = v; };
const REPORT_PERTURBATIONS: ReportPerturbation[] = [
  { row: 'blTm', label: 'Bl (high)', apply: meas('high', 'blTm', '3.2') },
  { row: 'mmsG', label: 'M_ms (high)', apply: meas('high', 'mmsG', '0.4') },
  { row: 'blTm+mmsG', label: 'Bl + M_ms (high), samen', apply: (st) => { meas('high', 'blTm', '3.2')(st); meas('high', 'mmsG', '0.4')(st); } },
  { row: 'xmaxMm', label: 'X_max (high)', apply: (st) => { st.xmaxMm.high = '0.5'; } },
  { row: 'sd', label: 'S_d (high)', apply: (st) => { st.sdCm2.high = String(Number(st.sdCm2.high || '6') * 2); } },
  { row: 'powerRating', label: 'Power rating (3 velden, high)', apply: (st) => { meas('high', 'ratedPowerW', '100')(st); meas('high', 'testFilterOrder', '2')(st); meas('high', 'testFilterHz', '2200')(st); } },
  { row: 'powerRating', label: 'Power rating (alleen W, high)', apply: meas('high', 'ratedPowerW', '100') },
  { row: 'minCrossover', label: 'Recommended min crossover (high)', apply: meas('high', 'minCrossoverHz', '2200') },
  { row: 'minCrossover', label: 'Min crossover ORDE zonder Hz (high)', apply: meas('high', 'minCrossoverOrder', '2') },
  { row: 'maxCrossover', label: 'Recommended max crossover (mid)', apply: meas('mid', 'maxCrossoverHz', '1500') },
  { row: 'maxCrossoverOverride', label: 'Max crossover replaces breakup (mid, mét max)', apply: (st) => { meas('mid', 'maxCrossoverHz', '4000')(st); meas('mid', 'maxCrossoverOverride', 'yes')(st); } },
  { row: 'maxCrossoverOverride', label: 'Override ZONDER max (mid)', apply: meas('mid', 'maxCrossoverOverride', 'yes') },
  { row: 'breakupDivisor', label: 'Breakup divisor (mid)', apply: meas('mid', 'breakupDivisor', '2') },
  { row: 'breakupDivisor', label: 'Breakup divisor note alleen (mid)', apply: meas('mid', 'breakupDivisorNote', 'tweetoon 22-09') },
  { row: 'measuredRe', label: 'Measured R_e (low)', apply: meas('low', 'reOhm', '3.05') },
  { row: 'rotSym', label: 'Rotational symmetry (high)', apply: meas('high', 'rotSym', 'no') },
  { row: 'rotSym', label: 'Rotational symmetry mét verticaal venster 15°', apply: (st) => { st.engineV2.verticalWindowDeg = '15'; meas('high', 'rotSym', 'no')(st); meas('mid', 'rotSym', 'no')(st); meas('low', 'rotSym', 'no')(st); } },
  { row: 'driveVoltageV', label: 'Drive voltage + mic + volledige excursiekaart (route 2)', apply: (st) => { st.cabinet.micDistanceMm = '1000'; meas('high', 'driveVoltageV', '2.83')(st); meas('high', 'blTm', '3.2')(st); meas('high', 'mmsG', '0.4')(st); st.xmaxMm.high = '0.5'; st.engineV2.amplifierPeakPowerW = '160'; st.engineV2.amplifierNominalLoadOhm = '8'; st.engineV2.xmaxMarginFraction = '0.8'; } },
  { row: 'acousticCentre', label: 'Acoustic centre z (high)', apply: meas('high', 'zMm', '120') },
  { row: 'driveVoltageV', label: 'Drive voltage (high)', apply: meas('high', 'driveVoltageV', '2.83') },
  { row: 'wiring', label: 'Wiring measured+desired (low)', apply: (st) => { meas('low', 'wiringMeasured', 'parallel')(st); meas('low', 'wiringDesired', 'series')(st); } },
  { row: 'wiring', label: 'Wiring alleen gemeten (low)', apply: meas('low', 'wiringMeasured', 'parallel') },
  { row: 'coilFamily', label: 'Coil family (low)', apply: meas('low', 'coilFamily', 'Jantzen|Air Core|1.4') },
  { row: 'driveOnFsMaxDb-per-way', label: 'M-C per way (high)', apply: meas('high', 'driveOnFsMaxDb', '-20') },
  { row: 'manualWindow', label: 'Manual window floor (high)', apply: meas('high', 'floorHz', '800') },
  { row: 'manualWindow', label: 'Window note alleen (high)', apply: meas('high', 'windowNote', 'u9') },
  { row: 'nominalSize', label: 'Nominal size (mid, inch)', apply: (st) => { st.sizeInch.mid = '5'; } },
  { row: 'positions', label: 'Driver y position (high)', apply: (st) => { drv(st, 'high').yMm = String(Number(drv(st, 'high').yMm || '0') + 40); } },
  { row: 'baffle-width', label: 'Baffle width', apply: (st) => { st.cabinet.baffleWidthMm = String(Number(st.cabinet.baffleWidthMm || '260') + 60); } },
  { row: 'baffle-width', label: 'Baffle width onder plateau-voicing', apply: (st) => { st.targetCurve = { type: 'bass-plateau', plateauDepthDb: 2.5 } as never; st.cabinet.baffleWidthMm = String(Number(st.cabinet.baffleWidthMm || '260') + 60); } },
  { row: 'sourceCount', label: 'Count (low)', apply: (st) => { drv(st, 'low').count = '1'; } },
  { row: 'sourceCount', label: 'Spacing (low)', apply: (st) => { drv(st, 'low').spacingMm = String(Number(drv(st, 'low').spacingMm || '200') + 50); } },
  { row: 'mounting', label: 'Depth (high)', apply: (st) => { drv(st, 'high').depthMm = '12'; } },
  { row: 'mounting', label: 'Tilt (high)', apply: (st) => { (drv(st, 'high') as unknown as Record<string, string>).tiltDeg = '10'; } },
  { row: 'mounting', label: 'Facing (high)', apply: (st) => { (drv(st, 'high') as unknown as Record<string, string>).facing = 'top'; } },
  { row: 'chamber', label: 'Enclosure / f_b (low)', apply: (st) => { (drv(st, 'low') as unknown as Record<string, string>).fbHz = '30'; } },
  { row: 'micDistance', label: 'Mic distance', apply: (st) => { st.cabinet.micDistanceMm = '500'; } },
  { row: 'micDistance+driveVoltageV', label: 'Mic distance mét drive voltage', apply: (st) => { st.cabinet.micDistanceMm = '500'; meas('high', 'driveVoltageV', '2.83')(st); } },
  { row: 'micElevation', label: 'Mic elevation', apply: (st) => { (st.cabinet as unknown as Record<string, string>).micElevationDeg = '5'; } },
  { row: 'gateOverride', label: 'Gate used (ms)', apply: (st) => { (st.cabinet as unknown as Record<string, string>).gateMs = '4.5'; } },
  { row: 'baffleHeight', label: 'Front panel height', apply: (st) => { st.cabinet.baffleHeightMm = '1200'; } },
  { row: 'referencePoint', label: 'Reference from top', apply: (st) => { st.cabinet.refFromTopMm = String(Number(st.cabinet.refFromTopMm || '244') + 50); } },
  { row: 'refDriver', label: 'Reference driver', apply: (st) => { (st.cabinet as unknown as Record<string, string>).refDriver = 'high'; } },
  { row: 'listeningPosition', label: 'Listening distance', apply: (st) => { (st.cabinet as unknown as Record<string, string>).listenDistanceM = '3'; } },
  { row: 'cabinetDepth', label: 'Cabinet depth', apply: (st) => { (st.cabinet as unknown as Record<string, string>).cabinetDepthMm = '400'; } },
  // --- v2-paneelvelden die het RAPPORT bereiken ---
  { row: 'verticalWindowDeg', label: 'Vertical window (deg)', apply: (st) => { st.engineV2.verticalWindowDeg = '15'; } },
  { row: 'amplifierPowerW', label: 'Amplifier continuous power', apply: (st) => { st.engineV2.amplifierPowerW = '100'; } },
  { row: 'xmaxMarginFraction', label: 'X_max margin', apply: (st) => { st.engineV2.xmaxMarginFraction = '0.8'; } },
  { row: 'xmaxMarginFraction+peak', label: 'X_max margin + peak/nominal + Bl/M_ms/X_max (high)', apply: (st) => { st.engineV2.xmaxMarginFraction = '0.8'; st.engineV2.amplifierPeakPowerW = '160'; st.engineV2.amplifierNominalLoadOhm = '8'; meas('high', 'blTm', '3.2')(st); meas('high', 'mmsG', '0.4')(st); st.xmaxMm.high = '0.5'; } },
  { row: 'targetCurve', label: 'Voicing bass-plateau 2.5 dB', apply: (st) => { st.targetCurve = { type: 'bass-plateau', plateauDepthDb: 2.5 } as never; } },
  { row: 'targetCurve', label: 'Voicing bass-plateau zonder diepte', apply: (st) => { st.targetCurve = { type: 'bass-plateau' } as never; } },
  // --- de v2-poort- en budgetvelden: ook het RAPPORT oordeelt erop ---
  { row: 'maxDissipationPct', label: 'Max dissipation (rapport)', apply: (st) => { st.engineV2.maxDissipationPct = '35'; } },
  { row: 'minEpdrOhm', label: 'Min EPDR (rapport)', apply: (st) => { st.engineV2.minEpdrOhm = '1.6'; } },
  { row: 'maxDriveOnFsDb', label: 'Max drive on f_s (rapport)', apply: (st) => { st.engineV2.maxDriveOnFsDb = '-20'; } },
  { row: 'resistorClassW', label: 'Resistor class zonder marge (rapport)', apply: (st) => { st.engineV2.resistorClassW = '10'; } },
  { row: 'resistorClassW', label: 'Resistor class + marge (rapport)', apply: (st) => { st.engineV2.resistorClassW = '10'; st.engineV2.resistorPowerMargin = '0.5'; } },
  { row: 'resistorPowerMargin', label: 'Resistor margin zonder klasse (rapport)', apply: (st) => { st.engineV2.resistorPowerMargin = '0.5'; } },
  { row: 'coilClassA', label: 'Coil class (rapport)', apply: (st) => { st.engineV2.coilClassA = '5'; } },
  { row: 'resistorThermalPowerW', label: 'Resistor thermal power (rapport)', apply: (st) => { st.engineV2.resistorThermalPowerW = '10'; } },
  { row: 'lfBumpBudgetDb', label: 'LF-bump budget (rapport)', apply: (st) => { st.engineV2.lfBumpBudgetDb = '1.4'; } },
  { row: 'qesMultiplierMax', label: 'Q_es max (rapport)', apply: (st) => { st.engineV2.qesMultiplierMax = '2.4'; } },
  { row: 'dampingMarginDb', label: 'Damping margin (rapport)', apply: (st) => { st.engineV2.dampingMarginDb = '1.5'; } },
  { row: 'lowestWayLevelWork', label: 'Level work none (rapport)', apply: (st) => { st.engineV2.lowestWayLevelWork = 'none'; } },
  { row: 'amplifierPeakPowerW', label: 'Peak power alleen (rapport)', apply: (st) => { st.engineV2.amplifierPeakPowerW = '160'; } },
  { row: 'amplifierPeakPowerW+nominal', label: 'Peak + nominal (rapport)', apply: (st) => { st.engineV2.amplifierPeakPowerW = '160'; st.engineV2.amplifierNominalLoadOhm = '8'; } },
  { row: 'ampMinLoadOhm', label: 'Amplifier minimum load (rapport)', apply: (st) => { st.ampMinLoadOhm = 2.6; } },
];

/** De ReportSettings zoals `buildV2Report` in App.tsx ze uit de staat bouwt (spiegel). */
function reportFromState(st: DemoBundleState, chain: ChainState, net: VxpPart[] | null = null): EngineV2Report {
  const roles = st.ways === 3 ? (['low', 'mid', 'high'] as const) : (['low', 'high'] as const);
  const asResponse = (name: string, raw: string): AdapterResponse => {
    const f = parseFrd(raw);
    return { name, freq: f.freq, spl: f.spl, phaseDeg: f.phase, comments: f.meta.rawComments };
  };
  const stated = (raw: string | undefined) => {
    if (raw === undefined || raw.trim() === '') return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? v : undefined;
  };
  const branches: AdapterBranch[] = [];
  for (const role of roles) {
    const on = st.onAxis[role];
    const zf = st.impedance[role];
    if (!on && !zf) continue;
    const m = st.v2Measurement[role] as unknown as Record<string, string>;
    const z = zf ? parseZma(zf.raw) : null;
    const xmax = stated(st.xmaxMm[role]);
    const sd = stated(st.sdCm2[role]);
    const bl = stated(m.blTm);
    const mms = stated(m.mmsG);
    const count = Number(drv(st, role).count ?? '');
    const card = {
      ...(xmax !== undefined && xmax > 0 ? { xMaxMm: xmax } : {}),
      ...(sd !== undefined && sd > 0 ? { sdCm2: sd } : {}),
      ...(bl !== undefined && bl > 0 ? { blTm: bl } : {}),
      ...(mms !== undefined && mms > 0 ? { mmsG: mms } : {}),
      ...(Number.isFinite(count) && count > 1 ? { parallelCount: count } : {}),
      source: 'u9',
    };
    const ref = stated(m.refTimeMs);
    const right = stated(m.rightWindowMs);
    const floor = stated(m.floorHz);
    const mw = ref === undefined && right === undefined && floor === undefined ? undefined : {
      ...(ref !== undefined ? { referenceTimeMs: ref } : {}),
      ...(right !== undefined ? { rightWindowMs: right } : {}),
      ...(floor !== undefined && floor > 0 ? { validityFloorHz: floor } : {}),
      ...(m.windowNote.trim() !== '' ? { note: m.windowNote.trim() } : {}),
    };
    const pr = stated(m.ratedPowerW) && stated(m.testFilterOrder) && stated(m.testFilterHz)
      ? { ratedPowerW: Number(m.ratedPowerW), testFilterOrder: Number(m.testFilterOrder), testFilterHz: Number(m.testFilterHz), source: 'u9' }
      : undefined;
    const minHz = stated(m.minCrossoverHz);
    const maxHz = stated(m.maxCrossoverHz);
    const div = stated(m.breakupDivisor);
    const re = stated(m.reOhm);
    const driveV = stated(m.driveVoltageV);
    const micMm = Number(st.cabinet.micDistanceMm);
    const per = stated(m.driveOnFsMaxDb);
    const okW = (v: string) => v === 'parallel' || v === 'series';
    const size = role === 'high' ? undefined : stated(st.sizeInch[role]);
    branches.push({
      role,
      onAxis: on ? asResponse(on.name, on.raw) : null,
      offAxis: st.angles[role].map((a) => ({ hor: a.hor, response: asResponse(a.file.name, a.file.raw) })),
      nearField: st.nearField[role].cone ? [asResponse(st.nearField[role].cone!.name, st.nearField[role].cone!.raw)] : [],
      impedance: z && zf ? { name: zf.name, freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase } : null,
      ...(size !== undefined && size > 0 ? { diameterInch: size } : {}),
      ...(re !== undefined && re > 0 ? { measuredReOhm: re } : {}),
      ...(mw ? { manualWindow: mw } : {}),
      ...(Object.keys(card).length > 1 ? { driverCard: card } : {}),
      ...(per !== undefined ? { driveOnFsMaxDb: per } : {}),
      ...(pr ? { powerRating: pr } : {}),
      ...(minHz && minHz > 0 ? { minCrossover: { hz: minHz, ...(stated(m.minCrossoverOrder) ? { order: Number(m.minCrossoverOrder) } : {}), source: 'u9' } } : {}),
      ...(maxHz && maxHz > 0 ? { maxCrossover: { hz: maxHz, ...(m.maxCrossoverOverride === 'yes' ? { overridesBreakup: true } : {}), source: 'u9' } } : {}),
      ...(div && div > 0 ? { breakupDivisor: { value: div, ...(m.breakupDivisorNote.trim() ? { measuredOn: m.breakupDivisorNote.trim() } : {}) } } : {}),
      ...(okW(m.wiringMeasured) && okW(m.wiringDesired) ? { wiring: { count: Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1, measured: m.wiringMeasured as never, desired: m.wiringDesired as never, source: 'u9' } } : {}),
      ...(m.coilFamily.trim() !== '' ? { coilFamily: m.coilFamily.trim() } : {}),
      ...(driveV !== undefined && driveV > 0 && micMm > 0 ? { responseDrive: { driveVoltageV: driveV, micDistanceMm: micMm, source: 'u9' } } : {}),
    } as AdapterBranch);
  }
  const mm = (v: string | undefined) => (v ? (Number.isFinite(Number(v)) ? Number(v) : undefined) : undefined);
  const centre = (r: 'low' | 'mid' | 'high') => stated((st.v2Measurement[r] as unknown as Record<string, string>).zMm) ?? mm(drv(st, r).yMm);
  const cnt = (r: 'low' | 'mid' | 'high') => { const n = Number(drv(st, r).count ?? ''); return Number.isFinite(n) && n >= 1 ? n : undefined; };
  const sym: Record<string, boolean> = {};
  for (const r of roles) { const v = (st.v2Measurement[r] as unknown as Record<string, string>).rotSym; if (v === 'yes') sym[r] = true; if (v === 'no') sym[r] = false; }
  const geometry: AdapterGeometry = {
    verticalMm: { low: centre('low'), mid: centre('mid'), high: centre('high') },
    rotationallySymmetric: sym,
    arraySpacingMm: Object.fromEntries((['low', 'mid', 'high'] as const).map((r) => [r, Number(drv(st, r).count ?? '') > 1 ? mm(drv(st, r).spacingMm) : undefined])),
    sourceCount: { low: cnt('low'), mid: cnt('mid'), high: cnt('high') },
    baffleWidthMm: mm(st.cabinet.baffleWidthMm),
    depthMm: Object.fromEntries((['low', 'mid', 'high'] as const).map((r) => [r, mm(drv(st, r).depthMm)])),
  };
  const v2 = st.engineV2 as unknown as Record<string, string>;
  const limits = limitsOf(v2);
  const { runSeed: _a, runBudgetEvals: _b, ...lim } = limits;
  void _a; void _b;
  const orderFrom = (a: string, b: string) => {
    const vals = [a, b].filter((x) => x !== 'auto').map(Number).filter((x) => Number.isFinite(x) && x > 0);
    return vals.length ? Math.max(1, Math.min(4, Math.round(Math.max(...vals) / 6))) : undefined;
  };
  const filter = net ? { name: 'u9', netlist: crossoverToNetlist({ name: 'u9', parts: [...net] } as never).netlist } : null;
  const ids = resolveDriverIds(branches, filter?.netlist ?? null).ids;
  const orderByPair: Record<string, number> = {};
  if (st.ways === 3) { const o = orderFrom(chain.acSlopeWoofer, chain.acSlopeMidHp); if (o) orderByPair[ctcKey(ids.low ?? 'low', ids.mid ?? 'mid')] = o; }
  const oh = orderFrom(chain.acSlopeMid, chain.acSlopeTweeter);
  if (oh) orderByPair[ctcKey(st.ways === 3 ? ids.mid ?? 'mid' : ids.low ?? 'low', ids.high ?? 'high')] = oh;
  const angles = (v2.verticalWindowDeg ?? '').split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v) && v !== 0 || false);
  const power = Number(v2.amplifierPowerW);
  const settings: ReportSettings = {
    ...(angles.length ? { verticalWindowDeg: angles } : {}),
    ...(v2.amplifierPowerW && power > 0 ? { amplifierPowerW: power } : {}),
    ...(Object.keys(orderByPair).length ? { orderByPair } : {}),
    targetCurve: (st.targetCurve ?? { type: 'flat' }) as never,
    ...Object.fromEntries(Object.entries({ ...lim, ...(st.ampMinLoadOhm !== null ? { ampMinLoadOhm: st.ampMinLoadOhm } : {}) }).filter(([, v]) => v !== undefined)),
  } as ReportSettings;
  const built = buildEngineV2Input({ sessionId: st.id, branches, filter, geometry, settings });
  return buildReport(built.input);
}

/** Wat een rapport-diff ziet, gesplitst naar wat het betekent. */
function reportParts(r: EngineV2Report) {
  const windows = hash(stableJson(r.predesign.windowInputs));
  const predesign = hash(stableJson(r.predesign));
  const gates = hash(stableJson(r.gates));
  const metrics = hash(stableJson(r.metrics));
  const rest = hash(stableJson({ ...r, predesign: null, gates: null, metrics: null, engine: null }));
  /* wat het rapport als GEMETEN FEIT naar het verzoek stuurt (`factsForWorker`): excursieplafond, R_e,
   * geldigheid, resonantie, nabij veld, gap-budgetten. Een verschil hier is een verschil in de payload. */
  const ids = Object.fromEntries(r.driversLowToHigh.map((d) => [d, d]));
  const facts = hash(stableJson(factsForWorker(r, ids)));
  /* V49 — een afgeleid excursieplafond bereikt het verzoek óók via de verklaring (`driveCeilingDerived` →
   * protectionRule 'stated'), niet alleen als feit. */
  const excursion = hash(stableJson(r.metrics.driveExcursion.map((d) => [d.driver, d.ceiling.ceilingDbReInput])));
  return { windows, facts, excursion, predesign, gates, metrics, rest };
}

/* ================================================================== *
 * 7 — DRAAIEN
 * ================================================================== */
interface Row {
  row: string;
  label: string;
  route: string;
  arm: string;
  layer: 'payload' | 'rapport';
  field: boolean;
  design: string[];
  tuner: string[];
  v2run: string[];
  report: string[];
  klasse: 'ZOEKT' | 'OORDEELT' | 'NIETS';
  error?: string;
}

function snapshot(): AppSnapshot {
  return { chain: { ...CHAIN_DEFAULTS }, v2: { ...EMPTY_V2 }, perWayDriveDb: {}, coilFamilyByModel: {} };
}

function main(): void {
  assertMirror();
  installObservers();
  const rows: Row[] = [];
  const B = benches();
  const routeName: Record<Route, string> = { '3w': 'drieweg · casus 1 (m3)', '2w': 'tweeweg · casus 1b', hyb: 'hybride gemeten · casus 1h' };
  for (const route of ['3w', '2w', 'hyb'] as Route[]) {
    const { bench, seed } = B[route];
    seedParts = seed;
    const base = measure(route, snapshot(), bench);
    for (const p of PERTURBATIONS.filter((x) => x.routes.includes(route))) {
      for (const arm of p.arms) {
        const s = snapshot();
        arm.apply(s);
        let m: Measured;
        try {
          m = measure(route, s, bench);
        } catch (e) {
          rows.push({ row: p.row, label: p.label, route: routeName[route], arm: arm.name, layer: 'payload', field: false, design: [], tuner: [], v2run: [], report: [], klasse: 'NIETS', error: String((e as Error).message).slice(0, 200) });
          continue;
        }
        const field = m.fieldKey !== base.fieldKey;
        const design = changedKeys(base.design, m.design);
        const tuner = changedKeys(base.tuner, m.tuner);
        const v2run = changedKeys(base.v2run, m.v2run).flatMap((k) => changedKeys((base.v2run[k] ?? {}) as Record<string, unknown>, (m.v2run[k] ?? {}) as Record<string, unknown>).map((x) => `${k}.${x}`));
        const klasse = field || design.length || tuner.length || v2run.length ? 'ZOEKT' : 'NIETS';
        rows.push({ row: p.row, label: p.label, route: routeName[route], arm: arm.name, layer: 'payload', field, design, tuner, v2run, report: [], klasse });
      }
    }
  }
  /* laag (b): de demobundels door het app-pad */
  const netOf = (p: string) => (JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as { parts: VxpPart[] }).parts;
  const demos: [string, DemoBundle, VxpPart[] | null][] = [
    ['drieweg · KOAN-demo', KOAN_3WAY_BUNDLE, null],
    ['drieweg · KOAN-demo + netwerk', KOAN_3WAY_BUNDLE, netOf('test-fixtures/casus1/KAND-V2-1.adsfilter.json')],
    ['tweeweg · KOAN-demo', KOAN_2WAY_DEMO, null],
    ['tweeweg · KOAN-demo + netwerk', KOAN_2WAY_DEMO, netOf('test-fixtures/casus1b/KAND-V2-1.adsfilter.json')],
  ];
  for (const [name, bundle, net] of demos) {
    const baseState = demoBundleState(bundle);
    const base = reportParts(reportFromState(structuredClone(baseState), CHAIN_DEFAULTS, net));
    const chainArms: [string, string, Partial<ChainState>][] = [
      ['geen:acSlopeMid', 'Acoustic slope mid (LP) → orderByPair', { acSlopeMid: '12' }],
      ['geen:acSlopeTweeter', 'Acoustic slope tweeter (HP) → orderByPair', { acSlopeTweeter: '24', acSlopeMid: '24' }],
      ['geen:acSlopeWoofer', 'Acoustic slope woofer → orderByPair', { acSlopeWoofer: '12', acSlopeMidHp: '12' }],
    ];
    const all: { row: string; label: string; st: DemoBundleState; chain: ChainState }[] = [
      ...REPORT_PERTURBATIONS.map((p) => { const st = structuredClone(baseState); p.apply(st); return { row: p.row, label: p.label, st, chain: CHAIN_DEFAULTS }; }),
      ...chainArms.map(([row, label, c]) => ({ row, label, st: structuredClone(baseState), chain: { ...CHAIN_DEFAULTS, ...c } })),
    ];
    for (const a of all) {
      let parts: ReturnType<typeof reportParts>;
      try {
        parts = reportParts(reportFromState(a.st, a.chain, net));
      } catch (e) {
        rows.push({ row: a.row, label: a.label, route: name, arm: '—', layer: 'rapport', field: false, design: [], tuner: [], v2run: [], report: [], klasse: 'NIETS', error: String((e as Error).message).slice(0, 200) });
        continue;
      }
      const changed = (Object.keys(base) as (keyof typeof base)[]).filter((k) => base[k] !== parts[k]);
      const field = changed.includes('windows');
      const zoekt = field || changed.includes('facts') || changed.includes('excursion');
      rows.push({ row: a.row, label: a.label, route: name, arm: '—', layer: 'rapport', field, design: [], tuner: [], v2run: [], report: changed, klasse: zoekt ? 'ZOEKT' : changed.length ? 'OORDEELT' : 'NIETS' });
    }
  }
  writeFileSync(OUT, JSON.stringify({ format: 'u9-field-effects/1', gemeten_op: new Date().toISOString().slice(0, 10), rows }, null, 1) + '\n');
  const fmt = (r: Row) => `${r.klasse.padEnd(8)} ${r.route.padEnd(28)} ${r.label.slice(0, 52).padEnd(52)} ${r.arm.slice(0, 30).padEnd(30)} ${r.error ? `FOUT ${r.error}` : [r.field ? 'veld' : '', r.design.length ? `ontwerp[${r.design.join(',')}]` : '', r.tuner.length ? `tuner[${r.tuner.join(',')}]` : '', r.v2run.length ? `v2[${r.v2run.join(',')}]` : '', r.report.length ? `rapport[${r.report.join(',')}]` : ''].filter(Boolean).join(' ')}`;
  for (const r of rows) console.log(fmt(r));
  console.log(`\n${rows.length} metingen → ${OUT}`);
}

main();
