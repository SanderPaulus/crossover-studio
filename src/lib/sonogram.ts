import type { DirectivityResult } from './directivity.ts';

/**
 * Sonogram (directivity map) data prep: SPL over angle × frequency as a
 * heatmap-ready grid, plus the −6 dB beamwidth curve.
 *
 * Measurements cover one side only (assumed symmetric), so rows are mirrored
 * to ±angles for display. Values are relative (≤ 0 dB): 'normalized' is the
 * classic sonogram — each frequency column relative to its own on-axis level,
 * so beaming shows independent of the on-axis response shape. 'absolute'
 * keeps the response shape in: everything relative to the single loudest
 * point in the grid.
 */

export type SonogramMode = 'normalized' | 'absolute';

export interface SonogramData {
  freq: number[];
  /** Mirrored display angles, ascending (−max…0…+max), degrees. */
  angles: number[];
  /** values[i][k] = dB at angles[i] × freq[k]; ≤ 0, 0 = reference. */
  values: number[][];
  mode: SonogramMode;
}

export function buildSonogram(dir: DirectivityResult, mode: SonogramMode): SonogramData {
  const order = dir.angles
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a - y.a);
  const n = dir.freq.length;

  const onAxis = dir.combinedByAngle[dir.angles.indexOf(0)];
  let globalMax = -Infinity;
  if (mode === 'absolute') {
    for (const row of dir.combinedByAngle) {
      for (const v of row) if (v > globalMax) globalMax = v;
    }
  }

  const relRow = (spl: readonly number[]): number[] => {
    const out = new Array<number>(n);
    for (let k = 0; k < n; k++) {
      out[k] = mode === 'normalized' ? spl[k] - onAxis[k] : spl[k] - globalMax;
    }
    return out;
  };

  const positive = order.map(({ a, i }) => ({
    a,
    row: relRow(dir.combinedByAngle[i]),
  }));

  // Mirror everything except 0° to the negative side.
  const mirrored = positive
    .filter((p) => p.a > 0)
    .map((p) => ({ a: -p.a, row: p.row }))
    .reverse();

  const all = [...mirrored, ...positive];
  return {
    freq: [...dir.freq],
    angles: all.map((p) => p.a),
    values: all.map((p) => p.row),
    mode,
  };
}

/**
 * −6 dB half-beamwidth per frequency: the smallest angle (one side, degrees)
 * where the response first drops 6 dB below on-axis, linearly interpolated
 * between measured angles. NaN where the pattern stays within 6 dB out to the
 * widest measured angle (beamwidth wider than the data). Full beamwidth =
 * 2× this, under the same symmetry assumption as the sonogram.
 */
export function beamwidth6dBHalfAngle(dir: DirectivityResult): number[] {
  const order = dir.angles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a >= 0)
    .sort((x, y) => x.a - y.a);
  const onAxis = dir.combinedByAngle[dir.angles.indexOf(0)];
  const n = dir.freq.length;
  const out = new Array<number>(n).fill(NaN);
  for (let k = 0; k < n; k++) {
    for (let j = 1; j < order.length; j++) {
      const v0 = dir.combinedByAngle[order[j - 1].i][k] - onAxis[k];
      const v1 = dir.combinedByAngle[order[j].i][k] - onAxis[k];
      if (v1 <= -6) {
        const t = (-6 - v0) / (v1 - v0); // v1 < v0 guaranteed by v1≤−6<v0
        out[k] = order[j - 1].a + t * (order[j].a - order[j - 1].a);
        break;
      }
    }
  }
  return out;
}

/**
 * Sequential blue ramp (dataviz palette, steps 100→700) for the heatmap.
 * Light mode: loud = dark (ink-like), quiet recedes toward the light surface.
 * Dark mode: anchor flips — quiet recedes toward the dark surface, loud pops
 * light. Index 0 = quiet end for the given mode.
 */
const RAMP_LIGHT_TO_DARK = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5',
  '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
];

export function sonogramRamp(dark: boolean): string[] {
  return dark ? [...RAMP_LIGHT_TO_DARK].reverse() : RAMP_LIGHT_TO_DARK;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export const SONOGRAM_BAND_DB = 3;

/**
 * Quantize a relative level (≤ 0 dB) to its band's ramp position t ∈ [0,1]
 * (1 = the 0 dB band, 0 = the floor band). Discrete 3 dB bands keep the map
 * readable where a continuous ramp washes out: most sonogram data sits within
 * ~10 dB of the reference, so smooth shading leaves near-identical colors.
 * A band boundary belongs to the quieter band (−3 dB starts the second band).
 */
export function sonogramBandT(
  vDb: number,
  floorDb: number,
  stepDb: number = SONOGRAM_BAND_DB,
): number {
  const bands = Math.max(2, Math.round(-floorDb / stepDb));
  const i = Math.min(bands - 1, Math.max(0, Math.floor(-vDb / stepDb)));
  return 1 - i / (bands - 1);
}

/**
 * Map t ∈ [0,1] (0 = quiet/floor, 1 = 0 dB reference) to an [r,g,b] color by
 * piecewise-linear interpolation along the ramp. Clamps outside [0,1].
 */
export function sonogramColor(t: number, dark: boolean): [number, number, number] {
  const ramp = sonogramRamp(dark);
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]);
  const b = hexToRgb(ramp[i + 1]);
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
