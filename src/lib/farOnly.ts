/**
 * I-4 far-only — a way the session measured far-field only (the tweeter, typically), handed to the
 * project THROUGH THE MERGE TOOL: the same gate it was exported with, the same session reference,
 * the same calibration as the merges beside it. Measured 14-11-2026 on casus 1: the tool's merges
 * (PIR + .mic) landed in a project whose tweeter came from an ARTA export, ~130 dB above them — the
 * route worked and the sum read as "not taken over". The cure is one scale for every way, and that
 * scale is the session's. This file writes no merge block: `Merge = NF/FF` would claim a splice that
 * never happened (P-1); the gate header the measuring program writes is what both readers expect.
 */
import type { Gate } from './nfMergeV2.ts';

export const FAR_ONLY_VERSION = 'far-only/1.0';

export interface FarOnlyFileInput {
  label: string;
  farName: string;
  gate: Gate;
  route: 'pir' | 'frd';
  spec: { freq: number[]; spl: number[]; phaseDeg: number[] };
  validFromHz: number;
  validFromReason: string;
  /** The calibration applied, in words; null = none (the file is then refused by "Use in project"). */
  calibrationNote: string | null;
  madeOn: string;
  session: string;
  timeBaseShared: boolean;
}

const oneLine = (s: string) => s.replace(/\s*\r?\n\s*/g, ' ').trim();

export function renderFarOnlyFrd(x: FarOnlyFileInput): string {
  const f = (v: number, d: number, w: number): string => v.toFixed(d).padStart(w);
  const g = x.gate;
  const head = [
    `* ${oneLine(x.label)} — far field, gated, by Crossover Studio (${FAR_ONLY_VERSION})`,
    `* basis: ${x.farName} (far field only: this session has no near field for it, nothing is merged)`,
    `* Reference time = ${g.referenceMs.toFixed(4)} ms`,
    `* Left window = ${g.leftMs.toFixed(4)} ms`,
    `* Right window = ${g.rightMs.toFixed(4)} ms, Tukey ${g.rightTaper}`,
    `* Far-only window = ${x.route === 'frd' ? "the FRD export's own (already gated)" : 'the FRD header, applied to the impulse by the tool'}; 1/T = ${(1000 / g.rightMs).toFixed(1)} Hz`,
    `* Far-only reference = ${g.referenceMs.toFixed(4)} ms on the ${x.timeBaseShared ? 'session' : 'file'} time base, shared with the merges of this session`,
    `* Valid from = ${x.validFromHz.toFixed(2)} Hz (${oneLine(x.validFromReason)})`,
    `* Merge calibration = ${x.calibrationNote ? oneLine(x.calibrationNote) : "none (the impulses' own scale)"}`,
    `* Far-only status = gated far field made by Crossover Studio on ${oneLine(x.madeOn)}, session ${oneLine(x.session)}`,
  ];
  const rows = x.spec.freq.map((fq, i) => `${f(fq, 4, 12)}${f(x.spec.spl[i], 3, 10)}${f(x.spec.phaseDeg[i], 3, 10)}`);
  return [...head, 'Freq[Hz]  dBSPL  Phase[Deg]', ...rows].join('\n') + '\n';
}

/** Read back what this module wrote (field names, never prose). */
export function parseFarOnlyBlock(text: string): { version: string; validFromHz: number | null; oneOverTHz: number | null } | null {
  const v = /^\s*\*\s*.*by Crossover Studio \((far-only\/[0-9.]+)\)\s*$/m.exec(text);
  if (!v) return null;
  const vf = /^\s*\*\s*Valid from\s*=\s*([0-9.]+)/m.exec(text);
  const t = /^\s*\*\s*Far-only window\s*=.*1\/T\s*=\s*([0-9.]+)/m.exec(text);
  return { version: v[1], validFromHz: vf ? Number(vf[1]) : null, oneOverTHz: t ? Number(t[1]) : null };
}
