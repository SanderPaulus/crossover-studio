import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';
import { minimizeNetwork } from './minimize.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { setCustomSeries } from './catalog.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');
const grid = logspace(210, 19000, 300);
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

/** 2nd-order LP on the mid, 2nd-order HP on the tweeter with a pad — plus one
 *  REDUNDANT part (a second cap in parallel with the tweeter's series cap). */
function network(): VxpPart[] {
  const P = (x: number, y: number) => ({ x, y });
  return [
    { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }, { name: 'Rg', value: 0.001, unit: 'Ω' }], wires: [P(3, 4), P(3, 11)] },
    { type: 'Ground', params: [], wires: [P(3, 11)] },
    { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.6, unit: 'mH' }], wires: [P(3, 4), P(9, 4)] },
    { type: 'Capacitor', partId: 'C2', params: [{ name: 'C', value: 8.2, unit: 'uF' }], wires: [P(9, 4), P(9, 11)] },
    { type: 'Ground', params: [], wires: [P(9, 11)] },
    { type: 'Driver', partId: 'D1', model: 'mid', inverted: false, params: [], wires: [P(15, 4), P(15, 11)] },
    { type: 'Wire', params: [], wires: [P(9, 4), P(15, 4)] },
    { type: 'Ground', params: [], wires: [P(15, 11)] },
    { type: 'Capacitor', partId: 'C3', params: [{ name: 'C', value: 5.6, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
    { type: 'Wire', params: [], wires: [P(3, 4), P(3, 14)] },
    { type: 'Inductor', partId: 'L4', params: [{ name: 'L', value: 0.33, unit: 'mH' }], wires: [P(9, 14), P(9, 21)] },
    { type: 'Ground', params: [], wires: [P(9, 21)] },
    { type: 'Resistor', partId: 'R5', params: [{ name: 'R', value: 3.3, unit: 'Ω' }], wires: [P(9, 14), P(15, 14)] },
    { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(21, 14), P(21, 21)] },
    { type: 'Wire', params: [], wires: [P(15, 14), P(21, 14)] },
    { type: 'Ground', params: [], wires: [P(21, 21)] },
    // the redundancy: a second cap in PARALLEL with C3 (same two nodes) —
    // exactly one of the two is needed; a free tuner re-purposes any "dead"
    // shunt part it is given, so redundancy is the honest fixture for a
    // removal that must survive a retune.
    { type: 'Capacitor', partId: 'C9', params: [{ name: 'C', value: 1.5, unit: 'uF' }], wires: [P(3, 14), P(9, 14)] },
  ];
}

describe('minimizeNetwork — the afslank-pass (C1–C4)', () => {
  it('sheds the redundant parallel cap (one of C3/C9), keeps the targets at every step, reports every removal and never touches the input', () => {
    const plain = optimizeNetworkValues(network(), grid, wBase, tBase, driverZ, NO_ADJ, { phasePriority: 0.4 });
    const targets = { rippleDb: plain.after.rippleDb * 1.15 + 0.1, phaseDeg: plain.after.phaseDeg * 1.15 + 3 };
    const input = network();
    const snapshot = JSON.stringify(input);
    const r = minimizeNetwork(input, grid, wBase, tBase, driverZ, NO_ADJ, {
      targets,
      rSourceLimitOhm: 1.0,
      tuneOpts: { phasePriority: 0.4 },
      maxRemovals: 3,
      substitute: false,
    });
    expect(JSON.stringify(input)).toBe(snapshot); // nothing applied to the input
    const removedIds = r.steps.filter((s) => s.kind === 'remove').flatMap((s) => s.partIds);
    expect(removedIds.some((id) => id === 'C3' || id === 'C9')).toBe(true);
    expect(r.parts.filter((p) => p.partId === 'C3' || p.partId === 'C9')).toHaveLength(1);
    expect(r.after.peakDb).toBeLessThanOrEqual(targets.rippleDb + 1e-9);
    expect(r.after.phaseDeg).toBeLessThanOrEqual(targets.phaseDeg + 1e-9);
    for (const s of r.steps) {
      expect(s.after.peakDb).toBeLessThanOrEqual(targets.rippleDb + 1e-9);
      expect(s.after.phaseDeg).toBeLessThanOrEqual(targets.phaseDeg + 1e-9);
    }
    // Built-in catalog carries no prices: the report says so instead of guessing.
    expect(r.bomBeforeEur).toBeNull();
    expect(r.steps.every((s) => s.savingEur === null)).toBe(true);
    expect(r.stop.length).toBeGreaterThan(0);
  }, 600_000);

  it('C2: with a priced catalog the substitution pass only accepts cheaper parts that keep targets and source-R, and reports the saving per step', () => {
    const cat = deserializeCatalog(load('gemini-catalog-v6.json'));
    setCustomSeries(cat.series, cat.parts);
    try {
      const plain = optimizeNetworkValues(network(), grid, wBase, tBase, driverZ, NO_ADJ, { phasePriority: 0.4, catalogSnap: true });
      const targets = { rippleDb: plain.after.rippleDb * 1.1 + 0.1, phaseDeg: plain.after.phaseDeg * 1.1 + 3 };
      const r = minimizeNetwork(plain.parts, grid, wBase, tBase, driverZ, NO_ADJ, {
        targets,
        rSourceLimitOhm: 1.0,
        tuneOpts: { phasePriority: 0.4 },
        maxRemovals: 0,
        substitute: true,
      });
      expect(r.bomBeforeEur).not.toBeNull();
      for (const st of r.steps.filter((x) => x.kind === 'substitute')) {
        expect(st.savingEur === null || st.savingEur > 0).toBe(true);
        expect(st.after.peakDb).toBeLessThanOrEqual(targets.rippleDb + 1e-9);
        expect(st.after.phaseDeg).toBeLessThanOrEqual(targets.phaseDeg + 1e-9);
        expect(st.after.rSourceOhm === null || st.after.rSourceOhm <= Math.max(1.0, r.before.rSourceOhm ?? 0) + 1e-6).toBe(true);
      }
      if (r.bomAfterEur !== null && r.bomBeforeEur !== null) expect(r.bomAfterEur).toBeLessThanOrEqual(r.bomBeforeEur + 1e-9);
    } finally {
      setCustomSeries([], []);
    }
  }, 600_000);
});
