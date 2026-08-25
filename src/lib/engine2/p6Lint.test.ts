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
const WHITELIST_FILE = 'constants.ts';
const MARKER = 'P6-OK';

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
