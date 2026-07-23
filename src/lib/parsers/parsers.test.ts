import { describe, it, expect } from 'vitest';
import { parseFrd, FrdParseError } from './frd.ts';
import { parseZma, ZmaParseError } from './zma.ts';
import { parseRewMetadata } from './rewMeta.ts';

const FRD_SAMPLE = `* Measurement data measured by REW V5.20.14
* Source: USB Audio Device
* Freq(Hz) SPL(dB) Phase(degrees)
20.000\t75.12\t-12.34
100.000\t82.50\t-45.00
1000.000\t85.00\t-120.00
`;

describe('parseFrd', () => {
  it('parses freq/SPL/phase and REW version', () => {
    const m = parseFrd(FRD_SAMPLE);
    expect(m.freq).toEqual([20, 100, 1000]);
    expect(m.spl).toEqual([75.12, 82.5, 85]);
    expect(m.phase).toEqual([-12.34, -45, -120]);
    expect(m.hasPhase).toBe(true);
    expect(m.meta.rewVersion).toBe('5.20.14');
  });

  it('flags a two-column (phase-less) file instead of faking phase', () => {
    const m = parseFrd('20 75\n100 82\n1000 85\n');
    expect(m.hasPhase).toBe(false);
    expect(m.phase).toEqual([0, 0, 0]);
  });

  it('handles decimal-comma locale exports', () => {
    const m = parseFrd('20,0 75,1 -12,3\n100,0 82,5 -45,0\n');
    expect(m.freq).toEqual([20, 100]);
    expect(m.spl).toEqual([75.1, 82.5]);
    expect(m.phase).toEqual([-12.3, -45]);
  });

  it('rejects non-ascending frequencies', () => {
    expect(() => parseFrd('20 75\n20 76\n')).toThrow(FrdParseError);
  });
});

const ZMA_SAMPLE = `* Impedance data measured by REW V5.20
* Freq(Hz) Z(ohms) Phase(degrees)
20.000 6.20 5.0
100.000 8.50 25.0
1000.000 12.00 -10.0
`;

describe('parseZma', () => {
  it('parses freq/magnitude/phase', () => {
    const z = parseZma(ZMA_SAMPLE);
    expect(z.freq).toEqual([20, 100, 1000]);
    expect(z.magnitude).toEqual([6.2, 8.5, 12]);
    expect(z.phase).toEqual([5, 25, -10]);
  });

  it('rejects a file missing the phase column', () => {
    expect(() => parseZma('20 6.2\n100 8.5\n')).toThrow(ZmaParseError);
  });
});

describe('parseRewMetadata', () => {
  it('extracts a timing offset stated in ms', () => {
    const meta = parseRewMetadata(['Timing reference offset 0.350 ms', 'measured by REW V5.20']);
    expect(meta.timingOffsetMs).toBeCloseTo(0.35, 6);
    expect(meta.timingOffsetSource).toMatch(/0.350 ms/);
  });

  it('converts a seconds-stated offset to ms', () => {
    const meta = parseRewMetadata(['t=0 offset -0.0005 s']);
    expect(meta.timingOffsetMs).toBeCloseTo(-0.5, 6);
  });

  it('does not guess when only a sample-count is given', () => {
    const meta = parseRewMetadata(['delay 24 samples']);
    expect(meta.timingOffsetMs).toBeUndefined();
  });

  it('leaves offset undefined when nothing matches', () => {
    const meta = parseRewMetadata(['Source: USB Audio', 'Frequency Step is 1 Hz']);
    expect(meta.timingOffsetMs).toBeUndefined();
  });
});
