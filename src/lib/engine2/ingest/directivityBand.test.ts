/**
 * E-5b — THE SHAPE SANDER SAW: a merged axis against gated angle files.
 *
 * E-5 repaired the directivity pair (it was read with the off-axis curve
 * `interpLog`-CLAMPED past its own validity floor) and could not reproduce the
 * 34 Hz beaming ceiling that made him look: the bench in `e5Repairs.test.ts`
 * reproduces the SHAPE, but no set in this repository produced the NUMBER. This
 * file is that reproduction attempt made permanent, in the form `demoBundle.
 * test.ts` guard 1 uses — real files, asked what they say about their own
 * validity — and it reports honestly how close the real data comes.
 *
 * THE COMBINATION IS THE ONE HE HAD: the 67.7 L woofer PAIR on axis, a declared
 * NF/FF merge valid from 20.5 Hz, against the gated 15/30/45/60° files of the
 * three-way demo, valid from 397 Hz. Below 397 Hz `interpLog` holds the
 * off-axis curve at its floor value, so the difference is a held edge against a
 * real measurement, and `crossing()` takes the FIRST downward pass through
 * −6 dB from the bottom.
 *
 * HOW CLOSE IT COMES, MEASURED: on this pair the unbanded difference starts at
 * about +16 dB at 20.5 Hz and falls to roughly 0 at the off-axis floor. It
 * would have to fall about 22 dB to cross −6 on the way, so this data misses
 * the artefact by some six decibels — which is well inside what a differently
 * fitted splice moves. That is why the claim below is the INVARIANT rather than
 * a number: no directivity limit may sit under the pair's own validity floor,
 * on any data.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrd } from '../../parsers/frd.ts';
import { interpLog } from '../util.ts';
import { runIngest, type MeasurementFile } from './derive.ts';
import { parseArtaHeader, type Manifest, type ManifestEntry } from './manifest.ts';
import { directivityFromPair } from './spl.ts';
import { crossoverWindow } from '../predesign/xoWindow.ts';
import { readMergeBlock } from '../../xoWindow.ts';

/** The merged axis: the 67.7 L woofer pair, a declared NF/FF merge (M-2). */
const MERGED_DIR = join(process.cwd(), 'test-fixtures', 'koan_demo_2026-09_67L');
const MERGED_AXIS = 'woofer_pair_hor0.frd';
/** The gated angle set beside it: the three-way demo's own files (U-3). */
const GATED_DIR = join(process.cwd(), 'src', 'lib', 'parsers', 'fixtures', 'koan-3way');
const GATED_ANGLES = [15, 30, 45, 60] as const;
/** Anything under this is bass, and a beaming ceiling there is an artefact. */
const BASS_CEILING_HZ = 100;

const load = (dir: string, file: string) => {
  const p = parseFrd(readFileSync(join(dir, file), 'utf-8'));
  return { file, freq: p.freq, spl: p.spl, phaseDeg: p.phase, comments: p.meta.rawComments };
};

function ingestPair() {
  const entries: ManifestEntry[] = [];
  const files: MeasurementFile[] = [];
  const push = (f: ReturnType<typeof load>, angleDeg: number) => {
    const entry: ManifestEntry = {
      file: f.file,
      driver: 'woofer',
      kind: 'FF',
      angleDeg,
      header: parseArtaHeader([...f.comments]),
    };
    entries.push(entry);
    files.push({ entry, response: { freq: f.freq, spl: f.spl, phaseDeg: f.phaseDeg } });
  };
  push(load(MERGED_DIR, MERGED_AXIS), 0);
  for (const a of GATED_ANGLES) push(load(GATED_DIR, `woofer-pair-hor${a}.frd`), a);
  const manifest: Manifest = { sessionId: 'e5b', entries };
  return runIngest(manifest, files).drivers[0];
}

describe('E-5b — a merged axis against gated angle files', () => {
  const d = ingestPair();

  it('the premise: the axis declares a merge from 20.5 Hz and the angles are gated four hundred higher', () => {
    /* Without this the whole file could be green on a set where the two bands
     * happen to agree, and it would be testing nothing. */
    const merge = readMergeBlock(readFileSync(join(MERGED_DIR, MERGED_AXIS), 'utf-8'));
    expect(merge?.kind).toBe('NF/FF');
    expect(d.onAxis!.bandHz[0]).toBeCloseTo(20.5078, 3);
    expect(d.angles.length).toBe(GATED_ANGLES.length + 1);
    for (const off of d.angles.slice(1)) {
      expect(off.bandHz[0], `${off.angleDeg}°`).toBeGreaterThan(300);
      expect(off.bandHz[0], `${off.angleDeg}°`).toBeGreaterThan(d.onAxis!.bandHz[0] * 10);
    }
  });

  it('every pair is read on the INTERSECTION, so no reading starts under the angle files', () => {
    for (const pair of d.directivity) {
      const off = d.angles.find((a) => a.angleDeg === pair.angleDeg)!;
      expect(pair.bandHz[0], `${pair.angleDeg}°`).toBeGreaterThanOrEqual(off.bandHz[0] - 1e-9);
      expect(pair.grid[0], `${pair.angleDeg}°`).toBeGreaterThanOrEqual(off.bandHz[0] - 1e-9);
    }
  });

  it('THE INVARIANT: no directivity limit sits in the bass, and none under its own pair band', () => {
    for (const pair of d.directivity) {
      const off = d.angles.find((a) => a.angleDeg === pair.angleDeg)!;
      for (const hz of [pair.minus3Hz, pair.minus6Hz]) {
        if (hz === null) continue;
        expect(hz, `${pair.angleDeg}°`).toBeGreaterThan(BASS_CEILING_HZ);
        expect(hz, `${pair.angleDeg}°`).toBeGreaterThanOrEqual(off.bandHz[0] - 1e-9);
      }
    }
  });

  it('and the WINDOW that stands on it carries no sub-100 Hz beaming ceiling', () => {
    /* The surface Sander actually read: a `directivity` limit at 34 Hz is what
     * emptied his woofer→mid window. The limit list is walked whole, so a
     * ceiling that arrives by any other rule is not mistaken for this one. */
    const w = crossoverWindow({
      lower: 'woofer',
      upper: 'mid',
      order: 4,
      validityFloorHz: d.angles[1].bandHz[0],
      validityFloorSource: 'the gated angle files of this pair',
      upperFsHz: 88.8,
      lowerBreakups: [],
      significantBreakupDb: 3,
      lowerMinus6Hz: d.directivity[0]?.minus6Hz ?? null,
      lowerMinus6AngleDeg: d.directivity[0]?.angleDeg ?? null,
      spacingMm: null,
    });
    for (const l of w.limits) {
      if (l.rule !== 'directivity') continue;
      expect(l.hz, l.source).toBeGreaterThan(BASS_CEILING_HZ);
    }
    expect(w.empty).toBe(false);
  });

  it('HOW CLOSE the real data comes, and it is six decibels', () => {
    /* The reproduction that did not reproduce, kept as a number instead of as a
     * sentence. Read the pair the way E-5 found it being read — the off-axis
     * curve clamped onto the on-axis grid — and measure how far the difference
     * falls across the clamped region. It has to fall past −6 dB to make the
     * artefact; here it starts high and lands near zero. */
    const on = d.onAxis!;
    const off = d.angles[1];
    const offOn = on.grid.map((f) => interpLog(off.grid, off.db, f));
    const unbanded = directivityFromPair(on.db, offOn, on.grid, off.angleDeg);
    const below = unbanded.grid
      .map((f, i) => ({ f, db: unbanded.differenceDb[i] }))
      .filter((x) => x.f < off.bandHz[0]);
    expect(below.length).toBeGreaterThan(20);
    const top = below[0].db;
    const bottom = Math.min(...below.map((x) => x.db));
    // It falls a long way, and not far enough: the artefact needs it under −6.
    expect(top).toBeGreaterThan(10);
    expect(bottom).toBeGreaterThan(-6);
    expect(top - bottom).toBeGreaterThan(10);
    // And no crossing is found there, which is why E-5 could not reproduce it.
    expect(unbanded.minus6Hz === null || unbanded.minus6Hz > BASS_CEILING_HZ).toBe(true);
  });
});
