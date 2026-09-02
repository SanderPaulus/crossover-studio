/**
 * UI-2 — CAN THIS NETWORK BE SIMULATED, AND IF NOT, WHY NOT.
 *
 * One function, in the V32 shape (one implementation, several readers): the
 * simulation memo in `App.tsx` asks it before it solves, the Network tab
 * prints its answer under the editor, and the status badges read it to decide
 * whether there is a network to score at all. Until UI-2 those three places
 * each had their own idea — the sim silently fell back to the raw drivers when
 * the solver threw, the editor ran `validateNetlist` and printed what it found,
 * and the badges scored whatever the sim returned.
 *
 * ── WHAT WENT WRONG, because the shape of this module is the shape of the bug
 *
 * Sander removed the series resistor in front of the woofer of the loaded
 * shortlist design and then drew a wire to bridge the gap. Measured on casus 1
 * (`networkReadiness.test.ts` holds it):
 *
 *   · Deleting the resistor leaves its two terminals unjoined ("its wires
 *     stay"). The woofer branch beyond the gap still reaches GROUND through
 *     its own shunt and its own return, so `validateNetlist`'s reachability
 *     walk — which travels through node 0 like any other node — counted it as
 *     connected. No warning. The solver's leak conductance kept the matrix
 *     regular, the woofer's transfer came out as exactly zero (−∞ dB), the
 *     sum re-solved without it, and four badges scored a two-way as though it
 *     were the design.
 *   · A wire drawn one grid row beside the gap touches no terminal. The
 *     netlist it produces is byte-identical to the one before it, so the
 *     simulation "did not react" — correctly, and silently. Wires vanish
 *     into the union-find before validation ever sees them, so nothing could
 *     say "this wire connects nothing".
 *
 * Neither state is a solver error, which is why the solver's own `throw` was
 * never going to catch them. Both are things the SCHEMATIC can say about
 * itself before anything is solved, and that is what this module does.
 *
 * ── THE TWO SEVERITIES, and the line between them is the physics
 *
 *   REFUSED — the network has no simulable meaning: no generator, a generator
 *   whose terminals are fused or whose Rg is not positive, no driver at all, a
 *   driver with no measured impedance, a part with a non-positive value, a
 *   part with fewer than two terminals. The sim does not run on it; the charts
 *   keep the previous state and SAY so (F0: no verdict is not green, and not
 *   a frozen chart pretending to be current).
 *
 *   SIMULABLE WITH DEFECTS — the network solves, and the solution is exactly
 *   what the drawing says, but the drawing says something the designer
 *   probably did not mean: a driver with no path to the generator (it plays
 *   nothing), a part hanging off nothing, a wire that touches no terminal, a
 *   part whose two terminals sit on one net, more than one generator, nothing
 *   on ground. The sim RUNS — a disconnected woofer is a real physical state
 *   and the honest curve is the one without it — and the defect is printed
 *   next to it, by part name. Sander's removed resistor lands here: the curves
 *   recompute, and the status says the woofer is silent and why.
 *
 * "Path to the generator" is walked WITHOUT passing through ground. That is
 * the one-line difference from `validateNetlist`, and it is the whole finding.
 *
 * Nothing here judges the design. It only says whether the thing on screen is
 * the thing that was drawn.
 */

import type { VxpPart } from './parsers/vxp.ts';
import type { Netlist, NetElement, SourceElement } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';

export const NETWORK_READINESS_VERSION = 'networkReadiness@1';

/** Why a network cannot be simulated at all. */
export type RefusalCause =
  | 'empty'
  | 'no-generator'
  | 'shorted-generator'
  | 'invalid-generator'
  | 'no-drivers'
  | 'missing-impedance'
  | 'invalid-value'
  | 'malformed';

/** Something the drawing says that the designer probably did not mean. */
export type DefectCode =
  | 'undriven-driver'
  | 'undriven-part'
  | 'dangling-wire'
  | 'dangling-ground'
  | 'shorted-part'
  | 'open-part'
  | 'extra-generator'
  | 'no-ground';

export interface NetworkDefect {
  code: DefectCode;
  /** The part this is about — id, model, or a coordinate for an unnamed wire. */
  part: string;
  text: string;
}

export type NetworkReadiness =
  | {
      kind: 'simulable';
      netlist: Netlist;
      defects: NetworkDefect[];
      /** One line for the screen; empty string when there is nothing to say. */
      describe: string;
    }
  | {
      kind: 'refused';
      cause: RefusalCause;
      /** One line for the screen — never blank. */
      describe: string;
      /** Whatever could still be said about the drawing. */
      defects: NetworkDefect[];
    };

const ptKey = (w: { x: number; y: number }): string => `${w.x},${w.y}`;

/**
 * Assess the drawing. `availableModels` are the driver models that carry a
 * measured impedance — a driver without one cannot be solved (P4: a missing
 * measurement is a refusal, not a nominal resistor).
 */
export function assessNetwork(
  parts: readonly VxpPart[],
  availableModels: readonly string[],
): NetworkReadiness {
  const defects: NetworkDefect[] = [];

  if (parts.length === 0) {
    return {
      kind: 'refused',
      cause: 'empty',
      describe: 'Nothing to simulate: the network holds no components.',
      defects,
    };
  }

  // ── Drawing-level defects: things the netlist cannot see because wires
  // dissolve into nets before it exists.
  const pointOwners = new Map<string, number[]>();
  parts.forEach((p, i) => {
    for (const w of p.wires) {
      const k = ptKey(w);
      pointOwners.set(k, [...(pointOwners.get(k) ?? []), i]);
    }
  });
  parts.forEach((p, i) => {
    if (p.type !== 'Wire' && p.type !== 'Ground') return;
    const touches = p.wires.some((w) => (pointOwners.get(ptKey(w)) ?? []).some((j) => j !== i));
    if (touches) return;
    if (p.type === 'Ground') {
      const at = p.wires.length > 0 ? ptKey(p.wires[0]) : '(no point)';
      defects.push({
        code: 'dangling-ground',
        part: `ground ${at}`,
        text: `Ground symbol at ${at} touches no terminal — it grounds nothing.`,
      });
      return;
    }
    {
      const ends = p.wires.length > 0 ? `${ptKey(p.wires[0])} → ${ptKey(p.wires[p.wires.length - 1])}` : '(no points)';
      defects.push({
        code: 'dangling-wire',
        part: `wire ${ends}`,
        text: `Wire ${ends} touches no terminal of any part — it connects nothing, and the network is exactly what it was before it was drawn. Wires join only where their end points coincide with a part's terminal.`,
      });
    }
  });

  // ── The netlist. A throw here is a malformed drawing (a two-terminal part
  // with one point, a component without a value).
  let netlist: Netlist;
  try {
    const built = crossoverToNetlist({ name: 'assess', parts: [...parts] });
    netlist = built.netlist;
    for (const w of built.warnings) {
      defects.push({ code: 'open-part', part: w.split(' ')[0], text: w });
    }
  } catch (e) {
    return {
      kind: 'refused',
      cause: 'malformed',
      describe: `Not simulable: ${e instanceof Error ? e.message : String(e)}`,
      defects,
    };
  }

  const sources = netlist.elements.filter((e): e is SourceElement => e.kind === 'source');
  const drivers = netlist.elements.filter((e) => e.kind === 'driver');

  if (sources.length === 0) {
    return {
      kind: 'refused',
      cause: 'no-generator',
      describe: 'Not simulable: the network has no generator. Place one (+ Gen) and wire it to the filter input.',
      defects,
    };
  }
  for (const s of sources) {
    if (s.nodes[0] === s.nodes[1]) {
      return {
        kind: 'refused',
        cause: 'shorted-generator',
        describe: `Not simulable: generator ${s.id} has both terminals on one net — it is shorted, and every driver would see zero volts.`,
        defects,
      };
    }
    if (!(s.seriesR > 0) || !Number.isFinite(s.seriesR)) {
      return {
        kind: 'refused',
        cause: 'invalid-generator',
        describe: `Not simulable: generator ${s.id} needs a positive output impedance (Rg); it has ${s.seriesR}.`,
        defects,
      };
    }
  }
  if (sources.length > 1) {
    defects.push({
      code: 'extra-generator',
      part: sources.map((s) => s.id).join(', '),
      text: `${sources.length} generators (${sources.map((s) => s.id).join(', ')}) — the transfers are taken against the first; usually you want one.`,
    });
  }

  if (drivers.length === 0) {
    return {
      kind: 'refused',
      cause: 'no-drivers',
      describe: 'Not simulable: the network has no driver. Place one (+ Driver) — there is nothing to listen to.',
      defects,
    };
  }
  for (const d of drivers) {
    if (d.kind === 'driver' && !availableModels.includes(d.model)) {
      return {
        kind: 'refused',
        cause: 'missing-impedance',
        describe:
          `Not simulable: driver ${d.id} names model "${d.model}" and no measured impedance is loaded for it` +
          (availableModels.length > 0 ? ` (loaded: ${availableModels.join(', ')}).` : ' — load a .ZMA per driver.'),
        defects,
      };
    }
  }
  for (const e of netlist.elements) {
    if (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') {
      if (!(e.value > 0) || !Number.isFinite(e.value)) {
        return {
          kind: 'refused',
          cause: 'invalid-value',
          describe: `Not simulable: ${e.id} has value ${e.value} — a component value must be a positive number.`,
          defects,
        };
      }
      if (e.seriesR !== undefined && (e.seriesR < 0 || !Number.isFinite(e.seriesR))) {
        return {
          kind: 'refused',
          cause: 'invalid-value',
          describe: `Not simulable: ${e.id} has a series resistance of ${e.seriesR} — it must be zero or positive.`,
          defects,
        };
      }
    }
  }

  // ── Connectivity WITHOUT ground. The walk starts at every generator
  // terminal and never enters node 0: a branch that reaches the rest of the
  // network only through its return is not driven by anything.
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  };
  for (const e of netlist.elements) {
    if (e.kind === 'source') continue;
    const [a, b] = e.nodes;
    if (a === b || a === 0 || b === 0) continue;
    link(a, b);
  }
  const driven = new Set<number>();
  const stack = sources.flatMap((s) => s.nodes).filter((n) => n !== 0);
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (driven.has(n)) continue;
    driven.add(n);
    for (const m of adj.get(n) ?? []) stack.push(m);
  }
  const isDriven = (e: NetElement) => e.nodes.some((n) => n !== 0 && driven.has(n));

  for (const e of netlist.elements) {
    if (e.kind === 'source') continue;
    if (e.nodes[0] === e.nodes[1]) {
      defects.push({
        code: 'shorted-part',
        part: e.id,
        text: `${e.id}: both terminals on one net — it does nothing in this network.`,
      });
      continue;
    }
    if (isDriven(e)) continue;
    if (e.kind === 'driver') {
      defects.push({
        code: 'undriven-driver',
        part: e.id,
        text: `${e.id} (${e.model}) has no path to the generator — it is SILENT in this simulation. Everything after the gap plays nothing; the curves are the remaining drivers alone.`,
      });
    } else {
      defects.push({
        code: 'undriven-part',
        part: e.id,
        text: `${e.id} has no path to the generator — it carries no signal.`,
      });
    }
  }

  const touchesGround = netlist.elements.some((e) => e.nodes[0] === 0 || e.nodes[1] === 0);
  if (!touchesGround) {
    defects.push({
      code: 'no-ground',
      part: 'network',
      text: 'Nothing connects to ground — the network floats; the solution is taken between its own nodes.',
    });
  }

  return {
    kind: 'simulable',
    netlist,
    defects,
    describe: describeDefects(defects),
  };
}

function describeDefects(defects: readonly NetworkDefect[]): string {
  if (defects.length === 0) return '';
  const silent = defects.filter((d) => d.code === 'undriven-driver');
  const dangling = defects.filter((d) => d.code === 'dangling-wire');
  const head: string[] = [];
  if (silent.length > 0) head.push(`${silent.map((d) => d.part).join(', ')} silent — no path to the generator`);
  if (dangling.length > 0) head.push(`${dangling.length} wire${dangling.length === 1 ? '' : 's'} connect${dangling.length === 1 ? 's' : ''} nothing`);
  const rest = defects.length - silent.length - dangling.length;
  if (rest > 0) head.push(`${rest} more ${rest === 1 ? 'issue' : 'issues'}`);
  return `Simulated as drawn: ${head.join(' · ')}.`;
}

/** The part names a defect list is about, for a caller that highlights them. */
export function defectParts(readiness: NetworkReadiness): string[] {
  return [...new Set(readiness.defects.map((d) => d.part))];
}
