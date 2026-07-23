import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';
import type { SynthesizedComponent } from './synthesis.ts';
import { synthesizedToSchematic } from './synthSchematic.ts';
import { estimateCoilDcr } from './netlistEdit.ts';

/**
 * Pure editing operations for the drag & drop schematic editor (step 6,
 * phase 2). The schematic (VituixCAD-shaped parts + wires on a grid) is the
 * single source of truth: connectivity IS coordinate coincidence, exactly as
 * in the vxp format, and `crossoverToNetlist` derives the solvable netlist.
 * That keeps import (vxp), rendering (Schematic.tsx) and solving on one
 * representation with zero conversion loss.
 */

export interface Pt {
  x: number;
  y: number;
}

export type PlaceableType =
  | 'Inductor'
  | 'Capacitor'
  | 'Resistor'
  | 'Driver'
  | 'Generator'
  | 'Ground';

/** Default part length on the grid (matches synthSchematic's XSTEP). */
export const PART_LEN = 7;

const clone = (parts: readonly VxpPart[]): VxpPart[] =>
  parts.map((p) => ({
    ...p,
    params: p.params.map((par) => ({ ...par })),
    wires: p.wires.map((w) => ({ ...w })),
  }));

export function partParam(p: VxpPart, name: string): number | undefined {
  return p.params.find((par) => par.name === name)?.value;
}

/** Set (or add) a numeric parameter on one part; returns a new parts array. */
export function setPartParam(
  parts: readonly VxpPart[],
  index: number,
  name: string,
  value: number,
  unit: string,
): VxpPart[] {
  const next = clone(parts);
  const p = next[index];
  const existing = p.params.find((par) => par.name === name);
  if (existing) existing.value = value;
  else p.params.push({ name, value, unit });
  // A value/DCR/ESR change invalidates any catalog SKU the snap stamped here:
  // the BOM trusts `catalog` first, so a stale SKU would keep showing the old
  // part after a manual edit. Clear it; a fresh choice re-stamps it.
  delete p.catalog;
  return next;
}

/** Update non-param part fields (driver model, inversion, optimizer lock,
 *  catalog SKU attribution). */
export function setPartProps(
  parts: readonly VxpPart[],
  index: number,
  props: Partial<Pick<VxpPart, 'model' | 'inverted' | 'locked' | 'catalog'>>,
): VxpPart[] {
  const next = clone(parts);
  next[index] = { ...next[index], ...props };
  return next;
}

const isComponent = (p: VxpPart): boolean =>
  p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor';

/** Lock or unlock every R/L/C at once (the select/deselect-all toggle). */
export function setAllLocks(parts: readonly VxpPart[], locked: boolean): VxpPart[] {
  return clone(parts).map((p) => (isComponent(p) ? { ...p, locked } : p));
}

/**
 * Move one part by a grid delta. Existing wires and parts are never touched;
 * instead, every moved terminal that other parts connected to gets a STUB
 * wire from its old position to its new one. That preserves every existing
 * net by construction — a junction point can serve any number of parts, so
 * dragging one of them must not pull the shared point along. Dragging never
 * disconnects; delete the stub to disconnect deliberately.
 */
export function movePart(parts: readonly VxpPart[], index: number, dx: number, dy: number): VxpPart[] {
  if (dx === 0 && dy === 0) return clone(parts);
  const moved = parts[index];
  const next = clone(parts);
  next[index].wires = next[index].wires.map((w) => ({ x: w.x + dx, y: w.y + dy }));

  const stubs: VxpPart[] = [];
  const seen = new Set<string>();
  for (const w of moved.wires) {
    const k = `${w.x},${w.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const connected = parts.some(
      (p, i) => i !== index && p.wires.some((q) => q.x === w.x && q.y === w.y),
    );
    if (connected) {
      stubs.push({
        type: 'Wire',
        params: [],
        wires: [
          { x: w.x, y: w.y },
          { x: w.x + dx, y: w.y + dy },
        ],
      });
    }
  }
  return [...next, ...stubs];
}

/** Rotate a two-terminal part 90° around its first terminal. */
export function rotatePart(parts: readonly VxpPart[], index: number): VxpPart[] {
  const next = clone(parts);
  const p = next[index];
  if (p.wires.length < 2) return next;
  const [a, b] = [p.wires[0], p.wires[p.wires.length - 1]];
  const rot = { x: a.x - (b.y - a.y), y: a.y + (b.x - a.x) };
  p.wires = [a, rot];
  return next;
}

export function deletePart(parts: readonly VxpPart[], index: number): VxpPart[] {
  return clone(parts).filter((_, i) => i !== index);
}

/** Next free part id for a type: C1, L1, R1, D1, G1. */
export function nextPartId(parts: readonly VxpPart[], type: PlaceableType): string {
  const prefix =
    type === 'Inductor' ? 'L'
    : type === 'Capacitor' ? 'C'
    : type === 'Resistor' ? 'R'
    : type === 'Driver' ? 'D'
    : 'G';
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!parts.some((p) => p.partId === id)) return id;
  }
}

/**
 * New part at a grid position (its first terminal), horizontal by default —
 * rotate afterwards for shunt legs. Values are sane audio-crossover starters;
 * inductors get the 1.4 mm air-core DCR estimate.
 */
export function addPart(
  parts: readonly VxpPart[],
  type: PlaceableType,
  at: Pt,
  driverModel?: string,
): VxpPart[] {
  const partId = nextPartId(parts, type);
  const b = { x: at.x + PART_LEN, y: at.y };
  let part: VxpPart;
  switch (type) {
    case 'Inductor':
      part = {
        type,
        partId,
        params: [
          { name: 'L', value: 1, unit: 'mH' },
          { name: 'DCR', value: round4(estimateCoilDcr(1e-3)), unit: 'Ω' },
        ],
        wires: [at, b],
      };
      break;
    case 'Capacitor':
      part = {
        type,
        partId,
        params: [
          { name: 'C', value: 10, unit: 'uF' },
          { name: 'ESR', value: 0, unit: 'Ω' },
        ],
        wires: [at, b],
      };
      break;
    case 'Resistor':
      part = { type, partId, params: [{ name: 'R', value: 8.2, unit: 'Ω' }], wires: [at, b] };
      break;
    case 'Driver':
      part = {
        type,
        partId,
        model: driverModel ?? 'mid',
        inverted: false,
        params: [],
        wires: [at, { x: at.x, y: at.y + PART_LEN }],
      };
      break;
    case 'Generator':
      part = {
        type,
        partId,
        params: [
          { name: 'Eg', value: 2.83, unit: 'V' },
          { name: 'Rg', value: 0.001, unit: 'Ω' },
        ],
        wires: [at, { x: at.x, y: at.y + PART_LEN }],
      };
      break;
    case 'Ground':
      part = { type, params: [], wires: [at] };
      break;
  }
  return [...clone(parts), part];
}

/**
 * Wire between two grid points, elbow-routed (horizontal first) when the
 * points share neither row nor column. All its points fuse into one net.
 */
export function addWire(parts: readonly VxpPart[], a: Pt, b: Pt): VxpPart[] {
  if (a.x === b.x && a.y === b.y) return clone(parts);
  const pts: Pt[] = a.x !== b.x && a.y !== b.y ? [a, { x: b.x, y: a.y }, b] : [a, b];
  return [...clone(parts), { type: 'Wire', params: [], wires: pts }];
}

/** Shift everything so the top-left of the drawing sits at (margin, margin). */
export function normalizeOrigin(parts: readonly VxpPart[], margin = 2): VxpPart[] {
  const pts = parts.flatMap((p) => p.wires);
  if (pts.length === 0) return clone(parts);
  const dx = margin - Math.min(...pts.map((p) => p.x));
  const dy = margin - Math.min(...pts.map((p) => p.y));
  if (dx === 0 && dy === 0) return clone(parts);
  return clone(parts).map((p) => ({
    ...p,
    wires: p.wires.map((w) => ({ x: w.x + dx, y: w.y + dy })),
  }));
}

/**
 * Starter schematic: generator on the left, every measured driver straight on
 * the bus (unfiltered), each with its own ground leg.
 */
export function templateSchematic(models: readonly string[]): VxpCrossover {
  const parts: VxpPart[] = [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [
        { x: 3, y: 4 },
        { x: 3, y: 11 },
      ],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
  ];
  models.forEach((model, i) => {
    const x = 12 + i * 9;
    parts.push({
      type: 'Driver',
      partId: `D${i + 1}`,
      model,
      inverted: false,
      params: [],
      wires: [
        { x, y: 4 },
        { x, y: 11 },
      ],
    });
    parts.push({ type: 'Ground', params: [], wires: [{ x, y: 11 }] });
  });
  if (models.length > 0) {
    // Wires connect at their listed POINTS only — include every tap.
    parts.push({
      type: 'Wire',
      params: [],
      wires: [{ x: 3, y: 4 }, ...models.map((_, i) => ({ x: 12 + i * 9, y: 4 }))],
    });
  }
  return { name: 'Editor network', parts };
}

/**
 * Merge synthesised branches into one schematic on a shared generator:
 * branch 1 keeps its generator, further branches lose theirs and get a feed
 * wire from the shared '+' terminal, stacked below with vertical spacing.
 */
export function mergeSynthesizedSchematics(
  branches: readonly { components: readonly SynthesizedComponent[]; model: string }[],
): VxpCrossover {
  if (branches.length === 0) throw new Error('No branches to merge.');
  const parts: VxpPart[] = [];
  // Vertical placement is DYNAMIC: each branch starts 5 rows below the
  // deepest point of everything above it. A fixed row height collided the
  // moment a branch grew a 3-element chain (trap/notch reaches bus+15) while
  // the next branch's bypass loops reach 4 rows ABOVE its own bus — mid
  // chains were drawn straight through the tweeter row (Sanders screenshot).
  const GAP = 5;
  let prevBottom = 0;
  let plus: Pt | null = null;

  branches.forEach(({ components, model }, bi) => {
    const branch = synthesizedToSchematic(components, model);
    const ys = branch.parts.flatMap((p) => p.wires.map((w) => w.y));
    const minY = Math.min(...ys);
    const dy = bi === 0 ? 0 : prevBottom + GAP - minY;
    prevBottom = Math.max(...ys) + dy;
    for (const p of branch.parts) {
      if (bi > 0 && p.type === 'Generator') continue;
      // Drop the ground under the removed generator (it sits on the same x).
      if (bi > 0 && p.type === 'Ground' && p.wires[0].x === 3 && p.wires[0].y === 13) continue;
      const shifted: VxpPart = {
        ...p,
        partId: p.partId && bi > 0 ? `${String.fromCharCode(65 + bi)}·${p.partId}` : p.partId,
        wires: p.wires.map((w) => ({ x: w.x, y: w.y + dy })),
      };
      parts.push(shifted);
      if (bi === 0 && p.type === 'Generator') plus = { ...p.wires[0] };
    }
    if (bi > 0 && plus) {
      // Feed wire: shared '+' → around the left → this branch's bus input.
      const busIn = { x: 3, y: 6 + dy };
      parts.push({
        type: 'Wire',
        params: [],
        wires: [plus, { x: 1, y: plus.y }, { x: 1, y: busIn.y }, busIn],
      });
    }
  });

  return { name: 'Editor network', parts };
}

const round4 = (v: number): number => Number(v.toPrecision(4));
