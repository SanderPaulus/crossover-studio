/**
 * A5e.3 — THE DCR OF A CONTINUOUS COIL, FROM THE CATALOGUE FIT.
 *
 * ONE HOME, EVERY READER — the shape `impedanceFloor.ts`, `levelWork.ts`,
 * `phaseAdmission.ts` and `targetLevel.ts` carry, and for the same reason. A
 * continuous coil in the v2 route had NO resistance: the synthesis wrote none,
 * the tuner solved ideal coils, and every gate, inversion and inventory read
 * the `DCR` param that was never there. The M-1 diagnosis measured what that
 * costs — a tune refused on a 1.99 Ω ladder resonance in the tweeter's HP
 * section that 0.24 Ω in series with its shunt coil lifts to the floor, a
 * third of the DCR that coil has as a 1.4 mm air core. The judgement was made
 * on a physics stricter than any built loudspeaker.
 *
 * WHAT THIS MODULE IS. A fit per COIL FAMILY (brand, series, wire gauge) of the
 * catalogue's own measured DCR against inductance, `DCR = A · (L/mH)^k`, and one
 * function that reads it: `dcrOf(henry, fit)`. The family per WAY is a STATED
 * project input (the driver card, or the per-way field of the A5a form) — never
 * a default (P6): a way without a family keeps lossless coils, and every reader
 * says so as a deviation from any build.
 *
 * WHY A FIT AND NOT THE NEAREST SKU. The tuner moves inductances continuously,
 * and a DCR that jumps between SKUs is a staircase in the objective. The fit is
 * smooth in L and the catalogue snap (when armed) replaces it with the real
 * part — which is within the family's own residual of the fit by construction,
 * because the fit was made on exactly those parts.
 *
 * OUTSIDE THE FAMILY'S RANGE the power law is CONTINUED and the reading is
 * FLAGGED (`inRange: false`), never dropped to zero. Dropping to zero at the
 * range edge would hand the search a reward for leaving the catalogue — the
 * inverse of buildability — and a value above the largest single part is not
 * unbuildable, it is a stack (two coils in series add their DCR, and the
 * catalogue snap builds stacks). What a reader owes the designer is the flag:
 * no single part of the stated family covers this value.
 *
 * It lives in `src/lib/` and not in `engine2/` for the reason `impedanceFloor.ts`
 * gives: the tuner reads it in its hot loop, and the tuner may import nothing
 * from `engine2/` (`toggleRegression.test.ts`).
 */

import type { CatalogPart } from './catalog.ts';
import { busTopologyOfNetlist } from './netOptimizer.ts';
import type { NetElement } from './network.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpCrossover } from './parsers/vxp.ts';

/**
 * 1.0 — log-log least squares per (brand, series, gauge) on every SKU with a
 * positive DCR; the power law continued outside the range, flagged. A change
 * in the fitting rule is a version bump (A5e.5): the version travels inside
 * the model value and therefore in the run fingerprint.
 */
export const COIL_DCR_FIT_VERSION = 'coil-dcr-fit/1.0';

/** Henry per millihenry — the unit the fit is expressed in. */
const H_PER_MH = 1e-3;
/** Fewest SKUs a family needs before a fit is trusted at all. */
const MIN_POINTS_PER_FAMILY = 3;
/** How many significant digits a stamped `DCR` param carries (the snap writes 3; one more keeps the hot loop and the param within 0.05 %). */
const DCR_PARAM_PRECISION = 4;

/** One coil family's fit. Everything a reader needs to check the number is here (V15). */
export interface CoilDcrFit {
  /** `${brand}|${series}|${gauge}` in lower case — the family id a project states. */
  family: string;
  /** "Jantzen Air Core Wire Coil 1.4 mm". */
  label: string;
  brand: string;
  series: string;
  /** Wire gauge, mm; null when the series publishes none. */
  wireMm: number | null;
  /** The exponent of `DCR = A · (L/mH)^k`. */
  k: number;
  /** A: the DCR at 1 mH, ohms. */
  ohmAt1mH: number;
  /** [smallest, largest] inductance the family stocks as a single part, henry. */
  rangeH: [number, number];
  /** SKUs the fit rests on. */
  n: number;
  /** RMS of the log residual, in percent of DCR. */
  rmsPct: number;
  /** Largest |residual| over the family's SKUs, in percent of DCR. */
  maxPct: number;
}

const familyKey = (brand: string, series: string, wireMm: number | null): string =>
  `${brand.toLowerCase()}|${series.toLowerCase()}|${wireMm === null ? '-' : String(wireMm)}`;

/** The family id of a catalogue part — the key `fitCoilDcrFamilies` groups on. */
export function catalogFamilyOf(p: Pick<CatalogPart, 'brand' | 'series' | 'wireMm'>): string {
  return familyKey(p.brand, p.series, p.wireMm ?? null);
}

/** The label a form shows for a family id, from its fit. */
export function coilFamilyLabel(fit: CoilDcrFit): string {
  return fit.label;
}

/**
 * Fit every coil family in a catalogue part list.
 *
 * A family is (brand, series, gauge): the gauge is what sets the copper, so
 * "Air Core Wire Coil" is eleven families and not one. Parts without a
 * positive DCR are skipped (nothing to fit); a family with fewer than
 * `MIN_POINTS_PER_FAMILY` fittable SKUs is skipped and does not appear.
 * Deterministic: sorted by family id, and the fit is closed-form.
 */
export function fitCoilDcrFamilies(parts: readonly CatalogPart[]): CoilDcrFit[] {
  const groups = new Map<string, CatalogPart[]>();
  for (const p of parts) {
    if (p.kind !== 'L' || !(p.value > 0) || !(p.seriesR > 0)) continue;
    const key = familyKey(p.brand, p.series, p.wireMm ?? null);
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const out: CoilDcrFit[] = [];
  for (const key of [...groups.keys()].sort()) {
    const pts = groups.get(key)!;
    if (pts.length < MIN_POINTS_PER_FAMILY) continue;
    const xs = pts.map((p) => Math.log(p.value / H_PER_MH));
    const ys = pts.map((p) => Math.log(p.seriesR));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (xs[i] - mx) ** 2;
      sxy += (xs[i] - mx) * (ys[i] - my);
    }
    // A family whose SKUs all share one inductance has no slope to fit.
    if (!(sxx > 0)) continue;
    const k = sxy / sxx;
    const a = my - k * mx;
    let ss = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const r = ys[i] - (a + k * xs[i]);
      ss += r * r;
      worst = Math.max(worst, Math.abs(r));
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      lo = Math.min(lo, p.value);
      hi = Math.max(hi, p.value);
    }
    const p0 = pts[0];
    const wireMm = p0.wireMm ?? null;
    out.push({
      family: key,
      label: `${p0.brand} ${p0.series}${wireMm !== null ? ` ${wireMm.toFixed(wireMm % 1 === 0 ? 1 : 2)} mm` : ''}`,
      brand: p0.brand,
      series: p0.series,
      wireMm,
      k,
      ohmAt1mH: Math.exp(a),
      rangeH: [lo, hi],
      n,
      // log residuals are relative residuals to first order; reported as percent.
      rmsPct: Math.sqrt(ss / n) * 100,
      maxPct: worst * 100,
    });
  }
  return out;
}

/**
 * THE ONE FUNCTION: the DCR the fit predicts for a coil of `henry`, in ohms,
 * and whether that inductance lies inside the family's single-part range.
 * Outside it the power law is continued (see the module note) and `inRange`
 * is false. A non-positive inductance has no DCR (null): a coil of nothing is
 * not a coil, and a zero would read as a measured resistance of nothing.
 */
export function dcrOf(henry: number, fit: CoilDcrFit): { ohm: number; inRange: boolean } | null {
  if (!(henry > 0) || !Number.isFinite(henry)) return null;
  const ohm = fit.ohmAt1mH * (henry / H_PER_MH) ** fit.k;
  return { ohm, inRange: henry >= fit.rangeH[0] && henry <= fit.rangeH[1] };
}

/**
 * The DCR MODEL a run states: which family each way builds with, and the fits
 * those families resolve to. The fits travel INSIDE the value so the model is
 * pure data (structured-cloneable, fingerprintable) and a run can be
 * reproduced without the catalogue it was fitted on: two runs on two catalogue
 * revisions are two different runs, and the fingerprint has to say so.
 */
export interface CoilDcrModel {
  source: 'catalog-fit';
  fitVersion: string;
  /** Way (driver model) → family id. A way absent here keeps lossless coils. */
  familyByWay: Record<string, string>;
  /** Family id → its fit, for every family named above. */
  fits: Record<string, CoilDcrFit>;
  /** Where the fits came from, for a reader ("gemini-catalog-v8.json, 2116 coils"). */
  catalogLabel?: string;
}

/**
 * Build the model from stated families and the catalogue's fits. A way whose
 * family is not among the fits is left OUT of the model and returned under
 * `missing`, so a caller can say so; a model that names no way at all is
 * returned as null — there is nothing to state.
 */
export function coilDcrModelFor(
  familyByWay: Readonly<Record<string, string>>,
  fits: readonly CoilDcrFit[],
  catalogLabel?: string,
): { model: CoilDcrModel | null; missing: { way: string; family: string }[] } {
  const byId = new Map(fits.map((f) => [f.family, f] as const));
  const ways: Record<string, string> = {};
  const used: Record<string, CoilDcrFit> = {};
  const missing: { way: string; family: string }[] = [];
  for (const way of Object.keys(familyByWay).sort()) {
    const fam = familyByWay[way];
    if (typeof fam !== 'string' || fam === '') continue;
    const fit = byId.get(fam);
    if (!fit) {
      missing.push({ way, family: fam });
      continue;
    }
    ways[way] = fam;
    used[fam] = fit;
  }
  if (Object.keys(ways).length === 0) return { model: null, missing };
  return {
    model: {
      source: 'catalog-fit',
      fitVersion: COIL_DCR_FIT_VERSION,
      familyByWay: ways,
      fits: used,
      ...(catalogLabel !== undefined ? { catalogLabel } : {}),
    },
    missing,
  };
}

/**
 * WHICH WAY AN ELEMENT BELONGS TO — series or shunt.
 *
 * `busTopology` attributes SERIES elements to the drivers behind them and calls
 * everything else "shunt". A shunt coil (the L of an HP ladder's shunt leg,
 * the L of a trap) belongs to a way just as surely, and the family per way has
 * to reach it: it is the shunt coil of the tweeter's HP section whose missing
 * DCR the M-1 diagnosis found. So: walk from every element through nodes that
 * are neither ground nor bus nodes until a bus node is reached; the element
 * belongs to the way(s) whose bus that node is on. A node on the shared trunk
 * (the generator's hot node before the branches split) belongs to every way.
 */
export function waysOfElements(netlist: { nodeCount: number; elements: readonly NetElement[] }): Map<string, string[]> {
  const bus = busTopologyOfNetlist(netlist);
  const models = netlist.elements.filter((e) => e.kind === 'driver').map((e) => (e as { model: string }).model);
  const busWays = new Map<number, string[]>();
  for (const m of models) {
    for (const n of bus.busNodesOf(m)) {
      const w = busWays.get(n);
      if (w) {
        if (!w.includes(m)) w.push(m);
      } else busWays.set(n, [m]);
    }
  }
  const adjacency = new Map<number, number[]>();
  for (const e of netlist.elements) {
    if (e.kind === 'driver' || e.kind === 'source') continue;
    const [a, b] = e.nodes;
    if (a === 0 || b === 0) continue;
    (adjacency.get(a) ?? adjacency.set(a, []).get(a)!).push(b);
    (adjacency.get(b) ?? adjacency.set(b, []).get(b)!).push(a);
  }
  const out = new Map<string, string[]>();
  for (const e of netlist.elements) {
    if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
    const onBus = bus.driversOf(e.id);
    if (onBus.length > 0) {
      out.set(e.id, [...onBus]);
      continue;
    }
    const seen = new Set<number>();
    const queue: number[] = e.nodes.filter((n) => n !== 0);
    let found: string[] | null = null;
    while (queue.length > 0 && found === null) {
      const n = queue.shift()!;
      if (seen.has(n)) continue;
      seen.add(n);
      const w = busWays.get(n);
      if (w) {
        found = [...w];
        break;
      }
      for (const nb of adjacency.get(n) ?? []) if (!seen.has(nb)) queue.push(nb);
    }
    out.set(e.id, found ?? []);
  }
  return out;
}

/**
 * The fit a coil reads, given the ways it belongs to. A coil of ONE way reads
 * that way's family. A coil SHARED by several ways (on the trunk before the
 * split) reads the family that gives the LOWEST DCR at its inductance: a
 * shared element carries the current of every way behind it and a builder
 * sizes it for the heaviest of them. A coil on a way with no stated family —
 * or on no way at all — reads nothing and stays as it is.
 */
export function fitForCoil(ways: readonly string[], henry: number, model: CoilDcrModel): CoilDcrFit | null {
  let best: CoilDcrFit | null = null;
  let bestOhm = Infinity;
  for (const w of ways) {
    const fam = model.familyByWay[w];
    if (fam === undefined) continue;
    const fit = model.fits[fam];
    if (!fit) continue;
    const r = dcrOf(henry, fit);
    if (!r) continue;
    if (r.ohm < bestOhm) {
      bestOhm = r.ohm;
      best = fit;
    }
  }
  return best;
}

/** One stamped coil, for a column or a note. */
export interface StampedCoil {
  id: string;
  ways: string[];
  family: string;
  henry: number;
  dcrOhm: number;
  /** False when no single part of the family covers this inductance (a stack may). */
  inRange: boolean;
}

export interface CoilDcrStamp {
  parts: VxpPart[];
  /** Every coil the model gave a DCR, with what it gave. */
  stamped: StampedCoil[];
  /** Coils the catalogue snap already attributed (`catalog` set): their real DCR stands. */
  snapped: string[];
  /** Coils on a way with no stated family, or on no way: lossless, untouched. */
  lossless: { id: string; ways: string[] }[];
  /** The fit each stamped coil reads — for a hot loop that re-reads the DCR as L moves. */
  fitById: Record<string, CoilDcrFit>;
}

/** Upsert one param on a part's list — a copy, never a mutation. */
const upsertParam = (params: VxpPart['params'], name: string, value: number, unit: string): VxpPart['params'] => {
  const hit = params.find((q) => q.name === name);
  if (hit) return params.map((q) => (q.name === name ? { ...q, value } : { ...q }));
  return [...params.map((q) => ({ ...q })), { name, value, unit }];
};

/**
 * STAMP THE MODEL ONTO A PART LIST: every present, un-snapped inductor on a
 * way with a stated family gets a `DCR` param from the fit at its own
 * inductance. The reader of that param is `crossoverToNetlist`, and through
 * it every gate, inversion, inventory and the solver itself — one number, one
 * implementation, however many readers (V32). A coil the catalogue snap has
 * attributed keeps its real DCR (the real part beats the fit). Open and
 * shorted coils are left alone: they emit no element.
 *
 * Idempotent: stamping a stamped list re-reads the same fit at the same
 * inductance and writes the same number.
 */
export function stampCoilDcr(parts: readonly VxpPart[], model: CoilDcrModel): CoilDcrStamp {
  let ways: Map<string, string[]>;
  try {
    ways = waysOfElements(crossoverToNetlist({ name: 'coil-dcr', parts: [...parts] } as VxpCrossover).netlist);
  } catch {
    return { parts: [...parts], stamped: [], snapped: [], lossless: [], fitById: {} };
  }
  const stamped: StampedCoil[] = [];
  const snapped: string[] = [];
  const lossless: { id: string; ways: string[] }[] = [];
  const fitById: Record<string, CoilDcrFit> = {};
  const out = parts.map((p) => {
    if (p.type !== 'Inductor' || p.partId === undefined || p.open || p.shorted) return p;
    if (p.catalog) {
      snapped.push(p.partId);
      return p;
    }
    const mH = p.params.find((q) => q.name === 'L')?.value;
    if (typeof mH !== 'number' || !(mH > 0)) return p;
    const henry = mH * H_PER_MH;
    const w = ways.get(p.partId) ?? [];
    const fit = fitForCoil(w, henry, model);
    if (!fit) {
      lossless.push({ id: p.partId, ways: w });
      return p;
    }
    const r = dcrOf(henry, fit)!;
    fitById[p.partId] = fit;
    stamped.push({ id: p.partId, ways: w, family: fit.family, henry, dcrOhm: r.ohm, inRange: r.inRange });
    return { ...p, params: upsertParam(p.params, 'DCR', roundDcr(r.ohm), 'Ω') };
  });
  return { parts: out, stamped, snapped, lossless, fitById };
}

/** The rounding a stamped `DCR` param carries. One place, so the hot loop's number and the param agree to the digit. */
export function roundDcr(ohm: number): number {
  return Number(ohm.toPrecision(DCR_PARAM_PRECISION));
}

/**
 * The model as a fingerprint ingredient: families per way, and per family the
 * numbers the DCR is computed from. Two runs on two catalogue revisions differ
 * here even when they state the same family names.
 */
export function coilDcrModelKey(model: CoilDcrModel | undefined): Record<string, unknown> | null {
  if (!model) return null;
  const fits: Record<string, unknown> = {};
  for (const id of Object.keys(model.fits).sort()) {
    const f = model.fits[id];
    fits[id] = { k: f.k, ohmAt1mH: f.ohmAt1mH, rangeH: f.rangeH, n: f.n };
  }
  return { source: model.source, fitVersion: model.fitVersion, familyByWay: model.familyByWay, fits };
}

/** One line for a note: "woofer → Jantzen Air Core Wire Coil 1.4 mm (k 0.59, 0.31 Ω @ 1 mH, 0.010–22 mH, 170 SKUs, rms 6 %)". */
export function describeCoilDcrModel(model: CoilDcrModel): string {
  return Object.keys(model.familyByWay)
    .sort()
    .map((way) => {
      const f = model.fits[model.familyByWay[way]];
      return f
        ? `${way} → ${f.label} (k ${f.k.toFixed(2)}, ${f.ohmAt1mH.toFixed(3)} Ω @ 1 mH, ` +
            `${(f.rangeH[0] / H_PER_MH).toPrecision(2)}–${(f.rangeH[1] / H_PER_MH).toPrecision(3)} mH, ${f.n} SKUs, rms ${f.rmsPct.toFixed(1)} %)`
        : `${way} → ${model.familyByWay[way]} (no fit)`;
    })
    .join('; ');
}

/* ------------------------------------------------------------------ *
 * The inventory — what a part list's coils CARRY, against the model
 * ------------------------------------------------------------------ */

/** One coil of a part list, as carried and as the model would have it. */
export interface CoilDcrInventoryRow {
  id: string;
  ways: string[];
  henry: number;
  /** The `DCR` param the part carries (0 when it carries none). */
  carriedOhm: number;
  /** True when the catalogue snap attributed a real part to it. */
  snapped: boolean;
  /** The family the model gives this coil's way(s), or null. */
  family: string | null;
  /** The fit's DCR at this inductance, or null without a family. */
  fitOhm: number | null;
  /** Whether a single part of the family covers this inductance; null without a family. */
  inRange: boolean | null;
}

export interface CoilDcrInventory {
  coils: CoilDcrInventoryRow[];
  /** Ways of the network for which the model names no family — their coils are lossless. */
  waysWithoutFamily: string[];
  /** Coils whose inductance no single part of their family covers (a stack may). */
  outOfRange: string[];
  /** Total DCR carried by all coils, ohms. */
  carriedTotalOhm: number;
}

/**
 * READ a part list against a model — the column the worker reports and the
 * block the report shows, one implementation for both. With no model every
 * row has null in the fit columns and `waysWithoutFamily` lists every way:
 * "lossless unless the netlist carries DCR" is then what the inventory says.
 */
export function coilDcrInventory(parts: readonly VxpPart[], model: CoilDcrModel | null | undefined): CoilDcrInventory {
  let netlist: { nodeCount: number; elements: readonly NetElement[] };
  try {
    netlist = crossoverToNetlist({ name: 'coil-dcr-inventory', parts: [...parts] } as VxpCrossover).netlist;
  } catch {
    return { coils: [], waysWithoutFamily: [], outOfRange: [], carriedTotalOhm: 0 };
  }
  const snapped = new Set(parts.filter((p) => p.type === 'Inductor' && p.partId !== undefined && p.catalog).map((p) => p.partId!));
  return coilDcrInventoryOfNetlist(netlist, model, snapped);
}

/**
 * The same inventory off a NETLIST — what the report holds. A netlist does
 * not know which coils the snap attributed; the caller passes those ids when
 * it has them.
 */
export function coilDcrInventoryOfNetlist(
  netlist: { nodeCount: number; elements: readonly NetElement[] },
  model: CoilDcrModel | null | undefined,
  snappedIds: ReadonlySet<string> = new Set(),
): CoilDcrInventory {
  const ways = waysOfElements(netlist);
  const models = netlist.elements.filter((e) => e.kind === 'driver').map((e) => (e as { model: string }).model);
  const coils: CoilDcrInventoryRow[] = [];
  const outOfRange: string[] = [];
  let carriedTotalOhm = 0;
  for (const e of netlist.elements) {
    if (e.kind !== 'L' || !(e.value > 0)) continue;
    const henry = e.value;
    const carriedOhm = e.seriesR ?? 0;
    carriedTotalOhm += carriedOhm;
    const w = ways.get(e.id) ?? [];
    const fit = model ? fitForCoil(w, henry, model) : null;
    const r = fit ? dcrOf(henry, fit) : null;
    if (r && !r.inRange) outOfRange.push(e.id);
    coils.push({
      id: e.id,
      ways: w,
      henry,
      carriedOhm,
      snapped: snappedIds.has(e.id),
      family: fit ? fit.family : null,
      fitOhm: r ? r.ohm : null,
      inRange: r ? r.inRange : null,
    });
  }
  const waysWithoutFamily = models.filter((m) => !(model && model.familyByWay[m] !== undefined && model.fits[model.familyByWay[m]]));
  return { coils, waysWithoutFamily: [...new Set(waysWithoutFamily)].sort(), outOfRange, carriedTotalOhm };
}

