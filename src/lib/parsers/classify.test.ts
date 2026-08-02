import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLevelProfile } from './classify.ts';
import { parseFrd } from './frd.ts';
import { parseZma } from './zma.ts';
import { parseLim } from './lim.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (n: string) => readFileSync(join(FIXTURES, n), 'utf8');

describe('classifyLevelProfile', () => {
  it('recognises real SPL measurements as SPL', () => {
    const frd = parseFrd(read('mid_hor0_mettape.txt'));
    expect(classifyLevelProfile(frd.spl).kind).toBe('spl');
  });

  it('recognises real impedance measurements as impedance', () => {
    const zma = parseZma(read('mid_Backwavecone_sheep75gram.ZMA'));
    expect(classifyLevelProfile(zma.magnitude).kind).toBe('impedance');
    const buf = readFileSync(join(FIXTURES, 'limp-woofer1.lim'));
    const lim = parseLim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    // The woofer peaks at 62 Ω on its Fs — the MEDIAN is what classifies,
    // so a healthy resonance peak must not push it into the ambiguous band.
    expect(classifyLevelProfile(lim.magnitude).kind).toBe('impedance');
  });

  it('THE case that started this: a ZMA loaded down the FRD path is flagged', () => {
    // Same bytes, wrong parser — exactly what a .txt-named impedance file does.
    const asFrd = parseFrd(read('mid_Backwavecone_sheep75gram.ZMA'));
    expect(classifyLevelProfile(asFrd.spl).kind).toBe('impedance');
  });

  it('a normalized response (dips below 0 dB) is SPL, never impedance', () => {
    // |Z| ≤ 0 is impossible, so one negative settles it — this is what keeps
    // target-style normalized curves from being flagged as impedance.
    const values = [3, 1.5, 0.2, -1.8, -4, -0.5, 2];
    expect(classifyLevelProfile(values).kind).toBe('spl');
  });

  it('the in-between band stays quiet', () => {
    expect(classifyLevelProfile([50, 52, 48, 55, 51]).kind).toBe('ambiguous');
    expect(classifyLevelProfile([]).kind).toBe('ambiguous');
  });
});
