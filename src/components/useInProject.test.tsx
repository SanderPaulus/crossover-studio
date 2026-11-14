/**
 * I-4 B-4 nazorg — "Use in project…" never fails silently (Sander, 14-11-2026).
 *
 * Reproduced in the browser with empty storage (IndexedDB empty, no autosave, welcome never
 * dismissed): the merge landed, the tool jumped to `#/`, the welcome card opened over it, and its
 * primary choice (the demo) replaced the mid with `mid-hor0.txt` — while the provenance card kept
 * saying "merge v2 · from the merge tool". The claims: the file is built and read back before it is
 * applied and a failure is a REASON; "done" is read back from the project; the status line renders
 * busy, done and failed-with-reason (the claim Sander asked for); a merge whose file was replaced
 * says so by name; and the app no longer jumps away or lets the welcome card open over a used merge.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { UseStatusLine } from './NfMergeTool.tsx';
import {
  branchFileName,
  confirmBranchUse,
  mergeCardState,
  prepareBranchUse,
  USE_CONFIRM_WAIT_MS,
} from '../lib/useInProject.ts';

const dir = new URL('../../test-fixtures/koan_2026-11_merge_v2/', import.meta.url);
const file = (n: string) => ({ name: n, text: readFileSync(new URL(n, dir), 'utf8') });
const mid = file('mid_merged_v2.frd');
const wDown = file('woofer_down_merged_v2.frd');
const wUp = file('woofer_up_merged_v2.frd');
const src = (s: string) => readFileSync(new URL(s, import.meta.url), 'utf8');

describe('I-4 B-4 nazorg — Use in project never fails silently', () => {
  it('prepare: the branch file is built and read back first, and every failure is a reason', () => {
    const one = prepareBranchUse('mid', [mid]);
    expect(one.ok).toBe(true);
    if (one.ok) expect(one.file.name).toBe('mid_merged_v2.frd');
    const pair = prepareBranchUse('low', [wDown, wUp]);
    expect(pair.ok).toBe(true);
    if (pair.ok) expect(pair.file.name).toBe('low_merged_v2.frd');
    expect(branchFileName('low', [wDown, wUp])).toBe('low_merged_v2.frd');

    const noWay = prepareBranchUse('', [mid]);
    expect(noWay).toEqual({ ok: false, reason: 'no branch chosen' });
    const none = prepareBranchUse('high', []);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.reason).toMatch(/no accepted merge for the high branch/);
    // A pair that is not on one grid cannot be summed: the reason names it, nothing is thrown.
    const lines = wUp.text.split('\n');
    const short = { name: wUp.name, text: lines.slice(0, lines.length - 20).join('\n') };
    const offGrid = prepareBranchUse('low', [wDown, short]);
    expect(offGrid.ok).toBe(false);
    if (!offGrid.ok) expect(offGrid.reason).toMatch(/could not be built: .*not on the same grid/);
    const garbage = prepareBranchUse('mid', [{ name: 'x.frd', text: 'nothing here' }]);
    expect(garbage.ok).toBe(false);
  });

  it('confirm: done only when the project shows the file; otherwise busy, then an error that says what the branch holds', () => {
    const busy = { way: 'mid' as const, file: 'mid_merged_v2.frd' };
    expect(confirmBranchUse(busy, { responseName: 'mid_merged_v2.frd', recordedSources: 1 }, 10).kind).toBe('done');
    expect(confirmBranchUse(busy, { responseName: 'mid-hor0.txt', recordedSources: 1 }, 10).kind).toBe('busy');
    const late = confirmBranchUse(busy, { responseName: 'mid-hor0.txt', recordedSources: 1 }, USE_CONFIRM_WAIT_MS);
    expect(late).toEqual({ kind: 'error', way: 'mid', reason: "the project's mid branch did not take mid_merged_v2.frd: it still uses mid-hor0.txt" });
    const empty = confirmBranchUse(busy, { responseName: null, recordedSources: 0 }, USE_CONFIRM_WAIT_MS);
    expect(empty.kind === 'error' && empty.reason).toMatch(/it has no response/);
    // The response alone is not enough: the provenance record must hold the sources too.
    expect(confirmBranchUse(busy, { responseName: 'mid_merged_v2.frd', recordedSources: 0 }, 10).kind).toBe('busy');
  });

  it('THE STATUS LINE: a failure is visible with its reason; busy and done are said too; idle says nothing', () => {
    const err = renderToStaticMarkup(<UseStatusLine status={{ kind: 'error', way: 'mid', reason: "the project's mid branch did not take mid_merged_v2.frd: it still uses mid-hor0.txt" }} />);
    expect(err).toContain('role="alert"');
    expect(err).toContain('Not used in the project');
    expect(err).toContain('it still uses mid-hor0.txt');
    const busy = renderToStaticMarkup(<UseStatusLine status={{ kind: 'busy', way: 'mid', file: 'mid_merged_v2.frd' }} />);
    expect(busy).toContain('role="status"');
    expect(busy).toContain('Busy');
    const done = renderToStaticMarkup(<UseStatusLine status={{ kind: 'done', way: 'low', file: 'low_merged_v2.frd' }} />);
    expect(done).toContain('low_merged_v2.frd');
    expect(done).toContain('href="#/"');
    expect(renderToStaticMarkup(<UseStatusLine status={{ kind: 'idle' }} />)).toBe('');
  });

  it('THE CARD: a merge whose file was replaced afterwards (the demo) says so by name, instead of claiming it is in the design', () => {
    expect(mergeCardState('mid', [], 'mid-hor0.txt')).toEqual({ kind: 'none' });
    expect(mergeCardState('mid', [mid], 'mid_merged_v2.frd')).toEqual({ kind: 'applied', file: 'mid_merged_v2.frd' });
    expect(mergeCardState('mid', [mid], 'mid-hor0.txt')).toEqual({ kind: 'replaced', file: 'mid_merged_v2.frd', now: 'mid-hor0.txt' });
    expect(mergeCardState('low', [wDown, wUp], 'low_merged_v2.frd').kind).toBe('applied');
  });

  it('the wiring: the app returns the result, stays on the tool, and keeps the welcome card off a used merge; the tool reads it back', () => {
    const app = src('../App.tsx');
    const accept = app.slice(app.indexOf('const acceptMergeV2 = useCallback('), app.indexOf('const mergeGeometry'));
    expect(accept).toContain('prepareBranchUse(role, sources)');
    expect(accept).toMatch(/if \(!prep\.ok\) return prep;/);
    expect(accept).toContain("localStorage.setItem('ads-welcomed', '1')");
    expect(accept).not.toContain('setError(');
    const page = app.slice(app.indexOf('<NfMergeTool'), app.indexOf('</main>', app.indexOf('<NfMergeTool')));
    expect(page).toContain('onUse={acceptMergeV2}');
    expect(page).toContain('responseNames={{ low: woofer?.name ?? null, mid: midDrv?.name ?? null, high: tweeter?.name ?? null }}');
    expect(page).not.toContain("location.hash = '#/'");
    expect(app).toContain('mergeCardState(role, mergeV2[role], loadedDrv?.name ?? null)');
    const tool = src('./NfMergeTool.tsx');
    expect(tool).toMatch(/if \(!res\.ok\) setUse\(\{ kind: 'error', way, reason: res\.reason \}\)/);
    expect(tool).toContain('confirmBranchUse(use, { responseName: p.responseNames[use.way]');
    expect(tool).toContain('<UseStatusLine status={use} />');
  });
});
