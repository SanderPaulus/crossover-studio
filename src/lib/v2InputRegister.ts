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

import { BREAKUP_DIVISOR_PROTOCOL } from './breakupDivisorProtocol.ts';
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

/**
 * U-9 — WHAT A FIELD MEASURABLY DOES, as data beside what it is.
 *
 *   'zoekt'    — it changes the v2 request or its fingerprint: which networks
 *                can come out (the field, the declaration, the tuner, a gate,
 *                a budget, a measured fact).
 *   'oordeelt' — it changes only a verdict: a gate status, a metric, a
 *                shortlist requirement.
 *   'toont'    — it changes only a chart, a sorting or what is displayed.
 *   'niets'    — no measurable effect on any v2 route. Such a row is NEVER
 *                rendered, in any mode; its value stays in the project file.
 *
 * Filled from the U-9 phase-0 measurement (`scripts/measure-u9-field-effects.ts`,
 * `docs/U-9_veldinventaris.md`), as the class a field has WHEN ITS PARENT IS
 * SET: a field that does nothing only because its parent is off is not a
 * 'niets' field (startprompt, point 5). Where a field differs per route, the
 * strongest route decides and the inventory names the others.
 */
export type V2InputEffect = 'zoekt' | 'oordeelt' | 'toont' | 'niets';

/**
 * U-9 fase 2 — WHERE A FIELD BELONGS IN THE ORDER OF DESIGNING.
 *
 * Eight groups, and the ORDER is data (`V2_FIELD_GROUPS`): the Filters panel
 * maps over this list and types no order of its own. Architecture comes first
 * because it decides WHAT is designed before anything judges it (the H-2
 * rule); run & shortlist comes last because it is how you look at the answer.
 * There is deliberately no v1 group (B-2): a field that steers the v2 search
 * is filed where its effect places it, and what serves only v1 is not shown.
 *
 * A field that belongs to a measurement (Setup, the driver card, the Network
 * tab, the chart range) STAYS where it is filled in — moving it would put one
 * field in two places, the U-3b failure — and its row still names its group,
 * so the panel can say "on the driver card" under the right heading.
 */
export type V2FieldGroup =
  | 'architecture'
  | 'measurement'
  | 'amplifier'
  | 'protection'
  | 'crossover'
  | 'buildability'
  | 'voicing'
  | 'run';

/** The groups in the order of designing. The panel reads this and nothing else. */
export const V2_FIELD_GROUPS: readonly V2FieldGroup[] = Object.freeze([
  'architecture',
  'measurement',
  'amplifier',
  'protection',
  'crossover',
  'buildability',
  'voicing',
  'run',
]);

/** The heading the panel puts on each group. */
export const V2_GROUP_HEADING: Readonly<Record<V2FieldGroup, string>> = Object.freeze({
  architecture: 'Architecture — which ways, and which of them the passive network drives',
  measurement: 'Measurements & geometry',
  amplifier: 'Amplifier & load',
  protection: 'Driver protection',
  crossover: 'Crossover window & topology',
  buildability: 'Buildability',
  voicing: 'Target curve & voicing',
  run: 'Run & shortlist',
});

/** One input, as it is written below; `group` is attached from `GROUP_OF`. */
export type V2InputRowDef = Omit<V2InputRow, 'group'>;

/** One input, with everything a reader needs to act on it. */
export interface V2InputRow {
  /** U-9 fase 2 — the group it belongs to (`V2_FIELD_GROUPS`). */
  group: V2FieldGroup;
  /**
   * U-9 — a measured qualification of `effect` that the badge must say,
   * because the effect alone would mislead (N1: the tuner reads the Priority
   * slider and the design step does not). Never a v1 note.
   */
  effectNote?: string;
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
  /** U-9 — what the field measurably does (see `V2InputEffect`). */
  effect: V2InputEffect;
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

const REQUIRED: readonly V2InputRowDef[] = [
  {
    id: 'responses',
    label: 'On-axis response per way (FRD)',
    form: 'Drivers tab — measurement slots',
    travels:
      'parseFrd → AdapterBranch.onAxis → ingest → report.predesign.windowInputs → buildCandidateField',
    cls: 'required',
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
    emptyMeans:
      'no c-t-c, so no lobing zone and no vertical-lobing synthesis; the window keeps its other ' +
      'limits and says the spacing is unknown.',
    source: 'measurement',
  },
  {
    id: 'sd',
    label: 'S_d per driver',
    form: 'Setup tab → driver card',
    travels:
      'sdCm2 → AdapterBranch.driverCard.sdCm2 → M-C route 2 (only with a documented drive voltage ' +
      'and mic distance) and the excursion card. U-9 (N4, measured): the beaming ceiling in engine2 ' +
      'reads the NOMINAL diameter (nominalSize), not S_d; S_d ×2 on the tweeter moved nothing in the ' +
      'report of either demo, with or without a network. Filed as REQUIRED since I-1; that class is ' +
      'not changed without a measurement that argues it.',
    cls: 'required',
    effect: 'oordeelt',
    emptyMeans:
      'M-C route 2 has no cone area and stays off with a reason; on the v2 route that is all a ' +
      'blank S_d costs (U-9, N4).',
    source: 'datasheet',
  },
  {
    id: 'baffle-width',
    label: 'Baffle width',
    form: 'Setup tab → Cabinet & drivers',
    travels: 'cabinet.baffleWidthMm → geometry.baffleWidthMm → the baffle step → the target curve transition',
    cls: 'required',
    effect: 'oordeelt',
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
export type V2JudgementBand = 'architecture' | 'gates' | 'budgets' | 'requirements' | 'voicing';

const JUDGEMENT: readonly (V2InputRowDef & { band: V2JudgementBand })[] = [
  /* ---- H-2: WHAT THE DESIGN IS, before anything judges it ----------------
   *
   * A band of its own, and first, because these three answer a question that
   * comes BEFORE every gate and every budget: which ways the passive network
   * carries at all. A gate says how good a design has to be; this says which
   * design is being made. Filed as JUDGEMENT rather than NICE because blank is
   * an absence with consequences a designer has to be told about — with the
   * tick the lowest way leaves the network, the way above it gains a high-pass
   * ladder, and every sum the run is judged on contains a branch that is not in
   * the netlist. `lowestWayLevelWork` is the nearest relative and sits two
   * bands down for the same reason. */
  {
    id: 'activeSideOn',
    key: 'activeSideOn',
    label: 'Hybrid mode',
    form: 'Filters → Engine v2',
    travels:
      'engineV2Settings.activeSideOn → activeSideStatement → ReportSettings.activeHandover AND the ' +
      'chain declaration’s seventh key (activeSide) → the design step, both searches and the ' +
      'synthesis. H-2b: the FORM follows from what is measured — three measured ways model the ' +
      'active side (H-1), two measured ways give the lowest passive way its flank target and judge ' +
      'no sum (the lean form)',
    cls: 'judgement',
    effect: 'zoekt',
    band: 'architecture',
    emptyMeans:
      'no hybrid: every measured way is part of the passive network, nothing is modelled, and the ' +
      'run is exactly the run it has always been.',
    source: 'choice',
  },
  {
    id: 'activeHandoverHz',
    key: 'activeHandoverHz',
    label: 'Handover(s) to the active side (Hz)',
    form: 'Filters → Engine v2 (shown once Hybrid mode is ticked)',
    travels:
      'parsed under the H-2b grammar (decimal comma or point; semicolon or space between values; an ' +
      'ambiguous comma is refused) → one RUN of the passive field per stated handover, and ' +
      'ActiveHandover.hz in the report and the chain declaration',
    cls: 'judgement',
    effect: 'zoekt',
    band: 'architecture',
    emptyMeans:
      'no handover is stated, so there is nothing to design towards: the active side realises its ' +
      'filter in a processor, so the app cannot search for that handover — it has to be told.',
    source: 'choice',
  },
  {
    id: 'activeHandoverShape',
    key: 'activeHandoverShape',
    label: 'Acoustic target shape of the handover',
    form: 'Filters → Engine v2 (shown once Hybrid mode is ticked)',
    travels:
      'ActiveHandover.kind and .order → the high-pass the passive way must reach AND the low-pass ' +
      'the DSP must reach — one stated shape, read twice',
    cls: 'judgement',
    effect: 'zoekt',
    band: 'architecture',
    emptyMeans:
      'no shape is stated, so neither flank has an alignment to meet and nothing is designed towards.',
    source: 'choice',
  },
  {
    /* H-3b — THE FLANK-ERROR BUDGET. Judgement, in the architecture band with
     * the three fields it refines: it is a requirement ON the stated handover
     * (how far the lowest passive way's realised flank may stray from the
     * stated shape), and a hybrid without it is the hybrid H-3 measured — the
     * tune reaches its own ripple goal and moves the flank 0.84 → 3.7 dB rms
     * away from its target, with nothing to say no. Stated, it is a hard
     * requirement on every delivered or tuned network of a hybrid run, on the
     * shortlist and on the Network tab's ⚙ tune through ONE reader; the tuner
     * carries the same number as a wall in its objective. */
    id: 'activeFlankBudgetDbRms',
    key: 'activeFlankBudgetDbRms',
    label: 'Flank-error budget (dB rms over the handover band)',
    form: 'Filters → Engine v2 (shown once Hybrid mode is ticked)',
    travels:
      'activeSideStatement.flankBudgetDbRms → ActiveHandover.flankBudgetDbRms (the stated block, one ' +
      'carrier) → the report’s flankVerdict (the Flank chip), the chain declaration’s activeSide value → ' +
      'NetOptimizeOptions.flankBudget (a wall in the tuner’s objective) and runCandidate’s refusal ' +
      '(by: stated-flank-budget, kinds: budget) on every delivered or tuned network',
    cls: 'judgement',
    effect: 'zoekt',
    band: 'architecture',
    emptyMeans:
      'no budget: the target-flank error is measured and reported on every hybrid run, and nothing ' +
      'judges it — a tune may move the flank away from the stated shape while meeting its own ripple goal ' +
      '(H-3 measured 0.84 → 3.7 dB rms).',
    source: 'choice',
  },
  {
    id: 'ampMinLoadOhm',
    label: 'Amplifier min load',
    form: 'Filters → Goals & weighting',
    travels: 'ampMinLoadOhm → gateSettingsFor → GateSettings.ampMinLoadOhm → M-B/|Z| and the barrier',
    cls: 'judgement',
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'oordeelt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'oordeelt',
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
    effect: 'oordeelt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
    band: 'voicing',
    emptyMeans: 'the curve produces no offsets at all and says which half was missing.',
    source: 'choice',
  },
];

/* ==================================================================== *
 * 3 — NICE TO HAVE: enriches, never blocks
 * ==================================================================== */

/** U-9 fase 2 — the placement override of a field that steers the search on an
 *  app start value. Shared with `STEERS_ON_APP_DEFAULT` below. */
const STEERS_ON_APP_DEFAULT_PLACEMENT = {
  placement: 'always' as const,
  placementWhy:
    'it steers the v2 search on an app start value nobody stated (U-9, N2), and P4 asks such a ' +
    'value to stay in view and say what it is rather than sit behind a fold.',
};

const NICE: readonly V2InputRowDef[] = [
  {
    id: 'blTm',
    label: 'Bl',
    form: 'Setup tab → driver card → Datasheet',
    travels: 'v2Meas[role].blTm → driverCard → driveExcursion route 1 (x/V on the resonance)',
    cls: 'nice',
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'oordeelt',
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
    form: 'Setup tab → driver card → Recommended range',
    travels:
      'v2Meas[role].minCrossoverHz / minCrossoverOrder → AdapterBranch.minCrossover → ' +
      "ReportSettings.driverMinCrossoverByDriver → the A5d.3 window floor (rule 'stated-min')",
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'nothing the manufacturer said about how low this driver may be crossed reaches the window; ' +
      'its floor rests on whichever of the derived excursion ceiling, a stated dB figure and the ' +
      'k·f_s CONVENTION demands most — and on a dome that is usually the convention. That ' +
      'convention is worth about 9.5–12.2 dB of attenuation at the resonance, LOOSER than the ' +
      '18 dB the trade rule asks for, so where nothing is stated the window takes the more ' +
      'permissive of two published rules (H-4b; the figures are derived from ' +
      'XO_FS_FACTOR_BY_ORDER by fsConventionDbRange and pinned against it).',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: it is the only ' +
      'generic statement a sheet makes about how low the driver may go, and without it the ' +
      'window floor is a convention (measured on casus 1b: 1294 Hz against a recommended 2200).',
  },
  {
    id: 'maxCrossover',
    label: 'Maximum crossover (Hz)',
    form: 'Setup tab → driver card → Recommended range',
    travels:
      'v2Meas[role].maxCrossoverHz → AdapterBranch.maxCrossover → ' +
      "ReportSettings.driverMaxCrossoverByDriver → the A5d.3 window ceiling (rule 'stated-max')",
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'nothing the manufacturer said about how HIGH this driver may be crossed reaches the window; ' +
      'its ceiling rests on whichever of the breakup derivation and the beaming limit is stricter — ' +
      'and the breakup one divides by a ramp that has never been measured.',
    source: 'datasheet',
    placement: 'always',
    placementWhy:
      'a number the designer copies off a spec sheet is GENERIC data every project has, so ' +
      'hiding it is the one placement that costs a newcomer something real: it is the other end ' +
      'of the line the minimum crossover is read off, and it sits in the same row.',
  },
  {
    id: 'maxCrossoverOverride',
    label: 'the datasheet ceiling replaces the breakup derivation',
    form: 'Setup tab → driver card → Recommended range',
    travels:
      'v2Meas[role].maxCrossoverOverride → AdapterBranch.maxCrossover.overridesBreakup → ' +
      'the breakup limit is REPORTED and does not bind (XoLimit.superseded)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'off, which is the only state nothing can put you in by accident: the stated ceiling is read ' +
      'beside the derived ones and the strictest binds, exactly like every other limit.',
    source: 'choice',
    placement: 'conditional',
    placementWhy:
      'without a stated maximum crossover for this driver there is nothing to overrule, and a ' +
      'permanently visible switch that does nothing invites someone to reach for it.',
    condition: 'only while this driver states a maximum crossover',
  },
  {
    id: 'breakupDivisor',
    label: 'breakup divisor, measured (+ when and how)',
    form: 'Drivers tab → driver card → more',
    travels:
      'v2Meas[role].breakupDivisor → AdapterBranch.breakupDivisor → ' +
      'ReportSettings.driverBreakupDivisorByDriver → the breakup ceiling, and its UNCALIBRATED mark',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'the ceiling divides the breakup by an interpolation between two published endpoints, and ' +
      'says of itself that the ramp between them is uncalibrated (V9). ' +
      BREAKUP_DIVISOR_PROTOCOL,
    source: 'measurement',
  },
  {
    /* H-2b — the processor's latency on the active side. NICE: a hybrid run
     * happens without it and the DSP block then prints the delay unsubtracted
     * and says the latency is not stated; with it, the delay to dial in has it
     * taken off and named apart. CONDITIONAL: only while Hybrid mode is ticked,
     * because a latency field on a fully passive project answers a case that
     * does not exist. */
    id: 'activeProcessorLatencyMs',
    key: 'activeProcessorLatencyMs',
    label: 'Processor latency on the active side (ms)',
    form: 'Filters → Engine v2 (shown once Hybrid mode is ticked)',
    travels: 'dspTargetBlock({ processorLatencyMs }) → subtracted from the delay to dial in, named apart',
    cls: 'nice',
    effect: 'toont',
    emptyMeans:
      'the delay in the DSP target block is printed WITHOUT the processor’s own latency, and the block ' +
      'says so; the FA251 with an analogue input is about 0.35 ms.',
    source: 'nameplate',
    placement: 'conditional',
    placementWhy:
      'it only means anything beside a stated active side; on a fully passive project a latency field ' +
      'answers a case that does not exist.',
    condition: 'only while Hybrid mode is ticked',
  },
  {
    id: 'driveVoltageV',
    label: 'measured at (V)',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'responseDrive → driveExcursion route 2 (the independent x/V from the far field)',
    cls: 'nice',
    effect: 'oordeelt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
    emptyMeans: 'R_e comes from the motional fit, or from the direct low-frequency reading, and says which.',
    source: 'measurement',
  },
  {
    id: 'rotSym',
    label: 'rotationally symmetric',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'geometry.rotationallySymmetric → the M-F-final point-source assumption',
    cls: 'nice',
    effect: 'oordeelt',
    emptyMeans: 'not stated — three states, and this is one of them; M-F-final says which it used.',
    source: 'choice',
  },
  {
    id: 'acousticCentre',
    label: 'acoustic centre z',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'v2Meas[role].zMm → geometry.verticalMm (in place of the baffle position)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'the cabinet position is used, which is the right number for a flush-mounted driver.',
    source: 'measurement',
  },
  {
    id: 'wiring',
    label: 'measured / intended wiring',
    form: 'Drivers tab → Engine v2 — measurement',
    travels: 'AdapterBranch.wiring → the level-work report (what N in series would deliver)',
    cls: 'nice',
    effect: 'oordeelt',
    emptyMeans: 'no wiring statement; a half-stated wiring is absent, and nothing is converted.',
    source: 'choice',
  },
  {
    id: 'nominalSize',
    label: 'Woofer / mid nominal size',
    form: 'Filters → Driver limits',
    travels: 'diameterInch → the beaming ceiling when S_d gives no piston diameter',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'the window keeps its measured beaming ceiling, or has none and says so.',
    source: 'datasheet',
    placement: 'conditional',
    condition: 'a three-way whose woofer ceiling is not measured and whose S_d gives no piston diameter',
    placementWhy:
      'it is the fallback for a missing cone area, and a permanently visible fallback invites a guess ' +
      'over the figure it stands in for (A3h).',
  },
  {
    id: 'catalogSnap',
    label: 'Use real catalog parts',
    form: 'Filters → Components',
    travels:
      'catalogSnap → the candidate declaration → the snap AFTER the tune; since E-4 it obeys the ' +
      'stated coil family’s own residual rather than the v1 branch budget',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'the design keeps continuous values; nothing is judged against a purchasable part.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT_PLACEMENT,
  },
  {
    id: 'verticalWindowDeg',
    key: 'verticalWindowDeg',
    label: 'Vertical window °',
    form: 'Filters → Engine v2',
    travels: 'ReportSettings.verticalWindowDeg → the vertical-lobing synthesis (M-F-final)',
    cls: 'nice',
    effect: 'oordeelt',
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
    effect: 'toont',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    effect: 'zoekt',
    emptyMeans:
      'the exploration runs: a smaller field with the same requirements, gates and seed, and the ' +
      'shortlist says which mode made it.',
    source: 'choice',
  },
  {
    /**
     * H-5 — WHICH POLARITY ARMS A RUN BUILDS.
     *
     * NOT a judgement row: it arms no gate and bounds nothing. What it decides
     * is which DESIGNS exist to be judged, one step earlier — the textbook arm
     * alone, or the mirrored one beside it — and both are then judged by
     * exactly the requirements already in force. Same class and same reason as
     * `fieldMode`, which decides how many POSITIONS exist.
     */
    id: 'polarityArms',
    key: 'polarityArms',
    label: 'Polarity arms',
    form: 'Filters → Engine v2',
    travels:
      'fieldModeSettings → PolarityArmPolicy.seed → expandPolarityArms → every candidate carries ' +
      'its polarity, and the design step is bound to it instead of tie-breaking it internally',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'the TEXTBOOK rule decides: every candidate is designed at the polarity its alignments ask ' +
      'for (LR2 one reversal, LR4 none) and no mirrored arm is built. State "both" to build them ' +
      'beside it — the run count multiplies rather than adds.',
    source: 'choice',
  },
  {
    id: 'statedCrossings',
    key: 'statedCrossings',
    label: 'Crossings you state (Hz, per handover)',
    form: 'Filters → Engine v2',
    travels:
      'parseStatedCrossings → buildCandidateField(statedPerAxisHz) → one extra candidate per ' +
      'stated position, tuned and judged by the worker exactly as a derived one',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'the derived field alone — the positions A5d.3 lays across each feasible window, and ' +
      'nothing outside one. State a frequency here and it becomes an extra candidate: inside a ' +
      'window it is judged exactly as a derived one, outside it the tune still runs and every ' +
      'limit it is past is answered beside it in that limit’s own unit.',
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
    effect: 'toont',
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
    effect: 'toont',
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
    effect: 'toont',
    emptyMeans: 'the mic is taken to have stood level with the reference point, which is 0°.',
    source: 'measurement',
  },
  {
    id: 'baffleHeight',
    label: 'Front panel height',
    form: 'Setup tab → Cabinet & measurement',
    travels: 'cabinet.baffleHeightMm → the front-panel drawing and the reference-point sanity check',
    cls: 'nice',
    effect: 'toont',
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
    effect: 'toont',
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
    effect: 'toont',
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
    effect: 'toont',
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
    effect: 'toont',
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
    effect: 'oordeelt',
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
    effect: 'toont',
    emptyMeans:
      'the driver is taken to fire forward from the front baffle with its acoustic centre in the ' +
      'baffle plane. The engine’s geometry reads the acoustic centre from the A5a block, not here.',
    source: 'measurement',
  },
  {
    id: 'chamber',
    label: 'Chamber (sealed / ported, and its corner)',
    form: 'Setup tab → driver card',
    travels:
      'cabinet.drivers[role].enclosure / fbHz → what the box itself already filters, and the excursion ' +
      'warning; U-9 (N5, measured): f_b of the LOW driver → audit.fbHz → the tuner’s part audit on ' +
      'every route, and on the two-way route the design step as well',
    cls: 'nice',
    effect: 'zoekt',
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
    effect: 'zoekt',
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
    travels:
      'scanSteps3 → fieldModeSettings(full) → chainBudget = steps^pairs; and since U-5b, when the ' +
      'crossover point is on, → expandStatedRange → statedPerAxisHz, where it is how many STATED ' +
      'positions each pinned handover gets',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'read by the FULL field only; an exploration uses its own chain budget and ignores this ' +
      'number — except as the step count of a pinned crossover point, which both modes read.',
    source: 'choice',
    placement: 'conditional',
    condition: 'a pinned crossover or the full field (U-9: the exploration ignores the count)',
    placementWhy: 'a count that nothing reads until its parent is set waits out of sight (U-9, point 5).',
  },
  {
    id: 'crossoverPoint',
    label: 'Crossover point (centre ± margin, per handover)',
    form: 'Filters → Crossover',
    travels:
      'xoRangeOn + xoFreqHz/xoMarginHz (and xoLowFreqHz/xoLowMarginHz on a three-way) → ' +
      'v2StatedRanges → expandStatedRange → statedPerAxisHz → buildCandidateField → one stated ' +
      'candidate per position',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'off = you state no crossing here and the derived A5d.3 field is the whole field. On it is ' +
      'the short way of writing the "Crossings you state" list: N stated positions across the ' +
      'band, each a full chain run past the window and past the chain budget (U-5b).',
    source: 'choice',
    placement: 'always',
    placementWhy:
      'a pin states crossings, and whether one is stated is something the designer has to see ' +
      'without opening anything (U-5b).',
  },
  {
    id: 'xoScanSteps',
    label: 'Steps across the pinned band (two-way)',
    form: 'Filters → Crossover',
    travels: 'scanSteps2 → v2StatedRanges → expandStatedRange; and fieldModeSettings(full) as stepsPerAxis',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'it is a select and is never empty. With the crossover point OFF it states nothing at all; ' +
      'with it on, this is how many positions you asked for and how many chain runs that costs.',
    source: 'choice',
    placement: 'conditional',
    condition: 'a two-way with a pinned crossover or the full field (U-9: the exploration ignores the count)',
    placementWhy: 'a count that nothing reads until its parent is set waits out of sight (U-9, point 5).',
  },
];

/* ==================================================================== *
 * 3b — U-9 fase 2: EVERY FIELD THAT DOES SOMETHING, AND HAD NO ROW
 * ==================================================================== *
 *
 * I-1 called this register "every input the v2 route can reach", and the U-9
 * phase-0 measurement found fifty fields it did not hold — thirty-five of them
 * steering the search (finding N2). Each row below takes its EFFECT from that
 * measurement (`docs/U-9_veldinventaris.md`, the number in the comment is its
 * row there) and not from an estimate made while writing it.
 *
 * Most of the searching ones start on a value the APP chose (a `useState`
 * initial, `appDefaults.ts`), not one anybody stated — and still steer the
 * search. They are neither hidden nor changed: they say what they are
 * ("app default — not stated by you"), and they stay in the default view for
 * the P4 reason, which is the placement override they all carry.
 */

/** Shared by every row that steers the search on an app start value (N2). */
const STEERS_ON_APP_DEFAULT = STEERS_ON_APP_DEFAULT_PLACEMENT;

const U9_ROWS: readonly V2InputRowDef[] = [
  /* ---- 1. Project / Import and the measurement slots ---- */
  {
    id: 'offAxisSets', // #2
    label: 'Angle set per way (off-axis files)',
    form: 'Drivers tab — angle slots',
    travels:
      'offAxis → the directivity ceiling of the A5d.3 window; on the three-way also diAnchorHz and the ' +
      'angle data the tuner’s in-room terms read',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'no directivity ceiling in the window (it says so), and the in-room terms of the tuner stay off.',
    source: 'measurement',
  },
  {
    id: 'mergeStepModel', // #7
    label: 'Step model on/off (near-field merge)',
    form: 'Drivers tab — near-field merge',
    travels: 'stepOn → the minimum-phase shelf of nfMerge → the merged file → its validity floor',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'it is a tick and never blank; off, the merge splices without a baffle-step shelf and says so.',
    source: 'choice',
  },
  {
    id: 'fileNote', // #9
    label: 'File note',
    form: 'Drivers tab — beside each file',
    travels: 'stored with the project as provenance; no reader in a run',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'no note; nothing in a run reads it.',
    source: 'choice',
  },
  {
    id: 'catalog', // #10
    label: 'Parts catalogue (import and manage)',
    form: 'Components tab → catalogue manager',
    travels: 'the imported catalogue → the coil-family fits (the DCR model, A5e.3) and the snap',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans:
      'no catalogue: nothing to snap to and no fitted coil family, so the design keeps continuous ' +
      'values and the DCR model stays off with its reason.',
    source: 'choice',
  },
  {
    id: 'networkSource', // #11
    label: 'Filter / VituixCAD import, variant, design and project to open',
    form: 'Project tab and the design tabs',
    travels: 'which network the report judges',
    cls: 'nice',
    effect: 'oordeelt',
    emptyMeans: 'no network loaded: the report judges the measurements alone and says so.',
    source: 'choice',
  },
  {
    id: 'referenceFile', // #12
    label: 'Verification / reference file',
    form: 'Network tab',
    travels: 'a chart overlay',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'no overlay.',
    source: 'measurement',
  },
  /* ---- 4. Setup → the tweeter / mid adjustment (N7) ---- */
  {
    id: 'phaseMode', // #50
    label: 'Phase: measured or minimum',
    form: 'Setup tab → driver phase',
    travels: 'phaseMode → minimum-phase branches in the chain feed',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'it is a select and never blank.',
    source: 'choice',
  },
  {
    id: 'tweeterAdjust', // #51, #52
    label: 'Tweeter offset (mm) and trim (dB)',
    form: 'Setup tab → tweeter adjustment',
    travels:
      'tAdjust (three-way) / adjust (two-way) → the chain feed. U-9 (N7, measured): offset and trim reach ' +
      'the chain; the polarity in the same object is overwritten by the stated arm (H-5), these are not',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'zero offset and zero trim are app start values; the fields hold numbers and are never blank.',
    source: 'measurement',
  },
  {
    id: 'midAdjust', // #53
    label: 'Mid offset (mm) and trim (dB)',
    form: 'Setup tab → midrange adjustment (three-way)',
    travels: 'midAdjust → the three-way chain feed (N7)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'zero offset and zero trim are app start values; the fields hold numbers and are never blank.',
    source: 'measurement',
  },
  {
    id: 'seatTiming', // #54
    label: 'Seat timing',
    form: 'Setup tab → driver phase',
    travels: 'the v1 display of arrival times at the seat',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'nothing in a run reads it.',
    source: 'measurement',
  },
  /* ---- 6. Filters: the fields that used to sit under v1 headings (N2) ---- */
  {
    id: 'dirWeight', // #95
    label: 'Weight for in-room sound (%)',
    form: 'Filters → ⚙ Settings',
    travels: 'dirWeight → network.weights → the tuner; on the two-way route the design step as well',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a slider, never blank; it acts only with an angle set loaded.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'ampTarget', // #96
    label: 'Amplitude target (on-axis / listening window)',
    form: 'Filters → ⚙ Settings',
    travels: 'ampTarget → the tuner’s amplitude term',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a select, never blank; it acts only with an angle set loaded.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'powerMetric', // #97, #98
    label: 'Power response metric and DI-fold weight',
    form: 'Filters → ⚙ Settings',
    travels: 'powerMetric / powerFoldWeight → the tuner’s in-room term',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'never blank; it acts only with an angle set loaded.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'costWeight', // #99
    label: 'Snap cost pressure',
    form: 'Filters → ⚙ Settings',
    travels: 'costWeight → the catalogue snap’s tiebreak, score ×(1 + w·ΣEUR)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank; 0 = no cost pressure.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'dissipationWeight', // #100
    label: 'Dissipation weight',
    form: 'Filters → ⚙ Settings',
    travels: 'dissipationWeight → a GREY weight in the tuner objective (A3j: taken over explicitly)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank; 0 = the term is off.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'rSourceLimit', // #101
    label: 'Source R limit (audit tier)',
    form: 'Filters → ⚙ Settings',
    travels: 'rSourceLimitOhm → the tuner’s part audit (audit tier)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'rSourceDisq', // #102
    label: 'Source R disqualify',
    form: 'Filters → ⚙ Settings (three-way only)',
    travels:
      'rSourceDisqualifyOhm → the THREE-WAY chain settings only. On the two-way and hybrid routes the ' +
      'candidate declares it ABSENT (V34, U-5c), so it is drawn on the three-way only (Sander, 25-10-2026: ' +
      'a field that does nothing on a route is hidden there)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank; 0 = off.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'diWeight', // #103
    label: 'DI anchor weight',
    form: 'Filters → ⚙ Settings (three-way only)',
    travels: 'diWeight → the three-way structure search; the two-way and hybrid routes do not read it',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank; 0 = off.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'eqBands', // #104
    label: 'Correction bands per driver (max)',
    form: 'Filters → ⚙ Settings',
    travels: 'vfEqBands → the design step’s EQ slots',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'breakupGuard', // #105
    label: 'Keep cone breakup ≥20 dB down',
    form: 'Filters → ⚙ Settings',
    travels: 'breakupGuard → the chain settings → the tuner',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a tick, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'phaseMetric', // #106
    label: 'Phase metric (integration band / classic)',
    form: 'Filters → ⚙ Settings',
    travels: 'phaseMetricMode → the chain settings → the tuner’s phase term',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a select, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'synthMode', // #107
    label: 'Build mode (acoustic result / filter curve)',
    form: 'Filters toolbar, next to Optimize',
    travels: 'synthMode → the synthesis step of the chain',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a select, never blank.',
    source: 'choice',
  },
  {
    id: 'snapProfile', // #109
    label: 'Snap profile',
    form: '🧙 Wizard → components',
    travels: 'snapProfile → snapPrefs → the catalogue snap',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a select, never blank; acts only with the snap on.',
    source: 'choice',
  },
  {
    id: 'snapSeries', // #110
    label: 'Series preference L / C / R',
    form: '🧙 Wizard → components',
    travels: 'snapSeriesL/C/R → snapPrefs.seriesByKind → the catalogue snap',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'auto: no preference; acts only with the snap on.',
    source: 'choice',
  },
  {
    id: 'snapBoundToSeries', // #111
    label: 'Bind to series',
    form: '🧙 Wizard → components',
    travels: 'snapBoundToSeries → snapPrefs → the catalogue snap, only with a chosen series',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a tick, never blank; acts only with a series chosen.',
    source: 'choice',
  },
  {
    id: 'snapStacks', // #112
    label: 'Allow stacks',
    form: '🧙 Wizard → components',
    travels: 'snapStacks → snapPrefs.allowStacks → the catalogue snap',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a tick, never blank; acts only with the snap on.',
    source: 'choice',
  },
  {
    id: 'stagedOn', // #113, #114, #115
    label: 'Use as few components as possible, and its ripple / phase goals',
    form: 'Filters → ⚙ Settings',
    travels: 'stagedOn + targetRipple / targetPhase → targets / staged → the step method in the tuner',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a tick and two numbers, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'roomCorrection', // #116, #117
    label: 'Room correction present, and its ripple goal',
    form: 'Filters → ⚙ Settings',
    travels: 'roomCorrection / roomRippleDb → widens the step method’s ripple goal; the phase goal stays',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a tick, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'acSlopeMid', // #118
    label: 'Acoustic slope mid (LP at the high crossing)',
    form: 'Filters → ⚙ Settings',
    travels:
      'acSlopeMid → acousticSlopes → the tuner; U-9 (N3, measured): ALSO orderByPair → the order the ' +
      'A5d.3 f_s floor assumes, so the candidate field moves; on the two-way route the design step too',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'auto: free; a select, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'acSlopeTweeter', // #119
    label: 'Acoustic slope tweeter',
    form: 'Filters → ⚙ Settings',
    travels: 'acSlopeTweeter → acousticSlopes → the tuner (N3)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'auto: free; a select, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'acSlopeWoofer', // #120
    label: 'Acoustic slope woofer (low crossing)',
    form: 'Filters → ⚙ Settings (three-way only)',
    travels:
      'acSlopeWoofer → acousticSlopes.low → the tuner and orderByPair → the windows (N3); three-way only, ' +
      'hidden on the two-way and hybrid routes where nothing reads it',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'auto: free; a select, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'acSlopeMidHp', // #121
    label: 'Acoustic slope mid HP (low crossing)',
    form: 'Filters → ⚙ Settings (three-way only)',
    travels: 'acSlopeMidHp → acousticSlopes.low → the tuner and orderByPair → the windows (N3); three-way only',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'auto: free; a select, never blank.',
    source: 'choice',
    ...STEERS_ON_APP_DEFAULT,
  },
  {
    id: 'phasePriority',
    label: 'Priority: response % · phase %',
    form: 'Filters → Goals & weighting (and the wizard’s Goals step)',
    travels:
      'chain settings.phasePriority → OVERWRITTEN for the design and synthesis steps by the chain ' +
      'declaration (DEFAULT_PHASE_PRIORITY, declareCandidateChainChoices, M-4) — but the TUNER reads ' +
      'the slider: the worker builds `network.weights` from the raw `input.settings` before the ' +
      'declaration is applied, and the hook spreads those weights last (U-9, finding N1, measured on ' +
      'the three-way, the two-way and the hybrid route)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'not applicable: the slider always holds a value.',
    source: 'choice',
    /* U-9 fase 2 (Sander, 25-10-2026): the slider STAYS, and its badge says what
     * the measurement found. It is not a v1 field — the v2 tuner reads it — so
     * it carries no v1 badge any more (B-2.1). */
    effectNote:
      'The tuner reads this slider; the design step and the synthesis run on the engine’s own ' +
      '50/50 split (M-4). Measured on all three routes (U-9, N1). Whether the design step should ' +
      'follow it is an engine decision, not made here.',
    placement: 'always',
    placementWhy:
      'it steers the v2 tuner on an app start value nobody stated (U-9, N2), and P4 asks such a ' +
      'value to stay in view and say what it is.',
  },
  /* ---- 7. The Network tab, the editor and the chart controls ---- */
  {
    id: 'networkTemplate', // #127
    label: 'New from template (ways, order)',
    form: 'Network tab',
    travels: 'builds the network the report judges (H-3: in Hybrid mode acoustically seeded)',
    cls: 'nice',
    effect: 'oordeelt',
    emptyMeans: 'an action, not a value.',
    source: 'choice',
  },
  {
    id: 'networkEditor', // #128
    label: 'Network editor: model, polarity, value, realisation, LCR notch',
    form: 'Network tab → schematic editor',
    travels: 'edits the network the report judges',
    cls: 'nice',
    effect: 'oordeelt',
    emptyMeans: 'an edit, not a value.',
    source: 'choice',
  },
  {
    id: 'partLock', // #129
    label: 'Lock a part',
    form: 'Network tab → schematic editor',
    travels: 'locked → v2TuneNetlist (⚙ Optimize components) leaves the part out of the tune',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'unlocked: the tune may change it.',
    source: 'choice',
  },
  {
    id: 'simDisplay', // #130, #131
    label: 'Network active, compare tabs, tolerance band, save as / rename',
    form: 'Network tab',
    travels: 'the simulation display and the design’s name',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'nothing in a run reads it.',
    source: 'choice',
  },
  {
    id: 'viewFmax', // #132
    label: 'View range f max',
    form: 'Setup tab → view range',
    travels:
      'fMax → v2ChainFrame keeps the caller’s ceiling, so it is the CEILING OF THE JUDGED BAND (E-5, by ' +
      'design; U-9, N6)',
    cls: 'nice',
    effect: 'zoekt',
    emptyMeans: 'a number, never blank.',
    source: 'choice',
  },
  {
    id: 'viewFmin', // #133
    label: 'View range f min',
    form: 'Setup tab → view range',
    travels: 'fMin → the chart; the grid floor only when it lies below the validity floor (E-5)',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'a number, never blank.',
    source: 'choice',
  },
  {
    /* U-9 fase 3 — the guided shortlist's order. A VIEW and not a verdict: the
     * engine delivers a field, not a ranking, so guided sorts on a key the user
     * picks and names it; with none picked the list stands in the order the
     * spreading chose. No "recommended" crown. */
    id: 'guidedShortlistOrder',
    label: 'Order the guided shortlist by',
    form: 'Guided → the shortlist after a run',
    travels: 'the order the guided shortlist rows are printed in — nothing in a run reads it',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'the list stands in the order the spreading chose; that order is not a ranking.',
    source: 'choice',
  },
  {
    id: 'chartDisplay', // #134, #135, #136
    label: 'Chart range, Pareto axis, sonogram, bypass, solo floor',
    form: 'the chart panels and the solo controls',
    travels: 'the charts and the single-driver display',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'nothing in a run reads it.',
    source: 'choice',
  },
  {
    id: 'bandForms', // #137
    label: 'Filter bands (per-driver HP/LP/EQ forms)',
    form: 'Filters → Filter bands',
    travels:
      'the simulation without a network; follows the polarity rule (H-4b). The v2 chain feed gets ' +
      'seed: defaultVFilters(), not these',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'nothing in a run reads it.',
    source: 'choice',
  },
  {
    id: 'navigation', // #138
    label: 'Search fields, command palette, measuring-guide sliders, view toggles',
    form: 'every tab',
    travels: 'navigation and explanation',
    cls: 'nice',
    effect: 'toont',
    emptyMeans: 'nothing in a run reads it.',
    source: 'choice',
  },
];

/* ==================================================================== *
 * 4 — V1 LEGACY: the v2 route does not read it
 * ==================================================================== */

const V1_LEGACY: readonly V2InputRowDef[] = [
  {
    id: 'hpLpPref',
    label: 'HP/LP preference (low xo / high xo)',
    form: 'no control since U-10 (carried in the project file only)',
    travels:
      'U-10 fase 3 — no longer state: a project that holds it carries it unread to the next save ' +
      '(B-4.3); every candidate states its own alignment, and the virtual-filter exception runs on auto',
    cls: 'v1-legacy',
    effect: 'niets',
    emptyMeans: 'not applicable: the candidate brings its own alignment and order.',
    source: 'choice',
    v1Note:
      'v1 — not read by Engine v2 since F4d: the candidate field derives the alignment and the ' +
      'order per handover. Since U-10 it is carried in the project file and read by nothing.',
  },
  {
    id: 'excursionSpl',
    label: 'Design for … dB',
    form: 'Filters → Driver limits',
    travels:
      'excursionFloorHz → the v1 physics window floor → judgeWindows → the v1 scan table; the v2 window ' +
      'floor is M-C v2.0’s ceiling. Hidden since B-2 (v1-uitfasering (B-2)), together with the table.',
    cls: 'v1-legacy',
    effect: 'niets',
    emptyMeans: 'not applicable.',
    source: 'choice',
    /* THE SENTENCE HAS ONE HOME AND TWO READERS. E-2 gave this field its note
     * before the register existed and `v2Settings.test.ts` pins both the
     * function and its call site in `App.tsx`; re-typing the words here would
     * be a second copy that can drift. So the drawer and the field say the
     * same thing because they read the same function. */
    v1Note: designLevelNote(),
  },
  {
    id: 'v1Thresholds', // #126
    label: 'v1 window thresholds: beaming tier, lobing strictness, breakup harmonic, array k, λ-divisor, fs ×, breakup divisor',
    form: 'Filters → Driver limits / Crossover (no longer shown)',
    travels:
      'the v1 physics window → judgeWindows → xoWindowOk → the v1 scan table only. Hidden since B-2 ' +
      '(v1-uitfasering (B-2)), together with the table; the v2 window is A5d.3’s and reads none of them',
    cls: 'v1-legacy',
    effect: 'niets',
    emptyMeans: 'not applicable: no v2 window, gate or shortlist reads them.',
    source: 'choice',
    v1Note: 'v1 — v1-uitfasering (B-2): these sorted the v1 scan table, which is no longer shown.',
  },
];

/**
 * U-9 fase 2 — every row's group, by id. Data, not a convention: a row added
 * above without an entry here THROWS when the register is built, so a field
 * cannot reach the panel without a place in the order of designing.
 */
const GROUP_OF: Readonly<Record<string, V2FieldGroup>> = Object.freeze({
  // architecture
  'ways': 'architecture',
  'activeSideOn': 'architecture',
  'activeHandoverHz': 'architecture',
  'activeHandoverShape': 'architecture',
  'activeFlankBudgetDbRms': 'architecture',
  'activeProcessorLatencyMs': 'architecture',
  'wiring': 'architecture',
  // measurement
  'responses': 'measurement',
  'validity': 'measurement',
  'impedance': 'measurement',
  'positions': 'measurement',
  'sd': 'measurement',
  'baffle-width': 'measurement',
  'nearFieldCone': 'measurement',
  'nearFieldPort': 'measurement',
  'spliceBand': 'measurement',
  'mergeValidFrom': 'measurement',
  'measuredRe': 'measurement',
  'rotSym': 'measurement',
  'acousticCentre': 'measurement',
  'micDistance': 'measurement',
  'gateOverride': 'measurement',
  'micElevation': 'measurement',
  'baffleHeight': 'measurement',
  'referencePoint': 'measurement',
  'refDriver': 'measurement',
  'cabinetDepth': 'measurement',
  'listeningPosition': 'measurement',
  'sourceCount': 'measurement',
  'mounting': 'measurement',
  'chamber': 'measurement',
  'manualWindow': 'measurement',
  'driveVoltageV': 'measurement',
  'offAxisSets': 'measurement',
  'mergeStepModel': 'measurement',
  'fileNote': 'measurement',
  'referenceFile': 'measurement',
  'phaseMode': 'measurement',
  'tweeterAdjust': 'measurement',
  'midAdjust': 'measurement',
  'seatTiming': 'measurement',
  // amplifier
  'ampMinLoadOhm': 'amplifier',
  'maxDissipationPct': 'amplifier',
  'minEpdrOhm': 'amplifier',
  'amplifierPeakPowerW': 'amplifier',
  'amplifierNominalLoadOhm': 'amplifier',
  'amplifierPowerW': 'amplifier',
  'dissipationWeight': 'amplifier',
  // protection
  'maxDriveOnFsDb': 'protection',
  'driveOnFsMaxDb-per-way': 'protection',
  'xmaxMarginFraction': 'protection',
  'xmaxMm': 'protection',
  'blTm': 'protection',
  'mmsG': 'protection',
  'powerRating': 'protection',
  'lfBumpBudgetDb': 'protection',
  'qesMultiplierMax': 'protection',
  'dampingMarginDb': 'protection',
  'rSourceLimit': 'protection',
  'rSourceDisq': 'protection',
  'breakupGuard': 'protection',
  // crossover
  'lowestWayLevelWork': 'crossover',
  'lowestWaySeriesRMaxOhm': 'crossover',
  'minCrossover': 'crossover',
  'maxCrossover': 'crossover',
  'maxCrossoverOverride': 'crossover',
  'breakupDivisor': 'crossover',
  'nominalSize': 'crossover',
  'crossoverPoint': 'crossover',
  'xoScanSteps': 'crossover',
  'xo3Steps': 'crossover',
  'hpLpPref': 'crossover',
  'diWeight': 'crossover',
  'eqBands': 'crossover',
  'synthMode': 'crossover',
  'acSlopeMid': 'crossover',
  'acSlopeTweeter': 'crossover',
  'acSlopeWoofer': 'crossover',
  'acSlopeMidHp': 'crossover',
  'v1Thresholds': 'crossover',
  'excursionSpl': 'crossover',
  // buildability
  'resistorClassW': 'buildability',
  'resistorPowerMargin': 'buildability',
  'coilClassA': 'buildability',
  'resistorThermalPowerW': 'buildability',
  'coilFamily': 'buildability',
  'catalogSnap': 'buildability',
  'catalog': 'buildability',
  'costWeight': 'buildability',
  'snapProfile': 'buildability',
  'snapSeries': 'buildability',
  'snapBoundToSeries': 'buildability',
  'snapStacks': 'buildability',
  'stagedOn': 'buildability',
  'networkSource': 'buildability',
  'networkTemplate': 'buildability',
  'networkEditor': 'buildability',
  'partLock': 'buildability',
  'simDisplay': 'buildability',
  // voicing
  'targetCurve': 'voicing',
  'plateauDepthDb': 'voicing',
  'splWindowPlusMinusDb': 'voicing',
  'maxPhaseTrackingDeg': 'voicing',
  'verticalWindowDeg': 'voicing',
  'dirWeight': 'voicing',
  'ampTarget': 'voicing',
  'powerMetric': 'voicing',
  'phaseMetric': 'voicing',
  'roomCorrection': 'voicing',
  // run
  'shortlistSize': 'run',
  'runSeed': 'run',
  'runBudgetEvals': 'run',
  'fieldMode': 'run',
  'polarityArms': 'run',
  'statedCrossings': 'run',
  'phasePriority': 'run',
  'viewFmax': 'run',
  'viewFmin': 'run',
  'chartDisplay': 'run',
  'guidedShortlistOrder': 'run',
  'bandForms': 'run',
  'navigation': 'run',
});

/* ==================================================================== *
 * The register, and the readers
 * ==================================================================== */

/** Every input, in class order. */
export const V2_INPUT_REGISTER: readonly V2InputRow[] = Object.freeze(
  [...REQUIRED, ...JUDGEMENT, ...NICE, ...U9_ROWS, ...V1_LEGACY].map((r) => {
    const group = GROUP_OF[r.id];
    if (!group) throw new Error(`v2InputRegister: row "${r.id}" has no group`);
    return { ...r, group };
  }),
);

/** The judgement rows with the sub-heading each sits under. */
export const V2_JUDGEMENT_ROWS: readonly (V2InputRow & { band: V2JudgementBand })[] =
  Object.freeze(JUDGEMENT.map((r) => ({ ...r, group: GROUP_OF[r.id] })));

/** The sub-headings of the judgement group, in order. */
export const V2_JUDGEMENT_BANDS: readonly V2JudgementBand[] = [
  'architecture',
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

/** U-9 fase 2 — the badge words, one per effect and one per source. */
export const EFFECT_WORD: Readonly<Record<V2InputEffect, string>> = Object.freeze({
  zoekt: 'searches',
  oordeelt: 'judges',
  toont: 'shows',
  niets: 'nothing',
});
export const SOURCE_WORD: Readonly<Record<V2InputSource, string>> = Object.freeze({
  datasheet: 'datasheet',
  nameplate: 'nameplate',
  measurement: 'measurement',
  choice: 'your choice',
});

/** U-9 fase 2 — the rendered rows of one group, in register order. */
export const rowsOfGroup = (g: V2FieldGroup): readonly V2InputRow[] =>
  V2_INPUT_REGISTER.filter((r) => r.group === g && r.effect !== 'niets');

/**
 * U-9 fase 2 — the rendered rows of a group whose controls are NOT in the
 * Filters panel: the panel names them under their group heading.
 */
export const rowsElsewhere = (g: V2FieldGroup): readonly V2InputRow[] => {
  const inPanel = new Set(V2_FORM_FIELDS.filter((f) => f.form === 'v2-panel').map((f) => f.row));
  return rowsOfGroup(g).filter((r) => !inPanel.has(r.id));
};

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
/**
 * U-9 — MAY THIS ROW BE RENDERED AT ALL? False for `effect: 'niets'`, in every
 * mode. Hidden, never deleted: the value stays in state and in the project
 * file, an old project opens unchanged, and the U-1 carry-over notice still
 * names it. An unknown id THROWS — a render guard that silently answers "yes"
 * for a typo is a guard that guards nothing.
 */
export const rendersRow = (id: string): boolean => {
  const row = V2_INPUT_REGISTER.find((r) => r.id === id);
  if (!row) throw new Error(`rendersRow: no register row "${id}"`);
  return row.effect !== 'niets';
};

/**
 * U-9 fase 2 (B-2.2) — IS THE v1 READING OF A RUN SHOWN AT ALL? The v1 ranking
 * beside the shortlist is drawn only while the knobs that sort it are: a table
 * nobody can explain any more is as dead as knobs without their table, so the
 * two go together. Since B-2 both rows are `niets`, and this is false.
 */
/* U-10 fase 3 — the v1 ranking and the BOM cap are gone, so the v1 reading has
 * nothing left to show; kept as the one switch the hidden table hangs off. */
export const v1ReadingShown = (): boolean => false;

/** U-9 — the rows that are never rendered (Sander's approval, 25-10-2026). */
export const V2_NIETS_ROWS: readonly string[] = Object.freeze(
  V2_INPUT_REGISTER.filter((r) => r.effect === 'niets').map((r) => r.id),
);

/**
 * U-9 — CONTROLS THAT APPEAR ONLY ONCE THEIR PARENT IS SET.
 *
 * Placement (U-3b) is per ROW; these are single controls INSIDE a row whose
 * effect depends on a sibling or on another field (startprompt, point 5). A
 * field that does nothing only because its parent is off is not a 'niets'
 * field — it is a field that waits, and it waits out of sight. `guard` is the
 * app's own expression, as it stands in `App.tsx`; the test reads it there.
 *
 * NOT here, on purpose: the mutual pairs (peak power ↔ nominal load, resistor
 * class ↔ margin, Bl ↔ M_ms). Either half can be typed first, so hiding one
 * until the other is set would make both unreachable.
 */
export interface V2DependentControl {
  row: string;
  /** The control's identifying source fragment (the `V2_FORM_FIELDS` vocabulary). */
  control: string;
  /** The parent, in the app's own words. */
  parent: string;
  /** The guard expression that renders the control, verbatim from `App.tsx`. */
  guard: string;
}
export const V2_DEPENDENT_CONTROLS: readonly V2DependentControl[] = Object.freeze([
  {
    row: 'minCrossover',
    control: 'value={v2Meas[role].minCrossoverOrder}',
    parent: 'a stated recommended minimum crossover frequency',
    guard: "v2Meas[role].minCrossoverHz.trim() !== '' &&",
  },
  {
    row: 'breakupDivisor',
    control: 'value={v2Meas[role].breakupDivisorNote}',
    parent: 'a stated breakup divisor',
    guard: "v2Meas[role].breakupDivisor.trim() !== '' &&",
  },
  {
    row: 'manualWindow',
    control: 'value={v2Meas[role].windowNote}',
    parent: 'a stated manual window (reference, right edge or floor)',
    guard: "(v2Meas[role].refTimeMs.trim() !== '' ||",
  },
  {
    row: 'rotSym',
    control: 'value={v2Meas[role].rotSym}',
    parent: 'a stated vertical window — the vertical-lobing synthesis is its only reader',
    guard: "engineV2Settings.verticalWindowDeg.trim() !== '' &&",
  },
  {
    row: 'xo3Steps',
    control: 'value={xo3Steps}',
    parent: 'a pinned crossover or the full field — the exploration ignores the count (U-5b)',
    guard: "(xoRangeOn || fieldModeOf(engineV2Settings.fieldMode) === 'full') &&",
  },
  /* U-9 fase 2 — fase 1 put the two-way count under the PIN alone; the full
   * field reads it too (`fieldModeSettings(full)` as stepsPerAxis), so it waits
   * for either parent, exactly as the three-way count above. */
  {
    row: 'xoScanSteps',
    control: 'value={xoScanSteps}',
    parent: 'a pinned crossover or the full field — the exploration ignores the count (U-5b)',
    guard: "!threeWay && (xoRangeOn || fieldModeOf(engineV2Settings.fieldMode) === 'full') &&",
  },
]);

/** U-10 fase 3 — no flag argument any more: the app always runs v2. */
export const v1NoteFor = (id: string): string | null => {
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
  { row: 'maxCrossover', form: 'driver-card', control: 'value={v2Meas[role].maxCrossoverHz}' },
  {
    row: 'maxCrossoverOverride',
    form: 'driver-card',
    control: "checked={v2Meas[role].maxCrossoverOverride === 'yes'}",
  },
  { row: 'breakupDivisor', form: 'driver-card', control: 'value={v2Meas[role].breakupDivisor}' },
  { row: 'breakupDivisor', form: 'driver-card', control: 'value={v2Meas[role].breakupDivisorNote}' },
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
  { row: 'polarityArms', form: 'v2-panel', control: 'value={polarityArmsChoiceOf(engineV2Settings.polarityArms)}' },
  { row: 'statedCrossings', form: 'v2-panel', control: 'value={engineV2Settings.statedCrossings}' },
  // ---- H-2: the stated active side ----
  { row: 'activeSideOn', form: 'v2-panel', control: "checked={engineV2Settings.activeSideOn === 'on'}" },
  { row: 'activeHandoverHz', form: 'v2-panel', control: 'value={engineV2Settings.activeHandoverHz}' },
  { row: 'activeHandoverShape', form: 'v2-panel', control: 'value={engineV2Settings.activeHandoverShape}' },
  // ---- H-3b: the flank-error budget, behind the same tick ----
  { row: 'activeFlankBudgetDbRms', form: 'v2-panel', control: 'value={engineV2Settings.activeFlankBudgetDbRms}' },
  { row: 'activeProcessorLatencyMs', form: 'v2-panel', control: 'value={engineV2Settings.activeProcessorLatencyMs}' },  // ---- U-9 fase 2: the fields that sat under the v1 headings, now in their groups ----
  { row: 'phasePriority', form: 'v2-panel', control: 'value={phasePriority}' },
  { row: 'phaseMetric', form: 'v2-panel', control: 'value={phaseMetricMode}' },
  { row: 'ampTarget', form: 'v2-panel', control: 'value={ampTarget}' },
  { row: 'dirWeight', form: 'v2-panel', control: 'value={dirWeight}' },
  { row: 'powerMetric', form: 'v2-panel', control: 'value={powerMetric}' },
  { row: 'powerMetric', form: 'v2-panel', control: 'value={powerFoldWeight}' },
  { row: 'rSourceLimit', form: 'v2-panel', control: 'value={rSourceLimitOhm}' },
  { row: 'rSourceDisq', form: 'v2-panel', control: 'value={rSourceDisqOhm}' },
  { row: 'ampMinLoadOhm', form: 'v2-panel', control: "value={ampMinLoadOhm ?? ''}" },
  { row: 'dissipationWeight', form: 'v2-panel', control: 'value={dissipationWeight}' },
  { row: 'diWeight', form: 'v2-panel', control: 'value={diWeight}' },
  { row: 'eqBands', form: 'v2-panel', control: 'value={vfEqBands}' },
  { row: 'acSlopeMid', form: 'v2-panel', control: 'value={acSlopeMid}' },
  { row: 'acSlopeTweeter', form: 'v2-panel', control: 'value={acSlopeTweeter}' },
  { row: 'acSlopeWoofer', form: 'v2-panel', control: 'value={acSlopeWoofer}' },
  { row: 'acSlopeMidHp', form: 'v2-panel', control: 'value={acSlopeMidHp}' },
  { row: 'stagedOn', form: 'v2-panel', control: 'checked={stagedOn}' },
  { row: 'stagedOn', form: 'v2-panel', control: 'value={targetRipple}' },
  { row: 'stagedOn', form: 'v2-panel', control: 'value={targetPhase}' },
  { row: 'roomCorrection', form: 'v2-panel', control: 'checked={roomCorrection}' },
  { row: 'roomCorrection', form: 'v2-panel', control: 'value={roomRippleDb}' },
  { row: 'costWeight', form: 'v2-panel', control: 'value={costWeight}' },
  { row: 'breakupGuard', form: 'v2-panel', control: 'checked={breakupGuard}' },
  { row: 'catalogSnap', form: 'v2-panel', control: 'checked={catalogSnap && hasImportedCatalog()}' },
  { row: 'crossoverPoint', form: 'v2-panel', control: 'checked={xoRangeOn}' },
  { row: 'crossoverPoint', form: 'v2-panel', control: 'value={xoLowFreqHz}' },
  { row: 'crossoverPoint', form: 'v2-panel', control: 'value={xoLowMarginHz}' },
  { row: 'crossoverPoint', form: 'v2-panel', control: 'value={xoFreqHz}' },
  { row: 'crossoverPoint', form: 'v2-panel', control: 'value={xoMarginHz}' },
  { row: 'xo3Steps', form: 'v2-panel', control: 'value={xo3Steps}' },
  { row: 'xoScanSteps', form: 'v2-panel', control: 'value={xoScanSteps}' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={xoWinThr.arrayK}' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={xoWinThr.ctcLambdaDiv' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={xoWinThr.fsK}' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={kaTier}' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={ctcK}' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={breakupLimitOn ? breakupHarmonic' },
  { row: 'v1Thresholds', form: 'v2-panel', control: 'value={xoWinThr.breakupDiv}' },
  { row: 'excursionSpl', form: 'v2-panel', control: 'value={excursionSpl}' },
  { row: 'nominalSize', form: 'v2-panel', control: 'value={wooferSizeInch}' },
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
  /* U-9 fase 2 — the v1 Filters sections are gone: every field that stood
   * there is now a control of the governed panel, in its group (B-2.1), and the
   * amplifier floor sits beside the gates it arms, under "Amplifier & load".
   * What remains here is drawn on another tab or in the guided wizard, where it
   * is measured or set, and its group names it in the panel. */
  'offAxisSets', 'mergeStepModel', 'fileNote', 'catalog', 'networkSource', 'referenceFile',
  'phaseMode', 'tweeterAdjust', 'midAdjust', 'seatTiming',
  'synthMode', 'snapProfile', 'snapSeries', 'snapBoundToSeries', 'snapStacks',
  'networkTemplate', 'networkEditor', 'partLock', 'simDisplay',
  'viewFmax', 'viewFmin', 'chartDisplay', 'bandForms', 'navigation', 'guidedShortlistOrder',
  /* U-10 fase 3 — drawn NOWHERE: the field lost its control and is carried in
   * the project file unread (B-4.3), so it is a row with no place rather than a
   * control of any form. */
  'hpLpPref',
]);

/**
 * U-9 fase 2 — EVERY OTHER CONTROL OF THE APP, filed under the row it serves.
 *
 * The U-3b drift guard over the WHOLE app (startprompt fase 2, step 1): every
 * `<input>`/`<select>`/`<textarea>` outside the governed forms must match
 * exactly one token here, so a control added anywhere without a register row
 * fails the build. The token is a fragment of the control's own opening tag.
 * Component files whose every control serves one row are filed whole in
 * `V2_FILE_ROWS` — and a component that grows a control for another row has to
 * move off that list, which is when someone looks.
 */
export interface V2AppControl {
  row: string;
  /** Source file, relative to `src/`. */
  file: string;
  control: string;
}
export const V2_APP_CONTROLS: readonly V2AppControl[] = Object.freeze([
  // ---- App.tsx: the Drivers / Import tab ----
  { row: 'responses', file: 'App.tsx', control: 'onChange={loadDriverFiles(' },
  { row: 'referenceFile', file: 'App.tsx', control: 'void loadVerificationFile(f)' },
  { row: 'nearFieldCone', file: 'App.tsx', control: "loadNearField(e, role, 'cone')" },
  { row: 'nearFieldPort', file: 'App.tsx', control: "loadNearField(e, role, 'port')" },
  { row: 'nearFieldPort', file: 'App.tsx', control: 'value={slot.portDiaMm}' },
  { row: 'nearFieldPort', file: 'App.tsx', control: 'value={slot.portSharedBy}' },
  { row: 'spliceBand', file: 'App.tsx', control: 'Number(slot.blendOctaves) || 1)[0]' },
  { row: 'spliceBand', file: 'App.tsx', control: 'Number(slot.blendOctaves) || 1)[1]' },
  { row: 'mergeStepModel', file: 'App.tsx', control: 'checked={slot.stepOn}' },
  { row: 'mergeValidFrom', file: 'App.tsx', control: 'value={slot.validFromHz}' },
  { row: 'fileNote', file: 'App.tsx', control: 'value={fileNotes[r.key]' },
  { row: 'networkSource', file: 'App.tsx', control: 'onChange={loadVituixFiles}' },
  { row: 'networkSource', file: 'App.tsx', control: 'onChange={loadProjectFromFile}' },
  { row: 'networkSource', file: 'App.tsx', control: 'onChange={importFilterFromFile}' },
  { row: 'networkSource', file: 'App.tsx', control: "value={activeDesignId ?? ''}" },
  { row: 'networkSource', file: 'App.tsx', control: 'value={xoName}' },
  { row: 'referenceFile', file: 'App.tsx', control: 'onChange={loadReference}' },
  { row: 'referenceFile', file: 'App.tsx', control: 'onChange={loadVerification}' },
  { row: 'catalog', file: 'App.tsx', control: 'onChange={importCatalogFromFile}' },
  // ---- App.tsx: Setup ----
  { row: 'viewFmin', file: 'App.tsx', control: 'value={fMin}' },
  { row: 'viewFmax', file: 'App.tsx', control: 'value={fMax}' },
  { row: 'guidedShortlistOrder', file: 'App.tsx', control: 'value={guidedShortlistOrder}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={splMin}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={splMax}' },
  { row: 'phaseMode', file: 'App.tsx', control: 'value={phaseMode}' },
  { row: 'tweeterAdjust', file: 'App.tsx', control: 'value={offsetMm}' },
  { row: 'tweeterAdjust', file: 'App.tsx', control: 'value={trimDb}' },
  { row: 'midAdjust', file: 'App.tsx', control: 'value={midOffsetMm}' },
  { row: 'midAdjust', file: 'App.tsx', control: 'value={midTrimDb}' },
  { row: 'seatTiming', file: 'App.tsx', control: 'checked={seatTiming}' },
  // ---- App.tsx: Filters toolbar, the solo controls, the Network tab and the charts ----
  { row: 'synthMode', file: 'App.tsx', control: 'value={synthMode}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'checked={vfBypass}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={soloSensDb}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'checked={soloFloorOn}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={soloFloorDb}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={paretoY}' },
  { row: 'chartDisplay', file: 'App.tsx', control: 'value={sonogramMode}' },
  { row: 'networkTemplate', file: 'App.tsx', control: 'value={threeWay ? 3 : templateWays}' },
  { row: 'networkTemplate', file: 'App.tsx', control: 'value={soloDriver ? 0 : templateOrder}' },
  { row: 'networkEditor', file: 'App.tsx', control: 'value={trapModel}' },
  { row: 'networkEditor', file: 'App.tsx', control: 'value={trapFreq}' },
  { row: 'networkEditor', file: 'App.tsx', control: 'value={trapDepth}' },
  { row: 'networkEditor', file: 'App.tsx', control: 'value={trapQ}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'checked={networkActive}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'checked={compareTabs}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'checked={tolOn}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'value={tolPct}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'value={saveNameDraft}' },
  { row: 'simDisplay', file: 'App.tsx', control: 'value={draft}' },
  { row: 'navigation', file: 'App.tsx', control: 'value={palQuery}' },
  // ---- the schematic editor ----
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: "value={selPart.model ?? ''}" },
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: 'checked={selPart.inverted ?? false}' },
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: 'value={prefSeries[catKind]}' },
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: 'value={String(stackN)}' },
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: 'value={value}' },
  { row: 'networkEditor', file: 'components/SchematicEditor.tsx', control: 'className="cat-parts"' },
  { row: 'partLock', file: 'components/SchematicEditor.tsx', control: 'checked={selPart.locked ?? false}' },
]);

/** U-9 fase 2 — component files whose every control serves one row. */
export const V2_FILE_ROWS: Readonly<Record<string, string>> = Object.freeze({
  'components/CatalogManager.tsx': 'catalog',
  'components/FilterControls.tsx': 'bandForms',
  'components/HelpPanel.tsx': 'navigation',
  'components/MeasuringGuide.tsx': 'navigation',
});
