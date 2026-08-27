/**
 * AUDIT §6.3, AS A TEST — the two floors, and the fact that neither wins.
 *
 * The numbers are the audit's own: 396.7 Hz from A5d.3 (measurement validity of
 * the MID's far field) against 707 Hz from the v1 physics window (the WOOFER's
 * near-field/far-field splice blend). Written as constants of the test rather
 * than of the module, because they belong to one project and this module
 * belongs to none.
 */

import { describe, expect, it } from 'vitest';
import { compareFloors, type FloorClaim } from './floorComparison.ts';

const V2: FloorClaim = {
  layer: 'Engine v2 (A5d.3)',
  hz: 396.7,
  source: 'measurement validity (mid far field)',
  subject: 'validity',
};
const V1: FloorClaim = {
  layer: 'the v1 physics window',
  hz: 707,
  source: 'above the near-field splice blend (500 Hz ± 0.5 oct)',
  subject: 'data',
};

describe('the two floors are reported, never reconciled', () => {
  const r = compareFloors('woofer → mid', V2, V1, [396.7, 549.7]);

  it('both numbers and both provenances are in the sentence', () => {
    expect(r.message).toContain('397');
    expect(r.message).toContain('707');
    expect(r.message).toContain('measurement validity');
    expect(r.message).toContain('splice blend');
  });

  it('it says which one steered the candidates', () => {
    expect(r.steering).toBe(V2);
    expect(r.counter).toBe(V1);
    expect(r.message).toMatch(/generated against Engine v2 \(A5d\.3\)'s floor/);
  });

  it('it refuses to pick, and says why refusing is the answer', () => {
    // The audit's own argument, and the reason this module exists: the v1 value
    // won because it came first in the pipeline, not because it was better.
    expect(r.message).toMatch(/different questions/);
    expect(r.message).toMatch(/BELIEVED/);
    expect(r.message).toMatch(/SIT/);
    expect(r.message).toMatch(/pipeline/);
    // No verdict field anywhere that a caller could read as "use this one".
    expect(Object.keys(r)).not.toContain('winner');
  });

  it('the disagreement is measured in octaves, and the direction is named', () => {
    expect(r.agreement).toBe('v1-stricter');
    expect(r.octavesApart!).toBeCloseTo(Math.log2(707 / 396.7), 6);
  });

  it('a candidate band that reaches under the counter-floor gets the warning', () => {
    expect(r.warning).toMatch(/would have refused/);
    expect(r.warning).toContain('707');
  });

  it('a candidate band entirely above the counter-floor does NOT get it', () => {
    const clean = compareFloors('woofer → mid', V2, V1, [800, 1200]);
    expect(clean.agreement).toBe('v1-stricter');
    expect(clean.warning).toMatch(/do not disagree about anything this field contains/);
  });
});

describe('absence is a state, not a zero', () => {
  it('one layer with nothing to say is reported as exactly that', () => {
    const r = compareFloors('mid → tweeter', V2, null);
    expect(r.agreement).toBe('one-sided');
    expect(r.message).toMatch(/different statement from agreeing/);
  });

  it('neither layer: no message at all — "we could not derive one" is not "anywhere is fine"', () => {
    const r = compareFloors('mid → tweeter', null, null);
    expect(r.agreement).toBe('neither');
    expect(r.message).toBeNull();
  });

  it('a floor of zero or a negative one is absent, not a floor', () => {
    const r = compareFloors('x', { ...V2, hz: 0 }, { ...V1, hz: -1 });
    expect(r.agreement).toBe('neither');
  });
});

describe('agreement', () => {
  it('two identical floors agree, and nothing is warned about', () => {
    const r = compareFloors('x', V2, { ...V1, hz: V2.hz });
    expect(r.agreement).toBe('agree');
    expect(r.octavesApart).toBe(0);
    expect(r.warning).toBeNull();
    expect(r.message).toMatch(/They agree\./);
  });

  it('a v2 floor ABOVE the v1 one is named the other way round, and warns about nothing', () => {
    const r = compareFloors('x', { ...V2, hz: 900 }, V1, [900, 1200]);
    expect(r.agreement).toBe('v2-stricter');
    // The warning exists to say "the OTHER layer would have refused part of
    // this field". When the steering floor is the stricter one there is no
    // such part, and inventing a warning would be noise.
    expect(r.warning).toBeNull();
  });
});
