/**
 * THE ENGINE FAÇADE — one flag, one place that reads it (Deliverable 1).
 *
 * WHY A FAÇADE AND NOT AN `if (engineV2Enabled)` AT EVERY CALL SITE.
 * F1 only switches on a reporting layer. F2 switches the OPTIMIZER's gates,
 * F3 its soft goals. If each of those phases teaches its own call sites to
 * read the flag, the flag stops being one decision and becomes a dozen, and
 * the "toggle off = byte-identical" guarantee has to be re-proved for each of
 * them separately. So the flag is read exactly once, here, and turned into a
 * SELECTION that says which engine each subsystem runs on. F2+ adds a field to
 * `EngineSelection` and wires the optimizer to it; nothing else moves.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT.
 * With the flag off the app must behave EXACTLY as it did before engine2
 * existed — not "equivalently", not "within rounding": byte-identical, and
 * `toggleRegression.test.ts` proves it by running a reference optimisation
 * with and without the v2 modules loaded and comparing the serialised results
 * character for character.
 *
 * Two properties make that possible, and both are load-bearing:
 *
 *   1. Everything under `engine2/` is PURE. No module-level mutation, no
 *      monkey-patching, no registration into a shared registry, no clock, no
 *      randomness. Importing engine2 changes nothing; only CALLING it does.
 *   2. The existing engine never imports engine2. The dependency arrow points
 *      one way only, and `toggleRegression.test.ts` asserts that too, by
 *      scanning the pre-v2 modules for an `engine2/` import.
 *
 * If you ever need engine2 to change something the old engine does, that is
 * F2 and it belongs behind `selection.optimizer`, not behind a side effect.
 */

import { ENGINE_V2_LABEL, ENGINE_V2_VERSION } from './version.ts';

/** Which implementation a subsystem runs on. */
export type EngineId = 'v1' | 'v2';

export interface EngineSelection {
  /**
   * The engine the OPTIMISER runs on.
   *
   * F1 pins this to 'v1' whatever the flag says, because F1 ships no optimiser
   * changes at all — the toggle switches on reporting and nothing else. The
   * field exists now so that F2 can start returning 'v2' here without any
   * caller being rewritten.
   *
   * TODO(F2, spec A6): gates M-A/M-B/M-C move into the engine and this becomes
   * `enabled ? 'v2' : 'v1'`. The per-project gate limits that F2 needs are
   * settings, not defaults (P4).
   */
  optimizer: EngineId;
  /** Whether the v2 REPORTING layer (ingest pass + metric library) is shown. */
  reporting: boolean;
  /** Module version, stamped on everything the reporting layer renders. */
  version: string;
  /** Human label the UI puts in front of that version. */
  label: string;
}

/** `label · version`, the mark every v2 surface carries. */
export function engineV2Mark(): string {
  return `${ENGINE_V2_LABEL} · ${ENGINE_V2_VERSION}`;
}

/**
 * Turn the stored flag into a selection.
 *
 * `undefined` is the same as `false` on purpose: a project file written before
 * the toggle existed has no field, and P4 says the experimental engine is off
 * until someone turns it on. There is no configuration in which absence means
 * "on".
 */
export function selectEngine(engineV2Enabled: boolean | undefined): EngineSelection {
  const enabled = engineV2Enabled === true;
  return {
    optimizer: 'v1',
    reporting: enabled,
    version: ENGINE_V2_VERSION,
    label: ENGINE_V2_LABEL,
  };
}

/** The selection an app with no v2 flag at all would have. */
export const ENGINE_V1_ONLY: EngineSelection = selectEngine(false);
