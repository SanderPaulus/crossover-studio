import { describe, expect, it } from 'vitest';
import { buildReportHtml, extractReportPayload, REPORT_PAYLOAD_ID } from './report.ts';
import { deserializeFilter, serializeFilter } from './filterFile.ts';
import type { VxpPart } from './parsers/vxp.ts';

const parts: VxpPart[] = [
  {
    type: 'Capacitor',
    partId: 'C1',
    params: [{ name: 'C', value: 6.8, unit: 'uF' }],
    wires: [
      { x: 3, y: 4 },
      { x: 9, y: 4 },
    ],
  },
];

describe('design report', () => {
  it('is a printable document AND a filter file (round-trip)', () => {
    // The whole point of the format: one artefact you can print, mail, and
    // load back. If the round-trip breaks, the report is just a picture.
    const payload = serializeFilter({ name: 'Working', parts });
    const html = buildReportHtml({
      title: 'KOAN three-way',
      savedAt: '2026-08-07',
      sections: [{ title: 'Bill of materials', rows: [{ label: 'C1', value: '6.8 µF' }] }],
      payloadJson: payload,
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@page');
    const back = deserializeFilter(html);
    expect(back.name).toBe('Working');
    expect(back.parts).toHaveLength(1);
    expect(back.parts[0].partId).toBe('C1');
  });

  it('a payload cannot break out of its script block', () => {
    // A design name containing "</script>" would otherwise end the block early
    // and leave the rest of the JSON loose in the document.
    const payload = serializeFilter({ name: 'evil </script><b>x', parts });
    const html = buildReportHtml({
      title: 't',
      savedAt: 'd',
      sections: [],
      payloadJson: payload,
    });
    const head = html.slice(0, html.indexOf(`id="${REPORT_PAYLOAD_ID}"`));
    expect(head).not.toContain('<b>x');
    expect(deserializeFilter(html).name).toBe('evil </script><b>x');
  });

  it('escapes text but passes the app’s own SVG through', () => {
    const html = buildReportHtml({
      title: 'a & b',
      savedAt: 'd',
      sections: [
        { title: '<danger>', text: ['5 > 3'], svg: '<svg><path d="M0 0"/></svg>' },
      ],
    });
    expect(html).toContain('a &amp; b');
    expect(html).toContain('&lt;danger&gt;');
    expect(html).toContain('5 &gt; 3');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
  });

  it('plain filter JSON still imports, and a non-report HTML fails clearly', () => {
    const plain = serializeFilter({ name: 'Plain', parts });
    expect(deserializeFilter(plain).name).toBe('Plain');
    expect(extractReportPayload('<html><body>no payload</body></html>')).toBeNull();
    expect(() => deserializeFilter('<html><body>no payload</body></html>')).toThrow(
      /expected JSON, or an exported design report/,
    );
  });
});
