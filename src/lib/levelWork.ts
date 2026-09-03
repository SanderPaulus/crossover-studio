/**
 * V51 — LEVEL WORK ON ONE WAY, read off a netlist or a part list.
 *
 * ONE HOME, THREE READERS — the shape `impedanceFloor.ts`, `phaseAdmission.ts`,
 * `targetLevel.ts` and `protectionDeficit.ts` already carry, and for the same
 * reason. The v2 route states, per candidate, that the LOWEST way carries no
 * level work: no resistor in its series path and no resistor hanging alone from
 * that path to ground. The synthesis step honours it by not placing one; the
 * worker REPORTS what the delivered network actually carries; the report shows
 * it for a loaded netlist; and the guards assert the same inventory on every
 * frozen netlist. A definition that lived in any one of them would be a second
 * opinion in the others.
 *
 * WHAT COUNTS AS LEVEL WORK, and what does not.
 *
 *   · A resistor ON the source→driver bus of the way — a plain pad R, the R of
 *     an L-pad, a shelf pad, a top-octave hold pad (the bypass element beside
 *     it does not change what the resistor is). `busTopology`'s own walk says
 *     which elements are on the bus and which driver they feed.
 *   · A resistor alone between a bus node of the way and ground — the shunt leg
 *     of an L-pad.
 *
 *   NOT level work: a resistor inside a shunt CHAIN (a Zobel's R, a damped
 *   trap's R). Those are impedance corrections across the driver; they do not
 *   set the way's level and A4 M-A already counts what they burn. And not the
 *   DCR of a coil: that is a property of the part the way needs anyway, which is
 *   exactly why the requirement is stated as "only coil DCR remains".
 *
 * It lives in `src/lib/` and not in `engine2/` for the reason `impedanceFloor.ts`
 * gives: the chain layer reads it too, and that layer may import nothing from
 * `engine2/` (`toggleRegression.test.ts`).
 */

import { busTopologyOfNetlist } from './netOptimizer.ts';
import type { NetElement } from './network.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpCrossover } from './parsers/vxp.ts';

export const LEVEL_WORK_VERSION = 'level-work/1.0';

export interface LevelWorkOnWay {
  /** The driver model the inventory is about. */
  model: string;
  /** Resistors on the way's series path, with their ohms. */
  seriesResistors: { id: string; ohm: number }[];
  /** Resistors hanging ALONE from a bus node of the way to ground (pad legs). */
  shuntPads: { id: string; ohm: number }[];
  /** True when the way could be walked and both lists are empty. */
  none: boolean;
  /** False when the driver is unreachable from the generator — then the lists
   *  are empty because nothing could be walked, which is not `none`. */
  reachable: boolean;
  /** Total ohms of the series resistors (the resistive half of the path). */
  seriesOhm: number;
}

/**
 * The level-work inventory of one way in a NETLIST.
 *
 * `model` is the driver model whose way is inspected — the caller's own
 * vocabulary (the chain says `woofer`, the worker says whatever `driverZ` is
 * keyed by). Open and shorted parts are already absent from a netlist built
 * by `crossoverToNetlist`, so nothing here has to know about them.
 */
export function levelWorkOnNetlist(
  netlist: { nodeCount: number; elements: readonly NetElement[] },
  model: string,
): LevelWorkOnWay {
  const bus = busTopologyOfNetlist(netlist);
  const busNodes = new Set(bus.busNodesOf(model));
  const reachable = busNodes.size > 0;
  const seriesResistors: { id: string; ohm: number }[] = [];
  const shuntPads: { id: string; ohm: number }[] = [];
  for (const e of netlist.elements) {
    if (e.kind !== 'R') continue;
    const ohm = (e as { value?: number }).value ?? 0;
    if (bus.driversOf(e.id).includes(model)) {
      seriesResistors.push({ id: e.id, ohm });
      continue;
    }
    const [a, b] = e.nodes;
    /* A pad leg: one end on THIS way's bus, the other end on ground. A resistor
     * from a bus node to an internal node is the head of a Zobel or a trap and
     * is deliberately not counted — see the module note. */
    const grounded = a === 0 || b === 0;
    const other = a === 0 ? b : a;
    if (grounded && busNodes.has(other)) shuntPads.push({ id: e.id, ohm });
  }
  const seriesOhm = seriesResistors.reduce((s, r) => s + r.ohm, 0);
  return {
    model,
    seriesResistors,
    shuntPads,
    none: reachable && seriesResistors.length === 0 && shuntPads.length === 0,
    reachable,
    seriesOhm,
  };
}

/** The same inventory off a PART LIST — the shape the chain and the tuner hold. */
export function levelWorkOnWay(parts: readonly VxpPart[], model: string): LevelWorkOnWay {
  let netlist: { nodeCount: number; elements: readonly NetElement[] };
  try {
    netlist = crossoverToNetlist({ name: 'level-work', parts: [...parts] } as VxpCrossover).netlist;
  } catch {
    return { model, seriesResistors: [], shuntPads: [], none: false, reachable: false, seriesOhm: 0 };
  }
  return levelWorkOnNetlist(netlist, model);
}

/** One line for a note or a table cell. */
export function describeLevelWork(w: LevelWorkOnWay): string {
  if (!w.reachable) return `${w.model} is not reachable from the generator — nothing to inventory`;
  if (w.none) return `no level work on ${w.model} (no series resistor, no shunt pad)`;
  const s = w.seriesResistors.map((r) => `${r.id} ${r.ohm.toFixed(2)} Ω`).join(', ');
  const p = w.shuntPads.map((r) => `${r.id} ${r.ohm.toFixed(2)} Ω`).join(', ');
  return (
    `level work on ${w.model}: ` +
    [s ? `series ${s}` : '', p ? `shunt pad ${p}` : ''].filter((x) => x).join('; ')
  );
}

/**
 * V51 — the TOTAL series inductance per way, henry, keyed by driver model:
 * the coil that does the tilt where a pad may not. Read off the same bus
 * walk as the inventory above; a way with no series coil is absent from the
 * map (not 0 — a zero would read as a measured coil of nothing).
 */
export function seriesInductanceByWay(parts: readonly VxpPart[]): Record<string, number> {
  const out: Record<string, number> = {};
  let bus: ReturnType<typeof busTopologyOfNetlist>;
  try {
    bus = busTopologyOfNetlist(crossoverToNetlist({ name: 'series-l', parts: [...parts] } as VxpCrossover).netlist);
  } catch {
    return out;
  }
  for (const p of parts) {
    if (p.type !== 'Inductor' || p.partId === undefined || p.open || p.shorted) continue;
    const henry = (p.params.find((q) => q.name === 'L')?.value ?? 0) * 1e-3;
    for (const model of bus.driversOf(p.partId)) out[model] = (out[model] ?? 0) + henry;
  }
  return out;
}
