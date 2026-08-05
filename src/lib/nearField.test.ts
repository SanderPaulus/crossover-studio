import { describe, it, expect } from 'vitest';
import {
  baffleStepShelfDb,
  checkTransition,
  effectiveRadiusM,
  mergeNearFar,
  nearFieldMaxHz,
  nearToFarDb,
  sumRadiators,
} from './nearField.ts';
import { logspace } from './dsp.ts';
import { cplx } from './complex.ts';

describe('near-field validity limit', () => {
  it('agrees with BOTH published forms, which agree with each other', () => {
    // Klippel AN39 writes it 5475/a[cm]; Keele (via D'Appolito) 4311/D[inch].
    // 4311/(2/2.54) = 5475.0 exactly — two lineages, one formula. Ours uses
    // c = 343 where they used 344, hence the 0.3% tolerance.
    const forRadiusCm = (aCm: number) => nearFieldMaxHz(Math.PI * aCm * aCm)!;
    const within = (got: number, want: number, frac: number) =>
      expect(Math.abs(got / want - 1)).toBeLessThan(frac);
    for (const aCm of [2.5, 4, 6.9, 10]) {
      within(forRadiusCm(aCm), 5475 / aCm, 0.005);
      within(forRadiusCm(aCm), 4311 / ((2 * aCm) / 2.54), 0.005);
    }
    // And the two published forms are the same formula, not two approximations.
    expect(4311 / (2 / 2.54)).toBeCloseTo(5475, 0);
  });

  it("reproduces D'Appolito's worked 7-inch driver", () => {
    // 7" driver, 5" effective cone -> 862 Hz in his text.
    const aCm = (5 * 2.54) / 2;
    expect(Math.abs(nearFieldMaxHz(Math.PI * aCm * aCm)! / 862 - 1)).toBeLessThan(0.005);
  });

  it('needs a cone area', () => {
    expect(nearFieldMaxHz(0)).toBeNull();
    expect(effectiveRadiusM(-1)).toBeNull();
  });
});

describe('near-field to far-field scaling', () => {
  it("reproduces ARTA's worked example", () => {
    // AN4: a = 3.2 cm, r = 48 cm -> factor 0.0333.
    const sd = Math.PI * 3.2 * 3.2;
    const db = nearToFarDb(sd, 480)!;
    expect(10 ** (db / 20)).toBeCloseTo(0.0333, 4);
  });

  it('is pure inverse distance', () => {
    const sd = Math.PI * 5 * 5;
    // Doubling r is exactly -6 dB.
    expect(nearToFarDb(sd, 2000)! - nearToFarDb(sd, 1000)!).toBeCloseTo(-6.02, 2);
  });
});

describe('summing several radiators', () => {
  it("weights a port by D_port / D_cone (D'Appolito's -8 dB example)", () => {
    // Woofer 13.8 cm, port 5.5 cm -> the port enters 8.0 dB down.
    const one = [cplx(1, 0)];
    const cone: { p: typeof one; diameterMm: number } = { p: one, diameterMm: 138 };
    const port = { p: one, diameterMm: 55 };
    const summed = sumRadiators([cone, port])!;
    const portWeight = summed[0].re - 1;
    expect(20 * Math.log10(portWeight)).toBeCloseTo(-8.0, 1);
  });

  it('sums COMPLEX — antiphase cancels, which magnitude-only cannot show', () => {
    const cone = { p: [cplx(1, 0)], diameterMm: 100 };
    const antiphase = { p: [cplx(-1, 0)], diameterMm: 100 };
    // Equal size, opposite sign: they annihilate. A magnitude sum would say +6 dB.
    expect(sumRadiators([cone, antiphase])![0].re).toBeCloseTo(0, 12);
    const inPhase = { p: [cplx(1, 0)], diameterMm: 100 };
    expect(sumRadiators([cone, inPhase])![0].re).toBeCloseTo(2, 12);
  });

  it('rejects mismatched grids and missing diameters', () => {
    const a = { p: [cplx(1, 0), cplx(1, 0)], diameterMm: 100 };
    expect(sumRadiators([a, { p: [cplx(1, 0)], diameterMm: 50 }])).toBeNull();
    expect(sumRadiators([{ p: [cplx(1, 0)], diameterMm: 0 }])).toBeNull();
    expect(sumRadiators([])).toBeNull();
  });
});

describe('baffle-step shelf', () => {
  const freq = logspace(20, 20000, 200);
  it('is flat above, down by the full depth below, and half at the corner', () => {
    const s = baffleStepShelfDb(freq, 400, 6);
    const at = (f: number) => s[freq.findIndex((x) => x >= f)];
    // Half the step AT the step frequency — that is what the number means.
    expect(at(400)).toBeCloseTo(-3, 1);
    expect(at(20)).toBeLessThan(-5.5);
    expect(at(10000)).toBeGreaterThan(-0.3);
    // Monotone: a correction that wobbles would be inventing a response.
    const s2 = baffleStepShelfDb(freq, 400, 6);
    for (let i = 1; i < s2.length; i++) expect(s2[i]).toBeGreaterThanOrEqual(s2[i - 1]);
  });

  it('switches off cleanly', () => {
    expect(baffleStepShelfDb(freq, 400, 0).every((v) => v === 0)).toBe(true);
    expect(baffleStepShelfDb(freq, 0, 6).every((v) => v === 0)).toBe(true);
  });
});

describe('merging near onto far', () => {
  const freq = logspace(20, 5000, 400);
  /** A far-field-ish response: 2nd-order high-pass at 60 Hz, gently tilted. */
  const farOf = () => {
    const spl: number[] = [];
    const ph: number[] = [];
    for (const f of freq) {
      const r = f / 60;
      const mag = (r * r) / Math.hypot(1 - r * r, r * 1.0);
      spl.push(90 + 20 * Math.log10(mag));
      ph.push((Math.atan2(r * 1.0, r * r - 1) * 180) / Math.PI);
    }
    return { spl, ph };
  };

  it('recovers a known level offset and delay, and then the halves agree', () => {
    const far = farOf();
    // "Near field": the same physics, 34 dB hotter (5 mm mic) and 120 us late.
    const LEVEL = 34;
    const DELAY_US = 120;
    const nearSpl = far.spl.map((v) => v + LEVEL);
    const nearPh = far.ph.map((p, i) => p - 360 * freq[i] * (DELAY_US * 1e-6));
    const m = mergeNearFar({
      freq,
      farSpl: far.spl,
      farPhaseDeg: far.ph,
      nearSpl,
      nearPhaseDeg: nearPh,
      transitionHz: 300,
    })!;
    expect(m).not.toBeNull();
    expect(m.levelDb).toBeCloseTo(-LEVEL, 6);
    expect(Math.abs(m.delayUs)).toBeCloseTo(DELAY_US, 3);
    expect(Math.abs(m.offsetDeg)).toBeLessThan(0.5);
    // With the fit applied the two halves are the SAME curve, so the merge
    // must reproduce the far field everywhere — including through the blend.
    expect(m.residualDeg).toBeLessThan(0.01);
    for (let i = 0; i < freq.length; i++) {
      expect(m.spl[i]).toBeCloseTo(far.spl[i], 6);
    }
  });

  it('takes the low end from the near field and the top from the far field', () => {
    const far = farOf();
    // A gated far field dies below 250 Hz; the near field keeps going.
    const gated = far.spl.map((v, i) => (freq[i] < 250 ? v - 40 * Math.log10(250 / freq[i]) : v));
    const m = mergeNearFar({
      freq,
      farSpl: gated,
      farPhaseDeg: far.ph,
      nearSpl: far.spl.map((v) => v + 34),
      nearPhaseDeg: far.ph,
      transitionHz: 400,
      blendOctaves: 1,
    })!;
    const at = (f: number) => m.spl[freq.findIndex((x) => x >= f)];
    const ref = (f: number) => far.spl[freq.findIndex((x) => x >= f)];
    // Well below the blend: the honest near-field low end, not the gate's decay.
    expect(at(60)).toBeCloseTo(ref(60), 0);
    // Well above: untouched far field.
    expect(at(2000)).toBeCloseTo(gated[freq.findIndex((x) => x >= 2000)], 6);
    // And the seam is smooth — no step at either edge of the blend.
    for (let i = 1; i < freq.length; i++) {
      if (freq[i] < 100 || freq[i] > 2000) continue;
      expect(Math.abs(m.spl[i] - m.spl[i - 1])).toBeLessThan(1.5);
    }
  });

  it('reports an inverted near-field measurement instead of hiding it', () => {
    const far = farOf();
    const m = mergeNearFar({
      freq,
      farSpl: far.spl,
      farPhaseDeg: far.ph,
      nearSpl: far.spl.map((v) => v + 34),
      nearPhaseDeg: far.ph.map((p) => p + 180),
      transitionHz: 300,
    })!;
    expect(Math.abs(m.offsetDeg)).toBeCloseTo(180, 0);
  });

  it('honours the baffle-step correction', () => {
    const far = farOf();
    const base = {
      freq,
      farSpl: far.spl,
      farPhaseDeg: far.ph,
      nearSpl: far.spl.map((v) => v + 34),
      nearPhaseDeg: far.ph,
      transitionHz: 400,
    };
    const plain = mergeNearFar(base)!;
    const stepped = mergeNearFar({ ...base, baffleStepHz: 380, baffleStepDepthDb: 6 })!;
    const i = freq.findIndex((x) => x >= 40);
    // With the step applied the near-field half sits lower down low...
    expect(stepped.spl[i]).toBeLessThan(plain.spl[i]);
    // ...and the far-field half is untouched.
    const j = freq.findIndex((x) => x >= 3000);
    expect(stepped.spl[j]).toBeCloseTo(plain.spl[j], 6);
  });

  it('refuses a grid it cannot work on', () => {
    expect(
      mergeNearFar({ freq: [100, 200], farSpl: [1, 2], farPhaseDeg: [0, 0], nearSpl: [1, 2], nearPhaseDeg: [0, 0], transitionHz: 150 }),
    ).toBeNull();
  });
});

describe('is the chosen transition defensible?', () => {
  it('accepts one inside both limits', () => {
    expect(checkTransition(350, 800, 250).ok).toBe(true);
  });

  it('rejects below the gate and above ka = 1, with the reason', () => {
    expect(checkTransition(200, 800, 250).ok).toBe(false);
    expect(checkTransition(200, 800, 250).note).toMatch(/gate cannot support/);
    expect(checkTransition(900, 800, 250).ok).toBe(false);
    expect(checkTransition(900, 800, 250).note).toMatch(/ka = 1/);
  });

  it('says plainly when NO honest splice exists', () => {
    // Gate only good above 600, cone only good below 500: there is no overlap,
    // and that is a measurement problem, not a setting to nudge.
    const v = checkTransition(550, 500, 600);
    expect(v.ok).toBe(false);
    expect(v.note).toMatch(/no honest splice exists/);
    expect(v.note).toMatch(/further away, higher up, or outdoors/);
  });
});
