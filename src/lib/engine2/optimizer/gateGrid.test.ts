/**
 * V32 — WHERE AN ELECTRICAL GATE JUDGES, AS A TEST.
 *
 * The finding, in one line: three frozen netlists passed `M-B/|Z|` in their own
 * chain run at 2.59–2.61 Ω and missed the same stated floor when the file was
 * measured, at 2.36–2.45 Ω. Their minima sit at ~82 Hz and the chain's analysis
 * grid starts at 200 Hz, because that is where this set's far field begins.
 *
 * Four claims here, and the fourth is the one that keeps the other three from
 * being satisfiable by an accident:
 *
 *   1. THE ELECTRICAL VALUES COME OFF THE SWEEP. A reference built with the
 *      measured sweeps judges over the sweep's span, not the response grid's,
 *      and says so in its own `parameters`.
 *   2. NO SWEEP, NO VERDICT — and no fallback. The gate reports no value and
 *      the reason names the missing input.
 *   3. ONE MISSING BRANCH IS AS DISQUALIFYING AS NONE. A system impedance is
 *      not a per-driver quantity.
 *   4. IT ACTUALLY BITES. A dip that lives BELOW the response grid's floor must
 *      change a verdict — otherwise claims 1–3 would all still hold for a
 *      reference that had quietly kept judging on the old grid over a span it
 *      merely reports differently (V23's lesson: a channel with no effect
 *      reports nothing).
 *
 * The fixture is synthetic on purpose. Casus 1's own numbers live in
 * `frozenNetlistGates.test.ts`, which asserts the contradiction itself; this
 * file has to be able to CONSTRUCT a sub-200 Hz dip, which no measured set
 * obliges you with on demand.
 */

import { describe, expect, it } from 'vitest';
import { fromPolar } from '../../complex.ts';
import type { Complex } from '../../complex.ts';
import { logspace } from '../../dsp.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';
import { evaluateGates, freezeGateReference, type MeasuredSweep } from './gates.ts';
import { impedanceReferenceFrom } from './impedanceReference.ts';

/* ------------------------------------------------------------------ *
 * A two-way whose load dips BELOW the response grid
 * ------------------------------------------------------------------ */

/** The response grid — a far field that starts where casus 1's does. */
const RESPONSE_LO_HZ = 200;
const RESPONSE_HI_HZ = 20000;
const RESPONSE_POINTS = 96;
const RESPONSE_GRID = logspace(RESPONSE_LO_HZ, RESPONSE_HI_HZ, RESPONSE_POINTS);

/** The sweep grid — an impedance measurement, which has no gate. */
const SWEEP_LO_HZ = 10;
const SWEEP_POINTS = 300;
const SWEEP_GRID = logspace(SWEEP_LO_HZ, RESPONSE_HI_HZ, SWEEP_POINTS);

/** Where the constructed dip sits: well under the response grid's floor. */
const DIP_HZ = 80;

/**
 * A driver impedance with a deliberate notch at `DIP_HZ`.
 *
 * Nothing physical is claimed for it — it is a shape chosen so that one
 * frequency below the response floor carries the system minimum, which is the
 * only property this file needs. The notch is a smooth well in log-frequency so
 * the two grids cannot disagree about it for interpolation reasons.
 */
function dippedSweep(baseOhm: number, dipOhm: number): MeasuredSweep {
  const magnitude = SWEEP_GRID.map((f) => {
    const d = Math.log(f / DIP_HZ);
    return baseOhm - (baseOhm - dipOhm) * Math.exp(-((d / 0.25) ** 2));
  });
  return {
    grid: SWEEP_GRID,
    magnitude,
    phaseDeg: SWEEP_GRID.map(() => 0),
    validHz: [SWEEP_GRID[0], SWEEP_GRID[SWEEP_GRID.length - 1]],
  };
}

/** A flat sweep, for the branch that carries nothing interesting. */
function flatSweep(ohm: number): MeasuredSweep {
  return {
    grid: SWEEP_GRID,
    magnitude: SWEEP_GRID.map(() => ohm),
    phaseDeg: SWEEP_GRID.map(() => 0),
    validHz: [SWEEP_GRID[0], SWEEP_GRID[SWEEP_GRID.length - 1]],
  };
}

/** The same sweep sampled onto the RESPONSE grid — what the chain would hold. */
function onResponseGrid(s: MeasuredSweep): Complex[] {
  return RESPONSE_GRID.map((f) => {
    let i = 0;
    for (let k = 1; k < s.grid.length; k++) {
      if (Math.abs(Math.log(s.grid[k] / f)) < Math.abs(Math.log(s.grid[i] / f))) i = k;
    }
    return fromPolar(s.magnitude[i], 0);
  });
}

const SWEEPS: Record<string, MeasuredSweep> = {
  low: dippedSweep(8, 2),
  high: flatSweep(8),
};

/** A minimal two-way: a series coil on the low way, a series cap on the high. */
function parts(): VxpPart[] {
  return [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 0.4, unit: 'mH' },
        { name: 'DCR', value: 0.16, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
    },
    { type: 'Driver', partId: 'D1', model: 'low', params: [], wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }] },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
    {
      type: 'Capacitor',
      partId: 'C1',
      params: [
        { name: 'C', value: 3.3, unit: 'uF' },
        { name: 'ESR', value: 0.02, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
    },
    { type: 'Driver', partId: 'D2', model: 'high', params: [], wires: [{ x: 16, y: 4 }, { x: 16, y: 11 }] },
    { type: 'Ground', params: [], wires: [{ x: 16, y: 11 }] },
  ];
}

const netlist = () =>
  crossoverToNetlist({ name: 'v32-fixture', parts: parts() } as VxpCrossover).netlist;

const responseZ: Record<string, readonly Complex[]> = {
  low: onResponseGrid(SWEEPS.low),
  high: onResponseGrid(SWEEPS.high),
};
/** Two branch responses that cross somewhere sensible — only the ORDER matters. */
const branchDb: Record<string, readonly number[]> = {
  low: RESPONSE_GRID.map((f) => -Math.max(0, 12 * Math.log2(f / 1500))),
  high: RESPONSE_GRID.map((f) => -Math.max(0, 12 * Math.log2(1500 / f))),
};
const validHz: Record<string, [number, number]> = {
  low: [RESPONSE_LO_HZ, RESPONSE_HI_HZ],
  high: [RESPONSE_LO_HZ, RESPONSE_HI_HZ],
};

const reference = (sweeps?: Record<string, MeasuredSweep>) =>
  freezeGateReference({
    netlist: netlist(),
    grid: RESPONSE_GRID,
    driverZ: responseZ,
    branchDb,
    fsHz: {},
    validHz,
    ...(sweeps ? { sweeps } : {}),
  });

const zVerdict = (sweeps: Record<string, MeasuredSweep> | undefined, limit?: number) =>
  evaluateGates(
    netlist(),
    limit === undefined ? {} : { ampMinLoadOhm: limit },
    reference(sweeps),
    'frozen',
  ).verdicts.find((v) => v.gate === 'M-B/|Z|')!;

describe('V32 — an electrical gate judges on the measured sweep', () => {
  it('the impedance reference spans the sweeps, not the response grid', () => {
    const ref = impedanceReferenceFrom(SWEEPS);
    expect(ref).toBeTruthy();
    expect(ref!.grid[0]).toBeCloseTo(SWEEP_LO_HZ, 6);
    expect(ref!.grid[0]).toBeLessThan(RESPONSE_GRID[0]);
    // Both sweeps cover the whole span here, so nothing is extrapolated — the
    // held-flat list is a statement, and an empty one is the good case.
    expect(ref!.heldFlat).toEqual([]);
    expect(ref!.notes).toEqual([]);
  });

  it('the verdict says WHERE it was taken, and it is the sweep', () => {
    const v = zVerdict(SWEEPS);
    expect(String(v.parameters?.judged_on)).toContain('impedance');
    expect(Number(String(v.parameters?.judged_on).split('-')[0])).toBeLessThan(RESPONSE_GRID[0]);
  });

  it('THE FOURTH CLAIM: the dip below the response floor changes the verdict', () => {
    /* Without this the rest of the file would pass for a reference that reports
     * a wider span and keeps reading the old grid. The two readings have to be
     * different NUMBERS, and the difference has to be the constructed dip. */
    const onSweep = zVerdict(SWEEPS);
    const onResponseOnly = evaluateGates(
      netlist(),
      {},
      // The same reference with the sweeps declared as the RESPONSE grid — i.e.
      // exactly what the pre-V32 gate did, reconstructed rather than remembered.
      freezeGateReference({
        netlist: netlist(),
        grid: RESPONSE_GRID,
        driverZ: responseZ,
        branchDb,
        fsHz: {},
        validHz,
        sweeps: {
          low: {
            grid: RESPONSE_GRID,
            magnitude: responseZ.low.map((z) => Math.hypot(z.re, z.im)),
            phaseDeg: RESPONSE_GRID.map(() => 0),
            validHz: [RESPONSE_LO_HZ, RESPONSE_HI_HZ],
          },
          high: {
            grid: RESPONSE_GRID,
            magnitude: responseZ.high.map((z) => Math.hypot(z.re, z.im)),
            phaseDeg: RESPONSE_GRID.map(() => 0),
            validHz: [RESPONSE_LO_HZ, RESPONSE_HI_HZ],
          },
        },
      }),
      'frozen',
    ).verdicts.find((v) => v.gate === 'M-B/|Z|')!;

    expect(onSweep.value).not.toBeNull();
    expect(onResponseOnly.value).not.toBeNull();
    // The sweep sees the dip; the response grid cannot — its floor is above it.
    expect(onSweep.value!).toBeLessThan(onResponseOnly.value!);
    expect(onSweep.parameters?.at).toBeTruthy();
    expect(Number(String(onSweep.parameters!.at).replace(/[^\d.]/g, ''))).toBeLessThan(
      RESPONSE_LO_HZ,
    );

    /* And it FLIPS a gate, which is the whole of V32 on one design: a floor
     * between the two readings passes on the old grid and fails on the sweep.
     * The limit is taken from the two measured values, so no threshold is
     * written here. */
    const between = (onSweep.value! + onResponseOnly.value!) / 2;
    expect(zVerdict(SWEEPS, between).pass).toBe(false);
  });

  it('NO SWEEP, NO VERDICT — and no fallback to the response grid', () => {
    const v = zVerdict(undefined, 4);
    expect(v.active).toBe(true);
    // Not "it passed" and not "it failed": it was not judged.
    expect(v.value).toBeNull();
    expect(v.reason).toContain('NOT JUDGED');
    expect(v.reason).toContain('no measured impedance sweep');
    // The one thing that must NOT be in the sentence is a number taken off the
    // response grid — the leniency V32 withdrew.
    expect(v.parameters?.judged_on).toBeUndefined();
    // Every electrical gate goes quiet together; they share one measurement.
    const all = evaluateGates(netlist(), { maxDissipationFraction: 0.1, minEpdrOhm: 4 }, reference(), 'frozen');
    for (const g of all.verdicts) {
      expect(g.value, `${g.gate} produced a value with no sweep`).toBeNull();
    }
  });

  it('one missing branch is as disqualifying as none, and is named', () => {
    const v = zVerdict({ low: SWEEPS.low }, 4);
    expect(v.value).toBeNull();
    expect(v.reason).toContain('high');
    // The reason has to say WHY one branch is enough to stop the whole verdict.
    expect(v.reason).toContain('whole network');
  });

  it('a branch read outside its own sweep is named, not silently accepted', () => {
    const narrow: Record<string, MeasuredSweep> = {
      low: SWEEPS.low,
      high: {
        ...SWEEPS.high,
        grid: SWEEPS.high.grid.filter((f) => f >= RESPONSE_LO_HZ),
        magnitude: SWEEPS.high.magnitude.filter((_, i) => SWEEPS.high.grid[i] >= RESPONSE_LO_HZ),
        phaseDeg: SWEEPS.high.phaseDeg.filter((_, i) => SWEEPS.high.grid[i] >= RESPONSE_LO_HZ),
        validHz: [RESPONSE_LO_HZ, RESPONSE_HI_HZ],
      },
    };
    const ref = impedanceReferenceFrom(narrow);
    expect(ref!.heldFlat.map((h) => h.model)).toEqual(['high']);
    expect(ref!.heldFlat[0].belowHz).toBeCloseTo(RESPONSE_LO_HZ, 6);
    expect(ref!.notes.join(' ')).toContain('extrapolation');
    // ...and the span still covers the dip, which is the point of the union.
    expect(ref!.grid[0]).toBeLessThan(DIP_HZ);
  });
});
