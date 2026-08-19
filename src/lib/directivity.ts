import type { Complex } from './complex.ts';
import {
  applyTransfer,
  combineN,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';

/**
 * Horizontal directivity of the filtered system.
 *
 * The crossover is electrical — the SAME per-driver transfer applies at every
 * angle. So: apply the transfers to each angle's measured response, sum the
 * drivers per angle, and derive the horizontal energy average and DI. This is
 * where an on-axis-flat design shows its true face: a beaming mid handing
 * over to a wide tweeter leaves a directivity step no on-axis chart reveals.
 *
 * Honest scope: horizontal plane only, one side (assumed symmetric), the
 * angles that were measured. NOT a CTA-2034 sphere — the vertical lobing
 * around the crossover is invisible here. Treat power/DI as horizontal
 * estimates, not full-space truth.
 */

export interface AngleResponse {
  hor: number; // degrees
  response: GriddedResponse;
}

/**
 * MEASURED beaming onset of a RAW driver (Hz): the first frequency where its
 * response at the widest measured angle has fallen `thresholdDb` below
 * on-axis — and STAYS down (≥ threshold−1 dB for the next ⅓ octave), so a
 * single interference blip does not read as beaming (Robbert's mid shows a
 * +4.6 dB spike at 1.5 kHz that is gone again at 2 kHz).
 *
 * This is the handover-ceiling physics made measurable: crossing a driver
 * above its beaming onset hands a NARROW radiator to a WIDE one, which the
 * on-axis sum never shows but the room hears (power-response step). The
 * cone-size formula stays as the fallback for sets without angle data —
 * measured beats estimated when both exist.
 *
 * Uses the 30° set — the SMALLEST measured angle ≥ 30° — against 0°: the
 * thresholds (KA_TIERS) are calibrated on the piston maths AT 30°, so a
 * wider angle would fire far too early. Measured on Sanders' 3-way set
 * (0–60°): judged at 60° his 94 mm mid "beamed" at 1569 Hz where its 0°−30°
 * difference is a flat 0.3–0.6 dB up to 3 kHz — the honest onset (4 dB at
 * 30°) is ~4.7 kHz. Robbert's sets stop at 30°, so this changes nothing
 * there. Smoothed with a ±⅙-octave median. Returns null when there is no
 * such angle, no shared alive region, or the driver never beams within its
 * measured band.
 */
export function beamingCeilingHz(
  angles: readonly AngleResponse[],
  thresholdDb = 4,
): number | null {
  const on = angles.find((a) => a.hor === 0);
  const wide = angles
    .filter((a) => a.hor >= 30)
    .sort((a, b) => a.hor - b.hor)[0];
  if (!on || !wide) return null;
  const f = on.response.freq;
  const n = f.length;
  // Raw 0° − widest-angle difference, only where both are measured.
  const diff: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = on.response.spl[i];
    const b = wide.response.spl[i];
    if (a > -300 && b > -300) diff[i] = a - b;
  }
  // ±⅙-octave median smoothing.
  const smooth: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(diff[i])) continue;
    const lo = f[i] / 2 ** (1 / 6);
    const hi = f[i] * 2 ** (1 / 6);
    const win: number[] = [];
    for (let j = 0; j < n; j++) {
      if (f[j] >= lo && f[j] <= hi && !Number.isNaN(diff[j])) win.push(diff[j]);
    }
    if (win.length === 0) continue;
    win.sort((a, b) => a - b);
    smooth[i] = win[Math.floor(win.length / 2)];
  }
  // First onset that PERSISTS for half an octave. Half, not a third: measured
  // on Robbert's mid, a baffle-diffraction wobble (+4.6 dB at 1.5 kHz, gone
  // by 2 kHz) survives a ⅓-octave check and mislabels 1.46 kHz as beaming —
  // real beaming only gets WORSE with frequency, a diffraction ripple comes
  // back down.
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(smooth[i]) || smooth[i] < thresholdDb) continue;
    let holds = true;
    // Slack is PROPORTIONAL, not a fixed 1 dB: the threshold is now calibrated
    // on ka (see KA_TIERS in driverLimits.ts) and the industry ka = 2 limit is
    // only 1.11 dB, where "threshold − 1" would accept almost any wobble.
    // ×0.75 reproduces the historical 3 dB slack exactly at the old default 4.
    for (let j = i; j < n && f[j] <= f[i] * 2 ** 0.5; j++) {
      if (!Number.isNaN(smooth[j]) && smooth[j] < thresholdDb * 0.75) {
        holds = false;
        break;
      }
    }
    if (holds) return f[i];
  }
  return null;
}

export interface DirectivityResult {
  freq: number[];
  angles: number[];
  /** Combined SPL per angle (same order as `angles`), dB. */
  combinedByAngle: number[][];
  /** Horizontal energy average across the measured angles, dB. */
  powerDb: number[];
  /** Energy average over the listening window (angles ≤ 30°, incl. 0°), dB. */
  listeningWindowDb: number[];
  /** Directivity index estimate: on-axis − energy average, dB. */
  diDb: number[];
}

export interface DirectivityBranch {
  angles: readonly AngleResponse[];
  /** Electrical transfer of this branch (same at every angle); null = wire. */
  h: readonly Complex[] | null;
  adjust?: BranchAdjust;
}

/**
 * N-branch horizontal directivity — the combineN generalization. The 2-way
 * `computeDirectivity` below is a thin wrapper over this (combine IS combineN
 * for two branches, bit-identical by the dsp.nway regression), so the whole
 * existing suite exercises the shared core.
 */
/**
 * DIRECTIVITY-MATCH anchor for a handover (Hz): the frequency where the
 * LOWER driver's DI has risen to meet the UPPER driver's DI. Below it the
 * lower driver is still wide; above it, it beams while the upper one is
 * still wide — so a crossing there hands a narrow radiator to a wide one and
 * puts a step in the power response that on-axis flatness never shows. Cross
 * where the two DIs are equal and the room hears no step.
 *
 * DI here = on-axis minus the energy average over the MEASURED horizontal
 * angles (both drivers reduced to the angles they share), ±⅙-octave median
 * smoothed. Returns the first frequency inside `band` where DI_lower ≥
 * DI_upper (and ≥ minDiDb, so the lower driver really is narrowing) AND
 * stays so for a third of an octave; null when the sets do not share ≥ 2
 * angles incl. 0°, or when no such crossing exists in band.
 *
 * Note this is a matching ANCHOR, not a hard bound: a candidate is seeded at
 * it (rule 9 of the window spec) and the in-room weight in the tuner and the
 * ranking (energy-average flatness) then keep pulling that way; the pin
 * remains the designer's override.
 */
export function diMatchHz(
  lower: readonly AngleResponse[],
  upper: readonly AngleResponse[],
  band: [number, number],
  /** The lower driver must have BEGUN to beam (its DI at least this many dB)
   *  for the match to mean anything: where both drivers are still wide the
   *  DIs are equal at ~0 dB and no handover point follows from that. */
  minDiDb = 2,
): number | null {
  const shared = lower
    .map((a) => a.hor)
    .filter((h) => upper.some((u) => u.hor === h))
    .sort((a, b) => a - b);
  if (shared.length < 2 || !shared.includes(0)) return null;
  const f = lower[0].response.freq;
  const n = f.length;
  const diOf = (set: readonly AngleResponse[]): number[] => {
    const rows = shared.map((h) => set.find((a) => a.hor === h)!.response.spl);
    const on = rows[shared.indexOf(0)];
    const di = new Array<number>(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      let acc = 0;
      let alive = true;
      for (const r of rows) {
        if (r[i] <= -300) alive = false;
        acc += 10 ** (r[i] / 10);
      }
      if (alive) di[i] = on[i] - 10 * Math.log10(acc / rows.length);
    }
    // ±⅙-octave median.
    const out = new Array<number>(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(di[i])) continue;
      const lo = f[i] / 2 ** (1 / 6);
      const hi = f[i] * 2 ** (1 / 6);
      const win: number[] = [];
      for (let j = 0; j < n; j++) if (f[j] >= lo && f[j] <= hi && !Number.isNaN(di[j])) win.push(di[j]);
      if (win.length) {
        win.sort((a, b) => a - b);
        out[i] = win[Math.floor(win.length / 2)];
      }
    }
    return out;
  };
  // Upper's angles may live on a different grid object: assume the SAME grid
  // (callers band both sets on one grid, as the App does) — guard length.
  if (upper[0].response.freq.length !== n) return null;
  const dL = diOf(lower);
  const dU = diOf(upper);
  for (let i = 0; i < n; i++) {
    if (f[i] < band[0] || f[i] > band[1]) continue;
    if (Number.isNaN(dL[i]) || Number.isNaN(dU[i]) || dL[i] < dU[i] || dL[i] < minDiDb) continue;
    let holds = true;
    for (let j = i; j < n && f[j] <= f[i] * 2 ** (1 / 3); j++) {
      if (!Number.isNaN(dL[j]) && !Number.isNaN(dU[j]) && dL[j] < dU[j] - 0.5) {
        holds = false;
        break;
      }
    }
    if (holds) return f[i];
  }
  return null;
}

export function computeDirectivityN(
  branches: readonly DirectivityBranch[],
): DirectivityResult | null {
  if (branches.length === 0) return null;
  // Pair up the angles present for EVERY branch.
  const angles = branches[0].angles
    .map((a) => a.hor)
    .filter((a) => branches.every((b) => b.angles.some((x) => x.hor === a)))
    .sort((a, b) => a - b);
  if (angles.length < 2 || !angles.includes(0)) return null;

  const freq = [...branches[0].angles[0].response.freq];
  const n = freq.length;

  const combinedByAngle: number[][] = [];
  for (const a of angles) {
    combinedByAngle.push(
      combineN(
        branches.map((b) => {
          let r = b.angles.find((x) => x.hor === a)!.response;
          if (b.h) r = applyTransfer(r, b.h as Complex[]);
          return { response: r, adjust: b.adjust };
        }),
      ).combinedSpl,
    );
  }

  const onAxis = combinedByAngle[angles.indexOf(0)];
  const lwIdx = angles.map((a, i) => (a <= 30 ? i : -1)).filter((i) => i >= 0);
  const powerDb = new Array<number>(n);
  const listeningWindowDb = new Array<number>(n);
  const diDb = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (const spl of combinedByAngle) acc += 10 ** (spl[i] / 10);
    powerDb[i] = 10 * Math.log10(acc / combinedByAngle.length);
    let lw = 0;
    for (const j of lwIdx) lw += 10 ** (combinedByAngle[j][i] / 10);
    listeningWindowDb[i] = 10 * Math.log10(lw / lwIdx.length);
    diDb[i] = onAxis[i] - powerDb[i];
  }

  return { freq, angles, combinedByAngle, powerDb, listeningWindowDb, diDb };
}

export function computeDirectivity(
  woofer: readonly AngleResponse[],
  tweeter: readonly AngleResponse[],
  hWoofer: readonly Complex[] | null,
  hTweeter: readonly Complex[] | null,
  adjust: TweeterAdjust,
): DirectivityResult | null {
  return computeDirectivityN([
    { angles: woofer, h: hWoofer },
    { angles: tweeter, h: hTweeter, adjust },
  ]);
}
