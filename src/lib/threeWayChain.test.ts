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
  variantsFromPoints,
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

  it('anchors are LEVEL-INVARIANT: a hot branch must not move the candidates', () => {
    // The designer sequence, step 2: levels are decided before the crossover
    // is chosen. A raw overlap centre reads the crossing of a loudspeaker
    // that will not exist once the pads are in — a tweeter 8 dB hot reaches
    // level far below any sensible handover, and the scan then searches the
    // wrong neighbourhood (documented; the pin was the workaround). With the
    // anchors reading level-matched responses, adding gain to any one branch
    // must not move the searched candidates beyond numerical dust.
    //
    // A DISTINCT woofer on purpose: the shared w≡m fixture has a CONSTANT
    // level gap after trimming, so "maximum overlap" ties at every grid point
    // and the argmax is decided by floating-point dust — the documented
    // degeneracy of that fixture, not real behaviour. A 12 dB/oct tilt makes
    // the W-M crossing real. Tolerance, not bit-equality: exact invariance is
    // impossible in IEEE once the input itself is v+5.
    const tilt = (r: GriddedResponse, cornerHz: number): GriddedResponse => ({
      ...r,
      spl: r.spl.map((v, i) => v - 12 * Math.max(0, Math.log2(r.freq[i] / cornerHz))),
    });
    const hot = (r: GriddedResponse, db: number): GriddedResponse => ({
      ...r,
      spl: r.spl.map((v) => v + db),
    });
    const wReal = tilt(m, 700);
    const centres = (vs: ReturnType<typeof crossover3Variants>) =>
      vs.map((v) => [v.xoLow, v.xoHigh] as const);
    const base = centres(crossover3Variants(wReal, m, t));
    for (const vs of [
      centres(crossover3Variants(wReal, m, hot(t, 8))),
      centres(crossover3Variants(wReal, hot(m, 5), t)),
    ]) {
      expect(vs.length).toBe(base.length);
      for (let i = 0; i < vs.length; i++) {
        expect(vs[i][0] / base[i][0]).toBeGreaterThan(0.95);
        expect(vs[i][0] / base[i][0]).toBeLessThan(1.05);
        expect(vs[i][1] / base[i][1]).toBeGreaterThan(0.95);
        expect(vs[i][1] / base[i][1]).toBeLessThan(1.05);
      }
    }
  });

  it('every candidate carries a cage that CONTAINS its own centre', () => {
    // Without a cage the tuner drags the acoustic crossing away from the knees
    // the design step chose (measured: 490/3000 designed → 1256/6361 built).
    // A cage that excluded its own centre would be worse than none.
    for (const steps of [1, 2, 3]) {
      const vs = crossover3Variants(w, m, t, undefined, undefined, steps);
      // At most steps², fewer when the xoHigh ≥ 2.5 × xoLow clamp collapses
      // two steps onto one point — those are deduped, never run twice.
      expect(vs.length).toBeGreaterThan(0);
      expect(vs.length).toBeLessThanOrEqual(steps * steps);
      // Labels must stay unique: the scan's progress table is keyed by label,
      // so a duplicate would silently swallow a row.
      expect(new Set(vs.map((v) => v.label)).size).toBe(vs.length);
      for (const v of vs) {
        expect(v.xoLowRange[0]).toBeLessThanOrEqual(v.xoLow);
        expect(v.xoLowRange[1]).toBeGreaterThanOrEqual(v.xoLow);
        expect(v.xoHighRange[0]).toBeLessThanOrEqual(v.xoHigh);
        expect(v.xoHighRange[1]).toBeGreaterThanOrEqual(v.xoHigh);
        // Never a zero-width cage: the xo penalty would become a cliff.
        expect(v.xoLowRange[1]).toBeGreaterThan(v.xoLowRange[0]);
        expect(v.xoHighRange[1]).toBeGreaterThan(v.xoHighRange[0]);
      }
    }
  });

  it('a pinned axis is SUBDIVIDED, not collapsed, and stays inside the pin', () => {
    const vs = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 500, margin: 100 }, high: { freq: 3000, margin: 400 } },
      undefined,
      3,
    );
    expect(vs).toHaveLength(9);
    // Three distinct low centres and three distinct high ones — the pin is a
    // search space that gets tiled, exactly like the two-way scan.
    expect(new Set(vs.map((v) => v.xoLow)).size).toBe(3);
    expect(new Set(vs.map((v) => v.xoHigh)).size).toBe(3);
    for (const v of vs) {
      expect(v.xoLow).toBeGreaterThanOrEqual(399);
      expect(v.xoLow).toBeLessThanOrEqual(601);
      expect(v.xoHigh).toBeGreaterThanOrEqual(2599);
      expect(v.xoHigh).toBeLessThanOrEqual(3401);
    }
  });

  it('a designer pin overrides the sane-territory rails (Sanders: stuck at 7 kHz)', () => {
    // High pinned at 9000 ± 300: the old hard 7000-cap crushed every
    // candidate to 7 kHz. The UI allows pins up to 12 kHz — the pin wins.
    const vs = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 300, margin: 200 }, high: { freq: 9000, margin: 300 } },
      1310,
      3,
    );
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      expect(v.xoHigh).toBeGreaterThanOrEqual(8700);
      expect(v.xoHigh).toBeLessThanOrEqual(9300);
      expect(v.xoHighRange[1]).toBeGreaterThanOrEqual(v.xoHigh);
    }
    // Same on the low axis: a 1800-pin must not be crushed to 1500.
    const lowPinned = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 1800, margin: 100 }, high: { freq: 6000, margin: 300 } },
      undefined,
      2,
    );
    for (const v of lowPinned) {
      expect(v.xoLow).toBeGreaterThanOrEqual(1700);
      expect(v.xoLow).toBeLessThanOrEqual(1900);
    }
    // The FREE scan keeps its classic rails — the caps only yield to a pin.
    const free = crossover3Variants(w, m, t, undefined, undefined, 2);
    for (const v of free) {
      expect(v.xoLow).toBeLessThanOrEqual(1500);
      expect(v.xoHigh).toBeLessThanOrEqual(8000);
    }
  });

  it('a MEASURED M-T ceiling extends the free rail, but never past the onset', () => {
    // A wideband mid measuring its beaming onset at 8.5 kHz: the free scan
    // may explore UP TO that onset (the old 7 kHz rail clipped below it) —
    // but never beyond. Past the measured onset is pin territory: the
    // physics ceiling caps the free search, only the designer may step over.
    const vs = crossover3Variants(w, m, t, undefined, 1310, 3, undefined, {
      floorHz: 1310,
      ceilHz: 8500,
    });
    const highs = vs.map((v) => v.xoHigh);
    expect(Math.max(...highs)).toBeGreaterThan(7000);
    expect(Math.max(...highs)).toBeLessThanOrEqual(8500);
    for (const v of vs) expect(v.xoHighRange[1]).toBeLessThanOrEqual(8500 * 1.01);
    // Without a measured ceiling the classic 7 kHz rail stands.
    const free = crossover3Variants(w, m, t, undefined, 1310, 3);
    for (const v of free) expect(v.xoHigh).toBeLessThanOrEqual(8000);
  });

  it('a pin means EXACTLY what the designer typed (Sanders: "ranges kloppen niet")', () => {
    // 400 ± 200 and 8700 ± 50, 3 steps: the pin CENTRES themselves must run
    // (edge-to-edge log-slicing put the middle on the geometric centre, 346),
    // the margin is the user's own number (the old ≥2%-of-f floor turned
    // ± 50 into ± 174), and the 200 Hz edge is not pulled up to the free-scan
    // 250-floor (the UI input allows 150).
    const vs = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 400, margin: 200 }, high: { freq: 8700, margin: 50 } },
      1310,
      3,
    );
    expect(new Set(vs.map((v) => v.xoLow))).toEqual(new Set([200, 400, 600]));
    expect(new Set(vs.map((v) => v.xoHigh))).toEqual(new Set([8650, 8700, 8750]));
    // Margin 0 still means "exactly there", with the ±2% cage as tune room.
    const exact = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 400, margin: 0 }, high: { freq: 8700, margin: 0 } },
      1310,
      3,
    );
    expect(exact).toHaveLength(1);
    expect(exact[0].xoLow).toBe(400);
    expect(exact[0].xoHigh).toBe(8700);
    expect(exact[0].xoLowRange[0]).toBeLessThan(400);
    expect(exact[0].xoLowRange[1]).toBeGreaterThan(400);
  });

  it('steps=1 collapses to a single candidate that still owns a real cage', () => {
    const vs = crossover3Variants(w, m, t, undefined, undefined, 1);
    expect(vs).toHaveLength(1);
    expect(vs[0].xoLowRange[1]).toBeGreaterThan(vs[0].xoLowRange[0]);
    expect(vs[0].xoHighRange[1]).toBeGreaterThan(vs[0].xoHighRange[0]);
  });

  it('the free W-M axis honours the physics window (2×Fs mid / woofer beaming)', () => {
    const vs = crossover3Variants(w, m, t, undefined, undefined, 3, {
      floorHz: 400,
      ceilHz: 900,
    });
    for (const v of vs) {
      expect(v.xoLow).toBeGreaterThanOrEqual(400);
      expect(v.xoLow).toBeLessThanOrEqual(900);
    }
    // Floor-only: the ceiling falls back to the anchor neighbourhood.
    const floorOnly = crossover3Variants(w, m, t, undefined, undefined, 2, { floorHz: 500 });
    for (const v of floorOnly) expect(v.xoLow).toBeGreaterThanOrEqual(500);
    // Degenerate window (floor above ceiling) falls back to the anchor —
    // never an inverted span.
    const degenerate = crossover3Variants(w, m, t, undefined, undefined, 2, {
      floorHz: 1000,
      ceilHz: 600,
    });
    for (const v of degenerate) {
      expect(v.xoLowRange[1]).toBeGreaterThan(v.xoLowRange[0]);
    }
    // A designer pin still overrides the physics window.
    const pinned = crossover3Variants(
      w,
      m,
      t,
      { low: { freq: 500, margin: 50 } },
      undefined,
      2,
      { floorHz: 700, ceilHz: 1200 },
    );
    for (const v of pinned) {
      expect(v.xoLow).toBeGreaterThanOrEqual(449);
      expect(v.xoLow).toBeLessThanOrEqual(551);
    }
  });

  it('ranking gates on the amp-load verdict before anything else', () => {
    const mk = (
      label: string,
      zOk: boolean,
      avgDev: number,
      phase: number,
      bom: number | null,
      zMinOhm: number | null = 6,
    ): Chain3Result =>
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
        zMinOhm,
        xoWindowOk: null,
        pairOverlapOct: null,
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

  it('variantsFromPoints: tiles at geometric midpoints, held axis gets the whole span, 2.5× rule, tags', () => {
    const vs = variantsFromPoints([300, 400, 600], [2200], [250, 700], [1800, 2500], 'W-M sweep');
    expect(vs.map((v) => v.xoLow)).toEqual([300, 400, 600]);
    expect(vs.every((v) => v.xoHigh === 2200)).toBe(true);
    expect(vs[1].xoLowRange[0]).toBeCloseTo(Math.sqrt(300 * 400), 3);
    expect(vs[1].xoLowRange[1]).toBeCloseTo(Math.sqrt(400 * 600), 3);
    expect(vs[0].xoLowRange[0]).toBe(250);
    expect(vs[2].xoLowRange[1]).toBe(700);
    // The held axis keeps its whole span as cage — it is not being searched.
    expect(vs[0].xoHighRange).toEqual([1800, 2500]);
    expect(vs[0].label).toMatch(/W-M sweep/);
    // xoHigh ≥ 2.5 × xoLow, and duplicates collapse.
    const dup = variantsFromPoints([1000], [2000, 2100], [900, 1100], [1800, 2600]);
    expect(dup).toHaveLength(1);
    expect(dup[0].xoHigh).toBe(2500);
  });

  it('rule 9: the in-room weight lets a flatter POWER response beat a flatter on-axis one', () => {
    const mk = (label: string, avgDev: number, powerStd: number): Chain3Result =>
      ({
        label,
        xoLow: 400,
        xoHigh: 3000,
        specs: {} as Chain3Result['specs'],
        synthWoofer: {} as Chain3Result['synthWoofer'],
        synthMid: {} as Chain3Result['synthMid'],
        synthTweeter: {} as Chain3Result['synthTweeter'],
        parts: [],
        net: {
          after: { rippleDb: avgDev, avgDevDb: avgDev, phaseDeg: 5, powerStdDb: powerStd, zMinOhm: 6 },
        } as Chain3Result['net'],
        bomTotalEur: 300,
        zOk: true,
        zMinOhm: 6,
        xoWindowOk: null,
        pairOverlapOct: null,
        midInverted: false,
        tweeterInverted: false,
        structureLabel: 'x',
      }) as Chain3Result;
    const onAxis = mk('on-axis flat', 0.4, 3.0); // beams at the handover: power steps
    const inRoom = mk('in-room flat', 0.7, 0.8);
    expect(rankChain3Results([onAxis, inRoom], undefined, 0.5)[0].label).toBe('on-axis flat');
    expect(rankChain3Results([onAxis, inRoom], undefined, 0.5, 0)[0].label).toBe('on-axis flat');
    expect(rankChain3Results([onAxis, inRoom], undefined, 0.5, 0.5)[0].label).toBe('in-room flat');
  });

  it('an amp-hostile impedance minimum loses even when every gate stayed green', () => {
    const mk = (
      label: string,
      zOk: boolean,
      avgDev: number,
      phase: number,
      bom: number | null,
      zMinOhm: number | null = 6,
    ): Chain3Result =>
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
        zMinOhm,
        xoWindowOk: null,
        pairOverlapOct: null,
        midInverted: false,
        tweeterInverted: false,
        structureLabel: 'LR4 @400 · LR4 @3000',
      }) as Chain3Result;
    // Sander's case: the tune never WORSENED the dip, so zOk is true — but the
    // delivered load is 2.2 Ohm, under the amplifier floor. A flatter result
    // must not be able to buy that with a tenth of a dB.
    const ranked = rankChain3Results(
      [mk('flat-but-2.2ohm', true, 0.2, 2, 300, 2.2), mk('sane-load', true, 0.5, 5, 300, 3.4)],
      undefined,
      0.5,
    );
    expect(ranked[0].label).toBe('sane-load');
    // A failed tune (zOk false) is still worse than merely sitting low: the
    // first says the numbers cannot be trusted, the second is an honest load.
    const both = rankChain3Results(
      [mk('rejected', false, 0.2, 2, 300, 6), mk('low-but-tuned', true, 0.5, 5, 300, 2.2)],
      undefined,
      0.5,
    );
    expect(both[0].label).toBe('low-but-tuned');
    // Unknown impedance (older results, 2-way-shaped nets) must not be
    // punished for a number nobody measured.
    const unknown = rankChain3Results(
      [mk('known-low', true, 0.2, 2, 300, 2.2), mk('unknown', true, 0.5, 5, 300, null)],
      undefined,
      0.5,
    );
    expect(unknown[0].label).toBe('unknown');
  });

  it('a crossing outside its physics window loses to one inside, however flat', () => {
    // Sander's case: W-M delivered at 1069 Hz with 3.2 octaves of overlap
    // against a measured 629 Hz beaming ceiling — every gate green, targets
    // met, and the ranking had no opinion. Off-axis that is a different
    // loudspeaker (both cones carry the midrange together); a flatter on-axis
    // sum must not be able to buy it.
    const mk = (label: string, xoOk: boolean | null, avgDev: number, phase: number): Chain3Result =>
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
        bomTotalEur: 100,
        zOk: true,
        zMinOhm: 6,
        xoWindowOk: xoOk,
        pairOverlapOct: null,
        midInverted: false,
        tweeterInverted: false,
        structureLabel: 'LR4 @400 · LR4 @3000',
      }) as Chain3Result;
    const ranked = rankChain3Results(
      [mk('flat-outside-window', false, 0.2, 2), mk('inside-window', true, 0.5, 5)],
      undefined,
      0.5,
    );
    expect(ranked[0].label).toBe('inside-window');
    // The amplifier still outranks it: a sane load with a drifted crossing
    // beats a dead short with a perfect one.
    const withZ = rankChain3Results(
      [
        { ...mk('short-but-in-window', true, 0.2, 2), zMinOhm: 1.0 },
        mk('sane-load-outside', false, 0.5, 5),
      ],
      undefined,
      0.5,
    );
    expect(withZ[0].label).toBe('sane-load-outside');
    // Unjudged (no pins, no measured windows) is never punished.
    const unjudged = rankChain3Results(
      [mk('judged-ok', true, 0.5, 5), mk('unjudged', null, 0.6, 6)],
      undefined,
      0.5,
    );
    expect(unjudged[0].label).toBe('judged-ok');
  });
});
