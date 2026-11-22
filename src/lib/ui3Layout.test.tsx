/**
 * UI-3 — WHERE THINGS ARE (Sander, 15-11-2026): the project actions live in
 * one menu in the top bar, the places (design / NF/FF merge / compare) are the
 * primary switch, guided/expert is a view of the design place, and the merge
 * page sits under the top bar instead of over it.
 *
 * Source scans in the UI-1 idiom: a unit test cannot say WHERE the app renders
 * a control, and placement is the whole claim here. Comments are stripped
 * first, because the reasons quote the code they explain.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import ProjectMenu from '../components/ProjectMenu.tsx';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = strip(readFileSync('src/App.tsx', 'utf8'));
const MERGE = strip(readFileSync('src/components/NfMergeTool.tsx', 'utf8'));
const CSS = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const noop = () => {};

describe('UI-3 — the project menu', () => {
  it('holds new, open, save and both examples, and says where the autosave stands', () => {
    const html = renderToStaticMarkup(
      <ProjectMenu hasWork canSave onSave={noop} onOpenFile={noop} onNew={noop} onExample={noop} autosaveNote="Restored from autosave" />,
    );
    for (const s of ['Reset — new, empty project…', 'Open project…', 'Save project', '3-way example', '2-way example (mid + tweeter)', 'Restored from autosave'])
      expect(html).toContain(s);
  });

  it('is the ONLY place the project is reset from, and the app renders it in the top bar', () => {
    expect(APP).toContain('<ProjectMenu');
    expect(APP.indexOf('<ProjectMenu')).toBeLessThan(APP.indexOf('<div className={`status-chips'));
    expect((APP.match(/resetProject/g) ?? []).length).toBe(2); // the definition and onNew
    expect(APP).toContain('onNew={resetProject}');
    expect(APP).not.toContain("{t('Reset')}");
  });

  it('the Your-project step no longer carries the demo buttons between the file imports', () => {
    const i = APP.indexOf("{t('Import from other tools')}");
    const j = APP.indexOf("{t('Component catalog')}", i);
    expect(i).toBeGreaterThan(0);
    expect(APP.slice(i, j)).not.toMatch(/loadDemo/);
  });
});

describe('UI-3 — places and view', () => {
  it('the place switch has design, merge and compare; guided/expert sits apart and only while designing', () => {
    const at = APP.indexOf('place-switch');
    for (const pl of ["'design'", "'merge'", "'compare'"]) expect(APP.indexOf(pl, at)).toBeGreaterThan(at);
    const view = APP.indexOf('view-switch');
    expect(view).toBeGreaterThan(APP.indexOf('<div className="tb-right">'));
    expect(APP.slice(view - 200, view)).toContain("!mergeRoute.open && uiMode !== 'compare'");
  });
});

describe('UI-3 — the merge page under the top bar', () => {
  it('is in the flow, not a fixed overlay, and hides (does not unmount) the workspace', () => {
    const rule = /\.merge-page\s*\{([^}]*)\}/.exec(CSS)?.[1] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/position:\s*fixed/);
    expect(APP).toContain("workspace${mergeRoute.open ? ' merge-hidden' : ''}");
    expect(APP).toContain("uiMode === 'guided' && !mergeRoute.open && (");
  });

  it('heads with what it gives and where it goes; the version is a tooltip, not a title', () => {
    expect(MERGE).toContain('<h2 title={NF_MERGE_V2_VERSION}>');
    expect(MERGE).not.toMatch(/<span className="derived">\{NF_MERGE_V2_VERSION\}/);
    expect(MERGE).toContain("t('The result goes to the open project: {w}.'");
  });

  it('step 3: the three window buttons are ONE choice — the one in use is pressed and ticked, the primary colour only while nothing is chosen (UI-10 nazorg)', () => {
    // Sander, 22-11-2026: "als ik Take over Proposal klik, dan blijft ie blauw. alsof ik er nog een keer op kan klikken".
    const i = MERGE.indexOf("const cls = (on: boolean, primary: boolean) => `nfm-choice${on ? ' is-on' : ''}${primary ? ' nfm-primary' : ''}`;");
    expect(i).toBeGreaterThan(0);
    const group = MERGE.slice(i, MERGE.indexOf('})()}', i));
    expect(group).toMatch(/<p role="group" aria-label=\{t\('which window'\)\}>/);
    expect(group).toMatch(/className=\{cls\(mode === 'proposal', mode === ''\)\} aria-pressed=\{mode === 'proposal'\}/);
    expect(group).toMatch(/className=\{cls\(mode === 'header', false\)\} aria-pressed=\{mode === 'header'\}/);
    expect(group).toMatch(/className=\{cls\(mode === 'self', false\)\} aria-pressed=\{mode === 'self'\}/);
    expect((group.match(/\? '✓ ' : ''/g) ?? []).length).toBe(3);
    expect(MERGE).not.toMatch(/className="nfm-primary" disabled=\{!pr \|\| !f0\}/); // the old always-blue button
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.nfm-choice\[aria-pressed='true'\] \{/);
  });
  it('the design wizard does not open itself over the merge page (UI-10 fase 2c)', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const openWizardForEmpty = \(\) => \{\s*if \(!localStorage\.getItem\('ads-welcomed'\)\) return;\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(location\.hash\.startsWith\('#\/merge'\)\) return;/);
  });
  it('the empty page shows the route, one line per guide step — since UI-9 below "What you need" and the example button', () => {
    const i = MERGE.indexOf('className="nfm-landing"');
    expect(i).toBeGreaterThan(0);
    // UI-9 — V15: WAS "within 800 characters of the intro's opening" (the route came first); IS after the
    // checklist and the example session (Sander, 22-11-2026: what the tool needs comes before how it works).
    // UI-10: the intro became the landing page (`nfm-landing`); the claim is unchanged.
    const intro = MERGE.slice(i, MERGE.indexOf('nfm-foot', i));
    expect(intro).toContain('GUIDE_STEPS.map');
    // UI-10 nazorg — V15: WAS "What you need" before a route list; IS the route as the STEP BAR of the
    // session view, step 1 active (Sander, 22-11-2026: the upload is step 1), with the table and the drop
    // zone as step 1's body — the table FIRST (Sander, same day: "begin deze pagina eerst met wat we nodig
    // hebben en waarom, niet eerst met uploaden").
    expect(intro.indexOf('<ol className="nfm-steps"')).toBeLessThan(intro.indexOf("t('What you need')"));
    expect(intro.indexOf("t('What you need')")).toBeLessThan(intro.indexOf('className="nfm-start"'));
    expect(intro).not.toContain("t('How it works')}</h3>");
  });
});
