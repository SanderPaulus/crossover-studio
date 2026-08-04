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
