/**
 * U-3b — THE DEFAULT VIEW HOLDS WHAT A FILTER IS BUILT FROM, AND THE APP
 * RENDERS THE REGISTER'S PLACEMENT.
 *
 * Sander's rule of 09-09-2026: every field that is not needed to build a
 * filter goes out of the standard view — behind one explicit disclosure, or,
 * for a fallback, out of sight until the case it answers exists. The rule is
 * data (`placementOf` in `v2InputRegister.ts`); this file is the guard that
 * the app obeys it and, more importantly, that it cannot QUIETLY stop obeying
 * it.
 *
 * TWO HALVES, and the second is why this file exists at all.
 *
 *   1. THE RULE IS WELL FORMED — every row resolves to a placement, every
 *      override carries a reason, every conditional names its condition.
 *      A test over data, and it proves only that the data is tidy.
 *   2. THE APP RENDERS IT — a SOURCE SCAN, the idiom `v2Settings.test.ts`,
 *      `selection.test.ts` and `v2InputRegister.test.ts` already use, for the
 *      reason UI-1 paid for: what a function test cannot reach is whether the
 *      screen does it. Every control of a governed form must be in the
 *      inventory and must sit where its placement says. A FIELD ADDED TO ONE
 *      OF THESE FORMS WITHOUT A REGISTER ROW FAILS THE BUILD — the drift guard
 *      Sander asked for, and the I-1 shape of `p6Lint` one layer up.
 *
 * Every scan below was checked to be falsifiable before it was written down.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLACEMENT_BY_CLASS,
  V2_FORM_FIELDS,
  V2_GOVERNED_FORMS,
  V2_INPUT_CLASSES,
  V2_INPUT_REGISTER,
  V2_MORE_HEADING,
  V2_UNGOVERNED_ROWS,
  placementOf,
  rowsOfClass,
  type V2GovernedForm,
  type V2InputRow,
} from './v2InputRegister.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf-8');

const rowById = (id: string): V2InputRow | undefined => V2_INPUT_REGISTER.find((r) => r.id === id);

/**
 * The three governed regions of `App.tsx`, by their own landmarks. Each pair
 * is asserted to be a real, sizeable slice below: a region that silently
 * became empty would make every claim over it vacuous.
 */
const REGION: Record<V2GovernedForm, [string, string]> = {
  cabinet: ["{t('Cabinet & measurement')}", "{t('Driver phase')}"],
  'driver-card': ['const samenvatting = [', '/* ─── Command palette'],
  'v2-panel': ['{engineV2Enabled && (', '<span className="opt-group-cap">{t(\'Components\')}</span>'],
};

function sliceOf(form: V2GovernedForm): string {
  const [a, b] = REGION[form];
  const i = APP.indexOf(a);
  const j = APP.indexOf(b, i);
  expect(i, `${form}: start landmark`).toBeGreaterThan(-1);
  expect(j, `${form}: end landmark`).toBeGreaterThan(i);
  return APP.slice(i, j);
}

/** The fields of one governed form. */
const fieldsOf = (form: V2GovernedForm) => V2_FORM_FIELDS.filter((f) => f.form === form);

/* ==================================================================== *
 * 1 — the rule is well formed
 * ==================================================================== */

describe('U-3b — the placement rule', () => {
  it('the class default is the rule Sander stated: required and judgement are shown, nice and v1 are not', () => {
    expect(V2_INPUT_CLASSES.map((c) => PLACEMENT_BY_CLASS[c])).toEqual([
      'always',
      'always',
      'more',
      'more',
    ]);
  });

  it('every row resolves to a placement, and every override carries its reason', () => {
    for (const r of V2_INPUT_REGISTER) {
      expect(['always', 'more', 'conditional'], r.id).toContain(placementOf(r));
      if (r.placement === undefined) {
        expect(r.placementWhy, `${r.id} states a reason for a placement it does not override`).toBeUndefined();
        continue;
      }
      expect(r.placement, `${r.id} overrides its class with the same value`).not.toBe(PLACEMENT_BY_CLASS[r.cls]);
      expect(r.placementWhy?.trim(), `${r.id} overrides its placement without saying why`).toBeTruthy();
    }
  });

  it('a conditional row names its condition, and nothing else carries one', () => {
    for (const r of V2_INPUT_REGISTER) {
      if (placementOf(r) === 'conditional') expect(r.condition?.trim(), r.id).toBeTruthy();
      else expect(r.condition, r.id).toBeUndefined();
    }
    /* The two fallbacks are named, not counted — the V47/V48 lesson. Both are
     * a stand-in for something a file or a cabinet already knows, and a
     * permanently visible stand-in invites someone to fill it in over the
     * thing it stands in for (A3h). */
    expect(V2_INPUT_REGISTER.filter((r) => placementOf(r) === 'conditional').map((r) => r.id).sort()).toEqual([
      'cabinetDepth',
      'gateOverride',
      'manualWindow',
      /* U-4 — the fourth, and it is the same shape as the other three: a
       * control that answers a case which may not exist. With no stated
       * maximum crossover for this driver there is nothing to overrule, and a
       * permanently visible switch that is usually inert is a switch someone
       * reaches for. */
      'maxCrossoverOverride',
    ]);
  });

  it('no REQUIRED or JUDGEMENT row is hidden, and every hidden row is nice or v1', () => {
    for (const r of rowsOfClass('required')) expect(placementOf(r), r.id).toBe('always');
    for (const r of rowsOfClass('judgement')) expect(placementOf(r), r.id).toBe('always');
    for (const r of V2_INPUT_REGISTER) {
      if (placementOf(r) === 'always') continue;
      expect(['nice', 'v1-legacy'], r.id).toContain(r.cls);
    }
  });

  it('the NICE rows that stay in the default view are named, with what each would cost', () => {
    /* A named set rather than a count: a nice row added later takes the class
     * default and disappears behind the disclosure, which is the right answer;
     * one that should stay visible has to be argued for HERE.
     *
     * U-3c added the three DATASHEET rows to it, U-3f the fourth
     * (`powerRating`, M-M), U-3g the fifth (`minCrossover`) and U-4 the sixth
     * (`maxCrossover`, the other end of the same line) — each arrived
     * by the rule rather than as a new exception, and this named set is where
     * the arrival is noticed. That is a rule and not three
     * exceptions: a number the designer copies off a spec sheet is generic data
     * every project has, so it belongs where it is filled in. The second claim
     * below states it as a rule, so a datasheet row added later inherits it
     * instead of quietly landing behind the fold. */
    const shown = rowsOfClass('nice').filter((r) => placementOf(r) === 'always').map((r) => r.id);
    expect(shown.sort()).toEqual(
      ['baffleHeight', 'blTm', 'maxCrossover', 'micDistance', 'minCrossover', 'mmsG', 'powerRating',
        'refDriver', 'referencePoint', 'sourceCount', 'xmaxMm'].sort(),
    );
    for (const id of shown) expect(rowById(id)!.placementWhy, id).toBeTruthy();
  });

  it('every DATASHEET row is in the default view, and they sit on the card they are filled in on', () => {
    const sheet = V2_INPUT_REGISTER.filter((r) => r.source === 'datasheet');
    expect(sheet.map((r) => r.id).sort()).toEqual(
      ['blTm', 'maxCrossover', 'minCrossover', 'mmsG', 'nominalSize', 'powerRating', 'sd', 'xmaxMm'].sort(),
    );
    /* The rule binds where the rule GOVERNS. `nominalSize` is the one datasheet
     * row in a form this placement rule does not reach — it is the v1 fallback
     * for a missing S_d and sits in Filters → Driver limits — so it is named
     * here rather than given a placement nobody enforces. A datasheet row added
     * later in an ungoverned form fails this line, which is when someone should
     * look. */
    const governed = new Set(V2_FORM_FIELDS.map((f) => f.row));
    expect(sheet.filter((r) => !governed.has(r.id)).map((r) => r.id)).toEqual(['nominalSize']);
    for (const r of sheet) {
      if (!governed.has(r.id)) continue;
      expect(placementOf(r), r.id).toBe('always');
    }
    /* The four that describe ONE driver read as one row, because a spec sheet
     * reads as one row — S_d, X_max, Bl and M_ms on the driver card. The fifth
     * (`nominalSize`) is a v1 fallback for a missing S_d and lives in Filters,
     * which is why it is named above rather than moved. */
    for (const id of ['sd', 'xmaxMm', 'blTm', 'mmsG']) {
      expect(rowById(id)!.form, id).toContain('driver card');
    }
    const row = sliceOf('driver-card');
    const at = row.indexOf("{t('Datasheet')}");
    expect(at).toBeGreaterThan(-1);
    const block = row.slice(at, at + 3500);
    for (const c of ['value={sdCm2[role]}', 'value={xmaxMm[role]}', 'value={v2Meas[role].blTm}', 'value={v2Meas[role].mmsG}']) {
      expect(block, c).toContain(c);
    }
  });
});

/* ==================================================================== *
 * 2 — the inventory covers the governed forms, both ways
 * ==================================================================== */

describe('U-3b — every control of a governed form is in the register', () => {
  it('every inventoried control names a real row and occurs in App.tsx', () => {
    for (const f of V2_FORM_FIELDS) {
      expect(rowById(f.row), `${f.row} is not a register row`).toBeDefined();
      expect(V2_GOVERNED_FORMS, f.control).toContain(f.form);
      expect(sliceOf(f.form).includes(f.control), `${f.form}: ${f.control} not found`).toBe(true);
    }
  });

  it('the ungoverned rows are a named set, and disjoint from the inventory', () => {
    const inventoried = new Set(V2_FORM_FIELDS.map((f) => f.row));
    for (const id of V2_UNGOVERNED_ROWS) {
      expect(rowById(id), id).toBeDefined();
      expect(inventoried.has(id), `${id} is both governed and ungoverned`).toBe(false);
    }
    /* Together they must be the WHOLE register: a row that is neither
     * inventoried nor named as ungoverned is a field nobody placed. */
    const accounted = new Set([...inventoried, ...V2_UNGOVERNED_ROWS]);
    expect(V2_INPUT_REGISTER.filter((r) => !accounted.has(r.id)).map((r) => r.id)).toEqual([]);
  });

  /* THE DRIFT GUARD. Every `<input>`/`<select>` of a governed region has to be
   * one of the inventoried controls — so a field added to one of these forms
   * without a register row and a placement decision is a red test. The
   * cabinet form builds its inputs through one helper (`veld`), so its
   * controls are the CALL SITES rather than the tags. */
  it('the driver card and the v2 panel hold no control the inventory does not name', () => {
    for (const form of ['driver-card', 'v2-panel'] as const) {
      const R = sliceOf(form);
      const tokens = fieldsOf(form).map((f) => f.control);
      const at = [...R.matchAll(/<(input|select|textarea)\b/g)].map((m) => m.index!);
      expect(at.length, `${form}: controls found`).toBeGreaterThan(10);
      for (let i = 0; i < at.length; i++) {
        const seg = R.slice(at[i], at[i + 1] ?? Math.min(at[i] + 900, R.length));
        const hit = tokens.filter((tk) => seg.includes(tk));
        expect(
          hit.length,
          `${form}: the control at offset ${at[i]} matches ${hit.length} inventory entries — ${seg.slice(0, 160).replace(/\s+/g, ' ')}`,
        ).toBe(1);
      }
    }
  });

  it('the cabinet form holds no field the inventory does not name', () => {
    const R = sliceOf('cabinet');
    const tokens = new Set(fieldsOf('cabinet').map((f) => f.control));
    for (const m of R.matchAll(/cab\('[A-Za-z]+'\)/g)) {
      expect(tokens.has(m[0]), `${m[0]} has no register row`).toBe(true);
    }
    // The two controls that do not go through `cab`, and nothing else: the
    // reference-point field (a draft-and-commit input) and the origin select.
    expect((R.match(/refTopVeld\(\)/g) ?? []).length).toBeGreaterThan(0);
    expect((R.match(/<select/g) ?? []).length).toBe((R.match(/value=\{cabinet\.refDriver\}/g) ?? []).length);
  });
});

/* ==================================================================== *
 * 3 — the app renders the placement
 * ==================================================================== */

/**
 * The JSX expression a guard opens: from the `{` that introduces it to its
 * matching `}`. Used to check that a CONDITIONAL control is rendered only
 * inside its guard — asserting merely that the guard string exists somewhere
 * is not enough, and was measured not to be: deleting the guard from the
 * expert ledger left the guided card's copy of it standing, and the check
 * stayed green.
 */
function guardedRegions(slice: string, guard: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = slice.indexOf(guard, from);
    if (at === -1) break;
    from = at + guard.length;
    let open = slice.lastIndexOf('{', at);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < slice.length; i++) {
      if (slice[i] === '{') depth += 1;
      else if (slice[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          out.push(slice.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

/** The `<details className="v2-more">` regions of a slice, by brace balance. */
function moreRegions(slice: string): string[] {
  const out: string[] = [];
  for (const m of slice.matchAll(/<details className="v2-more[^"]*"/g)) {
    const from = m.index!;
    // Find the matching </details> by counting opens and closes after it.
    let depth = 0;
    const re = /<details\b|<\/details>/g;
    re.lastIndex = from;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(slice)) !== null) {
      depth += mm[0] === '</details>' ? -1 : 1;
      if (depth === 0) {
        out.push(slice.slice(from, mm.index + mm[0].length));
        break;
      }
    }
  }
  return out;
}

describe('U-3b — the app puts each control where its placement says', () => {
  it('each governed form carries exactly one "more" disclosure, headed by the register’s own words', () => {
    for (const form of V2_GOVERNED_FORMS) {
      const R = sliceOf(form);
      const more = moreRegions(R);
      expect(more.length, `${form}: one disclosure`).toBe(1);
      expect(more[0], `${form}: the heading is the register's`).toContain('V2_MORE_HEADING');
    }
    // The heading itself says what the disclosure holds, in Sander's terms.
    expect(V2_MORE_HEADING).toMatch(/not needed to build a filter/);
  });

  /**
   * Is this offset behind an EXPAND — nested inside a `<details>` tag, or
   * passed as an argument to `kaart(...)`, the helper that builds the guided
   * cabinet cards? The second half is not a loophole: `kaart` renders a
   * `<details className="cab-card">` with no `open`, which is asserted below
   * before this function is trusted. Textual nesting cannot see it because the
   * fields are an ARGUMENT and the tag lives in the helper.
   */
  function insideSomeDetails(slice: string, at: number): boolean {
    let depth = 0;
    const re = /<details\b|<\/details>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(slice)) !== null && m.index < at) depth += m[0] === '</details>' ? -1 : 1;
    if (depth > 0) return true;
    return cardCalls(slice).some(([a, b]) => at >= a && at < b);
  }

  /** The `kaart(` call spans of a slice, by parenthesis balance. */
  function cardCalls(slice: string): [number, number][] {
    const out: [number, number][] = [];
    for (const m of slice.matchAll(/\bkaart\(/g)) {
      const from = m.index!;
      let depth = 0;
      for (let i = from + 'kaart'.length; i < slice.length; i++) {
        if (slice[i] === '(') depth += 1;
        else if (slice[i] === ')') {
          depth -= 1;
          if (depth === 0) { out.push([from, i + 1]); break; }
        }
      }
    }
    return out;
  }

  const usesOf = (slice: string, control: string): number[] =>
    [...slice.matchAll(new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].map((m) => m.index!);

  it('a "more" control is behind an expand EVERYWHERE, and an "always" control is never behind the form’s one', () => {
    /* THE CABINET FORM RENDERS TWICE — cards in guided, a ledger in expert —
     * so "the control is inside the disclosure" has to be true of EVERY
     * occurrence, or a field is hidden on one screen and permanent on the
     * other. In guided every card is itself a `<details>`, which is why the
     * claim is "behind an expand" rather than "inside the v2-more region", and
     * why the second half below still pins the form's own disclosure. */
    /* The premise of `insideSomeDetails`' second half: `kaart` really is a
     * collapsed disclosure. Without this the guided cards would be a hole big
     * enough to hide the whole cabinet form in. */
    const kaart = APP.slice(APP.indexOf('const kaart = ('), APP.indexOf('const kaart = (') + 700);
    expect(kaart).toContain('<details className="cab-card">');
    expect(kaart).not.toMatch(/<details className="cab-card"[^>]*\bopen\b/);

    for (const form of V2_GOVERNED_FORMS) {
      const R = sliceOf(form);
      const more = moreRegions(R)[0];
      const moreAt = R.indexOf(more);
      for (const f of fieldsOf(form)) {
        const p = placementOf(rowById(f.row)!);
        const uses = usesOf(R, f.control);
        expect(uses.length, `${form}: ${f.control} is rendered at all`).toBeGreaterThan(0);
        if (p === 'more') {
          for (const at of uses) {
            expect(insideSomeDetails(R, at), `${form}: ${f.control} (${f.row}) at ${at} is in the default view`).toBe(true);
          }
          expect(more.includes(f.control), `${form}: ${f.control} (${f.row}) is behind the form's own disclosure`).toBe(true);
        } else if (p === 'always') {
          for (const at of uses) {
            expect(
              at >= moreAt && at < moreAt + more.length,
              `${form}: ${f.control} (${f.row}) should be in the default view`,
            ).toBe(false);
          }
        }
      }
    }
  });

  /* A CONDITIONAL CONTROL IS BEHIND ITS OWN GUARD, and the guard is the app's
   * own answer to the condition the register states — not a second one typed
   * here. `cabinetInfo.windowless` is `sourceMeta`'s decision in its own order
   * (a declared merge block first, P-1, then the ARTA window), and
   * `cabinetInfo.offBaffle` is the list the cabinet form already used to write
   * "only needed for side-firing drivers". */
  it('a conditional control renders only under its own condition', () => {
    const guards: Record<string, string> = {
      gateOverride: 'cabinetInfo.windowless.length > 0 &&',
      manualWindow: 'cabinetInfo.windowless.includes(role) &&',
      cabinetDepth: 'cabinetInfo.offBaffle.length > 0 &&',
      /* U-4 — the condition IS the register's: "only while this driver states
       * a maximum crossover". Without one there is nothing to overrule. */
      maxCrossoverOverride: "v2Meas[role].maxCrossoverHz.trim() !== '' &&",
    };
    for (const f of V2_FORM_FIELDS) {
      const p = placementOf(rowById(f.row)!);
      if (p !== 'conditional') continue;
      expect(guards[f.row], `${f.row} has no guard in this test`).toBeTruthy();
      const R = sliceOf(f.form);
      const guarded = guardedRegions(R, guards[f.row]);
      expect(guarded.length, `${f.row}: the guard`).toBeGreaterThan(0);
      /* EVERY occurrence, not just one: the expert ledger and the guided cards
       * render the cabinet form twice, and a guard on one of the two is a
       * field that is permanent on the other. */
      const uses = [...R.matchAll(new RegExp(f.control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))].map((m) => m.index!);
      expect(uses.length, `${f.row}: rendered at all`).toBeGreaterThan(0);
      for (const at of uses) {
        const inside = guarded.some((g) => {
          const gi = R.indexOf(g);
          return at >= gi && at < gi + g.length;
        });
        expect(inside, `${f.row}: the use at offset ${at} is outside its guard`).toBe(true);
      }
      // …and the control is NOT also rendered unconditionally beside it.
      expect(moreRegions(R)[0].includes(f.control), `${f.row} is conditional, not hidden`).toBe(false);
    }
    /* The condition is computed once, from the readers the app already uses,
     * rather than re-derived at the field. */
    expect(APP).toContain('const windowless = ');
    expect(APP).toContain('if (readMergeBlock(l.raw)) return false;');
    expect(APP).toContain("return readGateHeader(l.raw).kind !== 'parsed';");
  });

  it('the scans can see: the regions are real and hold the controls they are asked about', () => {
    /* Without this, "no unnamed control" cannot be told apart from "the
     * landmark moved and the slice is empty", and every claim above would pass
     * over nothing. */
    for (const form of V2_GOVERNED_FORMS) expect(sliceOf(form).length, form).toBeGreaterThan(5000);
    expect(sliceOf('cabinet')).toContain("cab('micDistanceMm')");
    expect(sliceOf('driver-card')).toContain('value={sdCm2[role]}');
    expect(sliceOf('v2-panel')).toContain('value={engineV2Settings.runSeed}');
    expect(V2_FORM_FIELDS.length).toBeGreaterThan(50);
  });

  /* E-2's rule, one field further: a JUDGEMENT input may not show a number it
   * does not hold. The bass-plateau depth escaped it because the voicing lives
   * on the DESIGN and is not a `V2SettingKey`, so E-2's guard never looked at
   * it — it carried a `placeholder="2.5"` until U-3b. */
  it('the voicing depth shows the unset mark, not a number', () => {
    const R = sliceOf('v2-panel');
    const i = R.indexOf('String(activeTargetCurve.plateauDepthDb)');
    expect(i).toBeGreaterThan(-1);
    const seg = R.slice(i, i + 600);
    expect(seg).toContain('placeholder={UNSET_GHOST}');
    expect(seg).not.toMatch(/placeholder="[\d.]/);
  });
});
