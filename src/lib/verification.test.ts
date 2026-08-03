import { describe, expect, it } from 'vitest';
import { compareMeasurement } from './verification.ts';
import { logspace } from './dsp.ts';

/** A smooth, wiggly "system response" to compare against. */
function makeSim(n = 300): { freq: number[]; spl: number[]; phase: number[] } {
  const freq = logspace(20, 20000, n);
  const spl = freq.map((f) => 90 + 3 * Math.sin(Math.log10(f) * 4));
  // A gentle minimum-phase-ish curve plus nothing exotic.
  const phase = freq.map((f) => 40 * Math.cos(Math.log10(f) * 3));
  return { freq, spl, phase };
}

const wrap = (d: number) => (((d + 180) % 360) + 360) % 360 - 180;

describe('compareMeasurement', () => {
  it('recovers a pure level offset and mic delay from a perfect model', () => {
    const sim = makeSim();
    // "Measurement": same response, 12.3 dB quieter, mic 250 µs further,
    // constant +30° instrumentation offset.
    const meas = {
      freq: sim.freq,
      spl: sim.spl.map((v) => v - 12.3),
      phase: sim.freq.map((f, i) => wrap(sim.phase[i] - 360 * f * 250e-6 + 30)),
      hasPhase: true,
    };
    const c = compareMeasurement(sim.freq, sim.spl, sim.phase, meas)!;
    expect(c.offsetDb).toBeCloseTo(12.3, 3);
    expect(c.avgAbsDb).toBeLessThan(0.01);
    expect(c.maxAbsDb).toBeLessThan(0.01);
    expect(c.phase!.fittedDelayUs).toBeCloseTo(250, 0);
    expect(c.phase!.fittedOffsetDeg).toBeCloseTo(30, 0);
    expect(c.phase!.looksInverted).toBe(false);
    expect(c.phase!.avgAbsDeg).toBeLessThan(0.5);
  });

  it('a planted model error shows up at the right place and size', () => {
    const sim = makeSim();
    // The build deviates: a +4 dB bump around 2.5 kHz the sim does not have.
    const meas = {
      freq: sim.freq,
      spl: sim.freq.map(
        (f, i) => sim.spl[i] - 5 + 4 * Math.exp(-((Math.log(f / 2500) / 0.18) ** 2)),
      ),
      phase: sim.phase,
      hasPhase: true,
    };
    const c = compareMeasurement(sim.freq, sim.spl, sim.phase, meas)!;
    // Sim is BELOW the aligned measurement at the bump: delta negative there.
    expect(c.maxAbsDb).toBeGreaterThan(3.4);
    expect(c.maxAbsDb).toBeLessThan(4.4);
    expect(c.maxAt.freqHz).toBeGreaterThan(2000);
    expect(c.maxAt.freqHz).toBeLessThan(3200);
    expect(c.maxAt.deltaDb).toBeLessThan(0);
  });

  it('flags an inverted connection instead of silently absorbing it', () => {
    const sim = makeSim();
    const meas = {
      freq: sim.freq,
      spl: sim.spl.map((v) => v - 3),
      phase: sim.freq.map((f, i) => wrap(sim.phase[i] + 180 - 360 * f * 100e-6)),
      hasPhase: true,
    };
    const c = compareMeasurement(sim.freq, sim.spl, sim.phase, meas)!;
    expect(c.phase!.looksInverted).toBe(true);
    expect(Math.abs(c.phase!.fittedOffsetDeg)).toBeGreaterThan(135);
    // The magnitude verdict is untouched by polarity.
    expect(c.avgAbsDb).toBeLessThan(0.01);
  });

  it('compares only the overlap band and reports it', () => {
    const sim = makeSim();
    // Gated measurement: 300 Hz – 8 kHz only.
    const keep = sim.freq.map((f, i) => [f, sim.spl[i], sim.phase[i]] as const).filter(([f]) => f >= 300 && f <= 8000);
    const meas = {
      freq: keep.map((k) => k[0]),
      spl: keep.map((k) => k[1] - 7),
      phase: keep.map((k) => k[2]),
      hasPhase: true,
    };
    const c = compareMeasurement(sim.freq, sim.spl, sim.phase, meas, [100, 20000])!;
    expect(c.band[0]).toBeGreaterThanOrEqual(300);
    expect(c.band[1]).toBeLessThanOrEqual(8000);
    // Outside the band the delta stays NaN so a chart simply draws nothing.
    expect(Number.isNaN(c.deltaDb[0])).toBe(true);
    expect(Number.isNaN(c.deltaDb[sim.freq.length - 1])).toBe(true);
  });

  it('handles a phase-less measurement: magnitude verdict only', () => {
    const sim = makeSim();
    const meas = { freq: sim.freq, spl: sim.spl.map((v) => v - 2), phase: sim.freq.map(() => 0), hasPhase: false };
    const c = compareMeasurement(sim.freq, sim.spl, sim.phase, meas)!;
    expect(c.phase).toBeNull();
    expect(c.avgAbsDb).toBeLessThan(0.01);
  });
});
