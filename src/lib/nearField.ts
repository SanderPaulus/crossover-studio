/**
 * Near-field measurement, and merging it onto the gated far-field response.
 *
 * WHY this exists at all: a gated indoor measurement is only honest above
 * f = 1/t_gate, which indoors lands around 200–290 Hz — and a three-way's
 * woofer-to-mid crossover lives at 300–500 Hz. So the region that has to be
 * designed most carefully is the region where the far-field data runs out.
 * Klippel states the constraint as a rule: the crossover frequency must be
 * ABOVE the splice frequency. Getting the low end from a near-field
 * measurement is how everyone resolves that.
 *
 * The physics below is standard and, pleasingly, cross-validates: Klippel's
 * upper limit c/(2πa) and Keele's 4311/D[inch] are algebraically the SAME
 * formula (4311/(2/2.54) = 5475.0), arrived at from different directions.
 *
 * What is DIFFERENT here from a magnitude-only tool: this app sums measured
 * phase, so a splice that only matches levels would insert an unknown delay
 * step into the woofer's phase exactly at the woofer-mid crossover. The merge
 * therefore fits a pure delay as well, using the same least-squares form as
 * verification.ts — and reports it, so a nonsense fit is visible rather than
 * silently designed on.
 */

import type { Complex } from './complex.ts';
import { cplx, fromPolar } from './complex.ts';

const C_AIR = 343;

/* ------------------------------------------------------------------ *
 * Validity limits
 * ------------------------------------------------------------------ */

/**
 * Highest frequency a near-field measurement is valid to: ka = 1, i.e.
 * f = c/(2πa) with `a` the effective radiating radius.
 *
 * Klippel AN39 writes it as 5475/a[cm]; Keele (via D'Appolito) as
 * 4311/D[inch]. They agree exactly. Klippel adds that a real box on a finite
 * baffle may be slightly lower than this.
 */
export function nearFieldMaxHz(sdCm2: number): number | null {
  const a = effectiveRadiusM(sdCm2);
  return a === null ? null : C_AIR / (2 * Math.PI * a);
}

/** Effective piston radius from cone area, metres. */
export function effectiveRadiusM(sdCm2: number): number | null {
  if (!(sdCm2 > 0)) return null;
  return Math.sqrt((sdCm2 * 1e-4) / Math.PI);
}

/**
 * Level scaling from a near-field pressure to the half-space far field at
 * distance r: p_ff/p_nf = a/(2r), the low-frequency (ka ≪ 1) limit of the
 * Rayleigh integral (ARTA AN4).
 *
 * Returned in dB. Note this is a HALF-SPACE result — a real cabinet on a
 * finite baffle loses up to 6 dB more at low frequency as it transitions to
 * full space, which `baffleStepShelfDb` below optionally puts back.
 */
export function nearToFarDb(sdCm2: number, distanceMm: number): number | null {
  const a = effectiveRadiusM(sdCm2);
  if (a === null || !(distanceMm > 0)) return null;
  return 20 * Math.log10(a / (2 * (distanceMm / 1000)));
}

/* ------------------------------------------------------------------ *
 * Summing several radiators
 * ------------------------------------------------------------------ */

export interface Radiator {
  /** Complex near-field pressure on the shared grid. */
  p: readonly Complex[];
  /** Effective diameter of this radiating surface, mm (a port's mouth, a
   *  cone, a passive radiator). Rectangular openings: the diameter of a
   *  circle with the same area. */
  diameterMm: number;
}

/**
 * Keele's diameter-weighted sum of several radiators sharing one enclosure:
 * p_tot = Σ pᵢ·Dᵢ, normalised here to the FIRST radiator so the result stays
 * in the cone's own scale (a port then rides in at D_port/D_cone).
 *
 * The sum is COMPLEX and must be. Below the box tuning it is a subtraction of
 * two similar numbers — D'Appolito warns that a 1 dB error in either
 * near-field measurement can swing the result badly there — so a
 * magnitude-only sum is not an approximation, it is a different answer.
 */
export function sumRadiators(parts: readonly Radiator[]): Complex[] | null {
  if (parts.length === 0) return null;
  const n = parts[0].p.length;
  if (!(parts[0].diameterMm > 0)) return null;
  const d0 = parts[0].diameterMm;
  const out: Complex[] = [];
  for (let i = 0; i < n; i++) {
    let re = 0;
    let im = 0;
    for (const q of parts) {
      if (q.p.length !== n || !(q.diameterMm > 0)) return null;
      const w = q.diameterMm / d0;
      re += q.p[i].re * w;
      im += q.p[i].im * w;
    }
    out.push(cplx(re, im));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The half-space correction the near field lacks
 * ------------------------------------------------------------------ */

/**
 * First-order shelf standing in for the baffle step, in dB per grid point:
 * 0 dB well above `stepHz`, −`depthDb` well below it.
 *
 * A near-field measurement is a half-space (2π) result throughout; a real
 * cabinet radiates into 2π above the baffle step and into 4π below it, losing
 * up to 6 dB. Keele's method therefore OVER-estimates the low end, and
 * D'Appolito says so explicitly.
 *
 * Deliberately a simple, adjustable shelf rather than a diffraction
 * simulation: published baffle-step formulas disagree by ~3× and measurement
 * disagrees with all of them, because the driver's distance to each edge
 * matters more than the width does. A knob the designer can see and set beats
 * a model that looks authoritative and is not. Depth 0 disables it.
 */
export function baffleStepShelfDb(
  freq: readonly number[],
  stepHz: number,
  depthDb = 6,
): number[] {
  if (!(stepHz > 0) || !(depthDb > 0)) return freq.map(() => 0);
  // First-order shape: −depth far below, −depth/2 AT the corner (which is what
  // "the step frequency" means — half of the 6 dB), asymptotically 0 above.
  // Reaches within half a decibel about 3 octaves up, which matches how broad
  // a real baffle step is; Elliott puts the whole transition at roughly four
  // octaves.
  return freq.map((f) => -depthDb / (1 + f / stepHz));
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

export interface MergeInput {
  /** Shared frequency grid. */
  freq: readonly number[];
  /** Gated far-field response, dB and degrees. */
  farSpl: readonly number[];
  farPhaseDeg: readonly number[];
  /** Near-field response after summing radiators, dB and degrees. */
  nearSpl: readonly number[];
  nearPhaseDeg: readonly number[];
  /** Blend centre, Hz — must sit inside both validity ranges. */
  transitionHz: number;
  /** Width of the crossfade in octaves (1 is the usual choice). */
  blendOctaves?: number;
  /** Baffle step to put back into the near-field half, Hz; 0 = none. */
  baffleStepHz?: number;
  baffleStepDepthDb?: number;
}

export interface MergeResult {
  spl: number[];
  phaseDeg: number[];
  /** Level shift applied to the near field to meet the far field, dB. */
  levelDb: number;
  /** Pure delay fitted and removed from the near field, µs. */
  delayUs: number;
  /** Constant phase offset after the delay fit; ~180° means one of the two
   *  measurements is inverted, which is a wiring fact, not a fit parameter. */
  offsetDeg: number;
  /** RMS phase disagreement inside the blend after matching, degrees — the
   *  honest quality figure for the splice. */
  residualDeg: number;
  /** Blend band actually used, Hz. */
  blend: [number, number];
}

/**
 * Merge a near-field low end onto a gated far-field response.
 *
 * Order matters: LEVEL and DELAY are fitted across the blend band first, so
 * the two halves genuinely agree there, and only then are they crossfaded.
 * Splicing on magnitude alone would leave the near-field half carrying the
 * delay of a 5 mm microphone distance — a phase step planted exactly where a
 * three-way crosses.
 *
 * The level fit uses the MEDIAN deviation across the blend, not the mean, for
 * the same reason responseStats does: a mean is dragged by whatever
 * disagreement you are trying to measure.
 */
export function mergeNearFar(input: MergeInput): MergeResult | null {
  const {
    freq,
    farSpl,
    farPhaseDeg,
    nearSpl,
    nearPhaseDeg,
    transitionHz,
    blendOctaves = 1,
    baffleStepHz = 0,
    baffleStepDepthDb = 6,
  } = input;
  const n = freq.length;
  if (n < 8 || farSpl.length !== n || nearSpl.length !== n) return null;
  if (!(transitionHz > 0)) return null;

  const half = blendOctaves / 2;
  const lo = transitionHz * 2 ** -half;
  const hi = transitionHz * 2 ** half;
  const band: number[] = [];
  for (let i = 0; i < n; i++) {
    if (freq[i] >= lo && freq[i] <= hi && Number.isFinite(farSpl[i]) && Number.isFinite(nearSpl[i])) {
      band.push(i);
    }
  }
  if (band.length < 4) return null;

  // Near field, corrected to the far field's own loading before anything is
  // compared: half-space scaling is the caller's job (it needs Sd and r), the
  // baffle step is optional and lives here.
  const step = baffleStepShelfDb(freq, baffleStepHz, baffleStepDepthDb);
  const nearAdj = nearSpl.map((v, i) => v + step[i]);

  // Level: median deviation across the blend.
  const devs = band.map((i) => farSpl[i] - nearAdj[i]).sort((a, b) => a - b);
  const levelDb = devs[Math.floor(devs.length / 2)];

  // Delay + constant offset: least squares on the unwrapped phase DIFFERENCE
  // (same form as verification.ts — both curves wrap at their own frequencies,
  // so only the difference can be unwrapped meaningfully).
  const diff: number[] = [];
  let prev = 0;
  for (let k = 0; k < band.length; k++) {
    const i = band[k];
    let d = farPhaseDeg[i] - nearPhaseDeg[i];
    if (k === 0) d = (((d + 180) % 360) + 360) % 360 - 180;
    else {
      while (d - prev > 180) d -= 360;
      while (d - prev < -180) d += 360;
    }
    diff.push(d);
    prev = d;
  }
  const fs = band.map((i) => freq[i]);
  const mf = fs.reduce((s, v) => s + v, 0) / fs.length;
  const md = diff.reduce((s, v) => s + v, 0) / diff.length;
  let num = 0;
  let den = 0;
  for (let k = 0; k < fs.length; k++) {
    num += (fs[k] - mf) * (diff[k] - md);
    den += (fs[k] - mf) * (fs[k] - mf);
  }
  const b = den > 0 ? num / den : 0;
  const a = md - b * mf;
  const delayUs = (-b / 360) * 1e6;
  const offsetDeg = (((a + 180) % 360) + 360) % 360 - 180;
  let sq = 0;
  for (let k = 0; k < fs.length; k++) {
    const r = diff[k] - (a + b * fs[k]);
    sq += r * r;
  }
  const residualDeg = Math.sqrt(sq / fs.length);

  // Apply the fit, then crossfade in the COMPLEX domain — fading magnitude and
  // phase separately would invent a response neither half has.
  const spl = new Array<number>(n);
  const phaseDeg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const f = freq[i];
    const nearDb = nearAdj[i] + levelDb;
    const nearPh = nearPhaseDeg[i] + a + b * f;
    let w: number; // weight of the FAR field
    if (f <= lo) w = 0;
    else if (f >= hi) w = 1;
    else {
      const t = Math.log2(f / lo) / Math.log2(hi / lo);
      w = 0.5 - 0.5 * Math.cos(Math.PI * t); // raised cosine, C1 at both ends
    }
    const pf = fromPolar(10 ** (farSpl[i] / 20), (farPhaseDeg[i] * Math.PI) / 180);
    const pn = fromPolar(10 ** (nearDb / 20), (nearPh * Math.PI) / 180);
    const re = w * pf.re + (1 - w) * pn.re;
    const im = w * pf.im + (1 - w) * pn.im;
    const mag = Math.hypot(re, im);
    spl[i] = 20 * Math.log10(mag || 1e-12);
    phaseDeg[i] = (Math.atan2(im, re) * 180) / Math.PI;
  }

  return { spl, phaseDeg, levelDb, delayUs, offsetDeg, residualDeg, blend: [lo, hi] };
}

/**
 * Is the chosen transition defensible? Both validity limits have to leave room
 * for it, and if they do not there is no splice frequency that is honest —
 * which is a measurement problem, not a setting to nudge.
 */
export function checkTransition(
  transitionHz: number,
  nearMaxHz: number | null,
  farMinHz: number | null,
): { ok: boolean; note: string } {
  const above = farMinHz !== null && transitionHz < farMinHz;
  const below = nearMaxHz !== null && transitionHz > nearMaxHz;
  if (nearMaxHz !== null && farMinHz !== null && farMinHz > nearMaxHz) {
    return {
      ok: false,
      note: `no honest splice exists: the far field is only valid above ${Math.round(
        farMinHz,
      )} Hz and the near field only below ${Math.round(
        nearMaxHz,
      )} Hz — measure further away, higher up, or outdoors`,
    };
  }
  if (above) {
    return {
      ok: false,
      note: `${Math.round(transitionHz)} Hz is below the far field's own limit of ${Math.round(
        farMinHz!,
      )} Hz — the gate cannot support it`,
    };
  }
  if (below) {
    return {
      ok: false,
      note: `${Math.round(transitionHz)} Hz is above the near field's limit of ${Math.round(
        nearMaxHz!,
      )} Hz (ka = 1) — the cone is no longer a simple source there`,
    };
  }
  return { ok: true, note: '' };
}
