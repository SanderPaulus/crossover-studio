/**
 * U-9 fase 2 — EXPERT: ALLES WAT IETS DOET, IN DE VOLGORDE VAN HET ONTWERPEN;
 * v1 VERDWIJNT UIT BEELD.
 *
 * Vijf groepen, de acceptatie van de startprompt:
 *
 *   (1) DE APP-BREDE DRIFTGUARD (U-3b over alle tabs) — elk `<input>`,
 *       `<select>` en `<textarea>` van de app raakt precies één registertoken,
 *       buiten de drie uitzonderingen die hieronder bij naam staan;
 *   (2) ÉÉN TEKENPUNT PER TOKEN — geen veld wordt in dezelfde weergave twee keer
 *       getekend (de U-3b-faalvorm);
 *   (3) DE GROEPSVOLGORDE KOMT UIT HET REGISTER — `App.tsx` typt er geen;
 *   (4) B-2 — wat alleen v1 bedient staat in geen enkele modus in beeld, en een
 *       perturbatie toont dat de v2-invoer er niet van afhangt;
 *   (5) DE APP-STARTWAARDE ZEGT WAT ZIJ IS — "app default — not stated by you"
 *       naast elk zoekveld dat op de waarde van de app staat (N2, P4).
 *
 * Elke scan hieronder is tegen een opzettelijke breuk gemeten vóórdat hij
 * opgeschreven werd (het casusboek noemt welke).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  V2_APP_CONTROLS,
  V2_FIELD_GROUPS,
  V2_FILE_ROWS,
  V2_FORM_FIELDS,
  V2_GROUP_HEADING,
  V2_INPUT_REGISTER,
  rendersRow,
  rowsElsewhere,
  rowsOfGroup,
  v1ReadingShown,
} from './v2InputRegister.ts';
import {
  APP_DEFAULTS,
  APP_DEFAULT_ROWS,
  appDefaultMark,
  restoreFieldStatedAt,
  stampField,
  type AppDefaultKey,
} from './appDefaults.ts';
import * as chain3Mod from './threeWayChain.ts';
import type { Chain3Input } from './threeWayChain.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { handleV2Request } from './engine2/optimizer/worker.ts';
import { stableJson } from './engine2/optimizer/determinism.ts';
import { buildReport } from './engine2/report.ts';
import { ctcKey } from './engine2/metrics/types.ts';
import {
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_V2_BAND_HZ,
  CASUS1_TARGET_CURVE,
  CASUS1_WINDOW_SETTINGS,
  CASUS1_EXCURSION,
  CASUS1_COIL_DCR_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from './engine2/casus1V2.fixture.ts';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from './engine2/casus1.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(HERE, '..');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');
const APP = read('App.tsx');
const CHAIN3 = read('lib/threeWayChain.ts');

/* ================================================================== *
 * Bron-hulpjes
 * ================================================================== */

/** The opening tag of every form control, by brace depth (an arrow `=>` sits inside braces). */
function controlTags(src: string): { at: number; tag: string }[] {
  const out: { at: number; tag: string }[] = [];
  for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
    let depth = 0;
    let i = m.index!;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push({ at: m.index!, tag: src.slice(m.index!, i + 1) });
  }
  return out;
}

/** The span of the JSX expression opened by the first `(` after `from`, by paren balance. */
function parenSpan(src: string, from: number): [number, number] {
  const open = src.indexOf('(', from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return [from, i + 1];
  }
  throw new Error('unbalanced');
}
/** A function body by brace balance, from its declaration. */
function braceSpan(src: string, from: number): [number, number] {
  const open = src.indexOf('{', src.indexOf('=>', from));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return [from, i + 1];
  }
  throw new Error('unbalanced');
}

/**
 * THE THREE NAMED EXCEPTIONS of the app-wide guard, each a region by its own
 * landmark, and each with its reason. Asserted to be real and sizeable below.
 *
 *   · the WIZARD — a walk over the same state (I-3's rule: one store, two
 *     views). Since U-9 fase 3 (B-3 c) it is EXPERT-ONLY (`uiMode !== 'guided'`
 *     on its one render point, pinned in `u9Fase3.test.ts`), and it stays named
 *     here for a reason the guard itself states: its controls redraw rows the
 *     panel already holds (the priority radio, the slopes, the pin, the snap
 *     choices) on purpose, so test (2) — one draw point per token — cannot hold
 *     for it. Was: "phase 3 of U-9 redesigns it". Phase 3 measured it (every
 *     field it writes is ZOEKT, fase 0) and moved it out of guided instead;
 *   · the guided REQUIREMENT renderer (`v2RequirementField`) — the second VIEW
 *     of the requirement fields, by row id, which `v2Guided.test.ts` governs;
 *   · the cabinet helpers `veld` and `refTopVeld` — their fields are
 *     inventoried at their CALL SITES (`cab('…')`, `refTopVeld()`), which
 *     `v2InputPlacement.test.ts` scans.
 */
const EXEMPT: Record<string, [number, number]> = {
  wizard: parenSpan(APP, APP.indexOf("{wizardOpen && uiMode !== 'guided' && (")),
  guidedRequirement: braceSpan(APP, APP.indexOf('const v2RequirementField = (')),
  cabinetHelper: parenSpan(APP, APP.indexOf('=> (', APP.indexOf('const veld = ('))),
  cabinetRefTop: parenSpan(APP, APP.indexOf('=> (', APP.indexOf('const refTopVeld = ('))),
};
const exempt = (at: number) => Object.values(EXEMPT).some(([a, b]) => at >= a && at < b);

const PANEL = (() => {
  const i = APP.indexOf('{/* I-1 FORM · V2 PANEL');
  const j = APP.indexOf('{/* I-1 FORM · V2 PANEL END */}', i);
  expect(i).toBeGreaterThan(0);
  expect(j).toBeGreaterThan(i);
  return APP.slice(i, j);
})();

/** The tokens that may identify a control of `file`. */
function tokensFor(file: string): { row: string; control: string }[] {
  const app = V2_APP_CONTROLS.filter((c) => c.file === file);
  return file === 'App.tsx' ? [...V2_FORM_FIELDS, ...app] : app;
}

const COMPONENT_FILES = [
  'components/SchematicEditor.tsx',
  'components/FilterControls.tsx',
  'components/HelpPanel.tsx',
  'components/MeasuringGuide.tsx',
  'components/CatalogManager.tsx',
];

/* ================================================================== *
 * (1) — de app-brede driftguard
 * ================================================================== */
describe('U-9 fase 2 (1): every control of the app has a register row', () => {
  it('the exceptions are real regions, and each holds controls', () => {
    for (const [name, [a, b]] of Object.entries(EXEMPT)) {
      expect(b - a, name).toBeGreaterThan(100);
      expect(controlTags(APP.slice(a, b)).length, name).toBeGreaterThan(0);
    }
  });

  it('every <input>/<select>/<textarea> of App.tsx outside the exceptions matches exactly one token', () => {
    const tokens = tokensFor('App.tsx');
    const tags = controlTags(APP).filter((c) => !exempt(c.at));
    expect(tags.length).toBeGreaterThan(150);
    for (const { at, tag } of tags) {
      const hit = [...new Set(tokens.filter((tk) => tag.includes(tk.control)).map((tk) => tk.control))];
      expect(hit.length, `App.tsx@${at}: ${tag.slice(0, 140).replace(/\s+/g, ' ')} matches ${hit.length} tokens`).toBe(1);
    }
  });

  it('every control of a component file is filed — by token, or the whole file under one row', () => {
    for (const f of COMPONENT_FILES) {
      const tags = controlTags(read(f));
      expect(tags.length, f).toBeGreaterThan(0);
      if (V2_FILE_ROWS[f]) {
        expect(tokensFor(f), `${f} is filed whole AND by token`).toEqual([]);
        continue;
      }
      const tokens = tokensFor(f);
      for (const { at, tag } of tags) {
        const hit = tokens.filter((tk) => tag.includes(tk.control));
        expect(hit.length, `${f}@${at}: ${tag.slice(0, 120).replace(/\s+/g, ' ')}`).toBe(1);
      }
    }
  });

  it('every token names a row with an effect and a group, and occurs in its file', () => {
    for (const c of [...V2_APP_CONTROLS.map((x) => ({ ...x })), ...V2_FORM_FIELDS.map((x) => ({ ...x, file: 'App.tsx' }))]) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === c.row);
      expect(row, c.row).toBeDefined();
      expect(row!.group, c.row).toBeTruthy();
      expect(read(c.file).includes(c.control), `${c.file}: ${c.control}`).toBe(true);
    }
    for (const row of Object.values(V2_FILE_ROWS)) expect(V2_INPUT_REGISTER.some((r) => r.id === row), row).toBe(true);
  });

  it('every register row has a group from the list, and every group heading is the register’s', () => {
    for (const r of V2_INPUT_REGISTER) expect(V2_FIELD_GROUPS, r.id).toContain(r.group);
    expect(Object.keys(V2_GROUP_HEADING).sort()).toEqual([...V2_FIELD_GROUPS].sort());
    for (const g of V2_FIELD_GROUPS) expect(rowsOfGroup(g).length, g).toBeGreaterThan(0);
  });
});

/* ================================================================== *
 * (2) — één tekenpunt per token
 * ================================================================== */
describe('U-9 fase 2 (2): no field is drawn twice', () => {
  it('outside the exceptions every value-bearing token draws exactly one control', () => {
    /* File inputs are ACTIONS (open a file) and may be offered in two places;
     * the cabinet form is the named double render (cards in guided, a ledger
     * in expert — `v2InputPlacement.test.ts` pins both occurrences). */
    const tags = controlTags(APP).filter((c) => !exempt(c.at) && !/type="file"/.test(c.tag));
    const tokens = tokensFor('App.tsx').filter((t) => !V2_FORM_FIELDS.some((f) => f.form === 'cabinet' && f.control === t.control));
    for (const tk of tokens) {
      const n = tags.filter((c) => c.tag.includes(tk.control)).length;
      if (n === 0) continue; // a token of a file input, or of the cabinet helper
      expect(n, `${tk.row}: ${tk.control} is drawn ${n} times`).toBe(1);
    }
  });

  it('the build mode, drawn twice until U-9, is drawn once and read back where it was', () => {
    expect(controlTags(APP).filter((c) => c.tag.includes('value={synthMode}')).length).toBe(1);
    expect(APP).toContain("t('Build mode: acoustic result (set next to Optimize)')");
  });
});

/* ================================================================== *
 * (3) — de volgorde uit het register
 * ================================================================== */
describe('U-9 fase 2 (3): the group order is read from the register', () => {
  it('the panel maps over V2_FIELD_GROUPS and prints the register’s heading', () => {
    expect(PANEL).toContain('{V2_FIELD_GROUPS.map((g) => (');
    expect(PANEL).toContain('<span className="opt-group-cap">{t(V2_GROUP_HEADING[g])}</span>');
    expect(PANEL).toContain('{groupElsewhere(g)}');
  });

  it('App.tsx types no order of its own: no list of group ids, and each group block is keyed by id', () => {
    const ids = V2_FIELD_GROUPS.map((g) => `'${g}'`);
    // No array literal or object holding two group ids in a row.
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i !== j) expect(APP, `${ids[i]}, ${ids[j]}`).not.toContain(`${ids[i]}, ${ids[j]}`);
      }
    }
    // Every group that holds a panel control has its own block, keyed by id.
    const panelRows = new Set(V2_FORM_FIELDS.filter((f) => f.form === 'v2-panel').map((f) => f.row));
    for (const g of V2_FIELD_GROUPS) {
      const holds = rowsOfGroup(g).some((r) => panelRows.has(r.id));
      if (holds) expect(PANEL, g).toContain(`{g === '${g}' && (`);
    }
  });

  it('the architecture group comes first and run & shortlist last (the H-2 rule, and how you look at the answer)', () => {
    expect(V2_FIELD_GROUPS[0]).toBe('architecture');
    expect(V2_FIELD_GROUPS[V2_FIELD_GROUPS.length - 1]).toBe('run');
    expect(V2_FIELD_GROUPS).not.toContain('v1' as never);
  });

  it('a group names what it holds on another tab, and nothing the panel draws itself', () => {
    const panelRows = new Set(V2_FORM_FIELDS.filter((f) => f.form === 'v2-panel').map((f) => f.row));
    for (const g of V2_FIELD_GROUPS) for (const r of rowsElsewhere(g)) expect(panelRows.has(r.id), r.id).toBe(false);
    expect(rowsElsewhere('measurement').map((r) => r.id)).toContain('responses');
  });

  it('every rendered panel field carries its badge — what it does, where its number comes from', () => {
    const panelRows = [...new Set(V2_FORM_FIELDS.filter((f) => f.form === 'v2-panel').map((f) => f.row))];
    for (const id of panelRows) {
      if (!rendersRow(id)) continue;
      expect(PANEL, id).toContain(`{fieldBadge('${id}')}`);
    }
  });
});

/* ================================================================== *
 * (4) — B-2: v1 verdwijnt uit beeld
 * ================================================================== */
afterEach(() => vi.restoreAllMocks());

describe('U-9 fase 2 (4): nothing v1-only is on screen in any mode', () => {
  it('the v1 reading is not shown, and it is the knobs that hide it', () => {
    expect(v1ReadingShown()).toBe(false);
    expect(rendersRow('bomCapEur')).toBe(false);
    expect(rendersRow('v1Thresholds')).toBe(false);
    expect(rendersRow('excursionSpl')).toBe(false);
  });

  it('every surface of the v1 reading sits behind v1ReadingShown(), and the rescued list behind its absence', () => {
    for (const g of [
      '{v1ReadingShown() && chainScan && v2Shortlist && (',
      '{v1ReadingShown() && chainScan && (',
      '{!v1ReadingShown() && chainScan && !v2Shortlist && (',
    ]) {
      expect(APP).toContain(g);
    }
    // The heading and the per-row note live INSIDE those guards.
    const heading = APP.indexOf("{t('v1 reading — not the route that made this run')}");
    const headGuard = APP.lastIndexOf('{v1ReadingShown() && chainScan && v2Shortlist && (', heading);
    expect(headGuard).toBeGreaterThan(-1);
    expect(heading - headGuard).toBeLessThan(2000);
    const note = APP.indexOf("t('v1 note (not applied on this route)')");
    const tableGuard = APP.lastIndexOf('{v1ReadingShown() && chainScan && (', note);
    expect(note - tableGuard).toBeLessThan(9000);
    expect(tableGuard).toBeGreaterThan(headGuard);
  });

  it('every v1Legacy( call sits behind the rendersRow guard of its own row', () => {
    const calls = [...APP.matchAll(/v1Legacy\('([A-Za-z0-9]+)'\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const m of calls) {
      const id = m[1];
      expect(rendersRow(id), id).toBe(false);
      const guard = APP.lastIndexOf(`rendersRow('${id}') &&`, m.index);
      expect(guard, `${id} at ${m.index} has no guard before it`).toBeGreaterThan(-1);
      expect(m.index! - guard, `${id}: guard too far away`).toBeLessThan(1500);
    }
  });

  it('the rescued candidates are listed unranked: the v1 ranking is not called on them', () => {
    const i = APP.indexOf("setChainScan({ rows: rescued.rows.map((rr) => chain3ScanRow(rr, null)), active: '' });");
    expect(i).toBeGreaterThan(0);
    expect(APP.slice(i - 600, i)).not.toContain('rankChain3Results(');
  });

  /* U-10 fase 3 (V15) — WAS "the v1 motor stays, untouched: the rankings and
   * the scans are still in the source (U-10)". U-10 is the session that removes
   * them from the app; the claim is now that they are gone. */
  it('the v1 rankings and scans are gone from the app (U-10)', () => {
    for (const gone of ['rankChain3Results(', 'rankChainResults(', 'runChain3Scan(', 'runChainScan(']) {
      expect(APP, gone).not.toContain(gone);
    }
  });

  /* THE PERTURBATION. The hidden v1 thresholds (and the design level, through
   * the v1 excursion floor) reach the v2 route through ONE door: the v1 physics
   * window becomes `judgeWindows` on the chain input, which the chain reads only
   * AFTER the tune to stamp the v1 verdict columns the hidden table drew. The
   * BOM cap reaches nothing but the v1 rankings. So the v2 search — what the
   * design step and the tuner read — is byte-identical whatever they hold. */
  it('the chain reads judgeWindows only after the tune', () => {
    const tuneAt = CHAIN3.indexOf('let net = optimizeNetworkValues');
    expect(tuneAt).toBeGreaterThan(0);
    const reads = [...CHAIN3.matchAll(/input\.judgeWindows/g)].map((m) => m.index!);
    expect(reads.length).toBeGreaterThan(0);
    for (const at of reads) expect(at).toBeGreaterThan(tuneAt);
  });

  it('two different v1 windows leave what the design step and the tuner read byte-identical', () => {
    const golden = loadGolden();
    const manifest = casus1Manifest(golden, 'm3');
    const files = casus1Files(manifest);
    const report = buildReport({
      manifest, files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry: casus1Geometry(golden),
      settings: { ...CASUS1_WINDOW_SETTINGS, orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 }, targetCurve: CASUS1_TARGET_CURVE, ...CASUS1_EXCURSION, ...CASUS1_COIL_DCR_SETTINGS },
    });
    const g = casus1ChainInput(manifest, files, golden);
    const c = casus1Field(report).field.candidates[0];
    const seed = (JSON.parse(readFileSync(join(ROOT, 'test-fixtures/casus1/KAND-V2-1.adsfilter.json'), 'utf8')) as { parts: VxpPart[] }).parts;
    const payload = (judgeWindows: Chain3Input['judgeWindows']) => ({
      input: {
        grid: [...g.grid], w: g.w, m: g.m, t: g.t, driverZ: g.driverZ,
        tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
        xoLow: c.crossings[0].hz, xoHigh: c.crossings[1].hz,
        xoLowRange: c.crossings[0].cageHz, xoHighRange: c.crossings[1].cageHz,
        label: c.label, judgeWindows,
        settings: { ...CASUS1_V2_SETTINGS, safety: g.safety },
      },
      v2: {
        ...casus1V2Facts(report, manifest, files),
        gates: { ...CASUS1_V2_GATES }, budgets: { ...CASUS1_V2_BUDGETS },
        determinism: { seed: CASUS1_V2_SEED }, targetCurve: CASUS1_TARGET_CURVE, judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: casus1V2Declaration(c, g.safety),
    });
    const seen: string[] = [];
    vi.spyOn(chain3Mod, 'runThreeWayChain').mockImplementation(((input: Chain3Input, _p: unknown, hooks?: { tuneOptionsFor?: (s: readonly VxpPart[]) => object }) => {
      const hook = hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seed) : {};
      const strip = (o: object) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'function' ? undefined : v)));
      seen.push(stableJson({ settings: strip(input.settings), tuner: strip(hook) }));
      throw new Error('__u9f2__');
    }) as never);
    for (const jw of [undefined, { low: { floorHz: 100, ceilHz: 600 }, high: { floorHz: 1000, ceilHz: 4000 } }, { low: null, high: { floorHz: 3000, ceilHz: 3100 } }]) {
      handleV2Request({ id: 1, kind: 'v2Chain3One', payload: payload(jw) } as never, () => {});
    }
    expect(seen).toHaveLength(3);
    for (const s of seen) expect(s).toBe(seen[0]);
  });

  it('the BOM cap reaches nothing but the v1 rankings', () => {
    /* Inside a `rendersRow('bomCapEur')` expression is never rendered (B-2.2). */
    const hidden = [...APP.matchAll(/rendersRow\('bomCapEur'\) &&/g)].map((m) => {
      const open = APP.lastIndexOf('{', m.index!);
      let depth = 0;
      for (let i = open; i < APP.length; i++) {
        if (APP[i] === '{') depth++;
        else if (APP[i] === '}' && --depth === 0) return [open, i] as const;
      }
      return [open, open] as const;
    });
    expect(hidden.length).toBeGreaterThan(1);
    const uses = [...APP.matchAll(/\bbomCapEur\b/g)].map((m) => m.index!).filter((at) => !hidden.some(([a, b]) => at > a && at < b));
    for (const at of uses) {
      const line = APP.slice(APP.lastIndexOf('\n', at) + 1, APP.indexOf('\n', at));
      const ctx = APP.slice(Math.max(0, at - 400), at);
      const ok =
        /rankChain3?Results\(/.test(ctx) || // an argument of a v1 ranking
        /useState|setBomCapEur|localStorage|value=\{bomCapEur\}|bomCapEur === 0|bomCapEur,$|bomCapEur\]|const nv|rendersRow\('bomCapEur'\)|v1Legacy\('bomCapEur'\)/.test(line);
      expect(ok, `bomCapEur read at ${at}: ${line.trim()}`).toBe(true);
    }
  });
});

/* ================================================================== *
 * (5) — de app-startwaarde zegt wat zij is
 * ================================================================== */
describe('U-9 fase 2 (5): a search field on the app start value says so', () => {
  const values = { ...APP_DEFAULTS } as Record<AppDefaultKey, unknown>;

  it('on the start value: "app default — not stated by you", with the value', () => {
    expect(appDefaultMark('phasePriority', values, {})).toEqual({ kind: 'app-default', text: 'app default — not stated by you (50)', value: '50' });
    expect(appDefaultMark('stagedOn', values, {}).text).toBe('app default — not stated by you (on · 2.5 · 15)');
  });

  it('a first edit is stated with its date, whatever the value (stampStated’s way)', () => {
    const at = stampField({}, 'phasePriority', '2026-10-25');
    expect(appDefaultMark('phasePriority', values, at)).toEqual({ kind: 'stated', text: 'stated by you on 2026-10-25', date: '2026-10-25' });
  });

  it('an old project away from the start value reads as stated, date not recorded (E-2’s rule)', () => {
    const moved = { ...values, dirWeight: 40 };
    expect(appDefaultMark('dirWeight', moved, {})).toEqual({ kind: 'stated', text: 'stated by you (date not recorded)', date: null });
    expect(appDefaultMark('powerMetric', { ...values, powerFoldWeight: 1 }, {}).kind).toBe('stated');
    // …and a restore keeps only strings on rows this module knows.
    expect(restoreFieldStatedAt({ dirWeight: '2026-10-01', bogus: '2026', costWeight: 3 })).toEqual({ dirWeight: '2026-10-01' });
    expect(restoreFieldStatedAt(undefined)).toEqual({});
  });

  it('an unknown row throws rather than answering', () => {
    expect(() => appDefaultMark('nope', values, {})).toThrow(/no app start value/);
    expect(() => stampField({}, 'nope')).toThrow(/no app start value/);
  });

  it('every start value is read from APP_DEFAULTS in App.tsx, and none is typed beside it', () => {
    for (const k of Object.keys(APP_DEFAULTS) as AppDefaultKey[]) {
      expect(APP, k).toContain(`APP_DEFAULTS.${k}`);
    }
    // the literals that were the initials until U-9
    for (const gone of [
      'useState(50); // % of budget to phase',
      "const [acSlopeMid, setAcSlopeMid] = useState('24');",
      "const [targetRipple, setTargetRipple] = useState('2.5');",
      'v >= 0 ? v : 0.015;',
      "['priority', phasePriority !== 50,",
    ]) {
      expect(APP, gone).not.toContain(gone);
    }
  });

  it('every row with an app start value is a searching row, and its field carries the mark and the stamp', () => {
    for (const id of Object.keys(APP_DEFAULT_ROWS)) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === id);
      expect(row, id).toBeDefined();
      expect(row!.effect, id).toBe('zoekt');
      expect(APP, id).toContain(`{appDefault('${id}')}`);
      expect(APP, id).toContain(`fieldStamp('${id}')`);
    }
  });

  it('the stated dates travel in the project file and come back on restore', () => {
    expect(read('lib/project.ts')).toContain('fieldStatedAt?: Partial<Record<string, string>>;');
    expect(APP).toContain('fieldStatedAt: { ...fieldStatedAt },');
    expect(APP).toContain('setFieldStatedAt(restoreFieldStatedAt(d.fieldStatedAt));');
  });
});

/* ================================================================== *
 * (6) — per route verborgen wat daar niets doet (Sander, 25-10-2026)
 * ================================================================== */
describe('U-9 fase 2 (6): a field that does nothing on a route is hidden there', () => {
  it('the four three-way-only fields wait for a three-way that is not a hybrid', () => {
    for (const label of ["{t('Source R disqualify ≥')}", "{t('DI anchor weight')}", "{t('Acoustic slope woofer (low xo)')}"]) {
      const i = PANEL.indexOf(label);
      expect(i, label).toBeGreaterThan(0);
      expect(PANEL.slice(Math.max(0, i - 1200), i), label).toContain('{threeWay && !v2Hybrid && (');
    }
    // the U-5c sentence went with the field it apologised for
    expect(APP).not.toContain('not read on the two-way Engine v2 route');
  });

  it('the two-way step count waits for a pin OR the full field', () => {
    expect(PANEL).toContain("{!threeWay && (xoRangeOn || fieldModeOf(engineV2Settings.fieldMode) === 'full') && (");
  });
});
