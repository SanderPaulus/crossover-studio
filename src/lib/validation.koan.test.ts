/**
 * End-to-end validation on REAL measurements — the KOAN test-filter session of
 * 15 Aug 2026 (Sander): mid + tweeter each measured bare and with a scratch
 * filter of whatever was on the bench, plus both drivers together through
 * both filters. Same mic, same rig, same clock for every sweep.
 *
 * Two things are pinned here, on purpose kept apart:
 *
 *  A. APP PIPELINE ≡ HAND CALCULATION. The production path (parseFrd, .lim →
 *     ZMA, resample, resampleImpedance, MNA solveNetwork, applyTransfer,
 *     combineN) must agree with a completely independent recomputation — own
 *     complex arithmetic straight on the file grid, no dsp helpers — to within
 *     0.1 dB / 1° at every point, including the interference dip. If a later
 *     change to resample/unwrap/combine/solver moves this, it is a bug, not a
 *     recalibration.
 *
 *  B. MODEL vs MEASUREMENT — the physics numbers as measured that day. Single
 *     branches agree to a fraction of a dB; the two-driver sum reproduces the
 *     1 kHz interference dip at the right frequency, with an OPEN ~2 dB depth
 *     residual (documented in CLAUDE.md: the 0.33 mH sat across the amplifier
 *     terminals, so the source was 1–2 Ω and "Rg = 1.2 Ω" is only an
 *     approximation of a limiting amp; a near-null magnifies any per-branch
 *     error). These bounds describe the data; they are not targets.
 *
 * Bench facts encoded below: mid filter = 1.8 mH series then 6.8 µF across
 * the mid; tweeter filter = 8.2 µF series with the 0.33 mH across the INPUT
 * (before the cap — as it was wired, not as intended); measured coil DCR was
 * not available, app estimates used (0.42 Ω / 0.14 Ω), ESR 0.02 Ω; the
 * source seen by the filters modelled as Rg = 1.2 Ω (amp + leads + clips).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseLim, limToZmaText } from './parsers/lim.ts';
import { parseZma } from './parsers/zma.ts';
import { resample, resampleImpedance, applyTransfer, combineN, type GriddedResponse } from './dsp.ts';
import { solveNetwork, type Netlist } from './network.ts';
import { compareMeasurement } from './verification.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-testfilter');
const frd = (n: string) => parseFrd(readFileSync(join(DIR, n), 'utf8'));
const lim = (n: string) => {
  const b = readFileSync(join(DIR, n));
  return parseZma(limToZmaText(parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), n));
};

const mid = frd('mid-bare.txt');
const tw = frd('tweeter-bare.txt');
const midF = frd('mid-L1.8mH-C6.8uF.txt');
const twF = frd('tweeter-C8.2uF-L0.33mH-at-input.txt');
const both = frd('mid+tweeter-both-filters.txt');
const zMid = lim('mid.lim');
const zTw = lim('tweeter.lim');

const RG = 1.2, DCR_L1 = 0.42, DCR_L2 = 0.14, ESR = 0.02;
const L1 = 1.8e-3, C1 = 6.8e-6, C2 = 8.2e-6, L2 = 0.33e-3;

/** The comparison grid = the file grid itself (all five files share it), 300 Hz–end. */
const grid = mid.freq.filter((f) => f >= 300 && f <= 19999);
const gMid = resample(mid.freq, mid.spl, mid.phase, grid);
const gTw = resample(tw.freq, tw.spl, tw.phase, grid);
const zM = resampleImpedance(zMid.freq, zMid.magnitude, zMid.phase, grid).z;
const zT = resampleImpedance(zTw.freq, zTw.magnitude, zTw.phase, grid).z;

// ---- the schematics as drawn in the app (node 0 = ground, 1 = generator) ----
const midOnly: Netlist = {
  nodeCount: 3,
  elements: [
    { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: RG },
    { kind: 'L', id: 'L1', nodes: [1, 2], value: L1, seriesR: DCR_L1 },
    { kind: 'C', id: 'C1', nodes: [2, 0], value: C1, seriesR: ESR },
    { kind: 'driver', id: 'D1', model: 'mid', nodes: [2, 0], inverted: false },
  ],
};
const tweeterOnly: Netlist = {
  nodeCount: 3,
  elements: [
    { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: RG },
    { kind: 'L', id: 'L2', nodes: [1, 0], value: L2, seriesR: DCR_L2 }, // across the INPUT
    { kind: 'C', id: 'C2', nodes: [1, 2], value: C2, seriesR: ESR },
    { kind: 'driver', id: 'D2', model: 'tweeter', nodes: [2, 0], inverted: false },
  ],
};
const combined: Netlist = {
  nodeCount: 4,
  elements: [
    { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: RG },
    { kind: 'L', id: 'L1', nodes: [1, 2], value: L1, seriesR: DCR_L1 },
    { kind: 'C', id: 'C1', nodes: [2, 0], value: C1, seriesR: ESR },
    { kind: 'driver', id: 'D1', model: 'mid', nodes: [2, 0], inverted: false },
    { kind: 'L', id: 'L2', nodes: [1, 0], value: L2, seriesR: DCR_L2 },
    { kind: 'C', id: 'C2', nodes: [1, 3], value: C2, seriesR: ESR },
    { kind: 'driver', id: 'D2', model: 'tweeter', nodes: [3, 0], inverted: false },
  ],
};

function appSum(net: Netlist): GriddedResponse & { phaseDeg: number[] } {
  const sol = solveNetwork(net, grid, { mid: zM, tweeter: zT });
  const branches: { response: GriddedResponse }[] = [];
  if (sol.transfers.D1) branches.push({ response: applyTransfer(gMid, sol.transfers.D1) });
  if (sol.transfers.D2) branches.push({ response: applyTransfer(gTw, sol.transfers.D2) });
  const s = combineN(branches);
  return { freq: grid, spl: s.combinedSpl, phaseDeg: s.combinedPhaseDeg };
}

// ---- independent recomputation: no dsp, no solver, own arithmetic on the file grid ----
type Cx = [number, number];
const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: Cx, b: Cx): Cx => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cpar = (a: Cx, b: Cx): Cx => cdiv(cmul(a, b), cadd(a, b));
const cabs = (a: Cx) => Math.hypot(a[0], a[1]);
/** Own Z interpolation: log-log magnitude, linear phase, flat clamp — written independently of dsp. */
function zAt(z: { freq: number[]; magnitude: number[]; phase: number[] }, f: number): Cx {
  const n = z.freq.length; let mag: number, ph: number;
  if (f <= z.freq[0]) { mag = z.magnitude[0]; ph = z.phase[0]; }
  else if (f >= z.freq[n - 1]) { mag = z.magnitude[n - 1]; ph = z.phase[n - 1]; }
  else {
    let k = 0; while (z.freq[k + 1] < f) k++;
    const t = (Math.log(f) - Math.log(z.freq[k])) / (Math.log(z.freq[k + 1]) - Math.log(z.freq[k]));
    mag = Math.exp(Math.log(z.magnitude[k]) * (1 - t) + Math.log(z.magnitude[k + 1]) * t);
    ph = z.phase[k] * (1 - t) + z.phase[k + 1] * t;
  }
  const r = (ph * Math.PI) / 180; return [mag * Math.cos(r), mag * Math.sin(r)];
}
const pressure = (m: { freq: number[]; spl: number[]; phase: number[] }, i: number): Cx => {
  const a = Math.pow(10, m.spl[i] / 20), r = (m.phase[i] * Math.PI) / 180; return [a * Math.cos(r), a * Math.sin(r)];
};
function handSum(withMid: boolean, withTw: boolean, coilAtInput = withTw) {
  const spl: number[] = [], ph: number[] = [];
  mid.freq.forEach((f, i) => {
    if (f < 300 || f > 19999) return;
    const w = 2 * Math.PI * f;
    const Zm = zAt(zMid, f), Zt = zAt(zTw, f);
    const zc1: Cx = [ESR, -1 / (w * C1)], zl1: Cx = [DCR_L1, w * L1], zc2: Cx = [ESR, -1 / (w * C2)], zl2: Cx = [DCR_L2, w * L2];
    const zpm = cpar(Zm, zc1), midBr = cadd(zl1, zpm), twBr = cadd(zc2, Zt);
    let load: Cx | null = null;
    const addLoad = (z: Cx) => { load = load ? cpar(load, z) : z; };
    if (withMid) addLoad(midBr);
    if (withTw) addLoad(twBr);
    if (coilAtInput) addLoad(zl2);
    const vA = cdiv(load!, cadd(load!, [RG, 0]));
    let s: Cx = [0, 0];
    if (withMid) s = cadd(s, cmul(pressure(mid, i), cmul(vA, cdiv(zpm, midBr))));
    if (withTw) s = cadd(s, cmul(pressure(tw, i), cmul(vA, cdiv(Zt, twBr))));
    spl.push(20 * Math.log10(cabs(s)));
    ph.push((Math.atan2(s[1], s[0]) * 180) / Math.PI);
  });
  return { spl, ph };
}
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const bandAvg = (delta: number[], lo: number, hi: number) => {
  const d = delta.filter((_, i) => grid[i] >= lo && grid[i] < hi && Number.isFinite(delta[i]));
  return d.reduce((a, v) => a + Math.abs(v), 0) / d.length;
};

describe('KOAN test-filter session — A. app pipeline ≡ independent hand calculation', () => {
  it.each([
    ['mid branch', midOnly, () => handSum(true, false, false)],
    ['tweeter branch (coil at input)', tweeterOnly, () => handSum(false, true, true)],
    ['both branches (interference dip included)', combined, () => handSum(true, true, true)],
  ])('%s: ≤0.1 dB and ≤1° at every grid point', (_n, net, hand) => {
    const app = appSum(net);
    const h = hand();
    expect(h.spl.length).toBe(app.spl.length);
    let maxDb = 0, maxDeg = 0;
    for (let i = 0; i < grid.length; i++) {
      maxDb = Math.max(maxDb, Math.abs(app.spl[i] - h.spl[i]));
      maxDeg = Math.max(maxDeg, Math.abs(wrap(app.phaseDeg[i] - h.ph[i])));
    }
    expect(maxDb).toBeLessThan(0.1);
    expect(maxDeg).toBeLessThan(1);
  });
});

describe('KOAN test-filter session — B. model vs measurement (as measured 15 Aug 2026)', () => {
  it('mid branch: ±0.3 dB avg, phase ≤3° over 300 Hz–20 kHz', () => {
    const s = appSum(midOnly);
    const c = compareMeasurement(grid, s.spl, s.phaseDeg, midF, [300, 20000])!;
    expect(c.avgAbsDb).toBeLessThan(0.35);
    expect(c.phase!.avgAbsDeg).toBeLessThan(3.5);
    expect(c.phase!.looksInverted).toBe(false);
  });

  it('tweeter branch as wired (coil across the input, Rg 1.2): ~±1 dB — and the drawn-as-intended schematic would be off by >5 dB', () => {
    const s = appSum(tweeterOnly);
    const c = compareMeasurement(grid, s.spl, s.phaseDeg, twF, [300, 20000])!;
    expect(c.avgAbsDb).toBeLessThan(1.4);
    expect(c.phase!.avgAbsDeg).toBeLessThan(4);
    // The lesson of the day: coil across the TWEETER (as intended) predicts a
    // 2nd-order high-pass that the bench never built.
    const intended: Netlist = {
      nodeCount: 3,
      elements: [
        { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: RG },
        { kind: 'C', id: 'C2', nodes: [1, 2], value: C2, seriesR: ESR },
        { kind: 'L', id: 'L2', nodes: [2, 0], value: L2, seriesR: DCR_L2 },
        { kind: 'driver', id: 'D2', model: 'tweeter', nodes: [2, 0], inverted: false },
      ],
    };
    const s2 = appSum(intended);
    const c2 = compareMeasurement(grid, s2.spl, s2.phaseDeg, twF, [300, 20000])!;
    expect(bandAvg(c2.deltaDb, 300, 1000)).toBeGreaterThan(5);
  });

  it('two-driver sum: dip at the measured frequency, tweeter-only and mid-only regions tight, overlap residual documented', () => {
    const s = appSum(combined);
    const c = compareMeasurement(grid, s.spl, s.phaseDeg, both, [300, 20000])!;
    // Whole band, level-aligned.
    expect(c.avgAbsDb).toBeLessThan(0.8);
    expect(c.phase!.avgAbsDeg).toBeLessThan(4);
    expect(c.phase!.looksInverted).toBe(false);
    // Where only one driver contributes the model is essentially exact.
    expect(bandAvg(c.deltaDb, 3000, 8000)).toBeLessThan(0.2);
    expect(bandAvg(c.deltaDb, 8000, 20000)).toBeLessThan(0.15);
    expect(bandAvg(c.deltaDb, 300, 600)).toBeLessThan(0.9);
    // The interference dip: same place (within 2%), depth ~2 dB shallower in the model.
    const win = grid.map((_, i) => i).filter((i) => grid[i] >= 700 && grid[i] <= 1600);
    const simMin = win.reduce((b, i) => (s.spl[i] < s.spl[b] ? i : b), win[0]);
    const measMin = win.reduce((b, i) => (c.alignedSpl[i] < c.alignedSpl[b] ? i : b), win[0]);
    expect(Math.abs(grid[simMin] / grid[measMin] - 1)).toBeLessThan(0.02);
    expect(grid[simMin]).toBeGreaterThan(900);
    expect(grid[simMin]).toBeLessThan(1050);
    const depthResidual = s.spl[simMin] - c.alignedSpl[measMin];
    expect(depthResidual).toBeGreaterThan(1);
    expect(depthResidual).toBeLessThan(3.5);
    // The open residual lives in the overlap only (800–1600 Hz), ~2.2 dB that day.
    expect(bandAvg(c.deltaDb, 800, 1600)).toBeGreaterThan(1.5);
    expect(bandAvg(c.deltaDb, 800, 1600)).toBeLessThan(3);
    // A ~10° relative-phase or ~1.5 dB level error per branch is enough to close
    // it: near a null a per-branch error is magnified (the sum sits several dB
    // below the smaller part). Sanity: the two branches really are within a few
    // dB of each other and >120° apart there.
    const sol = solveNetwork(combined, grid, { mid: zM, tweeter: zT });
    const bm = applyTransfer(gMid, sol.transfers.D1), bt = applyTransfer(gTw, sol.transfers.D2);
    expect(Math.abs(bm.spl[simMin] - bt.spl[simMin])).toBeLessThan(4);
    expect(Math.abs(wrap(bt.phaseDeg[simMin] - bm.phaseDeg[simMin]))).toBeGreaterThan(120);
    // Sum sits well below both parts at the dip (the magnifier, ~3.8 dB here).
    expect(Math.min(bm.spl[simMin], bt.spl[simMin]) - s.spl[simMin]).toBeGreaterThan(3);
  });
});
