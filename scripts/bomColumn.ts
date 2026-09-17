/**
 * DE BOM-KOLOM: de goedkoopste catalogusrealisatie per onderdeel, één huis.
 *
 * WOORDELIJK het blok dat sinds A5e.3c in `measure-a5e3c-field.ts` stond, hier
 * gelicht toen M-4 er een tweede lezer bij kreeg. De reden is de reden die dit
 * project overal geeft (A3g, en `impedanceFloor.ts` als vorm): twee tabellen
 * die elk hun eigen prijs uitrekenen zijn twee antwoorden op één vraag, en de
 * vraag van M-4 is juist een AFTREKKING tussen twee tabellen — wat de
 * fasegraden aan geld kostten. Een cent verschil in de realisatieregel zou dan
 * als een bevinding lezen.
 *
 * NIETS IS VERANDERD BEHALVE DE VORM: de catalogus wordt nu MEEGEGEVEN in
 * plaats van op module-niveau gelezen, zodat een aanroeper zonder catalogus een
 * lege lijst geeft en niets realiseert (de bestaande `catalog.length`-tak van
 * de A5e.3c-tabel).
 *
 * DE BOM IS EEN KOLOM EN GEEN OORDEEL. Casus 1 stelt geen prijs (P4), er is
 * geen poort, geen budget en geen sorteersleutel; wat een onderdeel zonder
 * realisatie binnen de tolerantie oplevert is een ONDERGRENS die zichzelf zo
 * noemt, nooit een stil weggelaten post.
 */

import { readFileSync } from 'node:fs';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

/** Tolerantie waarbinnen een BOM-realisatie de waarde moet dekken (dezelfde als de ablatie). */
export const BOM_TOLERANCE = 0.05;

export interface CatComp {
  sku: string;
  brand: string;
  series: string;
  kind: string;
  value: number;
  gauge?: number;
  dcr?: number;
  price: number;
}
/** De catalogusleden van één gestelde familie (`<merk>|<serie>|<draaddikte>` in kleine letters, de sleutel van coilDcr.ts). */
function familyMembers(catalog: readonly CatComp[], family: string): CatComp[] {
  const [brand, series, gauge] = family.split('|');
  return catalog.filter(
    (p) => p.kind === 'L' && p.brand.toLowerCase() === brand && p.series.toLowerCase() === series && (p.gauge === undefined ? gauge === '' : Math.abs(p.gauge - Number(gauge)) < 0.005),
  );
}
export interface Realisation {
  label: string;
  eur: number;
  /** Meer dan één onderdeel voor één waarde: een stapel (spoel), een bank (condensator) of een serie (weerstand). */
  count: number;
}
function coilBom(catalog: readonly CatComp[], mH: number, family: string | null): Realisation | null {
  if (family === null) return null;
  const fam = familyMembers(catalog, family);
  const target = mH * 1e-3;
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  for (const a of fam) if (ok(a.value) && (!best || a.price < best.eur)) best = { label: `${a.sku} ${(a.value * 1e3).toFixed(2)} mH`, eur: a.price, count: 1 };
  if (best) return best;
  for (const a of fam) {
    for (const b of fam) {
      if (a.sku > b.sku) continue;
      const v = a.value + b.value;
      const eur = a.price + b.price;
      if (ok(v) && (!best || eur < best.eur)) best = { label: `${a.sku} + ${b.sku} = ${(v * 1e3).toFixed(2)} mH (stapel)`, eur, count: 2 };
    }
  }
  return best;
}
function capBom(catalog: readonly CatComp[], uF: number): Realisation | null {
  const target = uF * 1e-6;
  const caps = catalog.filter((p) => p.kind === 'C' && p.value <= target * (1 + BOM_TOLERANCE));
  const ok = (v: number) => Math.abs(v / target - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  const consider = (parts: CatComp[]) => {
    const v = parts.reduce((s, p) => s + p.value, 0);
    if (!ok(v)) return;
    const eur = parts.reduce((s, p) => s + p.price, 0);
    if (!best || eur < best.eur) best = { label: parts.map((p) => p.sku).join(' + ') + ` = ${(v * 1e6).toFixed(1)} µF`, eur, count: parts.length };
  };
  for (const a of caps) consider([a]);
  const big = caps.filter((p) => p.value >= target / 3.2);
  for (let i = 0; i < big.length; i++) {
    for (let j = i; j < big.length; j++) {
      consider([big[i], big[j]]);
      for (let k = j; k < big.length; k++) consider([big[i], big[j], big[k]]);
    }
  }
  return best;
}
function resBom(catalog: readonly CatComp[], ohm: number): Realisation | null {
  const rs = catalog.filter((p) => p.kind === 'R');
  const ok = (v: number) => Math.abs(v / ohm - 1) <= BOM_TOLERANCE;
  let best: Realisation | null = null;
  for (const a of rs) if (ok(a.value) && (!best || a.price < best.eur)) best = { label: `${a.sku} ${a.value} Ω`, eur: a.price, count: 1 };
  if (best) return best;
  for (const a of rs) {
    for (const b of rs) {
      if (a.sku > b.sku) continue;
      const v = a.value + b.value;
      const eur = a.price + b.price;
      if (ok(v) && (!best || eur < best.eur)) best = { label: `${a.sku} + ${b.sku} = ${v.toFixed(2)} Ω (serie)`, eur, count: 2 };
    }
  }
  return best;
}
export interface Bom {
  eur: number;
  parts: number;
  /** Onderdelen die geen realisatie binnen ±5 % hebben — de BOM is dan een ONDERGRENS. */
  unrealised: string[];
  /** Waarden die meer dan één catalogusonderdeel vragen (stapel / bank / serie). */
  multi: string[];
  items: { id: string; label: string; eur: number }[];
}
export function bomOf(
  catalog: readonly CatComp[],
  parts: readonly VxpPart[],
  familyOfCoil: (id: string) => string | null,
): Bom {
  const items: Bom['items'] = [];
  const unrealised: string[] = [];
  const multi: string[] = [];
  const val = (p: VxpPart, name: string): number | null => {
    const v = p.params.find((q) => q.name === name)?.value;
    return typeof v === 'number' ? v : null;
  };
  for (const p of parts) {
    if (p.partId === undefined || p.open || p.shorted) continue;
    let r: Realisation | null = null;
    if (p.type === 'Inductor') {
      const mH = val(p, 'L');
      r = mH === null ? null : coilBom(catalog, mH, familyOfCoil(p.partId));
    } else if (p.type === 'Capacitor') {
      const uF = val(p, 'C');
      r = uF === null ? null : capBom(catalog, uF);
    } else if (p.type === 'Resistor') {
      const ohm = val(p, 'R');
      r = ohm === null ? null : resBom(catalog, ohm);
    } else continue;
    if (!r) {
      unrealised.push(p.partId);
      continue;
    }
    if (r.count > 1) multi.push(`${p.partId} (${r.count})`);
    items.push({ id: p.partId, label: r.label, eur: r.eur });
  }
  return { eur: items.reduce((s, i) => s + i.eur, 0), parts: items.length + unrealised.length, unrealised, multi, items };
}

/**
 * De catalogus zoals de casus hem stelt, of leeg.
 *
 * `null` als pad betekent: dit project stelt geen catalogus, en dan realiseert
 * `bomOf` niets en zegt dat per onderdeel (P4).
 */
export function loadCoilCatalog(path: string | null): CatComp[] {
  if (path === null) return [];
  return (JSON.parse(readFileSync(path, 'utf-8')) as { components: CatComp[] }).components;
}
