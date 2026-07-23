import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';
import type { Netlist, NetElement } from './network.ts';

/**
 * Convert a VituixCAD crossover schematic into a solvable netlist.
 *
 * VituixCAD encodes topology purely through schematic-grid coordinates: two
 * parts are connected when they share an (x, y) point, and `Wire` parts fuse
 * all their points into one net. We rebuild the nets with a union-find over
 * coordinate keys, then map each surviving net to an MNA node (ground = 0).
 *
 * Part-state handling mirrors VituixCAD semantics:
 *  - Shorted part → its two terminals are fused (a wire), the part vanishes.
 *  - Open part    → the part vanishes, terminals stay separate.
 */

export interface VxpNetlistResult {
  netlist: Netlist;
  warnings: string[];
}

export class VxpNetworkError extends Error {}

const GROUND_KEY = 'GND';

class UnionFind {
  private parent = new Map<string, string>();

  find(k: string): string {
    let root = this.parent.get(k) ?? k;
    if (root !== k) {
      root = this.find(root);
      this.parent.set(k, root);
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const key = (w: { x: number; y: number }): string => `${w.x},${w.y}`;

function param(p: VxpPart, name: string): number | undefined {
  return p.params.find((par) => par.name === name)?.value;
}

/** Two-terminal parts use their first and last wire point as terminals. */
function terminals(p: VxpPart): [string, string] {
  if (p.wires.length < 2) {
    throw new VxpNetworkError(`Part ${p.partId ?? p.type} has ${p.wires.length} terminal(s).`);
  }
  return [key(p.wires[0]), key(p.wires[p.wires.length - 1])];
}

export function crossoverToNetlist(xo: VxpCrossover): VxpNetlistResult {
  const warnings: string[] = [];
  const uf = new UnionFind();

  // Pass 1 — build the nets.
  for (const p of xo.parts) {
    if (p.wires.length === 0) continue;
    if (p.type === 'Wire') {
      for (const w of p.wires.slice(1)) uf.union(key(p.wires[0]), key(w));
    } else if (p.type === 'Ground') {
      for (const w of p.wires) uf.union(GROUND_KEY, key(w));
    } else if (p.shorted) {
      const [a, b] = terminals(p);
      uf.union(a, b);
    }
  }

  // Pass 2 — assign node numbers (ground root = 0).
  const groundRoot = uf.find(GROUND_KEY);
  const nodeOf = new Map<string, number>([[groundRoot, 0]]);
  let nextNode = 1;
  const nodeFor = (coordKey: string): number => {
    const root = uf.find(coordKey);
    let n = nodeOf.get(root);
    if (n === undefined) {
      n = nextNode++;
      nodeOf.set(root, n);
    }
    return n;
  };

  // Pass 3 — emit elements.
  const elements: NetElement[] = [];
  for (const p of xo.parts) {
    if (p.type === 'Wire' || p.type === 'Ground') continue;
    if (p.shorted) continue; // already fused
    if (p.open) {
      warnings.push(`${p.partId ?? p.type} is open — omitted.`);
      continue;
    }

    const [ka, kb] = terminals(p);
    const nodes: [number, number] = [nodeFor(ka), nodeFor(kb)];
    const id = p.partId ?? `${p.type}@${ka}`;

    switch (p.type) {
      case 'Capacitor': {
        const uF = param(p, 'C');
        if (uF === undefined) throw new VxpNetworkError(`${id}: capacitor without C value.`);
        elements.push({ kind: 'C', id, nodes, value: uF * 1e-6, seriesR: param(p, 'ESR') ?? 0 });
        break;
      }
      case 'Inductor': {
        const mH = param(p, 'L');
        if (mH === undefined) throw new VxpNetworkError(`${id}: inductor without L value.`);
        elements.push({ kind: 'L', id, nodes, value: mH * 1e-3, seriesR: param(p, 'DCR') ?? 0 });
        break;
      }
      case 'Resistor': {
        const ohms = param(p, 'R');
        if (ohms === undefined) throw new VxpNetworkError(`${id}: resistor without R value.`);
        elements.push({ kind: 'R', id, nodes, value: ohms });
        break;
      }
      case 'Driver':
        elements.push({
          kind: 'driver',
          id,
          model: p.model ?? id,
          nodes,
          inverted: p.inverted ?? false,
        });
        break;
      case 'Generator':
        elements.push({
          kind: 'source',
          id,
          nodes,
          volts: param(p, 'Eg') ?? 2.83,
          seriesR: param(p, 'Rg') ?? 0.001,
        });
        break;
      default:
        warnings.push(`Unsupported part type "${p.type}" (${id}) — omitted.`);
    }
  }

  return { netlist: { nodeCount: nextNode, elements }, warnings };
}
