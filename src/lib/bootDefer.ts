/**
 * D-0 — A RESTORED PROJECT PAINTS BEFORE IT IS REPORTED ON.
 *
 * WHAT WAS MEASURED (25/26-09-2026, headless Chrome on the dev server, a full
 * KOAN project in the autosave: three 13 640-point responses, three
 * impedances, fifteen angle sets, two near fields and a 74-part active
 * network, 3.84 MB of project JSON). The restore is ONE synchronous task on
 * the main thread: `applyProject` parses the stored text and the render that
 * follows recomputes every memo, so the tab is held for **1054 ms** at full
 * speed and **6383 ms** with the CPU throttled 6x — and at 6x the profiler's
 * own `Runtime.evaluate` starts timing out, which is the symptom an earlier
 * session saw from outside and read as a freeze of tens of seconds. No worker
 * is involved: every millisecond of it is the main thread.
 *
 * The single biggest item in that task is the v2 report (531 ms of the 1054,
 * 3016 of the 6383) — `buildReport` plus the ingest estimators. It is also the
 * one item the FIRST PAINT does not need: the charts come from `simRaw`, and
 * the report feeds the Engine v2 panel at the bottom of the analysis pane.
 *
 * So this module holds the one decision that moves it out of that task:
 * DEFER the report while a stored project is being restored, and release it
 * once the browser has painted. Nothing about the report changes — same
 * inputs, same function, same output — only WHEN it is built. Everything
 * else on the restore path is untouched.
 *
 * WHY IT IS A MODULE AND NOT TWO LINES IN `App.tsx`. A gate that never
 * releases hides the whole v2 panel for the rest of the session, and the paths
 * where that could happen are the uninteresting ones: no autosave at all, a
 * restore that threw, a browser that refuses `localStorage`, a tab that is
 * hidden so `requestAnimationFrame` never fires. Each of those is one line and
 * each of them is worth a claim, which is what `bootDefer.test.ts` spends its
 * claims on. The same reason `rootInert.ts` exists (U-8).
 */

/**
 * How long the fallback waits between looks, ms.
 *
 * `requestAnimationFrame` does not fire in a hidden tab, so a project restored
 * in a background tab needs a second way out or its report is never built. A
 * PLAIN timer is not that way, and the measurement says why: after a render
 * that holds the thread for seconds, the expired timer and the due frame are
 * both queued, the timer can run first, and the gate then opens without a
 * paint having happened — the two renders run back to back and the split this
 * module exists for does not happen. Measured on the dev server at 6x CPU
 * throttle: one 5999 ms hold, exactly as before the deferral.
 *
 * So the timer does not release; it asks whether the frames are MAKING
 * PROGRESS. Progress means they are alive and one frame from the paint, so it
 * waits again; no progress between two looks means nothing is painting and it
 * releases. That reading is what makes it right in all four cases — a fast
 * machine (the frames win outright), a slow one (the first look sees the frames
 * start), a hidden tab (two looks, no progress, release), and a tab hidden
 * BETWEEN the two frames (the same, one look later).
 */
export const BOOT_DEFER_FALLBACK_MS = 300;

/**
 * Is there a stored project about to be restored?
 *
 * Only then is there anything to defer: with nothing to restore the first
 * render is already cheap, and deferring would delay the report of a project
 * the designer is loading by hand for no gain. A `localStorage` that throws
 * (private mode, blocked site data) answers NO, which is the same answer the
 * restore itself arrives at one line later.
 */
export function shouldDeferOnBoot(read: () => string | null): boolean {
  try {
    return !!read();
  } catch {
    return false;
  }
}

/** The scheduling primitives this needs, so a test can supply its own. */
export interface PaintScheduler {
  requestAnimationFrame(cb: () => void): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(cb: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

/**
 * Run `release` once, after the browser has had a chance to paint.
 *
 * TWO NESTED FRAMES, not one: a callback scheduled inside a render runs
 * BEFORE that render's paint on the first frame, so the second frame is the
 * first moment the pixels are certainly on screen. Plus the timer above for
 * the hidden-tab case. Releases AT MOST ONCE however many of them fire, and
 * returns a cancel for the caller's cleanup.
 */
export function releaseAfterPaint(release: () => void, w: PaintScheduler): () => void {
  let done = false;
  /** Frames observed. Only ever compared with the previous look's reading. */
  let frames = 0;
  let seenAtLastLook = -1;
  let inner: number | null = null;
  let timer: number;
  const once = () => {
    if (done) return;
    done = true;
    w.clearTimeout(timer);
    release();
  };
  const outer = w.requestAnimationFrame(() => {
    frames += 1;
    inner = w.requestAnimationFrame(once);
  });
  /* Not a competitor to the frames — a question about them. */
  const look = () => {
    if (done) return;
    if (frames > seenAtLastLook) {
      seenAtLastLook = frames;
      timer = w.setTimeout(look, BOOT_DEFER_FALLBACK_MS);
      return;
    }
    once();
  };
  timer = w.setTimeout(look, BOOT_DEFER_FALLBACK_MS);
  return () => {
    done = true;
    w.cancelAnimationFrame(outer);
    if (inner !== null) w.cancelAnimationFrame(inner);
    w.clearTimeout(timer);
  };
}
