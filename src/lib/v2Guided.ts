/**
 * I-3 — THE GUIDED ROUTE, ON ENGINE v2: THE REGISTER'S SENTENCES AS A WIZARD.
 *
 * WHY THIS FILE EXISTS. I-1 filed every input the v2 route can reach under
 * four labels and gave each one a sentence in plain language saying what its
 * blankness costs. That inventory went into the EXPERT panel, where it does
 * exactly what it was built for: a designer who already knows the field can
 * see which regime a knob feeds. It does nothing at all for the other half of
 * this app's reason to exist — someone who has measurements and no idea which
 * of twenty-two numbers they are supposed to have an opinion about. In expert
 * they are twenty-two fields of equal weight on one screen, and a field nobody
 * understands is skipped by accident rather than on purpose.
 *
 * So guided asks them ONE AT A TIME, in the register's own order, each with
 * the register's own sentence, and each with an explicit SKIP whose
 * consequence is on the button. The difference between skipping by accident
 * and skipping on purpose is the whole of it: both leave the requirement
 * unstated and nothing judged (P4 is not relaxed anywhere here), but only one
 * of them is a decision the designer made.
 *
 * FOUR RULES THIS FILE KEEPS, AND EACH ONE IS A FAILURE THIS PROJECT HAS
 * ALREADY PAID FOR:
 *
 *  1. THE SENTENCES ARE THE REGISTER'S, READ, NEVER RE-TYPED. A second copy of
 *     an explanation is a copy that drifts from the code it describes — the
 *     reason `v2InputRegister.ts` exists at all. Every screen below names ROW
 *     IDS; the words come from `V2_INPUT_REGISTER` at read time.
 *  2. ONE PROJECT STATE, TWO VIEWS. Guided writes the same `engineV2Settings`,
 *     the same `ampMinLoadOhm`, the same design voicing that expert writes.
 *     There is no guided store, no guided copy and no guided default. Switch
 *     mode mid-project and everything stated is still stated.
 *  3. NO DEFAULTS AND NO PRE-FILLED REQUIREMENT (P4, E-2). A wizard is exactly
 *     where a helpful-looking suggested value would do the most damage: it
 *     arrives at the moment the designer has least reason to doubt it. Every
 *     screen opens on whatever the project holds, which for a fresh project is
 *     nothing.
 *  4. THE COUNT IS DERIVED, NOT TYPED. The screens are built from the register
 *     and the test asserts that every judgement row lands on exactly one of
 *     them. Add a requirement to the register and this route grows a screen
 *     for it or the build breaks; it cannot quietly go unasked.
 *
 * FIFTEEN SCREENS, AND FOURTEEN OF THEM ARE REQUIREMENTS. The brief asked for
 * "the fourteen I-1 sentences", and that number is nearly right in a way worth
 * writing down: grouping the twenty-two judgement rows into the sets that are
 * needed TOGETHER (a peak power without its nominal load states nothing; a
 * resistor class without its margin arms nothing) yields fifteen screens.
 * Fourteen of them are requirements in the ordinary sense — blank means
 * nothing judges this. The fifteenth is the VOICING, where blank is not an
 * absence at all: flat is the neutral reference and is stated by being chosen
 * (V45/A5e.2). So its skip button does not say "skip", and the split is
 * `V2GuidedSkipKind` rather than a comment.
 *
 * No engine import on purpose, exactly as `v2InputRegister.ts` and
 * `v2Settings.ts`: the toggle-regression scan lets only the UI entry points
 * reach into `engine2/`, and a route the designer walks is not one of them.
 */

import {
  JUDGEMENT_KEYS_WHERE_BLANK_DEFERS,
  V2_INPUT_REGISTER,
  type V2InputRow,
  type V2InputSource,
} from './v2InputRegister.ts';
import type { V2SettingKey } from './v2Settings.ts';

/* ==================================================================== *
 * 1 — THE STAGES: where the route goes, and which tab holds each one
 * ==================================================================== */

export type V2GuidedStageId =
  | 'measurements'
  | 'cabinet'
  | 'drivers'
  | 'requirements'
  | 'design'
  | 'build';

/** The tab a stage lives on. `requirements` is the one stage I-3 adds. */
export type V2GuidedTab = 'import' | 'data' | 'drivers' | 'requirements' | 'filters' | 'network';

export interface V2GuidedStage {
  id: V2GuidedStageId;
  tab: V2GuidedTab;
  /** The step-bar label. */
  label: string;
  /** The tooltip: what this step is for, in one sentence. */
  what: string;
}

/**
 * THE ROUTE, AND WHAT I-3 CHANGED ABOUT IT: one step, in the middle.
 *
 * The five steps around it are the ones guided has always had, unmoved and
 * unrenamed — measurements, the box, the drivers, design it, the build. The
 * new one sits where the brief puts it, between the facts and the run,
 * because that is when the questions can be asked at all: a requirement about
 * cone travel is unanswerable before there is a driver to ask it about, and
 * unaskable after the run that would have been judged by it.
 *
 * It appears ONLY on the v2 route. With `engineV2Enabled` off the route is the
 * five it always was, byte for byte, and none of these words render — the
 * toggle invariant as the designer sees it, not only as the netlist does.
 */
export const V2_GUIDED_STAGES: readonly V2GuidedStage[] = Object.freeze([
  {
    id: 'measurements',
    tab: 'import',
    label: 'Your project',
    what: 'Load your measurement files, and save or reopen a project. A driver measured near the cone as well as at a distance can be merged here, which is what opens the crossover window below the gate.',
  },
  {
    id: 'cabinet',
    tab: 'data',
    label: 'Your cabinet',
    what: 'The box and how you measured it. Do this before the drivers: it fixes the reference point everything else is measured from, and the front width is what the bass step is derived from.',
  },
  {
    id: 'drivers',
    tab: 'drivers',
    label: 'Your drivers',
    what: 'Where each driver sits in that box, what is behind it, and its cone area and travel from the datasheet.',
  },
  {
    id: 'requirements',
    tab: 'requirements',
    label: 'What it must meet',
    what: 'One question at a time: what the finished design has to satisfy. Every one of them can be skipped, and the button says what skipping costs — nothing here is filled in for you.',
  },
  {
    id: 'design',
    tab: 'filters',
    label: 'Design it',
    what: 'One button. The app searches a field of candidate crossovers, judges each against what you stated, and shows the shortlist that survived.',
  },
  {
    id: 'build',
    tab: 'network',
    label: 'Your build',
    what: 'The schematic and the shopping list.',
  },
]);

/**
 * WHICH NECESSARY INPUT BELONGS TO WHICH STEP.
 *
 * I-1's seven REQUIRED rows are measurements and geometry, so the expert panel
 * could only point at them from a list. A route can do better: it can put each
 * one on the step where it is actually entered, with the register's own
 * sentence about what its absence costs. The mapping is DATA and the test
 * asserts the union is exactly the required class — a new necessary input
 * lands on a step or the build breaks, rather than being pointed at from a
 * panel nobody in guided opens.
 *
 * `positions` sits on the DRIVERS step and not on the cabinet step the
 * register names: the register says which FORM holds a field, and in guided
 * the driver positions are what "Your drivers" is for (its tick reads them).
 */
export const V2_REQUIRED_BY_STAGE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  measurements: ['responses', 'validity', 'impedance', 'ways'],
  cabinet: ['baffle-width'],
  drivers: ['positions', 'sd'],
});

/** The necessary inputs this step is where you enter, from the register. */
export const requiredRowsOfStage = (stage: string): readonly V2InputRow[] =>
  (V2_REQUIRED_BY_STAGE[stage] ?? [])
    .map((id) => V2_INPUT_REGISTER.find((r) => r.id === id))
    .filter((r): r is V2InputRow => r !== undefined);

/** The steps of the guided route, with the requirements step only on v2. */
export const guidedStages = (engineV2Enabled: boolean): readonly V2GuidedStage[] =>
  engineV2Enabled ? V2_GUIDED_STAGES : V2_GUIDED_STAGES.filter((s) => s.id !== 'requirements');

/**
 * Which engine is behind the mode, said on the mode switch itself.
 *
 * The brief's words: "the mode choice says which engine is behind it". Guided
 * and expert are two views of one project, so the engine is not a property of
 * the mode — it is the v2 toggle, which lives in expert. What the mode switch
 * can honestly say is which one is running right now.
 *
 * NULL ON v1, and that is the toggle invariant rather than an oversight. With
 * the flag off the app behaves exactly as it always has, and "exactly" covers
 * the words on a tooltip as well as the bytes in a netlist — the same reason
 * `designLevelNote` and `v1NoteFor` return null there. The cost is real and
 * named in the entry: a guided user with the flag off is told nothing about
 * v2 from here, and finds it where it has always lived.
 */
export const guidedEngineNote = (engineV2Enabled: boolean): string | null =>
  engineV2Enabled
    ? 'Engine v2 is on: guided asks what the design must meet, one requirement at a time, and judges the run against your answers.'
    : null;

/* ==================================================================== *
 * 2 — THE REQUIREMENT SCREENS
 * ==================================================================== */

/**
 * What the app renders on a screen. The register says WHICH inputs a screen
 * holds and what they mean; this says which control the app puts under them,
 * because three of the fifteen are not v2 settings fields at all — the
 * amplifier floor is app state older than the v2 block, the per-way drive
 * figure is one field per way on the driver cards, and the voicing hangs on
 * the DESIGN rather than the project (A5e.2, so two voicings of one
 * loudspeaker can sit side by side).
 */
export type V2GuidedControl =
  /** One numeric input per row that carries a settings key. */
  | 'settings'
  /** The amplifier floor: `ampMinLoadOhm`, app state, no settings key. */
  | 'amp-floor'
  /** The single dB figure, plus the per-way refinement named but not asked. */
  | 'drive-on-fs'
  /** The mode select, and its maximum once the mode needs one. */
  | 'level-work'
  /** The design's target curve and, for a plateau, its depth. */
  | 'voicing';

/**
 * What skipping this screen means. Fourteen screens are `unjudged`; the
 * fifteenth is `neutral`, and the difference is not cosmetic — see the header.
 */
export type V2GuidedSkipKind = 'unjudged' | 'neutral';

/**
 * HOW THE INPUTS OF ONE SCREEN RELATE.
 *
 * `all` — they only state something TOGETHER, and half of them states nothing
 * at all (a peak power without its nominal load gives no peak voltage; a
 * resistor class without its margin arms no allowance). This is the state the
 * grouping exists to make visible.
 * `any` — they are ALTERNATIVES, and one is an answer (the single M-C figure
 * or a figure stated per way; flat or a plateau).
 */
export type V2ScreenRule = 'all' | 'any';

export interface V2RequirementScreen {
  id: string;
  /** The question, in the words someone who has not read the spec would use. */
  title: string;
  /** The register rows this screen holds, in register order. */
  rowIds: readonly string[];
  control: V2GuidedControl;
  skip: V2GuidedSkipKind;
  requires: V2ScreenRule;
  /**
   * A refining input that STOPS being optional once another row holds a
   * particular value. There is exactly one in the register and it is the
   * level-work maximum: `series-r-max` without its number binds nothing and
   * the whole rule reads as not stated (V51b), so a screen holding the mode
   * and no maximum is half-answered rather than answered.
   */
  conditional?: { rowId: string; whenRow: string; hasValue: string };
}

/**
 * THE SCREENS, IN THE REGISTER'S ORDER.
 *
 * "In register order" is checkable and it is checked: the screens are sorted
 * by the register index of their FIRST row, and every judgement row is on
 * exactly one screen. Grouping is the only liberty taken, and it is taken for
 * one reason — inputs that state nothing apart. `amplifierPeakPowerW` without
 * `amplifierNominalLoadOhm` gives no peak voltage; `resistorClassW` without
 * `resistorPowerMargin` arms no allowance. Asking those on separate screens
 * would produce a designer who answered half a question and a run that judged
 * nothing, which is the worst of both.
 *
 * One grouping crosses a register row to do it: the resistor screen takes
 * `resistorThermalPowerW`, which the register lists after `coilClassA`. They
 * are one allowance — the class, the margin, and the power it is judged at —
 * and splitting a coil between them would be worse than the order.
 */
export const V2_REQUIREMENT_SCREENS: readonly V2RequirementScreen[] = Object.freeze([
  {
    id: 'amp-floor',
    title: 'What is the lowest load your amplifier is rated for?',
    rowIds: ['ampMinLoadOhm'],
    control: 'amp-floor',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'dissipation',
    title: 'How much of the amplifier’s power may be burnt in the filter?',
    rowIds: ['maxDissipationPct'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'epdr',
    title: 'How low may the load get once the phase angle is counted in?',
    rowIds: ['minEpdrOhm'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'drive-on-fs',
    title: 'How far down must a driver be at its own resonance?',
    rowIds: ['maxDriveOnFsDb', 'driveOnFsMaxDb-per-way'],
    control: 'drive-on-fs',
    requires: 'any',
    skip: 'unjudged',
  },
  {
    id: 'excursion',
    title: 'How hard will you drive it, and how much cone travel may that use?',
    rowIds: ['amplifierPeakPowerW', 'amplifierNominalLoadOhm', 'xmaxMarginFraction'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'amp-power',
    title: 'What continuous power should the watts be reported at?',
    rowIds: ['amplifierPowerW'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'resistors',
    title: 'What resistors will you buy, and how hard may they run?',
    rowIds: ['resistorClassW', 'resistorPowerMargin', 'resistorThermalPowerW'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'coil-current',
    title: 'How much current may a coil carry before its core saturates?',
    rowIds: ['coilClassA'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'level-work',
    title: 'May the lowest way be padded down to match the others?',
    rowIds: ['lowestWayLevelWork', 'lowestWaySeriesRMaxOhm'],
    control: 'level-work',
    requires: 'all',
    conditional: { rowId: 'lowestWaySeriesRMaxOhm', whenRow: 'lowestWayLevelWork', hasValue: 'series-r-max' },
    skip: 'unjudged',
  },
  {
    id: 'lf-bump',
    title: 'How much bass lift may the series coil add?',
    rowIds: ['lfBumpBudgetDb'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'qes',
    title: 'How much may the filter loosen the woofer’s own damping?',
    rowIds: ['qesMultiplierMax'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'damping',
    title: 'How much attenuation may a way spend beyond its measured gap?',
    rowIds: ['dampingMarginDb'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'spl-window',
    title: 'How flat must the finished design be?',
    rowIds: ['splWindowPlusMinusDb'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'phase',
    title: 'How closely must two drivers track in phase where they hand over?',
    rowIds: ['maxPhaseTrackingDeg'],
    control: 'settings',
    requires: 'all',
    skip: 'unjudged',
  },
  {
    id: 'voicing',
    title: 'What should count as flat?',
    rowIds: ['targetCurve', 'plateauDepthDb'],
    control: 'voicing',
    requires: 'any',
    /* THE ONE SCREEN WHERE BLANK IS NOT AN ABSENCE. Flat is the neutral
     * reference and is stated by being chosen (V45, A5e.2) — so this screen's
     * skip does not withdraw a judgement, it accepts one. */
    skip: 'neutral',
  },
]);

/** The register index of a row id; −1 when the register does not know it. */
const registerIndex = (rowId: string): number => V2_INPUT_REGISTER.findIndex((r) => r.id === rowId);

/** The rows a screen holds, from the register, in register order. */
export const screenRows = (screen: V2RequirementScreen): readonly V2InputRow[] =>
  screen.rowIds
    .map((id) => V2_INPUT_REGISTER.find((r) => r.id === id))
    .filter((r): r is V2InputRow => r !== undefined)
    .slice()
    .sort((a, b) => registerIndex(a.id) - registerIndex(b.id));

/** The screen a row id belongs to, or undefined. */
export const screenForRow = (rowId: string): V2RequirementScreen | undefined =>
  V2_REQUIREMENT_SCREENS.find((s) => s.rowIds.includes(rowId));

/** Where to look for the number. A place, never a hint. */
export const SOURCE_WORDS: Readonly<Record<V2InputSource, string>> = Object.freeze({
  datasheet: 'the driver’s datasheet',
  nameplate: 'the amplifier’s nameplate or spec sheet',
  measurement: 'a measurement — a sweep, a file header, a ruler, a meter',
  choice: 'your decision — no measurement produces it',
});

/**
 * Where a screen's numbers come from. One screen can hold rows from two
 * sources (the excursion screen asks the amplifier for two of its three), so
 * this returns the set, in the order the rows appear.
 */
export const screenSources = (screen: V2RequirementScreen): readonly V2InputSource[] => {
  const out: V2InputSource[] = [];
  for (const r of screenRows(screen)) if (!out.includes(r.source)) out.push(r.source);
  return out;
};

/** One line of what skipping costs: the row it is about, and the register's sentence. */
export interface V2SkipConsequence {
  rowId: string;
  label: string;
  means: string;
  /** True for the one judgement input whose blank DEFERS rather than disarms. */
  defers: boolean;
}

/**
 * WHAT SKIPPING THIS SCREEN COSTS — one line per input, in the register's own
 * words. Not a summary: a summary of fifteen consequences is fifteen chances
 * to soften one, and the sentence that gets softened is the one nobody reads.
 */
export const skipMeansFor = (screen: V2RequirementScreen): readonly V2SkipConsequence[] => {
  const defers = new Set<string>(JUDGEMENT_KEYS_WHERE_BLANK_DEFERS);
  return screenRows(screen).map((r) => ({
    rowId: r.id,
    label: r.label,
    means: r.emptyMeans,
    defers: r.key !== undefined && defers.has(r.key),
  }));
};

/** The words on the skip button — which say what the button does. */
export const skipLabelFor = (screen: V2RequirementScreen): string =>
  screen.skip === 'neutral'
    ? 'Keep flat — the neutral reference'
    : 'Skip — leave this unjudged';

/* ==================================================================== *
 * 3 — WHAT THE PROJECT HOLDS, READ BACK PER SCREEN
 * ==================================================================== */

/**
 * The value of every requirement row, keyed by ROW ID and raw as the form
 * holds it: '' is absent, everywhere (P4). Keyed by row id rather than by
 * settings key because three of the fifteen screens hold inputs that are not
 * settings keys at all, and a reader that could not see those would report a
 * stated voicing as a skipped one.
 */
export type V2GuidedValues = Readonly<Record<string, string>>;

/** Every row id a requirement screen holds, in screen order. */
export const REQUIREMENT_ROW_IDS: readonly string[] = Object.freeze(
  V2_REQUIREMENT_SCREENS.flatMap((s) => screenRows(s).map((r) => r.id)),
);

/**
 * Build the value record the readers below take.
 *
 * `settings` is the v2 settings block; `extra` carries the three inputs that
 * live elsewhere, by row id. Anything the caller does not supply reads as
 * absent — which is what it is.
 */
export function guidedValues(
  settings: Readonly<Record<string, string>>,
  extra: Readonly<Record<string, string>> = {},
): V2GuidedValues {
  const out: Record<string, string> = {};
  for (const id of REQUIREMENT_ROW_IDS) {
    const row = V2_INPUT_REGISTER.find((r) => r.id === id);
    const key: V2SettingKey | undefined = row?.key;
    const raw = key !== undefined ? settings[key] : extra[id];
    out[id] = typeof raw === 'string' ? raw : '';
  }
  return Object.freeze(out);
}

/**
 * THE ROWS THAT REFINE RATHER THAN STATE.
 *
 * An unanswered one of these does not leave a screen half-stated: the per-way
 * drive figure refines a stated dB figure, the series-R maximum only exists
 * once its own mode asks for it, and a flat curve has no depth to be missing.
 * Named rather than inferred — a new row cannot join this set by accident, and
 * the test asserts every name here is a row a screen actually holds.
 */
export const REFINING_ROW_IDS: readonly string[] = Object.freeze([
  /* A stated dB figure per way refines the single figure above it; on an
   * `any` screen either one is an answer. */
  'driveOnFsMaxDb-per-way',
  /* Only exists once its own mode asks for it — see `conditional` above. */
  'lowestWaySeriesRMaxOhm',
  /* Blank DEFERS rather than disarms: M-A/part then judges at the amplifier's
   * continuous power and the gate row says which power it read (V50/V51, the
   * one such input in the register). */
  'resistorThermalPowerW',
  /* A flat curve has no depth to be missing. */
  'plateauDepthDb',
]);

/** The rows of a screen that must be answered for the screen to state anything. */
export const requiredRows = (screen: V2RequirementScreen): readonly V2InputRow[] =>
  screenRows(screen).filter((r) => !REFINING_ROW_IDS.includes(r.id));

export type V2ScreenStatus = 'stated' | 'partly' | 'blank';

/**
 * What a screen holds.
 *
 * `partly` is a state worth having its own name: it is precisely the failure
 * the grouping exists to prevent — a peak power without its nominal load, a
 * resistor class without its margin — and it judges nothing while looking, on
 * a filled-in field, exactly like an answer. The route says so on the screen
 * and again in the summary.
 *
 * The voicing is the exception the type carries: `targetCurve` blank IS flat,
 * so a screen whose blank is neutral reads `stated` when its first row holds
 * a value and `blank` otherwise — never `partly`, because a flat curve has no
 * depth to be missing.
 */
export function screenStatus(values: V2GuidedValues, screen: V2RequirementScreen): V2ScreenStatus {
  const has = (id: string) => (values[id] ?? '').trim() !== '';
  const rows = screenRows(screen);
  if (!rows.some((r) => has(r.id))) return 'blank';
  /* ON AN `any` SCREEN EVERY ROW IS AN ALTERNATIVE, refining ones included:
   * "refining" says what a row adds to the OTHERS on its screen, and where the
   * rows are alternatives there is nothing to refine. A stated per-way M-C
   * figure arms that way's gate on its own, and reading it as unanswered would
   * report as absent a limit the engine did receive. The voicing rides on the
   * same rule: choosing a curve is the answer, and a plateau DEPTH alone is
   * not one — nothing above this line is blank, so it is stated. */
  if (screen.requires === 'any') return 'stated';
  const required = requiredRows(screen).map((r) => r.id);
  /* The one conditional in the register: a mode that needs a number is not
   * answered until it has one (V51b — `series-r-max` without a maximum binds
   * nothing, and the whole rule reads as not stated). */
  const cond = screen.conditional;
  if (cond && (values[cond.whenRow] ?? '').trim() === cond.hasValue) required.push(cond.rowId);
  const filled = required.filter(has);
  return filled.length === required.length ? 'stated' : 'partly';
}

/**
 * The screens holding nothing at all — what the shortlist reports as not
 * judged.
 *
 * A screen whose blank is NEUTRAL is not one of them, and that is the whole
 * distinction this route makes: the voicing has an answer whether or not
 * anyone typed one (flat, stated by being chosen), so reporting it as
 * unjudged would be a false alarm about the one requirement that is never
 * absent. `screenStatus` still calls it blank, which is the truthful word for
 * a field nobody has touched, and the wizard uses that to show progress.
 */
export const skippedScreens = (values: V2GuidedValues): readonly V2RequirementScreen[] =>
  V2_REQUIREMENT_SCREENS.filter((s) => s.skip !== 'neutral' && screenStatus(values, s) === 'blank');

/** The screens holding part of an answer, which judge nothing while looking answered. */
export const partlyScreens = (values: V2GuidedValues): readonly V2RequirementScreen[] =>
  V2_REQUIREMENT_SCREENS.filter((s) => screenStatus(values, s) === 'partly');

/**
 * THE LINE THE SHORTLIST CARRIES AFTER A GUIDED RUN: which requirements were
 * not stated, by name.
 *
 * The gate column has always said `off` per row and the requirement list
 * "— no requirement stated" (P4, and I-1 checked it per field). What it could
 * not say is the thing the designer wants at that moment: HOW MANY of the
 * questions they were asked went unanswered, and which. Null when everything
 * was answered — a line that says "0 skipped" is noise.
 */
export function describeSkipped(values: V2GuidedValues): string | null {
  const skipped = skippedScreens(values);
  const partly = partlyScreens(values);
  if (skipped.length === 0 && partly.length === 0) return null;
  const parts: string[] = [];
  if (skipped.length > 0) {
    parts.push(
      `${skipped.length} requirement${skipped.length === 1 ? '' : 's'} you skipped ` +
        `${skipped.length === 1 ? 'is' : 'are'} not judged: ` +
        skipped.map((s) => screenName(s)).join(', ') +
        '.',
    );
  }
  if (partly.length > 0) {
    parts.push(
      `${partly.length} ${partly.length === 1 ? 'is' : 'are'} half-stated and judge${partly.length === 1 ? 's' : ''} nothing either: ` +
        partly.map((s) => screenName(s)).join(', ') +
        '.',
    );
  }
  parts.push('Every one of them is still measured and shown; none of them decided anything.');
  return parts.join(' ');
}

/**
 * A screen's name in a summary line: the labels of the inputs that have to be
 * answered for it to state anything — read from the register, never re-typed,
 * so a renamed field renames itself here too.
 */
export const screenName = (screen: V2RequirementScreen): string =>
  requiredRows(screen)
    .map((r) => r.label)
    .join(' + ');

/* ==================================================================== *
 * 4 — THE RUN: the exploration is the standard, and the cost is MEASURED
 * ==================================================================== */

/**
 * WHAT A RUN COSTS, MEASURED, WITH THE MEASUREMENT NAMED.
 *
 * A guided user's first question about a button that runs for half an hour is
 * how long it runs for, and the panel answered it with "minutes to half an
 * hour" and "hours". Those are true and they are not numbers. These are, and
 * each carries the case and the date it was measured on so it cannot age
 * quietly into a promise: a figure whose provenance is on it can be checked,
 * and a figure without one gets believed.
 */
export const EXPLORATION_MEASURED = Object.freeze({
  seconds: 2032,
  candidates: 6,
  where: 'casus 1, a three-way, in a headless Chrome (E-2, 06-09-2026)',
});
export const EXPLORATION_MEASURED_TWO_WAY = Object.freeze({
  seconds: 496,
  candidates: 5,
  where: 'casus 1b, a two-way, in a headless Chrome (E-3b, 06-09-2026)',
});
export const FULL_FIELD_MEASURED = Object.freeze({
  seconds: 17884,
  candidates: 24,
  where:
    'casus 1 in the generator, across eight parallel processes (A5e.3c, 06-09-2026); the browser runs its candidates one at a time',
});

/** Seconds as the reader thinks of them: minutes under an hour, else hours. */
export function humanDuration(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return rest === 0 ? `${hours} hours` : `${hours} h ${rest} min`;
}

/**
 * The two run choices, said in the order guided offers them: the exploration
 * IS the standard, and the full field is the thing you ask for afterwards.
 * `chainBudget` is passed in rather than imported — the engine constant lives
 * in `engine2/`, which this file may not reach.
 */
export function describeRunChoice(mode: 'exploration' | 'full', chainBudget: number): string {
  if (mode === 'exploration') {
    return (
      `the standard run, and what the button does. A field of at most ${chainBudget} candidate ` +
      'crossovers: the middle of each ' +
      'window first and then its nearest neighbours, one filter alignment per handover. Measured at ' +
      `${humanDuration(EXPLORATION_MEASURED.seconds)} for ${EXPLORATION_MEASURED.candidates} candidates on ` +
      `${EXPLORATION_MEASURED.where}, and ${humanDuration(EXPLORATION_MEASURED_TWO_WAY.seconds)} for ` +
      `${EXPLORATION_MEASURED_TWO_WAY.candidates} on ${EXPLORATION_MEASURED_TWO_WAY.where}. ` +
      'Same requirements, same gates, same seed as the full field — a smaller field, not a looser search.'
    );
  }
  return (
    'every window edge to edge and every admitted filter order. Hours: ' +
    `${humanDuration(FULL_FIELD_MEASURED.seconds)} for ${FULL_FIELD_MEASURED.candidates} candidates on ` +
    `${FULL_FIELD_MEASURED.where}. Ask for it once an exploration has shown you the middle of the field.`
  );
}

/* ==================================================================== *
 * 5 — THE NUMERIC BOUNDS OF A REQUIREMENT FIELD
 * ==================================================================== */

/** The `min`/`max`/`step` a requirement's input carries, and its unit suffix. */
export interface V2RequirementInput {
  min?: number;
  max?: number;
  step?: number;
  /** Shown after the field. Presentation; the label already names the quantity. */
  unit?: string;
}

/**
 * WHAT THE GUIDED FIELD ALLOWS, AND WHY IT IS DATA RATHER THAN A THIRD OPINION.
 *
 * Guided and expert are two views of one project, so they render two inputs
 * over one piece of state — and two inputs can disagree about what may be
 * typed into it. A dissipation the expert panel caps at 100 % and guided does
 * not is a state only one of the two screens will admit exists.
 *
 * The bounds therefore live here once, and `v2Guided.test.ts` reads the EXPERT
 * panel's own JSX out of `App.tsx` and asserts that every one of these agrees
 * with the attributes beside that field. Copying them into a comment would
 * have been the drift this file exists to prevent; a test that reads the other
 * copy cannot drift, it can only fail.
 */
export const REQUIREMENT_INPUT: Readonly<Partial<Record<V2SettingKey, V2RequirementInput>>> =
  Object.freeze({
    maxDissipationPct: { min: 0, max: 100, unit: '%' },
    minEpdrOhm: { min: 0, step: 0.1, unit: 'Ω' },
    maxDriveOnFsDb: { max: 0, unit: 'dB' },
    amplifierPeakPowerW: { min: 0, unit: 'W' },
    amplifierNominalLoadOhm: { min: 0, step: 1, unit: 'Ω' },
    xmaxMarginFraction: { min: 0, max: 1, step: 0.05 },
    amplifierPowerW: { min: 0, unit: 'W' },
    resistorClassW: { min: 0, unit: 'W' },
    resistorPowerMargin: { min: 0, max: 1, step: 0.05 },
    coilClassA: { min: 0, step: 0.1, unit: 'A' },
    resistorThermalPowerW: { min: 0, unit: 'W' },
    lowestWaySeriesRMaxOhm: { min: 0, step: 0.1, unit: 'Ω' },
    lfBumpBudgetDb: { min: 0, step: 0.1, unit: 'dB' },
    qesMultiplierMax: { min: 1, step: 0.1, unit: '×' },
    dampingMarginDb: { min: 0, step: 0.1, unit: 'dB' },
    splWindowPlusMinusDb: { min: 0, step: 0.1, unit: 'dB' },
    maxPhaseTrackingDeg: { min: 0, step: 0.5, unit: '°' },
  });

/** The three modes of the level-work rule, in the order the form offers them. */
export const LEVEL_WORK_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: '', label: 'not stated' },
  { value: 'none', label: 'none (no series R, no shunt pad)' },
  { value: 'series-r-max', label: 'series R up to a maximum, no pad' },
]);
