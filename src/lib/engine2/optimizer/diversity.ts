/**
 * A5e.1 — WHAT MAKES TWO DESIGNS DIFFERENT.
 *
 * The shortlist promises "ten materially different designs, not ten clones",
 * and that promise is only as good as its definition of different. Two
 * definitions live here, both canonical, both testable on their own — which is
 * the point of putting them in their own module rather than inline in the
 * selection loop.
 *
 * 1. THE TOPOLOGY CLASS — order per flank, with polarity.
 *
 *    Two designs are in different classes when they are different KINDS of
 *    filter, and that is settled by the acoustic order of each flank plus the
 *    polarity of each way. Polarity belongs in the key because an inverted
 *    midrange is not a variation on a non-inverted one: it lobes differently
 *    in the vertical plane, and a shortlist that treated the two as
 *    interchangeable would offer a designer a choice they cannot hear as a
 *    choice they can.
 *
 *    Order comes FIRST in the spreading (see `selectDiverse`): a shortlist of
 *    ten second-order designs that differ only in polarity has not spread over
 *    anything a designer would call a topology.
 *
 * 2. THE NORMALISED COMPONENT DISTANCE — within a class.
 *
 *    Inside one class the designs differ only in values, and raw values are
 *    incomparable: a 0.1 mH difference is enormous on a tweeter's series coil
 *    and invisible on a woofer's. So every value is taken in LOG SPACE and
 *    normalised by the spread that component shows ACROSS THE CANDIDATE SET.
 *    The result is dimensionless and asks the only question that matters: is
 *    this part doing something unusual compared with what the other candidates
 *    do with it.
 */

import type { VxpPart } from '../../parsers/vxp.ts';
import { F_PER_UF, H_PER_MH } from '../constants.ts';

/* ================================================================== *
 * 1. The topology class
 * ================================================================== */

/** One flank of one way, as the design step settled it. */
export interface FlankDescriptor {
  /** The way this flank belongs to — a driver id or role, never an index. */
  way: string;
  side: 'hp' | 'lp';
  /** Filter family as the design step named it (LR/BW/BS). */
  kind: string;
  /** Acoustic order, 1..4. */
  order: number;
}

export interface TopologyDescriptor {
  /** Every ENABLED flank. A disabled one is not a flank, it is its absence. */
  flanks: readonly FlankDescriptor[];
  /** Ways whose polarity is inverted. */
  inverted: readonly string[];
}

/**
 * The canonical class key.
 *
 * Sorted on both axes so that two descriptions of the same design produce one
 * key however they were assembled — the same discipline as the fingerprint's
 * stable JSON, and for the same reason: a key that depends on insertion order
 * silently splits one class in two.
 *
 * Deliberately human-readable. A class key that a designer can read in a
 * tooltip is a class key someone can argue with, and `structureLabel` next
 * door is prose that must never be parsed for this purpose.
 */
export function topologyClassKey(d: TopologyDescriptor): string {
  const flanks = [...d.flanks]
    .sort((a, b) => (a.way === b.way ? a.side.localeCompare(b.side) : a.way.localeCompare(b.way)))
    .map((f) => `${f.way}.${f.side}=${f.kind}${f.order}`);
  const inv = [...d.inverted].sort();
  return `${flanks.join(' ')}${inv.length ? ` inv[${inv.join(',')}]` : ''}`;
}

/**
 * The ORDER SIGNATURE — the coarser key the spreading prioritises.
 *
 * Same flanks, orders only: no family, no polarity. Two designs share an order
 * signature when they are the same shape of filter, and that is the axis a
 * designer means by "give me something different".
 */
export function orderSignature(d: TopologyDescriptor): string {
  return [...d.flanks]
    .sort((a, b) => (a.way === b.way ? a.side.localeCompare(b.side) : a.way.localeCompare(b.way)))
    .map((f) => `${f.way}.${f.side}=${f.order}`)
    .join(' ');
}

/* ================================================================== *
 * 2. The normalised component distance
 * ================================================================== */

/**
 * What a component present in one candidate and absent in the other
 * contributes, in normalised units.
 *
 * Two standard deviations: a structural difference counts as a LARGE value
 * difference, not as an infinite one. That is a deliberate ceiling rather than
 * a limitation — the distance is an RMS over the union of both candidates'
 * parts, so a single extra trap on a twenty-part network is one term among
 * twenty and SHOULD NOT swamp the rest. A design that adds a trap and a design
 * that moves a capacitor by a decade are both meaningfully different, and this
 * metric says so instead of ranking one kind of difference above the other by
 * construction.
 *
 * Dimensionless, and the same for every project.
 */
export const MISSING_PART_DISTANCE = 2;

const SI_FACTOR: Record<string, number> = {
  Resistor: 1,
  Inductor: H_PER_MH,
  Capacitor: F_PER_UF,
};
const PARAM_NAME: Record<string, string> = { Resistor: 'R', Inductor: 'L', Capacitor: 'C' };

/** The free component values of one candidate, in log10 SI, keyed by part id. */
export function componentVector(parts: readonly VxpPart[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of parts) {
    const factor = SI_FACTOR[p.type];
    if (factor === undefined || p.partId === undefined || p.open || p.shorted) continue;
    const v = p.params.find((q) => q.name === PARAM_NAME[p.type])?.value;
    if (typeof v !== 'number' || !(v > 0)) continue;
    out.set(p.partId, Math.log10(v * factor));
  }
  return out;
}

/**
 * Per-component spread across the whole candidate set, in log10 decades.
 *
 * Computed ONCE over the set rather than per pair: normalising against a
 * moving denominator would make distance depend on which pair you asked about,
 * and then "the farthest candidate" stops being a property of the field.
 *
 * A component every candidate agrees on has zero spread. It then contributes
 * nothing to any distance, which is right — it is not what distinguishes
 * these designs — and the guard below keeps it from dividing by zero.
 */
export function componentSpread(vectors: readonly Map<string, number>[]): Map<string, number> {
  const byId = new Map<string, number[]>();
  for (const v of vectors) {
    for (const [id, x] of v) {
      const list = byId.get(id);
      if (list) list.push(x);
      else byId.set(id, [x]);
    }
  }
  const out = new Map<string, number>();
  for (const [id, xs] of byId) {
    if (xs.length < 2) {
      out.set(id, 0);
      continue;
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const varc = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    out.set(id, Math.sqrt(varc));
  }
  return out;
}

/**
 * Normalised distance between two candidates.
 *
 * RMS over the UNION of their components: a part only one of them has counts
 * as `MISSING_PART_DISTANCE`, a part they share counts as their gap in that
 * part's own spread, and a part nobody varies counts as nothing.
 */
export function componentDistance(
  a: Map<string, number>,
  b: Map<string, number>,
  spread: Map<string, number>,
): number {
  const ids = new Set([...a.keys(), ...b.keys()]);
  if (ids.size === 0) return 0;
  let sq = 0;
  let n = 0;
  for (const id of ids) {
    const x = a.get(id);
    const y = b.get(id);
    if (x === undefined || y === undefined) {
      sq += MISSING_PART_DISTANCE * MISSING_PART_DISTANCE;
      n++;
      continue;
    }
    const s = spread.get(id) ?? 0;
    if (!(s > 0)) continue; // nobody varies this part: it distinguishes nothing
    const d = (x - y) / s;
    sq += d * d;
    n++;
  }
  return n > 0 ? Math.sqrt(sq / n) : 0;
}

/* ================================================================== *
 * The selection
 * ================================================================== */

export interface DiversityInput<T> {
  item: T;
  /** The full class key — order, family and polarity. */
  classKey: string;
  /** The coarse key the spreading prioritises — orders only. */
  orderKey: string;
  /** Component vector, for the within-class spreading. */
  vector: Map<string, number>;
  /** The presentation sort key. Lower is better; ties break on `index`. */
  sortKey: number;
  /** Position in the source field — the tie-breaker of last resort. */
  index: number;
}

/**
 * Pick `n` items, spread over order signatures first and component space
 * second.
 *
 * THE ALGORITHM, stated because a selection nobody can predict is a selection
 * nobody can reproduce:
 *
 *  1. Group by ORDER SIGNATURE. Order the groups by their best member's sort
 *     key, so the strongest shape leads.
 *  2. Round-robin over the groups. From each group take the member that is
 *     FARTHEST in normalised component space from everything already picked —
 *     and on the first visit to a group, simply its best member.
 *  3. When the groups run dry before `n` is reached, keep going round: a
 *     shortlist that returns four designs because there were only four shapes
 *     would be hiding the rest of the feasible field.
 *
 * Every comparison ends in `index`, so the result is a total order and two
 * runs of the same field produce the same list in the same sequence.
 */
export function selectDiverse<T>(items: readonly DiversityInput<T>[], n: number): DiversityInput<T>[] {
  if (n <= 0 || items.length === 0) return [];
  const spread = componentSpread(items.map((i) => i.vector));

  const groups = new Map<string, DiversityInput<T>[]>();
  for (const it of items) {
    const g = groups.get(it.orderKey);
    if (g) g.push(it);
    else groups.set(it.orderKey, [it]);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => (a.sortKey === b.sortKey ? a.index - b.index : a.sortKey - b.sortKey));
  }
  const order = [...groups.entries()].sort((a, b) => {
    const ka = a[1][0];
    const kb = b[1][0];
    return ka.sortKey === kb.sortKey ? ka.index - kb.index : ka.sortKey - kb.sortKey;
  });

  const picked: DiversityInput<T>[] = [];
  const taken = new Set<number>();
  while (picked.length < n && taken.size < items.length) {
    let progressed = false;
    for (const [, group] of order) {
      if (picked.length >= n) break;
      const remaining = group.filter((g) => !taken.has(g.index));
      if (remaining.length === 0) continue;
      let choice: DiversityInput<T>;
      if (picked.length === 0) {
        choice = remaining[0];
      } else {
        // Farthest from EVERYTHING already picked, measured as the nearest
        // neighbour distance: a candidate that is far from one pick but sits
        // on top of another is not adding a new corner of the space.
        let best = remaining[0];
        let bestD = -Infinity;
        for (const cand of remaining) {
          let nearest = Infinity;
          for (const p of picked) {
            const d = componentDistance(cand.vector, p.vector, spread);
            if (d < nearest) nearest = d;
          }
          if (nearest > bestD || (nearest === bestD && cand.index < best.index)) {
            bestD = nearest;
            best = cand;
          }
        }
        choice = best;
      }
      picked.push(choice);
      taken.add(choice.index);
      progressed = true;
    }
    if (!progressed) break;
  }
  return picked;
}
