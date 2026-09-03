/**
 * V51 / V51b — LEVEL WORK ON ONE WAY, read off a netlist or a part list, and
 * the RULE a project states about it.
 *
 * ONE HOME, THREE READERS — the shape `impedanceFloor.ts`, `phaseAdmission.ts`,
 * `targetLevel.ts` and `protectionDeficit.ts` already carry, and for the same
 * reason. The v2 route states, per candidate, what the LOWEST way may carry:
 * nothing (`'none'`, V51), or series resistance up to a stated maximum and no
 * pad (`'series-r-max'`, V51b). The synthesis step honours it by what it
 * places; the worker REPORTS what the delivered network actually carries and
 * refuses what exceeds the rule; the report shows it for a loaded netlist; and
 * the guards assert the same inventory on every frozen netlist. A definition
 * that lived in any one of them would be a second opinion in the others.
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
 *   set the way's level and A4 M-A already counts what they burn.
 *
 * THE DCR OF A SERIES COIL IS COUNTED SINCE V51b, SEPARATELY. Under `'none'`
 * it is what remains and is not level work (V51: "only coil DCR remains").
 * Under `'series-r-max'` the stated maximum is a bound on the TOTAL series
 * resistance the driver sees in its path — an air-core coil with 1 Ω of DCR
 * IS, physically, a 1 Ω series resistor, and a rule that counted only the
 * discrete part would be met by moving the ohms into the copper. So the
 * inventory carries the discrete resistors, the coils' DCR and the total, and
 * the verdict reads the total. Which of the two carries it is a BUILD choice
 * for the designer (a fatter coil or a resistor beside it), never a decision
 * of the engine — the report says so.
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

/** 1.0 → 1.1 at V51b: the inventory grew the coil-DCR half and the total. No number moved. */
export const LEVEL_WORK_VERSION = 'level-work/1.1';

/**
 * THE RULE a project states about level work on its lowest way.
 *
 *   · `'allowed'` — the historical behaviour, stated (the chain reads absent
 *     the same way; the v2 declaration never DERIVES this value, P4).
 *   · `'none'` — no series resistor, no shunt pad; coil DCR remains (V51).
 *   · `{ kind: 'series-r-max', maxOhm }` — series resistance on the way's bus
 *     is allowed up to `maxOhm`, TOTAL (discrete resistors plus every series
 *     coil's DCR); no L-pad, no shunt pad, no bypassed pad (V51b). The number
 *     travels WITH the mode because neither means anything alone: a mode
 *     without a maximum is unbounded, a maximum without the mode binds
 *     nothing. It is a stated project figure and lives in the project's
 *     manifest or form — never as a default in engine code (P6).
 */
export type LowestWayLevelWork = 'allowed' | 'none' | { kind: 'series-r-max'; maxOhm: number };

/** The stated maximum of a `'series-r-max'` rule; null for every other rule. */
export function seriesRMaxOhmOf(rule: LowestWayLevelWork | null | undefined): number | null {
  return typeof rule === 'object' && rule !== null && rule.kind === 'series-r-max' && Number.isFinite(rule.maxOhm) && rule.maxOhm >= 0
    ? rule.maxOhm
    : null;
}

/** True when the rule forbids every pad — the shunt leg and the bypassed pad — on the lowest way. */
export function forbidsPads(rule: LowestWayLevelWork | null | undefined): boolean {
  return rule === 'none' || seriesRMaxOhmOf(rule) !== null;
}

/** One word or phrase a note can print for the rule; `not stated` for null. */
export function describeLevelWorkRule(rule: LowestWayLevelWork | null | undefined): string {
  if (rule === undefined || rule === null) return 'not stated';
  if (rule === 'allowed') return 'allowed';
  if (rule === 'none') return 'none (no series resistor, no shunt pad)';
  return `series resistance up to ${rule.maxOhm.toFixed(2)} Ω in total (discrete R plus coil DCR), no pad`;
}

export interface LevelWorkOnWay {
  /** The driver model the inventory is about. */
  model: string;
  /** Resistors on the way's series path, with their ohms. */
  seriesResistors: { id: string; ohm: number }[];
  /** Resistors hanging ALONE from a bus node of the way to ground (pad legs). */
  shuntPads: { id: string; ohm: number }[];
  /** V51b — the series coils of the way, with the DCR each carries (0 for an ideal coil). */
  seriesCoils: { id: string; dcrOhm: number }[];
  /** True when the way could be walked and both resistor lists are empty. */
  none: boolean;
  /** False when the driver is unreachable from the generator — then the lists
   *  are empty because nothing could be walked, which is not `none`. */
  reachable: boolean;
  /** Total ohms of the DISCRETE series resistors. */
  seriesOhm: number;
  /** V51b — total DCR of the series coils, ohms. */
  dcrOhm: number;
  /** V51b — `seriesOhm + dcrOhm`: the series resistance the driver sees in its path. */
  totalSeriesOhm: number;
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
  const seriesCoils: { id: string; dcrOhm: number }[] = [];
  for (const e of netlist.elements) {
    if (e.kind === 'L') {
      if (bus.driversOf(e.id).includes(model)) {
        seriesCoils.push({ id: e.id, dcrOhm: (e as { seriesR?: number }).seriesR ?? 0 });
      }
      continue;
    }
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
  const dcrOhm = seriesCoils.reduce((s, c) => s + c.dcrOhm, 0);
  return {
    model,
    seriesResistors,
    shuntPads,
    seriesCoils,
    none: reachable && seriesResistors.length === 0 && shuntPads.length === 0,
    reachable,
    seriesOhm,
    dcrOhm,
    totalSeriesOhm: seriesOhm + dcrOhm,
  };
}

const EMPTY = (model: string): LevelWorkOnWay => ({
  model,
  seriesResistors: [],
  shuntPads: [],
  seriesCoils: [],
  none: false,
  reachable: false,
  seriesOhm: 0,
  dcrOhm: 0,
  totalSeriesOhm: 0,
});

/** The same inventory off a PART LIST — the shape the chain and the tuner hold. */
export function levelWorkOnWay(parts: readonly VxpPart[], model: string): LevelWorkOnWay {
  let netlist: { nodeCount: number; elements: readonly NetElement[] };
  try {
    netlist = crossoverToNetlist({ name: 'level-work', parts: [...parts] } as VxpCrossover).netlist;
  } catch {
    return EMPTY(model);
  }
  return levelWorkOnNetlist(netlist, model);
}

/**
 * V51b — DOES THE INVENTORY HONOUR THE RULE.
 *
 * One comparison with two readers (the worker's refusal and the report's
 * flag), and the ONLY place the rule is judged. `null` rule = nothing judged
 * (P4). The over-shoot under `'series-r-max'` is reported in ohms so a caller
 * can say by how much rather than only that.
 */
export interface LevelWorkVerdict {
  /** Null when no rule is stated; true/false otherwise. */
  ok: boolean | null;
  /** Ohms the total series resistance exceeds a stated maximum by (0 or more); null without one. */
  overOhm: number | null;
  why: string;
}

export function levelWorkVerdict(inv: LevelWorkOnWay, rule: LowestWayLevelWork | null | undefined): LevelWorkVerdict {
  if (rule === undefined || rule === null) return { ok: null, overOhm: null, why: 'no requirement stated (P4): the inventory is shown and nothing judges it' };
  if (!inv.reachable) return { ok: false, overOhm: null, why: `${inv.model} is not reachable from the generator — nothing could be walked` };
  if (rule === 'allowed') return { ok: true, overOhm: null, why: 'level work on the lowest way is allowed' };
  if (rule === 'none') {
    return inv.none
      ? { ok: true, overOhm: null, why: `no series resistor and no shunt pad on ${inv.model}; coil DCR ${inv.dcrOhm.toFixed(3)} Ω remains` }
      : { ok: false, overOhm: null, why: `${inv.model} carries level work: ${describeLevelWork(inv)}` };
  }
  const max = seriesRMaxOhmOf(rule) ?? 0;
  const over = Math.max(0, inv.totalSeriesOhm - max);
  if (inv.shuntPads.length > 0) {
    return {
      ok: false,
      overOhm: over,
      why: `${inv.model} carries a shunt pad (${inv.shuntPads.map((r) => `${r.id} ${r.ohm.toFixed(2)} Ω`).join(', ')}), which the rule forbids`,
    };
  }
  if (over > 0) {
    return {
      ok: false,
      overOhm: over,
      why:
        `${inv.model} carries ${inv.totalSeriesOhm.toFixed(3)} Ω of series resistance ` +
        `(${inv.seriesOhm.toFixed(3)} Ω discrete + ${inv.dcrOhm.toFixed(3)} Ω coil DCR) against a stated maximum of ${max.toFixed(2)} Ω`,
    };
  }
  return {
    ok: true,
    overOhm: 0,
    why:
      `${inv.model} carries ${inv.totalSeriesOhm.toFixed(3)} Ω of series resistance ` +
      `(${inv.seriesOhm.toFixed(3)} Ω discrete + ${inv.dcrOhm.toFixed(3)} Ω coil DCR) within the stated maximum of ${max.toFixed(2)} Ω, and no pad`,
  };
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
 * V51b — the series resistance of the way in one cell: `R3 0.80 + DCR 0.00 = 0.80 Ω`.
 * Prints the split, because the split is the build choice.
 */
export function describeSeriesResistance(w: LevelWorkOnWay): string {
  if (!w.reachable) return '—';
  const r = w.seriesResistors.length > 0 ? w.seriesResistors.map((x) => `${x.id} ${x.ohm.toFixed(2)}`).join(' + ') : 'geen R';
  return `${r} + DCR ${w.dcrOhm.toFixed(2)} = ${w.totalSeriesOhm.toFixed(2)} Ω`;
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
