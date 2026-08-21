import { describe, expect, it } from 'vitest';
import { baffleStepDb, mergeSources, type MergerInput, type PortInput, type WooferInput } from './merger.ts';

/* ------------------------------------------------------------------ *
 * Synthetic material
 * ------------------------------------------------------------------ */

const C_MM = 343_000;
const GRID = Array.from({ length: 600 }, (_, i) => 20 * (20000 / 20) ** (i / 599));

/** A second-order high-pass shape — something with real phase, not a flat line. */
function sealedBox(fHz: number, fcHz: number, q: number): { db: number; deg: number } {
  const x = fHz / fcHz;
  // H = -x² / (1 - x² + jx/Q)  (2nd-order high-pass, unity above fc)
  const numRe = -(x * x);
  const denRe = 1 - x * x;
  const denIm = x / q;
  const d = denRe * denRe + denIm * denIm;
  const re = (numRe * denRe) / d;
  const im = (-numRe * denIm) / d;
  return { db: 20 * Math.log10(Math.hypot(re, im)), deg: (Math.atan2(im, re) * 180) / Math.PI };
}

const SD = 255; // cm², Satori WO24P-8 effective (his project + the demo agree)
const MIC_MM = 1000;
const AC_MM = 50;
const NEAR_MM = 5;
/** The delay the merger must compute for this geometry. */
const GEO_DELAY_S = (MIC_MM + AC_MM - NEAR_MM) / C_MM;

/** Near field of one cone: the box response, no baffle step, no propagation. */
function nearOf(gain = 0): { spl: number[]; phaseDeg: number[] } {
  const spl: number[] = [];
  const phaseDeg: number[] = [];
  for (const f of GRID) {
    const h = sealedBox(f, 40, 0.7);
    spl.push(h.db + 100 + gain);
    phaseDeg.push(h.deg);
  }
  return { spl, phaseDeg };
}

/**
 * Far field of that same cone: the same box response, minus the baffle step,
 * scaled down, and delayed by the propagation the near field does not have.
 * Below `gateHz` it is garbage — that is what the near field is for.
 */
function farOf(
  opts: { levelDb?: number; stepHz?: number; stepDepth?: number; gateHz?: number; rippleDb?: number } = {},
): { spl: number[]; phaseDeg: number[] } {
  const { levelDb = -46, stepHz = 400, stepDepth = 6, gateHz = 0, rippleDb = 0 } = opts;
  const step = baffleStepDb(GRID, stepHz, stepDepth);
  const spl: number[] = [];
  const phaseDeg: number[] = [];
  GRID.forEach((f, i) => {
    const h = sealedBox(f, 40, 0.7);
    const rot = -360 * f * GEO_DELAY_S;
    if (f < gateHz) {
      // Gate garbage: a plausible-looking but wrong low end, so a test that
      // accidentally uses the far field down there fails loudly.
      spl.push(h.db + 100 + levelDb + 12);
      phaseDeg.push(((h.deg + rot + 90) % 360) - 180);
    } else {
      // Optional diffraction ripple: something the far field has and the near
      // field cannot have. Without it the two halves are identical after the
      // step, the delay and the gain — and then no blend setting can change
      // anything, which is correct but tests nothing.
      const ripple = rippleDb === 0 ? 0 : rippleDb * Math.sin(Math.log2(f / 100) * 3.1);
      spl.push(h.db + 100 + levelDb + step[i] + ripple);
      phaseDeg.push(h.deg + rot + ripple * 4);
    }
  });
  return { spl, phaseDeg };
}

const wooferInput = (name: string, gain = 0, far = farOf()): WooferInput => ({
  name,
  ...nearOf(gain),
  farSpl: far.spl,
  farPhaseDeg: far.phaseDeg,
  sdCm2: SD,
});

const baseInput = (over: Partial<MergerInput> = {}): MergerInput => ({
  freq: GRID,
  woofers: [wooferInput('W1')],
  micDistanceMm: MIC_MM,
  acousticCentreMm: AC_MM,
  nearMicMm: NEAR_MM,
  baffleStepHz: 400,
  baffleStepDepthDb: 6,
  farValidFromHz: 500,
  ...over,
});

const atHz = (hz: number) => GRID.reduce((b, f, i) => (Math.abs(f - hz) < Math.abs(GRID[b] - hz) ? i : b), 0);

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('merger — one response per source, near field spliced onto far field', () => {
  it('(1) two identical near fields sum to exactly +6.02 dB, phase unchanged', () => {
    // The sum lives in MergerResult.summedSpl — computed for the eye, never
    // model input. Two identical sources: +6.02 dB, not +3.
    const one = mergeSources(baseInput())!;
    const two = mergeSources(baseInput({ woofers: [wooferInput('W1'), wooferInput('W2')] }))!;
    expect(two.perWoofer).toHaveLength(2);
    for (const hz of [30, 60, 120, 300, 900, 3000]) {
      const i = atHz(hz);
      expect(two.summedSpl[i] - one.summedSpl[i]).toBeCloseTo(6.0206, 6);
      let dPhase = two.summedPhaseDeg[i] - one.summedPhaseDeg[i];
      dPhase = (((dPhase + 180) % 360) + 360) % 360 - 180;
      expect(Math.abs(dPhase)).toBeLessThan(1e-9);
    }
    // Each woofer keeps its OWN response — they are not merged into each other.
    expect(two.perWoofer[0].name).toBe('W1');
    expect(two.perWoofer[1].name).toBe('W2');
    expect(two.perWoofer[0].spl).toEqual(one.perWoofer[0].spl);
  });

  it('(2) port area scales as sqrt(Sp/Sd) — the analytically expected offset, exactly', () => {
    /* Measured on the GAIN, and that is the honest place to measure it.
     *
     * A port whose pressure has the same SHAPE as the cone's adds a constant
     * complex factor to the near-field sum, so the gain fit — which exists to
     * put the near half on the far half's level — absorbs it completely and the
     * merged curve does not move at all. That is correct behaviour, and it
     * makes the gain the observable: a contribution of sqrt(Sp/Sd) must show up
     * as exactly 20*log10(1 + sqrt(Sp/Sd)) less gain.
     *
     * (A port with its own shape moves the curve as well; test 10 uses one with
     * a path delay for that.) */
    const near = nearOf();
    const port: PortInput = { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 0 };
    const without = mergeSources(baseInput())!.perWoofer[0];
    const half = mergeSources(baseInput({ port }))!.perWoofer[0];
    expect(without.gainDb - half.gainDb).toBeCloseTo(20 * Math.log10(1 + Math.sqrt(110 / SD)), 6);
    // Same area as the cone: two equal radiators, so exactly +6.02 dB — the
    // same number test 1 checks on the sum, arrived at from the other side.
    const full = mergeSources(baseInput({ port: { ...port, areaCm2: SD } }))!.perWoofer[0];
    expect(without.gainDb - full.gainDb).toBeCloseTo(6.0206, 4);
    // And a quarter of the area is half the pressure.
    const quarter = mergeSources(baseInput({ port: { ...port, areaCm2: SD / 4 } }))!.perWoofer[0];
    expect(without.gainDb - quarter.gainDb).toBeCloseTo(20 * Math.log10(1.5), 6);

    // Mandatory fields: no area, no plane, no guess.
    expect(mergeSources(baseInput({ port: { ...port, areaCm2: 0 } }))).toBeNull();
    expect(
      mergeSources(baseInput({ port: { ...port, plane: undefined as unknown as 'waist' } })),
    ).toBeNull();
  });

  it('(3) round-trip: a far field split into near field + gate comes back within 0.1 dB and 2°', () => {
    // The far field here is the truth; the near field is the same physics
    // without the baffle step and without the propagation delay. A correct
    // merge must reconstruct the far field above the splice and the true
    // (step-corrected) response below it.
    const far = farOf({ gateHz: 0 });
    const r = mergeSources(baseInput({ woofers: [wooferInput('W1', 0, far)] }))!;
    const m = r.perWoofer[0];
    for (const hz of [30, 60, 150, 400, 800, 2000, 8000]) {
      const i = atHz(hz);
      expect(m.spl[i] - far.spl[i]).toBeCloseTo(0, 1); // 0.1 dB
      let d = m.phaseDeg[i] - far.phaseDeg[i];
      d = (((d + 180) % 360) + 360) % 360 - 180;
      expect(Math.abs(d)).toBeLessThan(2);
    }
    // And the delay really was the geometric one, not something fitted.
    expect(m.delayUs).toBeCloseTo(GEO_DELAY_S * 1e6, 6);
    expect(m.residualDb).toBeLessThan(0.1);
    expect(m.residualDeg).toBeLessThan(2);
  });

  it('(4) splice invariance: 520 vs 620 Hz moves nothing outside the overlap by more than 0.2 dB', () => {
    // On rippled data, so the window genuinely has something to disagree about.
    const rippled = farOf({ rippleDb: 0.5 });
    const w = [wooferInput('W1', 0, rippled)];
    // Both windows must stay under ka = 1 (606 Hz for Sd 255) or the merge
    // refuses — which is test 6's job, not this one's.
    const a = mergeSources(baseInput({ woofers: w, spliceFromHz: 500, spliceToHz: 540 }))!;
    const b = mergeSources(baseInput({ woofers: w, spliceFromHz: 560, spliceToHz: 600 }))!;
    for (const hz of [25, 50, 100, 250, 1500, 5000, 15000]) {
      const i = atHz(hz);
      expect(Math.abs(a.perWoofer[0].spl[i] - b.perWoofer[0].spl[i])).toBeLessThan(0.2);
    }
  });

  it('(5) ORDER: running the diffraction step after the gain fit produces a different, wrong gain', () => {
    // This test exists so a later refactor cannot quietly swap steps 1 and 2.
    // Right order: the near field gets the baffle step, so it already matches
    // the far field's shape and the gain is pure level.
    const right = mergeSources(baseInput())!.perWoofer[0];
    // Wrong order: the fit sees a near field WITHOUT the step and a far field
    // WITH it, and absorbs that difference into the gain.
    const wrong = mergeSources(baseInput({ diffractionAfterGain: true }))!.perWoofer[0];
    expect(Math.abs(wrong.gainDb - right.gainDb)).toBeGreaterThan(0.5);
    // And the damage lands where it matters: the low end comes out at the
    // wrong level relative to the passband.
    const lowRight = right.spl[atHz(40)] - right.spl[atHz(2000)];
    const lowWrong = wrong.spl[atHz(40)] - wrong.spl[atHz(2000)];
    expect(Math.abs(lowWrong - lowRight)).toBeGreaterThan(0.5);
    // The right order is the one that reconstructs the far field (test 3).
    expect(right.residualDb).toBeLessThan(wrong.residualDb);
  });

  it('(6) a splice at 300 Hz warns; one above ka = 1 is REFUSED, not warned', () => {
    const low = mergeSources(baseInput({ spliceFromHz: 280, spliceToHz: 320 }))!;
    expect(low.warnings.join(' ')).toMatch(/below the far field's own limit of 500 Hz/);
    expect(low.perWoofer).toHaveLength(1); // a warning still produces a result

    // Above ka = 1 (606 Hz for Sd 255) the near field is no longer proportional
    // to cone velocity: the data does not mean what the fit assumes, so there is
    // nothing to hand back.
    const high = mergeSources(baseInput({ spliceFromHz: 620, spliceToHz: 700 }))!;
    expect(high.perWoofer).toHaveLength(0);
    const text = high.warnings.join(' ');
    expect(text).toMatch(/✖ REFUSED/);
    expect(text).toMatch(/ka = 1 limit \(606 Hz\)/);
    expect(text).toMatch(/at least -\d\.\d\d dB/);

    /* The STRICTEST driver decides, because one splice band serves them all.
     * A 400 cm² cone puts ka = 1 at 484 Hz, so the default 500–600 window that
     * is fine for the 255 cm² pair must be refused as soon as it joins. */
    const bigger = [wooferInput('W1'), { ...wooferInput('W2'), sdCm2: 400 }];
    expect(mergeSources(baseInput({ woofers: bigger }))!.perWoofer).toHaveLength(0);
    // Move the window under the stricter limit and both go through.
    const lower = mergeSources(
      baseInput({ woofers: bigger, spliceFromHz: 400, spliceToHz: 450 }),
    )!;
    expect(lower.perWoofer).toHaveLength(2);

    // A healthy splice says nothing alarming.
    expect(mergeSources(baseInput())!.warnings.join(' ')).not.toMatch(/[⚠✖]/);
  });

  it('(2c) the residual phase reports a delay error the gain fit would otherwise hide as level', () => {
    /* A wrong acoustic centre does not show up as a phase problem: the complex
     * least-squares gain turns it into LESS GAIN, i.e. a level mistake. So the
     * check is the linear trend in the residual phase, reported as the path
     * error that would cause it. */
    const right = mergeSources(baseInput())!.perWoofer[0];
    expect(Math.abs(right.delayErrorMm)).toBeLessThan(1);
    expect(right.warnings.join(' ')).not.toMatch(/path error/);

    // Tell the merger the acoustic centre is 50 mm deeper than it really is.
    const wrong = mergeSources(baseInput({ acousticCentreMm: AC_MM + 50 }))!.perWoofer[0];
    expect(Math.abs(wrong.delayErrorMm)).toBeGreaterThan(40);
    expect(Math.abs(wrong.delayErrorMm)).toBeLessThan(60);
    expect(wrong.warnings.join(' ')).toMatch(/path error/);
    // And this is the point: the mistake landed in the LEVEL.
    expect(Math.abs(wrong.gainDb - right.gainDb)).toBeGreaterThan(0.2);

    // ±10 mm is harmless and must not cry wolf.
    const small = mergeSources(baseInput({ acousticCentreMm: AC_MM + 10 }))!.perWoofer[0];
    expect(small.warnings.join(' ')).not.toMatch(/path error/);
    expect(Math.abs(small.gainDb - right.gainDb)).toBeLessThan(0.1);
  });

  it('records the port mouth position for the multi-source refactor, even though the even split ignores it', () => {
    const near = nearOf();
    const r = mergeSources(
      baseInput({
        port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 300, mouthZMm: -880 },
      }),
    )!;
    expect(r.perWoofer[0].meta.derivation).toMatch(/mouth at z = -880 mm/);
  });

  it('(10) every new weight actually moves the output — byte-identical would mean it is not wired', () => {
    /* On a far field that is the near field's exact twin (same shape after the
     * step, the delay and the gain) the blend width and the fit window cannot
     * change anything — correct, but it tests nothing. A real far field carries
     * diffraction ripple the near field cannot have, so that is what these run
     * on. */
    const rippled = farOf({ rippleDb: 0.5 });
    const withRipple = (over: Partial<MergerInput> = {}) =>
      baseInput({ woofers: [wooferInput('W1', 0, rippled)], ...over });
    const ref = mergeSources(withRipple())!.perWoofer[0].spl;
    const differs = (over: Partial<MergerInput>) => {
      const out = mergeSources(withRipple(over))!.perWoofer[0].spl;
      return out.some((v, i) => Math.abs(v - ref[i]) > 1e-9);
    };
    expect(differs({ baffleStepDepthDb: 3 })).toBe(true);
    expect(differs({ baffleStepHz: 700 })).toBe(true);
    expect(differs({ blendOctaves: 1 })).toBe(true);
    expect(differs({ acousticCentreMm: 120 })).toBe(true);
    expect(differs({ nearMicMm: 40 })).toBe(true);
    expect(differs({ spliceFromHz: 520, spliceToHz: 600 })).toBe(true);
    /* sdRefCm2 is deliberately NOT in this list. It is a normalisation, not a
     * weight: every radiator is scaled by sqrt(S_i/S_ref), so changing S_ref
     * multiplies the whole near-field sum by a constant — which the gain fit
     * then removes exactly. The RATIO between cone and port, which is the part
     * that carries physics, is sqrt(Sp/Sd) and is independent of S_ref. Proven
     * rather than asserted: */
    expect(differs({ sdRefCm2: 110 })).toBe(false);
    expect(
      mergeSources(withRipple({ sdRefCm2: 110 }))!.perWoofer[0].gainDb,
    ).not.toBeCloseTo(mergeSources(withRipple())!.perWoofer[0].gainDb, 3);
    const near = nearOf();
    // A shape-identical port at zero path excess is absorbed by the gain fit —
    // see test 2 — so the observable is the gain, not the curve.
    expect(
      mergeSources(withRipple({ port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 0 } }))!
        .perWoofer[0].gainDb,
    ).not.toBeCloseTo(mergeSources(withRipple())!.perWoofer[0].gainDb, 6);
    // The port PATH delay is a separate additive term: it changes the phase
    // relation between cone and port, so it must move the merged curve on its
    // own. If it did not, it would be hidden inside the splice delay after all.
    expect(differs({ port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 300 } })).toBe(true);
    const p0 = mergeSources(withRipple({ port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 0 } }))!;
    const p300 = mergeSources(withRipple({ port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 300 } }))!;
    // 300 mm at 40 Hz is 12.6° — small but not nothing, and it grows with
    // frequency exactly where the port dies away (see PortInput).
    const i = atHz(40);
    expect(Math.abs(p0.perWoofer[0].spl[i] - p300.perWoofer[0].spl[i])).toBeGreaterThan(1e-3);
  });

  it('carries its provenance: per-source metadata, piecewise validity, splice frequency', () => {
    const near = nearOf();
    const r = mergeSources(
      baseInput({
        woofers: [wooferInput('W1'), wooferInput('W2')],
        port: { ...near, areaCm2: 110, plane: 'waist', pathExcessMm: 300 },
      }),
    )!;
    for (const m of r.perWoofer) {
      expect(m.meta.dataSource).toBe('nearfield-merged');
      expect(m.segments).toHaveLength(2);
      expect(m.segments[0].source).toBe('nearfield-merged');
      expect(m.segments[1].source).toBe('gated-farfield');
      expect(m.segments[0].toHz).toBeCloseTo(m.segments[1].fromHz, 9);
      expect(m.meta.derivation).toMatch(/gain .* fitted/);
      expect(m.meta.derivation).toMatch(/computed from geometry/);
      expect(m.meta.derivation).toMatch(/110 cm² at the waist/);
    }
    expect(r.warnings.join(' ')).toMatch(/visual check only/);
  });
});
