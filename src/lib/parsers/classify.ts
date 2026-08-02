/**
 * Content-based sanity check on what a measurement file claims to be.
 *
 * The import picks its parser purely by extension, and FRD and ZMA are the
 * same three columns — so an impedance export named `.txt` loads as a
 * response with ohms in the dB column, silently: no error, just a driver
 * that "plays" at ~7 dB. The level profile tells the two apart with a wide
 * gap: driver |Z| lives in single-to-low-double-digit ohms (median well
 * under 45 even with a 60 Ω Fs peak), measured SPL lives at 60–140 dB.
 *
 * Doctrine (roadmap, jul 2026): SIGNAL, never auto-switch — a second silent
 * decision is not the cure for the first. Callers warn loudly on a confident
 * mismatch and still load the file as asked; the `ambiguous` band in between
 * never complains.
 */

export interface LevelClassification {
  kind: 'impedance' | 'spl' | 'ambiguous';
  /** Median of the level column, for the warning message. */
  medianLevel: number;
}

/** Above this median the values cannot plausibly be a driver's |Z| in ohms. */
const SPL_MIN_MEDIAN = 60;
/** Below this median (all-positive) the values cannot plausibly be SPL in dB. */
const IMPEDANCE_MAX_MEDIAN = 45;

export function classifyLevelProfile(values: readonly number[]): LevelClassification {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { kind: 'ambiguous', medianLevel: NaN };
  const sorted = [...finite].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  // |Z| ≤ 0 is physically impossible; dB happily goes negative (normalized
  // responses) — one non-positive value settles it.
  if (sorted[0] <= 0) return { kind: 'spl', medianLevel: median };
  if (median > SPL_MIN_MEDIAN) return { kind: 'spl', medianLevel: median };
  if (median < IMPEDANCE_MAX_MEDIAN) return { kind: 'impedance', medianLevel: median };
  return { kind: 'ambiguous', medianLevel: median };
}
