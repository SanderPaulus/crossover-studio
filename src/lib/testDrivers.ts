/**
 * SYNTHETIC DRIVER IMPEDANCE FOR TESTS — Thiele-Small, not a flat resistor.
 *
 * ⚠ TEST SUPPORT. Nothing in the app imports this; the app works on measured
 * impedance and must keep doing so (network.ts refuses to solve without it).
 * This exists so a test can pose a driver with a KNOWN awkward impedance and
 * ask whether a guard finds it.
 *
 * WHY IT WAS WRITTEN (Sander, aug 2026). His filter was first checked with
 * flat resistors as the driver model, and the conclusion was "minimum 3.36 Ω
 * at 720 Hz, remarkably insensitive to the driver model" — supported by a
 * sweep of Re from 3.0 to 4.5 Ω. With the real LIMP data the answer is 2.62 Ω
 * at 82 Hz: a different value in a different place, in the woofer's own
 * passband rather than near any crossing.
 *
 * The sweep was not wrong, it was IRRELEVANT: a flat resistor cannot have a
 * reflex peak, so no value of Re could move the answer in the direction that
 * mattered. Which yields a nuance worth keeping, because it is the mirror of
 * something this codebase already relies on:
 *
 *     Byte-identical output across a parameter sweep does NOT always mean the
 *     parameter is unwired. It can equally mean the sweep cannot reach the
 *     mechanism. Both look the same from the outside — the difference is
 *     whether the model under test is CAPABLE of the behaviour being probed.
 *
 * (The costWeight curve really was unwired; that diagnosis happened to be
 * right. This one was not. Before concluding "not connected", check that the
 * fixture can express the thing you are varying.)
 *
 * WHAT THIS IS AND IS NOT. It is the standard electrical equivalent circuit,
 * so the SHAPE is right: resonance peak(s), the vented saddle at Fb, and the
 * voice-coil inductance rise. It is not a validated electro-acoustic
 * simulation and no design decision may be taken on it — its only job is to
 * give tests a driver-shaped load instead of a resistor. Every fixture built
 * here is checked against a real measurement in testDrivers.test.ts.
 */

import type { Complex } from './complex.ts';

/* ------------------------------------------------------------------ *
 * Small complex helpers — local so this file has no dependencies that
 * could make it awkward to use from any test.
 * ------------------------------------------------------------------ */

const add = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const inv = (a: Complex): Complex => {
  const d = a.re * a.re + a.im * a.im;
  return { re: a.re / d, im: -a.im / d };
};
/** Parallel combination of any number of impedances. */
const par = (...zs: Complex[]): Complex => inv(zs.map(inv).reduce(add));

export interface DriverTS {
  /** DC resistance of the voice coil, Ω. */
  reOhm: number;
  /** Free-air / in-box resonance, Hz. For a sealed box this is Fc. */
  fsHz: number;
  /** Mechanical Q at that resonance. */
  qms: number;
  /** Electrical Q at that resonance. */
  qes: number;
  /**
   * Voice-coil inductance, mH, and its frequency exponent.
   *
   * A real coil is NOT a pure inductor: eddy currents in the pole piece make
   * |Z| rise as roughly ω^0.7 rather than ω^1 (Leach's semi-inductance, and
   * the reason a measured impedance never reaches the slope a textbook L
   * predicts). n = 1 gives the ideal inductor for tests that want one.
   */
  leMh: number;
  leExp?: number;
}

export interface VentedTS extends DriverTS {
  /** Box tuning, Hz — where the SADDLE between the two peaks sits. */
  fbHz: number;
  /** Compliance ratio Vas/Vb. Sets how far the two peaks spread apart. */
  alpha: number;
  /** Q of the box/port resonance (leakage and port losses). 5–20 typical;
   *  lower makes a shallower saddle. */
  qb?: number;
}

/** The semi-inductive voice coil: Le·(jω)^n. */
function coilZ(f: number, leMh: number, exp: number): Complex {
  const w = 2 * Math.PI * f;
  const mag = (leMh / 1000) * Math.pow(w, exp);
  // (jω)^n = ω^n · (cos(nπ/2) + j sin(nπ/2)) — at n = 1 this is purely
  // imaginary, and below 1 the coil carries a real (loss) part too, which is
  // why a measured impedance rises in magnitude faster than its phase suggests.
  const ang = (exp * Math.PI) / 2;
  return { re: mag * Math.cos(ang), im: mag * Math.sin(ang) };
}

/**
 * Motional impedance of the driver alone, as the parallel RLC every T-S
 * treatment uses on the electrical side:
 *
 *     Res  = Re·(Qms/Qes)        the peak height above Re
 *     Cmes = Qms/(ωs·Res)        chosen so the tank's Q comes out as Qms
 *     Lces = 1/(ωs²·Cmes)        resonates with Cmes at Fs
 */
function motionalParts(d: DriverTS) {
  const ws = 2 * Math.PI * d.fsHz;
  const res = d.reOhm * (d.qms / d.qes);
  const cmes = d.qms / (ws * res);
  const lces = 1 / (ws * ws * cmes);
  return { res, cmes, lces, ws };
}

/**
 * A driver in a SEALED box (or in free air — same shape, different Fs/Q).
 * One peak at fsHz, then the coil rise.
 */
export function sealedDriverZ(freq: readonly number[], d: DriverTS): Complex[] {
  const { res, cmes, lces } = motionalParts(d);
  const n = d.leExp ?? 0.7;
  return freq.map((f) => {
    const w = 2 * Math.PI * f;
    const zmot = par({ re: res, im: 0 }, { re: 0, im: w * lces }, { re: 0, im: -1 / (w * cmes) });
    return add(add({ re: d.reOhm, im: 0 }, coilZ(f, d.leMh, n)), zmot);
  });
}

/**
 * A driver in a VENTED (bass-reflex) box: two peaks with a saddle at Fb.
 *
 * The mobility analogue puts VELOCITY where voltage is, so the motional branch
 * is the parallel RLC above. The box and port add ONE more branch across it —
 * a SERIES Lceb + Cmep (plus its losses Rb) tuned to Fb:
 *
 *     Zmot = Res ‖ jωLces ‖ 1/(jωCmes) ‖ ( Rb + jωLceb + 1/(jωCmep) )
 *
 * AT f = Fb that branch is at SERIES resonance, so it is a near short across
 * the others and Zmot collapses to almost nothing: |Z| falls back to Re. That
 * is the saddle, and it is the electrical statement of the physical one — at
 * the tuning the port does the radiating and the cone barely moves, so there
 * is almost no motional EMF to add. Four reactive elements give two peaks with
 * that zero between them.
 *
 * ⚠ I GOT THIS WRONG FIRST TIME and the test caught it. Putting the box as a
 * PARALLEL tank in series with Lces also produces two peaks and a minimum
 * between them, which looks right — but it puts the minimum at 36 Hz for a
 * 31 Hz tuning, because opening one branch of a parallel combination makes the
 * total LARGER, not smaller. Sanders measured pair puts its saddle at 31.3 Hz
 * against a stated Fb of 31. Two peaks and a dip is not enough to call a model
 * correct; where the dip lands is the check.
 *
 * This matters for what these tests exist to catch: the saddle is a genuine
 * low-impedance region sitting in the woofer's own passband, nowhere near a
 * crossover, and a guard that only inspects handover regions cannot see it.
 */
export function ventedDriverZ(freq: readonly number[], d: VentedTS): Complex[] {
  const { res, cmes, lces } = motionalParts(d);
  const wb = 2 * Math.PI * d.fbHz;
  const lceb = lces / d.alpha;
  const cmep = 1 / (wb * wb * lceb);
  // Series-resonance Q: Q = (1/Rb)·sqrt(Lceb/Cmep), so a HIGHER Qb is a
  // smaller loss resistance and a deeper saddle.
  const rb = Math.sqrt(lceb / cmep) / (d.qb ?? 10);
  const n = d.leExp ?? 0.7;
  return freq.map((f) => {
    const w = 2 * Math.PI * f;
    const box = { re: rb, im: w * lceb - 1 / (w * cmep) };
    const zmot = par(
      { re: res, im: 0 },
      { re: 0, im: w * lces },
      { re: 0, im: -1 / (w * cmes) },
      box,
    );
    return add(add({ re: d.reOhm, im: 0 }, coilZ(f, d.leMh, n)), zmot);
  });
}

/**
 * N identical drivers wired in parallel.
 *
 * Not a convenience: it is the case Sander's cabinet is built on (two WO24P-8
 * on one branch), and the reason a "nominal 8 Ω" driver arrives at the
 * amplifier as 4 Ω nominal with a minimum near half of its own.
 */
export function parallelDrivers(z: readonly Complex[], count: number): Complex[] {
  return z.map((x) => ({ re: x.re / count, im: x.im / count }));
}

/** Minimum |Z| over a band, with the frequency it occurs at. */
export function minImpedance(
  freq: readonly number[],
  z: readonly Complex[],
  fromHz = 20,
  toHz = 20000,
): { ohm: number; atHz: number } {
  let ohm = Infinity;
  let atHz = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < fromHz || freq[i] > toHz) continue;
    const m = Math.hypot(z[i].re, z[i].im);
    if (m < ohm) {
      ohm = m;
      atHz = freq[i];
    }
  }
  return { ohm, atHz };
}

/**
 * A WO24P-8-like vented woofer, as a named fixture.
 *
 * Parameters are chosen so the model reproduces the STRUCTURE of Sander's
 * measured pair (two peaks, saddle at the 31 Hz tuning, minimum in the low
 * hundreds of Hz, coil rise above that) — see testDrivers.test.ts, which
 * checks it against the real LIMP file rather than against my expectations.
 */
export const WO24P_LIKE: VentedTS = {
  reOhm: 6.4,
  fsHz: 33,
  qms: 3.4,
  qes: 0.35,
  leMh: 0.9,
  leExp: 0.7,
  fbHz: 31,
  alpha: 2.6,
  qb: 9,
};

/** A sealed midrange, roughly the Satori-like unit in the KOAN fixtures. */
export const SEALED_MID_LIKE: DriverTS = {
  reOhm: 3.4,
  fsHz: 89,
  qms: 3.0,
  qes: 0.5,
  leMh: 0.25,
  leExp: 0.7,
};

/** A dome tweeter: one broad resonance, small coil. */
export const DOME_TWEETER_LIKE: DriverTS = {
  reOhm: 5.4,
  fsHz: 700,
  qms: 2.0,
  qes: 0.9,
  leMh: 0.05,
  leExp: 0.8,
};
