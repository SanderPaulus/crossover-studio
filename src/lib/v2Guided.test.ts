/**
 * I-3 — THE GUIDED ROUTE ASKS EVERY REQUIREMENT, SAYS WHAT SKIPPING COSTS,
 * AND WRITES THE SAME PROJECT STATE EXPERT WRITES.
 *
 * Two halves, and the second is the one that can rot — the I-1 lesson, which
 * is the UI-1 lesson one layer up: a module of data proves only that the data
 * is well formed, and the screen after it sat outside every test for months
 * doing the wrong thing. So every claim about `App.tsx` below is a SOURCE
 * SCAN, in the idiom `v2Settings.test.ts`, `selection.test.ts` and
 * `v2InputRegister.test.ts` already use, and each was checked to be
 * falsifiable before it was written down.
 *
 * The claim this file exists for is the third one in the second half: guided
 * has NO STORE OF ITS OWN. One project state, two views — so a requirement
 * stated in the wizard is stated in the panel, and the route cannot end by
 * asking the designer to type their answers again.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPLORATION_MEASURED,
  EXPLORATION_MEASURED_TWO_WAY,
  FULL_FIELD_MEASURED,
  LEVEL_WORK_OPTIONS,
  REFINING_ROW_IDS,
  REQUIREMENT_INPUT,
  REQUIREMENT_ROW_IDS,
  SOURCE_WORDS,
  V2_GUIDED_STAGES,
  V2_REQUIRED_BY_STAGE,
  V2_REQUIREMENT_SCREENS,
  describeRunChoice,
  describeSkipped,
  guidedEngineNote,
  guidedStages,
  guidedValues,
  humanDuration,
  requiredRows,
  requiredRowsOfStage,
  screenForRow,
  screenName,
  screenRows,
  screenSources,
  screenStatus,
  skipLabelFor,
  skipMeansFor,
  skippedScreens,
} from './v2Guided.ts';
import {
  JUDGEMENT_KEYS_WHERE_BLANK_DEFERS,
  V2_INPUT_REGISTER,
  V2_JUDGEMENT_ROWS,
  rowsOfClass,
} from './v2InputRegister.ts';
import { EMPTY_V2_SETTINGS, UNSET_GHOST, type V2SettingKey } from './v2Settings.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');

/** The guided requirements pane: everything the new tab renders. */
const REQ_PANE = (() => {
  const start = APP.indexOf("{designTab === 'requirements' && engineV2Enabled && (() => {");
  expect(start, 'the requirements pane is rendered').toBeGreaterThan(0);
  const end = APP.indexOf("{designTab === 'filters' && !result && (", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
})();

/** The one function that renders a requirement's control. */
const FIELD_RENDERER = (() => {
  const start = APP.indexOf('const v2RequirementField = (rowId: string): ReactNode => {');
  expect(start, 'the requirement field renderer exists').toBeGreaterThan(0);
  const end = APP.indexOf('const v2ReqStatedMark =', start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
})();

const registerIx = (id: string) => V2_INPUT_REGISTER.findIndex((r) => r.id === id);

/* ==================================================================== *
 * THE SCREENS COVER THE REGISTER, IN THE REGISTER'S ORDER
 * ==================================================================== */

describe('the screens are the register, grouped', () => {
  it('every judgement row is on exactly one screen, and no screen invents one', () => {
    /* The claim that makes the route un-forgettable: add a requirement to the
     * register and it either gets a screen or this fails. Equality both ways,
     * not containment — the E-4/A5e.3c lesson about subset assertions. */
    const onScreens = V2_REQUIREMENT_SCREENS.flatMap((s) => s.rowIds);
    expect(new Set(onScreens).size, 'a row on two screens').toBe(onScreens.length);
    expect([...onScreens].sort()).toEqual([...V2_JUDGEMENT_ROWS.map((r) => r.id)].sort());
  });

  it('the screens run in the register’s order, and so do the rows inside them', () => {
    const firsts = V2_REQUIREMENT_SCREENS.map((s) => registerIx(screenRows(s)[0].id));
    expect(firsts).toEqual([...firsts].sort((a, b) => a - b));
    for (const s of V2_REQUIREMENT_SCREENS) {
      const ix = screenRows(s).map((r) => registerIx(r.id));
      expect(ix, s.id).toEqual([...ix].sort((a, b) => a - b));
    }
  });

  it('every screen asks a question, holds rows, and names where to look', () => {
    for (const s of V2_REQUIREMENT_SCREENS) {
      expect(s.title.trim(), s.id).not.toBe('');
      expect(s.title, s.id).toContain('?');
      expect(screenRows(s).length, s.id).toBeGreaterThan(0);
      expect(requiredRows(s).length, s.id).toBeGreaterThan(0);
      expect(screenSources(s).length, s.id).toBeGreaterThan(0);
      for (const src of screenSources(s)) expect(SOURCE_WORDS[src], s.id).toBeTruthy();
      expect(screenName(s).trim(), s.id).not.toBe('');
      expect(screenForRow(s.rowIds[0]), s.id).toBe(s);
      expect(['all', 'any'], s.id).toContain(s.requires);
      /* A single-input screen cannot be half-answered whichever rule it
         carries, so the rule only means anything where there is more than one
         required input — and there it must be a deliberate choice. */
      if (requiredRows(s).length > 1) expect(['all', 'any'], s.id).toContain(s.requires);
    }
  });

  it('FOURTEEN screens are requirements and exactly ONE is the neutral voicing', () => {
    /* The brief asked for "the fourteen I-1 sentences" and the register yields
     * fifteen screens; the difference is not a miscount, it is the voicing —
     * where blank is not an absence but flat, the neutral reference stated by
     * being chosen (V45, A5e.2). Pinned as a SET and not only as a count, so a
     * sixteenth screen cannot arrive as a second "neutral" one. */
    const neutral = V2_REQUIREMENT_SCREENS.filter((s) => s.skip === 'neutral');
    expect(neutral.map((s) => s.id)).toEqual(['voicing']);
    expect(V2_REQUIREMENT_SCREENS.filter((s) => s.skip === 'unjudged')).toHaveLength(14);
    expect(V2_REQUIREMENT_SCREENS).toHaveLength(15);
  });

  it('the refining rows are rows a screen actually holds', () => {
    for (const id of REFINING_ROW_IDS) expect(screenForRow(id), id).toBeDefined();
    /* …and they are refinements, never the whole of a screen: a screen made of
     * nothing but refining rows could never be `partly` and never be answered. */
    for (const s of V2_REQUIREMENT_SCREENS)
      expect(requiredRows(s).length, s.id).toBeGreaterThan(0);
  });

  it('every row of every screen is reachable by id from the register', () => {
    expect(REQUIREMENT_ROW_IDS).toHaveLength(V2_JUDGEMENT_ROWS.length);
    for (const id of REQUIREMENT_ROW_IDS) expect(registerIx(id), id).toBeGreaterThanOrEqual(0);
  });
});

/* ==================================================================== *
 * WHAT SKIPPING COSTS IS THE REGISTER'S SENTENCE, NOT A SECOND COPY
 * ==================================================================== */

describe('the consequence of skipping', () => {
  it('is the register’s own sentence, verbatim, for every input on the screen', () => {
    for (const s of V2_REQUIREMENT_SCREENS) {
      const rows = screenRows(s);
      const cost = skipMeansFor(s);
      expect(cost.map((c) => c.rowId), s.id).toEqual(rows.map((r) => r.id));
      for (const c of cost) {
        const row = V2_INPUT_REGISTER.find((r) => r.id === c.rowId)!;
        expect(c.means, c.rowId).toBe(row.emptyMeans);
        expect(c.label, c.rowId).toBe(row.label);
      }
    }
  });

  it('marks the ONE input whose blank defers instead of disarming, and only it', () => {
    const marked = V2_REQUIREMENT_SCREENS.flatMap((s) =>
      skipMeansFor(s).filter((c) => c.defers).map((c) => c.rowId),
    );
    const expected = JUDGEMENT_KEYS_WHERE_BLANK_DEFERS.map(
      (k) => V2_INPUT_REGISTER.find((r) => r.key === k)!.id,
    );
    expect(marked).toEqual(expected);
  });

  it('the button says what it does, and the voicing’s says something else', () => {
    for (const s of V2_REQUIREMENT_SCREENS) {
      const label = skipLabelFor(s);
      if (s.skip === 'neutral') {
        expect(label).toContain('flat');
        expect(label.toLowerCase()).not.toContain('skip');
      } else {
        expect(label.toLowerCase(), s.id).toContain('skip');
        expect(label.toLowerCase(), s.id).toContain('unjudged');
      }
    }
  });
});

/* ==================================================================== *
 * WHAT THE PROJECT HOLDS, READ BACK
 * ==================================================================== */

const stateWith = (over: Partial<Record<string, string>> = {}) =>
  guidedValues({ ...EMPTY_V2_SETTINGS, ...over }, over as Record<string, string>);

describe('reading the project back per screen', () => {
  it('a fresh project states nothing, and every screen says so', () => {
    const v = stateWith();
    for (const s of V2_REQUIREMENT_SCREENS) expect(screenStatus(v, s), s.id).toBe('blank');
    for (const id of REQUIREMENT_ROW_IDS) expect(v[id], id).toBe('');
  });

  it('a screen whose required inputs are all filled reads STATED', () => {
    const v = stateWith({ resistorClassW: '10', resistorPowerMargin: '0.5', resistorThermalPowerW: '' });
    const resistors = V2_REQUIREMENT_SCREENS.find((s) => s.id === 'resistors')!;
    expect(screenStatus(v, resistors)).toBe('stated');
  });

  it('half of a both-or-neither answer reads PARTLY — the state the grouping exists to catch', () => {
    const half = stateWith({ amplifierPeakPowerW: '160' });
    const excursion = V2_REQUIREMENT_SCREENS.find((s) => s.id === 'excursion')!;
    expect(screenStatus(half, excursion)).toBe('partly');
    const whole = stateWith({
      amplifierPeakPowerW: '160',
      amplifierNominalLoadOhm: '8',
      xmaxMarginFraction: '0.5',
    });
    expect(screenStatus(whole, excursion)).toBe('stated');
  });

  it('ALTERNATIVES are answered by either of them, and never read half-answered', () => {
    /* The counter-case to the rule above, and the reason a screen carries a
     * rule at all: the single M-C figure and a figure stated per way are two
     * ways of answering one question, so either is an answer. Reporting a
     * per-way figure as "half-stated" would be a false alarm about a limit
     * that is in fact armed. */
    const drive = V2_REQUIREMENT_SCREENS.find((s) => s.id === 'drive-on-fs')!;
    expect(drive.requires).toBe('any');
    expect(screenStatus(stateWith({ 'driveOnFsMaxDb-per-way': '-20' }), drive)).toBe('stated');
    expect(screenStatus(stateWith({ maxDriveOnFsDb: '-20' }), drive)).toBe('stated');
    expect(screenStatus(stateWith(), drive)).toBe('blank');
  });

  it('a mode that needs a number is not answered until it has one (V51b)', () => {
    /* The one conditional in the register. `series-r-max` without a maximum
     * binds nothing and the whole rule reads as not stated, so the screen has
     * to say half-answered rather than answered — otherwise the walk would
     * report a topology requirement the engine never received. */
    const lw = V2_REQUIREMENT_SCREENS.find((s) => s.id === 'level-work')!;
    expect(lw.conditional?.rowId).toBe('lowestWaySeriesRMaxOhm');
    expect(screenStatus(stateWith({ lowestWayLevelWork: 'none' }), lw)).toBe('stated');
    expect(screenStatus(stateWith({ lowestWayLevelWork: 'series-r-max' }), lw)).toBe('partly');
    expect(
      screenStatus(stateWith({ lowestWayLevelWork: 'series-r-max', lowestWaySeriesRMaxOhm: '1.0' }), lw),
    ).toBe('stated');
  });

  it('the voicing is never reported as skipped: blank there IS flat', () => {
    const v = stateWith();
    expect(skippedScreens(v).map((s) => s.id)).not.toContain('voicing');
    expect(skippedScreens(v)).toHaveLength(14);
    /* …and it still reads `blank` to the wizard, which is the truthful word
     * for a field nobody has touched and what the progress dots show. */
    expect(screenStatus(v, V2_REQUIREMENT_SCREENS.find((s) => s.id === 'voicing')!)).toBe('blank');
    expect(screenStatus(stateWith({ targetCurve: 'bass-plateau' }), V2_REQUIREMENT_SCREENS.find((s) => s.id === 'voicing')!)).toBe('stated');
  });

  it('the summary names what went unanswered, and says nothing when nothing did', () => {
    const fresh = describeSkipped(stateWith());
    expect(fresh).toContain('14 requirements you skipped');
    expect(fresh).toContain('Amplifier min load');
    expect(fresh).toContain('none of them decided anything');
    const half = describeSkipped(stateWith({ amplifierPeakPowerW: '160' }));
    expect(half).toContain('half-stated');
    /* Everything stated: no line at all. "0 skipped" is noise, and a summary
       that is always present stops being read. */
    const all: Record<string, string> = {};
    for (const id of REQUIREMENT_ROW_IDS) all[id] = '1';
    expect(describeSkipped(guidedValues(
      Object.fromEntries(
        V2_INPUT_REGISTER.filter((r) => r.key).map((r) => [r.key as string, '1']),
      ) as Record<string, string>,
      all,
    ))).toBeNull();
  });

  it('guidedValues reads a settings key through its row, and absent stays absent', () => {
    const v = guidedValues({ ...EMPTY_V2_SETTINGS, minEpdrOhm: '1.6' });
    expect(v.minEpdrOhm).toBe('1.6');
    expect(v.ampMinLoadOhm).toBe('');
    expect(v.targetCurve).toBe('');
  });
});

/* ==================================================================== *
 * THE ROUTE, AND THE RUN
 * ==================================================================== */

describe('the route', () => {
  it('with Engine v2 OFF it is the five steps guided always had, in order', () => {
    expect(guidedStages(false).map((s) => s.tab)).toEqual([
      'import',
      'data',
      'drivers',
      'filters',
      'network',
    ]);
    expect(guidedStages(false).map((s) => s.label)).toEqual([
      'Your project',
      'Your cabinet',
      'Your drivers',
      'Design it',
      'Your build',
    ]);
  });

  it('with Engine v2 ON the requirements step sits between the facts and the run', () => {
    const on = guidedStages(true).map((s) => s.id);
    expect(on).toHaveLength(V2_GUIDED_STAGES.length);
    expect(on.indexOf('requirements')).toBe(on.indexOf('drivers') + 1);
    expect(on.indexOf('design')).toBe(on.indexOf('requirements') + 1);
  });

  it('every stage says what it is for, and the tabs are unique', () => {
    const tabs = V2_GUIDED_STAGES.map((s) => s.tab);
    expect(new Set(tabs).size).toBe(tabs.length);
    for (const s of V2_GUIDED_STAGES) {
      expect(s.label.trim(), s.id).not.toBe('');
      expect(s.what.trim(), s.id).not.toBe('');
    }
  });

  it('every NECESSARY input is on exactly one step, and every step is a real one', () => {
    /* I-1's required rows are measurements and geometry, so the panel could
       only point at them; the route puts each on the step where it is entered.
       Equality both ways: a new necessary input lands on a step or the build
       breaks, rather than being pointed at from a panel nobody in guided
       opens. */
    const placed = Object.values(V2_REQUIRED_BY_STAGE).flat();
    expect(new Set(placed).size, 'a required row on two steps').toBe(placed.length);
    expect([...placed].sort()).toEqual([...rowsOfClass('required').map((r) => r.id)].sort());
    const stageIds = new Set(V2_GUIDED_STAGES.map((s) => s.id));
    for (const k of Object.keys(V2_REQUIRED_BY_STAGE)) expect(stageIds, k).toContain(k);
    /* …and the rows come back from the register, with their sentences. */
    for (const k of Object.keys(V2_REQUIRED_BY_STAGE)) {
      const rows = requiredRowsOfStage(k);
      expect(rows.length, k).toBe(V2_REQUIRED_BY_STAGE[k].length);
      for (const r of rows) expect(r.emptyMeans.trim(), r.id).not.toBe('');
    }
    /* The requirements step asks judgement rows and holds no necessary one:
       it is the one step that states rather than measures. */
    expect(V2_REQUIRED_BY_STAGE.requirements).toBeUndefined();
  });

  it('the engine note is NULL on v1 — the toggle invariant, in words as well as bytes', () => {
    expect(guidedEngineNote(false)).toBeNull();
    expect(guidedEngineNote(true)).toContain('Engine v2');
  });
});

describe('what a run costs', () => {
  it('every figure names the case and the date it was measured on', () => {
    for (const m of [EXPLORATION_MEASURED, EXPLORATION_MEASURED_TWO_WAY, FULL_FIELD_MEASURED]) {
      expect(m.seconds).toBeGreaterThan(0);
      expect(m.candidates).toBeGreaterThan(0);
      /* A number without provenance gets believed; one that carries its case
         and its date can be checked. So the sentence has to hold both. */
      expect(m.where).toMatch(/casus/);
      expect(m.where).toMatch(/\d{2}-\d{2}-\d{4}/);
    }
  });

  it('reads seconds the way a reader thinks of them', () => {
    expect(humanDuration(45)).toBe('45 seconds');
    expect(humanDuration(2032)).toBe('34 minutes');
    expect(humanDuration(17884)).toBe('4 h 58 min');
    expect(humanDuration(7200)).toBe('2 hours');
  });

  it('the exploration is described as the standard and the full field as the ask', () => {
    const exp = describeRunChoice('exploration', 8);
    expect(exp).toContain('standard');
    expect(exp).toContain('8');
    expect(exp).toContain('34 minutes');
    expect(exp).toContain('a smaller field, not a looser search');
    const full = describeRunChoice('full', 8);
    expect(full).toContain('4 h 58 min');
    expect(full.toLowerCase()).toContain('hours');
  });
});

/* ==================================================================== *
 * THE APP READS ALL OF IT — SOURCE SCANS
 * ==================================================================== */

describe('App.tsx walks this route', () => {
  it('the requirements pane renders only under the v2 flag, and the tab is guarded', () => {
    expect(APP).toContain("{designTab === 'requirements' && engineV2Enabled && (() => {");
    /* Persisted like every other tab, so a session that left the browser
       standing there and came back with the flag off must not land on a pane
       that renders nothing. */
    expect(APP).toContain(
      "if (designTab === 'requirements' && !(uiMode === 'guided' && engineV2Enabled))",
    );
  });

  it('the step bar, the palette and the Next button all read ONE route', () => {
    /* A second copy of the route is how the palette becomes a second map —
       the warning on `GUIDED_STEP_LABEL` — and the new step would have been
       the first thing a copy lost. Three readers, one list. */
    expect(APP).toContain('{guidedStages(engineV2Enabled).map((stage, i) => {');
    expect(APP).toContain('? guidedStages(engineV2Enabled).map((st) => st.tab)');
    expect(APP).toContain('const order = guidedStages(engineV2Enabled);');
    /* …and the five hard-coded labels the Next row carried are gone. */
    expect(APP).not.toContain("const labels: Record<(typeof order)[number], string> = {");
  });

  it('every requirement row has a control, and the pane renders them from the screen', () => {
    for (const id of REQUIREMENT_ROW_IDS) {
      const key = V2_INPUT_REGISTER.find((r) => r.id === id)?.key;
      const named =
        FIELD_RENDERER.includes(`'${id}'`) || (key !== undefined && FIELD_RENDERER.includes(`'${key}'`));
      /* A keyed row is served by the generic numeric branch; the three rows
         that are not settings keys must be named explicitly, or the screen
         would show a question with no field under it. */
      expect(named || key !== undefined, id).toBe(true);
    }
    expect(REQ_PANE).toContain('{rows.map((row) => v2RequirementField(row.id))}');
    expect(REQ_PANE).toContain('screenRows(sc)');
  });

  it('NO requirement field carries a numeric placeholder (E-2, where it matters most)', () => {
    /* A wizard is where a helpful-looking suggested value does the most damage:
       it arrives when the reader has least reason to doubt it. Every field in
       the walk shows the unset mark and nothing else. */
    const placeholders = [...FIELD_RENDERER.matchAll(/placeholder=\{?["{]?([^}"\n]*)/g)].map(
      (m) => m[1].trim(),
    );
    expect(placeholders.length).toBeGreaterThan(3);
    for (const p of placeholders) expect(p, `placeholder ${p}`).toBe('UNSET_GHOST');
    expect(UNSET_GHOST).toBe('—');
  });

  it('the skip button and the cost of skipping are both on the screen', () => {
    expect(REQ_PANE).toContain('skipMeansFor(sc).map');
    expect(REQ_PANE).toContain("{t('If you leave this blank:')}");
    expect(REQ_PANE).toContain('skipLabelFor(sc)');
    /* Skipping CLEARS, because the button promises "unjudged" and merely
       walking past a half-filled screen would not deliver it. */
    expect(REQ_PANE).toContain('clearScreen(sc);');
    expect(REQ_PANE).toContain('Skip — clear this and leave it unjudged');
  });

  it('guided keeps NO store of its own: every answer is written to the app’s state', () => {
    /* The claim the brief turns on. The renderer writes `setV2Field`,
       `setAmpMinLoadOhm`, `setV2Meas` and the design's own `targetCurve` — the
       same setters the expert panel uses — and holds no state itself. The only
       thing the walk remembers is a CURSOR, and the test names it so a second
       `useState` cannot join it unnoticed. */
    for (const setter of ['setV2Field(', 'setAmpMinLoadOhm(', 'setV2Meas(', 'setDesigns(']) {
      expect(FIELD_RENDERER, setter).toContain(setter);
    }
    expect(FIELD_RENDERER).not.toContain('useState');
    expect(REQ_PANE).not.toContain('useState');
    expect(APP).toContain("const [v2ReqIx, setV2ReqIxRaw] = useState<number>(() => {");
    expect(APP).toContain("localStorage.setItem('ads-v2-req-ix', String(clamped));");
  });

  it('each step shows what Engine v2 needs from it, under the flag', () => {
    expect(APP).toContain("{uiMode === 'guided' &&\n              engineV2Enabled &&");
    expect(APP).toContain('requiredRowsOfStage(stage.id)');
    expect(APP).toContain("{t('Engine v2 needs from this step')}");
  });

  it('the run step says the exploration is the standard, with the measured cost', () => {
    expect(APP).toContain("{uiMode === 'guided' && engineV2Enabled && (");
    expect(APP).toContain("describeRunChoice('exploration', EXPLORATION_CHAIN_BUDGET)");
    expect(APP).toContain("describeRunChoice('full', EXPLORATION_CHAIN_BUDGET)");
    /* …and the v1 sentence ("nine complete designs") no longer describes a v2
       run: it is a v1 scan and wrong here in every particular. */
    expect(APP).toContain("{uiMode === 'guided' && !engineV2Enabled && (");
  });

  it('the shortlist names the requirements that went unanswered', () => {
    const shortlist = APP.slice(APP.indexOf('{v2Shortlist && ('));
    expect(shortlist).toContain('describeSkipped(v2GuidedValues)');
    expect(shortlist).toContain("{t('Continue in Expert →')}");
  });

  it('the mode switch says which engine is behind guided, and nothing on v1', () => {
    expect(APP).toContain("m === 'guided' ? guidedEngineNote(engineV2Enabled) : null");
  });
});

/* ==================================================================== *
 * ONE STATE, TWO INPUTS: THE BOUNDS MAY NOT DISAGREE
 * ==================================================================== */

describe('the guided field and the expert field allow the same numbers', () => {
  /** The attributes on the expert panel's own input for a settings key. */
  const expertInput = (key: V2SettingKey) => {
    const at = APP.indexOf(`value={engineV2Settings.${key}}`);
    expect(at, key).toBeGreaterThan(0);
    const open = Math.max(APP.lastIndexOf('<input', at), APP.lastIndexOf('<select', at));
    const jsx = APP.slice(open, at);
    const num = (name: string) => {
      const m = jsx.match(new RegExp(`${name}=[{"]([-\\d.]+)`));
      return m ? Number(m[1]) : undefined;
    };
    return { min: num('min'), max: num('max'), step: num('step') };
  };

  it('every bound the walk states matches the panel’s own attribute', () => {
    /* Two views over one piece of state can disagree about what may be typed
       into it, and a dissipation the panel caps at 100 % and the walk does not
       is a value only one screen admits exists. Read from the other copy, so
       this cannot drift — it can only fail. */
    for (const [key, spec] of Object.entries(REQUIREMENT_INPUT) as [
      V2SettingKey,
      NonNullable<(typeof REQUIREMENT_INPUT)[V2SettingKey]>,
    ][]) {
      const expert = expertInput(key);
      expect(spec.min, `${key} min`).toBe(expert.min);
      expect(spec.max, `${key} max`).toBe(expert.max);
      expect(spec.step, `${key} step`).toBe(expert.step);
    }
  });

  it('every keyed requirement row that takes a number has a bound entry', () => {
    const selects: V2SettingKey[] = ['lowestWayLevelWork'];
    for (const id of REQUIREMENT_ROW_IDS) {
      const key = V2_INPUT_REGISTER.find((r) => r.id === id)?.key;
      if (key === undefined || selects.includes(key)) continue;
      expect(REQUIREMENT_INPUT[key], id).toBeDefined();
    }
  });

  it('the level-work modes are the panel’s three, in the panel’s order', () => {
    /* The LAST occurrence: the guided renderer maps `LEVEL_WORK_OPTIONS` and
       writes no literal options, so the panel's own select is the one to read. */
    const at = APP.lastIndexOf('value={engineV2Settings.lowestWayLevelWork}');
    const jsx = APP.slice(at, APP.indexOf('</select>', at));
    for (const o of LEVEL_WORK_OPTIONS) expect(jsx, o.value).toContain(`value="${o.value}"`);
    expect(LEVEL_WORK_OPTIONS.map((o) => o.value)).toEqual(['', 'none', 'series-r-max']);
  });
});
