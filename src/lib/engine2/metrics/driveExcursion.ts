/**
 * A4 M-C v2.0 (V49) — THE DRIVE ON A DRIVER'S OWN RESONANCE, AS EXCURSION.
 *
 * WHAT CHANGED AND WHY. M-C has always measured one number per protected way:
 * how many dB the driver voltage on f_s sits below the passband average
 * (`driveVoltageOnResonance`, `electrical.ts`). The LIMIT it was judged
 * against was a stated dB figure — −25 at V47, −20 at V47b, the "18 dB rule"
 * before either — and V47/V47b measured what a single stated decibel means:
 * something different on every driver (order, mounting, padding, level) and
 * something different for two drivers under one requirement. The mid of casus
 * 1 (±3 mm, 69 cm², f_c 88.8 Hz in its pod) became the worst refusal ground
 * at −7.3 dB without anyone knowing whether −7.3 dB on THAT driver is
 * dangerous, and a high-pass loses its divider on a high-Q resonance peak
 * (high Z_max), so a low attenuation on f_c is a divider question and not an
 * order question.
 *
 * The answer this module gives is the physical one: HOW MUCH does the cone
 * move on its resonance, at WHICH voltage, against WHICH X_max. The limit
 * stops being a convention and becomes a property of the driver, the cabinet
 * it sits in, and the amplifier that drives it.
 *
 * TWO ROUTES, BOTH REPORTED, NEITHER INVENTED.
 *
 *  ROUTE 1 — ELECTROMECHANICAL (the main route, load-independent). At the
 *  resonance the coil current is V/Z_max — Z_max INCLUDES the back-EMF, which
 *  is exactly why the measured in-situ peak is the right divisor — the force is
 *  Bl·I, and a mass-compliance resonator turns force into displacement with
 *  the gain Q_ms/(M_ms·ω0²):
 *
 *      x/V |_{f0}  =  Bl · Q_ms / (Z_max · M_ms · ω0²)
 *
 *  Z_max, f0 and Q_ms come from the MEASURED sweep in situ (the ingest pass
 *  classifies them; V49 added Small's Q per peak for this); Bl and M_ms from
 *  the driver card the designer entered from the datasheet.
 *
 *  ROUTE 2 — ACOUSTIC (the counter-proof). A baffled piston's far-field
 *  pressure is p = ρ0·S_d·a/(2π·r), with a = ω²·x, so a measured SPL at a
 *  DOCUMENTED drive voltage and mic distance gives a second reading of x/V.
 *  It assumes free (half-space) radiation and therefore OVERESTIMATES the
 *  displacement under any acoustic loading — a waveguide, a horn, a cabinet
 *  front raise p for the same x — so it is conservative everywhere, and the
 *  ratio route2/route1 is a MEASURED property of the mounting, reported as
 *  such. There is no geometry-specific branch in this code. Where Bl or M_ms
 *  is missing, route 2 stands in as the limit, and the result says so.
 *
 * FROM DISPLACEMENT TO A REQUIREMENT. The amplifier's peak input voltage is
 * √2·√(P·R_nom) — the highest voltage it delivers briefly, from two stated
 * project numbers. The requirement per high-pass-protected way is that at
 * that input the cone on its resonance stays within X_max·margin. That is a
 * ceiling on the DRIVER voltage at f0, expressed here in dB relative to the
 * amplifier's peak input (`ceilingDbReInput`); the gate turns it into the
 * passband-relative form M-C has always used by subtracting the way's
 * passband mean level, which the gate already holds. Per driver, per design.
 *
 * WHAT ONE POINT IS ENOUGH FOR (monotonicity). Below the resonance the cone
 * is stiffness-controlled (x/V roughly constant), above it x/V falls as 1/f²;
 * under a monotonically falling high-pass transfer the resonance is therefore
 * the maximum of displacement per volt, and one point suffices (V47). The
 * `protSqDb` control column (V47/V48) keeps watching that assumption.
 *
 * WHAT THIS DOES NOT COVER, said here and in the report: thermal load (the
 * V36 watt column stays the visibility), distortion near resonance (the
 * manufacturer's recommended lower limit is context, never a limit). No
 * thermal requirement lives here.
 *
 * EVERY INPUT IS STATED OR MEASURED, NONE IS DEFAULTED (P4/P6). No X_max, no
 * margin, no power, no nominal load and no drive voltage exists in this file.
 * A missing input switches the route off with the missing field named.
 */

import {
  AIR_DENSITY_KG_M3,
  G_PER_KG,
  M2_PER_CM2,
  MM_PER_M,
  REFERENCE_SOUND_PRESSURE_PA,
} from '../constants.ts';
import { ampFromDb, dbAmp } from '../util.ts';

/**
 * `<name>/<major>.<minor>` — the M-C register row went 1.x → 2.0 at V49: the
 * QUANTITY the limit is derived from changed (excursion instead of a stated
 * decibel), which is a major bump by the rule in `version.ts`.
 */
export const DRIVE_EXCURSION_VERSION = 'drive-excursion/2.0';

/**
 * THE DRIVER CARD — what the designer copies off a datasheet, per driver.
 *
 * Every field optional and none defaulted. `parallelCount` is the one field
 * with an ordinary meaning when absent: a way is one driver unless the project
 * says otherwise, exactly as `sourceCount` is read for the lobing fractions
 * (V20). It matters because a MEASURED impedance of N identical drivers in
 * parallel is Z/N, so the current through EACH coil is V/(N·Z_measured), and
 * the radiating area is N·S_d.
 */
export interface DriverCard {
  /** Linear excursion, one way, mm. */
  xMaxMm?: number;
  /** Effective piston area of ONE driver, cm². */
  sdCm2?: number;
  /** Force factor, T·m. */
  blTm?: number;
  /** Moving mass (cone + coil + air load as the datasheet states it), g. */
  mmsG?: number;
  /** Identical drivers wired in parallel and measured as one. Absent = 1. */
  parallelCount?: number;
  /** Where these numbers came from — shown with every result. */
  source?: string;
}

/** What the amplifier is stated to deliver: its brief peak, at a nominal load. */
export interface AmplifierPeak {
  /** The highest power the amplifier delivers briefly, W (e.g. IHF dynamic). */
  peakPowerW: number;
  /** The load that figure is specified into, Ω. */
  nominalLoadOhm: number;
}

/* ================================================================== *
 * The building blocks — each one a hand calculation
 * ================================================================== */

/** Peak voltage at the filter input: V_pk = √2·√(P·R_nom). */
export function peakInputVolts(amp: AmplifierPeak): number {
  return Math.sqrt(2 * amp.peakPowerW * amp.nominalLoadOhm);
}

/** RMS voltage at a stated continuous power: V_rms = √(P·R_nom). */
export function rmsVoltsAtPower(powerW: number, nominalLoadOhm: number): number {
  return Math.sqrt(powerW * nominalLoadOhm);
}

export interface ElectromechanicalInput {
  blTm: number;
  mmsG: number;
  /** Small's mechanical Q at the resonance, from the measured sweep. */
  qms: number;
  /** |Z| at the resonance crest, Ω — of the MEASURED branch. */
  zMaxOhm: number;
  f0Hz: number;
  /** Identical drivers in parallel behind that measured impedance. Absent = 1. */
  parallelCount?: number;
}

/**
 * ROUTE 1: displacement per volt on the resonance, m/V.
 *
 *     x/V = Bl · Q_ms / (Z_single · M_ms · ω0²),   Z_single = N · Z_measured
 */
export function displacementPerVoltOnResonance(i: ElectromechanicalInput): number {
  const n = Math.max(1, Math.round(i.parallelCount ?? 1));
  const omega0 = 2 * Math.PI * i.f0Hz;
  const mKg = i.mmsG / G_PER_KG;
  return (i.blTm * i.qms) / (i.zMaxOhm * n * mKg * omega0 * omega0);
}

/**
 * The same mass-compliance model AWAY from the resonance, m/V at frequency f,
 * with the coil current read off the MEASURED |Z_e(f)| rather than modelled:
 *
 *     x/V(f) = Bl / (|Z_e(f)|·N · M_ms · |ω0² − ω² + j·ω·ω0/Q_ms|)
 *
 * At f = f0 this is exactly `displacementPerVoltOnResonance`. Used for the
 * weakest-link scan of an unprotected way; a vented box is a two-degree
 * model below its tuning and this single-resonator form UNDERESTIMATES there
 * (the port unloads the cone below f_b), which the caller says out loud.
 */
export function displacementPerVoltAt(
  i: Omit<ElectromechanicalInput, 'zMaxOhm'> & { zOhmAtF: number; fHz: number },
): number {
  const n = Math.max(1, Math.round(i.parallelCount ?? 1));
  const w0 = 2 * Math.PI * i.f0Hz;
  const w = 2 * Math.PI * i.fHz;
  const mKg = i.mmsG / G_PER_KG;
  const re = w0 * w0 - w * w;
  const im = (w * w0) / i.qms;
  const mech = Math.hypot(re, im);
  return i.blTm / (i.zOhmAtF * n * mKg * mech);
}

export interface AcousticInput {
  /** Measured SPL at the resonance, dB, at the documented drive voltage. */
  splDb: number;
  /** The voltage the measurement was made at, V (rms). */
  driveVoltageV: number;
  micDistanceMm: number;
  /** Piston area of ONE driver, cm². */
  sdCm2: number;
  f0Hz: number;
  parallelCount?: number;
}

/**
 * ROUTE 2: displacement per volt from a measured SPL, m/V.
 *
 *     p = p_ref·10^(SPL/20);   x = p · 2π·r / (ρ0 · S_d,total · ω0²);   x/V = x / V_meas
 *
 * Half-space (baffled) radiation assumed. Any loading that raises p for the
 * same x — a waveguide, a horn, a cabinet front — makes this an OVERestimate
 * of x, so it errs towards the safe side everywhere.
 */
export function displacementPerVoltFromSpl(i: AcousticInput): number {
  const n = Math.max(1, Math.round(i.parallelCount ?? 1));
  const p = REFERENCE_SOUND_PRESSURE_PA * ampFromDb(i.splDb);
  const rM = i.micDistanceMm / MM_PER_M;
  const sd = i.sdCm2 * M2_PER_CM2 * n;
  const w0 = 2 * Math.PI * i.f0Hz;
  const x = (p * 2 * Math.PI * rM) / (AIR_DENSITY_KG_M3 * sd * w0 * w0);
  return x / i.driveVoltageV;
}

/**
 * The SPL a measured sensitivity implies at a stated power, referred to 1 m.
 *
 * Inverse-distance from the documented mic distance, and the voltage ratio in
 * dB — nothing else. Needs the same two documented facts route 2 needs.
 */
export function splAtPowerRe1m(i: {
  splDb: number;
  driveVoltageV: number;
  micDistanceMm: number;
  powerW: number;
  nominalLoadOhm: number;
}): number {
  const v = rmsVoltsAtPower(i.powerW, i.nominalLoadOhm);
  return i.splDb + dbAmp(v / i.driveVoltageV) + dbAmp(i.micDistanceMm / MM_PER_M);
}

/* ================================================================== *
 * From displacement to the requirement
 * ================================================================== */

export interface ExcursionCeilingInput {
  /** m/V on the resonance, from whichever route the caller settled on. */
  xPerVoltMPerV: number;
  xMaxMm: number;
  /** Fraction of X_max the design may use (e.g. 0.8). Stated, never defaulted. */
  marginFraction: number;
  peakInputVolts: number;
}

export interface ExcursionCeiling {
  /** X_max·margin, mm — what the cone may reach. */
  xLimitMm: number;
  /** The driver voltage on its resonance that reaches that, V. */
  allowedVolts: number;
  /**
   * The ceiling on the driver voltage at f0, in dB RELATIVE TO THE AMPLIFIER'S
   * PEAK INPUT VOLTAGE. 0 dB would mean "the filter may pass the full peak
   * voltage to the driver at its resonance". The gate subtracts the way's
   * passband mean to get M-C's passband-relative form.
   */
  ceilingDbReInput: number;
}

export function excursionCeiling(i: ExcursionCeilingInput): ExcursionCeiling {
  const xLimitMm = i.xMaxMm * i.marginFraction;
  const allowedVolts = xLimitMm / MM_PER_M / i.xPerVoltMPerV;
  return { xLimitMm, allowedVolts, ceilingDbReInput: dbAmp(allowedVolts / i.peakInputVolts) };
}

/**
 * The passband-relative M-C limit a ceiling implies on ONE network: the
 * driver's passband sits `passbandMeanDb` below (or above) the input, so the
 * voltage on f0 may sit `ceiling − mean` dB relative to that passband. This is
 * the ONE line that joins V49's requirement to M-C's F1 convention, and both
 * the gate and the report call it rather than restating it.
 */
export function derivedDriveLimitDb(ceilingDbReInput: number, passbandMeanDb: number): number {
  return ceilingDbReInput - passbandMeanDb;
}

/* ================================================================== *
 * The assembled per-driver result
 * ================================================================== */

export interface DriveExcursionResult {
  driver: string;
  /** The resonance everything is read at — the ingest pass's fundamental. */
  f0Hz: number;
  /** Which route produced the number the ceiling stands on. */
  route: 'electromechanical' | 'acoustic';
  /** m/V converted to mm/V for reading. */
  xPerVoltMmPerV: number;
  ceiling: ExcursionCeiling;
  peakInputVolts: number;
  electromechanical: {
    xPerVoltMmPerV: number;
    qms: number;
    /** Where Q_ms came from: the sealed fundamental, or a vented upper peak. */
    qmsSource: string;
    zMaxOhm: number;
    blTm: number;
    mmsG: number;
    parallelCount: number;
  } | null;
  /** Off with the missing input named, or the counter-proof with its ratio. */
  acoustic:
    | {
        xPerVoltMmPerV: number;
        /** route 2 / route 1 — a measured property of the mounting. Null without route 1. */
        ratioToElectromechanical: number | null;
        splDb: number;
        driveVoltageV: number;
        micDistanceMm: number;
        sdCm2: number;
        source: string;
      }
    | { off: string };
  /** Every stated and measured input that produced the number. */
  parameters: Record<string, number | string>;
  notes: string[];
}

export interface DriveExcursionInput {
  driver: string;
  f0Hz: number;
  card: DriverCard;
  amplifier: AmplifierPeak;
  marginFraction: number;
  /** Measured at the resonance crest, Ω, of the measured branch. */
  zMaxOhm: number | null;
  /** Small's Q_ms at that crest, and where it was read. */
  qms: { value: number; source: string } | null;
  /** The acoustic route's inputs, when the measurement documents them. */
  acoustic?: {
    splDbAtF0: number;
    driveVoltageV: number;
    micDistanceMm: number;
    source: string;
  } | null;
  /** Why the acoustic inputs are absent, when they are. */
  acousticOff?: string;
}

/**
 * Assemble one driver's result, or say which input was missing.
 *
 * The rule for which route carries the ceiling: route 1 whenever Bl, M_ms,
 * Q_ms and Z_max are all there; otherwise route 2 when its inputs are; else
 * nothing, with the first missing field named. Route 2 is ALWAYS reported
 * beside route 1 when it can be computed, because its ratio to route 1 is the
 * mounting's own measured loading.
 */
export function driveExcursion(i: DriveExcursionInput): DriveExcursionResult | { off: string } {
  const notes: string[] = [];
  const missing: string[] = [];
  if (!(i.card.xMaxMm !== undefined && i.card.xMaxMm > 0)) missing.push('X_max');
  if (!(i.marginFraction > 0 && i.marginFraction <= 1)) missing.push('X_max margin');
  if (!(i.amplifier.peakPowerW > 0)) missing.push('amplifier peak power');
  if (!(i.amplifier.nominalLoadOhm > 0)) missing.push('amplifier nominal load');
  if (!(i.f0Hz > 0)) missing.push('resonance');
  if (missing.length > 0) {
    return { off: `M-C v2.0 is OFF for ${i.driver}: missing ${missing.join(', ')}` };
  }
  const n = Math.max(1, Math.round(i.card.parallelCount ?? 1));
  const vPk = peakInputVolts(i.amplifier);

  /* ---- route 1 ---- */
  let em: DriveExcursionResult['electromechanical'] = null;
  const emMissing: string[] = [];
  if (!(i.card.blTm !== undefined && i.card.blTm > 0)) emMissing.push('Bl');
  if (!(i.card.mmsG !== undefined && i.card.mmsG > 0)) emMissing.push('M_ms');
  if (i.qms === null) emMissing.push('Q_ms (the sweep does not come back to the half-power level)');
  if (i.zMaxOhm === null || !(i.zMaxOhm > 0)) emMissing.push('Z_max');
  if (emMissing.length === 0) {
    const x = displacementPerVoltOnResonance({
      blTm: i.card.blTm!,
      mmsG: i.card.mmsG!,
      qms: i.qms!.value,
      zMaxOhm: i.zMaxOhm!,
      f0Hz: i.f0Hz,
      parallelCount: n,
    });
    em = {
      xPerVoltMmPerV: x * MM_PER_M,
      qms: i.qms!.value,
      qmsSource: i.qms!.source,
      zMaxOhm: i.zMaxOhm!,
      blTm: i.card.blTm!,
      mmsG: i.card.mmsG!,
      parallelCount: n,
    };
  } else {
    notes.push(`the electromechanical route is off for ${i.driver}: missing ${emMissing.join(', ')}`);
  }

  /* ---- route 2 ---- */
  let ac: DriveExcursionResult['acoustic'];
  const a = i.acoustic ?? null;
  if (a && i.card.sdCm2 !== undefined && i.card.sdCm2 > 0 && a.driveVoltageV > 0 && a.micDistanceMm > 0) {
    const x = displacementPerVoltFromSpl({
      splDb: a.splDbAtF0,
      driveVoltageV: a.driveVoltageV,
      micDistanceMm: a.micDistanceMm,
      sdCm2: i.card.sdCm2,
      f0Hz: i.f0Hz,
      parallelCount: n,
    });
    ac = {
      xPerVoltMmPerV: x * MM_PER_M,
      ratioToElectromechanical: em ? (x * MM_PER_M) / em.xPerVoltMmPerV : null,
      splDb: a.splDbAtF0,
      driveVoltageV: a.driveVoltageV,
      micDistanceMm: a.micDistanceMm,
      sdCm2: i.card.sdCm2,
      source: a.source,
    };
    if (em) {
      notes.push(
        `acoustic route reads ${(ac.ratioToElectromechanical! ).toFixed(2)}× the electromechanical ` +
          'route. The acoustic route assumes free half-space radiation and overestimates the ' +
          'displacement under any loading (waveguide, horn, cabinet front), so a ratio above 1 ' +
          'is the mounting\'s own loading, measured; a ratio below 1 says the two inputs disagree.',
      );
    }
  } else {
    const why = a
      ? i.card.sdCm2 === undefined || !(i.card.sdCm2 > 0)
        ? 'S_d is not on the driver card'
        : 'the drive voltage or the mic distance of the measurement is not documented'
      : (i.acousticOff ?? 'the drive voltage of the response measurement is not documented');
    ac = { off: `acoustic route off for ${i.driver}: ${why}` };
  }

  const carrier =
    em ? { route: 'electromechanical' as const, x: em.xPerVoltMmPerV / MM_PER_M }
    : 'xPerVoltMmPerV' in ac ? { route: 'acoustic' as const, x: ac.xPerVoltMmPerV / MM_PER_M }
    : null;
  if (!carrier) {
    return {
      off:
        `M-C v2.0 is OFF for ${i.driver}: neither route can read the displacement per volt — ` +
        `${notes.join('; ')}; ${'off' in ac ? ac.off : ''}`,
    };
  }
  if (carrier.route === 'acoustic') {
    notes.push(
      'the ceiling stands on the ACOUSTIC route because Bl or M_ms is missing; it is conservative ' +
        '(free radiation assumed) and the driver card would make it exact.',
    );
  }
  const ceiling = excursionCeiling({
    xPerVoltMPerV: carrier.x,
    xMaxMm: i.card.xMaxMm!,
    marginFraction: i.marginFraction,
    peakInputVolts: vPk,
  });
  notes.push(
    'covers linear excursion only: thermal load is not judged here (the dissipation watts stay ' +
      'the visibility for that), and distortion near the resonance is not a limit this can see.',
  );
  return {
    driver: i.driver,
    f0Hz: i.f0Hz,
    route: carrier.route,
    xPerVoltMmPerV: carrier.x * MM_PER_M,
    ceiling,
    peakInputVolts: vPk,
    electromechanical: em,
    acoustic: ac,
    parameters: {
      formula: 'x/V = Bl·Q_ms/(Z_max·N·M_ms·ω0²); V_allow = X_max·margin/(x/V); ceiling = 20·log10(V_allow/V_pk)',
      f0_hz: Number(i.f0Hz.toFixed(2)),
      X_max_mm: i.card.xMaxMm!,
      margin: i.marginFraction,
      x_limit_mm: Number(ceiling.xLimitMm.toFixed(3)),
      peak_power_W: i.amplifier.peakPowerW,
      nominal_load_ohm: i.amplifier.nominalLoadOhm,
      V_peak_input: Number(vPk.toFixed(3)),
      parallel_count: n,
      ...(em
        ? {
            Bl_Tm: em.blTm,
            M_ms_g: em.mmsG,
            Q_ms: Number(em.qms.toFixed(3)),
            Q_ms_source: em.qmsSource,
            Z_max_ohm: Number(em.zMaxOhm.toFixed(3)),
          }
        : {}),
      ...(i.card.source ? { driver_card: i.card.source } : {}),
    },
    notes,
  };
}

/**
 * THE WEAKEST-LINK READING for a way that carries NO high-pass protection
 * (a woofer): at the amplifier's peak input, how far does its cone move on
 * the resonance, and — under the single-resonator model — where below the
 * resonance does it reach the limit first.
 *
 * Reporting only. `hAbs` is the branch transfer |V_driver/E_g| on `grid`
 * (the solved network), `zAbs` the measured |Z| on the same grid.
 */
export interface WeakestLinkInput {
  grid: readonly number[];
  hAbs: readonly number[];
  zAbs: readonly number[];
  em: NonNullable<DriveExcursionResult['electromechanical']>;
  f0Hz: number;
  xLimitMm: number;
  peakInputVolts: number;
  /** The way's own crossing above it, so the scan stops where the way does. */
  belowHz?: number;
}

export interface WeakestLinkResult {
  /** Cone displacement on the resonance at the peak input, mm. */
  xAtF0Mm: number;
  /** As a fraction of X_max·margin: 1 = exactly at the limit. */
  fractionOfLimit: number;
  /** Lowest grid frequency where the model reaches the limit, or null when it never does on this grid. */
  reachesLimitAtHz: number | null;
  /** Highest displacement the model reads on the grid, mm, and where. */
  worstMm: number;
  worstAtHz: number;
  note: string;
}

export function weakestLink(i: WeakestLinkInput): WeakestLinkResult {
  const xAt = (k: number): number =>
    i.peakInputVolts *
    i.hAbs[k] *
    displacementPerVoltAt({
      blTm: i.em.blTm,
      mmsG: i.em.mmsG,
      qms: i.em.qms,
      f0Hz: i.f0Hz,
      parallelCount: i.em.parallelCount,
      zOhmAtF: i.zAbs[k],
      fHz: i.grid[k],
    }) *
    MM_PER_M;
  let k0 = 0;
  for (let k = 1; k < i.grid.length; k++) {
    if (Math.abs(i.grid[k] - i.f0Hz) < Math.abs(i.grid[k0] - i.f0Hz)) k0 = k;
  }
  const xF0 = xAt(k0);
  let reaches: number | null = null;
  let worst = -Infinity;
  let worstAt = i.grid[0];
  for (let k = 0; k < i.grid.length; k++) {
    if (i.belowHz !== undefined && i.grid[k] > i.belowHz) break;
    const x = xAt(k);
    if (x > worst) {
      worst = x;
      worstAt = i.grid[k];
    }
    if (reaches === null && x >= i.xLimitMm) reaches = i.grid[k];
  }
  return {
    xAtF0Mm: xF0,
    fractionOfLimit: xF0 / i.xLimitMm,
    reachesLimitAtHz: reaches,
    worstMm: worst,
    worstAtHz: worstAt,
    note:
      'single-resonator model around the fundamental with the coil current read off the ' +
      'measured |Z|. On a vented box this reads a coupled two-degree resonance as one: the ' +
      'reading at the upper peak is an approximation whose direction this metric cannot ' +
      'establish, and below the tuning the port unloads the cone so the model UNDERESTIMATES ' +
      'there. Reporting only — no requirement is stated on an unprotected way.',
  };
}
