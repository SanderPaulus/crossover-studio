import { describe, it, expect } from 'vitest';
import { synthesizedToSchematic } from './synthSchematic.ts';
import type { SynthesizedComponent } from './synthesis.ts';

const comp = (
  id: string,
  kind: 'C' | 'L' | 'R',
  value: number,
  role: string,
): SynthesizedComponent => ({ id, kind, value, role });

describe('synthesizedToSchematic', () => {
  it('lays out an HP + notch ladder with generator, driver and grounds', () => {
    const xo = synthesizedToSchematic(
      [
        comp('C1', 'C', 4.7e-6, 'HP section 1 series C'),
        comp('L2', 'L', 0.5e-3, 'HP section 1 shunt L'),
        comp('L3', 'L', 0.05e-3, 'notch @6500 Hz L'),
        comp('C4', 'C', 9.4e-6, 'notch @6500 Hz C'),
        comp('R5', 'R', 5.5, 'notch @6500 Hz R'),
      ],
      'tweeter',
    );

    const types = xo.parts.map((p) => p.type);
    expect(types.filter((t) => t === 'Generator')).toHaveLength(1);
    expect(types.filter((t) => t === 'Driver')).toHaveLength(1);
    // Grounds: generator + shunt L + notch + driver = 4.
    expect(types.filter((t) => t === 'Ground')).toHaveLength(4);

    // Series C sits on the bus; shunt L drops off the bus after it.
    const c1 = xo.parts.find((p) => p.partId === 'C1')!;
    expect(c1.wires[0].y).toBe(c1.wires[1].y); // horizontal
    const l2 = xo.parts.find((p) => p.partId === 'L2')!;
    expect(l2.wires[0].x).toBe(l2.wires[1].x); // vertical
    expect(l2.wires[0].x).toBe(c1.wires[1].x); // at the node AFTER the series C

    // Notch chain: three vertically stacked parts sharing one x.
    const chain = ['L3', 'C4', 'R5'].map((id) => xo.parts.find((p) => p.partId === id)!);
    expect(new Set(chain.flatMap((p) => p.wires.map((w) => w.x))).size).toBe(1);
    // Spread rule: the notch does NOT overlap the shunt L already on the node.
    expect(chain[0].wires[0].x).toBeGreaterThan(l2.wires[0].x);
    expect(chain[0].wires[1]).toEqual(chain[1].wires[0]); // L bottom = C top
    expect(chain[1].wires[1]).toEqual(chain[2].wires[0]); // C bottom = R top

    // Values converted to display units.
    expect(c1.params[0]).toEqual({ name: 'C', value: 4.7, unit: 'uF' });
    expect(l2.params[0]).toEqual({ name: 'L', value: 0.5, unit: 'mH' });
    expect(xo.parts.find((p) => p.partId === 'R5')!.params[0].unit).toBe('Ω');

    // Driver carries the model for the color mapping.
    expect(xo.parts.find((p) => p.type === 'Driver')!.model).toBe('tweeter');
  });

  it('handles a pure series ladder (LP4) without shunOrphans', () => {
    const xo = synthesizedToSchematic(
      [
        comp('L1', 'L', 0.6e-3, 'LP section 1 series L'),
        comp('C2', 'C', 30e-6, 'LP section 1 shunt C'),
        comp('L3', 'L', 0.3e-3, 'LP section 2 series L'),
        comp('C4', 'C', 9e-6, 'LP section 2 shunt C'),
      ],
      'mid',
    );
    // Two series parts → the driver ends two x-steps right of the generator,
    // plus its own step.
    const gen = xo.parts.find((p) => p.type === 'Generator')!;
    const drv = xo.parts.find((p) => p.type === 'Driver')!;
    expect(drv.wires[0].x).toBeGreaterThan(gen.wires[0].x);
    // Every wire endpoint is on-grid and finite.
    for (const p of xo.parts) {
      for (const w of p.wires) {
        expect(Number.isFinite(w.x)).toBe(true);
        expect(Number.isFinite(w.y)).toBe(true);
      }
    }
  });
});
