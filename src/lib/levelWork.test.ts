/**
 * V51 — THE LEVEL-WORK INVENTORY OF ONE WAY, on the definition every reader
 * shares (`levelWork.ts`).
 *
 *  · ON THE REAL THING. HUIDIG — the designer's own reference filter — pads its
 *    woofer with R8 in the series path (the resistor V50 measured at 25.5 W),
 *    so the inventory on `woofer` names it and is not `none`; the same file's
 *    tweeter path carries a pad too. A DATED corpus netlist is read beside it,
 *    because a test that pins a part id on the LIVE corpus goes red on the
 *    next regeneration without a line of this code changing (the UI-2 lesson).
 *  · THE DISTINCTIONS THAT MAKE IT A DEFINITION. On a paper network: a
 *    resistor alone from the way's bus to ground is a shunt PAD; a resistor at
 *    the head of an R–C chain to ground (a Zobel) is NOT; a resistor in the
 *    series path is level work whether or not a capacitor bypasses it; a
 *    resistor in ANOTHER way's path does not count for this one.
 *  · UNREACHABLE IS NOT NONE. A driver with no path from the generator yields
 *    an empty inventory with `reachable: false`, and `none` is false there.
 *  · V51b — COIL DCR IS COUNTED, SEPARATELY, AND THE CAPPED RULE READS THE
 *    TOTAL. A 0.5 Ω resistor behind a coil with 0.6 Ω of DCR is 1.1 Ω of
 *    series resistance in front of the driver, and a maximum of 1.0 Ω is
 *    exceeded — although the discrete part alone would pass. Under `'none'`
 *    the same DCR remains and is not level work.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFilter } from './filterFile.ts';
import { CASUS1_DIR, loadGolden } from './engine2/casus1.fixture.ts';
import {
  LEVEL_WORK_VERSION,
  describeLevelWork,
  describeSeriesResistance,
  forbidsPads,
  levelWorkOnWay,
  levelWorkVerdict,
  seriesRMaxOhmOf,
} from './levelWork.ts';
import type { VxpPart } from './parsers/vxp.ts';

const golden = loadGolden();
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
const partsOf = (key: string): VxpPart[] =>
  deserializeFilter(readFileSync(join(CASUS1_DIR, netlists[key]), 'utf-8')).parts;

/** A paper part: one primitive between two grid points. */
let n = 0;
const part = (type: 'Resistor' | 'Capacitor' | 'Inductor', value: number, a: [number, number], b: [number, number]): VxpPart => {
  const name = type === 'Resistor' ? 'R' : type === 'Capacitor' ? 'C' : 'L';
  n++;
  return {
    type,
    partId: `${name}${n}`,
    params: [{ name, value }],
    wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }],
  } as unknown as VxpPart;
};
const source = (a: [number, number], b: [number, number]): VxpPart =>
  ({ type: 'Generator', partId: 'G1', params: [{ name: 'Rg', value: 0.01 }], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }) as unknown as VxpPart;
const ground = (a: [number, number]): VxpPart =>
  ({ type: 'Ground', partId: 'GND', params: [], wires: [{ x: a[0], y: a[1] }] }) as unknown as VxpPart;
const driver = (model: string, a: [number, number], b: [number, number]): VxpPart =>
  ({ type: 'Driver', partId: `D-${model}`, model, params: [], wires: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }) as unknown as VxpPart;

describe('V51 — level work on one way', () => {
  it('HUIDIG pads its woofer in the series path, and the inventory names the resistor', () => {
    const w = levelWorkOnWay(partsOf('HUIDIG'), 'woofer');
    expect(w.reachable).toBe(true);
    expect(w.none).toBe(false);
    expect(w.seriesResistors.map((r) => r.id)).toContain('R8');
    expect(w.seriesOhm).toBeGreaterThan(3);
    expect(describeLevelWork(w)).toMatch(/level work on woofer: series/);
    /* A dated corpus netlist beside it: V49's first candidate carries a pad on
     * its lowest way as well (the V50 finding: 13.6–34.9 W in one resistor). */
    const dated = levelWorkOnWay(partsOf('V49_KAND_1'), 'woofer');
    expect(dated.reachable).toBe(true);
    expect(dated.none).toBe(false);
    expect(dated.seriesResistors.length + dated.shuntPads.length).toBeGreaterThan(0);
  });

  it('a shunt pad counts, a Zobel head does not, a bypassed series R does, another way\'s R does not', () => {
    /* Paper network on a grid. Generator hot at (0,0), ground rail y = 10.
     *   woofer path: (0,0) —L1— (10,0) —R2‖C3— (20,0) —D-woofer— (20,10) gnd
     *                (10,0) —R4— (10,10) gnd                      ← shunt PAD
     *                (20,0) —R5— (20,5) —C6— (20,10) gnd          ← Zobel (not counted)
     *   tweeter path: (0,0) —C7— (30,0) —R8— (40,0) —D-tweeter— (40,10) gnd */
    n = 0;
    const parts: VxpPart[] = [
      source([0, 0], [0, 10]),
      ground([0, 10]),
      part('Inductor', 1e-3, [0, 0], [10, 0]),
      part('Resistor', 2, [10, 0], [20, 0]),
      part('Capacitor', 10e-6, [10, 0], [20, 0]),
      part('Resistor', 8, [10, 0], [10, 10]),
      part('Resistor', 6, [20, 0], [20, 5]),
      part('Capacitor', 5e-6, [20, 5], [20, 10]),
      driver('woofer', [20, 0], [20, 10]),
      part('Capacitor', 4e-6, [0, 0], [30, 0]),
      part('Resistor', 3, [30, 0], [40, 0]),
      driver('tweeter', [40, 0], [40, 10]),
      // the ground rail — a Wire unions ITS OWN points, so every grounded
      // terminal has to be listed on it.
      ({ type: 'Wire', partId: 'W1', params: [], wires: [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 40, y: 10 }] }) as unknown as VxpPart,
    ];
    const w = levelWorkOnWay(parts, 'woofer');
    expect(w.reachable).toBe(true);
    expect(w.seriesResistors.map((r) => r.id)).toEqual(['R2']);
    expect(w.shuntPads.map((r) => r.id)).toEqual(['R4']);
    expect(w.none).toBe(false);
    expect(w.seriesOhm).toBe(2);
    const t = levelWorkOnWay(parts, 'tweeter');
    expect(t.seriesResistors.map((r) => r.id)).toEqual(['R8']);
    expect(t.shuntPads).toEqual([]);
    // ...and with R2 shorted and R4 open the woofer carries none.
    const clean = parts.map((p) =>
      p.partId === 'R2' ? { ...p, shorted: true } : p.partId === 'R4' ? { ...p, open: true } : p,
    );
    const c = levelWorkOnWay(clean, 'woofer');
    expect(c.none).toBe(true);
    expect(c.seriesResistors).toEqual([]);
    expect(c.shuntPads).toEqual([]);
    expect(describeLevelWork(c)).toMatch(/no level work on woofer/);
  });

  it('V51b — coil DCR is counted separately and the verdict reads the TOTAL against a stated maximum', () => {
    /* Paper network: (0,0) —L1 (DCR 0.6)— (10,0) —R2 0.5— (20,0) —D-woofer— (20,10) gnd.
     * Discrete 0.5 Ω, DCR 0.6 Ω, total 1.1 Ω: under a maximum of 1.0 Ω the total
     * is over by 0.1 although the discrete part alone would pass — which is
     * exactly why the rule is stated on the total. */
    n = 0;
    const coil = part('Inductor', 1e-3, [0, 0], [10, 0]);
    (coil as unknown as { params: { name: string; value: number }[] }).params.push({ name: 'DCR', value: 0.6 });
    const parts: VxpPart[] = [
      source([0, 0], [0, 10]),
      ground([0, 10]),
      coil,
      part('Resistor', 0.5, [10, 0], [20, 0]),
      driver('woofer', [20, 0], [20, 10]),
      ({ type: 'Wire', partId: 'W1', params: [], wires: [{ x: 0, y: 10 }, { x: 20, y: 10 }] }) as unknown as VxpPart,
    ];
    const w = levelWorkOnWay(parts, 'woofer');
    expect(w.seriesResistors.map((r) => r.id)).toEqual(['R2']);
    expect(w.seriesCoils).toEqual([{ id: 'L1', dcrOhm: 0.6 }]);
    expect(w.seriesOhm).toBeCloseTo(0.5, 9);
    expect(w.dcrOhm).toBeCloseTo(0.6, 9);
    expect(w.totalSeriesOhm).toBeCloseTo(1.1, 9);
    expect(w.none).toBe(false);
    // The verdict, under each rule.
    const over = levelWorkVerdict(w, { kind: 'series-r-max', maxOhm: 1.0 });
    expect(over.ok).toBe(false);
    expect(over.overOhm).toBeCloseTo(0.1, 9);
    expect(over.why).toMatch(/1\.100 Ω/);
    expect(over.why).toMatch(/coil DCR/);
    const ok = levelWorkVerdict(w, { kind: 'series-r-max', maxOhm: 1.2 });
    expect(ok.ok).toBe(true);
    expect(ok.overOhm).toBe(0);
    expect(levelWorkVerdict(w, 'none').ok).toBe(false);
    expect(levelWorkVerdict(w, 'allowed').ok).toBe(true);
    expect(levelWorkVerdict(w, null).ok).toBeNull();
    // A shunt pad fails the capped rule whatever the total.
    const padded = levelWorkOnWay([...parts, part('Resistor', 8, [10, 0], [20, 10])], 'woofer');
    const pad = levelWorkVerdict(padded, { kind: 'series-r-max', maxOhm: 5 });
    expect(pad.ok).toBe(false);
    expect(pad.why).toMatch(/shunt pad/);
    // Under 'none' the DCR REMAINS and is not level work: the same coil alone is none.
    const bareCoil = part('Inductor', 1e-3, [0, 0], [20, 0]);
    (bareCoil as unknown as { params: { name: string; value: number }[] }).params.push({ name: 'DCR', value: 0.6 });
    const bare = levelWorkOnWay([...parts.filter((p) => p.partId !== 'R2' && p.partId !== 'L1'), bareCoil], 'woofer');
    expect(bare.none).toBe(true);
    expect(bare.dcrOhm).toBeCloseTo(0.6, 9);
    expect(levelWorkVerdict(bare, 'none').ok).toBe(true);
    // The rule helpers, from the one home.
    expect(seriesRMaxOhmOf({ kind: 'series-r-max', maxOhm: 1 })).toBe(1);
    expect(seriesRMaxOhmOf('none')).toBeNull();
    expect(forbidsPads('none')).toBe(true);
    expect(forbidsPads({ kind: 'series-r-max', maxOhm: 1 })).toBe(true);
    expect(forbidsPads('allowed')).toBe(false);
    expect(forbidsPads(undefined)).toBe(false);
    expect(describeSeriesResistance(w)).toBe('R2 0.50 + DCR 0.60 = 1.10 Ω');
    expect(LEVEL_WORK_VERSION).toBe('level-work/1.1');
  });

  it('an unreachable driver is not "none" — nothing could be walked', () => {
    n = 0;
    const parts: VxpPart[] = [
      source([0, 0], [0, 10]),
      ground([0, 10]),
      part('Inductor', 1e-3, [0, 0], [10, 0]),
      driver('woofer', [10, 0], [10, 10]),
      ({ type: 'Wire', partId: 'W1', params: [], wires: [{ x: 0, y: 10 }, { x: 10, y: 10 }] }) as unknown as VxpPart,
    ];
    const w = levelWorkOnWay(parts, 'no-such-driver');
    expect(w.reachable).toBe(false);
    expect(w.none).toBe(false);
    expect(describeLevelWork(w)).toMatch(/not reachable/);
  });
});
