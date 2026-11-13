/**
 * I-4 fase 2 — the merge set test-fixtures/koan_2026-11_merge_v2/ from the August PIRs
 * (one session, dual-channel, one time base), with nf-merge/2.x.
 *
 *   npx vite-node scripts/merge-koan-2026-11-v2.ts
 *
 * Basis: the SHORT gate of section D (reference = arrival − 0.4 ms, left 2.5, right 2.521 ms,
 * Tukey 0.25), re-expressed on ONE common reference so the three ways share a phase zero —
 * the same samples, the same window, only the reference it is written against moves.
 * Comparison (vergelijking.json): the LONG gate the FRD exports used, with the floor stated
 * where its geometry is known, and the old merges of the casus-1 sets between 300 and 600 Hz.
 *
 * Nothing measured is typed here. Read or derived:
 *  - the common reference: where every far-field FRD's phase zero sits on its PIR (V56),
 *    by cross-correlation — the three must agree;
 *  - the calibration: |FRD| ÷ |FFT(gate × PIR)| of the session's own near-field exports (the
 *    microphone file ARTA applied, zero phase); the three must agree;
 *  - the test box f_b: the saddle of the August parallel impedance;
 *  - volumes, port weight: the M-2 fixture (stated by Sander 12-09-2026);
 *  - Valid from: the stated floor of the M-1 / M-3 merges, read from their blocks.
 * The floor geometry (Sander, 13-11-2026) is the one stated set-up number in this file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fftInPlace } from '../src/lib/fft.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseLim } from '../src/lib/parsers/lim.ts';
import { parsePir } from '../src/lib/parsers/pir.ts';
import { readMergeBlock } from '../src/lib/xoWindow.ts';
import {
  arrivalMs,
  impulseFromFrd,
  impulseFromPir,
  mergeImpulsesV2,
  type Gate,
  type Impulse,
  type MergeV2Input,
  type MergeV2Result,
  type PlaneEcho,
} from '../src/lib/nfMergeV2.ts';
import { renderMergedFrdV2 } from '../src/lib/nfMergeV2Block.ts';
import { impedanceSaddleHz, loadValidity, logGrid, LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG } from '../src/lib/measuredObject.ts';
import { casus1M2ModelRatio, koanPortWeight, REAL_VOLUME_L, TEST_VOLUME_L } from '../src/lib/engine2/koan2026_09.fixture.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TF = join(ROOT, 'test-fixtures');
const OUT = join(TF, 'koan_2026-11_merge_v2');
const SESSION = 'augustus';
const MADE_ON = '2026-11-13';

/** Section D's gate, relative to each far field's arrival (the acceptance numbers, startprompt I-4). */
const D_GATE = { beforeArrivalMs: 0.4, leftMs: 2.5, rightMs: 2.521, taper: 0.25 } as const;
/** Section D's expected numbers with port 0.205 on the woofers (tools/nf_merge_reference.py). */
const SECTION_D = { woofer_down: [2.173, 0.2334], woofer_up: [2.332, 0.5968], mid: [3.508, 0.5616] } as const;
/** The floor, stated by Sander on 13-11-2026 for the August rig. */
const FLOOR = { micAboveM: 1.38, horizontalM: 1.0, sourceAboveM: { woofer_down: 0.794, woofer_up: 1.07 } } as const;
const SD_WOOFER_CM2 = 255; // datasheet, as in the M-2 fixture (SD_CM2)

const WAYS = [
  { name: 'woofer_down', label: 'woofer down', f0: 150, fit: [300, 576], splice: [400, 550], port: true, old: 'casus1/Koan_W_down_merged_ingespeeld_mild.frd' },
  { name: 'woofer_up', label: 'woofer up', f0: 150, fit: [300, 576], splice: [400, 550], port: true, old: 'casus1/Koan_W_up_merged_ingespeeld_mild.frd' },
  { name: 'mid', label: 'mid', f0: 200, fit: [300, 800], splice: [400, 774], port: false, old: 'casus1/mid_hor_0_merged.frd' },
] as const;
type Way = (typeof WAYS)[number];

const pir = (n: string): Impulse => impulseFromPir(n, parsePir(readFileSync(join(TF, 'casus1_pir', `${n}.pir`))), SESSION);
const text = (p: string): string => readFileSync(join(TF, p), 'latin1');

function rfftMag(x: Float64Array, n: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x.subarray(0, Math.min(n, x.length)));
  fftInPlace(re, im);
  return { re, im };
}

/** Where a far-field FRD's phase zero sits on the raw PIR, ms: peak of the cross-correlation. */
function frdZeroOnPirMs(w: Way): number {
  const f = parseFrd(text(`casus1/${w.name}_hor_0.txt`));
  const imp = impulseFromFrd({ name: w.name, freq: f.freq, splDb: f.spl, phaseDeg: f.phase, sampleRate: 48000, length: 65536, alreadyGated: true });
  const n = imp.samples.length;
  const raw = pir(`${w.name}_hor_0`).samples;
  const A = rfftMag(raw, n);
  const B = rfftMag(imp.samples, n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    re[k] = A.re[k] * B.re[k] + A.im[k] * B.im[k];
    im[k] = A.im[k] * B.re[k] - A.re[k] * B.im[k];
  }
  // inverse via forward FFT of the conjugate
  for (let k = 0; k < n; k++) im[k] = -im[k];
  fftInPlace(re, im);
  let best = 0;
  for (let i = 1; i < n; i++) if (re[i] > re[best]) best = i;
  return (best / 48000) * 1000;
}

/** |FRD| ÷ |FFT(gate × PIR)| on the near-field file's own bins, dB — the calibration ARTA applied. */
function calibrationDb(w: Way): { freq: number[]; db: number[] } {
  const raw = text(`casus1/${w.name}_near.txt`);
  const head = (name: string): number => Number(new RegExp(`^\\*\\s*${name}\\s*=\\s*([0-9]+(?:[.,][0-9]+)?)`, 'm').exec(raw)![1].replace(',', '.'));
  const tuk = Number(/^\*\s*Right window\s*=.*Tukey\s*([0-9.]+)/m.exec(raw)![1]);
  const f = parseFrd(raw);
  const fs = 48000;
  const n = Math.round(fs / ((f.freq[f.freq.length - 1] - f.freq[0]) / (f.freq.length - 1)));
  const x = pir(`${w.name}_near`).samples;
  const ref = head('Reference time');
  const left = head('Left window');
  const right = head('Right window'); // V60: lengths from the reference
  const sig = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) {
    const t = (i / fs) * 1000 - ref;
    if (t < -left || t > right) continue;
    const ts = right * (1 - tuk);
    sig[i] = x[i] * (t <= ts ? 1 : 0.5 * (1 + Math.cos((Math.PI * (t - ts)) / (right - ts))));
  }
  const X = rfftMag(sig, n);
  const out = { freq: [] as number[], db: [] as number[] };
  for (let i = 0; i < f.freq.length; i++) {
    const k = Math.round(f.freq[i] / (fs / n));
    const mag = Math.hypot(X.re[k], X.im[k]);
    if (!(mag > 0)) continue;
    out.freq.push(f.freq[i]);
    out.db.push(f.spl[i] - 20 * Math.log10(mag));
  }
  return out;
}

const interpLog = (fx: readonly number[], fy: readonly number[], f: number): number => {
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
};

/** Section D's gate for this way, written against the common reference. Same samples. */
function dGateOnCommonRef(far: Impulse, refMs: number): Gate {
  const start = arrivalMs(far) - D_GATE.beforeArrivalMs - D_GATE.leftMs;
  const end = arrivalMs(far) - D_GATE.beforeArrivalMs + D_GATE.rightMs;
  const right = end - refMs;
  return { referenceMs: refMs, leftMs: refMs - start, rightMs: right, rightTaper: (D_GATE.rightMs * D_GATE.taper) / right };
}

function runWay(w: Way, gate: Gate, echoes: PlaneEcho[], withPort: boolean): { input: MergeV2Input; result: MergeV2Result } {
  const input: MergeV2Input = {
    far: pir(`${w.name}_hor_0`),
    near: pir(`${w.name}_near`),
    ...(withPort ? { port: { impulse: pir('poort_near'), weight: koanPortWeight().weight, echoes: [] } } : {}),
    gate,
    model: { kind: 'an4', f0Hz: w.f0 },
    echoes,
    sdCm2: w.name === 'mid' ? null : SD_WOOFER_CM2,
    fitBandHz: [w.fit[0], w.fit[1]],
    spliceBandHz: [w.splice[0], w.splice[1]],
    output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 },
  };
  return { input, result: mergeImpulsesV2(input) };
}

function band(res: { freq: number[]; spl: number[]; phaseDeg: number[] }, other: { freq: number[]; spl: number[]; phase: number[] }, lo: number, hi: number) {
  const dDb: number[] = [];
  const dDeg: number[] = [];
  for (let i = 0; i < res.freq.length; i++) {
    const f = res.freq[i];
    if (f < lo || f > hi) continue;
    dDb.push(res.spl[i] - interpLog(other.freq, other.spl, f));
    let d = res.phaseDeg[i] - interpLog(other.freq, other.phase, f);
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    dDeg.push(d);
  }
  const rms = (a: number[]) => Math.sqrt(a.reduce((p, q) => p + q * q, 0) / a.length);
  const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
  const maxAbs = (a: number[]) => Math.max(...a.map(Math.abs));
  return { points: dDb.length, meanDb: mean(dDb), maxAbsDb: maxAbs(dDb), meanDeg: mean(dDeg), rmsDeg: rms(dDeg), maxAbsDeg: maxAbs(dDeg) };
}

function unwrapDeg(p: readonly number[]): number[] {
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) {
    let d = p[i] - p[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    out.push(out[i - 1] + d);
  }
  return out;
}

/* ------------------------------------------------------------------ */

const zeros = WAYS.map(frdZeroOnPirMs);
if (Math.max(...zeros) - Math.min(...zeros) > 1.5 / 48) throw new Error(`the FRD phase zeros disagree: ${zeros.join(', ')} ms`);
const REF_MS = zeros[0];
const cals = WAYS.map(calibrationDb);
let calSpread = 0;
for (let i = 0; i < cals[0].db.length; i++) calSpread = Math.max(calSpread, ...cals.map((c) => Math.abs(c.db[i] - cals[0].db[i])));
if (calSpread > 0.01) throw new Error(`the calibration curves of the three near-field exports disagree by ${calSpread} dB`);
const CAL = cals[0];
const limB = readFileSync(join(TF, 'casus1', 'woofers_parallel__1_.lim'));
const lim = parseLim(limB.buffer.slice(limB.byteOffset, limB.byteOffset + limB.byteLength) as ArrayBuffer);
const fbTest = impedanceSaddleHz(lim.freq, lim.magnitude);
if (fbTest === null) throw new Error('woofers_parallel__1_.lim: no saddle between two impedance peaks');
const m2 = casus1M2ModelRatio();
const wooferValidity = loadValidity({
  ratio: { fn: m2.ratio, model: m2.model },
  grid: logGrid(12, 2000, 48),
  target: { netVolumeL: REAL_VOLUME_L, load: { kind: 'vented', port: { kind: 'same-as-other' } } },
  setup: {
    session: SESSION,
    object: {
      kind: 'other',
      label: 'testkast',
      baffle: 'identical',
      box: { netVolumeL: TEST_VOLUME_L, load: { kind: 'vented', port: { kind: 'measured', fbHz: fbTest, source: 'woofers_parallel__1_.lim, saddle' } } },
    },
  },
});

mkdirSync(OUT, { recursive: true });
const comparison: Record<string, unknown> = {
  _: 'I-4 fase 2 (13-11-2026). Basis: the short gate of section D. Long gate = the gate the FRD exports used (V60), with the floor stated where its geometry is known. Old = the merges of the casus-1 sets.',
  common_reference_ms_on_pir: REF_MS,
  calibration: { source: 'near-field FRD exports ÷ gated PIR, three files agree within (dB)', spread_db: calSpread },
  load_validity: {
    tol_db: LOAD_RATIO_TOL_DB,
    tol_deg: LOAD_RATIO_TOL_DEG,
    model: wooferValidity.model,
    test_box_fb_hz: fbTest,
    woofer_target_valid_from_hz: wooferValidity.fromHz,
    worst_below: wooferValidity.limit?.worstBelow ?? null,
    low_end_in_this_set: 'marked as measured object (not converted)',
    note: wooferValidity.note,
  },
  ways: {} as Record<string, unknown>,
};

for (const w of WAYS) {
  const far = pir(`${w.name}_hor_0`);
  const short = runWay(w, dGateOnCommonRef(far, REF_MS), [], w.port);
  const [dDeg, dDb] = SECTION_D[w.name];
  if (Math.abs(short.result.fit.residualRmsDeg - dDeg) > 0.2 || Math.abs(short.result.fit.residualRmsDb - dDb) > 0.02 || short.result.flags.length) {
    throw new Error(`${w.name}: the short gate on the common reference does not reproduce section D (${short.result.fit.residualRmsDeg}° / ${short.result.fit.residualRmsDb} dB, ${short.result.flags.length} flags)`);
  }
  // calibrate the output: magnitude only, zero phase (what ARTA applied)
  const calibrated = { ...short.result, spl: short.result.freq.map((f, i) => short.result.spl[i] + interpLog(CAL.freq, CAL.db, f)) };

  const oldBlock = readMergeBlock(text(w.old));
  if (!oldBlock?.validFromHz) throw new Error(`${w.old}: no stated Valid from`);
  const isWoofer = w.name !== 'mid';
  const file = renderMergedFrdV2({
    branchLabel: w.label,
    input: short.input,
    result: calibrated,
    nearName: `${w.name}_near.pir`,
    farName: `${w.name}_hor_0.pir`,
    portName: w.port ? 'poort_near.pir' : null,
    validFromHz: oldBlock.validFromHz,
    validFromReason: `STATED, the floor of ${w.old.split('/')[1]} (same near field${w.port ? ' and port' : ''}, same session); its own reason text is not carried over because it cites the misread far-field gate (V60)`,
    referenceNote: `${REF_MS.toFixed(4)} ms on the August session time base = the phase zero of the session's own FRD exports (V56)`,
    madeOn: MADE_ON,
    measuredObjectNote: `testkast ${TEST_VOLUME_L} L, baffle identical to the target (${REAL_VOLUME_L} L); woofers vented, the mid in its own sealed pod`,
    targetValidFromHz: isWoofer ? wooferValidity.fromHz : null,
    targetValidityNote: isWoofer ? `${wooferValidity.note} This file: MARKED below the limit, not converted.` : 'the mid sits in its own sealed pod, the same in the test box and the target: no load limit',
    portWeightNote: w.port
      ? 'PROVISIONAL: Keele weight from the mouth diameter 74 mm back-computed from g 0.41, shared by 2 woofers; Helmholtz says ~110 cm² at the waist (V58) — the final value comes with the mouth measurements'
      : null,
    calibrationNote: `magnitude from the session's near-field FRD exports (microphone file named in them, zero phase), the three agree within ${calSpread.toFixed(4)} dB`,
  });
  writeFileSync(join(OUT, `${w.name}_merged_v2.frd`), file);

  // comparison: the long gate, floor stated where known (no port: its geometry is not stated yet)
  const longGate: Gate = { referenceMs: REF_MS, leftMs: 0, rightMs: 5.021, rightTaper: 0.25 };
  const floor: PlaneEcho[] = isWoofer
    ? [{ kind: 'plane', label: 'vloer', sourceAboveM: FLOOR.sourceAboveM[w.name as 'woofer_down' | 'woofer_up'], micAboveM: FLOOR.micAboveM, horizontalM: FLOOR.horizontalM }]
    : [];
  const shortNoPort = runWay(w, dGateOnCommonRef(far, REF_MS), [], false);
  const longBare = runWay(w, longGate, [], false);
  const longFloor = isWoofer ? runWay(w, longGate, floor, false) : null;
  const oldF = parseFrd(text(w.old));
  const oldU = { freq: oldF.freq, spl: oldF.spl, phase: unwrapDeg(oldF.phase) };
  const newU = { ...calibrated, phaseDeg: unwrapDeg(calibrated.phaseDeg) };
  const fitOf = (r: MergeV2Result) => ({ delay_ms: r.fit.delayMs, residual_deg: r.fit.residualRmsDeg, residual_db: r.fit.residualRmsDb, flags: r.flags });
  (comparison.ways as Record<string, unknown>)[w.name] = {
    short_gate: { gate: short.input.gate, with_port: w.port, ...fitOf(short.result) },
    short_gate_no_port: fitOf(shortNoPort.result),
    long_gate: { gate: longGate, no_port: true, ...fitOf(longBare.result) },
    long_gate_floor: longFloor ? { floor: floor[0], ...fitOf(longFloor.result) } : 'no floor geometry stated for this way',
    long_vs_short_300_600: band(longFloor?.result ?? longBare.result, { freq: shortNoPort.result.freq, spl: shortNoPort.result.spl, phase: shortNoPort.result.phaseDeg }, 300, 600),
    new_vs_old_300_600: { old: w.old, ...band(newU, oldU, 300, 600) },
  };
  console.log(`${w.name}: short ${short.result.fit.residualRmsDeg.toFixed(2)}° / ${short.result.fit.residualRmsDb.toFixed(3)} dB; ` +
    `long ${longBare.result.fit.residualRmsDeg.toFixed(2)}°${longFloor ? `, long+floor ${longFloor.result.fit.residualRmsDeg.toFixed(2)}°` : ''}`);
}
writeFileSync(join(OUT, 'vergelijking.json'), JSON.stringify(comparison, null, 1) + '\n');
console.log(JSON.stringify(comparison, null, 1));
