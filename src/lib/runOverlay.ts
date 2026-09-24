/**
 * U-8 — THE RUN OVERLAY: WHAT A ROW SAYS, AND WHERE THE CARD PUTS IT.
 *
 * The overlay was built when a scan row read `W-M 411 · M-T 2520 Hz`. Since
 * H-4b and H-5 every row also carries its polarity — which ways a builder
 * solders reversed, which arm that makes it, and which alignment asked —
 * so a real row now reads
 *
 *     woofer→mid 253 LR2 · mid→tweeter 2251.4 LR4 · stated
 *       · mid ⌀ + tweeter ⌀ · textbook for LR2
 *
 * which wraps to three lines. The card is a fixed-width centred flex box with
 * no height cap, so at ten candidates it grew past the viewport and the bottom
 * rows, the totals line and Cancel went off-screen with no way to reach them
 * (Sander, screenshot 24-09-2026).
 *
 * TWO THINGS LIVE HERE, and neither of them writes a word of new text.
 *
 * (1) THE SPLIT. A label is `' · '`-joined segments, and the leading ones are
 *     crossings — `<lower>→<upper> <hz> <kind><order>`, built by
 *     `candidates.ts` — while everything appended after them is provenance:
 *     `stated` (U-5), `mid ⌀ + tweeter ⌀` and `textbook for LR2` / `mirror`
 *     (H-4b/H-5), `active 400 Hz` (H-2). Giving the first group a line and the
 *     second a row of badges is the U-6 rule one surface over: the same text,
 *     laid out so the thing you locate a row BY is not buried in the middle of
 *     its own provenance.
 *
 *     THE SPLIT IS LOSSLESS OR IT DOES NOT HAPPEN. `[position, ...marks]`
 *     rejoined with the separator must be the input, byte for byte; a label
 *     that would not survive that (no crossing at all — a component-tune stage
 *     name; or a crossing that appears AFTER a mark, which no builder emits
 *     today) is returned whole as the position. A progress row you cannot read
 *     is not a progress report, and one that has quietly lost a word is worse.
 *
 * (2) THE REGION CLASSES. Head, scroller and foot as data, so `App.tsx` and
 *     the guard cannot drift about which of the three a block sits in — the
 *     form `v2ResultLayout.ts` uses for the result area (U-6).
 */

/* ------------------------------------------------------------------ *
 * The split
 * ------------------------------------------------------------------ */

/**
 * What joins the segments of a candidate label.
 *
 * Four builders spell it — `candidates.ts` joins the crossings with it,
 * `polarityLabel`, `statedCrossings.ts` and `hybridLabel` each append with it
 * — so it is a shared convention and not this module's to define. What keeps
 * this copy honest is the guard: it splits the labels RECORDED by M-5 and
 * H-4b, and a builder that changed the separator would fail there rather than
 * quietly stop splitting.
 */
export const LABEL_SEPARATOR = ' · ';

/**
 * What makes a segment a CROSSING and not a mark: the arrow in its pair label.
 *
 * `candidateField.ts` builds every pair label as `${lower}→${upper}`, and no
 * mark carries one — the ways in a polarity mark are bare driver names. It is
 * a structural discriminator rather than a vocabulary of known suffixes, which
 * is deliberate: a session that appends a new mark should not have to come
 * here, and one that changes how a crossing is spelled should.
 */
export const CROSSING_MARK = '→';

export interface ScanLabelParts {
  /** The crossings and their alignments: what a reader locates the row by. */
  position: string;
  /** Everything appended after them, in order, one badge each. */
  marks: string[];
}

/**
 * Split one scan-row label into its position and its provenance marks.
 *
 * Never loses, never reorders: `[position, ...marks].join(LABEL_SEPARATOR)`
 * is the input for every label this app builds, and where it would not be the
 * whole label comes back as the position.
 */
export function splitScanLabel(label: string): ScanLabelParts {
  const whole: ScanLabelParts = { position: label, marks: [] };
  const segments = label.split(LABEL_SEPARATOR);
  let lead = 0;
  while (lead < segments.length && segments[lead].includes(CROSSING_MARK)) lead += 1;
  /* No crossing at all: a component-tune stage name, a hand-written label, a
     translated string. There is nothing to split and nothing to gain. */
  if (lead === 0) return whole;
  /* A crossing AFTER a mark. No builder emits that today; if one ever does,
     splitting here would reorder the label, so it is left alone instead. */
  for (let i = lead; i < segments.length; i++) {
    if (segments[i].includes(CROSSING_MARK)) return whole;
  }
  return {
    position: segments.slice(0, lead).join(LABEL_SEPARATOR),
    marks: segments.slice(lead),
  };
}

/* ------------------------------------------------------------------ *
 * The regions of the card
 * ------------------------------------------------------------------ */

/**
 * The three regions of the run card, as class names.
 *
 * HEAD and FOOT are flex siblings of the scroller and not `position: sticky`
 * inside it, which is the stronger form of the same requirement: a sticky
 * header shares the scroller's box and can still be scrolled past on a short
 * viewport, while a sibling that does not scroll cannot be. The spinner, the
 * title and the round line are the head; the rows are the only thing that
 * scrolls; the totals line and Cancel are the foot.
 */
export const RUN_OVERLAY_REGION = {
  /** Spinner, title, round line — never scrolls. */
  head: 'busy-head',
  /** The candidate rows, and nothing else — the one scrolling box. */
  scroll: 'busy-scroll',
  /** Totals line and the way out — never scrolls. */
  foot: 'busy-foot',
} as const;

/** The overlay and card classes the run overlay adds to the shared shell. */
export const RUN_OVERLAY_CLASS = {
  /** On `.busy-overlay`: the top layer, above the modal tier. */
  overlay: 'run-overlay',
  /** On `.busy-card`: the height cap and the head/scroll/foot column. */
  card: 'run-card',
} as const;

/**
 * The source markers that delimit the three regions in `App.tsx`.
 *
 * JSX comments, read by nothing but the guard — so they cannot drift away
 * from the layout they describe, and moving a block out of its region without
 * moving its marker is exactly what the guard is looking for (the U-6 form).
 */
export const RUN_OVERLAY_MARKERS = [
  'U-8 OVERLAY · HEAD',
  'U-8 OVERLAY · SCROLL',
  'U-8 OVERLAY · FOOT',
  'U-8 OVERLAY · END',
] as const;
