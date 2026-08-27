/**
 * A5e.1, ENFORCED — there is no weighted sum, and there is no weight.
 *
 * The decision is easy to state and easy to erode. Nobody sets out to add a
 * weight vector; what happens is that someone needs "just a tie-breaker", or
 * "a small nudge so phase counts a bit more", and six months later the
 * shortlist is ranked by a weighted score nobody agreed to and nobody can
 * defend. The gates went the same way twice before P2 was written down.
 *
 * So it is a test, not a review rule — the same reasoning as `p6Lint.test.ts`,
 * and deliberately the same shape.
 *
 * WHAT IS GUARDED: the satisficing surface — `requirements/`, `shortlist.ts`,
 * `relaxation.ts`, `diversity.ts`, and since F4d the CANDIDATE GENERATOR
 * (`predesign/candidates.ts`, `predesign/flankOrder.ts`,
 * `predesign/candidateField.ts`). These are the modules that decide which
 * designs a human is shown.
 *
 * The generator joined the surface because it is now the first place where a
 * weight could plausibly appear and look reasonable: "spread the positions but
 * weight the middle of the window a bit more", or "prefer the lower order
 * slightly". Both would be a scalar preference over a field this layer is
 * forbidden to rank — A5e.1's decision applies to choosing candidates exactly
 * as it applies to choosing between their results.
 *
 * WHAT IS NOT, AND WHY: the v1 ranking (`rankChain3Results`) genuinely is a
 * weighted sum, it still serves the v1 path, and F3 promised not to touch that
 * path. Widening this lint to the whole repository would turn a deliberate
 * boundary into a failing build. The boundary is the point: v2 does not rank
 * by score, v1 still does, and the two do not share code.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPTIMIZER = dirname(fileURLToPath(import.meta.url));
const ENGINE2 = join(OPTIMIZER, '..');

/** The satisficing surface: every file that decides what a human is shown. */
const GUARDED = [
  join(ENGINE2, 'requirements'),
  join(OPTIMIZER, 'shortlist.ts'),
  join(OPTIMIZER, 'relaxation.ts'),
  join(OPTIMIZER, 'diversity.ts'),
  // F4d — choosing which candidates exist is the same decision as choosing
  // between their results, one stage earlier.
  join(ENGINE2, 'predesign', 'candidates.ts'),
  join(ENGINE2, 'predesign', 'flankOrder.ts'),
  join(ENGINE2, 'predesign', 'candidateField.ts'),
];

/**
 * Words that name a weighted aggregation.
 *
 * `weight` on its own is the obvious one. The rest are the disguises: an
 * "importance", a "priority", a "score" that several metrics feed into. Each
 * has been a real name for a real weight vector in some codebase, and the
 * point of listing them is that the next one arrives under a new name.
 */
const FORBIDDEN = [
  // No word boundaries: a weight vector arrives as `phaseWeight` or
  // `dirWeight` far more often than as a bare `weight`, and the first version
  // of this lint let exactly that through.
  /weight/i,
  /priorit/i,
  /importance/i,
  /penalt/i,
  /cost ?function/i,
  /objective/i,
];

/**
 * Comments may DISCUSS weights — this whole decision is about not having them,
 * and explaining that requires the word. Only code is scanned.
 */
function codeOnly(text: string): { line: string; n: number }[] {
  const out: { line: string; n: number }[] = [];
  let inBlock = false;
  text.split('\n').forEach((raw, i) => {
    let l = raw;
    if (inBlock) {
      const end = l.indexOf('*/');
      if (end < 0) return;
      l = l.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const start = l.indexOf('/*');
      if (start < 0) break;
      const end = l.indexOf('*/', start + 2);
      if (end < 0) {
        l = l.slice(0, start);
        inBlock = true;
        break;
      }
      l = l.slice(0, start) + l.slice(end + 2);
    }
    l = l.replace(/\/\/.*$/, '');
    // String literals are prose too — a message may say "no weights".
    l = l.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
    if (l.trim()) out.push({ line: l, n: i + 1 });
  });
  return out;
}

function walk(target: string, out: string[] = []): string[] {
  const st = statSync(target);
  if (st.isFile()) {
    if (/\.ts$/.test(target) && !/\.test\.ts$|\.fixture\.ts$/.test(target)) out.push(target);
    return out;
  }
  for (const name of readdirSync(target)) walk(join(target, name), out);
  return out;
}

describe('A5e.1 - no weights on the satisficing surface', () => {
  const files = GUARDED.flatMap((g) => walk(g));

  it('guards the files it claims to (a lint over nothing stays green forever)', () => {
    const rel = files.map((f) => relative(ENGINE2, f));
    expect(rel).toContain(join('requirements', 'requirements.ts'));
    expect(rel).toContain(join('requirements', 'response.ts'));
    expect(rel).toContain(join('requirements', 'targetCurve.ts'));
    expect(rel).toContain(join('optimizer', 'shortlist.ts'));
    expect(rel).toContain(join('optimizer', 'relaxation.ts'));
    expect(rel).toContain(join('optimizer', 'diversity.ts'));
    expect(rel).toContain(join('predesign', 'candidates.ts'));
    expect(rel).toContain(join('predesign', 'flankOrder.ts'));
    expect(rel).toContain(join('predesign', 'candidateField.ts'));
  });

  it('no code on that surface names a weight, a priority or an objective', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const { line, n } of codeOnly(readFileSync(file, 'utf-8'))) {
        for (const pattern of FORBIDDEN) {
          if (pattern.test(line)) {
            offenders.push(`${relative(ENGINE2, file)}:${n}: ${line.trim()}`);
            break;
          }
        }
      }
    }
    expect(
      offenders,
      'A5e.1 decided there is no weighted aggregation anywhere on this surface. ' +
        'These lines name one:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the scanner can actually see a violation, including a camelCase one', () => {
    // A lint nobody has watched fail is a lint nobody should trust — and the
    // camelCase case is here because the first version of this file missed it.
    const hits = (text: string) =>
      codeOnly(text).filter((l) => FORBIDDEN.some((p) => p.test(l.line)));
    expect(hits('const phaseWeight = 0.5;')).toHaveLength(1);
    expect(hits('const w = a * 0.3 + b * 0.7; // no forbidden word at all')).toHaveLength(0);
    // ...and it really does ignore comments and strings, where the decision
    // itself has to be discussed by name.
    expect(hits('// weight\n/* priority */\nconst m = "objective";')).toHaveLength(0);
  });

  it('the v1 ranking is deliberately OUTSIDE this lint, and says so', () => {
    // The boundary is the decision. If `rankChain3Results` ever stops being
    // v1-only, this comment is where the next reader will look.
    const chain = readFileSync(join(ENGINE2, '..', 'threeWayChain.ts'), 'utf-8');
    expect(chain).toContain('rankChain3Results');
    expect(chain).toMatch(/v1-only|A5e\.1/);
  });
});
