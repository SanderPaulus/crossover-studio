import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample, resampleImpedance, type GriddedResponse } from './dsp.ts';
import { designThreeWay } from './threeWayDesign.ts';
import { synthesize } from './synthesis.ts';
import { RATIO_DEGENERATE, RATIO_FLAG, worstImpedanceRatio } from './impedanceDiag.ts';
import { cplx, type Complex } from './complex.ts';

/**
 * THE MEASURED GAP, PINNED.
 *
 * `RATIO_DEGENERATE = 0.01` is not a taste: it sits in an EMPTY gap of ×159
 * between the broken readings (0.0011) and the lowest healthy one (0.1746),
 * measured over 18 synthesised seeds on two real driver sets. The far side of
 * that gap is two observations of one phenomenon — enough to decide on, too
 * little to stop looking at.
 *
 * So this file pins the gap itself rather than the constant. A change to the
 * synthesis that moves either population fails here, visibly, with the number
 * that moved — instead of silently making the threshold wrong.
 *
 * Re-test the threshold when a third driver set exists (ROADMAP).
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-3way');
const grid = logspace(210, 19000, 240);
const SILENT = -400;
const ALIVE = -300;

function banded(file: string): GriddedResponse {
  const p = parseFrd(readFileSync(join(FIXTURES, file), 'utf-8'));
  const g = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0];
  const f1 = p.freq[p.freq.length - 1];
  return {
    freq: grid,
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT : v)),
    phaseDeg: g.phaseDeg,
  };
}
function zOf(file: string): Complex[] {
  const z = parseZma(readFileSync(join(FIXTURES, file), 'utf-8'));
  return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
}
const w = banded('woofer-pair-hor0.frd');
const m = banded('mid-hor0.txt');
const t = banded('tweeter-hor0.txt');
const driverZ: Record<string, Complex[]> = {
  woofer: zOf('woofers-parallel.zma'),
  mid: zOf('mid.zma'),
  tweeter: zOf('tweeter.zma'),
};

/** One candidate through design + per-branch synthesis, no tune. */
function seed(xoLow: number, xoHigh: number, eqBands: number) {
  const d = designThreeWay({
    w, m, t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow, xoHigh,
    band: [250, 18000],
    phasePriority: 0.5,
    xoLowWindow: [xoLow * 0.85, xoLow * 1.18],
    xoHighWindow: [xoHigh * 0.85, xoHigh * 1.18],
    hpFloorHz: 1849,
    breakupGuard: true,
    eqBandsPerBranch: eqBands,
    diAnchorHz: { low: 1399, high: 3149 },
  } as Parameters<typeof designThreeWay>[0]);
  const one = (spec: Parameters<typeof synthesize>[0], resp: GriddedResponse, key: string) => {
    const idxs: number[] = [];
    for (let i = 0; i < grid.length; i++) if (resp.spl[i] > ALIVE) idxs.push(i);
    return synthesize(spec, idxs.map((i) => grid[i]), idxs.map((i) => driverZ[key][i]), {
      mode: 'acoustic',
      phasePriority: 0.5,
      catalogSnap: false,
      corrections: 'lean',
      leanTargetDb: 2.5,
      label: key,
      driverSplDb: idxs.map((i) => resp.spl[i]),
    });
  };
  return {
    woofer: one(d.specs.woofer, w, 'woofer'),
    mid: one(d.specs.mid, m, 'mid'),
    tweeter: one(d.specs.tweeter, t, 'tweeter'),
  };
}

describe('degenerate-load refusal (aug 2026)', () => {
  it('the BROKEN side of the gap: the mid branch shorts, and synthesize says so', () => {
    /* W-M 514 · M-T 1849 with 2 EQ bands is the candidate that started this:
     * 0.005 Ω at 4799 Hz against a bare mid of 5.01 Ω — ratio 0.0011. */
    const s = seed(514, 1849, 2);
    const d = s.mid.degenerateLoad;
    expect(d, 'the mid branch must be refused').toBeDefined();
    expect(d!.ratio).toBeLessThan(RATIO_DEGENERATE / 5); // ×5 of headroom under the line
    expect(d!.branchOhm).toBeLessThan(0.05);
    expect(d!.atHz).toBeGreaterThan(3000); // outside the mid's passband, as measured
    // The other two branches are healthy — the refusal is not blanket.
    expect(s.woofer.degenerateLoad).toBeUndefined();
    expect(s.tweeter.degenerateLoad).toBeUndefined();
  });

  it('the message names the branch, the frequency, the ratio, and what it IS', () => {
    /* A refusal read as "my design is a heavy load" sends the designer to the
     * amplifier settings, which cannot fix it. */
    const d = seed(514, 1849, 2).mid.degenerateLoad!;
    expect(d.reason).toContain('mid');
    expect(d.reason).toContain(`${Math.round(d.atHz)} Hz`);
    expect(d.reason).toMatch(/%/);
    expect(d.reason).toContain('DEGENERATION');
    expect(d.reason).toMatch(/not a heavy load/);
    expect(d.reason).toMatch(/topology/);
  });

  it('the HEALTHY side of the gap stays healthy, and the gap is still wide', () => {
    /* The nearest healthy reading in the census: 0.1746 on the mid of
     * W-M 424 · M-T 2432 with 2 bands — a hard load, deliberately NOT
     * refused. If a synthesis change drags this population down, the empty
     * gap that justifies the threshold is gone and this fails. */
    const s = seed(424, 2432, 2);
    expect(s.mid.degenerateLoad, 'a hard load is not a defect').toBeUndefined();
    expect(s.woofer.degenerateLoad).toBeUndefined();
    expect(s.tweeter.degenerateLoad).toBeUndefined();
  });

  it('without EQ bands nothing degenerates — the pattern the census found', () => {
    /* Nine of nine eqBands=0 seeds were clean; five of nine eqBands=2 seeds
     * went under 1 Ω. The EQ realisation is what creates it, and that is an
     * open question of its own (see the handover). */
    const s = seed(514, 1849, 0);
    expect(s.woofer.degenerateLoad).toBeUndefined();
    expect(s.mid.degenerateLoad).toBeUndefined();
    expect(s.tweeter.degenerateLoad).toBeUndefined();
  });

  it('the two thresholds are two orders apart, and that separation is the argument', () => {
    /* RATIO_FLAG reports and cannot separate (a plain series inductor reaches
     * 0.62 on its own); RATIO_DEGENERATE refuses and separates with the gap.
     * If they ever drift together the doctrine is broken. */
    expect(RATIO_FLAG / RATIO_DEGENERATE).toBeGreaterThan(20);
    expect(RATIO_DEGENERATE).toBeLessThan(0.1746 / 5); // under the healthy floor
    expect(RATIO_DEGENERATE).toBeGreaterThan(0.0011 * 5); // over the broken pair
  });

  it('worstImpedanceRatio is one definition: lowest point in band, with both ohms', () => {
    const freq = [100, 200, 400, 800];
    const branch = [cplx(8, 0), cplx(0.5, 0), cplx(4, 0), cplx(8, 0)];
    const bare = [cplx(8, 0), cplx(8, 0), cplx(8, 0), cplx(8, 0)];
    const worst = worstImpedanceRatio(branch, bare, freq)!;
    expect(worst.ratio).toBeCloseTo(0.0625, 6);
    expect(worst.atHz).toBe(200);
    expect(worst.branchOhm).toBeCloseTo(0.5, 9);
    expect(worst.bareOhm).toBeCloseTo(8, 9);
    // Out-of-band points are not judged.
    expect(worstImpedanceRatio(branch, bare, freq, [300, 1000])!.atHz).toBe(400);
    // Nothing usable in band is null, not a number that happens to compute.
    expect(worstImpedanceRatio(branch, bare, freq, [2000, 3000])).toBeNull();
  });
});
