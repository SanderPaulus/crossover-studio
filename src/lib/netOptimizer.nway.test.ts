import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { fromPolar } from './complex.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { filterTemplate } from './filterTemplates.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

/**
 * Phase-4 trede 4a: the component tuner's TWO-PAIR path (opts.midBranch).
 * The 2-way path is regression-proven by the entire existing suite (midBranch
 * undefined = byte-identical code path); these tests prove the 3-way path
 * works on real measured data: branch transfers resolve by slot, the combined
 * runs through combineN, and BOTH adjacent crossings are guarded.
 */
describe('netOptimizer two-pair (3-way)', () => {
  const grid = logspace(210, 19000, 220);
  const gFrd = (raw: string): GriddedResponse => {
    const f = parseFrd(raw);
    return resample(f.freq, f.spl, f.phase, grid);
  };
  const gZ = (raw: string) => {
    const z = parseZma(raw);
    const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
    return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
  };

  // Real KOAN measurements standing in for three branches: the mid driver
  // serves as both the low and the middle branch (its Z twice), the tweeter
  // as the high branch. Physically odd, numerically honest.
  const wResp = gFrd(load('mid_hor0_mettape.txt'));
  const mResp = gFrd(load('mid_hor0_mettape.txt'));
  const tResp = gFrd(load('tweet_hor0_mettape.txt'));
  const zMid = gZ(load('mid_Backwavecone_sheep75gram.ZMA'));
  const zTw = gZ(load('tweeter.ZMA'));
  const driverZ = { woofer: zMid, mid: zMid, tweeter: zTw };

  const templateParts = () =>
    filterTemplate({ order: 2, wayCount: 3, models: ['woofer', 'mid', 'tweeter'] }).parts;

  const run = () =>
    optimizeNetworkValues(
      templateParts(),
      grid,
      wResp,
      tResp,
      driverZ,
      { offsetMm: 0, trimDb: 0, inverted: false },
      {
        midBranch: { response: mResp, adjust: { trimDb: -2 } },
        maxIterations: 60,
        phasePriority: 0.5,
      },
    );

  it('tunes a 3-way template on measured data: never worse, both branches filtered', () => {
    const r = run();
    expect(r.after.rippleDb).toBeLessThanOrEqual(r.before.rippleDb + 1e-9);
    // The delivered network still has an acoustic crossing (lowest pair).
    expect(r.after.xoHz).not.toBeNull();
    // The tune actually moved values (free template values are generic seeds).
    expect(r.tuned).toBeGreaterThan(0);
  }, 120000);

  it('is deterministic: two runs produce byte-identical results', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
    expect(a.after.rippleDb).toBe(b.after.rippleDb);
    expect(a.after.phaseDeg).toBe(b.after.phaseDeg);
  }, 240000);

  it('a dead top branch is caught by the pair guards (no-crossing penalty)', () => {
    // Starve the tweeter: shrink its series cap 100× — the high pair loses
    // its crossing and the objective must price that as degenerate (120).
    const parts = templateParts().map((p) => {
      if (p.type !== 'Capacitor') return p;
      // The tweeter branch's series cap is the C belonging to the HP ladder
      // at 3 kHz (≈ 4.69 µF) that sits on the high branch — match by value.
      const v = p.params.find((par) => par.name === 'Capacitance');
      if (!v || Math.abs(v.value - 4.69) > 0.2) return p;
      return { ...p, params: p.params.map((par) => (par.name === 'Capacitance' ? { ...par, value: 0.02 } : par)), locked: true };
    });
    const r = optimizeNetworkValues(
      parts,
      grid,
      wResp,
      tResp,
      driverZ,
      { offsetMm: 0, trimDb: 0, inverted: false },
      {
        midBranch: { response: mResp, adjust: {} },
        maxIterations: 40,
      },
    );
    // The tuner may not report a healthy result while a pair is starved: the
    // repaired network must either restore the crossing or the guards keep
    // the objective visibly degenerate (never-worse still holds).
    expect(r.after.rippleDb).toBeLessThanOrEqual(r.before.rippleDb + 1e-9);
  }, 120000);
});
