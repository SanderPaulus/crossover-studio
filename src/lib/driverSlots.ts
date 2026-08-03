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

/**
 * Given a per-driver map keyed by MODEL name, add `mid`/`tweeter` SLOT aliases
 * pointing at the same values (unless those keys already exist). Synthesized
 * networks address drivers as 'mid'/'tweeter' and the design chain hardcodes
 * `driverZ.mid`/`.tweeter`, while a .vxp-loaded project keys everything by the
 * real model name ("Woofer 12w8524"/"Tweeter r2604-83200"). Without the alias,
 * `driverZ.mid` was undefined and synthesis crashed indexing it. Keying both
 * ways lets model-addressed (vxp) AND slot-addressed (synthesized) consumers
 * resolve from one map.
 */
export function withSlotAliases<T>(byModel: Record<string, T>): Record<string, T> {
  const out = { ...byModel };
  const { woofer, tweeter } = pickSlots(Object.keys(byModel).map((model) => ({ model })));
  if (woofer && out[woofer.model] !== undefined && out.mid === undefined) out.mid = out[woofer.model];
  if (tweeter && out[tweeter.model] !== undefined && out.tweeter === undefined) {
    out.tweeter = out[tweeter.model];
  }
  return out;
}

/**
 * N-way generalization of {@link withSlotAliases}. With ≤2 real drivers the
 * behavior is EXACTLY the historical one (low aliased as 'mid', high as
 * 'tweeter' — pinned by test); with a resolvable 3-way the canonical aliases
 * become 'woofer'/'mid'/'tweeter' — the middle branch now owns 'mid', which
 * is precisely how the naming knot dissolves. Ambiguous driver sets get NO
 * aliases (real model names still resolve); surfacing the ambiguity is the
 * UI's job via {@link pickSlotsN}, not this map's.
 */
export function withSlotAliasesN<T>(byModel: Record<string, T>): Record<string, T> {
  const out = { ...byModel };
  const slots = pickSlotsN(Object.keys(byModel).map((model) => ({ model })));
  if (slots.ambiguous) return out;
  const alias = (model: string | undefined, as: string) => {
    if (model !== undefined && out[model] !== undefined && out[as] === undefined) {
      out[as] = out[model];
    }
  };
  alias(slots.woofer?.model, canonicalModelForRole('low', !!slots.mid));
  alias(slots.mid?.model, 'mid');
  alias(slots.tweeter?.model, 'tweeter');
  return out;
}

/** True when a driver model belongs in the MID slot of a 3-way. Only
 *  consulted when a network carries ≥2 non-tweeter drivers: in a 2-way the
 *  single non-tweeter is the low branch regardless of its name (KOAN's low
 *  driver is literally called "mid" — that behavior is pinned). */
export function isMidModel(model: string): boolean {
  return /mid|squawk|\bmr\b/i.test(model);
}

export interface SlotsN<T> {
  woofer?: T;
  mid?: T;
  tweeter?: T;
  /** Non-empty when the drivers could not be told apart by name — the caller
   *  must SURFACE this instead of guessing (signalling doctrine). */
  ambiguous?: string;
}

/**
 * N-way slot mapping. Two drivers: exactly the historical pickSlots behavior
 * (tweeter by name, the other is the low branch). Three: the tweeter by
 * name, then the mid by name among the remaining two; when the names cannot
 * separate them (both or neither match) the mapping REFUSES with a message
 * rather than silently assigning branches — a mid summed as a woofer is the
 * kind of quiet wrongness this codebase exists to avoid.
 */
/**
 * Branch ROLES — the storage vocabulary (phase 4, trede 2b key decision).
 *
 * Measurements are stored per role, never per model name: 'mid' as a MODEL
 * name is owned by the user/file (KOAN's low driver is literally called
 * "mid") and resolves through {@link pickSlotsN}; 'mid' as a storage key was
 * the 2-way-era overload that collided the moment a real middle branch
 * existed. Storage speaks roles, netlists speak model names, this module is
 * the bridge between them.
 */
export type BranchRole = 'low' | 'mid' | 'high';

/**
 * The canonical model name a role-stored measurement is published under in a
 * model-keyed map (the solver looks drivers up by model name). THE single
 * place where "the low branch is historically called mid" lives: synthesized
 * 2-way networks address their drivers as 'mid'/'tweeter', so without a real
 * middle branch the low role keeps that name; with one, 'mid' belongs to the
 * middle branch and the low role becomes 'woofer'.
 */
export function canonicalModelForRole(role: BranchRole, hasMid: boolean): string {
  if (role === 'high') return 'tweeter';
  if (role === 'mid') return 'mid';
  return hasMid ? 'woofer' : 'mid';
}

export function pickSlotsN<T extends { model: string }>(drivers: readonly T[]): SlotsN<T> {
  const real = drivers.filter((d) => !/parallel|\+/i.test(d.model));
  const pool = real.length > 0 ? real : [...drivers];
  const tweeter = pool.find((d) => isTweeterModel(d.model));
  const rest = pool.filter((d) => d !== tweeter);
  if (rest.length <= 1) return { woofer: rest[0], tweeter };
  if (rest.length === 2) {
    const mids = rest.filter((d) => isMidModel(d.model));
    if (mids.length === 1) {
      return { woofer: rest.find((d) => d !== mids[0]), mid: mids[0], tweeter };
    }
    return {
      tweeter,
      ambiguous:
        `Cannot tell woofer from mid by name (` +
        rest.map((d) => `"${d.model}"`).join(', ') +
        `) — include "mid" in the midrange driver's model name.`,
    };
  }
  return {
    tweeter,
    ambiguous: `${rest.length} non-tweeter drivers — more than a 3-way; not supported yet.`,
  };
}
