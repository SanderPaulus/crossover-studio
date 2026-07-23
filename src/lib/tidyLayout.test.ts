import { describe, expect, it } from 'vitest';
import { tidySchematic } from './tidyLayout.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork } from './network.ts';
import { fromPolar } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';

const P = (x: number, y: number) => ({ x, y });
const W = (...pts: { x: number; y: number }[]): VxpPart => ({ type: 'Wire', params: [], wires: pts });
const GND = (x: number, y: number): VxpPart => ({ type: 'Ground', params: [], wires: [P(x, y)] });
const part = (
  type: 'Capacitor' | 'Inductor' | 'Resistor',
  id: string,
  value: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): VxpPart => ({
  type,
  partId: id,
  params: [{ name: type === 'Capacitor' ? 'C' : type === 'Inductor' ? 'L' : 'R', value, unit: type === 'Capacitor' ? 'uF' : type === 'Inductor' ? 'mH' : 'Ω' }],
  wires: [a, b],
});

/** Sander's "near perfect" export (jul 2026): the pre-layout-fix drawing
 *  whose mid chains ran through the tweeter row and whose bypass loop was
 *  drawn straight through a chain resistor. The regression fixture. */
function nearPerfect(): VxpPart[] {
  return [
    { type: 'Generator', partId: 'G', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 6), P(3, 13)] },
    GND(3, 13),
    part('Inductor', 'L1', 0.7033, P(3, 6), P(10, 6)),
    part('Capacitor', 'C2', 51.88, P(10, 6), P(10, 13)),
    GND(10, 13),
    W(P(10, 6), P(14, 6)),
    part('Inductor', 'L6', 0.1426, P(14, 6), P(21, 6)),
    part('Inductor', 'L7', 0.5484, P(21, 6), P(21, 11)),
    W(P(21, 11), P(21, 16)),
    part('Resistor', 'R9', 2.041, P(21, 16), P(21, 21)),
    GND(21, 21),
    W(P(21, 6), P(25, 6)),
    W(P(25, 6), P(25, 11)),
    part('Capacitor', 'C11', 31.99, P(25, 11), P(25, 16)),
    part('Resistor', 'R12', 1.912, P(25, 16), P(25, 21)),
    GND(25, 21),
    W(P(25, 6), P(32, 6)),
    { type: 'Driver', partId: 'D', model: 'mid', inverted: false, params: [], wires: [P(32, 6), P(32, 13)] },
    GND(32, 13),
    part('Capacitor', 'B·C1', 12.16, P(3, 22), P(10, 22)),
    part('Inductor', 'B·L2', 1.233, P(10, 22), P(10, 29)),
    GND(10, 29),
    W(P(10, 22), P(17, 22)),
    part('Resistor', 'B·R4', 4.028, P(17, 22), P(17, 29)),
    GND(17, 29),
    part('Resistor', 'B·R5', 15.4, P(17, 22), P(24, 22)),
    W(P(17, 22), P(17, 18)),
    part('Capacitor', 'B·C6', 2.506, P(17, 18), P(24, 18)),
    W(P(24, 18), P(24, 22)),
    part('Inductor', 'B·L7', 0.04978, P(24, 22), P(24, 27)),
    part('Capacitor', 'B·C8', 4.64, P(24, 27), P(24, 32)),
    part('Resistor', 'B·R9', 4.099, P(24, 32), P(24, 37)),
    GND(24, 37),
    W(P(24, 22), P(28, 22)),
    part('Inductor', 'B·L10', 0.5411, P(28, 22), P(28, 27)),
    W(P(28, 27), P(28, 32)),
    W(P(28, 32), P(28, 37)),
    GND(28, 37),
    W(P(28, 22), P(35, 22)),
    { type: 'Driver', partId: 'B·D', model: 'tweeter', inverted: false, params: [], wires: [P(35, 22), P(35, 29)] },
    GND(35, 29),
    W(P(3, 6), P(1, 6), P(1, 22), P(3, 22)),
  ];
}

/** Proper 2D segment intersection (excluding shared endpoints). */
function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const shared = (p: { x: number; y: number }, q: { x: number; y: number }) =>
    p.x === q.x && p.y === q.y;
  if (shared(a1, b1) || shared(a1, b2) || shared(a2, b1) || shared(a2, b2)) return false;
  const d = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const on = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
    Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const d1 = d(a1, a2, b1);
  const d2 = d(a1, a2, b2);
  const d3 = d(b1, b2, a1);
  const d4 = d(b1, b2, a2);
  if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return true;
  // Collinear overlap counts as crossing too (bodies drawn on top of each other).
  if (d1 === 0 && on(a1, a2, b1)) return true;
  if (d2 === 0 && on(a1, a2, b2)) return true;
  if (d3 === 0 && on(b1, b2, a1)) return true;
  if (d4 === 0 && on(b1, b2, a2)) return true;
  return false;
}

const GRID = [100, 1000, 10000];
const flatZ = (ohm: number) => GRID.map(() => fromPolar(ohm, 0));

function transfers(parts: readonly VxpPart[]) {
  const { netlist } = crossoverToNetlist({ name: 'x', parts: [...parts] });
  const sol = solveNetwork(netlist, GRID, { mid: flatZ(6), tweeter: flatZ(6) });
  const out: Record<string, number[]> = {};
  for (const d of sol.drivers) {
    out[d.model] = sol.transfers[d.id].map((c) => Math.hypot(c.re, c.im));
  }
  return out;
}

describe('tidySchematic', () => {
  it("re-lays out Sander's cramped import: identical netlist, no crossing component bodies", () => {
    const orig = nearPerfect();
    const tidied = tidySchematic(orig);
    expect(tidied).not.toBeNull();

    // Electrically IDENTICAL: same driver transfers on the same loads.
    const a = transfers(orig);
    const b = transfers(tidied!);
    for (const model of ['mid', 'tweeter']) {
      for (let i = 0; i < GRID.length; i++) {
        expect(b[model][i]).toBeCloseTo(a[model][i], 9);
      }
    }

    // Every part id survives with its params.
    const ids = (ps: readonly VxpPart[]) => ps.filter((p) => p.partId).map((p) => p.partId).sort();
    expect(ids(tidied!)).toEqual(ids(orig));

    // THE point: no two component BODIES cross or overlap anywhere.
    const bodies = tidied!.filter((p) => p.type !== 'Wire' && p.type !== 'Ground' && p.wires.length === 2);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        expect(
          segmentsCross(bodies[i].wires[0], bodies[i].wires[1], bodies[j].wires[0], bodies[j].wires[1]),
        ).toBe(false);
      }
    }
    // …and no component body crosses a wire segment either.
    const wireSegs: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
    for (const p of tidied!) {
      if (p.type !== 'Wire') continue;
      for (let k = 0; k + 1 < p.wires.length; k++) wireSegs.push([p.wires[k], p.wires[k + 1]]);
    }
    for (const bpart of bodies) {
      for (const [w1, w2] of wireSegs) {
        expect(segmentsCross(bpart.wires[0], bpart.wires[1], w1, w2)).toBe(false);
      }
    }

    // Branch zones are separated: every mid part sits fully above every
    // tweeter (B·) part.
    const maxYMid = Math.max(
      ...tidied!.filter((p) => p.partId && !p.partId.startsWith('B·')).flatMap((p) => p.wires.map((w) => w.y)),
    );
    const minYTw = Math.min(
      ...tidied!.filter((p) => p.partId?.startsWith('B·')).flatMap((p) => p.wires.map((w) => w.y)),
    );
    expect(minYTw).toBeGreaterThan(maxYMid);
  });

  it('keeps locks, polarity and extra params on the redrawn parts', () => {
    const orig = nearPerfect().map((p) =>
      p.partId === 'L1'
        ? { ...p, locked: true, params: [...p.params, { name: 'DCR', value: 0.2, unit: 'Ω' }] }
        : p.partId === 'B·D'
          ? { ...p, inverted: true }
          : p,
    );
    const tidied = tidySchematic(orig)!;
    const l1 = tidied.find((p) => p.partId === 'L1')!;
    expect(l1.locked).toBe(true);
    expect(l1.params.some((q) => q.name === 'DCR' && q.value === 0.2)).toBe(true);
    expect(tidied.find((p) => p.partId === 'B·D')!.inverted).toBe(true);
  });

  it('bails on a shared series section instead of drawing a lie', () => {
    // One common choke feeds BOTH drivers: the ladder decomposition cannot
    // place L1 on two buses at once — keep the original drawing.
    const parts: VxpPart[] = [
      { type: 'Generator', partId: 'G', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 6), P(3, 13)] },
      GND(3, 13),
      part('Inductor', 'L1', 0.5, P(3, 6), P(10, 6)),
      part('Capacitor', 'C1', 10, P(10, 6), P(16, 6)),
      { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(10, 6), P(10, 13)] },
      GND(10, 13),
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(16, 6), P(16, 13)] },
      GND(16, 13),
    ];
    // mid hangs directly on the shared node; the tweeter path would need L1
    // again — but it is already used by the mid branch path.
    expect(tidySchematic(parts)).toBeNull();
  });

  it('bails on open/shorted parts (their state must not silently vanish)', () => {
    const parts = nearPerfect().map((p) => (p.partId === 'R9' ? { ...p, open: true } : p));
    expect(tidySchematic(parts)).toBeNull();
  });
});
