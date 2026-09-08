/**
 * CASUS 2 — DE SYNTHETISCHE MEETSET, UIT HET MODEL (`casus2-model.ts`).
 *
 * `npx vite-node scripts/generate-casus2-measurements.ts`  — seconden.
 *
 * Schrijft `test-fixtures/casus2/`: drie impedantiesweeps (ZMA), twee
 * nabij-velden en zes ver-velden (FRD, met ARTA-header), plus
 * `grondwaarheid.json` — élk getal dat het model KENT, machineleesbaar, zodat
 * de recorder en de suite het naast de extractie kunnen leggen in plaats van
 * het over te typen.
 *
 * DE NATUURKUNDE, en zij is één keten en geen drie losse modellen. Per driver:
 *
 *   Z_mech(s) = R_ms + s·M_ms + 1/(s·C_ms) + S_d²·Z_ab(s)
 *   Z_elek(s) = R_e + K·s^n + Bl²/Z_mech(s)
 *   v(s)      = Bl·V / ( Z_mech(s)·(R_e + K·s^n) + Bl² )
 *
 * met Z_ab de akoestische last van de kast: 1/(sC_ab) gesloten, de parallel van
 * die compliantie met (s·M_ap + R_ap) voor een reflexkast, nul in vrije lucht.
 * De uitgestraalde volumesnelheid is U_d = S_d·v voor een gesloten kast en
 * U_d·Z_p/(Z_C + Z_p) voor een reflexkast — de poortstroom komt uit dezelfde
 * knoop, dus de bekende vierde-orde helling en het conusdal op f_b vallen
 * eruit in plaats van erin gestopt te worden. Het verre veld is
 * p = ρ₀·s·U/(2π·r), maal de kolvenrichtingskarakteristiek 2·J₁(x)/x, maal de
 * baffle-step-shelf, maal de breakups. Het nabije veld is dezelfde U zonder
 * afstand, richtingskarakteristiek of baffle-step — wat een nabij-veldmeting
 * meet.
 *
 * WAT DE BESTANDEN NIET ZIJN. Zij dragen ONDER de poortvloer gewoon de
 * modelrespons, waar een echt gepoort bestand daar artefacten toont. Dat is
 * opzet: deze casus toetst de EXTRACTOREN, en een afwijking moet van de
 * schatter komen en niet van ruis die dit script zelf verzonnen heeft. De
 * poort is een gestelde eigenschap van het VENSTER (de header), en dat is wat
 * A5b.1(i) eruit leest.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS2_AMPLIFIER,
  CASUS2_BAFFLE_MM,
  CASUS2_CTC_MM,
  CASUS2_DRIVERS,
  CASUS2_GATE,
  CASUS2_MEASUREMENT,
  CASUS2_NF_GATE,
  CASUS2_SAMPLING,
  C_AIR,
  P_REF,
  RHO_AIR,
  type Casus2Driver,
} from './casus2-model.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus2');
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ *
 * Complex arithmetic, local and minimal
 * ------------------------------------------------------------------ */
type C = { re: number; im: number };
const c = (re: number, im = 0): C => ({ re, im });
const add = (a: C, b: C): C => ({ re: a.re + b.re, im: a.im + b.im });
const mul = (a: C, b: C): C => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const div = (a: C, b: C): C => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const abs = (a: C): number => Math.hypot(a.re, a.im);
const argDeg = (a: C): number => (Math.atan2(a.im, a.re) * 180) / Math.PI;
/** (jω)^n = ω^n · (cos + j sin)(nπ/2) — Wright's semi-inductance. */
const jwPow = (w: number, n: number): C => {
  const m = w ** n;
  return { re: m * Math.cos((n * Math.PI) / 2), im: m * Math.sin((n * Math.PI) / 2) };
};

/** First-order Bessel function J₁, Abramowitz & Stegun 9.4.4 / 9.4.6. */
function besselJ1(x: number): number {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const num =
      x *
      (72362614232 +
        y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const den =
      144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return num / den;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 2.356194491;
  const p =
    1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q =
    0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const r = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
  return x < 0 ? -r : r;
}

/** Rigid circular piston in an infinite baffle: 2·J₁(ka sinθ)/(ka sinθ). */
function pistonDirectivity(freqHz: number, radiusM: number, angleDeg: number): number {
  const x = ((2 * Math.PI * freqHz) / C_AIR) * radiusM * Math.sin((angleDeg * Math.PI) / 180);
  if (Math.abs(x) < 1e-9) return 1;
  return (2 * besselJ1(x)) / x;
}

/**
 * The baffle step: 6 dB of transition from half space to full space as the
 * wavelength grows past the front. First order around `stepHz`, so the loss is
 * 3 dB at the step itself and 6 dB well below it — the textbook shape, and the
 * one `baffleStepHz` in the engine names the corner of.
 */
const BAFFLE_STEP_DB = 6;
const baffleStepHz = (widthMm: number): number => 115 / (widthMm / 1000);
function baffleStepGain(freqHz: number, stepHz: number): number {
  const r = freqHz / stepHz;
  const lin = Math.sqrt((r * r + 10 ** (-BAFFLE_STEP_DB / 10)) / (r * r + 1));
  return lin;
}

/**
 * A breakup: the analogue peaking section, so the peak gain is EXACTLY the
 * stated height and the response returns to unity on both sides.
 *
 *   H(s) = (s² + (G·ω₀/Q)s + ω₀²) / (s² + (ω₀/Q)s + ω₀²),  G = 10^(dB/20)
 *
 * At s = jω₀ both quadratic terms cancel and H = G on the nose — which is what
 * makes the stated height a ground truth the breakup extractor can be held to
 * rather than an approximate bump.
 */
function breakupGain(freqHz: number, f0: number, heightDb: number, q: number): C {
  const G = 10 ** (heightDb / 20);
  const r = freqHz / f0;
  return div(c(1 - r * r, (r * G) / q), c(1 - r * r, r / q));
}

/* ------------------------------------------------------------------ *
 * The lumped model, per driver
 * ------------------------------------------------------------------ */
interface Lumped {
  Bl: number;
  CmsMPerN: number;
  RmsNsPerM: number;
  /** Acoustic box elements, when there is a box. */
  CabM5PerN: number | null;
  MapKgPerM4: number | null;
  RapPaSPerM3: number | null;
}

function lumpedOf(d: Casus2Driver): Lumped {
  const ws = 2 * Math.PI * d.fsHz;
  const Bl = Math.sqrt((ws * d.MmsKg * d.ReOhm) / d.Qes);
  const CmsMPerN = 1 / (ws * ws * d.MmsKg);
  const RmsNsPerM = (ws * d.MmsKg) / d.Qms;
  if (d.box.kind === 'free-air') {
    return { Bl, CmsMPerN, RmsNsPerM, CabM5PerN: null, MapKgPerM4: null, RapPaSPerM3: null };
  }
  const CabM5PerN = d.box.volumeM3 / (RHO_AIR * C_AIR * C_AIR);
  if (d.box.kind === 'sealed') {
    return { Bl, CmsMPerN, RmsNsPerM, CabM5PerN, MapKgPerM4: null, RapPaSPerM3: null };
  }
  const wb = 2 * Math.PI * d.box.tuningHz;
  const MapKgPerM4 = 1 / (wb * wb * CabM5PerN);
  const RapPaSPerM3 = Math.sqrt(MapKgPerM4 / CabM5PerN) / d.box.leakageQ;
  return { Bl, CmsMPerN, RmsNsPerM, CabM5PerN, MapKgPerM4, RapPaSPerM3 };
}

/** The acoustic load the box puts on the diaphragm, and the port branch beside it. */
function boxImpedances(d: Casus2Driver, L: Lumped, w: number): { Zab: C; Zc: C | null; Zp: C | null } {
  if (d.box.kind === 'free-air') return { Zab: c(0), Zc: null, Zp: null };
  const Zc = div(c(1), c(0, w * L.CabM5PerN!));
  if (d.box.kind === 'sealed') return { Zab: Zc, Zc, Zp: null };
  const Zp = c(L.RapPaSPerM3!, w * L.MapKgPerM4!);
  return { Zab: div(mul(Zc, Zp), add(Zc, Zp)), Zc, Zp };
}

/** Electrical impedance and diaphragm velocity at one frequency, for 1 V. */
function driverAt(d: Casus2Driver, L: Lumped, freqHz: number): { Z: C; v: C; Utotal: C; Ud: C } {
  const w = 2 * Math.PI * freqHz;
  const K = d.leOhmAt10k / (2 * Math.PI * 10000) ** d.semiInductanceExponent;
  const Zle = mul(c(K), jwPow(w, d.semiInductanceExponent));
  const { Zab, Zc, Zp } = boxImpedances(d, L, w);
  const Zmech = add(
    add(c(L.RmsNsPerM, w * d.MmsKg), div(c(1), c(0, w * L.CmsMPerN))),
    mul(c(d.SdM2 * d.SdM2), Zab),
  );
  const Zblocked = add(c(d.ReOhm), Zle);
  const Z = add(Zblocked, div(c(L.Bl * L.Bl), Zmech));
  const v = div(c(L.Bl), add(mul(Zmech, Zblocked), c(L.Bl * L.Bl)));
  const Ud = mul(c(d.SdM2), v);
  const Utotal = Zp && Zc ? mul(Ud, div(Zp, add(Zc, Zp))) : Ud;
  return { Z, v, Utotal, Ud };
}

/** Far-field pressure at `r` metres and `angleDeg`, for `volts` RMS. */
function farField(d: Casus2Driver, L: Lumped, freqHz: number, angleDeg: number, volts: number, rM: number): C {
  const w = 2 * Math.PI * freqHz;
  const { Utotal } = driverAt(d, L, freqHz);
  // p = ρ₀ · jω · U / (2π r): the half-space radiation of a point source.
  let p = mul(c(0, (RHO_AIR * w) / (2 * Math.PI * rM)), mul(Utotal, c(volts)));
  p = mul(p, c(pistonDirectivity(freqHz, Math.sqrt(d.SdM2 / Math.PI), angleDeg)));
  p = mul(p, c(baffleStepGain(freqHz, baffleStepHz(CASUS2_BAFFLE_MM.breedte))));
  for (const [f0, hDb, q] of d.breakups) p = mul(p, breakupGain(freqHz, f0, hDb, q));
  return p;
}

/** Near field of the CONE — what a near-field measurement sees, in Pa at 1 m equivalent. */
function nearField(d: Casus2Driver, L: Lumped, freqHz: number, volts: number): C {
  const w = 2 * Math.PI * freqHz;
  const { Ud } = driverAt(d, L, freqHz);
  let p = mul(c(0, (RHO_AIR * w) / (2 * Math.PI)), mul(Ud, c(volts)));
  for (const [f0, hDb, q] of d.breakups) p = mul(p, breakupGain(freqHz, f0, hDb, q));
  return p;
}

/**
 * The model's own impedance maximum, found on the written sweep's own grid and
 * refined by a golden-section step, with the diaphragm excursion there.
 */
function modelResonance(d: Casus2Driver, L: Lumped): { f0Hz: number; zMaxOhm: number; xPerVoltMmPerV: number } {
  const coarse = zGrid();
  let best = coarse[0];
  let bestZ = -Infinity;
  for (const f of coarse) {
    const z = abs(driverAt(d, L, f).Z);
    if (z > bestZ) {
      bestZ = z;
      best = f;
    }
  }
  // Refine on a fine local grid: the sweep's own spacing is ~0.7 %, and the
  // peak of a Q ≈ 4 resonance moves inside that.
  let lo = best / 1.02;
  let hi = best * 1.02;
  for (let pass = 0; pass < 6; pass++) {
    const n = 41;
    let f0 = lo;
    let z0 = -Infinity;
    for (let i = 0; i < n; i++) {
      const f = lo * (hi / lo) ** (i / (n - 1));
      const z = abs(driverAt(d, L, f).Z);
      if (z > z0) {
        z0 = z;
        f0 = f;
      }
    }
    const step = (hi / lo) ** (1 / (n - 1));
    lo = f0 / step;
    hi = f0 * step;
    best = f0;
    bestZ = z0;
  }
  const w0 = 2 * Math.PI * best;
  const v = driverAt(d, L, best).v; // per volt
  return { f0Hz: best, zMaxOhm: bestZ, xPerVoltMmPerV: (1000 * abs(v)) / w0 };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */
const dB = (p: C): number => 20 * Math.log10(Math.max(abs(p), 1e-12) / P_REF);
const fmt = (v: number, n: number) => v.toFixed(n);
/** ARTA writes locale decimals in its header lines and dots in its data. */
const artaMs = (v: number) => String(v).replace('.', ',');

function ffHeader(d: Casus2Driver, angleDeg: number): string[] {
  return [
    `* Source file = ${d.way} hor ${angleDeg}.pir`,
    `* Impulse length = ${CASUS2_SAMPLING.impulseLength}`,
    `* Sample rate = ${CASUS2_SAMPLING.sampleRateHz}`,
    '* Scale type = Pa',
    '* Left window = 0 ms, Rectangular',
    `* Reference time = ${artaMs(CASUS2_GATE.referenceTimeMs)} ms`,
    `* Right window = ${artaMs(CASUS2_GATE.rightWindowMs)} ms, ${CASUS2_GATE.taper}`,
    `* FFT length = ${CASUS2_SAMPLING.fftLength}`,
    '* Smoothing = None',
    `* Measurement voltage = ${artaMs(CASUS2_MEASUREMENT.voltsRms)} V`,
    `* Microphone distance = ${CASUS2_MEASUREMENT.micDistanceMm} mm`,
    '* Scale = 0.0 dB',
    `* Synthetic = casus 2, generated by scripts/generate-casus2-measurements.ts from scripts/casus2-model.ts`,
  ];
}

function nfHeader(d: Casus2Driver): string[] {
  return [
    `* Source file = ${d.way} near.pir`,
    `* Impulse length = ${CASUS2_SAMPLING.impulseLength}`,
    `* Sample rate = ${CASUS2_SAMPLING.sampleRateHz}`,
    '* Scale type = Pa',
    `* Left window = ${artaMs(CASUS2_NF_GATE.leftWindowMs)} ms, Rectangular`,
    `* Reference time = ${artaMs(CASUS2_NF_GATE.referenceTimeMs)} ms`,
    `* Right window = ${CASUS2_NF_GATE.rightWindowMs} ms, ${CASUS2_NF_GATE.taper}`,
    `* FFT length = ${CASUS2_SAMPLING.fftLength}`,
    '* Smoothing = None',
    `* Measurement voltage = ${artaMs(CASUS2_MEASUREMENT.voltsRms)} V`,
    '* Scale = 0.0 dB',
    `* Synthetic = casus 2, generated by scripts/generate-casus2-measurements.ts from scripts/casus2-model.ts`,
  ];
}

const ffGrid = (): number[] => {
  const df = CASUS2_SAMPLING.sampleRateHz / CASUS2_SAMPLING.fftLength;
  const out: number[] = [];
  for (let f = CASUS2_SAMPLING.ffFirstHz; f <= CASUS2_SAMPLING.ffLastHz + 1e-9; f += df) out.push(f);
  return out;
};
const zGrid = (): number[] => {
  const { zFromHz, zToHz, zPoints } = CASUS2_SAMPLING;
  return Array.from({ length: zPoints }, (_, i) => zFromHz * (zToHz / zFromHz) ** (i / (zPoints - 1)));
};

const files: string[] = [];
const grid = ffGrid();
const zs = zGrid();

for (const d of CASUS2_DRIVERS) {
  const L = lumpedOf(d);

  // Impedance (ZMA).
  const zLines = [
    `* Synthetic impedance sweep, casus 2 — ${d.model}`,
    '* Freq(Hz)  |Z|(ohm)  Phase(deg)',
    ...zs.map((f) => {
      const { Z } = driverAt(d, L, f);
      return `${fmt(f, 4)}  ${fmt(abs(Z), 5)}  ${fmt(argDeg(Z), 4)}`;
    }),
  ];
  const zName = `${d.way}.zma`;
  writeFileSync(join(OUT, zName), `${zLines.join('\n')}\n`);
  files.push(zName);

  // Far field, per angle.
  for (const a of CASUS2_SAMPLING.anglesDeg) {
    const lines = [
      ...ffHeader(d, a),
      'Freq[Hz]     dBSPL  Phase[Deg]',
      ...grid.map((f) => {
        const p = farField(d, L, f, a, CASUS2_MEASUREMENT.voltsRms, CASUS2_MEASUREMENT.micDistanceMm / 1000);
        return `${fmt(f, 5)}   ${fmt(dB(p), 3)}   ${fmt(argDeg(p), 3)}`;
      }),
    ];
    const name = `${d.way}_hor_${a}.frd`;
    writeFileSync(join(OUT, name), `${lines.join('\n')}\n`);
    files.push(name);
  }

  // Near field, for the two ways that have one (a dome has no meaningful near field).
  if (d.box.kind !== 'free-air') {
    const lines = [
      ...nfHeader(d),
      'Freq[Hz]     dBSPL  Phase[Deg]',
      ...grid.map((f) => {
        const p = nearField(d, L, f, CASUS2_MEASUREMENT.voltsRms);
        return `${fmt(f, 5)}   ${fmt(dB(p), 3)}   ${fmt(argDeg(p), 3)}`;
      }),
    ];
    const name = `${d.way}_near.frd`;
    writeFileSync(join(OUT, name), `${lines.join('\n')}\n`);
    files.push(name);
  }
}

/* ------------------------------------------------------------------ *
 * The ground truth — every number the MODEL knows
 * ------------------------------------------------------------------ */
const truthDrivers: Record<string, Record<string, unknown>> = {};
for (const d of CASUS2_DRIVERS) {
  const L = lumpedOf(d);
  /* The box turns f_s into f_c (sealed) or into a pair of peaks around f_b
   * (vented); both come out of the same compliance ratio α. */
  let boxTruth: Record<string, unknown>;
  if (d.box.kind === 'sealed') {
    const Cas = L.CmsMPerN * d.SdM2 * d.SdM2;
    const alpha = Cas / L.CabM5PerN!;
    boxTruth = {
      soort: 'gesloten',
      volume_l: d.box.volumeM3 * 1000,
      compliantieverhouding_alpha: alpha,
      f_c_hz: d.fsHz * Math.sqrt(1 + alpha),
      Q_mc: d.Qms * Math.sqrt(1 + alpha),
      Q_ec: d.Qes * Math.sqrt(1 + alpha),
      Q_tc: ((d.Qms * d.Qes) / (d.Qms + d.Qes)) * Math.sqrt(1 + alpha),
    };
  } else if (d.box.kind === 'vented') {
    const Cas = L.CmsMPerN * d.SdM2 * d.SdM2;
    boxTruth = {
      soort: 'reflex',
      volume_l: d.box.volumeM3 * 1000,
      f_b_hz: d.box.tuningHz,
      lek_Q: d.box.leakageQ,
      compliantieverhouding_alpha: Cas / L.CabM5PerN!,
      poortmassa_kg_per_m4: L.MapKgPerM4,
    };
  } else {
    boxTruth = { soort: 'vrije lucht' };
  }
  /* The reference sensitivity of the lumped model, half space, at the stated
   * measurement conditions: ρ₀·S_d·Bl·V/(2π·r·R_e·M_ms). It is a CONSEQUENCE of
   * the parameters above and not a free choice — which is why it is recorded
   * here rather than stated in the model. */
  const pPass =
    (RHO_AIR * d.SdM2 * L.Bl * CASUS2_MEASUREMENT.voltsRms) /
    (2 * Math.PI * (CASUS2_MEASUREMENT.micDistanceMm / 1000) * d.ReOhm * d.MmsKg);
  truthDrivers[d.way] = {
    model: d.model,
    R_e_ohm: d.ReOhm,
    semi_inductantie_n: d.semiInductanceExponent,
    semi_inductantie_ohm_op_10k: d.leOhmAt10k,
    f_s_hz: d.fsHz,
    Q_ms: d.Qms,
    Q_es: d.Qes,
    Q_ts: (d.Qms * d.Qes) / (d.Qms + d.Qes),
    M_ms_g: d.MmsKg * 1000,
    S_d_cm2: d.SdM2 * 1e4,
    X_max_mm: d.XmaxMm,
    Bl_Tm: L.Bl,
    C_ms_mm_per_N: L.CmsMPerN * 1000,
    R_ms_Ns_per_m: L.RmsNsPerM,
    diameter_inch: d.diameterInch,
    z_offset_mm: d.zOffsetMm,
    kast: boxTruth,
    /* Z at resonance, from the model: R_e + R_es with R_es = Bl²/R_ms. The
     * semi-inductance adds a little on top, which is exactly the bias a
     * measured Z_max carries and the reason both numbers are recorded. */
    Z_max_zonder_spoel_ohm: d.ReOhm + (L.Bl * L.Bl) / L.RmsNsPerM,
    gevoeligheid_dB_1m_2V83: 20 * Math.log10(pPass / P_REF),
    breakups: d.breakups.map(([f, h, q]) => ({ hz: f, hoogte_dB: h, Q: q })),
    /* x/V AT THE MODEL'S OWN IMPEDANCE PEAK, evaluated on the same circuit the
     * files were written from — not from a closed form.
     *
     * Two reasons it is done numerically. The frequency is not f_s: a sealed
     * box moves it to f_c and a vented box splits it into two, and M-C reads
     * the peak it FINDS. And the closed form would be a second implementation
     * of the model, which is the one thing a ground truth may not have.
     */
    excursie_op_impedantiepiek: (() => {
      const at = modelResonance(d, L);
      return {
        f0_hz: at.f0Hz,
        Z_max_ohm: at.zMaxOhm,
        x_per_V_mm_per_V: at.xPerVoltMmPerV,
        _: 'Het model geëvalueerd op de frequentie waar |Z| maximaal is: x/V = |v(f0)|/ω0, met v uit dezelfde keten waaruit de bestanden geschreven zijn. Op een reflexkast is dat de BOVENSTE piek, dezelfde die M-C leest.',
      };
    })(),
  };
}

const truth = {
  _: 'CASUS 2 — DE GRONDWAARHEID. Geschreven door scripts/generate-casus2-measurements.ts uit ' +
    'scripts/casus2-model.ts. Elk getal hier is INVOER van het model of een gesloten gevolg ervan, ' +
    'nooit een meting en nooit een extractie. Dit is waar de extractoren tegen gelegd worden.',
  drivers: truthDrivers,
  geometrie: {
    baffle_mm: CASUS2_BAFFLE_MM,
    baffle_step_hz: baffleStepHz(CASUS2_BAFFLE_MM.breedte),
    baffle_step_diepte_dB: BAFFLE_STEP_DB,
    ctc_mm: CASUS2_CTC_MM,
    z_offset_mm: Object.fromEntries(CASUS2_DRIVERS.map((d) => [d.way, d.zOffsetMm])),
  },
  poort: {
    ...CASUS2_GATE,
    effectieve_venstertijd_ms: CASUS2_GATE.rightWindowMs - CASUS2_GATE.referenceTimeMs,
    geldigheidsvloer_hz: 1000 / (CASUS2_GATE.rightWindowMs - CASUS2_GATE.referenceTimeMs),
    fijnstructuur_hz: 2000 / (CASUS2_GATE.rightWindowMs - CASUS2_GATE.referenceTimeMs),
  },
  meetcondities: CASUS2_MEASUREMENT,
  versterker: CASUS2_AMPLIFIER,
  bemonstering: CASUS2_SAMPLING,
  bestanden: files,
};
writeFileSync(join(OUT, 'grondwaarheid.json'), `${JSON.stringify(truth, null, 1)}\n`);

console.log(`casus 2: ${files.length} bestanden geschreven in test-fixtures/casus2/`);
for (const d of CASUS2_DRIVERS) {
  const t = truthDrivers[d.way];
  console.log(
    `  ${d.way.padEnd(8)} R_e ${d.ReOhm} Ω  f_s ${d.fsHz} Hz  Q_ms ${d.Qms}  Q_es ${d.Qes}  ` +
      `Bl ${(t.Bl_Tm as number).toFixed(3)} T·m  gevoeligheid ${(t.gevoeligheid_dB_1m_2V83 as number).toFixed(2)} dB  ` +
      `${JSON.stringify(t.kast)}`,
  );
}
console.log(`  poort T = ${truth.poort.effectieve_venstertijd_ms} ms → 1/T = ${truth.poort.geldigheidsvloer_hz} Hz`);
console.log(`  baffle step ${truth.geometrie.baffle_step_hz.toFixed(1)} Hz uit ${CASUS2_BAFFLE_MM.breedte} mm`);
