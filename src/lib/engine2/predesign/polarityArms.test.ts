/**
 * H-4 — de polariteitsarmen: de vier soorten van de metriek-procedure.
 *
 * HANDBEREKENING op een ideaal paar (twee vlakke, fase-nulle wegen op één
 * raster), waar het textbook-antwoord een natuurkundig feit is en niet een
 * conventie: de twee helften van een even-orde Linkwitz-Riley staan 360°/orde
 * uit fase, dus LR4 sommeert in fase en LR2 met één weg omgepoold. De lezing
 * moet dat terugvinden, en dat is tegelijk de controle op
 * `textbookRelativeInverted` — twee onafhankelijke wegen naar hetzelfde
 * antwoord.
 *
 * DE UIT-TOESTANDEN (P4/P2), met het ontbrekende veld bij naam, en de identiteit
 * van een veld dat geen arm zaait — de claim waar elke bestaande
 * run-vingerafdruk aan hangt.
 *
 * NIEUWE MÉTING (V23): een marge die WEL zaait laat het veld aantoonbaar
 * groeien en elke arm apart stempelen; zonder die tegenproef zijn de
 * identiteitsclaims even waar voor een expansie die nergens op aangesloten is.
 *
 * EN DE VERTALING naar de twee ontwerpstappen, positioneel en niet op naam.
 */

import { describe, expect, it } from 'vitest';
import {
  POLARITY_ARM_MARGIN_DEG,
  POLARITY_ARMS_VERSION,
  armFlipMasks,
  expandPolarityArms,
  invertedWaysOf,
  polarityArmsOf,
  polarityLabel,
  polarityMargin,
  polarityMarginReader,
  singleReversalMask,
  statedInvertedForTwoWay,
  statedPolarityForThreeWay,
  textbookRelativeInverted,
} from './polarityArms.ts';
import { PHASE_ERROR_UNIT_DEG } from '../../bandMetrics.ts';
import { candidateFieldKey } from './candidateField.ts';
import type { CandidateCrossing, CandidateField, GeneratedCandidate } from './candidates.ts';
import type { GriddedResponse } from '../../dsp.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..', '..');

/** A flat, zero-phase way on a log grid around `hz`. */
function flatWay(hz: number, n = 400): GriddedResponse {
  const lo = hz / 32;
  const hi = hz * 32;
  const freq = Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));
  return { freq, spl: freq.map(() => 90), phaseDeg: freq.map(() => 0) };
}

function crossing(over: Partial<CandidateCrossing> = {}): CandidateCrossing {
  return {
    pairLabel: 'low→high',
    lower: 'low',
    upper: 'high',
    hz: 2000,
    cageHz: [1800, 2200],
    twoSided: true,
    order: 4,
    alignment: { kind: 'LR', order: 4 },
    windowHz: [1500, 2500],
    floorBy: 'fs',
    ceilingBy: 'breakup',
    segmentHz: [1500, 2500],
    excisions: [],
    position: { index: 0, count: 1, octavesAboveFloor: 0 },
    orderWhy: 'stated',
    provenance: 'derived',
    ...over,
  } as CandidateCrossing;
}

function candidate(crossings: CandidateCrossing[], over: Partial<GeneratedCandidate> = {}): GeneratedCandidate {
  return { label: 'C', crossings, provenance: 'derived', ...over };
}

function field(candidates: GeneratedCandidate[]): CandidateField {
  return {
    candidates,
    axes: [],
    refusals: [],
    notes: [],
    parameters: { minSpacingOctaves: 1 / 3, chainBudget: null, derivedSize: candidates.length, deliveredSize: candidates.length },
  };
}

describe('H-4 — textbook polarity, the rule read and never re-derived', () => {
  it('is the inversion an even-order LR asks for, and nothing else asks for one', () => {
    // 360°/order between the halves: order 2 lands them 180° apart, order 4 in phase.
    expect(textbookRelativeInverted({ kind: 'LR', order: 2 })).toBe(true);
    expect(textbookRelativeInverted({ kind: 'LR', order: 4 })).toBe(false);
    expect(textbookRelativeInverted({ kind: 'LR', order: 1 })).toBe(false);
    expect(textbookRelativeInverted({ kind: 'LR', order: 3 })).toBe(false);
    for (const kind of ['BW', 'BS'] as const)
      for (const order of [1, 2, 3, 4] as const)
        expect(textbookRelativeInverted({ kind, order })).toBe(false);
  });

  it('relative bits become inverted WAYS by accumulating the exclusive or', () => {
    const cs = [
      crossing({ pairLabel: 'low→mid', lower: 'low', upper: 'mid', hz: 300 }),
      crossing({ pairLabel: 'mid→high', lower: 'mid', upper: 'high', hz: 2000 }),
    ];
    // Nothing relative inverted: every way in phase as measured.
    expect(invertedWaysOf(cs, [false, false])).toEqual([]);
    // The FIRST handover inverted: the mid flips, and the tweeter flips with it
    // unless the second handover flips back.
    expect(invertedWaysOf(cs, [true, false])).toEqual(['high', 'mid']);
    expect(invertedWaysOf(cs, [false, true])).toEqual(['high']);
    expect(invertedWaysOf(cs, [true, true])).toEqual(['mid']);
  });

  it('the four arms of a two-handover candidate are four DIFFERENT designs', () => {
    const cs = [
      crossing({ pairLabel: 'low→mid', lower: 'low', upper: 'mid', hz: 300 }),
      crossing({ pairLabel: 'mid→high', lower: 'mid', upper: 'high', hz: 2000 }),
    ];
    const arms = polarityArmsOf(cs, [true, true]);
    expect(arms).toHaveLength(4);
    expect(arms.filter((a) => a.arm === 'textbook')).toHaveLength(1);
    const keys = arms.map((a) => a.invertedWays.join('+'));
    expect(new Set(keys).size).toBe(4);
    // Textbook FIRST — a scan table read top to bottom starts from the design
    // everyone expects.
    expect(arms[0].arm).toBe('textbook');
  });

  it('labels the arm by the way it inverts, and adds nothing when it inverts none', () => {
    expect(polarityLabel([])).toBe('');
    expect(polarityLabel(['mid'])).toBe(' · mid ⌀');
    expect(polarityLabel(['high', 'mid'])).toBe(' · high ⌀ + mid ⌀');
  });

  it('H-4b — the label carries WHICH ARM beside which ways, and the LR2 trap is why', () => {
    /* The mark names the ways a builder solders reversed; it does not name the
     * arm, and on an LR2 field the two say the OPPOSITE of each other. The
     * casebook's own table spells that out and a label is what gets read. */
    expect(polarityLabel([], 'textbook')).toBe(' · textbook');
    expect(polarityLabel(['mid'], 'mirror')).toBe(' · mid ⌀ · mirror');
    expect(polarityLabel(['mid'], 'textbook')).toBe(' · mid ⌀ · textbook');
    const lr2 = polarityArmsOf([crossing({ alignment: { kind: 'LR', order: 2 } })], [true]);
    const lr4 = polarityArmsOf([crossing({ alignment: { kind: 'LR', order: 4 } })], [true]);
    /* The SAME mark, the OTHER arm — which is exactly the reading a label
     * without the word cannot give. */
    const markOf = (arms: ReturnType<typeof polarityArmsOf>, arm: 'textbook' | 'mirror') =>
      polarityLabel(arms.find((a) => a.arm === arm)!.invertedWays);
    expect(markOf(lr2, 'textbook')).toBe(' · high ⌀');
    expect(markOf(lr4, 'mirror')).toBe(' · high ⌀');
    expect(markOf(lr2, 'mirror')).toBe('');
    expect(markOf(lr4, 'textbook')).toBe('');
  });
});

describe('H-4b — the single-driver reversal the exploration always runs', () => {
  it('reverses EXACTLY ONE way, the lowest handover’s upper neighbour, at any N', () => {
    /* Swapping one driver's wires flips the relative polarity of BOTH
     * handovers it takes part in — which is why the guarantee is stated as a
     * driver and computed as a mask over handovers. */
    expect(singleReversalMask(1)).toBe(0b1);
    expect(singleReversalMask(2)).toBe(0b11);
    expect(singleReversalMask(3)).toBe(0b011);
    expect(singleReversalMask(0)).toBe(0);
    const two = [crossing({ pairLabel: 'a', upper: 'mid' }), crossing({ pairLabel: 'b', upper: 'high' })];
    const rel = two.map((x, i) => textbookRelativeInverted(x.alignment) !== !!(singleReversalMask(2) & (1 << i)));
    expect(invertedWaysOf(two, rel)).toEqual(['mid']);
    const three = [
      crossing({ pairLabel: 'a', upper: 'w2' }),
      crossing({ pairLabel: 'b', upper: 'w3' }),
      crossing({ pairLabel: 'c', upper: 'w4' }),
    ];
    const rel3 = three.map((x, i) => textbookRelativeInverted(x.alignment) !== !!(singleReversalMask(3) & (1 << i)));
    expect(invertedWaysOf(three, rel3)).toEqual(['w2']);
  });

  it('joins the margin’s masks instead of replacing them, textbook always first', () => {
    /* Nothing free: the guarantee alone gives two arms. */
    expect(armFlipMasks(2, [false, false], 'single-reversal')).toEqual([0, 0b11]);
    /* One handover free: its own mask AND the guarantee, ascending. */
    expect(armFlipMasks(2, [false, true], 'single-reversal')).toEqual([0, 0b10, 0b11]);
    /* Everything free: the guarantee is already in there and adds nothing. */
    expect(armFlipMasks(2, [true, true], 'single-reversal')).toEqual([0, 1, 2, 3]);
    /* And 'none' is byte for byte the pre-H-4b enumeration (P2). */
    expect(armFlipMasks(2, [false, false])).toEqual([0]);
    expect(armFlipMasks(2, [false, true])).toEqual([0, 0b10]);
    expect(armFlipMasks(2, [true, true])).toEqual([0, 1, 2, 3]);
  });

  it('gives a three-way TWO configurations of four when the margin gates both handovers', () => {
    const cs = [crossing({ pairLabel: 'a', upper: 'mid' }), crossing({ pairLabel: 'b', upper: 'high' })];
    const f = field([candidate(cs, { label: 'A' })]);
    const never = () => ({
      pairLabel: 'p',
      textbookDeg: 10,
      mirrorDeg: 170,
      marginDeg: 160,
      seedMirror: false,
      why: 'no',
    });
    const out = expandPolarityArms(f, {
      seed: 'margin',
      marginFor: never,
      statedAlways: true,
      guarantee: 'single-reversal',
      why: 'w',
    });
    /* THE CLAIM SANDER STATED ON 20-09-2026: the reversed MID is simulated,
     * whatever the phase reading said. Before H-4b this field was one
     * candidate with no arm at all. */
    expect(out.armsAdded).toBe(1);
    expect(out.field.candidates.map((c) => c.label)).toEqual(['A · textbook', 'A · mid ⌀ · mirror']);
    /* And the two the margin kept out are REPORTED and not silent. */
    const gated = out.field.notes.find((n) => n.startsWith('Polarity arms the margin did not admit'));
    expect(gated).toBeDefined();
    expect(gated).toContain('2 of the 4 configurations');
  });

  it('is absent by default, so a policy written before H-4b mirrors exactly what it mirrored', () => {
    const cs = [crossing({ pairLabel: 'a', upper: 'mid' }), crossing({ pairLabel: 'b', upper: 'high' })];
    const f = field([candidate(cs, { label: 'A' })]);
    const never = () => ({ pairLabel: 'p', textbookDeg: 10, mirrorDeg: 170, marginDeg: 160, seedMirror: false, why: 'no' });
    const out = expandPolarityArms(f, { seed: 'margin', marginFor: never, statedAlways: true, why: 'w' });
    /* No guarantee and a reading that refuses everything: NOTHING is mirrored,
     * exactly as before H-4b. */
    expect(out.armsAdded).toBe(0);
    expect(out.field.candidates).toHaveLength(1);
    /* H-5 — WHAT DID MOVE, and it is the whole of the deterministic rule: the
     * one arm that remains now STATES its polarity instead of leaving the
     * design step to enumerate it. The identity is the field with NO POLICY at
     * all, which is what the claim below pins. */
    expect(out.field.candidates[0].polarity?.arm).toBe('textbook');
    expect(out.field.candidates[0].label).toBe('A · textbook');
  });

  it('H-5 — THE IDENTITY IS A FIELD WITH NO POLICY, and that is what every recorded corpus has', () => {
    const cs = [crossing({ pairLabel: 'a', upper: 'mid' }), crossing({ pairLabel: 'b', upper: 'high' })];
    const f = field([candidate(cs, { label: 'A' })]);
    /* `buildCandidateField` applies no expansion at all without a policy, so
     * the field IS its own identity — no label moves, no key moves, and every
     * fingerprint recorded before H-5 reproduces. The claim is stated on the
     * key itself so it cannot be satisfied by a lookalike. */
    expect(JSON.stringify(candidateFieldKey(f))).toBe(JSON.stringify(candidateFieldKey(f)));
    expect(f.candidates.every((c) => c.polarity === undefined)).toBe(true);
    /* And the tegenproef: with a policy the key DOES move, so "absent is the
     * identity" is a statement about absence and not about a policy that does
     * nothing. */
    const armed = expandPolarityArms(f, { seed: 'textbook', statedAlways: false, why: 'w' }).field;
    expect(JSON.stringify(candidateFieldKey(armed))).not.toBe(JSON.stringify(candidateFieldKey(f)));
  });
});

describe('H-4 — the pre-design phase reading', () => {
  const lower = flatWay(2000);
  const upper = flatWay(2000);
  const adjust = { offsetMm: 0, trimDb: 0, inverted: false };

  it('finds the textbook answer on an ideal pair, for BOTH even LR orders', () => {
    // LR4: the halves sum in phase, so NOT inverting is the low-phase-error arm.
    const lr4 = polarityMargin({ pairLabel: 'p', lower, upper, adjust, hz: 2000, alignment: { kind: 'LR', order: 4 } });
    expect(lr4.textbookDeg).not.toBeNull();
    expect(lr4.textbookDeg!).toBeLessThan(lr4.mirrorDeg!);
    // And on an ideal pair it is not close: this is physics, not a preference.
    expect(lr4.marginDeg!).toBeGreaterThan(POLARITY_ARM_MARGIN_DEG);
    expect(lr4.seedMirror).toBe(false);

    // LR2: the halves are 180° apart, so the textbook arm INVERTS — and the
    // reading must agree, which is the second, independent route to the rule
    // `textbookRelativeInverted` states.
    const lr2 = polarityMargin({ pairLabel: 'p', lower, upper, adjust, hz: 2000, alignment: { kind: 'LR', order: 2 } });
    expect(textbookRelativeInverted({ kind: 'LR', order: 2 })).toBe(true);
    expect(lr2.textbookDeg!).toBeLessThan(lr2.mirrorDeg!);
  });

  it('reads ~0° for the textbook arm and ~180° for its mirror on an ideal pair', () => {
    /* THE HANDBEREKENING. Two flat, zero-phase ways summed through an ideal LR
     * pair: the textbook arm is in phase everywhere inside the overlap window
     * and its mirror is exactly out of phase everywhere. Both orders, because
     * the arm that is "textbook" swaps between them — which is the point. */
    for (const order of [2, 4] as const) {
      const m = polarityMargin({
        pairLabel: 'p',
        lower,
        upper,
        adjust,
        hz: 2000,
        alignment: { kind: 'LR', order },
      });
      expect(m.textbookDeg!).toBeCloseTo(0, 6);
      expect(m.mirrorDeg!).toBeCloseTo(180, 6);
      expect(m.marginDeg!).toBeCloseTo(180, 6);
    }
  });

  it('the margin is ONE UNIT OF PHASE ERROR, the scale the objectives share', () => {
    expect(POLARITY_ARM_MARGIN_DEG).toBe(PHASE_ERROR_UNIT_DEG);
    /* AND IT IS THE SAME CONSTANT THE SEARCHES READ, not a copy of its value.
     * Five objectives divided by the literal 15 until H-4 needed a sixth
     * reader; a seventh copy is what this scan exists to prevent. */
    const sources = [
      'threeWayDesign.ts',
      'vfOptimizer.ts',
      'netOptimizer.ts',
    ].map((f) => readFileSync(join(LIB, f), 'utf8'));
    let readers = 0;
    for (const src of sources) {
      expect(src).toContain('PHASE_ERROR_UNIT_DEG');
      readers += src.split('PHASE_ERROR_UNIT_DEG').length - 1;
      // The literal it replaced must be gone from the phase terms.
      expect(src).not.toMatch(/PhaseErrDeg \/ 15\b/);
      expect(src).not.toMatch(/phaseDeg \/ 15\b/);
      expect(src).not.toMatch(/avg \/ 15\b/);
    }
    // One import plus its uses in each file: five uses and three imports.
    expect(readers).toBeGreaterThanOrEqual(8);
  });

  it('a missing response is named, reads nothing and seeds nothing (P4)', () => {
    const read = polarityMarginReader((id) => (id === 'low' ? { response: lower, adjust: {} } : null));
    const m = read(crossing());
    expect(m.textbookDeg).toBeNull();
    expect(m.mirrorDeg).toBeNull();
    expect(m.marginDeg).toBeNull();
    expect(m.seedMirror).toBe(false);
    expect(m.why).toContain('"high"');
    expect(m.why).toContain('P4');
  });

  it('the pair adjustment is the DIFFERENCE between the two ways', () => {
    /* `combineN` adjusts every branch against the LOWEST way, so a pair two
     * ways up hands over on the difference. Read through the reader, because
     * that is where the subtraction lives. */
    const shifted = polarityMarginReader((id) =>
      id === 'low' ? { response: lower, adjust: { offsetMm: 40 } } : { response: upper, adjust: { offsetMm: 40 } },
    )(crossing());
    const zero = polarityMarginReader((id) =>
      id === 'low' ? { response: lower, adjust: {} } : { response: upper, adjust: {} },
    )(crossing());
    expect(shifted.textbookDeg!).toBeCloseTo(zero.textbookDeg!, 9);
    // …and a difference that is NOT zero does move it, or the subtraction is dead.
    const apart = polarityMarginReader((id) =>
      id === 'low' ? { response: lower, adjust: {} } : { response: upper, adjust: { offsetMm: 40 } },
    )(crossing());
    expect(Math.abs(apart.textbookDeg! - zero.textbookDeg!)).toBeGreaterThan(0.5);
  });
});

describe('H-4 — expanding a field, and the identity that protects every fingerprint', () => {
  const cs = [crossing()];
  const f = field([candidate(cs, { label: 'A' }), candidate(cs, { label: 'B' })]);
  const never = () => ({
    pairLabel: 'p',
    textbookDeg: 10,
    mirrorDeg: 170,
    marginDeg: 160,
    seedMirror: false,
    why: 'no',
  });
  const always = () => ({
    pairLabel: 'p',
    textbookDeg: 80,
    mirrorDeg: 85,
    marginDeg: 5,
    seedMirror: true,
    why: 'yes',
  });

  it('a margin that seeds NOTHING mirrors nothing, and every candidate states the textbook arm (H-5)', () => {
    const out = expandPolarityArms(f, { seed: 'margin', marginFor: never, statedAlways: true, why: 'w' });
    expect(out.armsAdded).toBe(0);
    expect(out.field.candidates).toHaveLength(f.candidates.length);
    /* H-5 — the count is untouched and the POLARITY is now stated: the design
     * step is bound on every candidate and never tie-breaks it internally. */
    for (const c of out.field.candidates) expect(c.polarity?.arm).toBe('textbook');
  });

  it('H-5 — the textbook seed mirrors nothing in EITHER mode and still takes the reading', () => {
    let reads = 0;
    const counting = () => {
      reads++;
      return always();
    };
    const out = expandPolarityArms(f, {
      seed: 'textbook',
      marginFor: counting,
      /* U-5's rule does NOT apply under the textbook seed: the designer stated
       * the rule, and a stated position acquiring a mirror would answer a
       * question they had already answered. */
      statedAlways: true,
      why: 'w',
    });
    expect(out.armsAdded).toBe(0);
    expect(out.field.candidates).toHaveLength(f.candidates.length);
    for (const c of out.field.candidates) expect(c.polarity?.arm).toBe('textbook');
    /* The reading is still TAKEN — it decides nothing and the run notes print
     * where a mirror would have been closest, which is what tells a designer
     * when to state `both`. Without it the choice would be blind. */
    expect(reads).toBeGreaterThan(0);
    expect(out.readings.length).toBeGreaterThan(0);
    expect(out.field.notes.some((n) => n.startsWith('Polarity: TEXTBOOK'))).toBe(true);
  });

  it('a margin that DOES seed grows the field and stamps each arm apart (V23)', () => {
    const out = expandPolarityArms(f, { seed: 'margin', marginFor: always, statedAlways: true, why: 'w' });
    expect(out.armsAdded).toBe(2);
    expect(out.field.candidates).toHaveLength(4);
    expect(out.field.candidates.map((c) => c.label)).toEqual([
      'A · textbook',
      'A · high ⌀ · mirror',
      'B · textbook',
      'B · high ⌀ · mirror',
    ]);
    for (const c of out.field.candidates) expect(c.polarity).toBeDefined();
    const key = JSON.stringify(candidateFieldKey(out.field));
    expect(key).not.toBe(JSON.stringify(candidateFieldKey(f)));
    // Two arms at one position are two designs, and the key says so.
    expect(key).toContain('"inverted":["high"]');
    expect(key).toContain('"inverted":[]');
  });

  it("'both' seeds every handover whatever the margin said", () => {
    const out = expandPolarityArms(f, { seed: 'both', marginFor: never, statedAlways: true, why: 'w' });
    expect(out.armsAdded).toBe(2);
  });

  it('a STATED position gets both arms even when the margin refuses (U-5)', () => {
    const statedF = field([
      candidate(cs, { label: 'A' }),
      candidate(cs, {
        label: 'S',
        stated: {
          statedOn: 'today',
          outsideWindow: false,
          perCrossing: [],
          provenance: 'stated by you',
        },
      }),
    ]);
    const out = expandPolarityArms(statedF, { seed: 'margin', marginFor: never, statedAlways: true, why: 'w' });
    /* H-5 — the DERIVED candidate now states its textbook arm too; what the
     * stated position still gets that it does not is the MIRROR. */
    expect(out.field.candidates.map((c) => c.label)).toEqual([
      'A · textbook',
      'S · textbook',
      'S · high ⌀ · mirror',
    ]);
    const off = expandPolarityArms(statedF, { seed: 'margin', marginFor: never, statedAlways: false, why: 'w' });
    expect(off.armsAdded).toBe(0);
  });

  it('a frequency carried at TWO alignments is TWO readings, not one', () => {
    /* The reading applies the crossing's IDEAL FILTER, so the alignment is part
     * of what is read. Measured on the demo's full field before this was
     * written down: low→mid at 466.7 Hz reads a 10.0° margin at one alignment
     * and 25.7° at another, and a key without the alignment printed the first
     * while the second decided. */
    const two = field([
      candidate([crossing({ alignment: { kind: 'LR', order: 4 } })], { label: 'A' }),
      candidate([crossing({ alignment: { kind: 'LR', order: 2 } })], { label: 'B' }),
    ]);
    const out = expandPolarityArms(two, {
      seed: 'both',
      marginFor: (x) => ({ ...always(), pairLabel: `${x.pairLabel} ${x.alignment.kind}${x.alignment.order}` }),
      statedAlways: true,
      why: 'w',
    });
    expect(out.readings).toHaveLength(2);
    expect(out.readings.map((r) => r.pairLabel)).toEqual(['low→high LR4', 'low→high LR2']);
  });

  it('reads each distinct crossing once, and prints what it read', () => {
    let calls = 0;
    const out = expandPolarityArms(f, {
      seed: 'both',
      marginFor: () => {
        calls++;
        return always();
      },
      statedAlways: true,
      why: 'w',
    });
    expect(calls).toBe(2); // once per candidate…
    expect(out.readings).toHaveLength(1); // …deduped to one distinct crossing.
    expect(out.field.notes.join(' ')).toContain('yes');
  });
});

describe('H-4 — the translation into each design step, positionally', () => {
  it('the three-way bits are the accumulated relative polarity', () => {
    const cs = [
      crossing({ pairLabel: 'low→mid', lower: 'low', upper: 'mid', hz: 300 }),
      crossing({ pairLabel: 'mid→high', lower: 'mid', upper: 'high', hz: 2000 }),
    ];
    const arms = polarityArmsOf(cs, [true, true]);
    for (const a of arms) {
      const s = statedPolarityForThreeWay(a);
      /* The design step names its bits after the SLOTS it designs for, so the
       * two descriptions of one arm must agree: mid inverted iff 'mid' is in
       * the set, tweeter iff 'high' is. */
      expect(s.midInverted).toBe(a.invertedWays.includes('mid'));
      expect(s.tweeterInverted).toBe(a.invertedWays.includes('high'));
    }
  });

  it('the two-way bit is the single handover’s own relative polarity', () => {
    const arms = polarityArmsOf([crossing()], [true]);
    expect(statedInvertedForTwoWay(arms[0])).toBe(false);
    expect(statedInvertedForTwoWay(arms[1])).toBe(true);
  });

  it('carries a version string', () => {
    expect(POLARITY_ARMS_VERSION).toMatch(/^polarity-arms\/\d+\.\d+$/);
  });
});
