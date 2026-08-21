import { describe, expect, it } from 'vitest';
import {
  assertSourceModel,
  assertValidityContained,
  branchesFromRoles,
  branchSpacingMm,
  SourceModelError,
  sourcesInBranch,
  sourcesOf,
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
