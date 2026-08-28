/**
 * Gate 4 — the ABSOLUTE, PHYSICAL part audit.
 *
 * Gates 1–3 in the chain (design-step band audit, synthesis corrections,
 * staged prune) all judge RELATIVE to the objective, and the prune only runs
 * when the targets are met. That leaves a hole: with an unreachable target
 * nothing is ever removed, so a demonstrably dead part (Sanders' 6.8 mH shunt
 * coil in a tweeter branch behind its series cap — 186 Ω at the crossing
 * against a 6 Ω tweeter, an open connection with a price tag) survives every
 * pass. A delta on the mixed objective was tried as a sweep and reverted: it
 * removed LIVE parts too, and the downstream stages (amp repair, catalog snap)
 * landed differently. The criterion has to be physical.
 *
 * This audit asks one question per part (and per series LCR chain as a
 * whole): does this component demonstrably do anything in THIS network?
 * Open/short it WITHOUT retuning and measure three absolute deltas against
 * the full network:
 *
 *   dA  max |Δ SPL| of the summed response, 200 Hz–15 kHz, 1/6-oct smoothed
 *   dP  worsening of the phase P95 per adjacent driver pair, inside that
 *       pair's overlap window
 *   dZ  change of the system |Z| minimum, and of the Thevenin source
 *       impedance the LOW driver sees at its box tuning / resonance
 *
 * Verdicts (thresholds in settings):
 *   INERT    dA < 0.15 dB AND dP < 1° AND dZ negligible → removable, whether
 *            or not the targets are met.
 *   EARNED   dA ≥ 1 dB OR dP ≥ 3° OR dZ tips the Z minimum over the floor /
 *            the source resistance over its limit → stays, with the reason.
 *   GREY     in between → the decision stays with gates 1–3 and the user;
 *            the audit only shows the numbers.
 *
 * The audit never overrides gates 1–3 towards KEEPING; it only adds the
 * removal route that is missing when targets are unmet, and it supplies the
 * physical explanation. Locked parts are measured and shown, never removed.
 * The didactic ratio |Z_part| / |Z_seen| (impedance of the part against the
 * impedance the network presents at its terminals, over the band where its
 * branch is within 12 dB of the sum) explains a verdict; it never decides one.
 */
import type { VxpPart } from './parsers/vxp.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { solveNetwork, type NetElement, type SourceElement } from './network.ts';
import type { Complex } from './complex.ts';
import {
  applyTransfer,
  combine,
  combineN,
  type BranchAdjust,
  type GriddedResponse,
  type TweeterAdjust,
} from './dsp.ts';
import { computeIntegration } from './integration.ts';
import { pickSlotsN } from './driverSlots.ts';
import { busPositions, busTopology } from './netOptimizer.ts';

export interface AuditThresholds {
  /** INERT: max |ΔSPL| below this (dB). */
  inertDb: number;
  /** INERT: worst pair-P95 worsening below this (degrees). */
  inertDeg: number;
  /** INERT: |ΔZmin| and |ΔRsource| both below this (ohms). */
  inertZOhm: number;
  /** EARNED: max |ΔSPL| at or above this (dB). */
  earnedDb: number;
  /** EARNED: worst pair-P95 worsening at or above this (degrees). */
  earnedDeg: number;
  /** EARNED: |ΔZmin| at or above this (ohms), even without crossing the floor. */
  zMinStepOhm: number;
  /** Source-resistance limit at the low driver's tuning (ohms): crossing it
   *  either way earns a part; exceeding it flags the network.
   *
   *  NULL IS A VALUE HERE AND IT MEANS "NO TIER" (V34, P4). `undefined` in a
   *  `Partial<AuditThresholds>` means "nothing said", and nothing said falls
   *  back to {@link DEFAULT_R_SOURCE_TIER_OHM} — which is what every v1 caller
   *  has always got. `null` is the designer having stated no limit, and a
   *  stated nothing judges nothing: no part is earned by crossing it and no
   *  branch DCR budget is capped by it. The two are deliberately different
   *  states; collapsing them is how a default becomes a requirement nobody
   *  chose. */
  rSourceOhm: number | null;
}

/**
 * V34 — THE TWO SOURCE-RESISTANCE LIMITS, EACH WITH ONE HOME.
 *
 * Both numbers existed before this entry; what they did not have is an
 * address. The 1.0 Ω tier stood here AND twice in `netOptimizer.ts` as
 * `?? 1.0`; the 2.0 Ω disqualification stood as a parameter default in
 * `designChain.ts`, as `?? 2.0` in `threeWayChain.ts`, in a doc comment beside
 * it, and a fourth time in the casus-1 fixture. Neither carried a derivation.
 *
 * That is the same shape `impedanceFloor.ts` exists for — one question, three
 * thresholds, and a network that could be repaired by one and struck through
 * by the next. P6 forbids exactly this pattern, and its lint covers
 * `src/lib/engine2/` while these two live just outside it. A scope boundary is
 * not a licence, so they are consolidated here, beside the probe whose reading
 * they judge.
 *
 * WHAT THEY ARE NOT: derived. Neither is a measurement and neither is claimed
 * to be. They are the APP'S HISTORICAL DEFAULTS for a v1 run that states
 * nothing, kept byte-identical on that route on purpose. On the v2 route a
 * limit the designer never stated is ABSENT (P4) and neither of these applies
 * — see `candidateDeclaration.ts` and casebook V34.
 */

/**
 * The class-loss tier: above this the low branch's source resistance costs a
 * candidate its ranking class, a part that tips across it is EARNED, and the
 * catalogue snap caps the branch's total coil DCR at 70 % of it.
 *
 * 1.0 Ω is `BRANCH_SERIES_DCR_DB`'s own calibration read as an ohm figure:
 * 0.24 + 0.19 Ω of series DCR into the 3.2 Ω woofer pair of the hand-built
 * reference filter is 1.1 dB and about 13 % on Qts (see `catalog.ts`). It is a
 * convention on a continuum, not a threshold in the physics.
 */
export const DEFAULT_R_SOURCE_TIER_OHM = 1.0;

/**
 * The hard disqualification: at or above this a candidate is infeasible rather
 * than merely worse, in the ranking and — since A3e — in the search.
 *
 * Twice the tier, and that is all it is. Nothing measured says the damping is
 * acceptable at 1.9 Ω and unacceptable at 2.0.
 *
 * ⚠ THE NUMBER IS ONLY MEANINGFUL BESIDE THE FREQUENCY IT IS COMPARED AT.
 * Measured at V34 on casus 1: read at the chain grid's probe (640 Hz, the top
 * edge of the probe's own search window) the three v1 baselines score 0.50,
 * 0.47 and 0.68 Ω; read at the woofer's actual impedance peak they score 3.98,
 * 4.59 and 2.55 Ω. The same limit therefore passes all three or disqualifies
 * all three depending only on where the probe landed — including the
 * designer's own best filter. That is why V34 changes the probe and withdraws
 * the default on the v2 route in one entry: either half alone is worse than
 * neither.
 */
export const DEFAULT_R_SOURCE_DISQUALIFY_OHM = 2.0;

/**
 * The top of the probe's own search window when no box tuning is stated, Hz.
 *
 * A woofer resonance lives below this whatever the box; above it the peaks
 * belong to the FILTER, which is the reading ISSUE #14 was about. The window
 * is the wider of this and the grid's first quarter, so a grid that starts
 * high still gets a window to look in — and since V34 a peak that lands ON
 * either end of that window is refused rather than reported.
 */
export const SOURCE_PROBE_WINDOW_TOP_HZ = 400;

/** Defaults. inertDeg is 1.5°, not the 1° first written down: measured on the
 *  textbook-dead case (a 6.8 mH shunt trap across a 6 Ω tweeter behind a
 *  3rd-order HP — 0.10 dB on the sum) the P95 of the pointwise relative-phase
 *  change in the handover core reads 1.07°, because a 6.8 mH coil IS ~4% of a
 *  6 Ω tweeter at 3 kHz and the outermost core points feel all of it. A live
 *  shunt coil in the same network reads ~100°; the two are separated by two
 *  orders of magnitude, so 1.5° splits them without ambiguity. */
export const DEFAULT_AUDIT_THRESHOLDS: AuditThresholds = {
  inertDb: 0.15,
  inertDeg: 1.5,
  inertZOhm: 0.2,
  earnedDb: 1.0,
  earnedDeg: 3,
  zMinStepOhm: 1.0,
  rSourceOhm: DEFAULT_R_SOURCE_TIER_OHM,
};

export type AuditVerdict = 'inert' | 'earned' | 'grey';

export interface PartAuditEntry {
  /** partIds covered (one, or every member of a series LCR chain). */
  ids: string[];
  /** Human label, e.g. "L3" or "L3 + C4 + R2 (series chain)". */
  label: string;
  /** Best guess at the part's function from topology + kind. */
  role: string;
  /** Which removal variant measured the smaller effect ("what it does"). */
  mode: 'open' | 'shorted';
  dA: number;
  dP: number;
  dZmin: number;
  dRsource: number | null;
  verdict: AuditVerdict;
  reasons: string[];
  locked: boolean;
  /** Estimated saving if removed (EUR), when a priced catalog is loaded. */
  costEur: number | null;
  /** Didactic: median |Z_part| / |Z_seen| over the band where its branch is
   *  within 12 dB of the sum. Shunt parts are inert when ≫ 1, series parts
   *  when ≪ 1. Null when it could not be determined. */
  ratio: { median: number; kind: 'series' | 'shunt'; bandHz: [number, number] } | null;
  /** Set by the caller when an INERT removal was applied and survived the
   *  re-check (or reverted, with the reason appended to `reasons`). */
  applied?: boolean;
}

export interface NetworkAudit {
  entries: PartAuditEntry[];
  /**
   * Thevenin source resistance the low driver sees at `rSourceAtHz`, MEASURED
   * ON THE NETWORK THIS AUDIT WAS RUN ON.
   *
   * Named for that network on purpose (A3g). The audit runs at gate 4, before
   * the shrink ladder and the catalog snap, and both of those still move this
   * number — so it is a diagnostic, not a verdict. Anything that RANKS must
   * read `NetOptimizeResult.after.rSourceOhm`, which is measured on the parts
   * handed over. Two fields called `rSourceOhm` describing different networks
   * is exactly the bug this rename exists to prevent.
   */
  rSourceTunedOhm: number | null;
  rSourceAtHz: number | null;
  /** Estimated voice-coil Re (min |Z| below resonance) and the resulting
   *  Qes multiplier (Re + Rs)/Re — the low-end damping cost of the network. */
  reOhm: number | null;
  qesFactor: number | null;
  /** The box tuning fell outside the measured grid, so rSourceTunedOhm is the DC
   *  limit (series-path resistance) rather than a Thevenin reading. A LOWER
   *  BOUND: it may condemn, it may not exonerate. */
  rSourceOutOfBand?: boolean;
  /** rSourceTunedOhm exceeds the limit — independent of any per-part verdict. */
  rSourceWarn: boolean;
  /** The tuning frequency fell on the grid's first point (Fb below the grid,
   *  or no Fb and the Z peak lies below it): the number is taken at the grid
   *  edge, not at the real resonance — widen the range for the real one. */
  rSourceAtGridEdge: boolean;
  /** System |Z| minimum of the full network over the grid (ohms). */
  zMinOhm: number;
  /** Amplitude band the audit judged on. */
  bandHz: [number, number];
  thresholds: AuditThresholds;
}

export interface AuditContext {
  grid: readonly number[];
  wBase: GriddedResponse;
  tBase: GriddedResponse;
  midBase?: GriddedResponse | null;
  driverZ: Record<string, readonly Complex[]>;
  adjust: TweeterAdjust;
  midAdjust?: BranchAdjust;
  thresholds?: Partial<AuditThresholds>;
  /** Box tuning (ported: Fb; sealed: Fc) of the low driver, Hz. Without it
   *  the audit uses the impedance peak of the low driver on the grid. */
  fbHz?: number;
  /** The amplifier's rated minimum load (ohms), when the user stated one: a
   *  removal that tips the Z minimum across it EARNS the part. Absent = no
   *  floor exists, so nothing can cross it — there is deliberately no
   *  default (see the amplifier-load note in netOptimizer.ts). The
   *  floor-free Z criterion survives either way: a removal that moves the
   *  minimum by more than `zMinStepOhm` still earns the part. */
  zFloorOhm?: number;
  /** Cost of one part, EUR (nearest catalog part), or null. */
  costOf?: (p: VxpPart) => number | null;
  /**
   * V34 — WHERE THE SOURCE-RESISTANCE PROBE READS, when that is not `grid`.
   *
   * A SECOND grid and not a replacement, because the audit asks two different
   * kinds of question. Everything it measures per part — ΔSPL, pair phase,
   * ΔZmin — is a RESPONSE question and belongs on the analysis grid, which is
   * where the design is judged. The source resistance at the low driver's
   * tuning is an impedance question about a frequency that is usually not on
   * that grid at all, and an impedance measurement has no gate
   * (`impedanceReference.ts`). Absent = read on `grid`, which is what every v1
   * caller does.
   *
   * `null` here is NOT the same as absent: it means a source was named and its
   * data never arrived, so the probe answers nothing rather than falling back
   * to the analysis grid. Same rule as V32's gate and V33's barrier — a silent
   * fallback restores exactly the reading being withdrawn.
   */
  probe?: { grid: readonly number[]; driverZ: Record<string, readonly Complex[]>; edgeRule?: ProbeEdgeRule } | null;
}

const RLC = new Set(['Resistor', 'Inductor', 'Capacitor']);
const ZERO_ADJ: TweeterAdjust = { offsetMm: 0, trimDb: 0, inverted: false };
const AUDIT_BAND: [number, number] = [200, 15000];

interface Probe {
  /** Summed SPL on the grid (1/6-oct smoothed). */
  spl: number[];
  /** Per-branch SPL (unsmoothed) keyed by slot role, for attribution. */
  branches: { role: 'low' | 'mid' | 'high'; spl: number[] }[];
  /** Per adjacent pair: |relative phase error| per grid point inside the
   *  pair's handover bandwidth (NaN elsewhere). dP is the P95 of the
   *  POINTWISE change between full and variant — a P95 of the distribution
   *  itself jumps by degrees when one point enters or leaves the band. */
  pairErr: { err: number[]; core: boolean[] }[];
  zMinOhm: number;
  /** Nodes + models of the drivers as solved (for the source-Z probe). */
  net: { nodeCount: number; elements: NetElement[] };
}

/** 1/6-octave moving average in log-frequency (±1/12 oct window). */
export function smoothOctave(freq: readonly number[], spl: readonly number[], octaves = 1 / 6): number[] {
  const half = octaves / 2;
  const out = new Array<number>(freq.length);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < freq.length; i++) {
    const fLo = freq[i] * Math.pow(2, -half);
    const fHi = freq[i] * Math.pow(2, half);
    while (lo < freq.length && freq[lo] < fLo) lo++;
    if (hi < lo) hi = lo;
    while (hi + 1 < freq.length && freq[hi + 1] <= fHi) hi++;
    let s = 0;
    let n = 0;
    for (let j = lo; j <= hi; j++) {
      if (Number.isFinite(spl[j])) {
        s += spl[j];
        n++;
      }
    }
    out[i] = n > 0 ? s / n : spl[i];
  }
  return out;
}

function p95Of(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

function probeOf(parts: readonly VxpPart[], ctx: AuditContext): Probe | null {
  let net: { nodeCount: number; elements: NetElement[] };
  try {
    const { netlist } = crossoverToNetlist({ name: 'audit', parts: [...parts] });
    net = { nodeCount: netlist.nodeCount, elements: netlist.elements.map((e) => ({ ...e })) };
  } catch {
    return null;
  }
  let sol: ReturnType<typeof solveNetwork>;
  try {
    sol = solveNetwork(net, ctx.grid, ctx.driverZ);
  } catch {
    return null;
  }
  const slots = pickSlotsN(sol.drivers);
  const hOf = (d?: { id: string }) => (d ? sol.transfers[d.id] ?? null : null);
  const hW = hOf(slots.woofer);
  const hT = hOf(slots.tweeter);
  const hM = hOf(slots.mid);
  const wF = hW ? applyTransfer(ctx.wBase, hW) : ctx.wBase;
  const tF = hT ? applyTransfer(ctx.tBase, hT) : ctx.tBase;
  const mBase = ctx.midBase ?? null;
  const mF = mBase ? (hM ? applyTransfer(mBase, hM) : mBase) : null;

  let sumSpl: number[];
  const pairs: { a: GriddedResponse; b: GriddedResponse }[] = [];
  const branches: Probe['branches'] = [];
  if (mF) {
    const n3 = combineN([
      { response: wF },
      { response: mF, adjust: ctx.midAdjust ?? {} },
      { response: tF, adjust: ctx.adjust },
    ]);
    sumSpl = n3.combinedSpl;
    pairs.push({ a: n3.branches[0], b: n3.branches[1] }, { a: n3.branches[1], b: n3.branches[2] });
    branches.push(
      { role: 'low', spl: n3.branches[0].spl },
      { role: 'mid', spl: n3.branches[1].spl },
      { role: 'high', spl: n3.branches[2].spl },
    );
  } else {
    const r2 = combine(wF, tF, ctx.adjust);
    sumSpl = r2.combinedSpl;
    // Solo mode carries a silent ghost (≤ −300 dB): no pair to judge.
    const tAlive = tF.spl.some((v) => v > -300);
    const wAlive = wF.spl.some((v) => v > -300);
    if (tAlive && wAlive) pairs.push({ a: wF, b: tF });
    branches.push({ role: 'low', spl: wF.spl }, { role: 'high', spl: tF.spl });
  }
  // Judged in the HANDOVER CORE of each pair: the points where the two
  // branches are within 6 dB of each other (overlap weight ≥ 0.5) inside the
  // pair's integration bandwidth. Not the whole 20 dB window: at its edges a
  // branch sits 20 dB under the other and a shunt coil can rotate that
  // branch's phase by a degree or two while contributing nothing to the sum
  // (measured: a 6.8 mH shunt beside a live 0.25 mH — 0.08 dB on the sum,
  // yet 2° of relative phase at the window edge). Where the drivers are
  // equal, relative phase IS what the sum is made of; that is where a part
  // must show its phase effect. Falls back to the window when no bandwidth
  // exists.
  const pairErr = pairs.map(({ a, b }) => {
    const integ = computeIntegration(combine(a, b, ZERO_ADJ));
    const bw = integ.bandwidth;
    return {
      err: integ.points.map((p) => (p.cls !== null ? p.phaseErrorDeg : NaN)),
      core: integ.points.map(
        (p) => p.cls !== null && p.weight >= 0.5 && (!bw || (p.freq >= bw.fLo && p.freq <= bw.fHi)),
      ),
    };
  });
  let zMin = Infinity;
  for (const z of sol.inputZ) {
    const m = Math.hypot(z.re, z.im);
    if (m < zMin) zMin = m;
  }
  return { spl: smoothOctave(ctx.grid, sumSpl), branches, pairErr, zMinOhm: zMin, net };
}

/**
 * Thevenin |Z| looking INTO the network from the terminals of one element:
 * that element is replaced by a probing source, every generator by its own
 * Rg (a shorted ideal source), every other element — drivers included, as
 * their measured Z — stays. solveNetwork's inputZ (its own Rg excluded) is
 * exactly the impedance the probed terminals see.
 */
/** Driver impedances restricted to the given GRID INDICES — solveNetwork
 *  indexes driverZ by position in `freqs`, so a probe at a subset of the grid
 *  must hand over the matching subset (the first version passed the full
 *  arrays with a 1-point freqs list and silently loaded the other drivers with
 *  their Z at grid[0]). */
export function sliceDriverZ(
  driverZ: Record<string, readonly Complex[]>,
  idx: readonly number[],
): Record<string, readonly Complex[]> {
  return Object.fromEntries(Object.entries(driverZ).map(([m, z]) => [m, idx.map((i) => z[i])]));
}

export function seenImpedance(
  net: { nodeCount: number; elements: NetElement[] },
  removeIds: readonly string[],
  nodes: [number, number],
  freqs: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
): Complex[] | null {
  const probe: SourceElement = { kind: 'source', id: '__probe', nodes, volts: 1, seriesR: 1e-3 };
  const els: NetElement[] = [probe];
  for (const e of net.elements) {
    if (removeIds.includes(e.id)) continue;
    if (e.kind === 'source') {
      els.push({ kind: 'R', id: e.id, nodes: e.nodes, value: Math.max(e.seriesR, 1e-4) });
    } else els.push(e);
  }
  try {
    const sol = solveNetwork({ nodeCount: net.nodeCount, elements: els }, freqs, driverZ);
    return sol.inputZ;
  } catch {
    return null;
  }
}

/** Series chains of R/L/C elements: interior nodes touched by exactly two
 *  elements and by no driver/source/ground. Returns chains of ≥ 2 members. */
function seriesChains(net: { elements: NetElement[] }): { ids: string[]; ends: [number, number] }[] {
  const touch = new Map<number, NetElement[]>();
  for (const e of net.elements) {
    for (const n of e.nodes) {
      const l = touch.get(n) ?? [];
      l.push(e);
      touch.set(n, l);
    }
  }
  const isRlc = (e: NetElement) => e.kind === 'R' || e.kind === 'L' || e.kind === 'C';
  const interior = (n: number) => {
    if (n === 0) return false;
    const l = touch.get(n) ?? [];
    return l.length === 2 && l.every(isRlc);
  };
  const seen = new Set<string>();
  const chains: { ids: string[]; ends: [number, number] }[] = [];
  for (const e of net.elements) {
    if (!isRlc(e) || seen.has(e.id)) continue;
    // Walk both directions through interior nodes.
    const members: NetElement[] = [e];
    seen.add(e.id);
    const ends: number[] = [];
    for (const start of e.nodes) {
      let node = start;
      let cur = e;
      while (interior(node)) {
        const next = (touch.get(node) ?? []).find((x) => x !== cur);
        if (!next || seen.has(next.id)) break;
        members.push(next);
        seen.add(next.id);
        cur = next;
        node = next.nodes[0] === node ? next.nodes[1] : next.nodes[0];
      }
      ends.push(node);
    }
    if (members.length >= 2) chains.push({ ids: members.map((m) => m.id), ends: [ends[0], ends[1]] });
  }
  return chains;
}

function partImpedance(p: VxpPart, freqs: readonly number[]): number[] | null {
  const val = (name: string) => p.params.find((x) => x.name === name)?.value;
  if (p.type === 'Resistor') {
    const r = val('R');
    return r === undefined ? null : freqs.map(() => r);
  }
  if (p.type === 'Inductor') {
    const l = val('L');
    if (l === undefined) return null;
    const dcr = val('DCR') ?? 0;
    return freqs.map((f) => Math.hypot(dcr, 2 * Math.PI * f * l * 1e-3));
  }
  if (p.type === 'Capacitor') {
    const c = val('C');
    if (c === undefined) return null;
    const esr = val('ESR') ?? 0;
    return freqs.map((f) => Math.hypot(esr, 1 / (2 * Math.PI * f * c * 1e-6)));
  }
  return null;
}

function roleGuess(members: VxpPart[], pos: 'series' | 'shunt'): string {
  const kinds = members.map((m) => (m.type === 'Inductor' ? 'L' : m.type === 'Capacitor' ? 'C' : 'R')).sort();
  const key = kinds.join('');
  if (members.length === 1) {
    if (pos === 'series') return key === 'C' ? 'series cap (high-pass)' : key === 'L' ? 'series coil (low-pass)' : 'series resistor (level)';
    return key === 'C' ? 'shunt cap' : key === 'L' ? 'shunt coil' : 'shunt resistor';
  }
  if (key === 'CLR' || key === 'CL') return pos === 'series' ? 'series LC(R) — parallel-trap partner or notch' : 'shunt LC(R) trap (notch)';
  if (key === 'CR') return pos === 'shunt' ? 'shunt R+C (Zobel)' : 'series R+C';
  if (key === 'LR') return pos === 'shunt' ? 'shunt L+R' : 'series L+R';
  return `${pos} chain (${kinds.join('+')})`;
}

/**
 * Source RESISTANCE the LOW driver sees at its box tuning (Fb) — or, without a
 * tuning, at its impedance peak on the grid: the real part of the Thevenin
 * impedance looking back from the driver terminals with the generator at its
 * Rg. This is what adds to Re in Qes' = Qes·(Re+Rs)/Re — the damping and
 * efficiency loss no response metric sees. Cheap (one netlist, one frequency);
 * used by the ranking class and the staged safe-gates (aug 2026, point 4).
 * null when the network has no low driver, no impedance for it, or does not
 * solve.
 */
/**
 * Which grid point to read the source impedance at — and whether that point is
 * MEANINGFUL.
 *
 * THE BUG THIS EXISTS FOR (aug 2026, Sanders' 19-candidate scan): the code took
 * the grid point NEAREST to Fb, with no check that Fb was inside the grid at
 * all. His port is tuned to 31 Hz and his measurements start at 200 Hz, so
 * every candidate was probed at grid[0] = 210 Hz — which on his woofer low-pass
 * is right on the parallel resonance of L1 and C2 (3.3 mH ‖ 136 µF = 237 Hz).
 * The number reported as "source resistance" was the filter's own resonance
 * peak. Measured: his own hand-built filter, the best design in the room, reads
 * 7.40 Ω that way and 0.23 Ω in band. Fifteen of nineteen candidates were
 * disqualified on that reading.
 */
/**
 * WHICH EDGES OF THE FALLBACK'S SEARCH WINDOW DISQUALIFY A PEAK (V34).
 *
 *   `'first'` — only a peak sitting on the window's FIRST point. What this
 *               function has always done, and therefore what a v1 run gets.
 *   `'both'`  — either end. A maximum on a boundary is a boundary, whichever
 *               boundary it is.
 *
 * IT IS A PARAMETER AND NOT A FIX because the strict rule changes the reading
 * of every existing v1 run whose low driver resonates below the grid, and the
 * toggle invariant does not bend for a correctness argument. The v2 route
 * arms it; nothing else does.
 *
 * The rule applies to the FALLBACK ONLY. A stated box tuning that lands on
 * grid[0] is the frequency the designer asked for, not a search artefact, and
 * refusing it would answer a question nobody asked.
 */
export type ProbeEdgeRule = 'first' | 'both';

export function sourceProbeIndex(
  grid: readonly number[],
  z: readonly Complex[],
  fbHz?: number,
  edgeRule: ProbeEdgeRule = 'first',
): { idx: number; inBand: boolean } | null {
  if (grid.length === 0) return null;
  const lo = grid[0];
  const hi = grid[grid.length - 1];
  if (fbHz !== undefined && fbHz > 0) {
    if (fbHz < lo || fbHz > hi) {
      // A KNOWN tuning frequency outside the grid is not a reason to probe
      // somewhere else — it is a reason to stop probing. Measured on Sanders'
      // saved designs: substituting the in-band impedance peak reported 0.48 Ω
      // for a network carrying a 3.3 Ω resistor in the woofer's series path,
      // because at that frequency the shunt cap short-circuits the resistor.
      // At Fb that resistor is exactly what damps the cone. The DC limit is
      // the honest answer here, and the caller is told which one it got.
      return null;
    }
    let best = 0;
    for (let i = 0; i < grid.length; i++) {
      if (Math.abs(grid[i] - fbHz) < Math.abs(grid[best] - fbHz)) best = i;
    }
    return { idx: best, inBand: true };
  }
  // No usable tuning frequency: the impedance peak on the low part of the grid.
  // Only counts as in-band when it is a real PEAK (an interior maximum) — a
  // maximum sitting on a grid point that is also a window BOUNDARY is the edge
  // again, not a resonance.
  //
  // V34, AND IT IS THE SAME BUG AS ISSUE #14 ONE EDGE FURTHER ON. The guard
  // written for #14 refused index 0 and stopped there, because the failure it
  // had in front of it was a filter resonance at the bottom of the grid. The
  // TOP of the window can be a boundary in exactly the same way, and on casus 1
  // it is: with a chain grid of 200 Hz–20 kHz the window ends at grid[24] =
  // 640.2 Hz and that is precisely where the woofer's "peak" was found —
  // measured, not inferred. It is not a resonance; this woofer pair is ported
  // and its two peaks sit at 17 and 51 Hz, both below the grid. What was being
  // read there was the impedance rising out of the woofer's own passband, and
  // the source resistance measured at it was 0.50 Ω against 3.98 Ω at the real
  // peak, because the low-pass shunt shorts the series path at 640 Hz.
  let best = -1;
  let bestZ = -Infinity;
  let last = -1;
  const stop = Math.max(SOURCE_PROBE_WINDOW_TOP_HZ, grid[Math.floor(grid.length / 4)]);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > stop) break;
    last = i;
    const m = Math.hypot(z[i].re, z[i].im);
    if (m > bestZ) {
      bestZ = m;
      best = i;
    }
  }
  if (best < 0) return null;
  // `last` is the window's own top, which is only the GRID's top when the whole
  // grid fits inside the window — and then it is a boundary too.
  const onEdge = best === 0 || (edgeRule === 'both' && best === last);
  return { idx: best, inBand: !onEdge };
}

/**
 * DC limit of the source resistance: the resistance in the series path to the
 * low driver (coil DCR + resistors). At f → 0 every coil is wire and every cap
 * is open, so this is exactly what the Thevenin resistance converges to — and
 * it needs no impedance data, which is why it is the honest fallback when the
 * box tuning lies outside the measured band.
 *
 * It is a LOWER BOUND on the real thing (parallel paths can only be judged with
 * data), so it may disqualify but never exonerate: over the limit here is over
 * the limit for certain; under it merely means "not shown to be bad".
 */
export function seriesPathResistanceOhm(parts: readonly VxpPart[]): number | null {
  let bus: ReturnType<typeof busTopology>;
  try {
    bus = busTopology(parts);
  } catch {
    return null;
  }
  let low: string | null = null;
  try {
    const { netlist } = crossoverToNetlist({ name: 'dcr', parts: [...parts] });
    const drivers = netlist.elements.filter(
      (e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver',
    );
    if (drivers.length === 0) return null;
    const slots = pickSlotsN(drivers);
    low = (slots.woofer ?? slots.mid ?? slots.tweeter)?.model ?? null;
  } catch {
    return null;
  }
  if (!low) return null;
  let sum = 0;
  let seen = false;
  for (const p of parts) {
    if (!p.partId || p.open || p.shorted) continue;
    const r =
      p.type === 'Inductor'
        ? (p.params.find((q) => q.name === 'DCR')?.value ?? 0)
        : p.type === 'Resistor'
          ? (p.params.find((q) => q.name === 'R')?.value ?? 0)
          : 0;
    if (!(r > 0)) continue;
    if (!bus.driversOf(p.partId).includes(low)) continue;
    sum += r;
    seen = true;
  }
  return seen ? sum : 0;
}

export function sourceResistanceOhm(
  parts: readonly VxpPart[],
  ctx: {
    grid: readonly number[];
    driverZ: Record<string, readonly Complex[]>;
    fbHz?: number;
    /** V34 — which window boundaries refuse a peak. Absent = the historical
     *  rule, so every v1 caller reads what it always read. */
    edgeRule?: ProbeEdgeRule;
  },
): number | null {
  let net: { nodeCount: number; elements: NetElement[] };
  try {
    const { netlist } = crossoverToNetlist({ name: 'rsource', parts: [...parts] });
    net = { nodeCount: netlist.nodeCount, elements: netlist.elements.map((e) => ({ ...e })) };
  } catch {
    return null;
  }
  const drivers = net.elements.filter((e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver');
  if (drivers.length === 0) return null;
  const slots = pickSlotsN(drivers);
  const low = slots.woofer ?? slots.mid ?? slots.tweeter ?? null;
  if (!low) return null;
  const z = ctx.driverZ[low.model];
  if (!z) return null;
  const grid = ctx.grid;
  const probe = sourceProbeIndex(grid, z, ctx.fbHz, ctx.edgeRule);
  // Out of band: the DC limit (series-path resistance), never a reading off
  // the grid edge — see sourceProbeIndex.
  if (!probe || !probe.inBand) return seriesPathResistanceOhm(parts);
  try {
    const zs = seenImpedance(net, [low.id], low.nodes, [grid[probe.idx]], sliceDriverZ(ctx.driverZ, [probe.idx]));
    return zs ? Math.max(0, zs[0].re) : null;
  } catch {
    return null;
  }
}

export function auditNetwork(parts: readonly VxpPart[], ctx: AuditContext): NetworkAudit | null {
  const thr: AuditThresholds = { ...DEFAULT_AUDIT_THRESHOLDS, ...(ctx.thresholds ?? {}) };
  const zFloor = ctx.zFloorOhm !== undefined && ctx.zFloorOhm > 0 ? ctx.zFloorOhm : null;
  const full = probeOf(parts, ctx);
  if (!full) return null;
  const grid = ctx.grid;
  const band: [number, number] = [Math.max(AUDIT_BAND[0], grid[0]), Math.min(AUDIT_BAND[1], grid[grid.length - 1])];
  const inBand = grid.map((f) => f >= band[0] && f <= band[1]);

  // ---- Source impedance at the low driver's tuning ----
  const lowDrv = (() => {
    const drivers = full.net.elements.filter((e): e is Extract<NetElement, { kind: 'driver' }> => e.kind === 'driver');
    const slots = pickSlotsN(drivers);
    return slots.woofer ?? slots.mid ?? slots.tweeter ?? null;
  })();
  /* V34 — the probe's own grid. `undefined` is the historical one (`grid`);
   * `null` is a source that was named and whose data never arrived, and then
   * nothing is probed at all rather than quietly re-reading the analysis
   * grid. */
  const probeCtx =
    ctx.probe === undefined ? { grid, driverZ: ctx.driverZ, edgeRule: undefined } : ctx.probe;
  const probeGrid = probeCtx?.grid ?? [];
  let fbIdx: number | null = null;
  let reOhm: number | null = null;
  /** The probe frequency was not measurable — R_source is the DC limit, and
   *  callers must not disqualify on a number that was never measured. */
  let rSourceOutOfBand = false;
  if (lowDrv) {
    const z = probeCtx ? probeCtx.driverZ[lowDrv.model] : undefined;
    if (z) {
      const probe = sourceProbeIndex(probeGrid, z, ctx.fbHz, probeCtx!.edgeRule);
      fbIdx = probe ? probe.idx : null;
      rSourceOutOfBand = !probe || !probe.inBand;
      if (fbIdx !== null) {
        // Re ≈ the |Z| minimum just below resonance, or in the dip right above
        // it when the grid starts at/near the peak — never the whole-grid min
        // (that is the mid-band dip of the network's own filter).
        let mn = Infinity;
        for (let i = 0; i <= fbIdx; i++) mn = Math.min(mn, Math.hypot(z[i].re, z[i].im));
        for (let i = fbIdx; i < probeGrid.length && probeGrid[i] <= probeGrid[fbIdx] * 6; i++) {
          mn = Math.min(mn, Math.hypot(z[i].re, z[i].im));
        }
        reOhm = Number.isFinite(mn) ? mn : null;
      }
    } else {
      rSourceOutOfBand = true;
    }
  }
  // Source RESISTANCE (real part of the Thevenin impedance): that is what adds
  // to Re in Qes' = Qes·(Re + Rs)/Re. The reactive part of a series coil is
  // reported separately as |Z| but does not damp like a resistor.
  const rSourceOf = (net: Probe['net'], drv: typeof lowDrv): number | null => {
    if (!drv || fbIdx === null || !probeCtx) return null;
    if (rSourceOutOfBand) return null; // measured below; see rSourceFull
    const zs = seenImpedance(
      net,
      [drv.id],
      drv.nodes,
      [probeGrid[fbIdx]],
      sliceDriverZ(probeCtx.driverZ, [fbIdx]),
    );
    return zs ? Math.max(0, zs[0].re) : null;
  };
  const rSourceFull = rSourceOutOfBand ? seriesPathResistanceOhm(parts) : rSourceOf(full.net, lowDrv);

  // ---- Candidates: single free R/L/C parts + series chains ----
  const partById = new Map<string, VxpPart>();
  for (const p of parts) if (p.partId && RLC.has(p.type) && !p.open && !p.shorted) partById.set(p.partId, p);
  const posOf = busPositions(parts);
  const cands: { ids: string[]; ends: [number, number] | null }[] = [];
  for (const id of partById.keys()) cands.push({ ids: [id], ends: null });
  for (const ch of seriesChains(full.net)) {
    if (ch.ids.every((id) => partById.has(id))) cands.push({ ids: ch.ids, ends: ch.ends });
  }

  const entries: PartAuditEntry[] = [];
  for (const cand of cands) {
    const members = cand.ids.map((id) => partById.get(id)!);
    const locked = members.some((m) => m.locked === true);
    // Both removal variants; the one with the SMALLER effect says what the
    // part does (the wrong variant merely breaks the network).
    type Var = { mode: 'open' | 'shorted'; dA: number; dP: number; dZmin: number; dRs: number | null; probe: Probe };
    const variants: Var[] = [];
    for (const mode of ['open', 'shorted'] as const) {
      const trial = parts.map((p) => (p.partId && cand.ids.includes(p.partId) ? { ...p, [mode]: true } : p));
      const pr = probeOf(trial, ctx);
      if (!pr) continue;
      let dA = 0;
      for (let i = 0; i < grid.length; i++) {
        if (!inBand[i]) continue;
        const d = Math.abs(pr.spl[i] - full.spl[i]);
        if (Number.isFinite(d) && d > dA) dA = d;
      }
      let dP = 0;
      for (let k = 0; k < full.pairErr.length; k++) {
        const ref = full.pairErr[k];
        const alt = pr.pairErr[k];
        const diffs: number[] = [];
        for (let i = 0; i < ref.err.length; i++) {
          if (!ref.core[i]) continue;
          // A point that left the overlap window altogether means the branch
          // died there — count it as a full reversal.
          const v = alt && Number.isFinite(alt.err[i]) ? Math.abs(alt.err[i] - ref.err[i]) : 180;
          diffs.push(v);
        }
        const d = p95Of(diffs);
        if (d > dP) dP = d;
      }
      const dZmin = pr.zMinOhm - full.zMinOhm;
      // The probed low driver keeps its id in the variant net (only the
      // candidate's own elements vanish).
      const lowInVariant = lowDrv
        ? (pr.net.elements.find((e) => e.kind === 'driver' && e.id === lowDrv.id) as typeof lowDrv | undefined) ?? null
        : null;
      const rsV = rSourceOf(pr.net, lowInVariant);
      const dRs = rsV !== null && rSourceFull !== null ? rsV - rSourceFull : null;
      variants.push({ mode, dA, dP, dZmin, dRs, probe: pr });
    }
    if (variants.length === 0) continue;
    variants.sort((a, b) => a.dA + a.dP / 10 - (b.dA + b.dP / 10));
    const v = variants[0];

    const reasons: string[] = [];
    // Only a removal that DROPS the minimum under the floor earns the part;
    // a part that drags the minimum under the floor is a liability the
    // amp-floor repair owns, and its removal LIFTS the minimum (reported, never
    // "earned").
    const dropsUnderFloor =
      zFloor !== null && full.zMinOhm >= zFloor && v.probe.zMinOhm < zFloor;
    const liftsOverFloor =
      zFloor !== null && full.zMinOhm < zFloor && v.probe.zMinOhm >= zFloor;
    const crossesFloor = dropsUnderFloor;
    const rsFull = rSourceFull;
    const rsVar = rsFull !== null && v.dRs !== null ? rsFull + v.dRs : null;
    /* V34 — a null tier is no tier: nothing crosses a limit that was never
     * stated, and a part cannot be EARNED by a boundary nobody drew (P4). */
    const rsTier = thr.rSourceOhm;
    const crossesRs =
      rsTier !== null && rsFull !== null && rsVar !== null && rsFull > rsTier !== rsVar > rsTier;
    const dZneg = Math.abs(v.dZmin) < thr.inertZOhm && (v.dRs === null || Math.abs(v.dRs) < thr.inertZOhm) && !crossesFloor && !crossesRs;
    let verdict: AuditVerdict;
    if (v.dA >= thr.earnedDb) reasons.push(`sum moves ${v.dA.toFixed(2)} dB without it`);
    if (v.dP >= thr.earnedDeg) reasons.push(`pair phase P95 worsens ${v.dP.toFixed(1)}° without it`);
    const liftNote = liftsOverFloor
      ? `removal LIFTS Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω over your amplifier's ${zFloor} Ω minimum`
      : null;
    if (crossesFloor) reasons.push(`Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω crosses your amplifier's ${zFloor} Ω minimum`);
    else if (v.dZmin <= -thr.zMinStepOhm) reasons.push(`Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω`);
    if (crossesRs && rsVar !== null && rsFull !== null)
      reasons.push(`source R at the low driver ${rsFull.toFixed(2)} → ${rsVar.toFixed(2)} Ω crosses the ${rsTier} Ω limit`);
    if (reasons.length > 0) verdict = 'earned';
    else if (v.dA < thr.inertDb && v.dP < thr.inertDeg && dZneg) {
      verdict = 'inert';
      reasons.push(`sum ±${v.dA.toFixed(2)} dB, phase ${v.dP.toFixed(1)}°, Z ±${Math.abs(v.dZmin).toFixed(2)} Ω without it`);
    } else {
      verdict = 'grey';
      reasons.push(`sum ±${v.dA.toFixed(2)} dB, phase ${v.dP.toFixed(1)}° without it — not inert, not clearly earned`);
      if (liftNote) reasons.push(liftNote);
      else if (v.dZmin >= thr.zMinStepOhm) reasons.push(`removal lifts Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω`);
    }

    // ---- Didactic ratio |Z_part| / |Z_seen| over the branch's live band ----
    let ratio: PartAuditEntry['ratio'] = null;
    try {
      const pos = posOf(cand.ids[0]);
      // Attribution: the branch whose SPL moved most when the part went.
      let bestRole = 0;
      let bestMove = -1;
      full.branches.forEach((b, k) => {
        const other = v.probe.branches[k];
        if (!other) return;
        let mv = 0;
        for (let i = 0; i < grid.length; i++) {
          if (!inBand[i] || b.spl[i] < -300) continue;
          mv = Math.max(mv, Math.abs(other.spl[i] - b.spl[i]));
        }
        if (mv > bestMove) {
          bestMove = mv;
          bestRole = k;
        }
      });
      const br = full.branches[bestRole];
      // Live band: branch within 12 dB of the (unsmoothed) sum — use the
      // smoothed sum as reference; the tolerance is wide enough.
      const live = grid.map((_, i) => inBand[i] && br.spl[i] > full.spl[i] - 12);
      const liveIdx = live.map((ok, i) => (ok ? i : -1)).filter((i) => i >= 0);
      if (liveIdx.length >= 3) {
        const freqs = liveIdx.map((i) => grid[i]);
        // Impedance of the candidate itself (series sum for a chain).
        let zPart: number[] | null = null;
        for (const m of members) {
          const zi = partImpedance(m, freqs);
          if (!zi) {
            zPart = null;
            break;
          }
          zPart = zPart ? zPart.map((a, k) => a + zi[k]) : zi;
        }
        // Terminals: single part = its element's nodes; chain = its ends.
        const el = full.net.elements.find((e) => e.id === cand.ids[0]);
        const nodes: [number, number] | null = cand.ends ?? (el ? el.nodes : null);
        if (zPart && nodes && nodes[0] !== nodes[1]) {
          const zSeen = seenImpedance(full.net, cand.ids, nodes, freqs, sliceDriverZ(ctx.driverZ, liveIdx));
          if (zSeen) {
            const rs = zPart
              .map((a, k) => {
                const m = Math.hypot(zSeen[k].re, zSeen[k].im);
                return m > 0 ? a / m : Infinity;
              })
              .filter(Number.isFinite)
              .sort((a, b) => a - b);
            if (rs.length > 0) {
              ratio = { median: rs[rs.length >> 1], kind: pos, bandHz: [freqs[0], freqs[freqs.length - 1]] };
            }
          }
        }
      }
    } catch {
      ratio = null;
    }

    let costEur: number | null = null;
    if (ctx.costOf) {
      let s = 0;
      let any = false;
      for (const m of members) {
        const c = ctx.costOf(m);
        if (c !== null) {
          s += c;
          any = true;
        }
      }
      costEur = any ? s : null;
    }

    entries.push({
      ids: cand.ids,
      label: cand.ids.length === 1 ? cand.ids[0] : `${cand.ids.join(' + ')} (series chain)`,
      role: roleGuess(members, posOf(cand.ids[0])),
      mode: v.mode,
      dA: v.dA,
      dP: v.dP,
      dZmin: v.dZmin,
      dRsource: v.dRs,
      verdict,
      reasons,
      locked,
      costEur,
      ratio,
    });
  }

  const qesFactor = rSourceFull !== null && reOhm !== null && reOhm > 0 ? (reOhm + rSourceFull) / reOhm : null;
  return {
    entries,
    rSourceTunedOhm: rSourceFull,
    rSourceOutOfBand,
    rSourceAtHz: fbIdx !== null ? probeGrid[fbIdx] : null,
    reOhm,
    qesFactor,
    rSourceWarn:
      thr.rSourceOhm !== null && rSourceFull !== null && rSourceFull > thr.rSourceOhm,
    /* V34: "the probe landed on a boundary of its own search window", which
     * before this entry could only mean the bottom one. Still false whenever a
     * stated box tuning put it there, for the reason above `ProbeEdgeRule`:
     * that frequency is the answer to a question the designer asked. */
    rSourceAtGridEdge:
      fbIdx !== null &&
      rSourceOutOfBand &&
      !(ctx.fbHz !== undefined && probeGrid.length > 0 && ctx.fbHz >= probeGrid[0]),
    zMinOhm: full.zMinOhm,
    bandHz: band,
    thresholds: thr,
  };
}
