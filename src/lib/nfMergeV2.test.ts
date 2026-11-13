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
  gateFromArtaHeader,
  GATE_TAIL_FLAG_DB,
  impulseFromFrd,
  impulseFromPir,
  mergeImpulsesV2,
  planeEchoDelayS,
  type Gate,
  type Impulse,
  type MergeV2Input,
  type BoundaryTerm,
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

  // V55/V60 (Sander akkoord 13-11-2026): a different session is a NOTE, not a flag. It costs the
  // shared time base, not the merge. Was: "flags a cross-session merge from the stated labels".
  it('notes a cross-session merge from the stated labels, and never flags it — the port\'s session included', () => {
    const { near, far } = synth({});
    const r = mergeImpulsesV2(input({ near: { ...near, session: 'testkast 11-09' }, far: { ...far, session: 'augustus' } }));
    expect(r.flags).toEqual([]);
    expect(r.notes.some((n) => /different sessions .*no shared time base, the delay is fitted only/.test(n))).toBe(true);
    // the port is a third session to compare: near and far agree, the port does not
    const p = mergeImpulsesV2(input({ near, far, port: { impulse: { ...near, session: 'later' }, weight: 0.2 } }));
    expect(p.notes.some((n) => /different sessions .*port "later"/.test(n))).toBe(true);
    expect(p.flags).toEqual([]);
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

/* ------------------------------------------------------------------ *
 * I-4 fase 2, acceptance 3 (V60): the gate is read correctly, and the
 * self-diagnosis points at the real cause
 * ------------------------------------------------------------------ */

// The header as written, read field by field: what a reader takes from the file.
function artaHeaderOf(path: string): { leftWindowMs: number; referenceTimeMs: number; rightWindowMs: number; rightTaper: number } {
  const text = readFileSync(join(FIX, path), 'latin1');
  const num = (name: string): number => {
    const m = new RegExp(`^\\*\\s*${name}\\s*=\\s*([0-9]+(?:[.,][0-9]+)?)`, 'm').exec(text);
    if (!m) throw new Error(`${path}: no "${name}"`);
    return Number(m[1].replace(',', '.'));
  };
  const taper = /^\*\s*Right window\s*=.*Tukey\s*([0-9.]+)/m.exec(text);
  return { leftWindowMs: num('Left window'), referenceTimeMs: num('Reference time'), rightWindowMs: num('Right window'), rightTaper: taper ? Number(taper[1]) : 0 };
}
// V56: the far-field FRDs of casus 1 were exported from impulses shifted by 6.25 ms; their
// reference (phase zero) sits on the raw PIR at 8.750 ms — measured by cross-correlation, the
// same position for all three drivers. This is where the PIR route puts the same gate.
const AUGUST_FAR_REFERENCE_ON_PIR_MS = 8.75;

const frdImpulse = (path: string, gated: boolean, session: string): Impulse => {
  const f = parseFrd(readFileSync(join(FIX, path), 'latin1'));
  return impulseFromFrd({ name: path, freq: f.freq, splDb: f.spl, phaseDeg: f.phase, sampleRate: 48000, length: 65536, alreadyGated: gated, session });
};
const DRIVERS = [
  { name: 'woofer_down', f0: 150, band: [300, 576] },
  { name: 'woofer_up', f0: 150, band: [300, 576] },
  { name: 'mid', f0: 200, band: [300, 800] },
] as const;
const mergeOpts = (d: (typeof DRIVERS)[number]) => ({
  model: { kind: 'an4' as const, f0Hz: d.f0 },
  echoes: [],
  sdCm2: null,
  fitBandHz: [d.band[0], d.band[1]] as [number, number],
  spliceBandHz: [d.band[0] + 100, d.band[1] - 26] as [number, number],
  output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
});

describe('V60 (a) — the FRD route and the PIR route agree under the gate the header states', () => {
  // Route 1: far field rebuilt from casus1/<driver>_hor_0.txt (already gated), near field from
  //          casus1/<driver>_near.txt; gate = the header, Left/Right as lengths, reference at 0.
  // Route 2: far and near field from the raw August PIRs; the SAME gate, reference at 8.750 ms.
  it.each(DRIVERS)('$name: within 1°', (d) => {
    const h = artaHeaderOf(`casus1/${d.name}_hor_0.txt`);
    expect(h).toEqual({ leftWindowMs: 0, referenceTimeMs: 2.5, rightWindowMs: 5.021, rightTaper: 0.25 });
    const viaFrd = mergeImpulsesV2({
      ...mergeOpts(d),
      far: frdImpulse(`casus1/${d.name}_hor_0.txt`, true, 'augustus'),
      near: frdImpulse(`casus1/${d.name}_near.txt`, false, 'augustus'),
      gate: gateFromArtaHeader(h, 0),
    });
    const viaPir = mergeImpulsesV2({
      ...mergeOpts(d),
      far: pir(`${d.name}_hor_0`, 'augustus'),
      near: pir(`${d.name}_near`, 'augustus'),
      gate: gateFromArtaHeader(h, AUGUST_FAR_REFERENCE_ON_PIR_MS),
    });
    expect(Math.abs(viaFrd.fit.residualRmsDeg - viaPir.fit.residualRmsDeg)).toBeLessThan(1);
    // read correctly, the far field is silent after the edge: no tail flag, the note says so
    expect(viaFrd.flags.some((f) => /after the stated gate/.test(f))).toBe(false);
    expect(viaFrd.notes.some((n) => /gate matches the file/.test(n))).toBe(true);
  }, 60_000);
});

describe('V60 (b) — a misread gate (right edge at Right window − Reference time) makes the self-diagnosis fire', () => {
  // What engine2 and section C read before V60: right edge 2.521 ms after the reference, left 2.5 ms.
  const misread = { referenceMs: 0, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 };
  it.each(DRIVERS)('$name: the tail check names the gate', (d) => {
    const r = mergeImpulsesV2({
      ...mergeOpts(d),
      far: frdImpulse(`casus1/${d.name}_hor_0.txt`, true, 'augustus'),
      near: frdImpulse(`casus1/${d.name}_near.txt`, false, 'augustus'),
      gate: misread,
    });
    const tail = r.flags.find((f) => /after the stated gate/.test(f));
    expect(tail).toBeDefined();
    expect(tail).toMatch(/V60/);
    expect(GATE_TAIL_FLAG_DB).toBe(-30);
  }, 60_000);
  it('woofer_down: the residual flag puts the header first among the causes', () => {
    const d = DRIVERS[0];
    const r = mergeImpulsesV2({
      ...mergeOpts(d),
      far: frdImpulse(`casus1/${d.name}_hor_0.txt`, true, 'augustus'),
      near: frdImpulse(`casus1/${d.name}_near.txt`, false, 'augustus'),
      gate: misread,
    });
    const res = r.flags.find((f) => /does not explain/.test(f));
    expect(res).toBeDefined();
    expect(res!.indexOf('read correctly from the header')).toBeLessThan(res!.indexOf('echo'));
  }, 60_000);
});

describe('V55/V60 (c) — the September near field on the August far field merges cleanly; the session is a note', () => {
  // Far field: raw August PIR, section D's gate. Near field and port: the September FRDs
  // (koan_2026-09_testkast, one woofer driven — M-2). Measured 13-11-2026: 2.93° and 1.97°.
  it.each([
    { name: 'woofer_down', deg: 2.93 },
    { name: 'woofer_up', deg: 1.97 },
  ] as const)('$name: $deg°, no flag, and the note names all three sessions', (row) => {
    const far = pir(`${row.name}_hor_0`, 'augustus');
    const r = mergeImpulsesV2({
      ...mergeOpts(DRIVERS[0]),
      far,
      near: frdImpulse(`koan_2026-09_testkast/${row.name}_near.txt`, false, 'testkast 11-09'),
      port: { impulse: frdImpulse('koan_2026-09_testkast/port_near.txt', false, 'testkast 11-09'), weight: 0.205 },
      gate: { referenceMs: arrivalMs(far) - 0.4, leftMs: 2.5, rightMs: 2.521, rightTaper: 0.25 },
    });
    expect(Math.abs(r.fit.residualRmsDeg - row.deg)).toBeLessThanOrEqual(0.2);
    expect(r.flags).toEqual([]);
    expect(r.notes.some((n) => /different sessions .*no shared time base, the delay is fitted only/.test(n))).toBe(true);
    expect(r.notes.some((n) => /port "testkast 11-09"/.test(n))).toBe(true);
    expect(r.notes.join(' ')).not.toMatch(/71°/);
  }, 60_000);
});

describe('V60 (d) — on the long gate the stated floor explains woofer_down', () => {
  // PIR route, the gate the far-field FRD was exported with (reference on the PIR at 8.750 ms,
  // left 0, right 5.021, Tukey 0.25), AN4 f0 150 Hz, 300–576 Hz, no port. Geometry stated by
  // Sander on 13-11-2026: floor; woofer_down acoustic centre 0.794 m above it, mic 1.380 m,
  // 1.0 m horizontal; Sd 255 cm². Measured: 8.34° / 0.656 dB with 2 flags → 3.73° / 0.250 dB, none.
  const run = (echoes: readonly PlaneEcho[]) => {
    const far = pir('woofer_down_hor_0', 'augustus');
    return mergeImpulsesV2({
      far,
      near: pir('woofer_down_near', 'augustus'),
      gate: { referenceMs: AUGUST_FAR_REFERENCE_ON_PIR_MS, leftMs: 0, rightMs: 5.021, rightTaper: 0.25 },
      model: { kind: 'an4', f0Hz: 150 },
      echoes,
      sdCm2: 255,
      fitBandHz: [300, 576],
      spliceBandHz: [400, 550],
      output: { fromHz: 20, toHz: 2000, pointsPerOctave: 24 },
    });
  };
  const floor: PlaneEcho = { kind: 'plane', label: 'vloer', sourceAboveM: 0.794, micAboveM: 1.38, horizontalM: 1.0 };

  it('without the plane: the finder names an echo inside the gate near the floor delay', () => {
    const r = run([]);
    expect(Math.abs(r.fit.residualRmsDeg - 8.34)).toBeLessThanOrEqual(0.2);
    expect(r.flags.some((f) => /echo .* inside the gate/.test(f))).toBe(true);
    const delayMs = planeEchoDelayS(floor) * 1000;
    expect(r.echoesFound!.some((e) => e.insideGate && Math.abs(e.afterDirectMs - delayMs) < 0.1)).toBe(true);
  }, 60_000);

  it('with the floor stated: 3.73° / 0.250 dB, zero flags', () => {
    const r = run([floor]);
    expect(Math.abs(r.fit.residualRmsDeg - 3.73)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(r.fit.residualRmsDb - 0.25)).toBeLessThanOrEqual(0.02);
    expect(r.flags).toEqual([]);
  }, 60_000);
});

/* ------------------------------------------------------------------ *
 * I-4: reflections per SOURCE — the port has its own height, its own image
 * ------------------------------------------------------------------ */

describe('reflections per source — a port at a known, different height (synthetic, known answer)', () => {
  // Cone echo: ECHO (source 0.30 m above the plane, mic 0.88 m, 1.0 m) — 1.14 ms after the direct sound.
  // Port mouth 0.15 m above the same plane: its image arrives at 0.58 ms. Both inside the gate.
  const PORT_ECHO: PlaneEcho = { ...ECHO, label: 'tafel (poort)', sourceAboveM: 0.15 };
  const PORT_W = 0.5;
  const port = (f: number): Cx => cdiv([1, 0], [1 - (f / 500) ** 2, f / 500 / 0.5]); // a resonant low-pass
  const build = () => {
    const near = impulseOf((f) => cmul(driver(f), delay(f, NEAR_T0)));
    const portNear = impulseOf((f) => cmul(port(f), delay(f, NEAR_T0)));
    const far = impulseOf((f) => {
      const common = cmul(delay(f, NEAR_T0 + TRUE_TAU), an4(f, F0));
      const c = cmul(driver(f), planeTerm(f, ECHO));
      const pp = cmul(port(f), planeTerm(f, PORT_ECHO));
      const h = cmul(common, [c[0] + PORT_W * pp[0], c[1] + PORT_W * pp[1]]);
      return [h[0] * TRUE_GAIN, h[1] * TRUE_GAIN];
    });
    const mk = (name: string, samples: Float64Array): Impulse => ({ name, sampleRate: FS, samples, timeBase: 'session', alreadyGated: false, session: 'synth' });
    return { near: mk('near', near), far: mk('far', far), portNear: mk('port', portNear) };
  };

  it('premise: the two images arrive at different delays, both inside the gate', () => {
    const c = planeEchoDelayS(ECHO) * 1000;
    const p = planeEchoDelayS(PORT_ECHO) * 1000;
    expect(c).toBeLessThan(2.5);
    expect(p).toBeLessThan(2.5);
    expect(c - p).toBeGreaterThan(0.4);
  });

  it('each source with its own reflection: delay and gain recovered, residual < 0.5°, no flags', () => {
    const { near, far, portNear } = build();
    const r = mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W, echoes: [PORT_ECHO] } }));
    expect(r.fit.residualRmsDeg).toBeLessThan(0.5);
    expect(Math.abs(r.fit.delayMs - TRUE_TAU * 1000)).toBeLessThan(0.002);
    expect(Math.abs(r.fit.gainDb - 20 * Math.log10(TRUE_GAIN))).toBeLessThan(0.05);
    expect(r.flags).toEqual([]);
  });

  it("the port given the cone's reflection (the pre-I-4 behaviour) is visibly worse", () => {
    const { near, far, portNear } = build();
    const right = mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W, echoes: [PORT_ECHO] } }));
    const inherited = mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W, echoes: [ECHO] } }));
    expect(inherited.fit.residualRmsDeg).toBeGreaterThan(right.fit.residualRmsDeg + 1);
  });

  it('the cone states a plane, the port states nothing: refused by field, never inherited', () => {
    const { near, far, portNear } = build();
    expect(() => mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W } }))).toThrowError(MergeV2Error);
    try {
      mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W } }));
    } catch (e) {
      expect((e as MergeV2Error).field).toBe('port.echoes');
    }
    // no plane on the cone: an absent port list is "none", as before I-4
    expect(() => mergeImpulsesV2(input({ near, far, echoes: [], port: { impulse: portNear, weight: PORT_W } }))).not.toThrow();
  });

  it('a source ON a plane (boundary) is accepted, changes nothing, and is never an unmodelled echo', () => {
    const { near, far, portNear } = build();
    const table: BoundaryTerm = { kind: 'boundary', label: 'tafelblad', sourceAboveM: 0.015 };
    const base = { near, far, echoes: [ECHO] as PlaneEcho[] };
    const without = mergeImpulsesV2(input({ ...base, port: { impulse: portNear, weight: PORT_W, echoes: [PORT_ECHO] } }));
    const withB = mergeImpulsesV2(input({ ...base, port: { impulse: portNear, weight: PORT_W, echoes: [PORT_ECHO, table] } }));
    expect(withB.fit.residualRmsDeg).toBe(without.fit.residualRmsDeg);
    expect(withB.fit.delayMs).toBe(without.fit.delayMs);
    expect(withB.flags).toEqual([]);
    expect(withB.notes.some((n) => /boundary "tafelblad" 1\.5 cm .*not an echo/.test(n))).toBe(true);
    // on it (0 m) is allowed too
    expect(() => mergeImpulsesV2(input({ ...base, port: { impulse: portNear, weight: PORT_W, echoes: [PORT_ECHO, { ...table, sourceAboveM: 0 }] } }))).not.toThrow();
  });

  it('a "boundary" far enough away to be heard is refused: state it as a plane', () => {
    const { near, far, portNear } = build();
    const far20: BoundaryTerm = { kind: 'boundary', label: 'tafelblad', sourceAboveM: 0.2 };
    try {
      mergeImpulsesV2(input({ near, far, echoes: [ECHO], port: { impulse: portNear, weight: PORT_W, echoes: [far20] } }));
      throw new Error('not refused');
    } catch (e) {
      expect(e).toBeInstanceOf(MergeV2Error);
      expect((e as MergeV2Error).field).toBe('port.echoes.tafelblad');
      expect((e as Error).message).toMatch(/State it as a plane/);
    }
  });
});
