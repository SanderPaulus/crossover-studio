import type { CombineResult } from './dsp.ts';

/**
 * Acoustic integration score — how well two drivers behave as ONE source.
 *
 * Physics: at relative phase error ε two equal sources sum with amplitude
 * |1 + e^{jε}| / 2 = cos(ε/2) relative to perfect summing. So:
 *   ε =   0° → full +6 dB gain          (cos = 1.00)
 *   ε =  90° → +3 dB instead of +6      (cos = 0.71)
 *   ε = 120° → no summing gain at all   (cos = 0.50)
 *   ε > 120° → destructive               (→ 0 at 180°)
 *
 * Phase error only matters where BOTH drivers contribute: a driver 30 dB down
 * cannot ruin the sum no matter its phase. Every metric here is therefore
 * weighted by the level overlap  w = 10^(−|ΔdB|/20)  (1 at equal level, 0.1 at
 * 20 dB apart), and points outside `overlapWindowDb` are excluded entirely.
 */

export type AlignClass = 'excellent' | 'acceptable' | 'marginal' | 'destructive';

/** Class boundaries in degrees of phase error — the physical anchors above. */
export const CLASS_BOUNDS: Record<Exclude<AlignClass, 'destructive'>, number> = {
  excellent: 45,
  acceptable: 90,
  marginal: 120,
};

export function classify(phaseErrorDeg: number): AlignClass {
  const e = Math.abs(phaseErrorDeg);
  if (e <= CLASS_BOUNDS.excellent) return 'excellent';
  if (e <= CLASS_BOUNDS.acceptable) return 'acceptable';
  if (e <= CLASS_BOUNDS.marginal) return 'marginal';
  return 'destructive';
}

export interface IntegrationPoint {
  freq: number;
  /** |woofer − tweeter| level difference, dB. */
  levelDiffDb: number;
  /** Overlap weight 10^(−|ΔdB|/20), 0..1. */
  weight: number;
  /** |relative phase|, 0..180°. */
  phaseErrorDeg: number;
  /** Class, or null outside the overlap window (phase is irrelevant there). */
  cls: AlignClass | null;
}

export interface IntegrationResult {
  points: IntegrationPoint[];
  /**
   * Overlap-weighted summing efficiency, 0–100. 100 = every overlapping point
   * sums perfectly; 71 ≈ everything at quadrature. Null when the drivers never
   * overlap within the window (nothing to integrate — also nothing to break).
   */
  score: number | null;
  /** Frequency of maximum overlap (≈ the acoustic crossover point). */
  overlapCentreHz: number | null;
  /**
   * Contiguous band around the overlap centre where the error stays ≤ 90°
   * (`acceptable` or better): [fLo, fHi], plus its width in octaves.
   */
  bandwidth: { fLo: number; fHi: number; octaves: number } | null;
}

export interface IntegrationOptions {
  /** Points with |ΔdB| beyond this are not part of the overlap. Default 20 dB. */
  overlapWindowDb?: number;
}

export function computeIntegration(
  r: CombineResult,
  opts: IntegrationOptions = {},
): IntegrationResult {
  const { overlapWindowDb = 20 } = opts;
  const n = r.freq.length;

  const points: IntegrationPoint[] = new Array(n);
  let wSum = 0;
  let wEffSum = 0;
  let centreIdx = -1;
  let centreWeight = 0;

  for (let i = 0; i < n; i++) {
    const levelDiffDb = Math.abs(r.woofer.spl[i] - r.tweeter.spl[i]);
    const inOverlap = levelDiffDb <= overlapWindowDb;
    const weight = 10 ** (-levelDiffDb / 20);
    const phaseErrorDeg = Math.abs(r.relativePhaseDeg[i]);

    points[i] = {
      freq: r.freq[i],
      levelDiffDb,
      weight,
      phaseErrorDeg,
      cls: inOverlap ? classify(phaseErrorDeg) : null,
    };

    if (inOverlap) {
      wSum += weight;
      wEffSum += weight * Math.cos(((phaseErrorDeg / 2) * Math.PI) / 180);
      if (weight > centreWeight) {
        centreWeight = weight;
        centreIdx = i;
      }
    }
  }

  if (centreIdx < 0 || wSum <= 0) {
    return { points, score: null, overlapCentreHz: null, bandwidth: null };
  }

  // Bandwidth: expand from the overlap centre while the point is still in the
  // overlap window and at worst `acceptable`.
  const ok = (p: IntegrationPoint) => p.cls === 'excellent' || p.cls === 'acceptable';
  let lo = centreIdx;
  let hi = centreIdx;
  let bandwidth: IntegrationResult['bandwidth'] = null;
  if (ok(points[centreIdx])) {
    while (lo > 0 && ok(points[lo - 1])) lo--;
    while (hi < n - 1 && ok(points[hi + 1])) hi++;
    const fLo = points[lo].freq;
    const fHi = points[hi].freq;
    bandwidth = { fLo, fHi, octaves: Math.log2(fHi / fLo) };
  }

  return {
    points,
    score: (100 * wEffSum) / wSum,
    overlapCentreHz: points[centreIdx].freq,
    bandwidth,
  };
}
