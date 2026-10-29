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
import { rowsOfClass, v1ReadingShown } from './v2InputRegister.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');
/** U-5c — het PROJECTBESTANDstype, om te zeggen wat een bestand werkelijk draagt. */
const PROJECT = readFileSync(join(HERE, 'project.ts'), 'utf-8');

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
    /* U-10 fase 3 (3.4, V15) — `hpLpPref` and `hpLpPrefLow` are no longer state:
       they are carried unread (B-4.3), so they have no initialiser to read. The
       other three still do. */
    /* E-6 — `phasePriority` joins them: no state, carried unread (B-4.3). */
    const CARRIED_UNREAD: readonly V1FieldKey[] = ['hpLpPref', 'hpLpPrefLow', 'phasePriority'];
    for (const key of Object.keys(V1_FIELD_DEFAULTS) as V1FieldKey[]) {
      if (CARRIED_UNREAD.includes(key)) {
        expect(APP, key).not.toMatch(new RegExp(`useState(<[^>]*>)?\\(V1_FIELD_DEFAULTS\\.${key}\\b`));
        continue;
      }
      /* U-9 fase 2 — a typed initial (`useState<KaTier>(…)`) reads the same home. */
      expect(APP, key).toMatch(new RegExp(`useState(<[^>]*>)?\\(V1_FIELD_DEFAULTS\\.${key}\\b`));
      expect(APP, key).toContain(`?? V1_FIELD_DEFAULTS.${key}`);
    }
    // …and the literals they replaced are not sitting beside them any more.
    expect(APP).not.toContain("const [hpLpPref, setHpLpPref] = useState('auto')");
    expect(APP).not.toContain("setExcursionSpl(d.excursionSpl ?? '96')");
  });

  it('every field of the register that a project FILE can carry is covered', () => {
    /* The register's v1 class has SIX rows since U-5c; a project file carries
       three of them and the other three live in `localStorage`. Naming the gap
       here means a later session that moves one into the file finds this claim
       rather than a notice that quietly under-reports.
       U-5c — AND IT DID EXACTLY THAT, TWICE. The count is a DEED and not a
       consequence: adding `phasePriority` to the v1 class turned this claim red
       on the spot, which is what a counted guard is for. And it caught the
       second half too — see the claim below. */
    /* U-9 fase 2 — V15: WAS six rows with `phasePriority` among them, three in
       the file. IS six rows WITHOUT it — the v2 tuner reads the slider (N1), so
       it left the class — and with `v1Thresholds` in its place (B-2.2), which
       the file carries too. WHY: the class is now exactly what B-2 hides. */
    /* U-10 fase 3 (3.4, V15) — WAS six rows; the three localStorage-only rows
       (errorSmoothOct, scan3Mode, bomCapEur) are gone with their fields, so the
       class is exactly the three the project file carries. */
    const inFile = new Set(['hpLpPref', 'excursionSpl', 'v1Thresholds']);
    const rows = rowsOfClass('v1-legacy').map((r) => r.id);
    expect(rows.length).toBe(3);
    expect(rows.filter((id) => inFile.has(id)).sort()).toEqual([
      'excursionSpl',
      'hpLpPref',
      'v1Thresholds',
    ]);
  });

  it('E-6 — `phasePriority` is carried unread and the notice NAMES it (the U-5c gap, closed)', () => {
    /* V15. WAS (U-5c): the file carries `phasePriority`, `applyProject` restores
       it, and the notice stays silent — closing the gap would make the notice
       fire on every project with a moved slider. IS (E-6, B-5 = B): the slider
       is gone and every run reads the engine's own 50/50, so a moved value in a
       file is exactly what this notice exists to report. WHY: the behaviour
       change U-5c declined is the decision E-6 took. */
    expect(PROJECT).toContain('phasePriority?: number;');
    expect(APP).not.toContain('setPhasePriority');
    expect(APP).toContain('...(d.phasePriority !== undefined ? { phasePriority: d.phasePriority } : {})');
    expect(V1_FIELD_DEFAULTS.phasePriority).toBe('50');
    const c = v1CarryoverOf({ engineV2Enabled: true, phasePriority: 75 });
    expect(c!.fields.map((f) => f.key)).toEqual(['phasePriority']);
    expect(describeV1Carryover(c!)).toContain('set to "75"');
    // The start value is not carried, as a number or as a string.
    expect(v1CarryoverOf({ engineV2Enabled: true, phasePriority: 50 })).toBeNull();
    expect(APP).not.toContain("{fieldBadge('phasePriority')}");
  });
});

/* ==================================================================== *
 * 3 — NO v1 ROUTE THROUGH THE VISIBLE UI
 * ==================================================================== */

describe('U-1 — no v1 route is reachable from the visible UI', () => {
  /* U-10 fase 3 (V15 form) — WAS two claims on the flag: "the flag starts ON and
   * every project opens on v2" and "nothing in the app writes the flag false".
   * IS: the flag no longer exists, and a saved project still says v2 to an
   * OLDER build that opens it. */
  it('the engine flag is gone from the app, and a save still writes v2 for older builds', () => {
    expect(APP).not.toMatch(/setEngineV2Enabled|const \[engineV2Enabled/);
    expect(APP).not.toMatch(/\bengineV2Enabled &&|!engineV2Enabled\b/);
    expect(APP).toContain('engineV2Enabled: true,');
  });

  it('the engine group states which engine runs instead of offering a choice', () => {
    /* U-9 fase 2 — V15: WAS the "Engine" caption; IS the statement standing
       above the grouped panel, its caption gone with the other v1 headings. */
    const cap = APP.indexOf('{/* ---- U-1: ONE ENGINE, AND NO SWITCH');
    expect(cap).toBeGreaterThan(-1);
    const group = APP.slice(cap, cap + 2000);
    expect(group).toContain('Engine v2 runs every optimisation');
    expect(group).not.toContain('type="checkbox"');
    // A disabled control still reads as a choice, so there is none of either.
    expect(group).not.toContain('Engine v2 (experimental) — metrics + hard gates');
  });

  /* U-10 fase 3 — REMOVED, deliberately: "the guarded v1 branches are STILL IN
   * THE TREE — dead, not deleted". U-10 is the session that deletes them; the
   * v1 guided walk and the flag-guarded branches are gone (inventory §4). */

  it('the v1 READING beside the shortlist stays, and still crowns nothing', () => {
    /* U-1 removed v1 as a ROUTE, not as a REFERENCE. Three surfaces survive on
       purpose and are named in the entry: the ranked table beside the
       shortlist, its per-row notes, and the sentence that says why its top row
       is not a stand-in for an empty shortlist. Each of them is a comparison a
       designer asked for; each of them says out loud that it decided nothing —
       which is exactly what UI-1 had to repair when the top row WAS loaded. */
    /* U-9 fase 2 — V15: WAS "the three surfaces are in the app". IS: they are in
       the SOURCE, unchanged, and none of them is rendered — each sits behind
       `v1ReadingShown()`, which is false since the knobs that sort the table
       are niets (B-2.2, Sander 25-10-2026). WHY: a table nobody can explain is
       as dead as knobs without their table, so they went together. The ranking
       itself (the v1 motor) stays, untouched, for U-10. */
    expect(APP).toContain('v1 reading — not the route that made this run');
    expect(APP).toContain('v1 note (not applied on this route)');
    expect(APP).toContain('the v1 ranking below has no knowledge of your gates');
    /* U-10 fase 3 (V15) — WAS `rankChain3Results(` in the source: the v1
     * ranking is gone from the app; the hidden table now lists the recorded order. */
    expect(APP).not.toContain('rankChain3Results(');
    expect(v1ReadingShown()).toBe(false);
    expect(APP).toContain('{v1ReadingShown() && chainScan && v2Shortlist && (');
    expect(APP).toContain('{v1ReadingShown() && chainScan && (');
    expect(APP).toMatch(/\{v1ReadingShown\(\)\s*\? t\('No design was loaded: \{n\} of \{m\} candidates meet the requirements you stated\. The Working tab is untouched — the v1 ranking below/);
  });

  /* U-10 fase 3 — REMOVED, deliberately: "the flag is still switchable in code,
   * and false is still the v1 engine". It was the half of U-1's pair that kept
   * the v1 branch alive; U-10 is the session that removes it (inventory §4). */
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
