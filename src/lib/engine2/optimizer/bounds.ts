/**
 * DELIVERABLE 4 / A5d.6 — MEASUREMENT-DERIVED SEARCH-SPACE BOUNDS.
 *
 * "Elke budgetmetriek die monotoon van een componentwaarde afhangt is
 * inverteerbaar naar een grens op die component, met uitsluitend gemeten
 * Z/NF/SPL plus de projectbudgetten als invoer."
 *
 * The point is stated at the end of A5d.6 and it is worth repeating because
 * it is the whole reason this file exists rather than another penalty term:
 * "Pathologisch gedrag (weerstand-drift naar extreme waarden voor 'gratis'
 * faserotatie) wordt daarmee per constructie onmogelijk i.p.v. per straf
 * ontmoedigd." A bound that is part of the box cannot be traded away by a
 * search; a penalty can, and V2 in the casebook is what that looks like.
 *
 * TWO CLASSES, AND THEY ARE NOT EQUAL CITIZENS.
 *
 *   EXACT INVERSIONS depend on few enough components that the inversion is a
 *   statement about the design rather than about one topology. All three of
 *   A5d.6's are here, each solved on measured data only:
 *     · max total series R in the lowest path, from the Q_es budget;
 *     · max series L at a given path R, from the LF-lift budget;
 *     · max path attenuation, from the measured sensitivity gap.
 *
 *   TOPOLOGY-AWARE PRE-BOUNDS hold exactly for a single section and loosen
 *   with every extra order. A5d.6 says to apply them "als zoekdoos-vormgeving
 *   met speling; de poort blijft de autoriteit", and V12 is the reason: a
 *   single-section series-C pre-bound of 5–10 µF collides with a realised
 *   fourth-order midrange branch carrying 42 µF. So they carry `slack: true`,
 *   they widen per order, and no verdict is ever taken on one.
 *
 * WHAT THIS FILE DOES NOT DO. It does not read the catalogue. A5e.3 —
 * "optimalisatiegrenzen = catalogus-spanwijdte ∩ meetafgeleide budgetgrenzen"
 * — is an open specification decision, so the intersection here is with the
 * app's own bounds and nothing else. See the TODO at `searchBoxFor`.
 */

import type { VxpPart } from '../../parsers/vxp.ts';
import type { Complex } from '../../complex.ts';
import { busTopology } from '../../netOptimizer.ts';
import { effectiveDriveLimit } from './gates.ts';
import {
  BOUND_BRACKET_DOUBLINGS,
  BOUND_CEILING_PATH_R_GRAIN_OHM,
  BOUND_INVERSION_STEPS,
  DB_PER_DECADE_AMPLITUDE,
  DB_PER_DECADE_POWER,
  F_PER_UF,
  H_PER_MH,
  PREBOUND_SLACK_PER_ORDER,
} from '../constants.ts';
import { lfBump } from '../metrics/acoustic.ts';

/* ================================================================== *
 * Settings
 * ================================================================== */

/** The three budget fields of Deliverable 4. Absent = that bound is OFF. */
export interface BudgetSettings {
  /**
   * A4 M-D — how much extra low-frequency lift the filter and the source
   * impedance may add on top of the bare driver-in-box behaviour, dB.
   */
  lfBumpBudgetDb?: number;
  /**
   * A4 M-E — the largest factor by which the source resistance may multiply
   * Q_es. Dimensionless and greater than one; 1.5 means "Q_es may rise by
   * half".
   */
  qesMultiplierMax?: number;
  /**
   * A5d.4 — how many dB of attenuation a way may spend ON TOP OF its anchored
   * sensitivity budget. The budget itself is measured (the gap to the anchor);
   * this is the designer's margin over it.
   */
  dampingMarginDb?: number;
}

export function anyBudgetActive(s: BudgetSettings): boolean {
  return (
    s.lfBumpBudgetDb !== undefined ||
    s.qesMultiplierMax !== undefined ||
    s.dampingMarginDb !== undefined
  );
}

/** Stable serialisation of the ACTIVE budgets, for the run fingerprint. */
export function budgetSettingsKey(s: BudgetSettings): Record<string, number> {
  const out: Record<string, number> = {};
  if (s.lfBumpBudgetDb !== undefined) out.lfBumpBudgetDb = s.lfBumpBudgetDb;
  if (s.qesMultiplierMax !== undefined) out.qesMultiplierMax = s.qesMultiplierMax;
  if (s.dampingMarginDb !== undefined) out.dampingMarginDb = s.dampingMarginDb;
  return out;
}

/* ================================================================== *
 * The exact inversions
 * ================================================================== */

/**
 * A5d.6 — MAX TOTAL SERIES RESISTANCE from the Q_es budget.
 *
 *     Q_es' / Q_es = (R_e + R_s) / R_e   ⇒   R_s ≤ R_e·(q − 1)
 *
 * Exact, and exactly as cheap as it looks: the only measured input is R_e,
 * which A4 already declares as M-E's data need. Returns null when the budget
 * asks for no multiplication at all (q ≤ 1 means "no series resistance
 * whatever", which is a statement the caller should make deliberately rather
 * than receive as a bound of zero).
 */
export function maxSeriesResistanceFromQes(reOhm: number, qMax: number): number | null {
  if (!(reOhm > 0) || !(qMax > 1)) return null;
  return reOhm * (qMax - 1);
}

/**
 * A5d.6 — MAX PATH ATTENUATION, inverted into a maximum series resistance.
 *
 *     A = 20·log10(|Z| / |Z + R|)   ⇒   R_max = Z·(10^(A/20) − 1)
 *
 * `zRefOhm` is the way's own impedance level over its passband — the median
 * of |Z| there, taken by the caller. Median rather than mean for the same
 * reason R_e is a median: one resonant bin inside a passband must not decide
 * how much padding is allowed.
 *
 * The budget A is the anchored sensitivity gap of A5d.4 plus whatever damping
 * margin the project stated. Both come in as one number, because the sum is
 * what the pad has to deliver and splitting it here would invite a second
 * opinion about which half was which.
 */
export function maxPadResistanceFromAttenuation(zRefOhm: number, budgetDb: number): number | null {
  if (!(zRefOhm > 0) || !(budgetDb > 0)) return null;
  return zRefOhm * (10 ** (budgetDb / DB_PER_DECADE_AMPLITUDE) - 1);
}

/** What the LF-lift inversion needs — all of it measured. */
export interface BumpInversionInput {
  /** The near-field measurement of the way, in dB on its own grid. */
  nfGrid: readonly number[];
  nfDb: readonly number[];
  /** The measured impedance of the way, on its own grid. */
  zGrid: readonly number[];
  z: readonly Complex[];
  /** The impedance peak M-D derives its band and reference from. */
  fPeakHz: number;
  /** The near field's validity band, so the metric clips as A5.5 requires. */
  nfValidHz?: [number, number];
  /** The crossing above this way, when there is one — M-D's reference clip. */
  belowHz?: number;
  /** Series resistance already in the path (DCR included), ohms. */
  pathROhm: number;
  /**
   * Explicit M-D band and reference, replacing the derivation from f_p.
   * Passed by the golden suite alone, to reproduce a withdrawn reference from
   * the session parameters recorded beside it (V15). Nothing in the engine
   * sets these.
   */
  overrideBandHz?: [number, number];
  overrideReferenceHz?: number;
}

/**
 * A5d.6 — MAX SERIES INDUCTANCE at a given path resistance, from the LF-lift
 * budget. A 1-D solve on the measured impedance peak and the measured near
 * field, exactly as the spec words it.
 *
 * THE METRIC IS NOT RE-IMPLEMENTED HERE. The bump is computed by `lfBump`,
 * the F1 metric, on an electrical transfer this function synthesises for the
 * candidate L:
 *
 *     H_el(f) = Z(f) / (Z(f) + R_path + jωL)
 *
 * That transfer is the definition of a series R+L feeding the measured load,
 * and it is the only thing this function contributes. Everything about which
 * band the lift is judged on, where it is normalised and how coverage is
 * reported stays where A4 put it.
 *
 * IT SOLVES AGAINST THE RESONANT HALF SINCE V43, and that is the single most
 * consequential line in this file. Until V43 the budget was compared with the
 * WHOLE lift, `extraDb`, and `extraDb` at L = 0 is not zero: `H_el = Z/(Z + R)`
 * with no reactance at all already raises the peak relative to the reference,
 * because |Z| is high at one and low at the other. The measured consequences on
 * casus 1 were two, and both were wrong in the same direction:
 *
 *   · the budget condemned LEVEL WORK. All three of the designer's own
 *     reference filters exceeded 2.5 dB while their coils added nothing —
 *     HUIDIG reads 4.69 dB of resistive lift against −0.94 dB of resonant
 *     amplification.
 *   · above roughly 1.5 Ω of path resistance the budget was spent before any
 *     coil existed, so this function returned null and there was NO bound at
 *     all. Six of nine frozen netlists sat there, HUIDIG among them. (That is
 *     the case V12 described, and it is now unreachable for this rule.)
 *
 * So the quantity is `resonantDb = extraDb(L) − extraDb(0)`: what the REACTANCE
 * adds on top of the network's own resistive equivalent. At L = 0 it is exactly
 * zero by construction, so a bound always exists — the requirement is never
 * silent — and what it bounds is the coil, which is what the rule of thumb it
 * comes from was ever about. The resistive half is not unbounded, it is simply
 * not this rule's business: it is anchor work (A5e.2, target curve and damping
 * margin).
 *
 * Returns null only when the METRIC returns nothing — missing near field,
 * missing sweep, a band that no measurement covers. That is a data answer, not
 * a design one, and the caller says which input was absent.
 *
 * `lfBumpForSeriesRL` is the transfer synthesis on its own, EXPORTED since V43
 * for one reason: the case book records what the lift is at L = 0 (the purely
 * resistive part of it) and at candidate inductances, and a test that checked
 * those numbers by building the same `Z/(Z + R + jωL)` again would be a second
 * implementation of the one thing this function contributes. One synthesis,
 * two readers.
 */
export function lfBumpForSeriesRL(input: BumpInversionInput, henry: number): number | null {
  const h: Complex[] = input.zGrid.map((f, i) => {
    const zl = {
      re: input.z[i].re + input.pathROhm,
      im: input.z[i].im + 2 * Math.PI * f * henry,
    };
    const d = zl.re * zl.re + zl.im * zl.im;
    if (!(d > 0)) return { re: 0, im: 0 };
    return {
      re: (input.z[i].re * zl.re + input.z[i].im * zl.im) / d,
      im: (input.z[i].im * zl.re - input.z[i].re * zl.im) / d,
    };
  });
  const r = lfBump(input.nfGrid, input.nfDb, input.zGrid, h, input.fPeakHz, {
    ...(input.nfValidHz ? { validHz: input.nfValidHz } : {}),
    ...(input.belowHz !== undefined ? { belowHz: input.belowHz } : {}),
    ...(input.overrideBandHz ? { overrideBandHz: input.overrideBandHz } : {}),
    ...(input.overrideReferenceHz !== undefined
      ? { overrideReferenceHz: input.overrideReferenceHz }
      : {}),
  });
  return r ? r.extraDb : null;
}

export function maxSeriesInductanceFromBump(
  input: BumpInversionInput,
  budgetDb: number,
): { maxHenry: number; atBudgetDb: number; resistiveLiftDb: number } | null {
  /* The purely resistive lift of this path: the SAME metric with no reactance
   * in the chain, which is exactly what the network's resistive equivalent is
   * for a series R+L. It is the zero of the quantity being bounded, and it is
   * carried out so the caller can report what the search is not allowed to
   * touch. */
  const atZero = lfBumpForSeriesRL(input, 0);
  if (atZero === null) return null;

  /** What the REACTANCE adds on top of that — the quantity the budget bounds. */
  const resonantAt = (henry: number): number | null => {
    const v = lfBumpForSeriesRL(input, henry);
    return v === null ? null : v - atZero;
  };

  // Bracket: grow until the budget is exceeded, then bisect. The amplification
  // is monotone in L for a series inductor into a measured load — more series
  // reactance at resonance is more amplification — but the bracket is grown
  // rather than assumed so a non-monotone measurement produces a conservative
  // answer instead of a wrong one.
  let lo = 0;
  let hi = H_PER_MH; // 1 mH, a starting bracket in SI — not a limit.
  let guard = 0;
  while (guard++ < BOUND_BRACKET_DOUBLINGS) {
    const v = resonantAt(hi);
    if (v === null || v > budgetDb) break;
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < BOUND_INVERSION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const v = resonantAt(mid);
    if (v !== null && v <= budgetDb) lo = mid;
    else hi = mid;
  }
  return {
    maxHenry: lo,
    atBudgetDb: resonantAt(lo) ?? budgetDb,
    resistiveLiftDb: atZero,
  };
}

/**
 * V48 — THE CEILING AS A FUNCTION OF THE PATH RESISTANCE, MEMOISED.
 *
 * WHAT WAS WRONG. `maxSeriesInductanceFromBump` is solved once, at the path
 * resistance OF THE SEED, and the number it returns then stands for the whole
 * tune — while the tune is free to move that resistance underneath it. V45
 * wrote that down as an open point and argued it was safe: more series R damps
 * the resonant half, so a ceiling solved at 0.5 Ω is conservative at 3 Ω. The
 * argument is sound and the direction is right; what it left out is the other
 * direction. A tune that LOWERS the path resistance — spending less on a pad,
 * or moving level work out of the series path — gets a ceiling solved for a
 * better-damped network than the one it is building, and that ceiling is
 * PERMISSIVE. Sander's browser run of 01-09-2026 is the measurement: two of
 * nine candidates delivered 2.29 and 1.61 dB of resonant lift against a stated
 * 1.4, and the delivered-network check caught both. Catching is losing, though
 * — those were legitimate candidates that a correct ceiling would have steered
 * to a buildable network instead of throwing away at the end.
 *
 * WHAT THIS IS. The same inversion, exposed as a function of the path
 * resistance rather than as a number solved at one. The tuner holds the
 * current path resistance of the way at every evaluation (it is a lookup and a
 * sum over the free series resistors, exactly as `dcSeriesR` already does for
 * the source-resistance limit), so the ceiling can follow the tune instead of
 * describing the network the tune started from.
 *
 * WHY IT IS MEMOISED AND NOT SIMPLY CALLED. Measured on casus 1: one inversion
 * is 13 ms — sixty bisection steps, each a full `lfBump` over the measured
 * near field and sweep. A casus-1 candidate takes on the order of 100 000
 * objective evaluations, so calling this per evaluation is twenty minutes of
 * arithmetic for one bound. The path resistance is therefore quantised to
 * `BOUND_CEILING_PATH_R_GRAIN_OHM` and each cell is solved once; a tune visits
 * a few dozen cells. The quantisation is DOWNWARD, which is what makes it safe
 * rather than merely small — see the constant, and the monotonicity it rests
 * on is measured on the frozen corpus rather than assumed.
 *
 * IT RE-IMPLEMENTS NOTHING. It closes over the same `BumpInversionInput` the
 * one-shot solve takes, minus the path resistance, and calls the one-shot
 * solve. One inversion, two ways of asking it.
 *
 * DETERMINISM (A5e.4). The memo is a pure cache: the value returned for a
 * given quantised path resistance does not depend on what was asked before it,
 * so two runs that visit the same points return the same numbers in the same
 * order. Nothing here is shared between candidates — the closure is built per
 * bound, per run.
 */
export type SeriesInductanceCeiling = (pathROhm: number) => number | null;

export function seriesInductanceCeilingTracker(
  input: Omit<BumpInversionInput, 'pathROhm'>,
  budgetDb: number,
): SeriesInductanceCeiling {
  const memo = new Map<number, number | null>();
  return (pathROhm: number): number | null => {
    if (!Number.isFinite(pathROhm) || pathROhm < 0) return null;
    const cell = Math.floor(pathROhm / BOUND_CEILING_PATH_R_GRAIN_OHM);
    if (memo.has(cell)) return memo.get(cell)!;
    const solved = maxSeriesInductanceFromBump(
      { ...input, pathROhm: cell * BOUND_CEILING_PATH_R_GRAIN_OHM },
      budgetDb,
    );
    const v = solved === null ? null : solved.maxHenry;
    memo.set(cell, v);
    return v;
  };
}

/**
 * A5d.6 — the TOPOLOGY-AWARE PRE-BOUND on a series capacitor, from the f_s
 * drive budget (M-C).
 *
 * ⚠ SLACK, NEVER A VERDICT. For a single first-order section the required
 * attenuation on f_s fixes the capacitor exactly; every extra order takes a
 * share of that attenuation, so the bound on any one section widens. The
 * widening factor is `PREBOUND_SLACK_PER_ORDER` per order above the first and
 * it is UNCALIBRATED — V12's counterexample (a fourth-order midrange branch
 * carrying 42 µF against a single-section bound of 5–10 µF) is in the
 * regression suite precisely so that this bound can never quietly exclude a
 * design the gate would have accepted.
 *
 * `zRefOhm` is the way's impedance level in its passband, `budgetDb` the
 * attenuation M-C asks for on f_s (a positive number of dB), `fsHz` the
 * resonance.
 */
export function preBoundSeriesCapacitance(
  zRefOhm: number,
  fsHz: number,
  budgetDb: number,
  order: number,
): number | null {
  if (!(zRefOhm > 0) || !(fsHz > 0) || !(budgetDb > 0)) return null;
  // A single RC section attenuates by |Z| / |Z + 1/(jωC)|. Solving for the
  // reactance that produces `budgetDb`:
  //     |X| = Z·sqrt(10^(A/10) − 1)  ⇒  C = 1/(2π f_s |X|)
  const x = zRefOhm * Math.sqrt(10 ** (budgetDb / DB_PER_DECADE_POWER) - 1);
  if (!(x > 0)) return null;
  const exact = 1 / (2 * Math.PI * fsHz * x);
  const orders = Math.max(1, Math.round(order));
  return exact * PREBOUND_SLACK_PER_ORDER ** (orders - 1);
}

/* ================================================================== *
 * From bounds to a search box
 * ================================================================== */

/** One inverted bound, with everything a reader needs to check it. */
export interface InvertedBound {
  /**
   * Which A5d.6 inversion produced it — or, for `'stated-series-r'` (V51b),
   * which STATED requirement was filed in the box in an inversion's shape: the
   * maximum total series resistance of the lowest way is a project figure and
   * inverts nothing, but it bounds the same sum `qes-series-r` bounds and is
   * filed the same way (coil DCR charged first, free resistors capped).
   */
  rule: 'qes-series-r' | 'bump-series-l' | 'gap-pad-r' | 'drive-series-c' | 'stated-series-r';
  /** The way it constrains. */
  subject: string;
  /** What is bounded, in words. */
  quantity: string;
  /** The ceiling, in SI units (Ω, H, F). */
  maxSI: number;
  unit: 'Ω' | 'H' | 'F';
  /** True for a topology-aware pre-bound: shaping only, the gate decides. */
  slack: boolean;
  /** Every measured input and every project budget that produced the number. */
  parameters: Record<string, number | string>;
  notes: string[];
}

/** The box a run hands the tuner: per-part ceilings plus per-path sum ceilings. */
export interface SearchBox {
  valueCeilings: Record<string, number>;
  valueSumCeilings: {
    ids: string[];
    maxSI: number;
    fixedSI: number;
    label: string;
    /* ---- V48: what this group needs to let its ceiling follow the tune ----
     *
     * All three are absent unless a tracker was handed in, and with them
     * absent the group is byte-identical to the one F2 has been filing since
     * the beginning: a static `maxSI` solved at the seed.
     *
     * THEY ARE NOT SERIALISABLE, and that is deliberate rather than
     * overlooked. `ceilingAt` is a closure over the measured near field and
     * sweep, the same shape `gateViolation` has carried since F2, and it never
     * crosses a `postMessage`: `InvertedBound` — which DOES travel in the
     * worker's response — stays pure data, and the trackers come back from
     * `invertBudgets` beside it rather than inside it. */
    /** Free series RESISTORS of this way, whose values are the moving part of
     *  its path resistance. */
    resistanceIds?: string[];
    /** The rest of that path resistance: locked resistors plus every coil's
     *  DCR, none of which a VALUE tune moves (`netOptimizer.ts`: "DCR/ESR
     *  params ride along unchanged"). Ohms. */
    pathRBaseOhm?: number;
    /** The inversion, as a function of the path resistance. */
    ceilingAt?: SeriesInductanceCeiling;
    /* ---- A5e.3: the seed's coil DCR, named so a DCR model can replace it ----
     *
     * `fixedSI` (the resistance rules) and `pathRBaseOhm` (the inductance rule)
     * both hold the DCR of the way's series coils AS STAMPED ON THE SEED. With
     * a DCR model that resistance moves with the inductance the tune is
     * choosing, so the group names its coils and what their DCR summed to; the
     * tuner subtracts the seed sum and adds the live one before projecting.
     * Without a model the tuner never reads them (P2). */
    coilIds?: string[];
    seedCoilDcrOhm?: number;
  }[];
  /** What was bounded and why — the report shows this, never a bare number. */
  bounds: InvertedBound[];
  notes: string[];
}

const PARAM_NAME: Record<'R' | 'L' | 'C', string> = { R: 'R', L: 'L', C: 'C' };
const SI_FACTOR: Record<'R' | 'L' | 'C', number> = { R: 1, L: H_PER_MH, C: F_PER_UF };

const kindOf = (p: VxpPart): 'R' | 'L' | 'C' | null =>
  p.type === 'Resistor' ? 'R' : p.type === 'Inductor' ? 'L' : p.type === 'Capacitor' ? 'C' : null;

const valueSI = (p: VxpPart): number | null => {
  const k = kindOf(p);
  if (!k) return null;
  const v = p.params.find((q) => q.name === PARAM_NAME[k])?.value;
  return typeof v === 'number' && v > 0 ? v * SI_FACTOR[k] : null;
};

/**
 * Turn a set of inverted bounds into the box the tuner searches in.
 *
 * The mapping from "this way may not exceed R Ω of series resistance" to
 * "these part ids" is the ONLY place topology enters, and it uses the app's
 * own bus walk (`busTopology`) rather than a second opinion about what
 * "series" means.
 *
 * TODO(A5e.3): the intersection here is with the app's existing bounds only.
 * A5d.6's closing line asks for "catalogus-spanwijdte ∩ meetafgeleide
 * budgetgrenzen", and the catalogue schema — families, parasitic models, the
 * rule that optimisation bounds follow the catalogue's span — is an open
 * specification decision (A5e.3). Filling it in here would be inventing that
 * decision, so the catalogue side of the intersection is deliberately absent.
 */
export function searchBoxFor(
  parts: readonly VxpPart[],
  bounds: readonly InvertedBound[],
  /* V48 — the path-resistance-tracking form of a bound, by subject. Absent for
   * every bound and every caller that does not hand one in, and then this
   * function builds exactly the box it always built. */
  trackers: Readonly<Record<string, SeriesInductanceCeiling>> = {},
): SearchBox {
  const bus = busTopology(parts);
  const valueCeilings: Record<string, number> = {};
  const valueSumCeilings: SearchBox['valueSumCeilings'] = [];
  const notes: string[] = [];

  /** Free (unlocked, present) parts of one kind on the series path of a way. */
  const seriesOf = (driver: string, kind: 'R' | 'L' | 'C'): VxpPart[] =>
    parts.filter(
      (p) =>
        kindOf(p) === kind &&
        p.partId !== undefined &&
        !p.open &&
        !p.shorted &&
        bus.driversOf(p.partId).includes(driver),
    );

  for (const b of bounds) {
    /* V51b — `'stated-series-r'` takes the `qes-series-r` shape verbatim: the
     * stated maximum is a bound on the way's TOTAL series resistance, so the
     * coils' DCR comes off the top and the free resistors share what is left.
     * A way with no free series resistor gets the note, and the worker's
     * delivered-network check (`levelWorkVerdict`) still judges the total. */
    if (b.rule === 'qes-series-r' || b.rule === 'gap-pad-r' || b.rule === 'stated-series-r') {
      const rs = seriesOf(b.subject, 'R');
      const coils = seriesOf(b.subject, 'L');
      // A coil's DCR is series resistance the driver sees just as surely as a
      // resistor is, and the tuner cannot move it independently — so it comes
      // off the top of the budget rather than being ignored.
      const fixedSI =
        coils.reduce((s, p) => s + (p.params.find((q) => q.name === 'DCR')?.value ?? 0), 0) +
        rs.filter((p) => p.locked).reduce((s, p) => s + (valueSI(p) ?? 0), 0);
      const free = rs.filter((p) => !p.locked).map((p) => p.partId!);
      if (free.length === 0) {
        notes.push(
          `${b.subject}: ${b.quantity} bounded at ${b.maxSI.toFixed(2)} Ω, but no free series ` +
            'resistor carries it — the bound is reported and the gate enforces it.',
        );
        continue;
      }
      const seedCoilDcrOhm = coils.reduce((s, p) => s + (p.params.find((q) => q.name === 'DCR')?.value ?? 0), 0);
      valueSumCeilings.push({
        ids: free,
        maxSI: b.maxSI,
        fixedSI,
        label: `${b.subject} ${b.quantity}`,
        coilIds: coils.map((p) => p.partId!),
        seedCoilDcrOhm,
      });
      // A single element can never exceed the total either — a necessary
      // condition, and the one a per-element box can express.
      for (const id of free) {
        const room = Math.max(b.maxSI - fixedSI, 0);
        valueCeilings[id] = Math.min(valueCeilings[id] ?? Infinity, room > 0 ? room : Number.MIN_VALUE);
      }
    } else if (b.rule === 'bump-series-l') {
      /* THE BOUND IS ON THE SUM, BECAUSE THE METRIC IS ON THE SUM.
       *
       * Until V42 this branch wrote only per-component ceilings, and the note
       * it pushed said so out loud: "the inversion is exact for one; with
       * several in series the total is what the metric sees". That was an
       * accurate description of a hole. `maxSeriesInductanceFromBump` solves
       * for the total series reactance the driver sees — `jωL` in one term —
       * so a chain split over two coils is bounded at 2 × maxSI by a
       * per-component box, and on casus 1 that is exactly what happened: seven
       * of eight V41 netlists carry two coils, up to 5.39 + 1.95 = 7.34 mH
       * against a 2.43 mH inversion, with 3.6-7.9 dB of measured lift.
       *
       * The repair is the shape `qes-series-r` has carried since F2 and it is
       * INPUT rather than formula: the same solved `maxSI`, filed as a sum over
       * the way's free series coils, with the LOCKED ones charged against the
       * budget first. A locked coil's inductance is series reactance the driver
       * sees just as surely as a free one, and the tuner cannot move it — so it
       * comes off the top rather than being ignored, exactly as a coil's DCR
       * does in the resistance branch above.
       *
       * The per-component ceiling STAYS beside it as the necessary condition:
       * no single coil can exceed what the whole chain may have. */
      const all = seriesOf(b.subject, 'L');
      const coils = all.filter((p) => !p.locked);
      const fixedSI = all
        .filter((p) => p.locked)
        .reduce((sum, p) => sum + (valueSI(p) ?? 0), 0);
      if (coils.length === 0) {
        notes.push(
          `${b.subject}: the LF-lift budget bounds the series inductance at ` +
            `${(b.maxSI / H_PER_MH).toFixed(2)} mH, but this way has no free series coil.`,
        );
      } else {
        /* V48 — WHAT THE GROUP CARRIES SO ITS CEILING CAN FOLLOW THE TUNE.
         *
         * The path resistance splits in two the same way the inductance
         * budget does one line up: the part the value tune MOVES (free series
         * resistors) and the part it cannot (locked resistors, and every
         * coil's DCR — a value tune changes neither). The moving part goes
         * over as IDS so the tuner reads its own current values; the rest goes
         * over as a number, resolved here from the seed.
         *
         * A missing id is safe in the direction that matters. If the tuner
         * does not hold one of these as free, its contribution is left out of
         * the sum, the path resistance reads LOW, and a low path resistance
         * yields a STRICTER ceiling — never a permissive one. */
        const seriesR = seriesOf(b.subject, 'R');
        const freeR = seriesR.filter((p) => !p.locked);
        const pathRBaseOhm =
          seriesR
            .filter((p) => p.locked)
            .reduce((sum, p) => sum + (valueSI(p) ?? 0), 0) +
          all.reduce((sum, p) => sum + (p.params.find((q) => q.name === 'DCR')?.value ?? 0), 0);
        const tracker = trackers[b.subject];
        const seedCoilDcrOhm = all.reduce((sum, p) => sum + (p.params.find((q) => q.name === 'DCR')?.value ?? 0), 0);
        valueSumCeilings.push({
          ids: coils.map((p) => p.partId!),
          maxSI: b.maxSI,
          fixedSI,
          label: `${b.subject} ${b.quantity}`,
          ...(tracker
            ? {
                resistanceIds: freeR.map((p) => p.partId!),
                pathRBaseOhm,
                ceilingAt: tracker,
                coilIds: all.map((p) => p.partId!),
                seedCoilDcrOhm,
              }
            : {}),
        });
        const room = Math.max(b.maxSI - fixedSI, 0);
        for (const p of coils) {
          valueCeilings[p.partId!] = Math.min(
            valueCeilings[p.partId!] ?? Infinity,
            room > 0 ? room : Number.MIN_VALUE,
          );
        }
        if (coils.length > 1) {
          notes.push(
            `${b.subject}: the LF-lift bound of ${(b.maxSI / H_PER_MH).toFixed(2)} mH is applied ` +
              `to the SUM of ${coils.length} free series coils, which is the quantity the metric ` +
              'sees. Each one is also capped at the total on its own — a necessary condition, not ' +
              'a second bound (V42).',
          );
        }
        if (fixedSI > 0) {
          notes.push(
            `${b.subject}: ${(fixedSI / H_PER_MH).toFixed(2)} mH of the LF-lift budget is already ` +
              'spent on locked series coils, which the tuner cannot move; the free coils share ' +
              `what is left (${(room / H_PER_MH).toFixed(2)} mH).`,
          );
        }
      }
    } else if (b.rule === 'drive-series-c') {
      /* A SLACK BOUND MAY NARROW THE SPACE AROUND THE DESIGN; IT MAY NEVER
       * DECLARE THE DESIGN ITSELF OUT OF BOUNDS.
       *
       * That rule is V12 turned into a mechanism. The casebook's
       * counterexample is a single-section series-C pre-bound of 5–10 µF
       * against a realised fourth-order midrange branch carrying 42 µF: the
       * inversion is exact for one section, the design has four, and the
       * widening factor per order is admittedly uncalibrated. Choosing a
       * larger factor would only move the collision; refusing to let a SLACK
       * bound exclude the seed removes the whole class of failure, and costs
       * nothing that matters — M-C is still the authority, and it judges the
       * f_s drive itself rather than a component value standing in for it.
       */
      const caps = seriesOf(b.subject, 'C').filter((p) => !p.locked);
      for (const p of caps) {
        const seed = valueSI(p) ?? 0;
        const applied = Math.max(b.maxSI, seed);
        if (applied > b.maxSI) {
          notes.push(
            `${b.subject}: the series-capacitance pre-bound (${(b.maxSI / F_PER_UF).toFixed(1)} µF) ` +
              `would have excluded this design's own ${(seed / F_PER_UF).toFixed(1)} µF. It carries ` +
              'SLACK, so it was widened to the design rather than applied — a pre-bound shapes ' +
              'the box and never condemns (A5d.6, casebook V12).',
          );
        }
        valueCeilings[p.partId!] = Math.min(valueCeilings[p.partId!] ?? Infinity, applied);
      }
      notes.push(
        `${b.subject}: the series-capacitance pre-bound carries SLACK (A5d.6) — it shapes the ` +
          'search box and decides nothing; M-C is the authority on the f_s drive.',
      );
    }
  }

  return { valueCeilings, valueSumCeilings, bounds: [...bounds], notes };
}

/* ================================================================== *
 * From project budgets to inverted bounds
 * ================================================================== */

/** Everything one way contributes to the inversions — all of it measured. */
export interface BudgetWay {
  driver: string;
  /** True for the lowest way, which is where A5d.6's first two bounds live. */
  lowest: boolean;
  /** True when this way's own branch is a high pass (see `isHighPassProtected`). */
  highPassProtected: boolean;
  /** R_e in ohms, plus where it came from — a measured R_e and a derived one
   *  are genuinely different numbers and V8d says why. */
  reOhm: number | null;
  reSource: string;
  /** Median |Z| over this way's passband, and the passband it was taken over. */
  zPassbandMedianOhm: number | null;
  passbandHz: [number, number] | null;
  /** f_s of this driver, from its loaded impedance file. */
  fsHz: number | null;
  /** The impedance peak M-D derives its band and reference from. */
  fPeakHz: number | null;
  /** This way's anchored attenuation budget (A5d.4), dB. Null for the anchor. */
  gapBudgetDb: number | null;
  /** Series resistance already in this way's path (DCR included), ohms. */
  pathROhm: number;
  /** The way's assumed acoustic order, for the topology-aware pre-bound. */
  order?: number;
  /**
   * V49 — the dB-mean of the way's branch transfer over its passband ON THE
   * NETWORK THE INVERSION IS SOLVED FOR (the seed, on the worker route; the
   * loaded filter, on the report). What turns an excursion ceiling stated re
   * the amplifier input into the passband-relative attenuation the series-C
   * pre-bound needs. Absent = the pre-bound can only read the stated figure.
   */
  passbandMeanDb?: number | null;
  /** The crossing above this way, when there is one. */
  crossingAboveHz?: number;
  nearField?: { grid: readonly number[]; db: readonly number[]; validHz: [number, number] };
  impedance?: { grid: readonly number[]; z: readonly Complex[] };
}

/**
 * Invert every ACTIVE budget into a bound.
 *
 * Absent budget = no bound, and that is the whole of P4 here: a project that
 * states nothing gets a search box identical to the app's own. A budget that
 * IS stated but cannot be inverted — no R_e, no near field, no measured
 * impedance — produces no bound either, and a note saying which input was
 * missing. Silence in either direction is what P4 forbids.
 */
export function invertBudgets(
  ways: readonly BudgetWay[],
  budgets: BudgetSettings,
  gates: { maxDriveOnFsDb?: number; driveCeilingDbByDriver?: Record<string, number> } = {},
): {
  bounds: InvertedBound[];
  notes: string[];
  /* V48 — the same `bump-series-l` inversion, per subject, as a FUNCTION of
   * the path resistance instead of a number solved at the seed's.
   *
   * BESIDE THE BOUNDS AND NOT INSIDE THEM. `InvertedBound` travels in the
   * worker's response and a closure cannot cross a `postMessage`; keeping the
   * bounds pure data is what lets both exist. A caller that only destructures
   * `{ bounds, notes }` — every caller before V48 — is unaffected. */
  ceilingTrackers: Record<string, SeriesInductanceCeiling>;
} {
  const bounds: InvertedBound[] = [];
  const notes: string[] = [];
  const ceilingTrackers: Record<string, SeriesInductanceCeiling> = {};

  for (const w of ways) {
    /* ---- Q_es budget -> max TOTAL series R in the lowest path ---------- */
    if (budgets.qesMultiplierMax !== undefined && w.lowest) {
      if (w.reOhm === null) {
        notes.push(
          `${w.driver}: the Q_es budget cannot be inverted without R_e. A4 lists R_e as a ` +
            'declared data need for exactly this reason; enter the measured DC resistance.',
        );
      } else {
        const max = maxSeriesResistanceFromQes(w.reOhm, budgets.qesMultiplierMax);
        if (max === null) {
          notes.push(
            `${w.driver}: a Q_es multiplication budget of ${budgets.qesMultiplierMax} allows no ` +
              'series resistance at all. That is a statement worth making deliberately rather ' +
              'than a bound of zero, so no bound was applied.',
          );
        } else {
          bounds.push({
            rule: 'qes-series-r',
            subject: w.driver,
            quantity: 'total series resistance',
            maxSI: max,
            unit: 'Ω',
            slack: false,
            parameters: {
              formula: 'R_s <= R_e * (q - 1)',
              R_e_ohm: w.reOhm,
              R_e_source: w.reSource,
              q_max: budgets.qesMultiplierMax,
            },
            notes: [],
          });
        }
      }
    }

    /* ---- LF-lift budget -> max series L at the path resistance --------- */
    if (budgets.lfBumpBudgetDb !== undefined && w.lowest) {
      if (!w.nearField || !w.impedance || w.fPeakHz === null) {
        notes.push(
          `${w.driver}: the LF-lift budget needs a near-field measurement, the loaded impedance ` +
            'sweep and the impedance peak M-D derives its band from. Missing one of the three, ' +
            'so no series-inductance bound was applied.',
        );
      } else {
        /* The inversion's measured inputs, WITHOUT the path resistance — which
         * is the one input V48 stopped treating as a constant. The one-shot
         * solve below fills in the seed's value; the tracker beside it leaves
         * the slot open so the tuner can fill in its own (V48). One input
         * object, two ways of asking the same inversion. */
        const bumpInput = {
          nfGrid: w.nearField.grid,
          nfDb: w.nearField.db,
          zGrid: w.impedance.grid,
          z: w.impedance.z,
          fPeakHz: w.fPeakHz,
          nfValidHz: w.nearField.validHz,
          ...(w.crossingAboveHz !== undefined ? { belowHz: w.crossingAboveHz } : {}),
        };
        const solved = maxSeriesInductanceFromBump(
          { ...bumpInput, pathROhm: w.pathROhm },
          budgets.lfBumpBudgetDb,
        );
        if (solved === null) {
          notes.push(
            `${w.driver}: M-D produced no lift figure on the measurements handed over, so the ` +
              'series-inductance bound could not be solved. Since V43 this can only be a DATA ' +
              'answer — the budget is on the resonant half, which is exactly zero without a ' +
              'coil, so it can never be spent before the search begins.',
          );
        } else {
          bounds.push({
            rule: 'bump-series-l',
            subject: w.driver,
            quantity: 'series inductance',
            maxSI: solved.maxHenry,
            unit: 'H',
            slack: false,
            parameters: {
              formula:
                'largest L with M-D RESONANT amplification <= budget (V43), solved on the ' +
                'measured Z peak and NF',
              budget_dB: budgets.lfBumpBudgetDb,
              path_R_ohm: w.pathROhm,
              f_peak_hz: w.fPeakHz,
              resonant_at_bound_dB: Number(solved.atBudgetDb.toFixed(3)),
              /* What the path's own resistance already lifts, reported beside
               * the bound because the search cannot spend it and cannot fix it.
               * It is the anchor's business (A5e.2), not this bound's. */
              resistive_lift_dB: Number(solved.resistiveLiftDb.toFixed(3)),
              band: 'A4 M-D, derived from f_p',
            },
            notes: [
              `${w.pathROhm.toFixed(2)} Ω of path resistance already lifts this band by ` +
                `${solved.resistiveLiftDb.toFixed(2)} dB before any coil exists. That half is ` +
                'not bounded here — it is level work, and A5e.2 owns it.',
            ],
          });
          /* V48 — and the same inversion as a function, for the run that wants
           * its ceiling to follow the tune. Built whenever the one-shot solve
           * succeeded, because the two rest on exactly the same inputs; whether
           * it is READ is a choice one layer along (`searchBoxFor`, and the
           * tuner's own `seriesInductanceCeilingSource`). */
          ceilingTrackers[w.driver] = seriesInductanceCeilingTracker(
            bumpInput,
            budgets.lfBumpBudgetDb,
          );
        }
      }
    }

    /* ---- Sensitivity gap + damping margin -> max pad resistance -------- */
    if (budgets.dampingMarginDb !== undefined) {
      if (w.gapBudgetDb === null) {
        // The anchor has no attenuation budget by definition — it is the level
        // everything else comes down to. Not a missing input.
        continue;
      }
      if (w.zPassbandMedianOhm === null) {
        notes.push(
          `${w.driver}: the damping bound needs this way's impedance level over its passband, ` +
            'and no measured impedance covers it.',
        );
        continue;
      }
      const budgetDb = w.gapBudgetDb + budgets.dampingMarginDb;
      const max = maxPadResistanceFromAttenuation(w.zPassbandMedianOhm, budgetDb);
      if (max !== null) {
        bounds.push({
          rule: 'gap-pad-r',
          subject: w.driver,
          quantity: 'total series (pad) resistance',
          maxSI: max,
          unit: 'Ω',
          slack: false,
          parameters: {
            formula: 'R_max = Z_passband * (10^(A/20) - 1)',
            Z_passband_median_ohm: Number(w.zPassbandMedianOhm.toFixed(4)),
            passband_hz: w.passbandHz ? `${w.passbandHz[0].toFixed(0)}-${w.passbandHz[1].toFixed(0)}` : 'unknown',
            anchored_gap_dB: w.gapBudgetDb,
            damping_margin_dB: budgets.dampingMarginDb,
            budget_dB: Number(budgetDb.toFixed(4)),
          },
          notes: [],
        });
      }
    }
  }

  /* ---- The topology-aware pre-bound (SLACK, gate is the authority) ----- *
   * V49 — the required attenuation is the STRICTER of the stated figure and
   * the excursion-derived ceiling, through the one rule the gate uses
   * (`effectiveDriveLimit`), so the box and the verdict cannot disagree. */
  if (gates.maxDriveOnFsDb !== undefined || Object.keys(gates.driveCeilingDbByDriver ?? {}).length > 0) {
    for (const w of ways) {
      if (!w.highPassProtected || w.fsHz === null || w.zPassbandMedianOhm === null) continue;
      const eff = effectiveDriveLimit(gates, w.driver, w.passbandMeanDb ?? undefined);
      if (!eff) continue;
      const required = -eff.limitDb;
      const max = preBoundSeriesCapacitance(
        w.zPassbandMedianOhm,
        w.fsHz,
        required,
        w.order ?? 1,
      );
      if (max === null) continue;
      bounds.push({
        rule: 'drive-series-c',
        subject: w.driver,
        quantity: 'series capacitance (pre-bound)',
        maxSI: max,
        unit: 'F',
        slack: true,
        parameters: {
          formula: 'single-section inversion of M-C, widened per order above the first',
          required_attenuation_dB: Number(required.toFixed(3)),
          limit_source: eff.source === 'stated' ? 'stated dB figure' : 'excursion-derived ceiling (V49)',
          ...(eff.statedDb !== undefined ? { stated_limit_dB: eff.statedDb } : {}),
          ...(eff.derivedDb !== undefined ? { derived_limit_dB: Number(eff.derivedDb.toFixed(3)) } : {}),
          Z_passband_median_ohm: Number(w.zPassbandMedianOhm.toFixed(4)),
          f_s_hz: Number(w.fsHz.toFixed(2)),
          order: w.order ?? 1,
          slack_per_order: PREBOUND_SLACK_PER_ORDER,
        },
        notes: [
          'SLACK. Exact for a single section only; every extra order takes a share of the ' +
            'attenuation and widens this. Shapes the search box and decides nothing — M-C is ' +
            'the authority (A5d.6, casebook V12).',
        ],
      });
    }
  }

  return { bounds, notes, ceilingTrackers };
}

/** Median |Z| over a band of a measured sweep — the pad inversion's reference. */
export function passbandImpedanceMedian(
  grid: readonly number[],
  magnitude: readonly number[],
  bandHz: [number, number],
): number | null {
  const v: number[] = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] >= bandHz[0] && grid[i] <= bandHz[1]) v.push(magnitude[i]);
  }
  if (v.length === 0) return null;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}
