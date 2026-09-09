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
});
