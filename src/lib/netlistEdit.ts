import type { NetElement, Netlist, PassiveElement } from './network.ts';
import type { SynthesizedComponent } from './synthesis.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { synthesizedToSchematic } from './synthSchematic.ts';

/**
 * Editable-netlist layer for the node/network editor (step 6, phase 1).
 *
 * The MNA `Netlist` itself is the single source of truth: it is plain JSON
 * (persistable as-is), N-way by construction (drivers are a list keyed by
 * measured model), and components already carry their parasitics (L + DCR,
 * C + ESR via `seriesR`). This module adds what editing needs on top:
 * validation with human messages, node renumbering, starter templates, and
 * conversions from the two existing network producers (vxp import and
 * passive synthesis).
 */

export interface NetlistIssues {
  /** Problems that make the network unsolvable or physically meaningless. */
  errors: string[];
  /** Suspicious but solvable — the solver's leak conductance keeps it alive. */
  warnings: string[];
}

export function validateNetlist(net: Netlist, availableModels: readonly string[]): NetlistIssues {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sources = net.elements.filter((e) => e.kind === 'source');
  const drivers = net.elements.filter((e) => e.kind === 'driver');
  if (sources.length === 0) errors.push('No generator — add a source element.');
  if (sources.length > 1) warnings.push(`${sources.length} generators — usually you want one.`);
  if (drivers.length === 0) warnings.push('No drivers — nothing to listen to.');

  const seen = new Set<string>();
  for (const e of net.elements) {
    if (seen.has(e.id)) errors.push(`Duplicate element id "${e.id}".`);
    seen.add(e.id);

    const [a, b] = e.nodes;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      errors.push(`${e.id}: nodes must be non-negative integers.`);
      continue;
    }
    if (a === b) warnings.push(`${e.id}: both terminals on node ${a} — element does nothing.`);

    if (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') {
      if (!(e.value > 0) || !Number.isFinite(e.value)) {
        errors.push(`${e.id}: value must be a positive number.`);
      }
      if (e.seriesR !== undefined && (e.seriesR < 0 || !Number.isFinite(e.seriesR))) {
        errors.push(`${e.id}: series resistance must be ≥ 0.`);
      }
    }
    if (e.kind === 'source' && !(e.seriesR > 0)) {
      errors.push(`${e.id}: generator needs a positive output impedance (Rg).`);
    }
    if (e.kind === 'driver' && !availableModels.includes(e.model)) {
      errors.push(
        `${e.id}: no measured impedance for driver model "${e.model}"` +
          (availableModels.length > 0 ? ` (available: ${availableModels.join(', ')}).` : ' — load ZMA files.'),
      );
    }
  }

  // Connectivity: every element should be reachable from a source terminal.
  if (sources.length > 0) {
    const adj = new Map<number, number[]>();
    for (const e of net.elements) {
      const [a, b] = e.nodes;
      if (a === b) continue;
      adj.set(a, [...(adj.get(a) ?? []), b]);
      adj.set(b, [...(adj.get(b) ?? []), a]);
    }
    const reach = new Set<number>();
    const stack = sources.flatMap((s) => s.nodes);
    while (stack.length > 0) {
      const n = stack.pop()!;
      if (reach.has(n)) continue;
      reach.add(n);
      for (const m of adj.get(n) ?? []) stack.push(m);
    }
    for (const e of net.elements) {
      if (!reach.has(e.nodes[0]) || !reach.has(e.nodes[1])) {
        warnings.push(`${e.id}: not connected to the generator — floating subcircuit.`);
      }
    }
    if (!reach.has(0)) warnings.push('Nothing connects to ground (node 0).');
  }

  return { errors, warnings };
}

/**
 * Rebuild a well-formed Netlist from an edited element list: node numbers are
 * compacted to 0..n−1 (ground stays 0, others keep their relative order) and
 * nodeCount is recomputed. Editing can leave gaps (deleted elements) — the
 * solver wants dense numbering.
 */
export function normalizeNetlist(elements: readonly NetElement[]): Netlist {
  const used = [...new Set(elements.flatMap((e) => e.nodes))].sort((x, y) => x - y);
  const map = new Map<number, number>();
  map.set(0, 0);
  let next = 1;
  for (const n of used) if (n !== 0) map.set(n, next++);
  const remapped = elements.map((e) => ({
    ...e,
    nodes: [map.get(e.nodes[0])!, map.get(e.nodes[1])!] as [number, number],
  }));
  return { nodeCount: next, elements: remapped };
}

/** Fresh element id unique within the list: C1, C2, … / L1 / R1 / D1 / G1. */
export function nextElementId(elements: readonly NetElement[], kind: NetElement['kind']): string {
  const prefix = kind === 'driver' ? 'D' : kind === 'source' ? 'G' : kind;
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!elements.some((e) => e.id === id)) return id;
  }
}

/**
 * Starter network: generator with every measured driver straight across it
 * (no filtering). Solvable immediately; filtering grows from here.
 */
export function templateNetwork(models: readonly string[]): Netlist {
  const elements: NetElement[] = [
    { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
    ...models.map(
      (model, i): NetElement => ({
        kind: 'driver',
        id: `D${i + 1}`,
        model,
        nodes: [1, 0],
        inverted: false,
      }),
    ),
  ];
  return { nodeCount: 2, elements };
}

/**
 * A synthesised branch (one driver) as a netlist — reuses the schematic
 * builder (roles → ladder layout) and the vxp topology reconstruction, so the
 * editable network is bit-identical to what the schematic shows.
 */
export function netlistFromSynthesis(
  components: readonly SynthesizedComponent[],
  driverModel: string,
): Netlist {
  const { netlist } = crossoverToNetlist(synthesizedToSchematic(components, driverModel));
  // The schematic rounds display values to 3 significant digits; restore the
  // exact synthesised values (matched by id) so the editor starts from truth.
  const exact = new Map(components.map((c) => [c.id, c.value]));
  return {
    ...netlist,
    elements: netlist.elements.map((e) =>
      (e.kind === 'C' || e.kind === 'L' || e.kind === 'R') && exact.has(e.id)
        ? { ...e, value: exact.get(e.id)! }
        : e,
    ),
  };
}

/**
 * Merge per-driver branch netlists into one network with a single generator.
 * Branch synthesis fits each driver against its own source; physically they
 * hang on the same amplifier. Every branch's source '+' node becomes the
 * shared input node, ground stays shared, all other nodes are renumbered to
 * stay disjoint. Element ids get a branch prefix on collision.
 */
export function mergeBranches(branches: readonly Netlist[]): Netlist {
  if (branches.length === 0) throw new Error('No branches to merge.');
  const elements: NetElement[] = [];
  const usedIds = new Set<string>();
  let next = 2; // 0 = ground, 1 = shared generator '+'

  branches.forEach((branch, bi) => {
    const src = branch.elements.find((e) => e.kind === 'source');
    if (!src) throw new Error(`Branch ${bi + 1} has no generator.`);
    // Source terminals: the non-ground one is the branch input.
    const plus = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];

    const map = new Map<number, number>([[0, 0], [plus, 1]]);
    const remap = (n: number): number => {
      let m = map.get(n);
      if (m === undefined) {
        m = next++;
        map.set(n, m);
      }
      return m;
    };

    for (const e of branch.elements) {
      if (e.kind === 'source' && bi > 0) continue; // one shared generator
      let id = e.id;
      if (usedIds.has(id)) id = `${String.fromCharCode(65 + bi)}·${id}`;
      usedIds.add(id);
      elements.push({
        ...e,
        id,
        nodes: [remap(e.nodes[0]), remap(e.nodes[1])] as [number, number],
      });
    }
  });

  return { nodeCount: next, elements };
}

/**
 * Default DCR estimate for a 1.4 mm air-core coil: ≈ 0.29·(L/mH)^0.65 Ω
 * (fit over the Jantzen air-core range — see CLAUDE.md). Used as the
 * suggested seriesR when an inductor gets a value and no explicit DCR.
 */
export function estimateCoilDcr(valueH: number): number {
  if (!(valueH > 0)) return 0;
  return 0.29 * (valueH * 1e3) ** 0.65;
}

/** Display formatting: engineering units per kind (µF / mH / Ω). */
export function formatValue(e: PassiveElement): string {
  switch (e.kind) {
    case 'C':
      return `${trim3(e.value * 1e6)} µF`;
    case 'L':
      return `${trim3(e.value * 1e3)} mH`;
    case 'R':
      return `${trim3(e.value)} Ω`;
  }
}

const trim3 = (v: number): string => String(Number(v.toPrecision(3)));
