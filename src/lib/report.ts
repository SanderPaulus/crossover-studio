/**
 * Design report: ONE design as a standalone HTML file that is three things at
 * once — a printable build document, a page you can mail to someone without
 * this app, and a file this app can read back.
 *
 * That last property is Sanders idea and it is why there is no new exchange
 * format here: the report carries the EXISTING `.adsfilter` payload verbatim
 * in a hidden `<script type="application/json">` block, so `deserializeFilter`
 * accepts the report itself. One artefact, two faces — print it, or import two
 * of them side by side to compare.
 *
 * Charts and the schematic are not redrawn here. The caller hands over the
 * SVG markup the app already rendered, so the report cannot drift from what
 * the designer was looking at when they exported it. This module owns the
 * document: structure, print rules, escaping, and the embedded payload.
 */

export const REPORT_PAYLOAD_ID = 'ads-filter-payload';

export interface ReportRow {
  label: string;
  value: string;
  /** Optional third column — units, part numbers, prices. */
  note?: string;
}

export interface ReportSection {
  title: string;
  /** Rendered SVG markup (already themed for print by the caller). */
  svg?: string;
  rows?: ReportRow[];
  /** Free text under the heading — one paragraph per entry. */
  text?: string[];
  /** Colour key under a chart (the app's legend is a DOM element, not part of
   *  the SVG, so it is handed over as data). */
  legend?: { label: string; color: string }[];
  /** Start this section on a fresh sheet when printing. */
  pageBreak?: boolean;
}

export interface ReportInput {
  title: string;
  subtitle?: string;
  /** ISO date string; the caller owns the clock (lib code stays pure). */
  savedAt: string;
  sections: ReportSection[];
  /** `.adsfilter` JSON, embedded verbatim so the report can be imported. */
  payloadJson?: string;
  /** Resolved CSS custom properties for the captured SVGs ("--viz-grid:#e5e7eb;…").
   *  The app's charts style themselves through these, so the report reproduces
   *  them rather than re-implementing the palette — and the caller resolves
   *  them in the LIGHT theme, because paper is white. */
  cssVars?: string;
}

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A JSON payload inside <script> must not be able to close its own tag. */
const escPayload = (s: string): string => s.replace(/<\//g, '<\\/');

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 24px; max-width: 900px;
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #17181c; background: #fff;
}
h1 { font-size: 1.6rem; margin: 0 0 2px; }
h2 { font-size: 1.05rem; margin: 28px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d8dae0; }
.sub { color: #5b6069; margin: 0 0 4px; }
.stamp { color: #80858e; font-size: 0.82rem; margin: 0 0 8px; }
p { margin: 6px 0; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 2px; font-size: 0.9rem; }
th, td { text-align: left; padding: 4px 8px 4px 0; vertical-align: top; }
th { font-weight: 600; color: #5b6069; border-bottom: 1px solid #d8dae0; }
tr + tr td { border-top: 1px solid #eef0f3; }
td.v { font-variant-numeric: tabular-nums; white-space: nowrap; }
td.n { color: #5b6069; }
figure { margin: 8px 0 0; }
svg { max-width: 100%; height: auto; }
/* The captured chart markup styles itself through these classes (they live in
   the app's stylesheet); reproduced here so a standalone file looks the same. */
.chart .grid { stroke: var(--viz-grid); stroke-width: 1; }
.chart .refline { stroke: var(--viz-axis); stroke-width: 1.5; }
.chart .tick {
  fill: var(--viz-tick); font-size: 11px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-variant-numeric: tabular-nums;
}
.chart .unit { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
.chart .crosshair, .chart .chart-handle, .chart .hover-dot { display: none; }
/* The schematic styles itself the same way. Without these it exports as a
   blank rectangle — every stroke lives in a class, not on the element. */
.sch-wire { stroke: #17181c; stroke-width: 1.4; fill: none; opacity: 0.75; }
.sch-symbol line, .sch-symbol path, .sch-symbol rect, .sch-symbol circle {
  stroke: #17181c; stroke-width: 1.6;
}
.sch-junction { fill: #17181c; }
.sch-grid-dot { fill: #e3e6ea; }
.sch-hit { fill: none; }
.sch-label text {
  fill: #5b6069; font-size: 10px; font-family: system-ui, sans-serif;
}
.sch-label .sch-value { fill: #17181c; font-variant-numeric: tabular-nums; }
.sch-cursor, .sch-wire-preview { display: none; }
.legend { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 4px 0 0;
  font-size: 0.78rem; color: #5b6069; }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
footer { margin-top: 32px; padding-top: 8px; border-top: 1px solid #d8dae0;
  color: #80858e; font-size: 0.78rem; }
@media print {
  /* A page break INSIDE a chart or a table row makes the document unreadable,
     and a heading stranded at the foot of a sheet is worse than a short page. */
  @page { size: A4; margin: 14mm; }
  body { padding: 0; max-width: none; font-size: 11px; }
  h2 { break-after: avoid; }
  figure, tr { break-inside: avoid; }
  .break { break-before: page; }
  footer { break-inside: avoid; }
}
`;

function renderRows(rows: readonly ReportRow[]): string {
  const anyNote = rows.some((r) => r.note !== undefined);
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.label)}</td><td class="v">${esc(r.value)}</td>` +
        (anyNote ? `<td class="n">${esc(r.note ?? '')}</td>` : '') +
        `</tr>`,
    )
    .join('\n');
  return `<table><tbody>\n${body}\n</tbody></table>`;
}

export function buildReportHtml(input: ReportInput): string {
  const body = input.sections
    .map((s) => {
      const parts: string[] = [
        `<h2${s.pageBreak ? ' class="break"' : ''}>${esc(s.title)}</h2>`,
      ];
      for (const t of s.text ?? []) parts.push(`<p>${esc(t)}</p>`);
      if (s.rows && s.rows.length > 0) parts.push(renderRows(s.rows));
      // SVG markup is passed through UNESCAPED on purpose — it is the app's
      // own rendered output, not user text. Wrapped in .chart so the class
      // rules above apply exactly as they do in the app.
      if (s.svg) parts.push(`<figure class="chart">${s.svg}</figure>`);
      if (s.legend && s.legend.length > 0) {
        parts.push(
          `<p class="legend">` +
            s.legend
              .map(
                (l) =>
                  `<span><i style="background:${esc(l.color)}"></i>${esc(l.label)}</span>`,
              )
              .join('') +
            `</p>`,
        );
      }
      return parts.join('\n');
    })
    .join('\n\n');

  const payload = input.payloadJson
    ? `\n<script type="application/json" id="${REPORT_PAYLOAD_ID}">\n${escPayload(
        input.payloadJson,
      )}\n</script>\n`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.title)}</title>
<style>${CSS}${input.cssVars ? `\n:root { ${input.cssVars} }\n` : ''}</style>
</head>
<body>
<h1>${esc(input.title)}</h1>
${input.subtitle ? `<p class="sub">${esc(input.subtitle)}</p>` : ''}
<p class="stamp">${esc(input.savedAt)} — SD Acoustics Crossover Studio</p>

${body}

<footer>Generated by SD Acoustics Crossover Studio. This file is also a filter
file: import it back into the app to load this design.</footer>
${payload}</body>
</html>
`;
}

/**
 * Pull the embedded `.adsfilter` payload out of a report. Returns null when the
 * text is not a report — the caller then treats it as plain JSON, so one import
 * button accepts both shapes.
 */
export function extractReportPayload(text: string): string | null {
  const open = new RegExp(
    `<script[^>]*id=["']${REPORT_PAYLOAD_ID}["'][^>]*>`,
    'i',
  ).exec(text);
  if (!open) return null;
  const from = open.index + open[0].length;
  const end = text.indexOf('</script>', from);
  if (end < 0) return null;
  return text.slice(from, end).replace(/<\\\//g, '</').trim();
}
