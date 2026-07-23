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
import type { GriddedResponse, TweeterAdjust } from './dsp.ts';
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
import { optimizeNetworkValues, type NetOptimizeResult } from './netOptimizer.ts';
import { bomFor, type SnapPrefs } from './catalog.ts';
import type { DriverFilterSpec } from './filters.ts';

export interface ChainSettings {
  phasePriority: number; // 0..1
  eqBandsPerDriver: number;
  angleData?: { woofer: AngleResponse[]; tweeter: AngleResponse[] };
  directivityWeight?: number;
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
}

/** One full chain for one crossover-range candidate. */
export function runDesignChain(input: ChainInput, label = 'chain'): ChainResult {
  const { grid, w, t, driverZ, adjust, settings: s } = input;
  const vfOpts = {
    phasePriority: s.phasePriority,
    eqBandsPerDriver: s.eqBandsPerDriver,
    angleData: s.angleData,
    directivityWeight: s.directivityWeight,
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
    if (!improved) break;
    seed = best.specs;
    seedInv = best.inverted;
  }
  const b = best!;

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

  // Assembled tune — the only stage that judges the interplay.
  const net = optimizeNetworkValues(
    merged,
    grid,
    w,
    t,
    driverZ,
    { ...adjust, inverted: b.inverted },
    {
      phasePriority: s.phasePriority,
      angleData: s.angleData,
      directivityWeight: s.directivityWeight,
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
    },
  );
  return {
    label,
    xoRange: input.xoRange,
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

/** Crossover-range candidates for a scan: the user's pin plus one step down
 *  and one step up (step = the pin's margin, floor 150 Hz) — "meerdere
 *  varianten van het overgangspunt". No pin → a single free run (the caller
 *  appends `followupVariantsFor` candidates once the free crossing is known). */
export function crossoverVariants(
  xoRange: [number, number] | undefined,
): { label: string; xoRange?: [number, number] }[] {
  if (!xoRange) return [{ label: 'free' }];
  const lo = Math.min(...xoRange);
  const hi = Math.max(...xoRange);
  const c = (lo + hi) / 2;
  const m = Math.max((hi - lo) / 2, c * 0.02);
  const step = Math.max(m, 150);
  const mk = (centre: number): [number, number] => [
    Math.max(300, centre - m),
    Math.min(12000, centre + m),
  ];
  return [
    { label: `${Math.round(c - step)} Hz`, xoRange: mk(c - step) },
    { label: `${Math.round(c)} Hz`, xoRange: mk(c) },
    { label: `${Math.round(c + step)} Hz`, xoRange: mk(c + step) },
  ];
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
): ChainResult[] {
  const p = 0.15 + 0.7 * Math.min(Math.max(phasePriority, 0), 1);
  const score = (r: ChainResult): number =>
    2 * (1 - p) * r.net.after.rippleDb ** 2 + 2 * p * (r.net.after.phaseDeg / 15) ** 2;
  const meets = (r: ChainResult): boolean =>
    !targets ||
    (r.net.after.rippleDb <= targets.rippleDb && r.net.after.phaseDeg <= targets.phaseDeg);
  const ranked = [...results].sort((a, b) => {
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
    const tied = ranked.filter((r) => meets(r) === meets(ranked[0]) && score(r) <= s0 * 1.05);
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
