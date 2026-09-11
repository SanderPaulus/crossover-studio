/**
 * U-6 — THE GUARD AGAINST THE SLIDE BACK.
 *
 * The result area did not become unreadable in one commit. Every session from
 * F2b onward added one honest paragraph above the shortlist — a stamp, a field
 * mode, a ladder sentence, a skipped-requirement line, a Pareto plot, a second
 * ranking with its own caption — and each of them was right to exist. What
 * nobody owned was the ORDER, so the answer to "which design, and what does it
 * look like" drifted to seventh and twelfth place on the page.
 *
 * This file owns it. `v2ResultLayout.ts` says where each block goes and why;
 * these claims scan `App.tsx` and fail when a block moves out of the region its
 * placement names, when the strip above the table grows a sentence, when a fold
 * opens itself, or when something that reports a FAILURE gets folded away. The
 * count in the third group is the U-3b trick one layer downstream: a new result
 * block dropped in above the table cannot arrive without a placement decision,
 * because the arithmetic stops adding up.
 *
 * Nothing here judges a sentence. Every word the app printed before U-6 it
 * still prints; this is about where.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V2_RESULT_BLOCKS,
  V2_RESULT_MARKERS,
  V2_REGION_START,
  V2_REGION_END,
  V2_DISCLOSURE_KEYS,
  blocksAt,
  groupShortlistRows,
  statusTitle,
  readDisclosure,
  writeDisclosure,
  type V2ResultPlacement,
} from './v2ResultLayout.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');
const LAYOUT = readFileSync(join(HERE, 'v2ResultLayout.ts'), 'utf-8');

/**
 * The result area: the Network tab's panel, which is where a finished run
 * lands (`setDesignTab('network')`), up to the guided step-forward button that
 * follows the whole design pane.
 */
const AREA_START = "{designTab === 'network' && result && (";
const AREA_END = "{uiMode === 'guided' &&\n              designTab !== 'network' &&";

function resultArea(): string {
  const a = APP.indexOf(AREA_START);
  const b = APP.indexOf(AREA_END, a);
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  return APP.slice(a, b);
}

const AREA = resultArea();

/** Where a marker sits in the area. Fails loudly rather than returning −1. */
function markerAt(marker: string): number {
  const at = AREA.indexOf(marker);
  expect(at, `marker ${marker} is missing from the result area`).toBeGreaterThan(-1);
  return at;
}

/** The source of one region, by the placement that names it. */
function region(placement: V2ResultPlacement): string {
  const start = V2_REGION_START[placement];
  const from = start === null ? 0 : markerAt(start);
  const to = markerAt(V2_REGION_END[placement]);
  return AREA.slice(from, to);
}

/** Comments carry prose that looks like markup; they are not blocks. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Text-bearing JSX openings — what a "free text block" is made of. */
function textBlockCount(src: string): number {
  return (stripComments(src).match(/<(?:p|ul|li|details|h5|h6)[\s>]/g) ?? []).length;
}

const occurrences = (hay: string, needle: string): number => hay.split(needle).length - 1;

/* ==================================================================== *
 * 1. THE ORDER ITSELF
 * ==================================================================== */

describe('the result area is ordered shortlist → network → accountability', () => {
  it('carries every marker exactly once, in the declared order', () => {
    const seen = V2_RESULT_MARKERS.map((m) => {
      expect(occurrences(APP, m), `marker ${m}`).toBe(1);
      return markerAt(m);
    });
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i], `${V2_RESULT_MARKERS[i]} must follow ${V2_RESULT_MARKERS[i - 1]}`).toBeGreaterThan(
        seen[i - 1],
      );
    }
  });

  it('puts the shortlist TABLE above the network, and the network above the fold', () => {
    /* The whole sentence of this session, as three indices: the table the run
       delivered, then the design it chose, then everything that accounts for
       it. Before U-6 the schematic sat below the tune audits, the compare
       table and the design tabs, and the table sat below six paragraphs. */
    expect(markerAt('U-6 RESULT · TABLE')).toBeLessThan(markerAt('U-6 RESULT · NETWORK'));
    expect(AREA.indexOf('<SchematicEditor')).toBeGreaterThan(markerAt('U-6 RESULT · NETWORK'));
    expect(AREA.indexOf('<SchematicEditor')).toBeLessThan(markerAt('U-6 RESULT · ABOUT'));
  });

  it('files every block in the region its placement names, once', () => {
    for (const b of V2_RESULT_BLOCKS) {
      /* Unique WITHIN the result area, not within the file: two panels may
         legitimately print the same line (the "Charts show:" note stands on
         the Filters tab as well), and what this guard owns is the order here. */
      expect(occurrences(AREA, b.token), `${b.id}: token must occur exactly once`).toBe(1);
      const reg = region(b.placement);
      expect(reg.includes(b.token), `${b.id} is not in its region (${b.placement})`).toBe(true);
    }
  });

  it('leaves no id and no token duplicated in the inventory', () => {
    expect(new Set(V2_RESULT_BLOCKS.map((b) => b.id)).size).toBe(V2_RESULT_BLOCKS.length);
    expect(new Set(V2_RESULT_BLOCKS.map((b) => b.token)).size).toBe(V2_RESULT_BLOCKS.length);
    for (const b of V2_RESULT_BLOCKS) {
      expect(b.what.length, `${b.id} must say what it is`).toBeGreaterThan(10);
      expect(b.why.length, `${b.id} must say why it sits there`).toBeGreaterThan(10);
      expect(b.when.length, `${b.id} must say when it appears`).toBeGreaterThan(5);
    }
  });
});

/* ==================================================================== *
 * 2. A BLOCKADE NEVER FOLDS
 * ==================================================================== */

describe('problems stay visible; accountability folds', () => {
  it('keeps every blockade out of both folds', () => {
    const aboutFrom = markerAt('U-6 RESULT · ABOUT');
    for (const b of V2_RESULT_BLOCKS.filter((x) => x.blockade)) {
      expect(AREA.indexOf(b.token), `${b.id} may not live inside "About this run"`).toBeLessThan(
        aboutFrom,
      );
    }
  });

  it('opens both folds CLOSED, and the minimiser no longer opens itself', () => {
    const about = AREA.slice(AREA.indexOf('<details'), AREA.length);
    expect(about).toBeTruthy();
    // The two folds carry a controlled `open`, never a literal one.
    expect(AREA).toContain('className="v2-about"');
    expect(AREA).toContain('open={aboutRunOpen}');
    expect(AREA).toContain('open={refusedOpen}');
    expect(AREA).not.toContain('<details className="v2-about" open>');
    expect(AREA).not.toContain('<details className="shortlist-refused" open>');
    // U-6 — it used to open itself over the result of a run it knows nothing
    // about; it is an audit of the drawing and folds like the others.
    expect(AREA).not.toContain('<details className="tune-audit" open>');
    expect(AREA).toContain('<details className="tune-audit">');
  });

  it('guards the two blocks above the shortlist on the absence of one', () => {
    /* They are the only things allowed before the shortlist, and the reason is
       structural rather than a promise: neither can be on screen together with
       a shortlist. Read the guards, do not take the inventory's word for it. */
    expect(AREA).toContain('{chainScan && !v2Shortlist && (');
    expect(AREA).toContain('{rescued && !chainScan && !vfBusy && (');
    for (const b of blocksAt('top')) {
      expect(AREA.indexOf(b.token)).toBeLessThan(markerAt('U-6 RESULT · SHORTLIST'));
    }
  });
});

/* ==================================================================== *
 * 3. THE STRIP ABOVE THE TABLE STAYS CLEAN
 * ==================================================================== */

describe('nothing stands between the badge row and the table', () => {
  it('counts exactly the text blocks the inventory declares, and no more', () => {
    for (const placement of ['top', 'shortlist-head'] as const) {
      const declared = blocksAt(placement).reduce((a, b) => a + (b.elements ?? 0), 0);
      expect(
        textBlockCount(region(placement)),
        `${placement}: a text block arrived here without a placement decision — ` +
          'file it in V2_RESULT_BLOCKS with a reason, or move it into "About this run"',
      ).toBe(declared);
    }
  });

  it('declares an element count for every block in those two regions', () => {
    for (const placement of ['top', 'shortlist-head'] as const) {
      for (const b of blocksAt(placement)) {
        expect(typeof b.elements, `${b.id} must declare how many text blocks it contributes`).toBe(
          'number',
        );
      }
    }
  });

  it('actually counts — the counter is not blind', () => {
    /* Without this, "the strip is clean" and "the scan found nothing" read the
       same. Both halves: it sees blocks, and it does not see comments. */
    expect(textBlockCount('<div><p className="x">hi</p><ul><li>a</li></ul></div>')).toBe(3);
    expect(textBlockCount('{/* a <p> in prose, and a <li> too */}')).toBe(0);
    expect(textBlockCount('<span>nothing here</span>')).toBe(0);
    // …and the region helper really returns a slice of this file's subject.
    expect(region('shortlist-head')).toContain("{t('Shortlist')}");
    expect(region('shortlist-head')).not.toContain('<SchematicEditor');
  });
});

/* ==================================================================== *
 * 4. THE FOLDS REMEMBER THEMSELVES, FOR A SESSION
 * ==================================================================== */

describe('the open/closed choice lasts a session and no longer', () => {
  it('is a sessionStorage choice, never a browser-wide one', () => {
    expect(LAYOUT).toContain('sessionStorage.getItem');
    expect(LAYOUT).toContain('sessionStorage.setItem');
    expect(LAYOUT).not.toContain('localStorage');
  });

  it('is wired to both folds in the app, by key', () => {
    expect(APP).toContain('readDisclosure(V2_DISCLOSURE_KEYS.about)');
    expect(APP).toContain('readDisclosure(V2_DISCLOSURE_KEYS.refused)');
    expect(APP).toContain('writeDisclosure(V2_DISCLOSURE_KEYS.about, open)');
    expect(APP).toContain('writeDisclosure(V2_DISCLOSURE_KEYS.refused, open)');
  });

  it('reads closed when the store is absent or empty, and survives a throw', () => {
    // Node has no sessionStorage: the read must answer "closed", not explode.
    expect(readDisclosure(V2_DISCLOSURE_KEYS.about)).toBe(false);
    expect(() => writeDisclosure(V2_DISCLOSURE_KEYS.about, true)).not.toThrow();
    expect(new Set(Object.values(V2_DISCLOSURE_KEYS)).size).toBe(
      Object.keys(V2_DISCLOSURE_KEYS).length,
    );
  });
});

/* ==================================================================== *
 * 5. U-5b IN THE TABLE: A READING, NEVER A THINNING
 * ==================================================================== */

describe('the table folds identical stated answers into one row', () => {
  const row = (label: string) => ({ label });
  const stated = (label: string, sameNetworkAs: string | null = null) => ({
    label,
    sameNetworkAs,
  });

  it('leaves a field with nothing stated exactly as it was', () => {
    const rows = [row('A'), row('B'), row('C')];
    const view = groupShortlistRows(rows, []);
    expect(view.map((v) => v.row.label)).toEqual(['A', 'B', 'C']);
    expect(view.every((v) => v.status === 'delivered')).toBe(true);
    expect(view.every((v) => v.sameCount === 1)).toBe(true);
  });

  it('marks a stated row as stated, and never a derived one', () => {
    const view = groupShortlistRows([row('A'), row('B')], [stated('B')]);
    expect(view.map((v) => v.status)).toEqual(['delivered', 'stated']);
  });

  it('folds the twins into the host and counts them, host first', () => {
    const rows = [row('2200'), row('2300'), row('2400'), row('2500')];
    const view = groupShortlistRows(rows, [
      stated('2200'),
      stated('2300', '2200'),
      stated('2400', '2200'),
      stated('2500'),
    ]);
    expect(view.map((v) => v.row.label)).toEqual(['2200', '2500']);
    expect(view[0].sameCount).toBe(3);
    expect(view[0].sameLabels).toEqual(['2300', '2400']);
    expect(view[1].sameCount).toBe(1);
  });

  it('folds nothing into a host that is not itself a row', () => {
    /* The twin of a design that never qualified is still an answer of its own,
       and hiding it would remove the only place it is printed. */
    const view = groupShortlistRows([row('2300')], [stated('2200'), stated('2300', '2200')]);
    expect(view.map((v) => v.row.label)).toEqual(['2300']);
    expect(view[0].sameCount).toBe(1);
  });

  it('names the folded labels in the tooltip, and stays quiet with one', () => {
    const view = groupShortlistRows(
      [row('2200'), row('2300')],
      [stated('2200'), stated('2300', '2200')],
    );
    expect(statusTitle(view[0])).toContain('2300');
    expect(statusTitle(view[0])).toContain('About this run');
    const lone = groupShortlistRows([row('A')], []);
    expect(statusTitle(lone[0])).not.toContain('folded');
  });

  it('is what the table renders, and the table shows one status word per row', () => {
    const table = region('table');
    expect(table).toContain('groupShortlistRows(v2Shortlist.rows, v2Shortlist.stated)');
    expect(table).toContain('title={statusTitle(g)}');
    expect(table).toContain("{g.status === 'stated' ? t('stated') : t('delivered')}");
    expect(table).toContain("{t('×{n} identical', { n: String(g.sameCount) })}");
    /* Every stated entry keeps its own full entry, so the fold above loses
       nothing: U-5's section is in the drawer, with its load button (U-5). */
    expect(region('about')).toContain('className="shortlist-stated"');
    expect(region('about')).toContain('loadShortlistRow(e.label)');
  });
});
