import { describe, expect, it } from 'vitest';
import { logspace, type GriddedResponse } from './dsp.ts';
import { evalHpLp } from './filters.ts';
import {
  ACTIVE_SIDE_VERSION,
  HANDOVER_MATCH_OCTAVES,
  activeHighPass,
  activeLowPass,
  deriveModelBranch,
  fitModelBranch,
  handoverBandHz,
  modelBranchResponse,
  modelBranchTransfer,
  type ActiveHandover,
} from './activeSide.ts';

/* ------------------------------------------------------------------ *
 * The bank: a flat, minimum-effort pair of "measurements" on one grid.
 *
 * FLAT AND ZERO-PHASE on purpose. Everything this module derives is a
 * DIFFERENCE between the two branches, so a bank with no character of its own
 * makes every answer a hand calculation: a gain that comes out non-zero is a
 * level difference somebody put there, and a delay that comes out non-zero is a
 * phase slope somebody put there.
 * ------------------------------------------------------------------ */
/* LOG-SYMMETRIC ABOUT THE HANDOVER (400 Hz is grid point 200 of 50–3200 Hz),
 * so the hand calculations below stay hand calculations: the gain matches the
 * two SHAPED branches, and on a symmetric grid the two mirror-image flanks take
 * exactly equal energy out of each side. On an arbitrary grid they differ by
 * hundredths of a dB — measured at 0.020 dB on a 100–2000 Hz grid, which is
 * nothing to a loudspeaker and everything to a test that must be checkable. */
const GRID = logspace(50, 3200, 401);
const flat = (db: number): GriddedResponse => ({
  freq: [...GRID],
  spl: GRID.map(() => db),
  phaseDeg: GRID.map(() => 0),
});
/** The same, delayed by `ms` — a pure phase slope and nothing else. */
const delayed = (db: number, ms: number): GriddedResponse => ({
  freq: [...GRID],
  spl: GRID.map(() => db),
  phaseDeg: GRID.map((f) => -360 * f * (ms / 1000)),
});

const HANDOVER: ActiveHandover = {
  passiveWay: 'mid',
  activeWay: 'woofer',
  hz: 400,
  kind: 'LR',
  order: 4,
  statedBy: 'the test',
};

describe('H-1 — the stated handover to an active side', () => {
  it('the two target shapes are the same alignment read at its two ends', () => {
    const hp = activeHighPass(HANDOVER);
    const lp = activeLowPass(HANDOVER);
    for (const s of [hp, lp]) {
      expect(s.enabled).toBe(true);
      expect(s.kind).toBe('LR');
      expect(s.order).toBe(4);
      expect(s.freq).toBe(400);
    }
    /* THE HAND CALCULATION that makes it one alignment and not two: an LR pair
     * is −6.02 dB each at the corner and their sum is unity there, which is the
     * defining property of Linkwitz-Riley. If the two halves ever came from
     * different statements this would be the first thing to break. */
    const h = evalHpLp(hp, 'hp', 400);
    const l = evalHpLp(lp, 'lp', 400);
    expect(20 * Math.log10(Math.hypot(h.re, h.im))).toBeCloseTo(-6.0206, 3);
    expect(20 * Math.log10(Math.hypot(l.re, l.im))).toBeCloseTo(-6.0206, 3);
    const sum = Math.hypot(h.re + l.re, h.im + l.im);
    expect(20 * Math.log10(sum)).toBeCloseTo(0, 6);
  });

  it('the fit band is half an octave either side of the stated handover', () => {
    const [lo, hi] = handoverBandHz(400);
    expect(Math.log2(400 / lo)).toBeCloseTo(HANDOVER_MATCH_OCTAVES, 12);
    expect(Math.log2(hi / 400)).toBeCloseTo(HANDOVER_MATCH_OCTAVES, 12);
    /* Geometric, so the stated handover is the middle of its own band. */
    expect(Math.sqrt(lo * hi)).toBeCloseTo(400, 9);
  });

  it('the modelled transfer is the low-pass, the gain, the delay and the polarity — and nothing else', () => {
    /* HAND CALCULATION at the corner: LR4 is −6.0206 dB there, a gain of
     * +6.0206 dB cancels it exactly, a delay of half a period is −180° and a
     * polarity flip is another 180°, so the two together land back at 0°. */
    const halfPeriodMs = 1000 / 400 / 2;
    const h = modelBranchTransfer(
      { kind: 'LR', order: 4, hz: 400, gainDb: 6.0206, delayMs: halfPeriodMs, inverted: true },
      [400],
    )[0];
    expect(20 * Math.log10(Math.hypot(h.re, h.im))).toBeCloseTo(0, 3);
    /* LR4 at its own corner carries −180° of its own; −180 (delay) + 180
     * (polarity) − 180 (the alignment) wraps to exactly −180°. */
    expect(Math.abs((Math.atan2(h.im, h.re) * 180) / Math.PI)).toBeCloseTo(180, 3);

    /* And a delay is a PHASE SLOPE and not a level: doubling it must not move
     * a single dB. */
    const a = modelBranchTransfer({ kind: 'LR', order: 4, hz: 400, gainDb: 0, delayMs: 0.3, inverted: false }, GRID);
    const b = modelBranchTransfer({ kind: 'LR', order: 4, hz: 400, gainDb: 0, delayMs: 0.6, inverted: false }, GRID);
    for (let i = 0; i < GRID.length; i++) {
      expect(Math.hypot(a[i].re, a[i].im)).toBeCloseTo(Math.hypot(b[i].re, b[i].im), 12);
    }
  });

  it('the gain levels the two branches over the handover band — the measured difference, exactly', () => {
    /* NEW MEASUREMENT: the active way measured 6 dB quieter than the passive
     * one must be given exactly 6 dB more. Nothing else in the bank differs. */
    const d = deriveModelBranch(HANDOVER, flat(80), flat(86));
    expect(d.off).toEqual([]);
    expect(d.settings!.gainDb).toBeCloseTo(6, 6);
    const back = deriveModelBranch(HANDOVER, flat(86), flat(80));
    expect(back.settings!.gainDb).toBeCloseTo(-6, 6);
  });

  it('the delay fit recovers a delay that was put into the measurement', () => {
    /* THE SHARPEST TEST IN THIS FILE. The passive way is given a pure delay of
     * 0.2 ms and nothing else; the fit must ask the ACTIVE side for the same
     * 0.2 ms, because that is what lines the two up again. A criterion that
     * measured anything other than the phase alignment would not land here. */
    for (const ms of [0.2, -0.2, 0.35]) {
      const d = deriveModelBranch(HANDOVER, flat(86), delayed(86, ms));
      expect(d.settings!.inverted).toBe(false);
      expect(d.settings!.delayMs).toBeCloseTo(ms, 2);
    }
    /* And with nothing to correct it asks for nothing. */
    const zero = deriveModelBranch(HANDOVER, flat(86), flat(86));
    expect(zero.settings!.delayMs).toBeCloseTo(0, 3);
    expect(zero.settings!.inverted).toBe(false);
  });

  it('the polarity is a MEASUREMENT, and the tegenproef travels with it', () => {
    /* A passive way whose phase is 180° away is met by a reversed model, not by
     * half a period of delay: the delay search is bounded at half a period
     * either way, so the two families are genuinely separate answers. */
    const reversed: GriddedResponse = { ...flat(86), phaseDeg: GRID.map(() => 180) };
    const d = deriveModelBranch(HANDOVER, flat(86), reversed);
    expect(d.settings!.inverted).toBe(true);
    expect(d.settings!.delayMs).toBeCloseTo(0, 3);
    /* The tegenproef is always present and always the LOSER here. */
    expect(d.nullMarginDb).not.toBeNull();
    expect(d.otherPolarityNullMarginDb).not.toBeNull();
    expect(d.nullMarginDb!).toBeGreaterThan(d.otherPolarityNullMarginDb!);
  });

  it('P4 — a missing input names itself and derives nothing', () => {
    const noActive = deriveModelBranch(HANDOVER, null, flat(86));
    expect(noActive.settings).toBeNull();
    expect(noActive.off.join(' ')).toContain('woofer');
    const noPassive = deriveModelBranch(HANDOVER, flat(86), null);
    expect(noPassive.settings).toBeNull();
    expect(noPassive.off.join(' ')).toContain('mid');
    /* Two grids that are not the same grid is a state and not a silent
     * interpolation: this module never resamples for its caller. */
    const other = { freq: [100, 200], spl: [86, 86], phaseDeg: [0, 0] };
    const mismatch = fitModelBranch(HANDOVER, flat(86), other);
    expect(mismatch.settings).toBeNull();
    expect(mismatch.off.join(' ')).toContain('same grid');
  });

  it('`fitModelBranch` is the same fit against a DELIVERED branch — one implementation, two readers', () => {
    /* Hand the fit the passive way already shaped by the ideal high-pass and it
     * must give the identical answer to `deriveModelBranch`, which shapes it
     * itself. That equality is what makes the delivered re-fit comparable to
     * the judged number rather than a second opinion. */
    const passiveMeasured = delayed(86, 0.25);
    const hp = activeHighPass(HANDOVER);
    const shaped: GriddedResponse = {
      freq: [...GRID],
      spl: GRID.map((f, i) => passiveMeasured.spl[i] + 20 * Math.log10(Math.hypot(evalHpLp(hp, 'hp', f).re, evalHpLp(hp, 'hp', f).im))),
      phaseDeg: GRID.map((f, i) => passiveMeasured.phaseDeg[i] + (Math.atan2(evalHpLp(hp, 'hp', f).im, evalHpLp(hp, 'hp', f).re) * 180) / Math.PI),
    };
    const viaDerive = deriveModelBranch(HANDOVER, flat(86), passiveMeasured);
    const viaFit = fitModelBranch(HANDOVER, flat(86), shaped);
    expect(viaFit.settings!.delayMs).toBeCloseTo(viaDerive.settings!.delayMs, 9);
    expect(viaFit.settings!.gainDb).toBeCloseTo(viaDerive.settings!.gainDb, 9);
    expect(viaFit.settings!.inverted).toBe(viaDerive.settings!.inverted);
  });

  it('`modelBranchResponse` is the measurement times the transfer, point for point', () => {
    const spec = { kind: 'LR' as const, order: 4 as const, hz: 400, gainDb: -3, delayMs: 0.12, inverted: true };
    const measured = delayed(90, 0.4);
    const out = modelBranchResponse(measured, spec);
    const h = modelBranchTransfer(spec, GRID);
    for (let i = 0; i < GRID.length; i += 37) {
      expect(out.spl[i]).toBeCloseTo(measured.spl[i] + 20 * Math.log10(Math.hypot(h[i].re, h[i].im)), 9);
    }
  });

  it('carries a version string (A5e.5)', () => {
    expect(ACTIVE_SIDE_VERSION).toMatch(/^active-handover\/\d+\.\d+$/);
  });
});
