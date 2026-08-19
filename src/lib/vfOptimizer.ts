import { nelderMead } from './optimize.ts';
import {
  evalDriverFilter,
  isActive,
  type DriverFilterSpec,
  type FilterKind,
} from './filters.ts';
import { applyTransfer, combine, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { computeIntegration } from './integration.ts';
import { powerShape, smoothDbGaussian, type PowerMetricMode } from './bandMetrics.ts';
import type { AngleResponse } from './directivity.ts';

/**
 * Virtual-filter optimizer — designs the crossover for you, greedily.
 *
 * The optimizer is NOT limited to what the user enabled; user settings only
 * seed starting points. Strategy (much more robust than one high-dimensional
 * search):
 *
 *   1. STRUCTURE — enumerate LP/HP alignment (LR2, LR4, BW3, Bessel4) ×
 *      polarity; for each, optimise just the 3 base knobs (both crossover
 *      frequencies + tweeter level). Low-dimensional, reliable ranking. The
 *      user's preferred alignment, when given, is BINDING — the designer
 *      picks the foundation, the optimizer builds the best design on it.
 *   2. GREEDY EQ — repeat up to the band budget: locate the largest remaining
 *      response deviation, seed a band there on the driver that owns that
 *      region, optimise only that band's 3 knobs, and KEEP IT ONLY IF it
 *      measurably improves the objective. No improvement → stop adding.
 *   3. POLISH — one full refinement over everything that survived,
 *      warm-started from the greedy solution.
 *
 * STAGED MODE (`targets`): the escalation ladder stops the moment the design
 * is good enough — HP/LP structure first; EQ bands are only added while the
 * ripple/phase targets are unmet. Fewest components that reach the goal,
 * instead of every component the budget allows. `stages` in the result
 * reports what each escalation step bought.
 *
 * Objective on the measured responses:
 *   (1−p)·(combined-response ripple)² + p·(overlap phase error)²
 * with p = phase priority (1 dB ripple ≙ 15° phase at balance).
 *
 * The band budget is the user's creative choice — the software does not cap
 * you; physics and patience do.
 */

export interface VfSpecs {
  woofer: DriverFilterSpec;
  tweeter: DriverFilterSpec;
}

export interface VfMetrics {
  /** Std dev of the TARGET curve (on-axis or listening window) around its
   *  mean over the evaluation band, dB — the smooth term the objective uses. */
  responseStdDb: number;
  /** Peak ±(max−min)/2 of the on-axis combined curve over the band — the
   *  strip's unit; staged TARGETS gate on this, never the objective. */
  responseRipplePeakDb: number;
  /** Mean |relative phase| in degrees (180 if no overlap). Metric depends on
   *  `phaseMetric`: 'band' = uniform over the overlap window — IDENTICAL to
   *  the phase-flatness panel's "avg"; 'overlap' = the classic
   *  overlap-weighted mean (centre-heavy). */
  avgPhaseErrDeg: number;
  /** P95 of |relative phase| over the overlap window, degrees. */
  phaseP95Deg?: number;
  /** The 0–100 summing-efficiency score, for display. */
  integrationScore: number | null;
  /** Std dev of the horizontal energy average (in-room proxy), dB — null
   *  when no angle data was provided. */
  powerStdDb: number | null;
  /** Smooth power metric: DI fold near the crossing (dB) and trend slope
   *  (dB/decade); null without angle data or in legacy mode. */
  powerFoldDb?: number | null;
  powerSlopeDbDec?: number | null;
  /** Breakup guard: mean squared 20 dB-margin deficit of stopband leakage
   *  beside the crossover (dB²). 0 = every leak ≥ 20 dB down. */
  leakSqDb?: number;
  /** ACOUSTIC crossover: where the filtered driver SPLs cross (Hz), null if
   *  they never do. This — not the electrical knee — is what the designer's
   *  crossover-point constraint pins. */
  xoHz?: number | null;
  /** How far the combined SPL at the crossing sits BELOW the band mean (dB,
   *  beyond a 6 dB allowance). A healthy crossing meets ON level; a starved
   *  branch "crosses" the other one deep in a hole. */
  xoDipDb?: number;
  /** Measured ACOUSTIC slopes beside the crossing (dB/oct, least squares
   *  over ~1 octave); only computed when `acousticSlopes` targets are set. */
  midSlopeDbOct?: number | null;
  tweeterSlopeDbOct?: number | null;
}

/** One HP/LP alignment choice (kind + order) in the structure search. */
export interface StructChoice {
  kind: FilterKind;
  order: 1 | 2 | 3 | 4;
}

/** What one escalation step of the staged design bought. */
export interface VfStage {
  label: string;
  rippleDb: number;
  phaseDeg: number;
}

export interface VfOptimizeResult {
  specs: VfSpecs;
  /** Best polarity for the tweeter (drives the UI checkbox). */
  inverted: boolean;
  structure: {
    wooferLpOrder: 1 | 2 | 3 | 4;
    tweeterHpOrder: 1 | 2 | 3 | 4;
    wooferLpKind: FilterKind;
    tweeterHpKind: FilterKind;
  };
  /** Escalation report: metrics after each stage that changed the design. */
  stages: VfStage[];
  before: VfMetrics;
  after: VfMetrics;
  converged: boolean;
  /** Active search dimensions in the final polish (3 + 3 per kept band). */
  parameterCount: number;
  /** EQ bands the greedy stage actually kept, per driver. */
  bandsUsed: { woofer: number; tweeter: number };
  /** Final internal objective value — comparable across runs with the SAME
   *  options; lets a multi-round driver keep the best of several runs. */
  objective: number;
  /** Full network simulations performed (objective evaluations). */
  evaluations: number;
}

export interface VfOptimizeOptions {
  /** 0..1, share of the error budget spent on phase. Default 0.5. */
  phasePriority?: number;
  /** Combined-response evaluation band, Hz. Default [300, 16000] ∩ grid. */
  band?: [number, number];
  /** Iterations for the final polish. Default scales with dimensions. */
  maxIterations?: number;
  /**
   * Max EQ bands per driver the greedy stage may add. Default 2. Bands that
   * do not measurably improve the result are never added, whatever the
   * budget.
   */
  eqBandsPerDriver?: number;
  /** Minimum relative objective improvement to accept a band. Default 0.02. */
  minBandImprovement?: number;
  /** Per-driver angle responses (same grid). Enables directivity-aware
   *  optimisation and the listening-window target. */
  angleData?: { woofer: AngleResponse[]; tweeter: AngleResponse[] };
  /** 0..1: share of the AMPLITUDE budget spent on the energy average
   *  (in-room proxy) instead of the target curve. Default 0. */
  directivityWeight?: number;
  /** How the energy average is judged (bandMetrics.powerShape): 'smooth'
   *  (default) = std of the DETRENDED power response + a fold term near the
   *  crossing, slope free; 'legacy' = std of the raw power (flatness). */
  powerMetric?: PowerMetricMode;
  /** Weight of the DI-fold term as a share of dW. Default 0.5. */
  powerFoldWeight?: number;
  /** Error smoothing for the SEARCH objective (bandMetrics.smoothDbGaussian):
   *  the driver magnitudes are Gaussian-smoothed in log-f by this width
   *  BEFORE decimation to the ~150-point inner grid, so diffraction ripple
   *  and measurement noise no filter can fix stop steering the search. 0 =
   *  off (legacy, raw points). Default 1/12 oct. Phase is never smoothed;
   *  gates, staged targets and the full-grid audit stay raw. */
  errorSmoothOct?: number;
  /** Which curve the amplitude term flattens. Default 'onAxis'.
   *  'listeningWindow' needs angleData (falls back to on-axis without). */
  ampTarget?: 'onAxis' | 'listeningWindow';
  /**
   * Pin the ACOUSTIC crossover: the frequency where the filtered driver
   * responses cross must land inside this range (Hz). The designer's way to
   * say "the handover belongs here". Deliberately NOT a knee constraint —
   * with a hot tweeter the acoustic crossing sits far below the electrical
   * knees (learned from Sander's screenshot: knees caged at 2200–2600 Hz,
   * real handover at 1631 Hz); the knees stay the optimizer's business.
   */
  xoRange?: [number, number];
  /**
   * Hard floor for the tweeter HP knee (Hz) — the classic ≥2×Fs rule, fed
   * from the measured impedance peak. Knee-domain, so it coexists with the
   * (acoustic) `xoRange`.
   */
  hpFloorHz?: number;
  /**
   * Breakup guard: penalize stopband leakage beside the crossover (a driver
   * still within 20 dB of the combined between 1.6× and 4× the crossing).
   * A resonance's PHASE cannot be filtered away — only its LEVEL can be made
   * irrelevant; this term makes the optimizer buy that margin (deeper cuts,
   * steeper orders) instead of leaving cone breakup poking through. Default
   * false.
   */
  breakupGuard?: boolean;
  /**
   * Preferred HP/LP alignment (applied to both knees). BINDING: the designer
   * picks the foundation; knees, level, polarity and all later stages stay
   * free. Omit for a free enumeration over the alignment library.
   */
  structurePreference?: StructChoice;
  /**
   * SPEED: fix the LP and HP alignment (separately — unlike the symmetric
   * `structurePreference`) instead of enumerating the 4×4 library. Used by the
   * re-seed rounds, which already sit in the round-1 winner's basin and would
   * otherwise re-enumerate all 32 structure×polarity descents every round for
   * a structure that virtually never changes. Polarity stays free (2 descents).
   * Ignored when `structurePreference` is set (that is the binding user choice).
   */
  fixedStructure?: { lp: StructChoice; hp: StructChoice };
  /**
   * Staged design ("trapmethode"): stop escalating as soon as BOTH targets
   * are met — ripple (std dev, dB) and average overlap phase error (°). The
   * HP/LP structure must earn as much as it can first; EQ bands are only
   * added while the targets are unmet. Fewest components that reach the
   * goal. Omit for the classic budget-limited behaviour.
   */
  targets?: { rippleDb: number; phaseDeg: number };
  /**
   * Target ACOUSTIC slopes beside the crossing (dB/oct, positive) — what the
   * classic "acoustic 4th order at the tweeter" rule prescribes. The
   * optimizer steers the MEASURED slope (driver rolloff + filter, least
   * squares over ~1 octave beside the crossing) toward the target. Falling
   * short costs more than being steeper (protection never hurts). Omit a
   * side (or the whole option) for free slopes — the fallback behaviour.
   */
  acousticSlopes?: { mid?: number; tweeter?: number };
  /**
   * How phase error is measured (Sanders three-screenshot lesson: the
   * optimizer and the phase-flatness panel measured DIFFERENT things, so
   * more phase priority could worsen the number the user reads).
   *  - 'band' (default): uniform mean over the whole overlap window — the
   *    exact number the panel shows as "avg" — plus a P95 excursion term in
   *    the objective. Flat across the whole handover, not just the centre.
   *  - 'overlap': the classic overlap-weighted mean (centre-heavy) — the
   *    fallback to the old behaviour.
   */
  phaseMetric?: 'band' | 'overlap';
  /**
   * Passive-honest mode: EQ bands may only CUT (gain ≤ 0), because a passive
   * network cannot boost. The flatness metric is level-free (std around the
   * band mean), so holding a drooping region flat is expressed as shelf-cuts
   * of everything else — exactly what a pad+bypass network builds — and the
   * optimizer's verdict survives synthesis loss-free. Relative driver gain
   * stays free (synthesis turns it into attenuation of the louder driver).
   * Default false.
   */
  cutOnly?: boolean;
}

/* ------------------------------------------------------------------ */

interface ParamHandle {
  lo: number; // encoded-space bounds
  hi: number;
  encode: (v: number) => number;
  decode: (x: number) => number;
  get: (s: VfSpecs) => number;
  set: (s: VfSpecs, v: number) => void;
}

const logP = (lo: number, hi: number) => ({
  lo: Math.log10(lo),
  hi: Math.log10(hi),
  encode: Math.log10,
  decode: (x: number) => 10 ** x,
});

const dbP = (lo: number, hi: number) => ({
  lo: lo / 10,
  hi: hi / 10,
  encode: (v: number) => v / 10,
  decode: (x: number) => x * 10,
});

const clone = (s: VfSpecs): VfSpecs => JSON.parse(JSON.stringify(s)) as VfSpecs;

/** Base EQ placement bounds; the effective top is capped at the evaluation
 *  band's upper edge — a band ABOVE what is being judged is a wasted band,
 *  and a cap BELOW it leaves the last octave drooping out of reach (seen as
 *  bands stacking pegged against the old 16 kHz wall). */
const EQ_RANGE: Record<'woofer' | 'tweeter', [number, number]> = {
  woofer: [400, 8000],
  tweeter: [1500, 19500],
};

type EqRanges = Record<'woofer' | 'tweeter', [number, number]>;

function baseHandles(hpFloor: number | null = null): ParamHandle[] {
  const lpB: [number, number] = [800, 6000];
  const hpB: [number, number] = [Math.max(800, hpFloor ?? 0), 8000];
  return [
    {
      ...logP(lpB[0], lpB[1]),
      get: (s) => s.woofer.lp.freq,
      set: (s, v) => (s.woofer.lp.freq = v),
    },
    {
      ...logP(hpB[0], hpB[1]),
      get: (s) => s.tweeter.hp.freq,
      set: (s, v) => (s.tweeter.hp.freq = v),
    },
    {
      ...dbP(-24, 6),
      get: (s) => s.tweeter.gainDb,
      set: (s, v) => (s.tweeter.gainDb = v),
    },
  ];
}

function bandHandles(
  side: 'woofer' | 'tweeter',
  index: number,
  ranges: EqRanges = EQ_RANGE,
  gainHi = 6,
): ParamHandle[] {
  const [fLo, fHi] = ranges[side];
  return [
    {
      ...logP(fLo, fHi),
      get: (s) => s[side].eq[index].freq,
      set: (s, v) => (s[side].eq[index].freq = v),
    },
    {
      ...dbP(-18, gainHi),
      get: (s) => s[side].eq[index].gainDb,
      set: (s, v) => (s[side].eq[index].gainDb = v),
    },
    {
      ...logP(0.3, 8),
      get: (s) => s[side].eq[index].q,
      set: (s, v) => (s[side].eq[index].q = v),
    },
  ];
}

const meanIn = (g: GriddedResponse, lo: number, hi: number): number => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < g.freq.length; i++) {
    if (g.freq[i] >= lo && g.freq[i] <= hi) {
      s += g.spl[i];
      n++;
    }
  }
  return n ? s / n : 0;
};

/* ------------------------------------------------------------------ */

export function optimizeVirtualFilters(
  grid: readonly number[],
  wooferRaw: GriddedResponse,
  tweeterRaw: GriddedResponse,
  seed: VfSpecs,
  adjust: TweeterAdjust,
  opts: VfOptimizeOptions = {},
): VfOptimizeResult {
  const {
    phasePriority = 0.5,
    eqBandsPerDriver = 2,
    minBandImprovement = 0.01,
    angleData,
    directivityWeight = 0,
    powerMetric = 'smooth',
    powerFoldWeight = 0.5,
    errorSmoothOct = 1 / 12,
    ampTarget = 'onAxis',
    cutOnly = false,
    breakupGuard = false,
    structurePreference,
    fixedStructure,
    targets,
    phaseMetric = 'band',
  } = opts;
  const acSlopes =
    opts.acousticSlopes && (opts.acousticSlopes.mid || opts.acousticSlopes.tweeter)
      ? opts.acousticSlopes
      : null;
  const gainHi = cutOnly ? 0 : 6;
  // Sanitised crossover range: ordered, inside sanity bounds, non-degenerate.
  const xo: [number, number] | null = (() => {
    if (!opts.xoRange) return null;
    const lo = Math.max(300, Math.min(opts.xoRange[0], opts.xoRange[1]));
    const hi = Math.min(12000, Math.max(opts.xoRange[0], opts.xoRange[1]));
    return hi > lo * 1.02 ? [lo, hi] : null;
  })();
  // Seeds start inside the requested acoustic range (a reasonable first
  // guess); the knees themselves remain free — only the CROSSING is pinned.
  const clampXo = (f: number): number => (xo ? Math.min(Math.max(f, xo[0]), xo[1]) : f);
  // Fs floor for the HP knee (≥2×Fs rule) — knee-domain, coexists with xo.
  const hpFloor = opts.hpFloorHz ? Math.min(Math.max(opts.hpFloorHz, 800), 6000) : null;
  const clampHp = (f: number): number => Math.max(clampXo(f), hpFloor ?? 0);
  const dW = angleData ? Math.min(Math.max(directivityWeight, 0), 1) : 0;
  const useLw = ampTarget === 'listeningWindow' && !!angleData;
  const nEq = Math.max(0, Math.round(eqBandsPerDriver));
  const p = Math.min(Math.max(phasePriority, 0), 1);
  // The slider steers INSIDE an anchored envelope: at p=1 the amplitude term
  // must not vanish, or the optimizer trades a wrecked response (measured:
  // 4.4 dB ripple) for a phase metric it can then game — the overlap weights
  // that define "phase error" are themselves amplitude-shaped. And amplitude
  // flatness and phase alignment largely AGREE (a smooth sum is already near
  // in-phase at the crossover), so the extremes are mostly downside — the
  // envelope is deliberately gentle: pw ∈ [0.15, 0.85], i.e. 0% ≈ 5.7:1
  // amplitude, 100% ≈ 1:5.7 phase, never a pure trade. Same envelope in
  // synthesis/netOptimizer/designChain.
  const pw = 0.15 + 0.7 * p;
  const band: [number, number] = opts.band ?? [
    Math.max(300, grid[0]),
    Math.min(16000, grid[grid.length - 1]),
  ];

  const eqRanges: EqRanges = {
    woofer: [EQ_RANGE.woofer[0], Math.min(EQ_RANGE.woofer[1], band[1])],
    tweeter: [EQ_RANGE.tweeter[0], Math.min(EQ_RANGE.tweeter[1], band[1])],
  };

  // Decimated grid for the inner loop; full grid for reported metrics.
  const step = Math.max(1, Math.floor(grid.length / 150));
  const idx: number[] = [];
  for (let i = 0; i < grid.length; i += step) idx.push(i);
  const pick = (g: GriddedResponse): GriddedResponse => ({
    freq: idx.map((i) => g.freq[i]),
    spl: idx.map((i) => g.spl[i]),
    phaseDeg: idx.map((i) => g.phaseDeg[i]),
  });
  // Error smoothing BEFORE decimation (see errorSmoothOct): magnitudes only.
  const smoothMag = (g: GriddedResponse): GriddedResponse =>
    errorSmoothOct > 0 ? { ...g, spl: smoothDbGaussian(g.freq, g.spl, errorSmoothOct) } : g;
  const optW = pick(smoothMag(wooferRaw));
  const optT = pick(smoothMag(tweeterRaw));
  const pickAngles = (set: AngleResponse[]): AngleResponse[] =>
    set.map((a) => ({ hor: a.hor, response: pick(smoothMag(a.response)) }));
  const optAngles = angleData
    ? { woofer: pickAngles(angleData.woofer), tweeter: pickAngles(angleData.tweeter) }
    : null;

  const filtered = (w: GriddedResponse, t: GriddedResponse, cand: VfSpecs) => ({
    wF: isActive(cand.woofer) ? applyTransfer(w, evalDriverFilter(cand.woofer, w.freq)) : w,
    tF: isActive(cand.tweeter) ? applyTransfer(t, evalDriverFilter(cand.tweeter, t.freq)) : t,
  });

  /** In-band flatness (std dev around the mean) of a curve. */
  const bandStd = (freq: readonly number[], spl: readonly number[]): number => {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      sum += spl[i];
      sumSq += spl[i] * spl[i];
      n++;
    }
    const mean = sum / n;
    return Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  };

  /** Peak flatness ±(max−min)/2 over the band — the strip's unit, what staged
   *  targets gate on. The objective keeps the smooth std-dev (bandStd). */
  const bandPeak = (freq: readonly number[], spl: readonly number[]): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      if (spl[i] < lo) lo = spl[i];
      if (spl[i] > hi) hi = spl[i];
    }
    return Number.isFinite(lo) && hi > lo ? (hi - lo) / 2 : 0;
  };

  const metricsOn = (
    w: GriddedResponse,
    t: GriddedResponse,
    cand: VfSpecs,
    inverted: boolean,
    angles: { woofer: AngleResponse[]; tweeter: AngleResponse[] } | null,
  ): VfMetrics => {
    const hW = isActive(cand.woofer) ? evalDriverFilter(cand.woofer, w.freq) : null;
    const hT = isActive(cand.tweeter) ? evalDriverFilter(cand.tweeter, t.freq) : null;
    const wF = hW ? applyTransfer(w, hW) : w;
    const tF = hT ? applyTransfer(t, hT) : t;
    const r = combine(wF, tF, { ...adjust, inverted });
    const integ = computeIntegration(r);

    let powerStdDb: number | null = null;
    let powerDbArr: number[] | null = null;
    let lwStd: number | null = null;
    if (angles) {
      // Energy averages over the measured angles (transfers are the same at
      // every angle — the crossover is electrical).
      const n = r.freq.length;
      const shared = angles.woofer
        .map((a) => a.hor)
        .filter((h) => angles.tweeter.some((tt) => tt.hor === h));
      const powerAcc = new Array<number>(n).fill(0);
      const lwAcc = new Array<number>(n).fill(0);
      let lwCount = 0;
      for (const hor of shared) {
        let aw = angles.woofer.find((x) => x.hor === hor)!.response;
        let at = angles.tweeter.find((x) => x.hor === hor)!.response;
        if (hW) aw = applyTransfer(aw, hW);
        if (hT) at = applyTransfer(at, hT);
        const spl = combine(aw, at, { ...adjust, inverted }).combinedSpl;
        for (let i = 0; i < n; i++) powerAcc[i] += 10 ** (spl[i] / 10);
        if (hor <= 30) {
          for (let i = 0; i < n; i++) lwAcc[i] += 10 ** (spl[i] / 10);
          lwCount++;
        }
      }
      const powerDb = powerAcc.map((v) => 10 * Math.log10(v / shared.length));
      powerStdDb = bandStd(r.freq, powerDb);
      powerDbArr = powerDb;
      if (lwCount > 0) {
        lwStd = bandStd(r.freq, lwAcc.map((v) => 10 * Math.log10(v / lwCount)));
      }
    }

    const responseStdDb =
      useLw && lwStd !== null ? lwStd : bandStd(r.freq, r.combinedSpl);

    // Both phase metrics from the same points (|ΔdB| ≤ 20 window):
    // weighted (classic, centre-heavy) and uniform + P95 (the panel's avg —
    // integer-degree buckets keep P95 sort-free in the inner loop).
    let wSum = 0;
    let eSum = 0;
    let uSum = 0;
    let uN = 0;
    const buckets = new Array<number>(181).fill(0);
    for (const pt of integ.points) {
      if (pt.cls === null) continue;
      wSum += pt.weight;
      eSum += pt.weight * pt.phaseErrorDeg;
      uSum += pt.phaseErrorDeg;
      uN++;
      buckets[Math.min(180, Math.round(pt.phaseErrorDeg))]++;
    }
    let phaseP95Deg = 180;
    if (uN > 0) {
      const need = Math.ceil(0.95 * uN);
      let acc = 0;
      for (let d = 0; d <= 180; d++) {
        acc += buckets[d];
        if (acc >= need) {
          phaseP95Deg = d;
          break;
        }
      }
    }
    const avgPhaseErrDeg =
      phaseMetric === 'band' ? (uN > 0 ? uSum / uN : 180) : wSum > 0 ? eSum / wSum : 180;

    // ACOUSTIC crossing: where the filtered drivers meet. The quantity the
    // designer's crossover-point constraint pins, and the guard's anchor.
    let xi = -1;
    for (let i = 1; i < r.freq.length; i++) {
      if (wF.spl[i] - tF.spl[i] <= 0) {
        xi = i;
        break;
      }
    }
    const xoHz = xi > 0 ? r.freq[xi] : null;

    // FUNDAMENTAL — the crossing must not sit in a VALLEY (see netOptimizer
    // for the full story): a starved branch still "crosses" the other one,
    // but deep in a hole, and every crossing-anchored guard then looks at
    // the wrong place. A valley is higher on BOTH sides; a mere level step
    // is higher on one side only and is already priced by ripple. 6 dB of
    // room for BW3-style crossings and driver ripple.
    let xoDipDb = 0;
    if (xi > 0) {
      const xoHzV = r.freq[xi];
      let maxLo = -Infinity;
      let maxHi = -Infinity;
      for (let i = 0; i < r.freq.length; i++) {
        const f = r.freq[i];
        if (f >= xoHzV / 4 && f <= xoHzV / 1.3) maxLo = Math.max(maxLo, r.combinedSpl[i]);
        else if (f >= xoHzV * 1.3 && f <= xoHzV * 4) maxHi = Math.max(maxHi, r.combinedSpl[i]);
      }
      if (Number.isFinite(maxLo) && Number.isFinite(maxHi)) {
        xoDipDb = Math.max(0, Math.min(maxLo, maxHi) - r.combinedSpl[xi] - 6);
      }
    }

    // Measured acoustic slopes beside the crossing (only when targeted).
    let midSlopeDbOct: number | null = null;
    let tweeterSlopeDbOct: number | null = null;
    if (acSlopes && xoHz !== null) {
      const fitSlope = (spl: readonly number[], lo: number, hi: number): number | null => {
        let n = 0;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let sxy = 0;
        for (let i = 0; i < r.freq.length; i++) {
          const f = r.freq[i];
          if (f < lo || f > hi) continue;
          const x = Math.log2(f);
          n++;
          sx += x;
          sy += spl[i];
          sxx += x * x;
          sxy += x * spl[i];
        }
        if (n < 4) return null;
        return (n * sxy - sx * sy) / (n * sxx - sx * sx);
      };
      if (acSlopes.mid) midSlopeDbOct = fitSlope(wF.spl, xoHz * 1.15, xoHz * 2.2);
      if (acSlopes.tweeter) tweeterSlopeDbOct = fitSlope(tF.spl, xoHz / 2.2, xoHz / 1.15);
    }

    // Breakup guard: a driver's stopband leakage beside the measured
    // crossing must sit ≥ 20 dB under the combined — resonance PHASE can't
    // be filtered, only its level can be made irrelevant.
    let leakSqDb = 0;
    if (breakupGuard) {
      if (xi > 0) {
        const xoF = r.freq[xi];
        let acc = 0;
        let n = 0;
        for (let i = 0; i < r.freq.length; i++) {
          const f = r.freq[i];
          let margin: number | null = null;
          if (f >= xoF * 1.6 && f <= xoF * 4) margin = r.combinedSpl[i] - wF.spl[i];
          else if (f >= xoF / 4 && f <= xoF / 1.6) margin = r.combinedSpl[i] - tF.spl[i];
          if (margin !== null) {
            const d = Math.max(0, 20 - margin);
            acc += d * d;
            n++;
          }
        }
        leakSqDb = n ? acc / n : 0;
      }
    }

    // Power-response SHAPE (aug 2026): smoothness owned, slope free.
    let powerFoldDb: number | null = null;
    let powerSlopeDbDec: number | null = null;
    if (powerDbArr && powerMetric === 'smooth') {
      const shp = powerShape(r.freq, powerDbArr, band, [xoHz]);
      powerStdDb = shp.residualStdDb;
      powerFoldDb = shp.foldDb;
      powerSlopeDbDec = shp.slopeDbPerDecade;
    } else if (powerDbArr) {
      powerSlopeDbDec = powerShape(r.freq, powerDbArr, band).slopeDbPerDecade;
    }
    return {
      responseStdDb,
      responseRipplePeakDb: bandPeak(r.freq, r.combinedSpl),
      avgPhaseErrDeg,
      phaseP95Deg,
      integrationScore: integ.score,
      powerStdDb,
      powerFoldDb,
      powerSlopeDbDec,
      xoHz,
      xoDipDb,
      midSlopeDbOct,
      tweeterSlopeDbOct,
      ...(breakupGuard ? { leakSqDb } : {}),
    };
  };

  let evalCount = 0;
  // The designer's crossover point pins the ACOUSTIC crossing: quadratic in
  // octaves outside the range, heavy enough to act as a constraint (0.43 oct
  // off ≈ the cost of ~1.9 dB ripple). FUNDAMENTAL (always on, pin or no
  // pin): no crossing at all means a starved/dead branch, and it also zeroes
  // the breakup guard (which anchors on the crossing) — without this term
  // the degenerate design escapes unpunished.
  const xoPenalty = (xoHz: number | null | undefined): number => {
    if (xoHz == null) return 120; // no crossing at all ≙ 2 octaves off
    if (!xo) return 0;
    const oct =
      xoHz < xo[0] ? Math.log2(xo[0] / xoHz) : xoHz > xo[1] ? Math.log2(xoHz / xo[1]) : 0;
    // ADAPTIVE weight: for a classic wide pin (±0.15 oct or more) this is the
    // original 30·oct² — but a narrow SCAN slice must actually cage its
    // candidate (Sanders screenshot: "2325 Hz" landed at 2152, a slice-width
    // outside, for a penalty of ~0.4 — the subdivision meant nothing). Scale
    // by (0.15 oct / half-width)², capped ×100, so escaping a narrow slice by
    // one slice-width costs ~"no crossing" money regardless of slice size.
    const halfOct = Math.log2(xo[1] / xo[0]) / 2;
    const scale = Math.min(100, Math.max(1, (0.15 / Math.max(halfOct, 1e-6)) ** 2));
    return 30 * scale * oct * oct;
  };
  /** Band mode punishes excursions too: "vaker voorbij de 15°/45°-schaal"
   *  must cost, even when the average still looks tidy. */
  const phaseTerm = (m: VfMetrics): number =>
    (m.avgPhaseErrDeg / 15) ** 2 +
    (phaseMetric === 'band' ? 0.5 * ((m.phaseP95Deg ?? 180) / 45) ** 2 : 0);
  /** Acoustic-slope targets: one order (6 dB/oct) short ≈ the cost of
   *  ~1.1 dB ripple; steeper than asked is ~6× cheaper (protection). */
  const slopePenalty = (m: VfMetrics): number => {
    if (!acSlopes) return 0;
    let pen = 0;
    const one = (measured: number | null | undefined, target?: number) => {
      if (!target || measured == null) return;
      const d = (Math.abs(measured) - target) / 6;
      pen += d < 0 ? 2.5 * d * d : 0.4 * d * d;
    };
    one(m.midSlopeDbOct, acSlopes.mid);
    one(m.tweeterSlopeDbOct, acSlopes.tweeter);
    return pen;
  };
  const objValue = (cand: VfSpecs, inverted: boolean): number => {
    evalCount++;
    const m = metricsOn(optW, optT, cand, inverted, optAngles);
    const amp =
      dW > 0 && m.powerStdDb !== null
        ? (1 - dW) * m.responseStdDb ** 2 +
          dW * (m.powerStdDb ** 2 + (m.powerFoldDb != null ? powerFoldWeight * m.powerFoldDb ** 2 : 0))
        : m.responseStdDb ** 2;
    // Guard scale: 9 dB average margin deficit ≈ the cost of ~0.9 dB ripple.
    return (
      2 * (1 - pw) * amp +
      2 * pw * phaseTerm(m) +
      (breakupGuard ? 0.02 * (m.leakSqDb ?? 0) : 0) +
      // Dead-spot crossing (always on): meeting in a 19 dB hole costs ~180.
      0.5 * (m.xoDipDb ?? 0) ** 2 +
      xoPenalty(m.xoHz) +
      slopePenalty(m)
    );
  };

  /** NM over `handles`, mutating a clone of `specs0`. Returns best specs. */
  const optimise = (
    specs0: VfSpecs,
    handles: ParamHandle[],
    inverted: boolean,
    iterations: number,
  ): { specs: VfSpecs; fx: number; converged: boolean } => {
    const objective = (x: readonly number[]): number => {
      const cand = clone(specs0);
      let penalty = 0;
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i];
        if (x[i] < h.lo) penalty += (h.lo - x[i]) ** 2;
        else if (x[i] > h.hi) penalty += (x[i] - h.hi) ** 2;
        h.set(cand, h.decode(Math.min(Math.max(x[i], h.lo), h.hi)));
      }
      return objValue(cand, inverted) + 12 * penalty;
    };
    const x0 = handles.map((h) => h.encode(h.get(specs0)));
    const fit = nelderMead(objective, x0, { maxIterations: iterations, tolerance: 1e-6, step: 0.05 });
    const specs = clone(specs0);
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      h.set(specs, h.decode(Math.min(Math.max(fit.x[i], h.lo), h.hi)));
    }
    return { specs, fx: objValue(specs, inverted), converged: fit.converged };
  };

  /* ---- Stage 1: structure (alignments × polarity), base knobs only ---- */

  const baseSpecs = (lp: StructChoice, hp: StructChoice): VfSpecs => ({
    woofer: {
      gainDb: 0,
      hp: { enabled: false, kind: 'LR', order: 2, freq: 200 },
      lp: {
        enabled: true,
        kind: lp.kind,
        order: lp.order,
        freq: clampXo(seed.woofer.lp.enabled ? seed.woofer.lp.freq : 2000),
      },
      eq: [],
    },
    tweeter: {
      gainDb:
        seed.tweeter.gainDb !== 0
          ? seed.tweeter.gainDb
          : Math.max(-24, Math.min(6, meanIn(wooferRaw, 500, 2000) - meanIn(tweeterRaw, 4000, 12000))),
      hp: {
        enabled: true,
        kind: hp.kind,
        order: hp.order,
        freq: clampHp(seed.tweeter.hp.enabled ? seed.tweeter.hp.freq : 2900),
      },
      lp: { enabled: false, kind: 'LR', order: 2, freq: 20000 },
      eq: [],
    },
  });

  interface State {
    specs: VfSpecs;
    fx: number;
    inverted: boolean;
    lp: StructChoice;
    hp: StructChoice;
    converged: boolean;
  }

  // The alignment library the free enumeration draws from: the two classic
  // even LR alignments, the classic 18 dB/oct Butterworth, and Bessel-4 as
  // the gentle-phase option.
  const AUTO_STRUCTS: StructChoice[] = [
    { kind: 'LR', order: 2 },
    { kind: 'LR', order: 4 },
    { kind: 'BW', order: 3 },
    { kind: 'BS', order: 4 },
  ];
  const runStructIters = (lp: StructChoice, hp: StructChoice, iterations: number): State => {
    let best: State | null = null;
    for (const inverted of [adjust.inverted, !adjust.inverted]) {
      const run = optimise(baseSpecs(lp, hp), baseHandles(hpFloor), inverted, iterations);
      if (!best || run.fx < best.fx) best = { ...run, inverted, lp, hp };
    }
    return best!;
  };
  const runStruct = (lp: StructChoice, hp: StructChoice): State => runStructIters(lp, hp, 220);

  // The user's preferred alignment is BINDING — rule 1 of the staged method:
  // the designer picks the foundation, the optimizer builds the best design
  // ON it (knees, level, polarity stay free; later stages escalate as
  // needed). Pre-EQ structure scores overstate alignment differences (the EQ
  // stages wash most of them out), so "override when better" would override
  // constantly for gaps that do not survive. Auto = free enumeration.
  let state: State;
  if (structurePreference) {
    state = runStruct(structurePreference, structurePreference);
  } else if (fixedStructure) {
    // Re-seed round: the structure is already decided (round 1's winner) —
    // skip the 4×4 enumeration and just refine it (polarity still free).
    state = runStruct(fixedStructure.lp, fixedStructure.hp);
  } else {
    // FULL enumeration over the alignment library — the exploration matters
    // more than the speed here (Sander: a wider scan gives a measurably better
    // filter). The earlier coarse pre-screen was reverted for that reason.
    let bestFree: State | null = null;
    for (const lp of AUTO_STRUCTS) {
      for (const hp of AUTO_STRUCTS) {
        const run = runStruct(lp, hp);
        if (!bestFree || run.fx < bestFree.fx) bestFree = run;
      }
    }
    state = bestFree!;
  }

  /* ---- Staged design: metrics gate + escalation report ---- */

  const fmtStruct = (c: StructChoice) => `${c.kind}${c.order}`;
  const stages: VfStage[] = [];
  const stageMetrics = (s: State): VfMetrics =>
    metricsOn(optW, optT, s.specs, s.inverted, optAngles);
  const pushStage = (label: string, s: State) => {
    const m = stageMetrics(s);
    stages.push({ label, rippleDb: m.responseRipplePeakDb, phaseDeg: m.avgPhaseErrDeg });
  };
  /** True when the staged targets are met — the signal to stop escalating. */
  const meetsTargets = (s: State): boolean => {
    if (!targets) return false;
    const m = stageMetrics(s);
    // Gate on the PEAK ±dB the user reads (the strip's unit), not the smooth
    // std-dev the objective minimizes.
    return m.responseRipplePeakDb <= targets.rippleDb && m.avgPhaseErrDeg <= targets.phaseDeg;
  };
  pushStage(`HP/LP ${fmtStruct(state.lp)}/${fmtStruct(state.hp)}`, state);

  /* ---- Stage 1b: adopt the user's enabled EQ bands (incl. shelves) ----
   * All bands are adopted first, but the budget is a HARD CAP on the total:
   * when there are more bands than budget, the optimizer itself decides which
   * ones go — repeatedly dropping the band whose removal hurts the objective
   * least — and then re-settles what remains together with the base knobs. */
  const bandsUsed = { woofer: 0, tweeter: 0 };
  // Staged: the structure alone already reached the goal — the user's bands
  // are not adopted; fewest components wins.
  if (!meetsTargets(state)) {
    const adopted = clone(state.specs);
    let any = false;
    for (const side of ['woofer', 'tweeter'] as const) {
      for (const b of seed[side].eq) {
        if (!b.enabled) continue;
        // Passive-honest: a boost band cannot be built; adopt it as flat and
        // let the pruning/greedy stages decide whether the slot earns cuts.
        adopted[side].eq.push({ ...b, gainDb: cutOnly ? Math.min(b.gainDb, 0) : b.gainDb });
        bandsUsed[side]++;
        any = true;
      }
    }

    // Prune to budget: cheapest-loss removal, one band at a time.
    for (const side of ['woofer', 'tweeter'] as const) {
      while (bandsUsed[side] > nEq) {
        let bestIdx = 0;
        let bestFx = Infinity;
        for (let i = 0; i < adopted[side].eq.length; i++) {
          const cand = clone(adopted);
          cand[side].eq.splice(i, 1);
          const fx = objValue(cand, state.inverted);
          if (fx < bestFx) {
            bestFx = fx;
            bestIdx = i;
          }
        }
        adopted[side].eq.splice(bestIdx, 1);
        bandsUsed[side]--;
      }
    }

    if (any) {
      const handles = [
        ...baseHandles(hpFloor),
        ...(['woofer', 'tweeter'] as const).flatMap((side) =>
          adopted[side].eq.map((_, i) => bandHandles(side, i, eqRanges, gainHi)).flat(),
        ),
      ];
      const run = optimise(adopted, handles, state.inverted, 400);
      state = { ...state, specs: run.specs, fx: run.fx };
      pushStage(`EQ adopted from seed (${bandsUsed.woofer + bandsUsed.tweeter})`, state);
    }
  }

  /* ---- Stage 2: greedy EQ bands ---- */

  /** Largest response deviation from the band mean — where a band should go —
   *  plus the BROAD tilt below/above that point (the signal that a shelf,
   *  not a peak, is the right tool). */
  const residualPeak = (
    cand: VfSpecs,
    inverted: boolean,
  ): { freq: number; devDb: number; meanBelowDb: number; meanAboveDb: number } => {
    const { wF, tF } = filtered(optW, optT, cand);
    const r = combine(wF, tF, { ...adjust, inverted });
    let sum = 0;
    let n = 0;
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i] < band[0] || r.freq[i] > band[1]) continue;
      sum += r.combinedSpl[i];
      n++;
    }
    const mean = sum / n;
    let bestI = 0;
    let bestAbs = -1;
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i] < band[0] || r.freq[i] > band[1]) continue;
      const dev = Math.abs(r.combinedSpl[i] - mean);
      if (dev > bestAbs) {
        bestAbs = dev;
        bestI = i;
      }
    }
    let below = 0;
    let nBelow = 0;
    let above = 0;
    let nAbove = 0;
    for (let i = 0; i < r.freq.length; i++) {
      if (r.freq[i] < band[0] || r.freq[i] > band[1]) continue;
      const dev = r.combinedSpl[i] - mean;
      if (i < bestI) {
        below += dev;
        nBelow++;
      } else if (i > bestI) {
        above += dev;
        nAbove++;
      }
    }
    return {
      freq: r.freq[bestI],
      devDb: r.combinedSpl[bestI] - mean,
      meanBelowDb: nBelow ? below / nBelow : 0,
      meanAboveDb: nAbove ? above / nAbove : 0,
    };
  };

  /** Frequency of the heaviest weighted phase error — an EQ band placed in
   *  the crossover region bends local phase, so this is a placement signal
   *  in its own right, invisible to the magnitude residual. */
  const phasePeak = (cand: VfSpecs, inverted: boolean): number | null => {
    const { wF, tF } = filtered(optW, optT, cand);
    const r = combine(wF, tF, { ...adjust, inverted });
    const integ = computeIntegration(r);
    let best: number | null = null;
    let bestVal = 0;
    for (const pt of integ.points) {
      if (pt.cls === null) continue;
      const v = pt.weight * pt.phaseErrorDeg;
      if (v > bestVal) {
        bestVal = v;
        best = pt.freq;
      }
    }
    return best;
  };

  /** Which driver dominates acoustically at f (gets the correction band). */
  const ownerAt = (cand: VfSpecs, f: number): Array<'woofer' | 'tweeter'> => {
    const { wF, tF } = filtered(optW, optT, cand);
    let i = 0;
    while (i < wF.freq.length - 1 && wF.freq[i] < f) i++;
    const diff = wF.spl[i] - tF.spl[i];
    // Clear owner first; the other driver still gets a shot if it is within
    // 15 dB (crossover region corrections can live on either side).
    if (diff > 15) return ['woofer'];
    if (diff < -15) return ['tweeter'];
    return diff >= 0 ? ['woofer', 'tweeter'] : ['tweeter', 'woofer'];
  };

  // Staged: EQ bands are the NEXT escalation step — only taken while the
  // ripple/phase targets are unmet.
  while ((bandsUsed.woofer < nEq || bandsUsed.tweeter < nEq) && !meetsTargets(state)) {
    const magPeak = residualPeak(state.specs, state.inverted);
    const phPeak = p > 0 ? phasePeak(state.specs, state.inverted) : null;

    // Candidate seeds: the magnitude residual peak (owner drivers first) and
    // the phase-error peak on both drivers — two different jobs a band can
    // do. At the magnitude peak, SHELVES compete with the peak: a broad tilt
    // wants a shelf, a local bump wants a peak — the objective decides.
    type BandType = 'peak' | 'lowShelf' | 'highShelf';
    const seeds: Array<{
      side: 'woofer' | 'tweeter';
      freq: number;
      gainDb: number;
      type: BandType;
    }> = [];
    const clampG = (v: number) => Math.min(Math.max(v, -12), cutOnly ? 0 : 4);
    for (const side of ownerAt(state.specs, magPeak.freq)) {
      seeds.push({ side, freq: magPeak.freq, gainDb: clampG(-magPeak.devDb), type: 'peak' });
      // Shelves only compete when the residual is a broad tilt, seeded with
      // exactly the tilt they should undo — targeted, so the greedy path
      // stays stable when the residual is local.
      if (Math.abs(magPeak.meanBelowDb) > 0.7) {
        seeds.push({ side, freq: magPeak.freq, gainDb: clampG(-magPeak.meanBelowDb), type: 'lowShelf' });
      }
      if (Math.abs(magPeak.meanAboveDb) > 0.7) {
        seeds.push({ side, freq: magPeak.freq, gainDb: clampG(-magPeak.meanAboveDb), type: 'highShelf' });
      }
    }
    if (phPeak !== null) {
      for (const side of ['woofer', 'tweeter'] as const) {
        seeds.push({ side, freq: phPeak, gainDb: -3, type: 'peak' });
      }
    }

    const candidates: Array<State & { side: 'woofer' | 'tweeter' }> = [];
    const tried = new Set<string>();
    for (const cand of seeds) {
      if (bandsUsed[cand.side] >= nEq) continue;
      const [fLo, fHi] = eqRanges[cand.side];
      const freq = Math.min(Math.max(cand.freq, fLo), fHi);
      const key = `${cand.side}:${cand.type}:${Math.round(freq)}`;
      if (tried.has(key)) continue;
      tried.add(key);

      const withBand = clone(state.specs);
      withBand[cand.side].eq.push({
        enabled: true,
        type: cand.type,
        freq,
        gainDb: cand.gainDb,
        q: cand.type === 'peak' ? 1.4 : 0.71,
      });
      // Optimise the new band TOGETHER with the base knobs (6 dims): a good
      // EQ often only pays off when the crossover shifts along with it.
      const run = optimise(
        withBand,
        [...bandHandles(cand.side, withBand[cand.side].eq.length - 1, eqRanges, gainHi), ...baseHandles(hpFloor)],
        state.inverted,
        350,
      );
      candidates.push({ ...state, specs: run.specs, fx: run.fx, side: cand.side });
    }

    const best = candidates.sort((a, b) => a.fx - b.fx)[0];
    // A band must EARN its place.
    if (!best || best.fx > state.fx * (1 - minBandImprovement)) break;
    bandsUsed[best.side]++;
    state = { ...state, specs: best.specs, fx: best.fx };
    const added = state.specs[best.side].eq[state.specs[best.side].eq.length - 1];
    pushStage(`EQ ${best.side} @${Math.round(added.freq)} Hz`, state);
  }

  /* ---- Stage 3: full polish over everything that survived ---- */

  const allHandles = [
    ...baseHandles(hpFloor),
    ...(['woofer', 'tweeter'] as const).flatMap((side) =>
      state.specs[side].eq.map((_, i) => bandHandles(side, i, eqRanges, gainHi)).flat(),
    ),
  ];
  const polishIters = opts.maxIterations ?? Math.max(600, 110 * allHandles.length);
  const polished = optimise(state.specs, allHandles, state.inverted, polishIters);
  if (polished.fx < state.fx) {
    state = { ...state, specs: polished.specs, fx: polished.fx, converged: polished.converged };
    pushStage('polish', state);
  }

  /* ---- Full-grid band audit ----
   * Bands are tuned on the decimated inner grid; with big budgets they can
   * overfit it — "improvements" the full grid (what the user sees, and what
   * the passive build must then reproduce) never receives. Any band whose
   * removal costs less than 0.5% on the FULL grid goes: fewer components,
   * honest gains only. */
  const fullObj = (cand: VfSpecs, inverted: boolean): number => {
    const m = metricsOn(wooferRaw, tweeterRaw, cand, inverted, angleData ?? null);
    const amp =
      dW > 0 && m.powerStdDb !== null
        ? (1 - dW) * m.responseStdDb ** 2 +
          dW * (m.powerStdDb ** 2 + (m.powerFoldDb != null ? powerFoldWeight * m.powerFoldDb ** 2 : 0))
        : m.responseStdDb ** 2;
    return (
      2 * (1 - pw) * amp +
      2 * pw * phaseTerm(m) +
      (breakupGuard ? 0.02 * (m.leakSqDb ?? 0) : 0) +
      // Dead-spot crossing (always on): meeting in a 19 dB hole costs ~180.
      0.5 * (m.xoDipDb ?? 0) ** 2 +
      xoPenalty(m.xoHz) +
      slopePenalty(m)
    );
  };
  {
    let cur = state.specs;
    let curF = fullObj(cur, state.inverted);
    let dropped = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (const side of ['woofer', 'tweeter'] as const) {
        for (let i = 0; i < cur[side].eq.length; i++) {
          const cand = clone(cur);
          cand[side].eq.splice(i, 1);
          const f = fullObj(cand, state.inverted);
          if (f <= curF * 1.005) {
            cur = cand;
            curF = f;
            dropped++;
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    if (dropped > 0) {
      state = { ...state, specs: cur, fx: objValue(cur, state.inverted) };
      bandsUsed.woofer = cur.woofer.eq.length;
      bandsUsed.tweeter = cur.tweeter.eq.length;
      pushStage(`full-grid audit (−${dropped} band${dropped > 1 ? 's' : ''})`, state);
    }
  }

  /* ---- Monotonicity guard: never end worse than the user's own design ----
   * (Possible when the seed structure lies outside the search space, e.g.
   * Butterworth alignments, or when a run lands in a poorer basin.) Only
   * applies when the seed RESPECTS the band budget — if the user just lowered
   * the budget, pruning wins over keeping the over-budget seed. */
  const seedBands = {
    woofer: seed.woofer.eq.filter((b) => b.enabled).length,
    tweeter: seed.tweeter.eq.filter((b) => b.enabled).length,
  };
  // A seed outside the allowed space (boost bands in passive-honest mode, or
  // an acoustic crossing outside the requested range) may score better, but
  // it is not an admissible answer.
  const seedXoOk = (): boolean => {
    if (!xo) return true;
    const m = metricsOn(optW, optT, seed, adjust.inverted, optAngles);
    return m.xoHz != null && m.xoHz >= xo[0] / 1.05 && m.xoHz <= xo[1] * 1.05;
  };
  const seedIsLegal =
    (!cutOnly ||
      (['woofer', 'tweeter'] as const).every((side) =>
        seed[side].eq.every((b) => !b.enabled || b.gainDb <= 0),
      )) &&
    seedXoOk() &&
    (!seed.tweeter.hp.enabled || hpFloor === null || seed.tweeter.hp.freq >= hpFloor);
  const seedFx = objValue(seed, adjust.inverted);
  // Staged: a result that MEETS the targets with fewer components beats a
  // seed that merely scores a lower objective — that is the whole point.
  const resultSuffices = !!targets && meetsTargets(state);
  if (
    seedFx <= state.fx &&
    seedIsLegal &&
    !resultSuffices &&
    seedBands.woofer <= nEq &&
    seedBands.tweeter <= nEq
  ) {
    const specsSeed = clone(seed);
    const m = metricsOn(wooferRaw, tweeterRaw, specsSeed, adjust.inverted, angleData ?? null);
    return {
      specs: specsSeed,
      inverted: adjust.inverted,
      structure: {
        wooferLpOrder: seed.woofer.lp.order,
        tweeterHpOrder: seed.tweeter.hp.order,
        wooferLpKind: seed.woofer.lp.kind,
        tweeterHpKind: seed.tweeter.hp.kind,
      },
      stages,
      before: m,
      after: m,
      converged: true,
      parameterCount: 0,
      bandsUsed: {
        woofer: seed.woofer.eq.filter((b) => b.enabled).length,
        tweeter: seed.tweeter.eq.filter((b) => b.enabled).length,
      },
      objective: seedFx,
      evaluations: evalCount,
    };
  }

  /* ---- Finish: prune + round to human-usable precision ---- */

  const specs = clone(state.specs);
  const r01 = (v: number) => Math.round(v * 10) / 10;
  for (const side of ['woofer', 'tweeter'] as const) {
    const s = specs[side];
    s.hp.freq = Math.round(s.hp.freq);
    s.lp.freq = Math.round(s.lp.freq);
    s.gainDb = r01(s.gainDb);
    s.eq = s.eq.filter((bandSpec) => Math.abs(bandSpec.gainDb) >= 0.5);
    for (const bandSpec of s.eq) {
      bandSpec.freq = Math.round(bandSpec.freq);
      bandSpec.gainDb = r01(bandSpec.gainDb);
      bandSpec.q = Math.round(bandSpec.q * 100) / 100;
    }
  }

  return {
    specs,
    inverted: state.inverted,
    structure: {
      wooferLpOrder: state.lp.order,
      tweeterHpOrder: state.hp.order,
      wooferLpKind: state.lp.kind,
      tweeterHpKind: state.hp.kind,
    },
    stages,
    before: metricsOn(wooferRaw, tweeterRaw, seed, adjust.inverted, angleData ?? null),
    after: metricsOn(wooferRaw, tweeterRaw, specs, state.inverted, angleData ?? null),
    converged: state.converged,
    parameterCount: allHandles.length,
    bandsUsed: {
      woofer: specs.woofer.eq.length,
      tweeter: specs.tweeter.eq.length,
    },
    objective: state.fx,
    evaluations: evalCount,
  };
}

/** The LP/HP alignment a result landed on, as a `fixedStructure` option — lets
 *  the re-seed rounds refine that structure without re-enumerating the library. */
export function structureOf(r: VfOptimizeResult): { lp: StructChoice; hp: StructChoice } {
  return {
    lp: { kind: r.structure.wooferLpKind, order: r.structure.wooferLpOrder },
    hp: { kind: r.structure.tweeterHpKind, order: r.structure.tweeterHpOrder },
  };
}

/** Blended panel yardstick at a priority — the SAME envelope + units the App
 *  reads (peak ±dB ripple and avg phase error). Used to rank multi-start
 *  candidates on ONE consistent scale, whatever priority each was tuned at. */
export function vfPriorityScore(
  m: { responseRipplePeakDb: number; avgPhaseErrDeg: number },
  phasePriority: number,
): number {
  const pw = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  return 2 * (1 - pw) * m.responseRipplePeakDb ** 2 + 2 * pw * (m.avgPhaseErrDeg / 15) ** 2;
}

export interface VfClusterResult {
  best: VfOptimizeResult;
  /** Objective evaluations summed over the cluster. */
  evaluations: number;
  /** Number of optimizer runs performed (cluster size after dedup). */
  runs: number;
}

/**
 * Priority-cluster multi-start: run the optimizer from one seed at a small
 * cluster of nearby priorities — the setpoint and its two ±5% neighbours —
 * and keep the candidate that scores best AT THE SETPOINT.
 *
 * Why: a 5% priority nudge demonstrably kicks the search into a DIFFERENT
 * (often better) basin — Sander's 50→55% flip found a strictly better design
 * (integration 99→100, phase P95 19°→9°) at the same everything-else. Ranking
 * every candidate on the same setpoint yardstick lets the optimizer find that
 * basin itself, instead of the user hunting for it 5% at a time. The extreme
 * ends of the slider are the envelope-softened, degenerate region, so a small
 * cluster around the setpoint — NOT the whole slider — is where the signal is.
 *
 * Pure SEEDING: the objective is untouched (the anchor lesson — objective
 * nudges destabilize; seeding does not). Deterministic. Extreme setpoints
 * clamp and dedup to a 2-run cluster.
 */
export function optimizeVfCluster(
  grid: readonly number[],
  wooferRaw: GriddedResponse,
  tweeterRaw: GriddedResponse,
  seed: VfSpecs,
  adjust: TweeterAdjust,
  opts: VfOptimizeOptions = {},
): VfClusterResult {
  const setpoint = Math.min(Math.max(opts.phasePriority ?? 0.5, 0), 1);
  const STEP = 0.05;
  const round2 = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100) / 100;
  const sp = round2(setpoint);
  // The two neighbours (setpoint ± one 5% step), clamped and deduped.
  const neighbours = [...new Set([sp - STEP, sp + STEP].map(round2))].filter((p) => p !== sp);
  let evaluations = 0;
  let runs = 0;
  const run = (s: VfSpecs, adj: TweeterAdjust, p: number, fixed?: { lp: StructChoice; hp: StructChoice }): VfOptimizeResult => {
    const r = optimizeVirtualFilters(grid, wooferRaw, tweeterRaw, s, adj, {
      ...opts,
      phasePriority: p,
      ...(fixed ? { fixedStructure: fixed } : {}),
    });
    evaluations += r.evaluations;
    runs++;
    return r;
  };
  // The setpoint run is the SAFE baseline: the returned design must never score
  // worse than it. Each neighbour runs its OWN FULL structure enumeration (the
  // structure-sharing shortcut was reverted — Sander: the wider scan gives a
  // measurably better filter, and letting a neighbour priority pick its own
  // alignment is part of that exploration).
  const spRun: VfOptimizeResult = run(seed, adjust, sp);
  let winner: VfOptimizeResult = spRun;
  let winnerP = sp;
  let winnerScore = vfPriorityScore(spRun.after, sp);
  for (const p of neighbours) {
    const r = run(seed, adjust, p);
    // Rank on the SETPOINT, not on the priority this candidate was tuned at.
    const s = vfPriorityScore(r.after, sp);
    if (s < winnerScore) {
      winner = r;
      winnerP = p;
      winnerScore = s;
    }
  }
  // Only SETPOINT-priority results are buildable (a neighbour is tuned for a
  // priority the user did not ask for). If a neighbour basin scored best,
  // re-settle it at the setpoint — a warm re-seed from the basin's optimum
  // stays in that basin (the flip only happens from a cold/default seed) —
  // then keep whichever of {setpoint run, re-settled} scores better. So the
  // result is always on the setpoint scale AND never worse than spRun.
  let best = spRun;
  if (winnerP !== sp) {
    // Re-settle IN the winning basin at the setpoint priority (structure fixed
    // — a warm re-seed stays in that basin), then keep whichever of {setpoint
    // run, re-settled} scores better. Result is always on the setpoint scale
    // AND never worse than the setpoint baseline.
    const settled = run({ ...winner.specs }, { ...adjust, inverted: winner.inverted }, sp, structureOf(winner));
    if (vfPriorityScore(settled.after, sp) <= vfPriorityScore(spRun.after, sp)) best = settled;
  }
  return { best, evaluations, runs };
}
