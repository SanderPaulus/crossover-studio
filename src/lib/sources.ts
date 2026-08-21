/**
 * SOURCES AND BRANCHES — the separation the multi-source refactor rests on.
 *
 * A SOURCE is one measured radiator: its own response and phase, its own angle
 * set, its own position, its own provenance. It has no filter and no electrical
 * identity of its own.
 *
 * A BRANCH is one filter path. It owns the filter, the source mode and the
 * electrical topology, and it names the sources it drives. There are still
 * exactly three of them (low / mid / high), which is what keeps the optimiser
 * out of this refactor: pair metrics, the chain, the cages and the rankings all
 * think in adjacent PAIRS of branches, and that does not change when a branch
 * grows a second source.
 *
 * Two sources sharing a filter is therefore a FILTER ASSIGNMENT, not a merge of
 * measurement data. Summation happens complex, per frequency, per observation
 * angle and distance, at evaluation time — never beforehand, because summing
 * beforehand bakes the pair's interference at one observation point into the
 * source data and the polar response can no longer be computed at all.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 *
 *  - No new coordinate system. `cabinet.ts` already puts the origin at the
 *    MEASUREMENT REFERENCE POINT with +y up, so the "z-offsets against the
 *    measurement axis" of a dataset (tweeter +64.6, mid −64.6, W1 −325.9,
 *    W2 −601.6) are exactly `DriverPlacement.yMm`. A second axis naming would
 *    be a second source of truth for one fact.
 *  - No impedance. That belongs to the DRIVER PART, not to the source: the
 *    network computes the parallel connection itself, and the port will be a
 *    source with no part at all.
 *
 * This module is data and invariants only. Nothing consumes it yet (step A1);
 * the adapter below presents today's three roles as three sources so the
 * consumers can move over one at a time, with the full suite as the proof that
 * nothing changed.
 */

import type { DriverPlacement } from './cabinet.ts';
import { combineN, type BranchAdjust, type CombineNResult, type GriddedResponse } from './dsp.ts';
import type { BranchRole } from './driverSlots.ts';
import type { SourceMeta, ValidityBand } from './sourceMeta.ts';

/**
 * How a branch's sources relate to each other.
 *
 * 'array'   — the historical model: one measurement stands for `count`
 *             identical drivers at `spacingMm`, and the excursion floor drops
 *             by √n. Everything that existed before this refactor is this.
 * 'discrete' — each driver is its own source with its own measurement and
 *             position. `count` MUST be 1 (see assertSourceModel): the array
 *             parameters and the discrete sources would otherwise both claim to
 *             describe the same physics, and a design is 3 dB off before anyone
 *             notices which one won.
 */
export type SourceMode = 'array' | 'discrete';

export interface AcousticSource<R = GriddedResponse> {
  /** Stable within a project; used to attribute reports and warnings. */
  id: string;
  /** What the designer calls it: "W1", "W2", "port". */
  label: string;
  /** The branch whose filter drives it. */
  branch: BranchRole;
  /** Its own on-axis measurement. */
  response: R;
  /** Its own angle set, if it has one. Absent or single-angle is a fact about
   *  the measurement, not a defect — see the omni model in step A6. */
  angles?: { hor: number; response: R }[];
  /** Position, in cabinet.ts' convention: origin at the measurement reference
   *  point, +x right, +y up, depth behind the baffle. */
  place: DriverPlacement;
  meta: SourceMeta;
  /**
   * The Driver part that drives this source, when there is one.
   *
   * Absent means acoustically driven only — a port or a passive radiator. That
   * is the case the model has to allow from the start even though nothing
   * produces it yet, because it is what makes "source" a different thing from
   * "driver".
   */
  partId?: string;
}

export interface Branch<R = GriddedResponse> {
  role: BranchRole;
  mode: SourceMode;
  /** Array mode only: how many identical drivers the one measurement stands
   *  for, and how far apart they sit. Meaningless in discrete mode, where the
   *  positions carry it. */
  count?: number;
  spacingMm?: number;
  sources: AcousticSource<R>[];
  /** Level / offset / polarity for this branch, relative to the MEASUREMENT
   *  AXIS — not to another branch and not to a source. Every far-field sweep in
   *  a dataset shares one reference time taken from that axis, so the relative
   *  phase between them is already consistent against that single point;
   *  picking a source as the reference would add an offset that has nothing to
   *  do with the measurement and that moves when someone reorders the list. */
  adjust?: BranchAdjust;
}

export class SourceModelError extends Error {}

/**
 * Every invariant that must hold before a branch list may be used, in ONE
 * place.
 *
 * Deliberately a single gate rather than a check per entry point: sources
 * arrive from import, from the wizard, from a drop and from a project file, and
 * one assert per path is four chances to forget one.
 */
export function assertSourceModel(branches: readonly Branch[]): void {
  const seen = new Set<string>();
  for (const b of branches) {
    if (b.sources.length === 0) {
      throw new SourceModelError(`branch "${b.role}" has no sources`);
    }
    for (const s of b.sources) {
      if (seen.has(s.id)) throw new SourceModelError(`duplicate source id "${s.id}"`);
      seen.add(s.id);
      if (s.branch !== b.role) {
        throw new SourceModelError(
          `source "${s.label}" says it belongs to "${s.branch}" but sits in branch "${b.role}"`,
        );
      }
    }
    if (b.mode === 'discrete') {
      // The two descriptions must never both be live. Hard error, no tolerance:
      // a quietly ignored count is exactly the kind of overlap that only shows
      // up as a design landing 3 dB off the measurement.
      if (b.count !== undefined && b.count !== 1) {
        throw new SourceModelError(
          `branch "${b.role}" is discrete but carries count = ${b.count}. In discrete mode each ` +
            `driver is its own source and the spacing comes from the positions; an array count ` +
            `would describe the same physics a second time. ` +
            /* ⚠ UPDATE THIS SENTENCE IN A4. Right now no UI can create a second
             * source, so reaching this line means the code built the branch
             * list wrongly — it is a programming error and the message says so.
             * From A4 a designer CAN add sources, and then the same condition
             * becomes an input error that needs an instruction ("switch this
             * branch to discrete, or remove the extra source") instead of this
             * note. The reminder lives here rather than in an issue because
             * this is the line that has to change. */
            `As of step A3 no interface can create a second source, so this is a programming ` +
            `error rather than something you did — the branch list was built wrongly.`,
        );
      }
    } else if (b.sources.length > 1) {
      throw new SourceModelError(
        `branch "${b.role}" is an array but has ${b.sources.length} sources — an array is ONE ` +
          `measurement standing for n drivers. Switch it to discrete.`,
      );
    }
  }
}

/**
 * A validity band must lie INSIDE the data it describes.
 *
 * The two are different statements and both are needed (step A3b): the file
 * range says "there is no data here", which is hard, and the validity band says
 * "there is data here but it cannot be trusted", which is soft. What must never
 * happen is a validity band claiming ground the file does not cover — that is
 * not a warning, it is a contradiction, and it is the invariant that keeps the
 * two from being confused for each other.
 */
export function assertValidityContained(
  meta: SourceMeta,
  fileRange: [number, number],
  label = 'source',
): void {
  const v: ValidityBand = meta.validity;
  const [lo, hi] = fileRange;
  if (v.fromHz !== null && v.fromHz < lo - 1e-6) {
    throw new SourceModelError(
      `${label}: validity starts at ${Math.round(v.fromHz)} Hz but the file starts at ` +
        `${Math.round(lo)} Hz — a band cannot be valid where there is no data`,
    );
  }
  if (v.toHz !== null && v.toHz > hi + 1e-6) {
    throw new SourceModelError(
      `${label}: validity ends at ${Math.round(v.toHz)} Hz but the file ends at ` +
        `${Math.round(hi)} Hz — a band cannot be valid where there is no data`,
    );
  }
}

/** Flat list of every source, in branch order — what a summation consumes. */
export function sourcesOf<R>(branches: readonly Branch<R>[]): AcousticSource<R>[] {
  return branches.flatMap((b) => b.sources);
}

/** The sources a given branch drives (electrically, one filter). */
export function sourcesInBranch<R>(
  branches: readonly Branch<R>[],
  role: BranchRole,
): AcousticSource<R>[] {
  return branches.find((b) => b.role === role)?.sources ?? [];
}

/**
 * Centre-to-centre spacing between the two furthest sources of a branch, mm —
 * derived from the POSITIONS, which in discrete mode is the only description
 * there is.
 *
 * Null when the branch has one source, or when a position is missing.
 */
export function branchSpacingMm(branch: Branch): number | null {
  const ps = branch.sources.map((s) => s.place);
  if (ps.length < 2) return null;
  let worst = 0;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const dx = ps[i].xMm - ps[j].xMm;
      const dy = ps[i].yMm - ps[j].yMm;
      const dz = (ps[i].depthMm ?? 0) - (ps[j].depthMm ?? 0);
      worst = Math.max(worst, Math.hypot(dx, dy, dz));
    }
  }
  return worst > 0 ? worst : null;
}

/* ------------------------------------------------------------------ *
 * Summation
 * ------------------------------------------------------------------ */

/**
 * Sum a branch list, complex, per frequency.
 *
 * Every source contributes on its own, with its BRANCH's adjust: two sources
 * sharing a filter share the filter, not the measurement. The order is branch
 * order then source order, which is what makes the three-role adapter produce
 * bit-identical output to the direct three-branch call — floating-point
 * addition is not associative, so the order is part of the contract, not an
 * implementation detail.
 *
 * The per-angle and per-distance geometry arrives in A5. Until then a source
 * contributes exactly what it measures, which is what the three-role path does
 * today.
 */
export function sumFromBranches(branches: readonly Branch[]): CombineNResult {
  const parts: { response: GriddedResponse; adjust?: BranchAdjust }[] = [];
  for (const b of branches) {
    for (const s of b.sources) {
      parts.push(b.adjust ? { response: s.response, adjust: b.adjust } : { response: s.response });
    }
  }
  if (parts.length === 0) throw new SourceModelError('nothing to sum: no sources');
  return combineN(parts);
}

/**
 * A response limited to the range its FILE actually covers: outside it the
 * branch is silent, not extrapolated.
 *
 * This is the HARD statement of the pair (see assertValidityContained): there
 * is no data here, so nothing may be summed. The soft one — data exists but is
 * not trustworthy — is the validity band, and it is a separate decision made by
 * each consumer (step A3b).
 */
export function bandLimit(
  response: GriddedResponse,
  fileRange: [number, number],
  silentDb: number,
): GriddedResponse {
  const [f0, f1] = fileRange;
  return {
    freq: response.freq,
    spl: response.spl.map((v, i) => (response.freq[i] < f0 || response.freq[i] > f1 ? silentDb : v)),
    phaseDeg: response.phaseDeg.map((v, i) =>
      response.freq[i] < f0 || response.freq[i] > f1 ? 0 : v,
    ),
  };
}

/**
 * The stored source mode of a branch.
 *
 * ABSENT IS THE MIGRATION. Everything written before the field existed
 * describes one measurement standing for n drivers, which is precisely
 * 'array' — so reading an old project needs no rewrite step, no version bump
 * and no interpretation. That also makes the transformation idempotent for
 * free: applying it to an already-migrated project reads back the same value.
 */
export function sourceModeOf(
  stored: { sourceMode?: string; [k: string]: unknown } | undefined,
): SourceMode {
  return stored?.sourceMode === 'discrete' ? 'discrete' : 'array';
}

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

export interface RoleInput<R = GriddedResponse> {
  response: R;
  angles?: { hor: number; response: R }[];
  place: DriverPlacement;
  meta: SourceMeta;
  count?: number;
  spacingMm?: number;
  adjust?: BranchAdjust;
  /** The model name the netlist knows this branch's driver by. */
  partId?: string;
  /** Absent = 'array', which is what every pre-A3 project means. */
  mode?: SourceMode;
}

/**
 * Today's three roles, presented as three single-source branches.
 *
 * This is the whole of step A1: the new shape exists and is provably equivalent
 * to the old one, so consumers can move over one at a time with the suite as
 * the proof that nothing changed. Every branch comes out in 'array' mode, which
 * is what the existing data means — `count` and `spacingMm` have always
 * described n identical drivers behind one measurement.
 */
export function branchesFromRoles<R>(
  roles: Partial<Record<BranchRole, RoleInput<R>>>,
): Branch<R>[] {
  const order: BranchRole[] = ['low', 'mid', 'high'];
  const out: Branch<R>[] = [];
  for (const role of order) {
    const r = roles[role];
    if (!r) continue;
    out.push({
      role,
      mode: r.mode ?? 'array',
      ...(r.count !== undefined ? { count: r.count } : {}),
      ...(r.spacingMm !== undefined ? { spacingMm: r.spacingMm } : {}),
      ...(r.adjust ? { adjust: r.adjust } : {}),
      sources: [
        {
          id: role,
          label: role,
          branch: role,
          response: r.response,
          ...(r.angles ? { angles: r.angles } : {}),
          place: r.place,
          meta: r.meta,
          ...(r.partId ? { partId: r.partId } : {}),
        },
      ],
    });
  }
  return out;
}
