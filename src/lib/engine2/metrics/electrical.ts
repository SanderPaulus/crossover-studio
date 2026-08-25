/**
 * A4 — the metrics that live in the ELECTRICAL domain: M-A, M-B, M-C, M-E,
 * M-J. All pure, all reporting-only in F1.
 *
 * Everything here reads ONE solved network (`NetworkAnalysis`) and the derived
 * parameters from the ingest pass. No metric solves its own circuit except
 * M-E, which is defined as a two-load method and re-solves through the same
 * analysis object rather than building a second model.
 *
 * THE V1 TRAP, WRITTEN DOWN BECAUSE IT COST A REAL ANALYSIS: M-A's currents
 * must be normalised on the generator EMF. `elementCurrent` comes out of the
 * solver at whatever Eg the netlist carries, so every power term divides by
 * Eg² before it is weighted. Skip that and the dissipation figure scales with
 * whatever voltage the schematic happened to be drawn at.
 */

import {
  IEC_60268_1_HP_HZ,
  IEC_60268_1_LP_HZ,
  GROUP_DELAY_THRESHOLD_MS_KNOTS,
  MS_PER_S,
  PERCENT,
} from '../constants.ts';
import {
  cabs,
  cargDeg,
  dbAmp,
  degToRad,
  evalKnotCurve,
  interpLog,
  nearestIndex,
  trapz,
} from '../util.ts';
import { coverageOf, type Coverage } from '../ingest/validity.ts';
import type { Complex } from '../../complex.ts';
import type { NetworkAnalysis } from './types.ts';

/* ================================================================== *
 * M-A — dissipation per resistor
 * ================================================================== */

/**
 * IEC 60268-1 simulated programme noise: pink (1/f in power) with a
 * first-order high-pass and low-pass at the standard's edges.
 *
 * Returned UNNORMALISED — the caller scales it so that the power the
 * loudspeaker actually accepts equals the stated amplifier power. That
 * normalisation is what makes the result a FRACTION and therefore scale-free,
 * which is the form A4 asks for.
 */
export function iecProgrammeWeight(
  fHz: number,
  hpHz: number = IEC_60268_1_HP_HZ,
  lpHz: number = IEC_60268_1_LP_HZ,
): number {
  const hp = (fHz / hpHz) ** 2 / (1 + (fHz / hpHz) ** 2);
  const lp = 1 / (1 + (fHz / lpHz) ** 2);
  return (hp * lp) / fHz;
}

export interface ResistorDissipation {
  id: string;
  /** Ohms. */
  ohm: number;
  /** Share of the amplifier's delivered power burnt in this element. */
  fraction: number;
  /** Watts at the stated amplifier power; null when no power was given. */
  watts: number | null;
  /** True for a DCR/ESR parasitic rather than a discrete resistor. */
  parasitic: boolean;
}

export interface DissipationResult {
  /** Per discrete resistor and per parasitic, descending by fraction. */
  elements: ResistorDissipation[];
  /** Sum over the DISCRETE resistors — the number A4 reports. */
  totalFraction: number;
  /** The same including coil DCR and cap ESR, for context. */
  totalWithParasiticsFraction: number;
  totalWatts: number | null;
  /** The band the integral ran over. */
  bandHz: [number, number];
  coverage: Coverage;
}

/**
 * P_R = integral of S(f)·|I_R(f)/E_g|²·R df, with S normalised so that the
 * total power INTO the loudspeaker equals the stated figure.
 *
 * The band is the whole analysis grid, and that is not an oversight: this is
 * an electrical metric computed from impedance, and an impedance measurement
 * has no gate. Coverage is reported anyway, because A5.5 asks every metric to
 * state where it was evaluated, and "everywhere, and here is why that is
 * legitimate" is a statement worth making.
 */
export function dissipation(
  analysis: NetworkAnalysis,
  opts: { amplifierPowerW?: number; weight?: (fHz: number) => number } = {},
): DissipationResult {
  const { grid, inputZ, generatorVolts: eg } = analysis;
  const weight = opts.weight ?? ((f: number) => iecProgrammeWeight(f));
  const w = grid.map(weight);

  // Power into the network per unit |Eg|²: Re(1/Zin) is the conductance the
  // generator drives, so this integral is the loudspeaker's accepted power on
  // the same normalisation as every current below.
  const accepted = trapz(
    grid,
    w.map((s, i) => s * (inputZ[i].re / (inputZ[i].re ** 2 + inputZ[i].im ** 2))),
  );
  const scale = accepted > 0 ? 1 / accepted : 0;

  const elements: ResistorDissipation[] = [];
  const powerIn = (current: readonly Complex[] | undefined, r: number): number => {
    if (!current || !(r > 0)) return 0;
    const integrand = grid.map((_, i) => w[i] * (cabs(current[i]) / eg) ** 2 * r);
    return trapz(grid, integrand) * scale;
  };

  for (const p of analysis.passives) {
    const cur = analysis.elementCurrent[p.id];
    if (p.kind === 'R') {
      elements.push({
        id: p.id,
        ohm: p.value,
        fraction: powerIn(cur, p.value),
        watts: null,
        parasitic: false,
      });
    } else if (p.seriesR > 0) {
      elements.push({
        id: `${p.id} (${p.kind === 'L' ? 'DCR' : 'ESR'})`,
        ohm: p.seriesR,
        fraction: powerIn(cur, p.seriesR),
        watts: null,
        parasitic: true,
      });
    }
  }
  elements.sort((a, b) => b.fraction - a.fraction);

  const totalFraction = elements.filter((e) => !e.parasitic).reduce((s, e) => s + e.fraction, 0);
  const totalAll = elements.reduce((s, e) => s + e.fraction, 0);
  const power = opts.amplifierPowerW;
  if (power !== undefined) for (const e of elements) e.watts = e.fraction * power;

  const band: [number, number] = [grid[0], grid[grid.length - 1]];
  return {
    elements,
    totalFraction,
    totalWithParasiticsFraction: totalAll,
    totalWatts: power === undefined ? null : totalFraction * power,
    bandHz: band,
    coverage: coverageOf(band, { fromHz: band[0], toHz: band[1], fromBy: 'impedance (gate-free)', toBy: 'impedance (gate-free)' }),
  };
}

/** Convenience: the dissipation total as a percentage. */
export const dissipationPercent = (r: DissipationResult): number => r.totalFraction * PERCENT;

/* ================================================================== *
 * M-B — EPDR
 * ================================================================== */

export interface EpdrResult {
  /** EPDR(f) over the whole grid. */
  curve: number[];
  minOhm: number;
  atHz: number;
  /** The bare |Z| minimum, kept beside it as the simple mode A4 preserves. */
  minZOhm: number;
  minZAtHz: number;
  /** Largest |phase| of the input impedance, degrees, and where. */
  worstPhaseDeg: number;
  worstPhaseAtHz: number;
  bandHz: [number, number];
  coverage: Coverage;
}

/**
 * EPDR(f) = |Z| / (2·cos²φ) — the resistance that would dissipate the same
 * peak power in the output devices as this reactive load does (Benjamin).
 *
 * The |Z| floor stays reported next to it on purpose: A4 keeps the bare
 * minimum available as the simple mode, and the pair is what makes the case
 * for EPDR visible — a load can hold a comfortable |Z| and still present half
 * of it to the amplifier.
 */
export function epdr(analysis: NetworkAnalysis): EpdrResult {
  const { grid, inputZ } = analysis;
  const curve = inputZ.map((z) => {
    const phi = Math.atan2(z.im, z.re);
    const c = Math.cos(phi);
    return cabs(z) / (2 * c * c);
  });
  let iMin = 0;
  let iZ = 0;
  let iPh = 0;
  for (let i = 1; i < grid.length; i++) {
    if (curve[i] < curve[iMin]) iMin = i;
    if (cabs(inputZ[i]) < cabs(inputZ[iZ])) iZ = i;
    if (Math.abs(inputZ[i].im / cabs(inputZ[i])) > Math.abs(inputZ[iPh].im / cabs(inputZ[iPh]))) iPh = i;
  }
  const band: [number, number] = [grid[0], grid[grid.length - 1]];
  return {
    curve,
    minOhm: curve[iMin],
    atHz: grid[iMin],
    minZOhm: cabs(inputZ[iZ]),
    minZAtHz: grid[iZ],
    worstPhaseDeg: cargDeg(inputZ[iPh]),
    worstPhaseAtHz: grid[iPh],
    bandHz: band,
    coverage: coverageOf(band, { fromHz: band[0], toHz: band[1], fromBy: 'impedance (gate-free)', toBy: 'impedance (gate-free)' }),
  };
}

/* ================================================================== *
 * M-C — drive voltage on the driver's own resonance
 * ================================================================== */

export interface DriveVoltageResult {
  driver: string;
  /** The resonance the voltage is read at — DERIVED from the loaded .zma. */
  fsHz: number;
  /** 20·log10(|V(f_s)| / mean |V| over the passband). */
  db: number;
  /** The passband the mean was taken over — DERIVED from the crossings. */
  passbandHz: [number, number];
  coverage: Coverage;
}

/**
 * A4 M-C. Both halves are derived: f_s from the peak(s) of the LOADED
 * impedance file, and the passband from the crossings the filtered responses
 * actually produce. Nothing here can be typed in, which is the point — the
 * two rules of thumb this replaces ("cross at least 2×Fs", "−18 dB at Fs")
 * both hide the same quantity.
 *
 * THE CONVENTION, WRITTEN DOWN BECAUSE A4 DOES NOT FIX IT. The specification
 * says the reference is "V̄_passband, het gemiddelde over de doorlaatband van
 * die weg", which leaves three choices open. This engine takes:
 *
 *   1. THE PASSBAND runs from the crossing below this driver to the crossing
 *      above it, and an open end falls back to the driver's own validity band.
 *      A woofer's passband really does run down to wherever its measurement
 *      stops being believable; inventing a lower edge would be a project
 *      number (P6).
 *   2. THE AVERAGE IS TAKEN IN DECIBELS. What this compares against is a
 *      LEVEL — what a listener would call "the passband" — and a linear mean
 *      of |V| is pulled up by whatever peak the response happens to have. On a
 *      real filter the two differ by about a decibel.
 *   3. f_s IS THE FUNDAMENTAL in-box resonance, not the highest motional peak
 *      in the sweep. A cone mode shows a genuine phase zero crossing and is
 *      still not f_s (see `classifyImpedance.fundamentalHz`).
 *
 * ⚠ THIS CONVENTION DOES NOT REPRODUCE THE 25-08 REFERENCE ANALYSIS, and it is
 * the last open item of the casus-1 reconciliation. The engine reads
 * −25.08 / −34.54 / −35.18 dB against a reference of −24.6 / −33.3 / −34.5.
 * The SPREAD between candidates reproduces to within 0.2 dB, so the two
 * analyses agree about what the filters do and disagree about the common
 * reference level by 0.3–0.9 dB. Searched and rejected: both passband edges,
 * mean-of-dB / mean-of-|V| / median / RMS, grid densities from 400 to 3200
 * points, an acoustic instead of an electrical passband, and a
 * single-frequency reference — none matches all three candidates.
 *
 * TODO(casus 1, M-C): revisit once the 25-08 working method can be
 * reconstructed. Until then the deviation is pinned in `goldenCasus1.test.ts`
 * (`KNOWN_DEVIATIONS`) rather than tolerated silently, and this comment is the
 * definition anyone comparing against it needs.
 */
export function driveVoltageOnResonance(
  analysis: NetworkAnalysis,
  driverModel: string,
  fsHz: number,
  passbandHz: [number, number],
): DriveVoltageResult | null {
  const h = analysis.transferByModel[driverModel];
  if (!h) return null;
  const { grid } = analysis;
  const iFs = nearestIndex(grid, fsHz);
  // The passband average is taken in DECIBELS. That is not a detail: the
  // reference this metric compares against is a LEVEL a listener would call
  // "the passband", and a linear mean of |V| is pulled up by whatever peak the
  // response has. On a real filter the two differ by more than a decibel, and
  // the whole point of M-C is a number in decibels that can be compared
  // between candidates.
  let sumDb = 0;
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < passbandHz[0] || grid[i] > passbandHz[1]) continue;
    sumDb += dbAmp(cabs(h[i]));
    n++;
  }
  if (n === 0) return null;
  const meanDb = sumDb / n;
  return {
    driver: driverModel,
    fsHz: grid[iFs],
    db: dbAmp(cabs(h[iFs])) - meanDb,
    passbandHz,
    coverage: coverageOf(passbandHz, {
      fromHz: Math.max(passbandHz[0], grid[0]),
      toHz: Math.min(passbandHz[1], grid[grid.length - 1]),
      fromBy: 'analysis grid',
      toBy: 'analysis grid',
    }),
  };
}

/* ================================================================== *
 * M-E — Thevenin source impedance / Q multiplication
 * ================================================================== */

export interface TheveninResult {
  driver: string;
  /** Source impedance the driver sees, over the whole grid. */
  zs: Complex[];
  /** Its real part at the evaluation frequency. */
  rsOhm: number;
  atHz: number;
  /** (R_e + R_s)/R_e — the factor Q_es is multiplied by. */
  qMultiplier: number | null;
  /** The R_e used, and where it came from (A4: R_e is a declared DATA NEED). */
  reOhm: number | null;
  reSource: string;
}

/**
 * The two-load method: solve with Z and with 2Z, then
 *
 *     Z_s = (V₂ − V₁) / (V₁/Z₁ − V₂/Z₂)
 *
 * which is exact for any linear source network, whatever its topology. Two
 * solves rather than an attempt to collapse the network analytically — the
 * analytic route has to know which elements are "the filter", and in a real
 * schematic that question does not have an answer.
 */
export function thevenin(
  analysis: NetworkAnalysis,
  driverModel: string,
  atHz: number,
  re: { ohm: number; source: string } | null,
): TheveninResult | null {
  const z1 = analysis.driverZ[driverModel];
  if (!z1) return null;
  const v1 = analysis.transferByModel[driverModel];
  if (!v1) return null;
  const z2 = z1.map((z) => ({ re: 2 * z.re, im: 2 * z.im }));
  const v2 = analysis.resolveWithLoad(driverModel, z2).transfer;

  const zs: Complex[] = analysis.grid.map((_, i) => {
    const a1 = z1[i];
    const a2 = z2[i];
    // numerator = V2 − V1 ; denominator = V1/Z1 − V2/Z2
    const num = { re: v2[i].re - v1[i].re, im: v2[i].im - v1[i].im };
    const d1 = divC(v1[i], a1);
    const d2 = divC(v2[i], a2);
    const den = { re: d1.re - d2.re, im: d1.im - d2.im };
    return divC(num, den);
  });

  const i = nearestIndex(analysis.grid, atHz);
  const rs = zs[i].re;
  return {
    driver: driverModel,
    zs,
    rsOhm: rs,
    atHz: analysis.grid[i],
    qMultiplier: re ? (re.ohm + rs) / re.ohm : null,
    reOhm: re?.ohm ?? null,
    reSource: re?.source ?? 'not supplied - M-E reports the source resistance only',
  };
}

const divC = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

/* ================================================================== *
 * M-J — group delay against the audibility threshold
 * ================================================================== */

export interface GroupDelayResult {
  grid: number[];
  /** Group delay in ms, relative to the minimum over the band (the absolute
   *  arrival time is a microphone position, not a property of the design). */
  msRelative: number[];
  /** The threshold curve it is shown against, ms. */
  thresholdMs: number[];
  /** Worst excess over the threshold, ms; negative = comfortably below. */
  worstExcessMs: number;
  worstAtHz: number;
  bandHz: [number, number];
  coverage: Coverage;
}

/**
 * A4 M-J — REPORTING ONLY, and the declaration matters: this is not a gate and
 * not a taste judgement. It is the calculable descendant of every "steeper
 * sounds worse" rule, and typical high crossings sit far below the threshold
 * while low ones deserve a look.
 *
 * Group delay is differentiated from the unwrapped phase of the summed
 * response, and reported RELATIVE to its own minimum: the absolute delay is
 * dominated by the microphone distance, which is not a property of the filter.
 */
export function groupDelay(
  grid: readonly number[],
  phaseDegUnwrapped: readonly number[],
  band: [number, number],
  thresholdKnots: readonly (readonly [number, number])[] = GROUP_DELAY_THRESHOLD_MS_KNOTS,
): GroupDelayResult {
  const n = grid.length;
  const ms = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dPhi = degToRad(phaseDegUnwrapped[b] - phaseDegUnwrapped[a]);
    const dOmega = 2 * Math.PI * (grid[b] - grid[a]);
    ms[i] = dOmega === 0 ? 0 : (-dPhi / dOmega) * MS_PER_S;
  }
  const inBand: number[] = [];
  for (let i = 0; i < n; i++) if (grid[i] >= band[0] && grid[i] <= band[1]) inBand.push(i);
  const floor = inBand.length ? Math.min(...inBand.map((i) => ms[i])) : 0;
  const rel = ms.map((v) => v - floor);
  const threshold = grid.map((f) => evalKnotCurve(thresholdKnots, f));

  let worst = -Infinity;
  let at = grid[0];
  for (const i of inBand) {
    const excess = rel[i] - threshold[i];
    if (excess > worst) {
      worst = excess;
      at = grid[i];
    }
  }
  return {
    grid: [...grid],
    msRelative: rel,
    thresholdMs: threshold,
    worstExcessMs: Number.isFinite(worst) ? worst : NaN,
    worstAtHz: at,
    bandHz: band,
    coverage: coverageOf(band, {
      fromHz: Math.max(band[0], grid[0]),
      toHz: Math.min(band[1], grid[n - 1]),
      fromBy: 'summed response',
      toBy: 'summed response',
    }),
  };
}

/** Sample a real series at one frequency (log interpolation). */
export const at = (grid: readonly number[], v: readonly number[], f: number): number =>
  interpLog(grid, v, f);
