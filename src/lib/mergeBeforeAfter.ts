/**
 * UI-8 — "before and after" of the set-up in the merge tool (Sander, 19-11-2026: "kunnen we een voor en
 * na overzicht erbij krijgen, zodoende we visueel zien wat er gebeurt?").
 *
 * UI-7 taught that a stated reflection changes the far-field half of a merge only where the gate still
 * holds the echo; a sentence in the notes says so, and a sentence is not what a reader checks a graph
 * with. The tool now draws the merge WITH the set-up and the merge WITHOUT it on one graph, and prints the
 * largest difference in decibels with the frequency where it sits. This module is the arithmetic of that
 * sentence — one reader (the step-4 charts), tested on its own — and the rule that says when there is
 * something to show at all: a plane term the gate removed entirely leaves before and after identical,
 * and drawing two coincident lines would suggest a difference that is not there.
 *
 * No engine import, no merge recomputed here: both results come from the kernel as it is.
 */
import { gateWeightAfterDirect, planeEchoDelayS, type MergeV2Input } from './nfMergeV2.ts';

export const MERGE_BEFORE_AFTER_VERSION = 'merge-before-after/1.0';

export interface LargestDelta {
  /** |after − before| in dB at the point where it is largest, over the points the mask admits. */
  db: number;
  hz: number;
}

/**
 * The largest |after − before| over the grid, restricted to the admitted points (NaN on either side
 * is skipped). `null` when nothing is admitted — never 0, which would read as "measured, and equal".
 */
export function largestDelta(freq: readonly number[], before: readonly number[], after: readonly number[], admit: (hz: number, i: number) => boolean): LargestDelta | null {
  let best: LargestDelta | null = null;
  const n = Math.min(freq.length, before.length, after.length);
  for (let i = 0; i < n; i++) {
    if (!admit(freq[i], i)) continue;
    const d = Math.abs(after[i] - before[i]);
    if (!Number.isFinite(d)) continue;
    if (!best || d > best.db) best = { db: d, hz: freq[i] };
  }
  return best;
}

/**
 * Whether a stated plane reflection REACHES the gate of this merge — i.e. whether the kernel divides
 * anything out of the far-field half (UI-7: a term past the gate end is removed by the gate, not divided
 * out). Only then is there a "before" that differs from the "after".
 */
export function setUpReachesGate(input: Pick<MergeV2Input, 'gate' | 'far' | 'echoes'>): boolean {
  return input.echoes.some((e) => e.kind === 'plane' && gateWeightAfterDirect(input, planeEchoDelayS(e) * 1000) > 0);
}
