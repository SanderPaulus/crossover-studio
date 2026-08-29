/**
 * V43 — THE RESISTIVE EQUIVALENT OF A LOADED NETWORK.
 *
 * M-D's `extraDb` is `loaded − bare`: everything the electrical network adds
 * on top of what the driver-in-its-box already does around the upper impedance
 * peak. V42 measured that this single number adds up TWO mechanisms that a
 * designer treats differently:
 *
 *  1. RESISTIVE LIFT — broad and damped. Series resistance attenuates the
 *     midband (where |Z| is low) more than the reflex peak (where |Z| is
 *     high), so the low end comes up relative to the reference frequency. This
 *     is level work. `H_el = Z/(Z + R)` does it with no reactance whatever,
 *     and V42 measured that above roughly 1.7 Ω of path resistance on casus 1
 *     it eats the whole stated budget before a coil exists.
 *  2. RESONANT AMPLIFICATION — narrow and underdamped. Series reactance
 *     working against the motional peak. This is the mechanism the designer's
 *     coil rule of thumb is about.
 *
 * To tell them apart the metric needs a SECOND curve: the same network with
 * its reactances taken out and nothing else changed. That is what this module
 * builds — a netlist transform, not a model:
 *
 *     L  →  its own series resistance (DCR). An ideal coil's DCR is zero, so
 *           an ideal coil becomes a SHORT and the two nodes it joined are
 *           merged. Nothing is invented: a coil's resistive part is the number
 *           the part already carries.
 *     C  →  OPEN, and the element leaves the network. A capacitor's resistive
 *           limit is an open branch; its ESR sits in series with a reactance
 *           that has become infinite, so it conducts nothing and its value
 *           cannot matter. (Replacing C by its ESR instead would turn every
 *           series capacitor into a near-short — the opposite of the limit.)
 *     R, driver, source  →  untouched.
 *
 * THE DRIVER KEEPS ITS MEASURED IMPEDANCE, reactance and all, and that is not
 * an oversight. The motional peak is the thing the two curves are being
 * compared ACROSS: take it out and there is no resonance left for reactance to
 * work against, and both curves become the same flat statement. What the
 * transform removes is the FILTER's reactance — the part a designer chooses.
 *
 * WHY A SHORT AND NOT A SMALL RESISTOR. Nodal analysis cannot stamp an ideal
 * short, and a "small enough" resistor is a magic number that decides the
 * answer (P6). The nodes are MERGED instead, by union-find, with ground kept
 * as the representative of its own class so it stays node 0.
 *
 * WHAT CAN COME OUT DEGENERATE, and it is reported rather than papered over. A
 * shunt coil with no DCR straight across a driver becomes a short across that
 * driver, and its resistive equivalent then radiates nothing. That is a true
 * statement about the limit — at DC a coil really does short what it parallels
 * — and it means the decomposition is UNAVAILABLE for that driver, not that it
 * is zero. The caller is told which drivers those are.
 */

import type { Netlist, NetElement, PassiveElement } from '../../network.ts';

/**
 * Estimator version for the resistive-equivalent transform.
 *
 * `1.0` is V43's first form: DCR for coils, open for capacitors, node merge
 * for a zero-resistance coil. A change to WHICH element becomes what is a
 * behaviour change and bumps this, because every decomposition downstream is a
 * difference against the curve this produces.
 */
export const RESISTIVE_EQUIVALENT_VERSION = 'resistive-equivalent/1.0';

export interface ResistiveEquivalent {
  netlist: Netlist;
  /** Coil ids that became a short (no DCR to stand in for them). */
  shortedIds: string[];
  /** Coil ids that became a resistor of their own DCR. */
  dcrIds: string[];
  /** Capacitor ids that left the network. */
  openedIds: string[];
  /**
   * Driver element ids whose two terminals were merged by a short — their
   * branch carries no voltage in the resistive limit, so no decomposition can
   * be read from them.
   */
  shortedDriverIds: string[];
  notes: string[];
}

/** Union-find over node numbers, with ground (0) always winning a merge. */
class Merge {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(a: number): number {
    let r = a;
    while (this.parent[r] !== r) r = this.parent[r];
    while (this.parent[a] !== r) {
      const next = this.parent[a];
      this.parent[a] = r;
      a = next;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // The SMALLER index becomes the representative, which keeps ground (0) as
    // the root of anything merged into it — a node shorted to ground has to
    // stay ground, or the solve loses its reference.
    if (ra < rb) this.parent[rb] = ra;
    else this.parent[ra] = rb;
  }
}

/**
 * The same topology and the same values, with every reactance replaced by its
 * own series resistance.
 */
export function resistiveEquivalent(netlist: Netlist): ResistiveEquivalent {
  const shortedIds: string[] = [];
  const dcrIds: string[] = [];
  const openedIds: string[] = [];
  const notes: string[] = [];

  const merge = new Merge(netlist.nodeCount);
  for (const e of netlist.elements) {
    if (e.kind === 'L' && !((e.seriesR ?? 0) > 0)) {
      merge.union(e.nodes[0], e.nodes[1]);
      shortedIds.push(e.id);
    }
  }

  // Compact the surviving classes onto 0..m-1, ground first.
  const remap = new Map<number, number>();
  for (let i = 0; i < netlist.nodeCount; i++) {
    const root = merge.find(i);
    if (!remap.has(root)) remap.set(root, remap.size);
  }
  const node = (i: number): number => remap.get(merge.find(i))!;

  const elements: NetElement[] = [];
  const shortedDriverIds: string[] = [];
  for (const e of netlist.elements) {
    const nodes: [number, number] = [node(e.nodes[0]), node(e.nodes[1])];
    switch (e.kind) {
      case 'R':
        elements.push({ ...e, nodes });
        break;
      case 'L': {
        const dcr = e.seriesR ?? 0;
        if (dcr > 0) {
          const asR: PassiveElement = { kind: 'R', id: e.id, nodes, value: dcr };
          elements.push(asR);
          dcrIds.push(e.id);
        }
        // A shorted coil is already gone: its nodes are the same node.
        break;
      }
      case 'C':
        openedIds.push(e.id);
        break;
      case 'driver':
        if (nodes[0] === nodes[1]) shortedDriverIds.push(e.id);
        elements.push({ ...e, nodes });
        break;
      case 'source':
        elements.push({ ...e, nodes });
        break;
    }
  }

  if (shortedIds.length > 0) {
    notes.push(
      `${shortedIds.length} coil(s) carry no DCR, so their resistive equivalent is a short and ` +
        'the nodes they joined were merged.',
    );
  }
  if (openedIds.length > 0) {
    notes.push(
      `${openedIds.length} capacitor(s) became open branches: a capacitor's resistive limit ` +
        'carries no current, so its ESR cannot reach the result.',
    );
  }
  for (const id of shortedDriverIds) {
    notes.push(
      `Driver element ${id} has both terminals on one node in the resistive equivalent — a coil ` +
        'with no DCR sits straight across it — so no lift/amplification split can be read there.',
    );
  }

  return {
    netlist: { nodeCount: remap.size, elements },
    shortedIds,
    dcrIds,
    openedIds,
    shortedDriverIds,
    notes,
  };
}
