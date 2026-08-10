import type { CatalogKind, CatalogPart, CatalogSeries } from './catalog.ts';
import { builtinSeries, gridSeriesFor } from './catalog.ts';

/**
 * Catalog manager — SKU maintenance without leaving the app.
 *
 * The catalog file used to be updated OUTSIDE the app (export JSON, hand-edit
 * or AI-edit, re-import) — exactly the route that produced the stray-quote,
 * missing-decade and estimated-price incidents. These helpers give the
 * in-app manager panel a small, tested core: add/update/remove exact SKUs on
 * a DRAFT parts list, with validation aligned to the file format and a
 * warning for the one real footgun (a first exact SKU shadows a whole
 * generated grid). Committing the draft is the App's job (setCustomSeries +
 * localStorage), mirroring the import path.
 */

/** Add a SKU, or replace the one whose id is `originalId` (rename-safe).
 *  Pure: returns a new array, input untouched. */
export function upsertSku(
  parts: readonly CatalogPart[],
  part: CatalogPart,
  originalId?: string,
): CatalogPart[] {
  const target = originalId ?? part.id;
  const idx = parts.findIndex((p) => p.id === target);
  if (idx < 0) return [...parts, part];
  const out = [...parts];
  out[idx] = part;
  return out;
}

/** Remove a SKU by id. Pure. */
export function removeSku(parts: readonly CatalogPart[], id: string): CatalogPart[] {
  return parts.filter((p) => p.id !== id);
}

/** Validate a SKU draft against the same rules the file reader enforces —
 *  the manager must never be able to save what the import would reject.
 *  Returns a human-readable error, or null when the draft is sound.
 *  `originalId` = the id the draft is editing (its own slot never counts
 *  as a duplicate). */
export function skuError(
  draft: CatalogPart,
  parts: readonly CatalogPart[],
  originalId?: string,
): string | null {
  if (draft.id.trim() === '') return 'SKU id is required.';
  if (draft.brand.trim() === '') return 'Brand is required.';
  if (draft.series.trim() === '') return 'Series is required.';
  if (!Number.isFinite(draft.value) || !(draft.value > 0)) {
    return 'Value must be a number > 0.';
  }
  if (!Number.isFinite(draft.seriesR) || draft.seriesR < 0) {
    return draft.kind === 'L' ? 'DCR must be a number ≥ 0.' : 'ESR must be a number ≥ 0.';
  }
  if (draft.wireMm !== undefined && !(Number.isFinite(draft.wireMm) && draft.wireMm > 0)) {
    return 'Wire gauge must be a number > 0 (mm).';
  }
  if (draft.powerW !== undefined && !(Number.isFinite(draft.powerW) && draft.powerW > 0)) {
    return 'Power must be a number > 0 (W).';
  }
  if (draft.priceEur !== undefined && !(Number.isFinite(draft.priceEur) && draft.priceEur >= 0)) {
    return 'Price must be a number ≥ 0 (EUR).';
  }
  const clash = parts.some((p) => p.id === draft.id && p.id !== originalId);
  if (clash) return `SKU id "${draft.id}" already exists.`;
  return null;
}

/** Warn when this SKU would become the FIRST exact part of a brand+series
 *  that currently exists as a generated grid: one exact SKU shadows the
 *  whole grid, so the series suddenly offers only the entered value(s). */
export function gridShadowNote(
  parts: readonly CatalogPart[],
  draft: Pick<CatalogPart, 'id' | 'brand' | 'series'>,
): string | null {
  const key = `${draft.brand.toLowerCase()}|${draft.series.toLowerCase()}`;
  const hasOthers = parts.some(
    (p) => p.id !== draft.id && `${p.brand.toLowerCase()}|${p.series.toLowerCase()}` === key,
  );
  if (hasOthers) return null;
  const grid = gridSeriesFor(draft.brand, draft.series);
  if (!grid) return null;
  return (
    `First exact SKU for ${draft.brand} ${draft.series}: it SHADOWS the generated ` +
    `value grid — the series will offer only the SKUs you enter. Add the full ` +
    `value range or expect gaps in the snap/BOM.`
  );
}

// --- series management ---------------------------------------------------

/** Where a managed series row comes from. 'override' = a custom entry with a
 *  built-in id (the import semantics: same id replaces the built-in — remove
 *  it and the built-in returns). 'fromParts' = synthesized from exact SKUs;
 *  its data IS the SKU list, so the grid editor leaves it alone. */
/** 'skus' = the series exists only because exact SKUs name it — there is no
 *  series record to edit, so it is listed for switching on and off but not
 *  for editing (you change it through its SKUs). */
export type SeriesSource = 'builtin' | 'override' | 'custom' | 'skus';

export interface ManagedSeries {
  series: CatalogSeries;
  source: SeriesSource;
  /** Number of exact SKUs covering this brand+series — >0 means the grid is
   *  shadowed and edits to it won't be visible until those SKUs go. */
  shadowedBy: number;
}

const key = (brand: string, series: string): string =>
  `${brand.toLowerCase()}|${series.toLowerCase()}`;

/** The editable grid-series view: built-ins with custom overrides applied,
 *  plus truly custom series — each flagged with its source and whether exact
 *  SKUs shadow it. Part-derived series are NOT listed (edit their SKUs). */
export function managedSeries(
  custom: readonly CatalogSeries[],
  parts: readonly CatalogPart[],
): ManagedSeries[] {
  const byId = new Map(custom.map((s) => [s.id, s]));
  const shadow = new Map<string, number>();
  for (const p of parts) shadow.set(key(p.brand, p.series), (shadow.get(key(p.brand, p.series)) ?? 0) + 1);
  const out: ManagedSeries[] = [];
  for (const b of builtinSeries()) {
    const over = byId.get(b.id);
    const s = over ?? b;
    out.push({ series: s, source: over ? 'override' : 'builtin', shadowedBy: shadow.get(key(s.brand, s.series)) ?? 0 });
  }
  const builtinIds = new Set(builtinSeries().map((b) => b.id));
  for (const c of custom) {
    if (builtinIds.has(c.id)) continue; // already shown as override
    out.push({ series: c, source: 'custom', shadowedBy: shadow.get(key(c.brand, c.series)) ?? 0 });
  }
  /* Series that exist ONLY through their exact SKUs. They used to be left out
     entirely — you edit them through their SKUs, so there was nothing to show.
     But that also made them unreachable for switching off, and they are
     exactly the ones a designer wants to exclude: Sanders imported catalog
     carries 32 "Jantzen Electrolytic Bipolar" SKUs and no series record. They
     are listed now, marked so the edit buttons stay away. */
  const shown = new Set(out.map((r) => key(r.series.brand, r.series.series)));
  const derived = new Map<string, CatalogSeries>();
  for (const p of parts) {
    const k = key(p.brand, p.series);
    if (shown.has(k)) continue;
    const cur = derived.get(k);
    if (!cur) {
      derived.set(k, {
        id: `${p.brand}-${p.series}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        brand: p.brand,
        series: p.series,
        kind: p.kind,
        range: [p.value, p.value],
        ...(p.tier !== undefined ? { tier: p.tier } : {}),
      });
    } else {
      cur.range = [Math.min(cur.range[0], p.value), Math.max(cur.range[1], p.value)];
    }
  }
  for (const [k, s] of derived) {
    out.push({ series: s, source: 'skus', shadowedBy: shadow.get(k) ?? 0 });
  }
  return out;
}

/** Add or replace a series in the CUSTOM list. Editing a built-in goes
 *  through here too: the caller passes the built-in's id and the entry lands
 *  as an override. Pure. */
export function upsertSeries(
  custom: readonly CatalogSeries[],
  series: CatalogSeries,
  originalId?: string,
): CatalogSeries[] {
  const target = originalId ?? series.id;
  const idx = custom.findIndex((s) => s.id === target);
  if (idx < 0) return [...custom, series];
  const out = [...custom];
  out[idx] = series;
  return out;
}

/** Remove a series from the CUSTOM list — for an override this reverts to
 *  the built-in. Pure. */
export function removeSeries(custom: readonly CatalogSeries[], id: string): CatalogSeries[] {
  return custom.filter((s) => s.id !== id);
}

/** Validate a series draft against the file-reader rules (the manager must
 *  never save what the import would reject). `originalId` excludes the
 *  edited entry itself from the duplicate check. */
export function seriesGridError(
  draft: CatalogSeries,
  custom: readonly CatalogSeries[],
  originalId?: string,
): string | null {
  if (draft.id.trim() === '') return 'Series id is required.';
  if (draft.brand.trim() === '') return 'Brand is required.';
  if (draft.series.trim() === '') return 'Series name is required.';
  const [lo, hi] = draft.range;
  if (!(Number.isFinite(lo) && lo > 0) || !(Number.isFinite(hi) && hi > lo)) {
    return 'Range must be two numbers with 0 < min < max.';
  }
  if (draft.kind === 'L' && (!draft.gauges || draft.gauges.length === 0)) {
    return 'A coil series needs at least one wire gauge (mm).';
  }
  if (draft.gauges && draft.gauges.some((g) => !(Number.isFinite(g) && g > 0))) {
    return 'Wire gauges must be numbers > 0 (mm).';
  }
  if (draft.esr !== undefined && !(Number.isFinite(draft.esr) && draft.esr >= 0)) {
    return 'ESR must be a number ≥ 0 (Ω).';
  }
  if (draft.powerW !== undefined && !(Number.isFinite(draft.powerW) && draft.powerW > 0)) {
    return 'Power must be a number > 0 (W).';
  }
  if (draft.basePrice !== undefined && !(Number.isFinite(draft.basePrice) && draft.basePrice >= 0)) {
    return 'Base price must be a number ≥ 0 (EUR).';
  }
  if (draft.costFactor !== undefined && !(Number.isFinite(draft.costFactor) && draft.costFactor >= 0)) {
    return 'Cost factor must be a number ≥ 0.';
  }
  if (draft.dcrFactor !== undefined && !(Number.isFinite(draft.dcrFactor) && draft.dcrFactor > 0 && draft.dcrFactor <= 2)) {
    return 'DCR factor must be in (0, 2] — ~0.35 for iron cores, 1 = air core.';
  }
  const clash = custom.some((s) => s.id === draft.id && s.id !== originalId);
  if (clash) return `Series id "${draft.id}" already exists.`;
  // A NEW id colliding with a built-in would silently become an override —
  // that is a deliberate action (edit the built-in row), not a naming accident.
  if (originalId === undefined && builtinSeries().some((b) => b.id === draft.id)) {
    return `"${draft.id}" is a built-in series — edit that row to override it.`;
  }
  return null;
}

// --- display units (the file stores SI; humans read mH / µF / Ω) ---

export function unitFor(kind: CatalogKind): string {
  return kind === 'L' ? 'mH' : kind === 'C' ? 'µF' : 'Ω';
}

const SCALE: Record<CatalogKind, number> = { L: 1e3, C: 1e6, R: 1 };

/** SI value → display units (L: H→mH, C: F→µF, R: Ω). */
export function toDisplayValue(kind: CatalogKind, si: number): number {
  // Round away float-noise (10e-6 F ×1e6 = 9.999999…) without losing real digits.
  return Number((si * SCALE[kind]).toPrecision(12));
}

/** Display units → SI. */
export function fromDisplayValue(kind: CatalogKind, display: number): number {
  return display / SCALE[kind];
}

/** Compact human label: "1.5 mH" / "4.7 µF" / "0.68 Ω". */
export function formatSkuValue(kind: CatalogKind, si: number): string {
  const v = toDisplayValue(kind, si);
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(3)));
  return `${s} ${unitFor(kind)}`;
}
