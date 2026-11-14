/**
 * I-4 fase 4 — the export package: one phase convention and one grid per set, both said in every
 * file's header and in the manifest; and the reader the design uses to take the package in.
 *
 * PHASE CONVENTION, one per set (startprompt fase 4):
 *  - as measured (the default): t = 0 on the session time base — the phase the merge was made in.
 *    The file is written UNCHANGED, byte for byte: exactly what "Use in project" hands the design.
 *  - at a reference point: t = 0 moved to a stated time on the same time base. One shift for every
 *    file of the set, so the timing BETWEEN sources survives.
 *  - minimum phase: reconstructed from the magnitude; only when asked for, and the header says in
 *    capitals that the measured timing is gone.
 *
 * GRID: the merge's own log 1/48-octave grid (the default; what the design uses), or the far field's
 * own export grid. Both are computed by the merge kernel itself on that grid — the tool merges once
 * per grid at accept time — so nothing is interpolated and no phase is smoothed. (Interpolating was
 * measured and refused: casus 1's woofer down steps up to 177° between neighbouring points above
 * 10 kHz, where an unwrap can only guess.)
 *
 * ROUND TRIP: export → import is numerically identical — the design reads the very text the package
 * holds; the test pins it against "Use in project" for the default set.
 */
import { minimumPhaseDeg } from './minphase.ts';
import { parseFrd } from './parsers/frd.ts';
import { unzipStore } from './zip.ts';
import type { MergeWay } from './mergeSession.ts';

export const MERGE_EXPORT_VERSION = 'merge-export/1.0';
export const MERGE_PACKAGE_FORMAT = 'crossover-studio-merge-session/1';

export type ExportPhase = { kind: 'measured' } | { kind: 'reference'; ms: number | null } | { kind: 'minphase' };
export type ExportGrid = 'log48' | 'original';

const WRAP = (p: number) => {
  let x = ((p + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};

/** The gate reference the file's phase is relative to (its `Merge gate` line), ms. */
export function phaseZeroMsOf(text: string): number | null {
  const m = /^\s*\*\s*Merge gate\s*=\s*reference\s*([0-9.]+)\s*ms/m.exec(text);
  return m ? Number(m[1]) : null;
}

function rows(freq: readonly number[], spl: readonly number[], phase: readonly number[]): string[] {
  return freq.map((f, i) => `${f.toFixed(4).padStart(12)}${spl[i].toFixed(3).padStart(10)}${phase[i].toFixed(3).padStart(10)}`);
}

/** Extra `*` lines before the column header; the data rows untouched. */
export function addHeaderLines(text: string, extra: string[]): string {
  return withHeaderLines(text, extra, null);
}

function withHeaderLines(text: string, extra: string[], body: string[] | null): string {
  const lines = text.split('\n');
  const head = lines.filter((l) => l.startsWith('*'));
  const colHead = lines.find((l) => !l.startsWith('*') && /freq/i.test(l)) ?? 'Freq[Hz]  dBSPL  Phase[Deg]';
  const data = body ?? lines.filter((l) => !l.startsWith('*') && !/freq/i.test(l) && l.trim() !== '');
  return [...head, ...extra.map((e) => `* ${e}`), colHead, ...data].join('\n') + '\n';
}

/**
 * One file in the set's phase convention. "As measured" returns the text untouched (the round-trip
 * and "Use in project" depend on that). Every other convention adds a `Merge export phase` line.
 */
export function applyPhaseConvention(text: string, phase: ExportPhase): { ok: true; text: string } | { ok: false; reason: string } {
  if (phase.kind === 'measured') return { ok: true, text };
  const frd = parseFrd(text);
  if (phase.kind === 'reference') {
    const t0 = phaseZeroMsOf(text);
    if (t0 === null) return { ok: false, reason: 'the file states no gate reference (Merge gate), so a reference point cannot be measured from it' };
    if (phase.ms === null || !Number.isFinite(phase.ms)) return { ok: false, reason: 'the reference point is not stated (a time on the session time base, ms)' };
    const d = phase.ms - t0;
    const ph = frd.freq.map((f, i) => WRAP(frd.phase[i] + 360 * f * d * 1e-3));
    return {
      ok: true,
      text: withHeaderLines(
        text,
        [`Merge export phase = at a reference point: t = 0 at ${phase.ms.toFixed(4)} ms on the session time base (${d >= 0 ? '+' : ''}${d.toFixed(4)} ms from the gate reference ${t0.toFixed(4)} ms); the same shift for every file of this set`],
        rows(frd.freq, frd.spl, ph),
      ),
    };
  }
  const mp = minimumPhaseDeg(frd.freq, frd.spl).map(WRAP);
  return {
    ok: true,
    text: withHeaderLines(
      text,
      ['Merge export phase = MINIMUM PHASE, reconstructed from the magnitude — the MEASURED TIMING IS GONE: do not sum these files with each other or with as-measured files to judge a crossover'],
      rows(frd.freq, frd.spl, mp),
    ),
  };
}

/** The convention in words, for the manifest and the read-me. */
export function phaseConventionText(phase: ExportPhase): string {
  if (phase.kind === 'measured') return 'as measured: t = 0 on the session time base';
  if (phase.kind === 'reference') return `at a reference point: t = 0 at ${phase.ms?.toFixed(4) ?? '—'} ms on the session time base`;
  return 'MINIMUM PHASE (reconstructed from the magnitude; the measured timing is gone)';
}

export function gridText(grid: ExportGrid): string {
  return grid === 'log48' ? 'log 1/48 octave (the merge grid; what the design uses)' : "the far field's own export grid (computed by the merge on those frequencies, not interpolated)";
}

/* ------------------------------------------------------------------ *
 * The design reads the package back.
 * ------------------------------------------------------------------ */

export interface PackageFile {
  source: string;
  way: MergeWay;
  name: string;
  text: string;
  status: string | null;
}
export type ReadPackage =
  | { ok: true; session: string; phase: string; grid: string; files: PackageFile[]; notes: string[] }
  | { ok: false; reason: string };

const WAYS = new Set(['low', 'mid', 'high']);

/** The merge tool's package, from its files (a folder's contents or an unpacked ZIP). */
export function readMergePackage(entries: readonly { name: string; data: string }[]): ReadPackage {
  const base = (n: string) => n.split('/').pop() ?? n;
  const byName = new Map(entries.map((e) => [base(e.name), e.data]));
  const manText = byName.get('manifest.json');
  if (manText === undefined) return { ok: false, reason: 'no manifest.json — not a merge-tool export package' };
  let man: Record<string, unknown>;
  try {
    man = JSON.parse(manText) as Record<string, unknown>;
  } catch (e) {
    return { ok: false, reason: `manifest.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (man.format !== MERGE_PACKAGE_FORMAT) return { ok: false, reason: `manifest.json is not a merge-tool package (format ${String(man.format)})` };
  const list = Array.isArray(man.files) ? (man.files as Record<string, unknown>[]) : [];
  if (list.length === 0) return { ok: false, reason: 'the package holds no merged file' };
  const files: PackageFile[] = [];
  for (const f of list) {
    const name = String(f.file ?? '');
    const way = String(f.way ?? '');
    if (!WAYS.has(way)) return { ok: false, reason: `${name}: the manifest names no branch (low / mid / high) for it` };
    const text = byName.get(name);
    if (text === undefined) return { ok: false, reason: `${name} is listed in manifest.json but not in the package` };
    files.push({ source: String(f.source ?? name), way: way as MergeWay, name, text, status: typeof f.status === 'string' ? f.status : null });
  }
  const notes: string[] = [];
  const phase = String(man.phase_convention ?? '');
  if (!/^as measured/.test(phase)) notes.push(`phase convention of this set: ${phase} — not the convention the merge was made in`);
  return { ok: true, session: String(man.session ?? ''), phase, grid: String(man.grid ?? ''), files, notes };
}

/** A dropped ZIP → the package. Every failure is a reason. */
export function readMergePackageZip(bytes: Uint8Array): ReadPackage {
  let entries: { name: string; data: Uint8Array }[];
  try {
    entries = unzipStore(bytes);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const dec = new TextDecoder('utf-8', { ignoreBOM: true });
  return readMergePackage(entries.map((e) => ({ name: e.name, data: dec.decode(e.data) })));
}
