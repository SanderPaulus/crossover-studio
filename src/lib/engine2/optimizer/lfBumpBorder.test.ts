/**
 * F4b2 ACCEPTANCE — the FOURTH gap on the v2/v1 border.
 *
 * V23 recorded it as bijvangst and left it measured: `BudgetWay` carried no
 * near field and no impedance sweep on the worker route, so `lfBumpBudgetDb`
 * could never reach a bound however loudly it was stated. Two of the four
 * A5d.6 inversions were dead on that route — the audit's §3 said three of four
 * reached the search, and that had been wrong since F2.
 *
 * WHAT THIS FILE PINS, and the third item is the one that cost the session its
 * first wrong answer:
 *
 *  1. The bound is REACHED now, through the real route.
 *  2. It is the SAME bound the report route produces — one inversion, one set
 *     of inputs, both sides of the border.
 *  3. It is NOT reached from the chain's analysis grid, and that is deliberate.
 *     M-D evaluates over [0.7·f_p, 2.2·f_p]; on casus 1's woofer that is
 *     36.7–115.2 Hz, while the chain grid starts at the far-field span (200 Hz
 *     and up in the running app). Inverting there does not refuse — it reads no
 *     lift at any inductance, doubles its bracket to the limit and returns
 *     1 048 576 mH. A thousand henries offered as a search bound is worse than
 *     no bound, and the sweep crosses precisely so that cannot happen.
 *  4. Missing input produces NO bound and says which input was missing.
 *
 * `pathROhm` differs between the routes ON PURPOSE — the report has no network
 * and passes 0, the worker knows the seed and passes its real series
 * resistance. So the comparison feeds BOTH sides the reference's own
 * `pad_R_ohm` from the fixture, rather than whatever each route would produce.
 */

import { describe, expect, it } from 'vitest';
import {
  invertBudgets,
  maxSeriesInductanceFromBump,
  searchBoxFor,
  type BudgetWay,
} from './bounds.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import { factsForWorker, measurementFactsKey } from './measurementFacts.ts';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './worker.ts';
import { v2DriverZ, v2Responses, V2_GRID } from './v2.fixture.ts';
import { defaultHpLp } from '../../filters.ts';
import { H_PER_MH } from '../constants.ts';
import { logspace, resampleImpedance } from '../../dsp.ts';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from '../casus1.fixture.ts';
import { buildReport } from '../report.ts';
import { runIngest } from '../ingest/derive.ts';
import { ctcKey } from '../metrics/types.ts';
import type { Complex } from '../../complex.ts';

const golden = loadGolden();
const TOL = golden.toleranties;
const REF = golden.grens_inversies;
const P = REF.parameters.maxL_bult;

const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const filter = casus1Filter('HUIDIG', manifest, files, golden);

const report = buildReport({
  manifest,
  files,
  filter,
  geometry,
  settings: {
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    lfBumpBudgetDb: P.budget_dB,
  },
});
const identity = Object.fromEntries(report.ingest.drivers.map((d) => [d.driver, d.driver]));
const sweeps = Object.fromEntries(
  Object.entries(filter.driverZ).map(([m, z]) => [
    m,
    { freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phaseDeg },
  ]),
);

/* ================================================================== *
 * 1 + 2 — one inversion, one set of inputs, both sides
 * ================================================================== */

describe('F4b2 — the LF-lift bound is the same on both routes', () => {
  const ingest = runIngest(manifest, files);
  const woofer = ingest.drivers.find((d) => d.driver === 'woofer')!;
  const facts = factsForWorker(report, identity, sweeps);

  /** A way built the way each route builds it, differing only where they must. */
  const wayFrom = (
    nearField: BudgetWay['nearField'],
    impedance: BudgetWay['impedance'],
  ): BudgetWay => ({
    driver: 'woofer',
    lowest: true,
    highPassProtected: false,
    reOhm: null,
    reSource: 'not under test here',
    zPassbandMedianOhm: null,
    passbandHz: null,
    fsHz: woofer.impedance!.fundamentalHz!,
    fPeakHz: woofer.impedance!.fundamentalHz!,
    gapBudgetDb: null,
    // BOTH sides get the reference's own path resistance. The route difference
    // is real and stays; it is simply not what this comparison is about.
    pathROhm: P.pad_R_ohm,
    nearField,
    impedance,
  });

  const toComplex = (m: readonly number[], ph: readonly number[]): Complex[] =>
    m.map((mag, i) => {
      const r = (ph[i] * Math.PI) / 180;
      return { re: mag * Math.cos(r), im: mag * Math.sin(r) };
    });

  it('the payload carries a near field, a sweep and the resonance for the woofer', () => {
    expect(facts.nearFieldByModel?.woofer).toBeTruthy();
    expect(facts.impedanceByModel?.woofer).toBeTruthy();
    // f_p crosses as a FACT: M-D derives its whole band from it, and the
    // worker's own curve does not reach a woofer's resonance.
    expect(facts.fundamentalHzByModel?.woofer).toBeCloseTo(P.f_p_hz, 1);
    // The sweep crosses on its OWN grid, which reaches below the M-D band.
    const band: [number, number] = [0.7 * woofer.impedance!.fundamentalHz!, 2.2 * woofer.impedance!.fundamentalHz!];
    expect(facts.impedanceByModel!.woofer.grid[0]).toBeLessThan(band[0]);
    // ...and the near field's validity travels with it (F4b leak 2's shape).
    expect(facts.nearFieldByModel!.woofer.validHz[1]).toBeGreaterThan(band[1]);
  });

  it('report inputs and payload inputs invert to the SAME bound', () => {
    const nfR = { grid: woofer.nearField!.grid, db: woofer.nearField!.db, validHz: woofer.nearField!.bandHz };
    const zR = { grid: filter.driverZ.woofer.freq, z: toComplex(filter.driverZ.woofer.magnitude, filter.driverZ.woofer.phaseDeg) };

    const nfW = facts.nearFieldByModel!.woofer;
    const zW = facts.impedanceByModel!.woofer;

    const fromReport = invertBudgets([wayFrom(nfR, zR)], { lfBumpBudgetDb: P.budget_dB });
    const fromPayload = invertBudgets(
      [wayFrom({ grid: nfW.grid, db: nfW.db, validHz: nfW.validHz }, { grid: zW.grid, z: toComplex(zW.magnitude, zW.phaseDeg) })],
      { lfBumpBudgetDb: P.budget_dB },
    );

    const a = fromReport.bounds.find((b) => b.rule === 'bump-series-l');
    const b = fromPayload.bounds.find((b) => b.rule === 'bump-series-l');
    expect(a, 'the report-side inversion produced no bound').toBeTruthy();
    expect(b, 'the payload-side inversion produced no bound').toBeTruthy();
    expect(b!.maxSI).toBeCloseTo(a!.maxSI, 12);
  });

  it('and that bound IS the class-A reference, within its own tolerance class', () => {
    /* The reference asserts on the METRIC, not on the millihenry — an inverted
     * bound inherits the tolerance of the metric it inverts (F4a, and the
     * reference file says so in `parameters.maxL_bult.assert`). So: at the
     * stored inductance, the lift the payload's own curves produce must be the
     * budget, within the dB class. */
    const zW = facts.impedanceByModel!.woofer;
    const nfW = facts.nearFieldByModel!.woofer;
    const z = toComplex(zW.magnitude, zW.phaseDeg);
    const solved = maxSeriesInductanceFromBump(
      {
        nfGrid: nfW.grid,
        nfDb: nfW.db,
        zGrid: zW.grid,
        z,
        fPeakHz: woofer.impedance!.fundamentalHz!,
        nfValidHz: nfW.validHz,
        pathROhm: P.pad_R_ohm,
      },
      P.budget_dB,
    );
    expect(solved).not.toBeNull();
    expect(Math.abs(solved!.atBudgetDb - P.budget_dB)).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(solved!.maxHenry / H_PER_MH - REF.maxL_bij_Rs0_5_budget2_5dB_mH)).toBeLessThan(0.01);
  });

  it('the CHAIN grid cannot carry this inversion, and fails loudly rather than quietly', () => {
    /* The measurement that decided the payload's shape. The chain's analysis
     * grid starts at the far-field span; M-D evaluates an octave and a half
     * below it. The inversion does not refuse — it returns a thousand henries. */
    const chainGrid = logspace(200, 20000, 600);
    const raw = filter.driverZ.woofer;
    const onChain = resampleImpedance(raw.freq, raw.magnitude, raw.phaseDeg, chainGrid).z;
    const nfW = facts.nearFieldByModel!.woofer;
    const absurd = maxSeriesInductanceFromBump(
      {
        nfGrid: nfW.grid,
        nfDb: nfW.db,
        zGrid: chainGrid,
        z: onChain,
        fPeakHz: woofer.impedance!.fundamentalHz!,
        nfValidHz: nfW.validHz,
        pathROhm: P.pad_R_ohm,
      },
      P.budget_dB,
    );
    expect(absurd).not.toBeNull();
    // Orders of magnitude past anything buildable — this is the number the
    // search box would have been given.
    expect(absurd!.maxHenry / H_PER_MH).toBeGreaterThan(1000);
    // The sweep-based answer is the real one, and they are nothing alike.
    expect(REF.maxL_bij_Rs0_5_budget2_5dB_mH).toBeLessThan(10);
  });

  it('the fingerprint moves with the near field and with the sweep', () => {
    const bare = JSON.stringify(measurementFactsKey({}));
    const withNf = JSON.stringify(measurementFactsKey({ nearFieldByModel: facts.nearFieldByModel }));
    const withZ = JSON.stringify(measurementFactsKey({ impedanceByModel: facts.impedanceByModel }));
    const withF0 = JSON.stringify(
      measurementFactsKey({ fundamentalHzByModel: facts.fundamentalHzByModel }),
    );
    expect(withNf).not.toBe(bare);
    expect(withZ).not.toBe(bare);
    expect(withF0).not.toBe(bare);
    expect(withZ).not.toBe(withNf);
  });
});

/* ================================================================== *
 * 3 + 4 — through the real route
 * ================================================================== */

describe('F4b2 — through the worker route', () => {
  const { wBase, tBase } = v2Responses();
  const driverZ = v2DriverZ();
  /** A synthetic near field and sweep for the LOW way of the two-way fixture. */
  const nfGrid = logspace(15, 400, 200);
  const nfDb = nfGrid.map((f) => -10 * Math.log10(1 + (45 / f) ** 4));
  const zGrid = logspace(10, 20000, 300);

  const cache = new Map<string, { bounds: { rule: string }[]; notes: string[] }>();
  const run = (key: string, extra: Partial<V2ChainOnePayload['v2']>) => {
    const hit = cache.get(key);
    if (hit) return hit;
    const payload: V2ChainOnePayload = {
      input: {
        grid: [...V2_GRID],
        w: wBase,
        t: tBase,
        driverZ,
        adjust: { offsetMm: 0, trimDb: 0, inverted: false },
        seed: {
          woofer: { gainDb: 0, hp: defaultHpLp(80), lp: { ...defaultHpLp(2000), enabled: true }, eq: [] },
          tweeter: { gainDb: 0, hp: { ...defaultHpLp(2000), enabled: true }, lp: defaultHpLp(18000), eq: [] },
        },
        settings: {
          phasePriority: 0.3,
          eqBandsPerDriver: 0,
          band: [V2_GRID[0] * 2, V2_GRID[V2_GRID.length - 1] * 0.8],
          synthMode: 'acoustic',
          maxRounds: 1,
        },
      } as never,
      label: 'lfbump',
      v2: {
        gates: {},
        budgets: { lfBumpBudgetDb: 3 },
        determinism: { seed: 5, starts: 1, budgetEvaluations: 100 },
        ...extra,
      },
    };
    const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
    let out: { bounds: { rule: string }[]; notes: string[] } | null = null;
    handleV2Request(wire, (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') {
        const d = m.data as { bounds: { rule: string }[]; notes: string[] };
        out = { bounds: d.bounds, notes: d.notes };
      }
    });
    if (!out) throw new Error('no result');
    cache.set(key, out);
    return out;
  };

  /** The sweep of the fixture's low driver, resampled onto its own wide grid. */
  const sweep = () => {
    const z = driverZ.mid;
    const mag = z.map((c) => Math.hypot(c.re, c.im));
    const ph = z.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI);
    const r = resampleImpedance(V2_GRID, mag, ph, zGrid);
    return {
      grid: zGrid,
      magnitude: r.z.map((c) => Math.hypot(c.re, c.im)),
      phaseDeg: r.z.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI),
      validHz: [zGrid[0], zGrid[zGrid.length - 1]] as [number, number],
    };
  };

  it('with both curves handed over, the bound is REACHED', () => {
    const r = run('both', {
      nearFieldByModel: { mid: { grid: nfGrid, db: nfDb, validHz: [15, 400] } },
      impedanceByModel: { mid: sweep() },
      // The resonance crosses too: the worker's own curve starts at 210 Hz on
      // this fixture, so classifying there cannot find a 45 Hz resonance.
      fundamentalHzByModel: { mid: 45 },
    });
    expect(r.bounds.map((b) => b.rule)).toContain('bump-series-l');
  });

  it('with neither, there is NO bound and the note says which input was missing', () => {
    const r = run('neither', {});
    expect(r.bounds.map((b) => b.rule)).not.toContain('bump-series-l');
    expect(r.notes.join(' ')).toContain('near-field measurement');
  });

  it('with only the near field, still no bound — and still no silent substitute', () => {
    // The sweep is the half that must not be faked from the analysis grid.
    const r = run('nfOnly', {
      nearFieldByModel: { mid: { grid: nfGrid, db: nfDb, validHz: [15, 400] } },
      fundamentalHzByModel: { mid: 45 },
    });
    expect(r.bounds.map((b) => b.rule)).not.toContain('bump-series-l');
    expect(r.notes.join(' ')).toContain('loaded impedance sweep');
  });
});

/* ================================================================== *
 * V42 — the bound is on the SUM, because the metric is on the sum
 * ================================================================== */

describe('V42 — a split series chain does not escape the LF-lift bound', () => {
  /* THE CASE IS THE REAL ONE, not an invented topology. Seven of the eight V41
   * netlists carry TWO series coils on the woofer way, and `KAND_V2_1` carries
   * 5.39 + 1.95 = 7.34 mH against an inversion of ~2.43 mH. Under the
   * per-component box that was here until V42 both coils sit inside their own
   * ceiling while the total — the quantity `maxSeriesInductanceFromBump`
   * actually solves for — is three times it. */
  const SPLIT: [number, number] = [5.39, 1.95];

  /* The same three fixtures the first block builds, rebuilt here rather than
   * hoisted: they are cheap, and a shared `let` across describes is how two
   * blocks come to depend on each other's execution order. */
  const ingest = runIngest(manifest, files);
  const woofer = ingest.drivers.find((d) => d.driver === 'woofer')!;
  const facts = factsForWorker(report, identity, sweeps);
  const toComplex = (m: readonly number[], ph: readonly number[]): Complex[] =>
    m.map((mag, i) => {
      const r = (ph[i] * Math.PI) / 180;
      return { re: mag * Math.cos(r), im: mag * Math.sin(r) };
    });

  const coil = (id: string, mH: number, locked = false): VxpPart => ({
    type: 'Inductor',
    partId: id,
    model: 'woofer',
    params: [{ name: 'L', value: mH, unit: 'mH' }],
    wires: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    ...(locked ? { locked: true } : {}),
  }) as unknown as VxpPart;

  /** A minimal woofer way: generator -> two series coils -> the driver. */
  const partsWith = (coils: VxpPart[]): VxpPart[] =>
    [
      {
        type: 'Generator',
        partId: 'G',
        params: [{ name: 'Eg', value: 2.83, unit: 'V' }],
        wires: [
          { x: 0, y: 0 },
          { x: 0, y: 9 },
        ],
      },
      { type: 'Ground', params: [], wires: [{ x: 0, y: 9 }] },
      ...coils,
      {
        type: 'Driver',
        partId: 'D1',
        model: 'woofer',
        params: [],
        wires: [
          { x: 1, y: 0 },
          { x: 0, y: 9 },
        ],
      },
    ] as unknown as VxpPart[];

  /** The solved bound, in henry — taken from the inversion, never typed here. */
  const bound = (): number => {
    const zW = facts.impedanceByModel!.woofer;
    const nfW = facts.nearFieldByModel!.woofer;
    const solved = maxSeriesInductanceFromBump(
      {
        nfGrid: nfW.grid,
        nfDb: nfW.db,
        zGrid: zW.grid,
        z: toComplex(zW.magnitude, zW.phaseDeg),
        fPeakHz: woofer.impedance!.fundamentalHz!,
        nfValidHz: nfW.validHz,
        pathROhm: P.pad_R_ohm,
      },
      P.budget_dB,
    );
    expect(solved).not.toBeNull();
    return solved!.maxHenry;
  };

  it('the SUM is bounded, and the per-part ceiling stays beside it', () => {
    const maxSI = bound();
    const box = searchBoxFor(partsWith([coil('L1', SPLIT[0]), coil('L3', SPLIT[1])]), [
      {
        rule: 'bump-series-l',
        subject: 'woofer',
        quantity: 'series inductance',
        maxSI,
        unit: 'H',
        slack: false,
        parameters: {},
        notes: [],
      },
    ]);

    const group = box.valueSumCeilings.find((g) => g.label.startsWith('woofer'));
    expect(group, 'no sum ceiling was produced for the woofer series chain').toBeTruthy();
    expect([...group!.ids].sort()).toEqual(['L1', 'L3']);
    expect(group!.maxSI).toBe(maxSI);
    expect(group!.fixedSI).toBe(0);

    // The necessary condition survives: neither coil alone may exceed the total.
    expect(box.valueCeilings.L1).toBe(maxSI);
    expect(box.valueCeilings.L3).toBe(maxSI);

    /* THE CLAIM THAT MAKES THIS TEST WORTH HAVING. Under the per-component box
     * alone the seed satisfies every ceiling while the metric's own quantity is
     * three times the bound — which is precisely the escape V42 closes. */
    const seedTotalSI = (SPLIT[0] + SPLIT[1]) * H_PER_MH;
    expect(SPLIT[0] * H_PER_MH).toBeGreaterThan(maxSI); // this one alone is caught...
    expect(SPLIT[1] * H_PER_MH).toBeLessThan(maxSI); //   ...and this one is not
    expect(seedTotalSI).toBeGreaterThan(2 * maxSI); // but the TOTAL is far over
  });

  it('a LOCKED coil is charged against the budget, not ignored', () => {
    /* Same argument the resistance branch has carried since F2: a locked coil's
     * inductance is series reactance the driver sees, and the tuner cannot move
     * it. Ignoring it would let the free coils spend a budget that is already
     * gone. */
    const maxSI = bound();
    const box = searchBoxFor(partsWith([coil('L1', SPLIT[0], true), coil('L3', SPLIT[1])]), [
      {
        rule: 'bump-series-l',
        subject: 'woofer',
        quantity: 'series inductance',
        maxSI,
        unit: 'H',
        slack: false,
        parameters: {},
        notes: [],
      },
    ]);
    const group = box.valueSumCeilings.find((g) => g.label.startsWith('woofer'));
    expect(group!.ids).toEqual(['L3']);
    expect(group!.fixedSI).toBeCloseTo(SPLIT[0] * H_PER_MH, 12);
    // The locked coil alone already exceeds the whole budget, so nothing is
    // left: the free coil is driven to the floor rather than given room.
    expect(box.valueCeilings.L3).toBe(Number.MIN_VALUE);
    expect(box.notes.join(' ')).toContain('already');
  });

  it('one free coil produces a sum group too — the shape does not change with count', () => {
    const maxSI = bound();
    const box = searchBoxFor(partsWith([coil('L1', 3.0)]), [
      {
        rule: 'bump-series-l',
        subject: 'woofer',
        quantity: 'series inductance',
        maxSI,
        unit: 'H',
        slack: false,
        parameters: {},
        notes: [],
      },
    ]);
    const group = box.valueSumCeilings.find((g) => g.label.startsWith('woofer'));
    expect(group!.ids).toEqual(['L1']);
    expect(box.valueCeilings.L1).toBe(maxSI);
    // With one coil the sum and the per-part ceiling say the same thing, so no
    // note about several coils is warranted.
    expect(box.notes.join(' ')).not.toContain('SUM of');
  });
});
