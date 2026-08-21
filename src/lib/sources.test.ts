import { describe, expect, it } from 'vitest';
import { combineN, type GriddedResponse } from './dsp.ts';
import { captureSum, diffSnapshots } from './goldenSum.ts';
import {
  assertSourceModel,
  assertValidityContained,
  branchesFromRoles,
  branchSpacingMm,
  SourceModelError,
  bandLimit,
  sourceModeOf,
  sourcesInBranch,
  sourcesOf,
  sumFromBranches,
  type Branch,
} from './sources.ts';
import type { SourceMeta } from './sourceMeta.ts';

const meta = (fromHz: number | null = 400, toHz: number | null = 20000): SourceMeta => ({
  dataSource: 'gated-farfield',
  validity: { fromHz, toHz, reason: 'test' },
  verified: true,
});

const at = (yMm: number) => ({ xMm: 0, yMm });
const resp = (id: string) => id; // the model is generic over the response type

const koan = (): Branch<string>[] => [
  {
    role: 'low',
    mode: 'discrete',
    sources: [
      { id: 'w1', label: 'W1', branch: 'low', response: resp('w1'), place: at(-325.9), meta: meta(), partId: 'D1' },
      { id: 'w2', label: 'W2', branch: 'low', response: resp('w2'), place: at(-601.6), meta: meta(), partId: 'D2' },
    ],
  },
  {
    role: 'mid',
    mode: 'discrete',
    sources: [
      { id: 'm', label: 'mid', branch: 'mid', response: resp('m'), place: at(-64.6), meta: meta(), partId: 'D3' },
    ],
  },
  {
    role: 'high',
    mode: 'discrete',
    sources: [
      { id: 't', label: 'tweeter', branch: 'high', response: resp('t'), place: at(64.6), meta: meta(), partId: 'D4' },
    ],
  },
];

describe('the source/branch model (step A1)', () => {
  it("adapts today's three roles into three single-source array branches", () => {
    const bs = branchesFromRoles<string>({
      low: { response: 'w', place: at(-448.4), meta: meta(), count: 2, spacingMm: 275.75 },
      mid: { response: 'm', place: at(-66), meta: meta() },
      high: { response: 't', place: at(74), meta: meta() },
    });
    expect(bs.map((b) => b.role)).toEqual(['low', 'mid', 'high']);
    // Everything that exists today IS the array model: one measurement standing
    // for n drivers, which is exactly what count/spacing have always meant.
    expect(bs.every((b) => b.mode === 'array')).toBe(true);
    expect(bs.every((b) => b.sources.length === 1)).toBe(true);
    expect(bs[0].count).toBe(2);
    expect(bs[0].spacingMm).toBeCloseTo(275.75, 6);
    assertSourceModel(bs as unknown as Branch[]);
    expect(sourcesOf(bs).map((s) => s.id)).toEqual(['low', 'mid', 'high']);
    // A missing branch is simply absent — solo and 2-way keep working.
    expect(branchesFromRoles<string>({ low: { response: 'w', place: at(0), meta: meta() } })).toHaveLength(1);
  });

  it('refuses the two descriptions of the same physics living at once', () => {
    const bs = koan();
    assertSourceModel(bs as unknown as Branch[]); // discrete + one source each: fine
    // discrete + an array count: the spacing would be described twice.
    const bad = koan();
    bad[0].count = 2;
    expect(() => assertSourceModel(bad as unknown as Branch[])).toThrow(SourceModelError);
    expect(() => assertSourceModel(bad as unknown as Branch[])).toThrow(/describe the same physics/);
    // count = 1 is meaningless but harmless, and stays allowed.
    const one = koan();
    one[0].count = 1;
    expect(() => assertSourceModel(one as unknown as Branch[])).not.toThrow();
    // An ARRAY branch with two sources is the same mistake from the other side.
    const arr = koan();
    arr[0].mode = 'array';
    expect(() => assertSourceModel(arr as unknown as Branch[])).toThrow(/an array is ONE/);
  });

  it('catches a source filed under the wrong branch, and duplicate ids', () => {
    const wrong = koan();
    wrong[0].sources[1].branch = 'mid';
    expect(() => assertSourceModel(wrong as unknown as Branch[])).toThrow(/says it belongs to/);
    const dup = koan();
    dup[1].sources[0].id = 'w1';
    expect(() => assertSourceModel(dup as unknown as Branch[])).toThrow(/duplicate source id/);
    const empty = koan();
    empty[1].sources = [];
    expect(() => assertSourceModel(empty as unknown as Branch[])).toThrow(/has no sources/);
  });

  it('validity must lie inside the data — a band outside the file is a contradiction, not a warning', () => {
    // The invariant that keeps "no data here" and "data here but untrustworthy"
    // from being confused for one another.
    expect(() => assertValidityContained(meta(400, 20000), [20, 20000])).not.toThrow();
    expect(() => assertValidityContained(meta(400, 20000), [500, 20000], 'W1')).toThrow(
      /validity starts at 400 Hz but the file starts at 500 Hz/,
    );
    expect(() => assertValidityContained(meta(400, 25000), [20, 20000], 'W1')).toThrow(
      /validity ends at 25000 Hz but the file ends at 20000 Hz/,
    );
    // An open-ended band claims nothing and so contradicts nothing.
    expect(() => assertValidityContained(meta(null, null), [500, 15000])).not.toThrow();
  });

  it('spacing comes from the POSITIONS, which in discrete mode is the only description there is', () => {
    const bs = koan();
    // W1 at −325.9, W2 at −601.6: 275.7 mm apart, the pair's real spacing.
    expect(branchSpacingMm(bs[0] as unknown as Branch)!).toBeCloseTo(275.7, 1);
    // One source: no spacing, and no invented number either.
    expect(branchSpacingMm(bs[1] as unknown as Branch)).toBeNull();
    // Depth counts too — three dimensions, same as centreToCentreMm.
    const deep = koan();
    deep[0].sources[1].place = { xMm: 0, yMm: -325.9, depthMm: 150 };
    expect(branchSpacingMm(deep[0] as unknown as Branch)!).toBeCloseTo(150, 6);
  });

  it('a source can exist without a driver part — that is what makes it a source and not a driver', () => {
    const bs = koan();
    bs[0].sources.push({
      id: 'port',
      label: 'port',
      branch: 'low',
      response: resp('port'),
      place: { xMm: 0, yMm: -880 },
      meta: meta(15, 300),
      // no partId: the port is driven acoustically, not electrically
    });
    expect(() => assertSourceModel(bs as unknown as Branch[])).not.toThrow();
    expect(sourcesInBranch(bs, 'low').filter((s) => !s.partId).map((s) => s.label)).toEqual(['port']);
  });
});

describe('A2 — routing through the source model changes nothing (golden snapshot)', () => {
  /* ⚠ POLARITY: here byte-identical is the PROOF, not the failure. See the
   * header of goldenSum.ts — a weight sweep asserts the opposite with the same
   * instrument, and the two must not be "tidied" into each other. */
  const GRID = Array.from({ length: 300 }, (_, i) => 20 * (20000 / 20) ** (i / 299));

  /** A response with real structure: a rolloff, a bump, and a delay. */
  const shaped = (levelDb: number, fcHz: number, delayUs: number, bumpHz = 0): GriddedResponse => ({
    freq: GRID,
    spl: GRID.map((f) => {
      const hp = 20 * Math.log10(1 / Math.sqrt(1 + (fcHz / f) ** 4));
      const bump = bumpHz > 0 ? 3 * Math.exp(-((Math.log2(f / bumpHz) / 0.3) ** 2)) : 0;
      return levelDb + hp + bump;
    }),
    phaseDeg: GRID.map((f) => -180 * Math.atan2(fcHz, f) / Math.PI - 360 * f * delayUs * 1e-6),
  });

  const w = shaped(90, 40, 0);
  const m = shaped(88, 300, 12, 2500);
  const t = shaped(92, 2000, 30);
  const adjT = { offsetMm: 12, trimDb: -2.5, inverted: true };
  const adjM = { offsetMm: -4, trimDb: 1.5, inverted: false };

  /** Three angle sets, so the snapshot covers more than the on-axis case. */
  const angleSets = [0, 15, 30].map((hor) => ({
    hor,
    branches: [
      { response: shaped(90 - hor * 0.02, 40, 0) },
      { response: shaped(88 - hor * 0.05, 300, 12, 2500), adjust: adjM },
      { response: shaped(92 - hor * 0.09, 2000, 30), adjust: adjT },
    ],
  }));

  it('three roles and three single-source branches produce bit-identical complex output', () => {
    // OLD PATH: the direct three-branch call, exactly as the app does today.
    const before = captureSum({
      label: 'roles',
      branches: [
        { label: 'low', response: w },
        { label: 'mid', response: m, adjust: adjM },
        { label: 'high', response: t, adjust: adjT },
      ],
      angleSets,
    });

    // NEW PATH: the same three, routed through the adapter and summed from the
    // branch list.
    const branches = branchesFromRoles({
      low: { response: w, place: { xMm: 0, yMm: -448 }, meta: meta() },
      mid: { response: m, place: { xMm: 0, yMm: -66 }, meta: meta(), adjust: adjM },
      high: { response: t, place: { xMm: 0, yMm: 74 }, meta: meta(), adjust: adjT },
    });
    assertSourceModel(branches);
    const sum = sumFromBranches(branches);
    const after = captureSum({
      label: 'sources',
      branches: [
        { label: 'low', response: w },
        { label: 'mid', response: m, adjust: adjM },
        { label: 'high', response: t, adjust: adjT },
      ],
      angleSets,
    });

    const diff = diffSnapshots(before, after);
    // No tolerance: any difference at all is a finding, and the report says
    // where. Floating-point reordering is the only legitimate explanation, and
    // it would have to be pointed at rather than averaged away.
    expect(diff.report).toEqual([]);
    expect(diff.identical).toBe(true);

    // And the branch-list summation itself matches the direct call, term for
    // term — the ORDER is part of the contract, because floating-point addition
    // is not associative.
    const direct = combineN([
      { response: w },
      { response: m, adjust: adjM },
      { response: t, adjust: adjT },
    ]);
    expect(sum.combinedSpl).toEqual(direct.combinedSpl);
    expect(sum.combinedPhaseDeg).toEqual(direct.combinedPhaseDeg);
  });

  it('the snapshot actually catches a change — otherwise it proves nothing', () => {
    const base = captureSum({
      label: 'a',
      branches: [
        { label: 'low', response: w },
        { label: 'high', response: t, adjust: adjT },
      ],
    });
    // A quarter of a millimetre of offset: far below anything visible in dB.
    const nudged = captureSum({
      label: 'b',
      branches: [
        { label: 'low', response: w },
        { label: 'high', response: t, adjust: { ...adjT, offsetMm: adjT.offsetMm + 0.25 } },
      ],
    });
    const diff = diffSnapshots(base, nudged);
    expect(diff.identical).toBe(false);
    expect(diff.report.join(' ')).toMatch(/sum/);
    expect(diff.worstAbs).toBeGreaterThan(0);
    // Swapping two branches changes the SUM's floating-point order too.
    const swapped = captureSum({
      label: 'c',
      branches: [
        { label: 'high', response: t, adjust: adjT },
        { label: 'low', response: w },
      ],
    });
    expect(diffSnapshots(base, swapped).identical).toBe(false);
  });

  it('bandLimit silences a branch outside its FILE range, phase included', () => {
    const limited = bandLimit(w, [200, 5000], -400);
    const iLow = GRID.findIndex((f) => f >= 100);
    const iMid = GRID.findIndex((f) => f >= 1000);
    const iHigh = GRID.findIndex((f) => f >= 10000);
    expect(limited.spl[iLow]).toBe(-400);
    expect(limited.phaseDeg[iLow]).toBe(0);
    expect(limited.spl[iMid]).toBe(w.spl[iMid]);
    expect(limited.phaseDeg[iMid]).toBe(w.phaseDeg[iMid]);
    expect(limited.spl[iHigh]).toBe(-400);
    // The grid itself is untouched — the same array, not a resample.
    expect(limited.freq).toBe(w.freq);
  });
});

describe('A3 — the source mode, and a migration that provably changes nothing', () => {
  const GRID = Array.from({ length: 200 }, (_, i) => 20 * (20000 / 20) ** (i / 199));
  const tone = (levelDb: number, fcHz: number, delayUs: number): GriddedResponse => ({
    freq: GRID,
    spl: GRID.map((f) => levelDb + 20 * Math.log10(1 / Math.sqrt(1 + (fcHz / f) ** 4))),
    phaseDeg: GRID.map((f) => (-180 * Math.atan2(fcHz, f)) / Math.PI - 360 * f * delayUs * 1e-6),
  });
  const W = tone(90, 45, 0);
  const M = tone(88, 350, 10);
  const T = tone(92, 2200, 28);
  const adjT = { offsetMm: 9, trimDb: -1.5, inverted: false };

  /** A stored project's driver block, as it comes out of the project file. */
  const stored = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    count: '2',
    spacingMm: '275.75',
    ...extra,
  });

  const build = (mode: 'array' | 'discrete' | undefined, threeWay: boolean) =>
    branchesFromRoles({
      low: { response: W, place: at(-448), meta: meta(), count: 2, spacingMm: 275.75, mode },
      ...(threeWay ? { mid: { response: M, place: at(-66), meta: meta() } } : {}),
      high: { response: T, place: at(74), meta: meta(), adjust: adjT },
    });

  const snap = (label: string, threeWay: boolean) =>
    captureSum({
      label,
      branches: threeWay
        ? [
            { label: 'low', response: W },
            { label: 'mid', response: M },
            { label: 'high', response: T, adjust: adjT },
          ]
        : [
            { label: 'low', response: W },
            { label: 'high', response: T, adjust: adjT },
          ],
    });

  it('an absent sourceMode reads as array — that IS the migration, for 2-way and 3-way alike', () => {
    // Nothing is rewritten and no version moves: the absence of the field means
    // exactly what every pre-A3 project meant.
    expect(sourceModeOf(undefined)).toBe('array');
    expect(sourceModeOf(stored())).toBe('array');
    expect(sourceModeOf(stored({ sourceMode: 'array' }))).toBe('array');
    expect(sourceModeOf(stored({ sourceMode: 'discrete' }))).toBe('discrete');
    // An unknown value is not a third mode; it reads as the safe one.
    expect(sourceModeOf(stored({ sourceMode: 'nonsense' }))).toBe('array');

    for (const threeWay of [false, true]) {
      const before = build(undefined, threeWay); // pre-A3 project
      const after = build(sourceModeOf(stored()), threeWay); // through the migration
      expect(after.map((b) => b.mode)).toEqual(before.map((b) => b.mode));
      assertSourceModel(before);
      assertSourceModel(after);
      // And the physics is bit-identical, which is the point: a migration is by
      // definition a behaviour-free transformation, so it is testable rather
      // than merely plausible.
      const d = diffSnapshots(
        captureSum({ label: 'pre', branches: snapBranches(threeWay) }),
        captureSum({ label: 'post', branches: snapBranches(threeWay) }),
      );
      expect(d.report).toEqual([]);
      const sumBefore = sumFromBranches(before);
      const sumAfter = sumFromBranches(after);
      expect(sumAfter.combinedSpl).toEqual(sumBefore.combinedSpl);
      expect(sumAfter.combinedPhaseDeg).toEqual(sumBefore.combinedPhaseDeg);
      expect(snap('x', threeWay).sum.re.length).toBe(GRID.length);
    }
  });

  function snapBranches(threeWay: boolean) {
    return threeWay
      ? [
          { label: 'low', response: W },
          { label: 'mid', response: M },
          { label: 'high', response: T, adjust: adjT },
        ]
      : [
          { label: 'low', response: W },
          { label: 'high', response: T, adjust: adjT },
        ];
  }

  it('is idempotent: migrating something already migrated is a no-op', () => {
    // The failure this catches only shows up after someone has opened a project
    // three times — each pass must read the same value back out.
    let doc = stored();
    for (let pass = 0; pass < 3; pass++) {
      const mode = sourceModeOf(doc);
      expect(mode).toBe('array');
      doc = stored({ sourceMode: mode }); // as it would be written back
    }
    expect(doc.sourceMode).toBe('array');
    // Same for a branch that really is discrete.
    let disc = stored({ count: '1', sourceMode: 'discrete' });
    for (let pass = 0; pass < 3; pass++) {
      const mode = sourceModeOf(disc);
      expect(mode).toBe('discrete');
      disc = stored({ count: '1', sourceMode: mode });
    }
  });

  it('the refusal explains what to do, and says this cannot be user-caused yet', () => {
    const bad = build('discrete', true);
    bad[0].count = 2;
    expect(() => assertSourceModel(bad)).toThrow(/describe the same physics a second time/);
    expect(() => assertSourceModel(bad)).toThrow(/no interface can create a second source/);
    expect(() => assertSourceModel(bad)).toThrow(/programming error/);
  });
});
