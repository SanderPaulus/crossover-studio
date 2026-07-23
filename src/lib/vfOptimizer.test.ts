import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { applyTransfer, combine, logspace, resample } from './dsp.ts';
import {
  optimizeVfCluster,
  optimizeVirtualFilters,
  structureOf,
  vfPriorityScore,
  type VfSpecs,
} from './vfOptimizer.ts';
import { defaultHpLp, defaultEq, evalDriverFilter } from './filters.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const grid = logspace(200, 20000, 600);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const woofer = gridded('mid_hor0_mettape.txt');
const tweeter = gridded('tweet_hor0_mettape.txt');

/** Nothing enabled: the optimizer must design entirely on its own. */
const emptySeed: VfSpecs = {
  woofer: { gainDb: 0, hp: defaultHpLp(200), lp: defaultHpLp(2000), eq: [defaultEq(1000), defaultEq(4000)] },
  tweeter: { gainDb: 0, hp: defaultHpLp(2900), lp: defaultHpLp(20000), eq: [defaultEq(6500), defaultEq(10000)] },
};
const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };

describe('optimizeVirtualFilters on KOAN measurements', () => {
  it('designs a working crossover from scratch (no user choices needed)', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ);

    // Massive improvement over the raw drivers on all three axes.
    expect(r.after.responseStdDb).toBeLessThan(1.5);
    expect(r.after.avgPhaseErrDeg).toBeLessThan(15);
    expect(r.after.integrationScore!).toBeGreaterThan(95);
    expect(r.after.responseStdDb).toBeLessThan(r.before.responseStdDb);
    expect(r.after.avgPhaseErrDeg).toBeLessThan(r.before.avgPhaseErrDeg);

    // It made its own structural choices.
    expect(r.specs.woofer.lp.enabled).toBe(true);
    expect(r.specs.tweeter.hp.enabled).toBe(true);
    expect([1, 2, 3, 4]).toContain(r.structure.wooferLpOrder);
    expect([1, 2, 3, 4]).toContain(r.structure.tweeterHpOrder);
    expect(['LR', 'BW', 'BS']).toContain(r.structure.wooferLpKind);
    expect(['LR', 'BW', 'BS']).toContain(r.structure.tweeterHpKind);
    // Crossover frequencies land in the physically sensible region.
    expect(r.specs.woofer.lp.freq).toBeGreaterThan(800);
    expect(r.specs.woofer.lp.freq).toBeLessThan(6000);
    // The hotter tweeter must not be net-boosted — HOW it is tamed (master
    // gain vs EQ cuts vs a higher HP knee) is the optimizer's own business.
    expect(r.specs.tweeter.gainDb).toBeLessThan(1);
  });

  it('the phase-priority setting steers the trade-off (app flow: best of 2 rounds)', () => {
    // Single runs are NM-path-dependent and can land in a poor basin; the
    // app always runs rounds seeded with the best so far. Judge what the
    // user gets. The envelope is deliberately gentle (pw ∈ [0.2, 0.8], since
    // amplitude flatness and phase alignment largely agree), so this asserts
    // DIRECTION + the anchor guard, not exact dB — monotone in both ways.
    const bestOf2 = (phasePriority: number) => {
      const opts = { phasePriority };
      const r1 = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, opts);
      const r2 = optimizeVirtualFilters(
        grid,
        woofer,
        tweeter,
        r1.specs,
        { ...NO_ADJ, inverted: r1.inverted },
        opts,
      );
      return r2.objective < r1.objective ? r2 : r1;
    };
    const respFocus = bestOf2(0.15);
    const phaseFocus = bestOf2(1.0);
    // Phase improves markedly toward the phase end (≈15°→2° on these drivers).
    expect(phaseFocus.after.avgPhaseErrDeg).toBeLessThan(respFocus.after.avgPhaseErrDeg);
    // Amplitude stays anchored at BOTH ends: with the gentle envelope phase
    // costs almost no ripple here (the two goals largely agree), and the phase
    // extreme no longer games the metric (was 4.4 dB ripple before the anchor).
    expect(respFocus.after.responseStdDb).toBeLessThan(1.0);
    expect(phaseFocus.after.responseStdDb).toBeLessThan(1.0);
  });

  it('passive-honest mode never boosts and still designs a working crossover', () => {
    // Seed WITH a boost band: it must not survive as a boost.
    const boostSeed: VfSpecs = JSON.parse(JSON.stringify(emptySeed)) as VfSpecs;
    boostSeed.tweeter.eq[0] = {
      enabled: true,
      type: 'peak',
      freq: 15000,
      gainDb: 5,
      q: 1,
    };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, boostSeed, NO_ADJ, { cutOnly: true });
    for (const side of ['woofer', 'tweeter'] as const) {
      for (const band of r.specs[side].eq) {
        if (band.enabled) expect(band.gainDb).toBeLessThanOrEqual(0);
      }
    }
    // Still a real design — cuts and level freedom are enough for flatness.
    expect(r.after.responseStdDb).toBeLessThan(2);
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });

  it('the breakup guard buys stopband margin beside the crossover', () => {
    const margin = (r: ReturnType<typeof optimizeVirtualFilters>): number => {
      // Worst leakage margin (combined − filtered driver) in the guard zones.
      const wF = applyTransfer(woofer, evalDriverFilter(r.specs.woofer, grid));
      const tF = applyTransfer(tweeter, evalDriverFilter(r.specs.tweeter, grid));
      const c = combine(wF, tF, { ...NO_ADJ, inverted: r.inverted });
      let xi = 1;
      while (xi < grid.length - 1 && wF.spl[xi] - tF.spl[xi] > 0) xi++;
      const xoF = grid[xi];
      let worst = Infinity;
      for (let i = 0; i < grid.length; i++) {
        const f = grid[i];
        if (f >= xoF * 1.6 && f <= xoF * 4) worst = Math.min(worst, c.combinedSpl[i] - wF.spl[i]);
        else if (f >= xoF / 4 && f <= xoF / 1.6) worst = Math.min(worst, c.combinedSpl[i] - tF.spl[i]);
      }
      return worst;
    };
    const guarded = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      breakupGuard: true,
    });
    const free = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ);
    expect(margin(guarded)).toBeGreaterThan(margin(free));
    expect(margin(guarded)).toBeGreaterThan(14); // leakage pushed well down
    // Still a real design.
    expect(guarded.after.integrationScore!).toBeGreaterThan(90);
  });

  it('pins the ACOUSTIC crossing inside the crossover range (not the knees)', () => {
    // The whole point (learned from Sander's screenshot): knees caged at
    // 2200–2600 Hz still produced a real handover at 1.6 kHz — the tweeter
    // is 5–10 dB hotter, so the acoustic crossing sits far below the
    // electrical knee. The constraint must pin where the DRIVERS cross.
    const crossing = (r: ReturnType<typeof optimizeVirtualFilters>): number | null => {
      const wF = applyTransfer(woofer, evalDriverFilter(r.specs.woofer, grid));
      const tF = applyTransfer(tweeter, evalDriverFilter(r.specs.tweeter, grid));
      for (let i = 1; i < grid.length; i++) {
        if (wF.spl[i] - tF.spl[i] <= 0) return grid[i];
      }
      return null;
    };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      xoRange: [2200, 2600],
    });
    const xoF = crossing(r);
    expect(xoF).not.toBeNull();
    expect(xoF!).toBeGreaterThanOrEqual(2200 * 0.97);
    expect(xoF!).toBeLessThanOrEqual(2600 * 1.03);
    // Still a real design inside the cage.
    expect(r.after.responseStdDb).toBeLessThan(2);
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });

  it('drops EQ bands it did not need', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ);
    for (const side of ['woofer', 'tweeter'] as const) {
      for (const band of r.specs[side].eq) {
        if (band.enabled) expect(Math.abs(band.gainDb)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('uses the user design as a starting point but is free to leave it', () => {
    const seeded: VfSpecs = {
      ...emptySeed,
      tweeter: {
        ...emptySeed.tweeter,
        hp: { enabled: true, kind: 'LR', order: 2, freq: 2900 },
      },
    };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, seeded, NO_ADJ);
    // Result quality must not depend on the seed being right.
    expect(r.after.integrationScore!).toBeGreaterThan(95);
    expect(r.after.responseStdDb).toBeLessThan(1.5);
  });
});

describe('configurable EQ band count', () => {
  it('runs with zero EQ bands (pure crossover + level)', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      eqBandsPerDriver: 0,
    });
    expect(r.parameterCount).toBe(3);
    expect(r.specs.woofer.eq).toHaveLength(0);
    expect(r.specs.tweeter.eq).toHaveLength(0);
    // Still a big win over raw — the crossover itself does most of the work.
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });

  it('greedy stage adds only bands that earn their place, within the budget', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      eqBandsPerDriver: 4,
      maxIterations: 400, // keep the test quick; quality not under test here
    });
    // Dimensions = 3 base + 3 per greedy-accepted band — never the full
    // 3 + 6·4 of a blind toolbox. (Post-polish pruning can drop a band, so
    // kept ≤ accepted.)
    const kept = r.bandsUsed.woofer + r.bandsUsed.tweeter;
    expect(r.parameterCount).toBeGreaterThanOrEqual(3 + 3 * kept);
    expect(r.parameterCount).toBeLessThanOrEqual(3 + 6 * 4);
    expect(r.bandsUsed.woofer).toBeLessThanOrEqual(4);
    expect(r.bandsUsed.tweeter).toBeLessThanOrEqual(4);
    expect(r.specs.woofer.eq).toHaveLength(r.bandsUsed.woofer);
    expect(r.specs.tweeter.eq).toHaveLength(r.bandsUsed.tweeter);
    // With a 4-band budget on this data at least one band pays for itself.
    expect(kept).toBeGreaterThan(0);
  });

  it('respects the band budget but is free to move seeded bands anywhere', () => {
    const seeded: VfSpecs = {
      ...emptySeed,
      tweeter: {
        ...emptySeed.tweeter,
        eq: [{ enabled: true, freq: 6500, gainDb: -10, q: 0.5 }],
      },
    };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, seeded, NO_ADJ, {
      eqBandsPerDriver: 1,
    });
    // Budget: at most one band per driver survives.
    expect(r.specs.woofer.eq.length).toBeLessThanOrEqual(1);
    expect(r.specs.tweeter.eq.length).toBeLessThanOrEqual(1);
    // Autonomy: wherever it put the band, it must stay inside the global
    // search bounds — but NOT necessarily near the user's 6.5 kHz seed.
    for (const side of ['woofer', 'tweeter'] as const) {
      for (const band of r.specs[side].eq) {
        expect(band.freq).toBeGreaterThanOrEqual(400);
        expect(band.freq).toBeLessThanOrEqual(16000);
      }
    }
    // And the outcome is still a working design.
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });
});

describe('band budget as a hard cap', () => {
  /** A seed with four tuned tweeter bands, as if left by a previous run. */
  const richSeed: VfSpecs = {
    woofer: {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2400), enabled: true, kind: 'LR', order: 4 },
      eq: [],
    },
    tweeter: {
      gainDb: -5,
      hp: { ...defaultHpLp(3000), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [
        { enabled: true, freq: 5000, gainDb: -4, q: 1.2 },
        { enabled: true, freq: 8000, gainDb: -5, q: 1 },
        { enabled: true, freq: 12000, gainDb: -2.5, q: 2 },
        { enabled: true, freq: 15000, gainDb: -1.5, q: 2 },
      ],
    },
  };

  it('lowering the budget prunes down to it (optimizer picks the victims)', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, richSeed, NO_ADJ, {
      eqBandsPerDriver: 1,
    });
    expect(r.specs.tweeter.eq.length).toBeLessThanOrEqual(1);
    expect(r.specs.woofer.eq.length).toBeLessThanOrEqual(1);
    // Still a working design after losing three bands.
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });

  it('budget 0 strips all bands even when the seed has them', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, richSeed, NO_ADJ, {
      eqBandsPerDriver: 0,
    });
    expect(r.specs.tweeter.eq).toHaveLength(0);
    expect(r.specs.woofer.eq).toHaveLength(0);
  });

  it('within budget the seed still enjoys the monotonicity guard', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, richSeed, NO_ADJ, {
      eqBandsPerDriver: 4,
    });
    // With room for all four bands the result must not be worse than the seed.
    const seedRun = optimizeVirtualFilters(grid, woofer, tweeter, richSeed, NO_ADJ, {
      eqBandsPerDriver: 4,
      maxIterations: 1,
    });
    expect(r.after.responseStdDb).toBeLessThanOrEqual(seedRun.before.responseStdDb + 1e-9);
  });
});

describe('directivity-aware optimisation', () => {
  const angleData = {
    woofer: [0, 15, 30, 45, 60, 75].map((hor) => ({ hor, response: gridded(`mid_hor${hor}_mettape.txt`) })),
    tweeter: [0, 15, 30, 45, 60, 75].map((hor) => ({ hor, response: gridded(`tweet_hor${hor}_mettape.txt`) })),
  };

  it('reports power flatness and the weight steers toward it', () => {
    const onAxisOnly = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      angleData,
      directivityWeight: 0,
    });
    const inRoom = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      angleData,
      directivityWeight: 0.85,
    });
    expect(onAxisOnly.after.powerStdDb).not.toBeNull();
    expect(inRoom.after.powerStdDb).not.toBeNull();
    // Spending the amplitude budget on the energy average must pay off there.
    expect(inRoom.after.powerStdDb!).toBeLessThanOrEqual(onAxisOnly.after.powerStdDb! + 1e-9);
  });

  it('listening-window target optimises the window, not the axis', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      angleData,
      ampTarget: 'listeningWindow',
    });
    // Metric is reported against the window and reaches sane flatness.
    expect(r.after.responseStdDb).toBeLessThan(1.5);
    expect(r.after.integrationScore!).toBeGreaterThan(90);
  });

  it('without angle data the weight is ignored gracefully', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      directivityWeight: 0.9,
      ampTarget: 'listeningWindow',
    });
    expect(r.after.powerStdDb).toBeNull();
    expect(r.after.responseStdDb).toBeLessThan(1.5); // falls back to on-axis
  });
});

describe('shelf bands in the optimizer', () => {
  it('a seeded shelf is adopted, retuned and keeps its type', () => {
    const seeded: VfSpecs = {
      ...emptySeed,
      tweeter: {
        ...emptySeed.tweeter,
        eq: [{ enabled: true, type: 'lowShelf', freq: 9000, gainDb: -5, q: 0.71 }],
      },
    };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, seeded, NO_ADJ, {
      band: [300, 19500],
      phasePriority: 0.4,
      eqBandsPerDriver: 2,
    });
    const shelf = r.specs.tweeter.eq.find((b) => b.type === 'lowShelf');
    expect(shelf).toBeDefined();
    // Retuned, not parroted — and within the search bounds.
    expect(shelf!.freq).toBeGreaterThanOrEqual(1500);
    expect(shelf!.freq).toBeLessThanOrEqual(19500);
    expect(Math.abs(shelf!.gainDb)).toBeGreaterThanOrEqual(0.5);
    // All band types remain valid throughout.
    for (const side of ['woofer', 'tweeter'] as const) {
      for (const b of r.specs[side].eq) {
        expect(['peak', 'lowShelf', 'highShelf', undefined]).toContain(b.type);
      }
    }
  });
});

describe('staged design (trapmethode)', () => {
  it('a met target stops the escalation: structure alone, zero EQ bands', () => {
    // Targets trivially met by the HP/LP structure — the ladder must stop
    // there: fewest components that reach the goal.
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      targets: { rippleDb: 10, phaseDeg: 180 },
    });
    expect(r.bandsUsed.woofer + r.bandsUsed.tweeter).toBe(0);
    expect(r.specs.woofer.eq).toHaveLength(0);
    expect(r.specs.tweeter.eq).toHaveLength(0);
    expect(r.stages.length).toBeGreaterThanOrEqual(1);
    expect(r.stages[0].label).toMatch(/^HP\/LP /);
  });

  it('unreachable targets degrade gracefully to the classic full-budget run', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      targets: { rippleDb: 0.001, phaseDeg: 0.01 },
    });
    // Never met — same quality as an unstaged run, every stage reported.
    expect(r.after.responseStdDb).toBeLessThan(1.5);
    expect(r.after.integrationScore!).toBeGreaterThan(90);
    expect(r.stages.length).toBeGreaterThanOrEqual(1);
  });

  it('met targets beat a lower-objective seed: the guard must not resurrect extra bands', () => {
    // Seed WITH bands that may well score a lower objective; in staged mode
    // a target-meeting result with fewer components must win anyway.
    const seeded: VfSpecs = JSON.parse(JSON.stringify(emptySeed)) as VfSpecs;
    seeded.tweeter.hp = { enabled: true, kind: 'LR', order: 4, freq: 2400 };
    seeded.woofer.lp = { enabled: true, kind: 'LR', order: 4, freq: 2200 };
    seeded.tweeter.eq[0] = { enabled: true, freq: 6500, gainDb: -6, q: 2 };
    const r = optimizeVirtualFilters(grid, woofer, tweeter, seeded, NO_ADJ, {
      targets: { rippleDb: 10, phaseDeg: 180 },
    });
    expect(r.bandsUsed.woofer + r.bandsUsed.tweeter).toBe(0);
  });

  it('the alignment preference is binding: the designer picks the foundation', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      structurePreference: { kind: 'LR', order: 4 },
      targets: { rippleDb: 10, phaseDeg: 180 }, // structure-only, fast
    });
    expect(r.structure.wooferLpKind).toBe('LR');
    expect(r.structure.tweeterHpKind).toBe('LR');
    expect(r.structure.wooferLpOrder).toBe(4);
    expect(r.structure.tweeterHpOrder).toBe(4);
    expect(r.specs.woofer.lp.kind).toBe('LR');
    expect(r.specs.tweeter.hp.kind).toBe('LR');
    // …but the knees, level and polarity remain the optimizer's business.
    expect(r.specs.woofer.lp.freq).toBeGreaterThan(800);
    expect(r.specs.woofer.lp.freq).toBeLessThan(6000);
  });

  it('a Bessel preference designs a working crossover', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      structurePreference: { kind: 'BS', order: 4 },
      targets: { rippleDb: 10, phaseDeg: 180 },
    });
    expect(r.after.integrationScore!).toBeGreaterThan(80);
    expect(r.specs.woofer.lp.enabled).toBe(true);
    expect(r.specs.tweeter.hp.enabled).toBe(true);
  });
});

describe('Fs floor for the HP knee (≥2×Fs rule)', () => {
  it('keeps the tweeter HP knee at or above the floor', () => {
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      hpFloorHz: 3200,
      targets: { rippleDb: 10, phaseDeg: 180 }, // structure-only, fast
    });
    expect(r.specs.tweeter.hp.freq).toBeGreaterThanOrEqual(3200);
  });

  it('the floor (knee-domain) coexists with the crossover point (acoustic domain)', () => {
    // A hot tweeter crosses the mid far below its electrical HP knee, so a
    // knee floor of 3200 Hz and an acoustic handover near 2 kHz can both
    // hold at the same time.
    const r = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      hpFloorHz: 3200,
      xoRange: [1800, 2600],
      targets: { rippleDb: 10, phaseDeg: 180 },
    });
    expect(r.specs.tweeter.hp.freq).toBeGreaterThanOrEqual(3200);
  });
});

describe('acoustic slope targets', () => {
  const slopeBelow = (r: ReturnType<typeof optimizeVirtualFilters>): number | null => {
    // Measured tweeter slope over ~1 octave below the acoustic crossing —
    // the same definition the optimizer steers on.
    const wF = applyTransfer(woofer, evalDriverFilter(r.specs.woofer, grid));
    const tF = applyTransfer(tweeter, evalDriverFilter(r.specs.tweeter, grid));
    let xo: number | null = null;
    for (let i = 1; i < grid.length; i++) {
      if (wF.spl[i] - tF.spl[i] <= 0) {
        xo = grid[i];
        break;
      }
    }
    if (xo === null) return null;
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < grid.length; i++) {
      const f = grid[i];
      if (f < xo / 2.2 || f > xo / 1.15) continue;
      const x = Math.log2(f);
      n++;
      sx += x;
      sy += tF.spl[i];
      sxx += x * x;
      sxy += x * tF.spl[i];
    }
    return n < 4 ? null : (n * sxy - sx * sy) / (n * sxx - sx * sx);
  };

  it('a 30 dB/oct tweeter target steers the MEASURED acoustic slope up', () => {
    const free = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      targets: { rippleDb: 10, phaseDeg: 180 }, // structure-only, fast
    });
    const steered = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      targets: { rippleDb: 10, phaseDeg: 180 },
      acousticSlopes: { tweeter: 30 },
    });
    const sFree = slopeBelow(free);
    const sSteered = slopeBelow(steered);
    expect(sFree).not.toBeNull();
    expect(sSteered).not.toBeNull();
    // The steered run must be meaningfully steeper than the free run, and
    // in the neighbourhood of the ask (shortfall is expensive, overshoot ok).
    expect(Math.abs(sSteered!)).toBeGreaterThan(Math.abs(sFree!) + 3);
    expect(Math.abs(sSteered!)).toBeGreaterThan(22);
  });
});

describe('optimizeVfCluster (priority multi-start)', () => {
  const P = 0.5;

  it('never returns a design worse than the plain setpoint run, and is deterministic', () => {
    // The safe-baseline guarantee: a 5% priority nudge can only find a BETTER
    // basin, never lose ground — the returned design is on the setpoint scale
    // and scores ≤ the single setpoint run at the setpoint yardstick.
    const plain = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      phasePriority: P,
    });
    const cl = optimizeVfCluster(grid, woofer, tweeter, emptySeed, NO_ADJ, { phasePriority: P });

    expect(cl.runs).toBeGreaterThanOrEqual(2); // setpoint + at least one neighbour
    expect(vfPriorityScore(cl.best.after, P)).toBeLessThanOrEqual(
      vfPriorityScore(plain.after, P) + 1e-9,
    );
    // A real, working crossover came out (not a degenerate pick).
    expect(cl.best.after.responseStdDb).toBeLessThan(1.5);
    expect(cl.best.after.avgPhaseErrDeg).toBeLessThan(15);

    // Deterministic (Sanders reproducibility rule): no RNG/wall-clock anywhere.
    const cl2 = optimizeVfCluster(grid, woofer, tweeter, emptySeed, NO_ADJ, { phasePriority: P });
    expect(cl2.best.after.responseStdDb).toBe(cl.best.after.responseStdDb);
    expect(cl2.best.after.avgPhaseErrDeg).toBe(cl.best.after.avgPhaseErrDeg);
    expect(cl2.best.specs.woofer.lp.freq).toBe(cl.best.specs.woofer.lp.freq);
  });

  it('a re-seed round fixes the structure without re-enumerating (speed) and does not regress', () => {
    // Round 1: free enumeration finds the structure.
    const round1 = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      phasePriority: P,
    });
    const fixed = structureOf(round1);
    // A re-seed round pinned to that structure must actually build it…
    const round2 = optimizeVirtualFilters(grid, woofer, tweeter, round1.specs, NO_ADJ, {
      phasePriority: P,
      fixedStructure: fixed,
    });
    expect(round2.structure.wooferLpKind).toBe(fixed.lp.kind);
    expect(round2.structure.wooferLpOrder).toBe(fixed.lp.order);
    expect(round2.structure.tweeterHpKind).toBe(fixed.hp.kind);
    expect(round2.structure.tweeterHpOrder).toBe(fixed.hp.order);
    // …and refining in that basin never scores worse than round 1 at P.
    expect(vfPriorityScore(round2.after, P)).toBeLessThanOrEqual(
      vfPriorityScore(round1.after, P) + 1e-9,
    );
    // fixedStructure can express ASYMMETRIC alignments (LP≠HP), unlike the
    // symmetric user preference — the whole reason it exists.
    const asym = optimizeVirtualFilters(grid, woofer, tweeter, emptySeed, NO_ADJ, {
      phasePriority: P,
      fixedStructure: { lp: { kind: 'BS', order: 4 }, hp: { kind: 'LR', order: 2 } },
    });
    expect(asym.structure.wooferLpKind).toBe('BS');
    expect(asym.structure.wooferLpOrder).toBe(4);
    expect(asym.structure.tweeterHpKind).toBe('LR');
    expect(asym.structure.tweeterHpOrder).toBe(2);
  });

  it('extreme setpoints clamp+dedup to a 2-run cluster', () => {
    const hi = optimizeVfCluster(grid, woofer, tweeter, emptySeed, NO_ADJ, { phasePriority: 1 });
    expect(hi.runs).toBeGreaterThanOrEqual(2);
    // 1.0 and its +5% neighbour dedup to one; only 0.95 and 1.0 remain (plus a
    // possible re-settle), so the cluster stays small at the rail.
    expect(hi.runs).toBeLessThanOrEqual(3);
  });
});
