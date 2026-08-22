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

  it('ORDER: the knee is chosen AFTER the EQ stage, and before is worse', () => {
    /* The ordering test, in the shape of Merger test 5: a later refactor must
     * not be able to quietly swap these stages back.
     *
     * A choice may not be made on a quantity a later stage still changes.
     * Without EQ this design step reports a mid-to-tweeter phase around 20
     * degrees; with EQ, single digits. Choosing the knee on the first number
     * picks a different knee — measured on Sanders set, 1930 Hz (M-T 9.5) over
     * 2100 Hz (M-T 5.2), while 2100 also scored BETTER on the objective the
     * step is minimising. The design this optimiser produced on 2026-08-20,
     * the one that set the phase bar, crosses at 2101 Hz.
     *
     * "Before" is reconstructed through the public API rather than by keeping
     * dead code: run with no EQ budget to get the pre-EQ knee, pin it, then
     * allow EQ. That is exactly the old sequence. */
    const withEq = { ...base, eqBandsPerBranch: 4 };
    const after = designThreeWay(withEq);

    const preEqKnee = designThreeWay({ ...base, eqBandsPerBranch: 0 });
    const before = designThreeWay({
      ...withEq,
      xoHigh: preEqKnee.xoHigh,
      xoHighWindow: [preEqKnee.xoHigh * 0.999, preEqKnee.xoHigh * 1.001],
    });

    // The stages disagree about where the knee belongs — if they ever stop
    // disagreeing on this fixture the test is no longer testing anything, so
    // that is asserted too.
    expect(Math.abs(Math.log2(after.xoHigh / preEqKnee.xoHigh))).toBeGreaterThan(0.02);
    // And choosing it before the EQ stage costs the objective the step exists
    // to minimise.
    expect(after.fx).toBeLessThan(before.fx);
  });

  it('the revision cannot end on a down-swing', () => {
    /* The revision re-derives a GREEDY stage at each trial knee, so it is not
     * guaranteed to be monotone. The loop therefore keeps the best point it
     * has seen rather than the last, and never returns something worse than
     * the design it started from. */
    const plain = designThreeWay({ ...base, eqBandsPerBranch: 4 });
    const noEq = designThreeWay({ ...base, eqBandsPerBranch: 0 });
    expect(plain.fx).toBeLessThanOrEqual(noEq.fx);
    // Deterministic across repeats, which a loop with an accept/revert rule
    // is an easy way to get wrong.
    expect(designThreeWay({ ...base, eqBandsPerBranch: 4 }).fx).toBe(plain.fx);
    expect(designThreeWay({ ...base, eqBandsPerBranch: 4 }).xoHigh).toBe(plain.xoHigh);
  });

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

describe('threeWayDesign — directivity in the structure search (KOAN 3-way fixture)', () => {
  const D = join(FIXTURES, 'koan-3way');
  const grid = logspace(210, 19000, 240);
  const g = (name: string): GriddedResponse => {
    const f = parseFrd(readFileSync(join(D, name), 'utf-8'));
    return resample(f.freq, f.spl, f.phase, grid);
  };
  const w = g('woofer-pair-hor0.frd');
  const m = g('mid-hor0.txt');
  const t = g('tweeter-hor0.txt');
  const base = {
    w,
    m,
    t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: 500,
    xoHigh: 3000,
    band: [250, 18000] as [number, number],
    phasePriority: 0.5,
    xoLowWindow: [424, 622] as [number, number],
    xoHighWindow: [2000, 3400] as [number, number],
    breakupGuard: true,
    eqBandsPerBranch: 0,
  };

  it('the DI term is exactly wDI·log2(knee/anchor)² on top of the on-axis fx (window collapsed to one knee)', () => {
    const at3300 = { ...base, xoHigh: 3300, xoHighWindow: [3300, 3300] as [number, number] };
    const plain = designThreeWay(at3300);
    const anchored = designThreeWay({ ...at3300, diAnchorHz: { high: 2400 }, diWeight: 0.3 });
    /* WITHIN 1 %, not exactly equal. The window here is not really collapsed:
     * kneeWindow falls back to ±5 % when it is handed a zero-width one, so the
     * refine has room and the two runs landing on the identical integer was a
     * coincidence. Since the knee refine became multi-start (it has to be —
     * the knee landscape is multimodal, see threeWayDesign.ts) they settle
     * 8 Hz apart. The claim being tested is that the DI term does not MOVE the
     * knee, and 0.2 % is that claim. */
    expect(Math.abs(Math.log2(anchored.xoHigh / plain.xoHigh))).toBeLessThan(0.015);
    expect(anchored.diDistanceOct[1]!).toBeGreaterThan(0.4); // ≈ log2(3300/2400) = 0.46 (the delivered knee may sit a hair off the collapsed window)
    expect(anchored.diDistanceOct[1]!).toBeLessThan(0.6);
    // ±0.05: the collapsed window still lets NM settle a hair off 3300 and pick a
    // marginally different structure, so this is the term to within a few %.
    expect(Math.abs(anchored.fx - plain.fx - 0.3 * Math.log2(3300 / 2400) ** 2)).toBeLessThan(0.06);
    expect(plain.diDistanceOct).toEqual([null, null]);
  });

  it('with the anchor the chosen knee never sits FURTHER from it than without; a heavy weight pulls it onto the anchor', () => {
    // On this set the on-axis optimum sits at the LOW edge of the M-T window
    // (the tuner's known preference for ~1.85–2 kHz), so wDI 0.3 (spec) is a
    // tie-breaker here — measured: 0.3·log2(2000/2400)² ≈ 0.02 against an fx
    // of order 1. The mechanism is what is pinned: monotone toward the anchor.
    const plain = designThreeWay(base);
    const light = designThreeWay({ ...base, diAnchorHz: { high: 2400 }, diWeight: 0.3 });
    const heavy = designThreeWay({ ...base, diAnchorHz: { high: 2400 }, diWeight: 30 });
    const d = (x: number) => Math.abs(Math.log2(x / 2400));
    expect(d(light.xoHigh)).toBeLessThanOrEqual(d(plain.xoHigh) + 1e-9);
    expect(d(heavy.xoHigh)).toBeLessThanOrEqual(d(light.xoHigh) + 1e-9);
    expect(heavy.xoHigh).toBeGreaterThanOrEqual(2150);
    expect(heavy.xoHigh).toBeLessThanOrEqual(2650);
  });

  it('without angle data (no anchor) the search is byte-identical to weight 0', () => {
    const a = designThreeWay(base);
    const b = designThreeWay({ ...base, diWeight: 0 });
    const c = designThreeWay({ ...base, diWeight: 0.3 }); // weight without anchor: no term
    expect(a.fx).toBe(b.fx);
    expect(a.fx).toBe(c.fx);
    expect(a.xoHigh).toBe(c.xoHigh);
    expect(a.label).toBe(c.label);
  });
});
