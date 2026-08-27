/**
 * A5d.3's ORDER DERIVATION, by hand.
 *
 * Every number below is one a reader can check on paper — the whole rule is
 * "attenuation divided by six dB per octave per order, divided by the octave
 * distance" — and the frequencies are chosen so the octave distances are whole
 * numbers. A test on a real driver would prove the code runs; this proves it
 * computes the rule the specification states.
 *
 * The abstention cases carry as much weight as the arithmetic. An estimator
 * that cannot abstain publishes nonsense (V8e), and the shape abstention takes
 * here is unusual enough to be worth pinning: NOT "order 1", NOT "order 4", but
 * "every buildable order is its own candidate".
 */

import { describe, expect, it } from 'vitest';
import { naturalSlopeDbPerOctave, pairOrders, type FlankOrderInput } from './flankOrder.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';

const AVAILABLE = [...new Set(AUTO_STRUCTS.map((a) => a.order))].sort((a, b) => a - b);

const base = (over: Partial<FlankOrderInput> = {}): FlankOrderInput => ({
  pairLabel: 'mid→tweeter',
  lower: 'mid',
  upper: 'tweeter',
  crossingHz: 2000,
  availableOrders: AVAILABLE,
  ...over,
});

describe('A5d.3(ii) — the protection flank', () => {
  it('24 dB over two octaves is order 2, on the nose', () => {
    // f_s 500 Hz, handover 2000 Hz: exactly two octaves. 24 / (6 × 2) = 2.
    const r = pairOrders(base({ upperFsHz: 500, maxDriveOnFsDb: -24 }));
    const hp = r.flanks.find((f) => f.side === 'upper-hp')!;
    expect(hp.binding?.rule).toBe('protection');
    expect(hp.binding?.exactOrder).toBeCloseTo(2, 9);
    expect(hp.demandedOrder).toBe(2);
    expect(r.orders).toEqual([2]);
  });

  it('a demand between two orders rounds UP — a flank that nearly clears is a flank that does not', () => {
    // 30 dB over two octaves = 2.5 orders. Nothing between LR2 and BW3 exists,
    // and taking the lower one would deliver 24 dB where 30 was asked for.
    const r = pairOrders(base({ upperFsHz: 500, maxDriveOnFsDb: -30 }));
    const hp = r.flanks.find((f) => f.side === 'upper-hp')!;
    expect(hp.binding!.exactOrder).toBeCloseTo(2.5, 9);
    expect(hp.demandedOrder).toBe(3);
    expect(r.orders).toEqual([3]);
  });

  it('a demand past the library is clamped to what can be built, and says the shortfall', () => {
    // 60 dB over one octave = 10 orders. The library stops at 4.
    const r = pairOrders(base({ crossingHz: 1000, upperFsHz: 500, maxDriveOnFsDb: -60 }));
    expect(r.orders).toEqual([Math.max(...AVAILABLE)]);
    expect(r.notes.join(' ')).toMatch(/alignment library stops at/);
  });

  it('the LOW-PASS flank carries no protection demand — it is not what protects the upper driver', () => {
    const r = pairOrders(base({ upperFsHz: 500, maxDriveOnFsDb: -24 }));
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    expect(lp.demands).toHaveLength(0);
  });

  it('no stated M-C limit means the rule is not armed, and it says so rather than defaulting', () => {
    const r = pairOrders(base({ upperFsHz: 500 }));
    const hp = r.flanks.find((f) => f.side === 'upper-hp')!;
    expect(hp.demands).toHaveLength(0);
    expect(hp.notes.join(' ')).toMatch(/no M-C limit/);
    expect(hp.notes.join(' ')).toMatch(/absent is absent|P4/);
  });
});

describe('A5d.3(iii) — the suppression flank', () => {
  it('18 dB over three octaves is order 1, and it lands on the LOW-PASS flank', () => {
    // Breakup at 8000 Hz, handover at 1000: three octaves. 18 / (6 × 3) = 1.
    const r = pairOrders(
      base({
        crossingHz: 1000,
        lowerBreakup: { fHz: 8000, dB: 5 },
        breakupSuppressionDb: 18,
      }),
    );
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    expect(lp.binding?.rule).toBe('suppression');
    expect(lp.binding?.exactOrder).toBeCloseTo(1, 9);
    // The demand is order 1 and the alignment library's lowest is 2, so the
    // candidate is built at 2 — the smallest buildable order that satisfies it.
    expect(r.orders).toEqual([Math.min(...AVAILABLE)]);
  });

  it('a breakup with no stated budget arms nothing — the severity curve is already uncalibrated', () => {
    const r = pairOrders(base({ crossingHz: 1000, lowerBreakup: { fHz: 8000, dB: 5 } }));
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    expect(lp.demands).toHaveLength(0);
    expect(lp.notes.join(' ')).toMatch(/no suppression budget/);
  });
});

describe('A5d.3(i) — the target slope minus what the driver already does', () => {
  it('a driver that already rolls off needs less electrical order', () => {
    // Target 24 dB/oct on the low-pass flank; the cone itself already falls at
    // 12 dB/oct there, so 12 dB/oct is missing and that is two orders.
    const r = pairOrders(
      base({ lowerTargetSlopeDbPerOct: 24, lowerNaturalSlopeDbPerOct: -12 }),
    );
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    expect(lp.binding?.rule).toBe('target-slope');
    expect(lp.binding?.exactOrder).toBeCloseTo(2, 9);
  });

  it('a target with no measurable natural slope abstains — subtracting nothing would claim it is flat', () => {
    const r = pairOrders(base({ lowerTargetSlopeDbPerOct: 24 }));
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    expect(lp.demands).toHaveLength(0);
    expect(lp.notes.join(' ')).toMatch(/could not be fitted/);
  });
});

describe('the pair — a set of orders, never a compromise between two', () => {
  it('with nothing armed and nothing stated, EVERY buildable order is its own candidate', () => {
    const r = pairOrders(base());
    expect(r.orders).toEqual(AVAILABLE);
    expect(r.why.join(' ')).toMatch(/nothing narrows this handover/);
    // Not order 1, not order 4, and above all not an average of them.
    expect(r.orders.length).toBeGreaterThan(1);
  });

  it('a demanded order and a stated one are BOTH built — two questions, no weighting to merge them', () => {
    const r = pairOrders(base({ upperFsHz: 500, maxDriveOnFsDb: -24, statedOrder: 4 }));
    expect(r.orders).toEqual([2, 4]);
    expect(r.why.join(' ')).toMatch(/the designer stated/);
  });

  it('when the demanded order IS the stated one, it appears once', () => {
    const r = pairOrders(base({ upperFsHz: 500, maxDriveOnFsDb: -24, statedOrder: 2 }));
    expect(r.orders).toEqual([2]);
  });

  it('two flanks demanding different orders: the higher is built and the asymmetry is REPORTED', () => {
    /* The low pass wants 1 (18 dB over three octaves), the high pass wants 3
     * (36 dB over two). The design step's alignment library is symmetric, so
     * the candidate cannot be LR1-under-BW3 — and the thing this test pins is
     * that the limitation is stated instead of averaged into order 2. */
    const r = pairOrders(
      base({
        crossingHz: 2000,
        upperFsHz: 500,
        maxDriveOnFsDb: -36,
        lowerBreakup: { fHz: 16000, dB: 5 },
        breakupSuppressionDb: 18,
      }),
    );
    const lp = r.flanks.find((f) => f.side === 'lower-lp')!;
    const hp = r.flanks.find((f) => f.side === 'upper-hp')!;
    expect(lp.demandedOrder).toBe(1);
    expect(hp.demandedOrder).toBe(3);
    expect(r.orders).toEqual([3]);
    expect(r.notes.join(' ')).toMatch(/demand different orders/);
    expect(r.notes.join(' ')).toMatch(/SYMMETRIC/);
    // The average of 1 and 3 is 2, and 2 must not appear anywhere.
    expect(r.orders).not.toContain(2);
  });

  it('rules (iv) and (v) are declared missing rather than silently skipped', () => {
    const r = pairOrders(base());
    expect(r.notes.join(' ')).toMatch(/A5d\.3\(iv\)/);
    expect(r.notes.join(' ')).toMatch(/A5d\.2 has no implementation/);
    expect(r.notes.join(' ')).toMatch(/A5d\.3\(v\)/);
  });
});

describe('the natural-slope fit', () => {
  const grid = Array.from({ length: 400 }, (_, i) => 100 * 2 ** ((i / 399) * 8));

  it('reads a synthetic 12 dB/oct roll-off back as 12 dB/oct', () => {
    const db = grid.map((f) => (f <= 1000 ? 0 : -12 * Math.log2(f / 1000)));
    const s = naturalSlopeDbPerOctave(grid, db, 1000, 'above');
    expect(s).not.toBeNull();
    expect(s!).toBeCloseTo(-12, 1);
  });

  it('reads a rising high-pass flank the other way round', () => {
    const db = grid.map((f) => (f >= 1000 ? 0 : 18 * Math.log2(f / 1000)));
    const s = naturalSlopeDbPerOctave(grid, db, 1000, 'below');
    expect(s!).toBeCloseTo(18, 1);
  });

  it('abstains on a grid too coarse to fit, rather than drawing a line through two points', () => {
    const coarse = [500, 1000, 2000, 4000];
    const db = coarse.map((f) => -12 * Math.log2(f / 500));
    expect(naturalSlopeDbPerOctave(coarse, db, 1000, 'above')).toBeNull();
  });
});
