/**
 * DELIVERABLE 1 + 3 — THE v2 OPTIMISATION PATH.
 *
 * One entry point, behind the façade. It does four things the v1 path does
 * not, and nothing else:
 *
 *   · it is SEEDED and BUDGETED, and stamps a fingerprint on every result
 *     (A5e.4, the decision this phase takes — see `determinism.ts`);
 *   · it enforces the M-A/M-B/M-C gates as a FEASIBILITY FILTER on candidates
 *     and as a HARD BOUND inside the polish (A3/P2, Deliverable 3);
 *   · it hands the tuner a SEARCH BOX narrowed by the measurement-derived
 *     budget inversions (A5d.6, Deliverable 4);
 *   · it reports the gate status PER CANDIDATE, not only for the winner.
 *
 * WHERE THE ACTUAL SEARCH HAPPENS: in `optimizeNetworkValues`, unchanged.
 * This is not a second optimiser. The v1 tuner is a large, well-tested piece
 * of machinery and rewriting it would put the toggle invariant at risk for no
 * benefit; what F2 adds is the two hooks the tuner did not have (a
 * feasibility question and a set of derived ceilings) and the orchestration
 * around them. The tuner remains engine-agnostic and never imports engine2 —
 * the dependency arrow only points this way, and `toggleRegression.test.ts`
 * still pins it.
 *
 * WHY THE FAÇADE IS A GUARD AND NOT A LABEL. `runV2Optimization` refuses to
 * run unless the selection it is handed says `optimizer: 'v2'`. That keeps
 * `EngineSelection.optimizer` load-bearing rather than decorative: there is
 * no path into this file that does not go through the flag, so "with the
 * toggle off the app is byte-identical" stays a statement about code that
 * cannot be reached rather than about code that chooses not to act.
 */

import type { Complex } from '../../complex.ts';
import type { GriddedResponse, TweeterAdjust } from '../../dsp.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { Netlist } from '../../network.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover } from '../../parsers/vxp.ts';
import {
  optimizeNetworkValues,
  type NetOptimizeOptions,
  type NetOptimizeResult,
} from '../../netOptimizer.ts';
import { RUN_START_JITTER_DECADES } from '../constants.ts';
import type { EngineSelection } from '../facade.ts';
import {
  fingerprintComponents,
  fingerprintOf,
  resolveDeterminism,
  stableJson,
  stream,
  type DeterminismSettings,
  type FingerprintComponent,
  type ResolvedDeterminism,
} from './determinism.ts';
import { measurementFactsKey } from './measurementFacts.ts';
import {
  choicesKey,
  GREY_KEYS,
  type CandidateChoices,
  type GreyWeights,
  type InheritableTuneOptions,
} from './choices.ts';
import {
  anyGateActive,
  evaluateGates,
  gateSettingsKey,
  type GateEvaluation,
  type GateReference,
  type GateSettings,
  type GateVerdict,
} from './gates.ts';
import { budgetSettingsKey, searchBoxFor, type BudgetSettings, type InvertedBound, type SearchBox } from './bounds.ts';

export interface V2OptimizeInput {
  /** The engine selection. Anything but `optimizer: 'v2'` is refused. */
  selection: EngineSelection;
  /** The design the run starts from. */
  seedParts: readonly VxpPart[];
  grid: readonly number[];
  wBase: GriddedResponse;
  tBase: GriddedResponse;
  driverZ: Record<string, readonly Complex[]>;
  adjust: TweeterAdjust;
  /**
   * Tuner options a v2 run may INHERIT — the polish half, and nothing else.
   *
   * F4c narrowed this from "everything but the three v2 owns" to "everything
   * that is not a choice and not a grey weight". The compiler is the guard: a
   * caller that tries to hand a slope target, a cage, a pin or a phase weight
   * through here no longer compiles, because on the v2 route those may only
   * come from `choices` and `weights` below. See `choices.ts` for why each key
   * is where it is.
   */
  tuneOptions?: Omit<
    InheritableTuneOptions,
    'gateViolation' | 'valueCeilings' | 'valueSumCeilings'
  >;
  /**
   * WHAT this run searches — the candidate, in the tuner's own vocabulary.
   *
   * A5d is the layer that produces this and F4d is what will fill it from the
   * measurements; in F4c it is filled with exactly the values the v1 chain
   * supplies today, so nothing about the search changes. What changed is that
   * they cross the border named.
   */
  choices?: Partial<CandidateChoices>;
  /**
   * The weights that shape the scalar, stated rather than inherited.
   *
   * Grey in the sense of `choices.ts`: polish in form, choice in effect. A run
   * that states none gets the tuner's own defaults — which is a decision, and
   * `notes` says so.
   */
  weights?: Partial<GreyWeights>;
  gates?: GateSettings;
  budgets?: BudgetSettings;
  determinism?: DeterminismSettings;
  /** The frozen half of the gate reference — see `freezeGateReference`. */
  gateReference: GateReference;
  /** The bounds A5d.6 inverted from the active budgets; empty = none active. */
  bounds?: readonly InvertedBound[];
}

/** One candidate the run produced, with its own gate status. */
export interface V2Candidate {
  label: string;
  /** Which starting point produced it. */
  start: number;
  parts: VxpPart[];
  net: NetOptimizeResult;
  /** On the FROZEN passbands — the reference the search was held to. */
  gatesFrozen: GateVerdict[];
  /** On the passbands this candidate's OWN crossings imply. */
  gatesDerived: GateVerdict[];
  /** True only when both evaluations agree it passes. */
  feasible: boolean;
  /** Set when the two evaluations disagree — a finding, not a rounding error. */
  passbandDisagreement: string | null;
}

export interface V2RejectedCandidate {
  label: string;
  start: number;
  reasons: string[];
  gatesFrozen: GateVerdict[];
  gatesDerived: GateVerdict[];
}

export interface V2OptimizeResult {
  fingerprint: string;
  fingerprintComponents: FingerprintComponent[];
  determinism: ResolvedDeterminism;
  /** Every DELIVERED candidate. Each one respects every active gate. */
  candidates: V2Candidate[];
  /** Everything the feasibility filter threw out, with the reason. */
  rejected: V2RejectedCandidate[];
  /** The box the search ran in, and the bounds that narrowed it. */
  searchBox: SearchBox;
  /** Every gate the project set, whether or not it bound anything. */
  gatesActive: boolean;
  notes: string[];
}

export class EngineSelectionError extends Error {}

/**
 * Nudge every free component value by a seeded amount, in log space.
 *
 * The nudge is what makes the seed do work: without it every start is the
 * same point and "different seed may differ" would be a statement about
 * nothing. Log space because component values live there — a ±0.35 decade
 * nudge means the same thing to a 0.5 µF capacitor and a 47 µF one, where a
 * ±1 µF nudge would mean "unchanged" and "deleted" respectively.
 *
 * Start 0 is deliberately the UNJITTERED seed, so a run always contains the
 * design it was asked about.
 */
function jitteredStart(parts: readonly VxpPart[], draw: () => number, index: number): VxpPart[] {
  if (index === 0) return parts.map((p) => ({ ...p, params: p.params.map((q) => ({ ...q })), wires: p.wires.map((w) => ({ ...w })) }));
  const NAME: Record<string, string> = { Resistor: 'R', Inductor: 'L', Capacitor: 'C' };
  return parts.map((p) => {
    const name = NAME[p.type];
    const clone = { ...p, wires: p.wires.map((w) => ({ ...w })) };
    if (!name || p.locked || p.open || p.shorted) {
      return { ...clone, params: p.params.map((q) => ({ ...q })) };
    }
    return {
      ...clone,
      params: p.params.map((q) => {
        if (q.name !== name || !(q.value > 0)) return { ...q };
        const decades = (draw() * 2 - 1) * RUN_START_JITTER_DECADES;
        return { ...q, value: Number((q.value * 10 ** decades).toPrecision(4)) };
      }),
    };
  });
}

const netlistOf = (parts: readonly VxpPart[]): Netlist =>
  crossoverToNetlist({ name: 'v2-candidate', parts: [...parts] } as VxpCrossover).netlist;

/** Stable, readable identity of a network — a fingerprint ingredient. */
function designKey(parts: readonly VxpPart[]): string {
  const NAME: Record<string, string> = { Resistor: 'R', Inductor: 'L', Capacitor: 'C' };
  return stableJson(
    [...parts]
      .map((p) => ({
        id: p.partId ?? '',
        type: p.type,
        model: p.model ?? '',
        value: p.params.find((q) => q.name === NAME[p.type])?.value ?? null,
        locked: p.locked === true,
        open: p.open === true,
        shorted: p.shorted === true,
        at: p.wires.map((w) => `${w.x},${w.y}`).join(';'),
      }))
      .sort((a, b) => (a.id + a.at < b.id + b.at ? -1 : 1)),
  );
}

/** Stable identity of the measurement set the run was judged on. */
function measurementKey(input: V2OptimizeInput): string {
  const round = (v: number): number => Number(v.toPrecision(9));
  return stableJson({
    grid: [input.grid[0], input.grid[input.grid.length - 1], input.grid.length].map(round),
    w: input.wBase.spl.map(round),
    t: input.tBase.spl.map(round),
    z: Object.keys(input.driverZ)
      .sort()
      .map((m) => ({ m, v: input.driverZ[m].map((c) => round(Math.hypot(c.re, c.im))) })),
    adjust: input.adjust,
  });
}

export function runV2Optimization(input: V2OptimizeInput): V2OptimizeResult {
  if (input.selection.optimizer !== 'v2') {
    throw new EngineSelectionError(
      'The v2 optimisation path was called with a selection that routes the optimiser to v1. ' +
        'This is a guard, not an inconvenience: it is what keeps "engine v2 off = the app is ' +
        'byte-identical" a statement about unreachable code (see facade.ts).',
    );
  }

  const gates = input.gates ?? {};
  const budgets = input.budgets ?? {};
  const determinism = resolveDeterminism(input.determinism);
  const notes: string[] = [];

  /* ---- the search box (A5d.6) ------------------------------------------ */
  /* V48 — NO CEILING TRACKERS ON THIS ROUTE, and that is a property of the
   * route rather than an omission. This function takes bounds that have
   * ALREADY been solved (`input.bounds`); the measured near field and sweep an
   * inversion would have to re-read never reach it, so there is nothing to
   * build a tracker from. A caller that states `seriesInductanceCeilingSource:
   * 'tuned'` here therefore gets the seed ceiling and no invented substitute
   * (P4), exactly as a run with no tracker does anywhere else. The route the
   * app takes is `handleV2Request`, which holds the measurements and hands
   * them over — see the erratum in audit §2.2 for why these two are different
   * routes at all. */
  const searchBox = searchBoxFor(input.seedParts, input.bounds ?? []);
  notes.push(...searchBox.notes);

  /* ---- the gate hook (A3) ---------------------------------------------- *
   * ONE closure, handed to the tuner, asked at every point a pass accepts a
   * network. The frozen passbands are used here on purpose — see the note at
   * the top of `gates.ts`: a reference that moves with the design is not a
   * reference, and M-C could otherwise be satisfied by relocating the
   * crossing rather than by protecting the driver. */
  const gatesArmed = anyGateActive(gates);
  const gateViolation = gatesArmed
    ? (parts: readonly VxpPart[]): string | null => {
        let netlist: Netlist;
        try {
          netlist = netlistOf(parts);
        } catch {
          // Not a solvable network: the tuner's own machinery refuses it. A
          // gate that also condemned it would misattribute the refusal.
          return null;
        }
        return evaluateGates(netlist, gates, input.gateReference, 'frozen').violation;
      }
    : undefined;

  const tuneOptions: NetOptimizeOptions = {
    // POLISH first: it may be overridden by everything below it.
    ...(input.tuneOptions ?? {}),
    // CHOICE and GREY next, named rather than spread in from v1. In F4c these
    // carry the values the v1 chain would have supplied anyway; the point is
    // that from here on they can only arrive this way.
    ...(input.choices ?? {}),
    ...(input.weights ?? {}),
    ...(gateViolation ? { gateViolation } : {}),
    ...(Object.keys(searchBox.valueCeilings).length > 0
      ? { valueCeilings: searchBox.valueCeilings }
      : {}),
    ...(searchBox.valueSumCeilings.length > 0
      ? { valueSumCeilings: searchBox.valueSumCeilings }
      : {}),
    ...(determinism.budgetEvaluations !== null
      ? { maxIterations: determinism.budgetEvaluations }
      : {}),
  };

  /* ---- the starts ------------------------------------------------------ */
  const draw = stream(determinism.seed, 'starts');
  const candidates: V2Candidate[] = [];
  const rejected: V2RejectedCandidate[] = [];

  for (let i = 0; i < determinism.starts; i++) {
    const startParts = jitteredStart(input.seedParts, draw, i);
    const label = i === 0 ? 'seed' : `start ${i}`;
    let net: NetOptimizeResult;
    try {
      net = optimizeNetworkValues(
        startParts,
        input.grid,
        input.wBase,
        input.tBase,
        input.driverZ,
        input.adjust,
        tuneOptions,
      );
    } catch (e) {
      rejected.push({
        label,
        start: i,
        reasons: [`the tuner could not run this start: ${(e as Error).message}`],
        gatesFrozen: [],
        gatesDerived: [],
      });
      continue;
    }

    /* ---- the feasibility filter (Deliverable 3) ------------------------ *
     * Judged on the DELIVERED parts, twice: on the frozen passbands the
     * search was held to, and on the passbands this candidate's own
     * crossings imply. A candidate is delivered only when both agree. */
    let frozen: GateEvaluation = { verdicts: [], failures: [], violation: null, metrics: { dissipation: null, epdr: null, driveVoltage: [] }, crossings: [] };
    let derived = frozen;
    try {
      const netlist = netlistOf(net.parts);
      frozen = evaluateGates(netlist, gates, input.gateReference, 'frozen');
      derived = evaluateGates(netlist, gates, input.gateReference, 'derived');
    } catch (e) {
      rejected.push({
        label,
        start: i,
        reasons: [`the delivered network could not be evaluated: ${(e as Error).message}`],
        gatesFrozen: [],
        gatesDerived: [],
      });
      continue;
    }

    const reasons: string[] = [];
    if (frozen.violation) reasons.push(`on the reference passbands — ${frozen.violation}`);
    if (derived.violation) reasons.push(`on its own crossings — ${derived.violation}`);
    if (net.infeasible) reasons.push(net.infeasible);

    if (reasons.length > 0) {
      rejected.push({ label, start: i, reasons, gatesFrozen: frozen.verdicts, gatesDerived: derived.verdicts });
      continue;
    }

    const disagreement = disagreementBetween(frozen.verdicts, derived.verdicts);
    candidates.push({
      label,
      start: i,
      parts: net.parts,
      net,
      gatesFrozen: frozen.verdicts,
      gatesDerived: derived.verdicts,
      feasible: true,
      passbandDisagreement: disagreement,
    });
  }

  /* ---- deterministic ordering ----------------------------------------- *
   * Ties are broken by START INDEX, never by insertion order into a map or
   * by a sort the engine happens to have. Two runs of the same input must
   * produce the same list in the same order, and "the same order" has to be
   * a stated rule rather than a property of the sort implementation. */
  candidates.sort((a, b) => {
    const ka = rankKey(a.net);
    const kb = rankKey(b.net);
    return ka === kb ? a.start - b.start : ka - kb;
  });
  rejected.sort((a, b) => a.start - b.start);

  const components = fingerprintComponents({
    determinism,
    design: designKey(input.seedParts),
    measurements: measurementKey(input),
    gates: stableJson(gateSettingsKey(gates)),
    bounds: stableJson({
      budgets: budgetSettingsKey(budgets),
      inverted: (input.bounds ?? []).map((b) => ({
        rule: b.rule,
        subject: b.subject,
        maxSI: Number(b.maxSI.toPrecision(9)),
        slack: b.slack,
      })),
    }),
    tuning: stableJson(tuningKey(input.tuneOptions ?? {})),
    // F4b — the measured facts this route was handed. It receives a FROZEN
    // gate reference rather than a payload, so the validity intervals are what
    // it can name here; R_e reached it through the bounds it was given, and
    // those are already an ingredient of `bounds` above.
    facts: stableJson(
      measurementFactsKey({ validHzByModel: input.gateReference.validHz }),
    ),
    // F4c — the candidate and the weights, as an ingredient. Two runs that
    // searched different ground, or judged the same ground on a different
    // balance, may not wear the same fingerprint.
    choices: stableJson(choicesKey(input.choices, input.weights)),
  });

  /* F4c — a grey weight nobody stated is the tuner's own default, and that is a
   * decision made by omission. Saying which ones were left to it beats leaving
   * a reader to discover it from `netOptimizer.ts`. */
  const unstated = GREY_KEYS.filter((k) => input.weights?.[k] === undefined);
  if (unstated.length > 0) {
    notes.push(
      `Weights left to the tuner's own defaults: ${unstated.join(', ')}. These shape the scalar ` +
        'and therefore which part of the field the search visits (audit §6.4), so they are ' +
        'reported rather than assumed. Stating one is a v2 decision; leaving it is also one.',
    );
  }

  if (!gatesArmed) {
    notes.push(
      'No gate limit is set, so every gate is OFF: its value is reported and nothing is judged ' +
        '(P4). Nothing was filtered out on a gate.',
    );
  }

  return {
    fingerprint: fingerprintOf(components),
    fingerprintComponents: components,
    determinism,
    candidates,
    rejected,
    searchBox,
    gatesActive: gatesArmed,
    notes,
  };
}

/**
 * The ranking key. Deliberately the delivered peak deviation and nothing
 * else — this is an ORDER, not a score, and A5e.1 (how soft goals are
 * normalised and aggregated) is an open decision.
 *
 * TODO(A5e.1): once normalisation and aggregation are settled, the ordering
 * of candidates becomes that decision's business rather than this file's.
 * Until then a single, stated, reproducible key beats a weighted sum nobody
 * agreed to.
 */
function rankKey(net: NetOptimizeResult): number {
  const v = net.after.avgDevDb ?? net.after.rippleDb;
  return Number.isFinite(v) ? v : Number.MAX_VALUE;
}

/** Which tuner options steer the SEARCH, hashed into the fingerprint. */
function tuningKey(o: Omit<NetOptimizeOptions, 'gateViolation' | 'valueCeilings' | 'valueSumCeilings'>): unknown {
  // Callbacks and measurement payloads are excluded: the first cannot be
  // serialised and the second is already a fingerprint component of its own.
  const { onStage: _s, safety: _y, angleData: _a, branchTargets: _b, midBranch: _m, ...rest } = o;
  void _s;
  void _y;
  void _a;
  void _b;
  void _m;
  return rest;
}

/**
 * Whether the two passband conventions disagree about any ACTIVE gate.
 *
 * Only ever a report line: a candidate that fails either one is already
 * rejected, so what remains here is the case where both pass but the margins
 * differ enough to be worth a designer's attention.
 */
function disagreementBetween(
  frozen: readonly GateVerdict[],
  derived: readonly GateVerdict[],
): string | null {
  const lines: string[] = [];
  for (const f of frozen) {
    if (!f.active || f.gate !== 'M-C') continue;
    const d = derived.find((x) => x.gate === f.gate && x.subject === f.subject);
    if (!d || d.value === null || f.value === null) {
      lines.push(
        `${f.subject}: M-C is judged on the reference passband but this candidate's own ` +
          'crossings no longer produce one for it',
      );
      continue;
    }
    const gap = Math.abs(d.value - f.value);
    if (gap >= 1) {
      lines.push(
        `${f.subject}: M-C reads ${f.value.toFixed(1)} dB on the reference passband and ` +
          `${d.value.toFixed(1)} dB on this candidate's own — the handover moved`,
      );
    }
  }
  return lines.length ? lines.join('; ') : null;
}
