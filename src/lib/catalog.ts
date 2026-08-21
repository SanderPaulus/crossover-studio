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

/**
 * Series the designer has switched OFF — stock he is not willing to buy
 * (Sander: "de Jantzen Bipolar caps wil ik niet gebruiken"). It is a
 * preference, not catalog data: it is kept out of the catalog file so a
 * re-import cannot resurrect a series you rejected, and so an exported
 * catalog stays a description of what EXISTS rather than of what one person
 * happens to like.
 *
 * Filtered in `catalogParts()` — the single pool every consumer draws from —
 * so "off" means the same thing to the snap, the inspector suggestions and
 * the BOM. Splitting that into per-consumer rules is the two-definitions trap
 * this codebase keeps paying for: a part the BOM prices but the snap refuses
 * (or the reverse) is worse than either answer alone.
 */
let disabled: ReadonlySet<string> = new Set();

export function setDisabledSeries(ids: readonly string[]): void {
  disabled = new Set(ids);
  cache = null;
}

export function disabledSeries(): string[] {
  return [...disabled];
}

/**
 * Hydrate the catalog from a serialized payload — the worker's whole view of
 * the catalog. Lives HERE, not in the worker, so the invariant is unit-
 * testable: the disabled list must be applied, and an ABSENT list must clear
 * a previous one (worker module state survives between requests of one
 * spawn). Regression: the payload used to carry only series+parts, so the
 * worker's snap priced switched-off stock — the scan table showed a winner
 * at €94 that the real BOM re-priced to €114.
 */
export function applyCatalogPayload(c: {
  series: CatalogSeries[];
  parts: CatalogPart[];
  disabled?: string[];
}): void {
  setCustomSeries(c.series, c.parts);
  setDisabledSeries(c.disabled ?? []);
}

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
  if (cache === null) {
    const all = [...buildCatalog(), ...customParts];
    if (disabled.size === 0) {
      cache = all;
    } else {
      // Resolve ids to brand+series once: a part carries names, a series
      // carries an id, and built-in ids are not guaranteed to be the slug.
      const off = new Set(
        allSeries()
          .filter((s) => disabled.has(s.id))
          .map((s) => seriesKey(s.brand, s.series)),
      );
      cache = all.filter((p) => !off.has(seriesKey(p.brand, p.series)));
    }
  }
  return cache;
}

/** The product series available for a component kind (the brand choice).
 *  Switched-off series are gone here too — you cannot bind to stock you have
 *  told the app you will not buy. `allSeries()` stays complete, because the
 *  catalog manager has to list them to switch them back on. */
export function catalogSeries(kind: CatalogKind): CatalogSeries[] {
  return allSeries().filter((s) => s.kind === kind && !disabled.has(s.id));
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
  /* Split points to try. 0.25 and 0.2 were added Aug 2026: with only ½, ⅓ and
   * 0.7 an UNEVEN pair like 10 + 33 µF for a 43 µF slot was unreachable, so
   * the row fell back to a generated-grid ghost with no price — measured on
   * Sanders' B·C1. Each factor costs one nearest-value lookup. */
  for (const f of [0.5, 0.33, 0.7, 0.25, 0.2]) {
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
      if (x.parts.length !== y.parts.length) return x.parts.length - y.parts.length;
      /* Then BUYABLE before fictional. Six unpriced grid variants of the same
       * 30 + 13 µF pair used to fill the shortlist and push the real, priced
       * 33 + 10 µF off the end of it (measured on Sanders' 43 µF slot), which
       * left the BOM with no price for a row a builder can simply order. */
      const px = x.priceEur !== undefined ? 0 : 1;
      const py = y.priceEur !== undefined ? 0 : 1;
      if (px !== py) return px - py;
      return (x.priceEur ?? 0) - (y.priceEur ?? 0);
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

/**
 * How much series DCR one BRANCH may carry in total, in dB of level.
 *
 * WHY A SECOND CONSTANT (aug 2026, Sanders "19 simulaties en we kunnen niets
 * beters verzinnen"): `DCR_BUDGET_DB` is a per-PART allowance, and R_source is
 * a per-BRANCH property. A woofer low-pass has two or three series elements;
 * each one cleared its own 0.5 dB and together they handed the amplifier
 * 1.7 Ohm — measured on the KOAN 3-way scan, where 15 of 19 candidates were
 * disqualified on source resistance while Sanders' own hand-built filter sat
 * at 0.23 Ohm. The reference was wrong too (see reOhms below).
 *
 * 1.0 dB is calibrated on that hand-built filter: 0.24 + 0.19 Ohm of series
 * DCR into a 3.2 Ohm woofer pair = 1.1 dB, Qts up ~13%. Published passive
 * designs sit in that region; twice that is where a bass alignment starts to
 * read as "slow".
 */
export const BRANCH_SERIES_DCR_DB = 1.0;

/**
 * Total series-DCR budget for one branch, in ohms.
 *
 * `reOhms` must be the MINIMUM |Z| of that branch's driver, not a median over
 * every driver: DCR competes with the resistance the driver actually shows in
 * its passband, and the pooled median (5.66 Ohm on the KOAN set, pulled up by
 * the tweeter and by every coil's inductive rise) is nearly twice the woofer
 * pair's 3.2 Ohm — so the guard was ~2x too generous exactly where it matters
 * most. `limitOhms` is the hard source-resistance ceiling the ranking uses,
 * with margin: designing right up against a disqualification line is what the
 * scan was doing.
 */
export function branchDcrBudgetOhms(reOhms: number, limitOhms?: number): number {
  if (!(reOhms > 0)) return Infinity;
  const level = reOhms * (10 ** (BRANCH_SERIES_DCR_DB / 20) - 1);
  return limitOhms && limitOhms > 0 ? Math.min(level, limitOhms * 0.7) : level;
}

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
/**
 * Every purchasable realisation of a slot value, singles and stacks together,
 * nearest first — what the inspector offers the designer.
 *
 * Why stacks belong in that list (aug 2026, Sanders "maar het moet Jantzen
 * Alumen Z zijn"): premium film stops around 10 µF, so binding a 13.6 µF slot
 * to Alumen used to offer only the 10 µF — 26% off his value, i.e. a different
 * filter. The bank (2× 6.80 µF) is the realisation a builder actually uses,
 * the machinery already existed for the snap, and `VxpPart.catalog` already
 * carries the `SKU+SKU` form the BOM reads back.
 */
/**
 * Human label for one realisation: what you buy, and what it comes to.
 *
 * The point (Sanders "het is vooral onduidelijk wat er nu gebeurt"): a list
 * that reads "Jantzen Electrolytic Bipolar · €1.74" tells you the series and
 * the price and leaves out the one number the designer is choosing. A bank
 * has to state its arithmetic — 2× 6.80 µF = 13.6 µF — or the schematic value
 * seems to change by itself.
 */
export function describeRealisation(pick: CatalogPick, kind: CatalogKind): string {
  const val = (v: number) =>
    kind === 'L'
      ? `${trim3(v * 1e3)} mH`
      : kind === 'C'
        ? `${trim3(v * 1e6)} µF`
        : `${trim3(v)} Ω`;
  const price = pick.priceEur !== undefined ? ` · €${pick.priceEur.toFixed(2)}` : '';
  const p0 = pick.parts[0];
  if (pick.parts.length === 1) {
    const extra =
      kind === 'L' && p0.wireMm !== undefined
        ? ` · ${p0.wireMm.toFixed(1)} mm · ${trim3(p0.seriesR)} Ω`
        : '';
    return `${val(p0.value)} · ${p0.series}${extra}${price}`;
  }
  const uniform = pick.parts.every((x) => x.id === p0.id);
  const how = kind === 'L' ? 'in series' : 'in parallel';
  const sum = `= ${val(pick.value)}`;
  return uniform
    ? `${pick.parts.length}× ${val(p0.value)} ${sum} · ${p0.series} (${how})${price}`
    : `${pick.parts.map((x) => val(x.value)).join(' + ')} ${sum} · ${p0.series} (${how})${price}`;
}

export function nearestRealisations(
  kind: CatalogKind,
  value: number,
  count = 8,
  seriesId?: string,
  /** Only realisations built from exactly this many physical parts (the
   *  inspector's count field). Omitted = every shape, nearest first. */
  partCount?: number,
): CatalogPick[] {
  if (!(value > 0)) return [];
  const wanted = seriesId ? allSeries().find((s) => s.id === seriesId) : undefined;
  const pool = catalogParts().filter(
    (p) => p.kind === kind && (!wanted || (p.brand === wanted.brand && p.series === wanted.series)),
  );
  /* With a count asked for, the value each PART must carry changes: N caps in
   * parallel (or N coils in series) each hold value/N. Searching the pool
   * around value/N is what makes "give me 2×" find 6.80 µF for a 13.6 µF slot
   * instead of reporting that nothing near 13.6 exists in this series. */
  if (partCount !== undefined && partCount > 1) {
    const per = value / partCount;
    const out: CatalogPick[] = [];
    for (const a of nearestWithVariants(pool, per, count)) {
      const v = a.value * partCount;
      out.push({
        value: v,
        seriesR: kind === 'L' ? a.seriesR * partCount : a.seriesR / partCount,
        label: `${partLabel(a)} ${fmtVal(kind, a.value)} (${partCount}× ${
          kind === 'L' ? 'in series' : 'in parallel'
        })`,
        parts: Array(partCount).fill(a),
        ...(a.priceEur !== undefined
          ? { priceEur: Number((a.priceEur * partCount).toFixed(2)) }
          : {}),
      });
    }
    // Mixed pairs are a two-part shape too, and often land closer.
    if (partCount === 2) {
      out.push(...stackCandidates(kind, value, count, pool).filter((p) => p.parts.length === 2));
    }
    return out
      .sort((a, b) => {
        const d = Math.abs(Math.log(a.value / value)) - Math.abs(Math.log(b.value / value));
        if (Math.abs(d) > 1e-9) return d;
        return (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity);
      })
      .slice(0, count);
  }
  const singles = nearestWithVariants(pool, value, count).map(singlePick);
  if (partCount === 1) return singles.slice(0, count);
  const stacks = stackCandidates(kind, value, Math.max(2, Math.ceil(count / 2)), pool);
  const err = (v: number) => Math.abs(Math.log(v / value));
  /* SINGLE WHERE IT CAN (Sanders' doctrine, and what pickCandidates already
   * does for the snap): anything inside 3% counts as hitting the value, so a
   * 2-part stack must not outrank a single 22 µF just because 15 + 6.8 lands
   * 0.5% closer. Below that band the stack is the only way to reach the value
   * and it comes first on merit. */
  const band = (v: number) => (err(v) <= Math.log(1.03) ? 0 : 1);
  return [...singles, ...stacks]
    .sort((a, b) => {
      if (band(a.value) !== band(b.value)) return band(a.value) - band(b.value);
      if (a.parts.length !== b.parts.length) return a.parts.length - b.parts.length;
      const d = err(a.value) - err(b.value);
      if (Math.abs(d) > 1e-9) return d;
      return (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity);
    })
    .slice(0, count);
}

export function pickCandidates(
  kind: CatalogKind,
  value: number,
  count = 3,
  prefs: SnapPrefs | null = null,
  position?: SnapPosition,
  /** Absolute DCR ceiling for THIS slot (Ω), from the caller's per-branch
   *  budget. Wins over the refOhms-derived per-part allowance; omitted = the
   *  historical behaviour. */
  dcrCeilOhms?: number,
): CatalogPick[] {
  const stacksOk = prefs?.allowStacks !== false;
  // Coil DCR guard (see dcrCeilingOhms): drop gauges whose resistance costs
  // more level than this position may spend. Applied to the POOL, before the
  // nearest-value walk, so the shortlist is filled with usable gauges instead
  // of being spent on wire that is too thin. Never empties the pool: if every
  // variant of a value is over budget the thickest survives, so a slot always
  // has something to snap to and the caller still sees the honest DCR.
  const coilCeil =
    kind === 'L'
      ? Math.min(
          dcrCeilOhms !== undefined && dcrCeilOhms > 0 ? dcrCeilOhms : Infinity,
          dcrCeilingOhms(position, prefs?.refOhms ?? 0),
        )
      : Infinity;
  const withinDcr = (parts: readonly CatalogPart[]) => {
    const ceil = coilCeil;
    if (!isFinite(ceil)) return parts;
    const ok = parts.filter((p) => (p.seriesR ?? 0) <= ceil);
    /* VALUE BEATS DCR when the two collide. Measured while building this:
     * with a budget nothing could meet, the "keep the lowest-DCR part" escape
     * handed back a 0.047 mH coil for a 1.0 mH slot — a 20x value error to
     * save a tenth of an ohm, which is a far worse network than an honest
     * over-budget coil. Same value-aware fallback the tier pools use (25%):
     * the guard only applies while the filtered pool can still cover the
     * value; otherwise the pool stands and the real DCR stays visible. */
    const near = (p: CatalogPart) => Math.abs(Math.log(p.value / value)) <= Math.log(1.25);
    if (ok.length > 0 && ok.some(near)) return ok;
    /* BUDGET UNREACHABLE FOR THIS VALUE — and this is where the first version
     * of this guard went wrong, measured: handing back the UNFILTERED pool
     * means the cost term decides, and cheap coil = thin wire, so an
     * impossible budget produced the very worst DCR in the catalog. When the
     * budget cannot be met, the answer is the most copper available at the
     * right value, not the least. Keep everything within 1.5x of the lowest
     * achievable DCR (buying a neighbouring value stays possible); the caller
     * reports the shortfall so it never passes silently. */
    const covering = parts.filter(near);
    if (covering.length === 0) return ok.length > 0 ? ok : parts;
    let minR = Infinity;
    for (const p of covering) minR = Math.min(minR, p.seriesR ?? 0);
    const room = Math.max(ceil, minR * 1.5);
    const kept = parts.filter((p) => (p.seriesR ?? 0) <= room);
    return kept.length > 0 ? kept : parts;
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
  /* STACKS CARRY THE SUM. Two coils in series add their DCR, and the pool
   * filter above only sees the parts one at a time — so a stack of two coils
   * that each cleared the budget handed over twice it. That is literally the
   * 2.59 mH stack in the KOAN scan's woofer path. Same never-empty rule as
   * withinDcr: if no stack clears, keep the lowest-resistance one so the slot
   * still has a fallback and the honest DCR stays visible. */
  const stacksWithinDcr = (picks: CatalogPick[]): CatalogPick[] => {
    if (kind !== 'L' || !isFinite(coilCeil)) return picks;
    const ok = picks.filter((p) => p.seriesR <= coilCeil);
    if (ok.length > 0 || picks.length === 0) return ok;
    return [[...picks].sort((a, b) => a.seriesR - b.seriesR)[0]];
  };
  const singlesFrom = (parts: readonly CatalogPart[]) =>
    nearestWithVariants(usable(parts), value, count).map(singlePick);
  // Walk the preference pools: a pool covers the value when a SINGLE part is
  // within 25% — or, with stacking allowed, when an IN-POOL stack lands
  // within 5%. Premium may stack premium before dropping a tier (Sanders).
  for (const pool of preferredPools(kind, prefs, position)) {
    const singles = singlesFrom(pool);
    const bestErr = singles.length > 0 ? Math.abs(Math.log(singles[0].value / value)) : Infinity;
    if (bestErr <= Math.log(1.03)) return singles;
    const poolStacks = stacksOk
      ? stacksWithinDcr(stackCandidates(kind, value, count, usable(pool)))
      : [];
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
  return [...singles, ...stacksWithinDcr(stackCandidates(kind, value, count, full))];
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
    /* A STAMP FOR SOMETHING THAT DOES NOT EXIST IS NOT A CHOICE. Generated
     * grid entries never carry a price, and the inspector only ever offers
     * priced parts — so an unpriced stamp is always a grid ghost from an
     * older snap, never a decision the designer made. Sanders' saved design
     * carried `jantzen-zstd-43.00` (an E24 grid value from a series absent
     * from his own catalog) and a 68+68 grid stack, while the identical pair
     * of real electrolytics sat in the catalog at €5.28. Drop the stamp and
     * let the value search below find something buyable. */
    if (match && match.priceEur === undefined) match = null;
    if (stackMatch && stackMatch.priceEur === undefined) stackMatch = undefined;
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
      /* A BOM IS A SHOPPING LIST — a row you cannot buy is a gap, not a
       * choice (aug 2026, Sanders' 43 µF and 136 µF). Two ways an unbuyable
       * row got in: a generated-grid value that no real product comes in
       * (his "Standard Z-Cap 43 µF" — an E24 grid entry from a series absent
       * from his 2388-SKU import), and a stack built from those same unpriced
       * grid parts (68 + 68) while the identical pair of real electrolytics
       * sat in the catalog at €5.28. Both read as free to the cost term and
       * as available to the builder.
       *
       * So when nothing PRICED was found at this value, look for a priced
       * realisation before settling — but inside the SAME 1% window. Value
       * stays king: buying a 10% different part to get a price tag would be
       * the same mistake in the other direction. */
      if (!match || match.priceEur === undefined) {
        const sts = stackCandidates(meta.kind, value, 6);
        const priced = sts.find(
          (st) => st.priceEur !== undefined && Math.abs(Math.log(st.value / value)) < 0.01,
        );
        if (priced) {
          stackMatch = priced;
          match = null; // the priced stack IS the answer for this row
        } else if (!match) {
          const st = sts[0];
          if (st && Math.abs(Math.log(st.value / value)) < 0.01) stackMatch = st;
        }
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
