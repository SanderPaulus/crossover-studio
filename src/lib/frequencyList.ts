/**
 * H-2 — A LIST OF FREQUENCIES THE DESIGNER TYPED, PARSED ONCE.
 *
 * WHY THIS FILE EXISTS. U-5 wrote a parse for the crossings a designer states
 * (`predesign/statedCrossings.ts`) and paid for getting it wrong first: an
 * earlier version pulled the DIGITS out of whatever was typed, which turned
 * "-5" into 5 and "2200Hz" into 2200 — the right KIND of number, invented out
 * of something the designer did not write (A3h). The rule that replaced it is
 * three lines long and it is the rule: split on separators, validate the WHOLE
 * token, report what could not be used and use it for nothing.
 *
 * H-2 needs the same list one field further — the handovers to an active side —
 * and a second copy of a rule this project has already paid to learn is exactly
 * the drift A3g names. So the loop lives here, with two readers.
 *
 * WHAT IS *NOT* HERE, and it is the one place the two callers differ: U-5 rounds
 * each crossing to a printable edge (`roundEdge`), because a crossing is a
 * POSITION in a field that is laid out, labelled and cageed in octaves. An
 * active handover is not laid out by anything — it is a number the designer
 * states and a processor is set to — so it travels VERBATIM. The rounding
 * therefore stays at U-5's call site rather than becoming a flag here: a
 * parameter that says "and also change the answer" is how one function becomes
 * two functions wearing one name.
 *
 * IT LIVES IN `src/lib/` for the reason `impedanceFloor.ts`, `phaseAdmission.ts`,
 * `targetLevel.ts` and `rippleTargetBand.ts` do: the app's own form layer has to
 * read it and nothing outside the UI entry points may import `engine2/`, while
 * `engine2/` may import from here.
 */

/** What one line of typed frequencies yielded, and what it could not use. */
export interface ParsedFrequencyList {
  /** The positive frequencies, in the order they were typed. Verbatim. */
  hz: number[];
  /** One sentence per token that was not a positive frequency. */
  problems: string[];
}

/**
 * Parse one line of frequencies, separated by spaces or commas.
 *
 * `label` names the thing the line belongs to and appears in every problem, so
 * a designer with two lines on screen can tell which one the message is about.
 *
 * Nothing is rounded, nothing is sorted and nothing is de-duplicated: those are
 * decisions about what a list MEANS, and they belong to whoever asked for it.
 */
export function parseFrequencyTokens(line: string, label: string): ParsedFrequencyList {
  const hz: number[] = [];
  const problems: string[] = [];
  for (const tok of line.split(/[\s,]+/)) {
    if (tok === '') continue;
    const v = Number(tok);
    if (!Number.isFinite(v) || v <= 0) {
      problems.push(`${label}: “${tok}” is not a positive frequency and was ignored.`);
      continue;
    }
    hz.push(v);
  }
  return { hz, problems };
}
