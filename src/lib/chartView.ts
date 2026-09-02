/**
 * UI-2 — A CHART VIEW THE USER CHOSE SURVIVES A RECOMPUTATION.
 *
 * `Chart.tsx` keeps a zoom/pan override per axis. Until UI-2 it dropped that
 * override whenever the COMMITTED domain changed — and for the SPL chart the
 * y-domain is auto-scaled from the data, so any edit that moved the loudest
 * trace by a few dB (Sander: removing a series resistor) threw away the user's
 * X-zoom along with it and the axis snapped back to the full range. The view
 * followed the data instead of the user.
 *
 * The rule, as a pure function so a test can hold it without a browser:
 *
 *   · no override on an axis → that axis follows the base domain (auto-scale
 *     only while the user chose nothing);
 *   · an override survives any change of the base domain: it is a window in
 *     DATA units (Hz, dB), not in pixels, and the data moving under it is not
 *     a reason to lose it;
 *   · a window that no longer fits the new base is shifted into it with its
 *     span kept (log span on a log axis), and a window at least as wide as the
 *     base collapses to the base — the chart then reports "not zoomed", which
 *     is what makes "use as view range" (base := window) end the zoom cleanly;
 *   · the explicit reset (button, double-click) is `null` and goes straight
 *     back to the base.
 */

export type AxisWindow = [number, number];

export interface ChartViewState {
  x?: AxisWindow;
  y?: AxisWindow;
}

export interface EffectiveView {
  x: AxisWindow;
  y: AxisWindow;
  /** Whether either axis is narrower than its base (i.e. a zoom is in force). */
  zoomed: boolean;
  /** Which axes carry a user window after clamping. */
  xZoomed: boolean;
  yZoomed: boolean;
}

const EPS = 1e-12;

/** Fit a window into a base, keeping its span; a window at least as wide as
 *  the base becomes the base. `log` measures span in log10 units. */
export function clampWindow(win: AxisWindow, base: AxisWindow, log: boolean): AxisWindow {
  const f = log ? Math.log10 : (v: number) => v;
  const g = log ? (v: number) => 10 ** v : (v: number) => v;
  const b0 = f(base[0]);
  const b1 = f(base[1]);
  let lo = f(Math.min(win[0], win[1]));
  let hi = f(Math.max(win[0], win[1]));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return base;
  const span = hi - lo;
  const baseSpan = b1 - b0;
  if (span >= baseSpan - EPS) return base;
  // Fits: hand the window back untouched (no log round-trip on numbers the
  // user never asked to have re-derived).
  if (lo >= b0 - EPS && hi <= b1 + EPS) return [Math.min(win[0], win[1]), Math.max(win[0], win[1])];
  if (lo < b0) {
    lo = b0;
    hi = b0 + span;
  } else {
    hi = b1;
    lo = b1 - span;
  }
  return [g(lo), g(hi)];
}

const isBase = (win: AxisWindow, base: AxisWindow): boolean =>
  win[0] <= base[0] + EPS && win[1] >= base[1] - EPS;

/**
 * The window each axis actually shows, given the user's override and the
 * committed base domains of this render.
 */
export function effectiveView(
  view: ChartViewState | null,
  xDomain: AxisWindow,
  yDomain: AxisWindow,
  xLog: boolean,
): EffectiveView {
  const x = view?.x ? clampWindow(view.x, xDomain, xLog) : xDomain;
  const y = view?.y ? clampWindow(view.y, yDomain, false) : yDomain;
  const xZoomed = !isBase(x, xDomain);
  const yZoomed = !isBase(y, yDomain);
  return { x, y, zoomed: xZoomed || yZoomed, xZoomed, yZoomed };
}
