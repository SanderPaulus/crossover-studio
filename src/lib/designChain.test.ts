import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { fromPolar } from './complex.ts';
import {
  crossoverVariants,
  followupVariantsFor,
  rankChainResults,
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
  it('crossoverVariants: the pinned range is SUBDIVIDED — slices tile it, nothing outside', () => {
    expect(crossoverVariants(undefined)).toEqual([{ label: 'free' }]);
    const v = crossoverVariants([1900, 2300]);
    expect(v).toHaveLength(3);
    // Centres at edge / pin / edge, each with its own ±half-spacing slice.
    expect(v.map((x) => x.label)).toEqual(['1900 Hz', '2100 Hz', '2300 Hz']);
    expect(v[0].xoRange).toEqual([1900, 2000]);
    expect(v[1].xoRange).toEqual([2000, 2200]);
    expect(v[2].xoRange).toEqual([2200, 2300]);
    // NOT windows-within-windows (Sanders correctie): no slice leaves the pin.
    for (const x of v) {
      expect(x.xoRange![0]).toBeGreaterThanOrEqual(1900);
      expect(x.xoRange![1]).toBeLessThanOrEqual(2300);
    }
  });

  it('crossoverVariants: configurable steps — odd, tiling slices, pin centre included', () => {
    const v5 = crossoverVariants([1900, 2300], 5);
    expect(v5).toHaveLength(5);
    expect(v5[2].label).toBe('2100 Hz'); // the pin centre itself is a candidate
    // Slices tile the range EXACTLY: contiguous, inside the pin, full cover.
    expect(v5[0].xoRange![0]).toBe(1900);
    expect(v5[4].xoRange![1]).toBe(2300);
    for (let i = 1; i < v5.length; i++) {
      expect(v5[i].xoRange![0]).toBeCloseTo(v5[i - 1].xoRange![1], 6);
    }
    expect(new Set(v5.map((x) => x.label)).size).toBe(5);
    // Even/odd handling: an even request rounds UP to the next odd count.
    expect(crossoverVariants([1900, 2300], 10)).toHaveLength(11);
    // steps=3 ≡ the default.
    expect(crossoverVariants([1900, 2300], 3)).toEqual(crossoverVariants([1900, 2300]));
  });

  it('followupVariantsFor: two pinned candidates straddling the free crossing', () => {
    const f = followupVariantsFor(2000);
    expect(f).toHaveLength(2);
    // step 12% → centres 1760 and 2240, margin 10% → 200 Hz.
    expect(f[0].xoRange[0]).toBeLessThan(1760);
    expect(f[0].xoRange[1]).toBeGreaterThan(1760);
    expect(f[1].xoRange[0]).toBeLessThan(2240);
    expect(f[1].xoRange[1]).toBeGreaterThan(2240);
    // The free crossing itself sits BETWEEN the two candidate ranges' centres.
    expect(f[0].xoRange[1]).toBeLessThan(f[1].xoRange[0] + 500);
  });

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

  it('rankChainResults: targets met beats a better raw score', () => {
    const mk = (rippleDb: number, phaseDeg: number, label: string, bomTotalEur: number | null = null) =>
      ({ label, bomTotalEur, net: { after: { rippleDb, phaseDeg } } }) as never;
    const targets = { rippleDb: 0.5, phaseDeg: 10 };
    // 0.6/2° scores better blended, but 0.45/8° meets the targets.
    const ranked = rankChainResults([mk(0.6, 2, 'a'), mk(0.45, 8, 'b')], targets, 0.5);
    expect(ranked[0].label).toBe('b');
    // Without targets the blended score decides.
    const free = rankChainResults([mk(0.6, 2, 'a'), mk(0.45, 8, 'b')], undefined, 0.5);
    expect(free[0].label).toBe('a');
  });

  it('rankChainResults: among near-equal winners the cheaper BOM wins', () => {
    const mk = (rippleDb: number, phaseDeg: number, label: string, bomTotalEur: number | null) =>
      ({ label, bomTotalEur, net: { after: { rippleDb, phaseDeg } } }) as never;
    const targets = { rippleDb: 0.5, phaseDeg: 10 };
    // Both meet targets, scores within 5% — €280 beats €610 despite a hair
    // worse score ("caps zo klein mogelijk": equal quality, cheaper wins).
    const tied = rankChainResults(
      [mk(0.4, 4.0, 'duur', 610), mk(0.405, 4.05, 'goedkoop', 280)],
      targets,
      0.5,
    );
    expect(tied[0].label).toBe('goedkoop');
    // A REAL quality gap (>5%) is never traded for money.
    const gap = rankChainResults(
      [mk(0.33, 3.5, 'beter', 610), mk(0.45, 8, 'goedkoop', 280)],
      targets,
      0.5,
    );
    expect(gap[0].label).toBe('beter');
    // Without price data the tiebreak stays out of the way.
    const noPrices = rankChainResults(
      [mk(0.4, 4.0, 'a', null), mk(0.405, 4.05, 'b', null)],
      targets,
      0.5,
    );
    expect(noPrices[0].label).toBe('a');
  });

  it('rankChainResults: among near-equal winners a tweeter-safe crossing wins', () => {
    const mk = (
      rippleDb: number,
      phaseDeg: number,
      xoHz: number,
      label: string,
      bomTotalEur: number | null = null,
    ) => ({ label, bomTotalEur, net: { after: { rippleDb, phaseDeg, xoHz } } }) as never;
    const targets = { rippleDb: 0.5, phaseDeg: 10 };
    const floor = 1800; // 2×Fs
    // 'laag' scores a hair better but crosses BELOW the floor; the near-equal
    // 'veilig' crosses above it → tweeter margin wins.
    const safe = rankChainResults(
      [mk(0.4, 4.0, 1600, 'laag'), mk(0.405, 4.05, 2000, 'veilig')],
      targets,
      0.5,
      floor,
    );
    expect(safe[0].label).toBe('veilig');
    // No floor → the margin tiebreak is inert, the raw score keeps 'laag'.
    const noFloor = rankChainResults(
      [mk(0.4, 4.0, 1600, 'laag'), mk(0.405, 4.05, 2000, 'veilig')],
      targets,
      0.5,
    );
    expect(noFloor[0].label).toBe('laag');
    // Safety beats cost: a safe, pricier tie beats a cheaper below-floor one.
    const vsCost = rankChainResults(
      [mk(0.4, 4.0, 1600, 'laag-goedkoop', 200), mk(0.405, 4.05, 2000, 'veilig-duur', 400)],
      targets,
      0.5,
      floor,
    );
    expect(vsCost[0].label).toBe('veilig-duur');
    // A REAL quality gap (>5%) is never traded for margin.
    const gap = rankChainResults(
      [mk(0.33, 3.5, 1600, 'laag-beter'), mk(0.45, 8, 2000, 'veilig-slecht')],
      targets,
      0.5,
      floor,
    );
    expect(gap[0].label).toBe('laag-beter');
  });
});
