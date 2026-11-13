import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { FIT_RESIDUAL_FLAG_DEG, mergeImpulsesV2, planeEchoDelayS, type PlaneEcho } from './nfMergeV2.ts';
import {
  branchFile,
  checksOf,
  echoesForSource,
  exportPackage,
  gateAfterArrivalMs,
  gateOf,
  impulseOfItem,
  loadSession,
  proposeBands,
  reflectionReachMm,
  setupStatus,
  statusOf,
  stemOf,
  type PlanesStated,
  type RigSetup,
} from './mergeSession.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const read = (dir: string, n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(FIX, dir, n))) });
/** What a user drops for casus 1, August: the eight PIRs, the session's own FRD exports, the impedance. */
function casus1Drop() {
  const pirs = readdirSync(join(FIX, 'casus1_pir')).filter((n) => n.endsWith('.pir')).map((n) => read('casus1_pir', n));
  const frds = ['woofer_down_hor_0.txt', 'woofer_up_hor_0.txt', 'mid_hor_0.txt', 'tweeter_hor_0.txt', 'woofer_down_near.txt', 'woofer_up_near.txt', 'mid_near.txt'].map((n) => read('casus1', n));
  return [...pirs, ...frds, read('casus1', 'woofers_parallel__1_.lim')];
}
const session = loadSession('augustus', casus1Drop());

describe('the session from the dropped files', () => {
  it('names to stems and roles, two spellings of one measurement', () => {
    expect(stemOf('woofer down hor 0.pir')).toEqual({ stem: 'woofer down', role: 'far' });
    expect(stemOf('woofer_down_near.txt')).toEqual({ stem: 'woofer down', role: 'near' });
    expect(stemOf('poort_near.pir')).toEqual({ stem: 'poort', role: 'near' });
  });
  it('casus 1: three drivers to merge, a port, a far-only tweeter; every PIR paired with its FRD export', () => {
    const kinds = Object.fromEntries(session.sources.map((s) => [s.stem, s.kind]));
    expect(kinds).toEqual({ mid: 'driver', poort: 'port', tweeter: 'far-only', 'woofer down': 'driver', 'woofer up': 'driver' });
    for (const s of session.sources.filter((x) => x.far)) {
      expect(s.far!.pir).not.toBeNull();
      expect(s.far!.frdText).not.toBeNull();
    }
    expect(session.timeBaseShared).toBe(true);
    expect(session.impedances.map((z) => z.name)).toEqual(['woofers_parallel__1_.zma']);
  });
  it('the gate comes from the header, Left/Right as lengths (V60), its reference where the FRD phase zero lies on the PIR (V56)', () => {
    const g = gateOf(session.sources.find((s) => s.stem === 'woofer down')!.far!);
    expect('gate' in g && g.route).toBe('pir');
    if (!('gate' in g)) throw new Error('no gate');
    expect(g.gate.referenceMs).toBeCloseTo(8.75, 3);
    expect([g.gate.leftMs, g.gate.rightMs, g.gate.rightTaper]).toEqual([0, 5.021, 0.25]);
  });
  it('no header, no gate: refused with the field named', () => {
    const bare = loadSession('x', [read('casus1_pir', 'mid_hor_0.pir')]);
    const g = gateOf(bare.items[0]);
    expect('error' in g && g.field).toBe('window');
  });
  it('the calibration from the near-field exports: the files agree', () => {
    expect(session.calibration).not.toBeNull();
    expect(session.calibration!.note).toMatch(/3 file\(s\) agree within 0\.00/);
  });
});

describe('the set-up and its planes', () => {
  const rig: RigSetup = { bottomAboveFloorMm: 515, surface: 'table', surfaceOverhangMm: 0, micDistanceMm: 1000, micHeightMm: 1380 };
  const planes = (over: Partial<PlanesStated> = {}): PlanesStated => ({ ceiling: { kind: 'farther' }, sideWall: { kind: 'farther' }, wallBehindCabinet: { kind: 'farther' }, wallBehindMic: { kind: 'farther' }, ...over });
  it('empty is not allowed; "unknown" is allowed and makes the merge unchecked', () => {
    const empty = setupStatus(rig, { ...planes(), ceiling: null });
    expect(empty.complete).toBe(false);
    expect(empty.missing.join(' ')).toMatch(/plane: ceiling .*empty is not allowed/);
    const unk = setupStatus(rig, planes({ sideWall: { kind: 'unknown' } }));
    expect(unk.complete).toBe(true);
    expect(unk.reflectionsChecked).toBe(false);
    expect(setupStatus({ ...rig, micHeightMm: null }, planes()).missing).toContain('microphone height above the floor');
  });
  it('the reach X = c·T/2', () => {
    expect(reflectionReachMm(4)).toBeCloseTo(686, 9);
  });
  it('a table top whose reflection point lies past its overhang: the floor reflects (woofer down, Sander 13-11-2026)', () => {
    const e = echoesForSource({ sourceHeightMm: 794, rig, planes: planes(), fitTopHz: 576 });
    expect(e.echoes).toEqual([{ kind: 'plane', label: 'floor', sourceAboveM: 0.794, micAboveM: 1.38, horizontalM: 1 }]);
    expect(e.notes.join(' ')).toMatch(/past the 0 mm overhang — the floor reflects instead/);
    // a long top catches it
    const wide = echoesForSource({ sourceHeightMm: 794, rig: { ...rig, surfaceOverhangMm: 1000 }, planes: planes(), fitTopHz: 576 });
    expect(wide.echoes[0].label).toBe('table top');
  });
  it('a port mouth on the table top is a boundary, not an echo', () => {
    const e = echoesForSource({ sourceHeightMm: 515, rig, planes: planes(), fitTopHz: 576 });
    expect(e.echoes[0]).toEqual({ kind: 'boundary', label: 'table top', sourceAboveM: 0 });
  });
  it('a measured ceiling and side wall become echoes; a wall behind is said, not modelled', () => {
    const e = echoesForSource({ sourceHeightMm: 794, rig: { ...rig, surface: 'floor' }, planes: planes({ ceiling: { kind: 'measured', mm: 2600 }, wallBehindMic: { kind: 'measured', mm: 900 } }), fitTopHz: 576 });
    expect(e.echoes.map((x) => x.label)).toEqual(['floor', 'ceiling']);
    expect(e.notes.join(' ')).toMatch(/wallBehindMic: stated .*NOT in the model/);
  });
});

describe('a merge through the section logic, casus 1 woofer down', () => {
  const src = session.sources.find((s) => s.stem === 'woofer down')!;
  const g = gateOf(src.far!);
  if (!('gate' in g)) throw new Error('no gate');
  const far = impulseOfItem(src.far!, 'augustus', false);
  const rig: RigSetup = { bottomAboveFloorMm: 515, surface: 'table', surfaceOverhangMm: 0, micDistanceMm: 1000, micHeightMm: 1380 };
  const planes: PlanesStated = { ceiling: { kind: 'farther' }, sideWall: { kind: 'farther' }, wallBehindCabinet: { kind: 'farther' }, wallBehindMic: { kind: 'farther' } };
  const run = (echoes: PlaneEcho[] | ReturnType<typeof echoesForSource>['echoes']) =>
    mergeImpulsesV2({
      far,
      near: impulseOfItem(src.near!, 'augustus', false),
      gate: g.gate,
      model: { kind: 'an4', f0Hz: 150 },
      echoes,
      sdCm2: 255,
      fitBandHz: [300, 576],
      spliceBandHz: [400, 550],
      output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 },
    });
  it('the set-up gives the floor, and the floor explains the long gate: V60 (d) through the section', () => {
    const { echoes } = echoesForSource({ sourceHeightMm: 794, rig, planes, fitTopHz: 576 });
    const r = run(echoes);
    expect(r.fit.residualRmsDeg).toBeCloseTo(3.73, 1);
    expect(r.flags).toEqual([]);
    expect(statusOf(r, setupStatus(rig, planes))).toBe('explained');
    expect(statusOf(r, setupStatus(rig, { ...planes, ceiling: { kind: 'unknown' } }))).toBe('unchecked');
    const bare = run([]);
    expect(statusOf(bare, setupStatus(rig, planes))).toBe('flags');
    const echoLine = checksOf(bare, FIT_RESIDUAL_FLAG_DEG).find((c) => c.id.startsWith('echo-3'))!;
    expect(echoLine.icon).toBe('bad');
    expect(echoLine.text).toMatch(/what stands about 0\.63 m away/);
    expect(planeEchoDelayS(echoes[0] as PlaneEcho) * 1000).toBeCloseTo(3.6, 1);
  }, 60_000);
  it('the proposals come from the window and ka', () => {
    const p = proposeBands(gateAfterArrivalMs(g.gate, far), 255);
    expect(p.fitHz![1]).toBeCloseTo(0.95 * 343 / (2 * Math.PI * Math.sqrt(0.0255 / Math.PI)), 6);
    expect(p.fitHz![0]).toBeLessThan(p.fitHz![1]);
    expect(proposeBands(4, null).fitHz).toBeNull();
  });
});

describe('the branch sum and the export package', () => {
  it('two sources: their complex sum, the strictest Valid from; the export round-trips', () => {
    const dir = join(FIX, 'koan_2026-11_merge_v2');
    const a = { name: 'woofer_down_merged_v2.frd', text: readFileSync(join(dir, 'woofer_down_merged_v2.frd'), 'latin1') };
    const b = { name: 'woofer_up_merged_v2.frd', text: readFileSync(join(dir, 'woofer_up_merged_v2.frd'), 'latin1') };
    const sum = branchFile('low', [a, b]);
    const fa = parseFrd(a.text);
    const fb = parseFrd(b.text);
    const fs = parseFrd(sum.text);
    const i = 100;
    const c = (s: number, p: number) => [10 ** (s / 20) * Math.cos((p * Math.PI) / 180), 10 ** (s / 20) * Math.sin((p * Math.PI) / 180)];
    const [ar, ai] = c(fa.spl[i], fa.phase[i]);
    const [br, bi] = c(fb.spl[i], fb.phase[i]);
    expect(fs.spl[i]).toBeCloseTo(20 * Math.log10(Math.hypot(ar + br, ai + bi)), 2);
    expect(sum.text).toMatch(/^\* Merge = NF\/FF$/m);
    expect(sum.text).toMatch(/^\* Merge sum of = woofer_down_merged_v2\.frd \| woofer_up_merged_v2\.frd$/m);
    expect(branchFile('low', [a])).toEqual(a);
    const pkg = exportPackage({
      session,
      merges: [{ source: 'woofer down', fileName: a.name, text: a.text }],
      rig: { bottomAboveFloorMm: 515, surface: 'table', surfaceOverhangMm: 0, micDistanceMm: 1000, micHeightMm: 1380 },
      measuredObjectNote: 'testkast',
      targetNote: 'doelkast',
      madeOn: '2026-11-13',
    });
    expect(pkg.map((p) => p.name)).toEqual([a.name, 'woofers_parallel__1_.zma', 'manifest.json', 'leesmij.txt']);
    const back = parseFrd(pkg[0].data);
    expect(back.spl).toEqual(fa.spl);
    expect(back.phase).toEqual(fa.phase);
    const man = JSON.parse(pkg.find((p) => p.name === 'manifest.json')!.data);
    expect(man.axes).toEqual({ X: 'horizontal', Y: 'vertical', Z: 'depth' });
    expect(pkg.find((p) => p.name === 'leesmij.txt')!.data).toMatch(/do NOT also switch on the diffraction tool/);
  });
});
