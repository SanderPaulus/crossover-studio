/**
 * A5d.3 — FEASIBLE CROSSOVER WINDOWS.
 *
 * Per adjacent driver pair, the intersection of every limit the measurements
 * imply, with the SOURCE of each limit and which one binds. Three properties
 * make it worth building rather than eyeballing:
 *
 *  - Every limit is attributed. A window you cannot attribute is a window you
 *    cannot act on, and the app has already paid for that once: an earlier
 *    derivation silently discarded the whole window whenever two limits
 *    disagreed and seeded candidates straight through a cone breakup.
 *  - An EMPTY window is an answer. It means the drivers or the layout cannot
 *    hand over anywhere, and knowing that before a single component is chosen
 *    is the point of a pre-design pass.
 *  - Conflicting PREFERENCE zones are shown rather than resolved. Casus 1's
 *    upper pair has its favourable lobing zone sitting ABOVE its breakup
 *    ceiling; that conflict is the real design tension of the driver
 *    combination and averaging it away would hide it.
 *
 * This module is REPORTING. It hands nothing to an optimiser (that coupling is
 * F2+ and explicitly out of scope for F1).
 */

import {
  BREAKUP_DIV_MILD,
  BREAKUP_DIV_SEVERE,
  MM_PER_M,
  SPEED_OF_SOUND_M_S,
  XO_FS_FACTOR_BY_ORDER,
} from '../constants.ts';
import { breakupDivisor } from '../metrics/acoustic.ts';

/**
 * How tall a ripple has to be, in dB above the local trend, before it counts
 * as a breakup that constrains a crossover rather than as ordinary response
 * ripple.
 *
 * A JUDGEMENT THRESHOLD, and one of the few numbers here that is not derived.
 * It is exposed as a parameter for that reason. The default separates the
 * peaks the casus-1 analysis treated as design constraints (+2.9 dB and up)
 * from the ripple it did not (+1.8 dB and below); like the severity weighting
 * itself, it wants harmonic-distortion data to become more than a convention.
 */
export const DEFAULT_SIGNIFICANT_BREAKUP_DB = 2.5;

/** One limit, with where it came from. */
export interface XoLimit {
  side: 'floor' | 'ceiling';
  hz: number;
  /** Short machine-readable tag, for tests and for the UI to group on. */
  rule: 'validity' | 'fs' | 'breakup' | 'directivity';
  /** Human sentence — always shown next to the number. */
  source: string;
  /** Set when this limit carries an uncalibrated component. */
  uncalibrated?: string;
}

/** A preference zone inside (or outside) the window. */
export interface XoZone {
  label: string;
  hz: [number, number];
  /** 'good' or 'bad' — preference, never a limit. */
  kind: 'good' | 'bad';
  /** True when the zone lies wholly outside the feasible window. */
  outsideWindow: boolean;
}

export interface XoWindowResult {
  lower: string;
  upper: string;
  order: number;
  floorHz: number | null;
  ceilingHz: number | null;
  floorBy: XoLimit | null;
  ceilingBy: XoLimit | null;
  limits: XoLimit[];
  zones: XoZone[];
  /**
   * Resonance of the UPPER driver, carried through from the input.
   *
   * A PASS-THROUGH and nothing else: no limit, no zone and no tension is
   * computed from this field that was not already computed from the same
   * number above. It is here because the composition in `recommendedBand.ts`
   * states its edge reasons in OCTAVES ABOVE f_s, and the alternative was to
   * invert the fs floor (`k * f_s`) back through `XO_FS_FACTOR_BY_ORDER` —
   * re-deriving an input from an output, which is exactly the kind of quiet
   * second derivation this module exists to avoid.
   */
  upperFsHz: number | null;
  /**
   * The centre-to-centre spacing the ZONES were derived from, and where it
   * came from. Pass-throughs, on the same footing as `upperFsHz`.
   *
   * A zone range on its own is unattributable, and an unattributable zone is
   * one a reader cannot check: the same pair of drivers at 382 mm and at
   * 261 mm produces worst-lobing zones an octave apart, and nothing in
   * "657–920 Hz" says which layout it belongs to.
   */
  spacingMm: number | null;
  spacingSource: string | null;
  /** True when the limits leave no room at all. */
  empty: boolean;
  /** The tensions worth showing: conflicting zones, edge-of-window findings. */
  tensions: string[];
}

export interface XoWindowInput {
  lower: string;
  upper: string;
  /** Assumed acoustic order of the flanks; A5d.3's k depends on it. */
  order: number;
  /** Lowest frequency both measurements may be believed at. */
  validityFloorHz: number | null;
  /** Which measurement set that floor. */
  validityFloorSource: string;
  /** Resonance of the UPPER driver, from its impedance sweep. */
  upperFsHz: number | null;
  /** Breakups of the LOWER driver, ascending, with their height over trend. */
  lowerBreakups: readonly { fHz: number; dB: number }[];
  /** -6 dB@theta point of the LOWER driver, when it was measured off axis. */
  lowerMinus6Hz: number | null;
  lowerMinus6AngleDeg: number | null;
  /** Centre-to-centre spacing of the pair, mm. */
  spacingMm: number | null;
  /** Where that spacing came from — attribution, exactly as every limit has. */
  spacingSource?: string;
  /** Significance threshold for a breakup; see the constant above. */
  significantBreakupDb?: number;
}

/**
 * Lobing preference zones, as multiples of c/d.
 *
 * The two contradictory field rules again (A4 M-F): wide and safe while the
 * spacing is well under half a wavelength, worst around 0.5-0.7, and
 * favourable again around one to one-and-a-half wavelengths. Dimensionless
 * multipliers on c/d, so the zone frequencies move with the layout.
 */
const LOBING_WIDE_UPPER = 0.45;
const LOBING_WORST_LOW = 0.5;
const LOBING_WORST_HIGH = 0.7;
const LOBING_SECOND_GOOD_LOW = 1.0;
const LOBING_SECOND_GOOD_HIGH = 1.4;

export function crossoverWindow(input: XoWindowInput): XoWindowResult {
  const significant = input.significantBreakupDb ?? DEFAULT_SIGNIFICANT_BREAKUP_DB;
  const limits: XoLimit[] = [];

  if (input.validityFloorHz !== null) {
    limits.push({
      side: 'floor',
      hz: input.validityFloorHz,
      rule: 'validity',
      source: `measurement validity (${input.validityFloorSource})`,
    });
  }

  const k = XO_FS_FACTOR_BY_ORDER[input.order];
  if (input.upperFsHz !== null && k !== undefined) {
    limits.push({
      side: 'floor',
      hz: k * input.upperFsHz,
      rule: 'fs',
      source:
        `${k}x f_s of ${input.upper} (${input.upperFsHz.toFixed(0)} Hz) at order ${input.order} - ` +
        'a steeper flank may sit closer to the resonance',
    });
  }

  // The FIRST SIGNIFICANT breakup, not the tallest and not the first ripple.
  // "First" because a crossing has to clear the lowest resonance that matters;
  // "significant" because every response has ripple and a ceiling derived from
  // 1 dB of it would forbid designs for no physical reason.
  const first = input.lowerBreakups.filter((b) => b.dB >= significant).sort((a, b) => a.fHz - b.fHz)[0];
  if (first) {
    const div = breakupDivisor(first.dB);
    limits.push({
      side: 'ceiling',
      hz: first.fHz / div,
      rule: 'breakup',
      source:
        `first significant breakup of ${input.lower} at ${first.fHz.toFixed(0)} Hz ` +
        `(+${first.dB.toFixed(1)} dB) divided by ${div.toFixed(2)}`,
      uncalibrated:
        `The divisor interpolates between the published endpoints (${BREAKUP_DIV_SEVERE} severe, ` +
        `${BREAKUP_DIV_MILD} mild); the ramp between them is uncalibrated and needs HD data ` +
        '(spec V6/V9). This ceiling moves if that curve does.',
    });
  }

  if (input.lowerMinus6Hz !== null) {
    limits.push({
      side: 'ceiling',
      hz: input.lowerMinus6Hz,
      rule: 'directivity',
      source:
        `-6 dB at ${input.lowerMinus6AngleDeg ?? '?'} deg of ${input.lower} ` +
        `(${input.lowerMinus6Hz.toFixed(0)} Hz)`,
    });
  }

  const floors = limits.filter((l) => l.side === 'floor');
  const ceilings = limits.filter((l) => l.side === 'ceiling');
  const floorBy = floors.length ? floors.reduce((a, b) => (b.hz > a.hz ? b : a)) : null;
  const ceilingBy = ceilings.length ? ceilings.reduce((a, b) => (b.hz < a.hz ? b : a)) : null;
  const floorHz = floorBy?.hz ?? null;
  const ceilingHz = ceilingBy?.hz ?? null;

  const zones: XoZone[] = [];
  const tensions: string[] = [];
  if (input.spacingMm !== null && input.spacingMm > 0) {
    const cOverD = SPEED_OF_SOUND_M_S / (input.spacingMm / MM_PER_M);
    const outside = (z: [number, number]): boolean =>
      floorHz !== null && ceilingHz !== null ? z[1] < floorHz || z[0] > ceilingHz : false;
    const add = (label: string, hz: [number, number], kind: 'good' | 'bad') =>
      zones.push({ label, hz, kind, outsideWindow: outside(hz) });
    add('wide frontal radiation (spacing well under half a wavelength)', [0, LOBING_WIDE_UPPER * cOverD], 'good');
    add('the WORST lobing zone', [LOBING_WORST_LOW * cOverD, LOBING_WORST_HIGH * cOverD], 'bad');
    add(
      'second favourable zone (about one wavelength)',
      [LOBING_SECOND_GOOD_LOW * cOverD, LOBING_SECOND_GOOD_HIGH * cOverD],
      'good',
    );

    const good = zones.find((z) => z.kind === 'good' && z.hz[0] > 0);
    if (good && ceilingHz !== null && good.hz[0] > ceilingHz) {
      tensions.push(
        `The favourable lobing zone (${good.hz[0].toFixed(0)}-${good.hz[1].toFixed(0)} Hz) lies ` +
          `entirely ABOVE the ceiling (${ceilingHz.toFixed(0)} Hz, ${ceilingBy?.rule}). Lobing and ` +
          'the ceiling want opposite things here - that is a real tension of this driver ' +
          'combination, not something the filter can resolve.',
      );
    }
    const bad = zones.find((z) => z.kind === 'bad');
    if (bad && floorHz !== null && ceilingHz !== null && bad.hz[0] < ceilingHz && bad.hz[1] > floorHz) {
      tensions.push(
        `The worst lobing zone (${bad.hz[0].toFixed(0)}-${bad.hz[1].toFixed(0)} Hz) overlaps the ` +
          'feasible window: part of the window is worse than the rest of it.',
      );
    }
  }

  const empty = floorHz !== null && ceilingHz !== null && ceilingHz <= floorHz;
  if (empty) {
    tensions.push(
      'THE WINDOW IS EMPTY: every crossing frequency is forbidden by one limit or another. That is ' +
        'a driver or layout problem, not a filter problem - and it is visible before a single ' +
        'component has been chosen.',
    );
  }

  return {
    lower: input.lower,
    upper: input.upper,
    order: input.order,
    floorHz,
    ceilingHz,
    floorBy,
    ceilingBy,
    limits,
    zones,
    upperFsHz: input.upperFsHz,
    spacingMm: input.spacingMm,
    spacingSource: input.spacingSource ?? null,
    empty,
    tensions,
  };
}
