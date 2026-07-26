import { describe, it, expect } from 'vitest';
import { solveNetwork, solveComplexLinear, NetworkError } from './network.ts';
import type { Netlist } from './network.ts';
import { cplx, abs, arg } from './complex.ts';
import type { Complex } from './complex.ts';

const flatZ = (freq: readonly number[], ohms: number): Complex[] => freq.map(() => cplx(ohms));

const SRC = { kind: 'source' as const, id: 'G1', nodes: [1, 0] as [number, number], volts: 2.83, seriesR: 1e-3 };

describe('solveComplexLinear', () => {
  it('solves a 2x2 complex system (verified by substitution)', () => {
    // (2+j)x + y = 3 ;  x + (1+j)y = 2   (det = 3j, nonsingular)
    const mul = (a: Complex, b: Complex): Complex => ({
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re,
    });
    const A = [
      [cplx(2, 1), cplx(1, 0)],
      [cplx(1, 0), cplx(1, 1)],
    ];
    const b = [cplx(3, 0), cplx(2, 0)];
    // Copy since the solver mutates.
    const [x, y] = solveComplexLinear(
      A.map((row) => row.map((c) => ({ ...c }))),
      b.map((c) => ({ ...c })),
    );
    const eq1 = mul(cplx(2, 1), x);
    expect(eq1.re + y.re).toBeCloseTo(3, 9);
    expect(eq1.im + y.im).toBeCloseTo(0, 9);
    const eq2 = mul(cplx(1, 1), y);
    expect(x.re + eq2.re).toBeCloseTo(2, 9);
    expect(x.im + eq2.im).toBeCloseTo(0, 9);
  });
});

describe('solveNetwork', () => {
  const freq = [100, 1000, 10000];

  it('no filter: driver sees the full source voltage', () => {
    const net: Netlist = {
      nodeCount: 2,
      elements: [SRC, { kind: 'driver', id: 'D1', model: 'd', nodes: [1, 0], inverted: false }],
    };
    const r = solveNetwork(net, freq, { d: flatZ(freq, 8) });
    for (const h of r.transfers['D1']) {
      expect(abs(h)).toBeCloseTo(1, 3);
      expect(arg(h)).toBeCloseTo(0, 3);
    }
  });

  it('resistive divider: series R equal to load halves the voltage', () => {
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'R', id: 'R1', nodes: [1, 2], value: 8 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const r = solveNetwork(net, freq, { d: flatZ(freq, 8) });
    for (const h of r.transfers['D1']) expect(abs(h)).toBeCloseTo(0.5, 3);
  });

  it('1st-order RC low-pass into resistive load hits its -3 dB point', () => {
    // Series R=8, shunt C across an 8Ω load: fc = (R||Rl)·C → with R=Rl=8,
    // Thevenin R = 4. C = 1/(2π·4·1000) → fc(load side) = 1 kHz, and the
    // divider gives -6.02 dB passband. At fc total = -9.03 dB.
    const C = 1 / (2 * Math.PI * 4 * 1000);
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'R', id: 'R1', nodes: [1, 2], value: 8 },
        { kind: 'C', id: 'C1', nodes: [2, 0], value: C, seriesR: 0 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const grid = [10, 1000, 100000];
    const r = solveNetwork(net, grid, { d: flatZ(grid, 8) });
    const db = (h: Complex) => 20 * Math.log10(abs(h));
    expect(db(r.transfers['D1'][0])).toBeCloseTo(-6.02, 1); // passband divider
    expect(db(r.transfers['D1'][1])).toBeCloseTo(-9.03, 1); // -3 dB below passband
    expect(db(r.transfers['D1'][2])).toBeLessThan(-40); // deep stopband
  });

  it('2nd-order LC high-pass into 8Ω behaves textbook at extremes', () => {
    // Series C, shunt L: classic 2nd-order HP, fc = 1/(2π√(LC)) with Q set
    // by the load. Pick fc = 2 kHz, Q = 0.707: L = R/(2πfc·√2)... use the
    // standard Butterworth: C = 1/(2πfc·R·√2), L = R·√2/(2πfc)... just check
    // asymptotes: deep stopband LF, unity HF, phase → +180° at LF.
    const fc = 2000;
    const Rl = 8;
    const C = 1 / (2 * Math.PI * fc * Rl * Math.SQRT2);
    const L = (Rl * Math.SQRT2) / (2 * Math.PI * fc);
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'C', id: 'C1', nodes: [1, 2], value: C, seriesR: 0 },
        { kind: 'L', id: 'L1', nodes: [2, 0], value: L, seriesR: 0 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const grid = [100, 40000];
    const r = solveNetwork(net, grid, { d: flatZ(grid, Rl) });
    expect(20 * Math.log10(abs(r.transfers['D1'][0]))).toBeLessThan(-40); // 100 Hz ≈ -52 dB
    expect(abs(r.transfers['D1'][1])).toBeCloseTo(1, 1); // well above fc
  });

  it('inversion flips the transfer sign', () => {
    const net: Netlist = {
      nodeCount: 2,
      elements: [SRC, { kind: 'driver', id: 'D1', model: 'd', nodes: [1, 0], inverted: true }],
    };
    const r = solveNetwork(net, [1000], { d: flatZ([1000], 8) });
    expect(r.transfers['D1'][0].re).toBeCloseTo(-1, 3);
  });

  it('the measured load changes the filter — resonance peak lifts a series-R divider', () => {
    // Series 8Ω into a load whose |Z| is 32Ω at f1 (resonance) vs 8Ω at f2:
    // transfer must be 0.8 vs 0.5. THE reason we never collapse Z to nominal.
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'R', id: 'R1', nodes: [1, 2], value: 8 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const r = solveNetwork(net, [80, 1000], { d: [cplx(32), cplx(8)] });
    expect(abs(r.transfers['D1'][0])).toBeCloseTo(0.8, 3);
    expect(abs(r.transfers['D1'][1])).toBeCloseTo(0.5, 3);
  });

  it('rejects a driver without measured impedance', () => {
    const net: Netlist = {
      nodeCount: 2,
      elements: [SRC, { kind: 'driver', id: 'D1', model: 'missing', nodes: [1, 0], inverted: false }],
    };
    expect(() => solveNetwork(net, [1000], {})).toThrow(NetworkError);
  });
});

describe('solveNetwork input impedance', () => {
  const freq = [100, 1000, 10000];

  it('bare driver load: Zin equals the measured driver Z (Rg excluded)', () => {
    const net: Netlist = {
      nodeCount: 2,
      elements: [SRC, { kind: 'driver', id: 'D1', model: 'd', nodes: [1, 0], inverted: false }],
    };
    const r = solveNetwork(net, freq, { d: [cplx(8), cplx(32), cplx(6, 4)] });
    expect(abs(r.inputZ[0])).toBeCloseTo(8, 3);
    expect(abs(r.inputZ[1])).toBeCloseTo(32, 3); // resonance peak passes through
    expect(r.inputZ[2].re).toBeCloseTo(6, 3);
    expect(r.inputZ[2].im).toBeCloseTo(4, 3); // complex Z survives, not just |Z|
  });

  it('series R adds to the load: divider network shows R + Rload', () => {
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'R', id: 'R1', nodes: [1, 2], value: 8 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const r = solveNetwork(net, freq, { d: flatZ(freq, 8) });
    for (const z of r.inputZ) expect(abs(z)).toBeCloseTo(16, 3);
  });

  it('series L over a resistive load: |Zin| = √(R² + (ωL)²)', () => {
    const L = 1e-3;
    const Rl = 8;
    const net: Netlist = {
      nodeCount: 3,
      elements: [
        SRC,
        { kind: 'L', id: 'L1', nodes: [1, 2], value: L, seriesR: 0 },
        { kind: 'driver', id: 'D1', model: 'd', nodes: [2, 0], inverted: false },
      ],
    };
    const r = solveNetwork(net, freq, { d: flatZ(freq, Rl) });
    freq.forEach((f, i) => {
      const wL = 2 * Math.PI * f * L;
      expect(abs(r.inputZ[i])).toBeCloseTo(Math.hypot(Rl, wL), 2);
    });
  });

  it('open network (no load at all) yields a huge but finite Zin', () => {
    const net: Netlist = { nodeCount: 2, elements: [SRC] };
    const r = solveNetwork(net, [1000], {});
    expect(Number.isFinite(abs(r.inputZ[0]))).toBe(true);
    expect(abs(r.inputZ[0])).toBeGreaterThan(1e9); // ~1/G_LEAK
  });
});
