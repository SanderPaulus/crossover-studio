/**
 * SOLO design engine — "0 driver pairs" (Sanders FRS8-flow, jul 2026).
 *
 * Flattens ONE measured driver with passive-honest tools: cut-only EQ bands
 * (notches on breakup peaks) and shelf-cuts (tilt / baffle-step), judged on
 * whole-range flatness of the filtered response. Deliberately its OWN engine
 * next to the two-way structure search (vfOptimizer): a crossover design
 * enumerates HP/LP alignments around a crossing — flattening a single driver
 * has no structure to enumerate, only correction bands. The planned 3-way
 * engine is the same layering: shared primitives + a per-topology searcher.
 *
 * Shared doctrines (identical to the two-way engines, not re-invented):
 *  - cut-only: passive networks cannot boost, EQ gains are clamped ≤ 0;
 *  - the user's HP/LP knees and gain are BAND-LIMITING CHOICES and stay
 *    untouched — the engine only manages EQ bands (user bands = seeds);
 *  - staged targets ("toereikend is variabel"): stop adding bands once the
 *    peak ripple target is met;
 *  - full-grid band audit: bands are tuned on the decimated inner grid; any
 *    band that pays < 0.5% on the FULL grid is dropped (overfit guard);
 *  - never worse than the seed; fully deterministic (no RNG, no wall-clock).
 */
import { nelderMead } from './optimize.ts';
import { evalDriverFilter, type DriverFilterSpec, type EqBandSpec } from './filters.ts';
import type { GriddedResponse } from './dsp.ts';
import type { Complex } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { optimizeNetworkValues, type NetOptimizeResult } from './netOptimizer.ts';
import { bomFor, type SnapPrefs } from './catalog.ts';
import type { ChainStageProgress } from './designChain.ts';

export interface SoloOptimizeOptions {
  /** EQ-band budget — hard cap, adopted seed bands included. Default 4. */
  eqBands?: number;
  /** Evaluation band, Hz. Default full grid minus edges. */
  band?: [number, number];
  /** Stop escalating once the peak ±dB ripple target is met (full grid). */
  targets?: { rippleDb: number };
  /**
   * FUNDAMENTAL — sensitivity budget (dB, default 6). How much median passband
   * level the correction may spend. HARD LEARNED (Sanders' first real solo run,
   * jul 2026): std-flatness is LEVEL-BLIND, so "throw away everything below
   * 10 kHz" flattens exactly as well as "tame the 5.6 kHz breakup" — and with
   * cut-only EQ the shelf is the CHEAPEST way to do it. His result: two
   * low-shelf cuts (33 Ω / 2.2 Ω series resistors, no coil in the schematic at
   * all), −15 dB below 10 kHz, Response score 0, peak ±19.9 dB — the engine
   * reported success because the wreckage was smooth. This is the solo
   * equivalent of the two-way dead-branch degeneration: a state no response
   * metric can see. Enforced as a FEASIBILITY constraint (candidate gate +
   * push-back in the refine, like the value windows), never as a quality nudge
   * in the objective — the anchor lesson.
   */
  sensitivityBudgetDb?: number;
  /**
   * ABSOLUTE SPL FLOOR (dB, in the loaded FRD's own scale) — Sanders' idea, and
   * a better-posed goal than the relative budget above. A cut-only network can
   * always go DOWN and never up, so "be flat at 95 dB" is exactly the shape of
   * problem passive filters can solve: every point above the floor gets cut to
   * it, every point below it is out of reach by definition. One number then
   * fixes BOTH things the relative budget needed two coupled parameters for —
   * how much level may be spent, and how far the designable band reaches.
   * The objective becomes deviation from a FIXED target instead of spread
   * around a floating mean, which is why it needs no level guard at all.
   * When set, this REPLACES sensitivityBudgetDb.
   */
  targetLevelDb?: number;
  maxIterations?: number;
}

export interface SoloStage {
  label: string;
  ripplePeakDb: number;
  avgDevDb: number;
}

export interface SoloOptimizeResult {
  spec: DriverFilterSpec;
  before: { ripplePeakDb: number; avgDevDb: number };
  after: { ripplePeakDb: number; avgDevDb: number };
  /** Trederapport: what each added band bought (full-grid numbers). */
  stages: SoloStage[];
  evaluations: number;
  /** Final full-grid search objective (band std) — chain-comparison yardstick. */
  objective: number;
  /** Median passband level the correction costs (dB, ≥0) — what flatness was
   *  paid for. Reported so the trade is visible instead of discovered later. */
  sensitivityCostDb: number;
  /** The deepest DIP left in the corrected response (dB below its median, and
   *  where). Cut-only cannot lift a dip: the only "fix" is attenuating
   *  everything else, which the sensitivity budget forbids — so a dip is the
   *  honest floor on flatness. Reported so a mediocre score reads as physics
   *  ("that region is not this driver's job") instead of a failed optimizer.
   *  null when nothing meaningful is left. */
  dipLimit: { db: number; hz: number } | null;
  /** The band actually DESIGNED on (Hz) — the requested band minus dead edges
   *  the correction cannot reach (see designBandFor). Equal to the requested
   *  band when nothing was trimmed. Scoring/reporting still covers the full
   *  requested band: the designer keeps seeing the whole truth. */
  designBand: [number, number];
  /** Raw driver and designed result, both measured over the DESIGN band —
   *  the honest pair to quote together. Mixing a whole-range "before" with an
   *  in-band "after" flatters the run by exactly the size of the cliff. */
  inBandBefore: { ripplePeakDb: number; avgDevDb: number };
  inBandAfter: { ripplePeakDb: number; avgDevDb: number };
}

/**
 * The band a cut-only correction can actually WORK on: the requested band
 * minus dead EDGES — the outermost region where the driver sits more than
 * `budgetDb` below its own median.
 *
 * Why (Sanders' fullranger, jul 2026): "smaller view range" is no answer when
 * the driver genuinely has to cover the whole range — but a 30 dB cliff above
 * 10 kHz cannot be flattened by cutting, only *approached* by throwing away
 * 30 dB everywhere, which the sensitivity budget rightly forbids. Trying
 * anyway wastes the band budget and the sensitivity on the one region that
 * can never improve. So: design where design is possible, keep SCORING the
 * whole requested band (the designer must keep seeing the cliff), and say
 * which band was used.
 *
 * The threshold IS the sensitivity budget, which makes it self-consistent:
 * a region you cannot afford to bring the rest down to is out of reach by
 * definition. A gentle baffle-step deficit (a few dB) therefore stays IN
 * scope — cutting the top to match it is legitimate, standard practice.
 * Only the OUTERMOST reachable points bound the band, so a mid-band dip is
 * never carved out: you live with those, and the score shows them.
 */
export function designBandFor(
  freqs: readonly number[],
  spl: readonly number[],
  band: [number, number],
  budgetDb: number,
): [number, number] {
  const ids: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] >= band[0] && freqs[i] <= band[1]) ids.push(i);
  }
  if (ids.length < 8) return band;
  const sorted = ids.map((i) => spl[i]).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const thr = median - budgetDb;
  const alive = ids.filter((i) => spl[i] >= thr);
  if (alive.length < 8) return band;
  const lo = Math.max(band[0], freqs[alive[0]]);
  const hi = Math.min(band[1], freqs[alive[alive.length - 1]]);
  // Never hand back a sliver: if less than an octave survives, something is
  // odd about the measurement — design the requested band and report honestly.
  return hi > lo * 2 ? [lo, hi] : band;
}

/**
 * FLOOR MODE band: the contiguous span where the raw driver sits AT or ABOVE
 * an absolute target level, i.e. the region a cut-only network can actually
 * bring down to that level. Below the floor there is nothing to do — passive
 * filters cannot lift. Outermost reachable points bound the band (a dip in the
 * middle stays in scope and shows up in the score, same doctrine as
 * designBandFor).
 */
export function reachableBandFor(
  freqs: readonly number[],
  spl: readonly number[],
  band: [number, number],
  floorDb: number,
): [number, number] {
  const ids: number[] = [];
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] >= band[0] && freqs[i] <= band[1]) ids.push(i);
  }
  const alive = ids.filter((i) => spl[i] >= floorDb);
  if (alive.length < 8) return band;
  const lo = Math.max(band[0], freqs[alive[0]]);
  const hi = Math.min(band[1], freqs[alive[alive.length - 1]]);
  return hi > lo * 1.5 ? [lo, hi] : band;
}

const cloneSpec = (s: DriverFilterSpec): DriverFilterSpec => ({
  ...s,
  hp: { ...s.hp },
  lp: { ...s.lp },
  eq: s.eq.map((b) => ({ ...b })),
});

export function optimizeSoloFilter(
  grid: readonly number[],
  driver: GriddedResponse,
  seedSpec: DriverFilterSpec,
  opts: SoloOptimizeOptions = {},
): SoloOptimizeResult {
  const budget = Math.max(0, Math.min(8, opts.eqBands ?? 4));
  /** What the designer asked to see and be judged on. */
  const reqBand: [number, number] = opts.band ?? [grid[0] * 1.02, grid[grid.length - 1] * 0.975];
  /** FLOOR MODE (Sanders): an absolute target level. The goal is then "be flat
   *  AT this level", and the designable band is simply where the driver can
   *  reach it — no relative budget, no level guard needed. */
  const floorDb = opts.targetLevelDb;
  const sensBudget = floorDb !== undefined
    ? Infinity // the floor governs the level; nothing else may cap it
    : Math.max(0, opts.sensitivityBudgetDb ?? 6);
  /** What can actually be designed: in floor mode the region the driver can be
   *  cut down TO (raw ≥ floor); otherwise the requested band minus dead edges.
   *  Everything in the SEARCH uses this; every reported number uses reqBand,
   *  so the unreachable part stays visible. */
  const band =
    floorDb !== undefined
      ? reachableBandFor(grid, driver.spl, reqBand, floorDb)
      : designBandFor(grid, driver.spl, reqBand, sensBudget);
  let evaluations = 0;

  // Decimated inner grid for the search; full grid for stages/audit/report —
  // same split as the component tuner (netOptimizer).
  const step = Math.max(1, Math.floor(grid.length / 150));
  const idx: number[] = [];
  for (let i = 0; i < grid.length; i += step) idx.push(i);
  const optFreq = idx.map((i) => grid[i]);
  const optSpl = idx.map((i) => driver.spl[i]);

  /** Filtered response magnitude on a grid (dB). */
  const respOn = (
    spec: DriverFilterSpec,
    freqs: readonly number[],
    baseSpl: readonly number[],
  ): number[] => {
    evaluations++;
    const h = evalDriverFilter(spec, freqs);
    return baseSpl.map((s, i) => s + 20 * Math.log10(Math.hypot(h[i].re, h[i].im) || 1e-12));
  };

  const idsIn = (freqs: readonly number[], b: readonly [number, number]) =>
    freqs.map((f, i) => (f >= b[0] && f <= b[1] ? i : -1)).filter((i) => i >= 0);
  /** Indices inside the DESIGN band (what the search works on). */
  const inBand = (freqs: readonly number[]) => idsIn(freqs, band);

  const statsIn = (
    b: readonly [number, number],
    freqs: readonly number[],
    spl: readonly number[],
  ): { std: number; avg: number; peak: number; mean: number } => {
    const ids = idsIn(freqs, b);
    let s = 0;
    for (const i of ids) s += spl[i];
    // FLOOR MODE: the reference is the FIXED target, not the band's own mean.
    // That is the whole point — a floating mean lets "flatness" be bought by
    // moving the mean (level-blind), a fixed target cannot be gamed.
    const mean = floorDb !== undefined ? floorDb : s / Math.max(1, ids.length);
    let sq = 0;
    let abs = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of ids) {
      const d = spl[i] - mean;
      sq += d * d;
      abs += Math.abs(d);
      if (spl[i] < lo) lo = spl[i];
      if (spl[i] > hi) hi = spl[i];
    }
    const n = Math.max(1, ids.length);
    return {
      std: Math.sqrt(sq / n),
      avg: abs / n,
      peak: Number.isFinite(lo) && hi > lo ? (hi - lo) / 2 : 0,
      mean,
    };
  };

  /** Search-side stats: DESIGN band. */
  const stats = (freqs: readonly number[], spl: readonly number[]) => statsIn(band, freqs, spl);
  const innerStd = (spec: DriverFilterSpec): number => stats(optFreq, respOn(spec, optFreq, optSpl)).std;
  /** Report-side stats: the full REQUESTED band — the designer is judged on
   *  what they asked to see, including the part no filter can reach. */
  const fullStats = (spec: DriverFilterSpec) => statsIn(reqBand, grid, respOn(spec, grid, driver.spl));

  /** MEDIAN passband level over the band — the level reference for the
   *  sensitivity budget. Median, not mean: a deep narrow notch (the whole
   *  point of the exercise) must not read as "lost sensitivity", while a
   *  broad shelf cut moves the median and does. */
  const medianLevel = (freqs: readonly number[], spl: readonly number[]): number => {
    const vals = inBand(freqs).map((i) => spl[i]).sort((a, b) => a - b);
    if (vals.length === 0) return 0;
    const m = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
  };
  const rawMedianInner = medianLevel(optFreq, optSpl);
  const rawMedianFull = medianLevel(grid, driver.spl);
  /** Sensitivity spent by a spec (dB, ≥0) on the inner grid. */
  const costOf = (s: DriverFilterSpec): number =>
    Math.max(0, rawMedianInner - medianLevel(optFreq, respOn(s, optFreq, optSpl)));
  const costOfFull = (s: DriverFilterSpec): number =>
    Math.max(0, rawMedianFull - medianLevel(grid, respOn(s, grid, driver.spl)));

  // Seed: adopt the user's spec as-is, EQ boosts clamped to 0 (cut-only).
  const spec = cloneSpec(seedSpec);
  spec.eq = spec.eq.map((b) => ({ ...b, gainDb: Math.min(0, b.gainDb) }));
  // FLOOR MODE needs a LEVEL element: bringing a 130 dB passband to a 95 dB
  // floor is a pad, not an EQ band. Seed the overall gain at the distance to
  // the floor and let the refine tune it (realized as a series resistor by
  // buildSoloNetwork). Without this the engine has no way to reach the floor
  // at all and the bands waste themselves trying.
  if (floorDb !== undefined) {
    spec.gainDb = Math.max(-40, Math.min(0, floorDb - rawMedianInner));
  }

  /** Joint NM refinement of ALL enabled EQ bands (freq/gain/Q in log space,
   *  gain clamped ≤ 0 with a push-back penalty). Never worse than its seed. */
  const refine = (s: DriverFilterSpec, budgetScale = 1): DriverFilterSpec => {
    const bands = s.eq.filter((b) => b.enabled);
    // Floor mode always has something to fit — the level element — even with
    // no bands at all.
    if (bands.length === 0 && floorDb === undefined) return s;
    const x0: number[] = [];
    for (const b of bands) x0.push(Math.log10(b.freq), b.gainDb, Math.log10(b.q));
    const gi = x0.length; // index of the overall-gain parameter (floor mode)
    if (floorDb !== undefined) x0.push(s.gainDb);
    const apply = (x: readonly number[]): DriverFilterSpec => {
      const out = cloneSpec(s);
      if (floorDb !== undefined) out.gainDb = Math.max(-40, Math.min(0, x[gi]));
      let j = 0;
      for (const b of out.eq) {
        if (!b.enabled) continue;
        const f = 10 ** x[j * 3];
        b.freq = Math.min(band[1] * 1.2, Math.max(band[0] * 0.8, f));
        b.gainDb = Math.min(0, Math.max(-18, x[j * 3 + 1]));
        // Q FLOOR per type: a 'peak' band exists to tame a resonance, so it
        // stays a notch (≥0.7). At the old 0.3 floor a "peak cut" degenerates
        // into broadband attenuation — the same level-blind wreckage the
        // sensitivity budget guards against, wearing a different hat.
        const qFloor = (b.type ?? 'peak') === 'peak' ? 0.7 : 0.3;
        b.q = Math.min(12, Math.max(qFloor, 10 ** x[j * 3 + 2]));
        j++;
      }
      return out;
    };
    const objective = (x: readonly number[]): number => {
      let pen = 0;
      for (let j = 0; j < bands.length; j++) pen += 2 * Math.max(0, x[j * 3 + 1]) ** 2;
      const trial = apply(x);
      // Sensitivity budget as a FEASIBILITY push-back (like the value windows
      // in the component tuner): inside the budget it contributes nothing, so
      // the search path in the healthy region is untouched.
      const over = Math.max(0, costOf(trial) - sensBudget);
      return innerStd(trial) + pen + 4 * over * over;
    };
    const iters = Math.round((opts.maxIterations ?? 400) * budgetScale * Math.max(1, bands.length / 2));
    let fit = nelderMead(objective, x0, { maxIterations: iters, tolerance: 1e-6, step: 0.08 });
    const again = nelderMead(objective, [...fit.x], { maxIterations: iters, tolerance: 1e-6, step: 0.2 });
    if (again.fx < fit.fx) fit = again;
    if (objective(x0) <= fit.fx) return s; // never worse than the seed values
    return apply(fit.x);
  };

  const stages: SoloStage[] = [];
  const before = fullStats(spec);
  const pushStage = (label: string) => {
    const m = fullStats(cur);
    stages.push({ label, ripplePeakDb: m.peak, avgDevDb: m.avg });
    return m;
  };

  let cur = spec;
  // Stage: refine adopted user bands first (user settings are seeds).
  if (cur.eq.some((b) => b.enabled)) {
    cur = refine(cur);
    pushStage('seed bands refined');
  } else {
    stages.push({ label: 'raw driver', ripplePeakDb: before.peak, avgDevDb: before.avg });
  }

  const meets = (): boolean => {
    if (!opts.targets) return false;
    return fullStats(cur).peak <= opts.targets.rippleDb;
  };

  /** Candidate seeds against the CURRENT filtered response: the worst peak
   *  above the band mean (notch food) and shelf-cuts for a half-band tilt. */
  const candidates = (): EqBandSpec[] => {
    const spl = respOn(cur, optFreq, optSpl);
    const ids = inBand(optFreq);
    // SHAPE reference is the response's OWN mean, even in floor mode — the
    // level offset is the gain element's job. HARD LEARNED (verified in the
    // app on Robbert's 12W8524): measuring prominence against the fixed floor
    // makes the whole band read as "15 dB too loud", so the tilt/shelf
    // candidate wins every round and stacks up broadband cuts — three
    // low-shelf cuts and no notch on the 7 kHz breakup, worse with 4 bands
    // than with 2. Level is a level problem; bands are for shape.
    const shapeMean = ids.reduce((a, i) => a + spl[i], 0) / Math.max(1, ids.length);
    const m = { ...stats(optFreq, spl), mean: shapeMean };
    const out: EqBandSpec[] = [];
    // (a) Peak cut: max positive deviation, Q from the half-prominence width.
    let pi = -1;
    for (const i of ids) if (pi < 0 || spl[i] > spl[pi]) pi = i;
    if (pi >= 0 && spl[pi] - m.mean > 0.4) {
      const prom = spl[pi] - m.mean;
      let loF = optFreq[ids[0]];
      let hiF = optFreq[ids[ids.length - 1]];
      for (let i = pi; i >= ids[0]; i--) if (spl[i] < m.mean + prom / 2) { loF = optFreq[i]; break; }
      for (let i = pi; i <= ids[ids.length - 1]; i++) if (spl[i] < m.mean + prom / 2) { hiF = optFreq[i]; break; }
      const bw = Math.max(1.05, hiF / loF);
      const q = Math.min(8, Math.max(0.7, optFreq[pi] / (optFreq[pi] * (bw - 1))));
      out.push({ enabled: true, type: 'peak', freq: optFreq[pi], gainDb: -Math.min(12, prom), q });
    }
    // (b/c) Shelf cuts: whichever half of the band runs hot gets pulled down.
    let loSum = 0;
    let loN = 0;
    let hiSum = 0;
    let hiN = 0;
    const split = Math.sqrt(band[0] * band[1]);
    for (const i of ids) {
      if (optFreq[i] < split) { loSum += spl[i]; loN++; }
      else { hiSum += spl[i]; hiN++; }
    }
    if (loN > 3 && hiN > 3) {
      const tilt = hiSum / hiN - loSum / loN;
      // A shelf may never propose more cut than the REMAINING sensitivity
      // budget: a shelf moves the median by roughly its own depth, so an
      // unbounded seed walks straight into the wreckage case.
      const room = Math.max(0, sensBudget - costOf(cur));
      const depth = (want: number) => Math.min(10, want, room);
      if (tilt > 0.8 && room > 0.3) {
        out.push({ enabled: true, type: 'highShelf', freq: split, gainDb: -depth(tilt), q: 0.7 });
      } else if (tilt < -0.8 && room > 0.3) {
        out.push({ enabled: true, type: 'lowShelf', freq: split, gainDb: -depth(-tilt), q: 0.7 });
      }
    }
    return out;
  };

  // Greedy escalation: add the best-paying candidate while the budget lasts,
  // each acceptance must improve the inner objective ≥ 1%; targets met = done.
  while (cur.eq.filter((b) => b.enabled).length < budget && !meets()) {
    const baseFx = innerStd(cur);
    let best: { spec: DriverFilterSpec; fx: number; label: string } | null = null;
    for (const cand of candidates()) {
      const trial = cloneSpec(cur);
      trial.eq = [...trial.eq.filter((b) => b.enabled), cand];
      const refined = refine(trial, 0.7);
      // GATE: flatness bought beyond the sensitivity budget is not a design,
      // it is attenuation. Rejected outright, however good the metric looks.
      if (costOf(refined) > sensBudget + 1e-9) continue;
      const fx = innerStd(refined);
      if (!best || fx < best.fx) {
        const kind = cand.type === 'peak' ? 'notch' : cand.type === 'highShelf' ? 'high-shelf cut' : 'low-shelf cut';
        best = { spec: refined, fx, label: `${kind} @ ${Math.round(cand.freq)} Hz` };
      }
    }
    if (!best || best.fx > baseFx * 0.99) break; // nothing pays ≥1% — done
    cur = best.spec;
    pushStage(best.label);
  }

  // Final joint polish, then the FULL-GRID band audit: a band tuned on the
  // decimated grid must still pay ≥0.5% out there, or it is overfit and goes.
  cur = refine(cur);
  {
    const fullStd = (s: DriverFilterSpec): number => stats(grid, respOn(s, grid, driver.spl)).std;
    let audited = true;
    while (audited) {
      audited = false;
      const curStd = fullStd(cur);
      for (let i = 0; i < cur.eq.length; i++) {
        if (!cur.eq[i].enabled || cur.eq[i].gainDb === 0) continue;
        const without = cloneSpec(cur);
        without.eq = cur.eq.filter((_, j) => j !== i);
        if (fullStd(without) <= curStd * 1.005) {
          cur = without;
          audited = true;
          break;
        }
      }
    }
  }

  // Never worse than the (clamped) seed on the full grid — and never over
  // budget: a refine that walked past the sensitivity cap loses to the seed.
  const seedClamped = cloneSpec(spec);
  const finalStd = stats(grid, respOn(cur, grid, driver.spl)).std;
  const seedStd = stats(grid, respOn(seedClamped, grid, driver.spl)).std;
  if (seedStd < finalStd || costOfFull(cur) > sensBudget + 0.5) cur = seedClamped;

  const after = fullStats(cur);
  // What still limits the result: the deepest remaining dip below the median.
  const finalSpl = respOn(cur, grid, driver.spl);
  const finalMed = medianLevel(grid, finalSpl);
  let dipLimit: { db: number; hz: number } | null = null;
  // Judged over the REQUESTED band: the cliff outside the design band is
  // exactly what the designer needs to be told about.
  for (const i of idsIn(grid, reqBand)) {
    const below = finalMed - finalSpl[i];
    if (below > 2 && (!dipLimit || below > dipLimit.db)) dipLimit = { db: below, hz: grid[i] };
  }
  return {
    spec: cur,
    before: { ripplePeakDb: before.peak, avgDevDb: before.avg },
    after: { ripplePeakDb: after.peak, avgDevDb: after.avg },
    stages,
    evaluations,
    objective: Math.min(finalStd, seedStd),
    sensitivityCostDb: costOfFull(cur),
    dipLimit,
    designBand: band,
    inBandBefore: (() => {
      const m = statsIn(band, grid, driver.spl);
      return { ripplePeakDb: m.peak, avgDevDb: m.avg };
    })(),
    inBandAfter: (() => {
      const m = statsIn(band, grid, finalSpl);
      return { ripplePeakDb: m.peak, avgDevDb: m.avg };
    })(),
  };
}

/* ------------------------------------------------------------------------- */

/**
 * SOLO passive topology — the classic fullranger correction circuit, and a
 * DIFFERENT structure from the two-way branch synthesis. HARD LEARNED (the
 * first chain attempt reused the two-way notch synthesis): a shunt trap to
 * ground does NOTHING against an ideal voltage source — in a crossover the
 * ladder's series elements provide the source impedance the shunt works
 * against, but a solo driver has no ladder. Single-driver correction lives
 * IN the series path:
 *  - peak cut  → PARALLEL LCR trap in series with the driver;
 *  - highShelf → series L with parallel R (baffle-step / tilt);
 *  - lowShelf  → series C with parallel R;
 *  - gated Zobel (R+C across the driver) when |Z| rises through the band —
 *    the rising voice-coil impedance otherwise defeats every series element
 *    (same 1.3× gate as the two-way synthesis doctrine).
 * Values are textbook seeds against the measured |Z|; the assembled SOLO
 * netTune is the real fit (structure by the designer/engine, values by the
 * tuner — the "Add notch + Optimize components" flow, automated).
 */
export function buildSoloNetwork(
  spec: DriverFilterSpec,
  grid: readonly number[],
  z: readonly Complex[],
  model: 'mid' | 'tweeter',
): { parts: VxpPart[]; structure: string[] } {
  const zMag = (f: number): number => {
    let best = 0;
    for (let i = 1; i < grid.length; i++) if (Math.abs(grid[i] - f) < Math.abs(grid[best] - f)) best = i;
    return Math.hypot(z[best].re, z[best].im);
  };
  const structure: string[] = [];
  const parts: VxpPart[] = [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
  ];
  let nL = 0;
  let nC = 0;
  let nR = 0;
  let x = 3;
  const bus = (to: number) => {
    if (to > x) parts.push({ type: 'Wire', params: [], wires: [{ x, y: 4 }, { x: to, y: 4 }] });
    x = to;
  };
  const el = (
    kind: 'L' | 'C' | 'R',
    si: number,
    wires: [{ x: number; y: number }, { x: number; y: number }],
  ): VxpPart => {
    const id = kind === 'L' ? `L${++nL}` : kind === 'C' ? `C${++nC}` : `R${++nR}`;
    const u = kind === 'L' ? { name: 'L', factor: 1e3, unit: 'mH' } : kind === 'C' ? { name: 'C', factor: 1e6, unit: 'uF' } : { name: 'R', factor: 1, unit: 'Ω' };
    const type = kind === 'L' ? 'Inductor' : kind === 'C' ? 'Capacitor' : 'Resistor';
    return {
      type: type as VxpPart['type'],
      partId: id,
      params: [{ name: u.name, value: Number((si * u.factor).toPrecision(4)), unit: u.unit }],
      wires,
    };
  };
  /** A series group: main element on the bus + parallel companions as loops
   *  below (chained stub wires — wires connect only at their POINTS).
   *  Rows are 4 apart, not 3: at 3 the id of one member landed on the value
   *  label of the next (Sanders' screenshot — "0.15 mH" written through
   *  "C5"). Same lesson the shunt spreader learned in the two-way layout. */
  const seriesGroup = (members: Array<{ kind: 'L' | 'C' | 'R'; si: number }>) => {
    // Never start a group on the generator's column: its symbol spans y 4→11,
    // so stacked members would be drawn straight through it.
    if (x <= 3) bus(6);
    const A = x;
    const B = x + 6;
    const ROW = 4;
    members.forEach((m, i) => {
      const y = 4 + i * ROW;
      if (i > 0) {
        parts.push({ type: 'Wire', params: [], wires: [{ x: A, y: y - ROW }, { x: A, y }] });
        parts.push({ type: 'Wire', params: [], wires: [{ x: B, y: y - ROW }, { x: B, y }] });
      }
      parts.push(el(m.kind, m.si, [{ x: A, y }, { x: B, y }]));
    });
    x = B;
  };
  // LEVEL element first: a negative overall gain is a PAD, realized as a plain
  // series resistor sized on |Z| at the band centre. (Floor mode leans on this
  // — an EQ band cannot move a whole passband to a target level.) A single
  // resistor tracks the driver's Z rather than being perfectly flat; the traps
  // and the component tuner absorb the residual shape, which is cheaper in
  // parts than a full L-pad.
  if (spec.gainDb < -0.2) {
    const fMid = Math.sqrt(grid[0] * grid[grid.length - 1]);
    const zd = zMag(fMid);
    const a = 10 ** (spec.gainDb / 20); // 0 < a < 1
    const R = Math.max(0.22, Math.min(220, zd * (1 / a - 1)));
    seriesGroup([{ kind: 'R', si: R }]);
    structure.push(`series pad ${R.toFixed(1)} Ω (${spec.gainDb.toFixed(1)} dB to the target level)`);
    bus(x + 3);
  }
  const bands = spec.eq
    .filter((b) => b.enabled && b.gainDb < 0)
    .sort((a, b) => a.freq - b.freq);
  for (const b of bands) {
    const depth = -b.gainDb;
    const zd = zMag(b.freq);
    const w0 = 2 * Math.PI * b.freq;
    if ((b.type ?? 'peak') === 'peak') {
      // Parallel LCR in the series path: R sets the depth against |Z|(f0),
      // the L/C ratio sets the width (seeded from the band Q).
      const R = Math.max(0.5, zd * (10 ** (depth / 20) - 1));
      const L = Math.max(0.02e-3, R / (w0 * Math.max(0.5, b.q)));
      const C = 1 / (w0 * w0 * L);
      seriesGroup([{ kind: 'L', si: L }, { kind: 'C', si: C }, { kind: 'R', si: R }]);
      structure.push(`series LCR trap @ ${Math.round(b.freq)} Hz (−${depth.toFixed(1)} dB)`);
    } else if (b.type === 'highShelf') {
      const R = Math.max(0.5, zd * (10 ** (depth / 20) - 1));
      const L = R / w0;
      seriesGroup([{ kind: 'L', si: Math.max(0.05e-3, L) }, { kind: 'R', si: R }]);
      structure.push(`series L ∥ R shelf @ ${Math.round(b.freq)} Hz (−${depth.toFixed(1)} dB HF)`);
    } else {
      const R = Math.max(0.5, zd * (10 ** (depth / 20) - 1));
      const C = 1 / (w0 * R);
      seriesGroup([{ kind: 'C', si: Math.min(100e-6, C) }, { kind: 'R', si: R }]);
      structure.push(`series C ∥ R shelf @ ${Math.round(b.freq)} Hz (−${depth.toFixed(1)} dB LF)`);
    }
    bus(x + 3);
  }
  // Driver leg.
  const xd = Math.max(x + 3, 12);
  bus(xd);
  parts.push({
    type: 'Driver',
    partId: 'D1',
    model,
    inverted: false,
    params: [],
    wires: [{ x: xd, y: 4 }, { x: xd, y: 11 }],
  });
  parts.push({ type: 'Ground', params: [], wires: [{ x: xd, y: 11 }] });
  // Gated Zobel across the driver: |Z| rising ≥1.3× from its band minimum
  // defeats the series elements above — classic gate, textbook seed.
  {
    const inBand = grid.map((f, i) => ({ f, i })).filter(({ f }) => f >= 300 && f <= grid[grid.length - 1]);
    let zLo = Infinity;
    let zHi = 0;
    let fHi = 0;
    for (const { f, i } of inBand) {
      const m = Math.hypot(z[i].re, z[i].im);
      if (m < zLo) zLo = m;
      if (m > zHi && f > 800) {
        zHi = m;
        fHi = f;
      }
    }
    if (bands.length > 0 && Number.isFinite(zLo) && zHi > 1.3 * zLo) {
      const R = Math.max(1, 1.25 * zLo);
      // Corner where the rise starts to matter: seed from the geometric mean
      // of the band; the tuner refines.
      const fz = Math.max(1000, Math.min(fHi, 4000));
      const C = 1 / (2 * Math.PI * fz * R);
      const xz = xd + 5;
      parts.push({ type: 'Wire', params: [], wires: [{ x: xd, y: 4 }, { x: xz, y: 4 }] });
      parts.push(el('R', R, [{ x: xz, y: 4 }, { x: xz, y: 8 }]));
      parts.push(el('C', C, [{ x: xz, y: 8 }, { x: xz, y: 12 }]));
      parts.push({ type: 'Ground', params: [], wires: [{ x: xz, y: 12 }] });
      structure.push(`Zobel across driver (|Z| rises ${(zHi / zLo).toFixed(1)}×)`);
    }
  }
  return { parts, structure };
}

export interface SoloChainSettings {
  eqBands: number;
  band: [number, number];
  targets?: { rippleDb: number };
  /** Absolute SPL target level (dB, FRD scale) — see SoloOptimizeOptions. */
  targetLevelDb?: number;
  /** Sensitivity budget (dB, default 6) — see SoloOptimizeOptions. Governs the
   *  design stage AND the assembled tune, so both work to the same rule. */
  sensitivityBudgetDb?: number;
  catalogSnap?: boolean;
  snapPrefs?: SnapPrefs;
  maxIterations?: number;
  /** Full-measurement-band safety data (amp-load floor on the whole grid). */
  safety?: { freqs: readonly number[]; d: GriddedResponse; z: readonly Complex[] };
}

export interface SoloChainInput {
  grid: readonly number[];
  /** The solo driver's measured response on `grid`. */
  d: GriddedResponse;
  /** Its measured impedance on `grid`. */
  z: readonly Complex[];
  /** Which slot the driver occupies — determines the synthesized branch model. */
  model: 'mid' | 'tweeter';
  seed: DriverFilterSpec;
  settings: SoloChainSettings;
}

export interface SoloChainResult {
  vf: SoloOptimizeResult;
  /** Human-readable structure report of the built topology. */
  structure: string[];
  /** The assembled, TUNED single-branch network. */
  parts: VxpPart[];
  net: NetOptimizeResult;
  bomTotalEur: number | null;
}

/** Silent ghost for the unused slot — same convention as the App's sim. */
const silentGhost = (freqs: readonly number[]): GriddedResponse => ({
  freq: [...freqs],
  spl: freqs.map(() => -400),
  phaseDeg: freqs.map(() => 0),
});

/**
 * Full solo chain, one deterministic unit (mirrors runDesignChain):
 *   solo flatten (EQ/shelf design) → build the SOLO topology (series traps /
 *   shelf groups / gated Zobel — see buildSoloNetwork) → assembled solo
 *   netTune. Structure comes from the engine, values from the tuner against
 *   the real measurement — the "Add notch + Optimize components" flow,
 *   automated.
 */
export function runSoloChain(
  input: SoloChainInput,
  onProgress?: (p: ChainStageProgress) => void,
): SoloChainResult {
  const { grid, d, z, model, seed, settings: s } = input;

  onProgress?.({ stage: 'design', evals: 0 });
  const vf = optimizeSoloFilter(grid, d, seed, {
    eqBands: s.eqBands,
    band: s.band,
    targets: s.targets,
    sensitivityBudgetDb: s.sensitivityBudgetDb,
    targetLevelDb: s.targetLevelDb,
    maxIterations: s.maxIterations,
  });
  onProgress?.({
    stage: 'design',
    round: 1,
    evals: vf.evaluations,
    rippleDb: vf.after.ripplePeakDb,
  });

  onProgress?.({ stage: 'synthesis', evals: vf.evaluations });
  const { parts: merged, structure } = buildSoloNetwork(vf.spec, grid, z, model);

  // Already-flat driver → no correction groups → nothing to tune: deliver the
  // bare generator+driver network honestly instead of tripping the tuner's
  // "everything is locked" error.
  if (!merged.some((p) => p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor')) {
    const flat = {
      rippleDb: vf.after.ripplePeakDb,
      avgDevDb: vf.after.avgDevDb,
      phaseDeg: 0,
    };
    return {
      vf,
      structure,
      parts: merged,
      net: {
        parts: merged,
        before: flat,
        after: { ...flat, xoHz: null },
        tuned: 0,
        evaluations: 0,
        removed: [],
        added: [],
      },
      bomTotalEur: bomFor(merged).totalEur,
    };
  }

  onProgress?.({ stage: 'tune', evals: vf.evaluations });
  const ghost = silentGhost(grid);
  const w = model === 'mid' ? d : ghost;
  const t = model === 'mid' ? ghost : d;
  const net = optimizeNetworkValues(
    merged,
    grid,
    w,
    t,
    { [model]: z },
    { offsetMm: 0, trimDb: 0, inverted: false },
    {
      solo: true,
      soloSensitivityDb: s.sensitivityBudgetDb,
      // Solo staged: the phase target is trivially met (phase metric is 0);
      // a huge value documents that only ripple gates here.
      staged: s.targets ? { rippleDb: s.targets.rippleDb, phaseDeg: 3600 } : undefined,
      catalogSnap: s.catalogSnap,
      snapPrefs: s.snapPrefs,
      // The tuner works the SAME designable band as the design stage — on the
      // requested band it would chase the unreachable cliff, blow the
      // sensitivity cap and get its whole tune rejected.
      band: vf.designBand,
      ...(s.safety
        ? {
            safety: {
              freqs: s.safety.freqs,
              w: model === 'mid' ? s.safety.d : silentGhost(s.safety.freqs),
              t: model === 'mid' ? silentGhost(s.safety.freqs) : s.safety.d,
              z: { [model]: s.safety.z },
            },
          }
        : {}),
      onStage: (detail) => onProgress?.({ stage: 'tune', evals: vf.evaluations, detail }),
    },
  );
  return { vf, structure, parts: net.parts, net, bomTotalEur: bomFor(net.parts).totalEur };
}
