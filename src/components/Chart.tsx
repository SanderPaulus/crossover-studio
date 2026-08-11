import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Log-frequency line chart (SVG). Series carry NaN gaps to break the path
 * (used to avoid drawing vertical seams at ±180° phase wraps).
 *
 * Interaction: wheel = X-zoom around the cursor (Shift+wheel = Y-zoom),
 * drag = pan (once zoomed), double-click = reset. Zooming is a pure view
 * transform — the data grid and any simulation behind it are untouched.
 * All frequency (log-x) charts share one linked crosshair.
 */

export interface Series {
  id: string;
  label: string;
  /** CSS color string (use var(--viz-...) so themes swap automatically). */
  color: string;
  x: readonly number[];
  y: readonly number[];
  dash?: string;
  /**
   * Optional per-point color override (color-along-the-line). null falls back
   * to `color`. Consecutive same-colored points render as one path segment;
   * segments connect seamlessly at color changes.
   */
  pointColors?: readonly (string | null)[];
  /** Stroke width override (default 2). */
  width?: number;
  /** Start legend-hidden: the series is computed and listed, but the user
   *  opts in by clicking its legend chip (used for optional overlays). Only
   *  seeds the initial state — a user's click always wins afterwards. */
  defaultOff?: boolean;
  /** Supporting curve (tab ghosts, tolerance envelope, target shapes): folded
   *  behind a "+N" chip so the legend cannot outgrow the graph it explains.
   *  Purely presentational — a folded series is still drawn. */
  secondary?: boolean;
}

/** Draggable design handle drawn on top of the chart (e.g. a filter knee). */
export interface ChartHandle {
  id: string;
  x: number;
  y: number;
  color: string;
  label?: string;
  /** 'x' = frequency-only (crossover knee), 'xy' = frequency + dB (EQ band). */
  kind?: 'x' | 'xy';
}

interface ChartProps {
  series: Series[];
  xDomain: [number, number];
  /** 'log' (frequency, default) or 'linear' (e.g. time axes). */
  xScale?: 'log' | 'linear';
  /** X-axis unit label for linear mode (e.g. "ms"). */
  xUnit?: string;
  yDomain: [number, number];
  yTickStep: number;
  yUnit: string;
  height?: number;
  /** Draw an emphasized horizontal reference line at this y (e.g. 0°). */
  yReference?: number;
  referenceLabel?: string;
  /** Translucent horizontal background zones (e.g. "good phase" bands). */
  bands?: { from: number; to: number; color: string; opacity?: number }[];
  /** Translucent vertical frequency zones (e.g. integration bandwidth). */
  xBands?: { from: number; to: number; color: string; opacity?: number; label?: string }[];
  /** Emphasized vertical marker lines (e.g. overlap centre). */
  xMarkers?: { x: number; color?: string; label?: string }[];
  /** Annotated points ON a curve (e.g. the loudest/quietest spot of the
   *  combined response): a small ring at (x, y) with a label beside it.
   *  Unlike xMarkers this says WHERE on both axes without a full-height rule
   *  cutting through the plot. `place` keeps the label off the curve. */
  points?: {
    x: number;
    y: number;
    label: string;
    /** Full sentence for the hover tooltip — the visible label stays short
     *  because the viewBox is scaled down and long text ends up ~9 px. */
    title?: string;
    color?: string;
    place?: 'above' | 'below';
  }[];
  /** When set, a "use as view range" button commits the zoomed X-range. */
  onXRangeCommit?: (lo: number, hi: number) => void;
  /** Fires with the currently VISIBLE x-range (zoom/pan included, live —
   *  before any commit). Lets a caller mirror what the chart shows, e.g. a
   *  ±dB flatness read-out that tracks the zoom. */
  onVisibleXChange?: (lo: number, hi: number) => void;
  /** Stable identity for this chart, used to remember which curves the user
   *  switched off. Omit for charts whose legend is not worth remembering. */
  storageKey?: string;
  /** Draggable overlay handles (design controls living in the chart itself). */
  handles?: ChartHandle[];
  /** Continuous drag feedback: absolute x (Hz), plus the y delta in chart units. */
  onHandleMove?: (id: string, x: number, dyUnits: number) => void;
  /** Wheel over a handle: multiplicative factor (>1 = wheel up). */
  onHandleWheel?: (id: string, factor: number) => void;
}

const W = 900; // viewBox width; scales responsively
const PAD = { l: 46, r: 12, t: 10, b: 26 };

export const FREQ_TICKS = [
  5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/** Denser 1–1.5–2–3–5–7 ladder for deep zooms, where FREQ_TICKS thins out. */
const FREQ_TICKS_DENSE = [
  5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700,
  1000, 1500, 2000, 3000, 5000, 7000, 10000, 15000, 20000,
];

export const fmtHz = (f: number): string => (f >= 1000 ? `${f / 1000}k` : String(f));

/** Nice tick positions for a linear axis: ~6 steps of 1/2/5×10ⁿ. */
function linearTicks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
    out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  }
  return out;
}

const fmtLinear = (v: number): string =>
  Math.abs(v) >= 1 || v === 0 ? String(Math.round(v * 100) / 100) : v.toFixed(2);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Linked crosshair shared by every frequency (log-x) chart: hovering one chart
 * shows the same frequency cursor in all of them. Module-level store — charts
 * subscribe via useSyncExternalStore; a chart's own hover always wins locally.
 */
const crosshairListeners = new Set<() => void>();
let crosshairFreq: number | null = null;
function publishCrosshair(f: number | null) {
  if (crosshairFreq === f) return;
  crosshairFreq = f;
  crosshairListeners.forEach((l) => l());
}
const subscribeCrosshair = (l: () => void) => {
  crosshairListeners.add(l);
  return () => {
    crosshairListeners.delete(l);
  };
};
const readCrosshair = () => crosshairFreq;

interface View {
  x?: [number, number];
  y?: [number, number];
}

/**
 * Legend choices survive a reload — the app's everything-is-persistent rule,
 * which the legend was the last thing to miss.
 *
 * Stored as EXPLICIT choices per series id (true = user hid it), never as the
 * resulting hidden set. A `defaultOff` series the user never touched must keep
 * following its default, so that changing a default later still reaches
 * everyone instead of being frozen out by a stale snapshot.
 */
type LegendPrefs = Record<string, boolean>;

const legendKey = (k: string) => `ads-legend-${k}`;

function loadLegendPrefs(k: string | undefined): LegendPrefs {
  if (!k) return {};
  try {
    const raw = localStorage.getItem(legendKey(k));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: LegendPrefs = {};
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[id] = v;
    }
    return out;
  } catch {
    return {}; // unreadable preference is not worth a broken chart
  }
}

export default function Chart({
  series: allSeries,
  xDomain,
  xScale = 'log',
  xUnit,
  yDomain,
  yTickStep,
  yUnit,
  height = 300,
  yReference,
  referenceLabel,
  bands,
  xBands,
  xMarkers,
  points,
  onXRangeCommit,
  onVisibleXChange,
  storageKey,
  handles,
  onHandleMove,
  onHandleWheel,
}: ChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [localHover, setLocalHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ cx: number; cy: number; x: [number, number]; y: [number, number] } | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const handleDragRef = useRef<{ id: string; lastY: number } | null>(null);

  const isLog = xScale === 'log';
  const sharedHover = useSyncExternalStore(subscribeCrosshair, readCrosshair);

  // Committed domains changed (view-range fields, new data) → drop the zoom;
  // the override would otherwise silently outlive the range it was taken from.
  useEffect(() => {
    setView(null);
  }, [xDomain[0], xDomain[1], yDomain[0], yDomain[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const vx: [number, number] = view?.x ?? xDomain;
  const vy: [number, number] = view?.y ?? yDomain;

  // Report the live visible x-range (zoom/pan/reset all flow through vx).
  useEffect(() => {
    onVisibleXChange?.(vx[0], vx[1]);
  }, [vx[0], vx[1], onVisibleXChange]); // eslint-disable-line react-hooks/exhaustive-deps

  /* One-time gesture hint, primary (SPL) chart only. Dismissed forever by the
   * first real zoom — proof the user knows — or the ✕. */
  const [gestureHintGone, setGestureHintGone] = useState(() => {
    try {
      return localStorage.getItem('ads-hint-chart') === '1';
    } catch {
      return true;
    }
  });
  const dismissGestureHint = () => {
    try {
      localStorage.setItem('ads-hint-chart', '1');
    } catch {
      // Private mode: hide for this session only.
    }
    setGestureHintGone(true);
  };
  const showGestureHint = storageKey === 'spl' && !gestureHintGone;

  // Seed each series' initial visibility ONCE per id — new ids may appear
  // later (data loads async), and a user's explicit toggle must never be
  // overridden afterwards. A remembered choice wins over `defaultOff`; without
  // a remembered choice the default applies.
  const prefs = useRef<LegendPrefs>(loadLegendPrefs(storageKey));
  const seenIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const add: string[] = [];
    const drop: string[] = [];
    for (const s of allSeries) {
      if (seenIds.current.has(s.id)) continue;
      seenIds.current.add(s.id);
      const remembered = prefs.current[s.id];
      if (remembered === undefined) {
        if (s.defaultOff) add.push(s.id);
      } else if (remembered) add.push(s.id);
      else drop.push(s.id);
    }
    if (add.length === 0 && drop.length === 0) return;
    setHidden((prev) => {
      const next = new Set(prev);
      add.forEach((id) => next.add(id));
      drop.forEach((id) => next.delete(id));
      return next;
    });
  }, [allSeries]);

  const series = useMemo(() => allSeries.filter((s) => !hidden.has(s.id)), [allSeries, hidden]);

  // Legend folding. Measured at an 800 px window: eleven SPL entries wrapped to
  // eight rows and left the graph 93 px tall — the legend outgrew the thing it
  // labels. Supporting curves fold behind one chip; a series the user has
  // explicitly toggled off stays listed, or its chip would vanish out of reach.
  const [showSecondary, setShowSecondary] = useState(false);
  const legendSeries = useMemo(
    () => allSeries.filter((s) => !s.secondary || showSecondary || hidden.has(s.id)),
    [allSeries, showSecondary, hidden],
  );
  // Foldable = what CAN fold, not what IS folded: counting the folded ones made
  // the chip disappear the moment it was expanded, with no way back.
  const foldable = allSeries.filter((s) => s.secondary && !hidden.has(s.id)).length;
  const foldedCount = allSeries.length - legendSeries.length;

  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      const nowHidden = !next.has(id);
      if (nowHidden) next.add(id);
      else next.delete(id);
      if (storageKey) {
        // Some ids are per-design (the tab ghosts), so the map would grow for
        // as long as tabs come and go. Keep the most recent choices only.
        const merged = { ...prefs.current, [id]: nowHidden };
        const keys = Object.keys(merged);
        if (keys.length > 200) keys.slice(0, keys.length - 200).forEach((k) => delete merged[k]);
        prefs.current = merged;
        try {
          localStorage.setItem(legendKey(storageKey), JSON.stringify(prefs.current));
        } catch {
          // Storage full or blocked — the toggle still works this session.
        }
      }
      return next;
    });

  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const lx0 = isLog ? Math.log10(vx[0]) : vx[0];
  const lx1 = isLog ? Math.log10(vx[1]) : vx[1];
  const xPos = (f: number) =>
    PAD.l + (((isLog ? Math.log10(f) : f) - lx0) / (lx1 - lx0)) * plotW;
  const yPos = (v: number) => PAD.t + (1 - (v - vy[0]) / (vy[1] - vy[0])) * plotH;

  const xTicks = useMemo(() => {
    if (!isLog) return linearTicks(vx[0], vx[1]);
    const coarse = FREQ_TICKS.filter((f) => f >= vx[0] && f <= vx[1]);
    if (coarse.length >= 4 || !view?.x) return coarse;
    return FREQ_TICKS_DENSE.filter((f) => f >= vx[0] && f <= vx[1]);
  }, [isLog, vx[0], vx[1], view?.x]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmtX = isLog ? fmtHz : fmtLinear;
  const yTicks = useMemo(() => {
    if (view?.y) return linearTicks(vy[0], vy[1]);
    const out: number[] = [];
    const start = Math.ceil(vy[0] / yTickStep) * yTickStep;
    for (let v = start; v <= vy[1] + 1e-9; v += yTickStep) out.push(v);
    return out;
  }, [vy[0], vy[1], yTickStep, view?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- zoom & pan (pure view transform; data and simulation untouched) -----

  /** Merge a new axis window with the base domain: back at (or beyond) the
   *  base → drop the override so the chart snaps home cleanly. */
  const applyView = (axis: 'x' | 'y', win: [number, number], base: [number, number]) => {
    setView((prev) => {
      const isBase = win[0] <= base[0] + 1e-12 && win[1] >= base[1] - 1e-12;
      const next: View = { ...(prev ?? {}) };
      if (isBase) delete next[axis];
      else next[axis] = win;
      return next.x || next.y ? next : null;
    });
  };

  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const el = svgRef.current;
    if (!el) return;
    // Wheel over a design handle adjusts that handle (e.g. EQ Q), not the zoom.
    const handleEl = (e.target as Element).closest?.('[data-handle]');
    if (handleEl && onHandleWheel) {
      e.preventDefault();
      onHandleWheel(handleEl.getAttribute('data-handle')!, Math.exp(-e.deltaY * 0.0012));
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    if (px < PAD.l || px > W - PAD.r || py < PAD.t || py > H - PAD.b) return;
    e.preventDefault();
    if (!gestureHintGone) dismissGestureHint(); // a real zoom is proof of knowledge
    const k = Math.exp(e.deltaY * 0.0016); // >1 zooms out
    if (e.shiftKey) {
      const frac = 1 - (py - PAD.t) / plotH;
      const span = vy[1] - vy[0];
      const baseSpan = yDomain[1] - yDomain[0];
      const newSpan = clamp(span * k, baseSpan / 50, baseSpan);
      const anchor = vy[0] + frac * span;
      let lo = anchor - frac * newSpan;
      lo = clamp(lo, yDomain[0], yDomain[1] - newSpan);
      applyView('y', [lo, lo + newSpan], yDomain);
    } else {
      const frac = (px - PAD.l) / plotW;
      const b0 = isLog ? Math.log10(xDomain[0]) : xDomain[0];
      const b1 = isLog ? Math.log10(xDomain[1]) : xDomain[1];
      const span = lx1 - lx0;
      const baseSpan = b1 - b0;
      const minSpan = isLog ? Math.min(0.15, baseSpan) : baseSpan / 100;
      const newSpan = clamp(span * k, minSpan, baseSpan);
      const anchor = lx0 + frac * span;
      let lo = anchor - frac * newSpan;
      lo = clamp(lo, b0, b1 - newSpan);
      const win: [number, number] = isLog
        ? [10 ** lo, 10 ** (lo + newSpan)]
        : [lo, lo + newSpan];
      applyView('x', win, xDomain);
    }
  };

  // React attaches wheel listeners passively; zooming needs preventDefault,
  // so bind a native non-passive listener once and route through a ref.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  function onHandleDown(e: React.PointerEvent<SVGCircleElement>, id: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    handleDragRef.current = { id, lastY: e.clientY };
    setActiveHandle(id);
    setLocalHover(null);
    if (isLog) publishCrosshair(null);
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events carry no active pointer — capture is best-effort.
    }
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || !view) return; // nothing to pan at full range
    dragRef.current = { cx: e.clientX, cy: e.clientY, x: vx, y: vy };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events carry no active pointer — capture is best-effort.
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const hd = handleDragRef.current;
    if (hd) {
      const rect = svgRef.current!.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const u = lx0 + (clamp(px, PAD.l, W - PAD.r) - PAD.l) / plotW * (lx1 - lx0);
      const xVal = isLog ? 10 ** u : u;
      const dyUnits = (-(e.clientY - hd.lastY) / rect.height) * H * ((vy[1] - vy[0]) / plotH);
      hd.lastY = e.clientY;
      onHandleMove?.(hd.id, xVal, dyUnits);
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const rect = svgRef.current!.getBoundingClientRect();
      if (!dragging && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) > 3) {
        setDragging(true);
        setLocalHover(null);
        publishCrosshair(null);
      }
      if (!dragging && dragRef.current) return;
      const dxu = (-(e.clientX - drag.cx) / rect.width) * W * ((lx1 - lx0) / plotW);
      const dyu = ((e.clientY - drag.cy) / rect.height) * H * ((vy[1] - vy[0]) / plotH);
      if (view?.x) {
        const b0 = isLog ? Math.log10(xDomain[0]) : xDomain[0];
        const b1 = isLog ? Math.log10(xDomain[1]) : xDomain[1];
        const d0 = isLog ? Math.log10(drag.x[0]) : drag.x[0];
        const span = (isLog ? Math.log10(drag.x[1]) : drag.x[1]) - d0;
        const lo = clamp(d0 + dxu, b0, b1 - span);
        applyView('x', isLog ? [10 ** lo, 10 ** (lo + span)] : [lo, lo + span], xDomain);
      }
      if (view?.y) {
        const span = drag.y[1] - drag.y[0];
        const lo = clamp(drag.y[0] + dyu, yDomain[0], yDomain[1] - span);
        applyView('y', [lo, lo + span], yDomain);
      }
      return;
    }
    onHoverMove(e);
  }

  function onPointerUp() {
    dragRef.current = null;
    setDragging(false);
    handleDragRef.current = null;
    setActiveHandle(null);
  }

  // ----- hover / linked crosshair -----

  function onHoverMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < PAD.l || px > W - PAD.r) {
      setLocalHover(null);
      if (isLog) publishCrosshair(null);
      return;
    }
    const v = lx0 + ((px - PAD.l) / plotW) * (lx1 - lx0);
    const f = isLog ? 10 ** v : v;
    setLocalHover(f);
    if (isLog) publishCrosshair(f);
  }

  function onLeave() {
    setLocalHover(null);
    if (isLog) publishCrosshair(null);
  }

  const hoverF =
    localHover ??
    (isLog && sharedHover !== null && sharedHover >= vx[0] && sharedHover <= vx[1]
      ? sharedHover
      : null);

  interface Run {
    key: string;
    color: string;
    d: string;
    s: Series;
  }

  const paths = useMemo(() => {
    const runs: Run[] = [];
    for (const s of series) {
      let d = '';
      let runColor: string | null = null;
      let prevPt: string | null = null;
      let pen = false;
      const flush = () => {
        if (d !== '' && runColor !== null) {
          runs.push({ key: `${s.id}:${runs.length}`, color: runColor, d, s });
        }
        d = '';
      };
      for (let i = 0; i < s.x.length; i++) {
        const f = s.x[i];
        const v = s.y[i];
        if (f < vx[0] || f > vx[1] || Number.isNaN(v)) {
          flush();
          pen = false;
          prevPt = null;
          continue;
        }
        const color = s.pointColors?.[i] ?? s.color;
        const cx = xPos(f);
        const cy = Math.max(PAD.t - 2, Math.min(H - PAD.b + 2, yPos(v)));
        const pt = `${cx.toFixed(1)},${cy.toFixed(1)}`;
        if (color !== runColor) {
          flush();
          runColor = color;
          // Start the new run at the previous point so segments connect.
          d = prevPt && pen ? `M${prevPt}L${pt}` : `M${pt}`;
        } else {
          d += `${pen ? 'L' : 'M'}${pt}`;
        }
        prevPt = pt;
        pen = true;
      }
      flush();
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, vx[0], vx[1], vy[0], vy[1], height]);

  // Hover: nearest sample per series at the hovered frequency.
  const hover = useMemo(() => {
    if (hoverF === null) return null;
    const rows = series
      .map((s) => {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < s.x.length; i++) {
          if (s.x[i] < vx[0] || s.x[i] > vx[1] || Number.isNaN(s.y[i])) continue;
          const d = isLog
            ? Math.abs(Math.log10(s.x[i]) - Math.log10(hoverF))
            : Math.abs(s.x[i] - hoverF);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best >= 0 ? { s, f: s.x[best], v: s.y[best] } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length === 0) return null;
    return { f: rows[0].f, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverF, series, vx[0], vx[1]]);

  const tooltipLeft = hover ? xPos(hover.f) > W - 220 : false;

  const fmtF = (f: number) =>
    f >= 1000 ? `${+(f / 1000).toFixed(2)}k` : String(Math.round(f));
  const fmtRange = (lo: number, hi: number) =>
    isLog ? `${fmtF(lo)}–${fmtF(hi)} Hz` : `${fmtLinear(lo)}–${fmtLinear(hi)}${xUnit ? ` ${xUnit}` : ''}`;

  return (
    <div className="chart">
      <div className="chart-legend">
        {legendSeries.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`legend-item${hidden.has(s.id) ? ' off' : ''}`}
            onClick={() => toggle(s.id)}
            aria-pressed={!hidden.has(s.id)}
            title={hidden.has(s.id) ? 'Show series' : 'Hide series'}
          >
            {s.dash ? (
              // Dashed series show their actual dash pattern — with several
              // ghost curves the pattern is what tells them apart in the chart.
              <svg className="legend-key legend-key-dash" viewBox="0 0 22 6" aria-hidden>
                <line x1="0" y1="3" x2="22" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />
              </svg>
            ) : (
              <span className="legend-key" style={{ background: s.color }} />
            )}
            {s.label}
          </button>
        ))}
        {foldable > 0 && (
          <button
            type="button"
            className="legend-more"
            onClick={() => setShowSecondary((v) => !v)}
            aria-expanded={showSecondary}
            title={
              showSecondary
                ? 'Fold the supporting curves back up'
                : 'Show ghosts, tolerance band and target shapes in the legend (they are drawn either way)'
            }
          >
            {showSecondary ? '− fewer' : `+${foldedCount} more`}
          </button>
        )}
      </div>
      {view && (
        <div className="chart-zoom-tools">
          <span className="chart-zoom-range">{view.x ? fmtRange(vx[0], vx[1]) : 'y-zoom'}</span>
          {view.x && onXRangeCommit && (
            <button
              type="button"
              onClick={() => onXRangeCommit(vx[0], vx[1])}
              title="Make this the committed view range (evaluation band)"
            >
              use as view range
            </button>
          )}
          <button type="button" onClick={() => setView(null)} title="Reset zoom (or double-click the chart)">
            reset
          </button>
        </div>
      )}
      {/* The plot wrapper is the coordinate frame for the label overlay: `.chart`
          itself also holds the legend, so percentages taken against it would
          place the labels tens of pixels off the points they annotate. */}
      <div className="chart-plot">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseLeave={onLeave}
        onDoubleClick={() => setView(null)}
        className={dragging ? 'panning' : view ? 'pannable' : undefined}
        role="img"
      >
        {/* background zones */}
        {bands?.map((b, i) => {
          const y0 = Math.max(vy[0], Math.min(b.from, b.to));
          const y1 = Math.min(vy[1], Math.max(b.from, b.to));
          if (y1 <= y0) return null;
          return (
            <rect
              key={i}
              x={PAD.l}
              width={plotW}
              y={yPos(y1)}
              height={yPos(y0) - yPos(y1)}
              fill={b.color}
              opacity={b.opacity ?? 0.07}
            />
          );
        })}
        {/* vertical frequency zones (e.g. integration bandwidth) */}
        {xBands?.map((b, i) => {
          const f0 = Math.max(vx[0], Math.min(b.from, b.to));
          const f1 = Math.min(vx[1], Math.max(b.from, b.to));
          if (f1 <= f0) return null;
          return (
            <g key={`xb${i}`}>
              <rect
                x={xPos(f0)}
                width={xPos(f1) - xPos(f0)}
                y={PAD.t}
                height={plotH}
                fill={b.color}
                opacity={b.opacity ?? 0.08}
              />
              {b.label && (
                <text x={xPos(f0) + 5} y={PAD.t + 12} className="tick xband-label">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
        {/* gridlines */}
        {xTicks.map((f) => (
          <line key={f} x1={xPos(f)} x2={xPos(f)} y1={PAD.t} y2={H - PAD.b} className="grid" />
        ))}
        {yTicks.map((v) => (
          <line key={v} x1={PAD.l} x2={W - PAD.r} y1={yPos(v)} y2={yPos(v)} className="grid" />
        ))}
        {yReference !== undefined && yReference >= vy[0] && yReference <= vy[1] && (
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={yPos(yReference)}
            y2={yPos(yReference)}
            className="refline"
          />
        )}
        {/* vertical markers (e.g. overlap centre) */}
        {xMarkers?.map((m, i) =>
          m.x >= vx[0] && m.x <= vx[1] ? (
            <g key={`xm${i}`}>
              <line
                x1={xPos(m.x)}
                x2={xPos(m.x)}
                y1={PAD.t}
                y2={H - PAD.b}
                className="xmarker"
                style={m.color ? { stroke: m.color } : undefined}
              />
              {m.label && (
                <text
                  x={xPos(m.x) + 4}
                  y={H - PAD.b - 6}
                  className="tick xband-label"
                >
                  {m.label}
                </text>
              )}
            </g>
          ) : null,
        )}
        {/* annotated points on a curve (loudest / quietest spot) — the ring
            only; the label rides in an HTML overlay below, see there. */}
        {points?.map((p, i) =>
          p.x >= vx[0] && p.x <= vx[1] && Number.isFinite(p.y) ? (
            <g key={`pt${i}`} className="chart-point">
              {p.title && <title>{p.title}</title>}
              <circle
                cx={xPos(p.x)}
                cy={yPos(p.y)}
                r={3.5}
                style={p.color ? { stroke: p.color } : undefined}
              />
            </g>
          ) : null,
        )}
        {/* axes labels */}
        {xTicks.map((f) => (
          <text key={f} x={xPos(f)} y={H - PAD.b + 16} className="tick" textAnchor="middle">
            {fmtX(f)}
          </text>
        ))}
        {!isLog && xUnit && (
          <text x={W - PAD.r - 20} y={H - PAD.b + 16} className="tick unit" textAnchor="start">
            {xUnit}
          </text>
        )}
        {yTicks.map((v) => (
          <text key={v} x={PAD.l - 6} y={yPos(v) + 3.5} className="tick" textAnchor="end">
            {fmtLinear(v)}
          </text>
        ))}
        <text x={10} y={PAD.t + 10} className="tick unit">
          {yUnit}
        </text>
        {referenceLabel && yReference !== undefined && yReference >= vy[0] && yReference <= vy[1] && (
          <text x={W - PAD.r - 4} y={yPos(yReference) - 5} className="tick" textAnchor="end">
            {referenceLabel}
          </text>
        )}
        {/* series */}
        {paths.map(({ key, color, d, s }) => (
          <path
            key={key}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={s.width ?? 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.dash}
          />
        ))}
        {/* draggable design handles */}
        {handles?.map((h) =>
          h.x >= vx[0] && h.x <= vx[1] ? (
            <circle
              key={h.id}
              data-handle={h.id}
              cx={xPos(h.x)}
              cy={clamp(yPos(h.y), PAD.t + 4, H - PAD.b - 4)}
              r={activeHandle === h.id ? 8 : 6.5}
              className={`chart-handle${h.kind === 'x' ? ' knee' : ''}${activeHandle === h.id ? ' active' : ''}`}
              style={
                h.kind === 'x'
                  ? { stroke: h.color, fill: 'var(--panel)' }
                  : { stroke: 'var(--panel)', fill: h.color }
              }
              onPointerDown={(e) => onHandleDown(e, h.id)}
            >
              {h.label && <title>{h.label}</title>}
            </circle>
          ) : null,
        )}
        {/* hover layer */}
        {hover && !dragging && activeHandle === null && (
          <>
            <line
              x1={xPos(hover.f)}
              x2={xPos(hover.f)}
              y1={PAD.t}
              y2={H - PAD.b}
              className="crosshair"
            />
            {hover.rows.map(({ s, v }) =>
              v >= vy[0] && v <= vy[1] ? (
                <circle
                  key={s.id}
                  cx={xPos(hover.f)}
                  cy={yPos(v)}
                  r={4.5}
                  fill={s.color}
                  className="hover-dot"
                />
              ) : null,
            )}
            <foreignObject
              x={tooltipLeft ? xPos(hover.f) - 212 : xPos(hover.f) + 10}
              y={PAD.t + 4}
              width={202}
              height={plotH}
              pointerEvents="none"
            >
              <div className="tooltip">
                <div className="tooltip-freq">
                  {isLog ? `${Math.round(hover.f)} Hz` : `${fmtLinear(hover.f)} ${xUnit ?? ''}`}
                </div>
                {hover.rows.map(({ s, v }) => (
                  <div key={s.id} className="tooltip-row">
                    <span className="legend-key" style={{ background: s.color }} />
                    <span className="tooltip-label">{s.label}</span>
                    <span className="tooltip-val">
                      {v.toFixed(1)} {yUnit}
                    </span>
                  </div>
                ))}
              </div>
            </foreignObject>
          </>
        )}
      </svg>
      {/* Point labels as HTML, not SVG text. Inside the viewBox a font size is
          in CHART units, so the same label renders small in a narrow pane and
          oversized on a wide screen — it was never as quiet as it measured.
          Positioned in percentages so it still tracks the plot geometry. */}
      {points?.some((p) => p.x >= vx[0] && p.x <= vx[1] && Number.isFinite(p.y)) && (
        <div className="chart-point-labels" aria-hidden>
          {points.map((p, i) =>
            p.x >= vx[0] && p.x <= vx[1] && Number.isFinite(p.y) ? (
              <span
                key={`ptl${i}`}
                className={`chart-point-label${p.place === 'below' ? ' below' : ''}`}
                style={{
                  left: `${(xPos(p.x) / W) * 100}%`,
                  top: `${(yPos(p.y) / H) * 100}%`,
                  ...(p.color ? { color: p.color } : {}),
                }}
              >
                {p.label}
              </span>
            ) : null,
          )}
        </div>
      )}
      </div>
      {showGestureHint && (
        /* One-time gesture teacher, on the primary chart only: zoom, pan and
           legend-toggle are invisible affordances — whoever doesn't know them
           doesn't have them. Gone forever after the first real zoom (proof of
           knowledge) or an explicit dismiss. */
        <p className="chart-hint">
          <span>
            scroll = zoom · Shift+scroll = vertical · drag = pan · double-click = reset · click a
            legend chip to show/hide its curve
          </span>
          <button type="button" onClick={dismissGestureHint} aria-label="Dismiss chart gesture hint">
            ✕
          </button>
        </p>
      )}
    </div>
  );
}
