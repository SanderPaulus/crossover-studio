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

/** Both live since phase-4 trede 3 (3-way = LP / bandpass / HP ladders). */
export type WayCount = 2 | 3;

export interface TemplateSpec {
  order: FilterOrder;
  wayCount: WayCount;
  /** Driver models for the slots (LP first, HP last). */
  models: readonly string[];
}

/** Neutral reference the generic seed values are computed at. */
const R_REF = 8; // Ω
const FC_REF = 2500; // Hz — the 2-way crossover reference (unchanged)
/** 3-way neutral crossover references: low and high transition. */
const FC_LOW_3W = 600; // Hz
const FC_HIGH_3W = 3000; // Hz
/** Series-L scale (H) and shunt/series-C scale (F) at a corner frequency. */
const scaleA = (fc: number) => R_REF / (2 * Math.PI * fc);
const scaleB = (fc: number) => 1 / (2 * Math.PI * fc * R_REF);

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
 *  a role containing 'series' is drawn on the bus, otherwise it shunts).
 *  Counters are passed in so a bandpass branch (two cascaded ladders) keeps
 *  its part ids unique. */
function branchComponents(
  order: Exclude<FilterOrder, 0>,
  highPass: boolean,
  fc: number = FC_REF,
  counters: { c: number; l: number } = { c: 0, l: 0 },
): SynthesizedComponent[] {
  const kindTag = highPass ? 'HP' : 'LP';
  const A = scaleA(fc);
  const B = scaleB(fc);
  return ladder(order, highPass).map((e) => {
    const value = e.kind === 'L' ? e.coeff * A : e.coeff * B;
    const id = e.kind === 'L' ? `L${++counters.l}` : `C${++counters.c}`;
    const place = e.series ? 'series' : 'shunt';
    return { id, kind: e.kind, value, role: `${kindTag} ${place} ${e.kind}` };
  });
}

/** Bandpass branch for the 3-way middle driver: the high-pass ladder at the
 *  LOW transition cascaded into the low-pass ladder at the HIGH transition —
 *  source → HP section(s) → LP section(s) → driver, one series path. */
function bandpassComponents(order: Exclude<FilterOrder, 0>): SynthesizedComponent[] {
  const counters = { c: 0, l: 0 };
  return [
    ...branchComponents(order, true, FC_LOW_3W, counters),
    ...branchComponents(order, false, FC_HIGH_3W, counters),
  ];
}

/**
 * Build a network template. 2-way maps the first model to a low-pass branch
 * and the last to a high-pass branch (2.5 kHz reference); 3-way maps
 * first/middle/last to LP @600 Hz / bandpass 600–3000 Hz / HP @3 kHz.
 * Order 0 (or a model set too small for the way count) falls back to the
 * bare generator+drivers scaffold.
 */
export function filterTemplate(spec: TemplateSpec): VxpCrossover {
  const { order, wayCount, models } = spec;
  const slots = models.length > 0 ? models : wayCount === 3 ? ['woofer', 'mid', 'tweeter'] : ['mid', 'tweeter'];

  if (order === 0 || slots.length < wayCount) {
    // Blank scaffold: generator + drivers, unfiltered.
    return templateSchematic(slots);
  }

  const ordinal = order === 1 ? '1st' : order === 2 ? '2nd' : order === 3 ? '3rd' : '4th';
  if (wayCount === 3) {
    const xo = mergeSynthesizedSchematics([
      { components: branchComponents(order, false, FC_LOW_3W), model: slots[0] },
      { components: bandpassComponents(order), model: slots[1] },
      { components: branchComponents(order, true, FC_HIGH_3W), model: slots[slots.length - 1] },
    ]);
    return { ...xo, name: `3-way · ${ordinal} order` };
  }

  const lpModel = slots[0];
  const hpModel = slots[slots.length - 1];
  const xo = mergeSynthesizedSchematics([
    { components: branchComponents(order, false), model: lpModel },
    { components: branchComponents(order, true), model: hpModel },
  ]);
  return { ...xo, name: `2-way · ${ordinal} order` };
}

/** UI descriptor: the orders on offer, most-used first. */
export const TEMPLATE_ORDERS: readonly { order: FilterOrder; label: string }[] = [
  { order: 0, label: 'Blank (drivers only)' },
  { order: 1, label: '1st order · 6 dB/oct' },
  { order: 2, label: '2nd order · 12 dB/oct' },
  { order: 3, label: '3rd order · 18 dB/oct' },
  { order: 4, label: '4th order · 24 dB/oct' },
];

/** Both way counts build since phase-4 trede 3. */
export function supportsWayCount(wayCount: WayCount): boolean {
  return wayCount === 2 || wayCount === 3;
}
