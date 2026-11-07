/**
 * THE SEARCH SWALLOWS DOMAIN ERRORS AND THROWS BUILT-IN ONES ON (07-11-2026).
 *
 * Three claims. (1) The classification, by hand. (2) Every catch in the tuner
 * and the minimiser calls `rethrowIfPlatformError` first — a source scan, so a
 * new bare `catch {` fails here. (3) Through the real tuner: a `RangeError`
 * injected into the solver FAILS the run, while a `NetworkError` injected the
 * same way is swallowed as before and the run delivers. Without (3) the scan
 * could pass on a helper that does nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isPlatformError } from './platformError.ts';
import { NetworkError } from './network.ts';
import { VxpNetworkError } from './vxpNetwork.ts';

/* Every Nth solve throws whatever `inject` holds; null = the real solver. */
const fault: { inject: (() => Error) | null; every: number; calls: number } = { inject: null, every: 50, calls: 0 };
vi.mock('./network.ts', async (orig) => {
  const real = await orig<typeof import('./network.ts')>();
  return {
    ...real,
    solveNetwork: (...args: Parameters<typeof real.solveNetwork>) => {
      if (fault.inject && ++fault.calls % fault.every === 0) throw fault.inject();
      return real.solveNetwork(...args);
    },
  };
});

const { optimizeNetworkValues } = await import('./netOptimizer.ts');
const { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } = await import('./engine2/optimizer/v2.fixture.ts');

const run = () => {
  const { wBase, tBase } = v2Responses();
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, v2DriverZ(),
    { offsetMm: 0, trimDb: 0, inverted: false },
    { phasePriority: 0.5, maxIterations: 200 });
};

describe('which errors a search may swallow', () => {
  it('built-in JavaScript errors are platform errors; domain errors are not', () => {
    for (const e of [new RangeError('x'), new TypeError('x'), new ReferenceError('x'), new SyntaxError('x')]) {
      expect(isPlatformError(e), e.name).toBe(true);
    }
    for (const e of [new NetworkError('x'), new VxpNetworkError('x'), new Error('refusing to extrapolate')]) {
      expect(isPlatformError(e), e.constructor.name).toBe(false);
    }
  });

  it('every catch in the tuner and the minimiser throws a platform error on first', () => {
    for (const f of ['netOptimizer.ts', 'minimize.ts']) {
      const src = readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8');
      expect(src, `${f}: a bare catch`).not.toMatch(/catch\s*\{/);
      const catches = [...src.matchAll(/catch \((\w+)\) \{\s*rethrowIfPlatformError\(\1\);/g)].length;
      const all = [...src.matchAll(/catch \(\w+\) \{/g)].length;
      expect(catches, f).toBe(all);
      expect(all, f).toBeGreaterThan(0);
    }
  });

  it('through the tuner: a RangeError fails the run, a NetworkError is swallowed as before', () => {
    fault.calls = 0;
    fault.inject = () => new NetworkError('injected: singular');
    const swallowed = run();
    expect(swallowed.parts.length).toBeGreaterThan(0);
    expect(fault.calls).toBeGreaterThanOrEqual(fault.every);

    fault.calls = 0;
    fault.inject = () => new RangeError('injected: Array buffer allocation failed');
    expect(run).toThrow(RangeError);
    fault.inject = null;
  });
});
