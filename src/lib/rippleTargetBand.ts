/**
 * E-5b — THE BAND THE STAGED PASS'S RIPPLE STOP-GOAL IS JUDGED ON.
 *
 * WHAT IT IS FOR. The staged (trapmethode) pass stops escalating when the
 * assembled network meets its targets, and the ripple half of that target has
 * always been read on the WHOLE judged band. Since E-5 that band reaches the
 * lowest way's in-box resonance, so a three-way's stop test now includes three
 * octaves of bass that no crossover can flatten: below the lowest handover the
 * sum IS the box, and its shape is the plateau target's business and M-D's, not
 * the crossover's.
 *
 * SO THE STOP-GOAL GETS ITS OWN BAND, STATED (Sander, 13-09-2026): from the
 * lowest handover POSITION minus {@link RIPPLE_STOP_MARGIN_OCTAVES}, up to the
 * judged band's own ceiling. Below it the existing requirements judge and
 * nothing is unwatched — the plateau target shape (A5e.2), M-D against the
 * stated LF budget, and the amplifier floor. The design step may still place
 * cut bands down there (that is where the reflex-peak trap comes from, E-5);
 * what changes is that the bass ripple no longer holds the escalation ladder
 * open. The motivation lives in the manifest beside the requirement it serves.
 *
 * ONE RULE, THREE READERS: the three-way chain, the two-way chain and the
 * measurement script. It lives in `src/lib/` rather than in `engine2/` for the
 * reason `impedanceFloor.ts`, `phaseAdmission.ts` and `targetLevel.ts` do: the
 * chains and the tuner may not import from `engine2/`, and a second
 * implementation on the other side of that line is how two answers to one
 * question get made.
 *
 * IT DECIDES NOTHING BY ITSELF. Whether the tuner READS this band is
 * `rippleTargetBand`, a CHOICE the candidate states; this only says what the
 * band IS. A run that states nothing keeps reading the judged band, byte for
 * byte, which is every v1 run.
 */

/**
 * How far below the lowest handover the stop-goal's band begins, in octaves.
 *
 * Half an octave, and it is a MARGIN rather than a frequency: the crossing
 * region does not end at the handover, and a stop test that began exactly there
 * would let the ripple of the lower flank's own knee fall outside it. Stated
 * with the requirement (13-09-2026) rather than derived — nothing here measures
 * how far a fourth-order knee reaches, and inventing a derivation for a number
 * a person chose is the mistake A3h is about.
 */
export const RIPPLE_STOP_MARGIN_OCTAVES = 0.5;

/**
 * The stop-goal's band, or null when it cannot be formed.
 *
 * Null on three states, and every one of them is honest rather than a fallback:
 * no handover was given, the lowest one is not a usable frequency, or the band
 * that comes out is not below the judged ceiling. The caller then states
 * nothing and the tuner reads the judged band exactly as it always has (P4).
 *
 * CLIPPED to the judged band at both ends. The floor may not reach below it —
 * there is no measurement down there and the metrics index into arrays that
 * stop at the grid's edge — and the ceiling is the judged one, never wider.
 */
export function rippleStopBand(
  crossingsHz: readonly (number | null | undefined)[],
  judgedBandHz: readonly [number, number],
): [number, number] | null {
  const usable = crossingsHz.filter(
    (f): f is number => typeof f === 'number' && Number.isFinite(f) && f > 0,
  );
  if (usable.length === 0) return null;
  const lowest = Math.min(...usable);
  const from = Math.max(judgedBandHz[0], lowest * 2 ** -RIPPLE_STOP_MARGIN_OCTAVES);
  const to = judgedBandHz[1];
  return to > from ? [from, to] : null;
}

/**
 * One sentence a run can print about which band its stop-goal was read on.
 *
 * It names the RULE and the margin, not only the hertz: a band that came from a
 * stated requirement and one that is the judged band by default look identical
 * once they are both just a pair of numbers.
 */
export function describeRippleStopBand(
  band: readonly [number, number] | null,
  judgedBandHz: readonly [number, number],
): string {
  if (!band) {
    return (
      `The ripple stop-goal is read on the whole judged band ` +
      `(${judgedBandHz[0].toFixed(1)}–${judgedBandHz[1].toFixed(0)} Hz), which is what it has always ` +
      'been read on.'
    );
  }
  return (
    `The ripple stop-goal is read on ${band[0].toFixed(1)}–${band[1].toFixed(0)} Hz — from the lowest ` +
    `handover minus ${RIPPLE_STOP_MARGIN_OCTAVES} octave, up to the judged ceiling (stated 13-09-2026). ` +
    `Below it the judged band still runs to ${judgedBandHz[0].toFixed(1)} Hz and the plateau target, ` +
    'M-D and the amplifier floor still judge there; what the bass no longer does is hold the ' +
    'escalation ladder open.'
  );
}
