/**
 * U-1 — v1 IS GONE FROM THE INTERFACE, AND THE FLAG IS NOT GONE.
 *
 * Two claims that pull against each other, which is why they are tested in one
 * file: no route through the visible UI can reach the v1 optimiser, and the
 * v1 optimiser is still there and still reachable in code. Prove only the
 * first and a later session deletes the branch that `toggleRegression.test.ts`
 * compares against; prove only the second and the checkbox creeps back.
 *
 * The UI half is a SOURCE SCAN on `App.tsx`, in the idiom this project has used
 * since UI-1 and for the same reason: a function test cannot say whether the
 * app renders a control, and the whole defect UI-1 paid for was a layer nobody
 * asserted. Every scan below was measured against a deliberate break — putting
 * the checkbox back, writing `false` from a handler, restoring the drawer —
 * before it was written down.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  V1_FIELD_DEFAULTS,
  describeV1Carryover,
  v1CarryoverOf,
  type V1FieldKey,
} from './v1Carryover.ts';
import { rowsOfClass } from './v2InputRegister.ts';
import { selectEngine } from './engine2/facade.ts';

const APP = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'),
  'utf-8',
);

/* ==================================================================== *
 * 1 — WHAT A PROJECT CARRIES
 * ==================================================================== */

describe('U-1 — what an old project carries', () => {
  it('a file saved on v1 is carried even with every control at its starting value', () => {
    const c = v1CarryoverOf({ engineV2Enabled: false });
    expect(c).not.toBeNull();
    expect(c!.savedOnV1).toBe(true);
    expect(c!.fields).toEqual([]);
    // Absence and false are ONE thing here, exactly as `selectEngine` reads them.
    expect(v1CarryoverOf({})?.savedOnV1).toBe(true);
  });

  it('a file saved on v2 with nothing carried gets no notice at all', () => {
    expect(v1CarryoverOf({ engineV2Enabled: true })).toBeNull();
    expect(
      v1CarryoverOf({ engineV2Enabled: true, ...V1_FIELD_DEFAULTS }),
    ).toBeNull();
  });

  it('a v1-only control away from its starting value is carried, saved on v2 or not', () => {
    const on = v1CarryoverOf({ engineV2Enabled: true, hpLpPrefLow: 'lr4' });
    expect(on).not.toBeNull();
    expect(on!.savedOnV1).toBe(false);
    expect(on!.fields.map((f) => f.key)).toEqual(['hpLpPrefLow']);
    expect(on!.fields[0].value).toBe('lr4');
    // The explanation is the REGISTER's, never a second sentence typed here.
    expect(on!.fields[0].row.cls).toBe('v1-legacy');
    expect(on!.fields[0].row.v1Note).toBeTruthy();
  });

  it('an absent field is a starting value and not a carried one', () => {
    /* A project written before a field existed says nothing about it, and
       reading its silence as a stated value would put a notice on every old
       file for a setting nobody ever touched. */
    expect(v1CarryoverOf({ engineV2Enabled: true, excursionSpl: undefined })).toBeNull();
    expect(
      v1CarryoverOf({ engineV2Enabled: true, excursionSpl: '90' })!.fields[0].key,
    ).toBe('excursionSpl');
  });

  it('every carried key has a register row, and the two crossings are distinguishable', () => {
    const both = v1CarryoverOf({
      engineV2Enabled: true,
      hpLpPref: 'lr2',
      hpLpPrefLow: 'lr4',
    })!;
    expect(both.fields.map((f) => f.key)).toEqual(['hpLpPref', 'hpLpPrefLow']);
    // One register row, two keys — so the sentence must not print it twice alike.
    expect(both.fields[0].row.id).toBe(both.fields[1].row.id);
    const said = describeV1Carryover(both);
    expect(said).toContain('high crossing');
    expect(said).toContain('low crossing');
    expect(said).toContain('lr2');
    expect(said).toContain('lr4');
  });

  it('the sentence says what is true and offers no migration', () => {
    const said = describeV1Carryover(v1CarryoverOf({ engineV2Enabled: false })!);
    expect(said).toContain('engine v1');
    expect(said).toMatch(/nothing was changed or converted/i);
    /* It reports a conversion that did NOT happen and invites none: no
       migration, no upgrade, no repair. P4 as a sentence. */
    expect(said).not.toMatch(/migrat|upgrade|repair|re-?state them|you should/i);
  });
});

/* ==================================================================== *
 * 2 — ONE HOME FOR THE STARTING VALUES
 * ==================================================================== */

describe('U-1 — the v1 starting values have one home', () => {
  it('the app reads them rather than typing them, at every call site', () => {
    /* Three `useState` initialisers and three `??` fallbacks. A fourth copy is
       how "unchanged" and "carried" come to disagree about the same project:
       the notice would fire on a value the app itself calls the default. */
    for (const key of Object.keys(V1_FIELD_DEFAULTS) as V1FieldKey[]) {
      expect(APP, key).toContain(`useState(V1_FIELD_DEFAULTS.${key})`);
      expect(APP, key).toContain(`?? V1_FIELD_DEFAULTS.${key}`);
    }
    // …and the literals they replaced are not sitting beside them any more.
    expect(APP).not.toContain("const [hpLpPref, setHpLpPref] = useState('auto')");
    expect(APP).not.toContain("setExcursionSpl(d.excursionSpl ?? '96')");
  });

  it('every field of the register that a project FILE can carry is covered', () => {
    /* The register's v1 class has five rows; a project file holds three of
       them, and the other two live in localStorage. Naming the gap here means
       a later session that moves one into the file finds this claim rather
       than a notice that quietly under-reports. */
    const inFile = new Set(['hpLpPref', 'excursionSpl']);
    const rows = rowsOfClass('v1-legacy').map((r) => r.id);
    expect(rows.length).toBe(5);
    expect(rows.filter((id) => inFile.has(id)).sort()).toEqual(['excursionSpl', 'hpLpPref']);
  });
});

/* ==================================================================== *
 * 3 — NO v1 ROUTE THROUGH THE VISIBLE UI
 * ==================================================================== */

describe('U-1 — no v1 route is reachable from the visible UI', () => {
  it('the flag starts ON and every project opens on v2', () => {
    expect(APP).toContain('const [engineV2Enabled, setEngineV2Enabled] = useState(true);');
    expect(APP).toContain('setEngineV2Enabled(true);');
    // The line this replaced would put a saved v1 project back on v1.
    expect(APP).not.toContain('setEngineV2Enabled(d.engineV2Enabled === true)');
  });

  it('nothing in the app writes the flag false, and no control is bound to it', () => {
    /* Exactly ONE call: `applyProject`. The declaration destructures the setter
       without calling it, so a second call is either a handler (a switch by
       another name) or a second opinion about which engine is running. */
    const writes = APP.match(/setEngineV2Enabled\(/g) ?? [];
    expect(writes.length).toBe(1);
    expect(APP).not.toContain('setEngineV2Enabled(false)');
    expect(APP).not.toContain('checked={engineV2Enabled}');
    expect(APP).not.toContain('setEngineV2Enabled(e.target.checked)');
  });

  it('the engine group states which engine runs instead of offering a choice', () => {
    const cap = APP.indexOf("<span className=\"opt-group-cap\">{t('Engine')}</span>");
    expect(cap).toBeGreaterThan(-1);
    const group = APP.slice(cap, cap + 2000);
    expect(group).toContain('Engine v2 runs every optimisation');
    expect(group).not.toContain('type="checkbox"');
    // A disabled control still reads as a choice, so there is none of either.
    expect(group).not.toContain('Engine v2 (experimental) — metrics + hard gates');
  });

  it('the guarded v1 branches are STILL IN THE TREE — dead, not deleted', () => {
    /* The point of the toggle invariant is that the app can still render the
       v1 route with the flag off, and a test that only proved "no v1 visible"
       would be satisfied by ripping those branches out. Both guarded blocks
       are pinned here as well as in `v2Guided.test.ts`. */
    expect(APP).toContain("{uiMode === 'guided' && !engineV2Enabled && (");
    expect(APP).toContain('guidedStages(engineV2Enabled)');
    expect(APP).toContain('designLevelNote(engineV2Enabled)');
    expect(APP).toContain('v1NoteFor(id, engineV2Enabled)');
  });

  it('the v1 READING beside the shortlist stays, and still crowns nothing', () => {
    /* U-1 removed v1 as a ROUTE, not as a REFERENCE. Three surfaces survive on
       purpose and are named in the entry: the ranked table beside the
       shortlist, its per-row notes, and the sentence that says why its top row
       is not a stand-in for an empty shortlist. Each of them is a comparison a
       designer asked for; each of them says out loud that it decided nothing —
       which is exactly what UI-1 had to repair when the top row WAS loaded. */
    expect(APP).toContain('v1 reading — not the route that made this run');
    expect(APP).toContain('v1 note (not applied on this route)');
    expect(APP).toContain('the v1 ranking below has no knowledge of your gates');
    expect(APP).toContain('rankChain3Results(');
  });

  it('the flag is still switchable in code, and false is still the v1 engine', () => {
    /* The capability U-1 did NOT remove. `selectEngine` is untouched: absence
       and false are one thing and only ON routes the optimiser to v2 — which
       is what keeps `toggleRegression`'s byte-identical reference run a
       statement about this app rather than about a deleted branch. */
    expect(selectEngine(false).optimizer).toBe('v1');
    expect(selectEngine(undefined).optimizer).toBe('v1');
    expect(selectEngine(true).optimizer).toBe('v2');
    expect(APP).toMatch(/setEngineV2Enabled\] = useState\(true\)/);
  });
});

/* ==================================================================== *
 * 4 — THE NOTICE IS RENDERED, ONCE, WHERE THE FILE WAS OPENED
 * ==================================================================== */

describe('U-1 — the carryover notice reaches the screen', () => {
  it('applyProject sets it and the project panel renders it, dismissibly', () => {
    /* One setter, one reader. `applyProject` is the single door a file open and
       an autosave restore both come through, so pinning it there is pinning
       both — the UI-1 lesson: what a test cannot reach is where the defect
       lived. */
    expect(APP).toContain('setV1CarryNote(describeCarryover(d));');
    expect(APP).toContain('{v1CarryNote && (');
    expect(APP).toContain('onClick={() => setV1CarryNote(null)}');
  });

  it('the notice is built from the module and not re-worded in the app', () => {
    expect(APP).toContain('const c = v1CarryoverOf(d);');
    expect(APP).toContain('return c ? describeV1Carryover(c) : null;');
    // No second sentence about v1 settings typed into the JSX.
    expect(APP).not.toMatch(/does not read these[^`]*<\/div>/);
  });
});
