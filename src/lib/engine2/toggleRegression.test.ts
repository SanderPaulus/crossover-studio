/**
 * DELIVERABLE 1 ACCEPTANCE — with the toggle off, the app is unchanged.
 *
 * "Aantoonbaar ongewijzigd" is a strong word and it is meant literally, so
 * this file proves it three independent ways rather than asserting it once:
 *
 *  1. BYTE COMPARISON OF A REFERENCE OPTIMISATION RUN. The same run is made
 *     twice inside one process — once while `engine2` has never been imported,
 *     once after the WHOLE v2 surface has been loaded — and the serialised
 *     results are compared character for character. No tolerance: an epsilon
 *     here would hide precisely the class of change the test exists to catch.
 *     (Note the ordering: engine2 is reached through `await import`, never a
 *     top-level import, or run #1 would already have it in the graph.)
 *
 *  2. THE DEPENDENCY ARROW POINTS ONE WAY. A pure module cannot change
 *     anything by being imported — but a pre-v2 module that starts importing
 *     engine2 could, and that import would be invisible in run #1 above
 *     because it would have been there all along. So the tree is scanned: no
 *     file outside `engine2/` may import from it except the UI entry points
 *     that exist to show the panel.
 *
 *  3. THE FLAG'S OWN SEMANTICS. Absent and false are the same thing, and F1
 *     never routes the optimiser to v2 whatever the flag says.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../parsers/frd.ts';
import { parseZma } from '../parsers/zma.ts';
import { logspace, resample } from '../dsp.ts';
import { fromPolar } from '../complex.ts';
import type { VxpPart } from '../parsers/vxp.ts';
import { optimizeNetworkValues } from '../netOptimizer.ts';
import { ENGINE_V1_ONLY, selectEngine } from './facade.ts';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(LIB, '..');
const FIXTURES = join(LIB, 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

const grid = logspace(210, 19000, 400);
const gridded = (name: string) => {
  const f = parseFrd(load(name));
  return resample(f.freq, f.spl, f.phase, grid);
};
const gridZ = (name: string) => {
  const z = parseZma(load(name));
  const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};

/** The reference design: a crude 2-way the tuner has real work to do on. */
function referenceNetwork(): VxpPart[] {
  return [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 0.4, unit: 'mH' },
        { name: 'DCR', value: 0.16, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'mid',
      params: [],
      wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
    {
      type: 'Capacitor',
      partId: 'C1',
      params: [
        { name: 'C', value: 2.0, unit: 'uF' },
        { name: 'ESR', value: 0.02, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 16, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D2',
      model: 'tweeter',
      params: [],
      wires: [{ x: 16, y: 4 }, { x: 16, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 16, y: 11 }] },
  ];
}

/** Serialise EVERYTHING the run produced, in a stable key order. */
function referenceRun(): string {
  const wBase = gridded('mid_hor0_mettape.txt');
  const tBase = gridded('tweet_hor0_mettape.txt');
  const driverZ = {
    mid: gridZ('mid_Backwavecone_sheep75gram.ZMA'),
    tweeter: gridZ('tweeter.ZMA'),
  };
  const r = optimizeNetworkValues(
    referenceNetwork(),
    grid,
    wBase,
    tBase,
    driverZ,
    { offsetMm: 0, trimDb: 0, inverted: false },
    { phasePriority: 0.3 },
  );
  // JSON.stringify with a sorted replacer: property order must not be able to
  // make two identical results look different (or two different ones look
  // identical because one had a key the other lacked — sorting keeps both).
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(sortKeys(r));
}

const CODE = /\.(ts|tsx)$/;
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name)) out.push(full);
  }
  return out;
}

/**
 * The only files allowed to reach into engine2 — the UI entry points whose
 * whole job is to render the v2 panel behind the flag. Anything else on this
 * list in future is a design decision, not a convenience.
 */
const ALLOWED_IMPORTERS = ['App.tsx', join('components', 'EngineV2Panel.tsx')];

describe('engine v2 toggle — off means unchanged', () => {
  it('a reference optimisation run is byte-identical with and without the v2 modules loaded', async () => {
    const withoutV2 = referenceRun();
    // Load the entire v2 surface, exactly as switching the toggle on would.
    const v2 = await import('./index.ts');
    expect(Object.keys(v2).length).toBeGreaterThan(0);
    const withV2 = referenceRun();
    expect(withV2).toBe(withoutV2);
    // And the run really produced something — a pair of empty strings would
    // compare equal forever.
    expect(withoutV2.length).toBeGreaterThan(500);
  });

  it('nothing outside engine2 imports engine2, except the UI entry points', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (rel.startsWith(join('lib', 'engine2'))) continue;
      const allowed = ALLOWED_IMPORTERS.some((a) => rel === a || rel.endsWith(a));
      if (allowed) continue;
      readFileSync(file, 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          if (/from\s+['"][^'"]*engine2\//.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits, `pre-v2 code reaches into engine2:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the import scan actually walks the tree', () => {
    // A walker that quietly found nothing would keep the test above green.
    const files = walk(SRC).map((f) => relative(SRC, f));
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('App.tsx');
    expect(files.some((f) => f.startsWith(join('lib', 'engine2')))).toBe(true);
  });

  it('absent, false and off are the same selection; F1 never routes the optimiser to v2', () => {
    expect(selectEngine(undefined)).toEqual(ENGINE_V1_ONLY);
    expect(selectEngine(false)).toEqual(ENGINE_V1_ONLY);
    expect(selectEngine(false).reporting).toBe(false);
    const on = selectEngine(true);
    expect(on.reporting).toBe(true);
    expect(on.optimizer).toBe('v1'); // F1 ships no optimiser change at all.
    expect(on.version).toBe(ENGINE_V1_ONLY.version);
  });
});
