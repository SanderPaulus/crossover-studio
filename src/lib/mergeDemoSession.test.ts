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
    expect(src.match(/\{\.\.\.fileDrop\('session', \(f\) => void onFiles\(f\)\)\}/g)?.length).toBe(2); // the sessions aside and the intro zone
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
  it('the empty page opens with "What you need" — required, for the level, optional — and names FRD and impedances optional on every zone', () => {
    const needs = src.indexOf("t('What you need')");
    expect(needs).toBeGreaterThan(0);
    expect(needs).toBeLessThan(src.indexOf("t('How it works')"));
    expect(src).toMatch(/<strong>\{t\('Required'\)\}<\/strong>/);
    expect(src).toMatch(/<strong>\{t\('For the level'\)\}<\/strong>/);
    expect(src).toMatch(/<strong>\{t\('Optional'\)\}<\/strong>/);
    expect(src.match(/t\('\.pir impulses \(required\) · their \.frd\/\.txt exports and \.zma\/\.lim impedances \(optional\)'\)/g)?.length).toBe(2);
    expect(src).not.toContain("t('.pir + their .frd/.txt exports + .zma/.lim')");
    // UI-9 nazorg: one line under the New-session zone on WHY each file type (Sander, 22-11-2026)
    const aside = src.slice(src.indexOf('<aside className="nfm-sessions">'), src.indexOf('</aside>'));
    expect(aside).toMatch(/<p className="derived nfm-filetypes">\{t\('Per driver: \.pir — the impulse, near and far field: the window, the timing and the reflections \(required\) · \.frd\/\.txt — the SPL export: the level and the mic calibration \(or one \.mic file\) · \.zma\/\.lim — the impedance, handed on to the project\.'\)\}<\/p>/);
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
  it('step 2: the four measures and the question come first, the cabinet block after them, and the rest under "Optional"', () => {
    const h3 = src.indexOf("t('How was the measurement set up?')");
    const required = src.indexOf("t('Required: the four measures and one question, once per set-up. The tool keeps them.')");
    const planes = src.indexOf("t('Is there anything inside the blue circles?')");
    const cabinet = src.indexOf("t('Your cabinet — what the merge needs')");
    const optional = src.indexOf('<h4 className="nfm-optional-head">');
    const earlier = src.indexOf("t('Earlier set-up')");
    const measured = src.indexOf("t('Measured object')");
    expect(h3).toBeGreaterThan(0);
    expect([h3, required, planes, cabinet, optional, earlier, measured]).toEqual([h3, required, planes, cabinet, optional, earlier, measured].slice().sort((a, b) => a - b));
    expect(src).not.toContain("t('Four measures, once per set-up. The tool keeps them.')");
  });
});
