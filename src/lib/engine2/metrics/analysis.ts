/**
 * The bridge from "a filter is loaded" to "the metric library can be run".
 *
 * Two jobs, both of which exist so that no metric has to guess:
 *
 *  1. `buildAnalysis` solves the netlist ONCE with internals switched on and
 *     packages node currents, driver transfers and the input impedance
 *     together with the means to re-solve. M-E needs a second solve with a
 *     doubled load; giving it a closure over the same netlist is what stops it
 *     from building its own model of the circuit.
 *
 *  2. `deriveCrossings` finds the ACOUSTIC handovers from the filtered
 *     responses, and `orderDriversLowToHigh` orders the drivers by where their
 *     energy actually is. Both are derived, per P6 — the crossover point is
 *     never a number the user typed and never an index into a list of three.
 */

import type { Complex } from '../../complex.ts';
import { abs as cabsC, mul as cmul } from '../../complex.ts';
import { solveNetwork, type Netlist, type PassiveElement } from '../../network.ts';
import { dbAmp, interpLog } from '../util.ts';
import type { Crossing, NetworkAnalysis } from './types.ts';

/**
 * Solve a netlist and package everything the metric library reads.
 *
 * `driverZ` is keyed by driver MODEL, exactly as the app already keys it, and
 * the model names are the same strings the manifest tags measurements with —
 * that shared vocabulary is what lets a metric hold a driver's measurement and
 * its branch of the circuit at the same time.
 */
export function buildAnalysis(
  netlist: Netlist,
  grid: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
): NetworkAnalysis {
  const sol = solveNetwork(netlist, grid, driverZ, { withInternals: true });
  const source = netlist.elements.find((e) => e.kind === 'source');
  if (!source || source.kind !== 'source') throw new Error('Netlist has no generator.');

  const driverModelById: Record<string, string> = {};
  const transferByModel: Record<string, Complex[]> = {};
  for (const d of sol.drivers) {
    driverModelById[d.id] = d.model;
    // Several elements may share a model (a parallel pair drawn as two parts).
    // The transfer is a VOLTAGE across the same node pair, so the first one is
    // the branch voltage; recording it twice would say nothing new.
    if (!transferByModel[d.model]) transferByModel[d.model] = sol.transfers[d.id];
  }

  const passives = netlist.elements
    .filter((e): e is PassiveElement => e.kind === 'R' || e.kind === 'L' || e.kind === 'C')
    .map((e) => ({ id: e.id, kind: e.kind, value: e.value, seriesR: e.seriesR ?? 0 }));

  return {
    grid: [...grid],
    netlist,
    driverZ,
    generatorVolts: source.volts,
    inputZ: sol.inputZ,
    transferByModel,
    elementCurrent: sol.elementCurrents ?? {},
    passives,
    driverModelById,
    resolveWithLoad: (model, z) => {
      const swapped: Record<string, readonly Complex[]> = { ...driverZ, [model]: z };
      const s = solveNetwork(netlist, grid, swapped);
      const element = sol.drivers.find((d) => d.model === model);
      if (!element) throw new Error(`No driver element uses model "${model}".`);
      return { transfer: s.transfers[element.id] };
    },
  };
}

/** dB magnitude of a complex trace. */
export const traceDb = (h: readonly Complex[]): number[] => h.map((z) => dbAmp(cabsC(z)));

/**
 * The filtered acoustic response of one branch, in dB on `grid`.
 *
 * Measured pressure times the electrical transfer — the same product the
 * simulation shows. Returns null when the measurement does not cover the grid.
 */
export function branchResponseDb(
  grid: readonly number[],
  measuredGrid: readonly number[],
  measuredDb: readonly number[],
  transfer: readonly Complex[] | undefined,
): number[] | null {
  if (!transfer) return null;
  const out = new Array<number>(grid.length);
  for (let i = 0; i < grid.length; i++) {
    const p = interpLog(measuredGrid, measuredDb, grid[i]);
    out[i] = p + dbAmp(cabsC(transfer[i]));
  }
  return out;
}

/** Complex filtered response: measured complex pressure times H. */
export function branchResponseComplex(
  grid: readonly number[],
  measured: readonly Complex[],
  transfer: readonly Complex[],
): Complex[] {
  return grid.map((_, i) => cmul(measured[i], transfer[i]));
}

/**
 * Order drivers low to high by the energy centroid of their filtered response.
 *
 * DERIVED, not declared. A three-way is not "woofer, mid, tweeter" because
 * those are the words someone typed; it is an ordering because that is where
 * the energy is. Works unchanged for two ways, four ways, or a system whose
 * driver ids are `A`, `B`, `C`.
 */
export function orderDriversLowToHigh(
  branches: readonly { driver: string; grid: readonly number[]; db: readonly number[] }[],
): string[] {
  // NB the caller passes the FILTERED branches here, which is the right input
  // once a filter exists: with one loaded, where a way's energy sits is what
  // the filter made it. Without one the report orders on the unclipped bare
  // responses instead (`orderByMeasuredCentroid`).

  const centroid = (b: { grid: readonly number[]; db: readonly number[] }): number => {
    let num = 0;
    let den = 0;
    for (let i = 0; i < b.grid.length; i++) {
      const w = 10 ** (b.db[i] / 10);
      num += w * Math.log(b.grid[i]);
      den += w;
    }
    return den > 0 ? Math.exp(num / den) : Infinity;
  };
  return [...branches]
    .map((b) => ({ driver: b.driver, f: centroid(b) }))
    .sort((a, b) => a.f - b.f)
    .map((b) => b.driver);
}

/**
 * How close two branches have to be, in dB, before the report calls the region
 * an overlap. Reporting only: it widens or narrows the stated overlap band and
 * decides nothing.
 */
const OVERLAP_WITHIN_DB = 10;

/**
 * The acoustic crossings between adjacent branches.
 *
 * A crossing is where the two levels are equal. Two subtleties that a naive
 * "first intersection" gets wrong, and that cost a wrong answer in the app's
 * own history: the curves can touch several times where they ripple against
 * each other, and they can meet far down in each other's stopbands. So the
 * chosen crossing is the equal-level point where the PAIR IS LOUDEST — the
 * intersection that carries the handover, not the one that happens first.
 */
export function deriveCrossings(
  order: readonly string[],
  branches: readonly { driver: string; grid: readonly number[]; db: readonly number[] }[],
): Crossing[] {
  const byDriver = new Map(branches.map((b) => [b.driver, b]));
  const out: Crossing[] = [];
  for (let i = 0; i + 1 < order.length; i++) {
    const lo = byDriver.get(order[i]);
    const hi = byDriver.get(order[i + 1]);
    if (!lo || !hi) continue;
    const grid = lo.grid;
    let bestF: number | null = null;
    let bestLevel = -Infinity;
    let firstOverlap: number | null = null;
    let lastOverlap: number | null = null;
    for (let k = 1; k < grid.length; k++) {
      const d0 = lo.db[k - 1] - hi.db[k - 1];
      const d1 = lo.db[k] - hi.db[k];
      if (Math.abs(d1) < OVERLAP_WITHIN_DB) {
        if (firstOverlap === null) firstOverlap = grid[k];
        lastOverlap = grid[k];
      }
      if (d0 === 0 || d0 * d1 < 0) {
        const t = d0 / (d0 - d1);
        const f = Math.exp(Math.log(grid[k - 1]) + t * (Math.log(grid[k]) - Math.log(grid[k - 1])));
        const level = lo.db[k - 1] + t * (lo.db[k] - lo.db[k - 1]);
        if (level > bestLevel) {
          bestLevel = level;
          bestF = f;
        }
      }
    }
    out.push({
      lower: order[i],
      upper: order[i + 1],
      fHz: bestF ?? NaN,
      overlapHz: firstOverlap !== null && lastOverlap !== null ? [firstOverlap, lastOverlap] : null,
    });
  }
  return out;
}

/**
 * The PASSBAND of one driver, derived from the crossings around it (A4 M-C).
 *
 * The lowest driver has no crossing below it and the highest none above, so
 * their open ends fall back to the validity band they were measured on — which
 * is the honest answer: a woofer's passband really does run down to wherever
 * the measurement stops being believable.
 */
export function passbandOf(
  driver: string,
  crossings: readonly Crossing[],
  fallback: [number, number],
): [number, number] {
  const below = crossings.filter((c) => c.upper === driver && Number.isFinite(c.fHz));
  const above = crossings.filter((c) => c.lower === driver && Number.isFinite(c.fHz));
  const lo = below.length ? Math.max(...below.map((c) => c.fHz)) : fallback[0];
  const hi = above.length ? Math.min(...above.map((c) => c.fHz)) : fallback[1];
  return [Math.max(lo, fallback[0]), Math.min(hi, fallback[1])];
}
