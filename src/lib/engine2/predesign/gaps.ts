/**
 * A5d.4 — ANCHORED SENSITIVITY GAPS.
 *
 * The naive version of this analysis is pairwise ("the tweeter is 4 dB hotter
 * than the mid, so pad the tweeter 4 dB") and it is wrong in a way that only
 * shows up on a real three-way: attenuation is not equally expensive on every
 * way. Padding the lowest way costs source resistance, low-frequency lift and
 * dissipation — three of the metrics in A4 — while padding the top way costs
 * almost nothing. So the system's reference level is the way where
 * attenuation is dearest, and every other way's budget is measured against
 * THAT one and CHAINS through the ways between.
 *
 *     budget(top) = gap(top -> middle) + gap(middle -> anchor)
 *
 * The consequence that matters, spelled out because it is the interesting
 * case and casus 1 is exactly it: if a middle way sits BELOW the anchor, the
 * anchor moves to the middle way and the lowest way now has to be attenuated.
 * That is a driver-selection problem — the system's sensitivity is capped by
 * the quietest way, with damping consequences on the way where damping is
 * most expensive — and it is reported as a feasibility warning rather than
 * absorbed silently into a budget.
 *
 * N-WAY: nothing here counts. The chain is over however many ways the
 * measurement set holds, in the order the ingest pass derived.
 */

export interface WayLevel {
  driver: string;
  /** Energy-average level over this way's band, dB in the files' own scale. */
  db: number;
  /** The band it was measured over — shown, because the number depends on it. */
  bandHz: [number, number];
}

export interface AnchoredGaps {
  /** The way every budget is measured against. */
  anchor: string;
  /** Why that way is the anchor. */
  anchorReason: string;
  /** Per way (anchor excluded): its own gap and its chained budget. */
  ways: {
    driver: string;
    /** Level minus the anchor's level, dB. */
    gapToAnchorDb: number;
    /** Gap to the way immediately below it in the chain, dB. */
    gapToNeighbourDb: number | null;
    /** Chained attenuation budget, dB (sum of the gaps down to the anchor). */
    budgetDb: number;
  }[];
  /**
   * Set when the anchor is NOT the lowest way — the feasibility warning of
   * A5d.4(b). Null when the lowest way is the anchor, which is the ordinary
   * case.
   */
  anchorSwitchWarning: string | null;
  notes: string[];
}

/**
 * Compute the anchored gaps.
 *
 * `levels` must be ordered low to high (the ingest pass derives that ordering
 * from the responses themselves). The anchor is the QUIETEST way, because that
 * is the level the whole system has to come down to; the lowest way is the
 * anchor by default and only loses the role when something above it is quieter.
 *
 * `targetCurveShift` is where A5e.2 would enter: A5d.4(a) says the anchor
 * level is the lowest way's level AFTER baffle step in the intended setup, not
 * its bare passband sensitivity, and the intended setup is a property of the
 * target-curve object.
 *
 * TODO(A5e.2): the target-curve object is an open specification decision. Until
 * it is taken, the caller may pass a per-way shift explicitly; passing nothing
 * means the raw measured levels are compared and the note says so.
 */
export function anchoredGaps(
  levels: readonly WayLevel[],
  targetCurveShift?: Readonly<Record<string, number>>,
): AnchoredGaps | null {
  if (levels.length < 2) return null;
  const notes: string[] = [];
  const shift = targetCurveShift ?? {};
  if (!targetCurveShift) {
    notes.push(
      'Levels are compared as measured. A5d.4(a) wants the anchor taken AFTER baffle step in the ' +
        'intended setup, which is a property of the target-curve object - an open decision ' +
        '(A5e.2). Supply a per-way shift to apply it.',
    );
  }
  const adjusted = levels.map((l) => ({ ...l, db: l.db + (shift[l.driver] ?? 0) }));

  let anchorIx = 0;
  for (let i = 1; i < adjusted.length; i++) if (adjusted[i].db < adjusted[anchorIx].db) anchorIx = i;
  const anchor = adjusted[anchorIx];

  const ways = adjusted
    .filter((_, i) => i !== anchorIx)
    .map((w, _i) => {
      const index = adjusted.indexOf(w);
      // Chain: sum the gaps from this way down (or up) to the anchor, step by
      // step. Summing the steps rather than taking the direct difference is the
      // same number here and stays the same number when a way in between is
      // itself above the anchor - which is the case the chaining exists for.
      const step = index > anchorIx ? -1 : 1;
      let budget = 0;
      let neighbour: number | null = null;
      for (let k = index; k !== anchorIx; k += step) {
        const d = adjusted[k].db - adjusted[k + step].db;
        if (neighbour === null) neighbour = d;
        budget += d;
      }
      return {
        driver: w.driver,
        gapToAnchorDb: w.db - anchor.db,
        gapToNeighbourDb: neighbour,
        budgetDb: budget,
      };
    });

  const switched = anchorIx !== 0;
  return {
    anchor: anchor.driver,
    anchorReason: switched
      ? `${anchor.driver} is the quietest way, so it sets the system level - even though it is ` +
        'not the lowest way'
      : `${anchor.driver} is the lowest way and the quietest, so it is the anchor: attenuating it ` +
        'costs source resistance, low-frequency lift and dissipation',
    ways,
    anchorSwitchWarning: switched
      ? `The anchor is NOT the lowest way: ${anchor.driver} sits below ${adjusted[0].driver} by ` +
        `${(adjusted[0].db - anchor.db).toFixed(1)} dB. The system's sensitivity is capped by ` +
        `${anchor.driver}, and ${adjusted[0].driver} now has to be attenuated - which is exactly ` +
        'where attenuation is most expensive. This is a driver-selection problem, not something ' +
        'the filter can optimise away (A5d.4b).'
      : null,
    notes,
  };
}
