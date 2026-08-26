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
   * F1 pinned this to 'v1' whatever the flag said, because F1 shipped no
   * optimiser change at all. F2 delivers the v2 optimisation path — gates
   * M-A/M-B/M-C as feasibility filters and as hard bounds in the polish, a
   * seeded and budgeted search, measurement-derived search-space bounds — and
   * this field is now what selects it.
   *
   * IT IS A GUARD, NOT A LABEL. `runV2Optimization` refuses to run on a
   * selection that says 'v1', so there is no route into the v2 path that does
   * not pass through the flag. That is what keeps "toggle off = byte-identical"
   * a claim about code that cannot be reached, rather than about code that
   * chooses not to act — and it is why this field is worth having at all
   * instead of reading the boolean at the call site.
   *
   * The per-project gate limits and budgets the v2 path uses are settings
   * without defaults (P4): turning the engine on arms no limit by itself.
   *
   * TODO(F2b): v2-worker achter de toggle, eigen entry op de import-allowlist,
   * v1-worker onaangeraakt. As shipped, the v2 path is reachable through this
   * selection but the app's SCAN button still runs v1 — and the reason is the
   * toggle invariant itself. Gate enforcement has to happen inside the polish,
   * which means the module that runs the tuner must be able to call the metric
   * library; `optimWorker.ts` may not import `engine2/`, and adding it to
   * `toggleRegression`'s allow-list is a decision about that invariant rather
   * than a wiring detail. The fix is a SECOND worker that belongs to v2, on the
   * allow-list in its own right, with the v1 worker untouched so its
   * byte-identity claim needs no re-proving.
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
    optimizer: enabled ? 'v2' : 'v1',
    reporting: enabled,
    version: ENGINE_V2_VERSION,
    label: ENGINE_V2_LABEL,
  };
}

/** The selection an app with no v2 flag at all would have. */
export const ENGINE_V1_ONLY: EngineSelection = selectEngine(false);
