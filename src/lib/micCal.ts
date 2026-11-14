/**
 * I-4 PIR-only — a microphone calibration file, read and applied.
 *
 * Without the FRD exports a session has only raw impulses, and their level is the soundcard's scale
 * with the microphone's own response still in it. The calibration file removes that response. Three
 * text formats, all "frequency, response in dB, optional phase in degrees", all storing the
 * MICROPHONE'S RESPONSE (the correction is its negative):
 *  - JustOct `.mic` (Sanders MM1CDU file): `#` comments, `Label<TAB>value` lines (Sensitivity,
 *    dB-offset, Title), a column header, then TAB-separated rows, amplitudes relative to 1 kHz;
 *  - ARTA `.txt` / `.cal`: rows, comments with `*`;
 *  - REW `.txt` / `.cal`: rows, comments with `*` or `"`, and a `Sens Factor =` line.
 * A decimal COMMA is refused, never guessed at ("362,3" means one thing in Dutch and two in a list).
 *
 * WHAT IT DOES NOT GIVE: the absolute level. The file states the microphone's sensitivity (mV/Pa)
 * at best; the soundcard's input sensitivity is not in it, so a PIR-only merge is calibrated in
 * SHAPE and its level stays relative (the impulses' own scale). The header says so.
 *
 * Measured on casus 1 (14-11-2026): the curve FRD ÷ PIR that the session's own exports imply equals
 * −(MM1CDU_allein_00d.mic) within 0.014 dB from 10.6 Hz to 21.1 kHz; only the file's first point
 * (10 Hz) differs, by 0.25 dB. No soundcard correction is in ARTA's exports.
 */
import { interpLog } from './mergeSession.ts';

export const MIC_CAL_VERSION = 'mic-cal/1.0';

export interface MicCal {
  id: string;
  /** The file name it came from. */
  name: string;
  title: string | null;
  format: 'justoct' | 'arta-rew';
  freq: number[];
  /** The microphone's response, dB (the correction is its negative). */
  db: number[];
  /** The microphone's phase, degrees, or null when the file gives none (or only zeros). */
  phaseDeg: number[] | null;
  /** What the file says about level, in words; null when it says nothing. */
  sensitivityNote: string | null;
}

export type ParsedCal = { ok: true; cal: Omit<MicCal, 'id'> } | { ok: false; reason: string };

/** Read a calibration file. Every refusal names the line. */
export function parseMicCal(name: string, text: string): ParsedCal {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  let sens: string | null = null;
  let offset: string | null = null;
  let justOct = false;
  const freq: number[] = [];
  const db: number[] = [];
  const ph: number[] = [];
  let phaseCols = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#') || raw.startsWith('*') || raw.startsWith('"')) {
      const sf = /Sens(?:itivity)?\s*Factor\s*=\s*([-0-9.]+)\s*dB/i.exec(raw);
      if (sf) sens = `REW sensitivity factor ${sf[1]} dB`;
      continue;
    }
    const kv = /^([A-Za-z][^\t]*)\t(.+)$/.exec(raw);
    if (kv && !/^[-+0-9.]/.test(raw)) {
      const k = kv[1].trim().toLowerCase();
      if (k.startsWith('sensitivity')) {
        sens = `${kv[1].trim()} ${kv[2].trim()}`;
        justOct = true;
      } else if (k.startsWith('db-offset')) {
        offset = kv[2].trim();
        justOct = true;
      } else if (k === 'title') {
        title = kv[2].trim();
        justOct = true;
      }
      continue;
    }
    if (!/^[-+0-9.]/.test(raw)) continue; // a column header ("F [Hz] Ampl [dB] …")
    if (/\d,\d/.test(raw)) return { ok: false, reason: `${name}, line ${i + 1}: a decimal comma ("${raw}") — save the file with decimal points` };
    const tok = raw.split(/[\s;]+/).filter(Boolean).map(Number);
    if (tok.length < 2 || !tok.slice(0, 2).every(Number.isFinite)) return { ok: false, reason: `${name}, line ${i + 1}: not "frequency  dB  [phase]" ("${raw}")` };
    if (freq.length > 0 && !(tok[0] > freq[freq.length - 1])) return { ok: false, reason: `${name}, line ${i + 1}: the frequency does not increase (${tok[0]} after ${freq[freq.length - 1]})` };
    if (!(tok[0] > 0)) return { ok: false, reason: `${name}, line ${i + 1}: frequency must be > 0` };
    freq.push(tok[0]);
    db.push(tok[1]);
    if (tok.length >= 3 && Number.isFinite(tok[2])) {
      ph.push(tok[2]);
      phaseCols++;
    } else ph.push(NaN);
  }
  if (freq.length < 2) return { ok: false, reason: `${name}: fewer than two calibration points` };
  const hasPhase = phaseCols === freq.length && ph.some((p) => p !== 0);
  if (phaseCols > 0 && phaseCols < freq.length) return { ok: false, reason: `${name}: the phase column is given on some lines and not on others` };
  const notes = [sens, offset !== null ? `dB-offset ${offset}` : null].filter(Boolean) as string[];
  return {
    ok: true,
    cal: { name, title, format: justOct ? 'justoct' : 'arta-rew', freq, db, phaseDeg: hasPhase ? ph : null, sensitivityNote: notes.length ? notes.join(', ') : null },
  };
}

/** The correction at f: −response (dB), and −phase when the file gives one. Flat beyond its ends. */
export function micCorrectionAt(cal: Pick<MicCal, 'freq' | 'db' | 'phaseDeg'>, f: number): { db: number; deg: number } {
  return { db: -interpLog(cal.freq, cal.db, f), deg: cal.phaseDeg ? -interpLog(cal.freq, cal.phaseDeg, f) : 0 };
}

/**
 * Which calibration a merge carries, and the check when there are two.
 *  - The session's FRD exports imply one (derived: absolute level included) → that one; a chosen file
 *    is then a CHECK: its shape against the derived curve, normalised at 1 kHz.
 *  - PIR-only with a chosen file → the file: shape calibrated, level relative.
 *  - Neither → none, and the export refuses (merging and fitting may go on).
 */
export type CalChoice =
  | { kind: 'derived'; note: string; check: { maxDb: number; atHz: number; from: number; to: number; edge: string | null } | null }
  | { kind: 'file'; note: string; cal: MicCal }
  | { kind: 'none'; reason: string };

export function chooseCalibration(derived: { freq: number[]; db: number[]; note: string } | null, file: MicCal | null): CalChoice {
  if (derived) {
    if (!file) return { kind: 'derived', note: derived.note, check: null };
    const at1kD = interpLog(derived.freq, derived.db, 1000);
    const at1kF = interpLog(file.freq, file.db, 1000);
    let maxDb = 0;
    let atHz = 0;
    let edge: string | null = null;
    const lo = Math.max(derived.freq[0], file.freq[0]);
    const hi = Math.min(derived.freq[derived.freq.length - 1], file.freq[file.freq.length - 1]);
    for (let i = 0; i < file.freq.length; i++) {
      const f = file.freq[i];
      if (f < lo || f > hi) continue;
      const d = Math.abs(interpLog(derived.freq, derived.db, f) - at1kD + (file.db[i] - at1kF));
      // the file's first and last point: an edge the exports may have extrapolated past — reported apart
      if (i === 0 || i === file.freq.length - 1) {
        if (d > 0.05) edge = `${edge ? edge + '; ' : ''}${f} Hz (the file's ${i === 0 ? 'first' : 'last'} point): ${d.toFixed(3)} dB`;
        continue;
      }
      if (d > maxDb) {
        maxDb = d;
        atHz = f;
      }
    }
    const note =
      `${derived.note}; checked against the microphone file ${file.name}: the shapes (normalised at 1 kHz) agree within ${maxDb.toFixed(3)} dB` +
      (edge ? ` (edge: ${edge})` : '') +
      ` — the derived curve is applied (it carries the absolute level)`;
    return { kind: 'derived', note, check: { maxDb, atHz, from: lo, to: hi, edge } };
  }
  if (file) {
    const note =
      `microphone file ${file.name}${file.title ? ` (${file.title})` : ''}: its response removed in magnitude${file.phaseDeg ? ' and phase' : ' (the file gives no phase)'}; ` +
      `LEVEL RELATIVE — the impulses' own scale (${file.sensitivityNote ? `the file states ${file.sensitivityNote}; ` : ''}the soundcard's input sensitivity is not known)`;
    return { kind: 'file', note, cal: file };
  }
  return { kind: 'none', reason: 'no calibration: the session has no FRD exports to derive one from, and no microphone calibration file is chosen' };
}
