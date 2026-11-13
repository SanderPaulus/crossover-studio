/**
 * I-4 — NF/FF MERGE v2: A MERGE THAT EXPLAINS THE FAR FIELD INSTEAD OF FITTING IT.
 *
 * WHAT v1 (`nfMerge.ts` + `nearField.mergeNearFar`) DOES, AND WHY IT IS NOT ENOUGH.
 * v1 fits a level, a delay AND A FREE CONSTANT PHASE OFFSET between an UNGATED
 * near field and a GATED far field. Measured at I-4 on casus 1:
 *
 *   - the free offset read +13° (woofer up), −71° (woofer down), +55° (mid).
 *     Physics (the a/2r relation ARTA AN4 rests on) allows a level and a delay
 *     between near and far field, nothing else: the offset must be 0° or 180°.
 *     Forcing it to 0 moved the merged phase at 362 Hz by −17° (woofer down) and
 *     +25° (mid) — about 30° between woofer and mid, the whole tracking budget;
 *   - the mid's +55° disappears when the PREDICTION is put through the far
 *     field's own gate before comparing (3.3° residual with the offset fixed):
 *     v1 compares an ungated curve with a gated one;
 *   - the woofers' offsets came from a CROSS-SESSION merge: near fields of
 *     11-09-2026 (test box) on far fields of August. With the August near fields
 *     — same session, same dual-channel time base — the woofers merge at 5.1°
 *     and 0.5° with the offset fixed and no echo model at all. A free offset
 *     quietly absorbed the difference between two rigs.
 *
 * So v2 changes three things and adds two:
 *
 *  1. MATCHED GATE. The prediction (near field × near-to-far model) goes through
 *     exactly the window the far field went through before anything is compared.
 *  2. NO FREE OFFSET. Gain and delay are fitted; polarity is 0 or 180°, chosen by
 *     the residual and REPORTED. v1's free offset is still computed — as a
 *     diagnostic, because a large one is the symptom of a mismatch.
 *  3. THE DELAY STARTS FROM THE DATA (cross-correlation in the fit band), never
 *     from a typed value, and with a shared dual-channel time base it is CHECKED
 *     against the arrival times the session measured.
 *  4. ECHO TERMS FROM STATED GEOMETRY ONLY. A reflecting plane (floor, table) is
 *     a term built from heights and a distance the user states — never fitted.
 *     I-4's first analysis fitted a "table reflection" that turned out to be the
 *     cross-session mismatch above; a fitted echo will explain anything.
 *  5. SELF-DIAGNOSIS. Residual per frequency, the free-offset symptom, the timing
 *     check, a session check, and — with raw impulses — the echoes the far field
 *     actually contains (far/near deconvolution), flagged when one lands inside
 *     the gate unmodelled.
 *
 * INPUTS ARE IMPULSES. ARTA `.pir` directly (`parsers/pir.ts`), or an FRD turned
 * into one by `impulseFromFrd` (uniform linear grids only; anything else is
 * refused rather than resampled into something it never was).
 *
 * NOTHING HERE HAS A PROJECT NUMBER (P6). Every frequency, height, distance and
 * gate is an input; the constants below are conventions with their reasons.
 * Nothing imports `engine2/`.
 */

import { fftInPlace, ifftInPlace } from './fft.ts';

export const NF_MERGE_V2_VERSION = 'nf-merge/2.0';

/** c, m/s — the one physical constant the project whitelists (CLAUDE.md, P6). */
export const SPEED_OF_SOUND_M_S = 343;

/* ------------------------------------------------------------------ *
 * Conventions. Each colours a report; none blocks anything (F0).
 * ------------------------------------------------------------------ */

/** Phase residual (rms, fit band) above which the report says the model does
 *  not explain the far field. 10° ≈ a third of the 30° tracking budget. */
export const FIT_RESIDUAL_FLAG_DEG = 10;
/** A v1-style free offset this far from 0/180° is the symptom of a mismatch
 *  (casus 1: 13–71° on UNMATCHED merges — v1, V54 — and on a far-field FRD gated with a
 *  misread window, V60; ±10–16° on clean same-window merges, V55). */
export const FREE_OFFSET_FLAG_DEG = 20;
/**
 * V60. A far field that arrives ALREADY gated (rebuilt from an FRD) must be silent after the
 * right edge of the gate it was exported with: past it there is only the smear of the
 * measuring program's calibration correction. Energy over the span below, relative to the whole
 * impulse, above this level means the stated gate is not the one that was applied — on casus 1
 * the misread edge (ref + 2.521 instead of ref + 5.021 ms) leaves −15 / −21 / −28 dB
 * (woofer down / up / mid), the right edge −38 / −41 / −38 dB. A convention, not a property.
 */
export const GATE_TAIL_FLAG_DB = -30;
/** How far past the right edge the tail check looks, ms (the first reflections of a room). */
export const GATE_TAIL_SPAN_MS = 20;
/**
 * Fitted delay vs the session's measured arrivals. Arrivals are impulse PEAKS,
 * and a woofer's peak sits late by its own rise time, so tens of millimetres of
 * difference are normal and only noted. What the check exists for is the fit
 * locking onto the wrong cycle: a quarter period at the fit band's centre.
 */
export const TIMING_FLAG_PERIOD_FRACTION = 0.25;
/** An echo in the far/near deconvolution this strong, inside the gate and not
 *  modelled, is reported as a hint. */
export const ECHO_HINT_DB = -20;
/**
 * The echo finder looks only where near and far field are comparable: the fit
 * band, half an octave either side. Wider is tempting (an echo 1 ms after the
 * direct sound needs over a kilohertz to stand apart), but above ka ≈ 1 a
 * woofer's near field is not its far field — breakup and directivity off the
 * mic axis — and that difference reads as strong "echoes" that are not there
 * (casus 1, woofer down: −3 dB at 1.0 ms while the fit band explained the far
 * field to 2.2°). An echo closer to the direct sound than this band can resolve
 * is still caught: it shows in the residual. The note says which delays the
 * finder could not see.
 */
export const ECHO_FINDER_BAND_OCT: readonly [number, number] = [-0.5, 0.5];
/**
 * A `boundary` is accepted while its image's extra delay (2·h/c) stays under this fraction of a
 * period at the top of the fit band — the same quarter period `TIMING_FLAG_PERIOD_FRACTION` uses
 * for "the fit cannot tell these apart". Casus 1's 300–576 Hz band: up to 7.4 cm.
 */
export const BOUNDARY_MAX_PERIOD_FRACTION = 0.25;
/** Echo removal never divides by less than this (a notch is not inverted into a spike). */
export const ECHO_DIVIDE_FLOOR_DB = -12;
/**
 * The matched comparison needs a full-band prediction to window. Above the fit
 * band the near field stops being the far field (ka > 1), so the prediction is
 * handed over to the measured far field between these two points, in octaves
 * above the top of the fit band: far enough up that the gate's spectral
 * leakage back into the fit band is the far field's own, close enough that the
 * near field is still sane where it fades.
 */
export const MATCH_HANDOFF_OCT: readonly [number, number] = [1 / 6, 2 / 3];

export class MergeV2Error extends Error {
  /** The input field that is missing or wrong — P4: say which. */
  constructor(public readonly field: string, message: string) {
    super(message);
  }
}

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface Impulse {
  name: string;
  sampleRate: number;
  samples: Float64Array;
  /**
   * 'session': sample 0 is t = 0 of a dual-channel time base shared by every
   * impulse of the same session (ARTA dual-channel `.pir`). 'file': the time
   * axis is this file's own (an FRD's reference time, a single-channel IR).
   */
  timeBase: 'session' | 'file';
  /** True when the samples are already gated (an impulse rebuilt from a gated FRD). */
  alreadyGated: boolean;
  /** Free-text session label as the user states it (date, rig). Compared, never inferred. */
  session?: string | null;
}

/**
 * The far field's gate, in the impulse's own time axis. For a session, use ONE
 * reference for every driver (the tweeter's arrival, as VituixCAD prescribes):
 * the merged phase is referenced to it, so the drivers keep their timing.
 */
export interface Gate {
  /** Reference time, ms from sample 0. The output phase is relative to it. */
  referenceMs: number;
  /** Rectangular left flank: this many ms BEFORE the reference. */
  leftMs: number;
  /** Right edge: this many ms AFTER the reference. */
  rightMs: number;
  /** Tukey taper on the right flank, as a fraction of `rightMs` (0 = rectangular). */
  rightTaper: number;
}

/** What turns a half-space near field into a full-space far field. */
export type NearToFarModel =
  | { kind: 'none' }
  /** The app's first-order dB shelf (`baffleStepShelfDb`), with its minimum phase. */
  | { kind: 'shelf'; hz: number; depthDb: number }
  /** ARTA AN4: p4π/p2π = (1 + jf/f0)/(2 + jf/f0). */
  | { kind: 'an4'; f0Hz: number }
  /** A complex transfer the user supplies (BEM of the rig, or a measured one). */
  | { kind: 'transfer'; name: string; freqHz: readonly number[]; re: readonly number[]; im: readonly number[] };

/** A rigid reflecting plane under or beside the source: an image source from STATED geometry. */
export interface PlaneEcho {
  kind: 'plane';
  label: string;
  /** Acoustic centre of the source above the plane, m. */
  sourceAboveM: number;
  /** Microphone above the plane, m. */
  micAboveM: number;
  /** Horizontal distance source → microphone, m. */
  horizontalM: number;
}
/**
 * A plane the source sits ON, not one it is reflected in (I-4, 13-11-2026): a downfiring port
 * blowing onto a table top, a driver flush with a floor. Its image is closer than the fit band
 * can tell from the source itself, so it is part of the source as the near field measured it,
 * not an echo. It changes no prediction; it is stated so the reader can see it was considered,
 * and so it is never counted as an unmodelled echo inside the gate. A plane farther away than
 * `BOUNDARY_MAX_PERIOD_FRACTION` of a period at the top of the fit band is refused here: that is
 * an echo, and belongs in the list as a `plane`.
 */
export interface BoundaryTerm {
  kind: 'boundary';
  label: string;
  /** Acoustic centre (or effective source) above the plane, m. 0 = on it. */
  sourceAboveM: number;
}
export type EchoTerm = PlaneEcho | BoundaryTerm;

export interface MergeV2Input {
  far: Impulse;
  /** The cone's near field. */
  near: Impulse;
  /**
   * Optional port / passive radiator near field and its weight in Keele's sum (`portWeight`).
   * `echoes` are the port's OWN reflections (I-4): its mouth sits at its own height, so its image
   * in a plane arrives at its own delay. They are never inherited from the cone's — once the cone
   * states a plane, the port must state its own list (`[]` for none). `sdCm2` gives them the
   * mouth's piston directivity; null or absent: omnidirectional.
   */
  port?: { impulse: Impulse; weight: number; echoes?: readonly EchoTerm[]; sdCm2?: number | null } | null;
  gate: Gate;
  model: NearToFarModel;
  /** Stated echo terms of the CONE (the port states its own). `[]` means "none", and the echo check still runs. */
  echoes: readonly EchoTerm[];
  /** Cone area, cm² — gives echo terms the piston's directivity. Null: omnidirectional. */
  sdCm2?: number | null;
  /** Where gain and delay are fitted, Hz. Stated (suggestions live in `nfMerge.ts`). */
  fitBandHz: readonly [number, number];
  /** Where the output hands over from prediction to far field, Hz. */
  spliceBandHz: readonly [number, number];
  /** Output grid. */
  output: { fromHz: number; toHz: number; pointsPerOctave: number };
}

export interface FoundEcho {
  /** After the direct sound, ms. */
  afterDirectMs: number;
  /** Relative to the direct sound, dB. */
  levelDb: number;
  insideGate: boolean;
  /** True when a stated echo term sits within 0.15 ms of it. */
  modelled: boolean;
}

export interface MergeV2Result {
  version: string;
  /** Output grid, Hz, and the merged response; phase relative to `gate.referenceMs`. */
  freq: number[];
  spl: number[];
  phaseDeg: number[];
  /** The two halves on the same grid, same reference — the overlay graph. */
  predictionDb: number[];
  predictionPhaseDeg: number[];
  farGatedDb: number[];
  farGatedPhaseDeg: number[];
  fit: {
    gainDb: number;
    /** Shift from the near field's time axis to the far field's, ms. */
    delayMs: number;
    polarityDeg: 0 | 180;
    residualRmsDeg: number;
    residualRmsDb: number;
    /** Per frequency inside the fit band — the residual graph. */
    residual: { freq: number[]; deg: number[]; db: number[] };
  };
  /** v1's question asked of the same data: what a free offset would absorb. Diagnostic only. */
  freeOffset: { offsetDeg: number; residualRmsDeg: number };
  /** v1's unmatched free offset on the same data — what v1 would have absorbed. Reported, never used. */
  v1OffsetDeg: number;
  /** Only with a shared session time base. */
  timing: { farArrivalMs: number; nearArrivalMs: number; arrivalDelayMs: number; differenceUs: number } | null;
  /** Only with raw (not already gated) impulses. */
  echoesFound: FoundEcho[] | null;
  /** Self-diagnosis, plain sentences. Empty = nothing to report. */
  flags: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ *
 * Spectra
 * ------------------------------------------------------------------ */

interface Spec {
  re: Float64Array;
  im: Float64Array;
}

const nextPow2 = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

function padTo(x: Float64Array, n: number): Float64Array {
  if (x.length === n) return x;
  const out = new Float64Array(n);
  out.set(x.subarray(0, Math.min(n, x.length)));
  return out;
}

/** Half spectrum (bins 0..N/2) of a real signal. */
function rfft(x: Float64Array): Spec {
  const n = x.length;
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  fftInPlace(re, im);
  return { re: re.slice(0, n / 2 + 1), im: im.slice(0, n / 2 + 1) };
}

/** Real signal of length N from a half spectrum. */
function irfft(s: Spec, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k <= n / 2; k++) {
    re[k] = s.re[k];
    im[k] = s.im[k];
  }
  for (let k = 1; k < n / 2; k++) {
    re[n - k] = s.re[k];
    im[n - k] = -s.im[k];
  }
  im[0] = 0;
  im[n / 2] = 0;
  ifftInPlace(re, im);
  return re;
}

function mulSpec(a: Spec, b: Spec): Spec {
  const re = new Float64Array(a.re.length);
  const im = new Float64Array(a.re.length);
  for (let k = 0; k < re.length; k++) {
    re[k] = a.re[k] * b.re[k] - a.im[k] * b.im[k];
    im[k] = a.re[k] * b.im[k] + a.im[k] * b.re[k];
  }
  return { re, im };
}

function binFreqs(n: number, fs: number): Float64Array {
  const f = new Float64Array(n / 2 + 1);
  for (let k = 0; k < f.length; k++) f[k] = (k * fs) / n;
  return f;
}

/* ------------------------------------------------------------------ *
 * Models
 * ------------------------------------------------------------------ */

/** Minimum phase (rad) of a magnitude given on the FFT grid itself (real cepstrum). */
function minPhaseOnGrid(db: Float64Array, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const LN10_20 = Math.LN10 / 20;
  for (let k = 0; k <= n / 2; k++) re[k] = db[k] * LN10_20;
  for (let k = 1; k < n / 2; k++) re[n - k] = re[k];
  ifftInPlace(re, im);
  for (let i = 1; i < n / 2; i++) re[i] *= 2;
  for (let i = n / 2 + 1; i < n; i++) re[i] = 0;
  im.fill(0);
  fftInPlace(re, im);
  return im.slice(0, n / 2 + 1);
}

function modelSpec(model: NearToFarModel, f: Float64Array, n: number): Spec {
  const re = new Float64Array(f.length);
  const im = new Float64Array(f.length);
  switch (model.kind) {
    case 'none':
      re.fill(1);
      break;
    case 'an4':
      for (let k = 0; k < f.length; k++) {
        const x = f[k] / model.f0Hz;
        // (1 + jx)/(2 + jx)
        const d = 4 + x * x;
        re[k] = (2 + x * x) / d;
        im[k] = x / d;
      }
      break;
    case 'shelf': {
      const db = new Float64Array(f.length);
      for (let k = 0; k < f.length; k++) db[k] = -model.depthDb / (1 + f[k] / model.hz);
      const ph = minPhaseOnGrid(db, n);
      for (let k = 0; k < f.length; k++) {
        const m = 10 ** (db[k] / 20);
        re[k] = m * Math.cos(ph[k]);
        im[k] = m * Math.sin(ph[k]);
      }
      break;
    }
    case 'transfer': {
      const { freqHz, re: tr, im: ti } = model;
      const mag = freqHz.map((_, i) => Math.hypot(tr[i], ti[i]));
      const ph: number[] = [];
      let prev = 0;
      for (let i = 0; i < freqHz.length; i++) {
        let p = Math.atan2(ti[i], tr[i]);
        if (i > 0) while (p - prev > Math.PI) p -= 2 * Math.PI;
        if (i > 0) while (p - prev < -Math.PI) p += 2 * Math.PI;
        ph.push(p);
        prev = p;
      }
      for (let k = 0; k < f.length; k++) {
        const fk = Math.min(Math.max(f[k], freqHz[0]), freqHz[freqHz.length - 1]);
        let j = 1;
        while (j < freqHz.length - 1 && freqHz[j] < fk) j++;
        const t = (fk - freqHz[j - 1]) / (freqHz[j] - freqHz[j - 1] || 1);
        const m = mag[j - 1] + t * (mag[j] - mag[j - 1]);
        const p = ph[j - 1] + t * (ph[j] - ph[j - 1]);
        re[k] = m * Math.cos(p);
        im[k] = m * Math.sin(p);
      }
      break;
    }
  }
  return { re, im };
}

/** J1 (Numerical Recipes rational/asymptotic approximation, |error| < 1e-7). */
export function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const b = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a / b;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const a = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  return x < 0 ? -ans : ans;
}

/** Rigid-piston directivity 2·J1(ka·sinθ)/(ka·sinθ). */
function piston(f: number, radiusM: number, theta: number): number {
  const x = ((2 * Math.PI * f) / SPEED_OF_SOUND_M_S) * radiusM * Math.abs(Math.sin(theta));
  return x < 1e-6 ? 1 : (2 * besselJ1(x)) / x;
}

/** Arrival delay of a plane echo after the direct sound, s. */
export function planeEchoDelayS(e: PlaneEcho): number {
  const rd = Math.hypot(e.horizontalM, e.micAboveM - e.sourceAboveM);
  const ri = Math.hypot(e.horizontalM, e.micAboveM + e.sourceAboveM);
  return (ri - rd) / SPEED_OF_SOUND_M_S;
}

function echoSpec(echoes: readonly EchoTerm[], f: Float64Array, sdCm2: number | null): Spec {
  const re = new Float64Array(f.length).fill(1);
  const im = new Float64Array(f.length);
  const radius = sdCm2 && sdCm2 > 0 ? Math.sqrt(sdCm2 / 1e4 / Math.PI) : 0;
  for (const e of echoes) {
    if (e.kind === 'boundary') continue; // part of the source as measured — not an echo
    const rd = Math.hypot(e.horizontalM, e.micAboveM - e.sourceAboveM);
    const ri = Math.hypot(e.horizontalM, e.micAboveM + e.sourceAboveM);
    const td = Math.atan2(e.micAboveM - e.sourceAboveM, e.horizontalM);
    const ti = Math.atan2(e.micAboveM + e.sourceAboveM, e.horizontalM);
    const dt = (ri - rd) / SPEED_OF_SOUND_M_S;
    for (let k = 0; k < f.length; k++) {
      const dir = radius > 0 ? piston(f[k], radius, ti) / piston(f[k], radius, td) : 1;
      const g = (rd / ri) * dir;
      const ph = -2 * Math.PI * f[k] * dt;
      // multiply the running product by (1 + g·e^{jph}) — echoes of distinct planes multiply
      const tr = 1 + g * Math.cos(ph);
      const ti2 = g * Math.sin(ph);
      const r0 = re[k];
      re[k] = r0 * tr - im[k] * ti2;
      im[k] = r0 * ti2 + im[k] * tr;
    }
  }
  return { re, im };
}

/* ------------------------------------------------------------------ *
 * Gate
 * ------------------------------------------------------------------ */

/** The gate as a window over N samples (circular: negative times wrap to the end). */
export function gateWindow(gate: Gate, sampleRate: number, n: number): Float64Array {
  const w = new Float64Array(n);
  const ref = (gate.referenceMs / 1000) * sampleRate;
  const taperStart = gate.rightMs * (1 - gate.rightTaper);
  for (let i = 0; i < n; i++) {
    let tMs = ((i - ref) / sampleRate) * 1000;
    const span = (n / sampleRate) * 1000;
    if (tMs > span / 2) tMs -= span;
    if (tMs < -span / 2) tMs += span;
    if (tMs < -gate.leftMs || tMs > gate.rightMs) continue;
    if (tMs <= taperStart || gate.rightTaper === 0) w[i] = 1;
    else w[i] = 0.5 * (1 + Math.cos((Math.PI * (tMs - taperStart)) / (gate.rightMs - taperStart)));
  }
  return w;
}

/** Index of the impulse's largest absolute sample, as ms. A peak, not an onset — say so where it is used. */
export function arrivalMs(imp: Impulse): number {
  let best = 0;
  let idx = 0;
  for (let i = 0; i < imp.samples.length; i++) {
    const a = Math.abs(imp.samples[i]);
    if (a > best) {
      best = a;
      idx = i;
    }
  }
  return (idx / imp.sampleRate) * 1000;
}

/** A parsed `.pir` as a merge input. Dual-channel impulses share their session's time base. */
export function impulseFromPir(
  name: string,
  pir: { sampleRate: number; samples: Float64Array; measurementType: string },
  session: string | null = null,
): Impulse {
  return {
    name,
    sampleRate: pir.sampleRate,
    samples: pir.samples,
    timeBase: pir.measurementType === 'dual-channel' ? 'session' : 'file',
    alreadyGated: false,
    session,
  };
}

/* ------------------------------------------------------------------ *
 * FRD → impulse
 * ------------------------------------------------------------------ */

/**
 * An FRD on a UNIFORM linear grid (ARTA exports are) back into the impulse it
 * came from, its reference time at sample 0. A log-spaced or resampled FRD is
 * refused: interpolating it onto an FFT grid invents a time signal the file
 * never held.
 */
/**
 * The gate an ARTA export states, as a `Gate` (V60). ARTA writes `Left window`, `Reference time`
 * and `Right window`; Left and Right are LENGTHS measured from the reference time, not positions
 * on the record. Measured on casus 1 (August): the phase zero of every FRD is its reference time,
 * and FRD ÷ (window × raw PIR) is flat on all three drivers only with the right edge at
 * reference + Right window (5.021 ms), not at Right window − reference (2.521 ms).
 * `referenceAtMs` is where that reference sits on the impulse being gated: 0 for an impulse
 * rebuilt from the FRD itself (its phase zero), the reference's position on the record for a raw
 * impulse. `rightTaper` is the Tukey fraction the header names.
 */
export function gateFromArtaHeader(
  header: { leftWindowMs: number; rightWindowMs: number; rightTaper: number },
  referenceAtMs: number,
): Gate {
  return { referenceMs: referenceAtMs, leftMs: header.leftWindowMs, rightMs: header.rightWindowMs, rightTaper: header.rightTaper };
}

export function impulseFromFrd(opts: {
  name: string;
  freq: readonly number[];
  splDb: readonly number[];
  phaseDeg: readonly number[];
  sampleRate: number;
  /** Total length wanted (power of two ≥ the file's own FFT length). */
  length: number;
  alreadyGated: boolean;
  session?: string | null;
}): Impulse {
  const { freq } = opts;
  if (freq.length < 8) throw new MergeV2Error('frd', `${opts.name}: too few points to rebuild an impulse.`);
  // ARTA writes frequencies rounded to two decimals, so the spacing jitters in the last digit.
  // The test is therefore "every point sits on a bin of one power-of-two FFT", not "equal spacing".
  const dfRough = (freq[freq.length - 1] - freq[0]) / (freq.length - 1);
  const nFile = 2 ** Math.round(Math.log2(opts.sampleRate / dfRough));
  const df = opts.sampleRate / nFile;
  const offGrid = freq.find((fq) => Math.abs(fq / df - Math.round(fq / df)) > 0.25);
  if (offGrid !== undefined || Math.abs(dfRough / df - 1) > 0.01) {
    throw new MergeV2Error('frd', `${opts.name}: not on a uniform linear grid — export it unsmoothed from the impulse, or load the .pir.`);
  }
  const half: Spec = { re: new Float64Array(nFile / 2 + 1), im: new Float64Array(nFile / 2 + 1) };
  for (let i = 0; i < freq.length; i++) {
    const k = Math.round(freq[i] / df);
    if (k < 0 || k > nFile / 2) continue;
    const m = 10 ** (opts.splDb[i] / 20);
    const p = (opts.phaseDeg[i] * Math.PI) / 180;
    half.re[k] = m * Math.cos(p);
    half.im[k] = m * Math.sin(p);
  }
  const x = irfft(half, nFile);
  const n = Math.max(opts.length, nFile);
  const out = new Float64Array(n);
  // keep circular order: positive times at the start, negative times at the end
  for (let i = 0; i < nFile / 2; i++) out[i] = x[i];
  for (let i = nFile / 2; i < nFile; i++) out[n - nFile + i] = x[i];
  return { name: opts.name, sampleRate: opts.sampleRate, samples: out, timeBase: 'file', alreadyGated: opts.alreadyGated, session: opts.session ?? null };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function validate(input: MergeV2Input): void {
  const { far, near, gate } = input;
  const fs = far.sampleRate;
  if (near.sampleRate !== fs) throw new MergeV2Error('near.sampleRate', `Near field at ${near.sampleRate} Hz, far field at ${fs} Hz — resample one of them in the measuring program.`);
  if (input.port && input.port.impulse.sampleRate !== fs) throw new MergeV2Error('port.sampleRate', 'Port and far field differ in sample rate.');
  if (input.port && !(input.port.weight > 0)) throw new MergeV2Error('port.weight', 'A port near field needs its weight in Keele\'s sum (portWeight) — no default.');
  for (const [k, v] of Object.entries(gate)) if (!Number.isFinite(v)) throw new MergeV2Error(`gate.${k}`, `Gate ${k} is not stated.`);
  if (!(gate.rightMs > 0) || gate.leftMs < 0) throw new MergeV2Error('gate', 'The gate needs a right edge after the reference and a left flank ≥ 0.');
  if (gate.rightTaper < 0 || gate.rightTaper > 1) throw new MergeV2Error('gate.rightTaper', 'Taper is a fraction between 0 and 1.');
  const [fl, fh] = input.fitBandHz;
  if (!(fl > 0 && fh > fl && fh < fs / 2)) throw new MergeV2Error('fitBandHz', 'Fit band must satisfy 0 < low < high < Nyquist.');
  const [sl, sh] = input.spliceBandHz;
  if (!(sl > 0 && sh > sl)) throw new MergeV2Error('spliceBandHz', 'Splice band must satisfy 0 < low < high.');
  const o = input.output;
  if (!(o.fromHz > 0 && o.toHz > o.fromHz && o.toHz < fs / 2 && o.pointsPerOctave > 0)) throw new MergeV2Error('output', 'Output grid needs 0 < from < to < Nyquist and points per octave > 0.');
  if (input.model.kind === 'shelf' && !(input.model.hz > 0 && input.model.depthDb >= 0)) throw new MergeV2Error('model', 'Shelf needs a corner > 0 Hz and a depth ≥ 0 dB.');
  if (input.model.kind === 'an4' && !(input.model.f0Hz > 0)) throw new MergeV2Error('model', 'AN4 model needs f0 > 0 Hz.');
  const checkEchoes = (list: readonly EchoTerm[], field: string): void => {
    for (const e of list) {
      if (e.kind === 'boundary') {
        if (!(e.sourceAboveM >= 0 && Number.isFinite(e.sourceAboveM))) {
          throw new MergeV2Error(`${field}.${e.label}`, `Boundary "${e.label}" needs the source's height above it, ≥ 0 m.`);
        }
        const maxM = (BOUNDARY_MAX_PERIOD_FRACTION / fh) * SPEED_OF_SOUND_M_S / 2;
        if (e.sourceAboveM > maxM) {
          throw new MergeV2Error(
            `${field}.${e.label}`,
            `"${e.label}" is ${(e.sourceAboveM * 100).toFixed(1)} cm from the source — farther than ${(maxM * 100).toFixed(1)} cm, ` +
              `so its image is an echo the fit band can see, not a boundary. State it as a plane.`,
          );
        }
        continue;
      }
      if (!(e.sourceAboveM > 0 && e.micAboveM > 0 && e.horizontalM > 0)) {
        throw new MergeV2Error(`${field}.${e.label}`, `Echo "${e.label}" needs source height, mic height and distance, all > 0 m.`);
      }
    }
  };
  checkEchoes(input.echoes, 'echoes');
  if (input.port) {
    if (input.port.echoes) checkEchoes(input.port.echoes, 'port.echoes');
    else if (input.echoes.some((e) => e.kind === 'plane')) {
      throw new MergeV2Error(
        'port.echoes',
        "The cone states a reflecting plane but the port states none: the port's mouth sits at its own height, so its image arrives at its own delay. " +
          'State the port\'s own reflections ([] for none) — they are not inherited.',
      );
    }
    if (input.port.sdCm2 != null && !(input.port.sdCm2 > 0)) throw new MergeV2Error('port.sdCm2', 'Port mouth area must be > 0 cm², or left out.');
  }
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

export function mergeImpulsesV2(input: MergeV2Input): MergeV2Result {
  validate(input);
  const flags: string[] = [];
  const notes: string[] = [];
  const fs = input.far.sampleRate;
  const lens = [input.far.samples.length, input.near.samples.length, input.port?.impulse.samples.length ?? 0];
  const n = nextPow2(Math.max(...lens));
  const f = binFreqs(n, fs);
  const W = gateWindow(input.gate, fs, n);

  const farX = padTo(input.far.samples, n);
  const farRaw = rfft(farX);
  const farGatedSig = new Float64Array(n);
  for (let i = 0; i < n; i++) farGatedSig[i] = input.far.alreadyGated ? farX[i] : farX[i] * W[i];
  const Fg = rfft(farGatedSig);

  const coneS = rfft(padTo(input.near.samples, n));
  let nearS = coneS;
  let portW: Spec | null = null; // weight × port near field
  if (input.port) {
    const p = rfft(padTo(input.port.impulse.samples, n));
    const w = input.port.weight;
    portW = { re: p.re.map((v) => w * v), im: p.im.map((v) => w * v) };
    nearS = { re: coneS.re.map((v, k) => v + portW!.re[k]), im: coneS.im.map((v, k) => v + portW!.im[k]) };
  }
  const M = modelSpec(input.model, f, n);
  const E = echoSpec(input.echoes, f, input.sdCm2 ?? null); // the cone's reflections
  const Panech = mulSpec(nearS, M); // anechoic prediction (what the output uses)
  // What the far field should hold (what the fit compares): each source with its OWN reflections.
  const P = (() => {
    if (!portW) return mulSpec(Panech, E);
    const Ep = echoSpec(input.port!.echoes ?? [], f, input.port!.sdCm2 ?? null);
    const cone = mulSpec(mulSpec(coneS, M), E);
    const port = mulSpec(mulSpec(portW, M), Ep);
    return { re: cone.re.map((v, k) => v + port.re[k]), im: cone.im.map((v, k) => v + port.im[k]) };
  })();
  for (const b of [...input.echoes, ...(input.port?.echoes ?? [])]) {
    if (b.kind === 'boundary') {
      notes.push(`boundary "${b.label}" ${(b.sourceAboveM * 100).toFixed(1)} cm from its source: part of the source as measured, not an echo`);
    }
  }

  const [fitLo, fitHi] = input.fitBandHz;
  const kLo = Math.ceil(fitLo / (fs / n));
  const kHi = Math.floor(fitHi / (fs / n));
  const hand0 = fitHi * 2 ** MATCH_HANDOFF_OCT[0];
  const hand1 = fitHi * 2 ** MATCH_HANDOFF_OCT[1];
  const c = f.map((fk) => {
    if (fk <= hand0) return 0;
    if (fk >= hand1) return 1;
    const x = Math.log(fk / hand0) / Math.log(hand1 / hand0);
    return 0.5 - 0.5 * Math.cos(Math.PI * x);
  });
  // B: the measured far field above the handoff, through the gate.
  const farHigh: Spec = { re: farRaw.re.map((v, k) => v * c[k]), im: farRaw.im.map((v, k) => v * c[k]) };
  const Bsig = irfft(farHigh, n);
  // Through the gate on BOTH routes (V60): the far field's high part leaks into the fit band
  // through the window exactly as the prediction's low part does. Measured on casus 1 (August):
  // with this, the FRD route and the PIR route under the same window agree within 0.36°;
  // without it, up to 2.2° apart.
  for (let i = 0; i < n; i++) Bsig[i] *= W[i];
  const B = rfft(Bsig);
  if (input.far.alreadyGated) {
    notes.push('far field arrives already gated (rebuilt from an FRD): the stated gate must be the one the FRD was exported with — ARTA states Left/Right window as LENGTHS from the reference time (V60)');
  }

  // A(τ, s): the prediction below the handoff, shifted, through the same gate.
  const predictionThroughGate = (tauS: number, sign: 1 | -1): Spec => {
    const lo: Spec = { re: new Float64Array(f.length), im: new Float64Array(f.length) };
    for (let k = 0; k < f.length; k++) {
      const ph = -2 * Math.PI * f[k] * tauS;
      const cr = Math.cos(ph);
      const ci = Math.sin(ph);
      const w = (1 - c[k]) * sign;
      lo.re[k] = w * (P.re[k] * cr - P.im[k] * ci);
      lo.im[k] = w * (P.re[k] * ci + P.im[k] * cr);
    }
    const sig = irfft(lo, n);
    for (let i = 0; i < n; i++) sig[i] *= W[i];
    return rfft(sig);
  };

  interface Eval {
    tau: number;
    sign: 1 | -1;
    gain: number;
    rmsDeg: number;
    rmsDb: number;
    A: Spec;
  }
  const evaluate = (tau: number, sign: 1 | -1): Eval => {
    const A = predictionThroughGate(tau, sign);
    let num = 0;
    let den = 0;
    for (let k = kLo; k <= kHi; k++) {
      const yr = Fg.re[k] - B.re[k];
      const yi = Fg.im[k] - B.im[k];
      num += A.re[k] * yr + A.im[k] * yi;
      den += A.re[k] * A.re[k] + A.im[k] * A.im[k];
    }
    const gain = den > 0 ? num / den : 0;
    let sd = 0;
    let sdb = 0;
    let cnt = 0;
    for (let k = kLo; k <= kHi; k++) {
      const mr = gain * A.re[k] + B.re[k];
      const mi = gain * A.im[k] + B.im[k];
      const er = (Fg.re[k] * mr + Fg.im[k] * mi) / (mr * mr + mi * mi || 1e-30);
      const ei = (Fg.im[k] * mr - Fg.re[k] * mi) / (mr * mr + mi * mi || 1e-30);
      const deg = (Math.atan2(ei, er) * 180) / Math.PI;
      sd += deg * deg;
      const db = 10 * Math.log10(er * er + ei * ei || 1e-30);
      sdb += db * db;
      cnt++;
    }
    return { tau, sign, gain, rmsDeg: Math.sqrt(sd / cnt), rmsDb: Math.sqrt(sdb / cnt), A };
  };

  // Start value from the data: band-limited cross-correlation, global over the whole record.
  const xc: Spec = { re: new Float64Array(f.length), im: new Float64Array(f.length) };
  for (let k = kLo; k <= kHi; k++) {
    // conj(P)·FarRaw
    xc.re[k] = P.re[k] * farRaw.re[k] + P.im[k] * farRaw.im[k];
    xc.im[k] = P.re[k] * farRaw.im[k] - P.im[k] * farRaw.re[k];
  }
  const r = irfft(xc, n);
  let lag = 0;
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    if (Math.abs(r[i]) > best) {
      best = Math.abs(r[i]);
      lag = i;
    }
  }
  const tau0 = (lag > n / 2 ? lag - n : lag) / fs;

  // Scan ±half a period of the band's lowest frequency around it, both polarities, then refine in stages.
  const span = 0.5 / fitLo;
  let step = 4 / fs;
  let bestEval: Eval | null = null;
  for (const sign of [1, -1] as const) {
    for (let t = tau0 - span; t <= tau0 + span; t += step) {
      const e = evaluate(t, sign);
      if (e.gain > 0 && (!bestEval || e.rmsDeg < bestEval.rmsDeg)) bestEval = e;
    }
  }
  if (!bestEval) throw new MergeV2Error('fit', 'No delay in the search range gave a positive gain — the two files do not describe the same source.');
  for (const next of [8e-6, 1e-6, 0.25e-6]) {
    const centre: number = bestEval.tau;
    for (let t = centre - step; t <= centre + step + 1e-12; t += next) {
      const e = evaluate(t, bestEval.sign);
      if (e.gain > 0 && e.rmsDeg < bestEval.rmsDeg) bestEval = e;
    }
    step = next;
  }
  const fit = bestEval;
  if (fit.rmsDeg > FIT_RESIDUAL_FLAG_DEG) {
    flags.push(
      `The model does not explain the far field: ${fit.rmsDeg.toFixed(1)}° rms phase residual over ${fitLo}–${fitHi} Hz ` +
        `(convention ${FIT_RESIDUAL_FLAG_DEG}°). First check that the gate was read correctly from the header ` +
        `(ARTA's Left and Right window are lengths from the reference time, V60); then look for an echo inside the gate, ` +
        `or a near-to-far model that does not fit this cabinet.`,
    );
  }
  if (fit.sign === -1) flags.push('The near and far field are of opposite polarity (180°) — check the wiring of one measurement.');

  // Residual per frequency, on the fit band's own bins (decimated to the output density).
  const residual = { freq: [] as number[], deg: [] as number[], db: [] as number[] };
  {
    const step = Math.max(1, Math.floor((kHi - kLo) / (Math.log2(fitHi / fitLo) * input.output.pointsPerOctave)));
    for (let k = kLo; k <= kHi; k += step) {
      const mr = fit.gain * fit.A.re[k] + B.re[k];
      const mi = fit.gain * fit.A.im[k] + B.im[k];
      const d = mr * mr + mi * mi || 1e-30;
      const er = (Fg.re[k] * mr + Fg.im[k] * mi) / d;
      const ei = (Fg.im[k] * mr - Fg.re[k] * mi) / d;
      residual.freq.push(f[k]);
      residual.deg.push((Math.atan2(ei, er) * 180) / Math.PI);
      residual.db.push(10 * Math.log10(er * er + ei * ei || 1e-30));
    }
  }

  // Would a free offset still help once the gate is matched? Unwrapped phase of the matched
  // residual, straight line, free intercept. Near 0 on a sound merge; large = a real mismatch.
  const lineFit = (xs: number[], ys: number[]): { a: number; rms: number } => {
    const mx = xs.reduce((p, q) => p + q, 0) / xs.length;
    const my = ys.reduce((p, q) => p + q, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < xs.length; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
    }
    const b = sxy / sxx;
    const a = my - b * mx;
    let rr = 0;
    for (let i = 0; i < xs.length; i++) rr += (ys[i] - (a + b * xs[i])) ** 2;
    return { a, rms: Math.sqrt(rr / xs.length) };
  };
  const unwrapBand = (phaseAt: (k: number) => number): { xs: number[]; ys: number[] } => {
    const xs: number[] = [];
    const ys: number[] = [];
    let prev = 0;
    for (let k = kLo; k <= kHi; k++) {
      let d = phaseAt(k);
      if (xs.length === 0) d = Math.atan2(Math.sin(d), Math.cos(d));
      else {
        while (d - prev > Math.PI) d -= 2 * Math.PI;
        while (d - prev < -Math.PI) d += 2 * Math.PI;
      }
      xs.push(f[k]);
      ys.push(d);
      prev = d;
    }
    return { xs, ys };
  };
  const wrapDeg = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;
  const freeOffset = (() => {
    const { xs, ys } = unwrapBand((k) => {
      const mr = fit.gain * fit.A.re[k] + B.re[k];
      const mi = fit.gain * fit.A.im[k] + B.im[k];
      return Math.atan2(Fg.im[k], Fg.re[k]) - Math.atan2(mi, mr);
    });
    const { a, rms } = lineFit(xs, ys);
    return { offsetDeg: wrapDeg((a * 180) / Math.PI), residualRmsDeg: (rms * 180) / Math.PI };
  })();
  // v1's own question, unmatched: reported so the block can show what v1 would have absorbed.
  const v1Offset = (() => {
    const { xs, ys } = unwrapBand((k) => Math.atan2(Fg.im[k], Fg.re[k]) - Math.atan2(P.im[k], P.re[k]));
    return wrapDeg((lineFit(xs, ys).a * 180) / Math.PI);
  })();
  if (Math.abs(freeOffset.offsetDeg) > FREE_OFFSET_FLAG_DEG) {
    flags.push(
      `Even with a matched gate a free phase offset of ${freeOffset.offsetDeg.toFixed(0)}° would still help: the halves differ by more than a level and a delay.`,
    );
  }
  notes.push(`v1 (ungated prediction, free offset) would have absorbed ${v1Offset.toFixed(0)}° here`);

  // Timing against the session's own time base.
  let timing: MergeV2Result['timing'] = null;
  if (input.far.timeBase === 'session' && input.near.timeBase === 'session') {
    const farA = arrivalMs(input.far);
    const nearA = arrivalMs(input.near);
    const diffUs = (fit.tau * 1000 - (farA - nearA)) * 1000;
    timing = { farArrivalMs: farA, nearArrivalMs: nearA, arrivalDelayMs: farA - nearA, differenceUs: diffUs };
    const centre = Math.sqrt(fitLo * fitHi);
    const limitUs = (TIMING_FLAG_PERIOD_FRACTION / centre) * 1e6;
    const mm = (diffUs * 1e-6 * SPEED_OF_SOUND_M_S * 1000).toFixed(0);
    if (Math.abs(diffUs) > limitUs) {
      flags.push(
        `The fitted delay differs from the session's measured arrivals by ${diffUs.toFixed(0)} µs (${mm} mm) — more than a quarter period ` +
          `at ${Math.round(centre)} Hz: the fit may have locked onto the wrong cycle. Check polarity and the fit band.`,
      );
    } else {
      notes.push(`fitted delay vs measured arrivals: ${diffUs.toFixed(0)} µs (${mm} mm) — arrivals are impulse peaks, so this is a plausibility check`);
    }
  } else {
    notes.push('no shared dual-channel time base: the delay is fitted only, not checked against measured arrivals');
  }

  // Sessions. A NOTE, not a flag (V55): on casus 1 a September near field merges onto the
  // August far field as cleanly as the August one does, under the same gate. What a different
  // session costs is the shared time base, so that is what the note says.
  const ns = input.near.session ?? null;
  const fsn = input.far.session ?? null;
  const ps = input.port ? (input.port.impulse.session ?? null) : null;
  const sessions = [['near field', ns], ['far field', fsn], ...(input.port ? [['port', ps]] : [])] as [string, string | null][];
  if (sessions.some(([, s]) => !s)) {
    notes.push(`session not stated for ${sessions.filter(([, s]) => !s).map(([l]) => l).join(', ')} — the cross-session check did not run`);
  } else if (new Set(sessions.map(([, s]) => s)).size > 1) {
    notes.push(
      `different sessions (${sessions.map(([l, s]) => `${l} "${s}"`).join(', ')}): no shared time base, the delay is fitted only`,
    );
  }

  // V60: an already-gated far field must be silent after the right edge of its stated gate.
  if (input.far.alreadyGated) {
    const x = input.far.samples;
    const len = x.length;
    const ref = input.gate.referenceMs;
    let tot = 0;
    let tail = 0;
    for (let i = 0; i < len; i++) {
      const tMs = ((i < len / 2 ? i : i - len) / fs) * 1000 - ref;
      const e = x[i] * x[i];
      tot += e;
      if (tMs > input.gate.rightMs && tMs <= input.gate.rightMs + GATE_TAIL_SPAN_MS) tail += e;
    }
    const tailDb = 10 * Math.log10((tail || 1e-300) / (tot || 1e-300));
    if (tailDb > GATE_TAIL_FLAG_DB) {
      flags.push(
        `The far field still holds energy after the stated gate's right edge (${tailDb.toFixed(0)} dB over the next ${GATE_TAIL_SPAN_MS} ms; ` +
          `convention ${GATE_TAIL_FLAG_DB} dB): the gate is probably misread. ARTA's Left and Right window are lengths from the reference time (V60).`,
      );
    } else {
      notes.push(`far field after the stated gate: ${tailDb.toFixed(0)} dB over ${GATE_TAIL_SPAN_MS} ms — the gate matches the file`);
    }
  }

  // Echoes the far field actually holds (raw impulses only).
  let echoesFound: FoundEcho[] | null = null;
  if (!input.far.alreadyGated && !input.near.alreadyGated) {
    const eLo = fitLo * 2 ** ECHO_FINDER_BAND_OCT[0];
    const eHi = Math.min(fs / 4, fitHi * 2 ** ECHO_FINDER_BAND_OCT[1]);
    echoesFound = findEchoes(farRaw, P, fit, f, n, eLo, eHi, input);
    notes.push(
      `echo finder band ${Math.round(eLo)}–${Math.round(eHi)} Hz: echoes closer than ${(1000 / (eHi - eLo)).toFixed(1)} ms ` +
        `to the direct sound cannot be told apart from it there — the fit residual is the check for those`,
    );
    for (const e of echoesFound) {
      if (e.insideGate && !e.modelled && e.levelDb > ECHO_HINT_DB) {
        flags.push(
          `An echo ${e.afterDirectMs.toFixed(2)} ms after the direct sound (${e.levelDb.toFixed(0)} dB) lies inside the gate and is not modelled. ` +
            `If it is a floor or table, state its geometry; if not, shorten the gate.`,
        );
      }
    }
  }

  // Output: anechoic prediction below the splice, far field (echoes divided out) above, phase re the gate reference.
  const tRef = input.gate.referenceMs / 1000;
  const floor = 10 ** (ECHO_DIVIDE_FLOOR_DB / 20);
  const grid: number[] = [];
  {
    const o = input.output;
    const nPts = Math.max(2, Math.round(Math.log2(o.toHz / o.fromHz) * o.pointsPerOctave) + 1);
    for (let i = 0; i < nPts; i++) grid.push(o.fromHz * (o.toHz / o.fromHz) ** (i / (nPts - 1)));
  }
  const [sl, sh] = input.spliceBandHz;
  const at = (s: Spec, fk: number): [number, number] => {
    const x = fk / (fs / n);
    const k0 = Math.floor(x);
    const t = x - k0;
    const k1 = Math.min(k0 + 1, s.re.length - 1);
    return [s.re[k0] * (1 - t) + s.re[k1] * t, s.im[k0] * (1 - t) + s.im[k1] * t];
  };
  const spl: number[] = [];
  const phaseDeg: number[] = [];
  const predictionDb: number[] = [];
  const predictionPhaseDeg: number[] = [];
  const farGatedDb: number[] = [];
  const farGatedPhaseDeg: number[] = [];
  const toRef = (re: number, im: number, fk: number): [number, number] => {
    const ph = 2 * Math.PI * fk * tRef;
    return [re * Math.cos(ph) - im * Math.sin(ph), re * Math.sin(ph) + im * Math.cos(ph)];
  };
  for (const fk of grid) {
    const [pr0, pi0] = at(Panech, fk);
    const ph = -2 * Math.PI * fk * fit.tau;
    const g = fit.gain * fit.sign;
    let [lr, li] = [g * (pr0 * Math.cos(ph) - pi0 * Math.sin(ph)), g * (pr0 * Math.sin(ph) + pi0 * Math.cos(ph))];
    [lr, li] = toRef(lr, li, fk);
    const [fr0, fi0] = at(Fg, fk);
    const [er0, ei0] = at(E, fk);
    const em = Math.hypot(er0, ei0);
    const sc = em < floor ? floor / em : 1;
    const den = (er0 * sc) ** 2 + (ei0 * sc) ** 2 || 1e-30;
    let hr = (fr0 * er0 * sc + fi0 * ei0 * sc) / den;
    let hi = (fi0 * er0 * sc - fr0 * ei0 * sc) / den;
    [hr, hi] = toRef(hr, hi, fk);
    let w = 0;
    if (fk >= sh) w = 1;
    else if (fk > sl) w = 0.5 - 0.5 * Math.cos((Math.PI * Math.log(fk / sl)) / Math.log(sh / sl));
    const mr = (1 - w) * lr + w * hr;
    const mi = (1 - w) * li + w * hi;
    spl.push(20 * Math.log10(Math.hypot(mr, mi) || 1e-30));
    phaseDeg.push((Math.atan2(mi, mr) * 180) / Math.PI);
    predictionDb.push(20 * Math.log10(Math.hypot(lr, li) || 1e-30));
    predictionPhaseDeg.push((Math.atan2(li, lr) * 180) / Math.PI);
    farGatedDb.push(20 * Math.log10(Math.hypot(hr, hi) || 1e-30));
    farGatedPhaseDeg.push((Math.atan2(hi, hr) * 180) / Math.PI);
  }
  if (input.echoes.length) notes.push(`echo terms divided out of the far-field half (never below ${ECHO_DIVIDE_FLOOR_DB} dB)`);

  return {
    version: NF_MERGE_V2_VERSION,
    freq: grid,
    spl,
    phaseDeg,
    predictionDb,
    predictionPhaseDeg,
    farGatedDb,
    farGatedPhaseDeg,
    fit: {
      gainDb: 20 * Math.log10(fit.gain),
      delayMs: fit.tau * 1000,
      polarityDeg: fit.sign === 1 ? 0 : 180,
      residualRmsDeg: fit.rmsDeg,
      residualRmsDb: fit.rmsDb,
      residual,
    },
    freeOffset,
    v1OffsetDeg: v1Offset,
    timing,
    echoesFound,
    flags,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Echo finder: what the far field holds that the merge does not explain.
 *
 * far / (near · model · stated echoes), minus the fitted direct sound, band-
 * limited, as an envelope. On a sound merge this is near zero; an echo shows
 * up as a peak at its own delay after the direct sound. Dividing out the model
 * and subtracting the direct sound matters: the bare far/near ratio carries the
 * model's own tail and the band filter's sidelobes, which read as echoes.
 * ------------------------------------------------------------------ */

/** Lags closer than this to the direct sound are model territory, not echoes. */
const ECHO_GUARD_MS = 0.25;
const ECHO_MIN_SEPARATION_MS = 0.2;
const ECHO_LOOK_MS = 12;

function findEchoes(
  farRaw: Spec,
  /** The prediction with every stated reflection, per source: near · model · echoes. */
  predicted: Spec,
  fit: { gain: number; sign: 1 | -1; tau: number },
  f: Float64Array,
  n: number,
  lo: number,
  hi: number,
  input: MergeV2Input,
): FoundEcho[] {
  const fs = input.far.sampleRate;
  const lo0 = lo / Math.SQRT2;
  const hi1 = hi * Math.SQRT2;
  const resRe = new Float64Array(n);
  const resIm = new Float64Array(n);
  const dirRe = new Float64Array(n);
  const dirIm = new Float64Array(n);
  for (let k = 1; k < f.length; k++) {
    const fk = f[k];
    if (fk < lo0 || fk > hi1) continue;
    let w = 1;
    if (fk < lo) w = 0.5 - 0.5 * Math.cos((Math.PI * Math.log(fk / lo0)) / Math.log(lo / lo0));
    else if (fk > hi) w = 0.5 + 0.5 * Math.cos((Math.PI * Math.log(fk / hi)) / Math.log(hi1 / hi));
    // denominator: the prediction with every stated reflection
    const dr = predicted.re[k];
    const di = predicted.im[k];
    const dd = dr * dr + di * di;
    if (!(dd > 0)) continue;
    const rr = (farRaw.re[k] * dr + farRaw.im[k] * di) / dd;
    const ri = (farRaw.im[k] * dr - farRaw.re[k] * di) / dd;
    const ph = -2 * Math.PI * fk * fit.tau;
    const gr = fit.gain * fit.sign * Math.cos(ph);
    const gi = fit.gain * fit.sign * Math.sin(ph);
    // analytic signal: positive frequencies doubled
    resRe[k] = 2 * w * (rr - gr);
    resIm[k] = 2 * w * (ri - gi);
    dirRe[k] = 2 * w * gr;
    dirIm[k] = 2 * w * gi;
  }
  ifftInPlace(resRe, resIm);
  ifftInPlace(dirRe, dirIm);
  let i0 = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.hypot(dirRe[i], dirIm[i]);
    if (v > peak) {
      peak = v;
      i0 = i;
    }
  }
  if (!(peak > 0)) return [];
  const env = (i: number): number => Math.hypot(resRe[(i + n) % n], resIm[(i + n) % n]);
  const guard = Math.round(Math.max(ECHO_GUARD_MS / 1000, 1 / (hi - lo)) * fs);
  const sep = Math.round((ECHO_MIN_SEPARATION_MS / 1000) * fs);
  const look = Math.round((ECHO_LOOK_MS / 1000) * fs);
  const gateEndAfterDirect = input.gate.referenceMs + input.gate.rightMs - arrivalMs(input.far);
  const modelled = [...input.echoes, ...(input.port?.echoes ?? [])]
    .filter((e): e is PlaneEcho => e.kind === 'plane')
    .map((e) => planeEchoDelayS(e) * 1000);
  const out: FoundEcho[] = [];
  for (let d = guard; d < look; d++) {
    const v = env(i0 + d);
    let isPeak = true;
    for (let j = -sep; j <= sep && isPeak; j++) if (j !== 0 && env(i0 + d + j) > v) isPeak = false;
    if (!isPeak) continue;
    const db = 20 * Math.log10(v / peak);
    if (db < ECHO_HINT_DB - 10) continue;
    const ms = (d / fs) * 1000;
    out.push({ afterDirectMs: ms, levelDb: db, insideGate: ms < gateEndAfterDirect, modelled: modelled.some((m) => Math.abs(m - ms) < 0.15) });
  }
  return out.slice(0, 12);
}
