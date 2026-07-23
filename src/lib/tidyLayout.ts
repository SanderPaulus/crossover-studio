import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpPart } from './parsers/vxp.ts';

/**
 * Tidy layout: re-draw a schematic FROM ITS NETLIST — electrically identical
 * (same partIds, params, locks, polarity), only the placement is rebuilt.
 *
 * Why: layout travels with the data. Filters exported before a layout fix,
 * or schematics reshaped by pruning, keep their old cramped coordinates
 * forever — Sander's "near perfect" import drew mid chains straight through
 * the tweeter row. Instead of patching stored coordinates, we re-place:
 *
 *   - per driver, the series path from the source (BFS over element groups,
 *     never through ground) becomes a horizontal bus;
 *   - parallel pairs on the bus (pad + bypass) become the raised loop;
 *   - linear chains to ground become vertical columns, extra chains on one
 *     node spread sideways;
 *   - branches stack with dynamic air (5 rows below the deepest point).
 *
 * DELIBERATELY conservative: anything that does not decompose into this
 * ladder shape (bridges, shared series sections, branching shunt trees,
 * >2-wide parallel groups) returns null — the caller keeps the original
 * drawing. A wrong-but-pretty redraw would be a lie about the circuit.
 */

const XSTEP = 7; // grid units per series element
const CHAIN = 5; // vertical units per chain element
const DROP = 7; // generator/driver column height
const GAP = 5; // vertical air between branch blocks
const SPREAD = 6; // extra column for another chain on the same node
const YBUS = 6; // absolute y of the first branch's bus
const LOOP = 4; // raised-loop height above the bus

interface Group {
  key: string;
  a: number;
  b: number;
  parts: VxpPart[]; // parallel members between the same node pair
}

interface Pt {
  x: number;
  y: number;
}

export function tidySchematic(orig: readonly VxpPart[]): VxpPart[] | null {
  // Open/shorted parts emit no netlist element — a redraw would silently
  // drop them from the schematic. Their state is the user's; keep hands off.
  if (orig.some((p) => p.open || p.shorted)) return null;
  let netlist;
  try {
    ({ netlist } = crossoverToNetlist({ name: 'tidy', parts: [...orig] }));
  } catch {
    return null;
  }
  const els = netlist.elements;
  const source = els.find((e) => e.kind === 'source');
  const drivers = els.filter((e) => e.kind === 'driver');
  if (!source || drivers.length === 0) return null;

  const byId = new Map<string, VxpPart>();
  for (const p of orig) if (p.partId !== undefined) byId.set(p.partId, p);
  const sourcePart = byId.get(source.id) ?? orig.find((p) => p.type === 'Generator');
  if (!sourcePart) return null;

  // Group passives by node pair; every one must map back to an original part.
  const groups = new Map<string, Group>();
  for (const e of els) {
    if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
    const p = byId.get(e.id);
    if (!p) return null;
    const a = Math.min(e.nodes[0], e.nodes[1]);
    const b = Math.max(e.nodes[0], e.nodes[1]);
    if (a === b) return null;
    const key = `${a}-${b}`;
    const g = groups.get(key) ?? { key, a, b, parts: [] };
    g.parts.push(p);
    groups.set(key, g);
  }

  const hot = source.nodes[0] === 0 ? source.nodes[1] : source.nodes[0];
  if (hot === 0) return null;

  const adj = new Map<number, Group[]>();
  for (const g of groups.values()) {
    for (const n of [g.a, g.b]) {
      const l = adj.get(n) ?? [];
      l.push(g);
      adj.set(n, l);
    }
  }
  const other = (g: Group, n: number): number => (g.a === n ? g.b : g.a);

  const used = new Set<string>();

  /** Shortest series path hot → target over unused groups, never through
   *  ground. Null when no path is left (e.g. shared series section). */
  const pathTo = (target: number): Group[] | null => {
    if (target === hot) return [];
    const prev = new Map<number, { g: Group; from: number }>();
    const q: number[] = [hot];
    const seen = new Set([hot]);
    while (q.length > 0) {
      const n = q.shift()!;
      for (const g of adj.get(n) ?? []) {
        if (used.has(g.key)) continue;
        const m = other(g, n);
        if (m === 0 || seen.has(m)) continue;
        seen.add(m);
        prev.set(m, { g, from: n });
        if (m === target) {
          const path: Group[] = [];
          let cur = m;
          while (cur !== hot) {
            const s = prev.get(cur)!;
            path.unshift(s.g);
            cur = s.from;
          }
          return path;
        }
        q.push(m);
      }
    }
    return null;
  };

  /** Linear chain from `start` through `g0` down to ground; null when the
   *  chain branches or contains parallel members. Marks groups used. */
  const chainFrom = (start: number, g0: Group): Group[] | null => {
    const chain: Group[] = [];
    let n = start;
    let g: Group | undefined = g0;
    for (;;) {
      if (g.parts.length !== 1) return null;
      chain.push(g);
      used.add(g.key);
      n = other(g, n);
      if (n === 0) return chain;
      const nexts = (adj.get(n) ?? []).filter((x) => !used.has(x.key));
      if (nexts.length !== 1) return null;
      g = nexts[0];
    }
  };

  // Reserve the series paths FIRST (so chain walks cannot eat them).
  const paths: Group[][] = [];
  for (const d of drivers) {
    const dHot = d.nodes[0] === 0 ? d.nodes[1] : d.nodes[0];
    if (dHot === 0) return null;
    if (!byId.has(d.id)) return null;
    const path = pathTo(dHot);
    if (path === null) return null;
    for (const g of path) used.add(g.key);
    paths.push(path);
  }

  const reWire = (p: VxpPart, wires: Pt[]): VxpPart => ({
    ...p,
    params: p.params.map((q) => ({ ...q })),
    wires,
  });

  interface Block {
    parts: VxpPart[];
    minY: number;
    maxY: number;
  }
  const blocks: Block[] = [];

  for (let bi = 0; bi < drivers.length; bi++) {
    const d = drivers[bi];
    const path = paths[bi];
    const parts: VxpPart[] = [];
    let x = 3;
    let minY = 0;
    let maxY = 0;
    const track = (y: number) => {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    // The generator (and any shunts on the shared hot node) live on branch 0.
    let columnTaken = false;
    if (bi === 0) {
      parts.push(reWire(sourcePart, [{ x, y: 0 }, { x, y: DROP }]));
      parts.push({ type: 'Ground', params: [], wires: [{ x, y: DROP }] });
      track(DROP + 1);
      columnTaken = true;
    }

    /** One vertical column: stacked elements ending in a ground symbol. */
    const placeColumn = (stack: readonly VxpPart[]) => {
      if (columnTaken) {
        parts.push({ type: 'Wire', params: [], wires: [{ x, y: 0 }, { x: x + SPREAD, y: 0 }] });
        x += SPREAD;
      }
      columnTaken = true;
      let y = 0;
      for (const p of stack) {
        parts.push(reWire(p, [{ x, y }, { x, y: y + CHAIN }]));
        y += CHAIN;
      }
      parts.push({ type: 'Ground', params: [], wires: [{ x, y }] });
      track(y + 1);
    };

    /** All remaining chains hanging off node n, spread over columns. */
    const drawShunts = (n: number): boolean => {
      for (;;) {
        const cands = (adj.get(n) ?? []).filter((g) => !used.has(g.key));
        if (cands.length === 0) return true;
        const g = cands[0];
        if (other(g, n) === 0) {
          // Direct shunt(s) to ground. Multiple parts in this group are the
          // COMMON case (two grounded elements on one node = parallel in
          // netlist terms) — each gets its own column.
          used.add(g.key);
          for (const p of g.parts) placeColumn([p]);
        } else {
          const chain = chainFrom(n, g);
          if (!chain) return false;
          placeColumn(chain.map((cg) => cg.parts[0]));
        }
      }
    };

    let node = hot;
    if (bi === 0 && !drawShunts(hot)) return null;

    for (const g of path) {
      // Parallel members on the series path: pad+bypass pair, or the classic
      // parallel L∥C(∥R) trap — main on the bus, the rest as stacked loops.
      if (g.parts.length > 3) return null;
      const sorted = [...g.parts].sort((p1, p2) =>
        (p1.type === 'Resistor' ? 0 : 1) - (p2.type === 'Resistor' ? 0 : 1),
      );
      parts.push(reWire(sorted[0], [{ x, y: 0 }, { x: x + XSTEP, y: 0 }]));
      for (let li = 1; li < sorted.length; li++) {
        const yLoop = -LOOP * li;
        parts.push({ type: 'Wire', params: [], wires: [{ x, y: yLoop + LOOP }, { x, y: yLoop }] });
        parts.push(reWire(sorted[li], [{ x, y: yLoop }, { x: x + XSTEP, y: yLoop }]));
        parts.push({
          type: 'Wire',
          params: [],
          wires: [{ x: x + XSTEP, y: yLoop }, { x: x + XSTEP, y: yLoop + LOOP }],
        });
        track(yLoop);
      }
      x += XSTEP;
      columnTaken = false;
      node = other(g, node);
      if (!drawShunts(node)) return null;
    }

    // Driver column at the end of the bus.
    parts.push({ type: 'Wire', params: [], wires: [{ x, y: 0 }, { x: x + XSTEP, y: 0 }] });
    x += XSTEP;
    parts.push(reWire(byId.get(d.id)!, [{ x, y: 0 }, { x, y: DROP }]));
    parts.push({ type: 'Ground', params: [], wires: [{ x, y: DROP }] });
    track(DROP + 1);

    blocks.push({ parts, minY, maxY });
  }

  // Anything not consumed means the topology did not decompose — bail.
  for (const g of groups.values()) if (!used.has(g.key)) return null;

  // Stack branch blocks with dynamic air; feed each next bus from the '+'.
  const out: VxpPart[] = [];
  let prevBottom = 0;
  let plus: Pt | null = null;
  blocks.forEach((blk, bi) => {
    const dy = bi === 0 ? YBUS : prevBottom + GAP - blk.minY;
    prevBottom = blk.maxY + dy;
    for (const p of blk.parts) {
      out.push({ ...p, wires: p.wires.map((w) => ({ x: w.x, y: w.y + dy })) });
    }
    if (bi === 0) plus = { x: 3, y: YBUS };
    else if (plus) {
      out.push({
        type: 'Wire',
        params: [],
        wires: [plus, { x: 1, y: plus.y }, { x: 1, y: dy }, { x: 3, y: dy }],
      });
    }
  });

  return out;
}
