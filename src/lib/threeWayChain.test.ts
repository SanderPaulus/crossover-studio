import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { fromPolar } from './complex.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import {
  crossover3Variants,
  rankChain3Results,
  runThreeWayChain,
  type Chain3Result,
} from './threeWayChain.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

describe('threeWayChain (phase-4 trede 4c, staged v1)', () => {
  const grid = logspace(210, 19000, 200);
  const gFrd = (raw: string): GriddedResponse => {
    const f = parseFrd(raw);
    return resample(f.freq, f.spl, f.phase, grid);
  };
  const gZ = (raw: string) => {
    const z = parseZma(raw);
    const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
    return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
  };
  const w = gFrd(load('mid_hor0_mettape.txt'));
  const m = gFrd(load('mid_hor0_mettape.txt'));
  const t = gFrd(load('tweet_hor0_mettape.txt'));
  const driverZ = {
    woofer: gZ(load('mid_Backwavecone_sheep75gram.ZMA')),
    mid: gZ(load('mid_Backwavecone_sheep75gram.ZMA')),
    tweeter: gZ(load('tweeter.ZMA')),
  };

  const runOnce = () =>
    runThreeWayChain({
      grid,
      w,
      m,
      t,
      driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: 500,
      xoHigh: 3000,
      label: '500/3000 Hz',
      settings: {
        phasePriority: 0.5,
        synthMode: 'filter',
        band: [250, 18000],
      },
    });

  it('one full chain runs end-to-end and is deterministic', () => {
    const a = runOnce();
    // Real parts, a tuned network, never worse than its own seed.
    expect(a.parts.length).toBeGreaterThan(6);
    expect(a.net.after.rippleDb).toBeLessThanOrEqual(a.net.before.rippleDb + 1e-9);
    expect(a.net.after.xoHz).not.toBeNull();
    // Level trims are cut-only and the specs carry knees NEAR the candidate
    // (the design step refines them inside a ±20% window, and both mid knees
    // are enabled — the bandpass branch).
    expect(a.specs.mid.hp.enabled).toBe(true);
    expect(a.specs.mid.lp.enabled).toBe(true);
    expect(a.specs.mid.hp.freq).toBeGreaterThan(500 / 1.25);
    expect(a.specs.mid.hp.freq).toBeLessThan(500 * 1.25);
    expect(a.specs.mid.lp.freq).toBeGreaterThan(3000 / 1.25);
    expect(a.specs.mid.lp.freq).toBeLessThan(3000 * 1.25);
    // The mid's two knees are the SAME two crossings the outer branches use —
    // a three-way is two handovers, not three independent filters.
    expect(a.specs.woofer.lp.freq).toBe(a.specs.mid.hp.freq);
    expect(a.specs.tweeter.hp.freq).toBe(a.specs.mid.lp.freq);
    for (const spec of [a.specs.woofer, a.specs.mid, a.specs.tweeter]) {
      expect(spec.gainDb).toBeLessThanOrEqual(0);
    }
    const b = runOnce();
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
    expect(a.net.after.rippleDb).toBe(b.net.after.rippleDb);
  }, 600000);

  it('crossover3Variants: 4 unique 2D candidates with real band separation', () => {
    const vs = crossover3Variants(w, m, t);
    expect(vs).toHaveLength(4);
    expect(new Set(vs.map((v) => v.label)).size).toBe(4);
    for (const v of vs) {
      expect(v.xoHigh).toBeGreaterThanOrEqual(v.xoLow * 2.5);
      expect(v.xoLow).toBeGreaterThanOrEqual(250);
      expect(v.xoHigh).toBeLessThanOrEqual(8000);
    }
  });

  it('ranking gates on the amp-load verdict before anything else', () => {
    const mk = (label: string, zOk: boolean, avgDev: number, phase: number, bom: number | null): Chain3Result =>
      ({
        label,
        xoLow: 400,
        xoHigh: 3000,
        specs: {} as Chain3Result['specs'],
        synthWoofer: {} as Chain3Result['synthWoofer'],
        synthMid: {} as Chain3Result['synthMid'],
        synthTweeter: {} as Chain3Result['synthTweeter'],
        parts: [],
        net: { after: { rippleDb: avgDev, avgDevDb: avgDev, phaseDeg: phase } } as Chain3Result['net'],
        bomTotalEur: bom,
        zOk,
        midInverted: false,
        tweeterInverted: false,
        structureLabel: 'LR4 @400 · LR4 @3000',
      }) as Chain3Result;
    // A flatter result that cooks the amp ranks BELOW a healthy one.
    const ranked = rankChain3Results(
      [mk('flat-but-hot', false, 0.2, 2, 300), mk('healthy', true, 0.5, 5, 300)],
      undefined,
      0.5,
    );
    expect(ranked[0].label).toBe('healthy');
    // Among healthy near-equals the cheaper BOM wins.
    const tied = rankChain3Results(
      [mk('a', true, 0.5, 5, 500), mk('b', true, 0.5, 5, 250)],
      undefined,
      0.5,
    );
    expect(tied[0].label).toBe('b');
  });
});
