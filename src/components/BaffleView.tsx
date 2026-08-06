import { pistonDiameterMm } from '../lib/cabinet.ts';
import type { BranchRole } from '../lib/driverSlots.ts';

export interface BaffleDriver {
  role: BranchRole;
  label: string;
  /** Offset from the reference point, mm (+x right, +y up). */
  xMm: number;
  yMm: number;
  /** Cone area of ONE driver, cm² — the honest diameter for the drawing. */
  sdCm2: number;
  /** Identical drivers in this branch, stacked on `spacingMm`. */
  count: number;
  spacingMm: number;
}

interface Props {
  widthMm: number;
  heightMm: number;
  /** How far below the top edge the measurement reference point sits. */
  refFromTopMm: number;
  drivers: readonly BaffleDriver[];
}

/**
 * The baffle, drawn to scale from the numbers already typed in.
 *
 * WHY THIS EXISTS: positions, cone areas and driver counts are the one part of
 * the input a designer cannot check by re-reading it — "y = −380" tells you
 * nothing about whether the woofer really sits there. Drawn, a transposed sign
 * or a decimal slip is obvious at a glance.
 *
 * ONE SCALE FOR BOTH AXES, always. A drawing that stretches to fill its box
 * lies about exactly the thing it is here to show; the aspect ratio IS the
 * information. Same rule as the measuring guide.
 */
export function BaffleView({ widthMm, heightMm, refFromTopMm, drivers }: Props) {
  if (!(widthMm > 0) || !(heightMm > 0)) return null;

  // Fit the cabinet into a 150 px-wide drawing; the height follows from the
  // real proportions, never from the space available.
  const s = 150 / widthMm;
  const pad = 30;
  const bw = widthMm * s;
  const bh = heightMm * s;
  const cx = pad + bw / 2;
  const refY = pad + refFromTopMm * s;

  /** Every cone of a branch: one per driver, stacked on the spacing. */
  const cones = drivers.flatMap((d) => {
    const r = ((pistonDiameterMm(d.sdCm2) ?? 0) / 2) * s;
    const n = Math.max(1, d.count);
    // Centre the stack on the branch position, so a pair straddles it.
    const gap = d.spacingMm * s;
    const first = -((n - 1) * gap) / 2;
    return Array.from({ length: n }, (_, i) => ({
      key: `${d.role}-${i}`,
      label: d.label,
      cx: cx + d.xMm * s,
      cy: refY - d.yMm * s + first + i * gap,
      r,
    }));
  });

  return (
    <svg
      className="baffle-view"
      viewBox={`0 0 ${bw + pad * 2} ${bh + pad * 2}`}
      role="img"
      aria-label={`Scale drawing of a ${widthMm} by ${heightMm} mm baffle with ${cones.length} driver${cones.length === 1 ? '' : 's'} and the measurement reference point`}
    >
      <rect
        x={pad}
        y={pad}
        width={bw}
        height={bh}
        rx={4}
        fill="none"
        stroke="var(--viz-axis)"
        strokeWidth={1.5}
      />
      {cones.map((c) =>
        c.r > 0 ? (
          <circle
            key={c.key}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            fill="none"
            stroke="var(--viz-tick)"
            strokeWidth={1.2}
          />
        ) : null,
      )}
      {/* The reference point: the anchor every other number is measured from,
          so it is drawn as a line across the whole baffle, not just a dot. */}
      <line
        x1={pad - 10}
        y1={refY}
        x2={pad + bw + 10}
        y2={refY}
        stroke="var(--accent)"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      <circle cx={cx} cy={refY} r={3} fill="var(--accent)" />
      <text x={pad + bw + 12} y={refY + 3} fill="var(--accent)" fontSize={9}>
        ref
      </text>
      <text x={cx} y={pad - 10} fill="var(--viz-tick)" fontSize={9} textAnchor="middle">
        {widthMm} mm
      </text>
      <text
        x={pad - 10}
        y={pad + bh / 2}
        fill="var(--viz-tick)"
        fontSize={9}
        textAnchor="middle"
        transform={`rotate(-90 ${pad - 10} ${pad + bh / 2})`}
      >
        {heightMm} mm
      </text>
      {/* Floor line: the cabinet stands on something, and that is what the
          reference height above the floor is measured against. */}
      <line
        x1={pad - 16}
        y1={pad + bh}
        x2={pad + bw + 16}
        y2={pad + bh}
        stroke="var(--viz-axis)"
        strokeWidth={3}
      />
    </svg>
  );
}
