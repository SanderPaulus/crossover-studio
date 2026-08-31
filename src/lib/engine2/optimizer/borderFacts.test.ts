/**
 * F4b ACCEPTANCE — the three confirmed leaks on the v2/v1 border.
 *
 * `docs/audit_engineV2_optimizerV1_grens.md` §4 recorded three, and all three
 * still reproduced on the tree F4b started from. Each one is a fact engine v2
 * derives that never crossed the worker boundary:
 *
 *  1. R_e. `reOhmByModel` was declared, was read, and was filled by nobody, so
 *     the worker fell back to `estimateRe(curve)` with no options — which
 *     cannot run the motional fit and therefore always produced the direct
 *     low-frequency reading. The panel showed the resolved value and the M-E
 *     bound divided by a different one (V21).
 *  2. Measurement validity. The A5b.1 intervals were replaced by the whole
 *     analysis grid, so the frozen passbands and every inversion that reads one
 *     judged frequencies the measurement says are not there (V22).
 *  3. The damping margin. Stated, silently not applied, and nothing on screen
 *     said so (V23).
 *
 * THE TESTS RUN THROUGH THE REAL ROUTE. `handleV2Request` is the whole worker
 * body minus three lines of `self.onmessage`, and the payload is round-tripped
 * through `structuredClone` first, exactly as `postMessage` serialises it — the
 * same discipline `workerRoute.test.ts` established. A claim about the payload
 * that was only ever checked by calling a helper directly is a claim about a
 * different code path than the one the scan button takes.
 *
 * NO LITERAL OHMS OR HERTZ IN THE ASSERTIONS. Every measured number comes from
 * the fixture or from the golden reference file. A test that carried its own
 * 2.90 would pass on a build that had stopped resolving anything.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { handleV2Request, type V2ChainOnePayload, type V2Response } from './worker.ts';
import { factsForWorker, measurementFactsKey } from './measurementFacts.ts';
import { v2DriverZ, v2Responses, v2Sweeps, V2_GRID } from './v2.fixture.ts';
import type { MeasuredSweep } from './gates.ts';
import type { ChainInput } from '../../designChain.ts';
import { defaultHpLp } from '../../filters.ts';
import type { Complex } from '../../complex.ts';
import type { InvertedBound } from './bounds.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../casus1.fixture.ts';
import { buildReport } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';

const { wBase, tBase } = v2Responses();

/* ================================================================== *
 * The route
 * ================================================================== */

/** The cheapest two-way run that still builds a reference and inverts budgets. */
function chainInput(driverZ: Record<string, Complex[]>): Omit<ChainInput, 'xoRange'> {
  return {
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
  };
}

interface RunOut {
  bounds: InvertedBound[];
  notes: string[];
}

/** One request through the real worker body, serialised the way the client does. */
function throughTheWorker(payload: V2ChainOnePayload): RunOut {
  const wire = structuredClone({ id: 1, kind: 'v2ChainOne' as const, payload });
  let out: RunOut | null = null;
  const post = (m: V2Response) => {
    if (m.kind === 'progress') return;
    if (m.kind === 'error') throw new Error(m.message);
    const d = m.data as RunOut;
    out = { bounds: d.bounds, notes: d.notes };
  };
  handleV2Request(wire, post);
  if (!out) throw new Error('the worker produced no result');
  return out;
}

const boundOf = (r: RunOut, rule: string): InvertedBound | undefined =>
  r.bounds.find((b) => b.rule === rule);

/* ================================================================== *
 * LEAK 1 — the resolved R_e crosses the border (V21)
 * ================================================================== */

describe('F4b leak 1 — the resolved R_e reaches the worker', () => {
  const driverZ = v2DriverZ();
  /**
   * A value that is NOT what the sweep reads, so "it arrived" and "it was
   * re-derived" can never look the same. Taken from the fixture's own direct
   * reading and moved by a factor, so the test states no ohm of its own.
   */
  const QES_MAX = 1.5;
  const DETERMINISM = { seed: 7, starts: 1, budgetEvaluations: 120 };

  /** Each case is a full chain run, so each is run ONCE and shared. */
  const cache = new Map<string, RunOut>();
  const run = (key: string, extra: Partial<V2ChainOnePayload['v2']> = {}): RunOut => {
    const hit = cache.get(key);
    if (hit) return hit;
    const out = throughTheWorker({
      input: { ...chainInput(driverZ) },
      label: 'facts',
      v2: { gates: {}, budgets: { qesMultiplierMax: QES_MAX }, determinism: DETERMINISM, ...extra },
    });
    cache.set(key, out);
    return out;
  };
  /** What the notes say about ONE model — provenance is per driver, not per run. */
  const notesFor = (r: RunOut, model: string): string =>
    r.notes.filter((n) => n.startsWith(`${model}:`)).join(' ');

  it('with nothing handed over, the worker falls back — and SAYS so', () => {
    const r = run('fallback');
    const b = boundOf(r, 'qes-series-r');
    expect(b, 'the Q_es inversion did not run at all').toBeTruthy();
    expect(String(b!.parameters.R_e_source)).toContain('no resolved R_e reached this run');
    // The leak was SILENT. That is the half that made it survive three phases.
    expect(r.notes.join(' ')).toContain('no resolved R_e reached this run');
    expect(r.notes.join(' ')).toContain('V8d');
  });

  it('a resolved R_e is used verbatim, and its source travels with it', () => {
    // Deliberately not the sweep's own reading: if the worker re-derived, the
    // bound would carry a different number and this would fail.
    const derivedOhm = Number(boundOf(run('fallback'), 'qes-series-r')!.parameters.R_e_ohm);
    const handedOver = derivedOhm * 0.75;

    const r = run('resolved-mid', {
      reOhmByModel: { mid: handedOver },
      reSourceByModel: { mid: 'measured with a meter (entered)' },
    });
    const b = boundOf(r, 'qes-series-r')!;
    expect(Number(b.parameters.R_e_ohm)).toBeCloseTo(handedOver, 9);
    expect(String(b.parameters.R_e_source)).toBe('measured with a meter (entered)');
    // And the BOUND moved with it — R_s ≤ R_e·(q−1) is linear in R_e, so a
    // value that arrived but was not used would leave the ceiling untouched.
    expect(b.maxSI).toBeCloseTo(handedOver * (QES_MAX - 1), 9);
    // The mid stops complaining — and the TWEETER does not, because nothing was
    // handed over for it. Provenance is per driver, and a run that reported it
    // per run would hide exactly the half-resolved case this asserts.
    expect(notesFor(r, 'mid')).not.toContain('no resolved R_e reached this run');
    expect(notesFor(r, 'tweeter')).toContain('no resolved R_e reached this run');
  });

  it('the fingerprint separates a resolved run from a fallback run', () => {
    // A5e.4: two different runs may not wear the same fingerprint. Before F4b
    // they did — the payload field existed and changed nothing.
    const empty = measurementFactsKey({});
    const resolved = measurementFactsKey({
      reOhmByModel: { mid: 4 },
      reSourceByModel: { mid: 'entered' },
    });
    expect(JSON.stringify(resolved)).not.toBe(JSON.stringify(empty));
    // ...and the SOURCE alone moves it, because the same ohm from a meter and
    // from a fit is the same bound and a different claim.
    const sameOhmOtherSource = measurementFactsKey({
      reOhmByModel: { mid: 4 },
      reSourceByModel: { mid: 'motional fit' },
    });
    expect(JSON.stringify(sameOhmOtherSource)).not.toBe(JSON.stringify(resolved));
  });
});

/* ================================================================== *
 * LEAK 1, ACCEPTANCE ON CASUS 1 — one R_e, one provenance, both sides
 * ================================================================== */

describe('F4b leak 1 on casus 1 — the border carries the reference R_e', () => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(golden);
  const settings = {
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  };
  const report = (entered: boolean) =>
    buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry,
      settings: entered ? { ...settings, reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } } : settings,
    });

  /** The report's driver ids are the netlist's; the worker speaks its own. */
  const identity = (r: ReturnType<typeof report>): Record<string, string> =>
    Object.fromEntries(r.ingest.drivers.map((d) => [d.driver, d.driver]));

  it('an entered meter reading is what crosses, with the words the panel uses', () => {
    const r = report(true);
    const facts = factsForWorker(r, identity(r));
    const woofer = r.ingest.drivers.find((d) => d.driver === 'woofer')!;
    expect(woofer.re!.source).toBe('entered');
    expect(facts.reOhmByModel!.woofer).toBeCloseTo(woofer.re!.ohm, 12);
    expect(facts.reSourceByModel!.woofer).toBe(woofer.re!.sourceText);
  });

  it('with no entered value the MOTIONAL FIT crosses — not the direct reading', () => {
    // The whole point of V21: the worker's own estimator cannot reach this
    // number, because it has no classified resonances to seed a fit with.
    const r = report(false);
    const facts = factsForWorker(r, identity(r));
    const woofer = r.ingest.drivers.find((d) => d.driver === 'woofer')!;
    expect(woofer.re!.source).toBe('motional-fit');
    expect(facts.reOhmByModel!.woofer).toBeCloseTo(woofer.re!.ohm, 12);
    // ...and it is demonstrably NOT the direct reading the old route produced.
    expect(Math.abs(facts.reOhmByModel!.woofer - woofer.re!.directOhm)).toBeGreaterThan(
      golden.toleranties.ohm,
    );
  });

  it('the R_e that crosses IS the one the class-B reference divides by (F4a)', () => {
    /* F4a recorded that `kandidaten.*.Qes_mult` stands on the meter reading
     * from `compare.py`, and wrote that parameter into the reference file
     * because it had lived only in a constant in the fixture. This is the
     * other half of that: the number the SEARCH divides by is now the same
     * number, on the same side of the border. One R_e, one provenance. */
    const p = (
      golden.kandidaten as unknown as Record<string, Record<string, unknown>>
    )._M_E_parameters;
    const r = report(true);
    const facts = factsForWorker(r, identity(r));
    expect(facts.reOhmByModel!.woofer).toBeCloseTo(p.R_e_ohm as number, 9);
    // The panel-side metric reads the same value — that is the agreement the
    // audit found broken, stated as one assertion.
    const thevenin = r.metrics.thevenin.find((x) => x.driver === 'woofer')!;
    expect(thevenin.reOhm).toBeCloseTo(facts.reOhmByModel!.woofer, 9);
  });

  it('a driver with no mapping is left out rather than published under a wrong key', () => {
    const r = report(true);
    const facts = factsForWorker(r, { woofer: 'woofer' });
    expect(Object.keys(facts.reOhmByModel ?? {})).toEqual(['woofer']);
    expect(Object.keys(facts.validHzByModel ?? {})).toEqual(['woofer']);
  });
});

/* ================================================================== *
 * LEAK 2 — measurement validity survives the border (V22)
 * ================================================================== */

describe('F4b leak 2 — a bound does not judge outside the A5b.1 interval', () => {
  /**
   * A driver impedance that is DELIBERATELY different ABOVE a chosen ceiling.
   *
   * The grid and the validity interval have to disagree somewhere the bound
   * actually reads, or "the interval was honoured" and "the interval was
   * ignored" produce the same number and the test proves nothing. M-C's
   * pre-bound reads the median |Z| over the passband, and the high way's
   * passband runs from its crossing to the top of the band — so the
   * disagreement is put at the TOP.
   *
   * The bottom of the sweep is left untouched on purpose: R_e's direct reading
   * and the resonance classification both live down there, and contaminating
   * them would break the run for a reason that has nothing to do with validity.
   */
  const CEIL_FRACTION = 0.75;
  const CONTAMINATION = 8;
  const ceilHz = V2_GRID[Math.floor(V2_GRID.length * CEIL_FRACTION)];

  const driverZ: Record<string, Complex[]> = Object.fromEntries(
    Object.entries(v2DriverZ()).map(([model, z]) => [
      model,
      z.map((c, i) =>
        V2_GRID[i] > ceilHz ? { re: c.re * CONTAMINATION, im: c.im * CONTAMINATION } : c,
      ),
    ]),
  );

  /* V32 — THE SAME CONTAMINATION ON THE SWEEP, because that is where the
   * median is read now.
   *
   * Until V32 the M-C pre-bound took its reference impedance off the chain's
   * analysis grid while `report.ts` took it off the raw sweep — the same split
   * verdict the gates had, one layer down. Both read the sweep now, so the
   * fixture has to contaminate the sweep too. Nothing about V22's claim
   * changes: the interval still clips what is READ, and the proof is still
   * that the clipped median is the clean region's. What changed is which
   * measurement it is a median OF, and the sweep was already the right one. */
  const sweeps: Record<string, MeasuredSweep> = Object.fromEntries(
    Object.entries(v2Sweeps()).map(([model, s]) => [
      model,
      {
        ...s,
        magnitude: s.magnitude.map((m, i) => (s.grid[i] > ceilHz ? m * CONTAMINATION : m)),
      },
    ]),
  );

  const interval: [number, number] = [V2_GRID[0], ceilHz];

  /** Each case is a full chain run, so each is run ONCE and shared. */
  const cache = new Map<string, RunOut>();
  const run = (key: string, validHzByModel?: Record<string, [number, number]>): RunOut => {
    const hit = cache.get(key);
    if (hit) return hit;
    const out = throughTheWorker({
      input: { ...chainInput(driverZ) },
      label: 'validity',
      v2: {
        gates: { maxDriveOnFsDb: -20 },
        budgets: {},
        determinism: { seed: 11, starts: 1, budgetEvaluations: 120 },
        // V32: without the sweep no electrical gate judges and no impedance
        // median exists, so there would be no bound to make a claim about.
        impedanceByModel: Object.fromEntries(
          Object.entries(sweeps).map(([m, sw]) => [
            m,
            { grid: sw.grid, magnitude: sw.magnitude, phaseDeg: sw.phaseDeg, validHz: sw.validHz },
          ]),
        ),
        ...(validHzByModel ? { validHzByModel } : {}),
      },
    });
    cache.set(key, out);
    return out;
  };

  const whole = () => run('whole');
  const clipped = () => run('clipped', { mid: interval, tweeter: interval });
  const absurd = () =>
    run('absurd', {
      mid: [V2_GRID[0] / 10, V2_GRID[V2_GRID.length - 1] * 10],
      tweeter: [V2_GRID[0] / 10, V2_GRID[V2_GRID.length - 1] * 10],
    });

  it('without an interval the run uses the whole grid, and says so', () => {
    expect(whole().notes.join(' ')).toContain('no A5b.1 validity interval reached this run');
    expect(whole().notes.join(' ')).toContain('V22');
  });

  it('with an interval, the inversion reads only inside it', () => {
    expect(clipped().notes.join(' ')).not.toContain('no A5b.1 validity interval reached this run');

    const a = boundOf(whole(), 'drive-series-c');
    const b = boundOf(clipped(), 'drive-series-c');
    expect(a, 'the M-C pre-bound did not run on the unclipped case').toBeTruthy();
    expect(b, 'the M-C pre-bound did not run on the clipped case').toBeTruthy();

    // THE PROOF THAT THE INTERVAL BIT: the reference impedance the bound was
    // inverted through is not the same number. Were validity still being
    // replaced by the grid, these two would be identical.
    const zWhole = Number(a!.parameters.Z_passband_median_ohm);
    const zClipped = Number(b!.parameters.Z_passband_median_ohm);
    expect(zClipped).not.toBeCloseTo(zWhole, 3);
    // ...and the clipped one is the CLEAN region's median: it must not have
    // read the contamination, which exists only above the ceiling.
    expect(zClipped).toBeLessThan(zWhole / 2);
    // The bound itself moved with it — an interval that arrived but changed
    // nothing would leave the ceiling where it was.
    expect(b!.maxSI).not.toBeCloseTo(a!.maxSI, 12);
  });

  it('an interval wider than the data is clipped to the data, not believed', () => {
    // A payload cannot widen a run past its own grid: every array the metrics
    // index into stops at the grid's ends, and an interval claiming more is a
    // claim about frequencies nobody measured.
    expect(Number(boundOf(absurd(), 'drive-series-c')!.parameters.Z_passband_median_ohm)).toBeCloseTo(
      Number(boundOf(whole(), 'drive-series-c')!.parameters.Z_passband_median_ohm),
      9,
    );
    // ...and it did NOT report a fallback, because an interval did arrive.
    expect(absurd().notes.join(' ')).not.toContain('no A5b.1 validity interval reached this run');
  });

  it('the fingerprint moves with the interval', () => {
    const wide = measurementFactsKey({ validHzByModel: { mid: [V2_GRID[0], V2_GRID[V2_GRID.length - 1]] } });
    const narrow = measurementFactsKey({ validHzByModel: { mid: interval } });
    expect(JSON.stringify(wide)).not.toBe(JSON.stringify(narrow));
  });
});

/* ================================================================== *
 * LEAK 2, on casus 1 — the intervals that cross are the report's own
 * ================================================================== */

describe('F4b leak 2 on casus 1 — the A5b.1 intervals cross intact', () => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry: casus1Geometry(golden),
    settings: { orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 } },
  });

  it('the woofer interval that crosses is the header gate floor the reference records', () => {
    const facts = factsForWorker(
      report,
      Object.fromEntries(report.ingest.drivers.map((d) => [d.driver, d.driver])),
    );
    const ref = golden.afgeleide_parameters.woofer as Record<string, number>;
    const band = facts.validHzByModel!.woofer;
    const pct = (a: number, b: number) => (Math.abs(a - b) / Math.abs(b)) * 100;
    expect(pct(band[0], ref.FF_vloer_header)).toBeLessThanOrEqual(golden.toleranties.frequenties_pct);
    // And it is genuinely NARROWER than the analysis grid — which is exactly
    // what the worker was throwing away.
    expect(report.analysisGrid).not.toBeNull();
    expect(band[0]).toBeGreaterThan(report.analysisGrid![0]);
  });
});

/* ================================================================== *
 * LEAK 3 — the damping margin (V23, F4b) and its CLOSURE (V45)
 *
 * F4b could only make the field say it did nothing; A5e.2 was open, the worker
 * handed the inversion a hard null, and `gap-pad-r` skipped every way. V45
 * closes the decision, so these claims are inverted in the V15 bridge form: the
 * assertions now pin what the code does TODAY, and each one records the state
 * it replaced so a number that moved reads as a redefinition rather than as a
 * regression.
 * ================================================================== */

describe('F4b leak 3 / V45 — a stated damping margin is applied, on both surfaces', () => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(golden);
  const base = { orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 } };
  const build = (settings: Record<string, unknown>) =>
    buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry,
      settings: { ...base, ...settings },
    });
  /** Casus 1's report ids ARE the netlist model names, so the bridge is the
   *  identity here — stated rather than assumed, since `factsForWorker` keys by
   *  model and the report keys by driver id and those are two vocabularies. */
  const identity = (r: ReturnType<typeof build>): Record<string, string> =>
    Object.fromEntries(r.ingest.drivers.map((d) => [d.driver, d.driver]));

  it('with the margin stated the note appears, and it says the bound was APPLIED', () => {
    const r = build({ dampingMarginDb: 1 });
    const notes = r.predesign.boundNotes.join(' ');
    expect(notes).toContain('Damping margin');
    /* THE INVERSION OF F4b's CLAIM. Until V45 this asserted /not applied/,
     * because the report applied the margin and the SEARCH could not — the
     * asymmetry F4b existed to confess. The bound is now inverted from the same
     * anchored budgets on both surfaces, so the sentence may no longer say the
     * search is unbounded by it. */
    expect(notes).not.toMatch(/not applied|NOT applied/);
    expect(notes).toContain('applied');
    // And it names the ways it bounded, because a margin that bounded nothing
    // and one that bounded two ways must not read alike (P4).
    const bounded = r.predesign.bounds.filter((b) => b.rule === 'gap-pad-r');
    expect(bounded.length).toBeGreaterThan(0);
    for (const b of bounded) expect(notes).toContain(b.subject);
  });

  it('without it, nothing is said — an unstated field earns no sentence', () => {
    const r = build({});
    expect(r.predesign.boundNotes.join(' ')).not.toContain('Damping margin');
  });

  it('V45 — the TODO is GONE and the worker hands over the resolved budget', () => {
    /* The acceptance criterion of A5e.2, as a scan rather than as prose. F4b
     * was explicitly not allowed to invent a gap and did not; V45 does not
     * invent one either — it CARRIES the one the report resolved, target-curve
     * shift included, which is why the TODO could go rather than be deleted. */
    const worker = readFileSync(new URL('./worker.ts', import.meta.url), 'utf-8');
    expect(worker).not.toContain('TODO(A5e.2)');
    expect(worker).not.toContain('gapBudgetDb: null,');
    expect(worker).toContain('gapBudgetDb: facts.gapBudgetDb[model] ?? null');
  });

  it('V45 — the budget CROSSES the border, and the anchor crosses beside it', () => {
    /* The fact itself, on casus 1. Two claims in one, and the second is what
     * keeps the first honest: every non-anchor way carries a budget, and the
     * ANCHOR is named rather than left as a hole — because "no budget" means
     * two different things and a map alone cannot tell them apart. */
    const r = build({});
    const facts = factsForWorker(r, identity(r));
    const gaps = r.predesign.gaps!;
    expect(facts.gapAnchorModel).toBe(gaps.anchor);
    expect(facts.gapBudgetDbByModel).toBeDefined();
    // The anchor contributes NO entry — that is its correct state, not a gap.
    expect(facts.gapBudgetDbByModel![gaps.anchor]).toBeUndefined();
    for (const w of gaps.ways) {
      expect(facts.gapBudgetDbByModel![w.driver]).toBeCloseTo(w.budgetDb, 12);
    }
    // A5e.4 — a run that carried the budgets and a run that did not are
    // different runs, so the fingerprint has to move between them.
    const withGaps = JSON.stringify(measurementFactsKey(facts));
    const without = JSON.stringify(
      measurementFactsKey({ ...facts, gapBudgetDbByModel: undefined, gapAnchorModel: undefined }),
    );
    expect(withGaps).not.toBe(without);
  });
});
