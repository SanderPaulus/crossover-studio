/**
 * A5e.1 — THE RELAXATION LADDER.
 *
 * When nothing meets what the designer asked for, the useless answers are
 * "no results" and "here is the best one anyway". The first hides a field that
 * may contain exactly what they want at ±2.25 instead of ±1.5; the second
 * hands them a design while quietly dropping the requirement they stated.
 *
 * So the ladder widens, in VISIBLE steps, and labels what it did.
 *
 * THREE PROPERTIES, each of which is a rule rather than an implementation
 * detail:
 *
 *  1. ONLY TASTE REQUIREMENTS MOVE. The window and the phase tracking may be
 *     relaxed. The protection limits — Z, EPDR, dissipation, drive on f_s —
 *     may not, ever, and the ladder is built so that it CANNOT: it produces a
 *     `RequirementSettings`, a type with no gate field in it. A ladder that
 *     could reach a gate would not be a bug in this file, it would be a
 *     different file.
 *
 *  2. ONLY THE FAILING ONES MOVE. Widening a requirement that everything
 *     already meets buys nothing and costs the designer their own statement.
 *     Each rung looks at what actually failed and widens that.
 *
 *  3. IT IS A RE-FILTER, NOT A NEW SEARCH. The ladder runs over the candidates
 *     that were already evaluated. Re-scanning at a looser requirement would
 *     let the requirement steer the search — which is precisely what A5e.1
 *     forbids, one level up from P3 — and the label says so out loud: the
 *     answer is bounded by what was scanned, and a finer grid may hold more.
 */

import { RELAXATION_MAX_RUNGS, RELAXATION_STEP_FRACTION } from '../constants.ts';
import {
  RELAXABLE,
  type RequirementEvaluation,
  type RequirementId,
  type RequirementSettings,
} from '../requirements/requirements.ts';

export interface RelaxationStep {
  rung: number;
  requirement: RequirementId;
  /** The limit before this rung, in the requirement's own unit. */
  fromLimit: number;
  /** The limit after it. */
  toLimit: number;
}

export interface RelaxationOutcome {
  /** The requirements actually in force for the delivered shortlist. */
  inForce: RequirementSettings;
  /** What the designer asked for, unchanged. */
  stated: RequirementSettings;
  /** Every rung climbed, in order. Empty when the stated requirements sufficed. */
  steps: RelaxationStep[];
  /** The evaluations that go with `inForce` — one per candidate, in order. */
  evaluations: RequirementEvaluation[];
  /** How many candidates are feasible under `inForce`. */
  feasibleCount: number;
  /** True when the ladder ran out of rungs before reaching the target count. */
  exhausted: boolean;
  /**
   * The sentence that must travel with the delivered designs. Null when
   * nothing was relaxed — an unlabelled result then means exactly what it
   * says.
   */
  label: string | null;
  notes: string[];
}

export interface RelaxationOptions {
  stepFraction?: number;
  maxRungs?: number;
}

/** The limit of one requirement, or undefined when it was not stated. */
const limitOf = (s: RequirementSettings, id: RequirementId): number | undefined =>
  id === 'spl-window' ? s.splWindowPlusMinusDb : s.maxPhaseTrackingDeg;

/** A copy of `s` with one requirement's limit replaced. */
function withLimit(s: RequirementSettings, id: RequirementId, v: number): RequirementSettings {
  return id === 'spl-window' ? { ...s, splWindowPlusMinusDb: v } : { ...s, maxPhaseTrackingDeg: v };
}

const UNIT: Record<RequirementId, (v: number) => string> = {
  'spl-window': (v) => `±${v.toFixed(2)} dB`,
  'phase-tracking': (v) => `${v.toFixed(1)}°`,
};

const NAME: Record<RequirementId, string> = {
  'spl-window': 'the SPL window',
  'phase-tracking': 'phase tracking',
};

/**
 * Climb until `wanted` candidates are feasible, or until the rungs run out.
 *
 * `evaluate` re-judges the SAME candidates against a given set of
 * requirements. It is a parameter rather than a call into the requirement
 * module so that this file cannot accidentally evaluate anything else — it
 * knows how to widen a number and nothing about what a candidate is.
 */
export function relaxUntil(
  stated: RequirementSettings,
  wanted: number,
  evaluate: (inForce: RequirementSettings) => RequirementEvaluation[],
  opts: RelaxationOptions = {},
): RelaxationOutcome {
  const step = opts.stepFraction ?? RELAXATION_STEP_FRACTION;
  const maxRungs = opts.maxRungs ?? RELAXATION_MAX_RUNGS;
  const notes: string[] = [];
  const steps: RelaxationStep[] = [];

  let inForce: RequirementSettings = { ...stated };
  let evaluations = evaluate(inForce);
  let feasibleCount = evaluations.filter((e) => e.feasible).length;

  for (let rung = 1; rung <= maxRungs && feasibleCount < wanted; rung++) {
    // What is actually standing in the way, right now.
    const failing = new Set<RequirementId>();
    for (const e of evaluations) for (const f of e.failures) failing.add(f.requirement);
    const movable = [...failing].filter((id) => RELAXABLE.includes(id)).sort();

    if (movable.length === 0) {
      // Nothing is failing, there are simply fewer candidates than asked for.
      // Widening anything here would spend the designer's requirement on a
      // problem it cannot solve.
      notes.push(
        `Only ${feasibleCount} candidate(s) meet the stated requirements, fewer than the ` +
          `${wanted} asked for — but nothing is failing a requirement, so the field itself is ` +
          'small. Nothing was relaxed; scan more candidates to see more.',
      );
      break;
    }

    let moved = false;
    for (const id of movable) {
      const base = limitOf(stated, id);
      const current = limitOf(inForce, id);
      if (base === undefined || current === undefined) continue;
      // Linear in the STATED value, so the rung count and the label stay
      // legible: rung 3 of a ±1.5 window is ±1.5·(1+0.75) = ±2.625.
      const next = base * (1 + step * rung);
      if (!(next > current)) continue;
      steps.push({ rung, requirement: id, fromLimit: current, toLimit: next });
      inForce = withLimit(inForce, id, next);
      moved = true;
    }
    if (!moved) break;

    evaluations = evaluate(inForce);
    feasibleCount = evaluations.filter((e) => e.feasible).length;
  }

  const relaxed = steps.length > 0;
  const exhausted = feasibleCount < wanted;

  let label: string | null = null;
  if (relaxed) {
    const parts: string[] = [];
    for (const id of RELAXABLE) {
      const base = limitOf(stated, id);
      const now = limitOf(inForce, id);
      if (base === undefined || now === undefined || now === base) continue;
      parts.push(`meets ${NAME[id]} at ${UNIT[id](now)} — you asked for ${UNIT[id](base)}`);
    }
    label =
      `${parts.join('; ')}. Relaxed in ${steps.length} visible step(s) over the candidates that ` +
      'were scanned; a finer grid may hold designs that meet the original requirement. ' +
      'No protection limit was touched.';
  }

  if (exhausted) {
    notes.push(
      `The ladder reached its last rung with ${feasibleCount} feasible candidate(s) instead of ` +
        `${wanted}. What is delivered is what the scanned field holds.`,
    );
  }

  return { inForce, stated, steps, evaluations, feasibleCount, exhausted, label, notes };
}

/**
 * The keys a relaxation outcome is allowed to contain.
 *
 * Exported so the suite can assert it rather than trust it: the guarantee "the
 * ladder never touches a protection limit" is worth a runtime check as well as
 * a type, because the type only holds while nobody widens `RequirementSettings`
 * with a gate field in a hurry.
 */
export const RELAXABLE_SETTING_KEYS: readonly string[] = [
  'splWindowPlusMinusDb',
  'maxPhaseTrackingDeg',
];
