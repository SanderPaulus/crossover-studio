/**
 * P6, ENFORCED.
 *
 * "Geen letterlijke frequenties, componentgrenzen of andere projectgetallen in
 * engine-/metriekcode. Alles afgeleid uit projectdata of expliciete
 * projectinstelling. Whitelist: eenheidsconversies, c=343."
 *
 * A6/A7 call this a review rule. Review rules do not survive, so it is a test:
 * every numeric literal in `src/lib/engine2/` whose magnitude reaches the
 * threshold must either live in `constants.ts` — the whitelist, where each
 * entry has to declare WHICH KIND of number it is — or sit on a line carrying
 * an explicit `P6-OK` marker.
 *
 * WHY THE WHITELIST FILE IS NOT A LOOPHOLE. Anything can be moved into
 * `constants.ts`; what cannot be faked is the `@p6` tag every export there has
 * to carry, from a closed set (unit / physical / norm / literature / rule).
 * Choosing a tag is a claim a reviewer can check, and "this crossover point is
 * a unit conversion" is not a claim anyone will make by accident.
 *
 * Small literals are not policed. Below the threshold a number is structural —
 * an index, a half, a small ratio — and a lint that flagged `0.5` would be
 * turned off within the week. The things P6 is actually about (frequencies,
 * component values, gate times in ms, Q thresholds) are all comfortably above
 * it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P6_LITERAL_THRESHOLD } from './constants.ts';

const ENGINE2 = dirname(fileURLToPath(import.meta.url));
const APP_FILE = join(ENGINE2, '..', '..', 'App.tsx');
const WHITELIST_FILE = 'constants.ts';
const MARKER = 'P6-OK';

/* ------------------------------------------------------------------ *
 * SCOPE TWO — the crossover pin in App.tsx (F4b, audit §7)
 * ------------------------------------------------------------------ */

/**
 * The identifiers that carry the crossover PIN — the numbers that cage the
 * structure search at each handover.
 *
 * P6 is about engine and metric code, and `App.tsx` is neither; the reason this
 * scope exists anyway is that these particular literals do exactly what P6
 * forbids. `xoLowPin` and `xoHighPin` steer which crossings the chain is
 * allowed to deliver, and the low default (400 ± 150 Hz) puts the range
 * 147 Hz BELOW the A5d.3 measurement-validity floor the same app computes on
 * the casebook set. A frequency out of one project, steering another.
 *
 * The rule is deliberately narrow — this family of names, not "any frequency
 * in App.tsx". A blanket rule would flag plot bounds, display limits and a
 * notch default, none of which decide a design, and a lint that cries wolf is
 * a lint someone deletes.
 */
const PIN_IDENTIFIERS = [
  'xoFreqHz',
  'xoMarginHz',
  'xoLowFreqHz',
  'xoLowMarginHz',
  'xoRangeLo',
  'xoRangeHi',
] as const;

/** The one named block those literals are allowed to live in. */
const LEGACY_BLOCK = 'V1_PIN_DEFAULTS_LEGACY';

/**
 * The block's contents, pinned.
 *
 * A named home for a violation only helps while it stays small; without this
 * snapshot the block is a place to put the NEXT hard-coded frequency. Changing
 * it is then a deliberate act with a test to update, which is the point.
 */
const LEGACY_BLOCK_SNAPSHOT: Readonly<Record<string, string>> = {
  highFreqHz: "'2200'",
  highMarginHz: "'400'",
  lowFreqHz: "'400'",
  lowMarginHz: "'150'",
  legacyRangeLoHz: '1800',
  legacyRangeHiHz: '3500',
};

/** The tags `constants.ts` may use, and what each one promises. */
const P6_TAGS = ['unit', 'physical', 'norm', 'literature', 'rule'] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    // Tests and fixtures are excluded: a test that may not name a frequency
    // cannot assert that a frequency came out right.
    else if (/\.ts$/.test(name) && !/\.test\.ts$|\.fixture\.ts$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Numeric literals on a line, with strings and comments removed first.
 *
 * Order matters: strip block comments, then line comments, then string and
 * template literals. Doing it the other way round eats a `//` inside a string
 * and takes the rest of the line with it.
 */
function literalsOn(line: string): number[] {
  const code = line
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  const out: number[] = [];
  // A number not preceded by an identifier character (so `Complex2` and
  // `1e-9` are handled sanely) — exponent form included.
  for (const m of code.matchAll(/(?<![\w.$])(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)) {
    out.push(Number(m[1]));
  }
  return out;
}

/** Strip the block comments a file starts its declarations with. */
function withoutBlockComments(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    let l = line;
    if (inBlock) {
      const end = l.indexOf('*/');
      if (end < 0) {
        out.push('');
        continue;
      }
      l = l.slice(end + 2);
      inBlock = false;
    }
    const start = l.indexOf('/*');
    if (start >= 0 && !l.includes('*/', start)) {
      out.push(l.slice(0, start));
      inBlock = true;
      continue;
    }
    out.push(l);
  }
  return out;
}

describe('P6 lint - no project numbers in engine2', () => {
  it('every literal at or above the threshold is whitelisted or explicitly marked', () => {
    const offenders: string[] = [];
    for (const file of walk(ENGINE2)) {
      const rel = relative(ENGINE2, file);
      if (rel === WHITELIST_FILE) continue;
      const lines = withoutBlockComments(readFileSync(file, 'utf-8'));
      lines.forEach((line, i) => {
        if (line.includes(MARKER)) return;
        for (const v of literalsOn(line)) {
          if (Math.abs(v) >= P6_LITERAL_THRESHOLD) {
            offenders.push(`${rel}:${i + 1}: ${v} in "${line.trim()}"`);
          }
        }
      });
    }
    expect(
      offenders,
      'P6: these literals must move to constants.ts (with an @p6 tag) or carry a P6-OK marker:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('every export in the whitelist declares which KIND of number it is', () => {
    const text = readFileSync(join(ENGINE2, WHITELIST_FILE), 'utf-8');
    // Each export must be preceded by a doc comment holding an @p6 tag from
    // the closed set. Split on the export keyword and look backwards.
    const chunks = text.split(/^export const /m);
    const named = chunks.slice(1).map((c, i) => ({
      name: c.split(/[:\s=]/)[0],
      preamble: chunks[i],
    }));
    expect(named.length).toBeGreaterThan(15);
    const untagged: string[] = [];
    for (const { name, preamble } of named) {
      const tag = preamble.match(/@p6\s+(\w+)\s*(?:\*\/|\n|$)/);
      if (!tag || !(P6_TAGS as readonly string[]).includes(tag[1])) {
        untagged.push(`${name} (found: ${tag?.[1] ?? 'nothing'})`);
      }
    }
    expect(
      untagged,
      `every whitelisted constant needs an @p6 tag from {${P6_TAGS.join(', ')}}:\n` +
        untagged.join('\n'),
    ).toEqual([]);
  });

  it('no constant that NAMES a frequency is tagged as a unit or a rule', () => {
    // The tags are a promise; this is the one that matters, and it is checked
    // on the name rather than the value. Degrees, decibel factors and grid
    // sizes are all legitimately large and none of them is a frequency; a
    // constant called `*_HZ` is, by its own admission. Such a value is only
    // allowed into the whitelist as a published standard or a citation - a
    // frequency tagged `unit` or `rule` is the exact violation P6 describes.
    const text = readFileSync(join(ENGINE2, WHITELIST_FILE), 'utf-8');
    const chunks = text.split(/^export const /m);
    const suspect: string[] = [];
    const hz: string[] = [];
    for (let i = 1; i < chunks.length; i++) {
      const name = chunks[i].split(/[:\s=]/)[0];
      if (!/_HZ$|_HZ_/.test(name)) continue;
      hz.push(name);
      const tag = chunks[i - 1].match(/@p6\s+(\w+)/)?.[1];
      if (tag === 'unit' || tag === 'rule') suspect.push(`${name} tagged @p6 ${tag}`);
    }
    // The check is worthless if it matched nothing: casus 1's whitelist holds
    // the two IEC norm edges and Keele's constant.
    expect(hz.length).toBeGreaterThanOrEqual(3);
    expect(
      suspect,
      'a frequency may only enter the whitelist as a standard or a citation:\n' +
        suspect.join('\n'),
    ).toEqual([]);
  });

  /* ================================================================== *
   * F4b — scope two: the crossover pin in App.tsx (audit §7)
   * ================================================================== */

  describe('P6 lint - the crossover pin in App.tsx', () => {
    const appLines = () => withoutBlockComments(readFileSync(APP_FILE, 'utf-8'));

    /** A line that mentions a pin identifier, with strings kept (they hold the values). */
    const pinLines = (lines: string[]): { n: number; line: string }[] =>
      lines
        .map((line, i) => ({ n: i + 1, line }))
        .filter(({ line }) => {
          const code = line.replace(/\/\/.*$/, ' ');
          return PIN_IDENTIFIERS.some((id) => new RegExp(`\\b${id}\\b`).test(code));
        });

    it('no pin literal outside the named legacy block', () => {
      const offenders: string[] = [];
      for (const { n, line } of pinLines(appLines())) {
        if (line.includes(LEGACY_BLOCK)) continue;
        const code = line.replace(/\/\/.*$/, ' ');
        // Both forms count: a bare number and a numeric STRING, because these
        // fields are text inputs and `useState('2200')` is the same violation
        // as `useState(2200)` wearing quotes.
        const bare = [...code.matchAll(/(?<![\w.$'"])(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
        const quoted = [...code.matchAll(/['"](\d+(?:\.\d+)?)['"]/g)].map((m) => Number(m[1]));
        for (const v of [...bare, ...quoted]) {
          if (Math.abs(v) >= P6_LITERAL_THRESHOLD) {
            offenders.push(`App.tsx:${n}: ${v} in "${line.trim()}"`);
          }
        }
      }
      expect(
        offenders,
        'P6 (audit §7): a crossover-pin frequency may only appear in ' +
          `${LEGACY_BLOCK}, which the toggle invariant protects:\n${offenders.join('\n')}`,
      ).toEqual([]);
    });

    it('the scan can SEE a pin line, and sees several', () => {
      // The assertion above is worth nothing until this one shows the scan
      // reaches the code it claims to police.
      const found = pinLines(appLines());
      expect(found.length).toBeGreaterThan(8);
      expect(found.some((f) => f.line.includes('useState'))).toBe(true);
      expect(found.some((f) => f.line.includes(LEGACY_BLOCK))).toBe(true);
    });

    it('the legacy block holds exactly what it held, and nothing more', () => {
      const text = readFileSync(APP_FILE, 'utf-8');
      const start = text.indexOf(`const ${LEGACY_BLOCK} = {`);
      expect(start, 'the legacy block is gone — see audit §7 before removing it').toBeGreaterThan(0);
      const end = text.indexOf('} as const;', start);
      expect(end).toBeGreaterThan(start);
      const body = text.slice(start, end);
      const entries: Record<string, string> = {};
      for (const m of body.matchAll(/^\s{2}(\w+):\s*(.+?),\s*$/gm)) entries[m[1]] = m[2];
      expect(entries).toEqual(LEGACY_BLOCK_SNAPSHOT);
    });

    it('the v2 route does not read the legacy block for its pin', () => {
      /* The half of §7 that is a behaviour claim rather than a naming one: on
       * the v2 route an unstated handover is pinned from the A5d.3 window, or
       * not pinned at all and reported — never from a v1 default. The check is
       * structural because the value is not: `xoPinsValue` must reach the
       * legacy names only under the v1 branch. */
      const text = readFileSync(APP_FILE, 'utf-8');
      const start = text.indexOf('const xoPinsValue = ()');
      expect(start).toBeGreaterThan(0);
      const body = text.slice(start, text.indexOf('const xoRangeValue = ()', start));
      expect(body).toContain('useV2Pins');
      // The legacy values are CONSUMED only inside the `!useV2Pins` arm. Their
      // names appear earlier as parameters, which is why the check is on the
      // arm's contents rather than on first occurrence — the parameter list
      // proves nothing about which branch reads them.
      const guard = body.indexOf('if (!useV2Pins) {');
      expect(guard).toBeGreaterThan(0);
      const arm = body.slice(guard, body.indexOf('\n      }', guard));
      expect(arm).toContain('legacyFreq');
      expect(arm).toContain('legacyMargin');
      // Everything outside that arm derives or refuses; it never substitutes.
      const outside = body.slice(0, guard) + body.slice(guard + arm.length);
      expect(outside).not.toContain('num(freqField, Number(legacyFreq))');
      expect(body).toContain('const derived = fromWindow(side);');
      // ...and the refusal path exists and says so rather than substituting.
      expect(body).toContain('NOT pinned');
      expect(body).toContain('return undefined;');
    });
  });

  it('the lint actually walks the tree it claims to', () => {
    // A walker that silently found nothing would keep every test above green.
    const files = walk(ENGINE2).map((f) => relative(ENGINE2, f));
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain(join('metrics', 'electrical.ts'));
    expect(files).toContain(join('ingest', 'spl.ts'));
    expect(files).toContain('report.ts');
    // ...and that it can actually see a violation when there is one.
    expect(literalsOn('const f = 1234; // not a comment number')).toEqual([1234]);
    expect(literalsOn("const s = 'the 1234 Hz peak';")).toEqual([]);
    expect(literalsOn('const x = 5000; // P6-OK is checked by the caller')).toEqual([5000]);
  });
});
