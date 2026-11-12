/**
 * G-18 — A SEED COIL'S DCR FOLLOWS ITS INDUCTANCE UNDER THE SNAP (12-11-2026).
 *
 * The finding: in catalogue-snap mode the synthesis writes each coil's PICK
 * DCR into the `DCR` param and the solver reads it as a fixed series
 * resistance, however far the value tune moves the inductance. On the
 * three-way demo one shunt coil shrank to 0.048 mH and kept the 5.99 Ω of
 * its synthesis-time pick; the tune leaned on those ohms, every gate judged
 * with them, and the end snap — no 0.048 mH coil has more than 0.27 Ω —
 * took min |Z| from 3.32 to 1.82 Ω and refused. The repair: under the snap's
 * own gate, a free coil with a DCR param and no stated family gets a fit
 * anchored at its seed with the synthesis model's own exponent, and
 * `refreshDcr` moves it with the value as A5e.3 moves a stated family.
 *
 * The claims: the fit itself by hand; the tuner writes the TRACKED ohms into
 * the delivered param; and three P2 sides — no snap, no catalogue, no param
 * — each leave the DCR exactly as the seed carried it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { applyCatalogPayload, branchDcrBudgetOhms, coilDcr, hasImportedCatalog, pickCandidates, type CatalogPick } from '../../catalog.ts';
import { deserializeCatalog } from '../../catalogFile.ts';
import {
  COIL_DCR_MODEL_EXPONENT,
  SEED_ANCHORED_DCR_REACH,
  catalogFamilyOf,
  dcrOf,
  roundDcr,
  seedAnchoredCoilDcrFit,
  snapDcrCeilingOhm,
} from '../../coilDcr.ts';
import { fromPolar, type Complex } from '../../complex.ts';
import { logspace, resample } from '../../dsp.ts';
import { meetsAmpFloor } from '../../impedanceFloor.ts';
import { solveNetwork } from '../../network.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const V9 = join(HERE, '..', '..', 'parsers', 'fixtures', 'catalog-v9.json');
const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/** The seed's own L1: 0.4 mH with a STALE 3.0 Ω — thin wire the tune cannot buy at any value it moves to. */
const SEED_L_MH = 0.4;
const STALE_DCR = 3.0;
function seedWith(dcr: number | null) {
  return v2SeedParts().map((q) =>
    q.partId === 'L1'
      ? {
          ...q,
          params: [
            ...q.params.filter((p) => p.name !== 'DCR'),
            ...(dcr === null ? [] : [{ name: 'DCR', value: dcr, unit: 'Ω' }]),
          ],
        }
      : q,
  );
}
function run(seed: ReturnType<typeof seedWith>, extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(seed, V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}
const l1Of = (r: ReturnType<typeof run>) => {
  const q = r.parts.find((p) => p.partId === 'L1')!;
  return {
    mH: q.params.find((p) => p.name === 'L')!.value,
    dcr: q.params.find((p) => p.name === 'DCR')?.value,
    catalog: q.catalog,
  };
};
/** The v9 catalogue, as the app ships it. */
function loadCatalogue() {
  const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
  applyCatalogPayload({ series: imp.series, parts: imp.parts, disabled: [] });
  expect(hasImportedCatalog()).toBe(true);
}
/** The note's own grammar: "L1 <seed Ω> Ω @ <seed mH> mH → <ohm> Ω @ <mH> mH". */
const trackedPoint = (note: string | undefined) => {
  const m = note?.match(/L1 ([\d.]+) Ω @ ([\d.]+) mH → ([\d.]+) Ω @ ([\d.]+) mH/);
  return m ? { seedOhm: Number(m[1]), seedMh: Number(m[2]), ohm: Number(m[3]), mH: Number(m[4]) } : null;
};

describe('G-18 — the seed-anchored fit, by hand', () => {
  const fit = seedAnchoredCoilDcrFit('L1', SEED_L_MH * 1e-3, STALE_DCR);

  it('passes exactly through the seed and follows the synthesis model’s exponent away from it', () => {
    expect(dcrOf(SEED_L_MH * 1e-3, fit)!.ohm).toBeCloseTo(STALE_DCR, 12);
    const half = dcrOf(0.5 * SEED_L_MH * 1e-3, fit)!.ohm;
    expect(half / STALE_DCR).toBeCloseTo(0.5 ** COIL_DCR_MODEL_EXPONENT, 12);
    // A coil that shrinks LOSES copper: never the stale ohms at a tenth of the henries.
    expect(dcrOf(0.1 * SEED_L_MH * 1e-3, fit)!.ohm).toBeLessThan(STALE_DCR / 4);
  });

  it('the exponent IS the synthesis model’s (`coilDcr`), not a second number', () => {
    expect(coilDcr(2e-3, 1.4) / coilDcr(1e-3, 1.4)).toBeCloseTo(2 ** COIL_DCR_MODEL_EXPONENT, 12);
    // …and the recorded gauge is the model's own inverse at the seed.
    expect(coilDcr(SEED_L_MH * 1e-3, fit.wireMm!)).toBeCloseTo(STALE_DCR, 9);
  });

  it('is no family: nothing in the catalogue can match it, and a seed without ohms or henries is refused', () => {
    const imp = deserializeCatalog(readFileSync(V9, 'utf-8'));
    for (const p of imp.parts) expect(catalogFamilyOf(p)).not.toBe(fit.family);
    expect(fit.n).toBe(0);
    expect(() => seedAnchoredCoilDcrFit('L1', 0, 1)).toThrow();
    expect(() => seedAnchoredCoilDcrFit('L1', 1e-3, 0)).toThrow();
  });
});

describe('G-18 — through the tuner on the two-way fixture', () => {
  it('under the snap the continuous ohms the snap starts from are the TRACKED fit at the delivered inductance, not the stale seed ohms — and the note says so', () => {
    loadCatalogue();
    const r = run(seedWith(STALE_DCR), { catalogSnap: true });
    const pt = trackedPoint(r.dcrTrackNote);
    expect(pt, r.dcrTrackNote).not.toBeNull();
    expect(pt!.seedOhm).toBe(STALE_DCR);
    expect(pt!.seedMh).toBe(SEED_L_MH);
    // The premise: the tune moved the coil — a claim about a coil that stood
    // still would be vacuous (stale and tracked coincide at the seed).
    expect(Math.abs(pt!.mH - SEED_L_MH)).toBeGreaterThan(1e-3);
    const fit = seedAnchoredCoilDcrFit('L1', SEED_L_MH * 1e-3, STALE_DCR);
    expect(pt!.ohm).toBe(roundDcr(dcrOf(pt!.mH * 1e-3, fit)!.ohm));
    expect(pt!.ohm).not.toBe(STALE_DCR);
    // …and the snap then landed: the delivered coil is a catalogue part with the pick's own ohms.
    const l1 = l1Of(r);
    expect(l1.catalog).toBeDefined();
    expect(l1.dcr).not.toBe(STALE_DCR);
  });

  it('P2 — without the snap the seed’s ohms stay exactly as handed over, and nothing is noted', () => {
    loadCatalogue();
    const r = run(seedWith(STALE_DCR), { catalogSnap: false });
    expect(l1Of(r).dcr).toBe(STALE_DCR);
    expect(r.dcrTrackNote).toBeUndefined();
  });

  it('P2 — with the snap on but no catalogue loaded, nothing tracks', () => {
    applyCatalogPayload({ series: [], parts: [], disabled: [] });
    expect(hasImportedCatalog()).toBe(false);
    const r = run(seedWith(STALE_DCR), { catalogSnap: true });
    expect(l1Of(r).dcr).toBe(STALE_DCR);
    expect(r.dcrTrackNote).toBeUndefined();
  });

  it('P2 — a seed coil without a DCR param is not anchored: the note does not name it, and what it carries after the snap is the pick’s', () => {
    loadCatalogue();
    const r = run(seedWith(null), { catalogSnap: true });
    // The fixture's OTHER coil (L2, 0.8 mH with its 0.2 Ω) is anchored as
    // before, so the note exists — and L1 is not in it.
    expect(r.dcrTrackNote).toContain('L2 ');
    expect(trackedPoint(r.dcrTrackNote)).toBeNull();
    const l1 = l1Of(r);
    expect(l1.catalog).toBeDefined();
    expect(l1.dcr).toBeGreaterThan(0);
  });
});

/* ---- G-18 — THE DEMO NETWORK THE SNAP REFUSED ---------------------------
 *
 * The delivered continuous network of the three-way demo (`demo_g18_geleverd`:
 * Sander's answers, the 4–8 Ω profile's 3.2 Ω floor), with the demo's own
 * measurements. Its woofer series coil L1 carries 1.42 Ω of tracked copper
 * that holds the floor at 82 Hz — below the chain grid, which starts at the
 * gated set's 397 Hz. The snap's branch budget allowed that coil 0.27 Ω, the
 * pool held core coils only, and the snap took the floor away and refused.
 * Measured part by part, with every other part continuous, before the repair. */
const KOAN = join(HERE, '..', '..', 'parsers', 'fixtures', 'koan-3way');
const G18 = JSON.parse(
  readFileSync(join(HERE, '..', '..', '..', '..', 'test-fixtures', 'demo_g18_geleverd.json'), 'utf-8'),
) as { herkomst: string; geleverd_netwerk: VxpPart[] };
/** The 4–8 Ω profile's floor (guidedProfiles), the floor this network was judged on. */
const DEMO_FLOOR_OHM = 3.2;
/** The chain frame on the gated demo set: the far-field floor up, ~14 points per octave (E-5). */
const DEMO_GRID = logspace(397, 20000, 82);
const demoResp = (name: string) => {
  const f = parseFrd(readFileSync(join(KOAN, name), 'utf-8'));
  return resample(f.freq, f.spl, f.phase, DEMO_GRID, { clampEdges: true });
};
const demoSweeps = {
  woofer: parseZma(readFileSync(join(KOAN, 'woofers-parallel.zma'), 'utf-8')),
  mid: parseZma(readFileSync(join(KOAN, 'mid.zma'), 'utf-8')),
  tweeter: parseZma(readFileSync(join(KOAN, 'tweeter.zma'), 'utf-8')),
};
const demoZOn = (freqs: readonly number[]): Record<string, Complex[]> =>
  Object.fromEntries(
    Object.entries(demoSweeps).map(([model, z]) => {
      const g = resample(z.freq, z.magnitude, z.phase, [...freqs], { clampEdges: true });
      return [model, g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180))];
    }),
  );
/** The union of the three measured sweep grids: where M-B/|Z| judges (V32). */
const SWEEP_GRID = [...new Set(Object.values(demoSweeps).flatMap((z) => z.freq))].sort((a, b) => a - b);
const SWEEP_Z = demoZOn(SWEEP_GRID);
const sweepMinOhm = (ps: readonly VxpPart[]): number => {
  const nl = crossoverToNetlist({ name: 'g18', parts: [...ps] } as VxpCrossover).netlist;
  const sol = solveNetwork(nl, SWEEP_GRID, SWEEP_Z);
  let min = Infinity;
  for (const c of sol.inputZ) min = Math.min(min, Math.hypot(c.re, c.im));
  return min;
};
/** The barrier's safety set: the sweeps' whole extent (V33). */
const SAFETY_GRID = logspace(
  Math.min(...Object.values(demoSweeps).map((z) => z.freq[0])),
  Math.max(...Object.values(demoSweeps).map((z) => z.freq[z.freq.length - 1])),
  240,
);
const paramOf = (p: VxpPart, name: string) => p.params.find((x) => x.name === name)?.value;
const withPick = (ps: readonly VxpPart[], id: string, pick: CatalogPick): VxpPart[] =>
  ps.map((p) =>
    p.partId === id
      ? {
          ...p,
          params: p.params.map((x) =>
            x.name === 'L' ? { ...x, value: pick.value * 1e3 } : x.name === 'DCR' ? { ...x, value: pick.seriesR } : x,
          ),
        }
      : p,
  );
/** L1's share of the branch budget, as the snap splits it: the woofer's own minimum |Z| on the
 *  evaluation grid against the source tier, split over the branch's series coils by L^0.65. */
const l1BranchCeilingOhm = (seed: readonly VxpPart[], driverZ: Record<string, Complex[]>): number => {
  const woofMin = Math.min(...driverZ.woofer.map((c) => Math.hypot(c.re, c.im)));
  const w = (id: string) => (paramOf(seed.find((p) => p.partId === id)!, 'L') ?? 0) ** 0.65;
  return (branchDcrBudgetOhms(woofMin) * w('L1')) / (w('L1') + w('L3'));
};
const medianOhm = (driverZ: Record<string, Complex[]>): number => {
  const zs = Object.values(driverZ).flatMap((z) => z.map((c) => Math.hypot(c.re, c.im))).sort((a, b) => a - b);
  return zs[Math.floor(zs.length / 2)];
};

describe('G-18 — the demo network the snap refused', () => {
  it('the mechanism: the branch budget leaves L1 no copper near what the tune leaned on and the nearest such coil drops the sweep minimum through the floor; the tracked ceiling with the per-part allowance off keeps a coil within reach, and that one holds it', () => {
    loadCatalogue();
    const seed = G18.geleverd_netwerk;
    const l1 = seed.find((p) => p.partId === 'L1')!;
    const mH = paramOf(l1, 'L')!;
    const dcr = paramOf(l1, 'DCR')!;
    // The premise: the continuous design holds the floor on the sweep.
    expect(meetsAmpFloor(sweepMinOhm(seed), DEMO_FLOOR_OHM)).toBe(true);
    const driverZ = demoZOn(DEMO_GRID);
    const refOhms = medianOhm(driverZ);
    // The branch budget, as it was: nothing in the pool comes within reach of the tune's copper.
    const ceilBranch = l1BranchCeilingOhm(seed, driverZ);
    expect(ceilBranch).toBeLessThan(dcr / SEED_ANCHORED_DCR_REACH);
    const branchPool = pickCandidates('L', mH * 1e-3, 3, { profile: 'balanced', refOhms }, 'series', ceilBranch);
    expect(branchPool.length).toBeGreaterThan(0);
    expect(Math.max(...branchPool.map((c) => c.seriesR))).toBeLessThan(dcr / SEED_ANCHORED_DCR_REACH);
    // …and the nearest of them, alone, takes the floor away.
    expect(meetsAmpFloor(sweepMinOhm(withPick(seed, 'L1', branchPool[0])), DEMO_FLOOR_OHM)).toBe(false);
    // The tracked ceiling is the tracked ohms widened by the catalogue's reach, by construction.
    const fit = seedAnchoredCoilDcrFit('L1', mH * 1e-3, dcr);
    const ceilTracked = snapDcrCeilingOhm(mH * 1e-3, fit)!;
    expect(ceilTracked).toBeCloseTo(dcr * SEED_ANCHORED_DCR_REACH, 9);
    // With the per-part allowance ON that ceiling is clipped and the pool is the same core-coil pool.
    const clipped = pickCandidates('L', mH * 1e-3, 3, { profile: 'balanced', refOhms }, 'series', ceilTracked);
    expect(clipped.some((c) => c.seriesR >= dcr / SEED_ANCHORED_DCR_REACH)).toBe(false);
    // With it OFF the pool holds coils within reach of the tracked copper, and the nearest in copper holds the floor.
    const trackedPool = pickCandidates('L', mH * 1e-3, 3, { profile: 'balanced', refOhms: 0 }, 'series', ceilTracked);
    const near = trackedPool
      .filter((c) => c.seriesR >= dcr / SEED_ANCHORED_DCR_REACH && c.seriesR <= dcr * SEED_ANCHORED_DCR_REACH)
      .sort((a, b) => Math.abs(Math.log(a.seriesR / dcr)) - Math.abs(Math.log(b.seriesR / dcr)));
    expect(near.length).toBeGreaterThan(0);
    expect(meetsAmpFloor(sweepMinOhm(withPick(seed, 'L1', near[0])), DEMO_FLOOR_OHM)).toBe(true);
  });

  it('through the tuner, every other part held: the snap LANDS on the delivered demo network — L1 a catalogue part carrying copper the branch budget forbade, and the floor met on the sweep', () => {
    loadCatalogue();
    /* Only L1 free. This harness is not the app's objective (its grid, band
     * and cage differ) and a free tune walks this network elsewhere — to a
     * floor held by other parts, where nothing here is tested. Held, the
     * woofer's copper stays the thing that holds the floor, as it did in the
     * app; the tune still moves L1 (3.26 → 3.84 mH here) and the snap still
     * has to choose its wire. */
    const seed = G18.geleverd_netwerk.map((p) =>
      (p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor') && p.partId && p.partId !== 'L1'
        ? { ...p, locked: true }
        : p,
    );
    const driverZ = demoZOn(DEMO_GRID);
    const r = optimizeNetworkValues(seed, DEMO_GRID, demoResp('woofer-pair-hor0.frd'), demoResp('tweeter-hor0.txt'), driverZ, ADJUST, {
      phasePriority: 0.5,
      midBranch: { response: demoResp('mid-hor0.txt'), adjust: ADJUST },
      maxIterations: 40,
      catalogSnap: true,
      snapPrefs: { profile: 'balanced' },
      ampMinLoadOhm: DEMO_FLOOR_OHM,
      zFloorBarrier: true,
      zFloorBarrierSource: 'safety',
      zFloorBarrierImpedance: { grid: SAFETY_GRID, driverZ: demoZOn(SAFETY_GRID), span: 'the demo sweeps, whole extent' },
      gateViolation: (ps) => {
        const z = sweepMinOhm(ps);
        return meetsAmpFloor(z, DEMO_FLOOR_OHM)
          ? null
          : `M-B/|Z|: ${z.toFixed(2)} Ω falls below the stated floor of ${DEMO_FLOOR_OHM.toFixed(2)} Ω`;
      },
    });
    expect(r.snapNote ?? '', r.snapNote).not.toMatch(/snap REFUSED/);
    const l1 = l1Of(r);
    expect(l1.catalog).toBeDefined();
    expect(meetsAmpFloor(sweepMinOhm(r.parts), DEMO_FLOOR_OHM)).toBe(true);
    // The wire: more copper than ANY coil the branch budget's pool offers at the delivered inductance.
    const budgetPool = pickCandidates(
      'L',
      l1.mH * 1e-3,
      3,
      { profile: 'balanced', refOhms: medianOhm(driverZ) },
      'series',
      l1BranchCeilingOhm(seed, driverZ),
    );
    expect(budgetPool.length).toBeGreaterThan(0);
    expect(l1.dcr!).toBeGreaterThan(Math.max(...budgetPool.map((c) => c.seriesR)));
  }, 300_000);
});
