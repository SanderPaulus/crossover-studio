/**
 * I-1 — EVERY INPUT THE v2 ROUTE CAN REACH, INVENTORIED AND LABELLED.
 *
 * WHY THIS FILE EXISTS. Sander opened the Filters panel in expert mode and
 * could not tell which field feeds which regime. That is not a complaint about
 * density: the panel mixes four genuinely different kinds of number and shows
 * them all as fields of equal weight. A measurement without which no run
 * happens at all, a limit that exists only because the designer stated it, a
 * datasheet figure that enriches a judgement without blocking it, and a v1
 * control the v2 route does not read — they look identical, and the last kind
 * is the dangerous one: a designer who tunes it believes they are steering a
 * run that never sees it.
 *
 * So every input is filed once, here, under FOUR labels and nothing else:
 *
 *   REQUIRED   — no run without it. Measurements with a validity floor, the
 *                number of ways, the driver positions, the cone sizes.
 *   JUDGEMENT  — a stated requirement. Blank = not judged, and the app says so
 *                (P4). Every gate, every search-space budget, every A5e.1
 *                requirement, the voicing, the buildability classes.
 *   NICE       — enriches without blocking. Blank = the metric that needs it
 *                stays off with a reason, or a published default runs and is
 *                REPORTED.
 *   V1_LEGACY  — a v1 control the v2 route does not read. Named with what v1
 *                does with it, so it can stay where it is and still stop
 *                reading as a v2 knob.
 *
 * THE REGISTER IS DATA, NOT DOCUMENTATION — the same discipline `choices.ts`
 * carries one layer down. `v2InputRegister.test.ts` reads it to check that
 * every v2 settings key has a row, that every judgement key is filed as one,
 * and that the app renders the groups in this order and marks every v1 row;
 * `App.tsx` reads it for its group headings, its empty-field help and its
 * "v1 (not read by Engine v2)" drawer. A row added here appears in the panel;
 * a key added to the form without a row fails the build.
 *
 * WHAT IT DELIBERATELY IS NOT. It decides nothing and it reads nothing. Every
 * sentence below describes behaviour that already exists and was checked
 * against the code that produces it (`worker.ts` and `scanRequest.ts` are the
 * authority on what crosses the border, never a comment); where the check
 * found the documentation wrong, the row says what the code does.
 *
 * No engine import on purpose: this is the form's own vocabulary, and the
 * toggle-regression scan lets only the UI entry points reach into `engine2/`.
 */

import { designLevelNote, type V2SettingKey } from './v2Settings.ts';

/** The four labels, and there are exactly four. */
export type V2InputClass = 'required' | 'judgement' | 'nice' | 'v1-legacy';

/** The order the panel shows them in — the order of the inventory itself. */
export const V2_INPUT_CLASSES: readonly V2InputClass[] = [
  'required',
  'judgement',
  'nice',
  'v1-legacy',
];

/** Where the designer gets the number. Not a hint: a place to look. */
export type V2InputSource =
  /** The driver's datasheet. */
  | 'datasheet'
  /** The amplifier's own spec sheet or nameplate. */
  | 'nameplate'
  /** A measurement: a sweep, a file header, a ruler, a meter. */
  | 'measurement'
  /** A decision only the designer can make. No measurement produces it. */
  | 'choice';

/**
 * U-3b — WHERE A FIELD IS SHOWN, as data beside what it does.
 *
 *   'always'      — in the default view of its form.
 *   'more'        — behind that form's one "more" disclosure.
 *   'conditional' — rendered only while its own condition holds, and not at
 *                   all otherwise. A fallback or an edge case: showing it
 *                   permanently invites someone to fill it in when the case
 *                   it answers does not exist.
 *
 * The class gives the default (required and judgement are shown, nice and v1
 * are not), and a row may OVERRIDE it — but only with a reason, which the
 * guard requires. Two things this deliberately does not do: it does not touch
 * the class, and it does not decide anything about the run. A field behind a
 * disclosure feeds exactly what it fed before.
 */
export type V2InputPlacement = 'always' | 'more' | 'conditional';

/** One input, with everything a reader needs to act on it. */
export interface V2InputRow {
  /** Stable id, used by the panel and by the tests. Never shown. */
  id: string;
  /** The label the app puts on the field, verbatim where there is a field. */
  label: string;
  /** Which tab or form holds it. */
  form: string;
  /**
   * The route from the form to the reader that acts on it: state → payload →
   * reader. Checked against the code, not against a comment.
   */
  travels: string;
  cls: V2InputClass;
  /** What happens when it is blank. One sentence, in the app's own voice. */
  emptyMeans: string;
  source: V2InputSource;
  /** The v2 settings key, when this row IS one of the form's own fields. */
  key?: V2SettingKey;
  /**
   * V1_LEGACY only: what v1 does with it, and that v2 does not read it. Shown
   * beside the field on the v2 route, so the field can stay where it is.
   */
  v1Note?: string;
  /**
   * U-3b: where the field is shown, when that is NOT what its class implies.
   * Every override carries `placementWhy`; the guard refuses one without.
   */
  placement?: V2InputPlacement;
  /** Why this row overrides its class's default placement. One sentence. */
  placementWhy?: string;
  /**
   * `placement: 'conditional'` only: the condition under which the field is
   * rendered at all, in the app's own terms.
   */
  condition?: string;
}

/* ==================================================================== *
 * 1 — REQUIRED: no run without it
 * ==================================================================== */

const REQUIRED: readonly V2InputRow[] = [
  {
    id: 'responses',
    label: 'On-axis response per way (FRD)',
    form: 'Drivers tab — measurement slots',
    travels:
      'parseFrd → AdapterBranch.onAxis → ingest → report.predesign.windowInputs → buildCandidateField',
    cls: 'required',
    emptyMeans:
      'fewer than two responses means no adjacent pair, so no A5d.3 window and no candidate field; ' +
      'the run falls back to the v1 generator and says so in its notes.',
    source: 'measurement',
  },
  {
    id: 'validity',
    label: 'Measurement window in the file header',
    form: 'the FRD header itself — nothing to type',
    travels:
      'parseArtaHeader / mergeBlock → validity.ts → the judged band and every window floor (A5b.1)',
    cls: 'required',
    emptyMeans:
      'the response has no floor it may be believed at, the anchored gaps refuse to compute, and ' +
      'v1 refuses the run outright (“the window could not be read”).',
    source: 'measurement',
  },
  {
    id: 'impedance',
    label: 'Impedance sweep per way (ZMA/LIMP)',
    form: 'Drivers tab — impedance slots',
    travels:
      'parseZma → AdapterBranch.impedance → z-resonance → f_s, R_e, the gate grid, M-B/|Z|, M-C',
    cls: 'required',
    emptyMeans:
      'no f_s, so no k·f_s window floor and no M-C; no measured |Z|, so M-B and the amplifier ' +
      'floor have nothing to read and every electrical gate reports “not judged”.',
    source: 'measurement',
  },
  {
    id: 'ways',
    label: 'Number of ways',
    form: 'implicit — which measurement slots are filled',
    travels:
      'branches → roles → one window input per ADJACENT PAIR (report.ts, i + 1 < order.length)',
    cls: 'required',
    emptyMeans: 'nothing is assumed: two filled slots is a two-way run, three a three-way.',
    source: 'measurement',
  },
  {
    id: 'positions',
    label: 'Driver positions (x, y) — the centre-to-centre spacing',
    form: 'Setup tab → Cabinet & drivers',
    travels:
      'cabinet.drivers[role].xMm/yMm → geometry.verticalMm → c-t-c → the lobing zones and M-F',
    cls: 'required',
    emptyMeans:
      'no c-t-c, so no lobing zone and no vertical-lobing synthesis; the window keeps its other ' +
      'limits and says the spacing is unknown.',
    source: 'measurement',
  },
  {
    id: 'sd',
    label: 'S_d per driver',
    form: 'Setup tab → driver card',
    travels: 'sdCm2 → AdapterBranch.driverCard.sdCm2 → piston diameter → the beaming ceiling; M-C route 2',
    cls: 'required',
    emptyMeans:
      'no cone diameter, so the measured beaming ceiling falls back to the nominal size select ' +
      'and, without that too, the window has no directivity ceiling.',
    source: 'datasheet',
  },
  {
    id: 'baffle-width',
    label: 'Baffle width',
    form: 'Setup tab → Cabinet & drivers',
    travels: 'cabinet.baffleWidthMm → geometry.baffleWidthMm → the baffle step → the target curve transition',
    cls: 'required',
    emptyMeans:
      'a stated bass plateau has a depth and no transition: the curve produces no offsets and ' +
      'names the half that was missing.',
    source: 'measurement',
  },
];

/* ==================================================================== *
 * 2 — JUDGEMENT: a limit exists only because you stated it
 * ==================================================================== */

/** The sub-heading a judgement row sits under. Presentation only. */
export type V2JudgementBand = 'gates' | 'budgets' | 'requirements' | 'voicing';

const JUDGEMENT: readonly (V2InputRow & { band: V2JudgementBand })[] = [
  {
    id: 'ampMinLoadOhm',
    label: 'Amplifier min load',
    form: 'Filters → Goals & weighting',
    travels: 'ampMinLoadOhm → gateSettingsFor → GateSettings.ampMinLoadOhm → M-B/|Z| and the barrier',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'no floor is applied; the delivered impedance minimum is measured and only reported.',
    source: 'nameplate',
  },
  {
    id: 'maxDissipationPct',
    key: 'maxDissipationPct',
    label: 'Max dissipation %',
    form: 'Filters → Engine v2',
    travels: 'engineV2Gates.maxDissipationFraction → GateSettings → M-A',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'M-A judges nothing; the percentage is still reported.',
    source: 'choice',
  },
  {
    id: 'minEpdrOhm',
    key: 'minEpdrOhm',
    label: 'Min EPDR Ω',
    form: 'Filters → Engine v2',
    travels: 'engineV2Gates.minEpdrOhm → GateSettings → M-B/EPDR',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'M-B/EPDR judges nothing; the EPDR minimum is still reported.',
    source: 'choice',
  },
  {
    id: 'maxDriveOnFsDb',
    key: 'maxDriveOnFsDb',
    label: 'Max drive on f_s dB',
    form: 'Filters → Engine v2',
    travels:
      'engineV2Gates.maxDriveOnFsDb → GateSettings.maxDriveOnFsDb AND the candidate declaration ' +
      "(protectionRule: 'stated') AND the A5d.3(ii) order derivation",
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'M-C judges nothing unless an excursion ceiling is derived, the order derivation stays ' +
      'unarmed on rule (ii), and the historic seed comparison stays in force.',
    source: 'choice',
  },
  {
    id: 'driveOnFsMaxDb-per-way',
    label: 'max drive on f_s (per way)',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'v2Meas[role].driveOnFsMaxDb → driveOnFsMaxDbByModel → GateSettings.maxDriveOnFsDbByDriver',
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'nothing is stated for this way: the single M-C field above judges it, and blank there too ' +
      'leaves only a derived excursion ceiling — or nothing at all.',
    source: 'choice',
  },
  {
    id: 'amplifierPeakPowerW',
    key: 'amplifierPeakPowerW',
    label: 'Amplifier peak power W',
    form: 'Filters → Engine v2',
    travels: 'peakInputVolts(peak, nominal) → GateSettings.peakInputVolts → M-C v2.0 and M-L',
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'no peak input voltage, so no derived excursion ceiling and no coil-current judgement; ' +
      'the stated dB figure alone judges M-C.',
    source: 'nameplate',
  },
  {
    id: 'amplifierNominalLoadOhm',
    key: 'amplifierNominalLoadOhm',
    label: 'Nominal load Ω',
    form: 'Filters → Engine v2',
    travels: 'the other half of peakInputVolts — both are needed or neither counts',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'no peak input voltage, exactly as above: the peak power alone states nothing.',
    source: 'nameplate',
  },
  {
    id: 'xmaxMarginFraction',
    key: 'xmaxMarginFraction',
    label: 'X_max margin',
    form: 'Filters → Engine v2',
    travels: 'ReportSettings → driveExcursion → ceilingDbReInput → the M-C limit and the window floor',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'no derived excursion ceiling; only a stated dB figure can judge M-C.',
    source: 'choice',
  },
  {
    id: 'amplifierPowerW',
    key: 'amplifierPowerW',
    label: 'Amplifier power W',
    form: 'Filters → Engine v2',
    travels:
      'ReportSettings.amplifierPowerW → M-A watts AND, unless a thermal power is stated, the ' +
      'power M-A/part is JUDGED at',
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'no watts anywhere — only M-A’s scale-free fraction — and M-A/part has no power to judge at.',
    source: 'nameplate',
  },
  {
    id: 'resistorClassW',
    key: 'resistorClassW',
    label: 'Resistor class W',
    form: 'Filters → Engine v2',
    travels: 'GateSettings.resistorClassW → M-A/part (class × margin, or the snapped part’s own rating)',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'no allowance, so M-A/part judges nothing; the watts per resistor are still shown.',
    source: 'choice',
  },
  {
    id: 'resistorPowerMargin',
    key: 'resistorPowerMargin',
    label: 'Resistor margin',
    form: 'Filters → Engine v2',
    travels: 'the other half of the M-A/part allowance — class without margin arms nothing',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'no allowance, exactly as above: a class on its own states nothing.',
    source: 'choice',
  },
  {
    id: 'coilClassA',
    key: 'coilClassA',
    label: 'Coil current class A',
    form: 'Filters → Engine v2',
    travels: 'GateSettings.coilClassA → M-L (peak current per coil at the amplifier peak)',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'M-L judges nothing; the peak current per coil is still shown. Air cores never saturate.',
    source: 'choice',
  },
  {
    id: 'resistorThermalPowerW',
    key: 'resistorThermalPowerW',
    label: 'Thermal design power W',
    form: 'Filters → Engine v2',
    travels: 'GateSettings.resistorThermalPowerW → the power M-A/part reads (V51)',
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'M-A/part judges at the amplifier power above; the gate row always says which power it read.',
    source: 'choice',
  },
  {
    id: 'lowestWayLevelWork',
    key: 'lowestWayLevelWork',
    label: 'Level work on lowest way',
    form: 'Filters → Engine v2',
    travels:
      'engineV2Gates.lowestWayLevelWork → declareCandidateChainChoices → the design and synthesis ' +
      'steps, and the worker’s topology refusal',
    cls: 'judgement',
    band: 'gates',
    emptyMeans:
      'nothing is forbidden — absent, never a stated “allowed” — so the search keeps its own ' +
      'behaviour and may pad the lowest way down to the anchor.',
    source: 'choice',
  },
  {
    id: 'lowestWaySeriesRMaxOhm',
    key: 'lowestWaySeriesRMaxOhm',
    label: 'Max series R on lowest way (Ω)',
    form: 'Filters → Engine v2 (shown once “series R up to a maximum” is chosen)',
    travels: 'the maximum that makes the mode a statement — discrete R plus every series coil’s DCR',
    cls: 'judgement',
    band: 'gates',
    emptyMeans: 'the mode cannot be stated without its number, so the whole rule reads as not stated.',
    source: 'choice',
  },
  {
    id: 'lfBumpBudgetDb',
    key: 'lfBumpBudgetDb',
    label: 'LF lift budget dB',
    form: 'Filters → Engine v2',
    travels:
      'BudgetSettings.lfBumpBudgetDb → the A5d.6 inversion (a soft ceiling since C-2) AND M-D on ' +
      'the delivered network',
    cls: 'judgement',
    band: 'budgets',
    emptyMeans: 'no ceiling is inverted and M-D judges nothing; the lift is still reported.',
    source: 'choice',
  },
  {
    id: 'qesMultiplierMax',
    key: 'qesMultiplierMax',
    label: 'Max Q_es ×',
    form: 'Filters → Engine v2',
    travels: 'BudgetSettings.qesMultiplierMax → the exact inversion R_s ≤ R_e·(q−1) → M-E',
    cls: 'judgement',
    band: 'budgets',
    emptyMeans: 'no bound on the series resistance in the lowest path; M-E is reported only.',
    source: 'choice',
  },
  {
    id: 'dampingMarginDb',
    key: 'dampingMarginDb',
    label: 'Damping margin dB',
    form: 'Filters → Engine v2',
    travels: 'BudgetSettings.dampingMarginDb → the A5d.4 pad inversion against the way’s own passband |Z|',
    cls: 'judgement',
    band: 'budgets',
    emptyMeans: 'no bound on how much attenuation a way may spend beyond its measured gap.',
    source: 'choice',
  },
  {
    id: 'splWindowPlusMinusDb',
    key: 'splWindowPlusMinusDb',
    label: 'SPL window ±dB',
    form: 'Filters → Engine v2',
    travels: 'the shortlist’s A5e.1 requirements — which finished designs you are shown',
    cls: 'judgement',
    band: 'requirements',
    emptyMeans: 'not asked; the value is shown beside every row and filters nothing.',
    source: 'choice',
  },
  {
    id: 'maxPhaseTrackingDeg',
    key: 'maxPhaseTrackingDeg',
    label: 'Max phase error °',
    form: 'Filters → Engine v2',
    travels: 'the shortlist’s A5e.1 requirements, judged PER handover',
    cls: 'judgement',
    band: 'requirements',
    emptyMeans: 'not asked; the value is shown beside every row and filters nothing.',
    source: 'choice',
  },
  {
    id: 'targetCurve',
    label: 'Target curve',
    form: 'Filters → Engine v2 — voicing (on the DESIGN, not the project)',
    travels:
      'activeDesign.targetCurve → V2RunSettings.targetCurve AND the candidate declaration ' +
      '(amplitudeReference) → what “flat” means for the search, the window and the RMS',
    cls: 'judgement',
    band: 'voicing',
    emptyMeans: 'flat is the neutral reference, not a missing answer — it is stated by being chosen.',
    source: 'choice',
  },
  {
    id: 'plateauDepthDb',
    label: 'Bass plateau depth dB',
    form: 'Filters → Engine v2 — voicing',
    travels: 'the depth half of the curve; the transition is the baffle step and is never stored',
    cls: 'judgement',
    band: 'voicing',
    emptyMeans: 'the curve produces no offsets at all and says which half was missing.',
    source: 'choice',
  },
];

/* ==================================================================== *
 * 3 — NICE TO HAVE: enriches, never blocks
 * ==================================================================== */

const NICE: readonly V2InputRow[] = [
  {
    id: 'blTm',
    label: 'Bl',
    form: 'Setup tab → driver card → Datasheet',
    travels: 'v2Meas[role].blTm → driverCard → driveExcursion route 1 (x/V on the resonance)',
    cls: 'nice',
    emptyMeans: 'no excursion ceiling for this way; M-C falls back to the stated dB figure, if any.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: without these three the ' +
      'excursion ceiling of M-C cannot be derived, A5d.3’s drive floor cannot arm, and the crossover ' +
      'window falls back to k·f_s with nothing to reject a handover that under-protects the driver ' +
      '(measured on casus 1b: floor 1647 → 1294 Hz).',
  },
  {
    id: 'mmsG',
    label: 'M_ms',
    form: 'Setup tab → driver card → Datasheet',
    travels: 'the other half of route 1 — Bl and M_ms are needed together',
    cls: 'nice',
    emptyMeans: 'no excursion ceiling for this way, exactly as above.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: without these three the ' +
      'excursion ceiling of M-C cannot be derived, A5d.3’s drive floor cannot arm, and the crossover ' +
      'window falls back to k·f_s with nothing to reject a handover that under-protects the driver ' +
      '(measured on casus 1b: floor 1647 → 1294 Hz).',
  },
  {
    id: 'xmaxMm',
    label: 'X_max',
    form: 'Setup tab → driver card → Datasheet',
    travels: 'xmaxMm → driverCard.xMaxMm → the allowed voltage on f_s',
    cls: 'nice',
    emptyMeans: 'no excursion ceiling; the excursion per volt is still derived and shown.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: without these three the ' +
      'excursion ceiling of M-C cannot be derived, A5d.3’s drive floor cannot arm, and the crossover ' +
      'window falls back to k·f_s with nothing to reject a handover that under-protects the driver ' +
      '(measured on casus 1b: floor 1647 → 1294 Hz).',
  },
  {
    id: 'powerRating',
    label: 'Power rating (W, rated through order @ Hz)',
    form: 'Setup tab → driver card → Power rating',
    travels:
      'v2Meas[role].ratedPowerW / testFilterOrder / testFilterHz → AdapterBranch.powerRating → ' +
      'ReportSettings.driverPowerRatingByDriver → M-M (metrics/thermalLoad.ts)',
    cls: 'nice',
    emptyMeans:
      'M-M reports what this driver dissipates and judges it against nothing; the crossover floor ' +
      'then rests on the k·f_s convention or on a stated dB figure, neither of which is a ' +
      'measurement of this driver.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: without these three ' +
      'the excursion ceiling of M-C cannot be derived, A5d.3’s drive floor cannot arm, and the ' +
      'crossover window falls back to k·f_s with nothing to reject a handover that under-protects ' +
      'the driver (measured on casus 1b: floor 1647 → 1294 Hz).',
  },
  {
    id: 'minCrossover',
    label: 'Minimum crossover (Hz, at order)',
    form: 'Setup tab → driver card → Minimum crossover',
    travels:
      'v2Meas[role].minCrossoverHz / minCrossoverOrder → AdapterBranch.minCrossover → ' +
      "ReportSettings.driverMinCrossoverByDriver → the A5d.3 window floor (rule 'stated-min')",
    cls: 'nice',
    emptyMeans:
      'nothing the manufacturer said about how low this driver may be crossed reaches the window; ' +
      'its floor rests on whichever of the derived excursion ceiling, a stated dB figure and the ' +
      'k·f_s CONVENTION demands most — and on a dome that is usually the convention.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: it is the only ' +
      'generic statement a sheet makes about how low the driver may go, and without it the ' +
      'window floor is a convention (measured on casus 1b: 1294 Hz against a recommended 2200).',
  },
  {
    id: 'driveVoltageV',
    label: 'measured at (V)',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'responseDrive → driveExcursion route 2 (the independent x/V from the far field)',
    cls: 'nice',
    emptyMeans: 'route 2 stays off and says the drive voltage is not documented; route 1 is unaffected.',
    source: 'measurement',
  },
  {
    id: 'coilFamily',
    label: 'coil family',
    form: 'Drivers tab → Engine v2 — measurement',
    travels:
      'coilFamilyByModel + the loaded catalogue’s fits → the candidate’s coilDcrModel → every ' +
      'coil carries its family’s DCR, in the solver and in every gate',
    cls: 'nice',
    emptyMeans:
      'this way’s coils are lossless in every judgement, and the report says so as a deviation ' +
      'from any real build.',
    source: 'choice',
  },
  /* I-2 — THE NEAR-FIELD MERGE. Four rows, all NICE, and the class is the
   * point: without a merge everything runs, on a narrower window. What the
   * merge buys is the band BELOW the gate — on casus 1 that is the difference
   * between a woofer honest from 455 Hz and one honest from 20.5 Hz, and the
   * whole woofer-to-mid handover lives in between. The FILE it writes is what
   * makes that reach travel: from the moment it exists the branch is an
   * ordinary measurement with a stated validity, read by the path P-1 built. */
  {
    id: 'nearFieldCone',
    label: 'Load cone near field…',
    form: 'Drivers tab → driver card → Near field',
    travels:
      'the slot → mergeNearField → the merged FRD → this branch’s response → readMergeBlock / ' +
      'parseArtaHeader → declaredMergeValidity → the window floor of every pair it touches',
    cls: 'nice',
    emptyMeans:
      'no merge is possible, and this branch is honest only above its own gate — the crossover ' +
      'window starts there and the app says so.',
    source: 'measurement',
  },
  {
    id: 'nearFieldPort',
    label: 'Load port near field… (+ port Ø, shared by)',
    form: 'Drivers tab → driver card → Near field',
    travels: 'portWeight (Keele, complex) → the near-field half before the level fit',
    cls: 'nice',
    emptyMeans:
      'the merge is the cone alone. On a sealed box that is the whole radiator; on a REFLEX box ' +
      'the merge then refuses to state a validity floor at all, because at the tuning the cone is ' +
      'at its minimum and the port is carrying the output.',
    source: 'measurement',
  },
  {
    id: 'spliceBand',
    label: 'splice band (Hz)',
    form: 'Drivers tab → driver card → Near field',
    travels: 'bandOf / centreOf → mergeNearField’s level and delay fit and its crossfade',
    cls: 'nice',
    emptyMeans:
      'the app proposes the widest band both limits allow — above the far field’s own floor, below ' +
      '0.95 × ka = 1 — and shows both numbers beside it.',
    source: 'choice',
  },
  {
    id: 'mergeValidFrom',
    label: 'valid from (Hz)',
    form: 'Drivers tab → driver card → Near field',
    travels: '`Valid from` in the written block → declaredMergeValidity → this branch’s validity floor',
    cls: 'nice',
    emptyMeans:
      'derived: as far down as the near field reaches for a sealed box, and for a reflex box only ' +
      'when the port is summed in. Without the port the merge refuses rather than choosing a number.',
    source: 'choice',
  },
  {
    id: 'measuredRe',
    label: 'measured R_e',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'measuredReOhm → the A5c.1 hierarchy (above both sweep derivations) → M-E, the Q_es bound',
    cls: 'nice',
    emptyMeans: 'R_e comes from the motional fit, or from the direct low-frequency reading, and says which.',
    source: 'measurement',
  },
  {
    id: 'rotSym',
    label: 'rotationally symmetric',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'geometry.rotationallySymmetric → the M-F-final point-source assumption',
    cls: 'nice',
    emptyMeans: 'not stated — three states, and this is one of them; M-F-final says which it used.',
    source: 'choice',
  },
  {
    id: 'acousticCentre',
    label: 'acoustic centre z',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'v2Meas[role].zMm → geometry.verticalMm (in place of the baffle position)',
    cls: 'nice',
    emptyMeans: 'the cabinet position is used, which is the right number for a flush-mounted driver.',
    source: 'measurement',
  },
  {
    id: 'wiring',
    label: 'measured / intended wiring',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'AdapterBranch.wiring → the level-work report (what N in series would deliver)',
    cls: 'nice',
    emptyMeans: 'no wiring statement; a half-stated wiring is absent, and nothing is converted.',
    source: 'choice',
  },
  {
    id: 'nominalSize',
    label: 'Woofer / mid nominal size',
    form: 'Filters → Driver limits',
    travels: 'diameterInch → the beaming ceiling when S_d gives no piston diameter',
    cls: 'nice',
    emptyMeans: 'the window keeps its measured beaming ceiling, or has none and says so.',
    source: 'datasheet',
  },
  {
    id: 'catalogSnap',
    label: 'Use real catalog parts',
    form: 'Filters → Components',
    travels:
      'catalogSnap → the candidate declaration → the snap AFTER the tune; since E-4 it obeys the ' +
      'stated coil family’s own residual rather than the v1 branch budget',
    cls: 'nice',
    emptyMeans: 'the design keeps continuous values; nothing is judged against a purchasable part.',
    source: 'choice',
  },
  {
    id: 'verticalWindowDeg',
    key: 'verticalWindowDeg',
    label: 'Vertical window °',
    form: 'Filters → Engine v2',
    travels: 'ReportSettings.verticalWindowDeg → the vertical-lobing synthesis (M-F-final)',
    cls: 'nice',
    emptyMeans: 'the lobing synthesis stays off and says so. It is a column, never a gate.',
    source: 'choice',
  },
  {
    id: 'shortlistSize',
    key: 'shortlistSize',
    label: 'Shortlist size',
    form: 'Filters → Engine v2',
    travels: 'buildShortlist — how many designs the list holds, spread over topology and component space',
    cls: 'nice',
    emptyMeans: 'the published default holds; since E-4 the list says when more designs qualified than fit.',
    source: 'choice',
  },
  {
    id: 'runSeed',
    key: 'runSeed',
    label: 'Run seed',
    form: 'Filters → Engine v2',
    travels: 'DeterminismSettings.seed → the run fingerprint (A5e.4)',
    cls: 'nice',
    emptyMeans:
      'the ONE field where blank does not mean off: the published default runs and is reported, ' +
      'because “no seed” would mean “not reproducible”.',
    source: 'choice',
  },
  {
    id: 'runBudgetEvals',
    key: 'runBudgetEvals',
    label: 'Budget (evals)',
    form: 'Filters → Engine v2',
    travels: 'DeterminismSettings.budgetEvaluations → the tuner’s iteration ceiling',
    cls: 'nice',
    emptyMeans: 'the tuner’s own policy, exactly as a v1 run. A budget bounds effort, never acceptance.',
    source: 'choice',
  },
  {
    id: 'fieldMode',
    key: 'fieldMode',
    label: 'Candidate field',
    form: 'Filters → Engine v2',
    travels: 'fieldModeSettings → the chain budget and the position/alignment policies of the field',
    cls: 'nice',
    emptyMeans:
      'the exploration runs: a smaller field with the same requirements, gates and seed, and the ' +
      'shortlist says which mode made it.',
    source: 'choice',
  },
  /* ---- U-3b: THE RIG AND THE CABINET FORM -----------------------------
   * These were the gap the U-3b measurement found: twelve controls on the
   * cabinet form and the driver card that no row named at all, so nothing
   * could say what they do, and the placement rule had nothing to file them
   * under. Every one is NICE — a run happens without all of them — and five
   * carry a placement override, because a run happening is not the same as a
   * number being enterable. */
  {
    id: 'micDistance',
    label: 'Mic distance',
    form: 'Setup tab → Cabinet & measurement',
    travels:
      'cabinet.micDistanceMm → the far-field ratio and the honest-down-to line; the near-field ' +
      'merge’s far-field limit; and, with a stated drive voltage, responseDrive → M-C route 2',
    cls: 'nice',
    emptyMeans:
      'no far-field check and no honest-down-to line; the merge cannot say where its far-field ' +
      'half stops being believable; M-C’s acoustic counter-proof stays off.',
    source: 'measurement',
    placement: 'always',
    placementWhy:
      'the sentence beside it — how low these sweeps are honest — is computed FROM it, so hiding ' +
      'the field hides the answer next to it.',
  },
  {
    id: 'gateOverride',
    label: 'Gate used',
    form: 'Setup tab → Cabinet & measurement',
    travels:
      'cabinet.gateMs → the honest-down-to line, and the data floor of a response whose own file ' +
      'states no window',
    cls: 'nice',
    emptyMeans:
      'each file’s own window decides, and where none states one the floor is predicted from the ' +
      'geometry and says so.',
    source: 'measurement',
    placement: 'conditional',
    condition: 'no loaded response states a window a reader can find',
    placementWhy:
      'it is a GLOBAL stand-in for a per-file property, and A3h forbids that substitution wherever ' +
      'the property exists: once a file states a window this field can only mislead. Both demo ' +
      'bundles carried 4.5 ms here over files stating 5.021 ms, until U-3b took it out of them.',
  },
  {
    id: 'micElevation',
    label: 'Mic elevation',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.micElevationDeg → the true off-axis angle per driver and the listening angle',
    cls: 'nice',
    emptyMeans: 'the mic is taken to have stood level with the reference point, which is 0°.',
    source: 'measurement',
  },
  {
    id: 'baffleHeight',
    label: 'Front panel height',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.baffleHeightMm → the front-panel drawing and the reference-point sanity check',
    cls: 'nice',
    emptyMeans: 'the panel is not drawn to scale and a reference point deeper than the box is not caught.',
    source: 'measurement',
    placement: 'always',
    placementWhy:
      'it is the other half of the front panel: the width beside it is REQUIRED, and a form that ' +
      'asks for one and hides the other reads as an omission.',
  },
  {
    id: 'referencePoint',
    label: 'Reference point (below the top, above the floor)',
    form: 'Setup tab → Cabinet & measurement',
    travels:
      'cabinet.refFromTopMm → the origin every driver position is typed against; ' +
      'cabinet.refHeightMm → the floor-bounce prediction and the listening angle',
    cls: 'nice',
    emptyMeans:
      'driver positions are typed from the reference point instead of from the top of the panel, ' +
      'and the drawing places every driver against an origin of zero.',
    source: 'measurement',
    placement: 'always',
    placementWhy:
      'every driver position is entered as a distance below the top, and this is what that is ' +
      'measured from — without it the REQUIRED numbers beside it mean something else.',
  },
  {
    id: 'refDriver',
    label: 'Mic was aimed at',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.refDriver → which driver is the origin, and therefore whose offset is not typed',
    cls: 'nice',
    emptyMeans: 'the reference point is a spot on the baffle and every driver states its own offset.',
    source: 'measurement',
    placement: 'always',
    placementWhy: 'it decides WHICH driver positions are typed at all, so it belongs beside them.',
  },
  {
    id: 'cabinetDepth',
    label: 'Cabinet depth',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.cabinetDepthMm → the baffle width a driver on a side panel radiates from',
    cls: 'nice',
    emptyMeans: 'a side-firing driver has no panel width of its own and keeps the front baffle’s step.',
    source: 'measurement',
    placement: 'conditional',
    condition: 'a driver on this project fires off the front baffle',
    placementWhy:
      'the form’s own note already said “only needed for side-firing drivers”; a field that says ' +
      'when it is needed can say it by being there then.',
  },
  {
    id: 'listeningPosition',
    label: 'Where you listen (distance, ear height)',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.listenDistanceM / listenEarHeightMm → the seat angle off the reference axis',
    cls: 'nice',
    emptyMeans: 'the vertical spacing rules are stated in degrees rather than about your seat.',
    source: 'measurement',
  },
  {
    id: 'sourceCount',
    label: 'How many drivers, and how far apart',
    form: 'Setup tab → driver card header',
    travels:
      'cabinet.drivers[role].count / spacingMm → geometry.sourceCount + arraySpacingMm → the four ' +
      'lobing fractions and the array’s own lobing ceiling; the count also carries the wiring',
    cls: 'nice',
    emptyMeans:
      'the branch is read as one radiator: no array lobing ceiling, and the lobing fractions fall ' +
      'back to a single source per way. Never a default of one — unknown is unknown (P4).',
    source: 'measurement',
    placement: 'always',
    placementWhy:
      'it is part of the branch’s identity and it changes what the position beside it MEANS — one ' +
      'cone at y, or two cones straddling it.',
  },
  {
    id: 'mounting',
    label: 'Mounting (panel, depth behind the baffle, tilt)',
    form: 'Setup tab → driver card',
    travels:
      'cabinet.drivers[role].facing / depthMm / tiltDeg / opposed → the true off-axis angle, the ' +
      'panel a driver radiates from, and the app’s own measured-depth cross-check',
    cls: 'nice',
    emptyMeans:
      'the driver is taken to fire forward from the front baffle with its acoustic centre in the ' +
      'baffle plane. The engine’s geometry reads the acoustic centre from the A5a block, not here.',
    source: 'measurement',
  },
  {
    id: 'chamber',
    label: 'Chamber (sealed / ported, and its corner)',
    form: 'Setup tab → driver card',
    travels: 'cabinet.drivers[role].enclosure / fbHz → what the box itself already filters, and the excursion warning',
    cls: 'nice',
    emptyMeans:
      'the box behind this driver is unknown and nothing is assumed; the impedance sweep still ' +
      'proposes the corner it measures, with a button to take it.',
    source: 'measurement',
  },
  {
    id: 'manualWindow',
    label: 'Window (no header)',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'v2Meas[role].refTimeMs / rightWindowMs / floorHz → AdapterBranch.manualWindow → validity.ts',
    cls: 'nice',
    emptyMeans:
      'the file’s own header decides, which is what it is for. A FALLBACK and never an override: ' +
      'nothing typed here can relax a window a file states (A5b.1(i)).',
    source: 'measurement',
    placement: 'conditional',
    condition: 'a loaded response on this branch states no window a reader can find',
    placementWhy:
      'it answers a case that mostly does not exist, and a permanently visible fallback invites ' +
      'someone to type a window over a file that already states one.',
  },
  {
    id: 'xo3Steps',
    label: 'Points per axis / handover candidates',
    form: 'Filters → Crossover',
    travels: 'scanSteps3 → fieldModeSettings(full) → chainBudget = steps^pairs',
    cls: 'nice',
    emptyMeans:
      'read by the FULL field only; an exploration uses its own chain budget and ignores this number.',
    source: 'choice',
  },
];

/* ==================================================================== *
 * 4 — V1 LEGACY: the v2 route does not read it
 * ==================================================================== */

const V1_LEGACY: readonly V2InputRow[] = [
  {
    id: 'errorSmoothOct',
    label: 'Error smoothing',
    form: 'Filters → Goals & weighting',
    travels:
      'settings.errorSmoothOct → OVERWRITTEN by the candidate, which states SEARCH_SMOOTHING_OCTAVES ' +
      'unconditionally (declareCandidateChoices) and, on the two-way route, writes it back into the ' +
      'chain settings (withDeclaredSearchSmoothing)',
    cls: 'v1-legacy',
    emptyMeans: 'not applicable: the v2 route states its own width whatever this holds.',
    source: 'choice',
    v1Note:
      'v1 — not read by Engine v2 since V38-fix: the candidate states the search-smoothing width ' +
      'itself (0 — the summed curve every judgement reads). It is read only in the fallback where ' +
      'no A5d.3 window could be derived and no declaration travels.',
  },
  {
    id: 'hpLpPref',
    label: 'HP/LP preference (low xo / high xo)',
    form: 'Filters → Filter shape',
    travels:
      'settings.structureLow/structureHigh → OVERRIDDEN per candidate by the alignment A5d.3 ' +
      'derived (chainInputFor: alignmentOf(i) ?? settings.structureLow)',
    cls: 'v1-legacy',
    emptyMeans: 'not applicable: the candidate brings its own alignment and order.',
    source: 'choice',
    v1Note:
      'v1 — not read by Engine v2 since F4d: the candidate field derives the alignment and the ' +
      'order per handover, and the candidate overrides this. It applies only in the fallback where ' +
      'no A5d.3 window could be derived.',
  },
  {
    id: 'scan3Mode',
    label: 'Scan strategy',
    form: 'Filters → Crossover',
    travels: 'skipped on the v2 route, with a note in the run notes',
    cls: 'v1-legacy',
    emptyMeans: 'not applicable.',
    source: 'choice',
    v1Note:
      'v1 — not read by Engine v2: the axis-by-axis sweep is a v1 way of GENERATING candidates, ' +
      'and on the v2 route the field comes from A5d. The run says so out loud when it skips it.',
  },
  {
    id: 'bomCapEur',
    label: 'BOM cap per channel',
    form: 'Filters → Targets',
    travels: 'rankChain3Results → the v1 scan TABLE only; it reaches no gate and no shortlist',
    cls: 'v1-legacy',
    emptyMeans: 'not applicable to the shortlist.',
    source: 'choice',
    v1Note:
      'v1 — not read by Engine v2’s shortlist: it orders the v1 scan table beside it. No v2 ' +
      'requirement, gate or budget reads a price.',
  },
  {
    id: 'excursionSpl',
    label: 'Design for … dB',
    form: 'Filters → Driver limits',
    travels: 'excursionFloorHz → the v1 physics window floor; the v2 window floor is M-C v2.0’s ceiling',
    cls: 'v1-legacy',
    emptyMeans: 'not applicable.',
    source: 'choice',
    /* THE SENTENCE HAS ONE HOME AND TWO READERS. E-2 gave this field its note
     * before the register existed and `v2Settings.test.ts` pins both the
     * function and its call site in `App.tsx`; re-typing the words here would
     * be a second copy that can drift. So the drawer and the field say the
     * same thing because they read the same function. `designLevelNote(true)`
     * is non-null by construction — it returns null only on the v1 route. */
    v1Note: designLevelNote(true)!,
  },
];

/* ==================================================================== *
 * The register, and the readers
 * ==================================================================== */

/** Every input, in class order. */
export const V2_INPUT_REGISTER: readonly V2InputRow[] = Object.freeze([
  ...REQUIRED,
  ...JUDGEMENT,
  ...NICE,
  ...V1_LEGACY,
]);

/** The judgement rows with the sub-heading each sits under. */
export const V2_JUDGEMENT_ROWS: readonly (V2InputRow & { band: V2JudgementBand })[] =
  Object.freeze([...JUDGEMENT]);

/** The sub-headings of the judgement group, in order. */
export const V2_JUDGEMENT_BANDS: readonly V2JudgementBand[] = [
  'gates',
  'budgets',
  'requirements',
  'voicing',
];

/** The heading the panel puts on each class. The wording IS the explanation. */
export const V2_CLASS_HEADING: Readonly<Record<V2InputClass, string>> = Object.freeze({
  required: 'Engine v2 — 1. necessary (no run without it)',
  judgement: 'Engine v2 — 2. judgement (a limit exists only because you state it)',
  nice: 'Engine v2 — 3. nice to have (enriches, never blocks)',
  'v1-legacy': 'v1 (not read by Engine v2)',
});

/** The rows of one class, in register order. */
export const rowsOfClass = (cls: V2InputClass): readonly V2InputRow[] =>
  V2_INPUT_REGISTER.filter((r) => r.cls === cls);

/** The row for a form field, or undefined when the key has none. */
export const rowForKey = (key: V2SettingKey): V2InputRow | undefined =>
  V2_INPUT_REGISTER.find((r) => r.key === key);

/**
 * The help beside an EMPTY field: what happens because it is blank.
 *
 * Only shown when the field is empty, and that is the whole design: a filled
 * panel says nothing it does not have to, and a blank field says exactly what
 * its blankness costs. P4 at the screen rather than only in the engine.
 */
export const emptyHelpFor = (key: V2SettingKey): string | null =>
  rowForKey(key)?.emptyMeans ?? null;

/**
 * The note beside a v1 control on the v2 route, or null on v1.
 *
 * Null on v1 for the same reason `designLevelNote` is: with the flag off the
 * field is what it always was, and the toggle invariant is about behaviour the
 * designer sees as well as about bytes in a netlist.
 */
export const v1NoteFor = (id: string, engineV2Enabled: boolean): string | null => {
  if (!engineV2Enabled) return null;
  return V2_INPUT_REGISTER.find((r) => r.id === id && r.cls === 'v1-legacy')?.v1Note ?? null;
};

/**
 * THE MINIMAL SET — the shortest route to a first exploration.
 *
 * Not a new rule and not a relaxation: it is the REQUIRED class plus one
 * stated amplifier floor, which is the smallest set that both produces a
 * candidate field and has anything at all judge the result. Everything else
 * blank means everything else reports without judging, and the panel and the
 * shortlist say so per row.
 */
export const V2_MINIMAL_SET: readonly string[] = Object.freeze([
  ...REQUIRED.map((r) => r.id),
  'ampMinLoadOhm',
]);

/**
 * E-2's `V2_JUDGEMENT_KEYS` and this register's `judgement` class are two
 * different questions, and the difference is NAMED rather than smoothed over.
 *
 * `V2_JUDGEMENT_KEYS` is the GHOST rule: which fields may not show a number
 * they do not hold. `cls: 'judgement'` is this register's question: which
 * fields ARM something. Two of E-2's keys are on that list for the first
 * reason and not the second — a reporting scale whose ghost would read as a
 * value — and one of them turns out to arm a gate after all:
 *
 *   · `amplifierPowerW` — a reporting scale AND, since V51, the power
 *     M-A/part is judged at unless a thermal power is stated. Filed as
 *     JUDGEMENT here, which is the stricter of the two readings.
 *   · `verticalWindowDeg` — the vertical-lobing synthesis is a column and has
 *     never been a gate (V20a's blijvend verbod). Filed as NICE.
 *
 * So this is the whole of the disagreement, written out, and the test pins the
 * set rather than a count.
 */
export const GHOST_KEYS_FILED_AS_NICE: readonly V2SettingKey[] = ['verticalWindowDeg'];

/**
 * THE ONE JUDGEMENT FIELD WHERE BLANK DOES NOT DISARM ANYTHING.
 *
 * Every other judgement row means "nothing judges this" when it is blank.
 * `resistorThermalPowerW` does not: blank DEFERS — M-A/part then judges at the
 * amplifier's continuous power (V50's behaviour, which V51 left standing), and
 * the gate row says which power it read. That is still P4 — nothing is
 * invented, and the reader is told — but it is a different sentence, so it is
 * named here rather than paraphrased into the shape of the others.
 */
export const JUDGEMENT_KEYS_WHERE_BLANK_DEFERS: readonly V2SettingKey[] = [
  'resistorThermalPowerW',
];

/** Every settings key of the form that has no row here. Should be empty. */
export const settingKeysWithoutRow = (keys: readonly V2SettingKey[]): V2SettingKey[] =>
  keys.filter((k) => rowForKey(k) === undefined);

/* ==================================================================== *
 * U-3b — WHERE EACH FIELD IS SHOWN, AND WHICH FORMS THIS RULE GOVERNS
 * ==================================================================== */

/**
 * The placement a row's CLASS implies. Required and judgement are shown
 * because a run cannot start without the first and nothing judges without the
 * second; nice and v1-legacy are not, because neither is needed to build a
 * filter — which is the whole of Sander's rule (09-09-2026).
 */
export const PLACEMENT_BY_CLASS: Readonly<Record<V2InputClass, V2InputPlacement>> = Object.freeze({
  required: 'always',
  judgement: 'always',
  nice: 'more',
  'v1-legacy': 'more',
});

/** Where a row is shown: its own decision if it made one, else its class's. */
export const placementOf = (row: V2InputRow): V2InputPlacement =>
  row.placement ?? PLACEMENT_BY_CLASS[row.cls];

/** The heading of the one "more" disclosure each governed form carries. */
export const V2_MORE_HEADING = 'more — enriches the judgement, not needed to build a filter';

/** The forms this placement rule governs. */
export type V2GovernedForm = 'cabinet' | 'driver-card' | 'v2-panel';
export const V2_GOVERNED_FORMS: readonly V2GovernedForm[] = ['cabinet', 'driver-card', 'v2-panel'];

/** One control in a governed form: which row it belongs to, and the token that
 *  identifies it in `App.tsx`. The guard scans for exactly these. */
export interface V2FormField {
  row: string;
  form: V2GovernedForm;
  /** A source fragment unique to this control, e.g. `value={d.count}`. */
  control: string;
}

/**
 * EVERY CONTROL OF THE GOVERNED FORMS, filed under the row it serves.
 *
 * This is the drift guard Sander asked for, and it works in BOTH directions:
 * every token here must occur in `App.tsx`, and every `<input>`/`<select>` in
 * a governed region must be one of these tokens. A field added to one of these
 * forms without a register row and a placement decision therefore fails the
 * build rather than quietly joining the default view — the I-1 shape of
 * `p6Lint`, one layer up.
 *
 * The cabinet form's inputs are produced by one helper (`veld`), so its tokens
 * are the CALL SITES (`cab('micDistanceMm')`) rather than the `<input>` tags.
 */
export const V2_FORM_FIELDS: readonly V2FormField[] = Object.freeze([
  // ---- Setup tab → Cabinet & measurement ----
  { row: 'micDistance', form: 'cabinet', control: "cab('micDistanceMm')" },
  { row: 'micElevation', form: 'cabinet', control: "cab('micElevationDeg')" },
  { row: 'gateOverride', form: 'cabinet', control: "cab('gateMs')" },
  { row: 'refDriver', form: 'cabinet', control: 'value={cabinet.refDriver}' },
  { row: 'baffle-width', form: 'cabinet', control: "cab('baffleWidthMm')" },
  { row: 'baffleHeight', form: 'cabinet', control: "cab('baffleHeightMm')" },
  { row: 'cabinetDepth', form: 'cabinet', control: "cab('cabinetDepthMm')" },
  { row: 'referencePoint', form: 'cabinet', control: 'refTopVeld()' },
  { row: 'referencePoint', form: 'cabinet', control: "cab('refHeightMm')" },
  { row: 'listeningPosition', form: 'cabinet', control: "cab('listenDistanceM')" },
  { row: 'listeningPosition', form: 'cabinet', control: "cab('listenEarHeightMm')" },
  // ---- Setup tab → driver card ----
  { row: 'sourceCount', form: 'driver-card', control: 'value={d.count}' },
  { row: 'sourceCount', form: 'driver-card', control: 'value={d.spacingMm}' },
  { row: 'positions', form: 'driver-card', control: 'value={d.xMm}' },
  { row: 'positions', form: 'driver-card', control: 'yMm: String(Math.round(' },
  { row: 'mounting', form: 'driver-card', control: 'value={d.facing}' },
  { row: 'mounting', form: 'driver-card', control: 'value={d.depthMm}' },
  { row: 'mounting', form: 'driver-card', control: 'value={d.tiltDeg}' },
  { row: 'mounting', form: 'driver-card', control: 'checked={d.opposed}' },
  { row: 'chamber', form: 'driver-card', control: 'value={d.enclosure}' },
  { row: 'chamber', form: 'driver-card', control: 'value={d.fbHz}' },
  { row: 'sd', form: 'driver-card', control: 'value={sdCm2[role]}' },
  { row: 'xmaxMm', form: 'driver-card', control: 'value={xmaxMm[role]}' },
  { row: 'acousticCentre', form: 'driver-card', control: 'value={v2Meas[role].zMm}' },
  { row: 'rotSym', form: 'driver-card', control: 'value={v2Meas[role].rotSym}' },
  { row: 'measuredRe', form: 'driver-card', control: 'value={v2Meas[role].reOhm}' },
  { row: 'blTm', form: 'driver-card', control: 'value={v2Meas[role].blTm}' },
  { row: 'mmsG', form: 'driver-card', control: 'value={v2Meas[role].mmsG}' },
  { row: 'driveVoltageV', form: 'driver-card', control: 'value={v2Meas[role].driveVoltageV}' },
  { row: 'powerRating', form: 'driver-card', control: 'value={v2Meas[role].ratedPowerW}' },
  { row: 'powerRating', form: 'driver-card', control: 'value={v2Meas[role].testFilterOrder}' },
  { row: 'powerRating', form: 'driver-card', control: 'value={v2Meas[role].testFilterHz}' },
  { row: 'minCrossover', form: 'driver-card', control: 'value={v2Meas[role].minCrossoverHz}' },
  { row: 'minCrossover', form: 'driver-card', control: 'value={v2Meas[role].minCrossoverOrder}' },
  { row: 'driveOnFsMaxDb-per-way', form: 'driver-card', control: 'value={v2Meas[role].driveOnFsMaxDb}' },
  { row: 'wiring', form: 'driver-card', control: 'value={v2Meas[role].wiringMeasured}' },
  { row: 'wiring', form: 'driver-card', control: 'value={v2Meas[role].wiringDesired}' },
  { row: 'coilFamily', form: 'driver-card', control: 'value={v2Meas[role].coilFamily}' },
  { row: 'manualWindow', form: 'driver-card', control: 'value={v2Meas[role].refTimeMs}' },
  { row: 'manualWindow', form: 'driver-card', control: 'value={v2Meas[role].rightWindowMs}' },
  { row: 'manualWindow', form: 'driver-card', control: 'value={v2Meas[role].floorHz}' },
  { row: 'manualWindow', form: 'driver-card', control: 'value={v2Meas[role].windowNote}' },
  // ---- Filters → ⚙ Settings → the Engine v2 block ----
  { row: 'minEpdrOhm', form: 'v2-panel', control: 'value={engineV2Settings.minEpdrOhm}' },
  { row: 'maxDissipationPct', form: 'v2-panel', control: 'value={engineV2Settings.maxDissipationPct}' },
  { row: 'maxDriveOnFsDb', form: 'v2-panel', control: 'value={engineV2Settings.maxDriveOnFsDb}' },
  { row: 'amplifierPeakPowerW', form: 'v2-panel', control: 'value={engineV2Settings.amplifierPeakPowerW}' },
  { row: 'amplifierNominalLoadOhm', form: 'v2-panel', control: 'value={engineV2Settings.amplifierNominalLoadOhm}' },
  { row: 'xmaxMarginFraction', form: 'v2-panel', control: 'value={engineV2Settings.xmaxMarginFraction}' },
  { row: 'amplifierPowerW', form: 'v2-panel', control: 'value={engineV2Settings.amplifierPowerW}' },
  { row: 'resistorClassW', form: 'v2-panel', control: 'value={engineV2Settings.resistorClassW}' },
  { row: 'resistorPowerMargin', form: 'v2-panel', control: 'value={engineV2Settings.resistorPowerMargin}' },
  { row: 'coilClassA', form: 'v2-panel', control: 'value={engineV2Settings.coilClassA}' },
  { row: 'resistorThermalPowerW', form: 'v2-panel', control: 'value={engineV2Settings.resistorThermalPowerW}' },
  { row: 'lowestWayLevelWork', form: 'v2-panel', control: 'value={engineV2Settings.lowestWayLevelWork}' },
  { row: 'lowestWaySeriesRMaxOhm', form: 'v2-panel', control: 'value={engineV2Settings.lowestWaySeriesRMaxOhm}' },
  { row: 'lfBumpBudgetDb', form: 'v2-panel', control: 'value={engineV2Settings.lfBumpBudgetDb}' },
  { row: 'qesMultiplierMax', form: 'v2-panel', control: 'value={engineV2Settings.qesMultiplierMax}' },
  { row: 'dampingMarginDb', form: 'v2-panel', control: 'value={engineV2Settings.dampingMarginDb}' },
  { row: 'splWindowPlusMinusDb', form: 'v2-panel', control: 'value={engineV2Settings.splWindowPlusMinusDb}' },
  { row: 'maxPhaseTrackingDeg', form: 'v2-panel', control: 'value={engineV2Settings.maxPhaseTrackingDeg}' },
  { row: 'targetCurve', form: 'v2-panel', control: 'value={activeTargetCurve.type}' },
  { row: 'plateauDepthDb', form: 'v2-panel', control: 'String(activeTargetCurve.plateauDepthDb)' },
  { row: 'verticalWindowDeg', form: 'v2-panel', control: 'value={engineV2Settings.verticalWindowDeg}' },
  { row: 'shortlistSize', form: 'v2-panel', control: 'value={engineV2Settings.shortlistSize}' },
  { row: 'runSeed', form: 'v2-panel', control: 'value={engineV2Settings.runSeed}' },
  { row: 'runBudgetEvals', form: 'v2-panel', control: 'value={engineV2Settings.runBudgetEvals}' },
  { row: 'fieldMode', form: 'v2-panel', control: 'value={fieldModeOf(engineV2Settings.fieldMode)}' },
]);

/**
 * The v2-reachable rows whose FORM this rule does not govern yet, by name.
 *
 * Not an oversight and not a loophole: each of these lives outside the three
 * governed forms — in the Import tab's own file slots, or in a Filters section
 * that predates the v2 panel and holds v1 controls beside it — so moving them
 * is a form redesign rather than a placement decision. They keep their
 * register row, their empty-field help and (where they have one) their v1
 * badge. A NAME rather than a count, for the V47/V48 reason: a complement
 * grows with the register and stops being a claim.
 */
export const V2_UNGOVERNED_ROWS: readonly string[] = Object.freeze([
  // measurements and files, not settings: the Import tab's own slots
  'responses', 'validity', 'impedance', 'ways',
  'nearFieldCone', 'nearFieldPort', 'spliceBand', 'mergeValidFrom',
  // Filters sections older than the v2 panel
  'nominalSize', 'catalogSnap', 'xo3Steps',
  /* The amplifier floor is a JUDGEMENT row and it IS shown — but it lives in
   * "Goals & weighting", above the v2 block, because it predates it. Worth
   * noting rather than moving: it is the one judgement input of the minimal
   * set, and the only one not beside the gates it arms. */
  'ampMinLoadOhm',
  // the five v1 controls, each already badged where it stands (U-1)
  'errorSmoothOct', 'hpLpPref', 'scan3Mode', 'bomCapEur', 'excursionSpl',
]);
