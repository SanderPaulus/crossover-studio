/**
 * A5e.1 — the two definitions of "different", tested on their own.
 *
 * The shortlist promises materially different designs. That promise is only as
 * good as the class key and the distance, so both are checked here in
 * isolation, where a failure says which definition is wrong instead of "the
 * selection looks odd".
 */

import { describe, expect, it } from 'vitest';
import {
  componentDistance,
  componentSpread,
  componentVector,
  MISSING_PART_DISTANCE,
  orderSignature,
  selectDiverse,
  topologyClassKey,
  type DiversityInput,
  type TopologyDescriptor,
} from './diversity.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const topo = (
  flanks: [string, 'hp' | 'lp', string, number][],
  inverted: string[] = [],
): TopologyDescriptor => ({
  flanks: flanks.map(([way, side, kind, order]) => ({ way, side, kind, order })),
  inverted,
});

const cap = (id: string, uF: number): VxpPart => ({
  type: 'Capacitor',
  partId: id,
  params: [{ name: 'C', value: uF, unit: 'uF' }],
  wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
});
const coil = (id: string, mH: number): VxpPart => ({
  type: 'Inductor',
  partId: id,
  params: [{ name: 'L', value: mH, unit: 'mH' }],
  wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
});

describe('the topology class key', () => {
  it('is canonical: assembly order cannot split one class in two', () => {
    const a = topo([
      ['low', 'lp', 'LR', 4],
      ['high', 'hp', 'LR', 4],
    ]);
    const b = topo([
      ['high', 'hp', 'LR', 4],
      ['low', 'lp', 'LR', 4],
    ]);
    expect(topologyClassKey(a)).toBe(topologyClassKey(b));
    expect(orderSignature(a)).toBe(orderSignature(b));
  });

  it('POLARITY is part of the class: an inverted mid is a different design', () => {
    // Not a variation on the same design — it lobes differently in the
    // vertical plane, and a shortlist that treated the two as interchangeable
    // would offer a choice the designer cannot hear as one.
    const plain = topo([['mid', 'hp', 'LR', 4]]);
    const inverted = topo([['mid', 'hp', 'LR', 4]], ['mid']);
    expect(topologyClassKey(plain)).not.toBe(topologyClassKey(inverted));
    // ...but the ORDER signature is the same, which is what makes the
    // spreading prioritise order over polarity.
    expect(orderSignature(plain)).toBe(orderSignature(inverted));
  });

  it('order and family both separate classes; only order drives the spreading', () => {
    const lr4 = topo([['low', 'lp', 'LR', 4]]);
    const lr2 = topo([['low', 'lp', 'LR', 2]]);
    const bw4 = topo([['low', 'lp', 'BW', 4]]);
    expect(topologyClassKey(lr4)).not.toBe(topologyClassKey(lr2));
    expect(topologyClassKey(lr4)).not.toBe(topologyClassKey(bw4));
    expect(orderSignature(lr4)).not.toBe(orderSignature(lr2));
    // Same order, different family: one signature, two classes.
    expect(orderSignature(lr4)).toBe(orderSignature(bw4));
  });
});

describe('the normalised component distance', () => {
  it('measures values in LOG space, so a ratio means the same everywhere', () => {
    const a = componentVector([cap('C1', 1)]);
    const b = componentVector([cap('C1', 10)]);
    const c = componentVector([cap('C1', 100)]);
    // One decade twice over: equal steps in log space, however different the
    // raw differences (9 µF vs 90 µF) look.
    const spread = componentSpread([a, b, c]);
    expect(componentDistance(a, b, spread)).toBeCloseTo(componentDistance(b, c, spread), 9);
  });

  it('a part nobody varies contributes nothing', () => {
    const a = componentVector([cap('C1', 4.7), coil('L1', 1.0)]);
    const b = componentVector([cap('C1', 4.7), coil('L1', 2.0)]);
    const spread = componentSpread([a, b]);
    expect(spread.get('C1')).toBe(0);
    expect(spread.get('L1')).toBeGreaterThan(0);
    // Only L1 can distinguish these two, and the distance says so rather than
    // being diluted by a component they agree on.
    const only = componentDistance(a, b, spread);
    expect(only).toBeGreaterThan(0);
    expect(Number.isFinite(only)).toBe(true);
  });

  it('a STRUCTURAL difference counts as a large value difference, not an infinite one', () => {
    // The metric is an RMS over the UNION of both parts lists, so an extra
    // trap is one term among however many parts there are. That ceiling is
    // deliberate: on a twenty-part network a single added part must not swamp
    // every value difference, and "adds a trap" and "moves a cap by a decade"
    // are both real differences. Compared here on EQUAL union sizes, so the
    // averaging cannot flatter either one.
    const withTrap = componentVector([cap('C1', 4.7), coil('L9', 0.5)]);
    const without = componentVector([cap('C1', 4.7)]);
    const capMoved = componentVector([cap('C1', 47), coil('L9', 0.5)]);
    const spread = componentSpread([withTrap, without, capMoved]);

    const structural = componentDistance(withTrap, without, spread);
    const valueOnly = componentDistance(withTrap, capMoved, spread);
    expect(structural).toBeGreaterThan(0);
    expect(valueOnly).toBeGreaterThan(0);
    // Same order of magnitude — neither kind of difference is ranked above
    // the other by construction.
    expect(structural / valueOnly).toBeGreaterThan(0.5);
    expect(structural / valueOnly).toBeLessThan(2);
    expect(MISSING_PART_DISTANCE).toBeGreaterThan(1);
  });

  it('an open or shorted part is not in the vector', () => {
    const live = componentVector([cap('C1', 4.7)]);
    const dead = componentVector([{ ...cap('C1', 4.7), shorted: true }]);
    expect(live.size).toBe(1);
    expect(dead.size).toBe(0);
  });
});

describe('the diverse selection', () => {
  const mk = (
    index: number,
    orderKey: string,
    parts: VxpPart[],
    sortKey: number,
  ): DiversityInput<string> => ({
    item: `cand${index}`,
    classKey: orderKey,
    orderKey,
    vector: componentVector(parts),
    sortKey,
    index,
  });

  it('spreads over ORDER signatures before it spreads within one', () => {
    // Four second-order designs that are all better than the single
    // fourth-order one. A pure sort would return four clones; the spreading
    // has to reach the other shape.
    const items = [
      mk(0, 'lp=2', [cap('C1', 4.0)], 0.10),
      mk(1, 'lp=2', [cap('C1', 4.1)], 0.11),
      mk(2, 'lp=2', [cap('C1', 4.2)], 0.12),
      mk(3, 'lp=4', [cap('C1', 12.0), coil('L1', 0.8)], 0.40),
    ];
    const picked = selectDiverse(items, 2);
    expect(picked.map((p) => p.orderKey)).toEqual(['lp=2', 'lp=4']);
  });

  it('within one signature it takes the FARTHEST, not the next-best', () => {
    // cand1 is second on the sort key but sits on top of cand0; cand2 is
    // third and genuinely elsewhere. The second pick must be cand2.
    const items = [
      mk(0, 'lp=2', [cap('C1', 4.0)], 0.10),
      mk(1, 'lp=2', [cap('C1', 4.01)], 0.11),
      mk(2, 'lp=2', [cap('C1', 40.0)], 0.12),
    ];
    const picked = selectDiverse(items, 2);
    expect(picked.map((p) => p.item)).toEqual(['cand0', 'cand2']);
  });

  it('keeps going round when the signatures run dry before N', () => {
    const items = [
      mk(0, 'a', [cap('C1', 4.0)], 0.1),
      mk(1, 'a', [cap('C1', 8.0)], 0.2),
      mk(2, 'b', [cap('C1', 16.0)], 0.3),
    ];
    // Two signatures, three candidates, four asked for: deliver all three
    // rather than stopping at one per group.
    expect(selectDiverse(items, 4)).toHaveLength(3);
  });

  it('is a TOTAL order: the same field gives the same list every time', () => {
    const build = () => [
      mk(0, 'a', [cap('C1', 4.0)], 0.1),
      mk(1, 'a', [cap('C1', 4.0)], 0.1), // deliberate tie on key AND vector
      mk(2, 'b', [cap('C1', 9.0)], 0.1),
    ];
    const first = selectDiverse(build(), 3).map((p) => p.index);
    const second = selectDiverse(build(), 3).map((p) => p.index);
    expect(second).toEqual(first);
  });

  it('asking for none returns none, and an empty field returns empty', () => {
    expect(selectDiverse([mk(0, 'a', [cap('C1', 1)], 0)], 0)).toEqual([]);
    expect(selectDiverse([], 5)).toEqual([]);
  });
});
