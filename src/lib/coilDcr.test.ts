/**
 * A5e.3 — THE COIL DCR MODEL, on the bench.
 *
 * The four test kinds of the metric skill, one bank each.
 *
 *  1. HAND CALCULATION. A family built from an exact power law reproduces its
 *     exponent and its coefficient with zero residual; `dcrOf` reads it back at
 *     a point that is a whole number by construction.
 *  2. THE CATALOGUE. The v8 file fits into families whose exponents lie where
 *     the physics puts an air coil at fixed gauge (0.5–0.7), the 1.4 mm family
 *     reproduces the coefficient the app's own `coilDcr(1.4 mm)` estimate was
 *     calibrated on, and every SKU sits inside its family's own reported
 *     residual — which is what makes "the snap replaces the fit by a real part
 *     within the residual" a claim and not a hope.
 *  3. THE STAMP. On a paper three-way: a series coil reads its way's family, a
 *     SHUNT coil reads it too (the M-1 finding lives in a shunt coil), a coil
 *     on a way without a family stays lossless and is named, a snapped coil
 *     keeps its real DCR, a shared coil reads the lowest-DCR family of the ways
 *     behind it, and stamping is idempotent.
 *  4. OUTSIDE THE RANGE the power law is continued and flagged — never zero.
 *  5. THE DECLARATION derives the model from stated families and declares
 *     ABSENT with the reason otherwise (P4), and the key moves the fingerprint.
 *  6. THE SNAP stays inside the family when the family covers the value, and
 *     falls back to the whole pool when it cannot.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserializeCatalog } from './catalogFile.ts';
import { catalogParts, coilDcr, pickCandidates, setCustomSeries, type CatalogPart } from './catalog.ts';
import {
  catalogFamilyOf,
  coilDcrInventory,
  coilDcrModelFor,
  coilDcrModelKey,
  COIL_DCR_FIT_VERSION,
  dcrOf,
  fitCoilDcrFamilies,
  fitForCoil,
  stampCoilDcr,
  waysOfElements,
  type CoilDcrFit,
  type CoilDcrModel,
} from './coilDcr.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';
import { declareCandidateChoices } from './engine2/optimizer/candidateDeclaration.ts';
import { choicesKey } from './engine2/optimizer/choices.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const V8 = join(HERE, 'parsers', 'fixtures', 'gemini-catalog-v8.json');

const part = (brand: string, series: string, wireMm: number, henry: number, dcr: number): CatalogPart => ({
  id: `${brand}-${series}-${wireMm}-${henry}`,
  brand,
  series,
  kind: 'L',
  value: henry,
  seriesR: dcr,
  wireMm,
});

/* ---- a paper family: DCR = 0.25 · (L/mH)^0.6 exactly ---- */
const K = 0.6;
const A = 0.25;
const paperFamily = (): CatalogPart[] =>
  [0.1, 0.2, 0.5, 1, 2, 5, 10].map((mH) => part('Paper', 'Coil', 1.0, mH * 1e-3, A * mH ** K));

describe('A5e.3 — the fit', () => {
  it('reproduces an exact power law with zero residual, and reads it back', () => {
    const fits = fitCoilDcrFamilies(paperFamily());
    expect(fits).toHaveLength(1);
    const f = fits[0];
    expect(f.family).toBe('paper|coil|1');
    expect(f.k).toBeCloseTo(K, 12);
    expect(f.ohmAt1mH).toBeCloseTo(A, 12);
    expect(f.rmsPct).toBeCloseTo(0, 9);
    expect(f.maxPct).toBeCloseTo(0, 9);
    expect(f.n).toBe(7);
    expect(f.rangeH).toEqual([0.1e-3, 10e-3]);
    // 4 mH → 0.25 · 4^0.6; by hand: 4^0.6 = e^(0.6·ln 4) = 2.2974...
    const r = dcrOf(4e-3, f)!;
    expect(r.ohm).toBeCloseTo(A * 4 ** K, 12);
    expect(r.inRange).toBe(true);
    expect(dcrOf(0, f)).toBeNull();
    expect(dcrOf(-1, f)).toBeNull();
  });

  it('continues the power law outside the range and FLAGS it — never zero', () => {
    const f = fitCoilDcrFamilies(paperFamily())[0];
    const above = dcrOf(20e-3, f)!;
    expect(above.inRange).toBe(false);
    expect(above.ohm).toBeCloseTo(A * 20 ** K, 12);
    const below = dcrOf(0.05e-3, f)!;
    expect(below.inRange).toBe(false);
    expect(below.ohm).toBeGreaterThan(0);
    // continuous at the edge: the value just above the range is the value at it
    expect(Math.abs(dcrOf(10.0001e-3, f)!.ohm - dcrOf(10e-3, f)!.ohm)).toBeLessThan(1e-4);
  });

  it('skips parts without a DCR, families with too few SKUs, and families with no slope', () => {
    const noDcr = paperFamily().map((p) => ({ ...p, seriesR: 0 }));
    expect(fitCoilDcrFamilies(noDcr)).toHaveLength(0);
    expect(fitCoilDcrFamilies(paperFamily().slice(0, 2))).toHaveLength(0);
    const flat = [1, 1, 1].map((mH, i) => ({ ...part('Flat', 'Coil', 1, mH * 1e-3, 0.3), id: `f${i}` }));
    expect(fitCoilDcrFamilies(flat)).toHaveLength(0);
  });
});

describe('A5e.3 — the v8 catalogue', () => {
  const imported = deserializeCatalog(readFileSync(V8, 'utf-8'));
  const fits = fitCoilDcrFamilies(imported.parts);
  const byId = new Map(fits.map((f) => [f.family, f]));

  it('fits every coil family, with air-core exponents where the physics puts them', () => {
    const coils = imported.parts.filter((p) => p.kind === 'L');
    expect(coils.length).toBe(2116);
    expect(fits.length).toBe(25);
    const air = fits.filter((f) => f.series === 'Air Core Wire Coil');
    expect(air.length).toBe(11);
    for (const f of air) {
      expect(f.k, f.label).toBeGreaterThan(0.5);
      expect(f.k, f.label).toBeLessThan(0.7);
      expect(f.rmsPct, f.label).toBeLessThan(12);
    }
    /* The 1.4 mm family is the one the app's own estimate was calibrated on
     * (`catalog.ts`: "0.29·(L/mH)^0.65 Ω @ 1.4 mm"). The fit lands beside it
     * at 1 mH — the two are one measurement read twice. */
    const f14 = byId.get('jantzen|air core wire coil|1.4')!;
    expect(f14).toBeTruthy();
    expect(Math.abs(f14.ohmAt1mH - coilDcr(1e-3, 1.4)) / coilDcr(1e-3, 1.4)).toBeLessThan(0.1);
    expect(f14.n).toBe(170);
    expect(f14.rangeH[1]).toBeCloseTo(22e-3, 9);
  });

  it('every SKU lies inside its own family\'s reported residual (the snap-continuity claim)', () => {
    let checked = 0;
    for (const p of imported.parts) {
      if (p.kind !== 'L' || !(p.seriesR > 0)) continue;
      const f = byId.get(catalogFamilyOf(p));
      if (!f) continue;
      const r = dcrOf(p.value, f)!;
      expect(r.inRange, p.id).toBe(true);
      const relPct = Math.abs(Math.log(p.seriesR / r.ohm)) * 100;
      expect(relPct, `${p.id}: ${relPct.toFixed(1)} % against max ${f.maxPct.toFixed(1)} %`).toBeLessThanOrEqual(f.maxPct + 1e-9);
      checked++;
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('a family-restricted snap lands inside the family; a family that cannot cover the value yields the whole pool', () => {
    setCustomSeries([], imported.parts);
    try {
      const f14 = byId.get('jantzen|air core wire coil|1.4')!;
      const only = (p: CatalogPart) => catalogFamilyOf(p) === f14.family;
      const picks = pickCandidates('L', 2.2e-3, 3, null, 'series', undefined, only);
      expect(picks.length).toBeGreaterThan(0);
      for (const pk of picks) for (const p of pk.parts) expect(catalogFamilyOf(p)).toBe(f14.family);
      // …and the real part's DCR is within the family's residual of the fit
      const fitOhm = dcrOf(picks[0].value, f14)!.ohm;
      expect(Math.abs(Math.log(picks[0].seriesR / fitOhm)) * 100).toBeLessThanOrEqual(f14.maxPct + 1e-9);
      // 60 mH: no 1.4 mm single part; the pool stands and something covers it.
      const wide = pickCandidates('L', 60e-3, 3, null, 'series', undefined, only);
      expect(wide.length).toBeGreaterThan(0);
      expect(catalogParts().some((p) => p.kind === 'L' && p.value >= 50e-3)).toBe(true);
    } finally {
      setCustomSeries([]);
    }
  });
});

/* ---- a paper three-way: series and shunt coils on every way ---- */
let n = 0;
const P = (type: 'Resistor' | 'Capacitor' | 'Inductor', value: number, a: [number, number], b: [number, number], extra: Partial<VxpPart> = {}): VxpPart => {
  const name = type === 'Resistor' ? 'R' : type === 'Capacitor' ? 'C' : 'L';
  n++;
  return { type, partId: `${name}${n}`, params: [{ name, value, unit: '' }], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], ...extra } as VxpPart;
};
const D = (model: string, a: [number, number], b: [number, number]): VxpPart =>
  ({ type: 'Driver', partId: `D-${model}`, model, params: [], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }) as VxpPart;
const G = (a: [number, number], b: [number, number]): VxpPart =>
  ({ type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }, { name: 'Rg', value: 0.001, unit: 'Ω' }], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }) as VxpPart;
const GND = (a: [number, number]): VxpPart => ({ type: 'Ground', params: [], wires: [{ x: a[0], y: a[1] }] }) as VxpPart;

function paperThreeWay(): { parts: VxpPart[]; ids: Record<string, string> } {
  n = 0;
  const ids: Record<string, string> = {};
  const parts: VxpPart[] = [G([0, 0], [0, 20]), GND([0, 20])];
  // woofer: series L (2.0 mH), shunt C, driver
  const wL = P('Inductor', 2.0, [0, 0], [4, 0]);
  ids.wSeries = wL.partId!;
  parts.push(wL, P('Capacitor', 30, [4, 0], [4, 20]), GND([4, 20]), D('woofer', [4, 0], [6, 20]), GND([6, 20]));
  // mid: series C, SHUNT L (0.7 mH), driver
  const mC = P('Capacitor', 100, [0, 0], [10, 0]);
  const mL = P('Inductor', 0.7, [10, 0], [10, 20]);
  ids.mShunt = mL.partId!;
  parts.push(mC, mL, GND([10, 20]), D('mid', [10, 0], [12, 20]), GND([12, 20]));
  // tweeter: series C, shunt L (0.3 mH), driver
  const tC = P('Capacitor', 10, [0, 0], [16, 0]);
  const tL = P('Inductor', 0.3, [16, 0], [16, 20]);
  ids.tShunt = tL.partId!;
  parts.push(tC, tL, GND([16, 20]), D('tweeter', [16, 0], [18, 20]), GND([18, 20]));
  return { parts, ids };
}

const modelOf = (familyByWay: Record<string, string>, fits: CoilDcrFit[]): CoilDcrModel => coilDcrModelFor(familyByWay, fits).model!;

describe('A5e.3 — the stamp', () => {
  const fits = [
    ...fitCoilDcrFamilies(paperFamily()),
    ...fitCoilDcrFamilies([0.1, 0.2, 0.5, 1, 2, 5].map((mH) => part('Paper', 'Fat', 1.4, mH * 1e-3, 0.5 * A * mH ** K))),
  ];
  const thin = 'paper|coil|1';
  const fat = 'paper|fat|1.4';

  it('attributes series AND shunt coils to their way', () => {
    const { parts, ids } = paperThreeWay();
    const ways = waysOfElements(crossoverToNetlist({ name: 't', parts } as VxpCrossover).netlist);
    expect(ways.get(ids.wSeries)).toEqual(['woofer']);
    expect(ways.get(ids.mShunt)).toEqual(['mid']);
    expect(ways.get(ids.tShunt)).toEqual(['tweeter']);
  });

  it('stamps every coil of a way with a family, names the lossless ones, and is idempotent', () => {
    const { parts, ids } = paperThreeWay();
    const model = modelOf({ woofer: fat, tweeter: thin }, fits);
    const s = stampCoilDcr(parts, model);
    const dcr = (id: string) => s.parts.find((p) => p.partId === id)!.params.find((q) => q.name === 'DCR')?.value;
    expect(dcr(ids.wSeries)).toBeCloseTo(0.5 * A * 2 ** K, 3);
    expect(dcr(ids.tShunt)).toBeCloseTo(A * 0.3 ** K, 3);
    expect(dcr(ids.mShunt)).toBeUndefined();
    expect(s.stamped.map((c) => c.id).sort()).toEqual([ids.tShunt, ids.wSeries].sort());
    expect(s.lossless).toEqual([{ id: ids.mShunt, ways: ['mid'] }]);
    expect(s.fitById[ids.wSeries].family).toBe(fat);
    expect(s.fitById[ids.tShunt].family).toBe(thin);
    // idempotent
    const again = stampCoilDcr(s.parts, model);
    expect(again.parts.map((p) => p.params)).toEqual(s.parts.map((p) => p.params));
    // the netlist reads the param: the solver sees the same number
    const nl = crossoverToNetlist({ name: 't', parts: s.parts } as VxpCrossover).netlist;
    const e = nl.elements.find((x) => x.id === ids.wSeries) as { seriesR?: number };
    expect(e.seriesR).toBeCloseTo(0.5 * A * 2 ** K, 3);
  });

  it('a snapped coil keeps its real DCR; a shared coil reads the lowest-DCR family behind it', () => {
    const { parts, ids } = paperThreeWay();
    const snapped = parts.map((p) =>
      p.partId === ids.wSeries ? { ...p, catalog: 'SKU-1', params: [...p.params, { name: 'DCR', value: 0.123, unit: 'Ω' }] } : p,
    );
    const model = modelOf({ woofer: fat, mid: thin, tweeter: thin }, fits);
    const s = stampCoilDcr(snapped, model);
    expect(s.snapped).toEqual([ids.wSeries]);
    expect(s.parts.find((p) => p.partId === ids.wSeries)!.params.find((q) => q.name === 'DCR')!.value).toBe(0.123);
    // shared: the thin family reads 0.25·L^0.6, the fat one half of that
    expect(fitForCoil(['woofer', 'mid'], 1e-3, model)!.family).toBe(fat);
    expect(fitForCoil(['mid', 'tweeter'], 1e-3, model)!.family).toBe(thin);
    expect(fitForCoil([], 1e-3, model)).toBeNull();
  });

  it('the inventory reads what a list carries against the model, and flags out-of-range coils', () => {
    const { parts, ids } = paperThreeWay();
    const model = modelOf({ woofer: fat, mid: thin, tweeter: thin }, fits);
    const bare = coilDcrInventory(parts, model);
    expect(bare.carriedTotalOhm).toBe(0);
    expect(bare.coils.find((c) => c.id === ids.wSeries)!.fitOhm).toBeCloseTo(0.5 * A * 2 ** K, 9);
    expect(bare.waysWithoutFamily).toEqual([]);
    const stamped = coilDcrInventory(stampCoilDcr(parts, model).parts, model);
    for (const c of stamped.coils) expect(c.carriedOhm).toBeCloseTo(c.fitOhm!, 3);
    // 2.0 mH on the fat family (range 0.1–5 mH) is in range; 8 mH is not.
    const big = parts.map((p) => (p.partId === ids.wSeries ? { ...p, params: [{ name: 'L', value: 8, unit: '' }] } : p));
    const inv = coilDcrInventory(big, model);
    expect(inv.outOfRange).toEqual([ids.wSeries]);
    expect(inv.coils.find((c) => c.id === ids.wSeries)!.inRange).toBe(false);
    expect(coilDcrInventory(parts, null).waysWithoutFamily).toEqual(['mid', 'tweeter', 'woofer']);
  });
});

describe('A5e.3 — the declaration and the fingerprint', () => {
  const fits = fitCoilDcrFamilies(paperFamily());
  const base = { cages: [[400, 500] as [number, number]], windowFloorsHz: [400], multiWay: true, stated: {} };

  it('derives the model from stated families and fits; declares ABSENT with the reason otherwise', () => {
    const d = declareCandidateChoices({ ...base, coilDcrFamilyByWay: { woofer: 'paper|coil|1' }, coilDcrFits: fits, coilDcrCatalogLabel: 'paper' });
    expect(d.stated.coilDcrModel?.source).toBe('catalog-fit');
    expect(d.stated.coilDcrModel?.fitVersion).toBe(COIL_DCR_FIT_VERSION);
    expect(d.stated.coilDcrModel?.familyByWay).toEqual({ woofer: 'paper|coil|1' });
    expect(d.stated.coilDcrModel?.catalogLabel).toBe('paper');
    const none = declareCandidateChoices(base);
    expect(none.stated.coilDcrModel).toBeUndefined();
    expect(none.absent.find((a) => a.key === 'coilDcrModel')?.why).toMatch(/P4/);
    expect(none.absent.find((a) => a.key === 'coilDcrModel')?.why).toMatch(/lossless/);
    const unresolved = declareCandidateChoices({ ...base, coilDcrFamilyByWay: { woofer: 'nobody|makes|this' }, coilDcrFits: fits });
    expect(unresolved.stated.coilDcrModel).toBeUndefined();
    expect(unresolved.absent.find((a) => a.key === 'coilDcrModel')?.why).toMatch(/nobody\|makes\|this/);
    const noCatalog = declareCandidateChoices({ ...base, coilDcrFamilyByWay: { woofer: 'paper|coil|1' } });
    expect(noCatalog.absent.find((a) => a.key === 'coilDcrModel')?.why).toMatch(/no catalogue/);
    // an explicit model wins
    const explicit = declareCandidateChoices({ ...base, stated: { coilDcrModel: d.stated.coilDcrModel } });
    expect(explicit.stated.coilDcrModel).toBe(d.stated.coilDcrModel);
  });

  it('moves the fingerprint with the family AND with the fit numbers', () => {
    const m1 = coilDcrModelFor({ woofer: 'paper|coil|1' }, fits).model!;
    const other = fitCoilDcrFamilies(paperFamily().map((p) => ({ ...p, seriesR: p.seriesR * 1.1 })));
    const m2 = coilDcrModelFor({ woofer: 'paper|coil|1' }, other).model!;
    const k = (m: CoilDcrModel | undefined) => JSON.stringify(choicesKey({ coilDcrModel: m }, undefined));
    expect(k(m1)).not.toBe(k(undefined));
    expect(k(m1)).not.toBe(k(m2));
    expect(JSON.stringify(coilDcrModelKey(m1))).not.toBe(JSON.stringify(coilDcrModelKey(m2)));
    expect(coilDcrModelKey(undefined)).toBeNull();
  });
});
