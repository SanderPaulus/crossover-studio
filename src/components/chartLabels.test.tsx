/**
 * I-4 UI — band and marker labels in a Chart no longer overprint (Sander's screenshot, 14-11-2026:
 * "window (proposed)" over "Tukey flank" in the ETC, "knee" over "proposed end" in the residual
 * check). Each label takes the first row where it does not overlap an earlier one; row 0 is where
 * every label used to sit, so a lone label or labels far apart render exactly as before. The Chart
 * itself reads a browser store and cannot be server-rendered, so the placement is a pure function
 * with its own claims, and a source scan pins that both label kinds read it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { labelRows, LABEL_ROW_PX } from './Chart.tsx';

describe('I-4 UI — chart labels take the first free row', () => {
  it('two labels that start near each other go to rows 0 and 1; a third far to the right returns to row 0', () => {
    expect(labelRows([{ x: 100, label: 'window (proposed)' }, { x: 110, label: 'Tukey flank' }, { x: 600, label: 'knee' }])).toEqual([0, 1, 0]);
  });
  it('three labels on one spot take three rows; the fourth, past the first, takes row 0 again', () => {
    expect(labelRows([{ x: 10, label: 'aaaa' }, { x: 12, label: 'bbbb' }, { x: 14, label: 'cccc' }, { x: 60, label: 'd' }])).toEqual([0, 1, 2, 0]);
  });
  it('a label without text takes no room; labels far apart all stay on row 0 (the old rendering)', () => {
    expect(labelRows([{ x: 100 }, { x: 102, label: 'a' }])).toEqual([0, 0]);
    expect(labelRows([{ x: 100, label: 'knee' }, { x: 400, label: 'proposed end' }])).toEqual([0, 0]);
    expect(LABEL_ROW_PX).toBeGreaterThan(0);
  });
  it('the Chart reads the rows for band labels (down from the top) and marker labels (up from the bottom)', () => {
    const src = readFileSync(new URL('./Chart.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/y=\{PAD\.t \+ 12 \+ LABEL_ROW_PX \* rows\[i\]\}/);
    expect(src).toMatch(/y=\{H - PAD\.b - 6 - LABEL_ROW_PX \* rows\[i\]\}/);
    expect(src.match(/labelRows\(/g)?.length).toBe(3); // the definition and the two readers
  });
});
