import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, type GriddedResponse } from './dsp.ts';
import { parseFrd } from './parsers/frd.ts';
import { designThreeWay } from './threeWayDesign.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

describe('threeWayDesign — alignment × polarity structure search', () => {
  const grid = logspace(210, 19000, 200);
  const g = (raw: string): GriddedResponse => {
    const f = parseFrd(raw);
    return resample(f.freq, f.spl, f.phase, grid);
  };
  // KOAN's mid stands in for both the woofer and the mid: an artificial
  // three-way, but real measured magnitude AND phase, which is what the
  // structure search actually reasons about.
  const w = g(load('mid_hor0_mettape.txt'));
  const m = g(load('mid_hor0_mettape.txt'));
  const t = g(load('tweet_hor0_mettape.txt'));
  const base = {
    w,
    m,
    t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: 600,
    xoHigh: 3000,
    band: [250, 18000] as [number, number],
    phasePriority: 0.5,
  };

  it('returns a complete, self-consistent three-way target design', () => {
    const d = designThreeWay(base);
    // Both handovers are real and ordered, and the mid is a true bandpass.
    expect(d.xoHigh).toBeGreaterThan(d.xoLow * 2);
    expect(d.specs.mid.hp.enabled).toBe(true);
    expect(d.specs.mid.lp.enabled).toBe(true);
    // One crossing is ONE decision: the pair shares knee and alignment.
    expect(d.specs.woofer.lp.freq).toBe(d.specs.mid.hp.freq);
    expect(d.specs.woofer.lp.kind).toBe(d.specs.mid.hp.kind);
    expect(d.specs.tweeter.hp.freq).toBe(d.specs.mid.lp.freq);
    expect(d.specs.tweeter.hp.kind).toBe(d.specs.mid.lp.kind);
    // Passive is cut-only — no branch may be asked to play louder.
    for (const s of [d.specs.woofer, d.specs.mid, d.specs.tweeter]) {
      expect(s.gainDb).toBeLessThanOrEqual(0);
    }
    // EQ is a synthesis tool, not a design target (acoustic-mode doctrine).
    expect(d.specs.woofer.eq).toHaveLength(0);
    expect(d.specs.mid.eq).toHaveLength(0);
    expect(d.specs.tweeter.eq).toHaveLength(0);
    // The full library was searched: 4 × 4 alignments × 4 polarity combos.
    expect(d.evaluated).toBeGreaterThanOrEqual(64);
    expect(d.pairPhaseDeg).toHaveLength(2);
  });

  it('is deterministic', () => {
    const a = designThreeWay(base);
    const b = designThreeWay(base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('decides polarity ABSOLUTELY — the incoming checkboxes cannot bias it', () => {
    // The whole point of enumerating polarity: the design must not inherit a
    // suckout because a checkbox happened to be ticked. The chosen polarity
    // REPLACES the incoming one, so the same drivers always yield the same
    // design whichever way they were wired in the UI.
    const normal = designThreeWay(base);
    const flipped = designThreeWay({
      ...base,
      midAdjust: { inverted: true },
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: true },
    });
    expect(flipped.midInverted).toBe(normal.midInverted);
    expect(flipped.tweeterInverted).toBe(normal.tweeterInverted);
    expect(flipped.fx).toBeCloseTo(normal.fx, 9);
    // Non-polarity adjustments still ride along untouched.
    const shifted = designThreeWay({ ...base, midAdjust: { trimDb: -3 } });
    expect(shifted.fx).not.toBeCloseTo(normal.fx, 3);
  });

  it('honours a binding alignment choice on both crossings', () => {
    const d = designThreeWay({
      ...base,
      structureLow: { kind: 'BW', order: 3 },
      structureHigh: { kind: 'BS', order: 4 },
    });
    expect(d.alignLow).toEqual({ kind: 'BW', order: 3 });
    expect(d.alignHigh).toEqual({ kind: 'BS', order: 4 });
    expect(d.specs.mid.hp.kind).toBe('BW');
    expect(d.specs.mid.hp.order).toBe(3);
    expect(d.specs.mid.lp.kind).toBe('BS');
    expect(d.specs.mid.lp.order).toBe(4);
    // Polarity stays free — the designer chose the foundation, not the wiring.
    expect(d.evaluated).toBeGreaterThanOrEqual(4);
  });

  it('keeps each knee inside the candidate cage it was handed', () => {
    const d = designThreeWay({
      ...base,
      xoLow: 500,
      xoLowWindow: [460, 540],
      xoHighWindow: [2800, 3200],
    });
    expect(d.xoLow).toBeGreaterThanOrEqual(459);
    expect(d.xoLow).toBeLessThanOrEqual(541);
    expect(d.xoHigh).toBeGreaterThanOrEqual(2799);
    expect(d.xoHigh).toBeLessThanOrEqual(3201);
  });

  it('never puts the high knee below the tweeter Fs floor', () => {
    const d = designThreeWay({ ...base, xoHigh: 2200, hpFloorHz: 2600 });
    expect(d.xoHigh).toBeGreaterThanOrEqual(2600);
  });

  describe('stage 3: greedy cut-only EQ (2-way parity)', () => {
    // A +10 dB narrow bump at 1.5 kHz injected into the MID — solidly inside
    // its passband, where no other chain stage can touch it.
    const bumped: GriddedResponse = {
      freq: m.freq,
      spl: m.spl.map((v, i) => {
        const x = Math.log2(m.freq[i] / 1500);
        return v + 10 * Math.exp(-(x * x) / (2 * 0.15 * 0.15));
      }),
      phaseDeg: [...m.phaseDeg],
    };

    it('budget 0 (default) leaves the specs EQ-free — staged-v1 bit-compat', () => {
      const d = designThreeWay({ ...base, m: bumped });
      expect(d.specs.woofer.eq).toHaveLength(0);
      expect(d.specs.mid.eq).toHaveLength(0);
      expect(d.specs.tweeter.eq).toHaveLength(0);
    });

    it('cuts the mid bump: a band lands near it, on the right branch, cut-only', () => {
      const off = designThreeWay({ ...base, m: bumped });
      const on = designThreeWay({ ...base, m: bumped, eqBandsPerBranch: 2 });
      // The design with EQ must beat the same design without it.
      expect(on.fx).toBeLessThan(off.fx);
      // At least one band, on the MID (the dominant branch at the bump), as a
      // CUT near 1.5 kHz.
      const midBands = on.specs.mid.eq.filter((b) => b.enabled);
      expect(midBands.length).toBeGreaterThan(0);
      const near = midBands.find((b) => b.freq > 900 && b.freq < 2500);
      expect(near).toBeDefined();
      expect(near!.gainDb).toBeLessThan(0);
      // Passive doctrine: every placed band is a cut, everywhere.
      for (const spec of [on.specs.woofer, on.specs.mid, on.specs.tweeter]) {
        for (const b of spec.eq) expect(b.gainDb).toBeLessThanOrEqual(0);
      }
      // Budget respected per branch.
      for (const spec of [on.specs.woofer, on.specs.mid, on.specs.tweeter]) {
        expect(spec.eq.filter((b) => b.enabled).length).toBeLessThanOrEqual(2);
      }
      // The label reports the band count honestly.
      expect(on.label).toMatch(/· \d+ EQ$/);
    });

    it('is deterministic with EQ on', () => {
      const a = designThreeWay({ ...base, m: bumped, eqBandsPerBranch: 2 });
      const b = designThreeWay({ ...base, m: bumped, eqBandsPerBranch: 2 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
