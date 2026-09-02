/**
 * V49 — M-C v2.0 ON A BENCH WHERE EVERY LINE IS ALGEBRA.
 *
 * The four kinds of test the metric skill asks for, on synthetic inputs chosen
 * so that each answer is one line by hand:
 *
 *  1. HAND CALCULATION. Bl·Q_ms/(Z_max·M_ms·ω0²) with round numbers; the
 *     acoustic route on a piston whose pressure is a textbook line; the ceiling
 *     as a plain ratio; the passband-relative limit as a subtraction.
 *  2. THE OFF STATES (P2/P4). A missing X_max, margin, peak or resonance is a
 *     refusal that NAMES the field; a missing Bl hands the ceiling to the
 *     acoustic route and says so; neither route is a silent zero.
 *  3. NEW MEASUREMENT. Shift the resonance and the displacement per volt moves
 *     as 1/ω0²; raise Z_max and it falls as 1/Z — two different inputs, two
 *     different laws, so the number cannot be one thing under two names (V23).
 *  4. THE WEAKEST-LINK MODEL agrees with the resonance formula exactly AT the
 *     resonance and is stiffness-controlled below it.
 *
 * Nothing here names a driver, a frequency of casus 1, or a project number: the
 * numbers are the bench's own, chosen to make the arithmetic visible.
 */

import { describe, expect, it } from 'vitest';
import {
  DRIVE_EXCURSION_VERSION,
  derivedDriveLimitDb,
  displacementPerVoltAt,
  displacementPerVoltFromSpl,
  displacementPerVoltOnResonance,
  driveExcursion,
  excursionCeiling,
  peakInputVolts,
  splAtPowerRe1m,
  weakestLink,
  type DriverCard,
} from './driveExcursion.ts';
import { AIR_DENSITY_KG_M3, REFERENCE_SOUND_PRESSURE_PA } from '../constants.ts';

/* A resonator where every factor is a round number:
 *   Bl 5 T·m, M_ms 10 g, Q_ms 4, Z_max 40 Ω, f0 = 1000/(2π) Hz so ω0 = 1000 rad/s.
 *   x/V = 5·4 / (40·0.01·1e6) = 20 / 4e5 = 5e-5 m/V = 0.05 mm/V. */
const F0 = 1000 / (2 * Math.PI);
const BENCH = { blTm: 5, mmsG: 10, qms: 4, zMaxOhm: 40, f0Hz: F0 };

describe('M-C v2.0 — hand calculations', () => {
  it('route 1: x/V on the resonance is Bl·Q_ms/(Z_max·M_ms·ω0²)', () => {
    expect(displacementPerVoltOnResonance(BENCH)).toBeCloseTo(5e-5, 12);
    // Two drivers in parallel behind the same measured impedance: each coil
    // sees V/(2·Z), so half the displacement.
    expect(displacementPerVoltOnResonance({ ...BENCH, parallelCount: 2 })).toBeCloseTo(2.5e-5, 12);
  });

  it('the peak input voltage is √2·√(P·R): 160 W into 8 Ω is 50.6 V', () => {
    // A hand-checkable pair rather than a project number: 2·160·8 = 2560, √2560 = 50.596.
    expect(peakInputVolts({ peakPowerW: 160, nominalLoadOhm: 8 })).toBeCloseTo(Math.sqrt(2560), 9);
    expect(peakInputVolts({ peakPowerW: 1, nominalLoadOhm: 8 })).toBeCloseTo(4, 9);
  });

  it('the ceiling: X_max·margin over x/V gives the allowed volts, then dB re the peak input', () => {
    const c = excursionCeiling({ xPerVoltMPerV: 5e-5, xMaxMm: 1, marginFraction: 0.5, peakInputVolts: 40 });
    // 0.5 mm / 0.05 mm/V = 10 V; 20·log10(10/40) = −12.04 dB.
    expect(c.xLimitMm).toBeCloseTo(0.5, 12);
    expect(c.allowedVolts).toBeCloseTo(10, 9);
    expect(c.ceilingDbReInput).toBeCloseTo(20 * Math.log10(0.25), 9);
  });

  it('the passband-relative limit is the ceiling minus the passband mean — one subtraction', () => {
    // A way whose passband sits 6 dB below the input may have its f_s voltage at
    // (ceiling − (−6)) = ceiling + 6 dB relative to that passband.
    expect(derivedDriveLimitDb(-12, -6)).toBeCloseTo(-6, 12);
    expect(derivedDriveLimitDb(-12, 0)).toBeCloseTo(-12, 12);
  });

  it('route 2: a piston whose pressure is a textbook line', () => {
    /* Choose x, S_d, r and V; compute the SPL a baffled piston would produce;
     * hand it back and expect the same x/V. Round trip, every factor named. */
    const x = 1e-4; // m
    const sdCm2 = 100; // 0.01 m²
    const rMm = 1000;
    const v = 2;
    const w0 = 2 * Math.PI * F0;
    const p = (AIR_DENSITY_KG_M3 * 0.01 * w0 * w0 * x) / (2 * Math.PI * 1);
    const spl = 20 * Math.log10(p / REFERENCE_SOUND_PRESSURE_PA);
    expect(
      displacementPerVoltFromSpl({ splDb: spl, driveVoltageV: v, micDistanceMm: rMm, sdCm2, f0Hz: F0 }),
    ).toBeCloseTo(x / v, 12);
    // Twice the area (two drivers) for the same pressure means half the displacement.
    expect(
      displacementPerVoltFromSpl({ splDb: spl, driveVoltageV: v, micDistanceMm: rMm, sdCm2, f0Hz: F0, parallelCount: 2 }),
    ).toBeCloseTo(x / v / 2, 12);
  });

  it('SPL at a stated power: the voltage ratio and the inverse-distance term, nothing else', () => {
    // 90 dB at 2 V and 2 m; at 8 W into 2 Ω the voltage is 4 V (+6.02 dB), and 2 m → 1 m is +6.02 dB.
    const s = splAtPowerRe1m({ splDb: 90, driveVoltageV: 2, micDistanceMm: 2000, powerW: 8, nominalLoadOhm: 2 });
    expect(s).toBeCloseTo(90 + 20 * Math.log10(2) + 20 * Math.log10(2), 9);
  });

  it('the version string is the register row: M-C went to 2.0', () => {
    expect(DRIVE_EXCURSION_VERSION).toBe('drive-excursion/2.0');
  });
});

describe('M-C v2.0 — the assembled result and its off states (P2/P4)', () => {
  const card: DriverCard = { xMaxMm: 1, sdCm2: 100, blTm: 5, mmsG: 10 };
  const amp = { peakPowerW: 100, nominalLoadOhm: 4 }; // V_pk = √800 = 28.28 V
  const base = {
    driver: 'w',
    f0Hz: F0,
    card,
    amplifier: amp,
    marginFraction: 0.5,
    zMaxOhm: 40,
    qms: { value: 4, source: 'bench' },
  };

  it('with everything present the ceiling stands on route 1 and the acoustic route is off, by name', () => {
    const r = driveExcursion(base);
    expect('off' in r).toBe(false);
    if ('off' in r) return;
    expect(r.route).toBe('electromechanical');
    expect(r.xPerVoltMmPerV).toBeCloseTo(0.05, 9);
    expect(r.ceiling.allowedVolts).toBeCloseTo(10, 9);
    expect(r.ceiling.ceilingDbReInput).toBeCloseTo(20 * Math.log10(10 / Math.sqrt(800)), 9);
    expect('off' in r.acoustic).toBe(true);
    if ('off' in r.acoustic) expect(r.acoustic.off).toMatch(/drive voltage/);
    // The parameters carry every input (V15): a reader can redo the line.
    for (const k of ['f0_hz', 'X_max_mm', 'margin', 'peak_power_W', 'nominal_load_ohm', 'Bl_Tm', 'M_ms_g', 'Q_ms', 'Z_max_ohm']) {
      expect(r.parameters, k).toHaveProperty(k);
    }
  });

  it('a missing X_max, margin, peak or resonance is a refusal that names the field', () => {
    const off = (patch: Partial<typeof base> & { card?: DriverCard }) => {
      const r = driveExcursion({ ...base, ...patch });
      expect('off' in r, JSON.stringify(patch)).toBe(true);
      return 'off' in r ? r.off : '';
    };
    const { xMaxMm: _x, ...noXmax } = card;
    void _x;
    expect(off({ card: noXmax })).toMatch(/X_max/);
    expect(off({ marginFraction: 0 })).toMatch(/margin/);
    expect(off({ amplifier: { peakPowerW: 0, nominalLoadOhm: 4 } })).toMatch(/peak power/);
    expect(off({ amplifier: { peakPowerW: 100, nominalLoadOhm: 0 } })).toMatch(/nominal load/);
    expect(off({ f0Hz: 0 })).toMatch(/resonance/);
  });

  it('without Bl the ceiling falls to the ACOUSTIC route when that one has its inputs, and says so', () => {
    const w0 = 2 * Math.PI * F0;
    const x = 1e-4;
    const p = (AIR_DENSITY_KG_M3 * 0.01 * w0 * w0 * x) / (2 * Math.PI * 1);
    const spl = 20 * Math.log10(p / REFERENCE_SOUND_PRESSURE_PA);
    const { blTm: _bl, ...noBl } = card;
    void _bl;
    const r = driveExcursion({
      ...base,
      card: noBl,
      acoustic: { splDbAtF0: spl, driveVoltageV: 2, micDistanceMm: 1000, source: 'bench' },
    });
    expect('off' in r).toBe(false);
    if ('off' in r) return;
    expect(r.route).toBe('acoustic');
    expect(r.electromechanical).toBeNull();
    expect(r.xPerVoltMmPerV).toBeCloseTo((x / 2) * 1000, 9);
    expect(r.notes.join(' ')).toMatch(/ACOUSTIC route because Bl or M_ms is missing/);
  });

  it('with both routes present the acoustic one is REPORTED beside route 1 with its ratio, never as the ceiling', () => {
    const w0 = 2 * Math.PI * F0;
    // Make the acoustic reading exactly 2× the electromechanical one (1e-4 m/V vs 5e-5).
    const x = 2e-4;
    const p = (AIR_DENSITY_KG_M3 * 0.01 * w0 * w0 * x) / (2 * Math.PI * 1);
    const spl = 20 * Math.log10(p / REFERENCE_SOUND_PRESSURE_PA);
    const r = driveExcursion({
      ...base,
      acoustic: { splDbAtF0: spl, driveVoltageV: 2, micDistanceMm: 1000, source: 'bench' },
    });
    if ('off' in r) throw new Error(r.off);
    expect(r.route).toBe('electromechanical');
    expect('off' in r.acoustic).toBe(false);
    if ('off' in r.acoustic) return;
    expect(r.acoustic.ratioToElectromechanical).toBeCloseTo(2, 9);
    expect(r.notes.join(' ')).toMatch(/2\.00× the electromechanical/);
  });

  it('with neither route readable it is OFF and says both reasons', () => {
    const r = driveExcursion({ ...base, card: { xMaxMm: 1 }, qms: null });
    expect('off' in r).toBe(true);
    if (!('off' in r)) return;
    expect(r.off).toMatch(/neither route/);
    expect(r.off).toMatch(/Bl/);
    expect(r.off).toMatch(/drive voltage/);
  });
});

describe('M-C v2.0 — a new measurement moves the number by the right law (V23)', () => {
  it('a higher resonance moves x/V as 1/ω0²; a taller peak as 1/Z_max — two laws, not one', () => {
    const x0 = displacementPerVoltOnResonance(BENCH);
    expect(displacementPerVoltOnResonance({ ...BENCH, f0Hz: 2 * F0 })).toBeCloseTo(x0 / 4, 12);
    expect(displacementPerVoltOnResonance({ ...BENCH, zMaxOhm: 80 })).toBeCloseTo(x0 / 2, 12);
    // And Q_ms scales it linearly: a sharper resonance moves the cone further per volt.
    expect(displacementPerVoltOnResonance({ ...BENCH, qms: 8 })).toBeCloseTo(2 * x0, 12);
  });

  it('the off-resonance model agrees with the resonance formula AT f0 and is stiffness-controlled below it', () => {
    const at = (fHz: number, zOhm: number) =>
      displacementPerVoltAt({ blTm: 5, mmsG: 10, qms: 4, f0Hz: F0, zOhmAtF: zOhm, fHz });
    expect(at(F0, 40)).toBeCloseTo(displacementPerVoltOnResonance(BENCH), 12);
    // Far below f0 with |Z| = R_e: x/V → Bl/(R_e·M·ω0²) = 5/(8·0.01·1e6) = 6.25e-5, and it is flat.
    expect(at(F0 / 50, 8)).toBeCloseTo(6.25e-5, 7);
    expect(at(F0 / 100, 8)).toBeCloseTo(6.25e-5, 7);
    // Far above, it falls as 1/f² (the ω0² term is 1e-4 of ω² at 100·f0).
    expect(at(100 * F0, 8) / at(200 * F0, 8)).toBeCloseTo(4, 2);
  });

  it('the weakest-link scan reads the resonance point exactly and finds where the model reaches the limit', () => {
    const grid = [F0 / 8, F0 / 4, F0 / 2, F0, 2 * F0];
    const hAbs = [1, 1, 1, 1, 1];
    const zAbs = [8, 8, 8, 40, 8];
    const em = { xPerVoltMmPerV: 0.05, qms: 4, qmsSource: 'bench', zMaxOhm: 40, blTm: 5, mmsG: 10, parallelCount: 1 };
    const w = weakestLink({ grid, hAbs, zAbs, em, f0Hz: F0, xLimitMm: 1, peakInputVolts: 10 });
    // 10 V × 0.05 mm/V = 0.5 mm on the resonance: half the limit.
    expect(w.xAtF0Mm).toBeCloseTo(0.5, 9);
    expect(w.fractionOfLimit).toBeCloseTo(0.5, 9);
    /* Below f0 with |Z| = 8 Ω the mechanical term is |1 − (f/f0)² + j·(f/f0)/Q|
     * of ω0²: at f0/2 that is |0.75 + 0.125j| = 0.760, so the model reads
     * 10 V · 6.25e-5/0.760 = 0.822 mm there, and at f0/8 |0.984 + 0.031j| gives
     * 0.634 mm. Never the 1 mm limit on this grid; the worst is the point
     * nearest the resonance from below. */
    expect(w.reachesLimitAtHz).toBeNull();
    expect(w.worstMm).toBeCloseTo(0.822, 2);
    expect(w.worstAtHz).toBeCloseTo(F0 / 2, 9);
    // Lower the limit under the stiffness plateau and it is reached from the lowest grid point up.
    const w2 = weakestLink({ grid, hAbs, zAbs, em, f0Hz: F0, xLimitMm: 0.6, peakInputVolts: 10 });
    expect(w2.reachesLimitAtHz).toBeCloseTo(F0 / 8, 9);
    expect(w2.note).toMatch(/UNDERESTIMATES/);
  });
});
