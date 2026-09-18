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

/* ==================================================================== *
 * H-2b — THE HANDOVER LIST: a second grammar, and why it is not the first
 * ==================================================================== */

/**
 * H-2b — ONE LINE OF HANDOVERS TO AN ACTIVE SIDE, under the grammar the
 * designer was promised.
 *
 * WHY THIS IS A SECOND FUNCTION AND NOT A FLAG ON THE FIRST. The two lists a
 * designer can type in this app mean their punctuation DIFFERENTLY, by
 * statement and not by accident:
 *
 *   · U-5's stated crossings: a COMMA separates values and a SEMICOLON (or a
 *     newline) separates AXES — "400, 450; 2200, 2400" is two handovers of a
 *     three-way (`statedCrossings.ts`, pinned by its own tests).
 *   · H-2b's handover list: a COMMA is a DECIMAL comma ("362,3" is 362.3 Hz,
 *     which is how Sander writes it), a SEMICOLON or a SPACE separates values,
 *     and a comma that cannot be a decimal comma is REFUSED with an
 *     explanation rather than read as a separator.
 *
 * A comma cannot be a value separator in one field and a decimal mark in the
 * other through one function, and a flag that swaps the meaning of a
 * character is the "one function wearing two names" the header above warns
 * about. So this is its own reader, with the U-5 rules it does share — split
 * on separators, validate the WHOLE token, report what could not be used and
 * use it for nothing (A3h) — written out rather than borrowed.
 *
 * The one thing this grammar does NOT do is guess. "362,3, 400" could mean
 * two values with a stray comma or a decimal comma with a separator after it;
 * it is refused, and the message says how to write what was probably meant.
 */
export interface ParsedHandoverList extends ParsedFrequencyList {
  /** Every token that was refused for being AMBIGUOUS about its comma. */
  ambiguous: string[];
}

/** A whole token that is one frequency: digits, optionally one decimal mark and digits. */
const HANDOVER_TOKEN = /^\d+(?:[.,]\d+)?$/;

export function parseHandoverList(line: string, label: string): ParsedHandoverList {
  const hz: number[] = [];
  const problems: string[] = [];
  const ambiguous: string[] = [];
  for (const tok of line.split(/[\s;]+/)) {
    if (tok === '') continue;
    if (HANDOVER_TOKEN.test(tok)) {
      const v = Number(tok.replace(',', '.'));
      if (Number.isFinite(v) && v > 0) {
        hz.push(v);
        continue;
      }
      problems.push(`${label}: “${tok}” is not a positive frequency and was ignored.`);
      continue;
    }
    if (tok.includes(',')) {
      ambiguous.push(tok);
      problems.push(
        `${label}: “${tok}” is ambiguous and was ignored — a comma is read as a DECIMAL comma here ` +
          '(362,3 is 362.3 Hz), so a comma between two frequencies cannot be told from one inside a ' +
          'frequency. Separate frequencies with a semicolon or a space: “362,3; 400” or “362,3 400”.',
      );
      continue;
    }
    problems.push(`${label}: “${tok}” is not a positive frequency and was ignored.`);
  }
  return { hz, problems, ambiguous };
}
