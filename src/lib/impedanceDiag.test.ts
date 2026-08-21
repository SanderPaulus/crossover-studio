import { describe, expect, it } from 'vitest';
import { logspace } from './dsp.ts';
import { solveNetwork } from './network.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpPart } from './parsers/vxp.ts';
import {
  DOME_TWEETER_LIKE,
  WO24P_LIKE,
  parallelDrivers,
  sealedDriverZ,
  ventedDriverZ,
} from './testDrivers.ts';
import {
  RATIO_FLAG,
  bareSystemFacts,
  branchImpedance,
  branchImpedanceRatios,
  systemZFacts,
  zMinCulprits,
  zMinLiftProfile,
} from './impedanceDiag.ts';

const grid = logspace(20, 20000, 500);

/* THE FIXTURE IS A PORTED WOOFER ON PURPOSE (A3i-3). The whole reason this
 * module exists is a dip at 82 Hz in the woofer's own passband, and a flat
 * resistor — or a sealed single-peak model — cannot produce one. The saddle
 * being in the right place is exactly what separates "this filter drags the
 * load under its driver" from "this driver is simply low". */
const zWooferPair = parallelDrivers(ventedDriverZ(grid, WO24P_LIKE), 2);
const zTweeter = sealedDriverZ(grid, DOME_TWEETER_LIKE);
const driverZ = { woofer: zWooferPair, tweeter: zTweeter };

const P = (x: number, y: number) => ({ x, y });
const gen = (): VxpPart[] => [
  { type: 'Generator', partId: 'G1', params: [{ name: 'Eg', value: 2.83, unit: 'V' }], wires: [P(3, 4), P(3, 30)] },
  { type: 'Ground', params: [], wires: [P(3, 30)] },
];
/** Woofer branch: series L to the driver, optional shunt C across the bus. */
const wooferBranch = (lMh: number, shuntUf?: number): VxpPart[] => [
  { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: lMh, unit: 'mH' }, { name: 'DCR', value: 0.2, unit: 'Ω' }], wires: [P(3, 4), P(9, 4)] },
  ...(shuntUf
    ? ([{ type: 'Capacitor', partId: 'C9', params: [{ name: 'C', value: shuntUf, unit: 'uF' }], wires: [P(9, 4), P(9, 30)] }] as VxpPart[])
    : []),
  { type: 'Driver', partId: 'D1', model: 'woofer', inverted: false, params: [], wires: [P(9, 4), P(9, 12)] },
  { type: 'Ground', params: [], wires: [P(9, 12)] },
  ...(shuntUf ? ([{ type: 'Ground', params: [], wires: [P(9, 30)] }] as VxpPart[]) : []),
];
/** Tweeter branch: series C. */
const tweeterBranch = (cUf: number): VxpPart[] => [
  { type: 'Wire', params: [], wires: [P(3, 4), P(3, 18)] },
  { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: cUf, unit: 'uF' }], wires: [P(3, 18), P(15, 18)] },
  { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(15, 18), P(15, 26)] },
  { type: 'Ground', params: [], wires: [P(15, 26)] },
];

const sysZ = (parts: VxpPart[]) => {
  const { netlist } = crossoverToNetlist({ name: 't', parts });
  return solveNetwork(netlist, grid, driverZ).inputZ;
};

describe('impedance diagnosis — read-only, and it must add up', () => {
  it('reports what the drivers are before any filter, including the parallel count', () => {
    const facts = bareSystemFacts(
      grid,
      [
        { name: 'woofer', z: ventedDriverZ(grid, WO24P_LIKE), count: 2 },
        { name: 'tweeter', z: zTweeter, count: 1 },
      ],
    )!;
    const w = facts.perSource.find((s) => s.name === 'woofer')!;
    // The number a designer needs at import: one driver's minimum, and what
    // two of them actually present.
    expect(w.count).toBe(2);
    expect(w.branchOhm).toBeCloseTo(w.singleOhm / 2, 9);
    expect(facts.lines.some((l) => l.includes('2 in parallel'))).toBe(true);
    // The bare parallel is below either branch — the floor a filter starts from.
    expect(facts.parallelOhm).toBeLessThan(w.branchOhm);
    expect(facts.lines.some((l) => l.includes('has to LIFT'))).toBe(true);
  });

  it('SELF-CONSISTENCY: the branch impedances must parallel back to the system', () => {
    /* The check that makes every other number here trustworthy. If the branch
     * split were wrong — a part attributed to the wrong branch, or one counted
     * twice — the ratios would still compute and still look plausible. This is
     * the one assertion that cannot be satisfied by a plausible mistake. */
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const zw = branchImpedance(parts, 'woofer', grid, driverZ)!;
    const zt = branchImpedance(parts, 'tweeter', grid, driverZ)!;
    const sys = sysZ(parts);
    for (let i = 0; i < grid.length; i += 17) {
      const y = (z: { re: number; im: number }) => {
        const d = z.re * z.re + z.im * z.im;
        return { re: z.re / d, im: -z.im / d };
      };
      const a = y(zw.z[i]);
      const b = y(zt.z[i]);
      const par = 1 / Math.hypot(a.re + b.re, a.im + b.im);
      expect(par).toBeCloseTo(Math.hypot(sys[i].re, sys[i].im), 6);
    }
  });

  it('the ratio finds a filter that drags its branch below its own driver', () => {
    /* Sanders case in miniature: a big shunt cap sitting in the woofer's
     * passband behind a series inductor that gives too little counterweight.
     * The ratio is driver-independent, so it accuses the NETWORK — an absolute
     * threshold could not tell this apart from a low-impedance woofer. */
    const bad = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const rBad = branchImpedanceRatios(bad, grid, driverZ).find((r) => r.name === 'woofer')!;
    expect(rBad.worst).toBeLessThan(RATIO_FLAG);
    expect(rBad.flagged).toBe(true);
    expect(rBad.deliveredOhm).toBeLessThan(rBad.bareOhm);

    /* Same driver, same series inductor, NO shunt cap: not flagged.
     *
     * ⚠ AND THE RATIO IS NOT 1.0 THERE — it is 0.85, which surprised me and is
     * real physics: a series inductor is +jX and a driver above resonance is
     * partly −jX, so they cancel and |Z_branch| dips BELOW |Z_driver| without
     * anything being wrong. That is why the flag line sits at 0.7 and not just
     * under unity; the sweep below is what justifies the number rather than my
     * having typed it. */
    const good = [...gen(), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const rGood = branchImpedanceRatios(good, grid, driverZ).find((r) => r.name === 'woofer')!;
    expect(rGood.flagged).toBe(false);
    expect(rGood.worst).toBeGreaterThan(RATIO_FLAG);
  });

  it('MEASURED: a plain inductor alone can cross the flag line — a known false positive', () => {
    /* I expected to justify RATIO_FLAG = 0.7 here by showing that benign
     * low-pass inductors stay above it. THEY DO NOT, and the measurement is
     * recorded rather than the threshold quietly moved until the test agreed:
     *
     *     L = 0.5 mH -> 0.98    4 mH -> 0.76
     *         1   mH -> 0.93    8 mH -> 0.66   <- under the line
     *         2.2 mH -> 0.85   16 mH -> 0.62   <- under the line
     *
     * The mechanism is honest physics: a series inductor is +jX, a driver
     * above resonance is partly -jX, they cancel, and |Z_branch| falls below
     * |Z_driver| with nothing wrong. So the ratio identifies WHICH branch runs
     * low — which is what it is for, and it does that correctly on Sanders
     * real filter (woofer 0.58, mid 0.75, tweeter 0.98) — but it does not by
     * itself separate "a shunt loads this branch" from "a series element
     * cancels reactance". A large woofer inductor can therefore raise the flag
     * on a healthy design.
     *
     * Left as a documented limitation instead of a tuned constant. It is a
     * DIAGNOSTIC, read-only, and a designer who sees "woofer branch runs at
     * 0.66 of its driver around 96 Hz" has been told something true. Turning
     * this into a gate would need the mechanism separated first. */
    const worst: number[] = [];
    for (const lMh of [0.5, 1, 2.2, 4, 8, 16]) {
      const parts = [...gen(), ...wooferBranch(lMh), ...tweeterBranch(4.7)];
      worst.push(branchImpedanceRatios(parts, grid, driverZ).find((x) => x.name === 'woofer')!.worst);
    }
    // Monotone in the inductor: bigger coil, more cancellation. That it is
    // orderly is what makes it recognisable as the benign mechanism.
    for (let i = 1; i < worst.length; i++) expect(worst[i]).toBeLessThan(worst[i - 1]);
    expect(worst[0]).toBeGreaterThan(0.95);
    expect(worst[worst.length - 1]).toBeLessThan(RATIO_FLAG);
  });

  it('a low-impedance DRIVER is not flagged — that is the point of a ratio', () => {
    // Four in parallel: a genuinely hard load (well under 2 Ω) with no filter
    // misbehaviour at all. An absolute threshold would condemn it.
    const four = { woofer: parallelDrivers(ventedDriverZ(grid, WO24P_LIKE), 4), tweeter: zTweeter };
    const parts = [...gen(), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const r = branchImpedanceRatios(parts, grid, four).find((x) => x.name === 'woofer')!;
    expect(r.flagged).toBe(false);
    const facts = bareSystemFacts(grid, [{ name: 'woofer', z: ventedDriverZ(grid, WO24P_LIKE), count: 4 }])!;
    expect(facts.parallelOhm).toBeLessThan(2); // hard load, honestly reported
  });

  it('says WHERE the minimum is and whether a crossing could explain it', () => {
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const f = systemZFacts(grid, sysZ(parts), [500, 2500])!;
    expect(f.minOhm).toBeGreaterThan(0);
    expect(f.octFromCrossing).not.toBeNull();
    // Whatever the answer, the line has to state the reasoning rather than
    // just a number — the sentence is the deliverable.
    expect(f.line).toMatch(/system minimum/);
    expect(f.line).toMatch(f.nearCrossing ? /overlap may explain/ : /not an overlap effect/);
  });

  it('reports the phase at the minimum, the worst angle, and the worst PAIRING', () => {
    /* Sanders point, and the measurement that makes it: on his filter the
     * modulus minimum is 2.62 Ω at a mild -16°, the largest angle is +72° where
     * the modulus is a comfortable 11 Ω — and the hardest place is NEITHER of
     * those. It is 70 Hz, where 3.11 Ω meets -41.5°. A report that gives only
     * the minimum, or only the worst angle, misses the point that matters. */
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const f = systemZFacts(grid, sysZ(parts), [500, 2500])!;
    expect(Number.isFinite(f.minPhaseDeg)).toBe(true);
    expect(Math.abs(f.worstPhaseDeg)).toBeGreaterThanOrEqual(Math.abs(f.minPhaseDeg));
    // The combined measure is the real part, so it can never exceed |Z|...
    expect(f.hardestOhm).toBeLessThanOrEqual(f.hardestZOhm + 1e-9);
    // ...and it is at least as harsh as the plain minimum read at its own angle.
    expect(f.hardestOhm).toBeLessThanOrEqual(f.minOhm + 1e-9);
    expect(f.phaseLine).toMatch(/worst TOGETHER/);
  });

  it('states that a dissipation rating is about a PAIRING, not about the speaker', () => {
    /* The reason enforcement stays on the modulus. A peak-dissipation figure
     * contains the modulation depth Vp/Vcc — the amplifier's rails and the
     * listening level — so it describes an amp-and-speaker pair. Turning it
     * into a limit means assuming someone's rails without saying so, and this
     * codebase does not implement physics it cannot check. */
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const f = systemZFacts(grid, sysZ(parts), [500, 2500])!;
    expect(f.phaseLine).toMatch(/Reported, never enforced/);
    expect(f.phaseLine).toMatch(/amplifier's rails/);
  });

  it('a purely resistive load has no phase story to tell', () => {
    // The degenerate check: with zero angle everywhere the combined measure
    // collapses onto the modulus, so the extra machinery adds nothing and says
    // nothing — which is the correct behaviour, not a special case.
    const flat = grid.map(() => ({ re: 6, im: 0 }));
    const f = systemZFacts(grid, flat, [])!;
    expect(f.worstPhaseDeg).toBeCloseTo(0, 9);
    expect(f.hardestOhm).toBeCloseTo(f.minOhm, 9);
    expect(f.hardestOhm).toBeCloseTo(6, 9);
  });

  it('a dip in the passband is correctly reported as NOT an overlap effect', () => {
    // Crossings deliberately far from the shunt cap's region.
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const f = systemZFacts(grid, sysZ(parts), [3000, 12000])!;
    expect(f.nearCrossing).toBe(false);
    expect(f.octFromCrossing!).toBeGreaterThan(0.5);
  });

  it('names the element responsible without knowing what a shunt cap is', () => {
    /* Topology-blind by construction: it removes each part in turn and reports
     * which absence lifts the load most. The 160 µF shunt has to come out on
     * top, and it does so without any rule in the module about capacitors,
     * passbands or shunts. */
    const parts = [...gen(), ...wooferBranch(2.2, 160), ...tweeterBranch(4.7)];
    const culprits = zMinCulprits(parts, grid, driverZ);
    expect(culprits.length).toBeGreaterThan(0);
    // The shunt cap is named, and named FIRST: it is the element whose absence
    // removes the dip without disconnecting anything.
    expect(culprits[0].partId).toBe('C9');
    expect(culprits[0].value).toBe(160);
    expect(culprits[0].position).toBe('shunt');
    expect(culprits[0].liftOhm).toBeGreaterThan(0.1);
    /* And the series inductor that feeds it scores too — L1 + C9 form a
     * series-resonant path to ground, so either one alone removes the dip.
     * The report is a list for exactly this reason: a dip is usually a PAIR,
     * and a single accused element would be a half-truth. */
    const l1 = culprits.find((c) => c.partId === 'L1');
    expect(l1?.position).toBe('series');
  });

  it('a healthy network has no element whose removal lifts the load much', () => {
    const parts = [...gen(), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const culprits = zMinCulprits(parts, grid, driverZ);
    /* Every element here only ADDS impedance, so neutralising any of them can
     * only lower the minimum. Before the series parts were shorted rather than
     * deleted this same network reported +2.16 Ω of "lift" — the branch simply
     * fell off the amplifier. */
    expect(culprits[0].liftOhm).toBeLessThan(0.1);
  });

  it('refuses a per-branch answer when a part feeds more than one driver', () => {
    /* A shared series element makes "the impedance of this branch" undefined.
     * Returning null is the honest answer; returning a number that computes is
     * how this codebase has been bitten before. */
    const shared: VxpPart[] = [
      ...gen(),
      { type: 'Inductor', partId: 'LS', params: [{ name: 'L', value: 0.5, unit: 'mH' }, { name: 'DCR', value: 0.1, unit: 'Ω' }], wires: [P(3, 4), P(6, 4)] },
      { type: 'Driver', partId: 'D1', model: 'woofer', inverted: false, params: [], wires: [P(6, 4), P(6, 12)] },
      { type: 'Ground', params: [], wires: [P(6, 12)] },
      { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 4.7, unit: 'uF' }], wires: [P(6, 4), P(15, 4)] },
      { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [P(15, 4), P(15, 12)] },
      { type: 'Ground', params: [], wires: [P(15, 12)] },
    ];
    expect(branchImpedance(shared, 'woofer', grid, driverZ)).toBeNull();
  });
});

describe('the diagnosis states its own limits and its own distribution', () => {
  /** A resistor straight across the amplifier terminals. */
  const busShunt = (id: string, ohm: number): VxpPart => ({
    type: 'Resistor', partId: id, params: [{ name: 'R', value: ohm, unit: 'Ω' }],
    wires: [P(3, 4), P(3, 30)],
  });

  it('a flagged branch carries the caveat IN THE OUTPUT, not only in a comment', () => {
    const parts = [...gen(), ...wooferBranch(16), ...tweeterBranch(4.7)];
    const r = branchImpedanceRatios(parts, grid, driverZ).find((x) => x.name === 'woofer')!;
    expect(r.flagged).toBe(true);
    /* And this one IS the benign case — a 16 mH low-pass with no shunt at all.
     * The flag is right that the branch runs low and wrong about why, which is
     * exactly what the caveat has to say. A diagnosis that does not state its
     * own reliability is read as a verdict within three sessions. */
    expect(r.caveat).not.toBeNull();
    expect(r.caveat!).toMatch(/can also be benign/);
    expect(r.caveat!).toMatch(/sensitivity list/);
    // Not flagged means no caveat to carry.
    const ok = branchImpedanceRatios([...gen(), ...wooferBranch(1)], grid, driverZ)
      .find((x) => x.name === 'woofer')!;
    expect(ok.flagged).toBe(false);
    expect(ok.caveat).toBeNull();
  });

  it('FUNDAMENTAL: when the filter cannot reach the minimum, it says so', () => {
    /* Sanders real case, and the reading that matters most: neutralising the
     * five biggest levers on his filter buys 0.26 Ω on a 2.62 Ω minimum — 10 %.
     * The crossover is not what sets that number, so no amount of filter work
     * reaches it; it is the drivers and their wiring. */
    const parts = [...gen(), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const prof = zMinLiftProfile(parts, grid, driverZ)!;
    expect(prof.verdict).toBe('fundamental');
    expect(prof.line).toMatch(/drivers and how they are wired/);
  });

  it('SINGLE-ELEMENT: one dominant part is named as such', () => {
    const parts = [...gen(), busShunt('R9', 2.0), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const prof = zMinLiftProfile(parts, grid, driverZ)!;
    expect(prof.verdict).toBe('single-element');
    expect(prof.top[0].partId).toBe('R9');
    expect(prof.line).toMatch(/change that part/);
  });

  it('the joint lift is not the sum of the individual ones, and may not be monotone', () => {
    /* Measured on his filter: individual lifts sum to 0.369 Ω while the best
     * combination gives 0.26, and the top TWO (+0.259) beat the top five
     * (+0.253) — taking out a third element lets the load fall again.
     * Superposition does not hold, which is why a ranked list alone invites
     * the reader to add up numbers that do not add up. */
    const parts = [...gen(), busShunt('R9', 4), busShunt('R8', 4), ...wooferBranch(2.2), ...tweeterBranch(4.7)];
    const prof = zMinLiftProfile(parts, grid, driverZ)!;
    expect(prof.jointOhm.length).toBe(prof.top.length);
    const bestJoint = Math.max(...prof.jointOhm);
    // Two 4 Ω shunts: each alone leaves the other still loading, so neither
    // individual lift comes close to what removing both does.
    expect(bestJoint).toBeGreaterThan(prof.top[0].liftOhm);
    // And the naive sum overstates nothing here, but the two are different
    // quantities and the profile reports both rather than one.
    expect(prof.sumOfIndividualOhm).not.toBeCloseTo(bestJoint, 6);
  });
});
