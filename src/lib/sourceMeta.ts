/**
 * What a measurement IS, and where it may be believed.
 *
 * Every response in this app arrives as bare numbers, and the app then has to
 * remember three things about it that the numbers cannot say: how it was taken
 * (gated far field, near-field merge, ground plane), the band over which it
 * means anything, and — if it was derived rather than measured — what it was
 * derived from.
 *
 * WHY IT NEEDS TO BE WRITTEN DOWN (Sanders, aug 2026): the near-field merge is
 * a STAGING POST. Ground-plane measurements are meant to replace the low end
 * below 400 Hz later. Without a flag travelling with the data, three sessions
 * from now nobody can see which filter work still rests on the older
 * assumption — and the answer will look like a mystery instead of a fact.
 *
 * This module is deliberately DATA ONLY: types, constants and pure derivations
 * of a band from a measurement condition. Nothing here refuses anything yet;
 * enforcement is a separate step, so that adding the vocabulary carries no
 * behavioural risk of its own.
 */

const C_AIR = 343;

/* ------------------------------------------------------------------ *
 * How a response was obtained
 * ------------------------------------------------------------------ */

export type DataSource =
  /** A single gated far-field sweep. Honest only above the gate's own limit. */
  | 'gated-farfield'
  /** Gated far field with a near-field low end spliced onto it. */
  | 'nearfield-merged'
  /** Cabinet and mic on the floor: no floor bounce, +6 dB, good low down. */
  | 'groundplane';

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  'gated-farfield': 'gated far field',
  'nearfield-merged': 'near-field merged',
  groundplane: 'ground plane',
};

/* ------------------------------------------------------------------ *
 * Validity
 * ------------------------------------------------------------------ */

export interface ValidityBand {
  /** Lowest frequency this response may be believed at; null = unknown. */
  fromHz: number | null;
  /** Highest; null = unknown (or "up to the file's own end"). */
  toHz: number | null;
  /** Why those numbers — shown to the designer, never just asserted. */
  reason: string;
}

export interface SourceMeta {
  dataSource: DataSource;
  validity: ValidityBand;
  /**
   * False when the validity band could not be established from what the
   * project holds — in practice always a gated far field whose gate length is
   * unknown, since near-field bands follow from Sd and impedance is valid
   * throughout.
   *
   * An unverified source LOADS and DISPLAYS, with a visible mark. What it may
   * not do is take part in a new fit or optimiser run: there the band is what
   * separates a measurement from a number. The flag stays until it is
   * resolved, and it never clears as a side effect of editing something else.
   */
  verified?: boolean;
  /** What is missing, phrased as the question the designer has to answer. */
  unverifiedReason?: string;
  /** Present when this response was computed rather than measured: the merge,
   *  the parallel-impedance derivation, a summed pair. Human-readable, and
   *  meant to survive into the project file. */
  derivation?: string;
  /** Free-form notes that belong to the dataset rather than to the app — e.g.
   *  a known inconsistency that is documented on purpose and not corrected. */
  notes?: string[];
}

/**
 * The near-field piston limit, as ONE named constant.
 *
 * f_max = c / (2·π·a) is ka = 1, with `a` the effective radiating radius. For
 * the WO24P-8 (Sd 220 cm² effective, a = 83.7 mm) that is 652 Hz — Sanders' note says 651,
 * which is the same number rounded off a slightly different c or a.
 *
 * Why 1 and not something looser: the near-field pressure is only proportional
 * to cone velocity while the cone is acoustically small, and the piston error
 * grows fast. Measured off sinc(ka/2):
 *
 *     ka = 1.00  →  652 Hz  →  −0.36 dB
 *     ka = 1.60  → 1070 Hz  →  −0.95 dB
 *     ka = 2.55  → 1659 Hz  →  −2.50 dB
 *
 * — and those are LOWER BOUNDS (see pistonErrorDb). The last of them is the
 * "10950/d_inch" rule that circulates; it is too generous, and on a driver like
 * the WO24 non-uniform cone behaviour lands on top of it, which no analytic
 * correction can undo. So: ka = 1 everywhere, and the warning states the
 * computed floor in dB instead of a bare verdict.
 *
 * Cross-check from two directions: Klippel writes the same limit as 5475/a[cm],
 * Keele as 4311/D[inch], and 4311/(2/2.54) = 5475.0 exactly.
 */
export const NEARFIELD_KA_LIMIT = 1.0;

/** Effective piston radius from cone area, metres. */
export function pistonRadiusM(sdCm2: number): number | null {
  if (!(sdCm2 > 0)) return null;
  return Math.sqrt((sdCm2 * 1e-4) / Math.PI);
}

/** ka at a frequency, for a piston of this area. */
export function kaAt(fHz: number, sdCm2: number): number | null {
  const a = pistonRadiusM(sdCm2);
  if (a === null || !(fHz > 0)) return null;
  return (2 * Math.PI * fHz * a) / C_AIR;
}

/**
 * IDEAL-PISTON part of the near-field error at ka, in dB — a LOWER BOUND on the
 * real error, never the whole of it.
 *
 * Derivation, with the mic on the axis at distance z from a rigid piston of
 * radius a:
 *
 *     |p(z)| = 2·ρ·c·u·|sin( k·(√(z² + a²) − z) / 2 )|
 *     at z = 0:            2·ρ·c·u·sin(ka/2)
 *
 * The standard near-to-far scaling p_far = p_nf · a/(2r) assumes the
 * low-frequency limit ρ·c·u·ka, so the ratio between what the mic sees and what
 * that scaling assumes is
 *
 *     2·sin(ka/2) / ka  =  sinc(ka/2)
 *
 * Two things sit on top of this and neither is analytic: a real cone stops
 * moving as one piece well before ka = 1 (on a WO24 that is the dominant term),
 * and the mic is at a finite z, not at 0. So the number below is the floor of
 * the error — phrase every warning as "at least X dB", never as "the error is
 * X dB".
 */
export function pistonErrorDb(ka: number): number {
  if (!(ka > 0)) return 0;
  const x = ka / 2;
  return 20 * Math.log10(Math.sin(x) / x);
}

/** Near-field validity for a cone of this area: 15 Hz up to ka = 1. */
export function nearFieldValidity(sdCm2: number, fromHz = 15): ValidityBand | null {
  const a = pistonRadiusM(sdCm2);
  if (a === null) return null;
  const toHz = (NEARFIELD_KA_LIMIT * C_AIR) / (2 * Math.PI * a);
  return {
    fromHz,
    toHz,
    reason:
      `near field: valid to ka = ${NEARFIELD_KA_LIMIT} (${Math.round(toHz)} Hz for ` +
      `a = ${(a * 1000).toFixed(1)} mm); ideal-piston error there at least ` +
      `${pistonErrorDb(NEARFIELD_KA_LIMIT).toFixed(2)} dB, plus non-uniform cone ` +
      `behaviour and the real mic distance, neither of which is analytic`,
  };
}

/**
 * Far-field validity from the gate.
 *
 * The gate sets the floor: a window of T seconds cannot resolve anything whose
 * period needs longer, and the working rule this codebase already uses for
 * crossover windows is 2/T. The ceiling is the file's own top.
 */
export function gatedFarFieldValidity(
  gateMs: number,
  topHz: number | null = null,
  /** Window taper (Tukey α on the right flank). See dataFloorFromGateMs for
   *  why the effective duration, not the nominal one, sets the floor. */
  alpha = 0.25,
): ValidityBand | null {
  if (!(gateMs > 0)) return null;
  const a = Math.min(Math.max(alpha, 0), 1);
  const effMs = (1 - a / 2) * gateMs;
  const fromHz = 2 / (effMs / 1000);
  return {
    fromHz,
    toHz: topHz,
    reason:
      `gated ${gateMs.toFixed(2)} ms` +
      (a > 0 ? ` with a Tukey ${a} right taper → ${effMs.toFixed(2)} ms effective` : ' (rectangular)') +
      ` → honest above ${Math.round(fromHz)} Hz (2/T)`,
  };
}

/**
 * The low end of a near-field / merged branch, in Hz.
 *
 * A NEAR-FIELD MEASUREMENT HAS NO GATE FLOOR, and that is the whole reason we
 * take one. The mic sits ~5 mm from the cone: the direct pressure is tens of
 * dB above anything the room sends back, so the window is not what limits how
 * low the result may be believed — the noise floor and the mic calibration
 * are. 2/T describes a far-field sweep, where the reflection arrives at
 * comparable level and the window is the only thing keeping it out.
 *
 * So the floor is an explicit stated bound, not a derived one. 15 Hz is below
 * anything these drivers do and above where a measurement mic's calibration
 * stops meaning much.
 */
export const NEARFIELD_MERGED_FLOOR_HZ = 15;

/**
 * Validity of a branch whose low end came from a near-field splice.
 *
 * NOTE THE SIGNATURE: there is no gate parameter that could set a floor. That
 * is deliberate and it is the point of the function existing at all — the data
 * floor 2/T belongs to `dataSource === 'gated-farfield'` and to nothing else,
 * and a signature that cannot accept a gate cannot be wired to one later by
 * someone who does not know that. `ignoredGateMs` exists ONLY to report a gate
 * that was present in the near-field file and deliberately not used; it can
 * never reach the numbers.
 */
export function nearFieldMergedValidity(opts: {
  /** Where the near field hands over to the gated far field. */
  spliceHz: number;
  /** Top of the merged response (the far-field file's own end). */
  toHz: number | null;
  /** Stated lower bound; defaults to {@link NEARFIELD_MERGED_FLOOR_HZ}. */
  fromHz?: number | null;
  /** A gate length found in the near-field header — NOT used, only reported. */
  ignoredGateMs?: number | null;
}): { validity: ValidityBand; notes: string[] } {
  const fromHz = opts.fromHz ?? NEARFIELD_MERGED_FLOOR_HZ;
  const notes: string[] = [];
  if (opts.ignoredGateMs && opts.ignoredGateMs > 0) {
    notes.push(
      `the near-field file states a ${opts.ignoredGateMs.toFixed(2)} ms window; it is NOT used as a ` +
        `data floor. At ~5 mm the direct sound is far above anything the room returns, so the ` +
        `window is not what limits the low end — the noise floor and the mic calibration are.`,
    );
  }
  return {
    validity: {
      fromHz,
      toHz: opts.toHz,
      reason:
        `near field below ${Math.round(opts.spliceHz)} Hz, gated far field above it; ` +
        `honest down to a stated ${Math.round(fromHz)} Hz (a near-field measurement has no gate floor)`,
    },
    notes,
  };
}

/** Ground plane: no floor bounce, so the gate is long; the low end is real. */
export function groundPlaneValidity(fromHz = 20, toHz: number | null = null): ValidityBand {
  return {
    fromHz,
    toHz,
    reason: 'ground plane: cabinet and mic on the floor, reflection coincides with the direct sound',
  };
}

/**
 * Does a band of interest fall inside a source's validity?
 *
 * Returns the part that does NOT, so a caller can say which end is the problem
 * instead of returning a bare boolean.
 */
export function outsideValidity(
  band: ValidityBand,
  fromHz: number,
  toHz: number,
): { belowHz: number | null; aboveHz: number | null; ok: boolean } {
  const belowHz = band.fromHz !== null && fromHz < band.fromHz ? band.fromHz : null;
  const aboveHz = band.toHz !== null && toHz > band.toHz ? band.toHz : null;
  return { belowHz, aboveHz, ok: belowHz === null && aboveHz === null };
}

/**
 * The band on which a design may actually be judged: the INTERSECTION of the
 * validity of everything that feeds the number.
 *
 * WHY AN INTERSECTION AND NOT A UNION, AND WHY NOT THE DATA'S EXTENT (issue
 * #14): a cost function mixes its inputs, so it is only as trustworthy as its
 * weakest one at any frequency. Taking the extent of the data instead means the
 * evaluation band moves whenever a file happens to reach lower — and once
 * near-field merged responses arrive that reach 15 Hz, the impedance probe, the
 * amplifier-load floor and the repair pass would all change band at once,
 * silently, in the same release as a refactor. A response reaching lower is not
 * the same statement as "this design is now judged lower".
 *
 * `limitedBy` names which source set each edge, because an optimiser that
 * cannot say what band it worked on is not auditable.
 */
export interface EvaluationBand {
  fromHz: number;
  toHz: number;
  /** Which source decided the bottom and the top. */
  limitedBy: { low: string; high: string };
  /** Sources that could not be judged at all — a refusal, not a narrowing. */
  unverified: string[];
  /** One line, ready for the run report. */
  describe: string;
}

export function intersectValidity(
  sources: readonly { name: string; meta: SourceMeta }[],
  requested?: [number, number],
): EvaluationBand | null {
  if (sources.length === 0) return null;
  const unverified = sources.filter((s) => s.meta.verified === false).map((s) => s.name);
  let fromHz = requested ? requested[0] : -Infinity;
  let toHz = requested ? requested[1] : Infinity;
  let low = requested ? 'the requested range' : '';
  let high = requested ? 'the requested range' : '';
  for (const s of sources) {
    const b = s.meta.validity;
    if (b.fromHz !== null && b.fromHz > fromHz) {
      fromHz = b.fromHz;
      low = `${s.name} (${DATA_SOURCE_LABEL[s.meta.dataSource]})`;
    }
    if (b.toHz !== null && b.toHz < toHz) {
      toHz = b.toHz;
      high = `${s.name} (${DATA_SOURCE_LABEL[s.meta.dataSource]})`;
    }
  }
  if (!isFinite(fromHz) || !isFinite(toHz) || !(toHz > fromHz)) return null;
  return {
    fromHz,
    toHz,
    limitedBy: { low, high },
    unverified,
    describe:
      `evaluated on ${Math.round(fromHz)}–${Math.round(toHz)} Hz ` +
      `(bottom set by ${low || 'nothing'}, top by ${high || 'nothing'})` +
      (unverified.length > 0 ? ` · unverified: ${unverified.join(', ')}` : ''),
  };
}

/**
 * The Koan 2951 dataset carries a known inconsistency, on purpose:
 *
 * the far-field SPL was taken with the other woofer left OPEN (so it acts as a
 * passive radiator), while the impedance was measured with both cones driven.
 * Above ~200 Hz the difference is negligible, and below it the near field takes
 * over — so it is documented rather than corrected. A correction here would be
 * a model laid on top of measured data, which is exactly what this app does not
 * do.
 */
export const KOAN_DATASET_NOTES: string[] = [
  'Far-field SPL measured with the other woofer open-circuit (passive radiator); ' +
    'impedance measured with both cones driven. Negligible above ~200 Hz, and below ' +
    'that the near field is used. Documented, not corrected.',
  /* Same category as dataSource: a fact about the measurement that cannot be
   * recovered from the numbers afterwards. It changes how every impedance
   * result on this set must be read, and there is no way to see it in the
   * file. */
  'WOOFERS NOT BROKEN IN — impedance measured 2026-08-16 on new drivers. Fs reads ' +
    '~31 Hz against 24.5 Hz on the datasheet and Vas ~74 L against 88 L, so the ' +
    'suspension is still stiff. The upper impedance peak sits at 52.4 Hz and will ' +
    'MOVE DOWN with use, toward the region where the system minimum lives. Every ' +
    'Z-min figure derived from this set is therefore provisional: building the ' +
    'machinery on it is fine, concluding "2.5 ohm is what is achievable" is not.',
];
