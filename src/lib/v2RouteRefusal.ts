/**
 * U-10 fase 1 — WHEN A RUN DOES NOT START, AND WHY; AND THE TWO ROUTES THAT
 * STAY ON v1 BY NAME.
 *
 * THE REFUSAL. Until U-10 a run whose v2 report could not be built (it threw,
 * or holds fewer than two branches) derived no A5d.3 window and generated its
 * candidates with the v1 generator — `crossoverVariants` /
 * `crossover3Variants` on the hidden v1 thresholds, the axis-by-axis scan, the
 * inherited `hpLpPref` structures (docs/U-10_v1_inventaris.md §3), quietly
 * steered by controls the interface no longer shows. Sander, 25-10-2026
 * (B-4.2): it REFUSES, with the reason. Not a defined v2 field in its place:
 * the only source of a window is the report that just failed, and a window
 * invented without it is a hidden default (P4).
 *
 * THE TWO NAMED EXCEPTIONS (Sander, 25-10-2026, the corrections on B-4.2).
 * Neither is refused, neither is removed in phase 3, and both are named in the
 * inventory and in the engine-boundary invariant:
 *
 *   · a TWO-WAY WITHOUT MEASURED IMPEDANCES keeps its virtual-filter route
 *     (`vfRounds`). A v2 version of it is a later session (open point).
 *   · a SINGLE DRIVER keeps its solo route (`soloChain`, and the v1 tune and
 *     minimise of a solo network). One driver has no handover, so there will be
 *     no v2 version: the per-handover v2 requirements do not apply.
 *
 * Both say what they are on every run (`VIRTUAL_FILTERS_ONLY_NOTE`,
 * `SOLO_DESIGN_NOTE`), and both read the v2 search smoothing instead of the
 * hidden v1 "Error smoothing" (U-9 hid the field; these routes were the last it
 * steered unseen).
 *
 * A PURE DECISION, the `selectFromShortlist` shape (UI-1): the layer between a
 * rule and the app state is where this project has paid before, so the rule is
 * a value a test can read and `App.tsx` applies it. No engine import — the
 * report reaches this function as data, structurally typed.
 */

export const V2_ROUTE_REFUSAL_VERSION = 'v2-route-refusal/1.0';

/**
 * What the virtual-filter exception says on every run, verbatim (Sander,
 * 25-10-2026). The English key carries Sander's Dutch sentence in
 * `src/i18n/nl.ts`; `v2RouteRefusal.test.ts` pins both.
 */
export const VIRTUAL_FILTERS_ONLY_NOTE =
  'Without impedance measurements: virtual filters only. Electrical requirements (floor, EPDR, dissipation) are not judged.';

/** What the solo exception says on every run, verbatim (Sander, 25-10-2026). */
export const SOLO_DESIGN_NOTE =
  'Solo design: one driver, no handover — the per-handover v2 requirements do not apply here.';

/** The named exception: a two-way with no measured impedance runs the virtual-filter rounds. */
export function isVirtualFilterOnlyRoute(a: { solo: boolean; threeWay: boolean; impedanceCount: number }): boolean {
  return !a.solo && !a.threeWay && a.impedanceCount === 0;
}

export type V2RouteRefusalKind = 'no-report' | 'no-window';

export interface V2RouteRefusal {
  kind: V2RouteRefusalKind;
  /** The sentence the run prints instead of starting. Names the missing input. */
  reason: string;
}

export interface V2RouteRefusalInput {
  /** A single driver is being designed (the solo route — a named exception). */
  solo: boolean;
  /** How many measured impedances the project holds (none = the virtual-filter exception). */
  impedanceCount: number;
  /** The run's v2 report, or null when it could not be built. */
  report: { predesign: { windowInputs: readonly unknown[] } } | null;
  /** The message the report builder caught, when it threw. */
  reportError?: string | null;
}

export function v2RouteRefusal(a: V2RouteRefusalInput): V2RouteRefusal | null {
  /* The two named exceptions need no report and are never refused here. A
   * three-way without impedances keeps its own message in the app. */
  if (a.solo) return null;
  if (a.impedanceCount === 0) return null;
  if (a.report === null) {
    return {
      kind: 'no-report',
      reason:
        'no crossover window can be derived: the Engine v2 report could not be built' +
        (a.reportError ? ` (${a.reportError})` : '') +
        '. Nothing is run on a guessed window — fix what the report panel names first.',
    };
  }
  if (a.report.predesign.windowInputs.length === 0) {
    return {
      kind: 'no-window',
      reason:
        'no crossover window can be derived: the report holds fewer than two measured ways, so there is ' +
        'no handover to derive one for.',
    };
  }
  return null;
}
