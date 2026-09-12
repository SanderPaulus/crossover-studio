/**
 * A5.3 — THE CAPABILITY MATRIX: metric x subject -> on/off, with the reason.
 *
 * This is what P4 looks like when it is implemented rather than intended. The
 * principle says a metric that needs input it does not have stays OFF and the
 * UI shows which constraints are active; the failure mode it guards against is
 * a metric that quietly evaluates on an assumed default and contributes a
 * number nobody asked for.
 *
 * The matrix is GENERATED from the metric declarations, never maintained
 * beside them. Add a data need to a declaration and the reason appears here;
 * there is no second list to forget.
 *
 * It lives at engine2 level rather than inside `ingest/` because it is the
 * JOIN of the ingest pass and the metric register — putting it in either would
 * make that module import the other.
 */

import { METRIC_DECLARATIONS, subjectsFor } from './metrics/registry.ts';
import type { MetricContext, MetricDeclaration, MetricId } from './metrics/types.ts';

export interface CapabilityCell {
  metric: MetricId;
  title: string;
  /** Driver id, pair key, or 'system'. */
  subject: string;
  active: boolean;
  /** Empty when active; one entry per unmet data need otherwise. */
  reasons: string[];
  /** The role A4 gives this metric in the finished engine (F2/F3), not in F1. */
  role: MetricDeclaration['role'];
  specRef: string;
  uncalibrated?: string;
}

export interface CapabilityMatrix {
  cells: CapabilityCell[];
  /** Subjects, in the order the report shows them. */
  subjects: string[];
  metrics: MetricId[];
  /** One line per off cell, ready for the panel. */
  describeOff: string[];
}

/**
 * E-5 — THE SUBJECT A PROJECT DOES NOT HAVE.
 *
 * `subjectsFor` returns the driver ids for a per-driver metric and the adjacent
 * pairs for a per-pair one, so on a project with one measured way the pair
 * metrics have NO subject and on one with none the driver metrics have none
 * either. Until E-5 those metrics were still listed in `metrics` and had no
 * cell at all, and the panel's grid read `cells.find(…)!` — so removing files
 * from the inventory until one way was left crashed the render with "Cannot
 * read properties of undefined (reading 'title')" and a black screen (measured,
 * and reproduced in `capability.test.ts`).
 *
 * The repair is not a guard in the renderer. A metric that cannot run because
 * its SUBJECT does not exist is the same state as one that cannot run because
 * an input is missing, and P4 says that state is reported with its reason. So
 * it gets a cell, off, on this subject — which appears as a column only on a
 * project that actually has a metric with nothing to point at.
 */
export const NO_SUBJECT = 'no subject';

export function buildCapabilityMatrix(ctx: MetricContext): CapabilityMatrix {
  const cells: CapabilityCell[] = [];
  const subjects = new Set<string>();
  for (const decl of METRIC_DECLARATIONS) {
    const own = subjectsFor(decl, ctx);
    if (own.length === 0) {
      subjects.add(NO_SUBJECT);
      cells.push({
        metric: decl.id,
        title: decl.title,
        subject: NO_SUBJECT,
        active: false,
        reasons: [
          decl.scope === 'pair'
            ? `this metric judges a HANDOVER and the project has ${ctx.driversLowToHigh.length} ` +
              'measured way(s), so there is no adjacent pair to judge'
            : 'this metric judges a DRIVER and the project has no measured way',
        ],
        role: decl.role,
        specRef: decl.specRef,
        uncalibrated: decl.uncalibrated,
      });
      continue;
    }
    for (const subject of own) {
      subjects.add(subject);
      const reasons = decl.needs
        .filter((n) => !n.met(ctx, subject === 'system' ? null : subject))
        .map((n) => n.describe);
      cells.push({
        metric: decl.id,
        title: decl.title,
        subject,
        active: reasons.length === 0,
        reasons,
        role: decl.role,
        specRef: decl.specRef,
        uncalibrated: decl.uncalibrated,
      });
    }
  }
  return {
    cells,
    subjects: [...subjects],
    metrics: METRIC_DECLARATIONS.map((m) => m.id),
    describeOff: cells
      .filter((c) => !c.active)
      .map((c) => `${c.metric} off for ${c.subject}: ${c.reasons.join('; ')}`),
  };
}

/** Whether one metric is active for one subject. */
export function isActive(matrix: CapabilityMatrix, metric: MetricId, subject: string): boolean {
  return matrix.cells.some((c) => c.metric === metric && c.subject === subject && c.active);
}
