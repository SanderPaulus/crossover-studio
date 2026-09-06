/**
 * E-2 — THE EXPORTED RUN SUFFICES TO REBUILD ITS FIELD (the V48 gap).
 *
 * Three claims on casus 1, and the third is the counter-proof that makes the
 * first two worth anything:
 *
 *   1. ROUND TRIP. A field is built the way the app builds it (an exploration
 *      and a full field), exported as the block, serialised to JSON and back,
 *      and `replayField` reproduces every candidate — label, position, cage,
 *      order, alignment, window — and the stamp's `choices` digest.
 *   2. THE COMPARISON SEES. `compareCandidates` names what differs: a missing
 *      label, an extra one, a moved position.
 *   3. THE BLOCK IS NOT PADDING. Change one setting in the block (the chain
 *      budget) and the replay produces a different field, which the
 *      comparison reports — so "reproduces" is a statement about the block's
 *      content and not about a replay that ignores it.
 */

import { describe, expect, it } from 'vitest';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../casus1.fixture.ts';
import { buildReport } from '../report.ts';
import { ctcKey } from '../metrics/types.ts';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';
import { CASUS1_FIELD_STATED_ORDER, CASUS1_WINDOW_SETTINGS } from '../casus1V2.fixture.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';
import { buildCandidateField, type PairDerivationInput } from '../predesign/candidateField.ts';
import { fieldModeSettings, type FieldMode } from '../predesign/fieldMode.ts';
import { digest } from './determinism.ts';
import {
  RUN_EXPORT_FORMAT,
  buildFieldExport,
  compareCandidates,
  compareWindowInputs,
  exportedCandidates,
  fieldChoicesDigest,
  replayField,
  runExportEngine,
  type RunExport,
} from './runExport.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry: casus1Geometry(golden),
  settings: {
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: FLAT_TARGET,
    ...casus1ExcursionSettings(golden),
    ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
      ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
      : {}),
    ...CASUS1_WINDOW_SETTINGS,
  },
});

/** A block the way the app builds one, for a mode. Only the field half matters here. */
function blockFor(mode: FieldMode): RunExport {
  const wis = report.predesign.windowInputs;
  const perPair: PairDerivationInput[] = wis.map(() => ({ statedOrder: CASUS1_FIELD_STATED_ORDER }));
  const fieldSettings = fieldModeSettings(mode, { stepsPerAxis: 2, pairs: wis.length });
  const result = buildCandidateField({ windowInputs: wis, alignments: AUTO_STRUCTS, ...fieldSettings, perPair });
  return {
    format: RUN_EXPORT_FORMAT,
    exportedAt: '2026-09-06T00:00:00.000Z',
    engine: runExportEngine(),
    session: 'test',
    drivers: { idsByRole: { low: 'woofer', mid: 'mid', high: 'tweeter' }, files: [] },
    reportSettings: {},
    field: buildFieldExport(result, wis, perPair, {
      chainBudget: fieldSettings.chainBudget,
      minSpacingOctaves: result.field.parameters.minSpacingOctaves,
      ...(fieldSettings.positionPolicy !== undefined ? { positionPolicy: fieldSettings.positionPolicy } : {}),
      ...(fieldSettings.alignmentPolicy !== undefined ? { alignmentPolicy: fieldSettings.alignmentPolicy } : {}),
      alignments: AUTO_STRUCTS,
      stepsPerAxis: 2,
    }),
    run: {
      gates: {},
      budgets: {},
      determinism: {},
      chainDeclaration: { stated: {}, absent: [] },
      tuning: {},
      keys: { design: '', measurement: '', tuning: '', candidateField: '' },
    },
    stamp: null,
    shortlist: null,
  };
}

const roundTrip = (b: RunExport): RunExport => JSON.parse(JSON.stringify(b)) as RunExport;

describe('1 — round trip: the block rebuilds its own field', () => {
  it.each(['exploration', 'full'] as const)('%s: every candidate reproduces after JSON, and the choices digest with it', (mode) => {
    const block = roundTrip(blockFor(mode));
    expect(block.field.mode).toBe(mode);
    expect(block.field.candidates.length).toBeGreaterThan(0);
    const replayed = replayField(block);
    const cmp = compareCandidates(block.field.candidates, exportedCandidates(replayed));
    expect(cmp.same).toBe(true);
    expect(cmp.matched).toHaveLength(block.field.candidates.length);
    // The stamp's `choices` component is the digest of the field key; the
    // block carries the key and the replay recomputes it.
    expect(fieldChoicesDigest(replayed)).toBe(digest(block.field.key));
  });

  it('the exploration block records both policies and the full block neither', () => {
    expect(blockFor('exploration').field.settings.positionPolicy).toBe('centre-first');
    expect(blockFor('exploration').field.settings.alignmentPolicy).toBe('one');
    expect('positionPolicy' in blockFor('full').field.settings).toBe(false);
    expect(blockFor('full').field.parameters.positionPolicy).toBeUndefined();
  });

  it('the block is plain data: JSON loses nothing the replay reads', () => {
    const b = blockFor('exploration');
    expect(JSON.parse(JSON.stringify(b.field.windowInputs))).toEqual(b.field.windowInputs);
    expect(compareWindowInputs(b.field.windowInputs, roundTrip(b).field.windowInputs)).toEqual([]);
  });
});

describe('2 — the comparison names what differs', () => {
  const want = blockFor('exploration').field.candidates;

  it('identical lists are the same, and every label is matched', () => {
    const cmp = compareCandidates(want, want.map((c) => ({ ...c })));
    expect(cmp.same).toBe(true);
    expect(cmp.missing).toEqual([]);
    expect(cmp.extra).toEqual([]);
    expect(cmp.changed).toEqual([]);
  });

  it('a dropped candidate is MISSING, an added one is EXTRA, a moved position is CHANGED with the field named', () => {
    const got = want.slice(1).map((c) => ({ ...c, crossings: c.crossings.map((x) => ({ ...x })) }));
    got.push({ ...want[0], label: 'something else' });
    got[0].crossings[0] = { ...got[0].crossings[0], hz: got[0].crossings[0].hz + 1 };
    const cmp = compareCandidates(want, got);
    expect(cmp.same).toBe(false);
    expect(cmp.missing).toEqual([want[0].label]);
    expect(cmp.extra).toEqual(['something else']);
    expect(cmp.changed).toHaveLength(1);
    expect(cmp.changed[0].label).toBe(want[1].label);
    expect(cmp.changed[0].what[0]).toMatch(/ hz: /);
  });

  it('window inputs that differ are named pair by pair and field by field', () => {
    const a = blockFor('exploration').field.windowInputs;
    const b = a.map((w, i) => (i === 0 ? { ...w, upperFsHz: (w.upperFsHz ?? 0) + 1 } : w));
    const diff = compareWindowInputs(a, b);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatch(/^woofer→mid upperFsHz: /);
  });
});

describe('3 — the block is not padding: change one setting and the replay changes', () => {
  it('a different chain budget in the block yields a different field, and the comparison says so', () => {
    const block = roundTrip(blockFor('exploration'));
    const tampered: RunExport = {
      ...block,
      field: { ...block.field, settings: { ...block.field.settings, chainBudget: 2 } },
    };
    const replayed = replayField(tampered);
    expect(replayed.candidates.length).toBeLessThan(block.field.candidates.length);
    const cmp = compareCandidates(block.field.candidates, exportedCandidates(replayed));
    expect(cmp.same).toBe(false);
    expect(cmp.missing.length).toBeGreaterThan(0);
  });

  it('a different alignment policy in the block yields a different field too', () => {
    const block = roundTrip(blockFor('full'));
    const tampered: RunExport = {
      ...block,
      field: { ...block.field, settings: { ...block.field.settings, alignmentPolicy: 'one' } },
    };
    // On casus 1 with order 4 stated on both pairs the full request over
    // AUTO_STRUCTS builds LR4 only as well, so the fields coincide in
    // candidates; what MUST move is the recorded policy and hence the key.
    const replayed = replayField(tampered);
    expect(replayed.parameters.alignmentPolicy).toBe('one');
    expect(fieldChoicesDigest(replayed)).not.toBe(digest(block.field.key));
  });
});
