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
import { impulseOfItem, kaOneHz, loadSession, proposeWay, type PlanesStated, type RigSetup } from './mergeSession.ts';
import { SPLICE_KA_MARGIN } from './merger.ts';
import { FIT_RESIDUAL_FLAG_DEG } from './nfMergeV2.ts';
import { asStoredSetup } from './mergeStore.ts';
import {
  AN4_F0_HZ_M,
  KNEE_DEG,
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
  scanBandsGuide,
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
  it('the bands: fit and handover are the whole overlap 1/T … 0.95 × ka = 1 (since 15-11-2026); too short a window is a reason', () => {
    const b = proposeBandsGuide(400, 255);
    if (!('fitHz' in b)) throw new Error(b.reason);
    expect(b.fitHz[0]).toBe(400);
    expect(b.fitHz[1]).toBeCloseTo(SPLICE_KA_MARGIN * kaOneHz(255), 9);
    expect(b.spliceHz).toEqual(b.fitHz);
    // the mid of casus 1 with the knee-derived 1/T of 561 Hz: 561–1107 Hz, where the upper-half rule to ka itself
    // gave 808–1165 (Sander, 15-11-2026: "de overgang van de mid ligt erg hoog"; August used 500–800)
    const m = proposeBandsGuide(561, 69);
    if (!('fitHz' in m)) throw new Error(m.reason);
    expect(Math.round(m.spliceHz[0])).toBe(561);
    expect(Math.round(m.spliceHz[1])).toBe(1107);
    expect(Math.round(kaOneHz(69))).toBe(1165);
    expect('reason' in proposeBandsGuide(1100, 69)).toBe(true);
    expect('reason' in proposeBandsGuide(400, null)).toBe(true);
    // the SCAN keeps its own band (fit 1/T … ka, read from √(1/T·ka)): with the merge's band it would start at its
    // own end and read one point — the woofer-up knee below is pinned on this, and a source scan pins the reader
    const sc = scanBandsGuide(400, 255);
    if (!('fitHz' in sc)) throw new Error(sc.reason);
    expect(sc.fitHz).toEqual([400, kaOneHz(255)]);
    expect(sc.spliceHz[0]).toBeCloseTo(Math.sqrt(400 * kaOneHz(255)), 9);
    const src = readFileSync(new URL('./mergeGuide.ts', import.meta.url), 'utf8');
    expect(src.match(/const bands = scanBandsGuide\(/g)?.length).toBe(1);
    expect(src).not.toMatch(/const bands = proposeBandsGuide\(/);
    // the rule moved, so the version moved, and the tool keys its persisted proposals on it
    expect(src).toMatch(/MERGE_GUIDE_VERSION = 'merge-guide\/1\.2'/);
    const tool = readFileSync(new URL('../components/NfMergeTool.tsx', import.meta.url), 'utf8');
    expect(tool).toMatch(/const key = JSON\.stringify\(\[MERGE_GUIDE_VERSION, src\.stem/);
  });
  it(`the knee: the last point before the residual passes ${KNEE_DEG}° — half the ${FIT_RESIDUAL_FLAG_DEG}° convention (UI-6; until then a rise of 1.5° above the lowest so far)`, () => {
    expect(KNEE_DEG).toBe(FIT_RESIDUAL_FLAG_DEG / 2);
    const s = (degs: number[]): ScanPoint[] => degs.map((deg, i) => ({ endAfterPeakMs: 1 + i * SCAN_STEP_MS, deg, db: 0 }));
    expect(kneeOf(s([3, 2, 1, 1.4, 2.4, 5.2]))?.deg).toBe(2.4); // 5.2 is the first past KNEE_DEG
    expect(kneeOf(s([1.5, 1.7, 2.3, 3.1, 3.7, 4.0, 4.1, 4.1, 4.0, 3.9]))).toBeNull(); // the mid's slow creep (casus 1): no knee, the window runs on
    expect(kneeOf(s([3, 2, 1, 1.2]))).toBeNull();
    expect(kneeOf(s([1, 9]))?.deg).toBe(1);
    expect(kneeOf(s([9, 1]))).toBeNull(); // past the level from the first point: no end before it
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

  it('woofer up: the end comes from the set-up — the floor (4.66 ms) minus one period — 3.01 ms; the residual stays under the knee level all the way (UI-6: until then the 1.5°-rise rule stopped it at 2.14 ms)', () => {
    const p = run('woofer up', 1070);
    expect(p.source).toBe('setup');
    expect(p.reflection?.label).toBe('floor');
    expect(p.endAfterPeakMs).toBeCloseTo(3.01, 2);
    expect(p.oneOverTHz).toBeCloseTo(269, 0);
    expect(p.question).toBeNull();
    // the scan runs to the set-up's limit and shows the whole curve: its last point lies within one step of that end
    expect(p.endAfterPeakMs - p.scan[p.scan.length - 1].endAfterPeakMs).toBeLessThan(SCAN_STEP_MS + 1e-9);
    expect(Math.max(...p.scan.map((x) => x.deg))).toBeLessThanOrEqual(KNEE_DEG);
    expect(p.scan.length).toBeGreaterThan(KNEE_TAIL_POINTS + 1);
  }, 60_000);

  it('the mid (pod 206 mm, S_d 69 cm²): the floor lies at 5.46 ms, but the residual passes the knee level first — the knee (3.01 ms, 287 Hz) is the proposal and it asks which plane (UI-6: the rise rule said 1.27 ms, 573 Hz)', () => {
    const src = session.sources.find((s) => s.stem === 'mid')!;
    const p = proposeWindow({
      far: impulseOfItem(src.far!, 'aug', false),
      near: impulseOfItem(src.near!, 'aug', false),
      referenceMs: 8.75,
      model: { kind: 'an4', f0Hz: 34.16 / 0.206 },
      sdCm2: 69,
      sourceHeightMm: 1314,
      rig,
      planes,
      planesUnknown: false,
    });
    if ('reason' in p) throw new Error(p.reason);
    expect(p.source).toBe('knee');
    expect(p.reflection?.label).toBe('floor');
    expect(p.reflection?.ms).toBeCloseTo(5.46, 2);
    expect(p.endAfterPeakMs).toBeCloseTo(3.01, 2);
    expect(p.oneOverTHz).toBeCloseTo(287, 0);
    expect(p.question).toMatch(/which plane\?/);
    // the scan did not stop at the knee: it ran on past it, to the set-up's limit
    const after = p.scan.filter((x) => x.endAfterPeakMs > p.knee!.endAfterPeakMs + 1e-9);
    expect(after.length).toBeGreaterThan(KNEE_TAIL_POINTS + 1);
    expect(after[0].deg).toBeGreaterThan(KNEE_DEG);
  }, 120_000);

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
  it('the mic above the cabinet bottom: what D follows when the cabinet stood on a table (D = A + this)', () => {
    expect(rigFromDesign(base).micAboveBottomMm).toBe(880); // 1124 − 244: the mic level with the reference
    expect(rigFromDesign({ ...base, micElevationDeg: 30 }).micAboveBottomMm).toBeCloseTo(880 + 500, 9);
    // the demo cabinet stands at 20 mm in its room; on a 500 mm table D becomes 500 + 880 = 1380, not 900
    const demo = rigFromDesign({ ...base, refHeightMm: 900 });
    expect([demo.a, demo.d]).toEqual([20, 900]);
    expect(500 + demo.micAboveBottomMm!).toBe(1380);
    expect(rigFromDesign({ ...base, ownGeometry: true }).micAboveBottomMm).toBeNull();
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
  it('step 3 works out EVERY driver up front, the active tab first, behind an overlay with progress', () => {
    const eff = src.slice(src.indexOf('const proposalKeys = useRef'), src.indexOf('const takeOver = '));
    expect(eff).toMatch(/for \(const src of order\)/); // every driver, not the tab on screen
    expect(eff).toMatch(/a\.stem === tab \? -1/); // the active one first
    expect(eff).not.toMatch(/drivers\.find\(\(d\) => d\.stem === tab\)/);
    expect(eff).not.toMatch(/\btab,/); // switching tabs does not restart the run
    expect(src).toMatch(/\{step === 'window' &&\s+proposalBusy &&\s+createPortal\(\s+<div className="busy-overlay/);
    expect(src).toMatch(/<progress value=\{proposalBusy\.index\} max=\{proposalBusy\.total\}/);

    // the proposals live in the stored tool state: a reopened session does not recompute them
    expect(src).toMatch(/proposals: s\.proposals \?\? \{\},/);
    expect(src).toMatch(/\|\| proposals\[src\.stem\]\?\.key === inp\.key\) continue;/);
  });
  it('I-4 UI audit: the only calibration file is taken over, the Accept tooltip names what is missing, a branch switch clears the use-status, valid-from is proposed and never filled, the pod hint reads the cabinet form', () => {
    expect(src).toMatch(/cals\.length === 1 \? cals\[0\] : null/);
    expect(src).toMatch(/<option value="none">\{t\('no file'\)\}<\/option>/);
    expect(src).toMatch(/title=\{canAccept \? '' : t\('needs: \{list\}', \{ list: missing\.join\(', '\) \}\)\}/);
    expect(src).not.toMatch(/needs: the set-up stated, which driver/);
    // UI-6 — V15: WAS "a branch switch clears the use-status" (one status, one select); IS one status per way,
    // so the select only picks the way and no status is cleared by switching.
    expect(src).toMatch(/onChange=\{\(e\) => setUseWay\(e\.target\.value as MergeWay\)\}/);
    expect(src).toMatch(/suggestValidFrom\(\{/);
    // UI-4: shown while empty or while the stated value differs from it; it reaches the field through
    // ONE press only (the window's "Take over the proposal", one row further) — nothing writes it by itself.
    // (Until UI-4 this claim read "never written into the field"; the press is a deed, not an auto-fill.)
    expect(src).toMatch(/validFromProposal && \(num\(c\.validFrom\) === null \|\|/);
    expect(src).toMatch(/const takeOverValidFrom = \(\) => \{\s*if \(validFromProposal && validFromProposal\.hz !== null\) setC\(\{ validFrom: validFromProposal\.hz\.toFixed\(0\), validFromReason: validFromProposal\.reason \}\);/);
    expect(src.match(/setC\(\{ validFrom: validFromProposal/g)?.length).toBe(1); // the handler, and nowhere else
    expect(src).toMatch(/onClick=\{takeOverValidFrom\}/);
    expect(src).not.toMatch(/useEffect\([^;]*validFromProposal/); // no effect fills it in
    expect(src).toMatch(/!c\.inPod && p\.enclosure === 'sealed' && c\.way !== 'high'/);
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf8');
    expect(app).toMatch(/enclosure: d\.enclosure \?\? null/); // the cabinet form's enclosure travels to the tool
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
    // step 5 shows the same rows. (UI-5: the window was 300 characters; step 5 now opens with the
    // approval list — what goes into export — and the overview follows it, so the span is wider.)
    expect(src).toMatch(/\{step === 'export' && \([\s\S]{0,3000}<DriverOverview\s+rows=\{overviewRows\}/);
    expect(src).toMatch(/comp: computed\.get\(d\.stem\)/); // no second computation for the overview
    const body = src.slice(src.indexOf('function DriverOverview('), src.indexOf('function Charts('));
    expect(body).toMatch(/<Chart\b/);
    expect(body).toMatch(/predictionDb[\s\S]*farGatedDb[\s\S]*\.spl/);
    expect(body).not.toMatch(/mergeImpulsesV2\(/);
  });
  it('after taking over from "Your cabinet", D follows A until D is typed', () => {
    expect(src).toMatch(/dFollowsA: fromDesign\.micAboveBottomMm !== null/);
    expect(src).toMatch(/setRig\(\{ bottom: v,[^}]*\.\.\.dFollowing\(v\)/);
    expect(src).toMatch(/setRig\(\{ micHeight: v, dFollowsA: false \}\)/);
  });
  it('the window and merge panels remount per driver: a draft typed for one driver cannot land on another', () => {
    expect(src).toMatch(/<WindowStep\s+key=\{active\.stem\}/);
    expect(src).toMatch(/<WorkPanel\s+key=\{active\.stem\}/);
  });
});
