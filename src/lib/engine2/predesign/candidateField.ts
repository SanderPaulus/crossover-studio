/**
 * F4d — THE ASSEMBLY, from what the app holds to a field of candidates.
 *
 * `flankOrder.ts` derives an order, `candidates.ts` lays positions across a
 * window, and this module is the one place that puts the two together and
 * decides what each of them is fed. It lives here rather than in `App.tsx` for
 * the reason every pure block in this engine does: a decision taken inside a
 * React component is a decision no test can reach without a browser.
 *
 * THE ONE ARITHMETIC DECISION IT TAKES, and it is a chicken-and-egg the spec
 * does not spell out: A5d.3's order demands are measured AGAINST A CROSSING
 * (how many octaves from the resonance up to the handover, how many from the
 * handover up to the breakup), while the positions a crossing may take are
 * carved out of a window whose floor depends on the ORDER. Something has to go
 * first.
 *
 * What goes first is a REFERENCE CROSSING: the geometric centre of the window
 * as derived at whatever order the designer stated — or with no f_s floor at
 * all when they stated none. That is not a new convention; `report.ts` already
 * uses the window centre as the handover a pre-design analysis assumes, for the
 * same reason (A5d.4's levels are averaged between them). The demands are read
 * there, once, and the positions are then laid out per order in the window that
 * order implies. Every candidate says which reference crossing its order came
 * from, because an order derived at 470 Hz and applied at 550 Hz is a different
 * claim from one derived where it is used.
 *
 * N-WAY: one entry per adjacent pair in, the product out. Nothing counts.
 */

import { crossoverWindow, type XoWindowInput } from './xoWindow.ts';
import {
  naturalSlopeDbPerOctave,
  pairOrders,
  type FlankOrderInput,
  type PairOrderResult,
} from './flankOrder.ts';
import {
  generateCandidates,
  type Alignment,
  type AlignmentPolicy,
  type CandidateField,
  type CandidatePairInput,
  type PositionPolicy,
} from './candidates.ts';
import { statedCandidates, statedOverlapNotes } from './statedCrossings.ts';
import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';

/** A measured branch response, as the slope fit wants it. */
export interface BranchCurve {
  freq: readonly number[];
  db: readonly number[];
}

/** What the app knows about one adjacent pair, beyond its window inputs. */
export interface PairDerivationInput {
  /** The order the designer stated for this handover, when they stated one. */
  statedOrder?: number | null;
  /** M-C's stated limit, dB. Absent = the rule is not armed (P4). */
  maxDriveOnFsDb?: number | null;
  /** The suppression the project asks for on the breakup, dB. Absent = not armed. */
  breakupSuppressionDb?: number | null;
  /** Acoustic slope targets per flank, dB/oct. Absent = not armed. */
  lowerTargetSlopeDbPerOct?: number | null;
  upperTargetSlopeDbPerOct?: number | null;
  /** The two bare measured responses, for the natural-slope fit of A5d.3(i). */
  lowerCurve?: BranchCurve | null;
  upperCurve?: BranchCurve | null;
}

export interface CandidateFieldRequest {
  /** One per adjacent pair, low to high — `report.predesign.windowInputs`. */
  windowInputs: readonly XoWindowInput[];
  /** Same length and order as `windowInputs`. */
  perPair: readonly PairDerivationInput[];
  /** The alignments the design step can build. */
  alignments: readonly Alignment[];
  /** How many chains the designer is paying for. Absent = no bound. */
  chainBudget?: number;
  /** Finest spacing on one axis, octaves. Absent = the acceptance smoothing. */
  minSpacingOctaves?: number;
  /** E-2 — how positions are laid (`candidates.ts`). Absent = spread, the field it always was. */
  positionPolicy?: PositionPolicy;
  /** E-2 — how many alignments per handover. Absent = every admitted order. */
  alignmentPolicy?: AlignmentPolicy;
  /**
   * U-5 — THE CROSSINGS THE DESIGNER STATED, one list per adjacent pair, in the
   * same order and of the same length as `windowInputs`.
   *
   * Absent, empty, or short of one axis and the field is exactly the derived
   * one, candidate for candidate and byte for byte (P2): every recorded run
   * fingerprint still reproduces, and nothing about the generated field moves.
   * With a value on every axis the product of those values is APPENDED to the
   * generated candidates — appended, so the generated field is unchanged and
   * the stated positions sit beside it rather than in place of it.
   */
  statedPerAxisHz?: readonly (readonly number[])[];
  /** U-5 — when the designer stated them; the attribution every stated candidate carries. */
  statedOn?: string;
}

export interface CandidateFieldResult {
  field: CandidateField;
  /** The order derivation per pair, in the same order — for the panel. */
  orders: PairOrderResult[];
  /** The reference crossing each derivation was read at, Hz. */
  referenceCrossingHz: (number | null)[];
  notes: string[];
}

/**
 * The window centre a pre-design analysis assumes for a pair, at a given order.
 *
 * Null when no window could be derived, which is a state and not a zero.
 */
function referenceCrossing(wi: XoWindowInput, order: number): number | null {
  const w = crossoverWindow({ ...wi, order });
  if (w.empty || w.floorHz === null || w.ceilingHz === null) return null;
  if (!(w.ceilingHz > w.floorHz)) return null;
  return Math.sqrt(w.floorHz * w.ceilingHz);
}

export function buildCandidateField(req: CandidateFieldRequest): CandidateFieldResult {
  const available = [...new Set(req.alignments.map((a) => a.order))].sort((a, b) => a - b);
  const notes: string[] = [];
  const orders: PairOrderResult[] = [];
  const referenceCrossingHz: (number | null)[] = [];
  const pairs: CandidatePairInput[] = [];

  for (let i = 0; i < req.windowInputs.length; i++) {
    const wi = req.windowInputs[i];
    const p = req.perPair[i] ?? {};
    const label = `${wi.lower}→${wi.upper}`;
    /* The reference crossing, at the designer's order when they stated one.
     * `NaN` is what `crossoverWindow` already treats as "no order stated" — it
     * simply contributes no f_s floor — so it is passed through rather than
     * replaced by a number nobody chose. */
    const ref = referenceCrossing(wi, p.statedOrder ?? NaN);
    referenceCrossingHz.push(ref);
    if (ref === null) {
      orders.push({
        pairLabel: label,
        flanks: [
          { pairLabel: label, side: 'lower-lp', driver: wi.lower, demands: [], demandedOrder: null, binding: null, notes: [] },
          { pairLabel: label, side: 'upper-hp', driver: wi.upper, demands: [], demandedOrder: null, binding: null, notes: [] },
        ],
        orders: [],
        why: [],
        notes: [
          `${label}: no window could be derived, so there is no reference crossing to measure an ` +
            'order demand against and no band to place a candidate in. That is a statement about ' +
            'the measurements, not about the drivers (P4).',
        ],
      });
      continue;
    }

    const significant = wi.significantBreakupDb;
    const firstBreakup =
      [...wi.lowerBreakups]
        .filter((b) => significant === undefined || b.dB >= significant)
        .sort((a, b) => a.fHz - b.fHz)[0] ?? null;

    const foi: FlankOrderInput = {
      pairLabel: label,
      lower: wi.lower,
      upper: wi.upper,
      crossingHz: ref,
      upperFsHz: wi.upperFsHz,
      maxDriveOnFsDb: p.maxDriveOnFsDb ?? null,
      lowerBreakup: firstBreakup,
      breakupSuppressionDb: p.breakupSuppressionDb ?? null,
      lowerTargetSlopeDbPerOct: p.lowerTargetSlopeDbPerOct ?? null,
      upperTargetSlopeDbPerOct: p.upperTargetSlopeDbPerOct ?? null,
      lowerNaturalSlopeDbPerOct: p.lowerCurve
        ? naturalSlopeDbPerOctave(p.lowerCurve.freq, p.lowerCurve.db, ref, 'above')
        : null,
      upperNaturalSlopeDbPerOct: p.upperCurve
        ? naturalSlopeDbPerOctave(p.upperCurve.freq, p.upperCurve.db, ref, 'below')
        : null,
      availableOrders: available,
      statedOrder: p.statedOrder ?? null,
    };
    const po = pairOrders(foi);
    po.notes.push(
      `The order demands for ${label} were read at ${ref.toFixed(0)} Hz — the geometric centre of ` +
        'the feasible window, which is the handover a pre-design analysis assumes before one has ' +
        'been chosen (the same convention A5d.4 averages its levels between). A candidate placed ' +
        'elsewhere in the window carries an order derived at this frequency, and that is stated ' +
        'rather than hidden.',
    );
    orders.push(po);
    pairs.push({ windowInput: wi, orders: po, statedOrder: p.statedOrder ?? null });
  }

  const field = generateCandidates(pairs, {
    alignments: req.alignments,
    ...(req.chainBudget !== undefined ? { chainBudget: req.chainBudget } : {}),
    ...(req.minSpacingOctaves !== undefined ? { minSpacingOctaves: req.minSpacingOctaves } : {}),
    ...(req.positionPolicy !== undefined ? { positionPolicy: req.positionPolicy } : {}),
    ...(req.alignmentPolicy !== undefined ? { alignmentPolicy: req.alignmentPolicy } : {}),
  });

  /* U-5 — THE STATED HALF, APPENDED.
   *
   * The budget is deliberately not applied to it: the chain budget thins
   * POSITIONS the derivation offered, and a stated position was not offered by
   * anything — it was asked for. Thinning one would answer a question the
   * designer asked to have answered, which is the same argument rule 2 of
   * `candidates.ts` makes about never thinning ORDERS. What the designer pays
   * for it is one chain each, and the note below says how many.
   *
   * The stated candidates run on the same `pairs`, so their windows, their
   * order derivations and their alignments are the generated field's. */
  const statedIn = req.statedPerAxisHz;
  const stated =
    statedIn && statedIn.length === pairs.length && pairs.length > 0 && statedIn.every((a) => a.length > 0)
      ? statedCandidates(pairs, statedIn, {
          alignments: req.alignments,
          ...(req.alignmentPolicy !== undefined ? { alignmentPolicy: req.alignmentPolicy } : {}),
          spacingOctaves: req.minSpacingOctaves ?? WINDOW_SMOOTHING_OCTAVES,
          statedOn: req.statedOn ?? 'date not recorded',
        })
      : null;
  const merged: CandidateField =
    stated && stated.candidates.length > 0
      ? {
          ...field,
          candidates: [...field.candidates, ...stated.candidates],
          refusals: [...field.refusals, ...stated.refusals],
          notes: [
            ...field.notes,
            ...stated.notes,
            ...statedOverlapNotes(stated.candidates, field.candidates),
          ],
          parameters: { ...field.parameters, statedSize: stated.candidates.length },
        }
      : field;

  return {
    field: merged,
    orders,
    referenceCrossingHz,
    notes: [...notes, ...merged.notes, ...(stated && stated.candidates.length === 0 ? stated.refusals : [])],
  };
}

/**
 * A stable serialisation of the field, for the run fingerprint.
 *
 * Everything that would make two runs search different ground: the handovers,
 * the cages, the orders and alignments, the generator's parameters and what it
 * had to thin. Deliberately NOT the provenance sentences — those describe the
 * same decision in words, and a wording change is not a different run.
 */
export function candidateFieldKey(field: CandidateField): unknown {
  return {
    parameters: field.parameters,
    candidates: field.candidates.map((c) => ({
      label: c.label,
      crossings: c.crossings.map((x) => ({
        pair: x.pairLabel,
        hz: x.hz,
        cage: x.cageHz,
        order: x.order,
        alignment: `${x.alignment.kind}${x.alignment.order}`,
        window: x.windowHz,
      })),
    })),
    refusals: field.refusals.length,
  };
}
