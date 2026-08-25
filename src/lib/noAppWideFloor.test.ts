import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE APP-WIDE LOAD FLOOR STAYS GONE.
 *
 * One amplifier's rated minimum once lived as a constant in the engine and
 * reached the gates, the repair pass and the ranking from there. It was
 * removed in 18adfe4, and the floor is now the number the DESIGNER types —
 * absent field, no judgement — resolved through a single rule in
 * impedanceFloor.ts.
 *
 * A deletion like that does not stay deleted on its own: the value is easy to
 * reintroduce from memory the next time some code "just needs a floor", and
 * nothing about doing so looks wrong in review. So the absence is pinned the
 * same way behaviour is.
 *
 * ⚠ THIS TEST NEVER MATCHES ITSELF. The identifier is assembled at runtime
 * from its parts and appears nowhere in this file as literal text, so the
 * acceptance grep comes back empty on this file too — the guard and the check
 * it enforces agree. (Spelling the pattern out in this very comment is the
 * obvious way to break that, and the guard caught exactly that while it was
 * being written.)
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(ts|tsx)$/;

/** Assembled, never written out — see the header. */
const BANNED = ['z', 'floor'].join('_');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

describe('the app-wide amplifier-load floor does not come back', () => {
  it('no source file mentions the removed constant', () => {
    const needle = BANNED.toLowerCase();
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (line.toLowerCase().includes(needle)) hits.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits, `the removed app-wide floor is referenced again:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the guard actually scans the tree it claims to', () => {
    // A walker that silently found nothing would pass the test above forever.
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.endsWith('impedanceFloor.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('App.tsx'))).toBe(true);
  });
});
