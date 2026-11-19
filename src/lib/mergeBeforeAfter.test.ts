/**
 * UI-8 — before and after the set-up in the merge tool (Sander, 19-11-2026). Two helpers with their own
 * claims, and a source scan on the step-4 charts: the tool draws the merge WITHOUT the set-up next to the
 * merge WITH it, but only where a stated plane reflection reaches the gate (UI-7: past the gate the two
 * are identical and two coincident lines would suggest a difference that is not there), and prints the
 * largest difference in dB with its frequency.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MERGE_BEFORE_AFTER_VERSION, largestDelta, setUpReachesGate } from './mergeBeforeAfter.ts';
import { arrivalMs, gateWeightAfterDirect, planeEchoDelayS, type Gate, type Impulse, type PlaneEcho } from './nfMergeV2.ts';

/** A far-field impulse with its direct arrival as a single spike 10 ms into a 48 kHz record. */
function spike(): Impulse {
  const samples = new Float64Array(2048);
  samples[480] = 1;
  return { name: 'far', sampleRate: 48000, samples, timeBase: 'session', alreadyGated: false };
}
const FAR = spike();
/** The gate of the kernel's synthetic bench: reference 0.4 ms before the arrival, 2.521 ms right, 25 % taper → gate end 2.121 ms after the direct sound. */
const GATE: Gate = { referenceMs: arrivalMs(FAR) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 };
const TABLE: PlaneEcho = { kind: 'plane', label: 'tafel', sourceAboveM: 0.3, micAboveM: 0.88, horizontalM: 1.0 }; // 1.14 ms: on the flat part
const FLOOR: PlaneEcho = { kind: 'plane', label: 'vloer', sourceAboveM: 0.9, micAboveM: 1.4, horizontalM: 1.0 }; // 4.05 ms: past the gate

describe(`mergeBeforeAfter (${MERGE_BEFORE_AFTER_VERSION}) — the largest difference, by hand`, () => {
  const freq = [100, 200, 400, 800, 1600];
  it('picks the admitted point where |after − before| is largest, and names its frequency', () => {
    const before = [0, 0, 0, 0, 0];
    const after = [0.5, -2, 1, 3, -0.25];
    expect(largestDelta(freq, before, after, () => true)).toEqual({ db: 3, hz: 800 });
    // the same data, the top point excluded by the mask → the next one wins
    expect(largestDelta(freq, before, after, (hz) => hz < 800)).toEqual({ db: 2, hz: 200 });
  });
  it('skips NaN on either side, and answers null — never 0 — when nothing is admitted', () => {
    expect(largestDelta(freq, [NaN, 0, 0, 0, 0], [5, 0, 0, 1, 0], () => true)).toEqual({ db: 1, hz: 800 });
    expect(largestDelta(freq, [0, 0, 0, 0, 0], [5, NaN, 0, 0, 0], (hz) => hz > 100)).toEqual({ db: 0, hz: 400 });
    expect(largestDelta(freq, [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], () => false)).toBeNull();
  });
  it('two equal merges read a difference of exactly 0 at the first admitted point — measured, and equal', () => {
    expect(largestDelta(freq, [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], () => true)).toEqual({ db: 0, hz: 100 });
  });
});

describe('mergeBeforeAfter — whether the set-up reaches the gate (the rule that says when there is a "before")', () => {
  it('premise: the table echo lands on the flat part of this gate (weight 1), the floor echo past its end (weight 0)', () => {
    expect(gateWeightAfterDirect({ gate: GATE, far: FAR }, planeEchoDelayS(TABLE) * 1000)).toBe(1);
    expect(gateWeightAfterDirect({ gate: GATE, far: FAR }, planeEchoDelayS(FLOOR) * 1000)).toBe(0);
  });
  it('a plane term inside the gate reaches it; one past the gate does not; a boundary term and no term never do', () => {
    expect(setUpReachesGate({ gate: GATE, far: FAR, echoes: [TABLE] })).toBe(true);
    expect(setUpReachesGate({ gate: GATE, far: FAR, echoes: [FLOOR] })).toBe(false);
    expect(setUpReachesGate({ gate: GATE, far: FAR, echoes: [FLOOR, TABLE] })).toBe(true);
    expect(setUpReachesGate({ gate: GATE, far: FAR, echoes: [{ kind: 'boundary', label: 'baffle', sourceAboveM: 0 }] })).toBe(false);
    expect(setUpReachesGate({ gate: GATE, far: FAR, echoes: [] })).toBe(false);
  });
  it('a longer gate admits the floor echo too — the rule follows the gate, not the echo', () => {
    const long: Gate = { ...GATE, rightMs: 8 };
    expect(setUpReachesGate({ gate: long, far: FAR, echoes: [FLOOR] })).toBe(true);
  });
});

describe('UI-8 — the step-4 charts draw before and after (source scan on NfMergeTool.tsx)', () => {
  const src = readFileSync(new URL('../components/NfMergeTool.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('the merge without the set-up is computed whenever a plane reflection is stated — no longer only while the box is off', () => {
    const m = src.match(/const bare = useMemo\(\s*\(\) => \(([^\n]*)\),/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/cur\?\.echoes\.some\(\(e\) => e\.kind === 'plane'\) \? compute\(active, cfg\[active\.stem\], false\) : null/);
    expect(m![1]).not.toMatch(/reflectionModel/);
  });
  it('the block "Before / after the set-up" draws BOTH merges whenever a plane reflection is stated — also when they are the same — and the solid lines below follow the one "reflection model" box', () => {
    // UI-8 nazorg — V15: WAS an overlay of two dotted lines inside the SPL chart, drawn only where a term
    // reached the gate (Sander: "ik zie geen voor en na"); IS its own block with two graphs side by side,
    // on one reference, shown whenever the set-up states a plane reflection.
    expect(src).toMatch(/const reaches = bareR !== null && setUpReachesGate\(inp\);/);
    expect(src).toMatch(/const r = !p\.reflectionModel && bareR \? bareR : withSetUp;/);
    expect(src).toMatch(/const top = Math\.max\(\.\.\.withSetUp\.spl\.filter/); // one reference for both merges
    expect(src).toMatch(/\{hasPlane && bareR && \(\s*<div className="nfm-chart nfm-before-after">/);
    expect(src).toMatch(/<Chart series=\{linesOf\(bareR, 'b'\)\}/);
    expect(src).toMatch(/<Chart series=\{linesOf\(withSetUp, 'a'\)\}/);
    expect(src).not.toMatch(/id: 'far-other'|id: 'res-other'/);
    expect(src.match(/type="checkbox" checked=\{p\.reflectionModel\}/g)?.length).toBe(1);
    expect(src).toMatch(/const resSrc = r;/);
  });
  it('the sentence above the pair names every stated reflection against the window end, and the largest difference only where a term reaches the gate', () => {
    expect(src).toMatch(/e\.ms < afterArr \? t\('\{l\} at \{ms\} ms, inside the window \(ends \{w\} ms after the direct sound\)'/);
    expect(src).toMatch(/t\('\{l\} at \{ms\} ms, past the window end \(\{w\} ms after the direct sound\)'/);
    expect(src).toMatch(/const deltaFar = bareR \? largestDelta\(grid, bareR\.farGatedDb, withSetUp\.farGatedDb, admitFar\) : null;/);
    expect(src).toMatch(/const admitFar = \(hz: number, i: number\) => mask\[i\] && hz >= spliceLo;/);
    expect(src).toMatch(/const deltaRes = bareR \? largestDelta\(grid, bareR\.spl, withSetUp\.spl, \(_hz, i\) => mask\[i\]\) : null;/);
    expect(src).toMatch(/reaches && deltaFar && deltaRes\s*\? t\('The reflection falls inside the window, so the merge divides it out of the far-field half: difference up to \{f\} dB at \{fh\} Hz \(far-field half\), up to \{r\} dB at \{rh\} Hz \(result\)\.'/);
    expect(src).toMatch(/The window already cuts the reflection out, so there is nothing to divide out: both merges are the same\./);
  });
});
