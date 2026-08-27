import { nelderMead } from './optimize.ts';
import {
  defaultHpLp,
  evalDriverFilter,
  isActive,
  type DriverFilterSpec,
  type EqBandSpec,
  type FilterKind,
} from './filters.ts';
import {
  applyTransfer,
  combine,
  combineN,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { computeIntegration } from './integration.ts';
import { bandStats } from './bandMetrics.ts';

/**
 * Three-way VIRTUAL design step — the structure searcher the 3-way chain was
 * missing (phase-4, after trede 4c).
 *
 * The staged v1 chain went straight from "textbook LR4 on both crossings,
 * polarity as loaded" into synthesis + the assembled tune. That leaves two
 * decisions to luck which the component tuner can NEVER repair, because it
 * only moves values on a FIXED topology and a FIXED polarity:
 *
 * ⚠ A CHOICE MAY NOT BE MADE ON A QUANTITY A LATER STAGE STILL CHANGES.
 *
 * Three times in one week the same defect, in three unrelated places:
 *
 *   Merger  the baffle step had to be applied BEFORE the gain fit, or the fit
 *           removes a difference that belongs there.
 *   Ranker  had to judge AFTER the shrink ladder and the snap, or it grades a
 *           network that does not exist.
 *   Knee    has to be chosen AFTER the EQ stage, or it is chosen on a score
 *           the EQ then washes out.
 *
 * MEASURED here, which is what turned it from a tidiness argument into a
 * defect. Without EQ the design step's mid-to-tweeter phase is 21.7 degrees;
 * with it, 5-9. Picking the knee on the pre-EQ number chose 1930 Hz (M-T 8.9,
 * fx 3.000) while 2100 Hz sat inside the same cage at M-T 6.1 and fx 2.703 —
 * better on the objective the step optimises AND 2.8 degrees better on phase.
 * The reference design this optimiser produced on 2026-08-20 crosses at
 * 2101 Hz.
 *
 * So where a stage can be reordered, it is. Where it cannot — the EQ stage is
 * greedy and discrete, the knee refine is continuous — the choice is REVISED
 * after the later stage has run, and the revision repeats until it stops
 * paying. See the revision loop after stage 3.
 *
 *   - ALIGNMENT per crossing (LR2 / LR4 / BW3 / Bessel4). The two-way lesson
 *     that "EQ washes out alignment differences" does not transfer: the 3-way
 *     chain has no EQ stage, so the alignment IS the design.
 *   - POLARITY of the mid and the tweeter. A wrong one is a deep suckout at
 *     the crossing, and no value tune climbs out of it.
 *
 * Both are settled here, CHEAPLY: pure filter math on the measured responses
 * (evalDriverFilter × applyTransfer × combineN), no MNA solve anywhere. The
 * full enumeration costs a fraction of a single network tune, which is why it
 * can afford to be exhaustive where the chain above it must be selective.
 *
 * What this step deliberately does NOT do: EQ bands. Those are a synthesis
 * tool (the acoustic-mode doctrine — EQ is gereedschap, not target), and the
 * per-branch synthesis already carries the measurement-gated corrections.
 */

export interface Struct3Choice {
  kind: FilterKind;
  order: 1 | 2 | 3 | 4;
}

export interface Design3Specs {
  woofer: DriverFilterSpec;
  mid: DriverFilterSpec;
  tweeter: DriverFilterSpec;
}

export interface Design3Input {
  /** Banded branch responses (silent ghost outside each measurement range). */
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  tAdjust: TweeterAdjust;
  midAdjust: BranchAdjust;
  /** Candidate handover points (Hz) — the starting point; the refine may move
   *  them inside their pin (or freely when unpinned). */
  xoLow: number;
  xoHigh: number;
  band: [number, number];
  phasePriority: number;
  /** Knee window per crossing (Hz) — the candidate's own cage from the scan.
   *  The refine may move the knee inside it, never out. Omit for a free ±20%
   *  neighbourhood around the candidate. */
  xoLowWindow?: [number, number];
  xoHighWindow?: [number, number];
  /** Binding alignment choice per crossing; omit for free enumeration. */
  structureLow?: Struct3Choice;
  structureHigh?: Struct3Choice;
  /** Greedy CUT-ONLY EQ budget PER BRANCH (0/absent = off — the staged-v1
   *  behaviour, bit-compatible). This is the stage that separates the 3-way
   *  chain from 2-way parity: without it nothing in the chain can touch an
   *  in-band bump of a branch or a broad tilt of the sum. */
  eqBandsPerBranch?: number;
  /** Tweeter HP floor (≥2×Fs, Hz) — the high knee never goes below it. */
  hpFloorHz?: number;
  /** Breakup guard (stopband leakage ≥20 dB down beside each crossing),
   *  default ON — matching the app-wide default. See the leak term below for
   *  why the DESIGN step must carry it. */
  breakupGuard?: boolean;
  /** DIRECTIVITY anchors (Hz) per handover — where the lower driver's DI meets
   *  the upper's (directivity.diMatchHz), from measured angle sets. When
   *  present, the structure search pays wDI·log2(xo/anchor)² per axis: in the
   *  literature directivity match is the FIRST crossover criterion, not an
   *  afterthought of the tuner. Absent (no angle data / no match) → term off
   *  and the search is on-axis, exactly as before. */
  diAnchorHz?: { low?: number | null; high?: number | null };
  /** Weight of the DI-distance term. Default 0.3. */
  diWeight?: number;
}

export interface Design3Result {
  specs: Design3Specs;
  midInverted: boolean;
  tweeterInverted: boolean;
  alignLow: Struct3Choice;
  alignHigh: Struct3Choice;
  xoLow: number;
  xoHigh: number;
  fx: number;
  /** Per-pair uniform mean phase error (deg) of the winner: [low, high]. */
  pairPhaseDeg: [number, number];
  /** Octaves between each delivered knee and its DI anchor [low, high]
   *  (null = no anchor) — the trade the designer should see. */
  diDistanceOct: [number | null, number | null];
  /** Human-readable structure summary for the chain note. */
  label: string;
  /** How many structures were evaluated (honest reporting). */
  evaluated: number;
}

/** A branch is alive where its banded response is above the silent ghost. */
const ALIVE_DB = -300;

/** The alignment library — same four as the two-way enumeration: the two
 *  classic even LR alignments, 18 dB/oct Butterworth, and Bessel-4 as the
 *  gentle-phase option.
 *
 *  EXPORTED SINCE F4d, and only exported: not a line of it changed. The v2
 *  candidate generator has to know which orders can actually be built before it
 *  proposes one, and a second list of alignments in engine2 would be a second
 *  opinion about what this step enumerates. */
export const AUTO_STRUCTS: Struct3Choice[] = [
  { kind: 'LR', order: 2 },
  { kind: 'LR', order: 4 },
  { kind: 'BW', order: 3 },
  { kind: 'BS', order: 4 },
];

const structLabel = (s: Struct3Choice): string =>
  `${s.kind}${s.order}`;

/** Median SPL of a branch over [lo,hi] ∩ its alive region; null when empty. */
function branchMedian(g: GriddedResponse, lo: number, hi: number): number | null {
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

/**
 * Enumerate alignment × polarity for both crossings, refine the base knobs of
 * the best few, and return the winning target design.
 */
export function designThreeWay(input: Design3Input): Design3Result {
  const { w, m, t, tAdjust, midAdjust, band, hpFloorHz } = input;
  // Priority envelope — the same 0.1 + 0.8p the other engines use, so the
  // slider means the same thing everywhere.
  const pw = 0.1 + 0.8 * Math.min(Math.max(input.phasePriority, 0), 1);

  const hpLp = (s: Struct3Choice, freq: number) => ({
    enabled: true,
    kind: s.kind,
    order: s.order,
    freq,
  });

  /** Level trims from the branch medians in each branch's OWN passband —
   *  every branch trims DOWN to the quietest one (passive is cut-only). */
  const trimsFor = (xoLow: number, xoHigh: number): [number, number, number] => {
    const med = [
      branchMedian(w, band[0], xoLow),
      branchMedian(m, xoLow, xoHigh),
      branchMedian(t, xoHigh, band[1]),
    ];
    const present = med.filter((v): v is number => v !== null);
    const floor = present.length > 0 ? Math.min(...present) : 0;
    return med.map((own) =>
      own === null ? 0 : Math.min(0, Math.round((floor - own) * 10) / 10),
    ) as [number, number, number];
  };

  const specsFor = (
    alignLow: Struct3Choice,
    alignHigh: Struct3Choice,
    xoLow: number,
    xoHigh: number,
    trims: [number, number, number],
  ): Design3Specs => ({
    woofer: {
      gainDb: trims[0],
      hp: defaultHpLp(200),
      lp: hpLp(alignLow, xoLow),
      eq: [],
    },
    mid: {
      gainDb: trims[1],
      hp: hpLp(alignLow, xoLow),
      lp: hpLp(alignHigh, xoHigh),
      eq: [],
    },
    tweeter: {
      gainDb: trims[2],
      hp: hpLp(alignHigh, xoHigh),
      lp: defaultHpLp(20000),
      eq: [],
    },
  });

  let evaluated = 0;

  /** Filtered branches + the three-way sum, then the two PAIR scores. */
  const wDI = Math.max(0, input.diWeight ?? 0.3);
  const diLow = input.diAnchorHz?.low ?? null;
  const diHigh = input.diAnchorHz?.high ?? null;
  const diDist = (specs: Design3Specs): [number | null, number | null] => [
    diLow && diLow > 0 ? Math.log2(specs.mid.hp.freq / diLow) : null,
    diHigh && diHigh > 0 ? Math.log2(specs.mid.lp.freq / diHigh) : null,
  ];
  const evaluate = (
    specs: Design3Specs,
    midInverted: boolean,
    tweeterInverted: boolean,
  ): { fx: number; pairPhaseDeg: [number, number]; diDistanceOct: [number | null, number | null] } => {
    evaluated++;
    const apply = (g: GriddedResponse, spec: DriverFilterSpec): GriddedResponse =>
      isActive(spec) ? applyTransfer(g, evalDriverFilter(spec, g.freq)) : g;
    const wF = apply(w, specs.woofer);
    const mF = apply(m, specs.mid);
    const tF = apply(t, specs.tweeter);

    const midAdj: BranchAdjust = { ...midAdjust, inverted: midInverted };
    const tweetAdj: BranchAdjust = { ...tAdjust, inverted: tweeterInverted };
    let sum;
    try {
      sum = combineN([
        { response: wF },
        { response: mF, adjust: midAdj },
        { response: tF, adjust: tweetAdj },
      ]);
    } catch {
      return { fx: 1e9, pairPhaseDeg: [180, 180], diDistanceOct: diDist(specs) };
    }

    /* Amplitude: whole-range flatness of the three-way sum, PEAK-AWARE.
     *
     * Plain std is what a listener does not hear. Measured on Sander's set:
     * the delivered sum spans 104.6 to 111.3 dB, and raising the EQ budget
     * from 2 bands to 4 changed the winning design by literally nothing —
     * byte-identical numbers — because a second band could not buy the 1% the
     * greedy asks for. Cutting a 3 dB lift barely moves a standard deviation,
     * so a band that fixes exactly what you hear cannot earn its components.
     *
     * The companion term is the solo engine's, at the same weight (see
     * netOptimizer's solo branch): std² + 0.35·(worst positive excursion vs
     * the median)². Positive only, and against the MEDIAN, on purpose — a dip
     * is the honest floor of a cut-only design and must not read as an error
     * the optimizer then "fixes" by pulling everything else down. */
    const stats = bandStats(sum.freq, sum.combinedSpl, band);
    const amp = stats.count > 0 ? stats.std ** 2 + 0.35 * stats.peakExcess ** 2 : 1e6;

    // Phase: per ADJACENT pair, on the branches AS SUMMED (adjust applied), so
    // the pair score sees exactly what the sum sees.
    const zero = { offsetMm: 0, trimDb: 0, inverted: false };
    /** Uniform mean + P95 over the pair's overlap window — the SAME definition
     *  the phase panel shows and the two-way objective uses ('band' metric).
     *  Sharing one definition of "phase error" across every engine and gate is
     *  the lesson bandMetrics.ts was extracted for. */
    const pairPhase = (
      lo: GriddedResponse,
      hi: GriddedResponse,
    ): { avg: number; p95: number; xoHz: number | null } => {
      const r = combine(lo, hi, zero);
      const integ = computeIntegration(r);
      let sumErr = 0;
      let n = 0;
      const buckets = new Array<number>(181).fill(0);
      for (const pt of integ.points) {
        if (pt.cls === null) continue;
        sumErr += pt.phaseErrorDeg;
        n++;
        buckets[Math.min(180, Math.round(pt.phaseErrorDeg))]++;
      }
      // No overlap at all = the branches never meet: a real defect, priced as
      // a full 180° miss rather than silently scoring zero.
      if (n === 0) return { avg: 180, p95: 180, xoHz: integ.overlapCentreHz };
      const need = Math.ceil(0.95 * n);
      let acc = 0;
      let p95 = 180;
      for (let d = 0; d <= 180; d++) {
        acc += buckets[d];
        if (acc >= need) {
          p95 = d;
          break;
        }
      }
      return { avg: sumErr / n, p95, xoHz: integ.overlapCentreHz };
    };
    const low = pairPhase(sum.branches[0], sum.branches[1]);
    const high = pairPhase(sum.branches[1], sum.branches[2]);

    /* Breakup-guard LEAK term — the netOptimizer definition at the 2-way
     * DESIGN weight (0.02·leakSq, see vfOptimizer's objective). HARD LEARNED
     * (branch dissection on Robbert's set): without it the design step picks
     * structures the guard makes UNSATISFIABLE — it chose BW3 @1620 for a
     * tweeter that sits only ~17 dB under the sum at 1 kHz where the guard
     * demands 20, so the tuner "solved" the conflict by rebuilding the branch
     * (−5.4 dB @2k designed → −29.5 delivered) and driving the crossing from
     * 1620 to 3954 Hz. A fundamental the tuner enforces must be visible to the
     * stage that picks the structure, or the two fight and the tuner wins. */
    const leakOf = (
      lower: GriddedResponse,
      upper: GriddedResponse,
      xoHz: number | null,
    ): number => {
      if (xoHz === null) return 0;
      let acc = 0;
      let n = 0;
      for (let i = 0; i < sum.freq.length; i++) {
        const f = sum.freq[i];
        let margin: number | null = null;
        if (f >= xoHz * 1.6 && f <= xoHz * 4) margin = sum.combinedSpl[i] - lower.spl[i];
        else if (f >= xoHz / 4 && f <= xoHz / 1.6) margin = sum.combinedSpl[i] - upper.spl[i];
        if (margin !== null) {
          const d = Math.max(0, 20 - margin);
          acc += d * d;
          n++;
        }
      }
      return n ? acc / n : 0;
    };
    const leakSq =
      input.breakupGuard === false
        ? 0
        : leakOf(sum.branches[0], sum.branches[1], low.xoHz) +
          leakOf(sum.branches[1], sum.branches[2], high.xoHz);

    // The OBJECTIVE averages the pairs (smooth for the simplex — the anchor
    // lesson: never make the search path jagged). The coupled-pairs WORST-pair
    // rule belongs on decision gates, and the chain's ranking applies it.
    const avg = (low.avg + high.avg) / 2;
    const p95 = (low.p95 + high.p95) / 2;
    const phaseTerm = (avg / 15) ** 2 + 0.5 * (p95 / 45) ** 2;
    // Directivity distance (rule 9 of the window spec, moved INTO the
    // structure search): wDI · log2(knee / DI anchor)² per axis with an anchor.
    const dd = diDist(specs);
    const diTerm = wDI * ((dd[0] ?? 0) ** 2 + (dd[1] ?? 0) ** 2);
    return {
      fx: 2 * (1 - pw) * amp + 2 * pw * phaseTerm + 0.02 * leakSq + diTerm,
      pairPhaseDeg: [low.avg, high.avg],
      diDistanceOct: dd,
    };
  };

  // ---- Stage 1: full enumeration at the candidate knees -------------------
  // alignment(low) × alignment(high) × mid polarity × tweeter polarity.
  // Pure filter math, so all 64 cost a fraction of one network tune.
  const lows = input.structureLow ? [input.structureLow] : AUTO_STRUCTS;
  const highs = input.structureHigh ? [input.structureHigh] : AUTO_STRUCTS;
  const baseTrims = trimsFor(input.xoLow, input.xoHigh);

  interface Cand {
    alignLow: Struct3Choice;
    alignHigh: Struct3Choice;
    midInverted: boolean;
    tweeterInverted: boolean;
    fx: number;
  }
  const cands: Cand[] = [];
  for (const alignLow of lows) {
    for (const alignHigh of highs) {
      const specs = specsFor(alignLow, alignHigh, input.xoLow, input.xoHigh, baseTrims);
      for (const midInverted of [false, true]) {
        for (const tweeterInverted of [false, true]) {
          const { fx } = evaluate(specs, midInverted, tweeterInverted);
          cands.push({ alignLow, alignHigh, midInverted, tweeterInverted, fx });
        }
      }
    }
  }
  cands.sort((a, b) => a.fx - b.fx);

  // ---- Stage 2: refine the base knobs of the best few --------------------
  // Knees stay inside their pin (or a sane free window); the trims follow the
  // knees, because moving a crossing moves each branch's own passband.
  const kneeWindow = (
    centre: number,
    win: [number, number] | undefined,
    lo: number,
    hi: number,
  ): [number, number] => {
    // The scan's cage, clamped to sane territory. Falling back to ±20% around
    // the candidate keeps a direct caller (or a test) sensible: wide enough to
    // refine, tight enough that neighbouring scan steps stay distinct.
    const [a, b] = win ?? [centre / 1.2, centre * 1.2];
    const w0 = Math.max(lo, Math.min(a, b));
    const w1 = Math.min(hi, Math.max(a, b));
    return w1 > w0 ? [w0, w1] : [Math.max(lo, centre / 1.05), Math.min(hi, centre * 1.05)];
  };
  // Rails follow the UI's own pin limits (low 2000, high 12000): a designer
  // pin at 9 kHz must not be pulled back by a tighter internal guess — the
  // scan's cage (win) is the real constraint, the rails only catch nonsense.
  const lowWin = kneeWindow(input.xoLow, input.xoLowWindow, 150, 2000);
  const highWin = kneeWindow(
    input.xoHigh,
    input.xoHighWindow,
    Math.max(1000, hpFloorHz ?? 0),
    12000,
  );

  /**
   * Refine the two knees for one structure, with any EQ already designed kept
   * in place so the objective sees the sum the design actually has.
   *
   * `carry` supplies those bands. In stage 2 there are none and this is the
   * original pre-EQ refine, bit for bit; in stage 4 it is what makes the knee
   * a post-EQ choice. The bands travel at their own frequencies while the knee
   * moves — they are re-derived straight afterwards, so what matters is that
   * the objective is no longer blind to them.
   */
  const refineKnees = (
    alignLow: Struct3Choice,
    alignHigh: Struct3Choice,
    midInverted: boolean,
    tweeterInverted: boolean,
    carry?: Design3Specs,
  ): Design3Result | null => {
    const withCarry = (sp: Design3Specs): Design3Specs =>
      carry
        ? {
            woofer: { ...sp.woofer, eq: carry.woofer.eq.map((e) => ({ ...e })) },
            mid: { ...sp.mid, eq: carry.mid.eq.map((e) => ({ ...e })) },
            tweeter: { ...sp.tweeter, eq: carry.tweeter.eq.map((e) => ({ ...e })) },
          }
        : sp;
    const objective = (x: readonly number[]): number => {
      let penalty = 0;
      const clampLog = (v: number, win: [number, number]): number => {
        const lo = Math.log10(win[0]);
        const hi = Math.log10(win[1]);
        if (v < lo) penalty += (lo - v) ** 2;
        else if (v > hi) penalty += (v - hi) ** 2;
        return 10 ** Math.min(Math.max(v, lo), hi);
      };
      let xoLow = clampLog(x[0], lowWin);
      let xoHigh = clampLog(x[1], highWin);
      if (xoHigh < xoLow * 2) {
        penalty += (Math.log10(xoLow * 2) - Math.log10(xoHigh)) ** 2;
        xoHigh = xoLow * 2;
      }
      const sp = withCarry(specsFor(alignLow, alignHigh, xoLow, xoHigh, trimsFor(xoLow, xoHigh)));
      return evaluate(sp, midInverted, tweeterInverted).fx + 12 * penalty;
    };
    /* MULTI-START ACROSS THE CAGE, because the knee landscape is multimodal
     * and a local simplex cannot see past a hump.
     *
     * Measured on Sanders set with the EQ in place: fx runs 3.00 at 1930 Hz,
     * 3.78 at 2000, 2.57 at 2100. The candidate is seeded at 1930 and the
     * better basin at 2100 sits behind that ridge, so refining alone — even
     * with the stage order fixed — still returned 1930. Same reason the
     * synthesis fits from five scattered starts and the component tuner runs
     * multi-start: nothing here promises a convex landscape.
     *
     * Deterministic seeds: the candidate's own point plus the ends and the
     * geometric middle of the high window, which is the axis with the room to
     * be wrong on. Stage 2 is pure filter maths — no MNA solve — so four
     * starts cost little. */
    const seedLow = carry ? (best?.xoLow ?? input.xoLow) : input.xoLow;
    const seedHigh = carry ? (best?.xoHigh ?? input.xoHigh) : input.xoHigh;
    const highSeeds = [
      seedHigh,
      highWin[0] * 1.02,
      Math.sqrt(highWin[0] * highWin[1]),
      highWin[1] * 0.98,
    ].filter((v, i, a2) => v > 0 && a2.findIndex((u) => Math.abs(Math.log2(u / v)) < 0.02) === i);
    let fit: { x: number[]; fx: number } | null = null;
    for (const hs of highSeeds) {
      const f2 = nelderMead(objective, [Math.log10(seedLow), Math.log10(hs)], {
        maxIterations: 260,
        tolerance: 1e-6,
        step: 0.04,
      });
      if (!fit || f2.fx < fit.fx) fit = { x: [...f2.x], fx: f2.fx };
    }
    if (!fit) return null;
    const clamp = (v: number, win: [number, number]): number =>
      Math.min(Math.max(10 ** v, win[0]), win[1]);
    const xoLow = clamp(fit.x[0], lowWin);
    const xoHigh = Math.max(clamp(fit.x[1], highWin), xoLow * 2);
    const specs = withCarry(
      specsFor(alignLow, alignHigh, xoLow, xoHigh, trimsFor(xoLow, xoHigh)),
    );
    const scored = evaluate(specs, midInverted, tweeterInverted);
    return {
      specs,
      midInverted,
      tweeterInverted,
      alignLow,
      alignHigh,
      xoLow: Math.round(xoLow),
      xoHigh: Math.round(xoHigh),
      fx: scored.fx,
      pairPhaseDeg: scored.pairPhaseDeg,
      diDistanceOct: scored.diDistanceOct,
      label:
        `${structLabel(alignLow)} @${Math.round(xoLow)} · ` +
        `${structLabel(alignHigh)} @${Math.round(xoHigh)}` +
        `${midInverted ? ' · mid inv' : ''}${tweeterInverted ? ' · tweeter inv' : ''}`,
      evaluated: 0,
    };
  };

  let best: Design3Result | null = null;
  for (const c of cands.slice(0, 4)) {
    // ONE knee refine, used here without EQ and again in stage 4 with it —
    // the same function, so the two cannot drift into different objectives.
    const r = refineKnees(c.alignLow, c.alignHigh, c.midInverted, c.tweeterInverted);
    if (r && (!best || r.fx < best.fx)) best = r;
  }

  /* ---- Stage 3: greedy CUT-ONLY EQ per branch (2-way parity) -------------
   * Structure and knees are settled; what remains is what no downstream
   * stage can repair: an IN-BAND bump of one branch (the mid's 2–5 kHz
   * wobble) or a broad tilt of the sum (hot top). Mirror the proven 2-way
   * recipe, simplified: each round seeds a peak CUT at the sum's worst
   * positive excursion — attributed to the branch DOMINANT there — plus
   * tilt-gated shelf candidates; each candidate is NM-refined against the
   * full objective (amp + pair phase + leak) and kept only on a ≥1% gain.
   * Cut-only throughout (passive doctrine): gains clamp to ≤0, dips are the
   * honest floor. Budget is per branch, from the same "EQ bands/driver"
   * setting the 2-way uses. ---- */
  const eqBudget = Math.max(0, Math.floor(input.eqBandsPerBranch ?? 0));
  const runEqStage = () => {
  if (eqBudget > 0 && best) {
    const clone = (s: Design3Specs): Design3Specs => ({
      woofer: { ...s.woofer, eq: s.woofer.eq.map((b) => ({ ...b })) },
      mid: { ...s.mid, eq: s.mid.eq.map((b) => ({ ...b })) },
      tweeter: { ...s.tweeter, eq: s.tweeter.eq.map((b) => ({ ...b })) },
    });
    const mi = best.midInverted;
    const ti = best.tweeterInverted;
    /** Sum + per-branch filtered SPL, for candidate seeding only. */
    const sumInfo = (specs: Design3Specs) => {
      const apply = (g: GriddedResponse, spec: DriverFilterSpec): GriddedResponse =>
        isActive(spec) ? applyTransfer(g, evalDriverFilter(spec, g.freq)) : g;
      const wF = apply(w, specs.woofer);
      const mF = apply(m, specs.mid);
      const tF = apply(t, specs.tweeter);
      const sum = combineN([
        { response: wF },
        { response: mF, adjust: { ...midAdjust, inverted: mi } },
        { response: tF, adjust: { ...tAdjust, inverted: ti } },
      ]);
      return { sum, branches: [wF.spl, mF.spl, tF.spl] as const };
    };
    const keys = ['woofer', 'mid', 'tweeter'] as const;
    let specs = clone(best.specs);
    let fx = best.fx;
    let pairNow: readonly [number, number] = best.pairPhaseDeg;
    let placed = 0;
    for (let round = 0; round < eqBudget * 3; round++) {
      const info = sumInfo(specs);
      const stats = bandStats(info.sum.freq, info.sum.combinedSpl, band, 'median');
      if (stats.count === 0) break;
      interface Cand {
        branch: (typeof keys)[number];
        band: EqBandSpec;
        shelf: boolean;
      }
      const cands: Cand[] = [];
      // Worst POSITIVE excursion → peak cut on the dominant branch there.
      let pkIdx = -1;
      let pkExc = 1; // ≥1 dB before a band is worth a component
      for (let i = 0; i < info.sum.freq.length; i++) {
        const f = info.sum.freq[i];
        if (f < band[0] || f > band[1]) continue;
        const exc = info.sum.combinedSpl[i] - stats.median;
        if (exc > pkExc) {
          pkExc = exc;
          pkIdx = i;
        }
      }
      if (pkIdx >= 0) {
        let dom = 0;
        for (let k = 1; k < 3; k++) {
          if (info.branches[k][pkIdx] > info.branches[dom][pkIdx]) dom = k;
        }
        if (specs[keys[dom]].eq.filter((b) => b.enabled).length < eqBudget) {
          cands.push({
            branch: keys[dom],
            band: {
              enabled: true,
              type: 'peak',
              freq: info.sum.freq[pkIdx],
              gainDb: -Math.min(12, pkExc),
              q: 2,
            },
            shelf: false,
          });
        }
      }
      // Broad tilt → shelf cut on the hot side (tilt-gated, like 2-way).
      const centre = Math.sqrt(band[0] * band[1]);
      let loSum = 0;
      let loN = 0;
      let hiSum = 0;
      let hiN = 0;
      for (let i = 0; i < info.sum.freq.length; i++) {
        const f = info.sum.freq[i];
        if (f < band[0] || f > band[1]) continue;
        const d = info.sum.combinedSpl[i] - stats.median;
        if (f < centre) {
          loSum += d;
          loN++;
        } else {
          hiSum += d;
          hiN++;
        }
      }
      const tilt = hiN > 0 && loN > 0 ? hiSum / hiN - loSum / loN : 0;
      if (tilt > 1) {
        for (const b of ['mid', 'tweeter'] as const) {
          if (specs[b].eq.filter((x) => x.enabled).length >= eqBudget) continue;
          cands.push({
            branch: b,
            band: {
              enabled: true,
              type: 'highShelf',
              freq: centre * 1.5,
              gainDb: -Math.min(8, tilt),
              q: 0.71,
            },
            shelf: true,
          });
        }
      } else if (tilt < -1) {
        if (specs.woofer.eq.filter((x) => x.enabled).length < eqBudget) {
          cands.push({
            branch: 'woofer',
            band: {
              enabled: true,
              type: 'lowShelf',
              freq: centre / 1.5,
              gainDb: -Math.min(8, -tilt),
              q: 0.71,
            },
            shelf: true,
          });
        }
      }
      if (cands.length === 0) break;
      // Refine each candidate jointly (freq/gain[/Q]); keep the best if it
      // buys ≥1% — a band must earn its physical components.
      let bestCand: { specs: Design3Specs; fx: number; pair: [number, number] } | null = null;
      for (const c of cands) {
        const trial = clone(specs);
        trial[c.branch].eq = [...trial[c.branch].eq, { ...c.band }];
        const bandRef = trial[c.branch].eq[trial[c.branch].eq.length - 1];
        const objective = (x: readonly number[]): number => {
          let penalty = 0;
          const f0 = Math.exp(x[0]);
          const fLo = c.band.freq / 1.6;
          const fHi = c.band.freq * 1.6;
          bandRef.freq = Math.min(Math.max(f0, fLo), fHi);
          if (f0 < fLo || f0 > fHi) penalty += 1;
          // CUT-ONLY: the gain axis is clamped at 0 from above.
          bandRef.gainDb = Math.min(0, Math.max(-15, x[1]));
          if (!c.shelf) {
            // Q floor 0.7 (solo lesson: below it a "peak cut" is broadband
            // attenuation in disguise).
            bandRef.q = Math.min(8, Math.max(0.7, Math.exp(x[2])));
          }
          return evaluate(trial, mi, ti).fx + penalty;
        };
        const x0 = c.shelf
          ? [Math.log(c.band.freq), c.band.gainDb]
          : [Math.log(c.band.freq), c.band.gainDb, Math.log(c.band.q)];
        const fit = nelderMead(objective, x0, {
          maxIterations: 140,
          tolerance: 1e-6,
          step: 0.12,
        });
        objective(fit.x); // write the winning params back into bandRef
        const scored = evaluate(trial, mi, ti);
        /* A BAND MAY NOT BE BOUGHT WITH PHASE.
         *
         * The acceptance gate below is on fx, which BLENDS flatness and phase,
         * so a band that flattens more than it costs in phase is accepted —
         * and measured on Sanders set that is exactly what happens once the
         * budget grows: fx improves from 3.066 to 2.415 while the worst pair
         * goes from 5.3 to 12.9 degrees. A user who types a larger number gets
         * a worse filter and a better score, which is the worst combination a
         * tool can have.
         *
         * So the budget stops being a target and becomes a cap: bands are
         * added while BOTH measures hold, and the stage stops on its own when
         * the next one would cost phase. The tolerance is 0.25 deg — enough
         * that numerical wobble does not end the loop, far below anything
         * audible or actionable.
         *
         * This also answers "what is the right default budget": there isn't
         * one. Measured, the turning point is 4 bands on his three-way and the
         * greedy stops by itself at 1 on the KOAN pair, so a constant would be
         * wrong on one of them. An outcome-driven stop needs no such number. */
        const worstNow = Math.max(pairNow[0], pairNow[1]);
        const worstNew = Math.max(scored.pairPhaseDeg[0], scored.pairPhaseDeg[1]);
        if (worstNew > worstNow + 0.25) continue;
        if (!bestCand || scored.fx < bestCand.fx) {
          bestCand = { specs: trial, fx: scored.fx, pair: scored.pairPhaseDeg };
        }
      }
      if (!bestCand || bestCand.fx > fx * 0.99) break;
      pairNow = bestCand.pair;
      specs = bestCand.specs;
      fx = bestCand.fx;
      placed++;
      best = {
        ...best,
        specs,
        fx,
        pairPhaseDeg: bestCand.pair,
        diDistanceOct: diDist(specs),
        label: `${best.label.replace(/ · \d+ EQ$/, '')} · ${placed} EQ`,
      };
    }
  }

  };
  /** Run the EQ stage on a given design and hand back the result, leaving the
   *  outer `best` where it was. The stage itself reads and writes `best`, so
   *  it is borrowed rather than rewritten — a smaller change than turning a
   *  greedy 150-line block inside out, and contained to these five lines. */
  const placeEq = (seed: Design3Result): Design3Result => {
    const save = best;
    best = seed;
    runEqStage();
    const out = best!;
    best = save;
    return out;
  };
  runEqStage();

  /* ---- Stage 4: REVISE the knee now that the EQ exists --------------------
   *
   * The knee was refined in stage 2 against a sum with no EQ in it, and the EQ
   * stage then changes that sum by a factor of four in phase error. A choice
   * made on the earlier number is a choice made on a quantity that no longer
   * describes the design — the principle at the top of this file.
   *
   * The ideal is to refine the knee INSIDE the EQ stage, so it is chosen on
   * the post-EQ objective directly. That is not available here: the EQ stage
   * is greedy and discrete (bands are placed one at a time, each kept on a
   * ≥1 % gain), while the knee refine is a continuous simplex, and there is no
   * single objective both can descend. So the choice is REVISED instead —
   * refine the knee with the EQ in place, re-derive the EQ at the new knee,
   * and repeat while it keeps paying.
   *
   * Bounded at three rounds and gated on a ≥0.5 % gain, and it keeps the best
   * point seen rather than the last: a greedy re-derivation is not guaranteed
   * to be monotone, and a loop that can oscillate must not be able to end on
   * the down-swing. */
  if (eqBudget > 0 && best) {
    /* THE KNEE IS RE-CHOSEN WITH THE EQ RE-DERIVED AT EACH TRIAL, and that
     * detail is the whole fix.
     *
     * Carrying the bands designed at the old knee to a new one is not the same
     * measurement: those bands were placed against a different sum. Measured —
     * carrying them, 2100 Hz scores no better than 1930 and the refine stays
     * put; re-deriving them there, 2100 scores 2.57 against 3.00 and is 2.8
     * degrees better in M-T phase. So each trial knee gets its own EQ pass.
     *
     * A handful of discrete trials rather than a continuous search, because
     * the EQ stage is greedy: there is no gradient to follow through it. The
     * trials span the cage, which is where the alternative basins were
     * measured to be, and the incumbent is always among them so this can only
     * improve on what stage 2 chose. Pure filter maths throughout — no MNA
     * solve — so the cost is a few hundred evaluations, not a scan. */
    const incumbent: Design3Result = best;
    const [hLo, hHi] = highWin;
    const trials = [
      incumbent.xoHigh,
      hLo * 1.02,
      Math.sqrt(hLo * Math.sqrt(hLo * hHi)),
      Math.sqrt(hLo * hHi),
      Math.sqrt(hHi * Math.sqrt(hLo * hHi)),
      hHi * 0.98,
    ].filter(
      (v, i, a2) =>
        v >= hLo &&
        v <= hHi &&
        a2.findIndex((u) => Math.abs(Math.log2(u / v)) < 0.03) === i,
    );
    for (const hz of trials) {
      if (Math.abs(Math.log2(hz / incumbent.xoHigh)) < 0.03) continue;
      const trims = trimsFor(incumbent.xoLow, hz);
      const trialSpecs = specsFor(incumbent.alignLow, incumbent.alignHigh, incumbent.xoLow, hz, trims);
      /* SCORE THE SEED AS ITSELF. Carrying the incumbent's post-EQ fx onto a
       * no-EQ design makes the EQ stage's own acceptance gate meaningless — it
       * asks each band to beat a number this design never had, so nothing is
       * ever placed and every trial comes back identical. Measured exactly
       * that way before the fix: four different knees, one fx, to three
       * decimals. The same disease as everything else this week — a figure
       * describing something other than what it is attached to. */
      const trialScore = evaluate(trialSpecs, incumbent.midInverted, incumbent.tweeterInverted);
      const seed: Design3Result = {
        ...incumbent,
        specs: trialSpecs,
        fx: trialScore.fx,
        pairPhaseDeg: trialScore.pairPhaseDeg,
        diDistanceOct: trialScore.diDistanceOct,
        xoHigh: Math.round(hz),
        label:
          `${structLabel(incumbent.alignLow)} @${incumbent.xoLow} · ` +
          `${structLabel(incumbent.alignHigh)} @${Math.round(hz)}` +
          `${incumbent.midInverted ? ' · mid inv' : ''}` +
          `${incumbent.tweeterInverted ? ' · tweeter inv' : ''}`,
      };
      const withEq = placeEq(seed);
      /* THE SAME RULE AS INSIDE THE EQ STAGE, and this is where it actually
       * bites. Guarding only the band acceptance changed nothing: measured,
       * the phase degradation at larger budgets does not come from a band
       * being accepted, it comes from THIS loop choosing a different knee on
       * fx. At budget 5 the winner moves and the worst pair goes 5.3 -> 12.9
       * degrees while fx improves 3.066 -> 2.415.
       *
       * A knee is not worth taking if it costs phase, however flat it sums —
       * the same statement the band gate makes, one stage up. */
      const worstHere = Math.max(best.pairPhaseDeg[0], best.pairPhaseDeg[1]);
      const worstTrial = Math.max(withEq.pairPhaseDeg[0], withEq.pairPhaseDeg[1]);
      if (withEq.fx < best.fx && worstTrial <= worstHere + 0.25) best = withEq;
    }
    /* NO CONTINUOUS POLISH AFTERWARDS, and that is deliberate — it was tried
     * and it made things worse in exactly the way this whole stage exists to
     * prevent. A refine that CARRIES the winning EQ while moving the knee is
     * scoring a design against bands placed for a different one: measured, it
     * walked from 2095 Hz (fx 2.93, M-T 5.2°) to 2358 Hz (fx 2.66, M-T 13.0°)
     * — an apparent gain of 0.27 bought with 8 degrees of phase, on a number
     * that did not describe the design it was attached to.
     *
     * The discrete trials already span the cage and each is scored with its
     * own EQ, so there is nothing left for a polish to find that is real. */
  }

  // Enumeration always produces at least one candidate (the libraries are
  // non-empty), so `best` cannot be null here.
  return { ...best!, evaluated };
}
