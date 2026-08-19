/**
 * Full design chain as ONE deterministic, testable unit:
 *   vf-optimize (rounds) → passive synthesis per branch → assembled netTune.
 *
 * Why it exists (jul 2026, Sanders "meerdere varianten van het overgangspunt"):
 * the vf-stage ranking does NOT predict the final built-and-tuned ranking —
 * measured on KOAN: xo 1900±200 looked WORST at the vf stage (0.84 dB) and
 * became the BEST assembled result (0.33 dB/3.5°), while the 2100 pin looked
 * fine and ended 0.94 dB/12.5°. Picking a crossover point therefore requires
 * running the FULL chain per candidate and judging the end result — exactly
 * what `scanCrossoverPoints` does. Everything in here is deterministic: same
 * inputs → identical outputs, every run, every machine.
 */
import type { Complex } from './complex.ts';
import { applyTransfer, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import type { VxpPart } from './parsers/vxp.ts';
import type { AngleResponse } from './directivity.ts';
import {
  optimizeVfCluster,
  optimizeVirtualFilters,
  structureOf,
  type StructChoice,
  type VfOptimizeResult,
  type VfSpecs,
} from './vfOptimizer.ts';
import { synthesize, type SynthesisResult } from './synthesis.ts';
import { mergeSynthesizedSchematics } from './schematicEdit.ts';
import { optimizeNetworkValues, Z_FLOOR_OHM, type NetOptimizeResult } from './netOptimizer.ts';
import { bomFor, type SnapPrefs } from './catalog.ts';
import { evalDriverFilter, type DriverFilterSpec } from './filters.ts';

export interface ChainSettings {
  phasePriority: number; // 0..1
  eqBandsPerDriver: number;
  angleData?: { woofer: AngleResponse[]; tweeter: AngleResponse[] };
  directivityWeight?: number;
  /** Power-response metric (bandMetrics.powerShape) and fold weight — see netOptimizer opts. */
  powerMetric?: 'smooth' | 'legacy';
  powerFoldWeight?: number;
  /** Error smoothing width for the search objectives (oct); 0 = off. */
  errorSmoothOct?: number;
  /** Dissipation term weight in front of the lowest branch (fix 3a); 0 = off. */
  dissipationWeight?: number;
  /** Part-audit options (thresholds incl. the source-R limit, Fb) — forwarded to the tuner. */
  audit?: { enabled?: boolean; thresholds?: { rSourceOhm?: number }; fbHz?: number };
  ampTarget?: 'onAxis' | 'listeningWindow';
  cutOnly?: boolean;
  breakupGuard?: boolean;
  structurePreference?: StructChoice;
  targets?: { rippleDb: number; phaseDeg: number };
  hpFloorHz?: number;
  phaseMetric?: 'band' | 'overlap';
  acousticSlopes?: { mid?: number; tweeter?: number };
  band: [number, number];
  synthMode: 'filter' | 'acoustic';
  catalogSnap?: boolean;
  snapPrefs?: SnapPrefs;
  /** Full-measurement-band safety data for the assembled tune. */
  safety?: {
    freqs: readonly number[];
    w: GriddedResponse;
    t: GriddedResponse;
    z: Record<string, readonly Complex[]>;
  };
  /** Max vf rounds (re-seeded from best while a round pays ≥1%). */
  maxRounds?: number;
}

export interface ChainInput {
  grid: readonly number[];
  w: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, readonly Complex[]>;
  adjust: TweeterAdjust;
  seed: VfSpecs;
  settings: ChainSettings;
  xoRange?: [number, number];
  /** What the DELIVERED crossing is judged against in the ranking: the pin
   *  when the designer pinned it (a promise), else the measured physics
   *  window (2xFs / excursion floor, beaming / lobing ceiling). Distinct
   *  from xoRange, which is scan bookkeeping — the three-way lesson: a
   *  candidate drifting inside the window is fine, leaving it is not. */
  judgeWindow?: { floorHz?: number | null; ceilHz?: number | null } | null;
}

export interface ChainResult {
  label: string;
  xoRange?: [number, number];
  vf: VfOptimizeResult;
  rounds: number;
  evaluations: number;
  synthWoofer: SynthesisResult;
  synthTweeter: SynthesisResult;
  /** The assembled, TUNED network. */
  parts: VxpPart[];
  net: NetOptimizeResult;
  /** Catalog BOM total (€) of the tuned network; null without priced catalog. */
  bomTotalEur: number | null;
  /** Amplifier-load verdict of the DELIVERED network: false when the tune was
   *  rejected on the Z floor or the dip could not be repaired. RELATIVE — it
   *  says the tune did not make things worse, NOT that the load is sane. */
  zOk: boolean;
  /** Minimum system |Zin| the amplifier actually sees, ohms. The absolute
   *  companion to {@link zOk}, ranked as a CLASS. */
  zMinOhm: number | null;
  /** Delivered crossing inside its window/pin (null = nothing to judge). */
  xoWindowOk: boolean | null;
  /** Delivered phase-coherent overlap width, octaves. */
  overlapOct: number | null;
}

/** Fine-grained progress from inside one chain run — feeds the live busy
 *  counter ("alive feeling"): a tick per design round and per stage switch. */
export interface ChainStageProgress {
  stage: 'design' | 'synthesis' | 'tune';
  round?: number;
  evals: number;
  rippleDb?: number;
  phaseDeg?: number;
  /** Sub-stage detail from the assembled tune (value tune, prune, snap…). */
  detail?: string;
}

/** One full chain for one crossover-range candidate. */
export function runDesignChain(
  input: ChainInput,
  label = 'chain',
  onProgress?: (p: ChainStageProgress) => void,
): ChainResult {
  const { grid, w, t, driverZ, adjust, settings: s } = input;
  const vfOpts = {
    phasePriority: s.phasePriority,
    eqBandsPerDriver: s.eqBandsPerDriver,
    angleData: s.angleData,
    directivityWeight: s.directivityWeight,
    powerMetric: s.powerMetric,
    powerFoldWeight: s.powerFoldWeight,
    errorSmoothOct: s.errorSmoothOct,
    dissipationWeight: s.dissipationWeight,
    audit: s.audit,
    ampTarget: s.ampTarget,
    cutOnly: s.cutOnly,
    breakupGuard: s.breakupGuard,
    structurePreference: s.structurePreference,
    targets: s.targets,
    hpFloorHz: s.hpFloorHz,
    phaseMetric: s.phaseMetric,
    acousticSlopes: s.acousticSlopes,
    xoRange: input.xoRange,
    band: s.band,
  };
  // Round loop (was App-side): re-seed from the best while a round pays ≥1%.
  // Round 1 is a PRIORITY CLUSTER (setpoint ±5%) — a 5% priority nudge kicks
  // the search into a different, often better basin (Sander's 50→55% flip),
  // and ranking the cluster on the setpoint yardstick lets the optimizer land
  // in it by itself instead of the user hunting with the slider. The extra
  // cost is +2 vf runs for the whole chain: only round 1 clusters; the re-seed
  // rounds refine the winner at the user's priority.
  let best: VfOptimizeResult | null = null;
  let seed = input.seed;
  let seedInv = adjust.inverted;
  let rounds = 0;
  let evaluations = 0;
  const maxRounds = s.maxRounds ?? 12;
  for (let i = 0; i < maxRounds; i++) {
    let r: VfOptimizeResult;
    if (i === 0) {
      const cl = optimizeVfCluster(grid, w, t, seed, { ...adjust, inverted: seedInv }, vfOpts);
      r = cl.best;
      evaluations += cl.evaluations;
      rounds += cl.runs;
    } else {
      // Re-seed round: fix the structure to round 1's winner — refining it
      // costs ~2 descents instead of re-enumerating all 32 every round for a
      // structure that virtually never changes this deep in the search.
      r = optimizeVirtualFilters(
        grid,
        w,
        t,
        seed,
        { ...adjust, inverted: seedInv },
        { ...vfOpts, fixedStructure: structureOf(best!) },
      );
      evaluations += r.evaluations;
      rounds++;
    }
    const improved = !best || r.objective < best.objective * 0.99;
    if (!best || r.objective < best.objective) best = r;
    onProgress?.({
      stage: 'design',
      round: rounds,
      evals: evaluations,
      rippleDb: best.after.responseStdDb,
      phaseDeg: best.after.avgPhaseErrDeg,
    });
    if (!improved) break;
    seed = best.specs;
    seedInv = best.inverted;
  }
  const b = best!;
  onProgress?.({ stage: 'synthesis', evals: evaluations });

  // Synthesis per branch — passives cannot boost: shift gains to attenuation.
  const gShift = Math.max(b.specs.woofer.gainDb, b.specs.tweeter.gainDb, 0);
  const shifted = (spec: DriverFilterSpec): DriverFilterSpec => ({
    ...spec,
    gainDb: Math.round((spec.gainDb - gShift) * 10) / 10,
  });
  // Position doctrine, measured on Sanders' three runs: tiering the FIT
  // itself drags the whole search into a worse basin — the budget shunt
  // parasitics (0.7 mm coil ≈ 0.7 Ω DCR in a trap) seed every downstream
  // stage, and positie ended 9.1° avg phase where premium hit 3.4° on the
  // same settings. The profile's intent is WHERE the money goes, not which
  // physics the fit sees: so the branch FIT runs premium-grade, and the
  // position tiers apply in the FINAL assembled snap — which re-checks the
  // response with the real budget DCR/ESR anyway. (Sanders' own manual
  // recipe: design premium, then swap the LCR parts to budget.)
  const fitPrefs =
    s.snapPrefs?.profile === 'position' ? { ...s.snapPrefs, profile: 'premium' as const } : s.snapPrefs;
  const synthOpts = (raw: GriddedResponse) => ({
    mode: s.synthMode,
    phasePriority: s.phasePriority,
    catalogSnap: s.catalogSnap,
    corrections: (s.targets ? 'lean' : 'auto') as 'lean' | 'auto',
    leanTargetDb: s.targets?.rippleDb,
    snapPrefs: fitPrefs,
    ...(s.synthMode === 'acoustic' ? { driverSplDb: [...raw.spl] } : {}),
  });
  const synthWoofer = synthesize(shifted(b.specs.woofer), grid, driverZ.mid, synthOpts(w));
  const synthTweeter = synthesize(shifted(b.specs.tweeter), grid, driverZ.tweeter, synthOpts(t));
  const merged = mergeSynthesizedSchematics([
    { components: synthWoofer.components, model: 'mid' },
    { components: synthTweeter.components, model: 'tweeter' },
  ]).parts;

  /* THE LEASH (see branchTargets in netOptimizer): the design step's
   * acoustic target per branch, handed to the assembled tune as a ±3 dB
   * corridor. Same architecture as the three-way chain, same risk — the tune
   * holds the largest freedom in the chain and can rebuild a branch into
   * something its designer never drew. Masked to the branch's own top 25 dB;
   * the stopband belongs to the leak and protection guards.
   *
   * EQ bands ride along here (unlike three-way, where the design step's EQ is
   * a separate stage): the two-way target IS spec-with-EQ, and the synthesis
   * realises it, so the corridor must describe what was actually fitted. */
  const targetFor = (spec: DriverFilterSpec, resp: GriddedResponse): number[] => {
    const tgt = applyTransfer(resp, evalDriverFilter(spec, [...grid]));
    let peak = -Infinity;
    for (const v of tgt.spl) if (v > peak) peak = v;
    return tgt.spl.map((v) => (v > peak - 25 ? v : NaN));
  };
  const branchTargets = {
    freq: [...grid],
    low: targetFor(shifted(b.specs.woofer), w),
    high: targetFor(shifted(b.specs.tweeter), t),
  };

  // Assembled tune — the only stage that judges the interplay.
  onProgress?.({ stage: 'tune', evals: evaluations });
  const net = optimizeNetworkValues(
    merged,
    grid,
    w,
    t,
    driverZ,
    { ...adjust, inverted: b.inverted },
    {
      phasePriority: s.phasePriority,
      branchTargets,
      // The seed here is OUR OWN synthesis, so the seed-relative amp-load bar
      // has nothing to respect and everything to hide behind (see
      // zFloorStrict — the three-way lesson, which applies verbatim).
      zFloorStrict: true,
      angleData: s.angleData,
      directivityWeight: s.directivityWeight,
    powerMetric: s.powerMetric,
    powerFoldWeight: s.powerFoldWeight,
    errorSmoothOct: s.errorSmoothOct,
      ampTarget: s.ampTarget,
      breakupGuard: s.breakupGuard,
      staged: s.targets,
      xoRange: input.xoRange,
      phaseMetric: s.phaseMetric,
      acousticSlopes: s.acousticSlopes,
      catalogSnap: s.catalogSnap,
      snapPrefs: s.snapPrefs,
      band: s.band,
      safety: s.safety,
      onStage: (detail, ev) => onProgress?.({ stage: 'tune', evals: evaluations + (ev ?? 0), detail }),
    },
  );
  const zOk =
    !net.safetyNote &&
    !(net.ampFloorNote !== undefined && net.ampFloorNote.includes('could not be repaired'));
  const win = input.judgeWindow;
  const xoDel = net.after.xoHz;
  const xoWindowOk = ((): boolean | null => {
    if (!win || xoDel == null) return null;
    const SLACK = 1.06;
    if (win.floorHz != null && xoDel < win.floorHz / SLACK) return false;
    if (win.ceilHz != null && xoDel > win.ceilHz * SLACK) return false;
    return win.floorHz != null || win.ceilHz != null ? true : null;
  })();
  return {
    label,
    xoRange: input.xoRange,
    zOk,
    zMinOhm: net.after.zMinOhm ?? null,
    xoWindowOk,
    overlapOct: net.after.pairOverlapOct?.[0] ?? null,
    vf: b,
    rounds,
    evaluations: evaluations + net.evaluations,
    synthWoofer,
    synthTweeter,
    parts: net.parts,
    net,
    bomTotalEur: bomFor(net.parts).totalEur,
  };
}

/** Follow-up candidates for a FREE (unpinned) run: two pinned ranges around
 *  the crossing the free chain actually found. Without these the free run is
 *  a single chain with no competition — measured (Sanders' Positie run): one
 *  bad basin, phase 3.4°→11.7°, and nothing there to beat it. */
export function followupVariantsFor(
  xoHz: number,
): { label: string; xoRange: [number, number] }[] {
  const step = Math.max(xoHz * 0.12, 150);
  const m = Math.max(xoHz * 0.1, 150);
  const mk = (centre: number): [number, number] => [
    Math.max(300, centre - m),
    Math.min(12000, centre + m),
  ];
  return [
    { label: `${Math.round(xoHz - step)} Hz`, xoRange: mk(xoHz - step) },
    { label: `${Math.round(xoHz + step)} Hz`, xoRange: mk(xoHz + step) },
  ];
}

/** Crossover-range candidates for a scan: the user's pinned range IS the
 *  search space, SUBDIVIDED into `steps` slices — centres evenly spaced from
 *  edge to edge (endpoints included, steps forced odd so the pin centre is
 *  always among them), each candidate constrained to its own ±half-spacing
 *  slice, clamped to the range. The slices tile the range exactly: no
 *  candidate can wander outside the pin, and neighbours don't overlap.
 *  HARD GELEERD (Sanders "het is geen venster in een venster toch?"): the
 *  first version gave every candidate the pin's FULL ±margin window again —
 *  "2400 Hz" on a 2100±300 pin could then explore up to 2700 (outside the
 *  pin!) and neighbouring windows overlapped ~90%, making the fine
 *  subdivision meaningless. No pin → a single free run (the caller appends
 *  `followupVariantsFor` candidates once the free crossing is known). */
export function crossoverVariants(
  xoRange: [number, number] | undefined,
  steps = 3,
): { label: string; xoRange?: [number, number] }[] {
  if (!xoRange) return [{ label: 'free' }];
  const n = Math.max(3, Math.min(11, Math.round(steps) | 1)); // odd, 3..11
  const lo = Math.max(300, Math.min(...xoRange));
  const hi = Math.min(12000, Math.max(...xoRange));
  const spacing = (hi - lo) / (n - 1);
  const half = spacing / 2;
  const out: { label: string; xoRange?: [number, number] }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const centre = lo + spacing * i;
    let label = `${Math.round(centre)} Hz`;
    // Labels key the scan-progress rows — keep them unique.
    while (seen.has(label)) label = `${label}·`;
    seen.add(label);
    out.push({
      label,
      xoRange: [Math.max(lo, centre - half), Math.min(hi, centre + half)],
    });
  }
  return out;
}

/** Rank chain results: targets met first (staged), then the blended
 *  ripple/phase score at the user's priority — and among near-equal winners
 *  (≤5% score apart) the CHEAPER BOM wins ("caps zo klein mogelijk": at
 *  equal quality, a €600 realization has no business beating a €300 one).
 *  Deterministic. */
export function rankChainResults(
  results: readonly ChainResult[],
  targets: { rippleDb: number; phaseDeg: number } | undefined,
  phasePriority: number,
  hpFloorHz?: number,
  /** Source-resistance limit at the low driver (Ω, point 4) — class loss above it. */
  rSourceLimitOhm = 1.0,
  /** Hard tier (fix 1): at/above this the candidate is disqualified (ranks last). */
  rSourceDisqualifyOhm = 2.0,
): ChainResult[] {
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const rsClass = (r: ChainResult): number => {
    const rs = r.net.audit?.rSourceOhm;
    if (rs == null) return 0;
    if (rSourceDisqualifyOhm > 0 && rs >= rSourceDisqualifyOhm) return 10;
    return rSourceLimitOhm > 0 && rs > rSourceLimitOhm ? 1 : 0;
  };
  // Whole-range verdict in the ripple slot (Sanders doctrine, jul 2026): rank
  // on the AVERAGE |deviation|, scaled by π/2 so a smooth ±A dB wobble scores
  // exactly A — the same value the old peak number gave it. Which NUMBER is
  // judged changes (one narrow dip no longer decides the winner); the
  // ripple↔phase balance does not. Peak stays the fallback for results
  // without the field. Targets (`meets`) deliberately stay peak-based: the
  // user's "ripple ≤ X dB" is a nowhere-worse-than guarantee.
  const rippleOf = (r: ChainResult): number =>
    r.net.after.avgDevDb != null ? (Math.PI / 2) * r.net.after.avgDevDb : r.net.after.rippleDb;
  const score = (r: ChainResult): number =>
    2 * (1 - p) * rippleOf(r) ** 2 + 2 * p * (r.net.after.phaseDeg / 15) ** 2;
  const meets = (r: ChainResult): boolean =>
    !targets ||
    (r.net.after.rippleDb <= targets.rippleDb && r.net.after.phaseDeg <= targets.phaseDeg);
  /* Amplifier load and delivered-handover physics as CLASSES above the
   * flatness targets — ported verbatim from the three-way ranking, where both
   * gaps were measured. zOk alone is relative (the tune did not worsen the
   * dip), so a candidate whose seed already sat under the floor passed it and
   * won with an amp-hostile load; and a crossing past the measured
   * beaming/lobing bound is a different loudspeaker off-axis however flat it
   * sums on-axis. Unknown (null / absent) is never punished, so older results
   * and unwindowed runs rank exactly as before. */
  const zFloorOk = (r: ChainResult): boolean =>
    r.zMinOhm == null || r.zMinOhm >= Z_FLOOR_OHM;
  const zClass = (r: ChainResult): number =>
    (r.zOk === false ? 2 : 0) + (zFloorOk(r) ? 0 : 1) + rsClass(r);
  const xoClass = (r: ChainResult): number => (r.xoWindowOk === false ? 1 : 0);
  const ranked = [...results].sort((a, b) => {
    const za = zClass(a);
    const zb = zClass(b);
    if (za !== zb) return za - zb;
    const xa = xoClass(a);
    const xb = xoClass(b);
    if (xa !== xb) return xa - xb;
    const ma = meets(a) ? 0 : 1;
    const mb = meets(b) ? 0 : 1;
    if (ma !== mb) return ma - mb;
    return score(a) - score(b);
  });
  // Tiebreak on the WINNER slot only (pairwise 5%-ties are not transitive, so
  // a full sort on them would be order-dependent). Among results in the
  // winner's meets-class within 5% of its score, promote — in order of
  // priority — (1) TWEETER MARGIN: a crossing at/above the 2×Fs floor beats a
  // needlessly-lower one (the flatness objective is flat across a wide xo
  // range and can't see power handling / Fs comfort — the reason the free run
  // otherwise settles arbitrarily low), then (2) the cheaper priced BOM ("caps
  // zo klein mogelijk"). Both are DECISION-point tiebreaks, never objective
  // nudges. Deterministic.
  if (ranked.length > 1) {
    const s0 = score(ranked[0]);
    const tied = ranked.filter(
      (r) =>
        zClass(r) === zClass(ranked[0]) &&
        xoClass(r) === xoClass(ranked[0]) &&
        meets(r) === meets(ranked[0]) &&
        score(r) <= s0 * 1.05,
    );
    if (tied.length > 1) {
      const safe = (r: ChainResult): boolean =>
        hpFloorHz == null || r.net.after.xoHz == null || r.net.after.xoHz >= hpFloorHz;
      const anySafe = tied.some(safe);
      // Prefer tweeter-safe crossings when any exist; among the preferred
      // pool the cheapest priced realization wins.
      const pool = anySafe ? tied.filter(safe) : tied;
      const priced = pool.filter((r) => r.bomTotalEur !== null);
      const pick = priced.length > 0 ? priced : pool;
      const best = pick.reduce((x, y) => {
        if (priced.length > 0) return y.bomTotalEur! < x.bomTotalEur! ? y : x;
        return score(y) < score(x) ? y : x; // no prices: best score in the safe pool
      });
      if (best !== ranked[0]) return [best, ...ranked.filter((r) => r !== best)];
    }
  }
  return ranked;
}
