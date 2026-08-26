/**
 * A5e.1 — THE REQUIREMENTS, and the one rule that decides feasibility.
 *
 * A REQUIREMENT IS NOT A GATE AND NOT A WEIGHT, and the three are worth
 * separating precisely because they look alike from a distance:
 *
 *   · A GATE (M-A/M-B/M-C) is a PROTECTION limit. It is enforced INSIDE the
 *     search, at every point a polish step is accepted, and it is never
 *     relaxed by anything.
 *   · A REQUIREMENT is a TASTE limit on the OUTCOME. It never touches the
 *     search — P3 stands: soft goals are minimised without a threshold — and
 *     it filters the delivered field afterwards. It MAY be relaxed, visibly,
 *     by the ladder.
 *   · A WEIGHT does not exist. There is no weighted sum in this module, in
 *     the shortlist or in the relaxation, and `noWeights.test.ts` asserts it
 *     structurally.
 *
 * The practical consequence, and the reason the split is worth the words: a
 * design that misses the window is a design you may still choose to build, and
 * the ladder will offer it to you with a label saying what it actually meets.
 * A design that misses the EPDR floor is not, and no amount of wanting it
 * changes that.
 */

import { PERCENT } from '../constants.ts';
import type { GateVerdict } from '../optimizer/gates.ts';
import type { ResponseJudgement } from './response.ts';

/**
 * The taste requirements a project may state. EVERY FIELD OPTIONAL, EVERY ONE
 * WITHOUT A DEFAULT (P4): absent = that requirement is not being asked, the
 * measured value is still reported, and nothing judges it.
 *
 * The impedance/EPDR floor is deliberately NOT here. It already exists as a
 * gate (`GateSettings.ampMinLoadOhm` / `minEpdrOhm`), it is a protection limit
 * rather than a taste one, and duplicating it as a requirement would make it
 * relaxable by the ladder — which is the one thing A5e.1 forbids.
 */
export interface RequirementSettings {
  /**
   * The SPL window, in ±dB against the target curve, judged peak-to-peak on
   * the 1/6-octave-smoothed system response.
   */
  splWindowPlusMinusDb?: number;
  /**
   * The largest acceptable mean |Δφ| in a crossover region, degrees. Judged
   * per handover on the existing tracking metric, clipped to measurement
   * validity, with coverage reported.
   */
  maxPhaseTrackingDeg?: number;
}

export type RequirementId = 'spl-window' | 'phase-tracking';

/** Which requirements the ladder may relax. Both of them — they are taste. */
export const RELAXABLE: readonly RequirementId[] = ['spl-window', 'phase-tracking'];

/** One requirement's verdict about one candidate. */
export interface RequirementVerdict {
  requirement: RequirementId;
  title: string;
  /** 'system', or the crossover region this applies to. */
  subject: string;
  value: number | null;
  unit: string;
  /** The limit in force — AFTER any relaxation. Null when none was stated. */
  limit: number | null;
  /** The limit the DESIGNER stated, before relaxation. Null when none. */
  statedLimit: number | null;
  active: boolean;
  pass: boolean;
  /** How far outside, in the requirement's own unit. 0 or negative = inside. */
  missBy: number | null;
  reason: string;
}

export interface RequirementEvaluation {
  verdicts: RequirementVerdict[];
  failures: RequirementVerdict[];
  /** True when every ACTIVE requirement passes. Vacuously true with none set. */
  feasible: boolean;
  /** The worst miss per requirement id, for the best-missed diagnosis. */
  missBy: Partial<Record<RequirementId, number>>;
}

/** What one candidate offers up to be judged. */
export interface CandidateMeasurements {
  response: ResponseJudgement | null;
  /** Mean |Δφ| per crossover region, with the region's own label. */
  phaseTracking: { subject: string; meanAbsDeg: number }[];
}

/**
 * THE comparison. One rule, both requirements, exactly as `judge()` is the one
 * rule for the gates — and for the same reason: a limit re-tested in several
 * places with slightly different words is how a design comes to be accepted
 * and rejected in the same run.
 */
function judge(args: {
  requirement: RequirementId;
  title: string;
  subject: string;
  value: number | null;
  unit: string;
  limit: number | undefined;
  statedLimit: number | undefined;
  show: (v: number) => string;
}): RequirementVerdict {
  const base = {
    requirement: args.requirement,
    title: args.title,
    subject: args.subject,
    value: args.value,
    unit: args.unit,
    statedLimit: args.statedLimit ?? null,
  };
  if (args.limit === undefined || !Number.isFinite(args.limit)) {
    return {
      ...base,
      limit: null,
      active: false,
      pass: true,
      missBy: null,
      reason:
        args.value === null
          ? 'not evaluated, and no requirement stated'
          : `${args.show(args.value)} — no requirement stated`,
    };
  }
  if (args.value === null) {
    return {
      ...base,
      limit: args.limit,
      active: true,
      // Same rule as the gates: "we could not look" is not "it failed".
      pass: true,
      missBy: null,
      reason: `asked for ${args.show(args.limit)}, but this could not be evaluated`,
    };
  }
  // Every requirement here is an UPPER bound — a window and a tracking error
  // are both "no more than". A lower-bound requirement would need its own
  // direction field; none exists, and inventing one for symmetry would be
  // inventing a requirement nobody asked for.
  const miss = args.value - args.limit;
  const ok = miss <= 0;
  return {
    ...base,
    limit: args.limit,
    active: true,
    pass: ok,
    missBy: miss,
    reason: ok
      ? `${args.show(args.value)} within ${args.show(args.limit)}`
      : `${args.show(args.value)} misses ${args.show(args.limit)} by ${args.show(miss)}`,
  };
}

/**
 * Evaluate one candidate against the requirements in force.
 *
 * `inForce` is what the ladder currently allows, `stated` is what the designer
 * asked for. On the first pass they are the same object; on every rung of the
 * ladder they differ, and carrying both is what lets a verdict say "meets
 * ±2.25 — you asked for ±1.5" instead of quietly showing the relaxed number.
 */
export function evaluateRequirements(
  m: CandidateMeasurements,
  inForce: RequirementSettings,
  stated: RequirementSettings = inForce,
): RequirementEvaluation {
  const verdicts: RequirementVerdict[] = [];

  verdicts.push(
    judge({
      requirement: 'spl-window',
      title: 'SPL window against the target curve',
      subject: 'system',
      value: m.response ? m.response.windowPlusMinusDb : null,
      unit: 'dB',
      limit: inForce.splWindowPlusMinusDb,
      statedLimit: stated.splWindowPlusMinusDb,
      show: (v) => `±${v.toFixed(2)} dB`,
    }),
  );

  // Per crossover region: a three-way that tracks beautifully at one handover
  // and badly at the other has not met a phase requirement, and a single
  // averaged number would let it.
  if (m.phaseTracking.length === 0) {
    verdicts.push(
      judge({
        requirement: 'phase-tracking',
        title: 'Phase tracking through the crossover',
        subject: 'system',
        value: null,
        unit: '°',
        limit: inForce.maxPhaseTrackingDeg,
        statedLimit: stated.maxPhaseTrackingDeg,
        show: (v) => `${v.toFixed(1)}°`,
      }),
    );
  } else {
    for (const p of m.phaseTracking) {
      verdicts.push(
        judge({
          requirement: 'phase-tracking',
          title: 'Phase tracking through the crossover',
          subject: p.subject,
          value: p.meanAbsDeg,
          unit: '°',
          limit: inForce.maxPhaseTrackingDeg,
          statedLimit: stated.maxPhaseTrackingDeg,
          show: (v) => `${v.toFixed(1)}°`,
        }),
      );
    }
  }

  const failures = verdicts.filter((v) => v.active && !v.pass);
  const missBy: Partial<Record<RequirementId, number>> = {};
  for (const v of verdicts) {
    if (!v.active || v.missBy === null) continue;
    const prev = missBy[v.requirement];
    if (prev === undefined || v.missBy > prev) missBy[v.requirement] = v.missBy;
  }
  return { verdicts, failures, feasible: failures.length === 0, missBy };
}

/** True when the project stated any taste requirement at all. */
export function anyRequirementActive(s: RequirementSettings): boolean {
  return s.splWindowPlusMinusDb !== undefined || s.maxPhaseTrackingDeg !== undefined;
}

/** Stable serialisation of the STATED requirements, for the shortlist stamp. */
export function requirementSettingsKey(s: RequirementSettings): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.splWindowPlusMinusDb !== undefined) out.splWindowPlusMinusDb = s.splWindowPlusMinusDb;
  if (s.maxPhaseTrackingDeg !== undefined) out.maxPhaseTrackingDeg = s.maxPhaseTrackingDeg;
  return out;
}

/**
 * The best-missed line for an empty feasible region.
 *
 * "Nothing qualified" is useless; "phase missed by 2.1°, window and the gates
 * were met" tells a designer which knob to turn. Built from the CLOSEST
 * candidate per requirement rather than from any single one, because the
 * design that came nearest on phase is rarely the one that came nearest on
 * the window, and pretending otherwise hides the real trade-off.
 */
export function describeBestMisses(
  perCandidate: readonly RequirementEvaluation[],
  gatesByCandidate: readonly GateVerdict[][] = [],
): string[] {
  if (perCandidate.length === 0) return ['No candidate was evaluated at all.'];
  const lines: string[] = [];
  const ids: RequirementId[] = ['spl-window', 'phase-tracking'];
  for (const id of ids) {
    let best: number | null = null;
    for (const e of perCandidate) {
      const m = e.missBy[id];
      if (m === undefined) continue;
      if (best === null || m < best) best = m;
    }
    if (best === null) continue;
    const label = id === 'spl-window' ? 'the SPL window' : 'phase tracking';
    lines.push(
      best <= 0
        ? `${label}: met by at least one candidate`
        : `${label}: missed by ${best.toFixed(2)} at best`,
    );
  }
  const gateFailures = new Set<string>();
  for (const vs of gatesByCandidate) {
    for (const v of vs) if (v.active && !v.pass) gateFailures.add(v.gate);
  }
  if (gateFailures.size > 0) {
    lines.push(
      `gates refusing candidates: ${[...gateFailures].sort().join(', ')} — these are protection ` +
        'limits and the relaxation ladder will not touch them',
    );
  }
  const feasibleCount = perCandidate.filter((e) => e.feasible).length;
  lines.push(
    `${feasibleCount} of ${perCandidate.length} candidates met every stated requirement ` +
      `(${((feasibleCount / perCandidate.length) * PERCENT).toFixed(0)} %).`,
  );
  return lines;
}
