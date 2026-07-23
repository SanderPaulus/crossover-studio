/**
 * Shared low-level parsing for REW's text exports (FRD / ZMA).
 *
 * Both formats are the same shape: a block of comment/header lines followed by
 * whitespace- or comma-separated numeric rows. REW marks comments with `*`, but
 * files that have passed through other tools use `#` or `;`, so all three are
 * accepted. Values may use `,` as a column separator *or* (rarely, from some
 * locales) as a decimal point — we disambiguate below.
 */

const COMMENT_MARKERS = ['*', '#', ';', '//'];

export interface TabularFile {
  /** Comment lines, marker stripped, whitespace-trimmed, original order. */
  comments: string[];
  /** Numeric rows, each already parsed to numbers. */
  rows: number[][];
}

function isComment(line: string): boolean {
  return COMMENT_MARKERS.some((m) => line.startsWith(m));
}

function stripCommentMarker(line: string): string {
  for (const m of COMMENT_MARKERS) {
    if (line.startsWith(m)) return line.slice(m.length).trim();
  }
  return line.trim();
}

/**
 * Split a data line into numeric fields. Handles space/tab/semicolon/comma
 * separators. A comma is treated as a decimal separator only when the line
 * contains no other plausible separator and the comma count matches a single
 * decimal per field — otherwise it is a column separator.
 */
function splitNumericLine(line: string): number[] {
  const trimmed = line.trim();

  // Decimal-comma heuristic: e.g. "20,00 75,12 -12,3" (spaces separate columns,
  // commas are decimal points). Detect by: has spaces/tabs AND every comma is
  // flanked by digits.
  const hasWhitespace = /\s/.test(trimmed);
  const commaIsDecimal = hasWhitespace && /\d,\d/.test(trimmed) && !/,\s|\s,/.test(trimmed);

  const normalised = commaIsDecimal ? trimmed.replace(/,/g, '.') : trimmed.replace(/,/g, ' ');

  return normalised
    .split(/[\s]+/)
    .filter((t) => t.length > 0)
    .map(Number);
}

export function parseTabular(text: string): TabularFile {
  const comments: string[] = [];
  const rows: number[][] = [];

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;

    if (isComment(line)) {
      comments.push(stripCommentMarker(line));
      continue;
    }

    const fields = splitNumericLine(line);
    // A valid data row is all-finite numbers. Anything else (a stray header
    // line without a comment marker) is pushed into comments instead of
    // silently corrupting the data.
    if (fields.length >= 2 && fields.every((n) => Number.isFinite(n))) {
      rows.push(fields);
    } else {
      comments.push(line);
    }
  }

  return { comments, rows };
}
