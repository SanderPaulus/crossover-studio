import type { Complex } from './complex.ts';
import { add } from './complex.ts';
import { unwrapPhaseDeg, SPEED_OF_SOUND } from './timing.ts';

export { SPEED_OF_SOUND };

/**
 * DSP helpers for combining driver responses on a common frequency grid.
 *
 * Convention: a response is complex pressure H(f) built from SPL (dB) and
 * phase (degrees). Combination is plain complex addition — valid because both
 * measurements share one microphone position/time reference (which is exactly
 * what the timing sanity-check guards).
 */

/** n log-spaced points over [f0, f1], inclusive. */
export function logspace(f0: number, f1: number, n: number): number[] {
  if (!(f0 > 0) || !(f1 > f0) || n < 2) throw new Error('logspace: need 0 < f0 < f1 and n ≥ 2');
  const out = new Array<number>(n);
  const r = f1 / f0;
  for (let i = 0; i < n; i++) out[i] = f0 * r ** (i / (n - 1));
  return out;
}

export interface GriddedResponse {
  freq: number[];
  spl: number[]; // dB
  /** UNWRAPPED phase in degrees — safe to interpolate and subtract. */
  phaseDeg: number[];
}

/**
 * Resample a measurement onto `grid` (linear interpolation in log-frequency).
 * Phase is unwrapped before interpolation so wrap seams cannot corrupt values
 * between samples. `grid` must lie inside the measurement's frequency range —
 * this function refuses to extrapolate, unless `clampEdges` is set, in which
 * case out-of-range points take the nearest edge value (flat extrapolation —
 * appropriate for impedance curves, NOT for SPL/phase used in timing math).
 */
export function resample(
  freq: readonly number[],
  spl: readonly number[],
  phaseDeg: readonly number[],
  grid: readonly number[],
  opts: { clampEdges?: boolean } = {},
): GriddedResponse {
  if (!opts.clampEdges && (grid[0] < freq[0] || grid[grid.length - 1] > freq[freq.length - 1])) {
    throw new Error(
      `resample: grid [${grid[0]}, ${grid[grid.length - 1]}] exceeds measurement range ` +
        `[${freq[0]}, ${freq[freq.length - 1]}] — refusing to extrapolate.`,
    );
  }
  const unwrapped = unwrapPhaseDeg(phaseDeg);

  const outSpl = new Array<number>(grid.length);
  const outPhase = new Array<number>(grid.length);
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const f = Math.min(Math.max(grid[i], freq[0]), freq[freq.length - 1]);
    while (j < freq.length - 2 && freq[j + 1] < f) j++;
    const f0 = freq[j];
    const f1 = freq[j + 1];
    // Interpolate in log-f; guard the exact-hit case.
    const t = f1 === f0 ? 0 : (Math.log(f) - Math.log(f0)) / (Math.log(f1) - Math.log(f0));
    outSpl[i] = spl[j] + t * (spl[j + 1] - spl[j]);
    outPhase[i] = unwrapped[j] + t * (unwrapped[j + 1] - unwrapped[j]);
  }
  return { freq: [...grid], spl: outSpl, phaseDeg: outPhase };
}

/** Complex pressure at one grid point from SPL (dB re arbitrary) + phase (deg). */
export function toComplex(splDb: number, phaseDeg: number): Complex {
  const mag = 10 ** (splDb / 20);
  const ph = (phaseDeg * Math.PI) / 180;
  return { re: mag * Math.cos(ph), im: mag * Math.sin(ph) };
}

export interface TweeterAdjust {
  /**
   * Physical offset in mm, positive = tweeter acoustic centre sits FURTHER
   * from the listener (recessed) → extra delay → extra negative phase slope.
   */
  offsetMm: number;
  /** Level trim in dB. */
  trimDb: number;
  /** Electrical inversion (180°). */
  inverted: boolean;
}

export const offsetMmToDelayS = (mm: number): number => mm / 1000 / SPEED_OF_SOUND;

/** Phase contribution (degrees, unwrapped) of the adjustment at frequency f. */
function adjustPhaseDeg(f: number, adj: TweeterAdjust): number {
  const delay = offsetMmToDelayS(adj.offsetMm);
  return -360 * f * delay + (adj.inverted ? 180 : 0);
}

/** Per-branch adjustment for the N-way core: every branch may carry its own
 *  level trim, physical offset (delay) and polarity — the generalization of
 *  the tweeter-only TweeterAdjust. All optional; omitted = untouched. */
export type BranchAdjust = Partial<TweeterAdjust>;

export interface CombineNResult {
  freq: number[];
  /** Branches AFTER their adjustments were applied, in input order. */
  branches: GriddedResponse[];
  /** 20·log10 |Σ Hk| */
  combinedSpl: number[];
  /** arg(Σ Hk), degrees, UNWRAPPED — feeds group delay and the IFFT. */
  combinedPhaseDeg: number[];
}

/** Apply a branch adjustment; an absent/empty adjust returns the input
 *  object UNCHANGED (same reference), matching the old woofer path. */
function prepareBranch(g: GriddedResponse, adj?: BranchAdjust): GriddedResponse {
  if (!adj || ((adj.trimDb ?? 0) === 0 && (adj.offsetMm ?? 0) === 0 && !adj.inverted)) return g;
  const full: TweeterAdjust = {
    offsetMm: adj.offsetMm ?? 0,
    trimDb: adj.trimDb ?? 0,
    inverted: adj.inverted ?? false,
  };
  return {
    freq: g.freq,
    spl: g.spl.map((v) => v + full.trimDb),
    phaseDeg: g.phaseDeg.map((p, i) => p + adjustPhaseDeg(g.freq[i], full)),
  };
}

/** Shared summation core. Accumulation starts AT the first branch (not at
 *  zero) so the K=2 arithmetic is bit-identical to the historical fused
 *  woofer+tweeter loop — the 2-way regression suite depends on that. */
function sumBranches(prepared: GriddedResponse[]): {
  complexes: Complex[][];
  combinedSpl: number[];
  combinedPhaseRaw: number[];
} {
  const n = prepared[0].freq.length;
  for (const b of prepared) {
    if (b.freq.length !== n) throw new Error('combine: responses must share one grid');
  }
  const complexes = prepared.map(() => new Array<Complex>(n));
  const combinedSpl = new Array<number>(n);
  const combinedPhaseRaw = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let acc = toComplex(prepared[0].spl[i], prepared[0].phaseDeg[i]);
    complexes[0][i] = acc;
    for (let k = 1; k < prepared.length; k++) {
      const c = toComplex(prepared[k].spl[i], prepared[k].phaseDeg[i]);
      complexes[k][i] = c;
      acc = add(acc, c);
    }
    combinedSpl[i] = 20 * Math.log10(Math.hypot(acc.re, acc.im) || Number.MIN_VALUE);
    combinedPhaseRaw[i] = (Math.atan2(acc.im, acc.re) * 180) / Math.PI;
  }
  return { complexes, combinedSpl, combinedPhaseRaw };
}

/**
 * N-way acoustic summation: any number of branches, each with its own
 * optional adjustment. The 2-way `combine` below is a thin wrapper over this
 * core, so the entire existing test suite exercises it. One branch is legal
 * (the solo case, without the silent-ghost construction).
 */
export function combineN(
  branchesIn: { response: GriddedResponse; adjust?: BranchAdjust }[],
): CombineNResult {
  if (branchesIn.length === 0) throw new Error('combineN: at least one branch required');
  const prepared = branchesIn.map((b) => prepareBranch(b.response, b.adjust));
  const { combinedSpl, combinedPhaseRaw } = sumBranches(prepared);
  return {
    freq: prepared[0].freq,
    branches: prepared,
    combinedSpl,
    combinedPhaseDeg: unwrapPhaseDeg(combinedPhaseRaw),
  };
}

/** Wrapped phase of branch b relative to branch a (a is the 0° line) — the
 *  pairwise generalization of the tweeter-relative-to-woofer curve. */
export function relativePhaseBetween(a: GriddedResponse, b: GriddedResponse): number[] {
  if (a.freq.length !== b.freq.length) throw new Error('relativePhaseBetween: grid mismatch');
  return b.phaseDeg.map((p, i) => wrapDeg(p - a.phaseDeg[i]));
}

export interface CombineResult {
  freq: number[];
  woofer: GriddedResponse;
  /** Tweeter after offset/trim/inversion have been applied. */
  tweeter: GriddedResponse;
  /** 20·log10 |Hw + Ht| */
  combinedSpl: number[];
  /** arg(Hw + Ht), degrees, UNWRAPPED — feeds group delay and the IFFT. */
  combinedPhaseDeg: number[];
  /** 20·log10 |Hw − Ht| (tweeter polarity flipped): the null-depth check. */
  invertedSpl: number[];
  /**
   * Tweeter phase relative to the woofer, wrapped to (−180, 180]. The woofer
   * is by definition the flat 0° line — exactly Stefan's relative-phase graph.
   */
  relativePhaseDeg: number[];
}

export function combine(
  woofer: GriddedResponse,
  tweeterRaw: GriddedResponse,
  adj: TweeterAdjust,
): CombineResult {
  const n = woofer.freq.length;
  if (tweeterRaw.freq.length !== n) throw new Error('combine: responses must share one grid');

  // Thin wrapper over the N-way core. NB: the tweeter adjustment is applied
  // even when it is all-zero (prepareBranch would skip it, so it is applied
  // here explicitly) to preserve the historical always-copy behavior.
  const tweeter: GriddedResponse = {
    freq: tweeterRaw.freq,
    spl: tweeterRaw.spl.map((s) => s + adj.trimDb),
    phaseDeg: tweeterRaw.phaseDeg.map((p, i) => p + adjustPhaseDeg(tweeterRaw.freq[i], adj)),
  };

  const { complexes, combinedSpl, combinedPhaseRaw } = sumBranches([woofer, tweeter]);

  const invertedSpl = new Array<number>(n);
  const relativePhaseDeg = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const hw = complexes[0][i];
    const ht = complexes[1][i];
    invertedSpl[i] = 20 * Math.log10(
      Math.hypot(hw.re - ht.re, hw.im - ht.im) || Number.MIN_VALUE,
    );
    relativePhaseDeg[i] = wrapDeg(tweeter.phaseDeg[i] - woofer.phaseDeg[i]);
  }

  return {
    freq: woofer.freq,
    woofer,
    tweeter,
    combinedSpl,
    combinedPhaseDeg: unwrapPhaseDeg(combinedPhaseRaw),
    invertedSpl,
    relativePhaseDeg,
  };
}

/**
 * Apply a (filter) voltage transfer to an acoustic response: SPL shifts by
 * 20·log10|H|, phase by arg(H). The transfer's phase is unwrapped across the
 * grid first so downstream unwrapped-phase math stays continuous.
 */
export function applyTransfer(g: GriddedResponse, h: readonly Complex[]): GriddedResponse {
  if (h.length !== g.freq.length) throw new Error('applyTransfer: grid length mismatch');
  const argDeg = unwrapPhaseDeg(h.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI));
  return {
    freq: g.freq,
    spl: g.spl.map((s, i) => s + 20 * Math.log10(Math.hypot(h[i].re, h[i].im) || Number.MIN_VALUE)),
    phaseDeg: g.phaseDeg.map((p, i) => p + argDeg[i]),
  };
}

/** Wrap degrees into (−180, 180]. */
export function wrapDeg(deg: number): number {
  let d = ((deg + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}
