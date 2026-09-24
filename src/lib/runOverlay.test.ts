import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CROSSING_MARK,
  LABEL_SEPARATOR,
  RUN_OVERLAY_CLASS,
  RUN_OVERLAY_MARKERS,
  RUN_OVERLAY_REGION,
  splitScanLabel,
} from './runOverlay.ts';
import { polarityLabel } from './engine2/predesign/polarityArms.ts';
import { hybridLabel } from './v2ActiveSide.ts';

/**
 * U-8 — THE RUN OVERLAY FITS, AND NOTHING OF IT IS LOST.
 *
 * Three groups, and the first is the one that carries the session: the label
 * split must be LOSSLESS on labels this project actually recorded, not on ones
 * written here. `casus1_m5_lr2.json` holds twenty-four of them from the M-5
 * run, each with the crossings it was built from, so the split can be checked
 * against the recorded count rather than against a second parse of my own.
 *
 * The other two are source scans, the idiom this app uses wherever a claim is
 * about what the page LAYS OUT rather than what a function returns (UI-1): a
 * unit test cannot say that the totals line sits outside the scroller, and
 * that — not the CSS property by itself — is what keeps it on screen.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CSS = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');

interface M5Row {
  label: string;
  kruispunten: { hz: number; uitlijning: string }[];
  arm: string;
  omgepoold: string[];
}
const M5: { veld: M5Row[] } = JSON.parse(
  readFileSync(join(ROOT, 'test-fixtures', 'casus1_m5_lr2.json'), 'utf8'),
);
const H4B: { labels_verkenning: string[] } = JSON.parse(
  readFileSync(join(ROOT, 'test-fixtures', 'demo_h4b_armen.json'), 'utf8'),
);

/** Every label this casebook has on record, from both recordings. */
const RECORDED: string[] = [...M5.veld.map((r) => r.label), ...H4B.labels_verkenning];

/**
 * The DECLARATIONS of one CSS rule, comments stripped.
 *
 * Stripped because the first deliberate break of this guard sailed straight
 * through it: the comment above `min-height: 0` explains why the declaration
 * is there and NAMES it, so deleting the declaration left the scan matching
 * the explanation of the thing that was gone. The same discipline
 * `noWeights.test.ts` applies for the same reason — a scan is about code.
 */
function rule(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  expect(at, `no rule for "${selector}"`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

/* ------------------------------------------------------------------ *
 * 1 — the split, on labels that were recorded and not invented
 * ------------------------------------------------------------------ */

describe('U-8 — the scan label splits without losing a character', () => {
  it('has labels on record to split at all', () => {
    // Without this the whole group is vacuous: a loop over nothing passes.
    expect(RECORDED.length).toBeGreaterThan(20);
    expect(RECORDED.some((l) => l.includes('⌀'))).toBe(true);
    expect(RECORDED.some((l) => l.includes(' · stated · '))).toBe(true);
  });

  it.each(RECORDED)('rejoins to the input byte for byte: %s', (label) => {
    const parts = splitScanLabel(label);
    expect([parts.position, ...parts.marks].join(LABEL_SEPARATOR)).toBe(label);
  });

  it('puts every crossing in the position and none in a mark', () => {
    for (const label of RECORDED) {
      const parts = splitScanLabel(label);
      expect(parts.position).toContain(CROSSING_MARK);
      for (const m of parts.marks) expect(m).not.toContain(CROSSING_MARK);
    }
  });

  it('finds exactly the crossings the M-5 run recorded beside each label', () => {
    // The falsifiable half: the recording says how many crossings the label
    // was built from, so the split is checked against the run and not against
    // a second reading of the same string.
    for (const row of M5.veld) {
      const parts = splitScanLabel(row.label);
      expect(parts.position.split(LABEL_SEPARATOR)).toHaveLength(row.kruispunten.length);
      for (const x of row.kruispunten) {
        expect(parts.position).toContain(`${x.hz} ${x.uitlijning}`);
      }
    }
  });

  it('files the polarity words as marks, in the order the label carries them', () => {
    const row = M5.veld.find((r) => r.arm === 'textbook' && r.omgepoold.length === 2);
    expect(row, 'the M-5 recording has a textbook arm that reverses two ways').toBeTruthy();
    const parts = splitScanLabel(row!.label);
    expect(parts.marks).toEqual(['stated', 'mid ⌀ + tweeter ⌀', 'textbook']);
  });

  it('splits the LONGEST form this app can build — every suffix at once', () => {
    // Built by the ENGINE'S OWN builders on a RECORDED label, never typed
    // here: a hand-written "longest label" is a guess about what the app
    // emits, and the two drift on the first session that appends a word.
    const row = M5.veld.find((r) => r.arm === 'textbook' && r.omgepoold.length === 2)!;
    const bare = polarityLabel(row.omgepoold, 'textbook');
    // M-5 recorded before H-5 gave the textbook arm its reason, so the
    // recorded suffix must still be what the builder produces with no reason.
    expect(row.label).toContain(bare);
    const withWhy = row.label.replace(bare, polarityLabel(row.omgepoold, 'textbook', ['LR2']));
    const longest = hybridLabel(withWhy, 362.3);

    const parts = splitScanLabel(longest);
    expect([parts.position, ...parts.marks].join(LABEL_SEPARATOR)).toBe(longest);
    expect(parts.position).toBe('woofer→mid 253 LR2 · mid→tweeter 2251.4 LR4');
    expect(parts.marks).toEqual([
      'stated',
      'mid ⌀ + tweeter ⌀',
      'textbook for LR2',
      'active 362.3 Hz',
    ]);
  });
});

describe('U-8 — what the split declines to do', () => {
  it('leaves a label with no crossing whole', () => {
    // A component-tune stage name goes through the same renderer.
    for (const stage of ['value tune', 'part audit (seed)', 'snap', 'debris sweep']) {
      expect(splitScanLabel(stage)).toEqual({ position: stage, marks: [] });
    }
    expect(splitScanLabel('')).toEqual({ position: '', marks: [] });
  });

  it('leaves a label whole when splitting it would reorder it', () => {
    // No builder emits a crossing after a mark today. If one ever does,
    // hoisting it would move a word the designer reads — so the label comes
    // back untouched instead.
    const outOfOrder = `stated${LABEL_SEPARATOR}woofer→mid 253 LR2`;
    expect(splitScanLabel(outOfOrder)).toEqual({ position: outOfOrder, marks: [] });
    // The tegenproef: the same two segments the right way round DO split.
    const inOrder = `woofer→mid 253 LR2${LABEL_SEPARATOR}stated`;
    expect(splitScanLabel(inOrder)).toEqual({
      position: 'woofer→mid 253 LR2',
      marks: ['stated'],
    });
  });
});

/* ------------------------------------------------------------------ *
 * 2 — the card fits the viewport, and the head and foot never scroll
 * ------------------------------------------------------------------ */

describe('U-8 — the CSS that makes all of it fit', () => {
  it('caps the card at the viewport and scrolls the rows, not the card', () => {
    const card = rule('.busy-card.run-card');
    expect(card).toMatch(/max-height:\s*calc\(100dvh/);
    expect(card).toMatch(/max-height:\s*calc\(100vh/); // fallback first
    expect(card).toMatch(/overflow:\s*hidden/);
    const scroll = rule(`.run-card .${RUN_OVERLAY_REGION.scroll}`);
    expect(scroll).toMatch(/overflow-y:\s*auto/);
    // Without this a flex item refuses to shrink below its content and the
    // card grows past its own cap — the same clipping in a new place.
    expect(scroll).toMatch(/min-height:\s*0/);
    expect(scroll).toMatch(/flex:\s*1 1 auto/);
  });

  it('keeps the head and the foot out of the scroller and unshrinkable', () => {
    const headFoot = rule(
      `.run-card .${RUN_OVERLAY_REGION.head},\n.run-card .${RUN_OVERLAY_REGION.foot}`,
    );
    expect(headFoot).toMatch(/flex:\s*0 0 auto/);
  });

  it('CAPS the height and never sets one — two rows get a two-row card', () => {
    // The other half of the fix, and the one a cap alone does not give: the
    // card is content-sized under the cap, so a short list is a short card
    // instead of a stretched one with a hole in it.
    // MEASURED in the browser (24-09-2026, 720 px viewport): 16 rows → 688 px
    // with the rows scrolling; the same card with 2 rows → 289 px, no
    // scrollbar, the foot flush under the last row.
    const card = rule('.busy-card.run-card');
    expect(card).not.toMatch(/(^|;|\s)height:/);
    expect(card).not.toMatch(/min-height:/);
  });

  it('is the top layer: nothing in the stylesheet sits above it', () => {
    const zs = [...CSS.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));
    const overlay = Number(/z-index:\s*(\d+)/.exec(rule(`.busy-overlay.${RUN_OVERLAY_CLASS.overlay}`))![1]);
    expect(zs.length).toBeGreaterThan(4);
    expect(Math.max(...zs)).toBe(overlay);
    // Strictly above the modal tier, which is the case it was raised for: a
    // run started with a base-ui popup open would otherwise render under it.
    expect(zs.filter((z) => z === overlay)).toHaveLength(1);
    expect(overlay).toBeGreaterThan(Number(/z-index:\s*(\d+)/.exec(rule('.modal-card'))![1]));
  });

  it('fits a narrow viewport: the card is capped in vw and the label wraps', () => {
    expect(rule('.busy-card')).toMatch(/width:\s*min\([^)]*94vw\)/);
    // The row padding shrinks with the viewport instead of eating a phone.
    expect(rule(`.run-card .${RUN_OVERLAY_REGION.scroll}`)).toMatch(/padding:\s*0 clamp\(/);
    // A label is never ellipsed and never abbreviated — it names the ways a
    // builder solders reversed.
    expect(rule('.busy-scan td:first-child')).toMatch(/white-space:\s*normal/);
    expect(rule('.busy-scan td:first-child')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule('.scan-mark')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

/* ------------------------------------------------------------------ *
 * 3 — the app puts each block in the region that keeps it on screen
 * ------------------------------------------------------------------ */

/** The source between marker n and the next one. */
function region(n: number): string {
  const from = APP.indexOf(RUN_OVERLAY_MARKERS[n]);
  const to = APP.indexOf(RUN_OVERLAY_MARKERS[n + 1]);
  expect(from, `marker ${RUN_OVERLAY_MARKERS[n]} missing`).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return APP.slice(from, to);
}

describe('U-8 — the overlay structure in App.tsx', () => {
  it('carries the three region markers exactly once, in order', () => {
    let at = -1;
    for (const m of RUN_OVERLAY_MARKERS) {
      expect(APP.split(m)).toHaveLength(2);
      const i = APP.indexOf(m);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
  });

  it('scrolls the rows and nothing else', () => {
    const scroll = region(1);
    expect(scroll).toContain('busy-scan');
    // THE CLAIM OF THE SESSION: neither the progress line nor the way out is
    // in the box that scrolls, so an overfull list cannot take them off screen.
    expect(scroll).not.toContain('busy-totals');
    expect(scroll).not.toContain('busy-actions');
    expect(scroll).not.toContain('busy-detail');
  });

  it('keeps the title in the head and the progress line and Cancel in the foot', () => {
    const head = region(0);
    expect(head).toContain('busy-spinner');
    expect(head).toContain('busy-title');
    expect(head).not.toContain('busy-scan');
    const foot = region(2);
    expect(foot).toContain('busy-totals');
    expect(foot).toContain('busy-detail');
    expect(foot).toContain('busy-actions');
    expect(foot).toContain('busy-cancel');
    expect(foot).not.toContain('busy-scan');
  });

  it('renders the label through the split and never raw', () => {
    const scroll = region(1);
    expect(scroll).toContain('splitScanLabel(it.label)');
    expect(scroll).toContain('className="scan-pos"');
    expect(scroll).toContain('className="scan-mark"');
    // The pre-U-8 spelling: the whole label as one run of text in the cell.
    expect(scroll).not.toContain('<td>{it.label}</td>');
  });

  it('portals the overlay out of #root and holds the page beneath inert', () => {
    // Both halves, because each alone is a bug: portalled without inert, the
    // page behind stays hit-testable (the tooltip); inert without the portal,
    // the overlay's own Cancel button goes inert with it.
    expect(APP).toContain('createPortal(');
    expect(APP).toMatch(/document\.body,\s*\)\}/);
    expect(APP).toContain('return holdRootInert();');
    expect(APP).toMatch(/if \(!overlayVisible\) return undefined;/);
    expect(APP).toContain(`busy-overlay \${RUN_OVERLAY_CLASS.overlay}`);
    expect(APP).toContain(`busy-card \${RUN_OVERLAY_CLASS.card}`);
  });
});
