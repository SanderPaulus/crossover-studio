import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLim, limToZmaText, LimParseError } from './lim.ts';
import { parseZma } from './zma.ts';
import type { ZmaMeasurement } from '../types.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function load(name: string): ZmaMeasurement {
  const buf = readFileSync(join(FIXTURES, name));
  return parseLim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Complex Z at frequency f, linear interpolation on a log-f axis. */
function zAt(m: ZmaMeasurement, f: number): { re: number; im: number } {
  let i = m.freq.findIndex((x) => x >= f);
  if (i <= 0) i = 1;
  const u = (Math.log(f) - Math.log(m.freq[i - 1])) / (Math.log(m.freq[i]) - Math.log(m.freq[i - 1]));
  const at = (k: number) => ({
    re: m.magnitude[k] * Math.cos((m.phase[k] * Math.PI) / 180),
    im: m.magnitude[k] * Math.sin((m.phase[k] * Math.PI) / 180),
  });
  const a = at(i - 1);
  const b = at(i);
  return { re: a.re * (1 - u) + b.re * u, im: a.im * (1 - u) + b.im * u };
}

describe('parseLim', () => {
  it('decodes the woofer measurement (point count, range, Fs peak)', () => {
    const w = load('limp-woofer1.lim');
    expect(w.freq.length).toBe(480);
    expect(w.freq[0]).toBeCloseTo(20, 3);
    expect(w.freq.at(-1)!).toBeCloseTo(20000, 1);
    // Fs peak: 62.3 Ω near 106.5 Hz — the signature of a real woofer.
    const iPeak = w.magnitude.indexOf(Math.max(...w.magnitude));
    expect(w.magnitude[iPeak]).toBeCloseTo(62.3, 1);
    expect(w.freq[iPeak]).toBeCloseTo(106.5, 0);
    // Minimum above resonance: 7.20 Ω near 328 Hz.
    expect(Math.min(...w.magnitude)).toBeCloseTo(7.2, 1);
  });

  it('decodes the tweeter measurement', () => {
    const t = load('limp-tweeter1.lim');
    expect(t.freq.length).toBe(336);
    expect(t.freq[0]).toBeCloseTo(200, 2);
    const iPeak = t.magnitude.indexOf(Math.max(...t.magnitude));
    expect(t.magnitude[iPeak]).toBeCloseTo(19.09, 1);
    expect(t.freq[iPeak]).toBeCloseTo(482, 0);
  });

  it('column mapping is proven by physics: w ∥ t matches the measured parallel file', () => {
    // The third fixture is the SAME two drivers measured wired in parallel.
    // Complex parallel of the individual measurements must reproduce it —
    // and this only works when magnitude and phase sit in the right columns,
    // because complex arithmetic on swapped columns falls apart completely.
    const w = load('limp-woofer1.lim');
    const t = load('limp-tweeter1.lim');
    const c = load('limp-woofer1-tweeter1-parallel.lim');
    for (const f of [250, 500, 1000, 2000, 5000, 10000, 19000]) {
      const a = zAt(w, f);
      const b = zAt(t, f);
      // parallel = a·b / (a+b), complex
      const num = { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
      const den = { re: a.re + b.re, im: a.im + b.im };
      const d2 = den.re * den.re + den.im * den.im;
      const par = Math.hypot((num.re * den.re + num.im * den.im) / d2, (num.im * den.re - num.re * den.im) / d2);
      const meas = Math.hypot(zAt(c, f).re, zAt(c, f).im);
      // Two separate sweeps + contact resistance: allow measurement spread,
      // but nothing structural. Swapped columns miss by whole ohms.
      expect(Math.abs(par - meas)).toBeLessThan(0.3);
    }
  });

  it('round-trips through the ZMA text conversion', () => {
    const t = load('limp-tweeter1.lim');
    const z = parseZma(limToZmaText(t, 'tweeter 1.lim'));
    expect(z.freq.length).toBe(t.freq.length);
    for (const i of [0, 100, t.freq.length - 1]) {
      expect(z.freq[i]).toBeCloseTo(t.freq[i], 6);
      expect(z.magnitude[i]).toBeCloseTo(t.magnitude[i], 6);
      expect(z.phase[i]).toBeCloseTo(t.phase[i], 6);
    }
    // Provenance survives as comments, so the file inventory can say
    // where an impedance came from.
    expect(z.meta.rawComments.join(' ')).toContain('tweeter 1.lim');
  });

  it('rejects what is not a LIMP file, loudly', () => {
    expect(() => parseLim(new ArrayBuffer(10))).toThrow(LimParseError);
    // Right size, wrong magic (e.g. someone renamed a .zma to .lim).
    const junk = new Uint8Array(100).fill(0x41);
    expect(() => parseLim(junk.buffer)).toThrow(/signature/);
    // Truncated: header promises more points than the file carries.
    const real = readFileSync(join(FIXTURES, 'limp-tweeter1.lim'));
    const cut = real.buffer.slice(real.byteOffset, real.byteOffset + 200);
    expect(() => parseLim(cut)).toThrow(/truncated/);
  });
});
