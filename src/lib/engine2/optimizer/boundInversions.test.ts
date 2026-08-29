/**
 * DELIVERABLE 4, ACCEPTANCE — the `grens_inversies` references of casus 1.
 *
 * These three numbers sat in `golden_refs_casus1.json` under the status
 * "F2-REFERENTIE": kept as an acceptance criterion for the phase that would
 * use them, which is this one. They become ordinary asserts here, and — per
 * the V15 process rule the casebook produced at F1 — each one now records the
 * parameters it was computed with, because a reference whose band, averaging
 * or reference level is not written down is not reproducible and therefore
 * not a reference.
 *
 * ONE OF THE THREE WAS REVISED, and it is the third instance of exactly the
 * pattern V15 describes. The LF-lift inversion was computed on the session
 * band of `metrics5.py` (40–110 Hz, normalised at 150 Hz) where A4 M-D asks
 * for a band derived from the impedance peak. Fed those session parameters
 * this engine reproduces the withdrawn 2.65 mH to within a percent — the band
 * difference is the whole explanation, exactly as it was for M-C — and that
 * reproduction stays here as a standing test beside the live reference on the
 * derived convention.
 */

import { describe, expect, it } from 'vitest';
import { casus1Files, casus1Filter, casus1Manifest, loadGolden } from '../casus1.fixture.ts';
import { runIngest } from '../ingest/derive.ts';
import { H_PER_MH, F_PER_UF } from '../constants.ts';
import { lfBump } from '../metrics/acoustic.ts';
import {
  invertBudgets,
  maxSeriesInductanceFromBump,
  maxSeriesResistanceFromQes,
  maxPadResistanceFromAttenuation,
  passbandImpedanceMedian,
  preBoundSeriesCapacitance,
  searchBoxFor,
  type BudgetWay,
} from './bounds.ts';
import type { Complex } from '../../complex.ts';
import type { VxpPart } from '../../parsers/vxp.ts';

const golden = loadGolden();
const TOL = golden.toleranties;
const REF = golden.grens_inversies;

const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const ingest = runIngest(manifest, files);
const filter = casus1Filter('HUIDIG', manifest, files, golden);

const woofer = ingest.drivers.find((d) => d.driver === 'woofer')!;

/** The measured impedance sweep of one driver, as complex values on its own grid. */
function measuredZ(driver: string): { grid: readonly number[]; z: Complex[]; magnitude: readonly number[] } {
  const raw = filter.driverZ[driver];
  const z = raw.freq.map((_, i) => {
    const m = raw.magnitude[i];
    const ph = (raw.phaseDeg[i] * Math.PI) / 180;
    return { re: m * Math.cos(ph), im: m * Math.sin(ph) };
  });
  return { grid: raw.freq, z, magnitude: raw.magnitude };
}

describe('A5d.6 bound inversions - casus 1 references', () => {
  it('the reference file records the parameters of every inversion (V15 process rule)', () => {
    // The rule the casebook produced at F1, applied to this block. Without
    // these the numbers below are memories, not references.
    expect(REF.parameters).toBeTruthy();
    expect(REF.parameters.maxRs_Qmult.R_e_ohm).toBeGreaterThan(0);
    expect(REF.parameters.maxRs_Qmult.R_e_herkomst.length).toBeGreaterThan(80);
    expect(REF.parameters.maxL_bult.pad_R_ohm).toBeGreaterThan(0);
    expect(REF.parameters.maxL_bult.band).toContain('f_p');
    expect(REF.parameters.max_padR.budget_dB).toBeGreaterThan(0);
    expect(REF.parameters.max_padR.doorlaatband_hz).toHaveLength(2);
    expect(REF.herziening_F2.length).toBeGreaterThan(80);
  });

  /* ================= exact inversion 1: Q_es budget ================= */

  it('Q_es budget -> max total series R reproduces 0.87 / 1.45 / 2.90 Ohm', () => {
    // V12 lists all three multiplications; reproducing one of them would not
    // distinguish the formula from a coincidence.
    const re = REF.parameters.maxRs_Qmult.R_e_ohm;
    for (const [q, expected] of [
      [1.3, REF.maxRs_Qmult1_3_ohm],
      [1.5, REF.maxRs_Qmult1_5_ohm],
      [2.0, REF.maxRs_Qmult2_0_ohm],
    ] as [number, number][]) {
      const got = maxSeriesResistanceFromQes(re, q);
      expect(got).not.toBeNull();
      expect(Math.abs(got! - expected)).toBeLessThanOrEqual(TOL.ohm);
    }
  });

  it('a budget that asks for no multiplication yields no bound rather than a zero', () => {
    expect(maxSeriesResistanceFromQes(3, 1)).toBeNull();
    expect(maxSeriesResistanceFromQes(0, 1.5)).toBeNull();
  });

  /* ================= exact inversion 2: LF-lift budget ================= */

  const bumpInput = (pathROhm: number) => {
    const z = measuredZ('woofer');
    return {
      nfGrid: woofer.nearField!.grid,
      nfDb: woofer.nearField!.db,
      zGrid: z.grid,
      z: z.z,
      fPeakHz: woofer.impedance!.fundamentalHz!,
      nfValidHz: woofer.nearField!.bandHz,
      pathROhm,
    };
  };

  /** The M-D lift a given series inductance produces — the metric itself. */
  const liftAt = (
    henry: number,
    pathROhm: number,
    session?: { overrideBandHz: [number, number]; overrideReferenceHz: number },
  ): number | null => {
    const z = measuredZ('woofer');
    const h = z.grid.map((f, i) => {
      const zl = { re: z.z[i].re + pathROhm, im: z.z[i].im + 2 * Math.PI * f * henry };
      const d = zl.re * zl.re + zl.im * zl.im;
      return {
        re: (z.z[i].re * zl.re + z.z[i].im * zl.im) / d,
        im: (z.z[i].im * zl.re - z.z[i].re * zl.im) / d,
      };
    });
    const r = lfBump(
      woofer.nearField!.grid,
      woofer.nearField!.db,
      z.grid,
      h,
      woofer.impedance!.fundamentalHz!,
      { validHz: woofer.nearField!.bandHz, ...(session ?? {}) },
    );
    return r ? r.extraDb : null;
  };

  it('LF budget -> max series L on the RESONANT half, on the band A4 M-D derives', () => {
    const p = REF.parameters.maxL_bult;
    const solved = maxSeriesInductanceFromBump(bumpInput(p.pad_R_ohm), p.budget_dB);
    expect(solved).not.toBeNull();

    /* THE ASSERT IS ON THE METRIC, NOT ON THE MILLIHENRY, and the reference
     * file says so in `parameters.maxL_bult.assert`. An inverted bound inherits
     * the tolerance of the metric it inverts: at the stored inductance the
     * quantity being bounded must equal the budget within the dB class. A
     * separate component-tolerance class would hide that relation and would
     * have to be argued about on its own.
     *
     * SINCE V43 THAT QUANTITY IS THE RESONANT HALF — what the reactance adds on
     * top of the same path with no reactance at all — so the metric is read
     * twice and subtracted, exactly as the inversion does it. */
    const stored = REF.maxL_bij_Rs0_5_budget1_4dB_opslingering_mH * H_PER_MH;
    const atStored = liftAt(stored, p.pad_R_ohm);
    const atZero = liftAt(0, p.pad_R_ohm);
    expect(atStored).not.toBeNull();
    expect(atZero).not.toBeNull();
    expect(Math.abs(atStored! - atZero! - p.budget_dB)).toBeLessThanOrEqual(TOL.dB);

    // The purely resistive half at that path resistance is recorded beside the
    // bound, because it is the part the search can neither spend nor repair.
    expect(Math.abs(atZero! - p.decompositie.lift_bij_L0_dB)).toBeLessThanOrEqual(TOL.dB);
    expect(Math.abs(solved!.resistiveLiftDb - atZero!)).toBeLessThan(1e-9);

    // ...and the solve really did land ON the budget rather than near it.
    expect(solved!.atBudgetDb).toBeLessThanOrEqual(p.budget_dB + 1e-6);
    expect(solved!.atBudgetDb).toBeGreaterThan(p.budget_dB - 0.01);
    expect(
      Math.abs(solved!.maxHenry / H_PER_MH - REF.maxL_bij_Rs0_5_budget1_4dB_opslingering_mH),
    ).toBeLessThan(0.01);
  });

  it('the V42 form of this same bound is a BRIDGE, and it still reproduces', () => {
    /* The redefinition is only defensible if both halves of it are visible: the
     * quantity moved (extraDb -> resonantDb) AND the stated budget was
     * re-derived on the designer's own coil rule (2.5 -> 1.4 dB). Together they
     * leave the ceiling nearly where it was — 2.432 -> 2.322 mH — and THAT is
     * the claim this test keeps honest. Changing the quantity alone, with the
     * old 2.5 dB left standing, would have moved it to 3.162 mH. */
    const b = REF._maxL_op_de_som_V42;
    const p = REF.parameters.maxL_bult;

    // The withdrawn value, on the quantity it was solved against.
    const atOld = liftAt(b.waarde * H_PER_MH, b.pad_R_ohm);
    expect(Math.abs(atOld! - b.budget_dB)).toBeLessThanOrEqual(TOL.dB);

    // The recorded "quantity changed, budget not" figure, on the new quantity.
    const atZero = liftAt(0, b.pad_R_ohm)!;
    const atUnrevised = liftAt(b.waarde_zonder_herijking * H_PER_MH, b.pad_R_ohm)!;
    expect(Math.abs(atUnrevised - atZero - b.budget_dB)).toBeLessThanOrEqual(TOL.dB);

    // And the move that actually happened is small, where that one is not.
    const live = REF.maxL_bij_Rs0_5_budget1_4dB_opslingering_mH;
    expect(Math.abs(live - b.waarde) / b.waarde).toBeLessThan(0.1);
    expect((b.waarde_zonder_herijking - b.waarde) / b.waarde).toBeGreaterThan(0.25);
    expect(p.budget_dB).toBeLessThan(b.budget_dB);
  });

  it('the WITHDRAWN 25-08 value reproduces from its own session band', () => {
    // The evidence that the band choice was the entire explanation. Same
    // shape as the M-C reproduction the golden suite already carries, and the
    // same assert: fed the recorded session band and reference, the lift at
    // the withdrawn 2.65 mH IS the 2.5 dB budget, within the dB class.
    const w = REF._maxL_sessie_25_08;
    const session = {
      overrideBandHz: w.band_hz as [number, number],
      overrideReferenceHz: w.referentie_hz,
    };
    const atWithdrawn = liftAt(w.waarde * H_PER_MH, w.pad_R_ohm, session);
    expect(atWithdrawn).not.toBeNull();
    expect(Math.abs(atWithdrawn! - w.budget_dB)).toBeLessThanOrEqual(TOL.dB);

    // On the DERIVED band the same inductance overshoots the budget by more
    // than the dB class — which is why the live reference moved.
    const derivedAtWithdrawn = liftAt(w.waarde * H_PER_MH, w.pad_R_ohm);
    expect(Math.abs(derivedAtWithdrawn! - w.budget_dB)).toBeGreaterThan(TOL.dB);
  });

  it('V12 REVISITED (V43): at 2 Ohm the resistive half alone spends the old budget', () => {
    /* V12's counter-case used to be an assert that this function returns NULL
     * there — no inductor meets 2.5 dB at 2 Ω of path resistance, so the answer
     * was "this is a damping problem, not a component limit". V43 measured WHY,
     * and the why dissolves the case: at 2 Ω the path's own resistance already
     * lifts the band past 2.5 dB with no coil in it at all. The budget was
     * never being spent by an inductor there.
     *
     * So the claim is kept and sharpened rather than deleted. What used to be
     * "no bound exists" is now "the RESISTIVE half alone exceeds the old
     * budget", which is the same measurement said correctly — and on the
     * quantity the requirement uses today a bound does exist, because the
     * resonant half starts at zero. */
    const w = REF._maxL_sessie_25_08;
    const pathR = REF.parameters.maxL_bult.tegenvoorbeeld_pad_R_ohm;
    const session = {
      overrideBandHz: w.band_hz as [number, number],
      overrideReferenceHz: w.referentie_hz,
    };

    // The old case, restated as what it always measured.
    const resistiveOnly = liftAt(0, pathR, session);
    expect(resistiveOnly).not.toBeNull();
    expect(resistiveOnly!).toBeGreaterThan(w.budget_dB);

    // And on the resonant half there IS a bound — the requirement is not silent
    // there any more, which is the whole of V43's change to this rule.
    const solved = maxSeriesInductanceFromBump(
      { ...bumpInput(pathR), ...session },
      REF.parameters.maxL_bult.budget_dB,
    );
    expect(solved).not.toBeNull();
    expect(solved!.maxHenry).toBeGreaterThan(0);
    expect(Math.abs(solved!.resistiveLiftDb - resistiveOnly!)).toBeLessThan(1e-9);
  });

  /* ================= exact inversion 3: sensitivity gap ================= */

  it('sensitivity gap -> max pad resistance reproduces 3.5 Ohm for the tweeter', () => {
    const p = REF.parameters.max_padR;
    const z = measuredZ('tweeter');
    const median = passbandImpedanceMedian(z.grid, z.magnitude, p.doorlaatband_hz as [number, number]);
    expect(median).not.toBeNull();
    const got = maxPadResistanceFromAttenuation(median!, p.budget_dB);
    expect(got).not.toBeNull();
    expect(Math.abs(got! - REF.max_padR_tweeter_gap_ohm)).toBeLessThanOrEqual(TOL.ohm);
  });

  /* ================= the topology-aware pre-bound ================= */

  it('V12: a SLACK pre-bound never excludes the design it is applied to', () => {
    // The counterexample the casebook records: a single-section pre-bound of
    // 5-10 uF against a realised 42 uF fourth-order midrange high pass. Two
    // separate claims, and both matter.
    const c = REF.parameters.voorbound_serie_C;
    const single = preBoundSeriesCapacitance(c.Z_ohm, c.f_s_hz, c.verzwakking_dB, 1)!;
    const fourth = preBoundSeriesCapacitance(c.Z_ohm, c.f_s_hz, c.verzwakking_dB, 4)!;

    // (1) The mechanism: the bound widens with order, because every extra
    //     section takes a share of the attenuation.
    expect(single / F_PER_UF).toBeLessThan(c.gerealiseerd_uF);
    expect(fourth).toBeGreaterThan(single);

    // (2) The rule that makes the widening factor safe to be uncalibrated: a
    //     SLACK bound applied to a network never lands below that network's
    //     own value. Choosing a bigger factor would only move the collision;
    //     refusing to condemn on a slack bound removes the class.
    const realised = c.gerealiseerd_uF * F_PER_UF;
    const parts: VxpPart[] = [
      {
        type: 'Generator',
        partId: 'G1',
        params: [
          { name: 'Eg', value: 2.83, unit: 'V' },
          { name: 'Rg', value: 0.001, unit: 'Ω' },
        ],
        wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
      {
        type: 'Capacitor',
        partId: 'C1',
        params: [{ name: 'C', value: c.gerealiseerd_uF, unit: 'uF' }],
        wires: [{ x: 3, y: 4 }, { x: 9, y: 4 }],
      },
      {
        type: 'Driver',
        partId: 'D1',
        model: 'mid',
        params: [],
        wires: [{ x: 9, y: 4 }, { x: 9, y: 11 }],
      },
      { type: 'Ground', params: [], wires: [{ x: 9, y: 11 }] },
    ];
    const box = searchBoxFor(parts, [
      {
        rule: 'drive-series-c',
        subject: 'mid',
        quantity: 'series capacitance (pre-bound)',
        maxSI: single,
        unit: 'F',
        slack: true,
        parameters: {},
        notes: [],
      },
    ]);
    expect(box.valueCeilings['C1']).toBeGreaterThanOrEqual(realised);
    expect(box.notes.join(' ')).toContain('SLACK');
  });

  /* ================= the box actually shrinks ================= */

  const network = (): VxpPart[] => [
    {
      type: 'Generator',
      partId: 'G1',
      params: [
        { name: 'Eg', value: 2.83, unit: 'V' },
        { name: 'Rg', value: 0.001, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
    {
      type: 'Inductor',
      partId: 'L1',
      params: [
        { name: 'L', value: 4.0, unit: 'mH' },
        { name: 'DCR', value: 0.2, unit: 'Ω' },
      ],
      wires: [{ x: 3, y: 4 }, { x: 8, y: 4 }],
    },
    {
      type: 'Resistor',
      partId: 'R1',
      params: [{ name: 'R', value: 2.2, unit: 'Ω' }],
      wires: [{ x: 8, y: 4 }, { x: 12, y: 4 }],
    },
    {
      type: 'Driver',
      partId: 'D1',
      model: 'woofer',
      params: [],
      wires: [{ x: 12, y: 4 }, { x: 12, y: 11 }],
    },
    { type: 'Ground', params: [], wires: [{ x: 12, y: 11 }] },
  ];

  const wayFor = (over: Partial<BudgetWay> = {}): BudgetWay => {
    const z = measuredZ('woofer');
    return {
      driver: 'woofer',
      lowest: true,
      highPassProtected: false,
      reOhm: REF.parameters.maxRs_Qmult.R_e_ohm,
      reSource: 'the reference file',
      zPassbandMedianOhm: passbandImpedanceMedian(z.grid, z.magnitude, [100, 400]),
      passbandHz: [100, 400],
      fsHz: woofer.impedance!.fundamentalHz!,
      fPeakHz: woofer.impedance!.fundamentalHz!,
      gapBudgetDb: null,
      pathROhm: REF.parameters.maxL_bult.pad_R_ohm,
      nearField: {
        grid: woofer.nearField!.grid,
        db: woofer.nearField!.db,
        validHz: woofer.nearField!.bandHz,
      },
      impedance: { grid: z.grid, z: z.z },
      ...over,
    };
  };

  it('an ACTIVE budget demonstrably shrinks the search box; an absent one leaves it alone', () => {
    const parts = network();

    const off = invertBudgets([wayFor()], {});
    expect(off.bounds).toHaveLength(0);
    const boxOff = searchBoxFor(parts, off.bounds);
    expect(Object.keys(boxOff.valueCeilings)).toHaveLength(0);
    expect(boxOff.valueSumCeilings).toHaveLength(0);

    const on = invertBudgets([wayFor()], {
      qesMultiplierMax: REF.parameters.maxRs_Qmult.q_max,
      lfBumpBudgetDb: REF.parameters.maxL_bult.budget_dB,
    });
    expect(on.bounds.map((b) => b.rule).sort()).toEqual(['bump-series-l', 'qes-series-r']);
    const boxOn = searchBoxFor(parts, on.bounds);

    // The coil: the seed carries 4 mH and the LF-lift budget allows far less,
    // so the ceiling is BELOW the seed value — the box really did move, and it
    // moved to where the measurement says it has to be.
    const coilCeiling = boxOn.valueCeilings['L1'];
    expect(coilCeiling).toBeGreaterThan(0);
    expect(coilCeiling / H_PER_MH).toBeLessThan(4.0);

    // The resistor: bounded as a SUM, with the coil's DCR taken off the top
    // because the tuner cannot move it.
    const sum = boxOn.valueSumCeilings.find((g) => g.ids.includes('R1'));
    expect(sum).toBeTruthy();
    expect(sum!.maxSI).toBeCloseTo(REF.maxRs_Qmult1_5_ohm, 2);
    expect(sum!.fixedSI).toBeCloseTo(0.2, 6);
    expect(boxOn.valueCeilings['R1']).toBeCloseTo(REF.maxRs_Qmult1_5_ohm - 0.2, 6);
  });

  it('a stated budget that cannot be inverted produces a NOTE, never a silent pass', () => {
    const noRe = invertBudgets([wayFor({ reOhm: null })], { qesMultiplierMax: 1.5 });
    expect(noRe.bounds).toHaveLength(0);
    expect(noRe.notes.join(' ')).toContain('R_e');

    const noNf = invertBudgets([wayFor({ nearField: undefined })], { lfBumpBudgetDb: 2.5 });
    expect(noNf.bounds).toHaveLength(0);
    expect(noNf.notes.join(' ')).toContain('near-field');
  });
});
