import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BOOT_DEFER_FALLBACK_MS,
  releaseAfterPaint,
  shouldDeferOnBoot,
  type PaintScheduler,
} from './bootDefer.ts';

/**
 * D-0 — the boot deferral, and what it must never do.
 *
 * The whole value of this gate is that it releases. It starts CLOSED whenever
 * there is a stored project, and a path that leaves without opening it hides
 * the Engine v2 panel for the rest of the session — so most of the claims here
 * are about the uninteresting exits rather than the happy one.
 */

/** A scheduler that fires nothing until asked, so each ordering is a claim. */
function fakeScheduler() {
  const frames: (() => void)[] = [];
  const timers: { cb: () => void; ms: number }[] = [];
  const cancelledFrames: number[] = [];
  const clearedTimers: number[] = [];
  const w: PaintScheduler = {
    requestAnimationFrame: (cb) => { frames.push(cb); return frames.length; },
    cancelAnimationFrame: (h) => { cancelledFrames.push(h); },
    setTimeout: (cb, ms) => { timers.push({ cb, ms }); return 1000 + timers.length; },
    clearTimeout: (h) => { clearedTimers.push(h); },
  };
  return {
    w, frames, timers, cancelledFrames, clearedTimers,
    /** Run the frame callbacks queued so far, once each. */
    paint() { const q = frames.splice(0); for (const f of q) f(); },
    fireTimer() { const q = timers.splice(0); for (const t of q) t.cb(); },
  };
}

describe('D-0 — shouldDeferOnBoot', () => {
  it('defers only when there is something to restore', () => {
    expect(shouldDeferOnBoot(() => 'gz:something')).toBe(true);
    expect(shouldDeferOnBoot(() => null)).toBe(false);
    /* An empty string is not a project. */
    expect(shouldDeferOnBoot(() => '')).toBe(false);
  });

  it('does not defer when storage itself throws', () => {
    /* Private mode, blocked site data. Nothing will be restored either, so the
       report must be built exactly as it is on a fresh visit. */
    expect(
      shouldDeferOnBoot(() => {
        throw new Error('SecurityError');
      }),
    ).toBe(false);
  });
});

describe('D-0 — releaseAfterPaint', () => {
  it('waits for the SECOND frame: one frame is still before the paint', () => {
    const s = fakeScheduler();
    let released = 0;
    releaseAfterPaint(() => { released += 1; }, s.w);
    expect(released).toBe(0);
    s.paint(); // first frame: schedules the second, releases nothing
    expect(released).toBe(0);
    s.paint(); // second frame: the pixels are on screen
    expect(released).toBe(1);
  });

  it('releases when frames never come at all (a hidden tab) — after TWO looks', () => {
    const s = fakeScheduler();
    let released = 0;
    releaseAfterPaint(() => { released += 1; }, s.w);
    expect(s.timers[0].ms).toBe(BOOT_DEFER_FALLBACK_MS);
    s.fireTimer();                 // look 1: nothing seen yet, so wait once more
    expect(released).toBe(0);
    s.fireTimer();                 // look 2: still nothing painting
    expect(released).toBe(1);
  });

  it('THE BUG: a look that lands after a long hold does not pre-empt the paint', () => {
    /* The whole point of the deferral is that the browser paints BETWEEN the
       two renders. After a render that holds the thread for seconds the expired
       timer and the due frame are both queued and the timer can go first; a
       timer that released there would open the gate with nothing on screen and
       the two renders would run back to back. Measured before this: one 5999 ms
       hold at 6x throttle, exactly as if nothing had been deferred. */
    const s = fakeScheduler();
    let released = 0;
    releaseAfterPaint(() => { released += 1; }, s.w);
    s.fireTimer();                 // the look wins the race out of the long task
    expect(released).toBe(0);      // ...and defers to the frames
    s.paint(); s.paint();          // which then paint and release
    expect(released).toBe(1);
  });

  it('releases when the tab is hidden BETWEEN the two frames', () => {
    /* The outer frame ran, so something IS painting; then the tab goes away and
       the inner frame never arrives. Presence of a frame cannot decide this —
       only whether the count MOVED between two looks. */
    const s = fakeScheduler();
    let released = 0;
    releaseAfterPaint(() => { released += 1; }, s.w);
    s.paint();                     // outer only; inner now queued and never runs
    s.fireTimer();                 // look: the count moved, so wait
    expect(released).toBe(0);
    s.fireTimer();                 // look: no further progress
    expect(released).toBe(1);
  });

  it('releases AT MOST ONCE however many of them fire', () => {
    /* Both paths are armed on purpose; a report built twice would be the
       531 ms this exists to move, paid twice. */
    const s = fakeScheduler();
    let released = 0;
    releaseAfterPaint(() => { released += 1; }, s.w);
    s.paint(); s.paint();
    s.fireTimer(); s.fireTimer();
    s.paint();
    expect(released).toBe(1);
  });

  it('clears the fallback timer once the frames have released it', () => {
    const s = fakeScheduler();
    releaseAfterPaint(() => {}, s.w);
    const timerHandle = 1001;
    s.paint(); s.paint();
    expect(s.clearedTimers).toContain(timerHandle);
  });

  it('cancels cleanly, and then releases nothing', () => {
    const s = fakeScheduler();
    let released = 0;
    const cancel = releaseAfterPaint(() => { released += 1; }, s.w);
    cancel();
    s.paint(); s.paint(); s.fireTimer(); s.fireTimer();
    expect(released).toBe(0);
    expect(s.clearedTimers.length).toBeGreaterThan(0);
  });

  it('cancels the inner frame too when it is cancelled between the two', () => {
    const s = fakeScheduler();
    let released = 0;
    const cancel = releaseAfterPaint(() => { released += 1; }, s.w);
    s.paint();            // inner frame now queued
    cancel();
    s.paint();
    expect(released).toBe(0);
    expect(s.cancelledFrames.length).toBe(2); // outer and inner
  });
});

/**
 * The app half. A unit test cannot say whether `App.tsx` ASKS for the
 * deferral, releases it on every exit, or shows the one state that replaces an
 * absent panel — and each of those is where this would go wrong (the UI-1
 * idiom). Comments are stripped first: the reasons below quote the very code
 * they explain.
 */
describe('D-0 — the app is wired to it', () => {
  const src = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('gates the v2 report on the flag and nothing else', () => {
    expect(src).toMatch(/const \[v2ReportDeferred, setV2ReportDeferred\] = useState\(\(\) =>\s*shouldDeferOnBoot\(/);
    /* The flag decides the whole memo: `null` while it holds, the 531 ms once
       it drops, and nothing in between. */
    expect(src).toMatch(
      /const engineV2Report = useMemo\(\s*\(\) => \(v2ReportDeferred \? null : buildPanelReport\(\)\),/,
    );
    /* …and it is a dependency, or the memo would never rebuild on release. */
    expect(src).toMatch(/\[buildV2Report, designs, activeDesignId, v2ReportDeferred\],/);
  });

  it('releases in a `finally`, so no exit from the restore can leave it closed', () => {
    expect(src).toMatch(/\} finally \{\s*release\(\);\s*\}/);
    /* And on the path that never reaches the async body at all. */
    expect(src).toMatch(/if \(!stored\) \{\s*openWizardForEmpty\(\);\s*release\(\);\s*return;\s*\}/);
    expect(src).toMatch(/cancelRelease = releaseAfterPaint\(\(\) => setV2ReportDeferred\(false\), window\)/);
  });

  it('never lets a RUN read a deferred report', () => {
    /* The gate is about WHEN the panel is built. A run reads the same object in
       nineteen places, and a click that landed inside the one deferred frame
       would have found `null` there and taken the path meant for "v2 cannot
       report on this project at all". Both run entry points shadow it with the
       built-on-demand one, which is why no individual reference had to be
       rewritten — and why the shadow disappearing has to fail here. */
    expect(src).toMatch(/const v2ReportNow = \(\) => engineV2Report \?\? buildPanelReport\(\);/);
    const shadows = src.match(/const engineV2Report = v2ReportNow\(\);/g) ?? [];
    expect(shadows.length).toBe(2);
    for (const fn of ['runVfOptimize', 'runNetOptimizeHybrid']) {
      const at = src.indexOf(`function ${fn}(`);
      expect(at).toBeGreaterThan(-1);
      /* The shadow is the first thing each of them does: a reference above it
         would read the panel's report and defeat the whole point. */
      expect(src.slice(at, at + 400)).toMatch(/const engineV2Report = v2ReportNow\(\);/);
    }
    /* One definition of the panel's report, read by the memo and by the run. */
    expect((src.match(/buildPanelReport\(\)/g) ?? []).length).toBe(2);
  });

  it('says the panel is coming instead of rendering nothing', () => {
    /* Anchored on the opening brace, so a block dead-coded with a `false &&`
       in front of the condition fails here rather than reading as present. */
    expect(src).toMatch(/\{engineSelection\.reporting && v2ReportDeferred && \(/);
    expect(src).toContain('Solving…');
  });

  it('asks the shape question once per file, not once per render', () => {
    /* The two near-field slot reads go through the cache; the loader — which
       runs once per dropped file and is not a render — still calls it direct. */
    expect(src).toMatch(/const coneShape = shapeOf\(slot\.cone\?\.raw\);/);
    expect(src).toMatch(/const farShape = shapeOf\(farSrc\?\.raw\);/);
    expect(src).not.toMatch(/classifyMeasurementShape\((?:slot|farSrc)/);
    /* Exactly TWO callers left: the file loader (once per dropped file, not a
       render) and the cache itself. A third would be a second uncached read. */
    expect((src.match(/classifyMeasurementShape\(/g) ?? []).length).toBe(2);
    expect(src).toMatch(/if \(cache\.size >= SHAPE_CACHE_MAX\) cache\.clear\(\);/);
  });

  it('spells the autosave key once', () => {
    expect(src).toMatch(/^const AUTOSAVE_KEY = 'ads-autosave';$/m);
    /* Every other mention is the key or its `-unreadable` sibling, never a
       second spelling of the key itself. */
    expect(src).not.toMatch(/'ads-autosave'(?!;)/);
  });
});
