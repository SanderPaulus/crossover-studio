/**
 * F2b — THE v2 WORKER ENTRY.
 *
 * WHY A SECOND WORKER AT ALL, written down because the alternative looks
 * cheaper and is not.
 *
 * A5e.4 and A3 together force this file into existence. Gate enforcement has
 * to happen INSIDE the polish — "grenshandhaving zit in de kern", because a
 * limit checked only afterwards is a limit the search spends its whole budget
 * ignoring — and the only legitimate evaluator of M-A/M-B/M-C is the F1 metric
 * library. So the module that hosts the tuner during a v2 run must be able to
 * call `engine2/`. `optimWorker.ts` may not: the toggle invariant rests on the
 * dependency arrow pointing one way, and `toggleRegression.test.ts` asserts it
 * by scanning the tree. Teaching that worker to import engine2 would trade a
 * proven invariant for a saved file.
 *
 * So the v1 worker is left BYTE-UNTOUCHED and this one is added beside it,
 * inside `engine2/` where the import is not an exception at all. With the
 * toggle off this module is never even instantiated — it is a separate bundle
 * chunk behind a dynamic `new Worker(new URL(...))`, so "off = byte-identical"
 * stays a claim about code that cannot run rather than code that behaves.
 *
 * WHAT IT ADDS TO A CHAIN RUN, and it is exactly three things:
 *
 *  1. THE GATE HOOK, frozen at the right moment. The chain hands it the
 *     assembled seed immediately before the tune (`ChainEngineHooks`), which
 *     is the first instant a network exists and therefore the only correct
 *     moment to freeze M-C's passbands (casebook V16b).
 *  2. THE SEARCH BOX from the active budgets (A5d.6), inverted on the same
 *     measured impedance the chain is about to tune against.
 *  3. THE VERDICTS, per candidate, on the delivered network — computed by the
 *     one assembly the report also uses, so the scan table and the panel
 *     cannot disagree about a design.
 *
 * It does NOT re-implement the chain, the tuner or any metric. Everything
 * here is wiring plus the two evaluations the wiring exists to make possible.
 */

import { applyCatalogPayload, type CatalogPart, type CatalogSeries } from '../../catalog.ts';
import type { Complex } from '../../complex.ts';
import { runDesignChain, type ChainInput, type ChainResult, type ChainStageProgress } from '../../designChain.ts';
import { runThreeWayChain, type Chain3Input, type Chain3Result } from '../../threeWayChain.ts';
import { busTopology, type NetOptimizeOptions } from '../../netOptimizer.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { VxpCrossover } from '../../parsers/vxp.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import { classifyImpedance, estimateRe } from '../ingest/impedance.ts';
import {
  evaluateGates,
  freezeGateReference,
  type GateReference,
  type GateSettings,
  type GateVerdict,
} from './gates.ts';
import {
  invertBudgets,
  passbandImpedanceMedian,
  searchBoxFor,
  type BudgetSettings,
  type BudgetWay,
  type InvertedBound,
} from './bounds.ts';
import type { DeterminismSettings } from './determinism.ts';
import { applyTransfer, combineN, type GriddedResponse } from '../../dsp.ts';
import { solveNetwork } from '../../network.ts';
import { pickSlotsN } from '../../driverSlots.ts';
import { judgeResponse, type ResponseJudgement } from '../requirements/response.ts';
import { FLAT_TARGET, type TargetCurve } from '../requirements/targetCurve.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { TopologyDescriptor } from './diversity.ts';

/* ================================================================== *
 * The wire format
 * ================================================================== */

/** The catalog payload, in the same shape the v1 worker already receives. */
export interface V2CatalogPayload {
  series: CatalogSeries[];
  parts: CatalogPart[];
  disabled?: string[];
}

/**
 * Everything a v2 run needs on top of the chain input — all of it plain data,
 * because it crosses `postMessage`.
 *
 * Deliberately NOT the gate reference itself: that is derived here, from the
 * measurements the chain input already carries, so the main thread cannot
 * hand the worker a reference that disagrees with the impedances the tune is
 * about to run on.
 */
export interface V2RunSettings {
  gates: GateSettings;
  budgets: BudgetSettings;
  determinism: DeterminismSettings;
  /**
   * Measured DC resistance per driver MODEL. A4 lists R_e as a declared data
   * need and V8d says why the derived value cannot silently stand in for it;
   * absent per driver = the derived estimate is used and the bound says so.
   */
  reOhmByModel?: Record<string, number>;
  /**
   * F3 — the design's target curve. Absent = flat (A5e.2), which is what a
   * project that has never stated one means.
   */
  targetCurve?: TargetCurve;
  /**
   * The band the SPL window and the RMS deviation are judged on. The caller
   * clips it to measurement validity (A5.5); this worker does not invent a
   * lower edge.
   */
  judgeBandHz?: [number, number];
}

export interface V2Chain3Payload {
  input: Chain3Input;
  v2: V2RunSettings;
}

export interface V2ChainOnePayload {
  input: ChainInput;
  label: string;
  v2: V2RunSettings;
}

/** What one v2 candidate returns: the chain's own result, plus the verdicts. */
export interface V2CandidateResult<R> {
  result: R;
  /** On the frozen reference the search was held to. */
  gates: GateVerdict[];
  /** On the passbands this candidate's own crossings imply. */
  gatesDerived: GateVerdict[];
  /** Null when nothing active failed on either evaluation. */
  violation: string | null;
  /** The bounds the active budgets inverted to, for this candidate. */
  bounds: InvertedBound[];
  /** Polish steps the gate hook refused during this candidate's tune. */
  gateRefusals: string[];
  /**
   * F3 — what the shortlist judges this candidate on. Computed HERE, on the
   * delivered network, because the worker already holds the solved branches
   * and the main thread would otherwise have to re-solve every candidate just
   * to sort a table.
   */
  measurements: CandidateMeasurements;
  /** F3 — the topology class this design belongs to (A5e.1). */
  topology: TopologyDescriptor;
  notes: string[];
}

export type V2Request = { id: number; catalog?: V2CatalogPayload | null } & (
  | { kind: 'v2Chain3One'; payload: V2Chain3Payload }
  | { kind: 'v2ChainOne'; payload: V2ChainOnePayload }
);

export type V2Response =
  | { id: number; kind: 'progress'; data: ChainStageProgress & { variant: string } }
  | { id: number; kind: 'done'; data: unknown }
  | { id: number; kind: 'error'; message: string };

/** How a response leaves this module. A parameter, so the handler below can
 *  be driven by a test without a `Worker` in sight — see `handleV2Request`. */
export type V2Post = (m: V2Response) => void;

/* ================================================================== *
 * Building the run
 * ================================================================== */

const netlistOf = (parts: readonly VxpPart[]) =>
  crossoverToNetlist({ name: 'v2-candidate', parts: [...parts] } as VxpCrossover).netlist;

/** |Z| and phase of a gridded complex impedance, as the extractors want it. */
function curveOf(grid: readonly number[], z: readonly Complex[]) {
  return {
    freq: grid,
    magnitude: z.map((c) => Math.hypot(c.re, c.im)),
    phaseDeg: z.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI), // P6-OK: rad→deg
  };
}

/**
 * Everything about the measurement set that the gates and the bounds read.
 *
 * Derived ONCE per candidate from the chain input, so the reference, the
 * budget inversion and the tune all describe the same impedances. f_s comes
 * from the classifier rather than from "the tallest peak": a cone mode shows a
 * genuine phase zero crossing and is still not f_s (V8b).
 */
function measurementFacts(
  grid: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
  branchDb: Record<string, readonly number[]>,
  reOhmByModel: Record<string, number> | undefined,
) {
  const fsHz: Record<string, number> = {};
  const validHz: Record<string, [number, number]> = {};
  const reOhm: Record<string, { ohm: number; source: string }> = {};
  const zMagnitude: Record<string, number[]> = {};
  const band: [number, number] = [grid[0], grid[grid.length - 1]];
  for (const model of Object.keys(driverZ).sort()) {
    const curve = curveOf(grid, driverZ[model]);
    zMagnitude[model] = curve.magnitude;
    const stated = reOhmByModel?.[model];
    const derived = estimateRe(curve);
    const re = stated ?? derived?.ohm ?? null;
    if (re !== null) {
      reOhm[model] = {
        ohm: re,
        source:
          stated !== undefined
            ? 'measured DC resistance entered for this driver'
            : 'derived from Re(Z) at the bottom of the impedance sweep',
      };
    }
    if (re !== null) {
      const fs = classifyImpedance(curve, re).fundamentalHz;
      if (fs !== null) fsHz[model] = fs;
    }
    validHz[model] = band;
  }
  return { fsHz, validHz, reOhm, zMagnitude, branchDb, grid, driverZ };
}

type Facts = ReturnType<typeof measurementFacts>;

/**
 * The tuner options a v2 run adds, built the moment the seed network exists.
 *
 * This is the function the chain calls through `ChainEngineHooks`, and every
 * line of it is why this file may import `engine2/`.
 */
function tuneOptionsFor(
  seedParts: readonly VxpPart[],
  facts: Facts,
  v2: V2RunSettings,
  collect: { reference: GateReference | null; bounds: InvertedBound[]; notes: string[] },
): Partial<NetOptimizeOptions> {
  let reference: GateReference;
  try {
    reference = freezeGateReference({
      netlist: netlistOf(seedParts),
      grid: [...facts.grid],
      driverZ: facts.driverZ,
      branchDb: facts.branchDb,
      fsHz: facts.fsHz,
      validHz: facts.validHz,
    });
  } catch (e) {
    // An unsolvable seed is the chain's problem, not the gate's. Adding
    // nothing leaves the tune exactly as a v1 run would have made it, and the
    // candidate's own machinery reports the failure.
    collect.notes.push(`the gate reference could not be frozen on this seed: ${(e as Error).message}`);
    return {};
  }
  collect.reference = reference;

  /* ---- the budget inversions (A5d.6) --------------------------------- */
  const ways: BudgetWay[] = [];
  const order = [...reference.frozenHighPassProtected];
  const models = Object.keys(facts.driverZ).sort((a, b) => {
    // Lowest way first, by where the frozen passband starts. Derived, not
    // named: nothing here counts ways or knows what a "woofer" is.
    const pa = reference.frozenPassbandHz[a]?.[0] ?? Infinity;
    const pb = reference.frozenPassbandHz[b]?.[0] ?? Infinity;
    return pa - pb;
  });
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const pass = reference.frozenPassbandHz[model] ?? facts.validHz[model];
    ways.push({
      driver: model,
      lowest: i === 0,
      highPassProtected: order.includes(model),
      reOhm: facts.reOhm[model]?.ohm ?? null,
      reSource: facts.reOhm[model]?.source ?? 'not available',
      zPassbandMedianOhm: passbandImpedanceMedian(facts.grid, facts.zMagnitude[model], pass),
      passbandHz: pass,
      fsHz: facts.fsHz[model] ?? null,
      fPeakHz: facts.fsHz[model] ?? null,
      // TODO(A5e.2): the anchored attenuation budget wants the anchor level
      // AFTER baffle step in the intended setup, which is a property of the
      // target-curve object. Until that decision is taken the damping bound
      // has no measured budget to sit on in this route, so it is not applied
      // here — and saying so beats inventing a gap.
      gapBudgetDb: null,
      pathROhm: seriesPathResistance(seedParts, model),
    });
  }
  const inverted = invertBudgets(ways, v2.budgets, v2.gates);
  collect.bounds = inverted.bounds;
  collect.notes.push(...inverted.notes);
  if (v2.budgets.dampingMarginDb !== undefined) {
    collect.notes.push(
      'The damping margin is stated but not applied on this route: A5d.4 measures the budget it ' +
        'sits on top of against the anchor level AFTER baffle step, and that is the target-curve ' +
        'object (open decision A5e.2).',
    );
  }
  const box = searchBoxFor(seedParts, inverted.bounds);
  collect.notes.push(...box.notes);

  /* ---- the gate hook -------------------------------------------------- */
  const armed =
    v2.gates.maxDissipationFraction !== undefined ||
    v2.gates.minEpdrOhm !== undefined ||
    v2.gates.ampMinLoadOhm !== undefined ||
    v2.gates.maxDriveOnFsDb !== undefined;

  return {
    ...(armed
      ? {
          gateViolation: (parts: readonly VxpPart[]): string | null => {
            let netlist;
            try {
              netlist = netlistOf(parts);
            } catch {
              return null;
            }
            return evaluateGates(netlist, v2.gates, reference, 'frozen').violation;
          },
        }
      : {}),
    ...(Object.keys(box.valueCeilings).length > 0 ? { valueCeilings: box.valueCeilings } : {}),
    ...(box.valueSumCeilings.length > 0 ? { valueSumCeilings: box.valueSumCeilings } : {}),
    ...(v2.determinism.budgetEvaluations !== undefined
      ? { maxIterations: v2.determinism.budgetEvaluations }
      : {}),
  };
}

/** Series resistance already sitting in one way's path (coil DCR included). */
function seriesPathResistance(parts: readonly VxpPart[], model: string): number {
  // The app's own bus walk, not a second opinion about what "series" means.
  const bus = busTopology(parts);
  let total = 0;
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(model)) continue;
    if (p.type === 'Resistor') total += p.params.find((q) => q.name === 'R')?.value ?? 0;
    if (p.type === 'Inductor') total += p.params.find((q) => q.name === 'DCR')?.value ?? 0;
  }
  return total;
}

/* ================================================================== *
 * F3 — what the shortlist judges a candidate on
 * ================================================================== */

/**
 * The SUMMED system response of a delivered network, on the measurement grid.
 *
 * The same product the simulation shows: measured pressure per way times the
 * electrical transfer its branch produces. Solved here rather than on the main
 * thread because this worker already has the netlist and the impedances in
 * hand, and re-solving every candidate just to sort a table would double the
 * cost of the scan for a column.
 */
function summedResponse(
  parts: readonly VxpPart[],
  grid: readonly number[],
  branches: { model: string; response: GriddedResponse }[],
  driverZ: Record<string, readonly Complex[]>,
): GriddedResponse | null {
  let sol;
  try {
    sol = solveNetwork(netlistOf(parts), grid, driverZ);
  } catch {
    return null;
  }
  const slots = pickSlotsN(sol.drivers);
  if (slots.ambiguous) return null;
  const idFor = (model: string): string | null => {
    const d = sol.drivers.find((x) => x.model === model);
    return d ? d.id : null;
  };
  const filtered: { response: GriddedResponse }[] = [];
  for (const b of branches) {
    const id = idFor(b.model);
    const h = id ? sol.transfers[id] : null;
    if (!h) continue;
    filtered.push({ response: applyTransfer(b.response, h) });
  }
  if (filtered.length === 0) return null;
  const combined = combineN(filtered);
  return {
    freq: combined.freq,
    spl: combined.combinedSpl,
    phaseDeg: combined.combinedPhaseDeg,
  };
}

/**
 * The topology class of a delivered candidate, from the specs the DESIGN step
 * settled — never from the tuned component values.
 *
 * A design is a fourth-order Linkwitz-Riley because that is what was designed;
 * reading an order back out of tuned values would be inferring the intent from
 * the execution, and the tuner is allowed to move values as far as the gates
 * and bounds let it.
 */
function topologyOf(
  specs: Record<string, { hp: FilterFlank; lp: FilterFlank }>,
  inverted: string[],
): TopologyDescriptor {
  const flanks: { way: string; side: 'hp' | 'lp'; kind: string; order: number }[] = [];
  for (const way of Object.keys(specs).sort()) {
    for (const side of ['hp', 'lp'] as const) {
      const f = specs[way][side];
      // A disabled flank is not a flank: it is its absence, and two designs
      // that differ by whether a flank exists at all are different shapes.
      if (!f?.enabled) continue;
      flanks.push({ way, side, kind: f.kind, order: f.order });
    }
  }
  return { flanks, inverted: [...inverted].sort() };
}

interface FilterFlank {
  enabled: boolean;
  kind: string;
  order: number;
}

/* ================================================================== *
 * Running one candidate
 * ================================================================== */

function runCandidate<I, R extends { parts: VxpPart[]; net: { gateRefusals?: string[] } }>(
  input: I,
  v2: V2RunSettings,
  facts: Facts,
  run: (hooks: { tuneOptionsFor: (seed: readonly VxpPart[]) => Partial<NetOptimizeOptions> }) => R,
  /** F3 — what this candidate is judged on, once it exists. */
  judge: (r: R) => { measurements: CandidateMeasurements; topology: TopologyDescriptor },
): V2CandidateResult<R> {
  const collect: { reference: GateReference | null; bounds: InvertedBound[]; notes: string[] } = {
    reference: null,
    bounds: [],
    notes: [],
  };
  void input;
  const result = run({
    tuneOptionsFor: (seed) => tuneOptionsFor(seed, facts, v2, collect),
  });

  let gates: GateVerdict[] = [];
  let gatesDerived: GateVerdict[] = [];
  let violation: string | null = null;
  if (collect.reference) {
    try {
      const netlist = netlistOf(result.parts);
      const frozen = evaluateGates(netlist, v2.gates, collect.reference, 'frozen');
      const derived = evaluateGates(netlist, v2.gates, collect.reference, 'derived');
      gates = frozen.verdicts;
      gatesDerived = derived.verdicts;
      // Judged on BOTH conventions, and a failure on either is a failure —
      // see the note at the top of `gates.ts` about a reference that moves.
      violation =
        frozen.violation && derived.violation
          ? `${frozen.violation}; and on its own crossings — ${derived.violation}`
          : (frozen.violation ?? derived.violation);
    } catch (e) {
      collect.notes.push(`the delivered network could not be judged: ${(e as Error).message}`);
    }
  }

  const judged = judge(result);

  return {
    result,
    gates,
    gatesDerived,
    violation,
    bounds: collect.bounds,
    gateRefusals: result.net.gateRefusals ?? [],
    measurements: judged.measurements,
    topology: judged.topology,
    notes: collect.notes,
  };
}

/** The band the response judgement runs on, when the caller states none. */
function judgeBandOf(v2: V2RunSettings, grid: readonly number[]): [number, number] {
  return v2.judgeBandHz ?? [grid[0], grid[grid.length - 1]];
}

/**
 * THE HANDLER, exported and free of `self`.
 *
 * The worker entry below is three lines of wiring around this function, and
 * the split is what makes the route TESTABLE. A determinism claim about "the
 * v2 worker" that was only ever checked by calling the chain directly is a
 * claim about a different code path than the one the app uses; running the
 * real request through this function — payload round-tripped through
 * `structuredClone`, exactly as `postMessage` would — checks the route the
 * scan button takes. What is left untested is the browser's own message
 * plumbing, which is not ours.
 */
export function handleV2Request(req: V2Request, post: V2Post): void {
  try {
    if (req.catalog) applyCatalogPayload(req.catalog);
    let data: unknown;
    switch (req.kind) {
      case 'v2Chain3One': {
        const { input, v2 } = req.payload;
        const facts = measurementFacts(
          input.grid,
          input.driverZ,
          { woofer: input.w.spl, mid: input.m.spl, tweeter: input.t.spl },
          v2.reOhmByModel,
        );
        data = runCandidate<Chain3Input, Chain3Result>(
          input,
          v2,
          facts,
          (hooks) =>
            runThreeWayChain(
              input,
              (pr) => post({ id: req.id, kind: 'progress', data: { ...pr, variant: input.label } }),
              hooks,
            ),
          (r) => {
            const sum = summedResponse(
              r.parts,
              input.grid,
              [
                { model: 'woofer', response: input.w },
                { model: 'mid', response: input.m },
                { model: 'tweeter', response: input.t },
              ],
              input.driverZ,
            );
            const band = judgeBandOf(v2, input.grid);
            const response: ResponseJudgement | null = sum
              ? judgeResponse(sum.freq, sum.spl, v2.targetCurve ?? FLAT_TARGET, band)
              : null;
            // The phase tracking the tuner already delivered, per adjacent
            // pair — the existing metric, not a second opinion about it.
            const pairs = r.net.after.pairPhaseDeg ?? [];
            const labels = ['woofer|mid', 'mid|tweeter'];
            return {
              measurements: {
                response,
                phaseTracking: pairs
                  .map((deg, i) => ({ subject: labels[i] ?? `pair ${i}`, meanAbsDeg: deg }))
                  .filter((x) => Number.isFinite(x.meanAbsDeg)),
              },
              topology: topologyOf(
                {
                  woofer: r.specs.woofer,
                  mid: r.specs.mid,
                  tweeter: r.specs.tweeter,
                },
                [...(r.midInverted ? ['mid'] : []), ...(r.tweeterInverted ? ['tweeter'] : [])],
              ),
            };
          },
        );
        break;
      }
      case 'v2ChainOne': {
        const { input, label, v2 } = req.payload;
        const facts = measurementFacts(
          input.grid,
          input.driverZ,
          { mid: input.w.spl, tweeter: input.t.spl },
          v2.reOhmByModel,
        );
        data = runCandidate<ChainInput, ChainResult>(
          input,
          v2,
          facts,
          (hooks) =>
            runDesignChain(
              input,
              label,
              (pr) => post({ id: req.id, kind: 'progress', data: { ...pr, variant: label } }),
              hooks,
            ),
          (r) => {
            const sum = summedResponse(
              r.parts,
              input.grid,
              [
                { model: 'mid', response: input.w },
                { model: 'tweeter', response: input.t },
              ],
              input.driverZ,
            );
            const band = judgeBandOf(v2, input.grid);
            return {
              measurements: {
                response: sum
                  ? judgeResponse(sum.freq, sum.spl, v2.targetCurve ?? FLAT_TARGET, band)
                  : null,
                phaseTracking: Number.isFinite(r.net.after.phaseDeg)
                  ? [{ subject: 'low|high', meanAbsDeg: r.net.after.phaseDeg }]
                  : [],
              },
              // TODO(F2c/F3): the two-way chain settles its structure inside
              // `vf`, which does not expose flanks the way the three-way
              // `specs` do. Until that route is wired to v2 (TODO(F2c)) this
              // is an empty descriptor rather than a guess — an invented
              // topology class would silently group unrelated designs.
              topology: { flanks: [], inverted: [] },
            };
          },
        );
        break;
      }
    }
    post({ id: req.id, kind: 'done', data });
  } catch (err) {
    post({ id: req.id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

/* The worker entry itself. Guarded so that importing this module outside a
 * worker — which the tests do — wires nothing and constructs nothing. */
if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  self.onmessage = (e: MessageEvent<V2Request>) => {
    handleV2Request(e.data, (m) => (self as unknown as Worker).postMessage(m));
  };
}
