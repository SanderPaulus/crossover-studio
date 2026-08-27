/**
 * THE CANDIDATE GENERATOR, on windows whose arithmetic can be checked by eye.
 *
 * The windows below are synthetic and chosen so their spans are whole numbers
 * of octaves: 400–800 Hz is exactly one octave, 400–1600 exactly two. That
 * makes every position count a reader can verify against the rule ("one plus
 * however many spacings fit") rather than against a stored number.
 *
 * The four claims the generator makes are each tested as a claim rather than as
 * an output shape, because the outputs are easy and the claims are the delivery:
 *
 *   1. spread evenly in OCTAVE distance, not in hertz and not around a centre;
 *   2. the count derived from the span and the smoothing, not fixed;
 *   3. several admissible orders means several CANDIDATES, never a compromise;
 *   4. nothing outside the window. Ever — including under a budget, including
 *      when the worst lobing zone straddles the band.
 *
 * SINCE THE F4d FOLLOW-UP, rule 4's second half reads differently: the F3c
 * excision no longer shapes the field (V28, open). The block that used to
 * assert "no candidate lands in the worst lobing zone" now asserts the
 * suspension and its visibility — the band is whole, a position genuinely does
 * land in the old gap, and the zone travels with every candidate named and
 * attributed. The counter-proof matters more than the claim here: with the
 * excision gone, "the band is whole" and "the band is cut" are only
 * distinguishable if something actually sits in the gap.
 */

import { describe, expect, it } from 'vitest';
import { generateCandidates, derivedPositionCount, type Alignment } from './candidates.ts';
import type { XoWindowInput } from './xoWindow.ts';
import type { PairOrderResult } from './flankOrder.ts';
import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';

const LIBRARY: Alignment[] = [
  { kind: 'LR', order: 2 },
  { kind: 'BW', order: 3 },
  { kind: 'LR', order: 4 },
  { kind: 'BS', order: 4 },
];

/**
 * A window with the floor and ceiling stated directly, and nothing else armed.
 *
 * `validityFloorHz` sets the floor and a directivity limit sets the ceiling:
 * two limits that do not move with the order, so a test about POSITIONS is not
 * also a test about the k·f_s table. The order-dependence gets its own case.
 */
const flatWindow = (floorHz: number, ceilingHz: number, spacingMm = 0): XoWindowInput => ({
  lower: 'woofer',
  upper: 'mid',
  order: 4,
  validityFloorHz: floorHz,
  validityFloorSource: 'test',
  upperFsHz: null,
  lowerBreakups: [],
  lowerMinus6Hz: ceilingHz,
  lowerMinus6AngleDeg: 30,
  spacingMm: spacingMm > 0 ? spacingMm : null,
});

const orderSet = (orders: number[]): PairOrderResult => ({
  pairLabel: 'woofer→mid',
  flanks: [
    { pairLabel: 'woofer→mid', side: 'lower-lp', driver: 'woofer', demands: [], demandedOrder: null, binding: null, notes: [] },
    { pairLabel: 'woofer→mid', side: 'upper-hp', driver: 'mid', demands: [], demandedOrder: null, binding: null, notes: [] },
  ],
  orders,
  why: orders.map((o) => `order ${o}: test`),
  notes: [],
});

const one = (win: XoWindowInput, orders: number[] = [4]) =>
  generateCandidates([{ windowInput: win, orders: orderSet(orders) }], { alignments: LIBRARY });

describe('rule 2 — the count is derived from the span and the acceptance smoothing', () => {
  it('one plus however many spacings fit, and nothing else', () => {
    // A sixth of an octave is the smoothing; six of them fit in one octave.
    expect(derivedPositionCount(1, WINDOW_SMOOTHING_OCTAVES)).toBe(7);
    expect(derivedPositionCount(2, WINDOW_SMOOTHING_OCTAVES)).toBe(13);
    // A window narrower than one spacing holds exactly one distinguishable
    // answer, and that is information rather than a limitation.
    expect(derivedPositionCount(WINDOW_SMOOTHING_OCTAVES / 2, WINDOW_SMOOTHING_OCTAVES)).toBe(1);
  });

  it('a NARROWER window really does get fewer candidates', () => {
    const wide = one(flatWindow(400, 1600));
    const narrow = one(flatWindow(400, 500));
    expect(wide.candidates.length).toBeGreaterThan(narrow.candidates.length);
    // ...and not by a constant the generator carries: two octaves against a
    // third of one.
    expect(wide.candidates.length).toBe(13);
  });

  it('a coarser stated spacing gives a coarser field, and the parameters record which', () => {
    const f = generateCandidates([{ windowInput: flatWindow(400, 1600), orders: orderSet([4]) }], {
      alignments: LIBRARY,
      minSpacingOctaves: 0.5,
    });
    expect(f.candidates.length).toBe(5);
    expect(f.parameters.minSpacingOctaves).toBe(0.5);
  });
});

describe('rule 1 — spread evenly in octave distance, not clustered', () => {
  const f = one(flatWindow(400, 1600));
  const hz = f.candidates.map((c) => c.crossings[0].hz);

  it('the outer positions ARE the window edges', () => {
    expect(hz[0]).toBeCloseTo(400, 1);
    expect(hz[hz.length - 1]).toBeCloseTo(1600, 1);
  });

  /* Positions are printed and stored at ONE DECIMAL, so that a cage and the two
   * fields that express it round the same way (the F3b lesson about
   * 473.20000000000005). Half a tenth of a hertz at 400 Hz is 1.8e-4 octaves,
   * and that is the tolerance below — not a fudge factor but the print
   * precision, stated. */
  const ROUNDING_OCTAVES = Math.log2(1 + 0.05 / 400) * 2;

  it('consecutive positions are equally spaced in OCTAVES, not in hertz', () => {
    const octSteps = hz.slice(1).map((v, i) => Math.log2(v / hz[i]));
    const hzSteps = hz.slice(1).map((v, i) => v - hz[i]);
    for (const s of octSteps) expect(Math.abs(s - octSteps[0])).toBeLessThan(ROUNDING_OCTAVES);
    // The hertz steps grow — which is what "even in octaves" means, and the
    // check that would fail if this were a linear spread wearing a log name.
    expect(hzSteps[hzSteps.length - 1]).toBeGreaterThan(hzSteps[0] * 1.5);
  });

  it('every spacing is at least the smoothing the count was derived from', () => {
    const octSteps = hz.slice(1).map((v, i) => Math.log2(v / hz[i]));
    for (const s of octSteps) {
      expect(s).toBeGreaterThanOrEqual(WINDOW_SMOOTHING_OCTAVES - ROUNDING_OCTAVES);
    }
  });

  it('a single position sits at the MIDPOINT of the band, not at an edge', () => {
    const narrow = one(flatWindow(400, 420));
    expect(narrow.candidates).toHaveLength(1);
    const p = narrow.candidates[0].crossings[0].hz;
    expect(p).toBeGreaterThan(400);
    expect(p).toBeLessThan(420);
    expect(p).toBeCloseTo(Math.sqrt(400 * 420), 0);
  });
});

describe('rule 4 — nothing leaves the window, and nothing leaves its cage', () => {
  it('every position and every cage edge sits inside the window it was carved from', () => {
    for (const win of [flatWindow(400, 1600), flatWindow(397, 551), flatWindow(1294, 2284)]) {
      const f = one(win);
      for (const c of f.candidates) {
        const x = c.crossings[0];
        expect(x.hz).toBeGreaterThanOrEqual(x.windowHz[0] - 1e-9);
        expect(x.hz).toBeLessThanOrEqual(x.windowHz[1] + 1e-9);
        expect(x.cageHz[0]).toBeGreaterThanOrEqual(x.windowHz[0] - 1e-9);
        expect(x.cageHz[1]).toBeLessThanOrEqual(x.windowHz[1] + 1e-9);
        // A cage is never a point: a zero-width one turns the tuner's handover
        // penalty into a cliff.
        expect(x.cageHz[1]).toBeGreaterThan(x.cageHz[0]);
        expect(x.cageHz[0]).toBeLessThanOrEqual(x.hz);
        expect(x.cageHz[1]).toBeGreaterThanOrEqual(x.hz);
      }
    }
  });

  /* V28 (open) — THE F3c EXCISION IS SUSPENDED, and this block is what it
   * replaced. Until the F4d follow-up these three assertions read "the worst
   * lobing zone is CUT OUT, and no candidate lands in it". The zone that was
   * being cut is `[0.5, 0.7] · c/d` on the ONE centre-to-centre distance the
   * pair was handed — a λ fraction, and V20a reserves every lobing judgement
   * for the vertical synthesis. What the tests now pin is the suspension: the
   * band is whole, the zone is still computed, and it travels with every
   * candidate so a reader can see it and argue with it. */
  it('the worst lobing zone is NOT cut out — the band is whole (V28 suspension)', () => {
    /* Spacing 261 mm puts the worst zone (0.5–0.7 · c/d) at 657–920 Hz. A
     * window of 400–1600 Hz straddles it. `recommendedBand` still carves the
     * band in two — it is untouched — and the generator still ignores that. */
    const f = one(flatWindow(400, 1600, 261));
    const zone = f.axes[0].recommended['4'].worstZoneHz!;
    expect(zone).not.toBeNull();
    expect(f.axes[0].recommended['4'].segments.length).toBe(2);

    // Every position sits in ONE segment spanning the whole window — the two
    // recommended-band segments are not what was laid across.
    for (const c of f.candidates) {
      const x = c.crossings[0];
      expect(x.segmentHz[0]).toBeCloseTo(x.windowHz[0], 6);
      expect(x.segmentHz[1]).toBeCloseTo(x.windowHz[1], 6);
    }

    /* THE COUNTER-PROOF, and without it the assertion above is only a claim
     * about arithmetic: with the gap gone, a position genuinely LANDS in the
     * stretch F3c used to forbid. If none did, "the band is whole" and "the
     * band is cut" would be indistinguishable on this fixture. */
    const inZone = f.candidates.filter((c) => {
      const hz = c.crossings[0].hz;
      return hz > zone[0] && hz < zone[1];
    });
    expect(inZone.length).toBeGreaterThan(0);
  });

  it('the suspended zone travels with every candidate — named, attributed, and marked not applied', () => {
    const f = one(flatWindow(400, 1600, 261));
    const zone = f.axes[0].recommended['4'].worstZoneHz!;
    expect(f.candidates.length).toBeGreaterThan(0);
    for (const c of f.candidates) {
      const ex = c.crossings[0].excisions;
      expect(ex).toHaveLength(1);
      // The zone frequencies are the composition's own — not recomputed here
      // and not recomputed there, so the two can never round apart.
      expect(ex[0].hz).toEqual(zone);
      expect(ex[0].applied).toBe(false);
      expect(ex[0].suspendedBecause).toMatch(/V28/);
      // The attribution names the QUANTITY, and says which one it is not.
      expect(ex[0].source).toMatch(/centre-to-centre/);
      expect(ex[0].source).toMatch(/not the vertical synthesis/);
      // ...and it reaches the one string a shortlist row actually prints.
      expect(c.crossings[0].provenance).toMatch(/not excised/);
      expect(c.crossings[0].provenance).toMatch(/V28/);
    }
    // The axis says it once too, for the panel.
    expect(f.axes[0].notes.join(' ')).toMatch(/is NOT cut out of the candidate band/);
    expect(f.axes[0].excisions['4']).toHaveLength(1);
  });

  it('a layout with no zones produces no excision at all — absence is not an empty verdict', () => {
    // No spacing stated ⇒ `xoWindow` derives no zones ⇒ nothing to report.
    const f = one(flatWindow(400, 1600));
    expect(f.candidates.length).toBeGreaterThan(0);
    for (const c of f.candidates) expect(c.crossings[0].excisions).toHaveLength(0);
    for (const c of f.candidates) expect(c.crossings[0].provenance).not.toMatch(/excised/);
  });

  it('an EMPTY window produces no candidate and says why — never a fallback position', () => {
    const f = one({ ...flatWindow(1600, 400) });
    expect(f.candidates).toHaveLength(0);
    expect(f.refusals.join(' ')).toMatch(/EMPTY|no feasible window/);
  });
});

describe('rule 3 — several orders means several candidates', () => {
  const f = one(flatWindow(400, 500), [2, 3, 4]);

  it('each admissible order produces its own candidates at its own positions', () => {
    const orders = [...new Set(f.candidates.map((c) => c.crossings[0].order))].sort();
    expect(orders).toEqual([2, 3, 4]);
  });

  it('no candidate carries an order that is not in the set — no averaging, no rounding', () => {
    for (const c of f.candidates) expect([2, 3, 4]).toContain(c.crossings[0].order);
  });

  it('the label distinguishes two orders at the same frequency', () => {
    // The scan table keys on the label; two candidates that differ only in
    // order and share a label lose a row and burn a chain for nothing.
    expect(new Set(f.candidates.map((c) => c.label)).size).toBe(f.candidates.length);
  });

  it('where the library offers two alignments at one order, one is built and the other NAMED', () => {
    // Order 4 has both LR4 and BS4 in the library.
    const built = f.candidates.filter((c) => c.crossings[0].order === 4);
    expect(new Set(built.map((c) => c.crossings[0].alignment.kind))).toEqual(new Set(['LR']));
    expect(f.axes[0].notes.join(' ')).toMatch(/BS4/);
    expect(f.axes[0].notes.join(' ')).toMatch(/symmetric acoustic/);
  });

  it('the window is re-derived PER ORDER — the k·f_s floor moves and so do the positions', () => {
    /* The floor here is 1.4·f_s at order 4 and 2.0·f_s at order 2, so the two
     * orders do not share a window. Generating both inside one window would put
     * the second-order candidates under a floor computed for the fourth. */
    const win: XoWindowInput = {
      ...flatWindow(100, 4000),
      upperFsHz: 500,
    };
    const g = generateCandidates([{ windowInput: win, orders: orderSet([2, 4]) }], {
      alignments: LIBRARY,
    });
    const floorAt = (order: number) =>
      g.candidates.find((c) => c.crossings[0].order === order)!.crossings[0].windowHz[0];
    expect(floorAt(2)).toBeCloseTo(1000, 0);
    expect(floorAt(4)).toBeCloseTo(700, 0);
    expect(floorAt(2)).toBeGreaterThan(floorAt(4));
  });
});

describe('the budget thins positions and never orders', () => {
  const derived = one(flatWindow(400, 1600), [2, 3, 4]);
  const capped = generateCandidates(
    [{ windowInput: flatWindow(400, 1600), orders: orderSet([2, 3, 4]) }],
    { alignments: LIBRARY, chainBudget: 6 },
  );

  it('the field shrinks to the budget', () => {
    expect(derived.candidates.length).toBeGreaterThan(6);
    expect(capped.candidates.length).toBeLessThanOrEqual(6);
  });

  it('every order survives — a choice is not thinned to fit a cost knob', () => {
    expect([...new Set(capped.candidates.map((c) => c.crossings[0].order))].sort()).toEqual([2, 3, 4]);
  });

  it('the thinning is REPORTED, with both counts', () => {
    expect(capped.notes.join(' ')).toMatch(/POSITIONS were thinned/);
    expect(capped.notes.join(' ')).toMatch(/ORDERS were not thinned/);
    expect(capped.parameters.derivedSize).toBe(derived.candidates.length);
    expect(capped.parameters.deliveredSize).toBe(capped.candidates.length);
  });

  it('thinned positions still sit inside the window', () => {
    for (const c of capped.candidates) {
      const x = c.crossings[0];
      expect(x.hz).toBeGreaterThanOrEqual(x.windowHz[0] - 1e-9);
      expect(x.hz).toBeLessThanOrEqual(x.windowHz[1] + 1e-9);
    }
  });
});

describe('N-way — the generator takes a product and counts nothing', () => {
  const low: XoWindowInput = { ...flatWindow(400, 800), lower: 'woofer', upper: 'mid' };
  const high: XoWindowInput = { ...flatWindow(1600, 3200), lower: 'mid', upper: 'tweeter' };
  const mkOrders = (label: string, orders: number[]): PairOrderResult => ({
    ...orderSet(orders),
    pairLabel: label,
  });

  it('two pairs give the product, three pairs the product of three', () => {
    const two = generateCandidates(
      [
        { windowInput: low, orders: mkOrders('woofer→mid', [4]) },
        { windowInput: high, orders: mkOrders('mid→tweeter', [4]) },
      ],
      { alignments: LIBRARY, minSpacingOctaves: 0.5 },
    );
    // One octave at half-octave spacing is three positions per axis.
    expect(two.candidates).toHaveLength(9);
    expect(two.candidates[0].crossings).toHaveLength(2);

    const three = generateCandidates(
      [
        { windowInput: low, orders: mkOrders('a', [4]) },
        { windowInput: high, orders: mkOrders('b', [4]) },
        { windowInput: { ...flatWindow(6400, 12800), lower: 'tweeter', upper: 'super' }, orders: mkOrders('c', [4]) },
      ],
      { alignments: LIBRARY, minSpacingOctaves: 0.5 },
    );
    expect(three.candidates).toHaveLength(27);
    expect(three.candidates[0].crossings).toHaveLength(3);
  });

  it('a combination whose handovers do not ascend is dropped, and the drop is counted', () => {
    // Two overlapping windows: a position in the upper pair can sit below one
    // in the lower pair, and such a pair of numbers is not a design.
    const f = generateCandidates(
      [
        { windowInput: { ...flatWindow(400, 1600), lower: 'woofer', upper: 'mid' }, orders: mkOrders('a', [4]) },
        { windowInput: { ...flatWindow(400, 1600), lower: 'mid', upper: 'tweeter' }, orders: mkOrders('b', [4]) },
      ],
      { alignments: LIBRARY, minSpacingOctaves: 0.5 },
    );
    for (const c of f.candidates) expect(c.crossings[1].hz).toBeGreaterThan(c.crossings[0].hz);
    expect(f.notes.join(' ')).toMatch(/did not ascend/);
  });
});

describe('provenance travels with every candidate', () => {
  const f = one(flatWindow(400, 1600, 261), [4]);

  it('each crossing says which window, which segment, which position and which order rule', () => {
    for (const c of f.candidates) {
      const x = c.crossings[0];
      expect(x.provenance).toContain('position');
      expect(x.provenance).toContain('window floor');
      expect(x.provenance).toContain('ceiling');
      expect(x.orderWhy).toMatch(/order 4/);
      expect(x.position.count).toBeGreaterThan(0);
      expect(x.position.index).toBeLessThan(x.position.count);
      expect(x.floorBy).toMatch(/validity|fs|breakup|directivity|no floor/);
    }
  });

  it('the candidate provenance is the concatenation of its crossings', () => {
    for (const c of f.candidates) {
      for (const x of c.crossings) expect(c.provenance).toContain(x.provenance);
    }
  });

  it('an uncalibrated binding limit travels into the candidate rather than being dropped', () => {
    // A breakup ceiling carries the severity-weighting caveat (V6/V9).
    const win: XoWindowInput = {
      ...flatWindow(400, 4000),
      lowerBreakups: [{ fHz: 3000, dB: 4 }],
      lowerMinus6Hz: null,
      significantBreakupDb: 2.5,
    };
    const g = one(win);
    expect(g.candidates.length).toBeGreaterThan(0);
    expect(g.candidates[0].crossings[0].uncalibrated.join(' ')).toMatch(/uncalibrated/i);
  });
});
