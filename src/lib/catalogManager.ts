import type { CatalogKind, CatalogPart } from './catalog.ts';
import { gridSeriesFor } from './catalog.ts';

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
