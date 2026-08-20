import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Chain3Input, Chain3Result } from './threeWayChain.ts';

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
    label: p.label,
    zOk: true,
    net: { evaluations: 100, after: { rippleDb: 1.5, phaseDeg: 9 } },
  } as unknown as Chain3Result;
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
    const { runChain3Scan, stopKeepingResults, scanStopped } = await import('./optimClient.ts');

    const inputs = ['a', 'b', 'c', 'd', 'e', 'f'].map(
      (label) => ({ label }) as unknown as Chain3Input,
    );
    const scan = runChain3Scan(inputs);
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
    const results = await scan;

    expect(results.map((r) => r.label).sort()).toEqual(done.sort());
    expect(scanStopped()).toBe(true);
    expect(terminated).toBeGreaterThan(0); // in-flight compute really stopped
    vi.unstubAllGlobals();
  });

  it('resolves empty when nothing finished — the caller commits nothing', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { runChain3Scan, stopKeepingResults } = await import('./optimClient.ts');
    const inputs = ['x', 'y'].map((label) => ({ label }) as unknown as Chain3Input);
    const scan = runChain3Scan(inputs);
    await flush();
    stopKeepingResults();
    expect(await scan).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('a hard cancel still rejects — the two must not be confused', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { runChain3Scan, cancelOptimTasks, CancelledError, scanStopped } = await import(
      './optimClient.ts'
    );
    const inputs = ['p'].map((label) => ({ label }) as unknown as Chain3Input);
    const scan = runChain3Scan(inputs);
    await flush();
    cancelOptimTasks();
    await expect(scan).rejects.toBeInstanceOf(CancelledError);
    expect(scanStopped()).toBe(false);
    vi.unstubAllGlobals();
  });
});
