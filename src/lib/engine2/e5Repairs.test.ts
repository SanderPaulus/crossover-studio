/**
 * E-5 — THE THREE SMALLER REPAIRS, and the app couplings that carry them.
 *
 * Parts 2, 3 and 4 of the session, each a case of a surface saying something
 * that was not true about the project in front of it:
 *
 *   2  the LF-lift bound needed a LOADED NETWORK to read a MEASUREMENT, so the
 *      panel reported "missing one of the three" with all three on disk — and
 *      did not say which;
 *   3  the beaming ceiling was read on the on-axis grid with the off-axis curve
 *      CLAMPED past its own validity floor, which on a merged axis against
 *      gated angle files put it at 34 Hz and emptied a crossover window;
 *   4  the capability grid read `cells.find(…)!` for a metric with no subject,
 *      so deleting files until one way was left crashed the render.
 *
 * The UI halves are SOURCE SCANS on `App.tsx` — the UI-1 idiom, because a
 * function test cannot say whether the app calls the function, and in every one
 * of these the calling was the half that was wrong.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReport } from './report.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { CASUS1_COIL_DCR_SETTINGS, CASUS1_LF_RESONANT_BUDGET_DB } from './casus1V2.fixture.ts';
import { directivityFromPair } from './ingest/spl.ts';
import { NO_SUBJECT } from './capability.ts';
import { ESTIMATOR_VERSIONS } from './version.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const base = {
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  ...casus1ExcursionSettings(golden),
  ...CASUS1_COIL_DCR_SETTINGS,
};
const APP = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf-8');

describe('E-5 part 2 — a budget is inverted on the MEASUREMENT, not on a network', () => {
  const withBudget = { ...base, lfBumpBudgetDb: CASUS1_LF_RESONANT_BUDGET_DB ?? 1.4 };

  it('the series-inductance bound appears with NO filter loaded', () => {
    const r = buildReport({ manifest, files, filter: null, geometry, settings: withBudget });
    const bound = r.predesign.bounds.find((b) => b.rule === 'bump-series-l');
    expect(bound).toBeDefined();
    expect(bound!.maxSI).toBeGreaterThan(0);
    expect(r.predesign.boundNotes.join(' ')).not.toContain('no series-inductance bound');
  });

  it('and it is the SAME bound a loaded network gives — the sweep is one measurement', () => {
    const a = buildReport({ manifest, files, filter: null, geometry, settings: withBudget });
    const b = buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry,
      settings: withBudget,
    });
    const of = (r: typeof a) => r.predesign.bounds.find((x) => x.rule === 'bump-series-l')!;
    /* The BOUND differs, and it must: it is solved at the path resistance, and
     * HUIDIG has one. What has to agree is the input — the peak it was solved
     * on — because that is the measurement. */
    expect(of(b).parameters.f_peak_hz).toEqual(of(a).parameters.f_peak_hz);
  });

  it('a missing input is named, one by one (F0)', () => {
    /* Without the near field there is nothing to invert against, and the note
     * has to say WHICH of the three is gone rather than that one of them is. */
    const noNf = {
      ...manifest,
      entries: manifest.entries.filter((e) => e.kind !== 'NF'),
    };
    const r = buildReport({
      manifest: noNf,
      files: files.filter((f) => f.entry.kind !== 'NF'),
      filter: null,
      geometry,
      settings: withBudget,
    });
    const note = r.predesign.boundNotes.find((n) => n.includes('no series-inductance bound'));
    expect(note).toBeDefined();
    expect(note!).toContain('Missing: a near-field measurement of this way');
    expect(note!).not.toContain('Missing one of the three');
  });
});

describe('E-5 part 3 — directivity is read where BOTH measurements are valid', () => {
  /* A bench where the two curves are equal above 400 Hz and the off-axis curve
   * is a HELD EDGE below it — which is exactly what `interpLog` produces for a
   * gated angle file resampled onto a merged axis. The −6 dB crossing the scan
   * would find down there is an artefact of the clamp and nothing else. */
  const grid: number[] = [];
  for (let f = 20; f <= 20000; f *= 2 ** (1 / 24)) grid.push(f);
  const VALID: readonly [number, number] = [400, 20000];
  /* THE SHAPE THAT PRODUCES THE ARTEFACT, and it is the shape a merged woofer
   * has. Below 400 Hz the ON-AXIS curve is a reflex response: down at 20 Hz,
   * up over its box peak near 50, back to the passband by 400. The OFF-AXIS
   * curve is HELD at its 400 Hz value, because that is where its own data
   * stops — which is what `interpLog` does to a gated angle file resampled onto
   * a merged axis. The difference therefore starts ABOVE −6 dB and falls
   * through it as the box peak rises, so the scan — which takes the first
   * DOWNWARD crossing from the bottom — reports a beaming ceiling in the bass.
   * Above 400 both curves are real and the off-axis beams, crossing −6 dB where
   * the cone actually narrows. */
  const through = (pts: readonly [number, number][], f: number): number => {
    for (let i = 1; i < pts.length; i++) {
      if (f <= pts[i][0]) {
        const t = Math.log(f / pts[i - 1][0]) / Math.log(pts[i][0] / pts[i - 1][0]);
        return pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
      }
    }
    return pts[pts.length - 1][1];
  };
  const REFLEX: readonly [number, number][] = [
    [20, -4],
    [50, 8],
    [VALID[0], 0],
  ];
  const onAxis = grid.map((f) => (f < VALID[0] ? through(REFLEX, f) : 0));
  const offAxis = grid.map((f) =>
    f <= VALID[0] ? 0 : Math.min(0, (-12 * Math.log2(f / VALID[0])) / 3.32),
  );

  it('WITHOUT the band the clamp wins: the ceiling lands in the bass', () => {
    const d = directivityFromPair(onAxis, offAxis, grid, 15);
    expect(d.minus6Hz).not.toBeNull();
    expect(d.minus6Hz!).toBeLessThan(VALID[0]);
  });

  it('WITH the band the ceiling is the real one, above the pair’s floor', () => {
    const d = directivityFromPair(onAxis, offAxis, grid, 15, { bandHz: VALID });
    expect(d.minus6Hz).not.toBeNull();
    expect(d.minus6Hz!).toBeGreaterThan(VALID[0]);
    expect(d.bandHz[0]).toBeGreaterThanOrEqual(VALID[0]);
  });

  it('absent is the whole grid — byte for byte what every caller had (P2)', () => {
    const a = directivityFromPair(onAxis, offAxis, grid, 15);
    const b = directivityFromPair(onAxis, offAxis, grid, 15, {
      bandHz: [grid[0], grid[grid.length - 1]],
    });
    expect(b.grid).toEqual(a.grid);
    expect(b.differenceDb).toEqual(a.differenceDb);
    expect(b.minus6Hz).toBe(a.minus6Hz);
    expect(b.bandHz).toEqual(a.bandHz);
  });

  it('a band with no points at all produces NOTHING rather than a number', () => {
    const d = directivityFromPair(onAxis, offAxis, grid, 15, { bandHz: [30000, 40000] });
    expect(d.minus3Hz).toBeNull();
    expect(d.minus6Hz).toBeNull();
    expect(d.grid).toEqual([]);
  });

  it('the estimator version moved with the behaviour (schatter-versionering)', () => {
    expect(ESTIMATOR_VERSIONS['spl-directivity']).toBe('1.1');
  });

  it('on casus 1 the real pair is read on the intersection of its own two bands', () => {
    const r = buildReport({ manifest, files, filter: null, geometry, settings: base });
    for (const d of r.ingest.drivers) {
      if (d.directivity.length === 0 || !d.onAxis) continue;
      for (const pair of d.directivity) {
        const off = d.angles.find((a) => a.angleDeg === pair.angleDeg);
        if (!off) continue;
        expect(pair.bandHz[0], `${d.driver} ${pair.angleDeg}`).toBeGreaterThanOrEqual(
          Math.max(d.onAxis.bandHz[0], off.bandHz[0]) - 1e-9,
        );
      }
    }
  });
});

describe('E-5 part 4 — a metric with no subject is OFF with a reason, not a crash', () => {
  /* Real reports rather than a hand-made context: what a project with one
   * measured way looks like is exactly the thing this got wrong, so it is
   * assembled the way the app assembles it — by taking files away. */
  const matrixWith = (drivers: string[]) =>
    buildReport({
      manifest: { ...manifest, entries: manifest.entries.filter((e) => drivers.includes(e.driver)) },
      files: files.filter((f) => drivers.includes(f.entry.driver)),
      filter: null,
      geometry,
      settings: base,
    }).capability;

  it('with one way the pair metrics get a cell on `no subject`, off, with the reason', () => {
    const m = matrixWith(['woofer']);
    const none = m.cells.filter((c) => c.subject === NO_SUBJECT);
    expect(none.length).toBeGreaterThan(0);
    for (const c of none) {
      expect(c.active).toBe(false);
      expect(c.reasons.join(' ')).toMatch(/no adjacent pair|no measured way/);
    }
    // EVERY declared metric has a cell now — which is what the renderer's
    // `.find(…)!` always assumed and was wrong about.
    for (const id of m.metrics) expect(m.cells.some((c) => c.metric === id), id).toBe(true);
  });

  it('with no way at all, the driver metrics say so too', () => {
    const m = matrixWith([]);
    for (const id of m.metrics) expect(m.cells.some((c) => c.metric === id), id).toBe(true);
    expect(m.cells.some((c) => c.reasons.join(' ').includes('no measured way'))).toBe(true);
  });

  it('a THREE-WAY project has no such column — the repair costs nothing (P2)', () => {
    const m = matrixWith(['woofer', 'mid', 'tweeter']);
    expect(m.subjects).not.toContain(NO_SUBJECT);
    expect(m.cells.some((c) => c.subject === NO_SUBJECT)).toBe(false);
  });

  it('deleting a branch’s 0° response DETACHES what pointed at it', () => {
    /* The near-field merge keeps the far field it was built from so "undo
     * merge" can put it back (I-2); with the response deleted there is nothing
     * to undo into, and a pending preview would be offered for a branch that no
     * longer exists. The INGREDIENTS stay — they measure a driver, not a file. */
    const remove = APP.slice(APP.indexOf("detail: t('FRD — SPL response (0°)')"));
    const body = remove.slice(0, remove.indexOf('});'));
    expect(body).toContain('setLoaded(null)');
    expect(body).toContain('dropAngles(() => false)');
    expect(body).toContain('far: null, mergedName: null');
    expect(body).toContain('setNfPreview(');
    // And it does NOT throw the near field away with it.
    expect(body).not.toContain('cone: null');
  });
});

describe('E-5 — the app says which limits collided', () => {
  it('an EMPTY window names its floor and its ceiling on the line beside the button', () => {
    const at = APP.indexOf("EMPTY — no crossing frequency is allowed");
    expect(at).toBeGreaterThan(0);
    const block = APP.slice(at - 900, at + 600);
    expect(block).toContain("by(w.floorBy)");
    expect(block).toContain("by(w.ceilingBy)");
  });

  it('the chain frame is read on BOTH v2 routes, and only when v2 is the engine', () => {
    /* Two call sites — the three-way run and the two-way one — and each of them
     * behind the engine decision as a ternary, so a v1 run is handed its own
     * grid and its own band and the toggle invariant is untouched. */
    expect(APP.split('v2ChainFrame({').length - 1).toBe(2);
    for (const name of ['v2Frame', 'twoWayFrame']) {
      const at = APP.indexOf(`const ${name} = useV2`);
      expect(at, name).toBeGreaterThan(0);
      expect(APP.slice(at, at + 160), name).toContain('? v2ChainFrame({');
    }
    // And the chain input reads the frame rather than the plot grid.
    expect(APP).toContain('grid: [...chainGrid]');
    expect(APP).toContain('driverZ: chainBranches.z');
  });

  it('the frame’s notes survive: nothing RESETS the run notes after they are added', () => {
    /* Caught by a browser run and not by a test, which is why it is one now.
     * The two-way route appended the frame's notes and then replaced the whole
     * array four lines later, so they were thrown away in silence. The claim is
     * ORDERING: on each route the only assignment that replaces the array comes
     * at or before the frame's own contribution. */
    const lines = APP.split('\n');
    const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
    const replaces = lines
      .map((l, i) => (/setV2RunNotes\(\s*$|setV2RunNotes\(\[/.test(l) ? i : -1))
      .filter((i) => i >= 0);
    expect(replaces.length).toBe(2); // one per route
    // Three-way: the frame appends AFTER the reset.
    const threeWayReset = replaces[0];
    const threeWayAdd = at(/setV2RunNotes\(\(prev\) => \[\.\.\.prev, \.\.\.v2Frame\.notes\]\)/);
    expect(threeWayAdd).toBeGreaterThan(threeWayReset);
    // Two-way: the frame is spread INTO the reset, so there is nothing to lose.
    const twoWayAdd = at(/\.\.\.twoWayFrame\.notes,/);
    expect(twoWayAdd).toBeGreaterThan(replaces[1]);
    expect(twoWayAdd - replaces[1]).toBeLessThan(12);
    // And each route contributes its notes exactly once — the three-way line
    // names them twice (the guard and the spread), the two-way once.
    expect(APP.split('v2Frame.notes').length - 1).toBe(2);
    expect(APP.split('twoWayFrame.notes').length - 1).toBe(1);
  });

  it('the crossings-you-state field is ONE field, and it is not gated on the way count', () => {
    /* Part 5 of the session: the field renders on the three-way route as well,
     * and the claim is structural — one textarea, bound to one setting, with no
     * `threeWay` between it and the panel it lives in. */
    const at = APP.indexOf('value={engineV2Settings.statedCrossings}');
    expect(at).toBeGreaterThan(0);
    expect(APP.split('value={engineV2Settings.statedCrossings}').length - 1).toBe(1);
    // The drawer it sits in, and everything from the drawer down to the field,
    // must not mention the way count.
    const drawer = APP.lastIndexOf('<details className="v2-more"', at);
    expect(drawer).toBeGreaterThan(0);
    expect(APP.slice(drawer, at)).not.toContain('threeWay');
  });
});
