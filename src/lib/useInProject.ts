/**
 * I-4 B-4 nazorg — "Use in project…" never fails silently.
 *
 * Reproduced with empty storage (IndexedDB empty, no autosave, welcome never dismissed): the merge DID
 * land, but the tool then jumped to `#/`, the welcome card opened over the result, and its primary
 * choice ("Explore with the demo speaker") replaced the branch response with the demo file — while the
 * provenance card kept saying "merge v2 · from the merge tool". To the designer the first click had
 * done nothing; to the project card it had done something that was no longer true.
 *
 * The rules here, each one a pure function so a test can pin it:
 *  1. PREPARE: the branch file is built and parsed before anything is applied; any failure is a
 *     REASON, never a thrown error swallowed into a banner somewhere else.
 *  2. CONFIRM: "done" is read back from the project's state (the branch's response really is the
 *     file), not assumed from having called a setter. Not seen within the wait is an error with reason.
 *  3. THE CARD: a merge whose file is no longer the branch's response says so, by name.
 */
import { parseFrd } from './parsers/frd.ts';
import { branchFile, type MergeWay } from './mergeSession.ts';
import { isUncalibrated } from './mergeExport.ts';

export const USE_IN_PROJECT_VERSION = 'use-in-project/1.0';
/** How long the tool waits for the project to show the file before it reports that it did not. */
export const USE_CONFIRM_WAIT_MS = 3000;

type Parsed = ReturnType<typeof parseFrd>;

export type UseStatus =
  | { kind: 'idle' }
  | { kind: 'busy'; way: MergeWay; file: string }
  | { kind: 'done'; way: MergeWay; file: string }
  | { kind: 'error'; way: MergeWay | null; reason: string };

export type Prepared = { ok: true; file: { name: string; text: string }; frd: Parsed } | { ok: false; reason: string };

/** The name the branch's response will carry: one source keeps its own file, a pair becomes the sum. */
export function branchFileName(way: MergeWay, sources: readonly { name: string }[]): string {
  return sources.length === 1 ? sources[0].name : `${way}_merged_v2.frd`;
}

/**
 * I-4 level — a merge whose `Merge calibration` line says LEVEL RELATIVE: its shape is calibrated,
 * its level is the impulses' own scale (PIR + microphone file, no FRD export in the session).
 * Measured 14-11-2026 on casus 1: such a merge sits ~130 dB under an FRD export of the same
 * driver. Next to a branch on an absolute level the sum is not a loudspeaker.
 */
export function isLevelRelative(text: string): boolean {
  const m = /^\s*\*\s*Merge calibration\s*=\s*(.+)$/m.exec(text);
  return !!m && /LEVEL RELATIVE/.test(m[1]);
}

/** The project's other branches, as "Use in project" must see them: a response, or none. */
export type OtherBranch = { way: MergeWay; name: string; text: string };

/**
 * Why a merge may not land beside what the project holds, or null. A relative merge beside an
 * absolute branch (or the reverse) is refused with both named: the designer either loads the
 * session's FRD exports (near or far field — the level then follows) or hands every way over from
 * this session, so all are on one scale. A branch without a response constrains nothing.
 */
export function levelConflict(way: MergeWay, sources: readonly { name: string; text: string }[], others: readonly OtherBranch[]): string | null {
  const rel = sources.map((s) => isLevelRelative(s.text));
  if (rel.some(Boolean) && !rel.every(Boolean)) return `the ${way} merges are not on one level: ${sources.filter((_, i) => rel[i]).map((s) => s.name).join(', ')} LEVEL RELATIVE, the rest absolute — accept them under one calibration`;
  const mineRel = rel[0] ?? false;
  for (const o of others) {
    if (o.way === way) continue;
    const otherRel = isLevelRelative(o.text);
    if (otherRel === mineRel) continue;
    return mineRel
      ? `${sources.map((s) => s.name).join(' + ')} is on a RELATIVE level (PIR + microphone file: the impulses' own scale) while the project's ${o.way} branch (${o.name}) is on an absolute level — the sum would sit ~130 dB apart. Load this session's FRD exports (near or far field) so the level follows, or hand every way over from this session`
      : `${sources.map((s) => s.name).join(' + ')} is on an absolute level while the project's ${o.way} branch (${o.name}) is on a RELATIVE level (the impulses' own scale) — the sum would sit ~130 dB apart. Replace ${o.name} from a session with FRD exports, or hand every way over from the same session`;
  }
  return null;
}

/** Build and check the branch file before anything is applied. */
export function prepareBranchUse(way: MergeWay | '' | null, sources: readonly { name: string; text: string }[], others: readonly OtherBranch[] = []): Prepared {
  if (!way) return { ok: false, reason: 'no branch chosen' };
  if (sources.length === 0) return { ok: false, reason: `no accepted merge for the ${way} branch in this session` };
  /* I-4 PIR-only: the project takes what the export package would hold, and that refuses uncalibrated merges. */
  const raw = sources.filter((s) => isUncalibrated(s.text)).map((s) => s.name);
  if (raw.length) return { ok: false, reason: `not calibrated: ${raw.join(', ')} — choose a microphone calibration file for this session (or load its FRD exports), then accept again` };
  const level = levelConflict(way, sources, others);
  if (level) return { ok: false, reason: `level: ${level}` };
  let file: { name: string; text: string };
  try {
    file = branchFile(branchFileName(way, sources), sources);
  } catch (e) {
    return { ok: false, reason: `the ${way} file could not be built: ${e instanceof Error ? e.message : String(e)}` };
  }
  let frd: Parsed;
  try {
    frd = parseFrd(file.text);
  } catch (e) {
    return { ok: false, reason: `${file.name} could not be read back: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (frd.freq.length < 2) return { ok: false, reason: `${file.name} holds no response (${frd.freq.length} point(s))` };
  for (let i = 0; i < frd.freq.length; i++)
    if (!Number.isFinite(frd.spl[i]) || !Number.isFinite(frd.phase[i]))
      return { ok: false, reason: `${file.name} has a non-finite value at ${frd.freq[i]} Hz` };
  return { ok: true, file, frd };
}

/**
 * UI-6 — "Use all in project": every way of the plan at once. The level check of each way sees the
 * OTHER ways as they will be after the hand-over (the plan's own files) plus the project's branches
 * the plan does not replace — so three relative merges from one session land together where
 * one-at-a-time would have refused the first against the demo's absolute tweeter.
 */
export function prepareAllBranchUse(
  plan: readonly { way: MergeWay; sources: readonly { name: string; text: string }[] }[],
  project: readonly OtherBranch[],
): Partial<Record<MergeWay, Prepared>> {
  const built: Partial<Record<MergeWay, { name: string; text: string }>> = {};
  for (const p of plan) {
    try {
      if (p.sources.length) built[p.way] = branchFile(branchFileName(p.way, p.sources), p.sources);
    } catch {
      /* the per-way prepare below reports it */
    }
  }
  const out: Partial<Record<MergeWay, Prepared>> = {};
  for (const p of plan) {
    const others: OtherBranch[] = [
      ...plan.filter((q) => q.way !== p.way && built[q.way]).map((q) => ({ way: q.way, name: built[q.way]!.name, text: built[q.way]!.text })),
      ...project.filter((o) => o.way !== p.way && !plan.some((q) => q.way === o.way)),
    ];
    out[p.way] = prepareBranchUse(p.way, p.sources, others);
  }
  return out;
}

/**
 * The status, read back from the project: done when the branch's response is the file and the
 * provenance record holds the sources; still busy until the wait runs out; then an error that says
 * what the branch holds instead.
 */
export function confirmBranchUse(
  busy: { way: MergeWay; file: string },
  project: { responseName: string | null; recordedSources: number },
  waitedMs: number,
): UseStatus {
  if (project.responseName === busy.file && project.recordedSources > 0) return { kind: 'done', way: busy.way, file: busy.file };
  if (waitedMs < USE_CONFIRM_WAIT_MS) return { kind: 'busy', way: busy.way, file: busy.file };
  return {
    kind: 'error',
    way: busy.way,
    reason:
      project.responseName === null
        ? `the project's ${busy.way} branch did not take ${busy.file}: it has no response`
        : `the project's ${busy.way} branch did not take ${busy.file}: it still uses ${project.responseName}`,
  };
}

/** What the provenance card on the project step may say about a merge it recorded. */
export function mergeCardState(
  way: MergeWay,
  recorded: readonly { name: string }[],
  responseName: string | null,
): { kind: 'none' } | { kind: 'applied'; file: string } | { kind: 'replaced'; file: string; now: string | null } {
  if (recorded.length === 0) return { kind: 'none' };
  const file = branchFileName(way, recorded);
  return responseName === file ? { kind: 'applied', file } : { kind: 'replaced', file, now: responseName };
}
