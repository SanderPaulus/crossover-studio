import { applyTransfer, combine, combineN, type BranchAdjust, type CombineNResult, type CombineResult, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { pickSlotsN } from './driverSlots.ts';
import { solveNetwork } from './network.ts';
import type { Complex } from './complex.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpCrossover } from './parsers/vxp.ts';

/**
 * ONE SOLVE FOR A SAVED DESIGN, TWO CALLERS (A6b).
 *
 * The ghost overlay and the compare table both answer "what would this tab
 * deliver", and both used to do it with their own copy of the same eight
 * steps: netlist → solve → slot resolution → per-branch transfer → sum. Two
 * copies of one physical question is the shape this codebase has paid for
 * repeatedly — a consumer quietly measuring on a different definition than
 * the one next to it.
 *
 * THIS IS AN EXTRACTION, NOT A SYNCHRONISATION. Two implementations tested
 * for equality can drift apart between test runs; one implementation cannot.
 * The migration proof (bit-identity against a frozen copy of the old inline
 * code) lives in designSolve.test.ts and is a one-off, not a standing sync
 * check.
 *
 * Deliberately NOT included: the live simulation's own path. That one applies
 * its transfers into a running pipeline with virtual filters stacked on top
 * and its own error reporting; folding it in here would be a behaviour change
 * dressed as a refactor.
 */
export interface DesignSolveInput {
  /** The saved tab, as it is stored. */
  design: { name: string; parts: VxpCrossover['parts'] };
  grid: readonly number[];
  /** Driver impedances on `grid`, keyed by model AND slot (zGridWithSlots). */
  driverZ: Record<string, readonly Complex[]>;
  /** The measured branches BEFORE any network — the simulation's own base. */
  base: { w: GriddedResponse; m?: GriddedResponse | null; t: GriddedResponse };
  /** True when all three branches are loaded; a two-way sums w+t only. */
  threeWay: boolean;
  /** Branch adjustments, exactly as the live sum uses them. */
  adjust: { mid: BranchAdjust; tweeter: TweeterAdjust };
}

export interface DesignSolveResult {
  /**
   * Set when the network's driver names cannot be resolved to low/mid/high.
   * The impedance curve is still valid — it does not depend on which branch
   * is which — so it is returned alongside rather than withheld.
   */
  ambiguous: string | null;
  /** System input impedance at the generator terminals. */
  inputZ: Complex[];
  /** Branches after transfer AND adjustment, low → high. Null when ambiguous. */
  branches: GriddedResponse[] | null;
  /** combineN in three-way, combine in two-way. Null when ambiguous. */
  sum: CombineNResult | CombineResult | null;
}

/**
 * Solve one saved design on the given grid and sum it the way the live
 * simulation does.
 *
 * Throws exactly where the old inline code threw (unsolvable netlist, bad
 * topology): a tab that is still work in progress has no numbers, and both
 * callers already say so in their own words.
 */
export function solveDesign(input: DesignSolveInput): DesignSolveResult {
  const { design, grid, driverZ, base, threeWay, adjust } = input;
  const { netlist } = crossoverToNetlist({ name: design.name, parts: design.parts } as VxpCrossover);
  const sol = solveNetwork(netlist, grid, driverZ);
  const slots = pickSlotsN(sol.drivers);
  if (slots.ambiguous) {
    return { ambiguous: slots.ambiguous, inputZ: sol.inputZ, branches: null, sum: null };
  }
  const hOf = (d: { id: string } | null | undefined): Complex[] | null =>
    d ? sol.transfers[d.id] ?? null : null;
  const hW = hOf(slots.woofer);
  const hM = hOf(slots.mid);
  const hT = hOf(slots.tweeter);
  const w = hW ? applyTransfer(base.w, hW) : base.w;
  const t = hT ? applyTransfer(base.t, hT) : base.t;
  if (threeWay && base.m) {
    const m = hM ? applyTransfer(base.m, hM) : base.m;
    const sum = combineN([
      { response: w },
      { response: m, adjust: adjust.mid },
      { response: t, adjust: adjust.tweeter },
    ]);
    return { ambiguous: null, inputZ: sol.inputZ, branches: sum.branches, sum };
  }
  const sum = combine(w, t, adjust.tweeter);
  return { ambiguous: null, inputZ: sol.inputZ, branches: [sum.woofer, sum.tweeter], sum };
}
