/**
 * F2b / A5e.4 — CANCEL IS A STATUS, NOT A SILENCE.
 *
 * The failure this closes was easy to walk into and hard to notice. The scan's
 * "stop and keep what finished" resolves with the candidates that landed, so an
 * aborted run and a completed run of the same input arrived at the UI looking
 * the same: same seed, same design, same numbers, and one of them had looked at
 * a third of the field. Nothing lied; nothing said so either.
 *
 * Two claims, and the second is the one with teeth:
 *
 *  1. An aborted run always carries a REASON. "Aborted" with no explanation is
 *     the silent best-so-far under a different name.
 *  2. The status is an INGREDIENT of the fingerprint rather than a label beside
 *     it, so two runs that differ only in how they ended cannot compare equal.
 *     A field the caller has to remember to check is a field that gets
 *     forgotten — that is exactly how the v1 route's module-global
 *     `stoppedEarly` flag came to be missed by the three-way scan.
 */

import { describe, expect, it } from 'vitest';
import { resolveDeterminism, stampRun, type FingerprintInput } from './determinism.ts';
import { v2ScanOutcome } from '../../optimClient.ts';

const base: Omit<FingerprintInput, 'status'> = {
  determinism: resolveDeterminism({ seed: 11, starts: 2, budgetEvaluations: 100 }),
  design: 'design-A',
  measurements: 'measure-A',
  gates: 'gates-A',
  bounds: 'bounds-A',
  tuning: 'tuning-A',
};

describe('A5e.4 - an aborted run never passes for a completed one', () => {
  it('the status is part of the fingerprint, so the two cannot compare equal', () => {
    const done = stampRun(base, 'completed');
    const stopped = stampRun(base, 'aborted');
    // Identical inputs in every other respect — that is the point.
    expect(stopped.fingerprint).not.toBe(done.fingerprint);
    expect(done.fingerprint).toContain('status=completed');
    expect(stopped.fingerprint).toContain('status=aborted');
    // ...and it is an ingredient, not an extra line tacked on the end.
    expect(done.components.map((c) => c.name)).toContain('status');
  });

  it('an aborted run always says WHY; a completed one carries no reason', () => {
    const stopped = stampRun(base, 'aborted');
    expect(stopped.abortReason).toBeTruthy();
    expect(stopped.abortReason!.length).toBeGreaterThan(20);
    // Even with no reason supplied: the default is a sentence, never silence.
    expect(stampRun(base, 'aborted', undefined).abortReason).toBeTruthy();
    expect(stampRun(base, 'completed').abortReason).toBeUndefined();
  });

  it('two completed runs of the same input still match', () => {
    // The status must not be a nonce: it distinguishes outcomes, not runs.
    expect(stampRun(base, 'completed').fingerprint).toBe(stampRun(base, 'completed').fingerprint);
  });

  /* ---- the client-side rule that decides which of the two it was ---- */

  it('a short field is ABORTED however it came to be short', () => {
    // Not "did the designer press Stop": a candidate that threw leaves the
    // field just as partial, and A5e.4 wants the word to be unambiguous.
    expect(v2ScanOutcome(5, 5, false).status).toBe('completed');
    expect(v2ScanOutcome(5, 5, false).reason).toBeUndefined();

    expect(v2ScanOutcome(3, 5, false).status).toBe('aborted');
    expect(v2ScanOutcome(5, 5, true).status).toBe('aborted');
    expect(v2ScanOutcome(0, 5, true).status).toBe('aborted');
    for (const o of [v2ScanOutcome(3, 5, false), v2ScanOutcome(0, 5, true)]) {
      expect(o.reason).toContain('of 5');
      expect(o.reason).toContain('partial field');
    }
  });
});
