/**
 * I-4 level + far-only (Sander, 14-11-2026: "de merges lijken niet overgenomen te worden").
 *
 * Measured first: the route landed the files, but PIR + .mic merges sit on the impulses' own scale
 * (~0 dB over 200–1000 Hz) while an ARTA export of the same driver sits at ~128–134 dB — the sum read
 * max 135 / min −64 dB. Three claims close it: (1) the session's FAR-field exports carry the level
 * when no near-field export does; (2) a far-only way is handed over through the same gate, reference
 * and calibration as the merges beside it; (3) "Use in project" refuses a relative merge beside an
 * absolute branch, naming both. Every refusal is a reason; nothing is scaled silently.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gateOf, impulseOfItem, interpLog, loadSession } from './mergeSession.ts';
import { gatedFarSpectrum, mergeImpulsesV2 } from './nfMergeV2.ts';
import { FAR_ONLY_VERSION, parseFarOnlyBlock, renderFarOnlyFrd } from './farOnly.ts';
import { isUncalibrated } from './mergeExport.ts';
import { isLevelRelative, levelConflict, prepareBranchUse } from './useInProject.ts';
import { readGateHeader, readMergeBlock } from './xoWindow.ts';
import { parseFrd } from './parsers/frd.ts';
import { chooseCalibration, parseMicCal, type MicCal } from './micCal.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const read = (d: string, n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(FIX, d, n))) });
const pirs = readdirSync(join(FIX, 'casus1_pir')).filter((n) => n.endsWith('.pir')).map((n) => read('casus1_pir', n));
const nearTxt = ['mid_near.txt', 'woofer_down_near.txt', 'woofer_up_near.txt'].map((n) => read('casus1', n));
const farTxt = ['mid_hor_0.txt', 'woofer_down_hor_0.txt', 'woofer_up_hor_0.txt', 'tweeter_hor_0.txt'].map((n) => read('casus1', n));
const withNear = loadSession('augustus', [...pirs, ...nearTxt, ...farTxt]);
const farExportsOnly = loadSession('augustus', [...pirs, ...farTxt]);
const pirOnly = loadSession('augustus', pirs);
const parsed = parseMicCal('MM1CDU_allein_00d.mic', readFileSync(join(FIX, 'casus1_pir', 'MM1CDU_allein_00d.mic'), 'latin1'));
if (!parsed.ok) throw new Error(parsed.reason);
const mic: MicCal = { id: 'mm1', ...parsed.cal };
const src = (rel: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), rel), 'utf8');

describe('I-4 level — the far-field exports carry the level when no near-field export does', () => {
  it('casus 1: with the near-field exports gone, the calibration comes from the far fields and says so', () => {
    expect(withNear.calibration?.note).toMatch(/near-field FRD exports/);
    const far = farExportsOnly.calibration;
    expect(far).not.toBeNull();
    expect(far!.note).toMatch(/far-field FRD exports.*the far fields carry the level/);
    expect(pirOnly.calibration).toBeNull();
  });
  it('the level the far fields give is the level the near fields give: the same ARTA calibration (within 0.5 dB at 1 kHz, shape within 0.1 dB over the band)', () => {
    const a = withNear.calibration!;
    const b = farExportsOnly.calibration!;
    const at = (c: { freq: number[]; db: number[] }, f: number) => interpLog(c.freq, c.db, f);
    expect(Math.abs(at(a, 1000) - at(b, 1000))).toBeLessThan(0.5);
    let maxShape = 0;
    for (const f of [300, 500, 1000, 2000, 5000, 10000]) maxShape = Math.max(maxShape, Math.abs(at(a, f) - at(a, 1000) - (at(b, f) - at(b, 1000))));
    expect(maxShape).toBeLessThan(0.1);
    // The level is real: ~130 dB above the impulses' own scale (the figure the session measured).
    expect(at(b, 1000)).toBeGreaterThan(100);
  });
  it('with far-field exports the derived curve is applied and the microphone file becomes the check — no longer LEVEL RELATIVE', () => {
    const c = chooseCalibration(farExportsOnly.calibration, mic);
    expect(c.kind).toBe('derived');
    if (c.kind === 'derived') {
      expect(c.note).toMatch(/the derived curve is applied/);
      expect(c.note).not.toMatch(/LEVEL RELATIVE/);
      expect(c.check!.maxDb).toBeLessThan(0.05);
    }
  });
});

describe('I-4 far-only — the far field alone through its gate', () => {
  const mid = withNear.sources.find((s) => s.stem === 'mid')!;
  const tweeter = withNear.sources.find((s) => s.stem === 'tweeter')!;
  it('casus 1 has a far-only tweeter with a gate from its export header, on the PIR route', () => {
    expect(tweeter.kind).toBe('far-only');
    const g = gateOf(tweeter.far!);
    expect('error' in g).toBe(false);
    if (!('error' in g)) expect(g.route).toBe('pir');
  });
  it('is the farGatedDb half a merge of the same far field would report (no echoes modelled): within 0.1 dB and 1° from 300 Hz up', () => {
    const g = gateOf(mid.far!);
    if ('error' in g) throw new Error(g.error);
    const far = impulseOfItem(mid.far!, withNear.name, false);
    const near = impulseOfItem(mid.near!, withNear.name, false);
    const output = { fromHz: 20, toHz: Math.min(20000, far.sampleRate / 2.2), pointsPerOctave: 48 };
    const alone = gatedFarSpectrum({ far, gate: g.gate, output });
    const merged = mergeImpulsesV2({ far, near, port: null, gate: g.gate, model: { kind: 'an4', f0Hz: 131 }, echoes: [], sdCm2: 69, fitBandHz: [700, 1200], spliceBandHz: [900, 1200], output });
    expect(alone.freq).toEqual(merged.freq);
    let maxDb = 0;
    let maxDeg = 0;
    for (let i = 0; i < alone.freq.length; i++) {
      if (alone.freq[i] < 300) continue;
      maxDb = Math.max(maxDb, Math.abs(alone.spl[i] - merged.farGatedDb[i]));
      const d = Math.abs((((alone.phaseDeg[i] - merged.farGatedPhaseDeg[i]) % 360) + 540) % 360 - 180);
      maxDeg = Math.max(maxDeg, d);
    }
    expect(maxDb).toBeLessThan(0.1);
    expect(maxDeg).toBeLessThan(1);
  });
  it('the file: a gate header both readers read as gated, NO merge block, a Valid from, a calibration line; it parses back as a response', () => {
    const g = gateOf(tweeter.far!);
    if ('error' in g) throw new Error(g.error);
    const far = impulseOfItem(tweeter.far!, withNear.name, false);
    const spec = gatedFarSpectrum({ far, gate: g.gate, output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 } });
    const text = renderFarOnlyFrd({ label: 'tweeter', farName: tweeter.far!.name, gate: g.gate, route: g.route, spec, validFromHz: 400, validFromReason: 'the gate', calibrationNote: 'microphone file x: its response removed; LEVEL RELATIVE — the impulses own scale', madeOn: '2026-11-14', session: 'augustus', timeBaseShared: true });
    const gate = readGateHeader(text);
    expect(gate.kind).toBe('parsed');
    if (gate.kind === 'parsed') expect(gate.gateMs).toBeCloseTo(g.gate.rightMs, 3);
    expect(readMergeBlock(text)).toBeNull();
    const back = parseFrd(text);
    expect(back.freq.length).toBe(spec.freq.length);
    expect(back.spl[100]).toBeCloseTo(spec.spl[100], 3);
    const blk = parseFarOnlyBlock(text)!;
    expect(blk).toMatchObject({ version: FAR_ONLY_VERSION, validFromHz: 400 });
    expect(blk.oneOverTHz).toBeCloseTo(1000 / g.gate.rightMs, 1);
    expect(isUncalibrated(text)).toBe(false);
    expect(isLevelRelative(text)).toBe(true);
    expect(isUncalibrated(renderFarOnlyFrd({ label: 'tweeter', farName: 'x', gate: g.gate, route: 'pir', spec, validFromHz: 400, validFromReason: 'x', calibrationNote: null, madeOn: 'd', session: 's', timeBaseShared: false }))).toBe(true);
    // "Use in project" takes it for the branch the designer named.
    const prep = prepareBranchUse('high', [{ name: 'tweeter_far_gated.frd', text }]);
    expect(prep.ok).toBe(true);
  });
});

describe('I-4 level — "Use in project" refuses a relative merge beside an absolute branch, naming both', () => {
  const dir = join(FIX, 'koan_2026-11_merge_v2');
  const abs = { name: 'mid_merged_v2.frd', text: readFileSync(join(dir, 'mid_merged_v2.frd'), 'utf8') };
  const rel = { name: 'mid_rel.frd', text: abs.text.replace(/^\*\s*Merge calibration\s*=.*$/m, '* Merge calibration = microphone file m.mic: its response removed in magnitude; LEVEL RELATIVE — the impulses own scale') };
  it('the fixture merge is absolute; the rewritten one reads as relative', () => {
    expect(isLevelRelative(abs.text)).toBe(false);
    expect(isLevelRelative(rel.text)).toBe(true);
  });
  it('relative beside an absolute branch: refused, both named, with the way out; absolute beside relative: the mirror', () => {
    const r1 = levelConflict('mid', [rel], [{ way: 'high', name: 'tweeter-hor0.txt', text: '* ARTA export\n1000 90 0\n' }]);
    expect(r1).toMatch(/mid_rel\.frd is on a RELATIVE level.*high branch \(tweeter-hor0\.txt\) is on an absolute level.*FRD exports \(near or far field\)/);
    const r2 = levelConflict('high', [abs], [{ way: 'low', name: 'low_rel.frd', text: rel.text }]);
    expect(r2).toMatch(/absolute level while the project's low branch \(low_rel\.frd\) is on a RELATIVE level/);
    const prep = prepareBranchUse('mid', [rel], [{ way: 'high', name: 'tweeter-hor0.txt', text: '* x\n1000 90 0\n' }]);
    expect(prep.ok).toBe(false);
    if (!prep.ok) expect(prep.reason).toMatch(/^level: /);
  });
  it('one scale is fine: relative beside relative, absolute beside absolute, nothing beside an empty project; the same way never constrains itself', () => {
    expect(levelConflict('mid', [rel], [{ way: 'low', name: 'l', text: rel.text }])).toBeNull();
    expect(levelConflict('mid', [abs], [{ way: 'low', name: 'l', text: abs.text }])).toBeNull();
    expect(levelConflict('mid', [rel], [])).toBeNull();
    expect(levelConflict('mid', [rel], [{ way: 'mid', name: 'old', text: abs.text }])).toBeNull();
    expect(prepareBranchUse('mid', [abs], [{ way: 'low', name: 'l', text: abs.text }]).ok).toBe(true);
  });
  it('a branch summed from merges on two scales is refused before any neighbour is looked at', () => {
    expect(levelConflict('low', [abs, rel], [])).toMatch(/not on one level.*mid_rel\.frd LEVEL RELATIVE/);
  });
});

describe('I-4 far-only — the tool and the app (source scans)', () => {
  const tool = src('../components/NfMergeTool.tsx');
  const app = src('../App.tsx');
  it('a far-only way gets its driver in step 1, a tab in steps 3 and 4, its own panel, and an accept that hands a gated file over', () => {
    // UI-10 fase 2 — V15: WAS "confirmRoles proposes a way for it" (`for (const d of [...drivers, ...farOnly])`);
    // IS: the way is read live from the name (`wayOf`) and the far-only driver has its address in step 5.
    // UI-11 — V15: WAS also "its row in step 2"; IS no row there — a far-only way merges nothing and the tool reads
    // no cabinet fact of it, so step 2 names it in one line instead (Sander, 23-11-2026: the tweeter needs no merge).
    expect(tool).toMatch(/\{drivers\.map\(\(d\) => \{\s*const w = wayOf\(d\.stem\);/); // the step-2 row, merging ways only
    expect(tool).toContain("t('{list}: far field only — nothing to merge, so nothing about the cabinet to ask here.'");
    expect(tool).toMatch(/way=\{wayOf\(activeFar\.stem\)\}/);
    expect(tool).toMatch(/\{\[\.\.\.drivers, \.\.\.farOnly\]\.map\(\(d\) => \{/); // the tabs
    expect(tool).toMatch(/\(step === 'window' \|\| step === 'merge'\) && activeFar && \(\s*<FarOnlyPanel/);
    expect(tool).toMatch(/renderFarOnlyFrd\(\{/);
    expect(tool).toMatch(/status: 'unchecked', way: wayOf\(src\.stem\)/); // UI-10 fase 2: the resolved way, '' allowed
    expect(tool).not.toMatch(/far field only, no merge needed/);
    // the same calibration as the merges: derived first, else the file, else none — read from the one choice
    const far = tool.slice(tool.indexOf('const farComputed = useMemo'), tool.indexOf('const acceptFar ='));
    expect(far).toMatch(/calChoice\.kind === 'derived'/);
    expect(far).toMatch(/calChoice\.kind === 'file'/);
    expect(far).toMatch(/gatedFarSpectrum\(/);
  });
  it('the app hands "Use in project" the other branches, and the card says when a file is on a relative level', () => {
    expect(app).toMatch(/prepareBranchUse\(role, sources, others\)/);
    expect(app).toMatch(/mergeV2\[role\]\.some\(\(a\) => isLevelRelative\(a\.text\)\)/);
  });
});
