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
import { busPositions } from './netOptimizer.ts';

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
   *  either way earns a part; exceeding it flags the network. */
  rSourceOhm: number;
}

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
  rSourceOhm: 1.0,
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
  /** Thevenin source impedance |Z| the low driver sees at `rSourceAtHz`. */
  rSourceOhm: number | null;
  rSourceAtHz: number | null;
  /** Estimated voice-coil Re (min |Z| below resonance) and the resulting
   *  Qes multiplier (Re + Rs)/Re — the low-end damping cost of the network. */
  reOhm: number | null;
  qesFactor: number | null;
  /** rSourceOhm exceeds the limit — independent of any per-part verdict. */
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
  /** Amp-load floor (ohms) — the Z minimum "tipping over" it earns a part. */
  zFloorOhm?: number;
  /** Cost of one part, EUR (nearest catalog part), or null. */
  costOf?: (p: VxpPart) => number | null;
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

export function auditNetwork(parts: readonly VxpPart[], ctx: AuditContext): NetworkAudit | null {
  const thr: AuditThresholds = { ...DEFAULT_AUDIT_THRESHOLDS, ...(ctx.thresholds ?? {}) };
  const zFloor = ctx.zFloorOhm ?? 2.5;
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
  let fbIdx: number | null = null;
  let reOhm: number | null = null;
  if (lowDrv) {
    const z = ctx.driverZ[lowDrv.model];
    if (z) {
      if (ctx.fbHz !== undefined && ctx.fbHz > 0) {
        fbIdx = grid.reduce((b, f, i) => (Math.abs(f - ctx.fbHz!) < Math.abs(grid[b] - ctx.fbHz!) ? i : b), 0);
      } else {
        // Impedance peak on the low half of the grid (≤ 400 Hz, else lowest 1/4).
        let best = -1;
        let bestZ = -Infinity;
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] > Math.max(400, grid[Math.floor(grid.length / 4)])) break;
          const m = Math.hypot(z[i].re, z[i].im);
          if (m > bestZ) {
            bestZ = m;
            best = i;
          }
        }
        fbIdx = best >= 0 ? best : null;
      }
      if (fbIdx !== null) {
        // Re ≈ the |Z| minimum just below resonance, or in the dip right above
        // it when the grid starts at/near the peak — never the whole-grid min
        // (that is the mid-band dip of the network's own filter).
        let mn = Infinity;
        for (let i = 0; i <= fbIdx; i++) mn = Math.min(mn, Math.hypot(z[i].re, z[i].im));
        for (let i = fbIdx; i < grid.length && grid[i] <= grid[fbIdx] * 6; i++) {
          mn = Math.min(mn, Math.hypot(z[i].re, z[i].im));
        }
        reOhm = Number.isFinite(mn) ? mn : null;
      }
    }
  }
  // Source RESISTANCE (real part of the Thevenin impedance): that is what adds
  // to Re in Qes' = Qes·(Re + Rs)/Re. The reactive part of a series coil is
  // reported separately as |Z| but does not damp like a resistor.
  const rSourceOf = (net: Probe['net'], drv: typeof lowDrv): number | null => {
    if (!drv || fbIdx === null) return null;
    const zs = seenImpedance(net, [drv.id], drv.nodes, [grid[fbIdx]], ctx.driverZ);
    return zs ? Math.max(0, zs[0].re) : null;
  };
  const rSourceFull = rSourceOf(full.net, lowDrv);

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
    const dropsUnderFloor = full.zMinOhm >= zFloor && v.probe.zMinOhm < zFloor;
    const liftsOverFloor = full.zMinOhm < zFloor && v.probe.zMinOhm >= zFloor;
    const crossesFloor = dropsUnderFloor;
    const rsFull = rSourceFull;
    const rsVar = rsFull !== null && v.dRs !== null ? rsFull + v.dRs : null;
    const crossesRs = rsFull !== null && rsVar !== null && rsFull > thr.rSourceOhm !== rsVar > thr.rSourceOhm;
    const dZneg = Math.abs(v.dZmin) < thr.inertZOhm && (v.dRs === null || Math.abs(v.dRs) < thr.inertZOhm) && !crossesFloor && !crossesRs;
    let verdict: AuditVerdict;
    if (v.dA >= thr.earnedDb) reasons.push(`sum moves ${v.dA.toFixed(2)} dB without it`);
    if (v.dP >= thr.earnedDeg) reasons.push(`pair phase P95 worsens ${v.dP.toFixed(1)}° without it`);
    const liftNote = liftsOverFloor
      ? `removal LIFTS Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω over the ${zFloor} Ω floor`
      : null;
    if (crossesFloor) reasons.push(`Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω crosses the ${zFloor} Ω floor`);
    else if (v.dZmin <= -thr.zMinStepOhm) reasons.push(`Z min ${full.zMinOhm.toFixed(2)} → ${v.probe.zMinOhm.toFixed(2)} Ω`);
    if (crossesRs && rsVar !== null && rsFull !== null)
      reasons.push(`source R at the low driver ${rsFull.toFixed(2)} → ${rsVar.toFixed(2)} Ω crosses the ${thr.rSourceOhm} Ω limit`);
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
          const zSeen = seenImpedance(full.net, cand.ids, nodes, freqs, ctx.driverZ);
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
    rSourceOhm: rSourceFull,
    rSourceAtHz: fbIdx !== null ? grid[fbIdx] : null,
    reOhm,
    qesFactor,
    rSourceWarn: rSourceFull !== null && rSourceFull > thr.rSourceOhm,
    rSourceAtGridEdge: fbIdx === 0 && !(ctx.fbHz !== undefined && ctx.fbHz >= grid[0]),
    zMinOhm: full.zMinOhm,
    bandHz: band,
    thresholds: thr,
  };
}
