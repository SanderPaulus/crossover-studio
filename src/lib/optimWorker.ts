/**
 * Web Worker entry: hosts the LONG-RUNNING optimizer work off the main
 * thread, so the UI stays live (animated spinner, ticking counters, scroll)
 * and a run can be cancelled (the client simply terminates the worker — no
 * cooperative cancellation plumbing needed in the solvers).
 *
 * Everything that crosses the boundary is plain structured-cloneable data —
 * the lib is DOM-free and deterministic, so moving it here changes nothing
 * about the results. The catalog's module state (user-imported series) is
 * hydrated per request: each request carries the custom catalog, which keeps
 * the worker stateless and safe across terminate/respawn cycles.
 */
import type { Complex } from './complex.ts';
import type { GriddedResponse, TweeterAdjust } from './dsp.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { runDesignChain, type ChainInput, type ChainStageProgress } from './designChain.ts';
import { runSoloChain, type SoloChainInput } from './soloOptimizer.ts';
import {
  optimizeVfCluster,
  optimizeVirtualFilters,
  structureOf,
  type VfOptimizeResult,
  type VfSpecs,
} from './vfOptimizer.ts';
import { optimizeNetworkValues, type NetOptimizeOptions } from './netOptimizer.ts';
import { setCustomSeries, type CatalogPart, type CatalogSeries } from './catalog.ts';

export interface CatalogPayload {
  series: CatalogSeries[];
  parts: CatalogPart[];
}

export interface ChainOnePayload {
  input: ChainInput;
  label: string;
}

export interface VfSeed {
  specs: VfSpecs;
  inv: boolean;
  cluster?: boolean;
}

export interface VfRoundsPayload {
  grid: number[];
  w: GriddedResponse;
  t: GriddedResponse;
  opts: Parameters<typeof optimizeVirtualFilters>[5];
  seedQueue: VfSeed[];
  offsetMm: number;
  trimDb: number;
  maxRounds: number;
}

export interface VfRoundsResult {
  best: VfOptimizeResult;
  round: number;
  totalEvals: number;
}

export interface NetOptimizePayload {
  parts: VxpPart[];
  grid: number[];
  w: GriddedResponse;
  t: GriddedResponse;
  z: Record<string, Complex[]>;
  adjust: TweeterAdjust;
  opts: NetOptimizeOptions;
}

export interface VfProgressMsg {
  round: number;
  evals: number;
  rippleDb: number;
  phaseDeg: number;
  label?: string;
}

export type OptimRequest = { id: number; catalog?: CatalogPayload | null } & (
  | { kind: 'chainOne'; payload: ChainOnePayload }
  | { kind: 'vfRounds'; payload: VfRoundsPayload }
  | { kind: 'netOptimize'; payload: NetOptimizePayload }
  | { kind: 'soloChain'; payload: SoloChainInput }
);

/** Progress from one chain candidate, tagged with its variant label. */
export type ChainOneProgress = ChainStageProgress & { variant: string };

export type OptimResponse =
  | { id: number; kind: 'progress'; data: VfProgressMsg | ChainOneProgress | { netStage: string } }
  | { id: number; kind: 'done'; data: unknown }
  | { id: number; kind: 'error'; message: string };

const post = (m: OptimResponse) => (self as unknown as Worker).postMessage(m);

/** Virtual-filter rounds (no impedances — ported 1:1 from the App's step
 *  loop): queued seeds always run, then re-seed from the best while a round
 *  keeps paying ≥1%. */
function runVfRounds(p: VfRoundsPayload, progress: (d: VfProgressMsg) => void): VfRoundsResult {
  let best: VfOptimizeResult | null = null;
  let round = 0;
  let totalEvals = 0;
  let queueIdx = 1;
  let seed = p.seedQueue[0];
  let seedFixed = false;
  for (;;) {
    const adj = { offsetMm: p.offsetMm, trimDb: p.trimDb, inverted: seed.inv };
    let r: VfOptimizeResult;
    if (seed.cluster) {
      const cl = optimizeVfCluster(p.grid, p.w, p.t, seed.specs, adj, p.opts);
      r = cl.best;
      totalEvals += cl.evaluations;
    } else {
      const stepOpts = seedFixed && best ? { ...p.opts, fixedStructure: structureOf(best) } : p.opts;
      r = optimizeVirtualFilters(p.grid, p.w, p.t, seed.specs, adj, stepOpts);
      totalEvals += r.evaluations;
    }
    round++;
    const improved = !best || r.objective < best.objective * 0.99;
    if (!best || r.objective < best.objective) best = r;
    progress({
      round,
      evals: totalEvals,
      rippleDb: best.after.responseStdDb,
      phaseDeg: best.after.avgPhaseErrDeg,
    });
    if (round < p.maxRounds && (queueIdx < p.seedQueue.length || improved)) {
      if (queueIdx < p.seedQueue.length) {
        seed = p.seedQueue[queueIdx];
        seedFixed = false;
        queueIdx++;
      } else {
        // Seed from the BEST so far — a regressed round must not drag the
        // search along with it.
        seed = { specs: best.specs, inv: best.inverted };
        seedFixed = true;
      }
      continue;
    }
    return { best, round, totalEvals };
  }
}

self.onmessage = (e: MessageEvent<OptimRequest>) => {
  const req = e.data;
  try {
    if (req.catalog) setCustomSeries(req.catalog.series, req.catalog.parts);
    let data: unknown;
    switch (req.kind) {
      case 'chainOne': {
        const { input, label } = req.payload;
        data = runDesignChain(input, label, (pr) =>
          post({ id: req.id, kind: 'progress', data: { ...pr, variant: label } }),
        );
        break;
      }
      case 'vfRounds':
        data = runVfRounds(req.payload, (d) => post({ id: req.id, kind: 'progress', data: d }));
        break;
      case 'netOptimize': {
        const p = req.payload;
        // onStage is injected HERE (functions cannot cross the postMessage
        // boundary): coarse tune-stage labels flow back as progress.
        data = optimizeNetworkValues(p.parts, p.grid, p.w, p.t, p.z, p.adjust, {
          ...p.opts,
          onStage: (label) => post({ id: req.id, kind: 'progress', data: { netStage: label } }),
        });
        break;
      }
      case 'soloChain':
        data = runSoloChain(req.payload, (pr) =>
          post({ id: req.id, kind: 'progress', data: { ...pr, variant: 'solo' } }),
        );
        break;
    }
    post({ id: req.id, kind: 'done', data });
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
