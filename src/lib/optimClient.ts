/**
 * Main-thread client for the optimizer Web Worker (optimWorker.ts): a small
 * promise-based API with per-task progress callbacks and HARD cancel.
 *
 * Cancel = terminate the workers and reject every pending task with
 * CancelledError. Termination truly stops the compute mid-flight — no
 * cooperative cancellation flags needed inside the solvers — and the next
 * task simply spawns fresh workers (each request re-hydrates the catalog,
 * so a respawn loses no state).
 *
 * The crossover SCAN fans its candidates out over a small worker POOL
 * (multi-core: three chains in the time of one). Each candidate is fully
 * independent and deterministic, so parallel execution returns bit-identical
 * results in the same order as the old sequential loop.
 */
import type {
  CatalogPayload,
  ChainOneProgress,
  NetOptimizePayload,
  OptimResponse,
  VfProgressMsg,
  VfRoundsPayload,
  VfRoundsResult,
} from './optimWorker.ts';
import type { NetOptimizeResult } from './netOptimizer.ts';
import type { Chain3Input, Chain3Result } from './threeWayChain.ts';
import type { SoloChainInput, SoloChainResult } from './soloOptimizer.ts';
import {
  followupVariantsFor,
  type ChainInput,
  type ChainResult,
  type ChainStageProgress,
} from './designChain.ts';
import { customCatalogParts, customSeries, disabledSeries } from './catalog.ts';

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (d: unknown) => void;
}

const workers: (Worker | null)[] = [];
let seq = 0;
const pending = new Map<number, Pending>();

function spawn(): Worker {
  const wk = new Worker(new URL('./optimWorker.ts', import.meta.url), { type: 'module' });
  wk.onmessage = (e: MessageEvent<OptimResponse>) => {
    const m = e.data;
    const p = pending.get(m.id);
    if (!p) return;
    if (m.kind === 'progress') {
      p.onProgress?.(m.data);
      return;
    }
    pending.delete(m.id);
    if (m.kind === 'done') p.resolve(m.data);
    else p.reject(new Error(m.message));
  };
  wk.onerror = (e) => {
    // A worker-level failure (load error etc.) fails every pending task.
    for (const p of pending.values()) p.reject(new Error(e.message || 'optimizer worker error'));
    pending.clear();
  };
  return wk;
}

function workerAt(slot: number): Worker {
  while (workers.length <= slot) workers.push(null);
  if (!workers[slot]) workers[slot] = spawn();
  return workers[slot]!;
}

/** Current user-imported catalog, shipped with every request so the worker's
 *  module state matches the main thread's (stateless across respawns). The
 *  disabled-series list MUST ride along: the worker has no localStorage, and
 *  without it the snap prices stock the designer switched off — the scan
 *  table then shows a BOM total the real BOM cannot reproduce. */
function catalogPayload(): CatalogPayload {
  return { series: customSeries(), parts: customCatalogParts(), disabled: disabledSeries() };
}

function run<T>(
  slot: number,
  kind: 'chainOne' | 'chain3One' | 'vfRounds' | 'netOptimize' | 'soloChain',
  payload: unknown,
  onProgress?: (d: unknown) => void,
): Promise<T> {
  const wk = workerAt(slot);
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    wk.postMessage({ id, kind, catalog: catalogPayload(), payload });
  });
}

export interface ChainScanInput {
  base: Omit<ChainInput, 'xoRange'>;
  variants: { label: string; xoRange?: [number, number] }[];
  targets?: { rippleDb: number; phaseDeg: number };
}

export interface ChainScanResult {
  results: ChainResult[];
  totalRounds: number;
  totalSims: number;
}

/** Aggregated live view over concurrently running candidates. */
export interface ScanProgress {
  /** Completed candidates so far. */
  round: number;
  /** Total network sims across all candidates (running + done). */
  evals: number;
  rippleDb?: number;
  phaseDeg?: number;
  /** One STABLE row per candidate (insertion order): the busy overlay renders
   *  these as a fixed little table so the popup never changes size. */
  items: {
    label: string;
    text: string;
    done: boolean;
    /** A finished candidate whose amp load fails the floor. Kept OUT of `text`
     *  so the view can colour the warning without parsing the string — the
     *  glyph carries the meaning, the colour only reinforces it. */
    warn?: string;
  }[];
}

const stageText = (p: ChainOneProgress): string =>
  p.stage === 'design'
    ? `design r${p.round ?? '?'}`
    : p.stage === 'synthesis'
      ? 'synthesis'
      : p.detail
        ? `tune (${p.detail})`
        : 'tune';

/**
 * Crossover scan over the worker pool. Candidates run CONCURRENTLY (one per
 * worker, up to cores−1); the truly-free single-candidate run keeps its
 * rescue semantics: run first, and only when it misses the staged targets
 * append the pinned follow-ups (those then run in parallel).
 */
export function runChainScan(
  input: ChainScanInput,
  onProgress?: (d: ScanProgress) => void,
): Promise<ChainScanResult> {
  const poolSize = Math.max(
    1,
    Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) - 1 || 1),
  );
  const state = new Map<string, { evals: number; text: string; done: boolean; warn?: string }>();
  let lastRipple: number | undefined;
  let lastPhase: number | undefined;
  // THROTTLED (trailing, ~12/s): four workers burst progress messages, and
  // every emit re-renders the whole app under a blurred overlay — unthrottled
  // bursts caused visible paint stutter ("flikkeren"). The timer reads the
  // CURRENT state map when it fires, so the last update is never lost.
  let emitQueued = false;
  const emit = () => {
    if (!onProgress || emitQueued) return;
    emitQueued = true;
    setTimeout(() => {
      emitQueued = false;
      let evals = 0;
      let done = 0;
      const items: { label: string; text: string; done: boolean; warn?: string }[] = [];
      for (const [label, st] of state) {
        evals += st.evals;
        if (st.done) done++;
        items.push({ label, text: st.text, done: st.done, warn: st.warn });
      }
      onProgress({ round: done, evals, rippleDb: lastRipple, phaseDeg: lastPhase, items });
    }, 80);
  };
  const runOne = (v: { label: string; xoRange?: [number, number] }, slot: number) => {
    state.set(v.label, { evals: 0, text: 'queued', done: false });
    return run<ChainResult>(
      slot,
      'chainOne',
      { input: { ...input.base, xoRange: v.xoRange }, label: v.label },
      (d) => {
        const p = d as ChainOneProgress;
        const st = state.get(v.label);
        if (!st) return;
        st.evals = p.evals;
        st.text = stageText(p);
        if (p.rippleDb !== undefined) lastRipple = p.rippleDb;
        if (p.phaseDeg !== undefined) lastPhase = p.phaseDeg;
        emit();
      },
    ).then((r) => {
      const st = state.get(v.label);
      if (st) {
        st.evals = r.evaluations;
        st.text = `✓ ${r.net.after.rippleDb.toFixed(2)} dB/${r.net.after.phaseDeg.toFixed(1)}°`;
        st.done = true;
      }
      // Same live warning the three-way scan shows: a candidate whose
      // amplifier load or delivered handover failed is flagged while it
      // lands, not only in the final table.
      const st2 = state.get(v.label);
      if (st2) {
        st2.warn =
          !r.zOk || (r.zMinOhm != null && r.zMinOhm < 2.5)
            ? '⚠Z'
            : r.xoWindowOk === false
              ? '⚠xo'
              : undefined;
      }
      lastRipple = r.net.after.rippleDb;
      lastPhase = r.net.after.phaseDeg;
      emit();
      return r;
    });
  };

  const finish = (results: ChainResult[]): ChainScanResult => ({
    results,
    totalRounds: results.reduce((a, r) => a + r.rounds, 0),
    totalSims: results.reduce((a, r) => a + r.evaluations, 0),
  });

  const vs = input.variants;
  // Truly-free single run with rescue semantics (see designChain doc).
  if (vs.length === 1 && !vs[0].xoRange && input.targets) {
    const targets = input.targets;
    return runOne(vs[0], 0).then((first) => {
      const met =
        first.net.after.rippleDb <= targets.rippleDb && first.net.after.phaseDeg <= targets.phaseDeg;
      if (met || !first.net.after.xoHz) return finish([first]);
      const follow = followupVariantsFor(first.net.after.xoHz);
      return Promise.all(follow.map((v, i) => runOne(v, i % poolSize))).then((rest) =>
        finish([first, ...rest]),
      );
    });
  }
  return Promise.all(vs.map((v, i) => runOne(v, i % poolSize))).then(finish);
}

/** 3-way 2D crossover scan (trede 4c): every (low, high) candidate runs a
 *  full chain concurrently over the pool; same throttled aggregate progress
 *  as the 2-way scan. No rescue semantics — the 2D grid IS the competition. */
export function runChain3Scan(
  inputs: Chain3Input[],
  onProgress?: (d: ScanProgress) => void,
): Promise<Chain3Result[]> {
  const poolSize = Math.max(
    1,
    Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) - 1 || 1),
  );
  const state = new Map<string, { evals: number; text: string; done: boolean; warn?: string }>();
  let emitQueued = false;
  const emit = () => {
    if (!onProgress || emitQueued) return;
    emitQueued = true;
    setTimeout(() => {
      emitQueued = false;
      let evals = 0;
      let done = 0;
      const items: { label: string; text: string; done: boolean; warn?: string }[] = [];
      for (const [label, st] of state) {
        evals += st.evals;
        if (st.done) done++;
        items.push({ label, text: st.text, done: st.done, warn: st.warn });
      }
      onProgress({ round: done, evals, items });
    }, 80);
  };
  return Promise.all(
    inputs.map((input, i) => {
      state.set(input.label, { evals: 0, text: 'queued', done: false });
      return run<Chain3Result>(i % poolSize, 'chain3One', { input }, (d) => {
        const p = d as ChainOneProgress;
        const st = state.get(input.label);
        if (!st) return;
        st.text = stageText(p);
        emit();
      }).then((r) => {
        const st = state.get(input.label);
        if (st) {
          st.evals = r.net.evaluations;
          st.text = `✓ ${r.net.after.rippleDb.toFixed(2)} dB/${r.net.after.phaseDeg.toFixed(1)}°`;
          st.warn = r.zOk ? undefined : '⚠Z';
          st.done = true;
        }
        emit();
        return r;
      });
    }),
  );
}

export function runVfRoundsTask(
  payload: VfRoundsPayload,
  onProgress?: (d: VfProgressMsg) => void,
): Promise<VfRoundsResult> {
  return run<VfRoundsResult>(0, 'vfRounds', payload, onProgress as (d: unknown) => void);
}

/** Single-driver design chain (solo flatten → solo topology → solo tune). */
export function runSoloChainTask(
  payload: SoloChainInput,
  onProgress?: (p: ChainStageProgress) => void,
): Promise<SoloChainResult> {
  return run<SoloChainResult>(0, 'soloChain', payload, onProgress as (d: unknown) => void);
}

export function runNetOptimizeTask(
  payload: NetOptimizePayload,
  onStage?: (label: string) => void,
): Promise<NetOptimizeResult> {
  return run<NetOptimizeResult>(0, 'netOptimize', payload, (d) => {
    const m = d as { netStage?: string };
    if (m.netStage) onStage?.(m.netStage);
  });
}

/** Hard cancel: kill every worker, reject all pending with CancelledError. */
export function cancelOptimTasks(): void {
  for (let i = 0; i < workers.length; i++) {
    workers[i]?.terminate();
    workers[i] = null;
  }
  for (const p of pending.values()) p.reject(new CancelledError());
  pending.clear();
}
