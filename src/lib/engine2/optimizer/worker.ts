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
import { busTopology, busTopologyOfNetlist, type NetOptimizeOptions } from '../../netOptimizer.ts';
import type { NetElement, Netlist } from '../../network.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { VxpCrossover } from '../../parsers/vxp.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import { classifyImpedance, estimateRe } from '../ingest/impedance.ts';
import { DEG_PER_HALF_TURN, H_PER_MH } from '../constants.ts';
import {
  anyGateActive,
  evaluateGates,
  freezeGateReference,
  type GateReference,
  type GateSettings,
  type GateVerdict,
  type MeasuredSweep,
} from './gates.ts';
import type { DissipationResult } from '../metrics/electrical.ts';
import type { CoilLoad, ResistorLoad } from '../metrics/buildability.ts';
import { partRatingsOf } from './partRatings.ts';
import { lfBump } from '../metrics/acoustic.ts';
import { buildAnalysis } from '../metrics/analysis.ts';
import type { DissipationColumn } from './shortlist.ts';
import {
  invertBudgets,
  passbandImpedanceMedian,
  searchBoxFor,
  type BudgetSettings,
  type BudgetWay,
  type InvertedBound,
} from './bounds.ts';
import type { DeterminismSettings } from './determinism.ts';
import {
  CHOICE_KEYS,
  GREY_KEYS,
  declarationCoverage,
  type CandidateChoices,
  type ChoiceDeclaration,
  type GreyWeights,
} from './choices.ts';
import {
  CHAIN_CHOICE_KEYS,
  chainDeclarationCoverage,
  withDeclaredChainChoices,
  type ChainChoiceDeclaration,
} from './chainChoices.ts';
import type {
  MeasurementFactsPayload,
  MeasurementProvenance,
} from './measurementFacts.ts';
import { applyTransfer, combineN, type GriddedResponse } from '../../dsp.ts';
import { solveNetwork } from '../../network.ts';
import { pickSlotsN } from '../../driverSlots.ts';
import { judgeResponse, type ResponseJudgement } from '../requirements/response.ts';
import {
  FLAT_TARGET,
  plateauCoverage,
  targetLevelCurveFor,
  type PlateauCoverage,
  type TargetCurve,
} from '../requirements/targetCurve.ts';
import {
  describeLevelWork,
  describeLevelWorkRule,
  describeSeriesResistance,
  levelWorkOnWay,
  levelWorkVerdict,
  seriesRMaxOhmOf,
  type LevelWorkOnWay,
  type LevelWorkVerdict,
  type LowestWayLevelWork,
} from '../../levelWork.ts';
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
/**
 * F4b — the measured facts (the resolved R_e with its source, the A5b.1
 * validity interval) ride along in `MeasurementFactsPayload`.
 *
 * They are declared in their own module rather than here so that
 * `optimClient.ts` can build the fingerprint ingredient from them without
 * importing THIS file as a value: on a browser main thread `self` is `window`
 * and `window.postMessage` is a function, so a value import would run the entry
 * guard at the bottom of this file and install an `onmessage` handler on the
 * page. A type-only import is erased and is safe; a value import is not.
 */
export interface V2RunSettings extends MeasurementFactsPayload {
  gates: GateSettings;
  budgets: BudgetSettings;
  determinism: DeterminismSettings;
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
  /**
   * V36 — the amplifier power M-A's scale-free fraction is expressed in watts
   * against, for the shortlist's dissipation column. REPORTING ONLY: it steers
   * nothing, judges nothing, and is deliberately not a fingerprint ingredient
   * — two runs that differ only in the power a table is printed at searched the
   * same field.
   *
   * Absent = the designer stated no power, and then there is no watt figure at
   * all rather than one at an invented default (F0).
   */
  amplifierPowerW?: number;
}

/**
 * F4d — WHAT A5d DECIDED ABOUT THIS CANDIDATE, crossing the border named.
 *
 * Per candidate rather than per run, because that is what it is: a run is a
 * FIELD of candidates and each of them is its own set of choices. It rides
 * beside `input` rather than inside `v2` for the same reason — `V2RunSettings`
 * is shared by every candidate in a scan, and putting a per-candidate object
 * there would either duplicate the whole field into every payload or force one
 * candidate's choices onto the rest.
 *
 * ABSENT = THE F4c ROUTE, UNCHANGED. A payload with no candidate reads its
 * choices back out of the chain settings exactly as it did before F4d, and says
 * in `notes` that fifteen of them are still inherited. That is not a fallback
 * to be tidied away later: the two-way route is still v1 (TODO(F2c)) and a
 * caller that has no pre-design layer to generate from must not be handed an
 * invented candidate.
 */
export interface V2CandidatePayload {
  /** The A5d layer's declaration over every choice key. */
  declaration: ChoiceDeclaration;
  /**
   * V41 — the same declaration over the two CHAIN-level choice keys.
   *
   * REQUIRED, and the compiler is the guard: `eqBands` and `leanTargetDb` are
   * read by the design and synthesis steps, which run before the tuner exists,
   * so a candidate that does not state them has its topology decided by
   * whatever the v1 chain settings happened to carry — which for `eqBands` is a
   * silent nought. That is the silent inheritance F4d ended one layer down, and
   * making the field optional would let it back in wherever somebody forgot.
   * See `chainChoices.ts` for why the list is two keys and not thirty-two.
   */
  chainDeclaration: ChainChoiceDeclaration;
  /** Where this candidate came from — one clause per handover. */
  provenance: string;
  /**
   * The declared order of each way's HIGH-PASS flank, keyed by driver model.
   *
   * Row 39 of the V26 table, closed: on the three-way route the order used to
   * come from `settings.structureLow?.order`, which is `undefined` at alignment
   * 'auto' — so `BudgetWay.order` fell back to its own default and "nothing was
   * declared" became indistinguishable from "order 1". A generated candidate
   * always knows its order per flank, so it always states it.
   */
  orderByModel?: Record<string, number>;
}

export interface V2Chain3Payload {
  input: Chain3Input;
  v2: V2RunSettings;
  candidate?: V2CandidatePayload;
}

export interface V2ChainOnePayload {
  input: ChainInput;
  label: string;
  v2: V2RunSettings;
  candidate?: V2CandidatePayload;
}

/**
 * V31 — WHAT A CANDIDATE RETURNS WHEN ITS TUNE WAS THROWN AWAY WHOLESALE.
 *
 * THE FINDING. Four of fifteen v2 candidates came back byte-identical to their
 * unarmed arm. Not because the barrier did nothing: the full-band safety gate
 * refused the whole tune and `optimizeNetworkValues` returned the SEED. On one
 * candidate the refused tune had lifted the load from 0.035 Ω to 1.8 Ω, and
 * what the designer was handed was the 0.035 Ω. A network failing two
 * requirements replaced by one failing a single requirement far worse — and
 * presented as this candidate's answer, in a shortlist, ready to build.
 *
 * THE DOCTRINE THAT SETTLES IT is F0's, one level up. An empty field is not a
 * judgement; a seed is not empty either. It is a network nobody judged against
 * anything this candidate asked for, and publishing it as the candidate's
 * result states something no measurement supports. So a rejected candidate
 * comes back AS A REJECTION: a status, the rule that refused it, and what the
 * refused tune had reached — as REPORTING, never as a network.
 *
 * WHAT THIS IS NOT. It is not a change to the safety gate, which is right: a
 * tune that worsens tweeter protection must not be delivered. The arbitration
 * between "the amplifier must be able to drive this" and "the tweeter must
 * survive it" is still an all-or-nothing veto, and V31 lists three possible
 * ways to make it a trade-off. None of them is taken here. What is taken is
 * the third of V31's options in its narrow form: refuse with name and reason,
 * rather than fall back onto a seed that reads as a design.
 */
export interface CandidateRejection {
  /**
   * WHICH rule refused it, as the typed categories the tuner records at the
   * point the decision is made. Never derived from the sentence below.
   *
   * Empty means a wholesale gate fired that carries no category — today only
   * the solo sensitivity gate, which no multi-way route arms. `note` says so.
   */
  kinds: string[];
  /** The rule's own sentence, for a human. Never parsed to decide anything. */
  reason: string;
  /**
   * What the REJECTED tune had reached, measured on the network that was
   * thrown away — the "best intermediate result before the rejection".
   *
   * Reporting only, and about a design that is not delivered. It exists so a
   * reader can see what the arbitration cost: "refused, and the thing it
   * refused was at 1.8 Ω" is a different statement from "refused".
   */
  rejectedTune: {
    /** The amplifier load the refused tune reached, ohms. */
    minZOhm: number | null;
    /** A5e.1's SPL window, ±dB against the target curve, on the judged band. */
    windowPlusMinusDb: number | null;
    /** RMS deviation from the target curve on the same band. */
    rmsDeviationDb: number | null;
    /** The tuner's own peak-to-peak ripple and phase figures, for continuity. */
    rippleDb: number | null;
    phaseDeg: number | null;
    /**
     * V47 — M-C on the WORST high-pass-protected way of the refused network,
     * dB, or null when nothing here could measure one.
     *
     * WHY IT HAS TO BE MEASURED HERE and cannot be measured by a caller: this
     * function blanks `rejectedParts` before the result leaves (V31 — a
     * candidate that delivers nothing may hand out nothing anyone can serialise
     * into a netlist), so the refused network is only in scope at this point.
     * A reader who wants to know whether the refusal cost a design that WOULD
     * have met the stated drive requirement has no other way to find out.
     *
     * Measured through `evaluateGates` on the frozen reference — the same
     * machinery that would have judged it had it been delivered, so the number
     * is comparable to the M-C column of every candidate that was.
     */
    driveOnFsDb: number | null;
  } | null;
  /** Why this candidate delivers no network at all. */
  note: string;
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
  /**
   * V36 — what this design burns, from the gate evaluation that already
   * measured it. Null for a candidate with no network, and for one whose
   * network could not be solved on the measured sweep. Never recomputed: it is
   * M-A's own `DissipationResult`, read rather than asked a second time (A3g).
   */
  dissipation: DissipationColumn | null;
  /**
   * V31 — non-null when this candidate's tune was refused wholesale. The
   * candidate then delivers NO network: `result.parts` is empty, the gates are
   * empty and `measurements` is the unjudged state. Nothing here is a netlist.
   */
  rejection: CandidateRejection | null;
  /**
   * V51 — level work on the LOWEST way: the requirement this candidate ran
   * under, how much the configuration asks (X), what the delivered network
   * carries there, and whether the stated plateau lies inside the judged band.
   * Filled for every candidate, refused or not — the refusal quotes X, and a
   * delivered design shows that it honoured the rule.
   */
  levelWork: V2LevelWorkColumn;
  notes: string[];
}

/** V51 — see `V2CandidateResult.levelWork`. */
export interface V2LevelWorkColumn {
  /** The chain-level choice this candidate declared, or null when none was. */
  requirement: LowestWayLevelWork | null;
  lowestWay: string | null;
  anchor: string | null;
  /** The A5d.4 gap of the lowest way to the anchor, dB (target curve
   *  included); 0 when it is the anchor; null when no gap crossed. */
  askedDb: number | null;
  /** The inventory of the DELIVERED network (the refused one, on a refusal). */
  delivered: LevelWorkOnWay | null;
  plateau: PlateauCoverage;
  /* ---- V51b ---- */
  /** The stated maximum total series resistance on the lowest way, Ω; null unless the rule states one. */
  maxSeriesOhm: number | null;
  /** Does the delivered inventory honour the rule (`levelWorkVerdict`); null without a rule or a network. */
  verdict: LevelWorkVerdict | null;
  /**
   * Y — the TOTAL series resistance (discrete plus DCR) the lowest way would
   * need for the impedance-floor gate to pass, on the network this candidate
   * produced (the refused one, on a refusal): the delivered total when it
   * already passes, the bisected total when it does not, and null when no
   * floor is stated, no network exists, or no series resistance within the
   * probe's range reaches the floor. Reported beside `maxSeriesOhm` so the
   * refusal can say "asks Y against a maximum of M".
   */
  floorNeedsSeriesOhm: number | null;
  /** The stated floor Y was solved against, Ω; null when none. */
  floorOhm: number | null;
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
  v2: MeasurementFactsPayload,
) {
  const fsHz: Record<string, number> = {};
  const validHz: Record<string, [number, number]> = {};
  const reOhm: Record<string, { ohm: number; source: string }> = {};
  /** Where each fact came from — what the notes report and the stamp records. */
  const provenance: MeasurementProvenance = {
    re: {},
    validHz: {},
    nearField: {},
    impedanceSweep: {},
    fundamental: {},
    gapBudget: {},
  };
  const nearField: Record<
    string,
    { grid: readonly number[]; db: readonly number[]; validHz: [number, number] }
  > = {};
  const impedanceSweep: Record<string, { grid: readonly number[]; z: Complex[] }> = {};
  /** V45 — A5d.4's chained attenuation budget per model, dB. */
  const gapBudgetDb: Record<string, number> = {};
  /* V32 — the same sweeps in the shape the GATE reference wants them.
   * `impedanceSweep` above is complex, for `BudgetWay`; this one is magnitude
   * and phase, because that is what `impedanceReferenceFrom` resamples. One
   * source, two shapes, and neither of them re-derived from the other's. */
  const sweeps: Record<string, MeasuredSweep> = {};
  const notes: string[] = [];
  const band: [number, number] = [grid[0], grid[grid.length - 1]];
  for (const model of Object.keys(driverZ).sort()) {
    /* The driver's impedance ON THE CHAIN GRID. Since V32 it seeds only the
     * two fallbacks below (R_e and the resonance classification, both of which
     * announce themselves when they fire) — no bound and no gate reads it any
     * more. Those come off the measured sweep. */
    const curve = curveOf(grid, driverZ[model]);

    /* ---- R_e: the RESOLVED value, or this worker's own last resort ------ *
     * The A5c.1 hierarchy is walked ONCE, in the ingest pass, and what arrives
     * here has already been chosen. The fallback below is not a second opinion
     * about that hierarchy — it cannot be, since `estimateRe` with no options
     * has no classified resonances to seed a fit with and therefore always
     * returns the direct reading (V21). It exists for the route that has no
     * report to resolve from, and it announces itself. */
    const resolved = v2.reOhmByModel?.[model];
    const derived = resolved === undefined ? estimateRe(curve) : null;
    const re = resolved ?? derived?.ohm ?? null;
    if (re !== null) {
      reOhm[model] = {
        ohm: re,
        source:
          resolved !== undefined
            ? (v2.reSourceByModel?.[model] ?? 'resolved by the ingest pass (A5c.1)')
            : 'derived here from Re(Z) at the bottom of the sweep — no resolved R_e reached this run',
      };
      provenance.re[model] = resolved !== undefined ? 'resolved' : 'worker-fallback';
      if (resolved === undefined) {
        notes.push(
          `${model}: no resolved R_e reached this run, so the direct low-frequency reading stands. ` +
            'That reading carries motional impedance wherever the sweep starts near a resonance ' +
            '(V8d), and the A5c.1 hierarchy cannot be walked from inside this worker — the ' +
            'motional fit needs the classified resonances the ingest pass holds.',
        );
      }
    }
    /* ---- the fundamental resonance ------------------------------------- *
     * Resolved by the ingest pass on the FULL sweep when it crossed; only
     * classified here when it did not. The worker's own curve stops at the
     * chain grid's lower edge, so a woofer's resonance is simply not on it —
     * classifying there finds nothing, or finds a cone mode and calls it f_s
     * (V8b). Same discipline as R_e: consume, do not re-derive. */
    const statedF0 = v2.fundamentalHzByModel?.[model];
    if (statedF0 !== undefined && statedF0 > 0) {
      fsHz[model] = statedF0;
      provenance.fundamental[model] = 'resolved';
    } else {
      provenance.fundamental[model] = 'worker-fallback';
      if (re !== null) {
        const fs = classifyImpedance(curve, re).fundamentalHz;
        if (fs !== null) fsHz[model] = fs;
      }
      notes.push(
        `${model}: no resolved resonance reached this run, so it is classified from the analysis ` +
          'grid — which starts at the far-field span and therefore does not reach a low driver\'s ' +
          'resonance at all. M-C reads its drive voltage there and M-D derives its whole band ' +
          'from it (V25).',
      );
    }

    /* ---- the A5b.1 validity interval ------------------------------------ *
     * Clipped to the grid, because an interval wider than the data is not an
     * interval and every array the metrics index into stops at the grid's ends. */
    const stated = v2.validHzByModel?.[model];
    const clipped: [number, number] | null =
      stated && stated[1] > stated[0]
        ? [Math.max(stated[0], band[0]), Math.min(stated[1], band[1])]
        : null;
    if (clipped && clipped[1] > clipped[0]) {
      validHz[model] = clipped;
      provenance.validHz[model] = 'measured';
    } else {
      validHz[model] = band;
      provenance.validHz[model] = 'grid-fallback';
      notes.push(
        `${model}: no A5b.1 validity interval reached this run, so the frozen passbands and every ` +
          'budget inversion run on the WHOLE analysis grid — including frequencies the ' +
          'measurement itself says are not there (V22).',
      );
    }

    /* ---- the near field (F4b2, V25) ------------------------------------ *
     * The one curve on this border. Without it the LF-lift budget cannot be
     * inverted at all — that was the fourth dead budget V23 recorded. There is
     * no fallback and there must not be one: a lift computed against a near
     * field nobody measured is a number with no measurement under it. */
    const nf = v2.nearFieldByModel?.[model];
    if (nf && nf.grid.length > 0 && nf.validHz[1] > nf.validHz[0]) {
      nearField[model] = nf;
      provenance.nearField[model] = 'measured';
    } else {
      provenance.nearField[model] = 'absent';
    }

    /* ---- the driver's OWN impedance sweep (F4b2, V25) ------------------- *
     * NOT `driverZ` above. That one sits on the chain's analysis grid, whose
     * lower edge is the far-field span — 200 Hz and up in the running app —
     * while M-D evaluates around f_p, which for a woofer is under 60 Hz. On
     * that grid the inversion reads no lift at any inductance, doubles its
     * bracket to the limit and returns 1 048 576 mH. So: the sweep or nothing,
     * and nothing means no bound rather than an absurd one. */
    const sweep = v2.impedanceByModel?.[model];
    if (sweep && sweep.grid.length > 1) {
      impedanceSweep[model] = {
        grid: sweep.grid,
        z: sweep.grid.map((_, i) => {
          const ph = (sweep.phaseDeg[i] * Math.PI) / DEG_PER_HALF_TURN;
          return {
            re: sweep.magnitude[i] * Math.cos(ph),
            im: sweep.magnitude[i] * Math.sin(ph),
          };
        }),
      };
      sweeps[model] = {
        grid: sweep.grid,
        magnitude: sweep.magnitude,
        phaseDeg: sweep.phaseDeg,
        validHz: [sweep.validHz[0], sweep.validHz[1]],
      };
      provenance.impedanceSweep[model] = 'measured';
    } else {
      provenance.impedanceSweep[model] = 'absent';
      /* V32 — WITHOUT THIS SWEEP NO ELECTRICAL REQUIREMENT IS JUDGED AT ALL.
       * Before V32 the gates fell back to the chain's analysis grid, whose
       * floor is the far-field span, and reported a verdict that was 0.2 Ω
       * too kind on casus 1. There is no fallback any more, so the absence
       * has to be said out loud rather than shown as a passing gate. */
      notes.push(
        `${model}: no measured impedance sweep reached this run, so M-A, M-B and M-C are NOT ` +
          'judged on this candidate. They are not passing — they were not evaluated. The ' +
          "chain's analysis grid is deliberately not used instead: its floor is the far-field " +
          'measurement span, and an impedance measurement has no gate (V32).',
      );
    }

    /* ---- V45 (A5e.2): the anchored attenuation budget ------------------- *
     * A5d.4's chained budget, resolved once by the report — target-curve shift
     * included, which is the half that was open until V45 — and consumed here.
     * There is NO fallback and there must not be one: this side has no
     * far-field levels and no A5d.3 windows, so anything it computed would be a
     * worse second implementation of A5d.4 (the F4b leak-1 lesson).
     *
     * Three states, and the third is why the anchor's name travels beside the
     * map. A way with a budget gets one. THE ANCHOR has none by definition —
     * it is the level everything else comes down to — and that is a complete
     * answer rather than a missing measurement. Any other way with no entry has
     * one because something did not arrive, and that is worth a note. */
    const gapBudget = v2.gapBudgetDbByModel?.[model];
    if (gapBudget !== undefined && Number.isFinite(gapBudget)) {
      gapBudgetDb[model] = gapBudget;
      provenance.gapBudget[model] = 'resolved';
    } else if (v2.gapAnchorModel === model) {
      provenance.gapBudget[model] = 'anchor';
    } else {
      provenance.gapBudget[model] = 'absent';
      notes.push(
        `${model}: no anchored attenuation budget (A5d.4) reached this run, so the damping bound ` +
          'produces nothing for this way. It is not the anchor either — the anchor has no budget ' +
          'by definition and is named separately. A budget this side computed for itself would be ' +
          'a second implementation of A5d.4 without the far-field levels it needs (V45).',
      );
    }
  }
  return {
    fsHz,
    validHz,
    reOhm,
    nearField,
    impedanceSweep,
    sweeps,
    branchDb,
    grid,
    driverZ,
    /* V45 — A5d.4's chained budgets, and the anchor they chain down to. */
    gapBudgetDb,
    gapAnchorModel: v2.gapAnchorModel,
    /* V44 — the caller's silent-ghost convention, carried through unchanged.
     * Not derived and not guessed: which value stands for "not measured here"
     * is a decision of whoever built the grid, and a sentinel this code sniffed
     * out of the curve would be the magic number P6 forbids. */
    silentFloorDb: v2.silentFloorDb,
    provenance,
    notes,
  };
}

type Facts = ReturnType<typeof measurementFacts>;

/**
 * The tuner options a v2 run adds, built the moment the seed network exists.
 *
 * This is the function the chain calls through `ChainEngineHooks`, and every
 * line of it is why this file may import `engine2/`.
 */
/**
 * What the SEED NETWORK says about itself, per driver model.
 *
 * Deliberately not measurement facts, and deliberately not taken from the v2
 * report. An order read off the report is the pre-design order the DESIGNER
 * stated for a handover (A5d.3's `orderByPair`); laying that over a v1
 * candidate would describe the candidate as something it is not — casus 1's
 * HUIDIG is a second-order design sitting under a fourth-order window setting.
 *
 * So both come from the run's own side of the border, exactly as `pathROhm`
 * does: the ORDER from the filter spec the candidate was synthesised from (a
 * design is fourth-order because that is what was designed — the same argument
 * `topologyOf` makes below about not reading intent out of tuned values), and
 * the CROSSING ABOVE from the crossings the candidate carries.
 *
 * TODO(F4c): make the crossing's source explicit through the candidate object
 * rather than through the chain input's own fields.
 */
interface NetworkFacts {
  /** Declared high-pass order of this way's branch, when its flank is enabled. */
  orderByModel: Record<string, number>;
  /** The handover above this way, Hz, as the candidate states it. */
  crossingAboveByModel: Record<string, number>;
  /**
   * F4c — the search CHOICES this candidate carries, read back out of the
   * settings the chain was given. Not derived here and not decided here.
   */
  choices: Partial<CandidateChoices>;
  /** F4c — the grey weights, likewise stated rather than inherited silently. */
  weights: Partial<GreyWeights>;
  /**
   * F4d — the A5d layer's declaration, when the caller has one.
   *
   * Present: its `stated` half IS the choice set, and every key it declares
   * absent or delegated is reported as such. Absent: the F4c read-back above
   * stands and fifteen keys are still inherited, which the notes say.
   */
  declaration?: ChoiceDeclaration;
  /** V41 — the chain-level half of the same declaration, when there is one. */
  chainDeclaration?: ChainChoiceDeclaration;
}

/** Drop keys whose value is undefined — absent is a state, not a zero. */
function pruneUndefinedValues<T extends object>(o: T): T {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

function tuneOptionsFor(
  seedParts: readonly VxpPart[],
  facts: Facts,
  network: NetworkFacts,
  v2: V2RunSettings,
  collect: {
    reference: GateReference | null;
    bounds: InvertedBound[];
    notes: string[];
    choices: Partial<CandidateChoices>;
    weights: Partial<GreyWeights>;
    lowestModel: string | null;
  },
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
      /* V32 — where every electrical gate judges. The chain's `driverZ` above
       * is the RESPONSE grid and is used for the crossings only; the ohms come
       * from the drivers' own sweeps, over their whole measured extent. */
      sweeps: facts.sweeps,
    });
  } catch (e) {
    // An unsolvable seed is the chain's problem, not the gate's. Adding
    // nothing leaves the tune exactly as a v1 run would have made it, and the
    // candidate's own machinery reports the failure.
    collect.notes.push(`the gate reference could not be frozen on this seed: ${(e as Error).message}`);
    return {};
  }
  collect.reference = reference;
  /* V32 — say where the electrical verdicts were taken, or why there are none.
   * Both are statements a reader needs before reading an ohm. */
  if (reference.impedanceAbsent) {
    collect.notes.push(`No electrical gate judged this candidate: ${reference.impedanceAbsent}`);
  } else if (reference.impedance) {
    collect.notes.push(
      `M-A, M-B and M-C were judged on ${reference.impedance.span}, not on the chain's analysis ` +
        `grid (${facts.grid[0].toFixed(0)}-${facts.grid[facts.grid.length - 1].toFixed(0)} Hz).`,
    );
    collect.notes.push(...reference.impedance.notes);
  }

  /* ---- the budget inversions (A5d.6) --------------------------------- */
  /* V49 — the SEED's own M-C halves, so the series-C pre-bound can read an
   * excursion ceiling (stated re the input) in the passband-relative form the
   * inversion needs. One evaluation of the seed on the frozen reference; the
   * same machinery that will judge the delivered network. */
  const seedDrive = ((): Record<string, number> => {
    const out: Record<string, number> = {};
    if (Object.keys(reference.driverZ).length === 0) return out;
    try {
      for (const d of evaluateGates(netlistOf(seedParts), v2.gates, reference, 'frozen').metrics.driveVoltage) {
        out[d.driver] = d.passbandMeanDb;
      }
    } catch {
      /* an unsolvable seed is reported by the chain; the pre-bound then reads the stated figure only */
    }
    return out;
  })();
  const ways: BudgetWay[] = [];
  const order = [...reference.frozenHighPassProtected];
  const models = Object.keys(facts.driverZ).sort((a, b) => {
    // Lowest way first, by where the frozen passband starts. Derived, not
    // named: nothing here counts ways or knows what a "woofer" is.
    const pa = reference.frozenPassbandHz[a]?.[0] ?? Infinity;
    const pb = reference.frozenPassbandHz[b]?.[0] ?? Infinity;
    return pa - pb;
  });
  collect.lowestModel = models[0] ?? null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const pass = reference.frozenPassbandHz[model] ?? facts.validHz[model];
    ways.push({
      driver: model,
      lowest: i === 0,
      highPassProtected: order.includes(model),
      reOhm: facts.reOhm[model]?.ohm ?? null,
      reSource: facts.reOhm[model]?.source ?? 'not available',
      /* V32 — the way's own impedance level, off its own MEASURED SWEEP.
       *
       * It used to be read off the chain's analysis grid while `report.ts`
       * read it off the raw sweep, which is the same divergence the gates had
       * and it fed two A5d.6 inversions. The passband happens to sit inside
       * the chain grid on casus 1, so this one was a resolution difference
       * rather than a blindness — but two implementations of one quantity is
       * how they come to disagree, and one of them was already right. No
       * sweep, no median, and `invertBudgets` then produces no bound and says
       * which input was missing. */
      zPassbandMedianOhm: facts.sweeps[model]
        ? passbandImpedanceMedian(
            facts.sweeps[model].grid,
            facts.sweeps[model].magnitude,
            pass,
          )
        : null,
      passbandHz: pass,
      passbandMeanDb: seedDrive[model] ?? null,
      fsHz: facts.fsHz[model] ?? null,
      fPeakHz: facts.fsHz[model] ?? null,
      /* V45 (A5e.2) — THE BUDGET THAT USED TO BE `null` HERE.
       *
       * A5d.4(a) wants the anchor level AFTER baffle step in the intended
       * setup, which is a property of the target-curve object; with that object
       * open, this line handed over a hard null under a TODO naming that
       * decision, the `gap-pad-r` rule skipped every way, and
       * `dampingMarginDb` was a form field that did nothing on the route that
       * actually searches. A5e.2 is closed and
       * the budget crosses as a measured fact — resolved once by the report,
       * target-curve shift included (`measurementFacts.ts`).
       *
       * `null` STILL HAPPENS AND STILL MEANS SOMETHING: the anchor has no
       * attenuation budget by definition, and a way whose level could not be
       * taken has none either. Which of the two it is, is in the provenance and
       * in the notes — not inferred from the hole. */
      gapBudgetDb: facts.gapBudgetDb[model] ?? null,
      pathROhm: seriesPathResistance(seedParts, model),
      /* ---- F4b2: the inputs the LF-lift and the pre-bound were missing ----
       *
       * V23 recorded this as the fourth dead budget: `BudgetWay` carried no
       * near field and no impedance on this route, so `lfBumpBudgetDb` could
       * never reach a bound however loudly it was stated.
       *
       * The near field CROSSES (it is a measurement this side does not have).
       * The impedance does NOT: the worker already holds it, on the analysis
       * grid, and F4b2 measured that inverting there lands 0.0143 dB from the
       * class-A reference — inside the 0.15 dB class. A second copy of a curve
       * you already have is a second thing that can disagree with the first. */
      ...(facts.nearField[model] ? { nearField: facts.nearField[model] } : {}),
      ...(facts.impedanceSweep[model] ? { impedance: facts.impedanceSweep[model] } : {}),
      ...(network.orderByModel[model] !== undefined
        ? { order: network.orderByModel[model] }
        : {}),
      ...(network.crossingAboveByModel[model] !== undefined
        ? { crossingAboveHz: network.crossingAboveByModel[model] }
        : {}),
    });
  }
  const inverted = invertBudgets(ways, v2.budgets, v2.gates);
  collect.bounds = inverted.bounds;
  collect.notes.push(...inverted.notes);
  /* ---- V51b: the STATED maximum on the lowest way's series resistance ----
   *
   * Not an inversion — a project figure, filed in the box in the shape
   * `qes-series-r` has carried since F2, because it bounds the same sum: the
   * way's total series resistance, coil DCR charged first, the free resistors
   * sharing what is left (`searchBoxFor`). Filed BEFORE the box is built so the
   * tuner searches inside it rather than being refused at the end; the
   * delivered-network check below still reads the total, because a box on the
   * seed's resistors cannot see a DCR the catalogue snap adds later. Absent on
   * every run that states another rule or none (P2). */
  const statedSeriesRMax = seriesRMaxOhmOf(network.chainDeclaration?.stated.lowestWayLevelWork);
  if (statedSeriesRMax !== null && collect.lowestModel !== null) {
    const lowest = collect.lowestModel;
    inverted.bounds.push({
      rule: 'stated-series-r',
      subject: lowest,
      quantity: 'total series resistance (stated maximum, coil DCR included)',
      maxSI: statedSeriesRMax,
      unit: 'Ω',
      slack: false,
      parameters: {
        stated_max_ohm: statedSeriesRMax,
        seed_path_R_ohm: seriesPathResistance(seedParts, lowest),
        source: "lowestWayLevelWork: { kind: 'series-r-max' } — a stated requirement, not an inversion (V51b)",
      },
      notes: [
        `The project allows series resistance on ${lowest} up to ${statedSeriesRMax.toFixed(2)} Ω in TOTAL ` +
          '(discrete resistors plus every series coil\'s DCR) and no pad. An air-core coil with that DCR is, ' +
          'physically, that resistor: which of the two carries it is a build choice, not a decision of this run.',
      ],
    });
  }
  /* V45 — the damping margin says what it DID, per way.
   *
   * Until V45 this block said the margin was stated and not applied, because it
   * was not: `gapBudgetDb` was `null` for every way and `invertBudgets` skipped
   * the rule. Now the honest report is per way, because the answer is per way:
   * a bound, the anchor's by-definition nothing, or a missing measurement. The
   * general "which input was missing" sentences come from `invertBudgets`
   * itself; what belongs here is the ANCHOR, which that function cannot name —
   * from inside it a way with no gap budget is indistinguishable from a way
   * whose level never arrived. */
  if (v2.budgets.dampingMarginDb !== undefined) {
    const bounded = inverted.bounds.filter((b) => b.rule === 'gap-pad-r').map((b) => b.subject);
    const anchor = facts.gapAnchorModel;
    collect.notes.push(
      `The damping margin of ${v2.budgets.dampingMarginDb} dB is stated AND applied on this ` +
        'route (A5e.2, closed at V45): it sits on top of each way\'s anchored attenuation ' +
        'budget (A5d.4), which crossed as a measured fact with the target-curve shift already ' +
        'in it. ' +
        (bounded.length > 0
          ? `Bounded: ${bounded.join(', ')}. `
          : 'It bounded no way on this candidate — see the inversion notes for which input was ' +
            'missing. ') +
        (anchor !== undefined
          ? `${anchor} is the anchor and has no attenuation budget by definition, so no bound ` +
            'is produced for it and none is missing.'
          : 'No anchored gap analysis reached this run, so there is no anchor to name and no ' +
            'budget for the margin to sit on.'),
    );
  }
  /* V48 — the ceilings that can follow the tune travel BESIDE the bounds.
   *
   * `inverted.bounds` is pure data and goes out in this worker's response;
   * `inverted.ceilingTrackers` is a closure per subject and never leaves the
   * process. Handing them in ARMS the group without deciding anything: whether
   * a run reads them is `seriesInductanceCeilingSource`, one layer along, and
   * with that key absent the box behaves exactly as it did (P2/V30). */
  const box = searchBoxFor(seedParts, inverted.bounds, inverted.ceilingTrackers);
  collect.notes.push(...box.notes);

  /* ---- F4c: the choices and the weights, STATED ------------------------- *
   *
   * The chain builds its tuner options from `Chain3Settings` and merges this
   * hook's return value LAST, so anything named here wins. Until F4c the hook
   * named four keys and the other 33 rode along from v1 — invisible, and
   * indistinguishable from a decision.
   *
   * What this does NOT do is decide anything. Every value below is read back
   * out of the settings the chain was given, so the delivered network is the
   * one F4b2 delivered — `f4cRegression.test.ts` proves that on two seeds. The
   * delivery is that they now cross NAMED, and that `run.ts` will no longer
   * compile if a caller tries to smuggle one through `tuneOptions`.
   *
   * TODO(F4d): fill `stated` from the A5d layer instead of from the v1
   * settings. The shape does not change; the source does. */
  const stated: Partial<CandidateChoices> = network.declaration
    ? pruneUndefinedValues({ ...network.declaration.stated })
    : pruneUndefinedValues({
        band: network.choices.band,
        acousticSlopes: network.choices.acousticSlopes,
        catalogSnap: network.choices.catalogSnap,
        ampTarget: network.choices.ampTarget,
        phaseMetric: network.choices.phaseMetric,
        powerMetric: network.choices.powerMetric,
        breakupGuard: network.choices.breakupGuard,
        xoFloorPairs: network.choices.xoFloorPairs,
        ampMinLoadOhm: network.choices.ampMinLoadOhm,
        rSourceDisqualifyOhm: network.choices.rSourceDisqualifyOhm,
      });
  /* ---- V48: WHICH NETWORK THE SERIES-INDUCTANCE CEILING DESCRIBES ------
   *
   * The same duty V33, V34 and V37 each discharge one rule along: a bound is
   * only readable beside the network it was solved for. Absent on every run
   * that states no LF budget, which is every v1 run and every casus that
   * states nothing. */
  const bumpBound = collect.bounds.find((b) => b.rule === 'bump-series-l');
  if (bumpBound) {
    const tracked =
      stated.seriesInductanceCeilingSource === 'tuned' &&
      box.valueSumCeilings.some((g) => g.ceilingAt !== undefined);
    collect.notes.push(
      tracked
        ? `The LF-lift ceiling on ${bumpBound.subject}'s series inductance is RE-SOLVED at the ` +
            'path resistance of the network being evaluated, not held at the ' +
            `${(bumpBound.parameters.path_R_ohm as number).toFixed(2)} Ω the seed carried. The ` +
            `${(bumpBound.maxSI / H_PER_MH).toFixed(2)} mH above is therefore the ceiling at the ` +
            'START of the search and not the one it ended under (V48).'
        : `The LF-lift ceiling on ${bumpBound.subject}'s series inductance was solved once, at ` +
            `the SEED's path resistance of ${(bumpBound.parameters.path_R_ohm as number).toFixed(2)} Ω, ` +
            'and stands for the whole tune. A tune that lowers that resistance is bounded by a ' +
            'ceiling meant for a better-damped network, and only the delivered-network check ' +
            'catches it (V45, V48).',
    );
  }

  const weights: Partial<GreyWeights> = pruneUndefinedValues({
    phasePriority: network.weights.phasePriority,
    directivityWeight: network.weights.directivityWeight,
    powerFoldWeight: network.weights.powerFoldWeight,
    dissipationWeight: network.weights.dissipationWeight,
    costWeight: network.weights.costWeight,
  });
  collect.choices = stated;
  collect.weights = weights;

  /* The keys this route CANNOT state yet, and why — because saying so beats
   * letting a reader assume the list above is complete. `xoRangePairs` is
   * computed inside the chain from the candidate's own cage; `branchTargets`,
   * `safety`, `snapPrefs`, `staged`, `audit`, `midBranch`, `angleData` and the
   * solo family are assembled there too. Re-deriving any of them here would be
   * a second implementation of chain logic, which is how two descriptions of
   * one thing start to disagree (V21's lesson, one layer up). */
  if (network.declaration) {
    /* ---- F4d: nothing is inherited any more, and the notes say what each key
     * IS instead. A key the candidate declares absent or delegated is a
     * decision with a reason attached; a key nobody mentions is what F4c had
     * to call "still inherited", and `declarationCoverage` makes that state
     * unreachable rather than merely discouraged. */
    const cover = declarationCoverage(network.declaration);
    if (cover.missing.length > 0) {
      collect.notes.push(
        `The candidate's declaration does not cover ${cover.missing.join(', ')}. Those keys fall ` +
          'back to whatever the v1 chain built, which is exactly the silent inheritance F4d ' +
          'exists to end — a declaration with a hole in it is worse than no declaration, because ' +
          'it reads as complete.',
      );
    }
    if (cover.duplicated.length > 0) {
      collect.notes.push(
        `The candidate declares ${cover.duplicated.join(', ')} in more than one state at once. ` +
          'Which one applies is then a matter of evaluation order, and evaluation order is not a ' +
          'decision anybody took.',
      );
    }
    if (network.declaration.absent.length > 0) {
      collect.notes.push(
        'Declared ABSENT by the candidate (no value on this design, not merely unset): ' +
          network.declaration.absent.map((a) => `${a.key} — ${a.why}`).join(' · '),
      );
    }
    if (network.declaration.delegated.length > 0) {
      collect.notes.push(
        'Delegated by the candidate to a named stage: ' +
          network.declaration.delegated.map((g) => `${g.key} → ${g.to} (${g.why})`).join(' · '),
      );
    }
  } else {
    const inherited = CHOICE_KEYS.filter((k) => stated[k] === undefined);
    if (inherited.length > 0) {
      collect.notes.push(
        `Search choices still inherited from the v1 chain, not v2-derived: ${inherited.join(', ')}. ` +
          'They are the values that chain built and the run is unchanged by this; they are named ' +
          'here because an inherited choice that nobody names is indistinguishable from a decision ' +
          '(audit §2.2, §6.1). This route has no A5d candidate — see `V2CandidatePayload`.',
      );
    }
  }

  /* ---- V41: the two CHAIN-level choice keys, and what they were --------- *
   *
   * Reported here rather than where they are applied, because the reader needs
   * them beside the tuner's own choices: `eqBands` decides how many corrections
   * the design step may PROPOSE and `leanTargetDb` how easily the synthesis
   * step declines to BUILD one, and neither is visible anywhere in the tuner's
   * options. A run whose field carries no correction network has to be able to
   * say whether nothing was warranted or nothing was allowed. */
  if (network.chainDeclaration) {
    const cover = chainDeclarationCoverage(network.chainDeclaration);
    if (cover.missing.length > 0) {
      collect.notes.push(
        `The candidate's chain declaration does not cover ${cover.missing.join(', ')}. Those keys ` +
          'fall back to the chain settings, where `eqBands` unstated is a silent nought and ' +
          '`leanTargetDb` unstated is the staged pass\'s stop goal — neither is a decision ' +
          'anybody took (V41).',
      );
    }
    if (cover.duplicated.length > 0) {
      collect.notes.push(
        `The candidate declares ${cover.duplicated.join(', ')} in more than one state at once, so ` +
          'which one applies is a matter of evaluation order.',
      );
    }
    const said = CHAIN_CHOICE_KEYS.map((k) => {
      const v = network.chainDeclaration?.stated?.[k];
      return v === undefined ? null : `${k} = ${v}`;
    }).filter((x): x is string => x !== null);
    if (said.length > 0) {
      collect.notes.push(
        `Chain-level choices stated by the candidate: ${said.join(', ')}. They are read by the ` +
          'design and synthesis steps, which run before the tuner exists, so they decide what the ' +
          'topology CAN be rather than what its values are (V41).',
      );
    }
    if (network.chainDeclaration.absent.length > 0) {
      collect.notes.push(
        'Declared ABSENT at the chain layer: ' +
          network.chainDeclaration.absent.map((a) => `${a.key} — ${a.why}`).join(' · '),
      );
    }
  } else if (network.declaration) {
    collect.notes.push(
      `Chain-level choices still inherited: ${CHAIN_CHOICE_KEYS.join(', ')}. This candidate ` +
        'declares the tuner\'s options but not the two settings the design and synthesis steps ' +
        'read, so its topology is bounded by whatever the chain settings carried (V41).',
    );
  }
  const unstatedWeights = GREY_KEYS.filter((k) => weights[k] === undefined);
  if (unstatedWeights.length > 0) {
    collect.notes.push(
      `Weights left to the tuner's own defaults: ${unstatedWeights.join(', ')}. These shape the ` +
        'scalar and therefore which part of the field is visited (audit §6.4).',
    );
  }

  /* ---- the gate hook -------------------------------------------------- */
  const armed = anyGateActive(v2.gates);
  /* V49 — WHICH M-C LIMIT JUDGES EACH WAY, said per way on every v2 run. The
   * ceilings are dB re the amplifier's peak input; what the gate compares is
   * their passband-relative form, and which of the two halves bites depends on
   * the network's own passband level, so the verdict parameters carry it per
   * evaluation. Here: what arrived, and what did not. */
  const ceilings = v2.gates.driveCeilingDbByDriver ?? {};
  const ceilingModels = Object.keys(ceilings).sort();
  if (ceilingModels.length > 0) {
    collect.notes.push(
      'M-C v2.0 (V49): an excursion-derived ceiling reached this run for ' +
        ceilingModels.map((m) => `${m} (${ceilings[m].toFixed(2)} dB re peak input)`).join(', ') +
        (v2.gates.maxDriveOnFsDb !== undefined
          ? `; the stated ${v2.gates.maxDriveOnFsDb} dB figure stands beside it and the STRICTER ` +
            'of the two judges each way (see limit_source on every M-C verdict).'
          : '; no dB figure is stated, so the ceiling alone judges each of these ways.'),
    );
    const without = Object.keys(facts.driverZ).filter((m) => !ceilingModels.includes(m)).sort();
    if (without.length > 0) {
      collect.notes.push(
        `No excursion-derived ceiling reached this run for ${without.join(', ')} — driver card, ` +
          'amplifier peak or resonance missing on the report side — so ' +
          (v2.gates.maxDriveOnFsDb !== undefined
            ? 'the stated dB figure alone judges those ways where they are high-pass protected.'
            : 'nothing absolute judges those ways.'),
      );
    }
  }

  /* ---- V50: BUILDABILITY, said out loud on every v2 run ----------------- */
  {
    const g = v2.gates;
    const rArmed = g.resistorClassW !== undefined && g.resistorClassW > 0 &&
      g.resistorPowerMargin !== undefined && g.resistorPowerMargin > 0;
    const snap = network.choices.catalogSnap === true;
    collect.notes.push(
      rArmed
        ? `M-A/part (V50) judges every discrete resistor against ${(g.resistorClassW! * g.resistorPowerMargin!).toFixed(1)} W ` +
          `(class ${g.resistorClassW} W × margin ${g.resistorPowerMargin})` +
          (g.amplifierPowerW !== undefined ? ` at ${g.amplifierPowerW} W continuous` : ', but NO continuous power is stated so no watts exist to judge') +
          (snap ? '; a snapped part with a catalogue rating is judged on that rating instead.' : '.')
        : 'M-A/part (V50) judges nothing: no resistor class with a margin is stated' +
          (snap ? ' (a snapped part with a catalogue rating would still be judged on it).' : ', and the snap is off so no catalogue rating exists either.'),
    );
    collect.notes.push(
      g.coilClassA !== undefined && g.coilClassA > 0
        ? `M-L (V50) judges every coil against ${g.coilClassA} A peak` +
          (g.peakInputVolts !== undefined ? ` at a peak input of ${g.peakInputVolts.toFixed(1)} V.` : ', but NO amplifier peak is stated so no current exists to judge.')
        : 'M-L (V50) judges nothing: no coil class is stated' +
          (snap ? ' (a snapped cored coil with a catalogue rating would still be judged on it).' : ', and the snap is off so no catalogue rating exists either.') +
          (g.peakInputVolts !== undefined ? ` The peak current per coil is still reported at ${g.peakInputVolts.toFixed(1)} V.` : ''),
    );
  }

  /* ---- V47: WHICH OF THE TWO PROTECTION RULES IS ACTUALLY IN FORCE ------
   *
   * Said out loud on every v2 run, because the two rules do not order the same
   * designs and a reader of a shortlist cannot see from the outside which one
   * threw a candidate away. The three states are distinguished and none of them
   * is silent:
   *
   *   · stated AND armed — the requirement judges, the seed comparison is off;
   *   · stated but NOT armed — the candidate asked for the absolute rule and no
   *     limit reached this run, so nothing absolute would judge. The seed
   *     comparison is what remains, and the note says so rather than leaving a
   *     run with neither rule in force (P4, and the fallback V32 removed from
   *     the gates: a mechanism whose input never arrived must not silently
   *     switch its replacement off too);
   *   · absent — the historic rule, named as the historic rule.
   *
   * The SECOND state is the one worth building for. It cannot happen on the
   * casus-1 route, where both come out of the same manifest entry, and it can
   * happen in the app the moment somebody clears the M-C field while a
   * candidate that was generated with it is still in flight. */
  const wantsStatedProtection = stated.protectionRule === 'stated';
  const perWayStated = Object.keys(v2.gates.maxDriveOnFsDbByDriver ?? {}).sort();
  const driveGateArmed =
    v2.gates.maxDriveOnFsDb !== undefined || perWayStated.length > 0 || ceilingModels.length > 0;
  if (perWayStated.length > 0) {
    collect.notes.push(
      'M-C (V50): a stated dB figure exists PER WAY for ' +
        perWayStated.map((m) => `${m} (${v2.gates.maxDriveOnFsDbByDriver![m]} dB)`).join(', ') +
        (v2.gates.maxDriveOnFsDb !== undefined
          ? `; every other protected way reads the single figure ${v2.gates.maxDriveOnFsDb} dB.`
          : '; every other protected way carries NO stated figure and is judged on the excursion-derived ceiling alone (or on nothing).'),
    );
  }
  if (wantsStatedProtection && driveGateArmed) {
    collect.notes.push(
      'Upper-driver protection is judged by the STATED requirement — M-C at most ' +
        (v2.gates.maxDriveOnFsDb !== undefined
          ? `${v2.gates.maxDriveOnFsDb} dB`
          : 'the excursion-derived ceiling (V49)') +
        ', enforced by the gate at every point a pass accepts a ' +
        'network — and the full-band safety gate no longer compares against the seed. The two ' +
        'rules do not order the same designs: the seed comparison is stricter than the ' +
        'requirement on a well-protected seed and looser on a poor one (V47).',
    );
  } else if (wantsStatedProtection) {
    collect.notes.push(
      'The candidate asked for upper-driver protection to be judged by a stated requirement and ' +
        'no M-C limit reached this run, so the search keeps the SEED comparison of the full-band ' +
        'safety gate. It is NOT running with neither rule: dropping the relative rule without ' +
        'anything absolute to drop it in favour of would leave the protection unjudged (P4, V47).',
    );
  } else {
    collect.notes.push(
      'Upper-driver protection is judged by the SEED comparison of the full-band safety gate — ' +
        'the historic rule. This design states no maximum drive on a driver\'s own resonance, so ' +
        'there is nothing absolute to judge it against, and a comparison to the seed is what ' +
        'remains (V47).',
    );
  }

  /* ---- V33: the barrier's reading, from the gate's own reference --------
   *
   * The candidate decides WHERE the amp-load barrier aims (`zFloorBarrierSource`,
   * a choice key); this supplies WHAT is there, and it supplies the very object
   * the gate was frozen on. That is the whole delivery: `M-B/|Z|` and the term
   * that steers toward it read one grid and one set of driver impedances, so
   * they cannot describe two different bands the way they did on casus 1's
   * 396.7 Hz axis (V33).
   *
   * No reference, no reading — and the tuner does NOT fall back to the
   * evaluation grid. Said here as well as there, because this is the side that
   * knows why it is missing. */
  const barrierOnSweep = stated.zFloorBarrierSource === 'sweep';
  if (barrierOnSweep && !reference.impedance) {
    collect.notes.push(
      'The candidate asked the amp-load barrier to aim at the measured impedance sweep, and no ' +
        'sweep reached this run. The barrier therefore does not steer this search at all — it ' +
        'is NOT falling back to the chain grid, which would restore the reading V32 withdrew. ' +
        'No electrical gate judges this candidate either, for the same missing input.',
    );
  }
  /* `'safety'` needs nothing from here: the safety set is a CHOICE the
   * candidate already states, so the tuner has the grid in hand. It is the
   * default a generated candidate takes, and the one every casus-1 run uses. */
  if (stated.zFloorBarrierSource === 'safety' && stated.safety === undefined) {
    collect.notes.push(
      'The candidate asked the amp-load barrier to aim at the full-band safety grid and states ' +
        'no safety set, so the barrier does not steer this search at all. It is NOT falling ' +
        'back to the evaluation grid: a search that silently aims at a narrower band than the ' +
        'one it is judged on is exactly what V33 removed.',
    );
  }

  /* ---- V37: the R_e the dissipation term divides by ---------------------
   *
   * The candidate decides WHICH quantity the term measures
   * (`dissipationReferenceSource`, a choice key); this supplies WHAT that
   * quantity is, and it supplies the very number M-E publishes and the Q_es
   * budget inverts. `facts.reOhm` is walked once, above, out of the payload the
   * ingest pass resolved (A5c.1) — there is no second hierarchy here and there
   * must not be one, which is the whole of F4b's leak 1.
   *
   * No R_e, no reading. The tuner does NOT go back to Re(Z) at the probe; it
   * produces no ratio, the term adds nothing, and it says so. Stated here as
   * well as there, because this is the side that knows why it is missing. */
  const dissipationReferenceReOhm: Record<string, number> = {};
  for (const model of Object.keys(facts.reOhm)) {
    dissipationReferenceReOhm[model] = facts.reOhm[model].ohm;
  }
  const wantsResolvedRe = stated.dissipationReferenceSource === 're';
  if (wantsResolvedRe && Object.keys(dissipationReferenceReOhm).length === 0) {
    collect.notes.push(
      'The candidate asked the dissipation term to divide by the resolved R_e and no R_e could ' +
        'be resolved for any driver on this run, so the term does not steer this search at all. ' +
        'It is NOT falling back to Re(Z) at the probe — since V34 that reading is the impedance ' +
        'PEAK of the lowest branch, which is the quantity V37 withdrew rather than the DC ' +
        'resistance Q_es multiplication is defined on.',
    );
  }

  /* ---- V44: the facts the phase admission reads ------------------------
   *
   * The candidate decides WHICH POINTS may carry a phase judgement
   * (`phaseAdmission`, a choice key); this supplies what the grounds READ.
   * Both come straight out of the payload the ingest pass resolved — there is
   * no second validity hierarchy here and there must not be one, which is the
   * whole of F4b's leak 2.
   *
   * ONE band for both branches of every pair, and it is the INTERSECTION, the
   * same reduction `commonBand` makes in `report.ts`. Not per driver: the tuner
   * builds its pairs out of adjusted branches and carries no way names beside
   * them, so a per-driver band could not be handed to the right branch — and
   * two readers that each derive their own band are two implementations, which
   * is the state V32 found and this change exists not to repeat.
   *
   * No validity, no reading: the ground abstains and the note says so. It does
   * NOT fall back to the grid — a search that silently judges phase on data its
   * own measurements disown is exactly what V44 removed. */
  /* ONLY the MEASURED intervals. `facts.validHz` also holds grid-fallback
   * entries for models whose files carried no window, and folding those in
   * would substitute the analysis grid for a measurement claim — the exact
   * silent fallback V32 removed from the gates and V44 removes from here. */
  const validBands: [number, number][] = Object.entries(facts.validHz)
    .filter(([model]) => facts.provenance.validHz[model] === 'measured')
    .map(([, b]) => b);
  let phaseValidBandHz: [number, number] | null = null;
  if (validBands.length > 0) {
    const lo = Math.max(...validBands.map((b) => b[0]));
    const hi = Math.min(...validBands.map((b) => b[1]));
    if (hi > lo) phaseValidBandHz = [lo, hi];
  }
  const wantsAdmission = stated.phaseAdmission === 'measured';
  if (wantsAdmission && phaseValidBandHz === null && facts.silentFloorDb === undefined) {
    collect.notes.push(
      'The candidate asked the phase judgement to rest on the measured points and this run ' +
        'states neither a validity interval nor a silent-ghost convention, so only the overlap ' +
        'window is armed and the admission is the historic set. It is NOT falling back ' +
        'silently: two of the three grounds simply have no input (P4).',
    );
  }

  /* ---- V45 (A5e.2): the target curve the amplitude term is flat against ---
   *
   * POLISH, handed over by the side that holds it. WHETHER the search measures
   * against the voicing is `amplitudeReference`, a CHOICE the candidate states;
   * WHAT the voicing is, is the design's own target-curve object, and a
   * candidate that brought its own would be a second opinion about which
   * loudspeaker is being designed.
   *
   * Sampled on the CHAIN's analysis grid — the grid the tuner's own responses
   * live on — and read back by frequency rather than by index, because the
   * tuner evaluates its objective on a decimated grid and its reports on the
   * full one (`targetLevel.ts`).
   *
   * A curve that cannot be evaluated hands over NOTHING and says so, and the
   * tuner then searches exactly as a run with no voicing does. That is the
   * difference between abstaining and quietly searching against flat while a
   * verdict elsewhere judges against a plateau — the very split V45 closed. */
  const wantsTarget = stated.amplitudeReference === 'target';
  const targetLevel = wantsTarget ? targetLevelCurveFor(v2.targetCurve ?? FLAT_TARGET, facts.grid) : null;
  if (wantsTarget && targetLevel === null) {
    collect.notes.push(
      'The candidate asked the amplitude term to be flat against the design\'s target curve, and ' +
        'no curve on this run could be evaluated on the analysis grid — so the search measures ' +
        'against horizontal, exactly as a run with no voicing does. It is NOT falling back ' +
        'silently (P4): the reference simply has no input.',
    );
  }

  return {
    ...stated,
    ...weights,
    /* V47 — the stated rule reaches the tuner only when the requirement it
     * defers to actually reached this run. Written AFTER the spread so it
     * overrides what the declaration said, and it can only ever move one way:
     * toward the historic comparison. See the note above for why the other
     * direction would be a run with no protection rule at all. */
    ...(wantsStatedProtection && !driveGateArmed ? { protectionRule: 'seed' as const } : {}),
    ...(wantsAdmission
      ? {
          phaseAdmissionFacts: {
            validBandHz: phaseValidBandHz,
            silentFloorDb: facts.silentFloorDb ?? null,
          },
        }
      : {}),
    ...(targetLevel ? { amplitudeTargetDb: targetLevel } : {}),
    ...(barrierOnSweep && reference.impedance
      ? {
          zFloorBarrierImpedance: {
            grid: reference.impedance.grid,
            driverZ: reference.impedance.driverZ,
            span: reference.impedance.span,
          },
        }
      : {}),
    ...(wantsResolvedRe && Object.keys(dissipationReferenceReOhm).length > 0
      ? { dissipationReferenceReOhm }
      : {}),
    /* V31 — the v2 route asks the tuner to hand back what a wholesale gate
     * threw away. Instrumentation only: it changes no decision, and with it
     * unset (every v1 run) the result object is byte-identical to before. */
    rejectedTuneReport: true,
    ...(armed
      ? {
          gateViolation: (parts: readonly VxpPart[]): string | null => {
            let netlist;
            try {
              netlist = netlistOf(parts);
            } catch {
              return null;
            }
            /* V50 — what the catalogue rates the CHOSEN parts for, read off
             * the `catalog` attribution the snap wrote. Only with the snap ON:
             * an unsnapped part has no SKU and the stated class judges it. */
            return evaluateGates(netlist, v2.gates, reference, 'frozen', ratingsFor(parts, network)).violation;
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

/**
 * V49 — FOLD THE EXCURSION-DERIVED CEILINGS INTO THE GATE SETTINGS THIS RUN
 * JUDGES ON.
 *
 * They arrive as a measured FACT (`driveCeilingDbByModel`, derived once by
 * the report from the driver card and the classified sweep) and become a
 * gate setting here, beside the stated `maxDriveOnFsDb`; `effectiveDriveLimit`
 * then applies the stricter of the two per way. Done once at the entry so that
 * every reader below — the armed check, the gate hook, the refused-tune
 * measurement, the delivered verdict and the pre-bound — sees ONE gate object.
 * A payload without ceilings is returned untouched, byte for byte.
 */
function withDerivedDriveCeiling(v2: V2RunSettings): V2RunSettings {
  const c = v2.driveCeilingDbByModel;
  /* V50 — the continuous power M-A/part turns fractions into watts with is
   * the SAME field the shortlist column prints at (`v2.amplifierPowerW`), so
   * it is folded into the gate object here rather than sent twice. A payload
   * that states neither a ceiling nor a power is returned untouched. */
  const power = v2.amplifierPowerW !== undefined && v2.amplifierPowerW > 0 ? v2.amplifierPowerW : undefined;
  if ((!c || Object.keys(c).length === 0) && power === undefined) return v2;
  return {
    ...v2,
    gates: {
      ...v2.gates,
      ...(c && Object.keys(c).length > 0
        ? { driveCeilingDbByDriver: { ...(v2.gates.driveCeilingDbByDriver ?? {}), ...c } }
        : {}),
      ...(power !== undefined && v2.gates.amplifierPowerW === undefined ? { amplifierPowerW: power } : {}),
    },
  };
}

/**
 * V50 — the catalogue ratings of a part list, or nothing when the run does
 * not snap (no `catalog` attribution exists then, and resolving would be a
 * lookup of nothing).
 */
function ratingsFor(parts: readonly VxpPart[], network: NetworkFacts) {
  return network.choices.catalogSnap ? partRatingsOf(parts) : undefined;
}

/** Drop the keys whose value is undefined — absent means absent, never zero. */
function pruneUndefined(o: Record<string, number | undefined>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * The declared high-pass order of a branch, from the spec the candidate carries
 * — never read back out of the tuned values.
 *
 * `topologyOf` below makes the argument in full: a design is a fourth-order
 * Linkwitz-Riley because that is what was designed, and inferring an order from
 * component values is inferring intent from execution. A disabled flank has no
 * order at all, which is a different statement from "order 1" and is left
 * absent so the pre-bound falls back to its own documented default.
 *
 * Only the TWO-WAY chain carries a filter spec in its input. The three-way
 * chain designs its own, so there the declaration is the stated alignment
 * (`structureLow` / `structureHigh`), and 'auto' means nothing is declared.
 * TODO(F4c): the candidate object carries the settled specs on both routes.
 */
function declaredHpOrder(spec: { hp?: { enabled: boolean; order: number } } | undefined):
  | number
  | undefined {
  return spec?.hp?.enabled ? spec.hp.order : undefined;
}

/**
 * V51b — the RANGE the floor probe searches, Ω. A probe bound and not a
 * design figure: series resistance beyond this in front of a driver is no
 * longer a crossover but a heater, and a floor that needs it is reported as
 * unreachable rather than met. P6-OK: a search-range constant, not a project
 * number.
 */
const SERIES_R_PROBE_MAX_OHM = 20; // P6-OK: probe range, not a limit
/** Bisection depth of the floor probe — 2^-20 of the range is far below any ohm anyone reads. */
const SERIES_R_PROBE_STEPS = 24; // P6-OK: iteration count

/**
 * V51b — the same netlist with `extraOhm` of series resistance INSERTED at the
 * HEAD of one way: a new node between the generator's hot node and the way's
 * first series element — the one that touches the hot node, lies on this way's
 * bus and feeds this way only. That is where a discrete series resistor and
 * the first coil's DCR physically sit.
 *
 * NOT IN FRONT OF THE DRIVER, and that was measured before it was written down:
 * the first probe put the resistor between the last bus node and the driver,
 * behind the low-pass's shunt capacitor, and on every casus-1 netlist under the
 * floor the system minimum FELL (V30_KAND_1: 2.447 → 1.102 Ω with 20 Ω "in
 * front") — a ladder whose termination is made resistive resonates into its
 * own shunt C. A resistor at the head raises the whole way's impedance instead.
 * Falls back to the driver's hot terminal only when no series element is
 * exclusive to the way (a shared head is not "on the lowest way"). Null when
 * the driver is on no bus.
 */
export function withSeriesResistanceInFront(netlist: Netlist, model: string, extraOhm: number): Netlist | null {
  const bus = busTopologyOfNetlist(netlist);
  const busNodes = new Set(bus.busNodesOf(model));
  const drv = netlist.elements.find((e) => e.kind === 'driver' && e.model === model);
  const src = netlist.elements.find((e) => e.kind === 'source');
  if (!drv || !src || busNodes.size === 0) return null;
  const hot = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];
  const n = netlist.nodeCount;
  /* The way's own first series element: on the bus, touching the hot node,
   * feeding this way alone. */
  const head = netlist.elements.find(
    (e) =>
      (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') &&
      (e.nodes[0] === hot || e.nodes[1] === hot) &&
      busNodes.has(e.nodes[0]) &&
      busNodes.has(e.nodes[1]) &&
      bus.driversOf(e.id).length === 1 &&
      bus.driversOf(e.id)[0] === model,
  );
  const moveNode = (e: NetElement, from: number): NetElement =>
    ({ ...e, nodes: [e.nodes[0] === from ? n : e.nodes[0], e.nodes[1] === from ? n : e.nodes[1]] as [number, number] }) as NetElement;
  let elements: NetElement[];
  let anchor: number;
  if (head) {
    elements = netlist.elements.map((e) => (e === head ? moveNode(e, hot) : e));
    anchor = hot;
  } else {
    const drvHot = busNodes.has(drv.nodes[0]) ? drv.nodes[0] : busNodes.has(drv.nodes[1]) ? drv.nodes[1] : null;
    if (drvHot === null) return null;
    elements = netlist.elements.map((e) => (e === drv ? moveNode(e, drvHot) : e));
    anchor = drvHot;
  }
  elements.push({ kind: 'R', id: '__v51b-floor-probe', nodes: [anchor, n], value: extraOhm });
  return { ...netlist, nodeCount: n + 1, elements } as Netlist;
}

/**
 * V51b — Y: how much MORE series resistance in front of the lowest way's
 * driver the stated impedance floor asks, on this network, judged by the same
 * gate that refuses it (`M-B/|Z|`, tolerance included). 0 when it already
 * passes; a bisected extra otherwise; null WITH THE REASON when even the
 * probe's range does not reach the floor (the minimum then sits in another
 * way) or the network cannot be solved. The gate is read as a VERDICT and
 * never re-derived here (A3g). Exported, with `withSeriesResistanceInFront`,
 * for the hand-calculated claim in `lowestWayLevelWork.test.ts`; the worker is
 * its only production caller.
 */
export function seriesResistanceForFloor(
  parts: readonly VxpPart[],
  model: string,
  gates: GateSettings,
  reference: GateReference,
  /** What the catalogue rates the parts for; undefined = the stated classes only. */
  ratings?: ReturnType<typeof ratingsFor>,
): { extraOhm: number; why: null } | { extraOhm: null; why: string } {
  let base: Netlist;
  try {
    base = netlistOf(parts);
  } catch (e) {
    return { extraOhm: null, why: `the network could not be built: ${(e as Error).message}` };
  }
  /** The gate's verdict with `extraOhm` at the head of the way, and the value it read. */
  const floorAt = (extraOhm: number): { pass: boolean; minZ: number } | { error: string } => {
    try {
      const nl = extraOhm === 0 ? base : withSeriesResistanceInFront(base, model, extraOhm);
      if (!nl) return { error: `${model} is on no bus of this network` };
      const v = evaluateGates(nl, gates, reference, 'frozen', ratings).verdicts.find((x) => x.gate === 'M-B/|Z|');
      if (!v || v.value === null) return { error: v?.reason ?? 'the floor gate produced no value' };
      return { pass: v.pass, minZ: v.value };
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const at0 = floorAt(0);
  if ('error' in at0) return { extraOhm: null, why: at0.error };
  if (at0.pass) return { extraOhm: 0, why: null };
  const atMax = floorAt(SERIES_R_PROBE_MAX_OHM);
  if ('error' in atMax) return { extraOhm: null, why: atMax.error };
  if (!atMax.pass) {
    return {
      extraOhm: null,
      why:
        `even ${SERIES_R_PROBE_MAX_OHM} Ω at the head of ${model} leaves the system at ${atMax.minZ.toFixed(3)} Ω ` +
        `(from ${at0.minZ.toFixed(3)} Ω) — the minimum then sits in another way and no series resistance on this one reaches the floor`,
    };
  }
  let lo = 0;
  let hi = SERIES_R_PROBE_MAX_OHM;
  for (let i = 0; i < SERIES_R_PROBE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const p = floorAt(mid);
    if ('error' in p) return { extraOhm: null, why: p.error };
    if (p.pass) hi = mid;
    else lo = mid;
  }
  return { extraOhm: hi, why: null };
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

/** The wholesale-rejection fields the tuner records, as VALUES (A3g). */
interface WholesaleRejectionFields {
  /**
   * V33 — the one shape, whatever refused. The tuner fills it on every
   * wholesale return: the two safety-gate paths and the active-gate path V33
   * added. Detected in preference to `safetyNote`, which stays for the callers
   * that never armed a v2 mechanism.
   */
  refusal?: { by: string; kinds: string[]; reason: string; note: string };
  safetyNote?: string;
  safetyKinds?: string[];
  rejectedTune?: {
    zMinOhm?: number;
    rippleDb?: number;
    avgDevDb?: number;
    phaseDeg?: number;
  };
  rejectedParts?: VxpPart[];
}

/**
 * V31 — was this tune thrown away wholesale, and by which rule?
 *
 * Detected STRUCTURALLY: `safetyNote` exists on exactly the two returns that
 * refuse a whole tune and return the seed, and on no other path. Its PRESENCE
 * is the signal; its text is never read, because a caller that parsed a
 * sentence written three passes earlier is how `zOk` came to mean four things
 * at once (the A3g rule, in `netOptimizer.ts`'s own words).
 */
function wholesaleRejection(net: WholesaleRejectionFields): {
  reason: string;
  kinds: string[];
  by: string;
  note: string | null;
  fields: WholesaleRejectionFields;
} | null {
  /* V33 — ONE QUESTION, not two. The v2 route arms both mechanisms, so the
   * harmonised field is always there and is what this reads; a caller that
   * asked two questions about one event is how the shortlist would end up with
   * two kinds of rejection for a distinction its reader does not have. The
   * `safetyNote` branch below is the pre-V33 route (no gate hook, no rejected-
   * tune report) and is kept because removing it would silently stop detecting
   * a refusal on any caller that arms neither. */
  if (net.refusal !== undefined) {
    return {
      reason: net.refusal.reason,
      kinds: [...net.refusal.kinds],
      by: net.refusal.by,
      note: net.refusal.note,
      fields: net,
    };
  }
  if (net.safetyNote === undefined) return null;
  return {
    reason: net.safetyNote,
    kinds: [...(net.safetyKinds ?? [])],
    by: 'safety-gate',
    note: null,
    fields: net,
  };
}

/**
 * V34 — THE DECLARATION IS THE AUTHORITY ON THE SOURCE-RESISTANCE LIMIT.
 *
 * `rSourceDisqualifyOhm` has been a CHOICE key since F4c, which means that on
 * the v2 route it may only arm from the candidate. It did not: the key reaches
 * the tuner through `collect.choices` only when the candidate STATES it, and a
 * candidate that states nothing left the chain's own
 * `?? DEFAULT_R_SOURCE_DISQUALIFY_OHM` standing — in the search AND in the
 * ranking's disqualification list. So "the designer stated no limit" and "the
 * designer stated 2.0 Ω" arrived at the same place by different routes and
 * produced the same run.
 *
 * That is precisely the silent inheritance F4d ended for the tuner's own
 * options, surviving one level up in the chain wrapper, where `choices.ts` does
 * not reach. Casus 1 states no source-resistance requirement anywhere
 * (`manifest_en_geometrie.gestelde_eisen`), and V34 measured what the
 * inherited default costs once the probe reads where the quantity lives: at the
 * woofer's real impedance peak the designer's own best filter reads 3.98 Ω, so
 * a limit nobody asked for would disqualify the reference design.
 *
 * `null` and not `0`, because the chain distinguishes them: `null` is the
 * designer having stated none, `undefined` is nothing said (and then the
 * historical default applies, which is what every v1 run gets). A run without a
 * declaration is returned UNCHANGED — the identity is what keeps every non-v2
 * caller byte-identical.
 */
export function withDeclaredSourceLimit<
  I extends { settings: { rSourceDisqualifyOhm?: number | null } },
>(input: I, declaration: ChoiceDeclaration | undefined): I {
  if (!declaration) return input;
  const stated = declaration.stated.rSourceDisqualifyOhm;
  return {
    ...input,
    settings: {
      ...input.settings,
      rSourceDisqualifyOhm: stated === undefined ? null : stated,
    },
  };
}

/**
 * V36 — M-A's result, shaped into the shortlist's column.
 *
 * Deliberately trivial, and deliberately in one place: the fraction is copied,
 * the largest discrete resistor is the first non-parasitic element (the metric
 * already sorts them descending), and the watts are that element's share of a
 * power the designer stated. Nothing here decides anything.
 *
 * PARASITICS ARE EXCLUDED, exactly as `totalFraction` excludes them. A coil's
 * DCR is not a component anybody chooses a wattage for, and letting one win the
 * "largest resistor" column would point a builder at a part they cannot buy.
 */
function dissipationColumnOf(
  diss: DissipationResult | null,
  powerW: number | undefined,
  resistors: readonly ResistorLoad[] | null = null,
  coils: readonly CoilLoad[] | null = null,
): DissipationColumn | null {
  if (!diss) return null;
  const largest = diss.elements.find((e) => !e.parasitic) ?? null;
  const power = powerW !== undefined && powerW > 0 ? powerW : null;
  /* V50 — the coil with the highest peak current, and the allowance of the
   * hottest resistor when one exists. Read from the gate evaluation's own
   * lists, never recomputed (A3g). */
  const worstCoil = (coils ?? []).reduce<CoilLoad | null>(
    (a, l) => (l.peakA !== null && (a === null || a.peakA === null || l.peakA > a.peakA) ? l : a),
    null,
  );
  const hottest = largest ? (resistors ?? []).find((l) => l.id === largest.id) ?? null : null;
  return {
    totalFraction: diss.totalFraction,
    largestResistor: largest ? { id: largest.id, ohm: largest.ohm, fraction: largest.fraction } : null,
    largestResistorWatts: largest && power !== null ? largest.fraction * power : null,
    powerW: power,
    largestResistorAllowedW: hottest?.allowedW ?? null,
    worstCoil:
      worstCoil && worstCoil.peakA !== null
        ? { id: worstCoil.id, peakA: worstCoil.peakA, atHz: worstCoil.atHz, allowedA: worstCoil.allowedA }
        : null,
  };
}

/**
 * V45 — WHAT THE DELIVERED NETWORK ACTUALLY DOES TO THE REFLEX PEAK.
 *
 * THE HOLE V43 LEFT OPEN, in one sentence: `bump-series-l` solves its ceiling
 * at the path resistance OF THE SEED and then that ceiling stands for the whole
 * run, while the search is free to move the path resistance underneath it. V45
 * argued that this was conservative — more series R DAMPS the resonant half, so
 * a ceiling solved at 0.5 Ω is merely too strict at 3 Ω — and that half of the
 * argument is right. THE OTHER HALF WAS WRONG, and V48 is where it was
 * measured: a tune that LOWERS the path resistance is bounded by a ceiling
 * solved for a better-damped network, and that ceiling is PERMISSIVE. Two of
 * nine candidates on Sander's browser run of 01-09-2026 delivered 2.29 and
 * 1.61 dB of resonant lift against a stated 1.4, and this check is what caught
 * them.
 *
 * SO THIS CHECK IS UNCHANGED AND ITS MEANING IS NOT. It was the net under a
 * known hole; since V48 — where `seriesInductanceCeilingSource: 'tuned'` makes
 * the ceiling follow the tune — it is the GUARD that the hole is shut. It
 * still measures the delivered network, once, against the same stated budget:
 *
 *   · on a run whose ceiling tracked, it should never fire. If it does, the
 *     repair is incomplete and the candidate is not what is wrong.
 *   · on a run that states `'seed'` (and on every route that hands over no
 *     tracker) it is the same net it always was.
 *
 * IT RE-IMPLEMENTS NOTHING. `lfBump` is the F1 metric, solved on the SAME grid
 * and the SAME measured impedances the gate reference judges on and the report
 * builds its own M-D from (`impedanceReference.ts`, the V32 rule), with the
 * resistive equivalent for the decomposition exactly as `report.ts` takes it.
 * The panel and this check cannot disagree about a network because neither of
 * them computes it twice.
 *
 * Returns null when any input is missing — no near field, no resonance, no
 * solvable network. A budget with nothing under it produces no verdict, which
 * is the same answer `invertBudgets` gives one layer up (P4).
 *
 * ONE INPUT COMES FROM THE SEED AND NOT FROM THE DELIVERED NETWORK, and it is
 * named here rather than glossed: `crossingAboveHz`. It clips M-D's
 * normalisation frequency, and it does so ONLY when the derived reference
 * (`MD_REFERENCE_OVER_FP · f_p`) lands above the crossing — so it bites when
 * the way's own crossover sits below three times its resonance. Deriving it
 * from the delivered network would mean re-solving the branches and
 * re-deriving crossings here, which is a second implementation of
 * `deriveCrossings` in the one place that must not disagree with the report.
 * The seed's value is used, and the condition under which that could matter is
 * a fact anyone can check on a case book: on casus 1 3·f_p is 157 Hz and every
 * crossing in the field is 360-554 Hz, so the clip never fires and the two
 * readings are identical. On a design where it WOULD fire, this check becomes
 * approximate in the strict direction it is already conservative in.
 */
export function deliveredResonantDb(
  parts: readonly VxpPart[],
  model: string,
  input: {
    /** The way's measured near field, with its own validity band. */
    nearField?: { grid: readonly number[]; db: readonly number[]; validHz: [number, number] };
    /** The impedance peak M-D derives its band and reference from. */
    fPeakHz?: number;
    /** The grid and driver impedances every electrical verdict is taken on. */
    impedance?: { grid: readonly number[]; driverZ: Record<string, readonly Complex[]> };
    /** The crossing above this way — see the note above on where it comes from. */
    crossingAboveHz?: number;
  },
): number | null {
  const { nearField: nf, fPeakHz: fs, impedance: imp, crossingAboveHz } = input;
  if (!nf || fs === undefined || !imp) return null;
  let analysis;
  try {
    analysis = buildAnalysis(netlistOf(parts), [...imp.grid], imp.driverZ);
  } catch {
    return null;
  }
  const h = analysis.transferByModel[model];
  if (!h) return null;
  const eq = analysis.resistiveEquivalent();
  const hRes = eq.transferByModel[model];
  const r = lfBump(nf.grid, nf.db, imp.grid, h, fs, {
    validHz: nf.validHz,
    ...(crossingAboveHz !== undefined ? { belowHz: crossingAboveHz } : {}),
    ...(hRes && !eq.shortedDriverModels.includes(model) ? { resistiveHEl: hRes } : {}),
  });
  return r?.resonantDb ?? null;
}

function runCandidate<I, R extends { parts: VxpPart[]; net: { gateRefusals?: string[] } }>(
  input: I,
  v2: V2RunSettings,
  facts: Facts,
  network: NetworkFacts,
  run: (hooks: { tuneOptionsFor: (seed: readonly VxpPart[]) => Partial<NetOptimizeOptions> }) => R,
  /** F3 — what this candidate is judged on, once it exists. */
  judge: (r: R) => { measurements: CandidateMeasurements; topology: TopologyDescriptor },
  /** V31 — how a REFUSED tune is measured, when the tuner handed its parts back. */
  measureRejected: (parts: readonly VxpPart[]) => ResponseJudgement | null,
  /** F4d — where the candidate came from, when A5d generated it. */
  provenance?: string,
): V2CandidateResult<R> {
  const collect: {
    reference: GateReference | null;
    bounds: InvertedBound[];
    notes: string[];
    choices: Partial<CandidateChoices>;
    weights: Partial<GreyWeights>;
    /** V45 — the way A5d.6's first two inversions belong to, named once. */
    lowestModel: string | null;
  } = {
    reference: null,
    bounds: [],
    choices: {},
    weights: {},
    lowestModel: null,
    // THE FACTS PASS SPEAKS FIRST. A run that fell back to this worker's own
    // R_e, or to the whole grid for validity, has to say so before it says
    // anything about budgets — every note below is about what the budgets did
    // WITH those facts, and they read differently when the facts were a last
    // resort (V21, V22).
    notes: [...facts.notes],
  };
  void input;
  if (provenance) collect.notes.push(`Candidate provenance (A5d): ${provenance}`);
  const delivered = run({
    tuneOptionsFor: (seed) => tuneOptionsFor(seed, facts, network, v2, collect),
  });

  /* ---- V31: was the whole tune refused? ------------------------------- *
   * If it was, this candidate delivers NOTHING. The seed the tuner handed
   * back is withdrawn here — not hidden, withdrawn: it was never judged
   * against anything this candidate asked for, and a shortlist row is an
   * offer to build. What replaces it is a rejection with the rule's name, and
   * the metrics of the tune that was refused so the cost is visible. */
  /* V33 — where the amp-load barrier aimed, in the tuner's own words. A run
   * that does not say which band its goal was measured over is a run whose
   * outcome cannot be read: that is what V30, V32 and V33 were each about, one
   * layer apart. Absent on any run that stated no source, which is every v1
   * run and every v2 run without a stated floor. */
  const floorSource = (delivered.net as { zFloorSourceNote?: string }).zFloorSourceNote;
  if (floorSource) collect.notes.push(floorSource);
  /* V34 — and where the source-resistance probe read, for the same reason one
   * layer along: a hard limit is only readable beside the frequency it was
   * compared at. Absent on any run that stated no probe source, which is every
   * v1 run. */
  const probeSource = (delivered.net as { rSourceProbeNote?: string }).rSourceProbeNote;
  if (probeSource) collect.notes.push(probeSource);
  /* V37 — and WHAT the dissipation term divided by, for the same reason again:
   * a ratio is only readable beside the thing it is a ratio of. Absent on any
   * run that stated no source, which is every v1 run. */
  const dissRef = (delivered.net as { dissipationRefNote?: string }).dissipationRefNote;
  if (dissRef) collect.notes.push(dissRef);

  let refused = wholesaleRejection(delivered.net as WholesaleRejectionFields);

  /* ---- V45: the stated LF budget, tested on the network that is OFFERED --
   *
   * V31's shape, one rule family along. The tuner refuses on GATES; this
   * refuses on a stated BUDGET, and it says so — `by: 'stated-budget'` and
   * `kinds: ['budget']` rather than borrowing the gate's category, because a
   * caller that switched on `by` would otherwise be told a gate spoke when none
   * did (A3g: the categories are values, and they have to be true).
   *
   * WHY IT IS HERE AND NOT IN THE TUNER. A budget bounds the SEARCH BOX — that
   * is what an A5d.6 inversion is — and `bump-series-l` does exactly that. Two
   * things are then true and they are different: the box has to describe the
   * network being searched (V48 made it, through
   * `seriesInductanceCeilingSource`), and the network that is actually OFFERED
   * has to meet the requirement. A box is shaping and a requirement is a
   * verdict, and A5d.6 is explicit that the second is the authority.
   *
   * V45's own reasoning for putting it here — "teaching the tuner to re-solve
   * the inversion every evaluation is a session of its own" — turned out to be
   * exactly right about the cost: one inversion is 13 ms and a candidate takes
   * ~100 000 evaluations, so V48 had to memoise on a quantised path resistance
   * before it was affordable. What V45 got wrong is that this check closed the
   * direction that matters; it closed the direction that could be MEASURED
   * from here, which is not the same thing.
   *
   * ONLY WHEN THE TUNER DID NOT ALREADY REFUSE. A candidate that was thrown out
   * by a gate delivers nothing to test, and reporting a second reason for one
   * rejection would leave a reader guessing which one was decisive. */
  if (!refused && v2.budgets.lfBumpBudgetDb !== undefined && collect.lowestModel !== null) {
    const model = collect.lowestModel;
    const got = deliveredResonantDb(delivered.parts, model, {
      ...(facts.nearField[model] ? { nearField: facts.nearField[model] } : {}),
      ...(facts.fsHz[model] !== undefined ? { fPeakHz: facts.fsHz[model] } : {}),
      ...(collect.reference?.impedance
        ? {
            impedance: {
              grid: collect.reference.impedance.grid,
              driverZ: collect.reference.impedance.driverZ,
            },
          }
        : {}),
      ...(network.crossingAboveByModel[model] !== undefined
        ? { crossingAboveHz: network.crossingAboveByModel[model] }
        : {}),
    });
    if (got !== null && got > v2.budgets.lfBumpBudgetDb) {
      /* WHICH CEILING ACTUALLY BOUNDED THIS SEARCH, and the two answers mean
       * opposite things to whoever reads this. On a `'seed'` run the ceiling
       * described the network the search started from and this refusal is the
       * expected consequence (V45). On a `'tuned'` run the ceiling followed the
       * search, so this refusal should be unreachable — and saying so is the
       * point: it turns the message from an explanation into a report that
       * something is wrong with the repair rather than with the candidate. */
      const tracked = network.declaration?.stated.seriesInductanceCeilingSource === 'tuned';
      collect.notes.push(
        `The delivered network was tested against the stated LF budget on M-D's RESONANT half ` +
          `(V43) and exceeded it: ${got.toFixed(3)} dB against ${v2.budgets.lfBumpBudgetDb} dB on ` +
          `${model}. ` +
          (tracked
            ? 'The A5d.6 ceiling FOLLOWED the tune on this run (V48), so this should not have ' +
              'been reachable — the ceiling and the delivered network disagree, and that is a ' +
              'finding about the repair rather than about this candidate.'
            : "The A5d.6 ceiling that bounded the search was solved at the SEED's path " +
              'resistance and could not follow the tune (V45; stating ' +
              "`seriesInductanceCeilingSource: 'tuned'` makes it follow — V48)."),
      );
      refused = {
        by: 'stated-budget',
        kinds: ['budget'],
        reason:
          `the delivered network amplifies ${model}'s reflex peak by ${got.toFixed(2)} dB of ` +
          `resonant lift, against a stated budget of ${v2.budgets.lfBumpBudgetDb} dB (A4 M-D, ` +
          'the resonant half — casebook V43)',
        note: tracked
          ? 'The search box re-read this way\'s series-inductance ceiling at the path resistance ' +
            'of each network it evaluated (V48), so the ceiling described the network being ' +
            'built. That this check still fired means the two disagree — the quantised ceiling ' +
            'is meant to err only towards being too STRICT, so a delivered network above the ' +
            'budget is a defect in the tracking and not a candidate that slipped through.'
          : 'The search box bounded this way\'s series inductance at a ceiling solved on the ' +
            'SEED\'s path resistance, and the tune moved that resistance underneath it. The ' +
            'ceiling therefore described a different network than the one delivered — too ' +
            'strict where the tune RAISED that resistance, and permissive where it lowered it, ' +
            'which is the case this check exists to catch (V45, measured at V48).',
        fields: {
          ...(delivered.net as WholesaleRejectionFields),
          rejectedParts: [...delivered.parts],
        },
      };
    }
  }

  /* ---- V51: NO LEVEL WORK ON THE LOWEST WAY, tested on what is OFFERED --
   *
   * The requirement itself is honoured upstream (the design step trims the
   * lowest way by nothing, its synthesis places no pad, the tuner never
   * creates a resistor). What is decided HERE is what a candidate that could
   * not live with it comes back as: a V31 refusal with the NUMBER behind it —
   * how much level work this configuration asks on the lowest way, which is
   * the A5d.4 gap of that way to the anchor after the target curve (X), and
   * which crossed as a measured fact. The refusal fires only when all three
   * hold: the requirement is stated, X is above zero (a way that IS the anchor
   * asks nothing, and a miss is then not "because of" the requirement), and
   * the delivered network misses the staged pass's own ripple goal — the
   * tuner's definition of "targets met", and a CHOICE the candidate states.
   *
   * WHY THE RIPPLE GOAL AND NOT THE SPL WINDOW. The window is an A5e.1 taste
   * requirement that the relaxation ladder may widen, and a level step of X dB
   * at the low handover is not taste: it is a configuration fact. Letting the
   * ladder absorb it would publish a padless design under a relaxed window and
   * say nothing about why. The ripple goal is what the tuner itself aimed for
   * and could not reach, and the refusal names the number it could not reach
   * it without. The inventory of what the delivered network carries on the
   * lowest way travels with EVERY candidate (`levelWork`), refused or not. */
  const levelWorkRule = network.chainDeclaration?.stated.lowestWayLevelWork;
  const lowestForLevel = collect.lowestModel;
  /* V51b — on a refusal the inventory is of the network that was REFUSED (the
   * tuner's `rejectedParts`), because `delivered.parts` is then the seed and a
   * seed carries whatever the synthesis placed, tuned by nobody. */
  const partsForLevel: readonly VxpPart[] =
    refused?.fields.rejectedParts && refused.fields.rejectedParts.length > 0 ? refused.fields.rejectedParts : delivered.parts;
  const levelWorkDelivered = lowestForLevel !== null ? levelWorkOnWay(partsForLevel, lowestForLevel) : null;
  const askedDb: number | null =
    lowestForLevel === null
      ? null
      : facts.gapAnchorModel === lowestForLevel
        ? 0
        : (facts.gapBudgetDb[lowestForLevel] ?? null);
  const plateau = plateauCoverage(v2.targetCurve ?? FLAT_TARGET, judgeBandOf(v2, facts.grid));
  const maxSeriesOhm = seriesRMaxOhmOf(levelWorkRule);
  const verdict = levelWorkDelivered && levelWorkRule !== undefined ? levelWorkVerdict(levelWorkDelivered, levelWorkRule) : null;
  const levelWork: V2LevelWorkColumn = {
    requirement: levelWorkRule ?? null,
    lowestWay: lowestForLevel,
    anchor: facts.gapAnchorModel ?? null,
    askedDb,
    delivered: levelWorkDelivered,
    plateau,
    maxSeriesOhm,
    verdict,
    floorNeedsSeriesOhm: null,
    floorOhm: v2.gates.ampMinLoadOhm ?? null,
  };
  const askedSentence =
    askedDb === null
      ? 'how much this configuration asks is not known here (no anchored gap for it crossed). '
      : askedDb <= 0
        ? `${lowestForLevel} is the anchor, so the configuration asks none. `
        : `this configuration asks ${askedDb.toFixed(2)} dB of it (A5d.4 gap to the anchor ` +
          `${facts.gapAnchorModel ?? '?'}, target curve included). `;
  if (levelWorkRule === 'none' && lowestForLevel !== null) {
    collect.notes.push(
      `Level work on the lowest way (${lowestForLevel}) is FORBIDDEN by the project (V51): ` +
        askedSentence +
        (levelWorkDelivered ? `Delivered: ${describeLevelWork(levelWorkDelivered)}.` : ''),
    );
    if (levelWorkDelivered && !levelWorkDelivered.none && levelWorkDelivered.reachable) {
      collect.notes.push(
        `DEFECT: the requirement forbids level work on ${lowestForLevel} and the delivered network ` +
          'carries some — the design or synthesis step placed a resistor it was told not to. This ' +
          'is a finding about the repair, not about the candidate.',
      );
    }
  } else if (maxSeriesOhm !== null && lowestForLevel !== null) {
    /* V51b — the capped rule: what the network carries, split, and the
     * build-choice sentence. */
    collect.notes.push(
      `Level work on the lowest way (${lowestForLevel}) is LIMITED by the project to ` +
        `${describeLevelWorkRule(levelWorkRule)} (V51b): ` +
        askedSentence +
        (levelWorkDelivered
          ? `Delivered on ${lowestForLevel}: ${describeSeriesResistance(levelWorkDelivered)}` +
            (levelWorkDelivered.shuntPads.length > 0
              ? `, plus a shunt pad the rule forbids (${levelWorkDelivered.shuntPads.map((r) => r.id).join(', ')})`
              : '') +
            '. An air-core coil whose DCR is this resistance does the same as the discrete resistor — ' +
            'which of the two carries it is a build choice for the designer, not a decision of this run.'
          : ''),
    );
  }
  collect.notes.push(`Plateau: ${plateau.note}.`);
  /* ---- V51b: the delivered network EXCEEDS the stated rule ---------------
   *
   * The tuner's box holds the seed's free resistors under the maximum, but a
   * total is what the rule bounds and the catalogue snap can add DCR the box
   * never saw; and a pad the synthesis was told not to place is a defect either
   * way. Tested on what is offered, in the V45/V51 shape, and only when nothing
   * else already refused. */
  if (!refused && verdict && verdict.ok === false && maxSeriesOhm !== null && lowestForLevel !== null && levelWorkDelivered) {
    refused = {
      by: 'stated-topology',
      kinds: ['topology'],
      reason: `${verdict.why} (lowestWayLevelWork: series-r-max, V51b)`,
      note:
        'The tune COMPLETED and what it delivered carries more on the lowest way than the stated rule ' +
        'allows. The search box capped the seed\'s discrete resistors at the maximum with the coils\' ' +
        'DCR charged first, so a total above it means either a DCR the box did not see (a catalogue ' +
        'snap after the box was built) or a pad the synthesis was told not to place — a finding about ' +
        'the repair rather than about the candidate (casebook V51b).',
      fields: {
        ...(delivered.net as WholesaleRejectionFields),
        rejectedParts: [...delivered.parts],
      },
    };
  }
  /* ---- V51 / V51b: the ripple goal missed BECAUSE of the rule ------------
   *
   * Under `'none'` the rule forbade the pad outright (V51). Under a stated
   * maximum the same refusal fires only when the delivered network sits AT the
   * cap: a miss with room left under it is the tuner's, not the rule's. */
  const atCap =
    maxSeriesOhm !== null && levelWorkDelivered !== null && levelWorkDelivered.reachable && levelWorkDelivered.totalSeriesOhm >= maxSeriesOhm - 1e-6;
  if (!refused && (levelWorkRule === 'none' || atCap) && lowestForLevel !== null && askedDb !== null && askedDb > 0) {
    const goal = network.declaration?.stated.staged?.rippleDb;
    const after = delivered.net as { after?: { ripplePeakDb?: number; rippleDb?: number } };
    const peak = after.after?.ripplePeakDb ?? after.after?.rippleDb ?? null;
    if (goal !== undefined && peak !== null && peak > goal) {
      refused = {
        by: 'stated-topology',
        kinds: ['topology'],
        reason:
          `this configuration asks ${askedDb.toFixed(2)} dB of level work on the lowest way ` +
          `(${lowestForLevel} sits that far above the anchor ${facts.gapAnchorModel ?? '?'} after the ` +
          `target curve, A5d.4) and the project ` +
          (levelWorkRule === 'none'
            ? 'forbids level work there'
            : `limits it to ${maxSeriesOhm!.toFixed(2)} Ω of series resistance, which the delivered network is at ` +
              `(${levelWorkDelivered!.totalSeriesOhm.toFixed(3)} Ω)`) +
          `; without more the delivered network misses the ripple goal: ${peak.toFixed(2)} dB peak deviation against ${goal} dB`,
        note:
          (levelWorkRule === 'none'
            ? 'The tune COMPLETED with no pad on the lowest way, as required, and the surplus of that way ' +
              'over the anchor stayed in the sum. '
            : 'The tune COMPLETED with the series resistance of the lowest way at the stated maximum, and ' +
              'the rest of that way\'s surplus over the anchor stayed in the sum. ') +
          'What the coil\'s tilt and the baffle step could not ' +
          'absorb shows up as the ripple the staged pass could not reach. The number in `reason` is ' +
          'the configuration\'s, not the filter\'s: it is the same whichever candidate is tried, and ' +
          'it is what a series wiring, a different driver pair or an active low branch would have ' +
          'to deliver instead (casebook V51, V51b).',
        fields: {
          ...(delivered.net as WholesaleRejectionFields),
          rejectedParts: [...delivered.parts],
        },
      };
    }
  }
  /* ---- V51b: Y — what the FLOOR asks of the lowest way's series resistance --
   *
   * Solved on the network this candidate produced (the refused one, on a
   * refusal), against the same gate that judges it (`M-B/|Z|` through
   * `evaluateGates`, tolerance included): the total series resistance in front
   * of the driver at which the gate passes (inserted at the HEAD of the way,
   * where a series resistor and the first coil's DCR sit). On casus 1 at V51 the resistor in
   * the woofer path turned out to be doing the floor's work as well as the
   * level's, and this number is what makes that visible per candidate rather
   * than as a corpus count. Only where a floor is stated and a rule about the
   * lowest way is; every other run skips the solves (P2). */
  if (lowestForLevel !== null && levelWorkRule !== undefined && v2.gates.ampMinLoadOhm !== undefined && collect.reference) {
    const probeParts: readonly VxpPart[] = refused?.fields.rejectedParts && refused.fields.rejectedParts.length > 0 ? refused.fields.rejectedParts : delivered.parts;
    if (probeParts.length > 0 && levelWorkDelivered && levelWorkDelivered.reachable) {
      const need = seriesResistanceForFloor(probeParts, lowestForLevel, v2.gates, collect.reference, ratingsFor(probeParts, network));
      if (need.extraOhm !== null) {
        levelWork.floorNeedsSeriesOhm = levelWorkDelivered.totalSeriesOhm + need.extraOhm;
        collect.notes.push(
          need.extraOhm === 0
            ? `The stated floor of ${v2.gates.ampMinLoadOhm} Ω is met by this network with ${levelWorkDelivered.totalSeriesOhm.toFixed(3)} Ω ` +
              `of series resistance on ${lowestForLevel} (V51b, Y).`
            : `The stated floor of ${v2.gates.ampMinLoadOhm} Ω asks ${(levelWorkDelivered.totalSeriesOhm + need.extraOhm).toFixed(3)} Ω of ` +
              `total series resistance on ${lowestForLevel} (${levelWorkDelivered.totalSeriesOhm.toFixed(3)} Ω delivered + ` +
              `${need.extraOhm.toFixed(3)} Ω more at the head of the way; V51b, Y)` +
              (maxSeriesOhm !== null
                ? levelWorkDelivered.totalSeriesOhm + need.extraOhm > maxSeriesOhm
                  ? `, against a stated maximum of ${maxSeriesOhm.toFixed(2)} Ω — the rule is what stands between this candidate and the floor.`
                  : `, within the stated maximum of ${maxSeriesOhm.toFixed(2)} Ω.`
                : levelWorkRule === 'none'
                  ? ', and the project allows none (V51).'
                  : '.'),
        );
        /* The refusal names the number when the cap is what kept the tune
         * from the floor: the gate refused, and this is why it could not be
         * answered. Two rules were involved, and `kinds` says so. */
        if (refused && refused.by === 'active-gate' && need.extraOhm > 0) {
          const y = levelWorkDelivered.totalSeriesOhm + need.extraOhm;
          const capped = maxSeriesOhm !== null ? y > maxSeriesOhm : levelWorkRule === 'none';
          if (capped) {
            refused = {
              ...refused,
              kinds: refused.kinds.includes('topology') ? refused.kinds : [...refused.kinds, 'topology'],
              reason:
                `${refused.reason} — this candidate asks ${y.toFixed(2)} Ω of series resistance on the lowest way ` +
                `(${lowestForLevel}) for the floor, against ` +
                (maxSeriesOhm !== null ? `a stated maximum of ${maxSeriesOhm.toFixed(2)} Ω` : 'a project that allows none') +
                ' (V51b, Y)',
            };
          }
        }
      } else {
        collect.notes.push(
          `Y (V51b) could not be solved for ${lowestForLevel} against the stated floor of ${v2.gates.ampMinLoadOhm} Ω: ${need.why}. ` +
            'Reported as unknown, not as zero.',
        );
      }
    }
  }

  let rejection: CandidateRejection | null = null;
  let result = delivered;
  if (refused) {
    const rt = refused.fields.rejectedTune;
    const parts = refused.fields.rejectedParts;
    const judged = parts && parts.length > 0 ? measureRejected(parts) : null;
    const num = (v: number | null | undefined): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    /* V47 — the refused network's own M-C, taken before the parts are blanked.
     * The WORST protected way rather than a named driver: the gate judges every
     * way it calls high-pass protected, and nothing in this file may know which
     * of them is "the tweeter". Null covers both empty states honestly — no
     * reference to judge on, and a network with no protected way at all (which
     * is itself what a destroyed high-pass looks like). */
    const refusedDrive = ((): number | null => {
      if (!parts || parts.length === 0 || !collect.reference) return null;
      try {
        const e = evaluateGates(netlistOf(parts), v2.gates, collect.reference, 'frozen');
        const db = e.metrics.driveVoltage.map((d) => d.db);
        return db.length > 0 ? Math.max(...db) : null;
      } catch {
        return null;
      }
    })();
    rejection = {
      kinds: refused.kinds,
      reason: refused.reason,
      /* V45 — filled from EITHER source. `rejectedTune` is what the tuner
       * reports about a tune it threw away; `judged` is this side measuring the
       * parts that came with the refusal. A gate refusal has both, a
       * stated-budget refusal has only the second — and dropping the row
       * entirely in that case would withdraw a network and say nothing about
       * what withdrawing it cost, which is the one thing V31 exists to show. */
      rejectedTune:
        rt || judged
          ? {
              minZOhm: num(rt?.zMinOhm),
              windowPlusMinusDb: num(judged?.windowPlusMinusDb),
              rmsDeviationDb: num(judged?.rmsDeviationDb),
              rippleDb: num(rt?.rippleDb),
              phaseDeg: num(rt?.phaseDeg),
              driveOnFsDb: refusedDrive,
            }
          : null,
      note:
        (refused.by === 'stated-budget' || refused.by === 'stated-topology'
          ? 'The tune COMPLETED and the network it produced fails a requirement this project ' +
            'stated, so this candidate delivers nothing. What is withdrawn here is a real tuned ' +
            'design rather than a seed — it is withdrawn because it may not be built, not ' +
            'because nobody judged it (casebook V31 for the shape, V45 and V51 for the rules). '
          : 'The whole tune was refused, so this candidate delivers no network. What the tuner ' +
            'returned is its SEED — a design nobody judged against anything this candidate asked ' +
            'for — and it is withdrawn here rather than offered (F0: an empty field is not a ' +
            'judgement, and a seed is not empty either; casebook V31). ') +
        'The figures under `rejectedTune` describe the network that was REFUSED and will not ' +
        'be built. ' +
        (refused.kinds.length === 0
          ? 'The refusing rule records no category, which today means the solo sensitivity ' +
            'gate; read `reason`.'
          : `Refused by: ${refused.kinds.join(', ')} (${refused.by}).`) +
        /* V33 — the refusing rule's own account of what it did, when it has
         * one. An active-gate refusal says here that the fallback was refused
         * as well, which is the difference between "the tune was thrown away"
         * and "nothing this run reached is buildable". */
        (refused.note ? ` ${refused.note}` : ''),
    };
    /* THE SEED GOES — BOTH COPIES OF IT — and so do the rejected parts.
     *
     * `parts` and `net.parts` are two lists of the same components: the chain
     * hands its own copy up while the tuner's result keeps the one it built.
     * Blanking only the first is what the live V31 test caught on its first
     * run, and it is the whole reason that test serialises the ENTIRE result
     * and looks for a part list rather than checking the field it expects to
     * find one in. Nothing a caller can serialise into a netlist may leave
     * here for a candidate that delivered nothing. */
    result = {
      ...delivered,
      parts: [],
      net: { ...(delivered.net as object), parts: [], rejectedParts: undefined },
    } as R;
  }

  let gates: GateVerdict[] = [];
  let gatesDerived: GateVerdict[] = [];
  let violation: string | null = null;
  let dissipation: DissipationColumn | null = null;
  if (!rejection && collect.reference) {
    try {
      const netlist = netlistOf(result.parts);
      const ratings = ratingsFor(result.parts, network);
      const frozen = evaluateGates(netlist, v2.gates, collect.reference, 'frozen', ratings);
      const derived = evaluateGates(netlist, v2.gates, collect.reference, 'derived', ratings);
      gates = frozen.verdicts;
      gatesDerived = derived.verdicts;
      /* V36 — the column, from the evaluation that already measured it. The
       * FROZEN half on purpose: it is the reference the search was held to, and
       * it is the same half the M-A verdict beside it comes from, so a table
       * cannot show a fraction from one convention and watts from the other.
       *
       * The watts are `fraction × power` and not a second `dissipation()` call
       * with `amplifierPowerW` passed in: that would solve the network again to
       * multiply by a scalar, and two solves of one question is how the two
       * answers start to differ (A3g). */
      dissipation = dissipationColumnOf(
        frozen.metrics.dissipation,
        v2.amplifierPowerW,
        frozen.metrics.resistorLoads,
        frozen.metrics.coilLoads,
      );
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

  /* A rejected candidate is not measured: every number would be the seed's,
   * wearing this candidate's label. That is the same claim the withdrawn
   * netlist would have made, in a column instead of a file. */
  const judged = rejection
    ? { measurements: { response: null, phaseTracking: [] }, topology: judge(delivered).topology }
    : judge(result);
  if (rejection) collect.notes.push(rejection.note, `Refusing rule: ${rejection.reason}`);

  return {
    result,
    gates,
    gatesDerived,
    violation,
    bounds: collect.bounds,
    gateRefusals: result.net.gateRefusals ?? [],
    measurements: judged.measurements,
    topology: judged.topology,
    dissipation,
    rejection,
    levelWork,
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
        const { input, v2: v2Wire, candidate } = req.payload;
        const v2 = withDerivedDriveCeiling(v2Wire);
        const facts = measurementFacts(
          input.grid,
          input.driverZ,
          { woofer: input.w.spl, mid: input.m.spl, tweeter: input.t.spl },
          v2,
        );
        /* The candidate's own network facts. The key mapping is the same one
         * `branchDb` above uses — on the three-way chain the seed's way names
         * ARE the model names `driverZ` is keyed by. The tweeter has no
         * handover above it, so it contributes no crossing. */
        const network: NetworkFacts = {
          // A way's HP flank belongs to the handover BELOW it, so the mid's
          // order is the low pair's and the tweeter's is the high pair's —
          // the same convention `parseHpLpPref` documents in the app. 'auto'
          // arrives as `undefined`: nothing is declared yet, and an absent
          // order is a different statement from order 1.
          orderByModel: pruneUndefined({
            ...{
              mid: input.settings.structureLow?.order,
              tweeter: input.settings.structureHigh?.order,
            },
            // F4d (V26 row 39): a generated candidate always knows its order
            // per flank, so it always states it. Merged over the read-back
            // rather than instead of it, so a payload without a candidate
            // behaves exactly as it did before.
            ...(candidate?.orderByModel ?? {}),
          }),
          crossingAboveByModel: pruneUndefined({
            woofer: input.xoLow,
            mid: input.xoHigh,
          }),
          /* F4c — the search choices this candidate carries, read back out of
           * the settings the chain was handed. Nothing is decided here: the
           * point is that they cross the hook NAMED instead of riding along in
           * the chain's own spread. */
          choices: pruneUndefinedValues({
            band: input.settings.band,
            acousticSlopes: input.settings.acousticSlopes,
            catalogSnap: input.settings.catalogSnap,
            ampTarget: input.settings.ampTarget,
            phaseMetric: input.settings.phaseMetric,
            powerMetric: input.settings.powerMetric,
            breakupGuard: input.settings.breakupGuard,
            xoFloorPairs: input.settings.xoFloorPairs,
            ampMinLoadOhm: input.settings.ampMinLoadOhm,
            rSourceDisqualifyOhm: input.settings.rSourceDisqualifyOhm,
          }),
          weights: pruneUndefinedValues({
            phasePriority: input.settings.phasePriority,
            directivityWeight: input.settings.directivityWeight,
            powerFoldWeight: input.settings.powerFoldWeight,
            dissipationWeight: input.settings.dissipationWeight,
            costWeight: input.settings.costWeight,
          }),
          ...(candidate
            ? {
                declaration: candidate.declaration,
                chainDeclaration: candidate.chainDeclaration,
              }
            : {}),
        };
        /* V34 — the candidate's declaration overrides the chain's own default
         * for the one CHOICE key the chain resolves outside the tuner. Identity
         * when there is no candidate, so every other caller is untouched.
         *
         * V41 — and the two the chain resolves before the tuner exists at all.
         * Same shape, same identity: no candidate, no rewrite. */
        const chainInput = withDeclaredChainChoices(
          withDeclaredSourceLimit(input, candidate?.declaration),
          candidate?.chainDeclaration,
        );
        data = runCandidate<Chain3Input, Chain3Result>(
          chainInput,
          v2,
          facts,
          network,
          (hooks) =>
            runThreeWayChain(
              chainInput,
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
            /* V44 — the historic reading rides along per pair when the
             * admission was armed. It judges nothing; the shortlist prints it
             * beside the delivered number so a figure that MOVED reads as a
             * redefinition instead of a regression. */
            const control = r.net.after.pairPhaseControlDeg ?? [];
            const labels = ['woofer|mid', 'mid|tweeter'];
            return {
              measurements: {
                response,
                phaseTracking: pairs
                  .map((deg, i) => ({
                    subject: labels[i] ?? `pair ${i}`,
                    meanAbsDeg: deg,
                    ...(Number.isFinite(control[i]) ? { controlDeg: control[i] } : {}),
                  }))
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
          /* V31 — the SPL window of a tune that was refused, measured with the
           * same machinery a delivered candidate gets. The parts come in and
           * do not go out: `runCandidate` drops them, so what a caller sees is
           * a number about a network it cannot build. */
          (parts) => {
            const sum = summedResponse(
              parts,
              input.grid,
              [
                { model: 'woofer', response: input.w },
                { model: 'mid', response: input.m },
                { model: 'tweeter', response: input.t },
              ],
              input.driverZ,
            );
            return sum
              ? judgeResponse(
                  sum.freq,
                  sum.spl,
                  v2.targetCurve ?? FLAT_TARGET,
                  judgeBandOf(v2, input.grid),
                )
              : null;
          },
          candidate?.provenance,
        );
        break;
      }
      case 'v2ChainOne': {
        const { input, label, v2: v2Wire, candidate } = req.payload;
        const v2 = withDerivedDriveCeiling(v2Wire);
        const facts = measurementFacts(
          input.grid,
          input.driverZ,
          { mid: input.w.spl, tweeter: input.t.spl },
          v2,
        );
        /* Two-way: the low way is called `woofer` in the seed and `mid` in the
         * impedance map — `canonicalModelForRole` is the reason, and the
         * mapping here is the same one `branchDb` above already makes. The
         * candidate states a RANGE rather than a point on this route, so the
         * handover above the low way is its centre; F4c makes that explicit. */
        const xoCentre =
          input.xoRange && input.xoRange[1] > input.xoRange[0]
            ? Math.sqrt(input.xoRange[0] * input.xoRange[1])
            : undefined;
        const network: NetworkFacts = {
          orderByModel: pruneUndefined({
            tweeter: declaredHpOrder(input.seed.tweeter),
            ...(candidate?.orderByModel ?? {}),
          }),
          crossingAboveByModel: pruneUndefined({ mid: xoCentre }),
          /* F4c — the search choices this candidate carries, read back out of
           * the settings the chain was handed. Nothing is decided here: the
           * point is that they cross the hook NAMED instead of riding along in
           * the chain's own spread. */
          choices: pruneUndefinedValues({
            band: input.settings.band,
            acousticSlopes: input.settings.acousticSlopes,
            catalogSnap: input.settings.catalogSnap,
            ampTarget: input.settings.ampTarget,
            phaseMetric: input.settings.phaseMetric,
            powerMetric: input.settings.powerMetric,
            breakupGuard: input.settings.breakupGuard,
            ampMinLoadOhm: input.settings.ampMinLoadOhm,
            rSourceDisqualifyOhm: input.settings.rSourceDisqualifyOhm,
          }),
          weights: pruneUndefinedValues({
            phasePriority: input.settings.phasePriority,
            directivityWeight: input.settings.directivityWeight,
            powerFoldWeight: input.settings.powerFoldWeight,
            dissipationWeight: input.settings.dissipationWeight,
            costWeight: input.settings.costWeight,
          }),
          ...(candidate ? { declaration: candidate.declaration } : {}),
        };
        /* V34 — see the three-way branch above; same rule, same reason.
         *
         * V41 IS DELIBERATELY NOT APPLIED HERE, and it is the same boundary
         * V38-fix drew for the two-way design step. `ChainSettings` names the
         * EQ budget `eqBandsPerDriver` and derives its lean threshold inside
         * `designChain.ts`, so honouring the chain declaration on this route
         * would mean a second mapping of two keys into a second vocabulary —
         * and the two-way route is still v1 (TODO(F2c)). The candidate's chain
         * declaration therefore travels and is not read here; the note below
         * says so rather than letting a reader assume it was. */
        const chainInput = withDeclaredSourceLimit(input, candidate?.declaration);
        data = runCandidate<ChainInput, ChainResult>(
          chainInput,
          v2,
          facts,
          network,
          (hooks) =>
            runDesignChain(
              chainInput,
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
                  ? [
                      {
                        subject: 'low|high',
                        meanAbsDeg: r.net.after.phaseDeg,
                        ...(Number.isFinite(r.net.after.pairPhaseControlDeg?.[0])
                          ? { controlDeg: r.net.after.pairPhaseControlDeg![0] }
                          : {}),
                      },
                    ]
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
          /* V31 — see the three-way branch: measured here, not handed out. */
          (parts) => {
            const sum = summedResponse(
              parts,
              input.grid,
              [
                { model: 'mid', response: input.w },
                { model: 'tweeter', response: input.t },
              ],
              input.driverZ,
            );
            return sum
              ? judgeResponse(
                  sum.freq,
                  sum.spl,
                  v2.targetCurve ?? FLAT_TARGET,
                  judgeBandOf(v2, input.grid),
                )
              : null;
          },
          candidate?.provenance,
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
