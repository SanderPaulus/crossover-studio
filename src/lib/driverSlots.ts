/**
 * Mapping measured drivers to the woofer/tweeter SLOTS by name, so an imported
 * VituixCAD project works even when its drivers are not literally called
 * "mid"/"tweeter" (e.g. "Woofer 12w8524", "Tweeter r2604-83200"). Matching a
 * hard-coded model name silently applied NO crossover filter and summed the raw
 * drivers — the crossover then appeared to land far too high.
 */

/** True when a driver model belongs in the tweeter slot. */
export function isTweeterModel(model: string): boolean {
  return /tweet|hoch|\bht\b/i.test(model);
}

/**
 * Split a 2-way driver set into tweeter/woofer by slot: the tweeter is whichever
 * driver matches {@link isTweeterModel}, the other is the woofer. A helper
 * "woofer+tweeter parallel" driver (matches both patterns via "tweeter") is kept
 * out of the woofer slot by preferring the first non-tweeter that is not itself
 * a parallel/summed measurement.
 */
export function pickSlots<T extends { model: string }>(
  drivers: readonly T[],
): { woofer?: T; tweeter?: T } {
  const real = drivers.filter((d) => !/parallel|\+/i.test(d.model));
  const pool = real.length > 0 ? real : drivers;
  return {
    tweeter: pool.find((d) => isTweeterModel(d.model)),
    woofer: pool.find((d) => !isTweeterModel(d.model)),
  };
}
