import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { fromPolar } from './complex.ts';
import { defaultEq, defaultHpLp, evalDriverFilter, type DriverFilterSpec } from './filters.ts';
import { optimizeSoloFilter, runSoloChain } from './soloOptimizer.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';
import { tidySchematic } from './tidyLayout.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork } from './network.ts';
import type { VxpPart } from './parsers/vxp.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const grid = logspace(210, 19000, 400);

/** Synthetic misbehaving fullranger: flat 85 dB + a +6 dB breakup bump at
 *  3 kHz + a rising tilt above 1 kHz — exactly the FRS8-shaped problem the
 *  solo engine exists for. Deterministic, no fixture needed. */
const bumpyDriver: GriddedResponse = {
  freq: [...grid],
  spl: grid.map((f) => {
    const bump = 6 * Math.exp(-((Math.log2(f / 3000)) ** 2) * 6);
    const tilt = f > 1000 ? 2.2 * Math.log10(f / 1000) : 0;
    return 85 + bump + tilt;
  }),
  phaseDeg: grid.map(() => 0),
};

const cleanSpec = (): DriverFilterSpec => ({
  gainDb: 0,
  hp: defaultHpLp(200),
  lp: defaultHpLp(20000),
  eq: [],
});

describe('optimizeSoloFilter (single-driver design engine)', () => {
  it('flattens a bumpy driver with cut-only EQ within the band budget', () => {
    const r = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), { eqBands: 3 });
    expect(r.after.avgDevDb).toBeLessThan(r.before.avgDevDb * 0.6);
    const bands = r.spec.eq.filter((b) => b.enabled);
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.length).toBeLessThanOrEqual(3);
    // Passive-honest: every band is a cut.
    for (const b of bands) expect(b.gainDb).toBeLessThanOrEqual(0);
    // The user's knees stay untouched — band-limiting is the designer's call.
    expect(r.spec.hp).toEqual(cleanSpec().hp);
    expect(r.spec.lp).toEqual(cleanSpec().lp);
    // Stage report tells the escalation story.
    expect(r.stages.length).toBeGreaterThan(0);
  });

  it('is deterministic: two runs are byte-identical', () => {
    const a = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), { eqBands: 3 });
    const b = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), { eqBands: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('stops escalating once the ripple target is met (trapmethode)', () => {
    const loose = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), {
      eqBands: 6,
      targets: { rippleDb: 4 },
    });
    const tight = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), {
      eqBands: 6,
      targets: { rippleDb: 0.8 },
    });
    const nb = (r: typeof loose) => r.spec.eq.filter((b) => b.enabled).length;
    // A loose target is content sooner — never MORE bands than the tight one.
    expect(nb(loose)).toBeLessThanOrEqual(nb(tight));
    expect(loose.after.ripplePeakDb).toBeLessThanOrEqual(4.05);
  });

  it('adopts user seed bands (clamped to cuts) and never ends worse', () => {
    const seeded: DriverFilterSpec = {
      ...cleanSpec(),
      eq: [{ ...defaultEq(3000, 4, 2), enabled: true }], // a BOOST — must clamp
    };
    const r = optimizeSoloFilter(grid, bumpyDriver, seeded, { eqBands: 2 });
    for (const b of r.spec.eq) expect(b.gainDb).toBeLessThanOrEqual(0);
    expect(r.after.avgDevDb).toBeLessThanOrEqual(r.before.avgDevDb + 1e-9);
  });

  it('never buys flatness by throwing away sensitivity (Sanders 33 Ω run)', () => {
    // A driver whose top octave is DEAD: std-flatness can be "fixed" by
    // attenuating everything below it — which is what the first version did
    // (two low-shelf cuts, 33 Ω series resistor, Response score 0). The
    // sensitivity budget must forbid it.
    const deadTop: GriddedResponse = {
      freq: [...grid],
      spl: grid.map((f) => (f < 9000 ? 88 : 88 - 14 * Math.min(1, Math.log2(f / 9000)))),
      phaseDeg: grid.map(() => 0),
    };
    const r = optimizeSoloFilter(grid, deadTop, cleanSpec(), {
      eqBands: 4,
      band: [300, 19000],
      sensitivityBudgetDb: 6,
    });
    expect(r.sensitivityCostDb).toBeLessThanOrEqual(6.5);
    // The passband must survive: no 14 dB "flattening" of everything.
    const h = evalDriverFilter(r.spec, [1000]);
    const atOneK = 20 * Math.log10(Math.hypot(h[0].re, h[0].im));
    expect(atOneK).toBeGreaterThan(-6.5);
    // And the honest limitation is reported rather than optimised away.
    expect(r.dipLimit).not.toBeNull();
  });

  it('reports the sensitivity cost of the correction it chose', () => {
    const r = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), { eqBands: 3 });
    expect(r.sensitivityCostDb).toBeGreaterThanOrEqual(0);
    expect(r.sensitivityCostDb).toBeLessThanOrEqual(6);
  });

  it('keeps peak bands narrow enough to be notches, not broadband cuts', () => {
    const r = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), { eqBands: 3 });
    for (const b of r.spec.eq.filter((x) => x.enabled && (x.type ?? 'peak') === 'peak')) {
      expect(b.q).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('designs where design is possible when a fullranger dies at the top', () => {
    // Sanders' point: a fullrange driver must be judged over the WHOLE range,
    // so "narrow the view range" is no answer. But a 30 dB cliff cannot be
    // flattened by cutting — only approached by throwing away 30 dB
    // everywhere. So the engine designs the reachable band and keeps scoring
    // the requested one.
    const cliff: GriddedResponse = {
      freq: [...grid],
      spl: grid.map((f) => {
        const bump = 5 * Math.exp(-((Math.log2(f / 2500)) ** 2) * 6);
        const die = f > 9000 ? -30 * Math.min(1, Math.log2(f / 9000)) : 0;
        return 88 + bump + die;
      }),
      phaseDeg: grid.map(() => 0),
    };
    const r = optimizeSoloFilter(grid, cliff, cleanSpec(), {
      eqBands: 4,
      band: [300, 19000],
    });
    // The dead top is out of the design band, the live part is kept.
    expect(r.designBand[1]).toBeLessThan(14000);
    expect(r.designBand[1]).toBeGreaterThan(7000);
    expect(r.designBand[0]).toBeLessThan(400);
    // In-band it does real work…
    expect(r.inBandAfter.ripplePeakDb).toBeLessThan(r.inBandBefore.ripplePeakDb * 0.7);
    // …without spending the passband to chase the cliff…
    expect(r.sensitivityCostDb).toBeLessThanOrEqual(6.5);
    // …and the whole-range score still tells the truth about it.
    expect(r.after.ripplePeakDb).toBeGreaterThan(5);
    expect(r.dipLimit!.hz).toBeGreaterThan(9000);
  });

  it('floor mode: flattens down TO an absolute target level', () => {
    // Sanders' idea: an absolute SPL floor instead of a relative budget. The
    // goal is then well-posed for a cut-only network — everything above the
    // floor gets cut to it, everything below is out of reach — and the floor
    // alone decides how far the correctable band reaches.
    const r = optimizeSoloFilter(grid, bumpyDriver, cleanSpec(), {
      eqBands: 4,
      band: [300, 19000],
      targetLevelDb: 80, // driver sits at ~85–90 dB
    });
    // The correction reaches the target rather than some floating average:
    // the median of the corrected response lands near the floor.
    const h = evalDriverFilter(r.spec, grid);
    const corrected = grid
      .map((f, i) => (f >= 300 && f <= 19000 ? bumpyDriver.spl[i] + 20 * Math.log10(Math.hypot(h[i].re, h[i].im)) : null))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const median = corrected[Math.floor(corrected.length / 2)];
    expect(median).toBeGreaterThan(76);
    expect(median).toBeLessThan(84);
    // A level element is part of the answer — an EQ band cannot move a whole
    // passband to a target level.
    expect(r.spec.gainDb).toBeLessThan(0);
  });

  it('floor mode: a lower floor reaches further up the band', () => {
    // The relationship the designer reasons about: "floor at X → flat up to Y".
    const cliff: GriddedResponse = {
      freq: [...grid],
      spl: grid.map((f) => 90 - (f > 6000 ? 28 * Math.min(1, Math.log2(f / 6000)) : 0)),
      phaseDeg: grid.map(() => 0),
    };
    const high = optimizeSoloFilter(grid, cliff, cleanSpec(), {
      eqBands: 2, band: [300, 19000], targetLevelDb: 86,
    });
    const low = optimizeSoloFilter(grid, cliff, cleanSpec(), {
      eqBands: 2, band: [300, 19000], targetLevelDb: 70,
    });
    expect(low.designBand[1]).toBeGreaterThan(high.designBand[1] * 1.2);
  });

  it('leaves an already-flat driver alone', () => {
    const flat: GriddedResponse = {
      freq: [...grid],
      spl: grid.map(() => 85),
      phaseDeg: grid.map(() => 0),
    };
    const r = optimizeSoloFilter(grid, flat, cleanSpec(), { eqBands: 4 });
    expect(r.spec.eq.filter((b) => b.enabled).length).toBe(0);
    expect(r.after.ripplePeakDb).toBeLessThan(0.05);
  });
});

describe('solo component tuner: sensitivity gate', () => {
  const frd = parseFrd(load('mid_hor0_mettape.txt'));
  const d = resample(frd.freq, frd.spl, frd.phase, grid);
  const zma = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
  const zg = resample(zma.freq, zma.magnitude, zma.phase, grid, { clampEdges: true });
  const z = zg.spl.map((m, i) => fromPolar(m, (zg.phaseDeg[i] * Math.PI) / 180));
  const ghost: GriddedResponse = {
    freq: [...grid],
    spl: grid.map(() => -400),
    phaseDeg: grid.map(() => 0),
  };

  /** Series resistor into the driver: the tuner can "flatten" by cranking it
   *  (attenuation is level-blind to std-flatness). It must not. */
  const padNetwork = (ohms: number): VxpPart[] => [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Resistor',
      partId: 'R1',
      params: [{ name: 'R', value: ohms, unit: 'Ω' }],
      wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      inverted: false,
      params: [],
      wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
  ];

  it('never delivers a network that flattens by attenuating the driver', () => {
    const r = optimizeNetworkValues(
      padNetwork(1),
      grid,
      d,
      ghost,
      { mid: z },
      { offsetMm: 0, trimDb: 0, inverted: false },
      { solo: true, band: [300, 19000] },
    );
    // Either the tuner kept the level, or the gate rejected it outright.
    const rOhms = r.parts.find((p) => p.partId === 'R1')?.params.find((q) => q.name === 'R')?.value;
    expect(rOhms).toBeLessThan(12); // a 33 Ω-style pad must never be the answer
    if (r.safetyNote) expect(r.safetyNote).toMatch(/sensitivity/i);
  });
});

describe('runSoloChain (design → synthesis → assembled solo tune)', () => {
  // Real KOAN mid measurement + impedance: the honest end-to-end case.
  const frd = parseFrd(load('mid_hor0_mettape.txt'));
  const d = resample(frd.freq, frd.spl, frd.phase, grid);
  const zma = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
  const zg = resample(zma.freq, zma.magnitude, zma.phase, grid, { clampEdges: true });
  const z = zg.spl.map((m, i) => fromPolar(m, (zg.phaseDeg[i] * Math.PI) / 180));

  it('never delivers a network that is worse than the raw driver whole-range', () => {
    // Sanders' avg ±5.66 run: the correction improved its own design band and
    // still made the number he is judged by worse than no filter at all. Every
    // never-worse guard until then judged the band it optimised.
    const wholeAvg = (spl: readonly number[]) => {
      const ids = grid.map((f, i) => (f >= 110 && f <= 19000 ? i : -1)).filter((i) => i >= 0);
      const vals = ids.map((i) => spl[i]).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)];
      return ids.reduce((a, i) => a + Math.abs(spl[i] - med), 0) / ids.length;
    };
    // A very low target on a driver with a hard top-end cliff is the recipe:
    // it reaches far, spends a lot of level, and the cliff cannot follow.
    for (const targetLevelDb of [95, 105]) {
      const r = runSoloChain({
        grid, d, z, model: 'mid',
        seed: cleanSpec(),
        settings: { eqBands: 4, band: [110, 19000], targets: { rippleDb: 1.5 }, targetLevelDb },
      });
      const sol = solveNetwork(
        crossoverToNetlist({ name: 'v', parts: r.parts }).netlist, grid, { mid: z });
      const drv = sol.drivers.find((x) => x.model === 'mid')!;
      const h = sol.transfers[drv.id];
      const out = d.spl.map((v, i) => v + 20 * Math.log10(Math.hypot(h[i].re, h[i].im) || 1e-12));
      expect(wholeAvg(out)).toBeLessThanOrEqual(wholeAvg(d.spl) + 0.06);
    }
  });

  it('stays drawable by the tidy auto-placer, even after staged escalation', () => {
    // Sanders' "Tidy layout doet niets": a ripple target the driver cannot
    // reach keeps the staged escalation hunting, and it used to hang a bypass
    // cap across the damping R INSIDE the parallel LCR trap — a 4-member
    // parallel group, which the auto-placer refuses to draw (rightly: it
    // cannot be laid out as a ladder). The bypass move is for lone pad
    // resistors only.
    const r = runSoloChain({
      grid,
      d,
      z,
      model: 'mid',
      seed: cleanSpec(),
      settings: {
        eqBands: 3,
        band: [300, 19000],
        targets: { rippleDb: 0.3 }, // deliberately unreachable → escalation
      },
    });
    expect(tidySchematic(r.parts)).not.toBeNull();
    // No series-path element may end up with three parallel companions.
    const net = crossoverToNetlist({ name: 'solo', parts: r.parts }).netlist;
    const groups = new Map<string, number>();
    for (const e of net.elements) {
      if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
      const k = [...e.nodes].sort((a, b) => a - b).join('-');
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    expect(Math.max(...groups.values())).toBeLessThanOrEqual(3);
  });

  it('produces a solvable single-branch network that improves flatness', () => {
    const r = runSoloChain({
      grid,
      d,
      z,
      model: 'mid',
      seed: cleanSpec(),
      settings: {
        eqBands: 3,
        band: [300, 8000],
      },
    });
    // One generator, exactly one driver (the solo branch), no ghost parts.
    expect(r.parts.filter((p) => p.type === 'Generator')).toHaveLength(1);
    const drivers = r.parts.filter((p) => p.type === 'Driver');
    expect(drivers).toHaveLength(1);
    expect(drivers[0].model).toBe('mid');
    // The assembled tune reports solo semantics: phase is a non-issue.
    expect(r.net.after.phaseDeg).toBe(0);
    // The chain never delivers worse than the raw driver.
    expect(r.net.after.avgDevDb).toBeLessThanOrEqual(r.vf.before.avgDevDb + 1e-9);
    expect(r.net.after.rippleDb).toBeLessThan(r.vf.before.ripplePeakDb + 1e-9);
  });
});
