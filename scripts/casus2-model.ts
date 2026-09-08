/**
 * CASUS 2 — HET MODEL, EN HET IS DE GRONDWAARHEID.
 *
 * Casus 2 is de tweede synthetische casus van dit boek (casus S1 was de eerste,
 * en die toetste ÉÉN schatter). Zij bestaat omdat casus 1 een vraag niet kan
 * beantwoorden die A7 wél stelt: vinden de extractoren de WERKELIJKE
 * parameters terug? Op gemeten data is er geen werkelijke parameter — er is een
 * tweede meting, en twee schatters die het eens worden is consensus en geen
 * validatie. Hier is elk getal gekozen vóórdat er iets gemeten werd, dus elke
 * extractie heeft een antwoord om naast te leggen.
 *
 * WAT HIER STAAT EN WAT ER NIET STAAT. Dit bestand is het MODEL: de
 * T/S-parameters, de kasten, de geometrie, de poort in de header, de
 * meetspanning, de breakups. Het rekent niets uit dat een extractor ook
 * uitrekent — de afgeleide grootheden (f_c, f_b, Q_mc, gevoeligheid, de
 * baffle-step, de −6 dB-hoek) worden door `generate-casus2-measurements.ts`
 * uit ditzelfde model berekend en als grondwaarheid weggeschreven, zodat er
 * geen tweede huis voor een getal ontstaat (P6, één laag verderop).
 *
 * ELK GETAL IS ANDERS DAN CASUS 1, en dat is een eis en geen toeval: een
 * synthetische casus die toevallig in de buurt van de echte ligt kan een
 * schatter die op één casus is afgeregeld niet betrappen. Eén 8 Ω-woofer in
 * plaats van een parallel paar, een kleinere voorplaat, andere c-t-c, andere
 * gevoeligheden, een andere poort (4,0 ms in plaats van 2,521), en een
 * meetspanning die WÉL gedocumenteerd is — dat laatste is de enige manier
 * waarop route 2 van M-C ooit getoetst kan worden, want op casus 1 staat zij
 * uit bij gebrek aan die spanning.
 */

/** Physical constants — the whitelist of P6 (unit conversions and c). */
export const C_AIR = 343; // m/s
export const RHO_AIR = 1.2041; // kg/m³ at 20 °C
export const P_REF = 20e-6; // Pa, the SPL reference

/** One driver of the model: lumped T/S plus the enclosure it sits in. */
export interface Casus2Driver {
  /** The way it serves, and the key every manifest and report uses. */
  way: string;
  model: string;
  /** DC resistance of the voice coil, Ω. */
  ReOhm: number;
  /**
   * Semi-inductance of the voice coil: Z = K·(jω)^n (Wright's model). `n` is
   * exactly what `semi_inductantie_n` extracts; `K` is set so the coil adds
   * `leOhmAt10k` of reactance magnitude at 10 kHz, which is how a datasheet
   * states it.
   */
  semiInductanceExponent: number;
  leOhmAt10k: number;
  /** Free-air resonance, Hz. */
  fsHz: number;
  /** Free-air mechanical and electrical Q. */
  Qms: number;
  Qes: number;
  /** Moving mass (kg) and effective piston area (m²). */
  MmsKg: number;
  SdM2: number;
  /** Peak linear excursion, one way, mm — the driver card figure. */
  XmaxMm: number;
  /** Effective piston diameter for the near-field ceiling, inches. */
  diameterInch: number;
  /** The enclosure. */
  box:
    | { kind: 'sealed'; volumeM3: number }
    | { kind: 'vented'; volumeM3: number; tuningHz: number; leakageQ: number }
    | { kind: 'free-air' };
  /**
   * Cone/dome breakups: an added resonance on the radiated response, as
   * (frequency Hz, height dB, Q). They are what `breakups` must find.
   */
  breakups: readonly (readonly [number, number, number])[];
  /** Acoustic centre offset along the axis, mm (negative = further back). */
  zOffsetMm: number;
}

export const CASUS2_DRIVERS: readonly Casus2Driver[] = [
  {
    way: 'woofer',
    model: 'SYN-W165-8 (synthetic, one driver, 8 Ω nominal)',
    ReOhm: 6.2,
    semiInductanceExponent: 0.7,
    leOhmAt10k: 14.0,
    fsHz: 34.0,
    Qms: 3.1,
    Qes: 0.38,
    MmsKg: 0.0165,
    SdM2: 0.0132,
    XmaxMm: 6.0,
    diameterInch: 6.5,
    box: { kind: 'vented', volumeM3: 0.028, tuningHz: 38.0, leakageQ: 7 },
    breakups: [
      [3400, 6.2, 12],
      [7200, 4.1, 16],
    ],
    zOffsetMm: -155,
  },
  {
    way: 'mid',
    model: 'SYN-D75-6 (synthetic 3-inch DOME midrange, 6 Ω nominal, closed pod)',
    ReOhm: 5.4,
    semiInductanceExponent: 0.66,
    leOhmAt10k: 6.5,
    fsHz: 260.0,
    Qms: 2.4,
    Qes: 0.62,
    MmsKg: 0.0018,
    SdM2: 0.0032,
    XmaxMm: 2.0,
    diameterInch: 3.0,
    box: { kind: 'sealed', volumeM3: 0.000142 },
    breakups: [
      [11000, 5.4, 14],
      [15500, 3.6, 18],
    ],
    zOffsetMm: -38,
  },
  {
    way: 'tweeter',
    model: 'SYN-T22-4 (synthetic 22 mm dome on a waveguide, 4 Ω nominal, high f_s)',
    ReOhm: 4.1,
    semiInductanceExponent: 0.62,
    leOhmAt10k: 2.2,
    fsHz: 1500.0,
    Qms: 1.6,
    Qes: 0.55,
    MmsKg: 0.00028,
    SdM2: 0.00062,
    XmaxMm: 0.6,
    diameterInch: 1.0,
    box: { kind: 'free-air' },
    breakups: [[18500, 3.2, 20]],
    zOffsetMm: 0,
  },
];

/** The cabinet — a SMALLER front than casus 1's 260 × 1124 mm. */
export const CASUS2_BAFFLE_MM = { breedte: 210, hoogte: 900 };

/** Centre-to-centre spacings, mm — all different from casus 1 (261 / 129.2). */
export const CASUS2_CTC_MM = { woofer_mid: 195, mid_tweeter: 96 };

/**
 * The GATE, chosen and written into every far-field header: reference 3.0 ms,
 * right window 7.0 ms, so T = 4.0 ms exactly and A5b.1(i)'s floor 1/T is
 * 250 Hz on the nose. Casus 1's is 2.521 ms → 396.7 Hz.
 */
export const CASUS2_GATE = { referenceTimeMs: 3.0, rightWindowMs: 7.0, taper: 'Tukey 0.25' };
/** The near-field window: long, as a near-field measurement is. */
export const CASUS2_NF_GATE = { leftWindowMs: 6.0, referenceTimeMs: 6.5, rightWindowMs: 1000, taper: 'Tukey 0.50' };

/**
 * The measurement conditions, DOCUMENTED — which is the point. M-C's acoustic
 * route needs the drive voltage and the mic distance of the on-axis response;
 * casus 1 has neither in its headers, so that route is off there and has never
 * been exercised on a case. Here it is stated, in the header and in the driver
 * card, and the two routes can be held against each other.
 */
export const CASUS2_MEASUREMENT = { voltsRms: 2.83, micDistanceMm: 1000 };

/** The amplifier the project states — different numbers from casus 1's. */
export const CASUS2_AMPLIFIER = { peakPowerW: 120, continuousPowerW: 60, nominalLoadOhm: 6 };

/** The sampling of the written files. */
export const CASUS2_SAMPLING = {
  sampleRateHz: 48000,
  impulseLength: 32768,
  fftLength: 16384,
  /** The far-field grid: linear, as an FFT export is. */
  ffFirstHz: 20.5078125,
  ffLastHz: 20000,
  /** The impedance sweep: log, as an impedance sweep is. */
  zFromHz: 5,
  zToHz: 20000,
  zPoints: 1200,
  /** The off-axis angles measured. */
  anglesDeg: [0, 30] as const,
};
