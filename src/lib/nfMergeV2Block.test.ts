import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePir } from './parsers/pir.ts';
import { parseFrd } from './parsers/frd.ts';
import { arrivalMs, impulseFromPir, mergeImpulsesV2, NF_MERGE_V2_VERSION, type MergeV2Input } from './nfMergeV2.ts';
import { MERGE_V2_BLOCK_DECIMALS as D, parseMergeBlockV2, renderMergeBlockV2, renderMergedFrdV2, type MergeV2FileInput } from './nfMergeV2Block.ts';
import { readGateHeader, readMergeBlock } from './xoWindow.ts';
import { declaredMergeValidity } from './sourceMeta.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const pir = (name: string) => impulseFromPir(name, parsePir(readFileSync(join(FIX, 'casus1_pir', `${name}.pir`))), 'augustus');
const r = (v: number, d: number) => Number(v.toFixed(d));

/** A real merge (casus 1, August, woofer down with port), and a synthetic set of echo terms to
 *  exercise every field the block carries — plane, boundary, shelf model. */
function file(): MergeV2FileInput {
  const far = pir('woofer_down_hor_0');
  const input: MergeV2Input = {
    far,
    near: pir('woofer_down_near'),
    port: {
      impulse: pir('poort_near'),
      weight: 0.205,
      echoes: [{ kind: 'boundary', label: 'tafelblad', sourceAboveM: 0.015 }],
    },
    gate: { referenceMs: arrivalMs(far) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
    model: { kind: 'an4', f0Hz: 150 },
    echoes: [{ kind: 'plane', label: 'vloer', sourceAboveM: 0.794, micAboveM: 1.38, horizontalM: 1.0 }],
    sdCm2: 255,
    fitBandHz: [300, 576],
    spliceBandHz: [400, 550],
    output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
  };
  return {
    branchLabel: 'woofer down',
    input,
    result: mergeImpulsesV2(input),
    nearName: 'woofer_down_near.pir',
    farName: 'woofer_down_hor_0.pir',
    portName: 'poort_near.pir',
    validFromHz: 20.5,
    validFromReason: 'stated as in M-1: own near field plus the port',
    referenceNote: 'arrival − 0.4 ms on the August session time base',
    madeOn: '2026-11-13',
    measuredObjectNote: 'testkast (baffle identical to the target)',
    targetValidFromHz: 62.62,
    targetValidityNote: 'k 2 × 31.31 Hz',
    calibrationNote: 'magnitude from the session FRD exports, zero phase',
  };
}

describe(`nf-merge block (${NF_MERGE_V2_VERSION}) — render and parse round-trip`, () => {
  const x = file();
  const text = renderMergedFrdV2(x);
  const p = parseMergeBlockV2(text)!;

  it('every field comes back as written, to the decimals the block promises', () => {
    const res = x.result;
    expect(p.version).toBe(NF_MERGE_V2_VERSION);
    expect(p.kind).toBe('NF/FF');
    expect(p.validFromHz).toBe(20.5);
    expect(p.validToHz).toBe(r(res.freq[res.freq.length - 1], D.hz));
    expect([p.nfSource, p.ffSource, p.portSource]).toEqual(['woofer_down_near.pir', 'woofer_down_hor_0.pir', 'poort_near.pir']);
    expect(p.sessions).toEqual({ near: 'augustus', far: 'augustus', port: 'augustus' });
    const g = x.input.gate;
    expect(p.gate).toEqual({ referenceMs: r(g.referenceMs, D.ms), leftMs: g.leftMs, rightMs: g.rightMs, rightTaper: g.rightTaper });
    expect(p.model).toEqual({ kind: 'an4', f0Hz: 150 });
    expect(p.portWeight).toBe(0.205);
    expect(p.coneEchoes).toEqual(x.input.echoes);
    expect(p.portEchoes).toEqual(x.input.port!.echoes);
    expect(p.fitBandHz).toEqual([300, 576]);
    expect(p.spliceBandHz).toEqual([400, 550]);
    expect(p.gainDb).toBe(r(res.fit.gainDb, D.gainDb));
    expect(p.delayMs).toBe(r(res.fit.delayMs, D.delayMs));
    expect(p.polarityDeg).toBe(res.fit.polarityDeg);
    expect(p.residualDeg).toBe(r(res.fit.residualRmsDeg, D.deg));
    expect(p.residualDb).toBe(r(res.fit.residualRmsDb, D.db));
    expect(p.flags).toEqual(res.flags.map((f) => f.replace(/\s+/g, ' ').replace(/=/g, ':').trim()));
    expect(p.phaseConvention).toMatch(/relative to the gate reference/);
    expect(p.measuredObject).toBe('testkast (baffle identical to the target)');
    expect(p.targetValidFromHz).toBe(62.62);
    expect(p.targetValidity).toBe('k 2 × 31.31 Hz');
    expect(p.calibration).toBe('magnitude from the session FRD exports, zero phase');
    const bare = parseMergeBlockV2(renderMergeBlockV2({ ...x, measuredObjectNote: null, targetValidFromHz: null, targetValidityNote: null, calibrationNote: null }).join('\n'))!;
    expect([bare.measuredObject, bare.targetValidFromHz, bare.targetValidity, bare.calibration]).toEqual([null, null, null, null]);
  }, 60_000);

  it('the other models and an empty port list round-trip too', () => {
    for (const model of [{ kind: 'none' } as const, { kind: 'shelf', hz: 440, depthDb: 6 } as const]) {
      const y = { ...x, input: { ...x.input, model, port: { ...x.input.port!, echoes: [] } } };
      const q = parseMergeBlockV2(renderMergeBlockV2(y).join('\n'))!;
      expect(q.model).toEqual(model);
      expect(q.portEchoes).toEqual([]);
    }
    const noPort = parseMergeBlockV2(renderMergeBlockV2({ ...x, portName: null, input: { ...x.input, port: null } }).join('\n'))!;
    expect(noPort.portSource).toBeNull();
    expect(noPort.portEchoes).toBeNull();
    expect(noPort.portWeight).toBeNull();
  });

  it('the data rows are what the merge produced, and parseFrd reads them', () => {
    const f = parseFrd(text);
    expect(f.freq.length).toBe(x.result.freq.length);
    expect(f.spl[10]).toBeCloseTo(x.result.spl[10], 3);
    expect(f.phase[10]).toBeCloseTo(x.result.phaseDeg[10], 3);
  });

  it('a v1 block is not read as v2', () => {
    const v1 = readFileSync(join(FIX, 'casus1', 'mid_hor_0_merged.frd'), 'latin1');
    expect(parseMergeBlockV2(v1)).toBeNull();
  });
});

describe('every reader of the v1 block reads a v2 block', () => {
  const x = file();
  const text = renderMergedFrdV2(x);

  it('v1 readMergeBlock (xoWindow.ts): kind, validity, sources, splice band, splice gain', () => {
    const m = readMergeBlock(text)!;
    expect(m.kind).toBe('NF/FF');
    expect(m.validFromHz).toBe(20.5);
    expect(m.validToHz).toBeCloseTo(x.result.freq[x.result.freq.length - 1], 1);
    expect([m.nfSource, m.ffSource]).toEqual(['woofer_down_near.pir', 'woofer_down_hor_0.pir']);
    expect(m.spliceBandHz).toEqual([400, 550]);
    expect(m.spliceGainDb).toBeCloseTo(x.result.fit.gainDb, 3);
  }, 60_000);

  it('v1 declaredMergeValidity (sourceMeta.ts) gives the stated floor', () => {
    const { validity } = declaredMergeValidity(readMergeBlock(text)!, { fromHz: 20, toHz: 2000 });
    expect(validity.fromHz).toBe(20.5);
  });

  it('engine2 parseArtaHeader (manifest.ts): the merge block and the stated validity', () => {
    const comments = text.split('\n').filter((l) => l.startsWith('*')).map((l) => l.replace(/^\*\s*/, ''));
    const h = parseArtaHeader(comments);
    expect(h.merge?.kind).toBe('NF/FF');
    expect(h.statedValidity?.fromHz).toBe(20.5);
    expect(h.merge?.nfSource).toBe('woofer_down_near.pir');
    expect(h.merge?.ffSource).toBe('woofer_down_hor_0.pir');
    expect(h.merge?.spliceBandHz).toEqual([400, 550]);
    expect(h.merge?.spliceGainDb).toBeCloseTo(x.result.fit.gainDb, 3);
    expect(h.merge?.spliceDelayMs).toBeCloseTo(x.result.fit.delayMs, 5);
    expect(h.merge?.splicePhaseResidualDeg).toBeCloseTo(x.result.fit.residualRmsDeg, 2);
    // V60: the block does not hand engine2 a window to subtract
    expect(h.merge?.ffWindow).toBeUndefined();
  });

  it('P-1: no line of the block reads as a window statement — the gate detector answers "absent"', () => {
    expect(readGateHeader(text).kind).toBe('absent');
  });
});
