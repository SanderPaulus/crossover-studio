/**
 * I-4 B-4 (guide) — the merge tool as a guide in five steps (Files, Set-up, Window, Merge per driver,
 * Export; docs: B-4_guide_vijf_stappen.md), and the PROPOSALS it makes. The rule (Sander, 14-11-2026):
 * no silent assumptions, but visible proposals from the measurement, labelled "proposed", taken over
 * or changed with one click. Nothing here is used unless the designer takes it over.
 *
 * THE WINDOW (Sander's decision, 14-11-2026):
 *  1. From the SET-UP: the earliest reflection per driver from step 2 (floor, table top, stated planes;
 *     `echoesForSource`), minus ONE PERIOD at the top of the fit band (ka = 1). Works without FRDs.
 *  2. CHECK: the fit residual as a function of the window end (a scan). When it already rises before the
 *     proposed end, the KNEE is proposed instead, with the question "there is something before your
 *     first known reflection: which plane?". With planes "don't know" in step 2, the knee IS the proposal.
 *  The begin is 0.4 ms before the direct-sound peak (never after the session reference); Tukey 0.25;
 *  T = the right length from the reference (V60), shown with 1/T.
 *  The scan runs on the fit band the PROPOSAL would use (1/T … ka = 1), fixed, so a shorter end does not
 *  buy a lower residual by moving its own band; and it starts where the window resolves the HANDOVER
 *  (1/T ≤ its lower edge) — a shorter window smooths the far field below 1/T, and the residual there
 *  reads low because nothing is compared, not because the fit is good. (Measured: starting at half a
 *  period found "knees" at 0.7–1.3 ms on casus 1 that were exactly that.)
 *
 * THE KNEE: the last end before the residual rises more than KNEE_RISE_DEG above its lowest value so far.
 * A convention, visible and named. Measured on casus 1 (14-11-2026, steps of 0.125 ms): woofer down
 * no knee before the 1.95 ms proposal; woofer up knee 2.13 ms (proposal from the floor 3.01 ms); mid
 * knee 2.63 ms (proposal from the floor 4.60 ms). A slope criterion was tried and refused: the residual
 * ripples (±3 °/ms) on the way.
 *
 * THE REFERENCE (the phase zero) is the SESSION's, shared by every driver — otherwise the timing between
 * the drivers is lost: the FRD exports' own reference when they are there (V56), else the earliest
 * (peak − 0.4 ms) over the session's far fields.
 *
 * THE MODEL: AN4's own formula f0 = 34.16 / d (d in m) — for a cone in the cabinet d = the baffle width,
 * for a driver in its own pod d = the pod's diameter (asked when the design has none). Fit band 1/T …
 * ka = 1; handover √(1/T · ka) … ka.
 */
import { arrivalMs, mergeImpulsesV2, planeEchoDelayS, type Gate, type Impulse, type NearToFarModel, type PlaneEcho } from './nfMergeV2.ts';
import { echoesForSource, kaOneHz, type PlanesStated, type RigSetup } from './mergeSession.ts';

export const MERGE_GUIDE_VERSION = 'merge-guide/1.0';
/** The window proposal's conventions, each one stated by Sander (14-11-2026). */
export const PROPOSAL_PRE_PEAK_MS = 0.4;
export const PROPOSAL_TAPER = 0.25;
/** AN4: f0 = AN4_F0_HZ_M / d. */
export const AN4_F0_HZ_M = 34.16;
/** The knee: a rise of more than this above the lowest residual so far (degrees rms). */
export const KNEE_RISE_DEG = 1.5;
/** Scan grid for the residual-versus-end check, ms. */
export const SCAN_STEP_MS = 0.125;
/** Without a proposal from the set-up (planes "don't know"), the scan looks this far after the peak. */
export const SCAN_MAX_AFTER_PEAK_MS = 6;
/** At most this many passes to let the band follow the knee ("don't know"). */
export const KNEE_ITERATIONS = 4;
/** Points the scan keeps after the residual first rises past the knee rule: enough to SHOW the rise in the
 *  check chart, and the knee itself is settled by then (kneeOf reads the first exceedance only). */
export const KNEE_TAIL_POINTS = 4;

export const GUIDE_STEPS = ['files', 'setup', 'window', 'merge', 'export'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/** The session's phase zero for the proposals: the FRD exports' reference, else the earliest (peak − 0.4). */
export function sessionReferenceMs(frdReferenceMs: number | null, farPeaksMs: readonly number[]): { ms: number; from: string } | null {
  if (frdReferenceMs !== null) return { ms: frdReferenceMs, from: "the FRD exports' own reference (their phase zero)" };
  if (farPeaksMs.length === 0) return null;
  return { ms: Math.min(...farPeaksMs) - PROPOSAL_PRE_PEAK_MS, from: `the earliest far-field peak of the session minus ${PROPOSAL_PRE_PEAK_MS} ms (no FRD exports)` };
}

/** AN4 f0 from a diameter (mm): 34.16 / d. */
export function an4F0(diameterMm: number | null, what: string): { f0Hz: number; note: string } | { reason: string } {
  if (!(diameterMm && diameterMm > 0)) return { reason: `AN4 f0 needs ${what} — state it` };
  const f0 = AN4_F0_HZ_M / (diameterMm / 1000);
  return { f0Hz: f0, note: `AN4: f0 = ${AN4_F0_HZ_M} / d, d = ${what} ${diameterMm} mm → ${f0.toFixed(0)} Hz` };
}

/** Fit band 1/T … ka = 1 and handover √(1/T·ka) … ka. A reason when they leave no band. */
export function proposeBandsGuide(oneOverTHz: number, sdCm2: number | null): { fitHz: [number, number]; spliceHz: [number, number]; note: string } | { reason: string } {
  if (!(sdCm2 && sdCm2 > 0)) return { reason: 'no cone area (S_d): the top of the band (ka = 1) cannot be proposed — state S_d or the band' };
  const ka = kaOneHz(sdCm2);
  if (!(ka > oneOverTHz * 1.25)) return { reason: `1/T (${oneOverTHz.toFixed(0)} Hz) and ka = 1 (${ka.toFixed(0)} Hz) leave no band — a longer window, or state the band` };
  const mid = Math.sqrt(oneOverTHz * ka);
  return { fitHz: [oneOverTHz, ka], spliceHz: [mid, ka], note: `fit 1/T ${oneOverTHz.toFixed(0)} Hz … ka = 1 ${ka.toFixed(0)} Hz; handover from their geometric mean ${mid.toFixed(0)} Hz` };
}

/** The window for an end (ms after the direct-sound peak), on the session reference. */
export function gateForEnd(peakMs: number, referenceMs: number, endAfterPeakMs: number): Gate {
  const begin = Math.min(peakMs - PROPOSAL_PRE_PEAK_MS, referenceMs);
  return { referenceMs, leftMs: referenceMs - begin, rightMs: peakMs + endAfterPeakMs - referenceMs, rightTaper: PROPOSAL_TAPER };
}

/** The earliest reflection a source sees in the stated set-up (step 2), or why there is none. */
export function earliestReflection(sourceHeightMm: number, rig: RigSetup, planes: PlanesStated, fitTopHz: number): { ms: number; label: string } | { reason: string } {
  const e = echoesForSource({ sourceHeightMm, rig, planes, fitTopHz });
  const ps = e.echoes.filter((x): x is PlaneEcho => x.kind === 'plane').map((x) => ({ ms: planeEchoDelayS(x) * 1000, label: x.label }));
  if (ps.length === 0) return { reason: e.notes.length ? e.notes.join(' ') : 'no plane in the stated set-up gives a reflection' };
  return ps.sort((a, b) => a.ms - b.ms)[0];
}

export interface ScanPoint {
  endAfterPeakMs: number;
  deg: number;
  db: number;
}

/** Drain a step generator: the synchronous form of a computation the UI drives in slices. */
export function drain<T>(g: Generator<unknown, T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/** The residual as a function of the window end, on one fixed band. Points whose merge fails are skipped. */
export function residualScan(opts: ResidualScanOpts): ScanPoint[] {
  return drain(residualScanSteps(opts));
}

export interface ResidualScanOpts {
  far: Impulse;
  near: Impulse;
  model: NearToFarModel;
  referenceMs: number;
  fitHz: [number, number];
  spliceHz: [number, number];
  fromMs: number;
  toMs: number;
  /** Stop KNEE_TAIL_POINTS points after the first point the knee rule rejects (the knee is then settled). */
  stopAfterKnee?: boolean;
}

/** The scan as steps: one yield per merge, so a UI can keep its page alive between them. */
export function* residualScanSteps(opts: ResidualScanOpts): Generator<number, ScanPoint[]> {
  const peak = arrivalMs(opts.far);
  const out: ScanPoint[] = [];
  let min = Infinity;
  let tail = -1;
  for (let x = opts.fromMs; x <= opts.toMs + 1e-9; x += SCAN_STEP_MS) {
    if (opts.stopAfterKnee && tail >= KNEE_TAIL_POINTS) break;
    const gate = gateForEnd(peak, opts.referenceMs, x);
    if (!(gate.rightMs > 0)) continue;
    try {
      const r = mergeImpulsesV2({ far: opts.far, near: opts.near, gate, model: opts.model, echoes: [], sdCm2: null, fitBandHz: opts.fitHz, spliceBandHz: opts.spliceHz, output: { fromHz: 20, toHz: Math.min(20000, opts.far.sampleRate / 2.2), pointsPerOctave: 12 } });
      out.push({ endAfterPeakMs: x, deg: r.fit.residualRmsDeg, db: r.fit.residualRmsDb });
      if (tail >= 0) tail++;
      else if (r.fit.residualRmsDeg > min + KNEE_RISE_DEG) tail = 0;
      min = Math.min(min, r.fit.residualRmsDeg);
    } catch {
      /* a window the kernel refuses is not a point */
    }
    yield out.length;
  }
  return out;
}

/** The knee: the last end before the residual rises more than KNEE_RISE_DEG above its lowest so far. */
export function kneeOf(scan: readonly ScanPoint[]): ScanPoint | null {
  let min = Infinity;
  for (let i = 0; i < scan.length; i++) {
    if (scan[i].deg > min + KNEE_RISE_DEG) return i > 0 ? scan[i - 1] : null;
    min = Math.min(min, scan[i].deg);
  }
  return null;
}

export interface WindowProposal {
  gate: Gate;
  peakMs: number;
  endAfterPeakMs: number;
  /** Where the end comes from. */
  source: 'setup' | 'knee';
  reflection: { ms: number; label: string } | null;
  knee: ScanPoint | null;
  scan: ScanPoint[];
  tMs: number;
  oneOverTHz: number;
  fitHz: [number, number];
  spliceHz: [number, number];
  /** One sentence: why the end lies there. */
  why: string;
  /** Set when the residual rises before the first known reflection: the question to the designer. */
  question: string | null;
}

/**
 * The full proposal for one driver. Needs the set-up (or "don't know"), the source's height above the
 * floor, S_d (for ka) and the model; every missing input is a reason, never a default.
 */
export function proposeWindow(opts: ProposeWindowOpts): WindowProposal | { reason: string } {
  return drain(proposeWindowSteps(opts));
}

export interface ProposeWindowOpts {
  far: Impulse;
  near: Impulse;
  referenceMs: number;
  model: NearToFarModel;
  sdCm2: number | null;
  sourceHeightMm: number | null;
  rig: RigSetup;
  planes: PlanesStated;
  /** Step 2's single question was answered "don't know": the knee is the proposal. */
  planesUnknown: boolean;
}

/** The proposal as steps (one yield per merge of the scan): `proposeWindow` drains it, the tool slices it. */
export function* proposeWindowSteps(opts: ProposeWindowOpts): Generator<number, WindowProposal | { reason: string }> {
  if (!(opts.sdCm2 && opts.sdCm2 > 0)) return { reason: 'no cone area (S_d): ka = 1 — the top of the fit band and the one-period margin — cannot be proposed' };
  const ka = kaOneHz(opts.sdCm2);
  const period = 1000 / ka;
  const peak = arrivalMs(opts.far);
  let refl: { ms: number; label: string } | null = null;
  let reflNote = '';
  if (!opts.planesUnknown) {
    if (opts.sourceHeightMm === null) return { reason: "this driver's height above the floor is not known (the design's geometry, or the measured object's own)" };
    const r = earliestReflection(opts.sourceHeightMm, opts.rig, opts.planes, ka);
    if ('reason' in r) reflNote = r.reason;
    else refl = r;
  }
  const setupEnd = refl ? refl.ms - period : null;
  /* The scan's band follows from an end; with a reflection from the set-up that end is known. Without
   * one ("don't know"), or when the knee falls before it, the band is taken from the knee itself,
   * iterated until the knee stands still (at most KNEE_ITERATIONS passes): a band from a far end starts
   * the scan after the real knee. Measured on casus 1: without this, "don't know" put woofer down's knee
   * at 2.65 ms (7.1°); with it at 1.95 ms — the set-up's own proposal. */
  type Pass = { reason: string } | { scan: ScanPoint[]; knee: ScanPoint | null };
  const scanFor = function* (bandEnd: number): Generator<number, Pass> {
    const bands = proposeBandsGuide(1000 / gateForEnd(peak, opts.referenceMs, bandEnd).rightMs, opts.sdCm2);
    if ('reason' in bands) return { reason: bands.reason };
    const scan = yield* residualScanSteps({ far: opts.far, near: opts.near, model: opts.model, referenceMs: opts.referenceMs, fitHz: bands.fitHz, spliceHz: bands.spliceHz, fromMs: Math.max(SCAN_STEP_MS, 1000 / bands.spliceHz[0] - (peak - opts.referenceMs)), toMs: bandEnd, stopAfterKnee: true });
    return { scan, knee: kneeOf(scan) };
  };
  const first = yield* scanFor(setupEnd ?? SCAN_MAX_AFTER_PEAK_MS);
  if ('reason' in first) return { reason: first.reason };
  let pass: { scan: ScanPoint[]; knee: ScanPoint | null } = first;
  if (pass.knee && (setupEnd === null || pass.knee.endAfterPeakMs < setupEnd)) {
    for (let i = 0; i < KNEE_ITERATIONS && pass.knee; i++) {
      const next = yield* scanFor(pass.knee.endAfterPeakMs);
      if ('reason' in next || !next.knee) break;
      if (setupEnd !== null && next.knee.endAfterPeakMs >= setupEnd) break;
      const moved = Math.abs(next.knee.endAfterPeakMs - pass.knee.endAfterPeakMs) > SCAN_STEP_MS / 2;
      pass = next;
      if (!moved) break;
    }
  }
  const scan = pass.scan;
  const knee = pass.knee;
  let end: number;
  let source: 'setup' | 'knee';
  let why: string;
  let question: string | null = null;
  if (setupEnd !== null && (!knee || knee.endAfterPeakMs >= setupEnd)) {
    end = setupEnd;
    source = 'setup';
    why = `one period at ka = 1 (${period.toFixed(2)} ms) before the earliest reflection of your set-up: ${refl!.label} at ${refl!.ms.toFixed(2)} ms`;
  } else if (knee) {
    end = knee.endAfterPeakMs;
    source = 'knee';
    why = setupEnd !== null
      ? `the residual already rises at ${knee.endAfterPeakMs.toFixed(2)} ms (more than ${KNEE_RISE_DEG}° above its lowest), before the ${refl!.label} reflection (${refl!.ms.toFixed(2)} ms − one period = ${setupEnd.toFixed(2)} ms)`
      : `no reflection known from the set-up${reflNote ? ` (${reflNote})` : ''}; the residual rises more than ${KNEE_RISE_DEG}° above its lowest after ${knee.endAfterPeakMs.toFixed(2)} ms`;
    if (setupEnd !== null) question = `there is something before your first known reflection (${refl!.label}, ${refl!.ms.toFixed(2)} ms): which plane?`;
  } else return { reason: `no reflection known from the set-up${reflNote ? ` (${reflNote})` : ''} and no knee in the residual up to ${SCAN_MAX_AFTER_PEAK_MS} ms — set the window yourself` };
  const gate = gateForEnd(peak, opts.referenceMs, end);
  const own = proposeBandsGuide(1000 / gate.rightMs, opts.sdCm2);
  if ('reason' in own) return { reason: own.reason };
  return { gate, peakMs: peak, endAfterPeakMs: end, source, reflection: refl, knee, scan, tMs: gate.rightMs, oneOverTHz: 1000 / gate.rightMs, fitHz: own.fitHz, spliceHz: own.spliceHz, why, question };
}
