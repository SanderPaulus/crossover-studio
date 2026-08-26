/**
 * F2b — what the scan table's GATE column says about one candidate.
 *
 * A pure reduction of the verdicts to a cell state, and it decides NOTHING.
 * Every judgement it reports was made by `judge()` in `gates.ts` and arrives
 * as `GateVerdict.pass`; this function chooses which of four shapes the cell
 * has and which verdicts to name. That separation is the point: a comparison
 * written here — even one that agrees with the metric library today — is how a
 * row comes to be flagged by the table and passed by the ranking, which is the
 * bug `impedanceFloor.ts` was consolidated to end.
 *
 * No wording, no translation, no glyphs. The caller renders it, so this module
 * stays free of the UI and testable without one.
 */

import type { GateId, GateVerdict } from './gates.ts';

export interface GateCellState {
  /**
   * 'absent'  — this candidate did not come from a v2 run; nothing judged it.
   * 'noLimit' — a v2 run, but the project stated no limit: every gate reported
   *             its value and judged nothing (P4).
   * 'pass'    — inside every stated limit.
   * 'fail'    — outside at least one.
   */
  kind: 'absent' | 'noLimit' | 'pass' | 'fail';
  /** How many gates were actually judging. */
  activeCount: number;
  /** The gates that failed, in declaration order. Empty unless `kind` is 'fail'. */
  failed: GateId[];
  /** One line per gate that has something to say — for the cell's tooltip. */
  detail: string[];
  /** The engine's own sentence naming every failure; null when nothing failed. */
  violation: string | null;
}

export function gateCellState(
  entry?: { verdicts: readonly GateVerdict[]; violation: string | null } | null,
): GateCellState {
  if (!entry) {
    return { kind: 'absent', activeCount: 0, failed: [], detail: [], violation: null };
  }
  const line = (v: GateVerdict): string =>
    `${v.gate}${v.subject === 'system' ? '' : ` (${v.subject})`}: ${v.reason}`;
  const active = entry.verdicts.filter((v) => v.active);
  if (active.length === 0) {
    // Every gate still reports its VALUE — that is P4's visible half, and a
    // cell that showed nothing here would hide the number the designer needs
    // in order to decide what limit to set.
    return {
      kind: 'noLimit',
      activeCount: 0,
      failed: [],
      detail: entry.verdicts.map(line),
      violation: null,
    };
  }
  const failed = active.filter((v) => !v.pass);
  return {
    kind: failed.length > 0 ? 'fail' : 'pass',
    activeCount: active.length,
    failed: failed.map((v) => v.gate),
    detail: active.map(line),
    violation: entry.violation,
  };
}
