import type { VxpCrossover } from './parsers/vxp.ts';
import type { SynthesizedComponent } from './synthesis.ts';
import { mergeSynthesizedSchematics, templateSchematic } from './schematicEdit.ts';

/**
 * Ready-made network templates for the "just start tinkering" path — the
 * counterpart to Import and the optimizer. These carry GENERIC starting
 * values (not fitted to the measured Z): a plausible textbook ladder at a
 * neutral 8 Ω / 2.5 kHz reference so the designer has real parts to drag and
 * retune from, instead of a blank canvas.
 *
 * The topology (part count + series/shunt roles) is what matters; the values
 * are a Butterworth-style seed the user tunes. We reuse the synthesis→schematic
 * renderer so a template lands with the same tidy layout as a synthesised
 * branch: generator, one bus per branch, series parts marching right, shunts
 * dropping to ground.
 */

/** 0 = blank (drivers only), 1..4 = filter order (6/12/18/24 dB/oct). */
export type FilterOrder = 0 | 1 | 2 | 3 | 4;

/** 2-way is live; 3-way is scaffolded for the future N-way build. */
export type WayCount = 2 | 3;

export interface TemplateSpec {
  order: FilterOrder;
  wayCount: WayCount;
  /** Driver models for the slots (LP first, HP last). */
  models: readonly string[];
}

/** Neutral reference the generic seed values are computed at. */
const R_REF = 8; // Ω
const FC_REF = 2500; // Hz
const A = R_REF / (2 * Math.PI * FC_REF); // series-L scale, H
const B = 1 / (2 * Math.PI * FC_REF * R_REF); // shunt/series-C scale, F

/** One ladder element: capacitor or inductor, series or shunt, and its
 *  coefficient on the L-scale (A) or C-scale (B). */
interface Elem {
  kind: 'C' | 'L';
  series: boolean;
  coeff: number;
}

/**
 * Low-pass ladders (series L first, then alternating shunt C / series L).
 * Butterworth-style coefficients on A (L) / B (C); the high-pass ladder is the
 * frequency-inverted dual (swap L↔C, reciprocal coefficient).
 */
const LP_LADDER: Record<Exclude<FilterOrder, 0>, readonly { kind: 'C' | 'L'; coeff: number }[]> = {
  1: [{ kind: 'L', coeff: 1.0 }],
  2: [
    { kind: 'L', coeff: 1.414 },
    { kind: 'C', coeff: 0.707 },
  ],
  3: [
    { kind: 'L', coeff: 1.5 },
    { kind: 'C', coeff: 0.667 },
    { kind: 'L', coeff: 0.5 },
  ],
  4: [
    { kind: 'L', coeff: 1.531 },
    { kind: 'C', coeff: 0.653 },
    { kind: 'L', coeff: 1.082 },
    { kind: 'C', coeff: 0.271 },
  ],
};

/** Elements of a branch: series-first, alternating series/shunt. */
function ladder(order: Exclude<FilterOrder, 0>, highPass: boolean): Elem[] {
  return LP_LADDER[order].map((e, i) => {
    const series = i % 2 === 0; // first element series, then alternate
    if (!highPass) return { kind: e.kind, series, coeff: e.coeff };
    // High-pass = dual of the low-pass prototype: swap L↔C, reciprocal coeff.
    return { kind: e.kind === 'L' ? 'C' : 'L', series, coeff: 1 / e.coeff };
  });
}

/** Turn a ladder into synthesis components (roles drive the schematic layout:
 *  a role containing 'series' is drawn on the bus, otherwise it shunts). */
function branchComponents(order: Exclude<FilterOrder, 0>, highPass: boolean): SynthesizedComponent[] {
  const kindTag = highPass ? 'HP' : 'LP';
  let ci = 0;
  let li = 0;
  return ladder(order, highPass).map((e) => {
    const value = e.kind === 'L' ? e.coeff * A : e.coeff * B;
    const id = e.kind === 'L' ? `L${++li}` : `C${++ci}`;
    const place = e.series ? 'series' : 'shunt';
    return { id, kind: e.kind, value, role: `${kindTag} ${place} ${e.kind}` };
  });
}

/**
 * Build a network template. 2-way maps the first model to a low-pass branch
 * and the last to a high-pass branch. Order 0 (or an empty/unknown model set)
 * falls back to the bare generator+drivers scaffold. 3-way is not built yet —
 * callers should gate the UI on `supportsWayCount` and pass 2 for now.
 */
export function filterTemplate(spec: TemplateSpec): VxpCrossover {
  const { order, wayCount, models } = spec;
  const slots = models.length > 0 ? models : ['mid', 'tweeter'];

  if (order === 0 || wayCount !== 2 || slots.length < 2) {
    // Blank scaffold: generator + drivers, unfiltered.
    return templateSchematic(slots);
  }

  const lpModel = slots[0];
  const hpModel = slots[slots.length - 1];
  const xo = mergeSynthesizedSchematics([
    { components: branchComponents(order, false), model: lpModel },
    { components: branchComponents(order, true), model: hpModel },
  ]);
  return { ...xo, name: `2-way · ${order === 1 ? '1st' : order === 2 ? '2nd' : order === 3 ? '3rd' : '4th'} order` };
}

/** UI descriptor: the orders on offer, most-used first. */
export const TEMPLATE_ORDERS: readonly { order: FilterOrder; label: string }[] = [
  { order: 0, label: 'Blank (drivers only)' },
  { order: 1, label: '1st order · 6 dB/oct' },
  { order: 2, label: '2nd order · 12 dB/oct' },
  { order: 3, label: '3rd order · 18 dB/oct' },
  { order: 4, label: '4th order · 24 dB/oct' },
];

/** 3-way is intentionally not wired yet (future N-way build). */
export function supportsWayCount(wayCount: WayCount): boolean {
  return wayCount === 2;
}
