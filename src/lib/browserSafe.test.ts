import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * NOTHING IN src/ MAY REACH FOR A NODE GLOBAL.
 *
 * ⚠ THIS TEST EXISTS BECAUSE THE SUITE CANNOT CATCH IT ANY OTHER WAY. Vitest
 * runs in Node, where `process` is defined, so a stray `process.env` passes
 * every unit test, every typecheck AND the build — and then throws
 * "process is not defined" the moment the code runs in the browser or in a
 * worker.
 *
 * MEASURED, aug 2026: a leftover `if (process.env.D3DEBUG) console.log(...)`
 * in threeWayDesign.ts shipped to origin/main and took the entire three-way
 * "Optimize — design for me" down on the live site. 772 tests were green over
 * it. It was found by running the app, which is the only thing that could
 * have found it — and this test is the cheap standing version of that run.
 *
 * The engine (src/lib) is imported by a Web Worker with no bundler shim, so
 * this is not a style rule: it is the boundary the worker actually enforces.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, '..');

/** Node globals that simply do not exist in a browser or a worker. */
const FORBIDDEN = [
  { name: 'process', re: /(^|[^.\w$])process\s*\./ },
  { name: '__dirname', re: /(^|[^.\w$])__dirname\b/ },
  { name: '__filename', re: /(^|[^.\w$])__filename\b/ },
  { name: 'require(', re: /(^|[^.\w$])require\s*\(/ },
  { name: "node: import", re: /from\s+['"]node:/ },
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'parsers') {
        // fixtures live here; still walk it for .ts
        sourceFiles(p, out);
        continue;
      }
      sourceFiles(p, out);
      continue;
    }
    if (!/\.tsx?$/.test(e)) continue;
    if (/\.test\.tsx?$/.test(e)) continue; // tests DO run in Node
    // ...and so do FIXTURE LOADERS, which exist only to feed them. They read
    // from disk on purpose, they are excluded from the app's tsconfig for the
    // same reason (tsconfig.app.json), and nothing in the app's import graph
    // reaches them — which the test below pins, so this exemption cannot be
    // used to smuggle a Node import into the bundle.
    if (/\.fixture\.tsx?$/.test(e)) continue;
    out.push(p);
  }
  return out;
}

describe('the shipped source stays browser-safe', () => {
  it('no Node-only global anywhere in src/ (tests excluded — those run in Node)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const text = readFileSync(file, 'utf-8');
      const lines = text.split('\n');
      for (const { name, re } of FORBIDDEN) {
        lines.forEach((line, i) => {
          // Ignore anything inside a line comment — prose may name them.
          const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          if (re.test(code)) offenders.push(`${relative(ROOT, file)}:${i + 1}  ${name}  ${line.trim().slice(0, 90)}`);
        });
      }
    }
    expect(offenders, `Node-only globals reach the browser bundle:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('nothing shipped imports a .fixture file (the exemption above has a floor)', () => {
    // A fixture loader may use Node because it never reaches the browser. That
    // is only true while no shipped module imports one, so the exemption and
    // this assertion belong together.
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      readFileSync(file, 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          if (/from\s+['"][^'"]*\.fixture(\.tsx?)?['"]/.test(line)) {
            offenders.push(`${relative(ROOT, file)}:${i + 1}  ${line.trim().slice(0, 90)}`);
          }
        });
    }
    expect(offenders, `a shipped module imports a test fixture:\n${offenders.join('\n')}`).toEqual([]);
  });
});
