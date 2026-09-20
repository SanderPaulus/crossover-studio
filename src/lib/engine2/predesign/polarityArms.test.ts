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
  expandPolarityArms,
  invertedWaysOf,
  polarityArmsOf,
  polarityLabel,
  polarityMargin,
  polarityMarginReader,
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

  it('a margin that seeds NOTHING leaves every candidate exactly as it was (P2)', () => {
    const out = expandPolarityArms(f, { seed: 'margin', marginFor: never, statedAlways: true, why: 'w' });
    expect(out.armsAdded).toBe(0);
    expect(out.field.candidates).toEqual(f.candidates);
    for (const c of out.field.candidates) expect(c.polarity).toBeUndefined();
    /* THE CLAIM EVERY RECORDED RUN FINGERPRINT HANGS ON: no polarity key is
     * written, so the field keys byte for byte as it did before H-4. */
    expect(JSON.stringify(candidateFieldKey(out.field))).toBe(JSON.stringify(candidateFieldKey(f)));
  });

  it('a margin that DOES seed grows the field and stamps each arm apart (V23)', () => {
    const out = expandPolarityArms(f, { seed: 'margin', marginFor: always, statedAlways: true, why: 'w' });
    expect(out.armsAdded).toBe(2);
    expect(out.field.candidates).toHaveLength(4);
    expect(out.field.candidates.map((c) => c.label)).toEqual(['A', 'A · high ⌀', 'B', 'B · high ⌀']);
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
    expect(out.field.candidates.map((c) => c.label)).toEqual(['A', 'S', 'S · high ⌀']);
    const off = expandPolarityArms(statedF, { seed: 'margin', marginFor: never, statedAlways: false, why: 'w' });
    expect(off.armsAdded).toBe(0);
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
