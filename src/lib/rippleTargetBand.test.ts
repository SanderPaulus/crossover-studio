/**
 * E-5b — the band the staged pass's ripple stop-goal is read on, as claims.
 *
 * Four kinds, the way the metric skill asks for them: the rule by hand on round
 * numbers, the states in which it refuses to produce a band, the identity that
 * keeps every v1 run unchanged, and the wiring — that the two chains derive it
 * and that the tuner's stop test is the only thing that reads it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RIPPLE_STOP_MARGIN_OCTAVES,
  describeRippleStopBand,
  rippleStopBand,
} from './rippleTargetBand.ts';
import { CHOICE_KEYS, POLISH_KEYS } from './engine2/optimizer/choices.ts';

const NET = readFileSync(join(process.cwd(), 'src', 'lib', 'netOptimizer.ts'), 'utf-8');

describe('E-5b — the stop-goal’s band, by hand', () => {
  it('half an octave below the LOWEST handover, up to the judged ceiling', () => {
    // 400 Hz down half an octave is 400/√2 = 282.84…; the ceiling is untouched.
    // `2 ** -0.5` and `1 / Math.SQRT2` differ in the last bit, so the floor is
    // compared as a number and the ceiling as the identity it is.
    const band = rippleStopBand([400], [50, 20000])!;
    expect(band[0]).toBeCloseTo(400 / Math.SQRT2, 9);
    expect(band[1]).toBe(20000);
    expect(RIPPLE_STOP_MARGIN_OCTAVES).toBe(0.5);
  });

  it('the LOWEST of several handovers decides it', () => {
    const a = rippleStopBand([400, 2000], [50, 20000])!;
    const b = rippleStopBand([2000, 400], [50, 20000])!;
    expect(a).toEqual(b);
    expect(a[0]).toBeCloseTo(400 / Math.SQRT2, 9);
  });

  it('CLIPPED to the judged band: it may never reach below its own data', () => {
    // A handover barely above the judged floor would put the band under it.
    const band = rippleStopBand([60], [52.4, 19500])!;
    expect(band[0]).toBe(52.4);
    expect(band[1]).toBe(19500);
  });

  it('no usable handover, no band — and nothing is invented (P4)', () => {
    for (const bad of [[], [null], [undefined], [0], [-100], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
      expect(rippleStopBand(bad as readonly (number | null)[], [50, 20000]), JSON.stringify(bad)).toBeNull();
    }
  });

  it('a band that is not below the ceiling is no band', () => {
    expect(rippleStopBand([100000], [50, 20000])).toBeNull();
  });

  it('the sentence names the RULE, and the other branch says what stayed', () => {
    const armed = describeRippleStopBand(rippleStopBand([400], [50, 20000]), [50, 20000]);
    expect(armed).toContain('lowest handover');
    expect(armed).toContain(String(RIPPLE_STOP_MARGIN_OCTAVES));
    expect(armed).toContain('escalation');
    const bare = describeRippleStopBand(null, [50, 20000]);
    expect(bare).toContain('whole judged band');
  });
});

describe('E-5b — what reads it, and what does not', () => {
  it('the choice is a CHOICE and the band is POLISH', () => {
    expect(CHOICE_KEYS as readonly string[]).toContain('rippleTargetBand');
    expect(POLISH_KEYS as readonly string[]).toContain('rippleTargetBandHz');
    expect(POLISH_KEYS as readonly string[]).not.toContain('rippleTargetBand');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('rippleTargetBandHz');
  });

  it('ONLY the staged stop test reads the narrower band', () => {
    /* The claim that keeps this from becoming a second definition of ripple:
     * every comparison against the staged TARGET reads `rippleStopPeakDb`, and
     * everything else — the report, the strip, the regression re-check — goes
     * on reading `ripplePeakDb` over the judged band. */
    const target = [...NET.matchAll(/\.(ripplePeakDb|rippleStopPeakDb)\s*[<>]=?\s*(?:opts\.staged|tgt)\.rippleDb/g)];
    expect(target.length).toBeGreaterThan(4);
    for (const m of target) expect(m[1], m[0]).toBe('rippleStopPeakDb');
    // The network-against-network re-check is NOT a stop test and must not move.
    expect(NET).toContain('m.ripplePeakDb <= ref.ripplePeakDb + 0.1');
    // And the barrier still presses on the judged band (considered, not taken).
    expect(NET).toContain('Math.max(0, m.ripplePeakDb - barrier.rippleDb * 0.92)');
  });

  it('the two chains derive it, and neither decides anything with it', () => {
    for (const f of ['threeWayChain.ts', 'designChain.ts']) {
      const src = readFileSync(join(process.cwd(), 'src', 'lib', f), 'utf-8');
      expect(src, f).toContain('rippleStopBand(');
      expect(src, f).toContain('rippleTargetBandHz');
      // The CHOICE never comes from a chain: it may only come from a candidate.
      expect(src, f).not.toContain('rippleTargetBand:');
    }
  });

  it('absent is the identity: the tuner falls back to the judged band, in one place', () => {
    expect(NET).toContain("opts.rippleTargetBand === 'from-lowest-crossing' && opts.rippleTargetBandHz");
    expect(NET).toContain('const stopBandNarrowed = stopBand !== band;');
    // And a run that narrowed it says so where it says which band it optimised on.
    expect(NET).toContain('the staged ripple stop-goal was read on');
  });
});
