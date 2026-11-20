import type { VxpPart } from './parsers/vxp.ts';
import { t } from './i18n.ts';

/**
 * G-20 — WHICH VALUES ARE NOT A PART YOU CAN BUY, AND WHY (19-11-2026).
 *
 * Sanders demo run (guided, standard filter, Premium, the 4–8 Ω profile):
 * every value in "Your build" read like 2.464 mH and 112.2 µF, and the guided
 * line blamed the catalogue snap — "real parts would break a hard limit". The
 * audit measured something else. The bare standard filter dips to 2.60 Ω on
 * these drivers, the stated 3.2 Ω floor refused the whole tune, and that
 * refusal comes BEFORE the snap. A candidate the app derived then delivers no
 * network; a candidate the designer stated (U-5: "Refine", stated crossings)
 * is handed over as the tune left it, so it is shown with values no series
 * stocks. The snap never saw it. Two things were wrong on screen: the drawing
 * gave no sign that a value is ideal, and the one sentence that explained it
 * named a cause that had not happened.
 *
 * One reader for each question, with every place that answers it calling it:
 * the guided parts line, and the note under the network editor.
 */

export const IDEAL_PARTS_VERSION = 'ideal-parts/1.1';

/** True for a passive part that carries a value and no catalogue attribution. */
export function isIdealValue(p: Pick<VxpPart, 'type' | 'catalog' | 'open' | 'shorted'>): boolean {
  if (p.type !== 'Resistor' && p.type !== 'Inductor' && p.type !== 'Capacitor') return false;
  if (p.open || p.shorted) return false;
  return !p.catalog;
}

/**
 * The passive values of a network as a multiset, order-free: two drawings
 * carry the same network when these agree. Used to ask whether what is on
 * screen is still the network a run handed over — an edit ends that claim.
 */
export function passiveValueKey(parts: readonly VxpPart[]): string {
  return parts
    .filter((p) => (p.type === 'Resistor' || p.type === 'Inductor' || p.type === 'Capacitor') && !p.open && !p.shorted)
    .map((p) => `${p.type}:${p.params[0]?.value ?? ''}`)
    .sort()
    .join('|');
}

/**
 * Why the values of the design on screen were not matched to catalogue parts,
 * in one sentence, or null when there is nothing to explain.
 *
 * The order is the order of the facts: without a catalogue or with the snap
 * off nothing could be matched. Since the audit of 20-11-2026 a run with the
 * snap on and a catalogue loaded hands over purchasable parts on every route —
 * a refused snap, a design refused before the snap and a ✂ Minimize result
 * included — so what is left are values the run did not set: typed or locked
 * by hand, or a network from before that version. A refused stated design says
 * so first.
 */
export function idealValuesCause(s: {
  catalogLoaded: boolean;
  snapOn: boolean;
  /** The refusing rule's own sentence when the design on screen is a refused stated candidate. */
  refusal: string | null;
}): string {
  if (!s.catalogLoaded) return t('No catalogue is loaded — load one under Expert → Filters → Components.');
  if (!s.snapOn) return t('“Use real catalog parts” is switched off (Expert → Filters → Components).');
  const left = t(
    'A run with the snap on puts every value on a catalogue part, so these were not set by one: they were typed or locked by hand, or the network comes from before 20-11-2026. ⚙ Optimize components puts them on catalogue parts.',
  );
  if (s.refusal) {
    return `${t('This design was REFUSED — {reason} — and is shown because you stated its crossings.', { reason: s.refusal })} ${left}`;
  }
  return left;
}
