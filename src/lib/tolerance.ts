import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork, type PassiveElement } from './network.ts';
import { applyTransfer, combine, type GriddedResponse, type TweeterAdjust } from './dsp.ts';
import { pickSlots } from './driverSlots.ts';
import type { Complex } from './complex.ts';
import type { VxpPart } from './parsers/vxp.ts';

/**
 * Build-tolerance analysis: how far can the combined response drift when
 * every physical R/L/C lands somewhere inside its tolerance window (±tol%)?
 *
 * Method: one-at-a-time corner analysis, first-order worst case. For each
 * element both corners (value·(1±tol)) are solved exactly; the envelope sums
 * the per-part shifts pessimistically (all worst signs aligned — the honest
 * "worst case" a builder wants before soldering), and the RSS number gives
 * the statistically realistic spread (independent random part errors).
 * Deterministic: no RNG, 2N+1 network solves for N passive elements.
 */

export interface ToleranceResult {
  tolPct: number;
  /** Worst-case envelope around the nominal combined SPL (absolute dB). */
  upperDb: number[];
  lowerDb: number[];
  /** Worst-case half-spread: max over f of (upper − lower)/2, in ±dB. */
  worstHalfDb: number;
  /** Statistically realistic half-spread (root-sum-square corners), ±dB. */
  rssHalfDb: number;
  /** Per part: its peak |response shift| over the band (dB), sorted
   *  most-sensitive first — where tight-tolerance parts pay off. */
  perPart: { id: string; maxAbsDb: number }[];
  evaluations: number;
}

export function toleranceBand(
  parts: readonly VxpPart[],
  grid: readonly number[],
  w: GriddedResponse,
  t: GriddedResponse,
  z: Record<string, readonly Complex[]>,
  adjust: TweeterAdjust,
  tolPct: number,
): ToleranceResult | null {
  let netlist: ReturnType<typeof crossoverToNetlist>['netlist'];
  try {
    netlist = crossoverToNetlist({ name: 'tolerance', parts: [...parts] }).netlist;
  } catch {
    return null;
  }
  const net = { nodeCount: netlist.nodeCount, elements: netlist.elements.map((e) => ({ ...e })) };
  const passives = net.elements.filter(
    (e): e is PassiveElement => e.kind === 'R' || e.kind === 'L' || e.kind === 'C',
  );
  if (passives.length === 0) return null;

  let evaluations = 0;
  const combinedOf = (): number[] | null => {
    evaluations++;
    const sol = solveNetwork(net, [...grid], z);
    const { woofer, tweeter } = pickSlots(sol.drivers);
    const hW = woofer ? sol.transfers[woofer.id] ?? null : null;
    const hT = tweeter ? sol.transfers[tweeter.id] ?? null : null;
    if (!hW && !hT) return null;
    const wF = hW ? applyTransfer(w, hW) : w;
    const tF = hT ? applyTransfer(t, hT) : t;
    return combine(wF, tF, adjust).combinedSpl;
  };

  const nominal = combinedOf();
  if (!nominal) return null;
  const n = nominal.length;
  const frac = tolPct / 100;

  // Per frequency: pessimistic sum of positive/negative per-part shifts, and
  // the RSS of each part's worst corner.
  const upShift = new Array<number>(n).fill(0);
  const dnShift = new Array<number>(n).fill(0);
  const sqShift = new Array<number>(n).fill(0);
  const perPart: { id: string; maxAbsDb: number }[] = [];

  for (const el of passives) {
    const nominalValue = el.value;
    let partMax = 0;
    const cornerUp = new Array<number>(n).fill(0);
    const cornerDn = new Array<number>(n).fill(0);
    for (const sign of [1, -1] as const) {
      el.value = nominalValue * (1 + sign * frac);
      const spl = combinedOf();
      if (spl) {
        for (let i = 0; i < n; i++) {
          const d = spl[i] - nominal[i];
          if (d > cornerUp[i]) cornerUp[i] = d;
          if (d < cornerDn[i]) cornerDn[i] = d;
          const ad = Math.abs(d);
          if (ad > partMax) partMax = ad;
        }
      }
    }
    el.value = nominalValue; // restore before the next part
    for (let i = 0; i < n; i++) {
      upShift[i] += cornerUp[i];
      dnShift[i] += cornerDn[i];
      const worst = Math.max(cornerUp[i], -cornerDn[i]);
      sqShift[i] += worst * worst;
    }
    perPart.push({ id: el.id, maxAbsDb: partMax });
  }

  let worstHalfDb = 0;
  let rssHalfDb = 0;
  const upperDb = new Array<number>(n);
  const lowerDb = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    upperDb[i] = nominal[i] + upShift[i];
    lowerDb[i] = nominal[i] + dnShift[i];
    const half = (upShift[i] - dnShift[i]) / 2;
    if (half > worstHalfDb) worstHalfDb = half;
    const rss = Math.sqrt(sqShift[i]);
    if (rss > rssHalfDb) rssHalfDb = rss;
  }
  perPart.sort((a, b) => b.maxAbsDb - a.maxAbsDb);

  return { tolPct, upperDb, lowerDb, worstHalfDb, rssHalfDb, perPart, evaluations };
}
