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
  /**
   * What this reading cannot tell you, carried IN THE OUTPUT.
   *
   * The limitation belongs next to the number and not only in a comment: a
   * diagnosis that does not state its own reliability gets read as a verdict
   * after three sessions. Measured (see RATIO_FLAG): a plain low-pass inductor
   * reaches 0.62 on its own, so a low ratio is not proof of a misbehaving
   * filter.
   */
  caveat: string | null;
}

/**
 * Ratio below which a branch is worth LOOKING AT. Reporting only.
 *
 * ⚠ AT THIS VALUE THE RATIO DOES NOT SEPARATE, and that is measured rather
 * than assumed. A plain low-pass inductor crosses it on its own: on the ported
 * test woofer the worst ratio runs 0.98 / 0.93 / 0.85 / 0.76 / 0.66 / 0.62 for
 * 0.5 / 1 / 2.2 / 4 / 8 / 16 mH, because a series +jX cancels the driver's -jX
 * above resonance and |Z_branch| legitimately falls below |Z_driver|.
 *
 * So this flags "which branch runs low", which is what the ratio is FOR and
 * what it does correctly on Sanders filter (woofer 0.58, mid 0.75, tweeter
 * 0.98). It does not separate a loading shunt from a cancelling series
 * element — hence reporting, never a verdict.
 *
 * THE OLD SENTENCE STILL HOLDS, WITH ITS SUBJECT CORRECTED (aug 2026): a
 * number good enough to show a designer is not automatically good enough to
 * refuse a design on — but that hangs on the THRESHOLD, not on the measure.
 * See {@link RATIO_DEGENERATE}, two orders further down, where the same
 * measure does separate and refusing is justified.
 */
export const RATIO_FLAG = 0.7;

/**
 * Ratio below which a branch is BROKEN, not merely a hard load — the one
 * threshold in this module that carries a consequence.
 *
 * MEASURED, aug 2026: 18 synthesised seeds (design + per-branch synthesis, no
 * tune) across two real driver sets and both code paths — Sanders measured
 * three-way and the KOAN two-way — giving 48 branch readings. Sorted, the
 * whole distribution:
 *
 *     0.0011   0.005 / 5.01 Ω @ 4799 Hz  mid  OUTSIDE its passband
 *     0.0011   0.005 / 5.01 Ω @ 4799 Hz  mid  OUTSIDE its passband
 *     ─────────────────────── GAP ×159, EMPTY ───────────────────────
 *     0.1746   0.693 / 3.97 Ω @ 1004 Hz  mid    inside
 *     0.1839   0.789 / 4.29 Ω @ 1670 Hz  mid    inside
 *     0.2148   0.984 / 4.58 Ω @ 2174 Hz  mid    inside
 *     0.2570 … 0.8942   (39 readings, continuous, no further gap)
 *     1.6421   a series element lifting the branch above the bare driver
 *
 * The distribution is here rather than the conclusion so a later reader can
 * see the gap and judge it, instead of taking this note's word for it. It is
 * pinned by a test (impedanceDiag.test.ts) so a synthesis change that moves
 * the gap fails visibly.
 *
 * WHY 0.01. The geometric middle of the gap is 0.0139; 0.01 is the round
 * number beside it — one per cent of what the driver itself offers. Margins:
 * 9× above the broken population, 17× below the lowest healthy reading, and
 * 62× below the series-inductor counterexample that defeats RATIO_FLAG.
 *
 * TWO HONESTIES. (1) The far side of the gap is THIN: two readings, and they
 * are the same phenomenon twice (mid branch, 4799 Hz, two candidates landing
 * on the same design) — one phenomenon, two observations. The line sits at
 * 0.01 rather than snug against the data precisely so one more observation
 * cannot move it. (2) The healthy population is CONTINUOUS from 0.1746, so
 * there is no second gap separating "heavy load" from "normal" — which is why
 * that band is reported and never refused. A measure that catches both
 * populations is useful; a consequence that refuses both would be wrong.
 *
 * Re-test when a third driver set exists (see ROADMAP).
 */
export const RATIO_DEGENERATE = 0.01;

export interface WorstRatio {
  /** |Z_branch| / |Z_bare| at its lowest point in band. */
  ratio: number;
  atHz: number;
  branchOhm: number;
  bareOhm: number;
}

/**
 * Worst (lowest) ratio of a branch impedance against its bare driver.
 *
 * THE ONE DEFINITION. `branchImpedanceRatios` below reports with it, and
 * `synthesize` refuses with it — two consumers of one function rather than
 * two copies of one formula, which is the mistake this codebase keeps paying
 * for. Returns null when nothing in the band is usable.
 */
export function worstImpedanceRatio(
  branchZ: readonly Complex[],
  bareZ: readonly Complex[],
  freq: readonly number[],
  band: [number, number] = [20, 20000],
): WorstRatio | null {
  let out: WorstRatio | null = null;
  const n = Math.min(freq.length, branchZ.length, bareZ.length);
  for (let i = 0; i < n; i++) {
    if (freq[i] < band[0] || freq[i] > band[1]) continue;
    const b = mag(bareZ[i]);
    const d = mag(branchZ[i]);
    if (!(b > 0) || !Number.isFinite(d)) continue;
    const r = d / b;
    if (out === null || r < out.ratio) out = { ratio: r, atHz: freq[i], branchOhm: d, bareOhm: b };
  }
  return out;
}

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
    for (let i = 0; i < freq.length; i++) {
      const b = mag(bare[i]);
      const d = mag(br.z[i]);
      ratio.push(!(b > 0) || !Number.isFinite(d) ? NaN : d / b);
    }
    // The worst point comes from the ONE definition (worstImpedanceRatio), so
    // the number this panel shows and the number the synthesis refuses on
    // cannot drift apart.
    const w = worstImpedanceRatio(br.z, bare, freq, band);
    const worst = w?.ratio ?? Infinity;
    const worstAtHz = w?.atHz ?? 0;
    const deliveredOhm = w?.branchOhm ?? 0;
    const bareOhm = w?.bareOhm ?? 0;
    const flagged = worst < RATIO_FLAG;
    out.push({
      name: model,
      ratio,
      worst,
      worstAtHz,
      deliveredOhm,
      bareOhm,
      flagged,
      caveat: flagged
        ? 'a low ratio can also be benign: a series inductor cancels part of the ' +
          "driver's reactance and reaches 0.62 on its own, with nothing wrong. " +
          'This says WHICH branch runs low, not that its filter is at fault — the ' +
          'sensitivity list is what settles that.'
        : null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * (a) where the minimum is, and whether a crossing explains it
 * ------------------------------------------------------------------ */

/**
 * THE PHASE HALF OF THE LOAD, AND WHY IT IS REPORTED RATHER THAN ENFORCED.
 *
 * Modulus alone is an incomplete description. 2.6 Ω at −16° is a mild load;
 * the same 2.6 Ω at −60° is not, because the output device is passing current
 * while the voltage across it is still high. That is DISSIPATION, not merely
 * current, and dissipation is what actually destroys amplifiers.
 *
 * WHAT I CAN DERIVE, and it is worth stating because it decides whether such a
 * measure can be a limit at all. For a class-AB stage on rails ±Vcc driving
 * Z = |Z|∠φ with output v(t) = Vp·sin(ωt), the conducting device dissipates
 * (Vcc − v)·i with i = (Vp/|Z|)·sin(ωt − φ). At φ = 0 the peak lands near
 * v = Vcc/2; as |φ| grows, current still flows while v is large and the peak
 * rises. So an "equivalent resistance" — the resistive load giving the same
 * PEAK device dissipation — is genuinely lower than |Z|.
 *
 * ⚠ BUT IT DEPENDS ON THE AMPLIFIER. That expression contains Vp/Vcc, the
 * modulation depth, which is a property of the amp and the listening level and
 * not of the loudspeaker. Any peak-dissipation figure is therefore a statement
 * about a PAIRING, not a property of the speaker, and turning it into a limit
 * means quietly assuming someone's rails.
 *
 * ON EPDR SPECIFICALLY: that is the published name for this idea, associated
 * with Eric Benjamin's AES work on amplifier–loudspeaker interaction and
 * popularised in the UK press by Keith Howard. I am NOT confident of the exact
 * formula or of the citation details, and this codebase does not implement
 * physics it cannot check — so nothing here claims to BE EPDR. Before any of
 * this becomes a constraint, the source has to be read.
 *
 * What is reported instead is deliberately transparent: |Z|·cos|φ| — the real
 * part of the impedance, i.e. the component actually absorbing power. It falls
 * with both a small modulus and a large angle, needs no assumption about any
 * amplifier, and can be checked by hand. It is a POINTER to the hardest place
 * on the curve, not a rating.
 */
export interface SystemZFacts {
  minOhm: number;
  atHz: number;
  /** Phase at the minimum — half the description, and it changes the reading. */
  minPhaseDeg: number;
  /** Largest |phase| anywhere in band, and the modulus there. */
  worstPhaseDeg: number;
  worstPhaseAtHz: number;
  worstPhaseZOhm: number;
  /** Lowest |Z|·cos|phi| — where modulus and angle are worst TOGETHER. Often
   *  neither of the two extremes above; on Sanders filter it is 70 Hz, while
   *  the modulus minimum is at 84 Hz and the worst angle at 2535 Hz. */
  hardestOhm: number;
  hardestAtHz: number;
  hardestZOhm: number;
  hardestPhaseDeg: number;
  /** The phase picture, in a sentence. */
  phaseLine: string;
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
  const degOf = (z: Complex) => (Math.atan2(z.im, z.re) * 180) / Math.PI;
  let minPhaseDeg = 0;
  let worstPhaseDeg = 0;
  let worstPhaseAtHz = 0;
  let worstPhaseZOhm = 0;
  let hardestOhm = Infinity;
  let hardestAtHz = 0;
  let hardestZOhm = 0;
  let hardestPhaseDeg = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < band[0] || freq[i] > band[1]) continue;
    const m = mag(inputZ[i]);
    const d = degOf(inputZ[i]);
    if (freq[i] === atHz) minPhaseDeg = d;
    if (Math.abs(d) > Math.abs(worstPhaseDeg)) {
      worstPhaseDeg = d;
      worstPhaseAtHz = freq[i];
      worstPhaseZOhm = m;
    }
    const eq = m * Math.cos((Math.abs(d) * Math.PI) / 180);
    if (eq < hardestOhm) {
      hardestOhm = eq;
      hardestAtHz = freq[i];
      hardestZOhm = m;
      hardestPhaseDeg = d;
    }
  }
  const xs = crossingsHz.filter((x): x is number => typeof x === 'number' && x > 0);
  const octFromCrossing = xs.length > 0 ? Math.min(...xs.map((x) => Math.abs(Math.log2(atHz / x)))) : null;
  const nearCrossing = octFromCrossing !== null && octFromCrossing <= 0.5;
  return {
    minOhm,
    atHz,
    minPhaseDeg,
    worstPhaseDeg,
    worstPhaseAtHz,
    worstPhaseZOhm,
    hardestOhm,
    hardestAtHz,
    hardestZOhm,
    hardestPhaseDeg,
    phaseLine:
      `${minOhm.toFixed(2)} Ω at ${Math.round(atHz)} Hz sits at ${minPhaseDeg.toFixed(0)}°; ` +
      `the largest angle is ${worstPhaseDeg.toFixed(0)}° at ${Math.round(worstPhaseAtHz)} Hz ` +
      `(a comfortable ${worstPhaseZOhm.toFixed(1)} Ω there); the two are worst TOGETHER at ` +
      `${Math.round(hardestAtHz)} Hz — ${hardestZOhm.toFixed(2)} Ω at ${hardestPhaseDeg.toFixed(0)}°, ` +
      `a real part of ${hardestOhm.toFixed(2)} Ω. Reported, never enforced: a peak-dissipation ` +
      `rating needs the amplifier's rails, which are not a property of this loudspeaker`,
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

export interface ZLiftProfile {
  /** Delivered system Z-min, the number everything is measured against. */
  baseOhm: number;
  /** The ranked individual levers. */
  top: ZCulprit[];
  /** Every individual positive lift added up — what a naive reading of the
   *  list suggests is available. */
  sumOfIndividualOhm: number;
  /** What actually happens when the N biggest are neutralised TOGETHER,
   *  for N = 1..top.length. Superposition does not hold here, so this is the
   *  only honest answer to "how much is on the table". */
  jointOhm: number[];
  /** The reading, in a sentence. */
  verdict: 'collective' | 'fundamental' | 'single-element';
  line: string;
}

/**
 * How the dip is DISTRIBUTED — because "which component" can be the wrong
 * question.
 *
 * On Sanders filter no single element lifts the minimum by more than 0.204 Ω
 * against a 2.62 Ω minimum. A top-3 list alone invites the reader to pick the
 * biggest and change it, which would move almost nothing. The distinction that
 * matters is whether the levers ADD UP:
 *
 *   - they do  → a COLLECTIVE effect, and restructuring the branch is the
 *                remedy rather than swapping a part;
 *   - they do not → the branch is fundamentally low, and no filter change
 *                reaches it. Then it is the driver wiring — series instead of
 *                parallel, or a different nominal impedance — and that is a
 *                purchase decision, not a tuning one.
 *
 * Both are useful answers and neither is visible from a ranked list.
 */
export function zMinLiftProfile(
  parts: readonly VxpPart[],
  freq: readonly number[],
  driverZ: Record<string, readonly Complex[]>,
  band: [number, number] = [20, 20000],
  topN = 4,
): ZLiftProfile | null {
  const bus = busTopology([...parts]);
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
  const baseOhm = zMinOf(parts);
  if (baseOhm === null) return null;
  const top = zMinCulprits(parts, freq, driverZ, band, topN);
  if (top.length === 0) return null;

  const neutralise = (ps: readonly VxpPart[], ids: Set<string>): VxpPart[] => {
    const out: VxpPart[] = [];
    for (const q of ps) {
      if (!q.partId || !ids.has(q.partId)) {
        out.push(q);
        continue;
      }
      if (bus.positionOf(q.partId) === 'series') {
        out.push({ type: 'Wire', params: [], wires: q.wires } as VxpPart);
      }
      // shunt: dropped
    }
    return out;
  };
  const jointOhm: number[] = [];
  for (let n = 1; n <= top.length; n++) {
    const ids = new Set(top.slice(0, n).map((c) => c.partId));
    const z = zMinOf(neutralise(parts, ids));
    jointOhm.push(z === null ? baseOhm : z - baseOhm);
  }
  const sumOfIndividualOhm = top.reduce((a, c) => a + Math.max(0, c.liftOhm), 0);
  /* The best JOINT lift, not the last one: neutralising more parts is not
   * monotonically better. Measured on Sanders filter the top two give +0.259 Ω
   * and the top five +0.253 — taking out a third element lets the load fall
   * again. Superposition does not hold, which is the whole reason this
   * function exists next to the ranked list. */
  const best = Math.max(...jointOhm);

  /* RELATIVE TO THE MINIMUM ITSELF, not to the distance to some floor.
   *
   * My first version measured "substantial" against the gap to 2.5 Ω, which
   * degenerates the moment a design already clears it: on Sanders filter the
   * gap is zero, so every lever looked decisive and the verdict came out
   * "single-element" for a filter that cannot move its own minimum by 10 %.
   * A fraction of the minimum is scale-free and says the useful thing —
   * whether the crossover can reach this number at all. */
  const share = best / Math.max(baseOhm, 1e-9);
  const verdict: ZLiftProfile['verdict'] =
    share < 0.15
      ? 'fundamental'
      : top[0].liftOhm > 0.6 * best
        ? 'single-element'
        : 'collective';
  const line =
    `minimum ${baseOhm.toFixed(2)} Ω; biggest single lever ${top[0].partId} ` +
    `${top[0].liftOhm >= 0 ? '+' : ''}${top[0].liftOhm.toFixed(2)} Ω, ` +
    `best combination ${best >= 0 ? '+' : ''}${best.toFixed(2)} Ω (${(share * 100).toFixed(0)} % of the minimum) — ` +
    (verdict === 'single-element'
      ? 'one element dominates; change that part'
      : verdict === 'collective'
        ? 'no single part explains it but together they do: restructure the branch'
        : 'neutralising the biggest levers together barely moves it, so the ' +
          'crossover is not what sets this minimum — that is the drivers and ' +
          'how they are wired, and no filter change reaches it');
  return { baseOhm, top, sumOfIndividualOhm, jointOhm, verdict, line };
}
