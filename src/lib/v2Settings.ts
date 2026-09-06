/**
 * E-2 — THE ENGINE-v2 PROJECT SETTINGS, AS ONE HOME (P4 on the form itself).
 *
 * WHY THIS FILE EXISTS. Sander opened the v2 settings and read six numbers in
 * the requirement fields — 35 %, 1.6 Ω, −18 dB, 2.5 dB, 1.5×, 0.5 dB — and took
 * them for values. They were HTML placeholders: the state behind every field
 * was empty, the engine received nothing, and the comment beside them called
 * them "ghosts the engine never receives". That is true and it does not help:
 * a number printed in a field reads as a number in the field, and a limit the
 * designer believes is stated but is not is P4 broken at the screen rather
 * than in the engine. So:
 *
 *   1. EVERY v2 FIELD STARTS EMPTY, and the empty state has one definition
 *      (`EMPTY_V2_SETTINGS`) that the app's initial state, the autosave
 *      restore and a project without the block all resolve to. A fresh
 *      browser shows every field empty; `v2Settings.test.ts` pins it.
 *   2. NO JUDGEMENT FIELD CARRIES A NUMERIC GHOST. A gate, a budget, a
 *      requirement, a buildability class, an excursion input: their
 *      placeholder is the unset mark and nothing else. The two exceptions are
 *      named in `V2_GHOSTS` with their reason — a seed and a list size are the
 *      only settings where blank really does mean "the published default".
 *   3. A VALUE SAYS WHO STATED IT AND WHEN. A field with a value shows "stated
 *      by you on <date>" beside it; the date is stamped when the field is
 *      edited (`stampStated`) and travels with the project (`V2StatedAt`). A
 *      value restored from a project written before E-2 has no date and says
 *      so — it is still the designer's, never the app's.
 *
 * No engine import here on purpose: this is the form's own vocabulary, and the
 * toggle-regression scan lets only the UI entry points reach into `engine2/`.
 */

/** Every key of the v2 settings block, in the order the project file writes them. */
export const V2_SETTING_KEYS = [
  'verticalWindowDeg',
  'amplifierPowerW',
  'maxDissipationPct',
  'minEpdrOhm',
  'maxDriveOnFsDb',
  'lfBumpBudgetDb',
  'qesMultiplierMax',
  'dampingMarginDb',
  'runSeed',
  'runBudgetEvals',
  'splWindowPlusMinusDb',
  'maxPhaseTrackingDeg',
  'shortlistSize',
  'amplifierPeakPowerW',
  'amplifierNominalLoadOhm',
  'xmaxMarginFraction',
  'resistorClassW',
  'resistorPowerMargin',
  'coilClassA',
  'resistorThermalPowerW',
  'lowestWayLevelWork',
  'lowestWaySeriesRMaxOhm',
  /** E-2 — the field mode: '' (exploration, the default), 'exploration' or 'full'. */
  'fieldMode',
] as const;

export type V2SettingKey = (typeof V2_SETTING_KEYS)[number];
export type V2Settings = Record<V2SettingKey, string>;

/** The fresh-browser state: every field empty, nothing stated, nothing judged. */
export const EMPTY_V2_SETTINGS: Readonly<V2Settings> = Object.freeze(
  Object.fromEntries(V2_SETTING_KEYS.map((k) => [k, ''])) as V2Settings,
);

/**
 * The keys whose value JUDGES, BOUNDS or FILTERS a design, or feeds a limit
 * that does: a gate (M-A, M-B, M-C), a search-space budget, an A5e.1
 * requirement, the excursion inputs M-C v2.0 derives its ceiling from, the
 * buildability classes and the level-work rule. Also the two REPORTING scales
 * whose ghosts read as values (`amplifierPowerW`, `verticalWindowDeg`): an
 * amplifier power the designer believes is stated but is not turns every watt
 * in the panel into a figure nobody typed. A value here comes from the
 * designer or from nowhere.
 */
export const V2_JUDGEMENT_KEYS: readonly V2SettingKey[] = [
  'verticalWindowDeg',
  'amplifierPowerW',
  'maxDissipationPct',
  'minEpdrOhm',
  'maxDriveOnFsDb',
  'lfBumpBudgetDb',
  'qesMultiplierMax',
  'dampingMarginDb',
  'splWindowPlusMinusDb',
  'maxPhaseTrackingDeg',
  'amplifierPeakPowerW',
  'amplifierNominalLoadOhm',
  'xmaxMarginFraction',
  'resistorClassW',
  'resistorPowerMargin',
  'coilClassA',
  'resistorThermalPowerW',
  'lowestWayLevelWork',
  'lowestWaySeriesRMaxOhm',
];

/** The placeholder of a field that holds nothing: a mark, never a number. */
export const UNSET_GHOST = '—';

/**
 * The placeholder per field. Every judgement key shows `UNSET_GHOST`. The
 * exceptions carry their reason:
 *  · `runSeed` — blank uses `DEFAULT_RUN_SEED` and REPORTS it (A5e.4: a seed
 *    is the one setting where blank must not mean off), so the ghost is the
 *    seed that will actually run; the app fills it from the engine constant.
 *  · `shortlistSize` — blank holds `DEFAULT_SHORTLIST_SIZE` designs, a
 *    presentation count and not a judgement; the app fills it likewise.
 *  · `runBudgetEvals` — "tuner": the tuner's own policy, a word and not a number.
 *  · `fieldMode` — a select, no placeholder.
 * Entries the app fills from an engine constant are left empty here so this
 * file stays free of engine imports; the test pins which keys those are.
 */
export const V2_GHOSTS: Readonly<Record<V2SettingKey, string>> = Object.freeze({
  ...(Object.fromEntries(V2_SETTING_KEYS.map((k) => [k, UNSET_GHOST])) as Record<V2SettingKey, string>),
  runSeed: '',
  shortlistSize: '',
  runBudgetEvals: 'tuner',
  fieldMode: '',
});

/** The keys whose ghost the app fills from an engine default, and why that is honest. */
export const V2_DEFAULT_GHOST_KEYS: readonly V2SettingKey[] = ['runSeed', 'shortlistSize'];

/** When each field was last stated, ISO date (`YYYY-MM-DD`). Absent = never, or before E-2. */
export type V2StatedAt = Partial<Record<V2SettingKey, string>>;

/** Today's date in the form `V2StatedAt` records. */
export const isoDay = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/**
 * Restore the block from a project file: every key present and every unknown
 * key dropped, so a project from before a key existed opens with that field
 * EMPTY — which is what "not stated" means (P4). The dates come along where
 * the file carried them.
 */
export function restoreV2Settings(
  stored: Partial<Record<string, string | undefined>> | undefined,
  storedAt: Partial<Record<string, string | undefined>> | undefined,
): { settings: V2Settings; statedAt: V2StatedAt } {
  const settings = { ...EMPTY_V2_SETTINGS } as V2Settings;
  const statedAt: V2StatedAt = {};
  for (const k of V2_SETTING_KEYS) {
    const v = stored?.[k];
    if (typeof v === 'string') settings[k] = v;
    const d = storedAt?.[k];
    if (typeof d === 'string' && d !== '' && settings[k] !== '') statedAt[k] = d;
  }
  return { settings, statedAt };
}

/** The provenance stamp after an edit: a value gets today's date, a cleared field loses its date. */
export function stampStated(prev: V2StatedAt, key: V2SettingKey, value: string, today: string = isoDay()): V2StatedAt {
  const next = { ...prev };
  if (value.trim() === '') delete next[key];
  else next[key] = today;
  return next;
}

/**
 * The mark beside a field: null when the field is empty, otherwise who stated
 * it and when. A value without a date is still the designer's — it came out
 * of a project file — and the mark says the date is not recorded rather than
 * inventing one.
 */
export function statedMark(settings: V2Settings, statedAt: V2StatedAt, key: V2SettingKey): string | null {
  if (settings[key].trim() === '') return null;
  const d = statedAt[key];
  return d ? `stated by you on ${d}` : 'stated by you (date not recorded)';
}

/**
 * E-2 — the note beside the v1 "Design for … dB" level field on the v2 route.
 *
 * That field is a v1 design level with a real default ('96'). Since V49 the v2
 * route reads none of it: M-C v2.0 derives its excursion limit from the driver
 * card, the amplifier's peak and the measured sweep. Left unmarked it reads as
 * a v2 input with a default, which is exactly the class of thing this file
 * removes; so on the v2 route the field carries this note. Null on v1, where
 * the field is what it always was (toggle invariant).
 */
export function designLevelNote(engineV2Enabled: boolean): string | null {
  return engineV2Enabled
    ? 'v1 design level — not read by Engine v2 since V49; M-C v2.0 derives the excursion limit from the driver card and the amplifier peak'
    : null;
}
