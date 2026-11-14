/**
 * I-4 B-4 guide — the window proposal of step 3, and the pieces of step 1 and 2 it leans on.
 *
 * The casus-1 claims read Sander's own set-up (test-fixtures/casus1_pir/opstelling.json) and pin the values
 * that were compared with his hand-picked windows (D) on 14-11-2026: woofer down ends from the set-up
 * (1.95 ms after the peak, his expectation ~1.9 ms), woofer up ends on the knee (2.14 ms) with the question.
 * The mid (67 merges, ~20 s) is not run here; its numbers stand in docs/I-4_B-4_screenshots/20.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { impulseOfItem, loadSession, proposeWay, type PlanesStated, type RigSetup } from './mergeSession.ts';
import { asStoredSetup } from './mergeStore.ts';
import {
  AN4_F0_HZ_M,
  KNEE_RISE_DEG,
  KNEE_TAIL_POINTS,
  PROPOSAL_PRE_PEAK_MS,
  SCAN_STEP_MS,
  an4F0,
  drain,
  gateForEnd,
  kneeOf,
  proposeBandsGuide,
  proposeWindow,
  proposeWindowSteps,
  rigFromDesign,
  sessionReferenceMs,
  type ScanPoint,
  type WindowProposal,
} from './mergeGuide.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const read = (n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(FIX, 'casus1_pir', n))) });
const pirs = () => readdirSync(join(FIX, 'casus1_pir')).filter((n) => n.endsWith('.pir')).map(read);

describe('the pieces, by hand', () => {
  it('AN4 f0 = 34.16 / d: the baffle width 260 mm gives 131 Hz, a pod of 170.8 mm 200 Hz; no diameter is a reason', () => {
    const w = an4F0(260, 'the baffle width');
    const p = an4F0(170.8, 'the pod diameter');
    expect('f0Hz' in w && w.f0Hz).toBeCloseTo(AN4_F0_HZ_M / 0.26, 9);
    expect('f0Hz' in w && Math.round(w.f0Hz)).toBe(131);
    expect('f0Hz' in p && Math.round(p.f0Hz)).toBe(200);
    expect(an4F0(null, 'the pod diameter')).toEqual({ reason: 'AN4 f0 needs the pod diameter — state it' });
  });
  it('the session reference is the FRD reference when there is one, else the earliest peak minus the pre-peak', () => {
    expect(sessionReferenceMs(8.75, [9, 9.4])?.ms).toBe(8.75);
    expect(sessionReferenceMs(null, [9.4, 9.0])?.ms).toBeCloseTo(9.0 - PROPOSAL_PRE_PEAK_MS, 12);
    expect(sessionReferenceMs(null, [])).toBeNull();
  });
  it('the gate for an end: left back to the reference, right = peak + end − reference', () => {
    const g = gateForEnd(9.3, 8.75, 2);
    expect(g.referenceMs).toBe(8.75);
    expect(g.leftMs).toBeCloseTo(0, 12); // the reference lies before peak − 0.4: the window starts at the reference
    expect(g.rightMs).toBeCloseTo(2.55, 12);
    expect(gateForEnd(9.0, 8.75, 1).leftMs).toBeCloseTo(0.15, 12); // reference after peak − 0.4: begin at peak − 0.4
  });
  it('the bands: fit 1/T … ka, handover from their geometric mean; too short a window is a reason', () => {
    const b = proposeBandsGuide(400, 255);
    if (!('fitHz' in b)) throw new Error(b.reason);
    expect(b.fitHz[0]).toBe(400);
    expect(b.spliceHz[0]).toBeCloseTo(Math.sqrt(400 * b.fitHz[1]), 9);
    expect('reason' in proposeBandsGuide(1100, 69)).toBe(true);
    expect('reason' in proposeBandsGuide(400, null)).toBe(true);
  });
  it(`the knee: the last point before the residual rises more than ${KNEE_RISE_DEG}° above its lowest so far`, () => {
    const s = (degs: number[]): ScanPoint[] => degs.map((deg, i) => ({ endAfterPeakMs: 1 + i * SCAN_STEP_MS, deg, db: 0 }));
    expect(kneeOf(s([3, 2, 1, 1.4, 2.4, 5]))?.deg).toBe(2.4); // 2.4 ≤ 1 + 1.5; 5 is the first past it
    expect(kneeOf(s([3, 2, 1, 1.4, 2.6]))?.deg).toBe(1.4);
    expect(kneeOf(s([3, 2, 1, 1.2]))).toBeNull();
    expect(kneeOf(s([1, 9]))?.deg).toBe(1);
  });
});

describe('step 1 — which driver a file is, proposed from its name', () => {
  it('way and member from the stem; nothing for a name that says nothing', () => {
    expect(proposeWay('woofer down')).toEqual({ way: 'low', member: 'lower' });
    expect(proposeWay('woofer up')).toEqual({ way: 'low', member: 'upper' });
    expect(proposeWay('mid')).toEqual({ way: 'mid', member: null });
    expect(proposeWay('tweeter')).toEqual({ way: 'high', member: null });
    expect(proposeWay('meting 3')).toBeNull();
  });
  it("a confirmed role wins over the name: 'ignore' drops the file, a renamed stem moves it", () => {
    const all = loadSession('x', pirs());
    const ignored = loadSession('x', pirs(), { 'mid_near.pir': { role: 'ignore', stem: 'mid' } });
    expect(all.sources.find((s) => s.stem === 'mid')?.near).toBeTruthy();
    expect(ignored.sources.find((s) => s.stem === 'mid')?.near ?? null).toBeNull();
    const moved = loadSession('x', pirs(), { 'mid_near.pir': { role: 'near', stem: 'midrange' } });
    expect(moved.sources.find((s) => s.stem === 'midrange')?.near).toBeTruthy();
  });
  it('a stored set-up reads back; a damaged one is skipped', () => {
    const rec = { id: 's1', name: 'Testkast op tafel — aug 2026', savedAt: '2026-11-14T08:00:00Z', data: { rig: { micDistanceMm: 1000 } } };
    expect(asStoredSetup(rec)).toEqual(rec);
    expect(asStoredSetup({ id: 1 })).toBeNull();
  });
});

describe('step 3 — the window proposal on casus 1, against the set-up Sander stated', () => {
  const st = JSON.parse(readFileSync(join(FIX, 'casus1_pir', 'opstelling.json'), 'utf8'));
  const rig: RigSetup = {
    bottomAboveFloorMm: st.tafelblad_boven_vloer_mm,
    surface: 'table',
    surfaceOverhangMm: null,
    surfaceOverhangMaxMm: st.tafeloverstek.hooguit_mm,
    micDistanceMm: st.mic_tot_baffle_mm,
    micHeightMm: st.mic_boven_vloer_mm,
  };
  const planes: PlanesStated = { ceiling: { kind: 'farther' }, sideWall: { kind: 'farther' }, wallBehindCabinet: { kind: 'farther' }, wallBehindMic: { kind: 'farther' } };
  const session = loadSession('aug', pirs());
  const run = (stem: string, heightMm: number, unknown = false): WindowProposal => {
    const src = session.sources.find((s) => s.stem === stem)!;
    const r = proposeWindow({
      far: impulseOfItem(src.far!, 'aug', false),
      near: impulseOfItem(src.near!, 'aug', false),
      referenceMs: 8.75,
      model: { kind: 'an4', f0Hz: 34.16 / 0.26 },
      sdCm2: 255,
      sourceHeightMm: heightMm,
      rig,
      planes,
      planesUnknown: unknown,
    });
    if ('reason' in r) throw new Error(r.reason);
    return r;
  };

  it('woofer down: the end comes from the set-up — one period at ka = 1 before the floor — 1.95 ms after the peak', () => {
    const p = run('woofer down', 794);
    expect(p.source).toBe('setup');
    expect(p.reflection?.label).toBe('floor');
    expect(p.endAfterPeakMs).toBeCloseTo(1.95, 2);
    expect(p.oneOverTHz).toBeCloseTo(339, 0);
    expect(p.question).toBeNull();
  }, 60_000);

  it('woofer up: the residual rises before the floor — the knee (2.14 ms) is the proposal, and it asks which plane', () => {
    const p = run('woofer up', 1070);
    expect(p.source).toBe('knee');
    expect(p.endAfterPeakMs).toBeCloseTo(2.14, 2);
    expect(p.question).toMatch(/which plane\?/);
    // the scan stops KNEE_TAIL_POINTS after the knee: the rise is shown, and nothing past it is computed
    const after = p.scan.filter((x) => x.endAfterPeakMs > p.knee!.endAfterPeakMs + 1e-9);
    expect(after.length).toBeLessThanOrEqual(KNEE_TAIL_POINTS + 1);
    expect(after.some((x) => x.deg > Math.min(...p.scan.map((y) => y.deg)) + KNEE_RISE_DEG)).toBe(true);
  }, 60_000);

  it('the steps and the synchronous form are one computation: draining the generator gives the same proposal', () => {
    const src = session.sources.find((s) => s.stem === 'woofer down')!;
    const opts = {
      far: impulseOfItem(src.far!, 'aug', false),
      near: impulseOfItem(src.near!, 'aug', false),
      referenceMs: 8.75,
      model: { kind: 'an4' as const, f0Hz: 34.16 / 0.26 },
      sdCm2: 255,
      sourceHeightMm: 794,
      rig,
      planes,
      planesUnknown: false,
    };
    let yields = 0;
    const g = proposeWindowSteps(opts);
    for (;;) {
      const r = g.next();
      if (r.done) {
        expect(JSON.stringify(r.value)).toBe(JSON.stringify(drain(proposeWindowSteps(opts))));
        break;
      }
      yields++;
    }
    expect(yields).toBeGreaterThan(0); // one per merge: the tool can give the page a turn between them
  }, 60_000);

  it('no S_d, no height: a reason, never a default', () => {
    const src = session.sources.find((s) => s.stem === 'woofer down')!;
    const base = { far: impulseOfItem(src.far!, 'aug', false), near: impulseOfItem(src.near!, 'aug', false), referenceMs: 8.75, model: { kind: 'an4' as const, f0Hz: 131 }, rig, planes, planesUnknown: false };
    expect(proposeWindow({ ...base, sdCm2: null, sourceHeightMm: 794 })).toHaveProperty('reason');
    expect(proposeWindow({ ...base, sdCm2: 255, sourceHeightMm: null })).toHaveProperty('reason');
  });
});

describe('step 2 — A, C and D taken over from "Your cabinet"', () => {
  const base = { micDistanceMm: 1000, micElevationDeg: 0, refHeightMm: 1380, baffleHeightMm: 1124, refFromTopMm: 244, ownGeometry: false };
  it("casus 1's own numbers: reference 1380 mm above the floor on a 1124 mm baffle (reference 244 from the top) is A 500 / C 1000 / D 1380", () => {
    expect(rigFromDesign(base)).toMatchObject({ a: 500, c: 1000, d: 1380, missing: [] });
  });
  it('a vertical angle goes into C and D by the same geometry as the floor-bounce prediction', () => {
    const r = rigFromDesign({ ...base, micElevationDeg: 30 });
    expect(r.c).toBeCloseTo(1000 * Math.cos(Math.PI / 6), 9);
    expect(r.d).toBeCloseTo(1380 + 500, 9);
    expect(r.a).toBe(500); // the cabinet does not move with the mic
  });
  it('never a guess: a measured object with its own geometry gets no A, and what is missing is named', () => {
    expect(rigFromDesign({ ...base, ownGeometry: true }).a).toBeNull();
    const r = rigFromDesign({ ...base, refHeightMm: null });
    expect([r.a, r.c, r.d]).toEqual([null, 1000, null]);
    expect(r.missing.join(' ')).toMatch(/reference point above the floor/);
    expect(rigFromDesign({ ...base, baffleHeightMm: null }).a).toBeNull();
    expect(rigFromDesign({ ...base, refHeightMm: 500 }).a).toBeNull(); // below the floor: the form disagrees with itself
  });
});

describe('the tool — what a source scan can see', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'NfMergeTool.tsx'), 'utf8');
  it('the proposal runs in slices with a progress line, never in one block on the main thread', () => {
    expect(src).toMatch(/proposeWindowSteps\(/);
    expect(src).not.toMatch(/\bproposeWindow\(/);
    expect(src).toMatch(/PROPOSAL_SLICE_MS/);
    expect(src).toMatch(/role="status"/);
  });
  it('in one column the sessions block scrolls away: the narrow-screen rule comes after the sticky rule', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8');
    const sticky = css.indexOf('.nfm-sessions { display: flex; flex-direction: column; gap: 0.5rem; position: sticky');
    const narrow = css.search(/@media \(max-width: 900px\) \{[^}]*\}[^}]*\.nfm-sessions \{ position: static; \}/);
    expect(sticky).toBeGreaterThan(-1);
    expect(narrow).toBeGreaterThan(sticky);
  });
  it('steps 4 and 5 open with an overview: one row per driver from the merges already computed, each with its SPL', () => {
    expect(src).toMatch(/\{step === 'merge' && <DriverOverview rows=\{overviewRows\}/);
    expect(src).toMatch(/\{step === 'export' && \([\s\S]{0,300}<DriverOverview\s+rows=\{overviewRows\}/); // step 5 shows the same rows
    expect(src).toMatch(/comp: computed\.get\(d\.stem\)/); // no second computation for the overview
    const body = src.slice(src.indexOf('function DriverOverview('), src.indexOf('function Charts('));
    expect(body).toMatch(/<Chart\b/);
    expect(body).toMatch(/predictionDb[\s\S]*farGatedDb[\s\S]*\.spl/);
    expect(body).not.toMatch(/mergeImpulsesV2\(/);
  });
  it('the window and merge panels remount per driver: a draft typed for one driver cannot land on another', () => {
    expect(src).toMatch(/<WindowStep\s+key=\{active\.stem\}/);
    expect(src).toMatch(/<WorkPanel\s+key=\{active\.stem\}/);
  });
});
