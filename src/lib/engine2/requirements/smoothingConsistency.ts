/**
 * SMOOTHING CONSISTENCY — the tuner's resolution beside the acceptance
 * resolution (F3c, deliverable 3).
 *
 * Two different questions are asked of the same response, at two different
 * resolutions, and both are right to be asked that way:
 *
 *  - The v1 tuner SEARCHES on its error smoothing (`errorSmoothOct`, a
 *    designer preference, 1/12 oct by default). That width exists so that
 *    diffraction ripple and measurement noise no filter can fix stop steering
 *    a search.
 *  - The v2 SPL-window requirement JUDGES on `WINDOW_SMOOTHING_OCTAVES`
 *    (A5e.1, 1/6 oct). That width exists because the window asks "is this
 *    acceptable", which is a question about the shape a listener hears.
 *
 * When those two differ, a design can be tuned to a flatness the acceptance
 * pass does not see, or refused for a feature the tuner never scored. That is
 * a legitimate configuration, not a defect — the whole point of two widths is
 * that they answer different questions — but it is a SILENT one, and a silent
 * disagreement between the thing that searches and the thing that accepts is
 * exactly the class of failure this project keeps writing tests about.
 *
 * SO: ONE LINE, AND ONLY A LINE. Nothing here changes a setting, couples the
 * two numbers, blocks a run or scores a candidate. It reports that the two
 * widths differ and what each of them is. If a designer wants them equal they
 * have a select box; if they want them different they have a reason, and the
 * app has no business guessing which.
 */

import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';

/**
 * How close two widths have to be to count as the same number.
 *
 * The tuner's width round-trips through `localStorage` as a decimal string, so
 * `1/6` comes back as `0.16666666666666666` and compares equal — but a width
 * that arrived along some other path should not produce a warning about a
 * difference in the fifteenth decimal.
 */
const SAME_WIDTH_EPS = 1e-9;

/**
 * Print an octave width the way the dialog's own select box prints it.
 *
 * Fractions, because that is how the designer chose it and how every
 * loudspeaker text writes it; a line that said "0.083 oct" beside a menu that
 * says "1/12 oct" would make the reader check whether they are the same thing.
 */
export function formatOctaves(oct: number): string {
  if (!Number.isFinite(oct) || oct <= 0) return 'off (raw points)';
  const inverse = 1 / oct;
  const rounded = Math.round(inverse);
  return rounded > 0 && Math.abs(inverse - rounded) < SAME_WIDTH_EPS
    ? `1/${rounded} oct`
    : `${oct.toFixed(3)} oct`;
}

export interface SmoothingNotice {
  /** The width the v1 tuner searches on. Null when it was not stated. */
  tunerOctaves: number | null;
  /** The width the v2 window requirement judges on (A5e.1). */
  acceptanceOctaves: number;
  /** True when the two differ and the line is shown. */
  mismatch: boolean;
  /** The line. Null when there is nothing to say. */
  message: string | null;
}

/**
 * The notice for one run, from the tuner's stated width.
 *
 * A width that was not stated produces NO notice. "The tuner is at some width
 * we did not read" and "the two agree" are different statements, and only the
 * first one is true in that case — so nothing is said, exactly as an
 * underivable window says nothing.
 */
export function smoothingConsistency(
  tunerOctaves: number | null | undefined,
): SmoothingNotice {
  const acceptanceOctaves = WINDOW_SMOOTHING_OCTAVES;
  if (tunerOctaves === null || tunerOctaves === undefined || !Number.isFinite(tunerOctaves)) {
    return { tunerOctaves: null, acceptanceOctaves, mismatch: false, message: null };
  }
  const mismatch = Math.abs(tunerOctaves - acceptanceOctaves) > SAME_WIDTH_EPS;
  return {
    tunerOctaves,
    acceptanceOctaves,
    mismatch,
    message: mismatch
      ? `the tuner searches on ${formatOctaves(tunerOctaves)}; acceptance judges on ` +
        `${formatOctaves(acceptanceOctaves)} (A5e.1). Neither setting moves the other — ` +
        'this line is here so the difference is not a silent one.'
      : null,
  };
}
