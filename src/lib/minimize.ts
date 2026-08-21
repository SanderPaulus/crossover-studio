/**
 * "Afslank-pass" — the MINIMAL network that still meets the design goals
 * (aug 2026, Sanders: "het knikpunt aanwijzen is een mensbeslissing").
 *
 * Runs ON REQUEST on the selected candidate/network, never silently:
 *  C1. Iteratively remove the most EXPENSIVE part that poort 4 did NOT mark
 *      EARNED (grey/inert first), retune the rest, keep the removal while
 *      the staged targets, the fundamentals (crossing, valley, tweeter
 *      protection, leak, Z floor) and the source-R limit all survive. Stop
 *      when no removal fits.
 *  C2. Substitution: for every remaining R/L/C try the CHEAPER catalog parts
 *      within ±25 % of the value (coarser series value, thinner wire) and
 *      keep the cheapest that still meets targets + fundamentals + source-R
 *      (re-solve only, no retune) — the DCR ceiling is respected through the
 *      source-R gate.
 *  C3. "Two-for-one" — REPORT ONLY: a series coil + series resistor in one
 *      branch where a higher-DCR coil could do both jobs.
 *  C4. Report: BOM before/after, saving, quality deltas, every step.
 *
 * Nothing here writes to the stored design; the caller shows the report and
 * the user decides.
 */
import type { VxpPart } from './parsers/vxp.ts';
import type { Complex } from './complex.ts';
import type { GriddedResponse, TweeterAdjust } from './dsp.ts';
import {
  optimizeNetworkValues,
  type NetOptimizeOptions,
  type NetOptimizeResult,
  Z_FLOOR_OHM,
} from './netOptimizer.ts';
import { auditNetwork, sourceResistanceOhm, type NetworkAudit } from './partAudit.ts';
import { bomFor, nearestParts, type CatalogPart } from './catalog.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';

export interface MinimizeStep {
  kind: 'remove' | 'substitute' | 'suggest';
  partIds: string[];
  label: string;
  /** EUR saved by this step (null when a price was missing). */
  savingEur: number | null;
  /** Quality after the step (peak ±dB / worst-pair phase / R_src Ω / Z min Ω). */
  after: { peakDb: number; phaseDeg: number; rSourceOhm: number | null; zMinOhm: number | null };
  note: string;
}

export interface MinimizeResult {
  parts: VxpPart[];
  bomBeforeEur: number | null;
  bomAfterEur: number | null;
  unpricedBefore: number;
  unpricedAfter: number;
  before: { peakDb: number; phaseDeg: number; rSourceOhm: number | null; zMinOhm: number | null };
  after: { peakDb: number; phaseDeg: number; rSourceOhm: number | null; zMinOhm: number | null };
  steps: MinimizeStep[];
  /** C3 suggestions — never applied. */
  suggestions: string[];
  /** Why it stopped. */
  stop: string;
}

export interface MinimizeOptions {
  /** Staged targets the network must keep meeting. Required — without a
   *  goal "minimal" is meaningless. */
  targets: { rippleDb: number; phaseDeg: number };
  /** Source-resistance limit at the low driver (Ω). Default 1.0. */
  rSourceLimitOhm?: number;
  /** Fb of the low branch for the source-R probe, if known. */
  fbHz?: number;
  /** Tuner options for the retune after each removal (band, priorities,
   *  branch targets, midBranch, …). `staged`/`catalogSnap`/`audit` are set
   *  here. */
  tuneOpts?: NetOptimizeOptions;
  /** Max removal rounds. Default 12. */
  maxRemovals?: number;
  /** Try cheaper catalog substitutes (C2). Default true. */
  substitute?: boolean;
  onStage?: (label: string) => void;
}

const RLC = new Set(['Resistor', 'Inductor', 'Capacitor']);

export function minimizeNetwork(
  parts0: readonly VxpPart[],
  grid: readonly number[],
  wBase: GriddedResponse,
  tBase: GriddedResponse,
  driverZ: Record<string, readonly Complex[]>,
  adjust: TweeterAdjust,
  opts: MinimizeOptions,
): MinimizeResult {
  const rsLimit = opts.rSourceLimitOhm ?? 1.0;
  const tune = (ps: readonly VxpPart[], retune: boolean): NetOptimizeResult =>
    optimizeNetworkValues(ps, grid, wBase, tBase, driverZ, adjust, {
      ...(opts.tuneOpts ?? {}),
      staged: opts.targets,
      catalogSnap: false,
      audit: { ...(opts.tuneOpts?.audit ?? {}), enabled: true, fbHz: opts.fbHz, thresholds: { ...(opts.tuneOpts?.audit?.thresholds ?? {}), rSourceOhm: rsLimit } },
      ...(retune ? {} : { maxIterations: 1 }),
      onStage: opts.onStage ? (l) => opts.onStage?.(l) : undefined,
    });
  const measure = (r: NetOptimizeResult) => ({
    peakDb: r.after.rippleDb,
    phaseDeg: r.after.pairPhaseDeg && r.after.pairPhaseDeg.length > 0 ? Math.max(...r.after.pairPhaseDeg) : r.after.phaseDeg,
    // A3g: the DELIVERED reading, never the audit's (which describes the
    // network as it stood at gate 4, before the shrink ladder and the snap).
    rSourceOhm: r.after.rSourceOhm ?? sourceResistanceOhm(r.parts, { grid, driverZ, fbHz: opts.fbHz }),
    zMinOhm: r.after.zMinOhm ?? null,
  });
  const ok = (m: ReturnType<typeof measure>, ref: ReturnType<typeof measure>): boolean =>
    m.peakDb <= opts.targets.rippleDb + 1e-9 &&
    m.phaseDeg <= opts.targets.phaseDeg + 1e-9 &&
    (m.zMinOhm === null || m.zMinOhm >= Math.min(Z_FLOOR_OHM, (ref.zMinOhm ?? Z_FLOOR_OHM) - 0.05)) &&
    (m.rSourceOhm === null || m.rSourceOhm <= Math.max(rsLimit, (ref.rSourceOhm ?? 0) + 1e-6));

  opts.onStage?.('minimize: baseline');
  const bom0 = bomFor(parts0);
  let cur = tune(parts0, true);
  const before = measure(cur);
  const steps: MinimizeStep[] = [];
  const suggestions: string[] = [];
  let stop = '';
  // The baseline tune itself removes what poort 4 finds INERT and what the
  // staged prune sheds — those are minimisation steps too, reported as such.
  const priceOf = (ps: readonly VxpPart[]) => bomFor(ps).totalEur;
  const gone = new Set<string>([...cur.removed, ...(cur.audit?.entries.filter((e) => e.applied).flatMap((e) => e.ids) ?? [])]);
  if (gone.size > 0) {
    const m0 = measure(cur);
    const p0 = priceOf(parts0);
    const p1 = priceOf(cur.parts);
    for (const id of gone) {
      const e = cur.audit?.entries.find((x) => x.ids.length === 1 && x.ids[0] === id);
      steps.push({
        kind: 'remove',
        partIds: [id],
        label: e ? `${e.label} (${e.role})` : id,
        savingEur: null,
        after: m0,
        note: e?.applied ? `inert (poort 4): dA ${e.dA.toFixed(2)} dB · dP ${e.dP.toFixed(1)}°` : 'staged prune: targets and fundamentals held without it',
      });
    }
    // One saving figure for the whole baseline batch (prices are per part,
    // but the batch is what the tune delivered).
    if (p0 !== null && p1 !== null && steps.length > 0) steps[steps.length - 1].savingEur = p0 - p1;
  }

  // ---- C1: remove the most expensive non-earned part, retune, keep if ok ----
  const maxRem = opts.maxRemovals ?? 12;
  for (let round = 0; round < maxRem; round++) {
    opts.onStage?.(`minimize: removal round ${round + 1}`);
    const audit: NetworkAudit | null = cur.audit ?? auditNetwork(cur.parts, {
      grid, wBase, tBase, driverZ, adjust, fbHz: opts.fbHz, zFloorOhm: Z_FLOOR_OHM,
      thresholds: { rSourceOhm: rsLimit },
    } as Parameters<typeof auditNetwork>[1]);
    if (!audit) { stop = 'no audit (network does not solve)'; break; }
    const cands = audit.entries
      .filter((e) => e.ids.length === 1 && e.verdict !== 'earned' && !e.locked)
      .map((e) => ({ e, cost: e.costEur ?? 0 }))
      .sort((a, b) => b.cost - a.cost);
    let accepted = false;
    for (const c of cands) {
      const id = c.e.ids[0];
      // Try both removal variants; the tuner's objective rejects the wrong one.
      for (const mode of ['open', 'shorted'] as const) {
        const trial = cur.parts.map((p) => (p.partId === id ? { ...p, [mode]: true } : p));
        let r: NetOptimizeResult;
        try { r = tune(trial, true); } catch { continue; }
        const m = measure(r);
        if (!ok(m, before)) continue;
        // Materialise: open part gone, shorted part → wire.
        const outParts: VxpPart[] = [];
        for (const p of r.parts) {
          if (p.partId === id && (p as VxpPart).open) continue;
          if (p.partId === id && (p as VxpPart).shorted) {
            outParts.push({ type: 'Wire', params: [], wires: [{ ...p.wires[0] }, { ...p.wires[p.wires.length - 1] }] });
            continue;
          }
          outParts.push(p);
        }
        const bomNow = bomFor(outParts).totalEur;
        const saving = bomNow !== null && bomFor(cur.parts).totalEur !== null ? bomFor(cur.parts).totalEur! - bomNow : null;
        steps.push({
          kind: 'remove',
          partIds: [id],
          label: `${c.e.label} (${c.e.role}) ${mode}`,
          savingEur: saving,
          after: m,
          note: `verdict ${c.e.verdict}: dA ${c.e.dA.toFixed(2)} dB · dP ${c.e.dP.toFixed(1)}° — targets and fundamentals hold after retune`,
        });
        cur = { ...r, parts: outParts };
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (!accepted) { stop = round === 0 ? 'no non-earned part can go without breaking a target or a fundamental' : 'no further removal fits'; break; }
  }
  if (!stop) stop = 'removal rounds exhausted';

  // ---- C2: cheaper catalog substitutes, re-solve only ----
  if (opts.substitute !== false) {
    opts.onStage?.('minimize: substitution');
    const kindOf: Record<string, 'L' | 'C' | 'R'> = { Inductor: 'L', Capacitor: 'C', Resistor: 'R' };
    const toSi: Record<string, number> = { L: 1e-3, C: 1e-6, R: 1 };
    const paramName: Record<string, string> = { L: 'L', C: 'C', R: 'R' };
    const refM = measure(cur);
    for (let i = 0; i < cur.parts.length; i++) {
      const q = cur.parts[i];
      if (!q.partId || !RLC.has(q.type) || q.locked || q.open || q.shorted) continue;
      const kind = kindOf[q.type];
      const val = Number(q.params.find((p) => p.name === paramName[kind])?.value) * toSi[kind];
      if (!(val > 0)) continue;
      const row = bomFor([q]).rows[0];
      const curPrice = row?.match?.priceEur ?? row?.stackMatch?.priceEur ?? null;
      const cheaper: CatalogPart[] = nearestParts(kind, val, 12)
        .filter((p) => p.priceEur !== undefined && (curPrice === null || p.priceEur < curPrice - 0.01))
        .filter((p) => Math.abs(p.value / val - 1) <= 0.25)
        .sort((a, b) => (a.priceEur ?? 0) - (b.priceEur ?? 0));
      for (const p of cheaper) {
        const trial = cur.parts.map((x, j) => {
          if (j !== i) return x;
          let params = x.params.map((pr) => (pr.name === paramName[kind] ? { ...pr, value: Number((p.value / toSi[kind]).toPrecision(4)) } : pr));
          if (kind === 'L') params = params.some((pr) => pr.name === 'DCR') ? params.map((pr) => (pr.name === 'DCR' ? { ...pr, value: Number(p.seriesR.toPrecision(3)) } : pr)) : [...params, { name: 'DCR', value: Number(p.seriesR.toPrecision(3)), unit: 'Ω' }];
          if (kind === 'C') params = params.some((pr) => pr.name === 'ESR') ? params.map((pr) => (pr.name === 'ESR' ? { ...pr, value: Number(p.seriesR.toPrecision(3)) } : pr)) : [...params, { name: 'ESR', value: Number(p.seriesR.toPrecision(3)), unit: 'Ω' }];
          return { ...x, params, catalog: p.id };
        });
        let r: NetOptimizeResult;
        try { r = tune(trial, false); } catch { continue; }
        const m = measure(r);
        if (!ok(m, before)) continue;
        const saving = curPrice !== null && p.priceEur !== undefined ? curPrice - p.priceEur : null;
        steps.push({
          kind: 'substitute',
          partIds: [q.partId],
          label: `${q.partId}: ${row?.match?.id ?? 'current'} → ${p.brand} ${p.series} ${p.id}`,
          savingEur: saving,
          after: m,
          note: `cheaper catalog part within 25 % of the value (DCR/ESR ${p.seriesR.toFixed(2)} Ω); targets, fundamentals and source-R hold`,
        });
        cur = { ...cur, parts: r.parts.map((x, j) => (j === i ? trial[i] : x)) };
        break;
      }
    }
    void refM;
  }

  // ---- C3: two-for-one suggestions (report only) ----
  try {
    const { netlist } = crossoverToNetlist({ name: 'min', parts: [...cur.parts] });
    const els = netlist.elements;
    for (const L of els) {
      if (L.kind !== 'L') continue;
      for (const R of els) {
        if (R.kind !== 'R') continue;
        const shared = L.nodes.filter((n) => n !== 0 && R.nodes.includes(n));
        if (shared.length !== 1) continue;
        const node = shared[0];
        const deg = els.filter((e) => 'nodes' in e && (e.nodes as number[]).includes(node)).length;
        if (deg === 2) suggestions.push(`${L.id} + ${R.id} in series: a ${L.id} wound with ~${((L.seriesR ?? 0) + R.value).toFixed(2)} Ω DCR could do the flank and the level in one part (check the source-R limit before you do)`);
      }
    }
  } catch {
    /* no suggestions */
  }

  const after = measure(cur);
  const bom1 = bomFor(cur.parts);
  return {
    parts: cur.parts,
    bomBeforeEur: bom0.totalEur,
    bomAfterEur: bom1.totalEur,
    unpricedBefore: bom0.unmatchedCount,
    unpricedAfter: bom1.unmatchedCount,
    before,
    after,
    steps,
    suggestions,
    stop,
  };
}
