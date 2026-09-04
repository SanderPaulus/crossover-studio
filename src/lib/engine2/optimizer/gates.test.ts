/**
 * DELIVERABLE 2 — the gate CONFIGURATION and its one evaluation rule.
 *
 * The regressions next door prove the gates hold during a search. This file
 * covers the three things that decide whether they are the RIGHT gates:
 *
 *  · absent means OFF, and off still reports its value (P4);
 *  · the EPDR floor and the plain |Z| floor are two independently settable
 *    limits through ONE rule, and the |Z| one delegates its comparison to
 *    `meetsAmpFloor` rather than re-deriving a threshold;
 *  · "high-pass protected" is DERIVED from the branch's own transfer, so
 *    M-C's scope follows the circuit rather than a list of way names.
 */

import { describe, expect, it } from 'vitest';
import { acceptedAmpFloor } from '../../impedanceFloor.ts';
import { buildAnalysis } from '../metrics/analysis.ts';
import {
  anyGateActive,
  evaluateGates,
  gateSettingsKey,
  isHighPassProtected,
  type GateSettings,
} from './gates.ts';
import { v2DriverZ, v2GateReference, v2Netlist, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const reference = v2GateReference();
const netlist = v2Netlist(v2SeedParts());
const analysis = buildAnalysis(netlist, V2_GRID, v2DriverZ());
const find = (s: GateSettings, gate: string, subject = 'system') =>
  evaluateGates(netlist, s, reference, 'frozen').verdicts.find(
    (v) => v.gate === gate && v.subject === subject,
  )!;

describe('Deliverable 2 - gate configuration', () => {
  it('every limit is absent by default, and an absent limit is OFF but still reported', () => {
    /* V50 — a continuous power and a peak input are NOT limits: they are what
     * the two buildability gates need to READ a figure (watts, amperes) at
     * all. Stated here so those two report a value like every other gate;
     * `anyGateActive` still says nothing judges. */
    const e = evaluateGates(netlist, { amplifierPowerW: 100, peakInputVolts: 50 }, reference, 'frozen');
    expect(anyGateActive({ amplifierPowerW: 100, peakInputVolts: 50 })).toBe(false);
    expect(anyGateActive({})).toBe(false);
    expect(e.failures).toEqual([]);
    expect(e.violation).toBeNull();
    expect(e.verdicts.length).toBeGreaterThanOrEqual(3);
    for (const v of e.verdicts) {
      expect(v.active).toBe(false);
      expect(v.limit).toBeNull();
      expect(v.pass).toBe(true);
      // P4's visible half: the number is shown, and the sentence says that
      // nothing judged it. "Not shown" and "shown as passing" are both wrong.
      expect(v.value).not.toBeNull();
      expect(v.reason).toContain('no limit set');
    }
  });

  it('M-A is a ceiling on a fraction, and it is rendered as a percentage', () => {
    const measured = find({}, 'M-A').value!;
    expect(measured).toBeGreaterThan(0);
    const tight = find({ maxDissipationFraction: measured / 2 }, 'M-A');
    expect(tight.active).toBe(true);
    expect(tight.direction).toBe('max');
    expect(tight.pass).toBe(false);
    expect(tight.reason).toContain('%');
    expect(find({ maxDissipationFraction: measured * 2 }, 'M-A').pass).toBe(true);
  });

  it('M-B: the EPDR floor and the |Z| floor are independent, through one rule', () => {
    const epdrValue = find({}, 'M-B/EPDR').value!;
    const zValue = find({}, 'M-B/|Z|').value!;
    // They are genuinely different numbers on a real load — which is the whole
    // case A4 makes for EPDR replacing the bare minimum.
    expect(epdrValue).toBeLessThan(zValue);

    // Either alone.
    const onlyEpdr = evaluateGates(netlist, { minEpdrOhm: epdrValue * 2 }, reference, 'frozen');
    expect(onlyEpdr.failures.map((f) => f.gate)).toEqual(['M-B/EPDR']);
    const onlyZ = evaluateGates(netlist, { ampMinLoadOhm: zValue * 2 }, reference, 'frozen');
    expect(onlyZ.failures.map((f) => f.gate)).toEqual(['M-B/|Z|']);

    // Both, independently set.
    const both = evaluateGates(
      netlist,
      { minEpdrOhm: epdrValue * 2, ampMinLoadOhm: zValue * 2 },
      reference,
      'frozen',
    );
    expect(both.failures.map((f) => f.gate).sort()).toEqual(['M-B/EPDR', 'M-B/|Z|']);
    expect(both.violation).toContain('EPDR');
    expect(both.violation).toContain('|Z|');
  });

  it('the |Z| floor uses meetsAmpFloor, and does not invent its own threshold', () => {
    // Sanders' rule lives in `impedanceFloor.ts` and nowhere else: a shortfall
    // inside the accepted tolerance is not a failure. A gate that compared
    // strictly would refuse designs the repair pass calls repaired — the exact
    // bug that file was consolidated to end.
    const z = find({}, 'M-B/|Z|').value!;
    // A rating whose ACCEPTED floor sits just under the delivered minimum:
    // above the rating itself, inside the tolerance the rule allows.
    const justInside = (z / acceptedAmpFloor(1)) * (1 - 1e-9);
    expect(find({ ampMinLoadOhm: justInside }, 'M-B/|Z|').pass).toBe(true);
    // ...and strictly above the rating itself, which a naive `>=` would fail.
    expect(justInside).toBeGreaterThan(z);
    expect(find({ ampMinLoadOhm: z * 1.5 }, 'M-B/|Z|').pass).toBe(false);
  });

  it('M-C applies to the ways the CIRCUIT high-passes, derived from the transfer', () => {
    // The fixture's low branch is a series coil into the driver — a low pass,
    // so no M-C. The high branch is a series capacitor — a high pass, so M-C.
    // Neither answer comes from a way name or a position in a list.
    expect(reference.frozenHighPassProtected).toEqual(['tweeter']);
    expect(isHighPassProtected(analysis, 'tweeter', reference.frozenPassbandHz['tweeter'])).toBe(true);
    expect(isHighPassProtected(analysis, 'mid', reference.frozenPassbandHz['mid'])).toBe(false);

    const withLimit = evaluateGates(netlist, { maxDriveOnFsDb: -60 }, reference, 'frozen');
    const subjects = withLimit.verdicts.filter((v) => v.gate === 'M-C').map((v) => v.subject);
    expect(subjects).toEqual(['tweeter']);
    expect(withLimit.failures.map((f) => f.gate)).toEqual(['M-C']);
    // The derived parameters travel with the verdict: a limit judged against
    // a band nobody can see is the V15 mistake one level down.
    const mc = withLimit.verdicts.find((v) => v.gate === 'M-C')!;
    expect(String(mc.parameters!.f_s)).toContain('Hz');
    expect(String(mc.parameters!.passband)).toContain('frozen');
  });

  it('M-1 — protection is a property of the FILTER: a resonance in the driver\'s own impedance cannot make a low pass read as a high pass', () => {
    /* THE TRAP, MEASURED ON CASUS 1 (casebook M-1): with the woofer valid from
     * 20.5 Hz the probe lands at 10–29 Hz, where a reflex woofer's motional
     * peak and a series coil resonate; the seed of a 201 Hz LR2 read +3.2 dB
     * "inside" against −0.5 dB "below" and the low pass was classified as a
     * high pass — M-C then judged the woofer at f_p and refused every
     * candidate. Reproduced here on the two-way fixture: the LOW driver's
     * impedance gets a synthetic 6× peak just above its passband floor. The
     * transfer into the MEASURED impedance rises by more than the rule's
     * threshold (the old reading would have said "protected"); the rule reads
     * the filter's transfer into a resistive load and says it is not. The
     * tweeter's real high pass is unaffected either way. */
    const low = Object.keys(reference.frozenPassbandHz).find((d) => !reference.frozenHighPassProtected.includes(d))!;
    /* A passband floor one octave up the grid, so the probe has room below it
     * (the fixture's grid starts at the frozen floor). The driver's impedance
     * gets the SHAPE of a reflex woofer around that floor: a dip below it
     * (×0.25, the port minimum) and a peak inside it (×4, the upper motional
     * peak) — with a series coil in front, that alone lifts the transfer into
     * the passband. */
    const pass: [number, number] = [V2_GRID[0] * 2, reference.frozenPassbandHz[low][1]];
    const base = v2DriverZ();
    const boosted = {
      ...base,
      [low]: base[low].map((z, i) => {
        const f = V2_GRID[i];
        const k = f >= pass[0] && f <= pass[0] * 2 ** 0.5 ? 4 : f < pass[0] / 2 ** 0.5 ? 0.25 : 1;
        return { re: z.re * k, im: z.im * k };
      }),
    };
    const a2 = buildAnalysis(netlist, V2_GRID, boosted);
    // The old reading, on the measured transfer: a rise the threshold would have taken for a high pass.
    const median = (h: readonly { re: number; im: number }[], lo: number, hi: number) => {
      const v = V2_GRID.map((f, i) => (f >= lo && f <= hi ? 20 * Math.log10(Math.hypot(h[i].re, h[i].im)) : null))
        .filter((x): x is number => x !== null)
        .sort((x, y) => x - y);
      return v.length ? v[v.length >> 1] : null;
    };
    const probe = pass[0] / 2 ** 0.5;
    const below = median(a2.transferByModel[low], probe / 2 ** 0.5, probe);
    const inside = median(a2.transferByModel[low], pass[0], pass[0] * 2 ** 0.5);
    expect(below).not.toBeNull();
    expect(inside! - below!).toBeGreaterThanOrEqual(1);
    // ...and the rule, since M-1, is not fooled by it.
    expect(isHighPassProtected(a2, low, pass)).toBe(false);
    expect(isHighPassProtected(analysis, low, pass)).toBe(false);
    expect(isHighPassProtected(a2, 'tweeter', reference.frozenPassbandHz['tweeter'])).toBe(true);
  });

  it('a gate that cannot be evaluated says so; it does not condemn', () => {
    // "We could not look" and "it failed" are different claims, and only one
    // of them is true when a driver has no resonance to read.
    const noFs = { ...reference, fsHz: {}, frozenHighPassProtected: ['tweeter'] };
    const e = evaluateGates(netlist, { maxDriveOnFsDb: -60 }, noFs, 'frozen');
    expect(e.verdicts.some((v) => v.gate === 'M-C')).toBe(false);
    expect(e.failures).toEqual([]);
  });

  it('the fingerprint key holds only the limits that were actually set', () => {
    expect(gateSettingsKey({})).toEqual({});
    expect(gateSettingsKey({ minEpdrOhm: 2 })).toEqual({ minEpdrOhm: 2 });
    expect(anyGateActive({ ampMinLoadOhm: 4 })).toBe(true);
  });
});
