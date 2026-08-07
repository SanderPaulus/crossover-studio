import type { VxpPart } from './parsers/vxp.ts';

/**
 * Component catalog — phase 3 foundation.
 *
 * Brand-agnostic format: purchasable parts grouped in real PRODUCT SERIES
 * (Jantzen Alumen Z-Cap, Mundorf MCap, …) with their electrical side-effects
 * (coil DCR per wire gauge, cap ESR) and optionally a price. The designer
 * picks a series (the sound/budget choice), the tool picks values within it.
 *
 * STARTER DATA: the series lists are real; the VALUE GRIDS are E12 within
 * each series' typical range, DCR from the measured air-core fit
 * (0.29·(L/mH)^0.65 Ω @ 1.4 mm, scaled by (1.4/d)²). Exact per-SKU values
 * and list prices can be refined series-by-series later — the format
 * carries them; prices are deliberately absent until real ones are pasted.
 */

export type CatalogKind = 'L' | 'C' | 'R';

export type CatalogTier = 'budget' | 'standard' | 'premium';

export interface CatalogPart {
  id: string;
  brand: string;
  series: string;
  kind: CatalogKind;
  /** Henry / Farad / Ohm. */
  value: number;
  /** Coil DCR / cap ESR, Ω (0 for resistors — the value IS the resistance). */
  seriesR: number;
  /** Coil wire gauge, mm (coils only). */
  wireMm?: number;
  /** Power rating, W (resistors). */
  powerW?: number;
  /** EUR list price — absent until real prices are entered. */
  priceEur?: number;
  /** This is an EXACT market SKU from an imported database, not an entry
   *  generated from a series' value grid. Grid entries are useful as a
   *  fallback, but they are fictional inventory: they advertise values
   *  nobody sells (E24 where the product runs E12) and, carrying no price,
   *  they read as FREE to the cost-weighted snap. See pickCandidates. */
  real?: true;
  /** Quality/price tier of the product series. */
  tier?: CatalogTier;
}

export interface CatalogSeries {
  id: string;
  brand: string;
  series: string;
  kind: CatalogKind;
  /** Value range covered by the series (H / F / Ω). */
  range: [number, number];
  /** Wire gauges offered (coils). */
  gauges?: number[];
  /** Nominal ESR (caps), Ω. */
  esr?: number;
  /** Power rating (resistors), W. */
  powerW?: number;
  /** Value grid the series is stocked in. Default: E12 for coils, E24 for
   *  caps/resistors (practice). */
  eSeries?: 'E12' | 'E24';
  /** Quality/price tier — feeds the coming position preference (series-path
   *  premium, shunt budget). */
  tier?: CatalogTier;
  /** Price model: priceEur = basePrice + costFactor·value (SI units). Coils
   *  share one price across gauges for now. */
  basePrice?: number;
  costFactor?: number;
  /** DCR multiplier vs the air-core fit (iron/ferrite cores run LOWER DCR —
   *  e.g. ~0.35 for a P-core). Default 1 (air core). */
  dcrFactor?: number;
}

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
// Caps and resistors are stocked much finer than coils in practice.
const E24 = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

/** Real product series (ranges = typical, refine per SKU later). */
const SERIES: CatalogSeries[] = [
  // Coils
  { id: 'jantzen-air', brand: 'Jantzen', series: 'Air Core Wire Coil', kind: 'L', range: [0.047e-3, 8.2e-3], gauges: [0.7, 1.0, 1.4] },
  { id: 'jantzen-cross', brand: 'Jantzen', series: 'Cross Coil', kind: 'L', range: [0.33e-3, 8.2e-3], gauges: [1.4, 2.0] },
  { id: 'mundorf-lair', brand: 'Mundorf', series: 'MCoil Air L', kind: 'L', range: [0.047e-3, 8.2e-3], gauges: [0.71, 1.0, 1.4] },
  // Capacitors
  { id: 'jantzen-crosscap', brand: 'Jantzen', series: 'Cross-Cap', kind: 'C', range: [0.68e-6, 100e-6], esr: 0.025 },
  { id: 'jantzen-zstd', brand: 'Jantzen', series: 'Standard Z-Cap', kind: 'C', range: [0.68e-6, 100e-6], esr: 0.02 },
  { id: 'jantzen-zsup', brand: 'Jantzen', series: 'Superior Z-Cap', kind: 'C', range: [0.82e-6, 47e-6], esr: 0.015 },
  { id: 'jantzen-alumen', brand: 'Jantzen', series: 'Alumen Z-Cap', kind: 'C', range: [0.82e-6, 100e-6], esr: 0.012 },
  { id: 'mundorf-mcap', brand: 'Mundorf', series: 'MCap', kind: 'C', range: [0.47e-6, 100e-6], esr: 0.02 },
  { id: 'mundorf-supreme', brand: 'Mundorf', series: 'MCap Supreme', kind: 'C', range: [0.47e-6, 47e-6], esr: 0.012 },
  // Resistors
  { id: 'jantzen-superes', brand: 'Jantzen', series: 'Superes', kind: 'R', range: [0.22, 82], powerW: 10 },
  { id: 'jantzen-mox', brand: 'Jantzen', series: 'MOX', kind: 'R', range: [0.22, 82], powerW: 10 },
  { id: 'mundorf-mresist', brand: 'Mundorf', series: 'MResist Supreme', kind: 'R', range: [0.33, 47], powerW: 20 },
];

/** DCR of an air-core coil: measured 1.4 mm fit, scaled by wire area. */
export function coilDcr(valueH: number, wireMm: number): number {
  const base = 0.29 * (valueH * 1e3) ** 0.65;
  return base * (1.4 / wireMm) ** 2;
}

function buildCatalog(): CatalogPart[] {
  const parts: CatalogPart[] = [];
  // Decade coverage must reach every series' range top: electrolytics run to
  // 330 µF, iron-core coils to 33 mH (learned: a missing decade silently
  // truncated imported series at 82 µF / 8.2 mH).
  const DECADES: Record<CatalogKind, number[]> = {
    L: [0.01e-3, 0.1e-3, 1e-3, 10e-3],
    C: [0.1e-6, 1e-6, 10e-6, 100e-6],
    R: [0.1, 1, 10],
  };
  const exactKeys = new Set(customParts.map((p) => seriesKey(p.brand, p.series)));
  for (const s of [...SERIES.filter((x) => !custom.some((c) => c.id === x.id)), ...custom]) {
    if (exactKeys.has(seriesKey(s.brand, s.series))) continue;
    for (const gauge of s.gauges ?? [undefined]) {
      for (const decade of DECADES[s.kind]) {
        for (const m of (s.eSeries ?? (s.kind === 'L' ? 'E12' : 'E24')) === 'E12' ? E12 : E24) {
          const value = m * decade;
          if (value < s.range[0] * 0.99 || value > s.range[1] * 1.01) continue;
          const disp =
            s.kind === 'L' ? (value * 1e3).toFixed(2)
            : s.kind === 'C' ? (value * 1e6).toFixed(2)
            : value.toFixed(2);
          parts.push({
            id: `${s.id}${gauge ? `-${gauge}` : ''}-${disp}`,
            brand: s.brand,
            series: s.series,
            kind: s.kind,
            value,
            seriesR:
              s.kind === 'L'
                ? Number((coilDcr(value, gauge as number) * (s.dcrFactor ?? 1)).toPrecision(3))
                : s.kind === 'C'
                  ? (s.esr ?? 0.02)
                  : 0,
            ...(gauge !== undefined ? { wireMm: gauge } : {}),
            ...(s.powerW !== undefined ? { powerW: s.powerW } : {}),
            ...(s.basePrice !== undefined
              ? { priceEur: Number((s.basePrice + (s.costFactor ?? 0) * value).toPrecision(3)) }
              : {}),
            ...(s.tier !== undefined ? { tier: s.tier } : {}),
          });
        }
      }
    }
  }
  return parts;
}

let cache: CatalogPart[] | null = null;
/** User-imported series (other brands) — appended to the built-in set. */
let custom: CatalogSeries[] = [];
/** User-imported EXACT parts (v4 flat SKU database): real market values with
 *  measured DCR/ESR and list prices. A brand+series covered by exact parts
 *  SHADOWS any generated grid for that series — exact beats estimated. */
let customParts: CatalogPart[] = [];

export function setCustomSeries(series: CatalogSeries[], parts: CatalogPart[] = []): void {
  // An imported series with a built-in id OVERRIDES the built-in: that is
  // how a catalog update (prices, tiers, refined grids) lands. Re-importing
  // an exported template therefore never duplicates anything either.
  custom = series;
  // Marked at the boundary, once: everything that arrives here is a real SKU
  // by definition, and downstream code should not have to re-derive that from
  // where an object happens to live.
  customParts = parts.map((p) => (p.real ? p : { ...p, real: true as const }));
  cache = null;
}

export function customSeries(): CatalogSeries[] {
  return custom;
}

const seriesKey = (brand: string, series: string): string =>
  `${brand.toLowerCase()}|${series.toLowerCase()}`;
const slug = (brand: string, series: string): string =>
  `${brand}-${series}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Series entries synthesized from exact parts, so the inspector dropdown
 *  and seriesId filters see them like any other product series. */
function partSeries(): CatalogSeries[] {
  const map = new Map<string, CatalogSeries>();
  for (const p of customParts) {
    const key = seriesKey(p.brand, p.series);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        id: slug(p.brand, p.series),
        brand: p.brand,
        series: p.series,
        kind: p.kind,
        range: [p.value, p.value],
        ...(p.wireMm !== undefined ? { gauges: [p.wireMm] } : {}),
        ...(p.powerW !== undefined ? { powerW: p.powerW } : {}),
        ...(p.tier !== undefined ? { tier: p.tier } : {}),
      });
    } else {
      cur.range = [Math.min(cur.range[0], p.value), Math.max(cur.range[1], p.value)];
      if (p.wireMm !== undefined && cur.gauges && !cur.gauges.includes(p.wireMm)) {
        cur.gauges.push(p.wireMm);
      }
    }
  }
  return [...map.values()];
}

/** Built-in + user-imported series; custom ids shadow built-ins, exact-part
 *  series shadow same-named generated ones. */
export function allSeries(): CatalogSeries[] {
  const overridden = new Set(custom.map((s) => s.id));
  const exactKeys = new Set(customParts.map((p) => seriesKey(p.brand, p.series)));
  const generated = [...SERIES.filter((s) => !overridden.has(s.id)), ...custom].filter(
    (s) => !exactKeys.has(seriesKey(s.brand, s.series)),
  );
  return [...generated, ...partSeries()];
}

export function catalogParts(): CatalogPart[] {
  cache ??= [...buildCatalog(), ...customParts];
  return cache;
}

/** The product series available for a component kind (the brand choice). */
export function catalogSeries(kind: CatalogKind): CatalogSeries[] {
  return allSeries().filter((s) => s.kind === kind);
}

/** Nearest parts by |log ratio| where `count` counts DISTINCT VALUES, but
 *  every same-value variant rides along (multi-gauge coils: one inductance
 *  in 0.7/1.0/1.4 mm with different DCR and price — the discrete snap must
 *  see all of them to weigh damping vs budget; naive top-N would fill every
 *  slot with one value in three gauges and lose value diversity). */
function nearestWithVariants(
  pool: readonly CatalogPart[],
  value: number,
  count: number,
): CatalogPart[] {
  const sorted = [...pool].sort((a, b) => {
    const d = Math.abs(Math.log(a.value / value)) - Math.abs(Math.log(b.value / value));
    if (Math.abs(d) > 1e-12) return d;
    // Distance tie (same value): a priced part is an EXACT market SKU —
    // it beats a generated-grid estimate of the same value.
    return (b.priceEur !== undefined ? 1 : 0) - (a.priceEur !== undefined ? 1 : 0);
  });
  const values = new Set<string>();
  const out: CatalogPart[] = [];
  for (const p of sorted) {
    const key = p.value.toPrecision(6);
    if (values.has(key)) {
      out.push(p);
    } else if (values.size < count) {
      values.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Closest purchasable parts to a target value, ranked by |log ratio|;
 * optionally restricted to one product series (the designer's brand choice).
 * `count` counts distinct values; same-value gauge variants are included.
 */
export function nearestParts(
  kind: CatalogKind,
  value: number,
  count = 3,
  seriesId?: string,
): CatalogPart[] {
  if (!(value > 0)) return [];
  const wanted = seriesId ? allSeries().find((s) => s.id === seriesId) : undefined;
  return nearestWithVariants(
    catalogParts().filter(
      (p) => p.kind === kind && (!wanted || (p.brand === wanted.brand && p.series === wanted.series)),
    ),
    value,
    count,
  );
}

/* ------------------------------------------------------------------ */

/** One purchasable choice for a slot: a single part, or a 2-part STACK —
 *  coils in series / caps in parallel, both simply ADD values. Sanders
 *  doctrine: single components wherever possible, stacking is the fallback
 *  for values no single part covers. */
export interface CatalogPick {
  value: number;
  /** Effective simulated series resistance: series coils add DCR; parallel
   *  caps put their ESRs in parallel. */
  seriesR: number;
  label: string;
  parts: CatalogPart[];
  /** Summed EUR price — present when every member carries a price. */
  priceEur?: number;
}

const fmtVal = (kind: CatalogKind, v: number): string =>
  kind === 'C'
    ? `${(v * 1e6).toPrecision(3)} µF`
    : kind === 'L'
      ? `${(v * 1e3).toPrecision(3)} mH`
      : `${v.toPrecision(3)} Ω`;

const partLabel = (p: CatalogPart): string =>
  `${p.brand} ${p.series}${p.wireMm !== undefined ? ` ${p.wireMm.toFixed(1)} mm` : ''}`;

const singlePick = (p: CatalogPart): CatalogPick => ({
  value: p.value,
  seriesR: p.seriesR,
  label: partLabel(p),
  parts: [p],
  ...(p.priceEur !== undefined ? { priceEur: p.priceEur } : {}),
});

/**
 * Multi-part realisations whose SUM lands near the target (coils in series,
 * caps in parallel). Two shapes, because designers build both:
 *
 *  - a MIXED PAIR (e.g. 33 + 5.6 µF) — reaches a value the grid does not have;
 *  - a UNIFORM BANK of N identical parts (2×, 3×, 4×) — what a real 3-way
 *    midrange high-pass actually looks like. Troels Gravesen's published
 *    designs use 4 × 22 µF, 3 × 33 µF and 2 × 47 µF, and he notes on his own
 *    schematic that "C2011 can be 88-99 uF without impacting performance".
 *
 * The bank matters for more than tidiness: premium film simply STOPS around
 * 22 µF (Jantzen Superior Z-Cap's range ends there), so without banks the
 * premium pool cannot cover a midrange high-pass at all and the snap is forced
 * down a tier — the "wizard ignored my premium choice" complaint, but caused by
 * arithmetic rather than by the tier logic. Banks also tighten tolerance: N
 * independent parts sum to about σ/√N, and tolerance (not dielectric) is what
 * the measurements say actually matters.
 *
 * Resistors are excluded: the E-grid is dense and they are cheap anyway.
 * The caller applies a per-extra-part handicap, so a bank must genuinely pay.
 */
export function stackCandidates(
  kind: CatalogKind,
  value: number,
  count = 3,
  pool?: readonly CatalogPart[],
): CatalogPick[] {
  if (kind === 'R' || !(value > 0)) return [];
  const nearestIn = (v: number, n: number): CatalogPart[] =>
    pool
      ? nearestWithVariants(pool.filter((p) => p.kind === kind), v, n)
      : nearestParts(kind, v, n);
  const out = new Map<string, CatalogPick>();
  // Uniform banks of N identical parts, largest N first so a clean 4× bank is
  // preferred over a ragged pair at the same value.
  for (const n of [4, 3, 2]) {
    for (const a of nearestIn(value / n, 2)) {
      const v = a.value * n;
      if (Math.abs(Math.log(v / value)) > Math.log(1.4)) continue;
      const key = Array(n).fill(a.id).join('+');
      if (out.has(key)) continue;
      out.set(key, {
        value: v,
        seriesR: kind === 'L' ? a.seriesR * n : a.seriesR / n,
        label: `${partLabel(a)} ${fmtVal(kind, a.value)} (${n}× ${
          kind === 'L' ? 'in series' : 'in parallel'
        })`,
        parts: Array(n).fill(a),
        ...(a.priceEur !== undefined
          ? { priceEur: Number((a.priceEur * n).toFixed(2)) }
          : {}),
      });
    }
  }
  for (const f of [0.5, 0.33, 0.7]) {
    for (const a of nearestIn(value * f, 2)) {
      if (!(a.value < value)) continue;
      const rest = value - a.value;
      if (!(rest > 0)) continue;
      for (const b of nearestIn(rest, 2)) {
        const v = a.value + b.value;
        if (Math.abs(Math.log(v / value)) > Math.log(1.4)) continue;
        const [p1, p2] = a.value >= b.value ? [a, b] : [b, a];
        const key = `${p1.id}+${p2.id}`;
        if (out.has(key)) continue;
        out.set(key, {
          value: v,
          seriesR:
            kind === 'L'
              ? p1.seriesR + p2.seriesR
              : p1.seriesR > 0 && p2.seriesR > 0
                ? (p1.seriesR * p2.seriesR) / (p1.seriesR + p2.seriesR)
                : 0,
          label: `${partLabel(p1)} ${fmtVal(kind, p1.value)} + ${fmtVal(kind, p2.value)} (2× ${
            kind === 'L' ? 'in series' : 'in parallel'
          })`,
          parts: [p1, p2],
          ...(p1.priceEur !== undefined && p2.priceEur !== undefined
            ? { priceEur: Number((p1.priceEur + p2.priceEur).toFixed(2)) }
            : {}),
        });
      }
    }
  }
  return [...out.values()]
    .sort((x, y) => {
      const d = Math.abs(Math.log(x.value / value)) - Math.abs(Math.log(y.value / value));
      // Near-ties go to the realisation with FEWER physical parts — "single
      // where it can" applies inside the stack shortlist too.
      if (Math.abs(d) > 1e-6) return d;
      return x.parts.length - y.parts.length;
    })
    .slice(0, count);
}

/** The exact parts imported via a v4 flat catalog (empty without one). */
export function customCatalogParts(): CatalogPart[] {
  return customParts;
}

/** The built-in product-series definitions (the manager shows them as the
 *  overridable baseline — an edit lands as a custom series with the SAME id,
 *  exactly like a file import overrides a built-in). */
export function builtinSeries(): CatalogSeries[] {
  return SERIES;
}

/** The generated-grid series definition (built-in or imported) covering a
 *  brand+series, if any. The catalog manager uses it to warn that a FIRST
 *  exact SKU for such a series shadows the entire generated grid. */
export function gridSeriesFor(brand: string, series: string): CatalogSeries | undefined {
  const overridden = new Set(custom.map((s) => s.id));
  const key = seriesKey(brand, series);
  return [...SERIES.filter((s) => !overridden.has(s.id)), ...custom].find(
    (s) => seriesKey(s.brand, s.series) === key,
  );
}

/** True once the user has imported a real catalog (flat SKUs or series).
 *  Snap-to-catalog is only meaningful then: without an import the only
 *  "catalog" is the built-in estimated grid, and Sander's rule is to keep
 *  theoretically ideal (continuous) values rather than snap to those. */
export function hasImportedCatalog(): boolean {
  return customParts.length > 0 || custom.length > 0;
}

/** Component wizard preferences for the discrete snap. A series choice is
 *  BINDING per kind (like the HP/LP preference — the designer picks, with
 *  'auto' as the free option); the profile steers TIER per position:
 *  Sanders doctrine 'position' = series-path premium-ish, shunt budget. */
export interface SnapPrefs {
  profile: 'auto' | 'budget' | 'balanced' | 'premium' | 'position';
  seriesByKind?: Partial<Record<CatalogKind, string>>;
  /** false = never stack (singles only). Default true: stacking is allowed
   *  where no single part covers — and WITHIN a preferred tier/series a
   *  stack is tried BEFORE dropping down (Sanders: premium mag stapelen). */
  allowStacks?: boolean;
  /** When true, a bound series (seriesByKind) also HARD-bounds the continuous
   *  FIT of SERIES-PATH slots of that kind to the series' value range — the
   *  optimizer works within e.g. Alumen 1–10 µF from the start and the network
   *  adapts, instead of fitting free then snapping (which wrecks the response —
   *  the 1.8 dB lesson). Shunt/notch slots keep the wide bounds. */
  boundToSeries?: boolean;
  /** Reference impedance (Ω) the coil DCR budget is measured against — the
   *  median |Z| the network works into. Optional: without it the DCR guard
   *  below stays off and behaviour is exactly as before. */
  refOhms?: number;
}
export type SnapPosition = 'series' | 'shunt';

/**
 * How much DCR a coil may carry in this position, in dB of level it is
 * allowed to cost.
 *
 * THE POINT (Sanders "de doctrine moet de beste spoelen kiezen waar het er
 * toe doet"): for a capacitor, "budget" means a cheaper dielectric — nearly
 * the same part electrically. For an INDUCTOR "budget" means thinner wire,
 * and DCR is a first-order electrical parameter: it changes the filter, the
 * damping and the impedance minimum. Tier cannot express that, because tier
 * lives per SERIES while gauge varies per SKU — every Air Core coil from
 * 0.3 to 1.8 mm carries the same tier.
 *
 * Why a guard is needed at all even though the solver DOES model DCR: the
 * tuner simply compensates it elsewhere and the response stays flat, so the
 * cost is paid in SENSITIVITY, which no response metric sees. That is exactly
 * the blindness solo mode already fixed with its sensitivity budget — this is
 * the same rule for the branch that feeds a driver.
 *
 * Series path sits directly in series with the driver, so its DCR is a
 * straight level loss: budget 0.5 dB ≈ 6% of the reference impedance. A shunt
 * leg only loses depth of its short, so it gets four times the room.
 */
export const DCR_BUDGET_DB: Record<SnapPosition, number> = { series: 0.5, shunt: 2.0 };

export function dcrCeilingOhms(position: SnapPosition | undefined, refOhms: number): number {
  if (!(refOhms > 0)) return Infinity;
  const db = DCR_BUDGET_DB[position ?? 'shunt'];
  // Level through a series resistance: 20·log10(Z / (Z + R)) = −db.
  return refOhms * (10 ** (db / 20) - 1);
}

/** Ordered candidate pools per wizard preference: binding series first,
 *  then the tier cascade. The caller keeps walking down (ending at the full
 *  catalog) until a pool actually COVERS the requested value — a premium
 *  series whose caps stop at 10 µF must not force 10 µF where 15 µF is
 *  needed (hard geleerd: dat kostte 1,8 dB). */
/** [min, max] value (SI: F / H / Ω) across a catalog series' parts, or null
 *  when the series is unknown or empty. Used by the value-window feature to
 *  bound the continuous fit to a bound series' range (e.g. Alumen 1–10 µF). */
export function seriesValueRange(seriesId: string, kind: CatalogKind): [number, number] | null {
  const want = allSeries().find((x) => x.id === seriesId);
  if (!want) return null;
  const parts = catalogParts().filter(
    (p) => p.kind === kind && seriesKey(p.brand, p.series) === seriesKey(want.brand, want.series),
  );
  if (parts.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of parts) {
    if (p.value < lo) lo = p.value;
    if (p.value > hi) hi = p.value;
  }
  return [lo, hi];
}

function preferredPools(
  kind: CatalogKind,
  prefs: SnapPrefs | null | undefined,
  position: SnapPosition | undefined,
): CatalogPart[][] {
  if (!prefs) return [];
  const pool = catalogParts().filter((p) => p.kind === kind);
  const out: CatalogPart[][] = [];
  const sid = prefs.seriesByKind?.[kind];
  if (sid && sid !== 'auto') {
    const want = allSeries().find((x) => x.id === sid);
    if (want) {
      const only = pool.filter(
        (p) => seriesKey(p.brand, p.series) === seriesKey(want.brand, want.series),
      );
      if (only.length > 0) out.push(only);
    }
  }
  /* TIER PREFERENCE DOES NOT APPLY TO COILS. Coil DCR is a position
   * property, not a tier (the documented doctrine): a cap's tier changes the
   * dielectric, a coil's tier changes the WIRE, and DCR is a first-order
   * parameter the solver models. A premium coil with the same DCR as a cheap
   * one is electrically the same component at ten times the price — measured
   * on Sanders' centre: the position profile put two Mundorf Zero-Ohm coils
   * (319 + 228 EUR) in the woofer's series path while an 11-EUR P-core with
   * 0.2 ohm more DCR sat in the same catalog, and the solver would have
   * absorbed that difference without a trace. The DCR ceiling (dcrCeilingOhms,
   * applied in pickCandidates) is the honest coil constraint; among coils
   * that clear it, the snap's cost weight should decide. An EXPLICIT series
   * binding above still wins — that is the designer's own call. */
  if (kind === 'L') return out;
  const cascade: CatalogTier[] =
    prefs.profile === 'budget'
      ? ['budget', 'standard']
      : prefs.profile === 'balanced'
        ? ['standard']
        : prefs.profile === 'premium'
          ? ['premium', 'standard']
          : prefs.profile === 'position'
            ? position === 'shunt'
              ? ['budget', 'standard']
              : ['premium', 'standard']
            : [];
  for (const t of cascade) {
    const only = pool.filter((p) => p.tier === t);
    if (only.length > 0) out.push(only);
  }
  return out;
}

/**
 * Slot candidates for the discrete snap: the nearest SINGLE parts always;
 * stacks only join the shortlist when the best single misses the target by
 * more than ~3% (out-of-range values, gaps in the grid). The caller applies
 * a per-extra-part handicap, so a single still wins unless the stack pays.
 * Wizard prefs restrict the single-part pool (binding series per kind, tier
 * per position); stacks stay unrestricted — they are the fallback anyway.
 */
export function pickCandidates(
  kind: CatalogKind,
  value: number,
  count = 3,
  prefs: SnapPrefs | null = null,
  position?: SnapPosition,
): CatalogPick[] {
  const stacksOk = prefs?.allowStacks !== false;
  // Coil DCR guard (see dcrCeilingOhms): drop gauges whose resistance costs
  // more level than this position may spend. Applied to the POOL, before the
  // nearest-value walk, so the shortlist is filled with usable gauges instead
  // of being spent on wire that is too thin. Never empties the pool: if every
  // variant of a value is over budget the thickest survives, so a slot always
  // has something to snap to and the caller still sees the honest DCR.
  const withinDcr = (parts: readonly CatalogPart[]) => {
    const ceil = kind === 'L' ? dcrCeilingOhms(position, prefs?.refOhms ?? 0) : Infinity;
    if (!isFinite(ceil)) return parts;
    const ok = parts.filter((p) => (p.seriesR ?? 0) <= ceil);
    if (ok.length > 0) return ok;
    const best = [...parts].sort((a, b) => (a.seriesR ?? 0) - (b.seriesR ?? 0))[0];
    return best ? [best] : parts;
  };
  /* Real SKUs beat generated grids WHEN THEY CAN COVER THE VALUE. With a real
   * database imported, a grid entry is fictional inventory: Sander's 3-way
   * snapped three big caps onto a built-in "Standard Z-Cap" grid at 22/56/91
   * µF — a series absent from his 2388-SKU import, at an E24 value the product
   * does not come in — and because grid entries carry no price they looked
   * FREE to the cost term while the real Cross-Cap next to them did not. Ten
   * of twenty-five BOM lines came out unpriced and unbuyable.
   *
   * Only where real parts CAN cover, though (25%, the same reach the pool
   * fallback uses): dropping the grid wholesale would reopen the coverage-gap
   * failure, which shows up as mysterious fit loss rather than as an error. */
  const preferReal = (parts: readonly CatalogPart[]) => {
    const real = parts.filter((p) => p.real);
    if (real.length === 0) return parts;
    const covers = real.some((p) => Math.abs(Math.log(p.value / value)) <= Math.log(1.25));
    return covers ? real : parts;
  };
  const usable = (parts: readonly CatalogPart[]) =>
    preferReal(withinDcr(parts.filter((p) => p.kind === kind)));
  const singlesFrom = (parts: readonly CatalogPart[]) =>
    nearestWithVariants(usable(parts), value, count).map(singlePick);
  // Walk the preference pools: a pool covers the value when a SINGLE part is
  // within 25% — or, with stacking allowed, when an IN-POOL stack lands
  // within 5%. Premium may stack premium before dropping a tier (Sanders).
  for (const pool of preferredPools(kind, prefs, position)) {
    const singles = singlesFrom(pool);
    const bestErr = singles.length > 0 ? Math.abs(Math.log(singles[0].value / value)) : Infinity;
    if (bestErr <= Math.log(1.03)) return singles;
    const poolStacks = stacksOk ? stackCandidates(kind, value, count, usable(pool)) : [];
    const stackErr =
      poolStacks.length > 0 ? Math.abs(Math.log(poolStacks[0].value / value)) : Infinity;
    if (bestErr <= Math.log(1.25) || stackErr <= Math.log(1.05)) {
      return [...singles, ...poolStacks];
    }
  }
  // No preference (or nothing covered): the full catalog — the DCR guard is
  // NOT a preference, it is feasibility, so it applies here too.
  const full = usable(catalogParts());
  const singles = nearestWithVariants(full, value, count).map(singlePick);
  const bestErr = singles.length > 0 ? Math.abs(Math.log(singles[0].value / value)) : Infinity;
  if (bestErr <= Math.log(1.03) || !stacksOk) return singles;
  return [...singles, ...stackCandidates(kind, value, count, full)];
}

export interface BomRow {
  partId: string;
  kind: CatalogKind;
  /** SI value from the schematic (H / F / Ω). */
  value: number;
  /** Exact catalog part (value within 1%) — null = not purchasable as-is. */
  match: CatalogPart | null;
  /** 2-part stack whose sum matches (series coils / parallel caps) — the
   *  snap builds these where no single part covers the value. */
  stackMatch?: CatalogPick;
}

export interface Bom {
  rows: BomRow[];
  /** Sum of known prices; null when NO row has a price. */
  totalEur: number | null;
  /** Rows with a known price (prices are opt-in catalog data). */
  pricedCount: number;
  /** Rows without an exact catalog match. */
  unmatchedCount: number;
}

const PART_KIND: Record<string, { kind: CatalogKind; param: string; toSi: number }> = {
  Inductor: { kind: 'L', param: 'L', toSi: 1e-3 },
  Capacitor: { kind: 'C', param: 'C', toSi: 1e-6 },
  Resistor: { kind: 'R', param: 'R', toSi: 1 },
};

/** Bill of materials for a schematic: every R/L/C matched against the catalog. */
export function bomFor(parts: readonly VxpPart[]): Bom {
  const rows: BomRow[] = [];
  for (const p of parts) {
    const meta = PART_KIND[p.type];
    if (!meta) continue;
    const raw = p.params.find((q) => q.name === meta.param)?.value;
    if (raw === undefined || !(raw > 0)) continue;
    const value = raw * meta.toSi;
    // 1. Authoritative: the SKU(s) the snap actually chose, verified against
    //    the current value (a manual edit must not let the field lie).
    let match: CatalogPart | null = null;
    let stackMatch: CatalogPick | undefined;
    if (p.catalog) {
      const ids = p.catalog.split('+');
      const found = ids.map((id) => catalogParts().find((c) => c.id === id));
      if (found.every((c): c is CatalogPart => !!c)) {
        const sum = found.reduce((a, c) => a + c.value, 0);
        if (Math.abs(Math.log(sum / value)) < 0.01) {
          if (found.length === 1) match = found[0];
          else {
            const priced = found.every((c) => c.priceEur !== undefined);
            stackMatch = {
              value: sum,
              seriesR: found[0].seriesR,
              label: `${found.map((c) => formatCatalogPart(c)).join(' + ')} (${found.length}×)`,
              parts: found,
              ...(priced
                ? { priceEur: Number(found.reduce((a, c) => a + (c.priceEur ?? 0), 0).toFixed(2)) }
                : {}),
            };
          }
        }
      }
    }
    // 2. Fallback: match by value; among same-value ties prefer the part
    //    whose DCR/ESR agrees with the schematic params — a 10 µF exists in
    //    five series, and showing the wrong sibling reads as "the wizard
    //    ignored my premium choice".
    if (!match && !stackMatch) {
      const paramR = p.params.find((q) => q.name === 'DCR' || q.name === 'ESR')?.value;
      const close = catalogParts()
        .filter((c) => c.kind === meta.kind && Math.abs(Math.log(c.value / value)) < 0.01)
        .sort((a, b) => {
          const dv = Math.abs(Math.log(a.value / value)) - Math.abs(Math.log(b.value / value));
          if (Math.abs(dv) > 1e-12) return dv;
          // Same value: a PRICED exact SKU beats an unpriced generated-grid
          // sibling (as nearestWithVariants does) — without this a bare cap
          // at a catalog value matched the builtin grid ghost and the BOM
          // read "no price" even with a fully priced import loaded.
          const pa = a.priceEur !== undefined ? 0 : 1;
          const pb = b.priceEur !== undefined ? 0 : 1;
          if (pa !== pb) return pa - pb;
          if (paramR === undefined || !(paramR > 0)) return 0;
          return Math.abs(a.seriesR - paramR) - Math.abs(b.seriesR - paramR);
        });
      match = close[0] ?? null;
      if (!match) {
        const st = stackCandidates(meta.kind, value, 1)[0];
        if (st && Math.abs(Math.log(st.value / value)) < 0.01) stackMatch = st;
      }
    }
    rows.push({
      partId: p.partId ?? p.type,
      kind: meta.kind,
      value,
      match,
      ...(stackMatch ? { stackMatch } : {}),
    });
  }
  let total = 0;
  let priced = 0;
  for (const r of rows) {
    if (r.match?.priceEur !== undefined) {
      total += r.match.priceEur;
      priced++;
    } else if (r.stackMatch?.priceEur !== undefined) {
      total += r.stackMatch.priceEur;
      priced++;
    }
  }
  return {
    rows,
    totalEur: priced > 0 ? Number(total.toFixed(2)) : null,
    pricedCount: priced,
    unmatchedCount: rows.filter((r) => r.match === null && !r.stackMatch).length,
  };
}

/** "1.2 mH · 1.4 mm · 0.326 Ω" / "10 µF · Alumen Z-Cap" / "8.2 Ω · Superes 10 W". */
export function formatCatalogPart(p: CatalogPart): string {
  if (p.kind === 'L') {
    return `${trim3(p.value * 1e3)} mH · ${p.wireMm?.toFixed(1)} mm · ${trim3(p.seriesR)} Ω${priceTag(p)}`;
  }
  if (p.kind === 'C') return `${trim3(p.value * 1e6)} µF · ${p.series}${priceTag(p)}`;
  return `${trim3(p.value)} Ω · ${p.series} ${p.powerW ?? ''} W${priceTag(p)}`;
}

const trim3 = (v: number): string => String(Number(v.toPrecision(3)));

const priceTag = (p: CatalogPart): string =>
  p.priceEur !== undefined ? ` · €${p.priceEur.toFixed(2)}` : '';
