/**
 * Cabinet geometry and measurement context — the facts the DESIGNER knows and
 * the app would otherwise have to guess at.
 *
 * Every function here exists because a real ambiguity cost real time: "is that
 * beaming or the port?", "is 50 cm far-field?", "how far apart are the drivers
 * really?". None of it modifies measured data — measurements stay the truth.
 * These only bound search windows, cross-check what was measured, and warn.
 *
 * Coordinate convention: baffle plane, origin at the MEASUREMENT REFERENCE
 * POINT (where the microphone was aimed and, for a turntable, the rotation
 * axis). +x to the right, +y UP, +z out of the baffle toward the listener.
 * Millimetres throughout.
 */

const C_AIR = 343;

/**
 * Which way a driver actually radiates. Not every driver is on the front:
 * side-firing woofers are a normal design (a narrow front baffle, the cone
 * area moved to the flanks), and so are up- and down-firing ones.
 *
 * This matters because almost everything on this page answers "where is this
 * driver relative to the microphone" — and half of those answers need the
 * driver's OWN axis, not the cabinet's. A side woofer sits 90° off-axis before
 * the turntable moves at all, and its baffle is the side panel, not the front.
 */
export type DriverFacing = 'front' | 'rear' | 'left' | 'right' | 'up' | 'down';

/** Unit normal of each facing in cabinet coordinates, before any tilt. */
const AXIS: Record<DriverFacing, readonly [number, number, number]> = {
  front: [0, 0, 1],
  rear: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

/** The panel opposite a given one — the other half of an opposed pair. */
export const oppositeFacing = (f: DriverFacing): DriverFacing =>
  ({ front: 'rear', rear: 'front', left: 'right', right: 'left', up: 'down', down: 'up' } as const)[
    f
  ];

/**
 * The driver's radiating axis, tilt included.
 *
 * `tiltDeg` is the sloped/stepped baffle: positive aims the driver further UP.
 * It exists for the same reason `micElevationDeg` does — on a driver 250 mm
 * below the reference at 500 mm the true angle is 26.6°, and a 6° baffle slope
 * moves it to 20.6°, so leaving it out is not a rounding error. It is the
 * mirror of the rig's elevation: one tilts the microphone, this tilts the
 * driver.
 *
 * For a driver on a vertical panel (front/rear/left/right) the tilt rotates
 * the axis up out of the horizontal plane. For an up- or down-firing one it
 * rotates towards the FRONT, which is the only direction a designer aims such
 * a driver on purpose.
 *
 * NB it tilts the AXIS, not the position: where the cone sits stays what you
 * measured, and `depthMm` carries any step. On a real sloped baffle the two
 * go together, and typing both is more honest than deriving one from a slope
 * angle the app never sees.
 */
function axisOf(d: DriverPlacement): [number, number, number] {
  const f = d.facing ?? 'front';
  const [ax, ay, az] = AXIS[f];
  const t = ((d.tiltDeg ?? 0) * Math.PI) / 180;
  if (t === 0) return [ax, ay, az];
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Vertical facings tilt towards the front; the rest tilt up.
  return f === 'up' || f === 'down' ? [ax, ay * c, s] : [ax * c, s, az * c];
}

export interface DriverPlacement {
  /** Horizontal offset from the measurement reference point, mm (+ = right). */
  xMm: number;
  /** Vertical offset from the measurement reference point, mm (+ = up). */
  yMm: number;
  /** How far the acoustic centre sits BEHIND the baffle plane, mm (+ = deeper
   *  into the cabinet). A front driver is a few cm; a side-firing woofer's
   *  centre is typically half the cabinet depth back. Absent = 0 = on the
   *  baffle, which is what every two-way tower effectively is. */
  depthMm?: number;
  /** Radiating direction. Absent = 'front'. */
  facing?: DriverFacing;
  /** Sloped or stepped baffle: degrees the driver's axis is aimed further UP
   *  (towards the front, for an up/down-firing driver). Absent = flush. */
  tiltDeg?: number;
  /** This branch's drivers sit on BOTH opposing panels, firing away from each
   *  other — the force-cancelling arrangement that side-mounted woofers are
   *  normally built in. Their sum is what a sweep measures. */
  opposed?: boolean;
}

/** Driver position in cabinet coordinates (+z out of the baffle), mm. */
const posOf = (d: DriverPlacement): [number, number, number] => [
  d.xMm,
  d.yMm,
  -(d.depthMm ?? 0),
];

/** Mic/listener position on a sphere around the REFERENCE point: horizontal
 *  angle `nominalDeg`, elevation `elevationDeg` (+ = above the reference
 *  plane). One definition, used by every function here — it is one rig. */
function rigPoint(
  distanceMm: number,
  nominalDeg: number,
  elevationDeg: number,
): [number, number, number] {
  const t = (nominalDeg * Math.PI) / 180;
  const v = (elevationDeg * Math.PI) / 180;
  return [
    distanceMm * Math.cos(v) * Math.sin(t),
    distanceMm * Math.sin(v),
    distanceMm * Math.cos(v) * Math.cos(t),
  ];
}

/* ------------------------------------------------------------------ *
 * 1. What angle did a measurement ACTUALLY capture?
 * ------------------------------------------------------------------ */

/**
 * The TRUE off-axis angle of one driver in a measurement nominally taken at
 * `nominalDeg` horizontal.
 *
 * This is the single most useful thing on this page. A horizontal turntable
 * sweep is nominally "0°, 10°, 20°, 30°", but that is the angle of the
 * CABINET, not of each driver. A driver sitting 250 mm below the reference
 * point, measured at 500 mm, is already 26.6° off its own axis before the
 * turntable moves at all — and its "30°" curve is really 39°.
 *
 * Since a piston's directivity is flat near the axis and steepens further out,
 * a 27° → 39° difference is much LARGER than a genuine 0° → 30° one. That is
 * how a woofer comes to look like it beams from 300 Hz. At 1.5 m the same
 * driver spans 9.5° → 31° and the measurement means what it says.
 *
 * Geometry: with the mic at distance R and the cabinet rotated by θ, the mic
 * sits at (R·sinθ, 0, R·cosθ) in cabinet coordinates. The driver is at
 * (x, y, 0) looking along +z, so
 *
 *     cos φ = R·cosθ / |(R·sinθ − x, −y, R·cosθ)|
 *
 * `micElevationDeg` covers a rig that also sits at a fixed VERTICAL angle —
 * positive = the microphone above the reference plane. It is not a refinement:
 * on a driver 380 mm below the reference at 500 mm, ±10° of elevation moves the
 * true angle from 31° to 43°, so guessing the sign would be worse than not
 * modelling it at all. Zero reduces to the plain form above.
 *
 * The general form measures against the driver's OWN axis, so a side-firing
 * woofer reads ~90° at a nominal 0° — which is the truth, and the reason a
 * front turntable sweep says nothing about that driver's own directivity. A
 * front-facing driver on the baffle reduces exactly to the expression above.
 */
export function trueOffAxisDeg(
  driver: DriverPlacement,
  micDistanceMm: number,
  nominalDeg: number,
  micElevationDeg = 0,
): number | null {
  if (!(micDistanceMm > 0)) return null;
  const [mx, my, mz] = rigPoint(micDistanceMm, nominalDeg, micElevationDeg);
  const [px, py, pz] = posOf(driver);
  const dx = mx - px;
  const dy = my - py;
  const dz = mz - pz;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 0)) return null;
  const [nx, ny, nz] = axisOf(driver);
  const cos = (dx * nx + dy * ny + dz * nz) / len;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Both true angles of an OPPOSED pair (side-mounted woofers firing away from
 * each other), or null when the branch is not opposed.
 *
 * There is no single answer for such a branch, and inventing one is the whole
 * failure mode this file exists to prevent: at a nominal 0° both drivers are
 * 90° off their own axes, and turning the cabinet 30° puts one at 60° and the
 * other at 120°. What a sweep captures is their SUM — which is why an opposed
 * pair is used low, where each is omnidirectional and the question does not
 * arise.
 */
export function opposedAnglesDeg(
  driver: DriverPlacement,
  micDistanceMm: number,
  nominalDeg: number,
  micElevationDeg = 0,
): { nearDeg: number; farDeg: number } | null {
  if (!driver.opposed) return null;
  const a = trueOffAxisDeg(driver, micDistanceMm, nominalDeg, micElevationDeg);
  const b = trueOffAxisDeg(
    { ...driver, facing: oppositeFacing(driver.facing ?? 'front'), opposed: false },
    micDistanceMm,
    nominalDeg,
    micElevationDeg,
  );
  if (a === null || b === null) return null;
  return { nearDeg: Math.min(a, b), farDeg: Math.max(a, b) };
}

/**
 * Path length from a listening/measuring point to ONE driver, mm.
 *
 * The point sits on a sphere around the REFERENCE point at `distanceMm`, at
 * horizontal angle `nominalDeg` and elevation `elevationDeg` (positive =
 * above the reference plane) — the same convention as trueOffAxisDeg, because
 * it is the same rig.
 */
export function pathLengthMm(
  driver: DriverPlacement,
  distanceMm: number,
  nominalDeg = 0,
  elevationDeg = 0,
): number | null {
  if (!(distanceMm > 0)) return null;
  const [mx, my, mz] = rigPoint(distanceMm, nominalDeg, elevationDeg);
  const [px, py, pz] = posOf(driver);
  return Math.hypot(mx - px, my - py, mz - pz);
}

/** Speed of sound, mm/s — the one place this project converts path to time. */
export const C_AIR_MM_S = 343000;

/**
 * How much of a MEASURED inter-driver delay is the measuring rig rather than
 * the drivers — Sanders question, and it is a real hole the position fields
 * finally let us close.
 *
 * A measured arrival time is total path ÷ c, and that path is two unrelated
 * things added together: the depth of the driver's acoustic centre (a driver
 * property, the same wherever you stand) and the plain geometric distance from
 * the mic to a driver that sits at a different height (a RIG property, which
 * shrinks as you step back). Reporting the sum as "the tweeter sits 17 mm
 * proud of the mid" quietly credits the tripod for part of it.
 *
 * Measured on Sanders' centre — mid 70 mm from the reference point, mic at
 * 500 mm — the geometric share is 4.88 mm ≈ 14.2 µs, against measured excess
 * delays of 40–50 µs: a third of the number.
 *
 * Returns the extra path (mm) versus the REFERENCE POINT itself, so a driver
 * at the origin gets 0 and everything else is positive.
 */
export function geometricPathExcessMm(
  driver: DriverPlacement,
  distanceMm: number,
  elevationDeg = 0,
): number | null {
  const d = pathLengthMm(driver, distanceMm, 0, elevationDeg);
  if (d === null) return null;
  return d - distanceMm;
}

/**
 * The same excess path, split into the parts that mean different things.
 *
 * With mounting depth in the model the sum is no longer two things but three,
 * and only the last one is a property of the DRIVER:
 *
 *  - `rigMm`      the oblique path to a driver at another height. A rig
 *                 property: it shrinks as you step back.
 *  - `mountingMm` how much further away the cone sits because it is recessed,
 *                 or on the side panel, or firing at the floor. KNOWN from the
 *                 cabinet, and nothing to do with the driver's own acoustic
 *                 centre. It is NOT simply `depthMm`: close up the offset and
 *                 the depth partly share a direction, so a 150 mm-deep woofer
 *                 300 mm low contributes 133 mm at 500 mm and converges on the
 *                 full 150 only as you step back (145 at 1 m, 150 at 4 m).
 *                 Which is why it is computed at the distance you measured at
 *                 rather than read off the drawing.
 *  - `totalMm`    their sum, which is what a delay measurement contains.
 *
 * This is why a side-firing woofer trips the timing check: half a cabinet
 * depth is ~150 mm ≈ 440 µs, so without the mounting term the app reads a
 * perfectly ordinary speaker as a driver whose acoustic centre is a third of a
 * metre out of line. Subtracting what the geometry already explains leaves a
 * residual that can be judged honestly.
 *
 * Split by construction, not by approximation: `rigMm` is the excess this
 * driver would have at zero depth, so the two always add up to the total.
 */
export function pathBreakdownMm(
  driver: DriverPlacement,
  distanceMm: number,
  elevationDeg = 0,
): { rigMm: number; mountingMm: number; totalMm: number } | null {
  const total = geometricPathExcessMm(driver, distanceMm, elevationDeg);
  const rig = geometricPathExcessMm(
    { xMm: driver.xMm, yMm: driver.yMm },
    distanceMm,
    elevationDeg,
  );
  if (total === null || rig === null) return null;
  return { rigMm: rig, mountingMm: total - rig, totalMm: total };
}

/**
 * The per-driver delay change between the distance a set was MEASURED at and
 * the distance it will be LISTENED at, µs (positive = arrives later at the
 * listening seat than the measurement implied).
 *
 * This is the design-relevant half of the same geometry. The measured phase is
 * the truth AT THE MIC; a filter aligned there is not aligned at the seat,
 * because the oblique path shrinks with distance. On Sanders' set the mid's
 * geometric lead over the tweeter goes from 14.2 µs at 500 mm to 2.4 µs at
 * 3 m — an 11.8 µs shift, which is 20° at his 4.8 kHz handover and 34° at
 * 8 kHz. Not a refinement: it is the second, independent argument for
 * measuring further away.
 *
 * Normalised so the EARLIEST driver is 0 — an overall delay is inaudible, only
 * the differences between drivers matter.
 */
export function listeningDelayShiftUs(
  drivers: Readonly<Record<string, DriverPlacement | null>>,
  measureDistanceMm: number,
  listenDistanceMm: number,
  elevationDeg = 0,
): Record<string, number> | null {
  if (!(measureDistanceMm > 0) || !(listenDistanceMm > 0)) return null;
  const raw: Record<string, number> = {};
  for (const [key, d] of Object.entries(drivers)) {
    if (!d) continue;
    const atMic = geometricPathExcessMm(d, measureDistanceMm, elevationDeg);
    const atSeat = geometricPathExcessMm(d, listenDistanceMm, elevationDeg);
    if (atMic === null || atSeat === null) return null;
    raw[key] = ((atSeat - atMic) / C_AIR_MM_S) * 1e6;
  }
  const vals = Object.values(raw);
  if (vals.length === 0) return null;
  const earliest = Math.min(...vals);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v - earliest]));
}

/** A residual under this many degrees at the handover is not worth acting on. */
export const MEASURE_DIST_OK_DEG = 5;
/** Above this, the measuring distance is materially shaping the design. */
export const MEASURE_DIST_ACT_DEG = 15;

/**
 * Is the measuring distance far enough that the rig's own geometry no longer
 * shapes the design? Judged in DEGREES at the handover, not in microseconds:
 * a time shift is only as harmful as the frequency it lands on, and the same
 * 12 µs is 8° at 2 kHz and 34° at 8 kHz.
 *
 * This is the same 1/R geometry the far-field criterion describes, so the
 * verdict tends to agree with "3× the largest dimension" — measuring far
 * enough away fixes both at once, which is why the correction is a fallback
 * and the tripod is the real fix.
 */
export function measuringDistanceVerdict(
  shiftUs: number,
  handoverHz: number,
): { deg: number; verdict: 'fine' | 'marginal' | 'act' } | null {
  if (!(handoverHz > 0) || !Number.isFinite(shiftUs)) return null;
  const deg = Math.abs(360 * handoverHz * (shiftUs / 1e6));
  return {
    deg,
    verdict: deg < MEASURE_DIST_OK_DEG ? 'fine' : deg < MEASURE_DIST_ACT_DEG ? 'marginal' : 'act',
  };
}

/**
 * Level difference a measurement picks up from GEOMETRY alone — the mic-to-
 * driver distance changing as the cabinet turns. Positive = the off-axis
 * measurement reads LOWER purely because the driver moved further away.
 *
 * Note this is zero for a driver directly above or below a vertical rotation
 * axis: turning about that axis does not change its distance. It only appears
 * for a HORIZONTALLY offset driver — which is why a constant low-frequency
 * offset between angle curves, where the driver is certainly omnidirectional,
 * is a useful tell about the rig rather than about the driver.
 */
export function rotationLevelOffsetDb(
  driver: DriverPlacement,
  micDistanceMm: number,
  nominalDeg: number,
  micElevationDeg = 0,
): number | null {
  if (!(micDistanceMm > 0)) return null;
  const at = (deg: number) => pathLengthMm(driver, micDistanceMm, deg, micElevationDeg) ?? 0;
  const d0 = at(0);
  const d1 = at(nominalDeg);
  if (!(d0 > 0) || !(d1 > 0)) return null;
  return 20 * Math.log10(d1 / d0);
}

/* ------------------------------------------------------------------ *
 * 2. Was the measurement far-field at all?
 * ------------------------------------------------------------------ */

export interface FarFieldVerdict {
  /** micDistance / largest source dimension. */
  ratio: number;
  /** The usual working rule is ≥ 3; below that, treat directivity as indicative. */
  ok: boolean;
  /** The dimension that dominates (driver diameter or baffle width), mm. */
  sourceMm: number;
}

/**
 * Far-field sanity. A measurement is "far" when the distance is large compared
 * with the SOURCE — and for a loudspeaker the source is the whole baffle, not
 * just the cone, because the edges radiate too.
 *
 * The ×3 working rule is a convention, not a standard: below it the wavefront
 * is still curving and different parts of the baffle arrive at meaningfully
 * different times, so off-axis curves exaggerate directivity. It is reported
 * as a caveat on the derived ceilings, never as a reason to discard data.
 */
export function farFieldVerdict(
  micDistanceMm: number,
  opts: { driverDiameterMm?: number; baffleWidthMm?: number } = {},
): FarFieldVerdict | null {
  const sourceMm = Math.max(opts.driverDiameterMm ?? 0, opts.baffleWidthMm ?? 0);
  if (!(micDistanceMm > 0) || !(sourceMm > 0)) return null;
  const ratio = micDistanceMm / sourceMm;
  return { ratio, ok: ratio >= 3, sourceMm };
}

/** Effective piston diameter from Sd — the honest diameter for every ka rule
 *  (nominal size includes a surround that does not radiate as a piston). */
export function pistonDiameterMm(sdCm2: number): number | null {
  if (!(sdCm2 > 0)) return null;
  return Math.sqrt((4 * sdCm2 * 1e-4) / Math.PI) * 1000;
}

/* ------------------------------------------------------------------ *
 * 2b. How low does the measurement actually reach?
 * ------------------------------------------------------------------ */

export interface GateVerdict {
  /** Reflection-free window, ms. */
  gateMs: number;
  /** Lowest frequency the window can support, Hz. */
  fromHz: number;
  /** Extra path length the first reflection travels, mm. */
  extraPathMm: number;
}

/**
 * Lowest frequency a gated measurement can honestly claim, from the geometry
 * that decides it — the FLOOR BOUNCE.
 *
 * A windowed measurement is anechoic only until the first reflection arrives;
 * after that the window has to close, and a window of t seconds cannot resolve
 * anything whose period is longer than t. So `f_min ≈ 1/t_gate`. (That is the
 * optimistic bound — one full period just fits. Some practitioners use 2/t for
 * comfort; the number here is the ceiling on what you could claim, not a
 * promise.)
 *
 * For a speaker on a stand with the mic at the same height, the floor is
 * usually the first reflection and its path is pure geometry: mirror the source
 * to −h and measure. THE POINT is that this fights the far-field rule head-on —
 * backing away improves directivity and SHORTENS the gate:
 *
 *      0.5 m → 4.55 ms → 220 Hz, but only 1.7× a 300 mm baffle
 *      1.0 m → 3.60 ms → 277 Hz, and 3.3× — the shortest distance that is
 *      1.5 m → 2.92 ms → 343 Hz         genuinely far field
 *      3.0 m → 1.77 ms → 566 Hz
 *
 * Best case, deliberately: it assumes the floor is the nearest reflector. A low
 * ceiling or a near wall makes it worse, and the gate the operator actually
 * used is the ground truth — hence the manual override in the UI.
 */
export function floorBounceGate(
  micDistanceMm: number,
  refHeightMm: number,
  micElevationDeg = 0,
): GateVerdict | null {
  if (!(micDistanceMm > 0) || !(refHeightMm > 0)) return null;
  const v = (micElevationDeg * Math.PI) / 180;
  const horizMm = micDistanceMm * Math.cos(v);
  const micHeightMm = refHeightMm + micDistanceMm * Math.sin(v);
  if (!(micHeightMm > 0)) return null;
  // Image source mirrored through the floor.
  const bounceMm = Math.hypot(horizMm, refHeightMm + micHeightMm);
  const extraPathMm = bounceMm - micDistanceMm;
  if (!(extraPathMm > 0)) return null;
  const gateMs = extraPathMm / C_AIR;
  return { gateMs, fromHz: 1000 / gateMs, extraPathMm };
}

/** Lowest frequency a stated gate can support — for when the operator knows
 *  the window they actually used and that beats any prediction. */
export function gateLimitHz(gateMs: number): number | null {
  if (!(gateMs > 0)) return null;
  return 1000 / gateMs;
}

/* ------------------------------------------------------------------ *
 * 3. Spacing, edges, baffle step
 * ------------------------------------------------------------------ */

/** Acoustic centre-to-centre spacing of two drivers, mm — the input the
 *  vertical-lobing ceiling needs, derived instead of typed twice. Measured in
 *  three dimensions: a side-firing woofer's centre is half a cabinet back, and
 *  that separation is just as real as a vertical one. */
export function centreToCentreMm(a: DriverPlacement, b: DriverPlacement): number {
  const [ax, ay, az] = posOf(a);
  const [bx, by, bz] = posOf(b);
  return Math.hypot(ax - bx, ay - by, az - bz);
}

/** The dimensions of the box, for the panel a driver actually sits on. */
export interface BoxDims {
  widthMm: number;
  heightMm: number;
  /** Front-to-back, mm. Only needed once a driver fires sideways. */
  depthMm?: number;
}

/**
 * The width of the panel a driver radiates from — the number the baffle step
 * and the diffraction question are actually about.
 *
 * For a front driver it is the baffle width, as always. For a SIDE-firing one
 * it is the cabinet DEPTH, and on the tall narrow cabinets that use side
 * woofers those two differ by a factor of two or more — so the front baffle's
 * step frequency is simply the wrong number for that driver. Up/down-firing
 * drivers radiate from a panel that is width × depth; width is the honest
 * choice for a step estimate that is already only an estimate.
 */
export function radiatingPanelWidthMm(
  facing: DriverFacing | undefined,
  box: BoxDims,
): number | null {
  const f = facing ?? 'front';
  const w = f === 'left' || f === 'right' ? box.depthMm : box.widthMm;
  return w !== undefined && w > 0 ? w : null;
}

/**
 * Baffle-step frequency, Rod Elliott's form f3 ≈ 115/W[m].
 *
 * Reported only, never applied: a properly measured on-baffle FRD ALREADY
 * contains the step, so subtracting it again would double-count. The number is
 * useful for reading a response ("that 6 dB tilt is the baffle, not the
 * driver"), and it is honest about being approximate — published formulas for
 * this disagree by ~3×, and measurement disagrees with all of them, because
 * the driver's distance to each edge matters more than the width.
 */
export function baffleStepHz(widthMm: number): number | null {
  if (!(widthMm > 0)) return null;
  return 115 / (widthMm / 1000);
}

/**
 * Distance from a driver to the nearest edge of the panel it sits on, mm. The
 * asymmetry of these distances is what actually shapes diffraction — a driver
 * centred left-to-right gets both edges at once and the ripple is worst.
 *
 * A side-firing driver is measured on the SIDE panel: its horizontal
 * coordinate there is its mounting depth from the front, and the panel spans
 * the cabinet depth. Without the box depth there is nothing honest to say, so
 * it returns null rather than quietly measuring against the front baffle.
 */
export function nearestEdgeMm(
  driver: DriverPlacement,
  baffle: BoxDims & { refFromTopMm: number },
): number | null {
  if (!(baffle.widthMm > 0) || !(baffle.heightMm > 0)) return null;
  // Reference point sits on the vertical centre line, `refFromTopMm` below the top.
  const top = baffle.refFromTopMm - driver.yMm;
  const bottom = baffle.heightMm - baffle.refFromTopMm + driver.yMm;
  const facing = driver.facing ?? 'front';
  let across: number[];
  if (facing === 'left' || facing === 'right') {
    const depth = baffle.depthMm;
    if (!(depth !== undefined && depth > 0)) return null;
    const fromFront = driver.depthMm ?? 0;
    across = [fromFront, depth - fromFront];
  } else {
    across = [baffle.widthMm / 2 + driver.xMm, baffle.widthMm / 2 - driver.xMm];
  }
  const d = [...across, top, bottom].filter((v) => Number.isFinite(v));
  return d.length ? Math.min(...d) : null;
}

/* ------------------------------------------------------------------ *
 * 4. Where the listener actually sits
 * ------------------------------------------------------------------ */

/**
 * The vertical angle, in degrees, from a driver pair's acoustic axis to the
 * listener's ears. Positive = the listener is BELOW the reference point.
 *
 * This is what turns the lobing ceiling from a rule into a decision: a null at
 * ±25° is harmless if you sit 4° off the axis, and fatal if the speaker is
 * pointed at your knees. Without it, a spacing rule is a rule of thumb; with
 * it, it is a statement about your room.
 */
export function listeningAngleDeg(
  refHeightMm: number,
  earHeightMm: number,
  distanceM: number,
): number | null {
  if (!(distanceM > 0)) return null;
  return (Math.atan2(refHeightMm - earHeightMm, distanceM * 1000) * 180) / Math.PI;
}

/* ------------------------------------------------------------------ *
 * 5. What the box already does for you
 * ------------------------------------------------------------------ */

export type Enclosure = 'sealed' | 'ported' | 'open' | 'unknown';

export interface BoxRolloff {
  /** Acoustic high-pass order the enclosure itself provides. */
  order: number;
  /** True when the enclosure can radiate its own midrange (pipe resonances). */
  canRadiate: boolean;
  note: string;
}

/**
 * The acoustic high-pass a driver already has before any filter is added.
 *
 * This is the lever behind the whole "why are the capacitors so big" question:
 * a sealed midrange is already a 2nd-order high-pass at its box resonance, so
 * a 2nd-order ELECTRICAL filter yields a 4th-order ACOUSTIC slope. On a low
 * woofer-to-mid crossover that is the difference between one ~30 µF capacitor
 * and a pair adding up to ~90 µF.
 *
 * `canRadiate` is the other half: a port is an opening, and openings have pipe
 * resonances that put midrange into the room from a second location. When the
 * off-axis response shows interference that the impedance does not explain,
 * this is the field that decides whether a port is even a candidate.
 */
export function boxRolloff(enclosure: Enclosure): BoxRolloff {
  switch (enclosure) {
    case 'sealed':
      return {
        order: 2,
        canRadiate: false,
        note: 'sealed: 2nd-order acoustic HP at Fc — an LR2 electrical filter already gives an LR4 acoustic slope',
      };
    case 'ported':
      return {
        order: 4,
        canRadiate: true,
        note: 'ported: 4th-order acoustic HP at Fb, and the port can radiate its own midrange (pipe resonance)',
      };
    case 'open':
      return {
        order: 1,
        canRadiate: true,
        note: 'open back / dipole: little acoustic HP of its own, and the rear wave radiates',
      };
    default:
      return { order: 0, canRadiate: false, note: '' };
  }
}

/**
 * Excursion below the box corner. A SEALED driver's excursion flattens off
 * below Fc; a PORTED one unloads and excursion runs away — which is why the
 * same driver in the same crossover needs a steeper high-pass in a ported box.
 * Returns the extra electrical order worth having, for the advice text.
 */
export function unloadingRisk(enclosure: Enclosure): 'none' | 'high' {
  return enclosure === 'ported' ? 'high' : 'none';
}

/** Wavelength helper for reading the geometry numbers out loud. */
export function wavelengthMm(hz: number): number {
  return (C_AIR / hz) * 1000;
}
