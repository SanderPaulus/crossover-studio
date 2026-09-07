import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample } from './dsp.ts';
import { breakupHz } from './driverLimits.ts';
import { beamingCeilingHz, diMatchHz } from './directivity.ts';
import {
  candidateCentres,
  dataFloorFromGateMs,
  deriveXoWindow,
  DEFAULT_XO_WINDOW_THRESHOLDS,
  gateMsFromHeader,
  gateHeaderOf,
  readGateHeader,
  readMergeBlock,
  DEFAULT_GATE_TAPER_ALPHA,
} from './xoWindow.ts';
import { declaredMergeValidity } from './sourceMeta.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';

// The KOAN 2951 3-way session (Aug 2026) as the fixture — see demo3way.
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures', 'koan-3way');
const read = (n: string) => readFileSync(join(DIR, n), 'utf8');
const grid = logspace(200, 19990, 600);
const onGrid = (n: string) => {
  const p = parseFrd(read(n));
  return resample(p.freq, p.spl, p.phase, grid);
};
const zPeakHz = (n: string, lo: number, hi: number): number => {
  const z = parseZma(read(n));
  let f = 0;
  let m = 0;
  for (let i = 0; i < z.freq.length; i++) {
    if (z.freq[i] < lo || z.freq[i] > hi) continue;
    if (z.magnitude[i] > m) {
      m = z.magnitude[i];
      f = z.freq[i];
    }
  }
  return f;
};

describe('xoWindow — the physics window is the intersection of every limiter (KOAN 3-way fixture)', () => {
  const mid = onGrid('mid-hor0.txt');
  const midBreak = breakupHz(grid, mid.spl, { searchFromHz: 300 })!;
  const tweeterFs = zPeakHz('tweeter.zma', 300, 3000);

  it('(a) two woofers 275.75 mm apart cap the W-M window at ≤ 620 Hz, and the array rule is named as the reason', () => {
    const w = deriveXoWindow({
      arraySpacingMm: 275.75,
      ctcMm: 382, // woofer-pair centre (−448) to mid (−66)
      beamingHz: 1500,
      fsHz: 89, // mid in its sealed chamber
      reachHz: 200,
      rails: [150, 2000],
    });
    // The spec's "≤ ~620 Hz": 0.5 · 343 m/s / 0.27575 m = 621.9 Hz.
    expect(w.ceilHz!).toBeLessThanOrEqual(622);
    const arr = w.limits.find((l) => l.rule === 'array')!;
    expect(arr.hz).toBeLessThanOrEqual(622);
    expect(w.ceilBy?.rule).toBe('array');
    expect(w.conflict).toBe(false);
  });

  it('(b) gate 5.021 ms → no candidate below ~455 Hz; a user window 280–420 is clamped and gets the "measure lower" banner', () => {
    const gate = gateMsFromHeader(read('woofer-pair-hor0.frd'));
    expect(gate).toBeCloseTo(5.021, 3);
    /* CHANGED aug 2026 (4D b): this used to expect 398 Hz, which reads the
     * nominal gate as if the window were rectangular. ARTA tapers the right
     * flank with a Tukey α = 0.25, so the coherent duration is 4.39 ms and the
     * floor is 455 Hz. The old number claimed resolution the measurement does
     * not have. */
    const df = dataFloorFromGateMs(gate)!;
    expect(df).toBeGreaterThan(450);
    expect(df).toBeLessThan(460);
    const w = deriveXoWindow({
      dataFloorHz: df,
      userWindow: [280, 420],
      arraySpacingMm: 275.75,
      rails: [150, 2000],
    });
    expect(w.floorHz!).toBeGreaterThanOrEqual(df);
    expect(w.userClampedByData).toBe(true);
    expect(w.banner).toMatch(/measure lower/);
    // No candidate below the floor.
    for (const c of candidateCentres(w.floorHz!, w.ceilHz!, 3)) expect(c).toBeGreaterThanOrEqual(df - 1e-9);
    // Rule 7 without rule 1: the user window stands as typed.
    const free = deriveXoWindow({ userWindow: [280, 420], arraySpacingMm: 275.75, rails: [150, 2000] });
    expect(free.floorHz).toBe(280);
    expect(free.ceilHz).toBe(420);
    expect(free.limits.find((l) => l.rule === 'array')?.overridden).toBe(true);
  });

  it('(c) mid breakup ≈ 5660 Hz → M-T ceiling ≤ 3.2 kHz; a 7000 Hz candidate no longer exists', () => {
    expect(midBreak.hz).toBeGreaterThan(5500);
    expect(midBreak.hz).toBeLessThan(5800);
    const w = deriveXoWindow({
      breakupHz: midBreak.hz,
      beamingHz: 8000,
      fsHz: tweeterFs,
      reachHz: 730,
      rails: [1200, 12000],
    });
    expect(w.ceilHz!).toBeLessThanOrEqual(3200);
    expect(w.ceilBy?.rule).toBe('breakup');
    const cs = candidateCentres(w.floorHz!, w.ceilHz!, 3);
    expect(Math.max(...cs)).toBeLessThanOrEqual(3200);
    expect(cs.some((c) => c > 6900)).toBe(false);
    // With the old /3 rule the fs floor (2×951 = 1902) and breakup/3 (1887)
    // collided and the whole window used to vanish; now it is a named
    // conflict, never a silent fallback.
    const old = deriveXoWindow(
      { breakupHz: midBreak.hz, fsHz: tweeterFs, rails: [1200, 12000] },
      { ...DEFAULT_XO_WINDOW_THRESHOLDS, breakupDiv: 3 },
    );
    expect(old.conflict).toBe(true);
    expect(old.banner).toMatch(/no room/);
  });

  it('(d) tweeter fs in situ ≈ 924 Hz from the ZMA (not the 600 Hz datasheet) → M-T floor ≥ 1.8 kHz', () => {
    expect(tweeterFs).toBeGreaterThan(900);
    expect(tweeterFs).toBeLessThan(1000);
    const w = deriveXoWindow({ fsHz: tweeterFs, breakupHz: midBreak.hz, rails: [1200, 12000] });
    expect(w.floorHz!).toBeGreaterThanOrEqual(1800);
    expect(w.floorHz!).toBeGreaterThan(2 * 600 + 500); // far above what a datasheet fs would give
    expect(w.floorBy?.rule).toBe('fs');
    // K = 3 without an LCR trap.
    const noTrap = deriveXoWindow(
      { fsHz: tweeterFs, breakupHz: midBreak.hz, rails: [1200, 12000] },
      { ...DEFAULT_XO_WINDOW_THRESHOLDS, fsK: 3 },
    );
    expect(noTrap.floorHz!).toBeGreaterThanOrEqual(2700);
  });

  it("(3-auto) rule 3 is axis-aware by default: Sanders' 141 mm mid–tweeter (vertical) allows his 2200–2400 Hz handover", () => {
    const vertical = deriveXoWindow({ ctcMm: 141, ctcVec: { dxMm: 0, dyMm: 140 }, fsHz: tweeterFs, breakupHz: midBreak.hz, rails: [1200, 12000] });
    expect(vertical.ceilBy?.rule).toBe('ctc');
    expect(vertical.ceilHz!).toBeGreaterThan(2400); // λ/1.0 at 141 mm = 2433 Hz
    expect(vertical.conflict).toBe(false);
    // The same spacing side by side (a centre channel) halves it: λ/2.
    const horizontal = deriveXoWindow({ ctcMm: 141, ctcVec: { dxMm: 141, dyMm: 0 }, fsHz: tweeterFs, breakupHz: midBreak.hz, rails: [1200, 12000] });
    expect(horizontal.limits.find((l) => l.rule === 'ctc')!.hz).toBeCloseTo(vertical.limits.find((l) => l.rule === 'ctc')!.hz / 2, 0);
    // A fixed λ/1.5 forbids the known-good region — and says so.
    const strict = deriveXoWindow(
      { ctcMm: 141, ctcVec: { dxMm: 0, dyMm: 140 }, fsHz: tweeterFs, breakupHz: midBreak.hz, rails: [1200, 12000] },
      { ...DEFAULT_XO_WINDOW_THRESHOLDS, ctcLambdaDiv: 1.5 },
    );
    expect(strict.conflict).toBe(true);
  });

  it('(e) every limiter logs its contribution and the binding one is identified', () => {
    const w = deriveXoWindow({
      dataFloorHz: 398,
      arraySpacingMm: 275.75,
      ctcMm: 382,
      breakupHz: 17400,
      fsHz: 89,
      excursionHz: 83,
      reachHz: 200,
      beamingHz: 1500,
      beamingMeasured: true,
      rails: [150, 2000],
    });
    const rules = w.limits.map((l) => l.rule).sort();
    expect(rules).toEqual(['array', 'beaming', 'breakup', 'ctc', 'data', 'excursion', 'fs', 'reach']);
    expect(w.floorBy?.rule).toBe('data'); // 398 > 2×89, 83, 200
    // ctc: 343000/(1.5·382) = 599 Hz vs array 622 Hz — the smaller binds:
    const ctc = w.limits.find((l) => l.rule === 'ctc')!;
    const arr = w.limits.find((l) => l.rule === 'array')!;
    expect(w.ceilBy?.rule).toBe(ctc.hz < arr.hz ? 'ctc' : 'array');
    for (const l of w.limits) expect(l.label.length).toBeGreaterThan(3);
  });

  it('rule 9: the DI-match anchor per pair, from the measured angle sets; beaming judged at 30°, not the widest angle', () => {
    const set = (pre: string, ext: string) =>
      [0, 15, 30, 45, 60].map((a) => ({ hor: a, response: onGrid(`${pre}${a}${ext}`) }));
    const W = set('woofer-pair-hor', '.frd');
    const M = set('mid-hor', '.txt');
    const T = set('tweeter-hor', '.txt');
    const wm = diMatchHz(W, M, [150, 2000]);
    const mt = diMatchHz(M, T, [1200, 12000]);
    expect(wm).not.toBeNull();
    expect(mt).not.toBeNull();
    expect(mt!).toBeGreaterThan(2500); // the mid only narrows past ~3 kHz
    expect(mt!).toBeLessThan(5000);
    expect(wm!).toBeLessThan(mt!);
    // The 94 mm mid's 0–30° difference is 0.3–0.6 dB up to 3 kHz: its 4 dB
    // beaming onset must sit well above that — judged at 60° it read 1569 Hz.
    const beam = beamingCeilingHz(M, 4);
    expect(beam).not.toBeNull();
    expect(beam!).toBeGreaterThan(4000);
  });

  it('candidate placement: corners + log-mid + warm start inside the window', () => {
    const cs = candidateCentres(400, 620, 3, 560);
    expect(cs[0]).toBeCloseTo(400, 6);
    expect(cs[cs.length - 1]).toBeCloseTo(620, 6);
    expect(cs).toContain(560);
    // A warm start within 2% of a grid point is folded into it (no duplicate chain).
    expect(candidateCentres(400, 620, 3, 499)).toHaveLength(3);
    expect(cs.some((c) => Math.abs(c - Math.sqrt(400 * 620)) < 1)).toBe(true);
    // A warm start outside the window is ignored.
    expect(candidateCentres(400, 620, 2, 900)).toHaveLength(2);
  });
});

describe('the gate floor accounts for the window taper (4D b)', () => {
  it('the same gate reads 398 Hz rectangular and 455 Hz with ARTA\'s Tukey 0.25', () => {
    // Sander's woofer sweep: "ARTA gated 5.021 ms, ref time 2.5 ms".
    const T = 5.021;
    expect(dataFloorFromGateMs(T, 0)!).toBeCloseTo(398, 0);
    expect(dataFloorFromGateMs(T, 0.25)!).toBeCloseTo(455, 0);
    // The default IS the Tukey, because that is what the measurement used.
    expect(DEFAULT_GATE_TAPER_ALPHA).toBe(0.25);
    expect(dataFloorFromGateMs(T)).toBeCloseTo(dataFloorFromGateMs(T, 0.25)!, 9);
    // Monotone: more taper, less effective window, higher floor.
    expect(dataFloorFromGateMs(T, 0.5)!).toBeGreaterThan(dataFloorFromGateMs(T, 0.25)!);
    expect(dataFloorFromGateMs(null)).toBeNull();
    expect(dataFloorFromGateMs(0)).toBeNull();
  });

  it('costs 0.19 octave of splice window and leaves 0.34 — the trade this is worth making', () => {
    const kaCeil = 0.95 * (343 / (2 * Math.PI * Math.sqrt(255e-4 / Math.PI)));
    const rect = Math.log2(kaCeil / dataFloorFromGateMs(5.021, 0)!);
    const tukey = Math.log2(kaCeil / dataFloorFromGateMs(5.021, 0.25)!);
    expect(rect).toBeCloseTo(0.532, 2);
    expect(tukey).toBeCloseTo(0.339, 2);
    expect(rect - tukey).toBeCloseTo(0.19, 2);
    // Still clear of the threshold where a gain fit gets thin.
    expect(tukey).toBeGreaterThan(0.2);
  });
});

describe('gate header — what the exporter actually writes', () => {
  /* THE BUG THIS PINS. ARTA never writes the word "gate". Its .txt export says
   *
   *     * Right window = 5,021 ms, Tukey 0.25
   *
   * with a comma decimal on a European locale. The first parser required the
   * literal "gate", so it returned null for every ARTA export — and the app
   * fell back to the cabinet's single global Gate field without anything
   * downstream being able to tell "this file has no gate" from "I could not
   * read this file's gate". Measured on Sanders project: ten mid and tweeter
   * files each stating 5.021 ms read as stating nothing, a typed 4.5 stood in,
   * and the evaluation band started 53 Hz too high. */
  const arta = [
    '* Source file = mid hor 0.pir',
    '* Left window = 0 ms, Rectangular',
    '* Reference time = 2,5 ms',
    '* Right window = 5,021 ms, Tukey 0.25',
    '* FFT length = 32768',
    '20.5  84.1  -12.0',
  ].join('\n');

  it('reads ARTAs "Right window", comma decimal and all', () => {
    const h = gateHeaderOf(arta)!;
    expect(h.gateMs).toBeCloseTo(5.021, 6);
    // The header names the taper, so it is not assumed.
    expect(h.alpha).toBeCloseTo(0.25, 6);
    expect(h.quote).toMatch(/Right window/);
  });

  it('never mistakes the LEFT window for the gate', () => {
    // "Left window = 0 ms" sits above it in every ARTA header, and a 0 ms gate
    // would put the data floor at infinity.
    expect(gateHeaderOf(arta)!.gateMs).not.toBe(0);
    const leftOnly = '* Left window = 0 ms, Rectangular\n20.5 84.1 -12.0';
    expect(gateHeaderOf(leftOnly)).toBeNull();
  });

  it('still reads the older forms, including our own comment', () => {
    expect(gateHeaderOf('* bron: ARTA gated 5.021 ms, ref time 2.5 ms')!.gateMs).toBeCloseTo(5.021, 6);
    expect(gateHeaderOf('# Gate = 4.5 ms')!.gateMs).toBeCloseTo(4.5, 6);
    expect(gateHeaderOf('; gate length: 5ms')!.gateMs).toBeCloseTo(5, 6);
    // Those forms do not state a taper, and say so rather than inventing one.
    expect(gateHeaderOf('* bron: ARTA gated 5.021 ms')!.alpha).toBeNull();
  });

  it('honours only tapers whose effective duration is unambiguous', () => {
    expect(gateHeaderOf('* Right window = 5 ms, Rectangular')!.alpha).toBe(0);
    // A window we do not model leaves alpha null: assuming is what the default
    // is for, and it has to be visible that we assumed.
    expect(gateHeaderOf('* Right window = 5 ms, Blackman-Harris')!.alpha).toBeNull();
  });

  it('the two forms in Sanders own project agree with each other', () => {
    // His woofer files carry a hand-written "ARTA gated 5.021 ms"; the mid and
    // tweeter exports carry ARTA's own "Right window = 5,021 ms". Same session,
    // same window — so reading both has to give the same number, and that
    // agreement is what made the 4.5 ms stand out as not belonging to any file.
    const a = gateHeaderOf('* bron: ARTA gated 5.021 ms, ref time 2.5 ms')!.gateMs;
    const b = gateHeaderOf('* Right window = 5,021 ms, Tukey 0.25')!.gateMs;
    expect(a).toBe(b);
    expect(dataFloorFromGateMs(a, 0.25)!).toBeCloseTo(455.2, 1);
    // What the cabinet's 4.5 ms produced instead:
    expect(dataFloorFromGateMs(4.5, 0.25)!).toBeCloseTo(507.9, 1);
  });

  it('gateMsFromHeader stays a thin wrapper', () => {
    expect(gateMsFromHeader(arta)).toBeCloseTo(5.021, 6);
    expect(gateMsFromHeader('no window here')).toBeNull();
  });
});

describe('A3h — "states nothing" and "I could not read it" are different answers', () => {
  /* REAL HEADERS ONLY. Regex work against invented examples is how this was
   * introduced: the pattern matched everything I thought of and none of what
   * ARTA writes. Each string below is copied from a file in this repository or
   * from Sanders project. */
  const REAL = {
    // src/lib/parsers/fixtures/koan-3way/mid-hor0.txt (and his mid/tweeter .txt)
    arta: [
      '* Source file = mid hor 0.pir',
      '* Impulse length = 65536',
      '* Left window = 0 ms, Rectangular',
      '* Reference time = 2,5 ms',
      '* Right window = 5,021 ms, Tukey 0.25',
      '* Smoothing = None',
      '20.50781  84.11  -12.03',
    ].join('\n'),
    // src/lib/parsers/fixtures/koan-3way/woofer-pair-hor0.frd — Sanders own comment
    gateWord: [
      '* Koan 2951 - woofers W1+W2 complex gesommeerd, hor 0 graden',
      '* bron: ARTA gated 5.021 ms, ref time 2.5 ms - GELDIG BOVEN ~400 Hz',
      '20.5078  91.2  -44.1',
    ].join('\n'),
    // src/lib/parsers/fixtures/koan-3way/woofer-near.txt — near field, 1 s window
    nearField: [
      '* Left window = 5,813 ms, Rectangular',
      '* Right window = 1000 ms, Tukey 0.50',
      '10.0  110.4  -3.2',
    ].join('\n'),
    // A ZMA converted from LIMP: carries provenance, no window at all.
    none: [
      '* Converted from LIMP binary "mid.lim" by SD Acoustics Crossover Studio',
      '* freq(Hz) |Z|(ohm) phase(deg)',
      '19.95  6.71  12.4',
    ].join('\n'),
  };

  it('parsed: the ARTA form, with its taper', () => {
    const r = readGateHeader(REAL.arta);
    expect(r.kind).toBe('parsed');
    if (r.kind !== 'parsed') return;
    expect(r.gateMs).toBeCloseTo(5.021, 6);
    expect(r.alpha).toBeCloseTo(0.25, 6);
  });

  it('parsed: the form that does use the word "gate"', () => {
    const r = readGateHeader(REAL.gateWord);
    expect(r.kind).toBe('parsed');
    if (r.kind !== 'parsed') return;
    expect(r.gateMs).toBeCloseTo(5.021, 6);
    expect(r.alpha).toBeNull(); // it states no taper, and does not pretend to
  });

  it('parsed: a near-field 1000 ms window is read, and is simply not a floor', () => {
    // Read, reported, and then ignored by nearFieldMergedValidity — which has
    // no gate parameter at all. Even applied it would bound at 2.7 Hz.
    const r = readGateHeader(REAL.nearField);
    expect(r.kind).toBe('parsed');
    if (r.kind !== 'parsed') return;
    expect(r.gateMs).toBeCloseTo(1000, 6);
  });

  it('absent: a file that demonstrably says nothing about a window', () => {
    expect(readGateHeader(REAL.none).kind).toBe('absent');
    // A LEFT window alone is not a gate — and is not an error either.
    expect(readGateHeader('* Left window = 0 ms, Rectangular\n20 84 -12').kind).toBe('absent');
  });

  it('unparseable: something window-shaped that cannot be read, with the line', () => {
    const r = readGateHeader('* Right window = auto, Tukey 0.25\n20 84 -12');
    expect(r.kind).toBe('unparseable');
    if (r.kind !== 'unparseable') return;
    // The offending line travels with the verdict: a user cannot act on
    // "could not read your file", only on "this line, here".
    expect(r.line).toContain('Right window = auto');
    expect(r.why).toMatch(/no length|could not be read/);
  });

  it('the three kinds are exhaustive over every fixture in the repo', () => {
    for (const raw of Object.values(REAL)) {
      expect(['parsed', 'absent', 'unparseable']).toContain(readGateHeader(raw).kind);
    }
  });

  it('a global number can no longer stand in — and that is the point', () => {
    /* THE ARGUMENT FOR NEVER GUESSING, in numbers. Sanders cabinet field held
     * 4.5 ms (the mid gate from an earlier session at 935 mm). Substituted for
     * a measured 5.021 it produced 508 Hz instead of 455 — wrong, and entirely
     * plausible, so it survived five rounds of scrutiny. Had the field held
     * 12 ms the floor would have been 167 Hz and it would have been obvious
     * immediately. A plausibly wrong number is the dangerous one. */
    expect(dataFloorFromGateMs(5.021, 0.25)!).toBeCloseTo(455.2, 1);
    expect(dataFloorFromGateMs(4.5, 0.25)!).toBeCloseTo(507.9, 1);
    expect(dataFloorFromGateMs(12, 0.25)!).toBeCloseTo(190.5, 1);
    // And the file always wins: the ARTA header parses, so nothing else is
    // consulted for it.
    const r = readGateHeader(REAL.arta);
    expect(r.kind === 'parsed' && r.gateMs).not.toBe(4.5);
  });
});

/* ------------------------------------------------------------------ *
 * P-1 — a prose line with an "=" in a merge header is not a window line
 * ------------------------------------------------------------------ */

/**
 * THE FILES, NOT COPIES OF THEM. The block above uses inline strings on
 * purpose ("regex work against invented examples is how this was introduced"),
 * and that is right for the ARTA forms — they are stable and short. These are
 * not: the merge block is long, it is Sanders own, and the whole finding is
 * that THESE THREE FILES could not be optimised on. An inline copy could be
 * corrected into passing without the files ever changing.
 */
const CASUS1 = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures', 'casus1');
/* latin1, as `casus1.fixture.ts` reads them — these headers carry degree signs
 * and Dutch text, and utf8 would mangle bytes this test then matches on. */
const casus1 = (n: string) => readFileSync(join(CASUS1, n), 'latin1');

/** Sanders three NF/FF-merged responses (M-1). */
const MERGED = [
  'Koan_M_merged.frd',
  'Koan_W_up_merged_ingespeeld_mild.frd',
  'Koan_W_down_merged_ingespeeld_mild.frd',
] as const;

/** The five gated far fields the merges were built from. Nothing here may move. */
const GATED = [
  'mid_hor_0.txt',
  'mid_hor_30.txt',
  'tweeter_hor_0.txt',
  'woofer_up_hor_0.txt',
  'woofer_down_hor_0.txt',
] as const;

/** The near fields, which state a 1000 ms window that is read and then ignored. */
const NEAR = ['mid_near.txt', 'woofer_up_near.txt', 'woofer_down_near.txt'] as const;

describe('P-1 — the v1 window reader and the structured merge block', () => {
  it('the bug: all three merged files were read as carrying a broken window line', () => {
    /* WHAT IT COST. `readGateHeader` matched the bare word "gate" in
     *   "* Merge floor reason = … FF gate floor 396.7 Hz"
     * (the woofers: "the far-field gate (1/T = 396.7 Hz) applies only above
     * the splice"), found no "ms" on the line, and returned `unparseable`.
     * That is `verified: false`, which is what `refuseIfUnverified` refuses
     * on — so Optimize was blocked on a project whose files state their
     * validity in named fields. */
    for (const name of MERGED) {
      const r = readGateHeader(casus1(name));
      expect(r.kind, `${name}: a merge block is not a broken window`).not.toBe('unparseable');
      expect(r.kind, `${name}: and it states no window of its own`).toBe('absent');
    }
  });

  it('the counter-proof: the claim-detector still fires on genuine prose', () => {
    /* Without this the test above is also passed by a detector that has been
     * switched off. Same sentence, same missing "ms" — as an ordinary comment
     * rather than a `Merge …` field it is still a window-shaped line that
     * could not be read, and still says so. */
    const asMergeField = '* Merge floor reason = FF gate floor 396.7 Hz\n20 84 -12';
    const asProse = '* the far-field gate floor is 396.7 Hz\n20 84 -12';
    expect(readGateHeader(asMergeField).kind).toBe('absent');
    const r = readGateHeader(asProse);
    expect(r.kind).toBe('unparseable');
    if (r.kind !== 'unparseable') return;
    expect(r.why).toMatch(/no length in ms/);
  });

  it("the block's FF window is never taken as the merged file's own window", () => {
    /* THE NUMBER THAT MATTERS MOST. The block quotes the window of the FAR
     * FIELD it was built from — 5.021 ms → a 455 Hz floor. Read as this file's
     * window it would put the merge back on the gate it exists to get below,
     * and it would look completely plausible: the right number, off the right
     * measurement, on the wrong file.
     *
     * Today's spelling ("right 5.021 ms") happens not to match the ARTA
     * pattern, so the second line proves it is the FILTER and not that luck
     * doing the work: written the way ARTA writes it, it is still ignored. */
    const asWritten = '* Merge = NF/FF\n* Merge FF window = reference 2.5 ms, right 5.021 ms, Tukey 0.25\n20 84 -12';
    const artaSpelling = '* Merge = NF/FF\n* Merge FF window = Right window = 5,021 ms, Tukey 0.25\n20 84 -12';
    for (const text of [asWritten, artaSpelling]) {
      expect(readGateHeader(text).kind).toBe('absent');
      expect(gateHeaderOf(text)).toBeNull();
      expect(gateMsFromHeader(text)).toBeNull();
    }
    // And on the real files, for the same reason.
    for (const name of MERGED) expect(gateMsFromHeader(casus1(name))).toBeNull();
  });

  it('the five gated files are untouched — 5.021 ms, Tukey 0.25, as before', () => {
    for (const name of GATED) {
      const r = readGateHeader(casus1(name));
      expect(r.kind, name).toBe('parsed');
      if (r.kind !== 'parsed') continue;
      expect(r.gateMs, name).toBeCloseTo(5.021, 6);
      expect(r.alpha, name).toBeCloseTo(0.25, 6);
      expect(r.quote, name).toContain('Right window');
    }
    // The near fields too: read, and left for nearFieldMergedValidity to ignore.
    for (const name of NEAR) {
      const r = readGateHeader(casus1(name));
      expect(r.kind, name).toBe('parsed');
      if (r.kind !== 'parsed') continue;
      expect(r.gateMs, name).toBeCloseTo(1000, 6);
    }
    // None of them declares a merge, so none takes the merge path at all.
    for (const name of [...GATED, ...NEAR]) expect(readMergeBlock(casus1(name)), name).toBeNull();
  });

  it('the merge block is read, by field name, off the real files', () => {
    const mid = readMergeBlock(casus1('Koan_M_merged.frd'))!;
    expect(mid.kind).toBe('NF/FF');
    expect(mid.validFromHz).toBeCloseTo(60, 6);
    expect(mid.validToHz).toBeCloseTo(20000, 6);
    expect(mid.spliceBandHz).toEqual([500, 800]);
    expect(mid.nfSource).toBe('mid_near.txt');
    expect(mid.floorReason).toMatch(/sealed pod/);
    for (const name of ['Koan_W_up_merged_ingespeeld_mild.frd', 'Koan_W_down_merged_ingespeeld_mild.frd']) {
      const w = readMergeBlock(casus1(name))!;
      expect(w.validFromHz, name).toBeCloseTo(20.5, 6);
      expect(w.spliceBandHz, name).toEqual([500, 800]);
    }
  });

  it('"Valid from" alone is not a merge — A5b.1(i) keeps its front door', () => {
    /* A gated export that happens to carry `Valid from = 20 Hz` must not be
     * able to walk past its own gate floor through this reader. No
     * `Merge = …`, no merge — and the gated path answers, as it always did. */
    const gated = '* Right window = 5,021 ms, Tukey 0.25\n* Valid from = 20 Hz\n20 84 -12';
    expect(readMergeBlock(gated)).toBeNull();
    const r = readGateHeader(gated);
    expect(r.kind).toBe('parsed');
    if (r.kind !== 'parsed') return;
    expect(r.gateMs).toBeCloseTo(5.021, 6);
  });

  it('two readers of ONE convention: v1 and engine2 agree on the real files', () => {
    /* The duplication is real — the v1 layer may not import engine2 (the
     * toggle-invariant's dependency arrow), so the FIELD NAMES are shared and
     * the implementations are not. A test file may import both, and this is
     * what stops them drifting apart in silence. They do not even see the same
     * input: engine2 is handed comment lines with the marker already stripped,
     * this one is handed the raw file. */
    for (const name of MERGED) {
      const raw = casus1(name);
      const mine = readMergeBlock(raw)!;
      const theirs = parseArtaHeader(parseFrd(raw).meta.rawComments);
      expect(theirs.merge, name).toBeDefined();
      expect(mine.kind, name).toBe(theirs.merge!.kind);
      expect(mine.validFromHz, name).toBeCloseTo(theirs.statedValidity!.fromHz!, 6);
      expect(mine.validToHz, name).toBeCloseTo(theirs.statedValidity!.toHz!, 6);
      expect(mine.spliceBandHz, name).toEqual(theirs.merge!.spliceBandHz);
      expect(mine.ffSource, name).toBe(theirs.merge!.ffSource);
    }
  });

  it('the band: the stated floor, raised by the data and never lowered past it', () => {
    const mid = readMergeBlock(casus1('Koan_M_merged.frd'))!;
    const plain = declaredMergeValidity(mid, { fromHz: 20.5078125, toHz: 20000 });
    expect(plain.validity.fromHz).toBeCloseTo(60, 6);
    expect(plain.validity.reason).toMatch(/valid from a stated 60 Hz/);
    // Data that starts ABOVE the claim wins: a band may not reach past its numbers.
    const clipped = declaredMergeValidity(mid, { fromHz: 100, toHz: 20000 });
    expect(clipped.validity.fromHz).toBeCloseTo(100, 6);
    expect(clipped.notes.join(' ')).toMatch(/the data wins/);
    // `Valid to` narrows and never raises.
    expect(declaredMergeValidity(mid, { fromHz: 20.5, toHz: 40000 }).validity.toHz).toBeCloseTo(20000, 6);
    expect(declaredMergeValidity(mid, { fromHz: 20.5, toHz: 15000 }).validity.toHz).toBeCloseTo(15000, 6);
  });

  it('the app CALLS it — a source scan, because a rule the UI skips is no rule', () => {
    /* THE UI-1 / E-3b LESSON. Everything above tests the decision; none of it
     * can see whether `App.tsx` asks. That gap is exactly how the Working tab
     * spent months loading `rankChain3Results[0]`, and it is why the two
     * consumers get pinned here by name rather than assumed. */
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf8');

    // 1. The source ledger asks, and asks BEFORE the gated path answers.
    const merge = app.indexOf('const mb = readMergeBlock(l.raw);');
    const gated = app.indexOf('const gr = readGateHeader(l.raw);');
    expect(merge, 'sourceMeta consults the merge block').toBeGreaterThan(-1);
    expect(gated, 'and still has its gated path').toBeGreaterThan(-1);
    expect(merge, 'a declared merge is answered before 2/T is reached').toBeLessThan(gated);
    expect(app).toContain('declaredMergeValidity(mb,');

    // 2. The window derivation asks too — otherwise rule 1 silently stops
    //    clamping on exactly these files, which is the permissive direction.
    expect(app).toContain('const dm = src === \'nearfield-merged\' && l ? readMergeBlock(l.raw) : null;');

    // 3. NEITHER is behind the v2 toggle. This is a v1 bug and its fix lives
    //    in v1; a fix that only applied with Engine v2 on would leave the
    //    reported symptom exactly where it was.
    for (const call of ['readMergeBlock(l.raw)']) {
      for (let i = app.indexOf(call); i !== -1; i = app.indexOf(call, i + 1)) {
        const line = app.lastIndexOf('\n', app.lastIndexOf('\n', i - 1) - 1);
        expect(app.slice(Math.max(0, line), i)).not.toContain('engineV2Enabled');
      }
    }
  });

  it('a merge with no stated floor is UNKNOWN, not fine', () => {
    /* The permissive failure this whole area exists to prevent: "merged,
     * therefore honest low down" is the assumption with nothing behind it. A
     * null floor is what keeps the source unverified in App.tsx. */
    const bare = readMergeBlock('* Merge = NF/FF\n* Merge NF source = x.txt\n20 84 -12')!;
    expect(bare.validFromHz).toBeNull();
    const v = declaredMergeValidity(bare, { fromHz: 20, toHz: 20000 });
    expect(v.validity.fromHz).toBeNull();
    expect(v.validity.reason).toMatch(/UNKNOWN, not absent/);
  });
});
