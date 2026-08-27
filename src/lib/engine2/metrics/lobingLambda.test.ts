/**
 * V20 — THE FOUR LOBING FRACTIONS.
 *
 * The four tests the metric procedure asks for, in order: a hand calculation,
 * the golden reference (that one lives in `goldenCasus1.test.ts`, beside the
 * other candidate metrics, and is named here so a reader is not left looking
 * for it), a new-measurement test, and the P6 lint (`p6Lint.test.ts`, which
 * scans this directory's parent along with everything else in `engine2/`).
 *
 * The new-measurement test is the one that carries V20's finding. Moving one
 * radiator inside a way moves the three between-ways fractions by three
 * DIFFERENT amounts — and a single λ, whichever distance it had been built
 * from, would have moved by one of them and hidden the other two.
 */

import { describe, expect, it } from 'vitest';
import {
  lobingLambdas,
  LOBING_FRACTION_KEYS,
  LOBING_LAMBDA_VERSION,
  type LobingWay,
} from './lobing.ts';
import { SPEED_OF_SOUND_M_S } from '../constants.ts';
import { buildReport } from '../report.ts';
import {
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../casus1.fixture.ts';
import { ctcKey, type Geometry } from './types.ts';

/**
 * A crossing at which one wavelength is exactly one metre, so every distance
 * in millimetres reads straight off as a fraction of λ divided by a thousand.
 * That is the whole reason for choosing it: a hand calculation nobody has to
 * trust a calculator for.
 */
const ONE_METRE_WAVELENGTH_HZ = SPEED_OF_SOUND_M_S;

const way = (
  name: string,
  sources: readonly (readonly [string, number, number])[],
): LobingWay => ({
  way: name,
  sources: sources.map(([id, zMm, amplitude]) => ({ id, zMm, amplitude })),
  positionSource: `${sources.length} radiators, at the positions entered for them`,
  amplitudeSource: 'Relative drive amplitudes are as entered.',
});

const lambdaOf = (
  r: ReturnType<typeof lobingLambdas>,
  key: string,
): number | null => r.fractions.find((f) => f.key === key)!.lambda;
const mmOf = (r: ReturnType<typeof lobingLambdas>, key: string): number | null =>
  r.fractions.find((f) => f.key === key)!.distanceMm;

describe('V20 — hand calculation', () => {
  /* Two radiators at 0 and −300 mm against a single source at +200 mm, at the
   * crossing where λ = 1000 mm. By hand:
   *   nearest   |0 − 200|           = 200 mm = 0.200 λ
   *   centroid  |−150 − 200|        = 350 mm = 0.350 λ   (equal drive)
   *   farthest  |−300 − 200|        = 500 mm = 0.500 λ
   *   within    |0 − (−300)|        = 300 mm = 0.300 λ   */
  const low = way('low', [
    ['low#1', 0, 1],
    ['low#2', -300, 1],
  ]);
  const high = way('high', [['high', 200, 1]]);
  const r = lobingLambdas(low, high, ONE_METRE_WAVELENGTH_HZ);

  it('reports all four fractions, in a fixed order, with no fifth', () => {
    expect(r.fractions.map((f) => f.key)).toEqual([...LOBING_FRACTION_KEYS]);
  });

  it('each distance and its wavelength fraction match the hand figure', () => {
    expect(mmOf(r, 'nearest')).toBeCloseTo(200, 9);
    expect(mmOf(r, 'centroid')).toBeCloseTo(350, 9);
    expect(mmOf(r, 'farthest')).toBeCloseTo(500, 9);
    expect(mmOf(r, 'within-way')).toBeCloseTo(300, 9);
    expect(lambdaOf(r, 'nearest')).toBeCloseTo(0.2, 9);
    expect(lambdaOf(r, 'centroid')).toBeCloseTo(0.35, 9);
    expect(lambdaOf(r, 'farthest')).toBeCloseTo(0.5, 9);
    expect(lambdaOf(r, 'within-way')).toBeCloseTo(0.3, 9);
  });

  it('names the two radiators each cross-way distance was measured between', () => {
    expect(r.fractions.find((f) => f.key === 'nearest')!.between).toEqual(['low#1', 'high']);
    expect(r.fractions.find((f) => f.key === 'farthest')!.between).toEqual(['low#2', 'high']);
    expect(r.fractions.find((f) => f.key === 'within-way')!.between).toEqual(['low#1', 'low#2']);
    // The centroid is not measured between two radiators: it is between two
    // computed points, and claiming a pair for it would be a small lie.
    expect(r.fractions.find((f) => f.key === 'centroid')!.between).toBeNull();
  });

  it('the amplitude weighting moves the centroid and nothing else', () => {
    // Three parts of the drive on the near woofer, one on the far one:
    // centroid = (3*0 + 1*(-300))/4 = -75 mm, so |−75 − 200| = 275 mm.
    const weighted = lobingLambdas(
      way('low', [
        ['low#1', 0, 3],
        ['low#2', -300, 1],
      ]),
      high,
      ONE_METRE_WAVELENGTH_HZ,
    );
    expect(lambdaOf(weighted, 'centroid')).toBeCloseTo(0.275, 9);
    expect(lambdaOf(weighted, 'nearest')).toBeCloseTo(lambdaOf(r, 'nearest')!, 12);
    expect(lambdaOf(weighted, 'farthest')).toBeCloseTo(lambdaOf(r, 'farthest')!, 12);
    expect(lambdaOf(weighted, 'within-way')).toBeCloseTo(lambdaOf(r, 'within-way')!, 12);
  });

  it('N is whatever the list is long: five radiators need no new code', () => {
    // The N-agnostic claim, asserted rather than asserted-in-a-comment. Five
    // sources 100 mm apart from 0 to −400, against one at +200.
    const five = way(
      'low',
      [0, -100, -200, -300, -400].map((z, i) => [`low#${i + 1}`, z, 1] as const),
    );
    const w = lobingLambdas(five, high, ONE_METRE_WAVELENGTH_HZ);
    expect(w.sourceCount.low).toBe(5);
    expect(mmOf(w, 'nearest')).toBeCloseTo(200, 9);
    expect(mmOf(w, 'centroid')).toBeCloseTo(400, 9); // centroid at −200
    expect(mmOf(w, 'farthest')).toBeCloseTo(600, 9);
    expect(mmOf(w, 'within-way')).toBeCloseTo(400, 9);
  });

  it('a single source on both sides makes the three coincide, and says so', () => {
    const s = lobingLambdas(
      way('low', [['low', 0, 1]]),
      way('high', [['high', 200, 1]]),
      ONE_METRE_WAVELENGTH_HZ,
    );
    expect(lambdaOf(s, 'nearest')).toBeCloseTo(0.2, 9);
    expect(lambdaOf(s, 'centroid')).toBeCloseTo(0.2, 9);
    expect(lambdaOf(s, 'farthest')).toBeCloseTo(0.2, 9);
    // Nothing is being summarised away, so no authority note is raised — and
    // the within-way fraction is NULL rather than 0: "no separation exists"
    // and "the separation is zero" are different statements, and only the
    // second one would suggest two coincident radiators.
    expect(s.multiSource).toBe(false);
    expect(s.authorityNote).toBeNull();
    expect(mmOf(s, 'within-way')).toBeNull();
    expect(lambdaOf(s, 'within-way')).toBeNull();
  });

  it('a source with no drive takes part in nothing, and the absence is reported', () => {
    const silent = lobingLambdas(
      way('low', [
        ['low#1', 0, 1],
        ['low#2', -300, 0],
      ]),
      high,
      ONE_METRE_WAVELENGTH_HZ,
    );
    expect(silent.sourceCount.low).toBe(1);
    expect(mmOf(silent, 'farthest')).toBeCloseTo(200, 9);
    expect(mmOf(silent, 'within-way')).toBeNull();
    expect(silent.notes.join(' ')).toContain('no drive');
  });
});

describe('V20 — validity propagation', () => {
  const low = way('low', [
    ['low#1', 0, 1],
    ['low#2', -300, 1],
  ]);
  const high = way('high', [['high', 200, 1]]);

  it('no crossing means no fraction — the distances stay, the wavelengths go', () => {
    const r = lobingLambdas(low, high, null);
    expect(mmOf(r, 'nearest')).toBeCloseTo(200, 9);
    expect(mmOf(r, 'farthest')).toBeCloseTo(500, 9);
    for (const key of LOBING_FRACTION_KEYS) expect(lambdaOf(r, key)).toBeNull();
    expect(r.notes.join(' ')).toContain('No handover frequency');
  });

  it('a crossing that is not a positive number is treated as no crossing', () => {
    for (const f of [0, -1, NaN, Infinity]) {
      expect(lambdaOf(lobingLambdas(low, high, f), 'nearest')).toBeNull();
    }
  });

  it('without positions, one entered spacing stands for all three — out loud', () => {
    const bare = (name: string): LobingWay => ({
      way: name,
      sources: [],
      positionSource: 'no vertical position was entered for this way',
      amplitudeSource: '',
    });
    const r = lobingLambdas(bare('low'), bare('high'), ONE_METRE_WAVELENGTH_HZ, {
      pairDistanceMm: { mm: 261, source: 'casebook geometry' },
    });
    expect(lambdaOf(r, 'nearest')).toBeCloseTo(0.261, 9);
    expect(lambdaOf(r, 'centroid')).toBeCloseTo(0.261, 9);
    expect(lambdaOf(r, 'farthest')).toBeCloseTo(0.261, 9);
    expect(mmOf(r, 'within-way')).toBeNull();
    // The difference that matters: three equal numbers because there is one
    // distance, not three equal numbers because the ways are single sources.
    expect(r.notes.join(' ')).toContain('cannot be separated');
    expect(r.notes.join(' ')).toContain('casebook geometry');
  });

  it('carries a version, and it is a major above the F1 form it replaced', () => {
    expect(LOBING_LAMBDA_VERSION).toBe('lobing-lambda/2.0');
  });
});

/* ==================================================================== *
 * NEW MEASUREMENT — move the cabinet, watch the fractions part company
 * ==================================================================== */

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const baseGeometry = casus1Geometry(golden);
const settings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

/** The woofer-mid fractions of casus 1, with the lower woofer moved by `dz`. */
function fractionsWithLowerWooferMoved(dzMm: number) {
  const sources = baseGeometry.waySources!;
  const geometry: Geometry = {
    ...baseGeometry,
    waySources: {
      ...sources,
      woofer: sources.woofer.map((s, i) => (i === 1 ? { ...s, zMm: s.zMm + dzMm } : s)),
    },
  };
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings,
  });
  return report.metrics.lobingLambdas.find((l) => l.lower === 'woofer')!;
}

describe('V20 — new measurement: the three between-ways fractions move independently', () => {
  const before = fractionsWithLowerWooferMoved(0);
  // Down by 100 mm — away from the mid, which is above both woofers.
  const after = fractionsWithLowerWooferMoved(-100);

  it('the crossing is untouched, so every change below is geometry', () => {
    // The point of moving a radiator rather than a filter: λ = d·f/c has two
    // factors, and a test in which both moved could not say which one did it.
    expect(after.crossingHz).toBeCloseTo(before.crossingHz!, 12);
  });

  it('nearest does not move, centroid moves half, farthest moves the whole shift', () => {
    // THIS IS V20, as three numbers. The nearest woofer did not move, so the
    // optimistic reading of the handover is unchanged. The centroid of two
    // equally driven sources moves by half of what one of them moved. The
    // farthest source moved the whole 100 mm. One λ would have reported one of
    // these three and said nothing about the other two.
    expect(mmOf(after, 'nearest')! - mmOf(before, 'nearest')!).toBeCloseTo(0, 9);
    expect(mmOf(after, 'centroid')! - mmOf(before, 'centroid')!).toBeCloseTo(50, 9);
    expect(mmOf(after, 'farthest')! - mmOf(before, 'farthest')!).toBeCloseTo(100, 9);
    expect(mmOf(after, 'within-way')! - mmOf(before, 'within-way')!).toBeCloseTo(100, 9);
  });

  it('the wavelength fractions follow their own distances, each by its own factor', () => {
    const ratio = (key: string) => lambdaOf(after, key)! / lambdaOf(before, key)!;
    expect(ratio('nearest')).toBeCloseTo(1, 9);
    expect(ratio('centroid')).toBeGreaterThan(1);
    expect(ratio('farthest')).toBeGreaterThan(ratio('centroid'));
    expect(ratio('within-way')).toBeGreaterThan(ratio('farthest'));
  });

  it('moving the WHOLE lower way moves all three alike and leaves within-way alone', () => {
    // The counter-case, and it is what makes the test above mean something: a
    // rigid shift of one way is exactly the situation in which a single
    // distance WOULD have been enough. If both mutations produced the same
    // pattern, the metric would not be measuring what it claims to.
    const sources = baseGeometry.waySources!;
    const shifted: Geometry = {
      ...baseGeometry,
      waySources: {
        ...sources,
        woofer: sources.woofer.map((s) => ({ ...s, zMm: s.zMm - 100 })),
      },
    };
    const report = buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry: shifted,
      settings,
    });
    const moved = report.metrics.lobingLambdas.find((l) => l.lower === 'woofer')!;
    for (const key of ['nearest', 'centroid', 'farthest']) {
      expect(mmOf(moved, key)! - mmOf(before, key)!).toBeCloseTo(100, 9);
    }
    expect(mmOf(moved, 'within-way')! - mmOf(before, 'within-way')!).toBeCloseTo(0, 9);
  });

  it('the sentence about the synthesis is raised by the SOURCE COUNT, not by a way name', () => {
    // A guard against the obvious wrong implementation: naming the woofer way.
    // With the array collapsed to one radiator the note must disappear, on the
    // same cabinet and the same candidate.
    expect(before.multiSource).toBe(true);
    expect(before.authorityNote).toContain('M-F final');
    const single: Geometry = {
      ...baseGeometry,
      waySources: { ...baseGeometry.waySources!, woofer: [baseGeometry.waySources!.woofer[0]] },
    };
    const report = buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry: single,
      settings,
    });
    const collapsed = report.metrics.lobingLambdas.find((l) => l.lower === 'woofer')!;
    expect(collapsed.multiSource).toBe(false);
    expect(collapsed.authorityNote).toBeNull();
    expect(mmOf(collapsed, 'within-way')).toBeNull();
  });
});

describe('V20 — nothing in the engine may judge on a fraction', () => {
  it('the result carries no score, no zone and no verdict field', () => {
    const r = lobingLambdas(
      way('low', [
        ['low#1', 0, 1],
        ['low#2', -300, 1],
      ]),
      way('high', [['high', 200, 1]]),
      ONE_METRE_WAVELENGTH_HZ,
    );
    const keys = new Set(Object.keys(r).concat(...r.fractions.map((f) => Object.keys(f))));
    for (const forbidden of ['score', 'zone', 'verdict', 'pass', 'fail', 'severity']) {
      expect([...keys]).not.toContain(forbidden);
    }
  });
});
