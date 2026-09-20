/**
 * H-4b — THE TEXTBOOK RULE ON THE HAND PATHS, and the signature of a missing
 * inversion, as claims.
 *
 * Four groups. (1) THE ALGEBRA with the hand: relative handover bits against
 * inverted ways, both directions, because the app and a shortlist label read
 * the same bits in two vocabularies and a round trip that is not the identity
 * would put them quietly out of step. (2) THE RULE on drawn flanks, including
 * the two shapes where there IS no rule — the answer is null and the sentence
 * says which half is missing (P4). (3) THE SIGNATURE on curves built by hand,
 * so the margin can be checked against algebra rather than against the engine
 * that produced it. (4) THE APP as a SOURCE SCAN (the UI-1 idiom): a unit test
 * cannot say whether the form calls any of this, and calling it is the half
 * that was missing.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  HANDOVER_POLARITY_VERSION,
  REVERSED_NULL_MARGIN_DB,
  followTextbookOnAlignmentChange,
  handoverTextbook,
  handoversOfBand,
  invertedFlagsOf,
  relativeBitsOf,
  reversedNullSignature,
  textbookDeviation,
} from './handoverPolarity.ts';
import { handoverBandHz, nullMarginAtPhaseErrorDeg, textbookComplementInverted } from './activeSide.ts';
import { PHASE_ERROR_UNIT_DEG } from './bandMetrics.ts';
import { applyTransfer, combine } from './dsp.ts';
import { evalDriverFilter, type HpLpSpec } from './filters.ts';
import { casus1bChainInput, casus1bFiles, casus1bManifest } from './engine2/casus1b.fixture.ts';

const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf-8');
const band = (kind: 'LR' | 'BW' | 'BS', order: 1 | 2 | 3 | 4, freq = 2000, enabled = true): HpLpSpec => ({
  enabled,
  kind,
  order,
  freq,
});

describe('H-4b (1) — the algebra, one implementation and two vocabularies', () => {
  it('accumulates relative handover bits into inverted ways, by hand', () => {
    /* Three handovers, the second one reversed: way 2 and everything above it
     * flips relative to the woofer, and way 1 does not. */
    expect(invertedFlagsOf([false, true, false])).toEqual([false, true, true]);
    expect(invertedFlagsOf([true, false])).toEqual([true, true]);
    expect(invertedFlagsOf([true, true])).toEqual([true, false]);
    expect(invertedFlagsOf([])).toEqual([]);
  });

  it('SWAPPING ONE DRIVER flips both handovers it takes part in', () => {
    /* The physical statement behind H-4b's guarantee: reversing the mid's
     * wires is flags [true,false] — exactly one way — and that reads back as
     * BOTH handover bits set. Anything that claimed it was one bit would be
     * describing a different loudspeaker. */
    expect(relativeBitsOf([true, false])).toEqual([true, true]);
    expect(invertedFlagsOf([true, true])).toEqual([true, false]);
  });

  it('is an identity in both directions (the claim the form hangs on)', () => {
    for (let mask = 0; mask < 1 << 4; mask++) {
      const rel = [0, 1, 2, 3].map((i) => !!(mask & (1 << i)));
      expect(relativeBitsOf(invertedFlagsOf(rel))).toEqual(rel);
      expect(invertedFlagsOf(relativeBitsOf(rel))).toEqual(rel);
    }
  });

  it('declares its version', () => {
    expect(HANDOVER_POLARITY_VERSION).toBe('handover-polarity/1.0');
  });
});

describe('H-4b (2) — what the textbook asks of two drawn flanks', () => {
  it('LR2 asks for one reversal and LR4 for none — READ, never re-derived', () => {
    const lr2 = handoverTextbook(band('LR', 2), band('LR', 2));
    const lr4 = handoverTextbook(band('LR', 4), band('LR', 4));
    expect(lr2.inverted).toBe(true);
    expect(lr4.inverted).toBe(false);
    expect(lr2.alignment).toEqual({ kind: 'LR', order: 2 });
    /* The one home of the rule, and the answer must be ITS answer. */
    expect(lr2.inverted).toBe(textbookComplementInverted('LR', 2));
    expect(lr4.inverted).toBe(textbookComplementInverted('LR', 4));
    expect(lr2.why).toContain('180°');
  });

  it('Butterworth and Bessel state NO rule, and say so rather than reading false', () => {
    for (const kind of ['BW', 'BS'] as const) {
      const tb = handoverTextbook(band(kind, 4), band(kind, 4));
      expect(tb.inverted).toBe(false);
      expect(tb.why).toContain('states no polarity rule');
    }
  });

  it('a MISMATCHED pair has no textbook answer, and names both halves (P4)', () => {
    /* The rule is a property of a matched complementary pair. Answering for a
     * woofer LR4 against a mid LR2 would be the A3h failure in its purest
     * form: the right number off the right page, about the wrong thing. */
    const tb = handoverTextbook(band('LR', 4), band('LR', 2));
    expect(tb.inverted).toBeNull();
    expect(tb.alignment).toBeNull();
    expect(tb.why).toContain('LR4');
    expect(tb.why).toContain('LR2');
    expect(tb.why).toContain('MATCHED');
  });

  it('a DISABLED flank has none either, and names which one', () => {
    expect(handoverTextbook(band('LR', 2, 2000, false), band('LR', 2)).why).toContain('low-pass');
    expect(handoverTextbook(band('LR', 2), band('LR', 2, 2000, false)).why).toContain('high-pass');
    expect(handoverTextbook(band('LR', 2, 2000, false), band('LR', 2, 2000, false)).why).toContain('neither');
    for (const tb of [
      handoverTextbook(band('LR', 2, 2000, false), band('LR', 2)),
      handoverTextbook(band('LR', 2), band('LR', 2, 2000, false)),
    ]) {
      expect(tb.inverted).toBeNull();
    }
  });

  it('the deviation note fires only where a rule exists AND is departed from', () => {
    const lr2 = handoverTextbook(band('LR', 2), band('LR', 2));
    const lr4 = handoverTextbook(band('LR', 4), band('LR', 4));
    expect(textbookDeviation(lr2, true)).toBeNull();
    expect(textbookDeviation(lr4, false)).toBeNull();
    expect(textbookDeviation(lr2, false)).toContain('asks for a reversal');
    expect(textbookDeviation(lr4, true)).toContain('asks for no reversal');
    /* No rule, no deviation: a state cannot depart from something nobody
     * stated. */
    expect(textbookDeviation(handoverTextbook(band('LR', 4), band('LR', 2)), true)).toBeNull();
  });
});

describe('H-4b (2b) — the follow, as a value', () => {
  const lr2 = { lowerLp: band('LR', 2), upperHp: band('LR', 2) };
  const lr4 = { lowerLp: band('LR', 4), upperHp: band('LR', 4) };
  const mismatched = { lowerLp: band('LR', 4), upperHp: band('LR', 2) };

  it('a touched handover takes the textbook bit and an untouched one keeps its own', () => {
    /* THE CLAIM THE WHOLE ALGEBRA EXISTS FOR. Two handovers, both currently
     * NOT inverted; the designer re-aligns the lower one to LR2. The lower bit
     * must become true and the upper bit must stay false — in checkbox terms
     * that moves BOTH boxes, and that is the point: the handover nobody
     * touched keeps the relative polarity it had. */
    const out = followTextbookOnAlignmentChange([false, false], [lr2, lr4], [0]);
    expect(out.relative).toEqual([true, false]);
    expect(out.moved).toEqual([0]);
    expect(out.changed).toBe(true);
    /* And in the app's vocabulary: the mid AND the tweeter boxes go on, which
     * is one reversed driver — the mid. */
    expect(invertedFlagsOf(out.relative)).toEqual([true, true]);
  });

  it('is a no-op when the state already agrees, and reports it as one', () => {
    const out = followTextbookOnAlignmentChange([true, false], [lr2, lr4], [0, 1]);
    expect(out.changed).toBe(false);
    expect(out.moved).toEqual([]);
    expect(out.relative).toEqual([true, false]);
  });

  it('leaves a touched handover alone when its flanks state no rule (P4)', () => {
    const out = followTextbookOnAlignmentChange([true, true], [mismatched, lr4], [0, 1]);
    /* Handover 0 has no textbook answer and keeps its true; handover 1 has
     * one and takes it. */
    expect(out.relative).toEqual([true, false]);
    expect(out.moved).toEqual([1]);
  });

  it('settles TWO handovers touched at once instead of letting the second undo the first', () => {
    /* A mid whose high-pass and low-pass both moved in one edit. One pass over
     * the bits, so each lands on its own rule. */
    const out = followTextbookOnAlignmentChange([false, false], [lr2, lr2], [0, 1]);
    expect(out.relative).toEqual([true, true]);
    expect(out.moved).toEqual([0, 1]);
  });

  it('touches nothing it was not told about, and never reaches past the ends', () => {
    expect(followTextbookOnAlignmentChange([false, false], [lr2, lr2], []).changed).toBe(false);
    expect(followTextbookOnAlignmentChange([false], [lr2], [5]).changed).toBe(false);
    expect(followTextbookOnAlignmentChange([false], [lr2], [-1]).changed).toBe(false);
  });

  it('maps a band to its handover: low-pass hands over upward, high-pass downward', () => {
    /* Three ways, two handovers. The lowest way's HIGH-pass and the highest
     * way's LOW-pass belong to no handover at all — they are the outer edges
     * of the system, and a rule about a PAIR has nothing to say about them. */
    expect(handoversOfBand(0, 'lp', 2)).toEqual([0]);
    expect(handoversOfBand(0, 'hp', 2)).toEqual([]);
    expect(handoversOfBand(1, 'hp', 2)).toEqual([0]);
    expect(handoversOfBand(1, 'lp', 2)).toEqual([1]);
    expect(handoversOfBand(2, 'hp', 2)).toEqual([1]);
    expect(handoversOfBand(2, 'lp', 2)).toEqual([]);
    /* Two ways, one handover: the tweeter's high-pass is it. */
    expect(handoversOfBand(1, 'hp', 1)).toEqual([0]);
    expect(handoversOfBand(0, 'lp', 1)).toEqual([0]);
  });
});

describe('H-4b (3) — the reversed-null signature', () => {
  /** A grid dense enough that the handover band holds many points. */
  const freq = Array.from({ length: 401 }, (_, i) => 500 * 2 ** ((i / 400) * 4));

  /** Two equal branches `theta` apart: the sum and its reversal, in dB. */
  const pair = (thetaDeg: number) => {
    const theta = (thetaDeg * Math.PI) / 180;
    const sum = 20 * Math.log10(2 * Math.cos(theta / 2));
    const rev = 20 * Math.log10(2 * Math.abs(Math.sin(theta / 2)));
    return {
      sumDb: freq.map(() => sum),
      reversedDb: freq.map(() => rev),
    };
  };

  it('the margin is DERIVED from the phase unit at the 90° tie, and it is 2.30 dB', () => {
    expect(REVERSED_NULL_MARGIN_DB).toBeCloseTo(Math.abs(nullMarginAtPhaseErrorDeg(PHASE_ERROR_UNIT_DEG)), 12);
    expect(REVERSED_NULL_MARGIN_DB).toBeCloseTo(2.30039, 4);
    /* At the tie itself the two polarities are exactly equal — that is what
     * makes 90° the linearisation point and not an arbitrary one. */
    expect(nullMarginAtPhaseErrorDeg(0)).toBeCloseTo(0, 12);
    /* Before the tie it is positive, past it negative: the sign IS the answer. */
    expect(nullMarginAtPhaseErrorDeg(-15)).toBeGreaterThan(0);
    expect(nullMarginAtPhaseErrorDeg(15)).toBeLessThan(0);
  });

  it('reads a pair 135° apart as a signature and one 45° apart as nothing', () => {
    const on = reversedNullSignature({ pairLabel: 'W-M', ...pair(135), freq, centreHz: 2000 });
    expect(on.signature).toBe(true);
    /* 135°: sum = 2cos(67.5°), rev = 2sin(67.5°) — the margin is
     * 20·log10(cot(67.5°)) = −7.66 dB, by hand. */
    expect(on.marginDb!).toBeCloseTo(20 * Math.log10(1 / Math.tan((67.5 * Math.PI) / 180)), 9);
    expect(on.text).toContain('missing inversion');
    const off = reversedNullSignature({ pairLabel: 'W-M', ...pair(45), freq, centreHz: 2000 });
    expect(off.signature).toBe(false);
    expect(off.text).toBeNull();
    expect(off.marginDb!).toBeGreaterThan(0);
  });

  it('is SILENT inside the margin — 91° apart is a mediocre alignment, not a missing inversion', () => {
    const near = reversedNullSignature({ pairLabel: 'W-M', ...pair(91), freq, centreHz: 2000 });
    expect(near.marginDb!).toBeLessThan(0);
    expect(near.signature).toBe(false);
    expect(near.text).toBeNull();
    /* And just past one unit of phase error it speaks. */
    const past = reversedNullSignature({ pairLabel: 'W-M', ...pair(90 + PHASE_ERROR_UNIT_DEG + 1), freq, centreHz: 2000 });
    expect(past.signature).toBe(true);
  });

  it('reads the HANDOVER BAND and no more — the band the rest of the engine uses', () => {
    const sig = reversedNullSignature({ pairLabel: 'W-M', ...pair(135), freq, centreHz: 2000 });
    expect(sig.bandHz).toEqual(handoverBandHz(2000));
    expect(sig.points).toBe(freq.filter((f) => f >= sig.bandHz[0] && f <= sig.bandHz[1]).length);
    expect(sig.points).toBeGreaterThan(10);
  });

  it('a band with no grid point reads NULL and never a zero (F0)', () => {
    const sig = reversedNullSignature({ pairLabel: 'W-M', ...pair(135), freq, centreHz: 1 });
    expect(sig.points).toBe(0);
    expect(sig.marginDb).toBeNull();
    expect(sig.signature).toBe(false);
    expect(sig.text).toBeNull();
  });

  it('names what the drawn alignment asked for, in both directions', () => {
    const lr2 = handoverTextbook(band('LR', 2), band('LR', 2));
    const lr4 = handoverTextbook(band('LR', 4), band('LR', 4));
    const a = reversedNullSignature({ pairLabel: 'W-M', ...pair(135), freq, centreHz: 2000, textbook: lr2 });
    expect(a.text).toContain('asks for that reversal');
    const b = reversedNullSignature({ pairLabel: 'W-M', ...pair(135), freq, centreHz: 2000, textbook: lr4 });
    expect(b.text).toContain('asks for NO reversal');
    /* And it never claims a change was made. */
    for (const s of [a.text!, b.text!]) expect(s).toContain('Nothing was changed');
  });
});

describe('H-4b (3b) — on a REAL measured response: a deliberately broken LR2, and LR4 beside it', () => {
  /* The unit claims above run on curves built from algebra, which is how the
   * margin gets checked against something other than the code that computes
   * it. These run on a MEASURED response — casus 1's mid, through casus 1b's
   * chain input — because "fires on a broken LR2, silent on LR4" is a claim
   * about loudspeakers and not about cos and sin. */
  const manifest = casus1bManifest();
  const files = casus1bFiles(manifest);
  const g = casus1bChainInput(manifest, files);
  const HZ = 2251.4; // casus 1b's own handover, off its window

  /**
   * One handover as two branches, summed as drawn and reversed.
   *
   * `coLocated` carries BOTH flanks on the same measured way. That is the
   * shape the textbook rule is stated FOR — two sources at one point, so the
   * only phase between them is the filters' — and it is therefore the fixture
   * a rule about filters may be tested on. The other shape, two DIFFERENT
   * measured ways, is the loudspeaker, and what it does to the rule is the
   * second claim here.
   */
  const sums = (order: 2 | 4, inverted: boolean, coLocated: boolean) => {
    const lp = { enabled: true, kind: 'LR' as const, order, freq: HZ };
    const hp = { enabled: true, kind: 'LR' as const, order, freq: HZ };
    const upperWay = coLocated ? g.w : g.t;
    const lo = applyTransfer(
      g.w,
      evalDriverFilter({ gainDb: 0, hp: { ...hp, enabled: false }, lp, eq: [] }, g.w.freq),
    );
    const hi = applyTransfer(
      upperWay,
      evalDriverFilter({ gainDb: 0, hp, lp: { ...lp, enabled: false }, eq: [] }, upperWay.freq),
    );
    const r = combine(lo, hi, { offsetMm: 0, trimDb: 0, inverted });
    return { freq: r.freq, sumDb: r.combinedSpl, reversedDb: r.invertedSpl };
  };
  const read = (order: 2 | 4, inverted: boolean, coLocated: boolean) =>
    reversedNullSignature({
      pairLabel: 'mid-tweeter',
      ...sums(order, inverted, coLocated),
      centreHz: HZ,
      textbook: handoverTextbook(band('LR', order, HZ), band('LR', order, HZ)),
    });

  it('LR2 WITHOUT the reversal the textbook asks for is a signature, and with it silence', () => {
    expect(handoverTextbook(band('LR', 2, HZ), band('LR', 2, HZ)).inverted).toBe(true); // the premise
    const broken = read(2, false, true);
    expect(broken.signature).toBe(true);
    /* Loud, and by an order of magnitude over the margin: 17.8 dB against
     * 2.30. A missing inversion on a pair that tracks is not a close call. */
    expect(broken.marginDb!).toBeCloseTo(-17.8, 1);
    expect(broken.text).toContain('missing inversion');
    expect(broken.text).toContain('asks for that reversal');
    const fixed = read(2, true, true);
    expect(fixed.signature).toBe(false);
    expect(fixed.text).toBeNull();
    expect(fixed.marginDb!).toBeCloseTo(17.8, 1);
  });

  it('LR4 as drawn is silent — and reversed it is the signature, which is the tegenproef', () => {
    /* Without the second half, "silent on LR4" is also true of a check that
     * cannot fire on this fixture at all. */
    const asDrawn = read(4, false, true);
    expect(asDrawn.signature).toBe(false);
    expect(asDrawn.text).toBeNull();
    expect(asDrawn.marginDb!).toBeCloseTo(12.1, 1);
    const flipped = read(4, true, true);
    expect(flipped.signature).toBe(true);
    expect(flipped.marginDb!).toBeCloseTo(-12.1, 1);
    expect(flipped.text).toContain('asks for NO reversal');
  });

  it('ON THE REAL PAIR the rule is worth under two decibels, and the reading says NOTHING', () => {
    /* THE MEASUREMENT THIS SESSION DID NOT EXPECT, and it is the literature's
     * own point in our own numbers. Casus 1b's mid and tweeter sit at
     * different acoustic centres, so at 2251 Hz they are neither in phase nor
     * in anti-phase: the band mean moves only 1.86 dB between the two
     * polarities at LR2 and 1.50 dB at LR4 — where the co-located fixture
     * above moves 17.8 and 12.1. Under the derived margin of 2.30 dB, so all
     * four readings are silent, and that is the RIGHT answer: the phase
     * argument does not separate the arms here, which is exactly why H-4
     * builds the mirrored arm instead of deciding on this number.
     *
     * The threshold was NOT lowered to make this speak. A margin bent until
     * the data trips it measures the bending. */
    for (const order of [2, 4] as const)
      for (const inv of [false, true]) {
        const sig = read(order, inv, false);
        expect(sig.signature).toBe(false);
        expect(sig.text).toBeNull();
        expect(Math.abs(sig.marginDb!)).toBeLessThan(REVERSED_NULL_MARGIN_DB);
      }
    expect(read(2, false, false).marginDb!).toBeCloseTo(-1.86, 2);
    expect(read(4, false, false).marginDb!).toBeCloseTo(1.5, 1);
  });
});

describe('H-4b (4) — the app calls it (source scan, the UI-1 idiom)', () => {
  it('the band form goes through applyVfChange and not straight to setVFilters', () => {
    for (const role of ['woofer', 'mid', 'tweeter']) {
      expect(APP).toContain(`onChange={(${role}) => applyVfChange('${role}', ${role})}`);
      /* The old direct write is GONE: a second door into the same state is a
       * door the rule does not stand behind. */
      expect(APP).not.toContain(`onChange={(${role}) => setVFilters((p) => ({ ...p, ${role} }))}`);
    }
  });

  it('the follow writes the RELATIVE bits back, not one checkbox', () => {
    /* Setting `midInverted` alone to satisfy the woofer-mid rule would flip the
     * mid-tweeter handover as a side effect — a handover the designer did not
     * touch. The scan pins the one helper both callers use. */
    expect(APP).toContain('const writeHandoverRelative');
    expect(APP).toContain('const flags = invertedFlagsOf(rel);');
    const fn = APP.slice(APP.indexOf('const applyVfChange'), APP.indexOf('const applyVfChange') + 2600);
    /* The DECISION is the shared function's and not a second copy in the app
     * — the layer between a rule and the app state is exactly what UI-1 found
     * untested and wrong. */
    expect(fn).toContain('followTextbookOnAlignmentChange(handoverRelative, bands, touched)');
    expect(fn).toContain('writeHandoverRelative(follow.relative)');
    expect(fn).toContain('handoversOfBand(wayIndex');
    /* It follows an ALIGNMENT change and nothing else. */
    expect(fn).toContain('a.kind !== b.kind || a.order !== b.order');
  });

  it('both invert checkboxes print the deviation, and neither is disabled by it', () => {
    expect(APP).toContain("polarityNoteFor('tweeter')");
    expect(APP).toContain("polarityNoteFor('mid')");
    /* Printed, never corrected and never blocked: the box stays the
     * designer's, which is the whole of F0 here. */
    const around = (needle: string) => {
      const i = APP.indexOf(needle);
      return APP.slice(Math.max(0, i - 900), i + 400);
    };
    for (const n of ["polarityNoteFor('tweeter')", "polarityNoteFor('mid')"]) {
      expect(around(n)).toContain('type="checkbox"');
      expect(around(n)).not.toContain('disabled');
    }
  });

  it('the FOLLOW announces itself where the alignment select is, and a manual toggle clears it', () => {
    /* The invert boxes live in the Setup column and the alignment selects in
     * the Filter bands panel: a notice beside the boxes is a notice the
     * designer may never look at, and a polarity that moved unseen is exactly
     * what F0 forbids. */
    expect(APP).toContain('vf-polarity-followed');
    const notice = APP.indexOf('vf-polarity-followed');
    const panel = APP.indexOf('const vfCollapsed');
    expect(notice).toBeGreaterThan(panel);
    /* It sits inside the bands panel's own collapse, beside the mode hint. */
    expect(APP).toContain('{!vfCollapsed && polarityFollowed && (');
    /* And it stops claiming to be the last thing that happened the moment the
     * designer moves a box themselves. */
    const boxes = APP.split('setPolarityFollowed(null)');
    expect(boxes).toHaveLength(3); // both invert checkboxes, and nowhere else
  });

  it('the strip prints the signature, and the app measures no margin of its own', () => {
    expect(APP).toContain('const nullSignatures');
    expect(APP).toContain('nullSignatures.map(');
    expect(APP).toContain('reversedNullSignature({');
    /* One implementation of the margin, and it is not here. */
    expect(APP).not.toContain('REVERSED_NULL_MARGIN_DB');
    expect(APP).not.toContain('nullMarginAtPhaseErrorDeg');
  });

  it('the W-M check flips the WOOFER and the M-T check the TWEETER, never the shared mid', () => {
    /* Flipping the mid would null both crossings at once and read ambiguous —
     * the reason `invertedLowSpl` exists at all. */
    const memo = APP.slice(APP.indexOf('const nullSignatures'), APP.indexOf('const nullSignatures') + 2200);
    expect(memo).toContain('invertedLowSpl');
    expect(memo).toContain('result.invertedSpl');
  });
});
