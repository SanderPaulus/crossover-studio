import { describe, it, expect } from 'vitest';
import { solveWithSensitivities, dbPhaseGradient } from './adjoint.ts';
import { solveNetwork, NetworkError, type Netlist } from './network.ts';
import { cplx, abs, arg } from './complex.ts';
import type { Complex } from './complex.ts';

/**
 * The whole value of an analytic gradient is that it is EXACT. So every test
 * here checks it against central finite differences of the very solver the
 * production path uses — if the adjoint derivation had a sign or a chain-rule
 * slip, a wrong gradient would still "work" (an optimiser would just descend
 * badly) and nothing else in the suite would notice.
 */

const SRC = {
  kind: 'source' as const,
  id: 'G1',
  nodes: [1, 0] as [number, number],
  volts: 2.83,
  seriesR: 1e-3,
};

/** A driver impedance with a resonance peak and a coil-inductance rise —
 *  a flat 8 Ω would hide any frequency-dependent mistake. */
const driverZ = (freq: readonly number[]): Complex[] =>
  freq.map((f) => {
    const fs = 600;
    const q = 2.5;
    const x = f / fs - fs / f;
    const peak = 26 / (1 + (q * x) ** 2);
    return cplx(6.2 + peak, 6.2 * 0.35 * (f / 3000) + (-peak * q * x) / (1 + (q * x) ** 2));
  });

/** 2nd-order LP ladder + a shunt LCR trap + a series pad resistor. */
function makeNet(vals: Record<string, number>, inverted = false): Netlist {
  return {
    nodeCount: 5,
    elements: [
      SRC,
      { kind: 'L', id: 'L1', nodes: [1, 2], value: vals.L1, seriesR: 0.28 },
      { kind: 'R', id: 'R1', nodes: [2, 3], value: vals.R1 },
      { kind: 'C', id: 'C1', nodes: [3, 0], value: vals.C1, seriesR: 0.02 },
      { kind: 'L', id: 'L2', nodes: [3, 4], value: vals.L2, seriesR: 0.11 },
      { kind: 'C', id: 'C2', nodes: [4, 0], value: vals.C2 },
      { kind: 'driver', id: 'D', model: 'drv', nodes: [3, 0], inverted },
    ],
  };
}

const BASE = { L1: 1.8e-3, R1: 1.5, C1: 12e-6, L2: 0.47e-3, C2: 6.8e-6 };
const SLOTS = ['L1', 'R1', 'C1', 'L2', 'C2'];
const FREQ = [120, 480, 1300, 2600, 9000];

/** Central difference of H in log10 space, through the production solver. */
function fdTransfer(slot: string, freq: readonly number[], inverted = false): Complex[][] {
  const h = 1e-5;
  const step = (sign: number): Complex[] => {
    const vals = { ...BASE, [slot]: 10 ** (Math.log10(BASE[slot as keyof typeof BASE]) + sign * h) };
    return solveNetwork(makeNet(vals, inverted), freq, { drv: driverZ(freq) }).transfers['D'];
  };
  const up = step(1);
  const dn = step(-1);
  return [up.map((u, i) => cplx((u.re - dn[i].re) / (2 * h), (u.im - dn[i].im) / (2 * h)))];
}

describe('solveWithSensitivities', () => {
  it('reproduces the production solver transfers', () => {
    const ref = solveNetwork(makeNet(BASE), FREQ, { drv: driverZ(FREQ) });
    const got = solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, SLOTS);
    for (let k = 0; k < FREQ.length; k++) {
      expect(abs(got.transfers['D'][k])).toBeCloseTo(abs(ref.transfers['D'][k]), 12);
      expect(arg(got.transfers['D'][k])).toBeCloseTo(arg(ref.transfers['D'][k]), 12);
    }
  });

  it('matches central finite differences for every element kind', () => {
    const sens = solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, SLOTS);
    for (let s = 0; s < SLOTS.length; s++) {
      const fd = fdTransfer(SLOTS[s], FREQ)[0];
      for (let k = 0; k < FREQ.length; k++) {
        const a = sens.dTransfers['D'][s][k];
        const scaleRef = Math.max(abs(fd[k]), 1e-9);
        expect(Math.abs(a.re - fd[k].re) / scaleRef).toBeLessThan(1e-5);
        expect(Math.abs(a.im - fd[k].im) / scaleRef).toBeLessThan(1e-5);
      }
    }
  });

  it('carries the driver inversion into the gradient sign', () => {
    const plain = solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, SLOTS);
    const inv = solveWithSensitivities(makeNet(BASE, true), FREQ, { drv: driverZ(FREQ) }, SLOTS);
    for (let s = 0; s < SLOTS.length; s++) {
      for (let k = 0; k < FREQ.length; k++) {
        expect(inv.dTransfers['D'][s][k].re).toBeCloseTo(-plain.dTransfers['D'][s][k].re, 12);
        expect(inv.dTransfers['D'][s][k].im).toBeCloseTo(-plain.dTransfers['D'][s][k].im, 12);
      }
      // ...and still agrees with finite differences of the inverted network.
      const fd = fdTransfer(SLOTS[s], FREQ, true)[0];
      for (let k = 0; k < FREQ.length; k++) {
        const scaleRef = Math.max(abs(fd[k]), 1e-9);
        expect(Math.abs(inv.dTransfers['D'][s][k].re - fd[k].re) / scaleRef).toBeLessThan(1e-5);
      }
    }
  });

  it('serves several driver outputs from one factorisation', () => {
    // Two branches off one generator: each driver's gradient must see only the
    // components that actually reach it (and the shared series element).
    const net: Netlist = {
      nodeCount: 4,
      elements: [
        SRC,
        { kind: 'R', id: 'Rs', nodes: [1, 2], value: 1 },
        { kind: 'C', id: 'Ct', nodes: [2, 3], value: 4.7e-6 },
        { kind: 'driver', id: 'DT', model: 'drv', nodes: [3, 0], inverted: false },
        { kind: 'driver', id: 'DW', model: 'drv', nodes: [2, 0], inverted: false },
      ],
    };
    const sens = solveWithSensitivities(net, FREQ, { drv: driverZ(FREQ) }, ['Rs', 'Ct']);
    // Ct is in series with DT only — it cannot be irrelevant there...
    expect(abs(sens.dTransfers['DT'][1][2])).toBeGreaterThan(1e-3);
    // ...but it still loads node 2, so DW feels it too, just far less.
    expect(abs(sens.dTransfers['DW'][1][2])).toBeLessThan(abs(sens.dTransfers['DT'][1][2]));
    // Rs feeds both.
    expect(abs(sens.dTransfers['DW'][0][2])).toBeGreaterThan(1e-3);
  });

  it('accounts for a parasitic that is modelled FROM the value (coil DCR)', () => {
    // The catalog-snap fit models DCR ≈ 0.29·(L/mH)^0.65, so DCR moves with L.
    // Ignoring that coupling leaves a gradient that is plausible but wrong —
    // which an optimiser would silently descend along.
    const dcr = (l: number) => 0.29 * (l * 1e3) ** 0.65;
    const dDcr = (l: number) => 0.29 * 0.65 * (l * 1e3) ** -0.35 * 1e3;
    const netAt = (l1: number): Netlist => ({
      ...makeNet({ ...BASE, L1: l1 }),
      elements: makeNet({ ...BASE, L1: l1 }).elements.map((e) =>
        e.id === 'L1' ? { ...e, seriesR: dcr(l1) } : e,
      ),
    });
    const sens = solveWithSensitivities(netAt(BASE.L1), FREQ, { drv: driverZ(FREQ) }, ['L1'], {
      dSeriesRdValue: [dDcr(BASE.L1)],
    });
    const h = 1e-5;
    const up = solveNetwork(netAt(10 ** (Math.log10(BASE.L1) + h)), FREQ, { drv: driverZ(FREQ) })
      .transfers['D'];
    const dn = solveNetwork(netAt(10 ** (Math.log10(BASE.L1) - h)), FREQ, { drv: driverZ(FREQ) })
      .transfers['D'];
    for (let k = 0; k < FREQ.length; k++) {
      const fd = cplx((up[k].re - dn[k].re) / (2 * h), (up[k].im - dn[k].im) / (2 * h));
      const scaleRef = Math.max(abs(fd), 1e-9);
      expect(Math.abs(sens.dTransfers['D'][0][k].re - fd.re) / scaleRef).toBeLessThan(1e-4);
      expect(Math.abs(sens.dTransfers['D'][0][k].im - fd.im) / scaleRef).toBeLessThan(1e-4);
    }
  });

  it('rejects a slot id that is not an R/L/C element', () => {
    expect(() => solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, ['L9'])).toThrow(
      NetworkError,
    );
    expect(() => solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, ['D'])).toThrow(
      NetworkError,
    );
  });
});

describe('dbPhaseGradient', () => {
  it('matches finite differences of dB and degrees', () => {
    const sens = solveWithSensitivities(makeNet(BASE), FREQ, { drv: driverZ(FREQ) }, SLOTS);
    const h = 1e-5;
    for (let s = 0; s < SLOTS.length; s++) {
      const slot = SLOTS[s] as keyof typeof BASE;
      const at = (sign: number) => {
        const vals = { ...BASE, [slot]: 10 ** (Math.log10(BASE[slot]) + sign * h) };
        return solveNetwork(makeNet(vals), FREQ, { drv: driverZ(FREQ) }).transfers['D'];
      };
      const up = at(1);
      const dn = at(-1);
      for (let k = 0; k < FREQ.length; k++) {
        const g = dbPhaseGradient(sens.transfers['D'][k], sens.dTransfers['D'][s][k]);
        const fdDb = (20 * Math.log10(abs(up[k])) - 20 * Math.log10(abs(dn[k]))) / (2 * h);
        const fdDeg = (((arg(up[k]) - arg(dn[k])) * 180) / Math.PI) / (2 * h);
        expect(Math.abs(g.dDb - fdDb)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fdDb)));
        expect(Math.abs(g.dDeg - fdDeg)).toBeLessThan(1e-4 * Math.max(1, Math.abs(fdDeg)));
      }
    }
  });

  it('returns zero rather than NaN for a dead branch', () => {
    expect(dbPhaseGradient(cplx(0, 0), cplx(1, 1))).toEqual({ dDb: 0, dDeg: 0 });
  });
});
