/**
 * Wat kost één tuner-evaluatie op de v2-route, en waar zit het? Oogst de ECHTE
 * opties van de tune van één casus-1-kandidaat (observator op
 * optimizeNetworkValues, daarna afgebroken) en draait de tuner opnieuw met een
 * klein budget, zonder `staged`, per arm één optie anders. Meet ms/evaluatie.
 * Raakt de engine niet.
 */
import * as netModule from '../src/lib/netOptimizer.ts';
import * as optimizeModule from '../src/lib/optimize.ts';
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

const T0 = performance.now();
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
const cand = field.field.candidates[Number(process.env.EC_ONLY ?? 0)];
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
console.log('opties:', Object.keys(o).sort().join(', '));
const desc = (k: string) => { const v = o[k]; if (v == null) return String(v); if (Array.isArray(v)) return `array(${v.length})`; if (typeof v === 'object') return `{${Object.keys(v).join(',')}}`; return typeof v === 'function' ? 'fn' : String(v); };
for (const k of ['zFloorBarrier','zFloorBarrierSource','rSourceProbeSource','phaseAdmission','amplitudeReference','flankBudget','gateViolation','valueSumCeilings','valueSoftCeilings','coilDcrModel','staged','safety','errorSmoothOct','repeatedTune','dissipationReferenceSource']) console.log(`  ${k}: ${desc(k)}`);

const SAMPLE = Number(process.env.EC_SAMPLE ?? 300);
const origNM = optimizeModule.nelderMead;
let sampling: { n: number; ms: number } | null = null;
Object.defineProperty(optimizeModule, 'nelderMead', {
  configurable: true, enumerable: true,
  get: () => (f: (x: readonly number[]) => number, x0: readonly number[], nmOpts?: optimizeModule.NelderMeadOptions) => {
    const g = (x: readonly number[]): number => {
      const t0 = performance.now(); const v = f(x);
      if (sampling) { sampling.ms += performance.now() - t0; if (++sampling.n >= SAMPLE) throw new Sentinel('sampled'); }
      return v;
    };
    return origNM(g, x0, nmOpts);
  },
});
console.log(`oogst klaar na ${((performance.now() - T0) / 1000).toFixed(0)} s`);
function arm(name: string, patch: (x: NetOptimizeOptions & Record<string, unknown>) => void): void {
  const x = { ...o } as NetOptimizeOptions & Record<string, unknown>;
  delete x.staged; delete x.onStage;
  patch(x);
  sampling = { n: 0, ms: 0 };
  const t0 = performance.now();
  try { original(parts, grid, w, t, dz, adj, x); } catch (e) { if (!(e instanceof Sentinel)) throw e; }
  const s = sampling; sampling = null;
  console.log(`${name.padEnd(36)} ${(s.ms / s.n).toFixed(2).padStart(7)} ms/eval (${s.n} evals, ${((performance.now() - t0) / 1000).toFixed(1)} s incl. opstart)`);
}
const ONLY = process.env.EC_ARM;
const arms: [string, (x: NetOptimizeOptions & Record<string, unknown>) => void][] = [
  ['volledig (v2-opties)', () => {}],
  ['zonder poorthook (gateViolation)', (x) => { delete x.gateViolation; }],
  ['barrière-bron grid', (x) => { x.zFloorBarrierSource = 'grid'; }],
  ['barrière-bron tracked (de app-route sinds S-2)', (x) => { x.zFloorBarrierSource = 'safety-extended-refined-tracked'; }],
  ['zonder barrière', (x) => { x.zFloorBarrier = false; delete x.zFloorBarrierSource; }],
  ['zonder safety-set', (x) => { delete x.safety; }],
  ['fasetoelating overlap', (x) => { x.phaseAdmission = 'overlap'; }],
  ['amplitude flat', (x) => { x.amplitudeReference = 'flat'; }],
  ['zonder somplafonds', (x) => { delete x.valueSumCeilings; delete x.valueSoftCeilings; }],
  ['zonder DCR-model', (x) => { delete x.coilDcrModel; }],
  ['bron-probe grid', (x) => { x.rSourceProbeSource = 'grid'; }],
];
for (const [n, p] of arms) if (!ONLY || n.startsWith(ONLY)) arm(n, p);
