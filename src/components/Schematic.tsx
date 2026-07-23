import { useMemo } from 'react';
import type { VxpCrossover, VxpPart } from '../lib/parsers/vxp.ts';

/**
 * Read-only schematic rendering of a VituixCAD crossover, drawn straight from
 * the part/wire coordinates in the project file. This is the visual precursor
 * of the editable node editor.
 */

export const S = 13; // px per schematic grid unit
export const PADDING = 26;

interface Pt {
  x: number;
  y: number;
}

export const px = (p: Pt, min: Pt): Pt => ({
  x: PADDING + (p.x - min.x) * S,
  y: PADDING + (p.y - min.y) * S,
});

/** Coordinates used by ≥3 parts are electrical junctions (drawn as dots). */
export function junctionsOf(parts: readonly VxpPart[]): Pt[] {
  const count = new Map<string, number>();
  for (const p of parts) {
    const seen = new Set<string>();
    for (const w of p.wires) {
      const k = `${w.x},${w.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
  }
  return [...count.entries()]
    .filter(([, n]) => n >= 3)
    .map(([k]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
}

function param(p: VxpPart, name: string): number | undefined {
  return p.params.find((par) => par.name === name)?.value;
}

function partValue(p: VxpPart): string {
  switch (p.type) {
    case 'Capacitor':
      return `${param(p, 'C')} µF`;
    case 'Inductor':
      return `${param(p, 'L')} mH`;
    case 'Resistor':
      return `${param(p, 'R')} Ω`;
    case 'Generator':
      return `${param(p, 'Eg')} V`;
    case 'Driver':
      return p.model ?? '';
    default:
      return '';
  }
}

const DRIVER_COLOR: Record<string, string> = {
  mid: 'var(--viz-woofer)',
  woofer: 'var(--viz-woofer)',
  tweeter: 'var(--viz-tweeter)',
};

export default function Schematic({ xo }: { xo: VxpCrossover }) {
  const { min, width, height, junctions } = useMemo(() => {
    const pts = xo.parts.flatMap((p) => p.wires);
    const minP = { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) };
    const maxP = { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) };
    return {
      min: minP,
      width: (maxP.x - minP.x) * S + PADDING * 2,
      height: (maxP.y - minP.y) * S + PADDING * 2,
      junctions: junctionsOf(xo.parts),
    };
  }, [xo]);

  return (
    <div className="schematic-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Schematic of ${xo.name}`}
      >
        {xo.parts.map((p, i) => (
          <PartGlyph key={i} part={p} min={min} />
        ))}
        {junctions.map((j, i) => {
          const c = px(j, min);
          return <circle key={i} cx={c.x} cy={c.y} r={3} className="sch-junction" />;
        })}
      </svg>
    </div>
  );
}

export function PartGlyph({ part: p, min }: { part: VxpPart; min: Pt }) {
  if (p.wires.length === 0) return null;

  if (p.type === 'Wire') {
    const d = p.wires.map((w, i) => `${i === 0 ? 'M' : 'L'}${px(w, min).x},${px(w, min).y}`).join('');
    return <path d={d} className="sch-wire" />;
  }

  if (p.type === 'Ground') {
    const c = px(p.wires[0], min);
    return (
      <g className="sch-symbol" transform={`translate(${c.x},${c.y})`}>
        <line x1={0} y1={0} x2={0} y2={8} />
        <line x1={-8} y1={8} x2={8} y2={8} />
        <line x1={-5} y1={12} x2={5} y2={12} />
        <line x1={-2} y1={16} x2={2} y2={16} />
      </g>
    );
  }

  const a = px(p.wires[0], min);
  const b = px(p.wires[p.wires.length - 1], min);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const mid = len / 2;
  const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);

  // Label offset perpendicular to the part axis.
  const label = (
    <g
      className="sch-label"
      transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`}
    >
      <text x={vertical ? 10 : 0} y={vertical ? -2 : -14} textAnchor={vertical ? 'start' : 'middle'}>
        {p.locked ? '🔒 ' : ''}
        {p.partId}
        {p.shorted ? ' (short)' : ''}
        {p.open ? ' (open)' : ''}
      </text>
      <text
        x={vertical ? 10 : 0}
        y={vertical ? 10 : 24}
        textAnchor={vertical ? 'start' : 'middle'}
        className="sch-value"
      >
        {p.shorted || p.open ? '' : partValue(p)}
      </text>
    </g>
  );

  const g = 14; // half glyph width along the axis
  const stubs = (
    <>
      <line x1={0} y1={0} x2={mid - g} y2={0} />
      <line x1={mid + g} y1={0} x2={len} y2={0} />
    </>
  );

  let body: React.ReactNode;
  if (p.shorted) {
    body = <line x1={mid - g} y1={0} x2={mid + g} y2={0} />;
  } else if (p.open) {
    body = <line x1={mid - g} y1={0} x2={mid + g} y2={0} strokeDasharray="3 4" opacity={0.4} />;
  } else {
    switch (p.type) {
      case 'Resistor':
        body = <rect x={mid - g} y={-5} width={g * 2} height={10} fill="none" />;
        break;
      case 'Capacitor':
        body = (
          <>
            <line x1={mid - g} y1={0} x2={mid - 3} y2={0} />
            <line x1={mid - 3} y1={-9} x2={mid - 3} y2={9} />
            <line x1={mid + 3} y1={-9} x2={mid + 3} y2={9} />
            <line x1={mid + 3} y1={0} x2={mid + g} y2={0} />
          </>
        );
        break;
      case 'Inductor':
        body = (
          <path
            fill="none"
            d={`M${mid - g},0 a4.66,5 0 0 1 9.33,0 a4.66,5 0 0 1 9.33,0 a4.66,5 0 0 1 9.33,0`}
          />
        );
        break;
      case 'Driver': {
        const color = DRIVER_COLOR[p.model ?? ''] ?? 'var(--fg)';
        body = (
          <>
            <circle cx={mid} cy={0} r={10} fill="none" style={{ stroke: color }} />
            <path
              d={`M${mid - 4},-4 L${mid},-4 L${mid + 5},-8 L${mid + 5},8 L${mid},4 L${mid - 4},4 Z`}
              style={{ stroke: color }}
              fill="none"
              transform={`rotate(${-angle} ${mid} 0)`}
            />
          </>
        );
        break;
      }
      case 'Generator':
        body = (
          <>
            <circle cx={mid} cy={0} r={10} fill="none" />
            <path
              d={`M${mid - 5},0 q2.5,-6 5,0 q2.5,6 5,0`}
              fill="none"
              transform={`rotate(${-angle} ${mid} 0)`}
            />
          </>
        );
        break;
      default:
        body = <rect x={mid - g} y={-5} width={g * 2} height={10} fill="none" opacity={0.4} />;
    }
  }

  return (
    <>
      <g className="sch-symbol" transform={`translate(${a.x},${a.y}) rotate(${angle})`}>
        {stubs}
        {body}
      </g>
      {label}
    </>
  );
}
