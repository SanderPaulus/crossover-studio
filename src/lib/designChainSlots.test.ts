import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar, type Complex } from './complex.ts';
import { defaultHpLp, defaultEq } from './filters.ts';
import { withSlotAliases } from './driverSlots.ts';
import { runDesignChain, type ChainSettings } from './designChain.ts';

/**
 * Regression: a project loaded from a .vxp keys its impedances by MODEL name
 * ("Woofer 12w8524"/"Tweeter r2604-83200"), but synthesis + the design chain
 * address driverZ.mid / driverZ.tweeter. Before the fix that left driverZ.mid
 * undefined and "Optimize — design for me" crashed with
 * "Cannot read properties of undefined (reading '<xo grid index>')".
 * `withSlotAliases` (applied at the App boundary) is what makes it resolve.
 */
const FIX = join(dirname(fileURLToPath(import.meta.url)), 'parsers/fixtures');
const load = (n: string) => readFileSync(join(FIX, n), 'utf-8');

describe('design chain with model-keyed impedances (vxp load)', () => {
  const wf = parseFrd(load('mid_hor0_mettape.txt'));
  const tw = parseFrd(load('tweet_hor0_mettape.txt'));
  const wZ = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
  const tZ = parseZma(load('tweeter.ZMA'));
  const grid = logspace(
    Math.max(200, wf.freq[0], tw.freq[0]),
    Math.min(20000, wf.freq.at(-1)!, tw.freq.at(-1)!),
    600,
  );
  const w = resample(wf.freq, wf.spl, wf.phase, grid);
  const t = resample(tw.freq, tw.spl, tw.phase, grid);
  const toZ = (z: ReturnType<typeof parseZma>): Complex[] => {
    const g = resample(z.freq, z.magnitude, z.phase, [...grid], { clampEdges: true });
    return g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180));
  };
  // Keyed by MODEL NAME, exactly as a vxp/project load produces.
  const modelKeyed: Record<string, Complex[]> = {
    'Woofer 12w8524': toZ(wZ),
    'Tweeter r2604-83200': toZ(tZ),
  };
  const seed = {
    woofer: { gainDb: 0, hp: defaultHpLp(200), lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const }, eq: [defaultEq(1000, 0, 1)] },
    tweeter: { gainDb: 0, hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const }, lp: defaultHpLp(20000), eq: [defaultEq(6500, -10, 0.5)] },
  };
  const settings: ChainSettings = {
    phasePriority: 0.5,
    eqBandsPerDriver: 1,
    cutOnly: false,
    breakupGuard: true,
    band: [Math.max(300, grid[0]), Math.min(grid[grid.length - 1] * 0.975, 20000)],
    synthMode: 'acoustic',
    maxRounds: 1,
  };
  const adjust = { offsetMm: 0, trimDb: 0, inverted: false };
  const run = (driverZ: Record<string, Complex[]>) =>
    runDesignChain({ grid: [...grid], w, t, driverZ, adjust, seed, settings, xoRange: undefined }, 'x');

  it('crashes on raw model-keyed impedances (documents the bug)', () => {
    expect(() => run(modelKeyed)).toThrow();
  });

  it('runs once the App aliases model keys to mid/tweeter slots', () => {
    const r = run(withSlotAliases(modelKeyed));
    expect(r.parts.length).toBeGreaterThan(0);
    expect(Number.isFinite(r.net.after.rippleDb)).toBe(true);
    expect(Number.isFinite(r.net.after.phaseDeg)).toBe(true);
  });
});
