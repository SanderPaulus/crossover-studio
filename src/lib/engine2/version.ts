/**
 * ENGINE V2 — module identity and estimator versioning (spec A5.5, A5e.5).
 *
 * TWO SEPARATE THINGS LIVE HERE, ON PURPOSE.
 *
 * 1. `ENGINE_V2_VERSION` is what the UI stamps on everything the v2 layer
 *    shows. The toggle's hard requirement is that nothing from this layer can
 *    ever be mistaken for the shipping engine's output, so every panel carries
 *    the mark and the version next to it.
 *
 * 2. `ESTIMATOR_VERSIONS` is the cache key. Derived parameters are cached per
 *    measurement session (A5.2), and the spec is blunt about why the version
 *    has to exist from day one: "zonder dit worden V8-verbeteringen stille
 *    gedragswijzigingen". An extractor whose BEHAVIOUR changes must bump its
 *    version in the same commit, which invalidates every cached derivation and
 *    re-triggers the coverage and golden-reference tests.
 *
 * The registry is a plain object rather than a set of scattered constants so
 * that `estimatorFingerprint()` can hash ALL of them into one cache key: a
 * bump anywhere invalidates everything, which is the conservative direction.
 * A version-bump test (`versionRegistry.test.ts`) pins that every extractor
 * module actually exports the version this registry claims for it, so the two
 * cannot drift.
 *
 * Versioning rule: `<name>/<major>.<minor>`. MINOR = the numbers it produces
 * can move (a refined estimator, a fixed V8 defect). MAJOR = the SHAPE of what
 * it returns changed. Both invalidate the cache; only the second one can break
 * a caller.
 */

/** Stamped on every v2 report the UI shows. */
export const ENGINE_V2_VERSION = '2.0.0-F1';

/** Short label the UI puts in front of that version. */
export const ENGINE_V2_LABEL = 'Engine v2';

/**
 * Every extractor's version, in one place.
 *
 * Keys are the extractor's own `EXTRACTOR_ID`; each module exports both its id
 * and its version and the registry test asserts they match this table.
 */
export const ESTIMATOR_VERSIONS = {
  /** Header-derived validity bounds (1/T, 2/T) — A5b.1(i). */
  'validity-header': '1.0',
  /** Keele near-field ceiling and mic-distance check — A5b.1. */
  'validity-nearfield': '1.0',
  /** FF/NF baffle-step model test — A5b.1(ii), advisory. */
  'validity-ffnf': '1.0',
  /** R_e from Re(Z) with motional-proximity warning — A5c.1 (V8a/V8d). */
  'z-re': '1.0',
  /** Resonance classification by phase zero crossing — A5c.2/3 (V8b). */
  'z-resonance': '1.0',
  /** Semi-inductance fit |Z−Re| = K·ω^n with validity detection — A5c.5 (V8e). */
  'z-semi-inductance': '1.0',
  /** Ripple against a fractional-octave trend — A5c.4. */
  'z-ripple': '1.0',
  /** Breakup scan clipped to validity — A5b.2 (V8c). */
  'spl-breakup': '1.0',
  /** Diffraction ripple + dominant path length — A5b.3. */
  'spl-diffraction': '1.0',
  /** Directivity from 0°/θ pairs — A5b.4. */
  'spl-directivity': '1.0',
  /** Passband level per driver (feeds the anchored gap analysis) — A5d.4. */
  'spl-level': '1.0',
} as const;

export type EstimatorId = keyof typeof ESTIMATOR_VERSIONS;

/**
 * One string that changes whenever ANY extractor version changes.
 *
 * Deliberately the whole sorted table rather than a hash: a cache key that a
 * human can read is a cache key a human can debug, and the derived-parameter
 * cache holds a handful of entries, not a million.
 */
export function estimatorFingerprint(): string {
  return Object.keys(ESTIMATOR_VERSIONS)
    .sort()
    .map((k) => `${k}@${ESTIMATOR_VERSIONS[k as EstimatorId]}`)
    .join(';');
}

/** The version this specific extractor is registered under. */
export function estimatorVersion(id: EstimatorId): string {
  return ESTIMATOR_VERSIONS[id];
}

/** Provenance stamp carried by every derived value the ingest pass produces. */
export interface EstimatorStamp {
  id: EstimatorId;
  version: string;
}

export function stamp(id: EstimatorId): EstimatorStamp {
  return { id, version: ESTIMATOR_VERSIONS[id] };
}
