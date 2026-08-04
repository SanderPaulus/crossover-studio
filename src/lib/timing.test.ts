import { describe, it, expect } from 'vitest';
import {
  unwrapPhaseDeg,
  estimateBulkDelay,
  checkTimingOffset,
  assessSharedReference,
  assessPairTimeBase,
  type BulkDelayEstimate,
} from './timing.ts';

/** Wrap a degree value into (-180, 180]. */
function wrap(deg: number): number {
  let d = ((deg + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

/** Log-spaced frequency axis. */
function logFreq(fLow: number, fHigh: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(fLow * (fHigh / fLow) ** (i / (n - 1)));
  }
  return out;
}

describe('unwrapPhaseDeg', () => {
  it('removes a single wrap crossing', () => {
    const unwrapped = unwrapPhaseDeg([170, -170]);
    expect(unwrapped[0]).toBe(170);
    expect(unwrapped[1]).toBeCloseTo(190, 9); // +360 restored
  });

  it('leaves an already-continuous signal untouched', () => {
    const p = [0, 10, 20, 30];
    expect(unwrapPhaseDeg(p)).toEqual(p);
  });
});

describe('estimateBulkDelay', () => {
  it('recovers a known pure delay from wrapped phase', () => {
    const tau = 0.35e-3; // 0.35 ms
    const freq = logFreq(100, 20000, 400);
    const phase = freq.map((f) => wrap(-360 * f * tau));

    const est = estimateBulkDelay(freq, phase);
    expect(est.delaySeconds).toBeCloseTo(tau, 6);
    expect(est.delayMs).toBeCloseTo(0.35, 4);
    expect(est.rSquared).toBeGreaterThan(0.999);
  });

  it('reports low R² when phase is not delay-like', () => {
    const freq = logFreq(100, 20000, 400);
    // Random-ish phase with no consistent slope.
    const phase = freq.map((f) => wrap(60 * Math.sin(f / 800)));
    const est = estimateBulkDelay(freq, phase);
    expect(est.rSquared).toBeLessThan(0.9);
  });
});

describe('checkTimingOffset', () => {
  const tau = 0.5e-3;
  const freq = logFreq(100, 20000, 400);
  const phase = freq.map((f) => wrap(-360 * f * tau));

  it('passes when declared matches the phase-derived delay', () => {
    const r = checkTimingOffset(freq, phase, { declaredMs: 0.5 });
    expect(r.verdict).toBe('ok');
    expect(r.differenceMs).toBeLessThan(0.05);
  });

  it('flags a mismatch that would otherwise stay silent', () => {
    const r = checkTimingOffset(freq, phase, { declaredMs: 0.2 });
    expect(r.verdict).toBe('mismatch');
    expect(r.differenceMs).toBeCloseTo(0.3, 2);
    expect(r.message).toMatch(/MISMATCH/);
  });

  it('refuses to trust the estimate when the fit is poor', () => {
    const messy = freq.map((f) => wrap(90 * Math.sin(f / 500)));
    const r = checkTimingOffset(freq, messy, { declaredMs: 0.5 });
    expect(r.verdict).toBe('unreliable');
  });

  it('reports no-reference when no declared value is given', () => {
    const r = checkTimingOffset(freq, phase, {});
    expect(r.verdict).toBe('no-reference');
    expect(r.estimate.delayMs).toBeCloseTo(0.5, 3);
  });
});

describe('assessSharedReference', () => {
  const est = (delayMs: number, rSquared = 0.999) =>
    ({
      delaySeconds: delayMs / 1000,
      delayMs,
      slopeDegPerHz: -0.36 * delayMs,
      rSquared,
      band: [500, 5000] as [number, number],
      sampleCount: 100,
    });

  it('accepts a geometry-sized delta and reports apparent distances', () => {
    const r = assessSharedReference(est(1.708), est(1.755));
    expect(r.verdict).toBe('plausible');
    expect(r.deltaUs).toBeCloseTo(47, 0);
    expect(r.deltaMm).toBeCloseTo(16.1, 1);
    expect(r.apparentDistanceM.woofer).toBeCloseTo(0.586, 3);
    expect(r.apparentDistanceM.tweeter).toBeCloseTo(0.602, 3);
  });

  it('flags a re-referenced time axis as suspect', () => {
    // One file re-referenced to t=0 at the IR peak: its bulk delay collapses.
    const r = assessSharedReference(est(1.708), est(0.02));
    expect(r.verdict).toBe('suspect');
    expect(r.message).toMatch(/do not trust/i);
  });

  it('reports the delta signed (tweeter minus woofer)', () => {
    const r = assessSharedReference(est(1.755), est(1.708));
    expect(r.deltaUs).toBeCloseTo(-47, 0);
    expect(r.verdict).toBe('plausible');
  });

  it('refuses to judge on a poor fit', () => {
    const r = assessSharedReference(est(1.708), est(1.755, 0.5));
    expect(r.verdict).toBe('unreliable');
    expect(r.message).toMatch(/tweeter R²=0.500/);
  });

  it('honours a custom geometry threshold', () => {
    const r = assessSharedReference(est(1.7), est(1.9), { maxGeometryUs: 100 });
    expect(r.verdict).toBe('suspect');
    const r2 = assessSharedReference(est(1.7), est(1.9), { maxGeometryUs: 250 });
    expect(r2.verdict).toBe('plausible');
  });
});

describe('excess-phase delay vs raw bulk delay (the minimum-phase bridge)', () => {
  // THE lesson (jul 2026, Sanders "moet het niet −47 µs zijn?"): the raw
  // bulk-delay fit absorbs each driver's minimum-phase slope, so its Δ is NOT
  // the acoustic-centre offset a minimum-phase consumer (VituixCAD Delay, our
  // .vxp export) must re-apply. On the real KOAN measurements the raw fit says
  // tweeter +47 µs LATER while the excess-phase fit (measured − minimum phase)
  // says ~50 µs EARLIER — opposite SIGNS — and only the excess-based bridge
  // reproduces the measured relative phase (~2° vs ~78° error).
  it('KOAN: raw Δ and excess Δ have opposite signs', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { parseFrd } = await import('./parsers/frd.ts');
    const { logspace, resample } = await import('./dsp.ts');
    const { minimumPhaseDeg } = await import('./minphase.ts');

    const FIX = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
    const mid = parseFrd(readFileSync(join(FIX, 'mid_hor0_mettape.txt'), 'utf-8'));
    const tw = parseFrd(readFileSync(join(FIX, 'tweet_hor0_mettape.txt'), 'utf-8'));

    const raw = (f: ReturnType<typeof parseFrd>) =>
      estimateBulkDelay(f.freq, f.phase, [
        Math.max(500, f.freq[0]),
        Math.min(5000, f.freq[f.freq.length - 1]),
      ]).delayMs;
    const excess = (f: ReturnType<typeof parseFrd>) => {
      const lo = Math.max(500, f.freq[0] * 1.05);
      const hi = Math.min(5000, f.freq[f.freq.length - 1] * 0.95);
      const g = resample(f.freq, f.spl, f.phase, logspace(lo, 20000, 400));
      const mp = minimumPhaseDeg(g.freq, g.spl);
      return estimateBulkDelay(g.freq, g.phaseDeg.map((p, i) => p - mp[i]), [lo, hi]).delayMs;
    };

    const rawDeltaUs = (raw(tw) - raw(mid)) * 1000;
    const excessDeltaUs = (excess(tw) - excess(mid)) * 1000;

    // Raw: tweeter appears ~47 µs LATER. Excess: tweeter is ~50 µs EARLIER.
    expect(rawDeltaUs).toBeGreaterThan(40);
    expect(rawDeltaUs).toBeLessThan(55);
    expect(excessDeltaUs).toBeLessThan(-40);
    expect(excessDeltaUs).toBeGreaterThan(-60);
  });
});

describe('assessPairTimeBase — per-pair verdict on excess phase', () => {
  const est = (delayUs: number, r2: number): BulkDelayEstimate => ({
    delaySeconds: delayUs * 1e-6,
    delayMs: delayUs * 1e-3,
    rSquared: r2,
    slopeDegPerHz: 0,
    band: [3000, 8000],
    sampleCount: 100,
  });
  const names = { lower: 'mid', upper: 'tweeter' };
  const band: [number, number] = [3000, 8000];

  it('a small, well-fitted difference is baffle geometry — plausible', () => {
    // Robbert's measured case: mid −21 µs, tweeter +12 µs, both clean fits.
    const r = assessPairTimeBase({ lower: est(-21, 0.999), upper: est(12, 0.989), band, names });
    expect(r.verdict).toBe('plausible');
    expect(r.deltaUs).toBeCloseTo(33, 6);
    expect(r.deltaMm).toBeCloseTo(33e-6 * 343 * 1000, 3);
    expect(r.message).toMatch(/share a time base/);
  });

  it('a millisecond-scale jump is a broken time base — suspect', () => {
    const r = assessPairTimeBase({ lower: est(0, 0.99), upper: est(1500, 0.99), band, names });
    expect(r.verdict).toBe('suspect');
    expect(r.message).toMatch(/re-referenced|different session/);
  });

  it('a poor fit refuses to judge rather than guessing', () => {
    const r = assessPairTimeBase({ lower: est(-21, 0.5), upper: est(12, 0.99), band, names });
    expect(r.verdict).toBe('unreliable');
    expect(r.message).toMatch(/not delay-like/);
    // It still reports WHICH driver failed, and over which band.
    expect(r.message).toMatch(/mid R²/);
    expect(r.message).toMatch(/3000–8000 Hz/);
  });

  it('the sign convention is upper − lower (positive = upper later)', () => {
    const later = assessPairTimeBase({ lower: est(0, 0.99), upper: est(50, 0.99), band, names });
    expect(later.deltaUs).toBeGreaterThan(0);
    const earlier = assessPairTimeBase({ lower: est(50, 0.99), upper: est(0, 0.99), band, names });
    expect(earlier.deltaUs).toBeLessThan(0);
  });
});
