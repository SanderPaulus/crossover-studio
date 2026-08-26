/**
 * A5e.1 — THE RELAXATION LADDER, and the one thing it may never do.
 *
 * The load-bearing test in this file is the one that asserts a NEGATIVE: no
 * rung, ever, under any requirement, touches a protection limit. That is the
 * difference between "we widened your taste requirement and told you" and "we
 * quietly shipped a design your amplifier cannot drive", and it is worth
 * asserting three ways — by type, by key set, and by running a ladder that
 * would very much like to reach a gate if it could.
 */

import { describe, expect, it } from 'vitest';
import { relaxUntil, RELAXABLE_SETTING_KEYS } from './relaxation.ts';
import {
  evaluateRequirements,
  type CandidateMeasurements,
  type RequirementSettings,
} from '../requirements/requirements.ts';

/** A candidate that reads `window` dB and `phase` degrees. */
const cand = (window: number, phase: number): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: window,
    windowMaxAtHz: 1000,
    windowMinAtHz: 2000,
    rmsDeviationDb: window / 2,
    narrowPeaks: [],
    bandHz: [200, 8000],
    coverage: {
      intendedHz: [200, 8000],
      evaluatedHz: [200, 8000],
      fraction: 1,
      flagged: false,
      limitedBy: { low: 'test fixture', high: 'test fixture' },
      describe: 'full',
    },
    smoothingOctaves: 1 / 6,
    notes: [],
  },
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: phase }],
});

const evaluatorFor = (set: readonly CandidateMeasurements[], stated: RequirementSettings) =>
  (inForce: RequirementSettings) => set.map((m) => evaluateRequirements(m, inForce, stated));

describe('the relaxation ladder', () => {
  it('does not climb when the stated requirements already suffice', () => {
    const field = [cand(1.0, 3), cand(1.2, 4)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };
    const out = relaxUntil(stated, 2, evaluatorFor(field, stated));
    expect(out.steps).toEqual([]);
    expect(out.label).toBeNull();
    expect(out.feasibleCount).toBe(2);
    expect(out.inForce).toEqual(stated);
  });

  it('widens ONLY the failing requirement, in visible steps, and labels it', () => {
    // Every candidate meets the phase requirement comfortably and misses the
    // window. Widening phase too would spend a statement the designer made for
    // no gain at all.
    const field = [cand(2.2, 2), cand(2.4, 3)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };
    const out = relaxUntil(stated, 2, evaluatorFor(field, stated));

    expect(out.steps.length).toBeGreaterThan(0);
    expect(out.steps.every((s) => s.requirement === 'spl-window')).toBe(true);
    expect(out.inForce.maxPhaseTrackingDeg).toBe(5);
    expect(out.inForce.splWindowPlusMinusDb!).toBeGreaterThan(1.5);
    expect(out.feasibleCount).toBe(2);

    // The label says what is met AND what was asked, or it is not a label.
    expect(out.label).toContain('you asked for');
    expect(out.label).toContain('±1.50 dB');
    expect(out.label).toContain('visible step');
    // ...and it carries its own boundary: this was a re-filter, not a re-scan.
    expect(out.label).toContain('finer grid');
    expect(out.label).toContain('No protection limit was touched');
  });

  it('the steps are LINEAR in the stated value, so the rungs stay legible', () => {
    const field = [cand(9, 2)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.0 };
    const out = relaxUntil(stated, 1, evaluatorFor(field, stated), { stepFraction: 0.25 });
    // rung 1 → 1.25, rung 2 → 1.5, ... each rung a quarter of the STATED value.
    expect(out.steps[0].toLimit).toBeCloseTo(1.25, 9);
    expect(out.steps[1].toLimit).toBeCloseTo(1.5, 9);
    expect(out.steps.map((s) => s.rung)).toEqual(out.steps.map((_, i) => i + 1));
  });

  it('widens BOTH when both are failing, and neither when neither is', () => {
    const field = [cand(2.5, 9)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };
    const out = relaxUntil(stated, 1, evaluatorFor(field, stated));
    const moved = new Set(out.steps.map((s) => s.requirement));
    expect(moved.has('spl-window')).toBe(true);
    expect(moved.has('phase-tracking')).toBe(true);
    expect(out.feasibleCount).toBe(1);
  });

  it('gives up honestly when the rungs run out', () => {
    const field = [cand(40, 2)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.0 };
    const out = relaxUntil(stated, 1, evaluatorFor(field, stated), { maxRungs: 3 });
    expect(out.exhausted).toBe(true);
    expect(out.feasibleCount).toBe(0);
    expect(out.notes.join(' ')).toContain('last rung');
  });

  it('does NOT climb when nothing is failing but the field is simply small', () => {
    // One candidate, two asked for. Widening cannot conjure a second design,
    // and spending the designer's requirement pretending otherwise would be
    // worse than saying so.
    const field = [cand(1.0, 2)];
    const stated: RequirementSettings = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };
    const out = relaxUntil(stated, 2, evaluatorFor(field, stated));
    expect(out.steps).toEqual([]);
    expect(out.label).toBeNull();
    expect(out.notes.join(' ')).toContain('the field itself is small');
  });

  it('with NO requirement stated there is nothing to relax', () => {
    const field = [cand(9, 90)];
    const out = relaxUntil({}, 1, evaluatorFor(field, {}));
    expect(out.steps).toEqual([]);
    expect(out.feasibleCount).toBe(1); // vacuously feasible: nothing was asked
  });

  /* ================= the one it may never do ================= */

  describe('protection limits are out of reach BY CONSTRUCTION', () => {
    it('the outcome can only contain taste keys — no gate can appear in it', () => {
      const field = [cand(9, 40)];
      const stated: RequirementSettings = { splWindowPlusMinusDb: 1.0, maxPhaseTrackingDeg: 2 };
      const out = relaxUntil(stated, 1, evaluatorFor(field, stated));
      for (const key of Object.keys(out.inForce)) {
        expect(RELAXABLE_SETTING_KEYS, `the ladder produced the key "${key}"`).toContain(key);
      }
      // The names that must never turn up here, spelled out so that adding one
      // to `RequirementSettings` in a hurry breaks this test rather than a
      // loudspeaker.
      for (const forbidden of [
        'ampMinLoadOhm',
        'minEpdrOhm',
        'maxDissipationFraction',
        'maxDriveOnFsDb',
      ]) {
        expect(Object.keys(out.inForce)).not.toContain(forbidden);
        expect(RELAXABLE_SETTING_KEYS).not.toContain(forbidden);
      }
    });

    it('a gate-failing candidate is never rescued by any number of rungs', () => {
      // The evaluator marks this candidate infeasible for a reason the ladder
      // has no lever over — exactly how a gate failure reaches the shortlist.
      const field = [cand(1.0, 1.0)];
      const stated: RequirementSettings = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };
      const gateBlocked = (inForce: RequirementSettings) =>
        field.map((m) => ({ ...evaluateRequirements(m, inForce, stated), feasible: false }));

      const out = relaxUntil(stated, 1, gateBlocked);
      expect(out.feasibleCount).toBe(0);
      expect(out.exhausted).toBe(true);
      // It did not thrash trying, either: with nothing FAILING a requirement
      // there is nothing to widen, and it says so.
      expect(out.steps).toEqual([]);
      expect(out.notes.join(' ')).toContain('the field itself is small');
    });
  });
});
