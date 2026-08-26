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
 *
 * WHY MEASUREMENT FACTS ALSO SIT BEHIND THE FLAG — A DELIBERATE CHOICE, NOT AN
 * OVERSIGHT (F3b).
 *
 * `reporting` gates two things that do not look like reporting: the A5a
 * per-branch measurement form (acoustic centre, rotational symmetry, measured
 * DC resistance, manual window times) and the R_e fields beside it. Those are
 * FACTS ABOUT A MEASUREMENT SESSION — a meter reading and the window a gate
 * was taken with stay true whichever engine reads them — so on the face of it
 * they belong in the main layer.
 *
 * They are behind the flag anyway, for one reason: the invariant above says
 * that with the flag off the app is byte-identical to the app before engine2
 * existed, and a form that renders is not byte-identical to a form that does
 * not. Nothing else consumes these fields today, so gating them costs nothing
 * and keeps the guarantee absolute rather than nearly absolute.
 *
 * THE DAY THAT CHANGES IS THE DAY v2 BECOMES THE DEFAULT. When the flag stops
 * being an opt-in, these fields move to the main layer with it — they will
 * have consumers outside engine2 by then, and the invariant they are protecting
 * will no longer exist. Until then, moving them out is a REGRESSION of the
 * toggle guarantee, not a tidy-up, and `toggleRegression.test.ts` fails if
 * someone tries.
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
   * DONE at F2b — the scan button reads this field. With 'v2' selected the
   * candidates run on `engine2/optimizer/worker.ts`, a second worker entry
   * that enforces the gates inside the polish and returns a verdict per
   * candidate; `optimWorker.ts` is byte-untouched and a standing test pins
   * that it still imports nothing from `engine2/`. The allow-list entry that
   * made this possible is `optimClient.ts`, and the reason is recorded beside
   * it in `toggleRegression.test.ts`: one client, so one cancel path.
   *
   * TODO(F2c): the TWO-WAY scan route (`runChainScan`) still runs on v1. The
   * client half is already there — `runChainScanV2` exists and is typed — but
   * that route carries its own rescue semantics (a truly-free single candidate
   * runs first and only then appends pinned follow-ups), and porting them is a
   * behavioural change to a path this phase promised not to touch. Until it is
   * wired, the app SAYS so beneath the scan table rather than showing a table
   * that merely looks unjudged.
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
