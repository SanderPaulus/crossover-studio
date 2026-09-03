/**
 * V50 — THE TWO BUILDABILITY GATES ON THE GATE RULE, THE WIRE AND THE PARTS.
 *
 * `metrics/buildability.test.ts` proves the arithmetic. This file proves what
 * happens to the figures afterwards, in the shapes this project asks of every
 * gate:
 *
 *  · ABSENT IS ABSENT (P2/P4): with no class and no margin both gates are OFF,
 *    still report their value, and every other verdict is byte-identical to a
 *    run that never heard of them; a class without a margin arms nothing and
 *    says which field is missing.
 *  · THE STRICTER SOURCE JUDGES: a catalogue rating on the chosen part
 *    outranks the stated class, and the verdict names the SKU.
 *  · ONE COMPARISON RULE: the verdict is `judge()`'s — a value over its
 *    allowance is EXCEEDED, the reason names the element and the watts, and
 *    the remedy is stated as a topology choice the generator does not make.
 *  · THE FINGERPRINT MOVES with the class and the margin, and with the
 *    continuous power ONLY while an allowance is stated (V36's rule kept).
 *  · THE PER-WAY M-C FIGURE resolves per way first and falls back to the
 *    single figure, and a way stated with neither is judged on the derived
 *    ceiling alone.
 *  · `partRatingsOf` reads the snap's attribution and nothing else: no
 *    attribution, no rating; a stack of cored coils is rated by its weakest.
 */

import { describe, expect, it } from 'vitest';
import type { CatalogPart } from '../../catalog.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import {
  anyGateActive,
  effectiveDriveLimit,
  evaluateGates,
  gateSettingsKey,
  gateVerdicts,
  resistorGateArmed,
  statedDriveLimitDb,
  type GateMetricValues,
  type GateSettings,
} from './gates.ts';
import { partRatingsOf } from './partRatings.ts';
import { v2GateReference, v2Netlist, v2SeedParts } from './v2.fixture.ts';

const reference = v2GateReference();
const netlist = v2Netlist(v2SeedParts());

const VALUES: GateMetricValues = {
  dissipationFraction: 0.3,
  epdrMinOhm: 3,
  minZOhm: 4,
  driveVoltage: [],
  /* The loads as `buildability.ts` produces them for a run that states NO
   * class: watts and amperes read, no allowance on any element. */
  resistorLoads: [
    { id: 'R1', ohm: 3, fraction: 0.2, watts: 20, allowedW: null, ratingW: null, ratingSource: null },
    { id: 'R2', ohm: 20, fraction: 0.02, watts: 2, allowedW: null, ratingW: null, ratingSource: null },
  ],
  coilLoads: [
    { id: 'L1', henry: 2e-3, peakA: 4.2, atHz: 120, allowedA: null, ratingSource: null },
    { id: 'L2', henry: 0.2e-3, peakA: 1.1, atHz: 5000, allowedA: null, ratingSource: null },
  ],
};

/** The same loads with the allowance a stated class 10 W × 0.5 / coil class 3 A would give them. */
const RATED: GateMetricValues = {
  ...VALUES,
  resistorLoads: VALUES.resistorLoads!.map((l) => ({ ...l, allowedW: 5, ratingW: 10, ratingSource: 'stated resistor class' })),
  coilLoads: VALUES.coilLoads!.map((l) => ({ ...l, allowedA: 3, ratingSource: 'stated coil class' })),
};

const find = (s: GateSettings, gate: string, values: GateMetricValues = VALUES) =>
  gateVerdicts(s, values).find((v) => v.gate === gate)!;

describe('V50 — M-A/part and M-L on the gate rule', () => {
  it('both gates exist on every verdict list, OFF and reporting their value when nothing is stated', () => {
    const a = find({}, 'M-A/part');
    expect(a.active).toBe(false);
    expect(a.value).toBe(20);
    expect(a.reason).toContain('no limit set');
    expect(a.reason).toContain('R1');
    const l = find({}, 'M-L');
    expect(l.active).toBe(false);
    expect(l.value).toBeCloseTo(4.2, 9);
    expect(l.reason).toContain('L1');
    expect(anyGateActive({})).toBe(false);
  });

  it('a stated class WITH a margin judges, and a value over the allowance is EXCEEDED with the remedy named', () => {
    const v = find({ resistorClassW: 10, resistorPowerMargin: 0.5, amplifierPowerW: 100 }, 'M-A/part', RATED);
    expect(v.active).toBe(true);
    expect(v.limit).toBe(5);
    expect(v.pass).toBe(false);
    expect(v.reason).toMatch(/20\.0 W in R1 exceeds the stated ceiling of 5\.0 W/);
    expect(String(v.parameters?.remedy)).toMatch(/series\/parallel bank/);
    expect(String(v.parameters?.remedy)).toMatch(/generator does not make/);
    expect(resistorGateArmed({ resistorClassW: 10, resistorPowerMargin: 0.5 })).toBe(true);
    // The coil gate, likewise: 4.2 A through L1 against 3 A.
    const c = find({ coilClassA: 3, peakInputVolts: 50 }, 'M-L', RATED);
    expect(c.active).toBe(true);
    expect(c.pass).toBe(false);
    expect(c.reason).toMatch(/4\.20 A through L1 exceeds/);
  });

  it('a class WITHOUT a margin arms nothing and names the missing field (P4)', () => {
    const loads = VALUES.resistorLoads!.map((l) => ({ ...l, ratingW: 10, ratingSource: 'stated resistor class' }));
    const v = gateVerdicts({ resistorClassW: 10 }, { ...VALUES, resistorLoads: loads }).find((x) => x.gate === 'M-A/part')!;
    expect(v.active).toBe(false);
    expect(String(v.parameters?.margin)).toMatch(/no margin fraction stated/);
    expect(resistorGateArmed({ resistorClassW: 10 })).toBe(false);
    expect(anyGateActive({ resistorClassW: 10 })).toBe(false);
  });

  it('the element judged is the one with the LEAST HEADROOM, not the hottest', () => {
    // R2 is cool but rated 1 W (margin 1): 2 W over 1 W is worse than 20 W over 100 W.
    const loads = [
      { id: 'R1', ohm: 3, fraction: 0.2, watts: 20, allowedW: 100, ratingW: 100, ratingSource: 'catalogue SKU-A' },
      { id: 'R2', ohm: 20, fraction: 0.02, watts: 2, allowedW: 1, ratingW: 1, ratingSource: 'catalogue SKU-B' },
    ];
    const v = gateVerdicts({ resistorPowerMargin: 1, amplifierPowerW: 100 }, { ...VALUES, resistorLoads: loads }).find(
      (x) => x.gate === 'M-A/part',
    )!;
    expect(v.active).toBe(true);
    expect(v.value).toBe(2);
    expect(v.limit).toBe(1);
    expect(v.pass).toBe(false);
    expect(v.parameters?.element).toBe('R2');
    expect(v.parameters?.rating_source).toBe('catalogue SKU-B');
  });

  it('null states are honest: no resistor at all, no continuous power, no amplifier peak', () => {
    const none = gateVerdicts({ resistorClassW: 10, resistorPowerMargin: 0.5 }, { ...VALUES, resistorLoads: [] }).find(
      (x) => x.gate === 'M-A/part',
    )!;
    expect(none.value).toBeNull();
    expect(none.active).toBe(true);
    expect(none.pass).toBe(true);
    expect(none.reason).toMatch(/NOT JUDGED/);
    expect(none.reason).toMatch(/no discrete resistor/);
    const noPower = gateVerdicts(
      { resistorClassW: 10, resistorPowerMargin: 0.5 },
      { ...RATED, resistorLoads: RATED.resistorLoads!.map((l) => ({ ...l, watts: null })) },
    ).find((x) => x.gate === 'M-A/part')!;
    expect(noPower.value).toBeNull();
    expect(noPower.reason).toMatch(/no continuous amplifier power/);
    const noPeak = gateVerdicts(
      { coilClassA: 3 },
      { ...RATED, coilLoads: RATED.coilLoads!.map((l) => ({ ...l, peakA: null, atHz: null })) },
    ).find((x) => x.gate === 'M-L')!;
    expect(noPeak.value).toBeNull();
    expect(noPeak.reason).toMatch(/no amplifier peak/);
  });

  it('P2 on a real network: without the fields every other verdict is byte-identical, and with them only these two move', () => {
    const bare = evaluateGates(netlist, {}, reference, 'frozen');
    const armed = evaluateGates(
      netlist,
      { resistorClassW: 10, resistorPowerMargin: 0.5, amplifierPowerW: 100, coilClassA: 3, peakInputVolts: 50 },
      reference,
      'frozen',
    );
    const others = (vs: typeof bare.verdicts) => vs.filter((v) => v.gate !== 'M-A/part' && v.gate !== 'M-L');
    expect(JSON.stringify(others(armed.verdicts))).toBe(JSON.stringify(others(bare.verdicts)));
    // The fixture carries resistors and coils, so both read a figure.
    const r = armed.verdicts.find((v) => v.gate === 'M-A/part')!;
    const l = armed.verdicts.find((v) => v.gate === 'M-L')!;
    expect(r.active && l.active).toBe(true);
    expect(r.value).toBeGreaterThan(0);
    expect(l.value).toBeGreaterThan(0);
    // ...and the M-A fraction is the SAME number whether or not the power was stated (the watts are a scalar on it).
    expect(armed.verdicts.find((v) => v.gate === 'M-A')!.value).toBe(bare.verdicts.find((v) => v.gate === 'M-A')!.value);
    expect(armed.metrics.resistorLoads!.length).toBeGreaterThan(0);
    expect(armed.metrics.coilLoads!.length).toBeGreaterThan(0);
  });

  it('the fingerprint moves with the class and the margin, and with the power only while an allowance is stated (V36 kept)', () => {
    const k = (s: GateSettings) => JSON.stringify(gateSettingsKey(s));
    expect(k({ amplifierPowerW: 100 })).toBe(k({}));
    expect(k({ amplifierPowerW: 100, resistorClassW: 10 })).toBe(k({}));
    const armed = k({ amplifierPowerW: 100, resistorClassW: 10, resistorPowerMargin: 0.5 });
    expect(armed).not.toBe(k({}));
    expect(armed).not.toBe(k({ amplifierPowerW: 200, resistorClassW: 10, resistorPowerMargin: 0.5 }));
    expect(armed).not.toBe(k({ amplifierPowerW: 100, resistorClassW: 20, resistorPowerMargin: 0.5 }));
    expect(k({ peakInputVolts: 50 })).toBe(k({}));
    expect(k({ coilClassA: 3, peakInputVolts: 50 })).not.toBe(k({ coilClassA: 3, peakInputVolts: 60 }));
  });
});

describe('V50 — the stated M-C figure per way', () => {
  it('resolves per way first, falls back to the single figure, and is absent when neither is stated', () => {
    const s: GateSettings = { maxDriveOnFsDb: -20, maxDriveOnFsDbByDriver: { mid: -15 } };
    expect(statedDriveLimitDb(s, 'mid')).toBe(-15);
    expect(statedDriveLimitDb(s, 'tweeter')).toBe(-20);
    expect(statedDriveLimitDb({ maxDriveOnFsDbByDriver: { tweeter: -20 } }, 'mid')).toBeUndefined();
  });

  it('a way with no stated figure is judged on the derived ceiling ALONE, and the verdict says so', () => {
    const s: GateSettings = { maxDriveOnFsDbByDriver: { tweeter: -20 }, driveCeilingDbByDriver: { mid: -18, tweeter: -8 } };
    // mid: no stated figure, ceiling −18 re input on a passband at −6 → −12 derived, alone.
    const mid = effectiveDriveLimit(s, 'mid', -6)!;
    expect(mid.source).toBe('derived');
    expect(mid.statedDb).toBeUndefined();
    expect(mid.limitDb).toBeCloseTo(-12, 9);
    // tweeter: stated −20 against a derived −2 → the stated figure bites.
    const tw = effectiveDriveLimit(s, 'tweeter', -6)!;
    expect(tw.source).toBe('stated');
    expect(tw.limitDb).toBe(-20);
    const verdicts = gateVerdicts(s, {
      ...VALUES,
      driveVoltage: [
        { driver: 'mid', db: -15, fsHz: 90, passbandHz: [400, 2000], bandSource: 'frozen', passbandMeanDb: -6 },
        { driver: 'tweeter', db: -15, fsHz: 900, passbandHz: [2000, 20000], bandSource: 'frozen', passbandMeanDb: -6 },
      ],
    });
    const m = verdicts.find((v) => v.gate === 'M-C' && v.subject === 'mid')!;
    const t = verdicts.find((v) => v.gate === 'M-C' && v.subject === 'tweeter')!;
    // The SAME −15 dB: inside for the mid (derived −12 alone), exceeded for the tweeter (stated −20).
    expect(m.pass).toBe(true);
    expect(String(m.parameters?.limit_source)).toMatch(/no stated dB figure/);
    expect(m.parameters?.stated_limit_dB).toBeUndefined();
    expect(t.pass).toBe(false);
    expect(t.parameters?.stated_limit_dB).toBe(-20);
    expect(anyGateActive({ maxDriveOnFsDbByDriver: { tweeter: -20 } })).toBe(true);
    // ...and the per-way map is a fingerprint ingredient.
    expect(JSON.stringify(gateSettingsKey({ maxDriveOnFsDbByDriver: { tweeter: -20 } }))).not.toBe(
      JSON.stringify(gateSettingsKey({ maxDriveOnFsDbByDriver: { tweeter: -25 } })),
    );
  });
});

describe('V50 — partRatingsOf reads the snap\'s attribution and nothing else', () => {
  const pool: CatalogPart[] = [
    { id: 'R-10W', brand: 'x', series: 's', kind: 'R', value: 3.3, seriesR: 0, powerW: 10 },
    { id: 'L-CORE-4A', brand: 'x', series: 'c', kind: 'L', value: 2e-3, seriesR: 0.1, maxCurrentA: 4 },
    { id: 'L-CORE-2A', brand: 'x', series: 'c', kind: 'L', value: 1e-3, seriesR: 0.08, maxCurrentA: 2 },
    { id: 'L-AIR', brand: 'x', series: 'a', kind: 'L', value: 1e-3, seriesR: 0.3 },
  ];
  const part = (type: string, partId: string, catalog?: string): VxpPart => ({
    type,
    partId,
    ...(catalog ? { catalog } : {}),
    params: [],
    wires: [],
  });

  it('no attribution → no rating; an attributed resistor → its power; an air-cored coil → nothing', () => {
    const r = partRatingsOf(
      [part('Resistor', 'R1'), part('Resistor', 'R2', 'R-10W'), part('Inductor', 'L1', 'L-AIR')],
      pool,
    );
    expect(r.R1).toBeUndefined();
    expect(r.R2).toEqual({ powerW: 10, source: 'catalogue R-10W' });
    expect(r.L1).toBeUndefined();
  });

  it('a stack of cored coils is rated by its WEAKEST member; a stack with an unrated member is unrated', () => {
    const r = partRatingsOf(
      [part('Inductor', 'L1', 'L-CORE-4A+L-CORE-2A'), part('Inductor', 'L2', 'L-CORE-4A+L-AIR'), part('Inductor', 'L3', 'L-CORE-4A+NOPE')],
      pool,
    );
    expect(r.L1).toEqual({ maxCurrentA: 2, source: 'catalogue L-CORE-4A+L-CORE-2A' });
    expect(r.L2).toBeUndefined();
    expect(r.L3).toBeUndefined();
  });
});
