/**
 * M-1 — THE MERGE BLOCK: what a merged NF/FF file says about itself, and what
 * the validity rule does with it.
 *
 * Four claims, each the kind V23 asks for (a mechanism that changes nothing is
 * indistinguishable from one that is not connected):
 *
 *  1. THE PARSER reads the block by FIELD NAME, not by prose: `Valid from =
 *     20.5 Hz` is a floor, "geldig vanaf 20,5 Hz" in a comment is not, and the
 *     merge fields come back typed.
 *  2. THE FLOOR of a declared merge is the block's, with provenance
 *     `merge-block`, the advisory FF/NF detector ABSTAINS on it (a fit of the
 *     recipe against its own ingredients may not raise a floor), and the
 *     far-field half's 2/T is the fine-detail floor.
 *  3. A5b.1(i) IS NOT RELAXED BY THE BACK DOOR: `Valid from` on a GATED file
 *     (no `Merge =`) is kept as data and the header floor stands; a merge that
 *     states no `Valid from` has an UNKNOWN floor, not a guessed one.
 *  4. ON THE CASUS-1 FILES the merged set reads the merge floors and the gated
 *     set reads the gate floor — the same manifest builder, two sets, and the
 *     difference is exactly the three swapped files.
 */

import { describe, expect, it } from 'vitest';
import { parseArtaHeader, type ManifestEntry } from './manifest.ts';
import { validityOf, type BaffleStepFit } from './validity.ts';
import { HEADER_FLOOR_ABSOLUTE_OVER_T, HEADER_FLOOR_TRUSTED_OVER_T } from '../constants.ts';
import { runIngest } from './derive.ts';
import { casus1Files, casus1Manifest, casus1MergedSet, loadGolden } from '../casus1.fixture.ts';

const BLOCK = [
  'Koan 2951 - woofer BOVEN (W1), PREDICTIE na inspelen',
  'geldigheidsplafond 550 Hz | fb-autoriteit = ZMA 31.3 Hz | status: PLACEHOLDER tot groundplane',
  'Merge = NF/FF',
  'Valid from = 20.5 Hz',
  'Valid to = 20000 Hz',
  'Merge NF source = woofer_up_near.txt',
  'Merge FF source = woofer_up_hor_0.txt',
  'Merge FF window = reference 2.5 ms, right 5.021 ms, Tukey 0.25',
  'Merge splice band = 500-800 Hz',
  'Merge splice fit = gain -7.92 dB, delay 0.5433 ms',
  'Merge step model = shelf 6 dB @ 440 Hz, first order',
  'Merge port model = 0.5 x port, g 0.41',
  'Merge prediction = break-in, mild (Cms +5.2 %)',
  'Merge floor reason = the port is summed in',
  'Merge status = PLACEHOLDER tot groundplane',
];

const entryOf = (comments: string[], kind: ManifestEntry['kind'] = 'FF'): ManifestEntry => ({
  file: 'x.frd',
  driver: 'woofer',
  kind,
  angleDeg: 0,
  header: parseArtaHeader(comments),
});

/** An advisory fit that WOULD raise the floor to 120 Hz on a gated file. */
const RAISING_FIT: BaffleStepFit = {
  f0Hz: 440,
  depthDb: 6,
  exponent: 1.5,
  offsetDb: -8,
  residualRmsDb: 0.4,
  residualToleranceDb: 1.75,
  fits: true,
  breaksBelowHz: 120,
  fittedBand: [40, 560],
};

describe('M-1 — the merge block is read by field name', () => {
  it('parses every field of the block, typed', () => {
    const h = parseArtaHeader(BLOCK);
    expect(h.merge?.kind).toBe('NF/FF');
    expect(h.statedValidity).toEqual({ fromHz: 20.5, toHz: 20000 });
    expect(h.merge?.nfSource).toBe('woofer_up_near.txt');
    expect(h.merge?.ffSource).toBe('woofer_up_hor_0.txt');
    expect(h.merge?.ffWindow).toEqual({ referenceTimeMs: 2.5, rightWindowMs: 5.021, effectiveWindowMs: 5.021 - 2.5 });
    expect(h.merge?.spliceBandHz).toEqual([500, 800]);
    expect(h.merge?.spliceGainDb).toBe(-7.92);
    expect(h.merge?.spliceDelayMs).toBe(0.5433);
    expect(h.merge?.stepModel).toContain('shelf 6 dB @ 440 Hz');
    expect(h.merge?.portModel).toContain('g 0.41');
    expect(h.merge?.prediction).toContain('Cms');
    expect(h.merge?.floorReason).toContain('port');
    expect(h.merge?.status).toContain('PLACEHOLDER');
    // The FF window travels as a MERGE field: it is NOT the file's own window,
    // so the gate-floor machinery must not see it as one.
    expect(h.effectiveWindowMs).toBeUndefined();
    expect(h.referenceTimeMs).toBeUndefined();
    // Prose with a number in it is prose: "geldigheidsplafond 550 Hz" set nothing.
    expect(h.statedValidity?.toHz).toBe(20000);
  });

  it('prose is not a header: the same words without "Name = value" yield no merge and no floor', () => {
    const h = parseArtaHeader(['gemerged NF/FF, geldig vanaf 20,5 Hz', 'merge: NF/FF']);
    expect(h.merge).toBeUndefined();
    expect(h.statedValidity).toBeUndefined();
  });

  it('a merge block without "Merge = …" is not a merge: its fields are dropped, the stated validity is kept as data', () => {
    const h = parseArtaHeader(BLOCK.filter((l) => !l.startsWith('Merge =')));
    expect(h.merge).toBeUndefined();
    expect(h.statedValidity?.fromHz).toBe(20.5);
  });
});

describe('M-1 — the validity of a declared merge', () => {
  const extent: [number, number] = [20.5078, 19999.51];

  it('takes its floor from the block, with provenance merge-block, and the FF half\'s 2/T as fine detail', () => {
    const v = validityOf({ entry: entryOf(BLOCK), extent });
    expect(v.fromHz).toBe(20.5078); // the block says 20.5, the file starts at 20.5078: the higher of the two
    expect(v.floorProvenance).toBe('merge-block');
    expect(v.fromReason).toContain('valid from 20.5 Hz as its merge block states');
    expect(v.fromReason).toContain('woofer_up_near.txt below the splice (500–800 Hz)');
    expect(v.fromReason).toContain('Floor reason: the port is summed in');
    expect(v.toHz).toBe(19999.51);
    expect(v.fineDetailFromHz).toBeCloseTo(HEADER_FLOOR_TRUSTED_OVER_T / ((5.021 - 2.5) / 1000), 6);
    expect(v.notes.join(' ')).toContain('PLACEHOLDER');
    expect(v.notes.join(' ')).toContain('Merge prediction');
    expect(v.estimators.map((e) => e.id)).toEqual(['validity-header']);
  });

  it('the advisory FF/NF detector ABSTAINS on a merge, and says so', () => {
    const merged = validityOf({ entry: entryOf(BLOCK), extent, ffnf: RAISING_FIT });
    expect(merged.fromHz).toBe(20.5078);
    expect(merged.floorProvenance).toBe('merge-block');
    expect(merged.notes.join(' ')).toContain('NOT applied');
    // The counter-proof: the same fit on a GATED file with a lower header
    // floor DOES raise it — the abstention is specific to the merge.
    const gated = validityOf({
      entry: entryOf(['Reference time = 0 ms', 'Right window = 20 ms, Tukey 0.25']),
      extent,
      ffnf: RAISING_FIT,
    });
    expect(gated.fromHz).toBe(120);
    expect(gated.floorProvenance).toBe('ffnf');
  });

  it('"Valid to" only narrows, and a stated ceiling above the sweep is the sweep', () => {
    const narrow = validityOf({ entry: entryOf(BLOCK.map((l) => (l.startsWith('Valid to') ? 'Valid to = 550 Hz' : l))), extent });
    expect(narrow.toHz).toBe(550);
    expect(narrow.toReason).toContain('valid to 550 Hz as the merge block states');
    const wide = validityOf({ entry: entryOf(BLOCK.map((l) => (l.startsWith('Valid to') ? 'Valid to = 30000 Hz' : l))), extent });
    expect(wide.toHz).toBe(19999.51);
  });

  it('A5b.1(i) stands: "Valid from" on a GATED file does not relax the header floor', () => {
    const v = validityOf({
      entry: entryOf(['Reference time = 2,5 ms', 'Right window = 5,021 ms, Tukey 0.25', 'Valid from = 20.5 Hz']),
      extent,
    });
    expect(v.fromHz).toBeCloseTo(HEADER_FLOOR_ABSOLUTE_OVER_T / ((5.021 - 2.5) / 1000), 6);
    expect(v.floorProvenance).toBe('header');
  });

  it('a merge that states no floor has an UNKNOWN floor — not the sweep start, not a guess', () => {
    const v = validityOf({ entry: entryOf(BLOCK.filter((l) => !l.startsWith('Valid from'))), extent });
    expect(v.fromHz).toBeNull();
    expect(v.floorProvenance).toBe('none');
    expect(v.fromReason).toContain('UNKNOWN');
    expect(v.notes.join(' ')).toContain('Valid from');
  });

  it('a merge block without the FF window yields no fine-detail floor rather than a guessed one', () => {
    const v = validityOf({ entry: entryOf(BLOCK.filter((l) => !l.startsWith('Merge FF window'))), extent });
    expect(v.fineDetailFromHz).toBeNull();
    expect(v.notes.join(' ')).toContain('Merge FF window');
  });
});

describe('M-1 — the two casus-1 measurement sets', () => {
  const golden = loadGolden();
  const merged = casus1Manifest(golden, 'merged');
  const gated = casus1Manifest(golden, 'gated');

  it('the merged set swaps exactly the files gemergde_set names, in place, and nothing else', () => {
    const set = casus1MergedSet(golden);
    expect(Object.keys(set).length).toBe(3);
    expect(merged.entries.length).toBe(gated.entries.length);
    for (let i = 0; i < gated.entries.length; i++) {
      const g = gated.entries[i];
      const m = merged.entries[i];
      const swap = Object.entries(set).find(([, t]) => t.vervangt === g.file);
      expect(m.file).toBe(swap ? swap[0] : g.file);
      expect(m.driver).toBe(g.driver);
      expect(m.kind).toBe(g.kind);
      expect(m.angleDeg).toBe(g.angleDeg);
    }
    expect(merged.sessionId).not.toBe(gated.sessionId);
  });

  it('on the merged set the woofer and the mid read their merge floors; on the gated set the gate', () => {
    const m = runIngest(merged, casus1Files(merged));
    const g = runIngest(gated, casus1Files(gated));
    const at = (r: typeof m, d: string) => r.drivers.find((x) => x.driver === d)!.onAxis!;
    const P = golden.manifest_en_geometrie as unknown as {
      gemergde_set: { merge_parameters: Record<string, { geldig_van_Hz: number }> };
    };
    const floorOf = (file: string) => P.gemergde_set.merge_parameters[file].geldig_van_Hz;
    expect(at(m, 'woofer').bandFloorProvenance).toBe('merge-block');
    expect(at(m, 'woofer').bandHz[0]).toBeCloseTo(Math.max(floorOf('Koan_W_up_merged_ingespeeld_mild.frd'), 20.5078), 3);
    expect(at(m, 'mid').bandFloorProvenance).toBe('merge-block');
    expect(at(m, 'mid').bandHz[0]).toBeCloseTo(floorOf('Koan_M_merged.frd'), 6);
    // The tweeter is NOT merged and keeps its gate.
    expect(at(m, 'tweeter').bandFloorProvenance).toBe('header');
    expect(at(m, 'tweeter').bandHz[0]).toBeCloseTo(at(g, 'tweeter').bandHz[0], 6);
    // ...and the gated set is what it always was.
    for (const d of ['woofer', 'mid', 'tweeter']) expect(at(g, d).bandFloorProvenance).toBe('header');
    expect(at(g, 'woofer').bandHz[0]).toBeGreaterThan(at(m, 'woofer').bandHz[0]);
    // Above the splice the merged files ARE the gated files: the mid's breakups
    // above 1 kHz come out within the frequency class of the gated reading.
    const pct = golden.toleranties.frequenties_pct;
    for (const p of at(g, 'mid').grid.length ? g.drivers.find((x) => x.driver === 'mid')!.breakups!.peaks.filter((q) => q.dB >= 2.5 && q.fHz > 1000) : []) {
      const hit = m.drivers.find((x) => x.driver === 'mid')!.breakups!.peaks.find((q) => Math.abs(q.fHz / p.fHz - 1) * 100 <= pct);
      expect(hit, `mid breakup at ${p.fHz.toFixed(0)} Hz survives the merge`).toBeTruthy();
    }
  });
});
