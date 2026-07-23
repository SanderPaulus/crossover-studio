import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDirectivity, type AngleResponse } from './directivity.ts';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { parseFrd } from './parsers/frd.ts';
import { evalDriverFilter, defaultHpLp } from './filters.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };
const grid = logspace(300, 18000, 200);

const flat = (spl: number, phase = 0): GriddedResponse => ({
  freq: [...grid],
  spl: grid.map(() => spl),
  phaseDeg: grid.map(() => phase),
});

describe('computeDirectivity', () => {
  it('perfectly omni drivers give DI = 0 everywhere', () => {
    const w: AngleResponse[] = [0, 30, 60].map((hor) => ({ hor, response: flat(90) }));
    const t: AngleResponse[] = [0, 30, 60].map((hor) => ({ hor, response: flat(90) }));
    const r = computeDirectivity(w, t, null, null, NO_ADJ)!;
    for (const v of r.diDb) expect(Math.abs(v)).toBeLessThan(1e-9);
  });

  it('off-axis rolloff produces positive DI', () => {
    // Both drivers lose 6 dB per 30° off-axis: energy average sits below
    // on-axis → DI ≈ 10·log10(3/(1+10^-0.6+10^-1.2)) ≈ 3.5 dB.
    const w: AngleResponse[] = [0, 30, 60].map((hor) => ({ hor, response: flat(90 - hor / 5) }));
    const t: AngleResponse[] = [0, 30, 60].map((hor) => ({ hor, response: flat(90 - hor / 5) }));
    const r = computeDirectivity(w, t, null, null, NO_ADJ)!;
    const expected = 10 * Math.log10(3 / (1 + 10 ** -0.6 + 10 ** -1.2));
    for (const v of r.diDb) expect(v).toBeCloseTo(expected, 6);
  });

  it('requires a 0° pair and at least two shared angles', () => {
    const w: AngleResponse[] = [{ hor: 15, response: flat(90) }, { hor: 30, response: flat(90) }];
    const t: AngleResponse[] = [{ hor: 15, response: flat(90) }, { hor: 30, response: flat(90) }];
    expect(computeDirectivity(w, t, null, null, NO_ADJ)).toBeNull();
    expect(
      computeDirectivity(
        [{ hor: 0, response: flat(90) }],
        [{ hor: 0, response: flat(90) }],
        null,
        null,
        NO_ADJ,
      ),
    ).toBeNull();
  });

  it('KOAN measurements: a proper crossover gives clean rising DI; the raw sum does not', () => {
    const setFor = (prefix: string): AngleResponse[] =>
      [0, 15, 30, 45, 60, 75].map((hor) => {
        const f = parseFrd(load(`${prefix}_hor${hor}_mettape.txt`));
        return { hor, response: resample(f.freq, f.spl, f.phase, grid) };
      });
    const mid = setFor('mid');
    const twt = setFor('tweet');

    const hW = evalDriverFilter(
      { gainDb: 0, hp: defaultHpLp(200), lp: { ...defaultHpLp(2200), enabled: true, kind: 'LR', order: 4 }, eq: [] },
      grid,
    );
    const hT = evalDriverFilter(
      { gainDb: -5, hp: { ...defaultHpLp(2900), enabled: true, kind: 'LR', order: 2 }, lp: defaultHpLp(20000), eq: [] },
      grid,
    );

    const filtered = computeDirectivity(mid, twt, hW, hT, NO_ADJ)!;
    const raw = computeDirectivity(mid, twt, null, null, NO_ADJ)!;
    const at = (r: typeof filtered, f: number) => r.diDb[grid.findIndex((g) => g >= f)];

    // Filtered: DI positive across the band, gently rising toward HF.
    expect(at(filtered, 400)).toBeLessThan(3);
    expect(at(filtered, 15000)).toBeGreaterThan(at(filtered, 400) + 1);
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] > 400 && grid[i] < 16000) expect(filtered.diDb[i]).toBeGreaterThan(0);
    }
    // Raw full-range sum: the 47 µs offset combs ON-AXIS at HF, so on-axis is
    // QUIETER than the energy average — negative DI. Exactly why a crossover
    // is also a directivity decision, and why this chart exists.
    expect(at(raw, 12000)).toBeLessThan(0);
    expect(at(filtered, 12000)).toBeGreaterThan(0);
  });
});
