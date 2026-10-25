/**
 * U-9 fase 3 — GUIDED: EENVOUDIG, MAAR VERSTANDIG.
 *
 * Stap 0b eerst: de tweewegcrash van fase 2 (`polarityBranchOf` las `tAdjust`
 * vóór zijn `const`-declaratie, een temporal-dead-zone-ReferenceError sinds
 * H-4) is gerepareerd zonder test, omdat geen test `runVfOptimize` uitvoert.
 * Een functietest kan het dus niet vangen; een BRONSCAN wel. De scan leest elke
 * `polarityBranchOf`-reader in `runVfOptimize` en eist dat hij geen naam leest
 * die in die functie pas NA de reader als `const`/`let` gedeclareerd wordt en
 * er niet al eerder stond — precies de vorm die de crash had.
 *
 * Nagemeten dat hij kan falen: `branchAdj.tweeter` terug naar `tAdjust` zet
 * de claim op rood met de naam erbij.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  GUIDED_PROFILES,
  PROFILE_SKIP_REASON,
  VOICING_CHOICES,
  profileStatedBy,
  profileWrites,
  profilesOf,
  selectedProfile,
  targetsOf,
} from './guidedProfiles.ts';
import {
  DESTINED_ROWS,
  EXPERT_ONLY_ROW_IDS,
  GATE_LIMIT_KEYS,
  GUIDED_DESTINATION,
  GUIDED_QUESTIONS,
  V2_GUIDED_STAGES,
} from './v2Guided.ts';
import { V2_INPUT_REGISTER } from './v2InputRegister.ts';
import { V2_SETTING_KEYS, V2_STATED_EXTRA_KEYS, clearStatedBy, restoreV2Settings, statedMarkFor } from './v2Settings.ts';
import { GATE_IDS } from './engine2/optimizer/gates.ts';
import { EngineV2Panel } from '../components/EngineV2Panel.tsx';
import { buildReport } from './engine2/report.ts';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from './engine2/casus1.fixture.ts';
import { FLAT_TARGET } from './engine2/requirements/targetCurve.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf8');
const PROFILES_SRC = readFileSync(join(HERE, 'guidedProfiles.ts'), 'utf8');

/** Commentaar weg (de reden bij de reparatie citeert de oude code bij naam). */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** De body van `runVfOptimize`, van zijn kop tot de afsluitende accolade. */
function runVfOptimizeBody(src: string): string {
  const head = src.indexOf('async function runVfOptimize(');
  if (head < 0) throw new Error('runVfOptimize not found');
  const open = src.indexOf('{', src.indexOf(')', src.indexOf('= {}', head)));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error('runVfOptimize body not closed');
}

/** Een pijlfunctie-body die op `start` begint (de `{` na `=>`). */
function arrowBody(src: string, from: number): { body: string; end: number } {
  const open = src.indexOf('{', src.indexOf('=>', from));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return { body: src.slice(open, i + 1), end: i + 1 };
  }
  throw new Error('arrow body not closed');
}

/** Namen die een stuk bron als `const`/`let` declareert. */
const declared = (s: string): Set<string> =>
  new Set([...s.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));

/** Kale identifiers die een stuk bron leest: geen property na een punt en geen objectsleutel. */
const readNames = (s: string): Set<string> => {
  const keyless = s.replace(/([{,]\s*)[A-Za-z_$][\w$]*\s*:/g, '$1');
  return new Set([...keyless.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
};

/** Parameters van élke pijlfunctie in een stuk bron — gebonden, dus nooit laat. */
const params = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const m of s.matchAll(/\(([^()]*)\)\s*(?::[^=]*)?=>/g))
    for (const n of m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)/g)) out.add(n[1]);
  for (const m of s.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*=>/g)) out.add(m[1]);
  return out;
};

function lateReads(src: string): { readers: number; late: string[] } {
  const body = stripComments(runVfOptimizeBody(src));
  const late: string[] = [];
  let readers = 0;
  for (const m of body.matchAll(/const polarityBranchOf\s*=/g)) {
    readers++;
    const at = m.index!;
    const { body: reader, end } = arrowBody(body, at);
    const before = declared(body.slice(0, at));
    const inside = new Set([...declared(reader), ...params(body.slice(at, end))]);
    const after = declared(body.slice(end));
    for (const name of readNames(reader)) {
      if (inside.has(name) || before.has(name)) continue;
      if (after.has(name)) late.push(name);
    }
  }
  return { readers, late };
}

describe('U-9 fase 3, stap 0b — de TDZ-guard op polarityBranchOf', () => {
  it('beide routes van runVfOptimize dragen een polarityBranchOf-reader (de scan loopt echt)', () => {
    expect(lateReads(APP).readers).toBe(2);
  });

  it('geen polarityBranchOf leest een const/let die runVfOptimize pas later declareert', () => {
    expect(lateReads(APP).late).toEqual([]);
  });

  it('tegenproef: de vorm van de fase-2-crash wordt gevangen, met de naam erbij', () => {
    const broken = APP.replace('adjust: branchAdj.tweeter };', 'adjust: tAdjust };');
    expect(broken).not.toBe(APP);
    expect(lateReads(broken).late).toContain('tAdjust');
  });
});

/* ================================================================== *
 * B-1 — de profielen, zoals Sander ze goedkeurde (25-10-2026)
 * ================================================================== */
const valueOf = (id: string, rowId: string) => {
  const p = GUIDED_PROFILES.find((x) => x.id === id)!;
  const v = p.values.find((x) => x.rowId === rowId)!;
  return v.amount.kind === 'value' ? v.amount.value : v.amount.fraction;
};

describe('U-9 fase 3 (B-1): the approved profile table', () => {
  it('every value is the approved number — amplifier', () => {
    expect([valueOf('amp-8ohm', 'ampMinLoadOhm'), valueOf('amp-4-8ohm', 'ampMinLoadOhm'), valueOf('amp-2ohm', 'ampMinLoadOhm')]).toEqual([6.4, 3.2, 1.6]);
    expect([valueOf('amp-8ohm', 'amplifierPowerW'), valueOf('amp-4-8ohm', 'amplifierPowerW'), valueOf('amp-2ohm', 'amplifierPowerW')]).toEqual([30, 100, 200]);
    expect([valueOf('amp-8ohm', 'amplifierPeakPowerW'), valueOf('amp-4-8ohm', 'amplifierPeakPowerW'), valueOf('amp-2ohm', 'amplifierPeakPowerW')]).toEqual([60, 200, 400]);
    for (const id of ['amp-8ohm', 'amp-4-8ohm', 'amp-2ohm']) expect(valueOf(id, 'amplifierNominalLoadOhm')).toBe(8);
  });

  it('every value is the approved number — load, and M-C goes on the TOP way only', () => {
    expect(['load-calm', 'load-firm', 'load-party'].map((id) => valueOf(id, 'driveOnFsMaxDb-per-way'))).toEqual([-18, -20, -24]);
    expect(['load-calm', 'load-firm', 'load-party'].map((id) => valueOf(id, 'xmaxMarginFraction'))).toEqual([1.0, 0.8, 0.7]);
    expect(['load-calm', 'load-firm', 'load-party'].map((id) => valueOf(id, 'resistorThermalPowerW'))).toEqual([0.02, 0.1, 0.25]);
    /* B-1's finding: the single figure would also judge the midrange, where
       the derived excursion ceiling is the right one. No profile writes it. */
    for (const p of GUIDED_PROFILES) {
      expect(p.values.some((v) => v.target === 'maxDriveOnFsDb'), p.id).toBe(false);
      for (const v of p.values) if (v.rowId === 'driveOnFsMaxDb-per-way') expect(v.target).toBe('driveOnFsMaxDb:high');
    }
  });

  it('every value is the approved number — build, and voicing', () => {
    expect(['build-simple', 'build-balanced', 'build-whatever'].map((id) => valueOf(id, 'resistorClassW'))).toEqual([10, 10, 20]);
    for (const id of ['build-simple', 'build-balanced', 'build-whatever']) expect(valueOf(id, 'resistorPowerMargin')).toBe(0.5);
    expect(['build-simple', 'build-balanced', 'build-whatever'].map((id) => valueOf(id, 'splWindowPlusMinusDb'))).toEqual([3, 2, 1.5]);
    expect(GUIDED_PROFILES.find((p) => p.id === 'build-simple')!.values.some((v) => v.rowId === 'maxPhaseTrackingDeg')).toBe(false);
    expect(valueOf('build-balanced', 'maxPhaseTrackingDeg')).toBe(30);
    expect(valueOf('build-whatever', 'maxPhaseTrackingDeg')).toBe(30);
    expect(VOICING_CHOICES.map((c) => c.plateauDepthDb)).toEqual([null, 1.5, 3, 4.5]);
  });

  it('every value names its basis and both failure directions, and fills a real register row', () => {
    for (const p of GUIDED_PROFILES) {
      expect(p.name.trim(), p.id).not.toBe('');
      for (const v of p.values) {
        expect(V2_INPUT_REGISTER.some((r) => r.id === v.rowId), `${p.id}: ${v.rowId}`).toBe(true);
        expect([...V2_SETTING_KEYS, ...V2_STATED_EXTRA_KEYS] as string[]).toContain(v.target);
        for (const f of [v.basis, v.tooStrict, v.tooLoose]) expect(f.trim().length, `${p.id}: ${v.rowId}`).toBeGreaterThan(10);
      }
    }
  });

  it('a share of the continuous power is derived from it, and NOT written without it (P4)', () => {
    const firm = GUIDED_PROFILES.find((p) => p.id === 'load-firm')!;
    const a = profileWrites(firm, '100');
    expect(a.writes.find((w) => w.rowId === 'resistorThermalPowerW')?.value).toBe('10');
    const b = profileWrites(firm, '');
    expect(b.writes.some((w) => w.rowId === 'resistorThermalPowerW')).toBe(false);
    expect(b.skipped.map((x) => [x.rowId, x.pct])).toEqual([['resistorThermalPowerW', 10]]);
    expect(PROFILE_SKIP_REASON).toContain('{pct}');
  });

  it('P6: no profile value is typed outside guidedProfiles.ts — the guided pane holds no number of its own', () => {
    const pane = stripComments(
      APP.slice(
        APP.indexOf("{designTab === 'requirements' && engineV2Enabled && (() => {"),
        APP.indexOf("{designTab === 'filters' && !result && (", APP.indexOf("{designTab === 'requirements' && engineV2Enabled")),
      ),
    );
    /* Quoted numbers count too: a profile value smuggled in as the string a
       form holds ('3.2') is still a typed profile value. */
    const nums = [...pane.matchAll(/(?<![\w$.{-])-?\d+(?:\.\d+)?(?![\w$])/g)].map((m) => Number(m[0]));
    for (const n of nums) expect([0, 1, 10], `literal ${n} in the guided pane`).toContain(n);
    /* …and the approved numbers live in exactly one source file. */
    for (const lit of ['6.4, 30', '3.2, 100', '1.6, 200', '-18,', '-20,', '-24,']) expect(PROFILES_SRC).toContain(lit);
  });
});

/* ================================================================== *
 * Attributie — "stated via profile …", gewist bij een eigen bewerking
 * ================================================================== */
describe('U-9 fase 3: profile attribution', () => {
  it('a profile value reads "stated via profile <name> on <date>", a demo "stated by", the viewer "stated by you"', () => {
    const p = GUIDED_PROFILES.find((x) => x.id === 'amp-4-8ohm')!;
    expect(profileStatedBy(p)).toBe('profile 4–8 Ω');
    expect(statedMarkFor('3.2', '2026-10-25', profileStatedBy(p))).toBe('stated via profile 4–8 Ω on 2026-10-25');
    expect(statedMarkFor('3.2', '2026-10-25', 'the KOAN 2951 demo')).toBe('stated by the KOAN 2951 demo on 2026-10-25');
    expect(statedMarkFor('3.2', '2026-10-25', undefined)).toBe('stated by you on 2026-10-25');
    expect(statedMarkFor('', '2026-10-25', profileStatedBy(p))).toBeNull();
  });

  it('an own edit clears the profile name — then the value is yours (the U-3 rule)', () => {
    const by = { ampMinLoadOhm: 'profile 4–8 Ω', amplifierPowerW: 'profile 4–8 Ω' } as const;
    const after = clearStatedBy(by, 'ampMinLoadOhm');
    expect(after.ampMinLoadOhm).toBeUndefined();
    expect(after.amplifierPowerW).toBe('profile 4–8 Ω');
    expect(selectedProfile('amplifier', after)).toBeNull();
  });

  it('the selected profile is the one whose every value carries its name', () => {
    const p = GUIDED_PROFILES.find((x) => x.id === 'amp-2ohm')!;
    const by = Object.fromEntries(targetsOf('amplifier').map((t) => [t, profileStatedBy(p)]));
    expect(selectedProfile('amplifier', by)?.id).toBe('amp-2ohm');
    expect(selectedProfile('load', by)).toBeNull();
    /* A load profile whose thermal share could not be written is still selected. */
    const firm = GUIDED_PROFILES.find((x) => x.id === 'load-firm')!;
    const partial = { 'driveOnFsMaxDb:high': profileStatedBy(firm), xmaxMarginFraction: profileStatedBy(firm) };
    expect(selectedProfile('load', partial)?.id).toBe('load-firm');
  });

  it('the provenance of the two extras travels in the project, and a project from before U-9 opens unattributed', () => {
    const r = restoreV2Settings(
      { amplifierPowerW: '100' },
      { amplifierPowerW: '2026-10-25', ampMinLoadOhm: '2026-10-25' },
      { amplifierPowerW: 'profile 4–8 Ω', ampMinLoadOhm: 'profile 4–8 Ω', 'driveOnFsMaxDb:high': 'profile Played loud' },
    );
    expect(r.statedBy.ampMinLoadOhm).toBe('profile 4–8 Ω');
    expect(r.statedBy['driveOnFsMaxDb:high']).toBe('profile Played loud');
    expect(r.statedAt.ampMinLoadOhm).toBe('2026-10-25');
    const old = restoreV2Settings({ amplifierPowerW: '100', ampMinLoadOhm: '2.6' } as never, undefined, undefined);
    expect(old.settings.amplifierPowerW).toBe('100');
    expect(old.statedBy).toEqual({});
  });

  it('the report says per gate who stated its limit, and renders as before without it', () => {
    const golden = loadGolden();
    const manifest = casus1Manifest(golden);
    const files = casus1Files(manifest);
    const report = buildReport({
      manifest,
      files,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      geometry: casus1Geometry(golden),
      settings: { targetCurve: FLAT_TARGET, ampMinLoadOhm: 3.2 },
    });
    const plain = renderToStaticMarkup(<EngineV2Panel report={report} />);
    expect(plain).not.toContain('v2-limit-by');
    expect(renderToStaticMarkup(<EngineV2Panel report={report} limitProvenance={{}} />)).toBe(plain);
    const html = renderToStaticMarkup(
      <EngineV2Panel report={report} limitProvenance={{ 'M-B/|Z|': 'stated via profile 4–8 Ω on 2026-10-25' }} />,
    );
    expect(html).toContain('stated via profile 4–8 Ω on 2026-10-25');
    expect(html.match(/v2-limit-by/g)).toHaveLength(1);
  });

  it('GATE_LIMIT_KEYS names every gate, and the app feeds it to the panel', () => {
    expect(Object.keys(GATE_LIMIT_KEYS).sort()).toEqual([...GATE_IDS].sort());
    for (const keys of Object.values(GATE_LIMIT_KEYS))
      for (const k of keys) expect([...V2_SETTING_KEYS, ...V2_STATED_EXTRA_KEYS] as string[]).toContain(k);
    expect(APP).toContain('limitProvenance={v2LimitProvenance}');
    expect(APP).toContain('for (const [gate, keys] of Object.entries(GATE_LIMIT_KEYS)) {');
  });

  it('an own edit of the two extras stamps them, in expert and in guided', () => {
    expect(APP.match(/noteStatedExtra\('ampMinLoadOhm', raw\);/g)).toHaveLength(2);
    expect(APP.match(/noteStatedExtra\('driveOnFsMaxDb:high', e\.target\.value\);/g)).toHaveLength(2);
    expect(APP).toContain("{role === 'high' && v2StatedExtra('driveOnFsMaxDb:high', v2Meas.high.driveOnFsMaxDb)}");
    expect(APP).toContain("{v2StatedExtra('ampMinLoadOhm', ampMinLoadOhm === null ? '' : String(ampMinLoadOhm))}");
  });
});

/* ================================================================== *
 * De vijf vragen en de bestemming van elke eis
 * ================================================================== */
describe('U-9 fase 3: five questions, and where every requirement goes', () => {
  it('at most FIVE question screens, and the passive path holds no free number field', () => {
    expect(GUIDED_QUESTIONS.length).toBeLessThanOrEqual(5);
    expect(GUIDED_QUESTIONS).toHaveLength(5);
    for (const q of GUIDED_QUESTIONS) for (const f of q.freeFields) expect(f.onlyWhen, `${q.id}: ${f.rowId}`).toBe('hybrid');
    /* …and the pane draws its one free field only under the hybrid tick. */
    expect(APP).toContain("{engineV2Settings.activeSideOn === 'on' && (\n                                <div className=\"v2-req-fields\">\n                                  {v2RequirementField('activeHandoverHz')}");
  });

  it('every judgement row and every row that judges has EXACTLY ONE destination', () => {
    const destined = DESTINED_ROWS.map((r) => r.id).sort();
    expect(Object.keys(GUIDED_DESTINATION).sort()).toEqual(destined);
    expect(destined.length).toBeGreaterThan(30);
    const stages = V2_GUIDED_STAGES.map((s) => s.id) as string[];
    const qids = GUIDED_QUESTIONS.map((q) => q.id) as string[];
    for (const [id, d] of Object.entries(GUIDED_DESTINATION)) {
      if (d.kind === 'question') expect(qids, id).toContain(d.question);
      else if (d.kind === 'measurement') expect(stages, id).toContain(d.stage);
      else expect(d.why.trim().length, id).toBeGreaterThan(10);
    }
  });

  it('a row sent to a profile question is one a profile of that question writes, and back', () => {
    for (const q of ['amplifier', 'load', 'ambition'] as const) {
      const sent = Object.entries(GUIDED_DESTINATION)
        .filter(([, d]) => d.kind === 'question' && d.question === q)
        .map(([id]) => id)
        .sort();
      const written = [...new Set(profilesOf(q).flatMap((p) => p.values.map((v) => v.rowId)))].sort();
      expect(written, q).toEqual(sent);
    }
    expect(EXPERT_ONLY_ROW_IDS).toContain('maxDriveOnFsDb');
    expect(EXPERT_ONLY_ROW_IDS).toContain('lfBumpBudgetDb');
  });

  it('the pane asks the five, shows what each pick states before it is picked, and names what guided does not ask', () => {
    expect(APP).toContain('const qs = GUIDED_QUESTIONS;');
    expect(APP).toContain("{t('This states:')}");
    expect(APP).toContain("{t('Replaces your own value for:')}");
    expect(APP).toContain("<summary>{t('These requirements are not judged')}</summary>");
    expect(APP).toContain("{t('{n} requirement(s) stated in expert, and judged on the run:', { n: expertStated.length })}");
    expect(APP).toContain("{t('{n} settings steer the search on an app start value — not stated by you', { n: onAppDefault.length })}");
  });

  it('the guided shortlist sorts on a key the user picks and names it — no recommended crown', () => {
    expect(APP).toContain('value={guidedShortlistOrder}');
    expect(APP).toContain("t('Not a ranking: every row met what you stated, and the engine does not say which is best.')");
    /* Scoped to the result area: "Recommended range" on a driver card is a
       datasheet field, not a crown. */
    const result = APP.slice(APP.indexOf('{v2Shortlist && ('), APP.indexOf('{/* U-6 RESULT · BELOW */}'));
    expect(result.length).toBeGreaterThan(1000);
    expect(result).not.toMatch(/recommended|aanbevolen|best design/i);
  });
});

/* ================================================================== *
 * B-3 (c) — de Wizard is expert-only
 * ================================================================== */
describe('U-9 fase 3 (B-3 c): the Wizard is not part of guided', () => {
  it('its one render point, its button and the palette entry are all outside guided', () => {
    expect(APP.match(/\{wizardOpen && /g)).toHaveLength(1);
    expect(APP).toContain("{wizardOpen && uiMode !== 'guided' && (");
    expect(APP).not.toContain("t('Walk me through it')");
    expect(APP).toContain("...(uiMode === 'guided' ? [] : [{ id: 'wizard', label: t('Open the design wizard')");
  });

  it('the welcome card, the empty pane and the blank-slate open guided’s own first step instead', () => {
    expect(APP).toContain("else if (next === 'wizard' && uiMode === 'guided') {");
    expect(APP).toContain("onClick={() => (uiMode === 'guided' ? setDesignTab('import') : setWizardOpen(true))}");
    expect(APP).toMatch(/if \(uiMode === 'guided'\) \{\n\s*setDesignTab\('import'\);\n\s*return;/);
  });
});
