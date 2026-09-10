/**
 * A5a (F3b) — PER-BRANCH MEASUREMENT METADATA FOR THE v2 LAYER, one home.
 *
 * It lived inside `App.tsx` until U-3, which was fine while the form was its
 * only reader. It is not the only one any more: a DEMO BUNDLE states some of
 * these facts (a coil family, a stated M-C figure, how a way is wired), and the
 * guard that checks a bundle against the I-1 register has to know the whole
 * shape — including which fields the bundle is SILENT about, because "empty,
 * not absent" is half of what that guard claims.
 *
 * Strings throughout and '' means ABSENT, exactly like the cabinet form beside
 * it: these feed a layer whose whole discipline is that a missing input turns a
 * metric off with a reason rather than substituting a default (P4).
 *
 * No engine import on purpose (the toggle-invariant's dependency arrow lets
 * only the UI entry points reach into `engine2/`), and no file reading: this is
 * bundle code and must stay browser-safe.
 */

export interface V2MeasurementMeta {
  /** Acoustic centre on the vertical axis, mm. '' = use the cabinet position. */
  zMm: string;
  /** '', 'yes' or 'no' — three states, because "not stated" is one of them. */
  rotSym: string;
  /** DC resistance measured with a meter, Ω. Outranks both sweep derivations. */
  reOhm: string;
  /** Manual window: the impulse's t=0 reference, ms. */
  refTimeMs: string;
  /** Manual window: the right window edge, ms. */
  rightWindowMs: string;
  /** Or the hard validity floor itself, Hz — for a window known by its result. */
  floorHz: string;
  /** Where the designer got these numbers. Travels with the provenance. */
  windowNote: string;
  /** V49 — force factor Bl, T·m, from the datasheet. '' = absent. */
  blTm: string;
  /** V49 — moving mass M_ms, g, from the datasheet. '' = absent. */
  mmsG: string;
  /** V49 — the drive voltage (V rms) the on-axis far field was taken at. '' = not documented. */
  driveVoltageV: string;
  /** V50 — the stated M-C figure for THIS way, dB re its passband. '' = none
   *  per way; the single field decides, and blank there = the derived ceiling
   *  alone (or nothing). */
  driveOnFsMaxDb: string;
  /** V51 — how the way's N identical drivers (count on the cabinet form) were
   *  wired when MEASURED: '', 'parallel' or 'series'. '' = not stated. */
  wiringMeasured: string;
  /** V51 — how the design intends to wire them. '' = not stated. */
  wiringDesired: string;
  /** A5e.3 — the COIL FAMILY this way is wound with (brand|series|gauge, the
   *  id `coilDcr.ts` fits per family on the loaded catalogue). '' = not
   *  stated: the way's coils are lossless in every judgement, and the report
   *  says so as a deviation from any build. Never a default (P6). */
  coilFamily: string;
  /* ---- M-M (10-09-2026): the driver's own power rating -------------------
   * Three numbers off ONE line of the datasheet and its footnote. They belong
   * together: a rated power without the filter it was rated through is not a
   * limit on anything, and the metric refuses rather than assuming a
   * condition. '' throughout = M-M reports the delivered share and judges
   * nothing, with the missing field named. */
  /** "Rated power handling", W. */
  ratedPowerW: string;
  /** The ORDER of the high-pass the rating was measured through. */
  testFilterOrder: string;
  /** That filter's corner, Hz. Often not printed — see `v2InputRegister`. */
  testFilterHz: string;
  /* ---- U-3g (10-09-2026): the recommended minimum crossover --------------
   * The one generic statement a sheet makes about how LOW this driver may be
   * crossed ("Recommended frequency range 2.2 kHz - 30 kHz"). It reaches the
   * pre-design window as a floor, verbatim; the order is the second half of
   * the condition and only ever raises it. '' = no such floor, and the window
   * falls back to whatever it had (P4). */
  /** The lowest handover the datasheet recommends, Hz. */
  minCrossoverHz: string;
  /** The order that recommendation is stated at. '' = none claimed. */
  minCrossoverOrder: string;
}

/** Every field of the block, in declaration order — the guards enumerate it. */
export const V2_MEASUREMENT_KEYS = [
  'zMm',
  'rotSym',
  'reOhm',
  'refTimeMs',
  'rightWindowMs',
  'floorHz',
  'windowNote',
  'blTm',
  'mmsG',
  'driveVoltageV',
  'driveOnFsMaxDb',
  'wiringMeasured',
  'wiringDesired',
  'coilFamily',
  'ratedPowerW',
  'testFilterOrder',
  'testFilterHz',
  'minCrossoverHz',
  'minCrossoverOrder',
] as const satisfies readonly (keyof V2MeasurementMeta)[];

/** The fresh state of one branch: every field empty, nothing stated. */
export const emptyV2Meas = (): V2MeasurementMeta => ({
  zMm: '',
  rotSym: '',
  reOhm: '',
  refTimeMs: '',
  rightWindowMs: '',
  floorHz: '',
  windowNote: '',
  blTm: '',
  mmsG: '',
  driveVoltageV: '',
  driveOnFsMaxDb: '',
  wiringMeasured: '',
  wiringDesired: '',
  coilFamily: '',
  ratedPowerW: '',
  testFilterOrder: '',
  testFilterHz: '',
  minCrossoverHz: '',
  minCrossoverOrder: '',
});
