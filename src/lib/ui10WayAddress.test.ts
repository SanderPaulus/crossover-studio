/**
 * UI-10 fase 2 — the project's WAY is an ADDRESS, not a merge input (Sander, 22-11-2026: "we hebben dit alleen
 * nodig als we de merge willen overnemen naar de optimizer, dus pas bij de export fase"). Until then the merge
 * tool asked "which driver of the design each one is" in step 1 and refused to approve without an answer —
 * a dependency on the optimizer that a merge-only visitor cannot answer and does not need. What the merge
 * reads is S_d, the enclosure and the height PER DRIVER; the way only finds them in "Your cabinet" (proposed
 * from the file name, never asked) and addresses "Use in project" (asked in step 5, the one place).
 *
 * Source scans (the UI-1 idiom): a unit test cannot see which step asks a question or what a panel refuses on.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stableKey } from '../components/NfMergeTool.tsx';

const SRC = readFileSync(new URL('../components/NfMergeTool.tsx', import.meta.url), 'utf8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('UI-10 fase 2 — the way is asked once, in step 5, and the merge never needs it', () => {
  it('step 1 no longer asks which driver of the design each file is, and confirming the roles writes no way', () => {
    expect(code).not.toContain("t('Which driver of the design each one is')");
    expect(code).not.toContain('nfm-wayprops');
    expect(code).not.toContain("t('which driver (step 1)')");
    const confirm = code.slice(code.indexOf('const confirmRoles = () =>'), code.indexOf('const [setups, setSetups]'));
    expect(confirm).not.toMatch(/proposeWay|way:/);
    expect(confirm).toContain('return { ...s, roles, rolesConfirmed: true };');
  });
  it('the way is RESOLVED, not stored: stated in step 5, else proposed from the name; the merge reads S_d, placement and enclosure through it', () => {
    expect(code).toContain("const wayOf = (stem: string): MergeWay | '' => cfg[stem]?.way || proposeWay(stem)?.way || '';");
    expect(code).toContain("const memberOf = (stem: string): SourceConfig['member'] => cfg[stem]?.member || proposeWay(stem)?.member || '';");
    expect(code).toMatch(/const sdOf = \(stem: string\): number \| null => \{\s*const w = wayOf\(stem\);\s*return \(w \? props\.sdCm2\[w\] : null\) \?\? num\(cfg\[stem\]\?\.sdCm2 \?\? ''\);/);
    // a driver whose name proposes no way (or whose way has no position in the project) is placed by its own height
    expect(code).toMatch(/if \(w && props\.geometry\.drivers\[w\]\.yMm !== null\) return \{ kind: 'cabinet', way: w, member: memberOf\(stem\) \|\| null \};\s*return \{ kind: 'own', aboveBottomMm: num\(c\.ownHeight\) \};/);
    expect(code).not.toMatch(/sdOf\(c\)|placementOf\(c\)|heightAboveFloor\(c\)|heightAboveFloor\(cfg\[/);
  });
  it('step 2 asks the facts per DRIVER, writing through to "Your cabinet" where the name proposes a way and keeping them in the session where it does not', () => {
    const block = code.slice(code.indexOf("t('Your cabinet — what the merge needs')"), code.indexOf("t('Optional')", code.indexOf("t('Your cabinet — what the merge needs')")));
    // UI-11 — V15: WAS every source of the session, the far-field-only tweeter included; IS the ways that MERGE —
    // a far-field-only way is gated and exported as it is and the tool reads no cabinet fact of it (Sander, 23-11-2026).
    expect(block).toMatch(/\{drivers\.map\(\(d\) => \{\s*const w = wayOf\(d\.stem\);/);
    expect(block).not.toMatch(/\[\.\.\.drivers, \.\.\.farOnly\]\.map/);
    expect(block).toContain("t('{list}: far field only — nothing to merge, so nothing about the cabinet to ask here.'");
    expect(block).not.toMatch(/\(\['low', 'mid', 'high'\] as MergeWay\[\]\)/); // no longer one row per way
    /* UI-11 — V15: WAS one `onCommit` that branched on the way (`w ? props.onSd(w, v) : setC(...)`) and a height
       field that converted above-bottom to y; IS two branches of ONE map: with a way the project's own driver
       fields (the `CabinetForm` components, S_d through `props.onSd(w, v)`), without one the session's two facts. */
    expect(block).toMatch(/const hOwn = ownGeometry \|\| !w;/);
    expect(block).toMatch(/if \(!hOwn\) \{\s*const pd = props\.cabinet\.drivers\[w\];/);
    expect(block).toContain("onChange={(v) => props.onSd(w, v)}");
    expect(block).toContain("onCommit={(v) => setC(d.stem, { sdCm2: v })}");
    expect(block).toContain("onCommit={(v) => setC(d.stem, { ownHeight: v })}");
    expect(block).toContain("t('Kept in this session: the file name does not say which driver of the design this is. ')");
    expect(block).not.toMatch(/<select value=\{c\.way\}|value=\{cfg\[[a-z.]+\]\.way\}/); // no way select in step 2 either
  });
  it('approval and the fingerprint do not depend on the way; "Use in project" reads it live', () => {
    expect(code).toMatch(/const acceptFar = [\s\S]{0,400}if \(!session \|\| comp\.error !== null \|\| !src\.far \|\| !vf\) return;/);
    expect(code).toMatch(/const accept = [\s\S]{0,400}if \(!session \|\| !comp\.result \|\| !comp\.input \|\| !vf\) return;/);
    expect(code).not.toMatch(/\|\| !c\.way \|\|/);
    expect(code).toMatch(/return stableKey\(\{ kernel: NF_MERGE_V2_VERSION, c: c \? \{ \.\.\.c, way: '' \} : c, port:/);
    // the same config with a different way is the same key — choosing the address in step 5 is not a change
    const a = { kernel: 'k', c: { way: '', winMode: 'proposal', validFrom: '60' } };
    const b = { kernel: 'k', c: { way: 'mid', winMode: 'proposal', validFrom: '60' } };
    expect(stableKey({ ...a, c: { ...a.c, way: '' } })).toBe(stableKey({ ...b, c: { ...b.c, way: '' } }));
    expect(stableKey(a)).not.toBe(stableKey(b)); // and without the blanking they would differ — the blanking does the work
    expect(code).toMatch(/const acceptedOf = \(way: MergeWay\): AcceptedSource\[\] =>\s+Object\.entries\(currentAccepted\)\s+\.filter\(\(\[stem\]\) => wayOf\(stem\) === way\)/);
  });
  it('step 5 is the one place that asks: one select per accepted driver, proposed from the name, a choice wins, and an unaddressed merge is said and not handed over', () => {
    expect(code).toMatch(/addresses=\{Object\.keys\(currentAccepted\)\.map\(\(stem\) => \(\{ stem, label: [^}]*way: wayOf\(stem\), proposed: !cfg\[stem\]\?\.way, proposedWay: proposeWay\(stem\)\?\.way \?\? '' \}\)\)\}/);
    expect(code).toContain('onWay={(stem, way) => setC(stem, { way })}');
    const use = code.slice(code.indexOf('function UsePanel(p: {'), code.indexOf('function UseStatusLine'));
    expect(use).toMatch(/<select value=\{a\.proposed \? '' : a\.way\} onChange=\{\(e\) => p\.onWay\(a\.stem, e\.target\.value as MergeWay \| ''\)\}/);
    // the empty option is the proposal, named, where the file name gives one (measured in the browser: "—" read as "none" while it meant "the proposal")
    expect(use).toContain("a.proposedWay ? t('as proposed: {w}', { w: wayLabel(a.proposedWay) }) : '—'");
    expect(use).toContain("a.proposed ? t('proposed from the file name') : t('stated by you')");
    expect(use).toContain("t('{n} accepted merge(s) without a destination: not handed over until you choose one.', { n: unaddressed })");
    expect(use).toMatch(/const ways = \[\.\.\.new Set\(p\.addresses\.map\(\(a\) => a\.way\)\.filter\(\(w\): w is MergeWay => w !== ''\)\)\];/);
    // the panels point at step 5 for the address, not at step 1
    expect((code.match(/\{t\('goes to'\)\}: <strong>\{p\.way \? t\(WAY_LABEL\[p\.way\]\) : t\('not stated'\)\}<\/strong>/g) ?? []).length).toBe(2);
    expect(code).toContain("{back('export', 5)}");
    expect(code).toMatch(/onClick=\{\(\) => p\.onGoto\('export'\)\}>\s*\{t\('change in step \{n\}', \{ n: 5 \}\)\}/);
  });
});
