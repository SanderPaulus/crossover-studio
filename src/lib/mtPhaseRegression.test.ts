import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { applyTransfer, combine, combineN, logspace, resample, resampleImpedance } from './dsp.ts';
import { deserializeFilter } from './filterFile.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { bandStats } from './bandMetrics.ts';
import { computeIntegration } from './integration.ts';
import { computePhaseStats } from './phaseStats.ts';

/**
 * THE BAR IS NOT INVENTED — THIS OPTIMIZER REACHED IT ITSELF.
 *
 * 20260820.2 came out of this app on 2026-08-20 (all 25 of its components
 * carry a catalog-snap stamp, and the branch-prefixed part ids are the ones
 * `mergeSynthesizedSchematics` writes, so it is a built design and not a hand
 * assembly). What it delivers on Sanders three-way set is the reference every
 * later design step has to stay near:
 *
 *     25 components · flatness ±2.18 dB (455 Hz – 16 kHz)
 *     W-M  avg 6.1°  P95 11.6°  handover 498 Hz
 *     M-T  avg 7.1°  P95 13.1°  handover 2101 Hz
 *
 * MEASURED ON THE REPO FIXTURES rather than on his 7.8 MB project, and the two
 * agree closely enough to make the substitution honest: the fixtures give
 * ±2.18 dB, W-M 7.4°, M-T 7.0° — the M-T figure, which is the one under
 * suspicion, lands within 0.1° of the project measurement.
 *
 * WHY M-T SPECIFICALLY. Sander reported a regression as "18 components, worse
 * phase, higher BOM". Two halves of that did not survive measurement: the file
 * holds 25 components, not 18, and current scan candidates deliver 23–30 with
 * BETTER flatness (±1.38–1.80 against ±2.18). His "12 and 14 degrees" turned
 * out to be P95 values compared against the scan's uniform AVERAGE — two
 * different statistics. What IS real, on one yardstick, is the mid-to-tweeter
 * average: 7.1° here against 12–19° from every recent candidate.
 *
 * So this test pins the one quantity that moved, and it pins it on the design
 * that proves the target is reachable.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-3way');
const grid = logspace(455, 16000, 500);
const SILENT_GHOST_DB = -400;

/** Banded exactly as the app does it: silent outside each file's own range. */
function banded(file: string) {
  const p = parseFrd(readFileSync(join(FIXTURES, file), 'utf-8'));
  const g = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0];
  const f1 = p.freq[p.freq.length - 1];
  return {
    freq: grid,
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT_GHOST_DB : v)),
    phaseDeg: g.phaseDeg,
  };
}
function zOf(file: string) {
  const z = parseZma(readFileSync(join(FIXTURES, file), 'utf-8'));
  return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
}

const responses = {
  woofer: banded('woofer-pair-hor0.frd'),
  mid: banded('mid-hor0.txt'),
  tweeter: banded('tweeter-hor0.txt'),
};
const driverZ = {
  woofer: zOf('woofers-parallel.zma'),
  mid: zOf('mid.zma'),
  tweeter: zOf('tweeter.zma'),
};

/** Solve a network on the fixtures and measure it the way the panels do. */
function measure(parts: Parameters<typeof crossoverToNetlist>[0]['parts']) {
  const { netlist } = crossoverToNetlist({ name: 'ref', parts: [...parts] });
  const sol = solveNetwork(netlist, grid, driverZ);
  const branch: Record<string, ReturnType<typeof banded>> = {};
  for (const d of sol.drivers) {
    const r = responses[d.model as keyof typeof responses];
    if (r) branch[d.model] = applyTransfer(r, sol.transfers[d.id]);
  }
  const sum = combineN([branch.woofer, branch.mid, branch.tweeter].map((response) => ({ response })));
  const flat = bandStats(grid, sum.combinedSpl, [455, 16000], 'median');
  const pair = (a: ReturnType<typeof banded>, b: ReturnType<typeof banded>) => {
    const c = combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false });
    const ig = computeIntegration(c);
    const ps = computePhaseStats(c.relativePhaseDeg, ig.points);
    return { avg: ps?.avgErrorDeg ?? null, p95: ps?.p95ErrorDeg ?? null, xoHz: ig.overlapCentreHz };
  };
  return {
    parts: [...parts].filter((p) => /^(Resistor|Inductor|Capacitor)$/.test(p.type)).length,
    flat,
    wm: pair(branch.woofer, branch.mid),
    mt: pair(branch.mid, branch.tweeter),
  };
}

describe('M-T phase regression — a bar this optimizer has already cleared', () => {
  const ref = deserializeFilter(
    readFileSync(join(FIXTURES, 'reference-20260820.2.adsfilter.json'), 'utf-8'),
  );

  it('the reference is an OPTIMIZER product, not a hand assembly', () => {
    /* Worth pinning, because the whole argument rests on it: a target nobody
     * ever reached is a wish, and one this app produced is a regression bar. */
    const rlc = ref.parts.filter((p) => /^(Resistor|Inductor|Capacitor)$/.test(p.type));
    expect(rlc.length).toBe(25);
    // Every component carries a catalog-snap stamp — the snap ran over it.
    expect(rlc.every((p) => typeof p.catalog === 'string' && p.catalog.length > 0)).toBe(true);
    // And the branch-prefixed ids are what mergeSynthesizedSchematics writes.
    expect(rlc.some((p) => (p.partId ?? '').startsWith('B·'))).toBe(true);
    expect(rlc.some((p) => (p.partId ?? '').startsWith('C·'))).toBe(true);
  });

  it('delivers M-T average phase near 7 degrees on the measured set', () => {
    const m = measure(ref.parts);
    // THE NUMBER UNDER SUSPICION. Recent candidates deliver 12–19 degrees here.
    expect(m.mt.avg!).toBeLessThan(8);
    expect(m.mt.avg!).toBeGreaterThan(5); // not a degenerate "no overlap" reading
    // The handover it is measured at, so a future change cannot pass this test
    // by moving the crossing somewhere the pair barely overlaps.
    expect(m.mt.xoHz!).toBeGreaterThan(1800);
    expect(m.mt.xoHz!).toBeLessThan(2500);
  });

  it('and the other axes are healthy, so M-T is not bought with them', () => {
    /* The control. If a later design reaches 7 degrees at M-T by wrecking the
     * response or the other handover, this test would still pass on its own —
     * so the yardstick carries its companions. */
    const m = measure(ref.parts);
    expect(m.wm.avg!).toBeLessThan(10);
    expect(m.flat.peak).toBeLessThan(3);
    expect(m.parts).toBe(25);
  });

  it('the fixtures stand in for his project within a tenth of a degree at M-T', () => {
    /* Recorded so the substitution can be checked rather than trusted. On his
     * own 2026-08-16 project this network measures M-T avg 7.1°, W-M 6.1° and
     * ±2.18 dB; on these fixtures 7.0°, 7.4° and ±2.18 dB. The M-T figure — the
     * one this file exists for — agrees to 0.1°. */
    const m = measure(ref.parts);
    expect(Math.abs(m.mt.avg! - 7.1)).toBeLessThan(0.5);
    expect(Math.abs(m.flat.peak - 2.18)).toBeLessThan(0.1);
  });
});
