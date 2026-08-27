/**
 * F4d — THE PLACE WHERE THE TWO MEASUREMENT FLOORS ARE HELD AGAINST EACH OTHER.
 *
 * Audit §6.3 names the gap and does not soften it:
 *
 *     | laag       | vloer W-M | herkomst                                    |
 *     | v2 (A5d.3) | 396,7 Hz  | meetgeldigheid, MID ver-veld                |
 *     | v1         | 707 Hz    | near-field/far-field-splice, WOOFER         |
 *     "Beide zijn verdedigbaar. De v1-waarde wint omdat hij eerder in de keten
 *      zit, niet omdat hij beter is. Er is geen plek waar de twee tegen elkaar
 *      worden gehouden."
 *
 * Until F4d the disagreement was resolved silently and in one direction, by
 * `clampPin` in `App.tsx`: a designer's range that dipped under the v1 floor
 * was REPLACED by the v1 window, and the substitution was visible only as a
 * banner about something else. Live on the KOAN project that turned a
 * recommended 396.7–448.5 Hz into 707–728 Hz, after which the pre-start
 * estimate correctly reported four of four candidates outside the A5d.3 window.
 * The estimate was right; the cause was two screens upstream.
 *
 * WHAT THIS MODULE IS. Not a reconciliation — a REPORT. It puts both floors
 * side by side with their provenance, says which of the two actually steered
 * the candidates, and says what the other one implies about them. It resolves
 * nothing, and that is the point: the two floors answer different questions.
 *
 *   · The A5d.3 floor asks WHERE MAY A RESPONSE BE BELIEVED. It is a property
 *     of the measurement's own window (A5b.1: 1/T, 2/T from the header).
 *   · The v1 floor asks WHERE MAY A HANDOVER SIT. Its splice rule keeps the
 *     crossing out of the stretch where a near-field/far-field merge hangs on
 *     a level-and-delay fit, which is a stricter and different question.
 *
 * A designer looking at both can decide. A pipeline that picks one for them
 * cannot, and picking the earlier one is not picking the better one.
 *
 * PURE, and deliberately free of both engines' data structures: it takes two
 * numbers with two sentences and returns a verdict. Which means it can be
 * tested without a browser, an ingest pass or a chain — and the panel and the
 * run notes cannot come to disagree about what the two floors were.
 */

/** One floor, with where it came from. */
export interface FloorClaim {
  /** Which layer stated it. */
  layer: string;
  hz: number | null;
  /** The sentence shown next to the number — never a tooltip. */
  source: string;
  /** The measurement (or the way) the floor is a property of. */
  subject: string;
}

export type FloorAgreement =
  | 'agree'
  | 'v1-stricter'
  | 'v2-stricter'
  | 'one-sided'
  | 'neither';

export interface FloorComparison {
  pairLabel: string;
  /** The floor the CANDIDATES were generated against. */
  steering: FloorClaim | null;
  /** The other one, reported and not applied. */
  counter: FloorClaim | null;
  agreement: FloorAgreement;
  /** Octaves between the two, when both exist. */
  octavesApart: number | null;
  /** The sentence the panel shows. Null when there is nothing to say. */
  message: string | null;
  /**
   * Set when the counter-floor would forbid part of the band the candidates
   * were drawn from — the finding a designer has to see before the scan, not
   * after it.
   */
  warning: string | null;
}

const OCT = 2;

/**
 * Hold two floors against each other for one adjacent pair.
 *
 * `steering` is the floor the candidate generator used; `counter` is the other
 * layer's. Both may be null, and null is a state rather than a zero: a layer
 * that could not derive a floor has not said "anywhere is fine".
 */
export function compareFloors(
  pairLabel: string,
  steering: FloorClaim | null,
  counter: FloorClaim | null,
  /** The band the candidates were actually drawn from, when there is one. */
  candidateBandHz?: readonly [number, number] | null,
): FloorComparison {
  const a = steering && steering.hz !== null && steering.hz > 0 ? steering : null;
  const b = counter && counter.hz !== null && counter.hz > 0 ? counter : null;

  if (!a && !b) {
    return {
      pairLabel,
      steering: null,
      counter: null,
      agreement: 'neither',
      octavesApart: null,
      message: null,
      warning: null,
    };
  }
  if (!a || !b) {
    const one = (a ?? b)!;
    return {
      pairLabel,
      steering: a,
      counter: b,
      agreement: 'one-sided',
      octavesApart: null,
      message:
        `${pairLabel}: only one layer derived a lower limit for this handover — ` +
        `${one.layer} at ${one.hz!.toFixed(0)} Hz (${one.source}). The other has nothing to say ` +
        'here, which is a different statement from agreeing with it.',
      warning: null,
    };
  }

  const oct = Math.abs(Math.log2(b.hz! / a.hz!));
  const same = Math.abs(b.hz! - a.hz!) < Number.EPSILON * Math.max(a.hz!, b.hz!) * 8;
  const agreement: FloorAgreement = same ? 'agree' : b.hz! > a.hz! ? 'v1-stricter' : 'v2-stricter';
  const both =
    `${pairLabel}: ${a.layer} puts the lower limit at ${a.hz!.toFixed(0)} Hz ` +
    `(${a.source}, on ${a.subject}); ${b.layer} puts it at ${b.hz!.toFixed(0)} Hz ` +
    `(${b.source}, on ${b.subject}).`;

  if (same) {
    return {
      pairLabel,
      steering: a,
      counter: b,
      agreement,
      octavesApart: 0,
      message: `${both} They agree.`,
      warning: null,
    };
  }

  const steer =
    ` The candidates were generated against ${a.layer}'s floor. Nothing is being reconciled: ` +
    'the two answer different questions — where a response may be BELIEVED, and where a handover ' +
    'may SIT — and both are defensible. What is not defensible is one of them winning because it ' +
    'happens to come first in the pipeline (audit §6.3).';

  let warning: string | null = null;
  if (b.hz! > a.hz!) {
    const band = candidateBandHz ?? null;
    const belowBand = band && band[0] < b.hz!;
    warning =
      `${b.layer}'s floor is ${oct.toFixed(OCT)} octaves ABOVE ${a.layer}'s` +
      (belowBand
        ? `, so part of the band these candidates were drawn from (${band![0].toFixed(0)}–` +
          `${band![1].toFixed(0)} Hz) sits under it. ` +
          `Handovers below ${b.hz!.toFixed(0)} Hz are ones ${b.layer} would have refused.`
        : ', but no candidate was drawn from under it, so the two do not disagree about anything ' +
          'this field contains.');
  }

  return {
    pairLabel,
    steering: a,
    counter: b,
    agreement,
    octavesApart: oct,
    message: `${both}${steer}`,
    warning,
  };
}
