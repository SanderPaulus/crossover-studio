import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import {
  runDesignChain,
} from './designChain.ts';
import { defaultHpLp, defaultEq } from './filters.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');
// Modest grid: the chain smoke test must stay fast, the full 600-point scan
// lives in the app flow.
const grid = logspace(400, 19000, 240);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const w = gridded('mid_hor0_mettape.txt');
const t = gridded('tweet_hor0_mettape.txt');
const gridZ = (name: string) => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const driverZ = { mid: gridZ('mid_Backwavecone_sheep75gram.ZMA'), tweeter: gridZ('tweeter.ZMA') };

const seed = () => ({
  woofer: {
    gainDb: 0,
    hp: defaultHpLp(200),
    lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
    eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
  },
  tweeter: {
    gainDb: 0,
    hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
    lp: defaultHpLp(20000),
    eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
  },
});

describe('designChain', () => {
  it('one full chain runs end-to-end and is deterministic', { timeout: 120000 }, () => {
    const input = {
      grid,
      w,
      t,
      driverZ,
      adjust: { offsetMm: 0, trimDb: 0, inverted: false },
      seed: seed(),
      settings: {
        phasePriority: 0.5,
        eqBandsPerDriver: 1,
        band: [400, 18500] as [number, number],
        synthMode: 'acoustic' as const,
        maxRounds: 2,
      },
    };
    const a = runDesignChain(input, 'smoke');
    // A real, tuned network came out the other end…
    expect(a.parts.length).toBeGreaterThan(4);
    expect(a.net.after.rippleDb).toBeLessThan(4);
    expect(a.rounds).toBeGreaterThanOrEqual(1);
    // …and the whole chain is deterministic (Sanders reproducibility rule).
    const b = runDesignChain({ ...input, seed: seed() }, 'smoke');
    expect(b.net.after.rippleDb).toBe(a.net.after.rippleDb);
    expect(b.net.after.phaseDeg).toBe(a.net.after.phaseDeg);
  });

});
