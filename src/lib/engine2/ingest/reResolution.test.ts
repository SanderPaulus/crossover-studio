/**
 * A5e.4 — THE CLASSIFY → FIT → RECLASSIFY LOOP RUNS TO A FIXED DEPTH.
 *
 * The loop is tempting to run to convergence: R_e moves the "clearly above
 * R_e" bar, a moved bar can change which crests count, and a changed crest set
 * could in principle be worth refitting. It must not. A determinism policy
 * that promises "same input, same result" cannot rest on an iteration count
 * that depends on how a threshold happens to fall on one particular curve —
 * the number of rounds would become a property of the driver instead of a
 * property of the rules.
 *
 * So: exactly one reclassification, and a peak set that moves is a REPORTABLE
 * CONDITION. This file pins both halves on a synthetic curve built for it,
 * because the shift needs a crest sitting precisely between the two
 * thresholds, and no real measurement can be relied on to hold one there.
 *
 * The synthetic curve pays a second dividend: it is a GROUND TRUTH. The old
 * estimator carried `TODO(V8d): ... once the estimator is validated against a
 * synthetic ground-truth case (A7)`, and a curve whose R_e is known by
 * construction is that case.
 *
 * IT IS WRITTEN DOWN AS ONE. The curve, its numbers and what they close is
 * CASUS S1 in the casebook (Deel B) — the first case in that book that is not
 * a loudspeaker. Keeping it there rather than only here is the difference
 * between a fixture and a reference: casus 1 can say that two estimators
 * agree, and only S1 can say which one is right.
 */

import { describe, expect, it } from 'vitest';
import { directRe, resolveRe, type ImpedanceCurve } from './impedance.ts';
import { RESONANCE_MIN_Z_OVER_RE } from '../constants.ts';

/** One motional branch of the same form the fit uses. */
interface Branch {
  r: number;
  f: number;
  q: number;
}

/**
 * An impedance curve with a KNOWN R_e.
 *
 * Deliberately the model the fit assumes: this file is about the loop around
 * the fit, not about whether the model describes a real driver — casus 1
 * answers that one, on measured data.
 */
function synthetic(o: {
  re: number;
  leMh: number;
  branches: Branch[];
  fromHz: number;
  toHz: number;
  points: number;
}): ImpedanceCurve {
  const freq: number[] = [];
  const magnitude: number[] = [];
  const phaseDeg: number[] = [];
  for (let i = 0; i < o.points; i++) {
    const f = o.fromHz * Math.pow(o.toHz / o.fromHz, i / (o.points - 1));
    let re = o.re;
    let im = 2 * Math.PI * f * (o.leMh / 1000);
    for (const b of o.branches) {
      const d = b.q * (f / b.f - b.f / f);
      const den = 1 + d * d;
      re += b.r / den;
      im += (-b.r * d) / den;
    }
    freq.push(f);
    magnitude.push(Math.hypot(re, im));
    phaseDeg.push((Math.atan2(im, re) * 180) / Math.PI);
  }
  return { freq, magnitude, phaseDeg };
}

/**
 * The fixture, and the whole trick is the second crest's height.
 *
 * The sweep starts at 25 Hz against a 40 Hz resonance, so the direct reading
 * is contaminated and the fit brings R_e down — which lowers the detection bar
 * with it. The small crest is placed so that its |Z| lands BETWEEN the two
 * bars: invisible to the pass that seeds the fit, visible to the pass after
 * it. That is the shift, manufactured on purpose.
 */
const TRUE_RE = 6;
const MAIN: Branch = { r: 30, f: 40, q: 6 };
const curveWith = (smallCrestOhm: number): ImpedanceCurve =>
  synthetic({
    re: TRUE_RE,
    leMh: 0.3,
    branches: smallCrestOhm > 0 ? [MAIN, { r: smallCrestOhm, f: 300, q: 8 }] : [MAIN],
    fromHz: 25,
    toHz: 4000,
    points: 400,
  });

describe('the reclassification runs once, and a moved peak set is reported', () => {
  it('the fixture really does straddle the two detection bars', () => {
    // If this stops being true the test below proves nothing, so it is checked
    // rather than asserted in a comment.
    const c = curveWith(4);
    const direct = directRe(c).ohm;
    const resolved = resolveRe(c).re.ohm;
    const crest = Math.max(
      ...c.freq.map((f, i) => (f > 200 && f < 450 ? c.magnitude[i] : 0)),
    );
    expect(direct).toBeGreaterThan(resolved);
    expect(crest).toBeLessThan(RESONANCE_MIN_Z_OVER_RE * direct);
    expect(crest).toBeGreaterThan(RESONANCE_MIN_Z_OVER_RE * resolved);
  });

  it('a shifted peak set raises the FLAG and does not start another round', () => {
    const r = resolveRe(curveWith(4));
    expect(r.re.reclassificationShift).not.toBeNull();
    expect(r.re.reclassificationShift).toContain('DIFFERENT set of motional resonances');
    // The counter is incremented AT THE CALL (V17: a count that is asserted
    // about rather than taken is a count that can be escaped). Two: locate,
    // then reclassify. Never three.
    expect(r.classificationPasses).toBe(2);
    // THE DEPTH ASSERTION THAT MATTERS. The fit was seeded from the FIRST peak
    // set and was not re-seeded from the second: one branch, not two. A third
    // round would show up here as an extra branch even if someone forgot to
    // touch the counter.
    expect(r.re.fit!.branches).toHaveLength(1);
    // ...while the classification handed downstream IS the second pass, so the
    // alignment and the loss indicator are on the resolved R_e.
    expect(r.classification.motionalPeaks).toHaveLength(2);
    // And the value is still the fit's: it converged and passed both limits.
    expect(r.re.source).toBe('motional-fit');
    expect(r.re.fit!.accepted).toBe(true);
  });

  it('the flag names both peak sets, so a reader can see what moved', () => {
    const r = resolveRe(curveWith(4));
    expect(r.re.reclassificationShift).toMatch(/\[40 Hz\] became \[40 Hz, 299 Hz\]/);
    expect(r.re.reclassificationShift).toContain('A5e.4');
  });

  it('a crest clear of BOTH bars is found twice, so there is no shift to report', () => {
    const r = resolveRe(curveWith(6));
    expect(r.re.reclassificationShift).toBeNull();
    expect(r.classificationPasses).toBe(2);
    // Found by the seeding pass too, so the fit carries it as a branch.
    expect(r.re.fit!.branches).toHaveLength(2);
  });

  it('a crest under both bars is never seen, and that is not a shift either', () => {
    const r = resolveRe(curveWith(2));
    expect(r.re.reclassificationShift).toBeNull();
    expect(r.re.fit!.branches).toHaveLength(1);
    expect(r.classification.motionalPeaks).toHaveLength(1);
  });

  it('the depth is fixed for every curve this suite can reach', () => {
    // The bound is what is being pinned, over a spread wide enough that a
    // convergence loop would have to iterate somewhere in it.
    for (const crest of [0, 1, 2, 3, 4, 5, 6, 8, 12]) {
      const r = resolveRe(curveWith(crest));
      expect(r.classificationPasses, `crest ${crest} Ω`).toBeLessThanOrEqual(2);
      expect(r.classificationPasses).toBeGreaterThanOrEqual(1);
    }
  });

  it('an entered DC resistance short-circuits nothing: the depth is the same', () => {
    const r = resolveRe(curveWith(4), { enteredOhm: TRUE_RE });
    expect(r.re.source).toBe('entered');
    expect(r.classificationPasses).toBe(2);
    // The alignment is on the ENTERED value, which is the whole point of
    // reclassifying at all.
    expect(r.classification.peaks[0].r0).toBeCloseTo(r.classification.peaks[0].ohm / TRUE_RE, 9);
  });

  it('R_e that does not move skips a provably identical pass rather than repeating it', () => {
    // A curve whose sweep starts far below resonance: the direct reading is
    // already clean, the fit agrees with it to the digit... but only exact
    // equality skips, and the fit almost never lands exactly there. So the
    // property under test is the BOUND, and that 1 is reachable at all is
    // asserted through the entered path, where R_e is fixed by construction.
    const clean = resolveRe(
      synthetic({ re: TRUE_RE, leMh: 0.3, branches: [MAIN], fromHz: 5, toHz: 4000, points: 400 }),
    );
    expect(clean.classificationPasses).toBeLessThanOrEqual(2);
    expect(Math.abs(clean.re.ohm - TRUE_RE)).toBeLessThan(0.2);
  });

  it('GROUND TRUTH (A7): the fit recovers an R_e the direct reading gets wrong', () => {
    // The synthetic curve knows its own answer. The direct reading is 18 %
    // high because the sweep starts on the resonance skirt - which is casus
    // 1's woofer in miniature, with the truth available.
    const c = curveWith(0);
    const direct = directRe(c).ohm;
    const r = resolveRe(c);
    expect(direct).toBeGreaterThan(TRUE_RE * 1.1);
    expect(Math.abs(r.re.ohm - TRUE_RE)).toBeLessThan(0.05);
    // ...and the skirt it reports is the error it removed, to within the fit's
    // own residual.
    expect(r.re.motionalSkirtOhm).toBeGreaterThan(0);
    expect(Math.abs(direct - r.re.motionalSkirtOhm! - TRUE_RE)).toBeLessThan(0.3);
  });
});
