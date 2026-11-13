import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMergeBlockV2 } from './nfMergeV2Block.ts';
import { readGateHeader, readMergeBlock } from './xoWindow.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';
import { LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG } from './measuredObject.ts';
import { validityOf } from './engine2/ingest/validity.ts';
import { HEADER_FLOOR_TRUSTED_OVER_T } from './engine2/constants.ts';

// I-4 fase 2: the merge set test-fixtures/koan_2026-11_merge_v2/, written by
// scripts/merge-koan-2026-11-v2.ts from the August PIRs. Read from disk; the numbers are
// section D's (±0.2° / ±0.02 dB), the block is read by all three readers.
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures', 'koan_2026-11_merge_v2');
const SECTION_D = { woofer_down: [2.173, 0.2334], woofer_up: [2.332, 0.5968], mid: [3.508, 0.5616] } as const;

describe('koan_2026-11_merge_v2 — the August merge set (nf-merge/2.x, short gate of section D)', () => {
  it.each(Object.keys(SECTION_D) as (keyof typeof SECTION_D)[])('%s: section D, no flags, one session, one reference', (w) => {
    const text = readFileSync(join(DIR, `${w}_merged_v2.frd`), 'latin1');
    const p = parseMergeBlockV2(text)!;
    expect(p).not.toBeNull();
    expect(Math.abs(p.residualDeg! - SECTION_D[w][0])).toBeLessThanOrEqual(0.2);
    expect(Math.abs(p.residualDb! - SECTION_D[w][1])).toBeLessThanOrEqual(0.02);
    expect(p.flags).toEqual([]);
    expect(p.polarityDeg).toBe(0);
    expect(p.sessions.near).toBe('augustus');
    expect(p.sessions.far).toBe('augustus');
    expect(p.gate!.referenceMs).toBe(8.75); // the phase zero of the session's FRD exports (V56), shared by all ways
    expect(p.calibration).toMatch(/near-field FRD exports/);
    expect(p.floorReason).not.toMatch(/396/); // V60: the misread gate is not carried over
    if (w !== 'mid') expect(text).toMatch(/Merge port weight = 0\.2053 \(PROVISIONAL: .*V58/);
    // the three readers
    expect(readMergeBlock(text)!.validFromHz).toBe(p.validFromHz);
    const comments = text.split('\n').filter((l) => l.startsWith('*')).map((l) => l.replace(/^\*\s*/, ''));
    expect(parseArtaHeader(comments).merge?.kind).toBe('NF/FF');
    expect(readGateHeader(text).kind).toBe('absent');
    expect(parseFrd(text).freq.length).toBeGreaterThan(400);
  });

  it('the woofers carry the load limit for the target (M-2 model ratio within ±0.2 dB / ±5°), the mid none', () => {
    const cmp = JSON.parse(readFileSync(join(DIR, 'vergelijking.json'), 'utf8'));
    const lim = cmp.load_validity;
    expect([lim.tol_db, lim.tol_deg]).toEqual([LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG]);
    expect(lim.model).toMatch(/M-2 transform/);
    expect(lim.woofer_target_valid_from_hz).toBeGreaterThan(140);
    expect(lim.woofer_target_valid_from_hz).toBeLessThan(152);
    expect(lim.low_end_in_this_set).toMatch(/marked/);
    for (const w of ['woofer_down', 'woofer_up']) {
      const p = parseMergeBlockV2(readFileSync(join(DIR, `${w}_merged_v2.frd`), 'latin1'))!;
      expect(p.targetValidFromHz).toBeCloseTo(lim.woofer_target_valid_from_hz, 2);
    }
    const mid = parseMergeBlockV2(readFileSync(join(DIR, 'mid_merged_v2.frd'), 'latin1'))!;
    expect(mid.targetValidFromHz).toBeNull();
    expect(mid.targetValidity).toMatch(/sealed pod/);
  });

  it('the comparison: on the long gate the stated floor explains woofer_down (V60 (d)), the old merges differ by the fixed offset', () => {
    const cmp = JSON.parse(readFileSync(join(DIR, 'vergelijking.json'), 'utf8'));
    const wd = cmp.ways.woofer_down;
    expect(wd.long_gate.residual_deg).toBeGreaterThan(8);
    expect(wd.long_gate_floor.residual_deg).toBeLessThan(4);
    expect(wd.long_gate_floor.flags).toEqual([]);
    for (const w of ['woofer_down', 'woofer_up', 'mid']) expect(cmp.ways[w].new_vs_old_300_600.points).toBeGreaterThan(40);
  });
});

describe('Sander point 4: engine2 never reads a v2 merge without a floor, silently', () => {
  const entry = (comments: string[]) => ({ file: 'x.frd', driver: 'woofer', kind: 'FF' as const, angleDeg: 0, header: parseArtaHeader(comments) });
  it.each(['woofer_down', 'woofer_up', 'mid'])('%s: the floor from Valid from, the fine-detail floor from the FF window (2/T of the gate)', (w) => {
    const text = readFileSync(join(DIR, `${w}_merged_v2.frd`), 'latin1');
    const comments = text.split('\n').filter((l) => l.startsWith('*')).map((l) => l.replace(/^\*\s*/, ''));
    const p = parseMergeBlockV2(text)!;
    const v = validityOf({ entry: entry(comments), extent: [20, 20000] });
    expect(v.floorProvenance).toBe('merge-block');
    expect(v.fromHz).toBe(p.validFromHz);
    expect(v.fineDetailFromHz!).toBeCloseTo(HEADER_FLOOR_TRUSTED_OVER_T / (p.gate!.rightMs / 1000), 0);
    // without the field: no fine-detail floor, and it SAYS so — never an unrestricted read in silence
    const bare = validityOf({ entry: entry(comments.filter((l) => !l.startsWith('Merge FF window'))), extent: [20, 20000] });
    expect(bare.fineDetailFromHz).toBeNull();
    expect(bare.notes.join(' ')).toMatch(/no fine-detail floor can be derived/);
    expect(bare.fromHz).toBe(p.validFromHz);
  });
});
