import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SonogramData } from '../lib/sonogram.ts';
import { SONOGRAM_BAND_DB, sonogramBandT, sonogramColor } from '../lib/sonogram.ts';
import { FREQ_TICKS, fmtHz } from './Chart.tsx';

/**
 * Directivity sonogram: SVG frame (same axis styling as Chart) around a
 * canvas-rendered heatmap. x = log frequency, y = angle (mirrored ±), color =
 * relative SPL on the sequential blue ramp. The heatmap interpolates linearly
 * between measured angle rows; frequency needs no interpolation because the
 * grid is log-spaced, so one sample = one pixel column under the log axis.
 */

interface SonogramProps {
  data: SonogramData;
  /** −6 dB half-beamwidth per frequency (deg); NaN = wider than measured. */
  beamwidthDeg?: readonly number[];
  xDomain: [number, number];
  /** Color floor in dB (values at/below map to the quiet end). */
  floorDb?: number;
  height?: number;
}

/** CSS color for the band containing vDb (see sonogramBandT). */
function bandCss(vDb: number, floorDb: number, dark: boolean): string {
  const [r, g, b] = sonogramColor(sonogramBandT(vDb, floorDb), dark);
  return `rgb(${r},${g},${b})`;
}

const W = 900;
const PAD = { l: 46, r: 12, t: 10, b: 26 };
const HEAT_ROWS = 240; // canvas rows; interpolated over angle

/** Dark mode from data-theme override or system preference, live-updated. */
function useIsDark(): boolean {
  const get = () => {
    const t = document.documentElement.dataset.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const [dark, setDark] = useState(get);
  useEffect(() => {
    const update = () => setDark(get());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', update);
      obs.disconnect();
    };
  }, []);
  return dark;
}

/** Linear interpolation of the value at (angle a, freq column k). */
function sampleValue(data: SonogramData, a: number, k: number): number {
  const { angles, values } = data;
  if (a <= angles[0]) return values[0][k];
  for (let i = 1; i < angles.length; i++) {
    if (a <= angles[i]) {
      const t = (a - angles[i - 1]) / (angles[i] - angles[i - 1]);
      return values[i - 1][k] + t * (values[i][k] - values[i - 1][k]);
    }
  }
  return values[angles.length - 1][k];
}

export default function Sonogram({
  data,
  beamwidthDeg,
  xDomain,
  floorDb = -24,
  height = 300,
}: SonogramProps) {
  const dark = useIsDark();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ f: number; a: number } | null>(null);

  const H = height;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const lx0 = Math.log10(xDomain[0]);
  const lx1 = Math.log10(xDomain[1]);
  const xPos = (f: number) => PAD.l + ((Math.log10(f) - lx0) / (lx1 - lx0)) * plotW;

  const aMax = data.angles[data.angles.length - 1];
  const aMin = data.angles[0];
  const yPos = (a: number) => PAD.t + ((aMax - a) / (aMax - aMin)) * plotH;

  const heatmap = useMemo(() => {
    const n = data.freq.length;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = HEAT_ROWS;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, HEAT_ROWS);
    for (let r = 0; r < HEAT_ROWS; r++) {
      const a = aMax - (r / (HEAT_ROWS - 1)) * (aMax - aMin);
      for (let k = 0; k < n; k++) {
        const v = sampleValue(data, a, k);
        const [red, g, b] = sonogramColor(sonogramBandT(v, floorDb), dark);
        const o = (r * n + k) * 4;
        img.data[o] = red;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }, [data, floorDb, dark, aMin, aMax]);

  // Angle ticks: multiples of a step that yields a readable count.
  const yTicks = useMemo(() => {
    const step = aMax - aMin > 100 ? 30 : 15;
    const out: number[] = [];
    for (let a = Math.ceil(aMin / step) * step; a <= aMax; a += step) out.push(a);
    return out;
  }, [aMin, aMax]);

  const xTicks = FREQ_TICKS.filter((f) => f >= xDomain[0] && f <= xDomain[1]);

  // ±beamwidth contour paths, broken at NaN (wider than measured).
  const contours = useMemo(() => {
    if (!beamwidthDeg) return [];
    const build = (sign: 1 | -1) => {
      let d = '';
      let pen = false;
      for (let k = 0; k < data.freq.length; k++) {
        const f = data.freq[k];
        const bw = beamwidthDeg[k];
        if (f < xDomain[0] || f > xDomain[1] || Number.isNaN(bw) || bw * sign < aMin || bw * sign > aMax) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${xPos(f).toFixed(1)},${yPos(sign * bw).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    return [build(1), build(-1)].filter((d) => d !== '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beamwidthDeg, data, xDomain, aMin, aMax, height]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    if (px < PAD.l || px > W - PAD.r || py < PAD.t || py > H - PAD.b) {
      setHover(null);
      return;
    }
    const f = 10 ** (lx0 + ((px - PAD.l) / plotW) * (lx1 - lx0));
    const a = aMax - ((py - PAD.t) / plotH) * (aMax - aMin);
    setHover({ f, a });
  }

  const hoverInfo = useMemo(() => {
    if (!hover) return null;
    // Nearest frequency column (log distance), interpolated angle.
    let k = 0;
    let best = Infinity;
    for (let i = 0; i < data.freq.length; i++) {
      const d = Math.abs(Math.log10(data.freq[i]) - Math.log10(hover.f));
      if (d < best) {
        best = d;
        k = i;
      }
    }
    const bw = beamwidthDeg?.[k];
    return {
      f: data.freq[k],
      a: hover.a,
      v: sampleValue(data, hover.a, k),
      widthDeg: bw !== undefined && !Number.isNaN(bw) ? 2 * bw : null,
    };
  }, [hover, data, beamwidthDeg]);

  const imgX0 = xPos(data.freq[0]);
  const imgX1 = xPos(data.freq[data.freq.length - 1]);
  const clipId = useId();
  // Hard-stop gradient: one block per 3 dB band, quiet (floor) on the left.
  const legendGradient = useMemo(() => {
    const bands = Math.max(2, Math.round(-floorDb / SONOGRAM_BAND_DB));
    const stops: string[] = [];
    for (let k = 0; k < bands; k++) {
      const c = bandCss(floorDb + (k + 0.5) * SONOGRAM_BAND_DB, floorDb, dark);
      const from = (k / bands) * 100;
      const to = ((k + 1) / bands) * 100;
      stops.push(`${c} ${from.toFixed(1)}%`, `${c} ${to.toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  }, [floorDb, dark]);
  const tooltipLeft = hover ? xPos(hover.f) > W - 230 : false;

  return (
    <div className="chart">
      <div className="chart-legend sono-legend">
        <span className="sono-legend-label">{floorDb} dB</span>
        <span className="sono-legend-bar" style={{ background: legendGradient }} />
        <span className="sono-legend-label">
          0 dB {data.mode === 'normalized' ? 'rel. on-axis' : 'rel. max'} · {SONOGRAM_BAND_DB} dB/band
        </span>
        {beamwidthDeg && (
          <span className="legend-item sono-contour-key">
            <span className="sono-contour-swatch" />
            −6 dB beamwidth
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <image
            href={heatmap}
            x={imgX0}
            y={PAD.t}
            width={imgX1 - imgX0}
            height={plotH}
            preserveAspectRatio="none"
          />
          {contours.map((d, i) => (
            <path key={i} d={d} className="sono-contour" />
          ))}
        </g>
        {/* gridlines over the heatmap, faint */}
        {xTicks.map((f) => (
          <line key={f} x1={xPos(f)} x2={xPos(f)} y1={PAD.t} y2={H - PAD.b} className="grid sono-grid" />
        ))}
        {yTicks.map((a) => (
          <line key={a} x1={PAD.l} x2={W - PAD.r} y1={yPos(a)} y2={yPos(a)} className="grid sono-grid" />
        ))}
        {xTicks.map((f) => (
          <text key={f} x={xPos(f)} y={H - PAD.b + 16} className="tick" textAnchor="middle">
            {fmtHz(f)}
          </text>
        ))}
        {yTicks.map((a) => (
          <text key={a} x={PAD.l - 6} y={yPos(a) + 3.5} className="tick" textAnchor="end">
            {a}
          </text>
        ))}
        <text x={10} y={PAD.t + 10} className="tick unit">
          °hor
        </text>
        {hover && hoverInfo && (
          <>
            <line x1={xPos(hover.f)} x2={xPos(hover.f)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
            <line x1={PAD.l} x2={W - PAD.r} y1={yPos(hover.a)} y2={yPos(hover.a)} className="crosshair" />
            <foreignObject
              x={tooltipLeft ? xPos(hover.f) - 222 : xPos(hover.f) + 10}
              y={PAD.t + 4}
              width={212}
              height={plotH}
              pointerEvents="none"
            >
              <div className="tooltip">
                <div className="tooltip-freq">
                  {Math.round(hoverInfo.f)} Hz · {hoverInfo.a.toFixed(0)}°
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">
                    {data.mode === 'normalized' ? 'Rel. on-axis' : 'Rel. max'}
                  </span>
                  <span className="tooltip-val">{hoverInfo.v.toFixed(1)} dB</span>
                </div>
                <div className="tooltip-row">
                  <span className="tooltip-label">−6 dB beamwidth</span>
                  <span className="tooltip-val">
                    {hoverInfo.widthDeg !== null ? `${hoverInfo.widthDeg.toFixed(0)}°` : `>${2 * aMax}°`}
                  </span>
                </div>
              </div>
            </foreignObject>
          </>
        )}
      </svg>
    </div>
  );
}
