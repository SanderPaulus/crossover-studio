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
  /** Human-readable structure summary for the chain note. */
  label: string;
  /** How many structures were evaluated (honest reporting). */
  evaluated: number;
}

/** A branch is alive where its banded response is above the silent ghost. */
const ALIVE_DB = -300;

/** The alignment library — same four as the two-way enumeration: the two
 *  classic even LR alignments, 18 dB/oct Butterworth, and Bessel-4 as the
 *  gentle-phase option. */
const AUTO_STRUCTS: Struct3Choice[] = [
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
  const evaluate = (
    specs: Design3Specs,
    midInverted: boolean,
    tweeterInverted: boolean,
  ): { fx: number; pairPhaseDeg: [number, number] } => {
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
      return { fx: 1e9, pairPhaseDeg: [180, 180] };
    }

    // Amplitude: whole-range flatness of the three-way sum over the band.
    const stats = bandStats(sum.freq, sum.combinedSpl, band);
    const amp = stats.count > 0 ? stats.std ** 2 : 1e6;

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
    return {
      fx: 2 * (1 - pw) * amp + 2 * pw * phaseTerm + 0.02 * leakSq,
      pairPhaseDeg: [low.avg, high.avg],
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

  let best: Design3Result | null = null;
  for (const c of cands.slice(0, 4)) {
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
      // A three-way needs real branch bands: keep the crossings apart.
      if (xoHigh < xoLow * 2) {
        penalty += (Math.log10(xoLow * 2) - Math.log10(xoHigh)) ** 2;
        xoHigh = xoLow * 2;
      }
      const specs = specsFor(c.alignLow, c.alignHigh, xoLow, xoHigh, trimsFor(xoLow, xoHigh));
      return (
        evaluate(specs, c.midInverted, c.tweeterInverted).fx + 12 * penalty
      );
    };
    const x0 = [Math.log10(input.xoLow), Math.log10(input.xoHigh)];
    const fit = nelderMead(objective, x0, { maxIterations: 260, tolerance: 1e-6, step: 0.04 });
    // Read the refined point back through the same clamps the objective used.
    const clamp = (v: number, win: [number, number]): number =>
      Math.min(Math.max(10 ** v, win[0]), win[1]);
    const xoLow = clamp(fit.x[0], lowWin);
    const xoHigh = Math.max(clamp(fit.x[1], highWin), xoLow * 2);
    const trims = trimsFor(xoLow, xoHigh);
    const specs = specsFor(c.alignLow, c.alignHigh, xoLow, xoHigh, trims);
    const scored = evaluate(specs, c.midInverted, c.tweeterInverted);
    if (!best || scored.fx < best.fx) {
      best = {
        specs,
        midInverted: c.midInverted,
        tweeterInverted: c.tweeterInverted,
        alignLow: c.alignLow,
        alignHigh: c.alignHigh,
        xoLow: Math.round(xoLow),
        xoHigh: Math.round(xoHigh),
        fx: scored.fx,
        pairPhaseDeg: scored.pairPhaseDeg,
        label:
          `${structLabel(c.alignLow)} @${Math.round(xoLow)} · ` +
          `${structLabel(c.alignHigh)} @${Math.round(xoHigh)}` +
          `${c.midInverted ? ' · mid inv' : ''}${c.tweeterInverted ? ' · tweeter inv' : ''}`,
        evaluated: 0,
      };
    }
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
        if (!bestCand || scored.fx < bestCand.fx) {
          bestCand = { specs: trial, fx: scored.fx, pair: scored.pairPhaseDeg };
        }
      }
      if (!bestCand || bestCand.fx > fx * 0.99) break;
      specs = bestCand.specs;
      fx = bestCand.fx;
      placed++;
      best = {
        ...best,
        specs,
        fx,
        pairPhaseDeg: bestCand.pair,
        label: `${best.label.replace(/ · \d+ EQ$/, '')} · ${placed} EQ`,
      };
    }
  }

  // Enumeration always produces at least one candidate (the libraries are
  // non-empty), so `best` cannot be null here.
  return { ...best!, evaluated };
}
