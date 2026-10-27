/**
 * U-9 fase 1 — WAT NIETS DOET WORDT NIET GERENDERD, en die claim blijft waar.
 *
 * Drie groepen, de drie tests van de startprompt:
 *
 *   (1) elke registerrij draagt een gemeten `effect`, en elk veld van een
 *       bestuurd formulier heeft zo'n rij;
 *   (2) een `niets`-rij wordt in geen enkele modus gerenderd — elke plek waar
 *       `App.tsx` haar besturingselement tekent staat achter `rendersRow(id)`
 *       — en een afhankelijk besturingselement staat achter zijn ouder;
 *   (3) per `niets`-veld een PERTURBATIE: wat de v2-route uit het veld maakt is
 *       byte-identiek voor élke waarde. De vergelijking gebeurt op de effectieve
 *       invoer van de keten — ná alle `withDeclared*`-overschrijvingen en ná de
 *       tuner-hook die de verklaring als laatste spreidt — via een observator op
 *       de keten-export die gooit vóór er getuned wordt. Byte-identieke invoer
 *       is onder A5e.4 een byte-identieke tune en dus een byte-identieke
 *       shortlist, voor seconden in plaats van uren. Faalt een van deze ooit,
 *       dan is het veld niet meer `niets` en hoort het terug in beeld.
 *
 * De meting waarop het register rust is `scripts/measure-u9-field-effects.ts`
 * (`docs/U-9_veldinventaris.md`); de NIETS-lijst is door Sander goedgekeurd op
 * 25-10-2026.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  V2_DEPENDENT_CONTROLS,
  V2_FORM_FIELDS,
  V2_INPUT_REGISTER,
  V2_NIETS_ROWS,
  rendersRow,
} from './v2InputRegister.ts';
import * as chain3Mod from './threeWayChain.ts';
import * as chain2Mod from './designChain.ts';
import { activeSideBranches, assembledTuneOptions, designStepOptions, type ChainInput } from './designChain.ts';
import type { Chain3Input } from './threeWayChain.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { handleV2Request } from './engine2/optimizer/worker.ts';
import { stableJson } from './engine2/optimizer/determinism.ts';
import { SEARCH_SMOOTHING_OCTAVES } from './engine2/constants.ts';
import { buildReport } from './engine2/report.ts';
import { ctcKey } from './engine2/metrics/types.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from './engine2/casus1V2.fixture.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './engine2/casus1.fixture.ts';
import {
  CASUS1B_TARGET_CURVE,
  CASUS1B_V2_BAND_HZ,
  CASUS1B_V2_BUDGETS,
  CASUS1B_V2_GATES,
  CASUS1B_V2_SEED,
  casus1bChainInput,
  casus1bChainInputFor,
  casus1bField,
  casus1bFiles,
  casus1bManifest,
  casus1bReport,
  casus1bSeed,
  casus1bV2Declaration,
  casus1bV2Facts,
} from './engine2/casus1b.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf8');
const CHAIN3 = readFileSync(join(HERE, 'threeWayChain.ts'), 'utf8');
const EFFECTS = ['zoekt', 'oordeelt', 'toont', 'niets'] as const;

/** Every region of `src` rendered under `guard`: from the guard to the `(`
 *  that follows its `&&`, through the matching `)`. */
function guardedRegions(src: string, guard: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const g = src.indexOf(guard, from);
    if (g < 0) return out;
    const amp = src.indexOf('&&', g + guard.length - 2);
    const open = src.indexOf('(', amp);
    let depth = 0;
    let end = open;
    for (; end < src.length; end++) {
      if (src[end] === '(') depth++;
      else if (src[end] === ')' && --depth === 0) break;
    }
    out.push(src.slice(g, end + 1));
    from = end + 1;
  }
}
const allIndexes = (src: string, needle: string) => {
  const out: number[] = [];
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) out.push(i);
  return out;
};
function everyUseIsGuarded(control: string, guard: string): { uses: number; outside: number[] } {
  const regions = guardedRegions(APP, guard).map((r) => [APP.indexOf(r), APP.indexOf(r) + r.length] as const);
  const uses = allIndexes(APP, control);
  return { uses: uses.length, outside: uses.filter((at) => !regions.some(([a, b]) => at >= a && at < b)) };
}

/* ================================================================== *
 * (1) — elke rij een gemeten effect
 * ================================================================== */
describe('U-9 (1): every register row carries a measured effect', () => {
  it('every row has exactly one of the four effects', () => {
    for (const r of V2_INPUT_REGISTER) expect(EFFECTS, r.id).toContain(r.effect);
  });
  it('every field of a governed form has a row with an effect, and a niets one only behind its guard', () => {
    /* U-9 fase 2 — V15: WAS "no governed field is a niets row". IS: since the
     * whole grouped Filters panel is a governed form, the hidden fields that
     * stood in its v1 sections are inventoried controls of it — and every one of
     * them must be a NIETS_CONTROLS entry below, i.e. sit behind `rendersRow`.
     * WHY: the drift guard needs every control of the region in the inventory,
     * and "never rendered" is pinned per control in (2). */
    for (const f of V2_FORM_FIELDS) {
      const row = V2_INPUT_REGISTER.find((r) => r.id === f.row);
      expect(row, f.row).toBeDefined();
      expect(EFFECTS, f.row).toContain(row!.effect);
      if (row!.effect === 'niets') expect(NIETS_CONTROLS[f.row], `${f.row} is niets and not guarded below`).toContain(f.control);
    }
  });
  it('rendersRow answers from the register and THROWS on an unknown id', () => {
    expect(rendersRow('ampMinLoadOhm')).toBe(true);
    expect(rendersRow('errorSmoothOct')).toBe(false);
    expect(() => rendersRow('no-such-row')).toThrow(/no register row/);
  });
});

/* ================================================================== *
 * (2) — niets wordt nooit gerenderd; een afhankelijk veld wacht op zijn ouder
 * ================================================================== */
/** The source fragments that draw each niets row's controls — by name, the V47/V48 lesson. */
const NIETS_CONTROLS: Record<string, string[]> = {
  errorSmoothOct: ['value={String(errorSmoothOct)}'],
  hpLpPref: ['value={hpLpPref}', 'value={hpLpPrefLow}'],
  scan3Mode: ['value={scan3Mode}'],
  /* U-9 fase 2 (B-2.2, Sander 25-10-2026) — the v1 comparison: the knobs that
   * sorted the v1 table, hidden together with the table. */
  bomCapEur: ['value={bomCapEur}'],
  excursionSpl: ['value={excursionSpl}'],
  v1Thresholds: [
    'value={kaTier}',
    'value={ctcK}',
    'value={breakupLimitOn ? breakupHarmonic',
    'value={xoWinThr.arrayK}',
    'value={xoWinThr.ctcLambdaDiv',
    'value={xoWinThr.fsK}',
    'value={xoWinThr.breakupDiv}',
  ],
};

describe('U-9 (2): a niets row is never rendered', () => {
  it('the niets set is exactly the approved one, by name (Sander, 25-10-2026)', () => {
    /* U-9 fase 2 — V15: WAS the three of fase 1. IS those three plus the three
     * of B-2.2 (the v1 comparison). */
    expect([...V2_NIETS_ROWS].sort()).toEqual(['bomCapEur', 'errorSmoothOct', 'excursionSpl', 'hpLpPref', 'scan3Mode', 'v1Thresholds']);
    expect(Object.keys(NIETS_CONTROLS).sort()).toEqual([...V2_NIETS_ROWS].sort());
  });
  it.each(Object.entries(NIETS_CONTROLS))('%s: every control that draws it sits behind rendersRow', (id, controls) => {
    for (const c of controls) {
      const { uses, outside } = everyUseIsGuarded(c, `rendersRow('${id}') &&`);
      expect(uses, `${c} is drawn at all`).toBeGreaterThan(0);
      expect(outside, `${c} is drawn outside rendersRow('${id}')`).toEqual([]);
    }
  });
  it('hidden is not deleted: the values still travel in the project file', () => {
    expect(APP).toMatch(/^\s+hpLpPref,\n\s+hpLpPrefLow,$/m);
    expect(APP).toContain("localStorage.setItem('ads-err-smooth'");
    expect(APP).toContain("localStorage.setItem('ads-scan3-mode'");
  });
  it('the guided non-standard list does not name a field that is never rendered', () => {
    expect(APP).toContain("['align', rendersRow('hpLpPref') && hpLpPref !== 'auto',");
    expect(APP).toContain("['alignLow', rendersRow('hpLpPref') && hpLpPrefLow !== 'auto',");
  });
  it.each(V2_DEPENDENT_CONTROLS.map((d) => [d.row, d] as const))(
    '%s: the dependent control renders only once its parent is set',
    (_row, d) => {
      const { uses, outside } = everyUseIsGuarded(d.control, d.guard);
      expect(uses, `${d.control} is drawn at all`).toBeGreaterThan(0);
      expect(outside, `${d.control} is drawn without "${d.parent}"`).toEqual([]);
    },
  );
});

/* ================================================================== *
 * (3) — de perturbatie per niets-veld
 * ================================================================== */
interface Seen { design: string; tuner: string }
const strip = (o: object): unknown => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'function' ? undefined : v)));
const parts = (p: string) => (JSON.parse(readFileSync(join(ROOT, p), 'utf8')) as { parts: VxpPart[] }).parts;

function observe(kind: 'v2Chain3One' | 'v2ChainOne', payload: unknown, seed: VxpPart[]): Seen {
  let seen: Seen | null = null;
  const SENTINEL = '__u9__';
  if (kind === 'v2Chain3One') {
    vi.spyOn(chain3Mod, 'runThreeWayChain').mockImplementation(((input: Chain3Input, _p: unknown, hooks?: { tuneOptionsFor?: (s: readonly VxpPart[]) => object }) => {
      const hook = hooks?.tuneOptionsFor ? hooks.tuneOptionsFor(seed) : {};
      seen = { design: stableJson(strip({ ...input.settings, errorSmoothOct: undefined })), tuner: stableJson(strip(hook)) };
      throw new Error(SENTINEL);
    }) as never);
  } else {
    vi.spyOn(chain2Mod, 'runDesignChain').mockImplementation(((input: ChainInput, _l: unknown, _p: unknown, hooks?: Parameters<typeof assembledTuneOptions>[3]) => {
      const b = activeSideBranches(input);
      seen = {
        design: stableJson(strip(designStepOptions(input, b))),
        tuner: stableJson(strip(assembledTuneOptions(input, seed, { activeBranch: b.activeBranch, activeBranchSafety: b.activeBranchSafety }, hooks))),
      };
      throw new Error(SENTINEL);
    }) as never);
  }
  handleV2Request({ id: 1, kind, payload } as never, () => {});
  if (!seen) throw new Error(`the observer did not fire (${kind})`);
  return seen;
}
afterEach(() => vi.restoreAllMocks());

/* De drieweg op casus 1 (set 'm3'), gebouwd zoals de generator en `h4-bench.ts` het doen. */
function casus1Payload(settingsPatch: Record<string, unknown>) {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden, 'm3');
  const files = casus1Files(manifest);
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry: casus1Geometry(golden),
    settings: {
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
      maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER },
      ...CASUS1_WINDOW_SETTINGS,
      ...CASUS1_BUILDABILITY,
      ...CASUS1_LEVEL_WORK_SETTINGS,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
      ...CASUS1_EXCURSION,
      ...CASUS1_COIL_DCR_SETTINGS,
    },
  });
  const g = casus1ChainInput(manifest, files, golden);
  const c = casus1Field(report).field.candidates[0];
  return {
    input: {
      grid: [...g.grid], w: g.w, m: g.m, t: g.t, driverZ: g.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
      xoLow: c.crossings[0].hz, xoHigh: c.crossings[1].hz,
      xoLowRange: c.crossings[0].cageHz, xoHighRange: c.crossings[1].cageHz,
      label: c.label,
      settings: {
        ...CASUS1_V2_SETTINGS, safety: g.safety,
        structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
        structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
        xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
        ...settingsPatch,
      },
    },
    v2: {
      ...casus1V2Facts(report, manifest, files),
      gates: { ...CASUS1_V2_GATES }, budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED }, targetCurve: CASUS1_TARGET_CURVE, judgeBandHz: CASUS1_V2_BAND_HZ,
    },
    candidate: casus1V2Declaration(c, g.safety),
  };
}
function casus1bPayload(settingsPatch: Record<string, unknown>) {
  const manifest = casus1bManifest();
  const files = casus1bFiles(manifest);
  const report = casus1bReport(null, manifest, files);
  const g = casus1bChainInput(manifest, files);
  const c = casus1bField(report).field.candidates[0];
  const input = casus1bChainInputFor(c, g, casus1bSeed());
  return {
    input: { ...input, settings: { ...input.settings, ...settingsPatch } },
    label: c.label,
    v2: {
      ...casus1bV2Facts(report, manifest, files),
      gates: { ...CASUS1B_V2_GATES }, budgets: { ...CASUS1B_V2_BUDGETS },
      determinism: { seed: CASUS1B_V2_SEED }, targetCurve: CASUS1B_TARGET_CURVE, judgeBandHz: CASUS1B_V2_BAND_HZ,
    },
    candidate: casus1bV2Declaration(c, g.safety),
  };
}
const SEED3 = parts('test-fixtures/casus1/KAND-V2-1.adsfilter.json');
const SEED2 = parts('test-fixtures/casus1b/KAND-V2-1.adsfilter.json');
const ERROR_SMOOTHING_ARMS = [{}, { errorSmoothOct: 0 }, { errorSmoothOct: 1 / 12 }, { errorSmoothOct: 1 / 6 }];

describe('U-9 (3): perturbing a niets field leaves what the v2 route builds byte-identical', () => {
  it('errorSmoothOct, three-way: the only chain reader is the tuner literal, and the hook overrides it', () => {
    /* U-10 (V15 form) — was the inline `const tuneOpts = {` literal; since U-10
     * it is `assembledTuneOptions3`, the same literal lifted verbatim for the
     * chain and the drawn three-way tune. */
    const lit = CHAIN3.slice(CHAIN3.indexOf('export function assembledTuneOptions3('), CHAIN3.indexOf('export function runThreeWayChain('));
    expect(CHAIN3.match(/\bs\.errorSmoothOct\b/g)).toHaveLength(1);
    expect(lit).toContain('errorSmoothOct: s.errorSmoothOct,');
    expect(lit.indexOf('errorSmoothOct: s.errorSmoothOct')).toBeLessThan(lit.indexOf('hooks.tuneOptionsFor'));
    const seen = ERROR_SMOOTHING_ARMS.map((p) => observe('v2Chain3One', casus1Payload(p), SEED3));
    for (const s of seen) expect(s).toEqual(seen[0]);
    expect(JSON.parse(seen[0].tuner).errorSmoothOct).toBe(SEARCH_SMOOTHING_OCTAVES);
    // Tegenproef: een ZOEKT-veld uit dezelfde sectie beweegt dezelfde observatie wél.
    expect(observe('v2Chain3One', casus1Payload({ costWeight: 0.1 }), SEED3).tuner).not.toBe(seen[0].tuner);
  });
  it('errorSmoothOct, two-way: design step and tuner identical for every value', () => {
    const seen = ERROR_SMOOTHING_ARMS.map((p) => observe('v2ChainOne', casus1bPayload(p), SEED2));
    for (const s of seen) expect(s).toEqual(seen[0]);
    const counter = observe('v2ChainOne', casus1bPayload({ costWeight: 0.1 }), SEED2);
    expect(counter.design).not.toBe(seen[0].design);
    expect(counter.tuner).not.toBe(seen[0].tuner);
  });
  it('hpLpPref: the app replaces it per candidate before anything crosses (both routes)', () => {
    // three-way: `{ ...settings, ...perCandidate }`, and perCandidate binds both structures to the candidate.
    expect(APP).toContain('structureLow: alignmentOf(0) ?? settings.structureLow,');
    expect(APP).toContain('structureHigh: alignmentOf(cand.crossings.length - 1) ?? settings.structureHigh,');
    expect(APP).toContain('settings: { ...settings, ...perCandidate },');
    // two-way: the candidate's alignment is spread after the settings.
    expect(APP).toMatch(/\.\.\.settings,[\s\S]{0,400}?structurePreference: \{\n\s+kind: cand\.crossings\[0\]\.alignment\.kind/);
    // and a generated candidate always carries an alignment on every crossing.
    const golden = loadGolden();
    const manifest = casus1Manifest(golden, 'm3');
    const c3 = casus1Field(buildReport({ manifest, files: casus1Files(manifest), filter: null, geometry: casus1Geometry(golden), settings: { ...CASUS1_WINDOW_SETTINGS } })).field.candidates;
    expect(c3.length).toBeGreaterThan(0);
    for (const c of c3) for (const x of c.crossings) expect(x.alignment.kind).toBeTruthy();
  });
  /* U-10 fase 3 (V15) — WAS: every `scan3Mode` branch is neutralised by
   * `axesOnV2`. The v1 axis scan is gone, so the run no longer reads the field. */
  it('scan3Mode: the run reads it nowhere', () => {
    const start = APP.indexOf('async function runVfOptimize(');
    const body = APP.slice(start, APP.indexOf('function runNetOptimizeV2(', start));
    expect(body.length).toBeGreaterThan(1000);
    expect(body).not.toMatch(/scan3Mode === 'axes'/);
    expect(body).not.toContain('axesOnV2');
  });
});
