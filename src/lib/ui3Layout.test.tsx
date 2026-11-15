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

  it('the empty page shows the route, one line per guide step', () => {
    const i = MERGE.indexOf('className="nfm-intro"');
    expect(i).toBeGreaterThan(0);
    expect(MERGE.slice(i, i + 800)).toContain('GUIDE_STEPS.map');
  });
});
