/**
 * H-2 — THE HYBRID IS A ROUTE THROUGH THE APP, and the app really takes it.
 *
 * TWO HALVES, and the second is why this file exists at all.
 *
 *   1. THE STATEMENT IS WELL FORMED — three fields read once, every missing
 *      input named rather than guessed, and a list parsed the way U-5's is.
 *      A test over pure functions, and it proves only that the reading is
 *      honest.
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

import { parseFrequencyTokens } from './frequencyList.ts';
import {
  ACTIVE_HANDOVER_LABEL,
  ACTIVE_SIDE_MODEL_MARK,
  ACTIVE_SIDE_ROLES,
  ACTIVE_SIDE_SHAPES,
  ACTIVE_SIDE_SUM_COLUMNS,
  ACTIVE_SIDE_WAYS_NEEDED,
  activeSideShape,
  activeSideStatement,
  describeActiveSide,
  describeHybridField,
  formatHandover,
  hybridLabel,
  passiveOnlyNotice,
  type ActiveSideFormInput,
} from './v2ActiveSide.ts';
import { resolveDriverIds } from './engine2/appAdapter.ts';
import { V2_INPUT_REGISTER } from './v2InputRegister.ts';
import { V2_JUDGEMENT_KEYS, V2_SETTING_KEYS } from './v2Settings.ts';

const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf-8');

/** A complete, armed form — every claim below moves one field off it. */
const ARMED: ActiveSideFormInput = {
  on: 'on',
  handoversRaw: '400 450 500',
  shape: 'LR4',
  ways: 3,
  activeWayMeasured: true,
  passiveWayMeasured: true,
};

/* ==================================================================== *
 * 1 — the list is parsed the way U-5's is, and for U-5's reason
 * ==================================================================== */

describe('H-2 — the handover list', () => {
  it('splits on spaces and commas and keeps what was typed, verbatim', () => {
    expect(parseFrequencyTokens('400, 450  500', 'x').hz).toEqual([400, 450, 500]);
    /* NOT ROUNDED: casus 1h states 362.3 Hz, and a handover is a number a
     * processor is set to rather than a position in a field laid out in
     * octaves. The one place this parse differs from U-5's call site. */
    expect(parseFrequencyTokens('362.3', 'x').hz).toEqual([362.3]);
  });

  it('never invents a number out of a token that is not one (A3h)', () => {
    /* The failure U-5 paid for: an earlier version pulled the DIGITS out of
     * whatever was typed, so "-5" became 5 and "2200Hz" became 2200 — the right
     * kind of number, out of something the designer did not write. */
    const r = parseFrequencyTokens('-5 2200Hz 0 abc 450', 'active handover');
    expect(r.hz).toEqual([450]);
    expect(r.problems).toHaveLength(4);
    for (const p of r.problems) expect(p).toContain('active handover');
  });

  it('the statement de-duplicates and does NOT sort: the typed order is the run order', () => {
    const s = activeSideStatement({ ...ARMED, handoversRaw: '500 400 500' });
    expect(s.handoversHz).toEqual([500, 400]);
  });

  it('a problem in the list names the field it belongs to', () => {
    const s = activeSideStatement({ ...ARMED, handoversRaw: '450 nonsense' });
    expect(s.handoversHz).toEqual([450]);
    expect(s.problems.join(' ')).toContain(ACTIVE_HANDOVER_LABEL);
    /* …and a list with SOMETHING usable in it is still armed: the bad token is
     * reported and used for nothing, which is not the same as refusing. */
    expect(s.armed).toBe(true);
  });
});

/* ==================================================================== *
 * 2 — P4: what is missing is named, and nothing is inferred
 * ==================================================================== */

describe('H-2 — reading the three fields', () => {
  it('unticked is not a hybrid and not a complaint: nobody asked', () => {
    const s = activeSideStatement({ ...ARMED, on: '' });
    expect(s.asked).toBe(false);
    expect(s.armed).toBe(false);
    /* NO REASONS. "You asked for this and here is what is missing" and "nobody
     * asked" are different answers, and a list of missing inputs beside an
     * untouched tick box is the app complaining about a question it invented. */
    expect(s.off).toEqual([]);
  });

  it('a complete form is armed, and carries the shape it was told', () => {
    const s = activeSideStatement(ARMED);
    expect(s.armed).toBe(true);
    expect(s.off).toEqual([]);
    expect(s.shape).toEqual(ACTIVE_SIDE_SHAPES[0]);
    expect(s.shape!.kind).toBe('LR');
    expect(s.shape!.order).toBe(4);
  });

  it('each missing input disarms it and is named by itself', () => {
    const cases: [Partial<ActiveSideFormInput>, RegExp][] = [
      [{ ways: 2 }, /measured way/],
      [{ activeWayMeasured: false }, /active way has no measured/],
      [{ passiveWayMeasured: false }, /lowest passive way has no measured/],
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
    /* A ticked box with no shape does not become LR4 and a shape with no
     * frequency does not become the middle of a window (P4). */
    expect(activeSideStatement({ ...ARMED, shape: '' }).shape).toBeNull();
    expect(activeSideStatement({ ...ARMED, shape: 'LR3' }).shape).toBeNull();
    expect(activeSideStatement({ ...ARMED, handoversRaw: '' }).handoversHz).toEqual([]);
    expect(activeSideShape('LR2')!.order).toBe(2);
  });

  it('a hybrid needs three ways, and the app says which three', () => {
    expect(ACTIVE_SIDE_WAYS_NEEDED).toBe(3);
    expect(activeSideStatement({ ...ARMED, ways: 2 }).armed).toBe(false);
    expect(activeSideStatement({ ...ARMED, ways: 3 }).armed).toBe(true);
    /* The ROLES are data and the app reads them; two literals in a component
     * are how the run and the note end up describing different ways. */
    expect(ACTIVE_SIDE_ROLES.active).toBe('low');
    expect(ACTIVE_SIDE_ROLES.lowestPassive).toBe('mid');
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
    /* …and a label still says which passive candidate it came from, because the
     * scan table, the shortlist and the load button all key on it. */
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
    /* The FORM does not know how big the passive field is — that depends on
     * windows nothing has derived yet — so it states the arithmetic and not a
     * number (F0). The number arrives with the field. */
    expect(describeActiveSide(s)).not.toMatch(/\d+ run\(s\)/);
    expect(describeHybridField(s, 4)).toContain('12 run(s)');
  });

  it('an active side that was asked for and could not be modelled says what the run IS instead', () => {
    const s = activeSideStatement({ ...ARMED, activeWayMeasured: false });
    const line = describeActiveSide(s);
    expect(line).toBe(passiveOnlyNotice(s.off));
    /* THE FALLBACK IS NOT "the passive ways alone" — it is the run without the
     * tick: a passive network for EVERY loaded way. An earlier version of this
     * sentence said the first, and it was wrong in both directions (the way
     * that was going to be active IS in that sum, as an ordinary branch, and no
     * hybrid was designed at all). */
    expect(line).toMatch(/PASSIVE network for every loaded way/);
    expect(line).not.toMatch(/PASSIVE WAYS ALONE/);
    expect(line).toMatch(/Nothing below is about a hybrid/);
    /* …and it names the missing input inside the same sentence, so the reader
     * does not have to hunt for what would fix it. */
    expect(line).toMatch(/active way has no measured/);
  });
});

/* ==================================================================== *
 * 4 — the register and the settings agree about these three fields
 * ==================================================================== */

describe('H-2 — the three fields are filed', () => {
  it('each is a settings key, a judgement key and a register row', () => {
    for (const k of ['activeSideOn', 'activeHandoverHz', 'activeHandoverShape'] as const) {
      expect(V2_SETTING_KEYS, k).toContain(k);
      expect(V2_JUDGEMENT_KEYS, k).toContain(k);
      const row = V2_INPUT_REGISTER.find((r) => r.key === k);
      expect(row, k).toBeDefined();
      expect(row!.cls, k).toBe('judgement');
      /* H-2's own band: what the design IS, before anything judges it. */
      expect((row as { band?: string }).band, k).toBe('architecture');
    }
  });

  it('the columns the modelled branch takes part in are NAMED, and the electrical ones are not among them', () => {
    /* A named set and not a complement — the V47/V48 lesson, on a list that
     * would otherwise absorb every column added later. */
    expect([...ACTIVE_SIDE_SUM_COLUMNS].sort()).toEqual(
      ['lobing', 'peak', 'phase', 'phase-ctl', 'rms', 'window'].sort(),
    );
    for (const electrical of ['zmin', 'epdr', 'diss', 'rmax', 'vfs', 'bom']) {
      expect(ACTIVE_SIDE_SUM_COLUMNS, electrical).not.toContain(electrical);
    }
  });
});

/* ==================================================================== *
 * 5 — the app takes the route
 * ==================================================================== */

describe('H-2 — App.tsx routes a hybrid', () => {
  it('a hybrid falls through to the TWO-WAY branch instead of designing all three ways passively', () => {
    /* The whole of the routing change, and the thing a function test cannot
     * see. Break: drop `!v2Hybrid &&` and a hybrid designs a passive network
     * for the way its own amplifier drives. */
    expect(APP).toContain('if (!v2Hybrid && threeWay && sim && sim.mid && midDrv && result) {');
    expect(APP).toContain('const v2Hybrid = engineV2Enabled && v2ActiveSide.armed;');
  });

  it('the two-way branch designs for the ways ABOVE the active one', () => {
    expect(APP).toContain('const passiveLow: Loaded = hybrid && midDrv ? midDrv : woofer;');
    expect(APP).toContain('const w = onChainGrid(passiveLow);');
    expect(APP).toContain('const activeLoaded: Loaded | null = hybrid ? woofer : null;');
    /* …and the natural-slope curve is looked up through the ROLE the chain
     * designs for, not the literal 'low'. */
    expect(APP).toContain('const g = role === passiveLowRole ? w : role === ACTIVE_SIDE_ROLES.highest ? t : null;');
  });

  it('the active way’s IMPEDANCE never reaches the passive chain', () => {
    /* The amplifier this network is designed for does not drive it, and
     * `measurementFacts` walks this map: a way in it is a way a gate, a budget
     * inversion and an EPDR reading would judge (casus 1h withholds it for the
     * same reason). Break: return `z` unchanged and the woofer joins the
     * electrical figures of a network it is not in. */
    expect(APP).toContain('const passiveZ = (z: Record<string, readonly Complex[]>) => {');
    expect(APP).toContain('delete out[activeModel];');
    expect(APP).toContain('const zOnGrid = passiveZ(zGridWithSlots(impedances, grid));');
    expect(APP).toContain('z: passiveZ(zGridWithSlots(impedances, sGrid)),');
  });

  it('the active way’s RESPONSE does reach it — on both grids', () => {
    expect(APP).toContain('...(active && activeMeasured ? { activeMeasured } : {}),');
    expect(APP).toContain('...(active && activeMeasuredSafety ? { activeMeasuredSafety } : {}),');
  });

  it('the field holds the PASSIVE handovers only, dropped by the active way’s name', () => {
    /* The report derives one window per adjacent pair, so on a hybrid the first
     * is the pair the active side owns — and that handover is stated, never
     * searched. Dropped by NAME and not by counting to one (casus 1h's rule). */
    expect(APP).toContain('const wis = activeWayId ? allWis.filter((x) => x.lower !== activeWayId) : allWis;');
  });

  it('the DSP settings are derived ONCE PER HANDOVER, through the report', () => {
    /* Class A: measurements plus the stated shape, so it is the same answer for
     * every candidate at that handover and no search can move it (H-1). One
     * implementation — `report.ts` → `activeSide.ts` — asked the way the
     * fixture asks it, never a gain and a delay fitted here. */
    expect(APP).toContain('const built = buildV2Report(null, hz);');
    expect(APP).toContain('const a = built?.report?.activeSide ?? null;');
    expect(APP).toContain('activeRuns.push({ hz, active: { handover: a.stated, settings: a.settings } });');
    /* …and a handover the derivation cannot answer is reported and dropped, by
     * name, rather than run with a guessed alignment. */
    expect(APP).toContain('could not be modelled and was not run');
  });

  it('the stated handover reaches the chain as the SEVENTH chain key, per run', () => {
    expect(APP).toContain('...(active ? { activeSide: active } : {}),');
    expect(APP).toContain('chainDeclaration: chainDeclFor(pass?.active),');
    /* The run list is the PRODUCT, and a run without an active side is one pass
     * over the variants — exactly what it was before H-2. */
    expect(APP).toContain('hybrid && activeRuns.length > 0 ? activeRuns : [null];');
    expect(APP).toContain('const label = pass ? hybridLabel(v.label, pass.hz) : v.label;');
  });

  it('the stated handover reaches the REPORT, so the panel and the run read one derivation', () => {
    expect(APP).toContain('...((): { activeHandover?: ActiveHandover } => {');
    expect(APP).toContain('const activeWay = ids[ACTIVE_SIDE_ROLES.active];');
    expect(APP).toContain('const passiveWay = ids[ACTIVE_SIDE_ROLES.lowestPassive];');
  });

  it('the fingerprint says there WAS an active side, and not that there was none', () => {
    /* A stamp that recorded the seventh key ABSENT for a run that stated one
     * would describe a different loudspeaker; which of the stated handovers it
     * names does not have to be settled there, because the handovers ride in
     * `designKey`. Without an active side it is the declaration it always was. */
    expect(APP).toContain('const chainDecl = chainDeclFor(activeRuns[0]?.active);');
  });

  it('the fingerprint tells two handovers apart', () => {
    /* Two runs over the same passive field at two handovers are two different
     * loudspeakers. Absent without an active side, so every earlier run keys
     * byte for byte as before (P2). */
    expect(APP).toContain('...(hybrid ? { activeHandoversHz: activeRuns.map((r) => r.hz) } : {}),');
  });

  it('the DSP target block is built per delivered design, and can leave the app', () => {
    expect(APP).toContain('const v2DspTargets = useMemo(');
    expect(APP).toContain('const block = dspTargetBlock(rep);');
    expect(APP).toContain('{v2DspTargets.length > 0 && (');
    expect(APP).toContain('function exportDspTargets() {');
  });

  it('every SUM column of a hybrid run is marked MODEL, and no electrical one is', () => {
    expect(APP).toContain('v2HybridRun && ACTIVE_SIDE_SUM_COLUMNS.includes(key)');
    expect(APP).toContain('? ` (${ACTIVE_SIDE_MODEL_MARK})`');
    expect(ACTIVE_SIDE_MODEL_MARK).toBe('MODEL');
    /* Read off the RUN and not off the form: change the tick after a hybrid run
     * and the table still describes what it measured. */
    expect(APP).toContain('const v2HybridRun = Object.keys(v2Run?.activeHandoverByLabel ?? {}).length > 0;');
  });

  it('the active way’s measurement card says what its file is for, and what its absence costs', () => {
    expect(APP).toContain('{v2ActiveSide.asked && role === ACTIVE_SIDE_ROLES.active && (');
    expect(APP).toContain('{t(ACTIVE_WAY_MEASURED_NOTE)}');
  });

  it('the ways question carries one sentence about it, under the v2 flag', () => {
    expect(APP).toContain('{t(ACTIVE_SIDE_GUIDED_LINE)}');
  });

  it('a run that asked for an active side and could not model one says so, on BOTH routes', () => {
    /* TWO occurrences, and the second is the one that matters: with the tick on
     * and something missing the run is not a hybrid, so it goes down the
     * THREE-WAY branch — and a note that lived only in the two-way branch would
     * never be printed on exactly the project that needed it. */
    expect(APP.split('...(v2ActiveSide.asked && !v2ActiveSide.armed').length - 1).toBe(2);
    expect(APP.split('? [passiveOnlyNotice(v2ActiveSide.off)]').length - 1).toBe(2);
  });

  it('the two id resolutions are the SAME one, exclusion and all', () => {
    expect(APP).toContain('...(v2ActiveSide.armed ? { activeRole: ACTIVE_SIDE_ROLES.active } : {}),');
    expect(APP).toContain('v2ActiveSide.armed ? ACTIVE_SIDE_ROLES.active : undefined,');
  });

  it('the scan can see: App.tsx is really being read', () => {
    /* Without this, every claim above would pass over an empty string if the
     * file ever moved. */
    expect(APP.length).toBeGreaterThan(500_000);
    expect(APP).toContain("from './lib/v2ActiveSide.ts'");
  });
});

/* ==================================================================== *
 * 6 — the netlist of a hybrid holds the PASSIVE ways, and its slots mean
 *     one role higher
 * ==================================================================== */

describe('H-2 — resolving driver ids with a way that is not in the netlist', () => {
  /** Two branches per role, and a netlist with only the passive drivers in it. */
  const branches = (['low', 'mid', 'high'] as const).map((role) => ({ role }) as never);
  const netlist = (models: readonly string[]) =>
    ({
      elements: models.map((model, i) => ({ kind: 'driver' as const, model, id: `D${i}` })),
    }) as never;

  it('without an exclusion it is what it has always been', () => {
    /* The slot picker reads NAMES (`pickSlotsN`), so these are the names it
     * recognises; invented ones come back ambiguous, which is its own answer. */
    const { ids } = resolveDriverIds(branches, netlist(['woofer', 'mid', 'tweeter']));
    expect(ids).toEqual({ low: 'woofer', mid: 'mid', high: 'tweeter' });
    /* …and a project with no netlist keeps the role names, as before. */
    expect(resolveDriverIds(branches, null).ids).toEqual({ low: 'low', mid: 'mid', high: 'high' });
  });

  it('THE BUG, as it stood: a three-branch project with a two-driver netlist collides', () => {
    /* The netlist of a hybrid holds the ways ABOVE the active one, so the slot
     * picker hands its lowest driver to `low` while `mid` keeps its role-name
     * default — and on a project whose mid role is literally called "mid" those
     * are the same string. Measured in the running app: the DSP target block
     * read "mid (active), handing over to mid (passive)", a way handing over to
     * itself, and the manifest carried two entries under one driver id. */
    const { ids } = resolveDriverIds(branches, netlist(['mid', 'tweeter']));
    expect(ids.low).toBe('mid');
    expect(ids.mid).toBe('mid');
    expect(ids.low).toBe(ids.mid);
  });

  it('with the active role excluded the slots mean one role higher, and nothing collides', () => {
    const { ids } = resolveDriverIds(branches, netlist(['mid', 'tweeter']), 'low');
    /* The netlist's lowest driver is the lowest PASSIVE way… */
    expect(ids.mid).toBe('mid');
    expect(ids.high).toBe('tweeter');
    /* …and the ACTIVE way keeps its role name, because it is in no netlist. */
    expect(ids.low).toBe('low');
    expect(new Set(Object.values(ids)).size).toBe(3);
  });

  it('the exclusion is positional, so it works whichever role is excluded', () => {
    const { ids } = resolveDriverIds(branches, netlist(['woofer', 'tweeter']), 'mid');
    expect(ids).toEqual({ low: 'woofer', mid: 'mid', high: 'tweeter' });
  });
});
