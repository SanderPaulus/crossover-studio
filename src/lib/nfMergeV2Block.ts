/**
 * The `nf-merge/2.x` header block, and the merged FRD that carries it (I-4 fase 2).
 *
 * ONE rule for the field names: every field that v1's block also has keeps v1's NAME and v1's
 * sub-field names — `Merge = NF/FF`, `Valid from`, `Valid to`, `Merge NF source`,
 * `Merge FF source`, `Merge splice band`, `Merge splice fit` (gain, delay, phase residual) — so
 * the two readers that exist (v1 `readMergeBlock` in `xoWindow.ts`, engine2 `parseArtaHeader`)
 * read a v2 file without a change, and a test pins that they do. Everything v2 adds gets a new
 * `Merge …` name, which those readers ignore.
 *
 * ONE field is left out on purpose: `Merge FF window`. engine2 turns it into an effective window
 * as `right − reference`, which is V60's misreading; v2 writes the gate it actually used as
 * `Merge gate`, with the lengths spelled out, and leaves that field for the V60 session.
 *
 * No prose line in the block may contain the words a gate detector looks for (P-1): v1's own
 * "(gated far field)" line made `readGateHeader` answer `unparseable`. The guard is a test.
 */
import {
  NF_MERGE_V2_VERSION,
  type EchoTerm,
  type Gate,
  type MergeV2Input,
  type MergeV2Result,
  type NearToFarModel,
} from './nfMergeV2.ts';

/** Decimals written per quantity — what the round-trip promises, and no more. */
const DECIMALS = { gainDb: 4, delayMs: 6, deg: 3, db: 4, hz: 2, ms: 4, taper: 4, m: 3, weight: 4 } as const;

export interface MergeV2FileInput {
  /** Which branch this is, as the reader should see it ("woofer down"). */
  branchLabel: string;
  input: MergeV2Input;
  result: MergeV2Result;
  nearName: string;
  farName: string;
  portName?: string | null;
  /** STATED, not derived (P4): where this merge is valid from, and why. */
  validFromHz: number;
  validFromReason: string;
  /** Where the gate reference sits, said in words: "8.750 ms on the August session time base". */
  referenceNote: string;
  madeOn: string;
  /** The session's measured object, in words (measuredObject.ts): what was measured, which baffle. */
  measuredObjectNote?: string | null;
  /** From where the measurement stands for the TARGET cabinet (loadValidity); null = same load, no limit. */
  targetValidFromHz?: number | null;
  targetValidityNote?: string | null;
  /** How the level was calibrated, in words; absent = the impulses' own scale. */
  calibrationNote?: string | null;
}

export interface ParsedMergeV2 {
  version: string;
  kind: string;
  validFromHz: number | null;
  validToHz: number | null;
  nfSource: string | null;
  ffSource: string | null;
  portSource: string | null;
  sessions: { near: string | null; far: string | null; port: string | null };
  gate: Gate | null;
  model: NearToFarModel | { kind: 'transfer'; name: string } | null;
  portWeight: number | null;
  coneEchoes: EchoTerm[];
  portEchoes: EchoTerm[] | null;
  fitBandHz: [number, number] | null;
  spliceBandHz: [number, number] | null;
  gainDb: number | null;
  delayMs: number | null;
  polarityDeg: 0 | 180 | null;
  residualDeg: number | null;
  residualDb: number | null;
  flags: string[];
  phaseConvention: string | null;
  floorReason: string | null;
  measuredObject: string | null;
  targetValidFromHz: number | null;
  targetValidity: string | null;
  calibration: string | null;
}

/** A block field is ONE line, and an `=` inside a value would be read as the next field's name. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').replace(/=/g, ':').trim();
const fx = (v: number, d: number): string => v.toFixed(d);
const FLAG_SEP = ' | ';

function modelText(m: NearToFarModel): string {
  switch (m.kind) {
    case 'none':
      return 'none';
    case 'an4':
      return `an4 f0 ${fx(m.f0Hz, DECIMALS.hz)} Hz`;
    case 'shelf':
      return `shelf ${fx(m.depthDb, DECIMALS.db)} dB @ ${fx(m.hz, DECIMALS.hz)} Hz`;
    case 'transfer':
      return `transfer "${oneLine(m.name)}"`;
  }
}

function echoesText(list: readonly EchoTerm[]): string {
  if (list.length === 0) return 'none';
  return list
    .map((e) =>
      e.kind === 'boundary'
        ? `boundary "${oneLine(e.label)}" source ${fx(e.sourceAboveM, DECIMALS.m)} m`
        : `plane "${oneLine(e.label)}" source ${fx(e.sourceAboveM, DECIMALS.m)} m, mic ${fx(e.micAboveM, DECIMALS.m)} m, horizontal ${fx(e.horizontalM, DECIMALS.m)} m`,
    )
    .join(FLAG_SEP);
}

export function renderMergeBlockV2(x: MergeV2FileInput): string[] {
  const { input: inp, result: r } = x;
  const g = inp.gate;
  const sess = (s: string | null | undefined): string => (s ? `"${oneLine(s)}"` : 'not stated');
  return [
    `* ${oneLine(x.branchLabel)} — NF/FF merge made by Crossover Studio (${r.version})`,
    `* basis: ${oneLine(x.nearName)} (near field)${x.portName ? ` + ${oneLine(x.portName)} (port)` : ''} + ${oneLine(x.farName)} (far field)`,
    `* status: MODEL-validated — below the splice this is a near field plus a near-to-far MODEL, not a measurement at distance`,
    `* Merge = NF/FF`,
    `* Valid from = ${fx(x.validFromHz, DECIMALS.hz)} Hz`,
    `* Valid to = ${fx(r.freq[r.freq.length - 1], DECIMALS.hz)} Hz`,
    `* Merge version = ${r.version}`,
    `* Merge NF source = ${oneLine(x.nearName)}`,
    `* Merge FF source = ${oneLine(x.farName)}`,
    `* Merge port source = ${x.portName ? oneLine(x.portName) : 'none'}`,
    `* Merge session = near ${sess(inp.near.session)}, far ${sess(inp.far.session)}, port ${inp.port ? sess(inp.port.impulse.session) : 'none'}`,
    `* Merge gate = reference ${fx(g.referenceMs, DECIMALS.ms)} ms, left ${fx(g.leftMs, DECIMALS.ms)} ms, right ${fx(g.rightMs, DECIMALS.ms)} ms, ` +
      `Tukey ${fx(g.rightTaper, DECIMALS.taper)} (left and right are lengths from the reference)`,
    `* Merge model = ${modelText(inp.model)}`,
    `* Merge port weight = ${inp.port ? fx(inp.port.weight, DECIMALS.weight) : 'none'}`,
    `* Merge cone echoes = ${echoesText(inp.echoes)}`,
    `* Merge port echoes = ${inp.port ? echoesText(inp.port.echoes ?? []) : 'none'}`,
    `* Merge fit band = ${fx(inp.fitBandHz[0], DECIMALS.hz)}-${fx(inp.fitBandHz[1], DECIMALS.hz)} Hz`,
    `* Merge splice band = ${fx(inp.spliceBandHz[0], DECIMALS.hz)}-${fx(inp.spliceBandHz[1], DECIMALS.hz)} Hz`,
    `* Merge splice fit = gain ${fx(r.fit.gainDb, DECIMALS.gainDb)} dB, delay ${fx(r.fit.delayMs, DECIMALS.delayMs)} ms, ` +
      `offset 0.0 deg (fixed), polarity ${r.fit.polarityDeg} deg, phase residual ${fx(r.fit.residualRmsDeg, DECIMALS.deg)} deg rms, ` +
      `level residual ${fx(r.fit.residualRmsDb, DECIMALS.db)} dB rms`,
    `* Merge flags = ${r.flags.length === 0 ? 'none' : r.flags.map(oneLine).join(FLAG_SEP)}`,
    `* Merge phase convention = as measured: phase relative to the gate reference (${oneLine(x.referenceNote)})`,
    `* Merge measured object = ${x.measuredObjectNote ? oneLine(x.measuredObjectNote) : 'not stated'}`,
    `* Merge target valid from = ${x.targetValidFromHz != null ? `${fx(x.targetValidFromHz, DECIMALS.hz)} Hz` : 'none'}`,
    `* Merge target validity = ${x.targetValidityNote ? oneLine(x.targetValidityNote) : 'not stated'}`,
    `* Merge calibration = ${x.calibrationNote ? oneLine(x.calibrationNote) : "none (the impulses' own scale)"}`,
    `* Merge floor reason = ${oneLine(x.validFromReason)}`,
    `* Merge status = MODEL-validated merge made by Crossover Studio on ${oneLine(x.madeOn)}`,
  ];
}

/** The merged FRD: the block, a column header, then `freq spl phase` — the layout both parsers read. */
export function renderMergedFrdV2(x: MergeV2FileInput): string {
  const r = x.result;
  const f = (v: number, d: number, w: number): string => v.toFixed(d).padStart(w);
  const rows = r.freq.map((fq, i) => `${f(fq, 4, 12)}${f(r.spl[i], 3, 10)}${f(r.phaseDeg[i], 3, 10)}`);
  return [...renderMergeBlockV2(x), 'Freq[Hz]  dBSPL  Phase[Deg]', ...rows].join('\n') + '\n';
}

/* ------------------------------------------------------------------ *
 * Parse — field names, never prose (UI-1)
 * ------------------------------------------------------------------ */

const NUM = '(-?\\d+(?:[.,]\\d+)?)';
const n = (s: string): number => Number(s.replace(',', '.'));
const named = (value: string, name: string): number | null => {
  const m = new RegExp(`${name}\\s*${NUM}`, 'i').exec(value);
  return m ? n(m[1]) : null;
};
const quoted = (value: string, name: string): string | null => {
  const m = new RegExp(`${name}\\s*"([^"]*)"`, 'i').exec(value);
  return m ? m[1] : null;
};
const band = (value: string): [number, number] | null => {
  const ns = value.match(/\d+(?:[.,]\d+)?/g)?.map(n) ?? [];
  return ns.length >= 2 && ns[0] > 0 && ns[1] > ns[0] ? [ns[0], ns[1]] : null;
};

function parseEchoes(value: string): EchoTerm[] {
  if (/^none$/i.test(value.trim())) return [];
  return value.split(FLAG_SEP).map((part): EchoTerm => {
    const label = /"([^"]*)"/.exec(part)?.[1] ?? '';
    if (/^\s*boundary/i.test(part)) return { kind: 'boundary', label, sourceAboveM: named(part, 'source') ?? NaN };
    return {
      kind: 'plane',
      label,
      sourceAboveM: named(part, 'source') ?? NaN,
      micAboveM: named(part, 'mic') ?? NaN,
      horizontalM: named(part, 'horizontal') ?? NaN,
    };
  });
}

function parseModel(value: string): ParsedMergeV2['model'] {
  const v = value.trim();
  if (/^none$/i.test(v)) return { kind: 'none' };
  if (/^an4/i.test(v)) return { kind: 'an4', f0Hz: named(v, 'f0') ?? NaN };
  if (/^shelf/i.test(v)) {
    const m = new RegExp(`shelf\\s*${NUM}\\s*dB\\s*@\\s*${NUM}`, 'i').exec(v);
    return m ? { kind: 'shelf', depthDb: n(m[1]), hz: n(m[2]) } : null;
  }
  if (/^transfer/i.test(v)) return { kind: 'transfer', name: quoted(v, 'transfer') ?? '' };
  return null;
}

/** Reads a v2 block. Returns null on a file that is not an `nf-merge/2.x` merge. */
export function parseMergeBlockV2(text: string): ParsedMergeV2 | null {
  const field = /^\s*[*;#]*\s*([A-Za-z][A-Za-z .]*?)\s*=\s*(.+?)\s*$/;
  const out: ParsedMergeV2 = {
    version: '',
    kind: '',
    validFromHz: null,
    validToHz: null,
    nfSource: null,
    ffSource: null,
    portSource: null,
    sessions: { near: null, far: null, port: null },
    gate: null,
    model: null,
    portWeight: null,
    coneEchoes: [],
    portEchoes: null,
    fitBandHz: null,
    spliceBandHz: null,
    gainDb: null,
    delayMs: null,
    polarityDeg: null,
    residualDeg: null,
    residualDb: null,
    flags: [],
    phaseConvention: null,
    floorReason: null,
    measuredObject: null,
    targetValidFromHz: null,
    targetValidity: null,
    calibration: null,
  };
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*[*;#]/.test(line)) break; // the block is the comment head
    const m = line.match(field);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const v = m[2].trim();
    switch (key) {
      case 'merge': out.kind = v; break;
      case 'merge version': out.version = v; break;
      case 'valid from': out.validFromHz = named(v, ''); break;
      case 'valid to': out.validToHz = named(v, ''); break;
      case 'merge nf source': out.nfSource = v; break;
      case 'merge ff source': out.ffSource = v; break;
      case 'merge port source': out.portSource = /^none$/i.test(v) ? null : v; break;
      case 'merge session':
        out.sessions = { near: quoted(v, 'near'), far: quoted(v, 'far'), port: quoted(v, 'port') };
        break;
      case 'merge gate': {
        const ref = named(v, 'reference');
        const left = named(v, 'left');
        const right = named(v, 'right');
        const tukey = named(v, 'Tukey');
        out.gate = ref !== null && left !== null && right !== null && tukey !== null ? { referenceMs: ref, leftMs: left, rightMs: right, rightTaper: tukey } : null;
        break;
      }
      case 'merge model': out.model = parseModel(v); break;
      case 'merge port weight': out.portWeight = /^none$/i.test(v) ? null : named(v, ''); break;
      case 'merge cone echoes': out.coneEchoes = parseEchoes(v); break;
      case 'merge port echoes': out.portEchoes = out.portSource === null && /^none$/i.test(v) ? null : parseEchoes(v); break;
      case 'merge fit band': out.fitBandHz = band(v); break;
      case 'merge splice band': out.spliceBandHz = band(v); break;
      case 'merge splice fit': {
        out.gainDb = named(v, 'gain');
        out.delayMs = named(v, 'delay');
        const pol = named(v, 'polarity');
        out.polarityDeg = pol === 0 || pol === 180 ? pol : null;
        out.residualDeg = named(v, 'phase residual');
        out.residualDb = named(v, 'level residual');
        break;
      }
      case 'merge flags': out.flags = /^none$/i.test(v) ? [] : v.split(FLAG_SEP); break;
      case 'merge phase convention': out.phaseConvention = v; break;
      case 'merge floor reason': out.floorReason = v; break;
      case 'merge measured object': out.measuredObject = /^not stated$/i.test(v) ? null : v; break;
      case 'merge target valid from': out.targetValidFromHz = /^none$/i.test(v) ? null : named(v, ''); break;
      case 'merge target validity': out.targetValidity = /^not stated$/i.test(v) ? null : v; break;
      case 'merge calibration': out.calibration = /^none\b/i.test(v) ? null : v; break;
    }
  }
  return out.kind && /^nf-merge\/2\./.test(out.version) ? out : null;
}

export { NF_MERGE_V2_VERSION, DECIMALS as MERGE_V2_BLOCK_DECIMALS };
