/**
 * U-5 — THE CROSSINGS THE DESIGNER STATES, AND WHAT EACH OF THEM COSTS.
 *
 * `candidates.ts` derives a field and its rule 4 is absolute: "NOTHING LEAVES
 * THE WINDOW. Ever. […] a candidate outside the window is not something this
 * module declines to emit — it is something it cannot express." That rule is
 * untouched and this module does not weaken it. What it adds is a SECOND
 * AUTHOR. A window is what the MEASUREMENTS admit; a designer who crosses
 * outside one is not overruling a measurement, they are asking a question the
 * measurements answer badly — and the honest reply is the answer plus the
 * price, not a refusal.
 *
 * FIVE RULES, and each is a decision rather than an implementation detail.
 *
 *  1. A STATED POSITION IS A CANDIDATE. It gets the full tune, the full gate
 *     evaluation and the full requirement evaluation — the same treatment a
 *     generated position gets, from the same worker, on the same seed. Inside
 *     the window there is no difference at all beyond who wrote it down.
 *
 *  2. NOTHING IS SILENTLY REFUSED. A position outside the window still runs.
 *     What comes back with it is a VERDICT PER BREACHED LIMIT, in that limit's
 *     OWN UNIT: how far past in hertz, and — where the limit is a dB rule —
 *     what it demands against what the delivered network measures. "Outside
 *     the window" is the beginning of the answer, not the whole of it.
 *
 *  3. THE VERDICT IS MEASURED WHERE THE LIMIT WAS DERIVED. A breached breakup
 *     ceiling is answered by the suppression the delivered low pass puts on
 *     that same breakup, against what the same divisor asks; a breached drive
 *     floor by M-C on that same resonance. Both come from the ONE derivation
 *     the ceiling itself was built from (`bindingBreakup`, `XO_FS_FACTOR_BY_ORDER`),
 *     never a second one — a verdict on a breached limit that was measured
 *     against something other than the breached limit is worse than no verdict.
 *
 *  4. STATED REQUIREMENTS STAY REQUIREMENTS. A gate the designer armed and a
 *     limit a person or a manufacturer stated are not softened by being reached
 *     deliberately: the candidate is marked as MISSING them, by name. What
 *     changes is only that the network is still handed over to be looked at.
 *     A DERIVED limit — the uncalibrated breakup ramp above all — reports its
 *     verdict and refuses nothing, because a derivation with a known
 *     calibration gap is not a requirement (V9, U-4).
 *
 *  5. THE ORDER IS NOT STATED HERE. A stated position takes the alignment its
 *     handover's own derivation admits, under the same policy the generated
 *     field runs (`orderPolicyChoice`). Stating a frequency is not stating a
 *     filter, and two answers to "which order does this handover get" would put
 *     a stated crossing and a generated one at the same frequency into
 *     different designs (A3g).
 *
 * N-WAY BY CONSTRUCTION: one list of frequencies per adjacent PAIR, and the
 * product over the pairs. Nothing here counts to two or to three.
 */

import { DB_PER_OCTAVE_PER_ORDER, XO_FS_FACTOR_BY_ORDER } from '../constants.ts';
import {
  alignmentFor,
  orderPolicyChoice,
  type Alignment,
  type AlignmentPolicy,
  type CandidateCrossing,
  type CandidatePairInput,
  type GeneratedCandidate,
} from './candidates.ts';
import { bindingBreakup, crossoverWindow, type XoLimit, type XoWindowResult } from './xoWindow.ts';
import { formatEdge, roundEdge } from './xoRangeAdvice.ts';

/**
 * How close two frequencies have to be before they are the same one.
 *
 * A ROUNDING GUARD and not a tolerance: the window edges are rounded to a tenth
 * of a hertz for printing and a stated position typed as that same edge must
 * not read as a breach of it. Relative, because the same absolute slack is
 * meaningless at 50 Hz and at 20 kHz.
 */
const SAME_FREQUENCY_REL = 1e-9;

/**
 * How close a stated position has to sit to a generated one before the field
 * says they are the same design.
 *
 * A HUNDREDTH OF AN OCTAVE — about 0.7 % — which is well inside the cage the
 * two would share and far outside any rounding. It produces a NOTE and nothing
 * else: both candidates are built, because the stated one carries an
 * attribution the generated one has not got and because a budget may thin the
 * generated one away.
 */
const SAME_POSITION_OCTAVES = 0.01;

/** The suffix that keeps a stated label distinct from a generated one at the
 *  same frequency and order — the scan table keys on the label. */
const STATED_LABEL_SUFFIX = ' · stated';

/** The unit a verdict on one breached limit is read in. */
export type StatedBreachQuantity =
  /** The limit is a frequency and nothing else; the breach is hertz and octaves. */
  | 'hz'
  /** M-C: how far under its own passband the upper way sits at its resonance. */
  | 'drive-on-fs-db'
  /** How far under its own passband the lower way sits at the breakup. */
  | 'breakup-suppression-db';

/** One binding limit a stated position is past, with everything a verdict needs. */
export interface StatedLimitBreach {
  side: 'floor' | 'ceiling';
  rule: XoLimit['rule'];
  /** The limit's own frequency, Hz. */
  limitHz: number;
  /** How far past it, in octaves — always positive. */
  octaves: number;
  /**
   * True when a PERSON or a MANUFACTURER stated this limit, false when a
   * measurement derived it. Rule 4 of the header hangs on this bit.
   */
  stated: boolean;
  /** The limit's own sentence, verbatim from the window. */
  source: string;
  /** The limit's uncalibrated marking, when it carries one. */
  uncalibrated: string | null;
  quantity: StatedBreachQuantity;
  /**
   * What the limit demands, dB of attenuation under the passband — a POSITIVE
   * magnitude. Null when the quantity is `'hz'`: a frequency limit demands a
   * frequency and there is nothing to measure on a network.
   */
  demandDb: number | null;
  /**
   * The driver the reading is taken on — the KEY, in the vocabulary of whoever
   * is going to look it up. `scanRequest.ts` re-keys it from the report's
   * driver ids to the worker's model names before the mark crosses the border,
   * the same bridge the M-C figures and the coil families take.
   */
  subject: string | null;
  /**
   * The same driver's NAME, in the vocabulary the limit itself was written in,
   * and never re-keyed.
   *
   * Two fields for one driver because the two are read in two places and a
   * paragraph that uses both vocabularies is a paragraph that reads as if it
   * were about two drivers — measured in the running app before it was written
   * down: "what that limit stands for is LOW to sit 31.2 dB under its passband
   * … MEASURED: MID sits −41.5 dB", one sentence apart, about one driver.
   */
  subjectLabel: string | null;
  /** The frequency the reading is taken at; null for an `'hz'` limit. */
  atHz: number | null;
  /** The whole of the above in one sentence, for a reader. */
  sentence: string;
}

/** One handover of a stated candidate. */
export interface StatedCrossingEntry {
  pairLabel: string;
  hz: number;
  /** True when every binding limit of this pair's window admits it. */
  insideWindow: boolean;
  /** The window at this candidate's order, for the sentence. */
  windowHz: [number | null, number | null];
  breaches: StatedLimitBreach[];
}

/** U-5 — what a candidate carries when the DESIGNER wrote its handovers down. */
export interface StatedCrossingMark {
  /** When they stated it, in the designer's own project stamp. */
  statedOn: string;
  /** True when ANY handover of this candidate is past a binding limit. */
  outsideWindow: boolean;
  /** One per handover, in the candidate's own crossing order. */
  perCrossing: StatedCrossingEntry[];
  /** The one-line attribution a shortlist row shows. */
  provenance: string;
}

/** A breach, once the delivered network has been measured against it. */
export interface StatedBreachVerdict extends StatedLimitBreach {
  /**
   * What the delivered network measures in this limit's own unit — the SIGNED
   * passband-relative level, so a way sitting 24 dB under its passband reads
   * −24. Null when the quantity is `'hz'` (nothing to measure) or when the
   * network could not be read there; never 0, which would say "measured, and
   * it is at passband level" (F0).
   */
  measuredDb: number | null;
  /**
   * The frequency the reading was actually TAKEN at — the nearest point of the
   * analysis grid to `atHz`, which is where the network was solved.
   *
   * Reported beside `atHz` rather than instead of it, and the two are different
   * facts: `atHz` is where the LIMIT lives (a breakup, a resonance) and this is
   * where the MEASUREMENT could be made. On a 1600-point log sweep they differ
   * by up to a fifth of a percent, which is nothing — and a reader who cannot
   * see the difference cannot tell a fine grid from a coarse one, which is
   * exactly the kind of thing this project measures rather than assumes.
   */
  readAtHz: number | null;
  /**
   * Does the delivered network none the less deliver what the breached limit
   * asked for? Null when nothing could be measured.
   *
   * IT IS OFTEN TRUE, AND THAT IS THE POINT OF MEASURING. Every dB limit here
   * is derived on the BARE LADDER with the passband at the input — the
   * strictest honest reading, which assumes no pad, no shelf and no trap (see
   * `xoWindow.ts`). A real network has more tools, so a position the window
   * forbids can deliver what the window was protecting. The window is not
   * wrong; it is a pre-design bound, and this is the measurement it could not
   * make.
   */
  meets: boolean | null;
  /** The verdict in one sentence, for a reader. */
  verdict: string;
}

/** The stated mark plus the verdicts, as the worker hands it back. */
export interface StatedCrossingReport {
  statedOn: string;
  outsideWindow: boolean;
  perCrossing: {
    pairLabel: string;
    hz: number;
    insideWindow: boolean;
    breaches: StatedBreachVerdict[];
  }[];
  /**
   * What this candidate MISSES that somebody stated, by name — a stated window
   * limit it is past and does not deliver, or an armed gate it fails. Empty
   * means it meets every stated requirement, whatever it is outside of.
   */
  missedStated: string[];
}

/* ------------------------------------------------------------------ *
 * Reading the field
 * ------------------------------------------------------------------ */

/** What one parse produced, and everything it could not use. */
export interface ParsedStatedCrossings {
  /** One list per adjacent pair, in handover order. Empty = nothing stated. */
  perAxisHz: number[][];
  /** Lines and tokens that were not usable, each with the reason. */
  problems: string[];
  /** True when every axis carries at least one usable frequency. */
  complete: boolean;
}

/**
 * The designer's own text, read into one list of frequencies per handover.
 *
 * ONE LINE PER HANDOVER, low to high, and a semicolon does what a newline does
 * so the field survives being typed on one line. Inside a line, anything that
 * is not part of a number separates numbers.
 *
 * A PARTIAL SET IS NOT A SET. A crossover candidate is a COMPLETE assignment
 * of every handover, so a three-way with values on one axis only produces
 * nothing and says which axis is empty. The alternative — crossing the stated
 * axis with the generated positions of the other — multiplies a deliberate
 * statement by an automatic one and delivers neither.
 */
export function parseStatedCrossings(
  raw: string | null | undefined,
  pairLabels: readonly string[],
): ParsedStatedCrossings {
  const problems: string[] = [];
  const text = (raw ?? '').trim();
  if (text === '' || pairLabels.length === 0) {
    return { perAxisHz: pairLabels.map(() => []), problems, complete: false };
  }
  const lines = text
    .split(/[\n;]/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (lines.length > pairLabels.length) {
    problems.push(
      `${lines.length} lines were given for ${pairLabels.length} handover(s) ` +
        `(${pairLabels.join(', ')}); the extra line(s) are ignored. One line per handover, low to ` +
        'high, separated by a newline or a semicolon.',
    );
  }
  const perAxisHz = pairLabels.map((label, i) => {
    const line = lines[i];
    if (line === undefined) return [];
    const out: number[] = [];
    /* SPLIT ON SEPARATORS AND VALIDATE THE WHOLE TOKEN, never strip characters
     * out of one. An earlier version pulled the digits out of whatever was
     * typed, which turned “-5” into 5 and “2200Hz” into 2200: the right kind of
     * number, invented out of something the designer did not write (A3h). A
     * token that is not a positive frequency is REPORTED and used for
     * nothing. */
    for (const tok of line.split(/[\s,]+/)) {
      if (tok === '') continue;
      const v = Number(tok);
      if (!Number.isFinite(v) || v <= 0) {
        problems.push(`${label}: “${tok}” is not a positive frequency and was ignored.`);
        continue;
      }
      out.push(roundEdge(v));
    }
    return [...new Set(out)].sort((a, b) => a - b);
  });
  pairLabels.forEach((label, i) => {
    if (perAxisHz[i].length === 0) {
      problems.push(
        `${label}: no crossing was stated for this handover, so no stated candidate can be built. ` +
          'A candidate is a complete set of handovers — state one frequency per handover, on its ' +
          'own line, low to high.',
      );
    }
  });
  return { perAxisHz, problems, complete: perAxisHz.every((a) => a.length > 0) };
}

/* ------------------------------------------------------------------ *
 * U-5b — the RANGE form, which is sugar for the list above
 * ------------------------------------------------------------------ */

/**
 * The crossover-point form as the designer fills it in: a centre, a half-width
 * and how many positions to lay across the band.
 *
 * `null` on either frequency means the field was left empty or holds something
 * that is not a frequency. An empty field is not a zero (F0) and a zero margin
 * is a real statement ("exactly there"), so the two cannot share a value.
 */
export interface StatedRangeInput {
  centreHz: number | null;
  marginHz: number | null;
  /** How many positions the designer asked for across the band. */
  steps: number;
}

export interface ExpandedStatedRange {
  /** The positions, rounded and ascending. Empty = the range stated nothing. */
  hz: number[];
  /** What the expansion did, for a reader — never a silent difference. */
  notes: string[];
  /** What it could not use, each with the reason. */
  problems: string[];
}

/**
 * THE RANGE IS SUGAR FOR THE LIST, AND THAT IS THE WHOLE DESIGN.
 *
 * `centre ± margin in N steps` says nothing the list form cannot say; it says
 * it in fewer keystrokes. So it is expanded here into N frequencies and handed
 * to exactly the same path — past the window, past the generator's spacing
 * rules, attributed to the designer — and everything downstream sees N stated
 * positions and cannot tell which form typed them.
 *
 * WHY THE POSITIONS ARE SPACED IN HERTZ AND NOT IN OCTAVES. Every other
 * position in this engine is laid out in octaves, because a window is a ratio
 * and a spacing that is not is a spacing that means two different things at
 * either end. This one is not a window. The designer wrote "2300 ± 100 Hz in
 * 9 steps" and the only reading of that sentence in which the two edges are
 * the two edges is the linear one; laying it out logarithmically would return
 * positions nobody asked for, which is the whole defect being repaired.
 *
 * WHAT IS NOT DONE TO THE COUNT. `crossoverVariants` on the v1 route forces
 * the step count odd so the pin centre is always among the slices, because
 * there each candidate owns a SLICE of the band and a slice needs a centre.
 * Here each position is a crossing in its own right and N means N: asking for
 * nine and running ten would be the same class of defect as asking for nine
 * and running three. When N is even the stated centre is therefore not among
 * the positions, and that is SAID rather than corrected.
 */
export function expandStatedRange(r: StatedRangeInput, pairLabel: string): ExpandedStatedRange {
  const notes: string[] = [];
  const problems: string[] = [];
  const centre = r.centreHz;
  if (centre === null || !Number.isFinite(centre) || centre <= 0) {
    problems.push(
      `${pairLabel}: the crossover point is on, but its centre frequency is empty or is not a ` +
        'positive frequency, so no position can be laid out from it. Nothing is assumed in its ' +
        'place — a frequency from another project is not a statement about this one.',
    );
    return { hz: [], notes, problems };
  }
  if (r.marginHz !== null && (!Number.isFinite(r.marginHz) || r.marginHz < 0)) {
    problems.push(
      `${pairLabel}: the crossover point's margin is not a width (${String(r.marginHz)}), so the ` +
        'band it names cannot be read and no position is laid out from it.',
    );
    return { hz: [], notes, problems };
  }
  const margin = r.marginHz ?? 0;
  if (r.marginHz === null) {
    notes.push(
      `${pairLabel}: the crossover point states no margin, so it is read as exactly ` +
        `${formatEdge(centre)} Hz — one position, not a band. The search room a pin leaves itself ` +
        'is a different thing and is not borrowed here: a stated position is a position.',
    );
  }
  const asked = Math.round(r.steps);
  if (!Number.isFinite(asked) || asked < 1) {
    problems.push(
      `${pairLabel}: the crossover point asks for ${String(r.steps)} positions, which is not a ` +
        'count, so nothing is laid out from it.',
    );
    return { hz: [], notes, problems };
  }
  const lo = Math.max(0, centre - margin);
  const hi = centre + margin;
  const raw: number[] = [];
  if (asked === 1 || !(hi > lo)) {
    raw.push(centre);
    if (asked > 1) {
      notes.push(
        `${pairLabel}: ${asked} positions were asked for across ${formatEdge(centre)} ± ` +
          `${formatEdge(margin)} Hz, but that band is a single point, so it is ONE position. ` +
          'Widen the margin to get more.',
      );
    }
  } else {
    const spacing = (hi - lo) / (asked - 1);
    for (let i = 0; i < asked; i++) raw.push(lo + spacing * i);
    if (asked % 2 === 0) {
      notes.push(
        `${pairLabel}: ${asked} is an even count, so the stated centre ${formatEdge(centre)} Hz is ` +
          'not itself among the positions — they straddle it. An odd count puts it in the middle.',
      );
    }
  }
  const hz = [...new Set(raw.map(roundEdge))].sort((a, b) => a - b);
  if (hz.length < raw.length) {
    notes.push(
      `${pairLabel}: ${raw.length - hz.length} of the ${raw.length} positions fell on a frequency ` +
        'another one already holds and are one position, not several. That is arithmetic and not ' +
        'a thinning: two identical frequencies ARE one crossing.',
    );
  }
  if (hz.length > 0) {
    notes.push(
      `${pairLabel}: the crossover point ${formatEdge(centre)} ± ${formatEdge(margin)} Hz in ` +
        `${asked} step(s) was expanded into ${hz.length} STATED position(s) — ` +
        `${hz.map(formatEdge).join(', ')} Hz. They take the same path as the ones typed into the ` +
        'list: each is a candidate of its own, none is measured against the window before it runs, ' +
        'and none is thinned by the chain budget. That is one chain each.',
    );
  }
  return { hz, notes, problems };
}

/** One parse, the ranges beside it, and everything either of them said. */
export interface MergedStatedCrossings extends ParsedStatedCrossings {
  /** What the expansion and the merge did — additions to the run notes. */
  notes: string[];
}

/**
 * THE TWO FORMS ARE ONE SET, PER HANDOVER.
 *
 * A designer who typed a list AND pinned a crossover point stated both, and
 * dropping either because the other exists would be the silence this session
 * exists to remove. So the axis is the UNION, deduplicated and ascending, and
 * the note says how many came from where. A frequency both forms name is one
 * position, for the same reason two identical frequencies in one list are.
 *
 * `problems` carries the list parser's own complaints through unchanged: the
 * list form's behaviour is not touched by any of this, which is what keeps a
 * project that never pinned anything byte-identical to what it was (P2).
 */
export function mergeStatedCrossings(args: {
  parsed: ParsedStatedCrossings;
  /** One per adjacent pair, index-aligned with `pairLabels`; null = no range. */
  ranges: readonly (StatedRangeInput | null)[];
  pairLabels: readonly string[];
}): MergedStatedCrossings {
  const notes: string[] = [];
  const problems = [...args.parsed.problems];
  /* NOTHING PINNED IS NOTHING ADDED, and it is answered before anything else
   * so that the list form takes literally the path it took before U-5b. */
  if (!args.ranges.some((r) => r !== null)) {
    return { ...args.parsed, notes };
  }
  const perAxisHz = args.pairLabels.map((label, i) => {
    const list = args.parsed.perAxisHz[i] ?? [];
    const range = args.ranges[i] ?? null;
    if (range === null) {
      if (list.length === 0) {
        problems.push(
          `${label}: the crossover point form has no field for this handover, so it states nothing ` +
            'here. A candidate is a complete set of handovers — type a frequency for it in the ' +
            'list field, on its own line.',
        );
      }
      return [...list];
    }
    const ex = expandStatedRange(range, label);
    notes.push(...ex.notes);
    problems.push(...ex.problems);
    const both = list.filter((f) => ex.hz.includes(f)).length;
    const union = [...new Set([...list, ...ex.hz])].sort((a, b) => a - b);
    if (list.length > 0 && ex.hz.length > 0) {
      notes.push(
        `${label}: ${union.length} stated position(s) in all — ${list.length} typed into the list, ` +
          `${ex.hz.length} from the crossover point` +
          (both > 0 ? `, ${both} named by both and counted once` : '') +
          '. Both are yours, so neither replaces the other.',
      );
    }
    return union;
  });
  /* The list parser's "this handover is empty" complaint is about the LIST,
   * and a handover the range form filled is not empty. Drop exactly those and
   * nothing else, so every other thing it could not use still arrives. */
  const filled = new Set(
    args.pairLabels.filter((_, i) => perAxisHz[i].length > 0 && (args.parsed.perAxisHz[i] ?? []).length === 0),
  );
  const kept = problems.filter((p) => ![...filled].some((l) => p.startsWith(`${l}: no crossing was stated`)));
  return {
    perAxisHz,
    problems: kept,
    notes,
    complete: perAxisHz.every((a) => a.length > 0),
  };
}

/**
 * The stated positions in one sentence, for the notice that runs before the
 * scan starts.
 *
 * It exists because the notice is the LAST place a designer can still change
 * their mind, and until U-5b the only thing it said about stated crossings was
 * how many of them the window forbids. A designer who asked for nine positions
 * and is about to spend nine chain runs on them should read the nine
 * frequencies, on the screen that asks whether to start.
 *
 * Null when nothing is stated, so the notice keeps exactly the shape it had.
 */
export function describeStatedPositions(
  pairLabels: readonly string[],
  perAxisHz: readonly (readonly number[])[] | null | undefined,
): string | null {
  if (!perAxisHz || perAxisHz.length === 0) return null;
  const axes = pairLabels
    .map((label, i) => ({ label, hz: perAxisHz[i] ?? [] }))
    .filter((a) => a.hz.length > 0);
  if (axes.length === 0) return null;
  const total = axes.reduce((n, a) => n * a.hz.length, 1);
  const per = axes
    .map((a) => `${a.label}: ${a.hz.map(formatEdge).join(', ')} Hz`)
    .join(' · ');
  return (
    `You stated ${axes.map((a) => a.hz.length).join(' × ')} crossing(s) — ${per}. ` +
    `They become ${total} candidate(s) beside the derived field, one full chain run each: every ` +
    'one of them is tuned and judged, none is dropped for being outside a window and none is ' +
    'thinned by the chain budget.'
  );
}

/* ------------------------------------------------------------------ *
 * What one breached limit asks for
 * ------------------------------------------------------------------ */

/** Rules a PERSON or a MANUFACTURER stated, as against ones a measurement derived. */
const STATED_RULES: readonly XoLimit['rule'][] = ['stated', 'stated-min', 'stated-max', 'drive-stated'];

/**
 * What one limit demands, in the unit it was derived in.
 *
 * Every dB answer here is the SAME inversion the limit itself was built from,
 * read forward instead of backward: `xoWindow.ts` turns an attenuation into a
 * frequency, and this turns that frequency back into the attenuation it stood
 * for. Anything that cannot be turned back stays `'hz'` — a directivity point,
 * a measurement-validity floor and a transcribed recommendation are
 * frequencies and are not attenuations, and inventing a dB figure for them
 * would be exactly the A3h trap: the right kind of number about the wrong
 * thing.
 */
function demandOf(
  limit: XoLimit,
  pair: CandidatePairInput,
  order: number,
): {
  quantity: StatedBreachQuantity;
  demandDb: number | null;
  subject: string | null;
  subjectLabel: string | null;
  atHz: number | null;
} {
  const wi = pair.windowInput;
  const none = {
    quantity: 'hz' as const,
    demandDb: null,
    subject: null,
    subjectLabel: null,
    atHz: null,
  };
  const fs = wi.upperFsHz;
  const onFs = (db: number | null | undefined) =>
    fs !== null && fs > 0 && db !== null && db !== undefined && Number.isFinite(db)
      ? {
          quantity: 'drive-on-fs-db' as const,
          demandDb: Math.abs(db),
          subject: wi.upper,
          subjectLabel: wi.upper,
          atHz: fs,
        }
      : none;
  switch (limit.rule) {
    case 'fs': {
      const k = XO_FS_FACTOR_BY_ORDER[order];
      if (fs === null || fs <= 0 || k === undefined || !(k > 0)) return none;
      // U-3e measured what this convention is worth in decibels: k·f_s at
      // order n holds `6·n·log2(k)` dB at the resonance — 9.5 to 12.2 dB over
      // orders 1 to 4. It is a convention and not a measurement, and the
      // breach sentence says so.
      return onFs(DB_PER_OCTAVE_PER_ORDER * order * Math.log2(k));
    }
    case 'drive':
      return onFs(wi.upperDriveCeilingDb ?? null);
    case 'drive-stated':
      return onFs(wi.upperStatedDriveLimitDb ?? null);
    case 'breakup': {
      const bu = bindingBreakup(wi);
      if (!bu || !(bu.divisor > 1)) return none;
      return {
        quantity: 'breakup-suppression-db',
        // What the ceiling stood for: a flank of this order over the octave
        // distance the divisor is. The SAME divisor the ceiling was built on
        // (`bindingBreakup`, one implementation) — a verdict measured against a
        // different divisor would answer a limit nobody set.
        demandDb: DB_PER_OCTAVE_PER_ORDER * order * Math.log2(bu.divisor),
        subject: wi.lower,
        subjectLabel: wi.lower,
        atHz: bu.fHz,
      };
    }
    default:
      return none;
  }
}

/** The breach sentence: what was passed, by how much, and what it asks for. */
function breachSentence(b: Omit<StatedLimitBreach, 'sentence'>, hz: number, pairLabel: string): string {
  const past = b.side === 'floor' ? 'below' : 'above';
  const head =
    `${pairLabel} at ${formatEdge(hz)} Hz sits ${b.octaves.toFixed(3)} oct ${past} the ` +
    `${b.rule} ${b.side} of ${formatEdge(b.limitHz)} Hz ` +
    `(${b.stated ? 'STATED' : 'derived'}${b.uncalibrated ? ', UNCALIBRATED' : ''}) — ${b.source}.`;
  if (b.demandDb === null || b.subject === null || b.atHz === null) {
    return (
      `${head} This limit is a FREQUENCY and nothing else: there is no quantity on the delivered ` +
      'network to read it back from, so the breach is the whole verdict.'
    );
  }
  const who = b.subjectLabel ?? b.subject;
  const what =
    b.quantity === 'breakup-suppression-db'
      ? `${who} to sit ${b.demandDb.toFixed(1)} dB under its own passband at the breakup ` +
        `(${formatEdge(b.atHz)} Hz)`
      : `${who} to sit ${b.demandDb.toFixed(1)} dB under its own passband at its resonance ` +
        `(${formatEdge(b.atHz)} Hz)`;
  return (
    `${head} What that limit stands for is ${what}; the delivered network is measured against ` +
    'exactly that, and the measurement is what decides — the limit is derived on the bare ladder ' +
    'with the passband at the input, which assumes no pad and no trap.'
  );
}

/** Every binding limit of one window a stated position is past. */
export function breachesAt(
  hz: number,
  window: XoWindowResult,
  pair: CandidatePairInput,
  order: number,
): StatedLimitBreach[] {
  const out: StatedLimitBreach[] = [];
  for (const l of window.limits) {
    // U-4 — a SUPERSEDED limit is reported and does not bind, so it cannot be
    // breached: the designer already told the app to stand it aside.
    if (l.superseded !== undefined) continue;
    if (!(l.hz > 0) || !Number.isFinite(l.hz)) continue;
    const past =
      l.side === 'floor'
        ? hz < l.hz * (1 - SAME_FREQUENCY_REL)
        : hz > l.hz * (1 + SAME_FREQUENCY_REL);
    if (!past) continue;
    const d = demandOf(l, pair, order);
    const core = {
      side: l.side,
      rule: l.rule,
      limitHz: l.hz,
      octaves: Math.abs(Math.log2(hz / l.hz)),
      stated: STATED_RULES.includes(l.rule),
      source: l.source,
      uncalibrated: l.uncalibrated ?? null,
      ...d,
    };
    out.push({ ...core, sentence: breachSentence(core, hz, `${pair.windowInput.lower}→${pair.windowInput.upper}`) });
  }
  return out.sort((a, b) => b.octaves - a.octaves);
}

/* ------------------------------------------------------------------ *
 * The stated field
 * ------------------------------------------------------------------ */

export interface StatedFieldSettings {
  /** The alignments the design step can build — the generator's own library. */
  alignments: readonly Alignment[];
  /** Same policy the generated field runs under; absent = every admitted order. */
  alignmentPolicy?: AlignmentPolicy;
  /** Half-width of the cage, octaves: the spacing the generated field uses. */
  spacingOctaves: number;
  /** The project stamp that says when the designer wrote these down. */
  statedOn: string;
}

export interface StatedField {
  candidates: GeneratedCandidate[];
  /** Handovers that produced nothing, each with the reason. */
  refusals: string[];
  notes: string[];
}

/**
 * The stated candidates: the product over the handovers, each position with the
 * window it is measured against and everything it is past.
 *
 * `perAxisHz` is index-aligned with `pairs`, exactly as `perPair` is aligned
 * with `windowInputs` one layer up.
 */
export function statedCandidates(
  pairs: readonly CandidatePairInput[],
  perAxisHz: readonly (readonly number[])[],
  settings: StatedFieldSettings,
): StatedField {
  const notes: string[] = [];
  const refusals: string[] = [];
  const policy: AlignmentPolicy = settings.alignmentPolicy ?? 'every-order';
  const half = settings.spacingOctaves / 2;

  /** Per axis: every (position, order) row this handover contributes. */
  const axisRows: CandidateCrossing[][] = [];
  const axisEntries: StatedCrossingEntry[][] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const wi = pair.windowInput;
    const label = pair.orders.pairLabel;
    const stated = [...(perAxisHz[i] ?? [])].filter((f) => Number.isFinite(f) && f > 0);
    if (stated.length === 0) {
      refusals.push(
        `${label}: no crossing was stated, so no stated candidate can be built for this handover.`,
      );
      axisRows.push([]);
      axisEntries.push([]);
      continue;
    }
    const chosen = orderPolicyChoice(label, pair.orders.orders, policy, pair.statedOrder ?? null);
    const orders = chosen.orders.length > 0 ? chosen.orders : [];
    if (orders.length === 0) {
      refusals.push(
        `${label}: the order derivation admits no order at all, so a stated frequency has no ` +
          'filter to be built with. That is a statement about the measurements (P4), and stating ' +
          'a frequency does not answer it.',
      );
      axisRows.push([]);
      axisEntries.push([]);
      continue;
    }
    const rows: CandidateCrossing[] = [];
    const entries: StatedCrossingEntry[] = [];
    for (const order of orders) {
      const { chosen: alignment } = alignmentFor(settings.alignments, order);
      if (!alignment) {
        refusals.push(
          `${label}: order ${order} is admitted by the derivation but the alignment library offers ` +
            'nothing at that order, so no stated candidate is built there.',
        );
        continue;
      }
      const window = crossoverWindow({ ...wi, order });
      const orderWhy =
        pair.orders.why.find((w) => w.startsWith(`order ${order}:`)) ?? `order ${order}`;
      for (const hz of stated) {
        const breaches = breachesAt(hz, window, pair, order);
        const insideWindow = breaches.length === 0;
        const cage: [number, number] = [roundEdge(hz / 2 ** half), roundEdge(hz * 2 ** half)];
        const win: [number, number] = [
          roundEdge(window.floorHz ?? hz),
          roundEdge(window.ceilingHz ?? hz),
        ];
        entries.push({
          pairLabel: label,
          hz,
          insideWindow,
          windowHz: [window.floorHz, window.ceilingHz],
          breaches,
        });
        rows.push({
          pairLabel: label,
          lower: wi.lower,
          upper: wi.upper,
          hz,
          cageHz: cage,
          /* A stated cage is symmetric by construction and is NOT clipped to
           * the window. Clipping it would drag the tune back toward an edge the
           * designer deliberately stepped over, which is a second opinion about
           * a position they already gave; inside the window it is the same
           * shape a two-sided generated cage has (C-2). */
          twoSided: true,
          order,
          alignment,
          windowHz: win,
          floorBy: window.floorBy ? `${window.floorBy.rule} — ${window.floorBy.source}` : 'no floor limit',
          ceilingBy: window.ceilingBy
            ? `${window.ceilingBy.rule} — ${window.ceilingBy.source}`
            : 'no ceiling limit',
          segmentHz: win,
          excisions: [],
          position: {
            index: stated.indexOf(hz),
            count: stated.length,
            octavesAboveFloor: window.floorHz ? Math.log2(hz / window.floorHz) : 0,
          },
          orderWhy,
          uncalibrated: breaches.flatMap((b) => (b.uncalibrated ? [b.uncalibrated] : [])),
          provenance:
            `${wi.lower}→${wi.upper} at ${formatEdge(hz)} Hz, ${alignment.kind}${alignment.order}: ` +
            `STATED BY THE DESIGNER (${settings.statedOn}), position ${stated.indexOf(hz) + 1} of ` +
            `${stated.length} on this handover; cage ${formatEdge(cage[0])}–${formatEdge(cage[1])} Hz ` +
            '(one spacing wide, centred on the stated frequency and not clipped to the window); ' +
            `window ${formatEdge(win[0])}–${formatEdge(win[1])} Hz — ` +
            (insideWindow
              ? 'the stated position is INSIDE it, so this candidate is treated exactly as a ' +
                'generated one'
              : `OUTSIDE it: ${breaches.map((b) => `${b.rule} ${b.side} ${formatEdge(b.limitHz)} Hz`).join(', ')}`) +
            `; ${orderWhy}`,
        });
      }
      if (chosen.notes.length > 0) notes.push(...chosen.notes);
    }
    axisRows.push(rows);
    axisEntries.push(entries);
  }

  if (axisRows.some((r) => r.length === 0)) {
    return { candidates: [], refusals, notes };
  }

  /* The product, and the same ascent rule the generated field applies: two
   * handovers that do not ascend are not a design. */
  let combos: { rows: CandidateCrossing[]; entries: StatedCrossingEntry[] }[] = [{ rows: [], entries: [] }];
  for (let i = 0; i < axisRows.length; i++) {
    const next: typeof combos = [];
    for (const c of combos) {
      for (let k = 0; k < axisRows[i].length; k++) {
        next.push({ rows: [...c.rows, axisRows[i][k]], entries: [...c.entries, axisEntries[i][k]] });
      }
    }
    combos = next;
  }

  const candidates: GeneratedCandidate[] = [];
  let nonMonotone = 0;
  for (const c of combos) {
    let ok = true;
    for (let i = 1; i < c.rows.length; i++) if (!(c.rows[i].hz > c.rows[i - 1].hz)) ok = false;
    if (!ok) {
      nonMonotone++;
      continue;
    }
    const outsideWindow = c.entries.some((e) => !e.insideWindow);
    const label =
      c.rows
        .map((x) => `${x.pairLabel} ${formatEdge(x.hz)} ${x.alignment.kind}${x.alignment.order}`)
        .join(' · ') + STATED_LABEL_SUFFIX;
    const mark: StatedCrossingMark = {
      statedOn: settings.statedOn,
      outsideWindow,
      perCrossing: c.entries,
      provenance:
        `Stated by you (${settings.statedOn}): ` +
        c.entries.map((e) => `${e.pairLabel} ${formatEdge(e.hz)} Hz`).join(', ') +
        (outsideWindow
          ? ' — OUTSIDE the feasible window. It is tuned and judged in full; every limit it is ' +
            'past is answered in that limit’s own unit beside it.'
          : ' — inside every feasible window, so it is treated exactly as a generated candidate.'),
    };
    candidates.push({
      label,
      crossings: c.rows,
      provenance: c.rows.map((x) => x.provenance).join(' | '),
      stated: mark,
    });
  }
  if (nonMonotone > 0) {
    notes.push(
      `${nonMonotone} stated combination(s) were dropped because their handovers do not ascend: a ` +
        'lower handover at or above the one above it is not a design. The frequencies themselves ' +
        'are kept — pair them the other way round and they build.',
    );
  }
  if (candidates.length > 0) {
    notes.push(
      `${candidates.length} STATED candidate(s) were added to the field (${settings.statedOn}). ` +
        'They are tuned and judged exactly as the generated ones; the ones outside a feasible ' +
        'window are never mixed in with the qualified designs, and each of them carries what every ' +
        'limit it is past asks for, measured on the network it delivered.',
    );
  }
  return { candidates, refusals, notes };
}

/**
 * A stated position that lands on a generated one.
 *
 * Reported, never de-duplicated: the two are the same design and are still two
 * candidates, because the stated one carries an attribution the generated one
 * has not got, and because a chain budget may thin the generated one away while
 * the stated one may not be thinned at all. What that costs is one extra tune,
 * and a designer who is paying it should be told.
 */
export function statedOverlapNotes(
  stated: readonly GeneratedCandidate[],
  generated: readonly GeneratedCandidate[],
): string[] {
  const out: string[] = [];
  for (const s of stated) {
    const twin = generated.find(
      (g) =>
        g.crossings.length === s.crossings.length &&
        g.crossings.every(
          (x, i) =>
            x.order === s.crossings[i].order &&
            Math.abs(Math.log2(x.hz / s.crossings[i].hz)) <= SAME_POSITION_OCTAVES,
        ),
    );
    if (twin) {
      out.push(
        `The stated candidate ${s.label} sits within ${SAME_POSITION_OCTAVES} oct of the generated ` +
          `${twin.label}, at the same order — the same design, tuned twice. Both are run: the ` +
          'stated one carries your attribution and cannot be thinned by the chain budget, and the ' +
          'generated one can.',
      );
    }
  }
  return out;
}
