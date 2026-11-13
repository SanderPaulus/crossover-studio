import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { FIT_RESIDUAL_FLAG_DEG, gateFlankAfterDirectMs, mergeImpulsesV2, planeEchoDelayS, type PlaneEcho } from './nfMergeV2.ts';
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
  chosenGate,
  interpLog,
  sourceAboveBottomMm,
  statusOf,
  stemOf,
  type CabinetGeometryForMerge,
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

/* I-4 B-4 — SYNTHETIC set-up: every number below is chosen for the test, not measured, and none of
 * it is a claim about casus 1 (whose table overhang, ceiling and walls are not stated — Sander,
 * 13-11-2026: nothing guessed in fixtures or tests). */
describe('the set-up and its planes (synthetic rig, numbers chosen for the test)', () => {
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
  it('a table top whose reflection point lies past its overhang: the floor reflects', () => {
    const e = echoesForSource({ sourceHeightMm: 794, rig, planes: planes(), fitTopHz: 576 });
    expect(e.echoes).toEqual([{ kind: 'plane', label: 'floor', sourceAboveM: 0.794, micAboveM: 1.38, horizontalM: 1 }]);
    expect(e.notes.join(' ')).toMatch(/past the 0 mm overhang — the floor reflects instead/);
    // a long top catches it
    const wide = echoesForSource({ sourceHeightMm: 794, rig: { ...rig, surfaceOverhangMm: 1000 }, planes: planes(), fitTopHz: 576 });
    expect(wide.echoes[0].label).toBe('table top');
  });
  it('B-4: an unstated overhang is not 0, and an unstated surface is not the floor — nothing is modelled, and it says so', () => {
    const e = echoesForSource({ sourceHeightMm: 794, rig: { ...rig, surfaceOverhangMm: null }, planes: planes(), fitTopHz: 576 });
    expect(e.echoes).toEqual([]);
    expect(e.notes.join(' ')).toMatch(/overhang is not known.*neither is modelled/);
    const none = echoesForSource({ sourceHeightMm: 794, rig: { ...rig, surface: null }, planes: planes(), fitTopHz: 576 });
    expect(none.echoes).toEqual([]);
    expect(none.notes.join(' ')).toMatch(/not stated: neither the floor nor a top is modelled/);
    // a source ON the top is a boundary whatever the overhang
    const port = echoesForSource({ sourceHeightMm: 515, rig: { ...rig, surfaceOverhangMm: null }, planes: planes(), fitTopHz: 576 });
    expect(port.echoes[0]).toMatchObject({ kind: 'boundary' });
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

/* Casus 1 woofer down, with ONLY what Sander stated (13-11-2026): the floor, the source 0.794 m above
 * it, the mic 1.380 m, 1.0 m horizontal. The table overhang, ceiling and walls are not stated, so the
 * planes are "unknown" here and the status is "not checked" — the floor is passed as stated, not
 * derived from a guessed rig. */
describe('a merge through the section logic, casus 1 woofer down', () => {
  const src = session.sources.find((s) => s.stem === 'woofer down')!;
  const g = gateOf(src.far!);
  if (!('gate' in g)) throw new Error('no gate');
  const far = impulseOfItem(src.far!, 'augustus', false);
  const floorAsStated: PlaneEcho = { kind: 'plane', label: 'floor', sourceAboveM: 0.794, micAboveM: 1.38, horizontalM: 1.0 };
  const unknownPlanes: PlanesStated = { ceiling: { kind: 'unknown' }, sideWall: { kind: 'unknown' }, wallBehindCabinet: { kind: 'unknown' }, wallBehindMic: { kind: 'unknown' } };
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
  it('the stated floor explains the long gate: V60 (d) through the section; the unstated planes leave it unchecked', () => {
    const r = run([floorAsStated]);
    expect(r.fit.residualRmsDeg).toBeCloseTo(3.73, 1);
    expect(r.flags).toEqual([]);
    // the rig is not part of the claim: any complete set-up with the other planes unknown
    const anyRig: RigSetup = { bottomAboveFloorMm: 0, surface: 'floor', surfaceOverhangMm: null, micDistanceMm: 1000, micHeightMm: 1380 };
    expect(statusOf(r, setupStatus(anyRig, unknownPlanes))).toBe('unchecked');
    const bare = run([]);
    expect(statusOf(bare, setupStatus(anyRig, unknownPlanes))).toBe('flags');
    const echoes = [floorAsStated];
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
      // synthetic rig: the package writes what it is given; this is not casus 1's set-up
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

/* ================================================================== *
 * I-4 B-4 — where a source sits, which window, what the flank holds,
 * and the merge laid beside its FRD on the FRD's own grid.
 * ================================================================== */

describe('B-4 — a driver height comes from geometry, and the tool asks for what is missing', () => {
  // synthetic cabinet: numbers chosen for the test
  const g = (over: Partial<CabinetGeometryForMerge['drivers']['low']> = {}): CabinetGeometryForMerge => ({
    baffleWidthMm: 260,
    baffleHeightMm: 1100,
    refFromTopMm: 200,
    drivers: {
      low: { yMm: -500, count: 2, spacingMm: 280, facingFront: true, opposed: false, ...over },
      mid: { yMm: -150, count: 1, spacingMm: null, facingFront: true, opposed: false },
      high: { yMm: 0, count: 1, spacingMm: null, facingFront: true, opposed: false },
    },
  });
  it('a single driver: baffle height − reference from top + its offset', () => {
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: 'mid', member: null }, g())).toEqual({ mm: 750, from: 'the cabinet geometry' });
  });
  it('a vertical pair: the stated member, ± half the spacing', () => {
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: 'upper' }, g())).toMatchObject({ mm: 540 });
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: 'lower' }, g())).toMatchObject({ mm: 260 });
  });
  it('a pair without a stated member is a question, never a guess from a file name', () => {
    const r = sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: null }, g());
    expect(r).toEqual({ missing: ['which member of the low pair this source is (upper or lower)'] });
  });
  it('a pair that does not stack vertically sits at its centre', () => {
    const wide = { ...g(), baffleWidthMm: 1200 };
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: null }, wide)).toMatchObject({ mm: 400 });
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: null }, g({ opposed: true }))).toMatchObject({ mm: 400 });
  });
  it('every missing geometry field is named', () => {
    const none: CabinetGeometryForMerge = { baffleWidthMm: null, baffleHeightMm: null, refFromTopMm: null, drivers: g().drivers };
    const r = sourceAboveBottomMm({ kind: 'cabinet', way: 'mid', member: null }, { ...none, drivers: { ...none.drivers, mid: { ...none.drivers.mid, yMm: null } } });
    expect(r).toEqual({ missing: ['front panel height', 'reference point below the top', "the mid driver's vertical offset"] });
    expect(sourceAboveBottomMm({ kind: 'cabinet', way: null, member: null }, g())).toEqual({ missing: ['which driver of the cabinet this source is'] });
    expect(sourceAboveBottomMm({ kind: 'own', aboveBottomMm: null }, null)).toEqual({ missing: ["this driver's height above the measured object's bottom (its own geometry)"] });
    expect(sourceAboveBottomMm({ kind: 'own', aboveBottomMm: 333 }, null)).toMatchObject({ mm: 333 });
  });
});

describe('B-4 — the window: the header by default, shorter by choice, always with 1/T', () => {
  const header = { referenceMs: 8.75, leftMs: 0, rightMs: 5.021, rightTaper: 0.25 };
  it('the header window, T = 5.021 ms, 1/T = 199.2 Hz (V60)', () => {
    const r = chosenGate(header, 'pir', null);
    expect(r).toMatchObject({ source: 'header', headerRightMs: 5.021 });
    expect('oneOverTHz' in r && r.oneOverTHz).toBeCloseTo(199.16, 2);
  });
  it('a shorter window on the PIR route', () => {
    const r = chosenGate(header, 'pir', 2.5);
    expect(r).toMatchObject({ source: 'chosen', gate: { ...header, rightMs: 2.5 }, oneOverTHz: 400 });
  });
  it('longer than the header, or any choice on the FRD route, is refused with its reason', () => {
    expect(chosenGate(header, 'pir', 6)).toMatchObject({ field: 'window' });
    expect(chosenGate(header, 'frd', 2.5)).toMatchObject({ field: 'window' });
    expect(chosenGate(header, 'pir', 0)).toMatchObject({ field: 'window' });
  });
  it('an overhang stated as unknown completes the set-up and leaves the reflections unchecked', () => {
    const rig: RigSetup = { bottomAboveFloorMm: 500, surface: 'table', surfaceOverhangMm: null, surfaceOverhangUnknown: true, micDistanceMm: 1000, micHeightMm: 1380 };
    const farther: PlanesStated = { ceiling: { kind: 'farther' }, sideWall: { kind: 'farther' }, wallBehindCabinet: { kind: 'farther' }, wallBehindMic: { kind: 'farther' } };
    const st = setupStatus(rig, farther);
    expect(st.complete).toBe(true);
    expect(st.reflectionsChecked).toBe(false);
    expect(setupStatus({ ...rig, surfaceOverhangUnknown: false }, farther).missing.join(' ')).toMatch(/overhang of the table/);
  });
  it('the status logic on a synthetic set-up: every plane stated and nothing flagged is "explained"', () => {
    const rig: RigSetup = { bottomAboveFloorMm: 500, surface: 'floor', surfaceOverhangMm: null, micDistanceMm: 1000, micHeightMm: 1380 };
    const farther: PlanesStated = { ceiling: { kind: 'farther' }, sideWall: { kind: 'farther' }, wallBehindCabinet: { kind: 'farther' }, wallBehindMic: { kind: 'farther' } };
    const clean = { flags: [] } as unknown as Parameters<typeof statusOf>[0];
    expect(statusOf(clean, setupStatus(rig, farther))).toBe('explained');
  });
});

describe('B-4 — casus 1 mid on the long header window: what the 4.35 ms "echo" was', () => {
  const src = session.sources.find((s) => s.stem === 'mid')!;
  const g = gateOf(src.far!);
  if (!('gate' in g)) throw new Error('no gate');
  const far = impulseOfItem(src.far!, 'augustus', false);
  const run = (echoes: PlaneEcho[]) =>
    mergeImpulsesV2({
      far,
      near: impulseOfItem(src.near!, 'augustus', false),
      gate: g.gate,
      model: { kind: 'an4', f0Hz: 200 },
      echoes,
      sdCm2: null,
      fitBandHz: [300, 800],
      spliceBandHz: [400, 774],
      output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 },
    });
  it('the window taper flank spans 3.29–4.54 ms after the direct sound', () => {
    const fl = gateFlankAfterDirectMs({ gate: g.gate, far })!;
    expect(fl[0]).toBeCloseTo(3.287, 2);
    expect(fl[1]).toBeCloseTo(4.542, 2);
  });
  it('without a stated plane (the mid height is open) there is nothing between 3.5 and 4.7 ms, and no flag', () => {
    const r = run([]);
    expect(r.echoesFound!.some((e) => e.afterDirectMs > 3.5 && e.afterDirectMs < 4.7)).toBe(false);
    expect(r.flags).toEqual([]);
  }, 60_000);
  /* The B-4 browser check modelled the floor at a mid height that nobody stated (0.94 m above the
   * floor, typed in during that check). Dividing out a floor echo that is not there leaves its
   * mirror image: that is the 4.35 ms "echo", in the window's taper flank. Kept as the
   * demonstration of what a guessed plane does — this height is NOT a fact about casus 1. */
  it('a plane at an unstated height produces it: in the taper flank, window weight below 0.1, and the flag says so', () => {
    const r = run([{ kind: 'plane', label: 'floor', sourceAboveM: 0.94, micAboveM: 1.38, horizontalM: 1.0 }]);
    const e = r.echoesFound!.find((x) => x.afterDirectMs > 4.2 && x.afterDirectMs < 4.5)!;
    expect(e).toBeDefined();
    expect(e.windowWeight).toBeGreaterThan(0);
    expect(e.windowWeight).toBeLessThan(0.1);
    expect(r.flags.some((f) => /taper flank \(window weight 0\.0\d\)/.test(f))).toBe(true);
  }, 60_000);
});

describe('B-4 — the merge beside its far-field FRD, on the FRD\'s own grid', () => {
  it('casus 1 mid: above 900 Hz the merge IS the FRD, within 0.02 dB and 0.1° up to 8 kHz', () => {
    const src = session.sources.find((s) => s.stem === 'mid')!;
    const g = gateOf(src.far!);
    if (!('gate' in g)) throw new Error('no gate');
    const frd = parseFrd(src.far!.frdText!);
    const grid = frd.freq.filter((f) => f >= 20 && f < 48000 / 2.2);
    const r = mergeImpulsesV2({
      far: impulseOfItem(src.far!, 'augustus', false),
      near: impulseOfItem(src.near!, 'augustus', false),
      gate: g.gate,
      model: { kind: 'an4', f0Hz: 200 },
      echoes: [],
      sdCm2: null,
      fitBandHz: [300, 800],
      spliceBandHz: [400, 774],
      output: { fromHz: grid[0], toHz: grid[grid.length - 1], pointsPerOctave: 48, grid },
    });
    expect(r.freq).toEqual(grid);
    const cal = session.calibration!;
    let maxDb = 0;
    let maxDeg = 0;
    for (let i = 0; i < r.freq.length; i++) {
      const f = r.freq[i];
      if (f < 900 || f > 8000) continue;
      const k = frd.freq.indexOf(f);
      maxDb = Math.max(maxDb, Math.abs(r.spl[i] + interpLog(cal.freq, cal.db, f) - frd.spl[k]));
      maxDeg = Math.max(maxDeg, Math.abs((((r.phaseDeg[i] - frd.phase[k] + 540) % 360) - 180)));
    }
    expect(maxDb).toBeLessThan(0.02);
    expect(maxDeg).toBeLessThan(0.1);
  }, 60_000);
});
