/**
 * A5e.3b (a) — WAT IS DE VAL WAARD? De ablatie van de gedempte val op de
 * bovenste reflexpiek, gemeten op KAND_V2_5 (354,9 · 1994,6 → levering
 * 479/1974; de val is L5 27,85 mH + C6 279,9 µF naar massa — geen discrete R:
 * het koper van L5, 2,118 Ω uit de gestelde familiefit, is de demping).
 *
 * `npx vite-node scripts/measure-a5e3b-ablatie.ts` — VIER ARMEN, waarvan twee
 * een WAARDETUNE zijn (10–25 min per stuk, parallel als kindproces;
 * `A5E3B_ARM=herpolijst|bouwbaar` draait er één, bestaande armbestanden in
 * `test-fixtures/casus1_a5e3b_ablatie/` worden gelezen, `A5E3B_REDO=1`
 * overschrijft):
 *
 *   1. `met-val`      — KAND_V2_5 zoals geleverd. Geen tune.
 *   2. `zonder-val`   — L5/C6 geableerd zoals de snoeipas dat doet (shunt →
 *                       open, `ablateGroup` uit v38-groups), alle andere
 *                       waarden VAST. Geen tune.
 *   3. `herpolijst`   — dezelfde ablatie, daarna een WAARDEN-ONLY hertune op
 *                       de vaste topologie zonder de val, met dezelfde eisen
 *                       als de generator: de poorthook (M-B/|Z|, M-C, M-A/part
 *                       …), de zoekdoos (A5d.6-inversies plus sinds A5e.3b de
 *                       familie-spanwijdte), de barrière, de doelcurve, het
 *                       DCR-model — alles wat `handleV2Request` voor deze
 *                       kandidaat stelt, geoogst via de echte
 *                       `hooks.tuneOptionsFor` op het geableerde zaad. Dit is
 *                       de eerlijke vergelijking: wat de zoektocht zonder de
 *                       val haalt.
 *   4. `bouwbaar`     — de val blijft, maar L5 start op de familie-spanwijdte
 *                       (22,0 mH, het grootste enkele onderdeel van de
 *                       gestelde 1,4 mm-familie) en de zoekdoos houdt hem
 *                       eronder (de (b)1-cap); zelfde waardetune. Is een
 *                       halve val genoeg?
 *
 * WAT DE TUNE-ARMEN BEWUST NIET DRAGEN, en dat is de v38-bank-les hardop:
 * `staged` (de trapsmethode escaleert ONDERDELEN — een ablatie met een
 * escalatie ernaast meet niets) en `branchTargets` (de leash komt uit de
 * ontwerpstap, die hier niet draait: de topologie is gegeven). De
 * onderdelenaudit blijft AAN (een bescherming, V26 rij 33) en kan alleen
 * snoeien, nooit toevoegen; wat zij wegneemt staat in de armuitvoer.
 *
 * ELKE ARM DOOR ÉÉN MEETBANK (de gemergede set, de doelcurve, het gestelde
 * DCR-model, de gestelde eisen — `corpusBank`-instellingen): min |Z| met tak
 * en frequentie, opslingering en lift (M-D), RMS op de volle oordeelband en
 * vanaf de rapportband (397 Hz), M-K per paar, M-C per beschermde weg,
 * dissipatie, en het BOM-verschil in euro's uit de catalogus die de familie
 * stelt (goedkoopste realisatie, stapels toegestaan voor de val van arm 1 —
 * dat een stapel nodig is, is precies de bevinding van (b)1).
 *
 * GEEN BESLUIT: dit script meet, de tabel gaat naar Sander (A5e.3b (a)).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { logspace, resampleImpedance } from '../src/lib/dsp.ts';
import type { Complex } from '../src/lib/complex.ts';
import { solveNetwork } from '../src/lib/network.ts';
import { crossoverToNetlist } from '../src/lib/vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../src/lib/parsers/vxp.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../src/lib/netOptimizer.ts';
import * as chainModule from '../src/lib/threeWayChain.ts';
import type { Chain3Input, Chain3Result, ChainEngineHooks } from '../src/lib/threeWayChain.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { decompose, ablateGroup, type Group } from './v38-groups.ts';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1CoilCatalogPath,
  casus1Files,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LOWEST_WAY_COIL_SPAN_H,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const OUT_DIR = join(HERE, '..', 'test-fixtures', 'casus1_a5e3b_ablatie');
/** De kandidaat van deze meting (de opdracht van de sessie). */
const SUBJECT_KEY = 'KAND_V2_5';
const SUBJECT_XO: [number, number] = [354.9, 1994.6];
/** Tolerantie waarbinnen een BOM-realisatie de waarde moet dekken. */
const BOM_TOLERANCE = 0.05;

const golden = loadGolden();
const bank = corpusBank(golden, 'merged');
const netlists = (golden.manifest_en_geometrie as unknown as { netlists: Record<string, string> }).netlists;

/* ---- de meetbank: één rapport per arm, dezelfde vector als measure-a5e3-field ---- */
const DIAG_GRID_HZ: [number, number] = [20, 20000]; // P6-OK: audiobereik
const DIAG_GRID_POINTS = 600;
const grid = logspace(DIAG_GRID_HZ[0], DIAG_GRID_HZ[1], DIAG_GRID_POINTS);
const driverZ: Record<string, Complex[]> = (() => {
  const probe = casus1FilterFromParts('probe', [], bank.manifest, bank.files);
  const out: Record<string, Complex[]> = {};
  for (const [drv, z] of Object.entries(probe.driverZ)) out[drv] = resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z;
  return out;
})();

function solveMin(parts: readonly VxpPart[]): { ohm: number; hz: number; idx: number; mag: number[] } | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'abl', parts: [...parts] } as VxpCrossover);
    const mag = solveNetwork(netlist, grid, driverZ).inputZ.map((c) => Math.hypot(c.re, c.im));
    let i = 0;
    for (let k = 1; k < mag.length; k++) if (mag[k] < mag[i]) i = k;
    return { ohm: mag[i], hz: grid[i], idx: i, mag };
  } catch {
    return null;
  }
}
function branchOnly(parts: readonly VxpPart[], groups: readonly Group[], branch: string): VxpPart[] {
  const keep = new Set<string>();
  for (const g of groups) if (g.branch === branch) for (const id of g.partIds) keep.add(id);
  return parts.filter(
    (p) => p.type === 'Generator' || p.type === 'Ground' || p.type === 'Wire' || (p.type === 'Driver' && p.model === branch) || (p.partId !== undefined && keep.has(p.partId)),
  );
}
function minZWithBranch(parts: readonly VxpPart[]): { ohm: number; hz: number; branch: string } | null {
  const sum = solveMin(parts);
  if (!sum) return null;
  const groups = decompose(parts);
  const branches = [...new Set(groups.map((g) => g.branch).filter((b) => b !== ''))];
  let lowest: { branch: string; ohm: number } | null = null;
  for (const b of branches) {
    const c = solveMin(branchOnly(parts, groups, b));
    if (c && (!lowest || c.mag[sum.idx] < lowest.ohm)) lowest = { branch: b, ohm: c.mag[sum.idx] };
  }
  return { ohm: sum.ohm, hz: sum.hz, branch: lowest?.branch ?? '?' };
}

interface ArmVector {
  arm: string;
  parts: VxpPart[];
  crossingsHz: number[];
  minZ: { ohm: number; hz: number; branch: string } | null;
  gateMinZ: number | null;
  floorPass: boolean | null;
  resonantDb: number | null;
  liftDb: number | null;
  rmsFull: number | null;
  windowFull: number | null;
  rms397: number | null;
  window397: number | null;
  mk: { pair: string; deg: number }[];
  mc: { way: string; db: number; limit: number | null; pass: boolean }[];
  dissPct: number | null;
  trap: { lMh: number | null; cUf: number | null; rOhm: number | null; dcrOhm: number | null };
  tune: { evaluations: number; audited: string[] } | null;
}

/** De val op dit netwerk: de shunt-keten op de wooferbus met L én C, gestemd in het reflexgebied. */
function trapGroupOf(parts: readonly VxpPart[]): Group | null {
  const groups = decompose(parts);
  const traps = groups.filter(
    (g) => g.position === 'shunt' && g.branch === 'woofer' && g.fHz !== null && g.fHz < 100 && g.partIds.some((id) => id.startsWith('L')),
  );
  return traps.length === 1 ? traps[0] : null;
}

function measureArm(arm: string, parts: VxpPart[], tune: ArmVector['tune']): ArmVector {
  const rep: EngineV2Report = buildReport({
    manifest: bank.manifest,
    files: bank.files,
    filter: casus1FilterFromParts(arm, parts, bank.manifest, bank.files),
    geometry: bank.geometry,
    settings: bank.settings,
  });
  const gateZ = rep.gates.verdicts.find((v) => v.gate === 'M-B/|Z|');
  const full = rep.analysisGrid && rep.system.sumDb ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ) : null;
  const g = trapGroupOf(parts);
  const val = (id: string, name: string): number | null => {
    const p = parts.find((q) => q.partId === id);
    const v = p?.params.find((q) => q.name === name)?.value;
    return typeof v === 'number' ? v : null;
  };
  const active = (id: string): boolean => {
    const p = parts.find((q) => q.partId === id);
    return p !== undefined && !p.open && !p.shorted;
  };
  const trapL = g?.partIds.find((id) => id.startsWith('L') && active(id)) ?? null;
  const trapC = g?.partIds.find((id) => id.startsWith('C') && active(id)) ?? null;
  const trapR = g?.partIds.find((id) => id.startsWith('R') && active(id)) ?? null;
  return {
    arm,
    parts,
    crossingsHz: rep.crossings.map((c) => c.fHz),
    minZ: minZWithBranch(parts),
    gateMinZ: gateZ?.value ?? null,
    floorPass: gateZ?.value !== null && gateZ !== undefined ? gateZ.pass : null,
    resonantDb: rep.metrics.lfBump[0]?.result.resonantDb ?? null,
    liftDb: rep.metrics.lfBump[0]?.result.liftDb ?? null,
    rmsFull: full?.rmsDeviationDb ?? null,
    windowFull: full?.windowPlusMinusDb ?? null,
    rms397: rep.system.response?.rmsDeviationDb ?? null,
    window397: rep.system.response?.windowPlusMinusDb ?? null,
    mk: rep.system.phaseTracking.map((p) => ({ pair: `${p.lower}→${p.upper}`, deg: p.meanAbsDeg })),
    mc: rep.gates.verdicts.filter((v) => v.gate === 'M-C' && v.value !== null).map((v) => ({ way: v.subject, db: v.value as number, limit: v.limit, pass: v.pass })),
    dissPct: rep.metrics.dissipation ? rep.metrics.dissipation.totalFraction * 100 : null,
    trap: {
      lMh: trapL ? val(trapL, 'L') : null,
      cUf: trapC ? val(trapC, 'C') : null,
      rOhm: trapR ? val(trapR, 'R') : null,
      dcrOhm: trapL ? val(trapL, 'DCR') : null,
    },
    tune,
  };
}

/* ---- de tune-arm: de echte worker-opties op een eigen zaad ---------------- */
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
/** Het A5e.3-VELD (zonder het gestelde M-C-getal in de vensters): het veld
 *  waaruit KAND_V2_5 komt — de kandidaatverklaring hoort bij zijn herkomst. */
const fieldReport = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('veld', [], manifest, files),
  geometry,
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION,
  },
});
const factsReport = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('facts', [], manifest, files),
  geometry,
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION,
  },
});
const facts = casus1V2Facts(factsReport, manifest, files);
const gridded = casus1ChainInput(manifest, files, golden);
const candidate = ((): GeneratedCandidate => {
  const field = casus1Field(fieldReport);
  const hit = field.field.candidates.find(
    (c) => Math.abs(c.crossings[0].hz - SUBJECT_XO[0]) < 0.5 && Math.abs(c.crossings[1].hz - SUBJECT_XO[1]) < 0.5,
  );
  if (!hit) throw new Error(`het A5e.3-veld kent geen kandidaat op ${SUBJECT_XO.join('·')}`);
  return hit;
})();

function payloadFor(c: GeneratedCandidate): V2Chain3Payload {
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
      ...CASUS1_V2_SETTINGS,
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
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1V2Declaration(c, gridded.safety),
  };
}

/**
 * De waarden-only hertune: de keten wordt vervangen door een stomp die (1) de
 * ketenlaag-opties uit `input.settings` opbouwt zoals `runThreeWayChain` dat
 * doet — zonder `staged` en zonder `branchTargets`, zie de kop — en (2) de
 * worker-opties oogst via de ECHTE `hooks.tuneOptionsFor` op ons eigen zaad,
 * zodat poorten, zoekdoos, barrière, doelcurve en DCR-model exact zijn wat de
 * generator voor deze kandidaat stelt. De stomp gooit daarna een sentinel: de
 * post-verwerking van de worker gaat over een ketenlevering die hier niet
 * bestaat.
 */
class TuneDone extends Error {
  constructor(public readonly net: ReturnType<typeof optimizeNetworkValues>) {
    super('tune-done');
  }
}
function valueTune(seed: VxpPart[]): ReturnType<typeof optimizeNetworkValues> {
  const original = chainModule.runThreeWayChain;
  let captured: ReturnType<typeof optimizeNetworkValues> | null = null;
  const stub = (input: Chain3Input, _p?: unknown, hooks?: ChainEngineHooks): Chain3Result => {
    const s = input.settings;
    const chainOpts: Partial<NetOptimizeOptions> = {
      midBranch: { response: input.m, adjust: { ...input.midAdjust } },
      zFloorStrict: true,
      phasePriority: s.phasePriority,
      breakupGuard: s.breakupGuard,
      powerMetric: s.powerMetric,
      powerFoldWeight: s.powerFoldWeight,
      costWeight: s.costWeight,
      dissipationWeight: s.dissipationWeight,
      ampMinLoadOhm: s.ampMinLoadOhm,
      audit: s.audit,
      ampTarget: s.ampTarget,
      xoRangePairs: [input.xoLowRange ?? null, input.xoHighRange ?? null],
      xoFloorPairs: s.xoFloorPairs,
      phaseMetric: s.phaseMetric,
      catalogSnap: s.catalogSnap,
      band: s.band,
      safety: s.safety,
    };
    const workerOpts = hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seed) : {};
    const merged: Partial<NetOptimizeOptions> = { ...chainOpts, ...workerOpts };
    /* WAARDEN-ONLY: geen trapsmethode (escaleert onderdelen), topologie vast. */
    delete (merged as Record<string, unknown>).staged;
    const net = optimizeNetworkValues(seed, input.grid, input.w, input.t, input.driverZ, { ...input.tAdjust }, merged as NetOptimizeOptions);
    captured = net;
    throw new TuneDone(net);
  };
  const d = Object.getOwnPropertyDescriptor(chainModule, 'runThreeWayChain');
  if (!d || !d.configurable) throw new Error('de keten-export is niet configureerbaar; de stomp kan niet gelegd worden');
  Object.defineProperty(chainModule, 'runThreeWayChain', { configurable: true, enumerable: true, get: () => stub });
  /* De sentinel kan door de foutafhandeling van de worker gevangen worden en
   * als `error`-bericht terugkomen; het resultaat wordt daarom vóór het gooien
   * in `captured` gelegd, en beide routes komen hier samen. */
  try {
    handleV2Request(structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload: payloadFor(candidate) }), (m: V2Response) => {
      if (m.kind === 'error' && !m.message.includes('tune-done')) throw new Error(m.message);
    });
  } catch (e) {
    if (!(e instanceof TuneDone) && !(e instanceof Error && e.message.includes('tune-done'))) throw e;
  } finally {
    Object.defineProperty(chainModule, 'runThreeWayChain', { configurable: true, enumerable: true, get: () => original });
  }
  if (captured === null) throw new Error('de stomp heeft niet gevuurd');
  return captured;
}

/* ---- BOM: de goedkoopste catalogusrealisatie ------------------------------ */
interface CatComp {
  sku: string;
  brand: string;
  series: string;
  kind: string;
  value: number;
  gauge?: number;
  dcr?: number;
  price: number;
}
const catalog: CatComp[] = (() => {
  const p = casus1CoilCatalogPath(golden);
  if (p === null) return [];
  return (JSON.parse(readFileSync(p, 'utf-8')) as { components: CatComp[] }).components;
})();
/** Goedkoopste realisatie van een spoel uit de GESTELDE wooferfamilie (1,4 mm lucht), stapel van 2 in serie toegestaan. */
function coilBom(mH: number): { label: string; eur: number } | null {
  const fam = catalog.filter((p) => p.kind === 'L' && p.brand === 'Jantzen' && p.series === 'Air Core Wire Coil' && Math.abs((p.gauge ?? 0) - 1.4) < 0.01);
  const target = mH * 1e-3;
  let best: { label: string; eur: number } | null = null;
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  for (const a of fam) {
    if (ok(a.value) && (!best || a.price < best.eur)) best = { label: `${a.sku} ${(a.value * 1e3).toFixed(1)} mH`, eur: a.price };
  }
  for (const a of fam) {
    for (const b of fam) {
      if (a.sku > b.sku) continue;
      const v = a.value + b.value;
      const eur = a.price + b.price;
      if (ok(v) && (!best || eur < best.eur)) best = { label: `${a.sku} + ${b.sku} = ${(v * 1e3).toFixed(1)} mH (stapel)`, eur };
    }
  }
  return best;
}
/** Goedkoopste realisatie van een condensatorbank (parallel, max 3 onderdelen, alle series). */
function capBom(uF: number): { label: string; eur: number } | null {
  const caps = catalog.filter((p) => p.kind === 'C' && p.value <= uF * 1e-6 * (1 + BOM_TOLERANCE));
  const target = uF * 1e-6;
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  let best: { label: string; eur: number } | null = null;
  const consider = (parts: CatComp[]) => {
    const v = parts.reduce((s, p) => s + p.value, 0);
    if (!ok(v)) return;
    const eur = parts.reduce((s, p) => s + p.price, 0);
    if (!best || eur < best.eur) best = { label: parts.map((p) => p.sku).join(' + ') + ` = ${(v * 1e6).toFixed(0)} µF`, eur };
  };
  for (const a of caps) consider([a]);
  const big = caps.filter((p) => p.value >= target / 3.2);
  for (let i = 0; i < big.length; i++) {
    for (let j = i; j < big.length; j++) {
      consider([big[i], big[j]]);
      for (let k = j; k < big.length; k++) consider([big[i], big[j], big[k]]);
    }
  }
  return best;
}

/* ---- de armen ------------------------------------------------------------- */
const partsOf = (key: string): VxpPart[] => deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;
const delivered = partsOf(SUBJECT_KEY);
const trap = trapGroupOf(delivered);
if (!trap) throw new Error(`${SUBJECT_KEY} draagt geen eenduidige val op de wooferbus`);
const ablated = ablateGroup(delivered, trap);
const cappedSeed: VxpPart[] = delivered.map((p) => {
  if (p.partId === undefined || !trap.partIds.includes(p.partId) || p.type !== 'Inductor') return p;
  const span = CASUS1_LOWEST_WAY_COIL_SPAN_H;
  if (span === null) return p;
  return { ...p, params: p.params.map((q) => (q.name === 'L' && q.value > span * 1e3 ? { ...q, value: Number((span * 1e3).toPrecision(4)) } : { ...q })) };
});

const ARM = process.env.A5E3B_ARM ?? null;
const fileOf = (arm: string) => join(OUT_DIR, `${arm}.json`);
const auditedOf = (parts: readonly VxpPart[]): string[] =>
  parts.filter((p) => p.partId !== undefined && (p.open || p.shorted)).map((p) => `${p.partId} ${p.open ? 'open' : 'shorted'}`);

if (ARM !== null) {
  mkdirSync(OUT_DIR, { recursive: true });
  const t0 = Date.now();
  const seed = ARM === 'herpolijst' ? ablated : ARM === 'bouwbaar' ? cappedSeed : null;
  if (!seed) throw new Error(`onbekende arm ${ARM}`);
  const net = valueTune(structuredClone(seed));
  const out = {
    arm: ARM,
    seconds: (Date.now() - t0) / 1000,
    evaluations: net.evaluations,
    parts: net.parts,
    after: net.after,
    audited: auditedOf(net.parts).filter((x) => !(ARM === 'herpolijst' && trap.partIds.some((id) => x.startsWith(id)))),
  };
  writeFileSync(fileOf(ARM), JSON.stringify(out, null, 1), 'utf-8');
  console.log(`  [${ARM}] klaar in ${out.seconds.toFixed(0)} s, ${out.evaluations} evaluaties`);
  process.exit(0);
}

if (process.env.A5E3B_DRY === '1') {
  /* Rookproef: de valherkenning en de meetbank op de twee tuneloze armen. */
  console.log(`val op ${SUBJECT_KEY}: ${trap.composition} (f0 ${trap.fHz?.toFixed(1)} Hz, partIds ${trap.partIds.join('+')})`);
  for (const r of [measureArm('met val (geleverd)', delivered, null), measureArm('zonder val (waarden vast)', ablated, null)]) {
    console.log(
      `  ${r.arm}: min|Z| ${r.minZ ? `${r.minZ.ohm.toFixed(2)} @ ${r.minZ.hz.toFixed(0)} in ${r.minZ.branch}` : '—'}, ` +
        `poort ${r.gateMinZ?.toFixed(2)}${r.floorPass ? ' ✓' : ' ✗'}, opslingering ${r.resonantDb?.toFixed(2)}, RMS vol ${r.rmsFull?.toFixed(2)}`,
    );
  }
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const tuneArms = ['herpolijst', 'bouwbaar'].filter((a) => !existsSync(fileOf(a)) || process.env.A5E3B_REDO === '1');
if (tuneArms.length > 0) {
  console.log(`waardetunes: ${tuneArms.join(', ')} (parallel, 10–25 min per stuk)`);
  await new Promise<void>((resolve, reject) => {
    let finished = 0;
    for (const arm of tuneArms) {
      const child = spawn('npx', ['vite-node', SELF], { cwd: join(HERE, '..'), env: { ...process.env, A5E3B_ARM: arm }, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      child.stdout.on('data', (b: Buffer) => (log += b.toString()));
      child.stderr.on('data', (b: Buffer) => (log += b.toString()));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`arm ${arm} faalde (exit ${code}):\n${log}`));
          return;
        }
        for (const line of log.split('\n')) if (line.startsWith('  [')) console.log(line);
        if (++finished === tuneArms.length) resolve();
      });
    }
  });
}

const armFile = (arm: string) => JSON.parse(readFileSync(fileOf(arm), 'utf-8')) as { parts: VxpPart[]; evaluations: number; audited: string[]; seconds: number };
const herpolijst = armFile('herpolijst');
const bouwbaar = armFile('bouwbaar');
const rows: ArmVector[] = [
  measureArm('met val (geleverd)', delivered, null),
  measureArm('zonder val (waarden vast)', ablated, null),
  measureArm('zonder val, herpolijst', herpolijst.parts, { evaluations: herpolijst.evaluations, audited: herpolijst.audited }),
  measureArm('bouwbare val (L ≤ 22 mH), herpolijst', bouwbaar.parts, { evaluations: bouwbaar.evaluations, audited: bouwbaar.audited }),
];

const f2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(2));
const f1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f0 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(0));
console.log('');
console.log(`A5e.3b (a) — DE VAL OP ${SUBJECT_KEY} (${SUBJECT_XO.join(' · ')}), val ${trap.composition}; meetbank: gemergede set, doelcurve ${CASUS1_TARGET_CURVE.type}, vloer ${bank.floorOhm ?? '—'} Ω`);
console.log('');
console.log('| arm | val L/C/DCR | kruispunten Hz | min \\|Z\\| Ω @ Hz, tak | poort M-B/\\|Z\\| | opslingering / lift dB | RMS vol / ±venster | RMS 397 / ±venster | M-K W-M / M-T ° | M-C per weg (grens) | dissipatie % | BOM val € |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const bomL = r.trap.lMh !== null ? coilBom(r.trap.lMh) : null;
  const bomC = r.trap.cUf !== null ? capBom(r.trap.cUf) : null;
  const bom = r.trap.lMh === null ? { eur: 0, label: '—' } : bomL && bomC ? { eur: bomL.eur + bomC.eur, label: `${bomL.label}; ${bomC.label}` } : null;
  console.log(
    `| ${r.arm} | ${r.trap.lMh === null ? 'geen' : `${f2(r.trap.lMh)} mH / ${f0(r.trap.cUf)} µF / ${f2(r.trap.dcrOhm)} Ω`} | ${r.crossingsHz.map(f0).join(' · ')} | ` +
      `${r.minZ ? `${f2(r.minZ.ohm)} @ ${f0(r.minZ.hz)} in ${r.minZ.branch}` : '—'} | ${f2(r.gateMinZ)}${r.floorPass === null ? '' : r.floorPass ? ' ✓' : ' ✗'} | ` +
      `${f2(r.resonantDb)} / ${f2(r.liftDb)} | ${f2(r.rmsFull)} / ±${f2(r.windowFull)} | ${f2(r.rms397)} / ±${f2(r.window397)} | ` +
      `${r.mk.map((m) => f1(m.deg)).join(' / ')} | ${r.mc.map((m) => `${m.way} ${f1(m.db)} (${f1(m.limit)}${m.pass ? '' : ' ✗'})`).join(' / ')} | ${f0(r.dissPct)} | ` +
      `${bom ? `${bom.eur.toFixed(0)} (${bom.label})` : 'GEEN realisatie binnen ±5 %'} |`,
  );
}
console.log('');
for (const r of rows) {
  if (r.tune) console.log(`  ${r.arm}: ${r.tune.evaluations} evaluaties${r.tune.audited.length > 0 ? `; audit sneed: ${r.tune.audited.join(', ')}` : '; audit sneed niets'}`);
}
writeFileSync(
  join(OUT_DIR, 'tabel.json'),
  `${JSON.stringify(
    {
      _: `A5e.3b (a) — de ablatietabel op ${SUBJECT_KEY} (scripts/measure-a5e3b-ablatie.ts). Documentatie, geen acceptatiewaarde; Sander kiest.`,
      val: trap.composition,
      rijen: rows.map(({ parts: _p, ...r }) => r),
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${join(OUT_DIR, 'tabel.json')}`);
