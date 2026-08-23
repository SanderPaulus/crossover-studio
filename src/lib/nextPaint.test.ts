import { describe, expect, it, vi } from 'vitest';

/**
 * A YIELD THAT CANNOT HANG.
 *
 * The App's `nextPaint` waits for a frame so the busy card reaches the screen
 * before a long synchronous setup starts. requestAnimationFrame DOES NOT FIRE
 * in a hidden or unfocused window, so on its own that yield turns a cosmetic
 * delay into a run that never starts — measured on Sander: click Optimize,
 * switch windows to report that nothing happens, and nothing does, because the
 * scan is parked on a frame that only arrives when you come back.
 *
 * The shape is copied here rather than imported because it lives in App.tsx,
 * which pulls in the whole application. What is under test is the CONTRACT:
 * resolve on the frame when frames come, resolve anyway when they do not, and
 * resolve exactly once either way.
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    setTimeout(finish, 250);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}

describe('nextPaint', () => {
  it('resolves on the second frame when the window paints', async () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    let done = false;
    void nextPaint().then(() => {
      done = true;
    });
    // Drain two frames, as a real compositor would.
    frames.shift()?.(0);
    await Promise.resolve();
    frames.shift()?.(0);
    await Promise.resolve();
    expect(done, 'resolved by the frames, without waiting for the timeout').toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves anyway when frames never come — a hidden window may not stall the run', async () => {
    vi.useFakeTimers();
    // A window that never paints: rAF accepts the callback and drops it.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    let done = false;
    void nextPaint().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(249);
    expect(done, 'still waiting just before the fallback').toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done, 'the fallback released it').toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves exactly once when both the frames and the timeout arrive', async () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    let count = 0;
    void nextPaint().then(() => {
      count++;
    });
    await vi.advanceTimersByTimeAsync(300); // timeout first
    frames.shift()?.(0);
    frames.shift()?.(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(count).toBe(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
