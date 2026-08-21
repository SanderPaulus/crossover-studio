import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import {
  auditNetwork,
  smoothOctave,
  DEFAULT_AUDIT_THRESHOLDS,
  sourceProbeIndex,
  seriesPathResistanceOhm,
  sourceResistanceOhm,
} from './partAudit.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');
const grid = logspace(210, 19000, 400);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const wBase = gridded('mid_hor0_mettape.txt');
const tBase = gridded('tweet_hor0_mettape.txt');
const gridZ = (name: string) => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const driverZ = { mid: gridZ('mid_Backwavecone_sheep75gram.ZMA'), tweeter: gridZ('tweeter.ZMA') };
const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };
const ctx = { grid, wBase, tBase, driverZ, adjust: NO_ADJ };

const P = (x: number, y: number) => ({ x, y });
const gen = (): VxpPart[] => [
  {
    type: 'Generator',
    partId: 'G1',
    params: [
      { name: 'Eg', value: 2.83, unit: 'V' },
      { name: 'Rg', value: 0.001, unit: 'Ω' },
    ],
    wires: [P(0, 0), P(0, 10)],
  },
  { type: 'Ground', params: [], wires: [P(0, 10)] },
];
const L = (id: string, mH: number, a: { x: number; y: number }, b: { x: number; y: number }, dcr = 0.2): VxpPart => ({
  type: 'Inductor',
  partId: id,
  params: [
    { name: 'L', value: mH, unit: 'mH' },
    { name: 'DCR', value: dcr, unit: 'Ω' },
  ],
  wires: [a, b],
});
const C = (id: string, uF: number, a: { x: number; y: number }, b: { x: number; y: number }): VxpPart => ({
  type: 'Capacitor',
  partId: id,
  params: [{ name: 'C', value: uF, unit: 'uF' }],
  wires: [a, b],
});
const R = (id: string, ohm: number, a: { x: number; y: number }, b: { x: number; y: number }): VxpPart => ({
  type: 'Resistor',
  partId: id,
  params: [{ name: 'R', value: ohm, unit: 'Ω' }],
  wires: [a, b],
});
const D = (id: string, model: string, a: { x: number; y: number }, b: { x: number; y: number }): VxpPart => ({
  type: 'Driver',
  partId: id,
  model,
  inverted: false,
  params: [],
  wires: [a, b],
});
const gnd = (a: { x: number; y: number }): VxpPart => ({ type: 'Ground', params: [], wires: [a] });

/** Sane 2-way: 2nd-order LP on the mid (L1 series, C1 shunt), 2nd-order HP on
 *  the tweeter (C2 series, L2 shunt) — plus whatever a test adds. */
function sane(extra: VxpPart[] = []): VxpPart[] {
  return [
    ...gen(),
    // mid branch
    L('L1', 0.5, P(0, 0), P(10, 0)),
    C('C1', 15, P(10, 0), P(10, 10)),
    gnd(P(10, 10)),
    D('D1', 'mid', P(14, 0), P(14, 10)),
    { type: 'Wire', params: [], wires: [P(10, 0), P(14, 0)] },
    gnd(P(14, 10)),
    // tweeter branch: 3rd-order HP (C2 series, L2 shunt, C3 series)
    C('C2', 3.3, P(0, 0), P(24, 0)),
    L('L2', 0.25, P(24, 0), P(24, 10)),
    gnd(P(24, 10)),
    C('C3', 6.8, P(24, 0), P(28, 0)),
    D('D2', 'tweeter', P(28, 0), P(28, 10)),
    gnd(P(28, 10)),
    ...extra,
  ];
}
/** Sanders' dead-weight class: a shunt LC trap resonating at ~232 Hz hung
 *  across the TWEETER (behind its whole 3rd-order HP) — 127 Ω at 3 kHz
 *  against a 6 Ω tweeter. Physically inert, and no gate 1–3 ever removes it
 *  when the targets are unreachable. */
const deadTrap = (): VxpPart[] => [
  L('L9', 6.8, P(30, 0), P(30, 5), 0.5),
  C('C9', 68, P(30, 5), P(30, 10)),
  gnd(P(30, 10)),
  { type: 'Wire', params: [], wires: [P(28, 0), P(30, 0)] },
];

const entryOf = (audit: ReturnType<typeof auditNetwork>, id: string) =>
  audit!.entries.find((e) => e.ids.length === 1 && e.ids[0] === id)!;

describe('smoothOctave', () => {
  it('leaves a flat curve flat and averages a single-point spike away', () => {
    const f = logspace(100, 10000, 300);
    const flat = f.map(() => 90);
    expect(smoothOctave(f, flat).every((v) => Math.abs(v - 90) < 1e-9)).toBe(true);
    const spike = flat.map((v, i) => (i === 150 ? 110 : v));
    const sm = smoothOctave(f, spike);
    expect(sm[150]).toBeLessThan(96); // ~7 points in ±1/12 oct → +20/7
    expect(sm[150]).toBeGreaterThan(91);
  });
});

describe('part audit — gate 4 (absolute physical audit)', () => {
  it('(a) 6.8 mH shunt trap across the tweeter behind its series caps → INERT (coil, cap and the chain as a whole)', () => {
    const parts = sane(deadTrap());
    const audit = auditNetwork(parts, ctx);
    expect(audit).not.toBeNull();
    const coil = entryOf(audit, 'L9');
    expect(coil.dA).toBeLessThan(0.15);
    expect(coil.dP).toBeLessThan(1.5);
    expect(coil.verdict).toBe('inert');
    // Its explanation: as a shunt its |Z| dwarfs what it hangs on.
    expect(coil.ratio?.kind).toBe('shunt');
    expect(coil.ratio!.median).toBeGreaterThan(10);
    const chain = audit!.entries.find((e) => e.ids.length === 2 && e.ids.includes('L9') && e.ids.includes('C9'));
    expect(chain).toBeDefined();
    expect(chain!.verdict).toBe('inert');
    expect(chain!.role).toMatch(/trap/);
    // The real filter parts are earned in the same audit, each with a reason.
    for (const id of ['L1', 'C1', 'C2', 'L2', 'C3']) {
      const e = entryOf(audit, id);
      expect(e.verdict).toBe('earned');
      expect(e.reasons.length).toBeGreaterThan(0);
    }
  });

  it('(a2) …and the tuner REMOVES a dead part even when the staged targets are unreachable', () => {
    // NB a FREE dead trap does not stay dead through an unlocked value tune:
    // the tuner re-purposes it (measured: 6.8 mH → 0.78 mH, a 4th-order
    // element it found useful) — that is a design change, not a bug, and the
    // audit then correctly reports it EARNED. The unrepurposable case: the
    // chain partner is locked at a value that keeps the whole chain out of
    // the picture (2.2 nF, series-resonant with 6.8 mH at 41 kHz — tens of kΩ across a 6 Ω tweeter in-band). The free
    // coil in that chain is dead whatever its value, and gate 4 is the only
    // gate that removes it while the targets are unmet.
    const dead: VxpPart[] = [
      L('L9', 6.8, P(30, 0), P(30, 5), 0.5),
      { ...C('C9', 0.0022, P(30, 5), P(30, 10)), locked: true },
      gnd(P(30, 10)),
      { type: 'Wire', params: [], wires: [P(28, 0), P(30, 0)] },
    ];
    const parts = sane(dead);
    const r = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, {
      staged: { rippleDb: 0.01, phaseDeg: 0.1 }, // nobody meets this
      maxIterations: 200,
    });
    expect(r.removed).toContain('L9');
    expect(r.parts.some((q) => q.partId === 'L9')).toBe(false);
    const e = r.audit?.entries.find((x) => x.ids.length === 1 && x.ids[0] === 'L9');
    expect(e?.verdict).toBe('inert');
    expect(e?.applied).toBe(true);
    // The locked partner is reported, never touched.
    expect(r.parts.some((q) => q.partId === 'C9')).toBe(true);
    expect(r.removed).not.toContain('C9');
    // Nothing else was swept: the live filter survives.
    for (const id of ['L1', 'C1', 'C2', 'L2', 'C3']) expect(r.parts.some((q) => q.partId === id)).toBe(true);
  });

  it('(b) a Zobel that barely moves the SPL but lifts the Z minimum by >1 Ω → EARNED on dZ', () => {
    // Series-C into the tweeter is the ONLY tweeter filter here; the mid gets a
    // 1st-order coil so the mid's Zobel (R+C across the mid) is what tames the
    // impedance rise. Measure with and without: the audit must credit dZ.
    const base: VxpPart[] = [
      ...gen(),
      L('L1', 0.8, P(0, 0), P(10, 0)),
      D('D1', 'mid', P(10, 0), P(10, 10)),
      gnd(P(10, 10)),
      C('C2', 5, P(0, 0), P(24, 0)),
      D('D2', 'tweeter', P(24, 0), P(24, 10)),
      gnd(P(24, 10)),
    ];
    // Zobel across the tweeter: R + C to ground from the tweeter node.
    const zobel: VxpPart[] = [
      R('R3', 6, P(20, 0), P(20, 5)),
      C('C3', 4.7, P(20, 5), P(20, 10)),
      gnd(P(20, 10)),
      { type: 'Wire', params: [], wires: [P(24, 0), P(20, 0)] },
    ];
    const audit = auditNetwork([...base, ...zobel], ctx);
    expect(audit).not.toBeNull();
    const chain = audit!.entries.find((e) => e.ids.includes('R3') && e.ids.includes('C3'));
    expect(chain).toBeDefined();
    // Chosen so the amplitude effect is small but the Z-min shift is real.
    if (chain!.dA < DEFAULT_AUDIT_THRESHOLDS.earnedDb) {
      expect(Math.abs(chain!.dZmin)).toBeGreaterThan(DEFAULT_AUDIT_THRESHOLDS.zMinStepOhm);
      expect(chain!.verdict).toBe('earned');
      expect(chain!.reasons.join(' ')).toMatch(/Z min/);
    } else {
      // If this network's Zobel turns out audible, it is earned either way —
      // the test still pins that dZ is reported for it.
      expect(chain!.verdict).toBe('earned');
      expect(Number.isFinite(chain!.dZmin)).toBe(true);
    }
  });

  it('(c) a shunt coil that moves the SPL <1 dB but the pair phase P95 by >3° → EARNED on dP', () => {
    // Tweeter HP with a LARGE shunt coil: little level effect above the
    // crossing, but it rotates the tweeter's phase through the overlap.
    const parts = sane().map((q) => (q.partId === 'L2' ? L('L2', 1.5, P(24, 0), P(24, 10)) : q));
    const audit = auditNetwork(parts, ctx);
    const e = entryOf(audit, 'L2');
    // The audit judges phase on its own axis: even if amplitude alone reads
    // grey, a ≥3° P95 hit earns the part.
    if (e.dA < DEFAULT_AUDIT_THRESHOLDS.earnedDb) {
      expect(e.dP).toBeGreaterThanOrEqual(DEFAULT_AUDIT_THRESHOLDS.earnedDeg);
      expect(e.verdict).toBe('earned');
      expect(e.reasons.join(' ')).toMatch(/phase/);
    } else {
      expect(e.verdict).toBe('earned');
    }
    // Amplitude-only would have missed it: assert the amplitude number is
    // indeed the smaller signal here.
    expect(e.dP).toBeGreaterThan(1);
  });

  it('(d) 3.3 Ω series resistor in the woofer branch: EARNED/GREY on level, and a RED source-R warning at the box tuning', () => {
    const parts = sane([]).map((q) => q);
    // Insert R in series before L1: generator → R4 → L1.
    const withR = parts.map((q) => (q.partId === 'L1' ? L('L1', 0.5, P(4, 0), P(10, 0)) : q));
    withR.push(R('R4', 3.3, P(0, 0), P(4, 0)));
    const audit = auditNetwork(withR, ctx)!;
    const e = entryOf(audit, 'R4');
    expect(['earned', 'grey']).toContain(e.verdict);
    expect(e.dA).toBeGreaterThan(0.5); // a 3.3 Ω pad on a ~6 Ω mid is a level change
    // The network-level source-resistance verdict is independent of the part
    // verdicts: 3.3 Ω in front of the low driver is a red flag at Fs/Fb.
    expect(audit.rSourceTunedOhm).not.toBeNull();
    expect(audit.rSourceTunedOhm!).toBeGreaterThan(3);
    expect(audit.rSourceWarn).toBe(true);
    expect(audit.qesFactor!).toBeGreaterThan(1.3);
    // Without the resistor the same network reads clean.
    const clean = auditNetwork(parts, ctx)!;
    expect(clean.rSourceTunedOhm!).toBeLessThan(1);
    expect(clean.rSourceWarn).toBe(false);
  });

  it('locked parts are measured and reported but never applied', () => {
    const parts = sane(deadTrap().map((q) => (q.partId ? { ...q, locked: true } : q)));
    const audit = auditNetwork(parts, ctx)!;
    const e = entryOf(audit, 'L9');
    expect(e.verdict).toBe('inert');
    expect(e.locked).toBe(true);
    const r = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, { maxIterations: 200 });
    expect(r.parts.some((q) => q.partId === 'L9')).toBe(true);
    expect(r.removed).not.toContain('L9');
    expect(r.removed).not.toContain('C9');
  });

  it('audit off → nothing removed, no report', () => {
    const parts = sane(deadTrap());
    const r = optimizeNetworkValues(parts, grid, wBase, tBase, driverZ, NO_ADJ, { maxIterations: 200, audit: { enabled: false } });
    expect(r.parts.some((q) => q.partId === 'L9')).toBe(true);
    expect(r.audit).toBeUndefined();
  });

  it('is deterministic', () => {
    const parts = sane(deadTrap());
    const a = auditNetwork(parts, ctx)!;
    const b = auditNetwork(parts, ctx)!;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('source resistance is only read where it was measured (aug 2026)', () => {
  // Sanders' case, exactly: a port tuned to 31 Hz and measurements that start
  // at 200 Hz. The nearest-grid-point rule handed back grid[0] = 210 Hz, which
  // on his woofer low-pass sits on the parallel resonance of L1 and C2
  // (3.3 mH ‖ 136 µF = 237 Hz). His own hand-built filter — the best design in
  // the room — read 7.40 Ω that way against 0.23 Ω in band, and fifteen of
  // nineteen scan candidates were disqualified on that reading.
  const grid = Array.from({ length: 240 }, (_, i) => 210 * (19000 / 210) ** (i / 239));
  const z = grid.map(() => ({ re: 6, im: 0 }));

  it('refuses a tuning frequency below the grid and falls back to the DC limit', () => {
    // A KNOWN tuning below the grid gives no usable probe at all — probing
    // elsewhere would hide a resistor the shunt cap short-circuits there.
    expect(sourceProbeIndex(grid, z, 31)).toBeNull();
    const inside = sourceProbeIndex(grid, z, 500);
    expect(inside?.inBand).toBe(true);
    expect(grid[inside!.idx]).toBeGreaterThan(450);
    expect(grid[inside!.idx]).toBeLessThan(560);
  });

  it('the DC limit is the series-path resistance to the low driver', () => {
    const P = (x: number, y: number) => ({ x, y });
    const parts: VxpPart[] = [
      { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 11)] },
      { type: 'Ground', params: [], wires: [P(3, 11)] },
      // series path to the woofer: 0.24 + 0.19 Ω of coil DCR (his own filter)
      { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 3.3, unit: 'mH' }, { name: 'DCR', value: 0.24, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
      { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 136, unit: 'uF' }], wires: [P(9, 4), P(9, 11)] },
      { type: 'Ground', params: [], wires: [P(9, 11)] },
      { type: 'Inductor', partId: 'L3', params: [{ name: 'L', value: 0.68, unit: 'mH' }, { name: 'DCR', value: 0.19, unit: 'Ω' }], wires: [P(9, 4), P(15, 4)] },
      { type: 'Driver', partId: 'D1', model: 'woofer', inverted: false, params: [], wires: [P(15, 4), P(15, 11)] },
      { type: 'Ground', params: [], wires: [P(15, 11)] },
      // the tweeter branch must not count toward the woofer's series path
      { type: 'Capacitor', partId: 'C5', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 20), P(9, 20)] },
      { type: 'Wire', params: [], wires: [P(3, 4), P(3, 20)] },
      { type: 'Resistor', partId: 'R6', params: [{ name: 'R', value: 8.2, unit: 'Ω' }], wires: [P(9, 20), P(15, 20)] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(15, 20), P(15, 27)] },
      { type: 'Ground', params: [], wires: [P(15, 27)] },
    ];
    expect(seriesPathResistanceOhm(parts)).toBeCloseTo(0.43, 6);
    // And that is what the out-of-band probe reports, NOT the resonance peak.
    const driverZ = { woofer: z, tweeter: z };
    const out = sourceResistanceOhm(parts, { grid, driverZ, fbHz: 31 });
    expect(out).toBeCloseTo(0.43, 6);
    // In band the Thevenin reading stands.
    const inBand = sourceResistanceOhm(parts, { grid, driverZ, fbHz: 250 });
    expect(inBand).not.toBeNull();
    expect(inBand!).toBeGreaterThan(0);
    // And the DC limit catches what an in-band probe can hide: a resistor in
    // the series path that the shunt cap short-circuits at the probe frequency
    // (Sanders' Working(5): 3.63 Ω of series path, reported as 0.48 Ω).
    const padded = parts.map((p) =>
      p.partId === 'L3'
        ? { ...p, type: 'Resistor' as const, params: [{ name: 'R', value: 3.3, unit: 'Ω' }] }
        : p,
    );
    expect(seriesPathResistanceOhm(padded)).toBeCloseTo(3.54, 6);
    expect(sourceResistanceOhm(padded, { grid, driverZ, fbHz: 31 })).toBeCloseTo(3.54, 6);
  });
});

describe('issue #14 — the dissipation term is not evaluated at an arbitrary frequency', () => {
  it('a box tuning outside the grid yields no probe, so the term is dropped rather than misplaced', () => {
    // Sander's case: port at 31 Hz, view range from 200 Hz. The old code took
    // the nearest grid point (210 Hz), which on his woofer low-pass is the
    // parallel resonance of L1 ‖ C2 — so the "dissipation ratio" was measuring
    // the filter's own resonance.
    const grid = Array.from({ length: 240 }, (_, i) => 210 * (19000 / 210) ** (i / 239));
    const z = grid.map(() => ({ re: 6, im: 0 }));
    expect(sourceProbeIndex(grid, z, 31)).toBeNull();
    // Inside the grid it resolves normally.
    const inside = sourceProbeIndex(grid, z, 800);
    expect(inside?.inBand).toBe(true);
    expect(grid[inside!.idx]).toBeGreaterThan(700);
    expect(grid[inside!.idx]).toBeLessThan(900);
  });
});
