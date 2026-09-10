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
  DB_PER_OCTAVE_PER_ORDER,
  MM_PER_M,
  SPEED_OF_SOUND_M_S,
  WINDOW_SMOOTHING_OCTAVES,
  XO_FS_FACTOR_BY_ORDER,
} from '../constants.ts';
import { breakupDivisor } from '../metrics/acoustic.ts';
import { derivedPositionCount } from './positionCount.ts';
import { BREAKUP_DIVISOR_PROTOCOL, breakupDivisorProtocolFor } from '../../breakupDivisorProtocol.ts';

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
  rule:
    | 'validity'
    | 'fs'
    | 'breakup'
    | 'directivity'
    | 'drive'
    | 'drive-stated'
    | 'stated'
    | 'stated-min'
    | 'stated-max';
  /** Human sentence — always shown next to the number. */
  source: string;
  /** Set when this limit carries an uncalibrated component. */
  uncalibrated?: string;
  /**
   * U-4 — set when this limit is REPORTED BUT DOES NOT BIND, and says by what.
   *
   * There is exactly one way to get one today and it has to be switched on by
   * hand: a stated manufacturer's ceiling that the designer has told the app
   * to put in place of the breakup derivation. The superseded limit stays in
   * `limits` on purpose — the breakup is a measured property of the driver and
   * removing it from the report would hide the thing the overrule overrules —
   * but it is left out of the reduction that picks the binding ceiling.
   */
  superseded?: string;
}

/** A preference zone inside (or outside) the window. */
export interface XoZone {
  label: string;
  hz: [number, number];
  /** 'good' or 'bad' — preference, never a limit. */
  kind: 'good' | 'bad';
  /** True when the zone lies wholly outside the feasible window. */
  outsideWindow: boolean;
  /**
   * WHICH QUANTITY produced this zone, and from which input — one sentence.
   *
   * REQUIRED, not optional, and that is the point of adding it. A zone that
   * removes band from where a candidate may be placed is a lobing judgement,
   * and V20a says only ONE lobing quantity may carry a judgement: the vertical
   * synthesis. Every zone therefore has to say out loud which quantity it is,
   * so a reader of a candidate list can see why a position is missing and on
   * whose authority. A zone added later that forgets to answer does not
   * compile, which is the cheapest possible enforcement of V20a's blijvend
   * verbod on this surface.
   */
  derivedFrom: string;
}

/**
 * U-4 — ONE ROW OF THE DIVISOR TABLE: what this pair's ceiling, and the room
 * under it, would be at one candidate value of the breakup divisor.
 *
 * Reporting, and the reason it is reporting rather than a knob is the whole
 * point of it: the divisor between the two published endpoints has been
 * uncalibrated since V9, and nobody could see what calibrating it was worth.
 * On casus 1b's mid→tweeter axis the interpolated 2.47 leaves 0.07 octaves and
 * ONE candidate position; the mild endpoint leaves 0.37 and three. A table that
 * says so lets the designer decide whether the two-tone measurement is worth an
 * afternoon BEFORE spending one.
 *
 * The count is the generator's own (`derivedPositionCount` at
 * `WINDOW_SMOOTHING_OCTAVES`), so the table cannot promise room the field
 * generator would not lay a position in.
 */
export interface XoDivisorRow {
  /** The divisor this row assumes. */
  divisor: number;
  /** Where it comes from, in one phrase: published endpoint, ramp, measured. */
  label: string;
  /**
   * The ceiling the window would have at this divisor: the breakup over it, or
   * a stricter ceiling from another rule if there is one. What the WINDOW would
   * read, not what the breakup alone would say.
   */
  ceilingHz: number;
  /** Octaves between the window's floor and that ceiling; null with no floor. */
  spanOctaves: number | null;
  /** Positions the spacing rule admits there — 0 for an empty window. */
  positions: number | null;
  /** True for the row the window is actually using. */
  inUse: boolean;
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
  /**
   * U-4 — what each candidate breakup divisor would buy, when this pair has a
   * significant breakup and that breakup still binds. Empty otherwise: with the
   * derivation superseded by a stated ceiling the table answers nothing, and
   * with no breakup there is nothing to divide.
   */
  divisorTable: XoDivisorRow[];
  /** True when the limits leave no room at all. */
  empty: boolean;
  /** The tensions worth showing: conflicting zones, edge-of-window findings. */
  tensions: string[];
}

/**
 * U-3g — THE MANUFACTURER'S RECOMMENDED MINIMUM CROSSOVER, transcribed.
 *
 * The one generic statement a datasheet makes about how low a driver may be
 * crossed. On the BlieSMa T25T-6 it is the line "Recommended frequency range
 * 2.2 kHz - 30 kHz", and on that sheet it coincides with the condition the
 * power rating was measured under ("* IEC 268-5, 2nd order high-pass
 * Butterworth filter") - two lines saying 2200 Hz for two different reasons.
 *
 * Nothing here is derived and nothing has a default (P4).
 */
/**
 * U-4 — THE OTHER END OF THE SAME LINE: the manufacturer's recommended MAXIMUM
 * crossover, transcribed.
 *
 * The mirror of `DriverMinCrossover`, and the pair is the point: a datasheet's
 * "Recommended frequency range 2.2 kHz - 30 kHz" is ONE statement with two
 * ends. The lower end binds the window in which this driver is the UPPER of a
 * pair; the upper end binds the window in which it is the LOWER, as one more
 * candidate in the ceiling reduction, where — as everywhere on this side — the
 * strictest, meaning the LOWEST, wins and `ceilingBy` names it.
 *
 * WHAT IS DELIBERATELY *NOT* MIRRORED, and it is the one asymmetry worth
 * arguing for. The floor takes an optional ORDER, because the sheet's own
 * condition is a filter condition and a flank shallower than the stated one
 * leaves more energy at the driver's resonance than the sheet certified. There
 * is no such condition on the upper end: a recommended top is a statement about
 * cone breakup and beaming, and no sheet in this project prints a slope beside
 * it. A field nobody can fill is decoration (V19), and inventing a slope
 * correction that no manufacturer stated is exactly the A3h trap the floor's
 * own comment warns about. So the ceiling is taken VERBATIM at every order.
 * That is a decision and not an omission; if a sheet ever states one, it
 * arrives here as an added field and a measurement, not as a guess.
 */
export interface DriverMaxCrossover {
  /** The highest handover the sheet recommends for this driver, Hz. */
  hz: number;
  /** Where it came from - the sheet, and when it was read. */
  source?: string;
  /**
   * U-4, part 2 — THE OVERRULE: let this stated ceiling stand IN PLACE OF the
   * breakup derivation, even where that derivation would be stricter.
   *
   * The first stated overrule of a derived limit anywhere in this project, and
   * it exists because the derivation it replaces is the one limit in the module
   * that says of itself that it is uncalibrated: the breakup divisor
   * interpolates between two published endpoints on a ramp no measurement has
   * ever checked. A manufacturer who prints a recommended top has measured the
   * driver; a designer who decides to believe that over the app's ramp is
   * making a defensible call, and the app's job is to record it, not to make it
   * for them.
   *
   * NEVER ON UNLESS THE DESIGNER SETS IT (P4), and never a consequence of
   * merely stating a ceiling: a stated ceiling on its own is read beside the
   * derived ones and the strictest binds, exactly like E-1's per-pair one. The
   * breakup limit stays in the report either way, marked `superseded`, and the
   * candidate provenance says the overrule fired.
   */
  overridesBreakup?: boolean;
}

/**
 * U-4, part 3 — THE MEASURED BREAKUP DIVISOR of one driver.
 *
 * Replaces the interpolation for this driver and takes the uncalibrated
 * marking off the ceiling with it. `breakupDivisorProtocolFor` is the two-tone
 * measurement that produces it; `measuredOn` is the designer's own note about
 * when and how, because nothing in the app can know when a measurement was
 * made and a stamp of the moment it was TYPED would be a different fact under
 * the same name.
 */
export interface DriverBreakupDivisor {
  /** The measured divisor, between the two published endpoints. */
  value: number;
  /** When and how it was measured, in the designer's own words. */
  measuredOn?: string;
}

export interface DriverMinCrossover {
  /** The lowest handover the sheet recommends for this driver, Hz. */
  hz: number;
  /**
   * The ORDER that recommendation is stated at, when the sheet names one.
   *
   * Optional on purpose: many sheets print a recommended range and no slope,
   * and a floor that invented one would be inventing the manufacturer's
   * condition. Absent = the frequency is taken verbatim and no slope is
   * claimed either way.
   */
  order?: number;
  /** Where it came from - the sheet, and when it was read. */
  source?: string;
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
  /**
   * A5e.3-veld — THE EXCURSION CEILING OF THE UPPER DRIVER (M-C v2.0, V49):
   * how far below the filter input its drive voltage must sit at its own
   * resonance, dB (negative), `DriveExcursionResult.ceiling.ceilingDbReInput`.
   * A property of the DRIVER — driver card, amplifier peak and measured
   * sweep, class A — and therefore admissible as a pre-design floor: the
   * handover below which a filter of the candidate's order cannot hold that
   * drive under the ceiling (the inversion of A5d.3(ii), see `crossoverWindow`).
   *
   * Absent or null = no such floor; k·f_s alone (P4).
   */
  upperDriveCeilingDb?: number | null;
  /** Where that ceiling came from — attribution, exactly as every limit has. */
  upperDriveCeilingSource?: string;
  /**
   * A5e.3b — THE STATED M-C FIGURE of the upper driver (dB, negative,
   * passband-relative: how far under its own passband drive the way must sit
   * at f_s). Until A5e.3b it was deliberately NOT fed here — "a project
   * convention rather than a driver property" — and the M-T floor stood on
   * k·f_s while the field laid positions the requirement then refused with
   * 0.4 dB to spare (two 1495 Hz candidates at −20.4/−21.2 against −20). A
   * position a stated requirement forbids at the stated order is not a
   * position, so the floor now takes the STRICTEST known bound: the same
   * A5d.3(ii) inversion, with the stated figure as the demanded attenuation.
   *
   * DELIBERATELY STRICT, and the strictness is stated on the limit itself: the
   * inversion reads the bare ladder's asymptotic slope with the passband at
   * the input. A real network has more tools — an L-pad across the way loads
   * the driver's resonance peak and restores the ladder's division there, so a
   * padded way can meet the stated figure at a handover this floor forbids.
   * The floor assumes no pad for the same reason the excursion floor does not:
   * a floor that assumes a pad assumes a design (Sander, 05-09-2026).
   *
   * Absent or null = no such floor (P4): a project that states no figure for
   * this driver gets exactly the window it always got.
   */
  upperStatedDriveLimitDb?: number | null;
  /** Where that figure came from — attribution, exactly as every limit has. */
  upperStatedDriveLimitSource?: string;
  /**
   * E-1 — A STATED CEILING on this handover, Hz: the highest crossing the
   * designer allows for this pair (`ReportSettings.maxCrossingHzByPair`,
   * `gestelde_eisen.max_kruispunt_hz_per_paar`). The mirror of A5e.3b's
   * `upperStatedDriveLimitDb` on the floor side: the ceiling takes the
   * STRICTEST known bound — the lowest of the breakup ceiling, the
   * directivity ceiling and this one — and `ceilingBy` says which. Measured
   * on casus 1 (A5e.3c): every delivered network on the mid→tweeter ceiling
   * position (2304 Hz, the mid's breakup / 2.47) crossed 61–255 Hz lower, three
   * of four at ~2050 Hz — not because any limit pushed it there (the derived
   * ceilings are breakup 2304 and directivity 5433, nothing stated) but because
   * a position ON the ceiling has a one-sided cage and the raw mid/tweeter
   * level difference has a knee at ~2050 Hz that the acoustic crossing snaps
   * to. Stating a ceiling is the designer's call; the window then reads it as
   * one limit among the others. Absent or null = no such ceiling (P4): a
   * project that states none gets exactly the window it always got.
   */
  statedCeilingHz?: number | null;
  /** Where that ceiling came from — attribution, exactly as every limit has. */
  statedCeilingSource?: string;
  /**
   * U-3g — THE MANUFACTURER'S RECOMMENDED MINIMUM CROSSOVER for the UPPER
   * driver, and the order it is stated at. A datasheet transcription, so a
   * property of the DRIVER and admissible as a window floor on exactly the
   * footing `upperDriveCeilingDb` already is.
   *
   * WHY IT IS NOT CONVERTED THROUGH THE ORDER THE WAY THE dB FIGURES ARE, and
   * this is the whole design decision. `drive` and `drive-stated` invert
   * A5d.3(ii) because their input IS an attenuation at f_s: a steeper flank
   * genuinely delivers that attenuation lower down, so the frequency moves
   * with the order and the physics moves with it. A recommended minimum
   * crossover is a different KIND of statement. It bundles excursion, coil
   * heat, distortion, directivity and breakup into one number, and only the
   * first of those follows the flank's slope at f_s. Reading it as an
   * f_s-attenuation and inverting it would let a fourth-order flank cross
   * BELOW the recommendation on the strength of a model the sheet never
   * stated - the right number, from the right sheet, about the wrong thing
   * (A3h: a plausible wrong number is more dangerous than an absurd one).
   * Measured on the T25T-6: that inversion turns 2200 Hz @ 2nd order into
   * 1426 Hz at LR4, below both the recommendation and anything a designer
   * would call protected.
   *
   * So the frequency is a HARD FLOOR, verbatim, at every order - a steeper
   * flank never buys a lower handover here. The order is the second half of
   * the condition and it works in ONE direction: a flank SHALLOWER than the
   * sheet's leaves the driver more energy at its resonance than the sheet
   * certified, so the floor is raised to where this order delivers what the
   * stated condition delivered (the A5d.3(ii) inversion, used only upward).
   *
   * Absent or null = no such floor (P4): a project that transcribes nothing
   * gets exactly the window it always got, and no corpus moves.
   */
  upperMinCrossoverHz?: number | null;
  /** The order that recommendation is stated at; absent = none claimed. */
  upperMinCrossoverOrder?: number | null;
  /** Where it came from — attribution, exactly as every limit has. */
  upperMinCrossoverSource?: string;
  /**
   * U-4 — THE MANUFACTURER'S RECOMMENDED MAXIMUM CROSSOVER for the LOWER
   * driver, Hz. A datasheet transcription, so a property of the DRIVER and
   * admissible as a window ceiling on exactly the footing `upperMinCrossoverHz`
   * is admissible as a floor — the same statement, read at its other end.
   *
   * Taken VERBATIM at every order; see `DriverMaxCrossover` for why the order
   * correction the floor makes has no counterpart here. Absent or null = no
   * such ceiling (P4): a project that transcribes nothing gets exactly the
   * window it always got, and no corpus moves.
   */
  lowerMaxCrossoverHz?: number | null;
  /** Where it came from — attribution, exactly as every limit has. */
  lowerMaxCrossoverSource?: string;
  /**
   * U-4 — the designer's EXPLICIT decision to let that stated ceiling stand in
   * place of the breakup derivation. See `DriverMaxCrossover.overridesBreakup`.
   * Absent or false = the stated ceiling is one limit among the others and the
   * strictest binds.
   */
  lowerMaxCrossoverOverridesBreakup?: boolean;
  /**
   * U-4 — the MEASURED breakup divisor of the lower driver, replacing the
   * interpolation between the two published endpoints for this pair. Absent or
   * null = the ramp, with its uncalibrated marking (P4).
   */
  lowerBreakupDivisor?: number | null;
  /** When and how it was measured, in the designer's own words. */
  lowerBreakupDivisorSource?: string;
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

/**
 * U-5 — THE BREAKUP THAT SETS THIS PAIR'S CEILING, and the divisor it is
 * divided by.
 *
 * ONE IMPLEMENTATION, TWO READERS. `crossoverWindow` below builds its breakup
 * ceiling out of this, and `statedCrossings.ts` reads it to say what a stated
 * position ABOVE that ceiling is asked to deliver: the ceiling is
 * `f_breakup / divisor`, so what the derivation demands there is the
 * attenuation a flank of this order holds over `log2(divisor)` octaves. A
 * second "which breakup binds, and at what divisor" in the stated layer would
 * be the family of bug this codebase has paid for repeatedly (A3g), and it
 * would be the worst possible place for it: the verdict on a breached ceiling
 * would then be measured against a ceiling other than the one that was
 * breached.
 *
 * Null when no breakup of the lower driver clears the significance threshold —
 * then there is no breakup ceiling either, and nothing to be past.
 */
export function bindingBreakup(input: XoWindowInput): {
  /** The breakup's own frequency, Hz. */
  fHz: number;
  /** How far it stands over the local trend, dB. */
  dB: number;
  /** The divisor in force: measured when the designer measured one (U-4). */
  divisor: number;
  measured: boolean;
} | null {
  const significant = input.significantBreakupDb ?? DEFAULT_SIGNIFICANT_BREAKUP_DB;
  const first = input.lowerBreakups
    .filter((b) => b.dB >= significant)
    .sort((a, b) => a.fHz - b.fHz)[0];
  if (!first) return null;
  const measuredDiv = input.lowerBreakupDivisor ?? null;
  const measured = measuredDiv !== null && Number.isFinite(measuredDiv) && measuredDiv > 0;
  return {
    fHz: first.fHz,
    dB: first.dB,
    divisor: measured ? (measuredDiv as number) : breakupDivisor(first.dB),
    measured,
  };
}

export function crossoverWindow(input: XoWindowInput): XoWindowResult {
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

  /* A5e.3-veld — THE DRIVE FLOOR: the inversion of A5d.3(ii).
   *
   * Rule (ii) of the order derivation reads "the attenuation M-C asks for at
   * the upper driver's resonance, divided by the octave distance from that
   * resonance up to the handover" and answers with an ORDER. Read the other
   * way, at a GIVEN order, the same rule answers with a frequency: the lowest
   * handover at which a filter of that order still attenuates the drive at
   * f_s by what the ceiling asks —
   *
   *     f_floor = f_s · 2^( |ceiling| / (DB_PER_OCTAVE_PER_ORDER · order) ).
   *
   * Asymptotic slope, passband taken at the input (0 dB re input — the way
   * that is NOT attenuated, which is the strictest honest reading: a pad on
   * the way lowers its passband and makes the requirement easier, and a floor
   * that assumed a pad would assume a design). k·f_s stays beside it as the
   * convention it is; the HIGHER of the two floors binds, exactly as every
   * floor here is combined. Measured on casus 1 (M-1, 04-09-2026): at k·f_s =
   * 124 Hz an LR4 attenuates the mid's drive at 88.8 Hz by 11.6 dB against a
   * ceiling of 17.7, and four of the five candidates on that position were
   * refused on M-C (mid); this floor puts the position at 148 Hz. */
  const ceiling = input.upperDriveCeilingDb ?? null;
  if (input.upperFsHz !== null && ceiling !== null && Number.isFinite(input.order) && input.order > 0) {
    const needDb = Math.abs(ceiling);
    const octaves = needDb / (DB_PER_OCTAVE_PER_ORDER * input.order);
    limits.push({
      side: 'floor',
      hz: input.upperFsHz * 2 ** octaves,
      rule: 'drive',
      source:
        `${needDb.toFixed(1)} dB of attenuation at ${input.upper}'s resonance (${input.upperFsHz.toFixed(0)} Hz) ` +
        `takes ${octaves.toFixed(2)} octaves at order ${input.order} (${DB_PER_OCTAVE_PER_ORDER} dB/oct per order) - ` +
        `the excursion ceiling of M-C v2.0 (${input.upperDriveCeilingSource ?? 'source not stated'}), read as ` +
        'A5d.3(ii) inverted, with the passband at the input',
    });
  }

  /* A5e.3b — THE SAME INVERSION ON THE STATED FIGURE. The stated M-C figure is
   * passband-relative, and with the passband taken at the input — the same
   * strictest honest reading the excursion floor takes — the demanded
   * attenuation at f_s is the figure itself. The floor combination below takes
   * the HIGHEST floor, so whichever of the two demands more is what binds and
   * `floorBy` says which. See `upperStatedDriveLimitDb` for why the floor is
   * deliberately strict (a pad can meet the requirement where this assumes
   * none). */
  const statedLimit = input.upperStatedDriveLimitDb ?? null;
  if (input.upperFsHz !== null && statedLimit !== null && Number.isFinite(input.order) && input.order > 0) {
    const needDb = Math.abs(statedLimit);
    const octaves = needDb / (DB_PER_OCTAVE_PER_ORDER * input.order);
    limits.push({
      side: 'floor',
      hz: input.upperFsHz * 2 ** octaves,
      rule: 'drive-stated',
      source:
        `${needDb.toFixed(1)} dB of attenuation at ${input.upper}'s resonance (${input.upperFsHz.toFixed(0)} Hz) ` +
        `takes ${octaves.toFixed(2)} octaves at order ${input.order} (${DB_PER_OCTAVE_PER_ORDER} dB/oct per order) - ` +
        `the STATED M-C figure (${input.upperStatedDriveLimitSource ?? 'source not stated'}), read as A5d.3(ii) ` +
        'inverted with the passband at the input. Deliberately strict: a pad on the way can meet the stated ' +
        'figure below this floor, and the floor assumes no pad (A5e.3b)',
    });
  }

  /* U-3g — THE RECOMMENDED MINIMUM CROSSOVER, verbatim, and raised only for a
   * flank shallower than the one it was stated at. See `upperMinCrossoverHz`
   * for why this floor is NOT inverted downward the way the two dB floors
   * above are. The floor combination takes the HIGHEST floor, so this sits
   * beside them and `floorBy` names whichever demands most. */
  const minXo = input.upperMinCrossoverHz ?? null;
  if (minXo !== null && Number.isFinite(minXo) && minXo > 0) {
    const statedOrder = input.upperMinCrossoverOrder ?? null;
    const where = input.upperMinCrossoverSource ?? 'source not stated';
    const hasOrders =
      statedOrder !== null &&
      Number.isFinite(statedOrder) &&
      statedOrder > 0 &&
      Number.isFinite(input.order) &&
      input.order > 0;
    /* The attenuation at f_s that the stated condition itself delivers. Only
     * meaningful when the recommendation sits ABOVE the resonance; a sheet
     * that recommends crossing below f_s says nothing about attenuation and
     * the verbatim floor is the whole answer. */
    const demandedDb =
      hasOrders && input.upperFsHz !== null && input.upperFsHz > 0 && minXo > input.upperFsHz
        ? DB_PER_OCTAVE_PER_ORDER * (statedOrder as number) * Math.log2(minXo / input.upperFsHz)
        : null;
    /* TWO CONDITIONS FOR ONE RULE, and both earn their place. `shallower` IS
     * the rule — the inversion runs upward only. `raised` is the FLOAT GUARD
     * beneath it: at the stated order the inversion returns minXo up to
     * rounding, and this project has paid three times for an exact comparison
     * on a derived number (V46's precisering, V49 and B-1 in CI). Deleting
     * either one alone changes no behaviour, which is why the reason is
     * written down rather than left to be rediscovered. */
    const shallower = hasOrders && input.order < (statedOrder as number);
    const corrected =
      shallower && demandedDb !== null && input.upperFsHz !== null
        ? input.upperFsHz * 2 ** (demandedDb / (DB_PER_OCTAVE_PER_ORDER * input.order))
        : null;
    const raised = corrected !== null && corrected > minXo;
    limits.push({
      side: 'floor',
      hz: raised ? (corrected as number) : minXo,
      rule: 'stated-min',
      source:
        `the manufacturer's recommended minimum crossover for ${input.upper}, ` +
        `${minXo.toFixed(0)} Hz` +
        (hasOrders ? ` at order ${statedOrder}` : ' (no order stated)') +
        ` (${where})` +
        (raised
          ? ` - RAISED to ${(corrected as number).toFixed(0)} Hz because this pair crosses at order ` +
            `${input.order}, shallower than the ${statedOrder} the recommendation is stated at: at ` +
            `${minXo.toFixed(0)} Hz the sheet's own condition holds ${(demandedDb as number).toFixed(1)} dB ` +
            `at f_s (${(input.upperFsHz as number).toFixed(0)} Hz) and this order needs that much further up`
          : ' - taken verbatim; a steeper flank does not buy a lower handover here, because a ' +
            'recommended range bundles distortion and directivity with excursion and only the last ' +
            'of those follows the slope at f_s (U-3g)'),
    });
  }

  /* U-4 — THE MANUFACTURER'S RECOMMENDED MAXIMUM, resolved before the breakup
   * so the breakup block can see whether it has been told to stand aside. The
   * limit itself is pushed further down, beside the other stated ceiling. */
  const maxXo = input.lowerMaxCrossoverHz ?? null;
  const hasStatedMax = maxXo !== null && Number.isFinite(maxXo) && maxXo > 0;
  const overrulesBreakup = hasStatedMax && input.lowerMaxCrossoverOverridesBreakup === true;

  // The FIRST SIGNIFICANT breakup, not the tallest and not the first ripple.
  // "First" because a crossing has to clear the lowest resonance that matters;
  // "significant" because every response has ripple and a ceiling derived from
  // 1 dB of it would forbid designs for no physical reason.
  /* U-5 — the breakup and the divisor come from `bindingBreakup` above, so the
   * ceiling here and the verdict a stated position past it is given cannot
   * disagree about which breakup binds or what it is divided by (A3g).
   *
   * U-4 — the divisor the ceiling is actually built on: the designer's measured
   * value when there is one, the interpolation otherwise. A measured divisor is
   * a fact about this driver and the ramp is a placeholder, so the measurement
   * wins outright rather than being averaged with it. */
  const bindingBu = bindingBreakup(input);
  const first = bindingBu ? { fHz: bindingBu.fHz, dB: bindingBu.dB } : undefined;
  const measuredDiv = input.lowerBreakupDivisor ?? null;
  const divIsMeasured = bindingBu?.measured ?? false;
  const divUsed = bindingBu ? bindingBu.divisor : null;
  if (first && divUsed !== null) {
    limits.push({
      side: 'ceiling',
      hz: first.fHz / divUsed,
      rule: 'breakup',
      source:
        `first significant breakup of ${input.lower} at ${first.fHz.toFixed(0)} Hz ` +
        `(+${first.dB.toFixed(1)} dB) divided by ${divUsed.toFixed(2)}` +
        (divIsMeasured
          ? ` - MEASURED (${input.lowerBreakupDivisorSource ?? 'when and how not stated'}), not the ` +
            'interpolated ramp (U-4)'
          : ''),
      /* The marking goes with the RAMP and not with the rule: a measured
       * divisor is a measurement of this driver, so the ceiling that stands on
       * it is no more uncalibrated than any other measured limit here, and the
       * candidates that inherit it stop being marked too. */
      ...(divIsMeasured
        ? {}
        : {
            uncalibrated:
              `The divisor interpolates between the published endpoints (${BREAKUP_DIV_SEVERE} severe, ` +
              `${BREAKUP_DIV_MILD} mild); the ramp between them is uncalibrated and needs HD data ` +
              `(spec V6/V9). This ceiling moves if that curve does. To replace it with a measurement: ` +
              breakupDivisorProtocolFor(first.fHz),
          }),
      ...(overrulesBreakup
        ? {
            superseded:
              `stated ceiling (${input.lowerMaxCrossoverSource ?? 'source not stated'}) REPLACES the ` +
              `derived breakup limit (UNCALIBRATED) - the first stated overrule of a derived limit in ` +
              `this project; the breakup at ${first.fHz.toFixed(0)} Hz stays in the report`,
          }
        : {}),
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

  /* U-4 — THE MANUFACTURER'S CEILING, the mirror of U-3g's floor. One limit
   * among the ceilings, verbatim at every order (see `DriverMaxCrossover`); the
   * reduction below takes the LOWEST and `ceilingBy` names the winner. With the
   * overrule on it additionally takes the breakup out of that reduction, and
   * the sentence says so where the limit is read. */
  if (hasStatedMax) {
    limits.push({
      side: 'ceiling',
      hz: maxXo as number,
      rule: 'stated-max',
      source:
        `the manufacturer's recommended maximum crossover for ${input.lower}, ` +
        `${(maxXo as number).toFixed(0)} Hz (${input.lowerMaxCrossoverSource ?? 'source not stated'}) - ` +
        'taken verbatim at every order: a recommended top is about cone breakup and beaming and no ' +
        'sheet states a slope beside it (U-4)' +
        (overrulesBreakup
          ? '. OVERRULE SET BY THE DESIGNER: this ceiling REPLACES the derived breakup limit ' +
            '(UNCALIBRATED) even where that would be stricter - the first stated overrule of a ' +
            'derived limit in this project'
          : ''),
    });
  }

  /* E-1 — the stated ceiling, one limit among the ceilings: the reduction
   * below takes the LOWEST, so the strictest of stated and derived binds and
   * `ceilingBy` names it — the mirror of the floor side, where the HIGHEST of
   * the stated-figure floor and the derived ones binds (A5e.3b). */
  const statedCeiling = input.statedCeilingHz ?? null;
  if (statedCeiling !== null && Number.isFinite(statedCeiling) && statedCeiling > 0) {
    limits.push({
      side: 'ceiling',
      hz: statedCeiling,
      rule: 'stated',
      source:
        `a stated maximum handover of ${statedCeiling.toFixed(0)} Hz for ${input.lower}→${input.upper} ` +
        `(${input.statedCeilingSource ?? 'source not stated'}) — the designer's bound, read beside the ` +
        'derived ceilings; the strictest binds (E-1)',
    });
  }

  const floors = limits.filter((l) => l.side === 'floor');
  const ceilings = limits.filter((l) => l.side === 'ceiling');
  /* U-4 — a SUPERSEDED limit is reported and does not bind. The only way to get
   * one is the designer's explicit overrule; every other limit reaches the
   * reduction exactly as it always did, so a project that sets nothing here has
   * a binding set identical to the whole set (P2). */
  const binding = ceilings.filter((l) => l.superseded === undefined);
  const floorBy = floors.length ? floors.reduce((a, b) => (b.hz > a.hz ? b : a)) : null;
  const ceilingBy = binding.length ? binding.reduce((a, b) => (b.hz < a.hz ? b : a)) : null;
  const floorHz = floorBy?.hz ?? null;
  const ceilingHz = ceilingBy?.hz ?? null;

  const zones: XoZone[] = [];
  const tensions: string[] = [];
  if (input.spacingMm !== null && input.spacingMm > 0) {
    const cOverD = SPEED_OF_SOUND_M_S / (input.spacingMm / MM_PER_M);
    const outside = (z: [number, number]): boolean =>
      floorHz !== null && ceilingHz !== null ? z[1] < floorHz || z[0] > ceilingHz : false;
    /* THE ATTRIBUTION EVERY ZONE ON THIS SURFACE CARRIES (V20a).
     *
     * All three zones below are the same quantity with different multipliers:
     * a fraction of the wavelength at the handover, measured on the ONE
     * centre-to-centre distance this pair was handed. That is a geometric
     * SCREENING quantity — the register row calls it M-F-interim and gives it
     * the role "rapportage" — and it is emphatically not `verticalLobing`,
     * which is the authority. Stated once, here, because it is a property of
     * how these zones are computed rather than of any one of them. */
    const derivedFrom =
      `a fraction of the wavelength at the handover, taken on the ONE centre-to-centre distance ` +
      `this pair was given (${input.spacingMm.toFixed(1)} mm — ${input.spacingSource ?? 'source not stated'}). ` +
      `This is the M-F-INTERIM screening quantity (A4, role: reporting), not the vertical synthesis, ` +
      `which is the only lobing quantity a judgement may hang on (V20a).`;
    const add = (label: string, hz: [number, number], kind: 'good' | 'bad') =>
      zones.push({ label, hz, kind, outsideWindow: outside(hz), derivedFrom });
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

  /* E-1 — say which side of the derived ceilings a stated one landed on, so a
   * reader of the window sees whether the designer's bound or the measurement's
   * is what shaped the field. */
  const statedC = ceilings.find((l) => l.rule === 'stated') ?? null;
  const derivedC = ceilings.filter((l) => l.rule !== 'stated' && l.rule !== 'stated-max');
  if (statedC && derivedC.length > 0) {
    const tightest = derivedC.reduce((a, b) => (b.hz < a.hz ? b : a));
    tensions.push(
      `A stated ceiling of ${statedC.hz.toFixed(0)} Hz ` +
        (statedC.hz < tightest.hz ? 'is stricter than' : statedC.hz > tightest.hz ? 'lies above' : 'coincides with') +
        ` the derived one (${tightest.hz.toFixed(0)} Hz, ${tightest.rule}); the strictest binds, and here that is ` +
        `${ceilingBy?.rule ?? 'none'} (E-1).`,
    );
  }

  /* U-3g — the mirror of the E-1 sentence on the floor side: say where a
   * transcribed minimum crossover landed against the floors the measurements
   * derive, so a reader can see whether the sheet or the driver shaped the
   * field. The convention (`fs`) is called one by name; that is the whole
   * finding of U-3e, and a stated minimum is the first floor in this project
   * that is neither a convention nor a derivation but a MANUFACTURER'S. */
  const statedMin = floors.find((l) => l.rule === 'stated-min') ?? null;
  const otherFloors = floors.filter((l) => l.rule !== 'stated-min');
  if (statedMin && otherFloors.length > 0) {
    const highest = otherFloors.reduce((a, b) => (b.hz > a.hz ? b : a));
    tensions.push(
      `The datasheet's minimum crossover (${statedMin.hz.toFixed(0)} Hz) ` +
        (statedMin.hz > highest.hz
          ? 'is STRICTER than'
          : statedMin.hz < highest.hz
            ? 'lies below'
            : 'coincides with') +
        ` every floor the measurements imply (highest: ${highest.hz.toFixed(0)} Hz, ${highest.rule}` +
        (highest.rule === 'fs' ? ' - a convention, not a measurement' : '') +
        `); the strictest binds, and here that is ${floorBy?.rule ?? 'none'} (U-3g).`,
    );
  }

  /* U-4 — the mirror of the U-3g sentence, on the ceiling side: where did the
   * sheet's recommended top land against the ceilings the measurements derive?
   * The one limit it is most interesting against is the breakup, because that
   * is the limit that admits to being uncalibrated. */
  const statedMaxL = ceilings.find((l) => l.rule === 'stated-max') ?? null;
  const breakupL = ceilings.find((l) => l.rule === 'breakup') ?? null;
  if (statedMaxL && derivedC.length > 0) {
    const lowest = derivedC.reduce((a, b) => (b.hz < a.hz ? b : a));
    tensions.push(
      `The datasheet's maximum crossover (${statedMaxL.hz.toFixed(0)} Hz) ` +
        (statedMaxL.hz < lowest.hz
          ? 'is STRICTER than'
          : statedMaxL.hz > lowest.hz
            ? 'lies above'
            : 'coincides with') +
        ` every ceiling the measurements imply (lowest: ${lowest.hz.toFixed(0)} Hz, ${lowest.rule}` +
        (lowest.rule === 'breakup' && lowest.uncalibrated !== undefined ? ' - UNCALIBRATED' : '') +
        '); ' +
        /* With the overrule set, "the strictest binds" is the wrong sentence
         * and would read as if strictness were still doing the work — it is
         * not, the designer is. Measured in the running app before it was
         * written down: a stated 4000 Hz above a derived 2287 Hz printed
         * "the strictest binds, and here that is stated-max". */
        (overrulesBreakup
          ? `the OVERRULE puts it in place of the breakup derivation, so ${ceilingBy?.rule ?? 'none'} binds ` +
            'even though it is not the strictest (U-4).'
          : `the strictest binds, and here that is ${ceilingBy?.rule ?? 'none'} (U-4).`),
    );
  }
  if (overrulesBreakup && breakupL) {
    tensions.push(
      `OVERRULE: the stated ceiling ${statedMaxL ? `${statedMaxL.hz.toFixed(0)} Hz ` : ''}replaces the ` +
        `derived breakup limit (${breakupL.hz.toFixed(0)} Hz, UNCALIBRATED), which is reported above ` +
        'and does not bind. You set this; nothing derives it. The breakup itself is unchanged and so ' +
        'is every metric that reads it - only this window edge does (U-4).',
    );
  }

  /* U-4 — WHAT MEASURING THE DIVISOR WOULD BUY, per candidate value.
   *
   * Only while the breakup actually sets a ceiling: with it superseded the
   * table would be an answer to a question the window is no longer asking, and
   * with no significant breakup there is nothing to divide. The other ceilings
   * are folded in, so each row is what the WINDOW would read rather than what
   * the breakup alone would say. */
  const divisorTable: XoDivisorRow[] = [];
  if (first && divUsed !== null && !overrulesBreakup) {
    const others = binding.filter((l) => l.rule !== 'breakup').map((l) => l.hz);
    const interpolated = breakupDivisor(first.dB);
    const rows: { divisor: number; label: string }[] = [
      {
        divisor: BREAKUP_DIV_MILD,
        label: `published endpoint, mild: only H${BREAKUP_DIV_MILD} of the passband reaches the breakup`,
      },
      {
        divisor: interpolated,
        label:
          `interpolated from +${first.dB.toFixed(1)} dB over trend - UNCALIBRATED, the ramp V9 flagged`,
      },
      {
        divisor: BREAKUP_DIV_SEVERE,
        label: `published endpoint, severe: H${BREAKUP_DIV_SEVERE} reaches it too`,
      },
    ];
    if (divIsMeasured) {
      rows.push({
        divisor: measuredDiv as number,
        label: `MEASURED (${input.lowerBreakupDivisorSource ?? 'when and how not stated'})`,
      });
    }
    const seen = new Set<string>();
    for (const r of rows.sort((a, b) => a.divisor - b.divisor)) {
      const key = r.divisor.toFixed(6);
      if (seen.has(key)) continue;
      seen.add(key);
      const eff = Math.min(first.fHz / r.divisor, ...others);
      const room = floorHz !== null && eff > floorHz ? Math.log2(eff / floorHz) : null;
      divisorTable.push({
        divisor: r.divisor,
        label: r.label,
        ceilingHz: eff,
        spanOctaves: floorHz === null ? null : (room ?? 0),
        positions: floorHz === null ? null : room === null ? 0 : derivedPositionCount(room, WINDOW_SMOOTHING_OCTAVES),
        inUse: Math.abs(r.divisor - divUsed) < 1e-9,
      });
    }
    if (!divIsMeasured && divisorTable.some((r) => r.positions !== null)) {
      const mild = divisorTable[0];
      const now = divisorTable.find((r) => r.inUse);
      if (mild && now && mild.positions !== now.positions) {
        tensions.push(
          `The breakup divisor is the ramp, not a measurement: at ${now.divisor.toFixed(2)} this window ` +
            `holds ${now.positions} position(s), at the mild endpoint ${mild.divisor.toFixed(2)} it would ` +
            `hold ${mild.positions}. ${BREAKUP_DIVISOR_PROTOCOL}`,
        );
      }
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
    divisorTable,
    empty,
    tensions,
  };
}
