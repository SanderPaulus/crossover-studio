/**
 * MERGER — one complete response per SOURCE, near field spliced onto gated far
 * field, with the sources never collapsed into each other.
 *
 * This sits next to `nearField.ts` rather than replacing it: that module serves
 * the existing 2-way and demo paths and stays exactly as it is. What is
 * different here is the whole reason the Koan 2951 woofers were measured
 * separately in the first place — the vertical interference pattern of their
 * 275.75 mm spacing must NOT be baked into the source data, or the simulation
 * can no longer compute the polar response per angle. So this module takes
 * per-woofer near and far fields and returns per-woofer results. The summed
 * curve is computed too, but only as a visual check; it is never model input.
 *
 * THE ORDER OF OPERATIONS IS THE POINT OF THIS MODULE:
 *
 *   1. diffraction / baffle step onto the near-field sum
 *   2. THEN derive the gain against the far field
 *   3. THEN crossfade
 *
 * Doing 2 before 1 is a real error, not a stylistic choice: a near-field
 * measurement has no baffle step and the far field does, so the two halves are
 * SUPPOSED to differ by that amount before the diffraction step. Fit the gain
 * first and that difference is quietly absorbed into it — the level comes out
 * wrong and nothing anywhere reports a problem. `merger.test.ts` pins this with
 * a test that runs the same data in the wrong order and shows the gain moving.
 *
 * GAIN IS FITTED, DELAY IS NOT. With ka = 1 (606 Hz for these cones — Sd is
 * 255 cm², see below) and a gated far field honest from ~500 Hz, the usable
 * overlap is 500–600 Hz: 0.26 octave. That is plenty for a level fit and far
 * too little for a delay fit — fitting a slope across a quarter of an octave is
 * exactly where merges go wrong, because a small phase error over a short
 * baseline becomes a large delay. So
 * the delay is COMPUTED from geometry: the near-field mic sits ~5 mm from the
 * cone (propagation negligible), the far-field mic at the measuring distance
 * plus the driver's acoustic centre. This is a deliberate choice, not a missing
 * feature.
 *
 * THE DIVISION OF LABOUR, and it explains what is absent here as much as what
 * is present: THE NEAR FIELD SUPPLIES THE SHAPE, THE FAR FIELD SUPPLIES THE
 * LEVEL. That is why there is no a/(2r) near-to-far scaling in this module —
 * the gain is fitted, so any constant factor is absorbed and computing one
 * first would be arithmetic with no consequence. The √(S_i/S_ref) scaling
 * BETWEEN radiators is a different matter: it is a ratio inside the near-field
 * sum, it changes the shape, and nothing absorbs it.
 *
 * THE SPLICE WINDOW IS DERIVED, NOT CONFIGURED. Its top is a fixed margin under
 * the driver's own ka = 1, its bottom is the far field's gate-determined
 * validity floor. Hard-coded numbers sitting next to a derived limit collide
 * sooner or later — a 500–600 Hz default sits 1 % under a 606 Hz ka limit, so a
 * small refinement of Sd would have the refusal reject the project's own demo.
 * A manual override may only narrow the window; one that reaches outside the
 * derived bounds is refused, not honoured.
 */

import type { Complex } from './complex.ts';
import { cplx, fromPolar } from './complex.ts';
import {
  DATA_SOURCE_LABEL,
  nearFieldValidity,
  pistonErrorDb,
  kaAt,
  type DataSource,
  type SourceMeta,
  type ValidityBand,
} from './sourceMeta.ts';

const C_AIR = 343; // m/s
const C_MM_PER_S = C_AIR * 1000;

/**
 * How far under ka = 1 the splice may reach, as a fraction.
 *
 * 0.95 rather than 1.0 because the piston error is not the only thing waiting
 * at the limit: a real cone stops moving as one piece before ka = 1, and that
 * part is not analytic. A margin also stops the derived ceiling from sitting
 * within rounding distance of the refusal that guards it.
 *
 * WO24P-8 (Sd 255 cm²): ka = 1 at 606 Hz, so the ceiling is 576 Hz.
 */
export const SPLICE_KA_MARGIN = 0.95;

/** Below this the gain fit has too few points to mean much. */
const THIN_WINDOW_OCT = 0.2;

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

/** Which plane a port's area was measured in. No default: see `PortInput`. */
export type PortPlane = 'waist' | 'mouth';

export interface RadiatorMeasurement {
  /** Near-field magnitude, dB, on the shared grid. */
  spl: readonly number[];
  /** Near-field phase, degrees, on the shared grid. */
  phaseDeg: readonly number[];
}

export interface WooferInput extends RadiatorMeasurement {
  /** Label used in reports ("W1", "W2"). */
  name: string;
  /** Gated far field for THIS woofer, on the shared grid. */
  farSpl: readonly number[];
  farPhaseDeg: readonly number[];
  /** Effective cone area, cm². */
  sdCm2: number;
}

export interface PortInput extends RadiatorMeasurement {
  /**
   * Radiating area in the plane the MIC ACTUALLY STOOD IN, cm².
   *
   * Mandatory, and `plane` with it. √(Sp/Sd) is only right if S is the area at
   * the measuring plane, and a flared port has two very different candidates:
   * the Ultraflare's waist is 110 cm² while its mouth is considerably larger.
   * Guessing here is a silent factor on the entire low end, so the merge
   * refuses rather than assumes.
   */
  areaCm2: number;
  plane: PortPlane;
  /**
   * Extra path length from the port mouth to the observation point, mm,
   * relative to the woofer cones.
   *
   * WHY THIS IS A SEPARATE TERM (and not left inside the splice delay):
   *
   *   Keele's assumption that woofer and port sum as coincident sources holds
   *   for a front-mounted port beside the woofer. The Ultraflare is
   *   downfiring, 600 mm of physical length, mouth at the floor, with a
   *   different path difference to the observation point. At 40 Hz (λ = 8.6 m)
   *   a 300 mm path difference is 12.6°: small but not zero, and it grows with
   *   frequency exactly where the port's contribution is dying away. The phase
   *   relation around fb comes from the tuning (impedance / T-S); the path
   *   delay is a separate, additive term. Both belong in.
   *
   * Cross-check: run `sumCheck.checkPredictedSum` against the alignment derived
   * from the impedance. If fb and the dip land right, the delay is right.
   */
  pathExcessMm: number;
  /**
   * Vertical position of the port MOUTH relative to the measurement axis, mm
   * (negative = below it). The Ultraflare fires down, so its mouth sits at the
   * floor: about −880 mm, against −325.9 and −601.6 mm for the two woofers.
   *
   * Recorded but NOT used by the even split below, which treats the port as a
   * share of each woofer. At 31 Hz the difference between −880 and the cone
   * positions is not negligible, so this is the field the multi-source refactor
   * will read when the port becomes a source of its own with its own position
   * and its own path to every observation angle. Writing it down now means the
   * dataset does not have to be re-entered then.
   */
  mouthZMm?: number;
}

export interface MergerInput {
  /** Shared frequency grid, ascending Hz. */
  freq: readonly number[];
  /** One entry per woofer — each keeps its own near AND far field. */
  woofers: readonly WooferInput[];
  /** The shared port or passive radiator, if there is one. */
  port?: PortInput;
  /** Reference area for the √(S/S_ref) scaling, cm². Default: woofer 1's Sd. */
  sdRefCm2?: number;
  /**
   * Optional NARROWING of the derived splice window, Hz. The window itself
   * comes from physics (see the module docstring): its top is
   * SPLICE_KA_MARGIN × ka=1 for the strictest driver, its bottom is
   * `farValidFromHz`. An override that reaches OUTSIDE those bounds is refused
   * rather than honoured — otherwise the derivation is decoration.
   */
  spliceFromHz?: number;
  spliceToHz?: number;
  /** Crossfade width in octaves. Default 1/3. */
  blendOctaves?: number;
  /** Baffle step applied to the near-field sum BEFORE the gain fit. */
  baffleStepHz?: number;
  baffleStepDepthDb?: number;
  /** Geometry for the computed (not fitted) delay. */
  micDistanceMm: number;
  /** Depth of the acoustic centre behind the baffle, mm (CAD value ~50). */
  acousticCentreMm?: number;
  /** How far the near-field mic stood off the cone, mm. */
  nearMicMm?: number;
  /**
   * Far-field validity floor, Hz — the gate's own limit (2/T), from the
   * measurement's SourceMeta. REQUIRED: it is the bottom of the splice window,
   * and guessing it would mean fitting the gate instead of the driver.
   */
  farValidFromHz: number;
  /**
   * TEST HOOK ONLY: run the diffraction step AFTER the gain fit, which is the
   * wrong order. Exists so the order test can demonstrate the error instead of
   * asserting it in prose. Never set this in production code.
   */
  diffractionAfterGain?: boolean;
}

/* ------------------------------------------------------------------ *
 * Outputs
 * ------------------------------------------------------------------ */

export interface ValiditySegment {
  fromHz: number;
  toHz: number;
  source: DataSource;
}

export interface MergedSource {
  name: string;
  spl: number[];
  phaseDeg: number[];
  /** Level applied to the near-field half to meet the far field, dB (FITTED). */
  gainDb: number;
  /** Delay applied to the near-field half, µs (COMPUTED from geometry). */
  delayUs: number;
  /** How constant the complex ratio was across the splice band, dB RMS — the
   *  honest quality figure. A large value means the two halves disagree in
   *  shape, which one number cannot fix. */
  residualDb: number;
  /** RMS phase disagreement across the splice band after the geometric delay,
   *  degrees. This is a CHECK on the geometry, not a fitted quantity. */
  residualDeg: number;
  /**
   * Linear trend in the residual phase, expressed as the path error that would
   * cause it, mm. Near zero means the computed delay was right.
   *
   * This exists because the complex gain fit converts a delay error into a
   * level error: a wrong acoustic centre shows up as less gain, not as a phase
   * problem, and nothing else in this result would notice. ±10 mm costs
   * 0.05 dB; 50 mm costs 0.7 dB and is invisible without this number.
   */
  delayErrorMm: number;
  meta: SourceMeta;
  segments: ValiditySegment[];
  warnings: string[];
}

export interface MergerResult {
  /** One complete response per woofer — this is what the model consumes. */
  perWoofer: MergedSource[];
  /**
   * The complex sum of the merged woofers, for the eye only.
   *
   * NEVER model input: summing here would put the pair's vertical interference
   * pattern into the source data at one particular observation point, and the
   * polar response could no longer be computed per angle. That is the whole
   * reason the woofers were measured separately.
   */
  summedSpl: number[];
  summedPhaseDeg: number[];
  spliceBand: [number, number];
  /** Width of the fit window, octaves — reported on every merge. */
  spliceWidthOct: number;
  warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const toComplex = (spl: readonly number[], phaseDeg: readonly number[]): Complex[] =>
  spl.map((v, i) => fromPolar(10 ** (v / 20), (phaseDeg[i] * Math.PI) / 180));

const dbOf = (z: Complex) => 20 * Math.log10(Math.hypot(z.re, z.im) || 1e-12);
const degOf = (z: Complex) => (Math.atan2(z.im, z.re) * 180) / Math.PI;

/** Rotate a complex spectrum by a pure delay (positive = later in time). */
function applyDelay(p: readonly Complex[], freq: readonly number[], delayS: number): Complex[] {
  return p.map((z, i) => {
    const ph = -2 * Math.PI * freq[i] * delayS;
    const c = Math.cos(ph);
    const s = Math.sin(ph);
    return cplx(z.re * c - z.im * s, z.re * s + z.im * c);
  });
}

/**
 * First-order baffle-step shelf, in dB per grid point: 0 dB well above
 * `stepHz`, −depth well below, −depth/2 at the corner.
 *
 * Deliberately an adjustable shelf rather than a diffraction simulation:
 * published baffle-step formulas disagree by about 3x and measurement agrees
 * with none of them, because the driver's distance to each edge matters more
 * than the baffle width does.
 */
export function baffleStepDb(freq: readonly number[], stepHz: number, depthDb: number): number[] {
  if (!(stepHz > 0) || !(depthDb > 0)) return freq.map(() => 0);
  return freq.map((f) => -depthDb / (1 + f / stepHz));
}

function applyDbCurve(p: readonly Complex[], db: readonly number[]): Complex[] {
  return p.map((z, i) => {
    const g = 10 ** (db[i] / 20);
    return cplx(z.re * g, z.im * g);
  });
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

/**
 * Least-squares REAL gain that best maps `near` onto `far` over `idx`, using
 * the complex ratio.
 *
 *     g = Re( Σ conj(near)·far ) / Σ |near|²
 *
 * Complex on purpose: a phase disagreement across the band pulls the gain down
 * instead of being ignored, so a geometry error shows up as a poor residual
 * rather than being papered over by the level fit.
 */
function fitGain(
  near: readonly Complex[],
  far: readonly Complex[],
  idx: readonly number[],
  freq: readonly number[],
): {
  gain: number;
  residualDb: number;
  residualDeg: number;
  /** Slope of the residual phase across the fit band, expressed as the path
   *  error that would produce it, mm. See `delayErrorMm` on MergedSource. */
  delayErrorMm: number;
} {
  let num = 0;
  let den = 0;
  for (const i of idx) {
    num += near[i].re * far[i].re + near[i].im * far[i].im;
    den += near[i].re * near[i].re + near[i].im * near[i].im;
  }
  const gain = den > 0 ? num / den : 1;
  let sqDb = 0;
  let sqDeg = 0;
  for (const i of idx) {
    const scaled = cplx(near[i].re * gain, near[i].im * gain);
    sqDb += (dbOf(far[i]) - dbOf(scaled)) ** 2;
    let d = degOf(far[i]) - degOf(scaled);
    d = (((d + 180) % 360) + 360) % 360 - 180;
    sqDeg += d * d;
  }
  const n = Math.max(1, idx.length);
  /* RESIDUAL-PHASE TREND — the diagnosis a complex least-squares gain hides.
   *
   * Fitting a real gain against a complex ratio means a phase error does not
   * come out as a phase error: it comes out as a SMALLER GAIN, i.e. as a level
   * mistake. With the acoustic centre known to ±10 mm that is 0.05 dB and
   * harmless. If the CAD value is 50 mm off the truth it is 0.7 dB — a real
   * error, and completely invisible in every number above.
   *
   * A LINEAR TREND in the residual phase is the direct diagnosis: a pure delay
   * error is a straight line in (f, φ). So fit that line and report the path
   * length it corresponds to, in millimetres, which is the unit the mistake was
   * made in. */
  let sumF = 0;
  let sumP = 0;
  const phases: number[] = [];
  let prev = 0;
  idx.forEach((i, k) => {
    const scaled = cplx(near[i].re * gain, near[i].im * gain);
    let d = degOf(far[i]) - degOf(scaled);
    if (k === 0) d = (((d + 180) % 360) + 360) % 360 - 180;
    else {
      while (d - prev > 180) d -= 360;
      while (d - prev < -180) d += 360;
    }
    prev = d;
    phases.push(d);
    sumF += freq[i];
    sumP += d;
  });
  const mf = sumF / n;
  const mp = sumP / n;
  let num2 = 0;
  let den2 = 0;
  idx.forEach((i, k) => {
    num2 += (freq[i] - mf) * (phases[k] - mp);
    den2 += (freq[i] - mf) ** 2;
  });
  const slopeDegPerHz = den2 > 0 ? num2 / den2 : 0;
  // φ = −360·f·τ  ⇒  τ = −slope/360, and a path is τ·c.
  const delayErrorMm = (-slopeDegPerHz / 360) * C_MM_PER_S;
  return {
    gain: gain > 0 ? gain : 1e-6,
    residualDb: Math.sqrt(sqDb / n),
    residualDeg: Math.sqrt(sqDeg / n),
    delayErrorMm,
  };
}

export function mergeSources(input: MergerInput): MergerResult | null {
  const {
    freq,
    woofers,
    port,
    blendOctaves = 1 / 3,
    baffleStepHz = 0,
    baffleStepDepthDb = 6,
    micDistanceMm,
    acousticCentreMm = 50,
    nearMicMm = 5,
    farValidFromHz,
    diffractionAfterGain = false,
  } = input;

  const n = freq.length;
  if (n < 8 || woofers.length === 0) return null;
  if (!(micDistanceMm > 0) || !(farValidFromHz > 0)) return null;
  for (const w of woofers) {
    if (w.spl.length !== n || w.farSpl.length !== n || !(w.sdCm2 > 0)) return null;
  }
  // The port's area and plane are mandatory — see PortInput. A port present
  // without them is a refusal, not a default.
  if (port && (!(port.areaCm2 > 0) || (port.plane !== 'waist' && port.plane !== 'mouth'))) {
    return null;
  }

  const sdRef = input.sdRefCm2 ?? woofers[0].sdCm2;
  if (!(sdRef > 0)) return null;

  const warnings: string[] = [];

  /* ---- The splice window, derived ------------------------------------
   * Top: a margin under the strictest driver's ka = 1 — above that the near
   * field is not proportional to cone velocity, so the data does not mean what
   * the fit assumes. Bottom: the far field's gate-determined floor — below that
   * a fit is fitting the gate. Neither is a preference, so neither is a
   * default. */
  const nearBand = nearFieldValidity(woofers[0].sdCm2);
  // The STRICTEST cone sets the ceiling — one window serves them all — and it
  // is that cone the messages must name, not whichever happens to be first.
  let kaHi: number | null = null;
  let strictSd = woofers[0].sdCm2;
  for (const w of woofers) {
    const b = nearFieldValidity(w.sdCm2);
    if (b?.toHz != null && (kaHi === null || b.toHz < kaHi)) {
      kaHi = b.toHz;
      strictSd = w.sdCm2;
    }
  }
  const refuse = (why: string): MergerResult => ({
    perWoofer: [],
    summedSpl: [],
    summedPhaseDeg: [],
    spliceBand: [0, 0],
    spliceWidthOct: 0,
    warnings: [why],
  });
  if (kaHi === null) return refuse('✖ REFUSED: no Sd, so the near field has no validity limit');
  const derivedHi = SPLICE_KA_MARGIN * kaHi;
  const derivedLo = farValidFromHz;
  if (derivedLo >= derivedHi) {
    /* WHICH of the two closed it is not an objective question — both bounds
     * move, and calling one of them "the" cause would need a notion of a
     * normal gate or a normal cone that this module has no business holding.
     * What IS objective is how far each would have to shift to open the
     * window, so say both, with the number attached to each remedy. */
    const needGateHz = derivedHi; // the far field would have to be honest down to here
    const needGateMs = 2000 / needGateHz;
    const needKaHz = derivedLo / SPLICE_KA_MARGIN; // ka = 1 would have to sit here
    const needA = C_AIR / (2 * Math.PI * needKaHz);
    const needSdCm2 = Math.PI * needA * needA * 1e4;
    const kaAtFloor = kaAt(derivedLo, strictSd) ?? 0;
    return refuse(
      `✖ REFUSED: no honest splice window exists. The far field is only valid above ` +
        `${Math.round(derivedLo)} Hz (its gate), and the near field only below ` +
        `${Math.round(derivedHi)} Hz (${SPLICE_KA_MARGIN.toFixed(2)} × ka = 1 at ` +
        `${Math.round(kaHi)} Hz) — at that gate floor this cone is already at ka = ` +
        `${kaAtFloor.toFixed(2)}, an ideal-piston error of at least ` +
        `${pistonErrorDb(kaAtFloor).toFixed(2)} dB. Either end can open it: the far field would ` +
        `have to reach down to ${Math.round(needGateHz)} Hz (a gate of ` +
        `${needGateMs.toFixed(1)} ms — further from walls, higher up, or outdoors), or the cone ` +
        `would have to be small enough to keep ka = 1 above ${Math.round(needKaHz)} Hz ` +
        `(Sd ≤ ${Math.round(needSdCm2)} cm², against ${Math.round(strictSd)} here). ` +
        `A ground-plane measurement of the low end avoids the splice altogether.`,
    );
  }

  /* An override may only NARROW. Letting it reach outside would make the
   * derivation decoration — the number a designer types would silently outrank
   * the physics it was derived from. */
  const wantLo = input.spliceFromHz ?? derivedLo;
  const wantHi = input.spliceToHz ?? derivedHi;
  if (wantLo < derivedLo - 1e-9 || wantHi > derivedHi + 1e-9) {
    return refuse(
      `✖ REFUSED: the splice override ${Math.round(wantLo)}–${Math.round(wantHi)} Hz reaches ` +
        `outside the derived window ${Math.round(derivedLo)}–${Math.round(derivedHi)} Hz. ` +
        `An override may narrow the window, never widen it: outside these bounds one half of ` +
        `the data does not support a fit at all` +
        (wantHi > derivedHi
          ? ` — at ${Math.round(wantHi)} Hz this cone is at ka = ` +
            `${(kaAt(wantHi, strictSd) ?? 0).toFixed(2)}, an ideal-piston error of at ` +
            `least ${pistonErrorDb(kaAt(wantHi, strictSd) ?? 0).toFixed(2)} dB.`
          : ` — below ${Math.round(derivedLo)} Hz the far field is gate-limited, so the fit ` +
            `would be fitting the gate.`),
    );
  }
  if (!(wantHi > wantLo)) return refuse('✖ REFUSED: the splice window is empty');
  const spliceFromHz = wantLo;
  const spliceToHz = wantHi;
  const spliceWidthOct = Math.log2(spliceToHz / spliceFromHz);
  if (spliceWidthOct < THIN_WINDOW_OCT) {
    warnings.push(
      `⚠ the fit window is only ${spliceWidthOct.toFixed(2)} octave ` +
        `(${Math.round(spliceFromHz)}–${Math.round(spliceToHz)} Hz) — thin for a gain fit; the ` +
        `level it returns rests on few points, so check the residual before trusting it`,
    );
  }

  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (freq[i] >= spliceFromHz && freq[i] <= spliceToHz) idx.push(i);
  }
  if (idx.length < 3) {
    warnings.push('⚠ fewer than 3 grid points inside the splice band — widen it or use a denser grid');
    return {
      perWoofer: [],
      summedSpl: [],
      summedPhaseDeg: [],
      spliceBand: [spliceFromHz, spliceToHz],
      spliceWidthOct,
      warnings,
    };
  }

  /* ---- The computed delay ---------------------------------------------
   * The far-field mic is at `micDistanceMm` plus the acoustic centre behind
   * the baffle; the near-field mic sits `nearMicMm` off the cone. With a shared
   * time reference the near-field half must be delayed by the difference to sit
   * where the far field sits. Geometry, not a fit — see the module docstring. */
  const delayS = (micDistanceMm + acousticCentreMm - nearMicMm) / C_MM_PER_S;
  const delayUs = delayS * 1e6;

  const step = baffleStepDb(freq, baffleStepHz, baffleStepDepthDb);

  /* ---- Port: scaled, delayed, and split across the woofers -------------
   * The port belongs to the BOX, not to one cone, and the output of this
   * module is per woofer. With identical woofers wired in parallel each one
   * drives half the port's volume velocity, so half the port pressure is
   * attributed to each — which makes the sum of the two merged responses carry
   * the whole port exactly once.
   *
   * The alternative — keeping the port as its own source with its own position
   * at the floor — is the better model and belongs with the multi-source
   * refactor, where a source can have a position of its own. Until then this
   * split is stated here rather than hidden. */
  let portShare: Complex[] | null = null;
  if (port) {
    const scale = Math.sqrt(port.areaCm2 / sdRef);
    const p = toComplex(port.spl, port.phaseDeg).map((z) => cplx(z.re * scale, z.im * scale));
    const withPath = applyDelay(p, freq, port.pathExcessMm / C_MM_PER_S);
    const share = 1 / woofers.length;
    portShare = withPath.map((z) => cplx(z.re * share, z.im * share));
  }

  const perWoofer: MergedSource[] = [];
  for (const w of woofers) {
    const wScale = Math.sqrt(w.sdCm2 / sdRef);
    const cone = toComplex(w.spl, w.phaseDeg).map((z) => cplx(z.re * wScale, z.im * wScale));
    // Near-field sum for THIS woofer: its own cone plus its share of the port.
    const nearSum = cone.map((z, i) =>
      portShare ? cplx(z.re + portShare[i].re, z.im + portShare[i].im) : z,
    );

    // STEP 1 — diffraction, before anything is compared.
    const nearStepped = diffractionAfterGain ? nearSum : applyDbCurve(nearSum, step);
    // Geometry: put the near field on the far field's clock.
    const nearTimed = applyDelay(nearStepped, freq, delayS);

    const far = toComplex(w.farSpl, w.farPhaseDeg);
    // STEP 2 — gain, and only now.
    const fit = fitGain(nearTimed, far, idx, freq);
    let nearFinal = nearTimed.map((z) => cplx(z.re * fit.gain, z.im * fit.gain));
    // The wrong order, for the test that proves it is wrong: applying the step
    // AFTER the fit leaves the fit blind to it.
    if (diffractionAfterGain) nearFinal = applyDbCurve(nearFinal, step);

    // STEP 3 — crossfade, in the complex domain. Fading magnitude and phase
    // separately would invent a response neither half has.
    const half = blendOctaves / 2;
    const centre = Math.sqrt(spliceFromHz * spliceToHz);
    const lo = centre * 2 ** -half;
    const hi = centre * 2 ** half;
    const spl = new Array<number>(n);
    const phaseDeg = new Array<number>(n);
    const merged: Complex[] = [];
    for (let i = 0; i < n; i++) {
      const f = freq[i];
      let wFar: number;
      if (f <= lo) wFar = 0;
      else if (f >= hi) wFar = 1;
      else {
        const t = Math.log2(f / lo) / Math.log2(hi / lo);
        wFar = 0.5 - 0.5 * Math.cos(Math.PI * t); // raised cosine, C1 at both ends
      }
      const z = cplx(
        wFar * far[i].re + (1 - wFar) * nearFinal[i].re,
        wFar * far[i].im + (1 - wFar) * nearFinal[i].im,
      );
      merged.push(z);
      spl[i] = dbOf(z);
      phaseDeg[i] = degOf(z);
    }

    const wWarn = [...warnings];
    if (fit.residualDb > 1.5) {
      wWarn.push(
        `⚠ ${w.name}: the two halves disagree by ${fit.residualDb.toFixed(1)} dB RMS across the ` +
          `splice band — one gain cannot fix a shape difference; check the near-field area, the ` +
          `baffle step, or the splice window`,
      );
    }
    if (Math.abs(fit.delayErrorMm) > 15) {
      wWarn.push(
        `⚠ ${w.name}: the residual phase slopes like a ${fit.delayErrorMm.toFixed(0)} mm path ` +
          `error — the computed delay is off, most likely the acoustic-centre depth ` +
          `(${acousticCentreMm} mm) or the measuring distance. The gain fit turns this into a ` +
          `LEVEL error rather than a phase one, so it would otherwise pass unnoticed`,
      );
    }
    if (fit.residualDeg > 25) {
      wWarn.push(
        `⚠ ${w.name}: ${fit.residualDeg.toFixed(0)}° RMS phase disagreement after the geometric ` +
          `delay — check the acoustic-centre depth and the measuring distance (the delay is ` +
          `computed, not fitted, so this is a geometry check)`,
      );
    }

    const segments: ValiditySegment[] = [
      { fromHz: nearBand?.fromHz ?? freq[0], toHz: centre, source: 'nearfield-merged' },
      { fromHz: centre, toHz: freq[n - 1], source: 'gated-farfield' },
    ];
    const meta: SourceMeta = {
      dataSource: 'nearfield-merged',
      validity: {
        fromHz: nearBand?.fromHz ?? freq[0],
        toHz: freq[n - 1],
        reason:
          `below ${Math.round(centre)} Hz from the near field, above it from the ` +
          `${DATA_SOURCE_LABEL['gated-farfield']}`,
      } satisfies ValidityBand,
      derivation:
        `near field spliced at ${Math.round(centre)} Hz (band ${Math.round(spliceFromHz)}–` +
        `${Math.round(spliceToHz)} Hz, blend ${blendOctaves.toFixed(2)} oct); ` +
        `gain ${(20 * Math.log10(fit.gain)).toFixed(2)} dB fitted, ` +
        `delay ${delayUs.toFixed(0)} µs computed from geometry` +
        (port
          ? `; port area ${port.areaCm2} cm² at the ${port.plane}, path +${port.pathExcessMm} mm` +
            (port.mouthZMm !== undefined ? `, mouth at z = ${port.mouthZMm} mm` : '')
          : ''),
    };

    perWoofer.push({
      name: w.name,
      spl,
      phaseDeg,
      gainDb: 20 * Math.log10(fit.gain),
      delayUs,
      residualDb: fit.residualDb,
      residualDeg: fit.residualDeg,
      delayErrorMm: fit.delayErrorMm,
      meta,
      segments,
      warnings: wWarn,
    });
  }

  // Visual check only — see MergerResult.
  const summedSpl = new Array<number>(n);
  const summedPhaseDeg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let re = 0;
    let im = 0;
    for (const m of perWoofer) {
      const z = fromPolar(10 ** (m.spl[i] / 20), (m.phaseDeg[i] * Math.PI) / 180);
      re += z.re;
      im += z.im;
    }
    const z = cplx(re, im);
    summedSpl[i] = dbOf(z);
    summedPhaseDeg[i] = degOf(z);
  }

  const centre = Math.sqrt(spliceFromHz * spliceToHz);
  return {
    perWoofer,
    summedSpl,
    summedPhaseDeg,
    spliceBand: [spliceFromHz, spliceToHz],
    spliceWidthOct,
    warnings: warnings.concat(
      `merged at ${Math.round(centre)} Hz over a ${spliceWidthOct.toFixed(2)} octave window ` +
        `(${Math.round(spliceFromHz)}–${Math.round(spliceToHz)} Hz, derived: gate floor to ` +
        `${SPLICE_KA_MARGIN.toFixed(2)} × ka = 1); the summed curve is a visual check only and ` +
        `is never model input (the pair's interference must stay out of the source data)`,
    ),
  };
}
