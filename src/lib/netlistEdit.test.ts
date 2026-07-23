import { describe, expect, it } from 'vitest';
import { cplx } from './complex.ts';
import type { Netlist } from './network.ts';
import { solveNetwork } from './network.ts';
import type { SynthesizedComponent } from './synthesis.ts';
import {
  estimateCoilDcr,
  formatValue,
  mergeBranches,
  netlistFromSynthesis,
  nextElementId,
  normalizeNetlist,
  templateNetwork,
  validateNetlist,
} from './netlistEdit.ts';

const GRID = [100, 1000, 10000];
const flatZ = (ohms: number) => GRID.map(() => cplx(ohms));

describe('validateNetlist', () => {
  const good: Netlist = {
    nodeCount: 3,
    elements: [
      { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
      { kind: 'L', id: 'L1', nodes: [1, 2], value: 1e-3, seriesR: 0.29 },
      { kind: 'driver', id: 'D1', model: 'mid', nodes: [2, 0], inverted: false },
    ],
  };

  it('accepts a well-formed network', () => {
    const r = validateNetlist(good, ['mid', 'tweeter']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('flags a missing generator as an error', () => {
    const r = validateNetlist(
      { nodeCount: 2, elements: good.elements.filter((e) => e.kind !== 'source') },
      ['mid'],
    );
    expect(r.errors.some((m) => m.includes('No generator'))).toBe(true);
  });

  it('flags a driver model without measured impedance', () => {
    const r = validateNetlist(good, ['tweeter']);
    expect(r.errors.some((m) => m.includes('"mid"'))).toBe(true);
  });

  it('flags non-positive component values and duplicate ids', () => {
    const bad: Netlist = {
      nodeCount: 3,
      elements: [
        { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
        { kind: 'C', id: 'X', nodes: [1, 2], value: 0 },
        { kind: 'R', id: 'X', nodes: [2, 0], value: 4 },
      ],
    };
    const r = validateNetlist(bad, []);
    expect(r.errors.some((m) => m.includes('positive number'))).toBe(true);
    expect(r.errors.some((m) => m.includes('Duplicate'))).toBe(true);
  });

  it('warns on floating subcircuits and self-connected elements', () => {
    const net: Netlist = {
      nodeCount: 5,
      elements: [
        { kind: 'source', id: 'G1', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
        { kind: 'R', id: 'R1', nodes: [1, 1], value: 8 },
        { kind: 'R', id: 'R2', nodes: [3, 4], value: 8 },
      ],
    };
    const r = validateNetlist(net, []);
    expect(r.warnings.some((m) => m.includes('does nothing'))).toBe(true);
    expect(r.warnings.some((m) => m.includes('floating'))).toBe(true);
  });
});

describe('normalizeNetlist / nextElementId', () => {
  it('compacts node numbers with ground fixed at 0', () => {
    const n = normalizeNetlist([
      { kind: 'source', id: 'G1', nodes: [7, 0], volts: 2.83, seriesR: 1e-3 },
      { kind: 'R', id: 'R1', nodes: [7, 12], value: 8 },
      { kind: 'driver', id: 'D1', model: 'mid', nodes: [12, 0], inverted: false },
    ]);
    expect(n.nodeCount).toBe(3);
    expect(n.elements[0].nodes).toEqual([1, 0]);
    expect(n.elements[1].nodes).toEqual([1, 2]);
    expect(n.elements[2].nodes).toEqual([2, 0]);
  });

  it('generates fresh ids per kind', () => {
    const els: Netlist['elements'] = [
      { kind: 'C', id: 'C1', nodes: [1, 2], value: 1e-6 },
      { kind: 'C', id: 'C2', nodes: [1, 2], value: 1e-6 },
    ];
    expect(nextElementId(els, 'C')).toBe('C3');
    expect(nextElementId(els, 'L')).toBe('L1');
    expect(nextElementId(els, 'driver')).toBe('D1');
  });
});

describe('templateNetwork', () => {
  it('puts every driver straight on the generator and solves to |H| ≈ 1', () => {
    const net = templateNetwork(['mid', 'tweeter']);
    expect(validateNetlist(net, ['mid', 'tweeter']).errors).toEqual([]);
    const sol = solveNetwork(net, GRID, { mid: flatZ(8), tweeter: flatZ(8) });
    for (const d of sol.drivers) {
      for (const h of sol.transfers[d.id]) {
        expect(Math.hypot(h.re, h.im)).toBeCloseTo(1, 3);
      }
    }
  });
});

describe('netlistFromSynthesis', () => {
  const comps: SynthesizedComponent[] = [
    { id: 'C1', kind: 'C', value: 9.87654e-6, role: 'HP section 1 series C' },
    { id: 'L1', kind: 'L', value: 1.23456e-3, role: 'HP section 1 shunt L' },
  ];

  it('keeps exact values (no 3-digit display rounding)', () => {
    const net = netlistFromSynthesis(comps, 'tweeter');
    const c = net.elements.find((e) => e.id === 'C1');
    const l = net.elements.find((e) => e.id === 'L1');
    expect(c && 'value' in c ? c.value : NaN).toBeCloseTo(9.87654e-6, 12);
    expect(l && 'value' in l ? l.value : NaN).toBeCloseTo(1.23456e-3, 12);
  });

  it('produces a solvable high-pass branch', () => {
    const net = netlistFromSynthesis(comps, 'tweeter');
    expect(validateNetlist(net, ['tweeter']).errors).toEqual([]);
    const sol = solveNetwork(net, [100, 20000], {
      tweeter: [cplx(8), cplx(8)],
    });
    const h = sol.transfers[sol.drivers[0].id];
    const mag = (i: number) => Math.hypot(h[i].re, h[i].im);
    expect(mag(0)).toBeLessThan(0.1); // 100 Hz: deep in the stopband
    expect(mag(1)).toBeGreaterThan(0.9); // 20 kHz: passband
  });
});

describe('mergeBranches', () => {
  const branch = (model: string, kind: 'L' | 'C', value: number): Netlist => ({
    nodeCount: 3,
    elements: [
      { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: 1e-3 },
      { kind, id: `${kind}1`, nodes: [1, 2], value },
      { kind: 'driver', id: 'D', model, nodes: [2, 0], inverted: false },
    ],
  });

  it('keeps one generator and disjoint branch nodes', () => {
    const merged = mergeBranches([branch('mid', 'L', 1e-3), branch('tweeter', 'C', 5e-6)]);
    expect(merged.elements.filter((e) => e.kind === 'source')).toHaveLength(1);
    expect(merged.elements.filter((e) => e.kind === 'driver')).toHaveLength(2);
    expect(validateNetlist(merged, ['mid', 'tweeter']).errors).toEqual([]);
    // Branch outputs must NOT share a node (only ground + input are shared).
    const [dMid, dTweet] = merged.elements.filter((e) => e.kind === 'driver');
    expect(dMid.nodes[0]).not.toBe(dTweet.nodes[0]);
  });

  it('renames colliding element ids', () => {
    const merged = mergeBranches([branch('mid', 'L', 1e-3), branch('tweeter', 'C', 5e-6)]);
    const ids = merged.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('preserves each branch transfer (near-zero source impedance)', () => {
    const a = branch('mid', 'L', 1e-3);
    const b = branch('tweeter', 'C', 5e-6);
    const z = { mid: flatZ(8), tweeter: flatZ(8) };
    const merged = mergeBranches([a, b]);
    const solo = {
      mid: solveNetwork(a, GRID, z),
      tweeter: solveNetwork(b, GRID, z),
    };
    const all = solveNetwork(merged, GRID, z);
    for (const d of all.drivers) {
      const ref = solo[d.model as 'mid' | 'tweeter'];
      const refH = ref.transfers[ref.drivers[0].id];
      all.transfers[d.id].forEach((h, i) => {
        expect(h.re).toBeCloseTo(refH[i].re, 3);
        expect(h.im).toBeCloseTo(refH[i].im, 3);
      });
    }
  });
});

describe('helpers', () => {
  it('estimates air-core DCR from the CLAUDE.md fit', () => {
    expect(estimateCoilDcr(1e-3)).toBeCloseTo(0.29, 10); // 1 mH
    expect(estimateCoilDcr(4e-3)).toBeGreaterThan(estimateCoilDcr(1e-3));
    expect(estimateCoilDcr(0)).toBe(0);
  });

  it('formats values in engineering units', () => {
    expect(formatValue({ kind: 'C', id: 'C1', nodes: [0, 1], value: 4.7e-6 })).toBe('4.7 µF');
    expect(formatValue({ kind: 'L', id: 'L1', nodes: [0, 1], value: 1.234e-3 })).toBe('1.23 mH');
    expect(formatValue({ kind: 'R', id: 'R1', nodes: [0, 1], value: 8.2 })).toBe('8.2 Ω');
  });
});
