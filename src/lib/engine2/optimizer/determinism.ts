/**
 * A5e.4, TAKEN — the determinism policy of the v2 optimisation path.
 *
 * The specification parked this one: "Zelfde invoer + zelfde seed =
 * byte-identiek resultaat; seed- en budgetbeleid vastleggen, anders zijn
 * golden references onbetrouwbaar." This module is that policy, written as
 * code rather than as a promise, and the decision itself is recorded in the
 * strategy note under A5e.4.
 *
 * THE POLICY, IN FOUR SENTENCES.
 *
 *  1. EVERY RUN HAS A SEED, always. The project may state one; when it does
 *     not, `DEFAULT_RUN_SEED` is used and REPORTED. "Absent = off" is the
 *     right rule for a limit (P4) and the wrong one for a seed, because off
 *     would mean "not reproducible" — the very thing this decision exists to
 *     prevent.
 *  2. THE BUDGET IS A PROJECT SETTING and absent really does mean absent: the
 *     tuner's own iteration policy applies, unchanged. A budget bounds effort,
 *     never acceptability, so nothing about the answer depends on it being
 *     supplied — only how long the search looked.
 *  3. EVERY RESULT CARRIES A FINGERPRINT, and the fingerprint is a LIST of
 *     named components rather than an opaque hash. Two runs that disagree
 *     should say WHICH input disagreed; a single hash can only say "not the
 *     same", which is the least useful true thing it could say.
 *  4. NO CLOCK, NO ENTROPY, NO ITERATION ORDER OVER A HASH MAP. The randomness
 *     the search uses is drawn from the seed through the counter-based
 *     generator below, and every collection this path builds is ordered by a
 *     stated key.
 *
 * WHY A GENERATOR AT ALL, given that the v1 tuner has no randomness of its
 * own (there is not one `Math.random` in the optimiser today): the v2 path
 * explores several independent STARTING POINTS, and points that were spaced
 * by hand would be a hidden project number (P6). Drawing them from a seeded
 * generator makes the spacing a property of the seed — reproducible, stated,
 * and replaceable by the designer.
 */

import { DEFAULT_RUN_SEED, DEFAULT_RUN_STARTS } from '../constants.ts';
import { ENGINE_V2_VERSION } from '../version.ts';
import { estimatorFingerprint } from '../version.ts';

/** The determinism settings a project may state. */
export interface DeterminismSettings {
  /**
   * The run seed. Absent = `DEFAULT_RUN_SEED`, reported as such — see the
   * policy note above for why a seed does not follow the P4 absent-means-off
   * rule that every LIMIT in this engine does follow.
   */
  seed?: number;
  /**
   * Objective evaluations the search may spend per starting point. Absent =
   * the tuner's own policy, i.e. exactly what a v1 run does.
   */
  budgetEvaluations?: number;
  /** Independent starting points. Absent = `DEFAULT_RUN_STARTS`. */
  starts?: number;
}

/** The settings actually used, with every absent field resolved and named. */
export interface ResolvedDeterminism {
  seed: number;
  seedSource: 'project' | 'default';
  budgetEvaluations: number | null;
  budgetSource: 'project' | 'the tuner\'s own policy';
  starts: number;
  startsSource: 'project' | 'default';
}

export function resolveDeterminism(s: DeterminismSettings = {}): ResolvedDeterminism {
  return {
    seed: s.seed ?? DEFAULT_RUN_SEED,
    seedSource: s.seed === undefined ? 'default' : 'project',
    budgetEvaluations: s.budgetEvaluations ?? null,
    budgetSource: s.budgetEvaluations === undefined ? "the tuner's own policy" : 'project',
    starts: s.starts ?? DEFAULT_RUN_STARTS,
    startsSource: s.starts === undefined ? 'default' : 'project',
  };
}

/* ================================================================== *
 * The generator
 * ================================================================== */

/**
 * Counter-based, seeded, 32-bit. Mulberry32: four lines, well-distributed
 * enough for spacing starting points, and — the property that matters here —
 * a pure function of (seed, call count) with no global state anywhere.
 *
 * A shared mutable generator would make the sequence depend on WHO DREW
 * FIRST, and the order two independent parts of a run happen to execute in is
 * not something a fingerprint can capture. So every consumer takes its own
 * stream, derived from the run seed and a STREAM NAME.
 */
export function stream(seed: number, name: string): () => number {
  let a = (seed ^ hash32(name)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // P6-OK: mulberry32's own constants
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // P6-OK: 2^32, the generator's range
  };
}

/** FNV-1a over a string, as an unsigned 32-bit integer. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The same hash as eight hex digits — what a fingerprint component shows. */
export const digest = (text: string): string => hash32(text).toString(16).padStart(8, '0');

/* ================================================================== *
 * The fingerprint
 * ================================================================== */

/**
 * One named ingredient of the fingerprint.
 *
 * Named, because "the results differ" is a finding and "the results differ
 * because the estimator table moved" is a diagnosis. The list is also what
 * makes the fingerprint TESTABLE in the way it has to be: a test can walk the
 * components, change each one, and assert the fingerprint moved — which is a
 * statement about every ingredient rather than about the one someone
 * remembered to check.
 */
export interface FingerprintComponent {
  name: string;
  value: string;
  /** What this ingredient is, for a reader of the report. */
  describe: string;
}

/** Everything a v2 run's fingerprint is made of. */
export interface FingerprintInput {
  determinism: ResolvedDeterminism;
  /** Stable serialisation of the seed design (parts, values, topology). */
  design: string;
  /** Stable serialisation of the measurement set the run was judged on. */
  measurements: string;
  /** Stable serialisation of the ACTIVE gates and their limits. */
  gates: string;
  /** Stable serialisation of the ACTIVE budgets and the bounds they inverted to. */
  bounds: string;
  /** Stable serialisation of the tuner options that steer the search. */
  tuning: string;
}

export function fingerprintComponents(input: FingerprintInput): FingerprintComponent[] {
  const d = input.determinism;
  return [
    { name: 'engine', value: ENGINE_V2_VERSION, describe: 'the engine-v2 module version' },
    {
      name: 'estimators',
      value: digest(estimatorFingerprint()),
      describe: 'every extractor version, hashed — a bump anywhere lands here',
    },
    { name: 'seed', value: String(d.seed), describe: `run seed (${d.seedSource})` },
    {
      name: 'budget',
      value: d.budgetEvaluations === null ? 'tuner' : String(d.budgetEvaluations),
      describe: `evaluations per start (${d.budgetSource})`,
    },
    { name: 'starts', value: String(d.starts), describe: `starting points (${d.startsSource})` },
    { name: 'design', value: digest(input.design), describe: 'the seed network' },
    { name: 'measurements', value: digest(input.measurements), describe: 'the measurement set' },
    { name: 'gates', value: digest(input.gates), describe: 'the active gates and their limits' },
    { name: 'bounds', value: digest(input.bounds), describe: 'the active budgets and their inversions' },
    { name: 'tuning', value: digest(input.tuning), describe: 'the tuner options that steer the search' },
  ];
}

/**
 * The fingerprint itself: `name=value` pairs joined, in declaration order.
 *
 * Readable rather than hashed for the same reason `estimatorFingerprint`
 * is: a key a human can read is a key a human can debug, and this one is
 * short enough to print beside a result.
 */
export function fingerprintOf(components: readonly FingerprintComponent[]): string {
  return components.map((c) => `${c.name}=${c.value}`).join(' ');
}

/**
 * JSON with keys in sorted order, at every depth.
 *
 * Every serialisation that feeds the fingerprint goes through this, so two
 * structurally identical inputs cannot produce two different fingerprints
 * because a property was assigned in a different order.
 */
export function stableJson(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = walk(o[k]);
      return out;
    }
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    return v;
  };
  return JSON.stringify(walk(value));
}
