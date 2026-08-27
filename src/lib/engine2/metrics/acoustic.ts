/**
 * A4 — the metrics that live in the ACOUSTIC domain: M-D, M-F final, M-G and
 * M-H. M-F INTERIM MOVED OUT AT V20, to `lobing.ts`: it stopped being one
 * scored number and became four reported fractions, and the file it left
 * behind is about metrics that produce a verdict-shaped answer.
 *
 * Every band in this file is derived from something the ingest pass measured:
 * M-D's evaluation band from the upper impedance peak, M-G's margin from the
 * measured off-axis pair, M-H's ceiling from the detected breakup. There is no
 * frequency here to hard-code (P6), and nothing counts drivers (N-way).
 *
 * ONE OF THESE IS EXPLICITLY UNFINISHED AND SAYS SO IN ITS OWN OUTPUT. M-H's
 * severity weighting interpolates between the two published endpoints
 * (f/3 for a severe peak, f/2 for a mild one) and the curve between them is
 * a placeholder waiting on HD measurements (spec V6/V9). It is marked
 * uncalibrated at the type level so the marking cannot be lost on the way to
 * the screen — V9 found the whole upper crossover window of casus 1 hanging
 * off exactly this curve.
 */

import {
  BREAKUP_DIV_MILD,
  BREAKUP_DIV_SEVERE,
  BREAKUP_FULL_SEVERITY_DB,
  SPEED_OF_SOUND_M_S,
} from '../constants.ts';
import { cabs, dbAmp, degToRad, interpLog, octavesBetween } from '../util.ts';
import { coverageOf, type Coverage } from '../ingest/validity.ts';
import type { Complex } from '../../complex.ts';
import type { Persistence } from '../ingest/spl.ts';

/* ================================================================== *
 * M-D — low-frequency lift on the driver resonance
 * ================================================================== */

/**
 * A4's derivation of M-D's evaluation band and reference, as ratios of the
 * upper impedance peak f_p. Dimensionless by construction: the band moves with
 * the measurement, which is the whole point of deriving it.
 */
const MD_BAND_LOW_OVER_FP = 0.7;
const MD_BAND_HIGH_OVER_FP = 2.2;
const MD_REFERENCE_OVER_FP = 3;

export interface LfBumpResult {
  /** Extra lift the filter + source impedance add on top of the bare box, dB. */
  extraDb: number;
  /** The bare box's own lift over the same band, dB — the thing it adds to. */
  bareDb: number;
  /** Where the loaded maximum sits. */
  atHz: number;
  /** Evaluation band, derived from f_p. */
  bandHz: [number, number];
  /** Normalisation reference, derived from f_p. */
  referenceHz: number;
  fPeakHz: number;
  coverage: Coverage;
  notes: string[];
}

/**
 * `max over B of [NF·H_el] − max over B of [NF]`, both normalised at f_ref.
 *
 * The near-field response IS the bare box: it carries the enclosure's own
 * alignment and nothing else. Subtracting the bare maximum is what makes this
 * a statement about the FILTER rather than about the cabinet — a ported box
 * with a lively tuning would otherwise fail a metric that has nothing to do
 * with the crossover.
 */
export function lfBump(
  nfGrid: readonly number[],
  nfDb: readonly number[],
  hGrid: readonly number[],
  hEl: readonly Complex[],
  fPeakHz: number,
  opts: {
    validHz?: [number, number];
    belowHz?: number;
    /**
     * EXPLICIT band and normalisation frequency, replacing the derivation from
     * f_p. Exists for one purpose and it is not an escape hatch: reproducing a
     * WITHDRAWN reference whose band belonged to one measurement session.
     *
     * A4 M-C's function has taken its passband as an argument since F1 for the
     * same reason, and the V15 process rule is why — a reference that depends
     * on a band records that band, and a test can only check the record if the
     * metric can be fed it. Nothing in the engine passes these; the golden
     * suite does, and says whose numbers it is reproducing.
     */
    overrideBandHz?: [number, number];
    overrideReferenceHz?: number;
  } = {},
): LfBumpResult | null {
  const notes: string[] = [];
  const band: [number, number] = opts.overrideBandHz
    ? [opts.overrideBandHz[0], opts.overrideBandHz[1]]
    : [MD_BAND_LOW_OVER_FP * fPeakHz, MD_BAND_HIGH_OVER_FP * fPeakHz];
  let reference = opts.overrideReferenceHz ?? MD_REFERENCE_OVER_FP * fPeakHz;

  const valid = opts.validHz;
  if (valid && reference > valid[1]) {
    reference = valid[1];
    notes.push(
      `The derived reference ${(MD_REFERENCE_OVER_FP * fPeakHz).toFixed(0)} Hz lies above the ` +
        `near-field validity ceiling; normalised at ${reference.toFixed(0)} Hz instead.`,
    );
  }
  if (opts.belowHz !== undefined && reference > opts.belowHz) {
    reference = opts.belowHz;
    notes.push(
      `The derived reference lies above this way's crossover; normalised at ` +
        `${reference.toFixed(0)} Hz instead, inside the passband.`,
    );
  }
  if (valid && (band[0] < valid[0] || band[1] > valid[1])) {
    notes.push(
      `Evaluation band ${band[0].toFixed(0)}-${band[1].toFixed(0)} Hz is not fully covered by the ` +
        'near-field measurement; the coverage figure says how much of it was seen.',
    );
  }

  const hDbAt = (f: number): number => dbAmp(cabs(hEl[nearest(hGrid, f)]));
  const nfAt = (f: number): number => interpLog(nfGrid, nfDb, f);
  const nfRef = nfAt(reference);
  const hRef = hDbAt(reference);

  let bare = -Infinity;
  let loaded = -Infinity;
  let atHz = band[0];
  let seen = 0;
  const lo = valid ? Math.max(band[0], valid[0]) : band[0];
  const hi = valid ? Math.min(band[1], valid[1]) : band[1];
  for (const f of nfGrid) {
    if (f < lo || f > hi) continue;
    seen++;
    const b = nfAt(f) - nfRef;
    const l = b + (hDbAt(f) - hRef);
    if (b > bare) bare = b;
    if (l > loaded) {
      loaded = l;
      atHz = f;
    }
  }
  if (seen === 0) return null;

  return {
    extraDb: loaded - bare,
    bareDb: bare,
    atHz,
    bandHz: band,
    referenceHz: reference,
    fPeakHz,
    coverage: coverageOf(band, {
      fromHz: lo,
      toHz: hi,
      fromBy: 'near-field measurement',
      toBy: 'near-field validity ceiling',
    }),
    notes,
  };
}

const nearest = (grid: readonly number[], f: number): number => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < grid.length; i++) {
    const d = Math.abs(Math.log(grid[i] / f));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

/* ================================================================== *
 * M-F final — vertical synthesis from the measurements
 * ================================================================== */

export interface VerticalSource {
  driver: string;
  /** Measured complex pressure on the reference axis, on the shared grid. */
  pressure: readonly Complex[];
  /** Electrical transfer of this driver's branch, on the same grid. */
  transfer: readonly Complex[];
  /** Acoustic-centre offset along the vertical axis, metres. */
  zM: number;
  /** False when this driver's radiation is known NOT to be rotationally
   *  symmetric — the point-source assumption is then a documented limitation. */
  rotationallySymmetric: boolean;
}

export interface VerticalLobingResult {
  angles: number[];
  grid: number[];
  /** Deviation from the on-axis sum, dB: [angleIndex][gridIndex]. */
  deviationDb: number[][];
  /** Deepest dip over the window and where. */
  worstDipDb: number;
  worstAtHz: number;
  worstAtDeg: number;
  /** Same, restricted to the crossover region the caller named. */
  worstDipInCrossoverDb: number | null;
  worstInCrossoverAtHz: number | null;
  /** TRUE when every contributing driver is flagged rotationally symmetric. */
  pointSourceAssumptionSafe: boolean;
  limitations: string[];
  coverage: Coverage;
}

/**
 * `P(θ,f) = Σ_i P_i(f)·H_i(f)·e^{+j·k·z_i·sinθ}`.
 *
 * THE LIMITATION IS PART OF THE RESULT, per A4: each driver is treated as a
 * point source at its acoustic centre, so a driver's OWN vertical directivity
 * — a tall cone, a waveguide — is not in here. That is fine for the question
 * this answers (does the SUM of the branches collapse off axis) and wrong for
 * the question it looks like it answers (what does the speaker do at 15°). The
 * flag travels with the number so the difference cannot be lost.
 */
export function verticalLobing(
  grid: readonly number[],
  sources: readonly VerticalSource[],
  anglesDeg: readonly number[],
  crossoverRegionHz: [number, number] | null,
  band: [number, number],
): VerticalLobingResult | null {
  if (sources.length === 0 || anglesDeg.length === 0) return null;
  /* THE COPLANAR DEGENERATE (F3b, deliverable 4b).
   *
   * This metric is a sum of sources at different heights: the whole content of
   * the answer is the PATH DIFFERENCE k·z_i·sinθ between them. Give it one
   * source, or several at the same z, and every angle sees the same sum as the
   * axis does — so it returns exactly 0.0 dB of deviation, at every angle and
   * every frequency.
   *
   * That number is not a finding. It is the metric reporting the arithmetic of
   * its own missing input, and it reads like the best possible result: "no
   * vertical collapse anywhere". Refusing is the only honest answer, and the
   * refusal has to live HERE rather than in the caller, because a caller that
   * forgot the check would publish the flattering zero. */
  const zs = sources.map((s) => s.zM);
  if (Math.max(...zs) - Math.min(...zs) === 0) return null;

  const sumAt = (thetaDeg: number): Complex[] => {
    const s = Math.sin(degToRad(thetaDeg));
    return grid.map((f, i) => {
      const k = (2 * Math.PI * f) / SPEED_OF_SOUND_M_S;
      let re = 0;
      let im = 0;
      for (const src of sources) {
        const p = src.pressure[i];
        const h = src.transfer[i];
        // p·h
        const ar = p.re * h.re - p.im * h.im;
        const ai = p.re * h.im + p.im * h.re;
        const phase = k * src.zM * s;
        const cr = Math.cos(phase);
        const ci = Math.sin(phase);
        re += ar * cr - ai * ci;
        im += ar * ci + ai * cr;
      }
      return { re, im };
    });
  };

  const onAxis = sumAt(0).map((z) => dbAmp(cabs(z)));
  const angles = [...anglesDeg];
  const deviation = angles.map((a) => sumAt(a).map((z, i) => dbAmp(cabs(z)) - onAxis[i]));

  let worst = Infinity;
  let worstF = grid[0];
  let worstA = angles[0];
  let worstXo: number | null = null;
  let worstXoF: number | null = null;
  for (let a = 0; a < angles.length; a++) {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < band[0] || grid[i] > band[1]) continue;
      const v = deviation[a][i];
      if (v < worst) {
        worst = v;
        worstF = grid[i];
        worstA = angles[a];
      }
      if (crossoverRegionHz && grid[i] >= crossoverRegionHz[0] && grid[i] <= crossoverRegionHz[1]) {
        if (worstXo === null || v < worstXo) {
          worstXo = v;
          worstXoF = grid[i];
        }
      }
    }
  }

  const asymmetric = sources.filter((s) => !s.rotationallySymmetric).map((s) => s.driver);
  return {
    angles,
    grid: [...grid],
    deviationDb: deviation,
    worstDipDb: Number.isFinite(worst) ? worst : NaN,
    worstAtHz: worstF,
    worstAtDeg: worstA,
    worstDipInCrossoverDb: worstXo,
    worstInCrossoverAtHz: worstXoF,
    pointSourceAssumptionSafe: asymmetric.length === 0,
    limitations: [
      'Each driver is a point source at its acoustic centre: its own vertical directivity ' +
        '(tall cone, waveguide) is not represented.',
      ...(asymmetric.length
        ? [
            `Not rotationally symmetric, so the point-source assumption is weakest here: ` +
              `${asymmetric.join(', ')}.`,
          ]
        : []),
    ],
    coverage: coverageOf(band, {
      fromHz: Math.max(band[0], grid[0]),
      toHz: Math.min(band[1], grid[grid.length - 1]),
      fromBy: 'measurement validity',
      toBy: 'measurement validity',
    }),
  };
}

/* ================================================================== *
 * M-G — directivity match
 * ================================================================== */

export interface DirectivityMatchResult {
  lower: string;
  upper: string;
  angleDeg: number;
  /** −6 dB@θ of the LOWER driver: the classic ceiling for the crossing. */
  lowerMinus6Hz: number | null;
  lowerMinus3Hz: number | null;
  crossingHz: number | null;
  /** Octaves of headroom below the ceiling; negative = the crossing is above it. */
  marginOctaves: number | null;
  /**
   * When BOTH drivers have off-axis data, the two-sided DI-continuity band A4
   * asks for: where the two directivity curves are within reach of each other.
   * Null when only the lower driver was measured off axis.
   */
  diMatchBandHz: [number, number] | null;
  notes: string[];
}

/**
 * A4 M-G. The one-sided form is the vocational rule ("cross below the lower
 * driver's −6 dB@30° point") turned into a REPORTED MARGIN rather than a
 * verdict. The two-sided form is the sharper statement A4 makes: what actually
 * matters is DI continuity, and a step in directivity at the crossing is a
 * power-response anomaly that no equalisation repairs.
 */
export function directivityMatch(
  lower: string,
  upper: string,
  angleDeg: number,
  lowerCurve: { minus3Hz: number | null; minus6Hz: number | null } | null,
  crossingHz: number | null,
  bothSided: { grid: readonly number[]; lowerDiffDb: readonly number[]; upperDiffDb: readonly number[] } | null,
  toleranceDb: number,
): DirectivityMatchResult {
  const notes: string[] = [];
  const ceiling = lowerCurve?.minus6Hz ?? null;
  const margin =
    ceiling !== null && crossingHz !== null ? octavesBetween(crossingHz, ceiling) : null;
  if (ceiling === null) {
    notes.push(
      `No off-axis measurement for ${lower}: the directivity ceiling of the lower driver cannot ` +
        'be derived, so M-G reports no margin.',
    );
  }

  let band: [number, number] | null = null;
  if (bothSided) {
    let lo: number | null = null;
    let hi: number | null = null;
    for (let i = 0; i < bothSided.grid.length; i++) {
      if (Math.abs(bothSided.lowerDiffDb[i] - bothSided.upperDiffDb[i]) <= toleranceDb) {
        if (lo === null) lo = bothSided.grid[i];
        hi = bothSided.grid[i];
      }
    }
    band = lo !== null && hi !== null ? [lo, hi] : null;
    if (band === null) {
      notes.push(
        'Both drivers were measured off axis, but their directivity never comes within ' +
          `${toleranceDb} dB of each other: there is no DI-continuous crossing region.`,
      );
    }
  } else {
    notes.push(
      'Only one driver of this pair has off-axis data: M-G reports the one-sided ceiling, not ' +
        'the two-sided DI-continuity band (A4 M-G).',
    );
  }

  return {
    lower,
    upper,
    angleDeg,
    lowerMinus6Hz: ceiling,
    lowerMinus3Hz: lowerCurve?.minus3Hz ?? null,
    crossingHz,
    marginOctaves: margin,
    diMatchBandHz: band,
    notes,
  };
}

/* ================================================================== *
 * M-H — breakup distance, with severity weighting
 * ================================================================== */

/**
 * The severity-weighted divisor for a breakup peak.
 *
 * ⚠ UNCALIBRATED. The two ENDPOINTS are the published rule — divide by 3 for a
 * severe peak, by 2 for a mild one. The ramp between them is a placeholder
 * that needs harmonic-distortion measurements to become real, and every caller
 * is required to carry that statement into its output.
 */
export function breakupDivisor(peakDb: number): number {
  if (peakDb >= BREAKUP_FULL_SEVERITY_DB) return BREAKUP_DIV_SEVERE;
  const t = Math.max(0, peakDb) / BREAKUP_FULL_SEVERITY_DB;
  return BREAKUP_DIV_MILD + t * (BREAKUP_DIV_SEVERE - BREAKUP_DIV_MILD);
}

export interface BreakupDistanceResult {
  driver: string;
  breakupHz: number;
  peakDb: number;
  q: number | null;
  /** The severity-weighted divisor actually used. */
  divisor: number;
  /** Ceiling for a crossing that has to keep this resonance quiet. */
  ceilingHz: number;
  crossingHz: number | null;
  /** Octaves of headroom under the ceiling; negative = the crossing is above. */
  marginOctaves: number | null;
  /** Electrical suppression the loaded filter delivers AT the breakup, dB. */
  electricalSuppressionDb: number | null;
  /** Directional persistence, when an off-axis measurement exists. */
  persistence: Persistence | null;
  notes: string[];
  uncalibrated: string;
}

/**
 * A4 M-H.
 *
 * THE INSIGHT THAT MAKES THIS A DISTANCE AND NOT A NOTCH: the distortion is
 * generated INSIDE the driver, after the filter. A notch on the breakup
 * flattens the measured response and does nothing about the mechanism. So the
 * metric is the DISTANCE of the crossing from the resonance, and the linear
 * sub-report (how much the filter attenuates there) is reported beside it as
 * context — never as a substitute.
 */
export function breakupDistance(
  driver: string,
  peak: { fHz: number; dB: number; q: number | null },
  crossingHz: number | null,
  electricalSuppressionDb: number | null,
  persistence: Persistence | null,
): BreakupDistanceResult {
  const divisor = breakupDivisor(peak.dB);
  const ceiling = peak.fHz / divisor;
  const notes: string[] = [];
  if (persistence) {
    notes.push(
      persistence.persistent
        ? `Holds or grows at ${persistence.angleDeg} deg (${persistence.deltaDb >= 0 ? '+' : ''}` +
          `${persistence.deltaDb.toFixed(1)} dB): a real cone resonance with power-response weight, ` +
          'so its severity goes UP, not down.'
        : `Collapses at ${persistence.angleDeg} deg (${persistence.deltaDb.toFixed(1)} dB): ` +
          'interference or diffraction rather than a cone resonance - severity down.',
    );
  }
  if (electricalSuppressionDb !== null) {
    notes.push(
      `The filter attenuates ${electricalSuppressionDb.toFixed(1)} dB at the breakup. That is the ` +
        'LINEAR part only: the distortion is generated in the driver, after the filter, so this ' +
        'number never substitutes for distance.',
    );
  }
  return {
    driver,
    breakupHz: peak.fHz,
    peakDb: peak.dB,
    q: peak.q,
    divisor,
    ceilingHz: ceiling,
    crossingHz,
    marginOctaves: crossingHz !== null ? octavesBetween(crossingHz, ceiling) : null,
    electricalSuppressionDb,
    persistence,
    notes,
    uncalibrated:
      'Severity weighting is UNCALIBRATED: only the endpoints (f/3 severe, f/2 mild) are ' +
      'published; the ramp between them waits on harmonic-distortion measurements (spec V6/V9).',
  };
}
