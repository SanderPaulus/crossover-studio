/**
 * V49 — THE EXCURSION-DERIVED CEILING ON THE GATE, THE PRE-BOUND, THE WIRE
 * AND THE DECLARATION.
 *
 * `metrics/driveExcursion.test.ts` proves the arithmetic. This file proves
 * what happens to the number afterwards, and each claim is the shape this
 * project has learned to demand:
 *
 *  · THE STRICTER OF THE TWO APPLIES, in both directions — a stated figure
 *    stricter than the derived one bites, and a derived one stricter than the
 *    stated bites — and the verdict NAMES which (P4's visible half).
 *  · ABSENT IS ABSENT (P2/P4): no ceiling and no figure leaves M-C off and
 *    every other gate byte-identical; a ceiling alone arms M-C.
 *  · THE SEARCH BOX READS THE SAME RULE: the series-C pre-bound's required
 *    attenuation follows the effective limit, not the stated figure alone.
 *  · THE FACT REACHES THE FINGERPRINT and the WIRE: `measurementFactsKey`
 *    moves with it and `factsForWorker` carries it off the report.
 *  · A DERIVED CEILING IS AN ABSOLUTE RULE: the candidate declaration derives
 *    `protectionRule: 'stated'` from it without any stated dB figure.
 */

import { describe, expect, it } from 'vitest';
import {
  anyGateActive,
  effectiveDriveLimit,
  gateSettingsKey,
  gateVerdicts,
  type GateMetricValues,
  type GateSettings,
} from './gates.ts';
import { invertBudgets, type BudgetWay } from './bounds.ts';
import { measurementFactsKey } from './measurementFacts.ts';
import { declareCandidateChoices } from './candidateDeclaration.ts';

const VALUES: GateMetricValues = {
  dissipationFraction: 0.2,
  epdrMinOhm: 3,
  minZOhm: 4,
  driveVoltage: [
    // M-C reads −22 dB on a way whose passband sits 6 dB below the input:
    // inside a stated −20, inside a derived −12, outside a derived −24.
    { driver: 't', db: -22, fsHz: 900, passbandHz: [2000, 20000], bandSource: 'frozen', passbandMeanDb: -6 },
  ],
};

const mc = (s: GateSettings) => gateVerdicts(s, VALUES).find((v) => v.gate === 'M-C')!;

describe('V49 — the stricter of the stated figure and the derived ceiling judges', () => {
  it('neither stated: M-C is OFF, and the other gates are byte-identical with and without the field', () => {
    const a = gateVerdicts({}, VALUES);
    const b = gateVerdicts({ driveCeilingDbByDriver: {} }, VALUES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(mc({}).active).toBe(false);
    expect(mc({}).reason).toContain('no limit set');
    expect(anyGateActive({ driveCeilingDbByDriver: {} })).toBe(false);
  });

  it('a derived ceiling alone ARMS M-C, in passband-relative form, and names its source', () => {
    // Ceiling −18 dB re input on a passband at −6 dB → limit −12 dB re passband.
    const v = mc({ driveCeilingDbByDriver: { t: -18 } });
    expect(v.active).toBe(true);
    expect(v.limit).toBeCloseTo(-12, 9);
    expect(v.pass).toBe(true); // −22 ≤ −12
    expect(String(v.parameters?.limit_source)).toMatch(/excursion-derived/);
    expect(String(v.parameters?.limit_source)).toMatch(/no stated dB figure/);
    expect(v.parameters?.ceiling_re_peak_input_dB).toBe(-18);
    expect(anyGateActive({ driveCeilingDbByDriver: { t: -18 } })).toBe(true);
  });

  it('stated stricter than derived: the stated figure bites and says the derived one was looser', () => {
    const v = mc({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -18 } });
    expect(v.limit).toBe(-20);
    expect(v.pass).toBe(true);
    expect(String(v.parameters?.limit_source)).toMatch(/stated dB figure \(stricter/);
    expect(v.parameters?.derived_limit_dB).toBeCloseTo(-12, 6);
  });

  it('derived stricter than stated: the derived ceiling bites — and can refuse what the figure allowed', () => {
    // Ceiling −30 re input → −24 re passband, stricter than a stated −20; −22 exceeds it.
    const v = mc({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -30 } });
    expect(v.limit).toBeCloseTo(-24, 9);
    expect(v.pass).toBe(false);
    expect(String(v.parameters?.limit_source)).toMatch(/excursion-derived ceiling \(stricter/);
    expect(v.parameters?.stated_limit_dB).toBe(-20);
    // The same network under the stated figure alone would have passed.
    expect(mc({ maxDriveOnFsDb: -20 }).pass).toBe(true);
  });

  it('a ceiling for ANOTHER driver does not judge this one', () => {
    const v = mc({ driveCeilingDbByDriver: { m: -30 } });
    expect(v.active).toBe(false);
  });

  it('without a passband mean the derived half cannot form; the stated figure still judges and says so', () => {
    const values: GateMetricValues = {
      ...VALUES,
      driveVoltage: [{ driver: 't', db: -22, fsHz: 900, passbandHz: [2000, 20000], bandSource: 'frozen' }],
    };
    const v = gateVerdicts({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -30 } }, values).find(
      (x) => x.gate === 'M-C',
    )!;
    expect(v.limit).toBe(-20);
    expect(String(v.parameters?.limit_source)).toMatch(/no excursion-derived ceiling for this way/);
    expect(effectiveDriveLimit({ driveCeilingDbByDriver: { t: -30 } }, 't', undefined)).toBeUndefined();
  });

  it('the fingerprint moves with the ceiling, per driver, and is stable over a float\'s last digit', () => {
    const a = JSON.stringify(gateSettingsKey({ maxDriveOnFsDb: -20 }));
    const b = JSON.stringify(gateSettingsKey({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -18 } }));
    const c = JSON.stringify(gateSettingsKey({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -18.000000000001 } }));
    const d = JSON.stringify(gateSettingsKey({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -17 } }));
    expect(b).not.toBe(a);
    expect(c).toBe(b);
    expect(d).not.toBe(b);
    const f0 = JSON.stringify(measurementFactsKey({}));
    const f1 = JSON.stringify(measurementFactsKey({ driveCeilingDbByModel: { t: -18 } }));
    expect(f1).not.toBe(f0);
  });
});

describe('V49 — the series-C pre-bound reads the same effective limit', () => {
  const way: BudgetWay = {
    driver: 't',
    lowest: false,
    highPassProtected: true,
    reOhm: 5,
    reSource: 'bench',
    zPassbandMedianOhm: 6,
    passbandHz: [2000, 20000],
    passbandMeanDb: -6,
    fsHz: 900,
    fPeakHz: 900,
    gapBudgetDb: null,
    pathROhm: 0,
    order: 2,
  };
  const bound = (gates: Parameters<typeof invertBudgets>[2]) =>
    invertBudgets([way], {}, gates).bounds.find((b) => b.rule === 'drive-series-c');

  it('stated only: the required attenuation is the stated figure', () => {
    const b = bound({ maxDriveOnFsDb: -20 })!;
    expect(b.parameters.required_attenuation_dB).toBe(20);
    expect(b.parameters.limit_source).toBe('stated dB figure');
  });

  it('derived stricter: the required attenuation follows the ceiling (−30 re input, −24 re passband → 24 dB)', () => {
    const b = bound({ maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -30 } })!;
    expect(b.parameters.required_attenuation_dB).toBeCloseTo(24, 6);
    expect(String(b.parameters.limit_source)).toMatch(/excursion-derived/);
    // And a stricter requirement means a SMALLER capacitance ceiling.
    expect(b.maxSI).toBeLessThan(bound({ maxDriveOnFsDb: -20 })!.maxSI);
  });

  it('derived only, with no stated figure, still produces the pre-bound', () => {
    const b = bound({ driveCeilingDbByDriver: { t: -18 } })!;
    expect(b).toBeDefined();
    expect(b.parameters.required_attenuation_dB).toBeCloseTo(12, 6);
  });

  it('a way without a passband mean gets no derived half — the stated figure alone, or nothing', () => {
    const bare = { ...way, passbandMeanDb: null };
    expect(invertBudgets([bare], {}, { driveCeilingDbByDriver: { t: -18 } }).bounds).toHaveLength(0);
    expect(
      invertBudgets([bare], {}, { maxDriveOnFsDb: -20, driveCeilingDbByDriver: { t: -18 } }).bounds[0]
        .parameters.required_attenuation_dB,
    ).toBe(20);
  });
});

describe('V49 — a derived ceiling is an absolute rule for the candidate declaration', () => {
  const input = {
    cages: [[1000, 3000]] as [number, number][],
    windowFloorsHz: [500],
    multiWay: true,
    stated: {},
  };

  it('derives protectionRule = stated from the ceiling alone, exactly as from a stated figure', () => {
    const withCeiling = declareCandidateChoices({ ...input, driveCeilingDerived: true });
    expect(withCeiling.stated.protectionRule).toBe('stated');
    const withFigure = declareCandidateChoices({ ...input, driveOnFsLimitDb: -20 });
    expect(withFigure.stated.protectionRule).toBe('stated');
  });

  it('with neither, protectionRule is ABSENT with the P4 reason — never a stated seed', () => {
    const none = declareCandidateChoices(input);
    expect(none.stated.protectionRule).toBeUndefined();
    expect(none.absent.map((a) => a.key)).toContain('protectionRule');
  });
});
