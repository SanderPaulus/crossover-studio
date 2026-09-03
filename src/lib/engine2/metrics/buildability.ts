/**
 * V50 — BUILDABILITY: the power in each resistor and the current through each
 * coil, as quantities a gate can compare with what a purchasable part is rated
 * for.
 *
 * TWO QUANTITIES, BOTH ALREADY IN THE SOLUTION. M-A (`electrical.ts`) has
 * integrated the IEC-weighted power per resistor since F1 and printed the watts
 * beside it since V36; nothing here recomputes that integral — this module
 * READS `DissipationResult.elements` and adds the one thing M-A never had: a
 * per-element ALLOWANCE to hold each figure against. The coil current is new
 * as a metric and it is deliberately NOT an IEC-weighted figure: a coil's
 * saturation is a PEAK phenomenon — one cycle at the amplifier's peak input
 * voltage is enough to drive a core into saturation — so it is read as the
 * largest |I_L(f)|·V_peak/E_g over the electrical grid, at the frequency where
 * it is largest. The two are different physics and they get different
 * integrals (thermal = mean, weighted; saturation = peak, unweighted).
 *
 * WHAT THE ALLOWANCE IS, and where it comes from (P4, P6):
 *
 *   · resistor: the rating of the CHOSEN catalogue part when the snap put one
 *     on the element and the catalogue carries a rating for it, otherwise the
 *     STATED resistor class of the project (W, continuous) — times the STATED
 *     margin fraction. No class and no rating: nothing to judge on, and the
 *     gate says so. No margin: likewise — a resistor in a closed cabinet with
 *     no airflow runs hot at half its rating, and that fraction is a project
 *     decision rather than a number this module owns;
 *   · coil: the saturation / maximum current of the chosen catalogue part, or
 *     the stated coil class (A). An air-cored coil has no saturation current
 *     at all (only a thermal limit, out of scope), and a catalogue that carries
 *     no figure for a part contributes nothing — the gate then judges on the
 *     stated class or on nothing, and names which.
 *
 * NO SPLITTING. When a resistor exceeds its allowance the only remedies are a
 * bigger class or a series/parallel bank — a TOPOLOGY choice the generator
 * does not make (casebook V50). The verdict names the element and the watts;
 * it does not design the bank.
 *
 * Pure functions, no I/O, no catalogue access: what a part is rated for
 * arrives as data (`PartRatings`), resolved by the caller that holds the parts
 * and the catalogue (`optimizer/partRatings.ts`).
 */

import { cabs } from '../util.ts';
import type { DissipationResult } from './electrical.ts';
import type { NetworkAnalysis } from './types.ts';

export const BUILDABILITY_VERSION = 'buildability/1.0';

/** What the CHOSEN part on one element is rated for, keyed by element id. */
export interface PartRating {
  /** Continuous power rating, W (resistors). */
  powerW?: number;
  /** Saturation / maximum current, A (cored coils). */
  maxCurrentA?: number;
  /** Where the rating came from — the SKU, or the class the project stated. */
  source: string;
}
export type PartRatings = Readonly<Record<string, PartRating>>;

/* ================================================================== *
 * Resistor power against an allowance
 * ================================================================== */

export interface ResistorLoad {
  id: string;
  ohm: number;
  /** Share of the amplifier's delivered power (M-A's own number). */
  fraction: number;
  /** Watts at the stated continuous power; null when no power was stated. */
  watts: number | null;
  /** What this element may dissipate, W — rating × margin; null when unknown. */
  allowedW: number | null;
  /** The rating the allowance was made from, and where it came from. */
  ratingW: number | null;
  ratingSource: string | null;
}

export interface ResistorLoadInput {
  /** The stated continuous amplifier power, W. Absent = no watts (F0). */
  continuousPowerW?: number;
  /** The stated resistor class, W continuous. Absent = only catalogue ratings. */
  resistorClassW?: number;
  /** The stated fraction of a rating a resistor may run at. Absent = no allowance. */
  marginFraction?: number;
  /** Per-element ratings of the chosen catalogue parts. */
  ratings?: PartRatings;
}

/**
 * The discrete resistors of a solved network with their watts and allowance.
 *
 * Parasitics (coil DCR, cap ESR) are NOT resistors anyone buys a rating for,
 * so they are left out here exactly as M-A leaves them out of its total.
 */
export function resistorLoads(diss: DissipationResult, i: ResistorLoadInput): ResistorLoad[] {
  const out: ResistorLoad[] = [];
  const power = i.continuousPowerW !== undefined && i.continuousPowerW > 0 ? i.continuousPowerW : null;
  const margin = i.marginFraction !== undefined && i.marginFraction > 0 ? i.marginFraction : null;
  for (const e of diss.elements) {
    if (e.parasitic) continue;
    const r = i.ratings?.[e.id];
    const ratingW = r?.powerW !== undefined && r.powerW > 0 ? r.powerW
      : i.resistorClassW !== undefined && i.resistorClassW > 0 ? i.resistorClassW
        : null;
    const ratingSource =
      r?.powerW !== undefined && r.powerW > 0
        ? r.source
        : ratingW !== null
          ? 'stated resistor class'
          : null;
    out.push({
      id: e.id,
      ohm: e.ohm,
      fraction: e.fraction,
      watts: power === null ? null : e.fraction * power,
      allowedW: ratingW !== null && margin !== null ? ratingW * margin : null,
      ratingW,
      ratingSource,
    });
  }
  return out;
}

/**
 * The resistor a gate judges: the one with the LEAST headroom against its own
 * allowance, or — when nothing carries an allowance — simply the hottest one,
 * so that an unarmed gate still reports the figure a builder acts on.
 */
export function worstResistor(loads: readonly ResistorLoad[]): ResistorLoad | null {
  let worst: ResistorLoad | null = null;
  let worstKey = -Infinity;
  for (const l of loads) {
    if (l.watts === null) continue;
    const key = l.allowedW !== null && l.allowedW > 0 ? l.watts / l.allowedW : l.watts;
    // An element WITH an allowance always outranks one without: a ratio is a
    // verdict, a bare wattage only a reading.
    const tier = l.allowedW !== null ? 1 : 0;
    const worstTier = worst && worst.allowedW !== null ? 1 : 0;
    if (worst === null || tier > worstTier || (tier === worstTier && key > worstKey)) {
      worst = l;
      worstKey = key;
    }
  }
  return worst;
}

/* ================================================================== *
 * Coil peak current against an allowance
 * ================================================================== */

export interface CoilLoad {
  id: string;
  henry: number;
  /** Largest current amplitude through this coil at the peak input, A. */
  peakA: number | null;
  /** Where on the electrical grid that maximum sits, Hz. */
  atHz: number | null;
  /** What the chosen or stated part may carry, A; null when unknown. */
  allowedA: number | null;
  ratingSource: string | null;
}

export interface CoilLoadInput {
  /** √2·√(P_peak·R_nom), V — derived once by the caller (`peakInputVolts`). */
  peakInputVolts?: number;
  /** The stated coil class, A. Absent = only catalogue ratings. */
  coilClassA?: number;
  ratings?: PartRatings;
}

/**
 * Every coil of a solved network with its peak current at the peak input.
 *
 * Read off `elementCurrent`, which the solver produced at the netlist's own
 * generator EMF; the current scales linearly with the input, so the amplitude
 * at V_peak is |I(f)|·V_peak/E_g. The frequency is reported because a
 * saturation figure without the frequency it occurs at cannot be checked
 * against a datasheet that gives its rating at one.
 */
export function coilLoads(analysis: NetworkAnalysis, i: CoilLoadInput): CoilLoad[] {
  const { grid, generatorVolts: eg } = analysis;
  const vPeak = i.peakInputVolts !== undefined && i.peakInputVolts > 0 ? i.peakInputVolts : null;
  const out: CoilLoad[] = [];
  for (const p of analysis.passives) {
    if (p.kind !== 'L') continue;
    const cur = analysis.elementCurrent[p.id];
    let peakA: number | null = null;
    let atHz: number | null = null;
    if (vPeak !== null && cur && eg > 0) {
      let best = -1;
      let bestIdx = -1;
      for (let k = 0; k < cur.length; k++) {
        const a = cabs(cur[k]);
        if (a > best) {
          best = a;
          bestIdx = k;
        }
      }
      if (bestIdx >= 0) {
        peakA = (best / eg) * vPeak;
        atHz = grid[bestIdx];
      }
    }
    const r = i.ratings?.[p.id];
    const allowedA =
      r?.maxCurrentA !== undefined && r.maxCurrentA > 0
        ? r.maxCurrentA
        : i.coilClassA !== undefined && i.coilClassA > 0
          ? i.coilClassA
          : null;
    const ratingSource =
      r?.maxCurrentA !== undefined && r.maxCurrentA > 0
        ? r.source
        : allowedA !== null
          ? 'stated coil class'
          : null;
    out.push({ id: p.id, henry: p.value, peakA, atHz, allowedA, ratingSource });
  }
  return out;
}

/** The coil a gate judges — least headroom, or the highest current when nothing is rated. */
export function worstCoil(loads: readonly CoilLoad[]): CoilLoad | null {
  let worst: CoilLoad | null = null;
  let worstKey = -Infinity;
  for (const l of loads) {
    if (l.peakA === null) continue;
    const key = l.allowedA !== null && l.allowedA > 0 ? l.peakA / l.allowedA : l.peakA;
    const tier = l.allowedA !== null ? 1 : 0;
    const worstTier = worst && worst.allowedA !== null ? 1 : 0;
    if (worst === null || tier > worstTier || (tier === worstTier && key > worstKey)) {
      worst = l;
      worstKey = key;
    }
  }
  return worst;
}
