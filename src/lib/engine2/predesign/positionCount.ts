/**
 * How many candidate positions a span of octaves admits at a given spacing.
 *
 * LIFTED OUT OF `candidates.ts` AT U-4 for the ordinary reason: it got a second
 * reader. `xoWindow.ts` prints, beside the breakup ceiling, what each candidate
 * divisor would leave — a ceiling, a span and the number of positions that fit
 * in it — so that the worth of measuring the divisor is visible before anyone
 * measures it. That count has to be the count the generator will actually use;
 * a second `1 + floor(span / spacing)` written out beside it would be a second
 * answer to one question (A3g). `candidates.ts` imports it from here and
 * re-exports it, so nothing that reads it today has to move.
 *
 * It could not simply be imported the other way round: `candidates.ts` already
 * imports `xoWindow.ts`, and a window that imported the generator would close
 * the cycle.
 */

/** How many positions the spacing rule admits over this span. */
export function derivedPositionCount(spanOct: number, spacingOct: number): number {
  if (!(spanOct > 0) || !(spacingOct > 0)) return 1;
  return Math.max(1, 1 + Math.floor(spanOct / spacingOct + Number.EPSILON));
}
