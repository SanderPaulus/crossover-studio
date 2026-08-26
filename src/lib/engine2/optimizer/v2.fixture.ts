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
import { freezeGateReference, type GateReference } from './gates.ts';

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
  });
}
