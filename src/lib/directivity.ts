import type { Complex } from './complex.ts';
import { applyTransfer, combine, type GriddedResponse, type TweeterAdjust } from './dsp.ts';

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

export function computeDirectivity(
  woofer: readonly AngleResponse[],
  tweeter: readonly AngleResponse[],
  hWoofer: readonly Complex[] | null,
  hTweeter: readonly Complex[] | null,
  adjust: TweeterAdjust,
): DirectivityResult | null {
  // Pair up the angles present for BOTH drivers.
  const angles = woofer
    .map((w) => w.hor)
    .filter((a) => tweeter.some((t) => t.hor === a))
    .sort((a, b) => a - b);
  if (angles.length < 2 || !angles.includes(0)) return null;

  const freq = [...woofer[0].response.freq];
  const n = freq.length;

  const combinedByAngle: number[][] = [];
  for (const a of angles) {
    let w = woofer.find((x) => x.hor === a)!.response;
    let t = tweeter.find((x) => x.hor === a)!.response;
    if (hWoofer) w = applyTransfer(w, hWoofer as Complex[]);
    if (hTweeter) t = applyTransfer(t, hTweeter as Complex[]);
    combinedByAngle.push(combine(w, t, adjust).combinedSpl);
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
