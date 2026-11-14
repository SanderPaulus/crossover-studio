/**
 * The NF/FF merge SECTION's logic (I-4 fase 3), pure and testable: a measuring session from the
 * files the user drops, the gate read from the header, the set-up and its planes, the reflections
 * per source, the proposed bands, the status of a merge, the sum per design branch, and the export
 * package. The merge tool (NfMergeTool.tsx, #/merge) only renders what this module decides.
 *
 * Generic (P6): no cabinet number here. Casus 1 is a test case, not a default.
 */
import { fftInPlace } from './fft.ts';
import { parseFrd } from './parsers/frd.ts';
import { parsePir, PirParseError } from './parsers/pir.ts';
import { limToZmaText, parseLim } from './parsers/lim.ts';
import {
  arrivalMs,
  impulseFromFrd,
  impulseFromPir,
  type EchoTerm,
  type Gate,
  type Impulse,
  type MergeV2Result,
} from './nfMergeV2.ts';
import { SPLICE_KA_MARGIN } from './merger.ts';
import { applyPhaseConvention, isUncalibrated, gridText, MERGE_EXPORT_VERSION, MERGE_PACKAGE_FORMAT, phaseConventionText, type ExportGrid, type ExportPhase } from './mergeExport.ts';

export const MERGE_SESSION_VERSION = 'merge-session/1.0';
const C_MM_PER_MS = 343;
/**
 * Proposed fit band floor: this many periods of the window that follows the direct sound.
 * The matched gate makes the window's own effect part of the model, so the floor is not 1/T;
 * half a period still leaves the far field enough energy inside the window to fit on. A
 * convention, shown with the proposal and overridable.
 */
export const FIT_FLOOR_PERIODS_IN_GATE = 0.5;
/** A source closer to a plane than this fraction of a period at the top of the fit band sits ON it
 *  (a boundary, nfMergeV2.BOUNDARY_MAX_PERIOD_FRACTION); farther away it is an echo. */
export const ON_PLANE_PERIOD_FRACTION = 0.25;

/* ------------------------------------------------------------------ *
 * The session
 * ------------------------------------------------------------------ */

export interface DroppedFile {
  name: string;
  bytes: Uint8Array;
}

/** One measurement of the session: a raw impulse, its FRD export, or both. */
export interface SessionItem {
  name: string;
  stem: string;
  role: 'far' | 'near' | 'unknown';
  pir: Impulse | null;
  frdText: string | null;
  frdName: string | null;
  /** ARTA's window as the FRD export states it: lengths from the reference (V60). */
  header: { leftWindowMs: number; referenceTimeMs: number; rightWindowMs: number; rightTaper: number } | null;
}

/** What the user merges: a driver (far + near), a port (near only), or a far-only driver. */
export interface SessionSource {
  stem: string;
  label: string;
  kind: 'driver' | 'port' | 'far-only';
  far: SessionItem | null;
  near: SessionItem | null;
}

export interface LoadedSession {
  name: string;
  items: SessionItem[];
  sources: SessionSource[];
  impedances: { name: string; zmaText: string }[];
  /** Every impulse dual-channel: one shared time base. */
  timeBaseShared: boolean;
  calibration: { freq: number[]; db: number[]; note: string } | null;
  notes: string[];
}

/** "woofer down hor 0.pir", "woofer_down_near.txt" → stem "woofer down", role far / near. */
export function stemOf(name: string): { stem: string; role: SessionItem['role'] } {
  const base = name.replace(/\.[A-Za-z0-9]+$/, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
  const m = /^(.*?)\s*(hor\s*0|0\s*deg|on\s*axis|near|close|nf)$/.exec(base);
  if (!m) return { stem: base, role: 'unknown' };
  return { stem: m[1].trim(), role: /near|close|nf/.test(m[2]) ? 'near' : 'far' };
}

const PORT_STEM = /\b(port|poort|vent|reflex|pr)\b/;

function headerOf(text: string): SessionItem['header'] {
  const num = (name: string): number | null => {
    const m = new RegExp(`^\\s*\\*\\s*${name}\\s*=\\s*([0-9]+(?:[.,][0-9]+)?)`, 'mi').exec(text);
    return m ? Number(m[1].replace(',', '.')) : null;
  };
  const l = num('Left window');
  const r = num('Reference time');
  const rt = num('Right window');
  const tk = /^\s*\*\s*Right window\s*=.*Tukey\s*([0-9]+(?:[.,][0-9]+)?)/im.exec(text);
  if (l === null || r === null || rt === null) return null;
  return { leftWindowMs: l, referenceTimeMs: r, rightWindowMs: rt, rightTaper: tk ? Number(tk[1].replace(',', '.')) : 0 };
}

/** The key two spellings of one measurement share: "woofer down hor 0.pir" = "woofer_down_hor_0.pir". */
const keyOf = (name: string): string => {
  const { stem, role } = stemOf(name);
  return `${stem}|${role}`;
};
const sourceFileOf = (text: string): string | null => /^\s*\*\s*Source file\s*=\s*(.+?)\s*$/im.exec(text)?.[1] ?? null;
const decode = (b: Uint8Array): string => new TextDecoder('latin1').decode(b);

/**
 * Read the dropped files into a session. A PIR is a raw impulse; an FRD whose `Source file` names
 * a PIR of the session is that PIR's export (and carries its window); an FRD with no PIR stands
 * on its own (the FRD route). Roles and pairing are a PRE-FILL from the file names — the section
 * shows them and the user can change them; nothing here is a fact about the measurement.
 */
export function loadSession(name: string, files: readonly DroppedFile[]): LoadedSession {
  const notes: string[] = [];
  const items = new Map<string, SessionItem>();
  const impedances: LoadedSession['impedances'] = [];
  const frds: { name: string; text: string }[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.pir')) {
      try {
        const p = parsePir(f.bytes);
        const { stem, role } = stemOf(f.name);
        items.set(keyOf(f.name), { name: f.name, stem, role, pir: impulseFromPir(f.name, p, name), frdText: null, frdName: null, header: null });
      } catch (e) {
        notes.push(`${f.name}: ${e instanceof PirParseError ? e.message : String(e)}`);
      }
    } else if (lower.endsWith('.lim')) {
      try {
        const z = parseLim(f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
        impedances.push({ name: f.name.replace(/\.lim$/i, '.zma'), zmaText: limToZmaText(z, f.name) });
      } catch (e) {
        notes.push(`${f.name}: ${String(e)}`);
      }
    } else if (lower.endsWith('.zma')) {
      impedances.push({ name: f.name, zmaText: decode(f.bytes) });
    } else if (lower.endsWith('.frd') || lower.endsWith('.txt')) {
      frds.push({ name: f.name, text: decode(f.bytes) });
    } else notes.push(`${f.name}: not a measurement this section reads (.pir, .frd/.txt, .zma, .lim)`);
  }
  for (const fr of frds) {
    const src = sourceFileOf(fr.text);
    const owner = items.get(keyOf(src ?? fr.name)) ?? items.get(keyOf(fr.name));
    if (owner) {
      owner.frdText = fr.text;
      owner.frdName = fr.name;
      owner.header = headerOf(fr.text);
      continue;
    }
    const { stem, role } = stemOf(fr.name);
    items.set(keyOf(fr.name), { name: fr.name, stem, role, pir: null, frdText: fr.text, frdName: fr.name, header: headerOf(fr.text) });
  }
  const list = [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
  const stems = [...new Set(list.map((i) => i.stem))];
  const sources: SessionSource[] = [];
  for (const stem of stems) {
    const far = list.find((i) => i.stem === stem && i.role === 'far') ?? null;
    const near = list.find((i) => i.stem === stem && i.role === 'near') ?? null;
    if (!far && !near) continue;
    const kind: SessionSource['kind'] = far && near ? 'driver' : !far && near && PORT_STEM.test(stem) ? 'port' : far ? 'far-only' : 'driver';
    sources.push({ stem, label: stem, kind, far, near });
  }
  const pirs = list.filter((i) => i.pir);
  const timeBaseShared = pirs.length > 0 && pirs.every((i) => i.pir!.timeBase === 'session');
  if (pirs.length > 0 && !timeBaseShared) notes.push('not every impulse is dual-channel: no shared time base, the delay is fitted only');
  const calibration = calibrationOf(list);
  return { name, items: list, sources, impedances, timeBaseShared, calibration, notes };
}

/* ------------------------------------------------------------------ *
 * Gate from the header, calibration
 * ------------------------------------------------------------------ */

function fullFft(x: Float64Array, n: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x.subarray(0, Math.min(n, x.length)));
  fftInPlace(re, im);
  return { re, im };
}

/** Where an FRD export's phase zero (its reference time) sits on the PIR it was exported from, ms (V56). */
export function frdZeroOnPirMs(frdText: string, pir: Impulse): number {
  const f = parseFrd(frdText);
  const n = Math.max(65536, 1 << Math.ceil(Math.log2(pir.samples.length)));
  const imp = impulseFromFrd({ name: 'x', freq: f.freq, splDb: f.spl, phaseDeg: f.phase, sampleRate: pir.sampleRate, length: n, alreadyGated: true });
  const A = fullFft(pir.samples, imp.samples.length);
  const B = fullFft(imp.samples, imp.samples.length);
  const m = imp.samples.length;
  const re = new Float64Array(m);
  const im = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    re[k] = A.re[k] * B.re[k] + A.im[k] * B.im[k];
    im[k] = -(A.im[k] * B.re[k] - A.re[k] * B.im[k]);
  }
  fftInPlace(re, im);
  let best = 0;
  for (let i = 1; i < m; i++) if (re[i] > re[best]) best = i;
  return ((best > m / 2 ? best - m : best) / pir.sampleRate) * 1000;
}

/**
 * The far field's gate, ALWAYS from the header (V60: Left/Right are lengths from the reference).
 * PIR route: the reference sits where the FRD export's phase zero lies on the PIR. FRD route:
 * the reference is the FRD's own phase zero. No header: refused with the field named.
 */
export function gateOf(item: SessionItem): { gate: Gate; route: 'pir' | 'frd' } | { error: string; field: string } {
  if (!item.header) {
    return { error: `${item.name}: no window in a header — load the far field's FRD export (Left / Reference / Right window)`, field: 'window' };
  }
  const h = item.header;
  if (item.pir && item.frdText) {
    return { gate: { referenceMs: frdZeroOnPirMs(item.frdText, item.pir), leftMs: h.leftWindowMs, rightMs: h.rightWindowMs, rightTaper: h.rightTaper }, route: 'pir' };
  }
  return { gate: { referenceMs: 0, leftMs: h.leftWindowMs, rightMs: h.rightWindowMs, rightTaper: h.rightTaper }, route: 'frd' };
}

/**
 * I-4 PIR-only — the window when there is no FRD export to read it from: STATED in the tool, all four
 * values, no default (a window is the choice that sets 1/T; a default would be a choice nobody made).
 * Left and right are LENGTHS from the reference (V60); the reference is a time on the PIR's own time
 * base, and it is the phase zero of the merge.
 */
export function statedPirGate(s: { referenceMs: number | null; leftMs: number | null; rightMs: number | null; taper: number | null }): { gate: Gate } | { error: string; field: string } {
  const missing: string[] = [];
  if (s.referenceMs === null || !Number.isFinite(s.referenceMs) || s.referenceMs < 0) missing.push('reference (ms on the PIR time base)');
  if (s.leftMs === null || !Number.isFinite(s.leftMs) || s.leftMs < 0) missing.push('left length (ms, ≥ 0)');
  if (s.rightMs === null || !Number.isFinite(s.rightMs) || !(s.rightMs > 0)) missing.push('right length (ms, > 0)');
  if (s.taper === null || !Number.isFinite(s.taper) || s.taper < 0 || s.taper > 1) missing.push('Tukey taper (0…1)');
  if (missing.length) return { error: `no FRD export, so the window is stated here and nothing is assumed — missing: ${missing.join(', ')}`, field: 'window' };
  return { gate: { referenceMs: s.referenceMs!, leftMs: s.leftMs!, rightMs: s.rightMs!, rightTaper: s.taper! } };
}

/** Where the direct sound peaks on a PIR (ms): shown beside the window fields as information, never filled in. */
export function directPeakMs(pir: Impulse): number {
  let k = 0;
  let m = -1;
  for (let i = 0; i < pir.samples.length; i++) {
    const a = Math.abs(pir.samples[i]);
    if (a > m) {
      m = a;
      k = i;
    }
  }
  return (k / pir.sampleRate) * 1000;
}

/** The impulse a merge reads for an item: the raw PIR, else the FRD rebuilt (gated for a far field). */
export function impulseOfItem(item: SessionItem, session: string, gated: boolean): Impulse {
  if (item.pir) return item.pir;
  const f = parseFrd(item.frdText!);
  return impulseFromFrd({ name: item.name, freq: f.freq, splDb: f.spl, phaseDeg: f.phase, sampleRate: 48000, length: 65536, alreadyGated: gated, session });
}

/**
 * The calibration the measuring program applied to its exports: |FRD| ÷ |FFT(window × PIR)| on a
 * near field that has both (its window is long, so the quotient spans the whole band). Several
 * pairs must agree; the note says how closely. None: null, and the merge keeps the impulses' own scale.
 */
function calibrationOf(items: readonly SessionItem[]): LoadedSession['calibration'] {
  const pairs = items.filter((i) => i.role === 'near' && i.pir && i.frdText && i.header);
  const curves: { freq: number[]; db: number[] }[] = [];
  for (const it of pairs) {
    const f = parseFrd(it.frdText!);
    const fs = it.pir!.sampleRate;
    const n = Math.round(fs / ((f.freq[f.freq.length - 1] - f.freq[0]) / (f.freq.length - 1)));
    const zero = frdZeroOnPirMs(it.frdText!, it.pir!);
    const h = it.header!;
    const x = it.pir!.samples;
    const sig = new Float64Array(n);
    for (let i = 0; i < Math.min(n, x.length); i++) {
      const t = (i / fs) * 1000 - zero;
      if (t < -h.leftWindowMs || t > h.rightWindowMs) continue;
      const ts = h.rightWindowMs * (1 - h.rightTaper);
      sig[i] = x[i] * (t <= ts || h.rightTaper === 0 ? 1 : 0.5 * (1 + Math.cos((Math.PI * (t - ts)) / (h.rightWindowMs - ts))));
    }
    const X = fullFft(sig, n);
    const c = { freq: [] as number[], db: [] as number[] };
    for (let i = 0; i < f.freq.length; i++) {
      const k = Math.round(f.freq[i] / (fs / n));
      const mag = Math.hypot(X.re[k], X.im[k]);
      if (mag > 0) {
        c.freq.push(f.freq[i]);
        c.db.push(f.spl[i] - 20 * Math.log10(mag));
      }
    }
    curves.push(c);
  }
  if (curves.length === 0) return null;
  let spread = 0;
  for (const c of curves.slice(1)) {
    for (let i = 0; i < Math.min(c.db.length, curves[0].db.length); i++) spread = Math.max(spread, Math.abs(c.db[i] - curves[0].db[i]));
  }
  return {
    ...curves[0],
    note: `magnitude from the session's own near-field FRD exports (zero phase); ${curves.length} file(s) agree within ${spread.toFixed(4)} dB`,
  };
}

export function interpLog(fx: readonly number[], fy: readonly number[], f: number): number {
  if (f <= fx[0]) return fy[0];
  if (f >= fx[fx.length - 1]) return fy[fy.length - 1];
  let lo = 0;
  let hi = fx.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (fx[m] <= f) lo = m;
    else hi = m;
  }
  const t = Math.log(f / fx[lo]) / Math.log(fx[hi] / fx[lo]);
  return fy[lo] + t * (fy[hi] - fy[lo]);
}

/* ------------------------------------------------------------------ *
 * The set-up and its planes
 * ------------------------------------------------------------------ */

export type Surface = 'floor' | 'table' | 'stand';
export interface RigSetup {
  /** The cabinet's bottom above the floor, mm. */
  bottomAboveFloorMm: number | null;
  /** What the cabinet stands on. */
  surface: Surface | null;
  /** How far the table or stand top reaches beyond the baffle, mm (not for the floor). */
  surfaceOverhangMm: number | null;
  /** B-4 — the overhang stated as UNKNOWN (like a plane): the set-up counts as stated, nothing is
   *  modelled for the top or the floor, and the reflections are not checked. */
  surfaceOverhangUnknown?: boolean;
  /** B-4 nazorg — the overhang stated as a BOUND ("less than about 13 cm", the exact figure to follow):
   *  not a value. It decides the plane only where the reflection point lies past it (then the floor
   *  reflects whatever the exact figure is); nearer than the bound it is undecided and nothing is
   *  modelled — the same answer as unknown. Counts as stated. */
  surfaceOverhangMaxMm?: number | null;
  /** Microphone to baffle, mm. */
  micDistanceMm: number | null;
  /** Microphone above the floor, mm. */
  micHeightMm: number | null;
}

export type PlaneAnswer = { kind: 'measured'; mm: number } | { kind: 'farther' } | { kind: 'unknown' } | null;
/** The planes other than what the cabinet stands on. Each must be ANSWERED — empty is not allowed. */
export interface PlanesStated {
  /** Height of the ceiling above the floor. */
  ceiling: PlaneAnswer;
  /** Distance of the nearest side wall from the line cabinet → mic. */
  sideWall: PlaneAnswer;
  /** Distance of the wall behind the cabinet. */
  wallBehindCabinet: PlaneAnswer;
  /** Distance of the wall behind the microphone. */
  wallBehindMic: PlaneAnswer;
}
export const PLANE_KEYS = ['ceiling', 'sideWall', 'wallBehindCabinet', 'wallBehindMic'] as const;

/** How far a plane can be and still reflect inside the gate: c·T/2, T = window after the direct sound, mm. */
export function reflectionReachMm(gateAfterArrivalMs: number): number {
  return (C_MM_PER_MS * gateAfterArrivalMs) / 2;
}

export interface SetupStatus {
  complete: boolean;
  missing: string[];
  unknownPlanes: string[];
  /** A merge on this set-up may be called "explained" only when no plane is unknown. */
  reflectionsChecked: boolean;
}

export function setupStatus(rig: RigSetup, planes: PlanesStated): SetupStatus {
  const missing: string[] = [];
  if (!(rig.bottomAboveFloorMm != null && rig.bottomAboveFloorMm >= 0)) missing.push('cabinet bottom above the floor');
  if (!rig.surface) missing.push('what the cabinet stands on');
  const bounded = rig.surfaceOverhangMaxMm != null && rig.surfaceOverhangMaxMm >= 0;
  if (rig.surface && rig.surface !== 'floor' && !rig.surfaceOverhangUnknown && !bounded && !(rig.surfaceOverhangMm != null && rig.surfaceOverhangMm >= 0)) missing.push('overhang of the table / stand top (a distance, "at most X", or "unknown")');
  if (!(rig.micDistanceMm != null && rig.micDistanceMm > 0)) missing.push('microphone distance to the baffle');
  if (!(rig.micHeightMm != null && rig.micHeightMm > 0)) missing.push('microphone height above the floor');
  const unknownPlanes: string[] = [];
  for (const k of PLANE_KEYS) {
    const a = planes[k];
    if (a === null) missing.push(`plane: ${k} (a distance, "farther than X", or "unknown" — empty is not allowed)`);
    else if (a.kind === 'unknown') unknownPlanes.push(k);
    else if (a.kind === 'measured' && !(a.mm > 0)) missing.push(`plane: ${k} distance`);
  }
  if (rig.surface && rig.surface !== 'floor' && rig.surfaceOverhangUnknown) unknownPlanes.push('overhang');
  return { complete: missing.length === 0, missing, unknownPlanes, reflectionsChecked: unknownPlanes.length === 0 };
}

/**
 * The reflections ONE source sees in this set-up, as echo terms for the merge kernel.
 *  - What the cabinet stands on: the floor; or a table / stand top, whose reflection point must
 *    fall ON the top (within its overhang) — past the edge the reflection comes off the floor.
 *    A source closer to that plane than a quarter period at the top of the fit band sits ON it:
 *    a boundary, not an echo.
 *  - A measured ceiling (above), a measured side wall (beside the path).
 *  - A measured wall behind the cabinet or the mic is not a horizontal mirror the kernel models:
 *    said in a note, never folded in silently.
 */
export function echoesForSource(opts: {
  sourceHeightMm: number;
  rig: RigSetup;
  planes: PlanesStated;
  fitTopHz: number;
}): { echoes: EchoTerm[]; notes: string[] } {
  const { rig, planes } = opts;
  const h = opts.sourceHeightMm;
  const mic = rig.micHeightMm!;
  const d = rig.micDistanceMm!;
  const echoes: EchoTerm[] = [];
  const notes: string[] = [];
  const onPlaneMm = (ON_PLANE_PERIOD_FRACTION / opts.fitTopHz) * C_MM_PER_MS * 1000 / 2;
  const below = (label: string, top: number) => {
    const s = h - top;
    if (s <= onPlaneMm) {
      echoes.push({ kind: 'boundary', label, sourceAboveM: Math.max(0, s) / 1000 });
      return true;
    }
    echoes.push({ kind: 'plane', label, sourceAboveM: s / 1000, micAboveM: (mic - top) / 1000, horizontalM: d / 1000 });
    return true;
  };
  if (rig.surface === 'floor') {
    below('floor', 0);
  } else if (!rig.surface) {
    // B-4: nothing assumed — an unstated surface is not "the floor"
    notes.push('what the cabinet stands on is not stated: neither the floor nor a top is modelled — state it');
  } else {
    const top = rig.bottomAboveFloorMm!;
    const s = h - top;
    const m = mic - top;
    /* Two points decide it (B-4 nazorg, 14-11-2026). xTop: where the TOP's own reflection lands, on
     * its plane. xCut: where the source's leg of the FLOOR path crosses the top's plane. xCut < xTop
     * always. An overhang reaching xTop: the top reflects. One short of xCut: the floor path passes
     * the edge and the floor reflects. Between them the top blocks the floor path and does not reach
     * its own point — neither is a mirror (an edge, not modelled). Until 14-11 only xTop was asked,
     * so a blocked floor path was modelled as a floor echo. Sander's casus 1 checks it: source
     * 0.794 m and mic 1.380 m above the floor, table top 0.500 m, 1.0 m out — xCut = 135 mm, and the
     * floor echo is there, so his overhang is under ~13 cm. */
    const xTop = s + m > 0 ? (d * s) / (s + m) : Infinity;
    const xCut = h + mic > 0 && h > 0 ? (d * s) / (h + mic) : Infinity;
    const o = rig.surfaceOverhangMm;
    const maxO = rig.surfaceOverhangMaxMm;
    const where = `top reflection point ${xTop.toFixed(0)} mm out, floor path crossing the top at ${xCut.toFixed(0)} mm`;
    if (s <= onPlaneMm) {
      below(`${rig.surface} top`, top);
    } else if (o === null && maxO != null && maxO >= 0) {
      if (maxO <= xCut) {
        notes.push(`${rig.surface} top: ${where}; the stated bound (overhang less than ${maxO} mm) lies short of both — the floor reflects, whatever the exact overhang`);
        below('floor', 0);
      } else {
        notes.push(`${rig.surface} top: ${where}; the stated bound (overhang less than ${maxO} mm) does not decide which plane reflects — neither is modelled; state the exact overhang`);
      }
    } else if (o === null) {
      // B-4: an unstated overhang is not 0 — which plane reflects cannot be decided
      notes.push(`${rig.surface} top: its overhang is not known (stated as unknown, or not stated); ${where} — which plane reflects is not decided, neither is modelled; state the overhang`);
    } else if (o >= xTop) {
      below(`${rig.surface} top`, top);
      notes.push(`${rig.surface} top: the reflection point lies ${xTop.toFixed(0)} mm out, on the top (overhang ${o} mm)`);
    } else if (o <= xCut) {
      notes.push(`${rig.surface} top: ${where}; the ${o} mm overhang lies short of both — the floor reflects`);
      below('floor', 0);
    } else {
      notes.push(`${rig.surface} top: ${where}; the ${o} mm overhang blocks the floor path and does not reach its own reflection point — neither plane is a mirror here (an edge, not modelled)`);
    }
  }
  const c = planes.ceiling;
  if (c?.kind === 'measured') echoes.push({ kind: 'plane', label: 'ceiling', sourceAboveM: (c.mm - h) / 1000, micAboveM: (c.mm - mic) / 1000, horizontalM: d / 1000 });
  const w = planes.sideWall;
  if (w?.kind === 'measured') echoes.push({ kind: 'plane', label: 'side wall', sourceAboveM: w.mm / 1000, micAboveM: w.mm / 1000, horizontalM: d / 1000 });
  for (const k of ['wallBehindCabinet', 'wallBehindMic'] as const) {
    const a = planes[k];
    if (a?.kind === 'measured') notes.push(`${k}: stated (${a.mm} mm) but not a horizontal mirror the merge models — its reflection is NOT in the model`);
  }
  return { echoes, notes };
}

/* ------------------------------------------------------------------ *
 * Proposals, status, checks
 * ------------------------------------------------------------------ */

/** ka = 1 for a piston of area `sdCm2`, Hz. */
export function kaOneHz(sdCm2: number): number {
  const a = Math.sqrt(sdCm2 / 1e4 / Math.PI);
  return 343 / (2 * Math.PI * a);
}

/**
 * The fit band and handover PROPOSED from the window and ka; the user overrides either.
 * Floor: `FIT_FLOOR_PERIODS_IN_GATE` periods of the window after the direct sound. Top:
 * `SPLICE_KA_MARGIN` × ka = 1 (where the near field stops being the far field). Handover: from
 * the band's geometric centre to its top. No Sd: no top, and the proposal says so (P4).
 */
export function proposeBands(gateAfterArrivalMs: number, sdCm2: number | null): { fitHz: [number, number] | null; spliceHz: [number, number] | null; note: string } {
  const lo = FIT_FLOOR_PERIODS_IN_GATE / (gateAfterArrivalMs / 1000);
  if (!(sdCm2 && sdCm2 > 0)) return { fitHz: null, spliceHz: null, note: `fit band floor ${lo.toFixed(0)} Hz from the window; no top without the cone area (ka) — state the band` };
  const hi = SPLICE_KA_MARGIN * kaOneHz(sdCm2);
  if (!(hi > lo * 1.25)) return { fitHz: null, spliceHz: null, note: `the window (${lo.toFixed(0)} Hz) and ka (${hi.toFixed(0)} Hz) leave no band — state one` };
  const mid = Math.sqrt(lo * hi);
  return {
    fitHz: [lo, hi],
    spliceHz: [mid, hi],
    note: `proposed: ${FIT_FLOOR_PERIODS_IN_GATE} period of the ${gateAfterArrivalMs.toFixed(2)} ms after the direct sound = ${lo.toFixed(0)} Hz, up to ${SPLICE_KA_MARGIN} × ka = 1 = ${hi.toFixed(0)} Hz`,
  };
}

export type MergeStatus = 'explained' | 'flags' | 'unchecked';
export function statusOf(r: MergeV2Result, setup: SetupStatus): MergeStatus {
  if (r.flags.length > 0) return 'flags';
  if (!setup.reflectionsChecked) return 'unchecked';
  return 'explained';
}

export interface Check {
  id: string;
  icon: 'ok' | 'info' | 'bad';
  text: string;
}

/** One line per check, in the order of the B-2 sketch. Reads the result; decides nothing new. */
export function checksOf(r: MergeV2Result, residualFlagDeg: number): Check[] {
  const out: Check[] = [];
  const has = (re: RegExp) => r.flags.some((f) => re.test(f));
  out.push(
    r.timing
      ? { id: 'timebase', icon: 'ok', text: 'time base shared (dual-channel)' }
      : { id: 'timebase', icon: 'info', text: 'no shared time base — the delay is fitted only' },
  );
  out.push({
    id: 'residual',
    icon: r.fit.residualRmsDeg > residualFlagDeg ? 'bad' : 'ok',
    text: `residual ${r.fit.residualRmsDeg.toFixed(1)}° / ${r.fit.residualRmsDb.toFixed(2)} dB rms (convention ${residualFlagDeg}°)`,
  });
  if (r.timing) {
    out.push({
      id: 'timing',
      icon: has(/wrong cycle/) ? 'bad' : 'info',
      text: `fitted delay against the measured arrival: ${r.timing.differenceUs.toFixed(0)} µs — plausibility; a flag only past a quarter period (wrong cycle)`,
    });
  }
  if (r.echoesFound) {
    const note = r.notes.find((n) => /echo finder band/.test(n)) ?? '';
    const unexplained = r.echoesFound.filter((e) => e.insideGate && !e.modelled && e.levelDb > -20);
    out.push({ id: 'echo-band', icon: 'info', text: note });
    for (const e of r.echoesFound.filter((x) => x.insideGate)) {
      out.push({
        id: `echo-${e.afterDirectMs.toFixed(2)}`,
        icon: e.modelled ? 'ok' : unexplained.includes(e) ? 'bad' : 'info',
        text: e.modelled
          ? `echo ${e.afterDirectMs.toFixed(2)} ms (${e.levelDb.toFixed(0)} dB) matches a stated plane within 0.1 ms`
          : `echo ${e.afterDirectMs.toFixed(2)} ms (${e.levelDb.toFixed(0)} dB) not explained — what stands about ${((e.afterDirectMs * C_MM_PER_MS) / 2 / 1000).toFixed(2)} m away?`,
      });
    }
  }
  const tail = r.flags.find((f) => /after the stated gate/.test(f)) ?? r.notes.find((n) => /gate matches the file/.test(n));
  if (tail) out.push({ id: 'tail', icon: /after the stated gate/.test(tail) ? 'bad' : 'ok', text: tail });
  for (const f of r.flags) {
    if (/does not explain|after the stated gate|wrong cycle|echo .* inside the gate/.test(f)) continue;
    out.push({ id: `flag-${out.length}`, icon: 'bad', text: f });
  }
  out.push({ id: 'v1', icon: 'info', text: `v1 would have absorbed ${r.v1OffsetDeg.toFixed(0)}° with a free offset here (informative)` });
  return out;
}

/** Arrival → right edge of the gate, ms: the window the far field has after its direct sound. */
export function gateAfterArrivalMs(gate: Gate, far: Impulse): number {
  return gate.referenceMs + gate.rightMs - arrivalMs(far);
}

/* ------------------------------------------------------------------ *
 * The branch: the sum of its accepted sources
 * ------------------------------------------------------------------ */

/**
 * A design branch with several sources (a woofer pair) gets the COMPLEX sum of their accepted
 * merges, written with a block both readers know (`Merge = NF/FF`, the strictest `Valid from`)
 * and the sources listed. One source: its own file, unchanged.
 */
export function branchFile(name: string, sources: readonly { name: string; text: string }[]): { name: string; text: string } {
  if (sources.length === 1) return { name: sources[0].name, text: sources[0].text };
  const parsed = sources.map((s) => ({ s, f: parseFrd(s.text), from: Number(/^\s*\*\s*Valid from\s*=\s*([0-9.]+)/m.exec(s.text)?.[1] ?? NaN), target: Number(/^\s*\*\s*Merge target valid from\s*=\s*([0-9.]+)/m.exec(s.text)?.[1] ?? NaN) }));
  const g = parsed[0].f.freq;
  for (const p of parsed) if (p.f.freq.length !== g.length || p.f.freq.some((v, i) => Math.abs(v - g[i]) > 1e-6)) throw new Error(`${p.s.name}: not on the same grid as ${parsed[0].s.name}`);
  const rows: string[] = [];
  for (let i = 0; i < g.length; i++) {
    let re = 0;
    let im = 0;
    for (const p of parsed) {
      const m = 10 ** (p.f.spl[i] / 20);
      const ph = (p.f.phase[i] * Math.PI) / 180;
      re += m * Math.cos(ph);
      im += m * Math.sin(ph);
    }
    rows.push(`${g[i].toFixed(4).padStart(12)}${(20 * Math.log10(Math.hypot(re, im))).toFixed(3).padStart(10)}${((Math.atan2(im, re) * 180) / Math.PI).toFixed(3).padStart(10)}`);
  }
  const from = Math.max(...parsed.map((p) => p.from).filter(Number.isFinite));
  const tgt = parsed.map((p) => p.target).filter(Number.isFinite);
  const head = [
    `* ${name} — complex sum of ${sources.length} NF/FF merges made by Crossover Studio`,
    `* Merge = NF/FF`,
    `* Valid from = ${from.toFixed(2)} Hz`,
    `* Valid to = ${g[g.length - 1].toFixed(2)} Hz`,
    `* Merge sum of = ${sources.map((s) => s.name).join(' | ')}`,
    `* Merge target valid from = ${tgt.length ? `${Math.max(...tgt).toFixed(2)} Hz` : 'none'}`,
  ];
  return { name, text: [...head, 'Freq[Hz]  dBSPL  Phase[Deg]', ...rows].join('\n') + '\n' };
}

/* ------------------------------------------------------------------ *
 * Export: one package per session
 * ------------------------------------------------------------------ */

export interface ExportInput {
  session: LoadedSession;
  /** Each accepted merge: its text on the merge grid, and — when the far field came with an FRD
   *  export — the same merge computed on that export's own grid (`textOriginal`). */
  merges: { source: string; fileName: string; text: string; textOriginal?: string | null; way: MergeWay; status?: string | null }[];
  rig: RigSetup;
  measuredObjectNote: string;
  targetNote: string;
  madeOn: string;
  /** I-4 fase 4 — one per set. Absent = as measured, on the merge grid (the files written unchanged). */
  phase?: ExportPhase;
  grid?: ExportGrid;
}

/**
 * The package: an FRD per merged source with its block, the session's impedances as ZMA,
 * `manifest.json` and `leesmij.txt`. One phase convention and one grid for the whole set (fase 4);
 * every failure is a reason, nothing is written half.
 */
export function exportPackage(x: ExportInput): { ok: true; files: { name: string; data: string }[] } | { ok: false; reason: string } {
  const phase: ExportPhase = x.phase ?? { kind: 'measured' };
  const grid: ExportGrid = x.grid ?? 'log48';
  const files: { name: string; data: string }[] = [];
  /* I-4 PIR-only: no calibration, no export — the level and the microphone's response would be the
   * soundcard's, and a file that does not say so would be taken for a measurement. Merging and fitting
   * stay possible; only the package (and "Use in project", its twin) refuse. */
  const raw = x.merges.filter((m) => isUncalibrated(m.text)).map((m) => m.fileName);
  if (raw.length) return { ok: false, reason: `not calibrated: ${raw.join(', ')} — choose a microphone calibration file for this session (or load its FRD exports), then accept again` };
  for (const m of x.merges) {
    const base = grid === 'original' ? m.textOriginal : m.text;
    if (!base) return { ok: false, reason: `${m.fileName}: no merge on the far field's own grid (its far field came without an FRD export) — export on the log 1/48-octave grid` };
    const conv = applyPhaseConvention(base, phase);
    if (!conv.ok) return { ok: false, reason: `${m.fileName}: ${conv.reason}` };
    files.push({ name: m.fileName, data: conv.text });
  }
  const manifest = {
    format: MERGE_PACKAGE_FORMAT,
    version: MERGE_SESSION_VERSION,
    export_version: MERGE_EXPORT_VERSION,
    session: x.session.name,
    made_on: x.madeOn,
    axes: { X: 'horizontal', Y: 'vertical', Z: 'depth' },
    mic_distance_mm: x.rig.micDistanceMm,
    mic_height_above_floor_mm: x.rig.micHeightMm,
    time_reference: x.session.timeBaseShared
      ? 'as measured: t = 0 on the session time base (the phase zero of each FRD export, see its Merge gate)'
      : 'per file: no shared time base',
    phase_convention: phaseConventionText(phase),
    grid: gridText(grid),
    measured_object: x.measuredObjectNote,
    target: x.targetNote,
    calibration: x.session.calibration?.note ?? "none (the impulses' own scale)",
    files: x.merges.map((m, i) => ({
      source: m.source,
      way: m.way,
      file: m.fileName,
      status: m.status ?? null,
      points: parseFrd(files[i].data).freq.length,
      valid_from_hz: Number(/^\s*\*\s*Valid from\s*=\s*([0-9.]+)/m.exec(m.text)?.[1] ?? NaN),
      target_valid_from: /^\s*\*\s*Merge target valid from\s*=\s*(.+)$/m.exec(m.text)?.[1] ?? null,
      residual: /phase residual\s*([0-9.]+)\s*deg/.exec(m.text)?.[1] ?? null,
      model_status: 'MODEL-validated below the splice: near field plus a near-to-far model',
    })),
    impedances: x.session.impedances.map((z) => z.name),
  };
  const readme = [
    `Crossover Studio — NF/FF merge session "${x.session.name}" (${x.madeOn})`,
    '',
    'Each .frd is one source: below its splice band the near field plus a near-to-far model, above it the',
    'gated far field. The header (Merge …) says how it was made, its residual and from where it is valid.',
    'Baffle step and diffraction are IN these files (full space): do NOT also switch on the diffraction tool',
    'in VituixCAD.',
    `Phase: ${phaseConventionText(phase)}.`,
    `Grid: ${gridText(grid)}.`,
    ...(phase.kind === 'minphase' ? ['', 'WARNING: minimum phase. The measured timing between the sources is NOT in these files.'] : []),
    '',
    'Crossover Studio reads this package back as it is (drop the .zip on Your project).',
  ].join('\n');
  return {
    ok: true,
    files: [
      ...files,
      ...x.session.impedances.map((z) => ({ name: z.name, data: z.zmaText })),
      { name: 'manifest.json', data: JSON.stringify(manifest, null, 1) + '\n' },
      { name: 'leesmij.txt', data: readme + '\n' },
    ],
  };
}

export { interpLog as interpLogMerge };

/* ------------------------------------------------------------------ *
 * I-4 B-4 — where a source sits, from GEOMETRY and never typed per source.
 *
 * A driver's acoustic centre above the cabinet bottom comes from one of two
 * places, and the tool asks for whichever is missing:
 *  - the optimizer's cabinet geometry (the measured object is the target
 *    cabinet, or another object with an identical baffle): baffle height,
 *    reference point from the top, the way's vertical offset, and for a pair
 *    WHICH member this source is — stated, never read off a file name;
 *  - the measured object's own geometry: a height stated for this source as
 *    part of that object's description.
 * A pair stacks on the baffle's long axis (the app's own rule, `arrayLobe`):
 * on a baffle wider than tall, or side-firing / opposed drivers, both members
 * sit at the pair's centre height.
 * ------------------------------------------------------------------ */

export type MergeWay = 'low' | 'mid' | 'high';
export interface CabinetGeometryForMerge {
  baffleWidthMm: number | null;
  baffleHeightMm: number | null;
  refFromTopMm: number | null;
  drivers: Record<MergeWay, { yMm: number | null; count: number | null; spacingMm: number | null; facingFront: boolean; opposed: boolean }>;
}
export type SourcePlacement =
  | { kind: 'cabinet'; way: MergeWay | null; member: 'single' | 'upper' | 'lower' | null }
  | { kind: 'own'; aboveBottomMm: number | null };

export function sourceAboveBottomMm(
  p: SourcePlacement,
  geom: CabinetGeometryForMerge | null,
): { mm: number; from: string } | { missing: string[] } {
  if (p.kind === 'own') {
    return p.aboveBottomMm !== null && Number.isFinite(p.aboveBottomMm)
      ? { mm: p.aboveBottomMm, from: "the measured object's own geometry" }
      : { missing: ["this driver's height above the measured object's bottom (its own geometry)"] };
  }
  const missing: string[] = [];
  if (!p.way) missing.push('which driver of the cabinet this source is');
  if (!geom) missing.push('the cabinet geometry (Your cabinet: front panel, reference point, driver positions)');
  if (missing.length || !geom || !p.way) return { missing };
  const d = geom.drivers[p.way];
  if (geom.baffleHeightMm === null) missing.push('front panel height');
  if (geom.refFromTopMm === null) missing.push('reference point below the top');
  if (d.yMm === null) missing.push(`the ${p.way} driver's vertical offset`);
  const pair = (d.count ?? 1) >= 2;
  const stacked = pair && d.facingFront && !d.opposed && geom.baffleWidthMm !== null && geom.baffleHeightMm !== null && geom.baffleHeightMm >= geom.baffleWidthMm;
  if (pair && d.facingFront && !d.opposed && geom.baffleWidthMm === null) missing.push('front panel width (the axis a pair stacks on)');
  if (stacked) {
    if (d.spacingMm === null) missing.push(`the ${p.way} pair's spacing`);
    if (p.member !== 'upper' && p.member !== 'lower') missing.push(`which member of the ${p.way} pair this source is (upper or lower)`);
  }
  if (missing.length) return { missing };
  const centre = geom.baffleHeightMm! - geom.refFromTopMm! + d.yMm!;
  if (!stacked) return { mm: centre, from: pair ? 'the cabinet geometry (pair centre: the pair does not stack vertically)' : 'the cabinet geometry' };
  const off = ((p.member === 'upper' ? 1 : -1) * d.spacingMm!) / 2;
  return { mm: centre + off, from: `the cabinet geometry (${p.member} member of the pair)` };
}

/**
 * I-4 B-4 — the window a merge uses. On the PIR route the header's window is the
 * default and a SHORTER right length may be chosen (the raw impulse can be gated
 * again); longer is refused (the far field past the header window was never
 * judged clean), and on the FRD route nothing can be chosen (the file is already
 * gated). The result always says which window it is and its 1/T, T being the
 * right length from the reference (V60).
 */
export function chosenGate(
  header: Gate,
  route: 'pir' | 'frd',
  rightMs: number | null,
): { gate: Gate; source: 'header' | 'chosen'; headerRightMs: number; oneOverTHz: number } | { error: string; field: string } {
  if (rightMs === null) return { gate: header, source: 'header', headerRightMs: header.rightMs, oneOverTHz: 1000 / header.rightMs };
  if (route === 'frd') return { error: 'the far field is an FRD export: it is already gated with its header window, a shorter one cannot be applied — load its .pir', field: 'window' };
  if (!(rightMs > 0)) return { error: 'a chosen window needs a right length > 0 ms', field: 'window' };
  if (rightMs > header.rightMs) return { error: `a chosen window may only be shorter than the header's ${header.rightMs} ms`, field: 'window' };
  return { gate: { ...header, rightMs }, source: 'chosen', headerRightMs: header.rightMs, oneOverTHz: 1000 / rightMs };
}
