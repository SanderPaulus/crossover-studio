import { describe, expect, it } from 'vitest';
import { cplx } from './complex.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpPart } from './parsers/vxp.ts';
import type { SynthesizedComponent } from './synthesis.ts';
import {
  addPart,
  addWire,
  deletePart,
  mergeSynthesizedSchematics,
  movePart,
  nextPartId,
  normalizeOrigin,
  partParam,
  rotatePart,
  setPartParam,
  setPartProps,
  templateSchematic,
} from './schematicEdit.ts';

const GRID = [100, 1000, 10000];
const flatZ = (ohms: number) => GRID.map(() => cplx(ohms));

/** Small solvable schematic: generator → series L → mid driver. */
function ladder(): VxpPart[] {
  return [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [
        { x: 3, y: 4 },
        { x: 3, y: 11 },
      ],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 1, unit: 'mH' },
        { name: 'DCR', value: 0.29, unit: 'Ω' },
      ],
      wires: [
        { x: 3, y: 4 },
        { x: 10, y: 4 },
      ],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      inverted: false,
      params: [],
      wires: [
        { x: 10, y: 4 },
        { x: 10, y: 11 },
      ],
    },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
  ];
}

const solveParts = (parts: VxpPart[]) =>
  solveNetwork(crossoverToNetlist({ name: 't', parts }).netlist, GRID, { mid: flatZ(8) });

const transferOf = (parts: VxpPart[]): number[] => {
  const sol = solveParts(parts);
  return sol.transfers[sol.drivers[0].id].flatMap((h) => [h.re, h.im]);
};

describe('movePart', () => {
  it('never disconnects: stub wires bridge old → new terminal positions', () => {
    const parts = ladder();
    const before = transferOf(parts);
    const moved = movePart(parts, 3, 6, 3); // drag the driver anywhere
    expect(transferOf(moved)).toEqual(before);
    // Two stubs: one per connected terminal ('+' to L1, '−' to ground).
    expect(moved.length).toBe(parts.length + 2);
  });

  it('leaves junctions intact when a shared point serves multiple parts', () => {
    // Junction at (10,4): L1 end, driver '+', AND a shunt R to ground.
    let parts = ladder();
    parts.push({
      type: 'Resistor',
      partId: 'R9',
      params: [{ name: 'R', value: 4, unit: 'Ω' }],
      wires: [
        { x: 10, y: 4 },
        { x: 10, y: 11 },
      ],
    });
    const before = transferOf(parts);
    const moved = movePart(parts, 3, 4, 2); // move ONLY the driver
    // The R stays on the junction, the driver reconnects via a stub: the
    // transfer (R present, driver fed) must be identical.
    expect(transferOf(moved)).toEqual(before);
  });

  it('adds no stubs for free terminals', () => {
    const lone: VxpPart[] = [
      {
        type: 'Resistor',
        partId: 'R1',
        params: [{ name: 'R', value: 8, unit: 'Ω' }],
        wires: [
          { x: 20, y: 20 },
          { x: 27, y: 20 },
        ],
      },
    ];
    expect(movePart(lone, 0, 3, 3)).toHaveLength(1);
  });

  it('does not mutate its input', () => {
    const parts = ladder();
    const snapshot = JSON.stringify(parts);
    movePart(parts, 2, 3, 3);
    expect(JSON.stringify(parts)).toBe(snapshot);
  });
});

describe('rotate/add/delete/wire', () => {
  it('rotates around the first terminal', () => {
    const parts = rotatePart(ladder(), 2); // L1 horizontal → vertical
    expect(parts[2].wires).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 11 },
    ]);
  });

  it('adds parts with sane defaults and fresh ids', () => {
    let parts = ladder();
    parts = addPart(parts, 'Inductor', { x: 20, y: 4 });
    const l2 = parts[parts.length - 1];
    expect(l2.partId).toBe('L2');
    expect(partParam(l2, 'L')).toBe(1);
    expect(partParam(l2, 'DCR')).toBeCloseTo(0.29, 2);
    parts = addPart(parts, 'Driver', { x: 30, y: 4 }, 'tweeter');
    expect(parts[parts.length - 1].model).toBe('tweeter');
    expect(nextPartId(parts, 'Driver')).toBe('D3');
  });

  it('routes diagonal wires with an elbow', () => {
    const parts = addWire([], { x: 1, y: 1 }, { x: 5, y: 9 });
    expect(parts[0].wires).toEqual([
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 9 },
    ]);
  });

  it('deletes a part and updates params immutably', () => {
    const parts = ladder();
    expect(deletePart(parts, 2)).toHaveLength(4);
    const set = setPartParam(parts, 2, 'L', 2.5, 'mH');
    expect(partParam(set[2], 'L')).toBe(2.5);
    expect(partParam(parts[2], 'L')).toBe(1);
    const inv = setPartProps(parts, 3, { inverted: true });
    expect(inv[3].inverted).toBe(true);
    expect(parts[3].inverted).toBe(false);
  });

  it('a param edit clears the stale catalog SKU; a suggestion re-stamps it', () => {
    // The BOM trusts `catalog` first, so a snapped SKU must not survive a
    // manual value/DCR/ESR change and lie about the part (Sanders: picking a
    // new series left the BOM unchanged).
    const snapped = setPartProps(ladder(), 2, { catalog: 'JAZ-OLD-SKU' });
    expect(snapped[2].catalog).toBe('JAZ-OLD-SKU');
    const edited = setPartParam(snapped, 2, 'L', 2.5, 'mH');
    expect(edited[2].catalog).toBeUndefined();
    // The inspector's apply flow: change value, then stamp the chosen SKU.
    const restamped = setPartProps(edited, 2, { catalog: 'JAZ-NEW-SKU' });
    expect(restamped[2].catalog).toBe('JAZ-NEW-SKU');
  });
});

describe('templateSchematic', () => {
  it('is solvable with |H| ≈ 1 per driver', () => {
    const xo = templateSchematic(['mid', 'tweeter']);
    const { netlist } = crossoverToNetlist(xo);
    const sol = solveNetwork(netlist, GRID, { mid: flatZ(8), tweeter: flatZ(8) });
    expect(sol.drivers).toHaveLength(2);
    for (const d of sol.drivers) {
      for (const h of sol.transfers[d.id]) {
        expect(Math.hypot(h.re, h.im)).toBeCloseTo(1, 3);
      }
    }
  });
});

describe('mergeSynthesizedSchematics', () => {
  const hp: SynthesizedComponent[] = [
    { id: 'C1', kind: 'C', value: 10e-6, role: 'HP section 1 series C' },
  ];
  const lp: SynthesizedComponent[] = [
    { id: 'L1', kind: 'L', value: 1e-3, role: 'LP section 1 series L' },
  ];

  it('keeps one generator and both branches solvable', () => {
    const xo = mergeSynthesizedSchematics([
      { components: lp, model: 'mid' },
      { components: hp, model: 'tweeter' },
    ]);
    expect(xo.parts.filter((p) => p.type === 'Generator')).toHaveLength(1);
    const { netlist } = crossoverToNetlist(xo);
    const sol = solveNetwork(netlist, GRID, { mid: flatZ(8), tweeter: flatZ(8) });
    expect(sol.drivers).toHaveLength(2);
    const magOf = (model: string, k: number) => {
      const d = sol.drivers.find((x) => x.model === model)!;
      const h = sol.transfers[d.id][k];
      return Math.hypot(h.re, h.im);
    };
    expect(magOf('mid', 0)).toBeGreaterThan(0.9); // LP passband at 100 Hz
    expect(magOf('mid', 2)).toBeLessThan(0.3); // LP stopband at 10 kHz
    expect(magOf('tweeter', 0)).toBeLessThan(0.3); // HP stopband at 100 Hz
    expect(magOf('tweeter', 2)).toBeGreaterThan(0.9); // HP passband at 10 kHz
  });
});

describe('normalizeOrigin', () => {
  it('shifts the drawing to the margin', () => {
    const parts = normalizeOrigin(
      [{ type: 'Wire', params: [], wires: [{ x: 40, y: 30 }, { x: 50, y: 30 }] }],
      2,
    );
    expect(parts[0].wires[0]).toEqual({ x: 2, y: 2 });
  });
});
