/**
 * U-4 — HOW TO MEASURE THE BREAKUP DIVISOR, in one home with three readers.
 *
 * WHAT THE DIVISOR IS. A5d.3's upper limit on a handover is the lower driver's
 * first significant breakup DIVIDED by a number between two published
 * endpoints: f/2 for a mild peak, f/3 for a severe one. The engine interpolates
 * between them on the peak's height over trend, and that ramp has carried an
 * UNCALIBRATED marking since V9 because nothing measured it — V9 found the
 * whole upper crossover window of casus 1 hanging off exactly that curve, and
 * U-3g found it again: 5688 Hz over an interpolated 2.47 is 2308 Hz, and the
 * window it leaves is 0.07 octaves wide and holds one candidate.
 *
 * WHAT THE TWO ENDPOINTS ACTUALLY SAY, and this is the part that makes the
 * curve measurable rather than a matter of taste. They are HARMONIC ORDERS.
 * Divide by two and the passband stops an octave below the breakup, so only the
 * SECOND harmonic of what the driver is still being asked to play lands on the
 * resonance. Divide by three and the THIRD lands there too. Which of the two
 * applies is therefore not an opinion about how nasty the peak looks: it is a
 * question about this driver, and a two-tone measurement answers it.
 *
 * WHY THE TEXT LIVES HERE. The protocol has to appear in three places — beside
 * the field the designer types the answer into (`v2InputRegister`, and through
 * it the driver card's help), and beside the window limit that carries the
 * uncalibrated marking (`engine2/predesign/xoWindow.ts`) — and three copies of
 * a recipe are three recipes. Same shape and same reason as `impedanceFloor.ts`
 * and `phaseAdmission.ts`: `src/lib/`, because the register may not import
 * `engine2/` (the toggle invariant's dependency arrow) and the engine may.
 *
 * NO NUMBERS FROM THE PROJECT AND NONE FROM THE ENGINE. The orders 2 and 3 here
 * are harmonic orders — physics, not the two constants they happen to map onto.
 * The mapping order → divisor is stated where those constants live.
 */

/** The two harmonic orders the published endpoints correspond to. */
export const BREAKUP_DIVISOR_HARMONICS = [2, 3] as const;

/**
 * The recipe, in the app's own voice and without a driver in front of it.
 * `breakupDivisorProtocolFor` puts the frequencies in.
 */
export const BREAKUP_DIVISOR_PROTOCOL =
  'Drive this driver alone with a single tone at the breakup divided by two and measure the SECOND ' +
  'harmonic at the breakup itself; then at the breakup divided by three and measure the THIRD. The ' +
  'lowest harmonic order whose product rises out of the noise floor at the breakup is the divisor: ' +
  'the third silent means 2.0 (only the second reaches the resonance, so a handover an octave below ' +
  'it keeps the resonance out of the passband), the third audible means 3.0. A value in between is ' +
  'only a measurement if BOTH orders were measured and you interpolated between them — then it is ' +
  'your number and the app attributes it to you, never to the ramp it replaces.';

/** The same recipe with this driver's own breakup in it. */
export function breakupDivisorProtocolFor(breakupHz: number): string {
  const [h2, h3] = BREAKUP_DIVISOR_HARMONICS;
  return (
    `Drive this driver alone at ${(breakupHz / h2).toFixed(0)} Hz and measure H${h2} at ` +
    `${breakupHz.toFixed(0)} Hz; then at ${(breakupHz / h3).toFixed(0)} Hz and measure H${h3} at the ` +
    `same ${breakupHz.toFixed(0)} Hz. H${h3} out of the noise floor means the divisor is ${h3}.0, ` +
    `silent means ${h2}.0. ${BREAKUP_DIVISOR_PROTOCOL.slice(BREAKUP_DIVISOR_PROTOCOL.indexOf('A value in between'))}`
  );
}
