import type { Complex } from './complex.ts';
import { defaultHpLp, type DriverFilterSpec } from './filters.ts';
import type { BranchAdjust, GriddedResponse, TweeterAdjust } from './dsp.ts';
import { synthesize, type SynthesisResult } from './synthesis.ts';
import { mergeSynthesizedSchematics } from './schematicEdit.ts';
import { optimizeNetworkValues, type NetOptimizeResult } from './netOptimizer.ts';
import type { SnapPrefs } from './catalog.ts';
import { bomFor } from './catalog.ts';
import type { VxpPart } from './parsers/vxp.ts';
import type { ChainStageProgress } from './designChain.ts';

/**
 * Three-way design chain — phase-4 trede 4c, deliberately STAGED (v1).
 *
 * The two-way chain earns its keep with vf-rounds (structure enumeration +
 * greedy EQ) before synthesis; the three-way v1 chain skips that stage and
 * goes straight from a TEXTBOOK target design (LR4 knees at the candidate
 * crossover points + level trims measured from the branch medians) through
 * per-branch synthesis into the assembled TWO-PAIR component tune. The tune
 * is where the interplay is judged anyway, and acoustic-mode synthesis
 * already carries the measurement-gated corrections (Zobel, Fs trap,
 * stopband trap, top-octave hold). Per-branch EQ design and alignment
 * enumeration can grow on top later — the honest note says what ran.
 *
 * The candidate axis is TWO-DIMENSIONAL (low × high handover); ranking mirrors
 * the two-way rules and adds the amplifier-load verdict as a DECISION gate:
 * a candidate whose tuned network cannot stay above the Z floor ranks below
 * one that can — Z is design physics in a 3-way (three parallel branches),
 * never an objective term (the anchor lesson).
 */

export interface Chain3Settings {
  phasePriority: number; // 0..1
  targets?: { rippleDb: number; phaseDeg: number };
  breakupGuard?: boolean;
  phaseMetric?: 'band' | 'overlap';
  synthMode: 'filter' | 'acoustic';
  catalogSnap?: boolean;
  snapPrefs?: SnapPrefs;
  band: [number, number];
  safety?: {
    freqs: readonly number[];
    w: GriddedResponse;
    t: GriddedResponse;
    m?: GriddedResponse;
    z: Record<string, readonly Complex[]>;
  };
}

export interface Chain3Input {
  grid: readonly number[];
  /** Banded branch responses (silent ghost outside each measurement range). */
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  /** Keyed by the canonical 3-way model names woofer/mid/tweeter. */
  driverZ: Record<string, readonly Complex[]>;
  tAdjust: TweeterAdjust;
  midAdjust: BranchAdjust;
  /** Candidate handover points (Hz). */
  xoLow: number;
  xoHigh: number;
  label: string;
  settings: Chain3Settings;
}

export interface Chain3Result {
  label: string;
  xoLow: number;
  xoHigh: number;
  specs: { woofer: DriverFilterSpec; mid: DriverFilterSpec; tweeter: DriverFilterSpec };
  synthWoofer: SynthesisResult;
  synthMid: SynthesisResult;
  synthTweeter: SynthesisResult;
  parts: VxpPart[];
  net: NetOptimizeResult;
  bomTotalEur: number | null;
  /** Amplifier-load verdict of the DELIVERED network: false when the tune was
   *  rejected on the Z floor or the dip could not be repaired. */
  zOk: boolean;
}

/** A branch is alive where its banded response is above the silent ghost. */
const ALIVE_DB = -300;

/** Median SPL of a branch over [lo,hi] ∩ its alive region; null when empty. */
function bandMedian(
  g: GriddedResponse,
  lo: number,
  hi: number,
): number | null {
  const vals: number[] = [];
  for (let i = 0; i < g.freq.length; i++) {
    if (g.freq[i] < lo || g.freq[i] > hi) continue;
    if (g.spl[i] <= ALIVE_DB) continue;
    vals.push(g.spl[i]);
  }
  if (vals.length < 4) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/** One full chain for one (xoLow, xoHigh) candidate. */
export function runThreeWayChain(
  input: Chain3Input,
  onProgress?: (p: ChainStageProgress) => void,
): Chain3Result {
  const { grid, w, m, t, driverZ, tAdjust, midAdjust, xoLow, xoHigh, settings: s } = input;

  // ---- Target design: textbook LR4 knees + measured level trims ----------
  // Passband medians per branch (each on its own honest region); every branch
  // trims DOWN to the quietest one — passive is cut-only.
  const medians = {
    w: bandMedian(w, s.band[0], xoLow),
    m: bandMedian(m, xoLow, xoHigh),
    t: bandMedian(t, xoHigh, s.band[1]),
  };
  const present = [medians.w, medians.m, medians.t].filter((v): v is number => v !== null);
  const floor = present.length > 0 ? Math.min(...present) : 0;
  const trim = (own: number | null): number =>
    own === null ? 0 : Math.min(0, Math.round((floor - own) * 10) / 10);

  const lr4 = (freq: number) => ({ ...defaultHpLp(freq), enabled: true, kind: 'LR' as const, order: 4 as const });
  const specs = {
    woofer: { gainDb: trim(medians.w), hp: defaultHpLp(200), lp: lr4(xoLow), eq: [] },
    mid: { gainDb: trim(medians.m), hp: lr4(xoLow), lp: lr4(xoHigh), eq: [] },
    tweeter: { gainDb: trim(medians.t), hp: lr4(xoHigh), lp: defaultHpLp(20000), eq: [] },
  };

  // ---- Per-branch synthesis on each branch's own alive sub-grid ----------
  onProgress?.({ stage: 'synthesis', evals: 0 });
  const synthOne = (
    spec: DriverFilterSpec,
    resp: GriddedResponse,
    zKey: string,
  ): SynthesisResult => {
    const idxs: number[] = [];
    for (let i = 0; i < grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
    const sub = idxs.map((i) => grid[i]);
    const z = driverZ[zKey];
    const zSub = idxs.map((i) => z[i]);
    return synthesize(spec, sub, zSub, {
      mode: s.synthMode,
      phasePriority: s.phasePriority,
      catalogSnap: s.catalogSnap,
      corrections: (s.targets ? 'lean' : 'auto') as 'lean' | 'auto',
      leanTargetDb: s.targets?.rippleDb,
      snapPrefs: s.snapPrefs?.profile === 'position' ? { ...s.snapPrefs, profile: 'premium' as const } : s.snapPrefs,
      ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
    });
  };
  const synthWoofer = synthOne(specs.woofer, w, 'woofer');
  const synthMid = synthOne(specs.mid, m, 'mid');
  const synthTweeter = synthOne(specs.tweeter, t, 'tweeter');
  const merged = mergeSynthesizedSchematics([
    { components: synthWoofer.components, model: 'woofer' },
    { components: synthMid.components, model: 'mid' },
    { components: synthTweeter.components, model: 'tweeter' },
  ]).parts;

  // ---- Assembled two-pair tune -------------------------------------------
  onProgress?.({ stage: 'tune', evals: 0 });
  const net = optimizeNetworkValues(merged, grid, w, t, driverZ, tAdjust, {
    midBranch: { response: m, adjust: midAdjust },
    phasePriority: s.phasePriority,
    breakupGuard: s.breakupGuard,
    staged: s.targets,
    phaseMetric: s.phaseMetric,
    catalogSnap: s.catalogSnap,
    snapPrefs: s.snapPrefs,
    band: s.band,
    safety: s.safety,
    onStage: (detail) => onProgress?.({ stage: 'tune', evals: 0, detail }),
  });

  const zOk =
    !net.safetyNote &&
    !(net.ampFloorNote !== undefined && net.ampFloorNote.includes('could not be repaired'));

  return {
    label: input.label,
    xoLow,
    xoHigh,
    specs,
    synthWoofer,
    synthMid,
    synthTweeter,
    parts: net.parts,
    net,
    bomTotalEur: bomFor(net.parts).totalEur,
    zOk,
  };
}

/**
 * 2D candidate grid around the RAW pair crossings (where the unfiltered
 * branch levels meet — the natural handover neighbourhoods). Two steps per
 * axis (×0.75 / ×1.4 around the crossing) = 4 chains: enough competition to
 * escape a bad basin without the runtime of a full grid. Clamped to sane
 * territory and to xoHigh ≥ 2.5 × xoLow (a 3-way needs real branch bands).
 */
export function crossover3Variants(
  w: GriddedResponse,
  m: GriddedResponse,
  t: GriddedResponse,
): { label: string; xoLow: number; xoHigh: number }[] {
  const firstCross = (lower: GriddedResponse, upper: GriddedResponse, lo: number, hi: number): number => {
    for (let i = 0; i < lower.freq.length; i++) {
      const f = lower.freq[i];
      if (f < lo || f > hi) continue;
      if (lower.spl[i] <= ALIVE_DB || upper.spl[i] <= ALIVE_DB) continue;
      if (upper.spl[i] >= lower.spl[i]) return f;
    }
    return Math.sqrt(lo * hi);
  };
  const rawLow = Math.min(1200, Math.max(250, firstCross(w, m, 200, 1500)));
  const rawHigh = Math.min(7000, Math.max(1800, firstCross(m, t, 1200, 9000)));
  const out: { label: string; xoLow: number; xoHigh: number }[] = [];
  for (const fl of [rawLow * 0.75, rawLow * 1.4]) {
    for (const fh of [rawHigh * 0.75, rawHigh * 1.4]) {
      const xoLow = Math.round(Math.min(1200, Math.max(250, fl)));
      const xoHigh = Math.round(Math.min(8000, Math.max(xoLow * 2.5, Math.min(7000, fh))));
      out.push({ label: `${xoLow}/${xoHigh} Hz`, xoLow, xoHigh });
    }
  }
  return out;
}

/**
 * Rank: the amplifier-load verdict gates FIRST (a 3-way that cooks the amp is
 * not a candidate, however flat), then staged targets, then the two-way
 * blended score on the same doctrine numbers (whole-range avg in the ripple
 * slot); near-equal winners (≤5%) resolve to the cheaper priced BOM.
 */
export function rankChain3Results(
  results: readonly Chain3Result[],
  targets: { rippleDb: number; phaseDeg: number } | undefined,
  phasePriority: number,
): Chain3Result[] {
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const rippleOf = (r: Chain3Result): number =>
    r.net.after.avgDevDb != null ? (Math.PI / 2) * r.net.after.avgDevDb : r.net.after.rippleDb;
  const score = (r: Chain3Result): number =>
    2 * (1 - p) * rippleOf(r) ** 2 + 2 * p * (r.net.after.phaseDeg / 15) ** 2;
  const meets = (r: Chain3Result): boolean =>
    !targets ||
    (r.net.after.rippleDb <= targets.rippleDb && r.net.after.phaseDeg <= targets.phaseDeg);
  const ranked = [...results].sort((a, b) => {
    const za = a.zOk ? 0 : 1;
    const zb = b.zOk ? 0 : 1;
    if (za !== zb) return za - zb;
    const ma = meets(a) ? 0 : 1;
    const mb = meets(b) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return score(a) - score(b);
  });
  if (ranked.length > 1) {
    const s0 = score(ranked[0]);
    const tied = ranked.filter(
      (r) => r.zOk === ranked[0].zOk && meets(r) === meets(ranked[0]) && score(r) <= s0 * 1.05,
    );
    if (tied.length > 1) {
      const priced = tied.filter((r) => r.bomTotalEur !== null);
      if (priced.length > 0) {
        const best = priced.reduce((x, y) => (y.bomTotalEur! < x.bomTotalEur! ? y : x));
        if (best !== ranked[0]) return [best, ...ranked.filter((r) => r !== best)];
      }
    }
  }
  return ranked;
}
