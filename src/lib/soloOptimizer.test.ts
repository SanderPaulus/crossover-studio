import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { fromPolar } from './complex.ts';
import { defaultEq, defaultHpLp, type DriverFilterSpec } from './filters.ts';
import { optimizeSoloFilter, runSoloChain } from './soloOptimizer.ts';

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

describe('runSoloChain (design → synthesis → assembled solo tune)', () => {
  // Real KOAN mid measurement + impedance: the honest end-to-end case.
  const frd = parseFrd(load('mid_hor0_mettape.txt'));
  const d = resample(frd.freq, frd.spl, frd.phase, grid);
  const zma = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
  const zg = resample(zma.freq, zma.magnitude, zma.phase, grid, { clampEdges: true });
  const z = zg.spl.map((m, i) => fromPolar(m, (zg.phaseDeg[i] * Math.PI) / 180));

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
