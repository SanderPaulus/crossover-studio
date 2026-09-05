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

/**
 * 1.0 → 1.1 at V51b: the inventory grew the coil-DCR half and the total. No
 * number moved. 1.1 → 1.2 at A5e.3b (c3): the inventory grew
 * `resonancelessShunts` — shunt chains from the way's bus to ground that
 * carry an inductor and NO capacitor — and the verdict fails on one under any
 * pad-forbidding rule. A shunt without a resonance traps nothing: it is a
 * frequency-shaped LOAD, not a filter element, and the one way such a chain
 * arises in this synthesis vocabulary is as the REST of a damped trap whose
 * capacitor the parts audit removed. Measured on the A5e.3-veld corpus:
 * KAND_V2_2 carries L5+R7 (5.39 mH + 1.10 Ω from the woofer bus to ground,
 * the orphan of a trap whose C the audit shorted), which drags the system
 * minimum to 2.55 Ω at 10.07 Hz — under the barrier's extent, judged by the
 * gate, and counted by NO rule until now: the R sat in a shunt chain, which
 * the pad definition deliberately exempts.
 *
 * SCOPE CAVEAT, said here because the inventory is per way and generic: on a
 * HIGH-passed way the ladder's own shunt L is exactly this shape and
 * perfectly legitimate. The inventory lists it as what it is; the VERDICT
 * only ever judges the way a rule is stated for, and the stated rules
 * (`lowestWayLevelWork`) are about the LOWEST way, whose legitimate shunt
 * chains all carry a C (ladder shunt C, Zobel, trap).
 */
export const LEVEL_WORK_VERSION = 'level-work/1.2';

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
  /**
   * A5e.3b (c3) — shunt chains from a bus node of this way to ground that
   * contain an inductor and NO capacitor: no resonance, so they trap nothing —
   * a frequency-shaped load, and on a low-passed way the orphan of a trap the
   * parts audit gutted. See the version note for the scope caveat on
   * high-passed ways.
   */
  resonancelessShunts: { ids: string[]; label: string }[];
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

  /* ---- A5e.3b (c3): shunt chains without a resonance --------------------
   *
   * Collect, per bus node of this way, the connected component of NON-series
   * passive elements reachable through internal nodes (neither ground nor a
   * bus node). A component that reaches ground, contains an inductor and NO
   * capacitor has no resonance: it is a load, not a filter element. The lone
   * pad-leg R is already counted above and a lone R component stays what it
   * was (a pad leg), so this class is strictly "an L got here without its C". */
  const resonancelessShunts: { ids: string[]; label: string }[] = [];
  const passive = netlist.elements.filter(
    (e): e is NetElement & { kind: 'R' | 'L' | 'C'; nodes: [number, number] } =>
      (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') && bus.driversOf(e.id).length === 0,
  );
  const byNode = new Map<number, typeof passive>();
  for (const e of passive) {
    for (const n of e.nodes) {
      const l = byNode.get(n) ?? [];
      l.push(e);
      byNode.set(n, l);
    }
  }
  const allBusNodes = new Set<number>();
  for (const d of netlist.elements) {
    if (d.kind !== 'driver') continue;
    for (const n of bus.busNodesOf((d as { model: string }).model)) allBusNodes.add(n);
  }
  const seen = new Set<string>();
  for (const start of [...busNodes].sort((a, b) => a - b)) {
    for (const first of byNode.get(start) ?? []) {
      if (seen.has(first.id)) continue;
      const chain: typeof passive = [];
      const queue = [first];
      let grounded = false;
      while (queue.length > 0) {
        const e = queue.shift()!;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        chain.push(e);
        for (const n of e.nodes) {
          if (n === 0) {
            grounded = true;
            continue;
          }
          // The walk stays inside the chain: it never crosses a bus node of
          // any way — that would be walking into a branch, not down a shunt.
          if (allBusNodes.has(n)) continue;
          for (const nb of byNode.get(n) ?? []) if (!seen.has(nb.id)) queue.push(nb);
        }
      }
      const hasL = chain.some((e) => e.kind === 'L');
      const hasC = chain.some((e) => e.kind === 'C');
      if (grounded && hasL && !hasC) {
        resonancelessShunts.push({
          ids: chain.map((e) => e.id),
          label: chain
            .map((e) =>
              e.kind === 'L'
                ? `${e.id} ${(((e as { value?: number }).value ?? 0) * 1e3).toFixed(2)} mH`
                : `${e.id} ${((e as { value?: number }).value ?? 0).toFixed(2)} Ω`,
            )
            .join(' + '),
        });
      }
    }
  }

  const seriesOhm = seriesResistors.reduce((s, r) => s + r.ohm, 0);
  const dcrOhm = seriesCoils.reduce((s, c) => s + c.dcrOhm, 0);
  return {
    model,
    seriesResistors,
    shuntPads,
    resonancelessShunts,
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
  resonancelessShunts: [],
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
  /* A5e.3b (c3) — a shunt chain without a resonance fails EVERY pad-forbidding
   * rule: it traps nothing, so what it does is load and shape the way's level
   * and impedance — pad work by another topology, and in this synthesis
   * vocabulary the orphan of a trap the parts audit gutted. */
  if (forbidsPads(rule) && inv.resonancelessShunts.length > 0) {
    return {
      ok: false,
      overOhm: null,
      why:
        `${inv.model} carries a shunt chain without a resonance (${inv.resonancelessShunts.map((c) => c.label).join('; ')}): ` +
        'no capacitor, so it traps nothing — a load, not a filter element, and the rule forbids every pad (A5e.3b)',
    };
  }
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
  const loads = w.resonancelessShunts.map((c) => c.label).join('; ');
  if (w.none) {
    return (
      `no level work on ${w.model} (no series resistor, no shunt pad)` +
      (loads ? `; but a resonanceless shunt chain stands (${loads}) — a load, not a filter element (A5e.3b)` : '')
    );
  }
  const s = w.seriesResistors.map((r) => `${r.id} ${r.ohm.toFixed(2)} Ω`).join(', ');
  const p = w.shuntPads.map((r) => `${r.id} ${r.ohm.toFixed(2)} Ω`).join(', ');
  return (
    `level work on ${w.model}: ` +
    [s ? `series ${s}` : '', p ? `shunt pad ${p}` : '', loads ? `resonanceless shunt ${loads}` : '']
      .filter((x) => x)
      .join('; ')
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
