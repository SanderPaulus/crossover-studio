/**
 * A4 M-F-interim — THE GEOMETRIC LOBING FRACTIONS, for ways with N sources.
 *
 * WHAT V20 SETTLED, AND WHY THIS FILE LOOKS THE WAY IT DOES.
 *
 * λ = d·f_x/c needs a d, and for a way built from more than one radiator there
 * is no single d. The nearest source, the amplitude-weighted centroid and the
 * farthest source are three different distances between the same two ways, and
 * on casus 1 they are 261, 399 and 537 mm at one handover — one of them lands
 * in the zone the old score called unfavourable and another lands in the zone
 * it called favourable. Picking one and calling it "the" spacing is an
 * assumption wearing a number's clothes, and it was the assumption the F1
 * implementation made silently.
 *
 * So this metric REPORTS ALL OF THEM and ranks none:
 *
 *  - the three BETWEEN-WAYS fractions above, and
 *  - the largest separation INSIDE a way, which is a different phenomenon:
 *    the lobe an array makes on its own, with or without a neighbouring way.
 *
 * TWO CONSEQUENCES ARE DELIBERATE AND MUST NOT BE UNDONE.
 *
 * 1. THE NON-MONOTONE ZONE SCORE IS GONE. It scored exactly the single λ that
 *    V20 establishes cannot be chosen, and a score is a judgement. The two
 *    reconciled rules of thumb it encoded are recorded in the casebook (V5,
 *    V20); they are not lost, they are just no longer applied to a number that
 *    cannot carry them.
 * 2. NOTHING MAY HANG OFF THESE FRACTIONS. No gate, no budget, no shortlist
 *    criterion, ever (V20a). The vertical synthesis (`verticalLobing`, M-F
 *    final) is the authority for lobing between ways, because it is the only
 *    one that uses every source, every acoustic centre and the candidate's own
 *    slopes instead of one distance standing in for all of them.
 *
 * N-AGNOSTIC THROUGHOUT: nothing here counts two woofers or three ways. A way
 * is a list of sources; one source is the ordinary case and not a special one.
 */

import { MM_PER_M, SPEED_OF_SOUND_M_S } from '../constants.ts';

/**
 * Estimator version for the lobing fractions.
 *
 * `1.0` was the unversioned F1 form: ONE λ per pair, taken from the larger of
 * the pair spacing and an array spacing inside either way, scored against a
 * non-monotone zone curve. `2.0` is V20's split into four named fractions with
 * no score. MAJOR: the shape of the result changed and so did the name of the
 * quantity — what F1 reported for the woofer→mid pair of casus 1 was the
 * WITHIN-WAY separation, and it was labelled as the pair's lobing.
 */
export const LOBING_LAMBDA_VERSION = 'lobing-lambda/2.0';

/** One radiating source inside a way, at its own vertical position. */
export interface LobingSource {
  /** Identifier inside the way — a manifest name, or a position index. */
  id: string;
  /** Vertical position of this source's acoustic centre, mm. */
  zMm: number;
  /**
   * Relative LINEAR amplitude this source contributes, from the DRIVE.
   * Parallel and identical = equal. Zero or negative = it does not radiate,
   * and it then takes no part in any of the four distances.
   */
  amplitude: number;
}

/** One way, as the fractions see it: a list of sources and their provenance. */
export interface LobingWay {
  way: string;
  sources: readonly LobingSource[];
  /** Where the positions came from, in words — it travels with the number. */
  positionSource: string;
  /** Where the amplitudes came from, in words. */
  amplitudeSource: string;
}

/** The four fractions, in the order the report and the panel show them. */
export const LOBING_FRACTION_KEYS = ['nearest', 'centroid', 'farthest', 'within-way'] as const;
export type LobingFractionKey = (typeof LOBING_FRACTION_KEYS)[number];

export interface LobingFraction {
  key: LobingFractionKey;
  /** Short label for the panel column. */
  label: string;
  /** The separation this fraction is about, mm. Null = it does not exist. */
  distanceMm: number | null;
  /** `distanceMm` in wavelengths at the crossing. Null without a crossing. */
  lambda: number | null;
  /** The two sources the distance is measured between, when it has two. */
  between: readonly [string, string] | null;
  /** What this distance IS, said in full — never abbreviated to its label. */
  describe: string;
}

export interface LobingLambdaResult {
  lower: string;
  upper: string;
  /** The candidate's own handover frequency; null = none could be derived. */
  crossingHz: number | null;
  /** The four fractions, always all four, always in `LOBING_FRACTION_KEYS`. */
  fractions: readonly LobingFraction[];
  /** Active source count per way id. */
  sourceCount: Record<string, number>;
  /** True when at least one of the two ways radiates from more than one place. */
  multiSource: boolean;
  /**
   * The sentence the panel must show when `multiSource` is true: with more
   * than one source in a way, no single distance summarises the handover and
   * the synthesis is the authority. Null when both ways are single sources,
   * where the three between-ways fractions coincide and nothing is being
   * summarised away.
   */
  authorityNote: string | null;
  notes: string[];
}

/** λ per mm at `crossingHz`; null when there is no crossing to divide by. */
function lambdaPerMm(crossingHz: number | null): number | null {
  if (crossingHz === null || !Number.isFinite(crossingHz) || crossingHz <= 0) return null;
  return crossingHz / SPEED_OF_SOUND_M_S / MM_PER_M;
}

/** Amplitude-weighted mean position of a way's sources, mm. */
function centroidMm(sources: readonly LobingSource[]): number | null {
  let sum = 0;
  let mass = 0;
  for (const s of sources) {
    sum += s.amplitude * s.zMm;
    mass += s.amplitude;
  }
  return mass > 0 ? sum / mass : null;
}

/** The widest separation between any two sources of one way. */
function widestInside(
  sources: readonly LobingSource[],
): { mm: number; between: readonly [string, string] } | null {
  let best: { mm: number; between: readonly [string, string] } | null = null;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const mm = Math.abs(sources[i].zMm - sources[j].zMm);
      if (!best || mm > best.mm) best = { mm, between: [sources[i].id, sources[j].id] };
    }
  }
  return best;
}

/** Extreme cross-way separation: `pick` decides nearest or farthest. */
function crossWay(
  lower: readonly LobingSource[],
  upper: readonly LobingSource[],
  pick: (candidate: number, incumbent: number) => boolean,
): { mm: number; between: readonly [string, string] } | null {
  let best: { mm: number; between: readonly [string, string] } | null = null;
  for (const a of lower) {
    for (const b of upper) {
      const mm = Math.abs(a.zMm - b.zMm);
      if (!best || pick(mm, best.mm)) best = { mm, between: [a.id, b.id] };
    }
  }
  return best;
}

/**
 * The four fractions for one handover.
 *
 * `pairDistanceMm` is the DEGENERATE INPUT and exists so that a project which
 * entered only a centre-to-centre distance — no vertical positions at all —
 * still gets a reported fraction instead of an empty row. When it is used, all
 * three between-ways fractions are that one distance and a note says they
 * could not be separated. That is not the same statement as "they are equal",
 * and the note is what keeps the two apart.
 */
export function lobingLambdas(
  lower: LobingWay,
  upper: LobingWay,
  crossingHz: number | null,
  opts: { pairDistanceMm?: { mm: number; source: string } } = {},
): LobingLambdaResult {
  const notes: string[] = [];
  const perMm = lambdaPerMm(crossingHz);
  if (perMm === null) {
    notes.push(
      'No handover frequency could be derived from this candidate, so the distances are reported ' +
        'and their wavelength fractions are not: λ is a property of the crossing, not of the cabinet.',
    );
  }

  const active = (w: LobingWay): LobingSource[] => w.sources.filter((s) => s.amplitude > 0);
  const lowActive = active(lower);
  const upActive = active(upper);
  for (const w of [lower, upper]) {
    const silent = w.sources.length - active(w).length;
    if (silent > 0) {
      notes.push(
        `${w.way}: ${silent} of ${w.sources.length} sources are entered with no drive and take no ` +
          'part in any of these distances.',
      );
    }
  }

  const sourceCount: Record<string, number> = {
    [lower.way]: lowActive.length,
    [upper.way]: upActive.length,
  };
  const multiSource = lowActive.length > 1 || upActive.length > 1;

  const positioned = lowActive.length > 0 && upActive.length > 0;
  if (!positioned) {
    for (const w of [lower, upper]) {
      if (active(w).length === 0) notes.push(`${w.way}: ${w.positionSource}`);
    }
  }
  if (multiSource) {
    notes.push(`${lower.way}: ${lower.positionSource}. ${lower.amplitudeSource}`);
    notes.push(`${upper.way}: ${upper.positionSource}. ${upper.amplitudeSource}`);
  }

  const fallback = !positioned ? (opts.pairDistanceMm ?? null) : null;
  if (fallback) {
    notes.push(
      `No vertical source positions were entered, so the three between-ways distances cannot be ` +
        `separated: all three are the entered centre-to-centre spacing (${fallback.source}).`,
    );
  }

  const near = positioned ? crossWay(lowActive, upActive, (c, i) => c < i) : null;
  const far = positioned ? crossWay(lowActive, upActive, (c, i) => c > i) : null;
  const cLow = positioned ? centroidMm(lowActive) : null;
  const cUp = positioned ? centroidMm(upActive) : null;
  const centroidDistance =
    cLow !== null && cUp !== null ? Math.abs(cLow - cUp) : (fallback?.mm ?? null);

  const insideLow = widestInside(lowActive);
  const insideUp = widestInside(upActive);
  const inside =
    insideLow && insideUp
      ? insideLow.mm >= insideUp.mm
        ? { way: lower.way, ...insideLow }
        : { way: upper.way, ...insideUp }
      : insideLow
        ? { way: lower.way, ...insideLow }
        : insideUp
          ? { way: upper.way, ...insideUp }
          : null;

  const mk = (
    key: LobingFractionKey,
    label: string,
    distanceMm: number | null,
    between: readonly [string, string] | null,
    describe: string,
  ): LobingFraction => ({
    key,
    label,
    distanceMm,
    lambda: distanceMm !== null && perMm !== null ? distanceMm * perMm : null,
    between,
    describe,
  });

  const both = `${lower.way} → ${upper.way}`;
  const fractions: LobingFraction[] = [
    mk(
      'nearest',
      'nearest source',
      near ? near.mm : (fallback?.mm ?? null),
      near?.between ?? null,
      `Smallest distance between any source of ${lower.way} and any source of ${upper.way}. ` +
        'The optimistic reading of the handover: it is the pair that stays coherent longest.',
    ),
    mk(
      'centroid',
      'amplitude-weighted centroid',
      centroidDistance,
      null,
      `Distance between the amplitude-weighted centres of ${both}. The reading that treats each ` +
        'way as one source at its acoustic centre of gravity — which is what the pair spacing ' +
        'means for a single-source way, and an approximation for any other.',
    ),
    mk(
      'farthest',
      'farthest source',
      far ? far.mm : (fallback?.mm ?? null),
      far?.between ?? null,
      `Largest distance between any source of ${lower.way} and any source of ${upper.way}. ` +
        'The pessimistic reading: it is the pair whose first vertical null lands lowest.',
    ),
    mk(
      'within-way',
      'widest inside one way',
      inside ? inside.mm : null,
      inside?.between ?? null,
      inside
        ? `Widest separation between two sources of ${inside.way} itself. This is lobing INSIDE a ` +
          'way: it exists whether or not there is a neighbouring way, and it is a different ' +
          'phenomenon from the three above rather than a fourth candidate for the same one.'
        : 'Neither way radiates from more than one place, so there is no separation inside a way.',
    ),
  ];

  return {
    lower: lower.way,
    upper: upper.way,
    crossingHz,
    fractions,
    sourceCount,
    multiSource,
    authorityNote: multiSource
      ? 'A way here radiates from more than one place, and no single distance summarises that: ' +
        'these fractions are for reading, not for judging. The vertical synthesis (M-F final) is ' +
        'the authority for lobing between the ways — it uses every source, every acoustic centre ' +
        "and this candidate's own slopes."
      : null,
    notes,
  };
}
