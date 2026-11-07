/**
 * VOLGT DE VLOERBARRIÈRE HAAR DAL? (07-11-2026, vóór elke motorwijziging).
 *
 * Oogst de ECHTE tuner-opties van één casus-1-kandidaat (zoals
 * measure-eval-cost.ts) en draait één volledige waardetune (zonder `staged`,
 * het eigen budget). Een observator op `solveNetwork` legt bij ELKE oplossing
 * op het barrièreraster de |Z|-kromme en de tijd vast. Raakt de engine niet.
 *
 * Daarna, offline, op die opgenomen krommen:
 *  1. hoeveel van de rekentijd per evaluatie de barrière is;
 *  2. hoe ver het minimum tussen opeenvolgende oplossingen verspringt (cellen);
 *  3. een SIMULATIE van "volg de diepste dalen": volledige scan elke N
 *     oplossingen (en zodra het gevolgde minimum de vensterrand raakt),
 *     daartussen alleen ±W cellen rond de K diepste lokale minima van de
 *     laatste scan. Gemeten: punten per oplossing, en de fout in het
 *     barrière-tekort max(0, vloer − min|Z|) tegen de volle lezing — het enige
 *     getal dat de zoektocht van de barrière krijgt.
 *
 *   E-1 ook voor andere kandidaten: FB_ONLY=<n>  npx vite-node scripts/measure-floor-barrier-tracking.ts
 */
import * as netModule from '../src/lib/netOptimizer.ts';
import * as networkModule from '../src/lib/network.ts';
import * as optimizeModule from '../src/lib/optimize.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import type { NetOptimizeOptions } from '../src/lib/netOptimizer.ts';
import {
  CASUS1_WOOFER_DC_OHM, casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY, CASUS1_COIL_DCR_SETTINGS, CASUS1_CONTINUOUS_POWER_W, CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS, CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS, CASUS1_V2_GATES, CASUS1_V2_SEED, CASUS1_V2_SETTINGS, CASUS1_WINDOW_SETTINGS,
  casus1ChainInput, casus1Field, casus1V2Declaration, casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Chain3Payload } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';

type Args = Parameters<typeof netModule.optimizeNetworkValues>;
let captured: Args | null = null;
class Sentinel extends Error {}
const original = netModule.optimizeNetworkValues;
Object.defineProperty(netModule, 'optimizeNetworkValues', {
  configurable: true, enumerable: true,
  get: () => (...a: Args) => { if (!captured) { captured = a; throw new Sentinel('captured'); } return original(...a); },
});


const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const report = buildReport({
  manifest, files, filter: casus1Filter('HUIDIG', manifest, files, golden), geometry: casus1Geometry(golden),
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER },
    ...CASUS1_WINDOW_SETTINGS, ...CASUS1_BUILDABILITY, ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM }, targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION, ...CASUS1_COIL_DCR_SETTINGS,
  },
});
const facts = casus1V2Facts(report, manifest, files);
const field = casus1Field(report);
const gridded = casus1ChainInput(manifest, files, golden);
const cand = field.field.candidates[Number(process.env.FB_ONLY ?? 0)];
const declaration = casus1V2Declaration(cand, gridded.safety);
const input: Chain3Input = {
  grid: [...gridded.grid], w: gridded.w, m: gridded.m, t: gridded.t, driverZ: gridded.driverZ,
  tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow: cand.crossings[0].hz, xoHigh: cand.crossings[1].hz,
  xoLowRange: cand.crossings[0].cageHz, xoHighRange: cand.crossings[1].cageHz, label: cand.label,
  settings: {
    ...CASUS1_V2_SETTINGS, safety: gridded.safety,
    structureLow: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
    structureHigh: { kind: cand.crossings[1].alignment.kind, order: cand.crossings[1].alignment.order },
    xoFloorPairs: cand.crossings.map((x) => x.windowHz[0]),
  } as unknown as Chain3Input['settings'],
};
const payload: V2Chain3Payload = {
  input,
  v2: {
    ...facts, gates: { ...CASUS1_V2_GATES }, budgets: { ...CASUS1_V2_BUDGETS },
    determinism: { seed: CASUS1_V2_SEED }, targetCurve: CASUS1_TARGET_CURVE, judgeBandHz: CASUS1_V2_BAND_HZ,
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
  },
  candidate: declaration,
};
try {
  handleV2Request(structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }), () => {});
} catch (e) { if (!(e instanceof Sentinel)) throw e; }
if (!captured) throw new Error('observator vuurde niet');
const [parts, grid, w, t, dz, adj, opts] = captured as Args;
const o = opts as NetOptimizeOptions & Record<string, unknown>;
console.log(`kandidaat ${cand.label} · raster ${grid.length} pt · onderdelen ${parts.length}`);
const desc = (k: string) => { const v = o[k]; if (v == null) return String(v); if (Array.isArray(v)) return `array(${v.length})`; if (typeof v === 'object') return `{${Object.keys(v).join(',')}}`; return typeof v === 'function' ? 'fn' : String(v); };
for (const k of ['ampMinLoadOhm','zFloorBarrier','zFloorBarrierSource','rSourceProbeSource','phaseAdmission','amplitudeReference','flankBudget','gateViolation','valueSumCeilings','valueSoftCeilings','coilDcrModel','staged','safety','errorSmoothOct','repeatedTune','dissipationReferenceSource']) console.log(`  ${k}: ${desc(k)}`);


/* ---- de opname: elke solveNetwork-aanroep, per rasterlengte ---------------- */
const origSolve = networkModule.solveNetwork;
interface Rec { len: number; ms: number; mag: Float32Array | null; seq: number }
const recs: Rec[] = [];
let recording = false;
let seq = 0;
const gridsByLen = new Map<number, number[]>();
Object.defineProperty(networkModule, 'solveNetwork', {
  configurable: true, enumerable: true,
  get: () => (...a: Parameters<typeof origSolve>) => {
    if (!recording) return origSolve(...a);
    const t0 = performance.now();
    const r = origSolve(...a);
    const ms = performance.now() - t0;
    const len = a[1].length;
    const keep = len > 300 || len === grid.length;
    if (keep && !gridsByLen.has(len)) gridsByLen.set(len, [...a[1]]);
    recs.push({ len, ms, mag: keep ? Float32Array.from(r.inputZ, (z) => Math.hypot(z.re, z.im)) : null, seq: seq++ });
    return r;
  },
});
const x = { ...o } as NetOptimizeOptions & Record<string, unknown>;
delete x.staged; delete x.onStage;
let evals = 0;
let evalMs = 0;
const origNM = optimizeModule.nelderMead;
Object.defineProperty(optimizeModule, 'nelderMead', {
  configurable: true, enumerable: true,
  get: () => (f: (v: readonly number[]) => number, x0: readonly number[], nm?: Parameters<typeof origNM>[2]) =>
    origNM((v) => { const t0 = performance.now(); const r = f(v); evalMs += performance.now() - t0; evals++; return r; }, x0, nm),
});
recording = true;
const tTune = performance.now();
original(parts, grid, w, t, dz, adj, x);
recording = false;
console.log(`waardetune: ${evals} evaluaties in ${((performance.now() - tTune) / 1000).toFixed(1)} s (${(evalMs / evals).toFixed(2)} ms/eval)`);

/* ---- (1) waar de tijd zit, per rasterlengte -------------------------------- */
const byLen = new Map<number, { n: number; ms: number }>();
for (const r of recs) { const b = byLen.get(r.len) ?? { n: 0, ms: 0 }; b.n++; b.ms += r.ms; byLen.set(r.len, b); }
console.log('\nsolveNetwork per rasterlengte:');
for (const [len, b] of [...byLen].sort((p, q) => q[1].ms - p[1].ms))
  console.log(`  ${String(len).padStart(5)} pt  ${String(b.n).padStart(7)}×  ${(b.ms / 1000).toFixed(1).padStart(6)} s  ${(b.ms / b.n).toFixed(3)} ms/solve  ${((100 * b.ms) / evalMs).toFixed(0)} % van de evaluatietijd`);
const barrierLen = [...byLen].filter(([len]) => len > 300).sort((p, q) => q[1].n - p[1].n)[0]?.[0];
if (!barrierLen) throw new Error('geen barrièreraster gezien');
const curves = recs.filter((r) => r.len === barrierLen).map((r) => r.mag!);
const floor = (o.ampMinLoadOhm as number | undefined) ?? 0;
console.log(`barrièreraster ${barrierLen} pt, ${curves.length} krommen, vloer ${floor} Ω`);

/* ---- (2) hoe ver het minimum verspringt -------------------------------------- */
const argmin = (m: Float32Array): number => { let k = 0; for (let i = 1; i < m.length; i++) if (m[i] < m[k]) k = i; return k; };
const jumps: number[] = [];
for (let i = 1; i < curves.length; i++) jumps.push(Math.abs(argmin(curves[i]) - argmin(curves[i - 1])));
const pct = (a: number[], p: number) => { const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`\nsprong van het minimum tussen opeenvolgende oplossingen (cellen): mediaan ${pct(jumps, 0.5)}, p90 ${pct(jumps, 0.9)}, p99 ${pct(jumps, 0.99)}, max ${jumps.reduce((a, b) => Math.max(a, b), 0)}; 0 cellen in ${((100 * jumps.filter((j) => j === 0).length) / jumps.length).toFixed(0)} %`);
const active = curves.filter((m) => m[argmin(m)] < floor).length;
console.log(`oplossingen met min|Z| onder de vloer (barrière actief): ${active} van ${curves.length}`);

/* ---- (3) simulatie van "volg de dalen", met en zonder detector ---------------
 * De detector is de |Z|-kromme op het EVALUATIERASTER, die de tuner bij elke
 * poging toch al oplost. Ligt een dal daar BUITEN de gevolgde vensters, dan
 * doet de barrière alsnog een volledige scan. Twee vormen:
 *   argmin   — alleen het laagste punt van het evaluatieraster;
 *   dalen    — elk lokaal minimum van het evaluatieraster onder vloer + 0,5 Ω.
 * Het evaluatieraster begint hoger dan het barrièreraster (dat tot de bodem
 * van de impedantiesweep reikt), dus een dal daaronder kan het niet zien: de
 * kolom "onder bereik" telt de gemiste pogingen waarvan het echte minimum
 * onder het evaluatieraster ligt. */
const evalLen = grid.length;
const evalGrid = gridsByLen.get(evalLen)!;
const barrierGrid = gridsByLen.get(barrierLen)!;
// pair every barrier curve with the evaluation-grid curve solved just before it
const pairs: { b: Float32Array; e: Float32Array | null }[] = [];
let lastEval: Float32Array | null = null;
for (const r of recs) {
  if (r.len === evalLen) lastEval = r.mag;
  else if (r.len === barrierLen) pairs.push({ b: r.mag!, e: lastEval });
}
const toBarrier = evalGrid.map((f) => {
  let k = 0;
  for (let i = 1; i < barrierGrid.length; i++) if (Math.abs(barrierGrid[i] - f) < Math.abs(barrierGrid[k] - f)) k = i;
  return k;
});
const belowReach = (bi: number) => barrierGrid[bi] < evalGrid[0];
console.log(`evaluatieraster ${evalLen} pt vanaf ${evalGrid[0].toFixed(1)} Hz; barrièreraster vanaf ${barrierGrid[0].toFixed(1)} Hz; ${pairs.filter((q) => q.e).length} van ${pairs.length} paren`);
const localMinima = (m: Float32Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i < m.length; i++) {
    const l = i === 0 ? Infinity : m[i - 1];
    const r = i === m.length - 1 ? Infinity : m[i + 1];
    if (m[i] <= l && m[i] <= r) out.push(i);
  }
  return out.sort((p, q) => m[p] - m[q]);
};
const short = (ohm: number) => Math.max(0, floor - ohm);
type Det = 'geen' | 'argmin' | 'dalen';
const DIP_MARGIN_OHM = 0.5;
interface Sim { K: number; W: number; N: number; det: Det; pts: number; rescans: number; maxErr: number; missesActive: number; missesBelow: number }
const sims: Sim[] = [];
for (const det of ['geen', 'argmin', 'dalen'] as Det[])
  for (const K of [2, 4])
    for (const W of [2, 4])
      for (const N of [25, 50, 100]) {
        let tracked: number[] = [];
        let since = Infinity;
        let pts = 0, rescans = 0, maxErr = 0, missesActive = 0, missesBelow = 0;
        const inWindows = (bi: number) => tracked.some((c) => Math.abs(bi - c) <= W);
        for (const { b: m, e } of pairs) {
          const ti = argmin(m);
          const truth = m[ti];
          let full = since >= N;
          if (!full && det !== 'geen' && e) {
            const triggers = det === 'argmin' ? [argmin(e)] : localMinima(e).filter((i) => e[i] < floor + DIP_MARGIN_OHM);
            if (triggers.some((i) => !inWindows(toBarrier[i]))) full = true;
          }
          let est: number;
          if (!full) {
            const idx = new Set<number>();
            for (const c of tracked) for (let i = Math.max(0, c - W); i <= Math.min(m.length - 1, c + W); i++) idx.add(i);
            let best = -1;
            for (const i of idx) if (best < 0 || m[i] < m[best]) best = i;
            pts += idx.size;
            const atEdge = tracked.some((c) => best === Math.max(0, c - W) || best === Math.min(m.length - 1, c + W));
            if (atEdge && best !== 0 && best !== m.length - 1) full = true;
            else {
              est = m[best]; since++;
              tracked = tracked.map((c) => { let bb = c; for (let i = Math.max(0, c - W); i <= Math.min(m.length - 1, c + W); i++) if (m[i] < m[bb]) bb = i; return bb; });
            }
          }
          if (full) { est = truth; pts += m.length; rescans++; since = 0; tracked = localMinima(m).slice(0, K); }
          const err = Math.abs(short(est!) - short(truth));
          if (err > maxErr) maxErr = err;
          if (truth < floor && est! > truth + 1e-9) { missesActive++; if (belowReach(ti)) missesBelow++; }
        }
        sims.push({ K, W, N, det, pts: pts / pairs.length, rescans, maxErr, missesActive, missesBelow });
      }
console.log('\nsimulatie "volg de dalen" (detector, K dalen, ±W cellen, volle scan elke N):');
console.log('  detector  K  W    N   pt/opl  ×goedkoper  volle scans  max fout Ω  gemist actief  waarvan onder bereik');
for (const q of sims)
  console.log(`  ${q.det.padEnd(8)} ${q.K}  ${q.W}  ${String(q.N).padStart(3)}  ${q.pts.toFixed(1).padStart(7)}  ${(barrierLen / q.pts).toFixed(1).padStart(9)}  ${String(q.rescans).padStart(11)}  ${q.maxErr.toFixed(4).padStart(10)}  ${String(q.missesActive).padStart(13)}  ${String(q.missesBelow).padStart(10)}`);
const evalShare = (byLen.get(evalLen)!.ms / evalMs);

const barrierShare = (byLen.get(barrierLen)!.ms / evalMs);
mkdirSync('test-fixtures', { recursive: true });
const out = `test-fixtures/floor_barrier_detector_${process.env.FB_ONLY ?? 0}.json`;
writeFileSync(out, JSON.stringify({
  gemeten_op: '2026-11-07', kandidaat: cand.label, floor_ohm: floor, barrier_grid_pt: barrierLen,
  evaluaties: evals, ms_per_eval: evalMs / evals, barrier_share: barrierShare, eval_grid_share: evalShare,
  eval_grid_pt: evalLen, eval_grid_from_hz: evalGrid[0], barrier_grid_from_hz: barrierGrid[0],
  solves_per_length: Object.fromEntries([...byLen].map(([l, b]) => [l, { n: b.n, ms: b.ms }])),
  sprong_cellen: { mediaan: pct(jumps, 0.5), p90: pct(jumps, 0.9), p99: pct(jumps, 0.99), max: jumps.reduce((a, b) => Math.max(a, b), 0) },
  actief: active, krommen: curves.length, simulatie: sims,
}, null, 1) + '\n');
console.log(`\ngeschreven: ${out}`);
