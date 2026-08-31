/**
 * A5e.2 — THE TARGET LEVEL AS A CURVE, with one interpolator and two readers.
 *
 * WHY THIS FILE EXISTS, and it is the shape `phaseAdmission.ts` established at
 * V44 and `impedanceFloor.ts` before it. A target curve is an engine-v2 idea
 * (A5e.2: the voicing a design is judged against), but the moment it is allowed
 * to steer the SEARCH the tuner has to read it too — and the tuner may not
 * import from `engine2/`, because the toggle invariant rests on that arrow
 * pointing one way and `toggleRegression.test.ts` scans the tree to prove it.
 *
 * So the VOCABULARY stays in `engine2/requirements/targetCurve.ts` — which
 * shapes exist, which are implemented, what a project may state — and what
 * crosses to the tuner is what this file declares: a sampled curve of level
 * OFFSETS, plus the one rule for reading it at a frequency that is not one of
 * its samples.
 *
 * OFFSETS AND NOT LEVELS, deliberately. What a window or an RMS deviation is
 * about is the SHAPE; an absolute level would drag the sensitivity of the whole
 * loudspeaker into a judgement about flatness. Every consumer subtracts these
 * offsets from a measured response and then judges the remainder however it
 * already did — which is what makes "absent = the historic behaviour" exactly
 * true rather than nearly true (a curve of zeroes is the identity).
 */

/**
 * A target curve as it crosses to a consumer: level offsets in dB, sampled on
 * a frequency grid, monotonically increasing in frequency.
 *
 * Plain data, because it goes through `postMessage` and into a run
 * fingerprint. `freqHz` and `db` are the same length; a curve where they are
 * not is a caller's bug and `targetLevelAt` refuses it rather than reading past
 * the end of one of them.
 */
export interface TargetLevelCurve {
  freqHz: readonly number[];
  db: readonly number[];
}

/**
 * The target offsets at an arbitrary set of frequencies.
 *
 * LOG-DOMAIN LINEAR INTERPOLATION, and CLAMPED at both ends. The clamp is the
 * decision worth writing down: a target curve is a statement about the whole
 * audible range, so below its first sample the honest reading is its first
 * value and above its last sample its last value. Extrapolating the local slope
 * would let a shelf keep falling forever under the lowest sample, which is a
 * target nobody stated.
 *
 * Interpolated by FREQUENCY rather than indexed by position, because the
 * consumers do not share a grid: the tuner evaluates its objective on a
 * decimated grid and its reports on the full one, and an offsets array indexed
 * by position would silently mean two different curves on those two grids.
 *
 * Returns all-zero — the identity — for an empty curve, so a caller that has
 * nothing to say says nothing rather than shifting a response.
 */
export function targetLevelAt(
  curve: TargetLevelCurve,
  freqHz: readonly number[],
): number[] {
  const n = Math.min(curve.freqHz.length, curve.db.length);
  if (n === 0) return freqHz.map(() => 0);
  if (n === 1) return freqHz.map(() => curve.db[0]);
  return freqHz.map((f) => {
    if (!(f > 0) || f <= curve.freqHz[0]) return curve.db[0];
    if (f >= curve.freqHz[n - 1]) return curve.db[n - 1];
    // Binary search for the bracketing pair; the grids these run on are a few
    // hundred to a few thousand points and the objective asks per evaluation.
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (curve.freqHz[mid] <= f) lo = mid;
      else hi = mid;
    }
    const f0 = curve.freqHz[lo];
    const f1 = curve.freqHz[hi];
    if (!(f1 > f0) || !(f0 > 0)) return curve.db[lo];
    const t = Math.log(f / f0) / Math.log(f1 / f0);
    return curve.db[lo] + t * (curve.db[hi] - curve.db[lo]);
  });
}

/**
 * True when this curve would shift anything at all.
 *
 * Used to keep "stated but flat" from looking different to a reader than
 * "nothing stated": both are the identity, and a run that carries a curve of
 * zeroes searched exactly the field a run that carried none searched.
 */
export function isFlatTargetLevel(curve: TargetLevelCurve): boolean {
  const n = Math.min(curve.freqHz.length, curve.db.length);
  for (let i = 0; i < n; i++) if (curve.db[i] !== 0) return false;
  return true;
}
