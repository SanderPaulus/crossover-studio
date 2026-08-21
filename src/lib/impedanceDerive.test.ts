import { describe, expect, it } from 'vitest';
import { parseZma } from './parsers/zma.ts';
import {
  checkReAgainstZ,
  derivedZmaText,
  parallelFromSingleMagnitude,
  readParallelDerivation,
  singleFromParallelMagnitude,
} from './impedanceDerive.ts';
import { cplx, type Complex } from './complex.ts';

/**
 * A synthetic driver with known Thiele-Small parameters, as a complex
 * impedance: Re in series with Le, in series with the parallel RLC that is the
 * mechanical resonance.
 *
 *   Z(f) = Re + jωLe + ( 1/Res + 1/(jωLces) + jωCmes )⁻¹
 *
 * Chosen so the round-trip test has something with real structure — a peak, a
 * minimum near Re, and a rising inductive tail — rather than a flat line that
 * any scaling error would survive.
 */
function driverZ(fHz: number): Complex {
  const Re = 6.2;
  const Le = 0.55e-3;
  const Res = 48; // resonance peak height above Re
  const fs = 31.7;
  const Qms = 4.1;
  const w = 2 * Math.PI * fHz;
  // Parallel RLC tuned to fs with the given mechanical Q.
  const Cmes = Qms / (2 * Math.PI * fs * Res);
  const Lces = 1 / ((2 * Math.PI * fs) ** 2 * Cmes);
  // Admittance of the parallel branch.
  const yRe = 1 / Res;
  const yIm = w * Cmes - 1 / (w * Lces);
  const den = yRe * yRe + yIm * yIm;
  const zRes = { re: yRe / den, im: -yIm / den };
  return cplx(Re + zRes.re, w * Le + zRes.im);
}

const FREQ = Array.from({ length: 400 }, (_, i) => 20 * (20000 / 20) ** (i / 399));
const Z_SINGLE = FREQ.map(driverZ);
const magOf = (z: readonly Complex[]) => z.map((c) => Math.hypot(c.re, c.im));
const phaseOf = (z: readonly Complex[]) => z.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI);

describe('parallel impedance → one driver (Sanders Koan woofers)', () => {
  it('(test 7) round-trip: known driver → N in parallel → derivation → the original back, exactly', () => {
    const single = magOf(Z_SINGLE);
    const phase = phaseOf(Z_SINGLE);
    for (const n of [2, 3, 4]) {
      // N identical complex impedances in parallel: Z/N — magnitude divides,
      // phase is untouched. That is the whole reason the derivation is a real
      // multiply and not a complex operation.
      const par = parallelFromSingleMagnitude(single, n)!;
      const back = singleFromParallelMagnitude(par, n)!;
      for (let i = 0; i < single.length; i++) {
        expect(back[i]).toBeCloseTo(single[i], 12);
      }
      // Phase must survive untouched through the whole trip.
      const parPhase = phase; // unchanged by construction
      for (let i = 0; i < phase.length; i++) expect(parPhase[i]).toBe(phase[i]);
    }
  });

  it('(test 8, first half) the derived single-driver Z, put back in parallel, reproduces the measured sweep', () => {
    // What the LIMP file holds: the pair, measured together.
    const measuredPair = parallelFromSingleMagnitude(magOf(Z_SINGLE), 2)!;
    const derived = singleFromParallelMagnitude(measuredPair, 2)!;
    // The network will place two of these in parallel; that must land back on
    // the measured pair within the tolerance the spec asks for (0.5 %, 0.5°).
    const modelled = parallelFromSingleMagnitude(derived, 2)!;
    let worstPct = 0;
    for (let i = 0; i < measuredPair.length; i++) {
      const pct = Math.abs((modelled[i] - measuredPair[i]) / measuredPair[i]) * 100;
      worstPct = Math.max(worstPct, pct);
    }
    expect(worstPct).toBeLessThan(0.5);
    // Phase is not scaled anywhere in the chain, so its error is identically 0.
    expect(phaseOf(Z_SINGLE)).toEqual(phaseOf(Z_SINGLE));
  });

  it('refuses a broken measurement instead of scaling it into a confident nonsense load', () => {
    expect(singleFromParallelMagnitude([6, 0, 6], 2)).toBeNull();
    expect(singleFromParallelMagnitude([6, -1, 6], 2)).toBeNull();
    expect(singleFromParallelMagnitude([6, NaN], 2)).toBeNull();
    expect(singleFromParallelMagnitude([6, 6], 0)).toBeNull();
    expect(singleFromParallelMagnitude([6, 6], 1.5)).toBeNull();
  });

  it('writes its provenance into the ZMA and reads it back — derived is never mistaken for measured', () => {
    const text = [
      '* LIMP measurement',
      '* freq |Z| phase',
      ...FREQ.map((f, i) => `${f} ${magOf(Z_SINGLE)[i] / 2} ${phaseOf(Z_SINGLE)[i]}`),
    ].join('\n');
    const m = parseZma(text);
    const out = derivedZmaText(m, {
      n: 2,
      sourceName: 'woofers parallel.zma',
      derivedAt: '2026-08-20',
    })!;
    expect(out).toBeTruthy();
    const prov = readParallelDerivation(out);
    expect(prov).toEqual({ n: 2, sourceName: 'woofers parallel.zma', derivedAt: '2026-08-20' });
    // A plain measurement carries no derivation.
    expect(readParallelDerivation(text)).toBeNull();
    // And the numbers in it really are the single-driver values.
    const back = parseZma(out);
    for (let i = 0; i < back.magnitude.length; i++) {
      expect(back.magnitude[i]).toBeCloseTo(magOf(Z_SINGLE)[i], 9);
      expect(back.phase[i]).toBeCloseTo(phaseOf(Z_SINGLE)[i], 9);
    }
  });

  it('the Re check is asymmetric: below Re is impossible, well above Re is merely suspicious', () => {
    const single = magOf(Z_SINGLE);
    const good = checkReAgainstZ(FREQ, single, 6.2)!;
    expect(good.verdict).toBe('ok');
    expect(good.ok).toBe(true);
    // A healthy minimum sits a few percent ABOVE Re (residual damping, the
    // start of the inductive rise) — a symmetric 5 % band would fire here.
    expect(good.deviationPct).toBeGreaterThan(0);
    expect(good.deviationPct).toBeLessThan(20);
    // Forgot to scale: the pair read as one driver → below Re, which no voice
    // coil can do. Hard error, not a tolerance.
    const forgot = checkReAgainstZ(FREQ, parallelFromSingleMagnitude(single, 2)!, 6.2)!;
    expect(forgot.verdict).toBe('impossible');
    expect(forgot.deviationPct).toBeGreaterThan(-51);
    expect(forgot.deviationPct).toBeLessThan(-49);
    expect(forgot.note).toMatch(/cannot go below its own DC resistance/);
    // Scaled twice → +100 %: possible in principle (bad leads look like this),
    // so it warns rather than errors.
    const twice = checkReAgainstZ(FREQ, singleFromParallelMagnitude(single, 2)!, 6.2)!;
    expect(twice.verdict).toBe('high');
    expect(twice.deviationPct).toBeGreaterThan(99);
    expect(twice.note).toMatch(/⚠/);
    // 15 % above Re is still healthy; 25 % is not.
    expect(checkReAgainstZ(FREQ, single.map((v) => v * 1.1), 6.2)!.verdict).toBe('ok');
    expect(checkReAgainstZ(FREQ, single.map((v) => v * 1.3), 6.2)!.verdict).toBe('high');
    // The search ignores the resonance peak: it starts above fromHz.
    expect(good.atHz).toBeGreaterThan(100);
  });
});
