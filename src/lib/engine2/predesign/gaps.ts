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
  /**
   * FALSE when no detector could establish a gate floor for the measurement
   * this level was averaged over (F3b, deliverable 4c).
   *
   * WHY THIS FIELD EXISTS AT ALL. The anchor is the QUIETEST way, and a way's
   * level is an average over a band. When the bottom of that band is not a
   * derived floor but simply where a sweep happened to start, the average
   * includes however much rolloff sits below the real gate limit — and that
   * drags the level DOWN. Drag one way down far enough and it becomes the
   * anchor: A5d.4(b)'s feasibility warning fires, the block announces that the
   * system's sensitivity is capped by the wrong way, and every chained budget
   * behind it is wrong too.
   *
   * That is not hypothetical — it happened twice. The first time (F3b) the
   * point was that NOTHING IN THE BLOCK SHOWED IT: the anchor, the gaps and
   * the budgets all looked like ordinary numbers, so the flag was made to
   * travel with the level and come out as a caveat on the block itself. The
   * second time (UI-1, on the 3-way demo bundle) the point was that a caveat
   * ABOVE a full table is still a full table — it warned, and it published an
   * anchor of `low` where the same measurements with their window header
   * intact anchor on `mid`. So the flag no longer annotates the block: it
   * BLOCKS it. See `anchorFloorBlock` below.
   *
   * Absent = true: a caller that does not know cannot be made to claim it does
   * not know, but a caller that DOES know must say so.
   */
  bandFloorKnown?: boolean;
  /** Which detector (or none) set that floor — shown with the caveat. */
  bandFloorProvenance?: string;
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
 * UI-1 — THE BLOCK: why there are no anchored gaps at all.
 *
 * A5d.4 rests on the LEVELS, a level is an energy average over a band, and the
 * bottom of that band has to be a DERIVED gate floor. When it is not — when it
 * is simply where a sweep happened to start — the average carries however much
 * rolloff sits below the real limit, and the level reads LOW. Read one way low
 * enough and it takes the anchor role away from the way that should have it,
 * and every chained budget behind it is wrong too.
 *
 * UNTIL UI-1 THIS WAS A CAVEAT BESIDE THE NUMBERS (`suspectBands`, F3b), and
 * the caveat is what the demo bundle proved insufficient. The 3-way demo's
 * woofer file is a legitimate derivation — the two measured woofers complex-
 * summed and resampled — and the derivation dropped the ARTA window header.
 * The panel printed the warning, and it also printed an anchor, a gap table
 * and three attenuation budgets, all computed on a level biased downwards. The
 * anchor was `low`; the same measurement set with the header intact anchors on
 * `mid`. A reader who trusts a table under a warning gets the wrong answer, and
 * every one of those numbers looked ordinary.
 *
 * So it BLOCKS. There is no anchor, there are no gaps, and there are no
 * budgets until the window is known — which is the F0 rule this codebase
 * already applies to a score on an empty network: a judgement resting on an
 * input nobody has is not a judgement, and printing one beside a warning is
 * publishing it anyway.
 *
 * IT BLOCKS ON *ANY* WAY, not only on the way that would be the anchor. The
 * anchor is "the quietest way", so you cannot know which way holds the role
 * until you believe every level; and a non-anchor way with an unknown floor
 * still overstates its own gap and its own budget. Both are wrong numbers in
 * the same table.
 *
 * THE WAY OUT IS AN INPUT, NOT A SETTING. Either the file states its window,
 * or the designer enters one in the A5a form (`manual-window` /
 * `manual-floor` provenance, F3b) — both produce a derived floor and both
 * unblock this. There is no "compute anyway" switch, deliberately.
 */
export interface AnchorFloorBlock {
  /** The ways whose level rests on a band with no derived gate floor. */
  drivers: string[];
  bands: {
    driver: string;
    bandHz: [number, number];
    /** What the validity pass said produced (or failed to produce) the floor. */
    provenance: string;
  }[];
  /** One paragraph a reader can act on. */
  describe: string;
}

/**
 * The block, or null when every level rests on a derived floor.
 *
 * Exported separately from `anchoredGaps` so a caller can render WHY there are
 * no gaps without having to reconstruct the reason from an absence. `null`
 * from `anchoredGaps` has two causes — fewer than two ways, and this — and a
 * reader is owed the difference.
 */
export function anchorFloorBlock(levels: readonly WayLevel[]): AnchorFloorBlock | null {
  const bad = levels.filter((l) => l.bandFloorKnown === false);
  if (bad.length === 0) return null;
  const bands = bad.map((l) => ({
    driver: l.driver,
    bandHz: l.bandHz,
    /* The provenance arrives as the tag the validity pass carries. `none` is
     * the case this whole block exists for, and printing the tag verbatim
     * ("(none)") reads like a missing value rather than like the finding. */
    provenance:
      l.bandFloorProvenance === undefined || l.bandFloorProvenance === 'none'
        ? 'no detector could establish one — the file carries no window header and none was entered'
        : l.bandFloorProvenance,
  }));
  return {
    drivers: bad.map((l) => l.driver),
    bands,
    describe:
      'The anchored sensitivity gaps are NOT computed, because a level they would rest on ' +
      'cannot be believed. ' +
      bands
        .map(
          (b) =>
            `${b.driver}'s level would be averaged over ${b.bandHz[0].toFixed(0)}–` +
            `${b.bandHz[1].toFixed(0)} Hz and the bottom of that band is not a derived gate ` +
            `floor (${b.provenance})`,
        )
        .join('; ') +
      '. Everything below the real gate limit is rolloff, so such a level reads LOWER than the ' +
      'way actually is — and the anchor is by definition the QUIETEST way, so one biased level ' +
      'moves the anchor, every gap behind it and every attenuation budget with it. A5d.4(a) ' +
      'also feeds the target-curve plateau, so nothing anchor-dependent is judged here until ' +
      "the window is known. Give the measurement its window — the file's own ARTA header, or " +
      'the reference time and right window in the measurement form — and this block computes.',
  };
}

/**
 * Compute the anchored gaps.
 *
 * `levels` must be ordered low to high (the ingest pass derives that ordering
 * from the responses themselves). The anchor is the QUIETEST way, because that
 * is the level the whole system has to come down to; the lowest way is the
 * anchor by default and only loses the role when something above it is quieter.
 *
 * `targetCurveShift` is where A5e.2 ENTERS, and since V45 it is no longer a
 * placeholder. A5d.4(a) says the anchor level is the lowest way's level AFTER
 * baffle step in the intended setup, not its bare passband sensitivity, and the
 * intended setup is a property of the target-curve object — which exists now
 * (`requirements/targetCurve.ts`).
 *
 * WHAT THE SHIFT IS, in one line: how far the target says this way's own band
 * may sit below the flat part, with the sign turned round. A way the voicing
 * puts 2.5 dB down is CREDITED those 2.5 dB here, so its gap to the anchor —
 * and therefore its attenuation budget — grows by exactly what the design
 * deliberately asked it to give up. Only DIFFERENCES between ways matter, so a
 * curve that shifts every way alike changes nothing, which is correct: a target
 * that tilts the whole loudspeaker is not a statement about level balance.
 *
 * Passing nothing still means the raw measured levels are compared, and the
 * note still says so — that is the FLAT reference and not an open question any
 * more. Nothing here computes a shift: the caller owns the target curve, and a
 * second opinion about a voicing is the last thing this module should hold.
 */
export function anchoredGaps(
  levels: readonly WayLevel[],
  targetCurveShift?: Readonly<Record<string, number>>,
): AnchoredGaps | null {
  if (levels.length < 2) return null;
  /* UI-1 — REFUSE rather than warn. See `anchorFloorBlock` for why the caveat
   * that used to stand here was not enough; the caller renders the block. */
  if (anchorFloorBlock(levels)) return null;
  const notes: string[] = [];
  const shift = targetCurveShift ?? {};
  if (!targetCurveShift) {
    notes.push(
      'Levels are compared AS MEASURED, against the flat reference. A5d.4(a) takes the anchor ' +
        'after baffle step in the intended setup, which is a property of the target-curve object ' +
        '(A5e.2); this design either states no curve or states the flat one, and flat is the ' +
        'neutral reference rather than a missing answer. A design with a voicing supplies a ' +
        'per-way shift and these levels move with it.',
    );
  }
  const adjusted = levels.map((l) => ({ ...l, db: l.db + (shift[l.driver] ?? 0) }));
  if (targetCurveShift) {
    /* THE BRANCH IS ON THE SPREAD AND NOT ON THE VALUES, and that is the whole
     * arithmetic of this block in one condition: every gap below is a
     * DIFFERENCE between two adjusted levels, so a shift that moves every way
     * by the same amount cancels exactly. Reporting "applied" on a uniform
     * shift would name numbers that changed nothing. */
    const values = levels.map((l) => shift[l.driver] ?? 0);
    const spread = Math.max(...values) - Math.min(...values);
    const applied = levels.map(
      (l) => `${l.driver} ${(shift[l.driver] ?? 0) > 0 ? '+' : ''}${(shift[l.driver] ?? 0).toFixed(2)} dB`,
    );
    notes.push(
      spread > 0
        ? 'Levels are compared AFTER the target curve (A5d.4a, A5e.2): ' +
            `${applied.join(', ')}. A way the voicing puts below the flat part is credited that ` +
            'much here, so its gap and its attenuation budget grow by what the design asked it ' +
            'to give up. Only differences between ways move an anchor.'
        : 'A target-curve shift was supplied and it moves every way by the same amount, so it ' +
          'cancels in every gap and the anchor and the budgets are what the raw measured levels ' +
          'give (A5d.4a). That is a result, not an omission: a target that tilts the whole ' +
          'loudspeaker makes no statement about level balance between its ways.',
    );
  }

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
