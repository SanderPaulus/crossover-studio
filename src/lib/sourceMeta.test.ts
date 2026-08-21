import { describe, expect, it } from 'vitest';
import {
  gatedFarFieldValidity,
  DATA_SOURCE_LABEL,
  groundPlaneValidity,
  anechoicValidity,
  kaAt,
  NEARFIELD_KA_LIMIT,
  nearFieldValidity,
  outsideValidity,
  pistonErrorDb,
  pistonRadiusM,
  intersectValidity,
  type SourceMeta,
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
    // Taper-aware since 4D(b): ARTA's Tukey 0.25 right flank makes the
    // coherent duration 4.39 ms, so the floor is 455 Hz, not the 398 Hz the
    // nominal length would claim.
    const gated = gatedFarFieldValidity(5.021)!;
    expect(gated.fromHz!).toBeGreaterThan(450);
    expect(gated.fromHz!).toBeLessThan(460);
    expect(gated.reason).toMatch(/2\/T/);
    expect(gated.reason).toMatch(/Tukey 0\.25/);
    // A rectangular window still reads the nominal length.
    expect(gatedFarFieldValidity(5.021, null, 0)!.fromHz!).toBeCloseTo(398, 0);
    const gp = groundPlaneValidity({ fromHz: 30 });
    expect(gp.fromHz).toBe(30);
    expect(gp.reason).toMatch(/floor/);
  });

  it('ground plane has no defensible default low end, so it demands one', () => {
    /* Reviewed before first use: this function was written when no ground-plane
     * data existed and carried a bare `fromHz = 20` with nothing behind it.
     * A ground-plane low end comes from the SITE — distance to the nearest wall,
     * and the ambient noise floor — neither of which is in the file. A default
     * would have been the cabinet-Gate mistake again: plausible, invisible, and
     * wrong by however much the site actually allowed. */
    const gp = groundPlaneValidity({ fromHz: 35 });
    expect(gp.fromHz).toBe(35);
    expect(gp.reason).toMatch(/stated 35 Hz/);
    expect(gp.reason).toMatch(/site size and noise floor/);
    // It reads +6 dB, and says so where an absolute level might be read off.
    expect(gp.reason).toMatch(/\+6 dB/);
    // Mic off the floor combs: c/(4h) = 8575 Hz at 10 mm, and that becomes the
    // ceiling rather than being left as "unknown".
    const raised = groundPlaneValidity({ fromHz: 35, micHeightMm: 10 });
    expect(raised.toHz!).toBeCloseTo(8575, 0);
    expect(groundPlaneValidity({ fromHz: 35 }).toHz).toBeNull();
    // The file's own end wins when it is lower.
    expect(groundPlaneValidity({ fromHz: 35, micHeightMm: 10, toHz: 6000 }).toHz).toBe(6000);
  });

  it('an anechoic chamber is NOT ground plane, and gets its own low end', () => {
    /* Kept apart deliberately. Ground plane ADDS a coincident reflection (+6 dB,
     * low end set by the site); a chamber ABSORBS it (no bonus, honest only
     * above the wedge cutoff). One label for both would put the wrong floor on
     * whichever measurement arrived second — the dataSource-must-steer failure
     * that A3h was about, arriving in advance this time. */
    const an = anechoicValidity(50);
    expect(an.fromHz).toBe(50);
    expect(an.reason).toMatch(/stated 50 Hz cutoff/);
    expect(an.reason).toMatch(/wedges stop absorbing/);
    // No gate floor, and explicitly no +6 dB.
    expect(an.reason).toMatch(/No gate floor applies and no \+6 dB/);
    expect(DATA_SOURCE_LABEL.anechoic).toBe('anechoic chamber');
    expect(DATA_SOURCE_LABEL.groundplane).not.toBe(DATA_SOURCE_LABEL.anechoic);
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

describe('the evaluation band is an intersection of validity, never the data extent (issue #14)', () => {
  const src = (name: string, fromHz: number | null, toHz: number | null, extra: Partial<SourceMeta> = {}) => ({
    name,
    meta: {
      dataSource: 'gated-farfield' as const,
      validity: { fromHz, toHz, reason: 'test' },
      ...extra,
    },
  });

  it('takes the strictest end from each side and names which source set it', () => {
    const b = intersectValidity([
      src('woofer', 398, 20000),
      src('mid', 250, 18000),
      src('tweeter', 700, 22000),
    ])!;
    expect(b.fromHz).toBe(700);
    expect(b.toHz).toBe(18000);
    expect(b.limitedBy.low).toMatch(/tweeter/);
    expect(b.limitedBy.high).toMatch(/mid/);
    expect(b.describe).toMatch(/700–18000 Hz/);
  });

  it('a source reaching lower does NOT drag the band down — that is the whole point', () => {
    /* The failure this prevents: a near-field merge runs to 15 Hz, the sim grid
     * is built from data extent, and the dissipation probe, the amplifier-load
     * floor and the repair pass all change band at once, silently, in the same
     * release as a refactor. */
    const before = intersectValidity([src('woofer', 398, 20000), src('mid', 400, 18000)])!;
    const after = intersectValidity([
      { name: 'woofer', meta: { dataSource: 'nearfield-merged', validity: { fromHz: 15, toHz: 20000, reason: 'merged' } } },
      src('mid', 400, 18000),
    ])!;
    // The merged woofer reaches to 15 Hz, but the mid still does not.
    expect(before.fromHz).toBe(400);
    expect(after.fromHz).toBe(400);
    expect(after.limitedBy.low).toMatch(/mid/);
  });

  it('a requested range can narrow the band but never widen it', () => {
    const narrow = intersectValidity([src('woofer', 200, 20000)], [500, 5000])!;
    expect(narrow.fromHz).toBe(500);
    expect(narrow.toHz).toBe(5000);
    const wide = intersectValidity([src('woofer', 400, 15000)], [20, 40000])!;
    expect(wide.fromHz).toBe(400);
    expect(wide.toHz).toBe(15000);
  });

  it('carries unverified sources through instead of quietly including them', () => {
    const b = intersectValidity([
      src('woofer', 400, 20000),
      src('mid', 400, 20000, { verified: false, unverifiedReason: 'no gate length recorded' }),
    ])!;
    expect(b.unverified).toEqual(['mid']);
    expect(b.describe).toMatch(/unverified: mid/);
  });

  it('returns null rather than an empty band when the sources cannot agree', () => {
    expect(intersectValidity([src('a', 5000, 20000), src('b', 100, 400)])).toBeNull();
    expect(intersectValidity([])).toBeNull();
  });
});
