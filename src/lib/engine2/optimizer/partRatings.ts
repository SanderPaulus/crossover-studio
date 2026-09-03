/**
 * V50 — WHAT THE CATALOGUE RATES THE CHOSEN PARTS FOR, keyed by element id.
 *
 * The snap writes the SKU id(s) it landed on into `VxpPart.catalog` (`'SKU'`,
 * or `'SKU+SKU'` for a stack). This resolves those ids against the catalogue
 * the run holds and hands the buildability gates the one thing they cannot
 * read off a solved network: the power rating of a resistor and the
 * saturation current of a cored coil. A part without a `catalog` attribution
 * — every element of a run with the snap OFF — contributes nothing, and the
 * gate then judges on the STATED class or on nothing, and says which.
 *
 * STACKS. A bank of N identical parts shares the load: coils in series each
 * carry the whole current (the rating is the SMALLEST member's), caps are not
 * rated here, and resistors are never stacked by the snap. So for a coil stack
 * the rating is the minimum over the members; a stack with one unrated member
 * is unrated, because a chain is as strong as its weakest link.
 *
 * The catalogue is DATA and this file names no manufacturer (P6): whatever
 * `catalogParts()` holds is what gets read.
 */

import { catalogParts, type CatalogPart } from '../../catalog.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { PartRating, PartRatings } from '../metrics/buildability.ts';

/** Resolve the ratings of every attributed part. Pure over its `pool`. */
export function partRatingsOf(
  parts: readonly VxpPart[],
  pool: readonly CatalogPart[] = catalogParts(),
): PartRatings {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const out: Record<string, PartRating> = {};
  for (const p of parts) {
    if (!p.partId || !p.catalog) continue;
    const members = p.catalog.split('+').map((id) => byId.get(id) ?? null);
    if (members.some((m) => m === null)) continue;
    const skus = members as CatalogPart[];
    const source = `catalogue ${skus.map((m) => m.id).join('+')}`;
    if (p.type === 'Resistor') {
      const w = skus[0]?.powerW;
      if (w !== undefined && w > 0) out[p.partId] = { powerW: w, source };
    } else if (p.type === 'Inductor') {
      const amps = skus.map((m) => m.maxCurrentA);
      if (amps.every((a): a is number => a !== undefined && a > 0)) {
        out[p.partId] = { maxCurrentA: Math.min(...amps), source };
      }
    }
  }
  return out;
}
