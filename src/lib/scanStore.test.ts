import { describe, expect, it } from 'vitest';
import { pickResumable, type ScanRunRecord } from './scanStore.ts';

/**
 * The DECISION is what is worth testing here; the rest of scanStore is
 * IndexedDB plumbing, which vitest has no business standing in for.
 *
 * What it decides: which stored run gets offered back after a page died, and
 * which stored runs are simply litter. Sander lost 18 finished candidates to a
 * screensaver; the point of the store is that the next time he gets them back,
 * and the point of this function is that he gets back the RIGHT ones and the
 * database does not grow forever.
 */
const run = (runId: string, at: number, status: 'running' | 'done'): ScanRunRecord => ({
  runId,
  at,
  status,
  planned: null,
  label: runId,
});

describe('pickResumable', () => {
  it('offers back the newest run that never committed', () => {
    const runs = [run('a', 100, 'running'), run('b', 300, 'running'), run('c', 200, 'done')];
    const { resume } = pickResumable(runs, { a: 5, b: 7, c: 9 });
    expect(resume?.runId).toBe('b');
  });

  it('a completed run is history, not a rescue — even when it is the newest', () => {
    /* Its results were committed; offering them again would be offering the
     * user something they already have, and hiding the older thing they lost. */
    const runs = [run('old', 100, 'running'), run('new', 500, 'done')];
    const { resume } = pickResumable(runs, { old: 3, new: 9 });
    expect(resume?.runId).toBe('old');
  });

  it('an interrupted run with NO finished candidates has nothing to offer', () => {
    /* Dying during the first chain is the common case; a banner promising
     * zero recovered designs is worse than silence. */
    const { resume } = pickResumable([run('a', 100, 'running')], { a: 0 });
    expect(resume).toBeNull();
  });

  it('everything that is not the rescue gets dropped, so the store cannot grow forever', () => {
    const runs = [run('a', 100, 'running'), run('b', 300, 'running'), run('c', 200, 'done')];
    const { drop } = pickResumable(runs, { a: 5, b: 7, c: 9 });
    expect(new Set(drop)).toEqual(new Set(['a', 'c']));
  });

  it('with nothing to resume, every run is dropped', () => {
    const runs = [run('a', 100, 'done'), run('b', 300, 'done')];
    const { resume, drop } = pickResumable(runs, { a: 4, b: 6 });
    expect(resume).toBeNull();
    expect(new Set(drop)).toEqual(new Set(['a', 'b']));
  });

  it('no runs at all is not an error', () => {
    expect(pickResumable([], {})).toEqual({ resume: null, drop: [] });
  });
});
