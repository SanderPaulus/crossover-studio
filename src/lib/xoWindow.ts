/**
 * Physics window for ONE handover (lower driver U → upper driver B) — the
 * search space "Design for me" seeds its crossover candidates in.
 *
 * The window is the INTERSECTION of independent limiters, and every limiter
 * reports its own number so the UI can say which rule set which edge. That is
 * the whole point: the old derivation silently fell back to the level-anchor
 * neighbourhood whenever two limits disagreed (measured on Sanders' 3-way:
 * fs-floor 1902 Hz vs breakup/3 = 1887 Hz → window discarded → candidates at
 * 4028–7000 Hz, straight through the mid's 5660 Hz breakup). A window that
 * cannot be attributed cannot be acted on; a window that vanishes cannot even
 * be seen.
 *
 * Rules (numbers are the DEFAULT thresholds; all live in settings):
 *  1. DATA FLOOR — no candidate below f_valid = 2/T_gate of the least reliable
 *     involved measurement (or the TOP of the near-field splice blend when a
 *     branch is spliced — no handover inside the merge). Wins over EVERYTHING, including a user window: a candidate
 *     below the data floor is designed on noise. Clamping is said out loud.
 *  2. ARRAY LOBING — several parallel drivers in U with spacing d:
 *     ceiling = k·c/d (k = 0.5, i.e. d = λ/2 — the first forward null).
 *  3. CENTRE-TO-CENTRE U–B — ceiling where the spacing exceeds λ/N;
 *     N is axis-aware by default (vertical stack 1.0, side by side 2.0).
 *  4. BREAKUP — ceiling = first breakup of U / 1.8.
 *  5. RESONANCE FLOOR — floor = K·fs of B, fs IN SITU from the ZMA;
 *     K = 2 with an LCR trap present, 3 without.
 *  6. EXCURSION — floor from B's Xmax at the reference level.
 *  7. USER WINDOW — replaces 2–6, never 1.
 * Plus the existing measured floors/ceilings (where B reaches level; U's
 * measured beaming onset) which stay in the intersection.
 */

export const C_AIR_M_S = 343;

export interface XoWindowThresholds {
  /** Rule 2: array ceiling = arrayK · c / spacing. 0.5 = λ/2, no forward null. */
  arrayK: number;
  /** Rule 3: ceiling = c / (ctcLambdaDiv · spacing). 'auto' = axis-aware:
   *  a VERTICALLY stacked pair gets λ/1.0 (its first null lands at ±30°
   *  vertical — floor and ceiling, not the listening plane; Dickason),
   *  a SIDE-BY-SIDE pair λ/2 (the null would sit in the horizontal listening
   *  plane), mixed axes interpolate — the same rule lobingKFor uses. Measured
   *  on Sanders' 3-way: λ/1.5 on his 141 mm mid–tweeter forbids every M-T
   *  above 1621 Hz, while 2200–2400 Hz (d ≈ λ) is his known-good handover. */
  ctcLambdaDiv: number | 'auto';
  /** Rule 4: ceiling = breakup / breakupDiv. */
  breakupDiv: number;
  /** Rule 5: floor = fsK · fs(in situ). 2 with an Fs LCR trap, 3 without. */
  fsK: number;
}

export const DEFAULT_XO_WINDOW_THRESHOLDS: XoWindowThresholds = {
  arrayK: 0.5,
  ctcLambdaDiv: 'auto',
  breakupDiv: 1.8,
  fsK: 2,
};

export type XoRule =
  | 'data'
  | 'array'
  | 'ctc'
  | 'breakup'
  | 'fs'
  | 'excursion'
  | 'reach'
  | 'beaming'
  | 'user';

export interface XoLimit {
  rule: XoRule;
  side: 'floor' | 'ceil';
  hz: number;
  /** Human-readable derivation, e.g. "2× fs 951 Hz (in situ)". */
  label: string;
  /** True when a user window pushed this physics limit aside (rule 7). */
  overridden?: boolean;
}

export interface XoWindowInputs {
  /** Rule 1 — already the max over the involved measurements. */
  dataFloorHz?: number | null;
  dataFloorLabel?: string;
  /** Rule 2 — spacing between the parallel drivers of U (mm), if count > 1. */
  arraySpacingMm?: number | null;
  /** Rule 3 — centre-to-centre distance U–B (mm). */
  ctcMm?: number | null;
  /** Rule 3 — the pair's axis (mm offsets, any sign) for the 'auto' divisor;
   *  omitted = treated as vertical. */
  ctcVec?: { dxMm: number; dyMm: number } | null;
  /** Rule 4 — first breakup of U (Hz, raw). */
  breakupHz?: number | null;
  /** Rule 5 — fs of B measured in situ (Hz). */
  fsHz?: number | null;
  /** Rule 6 — excursion floor of B (Hz). */
  excursionHz?: number | null;
  /** Where B reaches its own level (Hz). */
  reachHz?: number | null;
  /** U's beaming onset (Hz), measured or from size. */
  beamingHz?: number | null;
  beamingMeasured?: boolean;
  /** Rule 7 — the designer's own window for this handover. */
  userWindow?: [number, number] | null;
  /** Sanity rails the free scan may never leave. */
  rails: [number, number];
}

export interface XoWindow {
  floorHz: number | null;
  ceilHz: number | null;
  floorBy: XoLimit | null;
  ceilBy: XoLimit | null;
  /** Every limiter that produced a number, binding or not. */
  limits: XoLimit[];
  /** Floor ≥ ceiling after intersection: the physics say these two cannot
   *  meet here. Candidates collapse to one point; the banner says why. */
  conflict: boolean;
  /** Rule 1 raised the floor above what physics (or the user) wanted. */
  dataClamped: boolean;
  /** Rule 1 clipped a USER window. */
  userClampedByData: boolean;
  /** One line for the UI when something needs saying; null when all is well. */
  banner: string | null;
}

const round = (v: number) => Math.round(v);

/** Rule 3's divisor: a number as given, or axis-aware for 'auto' — vertical
 *  stack λ/1.0, side-by-side λ/2, mixed in between (1/k of lobingKFor). */
export function ctcDivisorFor(
  setting: number | 'auto',
  vec?: { dxMm: number; dyMm: number } | null,
): number {
  if (setting !== 'auto') return setting > 0 ? setting : 1;
  if (!vec) return 1;
  const d = Math.hypot(vec.dxMm, vec.dyMm);
  if (!(d > 0)) return 1;
  const k = 0.5 + 0.5 * (Math.abs(vec.dyMm) / d); // lobingKFor
  return 1 / k;
}
const axisWord = (vec?: { dxMm: number; dyMm: number } | null): string => {
  if (!vec) return 'vertical';
  const d = Math.hypot(vec.dxMm, vec.dyMm);
  if (!(d > 0)) return 'vertical';
  const v = Math.abs(vec.dyMm) / d;
  return v > 0.9 ? 'vertical' : v < 0.1 ? 'side by side' : 'mixed axis';
};

export function deriveXoWindow(
  inp: XoWindowInputs,
  thr: XoWindowThresholds = DEFAULT_XO_WINDOW_THRESHOLDS,
): XoWindow {
  const limits: XoLimit[] = [];
  const pos = (v: number | null | undefined): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  const c = C_AIR_M_S * 1000; // mm/s

  // ---- physics ceilings of U ----
  if (pos(inp.arraySpacingMm)) {
    const hz = (thr.arrayK * c) / inp.arraySpacingMm;
    limits.push({ rule: 'array', side: 'ceil', hz, label: `array lobing: ${thr.arrayK}·c/${round(inp.arraySpacingMm)} mm` });
  }
  if (pos(inp.ctcMm)) {
    const div = ctcDivisorFor(thr.ctcLambdaDiv, inp.ctcVec);
    const hz = c / (div * inp.ctcMm);
    const how = thr.ctcLambdaDiv === 'auto' ? ` (auto, ${axisWord(inp.ctcVec)})` : '';
    limits.push({ rule: 'ctc', side: 'ceil', hz, label: `centre-to-centre ${round(inp.ctcMm)} mm > λ/${div.toFixed(2).replace(/\.?0+$/, '')}${how}` });
  }
  if (pos(inp.breakupHz)) {
    const hz = inp.breakupHz / thr.breakupDiv;
    limits.push({ rule: 'breakup', side: 'ceil', hz, label: `breakup ${round(inp.breakupHz)} Hz / ${thr.breakupDiv}` });
  }
  if (pos(inp.beamingHz)) {
    limits.push({
      rule: 'beaming',
      side: 'ceil',
      hz: inp.beamingHz,
      label: inp.beamingMeasured ? 'measured beaming onset' : 'beaming (from size)',
    });
  }
  // ---- physics floors of B ----
  if (pos(inp.fsHz)) {
    const hz = thr.fsK * inp.fsHz;
    limits.push({ rule: 'fs', side: 'floor', hz, label: `${thr.fsK}× fs ${round(inp.fsHz)} Hz (in situ)` });
  }
  if (pos(inp.excursionHz)) {
    limits.push({ rule: 'excursion', side: 'floor', hz: inp.excursionHz, label: 'excursion at the reference level' });
  }
  if (pos(inp.reachHz)) {
    limits.push({ rule: 'reach', side: 'floor', hz: inp.reachHz, label: 'upper driver reaches its level' });
  }

  const [railLo, railHi] = inp.rails;
  let floor: number | null = null;
  let ceil: number | null = null;
  let floorBy: XoLimit | null = null;
  let ceilBy: XoLimit | null = null;

  const user = inp.userWindow && inp.userWindow[1] > inp.userWindow[0] ? inp.userWindow : null;
  if (user) {
    // Rule 7: the designer's window replaces the physics limits (2–6), which
    // stay listed as information, marked overridden.
    for (const l of limits) l.overridden = true;
    floor = user[0];
    ceil = user[1];
    floorBy = { rule: 'user', side: 'floor', hz: user[0], label: 'your window' };
    ceilBy = { rule: 'user', side: 'ceil', hz: user[1], label: 'your window' };
    limits.push(floorBy, ceilBy);
  } else {
    for (const l of limits) {
      if (l.side === 'floor') {
        if (floor === null || l.hz > floor) {
          floor = l.hz;
          floorBy = l;
        }
      } else if (ceil === null || l.hz < ceil) {
        ceil = l.hz;
        ceilBy = l;
      }
    }
    // Rails: the free scan never leaves sane territory.
    if (floor === null || floor < railLo) {
      floor = railLo;
      floorBy = null;
    }
    if (ceil === null || ceil > railHi) {
      ceil = railHi;
      ceilBy = null;
    }
  }

  // ---- Rule 1: the data floor beats everything, and says so ----
  let dataClamped = false;
  let userClampedByData = false;
  let banner: string | null = null;
  if (pos(inp.dataFloorHz)) {
    const df = inp.dataFloorHz;
    const dl: XoLimit = {
      rule: 'data',
      side: 'floor',
      hz: df,
      label: inp.dataFloorLabel ?? `data floor ${round(df)} Hz`,
    };
    limits.push(dl);
    if (floor !== null && floor < df) {
      dataClamped = true;
      userClampedByData = !!user;
      floor = df;
      floorBy = dl;
      banner =
        `the optimum may lie below the measurement floor of ${round(df)} Hz` +
        (user ? ` — your window started at ${round(user[0])} Hz` : '') +
        ' — measure lower (ground plane or near field) instead of designing on noise';
      if (ceil !== null && ceil <= df) {
        // The whole wanted window sits under the data floor.
        ceil = df;
      }
    }
  }

  // Conflict = no usable room: a window narrower than the ±2% cage breathing
  // room is a point, not a search space (fixture: 2×fs 1849 vs breakup/3
  // 1889 — the old code discarded exactly this and fell back silently).
  const conflict = floor !== null && ceil !== null && ceil <= floor * 1.03;
  if (conflict && !dataClamped) {
    // Two physics limits (or user vs nothing) cannot both hold: say which.
    const a = floorBy ? `${floorBy.label} (${round(floorBy.hz)} Hz)` : `${round(floor!)} Hz`;
    const b = ceilBy ? `${ceilBy.label} (${round(ceilBy.hz)} Hz)` : `${round(ceil!)} Hz`;
    banner = `no room for this handover: floor ${a} meets or exceeds ceiling ${b} — pin it, or relax a threshold`;
  } else if (conflict && dataClamped && ceil === floor) {
    banner = `${banner} — the entire wanted window sits under it`;
  }
  if (conflict && floor !== null) {
    // Collapse onto the FLOOR side: floors protect a driver (resonance,
    // excursion, data), ceilings protect quality (lobing, breakup). When they
    // cannot both hold, the search sits just above the floor — narrow, but a
    // real point — and the banner says the rest.
    ceil = floor * 1.03;
  }

  return { floorHz: floor, ceilHz: ceil, floorBy, ceilBy, limits, conflict, dataClamped, userClampedByData, banner };
}

/**
 * Gate length in ms from an FRD's header, when the exporter wrote one
 * ("gated 5.021 ms", "Gate = 4.5 ms", "gate: 5ms"). Null when absent.
 */
export function gateMsFromHeader(text: string): number | null {
  const head = text.slice(0, 4000);
  const m = head.match(/gate[d]?\s*(?:length|time|window)?\s*[=:]?\s*([\d]+(?:[.,]\d+)?)\s*ms/i);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Rule 1: the frequency below which a gated measurement is not to be
 *  trusted for design — TWO gate periods (one period is where it starts to
 *  resolve; design wants margin). */
export function dataFloorFromGateMs(gateMs: number | null | undefined): number | null {
  return gateMs && gateMs > 0 ? 2000 / gateMs : null;
}

/**
 * Candidate centres inside a window: corners, the log-midpoint, and a warm
 * start (an existing design's crossing) when it falls inside. Sorted, unique
 * within 2%. `n` = requested steps: 1 → mid only, 2 → corners, ≥3 → corners +
 * log-mid (+ intermediate log steps for n > 3).
 */
export function candidateCentres(
  lo: number,
  hi: number,
  n: number,
  warmHz?: number | null,
): number[] {
  const out: number[] = [];
  if (!(hi > lo)) return [Math.sqrt(Math.max(lo, 1) * Math.max(hi, 1))];
  const L = Math.log(lo);
  const H = Math.log(hi);
  const k = Math.max(1, Math.round(n));
  if (k === 1) out.push(Math.exp((L + H) / 2));
  else for (let i = 0; i < k; i++) out.push(Math.exp(L + (i * (H - L)) / (k - 1)));
  if (warmHz && warmHz >= lo && warmHz <= hi) out.push(warmHz);
  out.sort((a, b) => a - b);
  return out.filter((v, i) => i === 0 || v / out[i - 1] > 1.02);
}
