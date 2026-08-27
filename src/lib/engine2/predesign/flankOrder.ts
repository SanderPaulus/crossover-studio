/**
 * A5d.3 — THE ORDER DERIVATION PER FLANK.
 *
 * The specification is blunt about this one: "De filterorde is geen
 * gebruikersgok maar een afgeleide." Until F4d nothing in the engine derived
 * it. `orderByPair` existed, and it is a SETTING — the designer's stated
 * alignment, read by the crossover window to pick its k·f_s factor. The
 * derivation the spec asks for had no implementation at all, which is why the
 * audit's §6.1 could say v2 "kan niet voorstellen": it had no order to propose.
 *
 * WHAT IS DERIVED HERE, and A5d.3 lists five rules:
 *
 *   (i)   TARGET SLOPE. The acoustic target counts, not the electrical order:
 *         required electrical order = (target slope − the driver's own natural
 *         slope) / 6 dB per octave, per flank, off the BARE measurement.
 *   (ii)  THE PROTECTION FLANK. The attenuation M-C asks for at the upper
 *         driver's resonance, divided by the octave distance from that
 *         resonance up to the handover.
 *   (iii) THE SUPPRESSION FLANK. The attenuation asked for at the lower
 *         driver's first significant breakup, over the octave distance from
 *         the handover up to it.
 *   (iv)  ORDER ASYMMETRY from the phase-slope mismatch (A5d.2). NOT DERIVED
 *         HERE, and the absence is reported rather than left as a silence:
 *         A5d.2 has no implementation, and inventing a mismatch to divide by
 *         90°/oct would be a number with nothing under it.
 *   (v)   THE COST SIDE per candidate order, through M-A. Not pre-design: it
 *         needs a network, and this layer runs before one exists. It is what
 *         the shortlist's dissipation column answers, one stage later.
 *
 * EVERY RULE IS ARMED BY A STATED LIMIT, AND ABSENT MEANS ABSENT (P4). A
 * project that has stated no M-C limit gets no protection demand — not a
 * default one. When NOTHING is armed the derivation ABSTAINS, and abstention
 * is not "order 1" and not "order 4": it is "the measurements do not narrow
 * this", and what follows from it is that every buildable order is a separate
 * candidate (A5e.1 — no weighted compromise between two orders, ever).
 *
 * THE RESULT IS PER FLANK AND THE CANDIDATE IS PER PAIR, and that gap is
 * reported rather than papered over. The alignment library the design step
 * enumerates is SYMMETRIC — one alignment per handover, both flanks — so a
 * derivation that wants a second-order low-pass under a fourth-order high-pass
 * cannot be expressed as a candidate. `pairOrders` takes the higher of the two
 * demands and states the asymmetry it had to drop.
 */

import {
  DB_PER_OCTAVE_PER_ORDER,
  NATURAL_SLOPE_FIT_OCTAVES,
  NATURAL_SLOPE_MIN_SAMPLES,
} from '../constants.ts';

/** Which flank of a handover a demand applies to. */
export type FlankSide = 'lower-lp' | 'upper-hp';

/** One rule's demand on the order of one flank. */
export interface OrderDemand {
  rule: 'target-slope' | 'protection' | 'suppression';
  side: FlankSide;
  /** The order the rule asks for before rounding — kept, because 2.02 and 3.9
   *  are different stories and both round to the same integer as 2 and 4. */
  exactOrder: number;
  /** The smallest whole order that satisfies it. */
  minOrder: number;
  /** The sentence shown beside the number. */
  source: string;
  /** Set when the demand inherits an uncalibrated input. */
  uncalibrated?: string;
}

export interface FlankOrderInput {
  pairLabel: string;
  lower: string;
  upper: string;
  /** The handover the demands are measured against, Hz. */
  crossingHz: number;

  /* ---- rule (ii): the protection flank ---- */
  /** Fundamental resonance of the UPPER driver, Hz. */
  upperFsHz?: number | null;
  /**
   * M-C's stated limit: how far below its passband the upper driver's drive
   * voltage must sit at its own resonance, in dB (negative). Absent = the
   * project stated no limit, so this rule is not armed.
   */
  maxDriveOnFsDb?: number | null;

  /* ---- rule (iii): the suppression flank ---- */
  /** First SIGNIFICANT breakup of the LOWER driver, with its height. */
  lowerBreakup?: { fHz: number; dB: number } | null;
  /**
   * How much electrical suppression the project asks for on that breakup, dB.
   * Absent = not armed. There is deliberately no default: the spec's own
   * severity weighting is uncalibrated (V6/V9), and a default here would be a
   * second uncalibrated number stacked on the first.
   */
  breakupSuppressionDb?: number | null;
  /** Carried through when the breakup came from an uncalibrated ceiling. */
  breakupUncalibrated?: string;

  /* ---- rule (i): the target slope ---- */
  /**
   * Acoustic target slope for each flank of this handover, dB/oct. Absent = not
   * armed for that flank.
   *
   * Two fields rather than one because the two flanks are two targets: A5d.3(i)
   * is a per-flank rule, and the designer's own controls have carried a slope
   * per flank since the three-way chain existed. One shared number would make
   * an asymmetric target unstatable, which is the very case rule (iv) is about.
   */
  lowerTargetSlopeDbPerOct?: number | null;
  upperTargetSlopeDbPerOct?: number | null;
  /** The lower driver's own measured slope ABOVE the handover, dB/oct. */
  lowerNaturalSlopeDbPerOct?: number | null;
  /** The upper driver's own measured slope BELOW the handover, dB/oct. */
  upperNaturalSlopeDbPerOct?: number | null;

  /* ---- what can actually be built ---- */
  /** Orders the alignment library offers, ascending. */
  availableOrders: readonly number[];
  /** The order the designer stated for this pair, when they stated one. */
  statedOrder?: number | null;
}

export interface FlankOrderResult {
  pairLabel: string;
  side: FlankSide;
  /** The driver whose flank this is. */
  driver: string;
  demands: OrderDemand[];
  /** The highest demand, or null when no rule was armed. */
  demandedOrder: number | null;
  binding: OrderDemand | null;
  notes: string[];
}

export interface PairOrderResult {
  pairLabel: string;
  flanks: [FlankOrderResult, FlankOrderResult];
  /**
   * The orders a candidate will be generated at, ascending. Never empty.
   *
   * One entry when the measurements (or the designer) narrow it to one; SEVERAL
   * when they do not, and several means several CANDIDATES — never an average
   * of two orders, which is the shape A5e.1 forbids.
   */
  orders: number[];
  /** How the set was arrived at, in one sentence per entry. */
  why: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ *
 * The natural slope
 * ------------------------------------------------------------------ */

/**
 * The slope of a measured response beside a frequency, dB per octave.
 *
 * A least-squares line through (log2 f, dB) over a stated half-width on ONE
 * side of `aroundHz` — the stop side, because that is the flank the filter has
 * to finish. Returns null rather than a number when the grid holds too few
 * samples there to call it a fit (V8e: an estimator that cannot abstain will
 * eventually publish nonsense).
 *
 * `side: 'above'` fits the stretch above `aroundHz` (a low-pass flank),
 * `'below'` the stretch under it (a high-pass flank).
 */
export function naturalSlopeDbPerOctave(
  freq: readonly number[],
  db: readonly number[],
  aroundHz: number,
  side: 'above' | 'below',
  halfWidthOctaves: number = NATURAL_SLOPE_FIT_OCTAVES,
): number | null {
  if (!(aroundHz > 0) || freq.length !== db.length) return null;
  const lo = side === 'above' ? aroundHz : aroundHz / 2 ** halfWidthOctaves;
  const hi = side === 'above' ? aroundHz * 2 ** halfWidthOctaves : aroundHz;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i];
    if (!(f >= lo && f <= hi)) continue;
    const v = db[i];
    if (!Number.isFinite(v)) continue;
    xs.push(Math.log2(f));
    ys.push(v);
  }
  if (xs.length < NATURAL_SLOPE_MIN_SAMPLES) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (!(sxx > 0)) return null;
  return sxy / sxx;
}

/* ------------------------------------------------------------------ *
 * The demands
 * ------------------------------------------------------------------ */

const octavesBetween = (a: number, b: number): number | null =>
  a > 0 && b > 0 ? Math.abs(Math.log2(a / b)) : null;

/** Smallest whole order that reaches `db` of extra slope over `octaves`. */
function orderFor(db: number, octaves: number): number {
  return db / (DB_PER_OCTAVE_PER_ORDER * octaves);
}

const ONE_DECIMAL = 1;

/** One flank's demands. */
function flankOrder(input: FlankOrderInput, side: FlankSide): FlankOrderResult {
  const demands: OrderDemand[] = [];
  const notes: string[] = [];
  const driver = side === 'lower-lp' ? input.lower : input.upper;

  /* ---- (ii) protection: only the UPPER driver's own high pass protects it -- */
  if (side === 'upper-hp') {
    const fs = input.upperFsHz ?? null;
    const limit = input.maxDriveOnFsDb ?? null;
    if (fs !== null && limit !== null) {
      const oct = octavesBetween(input.crossingHz, fs);
      if (oct !== null && oct > 0) {
        const needDb = Math.abs(limit);
        const exact = orderFor(needDb, oct);
        demands.push({
          rule: 'protection',
          side,
          exactOrder: exact,
          minOrder: Math.max(1, Math.ceil(exact - Number.EPSILON)),
          source:
            `${needDb.toFixed(ONE_DECIMAL)} dB of attenuation at ${input.upper}'s resonance ` +
            `(${fs.toFixed(0)} Hz), which is ${oct.toFixed(2)} octaves below the handover at ` +
            `${input.crossingHz.toFixed(0)} Hz (A5d.3(ii), M-C's stated limit)`,
        });
      } else {
        notes.push(
          `${input.upper}: the handover and the resonance are at the same frequency, so there is ` +
            'no octave distance to divide an attenuation by — no order satisfies M-C here, and ' +
            'the crossing itself is the thing that has to move.',
        );
      }
    } else if (fs === null) {
      notes.push(
        `${input.upper}: no fundamental resonance was resolved, so A5d.3(ii) is not armed — the ` +
          'protection demand needs the frequency it protects.',
      );
    } else {
      notes.push(
        'A5d.3(ii) is not armed: the project has stated no M-C limit, and absent is absent (P4). ' +
          'Nothing here invents one.',
      );
    }
  }

  /* ---- (iii) suppression: the LOWER driver's low pass does the work ------- */
  if (side === 'lower-lp') {
    const bu = input.lowerBreakup ?? null;
    const need = input.breakupSuppressionDb ?? null;
    if (bu && need !== null) {
      const oct = octavesBetween(bu.fHz, input.crossingHz);
      if (oct !== null && oct > 0) {
        const exact = orderFor(Math.abs(need), oct);
        demands.push({
          rule: 'suppression',
          side,
          exactOrder: exact,
          minOrder: Math.max(1, Math.ceil(exact - Number.EPSILON)),
          source:
            `${Math.abs(need).toFixed(ONE_DECIMAL)} dB of suppression on ${input.lower}'s first ` +
            `significant breakup (${bu.fHz.toFixed(0)} Hz, +${bu.dB.toFixed(1)} dB over trend), ` +
            `which is ${oct.toFixed(2)} octaves above the handover (A5d.3(iii))`,
          ...(input.breakupUncalibrated ? { uncalibrated: input.breakupUncalibrated } : {}),
        });
      }
    } else if (!bu) {
      notes.push(
        `${input.lower}: no significant breakup was found, so A5d.3(iii) is not armed. That is a ` +
          'statement about this measurement and this significance threshold, not about the cone.',
      );
    } else {
      notes.push(
        'A5d.3(iii) is not armed: the project has stated no suppression budget for the breakup. ' +
          'There is no default, on purpose — the severity weighting under the breakup ceiling is ' +
          'itself uncalibrated (V6/V9), and a default here would stack a second guess on it.',
      );
    }
  }

  /* ---- (i) target slope minus what the driver already does ---------------- */
  const target =
    (side === 'lower-lp'
      ? (input.lowerTargetSlopeDbPerOct ?? null)
      : (input.upperTargetSlopeDbPerOct ?? null));
  const natural =
    side === 'lower-lp'
      ? (input.lowerNaturalSlopeDbPerOct ?? null)
      : (input.upperNaturalSlopeDbPerOct ?? null);
  if (target !== null && natural !== null) {
    // A low-pass flank falls (negative slope) and a high-pass flank rises, so
    // both are compared in MAGNITUDE of roll-off away from the passband. A
    // driver that already rolls off in the direction the target wants needs
    // less electrical order, which is the whole point of the rule.
    const wanted = Math.abs(target);
    const has = side === 'lower-lp' ? Math.max(0, -natural) : Math.max(0, natural);
    const missing = wanted - has;
    const exact = missing / DB_PER_OCTAVE_PER_ORDER;
    demands.push({
      rule: 'target-slope',
      side,
      exactOrder: exact,
      minOrder: Math.max(1, Math.ceil(exact - Number.EPSILON)),
      source:
        `acoustic target ${wanted.toFixed(0)} dB/oct minus ${driver}'s own measured ` +
        `${has.toFixed(1)} dB/oct beside the handover (A5d.3(i) — the acoustic slope counts, not ` +
        'the electrical order)',
    });
  } else if (target !== null) {
    notes.push(
      `${driver}: an acoustic target slope is stated but the driver's own slope beside the ` +
        'handover could not be fitted, so A5d.3(i) is not armed. Subtracting nothing would read ' +
        'as "this driver is flat there", which is the one thing a rolled-off driver is not.',
    );
  }

  const binding = demands.length
    ? demands.reduce((a, b) => (b.minOrder > a.minOrder ? b : a))
    : null;
  return {
    pairLabel: input.pairLabel,
    side,
    driver,
    demands,
    demandedOrder: binding?.minOrder ?? null,
    binding,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * The pair
 * ------------------------------------------------------------------ */

/**
 * The orders one handover will be generated at.
 *
 * The set, not a choice from it. Three ways it can be settled, in this order:
 *
 *  1. A rule DEMANDS an order and the designer has stated one too. Both are in
 *     the set, deduplicated — they are two different questions ("what do the
 *     measurements require" and "what did you ask for") and satisficing has no
 *     machinery for preferring one, so both get built.
 *  2. Only one of the two exists. That one.
 *  3. Neither. Every buildable order, because nothing narrows it. This is the
 *     expensive branch and it is meant to be: an engine with no opinion should
 *     say so by offering the field, not by picking quietly.
 *
 * A demanded order that no available order reaches is clamped to the highest
 * available one, and the shortfall is stated — the alignment library is what it
 * is, and pretending an order 6 exists would deliver a design that cannot be
 * built.
 */
export function pairOrders(input: FlankOrderInput): PairOrderResult {
  const lowerLp = flankOrder(input, 'lower-lp');
  const upperHp = flankOrder(input, 'upper-hp');
  const available = [...input.availableOrders].sort((a, b) => a - b);
  const notes = [...lowerLp.notes, ...upperHp.notes];
  const why: string[] = [];

  if (available.length === 0) {
    return {
      pairLabel: input.pairLabel,
      flanks: [lowerLp, upperHp],
      orders: [],
      why: [],
      notes: [
        ...notes,
        'No buildable order was offered, so this handover produces no candidate at all. That is a ' +
          'statement about the alignment library, not about the drivers.',
      ],
    };
  }

  /* The two flanks may demand different orders, and the design step's alignment
   * library is symmetric — one alignment per handover. So the pair takes the
   * HIGHER demand (the lower one is satisfied by it; the reverse is not true)
   * and the asymmetry A5d.3(iv) would have wanted is reported instead of being
   * silently averaged into the middle. */
  const demands = [lowerLp.demandedOrder, upperHp.demandedOrder].filter(
    (v): v is number => v !== null,
  );
  const demanded = demands.length ? Math.max(...demands) : null;
  if (
    lowerLp.demandedOrder !== null &&
    upperHp.demandedOrder !== null &&
    lowerLp.demandedOrder !== upperHp.demandedOrder
  ) {
    notes.push(
      `The two flanks of ${input.pairLabel} demand different orders — ${input.lower}'s low pass ` +
        `${lowerLp.demandedOrder}, ${input.upper}'s high pass ${upperHp.demandedOrder}. The design ` +
        'step enumerates SYMMETRIC alignments (one per handover), so the candidate is built at the ' +
        'higher of the two and the asymmetry A5d.3(iv) asks for cannot be expressed. Recorded ' +
        'rather than resolved: it is a limitation of the alignment library, and averaging the two ' +
        'would satisfy neither flank.',
    );
  }

  const fit = (n: number): number => {
    const hit = available.find((a) => a >= n);
    if (hit !== undefined) return hit;
    notes.push(
      `Order ${n} is demanded but the alignment library stops at ${available[available.length - 1]}. ` +
        'The candidate is built at the highest available order and the shortfall stands — a design ' +
        'at an order nobody can build is not a proposal.',
    );
    return available[available.length - 1];
  };

  const set = new Set<number>();
  if (demanded !== null) {
    const n = fit(demanded);
    set.add(n);
    const b = (upperHp.demandedOrder ?? -1) >= (lowerLp.demandedOrder ?? -1) ? upperHp : lowerLp;
    why.push(`order ${n}: demanded by ${b.binding?.rule} — ${b.binding?.source}`);
  }
  const stated = input.statedOrder ?? null;
  if (stated !== null && stated > 0) {
    const n = fit(stated);
    if (!set.has(n)) {
      why.push(
        `order ${n}: the order the designer stated for this handover. Kept beside the demanded one ` +
          'rather than instead of it — "what the measurements require" and "what you asked for" ' +
          'are two questions, and there is no weighting here that could merge them.',
      );
    }
    set.add(n);
  }
  if (set.size === 0) {
    for (const a of available) set.add(a);
    why.push(
      `orders ${available.join(', ')}: nothing narrows this handover. No M-C limit, no breakup ` +
        'budget and no acoustic slope target reached the derivation, and the designer stated no ' +
        'order, so every buildable order is its own candidate. An engine with no opinion offers ' +
        'the field; it does not pick quietly (A5e.1).',
    );
  }

  notes.push(
    'A5d.3(iv) — order asymmetry from the phase-slope mismatch — is NOT derived: A5d.2 has no ' +
      'implementation, and a mismatch divided by 90°/oct that nobody measured is a number with ' +
      'nothing under it. A5d.3(v), the cost side per order, is not pre-design: it needs a network, ' +
      'and the dissipation column answers it one stage later.',
  );

  return {
    pairLabel: input.pairLabel,
    flanks: [lowerLp, upperHp],
    orders: [...set].sort((a, b) => a - b),
    why,
    notes,
  };
}
