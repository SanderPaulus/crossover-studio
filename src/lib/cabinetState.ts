/**
 * UI-11 — "Your cabinet" as DATA, in one place (22-11-2026).
 *
 * The cabinet geometry and measurement context were two interfaces inside `App.tsx`; the
 * merge tool needs the same shape (it renders the same form, through one component), and a
 * component may not import a type out of the app it is mounted in. The types, the empty
 * values and the two pure transforms the form needs — the reference-point commit and the
 * patch the merge tool's demo session writes — moved here verbatim. Nothing in this file
 * reads a measurement or decides anything about a loudspeaker.
 */
import type { BranchRole } from './driverSlots.ts';
import type { DriverFacing, Enclosure } from './cabinet.ts';
import type { CabinetPatchForMerge } from './mergeSession.ts';

export const CABINET_STATE_VERSION = 'cabinet-state/1.0';

/* Facing directions as short summary labels — t()-keys, one place. */
export const FACING_LABEL: Record<string, string> = {
  front: 'front-firing',
  rear: 'rear-firing',
  left: 'left-firing',
  right: 'right-firing',
  up: 'up-firing',
  down: 'down-firing',
};

/** Cabinet geometry + measurement context, as typed (strings so a field can be
 *  empty; every consumer treats absent as "criterion does not apply"). */
export interface CabinetDriver {
  /** Offset from the measurement reference point, mm. +x right, +y up. */
  xMm: string;
  yMm: string;
  enclosure: Enclosure;
  /** Box corner: Fc for sealed, Fb for ported. */
  fbHz: string;
  /** How many IDENTICAL drivers make up this branch ('' or '1' = one). Dual
   *  woofers are ordinary (MTM, 2.5-way), and the count is not cosmetic: n
   *  drivers displace n times the air, so the excursion floor drops by √n —
   *  while each cone still beams as itself, which is why Sd stays the single
   *  driver's datasheet value instead of being pre-multiplied. */
  count: string;
  /** Centre-to-centre spacing BETWEEN those drivers, mm. Only meaningful when
   *  count > 1: it sets where the array's own vertical lobing starts, which is
   *  a different (and usually lower) ceiling than cone beaming. */
  spacingMm: string;
  /** How far the acoustic centre sits behind the baffle plane, mm. '' = 0 =
   *  on the baffle, which is what a normal front-mounted driver effectively
   *  is. A side-firing woofer's centre is typically half a cabinet back, and
   *  that is hundreds of microseconds of pure geometry. */
  depthMm: string;
  /** Which way the driver radiates. Side-firing woofers are an ordinary
   *  design; without this the app judges their angle, their baffle and their
   *  arrival time against the front panel they are not on. */
  facing: DriverFacing;
  /** Sloped/stepped baffle: degrees this driver is aimed further UP. */
  tiltDeg: string;
  /** count > 1 drivers sit on BOTH opposing panels, firing away from each
   *  other — how side-mounted woofers are normally built (force cancelling). */
  opposed: boolean;
}
export interface CabinetState {
  /**
   * Microphone distance during the FRD sweeps, mm.
   *
   * ⚠ ONE GLOBAL NUMBER FOR EVERY SWEEP, AND THAT IS NOT WHAT A DATASET LOOKS
   * LIKE. Sanders Koan measurements were taken in two sessions with different
   * geometry — session 1 with the mic 935 mm high, session 2 at 1000 mm
   * distance and 1387 mm high — and this field can only hold one of them. It
   * surfaced through the gate: the 4.5 ms sitting in `gateMs` was session 1's
   * mid window, standing in for branches measured in session 2 (see A3h).
   *
   * The gate half is fixed — a file states its own window. This half cannot be
   * fixed the same way: ARTA writes no distance into the export, so it needs a
   * field PER SOURCE rather than a better parser. It is not cosmetic — mic
   * distance feeds `trueOffAxisDeg`, the rig path excess, the derived mounting
   * depth and the far-field verdict, so getting it wrong moves physics and not
   * just a band.
   *
   * Deliberately left as is until A5 (positions per source), where the per-
   * source record exists to put it on. Written down here so A5 meets it.
   */
  micDistanceMm: string;
  /** Fixed VERTICAL angle of the rig, degrees; + = mic above the reference
   *  plane. Usually 0 (mic level with the reference point). Signed on purpose:
   *  on a driver 380 mm low at 500 mm, ±10° swings the true angle 31°↔43°. */
  micElevationDeg: string;
  /** The reflection-free window the operator used, ms — a claim about the RIG,
   *  for the cabinet ledger's "honest down to" line.
   *
   *  A3h: it no longer stands in for a file that states no window. A window
   *  belongs to a sweep, not to a project — Sanders 4.5 ms was the mid gate
   *  from an earlier session at 935 mm and silently became the data floor for
   *  two branches measured at 1 m through a 5.021 ms window. The files decide
   *  their own validity now, and where they all agree the ledger reads them
   *  rather than this field. '' = predict from geometry. */
  gateMs: string;
  baffleWidthMm: string;
  baffleHeightMm: string;
  /** Front-to-back, mm. Only needed once a driver fires sideways: then THAT
   *  is the width of the panel it radiates from. */
  cabinetDepthMm: string;
  /** How far below the top of the baffle the reference point sits, mm. */
  refFromTopMm: string;
  /** Height of the reference point above the floor, mm. */
  refHeightMm: string;
  listenDistanceM: string;
  listenEarHeightMm: string;
  /** Which driver the microphone was aimed at, if any. That driver IS the
   *  reference point, so its offset is 0,0 BY DEFINITION — the app should
   *  know it rather than ask for it (Sander: "de tweeter is toch de
   *  reference? dan hoef ik toch geen offset in te vullen?"). '' = the mic
   *  was aimed at some other spot and every driver has a real offset. */
  refDriver: '' | BranchRole;
  drivers: Record<BranchRole, CabinetDriver>;
}
export const emptyCabinetDriver = (): CabinetDriver => ({
  xMm: '',
  yMm: '',
  enclosure: 'unknown',
  fbHz: '',
  count: '',
  spacingMm: '',
  depthMm: '',
  facing: 'front',
  tiltDeg: '',
  opposed: false,
});
export const emptyCabinet = (): CabinetState => ({
  micDistanceMm: '',
  micElevationDeg: '',
  gateMs: '',
  baffleWidthMm: '',
  baffleHeightMm: '',
  cabinetDepthMm: '',
  refFromTopMm: '',
  refHeightMm: '',
  listenDistanceM: '',
  listenEarHeightMm: '',
  refDriver: '',
  drivers: { low: emptyCabinetDriver(), mid: emptyCabinetDriver(), high: emptyCabinetDriver() },
});
export const FACINGS: readonly DriverFacing[] = ['front', 'rear', 'left', 'right', 'up', 'down'];
/** A stored facing, or 'front' — an unknown value must read as the ordinary
 *  case, never crash a restore. */
export const asFacing = (v: string | undefined): DriverFacing =>
  FACINGS.find((f) => f === v) ?? 'front';

/**
 * The reference-point commit (was `commitRefTop` in `App.tsx`). Typing a NEW height for the
 * reference point moves the REFERENCE MARKER only: every driver keeps the below-top position
 * the designer typed, so each stored (reference-relative) y shifts by the same delta. The
 * reference driver IS the point and stays 0,0; a first-time entry (old field empty) shifts
 * nothing, because the offsets were entered reference-relative back then and are already the
 * truth. Pure: the same state and the same value give the same state.
 */
export function applyRefFromTop(c: CabinetState, v: string): CabinetState {
  if (v === c.refFromTopMm) return c;
  const oldTop = Number(c.refFromTopMm);
  const newTop = Number(v);
  const delta =
    c.refFromTopMm.trim() !== '' && v.trim() !== '' && Number.isFinite(oldTop) && Number.isFinite(newTop) ? newTop - oldTop : 0;
  const shift = (d: CabinetDriver, role: BranchRole): CabinetDriver =>
    delta === 0 || role === c.refDriver || d.yMm.trim() === '' || !Number.isFinite(Number(d.yMm))
      ? d
      : { ...d, yMm: String(Math.round((Number(d.yMm) + delta) * 10) / 10) };
  return {
    ...c,
    refFromTopMm: v,
    drivers: { low: shift(c.drivers.low, 'low'), mid: shift(c.drivers.mid, 'mid'), high: shift(c.drivers.high, 'high') },
  };
}

/** UI-6 — a patch from the merge tool (its demo session writes one): touches only what it names. */
export function applyCabinetPatch(c: CabinetState, patch: CabinetPatchForMerge): CabinetState {
  const next: CabinetState = { ...c, drivers: { ...c.drivers } };
  if (patch.baffleWidthMm !== undefined) next.baffleWidthMm = patch.baffleWidthMm;
  if (patch.baffleHeightMm !== undefined) next.baffleHeightMm = patch.baffleHeightMm;
  if (patch.refFromTopMm !== undefined) next.refFromTopMm = patch.refFromTopMm;
  for (const [role, d] of Object.entries(patch.drivers ?? {}) as [BranchRole, { yMm?: string; count?: string; spacingMm?: string }][]) {
    next.drivers[role] = {
      ...c.drivers[role],
      ...(d.yMm !== undefined ? { yMm: d.yMm } : {}),
      ...(d.count !== undefined ? { count: d.count } : {}),
      ...(d.spacingMm !== undefined ? { spacingMm: d.spacingMm } : {}),
    };
  }
  return next;
}
