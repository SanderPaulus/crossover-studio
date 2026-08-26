/**
 * A5e.2 — THE TARGET CURVE, decided at F3 and deliberately minimal.
 *
 * The voicing principle in A4 says it plainly: "muzikaal" is a response
 * choice, not a filter-order property, and it belongs in an explicit target
 * curve that the SPL judgement reckons against — never as a side effect of
 * slope ideology. This module is that object.
 *
 * WHAT IS HERE: `flat`, and it works.
 *
 * WHAT IS DECLARED AND DOES NOTHING: `tilt` and `hold-current`. They exist in
 * the type so that a project can be written, read and versioned against the
 * finished vocabulary, and `evaluateTargetCurve` REFUSES them rather than
 * approximating. A half-working tilt would be worse than an absent one — it
 * would join silently in every window and RMS verdict the shortlist sorts on,
 * and nobody would see it happen. An explicit refusal is a bug report; a
 * silent approximation is a wrong answer.
 *
 * WHY IT HANGS ON THE DESIGN AND NOT ON THE PROJECT. Two voicings of the same
 * loudspeaker have to be able to exist side by side and be compared. A
 * project-wide curve turns "which voicing do I want" into a setting you toggle
 * back and forth, which is exactly the comparison it should have made easy.
 *
 * ABSENT MEANS FLAT, and that is not a P4 violation: a target curve is not a
 * limit that judges a design, it is the REFERENCE the judgement is measured
 * against, and "no reference at all" is not a coherent state for a window
 * requirement. Flat is the neutral reference, it is reported as such, and the
 * designer replaces it.
 */

/** The shapes the vocabulary knows. Only `flat` is implemented. */
export type TargetCurveType = 'flat' | 'tilt' | 'hold-current';

export interface TargetCurve {
  type: TargetCurveType;
  /**
   * TODO(F3+/A5e.2): `tilt` needs a slope in dB per decade and a pivot
   * frequency; `hold-current` needs the response it is holding, which makes it
   * a reference to a measurement rather than a parameter. Neither is filled
   * in, and neither may be guessed at the call site.
   */
  tiltDbPerDecade?: number;
  tiltPivotHz?: number;
}

/** The curve a design carries when it states none. */
export const FLAT_TARGET: TargetCurve = { type: 'flat' };

export class TargetCurveNotImplementedError extends Error {}

/**
 * The target LEVEL at each frequency, in dB, relative to the design's own
 * reference level.
 *
 * Returns offsets rather than absolute levels on purpose: what a window or an
 * RMS deviation is about is the SHAPE, and an absolute level would drag the
 * sensitivity of the whole loudspeaker into a judgement about flatness. The
 * caller subtracts the response's own mean over the evaluated band; this
 * function only says how the target departs from horizontal.
 *
 * For `flat` that is zero everywhere — which is why this function looks
 * pointless today and will not be pointless the moment a tilt exists.
 */
export function targetOffsetsDb(
  curve: TargetCurve,
  grid: readonly number[],
): number[] {
  switch (curve.type) {
    case 'flat':
      return grid.map(() => 0);
    case 'tilt':
    case 'hold-current':
      throw new TargetCurveNotImplementedError(
        `The "${curve.type}" target curve is declared in the vocabulary but not implemented ` +
          '(A5e.2). It is refused rather than approximated: a target curve that quietly ' +
          'behaved like something else would join every window and RMS verdict without anyone ' +
          'seeing it. Use "flat", or implement it.',
      );
  }
}

/** True when this curve can actually be evaluated today. */
export const isImplemented = (curve: TargetCurve): boolean => curve.type === 'flat';

/** One line for the report and for the shortlist stamp. */
export function describeTargetCurve(curve: TargetCurve): string {
  return curve.type === 'flat'
    ? 'flat — the neutral reference; no voicing applied'
    : `${curve.type} — declared but not implemented (A5e.2)`;
}
