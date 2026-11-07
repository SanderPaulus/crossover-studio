/**
 * GUIDED — the component quality, as a short choice (07-11-2026).
 *
 * Expert has had five snap profiles since the component wizard
 * (`SnapPrefs['profile']`, catalog.ts): auto, budget, balanced, premium and
 * position. Guided ran on `auto` with no way to say otherwise. This module is
 * the guided reading of that same state: four of the five, in plain words, and
 * nothing of its own — the button writes `snapProfile`, the one value expert
 * writes, and the run reads it through `snapPrefsValue()` as before.
 *
 * WHY FOUR AND NOT FIVE. `position` (premium in the series path, budget in
 * shunts and traps) asks the reader to know what a series path is. It stays an
 * expert setting. A project that carries it opens in guided with no button
 * pressed and says so (`guidedPartsQualityNote`), rather than pretending to be
 * one of the four.
 *
 * WHAT THE CHOICE DOES NOT TOUCH, and the sentence says it: COILS. A coil's
 * tier is its wire, and wire is a first-order electrical parameter — the snap
 * picks coils on a DCR budget per position and ignores the tier on purpose
 * (`preferredPools`, catalog.ts). So the choice steers capacitors and
 * resistors only.
 */
export const GUIDED_PARTS_QUALITY_VERSION = 'guided-parts-quality/1.0';

export type GuidedPartsQuality = 'auto' | 'budget' | 'balanced' | 'premium';

export const GUIDED_PARTS_QUALITY: readonly {
  id: GuidedPartsQuality;
  label: string;
  hint: string;
}[] = Object.freeze([
  { id: 'auto', label: 'No preference', hint: 'The nearest value at the best price, from any series.' },
  { id: 'budget', label: 'Budget', hint: 'The cheapest series first.' },
  { id: 'balanced', label: 'Standard', hint: 'The standard series.' },
  { id: 'premium', label: 'Premium', hint: 'The best series first.' },
]);

/** True when the stored profile is one of the four guided offers. */
export function isGuidedPartsQuality(profile: string): profile is GuidedPartsQuality {
  return GUIDED_PARTS_QUALITY.some((q) => q.id === profile);
}

/** The guided label of a stored profile, or null for one guided does not offer. */
export function guidedPartsQualityLabel(profile: string): string | null {
  return GUIDED_PARTS_QUALITY.find((q) => q.id === profile)?.label ?? null;
}

export const COILS_NOT_BY_QUALITY =
  'Coils are not chosen by this: a cheaper coil means thinner wire, which changes the filter, so coils are picked on wire resistance. The choice steers capacitors and resistors.';

/** The line under the buttons for a profile guided does not offer. */
export function guidedPartsQualityNote(profile: string): string | null {
  return isGuidedPartsQuality(profile)
    ? null
    : `This project uses the expert profile "${profile}". Pick one above to replace it.`;
}
