import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ifftInPlace } from './fft.ts';
import { parseFrd } from './parsers/frd.ts';
import { PirParseError, parsePir, writePir } from './parsers/pir.ts';
import {
  FIT_RESIDUAL_FLAG_DEG,
  MergeV2Error,
  NF_MERGE_V2_VERSION,
  arrivalMs,
  besselJ1,
  impulseFromFrd,
  impulseFromPir,
  mergeImpulsesV2,
  planeEchoDelayS,
  type Gate,
  type Impulse,
  type MergeV2Input,
  type PlaneEcho,
} from './nfMergeV2.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', '..', 'test-fixtures');

/* ------------------------------------------------------------------ *
 * Synthetic source with a KNOWN answer
 * ------------------------------------------------------------------ */

const FS = 48000;
const N = 16384;
const C = 343;

type Cx = [number, number];
const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

/** Real impulse of length N whose spectrum is `h(f)` (bins 0..N/2). */
function impulseOf(h: (f: number) => Cx): Float64Array {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let k = 0; k <= N / 2; k++) {
    const [r, i] = h((k * FS) / N);
    re[k] = r;
    im[k] = i;
    if (k > 0 && k < N / 2) {
      re[N - k] = r;
      im[N - k] = -i;
    }
  }
  im[0] = 0;
  im[N / 2] = 0;
  ifftInPlace(re, im);
  return re;
}

/** A woofer-like band-pass: 2nd-order high-pass at 45 Hz, 2nd-order low-pass at 1.6 kHz. */
const driver = (f: number): Cx => {
  const s: Cx = [0, f];
  const hp = cdiv(cmul([0, f / 45], [0, f / 45]), [1 - (f / 45) ** 2, f / 45 / 0.707]);
  const lp = cdiv([1, 0], [1 - (f / 1600) ** 2, f / 1600 / 0.707]);
  void s;
  return cmul(hp, lp);
};
const delay = (f: number, t: number): Cx => [Math.cos(-2 * Math.PI * f * t), Math.sin(-2 * Math.PI * f * t)];
const an4 = (f: number, f0: number): Cx => cdiv([1, f / f0], [2, f / f0]);
const planeTerm = (f: number, e: PlaneEcho): Cx => {
  const rd = Math.hypot(e.horizontalM, e.micAboveM - e.sourceAboveM);
  const ri = Math.hypot(e.horizontalM, e.micAboveM + e.sourceAboveM);
  const d = delay(f, (ri - rd) / C);
  return [1 + (rd / ri) * d[0], (rd / ri) * d[1]];
};

const NEAR_T0 = 0.006; // the near impulse sits 6 ms into its record (a dual-channel latency)
const TRUE_TAU = 0.0029137; // near → far shift, s
const TRUE_GAIN = 0.04;
const F0 = 120;
const ECHO: PlaneEcho = { kind: 'plane', label: 'tafel', sourceAboveM: 0.3, micAboveM: 0.88, horizontalM: 1.0 };

function synth(opts: { echo?: PlaneEcho | null; invert?: boolean }) {
  const near = impulseOf((f) => cmul(driver(f), delay(f, NEAR_T0)));
  const far = impulseOf((f) => {
    let h = cmul(cmul(driver(f), delay(f, NEAR_T0 + TRUE_TAU)), an4(f, F0));
    if (opts.echo) h = cmul(h, planeTerm(f, opts.echo));
    const g = TRUE_GAIN * (opts.invert ? -1 : 1);
    return [h[0] * g, h[1] * g];
  });
  const mk = (name: string, samples: Float64Array): Impulse => ({
    name,
    sampleRate: FS,
    samples,
    timeBase: 'session',
    alreadyGated: false,
    session: 'synth',
  });
  return { near: mk('near', near), far: mk('far', far) };
}

const gateFor = (far: Impulse): Gate => ({
  referenceMs: arrivalMs(far) - 0.4,
  leftMs: 2.5,
  rightMs: 2.521,
  rightTaper: 0.25,
});

function input(over: Partial<MergeV2Input> & { far: Impulse; near: Impulse }): MergeV2Input {
  return {
    gate: gateFor(over.far),
    model: { kind: 'an4', f0Hz: F0 },
    echoes: [],
    sdCm2: null,
    fitBandHz: [300, 576],
    spliceBandHz: [400, 550],
    output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
    ...over,
  };
}

describe(`nfMergeV2 (${NF_MERGE_V2_VERSION}) — synthetic source, known answer`, () => {
  it('recovers delay and gain with a matched gate and a fixed offset', () => {
    const { near, far } = synth({});
    const r = mergeImpulsesV2(input({ near, far }));
    expect(Math.abs(r.fit.delayMs - TRUE_TAU * 1000)).toBeLessThan(0.002);
    expect(Math.abs(r.fit.gainDb - 20 * Math.log10(TRUE_GAIN))).toBeLessThan(0.05);
    expect(r.fit.polarityDeg).toBe(0);
    expect(r.fit.residualRmsDeg).toBeLessThan(0.5);
    expect(r.flags).toEqual([]);
  });

  it('reports an inverted far field as 180°, and says so', () => {
    const { near, far } = synth({ invert: true });
    const r = mergeImpulsesV2(input({ near, far }));
    expect(r.fit.polarityDeg).toBe(180);
    expect(Math.abs(r.fit.delayMs - TRUE_TAU * 1000)).toBeLessThan(0.002);
    expect(r.flags.some((f) => /opposite polarity/.test(f))).toBe(true);
  });

  it('explains an echo inside the gate when its geometry is STATED', () => {
    const { near, far } = synth({ echo: ECHO });
    expect(planeEchoDelayS(ECHO) * 1000).toBeLessThan(2.5); // it really is inside the gate
    const r = mergeImpulsesV2(input({ near, far, echoes: [ECHO] }));
    expect(r.fit.residualRmsDeg).toBeLessThan(0.5);
    expect(Math.abs(r.fit.delayMs - TRUE_TAU * 1000)).toBeLessThan(0.002);
    expect(r.flags).toEqual([]);
  });

  it('an unstated echo too close to resolve is caught by the residual, not fitted away', () => {
    const { near, far } = synth({ echo: ECHO });
    const r = mergeImpulsesV2(input({ near, far, echoes: [] }));
    expect(r.fit.residualRmsDeg).toBeGreaterThan(FIT_RESIDUAL_FLAG_DEG);
    expect(r.flags.some((f) => /does not explain/.test(f))).toBe(true);
    expect(r.notes.some((n) => /cannot be told apart/.test(n))).toBe(true);
  });

  it('an unstated echo the band CAN resolve is named, with its delay', () => {
    const far2: PlaneEcho = { kind: 'plane', label: 'vloer', sourceAboveM: 0.45, micAboveM: 1.2, horizontalM: 1.0 };
    const { near, far } = synth({ echo: far2 });
    const dt = planeEchoDelayS(far2) * 1000;
    const r = mergeImpulsesV2(input({ near, far, echoes: [], fitBandHz: [300, 1200], spliceBandHz: [400, 1000] }));
    const found = r.echoesFound!.find((e) => Math.abs(e.afterDirectMs - dt) < 0.15);
    expect(found).toBeDefined();
    expect(found!.modelled).toBe(false);
    const stated = mergeImpulsesV2(input({ near, far, echoes: [far2], fitBandHz: [300, 1200], spliceBandHz: [400, 1000] }));
    expect(stated.fit.residualRmsDeg).toBeLessThan(0.5);
  });

  it('wrong geometry is visible in the residual', () => {
    const { near, far } = synth({ echo: ECHO });
    const right = mergeImpulsesV2(input({ near, far, echoes: [ECHO] }));
    const wrong = mergeImpulsesV2(input({ near, far, echoes: [{ ...ECHO, micAboveM: ECHO.micAboveM + 0.1 }] }));
    expect(wrong.fit.residualRmsDeg).toBeGreaterThan(right.fit.residualRmsDeg + 1);
  });

  it('checks the fitted delay against the session time base', () => {
    const { near, far } = synth({});
    const r = mergeImpulsesV2(input({ near, far }));
    expect(r.timing).not.toBeNull();
    // impulse peaks, not onsets: a band-passed woofer peaks late — noted, not flagged
    expect(Math.abs(r.timing!.differenceUs)).toBeLessThan(150);
    expect(r.flags).toEqual([]);
  });

  it('flags a cross-session merge from the stated labels', () => {
    const { near, far } = synth({});
    const r = mergeImpulsesV2(input({ near: { ...near, session: 'testkast 11-09' }, far: { ...far, session: 'augustus' } }));
    expect(r.flags.some((f) => /Cross-session/.test(f))).toBe(true);
  });

  it('output phase is referenced to the gate reference', () => {
    const { near, far } = synth({});
    const g = gateFor(far);
    const r = mergeImpulsesV2(input({ near, far, gate: g }));
    // well above the splice the output is the far field; its phase re the reference stays within a turn
    const i = r.freq.findIndex((f) => f > 1000);
    const lateMs = arrivalMs(far) - g.referenceMs;
    expect(lateMs).toBeGreaterThan(0.3);
    expect(Number.isFinite(r.phaseDeg[i])).toBe(true);
  });
});

describe('nfMergeV2 — refuses rather than guesses (P4)', () => {
  const { near, far } = synth({});
  it('sample-rate mismatch names the field', () => {
    expect(() => mergeImpulsesV2(input({ near: { ...near, sampleRate: 44100 }, far }))).toThrowError(MergeV2Error);
    try {
      mergeImpulsesV2(input({ near: { ...near, sampleRate: 44100 }, far }));
    } catch (e) {
      expect((e as MergeV2Error).field).toBe('near.sampleRate');
    }
  });
  it('an unstated gate is refused', () => {
    const g = { ...gateFor(far), referenceMs: Number.NaN };
    expect(() => mergeImpulsesV2(input({ near, far, gate: g }))).toThrowError(/Gate referenceMs is not stated/);
  });
  it('a port without a weight is refused', () => {
    expect(() => mergeImpulsesV2(input({ near, far, port: { impulse: near, weight: 0 } }))).toThrowError(/weight/);
  });
  it('an echo without geometry is refused', () => {
    expect(() => mergeImpulsesV2(input({ near, far, echoes: [{ ...ECHO, micAboveM: 0 }] }))).toThrowError(/needs source height/);
  });
  it('a log-spaced FRD is not rebuilt into an impulse', () => {
    const freq = Array.from({ length: 64 }, (_, i) => 20 * 1.1 ** i);
    expect(() =>
      impulseFromFrd({ name: 'log.frd', freq, splDb: freq.map(() => 80), phaseDeg: freq.map(() => 0), sampleRate: FS, length: N, alreadyGated: true }),
    ).toThrowError(/uniform linear grid/);
  });
});

describe('parsers/pir', () => {
  it('round-trips a written impulse', () => {
    const x = Float64Array.from({ length: 256 }, (_, i) => Math.sin(i / 7) * 0.5);
    const p = parsePir(writePir({ sampleRate: 48000, samples: x }));
    expect(p.sampleRate).toBe(48000);
    expect(p.measurementType).toBe('dual-channel');
    expect(p.samples.length).toBe(256);
    expect(Math.max(...Array.from(p.samples, (v, i) => Math.abs(v - x[i])))).toBeLessThan(1e-6);
  });
  it('refuses a file that is not a .pir', () => {
    expect(() => parsePir(new Uint8Array(100))).toThrowError(PirParseError);
  });
  it('J1 matches tabulated values', () => {
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 7);
    expect(besselJ1(5)).toBeCloseTo(-0.3275791376, 7);
    expect(besselJ1(10)).toBeCloseTo(0.0434727462, 6);
  });
});

/* ------------------------------------------------------------------ *
 * Casus 1 — one acceptance case, not the design target
 * ------------------------------------------------------------------ */

const pir = (name: string, session: string): Impulse =>
  impulseFromPir(name, parsePir(readFileSync(join(FIX, 'casus1_pir', `${name}.pir`))), session);

describe('casus 1 — August session, raw .pir, near and far field from the SAME session', () => {
  const S = 'casus1 augustus';
  const gate = (far: Impulse): Gate => ({ referenceMs: arrivalMs(far) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 });

  it('every impulse is dual-channel: one time base for the whole session', () => {
    for (const n of ['tweeter_hor_0', 'mid_hor_0', 'mid_near', 'woofer_up_hor_0', 'woofer_up_near', 'woofer_down_hor_0', 'woofer_down_near', 'poort_near']) {
      expect(pir(n, S).timeBase).toBe('session');
    }
  });

  for (const [name, f0, band, maxDeg] of [
    ['woofer_down', 150, [300, 576], 7],
    ['woofer_up', 150, [300, 576], 3],
    ['mid', 200, [300, 800], 6],
  ] as const) {
    it(`${name}: matched gate, offset fixed — residual under ${maxDeg}° and below the flag`, () => {
      const far = pir(`${name}_hor_0`, S);
      const near = pir(`${name}_near`, S);
      const r = mergeImpulsesV2({
        far,
        near,
        gate: gate(far),
        model: { kind: 'an4', f0Hz: f0 },
        echoes: [],
        sdCm2: null,
        fitBandHz: [band[0], band[1]],
        spliceBandHz: [band[0] + 100, band[1] - 26],
        output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
      });
      expect(r.fit.polarityDeg).toBe(0);
      expect(r.fit.residualRmsDeg).toBeLessThan(maxDeg);
      expect(r.fit.residualRmsDeg).toBeLessThan(FIT_RESIDUAL_FLAG_DEG);
      expect(r.timing).not.toBeNull();
      // a clean same-session merge raises nothing: the self-diagnosis must not cry wolf
      expect(r.flags).toEqual([]);
    }, 60_000);
  }

  for (const name of ['woofer_down', 'woofer_up'] as const) {
    it(`${name} + port (August poort_near.pir, weight 0.205 stated): still clean, same delay`, () => {
      const far = pir(`${name}_hor_0`, S);
      const base = {
        far,
        near: pir(`${name}_near`, S),
        gate: gate(far),
        model: { kind: 'an4', f0Hz: 150 } as const,
        echoes: [],
        sdCm2: null,
        fitBandHz: [300, 576] as [number, number],
        spliceBandHz: [400, 550] as [number, number],
        output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
      };
      const without = mergeImpulsesV2(base);
      const withPort = mergeImpulsesV2({ ...base, port: { impulse: pir('poort_near', S), weight: 0.205 } });
      expect(withPort.fit.residualRmsDeg).toBeLessThan(FIT_RESIDUAL_FLAG_DEG);
      expect(withPort.flags).toEqual([]);
      // the port lives below the splice: it must not move the fitted delay
      expect(Math.abs(withPort.fit.delayMs - without.fit.delayMs)).toBeLessThan(0.01);
    }, 60_000);
  }
});

describe('casus 1 — the I-2 woofer merge (September near field on an August far field) is FLAGGED', () => {
  it('cross-session and an unexplained residual, where v1 accepted it with a −71° offset', () => {
    const frd = (path: string) => parseFrd(readFileSync(join(FIX, path), 'latin1'));
    const farF = frd('casus1/woofer_down_hor_0.txt');
    const nearF = frd('koan_2026-09_testkast/woofer_down_near.txt');
    const portF = frd('koan_2026-09_testkast/port_near.txt');
    const L = 65536;
    const far = impulseFromFrd({ name: 'woofer_down_hor_0.txt', freq: farF.freq, splDb: farF.spl, phaseDeg: farF.phase, sampleRate: 48000, length: L, alreadyGated: true, session: 'augustus' });
    const near = impulseFromFrd({ name: 'woofer_down_near.txt', freq: nearF.freq, splDb: nearF.spl, phaseDeg: nearF.phase, sampleRate: 48000, length: L, alreadyGated: false, session: 'testkast 11-09' });
    const port = impulseFromFrd({ name: 'port_near.txt', freq: portF.freq, splDb: portF.spl, phaseDeg: portF.phase, sampleRate: 48000, length: L, alreadyGated: false, session: 'testkast 11-09' });
    const r = mergeImpulsesV2({
      far,
      near,
      port: { impulse: port, weight: 0.205 },
      // the FRD's own window: reference 2.5 ms (now sample 0), left 0 ms, right 5.021 ms, Tukey 0.25
      gate: { referenceMs: 0, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
      model: { kind: 'an4', f0Hz: 150 },
      echoes: [],
      sdCm2: null,
      fitBandHz: [300, 576],
      spliceBandHz: [400, 550],
      output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
    });
    expect(r.flags.some((f) => /Cross-session/.test(f))).toBe(true);
    expect(r.fit.residualRmsDeg).toBeGreaterThan(FIT_RESIDUAL_FLAG_DEG);
    expect(r.flags.some((f) => /does not explain/.test(f))).toBe(true);
    expect(r.timing).toBeNull(); // FRDs carry no shared time base
  }, 60_000);
});

/* ------------------------------------------------------------------ *
 * I-4 fase 2: section D of tools/nf_merge_reference.py, pinned
 * ------------------------------------------------------------------ */

// The independent numpy implementation (section D, same session, matched gate, offset fixed,
// handoff above fitHi·2^(1/6..2/3)), printed to five / three / four decimals on 13-11-2026.
// The suite's own bounds above stay as they are; these are the acceptance numbers of the
// startprompt (±0.2°, ±0.02 dB, zero flags). The delay has no tolerance in the prompt: ±2 µs,
// the precision the synthetic tests already ask of τ.
const SECTION_D = [
  { name: 'woofer_down', port: 0, f0: 150, band: [300, 576], tauMs: 3.28225, deg: 2.183, db: 0.2119 },
  { name: 'woofer_down', port: 0.205, f0: 150, band: [300, 576], tauMs: 3.28075, deg: 2.173, db: 0.2334 },
  { name: 'woofer_up', port: 0, f0: 150, band: [300, 576], tauMs: 2.91625, deg: 2.315, db: 0.57 },
  { name: 'woofer_up', port: 0.205, f0: 150, band: [300, 576], tauMs: 2.9145, deg: 2.332, db: 0.5968 },
  { name: 'mid', port: 0, f0: 200, band: [300, 800], tauMs: 2.83325, deg: 3.508, db: 0.5616 },
] as const;

describe('casus 1 — section D of the reference script, within ±0.2° / ±0.02 dB and zero flags', () => {
  const S = 'casus1 augustus';
  it.each(SECTION_D)('$name, port weight $port', (row) => {
    const far = pir(`${row.name}_hor_0`, S);
    const r = mergeImpulsesV2({
      far,
      near: pir(`${row.name}_near`, S),
      ...(row.port ? { port: { impulse: pir('poort_near', S), weight: row.port } } : {}),
      gate: { referenceMs: arrivalMs(far) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
      model: { kind: 'an4', f0Hz: row.f0 },
      echoes: [],
      sdCm2: null,
      fitBandHz: [row.band[0], row.band[1]],
      spliceBandHz: [row.band[0] + 100, row.band[1] - 26],
      output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
    });
    expect(r.fit.polarityDeg).toBe(0);
    expect(Math.abs(r.fit.delayMs - row.tauMs)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(r.fit.residualRmsDeg - row.deg)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(r.fit.residualRmsDb - row.db)).toBeLessThanOrEqual(0.02);
    expect(r.flags).toEqual([]);
  }, 60_000);
});

describe('casus 1 — the I-2 combination raises the cross-session flag on BOTH woofers', () => {
  // Startprompt acceptance 3 as corrected on 13-11-2026: both woofers get the session flag.
  // Only that is pinned here: it holds whatever the gate, because it reads the session labels.
  it.each(['woofer_down', 'woofer_up'] as const)('%s', (w) => {
    const frd = (path: string) => parseFrd(readFileSync(join(FIX, path), 'latin1'));
    const mk = (path: string, gated: boolean, session: string): Impulse => {
      const f = frd(path);
      return impulseFromFrd({ name: path, freq: f.freq, splDb: f.spl, phaseDeg: f.phase, sampleRate: 48000, length: 65536, alreadyGated: gated, session });
    };
    const r = mergeImpulsesV2({
      far: mk(`casus1/${w}_hor_0.txt`, true, 'augustus'),
      near: mk(`koan_2026-09_testkast/${w}_near.txt`, false, 'testkast 11-09'),
      port: { impulse: mk('koan_2026-09_testkast/port_near.txt', false, 'testkast 11-09'), weight: 0.205 },
      gate: { referenceMs: 0, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
      model: { kind: 'an4', f0Hz: 150 },
      echoes: [],
      sdCm2: null,
      fitBandHz: [300, 576],
      spliceBandHz: [400, 550],
      output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
    });
    expect(r.flags.some((f) => /Cross-session/.test(f))).toBe(true);
  }, 60_000);
});
