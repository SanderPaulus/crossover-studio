/**
 * The measurement set-up per SESSION: what object was measured, and where its measurement is
 * valid for the TARGET cabinet (I-4, Sander 13-11-2026). Generic: no cabinet number lives here (P6);
 * every volume, port and T/S parameter is stated by the caller or read from a measurement.
 *
 *  - A session names its measured object: the target cabinet the optimizer designs for, or
 *    another object (a test box, a ground plane rig).
 *  - Another object states its baffle (identical to the target, or its own geometry), its net
 *    volume and its acoustic load (sealed, vented with a port, or passive radiator).
 *  - Identical baffle: driver positions and baffle size come from the optimizer. Own baffle: the
 *    session carries its own geometry.
 *  - A load that differs from the target's gives a validity limit from the RATIO of the two box
 *    models (target ÷ measured object, complex): the lowest frequency above which that ratio stays
 *    within ±`LOAD_RATIO_TOL_DB` AND ±`LOAD_RATIO_TOL_DEG` (Sander, 13-11-2026 — phase counts: a
 *    small test box can be −3 dB and −40° at twice its f_b). Both are conventions, visible and
 *    overridable. Above the limit the merge stands for the target; below it the low end is either
 *    marked as "measured object" or converted with the same model ratio.
 */
import { samePortInVolume } from './ventedBoxTransform.ts';

/** c, m/s (P6 whitelist), and the air density used for a passive radiator's box stiffness. */
const C_AIR_M_S = 343;
const RHO_AIR = 1.2041;

/** Tolerances of the load-validity limit, CONVENTIONS (visible, overridable): the target/measured
 *  model ratio must stay within these, in level and in phase, from the limit up. */
export const LOAD_RATIO_TOL_DB = 0.2;
export const LOAD_RATIO_TOL_DEG = 5;

/**
 * Port end correction, in port DIAMETERS added to the physical length: one flanged end (0.85 r)
 * and one free end (0.61 r) — the textbook pair, 1.46 r ≈ 0.732 d. A convention; a flared mouth
 * or a port near a wall shifts it, which is why a MEASURED f_b always wins.
 */
export const PORT_END_CORRECTION_DIAMETERS = 0.732;

export type PortSpec =
  /** f_b read from this box's own impedance (the saddle between the two peaks). Wins over geometry.
   *  `qL`: the box's leakage Q, needed by the response model (stated or fitted, never defaulted). */
  | { kind: 'measured'; fbHz: number; source: string; qL?: number }
  /** Helmholtz from the port's geometry. */
  | { kind: 'geometry'; areaCm2: number; lengthMm: number; qL?: number }
  /** The other box's port, unchanged, in this box's volume: f_b ∝ 1/√V (M-2). */
  | { kind: 'same-as-other' };

export type AcousticLoad =
  | { kind: 'sealed' }
  | { kind: 'vented'; port: PortSpec }
  | { kind: 'passive'; mmpG: number; sdCm2: number; cmsMmPerN: number };

export interface BoxSpec {
  /** Net volume, litres. */
  netVolumeL: number;
  load: AcousticLoad;
}

/** The driver(s) loading the box: T/S per driver and how many share it. */
export interface DriverTs {
  fsHz: number;
  vasL: number;
  count: number;
  /** Total Q at f_s — needed by the response model, not by the resonance alone. */
  qts?: number;
}

export type BaffleSpec = 'identical' | { widthMm: number; heightMm: number; depthMm?: number; note?: string };

export type MeasuredObject =
  | { kind: 'target' }
  | { kind: 'other'; label: string; baffle: BaffleSpec; box: BoxSpec };

export interface SessionSetup {
  session: string;
  object: MeasuredObject;
}

export interface Resonance {
  hz: number;
  /** How it was obtained, in words — the reader must be able to see which formula or reading. */
  how: string;
}

/**
 * The system resonance of a box: f_c (sealed), f_b (vented, passive radiator). `other` is the
 * other box, needed only for a `same-as-other` port. Null with the missing input named (P4).
 */
export function systemResonance(
  box: BoxSpec,
  ts: DriverTs | null,
  other?: { box: BoxSpec; resonance: Resonance | null },
): { resonance: Resonance | null; missing: string | null } {
  const v = box.netVolumeL;
  if (!(v > 0)) return { resonance: null, missing: 'net volume' };
  switch (box.load.kind) {
    case 'sealed': {
      if (!ts || !(ts.fsHz > 0 && ts.vasL > 0 && ts.count > 0)) return { resonance: null, missing: 'f_s, V_as and the driver count' };
      const fc = ts.fsHz * Math.sqrt(1 + (ts.count * ts.vasL) / v);
      return { resonance: { hz: fc, how: `sealed: f_c = f_s·√(1 + N·V_as/V_b) = ${ts.fsHz}·√(1 + ${ts.count}·${ts.vasL}/${v})` }, missing: null };
    }
    case 'vented': {
      const p = box.load.port;
      if (p.kind === 'measured') {
        if (!(p.fbHz > 0)) return { resonance: null, missing: 'measured f_b' };
        return { resonance: { hz: p.fbHz, how: `vented: f_b measured (${p.source})` }, missing: null };
      }
      if (p.kind === 'geometry') {
        if (!(p.areaCm2 > 0 && p.lengthMm > 0)) return { resonance: null, missing: 'port area and length' };
        const s = p.areaCm2 / 1e4;
        const d = 2 * Math.sqrt(s / Math.PI);
        const leff = p.lengthMm / 1000 + PORT_END_CORRECTION_DIAMETERS * d;
        const fb = (C_AIR_M_S / (2 * Math.PI)) * Math.sqrt(s / ((v / 1000) * leff));
        return {
          resonance: { hz: fb, how: `vented: Helmholtz, port ${p.areaCm2} cm² × ${p.lengthMm} mm, end correction ${PORT_END_CORRECTION_DIAMETERS}·d` },
          missing: null,
        };
      }
      // same port, other volume
      const o = other;
      if (!o || o.box.load.kind !== 'vented' || o.box.load.port.kind === 'same-as-other') {
        return { resonance: null, missing: 'the other box\'s f_b (a "same port" box needs a measured or geometric port on the other side)' };
      }
      if (!o.resonance) return { resonance: null, missing: "the other box's f_b" };
      const fb = samePortInVolume({ volumeL: o.box.netVolumeL, tuningHz: o.resonance.hz, leakageQ: 1 }, v).tuningHz;
      return { resonance: { hz: fb, how: `vented: the other box's port in ${v} L, f_b ∝ 1/√V (${o.resonance.hz.toFixed(2)} Hz in ${o.box.netVolumeL} L)` }, missing: null };
    }
    case 'passive': {
      const l = box.load;
      if (!(l.mmpG > 0 && l.sdCm2 > 0 && l.cmsMmPerN > 0)) return { resonance: null, missing: 'passive radiator M_mp, S_d and C_ms' };
      const sp = l.sdCm2 / 1e4;
      const kBox = (RHO_AIR * C_AIR_M_S ** 2 * sp ** 2) / (v / 1000);
      const kSusp = 1 / (l.cmsMmPerN / 1000);
      const fb = Math.sqrt((kBox + kSusp) / (l.mmpG / 1000)) / (2 * Math.PI);
      return { resonance: { hz: fb, how: 'passive radiator: f_b = √((k_box + 1/C_ms)/M_mp)/2π' }, missing: null };
    }
  }
}

/** Whether two box specs load the drivers the same: same volume and same load, nothing else. */
export function sameLoad(a: BoxSpec, b: BoxSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface Cx {
  re: number;
  im: number;
}
/** target ÷ measured object at one frequency — the model ratio the limit is read from. */
export type ModelRatio = (freqHz: number) => Cx;

const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/**
 * A box's normalised acoustic output (cone + port), the textbook models: sealed second order
 * (f_c, Q_tc from f_s, Q_ts and α = N·V_as/V_b); vented fourth order (Small 1973: f_s, Q_ts, α,
 * h = f_b/f_s, Q_l). A passive radiator has no model here yet: it is said, not guessed.
 */
function boxResponse(box: BoxSpec, ts: DriverTs, fb: number | null, qL: number | null): ((f: number) => Cx) | string {
  if (!(ts.qts && ts.qts > 0)) return 'Q_ts';
  const alpha = (ts.count * ts.vasL) / box.netVolumeL;
  if (box.load.kind === 'sealed') {
    const wc = 2 * Math.PI * ts.fsHz * Math.sqrt(1 + alpha);
    const qtc = ts.qts * Math.sqrt(1 + alpha);
    return (f) => {
      const w = 2 * Math.PI * f;
      // s² / (s² + s·ωc/Q + ωc²), s = jω
      return cdiv({ re: -w * w, im: 0 }, { re: wc * wc - w * w, im: (w * wc) / qtc });
    };
  }
  if (box.load.kind === 'vented') {
    if (!fb || !qL) return !fb ? 'f_b' : 'Q_l (the box leakage)';
    const h = fb / ts.fsHz;
    const qt = ts.qts;
    const a1 = (qL + h * qt) / (Math.sqrt(h) * qt * qL);
    const a2 = (h + (alpha + 1 + h * h) * qt * qL) / (h * qt * qL);
    const a3 = (h * qL + qt) / (Math.sqrt(h) * qt * qL);
    const w0 = 2 * Math.PI * Math.sqrt(ts.fsHz * fb);
    return (f) => {
      const x = (2 * Math.PI * f) / w0; // s_n = jx
      const s2 = -x * x;
      const s4 = x ** 4;
      return cdiv({ re: s4, im: 0 }, { re: s4 + a2 * s2 + 1, im: -a1 * x ** 3 + a3 * x });
    };
  }
  return 'a passive-radiator response model (not built)';
}

function ventedParams(box: BoxSpec, res: Resonance | null, other?: BoxSpec, otherQl?: number | null): { fb: number | null; qL: number | null } {
  if (box.load.kind !== 'vented') return { fb: null, qL: null };
  const p = box.load.port;
  if (p.kind === 'same-as-other') {
    // the other box's port in this volume: f_b and Q_l both scale with 1/√V (samePortInVolume)
    if (!other || !otherQl || !res) return { fb: res?.hz ?? null, qL: null };
    const k = Math.sqrt(other.netVolumeL / box.netVolumeL);
    return { fb: res.hz, qL: otherQl * k };
  }
  return { fb: res?.hz ?? null, qL: p.qL ?? null };
}

/** The T/S model ratio target ÷ measured object, or the missing input named. */
export function tsModelRatio(target: BoxSpec, measured: BoxSpec, ts: DriverTs): { ratio: ModelRatio | null; missing: string | null } {
  const dep = (b: BoxSpec) => b.load.kind === 'vented' && b.load.port.kind === 'same-as-other';
  const mRes = systemResonance(measured, ts, dep(measured) ? { box: target, resonance: systemResonance(target, ts).resonance } : undefined).resonance;
  const tRes = systemResonance(target, ts, dep(target) ? { box: measured, resonance: mRes } : undefined).resonance;
  const mQl = measured.load.kind === 'vented' && measured.load.port.kind !== 'same-as-other' ? measured.load.port.qL ?? null : null;
  const tQl = target.load.kind === 'vented' && target.load.port.kind !== 'same-as-other' ? target.load.port.qL ?? null : null;
  const mv = ventedParams(measured, mRes, target, tQl);
  const tv = ventedParams(target, tRes, measured, mQl);
  const hm = boxResponse(measured, ts, mv.fb, mv.qL);
  const ht = boxResponse(target, ts, tv.fb, tv.qL);
  if (typeof hm === 'string') return { ratio: null, missing: `measured object: ${hm}` };
  if (typeof ht === 'string') return { ratio: null, missing: `target: ${ht}` };
  return { ratio: (f) => cdiv(ht(f), hm(f)), missing: null };
}

export interface RatioLimit {
  /** From here up the ratio stays within both tolerances; null = nowhere on the grid. */
  fromHz: number | null;
  tolDb: number;
  tolDeg: number;
  /** The worst point just below the limit (what made it stop there). */
  worstBelow: { freqHz: number; db: number; deg: number } | null;
}

/** The lowest grid frequency above which |20·log|R|| ≤ tolDb AND |arg R| ≤ tolDeg everywhere. */
export function ratioLimit(ratio: ModelRatio, grid: readonly number[], tolDb = LOAD_RATIO_TOL_DB, tolDeg = LOAD_RATIO_TOL_DEG): RatioLimit {
  let lastBad = -1;
  let worst: RatioLimit['worstBelow'] = null;
  for (let i = 0; i < grid.length; i++) {
    const r = ratio(grid[i]);
    const db = 10 * Math.log10(r.re * r.re + r.im * r.im);
    const deg = (Math.atan2(r.im, r.re) * 180) / Math.PI;
    if (Math.abs(db) > tolDb || Math.abs(deg) > tolDeg) {
      lastBad = i;
      worst = { freqHz: grid[i], db, deg };
    }
  }
  if (lastBad === grid.length - 1) return { fromHz: null, tolDb, tolDeg, worstBelow: worst };
  return { fromHz: grid[lastBad + 1], tolDb, tolDeg, worstBelow: worst };
}

/** A log grid for the limit search: one point per `perOctave`, `from`–`to` Hz. */
export function logGrid(fromHz: number, toHz: number, perOctave: number): number[] {
  const n = Math.round(Math.log2(toHz / fromHz) * perOctave);
  return Array.from({ length: n + 1 }, (_, i) => fromHz * (toHz / fromHz) ** (i / n));
}

export interface LoadValidity {
  /** The measurement stands for the target from here up, Hz; null = same load (no limit) or not computable. */
  fromHz: number | null;
  sameLoad: boolean;
  limit: RatioLimit | null;
  ratio: ModelRatio | null;
  /** Which model the ratio came from, in words. */
  model: string | null;
  note: string;
}

/**
 * The validity limit of a session's measurement for the TARGET cabinet, from the model ratio.
 * `ratio` lets a caller hand in its own model (casus 1: M-2's transform, read from the measured
 * impedance); otherwise the T/S models. An input missing: no limit, the input named, the low end
 * marked as measured object — never a guess.
 */
export function loadValidity(opts: {
  target: BoxSpec;
  setup: SessionSetup;
  ts?: DriverTs | null;
  ratio?: { fn: ModelRatio; model: string } | null;
  grid?: readonly number[];
  tolDb?: number;
  tolDeg?: number;
}): LoadValidity {
  const obj = opts.setup.object;
  const sess = opts.setup.session;
  if (obj.kind === 'target') {
    return { fromHz: null, sameLoad: true, limit: null, ratio: null, model: null, note: `session "${sess}" measured the target cabinet: no load limit` };
  }
  if (sameLoad(obj.box, opts.target)) {
    return { fromHz: null, sameLoad: true, limit: null, ratio: null, model: null, note: `session "${sess}" measured "${obj.label}", same load as the target: no load limit` };
  }
  let ratio: ModelRatio | null = null;
  let model: string | null = null;
  let missing: string | null = null;
  if (opts.ratio) {
    ratio = opts.ratio.fn;
    model = opts.ratio.model;
  } else if (opts.ts) {
    const r = tsModelRatio(opts.target, obj.box, opts.ts);
    ratio = r.ratio;
    missing = r.missing;
    model = 'T/S box models (sealed 2nd order / vented 4th order, Small)';
  } else missing = 'the driver T/S (f_s, Q_ts, V_as) or a model ratio';
  if (!ratio) {
    return {
      fromHz: null,
      sameLoad: false,
      limit: null,
      ratio: null,
      model,
      note: `session "${sess}" measured "${obj.label}" with a different load, but the limit cannot be computed — missing ${missing}. The low end stays marked as measured object.`,
    };
  }
  const tolDb = opts.tolDb ?? LOAD_RATIO_TOL_DB;
  const tolDeg = opts.tolDeg ?? LOAD_RATIO_TOL_DEG;
  const limit = ratioLimit(ratio, opts.grid ?? logGrid(5, 2000, 48), tolDb, tolDeg);
  const w = limit.worstBelow;
  return {
    fromHz: limit.fromHz,
    sameLoad: false,
    limit,
    ratio,
    model,
    note:
      `session "${sess}" measured "${obj.label}" (${obj.box.netVolumeL} L, ${obj.box.load.kind}), not the target ` +
      `(${opts.target.netVolumeL} L, ${opts.target.load.kind}): ` +
      (limit.fromHz === null
        ? `the model ratio never stays within ±${tolDb} dB / ±${tolDeg}° on the grid — no valid band for the target`
        : `valid for the target from ${limit.fromHz.toFixed(1)} Hz, where the model ratio (${model}) stays within ±${tolDb} dB and ±${tolDeg}° ` +
          `(conventions)${w ? `; just below, at ${w.freqHz.toFixed(1)} Hz, it reads ${w.db.toFixed(2)} dB / ${w.deg.toFixed(1)}°` : ''}`) +
      `. Below it: marked as measured object, or converted with the same ratio.`,
  };
}

/**
 * The other option below the limit: convert the low end with the same model ratio (as the M-2
 * Koan-frame set did). Only BELOW `belowHz` — above it the measurement stays untouched, and at the
 * limit the step is within the tolerances by construction.
 */
export function convertLowEnd(
  freq: readonly number[],
  spl: readonly number[],
  phaseDeg: readonly number[],
  ratio: ModelRatio,
  belowHz: number,
): { spl: number[]; phaseDeg: number[] } {
  const outS: number[] = [];
  const outP: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] >= belowHz) {
      outS.push(spl[i]);
      outP.push(phaseDeg[i]);
      continue;
    }
    const r = ratio(freq[i]);
    outS.push(spl[i] + 10 * Math.log10(r.re * r.re + r.im * r.im));
    let p = phaseDeg[i] + (Math.atan2(r.im, r.re) * 180) / Math.PI;
    p = ((((p + 180) % 360) + 360) % 360) - 180;
    outP.push(p);
  }
  return { spl: outS, phaseDeg: outP };
}

/** Which baffle a session's geometry comes from. */
export function sessionBaffle(obj: MeasuredObject): { from: 'optimizer' } | { from: 'session'; baffle: Exclude<BaffleSpec, 'identical'> } {
  if (obj.kind === 'target' || obj.baffle === 'identical') return { from: 'optimizer' };
  return { from: 'session', baffle: obj.baffle };
}

/**
 * A vented box's f_b read from its impedance: the minimum between the two largest peaks. Generic —
 * no band is typed; on a non-vented sweep (one dominant peak) it returns null.
 */
export function impedanceSaddleHz(freq: readonly number[], magnitude: readonly number[]): number | null {
  const peaks: number[] = [];
  for (let i = 1; i < magnitude.length - 1; i++) {
    if (magnitude[i] > magnitude[i - 1] && magnitude[i] >= magnitude[i + 1]) peaks.push(i);
  }
  if (peaks.length < 2) return null;
  const [a, b] = [...peaks].sort((x, y) => magnitude[y] - magnitude[x]).slice(0, 2).sort((x, y) => x - y);
  let best = a;
  for (let i = a; i <= b; i++) if (magnitude[i] < magnitude[best]) best = i;
  return best === a || best === b ? null : freq[best];
}
