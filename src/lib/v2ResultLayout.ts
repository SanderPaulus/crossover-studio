/**
 * U-6 — THE ORDER OF THE RESULT AREA, AS DATA.
 *
 * After a v2 run the app lands on the Network tab, and until U-6 what a reader
 * met there was: the editor heading, two paragraphs about dragging parts, a
 * 230-line toolbar, four tune audits, a green success line, a Pareto plot, the
 * v1 reading and its eight-column table, two notes — and THEN the shortlist,
 * with the schematic another four blocks further down. The answer to "which
 * design did this run deliver, and what does it look like" was the seventh and
 * the twelfth thing on the page.
 *
 * Nothing in this file judges, measures or rewrites a single sentence. It says
 * WHERE each block of the result area goes and WHY, in the form
 * `v2InputRegister.ts` already uses for the INPUT side (I-1) and
 * `v2InputPlacement.ts` for its placement rule (U-3b). Here it is the OUTPUT
 * side, and the rule it encodes is one sentence:
 *
 *     ACCOUNTABILITY FOLDS, A PROBLEM NEVER DOES.
 *
 * A block that explains, justifies or re-reads the run goes behind one
 * collapsed line ("About this run"); a block that says something is WRONG or
 * BLOCKED — nothing qualified, nothing was loaded, this drawing cannot be
 * simulated — stays visible, always, because a fold is a place where a problem
 * goes to be missed. F0 survives either way: every sentence that existed before
 * U-6 still exists, in the same words, one click away at worst.
 *
 * The guard (`v2ResultLayout.test.ts`) reads this inventory and scans
 * `App.tsx`: each block must sit in the region its placement names, the region
 * above the table must hold NOTHING but the badge row and the blocks filed as
 * blockades, and the two disclosures must be closed by default. A new result
 * block dropped into the area without a placement decision fails the count —
 * the U-3b form, one layer further downstream.
 */

/* ------------------------------------------------------------------ *
 * THE REGIONS
 * ------------------------------------------------------------------ */

/**
 * The source markers that delimit the regions, in the order they must appear.
 * They are JSX comments in `App.tsx` and nothing else reads them, so they can
 * never drift away from the layout they describe: moving a block without
 * moving its marker is exactly what the guard is looking for.
 */
export const V2_RESULT_MARKERS = [
  'U-6 RESULT · SHORTLIST',
  'U-6 RESULT · TABLE',
  'U-6 RESULT · BELOW',
  'U-6 RESULT · NETWORK',
  'U-6 RESULT · ABOUT',
  'U-6 RESULT · END',
] as const;

export type V2ResultPlacement =
  /** Before the shortlist: only blocks that cannot coexist with one. */
  | 'top'
  /** Between the shortlist heading and its table: the badge row and blockades. */
  | 'shortlist-head'
  /** The table itself. */
  | 'table'
  /** Under the table: the refusals fold and the one hand-over action. */
  | 'below-table'
  /** The network: the editor, the drawing, and what a component tune did to it. */
  | 'network'
  /** Behind the single collapsed line: everything that accounts for the run. */
  | 'about';

/** Which marker opens the region a placement names. */
export const V2_REGION_START: Record<V2ResultPlacement, string | null> = {
  top: null,
  'shortlist-head': 'U-6 RESULT · SHORTLIST',
  table: 'U-6 RESULT · TABLE',
  'below-table': 'U-6 RESULT · BELOW',
  network: 'U-6 RESULT · NETWORK',
  about: 'U-6 RESULT · ABOUT',
};

/** …and which marker closes it. */
export const V2_REGION_END: Record<V2ResultPlacement, string> = {
  top: 'U-6 RESULT · SHORTLIST',
  'shortlist-head': 'U-6 RESULT · TABLE',
  table: 'U-6 RESULT · BELOW',
  'below-table': 'U-6 RESULT · NETWORK',
  network: 'U-6 RESULT · ABOUT',
  about: 'U-6 RESULT · END',
};

/* ------------------------------------------------------------------ *
 * THE INVENTORY
 * ------------------------------------------------------------------ */

export interface V2ResultBlock {
  id: string;
  /** What it is, in one line. */
  what: string;
  /** When it appears at all. */
  when: string;
  /** A source fragment of `App.tsx` that identifies it, and only it. */
  token: string;
  placement: V2ResultPlacement;
  /** Why it sits there. A blockade says so here; everything else folds. */
  why: string;
  /**
   * True for a block that may never be folded: it reports a failure or a
   * blockade, and a fold is where those go to be missed.
   */
  blockade?: true;
  /**
   * Only for `shortlist-head` and `top`: how many text-bearing JSX openings
   * (`<p`, `<ul`, `<li`, `<details`, `<h5`, `<h6`) this block contributes to
   * its region. The guard adds them up and compares with what it counts, so a
   * new block in the one region that must stay clean cannot arrive unnoticed.
   */
  elements?: number;
}

export const V2_RESULT_BLOCKS: readonly V2ResultBlock[] = [
  /* ---- before the shortlist: only what cannot coexist with one ---------- */
  {
    id: 'rescued-offer',
    what: 'The offer to show candidates that survived an interrupted scan.',
    when: 'A scan died with finished candidates in it and no table is on screen.',
    token: '{rescued && !chainScan && !vfBusy && (',
    placement: 'top',
    why: 'An offer with two buttons, and it is guarded on `!chainScan` — a v2 run always sets a scan table, so it cannot stand above a shortlist.',
    blockade: true,
    elements: 1,
  },
  {
    id: 'v1-ready',
    what: 'The green success line of a run that produced no shortlist (the v1 route).',
    when: 'A scan table exists and there is no shortlist.',
    token: '{chainScan && !v2Shortlist && (',
    placement: 'top',
    why: 'Guarded on `!v2Shortlist` in the source: where a shortlist exists this line is not rendered, so it is never a text block above the table.',
    elements: 1,
  },

  /* ---- the badge row and the blockades --------------------------------- */
  {
    id: 'no-run-notice',
    what: 'That nothing has run in this session, and where the shortlist would be.',
    when: 'No shortlist and no scan table.',
    token: "{v2ResultState.kind === 'no-run' && (",
    placement: 'top',
    why: 'U-6b — the area now BEGINS where the shortlist is, so an absent one is a hole exactly where the eye lands. After a reload that is the normal case, and the loaded network comes back out of the autosave, so the page read as a finished result with its verdict quietly missing. Empty must be visibly empty (F0).',
    blockade: true,
    elements: 1,
  },
  {
    id: 'shortlist-heading',
    what: 'The heading: the word Shortlist, how many of how many qualified, the stale tag.',
    when: 'Always, with a shortlist.',
    token: "{t('Shortlist')}{' '}",
    placement: 'shortlist-head',
    why: 'This IS the badge row — the one line the reader is allowed to meet before the table.',
    elements: 0,
  },
  {
    id: 'nothing-qualified',
    what: 'Nothing qualified, and which requirement each candidate missed.',
    when: 'The feasible region is empty.',
    token: '{v2Shortlist.diagnosis.length > 0 && (',
    placement: 'shortlist-head',
    why: 'A blockade, and when it fires there is no table to look at: this list IS the result. Folding the only content there is would be a fold over an empty page.',
    blockade: true,
    elements: 2,
  },
  {
    id: 'nothing-loaded',
    what: 'No design was loaded and the Working tab is untouched.',
    when: 'A run finished and no shortlist row went into Working.',
    token: "'No design was loaded: {n} of {m} candidates",
    placement: 'shortlist-head',
    why: 'A blockade about the state of the app, not an account of the run. Its green twin ("X is loaded") folds, because the table marks the loaded row itself.',
    blockade: true,
    elements: 1,
  },

  {
    id: 'no-rows-notice',
    what: 'That the run delivered no design at all, with how many it judged.',
    when: 'A shortlist exists and it holds no rows.',
    token: "{v2ResultState.kind === 'no-rows' && (",
    placement: 'shortlist-head',
    why: 'A heading over a blank space is the one thing this area may never be. The ladder diagnosis says WHICH requirement was missed and is not always there; this says that nothing arrived, and always is.',
    blockade: true,
    elements: 1,
  },

  /* ---- the table -------------------------------------------------------- */
  {
    id: 'shortlist-table',
    what: 'The shortlist itself: one row per delivered design, one status word each.',
    when: 'At least one design qualified.',
    token: '{v2Shortlist.rows.length > 0 && (() => {',
    placement: 'table',
    why: 'The first thing the eye meets after the badge row. Everything that used to stand between them now folds or sits below.',
  },

  /* ---- under the table --------------------------------------------------- */
  {
    id: 'refusals',
    what: 'The candidates whose tune was refused wholesale, with the rule that refused each.',
    when: 'At least one candidate delivered no network at all.',
    token: '{v2Shortlist.rejected.length > 0 && (',
    placement: 'below-table',
    why: 'Its own fold directly under the list it belongs to, closed by default: these are not near-misses and nobody looked at a design here (V31).',
  },
  {
    id: 'to-expert',
    what: 'The hand-over from guided to expert.',
    when: 'Guided mode.',
    token: "{t('Continue in Expert →')}",
    placement: 'below-table',
    why: 'An action, not an account — and it belongs to the shortlist it hands over.',
  },

  /* ---- the network ------------------------------------------------------- */
  {
    id: 'network-heading',
    what: 'The heading of the network editor.',
    when: 'Always, on the Network tab.',
    token: "{t('Network editor (passive)')}",
    placement: 'network',
    why: 'It labels the editor, so it travels with the editor — second on the page instead of first.',
  },
  {
    id: 'sim-source',
    what: 'What the charts on the right are showing.',
    when: 'Always, on the Network tab.',
    token: 'className="sub sim-source"',
    placement: 'network',
    why: 'It describes what the charts show; it sits with the editor chrome UNDER the drawing, because the drawing is what the table just chose.',
  },
  {
    id: 'editor-hint',
    what: 'How the editor works: drag parts, draw wires, everything re-solves live.',
    when: 'Always, on the Network tab.',
    token: "'Drag parts, draw wires, edit values",
    placement: 'network',
    why: 'It is about the editor, and since U-6 the editor chrome stands under the drawing it edits.',
  },
  {
    id: 'editor-tools',
    what: 'The editor toolbar.',
    when: 'Always, on the Network tab.',
    token: 'className="tool-groups"',
    placement: 'network',
    why: 'Controls of the drawing, UNDER the drawing: measured in the running app, the 234-line toolbar pushed the schematic 1395 px down a 900 px viewport, so it was second in the source and off-screen on the page.',
  },
  {
    id: 'schematic',
    what: 'The schematic of the loaded design.',
    when: 'A network exists.',
    token: '<SchematicEditor',
    placement: 'network',
    why: 'THE NETWORK, directly under the table that chose it — before the toolbar and before the prose. It used to sit below the tune audits, the compare table and the design tabs.',
  },
  {
    id: 'sim-status',
    what: 'Whether this drawing was simulated as drawn, with every defect by name.',
    when: 'A network exists.',
    token: 'className="sim-status-head"',
    placement: 'network',
    why: 'A blockade about the drawing, under the drawing, never folded (UI-2).',
    blockade: true,
  },
  {
    id: 'bom',
    what: 'The bill of materials of the drawn network.',
    when: 'The drawing has priced parts.',
    token: '<details className="bom">',
    placement: 'network',
    why: 'Already a fold, already under the drawing; untouched.',
  },
  {
    id: 'tune-note',
    what: 'What the component tuner just did.',
    when: 'A component tune ran.',
    token: '{netOptNote && (',
    placement: 'network',
    why: 'About the NETWORK and not about the run: it answers the ⚙ button, so it lives with the network.',
  },
  {
    id: 'tune-diff',
    what: 'The value changes of that tune, old → new.',
    when: 'A component tune changed values.',
    token: '{netOptDiff && netOptDiff.length > 0 && (',
    placement: 'network',
    why: 'Same author as the note above it.',
  },
  {
    id: 'minimize-report',
    what: 'What the minimiser could remove or substitute.',
    when: 'The minimiser ran.',
    token: '{minimizeReport && (() => {',
    placement: 'network',
    why: 'Same author again — and closed by default since U-6: it opened itself over the result of a run it knows nothing about.',
  },
  {
    id: 'part-audit',
    what: 'Which parts are inert, earned or grey.',
    when: 'A part audit ran.',
    token: '{netOptAudit && netOptAudit.entries.length > 0 && (',
    placement: 'network',
    why: 'An audit of the drawing, beside the drawing.',
  },
  {
    id: 'tab-compare',
    what: 'Every saved design measured through one pipeline.',
    when: 'More than one design tab exists.',
    token: '{tabCompare && tabCompare.length > 1 && (',
    placement: 'network',
    why: 'A comparison of what is SAVED, which is a property of the tabs beside it.',
  },
  {
    id: 'design-tabs',
    what: 'The design tabs and the save buttons.',
    when: 'At least one design exists.',
    token: 'className="design-tabs"',
    placement: 'network',
    why: 'Where you put what you keep — under the drawing you would keep.',
  },

  /* ---- behind one collapsed line ----------------------------------------- */
  {
    id: 'run-stamp',
    what: 'Seed, fingerprint, aborted-or-completed, and the run as a JSON file.',
    when: 'An engine-v2 run produced this table.',
    token: '{v2Run && chainScan && (',
    placement: 'about',
    why: 'A5e.4 asks for the seed and the fingerprint to be visible AT THE RESULT; one click is visible, and an aborted run still says so in the summary line.',
  },
  {
    id: 'about-unfolded',
    what: 'The same body, unfolded and headed, when the run left no shortlist.',
    when: 'A scan table exists and no shortlist does.',
    token: 'className="v2-about v2-about-bare"',
    placement: 'about',
    why: 'U-6b — a fold is for a SECOND reading, and `buildShortlist` runs only when the run produced a stamp, so a run without one leaves the v1 reading as the ONLY table. One body, two wrappers: folded beside a shortlist, open when it is all there is.',
  },
  {
    id: 'field-mode',
    what: 'Which field made this, and the offer to run the full one.',
    when: 'The run carried a field.',
    token: 'className="sub v2-field-mode"',
    placement: 'about',
    why: 'It accounts for the size of the search that produced the rows.',
  },
  {
    id: 'skipped-requirements',
    what: 'Which of the questions the designer was asked went unanswered.',
    when: 'Guided asked them and some went unanswered.',
    token: 'describeSkipped(v2GuidedValues)',
    placement: 'about',
    why: 'It says what was NOT judged — accountability in its purest form (I-3).',
  },
  {
    id: 'ladder',
    what: 'The sentence that must travel with these rows when the ladder relaxed a requirement.',
    when: 'The relaxation ladder moved.',
    token: '{v2Shortlist.label && (',
    placement: 'about',
    why: 'It explains WHY these rows qualify; the rows themselves are the answer.',
  },
  {
    id: 'shortlist-ready',
    what: 'Which design was loaded into the Working tab.',
    when: 'A shortlist row went into Working.',
    token: "{t('Shortlist ready —')}",
    placement: 'about',
    why: 'A confirmation of something the table already marks with ◂ on the row. Its failing twin stays visible.',
  },
  {
    id: 'fingerprint-note',
    what: 'That the order is a view and not a verdict, plus the shortlist fingerprint.',
    when: 'Always, with a shortlist.',
    token: "'Everything here meets every requirement and every gate you set.",
    placement: 'about',
    why: 'The account of what the ordering means, and of which selection produced it.',
  },
  {
    id: 'shortlist-notes',
    what: 'The shortlist’s own notes.',
    when: 'The shortlist carried notes.',
    token: '{v2Shortlist.notes.map((n, i) => (',
    placement: 'about',
    why: 'Notes about how the list was built.',
  },
  {
    id: 'stated',
    what: 'Every crossing the designer stated, with what each limit it is past asks for.',
    when: 'At least one crossing was stated.',
    token: 'className="shortlist-stated"',
    placement: 'about',
    why: 'U-5 asks for it to exist, in its own section, never mixed into the rows — and it is still loadable from inside the fold.',
  },
  {
    id: 'scan-reference-verdict',
    what: 'That no candidate beat the design the designer already had.',
    when: 'A reference design was on screen when the run started and nothing beat it.',
    token: "'No candidate beat the design you already had",
    placement: 'about',
    why: 'A verdict of the v1 ranking over the same field — a second reading, which is what this fold holds.',
  },
  {
    id: 'pareto',
    what: 'Cost against quality, with the Pareto front.',
    when: 'At least two candidates carry a price.',
    token: "{t('Cost vs quality — the knee is yours to pick')}",
    placement: 'about',
    why: 'A second view of the same rows; the table is the first.',
  },
  {
    id: 'v1-reading-heading',
    what: 'That the table below is the v1 ranking and not the route that made this run.',
    when: 'A v2 shortlist and a scan table both exist.',
    token: 'className="v1-reading"',
    placement: 'about',
    why: 'It is the caption of the v1 table, and travels with it.',
  },
  {
    id: 'v1-reading-table',
    what: 'The v1 ranking over the same field, eight columns.',
    when: 'A scan table exists.',
    token: "scan-table-pick${v2Shortlist ? ' scan-table-v1-reading' : ''}",
    placement: 'about',
    why: 'UI-1 kept it as a SECOND READING of one’s own field. A second reading is exactly what a fold is for; on the v1 route (no shortlist) it is all there is, and the fold opens on nothing else.',
  },
  {
    id: 'v1-engine-note',
    what: 'That engine v2 is on but this scan ran on the v1 engine.',
    when: 'v2 selected, a scan table, and no v2 run.',
    token: "'Engine v2 is on, but this scan ran on the v1 engine",
    placement: 'about',
    why: 'It qualifies the table it stands under.',
  },
  {
    id: 'run-notes',
    what: 'The notes the run itself wrote.',
    when: 'The run wrote notes.',
    token: '{v2RunNotes.length > 0 && (',
    placement: 'about',
    why: 'The run accounting for itself, in its own words.',
  },
] as const;

/** Every block filed under one placement, in inventory order. */
export function blocksAt(placement: V2ResultPlacement): V2ResultBlock[] {
  return V2_RESULT_BLOCKS.filter((b) => b.placement === placement);
}

/* ------------------------------------------------------------------ *
 * THE TWO DISCLOSURES
 * ------------------------------------------------------------------ */

/**
 * Where the open/closed choice is remembered. PER SESSION and not per browser:
 * "About this run" is a choice about THIS run, and carrying it into next week's
 * project would be a fold that quietly stopped folding.
 */
export const V2_DISCLOSURE_KEYS = {
  about: 'ads-v2-about-open',
  refused: 'ads-v2-refused-open',
} as const;

export type V2DisclosureKey = (typeof V2_DISCLOSURE_KEYS)[keyof typeof V2_DISCLOSURE_KEYS];

/** Closed unless this session says otherwise. Storage may throw; that is fine. */
export function readDisclosure(key: V2DisclosureKey): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeDisclosure(key: V2DisclosureKey, open: boolean): void {
  try {
    sessionStorage.setItem(key, open ? '1' : '0');
  } catch {
    // Private mode, a blocked store, a test environment: the fold still works,
    // it just forgets. Never a reason to fail a render.
  }
}

/* ------------------------------------------------------------------ *
 * U-5b IN THE TABLE: ONE ROW PER ANSWER, WITH THE COUNT BESIDE IT
 * ------------------------------------------------------------------ */

/** Only the two fields this grouping needs — never the engine's own types. */
interface RowLike {
  label: string;
}
interface StatedLike {
  label: string;
  /** U-5b — the earlier stated entry that delivered the IDENTICAL network. */
  sameNetworkAs: string | null;
}

export interface ShortlistRowView<R> {
  row: R;
  /** One word, and never more than one: a person named this crossing, or not. */
  status: 'delivered' | 'stated';
  /** How many stated positions delivered this exact network, this row included. */
  sameCount: number;
  /** The labels folded into this row, in shortlist order. */
  sameLabels: string[];
}

/**
 * U-5b AS A READING OF THE TABLE, never as a thinning of the shortlist.
 *
 * Nine stated positions a quarter of a percent apart may converge on one
 * design. Nine rows that are one answer is nine re-readings of the same
 * numbers; one row saying "×4 identical" is the same information, once. What
 * makes this a reading and not a loss is that every folded entry keeps its own
 * full entry in the stated section — with its own verdicts, its own limits and
 * its own load button — so nothing is removed, only stopped from being printed
 * twice (F0).
 *
 * It fires on STATED entries only, because `sameNetworkAs` is a property only
 * they carry, and it is EXACT: `shortlist.ts` set it by comparing serialised
 * part lists, with no tolerance anywhere in it (U-5b). A derived row is never
 * folded into anything.
 */
export function groupShortlistRows<R extends RowLike, S extends StatedLike>(
  rows: readonly R[],
  stated: readonly S[],
): ShortlistRowView<R>[] {
  const statedBy = new Map(stated.map((s) => [s.label, s]));
  const views: ShortlistRowView<R>[] = [];
  const byLabel = new Map<string, ShortlistRowView<R>>();
  /* Two passes: a row may only fold into a row that is itself on the list, and
   * the entry it points at can come later in `rows` than the entry pointing. */
  for (const row of rows) {
    const view: ShortlistRowView<R> = {
      row,
      status: statedBy.has(row.label) ? 'stated' : 'delivered',
      sameCount: 1,
      sameLabels: [],
    };
    views.push(view);
    byLabel.set(row.label, view);
  }
  const kept: ShortlistRowView<R>[] = [];
  for (const view of views) {
    const target = statedBy.get(view.row.label)?.sameNetworkAs ?? null;
    const host = target === null ? undefined : byLabel.get(target);
    if (host === undefined || host === view) {
      kept.push(view);
      continue;
    }
    host.sameCount += 1;
    host.sameLabels.push(view.row.label);
  }
  return kept;
}

/** The one-word status as a sentence, for the row's tooltip. */
export function statusTitle(view: ShortlistRowView<unknown>): string {
  const head =
    view.status === 'stated'
      ? 'You stated this crossing; the app did not derive it. It met every requirement in force and every gate, so it is a shortlist row like any other.'
      : 'Derived by the app inside every feasible window, and it meets every requirement in force and every gate.';
  if (view.sameCount === 1) return head;
  return (
    `${head} ${view.sameCount} stated positions delivered this exact network, part for part ` +
    `(${view.sameLabels.join(', ')} folded into this row). Each of them keeps its own entry, ` +
    'with its own verdicts and its own load button, under "About this run".'
  );
}

/* ------------------------------------------------------------------ *
 * WHAT THE RESULT AREA IS SHOWING — AND WHEN IT IS SHOWING NOTHING
 * ------------------------------------------------------------------ */

/**
 * U-6b — EMPTY MUST BE VISIBLY EMPTY (F0), AND U-6 MADE IT INVISIBLY EMPTY.
 *
 * Two states slipped through U-6, and both of them are the same mistake seen
 * from two sides: the area now BEGINS where the shortlist is, so an absent
 * shortlist is a hole exactly where the eye lands, and nothing said a word.
 *
 *  1. A RELOAD. `v2Shortlist` is React state and has never survived one — that
 *     is not new — but the loaded NETWORK comes back out of the autosave, so
 *     after a refresh the page looks like a finished result with its verdict
 *     silently missing. Before U-6 the shortlist sat 7676 px down and nobody
 *     expected it at the top; after U-6 its absence is the first thing there.
 *  2. A RUN WITHOUT A STAMP. `buildShortlist` only runs when the run produced
 *     one (`v2Stamp ? … : null`), so such a run leaves a scan table and NO
 *     shortlist — and U-6 had just folded the v1 reading into "About this run".
 *     A fold is for a SECOND reading; when it holds the ONLY table it is not a
 *     second reading, and the run's whole result was one click away with no
 *     sign that there was anything to click.
 *
 * This function owns the decision and nothing else: which of the four states
 * the area is in. The SENTENCES live in `App.tsx` beside every other sentence,
 * because they go through `t()` and this module knows nothing about language.
 */
export const V2_RESULT_STATE_KINDS = ['rows', 'no-rows', 'scan-only', 'no-run'] as const;

export type V2ResultStateKind = (typeof V2_RESULT_STATE_KINDS)[number];

export interface V2ResultStateInput {
  /** A shortlist object exists — a v2 run finished in THIS session. */
  hasShortlist: boolean;
  /** How many designs it delivered. */
  rowCount: number;
  /** How many candidates it judged. */
  consideredCount: number;
  /** A scan table exists (a run of some kind left one). */
  hasScanTable: boolean;
}

export interface V2ResultState {
  kind: V2ResultStateKind;
  /** How many candidates the message may quote. Zero when there was no run. */
  consideredCount: number;
  /** True when the area has no table of its own to show. */
  empty: boolean;
  /**
   * True when the accountability drawer holds the run's ONLY table and must
   * therefore not be a drawer at all.
   */
  aboutIsTheOnlyReading: boolean;
}

export function resultAreaState(i: V2ResultStateInput): V2ResultState {
  if (i.hasShortlist && i.rowCount > 0) {
    return {
      kind: 'rows',
      consideredCount: i.consideredCount,
      empty: false,
      aboutIsTheOnlyReading: false,
    };
  }
  if (i.hasShortlist) {
    return {
      kind: 'no-rows',
      consideredCount: i.consideredCount,
      empty: true,
      aboutIsTheOnlyReading: false,
    };
  }
  if (i.hasScanTable) {
    return {
      kind: 'scan-only',
      consideredCount: 0,
      empty: true,
      aboutIsTheOnlyReading: true,
    };
  }
  return { kind: 'no-run', consideredCount: 0, empty: true, aboutIsTheOnlyReading: false };
}
