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
 *
 * ------------------------------------------------------------------
 * F2b — THE SECOND WORKER, AND WHY THIS FILE KNOWS ABOUT IT
 * ------------------------------------------------------------------
 * With engine v2 selected the scan runs on a DIFFERENT worker entry
 * (`engine2/optimizer/worker.ts`), because gate enforcement has to happen
 * inside the polish and only a module that may import `engine2/` can evaluate
 * the gates. `optimWorker.ts` may not — the toggle invariant rests on that
 * arrow — so the v1 worker is left byte-untouched and a second one is added.
 *
 * The CLIENT is shared rather than duplicated, and that is not tidiness: the
 * Cancel and Stop buttons call `cancelOptimTasks()` / `stopKeepingResults()`
 * here, and a second pool owned by another module would survive both. A cancel
 * that does not cancel is the one failure this route may not have (A5e.4 asks
 * for an explicit "aborted" status precisely so a partial field can never pass
 * for a whole one). So both pools live in this file, both are killed by the
 * same two functions, and `pending` is one map.
 *
 * The v2 worker is reached through `new Worker(new URL(...))`, which Vite
 * emits as its own chunk: with the toggle off it is never constructed and its
 * code never enters the page.
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
/* F2b — this file is on the engine2 allow-list; see the note at the top and
 * the reason recorded in `toggleRegression.test.ts`. */
import {
  resolveDeterminism,
  stableJson,
  stampRun,
  type V2RunStamp,
} from './engine2/optimizer/determinism.ts';
import { gateSettingsKey } from './engine2/optimizer/gates.ts';
import { budgetSettingsKey } from './engine2/optimizer/bounds.ts';
import type {
  V2CandidateResult,
  V2Response,
  V2RunSettings,
} from './engine2/optimizer/worker.ts';

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
  killAllWorkers();
  for (const p of pending.values()) p.reject(new StoppedEarlyError());
  pending.clear();
}

/** Terminate BOTH pools. One cancel path — see the F2b note at the top. */
function killAllWorkers(): void {
  for (let i = 0; i < workers.length; i++) {
    workers[i]?.terminate();
    workers[i] = null;
  }
  for (let i = 0; i < v2Workers.length; i++) {
    v2Workers[i]?.terminate();
    v2Workers[i] = null;
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (d: unknown) => void;
}

const workers: (Worker | null)[] = [];
/**
 * The v2 pool, beside the v1 one and killed by the same two functions.
 *
 * A SEPARATE ARRAY rather than a flag on the existing slots: a v1 worker and a
 * v2 worker are different programs, and reusing a slot would mean terminating
 * and respawning on every toggle change. Both arrays are swept by
 * `cancelOptimTasks` and `stopKeepingResults`, so there is still exactly one
 * cancel path.
 */
const v2Workers: (Worker | null)[] = [];
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

/**
 * The v2 worker entry. Constructed ONLY from `runChain3ScanV2`, which the app
 * calls once the façade has said `optimizer: 'v2'` — so with the toggle off
 * this URL is never resolved and the chunk never loads.
 */
function spawnV2(): Worker {
  const wk = new Worker(new URL('./engine2/optimizer/worker.ts', import.meta.url), {
    type: 'module',
  });
  wk.onmessage = (e: MessageEvent<V2Response>) => {
    const m = e.data;
    const pd = pending.get(m.id);
    if (!pd) return;
    if (m.kind === 'progress') {
      pd.onProgress?.(m.data);
      return;
    }
    pending.delete(m.id);
    if (m.kind === 'done') pd.resolve(m.data);
    else pd.reject(new Error(m.message));
  };
  wk.onerror = (e) => {
    for (const pd of pending.values()) pd.reject(new Error(e.message || 'engine v2 worker error'));
    pending.clear();
  };
  return wk;
}

function workerAtV2(slot: number): Worker {
  while (v2Workers.length <= slot) v2Workers.push(null);
  if (!v2Workers[slot]) v2Workers[slot] = spawnV2();
  return v2Workers[slot]!;
}

function runV2<T>(
  slot: number,
  kind: 'v2Chain3One' | 'v2ChainOne',
  payload: unknown,
  onProgress?: (d: unknown) => void,
): Promise<T> {
  const wk = workerAtV2(slot);
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
    wk.postMessage({ id, kind, catalog: catalogPayload(), payload });
  });
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

/* ================================================================== *
 * F2b — the v2 scan route
 * ================================================================== */

/** One v2 candidate: the chain result the v1 route also produces, plus verdicts. */
export type V2Chain3Candidate = V2CandidateResult<Chain3Result>;

export interface V2ScanResult<C> {
  /** The candidates that finished. */
  candidates: C[];
  /**
   * How the run ended, with the fingerprint that says so.
   *
   * A5e.4: an ABORTED run must never be mistaken for a completed one, so the
   * status is an ingredient of the fingerprint rather than a label beside it.
   * A caller that shows numbers from an aborted run owes the reader that word.
   */
  stamp: V2RunStamp;
  /** How many candidates the scan set out to run. */
  requested: number;
}

/** What a v2 scan needs beyond the per-candidate chain inputs. */
export interface V2ScanSettings extends V2RunSettings {
  /** Stable identity of the design the run started from, for the fingerprint. */
  designKey: string;
  /** Stable identity of the measurement set, for the fingerprint. */
  measurementKey: string;
  /** Stable identity of the search-steering settings, for the fingerprint. */
  tuningKey: string;
}

/**
 * Did this v2 scan COMPLETE, and if not, why not.
 *
 * One rule for both routes, and it is deliberately not "did the designer press
 * Stop": a scan can also come up short because a candidate threw, and a field
 * that is short for any reason is a partial field. A5e.4 wants that word to be
 * unambiguous, so the predicate is here rather than written twice.
 */
export function v2ScanOutcome(
  finished: number,
  requested: number,
  stopped: boolean,
): { status: 'completed' | 'aborted'; reason?: string } {
  if (!stopped && finished >= requested) return { status: 'completed' };
  return {
    status: 'aborted',
    reason:
      `stopped with ${finished} of ${requested} candidates finished — these numbers describe a ` +
      'partial field, not the scan that was asked for',
  };
}

function v2Stamp(
  v2: V2ScanSettings,
  status: 'completed' | 'aborted',
  reason?: string,
): V2RunStamp {
  return stampRun(
    {
      determinism: resolveDeterminism(v2.determinism),
      design: v2.designKey,
      measurements: v2.measurementKey,
      gates: stableJson(gateSettingsKey(v2.gates)),
      bounds: stableJson(budgetSettingsKey(v2.budgets)),
      tuning: v2.tuningKey,
    },
    status,
    reason,
  );
}

/**
 * The 3-way scan on the v2 worker.
 *
 * Same pool discipline, same throttled progress and the same stop semantics as
 * the v1 route — with ONE difference that A5e.4 requires: a run that was
 * stopped resolves with `status: 'aborted'` and a fingerprint that says so.
 * The v1 route reports its partial field through a module-global flag the
 * caller has to remember to ask about; here it is in the result.
 */
export function runChain3ScanV2(
  inputs: Chain3Input[],
  v2: V2ScanSettings,
  onProgress?: (d: ScanProgress) => void,
): Promise<V2ScanResult<V2Chain3Candidate>> {
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

  return runPooled(
    inputs,
    size,
    (input, slot) => {
      const st0 = state.get(input.label);
      if (st0) st0.text = 'starting';
      emit();
      return runV2<V2Chain3Candidate>(slot, 'v2Chain3One', { input, v2 }, (d) => {
        const pr = d as ChainOneProgress;
        const st = state.get(input.label);
        if (!st) return;
        if (pr.evals > st.evals) st.evals = pr.evals;
        st.text = stageText(pr);
        emit();
      })
        .then((c) => {
          const st = state.get(input.label);
          if (st) {
            st.evals = c.result.net.evaluations;
            st.text = `✓ ${c.result.net.after.rippleDb.toFixed(2)} dB/${c.result.net.after.phaseDeg.toFixed(1)}°`;
            // THE SAME WARNING FAMILY, and deliberately not a second rule: the
            // gate glyph is derived from the verdicts the metric library
            // produced, exactly as ⚠Z is derived from the one floor rule. A
            // failed gate outranks a load warning because it is the harder
            // statement — the design is outside a limit the designer stated.
            st.warn = c.violation ? '⚠gate' : c.result.zOk ? undefined : '⚠Z';
            st.done = true;
          }
          emit();
          return c;
        })
        .catch((e: unknown) => {
          if (e instanceof StoppedEarlyError) return null;
          throw e;
        });
    },
    () => stoppedEarly,
  ).then((rs) => {
    const candidates = rs.filter((r): r is V2Chain3Candidate => !!r);
    const outcome = v2ScanOutcome(candidates.length, inputs.length, stoppedEarly);
    return {
      candidates,
      requested: inputs.length,
      stamp: v2Stamp(v2, outcome.status, outcome.reason),
    };
  });
}

/*
 * NO `runChainScanV2` HERE, and that is deliberate.
 *
 * The two-way scan route is not wired to v2 yet (TODO(F2c) at the façade): it
 * carries its own rescue semantics — a truly-free single candidate runs first
 * and only then appends pinned follow-ups — and porting those is a
 * behavioural change to a path F2b promised not to touch. The WORKER side is
 * ready and tested (`v2ChainOne` in `engine2/optimizer/worker.ts`), which is
 * the half that had to exist; writing the client half now would ship an
 * untested function whose only caller is a future phase, and an untested
 * export that claims to work is worse than an absent one.
 */

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
  killAllWorkers();
  for (const p of pending.values()) p.reject(new CancelledError());
  pending.clear();
}
