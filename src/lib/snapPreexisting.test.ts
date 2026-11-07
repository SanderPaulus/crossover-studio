/**
 * THE SNAP REFUSES ONLY WHAT IT CAUSES (07-11-2026).
 *
 * The catalogue snap rolls a candidate back to continuous values when real
 * parts would break a hard limit. On the three-way demo every snap was refused
 * although the CONTINUOUS design already broke the 2.0 Ω source-resistance
 * limit — a series shelf in the woofer path — so a design the run had already
 * delivered came back unbuyable. Two claims, on the shared tweeweg fixture with
 * the real catalogue: (1) with a limit the continuous design already breaks,
 * the snap still lands and says the limit was broken BEFORE it; (2) with no
 * limit at all, the snap lands and says nothing of the kind (P2).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setCustomSeries } from './catalog.ts';
import { deserializeCatalog } from './catalogFile.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './engine2/optimizer/v2.fixture.ts';

const imp = deserializeCatalog(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'catalog-v9.json'), 'utf-8'),
);
setCustomSeries(imp.series, imp.parts);
afterAll(() => setCustomSeries([]));

const run = (extra: object) => {
  const { wBase, tBase } = v2Responses();
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(),
    { offsetMm: 0, trimDb: 0, inverted: false },
    { phasePriority: 0.5, maxIterations: 200, catalogSnap: true, ...extra });
};
const snappedCount = (r: ReturnType<typeof run>) =>
  r.parts.filter((p) => (p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor') && p.catalog).length;

describe('the snap refuses only what it causes', () => {
  it('a limit the continuous design already breaks: the snap lands, and says so', () => {
    const r = run({ rSourceDisqualifyOhm: 1e-6 });
    expect(snappedCount(r)).toBeGreaterThan(0);
    expect(r.snapNote ?? '').toMatch(/already broken BEFORE the snap/);
    expect(r.snapNote ?? '').not.toMatch(/snap REFUSED/);
  });

  it('no limit: the snap lands and the note says nothing of the kind (P2)', () => {
    const r = run({});
    expect(snappedCount(r)).toBeGreaterThan(0);
    expect(r.snapNote ?? '').not.toMatch(/already broken|REFUSED/);
  });
});
