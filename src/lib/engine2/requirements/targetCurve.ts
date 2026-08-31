/**
 * A5e.2 — THE TARGET CURVE, decided at F3 and closed at V45.
 *
 * The voicing principle in A4 says it plainly: "muzikaal" is a response
 * choice, not a filter-order property, and it belongs in an explicit target
 * curve that the SPL judgement reckons against — never as a side effect of
 * slope ideology. This module is that object.
 *
 * WHAT IS HERE: `flat`, and `bass-plateau` since V45.
 *
 * WHAT IS DECLARED AND DOES NOTHING: `tilt` and `hold-current`. They exist in
 * the type so that a project can be written, read and versioned against the
 * finished vocabulary, and `targetOffsetsDb` REFUSES them rather than
 * approximating. A half-working tilt would be worse than an absent one — it
 * would join silently in every window and RMS verdict the shortlist sorts on,
 * and nobody would see it happen. An explicit refusal is a bug report; a
 * silent approximation is a wrong answer.
 *
 * `bass-plateau` IS THE SHAPE A5d.4(a) WAS WAITING FOR, and its two parameters
 * come from opposite places on purpose:
 *
 *   · `stepHz` is MEASURED — the baffle-step frequency the cabinet's own front
 *     width produces, through `baffleStepHz` and nothing else. P6: a frequency
 *     in engine code has to be derived from project data, and this is the
 *     derivation.
 *   · `plateauDepthDb` is STATED — how far below the flat part the design wants
 *     its bass to sit in the intended setup. That is a voicing decision and no
 *     measurement can produce it; a loudspeaker close to the back wall is
 *     deliberately down on axis because the wall fills the bottom back in.
 *
 * Neither has a default and neither may be guessed. A `bass-plateau` missing
 * either one produces NO offsets and says which input was missing, exactly as
 * an inversion with no measurement under its band does (P4).
 *
 * THE SHAPE IS THE APP'S OWN SHELF and not a second opinion about baffle step.
 * `baffleStepShelfDb` is first-order — 0 dB well above the corner, −depth well
 * below, −depth/2 AT it — and it is deliberately a shelf rather than a
 * diffraction simulation: published baffle-step formulas disagree by about 3×
 * and measurement agrees with none of them, because a driver's distance to each
 * edge matters more than the width does. A knob the designer can see beats a
 * model that looks authoritative and is not.
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

import { baffleStepShelfDb } from '../../nearField.ts';
import type { TargetLevelCurve } from '../../targetLevel.ts';

/** The shapes the vocabulary knows. `flat` and `bass-plateau` are implemented. */
export type TargetCurveType = 'flat' | 'bass-plateau' | 'tilt' | 'hold-current';

export interface TargetCurve {
  type: TargetCurveType;
  /**
   * `bass-plateau` — how far BELOW the flat part the plateau sits, in dB, as a
   * positive depth. STATED by the designer; there is no default.
   */
  plateauDepthDb?: number;
  /**
   * `bass-plateau` — where the transition is centred, Hz. MEASURED: the baffle
   * step of the cabinet front (`baffleStepHz`). There is no default, and a
   * caller may not substitute a crossing or a band edge for it: the transition
   * is a property of the box, not of the filter.
   */
  stepHz?: number;
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
 * A stated shape whose PARAMETERS did not arrive — a different failure from an
 * unimplemented shape, and worth its own type so a caller can tell "nobody has
 * built this yet" from "this project did not supply the measurement".
 */
export class TargetCurveDataMissingError extends Error {}

/**
 * The target LEVEL at each frequency, in dB, relative to the design's own
 * reference level.
 *
 * Returns offsets rather than absolute levels on purpose: what a window or an
 * RMS deviation is about is the SHAPE, and an absolute level would drag the
 * sensitivity of the whole loudspeaker into a judgement about flatness. The
 * caller subtracts the response's own mean over the evaluated band; this
 * function only says how the target departs from horizontal.
 */
export function targetOffsetsDb(
  curve: TargetCurve,
  grid: readonly number[],
): number[] {
  switch (curve.type) {
    case 'flat':
      return grid.map(() => 0);
    case 'bass-plateau': {
      const missing: string[] = [];
      if (!(curve.plateauDepthDb !== undefined && curve.plateauDepthDb > 0)) {
        missing.push('the stated plateau depth in dB');
      }
      if (!(curve.stepHz !== undefined && curve.stepHz > 0)) {
        missing.push("the baffle-step frequency derived from the cabinet's front width");
      }
      if (missing.length > 0) {
        throw new TargetCurveDataMissingError(
          `The "bass-plateau" target curve needs ${missing.join(' and ')}, and this design ` +
            'supplied neither a default nor a substitute (P4/P6). No offsets were produced, ' +
            'rather than a plateau at a depth nobody stated or a transition at a frequency ' +
            'nothing measured.',
        );
      }
      /* ONE SHELF, and it is the app's own (`baffleStepShelfDb`). Writing the
       * first-order form out again here would be a second implementation of a
       * curve the near-field merge already draws, and two of them is how they
       * come to disagree. */
      return baffleStepShelfDb(grid, curve.stepHz!, curve.plateauDepthDb!);
    }
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

/**
 * True when this curve can actually be evaluated today.
 *
 * "Evaluated", not "implemented": a `bass-plateau` whose parameters never
 * arrived is as unusable as a `tilt`, and a caller asking this question wants
 * to know whether it will get numbers — not which of the two reasons applies.
 * `describeTargetCurve` says which.
 */
export function isImplemented(curve: TargetCurve): boolean {
  if (curve.type === 'flat') return true;
  if (curve.type !== 'bass-plateau') return false;
  return (
    curve.plateauDepthDb !== undefined &&
    curve.plateauDepthDb > 0 &&
    curve.stepHz !== undefined &&
    curve.stepHz > 0
  );
}

/** One line for the report and for the shortlist stamp. */
export function describeTargetCurve(curve: TargetCurve): string {
  if (curve.type === 'flat') return 'flat — the neutral reference; no voicing applied';
  if (curve.type === 'bass-plateau') {
    return isImplemented(curve)
      ? `bass-plateau — ${curve.plateauDepthDb!.toFixed(1)} dB below the flat part under a ` +
          `transition centred on the measured baffle step at ${curve.stepHz!.toFixed(0)} Hz`
      : 'bass-plateau — stated, but its depth or its measured step frequency did not arrive, ' +
          'so nothing is judged against it (P4)';
  }
  return `${curve.type} — declared but not implemented (A5e.2)`;
}

/**
 * The curve as it crosses to a consumer that may not import this module — the
 * tuner above all (`targetLevel.ts` says why the arrow points this way).
 *
 * Sampled on the grid the caller hands over, so the samples are the ones the
 * caller's own judgement will be taken on. Returns null when the curve cannot
 * be evaluated, which is what makes an unusable curve steer NOTHING rather than
 * steer a flat one: a caller that receives null arms no target at all and says
 * so, and its run is byte-identical to a run that stated none.
 */
export function targetLevelCurveFor(
  curve: TargetCurve,
  grid: readonly number[],
): TargetLevelCurve | null {
  try {
    return { freqHz: [...grid], db: targetOffsetsDb(curve, grid) };
  } catch {
    return null;
  }
}
