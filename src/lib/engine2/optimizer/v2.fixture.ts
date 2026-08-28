/**
 * The two-way reference case the F2 optimiser tests run on.
 *
 * It lives beside the tests rather than inside one because three of them need
 * it — determinism, the V2 pathology regression and the no-evasion
 * regression — and three copies of a fixture is three chances for them to
 * disagree about what they are testing.
 *
 * Built from the app's own parser fixtures, exactly as `toggleRegression`
 * builds its reference run: real measured responses and real measured
 * impedance, because a gate evaluated on synthetic data would prove that the
 * arithmetic works and nothing about whether the gate bites.
 *
 * Reads from disk, so it is only ever imported from tests; nothing in the
 * app's import graph reaches it and `browserSafe.test.ts` pins that.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromPolar } from '../../complex.ts';
import type { Complex } from '../../complex.ts';
import { logspace, resample, type GriddedResponse } from '../../dsp.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover } from '../../parsers/vxp.ts';
import { freezeGateReference, type GateReference, type MeasuredSweep } from './gates.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'parsers', 'fixtures');
const load = (name: string): string => readFileSync(join(FIXTURES, name), 'utf-8');

/** The grid every F2 optimiser test shares. */
export const V2_GRID: number[] = logspace(210, 19000, 400);

const gridded = (name: string): GriddedResponse => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, V2_GRID);
};

const griddedZ = (name: string): Complex[] => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, V2_GRID, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};

export const v2Responses = () => ({
  wBase: gridded('mid_hor0_mettape.txt'),
  tBase: gridded('tweet_hor0_mettape.txt'),
});

export const v2DriverZ = (): Record<string, Complex[]> => ({
  mid: griddedZ('mid_Backwavecone_sheep75gram.ZMA'),
  tweeter: griddedZ('tweeter.ZMA'),
});

/**
 * V32 — THE MEASURED SWEEPS, on the grids the files themselves carry.
 *
 * Since V32 the electrical gates judge here rather than on `V2_GRID`, and this
 * fixture is the reason that distinction had to be made honestly rather than
 * by giving `evaluateGates` a fallback. `V2_GRID` is 210–19 000 Hz, which is a
 * choice this fixture made for the RESPONSES; the `.zma` files run wider, and
 * an amplifier load is a property of the whole sweep. So the sweeps are handed
 * over unresampled and the gates get the same extent the panel would give them.
 *
 * A fixture MAY declare its own curves to be the measurement — that is what
 * these are. What no caller may do is get a verdict out of a sweep that never
 * arrived, which is why the fallback lives here as a decision rather than
 * inside the gate as a default.
 */
export const v2Sweeps = (): Record<string, MeasuredSweep> => {
  const of = (name: string): MeasuredSweep => {
    const z = parseZma(load(name));
    return {
      grid: z.freq,
      magnitude: z.magnitude,
      phaseDeg: z.phase,
      validHz: [z.freq[0], z.freq[z.freq.length - 1]],
    };
  };
  return { mid: of('mid_Backwavecone_sheep75gram.ZMA'), tweeter: of('tweeter.ZMA') };
};

/**
 * V33 — THE FULL-BAND SAFETY SET, so this fixture can exercise the barrier's
 * `'safety'` source.
 *
 * The app builds a safety set over the drivers' whole measured extent and hands
 * it to the tuner; `worstZOf`, the repair trigger and the delivered verdict
 * have always read it, and since V33 the barrier can too. Here it spans the
 * drivers' own IMPEDANCE extent rather than their response extent, which is a
 * deliberate fixture choice: it makes "the barrier grid lies inside the grid
 * the gate judges on" a property this fixture actually has, and that
 * containment is the thing V33's justification rests on. (On casus 1 the same
 * containment holds for a different reason — the response extent happens to sit
 * inside the impedance extent.)
 *
 * The responses are held flat outside their own measurement, which is what
 * `clampEdges` does and what every safety set in this app does.
 *
 * THE THREE READINGS ON THE SEED, measured rather than described: 3.760 Ω on
 * the evaluation grid, 3.773 Ω on this safety grid, 3.758 Ω on the gate's
 * 1600-point reference. Three numbers, one function, three grids — which is
 * exactly the shape V33 gave the barrier, and small enough differences that
 * what 240 versus 1600 costs has to be MEASURED on a real corpus
 * (`frozenNetlistGates.test.ts`) rather than argued about here.
 */
export const V2_SAFETY_POINTS = 240;

export function v2Safety(points: number = V2_SAFETY_POINTS): {
  freqs: number[];
  w: GriddedResponse;
  t: GriddedResponse;
  z: Record<string, Complex[]>;
} {
  const sweeps = v2Sweeps();
  const models = Object.keys(sweeps);
  const lo = Math.min(...models.map((m) => sweeps[m].validHz[0]));
  const hi = Math.max(...models.map((m) => sweeps[m].validHz[1]));
  const freqs = logspace(lo, hi, points);
  const resp = (name: string): GriddedResponse => {
    const f = parseFrd(load(name));
    return resample(f.freq, f.spl, f.phase, freqs, { clampEdges: true });
  };
  const z: Record<string, Complex[]> = {};
  for (const m of models) {
    const s = sweeps[m];
    const g = resample(s.grid, s.magnitude, s.phaseDeg, freqs, { clampEdges: true });
    z[m] = g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180));
  }
  return { freqs, w: resp('mid_hor0_mettape.txt'), t: resp('tweet_hor0_mettape.txt'), z };
}

/**
 * A two-way seed with the ingredients the V2 pathology needs to be possible:
 * a free SERIES RESISTOR in front of the low branch (the element that drifted
 * to extremes in the casebook), and a shunt L/C across it that can be driven
 * underdamped to buy phase rotation.
 *
 * Deliberately a network the tuner has real work to do on — a seed that is
 * already good proves nothing about what a search does when it is pushed.
 */
export function v2SeedParts(): VxpPart[] {
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

    /* ---- low branch: series R, series L, and a shunt trap ---- */
    {
      type: 'Resistor',
      partId: 'R1',
      params: [{ name: 'R', value: 1.0, unit: 'Ω' }],
      wires: [{ x: 3, y: 4 }, { x: 7, y: 4 }],
    },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 0.4, unit: 'mH' },
        { name: 'DCR', value: 0.16, unit: 'Ω' },
      ],
      wires: [{ x: 7, y: 4 }, { x: 11, y: 4 }],
    },
    {
      type: 'Capacitor',
      partId: 'C2',
      params: [
        { name: 'C', value: 8.0, unit: 'uF' },
        { name: 'ESR', value: 0.02, unit: 'Ω' },
      ],
      wires: [{ x: 11, y: 4 }, { x: 11, y: 8 }],
    },
    {
      type: 'Inductor',
      partId: 'L2',
      params: [
        { name: 'L', value: 0.8, unit: 'mH' },
        { name: 'DCR', value: 0.2, unit: 'Ω' },
      ],
      wires: [{ x: 11, y: 8 }, { x: 11, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 11, y: 11 }] },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      params: [],
      wires: [{ x: 11, y: 4 }, { x: 15, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 15, y: 11 }] },

    /* ---- high branch: series C ---- */
    {
      type: 'Capacitor',
      partId: 'C1',
      params: [
        { name: 'C', value: 2.0, unit: 'uF' },
        { name: 'ESR', value: 0.02, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 19, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D2',
      model: 'tweeter',
      params: [],
      wires: [{ x: 19, y: 4 }, { x: 19, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 19, y: 11 }] },
  ];
}

export const v2Netlist = (parts: readonly VxpPart[]) =>
  crossoverToNetlist({ name: 'v2-fixture', parts: [...parts] } as VxpCrossover).netlist;

/**
 * The frozen gate reference for this fixture.
 *
 * f_s per driver comes from the measured impedance sweeps — the peak of the
 * loaded file, as A4 M-C requires — and the validity bands are the grid the
 * measurements were resampled onto. Nothing here is typed in.
 */
export function v2GateReference(): GateReference {
  const { wBase, tBase } = v2Responses();
  const driverZ = v2DriverZ();
  const fs: Record<string, number> = {};
  for (const [model, z] of Object.entries(driverZ)) {
    let iMax = 0;
    for (let i = 1; i < z.length; i++) {
      if (Math.hypot(z[i].re, z[i].im) > Math.hypot(z[iMax].re, z[iMax].im)) iMax = i;
    }
    fs[model] = V2_GRID[iMax];
  }
  const band: [number, number] = [V2_GRID[0], V2_GRID[V2_GRID.length - 1]];
  return freezeGateReference({
    netlist: v2Netlist(v2SeedParts()),
    grid: V2_GRID,
    driverZ,
    branchDb: { mid: wBase.spl, tweeter: tBase.spl },
    fsHz: fs,
    validHz: { mid: band, tweeter: band },
    sweeps: v2Sweeps(),
  });
}
