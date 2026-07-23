/**
 * Domain types shared across the app. Measurements are stored as parallel
 * arrays (freq / value) rather than arrays of points: this matches how FRD/ZMA
 * files are laid out, keeps them compact, and is the natural input shape for
 * the DSP routines (interpolation, FFT, MNA) that come later.
 */

/** Raw comment/header lines from a REW export, plus any fields we recognised. */
export interface RewMetadata {
  /** Every comment line, verbatim and in order (leading marker stripped). */
  rawComments: string[];
  /** REW version string if present, e.g. "5.20.14". */
  rewVersion?: string;
  /**
   * Bulk timing offset REW applied to this measurement, in milliseconds, if a
   * recognisable field was found in the header. Positive = the response is
   * delayed (driver's acoustic centre is further from the mic / later in time).
   *
   * This is the value the acoustic-integration work hinges on, and exactly the
   * value the sanity-check in `timing.ts` cross-validates against the phase.
   */
  timingOffsetMs?: number;
  /** Source line the timing offset was parsed from, for traceability. */
  timingOffsetSource?: string;
}

/** Single-driver frequency response (from an `.frd` file). */
export interface FrdMeasurement {
  freq: number[]; // Hz, strictly ascending
  spl: number[]; // dB SPL
  phase: number[]; // degrees, as stored in the file (may be wrapped)
  meta: RewMetadata;
}

/** Impedance magnitude/phase response (from a `.zma` file). */
export interface ZmaMeasurement {
  freq: number[]; // Hz, strictly ascending
  magnitude: number[]; // ohms
  phase: number[]; // degrees
  meta: RewMetadata;
}
