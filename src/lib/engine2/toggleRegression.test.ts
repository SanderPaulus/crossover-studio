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

/*
 * U-10 fase 2 (Sander, 25-10-2026, B-4.4) — THE INVARIANT HAS A NEW FORM, in
 * the V15 shape: what stood, what stands, why.
 *
 * WHAT STOOD: "with `engineV2Enabled` off, app behaviour is byte-identical".
 * Since U-1 nobody can switch the flag off from the interface, and since U-10
 * fase 1 no UI route reaches the v1 search except the two named exceptions —
 * so the rule had lost its subject.
 *
 * WHAT STANDS: the MOTOR-BOUNDARY invariant (CLAUDE.md, hard rules). Two of the
 * three claims above guarded something that stays, and they stay LITERALLY:
 *   1. a reference run of the shared motor is byte-identical with and without
 *      engine2 in the module graph — engine2 may CALL and STEER the motor, it
 *      may never change it silently;
 *   2. nothing outside engine2 imports engine2 except the UI entry points — and
 *      since U-10 the shared-motor files are NAMED (`SHARED_MOTOR`), so the
 *      boundary is not only "nothing outside" but "these, by name, exist and
 *      import nothing", which a later allow-list widening cannot slip past.
 * The third — the flag's own semantics — and the F3b/F3c guards that surfaces
 * hang off the flag went WITH the flag in U-10 fase 3, each by name below. The two named v1 routes (the
 * two-way without impedances and the solo design) are pinned by
 * `v2RouteRefusal.test.ts`, which is where their routing is decided.
 *
 * The file keeps its name (Sander's choice).
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
 * The only files allowed to reach into engine2. Anything on this list is a
 * DESIGN DECISION, not a convenience, and each one carries its reason here.
 *
 *  · `App.tsx` and `components/EngineV2Panel.tsx` — the UI entry points whose
 *    whole job is to render the v2 panel behind the flag (F1).
 *
 *  · `optimClient.ts` — added at F2b, and this is the decision.
 *
 *    THE REASON: gate enforcement belongs INSIDE the loop. A3 is explicit —
 *    "grenshandhaving zit in de kern" — because a limit that is only checked
 *    after a search has finished is a limit the search spent its whole budget
 *    ignoring, and the casebook's V2 pathology is what that looks like. The
 *    only legitimate evaluator of M-A/M-B/M-C is the F1 metric library, so the
 *    module that hosts the tuner during a v2 run must be able to see
 *    `engine2/`.
 *
 *    WHAT WAS NOT DONE, and why the invariant is still intact: `optimWorker.ts`
 *    was NOT taught to import engine2. It is byte-untouched, and the test below
 *    pins that permanently. A SECOND worker entry
 *    (`engine2/optimizer/worker.ts`) hosts the v2 route, and it lives inside
 *    engine2 where the import needs no exception at all. What is left over is
 *    the CLIENT: something has to construct that worker, type its messages and
 *    — the part that decided it — kill it. Cancel and Stop run through
 *    `cancelOptimTasks()` / `stopKeepingResults()` in this one file, and a
 *    second pool owned by another module would survive both. A cancel that
 *    does not cancel is the one failure this route may not have, since A5e.4
 *    asks for an explicit "aborted" status precisely so a partial field can
 *    never pass for a whole one.
 *
 *    So the arrow still points one way, the v1 worker still cannot see
 *    engine2, and exactly one client module knows that two engines exist.
 *
 *  · `components/XoWindowAnnotation.tsx` — added at F3b, and for one reason:
 *    the toggle invariant claims the dialog RENDERS NOTHING with the engine
 *    off, and a source scan cannot make that claim. One component with one
 *    entry condition can be rendered in a test and read, which is what
 *    `xoWindowAnnotation.test.tsx` does. It imports two TYPES and one
 *    formatter from engine2 and holds no logic of its own — every verdict it
 *    draws comes from `xoRangeAdvice.ts`.
 */
const ALLOWED_IMPORTERS = [
  'App.tsx',
  join('components', 'EngineV2Panel.tsx'),
  join('components', 'XoWindowAnnotation.tsx'),
  join('lib', 'optimClient.ts'),
];

describe('engine v2 toggle — off means unchanged (since U-10: the motor boundary)', () => {
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
      /* TESTS ARE NOT THE IMPORT GRAPH. This scan protects one claim: that
       * turning the flag off leaves the SHIPPED app unchanged. A test file is
       * not in the bundle, cannot be reached by the running app, and can no
       * more change its behaviour than a comment can — while a test that may
       * not import the module it tests is a test nobody can write. (What is in
       * the bundle is `browserSafe.test.ts`'s business, and it holds its own
       * allow-list for exactly this reason.) */
      if (/\.test\.tsx?$/.test(rel)) continue;
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

  it('U-10 — the SHARED MOTOR, by name, exists and imports nothing from engine2', () => {
    /* The motor-boundary invariant names its files (CLAUDE.md, hard rules).
     * The generic scan above already covers them; this list is what makes a
     * renamed or deleted motor file, or an allow-list that quietly grows to
     * include one, fail here by name. */
    const SHARED_MOTOR = [
      'designChain.ts',
      'threeWayChain.ts',
      'threeWayDesign.ts',
      'netOptimizer.ts',
      'vfOptimizer.ts',
      'minimize.ts',
      'soloOptimizer.ts',
      'synthesis.ts',
      'partAudit.ts',
    ];
    for (const f of SHARED_MOTOR) {
      const text = readFileSync(join(LIB, f), 'utf-8');
      expect(text.length, f).toBeGreaterThan(1000);
      const hits = text.split('\n').filter((line) => /from\s+['"][^'"]*engine2\//.test(line));
      expect(hits, `${f} imports engine2`).toEqual([]);
      expect(ALLOWED_IMPORTERS.some((a) => a.endsWith(f)), `${f} is on the allow-list`).toBe(false);
    }
  });

  it('the v1 worker still imports NOTHING from engine2 (F2b, permanent)', () => {
    // The allow-list above grew by one at F2b, and this test is the floor
    // under that decision: whatever else changes, the module that runs the v1
    // optimiser may not see engine2. If it ever does, the byte-identity claim
    // of the run above stops being a property of the code and becomes a hope
    // about what those imports happen to do.
    const worker = readFileSync(join(LIB, 'optimWorker.ts'), 'utf-8');
    const hits = worker
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((x) => /engine2/.test(x.line));
    expect(hits, `optimWorker.ts reaches into engine2:\n${hits.map((h) => `${h.n}: ${h.line}`).join('\n')}`)
      .toEqual([]);
    // ...and the file really was read, so an empty result means "no hits"
    // rather than "no file".
    expect(worker).toContain('optimizeNetworkValues');
  });

  /* ------------------------------------------------------------------ *
   * F3b — the toggle invariant for the SCAN DIALOG and the PANEL.
   *
   * F3b put three new surfaces into `App.tsx`: the A5d.3 window annotation with
   * its take-over button, the pre-start estimate, and the A5a measurement
   * form. All three are v2 reporting, so with the toggle off the dialog must
   * be what it always was — to the pixel.
   *
   * There is no DOM in this suite, so the invariant is pinned where it is
   * actually decided: every one of those surfaces hangs off a value that is
   * NULL when reporting is off, and the guard below reads the source to prove
   * the chain rather than trusting that it was wired that way. Same technique
   * as `noAppWideFloor.test.ts` and the import scan above — a review rule does
   * not survive; a test does.
   * ------------------------------------------------------------------ */
  /* U-10 fase 3 — REMOVED WITH THE FLAG, by name: the F3b/F3c guards
   *   · "the window annotation, the take-over and the estimate all hang off `v2Windows`"
   *   · "F3c - the recommended band and the smoothing line hang off the same flag"
   *   · "the pre-start notice can only be set from inside that guard"
   *   · "the A5a measurement form is behind `engineSelection.reporting`"
   *   · "this guard is reading the file it thinks it is"
   * They pinned that a v2 surface hangs off `engineSelection.reporting`, a guard
   * that no longer exists: those surfaces now render on every run. What they
   * protected — that the v1 app was unchanged — has no subject without the flag. */
  it('the import scan actually walks the tree', () => {
    // A walker that quietly found nothing would keep the test above green.
    const files = walk(SRC).map((f) => relative(SRC, f));
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('App.tsx');
    expect(files.some((f) => f.startsWith(join('lib', 'engine2')))).toBe(true);
    // The test exemption above must not have swallowed the app: plenty of
    // non-test files outside engine2 still go through the scan.
    const scanned = files.filter(
      (f) => !f.startsWith(join('lib', 'engine2')) && !/\.test\.tsx?$/.test(f),
    );
    expect(scanned.length).toBeGreaterThan(30);
    expect(scanned).toContain('App.tsx');
  });

  /* U-10 fase 3 — REMOVED WITH THE FLAG: "absent, false and off are the same
   * selection; only ON routes the optimiser to v2" (`selectEngine` is gone). */
});
