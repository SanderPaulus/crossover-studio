/**
 * The 3-way demo fixtures (parsers/fixtures/koan-3way) are the KOAN 2951
 * session of Aug 2026 resampled onto log grids. This pins that every file
 * parses with phase, covers the band it claims, and that the three branches
 * make a plausible 3-way (level order, off-axis fall-off).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-3way');
const read = (n: string) => readFileSync(join(DIR, n), 'utf8');

describe('koan-3way demo fixtures', () => {
  it('has all 21 files and every response carries phase on a log grid', () => {
    const files = readdirSync(DIR).sort();
    expect(files.filter((f) => /\.(frd|txt)$/.test(f))).toHaveLength(18);
    expect(files.filter((f) => f.endsWith('.zma'))).toHaveLength(3);
    for (const f of files.filter((n) => /\.(frd|txt)$/.test(n))) {
      const p = parseFrd(read(f));
      expect(p.hasPhase).toBe(true);
      const near = f.includes('near');
      expect(p.freq.length).toBe(near ? 250 : 500);
      expect(p.freq[0]).toBeGreaterThanOrEqual(near ? 10 : 20);
      expect(p.freq[p.freq.length - 1]).toBeGreaterThan(near ? 1900 : 19000);
      // Log grid: constant ratio between neighbours.
      const r1 = p.freq[1] / p.freq[0];
      const r2 = p.freq[p.freq.length - 1] / p.freq[p.freq.length - 2];
      expect(Math.abs(r1 - r2)).toBeLessThan(1e-4); // 3-decimal frequencies
    }
    for (const f of files.filter((n) => n.endsWith('.zma'))) {
      const z = parseZma(read(f));
      expect(z.freq.length).toBeGreaterThan(100);
      expect(Math.min(...z.magnitude)).toBeGreaterThan(1);
    }
  });

  it('branch levels make a 3-way: the tweeter leads at 8 kHz, and every 60° file falls off against its 0° file', () => {
    const at = (p: ReturnType<typeof parseFrd>, f: number) => {
      const i = p.freq.reduce((b, v, k) => (Math.abs(v - f) < Math.abs(p.freq[b] - f) ? k : b), 0);
      return p.spl[i];
    };
    const w = parseFrd(read('woofer-pair-hor0.frd'));
    const m = parseFrd(read('mid-hor0.txt'));
    const t = parseFrd(read('tweeter-hor0.txt'));
    expect(at(t, 8000)).toBeGreaterThan(at(m, 8000));
    expect(at(m, 8000)).toBeGreaterThan(at(w, 8000));
    // Off-axis files fall away where on-axis stays: 60° is quieter than 0° at 10 kHz for every branch.
    for (const [a, b] of [['woofer-pair-hor60.frd', w], ['mid-hor60.txt', m], ['tweeter-hor60.txt', t]] as const) {
      expect(at(parseFrd(read(a)), 10000)).toBeLessThan(at(b, 10000));
    }
  });
});
