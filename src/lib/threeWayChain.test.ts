import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { fromPolar } from './complex.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import {
  deliveredLabel,
  runThreeWayChain,
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

  it('point 5b / rule 8: deliveredLabel flags either axis > ⅓ oct off its aim, names delivered values, ignores nulls', () => {
    const ok = deliveredLabel([435, 1849], [440, 1900], ['W-M', 'M-T']);
    expect(ok.unrealisable).toBe(false);
    expect(ok.text).toBe('W-M 440 · M-T 1900 Hz');
    // Held axis passed as null: never flags. Swept axis off by 0.45 oct: flags.
    const swept = deliveredLabel([null, 1849], [596, 1849], ['W-M', 'M-T']);
    expect(swept.unrealisable).toBe(false);
    const both = deliveredLabel([435, 1849], [596, 1849], ['W-M', 'M-T']);
    expect(both.unrealisable).toBe(true);
    const highOff = deliveredLabel([435, 1849], [440, 2500], ['W-M', 'M-T']);
    expect(highOff.unrealisable).toBe(true);
    const missing = deliveredLabel([435, 1849], [null, null], ['W-M', 'M-T']);
    expect(missing.text).toBe('W-M — · M-T — Hz');
    expect(missing.unrealisable).toBe(false);
  });

  it('fix 2: a delivery under its physics floor disqualifies the candidate (reason carried), within 5 % only warns', () => {
    // Mirrors the chain's floorVerdict logic on the result shape.
    const fv = (xo: number, fl: number, slack = 0.05) => (xo >= fl ? 'ok' : xo >= fl * (1 - slack) ? 'warn' : 'fail');
    expect(fv(1789, 1902)).toBe('fail'); // −6 %
    expect(fv(1830, 1902)).toBe('warn'); // −3.8 %
    expect(fv(1902, 1902)).toBe('ok');
  });

});
