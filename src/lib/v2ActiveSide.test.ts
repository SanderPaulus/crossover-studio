/**
 * H-2 — THE HYBRID IS A ROUTE THROUGH THE APP, and the app really takes it.
 * H-2b — "HYBRID MODE", AND THE LEAN FORM: two measured ways are enough.
 *
 * TWO HALVES, and the second is why this file exists at all.
 *
 *   1. THE STATEMENT IS WELL FORMED — the fields read once, every missing
 *      input named rather than guessed, the FORM derived from what is measured
 *      and not from a button, and a list parsed under the grammar the designer
 *      was promised (decimal comma or point, semicolon or space between
 *      values, an ambiguous comma refused). A test over pure functions, and
 *      it proves only that the reading is honest.
 *   2. THE APP ROUTES IT — a SOURCE SCAN, the idiom `v2Settings.test.ts`,
 *      `selection.test.ts`, `v2InputPlacement.test.ts` and `demoBundle.test.ts`
 *      already use, for the reason UI-1 paid for: what a function test cannot
 *      reach is whether the screen and the run DO it. H-1 built the whole
 *      hybrid route and the only thing standing between it and a designer was
 *      that nothing in `App.tsx` called it, which is exactly the class of gap a
 *      function test cannot see.
 *
 * Every scan below was measured to be falsifiable before it was written down;
 * what each deliberate break costs is noted beside it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrequencyTokens, parseHandoverList } from './frequencyList.ts';
import {
  ACTIVE_HANDOVER_LABEL,
  ACTIVE_LATENCY_LABEL,
  ACTIVE_SIDE_FLANK_COLUMN,
  ACTIVE_SIDE_GUIDED_LINE,
  ACTIVE_SIDE_LEAN_NOTE,
  ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS,
  ACTIVE_SIDE_LEAN_WAYS_NEEDED,
  ACTIVE_SIDE_MODEL_MARK,
  ACTIVE_SIDE_NOT_JUDGED,
  ACTIVE_SIDE_ROLES,
  ACTIVE_SIDE_SHAPES,
  ACTIVE_SIDE_SUM_COLUMNS,
  ACTIVE_SIDE_WAYS_NEEDED,
  activeSideRolesFor,
  activeSideShape,
  activeSideStatement,
  describeActiveSide,
  describeHybridField,
  formatHandover,
  formatHandoverList,
  hybridLabel,
  passiveOnlyNotice,
  type ActiveSideFormInput,
  type ActiveSideWay,
} from './v2ActiveSide.ts';
import { ACTIVE_SIDE_NOT_JUDGED as ENGINE_NOT_JUDGED } from './engine2/dspTarget.ts';
import { resolveDriverIds } from './engine2/appAdapter.ts';
import { V2_INPUT_REGISTER } from './v2InputRegister.ts';
import { V2_REQUIREMENT_SCREENS } from './v2Guided.ts';
import { V2_JUDGEMENT_KEYS, V2_SETTING_KEYS } from './v2Settings.ts';

const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf-8');

/** Three measured ways, low to high — the measured form. */
const THREE: readonly ActiveSideWay[] = [
  { role: 'low', measured: true },
  { role: 'mid', measured: true },
  { role: 'high', measured: true },
];
/** A two-slot project with both measured — the lean form. */
const TWO: readonly ActiveSideWay[] = [
  { role: 'low', measured: true },
  { role: 'high', measured: true },
];

/** A complete, armed form in the MEASURED shape — every claim below moves one field off it. */
const ARMED: ActiveSideFormInput = {
  on: 'on',
  handoversRaw: '400 450 500',
  shape: 'LR4',
  ways: THREE,
};

/* ==================================================================== *
 * 1 — the handover list, under the grammar the designer was promised
 * ==================================================================== */

describe('H-2b — the handover list grammar', () => {
  it('a decimal COMMA and a decimal POINT both read as a decimal mark', () => {
    expect(parseHandoverList('362,3', 'x').hz).toEqual([362.3]);
    expect(parseHandoverList('362.3', 'x').hz).toEqual([362.3]);
    /* NOT ROUNDED: casus 1h states 362.3 Hz, and a handover is a number a
     * processor is set to rather than a position in a field laid out in
     * octaves. */
    expect(parseHandoverList('362,3', 'x').hz[0]).not.toBe(362);
  });

  it('a SEMICOLON and a SPACE separate values, in the typed order, verbatim', () => {
    expect(parseHandoverList('362,3; 400', 'x').hz).toEqual([362.3, 400]);
    expect(parseHandoverList('362,3 400', 'x').hz).toEqual([362.3, 400]);
    expect(parseHandoverList('500;450 ; 400', 'x').hz).toEqual([500, 450, 400]);
    expect(parseHandoverList('362,3; 400', 'x').problems).toEqual([]);
  });

  it('an AMBIGUOUS comma is refused with an explanation, and no number is invented out of it (A3h)', () => {
    /* The brief's own example: two values with a stray comma, or a decimal
     * comma with a separator after it? Nobody can tell, so nobody guesses. */
    const r = parseHandoverList('362,3, 400', 'active handover');
    expect(r.hz).toEqual([400]);
    expect(r.ambiguous).toEqual(['362,3,']);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/ambiguous/);
    expect(r.problems[0]).toMatch(/DECIMAL comma/);
    expect(r.problems[0]).toMatch(/semicolon or a space/);
    expect(r.problems[0]).toContain('active handover');
    /* Two commas in one token, and a comma beside a point: the same answer. */
    expect(parseHandoverList('362,3,400', 'x').ambiguous).toEqual(['362,3,400']);
    expect(parseHandoverList('362.3,400', 'x').ambiguous).toEqual(['362.3,400']);
    /* U-5's failure, still refused: a token that is not a frequency is
     * reported and used for nothing — "2200Hz" does not become 2200. */
    const bad = parseHandoverList('-5 2200Hz 0 abc 450', 'active handover');
    expect(bad.hz).toEqual([450]);
    expect(bad.problems).toHaveLength(4);
    expect(bad.ambiguous).toEqual([]);
  });

  it('is a SECOND grammar and not a flag on U-5’s, because the comma means different things by statement', () => {
    /* U-5's field: a comma separates VALUES and a semicolon separates AXES.
     * "362,3" there is two crossings, and that is its own tests' claim
     * (`statedCrossings.test.ts`); here it is one handover. One function
     * cannot read one character two ways. */
    expect(parseFrequencyTokens('362,3', 'x').hz).toEqual([362, 3]);
    expect(parseHandoverList('362,3', 'x').hz).toEqual([362.3]);
  });

  it('the statement de-duplicates, does NOT sort, and reads the list back', () => {
    const s = activeSideStatement({ ...ARMED, handoversRaw: '500 400;500' });
    expect(s.handoversHz).toEqual([500, 400]);
    /* THE ECHO: what the app understood, beside the field, in the digits the
     * designer would recognise. */
    expect(s.read).toBe('read: 500 · 400 Hz');
    expect(formatHandoverList([362.3, 400])).toBe('362.3 · 400 Hz');
    expect(activeSideStatement({ ...ARMED, handoversRaw: '' }).read).toBeNull();
  });

  it('a problem in the list names the field it belongs to, and a usable list beside it is still armed', () => {
    const s = activeSideStatement({ ...ARMED, handoversRaw: '450 nonsense' });
    expect(s.handoversHz).toEqual([450]);
    expect(s.problems.join(' ')).toContain(ACTIVE_HANDOVER_LABEL);
    expect(s.armed).toBe(true);
  });

  it('the list is describable regardless of what is measured', () => {
    /* One measured way, no form at all — and the list is still read back and
     * its problems still named, because a field a designer types into has to
     * answer before the rest of the project is there. */
    const s = activeSideStatement({ ...ARMED, handoversRaw: '362,3; 400, 450', ways: [{ role: 'low', measured: true }, { role: 'high', measured: false }] });
    expect(s.armed).toBe(false);
    /* "400," is the ambiguous token and is refused; 362,3 and 450 are read. */
    expect(s.read).toBe('read: 362.3 · 450 Hz');
    expect(s.problems.some((p) => /ambiguous/.test(p) && p.includes('“400,”'))).toBe(true);
  });
});

/* ==================================================================== *
 * 2 — the FORM follows from what is measured; P4 on everything else
 * ==================================================================== */

describe('H-2b — which form what is measured admits', () => {
  it('three measured ways: the MEASURED form, the lowest way active, the two above it passive', () => {
    const w = activeSideRolesFor(THREE)!;
    expect(w.form).toBe('measured');
    expect(w.roles).toEqual({ active: 'low', lowestPassive: 'mid', highest: 'high' });
    /* …which is exactly the H-2 constant, read and never re-typed. */
    expect(w.roles).toEqual(ACTIVE_SIDE_ROLES);
    expect(ACTIVE_SIDE_WAYS_NEEDED).toBe(3);
  });

  it('two measured ways in a two-slot project: the LEAN form, the active side in no role at all', () => {
    const w = activeSideRolesFor(TWO)!;
    expect(w.form).toBe('unmeasured');
    expect(w.roles).toEqual({ active: null, lowestPassive: 'low', highest: 'high' });
    expect(ACTIVE_SIDE_LEAN_WAYS_NEEDED).toBe(2);
  });

  it('the top two of a three-slot project measured: the lean form, the unmeasured lowest slot as the active role', () => {
    const w = activeSideRolesFor([{ role: 'low', measured: false }, { role: 'mid', measured: true }, { role: 'high', measured: true }])!;
    expect(w.form).toBe('unmeasured');
    expect(w.roles).toEqual({ active: 'low', lowestPassive: 'mid', highest: 'high' });
  });

  it('two measured ways that are NOT the top two are no form, and neither is one', () => {
    expect(activeSideRolesFor([{ role: 'low', measured: true }, { role: 'mid', measured: false }, { role: 'high', measured: true }])).toBeNull();
    expect(activeSideRolesFor([{ role: 'low', measured: true }, { role: 'high', measured: false }])).toBeNull();
  });

  it('unticked is not a hybrid and not a complaint: nobody asked', () => {
    const s = activeSideStatement({ ...ARMED, on: '' });
    expect(s.asked).toBe(false);
    expect(s.armed).toBe(false);
    expect(s.off).toEqual([]);
    /* …and the form is still SAID, because the app's own reading of what is
     * measured does not depend on the tick. */
    expect(s.form).toBe('measured');
  });

  it('a complete measured form is armed, carries the shape, and names its roles', () => {
    const s = activeSideStatement(ARMED);
    expect(s.armed).toBe(true);
    expect(s.off).toEqual([]);
    expect(s.form).toBe('measured');
    expect(s.shape).toEqual(ACTIVE_SIDE_SHAPES[0]);
    expect(s.roles).toEqual(ACTIVE_SIDE_ROLES);
  });

  it('a complete LEAN form is armed — two measured ways suffice, with no extra button', () => {
    const s = activeSideStatement({ ...ARMED, ways: TWO });
    expect(s.armed).toBe(true);
    expect(s.form).toBe('unmeasured');
    expect(s.roles!.active).toBeNull();
    expect(s.roles!.lowestPassive).toBe('low');
    expect(describeActiveSide(s)).toMatch(/LEAN FORM/);
    expect(describeActiveSide(s)).toMatch(/target-flank error/);
    expect(describeActiveSide(s)).toMatch(/multiply rather than add/);
  });

  it('each missing input disarms it and is named by itself', () => {
    const cases: [Partial<ActiveSideFormInput>, RegExp][] = [
      [{ ways: [{ role: 'low', measured: true }, { role: 'high', measured: false }] }, /measured way/],
      [{ ways: [{ role: 'low', measured: true }, { role: 'mid', measured: false }, { role: 'high', measured: true }] }, /not the two highest/],
      [{ handoversRaw: '' }, /no handover frequency is stated/],
      [{ shape: '' }, /no acoustic target shape/],
    ];
    for (const [patch, re] of cases) {
      const s = activeSideStatement({ ...ARMED, ...patch });
      expect(s.asked, JSON.stringify(patch)).toBe(true);
      expect(s.armed, JSON.stringify(patch)).toBe(false);
      expect(s.off.join(' '), JSON.stringify(patch)).toMatch(re);
    }
  });

  it('nothing is inferred from anything else: a shape is never guessed and neither is a frequency', () => {
    expect(activeSideStatement({ ...ARMED, shape: '' }).shape).toBeNull();
    expect(activeSideStatement({ ...ARMED, shape: 'LR3' }).shape).toBeNull();
    expect(activeSideStatement({ ...ARMED, handoversRaw: '' }).handoversHz).toEqual([]);
    expect(activeSideShape('LR2')!.order).toBe(2);
  });

  it('the processor latency is read as milliseconds, with either decimal mark, and never arms or disarms anything', () => {
    expect(activeSideStatement({ ...ARMED, latencyRaw: '0,35' }).processorLatencyMs).toBeCloseTo(0.35, 12);
    expect(activeSideStatement({ ...ARMED, latencyRaw: '0.35' }).processorLatencyMs).toBeCloseTo(0.35, 12);
    expect(activeSideStatement({ ...ARMED, latencyRaw: '' }).processorLatencyMs).toBeNull();
    const bad = activeSideStatement({ ...ARMED, latencyRaw: 'fa251' });
    expect(bad.processorLatencyMs).toBeNull();
    expect(bad.problems.join(' ')).toContain(ACTIVE_LATENCY_LABEL);
    /* A NICE input: a hybrid runs without it (P4 — the block then says the
     * delay is printed without it). */
    expect(bad.armed).toBe(true);
  });
});

/* ==================================================================== *
 * 3 — the labels of the product, and the sentences
 * ==================================================================== */

describe('H-2 — the product', () => {
  it('every (candidate, handover) pair gets its own label, and no two collide', () => {
    const passive = ['415.6 · LR4', '466.5 · LR4', '523.7 · LR4'];
    const handovers = [400, 450, 500];
    const labels = handovers.flatMap((hz) => passive.map((p) => hybridLabel(p, hz)));
    expect(labels).toHaveLength(9);
    expect(new Set(labels).size).toBe(9);
    for (const p of passive) expect(labels.filter((l) => l.startsWith(p))).toHaveLength(3);
  });

  it('a printed handover keeps enough digits to tell 362.3 from 362', () => {
    expect(formatHandover(362.3)).toBe('362.3 Hz');
    expect(formatHandover(450)).toBe('450 Hz');
    expect(hybridLabel('x', 362.3)).not.toBe(hybridLabel('x', 362));
  });

  it('the form sentence says the runs MULTIPLY, and the field sentence says by how much', () => {
    const s = activeSideStatement(ARMED);
    expect(describeActiveSide(s)).toMatch(/multiply rather than add/);
    expect(describeActiveSide(s)).not.toMatch(/\d+ run\(s\)/);
    expect(describeHybridField(s, 4)).toContain('12 run(s)');
  });

  it('Hybrid mode that was asked for and could not be assembled says what the run IS instead', () => {
    const s = activeSideStatement({ ...ARMED, ways: [{ role: 'low', measured: true }, { role: 'high', measured: false }] });
    const line = describeActiveSide(s);
    expect(line).toBe(passiveOnlyNotice(s.off));
    expect(line).toMatch(/PASSIVE network for every loaded way/);
    expect(line).toMatch(/Nothing below is about a hybrid/);
    expect(line).toMatch(/measured way/);
  });

  it('the NOT-JUDGED sentence is one sentence in two homes, and the lean note names the flank', () => {
    /* The form may not import the engine, so the sentence lives twice; this
     * pins that the two never drift (A3g). */
    expect(ACTIVE_SIDE_NOT_JUDGED).toBe(ENGINE_NOT_JUDGED);
    expect(ACTIVE_SIDE_NOT_JUDGED).toMatch(/^not judged — active side unmeasured/);
    expect(ACTIVE_SIDE_NOT_JUDGED).toMatch(/reversed-polarity null/);
    expect(ACTIVE_SIDE_LEAN_NOTE).toMatch(/target-flank error/);
    expect(ACTIVE_SIDE_LEAN_NOTE).toMatch(/NOT JUDGED/);
  });
});

/* ==================================================================== *
 * 4 — the register, the settings and the guided screen agree on the name
 * ==================================================================== */

describe('H-2b — "Hybrid mode" everywhere, and the fields are filed', () => {
  it('each of the three fields is a settings key, a judgement key and a register row; the latency is a nice row', () => {
    for (const k of ['activeSideOn', 'activeHandoverHz', 'activeHandoverShape'] as const) {
      expect(V2_SETTING_KEYS, k).toContain(k);
      expect(V2_JUDGEMENT_KEYS, k).toContain(k);
      const row = V2_INPUT_REGISTER.find((r) => r.key === k);
      expect(row, k).toBeDefined();
      expect(row!.cls, k).toBe('judgement');
      expect((row as { band?: string }).band, k).toBe('architecture');
    }
    expect(V2_SETTING_KEYS).toContain('activeProcessorLatencyMs');
    expect(V2_JUDGEMENT_KEYS).not.toContain('activeProcessorLatencyMs');
    const lat = V2_INPUT_REGISTER.find((r) => r.key === 'activeProcessorLatencyMs')!;
    expect(lat.cls).toBe('nice');
    expect(lat.placement).toBe('conditional');
    expect(lat.emptyMeans).toMatch(/0\.35/);
  });

  it('the name is "Hybrid mode" on the tick, in the register, in guided and in the wizard line', () => {
    expect(V2_INPUT_REGISTER.find((r) => r.id === 'activeSideOn')!.label).toBe('Hybrid mode');
    expect(V2_REQUIREMENT_SCREENS.find((s) => s.id === 'active-side')!.title).toMatch(/^Hybrid mode/);
    expect(ACTIVE_SIDE_GUIDED_LINE).toMatch(/“Hybrid mode”/);
    expect(APP).toContain("{t('Hybrid mode')}");
    expect(APP).not.toContain('Active side below the lowest passive way');
    /* …and the wizard line says the form follows from what is measured. */
    expect(ACTIVE_SIDE_GUIDED_LINE).toMatch(/only the passive pair measured/);
  });

  it('the columns the modelled branch takes part in are NAMED, and the lean form’s unjudged set is a subset', () => {
    expect([...ACTIVE_SIDE_SUM_COLUMNS].sort()).toEqual(
      ['lobing', 'peak', 'phase', 'phase-ctl', 'rms', 'window'].sort(),
    );
    for (const electrical of ['zmin', 'epdr', 'diss', 'rmax', 'vfs', 'bom']) {
      expect(ACTIVE_SIDE_SUM_COLUMNS, electrical).not.toContain(electrical);
    }
    /* The lean form judges the PASSIVE pair's phase (the tuner's own M-K on
     * the two ways in the netlist) and nothing that needs the sum. */
    expect([...ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS].sort()).toEqual(['lobing', 'peak', 'rms', 'window'].sort());
    for (const k of ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS) expect(ACTIVE_SIDE_SUM_COLUMNS).toContain(k);
    expect(ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS).not.toContain('phase');
    expect(ACTIVE_SIDE_FLANK_COLUMN).toBe('flank');
  });
});

/* ==================================================================== *
 * 5 — the app takes the route
 * ==================================================================== */

describe('H-2 / H-2b — App.tsx routes a hybrid', () => {
  it('a hybrid falls through to the TWO-WAY branch instead of designing all three ways passively', () => {
    expect(APP).toContain('if (!v2Hybrid && threeWay && sim && sim.mid && midDrv && result) {');
    expect(APP).toContain('const v2Hybrid = engineV2Enabled && v2ActiveSide.armed;');
  });

  it('the form is read off what is MEASURED, and the roles come out of the statement', () => {
    expect(APP).toContain("measured: role === 'low' ? !!woofer : role === 'mid' ? !!midDrv : !!tweeter,");
    expect(APP).toContain('const hybridRoles = v2Hybrid ? v2ActiveSide.roles : null;');
    expect(APP).toContain('const passiveLow: Loaded = (hybridRoles ? loadedOf(hybridRoles.lowestPassive) : null) ?? woofer;');
    expect(APP).toContain("const passiveLowRole: BranchRole = hybridRoles ? hybridRoles.lowestPassive : 'low';");
    /* …and the natural-slope curve is looked up through the ROLE the chain
     * designs for, not the literal 'low'. */
    expect(APP).toContain("const g = role === passiveLowRole ? w : role === (hybridRoles?.highest ?? 'high') ? t : null;");
  });

  it('the active way is loaded ONLY in the measured form; the lean form hands the chain no active measurement', () => {
    /* Break: drop the form condition and the lean form throws in the chain
     * ("no measured response was supplied") — or, worse, a two-slot project
     * hands the WOOFER slot to the chain as the active way it is not. */
    expect(APP).toContain("hybridRoles && hybridRoles.active && v2ActiveSide.form === 'measured' ? loadedOf(hybridRoles.active) : null;");
    expect(APP).toContain('...(active && activeMeasured ? { activeMeasured } : {}),');
    expect(APP).toContain('...(active && activeMeasuredSafety ? { activeMeasuredSafety } : {}),');
  });

  it('the lean form gets the TEXTBOOK complement through the one function the engine test reads', () => {
    expect(APP).toContain("else if (a?.form === 'unmeasured') activeRuns.push({ hz, active: { handover: a.stated, settings: complementSettings(a.stated) } });");
    /* …and the measured form is untouched: the derived settings, as at H-2. */
    expect(APP).toContain('if (a?.settings) activeRuns.push({ hz, active: { handover: a.stated, settings: a.settings } });');
  });

  it('a lean-form pass is judged from the bottom of the handover band; every other run keeps its band', () => {
    expect(APP).toContain('const floor = Math.max(settings.band[0], handoverBandHz(active.handover.hz)[0]);');
    expect(APP).toContain('...(leanBandFor(active) ? { band: leanBandFor(active)! } : {}),');
    /* Option OFF is byte-identical: the override is spread on a condition that
     * is false without an unmeasured active side, and the settings object is
     * otherwise the one it always was. */
    expect(APP).toContain("if (!active?.handover.unmeasured || !settings.band) return null;");
  });

  it('the report is told the form: the lean form marks the handover UNMEASURED and names the active side', () => {
    expect(APP).toContain("...(v2ActiveSide.form === 'unmeasured' ? { unmeasured: true as const } : {}),");
    expect(APP).toContain("const activeWay = roles.active ? ids[roles.active] : 'active (unmeasured)';");
    expect(APP).toContain('const passiveWay = ids[roles.lowestPassive];');
  });

  it('the exclusion from the netlist follows the active ROLE, and there is none in the two-slot lean form', () => {
    expect(APP).toContain('const activeRole = v2ActiveSide.armed ? (v2ActiveSide.roles?.active ?? undefined) : undefined;');
    expect(APP).toContain('const ids = resolveDriverIds(branches, filter?.netlist ?? null, activeRole).ids;');
    expect(APP).toContain('...(activeRole !== undefined ? { activeRole } : {}),');
  });

  it('the active way’s IMPEDANCE never reaches the passive chain', () => {
    expect(APP).toContain('const passiveZ = (z: Record<string, readonly Complex[]>) => {');
    expect(APP).toContain('delete out[activeModel];');
    expect(APP).toContain('const zOnGrid = passiveZ(zGridWithSlots(impedances, grid));');
    expect(APP).toContain('z: passiveZ(zGridWithSlots(impedances, sGrid)),');
  });

  it('the field holds the PASSIVE handovers only, dropped by the active way’s name', () => {
    expect(APP).toContain('const wis = activeWayId ? allWis.filter((x) => x.lower !== activeWayId) : allWis;');
    expect(APP).toContain('const activeWayId = hybridRoles?.active ? engineV2Report?.driverIds?.[hybridRoles.active] : undefined;');
  });

  it('the DSP settings are derived ONCE PER HANDOVER, through the report', () => {
    expect(APP).toContain('const built = buildV2Report(null, hz);');
    expect(APP).toContain('const a = built?.report?.activeSide ?? null;');
    expect(APP).toContain('could not be modelled and was not run');
  });

  it('the stated handover reaches the chain as the SEVENTH chain key, per run', () => {
    expect(APP).toContain('...(active ? { activeSide: active } : {}),');
    expect(APP).toContain('chainDeclaration: chainDeclFor(pass?.active),');
    expect(APP).toContain('hybrid && activeRuns.length > 0 ? activeRuns : [null];');
    expect(APP).toContain('const label = pass ? hybridLabel(v.label, pass.hz) : v.label;');
  });

  it('the fingerprint says there WAS an active side, and tells two handovers apart', () => {
    expect(APP).toContain('const chainDecl = chainDeclFor(activeRuns[0]?.active);');
    expect(APP).toContain('...(hybrid ? { activeHandoversHz: activeRuns.map((r) => r.hz) } : {}),');
  });

  it('the run remembers its FORM, and the table reads it off the run', () => {
    expect(APP).toContain("activeSideForm: hybrid && activeRuns.length > 0 ? v2ActiveSide.form : null,");
    expect(APP).toContain('activeSideForm: null,');
    expect(APP).toContain("const v2LeanRun = v2HybridRun && v2Run?.activeSideForm === 'unmeasured';");
  });

  it('on a lean-form run the sum columns read NOT JUDGED (never blank) and the flank column appears; on a measured run they are marked MODEL', () => {
    expect(APP).toContain('const COLS = COLS_ALL.filter(([key]) => v2LeanRun || key !== ACTIVE_SIDE_FLANK_COLUMN);');
    expect(APP).toContain('const notJudged = (key: string) => v2LeanRun && ACTIVE_SIDE_LEAN_UNJUDGED_COLUMNS.includes(key);');
    expect(APP).toContain("{notJudged(key) ? ` (${t('not judged')})` : ''}");
    expect(APP).toContain('<td key={key} className="derived" title={t(ACTIVE_SIDE_NOT_JUDGED)}>');
    expect(APP).toContain('v2HybridRun && !v2LeanRun && ACTIVE_SIDE_SUM_COLUMNS.includes(key)');
    expect(APP).toContain('? ` (${ACTIVE_SIDE_MODEL_MARK})`');
    expect(ACTIVE_SIDE_MODEL_MARK).toBe('MODEL');
    expect(APP).toContain("[ACTIVE_SIDE_FLANK_COLUMN, t('target-flank error'), (r: (typeof v2Shortlist.rows)[number]) => r.measurements.flankError?.rmsDb ?? null,");
  });

  it('the DSP target block subtracts the stated latency, and the fold says which form it describes', () => {
    expect(APP).toContain("...(v2ActiveSide.processorLatencyMs !== null ? { processorLatencyMs: v2ActiveSide.processorLatencyMs } : {}),");
    expect(APP).toContain('{t(v2LeanRun ? ACTIVE_SIDE_LEAN_NOTE : ACTIVE_SIDE_MODEL_NOTE)}');
    expect(APP).toContain('function exportDspTargets() {');
  });

  it('the list is read back beside the field, in the panel and in guided', () => {
    expect((APP.match(/\{v2ActiveSide\.read && <span className="derived"> \{t\(v2ActiveSide\.read\)\}<\/span>\}/g) ?? []).length).toBe(2);
  });

  it('the latency field is a stated text field behind the tick, with no number in its placeholder', () => {
    expect(APP).toContain('value={engineV2Settings.activeProcessorLatencyMs}');
    expect(APP).toContain('placeholder={V2_GHOSTS.activeProcessorLatencyMs}');
    expect(APP).toContain("latencyRaw: engineV2Settings.activeProcessorLatencyMs,");
  });

  it('the acoustic-centre depth reaches the report geometry, for the delay start value', () => {
    expect(APP).toContain('low: mm(cabinet.drivers.low?.depthMm),');
  });

  it('the run notes say which form ran: modelled, or not judged', () => {
    expect(APP).toContain("v2ActiveSide.form === 'unmeasured' ? ACTIVE_SIDE_LEAN_NOTE : ACTIVE_SIDE_MODEL_NOTE,");
  });

  it('the active way’s measurement card note appears only in the measured form, and the ways question carries one sentence', () => {
    expect(APP).toContain("{v2ActiveSide.asked && v2ActiveSide.roles?.active === role && v2ActiveSide.form === 'measured' && (");
    expect(APP).toContain('{t(ACTIVE_SIDE_GUIDED_LINE)}');
  });

  it('a run that asked for Hybrid mode and could not assemble it says so, on BOTH routes', () => {
    expect(APP.split('...(v2ActiveSide.asked && !v2ActiveSide.armed').length - 1).toBe(2);
    expect(APP.split('? [passiveOnlyNotice(v2ActiveSide.off)]').length - 1).toBe(2);
  });

  it('the scan can see: App.tsx is really being read', () => {
    expect(APP.length).toBeGreaterThan(500_000);
    expect(APP).toContain("from './lib/v2ActiveSide.ts'");
  });
});

/* ==================================================================== *
 * 6 — the netlist of a hybrid holds the PASSIVE ways, and its slots mean
 *     one role higher
 * ==================================================================== */

describe('H-2 — resolving driver ids with a way that is not in the netlist', () => {
  const branches = (['low', 'mid', 'high'] as const).map((role) => ({ role }) as never);
  const netlist = (models: readonly string[]) =>
    ({
      elements: models.map((model, i) => ({ kind: 'driver' as const, model, id: `D${i}` })),
    }) as never;

  it('without an exclusion it is what it has always been', () => {
    const { ids } = resolveDriverIds(branches, netlist(['woofer', 'mid', 'tweeter']));
    expect(ids).toEqual({ low: 'woofer', mid: 'mid', high: 'tweeter' });
    expect(resolveDriverIds(branches, null).ids).toEqual({ low: 'low', mid: 'mid', high: 'high' });
  });

  it('THE BUG, as it stood: a three-branch project with a two-driver netlist collides', () => {
    const { ids } = resolveDriverIds(branches, netlist(['mid', 'tweeter']));
    expect(ids.low).toBe('mid');
    expect(ids.mid).toBe('mid');
    expect(ids.low).toBe(ids.mid);
  });

  it('with the active role excluded the slots mean one role higher, and nothing collides', () => {
    const { ids } = resolveDriverIds(branches, netlist(['mid', 'tweeter']), 'low');
    expect(ids.mid).toBe('mid');
    expect(ids.high).toBe('tweeter');
    expect(ids.low).toBe('low');
    expect(new Set(Object.values(ids)).size).toBe(3);
  });

  it('the exclusion is positional, so it works whichever role is excluded', () => {
    const { ids } = resolveDriverIds(branches, netlist(['woofer', 'tweeter']), 'mid');
    expect(ids).toEqual({ low: 'woofer', mid: 'mid', high: 'tweeter' });
  });
});
