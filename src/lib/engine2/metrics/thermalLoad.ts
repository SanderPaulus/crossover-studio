/**
 * M-M — THE THERMAL LOAD ON A DRIVER, AGAINST ITS OWN RATING (10-09-2026).
 *
 * WHY THIS METRIC EXISTS, and it comes from a measurement rather than a wish.
 * A two-way on casus 1b proposed handovers from 1372 Hz and nothing rejected
 * them. M-C v2.0 judges EXCURSION, and a 25 mm dome is not excursion-bound at
 * its own resonance: its derived ceiling reads −8.58 dB and lets 1294 Hz
 * through without a murmur. What actually threatens a tweeter there is voice
 * coil heat and distortion — and M-C's own register row says so, in as many
 * words, about what its ceiling does not cover.
 *
 * The usual repair is a CONVENTION (18 dB down at f_s, plus margin). That
 * number is on no datasheet. Worse, the fallback the app uses when nobody
 * states one — k·f_s from A5d.3 — is ALSO a convention, worth about 12 dB at
 * every order, so the choice was never "assume nothing" against "state
 * something" but the looser of two conventions against the stricter.
 *
 * M-M replaces both with the figure that IS on the sheet: the rated power and
 * the filter condition it was measured under. On the BlieSMa T25T-6 that is
 * "Rated power handling* 100 W" with "* IEC 268-5, 2nd order high-pass
 * Butterworth filter", and a recommended range starting at 2.2 kHz.
 *
 * THE IDEA IN ONE LINE. A power rating with a filter condition is a statement
 * about WATTS IN THE DRIVER, not about a frequency: run the manufacturer's own
 * test condition through the same weighted integral M-A has used since F1 and
 * it becomes a number of watts the driver is certified to survive. Any other
 * crossover can then be held against that same number, at any system power,
 * with no convention and no per-order conversion.
 *
 * WHY THE RATIO IS ROBUST AND THE WATTS ARE NOT. Both sides of the comparison
 * are computed on the SAME weighting and with the SAME measured impedance, so
 * the model error of using IEC 60268-1's shape where the manufacturer used
 * IEC 268-5's sits in numerator and denominator alike. The fraction is the
 * quantity; the watt is the scaled reading — the shape M-A already carries,
 * for the same reason.
 *
 * WHAT IT DOES NOT DO. It has no id in `GATE_IDS`, it rejects nothing, and it
 * moves no window floor. That is the procedure and not timidity: wiring a
 * metric to the search is a separate decision (spec §A4 procedure, step 6), and
 * a limit earns the right to bite only after it has been measured across the
 * case book. What it does today is put the number beside the conventions that
 * are doing the work.
 *
 * AND WHAT IT CANNOT SAY. The rating is a SURVIVED power under a standardised
 * noise, not a statement about audibility: above it is UNPROVEN, not
 * demonstrably fatal, and the sentence says exactly that. Peak behaviour is
 * not covered either — this integral is a mean, like M-A's; the peak cases are
 * M-C (excursion) and M-L (saturation).
 */

import { trapz } from '../util.ts';
import { iecProgrammeWeight } from './electrical.ts';
import type { Complex } from '../../complex.ts';
import type { NetworkAnalysis } from './types.ts';

/** The estimator version. A behaviour change is a bump (A5e.5). */
export const DRIVER_THERMAL_VERSION = 'driver-thermal/1.0';

/**
 * What the datasheet says, transcribed. Three numbers off one line and its
 * footnote — nothing here is derived and nothing has a default.
 */
export interface DriverPowerRating {
  /** "Rated power handling", W. */
  ratedPowerW: number;
  /** The ORDER of the high-pass the rating was measured through. */
  testFilterOrder: number;
  /** The corner of that filter, Hz. */
  testFilterHz: number;
  /**
   * Where the corner came from. A sheet often names the ORDER in its footnote
   * and not the FREQUENCY; reading it off the recommended crossover range is
   * an ASSUMPTION about what was tested, and A3h says an assumption travels
   * with the number rather than being quietly promoted to a fact.
   */
  testFilterHzSource?: string;
  /** Where the whole rating came from — the sheet, and when it was read. */
  source?: string;
}

export interface ThermalLoadResult {
  /** Driver model, as the analysis keys it. */
  driver: string;
  /** The driver's share of the accepted power in the DELIVERED network. */
  deliveredFraction: number | null;
  /** That share at the stated continuous power, W. */
  deliveredWatts: number | null;
  /** The same share in the manufacturer's own test condition. */
  certifiedFraction: number | null;
  /** The watts the rating certifies: rated power × certified fraction. */
  certifiedWatts: number | null;
  /** delivered ÷ certified. Above 1 is UNPROVEN, not proven fatal. */
  ratio: number | null;
  /** The rating as transcribed, or null when none was stated. */
  rating: DriverPowerRating | null;
  /** Why the metric is off, when it is. Null when it produced a figure. */
  reason: string | null;
  /** One sentence for the panel — always present. */
  note: string;
}

/** Re(1/Z) — the conductance the generator drives through this impedance. */
const conductance = (z: Complex): number => {
  const d = z.re * z.re + z.im * z.im;
  return d > 0 ? z.re / d : 0;
};

/** |B_n(f)|² for a Butterworth high-pass of order `n` cornered at `fc`. */
export const butterworthHighPassPowerGain = (fHz: number, fcHz: number, order: number): number =>
  fHz > 0 ? 1 / (1 + (fcHz / fHz) ** (2 * order)) : 0;

/**
 * M-M for one driver model.
 *
 * `continuousPowerW` is the power the WATT columns are reported at (V50's
 * `amplifierPowerW`), and it is required for the ratio: comparing a delivered
 * fraction with a certified fraction is only the same question when the two
 * powers are equal, and the app may not assume they are.
 */
export function driverThermalLoad(
  analysis: NetworkAnalysis,
  driver: string,
  rating: DriverPowerRating | null | undefined,
  continuousPowerW: number | null | undefined,
  weight: (fHz: number) => number = iecProgrammeWeight,
): ThermalLoadResult {
  const off = (reason: string): ThermalLoadResult => ({
    driver,
    deliveredFraction: null,
    deliveredWatts: null,
    certifiedFraction: null,
    certifiedWatts: null,
    ratio: null,
    rating: rating ?? null,
    reason,
    note: `M-M off for ${driver}: ${reason}`,
  });

  const { grid, driverZ, transferByModel } = analysis;
  const z = driverZ[driver];
  const h = transferByModel[driver];
  if (!z || !h) return off('this branch has no solved transfer or no measured impedance');

  /* `grid.map((f) => weight(f))` and NOT `grid.map(weight)`: Array.map passes
   * (value, index, array), and `iecProgrammeWeight(f, hpHz, lpHz)` would take
   * the INDEX as its high-pass corner — 0 on the first point, so every weight
   * comes back NaN. M-A wraps it for the same reason; the hand calculation in
   * the test caught it here. */
  const w = grid.map((f) => weight(f));

  /* ---- ONE DENOMINATOR FOR BOTH SIDES, and it is the whole of why this
   * metric can be trusted at all ---------------------------------------------
   *
   * The two figures differ in ONE thing — the high-pass in front of the driver
   * — and in nothing else: same spectrum, same measured impedance, same
   * normalisation. So both are expressed as a share of what THIS DRIVER would
   * take UNFILTERED, and the ratio of the two is a comparison of two filters
   * rather than of two models.
   *
   * The first version of this module normalised the delivered side on the
   * SYSTEM's accepted power and the certified side on the driver's own, and
   * the ratio was then a comparison of two different denominators. It read
   * 0.14 where it should read about 1, and the golden probe on casus 1 is what
   * caught it — which is what the procedure's step 4 exists for. */
  const bareIntegrand = grid.map((_, i) => w[i] * conductance(z[i]));
  const bare = trapz(grid, bareIntegrand);
  if (!(bare > 0)) return off('this driver accepts no power on this grid');

  /* `transferByModel` is ALREADY V_driver/Eg (the element CURRENTS are the
   * ones carried at the generator's own Eg, which is why M-A divides those by
   * it and this does not). */
  const deliveredFraction =
    trapz(
      grid,
      grid.map((_, i) => {
        const mag = Math.hypot(h[i].re, h[i].im);
        return w[i] * mag * mag * conductance(z[i]);
      }),
    ) / bare;

  if (!rating) {
    return {
      ...off('no power rating stated for this driver — the datasheet figure and its test filter'),
      deliveredFraction,
      deliveredWatts:
        continuousPowerW !== null && continuousPowerW !== undefined && continuousPowerW > 0
          ? deliveredFraction * continuousPowerW
          : null,
      note:
        `M-M: ${driver} takes ${(100 * deliveredFraction).toFixed(2)} % of the accepted power, ` +
        'and nothing judges it — state the rated power and the filter it was rated through.',
    };
  }
  if (!(rating.ratedPowerW > 0)) return off('the stated rated power is not a positive number of watts');
  if (!(rating.testFilterOrder > 0)) return off('the stated test filter has no order');
  if (!(rating.testFilterHz > 0)) return off('the stated test filter has no corner frequency');

  /* THE TEST CONDITION, on the same weighting and the same measured impedance:
   * this driver alone behind an ideal Butterworth high-pass. The denominator
   * is the driver UNFILTERED, so the fraction is "what the filter leaves of
   * the power this driver would otherwise take" — which is what a rating
   * measured through that filter is a statement about. */
  const filtered = trapz(
    grid,
    grid.map((f, i) => bareIntegrand[i] * butterworthHighPassPowerGain(f, rating.testFilterHz, rating.testFilterOrder)),
  );
  const certifiedFraction = filtered / bare;
  const certifiedWatts = rating.ratedPowerW * certifiedFraction;

  const hasP = continuousPowerW !== null && continuousPowerW !== undefined && continuousPowerW > 0;
  const deliveredWatts = hasP ? deliveredFraction * continuousPowerW! : null;
  const ratio = deliveredWatts !== null && certifiedWatts > 0 ? deliveredWatts / certifiedWatts : null;

  const where = rating.testFilterHzSource ? ` (${rating.testFilterHzSource})` : '';
  const cond =
    `rated ${rating.ratedPowerW} W through an order-${rating.testFilterOrder} high-pass at ` +
    `${Math.round(rating.testFilterHz)} Hz${where} = ${certifiedWatts.toFixed(2)} W in the driver`;
  const note =
    ratio === null
      ? `M-M: ${cond}; no continuous power stated, so there is nothing to hold the delivered load against.`
      : ratio <= 1
        ? `M-M: ${deliveredWatts!.toFixed(2)} W in ${driver} against ${certifiedWatts.toFixed(2)} W certified — ${cond}.`
        : `M-M: ${deliveredWatts!.toFixed(2)} W in ${driver} against ${certifiedWatts.toFixed(2)} W certified, ` +
          `${ratio.toFixed(2)}× — UNPROVEN, not proven fatal: the rating is a survived power under a ` +
          `standardised noise, and above it the manufacturer has shown nothing. ${cond}.`;

  return {
    driver,
    deliveredFraction,
    deliveredWatts,
    certifiedFraction,
    certifiedWatts,
    ratio,
    rating,
    reason: ratio === null ? 'no continuous power stated, so the watts cannot be compared' : null,
    note,
  };
}
