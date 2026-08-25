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

export function buildCapabilityMatrix(ctx: MetricContext): CapabilityMatrix {
  const cells: CapabilityCell[] = [];
  const subjects = new Set<string>();
  for (const decl of METRIC_DECLARATIONS) {
    for (const subject of subjectsFor(decl, ctx)) {
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
