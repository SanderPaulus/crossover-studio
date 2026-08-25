import { afterEach, describe, expect, it } from 'vitest';
import { nearestParts, setCustomSeries } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { netlistFromSynthesis } from './netlistEdit.ts';
import { solveNetwork } from './network.ts';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nelderMead } from './optimize.ts';
import { synthesize } from './synthesis.ts';
import { parseZma } from './parsers/zma.ts';
import { parseFrd } from './parsers/frd.ts';
import { logspace, resample, wrapDeg} from './dsp.ts';
import { fromPolar, abs } from './complex.ts';
import { defaultHpLp, defaultEq, type DriverFilterSpec } from './filters.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

describe('nelderMead', () => {
  it('minimises Rosenbrock', () => {
    const rosen = (x: readonly number[]) =>
      (1 - x[0]) ** 2 + 100 * (x[1] - x[0] * x[0]) ** 2;
    const r = nelderMead(rosen, [-1.2, 1], { maxIterations: 2000, tolerance: 1e-12 });
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(1, 3);
  });

  it('minimises a shifted quadratic in 4D', () => {
    const f = (x: readonly number[]) => x.reduce((a, v, i) => a + (v - i) ** 2, 0);
    const r = nelderMead(f, [5, 5, 5, 5]);
    for (let i = 0; i < 4; i++) expect(r.x[i]).toBeCloseTo(i, 2);
  });
});

describe('synthesize on measured KOAN impedances', () => {
  const grid = logspace(210, 19000, 300);
  const gridZ = (raw: ReturnType<typeof parseZma>) => {
    const g = resample(raw.freq, raw.magnitude, raw.phase, grid, { clampEdges: true });
    return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
  };
  const twtZ = gridZ(parseZma(load('tweeter.ZMA')));
  const midZ = gridZ(parseZma(load('mid_Backwavecone_sheep75gram.ZMA')));

  const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im));
  const at = (f: number) => grid.findIndex((g) => g >= f);

  it("fits Sander's tweeter target: LR2 HP 2.9k + notch 6.5k −10 dB Q 0.5", () => {
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [{ ...defaultEq(6500, -10, 0.5), enabled: true }],
    };
    const r = synthesize(spec, grid, twtZ);

    // C (HP), L (HP), notch L/C/R, + Fs-trap L/C/R (the tweeter's measured
    // resonance peak sits below the 2.9k corner) = 8 components.
    expect(r.components).toHaveLength(8);
    const trap = r.components.filter((c) => c.role.includes('Fs trap'));
    expect(trap).toHaveLength(3);
    // The trap targets the resonance, well below the crossover corner.
    const trapF = Number(/@(\d+) Hz/.exec(trap[0].role)?.[1]);
    expect(trapF).toBeGreaterThan(300);
    expect(trapF).toBeLessThan(2300);
    for (const c of r.components) expect(c.value).toBeGreaterThan(0);
    // The fit must track the target closely where it matters.
    expect(r.rmsDb).toBeLessThan(1.5);
    expect(r.rmsDeg).toBeLessThan(20);
    // Spot-checks: stopband deep, notch region ~10 dB below the HP-only level.
    expect(db(r.achieved[at(500)])).toBeLessThan(-20);
    expect(db(r.achieved[at(6500)]) - db(r.target[at(6500)])).toBeLessThan(3);
  });

  it('fits an LR4 low-pass at 2 kHz on the mid', () => {
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2000), enabled: true, kind: 'LR', order: 4 },
      eq: [],
    };
    const r = synthesize(spec, grid, midZ);

    expect(r.components).toHaveLength(4); // L C L C ladder
    expect(r.rmsDb).toBeLessThan(1.5);
    expect(r.rmsDeg).toBeLessThan(20);
    // −6 dB at fc (LR property), steep above.
    expect(db(r.achieved[at(2000)])).toBeCloseTo(-6, 0);
    expect(db(r.achieved[at(8000)])).toBeLessThan(-40);
  });

  it('fits a BANDPASS (hp+lp both enabled) on the mid — the 3-way middle branch', () => {
    // Phase-4 trede 3: the middle branch of a 3-way is simply a spec with
    // both knees enabled — deriveTopology cascades the HP ladder into the LP
    // ladder on one series path. Proven here on the measured KOAN mid Z.
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(600), enabled: true, kind: 'LR', order: 2 },
      lp: { ...defaultHpLp(3000), enabled: true, kind: 'LR', order: 2 },
      eq: [],
    };
    const r = synthesize(spec, grid, midZ);

    // C L (HP) + L C (LP) = 4 reactive elements on one branch.
    expect(r.components.filter((c) => c.kind === 'C' || c.kind === 'L')).toHaveLength(4);
    // Sanity, not a quality pin: the KOAN mid's impedance peak sits at
    // ~388 Hz, right inside the 600 Hz HP transition — a bare 2nd-order
    // ladder honestly fits ~2 dB rms there (an Fs trap is the tuner's job).
    expect(r.rmsDb).toBeLessThan(2.5);
    // Passes the band centre (√(600·3000) ≈ 1342 Hz, LR knees cost ~−6 dB
    // each at their corner, so the centre sits near 0 dB), blocks both ends.
    expect(db(r.achieved[at(1342)])).toBeGreaterThan(-3);
    expect(db(r.achieved[at(220)])).toBeLessThan(-15);
    expect(db(r.achieved[at(12000)])).toBeLessThan(-15);
  });

  it('synthesises an L-pad for negative gain', () => {
    const spec: DriverFilterSpec = {
      gainDb: -8,
      hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [],
    };
    const r = synthesize(spec, grid, twtZ);
    // L-pad series + shunt R, plus the Fs-trap R.
    expect(r.components.filter((c) => c.kind === 'R')).toHaveLength(3);
    expect(r.components.filter((c) => c.role.includes('L-pad'))).toHaveLength(2);
    // Passband must sit ≈ 8 dB below unity.
    const iHi = at(12000);
    expect(db(r.achieved[iHi])).toBeGreaterThan(-11);
    expect(db(r.achieved[iHi])).toBeLessThan(-5);
    expect(abs(r.target[iHi])).toBeCloseTo(10 ** (-8 / 20), 1);
  });

  it('realises a stopband cut on an LP4 branch as a mid-ladder shunt trap', () => {
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2000), enabled: true, kind: 'LR', order: 4 },
      eq: [{ ...defaultEq(5500, -8, 2), enabled: true }], // breakup territory
    };
    const r = synthesize(spec, grid, midZ);
    const trap = r.components.filter((c) => c.role.includes('shunt trap'));
    expect(trap).toHaveLength(3); // L, C, R between the ladder sections
    expect(r.rmsDb).toBeLessThan(1.5);
    // The trap must bite: response at 5.5 kHz sits far below the passband.
    expect(db(r.achieved[at(5500)])).toBeLessThan(-20);
  });

  it('the rebuilt schematic is electrically IDENTICAL to the fitted branch', () => {
    // THE invariant behind "Build passive filter": what lands in the editor
    // must be the network the fit optimised. A mid-ladder trap silently
    // re-drawn at the driver node once caused a 10 dB peak — never again.
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2200), enabled: true, kind: 'LR', order: 4 },
      eq: [{ ...defaultEq(5500, -8, 2), enabled: true }],
    };
    const r = synthesize(spec, grid, midZ);
    const sol = solveNetwork(netlistFromSynthesis(r.components, 'mid'), grid, { mid: midZ });
    const rebuilt = sol.transfers['D'];
    for (let i = 0; i < grid.length; i++) {
      expect(Math.abs(db(rebuilt[i]) - db(r.achieved[i]))).toBeLessThan(0.1);
    }
    // ...and the PHASE, which "electrically identical" plainly includes. A
    // rebuild that reproduces the magnitude while rotating the phase would
    // pass the loop above and wreck the sum, since this branch is summed
    // complex with two others.
    for (let i = 0; i < grid.length; i++) {
      const d = Math.abs(
        wrapDeg(
          ((Math.atan2(rebuilt[i].im, rebuilt[i].re) -
            Math.atan2(r.achieved[i].im, r.achieved[i].re)) *
            180) /
            Math.PI,
        ),
      );
      expect(d).toBeLessThan(0.5);
    }
    // ...and the INPUT IMPEDANCE. This test named itself "electrically
    // IDENTICAL" while comparing one transfer, and a whole day (25 aug 2026)
    // went into suspecting the schematic builder of losing 3× the amplifier
    // load — it was cleared by hand-comparing the two netlists element by
    // element, which is exactly the work a test is supposed to have already
    // done. Two networks with the same transfer can present very different
    // loads: move a shunt one node along and the driver still sees the same
    // voltage while the amplifier sees something else entirely.
    let worst = 0;
    for (let i = 0; i < grid.length; i++) {
      const z = sol.inputZ[i];
      const mag = Math.hypot(z.re, z.im);
      if (mag > worst) worst = mag;
    }
    expect(worst).toBeGreaterThan(0); // solvable at all
    const rebuiltMin = Math.min(...sol.inputZ.map((z) => Math.hypot(z.re, z.im)));
    expect(rebuiltMin).toBeGreaterThan(0);
    // The synthesis reports the branch it fitted; the rebuild must agree on
    // the load it presents, not merely on what the driver hears.
    expect(Math.abs(rebuiltMin - r.inputZMinOhm)).toBeLessThan(0.01);
  });

  it('adds a Zobel when the impedance rises through the LP band', () => {
    // Synthetic 6 Ω driver with a heavy voice-coil inductance: |Z| triples by
    // 4×fc — exactly the case that makes a bare series-L droop early.
    const risingZ = grid.map((f) => {
      const x = 2 * Math.PI * f * 0.5e-3;
      return fromPolar(Math.hypot(6, x), Math.atan2(x, 6));
    });
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2000), enabled: true, kind: 'LR', order: 4 },
      eq: [],
    };
    const r = synthesize(spec, grid, risingZ);
    expect(r.components.filter((c) => c.role.includes('Zobel'))).toHaveLength(2);
    expect(r.rmsDb).toBeLessThan(1);
    expect(db(r.achieved[at(2000)])).toBeCloseTo(-6, 0);
  });

  it('catalog-snap lands every part on a purchasable value with its real DCR/ESR', () => {
    // Snap needs an IMPORTED catalog; without one the build keeps continuous
    // values (no snapping to the built-in estimated grid).
    const imp = deserializeCatalog(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v6.json'),
        'utf-8',
      ),
    );
    setCustomSeries(imp.series, imp.parts);
    try {
      const spec: DriverFilterSpec = {
        gainDb: 0,
        hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
        lp: defaultHpLp(20000),
        eq: [{ ...defaultEq(6500, -10, 0.5), enabled: true }],
      };
      const free = synthesize(spec, grid, twtZ);
      const snapped = synthesize(spec, grid, twtZ, { catalogSnap: true });

      for (const c of snapped.components) {
        expect(c.catalogLabel).toBeTruthy();
        if (c.catalogLabel!.includes('2×')) {
          // Stacked: the value is the SUM of two real parts — allowed only
          // where no single part covers it (label spells out the pair).
          expect(c.catalogLabel).toMatch(/2× in (series|parallel)/);
        } else {
          // Single: the chosen value must literally exist in the catalog…
          const hit = nearestParts(c.kind, c.value, 1)[0];
          expect(hit.value).toBeCloseTo(c.value, 12);
        }
        // …and (for L) carry the simulated series resistance.
        if (c.kind === 'L') expect(c.seriesR).toBeGreaterThan(0);
      }
      // Real parts with real DCR cost a bit of fit — but stay in the same league.
      expect(snapped.rmsDb).toBeLessThan(Math.max(free.rmsDb * 2.5, 2));
    } finally {
      setCustomSeries([]);
    }
  });

  it('refuses an empty target', () => {
    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: defaultHpLp(20000),
      eq: [],
    };
    expect(() => synthesize(spec, grid, twtZ)).toThrow(/no active blocks/);
  });
});

describe('acoustic mode & priorities', () => {
  const grid = logspace(210, 19000, 300);
  const gridZ = (raw: ReturnType<typeof parseZma>) => {
    const g = resample(raw.freq, raw.magnitude, raw.phase, grid, { clampEdges: true });
    return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
  };
  const twtZ = gridZ(parseZma(load('tweeter.ZMA')));

  const twtFrdRaw = parseFrd(load('tweet_hor0_mettape.txt'));
  const twtFrd = resample(twtFrdRaw.freq, twtFrdRaw.spl, twtFrdRaw.phase, grid);

  const spec: DriverFilterSpec = {
    gainDb: 0,
    hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
    lp: defaultHpLp(20000),
    eq: [{ ...defaultEq(6500, -10, 0.5), enabled: true }],
  };

  /**
   * Weighted RMS deviation of an acoustic response from the ideal crossover
   * shape (level-fitted) — the metric acoustic mode optimises.
   */
  const rmsVsIdeal = (acousticDb: readonly number[], idealDb: readonly number[]) => {
    const w = idealDb.map((d) => Math.max(10 ** (d / 20), 0.03) ** 2);
    const wSum = w.reduce((a, b) => a + b, 0);
    const dev = acousticDb.map((v, i) => v - idealDb[i]);
    const level = dev.reduce((a, v, i) => a + w[i] * v, 0) / wSum;
    return Math.sqrt(dev.reduce((a, v, i) => a + w[i] * (v - level) ** 2, 0) / wSum);
  };

  it('acoustic mode lands much closer to the ideal acoustic shape than filter mode', () => {
    const filterFit = synthesize(spec, grid, twtZ);
    // Magnitude-centric priority: this test asserts a magnitude property.
    const acousticFit = synthesize(spec, grid, twtZ, {
      mode: 'acoustic',
      driverSplDb: twtFrd.spl,
      phasePriority: 0.25,
      maxIterations: 2000,
    });

    expect(acousticFit.acousticAchievedDb).toBeDefined();
    expect(acousticFit.acousticTargetDb).toBeDefined();

    const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im));
    const filterAcoustic = grid.map((_, i) => twtFrd.spl[i] + db(filterFit.achieved[i]));
    // Ideal shape = HP only (EQ is a tool, not a target); level cancels in the metric.
    const idealDb = acousticFit.acousticTargetDb!;

    const errAcoustic = rmsVsIdeal(acousticFit.acousticAchievedDb!, idealDb);
    const errFilter = rmsVsIdeal(filterAcoustic, idealDb);
    // The whole point of the mode: it bends the filter around the DRIVER's
    // real response (repositioning the notch where it helps most), which
    // blind filter-fitting cannot do. Measured on KOAN data: ≈0.8 vs ≈1.8 dB.
    expect(errAcoustic).toBeLessThan(errFilter * 0.7);
    expect(errAcoustic).toBeLessThan(1.2);
  });

  it('fundamentals: the HP series cap stays near textbook and the tweeter stays protected', () => {
    // Without the role anchor this spec ran to a 100+ µF series cap — a
    // "2nd-order" HP whose pole had silently moved into other parts.
    const spec: DriverFilterSpec = {
      gainDb: -5.8,
      hp: { ...defaultHpLp(4512), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [
        { ...defaultEq(6500, -4, 1.2), enabled: true },
        { ...defaultEq(10000, -3, 1.0), enabled: true },
      ],
    };
    const r = synthesize(spec, grid, twtZ, {
      mode: 'acoustic',
      driverSplDb: twtFrd.spl,
      phasePriority: 0.75,
    });
    const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im) || 1e-9);
    const at = (f: number) => grid.findIndex((g) => g >= f);
    const hpC = r.components.find((c) => c.role === 'HP section 1 series C')!;
    expect(hpC.value).toBeLessThan(25e-6); // textbook ≈ 6.4 µF, ≤ ×3-ish drift
    // Drive floor: at and below knee/3 the tweeter sees ≤ −15 dB.
    expect(db(r.achieved[at(1400)])).toBeLessThan(-15);
    expect(db(r.achieved[at(900)])).toBeLessThan(-15);
  });

  it('acoustic mode may absorb the unit offset but must not drift the branch level', () => {
    // A pad-heavy tweeter spec: level-free fitting once drifted such a branch
    // ~20 dB down (deeper pad is "free" in a shape-only metric) — wrecking
    // the relative branch levels the assembly depends on.
    const spec: DriverFilterSpec = {
      gainDb: -5.8,
      hp: { ...defaultHpLp(4343), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [
        { ...defaultEq(6500, -4, 1.2), enabled: true },
        { ...defaultEq(10000, -3, 1.0), enabled: true },
      ],
    };
    const r = synthesize(spec, grid, twtZ, {
      mode: 'acoustic',
      driverSplDb: twtFrd.spl,
      phasePriority: 0.5,
    });
    const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im) || 1e-9);
    const at = (f: number) => grid.findIndex((g) => g >= f);
    // Electrical passband level must sit near the target's (incl. the −5.8).
    const off = db(r.achieved[at(10000)]) - db(r.target[at(10000)]);
    expect(Math.abs(off)).toBeLessThan(3.5);
  });

  it('converges on a heavy multi-notch tweeter branch (the cut-only optimizer shape)', () => {
    // The shape the passive-honest optimizer actually produces: HP + several
    // deep cuts through the top octave. This used to end "not converged" at
    // ~1.3 dB RMS — the trap + restarts must land it properly.
    const heavy: DriverFilterSpec = {
      gainDb: -2,
      hp: { ...defaultHpLp(4885), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [
        { ...defaultEq(5051, -4.6, 1.41), enabled: true },
        { ...defaultEq(8993, -5.1, 1.0), enabled: true },
        { ...defaultEq(10060, -1.4, 0.98), enabled: true },
      ],
    };
    const r = synthesize(heavy, grid, twtZ, {
      mode: 'acoustic',
      driverSplDb: twtFrd.spl,
      phasePriority: 0.5,
    });
    expect(r.converged).toBe(true);
    // Was ~1.3 dB pre-trap/restarts. The remaining residual at balanced
    // priority is the phase↔magnitude trade; at response-priority 0.15 the
    // same topology reaches ~0.4 dB.
    expect(r.rmsDb).toBeLessThan(1.0);
    // The deliberate ceiling-lowering tool is present (driver top droops).
    expect(r.components.filter((c) => c.role.includes('top-octave hold'))).toHaveLength(2);
  });

  it('phase priority 1 sacrifices magnitude for phase and vice versa', () => {
    const magFit = synthesize(spec, grid, twtZ, { phasePriority: 0.05 });
    const phaseFit = synthesize(spec, grid, twtZ, { phasePriority: 0.95 });
    // Each extreme must beat the other on its own metric.
    expect(magFit.rmsDb).toBeLessThanOrEqual(phaseFit.rmsDb + 1e-9);
    expect(phaseFit.rmsDeg).toBeLessThanOrEqual(magFit.rmsDeg + 1e-9);
  });

  it('acoustic mode without SPL data is rejected', () => {
    expect(() => synthesize(spec, grid, twtZ, { mode: 'acoustic' })).toThrow(/driver SPL/);
  });
});

describe('staged corrections (lean mode) & honest odd-order ladders', () => {
  const grid = logspace(210, 19000, 300);
  const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im));
  const at = (f: number) => grid.findIndex((g) => g >= f);
  // Synthetic 6 Ω driver with heavy voice-coil inductance: |Z| triples by
  // 4×fc — the canonical Zobel case.
  const risingZ = grid.map((f) => {
    const x = 2 * Math.PI * f * 0.5e-3;
    return fromPolar(Math.hypot(6, x), Math.atan2(x, 6));
  });
  const flatZ = grid.map(() => fromPolar(6, 0));
  const lp4: DriverFilterSpec = {
    gainDb: 0,
    hp: defaultHpLp(200),
    lp: { ...defaultHpLp(2000), enabled: true, kind: 'LR', order: 4 },
    eq: [],
  };

  it('lean keeps the bare ladder when it meets the target — no Zobel spent', () => {
    // "Toereikend is variabel": with a generous target the bare 4-element
    // ladder is declared sufficient even though auto mode would add a Zobel.
    const lean = synthesize(lp4, grid, risingZ, { corrections: 'lean', leanTargetDb: 5 });
    expect(lean.components.filter((c) => c.role.includes('Zobel'))).toHaveLength(0);
    expect(lean.components).toHaveLength(4); // L C L C — nothing else
    expect(lean.rmsDb).toBeLessThanOrEqual(5);
    const auto = synthesize(lp4, grid, risingZ);
    expect(auto.components.filter((c) => c.role.includes('Zobel'))).toHaveLength(2);
  });

  it('lean escalates when the bare ladder misses a strict target', () => {
    const strict = synthesize(lp4, grid, risingZ, { corrections: 'lean', leanTargetDb: 0.2 });
    const bare = synthesize(lp4, grid, risingZ, { corrections: 'off' });
    // Escalation must BUY accuracy (≥10% by construction) over the bare fit…
    expect(strict.rmsDb).toBeLessThan(bare.rmsDb);
    // …and the tool it bought is the impedance conditioning.
    expect(strict.components.filter((c) => c.role.includes('Zobel'))).toHaveLength(2);
  });

  it('a 3rd-order target gets its honest 3-element ladder (not a detuned 4th)', () => {
    const bw3: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(2000), enabled: true, kind: 'BW', order: 3 },
      lp: defaultHpLp(20000),
      eq: [],
    };
    const r = synthesize(bw3, grid, flatZ);
    expect(r.components).toHaveLength(3);
    expect(r.components.map((c) => c.kind)).toEqual(['C', 'L', 'C']);
    expect(r.rmsDb).toBeLessThan(0.3); // textbook case on a resistive load
    // 18 dB/oct: two octaves below the knee ≈ −36 dB relative to passband.
    expect(db(r.achieved[at(500)])).toBeLessThan(-30);
  });

  it('a Bessel target synthesises on a measured impedance', () => {
    const raw = parseZma(load('tweeter.ZMA'));
    const g = resample(raw.freq, raw.magnitude, raw.phase, grid, { clampEdges: true });
    const twtZ = g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
    const bs4: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), enabled: true, kind: 'BS', order: 4 },
      lp: defaultHpLp(20000),
      eq: [],
    };
    const r = synthesize(bs4, grid, twtZ);
    expect(r.rmsDb).toBeLessThan(1.2);
    expect(r.rmsDeg).toBeLessThan(20);
  });
});

describe('budget pressure in the discrete snap (priced catalog)', () => {
  afterEach(() => setCustomSeries([]));

  it('with prices, the snap picks a cheaper realization at essentially equal fit', () => {
    const grid = logspace(210, 19000, 300);
    const raw = parseZma(load('tweeter.ZMA'));
    const g = resample(raw.freq, raw.magnitude, raw.phase, grid, { clampEdges: true });
    const twtZ = g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
    const catalog = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'gemini-catalog-v3.json'),
      'utf-8',
    );
    setCustomSeries(deserializeCatalog(catalog).series);

    const spec: DriverFilterSpec = {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 },
      lp: defaultHpLp(20000),
      eq: [{ ...defaultEq(6500, -10, 0.5), enabled: true }],
    };
    const priceOf = (r: ReturnType<typeof synthesize>) =>
      r.components.reduce((a, c) => a + (c.priceEur ?? 0), 0);

    const free = synthesize(spec, grid, twtZ, { catalogSnap: true, costWeight: 0 });
    const thrifty = synthesize(spec, grid, twtZ, { catalogSnap: true });

    // Every snapped part now carries a price (the whole point of the import).
    expect(priceOf(thrifty)).toBeGreaterThan(0);
    // The budget pressure must never SPEND money: at worst the same choice.
    expect(priceOf(thrifty)).toBeLessThanOrEqual(priceOf(free) + 1e-9);
    // …and the fit stays in the same league (tie-breaker, not a quality trade).
    expect(thrifty.rmsDb).toBeLessThan(Math.max(free.rmsDb * 1.1, free.rmsDb + 0.1));
  });
});
