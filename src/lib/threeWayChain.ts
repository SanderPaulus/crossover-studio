import type { Complex } from './complex.ts';
import type { DriverFilterSpec } from './filters.ts';
import { combine, type BranchAdjust, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { computeIntegration } from './integration.ts';
import { designThreeWay, type Struct3Choice } from './threeWayDesign.ts';
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
  /** Target acoustic slopes: mid/tweeter = the TOP pair, low = the LOW pair
   *  (woofer LP flank / mid HP flank). */
  acousticSlopes?: { mid?: number; tweeter?: number; low?: { lower?: number; upper?: number } };
  /** Designer pins for the two handovers (freq ± margin, Hz). A pinned axis
   *  collapses the candidate grid on that axis and HOLDS the crossing in the
   *  tune via the per-pair xo pin. */
  xoLowPin?: { freq: number; margin: number };
  xoHighPin?: { freq: number; margin: number };
  /** Tweeter HP floor (≥2×Fs, Hz): the design step never puts the high knee
   *  below it. */
  hpFloorHz?: number;
  /** BINDING alignment choice per crossing (the designer picks the
   *  foundation; knees, level and polarity stay free). Omit for the free
   *  enumeration over the library. */
  structureLow?: Struct3Choice;
  structureHigh?: Struct3Choice;
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
  /** This candidate's own CAGE per axis (from `crossover3Variants`). Holds the
   *  acoustic crossing through design AND tune; without it the tuner drifts
   *  the handover away from the knees the design step chose. */
  xoLowRange?: [number, number];
  xoHighRange?: [number, number];
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
  /** Polarities the design step CHOSE — the UI checkboxes must follow these,
   *  or the simulation sums a different design than the one that was fitted. */
  midInverted: boolean;
  tweeterInverted: boolean;
  /** Structure summary of the winning design ("LR4 @411 · BW3 @2520 · mid inv"). */
  structureLabel: string;
}

/** A branch is alive where its banded response is above the silent ghost. */
const ALIVE_DB = -300;

/** One full chain for one (xoLow, xoHigh) candidate. */
export function runThreeWayChain(
  input: Chain3Input,
  onProgress?: (p: ChainStageProgress) => void,
): Chain3Result {
  const { grid, w, m, t, driverZ, xoLow, xoHigh, settings: s } = input;

  /* ---- Target design: ALIGNMENT × POLARITY enumeration -------------------
   * Was: textbook LR4 on both crossings and polarity as loaded. Both are
   * decisions the component tuner can never repair (it moves values on a
   * fixed topology and a fixed polarity), and unlike the two-way chain there
   * is no EQ stage downstream to wash an alignment mistake out. The virtual
   * design step settles them on pure filter math — cheap enough to be
   * exhaustive (64 structures ≪ one network tune). ---- */
  onProgress?.({ stage: 'design', evals: 0, round: 1 });
  const design = designThreeWay({
    w,
    m,
    t,
    tAdjust: input.tAdjust,
    midAdjust: input.midAdjust,
    xoLow,
    xoHigh,
    band: s.band,
    phasePriority: s.phasePriority,
    // The candidate's cage IS the knee window — the design step and the tune
    // must agree on where this candidate's handovers live, or the tune spends
    // its budget undoing the design.
    xoLowWindow: input.xoLowRange,
    xoHighWindow: input.xoHighRange,
    hpFloorHz: s.hpFloorHz,
    structureLow: s.structureLow,
    structureHigh: s.structureHigh,
    breakupGuard: s.breakupGuard,
  });
  const specs = design.specs;
  // The chosen polarities become the branch adjustments everything downstream
  // sums with — synthesis fits per branch, the tune judges the assembled sum.
  const tAdjust: TweeterAdjust = { ...input.tAdjust, inverted: design.tweeterInverted };
  const midAdjust: BranchAdjust = { ...input.midAdjust, inverted: design.midInverted };

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
  const pinRange = (pin?: { freq: number; margin: number }): [number, number] | null =>
    pin ? [pin.freq - Math.max(pin.margin, pin.freq * 0.02), pin.freq + Math.max(pin.margin, pin.freq * 0.02)] : null;
  // The candidate's own cage wins over the raw designer pin: the scan already
  // subdivided that pin, and this candidate owns one slice of it.
  const lowCage = input.xoLowRange ?? pinRange(s.xoLowPin);
  const highCage = input.xoHighRange ?? pinRange(s.xoHighPin);
  const net = optimizeNetworkValues(merged, grid, w, t, driverZ, tAdjust, {
    midBranch: { response: m, adjust: midAdjust },
    phasePriority: s.phasePriority,
    breakupGuard: s.breakupGuard,
    acousticSlopes: s.acousticSlopes,
    xoRangePairs: [lowCage, highCage],
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
    midInverted: design.midInverted,
    tweeterInverted: design.tweeterInverted,
    structureLabel: design.label,
  };
}

export interface Chain3Variant {
  label: string;
  xoLow: number;
  xoHigh: number;
  /** The candidate's own CAGE per axis — held during the tune. */
  xoLowRange: [number, number];
  xoHighRange: [number, number];
}

/**
 * Subdivide [lo, hi] into `n` candidate centres, each caged in its own
 * ±half-spacing slice. The slices TILE the range exactly: nothing outside it,
 * neighbours never overlap — the two-way scan doctrine, in log space.
 *
 * n = 1 collapses to the geometric centre with the whole range as its cage.
 */
function sliceAxis(
  lo: number,
  hi: number,
  n: number,
): { centre: number; range: [number, number] }[] {
  const L = Math.log(lo);
  const H = Math.log(hi);
  if (!(H > L) || n <= 1) {
    return [{ centre: Math.exp((L + H) / 2), range: [lo, hi] }];
  }
  const step = (H - L) / (n - 1);
  const out: { centre: number; range: [number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const c = L + i * step;
    out.push({
      centre: Math.exp(c),
      range: [Math.exp(Math.max(L, c - step / 2)), Math.exp(Math.min(H, c + step / 2))],
    });
  }
  return out;
}

/**
 * 2D candidate grid over the two handovers.
 *
 * Each candidate carries its OWN cage per axis, pinned or not. Without one the
 * tuner drags the acoustic crossings wherever its objective marginally
 * prefers: measured on Robbert's set, a design with knees at 490/3000 Hz was
 * delivered crossing at 1256/6361 Hz — the mid-tweeter handover landing an
 * octave up, inside the mid's breakup, which is exactly where its phase falls
 * apart. This is the two-way "vrij schuivende kruisingen" lesson, which the
 * three-way chain had never been given.
 *
 * A pinned axis subdivides the PIN; a free axis subdivides the neighbourhood
 * of the raw crossing (×0.75 … ×1.4), where the unfiltered branch levels meet.
 * Clamped to sane territory and to xoHigh ≥ 2.5 × xoLow (a 3-way needs real
 * branch bands).
 */
export function crossover3Variants(
  w: GriddedResponse,
  m: GriddedResponse,
  t: GriddedResponse,
  pins?: { low?: { freq: number; margin: number }; high?: { freq: number; margin: number } },
  /** Tweeter HP floor (≥2×Fs, Hz): pushes the HIGH anchor up. A hot tweeter
   *  crosses the raw mid several octaves below a sensible handover (the old
   *  2-way lesson), which made every M-T candidate read like a W-M one. */
  hpFloorHz?: number,
  /** Candidate steps PER AXIS: 1/2/3 → 1/4/9 full chains. Runtime grows with
   *  the square, so this is the designer's cost knob. */
  steps = 2,
  /** PHYSICS window for the free W-M axis — the two-way saneFree recipe:
   *  floor = 2×Fs from the measured MID impedance (protects the mid's low
   *  end), ceiling = woofer cone beaming from its nominal size. W-M levels
   *  never truly cross on real sets (a mid sits below its woofer), so a
   *  level-based anchor is weak evidence there — physics bounds are the
   *  honest search space. Either side optional; the overlap anchor stays the
   *  fallback. A designer pin still overrides everything. */
  lowWindow?: { floorHz?: number | null; ceilHz?: number | null },
): Chain3Variant[] {
  /* Anchor = the raw pair's OVERLAP CENTRE — the same computeIntegration
   * number the panel's pair chips show ("Overlap 1631 / 5455 Hz"), so the
   * scan searches the neighbourhood the designer is already looking at.
   *
   * The first version used "first frequency where the upper driver's level
   * reaches the lower's" — with a HOT tweeter that is the bottom edge of the
   * search window (it is above the mid everywhere), and with a mid that sits
   * below the woofer through the whole low window it found nothing at all and
   * fell back to a geometric mean. Measured on Robbert's set the anchors came
   * out at 548/1800 Hz where the panel's overlap centres sit at 1631/5455 —
   * the scan searched the wrong neighbourhoods entirely, and the tuner kept
   * escaping toward the real handover region. One definition of "where the
   * drivers meet", shared with the display (the bandMetrics lesson). */
  const overlapAnchor = (lower: GriddedResponse, upper: GriddedResponse): number | null => {
    try {
      const c = computeIntegration(
        combine(lower, upper, { offsetMm: 0, trimDb: 0, inverted: false }),
      ).overlapCentreHz;
      return c !== null && Number.isFinite(c) ? c : null;
    } catch {
      return null;
    }
  };
  const rawLow = Math.min(1200, Math.max(250, overlapAnchor(w, m) ?? Math.sqrt(200 * 1500)));
  const rawHigh = Math.min(
    7000,
    Math.max(1800, overlapAnchor(m, t) ?? Math.sqrt(1200 * 9000), hpFloorHz ?? 0),
  );
  const n = Math.max(1, Math.round(steps));
  /** The searchable span of one axis: the pin when given, else the raw
   *  crossing's neighbourhood. Either way it gets SUBDIVIDED — a pin is a
   *  search space, not a single point (the two-way doctrine). */
  const span = (
    raw: number,
    pin: { freq: number; margin: number } | undefined,
  ): [number, number] => {
    if (!pin) return [raw * 0.75, raw * 1.4];
    const mrg = Math.max(pin.margin, pin.freq * 0.02);
    return [pin.freq - mrg, pin.freq + mrg];
  };
  /* Free low axis: physics bounds first (floor = 2×Fs mid, ceiling = woofer
   * beaming), the overlap-anchor neighbourhood for whichever side is missing.
   * A degenerate window (floor above ceiling: a big mid with a small woofer —
   * a design problem no scan can solve) falls back to the anchor entirely. */
  const freeLow = ((): [number, number] => {
    const floor = lowWindow?.floorHz ?? null;
    const ceil = lowWindow?.ceilHz ?? null;
    let lo = Math.max(250, floor ?? rawLow * 0.75);
    let hi = Math.min(1500, ceil ?? Math.min(1200, rawLow * 1.4));
    if (hi <= lo * 1.05) {
      // A single known PHYSICS bound beats a disagreeing level anchor (the
      // anchor is weak evidence on this axis): give the missing side an
      // octave of room from the bound instead of discarding it.
      if (floor !== null && ceil === null) hi = Math.min(1500, lo * 2);
      else if (ceil !== null && floor === null) lo = Math.max(250, hi / 2);
      // Both bounds known and in conflict (big mid + small woofer): a design
      // problem no scan can solve — fall back to the anchor neighbourhood.
      else return [rawLow * 0.75, Math.min(1200, rawLow * 1.4)];
    }
    return hi > lo * 1.05 ? [lo, hi] : [rawLow * 0.75, Math.min(1200, rawLow * 1.4)];
  })();
  const [lLo, lHi] = pins?.low ? span(rawLow, pins.low) : freeLow;
  const [hLo, hHi] = span(rawHigh, pins?.high);
  const out: Chain3Variant[] = [];
  for (const fl of sliceAxis(lLo, lHi, n)) {
    for (const fh of sliceAxis(hLo, hHi, n)) {
      // Low centre may reach 1500 (the design step's own knee ceiling): a
      // physics window from a small woofer legitimately sits above the old
      // 1200 cap, and a designer pin up to the UI's 2000 was crushed by it.
      const xoLow = Math.round(Math.min(1500, Math.max(250, fl.centre)));
      const xoHigh = Math.round(Math.min(8000, Math.max(xoLow * 2.5, Math.min(7000, fh.centre))));
      // The cage follows the same clamps as the centre, and never collapses
      // to a point: a zero-width range would make the xo penalty a cliff.
      const cage = (
        r: [number, number],
        centre: number,
        lo: number,
        hi: number,
      ): [number, number] => {
        const a = Math.min(Math.max(r[0], lo), hi);
        const b = Math.min(Math.max(r[1], lo), hi);
        const half = Math.max(centre * 0.02, (b - a) / 2);
        return [Math.min(a, centre - half), Math.max(b, centre + half)];
      };
      // The xoHigh ≥ 2.5 × xoLow clamp can push two adjacent steps onto the
      // SAME point (seen with steps=3: the 767 Hz row's two lowest high-steps
      // both clamped to 1918). That is a duplicate candidate: it burns a full
      // chain's runtime for a result already being computed, and — because the
      // scan's progress table is keyed by label — it silently loses a row, so
      // "9 candidates" would show as 8. One point, one candidate.
      if (out.some((o) => o.xoLow === xoLow && o.xoHigh === xoHigh)) continue;
      // Two crossover POINTS, labeled unambiguously — "411/2520 Hz" read as
      // one woofer-mid RANGE (Sanders' report).
      out.push({
        label: `W-M ${xoLow} · M-T ${xoHigh} Hz`,
        xoLow,
        xoHigh,
        xoLowRange: cage(fl.range, xoLow, 250, 1500),
        xoHighRange: cage(fh.range, xoHigh, xoLow * 2.5, 8000),
      });
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
  // Coupled pairs: the target must hold at the WORST pair — averaging would
  // let a good mid-tweeter crossing pay for a bad woofer-mid one.
  const worstPhase = (r: Chain3Result): number =>
    r.net.after.pairPhaseDeg && r.net.after.pairPhaseDeg.length > 0
      ? Math.max(...r.net.after.pairPhaseDeg)
      : r.net.after.phaseDeg;
  const meets = (r: Chain3Result): boolean =>
    !targets ||
    (r.net.after.rippleDb <= targets.rippleDb && worstPhase(r) <= targets.phaseDeg);
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
