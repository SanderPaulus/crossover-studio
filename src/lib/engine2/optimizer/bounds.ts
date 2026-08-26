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
import {
  BOUND_BRACKET_DOUBLINGS,
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
 * Returns null when even L = 0 already exceeds the budget — which is not a
 * failure of the solve but the answer: at that path resistance no inductor
 * satisfies the budget. V12 documents exactly that case (at R_s = 2 Ω the
 * 2.5 dB budget is unreachable with any L), and reporting it as "0 mH" would
 * hide a driver-and-damping problem behind a component limit.
 */
export function maxSeriesInductanceFromBump(
  input: BumpInversionInput,
  budgetDb: number,
): { maxHenry: number; atBudgetDb: number } | null {
  const bumpAt = (henry: number): number | null => {
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
  };

  const atZero = bumpAt(0);
  if (atZero === null) return null;
  if (atZero > budgetDb) return null;

  // Bracket: grow until the budget is exceeded, then bisect. The lift is
  // monotone in L for a series inductor into a measured load — more series
  // reactance at resonance is more lift — but the bracket is grown rather
  // than assumed so a non-monotone measurement produces a conservative answer
  // instead of a wrong one.
  let lo = 0;
  let hi = H_PER_MH; // 1 mH, a starting bracket in SI — not a limit.
  let guard = 0;
  while (guard++ < BOUND_BRACKET_DOUBLINGS) {
    const v = bumpAt(hi);
    if (v === null || v > budgetDb) break;
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < BOUND_INVERSION_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const v = bumpAt(mid);
    if (v !== null && v <= budgetDb) lo = mid;
    else hi = mid;
  }
  return { maxHenry: lo, atBudgetDb: bumpAt(lo) ?? budgetDb };
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
  /** Which A5d.6 inversion produced it. */
  rule: 'qes-series-r' | 'bump-series-l' | 'gap-pad-r' | 'drive-series-c';
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
  valueSumCeilings: { ids: string[]; maxSI: number; fixedSI: number; label: string }[];
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
    if (b.rule === 'qes-series-r' || b.rule === 'gap-pad-r') {
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
      valueSumCeilings.push({
        ids: free,
        maxSI: b.maxSI,
        fixedSI,
        label: `${b.subject} ${b.quantity}`,
      });
      // A single element can never exceed the total either — a necessary
      // condition, and the one a per-element box can express.
      for (const id of free) {
        const room = Math.max(b.maxSI - fixedSI, 0);
        valueCeilings[id] = Math.min(valueCeilings[id] ?? Infinity, room > 0 ? room : Number.MIN_VALUE);
      }
    } else if (b.rule === 'bump-series-l') {
      const coils = seriesOf(b.subject, 'L').filter((p) => !p.locked);
      for (const p of coils) valueCeilings[p.partId!] = Math.min(valueCeilings[p.partId!] ?? Infinity, b.maxSI);
      if (coils.length === 0) {
        notes.push(
          `${b.subject}: the LF-lift budget bounds the series inductance at ` +
            `${(b.maxSI / H_PER_MH).toFixed(2)} mH, but this way has no free series coil.`,
        );
      } else if (coils.length > 1) {
        notes.push(
          `${b.subject}: the LF-lift bound is applied to each of ${coils.length} series coils ` +
            'separately. The inversion is exact for one; with several in series the total is ' +
            'what the metric sees, and the gate remains the authority.',
        );
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
  gates: { maxDriveOnFsDb?: number } = {},
): { bounds: InvertedBound[]; notes: string[] } {
  const bounds: InvertedBound[] = [];
  const notes: string[] = [];

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
        const solved = maxSeriesInductanceFromBump(
          {
            nfGrid: w.nearField.grid,
            nfDb: w.nearField.db,
            zGrid: w.impedance.grid,
            z: w.impedance.z,
            fPeakHz: w.fPeakHz,
            nfValidHz: w.nearField.validHz,
            ...(w.crossingAboveHz !== undefined ? { belowHz: w.crossingAboveHz } : {}),
            pathROhm: w.pathROhm,
          },
          budgets.lfBumpBudgetDb,
        );
        if (solved === null) {
          notes.push(
            `${w.driver}: at ${w.pathROhm.toFixed(2)} Ω of path resistance the ${budgets.lfBumpBudgetDb} dB ` +
              'lift budget is already exceeded with no series inductor at all. No inductance ' +
              'satisfies it — that is a damping and driver question, not a component limit ' +
              '(casebook V12).',
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
              formula: 'largest L with M-D lift <= budget, solved on the measured Z peak and NF',
              budget_dB: budgets.lfBumpBudgetDb,
              path_R_ohm: w.pathROhm,
              f_peak_hz: w.fPeakHz,
              lift_at_bound_dB: Number(solved.atBudgetDb.toFixed(3)),
              band: 'A4 M-D, derived from f_p',
            },
            notes: [],
          });
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

  /* ---- The topology-aware pre-bound (SLACK, gate is the authority) ----- */
  if (gates.maxDriveOnFsDb !== undefined) {
    for (const w of ways) {
      if (!w.highPassProtected || w.fsHz === null || w.zPassbandMedianOhm === null) continue;
      const required = -gates.maxDriveOnFsDb;
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
          required_attenuation_dB: required,
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

  return { bounds, notes };
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
