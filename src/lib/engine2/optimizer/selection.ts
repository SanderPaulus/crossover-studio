/**
 * UI-1 — WHICH DESIGN THE WORKING TAB HOLDS AFTER A v2 RUN.
 *
 * One function, so that "what is loaded" is a value a test can read rather
 * than a sequence of `setState` calls inside an 18 000-line component. The
 * V32 shape: the rule lives here, `App.tsx` calls it and applies the answer,
 * and nothing decides this twice.
 *
 * ── WHAT WENT WRONG, because the shape of this module is the shape of the bug
 *
 * The v2 route ran, produced a shortlist, and then handed the Working tab
 * `rankChain3Results(results)[0]` — the v1 ranking, over the same field. Three
 * separate things were wrong with that and they compounded:
 *
 *   1. THE v1 RANKING KNOWS NOTHING ABOUT v2's VERDICTS. It has no gates, no
 *      requirements and no notion of a wholesale refusal. It ranked on
 *      flatness and price, so it could and did crown a candidate the v2 route
 *      had thrown away.
 *   2. A REFUSED CANDIDATE CARRIES NO PARTS. V31 blanks `parts` AND
 *      `net.parts` before the result leaves the worker — deliberately, so that
 *      nothing can serialise a seed nobody judged into a netlist. What it does
 *      NOT blank is `net.after`, because those figures describe the network
 *      that was refused and are the report on it.
 *   3. SO THE WINNER LOADED WAS AN EMPTY PART LIST — and `setWorkingDesign([])`
 *      still sets `networkActive`. The Working tab said "No generator — add a
 *      source element", the charts summed the unfiltered drivers, the status
 *      badges scored that, and one green line said "Design ready — the winner
 *      is loaded in the Working tab". Every one of those is a lie assembled
 *      from parts that are each individually correct.
 *
 * Sander's run of 01-09-2026 is exactly this: 4 of 9 in the shortlist, and a
 * v1 "winner" at 396.7/1294 Hz with a minimum impedance of 0.8 Ω that the v2
 * route had refused.
 *
 * ── THE RULES, and each one is a claim `selection.test.ts` holds
 *
 *   · The default selection is the FIRST SHORTLIST ROW. First is presentation
 *     (RMS against the target curve) and not a verdict — A5e.1 is explicit
 *     that the choice is the human's — but something has to be on screen when
 *     a run finishes, and the top of the list the engine delivered is the only
 *     honest candidate for that. Naming it says so.
 *   · A ROW IS SELECTABLE BY LABEL. Clicking row k loads row k's network.
 *   · A REFUSED CANDIDATE IS NOT SELECTABLE, and asking for one gets the
 *     refusing rule's own sentence rather than silence. It has no network; the
 *     UI may list it, and may not load it (V31).
 *   · AN EMPTY SHORTLIST LOADS NOTHING. Not the best near-miss, not the v1
 *     winner, not the seed. "No candidate meets the stated requirements" is a
 *     result, and substituting a design that failed them is how a designer
 *     comes to build one (F0/P3).
 *   · A ROW WITH NO PARTS LOADS NOTHING EITHER. This should be impossible —
 *     a refusal never becomes a row — and it is checked anyway, because an
 *     empty part list reaching `setWorkingDesign` is the precise mechanism of
 *     the bug above and a guard against it belongs where the decision is made.
 *
 * Nothing here ranks, scores, filters or re-orders. The shortlist decided
 * which designs exist and in what order; this decides only which ONE of them
 * is on screen.
 */

import type { VxpPart } from '../../parsers/vxp.ts';
import type { Shortlist, ShortlistRow } from './shortlist.ts';

/** Why nothing is loaded. Typed, because the four cases read differently. */
export type NoSelectionCause =
  /** No v2 run has delivered a shortlist yet. */
  | 'no-run'
  /** The run finished and no candidate met the requirements in force. */
  | 'nothing-feasible'
  /** The label names a candidate whose tune was refused wholesale (V31). */
  | 'refused'
  /** The label names nothing in this shortlist. */
  | 'unknown-label'
  /** The row exists and carries no parts — see the guard note above. */
  | 'empty-network';

export type Selection<T> =
  | {
      kind: 'design';
      label: string;
      parts: readonly VxpPart[];
      result: T;
      /** The row itself, so a caller can show what it loaded. */
      row: ShortlistRow<T>;
      /** Whether this is the default pick or one the designer asked for. */
      how: 'default' | 'requested';
      /** One line for the screen. */
      describe: string;
    }
  | {
      kind: 'none';
      cause: NoSelectionCause;
      /** One line for the screen — never blank, never a shrug. */
      describe: string;
    };

/**
 * Which shortlist row the Working tab should hold.
 *
 * `requested` is the label the designer clicked, or null/undefined for the
 * default pick a finished run makes on its own.
 */
export function selectFromShortlist<T>(
  shortlist: Shortlist<T> | null | undefined,
  requested?: string | null,
): Selection<T> {
  if (!shortlist) {
    return {
      kind: 'none',
      cause: 'no-run',
      describe:
        'No v2 run has delivered a shortlist, so there is nothing to load. Whatever is in the ' +
        'Working tab is what was there before.',
    };
  }

  const refused = requested
    ? shortlist.rejected.find((r) => r.label === requested)
    : undefined;
  if (refused) {
    return {
      kind: 'none',
      cause: 'refused',
      describe:
        `${refused.label} delivered no network at all: its tune was refused wholesale, and what ` +
        'came back from the tuner is a seed nobody judged against anything this candidate asked ' +
        `for (V31). It cannot be loaded. Refused by: ${refused.kinds.join(', ') || 'an unrecorded category'} — ${refused.reason}`,
    };
  }

  if (shortlist.rows.length === 0) {
    return {
      kind: 'none',
      cause: 'nothing-feasible',
      describe:
        `No candidate meets the requirements you stated: ${shortlist.feasibleCount} of ` +
        `${shortlist.consideredCount} qualified. NOTHING has been loaded, and in particular the ` +
        'v1 ranking’s best row has not been: that ranking has no knowledge of your gates, ' +
        'your requirements or a refused tune, so its winner is not a fallback for this list. ' +
        'Relax a requirement, widen the crossover window, or read the diagnosis below.',
    };
  }

  const row = requested ? shortlist.rows.find((r) => r.label === requested) : shortlist.rows[0];
  if (!row) {
    return {
      kind: 'none',
      cause: 'unknown-label',
      describe:
        `“${requested}” is not on this shortlist and is not among its refused ` +
        'candidates, so there is nothing to load under that name.',
    };
  }

  if (row.parts.length === 0) {
    return {
      kind: 'none',
      cause: 'empty-network',
      describe:
        `${row.label} is on the shortlist and carries no components. Nothing is loaded: an empty ` +
        'part list applied to the Working tab produces a tab that says "No generator" while every ' +
        'chart and badge scores the unfiltered drivers as though they were a design (F0). This ' +
        'state should not be reachable — a refused candidate never becomes a row — so treat it ' +
        'as a bug report rather than as a design decision.',
    };
  }

  const how: 'default' | 'requested' = requested ? 'requested' : 'default';
  return {
    kind: 'design',
    label: row.label,
    parts: row.parts,
    result: row.result,
    row,
    how,
    describe:
      how === 'default'
        ? `Loaded ${row.label}, the first row of the shortlist. First is the RMS deviation from ` +
          'the target curve — a view and not a verdict (A5e.1). Click any other row to load it.'
        : `Loaded ${row.label} from the shortlist.`,
  };
}
