import { describe, expect, it } from 'vitest';
import {
  gatedFarFieldValidity,
  groundPlaneValidity,
  kaAt,
  NEARFIELD_KA_LIMIT,
  nearFieldValidity,
  outsideValidity,
  pistonErrorDb,
  pistonRadiusM,
} from './sourceMeta.ts';

describe('source metadata — where a measurement may be believed', () => {
  it('the ka limit is 1, and the piston error at the usual candidates matches the closed form', () => {
    expect(NEARFIELD_KA_LIMIT).toBe(1);
    // The three numbers the limit was decided on (Sanders, aug 2026).
    // (his table rounds to two decimals; these are the closed-form values)
    expect(pistonErrorDb(1.0)).toBeCloseTo(-0.365, 3);
    expect(pistonErrorDb(1.6)).toBeCloseTo(-0.947, 3);
    expect(pistonErrorDb(2.55)).toBeCloseTo(-2.5, 1);
    // Monotonic in the region that matters: more ka, more error.
    for (let ka = 0.2; ka < 2.8; ka += 0.2) {
      expect(pistonErrorDb(ka + 0.2)).toBeLessThan(pistonErrorDb(ka));
    }
  });

  it('the WO24P-8 lands on 652 Hz, not on the 1659 Hz the loose rule would give', () => {
    const sd = 220; // cm², effective
    const a = pistonRadiusM(sd)!;
    expect(a * 1000).toBeCloseTo(83.7, 1); // a = 83.7 mm
    const band = nearFieldValidity(sd)!;
    expect(band.toHz!).toBeGreaterThan(645);
    expect(band.toHz!).toBeLessThan(655);
    // The rejected rule, for the record: 10950 / 6.6" ≈ 1659 Hz is ka = 2.55.
    expect(kaAt(1659, sd)!).toBeCloseTo(2.55, 1);
    // And the band names its own reason, with the error in it.
    expect(band.reason).toMatch(/652 Hz/);
    expect(band.reason).toMatch(/-0\.36 dB/);
  });

  it('a gate sets the far-field floor at 2/T, and ground plane does not', () => {
    const gated = gatedFarFieldValidity(5.021)!;
    expect(gated.fromHz!).toBeGreaterThan(395);
    expect(gated.fromHz!).toBeLessThan(400);
    expect(gated.reason).toMatch(/2\/T/);
    const gp = groundPlaneValidity();
    expect(gp.fromHz).toBe(20);
    expect(gp.reason).toMatch(/floor/);
  });

  it('outsideValidity says WHICH end is the problem, not just yes or no', () => {
    const near = nearFieldValidity(220)!; // 15 Hz … 651 Hz
    // A splice attempt at 500–800 Hz pokes out of the top only.
    const hi = outsideValidity(near, 500, 800);
    expect(hi.ok).toBe(false);
    expect(hi.aboveHz).toBeCloseTo(near.toHz!, 6);
    expect(hi.belowHz).toBeNull();
    // Fb at 31.7 Hz sits inside the near field entirely…
    expect(outsideValidity(near, 25, 40).ok).toBe(true);
    // …and entirely outside a 5 ms gated far field.
    const gated = gatedFarFieldValidity(5.021, 20000)!;
    const fb = outsideValidity(gated, 25, 40);
    expect(fb.ok).toBe(false);
    expect(fb.belowHz).toBeCloseTo(gated.fromHz!, 6);
  });
});
