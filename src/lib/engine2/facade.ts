/**
 * THE ENGINE FAÇADE — since U-10 fase 3 (Sander, 25-10-2026) only the mark.
 *
 * WHAT STOOD HERE: one flag (`engineV2Enabled`), read once by `selectEngine`
 * and turned into an `EngineSelection` that said which engine each subsystem
 * ran on, with the guarantee "flag off = the app is byte-identical to the app
 * before engine2 existed". Since U-1 the flag could not be switched from the
 * interface; since U-10 fase 1 no UI route reaches the v1 search except the
 * two named exceptions; since fase 2 the invariant is the MOTOR BOUNDARY
 * (CLAUDE.md, hard rules), proved by `toggleRegression.test.ts`. So the flag,
 * the selection and its guard in `runV2Optimization` went in fase 3.
 *
 * The two properties the boundary rests on are unchanged and still load-bearing:
 * everything under `engine2/` is PURE (importing it changes nothing; only
 * calling it does), and the shared motor never imports engine2.
 */

import { ENGINE_V2_LABEL, ENGINE_V2_VERSION } from './version.ts';

/** `label · version`, the mark every v2 surface carries. */
export function engineV2Mark(): string {
  return `${ENGINE_V2_LABEL} · ${ENGINE_V2_VERSION}`;
}
