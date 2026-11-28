/**
 * UI-12 — one near field for a pair (26-11-2026). Sander's friend: two side-mounted woofers, one far
 * field at 0° with both playing, one near field of ONE of them — "in the merger I should be able to
 * say that". The merge was already right for that set (the splice fits the level) and said so
 * nowhere; what it did not ask is whether the other woofer was driven during the near field (M-2:
 * 15.8 dB at f_b). Claims: the fact as a pure function, the header line round-trips, the port weight
 * proposal is Keele's g/N through the ONE function that knows it, and the tool wires all three.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIR_NEAR_FIELD_VERSION, pairNearFieldFact } from './pairNearField.ts';
import { portWeight } from './nfMerge.ts';
import { parsePir } from './parsers/pir.ts';
import { arrivalMs, impulseFromPir, mergeImpulsesV2, type MergeV2Input } from './nfMergeV2.ts';
import { parseMergeBlockV2, renderMergeBlockV2, type MergeV2FileInput } from './nfMergeV2Block.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe(`one near field for a pair (${PAIR_NEAR_FIELD_VERSION})`, () => {
  it('says nothing below two drivers, with the count unstated, or with a file per member — and speaks for a pair with fewer files', () => {
    expect(pairNearFieldFact({ count: null, files: 1, driven: '', gainDb: null })).toBeNull();
    expect(pairNearFieldFact({ count: 1, files: 1, driven: '', gainDb: null })).toBeNull();
    // casus 1: woofer up and woofer down, each with its own near field — two ordinary merges.
    expect(pairNearFieldFact({ count: 2, files: 2, driven: '', gainDb: null })).toBeNull();
    const f = pairNearFieldFact({ count: 2, files: 1, driven: '', gainDb: null })!;
    expect(f.statement).toMatch(/one of 2 identical drivers/);
    expect(f.statement).toMatch(/splice fits the level/);
    expect(f.header).toMatch(/driven state during the near field: not stated$/); // P4: unanswered is not a guess
    expect(f.warning).toBeNull();
    const three = pairNearFieldFact({ count: 3, files: 2, driven: 'all', gainDb: 9.54 })!;
    expect(three.statement).toMatch(/one of 3 identical drivers/);
    expect(three.statement).toMatch(/\(\+9\.5 dB on this merge\)/);
    expect(three.header).toMatch(/all 3 driven during the near field: yes$/);
    expect(three.warning).toBeNull();
  });

  it('the one state the level fit cannot repair warns, with the M-2 figure, and never corrects', () => {
    const f = pairNearFieldFact({ count: 2, files: 1, driven: 'one', gainDb: -0.3 })!;
    expect(f.warning).toMatch(/other driver was passive/);
    expect(f.warning).toMatch(/15\.8 dB at f_b/);
    expect(f.warning).toMatch(/Not corrected/);
    expect(f.header).toMatch(/NO — one driven, the others passive$/);
    expect(f.statement).toMatch(/\(-0\.3 dB on this merge\)/);
    const four = pairNearFieldFact({ count: 4, files: 1, driven: 'one', gainDb: null })!;
    expect(four.warning).toMatch(/other 3 drivers were passive/);
  });

  it('the header line round-trips, and a merge of one cone alone reads null', () => {
    const FIX = join(ROOT, 'test-fixtures');
    const pir = (name: string) => impulseFromPir(name, parsePir(readFileSync(join(FIX, 'casus1_pir', `${name}.pir`))), 'augustus');
    const far = pir('woofer_down_hor_0');
    const input: MergeV2Input = {
      far,
      near: pir('woofer_down_near'),
      port: null,
      gate: { referenceMs: arrivalMs(far) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
      model: { kind: 'an4', f0Hz: 150 },
      echoes: [],
      sdCm2: 255,
      fitBandHz: [300, 576],
      spliceBandHz: [400, 550],
      output: { fromHz: 20, toHz: 2000, pointsPerOctave: 12 },
    };
    const base: MergeV2FileInput = {
      branchLabel: 'woofer',
      input,
      result: mergeImpulsesV2(input),
      nearName: 'woofer_down_near.pir',
      farName: 'woofer_down_hor_0.pir',
      validFromHz: 20.5,
      validFromReason: 'test',
      referenceNote: 'test',
      madeOn: '2026-11-26',
    };
    const fact = pairNearFieldFact({ count: 2, files: 1, driven: 'all', gainDb: base.result.fit.gainDb })!;
    const withPair = parseMergeBlockV2(renderMergeBlockV2({ ...base, nearFieldStandsForNote: fact.header }).join('\n'))!;
    expect(withPair.nearFieldStandsFor).toBe(fact.header);
    const alone = renderMergeBlockV2(base);
    expect(alone.some((l) => /^\* Merge near field stands for = this cone alone$/.test(l))).toBe(true);
    expect(parseMergeBlockV2(alone.join('\n'))!.nearFieldStandsFor).toBeNull();
  });

  it('the port weight proposal is Keele’s g/N — the one function that knows the share, no default', () => {
    // casus 1's August header: 74 mm mouth, 180.2 mm cone, shared by two → g 0.41, each half → 0.205.
    const r = portWeight({ portDiaMm: 74, coneDiaMm: 180.2, sharedBy: 2 });
    expect(r.weight).not.toBeNull();
    expect(r.weight!).toBeCloseTo(0.205, 2);
    expect(portWeight({ portDiaMm: 74, coneDiaMm: 180.2, sharedBy: 1 }).weight!).toBeCloseTo(0.41, 2);
    expect(portWeight({ portDiaMm: 74, coneDiaMm: 180.2, sharedBy: null }).weight).toBeNull(); // the count is asked, not assumed
    expect(portWeight({ portDiaMm: null, coneDiaMm: 180.2, sharedBy: 2 }).note).toMatch(/mouth diameter/);
  });

  it('the tool wires it: the question in step 2 behind the fact, the note in compute, the header line, and the port weight through the proposal', () => {
    const tool = strip(src('src/components/NfMergeTool.tsx'));
    // Step 2: the row exists only where the fact does (count from the cabinet, files from the session), and asks the one question.
    expect(tool).toMatch(/const pairFactOf = \(stem: string, gainDb: number \| null\) => \{[\s\S]*?count: props\.geometry\.drivers\[w\]\.count,[\s\S]*?files: drivers\.filter\(\(x\) => wayOf\(x\.stem\) === w\)\.length,[\s\S]*?driven: cfg\[stem\]\?\.nearDriven \?\? ''/);
    expect(tool).toMatch(/const pf = pairFactOf\(d\.stem, null\);\s*if \(!pf\) return null;[\s\S]*?setC\(d\.stem, \{ nearDriven: e\.target\.value as PairDriven \}\)/);
    expect((tool.match(/<option value="one">/g) ?? []).length).toBe(1);
    // compute: the header text and, on 'one', the warning become notes of the merge.
    expect(tool).toMatch(/const pf = pairFactOf\(src\.stem, null\);\s*if \(pf\) \{\s*notes\.push\(pf\.header\);\s*if \(pf\.warning\) notes\.push\(`⚠ \$\{pf\.warning\}`\);/);
    // the file header carries it with the gain of THIS merge; step 4 shows the same fact from the parent.
    expect(tool).toMatch(/nearFieldStandsForNote: pairFactOf\(src\.stem, result\.fit\.gainDb\)\?\.header \?\? null/);
    expect(tool).toMatch(/pairFact=\{pairFactOf\(active\.stem, cur\?\.result\?\.fit\.gainDb \?\? null\)\}/);
    // the port weight: compute reads the one resolver (typed wins, else proposed g/N), never num(c.portWeight) alone.
    expect(tool).toMatch(/const pw = portWeightOf\(src\.stem, c\);\s*if \(pw\.weight === null\) return \{ \.\.\.out, error:/);
    expect(tool).toMatch(/portWeight\(\{ portDiaMm: num\(c\.portMouthMm \?\? ''\), coneDiaMm: sd && sd > 0 \? 2 \* Math\.sqrt\(sd \/ Math\.PI\) \* 10 : null, sharedBy: w \? props\.geometry\.drivers\[w\]\.count : null \}\)/);
    expect(tool).not.toMatch(/const w = num\(c\.portWeight\);/);
    expect(tool).toMatch(/portWeightNote: input\.port \? comp\.portWeightNote : null/);
  });
});
