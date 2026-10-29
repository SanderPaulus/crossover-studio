/**
 * U-9 fase 2 — THE VALUES THE APP STARTS A SEARCH FIELD AT, AND WHAT THAT MEANS.
 *
 * The U-9 phase-0 measurement found thirty-five fields that steer the v2 search
 * without a register row (finding N2), and nearly all of them start on a value
 * the APP chose — a `useState` initial, a `localStorage` fallback. Nobody
 * stated those values, and they steer the search anyway. From P4 that is the
 * heaviest point of the inventory: not a hidden default inside the engine, but
 * a number nobody chose that a run still obeys.
 *
 * They are NOT hidden and NOT changed. What this module does is let them say
 * what they are: a field still on its app start value reads "app default — not
 * stated by you", with the value beside it, and that is visibly different from
 * "stated by you on <date>". A first edit makes it a stated value, with its
 * date, the way `stampStated` already does for the v2 settings block.
 *
 * ONE HOME, FOUR READERS. Before U-9 these numbers were typed in the
 * `useState` initials, again in the `localStorage` fallbacks, again in the
 * guided "non-standard" list, and the phase-0 script mirrored them a fourth
 * time. Four copies of a default are four chances for "unchanged" and "app
 * default" to disagree about the same project; `u9FieldEffects.test.ts` pins
 * that `App.tsx` reads them from here. This is a DISPLAY rule and changes no
 * run: every value below is the value the app already started at.
 */

import { DEFAULT_R_SOURCE_DISQUALIFY_OHM, DEFAULT_R_SOURCE_TIER_OHM } from './partAudit.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from './vfOptimizer.ts';
import { isoDay } from './v2Settings.ts';

/** The app start value of every search field that has one. */
export interface AppDefaults {
  dirWeight: number;
  ampTarget: 'onAxis' | 'listeningWindow';
  powerMetric: 'smooth' | 'legacy';
  powerFoldWeight: number;
  costWeight: number;
  dissipationWeight: number;
  rSourceLimitOhm: number;
  rSourceDisqOhm: number;
  diWeight: number;
  vfEqBands: number;
  breakupGuard: boolean;
  phaseMetricMode: 'band' | 'overlap';
  synthMode: 'filter' | 'acoustic';
  stagedOn: boolean;
  targetRipple: string;
  targetPhase: string;
  roomCorrection: boolean;
  roomRippleDb: number;
  acSlopeMid: string;
  acSlopeTweeter: string;
  acSlopeWoofer: string;
  acSlopeMidHp: string;
  catalogSnap: boolean;
}

export const APP_DEFAULTS: Readonly<AppDefaults> = Object.freeze({
  dirWeight: 25,
  ampTarget: 'onAxis',
  powerMetric: 'smooth',
  powerFoldWeight: 0.5,
  costWeight: 0.015,
  dissipationWeight: 0.05,
  rSourceLimitOhm: DEFAULT_R_SOURCE_TIER_OHM,
  rSourceDisqOhm: DEFAULT_R_SOURCE_DISQUALIFY_OHM,
  diWeight: 0.3,
  vfEqBands: DEFAULT_EQ_BANDS_PER_DRIVER,
  breakupGuard: true,
  phaseMetricMode: 'band',
  synthMode: 'acoustic',
  stagedOn: true,
  targetRipple: '2.5',
  targetPhase: '15',
  roomCorrection: false,
  roomRippleDb: 3.5,
  acSlopeMid: '24',
  acSlopeTweeter: '12',
  acSlopeWoofer: '24',
  acSlopeMidHp: '24',
  catalogSnap: true,
});

export type AppDefaultKey = keyof AppDefaults;

/**
 * Which register row each start value belongs to. A row may hold several
 * (the power metric and its fold weight are one row), and the mark reads all
 * of them: one value moved away from its start is enough to make the row
 * the designer's own.
 */
export const APP_DEFAULT_ROWS: Readonly<Record<string, readonly AppDefaultKey[]>> = Object.freeze({
  dirWeight: ['dirWeight'],
  ampTarget: ['ampTarget'],
  powerMetric: ['powerMetric', 'powerFoldWeight'],
  costWeight: ['costWeight'],
  dissipationWeight: ['dissipationWeight'],
  rSourceLimit: ['rSourceLimitOhm'],
  rSourceDisq: ['rSourceDisqOhm'],
  diWeight: ['diWeight'],
  eqBands: ['vfEqBands'],
  breakupGuard: ['breakupGuard'],
  phaseMetric: ['phaseMetricMode'],
  synthMode: ['synthMode'],
  stagedOn: ['stagedOn', 'targetRipple', 'targetPhase'],
  roomCorrection: ['roomCorrection', 'roomRippleDb'],
  acSlopeMid: ['acSlopeMid'],
  acSlopeTweeter: ['acSlopeTweeter'],
  acSlopeWoofer: ['acSlopeWoofer'],
  acSlopeMidHp: ['acSlopeMidHp'],
  catalogSnap: ['catalogSnap'],
});

/** When a row was stated, by row id (ISO day). Travels in the project file. */
export type FieldStatedAt = Readonly<Partial<Record<string, string>>>;

/** The value of a start value as the mark prints it. */
const show = (v: unknown): string =>
  typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v);

/**
 * The mark, in English (`text`, what the tests read) and in its parts, so the
 * app can translate the sentence and substitute the value or the date after.
 */
export type AppDefaultMark =
  | { kind: 'app-default'; text: string; value: string }
  | { kind: 'stated'; text: string; date: string | null };

/**
 * The mark beside a search field.
 *
 *   · a recorded statement wins: "stated by you on <date>", whatever the value;
 *   · otherwise every key still on its start value → "app default — not stated
 *     by you (<value>)";
 *   · otherwise the value moved without a recorded date — a project from
 *     before U-9, or a preference kept in this browser — and that is the
 *     designer's own: "stated by you (date not recorded)", E-2's rule.
 */
export function appDefaultMark(
  rowId: string,
  values: Readonly<Record<AppDefaultKey, unknown>>,
  statedAt: FieldStatedAt,
): AppDefaultMark {
  const keys = APP_DEFAULT_ROWS[rowId];
  if (!keys) throw new Error(`appDefaultMark: no app start value for row "${rowId}"`);
  const d = statedAt[rowId];
  if (d) return { kind: 'stated', text: `stated by you on ${d}`, date: d };
  const atDefault = keys.every((k) => Object.is(values[k], APP_DEFAULTS[k]));
  if (atDefault) {
    const value = keys.map((k) => show(APP_DEFAULTS[k])).join(' · ');
    return { kind: 'app-default', text: `app default — not stated by you (${value})`, value };
  }
  return { kind: 'stated', text: 'stated by you (date not recorded)', date: null };
}

/** The stamp of a first edit, the `stampStated` way: the row becomes stated today. */
export function stampField(prev: FieldStatedAt, rowId: string, today: string = isoDay()): FieldStatedAt {
  if (!APP_DEFAULT_ROWS[rowId]) throw new Error(`stampField: no app start value for row "${rowId}"`);
  return { ...prev, [rowId]: today };
}

/** Restore from a project file: only strings, only rows this module knows. */
export function restoreFieldStatedAt(stored: unknown): FieldStatedAt {
  const out: Record<string, string> = {};
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      if (APP_DEFAULT_ROWS[k] && typeof v === 'string' && v !== '') out[k] = v;
    }
  }
  return out;
}
