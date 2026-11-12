/**
 * G-13 — THE FILTER ORDER PER HANDOVER IN GUIDED (`guidedOrder.ts`).
 *
 * The claims: the guided reading of the band form's slope selects is exact and
 * total (every pair of selects reads as one of three words or as 'other',
 * never silently as a button); the app's own defaults read as 4th order on
 * every handover (the finding that started this); the derivation turns a slope
 * target into ONE admitted order and nothing into every order (the mechanism
 * the buttons ride on); and the app writes BOTH selects of a handover, stamps
 * them, keeps no second state, and counts with the run's own generator.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GUIDED_ORDER_CHOICES,
  alignmentNameAt,
  orderChoiceOf,
  ordersBuilt,
  slopeRowsForHandover,
  statedOrderOfSlopes,
} from './guidedOrder.ts';
import { APP_DEFAULTS } from './appDefaults.ts';
import { V2_SETTING_KEYS } from './v2Settings.ts';
import { GUIDED_QUESTIONS } from './v2Guided.ts';
import { pairOrders, type FlankOrderInput } from './engine2/predesign/flankOrder.ts';
import { AUTO_STRUCTS } from './threeWayDesign.ts';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

describe('G-13 — the guided reading of the slope selects', () => {
  it('maps a handover onto the two slope rows exactly as pairDerivationInputs reads them', () => {
    expect(slopeRowsForHandover(0, 2)).toEqual(['acSlopeWoofer', 'acSlopeMidHp']);
    expect(slopeRowsForHandover(1, 2)).toEqual(['acSlopeMid', 'acSlopeTweeter']);
    // A two-way, and a hybrid three-way with one passive handover: the mid/tweeter pair.
    expect(slopeRowsForHandover(0, 1)).toEqual(['acSlopeMid', 'acSlopeTweeter']);
  });

  it('reads two selects as one of three words, or as "other" — never a silent button', () => {
    expect(orderChoiceOf('24', '24')).toBe('4');
    expect(orderChoiceOf('24', '12')).toBe('4'); // the steeper flank, as `orderFrom` reads it
    expect(orderChoiceOf('12', '12')).toBe('2');
    expect(orderChoiceOf('auto', 'auto')).toBe('auto');
    expect(orderChoiceOf('24', 'auto')).toBe('4');
    /* G-15 — 18 dB/oct is the third order and a first-class choice since the
     * standard filter offers it; 6 dB/oct (order 1, not in the library) stays
     * 'other'. 30 dB/oct reads as '4': `statedOrderOfSlopes` clamps to the
     * library's top order exactly as the band form's `orderFrom` does, so the
     * reading says what the engine will BUILD and not what was typed. */
    expect(orderChoiceOf('18', '18')).toBe('3');
    expect(orderChoiceOf('6', '6')).toBe('other');
    expect(orderChoiceOf('30', '30')).toBe('4');
    expect(statedOrderOfSlopes('auto', 'auto')).toBeNull();
    expect(statedOrderOfSlopes('24', '12')).toBe(4);
  });

  it('THE FINDING: the app’s own defaults read as 4th order on both handovers', () => {
    expect(orderChoiceOf(APP_DEFAULTS.acSlopeWoofer, APP_DEFAULTS.acSlopeMidHp)).toBe('4');
    expect(orderChoiceOf(APP_DEFAULTS.acSlopeMid, APP_DEFAULTS.acSlopeTweeter)).toBe('4');
  });

  it('each choice writes one slope value into both flanks', () => {
    expect(GUIDED_ORDER_CHOICES.map((c) => [c.id, c.slope])).toEqual([
      ['2', '12'],
      ['3', '18'],
      ['4', '24'],
      ['auto', 'auto'],
    ]);
  });
});

describe('G-13 — what the engine builds under a choice', () => {
  const all = [2, 3, 4];
  it('a chosen order below what another rule demands is overruled, and says so', () => {
    expect(ordersBuilt('2', null, all, 'exploration')).toEqual({ orders: [2], overruled: false });
    expect(ordersBuilt('2', 3, all, 'full')).toEqual({ orders: [3], overruled: true });
    expect(ordersBuilt('4', 3, all, 'full')).toEqual({ orders: [4], overruled: false });
    // A library without order 3 fits the demand upward.
    expect(ordersBuilt('2', 3, [2, 4], 'full')).toEqual({ orders: [4], overruled: true });
  });

  it('"let the engine choose" is the steepest admitted order in Quick and every admitted order in Extended', () => {
    expect(ordersBuilt('auto', null, all, 'exploration')).toEqual({ orders: [4], overruled: false });
    expect(ordersBuilt('auto', null, all, 'full')).toEqual({ orders: [2, 3, 4], overruled: false });
    expect(ordersBuilt('auto', 3, all, 'full')).toEqual({ orders: [3], overruled: false });
  });

  it('names the alignment the library builds at an order', () => {
    expect(alignmentNameAt(2, AUTO_STRUCTS)).toBe('LR2');
    expect(alignmentNameAt(4, AUTO_STRUCTS)).toBe('LR4');
    expect(alignmentNameAt(3, AUTO_STRUCTS)).toBe('BW3');
  });

  /* The mechanism the buttons ride on, measured on the derivation itself:
   * a slope target on a flat flank demands exactly that order, and nothing
   * admits everything. This is why 24 dB/oct in the band form has meant "4th
   * order only" in BOTH modes since E-2. */
  const foi = (slope: number | null): FlankOrderInput => ({
    pairLabel: 'low→mid',
    lower: 'low',
    upper: 'mid',
    crossingHz: 400,
    upperFsHz: 90,
    maxDriveOnFsDb: null,
    lowerBreakup: null,
    breakupSuppressionDb: null,
    lowerTargetSlopeDbPerOct: slope,
    upperTargetSlopeDbPerOct: slope,
    lowerNaturalSlopeDbPerOct: 0,
    upperNaturalSlopeDbPerOct: 0,
    availableOrders: all,
    statedOrder: null,
  });
  it('the derivation: a 24 dB/oct target on a flat flank admits ONLY order 4, 12 dB/oct only order 2, nothing admits every order', () => {
    expect(pairOrders(foi(24)).orders).toEqual([4]);
    expect(pairOrders(foi(12)).orders).toEqual([2]);
    expect(pairOrders(foi(null)).orders).toEqual([2, 3, 4]);
  });
});

describe('G-13 — the app', () => {
  it('asks it as a guided question after the woofer question and before the voicing, and it is no requirement', () => {
    const ids = GUIDED_QUESTIONS.map((q) => q.id);
    expect(ids.indexOf('order')).toBe(ids.indexOf('woofer') + 1);
    expect(ids.indexOf('voicing')).toBe(ids.indexOf('order') + 1);
    expect(GUIDED_QUESTIONS.find((q) => q.id === 'order')?.kind).toBe('order');
  });

  it('keeps no second state: no v2 setting key carries the order, the buttons write the four slope selects', () => {
    expect(V2_SETTING_KEYS.some((k) => /order/i.test(k))).toBe(false);
    const i = APP.indexOf('const setGuidedOrder = ');
    expect(i).toBeGreaterThan(0);
    const fn = APP.slice(i, APP.indexOf('const [a, b] = slopeRowsForHandover(handover, handovers);', i) + 200);
    for (const s of ['acSlopeWoofer: setAcSlopeWoofer', 'acSlopeMidHp: setAcSlopeMidHp', 'acSlopeMid: setAcSlopeMid', 'acSlopeTweeter: setAcSlopeTweeter']) {
      expect(fn).toContain(s);
    }
    expect(fn).toContain('setFieldStatedAt((prev) => stampField(stampField(prev, a), b));');
  });

  it('renders the question once, with a button per choice that writes through setGuidedOrder', () => {
    expect(APP.match(/\{q\.kind === 'order' && \(/g)).toHaveLength(1);
    const i = APP.indexOf("{q.kind === 'order' && (");
    const block = APP.slice(i, APP.indexOf("{q.kind === 'parts' && (", i));
    expect(block).toContain('GUIDED_ORDER_CHOICES.map((c) => {');
    expect(block).toContain('onClick={() => setGuidedOrder(row.i, guidedOrderRows.rows.length, c.id)}');
    expect(block).toContain('aria-pressed={on}');
    expect(block).toContain('ORDER_IS_APP_DEFAULT_NOTE');
  });

  it('counts with the run’s own generator, and reads the other rules with the slope targets stripped', () => {
    const i = APP.indexOf('const guidedOrderRows = useMemo(');
    expect(i).toBeGreaterThan(0);
    const memo = APP.slice(i, APP.indexOf('const setGuidedOrder = ', i));
    expect(memo).toContain('buildCandidateField({');
    expect(memo).toContain('curveOfDriverId: () => null');
    expect(memo).toContain('statedOrder: null,');
    expect(memo).toContain('statedOrder: statedOrderOfSlopes(pairs[j][0], pairs[j][1])');
    expect(memo).toContain('alignments: AUTO_STRUCTS');
    /* …and the generator gets the run's own polarity-arm choice AND phase
     * reader (H-4/H-5), so that under `'both'` the count holds the
     * margin-seeded mirrors the run would build — a count without the reader
     * would understate exactly that mode. */
    expect(memo).toContain('polarityMarginReader(polarityBranchOf)');
    expect(memo).toContain('polarityArms,');
  });

  it('12-11-2026: an EMPTY window at the chosen order is said on the row, and an empty field refuses the run on both routes', () => {
    /* Sander's run of 12-11: "2nd order" on mid→tweeter put the trade-rule
     * floor (2.83·f_s) above the breakup ceiling, the generator dropped that
     * handover and ran woofer→mid candidates alone, and the row had said
     * "Builds LR2 · 3 run(s)" — the count of the remaining axis. */
    const i = APP.indexOf('const guidedOrderRows = useMemo(');
    const memo = APP.slice(i, APP.indexOf('const setGuidedOrder = ', i));
    expect(memo).toContain('crossoverWindow({ ...wi, order })');
    expect(memo).toContain('emptyAt,');
    const b = APP.indexOf("{q.kind === 'order' && (");
    const block = APP.slice(b, APP.indexOf("{q.kind === 'parts' && (", b));
    expect(block).toContain('No window at this order:');
    /* Both scan routes stop on an empty field with the generator's own refusal
     * — before a worker starts — instead of running nothing. */
    expect(APP.match(/if \(v2Generated\.field\.candidates\.length === 0\) \{/g)).toHaveLength(2);
    expect(APP.match(/setVfError\(`Cannot optimise yet — \$\{v2Generated\.field\.refusals\.join\(' '\)\}`\);/g)).toHaveLength(2);
  });
});
