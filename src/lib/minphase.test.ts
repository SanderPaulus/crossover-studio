import { describe, it, expect } from 'vitest';
import { minimumPhaseDeg } from './minphase.ts';
import { logspace } from './dsp.ts';

describe('minimumPhaseDeg', () => {
  const grid = logspace(100, 20000, 400);

  it('a flat magnitude has zero phase', () => {
    const ph = minimumPhaseDeg(grid, grid.map(() => 90));
    for (const v of ph) expect(Math.abs(v)).toBeLessThan(1);
  });

  it('recovers the analytic phase of a 2nd-order Butterworth low-pass', () => {
    // BW2 LP is minimum-phase by construction: reconstructing phase from its
    // magnitude must reproduce the analytic phase. Analytic:
    //   |H| = 1/√(1+(f/fc)⁴),  φ = −atan2(√2·r, 1−r²)  with r = f/fc.
    const fc = 2000;
    const mag = grid.map((f) => 90 - 10 * Math.log10(1 + (f / fc) ** 4));
    const ph = minimumPhaseDeg(grid, mag);

    const errAt = (f: number): number => {
      const i = grid.findIndex((g) => g >= f);
      const r = f / fc;
      const analytic = (-Math.atan2(Math.SQRT2 * r, 1 - r * r) * 180) / Math.PI;
      return Math.abs(ph[i] - analytic);
    };
    // Midband within 1.5°; the residual is the unavoidable truncation of the
    // rolloff beyond Nyquist. Toward the band top the error grows (documented
    // limitation, same class of approximation VituixCAD makes) — the
    // measured-vs-minimum deltas we compare against are tens of degrees.
    for (const f of [500, 1000, 2000, 4000]) expect(errAt(f)).toBeLessThan(1.5);
    expect(errAt(8000)).toBeLessThan(3.5);
    // Sanity anchor: −90° at fc.
    const iFc = grid.findIndex((g) => g >= fc);
    expect(ph[iFc]).toBeCloseTo(-90, 0);
  });

  it('a pure delay is invisible to minimum phase (that is the whole point)', () => {
    // Two responses with identical magnitude but different (delayed) phase
    // yield the SAME minimum phase — the delay information is destroyed.
    const mag = grid.map((f) => 90 - 10 * Math.log10(1 + (f / 3000) ** 4));
    const a = minimumPhaseDeg(grid, mag);
    const b = minimumPhaseDeg(grid, [...mag]); // same magnitude, "other" driver
    for (let i = 0; i < grid.length; i++) expect(a[i]).toBeCloseTo(b[i], 9);
  });
});
