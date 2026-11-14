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

/** Build and check the branch file before anything is applied. */
export function prepareBranchUse(way: MergeWay | '' | null, sources: readonly { name: string; text: string }[]): Prepared {
  if (!way) return { ok: false, reason: 'no branch chosen' };
  if (sources.length === 0) return { ok: false, reason: `no accepted merge for the ${way} branch in this session` };
  /* I-4 PIR-only: the project takes what the export package would hold, and that refuses uncalibrated merges. */
  const raw = sources.filter((s) => isUncalibrated(s.text)).map((s) => s.name);
  if (raw.length) return { ok: false, reason: `not calibrated: ${raw.join(', ')} — choose a microphone calibration file for this session (or load its FRD exports), then accept again` };
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
