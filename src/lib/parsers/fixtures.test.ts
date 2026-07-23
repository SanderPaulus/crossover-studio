/**
 * Tests against real-world measurement exports, one fixture per source tool.
 * When a new tool/variant shows up in the wild: drop its file in `fixtures/`
 * and add a describe-block here — the parser itself should rarely need changes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseZma } from './zma.ts';
import { parseFrd } from './frd.ts';
import { parseVxp } from './vxp.ts';
import { estimateBulkDelay } from '../timing.ts';
import { logspace, resample } from '../dsp.ts';
import { fromPolar } from '../complex.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import { solveNetwork } from '../network.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const load = (name: string) => readFileSync(join(FIXTURES, name), 'utf-8');

describe('VituixCAD ZMA exports (headerless, CRLF, space-separated)', () => {
  it('parses the mid impedance and finds its resonance peak', () => {
    const z = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));

    expect(z.freq.length).toBe(241);
    expect(z.freq[0]).toBeCloseTo(19.958, 3);
    expect(z.freq.at(-1)).toBeCloseTo(20281.311, 3);
    expect(z.meta.rawComments).toEqual([]); // headerless — nothing misread as data

    // Physical sanity: impedance peak (driver resonance) near 88.8 Hz, ~41.7 Ω,
    // and phase crossing zero close to the peak, as it must at resonance.
    const iPeak = z.magnitude.indexOf(Math.max(...z.magnitude));
    expect(z.freq[iPeak]).toBeCloseTo(88.806, 2);
    expect(z.magnitude[iPeak]).toBeCloseTo(41.736, 3);
    expect(Math.abs(z.phase[iPeak])).toBeLessThan(15);
  });

  it('parses the tweeter impedance and finds its resonance peak', () => {
    const z = parseZma(load('tweeter.ZMA'));

    expect(z.freq.length).toBe(161);
    expect(z.freq[0]).toBeCloseTo(199.951, 3);
    expect(z.freq.at(-1)).toBeCloseTo(20317.199, 3);

    const iPeak = z.magnitude.indexOf(Math.max(...z.magnitude));
    expect(z.freq[iPeak]).toBeCloseTo(897.949, 2);
    expect(z.magnitude[iPeak]).toBeCloseTo(16.55, 3);
    expect(Math.abs(z.phase[iPeak])).toBeLessThan(15);
  });
});

describe('measurement .txt exports (bare column header, no comment marker)', () => {
  const ANGLES = [0, 15, 30, 45, 60, 75];

  it('parses every mid/tweeter angle file without losing rows', () => {
    for (const drv of ['mid', 'tweet']) {
      for (const a of ANGLES) {
        const m = parseFrd(load(`${drv}_hor${a}_mettape.txt`));
        expect(m.freq.length).toBe(585);
        expect(m.hasPhase).toBe(true);
        expect(m.freq[0]).toBeCloseTo(5, 6);
        expect(m.freq.at(-1)).toBeCloseTo(22988, 0);
        // The header line must land in comments, not silently vanish or
        // corrupt the data.
        expect(m.meta.rawComments).toEqual(['Freq[Hz]     dBSPL  Phase[Deg]']);
      }
    }
  });

  it('finds a consistent, delay-like bulk delay in the on-axis phase', () => {
    const mid = parseFrd(load('mid_hor0_mettape.txt'));
    const tweet = parseFrd(load('tweet_hor0_mettape.txt'));

    // Values pinned from the fixed fixtures (band 1–5 kHz, the crossover
    // region): mid 1.701 ms, tweeter 1.735 ms — both near-perfect delay fits.
    const midEst = estimateBulkDelay(mid.freq, mid.phase, [1000, 5000]);
    const twtEst = estimateBulkDelay(tweet.freq, tweet.phase, [1000, 5000]);

    expect(midEst.rSquared).toBeGreaterThan(0.999);
    expect(twtEst.rSquared).toBeGreaterThan(0.999);
    expect(midEst.delayMs).toBeCloseTo(1.701, 2);
    expect(twtEst.delayMs).toBeCloseTo(1.735, 2);

    // The inter-driver acoustic-centre offset that all integration graphs
    // will hinge on: ~34 µs (≈ 12 mm).
    const deltaUs = (twtEst.delaySeconds - midEst.delaySeconds) * 1e6;
    expect(deltaUs).toBeGreaterThan(20);
    expect(deltaUs).toBeLessThan(50);
  });
});

describe('VituixCAD .vxp project', () => {
  const project = parseVxp(load('KOAN 2951 Prototype 140826.vxp'));

  it('extracts both drivers with their angle→file mapping', () => {
    expect(project.drivers.map((d) => d.model)).toEqual(['tweeter', 'mid']);

    for (const d of project.drivers) {
      expect(d.responses).toHaveLength(6);
      expect(d.responses.map((r) => r.hor)).toEqual([0, 15, 30, 45, 60, 75]);
      expect(d.responses.every((r) => r.ver === 0)).toBe(true);
      // VituixCAD is set to discard the measured phase — our tool should
      // surface this instead of inheriting it.
      expect(d.minimumPhase).toBe(true);
    }

    expect(project.drivers[0].impedanceFileName).toBe('tweeter.ZMA');
    expect(project.drivers[1].impedanceFileName).toBe('mid_Backwavecone_sheep75gram.ZMA');
    expect(project.drivers[1].responses[0].fileName).toBe('mid_hor0_mettape.txt');

    // Per-driver acoustic settings needed to reproduce VituixCAD 1:1: the Z
    // depth coordinate, response delay and relative polarity.
    expect(project.drivers[0].z).toBe(6); // tweeter
    expect(project.drivers[1].z).toBe(4); // mid
    expect(project.drivers.every((d) => d.responseDelay === 0)).toBe(true);
    expect(project.drivers.every((d) => d.inverted === false)).toBe(true);
  });

  it('extracts all crossover variants with component values', () => {
    expect(project.crossovers.map((c) => c.name)).toEqual([
      'CROSSOVER',
      'CROSSOVER1',
      'CROSSOVER2',
      'CROSSOVER3',
      'CROSSOVER7',
    ]);

    const byId = (name: string, id: string) => {
      const xo = project.crossovers.find((c) => c.name === name)!;
      return xo.parts.find((p) => p.partId === id)!;
    };
    const param = (name: string, id: string, pname: string) =>
      byId(name, id).params.find((p) => p.name === pname)!;

    // Variant 1
    expect(param('CROSSOVER', 'L1', 'L').value).toBeCloseTo(0.704, 6);
    expect(param('CROSSOVER', 'L1', 'L').unit).toBe('mH');
    expect(param('CROSSOVER', 'C2', 'C').value).toBeCloseTo(6.46, 6);
    expect(param('CROSSOVER', 'C3', 'C').value).toBeCloseTo(110, 6);
    expect(byId('CROSSOVER', 'R1').shorted).toBe(true); // shorted part must not enter the network as a resistor
    expect(byId('CROSSOVER', 'D2').inverted).toBe(true); // mid wired inverted

    // Variant 2 differs — proves we don't mix the two up
    expect(param('CROSSOVER1', 'L1', 'L').value).toBeCloseTo(2, 6);
    expect(param('CROSSOVER1', 'C1', 'C').value).toBeCloseTo(5.1, 6);
    expect(param('CROSSOVER1', 'R1', 'R').value).toBeCloseTo(3, 6);
    expect(byId('CROSSOVER1', 'R1').shorted).toBe(false);
  });

  it('links crossover Driver parts back to driver models', () => {
    const xo = project.crossovers[0];
    const driverParts = xo.parts.filter((p) => p.type === 'Driver');
    expect(driverParts.map((p) => p.model).sort()).toEqual(['mid', 'tweeter']);
  });
});

describe('KOAN crossover → netlist → solve on measured impedances', () => {
  const project = parseVxp(load('KOAN 2951 Prototype 140826.vxp'));
  const midZ = parseZma(load('mid_Backwavecone_sheep75gram.ZMA'));
  const twtZ = parseZma(load('tweeter.ZMA'));

  const grid = logspace(210, 19000, 200);
  const toComplexZ = (z: typeof midZ) => {
    const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
    return g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180));
  };

  it('reconstructs CROSSOVER1 into a connected, solvable netlist', () => {
    const xo = project.crossovers.find((c) => c.name === 'CROSSOVER1')!;
    const { netlist, warnings } = crossoverToNetlist(xo);

    const kinds = netlist.elements.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(kinds['source']).toBe(1);
    expect(kinds['driver']).toBe(2);
    // CROSSOVER1: C1,C2,C3,C4 + L1..L4 + R1,R2,R3 all active (R1 not shorted).
    expect(kinds['C']).toBe(4);
    expect(kinds['L']).toBe(4);
    expect(kinds['R']).toBe(3);
    expect(warnings).toEqual([]);

    const models = netlist.elements
      .filter((e) => e.kind === 'driver')
      .map((e) => (e as { model: string }).model)
      .sort();
    expect(models).toEqual(['mid', 'tweeter']);
  });

  it('solves it: tweeter is high-passed, mid is low-passed, mid is inverted', () => {
    const xo = project.crossovers.find((c) => c.name === 'CROSSOVER1')!;
    const { netlist } = crossoverToNetlist(xo);
    const r = solveNetwork(netlist, grid, { mid: toComplexZ(midZ), tweeter: toComplexZ(twtZ) });

    const byModel = (m: string) => r.drivers.find((d) => d.model === m)!;
    const H = (m: string) => r.transfers[byModel(m).id];
    const db = (c: { re: number; im: number }) => 20 * Math.log10(Math.hypot(c.re, c.im));
    const at = (f: number) => grid.findIndex((g) => g >= f);

    // Tweeter: deep attenuation low, alive high. Passband sits at ≈ −10 dB —
    // the L-pad (R1/R2) knocking the hotter tweeter down to the mid's level.
    expect(db(H('tweeter')[at(300)])).toBeLessThan(-20);
    expect(db(H('tweeter')[at(8000)])).toBeGreaterThan(-13);
    // Mid: alive low, attenuated high.
    expect(db(H('mid')[at(500)])).toBeGreaterThan(-6);
    expect(db(H('mid')[at(10000)])).toBeLessThan(-15);
    // Mid drawn inverted in the schematic.
    expect(byModel('mid').inverted).toBe(true);
    // And the crossover region hands over: the two transfers cross between
    // 1 and 6 kHz.
    const diffLo = db(H('mid')[at(1000)]) - db(H('tweeter')[at(1000)]);
    const diffHi = db(H('mid')[at(6000)]) - db(H('tweeter')[at(6000)]);
    expect(diffLo).toBeGreaterThan(0);
    expect(diffHi).toBeLessThan(0);
  });
});
