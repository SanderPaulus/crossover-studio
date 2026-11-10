/**
 * GUIDED — THE FILTER ORDER PER HANDOVER, as a short choice (G-13, 10-11-2026).
 *
 * WHAT THE ENGINE DOES WITH AN ORDER, measured before this was built. The
 * order of a handover is never searched: A5d.3 derives per handover which
 * order the stated rules DEMAND (the tweeter rule on the upper driver's f_s,
 * the breakup margin of the lower one, and — rule (i) — the ACOUSTIC SLOPE
 * TARGET of each flank minus what the driver already does), and the pair takes
 * the highest demand. A slope target of 24 dB/oct on a flat flank demands
 * order 4 exactly; 12 dB/oct demands 2; `auto` demands nothing. The app's
 * band form states a 24 dB/oct target on the LOWER flank of every handover by
 * default (`APP_DEFAULTS`: woofer LP 24, mid HP 24, mid LP 24 — and the
 * tweeter HP 12), and the pair takes the steeper flank, so every run — Quick
 * AND Extended — has built 4th order unless somebody set the band form to
 * `auto`, in which case Quick builds the steepest admitted order and Extended
 * every admitted order as its own candidate.
 *
 * So the choice already exists, as four selects in expert's band form; guided
 * did not show it. This module is the guided reading of those SAME four
 * states and nothing of its own: a button writes both flanks of a handover
 * (12 dB/oct, 24 dB/oct or `auto`), and the run reads them exactly as before.
 * No new setting, no engine change — the four rows keep their register entry
 * and their "stated by you" stamp.
 *
 * WHAT A CHOICE CANNOT DO, and the screen says it: a rule that demands a
 * steeper order wins. "2nd order" on a handover whose tweeter rule demands 3
 * is built at 3 (BW3, the library's order-3 alignment) and the row names the
 * rule. That is the derivation's own behaviour, shown rather than hidden.
 */
export const GUIDED_ORDER_VERSION = 'guided-order/1.0';

export type GuidedOrderChoice = '2' | '4' | 'auto';
export type SlopeRowId = 'acSlopeWoofer' | 'acSlopeMidHp' | 'acSlopeMid' | 'acSlopeTweeter';

/** dB per octave per filter order — the unit the slope selects are in. */
const DB_PER_OCTAVE_PER_ORDER = 6;

export const GUIDED_ORDER_CHOICES: readonly {
  id: GuidedOrderChoice;
  /** The value written into BOTH slope selects of the handover. */
  slope: '12' | '24' | 'auto';
  label: string;
  hint: string;
}[] = Object.freeze([
  {
    id: '2',
    slope: '12',
    label: '2nd order (LR2)',
    hint: 'Fewest parts and the least coil copper; the driver above the handover takes more below it.',
  },
  {
    id: '4',
    slope: '24',
    label: '4th order (LR4)',
    hint: 'The standard: the most protection for the driver above the handover, more parts.',
  },
  {
    id: 'auto',
    slope: 'auto',
    label: 'Let the engine choose',
    hint: 'Quick: the steepest order the rules admit. Extended: every admitted order as its own candidate, within the same budget — fewer positions per order.',
  },
]);

/**
 * Which two slope rows carry handover `i` (low to high) of a project with
 * `handovers` passive handovers — the SAME mapping `pairDerivationInputs`
 * reads them with (`i === 0 && many ? low : mid`): on a three-way the lowest
 * handover is the woofer's LP flank and the mid's HP flank, every other
 * handover is the mid's LP flank and the tweeter's HP flank. A two-way and a
 * hybrid three-way have one handover, and it is the mid/tweeter pair.
 */
export function slopeRowsForHandover(i: number, handovers: number): [SlopeRowId, SlopeRowId] {
  return i === 0 && handovers > 1 ? ['acSlopeWoofer', 'acSlopeMidHp'] : ['acSlopeMid', 'acSlopeTweeter'];
}

/** The order the band form states for a handover: the steeper of its two flanks, as `orderFrom` reads it. */
export function statedOrderOfSlopes(lower: string, upper: string): number | null {
  const vals = [lower, upper].filter((x) => x !== 'auto').map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (vals.length === 0) return null;
  return Math.max(1, Math.min(4, Math.round(Math.max(...vals) / DB_PER_OCTAVE_PER_ORDER)));
}

/**
 * The guided reading of two slope selects: `'auto'` when both are free, `'2'`
 * or `'4'` when the steeper flank says so, and `'other'` for anything expert
 * set that these three words do not cover (18 dB/oct, 6 dB/oct). `'other'` is
 * shown, never silently mapped onto a button.
 */
export function orderChoiceOf(lower: string, upper: string): GuidedOrderChoice | 'other' {
  if (lower === 'auto' && upper === 'auto') return 'auto';
  const n = statedOrderOfSlopes(lower, upper);
  return n === 2 ? '2' : n === 4 ? '4' : 'other';
}

/** The library's order at or above `n` — `flankOrder.ts`'s `fit`, for the readout. */
function fitTo(n: number, available: readonly number[]): number {
  const hit = available.find((a) => a >= n);
  return hit ?? available[available.length - 1];
}

/**
 * What the engine will BUILD on a handover under a choice, given what the
 * OTHER rules demand there (`otherDemand`: the highest non-slope demand, or
 * null) and the orders the library offers. The derivation takes the highest
 * demand, so a chosen order below the other rules' demand is OVERRULED and the
 * row says so; `'auto'` is the steepest admitted order in Quick and every
 * admitted order in Extended.
 */
export function ordersBuilt(
  choice: GuidedOrderChoice,
  otherDemand: number | null,
  available: readonly number[],
  mode: 'exploration' | 'full',
): { orders: number[]; overruled: boolean } {
  const admittedByRules = otherDemand === null ? [...available] : [fitTo(otherDemand, available)];
  if (choice === 'auto') {
    return { orders: mode === 'full' ? admittedByRules : [Math.max(...admittedByRules)], overruled: false };
  }
  const want = Number(choice);
  if (otherDemand !== null && otherDemand > want) return { orders: [fitTo(otherDemand, available)], overruled: true };
  return { orders: [fitTo(want, available)], overruled: false };
}

/** The alignment name the library builds at an order — for the readout only. */
export function alignmentNameAt(order: number, kinds: readonly { kind: string; order: number }[]): string {
  const hit = kinds.find((k) => k.order === order);
  return hit ? `${hit.kind}${hit.order}` : `order ${order}`;
}

export const ORDER_IS_APP_DEFAULT_NOTE =
  'Nobody chose this: it is where the app starts (a 24 dB/oct target on the lower flank of the handover, which demands 4th order), and it steers the field until you change it here or in expert.';
