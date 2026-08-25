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
import type { MinimizeResult } from './minimize.ts';
import type {
  CatalogPayload,
  ChainOneProgress,
  NetOptimizePayload,
  MinimizePayload,
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
import { meetsAmpFloor } from './impedanceFloor.ts';

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * Stop-but-keep: the task was killed on purpose and its scan should resolve
 * with the candidates that already landed. Separate from CancelledError
 * because the two mean opposite things to the caller — cancel commits
 * nothing, this one commits the partial field.
 */
class StoppedEarlyError extends Error {
  constructor() {
    super('stopped early');
    this.name = 'StoppedEarlyError';
  }
}

/** Set by stopKeepingResults(), cleared when a scan starts (or a hard cancel). */
let stoppedEarly = false;

/** Did the designer stop the running scan and ask to keep what finished?
 *  The axis-by-axis orchestrator reads this between rounds — without it the
 *  next round would just respawn the workers it was meant to stop. */
export function scanStopped(): boolean {
  return stoppedEarly;
}

/**
 * "I have enough — rank what finished." Kills the compute exactly like
 * Cancel does, but every in-flight task rejects with StoppedEarlyError, which
 * the scans swallow: the promise resolves with the candidates that completed
 * instead of rejecting. A scan where nothing finished yet resolves empty, and
 * the caller decides (it commits nothing).
 */
export function stopKeepingResults(): void {
  stoppedEarly = true;
  for (let i = 0; i < workers.length; i++) {
    workers[i]?.terminate();
    workers[i] = null;
  }
  for (const p of pending.values()) p.reject(new StoppedEarlyError());
  pending.clear();
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

import { poolSize, runPooled } from './pool.ts';
export { poolSize, runPooled };

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
  kind: 'chainOne' | 'chain3One' | 'vfRounds' | 'netOptimize' | 'soloChain' | 'minimize',
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
  /** The designer pressed "stop and use what finished" — `results` is the
   *  partial field, not the whole scan. */
  stoppedEarly: boolean;
  /** How many candidates the scan set out to run. */
  requested: number;
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
  stoppedEarly = false;
  const size = poolSize();
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
    state.set(v.label, { evals: 0, text: 'starting', done: false });
    emit();
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
      //
      // The floor is the one the DESIGNER stated, via the same single rule the
      // ranking and the scan table use. This badge used to carry its own
      // hard-coded 2.5 Ω instead, which meant it could flag a candidate the
      // final table then passed — and it judged at all even when no amplifier
      // had been named. No rating stated = no badge, same as everywhere else.
      const st2 = state.get(v.label);
      if (st2) {
        st2.warn =
          !r.zOk || !meetsAmpFloor(r.zMinOhm, input.base.settings.ampMinLoadOhm)
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
  /* A candidate that was killed by "stop and keep" is not a failure — it just
   * has no result. Drop it and let the finished ones through. */
  const runOneOrDropped = (v: { label: string; xoRange?: [number, number] }, slot: number) =>
    runOne(v, slot).catch((e: unknown) => {
      if (e instanceof StoppedEarlyError) return null;
      throw e;
    });

  const finish = (results: (ChainResult | null | undefined)[]): ChainScanResult => {
    const done = results.filter((r): r is ChainResult => !!r);
    return {
      results: done,
      totalRounds: done.reduce((a, r) => a + r.rounds, 0),
      totalSims: done.reduce((a, r) => a + r.evaluations, 0),
      stoppedEarly,
      requested: input.variants.length,
    };
  };

  const vs = input.variants;
  // Truly-free single run with rescue semantics (see designChain doc).
  if (vs.length === 1 && !vs[0].xoRange && input.targets) {
    const targets = input.targets;
    return runOneOrDropped(vs[0], 0).then((first) => {
      if (!first) return finish([]);
      const met =
        first.net.after.rippleDb <= targets.rippleDb && first.net.after.phaseDeg <= targets.phaseDeg;
      if (met || !first.net.after.xoHz || stoppedEarly) return finish([first]);
      const follow = followupVariantsFor(first.net.after.xoHz);
      return runPooled(
        follow,
        size,
        (v, slot) => runOneOrDropped(v, slot),
        () => stoppedEarly,
      ).then((rest) => finish([first, ...rest]));
    });
  }
  // Mark every candidate queued up front so the progress card lists them all.
  for (const v of vs) state.set(v.label, { evals: 0, text: 'queued', done: false });
  return runPooled(vs, size, (v, slot) => runOneOrDropped(v, slot), () => stoppedEarly).then(finish);
}

/** 3-way 2D crossover scan (trede 4c): every (low, high) candidate runs a
 *  full chain concurrently over the pool; same throttled aggregate progress
 *  as the 2-way scan. No rescue semantics — the 2D grid IS the competition. */
export function runChain3Scan(
  inputs: Chain3Input[],
  onProgress?: (d: ScanProgress) => void,
): Promise<Chain3Result[]> {
  stoppedEarly = false;
  const size = poolSize();
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
  for (const input of inputs) state.set(input.label, { evals: 0, text: 'queued', done: false });
  emit();
  return runPooled(inputs, size, (input, slot) => {
      const st0 = state.get(input.label);
      if (st0) st0.text = 'starting';
      emit();
      return run<Chain3Result>(slot, 'chain3One', { input }, (d) => {
        const p = d as ChainOneProgress;
        const st = state.get(input.label);
        if (!st) return;
        // Live evaluation count from the tuner's heartbeat — the only proof
        // of life a long prune sweep gives.
        if (p.evals > st.evals) st.evals = p.evals;
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
      }).catch((e: unknown) => {
        // Killed by "stop and keep": no result, not a failure (see runChainScan).
        if (e instanceof StoppedEarlyError) return null;
        throw e;
      });
  }, () => stoppedEarly).then((rs) => rs.filter((r): r is Chain3Result => !!r));
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

export function runMinimizeTask(
  payload: MinimizePayload,
  onStage?: (label: string) => void,
): Promise<MinimizeResult> {
  return run<MinimizeResult>(0, 'minimize', payload, (d) => {
    const m = d as { netStage?: string };
    if (m.netStage) onStage?.(m.netStage);
  });
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
  stoppedEarly = false;
  for (let i = 0; i < workers.length; i++) {
    workers[i]?.terminate();
    workers[i] = null;
  }
  for (const p of pending.values()) p.reject(new CancelledError());
  pending.clear();
}
