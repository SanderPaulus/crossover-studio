import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Chain3Input } from './threeWayChain.ts';
import type { V2ScanSettings, V2Chain3Item } from './optimClient.ts';

/* U-10 fase 3 (V15 form) — WAS: these claims drove `runChain3Scan`, the v1
 * scan. It is gone; the same bookkeeping (one pool, "stop and keep", a hard
 * cancel) is `runScanV2`'s, so the claims now drive `runChain3ScanV2`. What
 * they guard is unchanged: a stopped scan keeps what finished. */
const V2: V2ScanSettings = {
  gates: {},
  budgets: {},
  determinism: {},
  designKey: 'test',
  measurementKey: 'test',
  tuningKey: 'test',
} as V2ScanSettings;
const items = (labels: string[]): V2Chain3Item[] =>
  labels.map((label) => ({ input: { label } as unknown as Chain3Input }));

/**
 * "Stop and keep what finished": the scan must resolve with the candidates
 * that already landed instead of throwing everything away (Sander: "stel dat
 * ik al door wil gaan met de 3 complete uitkomsten"). The client talks to real
 * Workers, so the test drives a fake one — what is under test is the
 * bookkeeping, not the solver.
 */

interface Posted {
  id: number;
  label: string;
}
const posted: Posted[] = [];
let terminated = 0;

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(msg: { id: number; payload: { input: { label: string } } }) {
    posted.push({ id: msg.id, label: msg.payload.input.label });
  }
  terminate() {
    terminated++;
  }
}

/** Reply "done" for one queued request, with a result carrying just the
 *  fields the client reads. */
function complete(p: Posted, worker: FakeWorker) {
  const data = {
    result: { label: p.label, zOk: true, net: { evaluations: 100, after: { rippleDb: 1.5, phaseDeg: 9 } } },
    violation: null,
  };
  worker.onmessage?.({ data: { id: p.id, kind: 'done', data } });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('stopKeepingResults', () => {
  beforeEach(() => {
    posted.length = 0;
    terminated = 0;
  });

  it('resolves the scan with the candidates that finished', async () => {
    const made: FakeWorker[] = [];
    vi.stubGlobal(
      'Worker',
      class extends FakeWorker {
        constructor() {
          super();
          made.push(this);
        }
      },
    );
    const { runChain3ScanV2, stopKeepingResults, scanStopped } = await import('./optimClient.ts');

    const scan = runChain3ScanV2(items(['a', 'b', 'c', 'd', 'e', 'f']), V2);
    await flush();

    // Let three land, whatever the pool size on this machine happens to be.
    const done: string[] = [];
    for (let guard = 0; guard < 50 && done.length < 3; guard++) {
      const next = posted.find((p) => !done.includes(p.label));
      if (next) {
        complete(next, made[posted.indexOf(next) % made.length]);
        done.push(next.label);
      }
      await flush();
    }
    expect(done).toHaveLength(3);

    stopKeepingResults();
    const results = (await scan).candidates;

    expect(results.map((r) => r.result.label).sort()).toEqual(done.sort());
    expect(scanStopped()).toBe(true);
    expect(terminated).toBeGreaterThan(0); // in-flight compute really stopped
    vi.unstubAllGlobals();
  });

  it('resolves empty when nothing finished — the caller commits nothing', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { runChain3ScanV2, stopKeepingResults } = await import('./optimClient.ts');
    const scan = runChain3ScanV2(items(['x', 'y']), V2);
    await flush();
    stopKeepingResults();
    expect((await scan).candidates).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('a hard cancel still rejects — the two must not be confused', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { runChain3ScanV2, cancelOptimTasks, CancelledError, scanStopped } = await import(
      './optimClient.ts'
    );
    const scan = runChain3ScanV2(items(['p']), V2);
    await flush();
    cancelOptimTasks();
    await expect(scan).rejects.toBeInstanceOf(CancelledError);
    expect(scanStopped()).toBe(false);
    vi.unstubAllGlobals();
  });
});
