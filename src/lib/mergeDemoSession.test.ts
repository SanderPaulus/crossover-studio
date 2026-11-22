/**
 * UI-9 — the merge tool for a first-time visitor (Sander's friend, 22-11-2026): drag-and-drop on the
 * merge page, an example session in one press, a checklist of what the tool needs, FRD and impedance
 * named optional, and step 2 with the required part on top. The example session's data is the fixture
 * folder the kernel tests run on, served by URL and never copied; its set-up is READ from the folder's
 * own record. Source scans pin the page (the UI-1 idiom: a unit test cannot say whether the app RENDERS
 * a handler or a button).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERGE_DEMO_FILES, MERGE_DEMO_MIC_CAL, MERGE_DEMO_SESSION_NAME, MERGE_DEMO_SESSION_VERSION, fetchMergeDemoSession, mergeDemoCabinet, mergeDemoSetup } from './mergeDemoSession.ts';
import { loadSession } from './mergeSession.ts';
import { parseMicCal } from './micCal.ts';
import { KOAN_3WAY_DEMO } from '../demo3way.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'test-fixtures', 'casus1_pir');

describe(`mergeDemoSession (${MERGE_DEMO_SESSION_VERSION}) — the example session is the fixture folder, served, not copied`, () => {
  it('every file of the session is a file of test-fixtures/casus1_pir, by name, and no impulse of that folder is left out', () => {
    const pirsOnDisk = readdirSync(FIX).filter((n) => n.endsWith('.pir')).sort();
    expect(MERGE_DEMO_FILES.map((f) => f.name).sort()).toEqual(pirsOnDisk);
    expect(pirsOnDisk).toHaveLength(8);
    for (const f of MERGE_DEMO_FILES) expect(statSync(join(FIX, f.name)).size).toBeGreaterThan(0);
    expect(statSync(join(FIX, MERGE_DEMO_MIC_CAL.name)).size).toBeGreaterThan(0);
    // the URLs come from Vite's ?url import — a path, not file contents, so the bundle serves the bytes on the press
    for (const f of MERGE_DEMO_FILES) expect(f.url).toMatch(/casus1_pir\/.*\.pir$/);
  });
  it('fetched (here: from disk through the same code), the session loads with three drivers, a port and a far-only tweeter, and the .mic parses', async () => {
    const fetchFn = (async (url: string | URL | Request) => {
      const name = String(url).split('/').pop()!.split('?')[0];
      const bytes = readFileSync(join(FIX, name));
      return new Response(bytes);
    }) as typeof fetch;
    const demo = await fetchMergeDemoSession(fetchFn);
    expect(demo.files.map((f) => f.name).sort()).toEqual(MERGE_DEMO_FILES.map((f) => f.name).sort());
    const loaded = loadSession(MERGE_DEMO_SESSION_NAME, demo.files);
    const drivers = loaded.sources.filter((x) => x.kind === 'driver').map((x) => x.stem).sort();
    expect(drivers).toEqual(['mid', 'woofer down', 'woofer up']);
    expect(loaded.sources.some((x) => x.kind === 'port')).toBe(true);
    expect(loaded.sources.some((x) => x.kind === 'far-only' && x.stem === 'tweeter')).toBe(true);
    expect(parseMicCal(demo.cal.name, demo.cal.text).ok).toBe(true);
  });
  it('the set-up is read from opstelling.json: table 500 mm, overhang at most 130, mic 1000 / 1380, planes "don\'t know" — never typed', () => {
    const s = mergeDemoSetup();
    expect(s.rig).toEqual({ bottom: '500', surface: 'table', overhang: '', overhangUnknown: false, overhangMax: '130', micDist: '1000', micHeight: '1380' });
    expect(s.planeQ).toBe('unknown');
    const src = readFileSync(new URL('./mergeDemoSession.ts', import.meta.url), 'utf8');
    for (const lit of ["'500'", "'130'", "'1000'", "'1380'"]) expect(src).not.toContain(lit);
    // a record with an exact overhang yields a measure; one with the planes stated yields "no"
    const exact = mergeDemoSetup(JSON.stringify({ kast_staat_op: 'table', tafelblad_boven_vloer_mm: 500, mic_boven_vloer_mm: 1380, mic_tot_baffle_mm: 1000, tafeloverstek: { exact_mm: 80 }, vlakken: { plafond: 2600 } }));
    expect(exact.rig.overhang).toBe('80');
    expect(exact.rig.overhangMax).toBeUndefined();
    expect(exact.planeQ).toBe('no');
    // a record that lacks a figure throws instead of guessing (B-4)
    expect(() => mergeDemoSetup(JSON.stringify({ kast_staat_op: 'table', mic_boven_vloer_mm: 1380, mic_tot_baffle_mm: 1000 }))).toThrow(/table top above the floor/);
  });
  it('the cabinet offered to an empty project is the demo project\'s, field for field', () => {
    const cab = mergeDemoCabinet();
    expect(cab.patch.baffleWidthMm).toBe(KOAN_3WAY_DEMO.cabinet.baffleWidthMm);
    expect(cab.patch.baffleHeightMm).toBe(KOAN_3WAY_DEMO.cabinet.baffleHeightMm);
    expect(cab.patch.refFromTopMm).toBe(KOAN_3WAY_DEMO.cabinet.refFromTopMm);
    expect(cab.patch.drivers?.low).toEqual({ yMm: '-448.4', count: '2', spacingMm: '275.75' });
    expect(cab.sdCm2).toEqual({ low: '255', mid: '69', high: '5.6' });
  });
});

describe('UI-9 — the merge page for a first-time visitor (source scan on NfMergeTool.tsx)', () => {
  const src = readFileSync(new URL('../components/NfMergeTool.tsx', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('drag-and-drop: the page and its three zones carry drag handlers that preventDefault; a zone stops its drop from also starting a session', () => {
    expect(src).toMatch(/const fileDrop = \(zone: 'page' \| 'session' \| 'cal', onDropped: \(files: File\[\]\) => void\) => \(\{/);
    expect(src).toMatch(/onDragOver: \(e: DragEvent\) => \{\s*if \(!e\.dataTransfer\.types\.includes\('Files'\)\) return;\s*e\.preventDefault\(\);/);
    expect(src).toMatch(/onDrop: \(e: DragEvent\) => \{\s*if \(e\.defaultPrevented\) return;/);
    expect(src).toMatch(/if \(zone !== 'page'\) e\.stopPropagation\(\);/);
    expect(src).toMatch(/<section className=\{`nf-merge-tool\$\{dropArmed === 'page' \? ' drop-armed' : ''\}`\} id="nf-merge-tool" \{\.\.\.fileDrop\('page', \(f\) => void onFiles\(f\)\)\}>/);
    expect(src.match(/\{\.\.\.fileDrop\('session', \(f\) => void onFiles\(f\)\)\}/g)?.length).toBe(2); // the side list's zone and the landing's
    expect(src.match(/\{\.\.\.fileDrop\('cal', \(f\) => void onCalFile\(f\)\)\}/g)?.length).toBe(1);
    expect(src).not.toMatch(/<label className="dropzone[^"]*">/); // no zone left without the handlers
    expect(src).toMatch(/const onFiles = async \(files: FileList \| File\[\] \| null\)/);
  });
  it('the example session: one press, an already-loaded copy is opened, the set-up and the calibration land with it, an empty cabinet gets the demo\'s', () => {
    expect(src).toMatch(/onClick=\{\(\) => void loadDemoSession\(\)\}/);
    expect(src).toMatch(/const existing = sessions\.find\(\(x\) => x\.name === MERGE_DEMO_SESSION_NAME\);\s*if \(existing\) \{\s*props\.onOpenId\(existing\.id\);\s*return;/);
    expect(src).toMatch(/rig: \{ \.\.\.base\.rig, \.\.\.setup\.rig \},\s*planeQ: setup\.planeQ,/);
    expect(src).toMatch(/await saveMicCal\(\{ id: calId, \.\.\.r\.cal \}\);/);
    expect(src).toMatch(/if \(props\.geometry\.baffleWidthMm === null && props\.geometry\.baffleHeightMm === null\) \{\s*const cab = mergeDemoCabinet\(\);\s*props\.onCabinet\(cab\.patch\);/);
    expect(src).toMatch(/import\('\.\.\/lib\/mergeDemoSession\.ts'\)|from '\.\.\/lib\/mergeDemoSession\.ts'/);
  });
  it('the landing takes one column on a wide screen: its grid rule outranks `.nfm-layout` by specificity AND order (nazorg: it sat before it and lost)', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const layout = css.indexOf('.nfm-layout { display: grid; grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);');
    const landing = css.indexOf('.nfm-layout.nfm-layout-landing { grid-template-columns: minmax(0, 1fr); }');
    expect(layout).toBeGreaterThan(0);
    expect(landing).toBeGreaterThan(layout);
    expect(css).not.toMatch(/^\.nfm-layout-landing \{/m); // the single-class form that lost
    expect(css).not.toContain('.nfm-needs-table td:first-child { white-space: nowrap; }'); // the What column wraps; only the pill column is tight
  });
  it('the responsive audit of 22-11-2026: no grid track or select wider than its container, and the charts never stand beside the panel in a sliver', () => {
    // Measured at 375 / 768 / 1050 / 1280 / 1800 px on the landing and steps 1–5 before the push (Sander:
    // "het ontwerp is adaptive, dat moet goed getest zijn"). Three defects, each a CSS rule and nothing else:
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // (1) step 4 on a phone: a bare `minmax(28rem, 1fr)` forced a 448 px chart track into a 327 px column.
    expect(css).toContain('.nfm-charts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(28rem, 100%), 1fr));');
    expect(css).toContain('.nfm-before-after-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr));');
    expect(css).not.toMatch(/\.nfm-(charts|before-after-pair) \{[^}]*minmax\(2[48]rem, 1fr\)/);
    // (2) step 4 at 1050 px: the body stacked only under 1000 px, leaving 266 px for an SPL chart beside the 26 rem panel.
    expect(css).toContain('@media (max-width: 1200px) { .nfm-body { grid-template-columns: minmax(0, 1fr); } }');
    expect(css).not.toContain('@media (max-width: 1000px) { .nfm-body');
    // (3) step 5 on a phone: the Grid select (54-character options) ran 53 px past the page.
    expect(css).toContain('.nf-merge-tool select { max-width: 100%; }');
    // The phone fixes of the landing from the same audit: the needs table stacks and the aside moves below the main column.
    expect(css).toMatch(/\.nfm-sessions \{ position: static; order: 2; \}/);
  });
  it('the landing page is step 1 of the step bar: the four-row "What you need" TABLE first, then one start card (drop zone + example), and only then earlier sessions and calibration', () => {
    // UI-10 — V15: WAS a prose checklist above a second zone with the sessions aside and the calibration
    // zone above it all (Sander, 22-11-2026: "eerst die lange zin en dan onder de calibratie bestand van
    // de mic de uitleg"); IS one column in reading order, and the aside renders only with a session open.
    const landing = src.slice(src.indexOf('<div className="nfm-landing">'), src.indexOf('<p className="derived nfm-foot">'));
    // UI-10 nazorg (Sander: "how it works staat onder de upload section" — "denk er eens goed over na"):
    // the upload IS step 1. The landing shows the session view's own step bar with step 1 active and 2–5
    // to come, and step 1's body holds the table, the drop zone and the example. No separate route.
    // V15 (Sander, 22-11-2026: "begin deze pagina eerst met wat we nodig hebben en waarom, niet eerst met
    // uploaden"): WAS start card then table; IS the table FIRST, then the start card.
    const order = ['<ol className="nfm-steps"', 'GUIDE_STEPS.map', '<div className="nfm-stepbody">', "t('Files')", 'className="nfm-needs"', '<table className="nfm-needs-table">', 'className="nfm-start"', "t('Load the example session →')", 'className="nfm-earlier"', 'className="nfm-cal-landing"'].map((k) => landing.indexOf(k));
    expect(landing).not.toContain('className="nfm-how"');
    expect(landing).toMatch(/disabled=\{i !== 0\} aria-current=\{i === 0 \? 'step' : undefined\} title=\{t\(STEP_HINT\[k\]\)\}/); // steps 2–5 greyed, each with its hint
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual(order.slice().sort((a, b) => a - b));
    expect((landing.match(/<tr>/g) ?? []).length).toBe(5); // the header row and four rows: .pir, .frd/.txt or .mic, .zma/.lim, cabinet and set-up
    expect(landing).toMatch(/nfm-need-required.*required.*nfm-need-export.*for export.*nfm-need-optional.*optional.*nfm-need-required/s);
    expect(landing).not.toMatch(/\.derived[^<]*\{t\('[^']{120,}'\)\}/); // no explanatory paragraph over 120 characters: the table says it
    expect(src).toMatch(/\{session && \(\s*<aside className="nfm-sessions">/); // the side list only with a session open
    expect(src).not.toContain('nfm-filetypes'); // the long one-liner is gone
    expect(src.match(/\{sessionList\}/g)?.length).toBe(2); // one list element, two places
    expect(src.match(/\{calZone\}/g)?.length).toBe(2);
    expect(src.match(/\{calList\}/g)?.length).toBe(2);
  });
  it('without an FRD header the proposal is the window in use as soon as it lands — applied by the tool, said in the readout; a header or a chosen window is never touched', () => {
    const eff = src.slice(src.indexOf("if (!c || c.winMode || !d.far || !d.near) continue;") - 200, src.indexOf("const takeOver = (stem: string, pr: WindowProposal, auto = false) =>"));
    expect(eff).toMatch(/if \(!c \|\| c\.winMode \|\| !d\.far \|\| !d\.near\) continue;/); // a chosen window stays
    expect(eff).toMatch(/if \(!\('error' in gateOf\(d\.far\)\)\) continue;/); // a header wins
    expect(eff).toMatch(/if \(pr && 'gate' in pr\) takeOver\(d\.stem, pr, true\);/);
    expect(src).toMatch(/winMode: 'proposal',\s*winAuto: auto,/);
    expect(src).toMatch(/c\.winAuto \? t\('the proposal, applied by the tool \(no FRD window header\) — change it here'\)/);
    expect(src.match(/takeOver\([^)]*, true\)/g)?.length).toBe(1); // the effect is the only automatic caller
  });
  it('step 2: an earlier set-up is offered FIRST and only when there is one; then the four measures and the question, the cabinet block, and the rest under "Optional"', () => {
    const h3 = src.indexOf("t('How was the measurement set up?')");
    const required = src.indexOf("t('Required: the four measures and one question, once per set-up. The tool keeps them.')");
    // UI-10 fase 2b — V15: WAS "Earlier set-up" under "Optional", after everything was typed (Sander, 22-11-2026:
    // "als er wel een eerdere setup was hoort deze vraag dan niet bovenaan"); IS right after the heading, behind
    // `setups.length > 0` — a choice out of nothing is no choice.
    const earlier = src.indexOf("t('Use an earlier set-up')");
    const planes = src.indexOf("t('Is there anything inside the blue circles?')");
    const cabinet = src.indexOf("t('Your cabinet — what the merge needs')");
    const optional = src.indexOf('<h4 className="nfm-optional-head">');
    // UI-10 fase 2d — V15: the "Measured object" card is gone (Sander: "ik wil mergen met wat we hebben"); the
    // provenance line and the own-front choice live in the cabinet block, so "Optional" is the last anchor.
    const keep = src.indexOf("t('Keep this set-up')");
    expect(h3).toBeGreaterThan(0);
    expect([h3, required, earlier, planes, cabinet, optional, keep]).toEqual([h3, required, earlier, planes, cabinet, optional, keep].slice().sort((a, b) => a - b));
    expect(src).not.toContain("t('Measured object')");
    expect(src.slice(earlier - 120, earlier)).toMatch(/\{setups\.length > 0 && \(\s*<p className="nfm-earlier-setup">/);
    expect(src).not.toContain("t('Earlier set-up')");
    expect(src.match(/onChange=\{\(e\) => loadSetup\(e\.target\.value\)\}/g)?.length).toBe(1); // one select, one place
    expect(src).not.toContain("t('Four measures, once per set-up. The tool keeps them.')");
  });
});
