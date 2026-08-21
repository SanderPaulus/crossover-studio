/**
 * IMPEDANCE DIAGNOSIS — read-only. Nothing here influences a search or a
 * ranking; it exists so a designer can see what the amplifier will meet, and
 * see it at IMPORT rather than after a twenty-minute scan.
 *
 * WHY THE DIAGNOSTIC AXIS IS A RATIO AND NOT A THRESHOLD (Sander, aug 2026).
 * His filter delivers a system minimum of 2.62 Ω at 82 Hz while both handovers
 * are clean — 7.7 Ω at 400 Hz, 10.9 Ω at 2.5 kHz. The dip sits in the woofer's
 * OWN passband, nowhere near a crossing, so a check that inspects handover
 * regions would have found nothing. Measured across the scan candidates the
 * same holds: one delivered its minimum at 3230 Hz with crossings at 560 and
 * 2016 Hz, two thirds of an octave away from either.
 *
 * So "overlap between branches" is not the explanation, and distance to a
 * crossing is not the diagnostic. What IS diagnostic is
 *
 *     ratio(f) = |Z_delivered_branch(f)| / |Z_bare_driver(f)|
 *
 * because it is driver-independent: it separates "this filter drags the load
 * below its own driver" from "this driver is simply a low-impedance driver".
 * On his woofer branch the ratio reaches 0.66 — 2.67 Ω where the bare driver
 * stands at 4.06 — and that is a statement about the network, not the woofer.
 */

import type { Complex } from './complex.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import { busTopology } from './netOptimizer.ts';
import type { VxpPart } from './parsers/vxp.ts';

const mag = (z: Complex): number => Math.hypot(z.re, z.im);

/* ------------------------------------------------------------------ *
 * 1a — what the drivers themselves are, before any filter
 * ------------------------------------------------------------------ */

export interface SourceZFacts {
  /** Branch/driver name as the project knows it. */
  name: string;
  /** Minimum |Z| of ONE driver over the band, and where. */
  singleOhm: number;
  singleAtHz: number;
  /** How many of them are wired in parallel on this branch. */
  count: number;
  /** What the branch therefore presents: singleOhm / count. */
  branchOhm: number;
}

export interface BareSystemFacts {
  perSource: SourceZFacts[];
  /** All branches in parallel with NO filter at all — the absolute floor any
   *  passive network starts from, and the number that decides whether "4 Ω
   *  nominal" was ever realistic. */
  parallelOhm: number;
  parallelAtHz: number;
  /** Human-readable, for the import panel. */
  lines: string[];
}

/**
 * What the loaded impedances mean before anything is designed.
 *
 * Deliberately at IMPORT: this is the moment a designer can still change the
 * plan, and "two 8 Ω woofers in parallel is a 4 Ω nominal load whose minimum
 * is 3.2 Ω" is not something to discover from a scan result.
 */
export function bareSystemFacts(
  freq: readonly number[],
  branches: { name: string; z: readonly Complex[]; count?: number }[],
  band: [number, number] = [20, 20000],
): BareSystemFacts | null {
  if (branches.length === 0) return null;
  const inBand = (f: number) => f >= band[0] && f <= band[1];
  const perSource: SourceZFacts[] = branches.map((b) => {
    const count = Math.max(1, Math.round(b.count ?? 1));
    let lo = Infinity;
    let at = 0;
    for (let i = 0; i < freq.length; i++) {
      if (!inBand(freq[i])) continue;
      const m = mag(b.z[i]);
      if (m < lo) {
        lo = m;
        at = freq[i];
      }
    }
    return { name: b.name, singleOhm: lo, singleAtHz: at, count, branchOhm: lo / count };
  });

  // The bare parallel of every branch, complex — magnitudes would overstate it
  // wherever two branches are reactive in opposite directions.
  let parallelOhm = Infinity;
  let parallelAtHz = 0;
  for (let i = 0; i < freq.length; i++) {
    if (!inBand(freq[i])) continue;
    let yre = 0;
    let yim = 0;
    for (let b = 0; b < branches.length; b++) {
      const count = Math.max(1, Math.round(branches[b].count ?? 1));
      const z = branches[b].z[i];
      const d = z.re * z.re + z.im * z.im;
      yre += (count * z.re) / d;
      yim += (-count * z.im) / d;
    }
    const m = 1 / Math.hypot(yre, yim);
    if (m < parallelOhm) {
      parallelOhm = m;
      parallelAtHz = freq[i];
    }
  }

  const lines = perSource.map((s) =>
    s.count > 1
      ? `${s.name}: ${s.singleOhm.toFixed(2)} Ω minimum at ${Math.round(s.singleAtHz)} Hz, ` +
        `${s.count} in parallel → ${s.branchOhm.toFixed(2)} Ω`
      : `${s.name}: ${s.singleOhm.toFixed(2)} Ω minimum at ${Math.round(s.singleAtHz)} Hz`,
  );
  lines.push(
    `all branches in parallel, unfiltered: ${parallelOhm.toFixed(2)} Ω at ` +
      `${Math.round(parallelAtHz)} Hz — a passive filter has to LIFT the load above this, ` +
      `not merely leave it alone`,
  );
  return { perSource, parallelOhm, parallelAtHz, lines };
}

/* ------------------------------------------------------------------ *
 * 1b — what the filter did to each branch
 * ------------------------------------------------------------------ */

/**
 * Which branch each component belongs to.
 *
 * ⚠ NOT `busTopology().driversOf()`, and the difference cost a test. That
 * function answers "which drivers does this element sit in the SERIES PATH
 * of", so a shunt capacitor returns [] — correct for its own purpose, wrong
 * here, because a shunt cap across a driver is unambiguously part of that
 * branch and is exactly the element this module has to be able to accuse.
 * Building on it left the shunt out of the woofer branch, and the branches
 * then did not parallel back to the system: the self-consistency test caught
 * a number that was otherwise entirely plausible.
 *
 * The rule that IS right: cut the graph at its two boundary nodes — the
 * amplifier's hot terminal and ground — and whatever stays connected is one
 * branch. Every element touching that component belongs to it; an element
 * touching two of them is SHARED and makes a per-branch impedance undefined.
 */
function branchOfPart(parts: readonly VxpPart[]): Map<string, string[]> | null {
  try {
    const { netlist } = crossoverToNetlist({ name: 'split', parts: [...parts] });
    const src = netlist.elements.find((e) => e.kind === 'source');
    if (!src) return null;
    const hot = src.nodes[0] === 0 ? src.nodes[1] : src.nodes[0];
    const boundary = (n: number) => n === 0 || n === hot;

    const parent = new Map<number, number>();
    const find = (n: number): number => {
      let r = n;
      while ((parent.get(r) ?? r) !== r) r = parent.get(r)!;
      let c = n;
      while ((parent.get(c) ?? c) !== c) {
        const nx = parent.get(c)!;
        parent.set(c, r);
        c = nx;
      }
      return r;
    };
    const union = (a2: number, b2: number) => {
      const ra = find(a2);
      const rb = find(b2);
      if (ra !== rb) parent.set(ra, rb);
    };
    for (const e of netlist.elements) {
      if (e.kind === 'source') continue;
      const [n1, n2] = e.nodes;
      if (!boundary(n1) && !boundary(n2)) union(n1, n2);
    }
    // component root -> driver models sitting in it
    const drivers = new Map<number, string[]>();
    for (const e of netlist.elements) {
      if (e.kind !== 'driver') continue;
      const n = boundary(e.nodes[0]) ? e.nodes[1] : e.nodes[0];
      if (boundary(n)) continue; // a driver straight across the terminals
      const r = find(n);
      drivers.set(r, [...(drivers.get(r) ?? []), e.model]);
    }
    const out = new Map<string, string[]>();
    for (const e of netlist.elements) {
      if (e.kind !== 'R' && e.kind !== 'L' && e.kind !== 'C') continue;
      const roots = new Set<number>();
      for (const n of e.nodes) if (!boundary(n)) roots.add(find(n));
      const models = new Set<string>();
      for (const r of roots) for (const m of drivers.get(r) ?? []) models.add(m);
      out.set(e.id, [...models]);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * The impedance of ONE branch as the bus sees it: the generator, the wires,
 * this branch's own components and its driver — everything else removed.
 *
 * A part feeding several drivers is SHARED, and then a per-branch impedance is
 * not a well-defined thing; the function says so by returning null rather than
 * by returning a number that happens to compute.
 */
export function branchImpedance(
  parts: readonly VxpPart[],
  driverModel: string,
  freq: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
): { z: Complex[]; shared: string[] } | null {
  const member = branchOfPart(parts);
  if (!member) return null;
  const shared: string[] = [];
  const keep: VxpPart[] = [];
  for (const p of parts) {
    if (p.type === 'Generator' || p.type === 'Ground' || p.type === 'Wire') {
      keep.push(p);
      continue;
    }
    if (p.type === 'Driver') {
      if (p.model === driverModel) keep.push(p);
      continue;
    }
    const feeds = p.partId ? (member.get(p.partId) ?? []) : [];
    if (feeds.length === 0) continue; // touches no branch (e.g. across the input)
    if (feeds.includes(driverModel)) {
      if (feeds.length > 1) shared.push(p.partId ?? '?');
      keep.push(p);
    }
  }
  if (shared.length > 0) return null;
  try {
    const { netlist } = crossoverToNetlist({ name: 'branch', parts: keep });
    const sol = solveNetwork(netlist, freq, driverZ);
    return { z: [...sol.inputZ], shared };
  } catch {
    return null;
  }
}

export interface BranchRatio {
  name: string;
  /** |Z_delivered| / |Z_bare| per frequency; NaN where either is unusable. */
  ratio: number[];
  /** Worst (lowest) ratio and where. */
  worst: number;
  worstAtHz: number;
  /** The two impedances at that point, so the line can quote both. */
  deliveredOhm: number;
  bareOhm: number;
  flagged: boolean;
}

/**
 * Ratio below which a branch is worth looking at.
 *
 * ⚠ NOT A CLEAN SEPARATOR, and measured to be so rather than assumed. A plain
 * low-pass inductor crosses it on its own: on the ported test woofer the worst
 * ratio runs 0.98 / 0.93 / 0.85 / 0.76 / 0.66 / 0.62 for 0.5 / 1 / 2.2 / 4 / 8
 * / 16 mH, because a series +jX cancels the driver's -jX above resonance and
 * |Z_branch| legitimately falls below |Z_driver|.
 *
 * So this flags "which branch runs low", which is what the ratio is FOR and
 * what it does correctly on Sanders filter (woofer 0.58, mid 0.75, tweeter
 * 0.98). It does not separate a loading shunt from a cancelling series
 * element. That is why everything in this module is read-only: a number good
 * enough to show a designer is not automatically good enough to refuse a
 * design on, and the difference is exactly the anchor lesson.
 */
export const RATIO_FLAG = 0.7;

/**
 * Ratio of delivered branch impedance to bare driver impedance, whole band.
 *
 * Driver-independent ON PURPOSE. An absolute threshold cannot tell a 3 Ω
 * driver apart from a network that halved a 6 Ω one, and those need different
 * answers: the first is a purchase, the second is a topology.
 */
export function branchImpedanceRatios(
  parts: readonly VxpPart[],
  freq: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
  band: [number, number] = [20, 20000],
): BranchRatio[] {
  const models = [...new Set(parts.filter((p) => p.type === 'Driver').map((p) => p.model ?? ''))].filter(Boolean);
  const out: BranchRatio[] = [];
  for (const model of models) {
    const bare = driverZ[model];
    const br = branchImpedance(parts, model, freq, driverZ);
    if (!bare || !br) continue;
    const ratio: number[] = [];
    let worst = Infinity;
    let worstAtHz = 0;
    let deliveredOhm = 0;
    let bareOhm = 0;
    for (let i = 0; i < freq.length; i++) {
      const b = mag(bare[i]);
      const d = mag(br.z[i]);
      if (!(b > 0) || !Number.isFinite(d)) {
        ratio.push(NaN);
        continue;
      }
      const r = d / b;
      ratio.push(r);
      if (freq[i] < band[0] || freq[i] > band[1]) continue;
      if (r < worst) {
        worst = r;
        worstAtHz = freq[i];
        deliveredOhm = d;
        bareOhm = b;
      }
    }
    out.push({
      name: model,
      ratio,
      worst,
      worstAtHz,
      deliveredOhm,
      bareOhm,
      flagged: worst < RATIO_FLAG,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * (a) where the minimum is, and whether a crossing explains it
 * ------------------------------------------------------------------ */

export interface SystemZFacts {
  minOhm: number;
  atHz: number;
  /** Octaves to the nearest acoustic crossing; null when none was given. */
  octFromCrossing: number | null;
  /** True when the minimum sits within half an octave of a crossing — i.e.
   *  when "the branches overlap here" is even a candidate explanation. */
  nearCrossing: boolean;
  line: string;
}

export function systemZFacts(
  freq: readonly number[],
  inputZ: readonly Complex[],
  crossingsHz: readonly (number | null)[] = [],
  band: [number, number] = [20, 20000],
): SystemZFacts | null {
  let minOhm = Infinity;
  let atHz = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < band[0] || freq[i] > band[1]) continue;
    const m = mag(inputZ[i]);
    if (m < minOhm) {
      minOhm = m;
      atHz = freq[i];
    }
  }
  if (!Number.isFinite(minOhm)) return null;
  const xs = crossingsHz.filter((x): x is number => typeof x === 'number' && x > 0);
  const octFromCrossing = xs.length > 0 ? Math.min(...xs.map((x) => Math.abs(Math.log2(atHz / x)))) : null;
  const nearCrossing = octFromCrossing !== null && octFromCrossing <= 0.5;
  return {
    minOhm,
    atHz,
    octFromCrossing,
    nearCrossing,
    line:
      `system minimum ${minOhm.toFixed(2)} Ω at ${Math.round(atHz)} Hz` +
      (octFromCrossing === null
        ? ''
        : nearCrossing
          ? ` — within ${octFromCrossing.toFixed(2)} oct of a crossing, so branch overlap may explain it`
          : ` — ${octFromCrossing.toFixed(2)} oct from the nearest crossing, so this is not an overlap effect`),
  };
}

/* ------------------------------------------------------------------ *
 * (b) which element is responsible
 * ------------------------------------------------------------------ */

export interface ZCulprit {
  partId: string;
  type: string;
  value: number | null;
  /** Where it sits, which decides HOW it was neutralised: shunt = opened,
   *  series = shorted (see below — deleting a series part disconnects the
   *  branch and fakes a lift). */
  position: 'series' | 'shunt';
  /** System Z-min with this element neutralised, minus the delivered Z-min.
   *  Positive = removing it RAISES the load, i.e. it is pulling it down. */
  liftOhm: number;
}

/**
 * Which elements are dragging the impedance minimum down.
 *
 * NEUTRALISED, NOT DELETED, and the distinction is the whole method. Deleting
 * a SERIES element disconnects its branch, and a disconnected branch trivially
 * raises the system impedance — so plain removal crowns every series inductor
 * as the culprit, including in a perfectly healthy network (measured: +2.16 Ω
 * of "lift" from removing the one inductor that connected the woofer at all).
 * Each part is therefore replaced by the variant that keeps the circuit whole:
 * a shunt part is opened, a series part is shorted. That is the same semantics
 * the part audit already uses, for the same reason.
 *
 * Perturbation was the other candidate and is worse: a ±10 % nudge on a 160 µF
 * shunt moves the load by hundredths, below the noise of what is being ranked.
 *
 * A DIAGNOSIS, not a proposal — neutralising the part wrecks the response, and
 * nothing here pretends otherwise.
 *
 * Deliberately topology-blind: it holds no rule about shunt capacitors,
 * passbands or reflex tuning. It reports which part, neutralised, lifts the
 * load most. EXPECT PAIRS: a series L feeding a shunt C is a series-resonant
 * path to ground, and either one alone removes the dip, so both score high.
 * That is a property of the circuit, not a failure of the ranking — which is
 * why this returns a list and not a single accused element.
 */
export function zMinCulprits(
  parts: readonly VxpPart[],
  freq: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
  band: [number, number] = [20, 20000],
  topN = 3,
): ZCulprit[] {
  const zMinOf = (ps: readonly VxpPart[]): number | null => {
    try {
      const { netlist } = crossoverToNetlist({ name: 'z', parts: [...ps] });
      const sol = solveNetwork(netlist, freq, driverZ);
      let lo = Infinity;
      for (let i = 0; i < freq.length; i++) {
        if (freq[i] < band[0] || freq[i] > band[1]) continue;
        const m = mag(sol.inputZ[i]);
        if (m < lo) lo = m;
      }
      return Number.isFinite(lo) ? lo : null;
    } catch {
      return null;
    }
  };
  const base = zMinOf(parts);
  if (base === null) return [];
  const bus = busTopology([...parts]);
  const out: ZCulprit[] = [];
  for (const p of parts) {
    if (!/^(Resistor|Inductor|Capacitor)$/.test(p.type) || !p.partId) continue;
    const series = bus.positionOf(p.partId) === 'series';
    const neutralised = series
      ? // Short it: a wire on the same two points keeps the branch connected.
        parts.map((q) => (q === p ? ({ type: 'Wire', params: [], wires: q.wires } as VxpPart) : q))
      : parts.filter((q) => q !== p);
    const z = zMinOf(neutralised);
    if (z === null) continue;
    out.push({
      partId: p.partId,
      type: p.type,
      value: p.params.find((q) => ['R', 'L', 'C'].includes(q.name))?.value ?? null,
      position: series ? 'series' : 'shunt',
      liftOhm: z - base,
    });
  }
  return out.sort((a, b) => b.liftOhm - a.liftOhm).slice(0, topN);
}
