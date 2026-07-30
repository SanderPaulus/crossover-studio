import { nelderMead } from './optimize.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork, type NetElement, type PassiveElement } from './network.ts';
import { applyTransfer, combine, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { computeIntegration } from './integration.ts';
import type { Complex } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import {
  allSeries,
  hasImportedCatalog,
  nearestParts,
  pickCandidates,
  seriesValueRange,
  type CatalogPick,
  type SnapPrefs,
} from './catalog.ts';
import type { AngleResponse } from './directivity.ts';

/**
 * Passive-in-the-loop component optimizer: re-fit the VALUES of a schematic's
 * R/L/C parts directly against the measured combined response — the judge is
 * the real network on the real impedances, not a virtual intermediate.
 * Parts marked `locked` keep their value ("this 15 µF is on my shelf");
 * everything else may move. DCR/ESR params ride along unchanged.
 *
 * STAGED MODE (`staged`, trapmethode on the assembled network):
 *  - targets MET after value tuning → PRUNE: greedily try removing parts
 *    (series part → shorted, shunt part → open; both variants are tried and
 *    the objective rejects the nonsensical one), re-tune the remaining
 *    values, keep the removal while the targets stay met AND the removal is
 *    (nearly) free — ≤10% objective per removal, ≤35% cumulative. Quality
 *    inside the target box is NOT loose change for component count.
 *  - targets NOT met → ESCALATE (rule 3): candidate bypass capacitors across
 *    series resistors (the passive "lift the top octave around the pad"
 *    move); a candidate must reach the targets or pay ≥3% objective
 *    improvement to stay.
 */

export interface NetOptimizeOptions {
  /** 0..1 share of the budget on phase (same scale as everywhere). Default 0.5. */
  phasePriority?: number;
  /** Evaluation band, Hz. Default full grid minus edges. */
  band?: [number, number];
  maxIterations?: number;
  /** Per-driver angle responses (same grid) — enables the directivity-aware
   *  terms, exactly like the design optimizer. */
  angleData?: { woofer: AngleResponse[]; tweeter: AngleResponse[] };
  /** 0..1: share of the amplitude budget on the energy average. Default 0. */
  directivityWeight?: number;
  /** Which curve the amplitude term flattens. Default 'onAxis'. */
  ampTarget?: 'onAxis' | 'listeningWindow';
  /** Penalize stopband leakage beside the crossing (< 20 dB margin) — the
   *  breakup guard, same definition as the design optimizer. Default false. */
  breakupGuard?: boolean;
  /** Staged (trapmethode) structure moves — see the module doc. Omit for the
   *  classic values-only behaviour. */
  staged?: { rippleDb: number; phaseDeg: number };
  /** Pin the ACOUSTIC crossover (where the filtered drivers cross, Hz) —
   *  same constraint as the design optimizer, so the component tuner cannot
   *  drift the handover away from where the designer put it. */
  xoRange?: [number, number];
  /** Phase metric: 'band' (default) = the panel's uniform avg over the
   *  overlap window + P95 excursion term; 'overlap' = classic weighted mean.
   *  Must match the design optimizer's setting. */
  phaseMetric?: 'band' | 'overlap';
  /** Coarse stage callback (value tune, prune, snap, …) for live progress.
   *  NOT structured-cloneable — callers across a worker boundary inject it
   *  on the worker side, never in the posted payload. */
  onStage?: (label: string) => void;
  /** Snap the TUNED network to purchasable catalog values as the final step
   *  (discrete coordinate descent with real DCR/ESR, stacks allowed, budget
   *  pressure via costWeight). Without this the tuner un-snaps whatever the
   *  synthesis snapped — Sanders BOM stayed full of "no exact catalog value"
   *  with Snap to catalog on. */
  catalogSnap?: boolean;
  /** Budget pressure for the snap: score ×(1 + costWeight·ΣEUR). Default 0.0015. */
  costWeight?: number;
  /** Component-wizard preferences: binding series per kind, tier profile per
   *  position. Position = on the source→driver bus (BFS over the netlist,
   *  never through ground) vs hanging off it (shunt/notch chains). */
  snapPrefs?: SnapPrefs;
  /** Target ACOUSTIC slopes beside the crossing (dB/oct) — same steering as
   *  the design optimizer, so the tuner keeps the achieved orders. */
  acousticSlopes?: { mid?: number; tweeter?: number };
  /** SINGLE-DRIVER mode ("0 driver pairs"): the network drives ONE measured
   *  driver and the other slot carries a silent ghost. Every crossing-anchored
   *  term (xo pin/penalty, valley, breakup guard, tweeter protection, acoustic
   *  slopes) is a property of ADJACENT DRIVER PAIRS — with zero pairs they are
   *  all skipped, and the phase metric (relative phase between drivers) is
   *  reported as 0 and carries no objective weight. What remains is the honest
   *  solo objective: whole-range flatness of the branch + the pair-independent
   *  fundamentals (amp-load floor, series-path realism, buildability), plus
   *  the full toolbox (staged prune/escalation, shrink ladder, drift catch,
   *  catalog snap). Directivity terms are disabled for now (they pair angle
   *  sets across both drivers). NB: this flag must NOT change the two-driver
   *  path in any way — regression-tested bit-identical. The planned 3-way
   *  generalisation is the same idea with TWO pairs, not another special case. */
  solo?: boolean;
  /** Solo sensitivity budget (dB, default 6): how far below the raw driver's
   *  own median level the network may land. A DESIGNER'S CHOICE, not a
   *  constant — measured on Robbert's 12W8524 used fullrange, Sanders' manual
   *  filter spends ~10 dB pulling 200 Hz–8 kHz down toward the collapsed top
   *  and scores far better over the whole range (avg 1.7 vs 2.9 dB) than a
   *  6 dB-capped run. Efficiency versus whole-range flatness is his call. */
  soloSensitivityDb?: number;
  /** FULL-measurement-band safety data (grid independent of the evaluation
   *  band). The tuner's quality metrics deliberately follow the user's view
   *  range, but that means a zoomed-in band silently hides whole-design
   *  degeneration: with the crossing outside the evaluated band every
   *  crossing-anchored fundamental reads 0 and the tuner can starve a branch
   *  (Sanders 0.68 µF dead tweeter) or drag the crossing to the band edge
   *  with the tweeter wide open (measured: 376 µF cap, crossing at 891 Hz).
   *  When provided, the final result must not degrade the FUNDAMENTALS on
   *  this band versus the seed — otherwise the seed is returned unchanged
   *  with a `safetyNote`. */
  safety?: {
    freqs: readonly number[];
    w: GriddedResponse;
    t: GriddedResponse;
    z: Record<string, readonly Complex[]>;
  };
}

export interface NetOptimizeResult {
  /** The schematic parts with re-fitted values (locked ones untouched). */
  parts: VxpPart[];
  before: { rippleDb: number; avgDevDb?: number; phaseDeg: number };
  /** Full-grid metrics of the delivered network; `xoHz` = its acoustic
   *  crossing (used by the no-pin scan to derive follow-up candidates). */
  after: { rippleDb: number; avgDevDb?: number; phaseDeg: number; xoHz?: number | null };
  /** How many component values were free to move (final network). */
  tuned: number;
  evaluations: number;
  /** Staged mode: partIds pruned away (series ones live on as a wire). */
  removed: string[];
  /** Staged mode: partIds of bypass capacitors added (rule 3). */
  added: string[];
  /** Catalog snap: singles-vs-stacks comparison ("bewust stapelen"). */
  snapNote?: string;
  /** Amp-load floor (system |Z| ≥ 2.5 Ω): set when the tuned result dipped
   *  below the floor — either "lifted a → b Ω" (repair accepted) or a
   *  could-not-repair warning. See Z_FLOOR_OHM. */
  ampFloorNote?: string;
  /** Set when the full-band safety gate rejected the tuned result and the
   *  seed was returned unchanged (see NetOptimizeOptions.safety). */
  safetyNote?: string;
  /** Value-window (boundToSeries) report: which series-path slots were bound
   *  to a series' range, and what the constraint cost vs an unconstrained fit. */
  valueWindowNote?: string;
}

export class NetOptimizeError extends Error {}

const PARAM_OF: Record<'R' | 'L' | 'C', { name: string; factor: number }> = {
  R: { name: 'R', factor: 1 },
  L: { name: 'L', factor: 1e3 }, // schematic params store mH
  C: { name: 'C', factor: 1e6 }, // … and µF
};

/** FUNDAMENTAL — amplifier-load floor (Sanders, jul 2026): the system input
 *  impedance should not dip below this. Voltage drive makes a low-Z
 *  realisation INVISIBLE to every response metric (the sim holds the voltage,
 *  only the amplifier feels the current), so a shunt trap/Zobel with a small
 *  R near the input can quietly buy response quality with an amp-hostile dip.
 *  Enforcement is DECISION-LEVEL ONLY (structure gates, safety gate, and a
 *  locally-seeded repair retune before the snap) — an always-on fx penalty
 *  was tried and REVERTED: on the notch-torture net the term cost a mere
 *  0.065 at the relevant optimum (system min 2.93 Ω) yet rerouted the
 *  deterministic simplex into a basin 6 dB worse in ripple (8.0 → 14.5 dB).
 *  The textbook-anchor lesson, again: ANY objective add-on perturbs the
 *  search path through a multimodal landscape, however small its value.
 *
 *  The VALUE is 2.5, not the requested 3.0 — measured: a textbook 2nd-order
 *  LP on the KOAN mid (itself 3.66 Ω) necessarily dips to ~2.7 Ω at the
 *  knee, so a 3.0 floor flags every correct filter on a 4 Ω-class driver as
 *  degenerate (and the repair rightly refuses to "fix" physics). The real
 *  degenerate case measured 1.5 Ω; 2.5 — the classic "4 Ω-capable amp"
 *  tolerance — separates the two cleanly. The Impedance panel's stricter
 *  IEC tiers (3.2/6.4 Ω) keep informing the designer either way. */
const Z_FLOOR_OHM = 2.5;

/** Soft buildability bounds, as in synthesis. */
const BOUNDS: Record<'C' | 'L' | 'R', [number, number]> = {
  C: [0.33e-6, 100e-6],
  L: [0.05e-3, 15e-3],
  R: [0.22, 47],
};

/** Realism CEILING for SERIES-PATH elements (both nodes on the source→driver
 *  bus). The absolute BOUNDS only say "such a component exists" — but a
 *  91 µF series capacitor into a tweeter is a wire with extra steps (0.87 Ω
 *  at 2 kHz) and only exists as an elco; the tuner parked values in the
 *  corners of the buildability box (91 µF next to the 100 µF cap — Sanders
 *  schema). Series-path parts are the signal path: film-cap territory, sane
 *  ladder impedances. Deliberately UPPER-side only: the small/starved
 *  direction is governed by the dead-branch fundamentals (valley crossing,
 *  protection, safety gate) — a low floor here would fight the starving
 *  equilibrium those guards own (hard learned: it made prune bait
 *  load-bearing in the padless test net). Shunt parts (traps, Zobels)
 *  legitimately use big elcos and keep the wide bounds. */
const SERIES_CEIL: Record<'C' | 'L' | 'R', number> = {
  C: 33e-6,
  L: 8e-3,
  R: 47,
};

/** Reset big-side reactive OUTLIERS (> tol × textbook magnitude) to exactly
 *  textbook; returns null when nothing exceeds. Only the big side: oversized
 *  caps/coils are the arbitrary-basin signature, small values are legitimate
 *  (hot-tweeter series cap, trap elements). Locked/open/shorted parts and
 *  resistors are never touched. Exported for tests. */
export function reseedOutliers(
  parts: readonly VxpPart[],
  textbook: { L: number; C: number },
  tol = 2.2,
): VxpPart[] | null {
  let hits = 0;
  const out = parts.map((q) => {
    if (q.locked || q.open || q.shorted) return q;
    const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : null;
    if (!kind) return q;
    const u = PARAM_OF[kind];
    const par = q.params.find((p) => p.name === u.name);
    if (!par || !(par.value > 0)) return q;
    const si = par.value / u.factor;
    if (si <= textbook[kind] * tol) return q;
    hits++;
    return {
      ...q,
      params: q.params.map((p) =>
        p.name === u.name
          ? { ...p, value: Number((textbook[kind] * u.factor).toPrecision(4)) }
          : { ...p },
      ),
      wires: q.wires.map((w) => ({ ...w })),
    };
  });
  return hits > 0 ? out : null;
}

/** Bus-path position per element: BOTH nodes on a source→driver path =
 *  series-path, anything else hangs toward ground (shunt). Shared by the
 *  discrete snap (tier doctrine) and the tuner's series-path realism ceiling. */
export function busPositions(parts: readonly VxpPart[]): (partId: string) => 'series' | 'shunt' {
  const busNodes = new Set<number>();
  const elNodes = new Map<string, [number, number]>();
  try {
    const { netlist } = crossoverToNetlist({ name: 'pos', parts: [...parts] });
    const els = netlist.elements;
    for (const e of els) elNodes.set(e.id, [e.nodes[0], e.nodes[1]]);
    const src = els.find((e) => e.kind === 'source');
    if (src) {
      const hot = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];
      const adj = new Map<number, Array<{ id: string; a: number; b: number }>>();
      for (const e of els) {
        if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
        for (const n of e.nodes) {
          const l = adj.get(n) ?? [];
          l.push({ id: e.id, a: e.nodes[0], b: e.nodes[1] });
          adj.set(n, l);
        }
      }
      for (const drv of els.filter((e) => e.kind === 'driver')) {
        const target = drv.nodes[0] === 0 ? drv.nodes[1] : drv.nodes[0];
        const prev = new Map<number, number>();
        const seen = new Set([hot]);
        const q: number[] = [hot];
        while (q.length > 0) {
          const n = q.shift()!;
          if (n === target) break;
          for (const g of adj.get(n) ?? []) {
            const m = g.a === n ? g.b : g.a;
            if (m === 0 || seen.has(m)) continue;
            seen.add(m);
            prev.set(m, n);
            q.push(m);
          }
        }
        if (seen.has(target)) {
          let cur2 = target;
          busNodes.add(target);
          while (cur2 !== hot) {
            const p2 = prev.get(cur2);
            if (p2 === undefined) break;
            busNodes.add(p2);
            cur2 = p2;
          }
        }
      }
    }
  } catch {
    // Position stays unknown → every part is treated as shunt (wide bounds).
  }
  return (partId) => {
    const nodes = elNodes.get(partId);
    if (!nodes) return 'shunt';
    return busNodes.has(nodes[0]) && busNodes.has(nodes[1]) ? 'series' : 'shunt';
  };
}

export function optimizeNetworkValues(
  parts: readonly VxpPart[],
  grid: readonly number[],
  wBase: GriddedResponse,
  tBase: GriddedResponse,
  driverZ: Record<string, readonly Complex[]>,
  adjust: TweeterAdjust,
  opts: NetOptimizeOptions = {},
): NetOptimizeResult {
  const {
    phasePriority = 0.5,
    maxIterations,
    ampTarget = 'onAxis',
    breakupGuard = false,
    phaseMetric = 'band',
    onStage,
  } = opts;
  const solo = opts.solo === true;
  // Solo: directivity terms pair angle sets across BOTH drivers — with one
  // driver the pairing is empty and the power average degenerates to NaN.
  const angleData = solo ? undefined : opts.angleData;
  /** SOLO sensitivity budget (dB): how far the tuned network's median level
   *  may sit below the RAW driver. Same fundamental as the design engine —
   *  and needed here for the same reason: the flatness objective is
   *  LEVEL-BLIND, so "attenuate everything" scores as well as "fix the peak"
   *  (Sanders' run: −15 dB below 10 kHz, and the tuner had no reason to
   *  undo it). Decision-level only: a gate on the delivered result, never a
   *  term in the search objective (the anchor lesson). */
  const soloSensBudgetDb = Math.max(0, opts.soloSensitivityDb ?? 6);
  /** Effective cap for the solo wall/gate: the budget, or the level the SEED
   *  already spends when that is more (baffle-step compensation legitimately
   *  costs 6–10 dB). Set once the seed metrics exist; until then no wall. */
  let soloLossCap = Infinity;
  const acSlopes =
    opts.acousticSlopes && (opts.acousticSlopes.mid || opts.acousticSlopes.tweeter)
      ? opts.acousticSlopes
      : null;
  // Anchored envelope (see vfOptimizer): both terms always exist — a 0%
  // amplitude weight lets the tuner wreck the response the "never worse"
  // guard is supposed to protect, judged by its own degenerate objective.
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const dW = angleData ? Math.min(Math.max(opts.directivityWeight ?? 0, 0), 1) : 0;
  const useLw = ampTarget === 'listeningWindow' && !!angleData;
  const band: [number, number] = opts.band ?? [grid[0] * 1.02, grid[grid.length - 1] * 0.975];

  // Decimated evaluation grid (inner loop); full grid for reported metrics.
  const step = Math.max(1, Math.floor(grid.length / 150));
  const idx: number[] = [];
  for (let i = 0; i < grid.length; i += step) idx.push(i);
  const pick = (g: GriddedResponse): GriddedResponse => ({
    freq: idx.map((i) => g.freq[i]),
    spl: idx.map((i) => g.spl[i]),
    phaseDeg: idx.map((i) => g.phaseDeg[i]),
  });
  const optW = pick(wBase);
  const optT = pick(tBase);
  const optZ = Object.fromEntries(
    Object.entries(driverZ).map(([m, z]) => [m, idx.map((i) => z[i])]),
  );
  const pickAngles = (set: AngleResponse[]): AngleResponse[] =>
    set.map((a) => ({ hor: a.hor, response: pick(a.response) }));
  const optAngles = angleData
    ? { woofer: pickAngles(angleData.woofer), tweeter: pickAngles(angleData.tweeter) }
    : null;

  const bandStd = (freq: readonly number[], spl: readonly number[]): number => {
    let s = 0;
    let sq = 0;
    let n = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      s += spl[i];
      sq += spl[i] * spl[i];
      n++;
    }
    const mean = s / n;
    return Math.sqrt(Math.max(0, sq / n - mean * mean));
  };

  /** Mean |deviation| vs the band mean — the whole-range verdict number the
   *  chain ranking judges on (Sanders doctrine, jul 2026: one narrow dip must
   *  not decide the winner). Reported alongside the peak; never fed to the
   *  search objective (the anchor lesson — the objective keeps bandStd). */
  const bandAvgDev = (freq: readonly number[], spl: readonly number[]): number => {
    let s = 0;
    let n = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      s += spl[i];
      n++;
    }
    if (n === 0) return 0;
    const mean = s / n;
    let acc = 0;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      acc += Math.abs(spl[i] - mean);
    }
    return acc / n;
  };

  /** Median level over the band — reference for the SOLO sensitivity budget. */
  const medianOf = (freq: readonly number[], spl: readonly number[]): number => {
    const vals: number[] = [];
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] >= band[0] && freq[i] <= band[1]) vals.push(spl[i]);
    }
    if (vals.length === 0) return 0;
    vals.sort((a, b) => a - b);
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  };

  /** SOLO: the RAW driver's median level (no network) — the reference the
   *  sensitivity budget is measured against. The silent ghost sits at −400 dB,
   *  so the per-point max IS the real driver. */
  const rawMedianRef = solo
    ? medianOf(grid, wBase.spl.map((v, i) => Math.max(v, tBase.spl[i])))
    : 0;

  /** Peak flatness = ±(max−min)/2 over the band — the SAME number the SPL
   *  strip reads (combinedRippleDb), the unit staged TARGETS gate on and
   *  before/after report. The search objective keeps the smooth std-dev
   *  (bandStd); a peak/max objective would be non-smooth and outlier-driven. */
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

  let evaluations = 0;
  const metricsOn = (
    net: { nodeCount: number; elements: NetElement[] },
    freqs: readonly number[],
    w: GriddedResponse,
    t: GriddedResponse,
    z: Record<string, readonly Complex[]>,
    angles: { woofer: AngleResponse[]; tweeter: AngleResponse[] } | null,
  ): {
    /** Std-dev flatness — the smooth term the SEARCH objective minimizes. */
    rippleDb: number;
    /** Peak ±dB over the band — what the strip reads, targets gate on and
     *  before/after report. Never fed to the search objective. */
    ripplePeakDb: number;
    /** Mean |deviation| of the on-axis combined vs the band mean — the
     *  whole-range verdict for the chain ranking. Report-only. */
    avgDevDb: number;
    phaseDeg: number;
    phaseP95Deg: number;
    powerStdDb: number | null;
    leakSqDb: number;
    protSqDb: number;
    /** Acoustic crossing of the filtered drivers (Hz), null if none. */
    xoHz: number | null;
    /** How far the combined SPL at the crossing sits BELOW the band mean
     *  (dB, beyond a 6 dB allowance). A healthy crossing meets ON level; a
     *  starved branch "crosses" the other one deep in a hole instead. */
    xoDipDb: number;
    midSlopeDbOct: number | null;
    tweeterSlopeDbOct: number | null;
    /** Minimum system |Zin| over the band (amplifier load). */
    zMinOhm: number;
    /** How far that minimum sits BELOW the amp-load floor (0 when healthy). */
    zShortOhm: number;
    /** MEDIAN combined level over the band — the reference for the SOLO
     *  sensitivity budget. Median so a deep narrow notch doesn't read as lost
     *  sensitivity while broad attenuation does. */
    medianDb: number;
  } => {
    const sol = solveNetwork(net, freqs, z);
    const hFor = (model: string) => {
      const d = sol.drivers.find((x) => x.model === model);
      return d ? sol.transfers[d.id] : null;
    };
    const hW = hFor('mid');
    const hT = hFor('tweeter');
    const wF = hW ? applyTransfer(w, hW) : w;
    const tF = hT ? applyTransfer(t, hT) : t;
    const r = combine(wF, tF, adjust);
    const integ = computeIntegration(r);
    // Both phase metrics (see vfOptimizer): weighted classic and the panel's
    // uniform avg + bucket-P95 over the overlap window.
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

    // Directivity terms — the same transfers at every measured angle, exactly
    // like the design optimizer judges.
    let powerStdDb: number | null = null;
    let lwStd: number | null = null;
    if (angles) {
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
        const spl = combine(aw, at, adjust).combinedSpl;
        for (let i = 0; i < n; i++) powerAcc[i] += 10 ** (spl[i] / 10);
        if (hor <= 30) {
          for (let i = 0; i < n; i++) lwAcc[i] += 10 ** (spl[i] / 10);
          lwCount++;
        }
      }
      powerStdDb = bandStd(r.freq, powerAcc.map((v) => 10 * Math.log10(v / shared.length)));
      if (lwCount > 0) {
        lwStd = bandStd(r.freq, lwAcc.map((v) => 10 * Math.log10(v / lwCount)));
      }
    }

    const targetStd = useLw && lwStd !== null ? lwStd : bandStd(r.freq, r.combinedSpl);

    // Where the filtered drivers meet — anchor for the guard and protection.
    let xi = -1;
    for (let i = 1; i < r.freq.length; i++) {
      if (wF.spl[i] - tF.spl[i] <= 0) {
        xi = i;
        break;
      }
    }
    const xoF = xi > 0 ? r.freq[xi] : null;

    // FUNDAMENTAL — the crossing must not sit in a VALLEY. A starved branch
    // still "crosses" the other one, but deep in a hole between the mid's
    // rolloff and the tweeter's late entry (Sanders 0.68 µF cap: crossing at
    // 6.7 kHz with the mid ~25 dB down, and every crossing-anchored guard
    // looked exactly there and saw nothing wrong). A valley has HIGHER
    // combined level on BOTH sides of the crossing; a mere level STEP (hot
    // unpadded tweeter) is higher on one side only and is already priced by
    // ripple — a global reference (band mean/P90) cannot tell the two apart
    // and walls off the tuner's own escape path (hard learned in this
    // guard's first two cuts). 6 dB is free room (BW3 crossings, driver
    // ripple); beyond that the crossing is a dead spot.
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
    if (acSlopes && xoF !== null) {
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
      if (acSlopes.mid) midSlopeDbOct = fitSlope(wF.spl, xoF * 1.15, xoF * 2.2);
      if (acSlopes.tweeter) tweeterSlopeDbOct = fitSlope(tF.spl, xoF / 2.2, xoF / 1.15);
    }

    // Breakup guard — same definition as the design optimizer.
    let leakSqDb = 0;
    if (breakupGuard && xoF !== null) {
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

    // FUNDAMENTAL — amplifier-load floor: min |Zin| below Z_FLOOR_OHM is a
    // silent failure (voltage drive hides it from every response metric).
    let zMinOhm = Infinity;
    for (const c of sol.inputZ) {
      const zm = Math.hypot(c.re, c.im);
      if (zm < zMinOhm) zMinOhm = zm;
    }
    const zShortOhm = Math.max(0, Z_FLOOR_OHM - zMinOhm);

    // FUNDAMENTAL — tweeter protection (always on): electrical drive at and
    // below crossing/3 stays ≤ −15 dB, whatever the shape metric prefers.
    let protSqDb = 0;
    if (hT && xoF !== null) {
      let acc = 0;
      let n = 0;
      for (let i = 0; i < r.freq.length; i++) {
        if (r.freq[i] > xoF / 3) continue;
        const mag = 20 * Math.log10(Math.hypot(hT[i].re, hT[i].im) || 1e-9);
        const d = Math.max(0, mag + 15);
        acc += d * d;
        n++;
      }
      protSqDb = n ? acc / n : 0;
    }

    return {
      rippleDb: targetStd,
      ripplePeakDb: bandPeak(r.freq, r.combinedSpl),
      avgDevDb: bandAvgDev(r.freq, r.combinedSpl),
      // Solo: relative phase against a silent ghost is noise — report 0 so
      // every phase gate (staged target, barrier) passes trivially and the
      // %-based fx gates keep their meaning (a constant 180° term would
      // swamp them).
      phaseDeg: solo
        ? 0
        : phaseMetric === 'band' ? (uN > 0 ? uSum / uN : 180) : wSum > 0 ? eSum / wSum : 180,
      phaseP95Deg: solo ? 0 : phaseP95Deg,
      powerStdDb,
      leakSqDb,
      protSqDb,
      xoHz: xoF,
      xoDipDb,
      midSlopeDbOct,
      tweeterSlopeDbOct,
      zMinOhm,
      zShortOhm,
      medianDb: medianOf(r.freq, r.combinedSpl),
    };
  };

  type Metrics = ReturnType<typeof metricsOn>;
  // Same acoustic-crossing pin as the design optimizer: quadratic in octaves
  // outside the range. FUNDAMENTAL (always on, pin or no pin): filtered
  // branches that never cross = a starved/dead branch — and with xoHz null
  // the breakup guard AND the tweeter-protection anchor silently sit at 0,
  // so without this term the degenerate state escapes every guard at once
  // (Sanders schema: 0.68 µF series cap, tweeter ~25 dB down, no alarm).
  const xoR = opts.xoRange ?? null;
  const xoPenalty = (xoHz: number | null): number => {
    if (xoHz == null) return 120; // no crossing at all ≙ 2 octaves off
    if (!xoR) return 0;
    const oct =
      xoHz < xoR[0] ? Math.log2(xoR[0] / xoHz) : xoHz > xoR[1] ? Math.log2(xoHz / xoR[1]) : 0;
    // ADAPTIVE weight, mirrored from vfOptimizer: wide pins keep the classic
    // 30·oct², narrow SCAN slices scale up (×(0.15 oct / half-width)², cap
    // ×100) so a candidate cannot cheaply drift into a neighbour's slice.
    const halfOct = Math.log2(xoR[1] / xoR[0]) / 2;
    const scale = Math.min(100, Math.max(1, (0.15 / Math.max(halfOct, 1e-6)) ** 2));
    return 30 * scale * oct * oct;
  };
  const fxOf = (m: Metrics): number => {
    const amp =
      dW > 0 && m.powerStdDb !== null
        ? (1 - dW) * m.rippleDb ** 2 + dW * m.powerStdDb ** 2
        : m.rippleDb ** 2;
    // Solo ("0 driver pairs"): flatness of the branch is the whole story —
    // every crossing-anchored term is pair-defined and the phase metric is 0
    // by construction. A constant no-crossing penalty (120) would poison the
    // %-based decision gates (challenge 1%, prune 10%, ladder 1%), so the
    // solo objective is exactly the amplitude term. The amp-load floor stays
    // decision-level (gates + repair pass), same as the two-driver path.
    if (solo) return 2 * amp;
    const phase =
      (m.phaseDeg / 15) ** 2 +
      (phaseMetric === 'band' ? 0.5 * (m.phaseP95Deg / 45) ** 2 : 0);
    let slopePen = 0;
    if (acSlopes) {
      const one = (measured: number | null, target?: number) => {
        if (!target || measured == null) return;
        const d = (Math.abs(measured) - target) / 6;
        slopePen += d < 0 ? 2.5 * d * d : 0.4 * d * d;
      };
      one(m.midSlopeDbOct, acSlopes.mid);
      one(m.tweeterSlopeDbOct, acSlopes.tweeter);
    }
    return (
      2 * (1 - p) * amp +
      2 * p * phase +
      (breakupGuard ? 0.02 * m.leakSqDb : 0) +
      0.02 * m.protSqDb +
      // Dead-spot crossing (always on): a 19 dB-deep crossing hole costs
      // ~180 — dominant, as it should be; a healthy design pays 0.
      // NB: the amp-load floor is deliberately NOT here (see Z_FLOOR_OHM) —
      // it lives in the gates and the repair pass, never in the objective.
      0.5 * m.xoDipDb * m.xoDipDb +
      xoPenalty(m.xoHz) +
      slopePen
    );
  };

  const cloneParts = (ps: readonly VxpPart[]): VxpPart[] =>
    ps.map((q) => ({
      ...q,
      params: q.params.map((par) => ({ ...par })),
      wires: q.wires.map((w) => ({ ...w })),
    }));

  /** Netlist + the free (unlocked R/L/C) elements for a parts array. Open and
   *  shorted parts emit no elements, so structure variants come for free. */
  const buildWork = (ps: readonly VxpPart[]) => {
    const { netlist } = crossoverToNetlist({ name: 'net-opt', parts: [...ps] });
    const locked = new Set(ps.filter((q) => q.locked).map((q) => q.partId));
    const work = { nodeCount: netlist.nodeCount, elements: netlist.elements.map((e) => ({ ...e })) };
    const free = work.elements.filter(
      (e): e is PassiveElement =>
        (e.kind === 'R' || e.kind === 'L' || e.kind === 'C') && !locked.has(e.id),
    );
    return { work, free };
  };

  /** One objective evaluation of a parts array as-is (no value tuning). */
  const quickFx = (ps: readonly VxpPart[]): number => {
    const { work } = buildWork(ps);
    evaluations++;
    return fxOf(metricsOn(work, optW.freq, optW, optT, optZ, optAngles));
  };

  /** Value window for a slot (log10 SI): SERIES-PATH slots of a bound kind are
   *  clamped to that series' value range (boundToSeries). null = no window, use
   *  the soft buildability bounds. Applied to the FIT so the network adapts. */
  const boundSeriesWindow = (
    kind: 'C' | 'L' | 'R',
    isSeries: boolean,
  ): [number, number] | null => {
    const sp = opts.snapPrefs;
    if (!sp?.boundToSeries || !isSeries) return null;
    const sid = sp.seriesByKind?.[kind];
    if (!sid || sid === 'auto') return null;
    const range = seriesValueRange(sid, kind);
    if (!range || !(range[0] > 0) || range[1] <= range[0]) return null;
    return [Math.log10(range[0]), Math.log10(range[1])];
  };

  interface TuneOut {
    parts: VxpPart[];
    freeCount: number;
    fx: number;
    metrics: Metrics;
  }

  /** Nelder-Mead value re-fit of a parts array; never worse than its seed.
   *  With `barrier` (staged mode) exceeding the targets is punished hard, so
   *  the fit stays inside the goal region whenever one is reachable —
   *  without it the blended objective happily trades ripple past the target
   *  for phase the targets never asked for. */
  const tune = (
    ps: readonly VxpPart[],
    budgetScale = 1,
    barrier: { rippleDb: number; phaseDeg: number } | null = null,
    applyWindow = true,
    /** Amp-load floor REPAIR barrier — only the repair pass sets this; the
     *  normal tune objective must stay clean (see Z_FLOOR_OHM). */
    zFloorBarrier = false,
  ): TuneOut => {
    const { work, free } = buildWork(ps);
    if (free.length === 0) {
      const m = metricsOn(work, optW.freq, optW, optT, optZ, optAngles);
      return { parts: cloneParts(ps), freeCount: 0, fx: fxOf(m), metrics: m };
    }
    // Realism anchor: per element the effective soft window = buildability
    // bounds, with the CEILING tightened for series-path parts (position via
    // the same bus BFS the snap's tier doctrine uses). A bound series (value
    // window) REPLACES the soft window with a HARD clamp to the series' range.
    const posOf = busPositions(ps);
    const win = free.map((e) =>
      applyWindow ? boundSeriesWindow(e.kind, posOf(e.id) === 'series') : null,
    );
    const hard = win.map((w) => w !== null);
    const winLo = free.map((e, i) => (win[i] ? win[i]![0] : Math.log10(BOUNDS[e.kind][0])));
    const winHi = free.map((e, i) =>
      win[i]
        ? win[i]![1]
        : Math.log10(
            posOf(e.id) === 'series'
              ? Math.min(SERIES_CEIL[e.kind], BOUNDS[e.kind][1])
              : BOUNDS[e.kind][1],
          ),
    );
    // The barrier must not SPEND fundamentals: capture the seed's tweeter
    // protection so target-chasing cannot buy ripple with resonance drive
    // (measured: barrier weight 120 vs protection price 0.02 tripled the
    // protSqDb — the escalation gate then rightly refused every candidate).
    let protRef = Infinity;
    if (barrier) {
      try {
        protRef = metricsOn(work, optW.freq, optW, optT, optZ, optAngles).protSqDb + 0.5;
      } catch {
        protRef = Infinity;
      }
    }
    const objective = (logVals: readonly number[]): number => {
      evaluations++;
      let penalty = 0;
      for (let i = 0; i < free.length; i++) {
        if (hard[i]) {
          // Value window = a true box constraint: clamp, never penalise out.
          free[i].value = 10 ** Math.min(Math.max(logVals[i], winLo[i]), winHi[i]);
        } else {
          free[i].value = 10 ** logVals[i];
          if (logVals[i] < winLo[i]) penalty += (winLo[i] - logVals[i]) ** 2;
          else if (logVals[i] > winHi[i]) penalty += (logVals[i] - winHi[i]) ** 2;
        }
      }
      let m;
      try {
        m = metricsOn(work, optW.freq, optW, optT, optZ, optAngles);
      } catch {
        return 1e9;
      }
      let barr = 0;
      if (barrier) {
        // 8% margin absorbs the decimated-vs-full-grid metric offset (the
        // acceptance check runs on the full grid); the heavy weight keeps a
        // small fx gain from buying a target violation. Barrier tunes are
        // always seeded from an already-good point, so the cliffs are safe.
        const exR = Math.max(0, m.ripplePeakDb - barrier.rippleDb * 0.92);
        const exP = Math.max(0, (m.phaseDeg - barrier.phaseDeg * 0.92) / 15);
        barr = 120 * (exR * exR + exP * exP) + 4 * Math.max(0, m.protSqDb - protRef);
      }
      // SOLO sensitivity wall. Exactly ZERO inside the cap, so the search path
      // through the healthy region is untouched (the same argument that makes
      // the buildability windows safe) — it only walls off the region where
      // "flatness" means "attenuate everything". Without it the tuner walks
      // out of bounds on real drivers and the final gate throws the whole tune
      // away, handing back seed values (measured on Robbert's 12W8524:
      // rejected at 12.6 dB and 20 dB loss).
      // The cap is SEED-RELATIVE (see soloLossCap): a design that deliberately
      // spends level — baffle-step compensation on a woofer is exactly that,
      // and Sanders' own manual 12W8524 filter spends ~10 dB — keeps its own
      // level as the reference. The wall stops the tuner from spending MORE,
      // it never second-guesses the designer's starting point.
      if (solo) {
        const over = Math.max(0, rawMedianRef - m.medianDb - soloLossCap);
        if (over > 0) barr += 200 * over * over;
      }
      if (zFloorBarrier) {
        // Locally-seeded repair barrier (the proven target-barrier pattern):
        // pulls the dip up to the floor, from a point that is already good.
        // Stiff on purpose — the quadratic is weak near the floor (a 2.7 Ω
        // residue at weight 120 cost a negligible 1.2 and the repair stalled
        // there; the gate then rejected the whole tune anyway).
        barr += 1200 * (m.zShortOhm / Z_FLOOR_OHM) ** 2;
      }
      return fxOf(m) + barr + 8 * penalty;
    };
    const x0 = free.map((e) => Math.log10(e.value));
    const iters = Math.max(
      200,
      Math.round((maxIterations ?? Math.max(700, 140 * free.length)) * budgetScale),
    );
    let fit = nelderMead(objective, x0, { maxIterations: iters, tolerance: 1e-6, step: 0.1 });
    const again = nelderMead(objective, [...fit.x], { maxIterations: iters, tolerance: 1e-6, step: 0.25 });
    if (again.fx < fit.fx) fit = again;
    // Never end worse than the values we started from.
    if (objective(x0) <= objective(fit.x)) fit = { ...fit, x: [...x0] };

    free.forEach((e, i) => {
      e.value = 10 ** (hard[i] ? Math.min(Math.max(fit.x[i], winLo[i]), winHi[i]) : fit.x[i]);
    });
    const m = metricsOn(work, optW.freq, optW, optT, optZ, optAngles);
    const valueOf = new Map(free.map((e) => [e.id, e.value]));
    const out = cloneParts(ps).map((q) => {
      if (q.partId === undefined || !valueOf.has(q.partId) || q.open || q.shorted) return q;
      const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : 'R';
      const u = PARAM_OF[kind];
      // A retuned value invalidates any earlier snap attribution.
      const { catalog: _stale, ...rest } = q;
      void _stale;
      return {
        ...rest,
        params: q.params.map((par) =>
          par.name === u.name
            ? { ...par, value: Number((valueOf.get(q.partId!)! * u.factor).toPrecision(4)) }
            : par,
        ),
      };
    });
    return { parts: out, freeCount: free.length, fx: fxOf(m), metrics: m };
  };

  {
    const { free } = buildWork(parts);
    if (free.length === 0) {
      throw new NetOptimizeError('Every component is locked — nothing for the optimizer to move.');
    }
  }
  const before = metricsOn(
    buildWork(parts).work,
    grid,
    wBase,
    tBase,
    driverZ,
    angleData ?? null,
  );
  /** Solo sensitivity gate: the network may not spend more than the budget of
   *  the driver's own median level. Always true for two-driver designs (level
   *  there is a pairing decision, priced by the crossing fundamentals). */
  const soloSensOk = (m: Metrics): boolean =>
    !solo || rawMedianRef - m.medianDb <= soloLossCap;

  if (solo) soloLossCap = Math.max(soloSensBudgetDb, rawMedianRef - before.medianDb);

  onStage?.('value tune');
  /* ---- Stage: value tuning (always) — MULTI-START. The response landscape
   * is multimodal and under-determined: many value-sets sum equally flat,
   * and from an arbitrary seed the tuner may converge into a low-impedance
   * big-cap basin even when an impedance-matched basin scores as well or
   * better (Sanders: C2/B·C1 at 33 µF where ~10–15 µF matched, integration
   * 100 either way). A second start re-seeds far-off-textbook REACTIVE
   * outliers AT their textbook magnitude (L ≈ R/2πfc, C ≈ 1/(2πfc·R); fc =
   * the seed's acoustic crossing, R = median |Z| around it) so the matched
   * basin gets explored too; the best TUNED result by fx wins. This is
   * seeding, not an objective term — the search inside each basin stays
   * untouched. (The objective-nudge version of "caps kleiner, spoelen
   * groter" measurably destabilized the search and was reverted.) Both
   * starts are deterministic, so same input → same output, every run. ---- */
  const textbook = (() => {
    let fc = before.xoHz;
    if (!fc || !(fc > 0)) fc = xoR ? Math.sqrt(xoR[0] * xoR[1]) : Math.sqrt(band[0] * band[1]);
    const zs: number[] = [];
    for (const z of Object.values(driverZ)) {
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] >= fc / 2 && grid[i] <= fc * 2) zs.push(Math.hypot(z[i].re, z[i].im));
      }
    }
    zs.sort((a, b) => a - b);
    const R = zs.length ? zs[Math.floor(zs.length / 2)] : 6;
    return { L: R / (2 * Math.PI * fc), C: 1 / (2 * Math.PI * fc * R) };
  })();
  /** Estimated build cost of a CONTINUOUS-valued network: nearest catalog
   *  part per R/L/C regardless of distance (bomFor's 1% exact-match window
   *  is meaningless mid-tune — it priced 3 of 15 parts and compared noise).
   *  Null without a priced catalog. */
  const estimateCostEur = (ps: readonly VxpPart[]): number | null => {
    if (!hasImportedCatalog()) return null;
    let sum = 0;
    let priced = 0;
    for (const q of ps) {
      if (q.open || q.shorted) continue;
      const kind = q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : q.type === 'Resistor' ? 'R' : null;
      if (!kind) continue;
      const u = PARAM_OF[kind];
      const v = q.params.find((p) => p.name === u.name)?.value;
      if (!v || !(v > 0)) continue;
      const near = nearestParts(kind, v / u.factor, 1)[0];
      if (near?.priceEur !== undefined) {
        sum += near.priceEur;
        priced++;
      }
    }
    return priced > 0 ? sum : null;
  };
  const fxOrig = quickFx(parts);
  /** Tune the challenger. Clear fx win (>1%) takes it regardless of price;
   *  an fx TIE (≤1% either way) goes to the CHEAPER estimated build —
   *  Sanders "caps zo klein mogelijk": at equal fit a 33 µF premium cap has
   *  no business beating a 6.8 µF one. In STAGED mode the targets are the
   *  sufficiency bar (trapmethode: "toereikend is variabel"), so a cheaper
   *  basin that still MEETS the targets on the full grid may win within the
   *  same 10% objective room the prune doctrine allows — with the
   *  prune-strict fundamentals gates riding along. Cost is decision-level
   *  only; without a priced catalog nothing changes. */
  const challenge = (base: TuneOut, seedPs: readonly VxpPart[]): TuneOut => {
    const alt = tune(seedPs, 1, opts.staged ?? null);
    const cheaper = (): boolean => {
      const cBase = estimateCostEur(base.parts);
      const cAlt = estimateCostEur(alt.parts);
      return cBase !== null && cAlt !== null && cAlt < cBase;
    };
    if (alt.fx < base.fx * 0.99) return alt;
    if (alt.fx <= base.fx * 1.01 && alt.fx < fxOrig) {
      if (cheaper()) return alt;
      if (alt.fx < base.fx) return alt;
    }
    if (opts.staged && alt.fx <= base.fx * 1.1 && cheaper()) {
      const full = (ps: readonly VxpPart[]): Metrics =>
        metricsOn(buildWork(ps).work, grid, wBase, tBase, driverZ, angleData ?? null);
      const mAlt = full(alt.parts);
      const mBase = full(base.parts);
      if (
        mAlt.ripplePeakDb <= opts.staged.rippleDb &&
        mAlt.phaseDeg <= opts.staged.phaseDeg &&
        mAlt.protSqDb <= mBase.protSqDb + 0.5 &&
        mAlt.xoDipDb <= mBase.xoDipDb + 1 &&
        mAlt.zShortOhm <= mBase.zShortOhm + 0.1 &&
        (!breakupGuard || mAlt.leakSqDb <= mBase.leakSqDb + 4)
      ) {
        return alt;
      }
    }
    return base;
  };
  /** Up to two result-reseed challenges; stops when one loses. */
  const driftCatch = (base: TuneOut): TuneOut => {
    let out = base;
    for (let i = 0; i < 2; i++) {
      const sr = reseedOutliers(out.parts, textbook);
      if (!sr) break;
      const prev = out;
      out = challenge(out, sr);
      if (out === prev) break;
    }
    return out;
  };

  let cur = tune(parts);
  {
    const s1 = reseedOutliers(parts, textbook);
    if (s1) cur = challenge(cur, s1);
    // DRIFT CATCH (Sanders' 33 µF runs): in the app flow the seed comes from
    // textbook-anchored synthesis, so the SEED rarely has outliers — the
    // drift into the big-cap basin happens DURING the tune, and a seed-only
    // check never sees it. Challenge the tuned RESULT as well.
    cur = driftCatch(cur);
  }
  const removed: string[] = [];
  const added: string[] = [];

  const RLC = new Set(['Resistor', 'Inductor', 'Capacitor']);

  if (opts.staged) {
    const tgt = opts.staged;
    // Targets are judged on the FULL grid — the numbers the user sees. The
    // decimated inner grid drives the search but its (integration-weighted)
    // phase metric can differ visibly from the full-grid one.
    const fullM = (ps: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(ps).work, grid, wBase, tBase, driverZ, angleData ?? null);
    const meets = (m: Metrics): boolean =>
      m.ripplePeakDb <= tgt.rippleDb && m.phaseDeg <= tgt.phaseDeg;
    // Steer INTO the target region from the fx-optimum: the barrier is a
    // local refinement — applied from a cold seed it drowns the landscape
    // (learned the hard way: 843 µF caps chasing an unreachable target).
    cur = tune(cur.parts, 0.6, tgt);
    let curFull = fullM(cur.parts);
    /** The targets only speak of ripple/phase — a structure move must ALSO
     *  keep the fundamentals: tweeter protection intact, breakup margin not
     *  meaningfully surrendered. (Shorting the tweeter's series C can leave
     *  ripple within target while frying the driver.) */
    const safe = (m: Metrics, ref: Metrics): boolean =>
      m.protSqDb <= ref.protSqDb + 0.5 &&
      m.xoDipDb <= ref.xoDipDb + 1 &&
      m.zShortOhm <= ref.zShortOhm + 0.1 &&
      soloSensOk(m) &&
      (!breakupGuard || m.leakSqDb <= ref.leakSqDb + 4);
    /** Escalation adds a part + full retune: protection shifts a little by
     *  nature (the fx already prices it at 0.02·protSqDb). The prune-strict
     *  +0.5 slack blocked every legitimate bypass-C; +3 (~1.7 dB RMS above
     *  the −15 dB floor) stays bounded without being a knife edge. */
    const safeEsc = (m: Metrics, ref: Metrics): boolean =>
      m.protSqDb <= ref.protSqDb + 3 &&
      m.xoDipDb <= ref.xoDipDb + 2 &&
      m.zShortOhm <= ref.zShortOhm + 0.3 &&
      (!breakupGuard || m.leakSqDb <= ref.leakSqDb + 4);

    if (meets(curFull)) {
      onStage?.('prune sweep');
      /* ---- PRUNE: shed parts whose removal is (nearly) FREE ----
       * Every unlocked part gets two removal variants: `open` (a shunt part
       * simply disappears) and `shorted` (a series part becomes a wire). The
       * wrong variant breaks the network and is rejected by the objective —
       * no topology reasoning needed. Cheapest-looking removals are re-tuned
       * first. A removal must keep the targets AND cost almost nothing:
       * ≤10% objective per removal, ≤35% cumulative. Without those caps the
       * prune walked quality down to the target boundary — Sanders three
       * screenshots: more EQ budget → more prunable parts → phase 2.7° →
       * 7.8°, all "within target" and therefore invisible to the old gate.
       * Fewest components, but never quality as loose change. */
      const fx0 = cur.fx;
      for (let round = 0; round < 8; round++) {
        type Cand = { id: string; trial: VxpPart[]; fx: number };
        const cands: Cand[] = [];
        for (const q of cur.parts) {
          if (!RLC.has(q.type) || q.locked || q.open || q.shorted) continue;
          if (q.partId === undefined) continue;
          for (const mode of ['open', 'shorted'] as const) {
            const trial = cur.parts.map((pp) => (pp === q ? { ...q, [mode]: true } : pp));
            let fx: number;
            try {
              fx = quickFx(trial);
            } catch {
              continue;
            }
            if (fx > 1e8) continue;
            cands.push({ id: q.partId, trial, fx });
          }
        }
        cands.sort((a, b) => a.fx - b.fx);
        let accepted = false;
        for (const cand of cands.slice(0, 3)) {
          const t = tune(cand.trial, 0.6, tgt);
          const tFull = fullM(t.parts);
          if (
            meets(tFull) &&
            safe(tFull, curFull) &&
            t.fx <= cur.fx * 1.1 &&
            t.fx <= fx0 * 1.35
          ) {
            cur = t;
            curFull = tFull;
            removed.push(cand.id);
            accepted = true;
            break;
          }
        }
        if (!accepted) break;
      }
    } else {
      onStage?.('escalation');
      /* ---- ESCALATE (rule 3): bypass-C across series resistors ---- */
      for (let round = 0; round < 2 && !meets(curFull); round++) {
        let best: { id: string; t: TuneOut } | null = null;
        const cands = bypassCandidates(cur.parts, cloneParts);
        for (const cand of cands) {
          const t = tune(cand.trial, 0.6, tgt);
          if (!best || t.fx < best.t.fx) best = { id: cand.id, t };
        }
        if (!best) break;
        const bestFull = fullM(best.t.parts);
        // The new part must EARN its place: reach the targets or pay ≥3%.
        if (safeEsc(bestFull, curFull) && (meets(bestFull) || best.t.fx < cur.fx * 0.97)) {
          cur = best.t;
          curFull = bestFull;
          added.push(best.id);
        } else break;
      }
    }

    // Structure changed → one full-budget settle of the survivors.
    if (removed.length + added.length > 0) cur = tune(cur.parts, 1, tgt);
  }

  onStage?.('drift check');
  /* ---- LATE drift catch: staged retunes (barrier tune, prune/escalation
   * settles) walk values back into the big-cap basin AFTER the early
   * challenges — measured on the 1900-chain: the early challenge moved to
   * the matched basin (fx 0.192→0.175, cheaper), yet C2 ended at 33 µF
   * again. One more result-challenge on the assembled survivor, right
   * before the snap freezes values onto purchasable parts. ---- */
  cur = driftCatch(cur);

  onStage?.('cap shrink ladder');
  /* ---- Cap SHRINK LADDER (Sanders: "met B·C1 laag beginnen en langzaam
   * opvoeren om te vergelijken" — implemented as the equivalent warm-started
   * walk DOWN, and extended to C2/every free cap on Sanders' request):
   * premium capacitors are the price drivers (an Alumen/Superior € scales
   * steeply with µF, whether it sits in the signal path or as the mid-LP
   * shunt — C2 was a €132 Superior Z-Cap), and the response is often
   * near-indifferent over a wide value range, so the tuner has no reason to
   * prefer the small end. For each free C — series path first (proven), then
   * the shunts — step its value down the E12 ladder, slot pinned, everything
   * else retuned, and keep the smallest value that still meets the bar
   * (staged: full-grid targets + fundamentals not worse; otherwise: ≤1% fx
   * per step, ≤2% cumulative — the desnoei-rem shape). The same never-worse
   * gates protect a shunt/trap cap: shrinking a trap that hurts the notch
   * fails the targets and stops (and if the notch survives with a smaller
   * cap + bigger coil, that IS "caps kleiner, spoelen groter"). Walking down
   * from the converged solution warm-starts every step from a working
   * neighbour; starting low and walking up would cold-start in an arbitrary
   * basin. ---- */
  {
    const E12L = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
    const stepDown = (si: number): number => {
      const target = si / 1.05;
      let bestV = 0;
      for (let dec = -7; dec <= -3; dec++) {
        for (const m of E12L) {
          const v = m * 10 ** dec;
          if (v < target && v > bestV) bestV = v;
        }
      }
      return bestV;
    };
    const fullOf = (ps: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(ps).work, grid, wBase, tBase, driverZ, angleData ?? null);
    const posOfCur = busPositions(cur.parts);
    const freeCaps = cur.parts.filter(
      (q) =>
        q.type === 'Capacitor' &&
        q.partId !== undefined &&
        !q.locked &&
        !q.open &&
        !q.shorted,
    );
    // Series-path caps first (proven), then shunts — deterministic order.
    const ladderIds = [
      ...freeCaps.filter((q) => posOfCur(q.partId!) === 'series'),
      ...freeCaps.filter((q) => posOfCur(q.partId!) !== 'series'),
    ].map((q) => q.partId!);
    const base0 = ladderIds.length > 0 ? fullOf(cur.parts) : null;
    const baseMeets =
      base0 !== null &&
      (!opts.staged ||
        (base0.ripplePeakDb <= opts.staged.rippleDb && base0.phaseDeg <= opts.staged.phaseDeg));
    if (base0 !== null && baseMeets) {
      const fx00 = cur.fx;
      for (const id of ladderIds) {
        for (let step = 0; step < 6; step++) {
          const part = cur.parts.find((q) => q.partId === id);
          if (!part) break;
          const si = (part.params.find((p) => p.name === 'C')?.value ?? 0) / PARAM_OF.C.factor;
          if (!(si > 1.05e-6)) break; // floor: 1 µF
          const next = stepDown(si);
          if (!(next > 0)) break;
          const trial = cloneParts(cur.parts).map((q) =>
            q.partId === id
              ? {
                  ...q,
                  locked: true,
                  params: q.params.map((p) =>
                    p.name === 'C'
                      ? { ...p, value: Number((next * PARAM_OF.C.factor).toPrecision(4)) }
                      : p,
                  ),
                }
              : q,
          );
          const t = tune(trial, 0.6, opts.staged ?? null);
          const cand: TuneOut = {
            ...t,
            // The slot was only pinned for THIS retune: restore its lock
            // state, and report the free count of the real network (the
            // temporary pin must not leak into `tuned`).
            freeCount: cur.freeCount,
            parts: t.parts.map((q) =>
              q.partId === id ? { ...q, locked: part.locked ?? false } : q,
            ),
          };
          const okFx = opts.staged
            ? cand.fx <= fx00 * 1.1
            : cand.fx <= cur.fx * 1.01 && cand.fx <= fx00 * 1.02;
          if (!okFx) break;
          const fm = fullOf(cand.parts);
          const meetsOk =
            !opts.staged ||
            (fm.ripplePeakDb <= opts.staged.rippleDb && fm.phaseDeg <= opts.staged.phaseDeg);
          const safeOk =
            fm.protSqDb <= base0.protSqDb + 0.5 &&
            fm.xoDipDb <= base0.xoDipDb + 1 &&
            fm.zShortOhm <= base0.zShortOhm + 0.1 &&
            (!breakupGuard || fm.leakSqDb <= base0.leakSqDb + 4);
          // Quality-only gate — NO per-step cost check. Gating on the mid-tune
          // cost estimate backfired (measured on C2): `estimateCostEur` picks
          // the nearest priced part regardless of tier, so the "price" flips
          // between parts as a continuous value slides, and a false cost
          // bump broke the ladder (B·C1 stuck at 15 µF, worse AND pricier).
          // Same lesson as the objective anchor: cost belongs at clean
          // decision points (the snap, the scan ranking), not noisy per-step
          // gates. The final snap + BOM-aware scan handle the money.
          if (!meetsOk || !safeOk) break;
          cur = cand;
        }
      }
    }
  }

  /* ---- Amp-load floor repair (decision-level, see Z_FLOOR_OHM). When the
   * tuned result dips below the floor — a shunt trap/Zobel R near the input,
   * or an amp-hostile value the response metrics cannot see — a locally
   * seeded barrier retune walks the values up out of the dip. Accepted only
   * when it genuinely lifts the minimum AND the response stays in class
   * (prune-doctrine 10%) with the fundamentals intact; otherwise the result
   * stands and the note tells the truth (the Impedance panel shows it too). */
  let ampFloorNote: string | undefined;
  {
    const fullOf = (ps: readonly VxpPart[]): Metrics =>
      metricsOn(buildWork(ps).work, grid, wBase, tBase, driverZ, angleData ?? null);
    // Judge the dip on the evaluation grid AND the safety grid (when given):
    // the safety gate rejects on ITS grid, and a narrow resonant dip — or one
    // outside a zoomed view range — only shows up there. Detection and
    // acceptance must use the same measure the gate will.
    const worstZ = (m: Metrics, ps: readonly VxpPart[]): { short: number; min: number } => {
      let short = m.zShortOhm;
      let min = m.zMinOhm;
      if (opts.safety) {
        const s = opts.safety;
        const ms = metricsOn(buildWork(ps).work, s.freqs, s.w, s.t, s.z, null);
        if (ms.zShortOhm > short) {
          short = ms.zShortOhm;
          min = ms.zMinOhm;
        }
      }
      return { short, min };
    };
    const mCur = fullOf(cur.parts);
    const zCur = worstZ(mCur, cur.parts);
    if (zCur.short > 0.15) {
      onStage?.('amp-load floor');
      // A dipping SEED (user network already below the floor) moves the bar:
      // the safety gate judges against the seed, so "as healthy as the seed"
      // is repaired enough there.
      const zSeed = worstZ(fullOf(parts), parts);
      const repairedEnough = (s: number): boolean => s <= Math.max(0.15, zSeed.short + 0.15);
      // Iterate the barrier retune (max 3 warm-started rounds): one round's
      // simplex budget regularly stalls short (measured in the app chain:
      // 1.2 → 2.14 Ω in round one, threshold 2.5).
      let rep = tune(cur.parts, 1, opts.staged ?? null, true, true);
      let zRepI = worstZ(fullOf(rep.parts), rep.parts);
      for (let round = 1; round < 3 && !repairedEnough(zRepI.short); round++) {
        const again = tune(rep.parts, 1, opts.staged ?? null, true, true);
        const zAgain = worstZ(fullOf(again.parts), again.parts);
        if (!(zAgain.short < zRepI.short - 1e-3)) break; // no longer improving
        rep = again;
        zRepI = zAgain;
      }
      const mRep = fullOf(rep.parts);
      const zRep = zRepI;
      const targetsKept =
        !opts.staged ||
        mCur.ripplePeakDb > opts.staged.rippleDb || // weren't met before either
        (mRep.ripplePeakDb <= opts.staged.rippleDb && mRep.phaseDeg <= opts.staged.phaseDeg);
      // Full repair or nothing: a partial lift (2.7 of 3 Ω at the old floor)
      // still fails the safety gate and the whole tune bounces back to the
      // seed anyway — the dip must clear the detection threshold itself.
      // Acceptance beyond that: targets kept, tweeter protection never
      // surrendered (the one non-negotiable), and then EITHER the repair is
      // strictly better on the full objective — which already prices every
      // fundamental, and rejecting a strictly-better repair hands the user
      // the raw seed instead (measured: repFx 4.8 < 5.7 refused on a +7 leak
      // arm, and the gate then threw 100% of the tune away) — OR it stays in
      // the prune-doctrine 10%/seed window with the leak/dip arms intact.
      const armsOk =
        (rep.fx <= cur.fx * 1.1 || rep.fx <= fxOrig) &&
        mRep.xoDipDb <= mCur.xoDipDb + 1 &&
        (!breakupGuard || mRep.leakSqDb <= mCur.leakSqDb + 4);
      const ok =
        repairedEnough(zRep.short) &&
        targetsKept &&
        mRep.protSqDb <= mCur.protSqDb + 3 &&
        (rep.fx <= cur.fx || armsOk);
      if (ok) {
        ampFloorNote =
          `amp-load floor: system impedance minimum lifted ` +
          `${zCur.min.toFixed(1)} → ${zRep.min.toFixed(1)} Ω (floor ${Z_FLOOR_OHM} Ω)`;
        cur = { ...rep, freeCount: cur.freeCount };
      } else {
        ampFloorNote =
          `amp-load floor: system impedance dips to ${zCur.min.toFixed(1)} Ω ` +
          `(floor ${Z_FLOOR_OHM} Ω) and could not be repaired without losing response quality — ` +
          `check the Impedance panel`;
      }
    }
  }

  let snapNote: string | undefined;
  onStage?.('catalog snap');
  /* ---- Catalog snap (final step): land every free part on purchasable
   * values, judged on the ASSEMBLED network with real DCR/ESR riding along.
   * Runs last on purpose — any later value tune would un-snap it. ---- */
  if (opts.catalogSnap && hasImportedCatalog()) {
    const KIND_OF: Record<string, 'L' | 'C' | 'R'> = {
      Inductor: 'L',
      Capacitor: 'C',
      Resistor: 'R',
    };
    const cw = opts.costWeight ?? 0.0015;
    const upsert = (params: VxpPart['params'], name: string, value: number, unit: string) => {
      const hit = params.find((q) => q.name === name);
      if (hit) return params.map((q) => (q.name === name ? { ...q, value } : { ...q }));
      return [...params.map((q) => ({ ...q })), { name, value, unit }];
    };
    const snapables = cur.parts
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => KIND_OF[q.type] && !q.locked && !q.open && !q.shorted && q.partId);
    // Position per part: shared bus-path BFS (see busPositions) — the same
    // classification the tuner's realism anchor uses.
    const posOfPart = busPositions(cur.parts);
    const cands = snapables.map(({ q }) => {
      const kind = KIND_OF[q.type];
      const u = PARAM_OF[kind];
      const raw = q.params.find((p) => p.name === u.name)?.value ?? 0;
      return pickCandidates(kind, raw / u.factor, 3, opts.snapPrefs ?? null, posOfPart(q.partId!));
    });
    const applied = (ch: (CatalogPick | null)[]): VxpPart[] => {
      const out = cloneParts(cur.parts);
      snapables.forEach(({ q, i }, j) => {
        const p = ch[j];
        if (!p) return;
        const kind = KIND_OF[q.type];
        const u = PARAM_OF[kind];
        let params = upsert(out[i].params, u.name, Number((p.value * u.factor).toPrecision(4)), '');
        if (kind === 'L') params = upsert(params, 'DCR', Number(p.seriesR.toPrecision(3)), 'Ω');
        if (kind === 'C') params = upsert(params, 'ESR', Number(p.seriesR.toPrecision(3)), 'Ω');
        out[i] = { ...out[i], params, catalog: p.parts.map((x) => x.id).join('+') };
      });
      return out;
    };
    const snapScore = (ch: (CatalogPick | null)[]): number => {
      const extra = ch.reduce((a, p) => a + (p ? p.parts.length - 1 : 0), 0);
      const cost = ch.reduce((a, p) => a + (p?.priceEur ?? 0), 0);
      let fx: number;
      try {
        fx = quickFx(applied(ch));
      } catch {
        return 1e12;
      }
      return fx * (1 + 0.05 * extra) * (1 + cw * cost);
    };
    const descend = (candSets: CatalogPick[][]): { picks: (CatalogPick | null)[]; score: number } => {
      let ps: (CatalogPick | null)[] = candSets.map((c) => c[0] ?? null);
      let best = snapScore(ps);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < ps.length; j++) {
          for (const cand of candSets[j]) {
            if (cand === ps[j]) continue;
            const trial = [...ps];
            trial[j] = cand;
            const sc = snapScore(trial);
            if (sc < best) {
              best = sc;
              ps = trial;
            }
          }
        }
      }
      return { picks: ps, score: best };
    };
    const withStacks = descend(cands);
    let picks = withStacks.picks;
    // Conscious stacking: when stacks got picked, also price the singles-only
    // variant and report the percentage difference — the designer sees what
    // stacking bought instead of discovering it in the BOM.
    if (picks.some((p) => p && p.parts.length > 1)) {
      const noStackPrefs: SnapPrefs = { ...(opts.snapPrefs ?? { profile: 'auto' }), allowStacks: false };
      const singleCands = snapables.map(({ q }) => {
        const kind = KIND_OF[q.type];
        const u = PARAM_OF[kind];
        const raw = q.params.find((p) => p.name === u.name)?.value ?? 0;
        return pickCandidates(kind, raw / u.factor, 3, noStackPrefs, posOfPart(q.partId!));
      });
      const singlesOnly = descend(singleCands);
      const costOf = (ch: (CatalogPick | null)[]) =>
        ch.reduce((a, p) => a + (p?.priceEur ?? 0), 0);
      const dFit = ((singlesOnly.score - withStacks.score) / withStacks.score) * 100;
      const dEur = costOf(withStacks.picks) - costOf(singlesOnly.picks);
      const stacksBetter = withStacks.score <= singlesOnly.score;
      if (opts.snapPrefs?.allowStacks === false || (!stacksBetter && singlesOnly.score > 0)) {
        // Singles won: stacks lose by |dFit| (dFit ≤ 0 in this branch).
        picks = singlesOnly.picks;
        snapNote = `snap: singles only (stacks would fit ${Math.abs(dFit).toFixed(0)}% worse)`;
      } else {
        const n = withStacks.picks.filter((p) => p && p.parts.length > 1).length;
        snapNote =
          `snap: ${n} stack${n > 1 ? 's' : ''} — singles-only would fit ` +
          `${Math.abs(dFit).toFixed(0)}% ${dFit > 0 ? 'worse' : 'better'}` +
          (Number.isFinite(dEur) && Math.abs(dEur) >= 0.5
            ? ` and cost €${Math.abs(dEur).toFixed(0)} ${dEur > 0 ? 'less' : 'more'}`
            : '');
      }
    }
    cur = { ...cur, parts: applied(picks) };
  }

  /* ---- Finish: materialise removals, report on the full grid ---- */
  let outParts: VxpPart[] = [];
  for (const q of cur.parts) {
    if (q.open && removed.includes(q.partId ?? '')) continue; // gone
    if (q.shorted && removed.includes(q.partId ?? '')) {
      // A pruned series part lives on as a wire between its terminals.
      outParts.push({
        type: 'Wire',
        params: [],
        wires: [{ ...q.wires[0] }, { ...q.wires[q.wires.length - 1] }],
      });
      continue;
    }
    outParts.push(q);
  }
  // Pruning a chain member orphans its neighbours' wires and ground symbol —
  // electrically dead (they hang on their own ground) but the schematic
  // LOOKS broken. Staged mode owns the schematic's cleanliness: sweep ALL
  // wires/grounds whose net touches no component — the debris this run
  // created AND leftovers from earlier runs. commitSchematic is undo-able,
  // so an accidentally swept sketch is one Undo away.
  if (opts.staged) {
    const un = unanchoredKeys(outParts);
    outParts = outParts.filter((q) => !un.has(debrisKey(q)));
    outParts = trimStubs(outParts);
  }
  const after = metricsOn(buildWork(outParts).work, grid, wBase, tBase, driverZ, angleData ?? null);

  // before/after report the PEAK ±dB (the strip's unit, matching the target)
  // plus the whole-range avg |deviation| for the chain ranking / scan table.
  const report = (m: Metrics) => ({
    rippleDb: m.ripplePeakDb,
    avgDevDb: m.avgDevDb,
    phaseDeg: m.phaseDeg,
  });

  /* ---- SOLO sensitivity gate (see soloSensBudgetDb): a tuned result that
   * bought its flatness with broadband attenuation loses to the seed. The
   * flatness objective cannot see the difference, so this must be a gate.
   * Only fires when the SEED was inside the budget — a user network that is
   * already padded down keeps its own level as the reference. ---- */
  if (solo) {
    const seedLoss = rawMedianRef - before.medianDb;
    const resLoss = rawMedianRef - after.medianDb;
    // Judged against the SAME cap the wall enforces, plus a little slack: the
    // wall permits exactly soloLossCap, so a result sitting on the cap must
    // not then be thrown away by the gate (measured: a 6.0 dB result against a
    // 6 dB cap lost the whole tune over floating-point dust). The gate is the
    // backstop for gross violations, not a second, stricter limit.
    if (resLoss > soloLossCap + 0.5 && resLoss > seedLoss + 0.2) {
      return {
        parts: cloneParts(parts),
        before: report(before),
        after: report(before),
        tuned: 0,
        evaluations,
        removed: [],
        added: [],
        safetyNote:
          `sensitivity gate: the tune reached its flatness by attenuating the driver ` +
          `${resLoss.toFixed(1)} dB below its own level (budget ${soloSensBudgetDb} dB) — ` +
          `rejected, your values are unchanged. Flattening by pulling everything down is not ` +
          `a filter; check for oversized series resistors, or narrow the view range to the ` +
          `band this driver should actually cover.`,
        ...(ampFloorNote ? { ampFloorNote } : {}),
      };
    }
  }

  /* ---- Full-band safety gate: the evaluation band is the user's design
   * scope, but fundamentals are whole-design properties. Re-check them on
   * the full measurement band; a result that degenerates out there (lost
   * crossing, valley crossing, unprotected tweeter) loses to the seed. ---- */
  if (opts.safety) {
    const s = opts.safety;
    const seedS = metricsOn(buildWork(parts).work, s.freqs, s.w, s.t, s.z, null);
    const resS = metricsOn(buildWork(outParts).work, s.freqs, s.w, s.t, s.z, null);
    const reasons: string[] = [];
    if (resS.xoHz == null && seedS.xoHz != null) reasons.push('the acoustic crossing disappeared');
    if (resS.xoDipDb > seedS.xoDipDb + 2) {
      reasons.push(`the crossing sank into a ${resS.xoDipDb.toFixed(0)} dB hole`);
    }
    if (resS.protSqDb > seedS.protSqDb + 3) reasons.push('tweeter protection got worse');
    let zReason = false;
    if (resS.zShortOhm > seedS.zShortOhm + 0.2) {
      zReason = true;
      reasons.push(
        `the system impedance dips to ${resS.zMinOhm.toFixed(1)} Ω ` +
          `(amplifier-load floor ${Z_FLOOR_OHM} Ω)`,
      );
    }
    if (reasons.length > 0) {
      // The band advice only fits the band-scoped degenerations; an amp-load
      // dip can happen on a full view range and has its own remedy.
      const tail =
        zReason && reasons.length === 1
          ? 'Check the Impedance panel; a series resistor in the offending shunt/trap is the usual fix.'
          : 'The evaluated band is narrower than the measurement; widen the view range to let ' +
            'the optimizer see the whole design.';
      return {
        parts: cloneParts(parts),
        before: report(before),
        after: report(before),
        tuned: 0,
        evaluations,
        removed: [],
        added: [],
        safetyNote: `safety gate: tune rejected on the full measurement band — ${reasons.join('; ')}. ${tail}`,
        // What the repair pass tried/achieved — the note explains WHY the
        // gate still saw a dip (repair refused, or never reached the floor).
        ...(ampFloorNote ? { ampFloorNote } : {}),
      };
    }
  }

  // Value-window transparency: which series-path slots got bound to a series'
  // range, and what that constraint cost vs an UNCONSTRAINED fit of the seed
  // (both judged on the full grid). Only when boundToSeries is active.
  let valueWindowNote: string | undefined;
  if (opts.snapPrefs?.boundToSeries) {
    const pos = busPositions(parts);
    const bound: string[] = [];
    for (const q of parts) {
      if (!q.partId || q.open || q.shorted) continue;
      const kind =
        q.type === 'Inductor' ? 'L' : q.type === 'Capacitor' ? 'C' : q.type === 'Resistor' ? 'R' : null;
      if (!kind) continue;
      if (boundSeriesWindow(kind, pos(q.partId) === 'series')) {
        const sid = opts.snapPrefs.seriesByKind![kind]!;
        const sr = allSeries().find((x) => x.id === sid);
        bound.push(`${q.partId} → ${sr ? `${sr.brand} ${sr.series}` : sid}`);
      }
    }
    if (bound.length > 0) {
      const freeBase = tune(parts, 1, null, false);
      const freeFull = metricsOn(
        buildWork(freeBase.parts).work,
        grid,
        wBase,
        tBase,
        driverZ,
        angleData ?? null,
      );
      const dR = after.ripplePeakDb - freeFull.ripplePeakDb;
      const dP = after.phaseDeg - freeFull.phaseDeg;
      const cost =
        dR > 0.05 || dP > 0.3
          ? `costs +${Math.max(0, dR).toFixed(2)} dB / +${Math.max(0, dP).toFixed(1)}° vs unconstrained`
          : 'no measurable cost vs unconstrained';
      valueWindowNote = `value window — ${bound.join(', ')}; ${cost}`;
    }
  }

  return {
    parts: outParts,
    before: report(before),
    after: { ...report(after), xoHz: after.xoHz },
    tuned: cur.freeCount,
    evaluations,
    removed,
    added,
    ...(snapNote ? { snapNote } : {}),
    ...(ampFloorNote ? { ampFloorNote } : {}),
    ...(valueWindowNote ? { valueWindowNote } : {}),
  };
}

/** Stable identity for wires/grounds across cloning (they carry no partId). */
function debrisKey(q: VxpPart): string {
  return `${q.type}|${q.wires.map((w) => `${w.x},${w.y}`).join(';')}`;
}

/** Iteratively eat wire stubs from the tip: a 2-point wire whose endpoint is
 *  shared with NOTHING else leads nowhere — the bus-attached tail a pruned
 *  chain leaves behind. Grounded tails survive (the ground shares the tip). */
function trimStubs(ps: VxpPart[]): VxpPart[] {
  let parts = ps;
  for (;;) {
    const use = new Map<string, number>();
    for (const p of parts) {
      for (const w of p.wires) {
        const k = `${w.x},${w.y}`;
        use.set(k, (use.get(k) ?? 0) + 1);
      }
    }
    const next = parts.filter((p) => {
      if (p.type !== 'Wire' || p.wires.length !== 2) return true;
      return p.wires.every((w) => (use.get(`${w.x},${w.y}`) ?? 0) > 1);
    });
    if (next.length === parts.length) return parts;
    parts = next;
  }
}

/**
 * Debris keys of a parts array: Wire/Ground parts whose coordinate net does
 * not touch any component terminal (R/L/C/driver/generator) — the leftovers
 * a pruned chain strands. Grounds do NOT fuse nets here: two separately
 * grounded chains are not spatially connected.
 */
function unanchoredKeys(ps: readonly VxpPart[]): Set<string> {
  const key = (w: { x: number; y: number }) => `${w.x},${w.y}`;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = parent.get(k) ?? k;
    if (r !== k) {
      r = find(r);
      parent.set(k, r);
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const p of ps) {
    if (p.type === 'Wire') {
      for (const w of p.wires.slice(1)) union(key(p.wires[0]), key(w));
    }
  }
  const anchored = new Set<string>();
  for (const p of ps) {
    if (p.type === 'Wire' || p.type === 'Ground') continue;
    for (const w of p.wires) anchored.add(find(key(w)));
  }
  const out = new Set<string>();
  for (const p of ps) {
    if (p.type !== 'Wire' && p.type !== 'Ground') continue;
    if (!p.wires.some((w) => anchored.has(find(key(w))))) out.add(debrisKey(p));
  }
  return out;
}

/** Rule-3 candidates: a capacitor looped across every unlocked series
 *  resistor (neither terminal grounded) that has no parallel C yet, seeded
 *  for a 4 kHz and a 10 kHz shelf corner. Drawn as the same raised loop the
 *  synthesis uses for pad+bypass.
 *
 *  The move only makes sense for a PAD resistor — one that stands alone in
 *  the series path. A resistor that already has a parallel companion is the
 *  damping R inside a trap (the solo engine's parallel LCR, or a notch): a
 *  cap across it just detunes the trap, and the fourth parallel member also
 *  pushes the group past what the tidy auto-placer can draw (Sanders'
 *  "Tidy layout doet niets" — 4 members in one group, refused). The old
 *  guard compared COORDINATES, so it never saw companions that share the
 *  same NODES on different rows; this one asks the netlist. */
function bypassCandidates(
  ps: readonly VxpPart[],
  cloneParts: (x: readonly VxpPart[]) => VxpPart[],
): Array<{ id: string; trial: VxpPart[] }> {
  const { netlist } = crossoverToNetlist({ name: 'bypass-cands', parts: [...ps] });
  const usedKeys = new Set<string>();
  for (const q of ps) for (const w of q.wires) usedKeys.add(`${w.x},${w.y}`);
  let maxC = 0;
  for (const q of ps) {
    const m = /^C(\d+)$/.exec(q.partId ?? '');
    if (m) maxC = Math.max(maxC, Number(m[1]));
  }
  const newId = `C${maxC + 1}`;

  // The move is "lift the top octave around the PAD" — pads live in the
  // SERIES path. "Not grounded" was too weak a proxy: a Zobel resistor sits
  // at node 3-4 (ungrounded) yet hangs in a chain toward ground, and a
  // parallel member inside such a chain is something the tidy auto-placer
  // cannot draw at all — Sanders' second "Tidy layout doet niets" case.
  const posOf = busPositions(ps);

  const out: Array<{ id: string; trial: VxpPart[] }> = [];
  for (const el of netlist.elements) {
    if (el.kind !== 'R' || el.nodes.includes(0)) continue;
    const q = ps.find((pp) => pp.partId === el.id);
    if (!q || q.locked || q.open || q.shorted) continue;
    if (posOf(el.id) !== 'series') continue;
    const A = q.wires[0];
    const B = q.wires[q.wires.length - 1];
    // Skip when ANYTHING already sits in parallel with this resistor (judged
    // on NODES, not coordinates): an existing bypass, or — the real case —
    // the R inside a parallel L∥C∥R trap. Only a lone pad resistor qualifies.
    const parallelCompanion = netlist.elements.some(
      (o) =>
        o.id !== el.id &&
        (o.kind === 'R' || o.kind === 'L' || o.kind === 'C') &&
        ((o.nodes[0] === el.nodes[0] && o.nodes[1] === el.nodes[1]) ||
          (o.nodes[0] === el.nodes[1] && o.nodes[1] === el.nodes[0])),
    );
    if (parallelCompanion) continue;
    // Raised loop: perpendicular offset whose corner points are unused (a
    // coordinate coincidence would silently create a junction).
    const offsets =
      A.y === B.y
        ? [{ x: 0, y: -4 }, { x: 0, y: 4 }, { x: 0, y: -6 }, { x: 0, y: 6 }]
        : [{ x: 4, y: 0 }, { x: -4, y: 0 }, { x: 6, y: 0 }, { x: -6, y: 0 }];
    const off = offsets.find(
      (o) =>
        !usedKeys.has(`${A.x + o.x},${A.y + o.y}`) && !usedKeys.has(`${B.x + o.x},${B.y + o.y}`),
    );
    if (!off) continue;
    const P = { x: A.x + off.x, y: A.y + off.y };
    const Q = { x: B.x + off.x, y: B.y + off.y };

    for (const f0 of [4000, 10000]) {
      const uF = 1e6 / (2 * Math.PI * f0 * el.value);
      out.push({
        id: newId,
        trial: [
          ...cloneParts(ps),
          { type: 'Wire', params: [], wires: [{ ...A }, { ...P }] },
          { type: 'Wire', params: [], wires: [{ ...B }, { ...Q }] },
          {
            type: 'Capacitor',
            partId: newId,
            params: [{ name: 'C', value: Number(uF.toPrecision(3)), unit: 'uF' }],
            wires: [P, Q],
          },
        ],
      });
    }
  }
  return out;
}
