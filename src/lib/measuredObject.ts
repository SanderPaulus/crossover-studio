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
 *  - A load that differs from the target's gives a validity limit: k × the highest system
 *    resonance (f_c or f_b) of the two boxes. Above it the merge stands for the target; below it
 *    the low end comes from the target's box model, or stays marked as "measured object".
 *    k is a convention, visible and overridable (like the 10° residual flag).
 */
import { samePortInVolume } from './ventedBoxTransform.ts';

/** c, m/s (P6 whitelist), and the air density used for a passive radiator's box stiffness. */
const C_AIR_M_S = 343;
const RHO_AIR = 1.2041;

/**
 * The default k of the validity limit, a CONVENTION. Its basis is a measurement: M-2 transformed
 * the casus-1 woofers from the 53.2 L test box to the 67.7 L target (same port) and the response
 * moved by less than 0.2 dB above 60 Hz — about twice the test box's f_b — and by 2–3 dB below 30 Hz.
 */
export const LOAD_VALIDITY_K = 2;

/**
 * Port end correction, in port DIAMETERS added to the physical length: one flanged end (0.85 r)
 * and one free end (0.61 r) — the textbook pair, 1.46 r ≈ 0.732 d. A convention; a flared mouth
 * or a port near a wall shifts it, which is why a MEASURED f_b always wins.
 */
export const PORT_END_CORRECTION_DIAMETERS = 0.732;

export type PortSpec =
  /** f_b read from this box's own impedance (the saddle between the two peaks). Wins over geometry. */
  | { kind: 'measured'; fbHz: number; source: string }
  /** Helmholtz from the port's geometry. */
  | { kind: 'geometry'; areaCm2: number; lengthMm: number }
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

export interface LoadValidity {
  /** The measurement stands for the target from here up, Hz; null when the loads are the same. */
  fromHz: number | null;
  k: number;
  target: Resonance | null;
  measured: Resonance | null;
  /** The sentence the reader sees. */
  note: string;
}

/**
 * The validity limit of a session's measurement for the TARGET cabinet. A session on the target
 * itself, or on an object with the same load, has none. Otherwise k × the highest of the two
 * system resonances; with an input missing, no limit and the missing input named — never a guess.
 */
export function loadValidity(opts: { target: BoxSpec; setup: SessionSetup; ts?: DriverTs | null; k?: number }): LoadValidity {
  const k = opts.k ?? LOAD_VALIDITY_K;
  const obj = opts.setup.object;
  if (obj.kind === 'target') {
    return { fromHz: null, k, target: null, measured: null, note: `session "${opts.setup.session}" measured the target cabinet: no load limit` };
  }
  if (sameLoad(obj.box, opts.target)) {
    return { fromHz: null, k, target: null, measured: null, note: `session "${opts.setup.session}" measured "${obj.label}", same load as the target: no load limit` };
  }
  // resolve the side that does not depend on the other first
  const dependsOnOther = (b: BoxSpec) => b.load.kind === 'vented' && b.load.port.kind === 'same-as-other';
  let m: { resonance: Resonance | null; missing: string | null };
  let t: { resonance: Resonance | null; missing: string | null };
  if (dependsOnOther(opts.target) && !dependsOnOther(obj.box)) {
    m = systemResonance(obj.box, opts.ts ?? null);
    t = systemResonance(opts.target, opts.ts ?? null, { box: obj.box, resonance: m.resonance });
  } else {
    t = systemResonance(opts.target, opts.ts ?? null);
    m = systemResonance(obj.box, opts.ts ?? null, { box: opts.target, resonance: t.resonance });
  }
  if (!t.resonance || !m.resonance) {
    const miss = [t.missing && `target: ${t.missing}`, m.missing && `measured object: ${m.missing}`].filter(Boolean).join('; ');
    return {
      fromHz: null,
      k,
      target: t.resonance,
      measured: m.resonance,
      note: `session "${opts.setup.session}" measured "${obj.label}" with a different load, but the limit cannot be computed — missing ${miss}. The low end stays marked as measured object.`,
    };
  }
  const top = Math.max(t.resonance.hz, m.resonance.hz);
  const fromHz = k * top;
  return {
    fromHz,
    k,
    target: t.resonance,
    measured: m.resonance,
    note:
      `session "${opts.setup.session}" measured "${obj.label}" (${obj.box.netVolumeL} L, ${obj.box.load.kind}), not the target ` +
      `(${opts.target.netVolumeL} L, ${opts.target.load.kind}): valid for the target from ${fromHz.toFixed(1)} Hz ` +
      `(k ${k} × ${top.toFixed(2)} Hz, the higher of f = ${m.resonance.hz.toFixed(2)} Hz measured object and ${t.resonance.hz.toFixed(2)} Hz target; ` +
      `k is a convention). Below it: the target's box model, or marked as measured object.`,
  };
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
